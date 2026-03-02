import Phaser from 'phaser';
import { PRELOAD, GAME } from '../types/game';

// Frame sizes confirmed from C++ source BMP filenames:
//   wizball[set][48][48][24][24].bmp   → 512×512 → 10 cols, 7 rows (64 frames)
//   enemies_01[set][48][48][24][24].bmp → 512×512 → 48×48
//   level_1_tiles_new[set][16][16][0][0].bmp → 512×512 → 32×32 = 1024 frames
//   catellite[arb].bmp                → arbitrary atlas (no uniform grid)
//   paintballs_and_drips[arb].bmp     → arbitrary atlas
//   player_bullets[arb].bmp           → arbitrary atlas

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: PRELOAD });
  }

  preload(): void {
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
    this.load.spritesheet('tiles', 'assets/sprites/tiles.png', {
      frameWidth: 16, frameHeight: 16
    });

    // [arb] sprites — load as plain images, we use specific regions or frame 0
    this.load.image('catellite', 'assets/sprites/catellite.png');
    this.load.image('paintballs', 'assets/sprites/paintballs.png');
    this.load.image('pickups', 'assets/sprites/pickups.png');
    this.load.image('player_bullets', 'assets/sprites/player_bullets.png');
    this.load.image('background', 'assets/sprites/background.png');

    // Sounds
    this.load.audio('bounce', 'assets/wizball_bounce.wav');
    this.load.audio('explode', 'assets/wizball_explode.wav');
    this.load.audio('fire', 'assets/wizball_or_cat_fire_normal.wav');
    this.load.audio('pickup', 'assets/bonus_pearl_pickup.wav');
  }

  create(): void {
    // Generate paint-drop textures (circles of each color) since paintballs[arb] isn't a grid
    this.generatePaintTextures();
    // Generate bullet texture
    this.generateBulletTexture();

    console.log('Wizball frames:', this.textures.get('wizball').frameTotal);
    console.log('Tiles frames:', this.textures.get('tiles').frameTotal);

    this.scene.start(GAME);
  }

  private generatePaintTextures(): void {
    const colors = [0xff0000, 0x00cc00, 0x0066ff, 0xffffff];
    const names = ['paint_red', 'paint_green', 'paint_blue', 'paint_white'];
    const radius = 8;
    const size = radius * 2;

    colors.forEach((color, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(radius - 2, radius - 2, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      this.textures.addCanvas(names[i], canvas);
    });
  }

  private generateBulletTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 6;
    const ctx = canvas.getContext('2d')!;
    // Glowing bullet
    const grad = ctx.createRadialGradient(6, 3, 0, 6, 3, 5);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#ffff00');
    grad.addColorStop(1, 'rgba(255,200,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 12, 6);
    this.textures.addCanvas('bullet', canvas);
  }
}
