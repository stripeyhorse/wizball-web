import Phaser from 'phaser';
import { MovementStyle, WeaponFlag } from '../types/game';

export class Wizball extends Phaser.Physics.Matter.Sprite {
  private movementStyle: MovementStyle = MovementStyle.BASIC_BOUNCE;
  private weaponCollection: number = 0;
  private idealXVel: number = 0;
  private spinAngle: number = 0;
  private topSpinAngle: number = 0;
  private fireDelayCounter: number = 0;
  private lastMovementDirection: number = 1;
  private maxPixelXVel: number = 4;
  private responsiveness: number = 0.5;
  private damping: number = 0.1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x00aaff, 1);
    graphics.fillCircle(24, 24, 20);
    graphics.fillStyle(0x0066cc, 1);
    graphics.fillCircle(24, 24, 12);
    graphics.generateTexture('wizball', 48, 48);
    graphics.destroy();

    super(scene.matter.world, x, y, 'wizball');

    scene.add.existing(this);

    this.setCircle(20);
    this.setBounce(0.8);
    this.setFriction(0, 0);

    this.setupWizball();
  }

  private setupWizball(): void {
    const twoPiPercent = 62831;
    const bitShift = 8;
    const temp = 24 << bitShift;
    this.topSpinAngle = temp % twoPiPercent;
    this.setMovementStyle();
  }

  private setMovementStyle(): void {
    const hasLateral = (this.weaponCollection & WeaponFlag.LATERAL_CONTROL) !== 0;
    const hasVertical = (this.weaponCollection & WeaponFlag.VERTICAL_CONTROL) !== 0;

    if (hasLateral && hasVertical) {
      this.movementStyle = MovementStyle.FULL_CONTROL;
    } else if (hasLateral) {
      this.movementStyle = MovementStyle.CONTROLLED_BOUNCE;
    } else {
      this.movementStyle = MovementStyle.BASIC_BOUNCE;
    }
  }

    public update(cursors: any, fireKey: Phaser.Input.Keyboard.Key): void {
    this.handleInput(cursors);
    this.handleFire(fireKey);
    this.fireDelayCounter = Math.max(0, this.fireDelayCounter - 1);
  }

  private handleInput(cursors: any): void {
    const topPrivateVel = this.maxPixelXVel << 8;
    const body = this.body as any;

    switch (this.movementStyle) {
      case MovementStyle.BASIC_BOUNCE:
      case MovementStyle.CONTROLLED_BOUNCE:
        if (cursors.left && cursors.left.isDown) {
          this.idealXVel -= this.responsiveness * 256;
          this.idealXVel = Math.max(this.idealXVel, -topPrivateVel);
        }
        if (cursors.right && cursors.right.isDown) {
          this.idealXVel += this.responsiveness * 256;
          this.idealXVel = Math.min(this.idealXVel, topPrivateVel);
        }
        
        if (this.movementStyle === MovementStyle.CONTROLLED_BOUNCE) {
          this.setVelocityX(this.idealXVel / 256);
        } else {
          this.spinAngle += this.idealXVel;
        }
        break;

      case MovementStyle.FULL_CONTROL:
        const vx = body && body.velocity ? body.velocity.x : 0;
        const vy = body && body.velocity ? body.velocity.y : 0;

        if (cursors.left && cursors.left.isDown) {
          this.setVelocityX(vx - this.responsiveness);
        } else if (vx < 0) {
          this.setVelocityX(vx + this.damping);
        }

        if (cursors.right && cursors.right.isDown) {
          this.setVelocityX(vx + this.responsiveness);
        } else if (vx > 0) {
          this.setVelocityX(vx - this.damping);
        }

        if (cursors.up && cursors.up.isDown) {
          this.setVelocityY(vy - this.responsiveness);
        } else if (vy < 0) {
          this.setVelocityY(vy + this.damping);
        }

        if (cursors.down && cursors.down.isDown) {
          this.setVelocityY(vy + this.responsiveness);
        } else if (vy > 0) {
          this.setVelocityY(vy - this.damping);
        }

        const clampedX = Math.max(-this.maxPixelXVel, Math.min(this.maxPixelXVel, vx));
        const clampedY = Math.max(-this.maxPixelXVel, Math.min(this.maxPixelXVel, vy));
        this.setVelocity(clampedX, clampedY);

        this.spinAngle += vx * 100;
        break;
    }

    this.spinAngle = ((this.spinAngle % this.topSpinAngle) + this.topSpinAngle) % this.topSpinAngle;

    if (body && body.velocity && body.velocity.x !== 0) {
      this.lastMovementDirection = Math.sign(body.velocity.x);
    }
  }

  private handleFire(fireKey: Phaser.Input.Keyboard.Key): void {
    if (this.fireDelayCounter > 0) return;

    const hasDoubleFire = (this.weaponCollection & WeaponFlag.DOUBLE_FIRE) !== 0;
    const fireRate = hasDoubleFire ? 10 : 20;

    if (fireKey.isDown) {
      this.fireBullet();
      this.fireDelayCounter = fireRate;
    }
  }

  private fireBullet(): void {
    const bulletX = this.x + this.lastMovementDirection * 30;
    const graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffff00, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('bullet', 8, 8);
    graphics.destroy();

    const bullet = this.scene.matter.add.image(bulletX, this.y, 'bullet');
    (bullet as any).setCircle(4);
    (bullet as any).setVelocityX(this.lastMovementDirection * 8);
    (bullet as any).setFriction(0, 0);

    setTimeout(() => bullet.destroy(), 2000);
  }

  public getLastMovementDirection(): number {
    return this.lastMovementDirection;
  }

  public addWeapon(flag: WeaponFlag): void {
    this.weaponCollection |= flag;
    this.setMovementStyle();
  }

  public getWeaponCollection(): number {
    return this.weaponCollection;
  }

  public hasCatellite(): boolean {
    return (this.weaponCollection & WeaponFlag.CATELLITE) !== 0;
  }
}
