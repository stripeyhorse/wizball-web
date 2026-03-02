import Phaser from 'phaser';
import { PaintColor } from '../types/game';

export class PaintDrop extends Phaser.Physics.Matter.Sprite {
  private color: PaintColor;

  constructor(scene: Phaser.Scene, x: number, y: number, color: PaintColor) {
    const colorValue = PaintDrop.getColorValue(color);
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(colorValue, 1);
    graphics.fillCircle(8, 8, 6);
    graphics.fillStyle(0xffffff, 0.5);
    graphics.fillCircle(6, 6, 3);
    graphics.generateTexture(`paintdrop_${color}`, 16, 16);
    graphics.destroy();

    super(scene.matter.world, x, y, `paintdrop_${color}`);

    scene.add.existing(this);

    this.color = color;
    this.setCircle(6);
    this.setBounce(0.3);
    this.setFriction(0, 0);
    this.setVelocityY(2);
  }

  private static getColorValue(color: PaintColor): number {
    switch (color) {
      case PaintColor.RED: return 0xff0000;
      case PaintColor.GREEN: return 0x00ff00;
      case PaintColor.BLUE: return 0x0000ff;
      case PaintColor.YELLOW: return 0xffff00;
      default: return 0xffffff;
    }
  }

  public getColor(): PaintColor {
    return this.color;
  }
}
