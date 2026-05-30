import Phaser from 'phaser';
import { GAME } from '../types/game';
import HiScoreSystem from '../systems/HiScoreSystem';
import { playSceneMusic, type SceneMusic } from '../systems/MusicManager';

export default class GameOverScene extends Phaser.Scene {
  private score: number = 0;
  private level: number = 1;
  private hiScoreSystem!: HiScoreSystem;
  private gameOverText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private restartText!: Phaser.GameObjects.Text;
  private blinkTimer: number = 0;
  private showRestart: boolean = true;
  private isNewHighScore: boolean = false;
  private nameInput: string = '';
  private nameText!: Phaser.GameObjects.Text;
  private enteringName: boolean = false;
  private currentMusic: SceneMusic | null = null;
  private firePrev = false;

  constructor() {
    super({ key: 'GameOver' });
  }

  init(data: { score?: number; level?: number } = {}): void {
    this.score = data.score || 0;
    this.level = data.level || 1;
    this.nameInput = '';
    this.enteringName = false;
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

    // Touch / mouse (mobile): tap to confirm — auto-fills the name if needed.
    this.input.on('pointerdown', this.touchConfirm, this);

    if (this.cache.audio.exists('wizball_explode')) {
      this.sound.add('wizball_explode', { volume: 0.7 }).play();
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

    this.add.text(320, 240, 'ENTER YOUR NAME (3 LETTERS):', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.nameText = this.add.text(320, 280, '___', {
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

  private handleNameInput(event: KeyboardEvent): void {
    if (event.key.length === 1 && /[a-zA-Z]/.test(event.key) && this.nameInput.length < 3) {
      this.nameInput += event.key.toUpperCase();
      this.nameText.setText(this.nameInput.padEnd(3, '_'));
    } else if (event.key === 'Backspace' && this.nameInput.length > 0) {
      this.nameInput = this.nameInput.slice(0, -1);
      this.nameText.setText(this.nameInput.padEnd(3, '_'));
    } else if (event.key === 'Enter' && this.nameInput.length === 3) {
      this.submitScore();
    }
  }

  private submitScore(): void {
    this.enteringName = false;
    this.hiScoreSystem.addScore(this.nameInput, this.score, this.level);
    this.showRestartPrompt();

    if (this.nameText) {
      this.nameText.destroy();
    }
  }

  private showRestartPrompt(): void {
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
      if (this.nameInput.length === 3) {
        this.submitScore();
      }
    } else {
      this.restartGame();
    }
  }

  private restartGame(): void {
    if (this.cache.audio.exists('menu_select')) {
      const sound = this.sound.add('menu_select', { volume: 0.6 });
      sound.play();
    }

    this.scene.start(GAME, { level: 1 });
  }

  // Touch confirm: submit the score (auto-filling the name) or restart.
  private touchConfirm(): void {
    if (this.enteringName) {
      if (this.nameInput.length < 3) {
        this.nameInput = (this.nameInput + 'YOU').slice(0, 3);
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