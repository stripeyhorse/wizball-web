import Phaser from 'phaser';
import { PAUSE, GAME, SETTINGS, TITLE } from '../types/game';

const MENU_ITEMS = ['Resume', 'Settings', 'Title Screen'] as const;

export default class PauseScene extends Phaser.Scene {
  private selectedIndex = 0;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private settingsOpen = false;

  constructor() {
    super({ key: PAUSE });
  }

  create(): void {
    this.selectedIndex = 0;
    this.settingsOpen = false;
    this.menuTexts = [];

    // Semi-transparent overlay
    this.add.rectangle(320, 208, 640, 416, 0x000000, 0.7).setDepth(0);

    // Title
    this.add.text(320, 100, 'PAUSED', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    // Menu items. Interactive so the menu is usable on touch, where there is no
    // keyboard to drive the UP/DOWN/ENTER navigation below.
    this.menuTexts = MENU_ITEMS.map((label, i) => {
      const text = this.add.text(320, 180 + i * 40, label, {
        fontSize: '20px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(1);
      text.setPadding(16, 10, 16, 10);
      text.setInteractive({ useHandCursor: true });
      text.on('pointerover', () => {
        if (this.settingsOpen) return;
        this.selectedIndex = i;
        this.updateSelection();
      });
      text.on('pointerdown', () => {
        if (this.settingsOpen) return;
        this.selectedIndex = i;
        this.updateSelection();
        this.selectItem();
      });
      return text;
    });

    this.updateSelection();

    // Navigation keys (direct, not via InputManager — pause menu is standalone)
    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  update(): void {
    // Settings is launched in *parallel* with this scene, so without this guard
    // navigating the Settings menu also moved the hidden cursor here, and ENTER
    // in Settings also fired selectItem() — resuming or killing the run with the
    // menu still on screen. Suspension is derived from whether Settings is
    // actually running rather than latched by selectItem(), so closing Settings
    // can never leave this scene permanently deaf.
    const settingsActive = this.scene.isActive(SETTINGS);
    if (settingsActive !== this.settingsOpen) {
      this.setSuspended(settingsActive);
    }
    if (settingsActive) return;

    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.selectedIndex = (this.selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
      this.updateSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      this.selectedIndex = (this.selectedIndex + 1) % MENU_ITEMS.length;
      this.updateSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.resume();
    }
    if (Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
      this.selectItem();
    }
  }

  private setSuspended(suspended: boolean): void {
    this.settingsOpen = suspended;
    this.input.enabled = !suspended;
    if (this.input.keyboard) this.input.keyboard.enabled = !suspended;
    this.menuTexts.forEach(text => text.setAlpha(suspended ? 0 : 1));
    if (!suspended) {
      // The plugin was frozen mid-press; clear the keys so the frame Settings
      // closes on can't immediately re-trigger this menu.
      [this.upKey, this.downKey, this.confirmKey, this.escKey].forEach(k => k?.reset());
    }
  }

  private updateSelection(): void {
    this.menuTexts.forEach((text, i) => {
      if (i === this.selectedIndex) {
        text.setColor('#ffff00');
        text.setText(`> ${MENU_ITEMS[i]} <`);
      } else {
        text.setColor('#aaaaaa');
        text.setText(MENU_ITEMS[i]);
      }
    });
  }

  private selectItem(): void {
    switch (MENU_ITEMS[this.selectedIndex]) {
      case 'Resume':
        this.resume();
        break;
      case 'Settings':
        this.setSuspended(true);
        this.scene.launch(SETTINGS, { returnTo: PAUSE });
        this.scene.bringToTop(SETTINGS);
        break;
      case 'Title Screen':
        this.scene.stop(GAME);
        this.scene.stop(PAUSE);
        this.scene.start(TITLE);
        break;
    }
  }

  private resume(): void {
    this.scene.stop(PAUSE);
    this.scene.resume(GAME);
  }
}
