import Phaser from 'phaser';
import type { ActionName } from '../types/settings';
import { Settings } from '../config/Settings';

export class InputManager {
  private scene: Phaser.Scene;
  private settings: Settings;
  private keys: Map<ActionName, Phaser.Input.Keyboard.Key> = new Map();
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private prevButtonState: Map<number, boolean> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.settings = Settings.getInstance();
    this.buildKeys();

    // Grab first connected gamepad
    if (scene.input.gamepad) {
      if (scene.input.gamepad.total > 0) {
        this.pad = scene.input.gamepad.getPad(0);
      }
      scene.input.gamepad.on('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
        if (!this.pad) this.pad = pad;
      });
      scene.input.gamepad.on('disconnected', (pad: Phaser.Input.Gamepad.Gamepad) => {
        if (this.pad === pad) this.pad = null;
      });
    }

    // Listen for settings changes to rebuild key bindings
    scene.game.events.on('settings:changed', this.rebuildKeys, this);
  }

  isDown(action: ActionName): boolean {
    // Keyboard
    const key = this.keys.get(action);
    if (key?.isDown) return true;

    // Gamepad button
    if (this.pad) {
      const binding = this.settings.get().bindings[action];
      if (binding.gamepadButton !== null) {
        const btn = this.pad.buttons[binding.gamepadButton];
        if (btn && btn.pressed) return true;
      }
    }

    // Gamepad stick for movement actions
    if (this.pad && this.settings.get().gamepad.analogMovement) {
      const axis = this.getStickForAction(action);
      if (axis !== 0) return true;
    }

    return false;
  }

  justDown(action: ActionName): boolean {
    // Keyboard
    const key = this.keys.get(action);
    if (key && Phaser.Input.Keyboard.JustDown(key)) return true;

    // Gamepad button (manual edge detection)
    if (this.pad) {
      const binding = this.settings.get().bindings[action];
      if (binding.gamepadButton !== null) {
        const btn = this.pad.buttons[binding.gamepadButton];
        const isPressed = btn?.pressed ?? false;
        const wasPressed = this.prevButtonState.get(binding.gamepadButton) ?? false;
        if (isPressed && !wasPressed) return true;
      }
    }

    return false;
  }

  getAnalogAxis(axis: 'horizontal' | 'vertical'): number {
    const cfg = this.settings.get().gamepad;

    // Keyboard always returns digital -1/0/1
    if (axis === 'horizontal') {
      const l = this.isKeyDown('moveLeft');
      const r = this.isKeyDown('moveRight');
      if (l && !r) return -1;
      if (r && !l) return 1;
    } else {
      const u = this.isKeyDown('moveUp');
      const d = this.isKeyDown('moveDown');
      if (u && !d) return -1;
      if (d && !u) return 1;
    }

    // Gamepad stick
    if (this.pad) {
      const stickIndex = axis === 'horizontal' ? 0 : 1; // Left stick
      const raw = this.pad.axes[stickIndex]?.getValue() ?? 0;
      if (Math.abs(raw) < cfg.deadzone) return 0;
      if (!cfg.analogMovement) return raw > 0 ? 1 : -1;
      return raw;
    }

    return 0;
  }

  update(): void {
    // Store previous gamepad button states for justDown detection
    if (this.pad) {
      for (let i = 0; i < this.pad.buttons.length; i++) {
        this.prevButtonState.set(i, this.pad.buttons[i]?.pressed ?? false);
      }
    }
  }

  destroy(): void {
    this.scene.game.events.off('settings:changed', this.rebuildKeys, this);
    this.keys.forEach(key => key.destroy());
    this.keys.clear();
  }

  private isKeyDown(action: ActionName): boolean {
    const key = this.keys.get(action);
    return key?.isDown ?? false;
  }

  private getStickForAction(action: ActionName): number {
    if (!this.pad) return 0;
    const dz = this.settings.get().gamepad.deadzone;

    switch (action) {
      case 'moveLeft': {
        const v = this.pad.axes[0]?.getValue() ?? 0;
        return v < -dz ? v : 0;
      }
      case 'moveRight': {
        const v = this.pad.axes[0]?.getValue() ?? 0;
        return v > dz ? v : 0;
      }
      case 'moveUp': {
        const v = this.pad.axes[1]?.getValue() ?? 0;
        return v < -dz ? v : 0;
      }
      case 'moveDown': {
        const v = this.pad.axes[1]?.getValue() ?? 0;
        return v > dz ? v : 0;
      }
      default:
        return 0;
    }
  }

  private buildKeys(): void {
    const bindings = this.settings.get().bindings;
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;

    for (const [action, binding] of Object.entries(bindings)) {
      if (binding.keyboard !== null) {
        // enableCapture=true prevents browser default behavior (scrolling on arrows, etc.)
        this.keys.set(action as ActionName, keyboard.addKey(binding.keyboard, true));
      }
    }
  }

  private rebuildKeys = (): void => {
    this.keys.forEach(key => key.destroy());
    this.keys.clear();
    this.buildKeys();
  };
}
