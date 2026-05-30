import Phaser from 'phaser';
import { playSceneMusic } from '../systems/MusicManager';

/**
 * BonusLevelScene - Wave-survival shooter.
 *
 * Faithful remake of the original Wizball bonus level (see C++ reference:
 *   wizball/wizball/scripts/main_game_controller.txt  (bonus_level_handler, ~L282-474)
 *   wizball/wizball/datatables/bonus_wave_order.txt    (the wave sequence)
 *   wizball/wizball/scripts/bonus_wave_enemy.txt       (per-enemy scoring/behaviour)
 *
 * In the original, Wizball is spun off into space at (320,208) and must survive a
 * fixed sequence of enemy waves, scoring per kill. When all waves finish a kill-count
 * summary is shown (bonus = enemies_killed * 40) and control returns to the laboratory.
 *
 * Per-kill score (bonus_wave_enemy.txt L793-799):
 *     score += 20 + floor(wave_number_in_bonus_level / 3) * 10
 * End-of-bonus summary bonus (main_game_controller.txt L419-431):
 *     score += enemies_killed * 40
 */

// Wave type ids mirror the CONST_BONUS_WAVE_TYPE_* constants referenced in
// bonus_wave_order.txt. Exact sprite-level behaviour is approximated here with
// simple moving enemies, but the NUMBER and ORDER of waves is preserved 1:1.
enum WaveType {
  SLOW_PLANES,
  REGULAR_PAINTBALL_BOUNCE,
  RANDOM_ASTEROIDS,
  RANDOM_CIRCLES,
  RANDOM_PAINTBALL_BOUNCE,
  FILTH,
  BONUS_LIFE,
  NEW_8_WAY_SHOOTERS,
  NEW_ROTATE_SHOOTERS,
  UP_AND_DOWNERS,
  SLOW_STARS, // pacing-only marker wave: spawns no enemies, just slows the stars
  FINISHED
}

interface WaveDef {
  type: WaveType;
  /** Number of enemies in this wave (col 3 "total wave size" of the datatable). */
  size: number;
  /** Frames to wait after this wave before advancing (col 4 "after wave wait"). */
  afterWait: number;
}

// Direct transcription of datatables/bonus_wave_order.txt (rows in order).
// Flag columns (X/Y invert/toggle, alternate modes) are not needed for the
// approximation, so only type / size / after-wave-wait are carried across.
// wave index (0-based) here == wave_number_in_bonus_level used for scoring.
const WAVE_ORDER: WaveDef[] = [
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 50 }, // 0
  { type: WaveType.REGULAR_PAINTBALL_BOUNCE, size: 6, afterWait: 50 }, // 1
  { type: WaveType.RANDOM_CIRCLES, size: 21, afterWait: 0 }, // 2
  { type: WaveType.RANDOM_ASTEROIDS, size: 15, afterWait: 50 }, // 3
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 50 }, // 4
  { type: WaveType.REGULAR_PAINTBALL_BOUNCE, size: 6, afterWait: 50 }, // 5
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 100 }, // 6
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 100 }, // 7
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 100 }, // 8
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 100 }, // 9
  { type: WaveType.RANDOM_ASTEROIDS, size: 21, afterWait: 50 }, // 10
  { type: WaveType.RANDOM_CIRCLES, size: 48, afterWait: 50 }, // 11
  { type: WaveType.RANDOM_PAINTBALL_BOUNCE, size: 6, afterWait: 75 }, // 12
  { type: WaveType.RANDOM_PAINTBALL_BOUNCE, size: 6, afterWait: 75 }, // 13
  { type: WaveType.RANDOM_PAINTBALL_BOUNCE, size: 6, afterWait: 75 }, // 14
  { type: WaveType.RANDOM_CIRCLES, size: 30, afterWait: 0 }, // 15
  { type: WaveType.RANDOM_ASTEROIDS, size: 15, afterWait: 50 }, // 16
  { type: WaveType.RANDOM_ASTEROIDS, size: 8, afterWait: 50 }, // 17
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 100 }, // 18
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 100 }, // 19
  { type: WaveType.SLOW_PLANES, size: 6, afterWait: 100 }, // 20
  { type: WaveType.FILTH, size: 6, afterWait: 50 }, // 21
  { type: WaveType.FILTH, size: 6, afterWait: 50 }, // 22
  { type: WaveType.BONUS_LIFE, size: 1, afterWait: 50 }, // 23
  { type: WaveType.SLOW_STARS, size: 0, afterWait: 150 }, // 24
  { type: WaveType.NEW_8_WAY_SHOOTERS, size: 6, afterWait: 50 }, // 25
  { type: WaveType.NEW_ROTATE_SHOOTERS, size: 1, afterWait: 20 }, // 26
  { type: WaveType.NEW_ROTATE_SHOOTERS, size: 2, afterWait: 20 }, // 27
  { type: WaveType.NEW_ROTATE_SHOOTERS, size: 3, afterWait: 20 }, // 28
  { type: WaveType.NEW_ROTATE_SHOOTERS, size: 4, afterWait: 20 }, // 29
  { type: WaveType.NEW_ROTATE_SHOOTERS, size: 5, afterWait: 20 }, // 30
  { type: WaveType.NEW_ROTATE_SHOOTERS, size: 6, afterWait: 20 }, // 31
  { type: WaveType.FILTH, size: 6, afterWait: 50 }, // 32
  { type: WaveType.NEW_8_WAY_SHOOTERS, size: 22, afterWait: 50 }, // 33
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 50 }, // 34
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 50 }, // 35
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 100 }, // 36
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 100 }, // 37
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 100 }, // 38
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 100 }, // 39
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 100 }, // 40
  { type: WaveType.UP_AND_DOWNERS, size: 6, afterWait: 100 }, // 41
  { type: WaveType.BONUS_LIFE, size: 1, afterWait: 50 }, // 42
  { type: WaveType.FINISHED, size: 0, afterWait: 50 } // 43
];

