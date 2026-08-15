import Phaser from 'phaser';

export interface WarpTubeData {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: 'up' | 'down';
}

// --- Warp-out timing, transcribed from the C++ do_warp_out sequence ---
// (wizball.txt ~lines 271-328). The original runs at 60fps; one "frame" is
// modelled here as a fixed 1/60s tick so the animation matches the reference
// regardless of the host frame-rate.
const FRAME_MS = 1000 / 60;
const WARP_LERP_FRAMES = 30; // ball lerps into the tube mouth over ~30 frames
const WARP_BLINDER_FRAME = 50; // particle_blinder spawns
const WARP_INVISIBLE_FRAME = 52; // ball goes invisible + twinkle burst
const WARP_COMPLETE_FRAME = 120; // level reset / warp-activate fires (~2s)

// --- Arrival (warp_tube_exit*.txt) ---
// A tube graphic drops in from above (y_vel=64, y_acc=-1) then a fake Wizball
// lerps out over ~25 frames. We model this with tweens for the same feel.
const ARRIVAL_TUBE_DROP_MS = 260;
const ARRIVAL_DEPOSIT_MS = 420;
const ARRIVAL_TUBE_RETRACT_MS = 220;

// Wizball spritesheet has 64 frames (10x7 grid, last 4 unused) — the rotation
// cycle the original spins through during warp-out (current_frame 0..63).
const WIZBALL_FRAME_COUNT = 64;

export default class WarpTubeSystem {
  private scene: Phaser.Scene;
  private warpTubes: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  // Keyed the same way as warpTubes so a re-added zone replaces its emitter
  // instead of stacking a second one on the same spot.
  private warpParticles: Map<string, Phaser.GameObjects.Particles.ParticleEmitter> = new Map();
  private isWarping: boolean = false;
  private warpTimer: number = 0;

