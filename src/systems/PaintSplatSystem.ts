import Phaser from 'phaser';

export interface PaintSplat {
  x: number;
  y: number;
  color: number;
  size: number;
}

export default class PaintSplatSystem {
  private scene: Phaser.Scene;
  private splatGroup: Phaser.GameObjects.Group;
  private maxSplats: number = 50;
  private splatCounter: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.splatGroup = scene.add.group();
  }

  public createSplat(x: number, y: number, color: number, size: number = 8): void {
    if (this.splatCounter >= this.maxSplats) {
      this.removeOldestSplat();
    }

    const splat = this.createSplatSprite(x, y, color, size);
    this.splatGroup.add(splat);
    this.splatCounter++;

    // Animate splat
    this.scene.tweens.add({
      targets: splat,
      scaleX: { from: 0.5, to: 1.2 },
      scaleY: { from: 0.5, to: 1.2 },
      duration: 100,
      onComplete: () => {
        this.scene.tweens.add({
          targets: splat,
          scaleX: { from: 1.2, to: 1 },
          scaleY: { from: 1.2, to: 1 },
          duration: 100
        });
      }
    });

    // Play sound
    if (this.scene.cache.audio.exists('paint_splat')) {
      this.scene.sound.play('paint_splat', { volume: 0.4 });
    }
  }

  private createSplatSprite(x: number, y: number, color: number, size: number): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
    const paintColor = colors[color] || colors[0];

    // Main splat
    graphics.fillStyle(paintColor, 0.7);
    graphics.fillCircle(0, 0, size);

    // Drips
    const dripCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < dripCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = size * 0.8 + Math.random() * size * 0.5;
      const dripSize = size * 0.3 + Math.random() * size * 0.2;
      const dripX = Math.cos(angle) * distance;
      const dripY = Math.sin(angle) * distance;

      graphics.fillStyle(paintColor, 0.5);
      graphics.fillCircle(dripX, dripY, dripSize);
    }

    graphics.setPosition(x, y);
    graphics.setDepth(3);

    return graphics;
  }

  private removeOldestSplat(): void {
    const children = this.splatGroup.getChildren();
    if (children.length > 0) {
      const oldest = children[0] as Phaser.GameObjects.Graphics;
      oldest.destroy();
      this.splatCounter--;
    }
  }

  public clear(): void {
    this.splatGroup.clear(true, true);
    this.splatCounter = 0;
  }

  public createWallSplats(walls: Phaser.Physics.Arcade.StaticGroup, color: number): void {
    walls.children.each((wall: Phaser.GameObjects.GameObject) => {
      const rect = wall as any;
      const body = rect.body as Phaser.Physics.Arcade.StaticBody;
      
      // Randomly add splats to walls
      if (Math.random() < 0.3) {
        const bounds = body.position;
        const size = body.width || 16;
        const height = body.height || 16;

        const x = bounds.x - size / 2 + Math.random() * size;
        const y = bounds.y - height / 2 + Math.random() * height;

        this.createSplat(x, y, color, 6 + Math.random() * 6);
      }

      return true;
    });
  }

  public fadeAllSplats(duration: number = 2000): void {
    this.splatGroup.getChildren().forEach(splat => {
      this.scene.tweens.add({
        targets: splat,
        alpha: 0,
        duration: duration,
        onComplete: () => {
          splat.destroy();
          this.splatCounter--;
        }
      });
    });
  }

  public destroy(): void {
    this.clear();
  }
}