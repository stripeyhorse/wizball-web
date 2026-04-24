import Phaser from 'phaser';
import { WeaponFlag } from '../types/game';

// Rendered inside the bottom status panel (y=368–415), between the score/lives
// block and the cauldrons. Each icon is 24×24 with 2px gap.
const PANEL_X = 256;
const PANEL_Y = 372;
const PANEL_SPACING = 26;
const ICON_SIZE = 24;

const FRAME_EMPTY = 'panel_icons_21';
const FRAME_LATERAL = 'panel_icons_11';
const FRAME_VERTICAL = 'panel_icons_12';
const FRAME_SHIELD = 'panel_icons_13';
const FRAME_REAR = 'panel_icons_14';
const FRAME_CAT = 'panel_icons_15';
const FRAME_DOUBLE = 'panel_icons_16';
const FRAME_WIZ_SPREAD = 'panel_icons_17';
const FRAME_CAT_SPREAD = 'panel_icons_18';
const FRAME_SMART_BOMB = 'panel_icons_19';
const FRAME_INVULNERABLE = 'panel_icons_20';

export default class BonusSelectionPanelSystem {
  private scene: Phaser.Scene;
  private icons: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createIcons();
  }

  private createIcons(): void {
    for (let i = 0; i < 7; i++) {
      const icon = this.scene.add.image(PANEL_X + i * PANEL_SPACING, PANEL_Y, 'panel_icons', FRAME_EMPTY);
      icon.setOrigin(0, 0);
      icon.setDisplaySize(ICON_SIZE, ICON_SIZE);
      icon.setScrollFactor(0);
      icon.setDepth(100);
      this.icons.push(icon);
    }
  }

  public update(weaponCollection: number, selectedPickupCount: number): void {
    const frames = this.getFrames(weaponCollection);

    this.icons.forEach((icon, index) => {
      const frame = frames[index];
      const isSelected = selectedPickupCount === index + 1;
      const isEmpty = frame === FRAME_EMPTY;

      icon.setFrame(frame);
      icon.setTint(isSelected ? 0xffffff : 0x606060);
      icon.setAlpha(isSelected ? 1 : (isEmpty ? 0.5 : 0.95));
    });
  }

  public destroy(): void {
    this.icons.forEach(icon => icon.destroy());
    this.icons = [];
  }

  private getFrames(weaponCollection: number): string[] {
    return [
      this.getControlFrame(weaponCollection),
      this.getFireFrame(weaponCollection),
      (weaponCollection & WeaponFlag.CATELLITE) !== 0 ? FRAME_EMPTY : FRAME_CAT,
      (weaponCollection & WeaponFlag.DOUBLE_FIRE) !== 0 ? FRAME_EMPTY : FRAME_DOUBLE,
      this.getSpreadFrame(weaponCollection),
      FRAME_SMART_BOMB,
      FRAME_INVULNERABLE,
    ];
  }

  private getControlFrame(weaponCollection: number): string {
    if ((weaponCollection & WeaponFlag.LATERAL_CONTROL) === 0) {
      return FRAME_LATERAL;
    }

    if ((weaponCollection & WeaponFlag.VERTICAL_CONTROL) === 0) {
      return FRAME_VERTICAL;
    }

    return FRAME_EMPTY;
  }

  private getFireFrame(weaponCollection: number): string {
    if ((weaponCollection & WeaponFlag.SHIELD_FIRE) === 0) {
      return FRAME_SHIELD;
    }

    if ((weaponCollection & WeaponFlag.REAR_FIRE) === 0) {
      return FRAME_REAR;
    }

    return FRAME_EMPTY;
  }

  private getSpreadFrame(weaponCollection: number): string {
    if ((weaponCollection & WeaponFlag.WIZ_SPREAD_FIRE) === 0) {
      return FRAME_WIZ_SPREAD;
    }

    if ((weaponCollection & WeaponFlag.CAT_SPREAD_FIRE) === 0) {
      return FRAME_CAT_SPREAD;
    }

    return FRAME_EMPTY;
  }
}