  // Warp-out animation state (frame-counted, driven from update()).
  private warpFrame: number = 0;
  private warpPlayer: Phaser.Physics.Arcade.Sprite | null = null;
  private warpData: WarpTubeData | null = null;
  private warpStartX: number = 0;
  private warpStartY: number = 0;
  private warpTargetX: number = 0;
  private warpTargetY: number = 0;
  private warpSpinFrame: number = 0;
  private warpEmitted: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensureParticleTexture();
  }

  // The emitters previously used the texture key 'default', which is never
  // created — Phaser substituted its green __MISSING checkerboard, so every warp
  // zone (and every twinkle burst) spat out green squares. Generate a real soft
  // white dot once and use that instead.
  private ensureParticleTexture(): void {
    if (this.scene.textures.exists('wt_particle')) return;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 3);
    g.generateTexture('wt_particle', 8, 8);
    g.destroy();
  }

  public addWarpTube(data: WarpTubeData): void {
    const key = `${data.x},${data.y}`;

    // Two zones can share a key (same x,y) if a level is rebuilt without a
    // clear(), or if the level data lists a duplicate. The Map.set() below
    // would then orphan the previous Rectangle — still on the display list,
    // never destroyed — and createWarpParticles() would stack a second
    // emitter on top of the first. Drop the old pair first.
    this.removeWarpTube(key);

    // Create warp tube marker. The C++ warp zones are invisible editor icons
    // (warp_zone_up/down.txt have no draw mode); the original only renders the
    // tube graphic that drops in on arrival. We keep a *subtle* shimmer so the
    // zone is discoverable in the web port without the previous garish
    // bright-stroked pulsing box.
    const color = data.direction === 'up' ? 0x44aaff : 0xff44aa;
    const warpTube = this.scene.add.rectangle(
      data.x,
      data.y,
      data.width,
      data.height,
      color,
      0.16
    );
    warpTube.setDepth(15);

    // Store data on the object
    (warpTube as any).warpData = data;

    this.warpTubes.set(key, warpTube);

    // Create particle effect
    this.createWarpParticles(key, data);
  }

  private removeWarpTube(key: string): void {
    const existing = this.warpTubes.get(key);
    if (existing) {
      existing.destroy();
      this.warpTubes.delete(key);
    }

    const emitter = this.warpParticles.get(key);
    if (emitter) {
      emitter.destroy();
      this.warpParticles.delete(key);
    }
  }

  private createWarpParticles(key: string, data: WarpTubeData): void {
    const color = data.direction === 'up' ? 0x44aaff : 0xff44aa;
    const emitter = this.scene.add.particles(data.x, data.y, 'wt_particle', {
      speed: { min: 12, max: 28 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.5, end: 0 },
      tint: color,
      lifespan: 900,
      frequency: 240, // gentle, occasional — not a constant stream
      blendMode: 'ADD'
    });
    emitter.setDepth(14);

    this.warpParticles.set(key, emitter);
  }

  /** True while a warp-out sequence is in progress (C++ getting_sucked_into_a_hole_flag).
   *  GameScene reads this to suppress player control / velocity during the warp. */
  public isActive(): boolean {
    return this.isWarping;
  }

  public checkWarp(player: Phaser.Physics.Arcade.Sprite): void {
    if (this.isWarping) return;

    this.warpTubes.forEach(warpTube => {
      if (this.isWarping) return;
      const bounds = warpTube.getBounds();
      const playerBounds = player.getBounds();

      if (Phaser.Geom.Rectangle.Overlaps(bounds, playerBounds)) {
        const warpData = (warpTube as any).warpData as WarpTubeData;
        this.startWarp(warpData, player);
      }
    });
  }

  private startWarp(data: WarpTubeData, player: Phaser.Physics.Arcade.Sprite): void {
    this.isWarping = true;
    this.warpTimer = 0;

    // Begin the frame-counted warp-out animation (driven in update()).
    this.warpFrame = 0;
    this.warpEmitted = false;
    this.warpPlayer = player;
    this.warpData = data;
    this.warpStartX = player.x;
    this.warpStartY = player.y;
    // Tube mouth = centre of the warp marker.
    this.warpTargetX = data.x + data.width / 2;
    this.warpTargetY = data.y + data.height / 2;
    this.warpSpinFrame = typeof player.frame?.name === 'number'
      ? (player.frame.name as unknown as number)
      : 0;

    // Stop the player drifting while it gets sucked into the tube.
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setVelocity(0, 0);
    }

    // Original plays wizball_warp_spin_up the moment the warp begins
    // (wizball.txt line 683). Previous code played the wrong key.
    if (this.scene.cache.audio.exists('wizball_warp_spin_up')) {
      this.scene.sound.play('wizball_warp_spin_up', { volume: 0.7 });
    }
  }

  /** Advance the frame-counted warp-out animation. Returns when done. */
  private updateWarpOut(): void {
    if (!this.warpData) return;

    const f = this.warpFrame;

    if (this.warpPlayer && this.warpPlayer.active) {
      const player = this.warpPlayer;

      // Frames 0..30: lerp the ball into the tube mouth with an ease-in/out
      // (CURVE_PERCENTAGE_SISO ≈ smoothstep) — wizball.txt lines 275-283.
      if (f <= WARP_LERP_FRAMES) {
        const tRaw = Phaser.Math.Clamp(f / WARP_LERP_FRAMES, 0, 1);
        const t = tRaw * tRaw * (3 - 2 * tRaw); // smoothstep ≈ SISO
        player.x = Phaser.Math.Linear(this.warpStartX, this.warpTargetX, t);
        player.y = Phaser.Math.Linear(this.warpStartY, this.warpTargetY, t);
        const body = player.body as Phaser.Physics.Arcade.Body | null;
        if (body) {
          body.reset(player.x, player.y);
        }
      }

      // Spin: current_frame += warp_effect_counter / 6, accelerating as the
      // counter climbs (wizball.txt: let warp_spin_speed = warp_effect_counter/6).
      if (f < WARP_INVISIBLE_FRAME) {
        this.warpSpinFrame = (this.warpSpinFrame + f / 6) % WIZBALL_FRAME_COUNT;
        const totalFrames = (player.texture?.frameTotal ?? WIZBALL_FRAME_COUNT) - 1;
        const frameIndex = Phaser.Math.Clamp(
          Math.floor(this.warpSpinFrame),
          0,
          Math.max(0, totalFrames - 1)
        );
        try {
          player.setFrame(frameIndex);
        } catch {
          /* texture may not be a sheet in some contexts; ignore */
        }

        // Shrink + fade as it funnels into the tube (visual analogue of the
        // ball disappearing into the pipe before it twinkles out).
        const shrink = 1 - Phaser.Math.Clamp(f / WARP_INVISIBLE_FRAME, 0, 1) * 0.6;
        player.setScale(shrink);
        player.setAlpha(Phaser.Math.Clamp(1 - f / WARP_INVISIBLE_FRAME, 0, 1));
      }

      // Frame 50: a "blinder" flash at the tube mouth.
      if (f === WARP_BLINDER_FRAME) {
        this.spawnBlinder(this.warpTargetX, this.warpTargetY);
      }

      // Frame 52: go fully invisible and scatter twinkle particles
      // (wizball.txt lines 287-299).
      if (f === WARP_INVISIBLE_FRAME) {
        player.setAlpha(0);
        player.setScale(0);
        this.spawnTwinkles(this.warpTargetX, this.warpTargetY);
      }
    }

    // Frame 120: warp completes — fire the level-reset event. The teleport is
    // still owned by GameScene; we only signal it (contract unchanged).
    if (f >= WARP_COMPLETE_FRAME && !this.warpEmitted) {
      this.warpEmitted = true;
      const direction = this.warpData.direction;
      const player = this.warpPlayer;

      // Phaser's EventEmitter is synchronous, so by the time emit() returns
      // GameScene has already teleported the player to the destination spawn.
      this.scene.events.emit('warp-activate', {
        levelDelta: direction === 'up' ? 1 : -1
      });

      // Play the arrival (tube-drop + deposit) visual at the new position.
      if (player && player.active) {
        this.playArrival(player.x, player.y, direction);
      }
    }

    this.warpFrame++;
  }

  /** Tube-drop + deposit arrival animation (warp_tube_exit*.txt). */
  public playArrival(x: number, y: number, direction: 'up' | 'down'): void {
    const color = direction === 'up' ? 0x44aaff : 0xff44aa;

    // C++ warp_tube_exit.txt:27 plays warp_tube_appear as the empty tube drops
    // in (the matching deposit sound is fired by GameScene). Previously this key
    // was preloaded but never played.
    if (this.scene.cache.audio.exists('warp_tube_appear')) {
      this.scene.sound.play('warp_tube_appear', { volume: 0.6 });
    }

    // The "tube": drops in from above (y=-128 in the original, y_vel=64),
    // settles over the deposit point, then retracts back up and out.
    const tubeHeight = 96;
    const tubeStartY = y - 200;
    const tubeRestY = y - tubeHeight / 2;
    const tube = this.scene.add.rectangle(x, tubeStartY, 40, tubeHeight, color, 0.55);
    tube.setStrokeStyle(2, 0xffffff, 0.9);
    tube.setDepth(16);

    // Twinkle puff as the ball is deposited.
    this.spawnTwinkles(x, y);

    this.scene.tweens.add({
      targets: tube,
      y: tubeRestY,
      duration: ARRIVAL_TUBE_DROP_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        // Fake Wizball lerps out of the tube playing the deposit. The
        // warp_tube_deposit SOUND is played by GameScene as part of the
        // teleport, so we only do the matching VISUAL here (no double sound).
        const fake = this.scene.add.image(x, tubeRestY, 'wizball', 0);
        fake.setDepth(17);
        fake.setScale(0.2);
        fake.setAlpha(0.9);

        this.scene.tweens.add({
          targets: fake,
          y,
          scale: 1,
          duration: ARRIVAL_DEPOSIT_MS,
          ease: 'Sine.easeOut',
          onComplete: () => {
            fake.destroy();
          }
        });

        this.scene.tweens.add({
          targets: tube,
          y: tubeStartY,
          alpha: 0,
          duration: ARRIVAL_TUBE_RETRACT_MS,
          delay: ARRIVAL_DEPOSIT_MS - ARRIVAL_TUBE_RETRACT_MS,
          ease: 'Quad.easeIn',
          onComplete: () => {
            tube.destroy();
          }
        });
      }
    });
  }

  /** Brief full-mouth flash — the original's particle_blinder. */
  private spawnBlinder(x: number, y: number): void {
    const blinder = this.scene.add.circle(x, y, 28, 0xffffff, 0.9);
    blinder.setDepth(20);
    blinder.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: blinder,
      scale: 2.4,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => blinder.destroy()
    });
  }

  /** Scatter twinkle particles, matching the warp-out/deposit sparkle. */
  private spawnTwinkles(x: number, y: number): void {
    const emitter = this.scene.add.particles(x, y, 'wt_particle', {
      speed: { min: 60, max: 160 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      quantity: 18,
      blendMode: 'ADD',
      emitting: false
    });
    emitter.setDepth(20);
    emitter.explode(18, x, y);
    this.scene.time.delayedCall(600, () => emitter.destroy());
  }

  public update(): void {
    if (this.isWarping) {
      // Drive the frame-counted warp-out.
      if (!this.warpEmitted || this.warpFrame <= WARP_COMPLETE_FRAME) {
        this.updateWarpOut();
      }

      // Lockout matches the new ~2s (120-frame) warp-out timing so we can't
      // double-trigger. Add a small tail past the complete frame for safety.
      this.warpTimer += FRAME_MS;
      if (this.warpTimer > (WARP_COMPLETE_FRAME + 4) * FRAME_MS) {
        this.endWarp();
      }
    }

    // Animate warp tube markers (subtle shimmer — range ~0.06..0.22).
    // One sin() per frame, not one per tube: the value is the same for all.
    const pulse = Math.sin(Date.now() / 600) * 0.08 + 0.14;
    this.warpTubes.forEach(warpTube => warpTube.setAlpha(pulse));
  }

  private endWarp(): void {
    this.isWarping = false;
    this.warpTimer = 0;
    this.warpFrame = 0;
    this.warpEmitted = false;
    this.warpPlayer = null;
    this.warpData = null;
  }

  public clear(): void {
    this.warpTubes.forEach(warpTube => warpTube.destroy());
    this.warpTubes.clear();
    this.warpParticles.forEach(emitter => emitter.destroy());
    this.warpParticles.clear();
  }

  public resetWarping(): void {
    this.endWarp();
  }

  public destroy(): void {
    this.clear();
  }
}
