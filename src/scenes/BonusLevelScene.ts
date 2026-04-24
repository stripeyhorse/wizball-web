import Phaser from 'phaser';
import { playSceneMusic } from '../systems/MusicManager';

export default class BonusLevelScene extends Phaser.Scene {
  private score: number = 0;
  private level: number = 1;
  private weaponCollection: number = 0;
  private starfield: Phaser.GameObjects.Graphics[] = [];
  private collectibles: Phaser.Physics.Arcade.Group | null = null;
  private player: Phaser.Physics.Arcade.Sprite | null = null;
  private timeRemaining: number = 3000;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BonusLevel' });
  }

  init(data: { score: number; level: number; weaponCollection?: number }): void {
    this.score = data.score || 0;
    this.level = data.level || 1;
    this.weaponCollection = data.weaponCollection ?? 0;
  }

  create(): void {
    this.add.rectangle(320, 184, 640, 368, 0x050510).setDepth(-1);

    this.createStarfield();

    this.add.text(320, 30, 'BONUS LEVEL', {
      fontSize: '32px',
      color: '#ffff44',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.scoreText = this.add.text(320, 70, `Score: ${this.score}`, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.timerText = this.add.text(320, 100, '', {
      fontSize: '14px',
      color: '#88ff88',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.createPlayer();
    this.createCollectibles();

    this.time.delayedCall(this.timeRemaining, () => {
      this.endBonusLevel();
    });

    if (this.cache.audio.exists('bonus_selection')) {
      this.sound.add('bonus_selection', { volume: 0.5 }).play();
    }

    playSceneMusic(this, 'wizball_bonus');
  }

  private createStarfield(): void {
    for (let i = 0; i < 100; i++) {
      const star = this.add.graphics();
      const x = Math.random() * 640;
      const y = Math.random() * 368;
      const size = 0.5 + Math.random() * 1.5;
      const alpha = 0.3 + Math.random() * 0.7;
      star.fillStyle(0xffffff, alpha);
      star.fillCircle(x, y, size);
      (star as any).speed = 0.5 + Math.random() * 2;
      this.starfield.push(star);
    }
  }

  private createPlayer(): void {
    this.player = this.physics.add.sprite(320, 184, 'wizball', 0);
    this.player.setDisplaySize(32, 32);
    this.player.setDepth(10);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCircle(12, 4, 4);
    body.setCollideWorldBounds(true);
  }

  private createCollectibles(): void {
    this.collectibles = this.physics.add.group();

    for (let i = 0; i < 20; i++) {
      const x = 50 + Math.random() * 540;
      const y = 50 + Math.random() * 268;

      const pearl = this.physics.add.sprite(x, y, 'pickup', 'pickup_0');
      pearl.setDisplaySize(16, 16);
      pearl.setDepth(5);
      (pearl as any).value = 100 + Math.floor(Math.random() * 5) * 100;

      this.collectibles.add(pearl);
    }

    if (this.player && this.collectibles) {
      this.physics.add.overlap(this.player, this.collectibles, this.collectPearl, undefined, this);
    }
  }

  private collectPearl(_player: any, pearl: any): void {
    const value = (pearl as any).value || 100;
    this.score += value;
    this.scoreText.setText(`Score: ${this.score}`);

    this.tweens.add({
      targets: pearl,
      scale: 2,
      alpha: 0,
      duration: 200,
      onComplete: () => pearl.destroy()
    });

    if (this.cache.audio.exists('bonus_pearl_pickup')) {
      this.sound.add('bonus_pearl_pickup', { volume: 0.6 }).play();
    }
  }

  private endBonusLevel(): void {
    this.add.rectangle(320, 184, 640, 368, 0x000000, 0.8).setDepth(100);

    this.add.text(320, 150, 'BONUS COMPLETE!', {
      fontSize: '28px',
      color: '#88ff88',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(320, 200, `Final Score: ${this.score}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.time.delayedCall(2000, () => {
      this.scene.start('Laboratory', {
        level: this.level,
        score: this.score,
        weaponCollection: this.weaponCollection
      });
    });
  }

  update(): void {
    this.timeRemaining -= 16;
    const seconds = Math.max(0, Math.ceil(this.timeRemaining / 1000));
    this.timerText.setText(`Time: ${seconds}s`);

    this.starfield.forEach(star => {
      star.y += (star as any).speed;
      if (star.y > 368) {
        star.y = 0;
        star.x = Math.random() * 640;
      }
    });

    if (this.player) {
      const cursors = this.input.keyboard!.createCursorKeys();
      const speed = 200;

      if (cursors.left.isDown) {
        this.player.setVelocityX(-speed);
      } else if (cursors.right.isDown) {
        this.player.setVelocityX(speed);
      } else {
        this.player.setVelocityX(0);
      }

      if (cursors.up.isDown) {
        this.player.setVelocityY(-speed);
      } else if (cursors.down.isDown) {
        this.player.setVelocityY(speed);
      } else {
        this.player.setVelocityY(0);
      }
    }
  }
}
