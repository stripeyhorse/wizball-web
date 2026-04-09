import Phaser from 'phaser';
import { GAME, PAUSE } from '../types/game';
import { WeaponFlag } from '../types/game';
import { InputManager } from '../systems/InputManager';

enum SpecialPaintballType {
  EXTRA_LIFE = 0,
  FILTH_RAID = 1,
  FREAKY_BITS = 2,
  INDESTRUCTACAT = 3,
  MUTANT_CAT = 4
}

// Sync text fetch via XHR (for tilemap loading fallback in Vite)
function syncFetchText(url: string): string | undefined {
  try {
    const req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.send(null);
    if (req.status === 200 || req.status === 0) return req.responseText;
  } catch (_) { /* ignore */ }
  return undefined;
}
import { getLevelData } from '../data/levels';
import { parseTilemap, BOOL_DEADLY, BOOL_HARMFUL, BOOL_CONVEY, BOOL_ACCELLERATE, BOOL_WATER } from '../systems/TilemapParser';
import type { ParsedTilemap, TileDefinition } from '../systems/TilemapParser';
import WorldCollisionMap, {
  COLLISION_HORIZONTAL_WORLD_EDGE_SOLID,
  COLLISION_ITERATE_MOVEMENT,
  COLLISION_USE_EXTRA_TEST_POINTS,
  COLLISION_VERTICAL_WORLD_EDGE_SOLID
} from '../systems/WorldCollision';
import BonusSelectionPanelSystem from '../systems/BonusSelectionPanelSystem';
import CauldronSystem from '../systems/CauldronSystem';
import EnemySystem from '../systems/EnemySystem';
import HUDSystem, { HUDState } from '../systems/HUDSystem';
import WarpTubeSystem from '../systems/WarpTubeSystem';

// Wizball constants from C++ code (fixed point math, scaled by 256)
// In C++, all velocity/acceleration values are in fixed-point (1/256 pixel units)
// WIZBALL_X_RESPONSIVENESS = 64 means 64/256 = 0.25 pixels/frame acceleration
const WIZBALL_RADIUS = 24;
const COLLISION_RADIUS = 16;
// C++ sets world collision from object (RADIUS=16 → UPPER=16, LOWER=15) then subtracts 8:
const WORLD_COLLISION_UPPER = COLLISION_RADIUS - 8; // 8
const WORLD_COLLISION_LOWER = COLLISION_RADIUS - 1 - 8; // 7
const WIZBALL_MAX_PIXEL_X_VEL = 3;
// All values below are raw fixed-point (as in C++ constant.txt)
const WIZBALL_X_RESPONSIVENESS = 64;
const WIZBALL_Y_RESPONSIVENESS = 96;
const WIZBALL_X_DAMPING = 64;
const WIZBALL_Y_DAMPING = 64;
const WIZBALL_GRAVITY_STRENGTH = 48;
const WIZBALL_START_Y = 32; // C++ constant: distance from top where Wizball starts
const WIZBALL_FRAME_COUNT = 64;
const TWO_PI_PERCENT = 62831 / 10000;
const WIZBALL_WOBBLE_DELAY = 30;
const WIZBALL_BONUS_SELECTION_WOBBLE_THRESHOLD = 4;
const WORLD_BITMASK_PLAYER_COLLIDES = 17;
const PLAYER_WORLD_COLLISION_LAYER = 1;
const PLAYER_WORLD_COLLISION_BEHAVIOUR =
  COLLISION_USE_EXTRA_TEST_POINTS |
  COLLISION_ITERATE_MOVEMENT |
  COLLISION_HORIZONTAL_WORLD_EDGE_SOLID |
  COLLISION_VERTICAL_WORLD_EDGE_SOLID;

const BITSHIFT = 8;
const PRIVATE_SCALE = 1 << BITSHIFT; // 256

const GAME_WIDTH = 640;
const GAME_HEIGHT = 368;
const TILE_SIZE = 16;
const WARP_MOUND_SIZE = TILE_SIZE;

// Bullet constants from C++
const BULLET_SPEED = 720; // px/s (192 bitshift 4)
const NORMAL_FIRE_RATE = 20; // frames
const DOUBLE_FIRE_RATE = 10; // frames
const SPREAD_FIRE_RATE = 10; // frames

// Catellite Constants from C++
const CATELLITE_CONTROLLED_HORIZONTAL_SPEED = 6;
const CATELLITE_CONTROLLED_VERTICAL_SPEED = 6;
const CATELLITE_FOLLOWING_HORIZONTAL_SPEED = 4;
const CATELLITE_CONTROL_THRESHOLD = 25;

// Paint colors
const PAINT_COLORS = ['RED', 'GREEN', 'BLUE'];
const PAINT_FRAME_COLORS = [0xff0000, 0x00ff00, 0x0000ff];

enum MovementStyle {
  BASIC_BOUNCE = 0,
  CONTROLLED_BOUNCE = 1,
  FULL_CONTROLLED = 2
}

