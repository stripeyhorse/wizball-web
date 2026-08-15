import Phaser from 'phaser';
import { SETTINGS } from '../types/game';
import type { ActionName } from '../types/settings';
import { Settings } from '../config/Settings';
import { DEFAULT_SETTINGS } from '../config/DefaultSettings';

const TABS = ['Graphics', 'Controls', 'Gamepad'] as const;
const CRT_MODES = ['off', 'c64', 'amiga'] as const;
function crtLabel(mode: string): string {
  return mode === 'c64' ? 'C64' : mode === 'amiga' ? 'AMIGA 500' : 'OFF';
}
const ACTION_LABELS: Record<ActionName, string> = {
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  fire: 'Fire',
  altFire: 'Alt Fire / Select',
  pause: 'Pause',
};

const KEY_NAMES: Record<number, string> = {
  [Phaser.Input.Keyboard.KeyCodes.LEFT]: 'LEFT',
  [Phaser.Input.Keyboard.KeyCodes.RIGHT]: 'RIGHT',
  [Phaser.Input.Keyboard.KeyCodes.UP]: 'UP',
  [Phaser.Input.Keyboard.KeyCodes.DOWN]: 'DOWN',
  [Phaser.Input.Keyboard.KeyCodes.SPACE]: 'SPACE',
  [Phaser.Input.Keyboard.KeyCodes.ENTER]: 'ENTER',
  [Phaser.Input.Keyboard.KeyCodes.ESC]: 'ESC',
  [Phaser.Input.Keyboard.KeyCodes.SHIFT]: 'SHIFT',
  [Phaser.Input.Keyboard.KeyCodes.CTRL]: 'CTRL',
  [Phaser.Input.Keyboard.KeyCodes.ALT]: 'ALT',
  [Phaser.Input.Keyboard.KeyCodes.TAB]: 'TAB',
};

function getKeyName(code: number | null): string {
  if (code === null) return '---';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  // Try to get character from keycode
  if (code >= 48 && code <= 57) return String.fromCharCode(code); // 0-9
  if (code >= 65 && code <= 90) return String.fromCharCode(code); // A-Z
  return `KEY ${code}`;
}

function getButtonName(index: number | null): string {
  if (index === null) return '---';
  const names: Record<number, string> = {
    0: 'A/Cross', 1: 'B/Circle', 2: 'X/Square', 3: 'Y/Triangle',
    4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'Select', 9: 'Start', 10: 'L3', 11: 'R3',
    12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right',
  };
  return names[index] ?? `BTN ${index}`;
}

export default class SettingsScene extends Phaser.Scene {
  private settings!: Settings;
  private returnTo: string = '';
  private activeTab: number = 0;
  private selectedRow: number = 0;
  private isCapturing: boolean = false;
  private captureAction: ActionName | null = null;

  // UI containers per tab
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private graphicsContainer!: Phaser.GameObjects.Container;
  private controlsContainer!: Phaser.GameObjects.Container;
  private gamepadContainer!: Phaser.GameObjects.Container;

  // Rebuild-able UI elements
  private graphicsItems: Phaser.GameObjects.Text[] = [];
  private controlItems: Phaser.GameObjects.Text[] = [];
  private gamepadItems: Phaser.GameObjects.Text[] = [];

