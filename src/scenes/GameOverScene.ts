import Phaser from 'phaser';
import { GAME } from '../types/game';
import HiScoreSystem from '../systems/HiScoreSystem';
import { playSceneMusic, type SceneMusic } from '../systems/MusicManager';

// C++ HISCORE_MAX_NAME_LENGTH = 13 (wizball/processed_scripts_test.txt:9941).
const MAX_NAME_LENGTH = 13;

export default class GameOverScene extends Phaser.Scene {
  private score: number = 0;
  private level: number = 1;
  private hiScoreSystem!: HiScoreSystem;
  private gameOverText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private restartText?: Phaser.GameObjects.Text;
  private blinkTimer: number = 0;
  private showRestart: boolean = true;
  private isNewHighScore: boolean = false;
  private nameInput: string = '';
  private nameText?: Phaser.GameObjects.Text;
  private enteringName: boolean = false;
  private currentMusic: SceneMusic | null = null;
  private firePrev = false;

  constructor() {
    super({ key: 'GameOver' });
  }

  init(data: { score?: number; level?: number } = {}): void {
    this.score = data.score || 0;
    this.level = data.level || 1;
    // Per-visit state: Phaser reuses this scene instance for every
    // scene.start(), so anything set as a field initialiser survives a restart.
    // nameText/restartText in particular were left pointing at Text objects the
    // previous shutdown had already destroyed, and update() kept poking them.
    this.nameInput = '';
    this.enteringName = false;
    this.isNewHighScore = false;
    this.blinkTimer = 0;
    this.showRestart = true;
    this.firePrev = false;
    this.currentMusic = null;
    this.nameText = undefined;
    this.restartText = undefined;
  }

