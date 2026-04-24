import Phaser from 'phaser';
import HiScoreSystem from '../systems/HiScoreSystem';
import { playSceneMusic, type SceneMusic } from '../systems/MusicManager';

export default class GameCompleteScene extends Phaser.Scene {
  private score: number = 0;
  private level: number = 1;
  private hiScoreSystem!: HiScoreSystem;
  private blinkTimer: number = 0;
  private showRestart: boolean = true;
  private currentMusic: SceneMusic | null = null;

  constructor() {
    super({ key: 'GameComplete' });
  }

  init(data: { score?: number; level?: number } = {}): void {
    this.score = data.score || 0;
    this.level = data.level || 8;
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

    if (this.cache.audio.exists('wizball_explode')) {
      this.sound.add('wizball_explode', { volume: 0.7 }).play();
    }

    this.currentMusic = playSceneMusic(this, 'wizball_completion', { loop: false });
  }

  private isNewHighScore: boolean = false;
  private enteringName: boolean = false;
  private nameInput: string = '';
  private nameText!: Phaser.GameObjects.Text;

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

    this.add.text(320, 260, 'ENTER YOUR NAME (3 LETTERS):', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.nameText = this.add.text(320, 300, '___', {
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
    if (this.nameText) this.nameText.destroy();
    this.input.keyboard!.off('keydown');
  }

  private restartText!: Phaser.GameObjects.Text;
  private showRestartPrompt(): void {
    this.restartText = this.add.text(320, 360, 'PRESS SPACE TO PLAY AGAIN', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 12, y: 6 }
    });
    this.restartText.setOrigin(0.5);
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
      this.sound.add('menu_select', { volume: 0.6 }).play();
    }
    this.scene.start('Title');
  }

  update(): void {
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