enum WobbleDirection {
  EITHER = 0,
  LEFT = 1,
  RIGHT = 2
}

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private inputManager!: InputManager;

  // Wizball physics state (in fixed-point units scaled by 256)
  private xVel: number = 0;
  private yVel: number = 0;
  private idealXVel: number = 0;
  private spinAngle: number = 0;
  private topSpinAngle: number = 0;
  private spinAngleToFrameDivider: number = 0;

  private movementStyle: MovementStyle = MovementStyle.BASIC_BOUNCE;
  private weaponCollection: number = 0;
  private lastMovementDirection: number = 1;

  // Catellite state
  private catelliteControlCounter: number = 0;
  private catellitePreviousYPositions: number[] = [];
  private catelliteIsPlayerControlled: boolean = true;
  private mutantCatelliteActive: boolean = false;
  private catelliteFireCooldown: number = 0;

  // Game objects
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private warpMounds!: Phaser.Physics.Arcade.StaticGroup;
  private paintGroup!: Phaser.Physics.Arcade.Group;
  private bulletGroup!: Phaser.Physics.Arcade.Group;
  private bonusPearlGroup!: Phaser.Physics.Arcade.Group;
  private specialPaintballGroup!: Phaser.Physics.Arcade.Group;
  private catellite!: Phaser.Physics.Arcade.Sprite;
  private catelliteBubble!: Phaser.GameObjects.Graphics;
  private enemySystem!: EnemySystem;
  private cauldronSystem!: CauldronSystem;
  private bonusSelectionPanel!: BonusSelectionPanelSystem;
  private warpTubeSystem!: WarpTubeSystem;

  // Game state
  private lives: number = 2;
  private paintColor: number = 0;
  private hasPaint: boolean = false;
  private fireCooldown: number = 0;
  private catelliteOrbitAngle: number = 0;
  private catelliteHasShield: boolean = false;
  private score: number = 0;
  private currentLevel: number = 1;
  private currentPickupCount: number = 0;
  private cauldronFill: number[] = [0, 0, 0, 0];
  private enemiesKilledThisLevel: number = 0;
  private totalEnemiesInLevel: number = 0;
  private consecutiveEnemyKills: number = 0; // C++: tracks kills for bonus pearl (every 10)
  private rearFireToggle: boolean = false; // C++: alternates rear fire direction
  private worldWidth: number = GAME_WIDTH;
  private worldHeight: number = GAME_HEIGHT;
  private levelVisuals: Phaser.GameObjects.GameObject[] = [];
  private tilemapLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private worldCollisionMap: WorldCollisionMap | null = null;
  private currentParsedTilemap: ParsedTilemap | null = null;
  private worldColliders: Phaser.Physics.Arcade.Collider[] = [];
  private wobbleResetCountdown: number = 0;
  private wobbleCounter: number = 0;
  private wobbleNextDirection: WobbleDirection = WobbleDirection.EITHER;
  private playerXFixed: number = 0;
  private playerYFixed: number = 0;

  // HUD
  private hudText!: Phaser.GameObjects.Text;
  private paintIndicator!: Phaser.GameObjects.Rectangle;
  private hudSystem!: HUDSystem;

  // Sounds
  private bounceSound!: Phaser.Sound.BaseSound;
  private fireSound!: Phaser.Sound.BaseSound;
  private pickupSound!: Phaser.Sound.BaseSound;

  constructor() {
    super({ key: GAME });
  }

  init(data: { level?: number; score?: number; weaponCollection?: number; lives?: number } = {}): void {
    this.currentLevel = data.level ?? 1;
    this.score = data.score ?? 0;
    this.weaponCollection = data.weaponCollection ?? 0;
    this.lives = data.lives ?? this.lives;
    this.applyWeaponMovementStyle();
  }

  create(): void {
    this.cameras.main.roundPixels = true;

    // C++ spin calculation: top_spin_angle = (wizball_radius << bitshift) % TWO_PI_PERCENT
    // = (24 << 8) % 62831 = 6144. Divider = 6144 / 64 = 96.
    this.topSpinAngle = (WIZBALL_RADIUS << BITSHIFT) % Math.round(TWO_PI_PERCENT);
    this.spinAngleToFrameDivider = this.topSpinAngle / WIZBALL_FRAME_COUNT;

    // Create sounds
    this.bounceSound = this.sound.add('wizball_bounce', { volume: 0.5 });
    this.fireSound = this.sound.add('wizball_or_cat_fire_normal', { volume: 0.4 });
    this.pickupSound = this.sound.add('bonus_pearl_pickup', { volume: 0.6 });

    // Create paint drop textures (generated, not loaded from files)
    this.createPaintTextures();

    // Create warp tube system (before createLevel which uses it)
    this.warpTubeSystem = new WarpTubeSystem(this);

    // Create player
    this.createPlayer();

    // Create enemy system before level setup so level parsing can configure it immediately.
    this.enemySystem = new EnemySystem(this);
    this.enemySystem.setPlayerReference(this.player);

    // Build the level
    this.createLevel();
    this.events.on('warp-activate', (data: { levelDelta: number }) => {
      this.warpToAdjacentLevel(data.levelDelta);
    });

    // Create catellite (follower)
    this.createCatellite();

    // Create paint drops
    this.createPaintSystem();

    // Create bullet group
    this.bulletGroup = this.physics.add.group({
      runChildUpdate: true
    });
    this.bonusPearlGroup = this.physics.add.group();
    this.specialPaintballGroup = this.physics.add.group();

    this.enemySystem.loadEnemyQueues();
    this.enemySystem.configureLevel(this.currentParsedTilemap);
    this.enemySystem.spawnInitialEnemies(this.currentLevel);
    this.totalEnemiesInLevel = this.enemySystem.getActiveEnemyCount();

    // Setup input via InputManager (keyboard + gamepad)
    this.inputManager = new InputManager(this);

    // Setup collisions
    this.setupCollisions();

    // Create HUD
    this.createHUD();

    this.bonusSelectionPanel = new BonusSelectionPanelSystem(this);
    this.bonusSelectionPanel.update(this.weaponCollection, this.currentPickupCount);

    this.cauldronSystem = new CauldronSystem(this);
    this.cauldronSystem.setupCauldrons(this.currentLevel);
    this.cauldronSystem.setFillLevels(this.cauldronFill);

    // Initial velocity - C++ starts with a small downward push
    this.yVel = 2 * PRIVATE_SCALE;
    this.idealXVel = 0;
  }

  private createPaintTextures(): void {
    const defs = [
      { key: 'paint_red',   color: 0xff2222 },
      { key: 'paint_green', color: 0x22ff22 },
      { key: 'paint_blue',  color: 0x2266ff },
    ];
    for (const { key, color } of defs) {
      if (this.textures.exists(key)) continue;
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.fillCircle(8, 8, 6);
      g.generateTexture(key, 16, 16);
      g.destroy();
    }
  }

  private hitEnemy(_bullet: any, enemy: any): void {
    const bullet = _bullet as Phaser.Physics.Arcade.Sprite;
    bullet.destroy();
    const e = enemy as Phaser.Physics.Arcade.Sprite;
    const enemyData = (e as any)._data;
    const isPaintBubble = enemyData?.enemyType === 0; // EnemyType.PAINT_BUBBLES
    const isMolecule = Boolean((e as any)._isMolecule);

    // Explosion death animation: scale up + fade out
    this.tweens.add({
      targets: e,
      scale: 1.5,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.score += 50; // C++: +50 per enemy kill
        this.enemiesKilledThisLevel++;
        this.consecutiveEnemyKills++;

        if (isMolecule) {
          this.spawnBonusPearl(e.x, e.y);
        } else if (isPaintBubble) {
          // Paint bubble enemies drop paintdrops when killed
          const color = Math.floor(Math.random() * 3);
          this.spawnPaintDrop(color, e.x, e.y);
        }

        // 5% chance to drop a special paintball pickup
        if (!isMolecule && Math.random() < 0.05) {
          const type = Math.floor(Math.random() * 5) as SpecialPaintballType;
          this.spawnSpecialPaintball(e.x, e.y, type);
        }

        // C++: every 10 consecutive kills spawns a bonus pearl
        if (!isMolecule && this.consecutiveEnemyKills % 10 === 0) {
          this.spawnBonusPearl(e.x, e.y);
        }

        if (this.cache.audio.exists('enemy_explode')) {
          this.sound.play('enemy_explode', { volume: 0.5 });
        }

        e.destroy();
        this.handlePostEnemyRemoval();
      }
    });
  }

  // C++: player touching an enemy destroys the enemy and damages the player
  private playerCollideWithEnemy(_player: any, _enemy: any): void {
    const player = _player as Phaser.Physics.Arcade.Sprite;
    const enemy = _enemy as Phaser.Physics.Arcade.Sprite;

    // Player takes damage (unless invulnerable)
    if ((this.weaponCollection & WeaponFlag.INVULNERABILITY) === 0) {
      this.lives--;
      if (this.lives <= 0) {
        this.scene.start('GameOver', { score: this.score, level: this.currentLevel, weaponCollection: this.weaponCollection, lives: this.lives });
        return;
      }
      // Flash player
      this.tweens.add({
        targets: player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 3,
      });
    }

    // Destroy enemy on contact
    this.tweens.add({
      targets: enemy,
      scale: 1.5,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.score += 50;
        this.enemiesKilledThisLevel++;
        this.consecutiveEnemyKills++;
        if (this.cache.audio.exists('enemy_explode')) {
          this.sound.play('enemy_explode', { volume: 0.5 });
        }
        enemy.destroy();
        this.handlePostEnemyRemoval();
      }
    });
  }

  // C++: catellite touching an enemy destroys the catellite (unless INDESTRUCTACAT)
  private catelliteCollideWithEnemy(_catellite: any, _enemy: any): void {
    const enemy = _enemy as Phaser.Physics.Arcade.Sprite;

    // INDESTRUCTACAT: catellite cannot be destroyed
    if ((this.weaponCollection & WeaponFlag.INDESTRUCTACAT) !== 0) {
      return;
    }

    // CATELLITE_INVULNERABILITY: temporarily invincible
    if ((this.weaponCollection & WeaponFlag.CATELLITE_INVULNERABILITY) !== 0) {
      return;
    }

    // Destroy catellite
    this.tweens.add({
      targets: this.catellite,
      scale: 0,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        // Remove catellite from weapon collection
        this.weaponCollection &= ~WeaponFlag.CATELLITE;
        // Kill the enemy too
        this.tweens.add({
          targets: enemy,
          scale: 1.5,
          alpha: 0,
          duration: 150,
          onComplete: () => {
            this.score += 50;
            this.enemiesKilledThisLevel++;
            if (this.cache.audio.exists('enemy_explode')) {
              this.sound.play('enemy_explode', { volume: 0.5 });
            }
            enemy.destroy();
            this.handlePostEnemyRemoval();
          }
        });
      }
    });
  }

  private hitByEnemyBullet(_player: any, bullet: any): void {
    const b = bullet as Phaser.Physics.Arcade.Sprite;
    this.enemySystem.releaseEnemyBullet(b);

    // Check invulnerability
    if ((this.weaponCollection & WeaponFlag.INVULNERABILITY) !== 0) {
      return;
    }

    this.lives--;
    if (this.lives <= 0) {
      this.scene.start('GameOver', { score: this.score, level: this.currentLevel, weaponCollection: this.weaponCollection, lives: this.lives });
    } else {
      // Flash player to indicate damage
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 3,
        onComplete: () => { this.player.setAlpha(1); }
      });
    }
  }

  private checkLevelCompletion(): void {
    // C++: level is complete when all 3 primary cauldrons are filled to capacity
    // The flow is: fill 3 cauldrons -> bonus level -> Laboratory -> next level
    const cauldronsFilled = this.cauldronFill.slice(0, 3).every(f => f >= 20);

    if (cauldronsFilled) {
      this.startLevelTransition();
    }
  }

  private handlePostEnemyRemoval(): void {
    this.checkLevelCompletion();

    if (!this.cauldronFill.slice(0, 3).every(f => f >= 20) && this.enemySystem.maybeSpawnReplacementWave(this.currentLevel)) {
      this.totalEnemiesInLevel = this.enemySystem.getActiveEnemyCount();
      if (this.enemySystem.isInMoleculePhase()) {
        return;
      }

      this.score += 1000;

      if (this.cache.audio.exists('spawn_new_wave_sound')) {
        this.sound.play('spawn_new_wave_sound', { volume: 0.5 });
      }
    }
  }

  private startLevelTransition(): void {
    // Show level complete
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'LEVEL COMPLETE!', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5);
    text.setScrollFactor(0);
    text.setDepth(200);

    if (this.cache.audio.exists('level_complete')) {
      this.sound.play('level_complete');
    }

    this.time.delayedCall(2000, () => {
      text.destroy();
      const MAX_LEVEL = 8;

      // C++ flow: fill cauldrons -> bonus level -> Laboratory -> next level
      // After completing cauldrons, go to Laboratory for upgrade selection
      // Then advance to next level
      // After all 8 levels, game complete
      if (this.currentLevel >= MAX_LEVEL) {
        this.scene.start('GameComplete', {
          score: this.score,
          level: this.currentLevel
        });
        return;
      }

      // Go to Laboratory after completing each level's cauldrons
      this.goToLaboratory();
    });
  }

  private nextLevel(): void {
    this.currentLevel++;
    this.enemiesKilledThisLevel = 0;
    this.resetLevel();
  }

  private goToLaboratory(): void {
    // Show "HEADING TO LABORATORY!" message, then transition to Laboratory
    this.scene.start('Laboratory', {
      level: this.currentLevel,
      score: this.score,
      weaponCollection: this.weaponCollection
    });
  }

  private resetLevel(): void {
    const spawn = this.getSpawnPosition();

    this.cauldronFill = [0, 0, 0, 0];
    this.currentPickupCount = 0;
    this.hasPaint = false;
    this.paintIndicator.setAlpha(0.3);
    this.consecutiveEnemyKills = 0;
    this.mutantCatelliteActive = false;
    this.catelliteFireCooldown = 0;

    // Reset player position
    this.player.setPosition(spawn.x, spawn.y);
    this.playerXFixed = spawn.x * PRIVATE_SCALE;
    this.playerYFixed = spawn.y * PRIVATE_SCALE;
    (this.player.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    this.xVel = 0;
    this.yVel = 2 * PRIVATE_SCALE;
    this.idealXVel = 0;

    this.createLevel();
    this.cauldronSystem.setupCauldrons(this.currentLevel);
    this.cauldronSystem.setFillLevels(this.cauldronFill);
    this.paintGroup.clear(true, true);

    // Respawn enemies
    this.enemySystem.configureLevel(this.currentParsedTilemap);
    this.enemySystem.spawnInitialEnemies(this.currentLevel);
    this.totalEnemiesInLevel = this.enemySystem.getActiveEnemyCount();

    // Clear bullets
    this.bulletGroup.clear(true, true);
    this.bonusPearlGroup.clear(true, true);
    this.specialPaintballGroup.clear(true, true);
    this.resetWobbleState();

    // Reset timed powerup states (C++ clears mutant_cat_flag on wizball death)
    this.weaponCollection &= ~WeaponFlag.MUTANT_CAT;
    this.weaponCollection &= ~WeaponFlag.FILTH_RAID;
    this.weaponCollection &= ~WeaponFlag.FREAKY_BITS;
    this.weaponCollection &= ~WeaponFlag.INDESTRUCTACAT;
    this.weaponCollection &= ~WeaponFlag.CATELLITE_INVULNERABILITY;
  }

  private warpToAdjacentLevel(levelDelta: number): void {
    const nextLevel = Phaser.Math.Clamp(this.currentLevel + levelDelta, 1, 8);
    if (nextLevel === this.currentLevel) {
      this.player.setAlpha(1);
      this.player.setScale(1);
      this.warpTubeSystem.resetWarping();
      return;
    }

    const preservedCauldronFill = [...this.cauldronFill];
    const preservedPickupCount = this.currentPickupCount;
    const preservedHasPaint = this.hasPaint;
    const preservedPaintColor = this.paintColor;
    const preservedKillStreak = this.consecutiveEnemyKills;

    this.currentLevel = nextLevel;
    this.createLevel();

    const spawn = this.getSpawnPosition();
    this.player.setPosition(spawn.x, spawn.y);
    this.playerXFixed = spawn.x * PRIVATE_SCALE;
    this.playerYFixed = spawn.y * PRIVATE_SCALE;
    (this.player.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    this.xVel = 0;
    this.yVel = 2 * PRIVATE_SCALE;
    this.idealXVel = 0;

    this.cauldronSystem.setupCauldrons(this.currentLevel);
    this.cauldronFill = preservedCauldronFill;
    this.cauldronSystem.setFillLevels(this.cauldronFill);

    this.paintGroup.clear(true, true);
    this.bulletGroup.clear(true, true);
    this.bonusPearlGroup.clear(true, true);
    this.specialPaintballGroup.clear(true, true);

    this.enemySystem.configureLevel(this.currentParsedTilemap);
    this.enemySystem.spawnInitialEnemies(this.currentLevel);
    this.totalEnemiesInLevel = this.enemySystem.getActiveEnemyCount();

    this.currentPickupCount = preservedPickupCount;
    this.hasPaint = preservedHasPaint;
    this.paintColor = preservedPaintColor;
    this.consecutiveEnemyKills = preservedKillStreak;
    this.catelliteFireCooldown = 0;

    if (this.hasPaint) {
      this.paintIndicator.fillColor = PAINT_FRAME_COLORS[this.paintColor];
      this.paintIndicator.setAlpha(1);
    } else {
      this.paintIndicator.setAlpha(0.3);
    }

    this.player.setAlpha(1);
    this.player.setScale(1);
    this.warpTubeSystem.resetWarping();

    if (this.cache.audio.exists('warp_tube_deposit')) {
      this.sound.play('warp_tube_deposit', { volume: 0.5 });
    }
  }

  private createLevel(): void {
    this.clearLevelVisuals();
    this.tilemapLayers.forEach(layer => layer.destroy());
    this.tilemapLayers = [];
    this.collisionLayer = null;
    this.worldCollisionMap = null;
    this.currentParsedTilemap = null;

    if (this.walls === undefined) {
      this.walls = this.physics.add.staticGroup();
    } else {
      this.walls.clear(true, true);
    }

    if (this.warpMounds === undefined) {
      this.warpMounds = this.physics.add.staticGroup();
    } else {
      this.warpMounds.clear(true, true);
    }

    const levelData = getLevelData(this.currentLevel);
    const tilesetIndex = levelData?.tilesetIndex ?? Math.max(0, this.currentLevel - 1);

    // Try Phaser cache first (populated by PreloadScene), fall back to fetch-based sync load via XHR
    let tilemapText = this.cache.text.get(`tilemap_${this.currentLevel}`) as string | undefined;
    let tilesetText = this.cache.text.get(`tileset_${tilesetIndex}`) as string | undefined;

    // If cache miss, synchronously fetch the files
    if (!tilemapText || !tilesetText) {
      const base = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname.replace(/\/[^/]*$/, '/') : '/';
      const tmPath = `${base}assets/tilemaps/LEVEL_${this.currentLevel}_TILEMAP.txt`;
      const tsPath = `${base}assets/tilesets/TILESET_${String(tilesetIndex).padStart(3, '0')}.TXT`;
      try {
        if (!tilemapText) tilemapText = document.location.protocol !== 'file:' ? syncFetchText(tmPath) : undefined;
        if (!tilesetText) tilesetText = document.location.protocol !== 'file:' ? syncFetchText(tsPath) : undefined;
      } catch (_) { /* ignore */ }
    }

    if (!tilemapText || !tilesetText) {
      console.warn(`[GameScene] Failed to load tilemap/tileset for level ${this.currentLevel}, using fallback.`);
      this.createFallbackLevel();
      return;
    }

    const parsedTilemap = parseTilemap(tilemapText, tilesetText);
    this.currentParsedTilemap = parsedTilemap;
    const tilesKey = `level_${parsedTilemap.tilesetIndex + 1}_tiles`;
    this.textures.get(tilesKey)?.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.worldWidth = parsedTilemap.width * TILE_SIZE;
    this.worldHeight = parsedTilemap.height * TILE_SIZE;

    // Background
    const bgKey = `background_level_${this.currentLevel}`;
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(this.worldWidth / 2, this.worldHeight / 2, bgKey);
      bg.setDisplaySize(this.worldWidth, this.worldHeight);
      bg.setDepth(-10);
      this.levelVisuals.push(bg);
    } else {
      const fallbackBg = this.add.rectangle(
        this.worldWidth / 2,
        this.worldHeight / 2,
        this.worldWidth,
        this.worldHeight,
        0x0a0a1a
      );
      fallbackBg.setDepth(-10);
      this.levelVisuals.push(fallbackBg);
    }

    const tilemap = this.make.tilemap({
      width: parsedTilemap.width,
      height: parsedTilemap.height,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE
    });
    const tileset = tilemap.addTilesetImage(tilesKey, tilesKey, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) {
      console.warn(`Failed to create tileset ${tilesKey}, using fallback arena.`);
      this.createFallbackLevel();
      return;
    }

    parsedTilemap.layers.forEach((layerData, layerIndex) => {
      const layer = tilemap.createBlankLayer(`level_layer_${layerIndex}`, tileset, 0, 0);
      if (!layer) return;

      for (let y = 0; y < parsedTilemap.height; y++) {
        for (let x = 0; x < parsedTilemap.width; x++) {
          const tileId = layerData[y * parsedTilemap.width + x];
          if (tileId > 0) {
            layer.putTileAt(tileId, x, y);
          }
        }
      }

      layer.setDepth(layerIndex + 1);
      layer.setCullPadding(1, 1);
      if (layerIndex === 1) {
        layer.setCollision(Array.from(parsedTilemap.solidTiles.values()));
        this.collisionLayer = layer;
      }
      this.tilemapLayers.push(layer);
      this.levelVisuals.push(layer);
    });

    this.worldCollisionMap = new WorldCollisionMap(parsedTilemap, TILE_SIZE);

    parsedTilemap.warpZones.forEach(warpZone => {
      // Keep warp mound as invisible physics collider (warpTubeSystem handles visuals)
      const mound = this.add.rectangle(
        warpZone.x,
        warpZone.y,
        WARP_MOUND_SIZE,
        WARP_MOUND_SIZE
      );
      mound.setVisible(false);
      this.physics.add.existing(mound, true);
      this.warpMounds.add(mound);

      this.warpTubeSystem.addWarpTube({
        x: warpZone.x,
        y: warpZone.y,
        width: WARP_MOUND_SIZE,
        height: WARP_MOUND_SIZE,
        direction: warpZone.script === 'WARP_ZONE_DOWN' ? 'down' : 'up'
      });
    });

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(Math.min(200, GAME_WIDTH - 80), 100);

    this.rebuildWorldColliders();
  }

  private createFallbackLevel(): void {
    this.worldWidth = GAME_WIDTH;
    this.worldHeight = GAME_HEIGHT;
    this.collisionLayer = null;
    this.worldCollisionMap = null;

    if (!this.warpMounds) {
      this.warpMounds = this.physics.add.staticGroup();
    } else {
      this.warpMounds.clear(true, true);
    }

    const bgKey = `background_level_${this.currentLevel}`;
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, bgKey);
      bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
      bg.setDepth(-10);
      this.levelVisuals.push(bg);
    } else {
      const fallbackBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a);
      fallbackBg.setDepth(-10);
      this.levelVisuals.push(fallbackBg);
    }

    const addTile = (tx: number, ty: number, frame: number) => {
      const tile = this.add.image(tx, ty, `level_${this.currentLevel}_tiles`, frame);
      tile.setDepth(1);
      this.levelVisuals.push(tile);

      const wall = this.add.rectangle(tx, ty, TILE_SIZE, TILE_SIZE);
      wall.setVisible(false);
      this.physics.add.existing(wall, true);
      this.walls.add(wall);
    };

    for (let x = 0; x < GAME_WIDTH; x += TILE_SIZE) {
      addTile(x + TILE_SIZE / 2, GAME_HEIGHT - TILE_SIZE / 2, 9);
      addTile(x + TILE_SIZE / 2, TILE_SIZE / 2, 9);
    }

    for (let y = TILE_SIZE; y < GAME_HEIGHT - TILE_SIZE; y += TILE_SIZE) {
      addTile(TILE_SIZE / 2, y + TILE_SIZE / 2, 9);
      addTile(GAME_WIDTH - TILE_SIZE / 2, y + TILE_SIZE / 2, 9);
    }

    const platforms = [
      { x: 120, y: 100, w: 80 },
      { x: 280, y: 140, w: 80 },
      { x: 440, y: 100, w: 80 },
      { x: 80, y: 200, w: 64 },
      { x: 200, y: 260, w: 96 },
      { x: 380, y: 220, w: 80 },
      { x: 500, y: 280, w: 80 },
    ];

    platforms.forEach(p => {
      for (let tx = 0; tx < p.w; tx += TILE_SIZE) {
        addTile(p.x + tx + TILE_SIZE / 2, p.y, 41);
      }
    });

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.rebuildWorldColliders();
  }

  private clearLevelVisuals(): void {
    this.levelVisuals.forEach(obj => obj.destroy());
    this.levelVisuals = [];
  }

  private getSpawnPosition(): { x: number; y: number } {
    const levelData = getLevelData(this.currentLevel);
    if (!levelData || levelData.startX.length === 0) {
      return { x: GAME_WIDTH / 2, y: 32 };
    }

    return {
      x: Phaser.Math.RND.pick(levelData.startX),
      y: levelData.startY
    };
  }

  private createPlayer(): void {
    const spawn = this.getSpawnPosition();

    // Create Wizball — frame size is 48×48 (from wizball[set][48][48][24][24].bmp)
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'wizball', 0);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // Circle collider centered in the 48×48 frame
    body.setCircle(COLLISION_RADIUS, (48 - COLLISION_RADIUS * 2) / 2, (48 - COLLISION_RADIUS * 2) / 2);
    body.setCollideWorldBounds(false);
    body.onWorldBounds = false;
    body.setBounce(0, 0); // We handle bounce ourselves
    body.setGravityY(0);  // We handle gravity ourselves
    body.setMaxVelocity(9999, 9999); // Don't let Arcade clamp our velocities
    body.moves = false;

    this.player.setDepth(10);
    this.playerXFixed = spawn.x * PRIVATE_SCALE;
    this.playerYFixed = spawn.y * PRIVATE_SCALE;
    body.updateFromGameObject();
  }

  private createCatellite(): void {
    this.catellite = this.physics.add.sprite(280, 150, 'catellite');
    this.catellite.setDisplaySize(24, 24);
    this.catellite.setVisible(false);
    const body = this.catellite.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 24);
    body.setCircle(12, 0, 0);
    body.setCollideWorldBounds(false);
    body.setGravityY(0);

    this.catelliteBubble = this.add.graphics();
    this.catelliteBubble.setDepth(9);
  }

  private createPaintSystem(): void {
    this.paintGroup = this.physics.add.group();

    // Create initial paint drops (one of each color)
    for (let i = 0; i < 3; i++) {
      this.spawnPaintDrop(i);
    }

    // Spawn new paint periodically
    this.time.addEvent({
      delay: 8000,
      callback: () => {
        const color = Math.floor(Math.random() * 3);
        this.spawnPaintDrop(color);
      },
      loop: true
    });
  }

  private spawnPaintDrop(color: number, spawnX?: number, spawnY?: number): void {
    const x = spawnX ?? (50 + Math.random() * Math.max(1, this.worldWidth - 100));
    const y = spawnY ?? 30;

    const paintKeys = ['paint_red', 'paint_green', 'paint_blue'];
    const sprite = this.physics.add.sprite(x, y, paintKeys[color]);
    sprite.setDepth(5);
    sprite.setDisplaySize(16, 16);

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(6, 2, 2);
    body.setCollideWorldBounds(false);
    body.setAllowGravity(true);
    body.setGravityY(120);
    body.setVelocity((Math.random() - 0.5) * 40, 0);
    body.setBounce(0.4, 0.3);

    (sprite as any).paintColor = color;

    this.paintGroup.add(sprite);
  }

  private setupCollisions(): void {
    // Player vs bonus pearls
    this.physics.add.overlap(this.player, this.bonusPearlGroup, this.collectBonusPearl, undefined, this);

    // Catellite vs paint drops (C++: paint collected by catellite)
    // Also player vs paint (fallback if no catellite)
    this.physics.add.overlap(this.catellite, this.paintGroup, this.collectPaint, undefined, this);
    this.physics.add.overlap(this.player, this.paintGroup, this.collectPaint, undefined, this);

    // Bullets vs enemies
    this.physics.add.overlap(this.bulletGroup, this.enemySystem.getEnemyGroup(), this.hitEnemy, undefined, this);

    // Enemy bullets vs player
    this.physics.add.overlap(
      this.player,
      this.enemySystem.getEnemyBulletGroup(),
      this.hitByEnemyBullet,
      undefined,
      this
    );

    // Special paintballs vs player (extra life, filth raid, etc.)
    this.physics.add.overlap(
      this.player,
      this.specialPaintballGroup,
      this.collectSpecialPaintball,
      undefined,
      this
    );

    // Player vs enemies (C++: destroys enemy and damages player)
    this.physics.add.overlap(
      this.player,
      this.enemySystem.getEnemyGroup(),
      this.playerCollideWithEnemy,
      undefined,
      this
    );

    // Catellite vs enemies (C++: catellite can be destroyed by enemy, unless INDESTRUCTACAT)
    this.physics.add.overlap(
      this.catellite,
      this.enemySystem.getEnemyGroup(),
      this.catelliteCollideWithEnemy,
      undefined,
      this
    );

    this.rebuildWorldColliders();
  }

  private spawnSpecialPaintball(x: number, y: number, type: SpecialPaintballType): void {
    const frameMap: Record<SpecialPaintballType, string> = {
      [SpecialPaintballType.EXTRA_LIFE]: 'special_paintball_pickup_extra_life',
      [SpecialPaintballType.FILTH_RAID]: 'special_paintball_pickup_filth_raid',
      [SpecialPaintballType.FREAKY_BITS]: 'special_paintball_pickup_freaky_bits',
      [SpecialPaintballType.INDESTRUCTACAT]: 'special_paintball_pickup_indestructacat',
      [SpecialPaintballType.MUTANT_CAT]: 'special_paintball_pickup_mutant_cat',
    };

    const frame = frameMap[type] || frameMap[SpecialPaintballType.EXTRA_LIFE];
    const sprite = this.physics.add.sprite(x, y, 'special_paintballs', frame);
    sprite.setDepth(12);
    sprite.setDisplaySize(32, 32);
    sprite.setBounce(0.5, 0.5);
    sprite.body.setCircle(12, 4, 4);
    (sprite as any).specialType = type;

    // Bobbing animation
    this.tweens.add({
      targets: sprite,
      y: sprite.y - 8,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.specialPaintballGroup.add(sprite);
  }

  private collectSpecialPaintball(_player: any, paintball: any): void {
    const sprite = paintball as Phaser.Physics.Arcade.Sprite;
    const type = (sprite as any).specialType as SpecialPaintballType;

    // Visual pickup effect
    this.tweens.add({
      targets: sprite,
      scale: 2,
      alpha: 0,
      duration: 200,
      onComplete: () => sprite.destroy()
    });

    switch (type) {
      case SpecialPaintballType.EXTRA_LIFE:
        this.lives++;
        if (this.cache.audio.exists('wizball_new_life_appear_sound')) {
          this.sound.play('wizball_new_life_appear_sound', { volume: 0.6 });
        }
        this.showExtraLifeText();
        break;

      case SpecialPaintballType.FILTH_RAID:
        // Filth Raid: temporarily boosts enemy spawn rate by setting fuzz counter
        // When it hits 0, spawn_fuzz is triggered. This effectively doubles spawn rate.
        // C++ sets passed_param_1 = 1 (1 enemy at a time, faster trigger)
        this.weaponCollection |= WeaponFlag.FILTH_RAID;
        if (this.cache.audio.exists('special_paintball_pickup_filth_raid')) {
          this.sound.play('special_paintball_pickup_filth_raid', { volume: 0.6 });
        }
        // Effect lasts ~20 seconds then wears off
        this.time.delayedCall(20000, () => {
          this.weaponCollection &= ~WeaponFlag.FILTH_RAID;
        });
        break;

      case SpecialPaintballType.FREAKY_BITS:
        // Freaky Bits: wizball becomes invulnerable and enemies drop bonus items
        // C++: spawn_entity (freakout_effect_manager) — screen warps + rapid fire
        this.weaponCollection |= WeaponFlag.FREAKY_BITS;
        if (this.cache.audio.exists('special_paintball_pickup_freaky_bits')) {
          this.sound.play('special_paintball_pickup_freaky_bits', { volume: 0.6 });
        }
        // Flash screen effect (colour cycling tint)
        this.cameras.main.flash(200, 255, 100, 255, false);
        // Freaky bits lasts 15 seconds
        this.time.delayedCall(15000, () => {
          this.weaponCollection &= ~WeaponFlag.FREAKY_BITS;
        });
        break;

      case SpecialPaintballType.INDESTRUCTACAT:
        // Indestructacat: catellite becomes invulnerable, cannot be lost
        // C++: set_global_flag (catellite_stored_health, 128)
        if (this.catellite) {
          this.weaponCollection |= WeaponFlag.CATELLITE_INVULNERABILITY;
          if (this.cache.audio.exists('special_paintball_pickup_indestructacat')) {
            this.sound.play('special_paintball_pickup_indestructacat', { volume: 0.6 });
          }
          // Visual: catellite glows/shields
          if (this.catelliteBubble) {
            this.catelliteBubble.setAlpha(0.9);
          }
        }
        break;

      case SpecialPaintballType.MUTANT_CAT:
        // Mutant Cat: catellite becomes aggressive and auto-fires at enemies
        // C++: set_global_flag (mutant_cat_flag, TRUE) — catellite ignores player control
        this.mutantCatelliteActive = true;
        this.weaponCollection |= WeaponFlag.MUTANT_CAT;
        if (this.cache.audio.exists('special_paintball_pickup_mutant_cat')) {
          this.sound.play('special_paintball_pickup_mutant_cat', { volume: 0.6 });
        }
        // Mutant cat is permanent until lost
        break;
    }
  }

  private showExtraLifeText(): void {
    const text = this.add.text(this.player.x, this.player.y - 40, '+1 UP', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#00ff00',
      stroke: '#000000',
      strokeThickness: 4
    });
    text.setDepth(100);
    text.setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: text.y - 50,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => text.destroy()
    });
  }

  private rebuildWorldColliders(): void {
    this.worldColliders.forEach(collider => collider.destroy());
    this.worldColliders = [];

    if (!this.paintGroup || !this.enemySystem) {
      return;
    }

    const worldTargets: Phaser.Physics.Arcade.StaticGroup[] = [this.walls];
    const includePlayerArcadeCollision = this.worldCollisionMap === null;

    worldTargets.forEach(target => {
      if (includePlayerArcadeCollision) {
        this.worldColliders.push(
          this.physics.add.collider(this.player, target, this.handleWallHit, undefined, this)
        );
      }
      this.worldColliders.push(
        this.physics.add.collider(this.paintGroup, target)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyGroup(), target)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.bulletGroup, target, this.handleBulletWallHit, undefined, this)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyBulletGroup(), target, this.handleBulletWallHit, undefined, this)
      );
    });

    if (this.collisionLayer) {
      if (includePlayerArcadeCollision) {
        this.worldColliders.push(
          this.physics.add.collider(this.player, this.collisionLayer, this.handleWallHit, undefined, this)
        );
      }
      this.worldColliders.push(
        this.physics.add.collider(this.paintGroup, this.collisionLayer)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyGroup(), this.collisionLayer)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.bulletGroup, this.collisionLayer, this.handleBulletWallHit, undefined, this)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyBulletGroup(), this.collisionLayer, this.handleBulletWallHit, undefined, this)
      );
    }
  }

  private handleWallHit(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.applyPlayerBounce(body.blocked.up, body.blocked.down, body.blocked.left, body.blocked.right);
  }

  private handleBulletWallHit(bullet: any, _wall: any): void {
    if (bullet.active) {
      if ((bullet as any)._isEnemyBullet) {
        this.enemySystem.releaseEnemyBullet(bullet as Phaser.Physics.Arcade.Sprite);
      } else {
        bullet.destroy();
      }
    }
  }

  private applyWeaponMovementStyle(): void {
    if ((this.weaponCollection & WeaponFlag.LATERAL_CONTROL) === 0) {
      this.movementStyle = MovementStyle.BASIC_BOUNCE;
    } else if ((this.weaponCollection & WeaponFlag.VERTICAL_CONTROL) === 0) {
      this.movementStyle = MovementStyle.CONTROLLED_BOUNCE;
    } else {
      this.movementStyle = MovementStyle.FULL_CONTROLLED;
    }
  }

  private spawnBonusPearl(x: number, y: number): void {
    const pearl = this.physics.add.sprite(x, y, 'pickup', 'pickup_0');
    pearl.setDepth(12);
    pearl.setDisplaySize(32, 32);

    const body = pearl.body as Phaser.Physics.Arcade.Body;
    body.setCircle(12, 4, 4);
    body.setAllowGravity(false);
    body.setVelocity(0, 0);

    this.tweens.add({
      targets: pearl,
      angle: 8,
      scaleX: 1.04,
      scaleY: 0.96,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.bonusPearlGroup.add(pearl);
  }

  private collectBonusPearl(_player: unknown, pearl: unknown): void {
    (pearl as Phaser.GameObjects.GameObject).destroy();
    this.currentPickupCount = this.currentPickupCount >= 7 ? 1 : this.currentPickupCount + 1;
    this.score += 100;

    if (this.cache.audio.exists('bonus_pearl_pickup')) {
      this.sound.play('bonus_pearl_pickup', { volume: 0.6 });
    }
  }

  private updateBonusSelectionWobble(): void {
    if (this.currentPickupCount === 0) {
      this.resetWobbleState();
      return;
    }

    // C++ also allows FIRE_2 (secondary fire) to trigger bonus selection
    if (this.inputManager.justDown('altFire')) {
      this.selectCurrentBonus();
      this.resetWobbleState();
      return;
    }

    // Use JustDown to detect single key presses (C++ IF_INPUT_PLAYER_CONTROL_HIT)
    const leftPressed = this.inputManager.justDown('moveLeft');
    const rightPressed = this.inputManager.justDown('moveRight');

    if (leftPressed) {
      if (this.wobbleNextDirection === WobbleDirection.EITHER || this.wobbleNextDirection === WobbleDirection.LEFT) {
        this.wobbleNextDirection = WobbleDirection.RIGHT;
        this.wobbleCounter++;
        this.wobbleResetCountdown = WIZBALL_WOBBLE_DELAY;
      } else {
        this.resetWobbleState();
      }
    }

    if (rightPressed) {
      if (this.wobbleNextDirection === WobbleDirection.EITHER || this.wobbleNextDirection === WobbleDirection.RIGHT) {
        this.wobbleNextDirection = WobbleDirection.LEFT;
        this.wobbleCounter++;
        this.wobbleResetCountdown = WIZBALL_WOBBLE_DELAY;
      } else {
        this.resetWobbleState();
      }
    }

    if (this.wobbleCounter >= WIZBALL_BONUS_SELECTION_WOBBLE_THRESHOLD) {
      this.selectCurrentBonus();
      this.resetWobbleState();
      return;
    }

    this.wobbleResetCountdown = Math.max(0, this.wobbleResetCountdown - 1);
    if (this.wobbleResetCountdown === 0) {
      this.resetWobbleState();
    }
  }

  private resetWobbleState(): void {
    this.wobbleResetCountdown = 0;
    this.wobbleCounter = 0;
    this.wobbleNextDirection = WobbleDirection.EITHER;
  }

  private selectCurrentBonus(): void {
    let applied = false;

    switch (this.currentPickupCount) {
      case 1:
        if ((this.weaponCollection & WeaponFlag.LATERAL_CONTROL) === 0) {
          this.weaponCollection |= WeaponFlag.LATERAL_CONTROL;
          applied = true;
        } else if ((this.weaponCollection & WeaponFlag.VERTICAL_CONTROL) === 0) {
          this.weaponCollection |= WeaponFlag.VERTICAL_CONTROL;
          applied = true;
        }
        break;
      case 2:
        if ((this.weaponCollection & WeaponFlag.SHIELD_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.SHIELD_FIRE;
          applied = true;
        } else if ((this.weaponCollection & WeaponFlag.REAR_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.REAR_FIRE;
          applied = true;
        }
        break;
      case 3:
        if ((this.weaponCollection & WeaponFlag.CATELLITE) === 0) {
          this.weaponCollection |= WeaponFlag.CATELLITE;
          this.catellite.setVisible(true);
          applied = true;
        }
        break;
      case 4:
        if ((this.weaponCollection & WeaponFlag.DOUBLE_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.DOUBLE_FIRE;
          applied = true;
        }
        break;
      case 5:
        if ((this.weaponCollection & WeaponFlag.WIZ_SPREAD_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.WIZ_SPREAD_FIRE;
          this.weaponCollection &= ~WeaponFlag.CAT_SPREAD_FIRE;
        } else {
          this.weaponCollection |= WeaponFlag.CAT_SPREAD_FIRE;
          this.weaponCollection &= ~WeaponFlag.WIZ_SPREAD_FIRE;
        }
        applied = true;
        break;
      case 6:
        this.triggerSmartBomb();
        applied = true;
        break;
      case 7:
        this.weaponCollection |= WeaponFlag.INVULNERABILITY;
        if ((this.weaponCollection & WeaponFlag.CATELLITE) !== 0) {
          this.weaponCollection |= WeaponFlag.CATELLITE_INVULNERABILITY;
          this.catelliteHasShield = true;
        }
        applied = true;
        break;
      default:
        break;
    }

    if (!applied) {
      return;
    }

    this.applyWeaponMovementStyle();
    this.currentPickupCount = 0;

    if (this.cache.audio.exists('bonus_selection')) {
      this.sound.play('bonus_selection', { volume: 0.6 });
    }
  }

  private triggerSmartBomb(): void {
    const enemies = this.enemySystem.getEnemyGroup().getChildren() as Phaser.Physics.Arcade.Sprite[];
    enemies.forEach(enemy => {
      if (!enemy.active) {
        return;
      }

      enemy.destroy();
      this.score += 100;
      this.enemiesKilledThisLevel++;
    });

    if (this.cache.audio.exists('smart_bomb')) {
      this.sound.play('smart_bomb', { volume: 0.7 });
    }

    this.handlePostEnemyRemoval();
  }

  private applyPlayerBounce(touchingUp: boolean, touchingDown: boolean, touchingLeft: boolean, touchingRight: boolean): void {

    if (touchingDown || touchingUp) {
      if (this.movementStyle !== MovementStyle.FULL_CONTROLLED) {
        // C++ bounce: snap x_vel to ideal, then recalculate y_vel from energy conservation
        // All calculations in fixed-point units (like C++)
        this.xVel = Math.trunc(this.idealXVel);

        // C++ engine reverses velocity BEFORE calling hit_floor_or_roof, so sgn(y_vel) gives bounce direction
        // In our code, velocity isn't reversed yet, so we use the opposite direction
        const bounceDirection = touchingDown ? -1 : 1;
        
        // C++ physics: s = (a*t^2)/2, so t = sqrt(2*s/a)
        // All in fixed-point units
        const startYFixed = WIZBALL_START_Y * PRIVATE_SCALE;
        const distanceFallenFixed = Math.abs(this.playerYFixed - startYFixed);  // fixed-point
        const sFixed = distanceFallenFixed * 2;  // fixed-point
        const gravFixed = WIZBALL_GRAVITY_STRENGTH;  // 48 in fixed-point (raw C++ value)
        
        // t = sqrt(2s/a) - all in fixed-point, result is frames
        const t = Math.sqrt(sFixed / gravFixed);
        
        // y_vel = a * t * bounceDirection
        let newYVel = Math.trunc(gravFixed * t) * bounceDirection;

        // Ensure minimum bounce speed (768 in fixed-point = 3 pixels)
        const minBounceFixed = 768;
        if (Math.abs(newYVel) < minBounceFixed) {
          newYVel = minBounceFixed * bounceDirection;
        }

        this.yVel = newYVel;
      } else {
        // Full controlled: simple reflect with minimum speed
        const absY = Math.abs(this.yVel);
        const minBounceFixed = 768;
        if (absY < minBounceFixed) {
          this.yVel = touchingDown ? -minBounceFixed : minBounceFixed;
        } else {
          this.yVel = -this.yVel;
        }
      }

      if (this.bounceSound && !this.bounceSound.isPlaying) {
        this.bounceSound.play();
      }
    }

    if (touchingLeft || touchingRight) {
      if (this.movementStyle === MovementStyle.BASIC_BOUNCE) {
        // C++: if ideal and actual velocity have opposite signs, reflect ideal
        // Both are in fixed-point for comparison
        const idealFixed = Math.trunc(this.idealXVel);
        const product = idealFixed * this.xVel;
        
        if (product < 0) {
          this.xVel = -idealFixed;
          this.idealXVel = this.xVel;
        } else {
          this.xVel = idealFixed;
        }
      } else {
        // Controlled/full: reflect with minimum speed
        const absX = Math.abs(this.xVel);
        const minBounceFixed = 512;  // 2 pixels in fixed-point
        if (absX < minBounceFixed) {
          this.xVel = touchingLeft ? minBounceFixed : -minBounceFixed;
        } else {
          this.xVel = -this.xVel;
        }
        this.idealXVel = this.xVel;
      }

      if (this.bounceSound && !this.bounceSound.isPlaying) {
        this.bounceSound.play();
      }
    }
  }

  private collectPaint(_player: any, paint: any): void {
    const paintSprite = paint as Phaser.Physics.Arcade.Sprite;
    const color = (paintSprite as any).paintColor || 0;

    this.paintColor = color;
    this.hasPaint = true;

    // Visual feedback
    this.tweens.add({
      targets: paint,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 200,
      onComplete: () => paint.destroy()
    });

    // Update HUD paint indicator
    this.paintIndicator.fillColor = PAINT_FRAME_COLORS[color];
    this.paintIndicator.setAlpha(1);

    this.pickupSound.play();
  }

  private fireBullet(): void {
    // fireCooldown and input checks are now handled in update() to match C++ pattern
    // This function only handles actual bullet spawning

    const hasDouble = (this.weaponCollection & WeaponFlag.DOUBLE_FIRE) !== 0;
    const hasSpread = (this.weaponCollection & WeaponFlag.WIZ_SPREAD_FIRE) !== 0;
    const hasRearFire = (this.weaponCollection & WeaponFlag.REAR_FIRE) !== 0;
    const hasCatellite = (this.weaponCollection & WeaponFlag.CATELLITE) !== 0 && this.catellite.visible;

    // Determine fire rate based on weapon type
    if (hasSpread) {
      this.fireCooldown = SPREAD_FIRE_RATE;
    } else if (hasDouble) {
      this.fireCooldown = DOUBLE_FIRE_RATE;
    } else {
      this.fireCooldown = NORMAL_FIRE_RATE;
    }

    const dir = this.lastMovementDirection;
    const paintTint = this.hasPaint ? PAINT_FRAME_COLORS[this.paintColor] : undefined;

    if (hasSpread) {
      // C++ spread fire: 3 bullets at angles
      this.spawnBullet(this.player.x + dir * 8, this.player.y, dir * BULLET_SPEED, 0, paintTint);
      this.spawnBullet(this.player.x + dir * 8, this.player.y, dir * BULLET_SPEED, -BULLET_SPEED * 0.2, paintTint);
      this.spawnBullet(this.player.x + dir * 8, this.player.y, dir * BULLET_SPEED, BULLET_SPEED * 0.2, paintTint);
    } else if (hasDouble) {
      // Double fire: 2 bullets stacked
      this.spawnBullet(this.player.x + dir * 8, this.player.y - 6, dir * BULLET_SPEED, 0, paintTint);
      this.spawnBullet(this.player.x + dir * 8, this.player.y + 6, dir * BULLET_SPEED, 0, paintTint);
    } else {
      // Normal fire: single bullet
      this.spawnBullet(this.player.x + dir * 8, this.player.y, dir * BULLET_SPEED, 0, paintTint);
    }

    // C++ rear fire: alternates direction each shot
    if (hasRearFire) {
      this.rearFireToggle = !this.rearFireToggle;
      const rearDir = -dir;
      this.spawnBullet(this.player.x + rearDir * 8, this.player.y, rearDir * BULLET_SPEED, 0, paintTint);
    }

    this.fireSound.play();

    if (this.hasPaint) {
      this.hasPaint = false;
      this.paintIndicator.setAlpha(0.3);
    }

    if (hasCatellite) {
      this.fireCatelliteBullet();
    }
  }

  private spawnBullet(x: number, y: number, vx: number, vy: number, paintTint?: number): void {
    // Normal bullets use bullets_1 frame (48x8 horizontal bullet per C++ wizball_normal_bullet.txt)
    const bullet = this.physics.add.sprite(x, y, 'bullets', 'bullets_1');
    bullet.setDepth(8);
    bullet.setDisplaySize(48, 8);

    if (paintTint !== undefined) {
      bullet.setTint(paintTint);
    }

    (bullet as any).isPaintBullet = paintTint !== undefined;
    (bullet as any).paintColor = this.paintColor;
    (bullet as any).active = true;

    // Use BULLET_SPEED constant (720 px/s = C++ value), direction from vx
    const velX = vx > 0 ? BULLET_SPEED : (vx < 0 ? -BULLET_SPEED : 0);
    bullet.setVelocity(velX, vy);

    this.bulletGroup.add(bullet);
  }

  private fireCatelliteBullet(): void {
    const dir = this.lastMovementDirection;
    const hasCatSpread = (this.weaponCollection & WeaponFlag.CAT_SPREAD_FIRE) !== 0;

    if (hasCatSpread) {
      // Catellite spread fire: 3 bullets
      this.spawnCatBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, 0);
      this.spawnCatBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, -BULLET_SPEED * 0.2);
      this.spawnCatBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, BULLET_SPEED * 0.2);
    } else {
      this.spawnCatBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, 0);
    }
  }

  private spawnCatBullet(x: number, y: number, vx: number, vy: number): void {
    const bullet = this.physics.add.sprite(x, y, 'bullets', 'bullets_4');
    bullet.setDepth(8);
    bullet.setDisplaySize(24, 8);
    bullet.setTint(0x88aaff);
    bullet.setVelocity(vx, vy);

    (bullet as any).isPaintBullet = false;
    (bullet as any).paintColor = undefined;

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 8);

    this.bulletGroup.add(bullet);
  }

  private createHUD(): void {
    this.hudText = this.add.text(10, 10, 'WIZBALL  Lives: 2', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 8, y: 4 }
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(100);

    this.add.text(GAME_WIDTH - 100, 10, 'PAINT:', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setDepth(100).setScrollFactor(0);

    this.paintIndicator = this.add.rectangle(GAME_WIDTH - 40, 18, 24, 16, 0x666666);
    this.paintIndicator.setDepth(100);
    this.paintIndicator.setScrollFactor(0);
    this.paintIndicator.setAlpha(0.3);

    this.add.text(10, GAME_HEIGHT - 20, 'ARROWS: Move  SPACE: Fire  WIGGLE L/R: Use top bonus', {
      fontSize: '10px',
      color: '#888888',
      fontFamily: 'monospace'
    }).setDepth(100).setScrollFactor(0);

    // Initialize HUD system
    const initialState: HUDState = {
      score: this.score,
      lives: this.lives,
      cauldronFill: this.cauldronFill,
      currentPaintColor: this.paintColor,
      hasPaint: this.hasPaint,
      hasCatellite: (this.weaponCollection & WeaponFlag.CATELLITE) !== 0,
      catelliteHasShield: this.catelliteHasShield,
      currentLevel: this.currentLevel
    };
    this.hudSystem = new HUDSystem(this, initialState);

    // Add mode switch keys for testing
  }

  private updateMovement(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Track last movement direction
    if (this.movementStyle === MovementStyle.FULL_CONTROLLED) {
      if (this.xVel < 0) this.lastMovementDirection = -1;
      else if (this.xVel > 0) this.lastMovementDirection = 1;
    } else {
      if (this.idealXVel < 0) this.lastMovementDirection = -1;
      else if (this.idealXVel > 0) this.lastMovementDirection = 1;
    }

    // Handle input based on movement style
    switch (this.movementStyle) {
      case MovementStyle.BASIC_BOUNCE:
        this.updateBasicMovement();
        break;
      case MovementStyle.CONTROLLED_BOUNCE:
        this.updateControlledMovement();
        break;
      case MovementStyle.FULL_CONTROLLED:
        this.updateFullControlled();
        break;
    }

    // C++ top_private_vel = WIZBALL_MAX_PIXEL_X_VEL << Bitshift = 3 << 8 = 768
    // Used for both X and Y clamping in full_controlled mode
    const topPrivateVel = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE; // 768

    // Clamp velocities - C++ uses top_private_vel (768) for both axes
    const maxX = topPrivateVel;
    const maxY = topPrivateVel;
    this.xVel = Phaser.Math.Clamp(this.xVel, -maxX, maxX);
    this.yVel = Phaser.Math.Clamp(this.yVel, -maxY, maxY);

    // CRITICAL: disable arcade physics BEFORE custom physics update runs
    // Otherwise arcade physics applies its own velocity on top of the custom physics
    body.moves = false;

    if (this.worldCollisionMap) {
      const moved = this.worldCollisionMap.moveEntity(
        {
          worldX: this.playerXFixed >> BITSHIFT,
          worldY: this.playerYFixed >> BITSHIFT,
          upperWorldWidth: WORLD_COLLISION_UPPER,
          lowerWorldWidth: WORLD_COLLISION_LOWER,
          upperWorldHeight: WORLD_COLLISION_UPPER,
          lowerWorldHeight: WORLD_COLLISION_LOWER,
          worldCollisionLayer: PLAYER_WORLD_COLLISION_LAYER,
          worldCollisionBitmask: WORLD_BITMASK_PLAYER_COLLIDES,
          worldCollisionBehaviour: PLAYER_WORLD_COLLISION_BEHAVIOUR
        },
        this.playerXFixed,
        this.playerYFixed,
        this.xVel,
        this.yVel
      );

      this.playerXFixed = moved.xFixed;
      this.playerYFixed = moved.yFixed;
      this.player.setPosition(this.playerXFixed / PRIVATE_SCALE, this.playerYFixed / PRIVATE_SCALE);
      body.updateFromGameObject();

      if (moved.result.hitUp || moved.result.hitDown || moved.result.hitLeft || moved.result.hitRight) {
        this.applyPlayerBounce(
          moved.result.hitUp,
          moved.result.hitDown,
          moved.result.hitLeft,
          moved.result.hitRight
        );
      }
    } else {
      // Arcade physics fallback - re-enable so physics handles movement and collisions
      body.moves = true;
      body.setVelocity(
        this.xVel / PRIVATE_SCALE,
        this.yVel / PRIVATE_SCALE
      );
    }

    // Update spin animation
    this.updateSpin();
  }

  private updateBasicMovement(): void {
    // C++ basic_bounce: ideal_x_vel is in fixed-point (0-768), input adds 64 per frame
    const maxVel = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE; // 768

    if (this.inputManager.isDown('moveRight')) {
      this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, maxVel);
    }
    if (this.inputManager.isDown('moveLeft')) {
      this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -maxVel);
    }

    // C++ applies gravity as y_acc = 48 (raw fixed-point) each frame in non-full-controlled modes
    this.yVel += WIZBALL_GRAVITY_STRENGTH;
  }

  private updateControlledMovement(): void {
    const maxVel = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE; // 768

    if (this.inputManager.isDown('moveRight')) {
      this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, maxVel);
    }
    if (this.inputManager.isDown('moveLeft')) {
      this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -maxVel);
    }

    // C++ controlled_bounce: x_vel = ideal_x_vel (both in fixed-point)
    this.xVel = this.idealXVel;

    // C++ applies gravity in controlled bounce mode too
    this.yVel += WIZBALL_GRAVITY_STRENGTH;
  }

  private updateFullControlled(): void {
    const topPrivateVel = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE; // 768

    // X movement - C++ has TWO SEPARATE IF BLOCKS that BOTH run each frame
    // First block: RIGHT handling
    if (this.inputManager.isDown('moveRight')) {
      this.xVel = Math.min(this.xVel + WIZBALL_X_RESPONSIVENESS, topPrivateVel);
    } else {
      if (this.inputManager.isDown('moveLeft')) {
        // x_vel = x_vel (do nothing)
      } else {
        if (this.xVel > 0) {
          this.xVel = Math.max(this.xVel - WIZBALL_X_DAMPING, 0);
        }
      }
    }

    // Second block: LEFT handling
    if (this.inputManager.isDown('moveLeft')) {
      this.xVel = Math.max(this.xVel - WIZBALL_X_RESPONSIVENESS, -topPrivateVel);
    } else {
      if (this.inputManager.isDown('moveRight')) {
        // x_vel = x_vel (do nothing)
      } else {
        if (this.xVel < 0) {
          this.xVel = Math.min(this.xVel + WIZBALL_X_DAMPING, 0);
        }
      }
    }

    // Y movement - C++ has TWO SEPARATE IF BLOCKS that BOTH run each frame
    // First block: DOWN handling
    if (this.inputManager.isDown('moveDown')) {
      this.yVel = Math.min(this.yVel + WIZBALL_Y_RESPONSIVENESS, topPrivateVel);
    } else {
      if (this.yVel > 0) {
        this.yVel = Math.max(this.yVel - WIZBALL_Y_DAMPING, 0);
      }
    }

    // Second block: UP handling
    if (this.inputManager.isDown('moveUp')) {
      this.yVel = Math.max(this.yVel - WIZBALL_Y_RESPONSIVENESS, -topPrivateVel);
    } else {
      if (this.yVel < 0) {
        this.yVel = Math.min(this.yVel + WIZBALL_Y_DAMPING, 0);
      }
    }

    // C++ full_controlled: ideal_x_vel = x_vel (sync for spin)
    this.idealXVel = this.xVel;

    // No gravity in full controlled mode
  }

  private updateSpin(): void {
    // C++ spin: spin_angle += ideal_x_vel (fixed-point) clamped to [0, top_spin_angle]
    // In basic/controlled modes, spin is driven by ideal_x_vel
    // In full_controlled mode, spin is driven by x_vel
    const velocityForSpin = this.movementStyle === MovementStyle.FULL_CONTROLLED
      ? this.xVel
      : this.idealXVel;

    this.spinAngle += velocityForSpin;

    // Wrap angle
    while (this.spinAngle < 0) this.spinAngle += this.topSpinAngle;
    while (this.spinAngle >= this.topSpinAngle) this.spinAngle -= this.topSpinAngle;

    // Convert to animation frame
    const frame = Math.floor(this.spinAngle / this.spinAngleToFrameDivider) % WIZBALL_FRAME_COUNT;
    this.player.setFrame(frame);
  }

  private updateCatellite(): void {
    if (!(this.weaponCollection & WeaponFlag.CATELLITE)) {
      this.catellite.setVisible(false);
      this.catelliteBubble.clear();
      return;
    }

    this.catellite.setVisible(true);

    if (this.catelliteFireCooldown > 0) {
      this.catelliteFireCooldown--;
    }

    // Store previous Y position for lag effect (C++ uses 10-frame buffer)
    this.catellitePreviousYPositions.push(this.player.y);
    if (this.catellitePreviousYPositions.length > 10) {
      this.catellitePreviousYPositions.shift();
    }

    // Track player movement direction for control threshold
    const isMoving = Math.abs(this.xVel) > 100 || Math.abs(this.yVel) > 100;
    if (isMoving) {
      this.catelliteControlCounter = CATELLITE_CONTROL_THRESHOLD;
    } else {
      this.catelliteControlCounter--;
    }

    // Determine if Catellite is in player control
    // Mutant Cat: catellite ignores player control and auto-attacks enemies
    this.catelliteIsPlayerControlled = this.catelliteControlCounter > 0 && !this.mutantCatelliteActive;

    // C++ catellite target: 64px behind wizball on the horizontal axis
    const catelliteHorizontalLagDistance = 64;
    const catelliteCloseHorizontalLagDistance = 24;
    const controlledSpeed = CATELLITE_CONTROLLED_HORIZONTAL_SPEED; // 6 px/frame
    const followingSpeed = CATELLITE_FOLLOWING_HORIZONTAL_SPEED; // 4 px/frame

    if (this.catelliteIsPlayerControlled) {
      // Player controlled mode - direct movement with D-pad
      let cvx = 0;
      let cvy = 0;

      if (this.inputManager.isDown('moveLeft')) {
        cvx = -controlledSpeed;
      }
      if (this.inputManager.isDown('moveRight')) {
        cvx = controlledSpeed;
      }
      if (this.inputManager.isDown('moveUp')) {
        cvy = -controlledSpeed;
      }
      if (this.inputManager.isDown('moveDown')) {
        cvy = controlledSpeed;
      }

      // C++: if no input, move toward target position instead
      if (cvx === 0 && cvy === 0) {
        const targetX = this.player.x + (this.xVel < 0 ? 1 : this.xVel > 0 ? -1 : this.lastMovementDirection) * -catelliteHorizontalLagDistance;
        const targetY = this.catellitePreviousYPositions[0] ?? this.player.y;
        cvx = Phaser.Math.Clamp(targetX - this.catellite.x, -controlledSpeed, controlledSpeed);
        cvy = Phaser.Math.Clamp(targetY - this.catellite.y, -CATELLITE_CONTROLLED_VERTICAL_SPEED, CATELLITE_CONTROLLED_VERTICAL_SPEED);
      }

      this.catellite.x += cvx;
      this.catellite.y += cvy;
    } else {
      // Following mode - trail behind wizball (C++ catellite.txt)
      // Determine which side of wizball to follow
      const wizballSide = this.xVel < 0 ? 1 : this.xVel > 0 ? -1 : -this.lastMovementDirection;
      let targetX = this.player.x + wizballSide * catelliteHorizontalLagDistance;
      const targetY = this.catellitePreviousYPositions[0] ?? this.player.y;

      // Mutant Cat: hunt toward nearest enemy instead of trailing
      if (this.mutantCatelliteActive) {
        const nearestEnemy = this.enemySystem.getNearestEnemy(this.catellite.x, this.catellite.y);
        if (nearestEnemy) {
          targetX = nearestEnemy.x;
          // C++ mutant cat: random Y offset from wizball
          const mutantTargetY = 24 + Math.random() * 320;
          // Auto-fire at nearest enemy while mutant is active
          if (this.catelliteFireCooldown <= 0) {
            const dx2 = nearestEnemy.x - this.catellite.x;
            const dy2 = nearestEnemy.y - this.catellite.y;
            const distance = Math.max(1, Math.hypot(dx2, dy2));

            this.spawnCatBullet(
              this.catellite.x,
              this.catellite.y,
              (dx2 / distance) * BULLET_SPEED,
              (dy2 / distance) * BULLET_SPEED
            );
            this.catelliteFireCooldown = NORMAL_FIRE_RATE * 2; // C++: catellite_firing_rate * 2
          }
        }
      }

      // C++ following state logic:
      // Returning state (far from target): clamp both axes to controlledSpeed (6)
      // Following state (at target): clamp horizontal to followingSpeed (4), vertical unclamped
      const dx = targetX - this.catellite.x;
      const dy = targetY - this.catellite.y;

      // Check if at target (C++ checks exact position match)
      const isAtTarget = Math.abs(dx) < 1 && Math.abs(dy) < 1;

      if (!isAtTarget) {
        // Returning to wizball's side - faster speed, both axes clamped
        this.catellite.x += Phaser.Math.Clamp(dx, -controlledSpeed, controlledSpeed);
        this.catellite.y += Phaser.Math.Clamp(dy, -CATELLITE_CONTROLLED_VERTICAL_SPEED, CATELLITE_CONTROLLED_VERTICAL_SPEED);
      } else {
        // Already at heel - slower horizontal, instant vertical tracking
        this.catellite.x += Phaser.Math.Clamp(dx, -followingSpeed, followingSpeed);
        this.catellite.y += dy; // C++: no clamp on vertical in following state
      }
    }

    // Clamp catellite to world bounds
    this.catellite.x = Phaser.Math.Clamp(this.catellite.x, 32, this.worldWidth - 32);
    this.catellite.y = Phaser.Math.Clamp(this.catellite.y, 32, this.worldHeight - 32);

    // Update the physics body position
    const body = this.catellite.body as Phaser.Physics.Arcade.Body;
    body.reset(this.catellite.x, this.catellite.y);

    // Update shield bubble visual
    if (this.catelliteHasShield) {
      this.catelliteBubble.clear();
      this.catelliteBubble.lineStyle(2, 0x88ccff);
      this.catelliteBubble.strokeCircle(this.catellite.x, this.catellite.y, 18);
      this.catelliteBubble.lineStyle(1, 0xaaddff);
      this.catelliteBubble.strokeCircle(this.catellite.x, this.catellite.y, 14);
    } else {
      this.catelliteBubble.clear();
    }
  }

  private updateHUD(): void {
    const style = ['BASIC', 'CTRL', 'FULL'][this.movementStyle];
    const paint = this.hasPaint ? PAINT_COLORS[this.paintColor] : '---';

    this.hudText.setText(
      `WIZBALL  Score:${this.score}  Lives:${this.lives}  Mode:${style}  Paint:${paint}`
    );

    // Update HUD system
    this.hudSystem.setState({
      score: this.score,
      lives: this.lives,
      cauldronFill: this.cauldronFill,
      currentPaintColor: this.paintColor,
      hasPaint: this.hasPaint,
      hasCatellite: (this.weaponCollection & WeaponFlag.CATELLITE) !== 0,
      catelliteHasShield: this.catelliteHasShield,
      currentLevel: this.currentLevel
    });

    this.cauldronSystem.setFillLevels(this.cauldronFill);
    this.bonusSelectionPanel.update(this.weaponCollection, this.currentPickupCount);
  }

  /**
   * Get tile properties at a world position from the current parsed tilemap.
   * Returns null if no tilemap or position is out of bounds.
   */
  private getTilePropertiesAt(worldX: number, worldY: number, layer: number = 1): TileDefinition | null {
    if (!this.currentParsedTilemap) return null;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    if (tileX < 0 || tileX >= this.currentParsedTilemap.width ||
        tileY < 0 || tileY >= this.currentParsedTilemap.height) {
      return null;
    }

    const tileId = this.currentParsedTilemap.layers[layer]?.[tileY * this.currentParsedTilemap.width + tileX] ?? 0;
    if (tileId === 0) return null;

    return this.currentParsedTilemap.tileDefinitions[tileId] ?? null;
  }

  /**
   * Check tile effects at the player's position and apply them.
   * Handles: deadly tiles, conveyor belts, acceleration zones, water.
   */
  private checkTileEffects(): void {
    const playerWorldX = this.playerXFixed >> BITSHIFT;
    const playerWorldY = this.playerYFixed >> BITSHIFT;

    // Check the tile the player's center is on
    const tile = this.getTilePropertiesAt(playerWorldX, playerWorldY);
    if (!tile) return;

    const props = tile.booleanProperties;

    // Deadly tiles kill the player
    if ((props & BOOL_DEADLY) !== 0 || (props & BOOL_HARMFUL) !== 0) {
      if ((this.weaponCollection & WeaponFlag.INVULNERABILITY) === 0) {
        this.lives--;
        if (this.lives <= 0) {
          this.scene.start('GameOver', { score: this.score, level: this.currentLevel, weaponCollection: this.weaponCollection, lives: this.lives });
        } else {
          // Respawn at start
          const spawn = this.getSpawnPosition();
          this.player.setPosition(spawn.x, spawn.y);
          this.playerXFixed = spawn.x * PRIVATE_SCALE;
          this.playerYFixed = spawn.y * PRIVATE_SCALE;
          this.xVel = 0;
          this.yVel = 2 * PRIVATE_SCALE;
          this.idealXVel = 0;
        }
        return;
      }
    }

    // Conveyor belt tiles push the player
    if ((props & BOOL_CONVEY) !== 0) {
      this.xVel += tile.conveyX;
      this.yVel += tile.conveyY;
    }

    // Acceleration tiles (slopes, force fields)
    if ((props & BOOL_ACCELLERATE) !== 0) {
      this.xVel += tile.accelX;
      this.yVel += tile.accelY;
    }

    // Water tiles apply drag/friction
    if ((props & BOOL_WATER) !== 0) {
      this.xVel = Math.trunc(this.xVel * 0.95);
      this.yVel = Math.trunc(this.yVel * 0.95);
    }
  }

  private cleanupPaintDrops(): void {
    this.paintGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const sprite = child as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > this.worldHeight + 30 || sprite.x < -30 || sprite.x > this.worldWidth + 30) {
        sprite.destroy();
      }
      return true;
    });
  }

  private checkBulletCollisions(): void {
    // Bullet-enemy collision is now handled by physics overlap in setupCollisions()
    // This method only handles cleanup of out-of-bounds bullets
    this.bulletGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return true;
      
      // Check vs world collision (simple bounds check)
      if (bullet.x < -50 || bullet.x > this.worldWidth + 50 || 
          bullet.y < -50 || bullet.y > this.worldHeight + 50) {
        bullet.destroy();
        return true;
      }
      
      return true;
    });
  }

  update(): void {
    // Pause
    if (this.inputManager.justDown('pause')) {
      this.scene.pause(GAME);
      this.scene.launch(PAUSE);
      return;
    }

    this.checkBulletCollisions();

    // C++ pattern: check fire_delay_counter FIRST, then handle input based on catellite presence
    if (this.fireCooldown > 0) {
      this.fireCooldown--;
    } else {
      const hasCatellite = (this.weaponCollection & WeaponFlag.CATELLITE) !== 0 && this.catellite.visible;
      const firePressed = this.inputManager.justDown('fire') || this.inputManager.justDown('altFire');
      const fireHeld = this.inputManager.isDown('fire') || this.inputManager.isDown('altFire');
      
      if (!hasCatellite) {
        // Without catellite: fire once per key press (HIT = JustDown)
        if (firePressed) {
          this.fireBullet();
        }
      } else {
        // With catellite: auto-fire while held down (DOWN = isDown)
        if (fireHeld) {
          this.fireBullet();
        }
      }
    }

    this.updateBonusSelectionWobble();
    this.updateMovement();
    this.checkTileEffects();
    this.updateCatellite();
    this.enemySystem.update();
    this.warpTubeSystem.update();
    this.warpTubeSystem.checkWarp(this.player);
    this.updateHUD();
    this.cleanupPaintDrops();

    // Must be last — stores previous frame's button state for justDown detection
    this.inputManager.update();
  }

  shutdown(): void {
    this.inputManager?.destroy();
  }
}