  create(): void {
    this.hiScoreSystem = new HiScoreSystem();
    this.isNewHighScore = this.hiScoreSystem.isHighScore(this.score);

    this.add.rectangle(320, 184, 640, 368, 0x2a0a0a).setDepth(-1);

    this.gameOverText = this.add.text(320, 80, 'GAME OVER', {
      fontSize: '48px',
      color: '#ff4444',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 4
    });
    this.gameOverText.setOrigin(0.5);

    this.scoreText = this.add.text(320, 140, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 12, y: 8 }
    });
    this.scoreText.setOrigin(0.5);
    this.updateScoreText();

    if (this.isNewHighScore && this.score > 0) {
      this.showNameEntry();
    } else {
      this.showRestartPrompt();
    }

    // Remove any lingering capture on SPACE from other scenes, then re-add
    this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, true);
    spaceKey.on('down', this.handleInput, this);

    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (this.enteringName) {
        this.handleNameInput(event);
      }
    });

    // Touch only: tap to confirm — auto-fills the name if needed. This used to
    // fire for the mouse as well, so one idle desktop click during name entry
    // filed the run under "YOU" with no way back.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) this.touchConfirm();
    });

    if (this.cache.audio.exists('wizball_explode')) {
      this.sound.play('wizball_explode', { volume: 0.7 });
    }

    this.currentMusic = playSceneMusic(this, 'wizball_game_over', { loop: false });
  }

  private showNameEntry(): void {
    this.enteringName = true;

    // Switch to hi-score music during name entry
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic = null;
    }
    this.currentMusic = playSceneMusic(this, 'wizball_hi_score');

    this.add.text(320, 200, 'NEW HIGH SCORE!', {
      fontSize: '20px',
      color: '#ffff44',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(320, 236, `TYPE YOUR NAME (UP TO ${MAX_NAME_LENGTH}), THEN ENTER`, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.add.text(320, 256, 'ESC TO SKIP', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.nameText = this.add.text(320, 290, '_', {
      fontSize: '32px',
      color: '#88ff88',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    });
    this.nameText.setOrigin(0.5);

    this.tweens.add({
      targets: this.nameText,
      alpha: { from: 1, to: 0.5 },
      yoyo: true,
      repeat: -1,
      duration: 500
    });
  }

  // Trailing '_' is the cursor. The old placeholder was padEnd(3, '_'), left
  // over from the 3-character limit — it implied a fixed 3-slot field.
  private renderName(): string {
    return this.nameInput.length >= MAX_NAME_LENGTH ? this.nameInput : this.nameInput + '_';
  }

  private handleNameInput(event: KeyboardEvent): void {
    // Space is deliberately NOT an accepted name character. Phaser dispatches
    // Key.onDown before this generic keydown handler, so with an empty name the
    // first SPACE no-opped in handleInput() and then landed here as a literal
    // space; the second SPACE saw length >= 1 and filed the score under " ".
    // Players mash SPACE all game, so that was the common case, not the edge one.
    if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key) && this.nameInput.length < MAX_NAME_LENGTH) {
      this.nameInput += event.key.toUpperCase();
      this.nameText?.setText(this.renderName());
    } else if (event.key === 'Backspace' && this.nameInput.length > 0) {
      this.nameInput = this.nameInput.slice(0, -1);
      this.nameText?.setText(this.renderName());
    } else if (event.key === 'Enter' && this.nameInput.length >= 1) {
      this.submitScore();
    } else if (event.key === 'Escape') {
      // Escape hatch: SPACE/ENTER both need a name, so without this a player who
      // does not want to type one has no way off this screen.
      this.cancelNameEntry();
    }
  }

  private submitScore(): void {
    this.enteringName = false;
    this.hiScoreSystem.addScore(this.nameInput, this.score, this.level);
    this.showRestartPrompt();

    if (this.nameText) {
      this.tweens.killTweensOf(this.nameText);
      this.nameText.destroy();
      this.nameText = undefined;
    }
  }

  // Leave the run unrecorded and fall through to the restart prompt.
  private cancelNameEntry(): void {
    this.enteringName = false;
    this.showRestartPrompt();

    if (this.nameText) {
      this.tweens.killTweensOf(this.nameText);
      this.nameText.destroy();
      this.nameText = undefined;
    }
  }

  private showRestartPrompt(): void {
    // Start the blink from "visible" so the prompt can't appear mid-off-phase.
    this.blinkTimer = 0;
    this.showRestart = true;
    this.restartText = this.add.text(320, 340, 'PRESS SPACE TO RESTART', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 12, y: 6 }
    });
    this.restartText.setOrigin(0.5);
  }

  private updateScoreText(): void {
    const topScore = this.hiScoreSystem.getTopScore();
    this.scoreText.setText(
      `SCORE: ${this.score}\nBEST: ${topScore}`
    );
  }

  private handleInput(): void {
    if (this.enteringName) {
      if (this.nameInput.length >= 1) {
        this.submitScore();
      }
    } else {
      this.restartGame();
    }
  }

  private restartGame(): void {
    // One-shot via sound.play(): sound.add() leaves an undestroyed Sound on the
    // global manager every game over (MusicManager.ts:26-34 has the owned-sound
    // pattern for anything that needs a handle).
    if (this.cache.audio.exists('menu_select')) {
      this.sound.play('menu_select', { volume: 0.6 });
    }

    this.scene.start(GAME, { level: 1 });
  }

  // Touch confirm: submit the score (auto-filling the name) or restart.
  private touchConfirm(): void {
    if (this.enteringName) {
      if (this.nameInput.length === 0) {
        this.nameInput = 'YOU'; // touch confirm with no input → default name
      }
      this.submitScore();
    } else {
      this.restartGame();
    }
  }

  update(): void {
    // On-screen FIRE (mobile) confirms too.
    const fire = !!(window as unknown as { __wizTouch?: Record<string, boolean> }).__wizTouch?.fire;
    if (fire && !this.firePrev) this.touchConfirm();
    this.firePrev = fire;

    this.blinkTimer++;
    if (this.blinkTimer > 30) {
      this.blinkTimer = 0;
      this.showRestart = !this.showRestart;
      if (this.restartText) {
        this.restartText.setVisible(this.showRestart);
      }
    }
  }
}