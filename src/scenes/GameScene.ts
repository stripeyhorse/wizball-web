import Phaser from 'phaser';
import { GAME } from '../types/game';

// Wizball constants from C++ code (fixed point math, scaled by 256)
const WIZBALL_RADIUS = 24;
const COLLISION_RADIUS = 20; // Tighter to visual
const WIZBALL_MAX_PIXEL_X_VEL = 3;
const WIZBALL_X_RESPONSIVENESS = 64 / 256;
const WIZBALL_GRAVITY_STRENGTH = 48 / 256;
const WIZBALL_MINIMUM_HORIZONTAL_BOUNCE_SPEED = 512 / 256;
const WIZBALL_MINIMUM_VERTICAL_BOUNCE_SPEED = 768 / 256;
const WIZBALL_FRAME_COUNT = 64;
const TWO_PI_PERCENT = 62831 / 10000;

const BITSHIFT = 8;
const PRIVATE_SCALE = 1 << BITSHIFT; // 256

const GAME_WIDTH = 640;
const GAME_HEIGHT = 368;
const TILE_SIZE = 16;

// Weapon bitflags (used for pickups)
const CATELLITE_BITFLAG = 16;

// Paint colors
const PAINT_COLORS = ['RED', 'GREEN', 'BLUE'];
const PAINT_FRAME_COLORS = [0xff0000, 0x00ff00, 0x0000ff];

