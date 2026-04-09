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

  constructor() {
    super({ key: PAUSE });
  }

  create(): void {
    this.selectedIndex = 0;

    // Semi-transparent overlay
    this.add.rectangle(320, 208, 640, 416, 0x000000, 0.7).setDepth(0);

    // Title
    this.add.text(320, 100, 'PAUSED', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    // Menu items
    this.menuTexts = MENU_ITEMS.map((label, i) => {
      return this.add.text(320, 180 + i * 40, label, {
        fontSize: '20px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(1);
    });

    this.updateSelection();

    // Navigation keys (direct, not via InputManager — pause menu is standalone)
    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  update(): void {
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
