import Phaser from 'phaser';
import { SETTINGS } from '../types/game';
import type { ActionName, TouchControlsMode } from '../types/settings';
import { CRT_MODES, TOUCH_CONTROL_MODES } from '../types/settings';
import { Settings } from '../config/Settings';
import { DEFAULT_SETTINGS } from '../config/DefaultSettings';

const TABS = ['Graphics', 'Audio', 'Controls', 'Gamepad'] as const;

function crtLabel(mode: string): string {
  return mode === 'c64' ? 'C64' : mode === 'amiga' ? 'AMIGA 500' : 'OFF';
}
function touchLabel(mode: TouchControlsMode): string {
  return mode === 'on' ? 'ALWAYS' : mode === 'off' ? 'NEVER' : 'AUTO';
}
function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
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

// The original's set of redefinable controls, taken verbatim from the data:
// datatables/defined_key_indexes.txt:6 is `#DATA 0,1,2,3,5,6`, which against the
// control constants in global_parameter_list.txt:1405-1411 reads UP(0), DOWN(1),
// LEFT(2), RIGHT(3), FIRE_1(5), FIRE_2(6) — the six rows named in
// textfiles/menu.txt:67-72 (UP / DOWN / LEFT / RIGHT / FIRE / SELECT BONUS), and
// the six that menu_define_keys.txt:82 counts before it stops asking.
//
// PAUSE is control 9 (global_parameter_list.txt:1414) and is deliberately absent
// from that table — the original never let you move it, only
// define_default_controls.txt:7 set it. Neither do we, and here that is more than
// parity: PauseScene.ts:127 is the only in-game route into this menu, so a Pause
// key the player could move (or, before this round, unbind) was a way to lock
// yourself out of Settings for the rest of the run.
const DEFINABLE_ACTIONS: ReadonlySet<ActionName> = new Set<ActionName>([
  'moveUp', 'moveDown', 'moveLeft', 'moveRight', 'fire', 'altFire',
]);

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

  // Controls the player has successfully rebound since opening this screen —
  // the port's stand-in for the original's per-control duplication flag.
  // menu_define_keys.txt:54 clears SET_DEFINING_DUPLICATION_CHECK for EVERY
  // definable control as the list is drawn, and :74 sets it true only once that
  // control has been accepted in the current pass. So a key is refused (:69,
  // DEFINE_PLAYER_CONTROL_FROM_KEYPRESS returns false and the loop re-prompts)
  // only when it clashes with a control ALREADY redefined this visit — never
  // with one the player has not reached yet, and never with a non-definable
  // control like Pause, which is absent from defined_key_indexes and so never
  // has the flag set at all. Checking live bindings instead makes a plain swap
  // impossible: with the defaults fire=SPACE / altFire=Z, arming Fire and
  // pressing Z is rejected, and so is the reverse.
  private redefinedThisVisit: Set<ActionName> = new Set();

  // A rebind arms listeners that live *outside* this scene — `window` for the
  // raw keydown and the game-wide GamepadPlugin — so they are held here and
  // torn down by cancelCapture(). See the comment on that method.
  private captureKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private capturePadHandler:
    ((pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button, value: number) => void) | null = null;
  private captureTimer: Phaser.Time.TimerEvent | null = null;

  // UI containers per tab
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private graphicsContainer!: Phaser.GameObjects.Container;
  private audioContainer!: Phaser.GameObjects.Container;
  private controlsContainer!: Phaser.GameObjects.Container;
  private gamepadContainer!: Phaser.GameObjects.Container;

  // Rebuild-able UI elements
  private graphicsItems: Phaser.GameObjects.Text[] = [];
  private audioItems: Phaser.GameObjects.Text[] = [];
  private controlItems: Phaser.GameObjects.Text[] = [];
  private gamepadItems: Phaser.GameObjects.Text[] = [];

  // Navigation keys
  private navKeys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
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
    this.repairUnboundKeys();
    this.activeTab = 0;
    this.selectedRow = 0;
    this.isCapturing = false;
    this.captureAction = null;
    // menu_define_keys.txt:54 — every definable control starts the screen with
    // its duplication flag clear, so nothing blocks until it has been rebound.
    this.redefinedThisVisit.clear();
    // Scene objects are destroyed on shutdown; drop the stale references too so
    // a second visit doesn't refresh/highlight the previous visit's Text objects.
    this.tabTexts = [];
    this.graphicsItems = [];
    this.audioItems = [];
    this.controlItems = [];
    this.gamepadItems = [];

    // Full overlay background
    this.add.rectangle(320, 208, 640, 416, 0x111122, 0.95).setDepth(0);

    // Title
    this.add.text(320, 20, 'SETTINGS', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    // Tab headers
    this.tabTexts = TABS.map((tab, i) => {
      const t = this.add.text(92 + i * 152, 55, tab, {
        fontSize: '16px', color: '#888888', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(1);
      t.setPadding(10, 8, 10, 8);
      t.setInteractive({ useHandCursor: true });
      // Disarms an in-flight rebind rather than ignoring the tap — the scene-wide
      // rule documented on startKeyCapture(). Ignoring it (the original
      // behaviour) left a tab header that visibly did nothing, which reads as a
      // broken button on touch, and left refreshUI() free to wipe the "Press a
      // key" prompt out from under a capture that was still armed. [ CLOSE ] has
      // always cancelled rather than ignored, so this is consistent with it.
      t.on('pointerdown', () => {
        if (this.isCapturing) {
          // The first input after "Press a key" belongs to the capture, whichever
          // device it comes from. A tap cannot *be* a binding, so all it can do is
          // disarm — but it stops there rather than also switching tab, because a
          // keypress cannot switch tab either: Q and E are legal bindings, so the
          // window listener below swallows them and they never reach update().
          // Round 1 had the tap switch as well, which let the mouse do something
          // mid-capture that the keyboard provably could not. Tap again to switch.
          this.cancelCapture();
          this.refreshUI();
          this.captureStatusText.setText('Rebind cancelled');
          return;
        }
        // Only move the selection when the tab actually changes — tapping the
        // header you are already on used to silently jump you back to row 0.
        if (i !== this.activeTab) { this.activeTab = i; this.selectedRow = 0; }
        this.refreshUI();
      });
      return t;
    });

    // Close button — the only way out of here on a touch device.
    const closeButton = this.add.text(320, 330, '[ CLOSE ]', {
      fontSize: '14px', color: '#88ccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    closeButton.setPadding(14, 12, 14, 12);
    closeButton.setInteractive({ useHandCursor: true });
    closeButton.on('pointerdown', () => this.closeSettings());

    // Tab hint
    this.add.text(320, 392, 'Q/E: Switch Tab | UP/DOWN: Navigate | LEFT/RIGHT: Adjust | ENTER: Select | ESC: Back', {
      fontSize: '9px', color: '#666666', fontFamily: 'monospace',
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
    this.audioContainer = this.add.container(0, 0).setDepth(1);
    this.controlsContainer = this.add.container(0, 0).setDepth(1);
    this.gamepadContainer = this.add.container(0, 0).setDepth(1);

    // Navigation keys
    const kb = this.input.keyboard!;
    this.navKeys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP, false),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN, false),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT, false),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, false),
      tabNext: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E, false),
      tabPrev: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q, false),
    };

    // ENTER is handled as an *event* rather than polled in update(). Phaser
    // dispatches keyboard events synchronously from the DOM handler (see
    // KeyboardManager.onKeyDown -> MANAGER_PROCESS -> KeyboardPlugin.update in
    // node_modules/phaser/src/input/keyboard/KeyboardManager.js:196), so we are
    // still inside the user gesture — which is the only place a browser will
    // honour requestFullscreen(). Polling it from update() ran in a rAF tick,
    // where the request is rejected and Phaser swallows the failure.
    kb.on('keydown-ENTER', this.onConfirmKey, this);

    // ESC is an event for a different reason: polling it with JustDown() in
    // update() *loses* a quick tap. KeyboardManager queues keydown and keyup, and
    // KeyboardPlugin.update() drains the entire queue in one pass
    // (node_modules/phaser/src/input/keyboard/KeyboardPlugin.js:731-744), so when
    // both land in the same frame the keyup's Key.onUp clears `_justDown`
    // (node_modules/phaser/src/input/keyboard/keys/Key.js:318, called from
    // KeyboardPlugin.js:815) before update() ever gets to read it. The emitted
    // `keydown-ESC` fires during that same drain (KeyboardPlugin.js:801) and so
    // cannot be overtaken. Measured before this change: 5 of 12 open/ESC-close
    // cycles left the menu open — which is what "Settings reopen is flaky"
    // actually was. The *close* was dropped, so the next open looked like a no-op.
    kb.on('keydown-ESC', this.onBackKey, this);

    // The Fullscreen row reads this.scale.isFullscreen, which only flips once
    // the browser fires fullscreenchange — after our toggle has returned. The
    // ScaleManager is global, so these have to come off again on shutdown.
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, this.refreshUI, this);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.refreshUI, this);

    // The on-screen D-pad/FIRE would otherwise sit on top of this menu doing
    // nothing. Restored on shutdown, whichever way the menu was closed.
    this.settings.setTouchOverlayHidden(true);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, this.refreshUI, this);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.refreshUI, this);
      this.settings.setTouchOverlayHidden(false);
      // Last line of defence for a rebind that is still armed — closeSettings()
      // already cancels, but the scene can also be stopped from outside.
      this.cancelCapture();
    });

    this.buildGraphicsTab();
    this.buildAudioTab();
    this.buildControlsTab();
    this.buildGamepadTab();
    this.refreshUI();
  }

  update(): void {
    // Nothing here can run mid-capture anyway: the window listener armed by
    // startKeyCapture() sits in the capture phase and calls stopPropagation(), so
    // Phaser's bubble-phase KeyboardManager listener
    // (node_modules/phaser/src/input/keyboard/KeyboardManager.js:230) never queues
    // the event and none of these keys change state. This guard just makes that
    // explicit — and matches the tab headers, which also refuse to act on the
    // input that ends a capture.
    if (this.isCapturing) return;

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
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.left)) {
      this.adjustItem(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.right)) {
      this.adjustItem(1);
    }

    // The Gamepad tab shows a live stick/button readout.
    if (this.activeTab === 3) this.refreshGamepadTab();
  }

  private onConfirmKey(event: KeyboardEvent): void {
    if (event.repeat || this.isCapturing) return;
    event.preventDefault();
    this.activateItem();
  }

  // No preventDefault: ESC is also the browser's own way out of fullscreen, and
  // that one cannot be cancelled anyway. isCapturing is belt-and-braces — an ESC
  // during a rebind is eaten by the window listener and cancels the capture there.
  private onBackKey(event: KeyboardEvent): void {
    if (event.repeat || this.isCapturing) return;
    this.closeSettings();
  }

  // Rows double as touch targets: tapping one selects and activates it, and
  // because pointer events are also dispatched synchronously from the DOM
  // handler, fullscreen works from a tap too.
  private makeRow(
    container: Phaser.GameObjects.Container,
    x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle,
    onTap: () => void
  ): Phaser.GameObjects.Text {
    const t = this.make.text({ x, y, text, style });
    t.setOrigin(0.5);
    t.setPadding(8, 5, 8, 5);
    t.setInteractive({ useHandCursor: true });
    t.on('pointerdown', onTap);
    container.add(t);
    return t;
  }

  private selectAndActivate(row: number): void {
    this.selectedRow = row;
    this.refreshUI();
    this.activateItem();
  }

  // ---- Graphics Tab ----

  private buildGraphicsTab(): void {
    const style = { fontSize: '14px', color: '#cccccc', fontFamily: 'monospace' };
    this.graphicsItems = this.graphicsLabels().map((label, i) =>
      this.makeRow(this.graphicsContainer, 320, 90 + i * 32, label, style, () => this.selectAndActivate(i))
    );
  }

  private graphicsLabels(): string[] {
    const cfg = this.settings.get();
    return [
      // Read the live scale-manager state rather than a stored flag: fullscreen
      // can only be entered from a gesture, so a persisted "ON" would be a lie
      // every time the page reloads.
      `Fullscreen: ${this.scale.isFullscreen ? 'ON' : 'OFF'}`,
      `Pixel Smoothing: ${cfg.graphics.pixelArtSmoothing ? 'ON' : 'OFF'}`,
      `Show FPS: ${cfg.graphics.showFPS ? 'ON' : 'OFF'}`,
      `CRT Filter: < ${crtLabel(cfg.graphics.crtMode)} >`,
      `Touch Controls: < ${touchLabel(cfg.ui.touchControls)} >`,
    ];
  }

  private refreshGraphicsTab(): void {
    const labels = this.graphicsLabels();
    this.graphicsItems.forEach((t, i) => t.setText(labels[i]));
  }

  // ---- Audio Tab ----

  private buildAudioTab(): void {
    const style = { fontSize: '14px', color: '#cccccc', fontFamily: 'monospace' };
    this.audioItems = this.audioLabels().map((label, i) =>
      this.makeRow(this.audioContainer, 320, 90 + i * 32, label, style, () => this.selectAndActivate(i))
    );

    const hint = this.make.text({
      x: 320, y: 240,
      text: 'LEFT / RIGHT adjusts by 10%. Tap a row to nudge it up.',
      style: { fontSize: '10px', color: '#8a8a8a', fontFamily: 'monospace' },
    });
    hint.setOrigin(0.5);
    this.audioContainer.add(hint);
  }

  private audioLabels(): string[] {
    const a = this.settings.get().audio;
    return [
      `Master Volume: < ${pct(a.master)} >`,
      `Music Volume:  < ${pct(a.music)} >`,
      `SFX Volume:    < ${pct(a.sfx)} >`,
      `Mute All: ${a.muted ? 'ON' : 'OFF'}`,
    ];
  }

  private refreshAudioTab(): void {
    const labels = this.audioLabels();
    this.audioItems.forEach((t, i) => t.setText(labels[i]));
  }

  // ---- Controls Tab ----

  // "(fixed)" is the row's own statement that it is read-only, so a Pause row that
  // refuses to rebind doesn't read as a broken row. See DEFINABLE_ACTIONS.
  private controlRowLabel(action: ActionName): string {
    const b = this.settings.get().bindings[action];
    const suffix = DEFINABLE_ACTIONS.has(action) ? '' : '  (fixed)';
    return `${ACTION_LABELS[action]}: [${getKeyName(b.keyboard)}] [${getButtonName(b.gamepadButton)}]${suffix}`;
  }

  private buildControlsTab(): void {
    const actions = Object.keys(ACTION_LABELS) as ActionName[];
    const style = { fontSize: '12px', color: '#cccccc', fontFamily: 'monospace' };

    this.controlItems = actions.map((action, i) =>
      this.makeRow(this.controlsContainer, 320, 90 + i * 28, this.controlRowLabel(action), style,
        () => this.selectAndActivate(i))
    );

    // Add reset option
    const resetIndex = actions.length;
    this.controlItems.push(this.makeRow(
      this.controlsContainer, 320, 90 + resetIndex * 28 + 10, '[ Reset to Defaults ]',
      { fontSize: '12px', color: '#ff8888', fontFamily: 'monospace' },
      () => this.selectAndActivate(resetIndex)
    ));
  }

  private refreshControlsTab(): void {
    const actions = Object.keys(ACTION_LABELS) as ActionName[];
    actions.forEach((action, i) => {
      this.controlItems[i]?.setText(this.controlRowLabel(action));
    });
  }

  // ---- Gamepad Tab ----

  private buildGamepadTab(): void {
    const cfg = this.settings.get().gamepad;
    const style = { fontSize: '14px', color: '#cccccc', fontFamily: 'monospace' };
    const items = [
      `Deadzone: < ${(cfg.deadzone * 100).toFixed(0)}% >`,
      `Analog Movement: ${cfg.analogMovement ? 'ON' : 'OFF'}`,
    ];

    this.gamepadItems = items.map((label, i) =>
      this.makeRow(this.gamepadContainer, 320, 90 + i * 32, label, style, () => this.selectAndActivate(i))
    );

    // Live gamepad status (not selectable — see getActiveItems)
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
    const statusText = this.gamepadItems[2];
    if (statusText && this.input.gamepad) {
      const pad = this.input.gamepad.getPad(0);
      if (pad) {
        const lx = pad.axes[0]?.getValue().toFixed(2) ?? '0';
        const ly = pad.axes[1]?.getValue().toFixed(2) ?? '0';
        const btns = pad.buttons.map((b, i) => (b.pressed ? i : -1)).filter(i => i >= 0).join(',');
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
      case 1: return this.audioItems;
      case 2: return this.controlItems;
      case 3: return this.gamepadItems.slice(0, 2); // Only deadzone and analog are selectable
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
    this.audioContainer.setVisible(this.activeTab === 1);
    this.controlsContainer.setVisible(this.activeTab === 2);
    this.gamepadContainer.setVisible(this.activeTab === 3);

    // Refresh content
    if (this.activeTab === 0) this.refreshGraphicsTab();
    if (this.activeTab === 1) this.refreshAudioTab();
    if (this.activeTab === 2) this.refreshControlsTab();
    if (this.activeTab === 3) this.refreshGamepadTab();

    // Highlight selected row
    const actions = Object.keys(ACTION_LABELS) as ActionName[];
    const items = this.getActiveItems();
    items.forEach((t, i) => {
      if (i === this.selectedRow) { t.setColor('#ffff00'); return; }
      // Dim the read-only control rows (Pause) so "(fixed)" is backed up visually.
      const fixed = this.activeTab === 2 && i < actions.length && !DEFINABLE_ACTIONS.has(actions[i]);
      t.setColor(fixed ? '#8a8a8a' : '#cccccc');
    });

    this.captureStatusText.setText('');
  }

  private activateItem(): void {
    switch (this.activeTab) {
      case 0: this.toggleGraphicsItem(); break;
      case 1: this.toggleAudioItem(); break;
      case 2: this.startKeyCapture(); break;
      case 3: this.toggleGamepadItem(); break;
    }
  }

  private adjustItem(direction: number): void {
    if (this.activeTab === 0) {
      this.adjustGraphicsItem(direction);
    } else if (this.activeTab === 1) {
      this.adjustAudioItem(direction);
    } else if (this.activeTab === 3) {
      this.adjustGamepadItem(direction);
    }
  }

  private toggleGraphicsItem(): void {
    const cfg = this.settings.get();
    switch (this.selectedRow) {
      case 0: // Fullscreen — only works because we are inside a real gesture
        this.settings.toggleFullscreen(this.game);
        this.refreshUI();
        return;
      case 1: // Pixel smoothing
        cfg.graphics.pixelArtSmoothing = !cfg.graphics.pixelArtSmoothing;
        this.restartNotice.setText('* Pixel smoothing change requires page reload *');
        break;
      case 2: // Show FPS
        cfg.graphics.showFPS = !cfg.graphics.showFPS;
        break;
      case 3: // CRT filter — ENTER cycles forward
        this.cycleCRT(1);
        return;
      case 4: // Touch controls overlay
        this.cycleTouchControls(1);
        return;
    }
    this.settings.save();
    this.game.events.emit('settings:changed');
    this.refreshUI();
  }

  private adjustGraphicsItem(direction: number): void {
    if (this.selectedRow === 3) {
      this.cycleCRT(direction);
    } else if (this.selectedRow === 4) {
      this.cycleTouchControls(direction);
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

  private cycleTouchControls(direction: number): void {
    const cfg = this.settings.get();
    const idx = TOUCH_CONTROL_MODES.indexOf(cfg.ui.touchControls);
    const next = (idx + direction + TOUCH_CONTROL_MODES.length) % TOUCH_CONTROL_MODES.length;
    cfg.ui.touchControls = TOUCH_CONTROL_MODES[next];
    this.settings.save();
    this.game.events.emit('settings:changed'); // main.ts re-applies the overlay
    this.refreshUI();
  }

  // ---- Audio ----

  private toggleAudioItem(): void {
    const audio = this.settings.get().audio;
    if (this.selectedRow === 3) {
      audio.muted = !audio.muted;
      this.commitAudio(false);
    } else {
      // Tapping a slider row nudges it up — the only way to move it on touch.
      this.adjustAudioItem(1);
    }
  }

  private adjustAudioItem(direction: number): void {
    const audio = this.settings.get().audio;
    const step = 0.1 * direction;
    const bump = (v: number): number => Math.round(Math.min(1, Math.max(0, v + step)) * 100) / 100;

    switch (this.selectedRow) {
      case 0: audio.master = bump(audio.master); break;
      case 1: audio.music = bump(audio.music); break;
      case 2: audio.sfx = bump(audio.sfx); break;
      default: return; // Mute is a toggle (ENTER / tap), not a slider
    }
    // Blip at the new level so you can hear what you set — but not for the music
    // row, where the change is already audible in the track that is playing.
    this.commitAudio(this.selectedRow !== 1 && !audio.muted);
  }

  private commitAudio(preview: boolean): void {
    this.settings.save();
    this.game.events.emit('settings:changed'); // main.ts pushes it to the mixer
    this.refreshUI();
    // Blip at the new level so you can hear what you just set.
    if (preview && this.cache.audio.exists('menu_selector_move')) {
      this.sound.play('menu_selector_move');
    }
  }

  // ---- Gamepad ----

  private toggleGamepadItem(): void {
    const cfg = this.settings.get();
    if (this.selectedRow === 1) { // Analog movement
      cfg.gamepad.analogMovement = !cfg.gamepad.analogMovement;
      this.settings.save();
      this.game.events.emit('settings:changed');
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

  // ---- Key rebinding ----

  /**
   * Heal a `keyboard: null` binding left behind by an earlier build.
   *
   * DEL used to unbind a control here (see startKeyCapture) and that unbind was
   * persisted: Settings.merge() copies `keyboard === null` through verbatim
   * (src/config/Settings.ts:278) and sanitise() does not touch bindings
   * (src/config/Settings.ts:291-299). The affordance is gone, so nothing can
   * produce a null any more — but a stored one would be a control that can never
   * be pressed and, on Pause, one that can no longer be redefined either.
   * Restoring the default is the only honest way out of a state the UI can no
   * longer reach.
   */
  private repairUnboundKeys(): void {
    const cfg = this.settings.get();
    let repaired = false;
    for (const action of Object.keys(ACTION_LABELS) as ActionName[]) {
      if (cfg.bindings[action].keyboard === null) {
        cfg.bindings[action].keyboard = DEFAULT_SETTINGS.bindings[action].keyboard;
        repaired = true;
      }
      // A non-definable control has no row the player can edit, so ANY stored
      // value other than the default is unreachable — not just null. An earlier
      // build let Pause be moved off ESC; that leaves a row rendering
      // "Pause: [K] [Start] (fixed)" with no way back except Reset to Defaults,
      // which would also wipe the six bindings the player does own.
      if (!DEFINABLE_ACTIONS.has(action)) {
        const def = DEFAULT_SETTINGS.bindings[action];
        if (cfg.bindings[action].keyboard !== def.keyboard
          || cfg.bindings[action].gamepadButton !== def.gamepadButton) {
          cfg.bindings[action] = { ...def };
          repaired = true;
        }
      }
    }
    if (repaired) {
      this.settings.save();
      this.game.events.emit('settings:changed');
    }
  }

  private startKeyCapture(): void {
    const actions = Object.keys(ACTION_LABELS) as ActionName[];

    // Disarm BEFORE any branch below can return.
    //
    // This used to sit *after* the "Reset to Defaults" early-return, so only the
    // rebind path retired a live capture. Tapping "Move Left" and then tapping
    // "[ Reset to Defaults ]" left the window keydown listener and the pad
    // listener armed on moveLeft while selectAndActivate()'s refreshUI() had
    // already wiped the "Press a key" prompt — an armed capture with nothing on
    // screen saying so. The next key pressed was swallowed (the handler is on
    // `window` in the capture phase and calls stopPropagation) and written into
    // moveLeft, silently undoing the reset the user had just performed. ESC,
    // [ CLOSE ] and the 5 s backstop all rescued it, but only if you knew the
    // menu was still listening.
    //
    // The rule for the whole scene is therefore: any pointer interaction disarms
    // an in-flight capture first. Row taps re-arm below on the row just tapped
    // (which also stops a second tap orphaning the first pair of listeners); the
    // tab headers, [ CLOSE ] and this reset branch leave it disarmed.
    this.cancelCapture();

    // Last item is "Reset to Defaults"
    if (this.selectedRow >= actions.length) {
      this.settings.update({ bindings: structuredClone(DEFAULT_SETTINGS.bindings) });
      this.game.events.emit('settings:changed');
      this.refreshControlsTab();
      this.refreshUI();
      return;
    }

    const action = actions[this.selectedRow];

    // Pause is not in the original's definable set — see DEFINABLE_ACTIONS. Say so
    // rather than arming a capture that would refuse the key afterwards.
    if (!DEFINABLE_ACTIONS.has(action)) {
      this.captureStatusText.setText(
        `"${ACTION_LABELS[action]}" is fixed and cannot be redefined`
      );
      return;
    }

    this.captureAction = action;
    this.isCapturing = true;
    this.captureStatusText.setText(`Press a key for "${ACTION_LABELS[action]}" (ESC to cancel)`);

    // Listen for next key press
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return; // a held-down key is one choice, not a stream

      // Never write through a null captureAction: `cfg.bindings[null]` is
      // undefined and assigning to it throws.
      const capturing = this.captureAction;
      if (!capturing) {
        this.cancelCapture();
        return;
      }

      if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) {
        this.endCapture();
        return;
      }

      // Duplicate rejection, straight out of the original — but only against
      // controls already rebound on this visit (`redefinedThisVisit`), which is
      // what the original's per-control duplication flag actually tracks.
      // DEFINE_PLAYER_CONTROL_FROM_KEYPRESS (menu_define_keys.txt:69) refuses a
      // key held by a control whose flag is set and returns false, so
      // `key_pressed = true` never happens, the loop does not advance (:71-85)
      // and the same control is prompted for again: reject and re-prompt, not
      // swap. Controls the player has not reached yet still have the flag clear
      // from :54, so their bindings do NOT block — which is what makes swapping
      // two keys possible, and transient duplicates are expected mid-pass.
      //
      // DEL/BACKSPACE used to unbind at this point. Nothing in the original
      // supports an unbound control: define_default_controls.txt:1-22 binds all
      // seven of player 1's unconditionally, the redefine loop only advances on a
      // real keypress, and draw_control (menu_define_keys.txt:136-178) has no
      // unset branch — it can only render a keyboard, joypad, mouse or stick
      // binding. It was a port invention whose only measured effect was letting
      // the player unbind Pause and lock themselves out of this menu, so it is
      // gone; DEL and BACKSPACE now bind like any other key.
      const cfg = this.settings.get();
      const clash = [...this.redefinedThisVisit].find(
        a => a !== capturing && cfg.bindings[a].keyboard === event.keyCode
      );
      if (clash) {
        this.captureStatusText.setText(
          `${getKeyName(event.keyCode)} is already "${ACTION_LABELS[clash]}" - press another (ESC to cancel)`
        );
        this.armCaptureBackstop(); // still armed on the same action; give them 5s more
        return;
      }

      cfg.bindings[capturing].keyboard = event.keyCode;
      this.redefinedThisVisit.add(capturing); // menu_define_keys.txt:74
      this.settings.save();
      this.game.events.emit('settings:changed');
      this.endCapture();
    };

    // Use raw DOM event to capture any key including ones Phaser might swallow.
    // Deliberately not `once`: a rejected duplicate keeps the capture armed, so
    // the listener has to survive it. cancelCapture() is what removes it.
    this.captureKeyHandler = handler;
    window.addEventListener('keydown', handler, { capture: true });

    const padHandler = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      const capturing = this.captureAction;
      if (!capturing) {
        this.cancelCapture();
        return;
      }
      // Same duplication rule as the keyboard above: the original's check is per
      // control, not per device (menu_define_keys.txt:54,74 bracket the whole
      // redefine regardless of what draw_control ends up rendering), and the
      // defaults are duplicate-free on both devices (DefaultSettings.ts:29-35).
      const cfg = this.settings.get();
      const clash = [...this.redefinedThisVisit].find(
        a => a !== capturing && cfg.bindings[a].gamepadButton === button.index
      );
      if (clash) {
        this.captureStatusText.setText(
          `${getButtonName(button.index)} is already "${ACTION_LABELS[clash]}" - press another (ESC to cancel)`
        );
        this.input.gamepad?.once('down', padHandler); // `once` fired; re-arm it
        this.armCaptureBackstop();
        return;
      }
      cfg.bindings[capturing].gamepadButton = button.index;
      this.redefinedThisVisit.add(capturing); // menu_define_keys.txt:74
      this.settings.save();
      this.game.events.emit('settings:changed');
      this.endCapture();
    };
    this.capturePadHandler = padHandler;
    this.input.gamepad?.once('down', padHandler);

    this.armCaptureBackstop();
  }

  // Timeout — cancel after 5 seconds. Unconditional: on a touch device there
  // may be no keyboard *or* gamepad to end the capture with, and without this
  // the menu would be stuck refusing to navigate. It is a *backstop*, not the
  // disarm: the Clock throws pending timers away on shutdown without firing
  // them (node_modules/phaser/src/time/Clock.js:436), so cancelCapture() is
  // what actually guarantees the listeners go. Restarted on every rejected
  // duplicate, so a re-prompt is not counting down someone else's five seconds.
  private armCaptureBackstop(): void {
    if (this.captureTimer) this.time.removeEvent(this.captureTimer);
    this.captureTimer = this.time.delayedCall(5000, () => {
      this.captureTimer = null;
      if (this.isCapturing) this.endCapture();
    });
  }

  /**
   * Retire an in-flight rebind: both listeners and the backstop timer.
   *
   * The keydown handler is on `window` in the capture phase and the pad handler
   * is on the game-wide GamepadPlugin, so neither dies with the scene. Left
   * armed after the menu closes, the keydown handler swallowed the next key
   * pressed anywhere (its stopPropagation beats Phaser's bubble-phase listener
   * in KeyboardManager) and silently rebound the action to it. The pad handler
   * had the matching problem within a session: the keyboard path ended the
   * capture without removing it, so it stayed armed with captureAction === null
   * and threw on the next button press.
   */
  private cancelCapture(): void {
    if (this.captureKeyHandler) {
      window.removeEventListener('keydown', this.captureKeyHandler, { capture: true });
      this.captureKeyHandler = null;
    }
    if (this.capturePadHandler) {
      this.input.gamepad?.off('down', this.capturePadHandler);
      this.capturePadHandler = null;
    }
    if (this.captureTimer) {
      this.time.removeEvent(this.captureTimer);
      this.captureTimer = null;
    }
    this.isCapturing = false;
    this.captureAction = null;
  }

  private endCapture(): void {
    this.cancelCapture();
    this.refreshControlsTab();
    this.refreshUI();
  }

  private closeSettings(): void {
    // Reachable mid-rebind via [ CLOSE ], and scene.stop() is only *queued*, so
    // drop the capture listeners here rather than waiting for SHUTDOWN.
    this.cancelCapture();

    // main.ts listens for this and re-applies audio + the touch overlay; the CRT
    // pipeline hook picks it up too. Everything else was saved as it was changed.
    this.game.events.emit('settings:changed');

    this.scene.stop(SETTINGS);
    if (this.returnTo) {
      this.scene.bringToTop(this.returnTo);
    }
  }
}
