import Phaser from 'phaser';

export interface BulletData {
  damage: number;
  isPlayerBullet: boolean;
  isPaintBullet: boolean;
  paintColor?: number;
}

export default class BulletSystem {
  private scene: Phaser.Scene;
  private bulletGroup: Phaser.Physics.Arcade.Group;
  private enemyBulletGroup: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bulletGroup = scene.physics.add.group();
    this.enemyBulletGroup = scene.physics.add.group();
  }

  public fireBullet(
    x: number,
    y: number,
    direction: number,
    isPlayer: boolean,
    isSpecial: boolean = false,
    paintColor?: number
  ): Phaser.Physics.Arcade.Sprite {
    const bullet = this.scene.physics.add.sprite(x, y, 'bullet');
    bullet.setDepth(8);

    if (isSpecial || (paintColor !== undefined)) {
      const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
      bullet.setTint(colors[paintColor || 0]);
      bullet.setDisplaySize(14, 8);
    } else {
      bullet.setTint(isPlayer ? 0xffffff : 0xff8888);
      bullet.setDisplaySize(12, 6);
    }

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setSize(bullet.displayWidth, bullet.displayHeight);
    body.setVelocity(direction * (isPlayer ? 350 : 250), 0);
    body.setGravityY(0);
    body.moves = true;

    // Store bullet data
    (bullet as any).bulletData = {
      damage: isSpecial ? 2 : 1,
      isPlayerBullet: isPlayer,
      isPaintBullet: paintColor !== undefined,
      paintColor: paintColor
    };

    // Add to appropriate group
    if (isPlayer) {
      this.bulletGroup.add(bullet);
    } else {
      this.enemyBulletGroup.add(bullet);
    }

    // Auto-destroy after time
    this.scene.time.delayedCall(isPlayer ? 1500 : 2000, () => {
      if (bullet.active) {
        bullet.destroy();
      }
    });

    // Play sound
    if (isPlayer) {
      const soundKey = isSpecial ? 'wizball_fire_special' : 'wizball_or_cat_fire_normal';
      if (this.scene.cache.audio.exists(soundKey)) {
        this.scene.sound.play(soundKey, { volume: 0.4 });
      }
    } else {
      if (this.scene.cache.audio.exists('enemy_shoot')) {
        this.scene.sound.play('enemy_shoot', { volume: 0.3 });
      }
    }

    return bullet;
  }

  public setupCollisions(
    enemies: Phaser.Physics.Arcade.Group,
    player: Phaser.Physics.Arcade.Sprite,
    onEnemyHit: (enemy: any, bullet: any) => void,
    onPlayerHit: (player: any, bullet: any) => void
  ): void {
    // Player bullets vs enemies
    this.scene.physics.add.overlap(
      this.bulletGroup,
      enemies,
      (bullet: any, enemy: any) => {
        const bulletData = (bullet as any).bulletData as BulletData;
        if (bulletData.isPlayerBullet) {
          onEnemyHit(enemy, bullet);
          bullet.destroy();
        }
      }
    );

    // Enemy bullets vs player
    this.scene.physics.add.overlap(
      this.enemyBulletGroup,
      player,
      (player: any, bullet: any) => {
        const bulletData = (bullet as any).bulletData as BulletData;
        if (!bulletData.isPlayerBullet) {
          onPlayerHit(player, bullet);
          bullet.destroy();
        }
      }
    );
  }

  public setupWallCollisions(walls: Phaser.Physics.Arcade.StaticGroup): void {
    // All bullets vs walls
    this.scene.physics.add.collider(
      this.bulletGroup,
      walls,
      (bullet: any) => {
        this.createImpactEffect(bullet);
        bullet.destroy();
      }
    );

    this.scene.physics.add.collider(
      this.enemyBulletGroup,
      walls,
      (bullet: any) => {
        this.createImpactEffect(bullet);
        bullet.destroy();
      }
    );
  }

    private createImpactEffect(bullet: Phaser.Physics.Arcade.Sprite): void {
    const bulletData = (bullet as any).bulletData as BulletData;

    if (bulletData.isPaintBullet && bulletData.paintColor !== undefined) {
      // Create paint splat on wall impact
      const splatSystem = (this.scene as any).paintSplatSystem;
      if (splatSystem) {
        splatSystem.createSplat(bullet.x, bullet.y, bulletData.paintColor, 10);
      }
    } else {
      // Create small explosion for normal bullets
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0xffaa00, 0.8);
      graphics.fillCircle(bullet.x, bullet.y, 6);
      graphics.setDepth(20);

      this.scene.tweens.add({
        targets: graphics,
        alpha: 0,
        scale: 2,
        duration: 200,
        onComplete: () => graphics.destroy()
      });

      if (this.scene.cache.audio.exists('explosion_small')) {
        this.scene.sound.play('explosion_small', { volume: 0.3 });
      }
    }
  }

  public getPlayerBullets(): Phaser.Physics.Arcade.Group {
    return this.bulletGroup;
  }

  public getEnemyBullets(): Phaser.Physics.Arcade.Group {
    return this.enemyBulletGroup;
  }

  public clear(): void {
    this.bulletGroup.clear(true, true);
    this.enemyBulletGroup.clear(true, true);
  }

  public destroy(): void {
    this.clear();
  }
}