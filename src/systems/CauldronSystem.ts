import Phaser from 'phaser';
import { PaintColor } from '../types/game';

interface Cauldron {
  color: PaintColor;
  fillLevel: number;
  maxCapacity: number;
  position: { x: number; y: number };
}

interface LevelCauldronColors {
  red: { r: number; g: number; b: number };
  green: { r: number; g: number; b: number };
  blue: { r: number; g: number; b: number };
}

export default class CauldronSystem {
  private scene: Phaser.Scene;
  private cauldrons: Cauldron[] = [
    {
      color: PaintColor.RED,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    },
    {
      color: PaintColor.GREEN,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    },
    {
      color: PaintColor.BLUE,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    },
    {
      color: PaintColor.YELLOW,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    }
  ];
  private currentPaintColor: PaintColor | null = null;
  private currentLevelCauldronColors: LevelCauldronColors;
  private cauldronSprites: Phaser.GameObjects.Container[] = [];
  private paintPercentage: number = 0;
  private totalPaintBlobs: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.currentLevelCauldronColors = {
      red: { r: 255, g: 0, b: 0 },
      green: { r: 255, g: 0, b: 255 },
      blue: { r: 0, g: 255, b: 255 }
    };
  }

  setupCauldrons(level: number): void {
    this.loadCauldronColors(level);
    this.positionCauldrons();
    this.renderCauldrons();
  }

  private loadCauldronColors(level: number): void {
    const colors = this.getLevelCauldronColors(level);
    this.currentLevelCauldronColors = colors;
  }

  private getLevelCauldronColors(level: number): LevelCauldronColors {
    // C++ datatables/level_cauldron_colours.txt - exact RGB values
    switch (level) {
      case 1:
        return {
          red: { r: 255, g: 0, b: 0 },       // Red
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      case 2:
        return {
          red: { r: 128, g: 64, b: 32 },      // Dark Brown
          green: { r: 255, g: 128, b: 0 },    // Orange
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 3:
        return {
          red: { r: 0, g: 0, b: 255 },        // Blue
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      case 4:
        return {
          red: { r: 128, g: 64, b: 32 },      // Dark Brown
          green: { r: 0, g: 255, b: 0 },      // Green
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 5:
        return {
          red: { r: 255, g: 0, b: 0 },        // Red
          green: { r: 255, g: 128, b: 0 },    // Orange
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      case 6:
        return {
          red: { r: 0, g: 0, b: 255 },        // Blue
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 7:
        return {
          red: { r: 255, g: 0, b: 0 },        // Red
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 8:
        return {
          red: { r: 128, g: 64, b: 32 },      // Dark Brown
          green: { r: 255, g: 128, b: 128 },  // Light Pink/Salmon
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      default:
        return {
          red: { r: 255, g: 0, b: 0 },
          green: { r: 0, g: 255, b: 0 },
          blue: { r: 0, g: 0, b: 255 }
        };
    }
  }

  private positionCauldrons(): void {
    // Cauldrons live in the left-center of the bottom status panel (y 368–415),
    // between the LIVES text and the weapon-icons row. Tight packing keeps room
    // for hi-score, paint, and level indicators on the right.
    const y = 393;
    this.cauldrons[0].position = { x: 96, y };   // Red
    this.cauldrons[1].position = { x: 138, y };  // Green
    this.cauldrons[2].position = { x: 180, y };  // Blue
    this.cauldrons[3].position = { x: 232, y };  // Combination (slightly detached)
  }

  private renderCauldrons(): void {
    this.cauldronSprites.forEach(s => s.destroy());
    this.cauldronSprites = [];

    this.cauldrons.forEach((cauldron) => {
      const container = this.scene.add.container(cauldron.position.x, cauldron.position.y);

      const color = this.getCauldronRGB(cauldron.color);
      const colorInt = (color.r << 16) | (color.g << 8) | color.b;

      // Cauldron body (dark iron pot) - tall rounded shape, 40w x 30h
      const bodyW = 40;
      const bodyH = 30;
      const body = this.scene.add.graphics();
      body.fillStyle(0x1a1a22, 1);
      body.fillRoundedRect(-bodyW / 2, -bodyH / 2 + 4, bodyW, bodyH, { tl: 6, tr: 6, bl: 12, br: 12 });
      body.lineStyle(2, 0x44444c, 1);
      body.strokeRoundedRect(-bodyW / 2, -bodyH / 2 + 4, bodyW, bodyH, { tl: 6, tr: 6, bl: 12, br: 12 });

      // Liquid fill from bottom up (vertical fill)
      const fillRatio = Math.min(1, cauldron.fillLevel / cauldron.maxCapacity);
      const liquidMaxH = bodyH - 10; // leave room for rim
      const liquidH = liquidMaxH * fillRatio;
      const liquidW = bodyW - 8;
      if (liquidH > 0) {
        const liquid = this.scene.add.graphics();
        liquid.fillStyle(colorInt, 0.9);
        liquid.fillRect(-liquidW / 2, bodyH / 2 - 2 - liquidH, liquidW, liquidH);
        // Surface highlight
        liquid.fillStyle(0xffffff, 0.25);
        liquid.fillRect(-liquidW / 2, bodyH / 2 - 2 - liquidH, liquidW, 2);
        container.add(liquid);
      }

      // Rim
      const rim = this.scene.add.graphics();
      rim.fillStyle(0x686874, 1);
      rim.fillRect(-bodyW / 2 - 3, -bodyH / 2 + 2, bodyW + 6, 4);
      rim.lineStyle(1, 0x2a2a30, 1);
      rim.strokeRect(-bodyW / 2 - 3, -bodyH / 2 + 2, bodyW + 6, 4);

      // Side handles
      const handles = this.scene.add.graphics();
      handles.lineStyle(2, 0x686874, 1);
      handles.strokeCircle(-bodyW / 2 - 4, -bodyH / 2 + 4, 3);
      handles.strokeCircle(bodyW / 2 + 4, -bodyH / 2 + 4, 3);

      // Glow (colour aura when filled)
      if (fillRatio > 0) {
        const glow = this.scene.add.ellipse(0, -bodyH / 2 + 2, bodyW + 8, 6, colorInt, 0.35 * fillRatio);
        container.add(glow);
      }

      container.add([body, rim, handles]);
      // Re-order so rim stays above liquid
      container.setDepth(100);
      container.setScrollFactor(0);

      this.cauldronSprites.push(container);
    });
  }

  private getCauldronRGB(color: PaintColor): { r: number; g: number; b: number } {
    switch (color) {
      case PaintColor.RED:
        return this.currentLevelCauldronColors.red;
      case PaintColor.GREEN:
        return this.currentLevelCauldronColors.green;
      case PaintColor.BLUE:
        return this.currentLevelCauldronColors.blue;
      case PaintColor.YELLOW:
        return { r: 200, g: 200, b: 200 };
      default:
        return { r: 255, g: 255, b: 255 };
    }
  }

  pickupPaint(color: PaintColor): void {
    this.currentPaintColor = color;
  }

  getCurrentPaintColor(): PaintColor | null {
    return this.currentPaintColor;
  }

  firePaintAtCauldron(x: number, y: number): boolean {
    if (this.currentPaintColor === null) {
      return false;
    }

    for (let i = 0; i < 3; i++) {
      const cauldron = this.cauldrons[i];
      const distance = Phaser.Math.Distance.Between(x, y, cauldron.position.x, cauldron.position.y);

      if (distance < 50) {
        if (cauldron.color === this.currentPaintColor && cauldron.fillLevel < cauldron.maxCapacity) {
          cauldron.fillLevel++;
          this.currentPaintColor = null;
          this.totalPaintBlobs++;
          this.updatePaintPercentage();
          this.checkCombinationCauldron();
          this.renderCauldrons();
          return true;
        }
      }
    }

    return false;
  }

  private checkCombinationCauldron(): void {
    const fullCauldrons = this.cauldrons.slice(0, 3).filter(c => c.fillLevel >= c.maxCapacity);
    const combination = this.cauldrons[3];

    if (fullCauldrons.length >= 2 && combination.fillLevel < combination.maxCapacity) {
      combination.fillLevel = Math.min(combination.fillLevel + 1, combination.maxCapacity);
    }
  }

  private updatePaintPercentage(): void {
    const totalCapacity = this.cauldrons.slice(0, 3).reduce((sum, c) => sum + c.maxCapacity, 0);
    const totalFill = this.cauldrons.slice(0, 3).reduce((sum, c) => sum + c.fillLevel, 0);
    this.paintPercentage = (totalFill / totalCapacity) * 100;
  }

  getPaintPercentage(): number {
    return this.paintPercentage;
  }

  isLevelComplete(): boolean {
    const paintComplete = this.paintPercentage >= 75;
    const allCauldronsFull = this.cauldrons.slice(0, 3).every(c => c.fillLevel >= c.maxCapacity);

    return paintComplete || allCauldronsFull;
  }

  getCauldronFillLevel(cauldronIndex: number): number {
    if (cauldronIndex >= 0 && cauldronIndex < this.cauldrons.length) {
      return this.cauldrons[cauldronIndex].fillLevel;
    }
    return 0;
  }

  getCauldronMaxCapacity(cauldronIndex: number): number {
    if (cauldronIndex >= 0 && cauldronIndex < this.cauldrons.length) {
      return this.cauldrons[cauldronIndex].maxCapacity;
    }
    return 20;
  }

  getCauldronPosition(cauldronIndex: number): { x: number; y: number } {
    if (cauldronIndex >= 0 && cauldronIndex < this.cauldrons.length) {
      return { ...this.cauldrons[cauldronIndex].position };
    }
    return { x: 0, y: 0 };
  }

  reset(): void {
    this.cauldrons.forEach(c => c.fillLevel = 0);
    this.currentPaintColor = null;
    this.paintPercentage = 0;
    this.totalPaintBlobs = 0;
    this.renderCauldrons();
  }

  setFillLevels(fillLevels: number[]): void {
    this.cauldrons.forEach((cauldron, index) => {
      cauldron.fillLevel = Math.max(0, Math.min(fillLevels[index] ?? 0, cauldron.maxCapacity));
    });
    this.updatePaintPercentage();
    this.renderCauldrons();
  }

  destroy(): void {
    this.cauldronSprites.forEach(sprite => sprite.destroy());
    this.cauldronSprites = [];
  }

  update(): void {
  }

  checkBulletCollision(x: number, y: number, paintColor: PaintColor | null): boolean {
    if (paintColor === null) return false;

    for (let i = 0; i < 3; i++) {
      const cauldron = this.cauldrons[i];
      const distance = Phaser.Math.Distance.Between(x, y, cauldron.position.x, cauldron.position.y);

      if (distance < 30) {
        if (cauldron.color === paintColor && cauldron.fillLevel < cauldron.maxCapacity) {
          cauldron.fillLevel++;
          this.updatePaintPercentage();
          this.checkCombinationCauldron();
          this.renderCauldrons();
          return true;
        }
      }
    }

    return false;
  }
}