  // Navigation keys
  private navKeys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    confirm: Phaser.Input.Keyboard.Key;
    back: Phaser.Input.Keyboard.Key;
    tabNext: Phaser.Input.Keyboard.Key;
    tabPrev: Phaser.Input.Keyboard.Key;
  };

  private captureStatusText!: Phaser.GameObjects.Text;
  private restartNotice!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SETTINGS });
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data.returnTo || '';
  }

  create(): void {
    this.settings = Settings.getInstance();
    this.activeTab = 0;
    this.selectedRow = 0;
    this.isCapturing = false;

    // Full overlay background
    this.add.rectangle(320, 208, 640, 416, 0x111122, 0.95).setDepth(0);

    // Title
    this.add.text(320, 20, 'SETTINGS', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    // Tab headers
    this.tabTexts = TABS.map((tab, i) => {
      const t = this.add.text(120 + i * 200, 55, tab, {
        fontSize: '16px', color: '#888888', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(1);
      t.setInteractive();
      t.on('pointerdown', () => { this.activeTab = i; this.selectedRow = 0; this.refreshUI(); });
      return t;
    });

    // Tab hint
    this.add.text(320, 390, 'Q/E: Switch Tab | UP/DOWN: Navigate | ENTER: Select | ESC: Back', {
      fontSize: '10px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    // Capture status
    this.captureStatusText = this.add.text(320, 370, '', {
      fontSize: '14px', color: '#ffff00', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);

    // Restart notice
    this.restartNotice = this.add.text(320, 350, '', {
      fontSize: '11px', color: '#ff8800', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);

    // Create tab containers
    this.graphicsContainer = this.add.container(0, 0).setDepth(1);
    this.controlsContainer = this.add.container(0, 0).setDepth(1);
    this.gamepadContainer = this.add.container(0, 0).setDepth(1);

    // Navigation keys
    const kb = this.input.keyboard!;
    this.navKeys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP, false),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN, false),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT, false),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, false),
      confirm: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false),
      back: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false),
      tabNext: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E, false),
      tabPrev: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q, false),
    };

    this.buildGraphicsTab();
    this.buildControlsTab();
    this.buildGamepadTab();
    this.refreshUI();
  }

  update(): void {
    if (this.isCapturing) return; // Don't navigate while capturing

    if (Phaser.Input.Keyboard.JustDown(this.navKeys.back)) {
      this.closeSettings();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.tabNext)) {
      this.activeTab = (this.activeTab + 1) % TABS.length;
      this.selectedRow = 0;
      this.refreshUI();
    }
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.tabPrev)) {
      this.activeTab = (this.activeTab - 1 + TABS.length) % TABS.length;
      this.selectedRow = 0;
      this.refreshUI();
    }

    const items = this.getActiveItems();
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.up)) {
      this.selectedRow = (this.selectedRow - 1 + items.length) % items.length;
      this.refreshUI();
    }
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.down)) {
      this.selectedRow = (this.selectedRow + 1) % items.length;
      this.refreshUI();
    }
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.confirm)) {
      this.activateItem();
    }
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.left)) {
      this.adjustItem(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.right)) {
      this.adjustItem(1);
    }
  }

  // ---- Graphics Tab ----

  private buildGraphicsTab(): void {
    const cfg = this.settings.get().graphics;
    const items = [
      `Resolution Scale: ${cfg.resolutionScale}x`,
      `Fullscreen: ${cfg.fullscreen ? 'ON' : 'OFF'}`,
      `Pixel Smoothing: ${cfg.pixelArtSmoothing ? 'ON' : 'OFF'}`,
      `Show FPS: ${cfg.showFPS ? 'ON' : 'OFF'}`,
      `CRT Filter: < ${crtLabel(cfg.crtMode)} >`,
    ];

    this.graphicsItems = items.map((label, i) => {
      const t = this.make.text({
        x: 320, y: 90 + i * 32,
        text: label,
        style: { fontSize: '14px', color: '#cccccc', fontFamily: 'monospace' },
      });
      t.setOrigin(0.5);
      this.graphicsContainer.add(t);
      return t;
    });
  }

  private refreshGraphicsTab(): void {
    const cfg = this.settings.get().graphics;
    const labels = [
      `Resolution Scale: < ${cfg.resolutionScale}x >`,
      `Fullscreen: ${cfg.fullscreen ? 'ON' : 'OFF'}`,
      `Pixel Smoothing: ${cfg.pixelArtSmoothing ? 'ON' : 'OFF'}`,
      `Show FPS: ${cfg.showFPS ? 'ON' : 'OFF'}`,
      `CRT Filter: < ${crtLabel(cfg.crtMode)} >`,
    ];
    this.graphicsItems.forEach((t, i) => t.setText(labels[i]));
  }

  // ---- Controls Tab ----

  private buildControlsTab(): void {
    const cfg = this.settings.get();
    const actions = Object.keys(ACTION_LABELS) as ActionName[];

    this.controlItems = actions.map((action, i) => {
      const binding = cfg.bindings[action];
      const label = `${ACTION_LABELS[action]}: [${getKeyName(binding.keyboard)}] [${getButtonName(binding.gamepadButton)}]`;
      const t = this.make.text({
        x: 320, y: 90 + i * 28,
        text: label,
        style: { fontSize: '12px', color: '#cccccc', fontFamily: 'monospace' },
      });
      t.setOrigin(0.5);
      this.controlsContainer.add(t);
      return t;
    });

    // Add reset option
    const resetText = this.make.text({
      x: 320, y: 90 + actions.length * 28 + 10,
      text: '[ Reset to Defaults ]',
      style: { fontSize: '12px', color: '#ff8888', fontFamily: 'monospace' },
    });
    resetText.setOrigin(0.5);
    this.controlsContainer.add(resetText);
    this.controlItems.push(resetText);
  }

  private refreshControlsTab(): void {
    const cfg = this.settings.get();
    const actions = Object.keys(ACTION_LABELS) as ActionName[];
    actions.forEach((action, i) => {
      const binding = cfg.bindings[action];
      this.controlItems[i].setText(
        `${ACTION_LABELS[action]}: [${getKeyName(binding.keyboard)}] [${getButtonName(binding.gamepadButton)}]`
      );
    });
  }

  // ---- Gamepad Tab ----

  private buildGamepadTab(): void {
    const cfg = this.settings.get().gamepad;
    const items = [
      `Deadzone: < ${(cfg.deadzone * 100).toFixed(0)}% >`,
      `Analog Movement: ${cfg.analogMovement ? 'ON' : 'OFF'}`,
      '',  // spacer for live display
    ];

    this.gamepadItems = items.map((label, i) => {
      const t = this.make.text({
        x: 320, y: 90 + i * 32,
        text: label,
        style: { fontSize: '14px', color: '#cccccc', fontFamily: 'monospace' },
      });
      t.setOrigin(0.5);
      this.gamepadContainer.add(t);
      return t;
    });

    // Live gamepad status
    const statusText = this.make.text({
      x: 320, y: 200,
      text: 'No gamepad connected',
      style: { fontSize: '12px', color: '#888888', fontFamily: 'monospace' },
    });
    statusText.setOrigin(0.5);
    this.gamepadContainer.add(statusText);
    this.gamepadItems.push(statusText);
  }

  private refreshGamepadTab(): void {
    const cfg = this.settings.get().gamepad;
    this.gamepadItems[0]?.setText(`Deadzone: < ${(cfg.deadzone * 100).toFixed(0)}% >`);
    this.gamepadItems[1]?.setText(`Analog Movement: ${cfg.analogMovement ? 'ON' : 'OFF'}`);

    // Update live gamepad status
    const statusText = this.gamepadItems[3];
    if (statusText && this.input.gamepad) {
      const pad = this.input.gamepad.getPad(0);
      if (pad) {
        const lx = pad.axes[0]?.getValue().toFixed(2) ?? '0';
        const ly = pad.axes[1]?.getValue().toFixed(2) ?? '0';
        const btns = pad.buttons.filter(b => b.pressed).map((_, i) => i).join(',');
        statusText.setText(`Pad: ${pad.id.substring(0, 30)}\nStick: (${lx}, ${ly})  Btns: [${btns || 'none'}]`);
      } else {
        statusText.setText('No gamepad connected');
      }
    }
  }

  // ---- Shared UI Logic ----

  private getActiveItems(): Phaser.GameObjects.Text[] {
    switch (this.activeTab) {
      case 0: return this.graphicsItems;
      case 1: return this.controlItems;
      case 2: return this.gamepadItems.slice(0, 2); // Only deadzone and analog are selectable
      default: return [];
    }
  }

  private refreshUI(): void {
    // Tab highlighting
    this.tabTexts.forEach((t, i) => {
      t.setColor(i === this.activeTab ? '#ffff00' : '#888888');
    });

    // Show/hide containers
    this.graphicsContainer.setVisible(this.activeTab === 0);
    this.controlsContainer.setVisible(this.activeTab === 1);
    this.gamepadContainer.setVisible(this.activeTab === 2);

    // Refresh content
    if (this.activeTab === 0) this.refreshGraphicsTab();
    if (this.activeTab === 1) this.refreshControlsTab();
    if (this.activeTab === 2) this.refreshGamepadTab();

    // Highlight selected row
    const items = this.getActiveItems();
    items.forEach((t, i) => {
      t.setColor(i === this.selectedRow ? '#ffff00' : '#cccccc');
    });

    this.captureStatusText.setText('');
  }

  private activateItem(): void {
    if (this.activeTab === 0) {
      this.toggleGraphicsItem();
    } else if (this.activeTab === 1) {
      this.startKeyCapture();
    } else if (this.activeTab === 2) {
      this.toggleGamepadItem();
    }
  }

  private adjustItem(direction: number): void {
    if (this.activeTab === 0) {
      this.adjustGraphicsItem(direction);
    } else if (this.activeTab === 2) {
      this.adjustGamepadItem(direction);
    }
  }

  private toggleGraphicsItem(): void {
    const cfg = this.settings.get();
    switch (this.selectedRow) {
      case 1: // Fullscreen
        cfg.graphics.fullscreen = !cfg.graphics.fullscreen;
        break;
      case 2: // Pixel smoothing
        cfg.graphics.pixelArtSmoothing = !cfg.graphics.pixelArtSmoothing;
        this.restartNotice.setText('* Pixel smoothing change requires page reload *');
        break;
      case 3: // Show FPS
        cfg.graphics.showFPS = !cfg.graphics.showFPS;
        break;
      case 4: // CRT filter — ENTER cycles forward
        this.cycleCRT(1);
        return;
    }
    this.settings.save();
    this.refreshUI();
  }

  private adjustGraphicsItem(direction: number): void {
    const cfg = this.settings.get();
    if (this.selectedRow === 0) { // Resolution scale
      const scales = [1, 1.5, 2];
      const idx = scales.indexOf(cfg.graphics.resolutionScale);
      const newIdx = Math.max(0, Math.min(scales.length - 1, idx + direction));
      cfg.graphics.resolutionScale = scales[newIdx];
      this.settings.save();
      this.refreshUI();
    } else if (this.selectedRow === 4) { // CRT filter
      this.cycleCRT(direction);
    }
  }

  private cycleCRT(direction: number): void {
    const cfg = this.settings.get();
    const idx = CRT_MODES.indexOf(cfg.graphics.crtMode);
    const next = (idx + direction + CRT_MODES.length) % CRT_MODES.length;
    cfg.graphics.crtMode = CRT_MODES[next];
    this.settings.save();
    // Live preview — re-applies the pipeline to all active cameras (this menu
    // and the screen behind it) so you see the filter change instantly.
    this.game.events.emit('settings:changed');
    this.refreshUI();
  }

  private toggleGamepadItem(): void {
    const cfg = this.settings.get();
    if (this.selectedRow === 1) { // Analog movement
      cfg.gamepad.analogMovement = !cfg.gamepad.analogMovement;
      this.settings.save();
      this.refreshUI();
    }
  }

  private adjustGamepadItem(direction: number): void {
    const cfg = this.settings.get();
    if (this.selectedRow === 0) { // Deadzone
      cfg.gamepad.deadzone = Math.max(0, Math.min(0.5, cfg.gamepad.deadzone + direction * 0.05));
      cfg.gamepad.deadzone = Math.round(cfg.gamepad.deadzone * 100) / 100;
      this.settings.save();
      this.refreshUI();
    }
  }

  private startKeyCapture(): void {
    const actions = Object.keys(ACTION_LABELS) as ActionName[];

    // Last item is "Reset to Defaults"
    if (this.selectedRow >= actions.length) {
      this.settings.update({ bindings: structuredClone(DEFAULT_SETTINGS.bindings) });
      this.refreshControlsTab();
      this.refreshUI();
      return;
    }

    this.captureAction = actions[this.selectedRow];
    this.isCapturing = true;
    this.captureStatusText.setText(`Press a key for "${ACTION_LABELS[this.captureAction]}" (ESC to cancel, DEL to unbind)`);

    // Listen for next key press
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) {
        this.endCapture();
        return;
      }

      if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.DELETE ||
          event.keyCode === Phaser.Input.Keyboard.KeyCodes.BACKSPACE) {
        // Unbind keyboard
        const cfg = this.settings.get();
        cfg.bindings[this.captureAction!].keyboard = null;
        this.settings.save();
        this.game.events.emit('settings:changed');
        this.endCapture();
        return;
      }

      // Set the new binding
      const cfg = this.settings.get();
      cfg.bindings[this.captureAction!].keyboard = event.keyCode;
      this.settings.save();
      this.game.events.emit('settings:changed');
      this.endCapture();
    };

    // Use raw DOM event to capture any key including ones Phaser might swallow
    window.addEventListener('keydown', handler, { once: true, capture: true });

    // Also listen for gamepad button
    if (this.input.gamepad) {
      const padHandler = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button, _value: number) => {
        const cfg = this.settings.get();
        cfg.bindings[this.captureAction!].gamepadButton = button.index;
        this.settings.save();
        this.game.events.emit('settings:changed');
        window.removeEventListener('keydown', handler, { capture: true });
        this.endCapture();
      };
      this.input.gamepad.once('down', padHandler);

      // Timeout — cancel after 5 seconds
      this.time.delayedCall(5000, () => {
        if (this.isCapturing) {
          window.removeEventListener('keydown', handler, { capture: true });
          this.input.gamepad?.off('down', padHandler);
          this.endCapture();
        }
      });
    }
  }

  private endCapture(): void {
    this.isCapturing = false;
    this.captureAction = null;
    this.refreshControlsTab();
    this.refreshUI();
  }

  private closeSettings(): void {
    // Apply graphics settings
    this.settings.applyGraphics(this.game);
    this.game.events.emit('settings:changed');

    this.scene.stop(SETTINGS);
    if (this.returnTo) {
      this.scene.bringToTop(this.returnTo);
    }
  }
}
