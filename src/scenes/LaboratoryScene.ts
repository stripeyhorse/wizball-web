import Phaser from 'phaser';
import { GAME } from '../types/game';
import { WeaponFlag } from '../types/game';

interface UpgradeOption {
  frame: string;
  flag: number;
  label: string;
}

export default class LaboratoryScene extends Phaser.Scene {
  private level: number = 1;
  private score: number = 0;
  private weaponCollection: number = 0;
  private options: UpgradeOption[] = [];
  private selectedIndex: number = 0;
  private icons: Phaser.GameObjects.Image[] = [];
  private instructionText!: Phaser.GameObjects.Text;
  private selectionText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private complete: boolean = false;

  constructor() {
    super({ key: 'Laboratory' });
  }

  init(data: { level: number; score?: number; weaponCollection?: number }): void {
    this.level = data.level || 1;
    this.score = data.score || 0;
    this.weaponCollection = data.weaponCollection || 0;
  }

  create(): void {
    this.add.rectangle(320, 184, 640, 368, 0x1a1a2a).setDepth(-1);
    this.add.rectangle(320, 92, 520, 96, 0x0b1020, 0.65).setStrokeStyle(2, 0x314260).setDepth(1);

    this.add.text(320, 40, 'THE WIZARD\'S LABORATORY', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.add.text(320, 70, `LEVEL ${this.level} COMPLETE`, {
      fontSize: '24px',
      color: '#88ff88',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.options = this.buildOptions();

    this.add.text(320, 112, 'WIGGLE LEFT / RIGHT TO CHOOSE YOUR UPGRADE', {
      fontSize: '14px',
      color: '#a8bbd8',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.selectionText = this.add.text(320, 285, '', {
      fontSize: '20px',
      color: '#ffff88',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.instructionText = this.add.text(320, 325, 'PRESS SPACE TO ACCEPT', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.createIcons();
    this.updateSelection();

    if (this.cache.audio.exists('menu_selector_move')) {
      this.sound.add('menu_selector_move', { volume: 0.5 });
    }
    if (this.cache.audio.exists('permanent_upgrade_selected')) {
      this.sound.add('permanent_upgrade_selected', { volume: 0.6 });
    }
  }

  private buildOptions(): UpgradeOption[] {
    const options: UpgradeOption[] = [];

    if (!(this.weaponCollection & WeaponFlag.LATERAL_CONTROL)) {
      options.push({ frame: 'panel_icons_11', flag: WeaponFlag.LATERAL_CONTROL, label: 'CONTROL LEFT / RIGHT' });
    } else if (!(this.weaponCollection & WeaponFlag.VERTICAL_CONTROL)) {
      options.push({ frame: 'panel_icons_12', flag: WeaponFlag.VERTICAL_CONTROL, label: 'FULL CONTROL' });
    }

    if (!(this.weaponCollection & WeaponFlag.SHIELD_FIRE)) {
      options.push({ frame: 'panel_icons_13', flag: WeaponFlag.SHIELD_FIRE, label: 'SHIELD FIRE' });
    } else if (!(this.weaponCollection & WeaponFlag.REAR_FIRE)) {
      options.push({ frame: 'panel_icons_14', flag: WeaponFlag.REAR_FIRE, label: 'REAR FIRE' });
    }

    if (!(this.weaponCollection & WeaponFlag.CATELLITE)) {
      options.push({ frame: 'panel_icons_15', flag: WeaponFlag.CATELLITE, label: 'CAT' });
    }

    if (!(this.weaponCollection & WeaponFlag.DOUBLE_FIRE)) {
      options.push({ frame: 'panel_icons_16', flag: WeaponFlag.DOUBLE_FIRE, label: 'FAST FIRE' });
    }

    if (!(this.weaponCollection & WeaponFlag.WIZ_SPREAD_FIRE)) {
      options.push({ frame: 'panel_icons_17', flag: WeaponFlag.WIZ_SPREAD_FIRE, label: 'WIZ SPREAD FIRE' });
    } else if (!(this.weaponCollection & WeaponFlag.CAT_SPREAD_FIRE)) {
      options.push({ frame: 'panel_icons_18', flag: WeaponFlag.CAT_SPREAD_FIRE, label: 'CAT SPREAD FIRE' });
    }

    options.push({ frame: 'panel_icons_21', flag: 0, label: 'NO BONUS' });
    return options;
  }

  private createIcons(): void {
    const spacing = 84;
    const startX = 320 - ((this.options.length - 1) * spacing) / 2;
    const y = 195;

    this.options.forEach((option, index) => {
      const icon = this.add.image(startX + index * spacing, y, 'panel_icons', option.frame);
      icon.setDepth(5);
      this.icons.push(icon);
    });
  }

  private updateSelection(): void {
    this.icons.forEach((icon, index) => {
      const selected = index === this.selectedIndex;
      icon.setScale(selected ? 1.35 : 1);
      icon.setAlpha(selected ? 1 : 0.55);
      icon.setY(selected ? 188 : 195);
    });

    this.selectionText.setText(this.options[this.selectedIndex]?.label ?? '');
  }

  private moveSelection(direction: -1 | 1): void {
    if (this.complete || this.options.length === 0) return;
    this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex + direction, 0, this.options.length);
    this.updateSelection();

    if (this.cache.audio.exists('menu_selector_move')) {
      this.sound.play('menu_selector_move');
    }
  }

  private confirmSelection(): void {
    if (this.complete) return;
    this.complete = true;

    const selected = this.options[this.selectedIndex];
    if (selected && selected.flag !== 0) {
      this.weaponCollection |= selected.flag;
      if (selected.flag === WeaponFlag.WIZ_SPREAD_FIRE) {
        this.weaponCollection &= ~WeaponFlag.CAT_SPREAD_FIRE;
      } else if (selected.flag === WeaponFlag.CAT_SPREAD_FIRE) {
        this.weaponCollection &= ~WeaponFlag.WIZ_SPREAD_FIRE;
      }
    }

    if (this.cache.audio.exists('permanent_upgrade_selected')) {
      this.sound.play('permanent_upgrade_selected');
    }

    this.instructionText.setText('PREPARING NEXT LEVEL...');
    this.time.delayedCall(900, () => this.nextLevel());
  }

  private nextLevel(): void {
    this.scene.start(GAME, {
      level: this.level + 1,
      score: this.score,
      weaponCollection: this.weaponCollection
    });
  }

  update(): void {
    if (this.complete) return;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left!)) {
      this.moveSelection(-1);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right!)) {
      this.moveSelection(1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
      this.confirmSelection();
    }
  }
}
