import Phaser from 'phaser';
import { MovementStyle, WeaponFlag } from '../types/game';

const BITSHIFT = 8;
const PRIVATE_SCALE = 1 << BITSHIFT;
const TWO_PI_PERCENT = 62831;
const WIZBALL_RADIUS = 24;

const WIZBALL_MAX_PIXEL_X_VEL = 3;
const WIZBALL_X_RESPONSIVENESS = 64;
const WIZBALL_X_DAMPING = 64;
const WIZBALL_Y_RESPONSIVENESS = 96;
const WIZBALL_Y_DAMPING = 64;
const WIZBALL_MINIMUM_HORIZONTAL_BOUNCE_SPEED = 512;
const WIZBALL_MINIMUM_VERTICAL_BOUNCE_SPEED = 768;

export class Wizball extends Phaser.Physics.Matter.Sprite {
  private movementStyle: MovementStyle = MovementStyle.BASIC_BOUNCE;
  private weaponCollection: number = 0;
  private idealXVel: number = 0;
  private spinAngle: number = 0;
  private topSpinAngle: number = 0;
  private topPrivateVel: number = 0;
  private fireDelayCounter: number = 0;
  private lastMovementDirection: number = 1;


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
    const temp = WIZBALL_RADIUS << BITSHIFT;
    this.topSpinAngle = temp % TWO_PI_PERCENT;
    this.topPrivateVel = WIZBALL_MAX_PIXEL_X_VEL << BITSHIFT;
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
    const body = this.body as any;

    switch (this.movementStyle) {
      case MovementStyle.BASIC_BOUNCE:
        this.spinAngle = this.clamp(this.spinAngle + this.idealXVel, 0, this.topSpinAngle);

        if (cursors.right && cursors.right.isDown) {
          this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, this.topPrivateVel);
        }
        if (cursors.left && cursors.left.isDown) {
          this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -this.topPrivateVel);
        }
        break;

      case MovementStyle.CONTROLLED_BOUNCE:
        this.spinAngle = this.clamp(this.spinAngle + this.idealXVel, 0, this.topSpinAngle);

        if (cursors.right && cursors.right.isDown) {
          this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, this.topPrivateVel);
        }
        if (cursors.left && cursors.left.isDown) {
          this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -this.topPrivateVel);
        }

        this.setVelocityX(this.idealXVel / PRIVATE_SCALE * 60);
        break;

      case MovementStyle.FULL_CONTROL:
        const vx = body && body.velocity ? body.velocity.x : 0;
        const vy = body && body.velocity ? body.velocity.y : 0;

        let xVel = vx / 60 * PRIVATE_SCALE;
        let yVel = vy / 60 * PRIVATE_SCALE;

        this.spinAngle = this.clamp(this.spinAngle + xVel, 0, this.topSpinAngle);

        // First X block: RIGHT handling
        if (cursors.right && cursors.right.isDown) {
          xVel = Math.min(xVel + WIZBALL_X_RESPONSIVENESS, this.topPrivateVel);
        } else {
          if (cursors.left && cursors.left.isDown) {
            // x_vel = x_vel (do nothing)
          } else {
            if (xVel > 0) {
              xVel = Math.max(xVel - WIZBALL_X_DAMPING, 0);
            }
          }
        }

        // Second X block: LEFT handling
        if (cursors.left && cursors.left.isDown) {
          xVel = Math.max(xVel - WIZBALL_X_RESPONSIVENESS, -this.topPrivateVel);
        } else {
          if (cursors.right && cursors.right.isDown) {
            // x_vel = x_vel (do nothing)
          } else {
            if (xVel < 0) {
              xVel = Math.min(xVel + WIZBALL_X_DAMPING, 0);
            }
          }
        }

        // First Y block: DOWN handling
        if (cursors.down && cursors.down.isDown) {
          yVel = Math.min(yVel + WIZBALL_Y_RESPONSIVENESS, this.topPrivateVel);
        } else {
          if (yVel > 0) {
            yVel = Math.max(yVel - WIZBALL_Y_DAMPING, 0);
          }
        }

        // Second Y block: UP handling
        if (cursors.up && cursors.up.isDown) {
          yVel = Math.max(yVel - WIZBALL_Y_RESPONSIVENESS, -this.topPrivateVel);
        } else {
          if (yVel < 0) {
            yVel = Math.min(yVel + WIZBALL_Y_DAMPING, 0);
          }
        }

        this.setVelocity(xVel / PRIVATE_SCALE * 60, yVel / PRIVATE_SCALE * 60);
        break;
    }

    if (body && body.velocity && body.velocity.x !== 0) {
      this.lastMovementDirection = Math.sign(body.velocity.x);
    } else if (this.movementStyle !== MovementStyle.FULL_CONTROL && this.idealXVel !== 0) {
      this.lastMovementDirection = Math.sign(this.idealXVel);
    }
  }

  private clamp(value: number, min: number, max: number): number {
    if (value < min) value = min;
    if (value > max) value = max;
    return value;
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
    (bullet as any).setVelocityX(this.lastMovementDirection * 8 * 60);
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

  public onHorizontalWallHit(): void {
    const body = this.body as any;
    const vx = body && body.velocity ? body.velocity.x : 0;
    const fixedVx = vx / 60 * PRIVATE_SCALE;

    if (this.movementStyle === MovementStyle.BASIC_BOUNCE) {
      const product = this.idealXVel * fixedVx;
      if (product < 0) {
        this.setVelocityX(-this.idealXVel / PRIVATE_SCALE * 60);
        this.idealXVel = -this.idealXVel;
      } else {
        this.setVelocityX(this.idealXVel / PRIVATE_SCALE * 60);
      }
    } else {
      if (Math.abs(fixedVx) < WIZBALL_MINIMUM_HORIZONTAL_BOUNCE_SPEED) {
        const sign = fixedVx < 0 ? -1 : 1;
        this.setVelocityX(sign * WIZBALL_MINIMUM_HORIZONTAL_BOUNCE_SPEED / PRIVATE_SCALE * 60);
      }
      this.idealXVel = (body && body.velocity ? body.velocity.x : 0) / 60 * PRIVATE_SCALE;
    }
  }

  public onVerticalWallHit(): void {
    const body = this.body as any;
    const vy = body && body.velocity ? body.velocity.y : 0;
    const fixedVy = vy / 60 * PRIVATE_SCALE;

    if (this.movementStyle === MovementStyle.FULL_CONTROL) {
      if (Math.abs(fixedVy) < WIZBALL_MINIMUM_VERTICAL_BOUNCE_SPEED) {
        const sign = fixedVy < 0 ? -1 : 1;
        this.setVelocityY(sign * WIZBALL_MINIMUM_VERTICAL_BOUNCE_SPEED / PRIVATE_SCALE * 60);
      }
    }
  }

  public getIdealXVel(): number {
    return this.idealXVel;
  }

  public getTopPrivateVel(): number {
    return this.topPrivateVel;
  }
}