const SCREEN_W = 640;
const SCREEN_H = 368;
const PLAYER_SPEED = 220;
const BULLET_SPEED = 480;
const FIRE_COOLDOWN = 200; // ms between shots
const FRAME_MS = 1000 / 60; // C++ waits are in 60Hz frames

interface EnemyData {
  type: WaveType;
}

export default class BonusLevelScene extends Phaser.Scene {
  // --- init-data contract (matches GameScene / LaboratoryScene conventions) ---
  private level: number = 1;
  private score: number = 0;
  private weaponCollection: number = 0;
  private lives: number = 3;
  private levelProgress: number = 0;
  private cauldronFill: number[] = [0, 0, 0, 0];

  // --- gameplay state ---
  private enemiesKilled: number = 0;
  private waveIndex: number = -1; // advanced to 0 on first spawn (mirrors wave_number)
  private waveWaitFrames: number = 50; // pre-delay before first wave (datatable #DEFAULT)
  private spawningEnabled: boolean = false;
  private finished: boolean = false;

  private player: Phaser.Physics.Arcade.Sprite | null = null;
  private bullets: Phaser.Physics.Arcade.Group | null = null;
  private enemies: Phaser.Physics.Arcade.Group | null = null;
  private starfield: Phaser.GameObjects.Graphics[] = [];
  private starSpeedMul: number = 1;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private lastFireTime: number = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BonusLevel' });
  }

  init(data: {
    level?: number;
    score?: number;
    weaponCollection?: number;
    lives?: number;
    levelProgress?: number;
    cauldronFill?: number[];
  }): void {
    this.level = data.level ?? 1;
    this.score = data.score ?? 0;
    this.weaponCollection = data.weaponCollection ?? 0;
    this.lives = data.lives ?? 3;
    this.levelProgress = data.levelProgress ?? 0;
    this.cauldronFill = data.cauldronFill ?? [0, 0, 0, 0];

    // reset per-run gameplay state
    this.enemiesKilled = 0;
    this.waveIndex = -1;
    this.waveWaitFrames = 50;
    this.spawningEnabled = false;
    this.finished = false;
    this.starSpeedMul = 1;
    this.lastFireTime = 0;
    this.starfield = [];
  }

  create(): void {
    this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2, SCREEN_W, SCREEN_H, 0x050510).setDepth(-2);
    this.createStarfield();

    this.add.text(SCREEN_W / 2, 18, 'BONUS LEVEL', {
      fontSize: '20px',
      color: '#ffff44',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);

    this.scoreText = this.add.text(8, 6, `SCORE ${this.score}`, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setDepth(20);

    this.waveText = this.add.text(SCREEN_W - 8, 6, '', {
      fontSize: '14px',
      color: '#88ff88',
      fontFamily: 'monospace'
    }).setOrigin(1, 0).setDepth(20);

    this.killText = this.add.text(8, SCREEN_H - 20, 'KILLS 0', {
      fontSize: '14px',
      color: '#ffaa44',
      fontFamily: 'monospace'
    }).setDepth(20);

    // Input: 8-direction movement + fire (cursors + SPACE), matching sibling scenes.
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

    this.createPlayer();

    // Player bullet hits enemy -> kill + score.
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, undefined, this);

    // Enable wave spawning shortly after the scene begins (mirrors the queued
    // LEVEL_RESET_FLAG_MOVE_TO_NEXT_BONUS_WAVE that kicks the sequence off).
    this.spawningEnabled = true;

    if (this.cache.audio.exists('bonus_selection')) {
      this.sound.add('bonus_selection', { volume: 0.5 }).play();
    }

    playSceneMusic(this, 'wizball_bonus');
  }

  private createStarfield(): void {
    for (let i = 0; i < 100; i++) {
      const star = this.add.graphics();
      const x = Math.random() * SCREEN_W;
      const y = Math.random() * SCREEN_H;
      const size = 0.5 + Math.random() * 1.5;
      const alpha = 0.3 + Math.random() * 0.7;
      star.fillStyle(0xffffff, alpha);
      star.fillCircle(x, y, size);
      star.setDepth(-1);
      (star as any).speed = 0.5 + Math.random() * 2;
      this.starfield.push(star);
    }
  }

  private createPlayer(): void {
    // Original spawns Wizball at (320,208) on a 640x416 field; centre it on ours.
    this.player = this.physics.add.sprite(SCREEN_W / 2, SCREEN_H / 2, 'wizball', 0);
    this.player.setDisplaySize(32, 32);
    this.player.setDepth(10);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCircle(12, 4, 4);
    body.setCollideWorldBounds(true);
  }

  // --- inline bullet logic (GameScene's is not importable from here) ---
  private fire(): void {
    if (!this.player || !this.bullets) return;
    const now = this.time.now;
    if (now - this.lastFireTime < FIRE_COOLDOWN) return;
    this.lastFireTime = now;

    const bullet = this.bullets.create(
      this.player.x + 18,
      this.player.y,
      'bullets',
      'bullets_1'
    ) as Phaser.Physics.Arcade.Sprite;
    bullet.setDepth(8);
    bullet.setDisplaySize(12, 6);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    bullet.setVelocityX(BULLET_SPEED);

    if (this.cache.audio.exists('wizball_or_cat_fire_normal')) {
      this.sound.play('wizball_or_cat_fire_normal', { volume: 0.3 });
    }
  }

  private onBulletHitEnemy(bulletObj: any, enemyObj: any): void {
    const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    const data = (enemy.getData('enemy') as EnemyData) ?? { type: WaveType.SLOW_PLANES };

    bullet.destroy();

    this.enemiesKilled += 1;

    // Per-kill score: 20 + floor(wave_number_in_bonus_level / 3) * 10
    // (bonus_wave_enemy.txt object_interaction_routine, L793-795).
    const idx = (enemy.getData('waveIndex') as number) ?? Math.max(0, this.waveIndex);
    this.score += 20 + Math.floor(idx / 3) * 10;

    // BONUS_LIFE enemy grants an extra life when destroyed (L785-787).
    if (data.type === WaveType.BONUS_LIFE) {
      this.lives += 1;
    }

    this.tweens.add({
      targets: enemy,
      scale: enemy.scale * 1.8,
      alpha: 0,
      duration: 150,
      onComplete: () => enemy.destroy()
    });

    if (this.cache.audio.exists('enemy_explode')) {
      this.sound.play('enemy_explode', { volume: 0.5 });
    }

    this.scoreText.setText(`SCORE ${this.score}`);
    this.killText.setText(`KILLS ${this.enemiesKilled}`);
  }

  // --- wave spawning ---
  private spawnWave(def: WaveDef): void {
    if (def.type === WaveType.FINISHED) {
      this.beginSummary();
      return;
    }

    if (def.type === WaveType.SLOW_STARS) {
      // No enemies: just slows the starfield (bonus_level_starfield_slow_flag).
      this.starSpeedMul = 0.35;
      return;
    }

    for (let i = 0; i < def.size; i++) {
      this.spawnEnemy(def.type, this.waveIndex, i, def.size);
    }
  }

  private spawnEnemy(type: WaveType, waveIndex: number, indexInWave: number, waveSize: number): void {
    if (!this.enemies) return;

    // Pick a plausible spawn position / velocity per family. Sprites and exact
    // motion are approximated; behaviour family is kept recognisable.
    let x = SCREEN_W + 24;
    let y = Phaser.Math.Between(40, SCREEN_H - 40);
    let vx = -Phaser.Math.Between(80, 160);
    let vy = 0;
    let textureKey = 'enemies';
    let frame = 8;
    let size = 28;

    switch (type) {
      case WaveType.SLOW_PLANES:
        // Sine-bobbing planes sweeping in from the left edge.
        x = -24;
        y = 40 + (indexInWave / Math.max(1, waveSize)) * (SCREEN_H - 80);
        vx = Phaser.Math.Between(70, 120);
        frame = 8;
        break;
      case WaveType.REGULAR_PAINTBALL_BOUNCE:
      case WaveType.RANDOM_PAINTBALL_BOUNCE:
        // Bouncing paintballs crossing the screen.
        x = SCREEN_W + 24;
        y = Phaser.Math.Between(60, SCREEN_H - 60);
        vx = -Phaser.Math.Between(120, 220);
        vy = Phaser.Math.Between(-120, 120);
        frame = 0;
        size = 22;
        break;
      case WaveType.RANDOM_ASTEROIDS:
        // Spinning rocks drifting in from the right.
        x = SCREEN_W + 24;
        y = Phaser.Math.Between(24, SCREEN_H - 24);
        vx = -Phaser.Math.Between(90, 180);
        vy = Phaser.Math.Between(-60, 60);
        frame = 51;
        size = 30;
        break;
      case WaveType.RANDOM_CIRCLES:
        // Spawn at top/bottom edges, accelerate inward.
        x = Phaser.Math.Between(64, SCREEN_W - 64);
        y = Math.random() < 0.5 ? -16 : SCREEN_H + 16;
        vx = Phaser.Math.Between(-60, 60);
        vy = y < 0 ? Phaser.Math.Between(60, 140) : -Phaser.Math.Between(60, 140);
        frame = 49;
        size = 22;
        break;
      case WaveType.FILTH:
        // Filth creatures swooping along a path.
        x = SCREEN_W + 24;
        y = Phaser.Math.Between(40, SCREEN_H - 40);
        vx = -Phaser.Math.Between(70, 130);
        vy = Phaser.Math.Between(-40, 40);
        textureKey = this.textures.exists('enemies02') ? 'enemies02' : 'enemies';
        frame = 0;
        size = 32;
        break;
      case WaveType.BONUS_LIFE:
        // Bouncing extra-life token (a little wizball).
        x = SCREEN_W + 24;
        y = SCREEN_H - 64;
        vx = -110;
        vy = -40;
        textureKey = 'wizball';
        frame = 0;
        size = 24;
        break;
      case WaveType.NEW_8_WAY_SHOOTERS:
      case WaveType.NEW_ROTATE_SHOOTERS:
        // Stationary-ish shooters that fade in at a random spot.
        x = Phaser.Math.Between(80, SCREEN_W - 80);
        y = Phaser.Math.Between(60, SCREEN_H - 60);
        vx = 0;
        vy = 0;
        textureKey = this.textures.exists('enemies02') ? 'enemies02' : 'enemies';
        frame = 67;
        size = 28;
        break;
      case WaveType.UP_AND_DOWNERS:
        // Sine-weaving fliers crossing horizontally.
        x = SCREEN_W + 24;
        y = SCREEN_H / 2;
        vx = -Phaser.Math.Between(110, 160);
        vy = 0;
        frame = 51;
        size = 26;
        break;
    }

    const enemy = this.enemies.create(x, y, textureKey, frame) as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(6);
    enemy.setDisplaySize(size, size);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    enemy.setVelocity(vx, vy);
    enemy.setData('enemy', { type } as EnemyData);
    enemy.setData('waveIndex', waveIndex);
    enemy.setData('isUpDowner', type === WaveType.UP_AND_DOWNERS);
    enemy.setData('baseY', y);
    enemy.setData('phase', Math.random() * Math.PI * 2);

    // Asteroids / circles bouncing types deflect off vertical edges (visual only).
    enemy.setData('bounceY', type === WaveType.REGULAR_PAINTBALL_BOUNCE ||
      type === WaveType.RANDOM_PAINTBALL_BOUNCE || type === WaveType.RANDOM_CIRCLES);
  }

  // --- end-of-bonus summary (main_game_controller.txt L409-440) ---
  private beginSummary(): void {
    if (this.finished) return;
    this.finished = true;
    this.spawningEnabled = false;

    // Apply the end-of-bonus summary bonus: enemies_killed * 40 (L419, L427-431).
    const summaryBonus = this.enemiesKilled * 40;
    this.score += summaryBonus;

    // Clear remaining hazards.
    this.enemies?.clear(true, true);
    this.bullets?.clear(true, true);

    this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2, SCREEN_W, SCREEN_H, 0x000000, 0.8).setDepth(100);

    this.add.text(SCREEN_W / 2, 120, 'BONUS COMPLETE', {
      fontSize: '26px',
      color: '#88ff88',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(101);

    this.add.text(SCREEN_W / 2, 170, `ENEMIES DESTROYED: ${this.enemiesKilled}`, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(101);

    this.add.text(SCREEN_W / 2, 200, `BONUS: ${summaryBonus}`, {
      fontSize: '18px',
      color: '#ffff88',
      fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(101);

    this.add.text(SCREEN_W / 2, 240, `SCORE: ${this.score}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(101);

    this.scoreText.setText(`SCORE ${this.score}`);

    // C++ holds the summary ~200 frames (~3.3s) before returning to the lab.
    this.time.delayedCall(3000, () => this.goToLaboratory());
  }

  private goToLaboratory(): void {
    // Preserve and forward the full init-data contract with the updated score.
    this.scene.start('Laboratory', {
      level: this.level,
      score: this.score,
      weaponCollection: this.weaponCollection,
      lives: this.lives,
      levelProgress: this.levelProgress,
      cauldronFill: this.cauldronFill
    });
  }

  update(_time: number, delta: number): void {
    // Scroll starfield (slowed once SLOW_STARS wave fires).
    this.starfield.forEach(star => {
      star.y += (star as any).speed * this.starSpeedMul;
      if (star.y > SCREEN_H) {
        star.y = 0;
        star.x = Math.random() * SCREEN_W;
      }
    });

    if (this.finished) return;

    this.handlePlayer();
    this.handleEnemies();
    this.handleWaveSpawning(delta);
  }

  private handlePlayer(): void {
    if (!this.player) return;

    const t = (window as unknown as { __wizTouch?: Record<string, boolean> }).__wizTouch || {};
    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || t.moveLeft) vx -= PLAYER_SPEED;
    if (this.cursors.right?.isDown || t.moveRight) vx += PLAYER_SPEED;
    if (this.cursors.up?.isDown || t.moveUp) vy -= PLAYER_SPEED;
    if (this.cursors.down?.isDown || t.moveDown) vy += PLAYER_SPEED;
    this.player.setVelocity(vx, vy);

    if (this.fireKey.isDown || t.fire) {
      this.fire();
    }
  }

  private handleEnemies(): void {
    if (!this.enemies) return;
    const children = this.enemies.getChildren();
    for (let i = children.length - 1; i >= 0; i--) {
      const enemy = children[i] as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const body = enemy.body as Phaser.Physics.Arcade.Body;

      // Up-and-downers weave on a sine wave.
      if (enemy.getData('isUpDowner')) {
        const baseY = enemy.getData('baseY') as number;
        const phase = (enemy.getData('phase') as number) + this.time.now * 0.004;
        enemy.y = baseY + Math.sin(phase) * 60;
      }

      // Simple vertical bounce for bouncing types.
      if (enemy.getData('bounceY')) {
        if (enemy.y < 16 && body.velocity.y < 0) enemy.setVelocityY(-body.velocity.y);
        else if (enemy.y > SCREEN_H - 16 && body.velocity.y > 0) enemy.setVelocityY(-body.velocity.y);
      }

      // Retire enemies that have left the play field (check_if_off_screen_and_retire).
      if (enemy.x < -48 || enemy.x > SCREEN_W + 48 ||
        enemy.y < -64 || enemy.y > SCREEN_H + 64) {
        enemy.destroy();
      }
    }
  }

  private handleWaveSpawning(delta: number): void {
    if (!this.spawningEnabled) return;

    // Decrement the inter-wave wait in 60Hz frame units (mirrors `wave_wait - 1`).
    this.waveWaitFrames -= delta / FRAME_MS;
    if (this.waveWaitFrames > 0) return;

    // Advance to the next wave (mirrors wave_number + 1, READ_FROM_DATATABLE).
    this.waveIndex += 1;
    if (this.waveIndex >= WAVE_ORDER.length) {
      this.beginSummary();
      return;
    }

    const def = WAVE_ORDER[this.waveIndex];
    this.spawnWave(def);

    // Set the wait until the next wave (the datatable's "after wave wait" column).
    this.waveWaitFrames = def.afterWait > 0 ? def.afterWait : 1;

    this.waveText.setText(`WAVE ${Math.min(this.waveIndex + 1, WAVE_ORDER.length)}/${WAVE_ORDER.length}`);
  }
}
