import Phaser from 'phaser';
import { WeaponFlag } from '../types/game';

enum PowerUpType {
  LATERAL_CONTROL = 1,
  VERTICAL_CONTROL = 2,
  SHIELD_FIRE = 4,
  REAR_FIRE = 8,
  CATELLITE = 16,
  DOUBLE_FIRE = 32,
  WIZ_SPREAD_FIRE = 64,
  CAT_SPREAD_FIRE = 128,
  SMART_BOMB = 256,
  INVULNERABILITY = 512,
  CATELLITE_INVULNERABILITY = 1024,
  EXTRA_LIFE = 2048,
  SPEED_BOOST = 4096
}

interface PowerUpData {
  type: PowerUpType;
  spriteKey: string;
  frame: string | number;
  duration?: number;
  value: number;
}

export default class PowerUpSystem {
  private scene: Phaser.Scene;
  private powerUpGroup: Phaser.Physics.Arcade.Group;
  private activePowerUps: Map<PowerUpType, number> = new Map();
  private playerWeaponFlags: number = 0;
  private hasInvulnerability: boolean = false;
  private invulnerabilityTimer: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.powerUpGroup = scene.physics.add.group();
  }

  spawnPowerUp(x: number, y: number, type: PowerUpType): void {
    const data = this.getPowerUpData(type);
    if (!data) return;

    const powerUp = this.scene.physics.add.sprite(x, y, data.spriteKey, data.frame);
    powerUp.setDisplaySize(32, 32);
    powerUp.setDepth(15);

    const body = powerUp.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 24);
    body.setCircle(12, 4, 4);
    body.setCollideWorldBounds(true);
    body.setBounce(0.8, 0.8);
    body.setVelocity(
      (Math.random() - 0.5) * 100,
      -100 - Math.random() * 50
    );
    body.setGravityY(50);

    (powerUp as any).powerUpType = type;
    (powerUp as any).powerUpData = data;
    (powerUp as any).isBobbing = true;

    this.powerUpGroup.add(powerUp);

    // Bobbing animation
    this.scene.tweens.add({
      targets: powerUp,
      y: powerUp.y - 10,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private getPowerUpData(type: PowerUpType): PowerUpData | null {
    switch (type) {
      case PowerUpType.LATERAL_CONTROL:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.LATERAL_CONTROL };
      case PowerUpType.VERTICAL_CONTROL:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.VERTICAL_CONTROL };
      case PowerUpType.SHIELD_FIRE:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.SHIELD_FIRE };
      case PowerUpType.REAR_FIRE:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.REAR_FIRE };
      case PowerUpType.CATELLITE:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.CATELLITE };
      case PowerUpType.DOUBLE_FIRE:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.DOUBLE_FIRE };
      case PowerUpType.WIZ_SPREAD_FIRE:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.WIZ_SPREAD_FIRE };
      case PowerUpType.CAT_SPREAD_FIRE:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.CAT_SPREAD_FIRE };
      case PowerUpType.SMART_BOMB:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.SMART_BOMB };
      case PowerUpType.INVULNERABILITY:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', duration: 2100, value: PowerUpType.INVULNERABILITY };
      case PowerUpType.CATELLITE_INVULNERABILITY:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', duration: 2100, value: PowerUpType.CATELLITE_INVULNERABILITY };
      case PowerUpType.EXTRA_LIFE:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.EXTRA_LIFE };
      case PowerUpType.SPEED_BOOST:
        return { type, spriteKey: 'pickup', frame: 'pickup_0', value: PowerUpType.SPEED_BOOST };
      default:
        return null;
    }
  }

  setupCollisions(
    player: Phaser.Physics.Arcade.Sprite,
    onPowerUpCollected: (type: PowerUpType, value: number) => void
  ): void {
    this.scene.physics.add.overlap(
      player,
      this.powerUpGroup,
      (_player: any, powerUp: any) => {
        const p = powerUp as Phaser.Physics.Arcade.Sprite;
        const data = (p as any).powerUpData as PowerUpData;

        // Visual pickup effect
        this.scene.tweens.add({
          targets: p,
          scale: 2,
          alpha: 0,
          duration: 200,
          onComplete: () => {
            p.destroy();
          }
        });

        // Play pickup sound
        if (this.scene.cache.audio.exists('bonus_pearl_pickup')) {
          this.scene.sound.play('bonus_pearl_pickup', { volume: 0.6 });
        }

        // Grant power-up
        this.grantPowerUp(data.type, data.duration);
        onPowerUpCollected(data.type, data.value);
      }
    );
  }

  setupWallCollisions(walls: Phaser.Physics.Arcade.StaticGroup | Phaser.Tilemaps.TilemapLayer): void {
    this.scene.physics.add.collider(this.powerUpGroup, walls);
  }

  private grantPowerUp(type: PowerUpType, duration?: number): void {
    switch (type) {
      case PowerUpType.EXTRA_LIFE:
        // Handled by game scene
        break;

      case PowerUpType.INVULNERABILITY:
        this.hasInvulnerability = true;
        this.invulnerabilityTimer = duration || 2100;
        break;

      case PowerUpType.CATELLITE_INVULNERABILITY:
        // Handled by game scene
        break;

      default:
        // Weapon flag power-ups
        this.playerWeaponFlags |= type;
        if (duration) {
          this.activePowerUps.set(type, duration);
        }
        break;
    }
  }

  update(): void {
    // Update invulnerability
    if (this.hasInvulnerability) {
      this.invulnerabilityTimer--;
      if (this.invulnerabilityTimer <= 0) {
        this.hasInvulnerability = false;
      }
    }

    // Update timed power-ups
    for (const [type, timer] of this.activePowerUps.entries()) {
      const newTimer = timer - 1;
      if (newTimer <= 0) {
        this.playerWeaponFlags &= ~type;
        this.activePowerUps.delete(type);
      } else {
        this.activePowerUps.set(type, newTimer);
      }
    }
  }

  hasWeaponFlag(flag: WeaponFlag | PowerUpType): boolean {
    return (this.playerWeaponFlags & flag) !== 0;
  }

  hasPowerUp(type: PowerUpType): boolean {
    return this.activePowerUps.has(type);
  }

  getWeaponFlags(): number {
    return this.playerWeaponFlags;
  }

  setWeaponFlags(flags: number): void {
    this.playerWeaponFlags = flags;
  }

  isInvulnerable(): boolean {
    return this.hasInvulnerability;
  }

  getInvulnerabilityTimer(): number {
    return this.invulnerabilityTimer;
  }

  spawnRandomPowerUp(x: number, y: number): void {
    const types = Object.values(PowerUpType).filter(v => typeof v === 'number') as PowerUpType[];
    const type = types[Math.floor(Math.random() * types.length)];
    this.spawnPowerUp(x, y, type);
  }

  clear(): void {
    this.powerUpGroup.clear(true, true);
    this.activePowerUps.clear();
    this.playerWeaponFlags = 0;
    this.hasInvulnerability = false;
    this.invulnerabilityTimer = 0;
  }

  destroy(): void {
    this.clear();
  }

  getPowerUpGroup(): Phaser.Physics.Arcade.Group {
    return this.powerUpGroup;
  }
}
