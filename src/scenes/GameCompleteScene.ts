import Phaser from 'phaser';
import HiScoreSystem from '../systems/HiScoreSystem';
import { playSceneMusic, type SceneMusic } from '../systems/MusicManager';

// C++ HISCORE_MAX_NAME_LENGTH = 13 (wizball/processed_scripts_test.txt:9941).
const MAX_NAME_LENGTH = 13;

export default class GameCompleteScene extends Phaser.Scene {
  private score: number = 0;
  private level: number = 1;
  private hiScoreSystem!: HiScoreSystem;
  private blinkTimer: number = 0;
  private showRestart: boolean = true;
  private currentMusic: SceneMusic | null = null;
  private firePrev = false;
  // Same lockout as GameOverScene — this is the other end-of-run confirm screen
  // and the C++ gates that one at game_over_screen.txt:25,39-46 (opengl_vertex_alpha
  // + 5 per frame, FIRE only read at 255 => 51 frames). Reached from
  // LaboratoryScene's 900ms delayedCall, so a FIRE still held from the laboratory
  // (the on-screen touch button reports as held, not as a fresh press) confirmed
  // on frame one and blew straight through to the Title.
  private inputLockFrames: number = 51;

  constructor() {
    super({ key: 'GameComplete' });
  }

  init(data: { score?: number; level?: number } = {}): void {
    this.score = data.score || 0;
    this.level = data.level || 8;

    // Per-visit state. Phaser reuses this scene instance for every
    // scene.start(), so field initialisers run once at construction only —
    // nameInput/enteringName and the stale Text handles would otherwise carry
    // over from a previous playthrough in the same session.
    this.nameInput = '';
    this.enteringName = false;
    this.isNewHighScore = false;
    this.blinkTimer = 0;
    this.showRestart = true;
    this.firePrev = false;
    this.inputLockFrames = 51; // C++ game_over_screen.txt:39-46 — FIRE ignored while the screen fades in
    this.currentMusic = null;
    this.nameText = undefined;
    this.restartText = undefined;
  }

  create(): void {
    this.hiScoreSystem = new HiScoreSystem();
    this.isNewHighScore = this.hiScoreSystem.isHighScore(this.score);

    this.add.rectangle(320, 184, 640, 368, 0x0a2a1a).setDepth(-1);

    const titleText = this.add.text(320, 80, 'GAME COMPLETE!', {
      fontSize: '48px',
      color: '#44ff88',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 4
    });
    titleText.setOrigin(0.5);

    this.add.text(320, 140, 'CONGRATULATIONS WIZARD!', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.add.text(320, 175, `FINAL SCORE: ${this.score}`, {
      fontSize: '24px',
      color: '#ffff44',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    if (this.isNewHighScore && this.score > 0) {
      this.showNameEntry();
    } else {
      this.showRestartPrompt();
    }

    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey.on('down', this.handleInput, this);

    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (this.enteringName) {
        this.handleNameInput(event);
      }
    });

    // Touch path, mirroring GameOverScene. Without it a phone player who reached
    // the end of level 8 had no keyboard, no pointer handler and no on-screen
    // FIRE poll — the only way off this screen was reloading the page.
    // Gated to real touch so an idle desktop click can't submit the name.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) this.touchConfirm();
    });

    if (this.cache.audio.exists('wizball_explode')) {
      this.sound.play('wizball_explode', { volume: 0.7 });
    }

