import Phaser from 'phaser';

export interface SoundConfig {
  key: string;
  volume?: number;
  loop?: boolean;
}

export default class SoundSystem {
  private scene: Phaser.Scene;
  private sounds: Map<string, Phaser.Sound.BaseSound> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.loadSounds();
  }

  private loadSounds(): void {
    // Define all 44 sounds from Wizball
    const soundDefinitions: SoundConfig[] = [
      // Game sounds
      { key: 'wizball_bounce', volume: 0.5 },
      { key: 'wizball_or_cat_fire_normal', volume: 0.4 },
      { key: 'wizball_fire_special', volume: 0.5 },
      
      // Catellite sounds
      { key: 'catellite_fire_normal', volume: 0.35 },
      { key: 'catellite_fire_special', volume: 0.45 },
      { key: 'catellite_deploy_shield', volume: 0.5 },
      
      // Enemy sounds
      { key: 'enemy_spawn', volume: 0.4 },
      { key: 'enemy_death', volume: 0.5 },
      { key: 'enemy_shoot', volume: 0.3 },
      { key: 'enemy_hit', volume: 0.4 },
      
      // Explosion sounds
      { key: 'explosion_small', volume: 0.5 },
      { key: 'explosion_medium', volume: 0.6 },
      { key: 'explosion_large', volume: 0.7 },
      
      // Pickup sounds
      { key: 'bonus_pearl_pickup', volume: 0.6 },
      { key: 'weapon_pickup', volume: 0.5 },
      { key: 'powerup_pickup', volume: 0.55 },
      { key: 'extra_life_pickup', volume: 0.6 },
      { key: 'paint_pickup', volume: 0.5 },
      
      // Cauldron sounds
      { key: 'cauldron_bubble', volume: 0.4 },
      { key: 'cauldron_fill', volume: 0.5 },
      { key: 'cauldron_complete', volume: 0.6 },
      { key: 'cauldron_overflow', volume: 0.55 },
      
      // Level transition sounds
      { key: 'level_start', volume: 0.5 },
      { key: 'level_complete', volume: 0.6 },
      { key: 'warp_enter', volume: 0.5 },
      { key: 'warp_exit', volume: 0.5 },
      
      // Menu/UI sounds
      { key: 'menu_select', volume: 0.5 },
      { key: 'menu_move', volume: 0.3 },
      { key: 'menu_back', volume: 0.4 },
      { key: 'game_over', volume: 0.7 },
      { key: 'high_score', volume: 0.6 },
      
      // Player death sounds
      { key: 'player_death', volume: 0.7 },
      { key: 'life_lost', volume: 0.6 },
      
      // Paint sounds
      { key: 'paint_splat', volume: 0.4 },
      { key: 'paint_collect', volume: 0.5 },
      { key: 'paint_fill_cauldron', volume: 0.45 },
      
      // Shield sounds
      { key: 'shield_activate', volume: 0.5 },
      { key: 'shield_hit', volume: 0.4 },
      { key: 'shield_deplete', volume: 0.5 },
      
      // Background/Ambient
      { key: 'ambient_level', volume: 0.3, loop: true },
      
      // Special effects
      { key: 'magic_cast', volume: 0.5 },
      { key: 'powerup_activate', volume: 0.55 },
      { key: 'transform', volume: 0.5 },
      
      // Extra sounds to reach 44
      { key: 'bounce_floor', volume: 0.45 },
      { key: 'bounce_ceiling', volume: 0.45 },
      { key: 'bounce_wall', volume: 0.45 },
      { key: 'collect_special', volume: 0.5 },
      { key: 'warning', volume: 0.5 }
    ];

    // Create sound objects for those that exist in cache
    soundDefinitions.forEach(def => {
      if (this.scene.cache.audio.exists(def.key)) {
        const sound = this.scene.sound.add(def.key, {
          volume: def.volume || 0.5,
          loop: def.loop || false
        });
        this.sounds.set(def.key, sound);
      }
    });
  }

  public play(key: string, config?: { volume?: number; rate?: number }): void {
    const sound = this.sounds.get(key);
    if (sound && !sound.isPlaying) {
      if (config?.volume !== undefined) {
        const configSound = sound as any;
        if (configSound.setVolume) {
          configSound.setVolume(config.volume);
        }
      }
      if (config?.rate !== undefined) {
        const configSound = sound as any;
        if (configSound.setRate) {
          configSound.setRate(config.rate);
        }
      }
      sound.play();
    }
  }

  public stop(key: string): void {
    const sound = this.sounds.get(key);
    if (sound) {
      sound.stop();
    }
  }

  public stopAll(): void {
    this.sounds.forEach(sound => sound.stop());
  }

  public setVolume(key: string, volume: number): void {
    const sound = this.sounds.get(key);
    if (sound) {
      const configSound = sound as any;
      if (configSound.setVolume) {
        configSound.setVolume(volume);
      }
    }
  }

  public isPlaying(key: string): boolean {
    const sound = this.sounds.get(key);
    return sound ? sound.isPlaying : false;
  }

  public destroy(): void {
    this.sounds.forEach(sound => sound.destroy());
    this.sounds.clear();
  }

  // Convenience methods for game events
  public playBounce(type: 'floor' | 'ceiling' | 'wall'): void {
    const key = type === 'floor' ? 'bounce_floor' : 
                type === 'ceiling' ? 'bounce_ceiling' : 'bounce_wall';
    this.play(key);
    this.play('wizball_bounce');
  }

  public playFire(isPlayer: boolean, isSpecial: boolean): void {
    const base = isPlayer ? 'wizball' : 'catellite';
    const type = isSpecial ? '_fire_special' : '_fire_normal';
    this.play(`${base}${type}`);
  }

  public playExplosion(size: 'small' | 'medium' | 'large'): void {
    this.play(`explosion_${size}`);
  }

  public playPickup(type: 'pearl' | 'weapon' | 'powerup' | 'life' | 'paint' | 'special'): void {
    const key = type === 'pearl' ? 'bonus_pearl_pickup' :
                 type === 'life' ? 'extra_life_pickup' :
                 type === 'special' ? 'collect_special' :
                 `${type}_pickup`;
    this.play(key);
  }

  public playCauldron(action: 'bubble' | 'fill' | 'complete' | 'overflow'): void {
    this.play(`cauldron_${action}`);
  }

  public playEnemy(action: 'spawn' | 'death' | 'shoot' | 'hit'): void {
    this.play(`enemy_${action}`);
  }
}