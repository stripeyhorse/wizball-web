import Phaser from 'phaser';

export interface WarpTubeData {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: 'up' | 'down';
}

export default class WarpTubeSystem {
  private scene: Phaser.Scene;
  private warpTubes: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private warpParticles: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private isWarping: boolean = false;
  private warpTimer: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public addWarpTube(data: WarpTubeData): void {
    const key = `${data.x},${data.y}`;
    
    // Create warp tube visual
    const color = data.direction === 'up' ? 0x44aaff : 0xff44aa;
    const warpTube = this.scene.add.rectangle(
      data.x,
      data.y,
      data.width,
      data.height,
      color,
      0.3
    );
    warpTube.setStrokeStyle(2, color, 1);
    warpTube.setDepth(15);

    // Store data on the object
    (warpTube as any).warpData = data;

    this.warpTubes.set(key, warpTube);

    // Create particle effect
    this.createWarpParticles(data);
  }

  private createWarpParticles(_data: WarpTubeData): void {
    const emitter = this.scene.add.particles(_data.x + _data.width / 2, _data.y + _data.height / 2, 'default', {
      speed: { min: 20, max: 40 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 1000,
      frequency: 100,
      blendMode: 'ADD'
    });

    this.warpParticles.push(emitter);
  }

  public checkWarp(player: Phaser.Physics.Arcade.Sprite): void {
    if (this.isWarping) return;

    this.warpTubes.forEach(warpTube => {
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

    // Warp effect on player
    this.scene.tweens.add({
      targets: player,
      alpha: 0,
      scale: 0.5,
      duration: 500,
      onComplete: () => {
        // Trigger room transition
        this.scene.events.emit('warp-activate', {
          levelDelta: data.direction === 'up' ? 1 : -1
        });
      }
    });

    // Play sound
    if (this.scene.cache.audio.exists('warp_tube_appear')) {
      this.scene.sound.play('warp_tube_appear');
    }
  }

  public update(): void {
    if (this.isWarping) {
      this.warpTimer += 16;
      if (this.warpTimer > 600) {
        this.isWarping = false;
      }
    }

    // Animate warp tubes
    this.warpTubes.forEach(warpTube => {
      const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.3;
      warpTube.setAlpha(pulse);
    });
  }

  public clear(): void {
    this.warpTubes.forEach(warpTube => warpTube.destroy());
    this.warpTubes.clear();
    this.warpParticles.forEach(emitter => emitter.destroy());
    this.warpParticles = [];
  }

  public resetWarping(): void {
    this.isWarping = false;
    this.warpTimer = 0;
  }

  public destroy(): void {
    this.clear();
  }
}
