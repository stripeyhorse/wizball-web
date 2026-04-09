import Phaser from 'phaser';
import { PRELOAD } from '../types/game';

// Frame sizes confirmed from C++ source BMP filenames:
//   wizball[set][48][48][24][24].bmp   → 512×512 → 10 cols, 7 rows (64 frames)
//   enemies_01[set][48][48][24][24].bmp → 512×512 → 48×48
//   level_1_tiles_new[set][16][16][0][0].bmp → 512×512 → 32×32 = 1024 frames
//   catellite[arb].bmp                → arbitrary atlas (17 frames)
//   paintballs_and_drips[arb].bmp     → arbitrary atlas (30 frames)
//   player_bullets[arb].bmp           → arbitrary atlas (5 frames)
//   pickup[arb].bmp                   → arbitrary atlas (1 frame)

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: PRELOAD });
  }

  async preload(): Promise<void> {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 30, 320, 50);

    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading Wizball...', {
      fontSize: '20px', color: '#ffffff'
    }).setOrigin(0.5);

    const percentText = this.add.text(width / 2, height / 2, '0%', {
      fontSize: '18px', color: '#ffffff'
    }).setOrigin(0.5);

    const errorText = this.add.text(width / 2, height / 2 + 50, '', {
      fontSize: '12px', color: '#ff0000', wordWrap: { width: 600 }
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      percentText.setText(Math.round(value * 100) + '%');
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 20, 300 * value, 30);
    });

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`Failed to load: ${file.key}`);
      errorText.setText(errorText.text + `\nFailed: ${file.key}`);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
      errorText.destroy();
    });

    // Spritesheets with known grid layout
    this.load.spritesheet('wizball', 'assets/sprites/wizball.png', {
      frameWidth: 48, frameHeight: 48
    });
    this.load.spritesheet('enemies', 'assets/sprites/enemies.png', {
      frameWidth: 48, frameHeight: 48
    });
    this.load.spritesheet('enemies02', 'assets/sprites/enemies02.png', {
      frameWidth: 48, frameHeight: 48
    });

    // Level tilesheets (16x16 tiles, 32x32 grid)
    for (let i = 1; i <= 8; i++) {
      this.load.spritesheet(`level_${i}_tiles`, `assets/sprites/level_${i}_tiles.png`, {
        frameWidth: 16, frameHeight: 16
      });
    }

    // Background images
    for (let i = 1; i <= 8; i++) {
      this.load.image(`background_level_${i}`, `assets/sprites/background_level_${i}.png`);
    }

    // Load [arb] atlas textures and parse frame data
    this.load.atlas('catellite', 'assets/sprites/catellite.png', 'assets/sprites/catellite-atlas.json');
    this.load.atlas('paintballs', 'assets/sprites/paintballs_and_drips.png', 'assets/sprites/paintballs-atlas.json');
    this.load.atlas('bullets', 'assets/sprites/player_bullets.png', 'assets/sprites/bullets-atlas.json');
    this.load.atlas('pickup', 'assets/sprites/pickup.png', 'assets/sprites/pickup-atlas.json');
    this.load.atlas('panel_icons', 'assets/sprites/panel_icons.png', 'assets/sprites/panel_icons-atlas.json');

    // Load C++ tilemap files
    for (let i = 1; i <= 8; i++) {
      this.load.text(`tilemap_${i}`, `assets/tilemaps/LEVEL_${i}_TILEMAP.txt`);
    }

    // Load C++ tileset files
    for (let i = 0; i <= 7; i++) {
      this.load.text(`tileset_${i}`, `assets/tilesets/TILESET_${String(i).padStart(3, '0')}.TXT`);
    }

    // Sounds - all audio files that exist in public/assets/
    const soundFiles = [
      'asteroid_scrape',
      'bonus_pearl_pickup',
      'bonus_selection',
      'catellite_bubble_shield_loop',
      'catellite_explode',
      'catellite_hit',
      'catellite_mutant_bubble_loop',
      'catellite_spark',
      'catellite_zoom_off_screen',
      'cauldron_beam_burst',
      'cauldron_full_burst',
      'enemy_bounce',
      'enemy_bullet_ping',
      'enemy_explode',
      'enemy_fire_bullet_spread',
      'enemy_fire_single_bullet',
      'freaky_bits_cancelled',
      'menu_select',
      'menu_select_back',
      'menu_select_bad',
      'menu_selector_move',
      'paintball_explode',
      'paintball_explode_special_paintdrop_created',
      'paintdrop_collection',
      'paintdrop_splash',
      'paintdrop_splat',
      'permanent_upgrade_selected',
      'score_counter_high_tick',
      'score_counter_low_tick',
      'score_counter_medium_tick',
      'smart_bomb',
      'spawn_new_wave_sound',
      'special_paintball_pickup_extra_life',
      'special_paintball_pickup_filth_raid',
      'special_paintball_pickup_freaky_bits',
      'special_paintball_pickup_indestructacat',
      'special_paintball_pickup_mutant_cat',
      'warp_tube_appear',
      'warp_tube_deposit',
      'wizball_bounce',
      'wizball_bubble_shield_loop',
      'wizball_explode',
      'wizball_explode_bonus_level',
      'wizball_full_cauldron_notice',
      'wizball_new_life_appear_sound',
      'wizball_or_cat_fire_blazers',
      'wizball_or_cat_fire_normal',
      'wizball_or_cat_fire_three_way',
      'wizball_or_catellite_bullet_ping',
      'wizball_or_catellite_lab_pop',
      'wizball_or_catellite_shield_impact',
      'wizball_up_down_shield_pulse',
      'wizball_warp_spin_up',
    ];
    for (const sound of soundFiles) {
      this.load.audio(sound, `assets/${sound}.wav`);
    }
  }

  create(): void {
    this.scene.start('Title');
  }
}