    this.currentMusic = playSceneMusic(this, 'wizball_completion', { loop: false });
  }

  private isNewHighScore: boolean = false;
  private enteringName: boolean = false;
  private nameInput: string = '';
  private nameText?: Phaser.GameObjects.Text;

  private showNameEntry(): void {
    this.enteringName = true;

    // Switch to hi-score music during name entry
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic = null;
    }
    this.currentMusic = playSceneMusic(this, 'wizball_hi_score');

    this.add.text(320, 220, 'NEW HIGH SCORE!', {
      fontSize: '20px',
      color: '#ffff44',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(320, 256, `TYPE YOUR NAME (UP TO ${MAX_NAME_LENGTH}), THEN ENTER`, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.add.text(320, 276, 'ESC TO SKIP', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.nameText = this.add.text(320, 308, '_', {
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

  // Trailing '_' is the cursor; the field is variable-length, not 3 fixed slots.
  private renderName(): string {
    return this.nameInput.length >= MAX_NAME_LENGTH ? this.nameInput : this.nameInput + '_';
  }

  private handleNameInput(event: KeyboardEvent): void {
    // 1..13 characters, matching GameOverScene and C++ HISCORE_MAX_NAME_LENGTH
    // (was EXACTLY 3 alphabetic characters, with nothing on screen saying so).
    // Space is excluded on purpose: Key.onDown runs before this generic handler,
    // so an accepted space let two SPACE presses file the score under " ".
    if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key) && this.nameInput.length < MAX_NAME_LENGTH) {
      this.nameInput += event.key.toUpperCase();
      this.nameText?.setText(this.renderName());
    } else if (event.key === 'Backspace' && this.nameInput.length > 0) {
      this.nameInput = this.nameInput.slice(0, -1);
      this.nameText?.setText(this.renderName());
    } else if (event.key === 'Enter' && this.nameInput.length >= 1) {
      this.submitScore();
    } else if (event.key === 'Escape') {
      this.cancelNameEntry();
    }
  }

  private submitScore(): void {
    this.enteringName = false;
    this.hiScoreSystem.addScore(this.nameInput, this.score, this.level);
    this.showRestartPrompt();
    this.destroyNameText();
  }

  // Leave the run unrecorded and fall through to the restart prompt.
  private cancelNameEntry(): void {
    this.enteringName = false;
    this.showRestartPrompt();
    this.destroyNameText();
  }

  private destroyNameText(): void {
    if (this.nameText) {
      this.tweens.killTweensOf(this.nameText);
      this.nameText.destroy();
      this.nameText = undefined;
    }
  }

  private restartText?: Phaser.GameObjects.Text;
  private showRestartPrompt(): void {
    // Start the blink from "visible" so the prompt can't appear mid-off-phase.
    this.blinkTimer = 0;
    this.showRestart = true;
    // y=360 put the padded 18px prompt at 343..377 on a 368-tall canvas — the
    // bottom of the box was cut off. 340 matches GameOverScene.
    this.restartText = this.add.text(320, 340, 'PRESS SPACE TO PLAY AGAIN', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 12, y: 6 }
    });
    this.restartText.setOrigin(0.5);
  }

  private handleInput(): void {
    // C++ game_over_screen.txt:41-46 gates the FIRE read on the fade-in, whatever
    // the input source: SPACE held from the level auto-repeats into this scene too.
    if (this.inputLockFrames > 0) return;
    if (this.enteringName) {
      if (this.nameInput.length >= 1) {
        this.submitScore();
      }
    } else {
      this.restartGame();
    }
  }

  // Touch confirm: submit the score (auto-filling the name) or return to the
  // title. Mirrors GameOverScene.touchConfirm.
  private touchConfirm(): void {
    if (this.inputLockFrames > 0) return;
    if (this.enteringName) {
      if (this.nameInput.length === 0) {
        this.nameInput = 'YOU'; // touch confirm with no input → default name
      }
      this.submitScore();
    } else {
      this.restartGame();
    }
  }

  private restartGame(): void {
    // One-shot via sound.play() so nothing is left undestroyed on the global
    // sound manager (MusicManager.ts:26-34 is the pattern for owned sounds).
    if (this.cache.audio.exists('menu_select')) {
      this.sound.play('menu_select', { volume: 0.6 });
    }
    this.scene.start('Title');
  }

  update(): void {
    if (this.inputLockFrames > 0) this.inputLockFrames--;

    // On-screen FIRE (mobile) confirms too — same poll as GameOverScene. firePrev
    // is tracked through the lock as well, so a FIRE held from before the scene
    // change never becomes an edge once the lock expires.
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