enum MovementStyle {
  BASIC_BOUNCE = 0,
  CONTROLLED_BOUNCE = 1,
  FULL_CONTROLLED = 2
}

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;

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

  // Game objects
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private paintGroup!: Phaser.Physics.Arcade.Group;
  private bulletGroup!: Phaser.Physics.Arcade.Group;
  private catellite!: Phaser.Physics.Arcade.Sprite;

  // Game state
  private lives: number = 3;
  private paintColor: number = 0;
  private hasPaint: boolean = false;
  private fireCooldown: number = 0;

  // HUD
  private hudText!: Phaser.GameObjects.Text;
  private paintIndicator!: Phaser.GameObjects.Rectangle;

  // Sounds
  private bounceSound!: Phaser.Sound.BaseSound;
  private fireSound!: Phaser.Sound.BaseSound;
  private pickupSound!: Phaser.Sound.BaseSound;

  constructor() {
    super({ key: GAME });
  }

  create(): void {
    // Calculate spin constants based on circumference
    const circumference = WIZBALL_RADIUS * TWO_PI_PERCENT;
    this.topSpinAngle = circumference * PRIVATE_SCALE;
    this.spinAngleToFrameDivider = this.topSpinAngle / WIZBALL_FRAME_COUNT;

    // Create sounds
    this.bounceSound = this.sound.add('bounce', { volume: 0.5 });
    this.fireSound = this.sound.add('fire', { volume: 0.4 });
    this.pickupSound = this.sound.add('pickup', { volume: 0.6 });

    // Build the level
    this.createLevel();

    // Create player
    this.createPlayer();

    // Create catellite (follower)
    this.createCatellite();

    // Create paint drops
    this.createPaintSystem();

    // Create bullet group
    this.bulletGroup = this.physics.add.group();

    // Setup input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Setup collisions
    this.setupCollisions();

    // Create HUD
    this.createHUD();

    // Initial velocity - give a meaningful downward push to start bouncing
    this.yVel = 2 * PRIVATE_SCALE;
  }

  private createLevel(): void {
    this.walls = this.physics.add.staticGroup();

    // Background
    if (this.textures.exists('background')) {
      const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'background');
      bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
      bg.setDepth(-10);
    } else {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a)
        .setDepth(-10);
    }

    // Helper: add a visible tile image + invisible static physics rect
    const addTile = (tx: number, ty: number, frame: number) => {
      this.add.image(tx, ty, 'tiles', frame).setDepth(-5);
      const r = this.add.rectangle(tx, ty, TILE_SIZE, TILE_SIZE).setAlpha(0);
      this.walls.add(r);
    };

    // Floor (at bottom)
    for (let x = 0; x < GAME_WIDTH; x += TILE_SIZE) {
      addTile(x + TILE_SIZE / 2, GAME_HEIGHT - TILE_SIZE / 2, 9);
    }

    // Ceiling (at top)
    for (let x = 0; x < GAME_WIDTH; x += TILE_SIZE) {
      addTile(x + TILE_SIZE / 2, TILE_SIZE / 2, 9);
    }

    // Left wall
    for (let y = TILE_SIZE; y < GAME_HEIGHT - TILE_SIZE; y += TILE_SIZE) {
      addTile(TILE_SIZE / 2, y + TILE_SIZE / 2, 9);
    }

    // Right wall
    for (let y = TILE_SIZE; y < GAME_HEIGHT - TILE_SIZE; y += TILE_SIZE) {
      addTile(GAME_WIDTH - TILE_SIZE / 2, y + TILE_SIZE / 2, 9);
    }

    // Platforms
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
  }

  private createPlayer(): void {
    // Create Wizball — frame size is 48×48 (from wizball[set][48][48][24][24].bmp)
    this.player = this.physics.add.sprite(320, 100, 'wizball', 0);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // Circle collider centered in the 48×48 frame
    body.setCircle(COLLISION_RADIUS, (48 - COLLISION_RADIUS * 2) / 2, (48 - COLLISION_RADIUS * 2) / 2);
    body.setCollideWorldBounds(false);
    body.setBounce(0, 0); // We handle bounce ourselves
    body.setGravityY(0);  // We handle gravity ourselves
    body.setMaxVelocity(9999, 9999); // Don't let Arcade clamp our velocities

    this.player.setDepth(10);
  }

  private createCatellite(): void {
    // Catellite — loaded as plain image (arb atlas); frame 0 is 24×24
    this.catellite = this.physics.add.sprite(280, 150, 'catellite');
    this.catellite.setDisplaySize(24, 24);
    this.catellite.setVisible(false);
    const body = this.catellite.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 24);
    body.setCircle(12, 0, 0);
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

  private spawnPaintDrop(color: number): void {
    const x = 50 + Math.random() * (GAME_WIDTH - 100);
    const y = 30; // Just below ceiling

    // Generated 16×16 canvas textures: paint_red, paint_green, paint_blue
    const paintKeys = ['paint_red', 'paint_green', 'paint_blue'];
    const sprite = this.physics.add.sprite(x, y, paintKeys[color]);
    sprite.setDepth(5);

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(6, 2, 2);
    body.setCollideWorldBounds(false);
    // Give paint drops actual gravity so they fall
    body.setGravityY(120);
    // Slight horizontal drift
    body.setVelocity((Math.random() - 0.5) * 40, 0);
    body.setBounce(0.4, 0.3);

    // Store color on the sprite
    (sprite as any).paintColor = color;

    this.paintGroup.add(sprite);
  }

  private setupCollisions(): void {
    // Player vs walls — use process callback to detect side, but let Arcade separate
    this.physics.add.collider(this.player, this.walls, this.handleWallHit, undefined, this);

    // Player vs paint drops
    this.physics.add.overlap(this.player, this.paintGroup, this.collectPaint, undefined, this);

    // Paint vs walls (they should bounce)
    this.physics.add.collider(this.paintGroup, this.walls);
  }

  private handleWallHit(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Arcade has already separated the bodies and set blocked flags
    const touchingUp = body.blocked.up;
    const touchingDown = body.blocked.down;
    const touchingLeft = body.blocked.left;
    const touchingRight = body.blocked.right;

    if (touchingDown || touchingUp) {
      // Floor or ceiling bounce — the classic Wizball mechanic:
      // On vertical bounce, xVel snaps to idealXVel (player gets directional control)
      this.xVel = this.idealXVel * PRIVATE_SCALE;

      // Ensure minimum vertical bounce speed
      const currentY = Math.abs(this.yVel);
      const minBounce = WIZBALL_MINIMUM_VERTICAL_BOUNCE_SPEED * PRIVATE_SCALE;

      if (currentY < minBounce) {
        // Too slow — boost to minimum in bounce direction
        this.yVel = touchingDown ? -minBounce : minBounce;
      } else {
        // Normal bounce with slight energy loss
        this.yVel = -this.yVel * 0.92;
      }

      if (this.bounceSound && !this.bounceSound.isPlaying) {
        this.bounceSound.play();
      }
    }

    if (touchingLeft || touchingRight) {
      if (this.movementStyle === MovementStyle.BASIC_BOUNCE) {
        // Classic: if ideal and actual velocity oppose, reflect ideal
        const product = this.idealXVel * (this.xVel / PRIVATE_SCALE);
        if (product < 0) {
          this.xVel = -this.idealXVel * PRIVATE_SCALE;
          this.idealXVel = this.xVel / PRIVATE_SCALE;
        } else {
          this.xVel = this.idealXVel * PRIVATE_SCALE;
        }
      } else {
        const currentX = Math.abs(this.xVel);
        const minBounce = WIZBALL_MINIMUM_HORIZONTAL_BOUNCE_SPEED * PRIVATE_SCALE;

        if (currentX < minBounce) {
          this.xVel = touchingLeft ? minBounce : -minBounce;
        } else {
          this.xVel = -this.xVel * 0.85;
        }

        this.idealXVel = this.xVel / PRIVATE_SCALE;
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
    if (this.fireCooldown > 0) return;

    const bullet = this.physics.add.sprite(
      this.player.x + this.lastMovementDirection * 20,
      this.player.y,
      'bullet'
    );
    bullet.setDepth(8);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 6);
    body.setVelocity(this.lastMovementDirection * 350, 0);
    body.setGravityY(0);

    this.bulletGroup.add(bullet);

    this.time.delayedCall(1500, () => {
      if (bullet.active) bullet.destroy();
    });

    this.fireCooldown = 12;
    this.fireSound.play();

    if (this.hasPaint) {
      this.hasPaint = false;
      this.paintIndicator.setAlpha(0.3);
    }
  }

  private createHUD(): void {
    this.hudText = this.add.text(10, 10, 'WIZBALL  Lives: 3', {
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
    }).setDepth(100);

    this.paintIndicator = this.add.rectangle(GAME_WIDTH - 40, 18, 24, 16, 0x666666);
    this.paintIndicator.setDepth(100);
    this.paintIndicator.setAlpha(0.3);

    this.add.text(10, GAME_HEIGHT - 20, 'ARROWS: Move  SPACE: Fire  1/2/3: Change mode', {
      fontSize: '10px',
      color: '#888888',
      fontFamily: 'monospace'
    }).setDepth(100);

    // Add mode switch keys for testing
    this.input.keyboard!.on('keydown-ONE', () => {
      this.movementStyle = MovementStyle.BASIC_BOUNCE;
    });
    this.input.keyboard!.on('keydown-TWO', () => {
      this.movementStyle = MovementStyle.CONTROLLED_BOUNCE;
    });
    this.input.keyboard!.on('keydown-THREE', () => {
      this.movementStyle = MovementStyle.FULL_CONTROLLED;
    });
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

    // Apply gravity (always, unless full controlled)
    if (this.movementStyle !== MovementStyle.FULL_CONTROLLED) {
      this.yVel += WIZBALL_GRAVITY_STRENGTH * PRIVATE_SCALE;
    }

    // Clamp velocities
    const maxX = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE * 2;
    const maxY = 8 * PRIVATE_SCALE;
    this.xVel = Phaser.Math.Clamp(this.xVel, -maxX, maxX);
    this.yVel = Phaser.Math.Clamp(this.yVel, -maxY, maxY);

    // Convert fixed-point velocity to pixels/second for Phaser Arcade
    // Fixed-point vel is "pixels per frame at 60fps" * 256
    // So pixels/frame = vel / 256, pixels/second = (vel / 256) * 60
    body.setVelocity(
      (this.xVel / PRIVATE_SCALE) * 60,
      (this.yVel / PRIVATE_SCALE) * 60
    );

    // Update spin animation
    this.updateSpin();
  }

  private updateBasicMovement(): void {
    // In basic mode, left/right only affect idealXVel
    // Actual xVel only changes on wall/floor bounces
    const maxVel = WIZBALL_MAX_PIXEL_X_VEL;

    if (this.cursors.right.isDown) {
      this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, maxVel);
    }
    if (this.cursors.left.isDown) {
      this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -maxVel);
    }
  }

  private updateControlledMovement(): void {
    const maxVel = WIZBALL_MAX_PIXEL_X_VEL;

    if (this.cursors.right.isDown) {
      this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, maxVel);
    }
    if (this.cursors.left.isDown) {
      this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -maxVel);
    }

    // Direct velocity control between bounces
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.left && !body.blocked.right) {
      this.xVel = this.idealXVel * PRIVATE_SCALE;
    }
  }

  private updateFullControlled(): void {
    const maxVel = WIZBALL_MAX_PIXEL_X_VEL;
    const responsiveness = WIZBALL_X_RESPONSIVENESS;
    const damping = 48 / 256;

    // X movement
    if (this.cursors.right.isDown) {
      this.xVel = Math.min(this.xVel + responsiveness * PRIVATE_SCALE, maxVel * PRIVATE_SCALE);
    } else if (this.cursors.left.isDown) {
      this.xVel = Math.max(this.xVel - responsiveness * PRIVATE_SCALE, -maxVel * PRIVATE_SCALE);
    } else {
      if (this.xVel > 0) {
        this.xVel = Math.max(this.xVel - damping * PRIVATE_SCALE, 0);
      } else if (this.xVel < 0) {
        this.xVel = Math.min(this.xVel + damping * PRIVATE_SCALE, 0);
      }
    }

    // Y movement
    const yResponsiveness = 96 / 256;
    const yDamping = 48 / 256;

    if (this.cursors.down.isDown) {
      this.yVel = Math.min(this.yVel + yResponsiveness * PRIVATE_SCALE, maxVel * PRIVATE_SCALE);
    } else if (this.cursors.up.isDown) {
      this.yVel = Math.max(this.yVel - yResponsiveness * PRIVATE_SCALE, -maxVel * PRIVATE_SCALE);
    } else {
      if (this.yVel > 0) {
        this.yVel = Math.max(this.yVel - yDamping * PRIVATE_SCALE, 0);
      } else if (this.yVel < 0) {
        this.yVel = Math.min(this.yVel + yDamping * PRIVATE_SCALE, 0);
      }
    }

    this.idealXVel = this.xVel / PRIVATE_SCALE;
  }

  private updateSpin(): void {
    const velocityForSpin = this.movementStyle === MovementStyle.FULL_CONTROLLED
      ? this.xVel / PRIVATE_SCALE
      : this.idealXVel;

    this.spinAngle += velocityForSpin * PRIVATE_SCALE;

    // Wrap angle
    while (this.spinAngle < 0) this.spinAngle += this.topSpinAngle;
    while (this.spinAngle >= this.topSpinAngle) this.spinAngle -= this.topSpinAngle;

    // Convert to animation frame
    const frame = Math.floor(this.spinAngle / this.spinAngleToFrameDivider) % WIZBALL_FRAME_COUNT;
    this.player.setFrame(frame);
  }

  private updateCatellite(): void {
    if (!(this.weaponCollection & CATELLITE_BITFLAG)) {
      this.catellite.setVisible(false);
      return;
    }

    this.catellite.setVisible(true);

    const targetX = this.player.x - this.lastMovementDirection * 35;
    const targetY = this.player.y - 20;

    const dx = targetX - this.catellite.x;
    const dy = targetY - this.catellite.y;

    this.catellite.setVelocity(dx * 5, dy * 5);
  }

  private updateHUD(): void {
    const style = ['BASIC', 'CTRL', 'FULL'][this.movementStyle];
    const paint = this.hasPaint ? PAINT_COLORS[this.paintColor] : '---';

    this.hudText.setText(
      `WIZBALL  Lives:${this.lives}  Mode:${style}  Paint:${paint}`
    );
  }

  private cleanupPaintDrops(): void {
    this.paintGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const sprite = child as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > GAME_HEIGHT + 30 || sprite.x < -30 || sprite.x > GAME_WIDTH + 30) {
        sprite.destroy();
      }
      return true;
    });
  }

  update(): void {
    if (this.fireCooldown > 0) this.fireCooldown--;

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
      this.fireBullet();
    }

    this.updateMovement();
    this.updateCatellite();
    this.updateHUD();
    this.cleanupPaintDrops();
  }
}
