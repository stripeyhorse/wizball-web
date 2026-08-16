import Phaser from 'phaser';
import { GAME, MAXIMUM_POSSIBLE_SCORE } from '../types/game';
import { WeaponFlag } from '../types/game';
import { playSceneMusic } from '../systems/MusicManager';

interface UpgradeOption {
  frame: string;
  flag: number;
  label: string;
}

// C++ constant.txt:217 — 2100 frames of shield (~30s at 60Hz).
const SHIELD_STARTING_ENERGY = 2100;
// Every C++ write to wizball_shield_stored_health / cat_shield_stored_health is
// either that constant or a `!< 0` decrement (wizball.txt:914, :920, :1067-1098,
// :1122-1132, plus the on-hit penalties in wizball_shield_bubble_layer.txt:137-139
// and catellite_shield_swirl_layer.txt:115-117), so [0, SHIELD_STARTING_ENERGY] is
// the invariant to hold on a payload we did not produce. Number.isFinite() first: a
// NaN loses every comparison and would survive a bare Math.min with the bitflag
// still set, i.e. a shield that never expires.
//
// The C++ globals are INTEGER counters decremented by exactly 1 a frame
// (wizball.txt:1123 `let temp_1 = temp_1 - 1 !< 0`), so the range is not the whole
// invariant — integrality is too. A fractional remainder (3.5, say) walks straight
// past every `=== 0` test forever: 3.5 -> 2.5 -> ... -> -0.5, counter negative and
// bitflag still set, which is precisely the "flag with nothing behind it" state this
// helper exists to make unrepresentable. Math.trunc pins it to the C++'s integers.
const clampShieldEnergy = (v: number | undefined): number =>
  Number.isFinite(v)
    ? Math.trunc(Math.min(Math.max(v as number, 0), SHIELD_STARTING_ENERGY))
    : 0;

export default class LaboratoryScene extends Phaser.Scene {
  private level: number = 1;
  private score: number = 0;
  private weaponCollection: number = 0;
  // C++ wizball_starting_loadout — the PERMANENT loadout, written only here
  // (lab_manage_permanent_upgrade_icons.txt:170) and read on every new life
  // (wizball.txt:178). Distinct from the in-level loadout (wizball_current_loadout,
  // = this.weaponCollection). Optional in the scene payload: GameScene may not
  // carry it yet, in which case the in-level collection stands in for it.
  private startingLoadout: number = 0;
  private lives: number = 2;
  private levelProgress: number = 3; // 3 => the level's last stage just finished
  private cauldronFill: number[] = [0, 0, 0, 0];
  // C++ LEVEL_COMPLETION_ARRAY_ID and the warp window derived from it
  // (main_game_controller.txt:1067-1093 find_highest_accessable_level, read again at
  // background.txt:53) live on the persistent main_game_controller entity — they are
  // never rebuilt from the current level number. The lab is a pass-through for them:
  // GameScene sends them out on the bonus hop and must get the same values back, or
  // its accessible-level window silently re-derives itself every lab visit. Left
  // undefined when the caller does not carry them, which GameScene tolerates.
  private levelCompletion?: number[];
  private minOpenLevel?: number;
  private maxOpenLevel?: number;
  // The two shield counters are C++ globals and NOTHING in the laboratory touches
  // them — lab_manage_permanent_upgrade_icons.txt contains no shield reference at
  // all. A repo-wide grep finds writes only at wizball.txt:914/:920 (new life),
  // :1067/:1076-1079/:1086/:1095-1098 (the invulnerability pearl), the per-frame
  // decrement in update_shield_counter (:1122-1132) and the two on-hit penalties
  // (wizball_shield_bubble_layer.txt:137-139, catellite_shield_swirl_layer.txt:
  // 115-117). So the remainders simply persist across a lab visit, and this scene
  // is a pass-through for them exactly like the level window above. Not relaying
  // them zeroed both counters on the way back to GameScene while weaponCollection
  // still carried the matching INVULNERABILITY bitflags — a shield the next level
  // claimed but had no time behind.
  private shieldEnergy: number = 0;
  private catShieldEnergy: number = 0;
  // C++ player_display_score is global across the lab too — start_game.txt:5 is the
  // only place it is zeroed — and it rolls toward player_score after re-entry,
  // awarding a life on every 100,000 barrier the roll crosses
  // (manage_score_and_enemy_display.txt:30-60). The lab hands out points (+2000 on
  // entry, the decline bonus, +7490 on fly-through) while the display score stands
  // still, so those barriers are crossed by the roll on the OTHER side of this
  // scene: drop the field and GameScene re-seeds its sector from the new total and
  // never pays the life. Relayed untouched, `undefined` included — GameScene owns
  // the default, we do not invent one.
  private displayScore?: number;
  private options: UpgradeOption[] = [];
  private selectedIndex: number = 0;
  private icons: Phaser.GameObjects.Image[] = [];
  private instructionText!: Phaser.GameObjects.Text;
  private selectionText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private complete: boolean = false;
  // C++ lab_manage_permanent_upgrade_icons.txt:104-108 gates FIRE on
  // effect_fullness reaching target_effect_fullness. That ramps 0 → 10000 at
  // effect_fullness_adaption_rate (200) per frame (:19,:23-24,:190-194), i.e.
  // 50 frames while the icon ring fades in.
  private fireLockFrames: number = 50;
  private tLeft = false;
  private tRight = false;
  private tFire = false;

  constructor() {
    super({ key: 'Laboratory' });
  }

  init(data: {
    level: number; score?: number; weaponCollection?: number; lives?: number;
    levelProgress?: number; cauldronFill?: number[]; startingLoadout?: number;
    levelCompletion?: number[]; minOpenLevel?: number; maxOpenLevel?: number;
    shieldEnergy?: number; catShieldEnergy?: number; displayScore?: number;
  }): void {
    this.level = data.level || 1;
    this.score = data.score || 0;
    this.weaponCollection = data.weaponCollection || 0;
    // Fall back to the in-level collection when the payload has no permanent
    // loadout yet, so the icon list is never wrong either way.
    this.startingLoadout = data.startingLoadout ?? this.weaponCollection;
    this.lives = data.lives ?? 2;
    this.levelProgress = data.levelProgress ?? 3;
    this.cauldronFill = data.cauldronFill ? [...data.cauldronFill] : [0, 0, 0, 0];
    // Carried, not re-derived — see the field declarations above.
    this.levelCompletion = data.levelCompletion ? [...data.levelCompletion] : undefined;
    this.minOpenLevel = data.minOpenLevel;
    this.maxOpenLevel = data.maxOpenLevel;
    // The rolling display score rides through the lab, but it is still a payload
    // field we did not produce, and the invariant
    // manage_score_and_enemy_display.txt:30-59 maintains is display <= score: a
    // display that LEADS the real score re-crosses a 100,000 boundary on the way
    // back down and pays a life that was never earned. Clamped against the score as
    // it arrived — this runs before the +2000 lab award below, so the award stays
    // ahead of the roll and GameScene still pays the crossing it causes.
    //
    // Materialised rather than relayed as undefined when the caller sends nothing:
    // GameScene's `?? this.score` fallback would then seed the display from the
    // POST-lab total and swallow exactly that crossing (see its init()). Non-finite
    // input takes the same fallback — NaN loses every comparison and would sail
    // through Phaser.Math.Clamp unchanged, poisoning lastScoreSector with NaN.
    this.displayScore = Number.isFinite(data.displayScore)
      ? Phaser.Math.Clamp(data.displayScore as number, 0, this.score)
      : this.score;
    // Carry the shield remainders; never refill them, because there is no lab-side
    // top-up in the C++ (only wizball.txt:914/:920 on a new life and the pearl at
    // :1067-1098 write SHIELD_STARTING_ENERGY). Keep each bitflag consistent with
    // its counter the way update_shield_counter does (wizball.txt:1126-1128 and
    // :1134-1136): no stored health means no shield. That also covers a caller that
    // sends no remainder at all — relaying a set flag over a zeroed or absent
    // counter is the bug this relay closes, not one to recreate.
    this.shieldEnergy = (this.weaponCollection & WeaponFlag.INVULNERABILITY)
      ? clampShieldEnergy(data.shieldEnergy)
      : 0;
    if (this.shieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.INVULNERABILITY;
    this.catShieldEnergy = (this.weaponCollection & WeaponFlag.CATELLITE_INVULNERABILITY)
      ? clampShieldEnergy(data.catShieldEnergy)
      : 0;
    if (this.catShieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.CATELLITE_INVULNERABILITY;
    // C++ main_game_controller.txt:508-510 — entering the lab awards +2000, and
    // :509 is `let temp_2 = temp_2 + 2000 !> MAXIMUM_POSSIBLE_SCORE`: the clamp is
    // on the add site itself, not left to whoever reads the score next.
    this.score = Math.min(MAXIMUM_POSSIBLE_SCORE, this.score + 2000);

    // Per-visit state. These were field initialisers only, which run once in the
    // constructor — Phaser reuses the scene instance forever. `complete` stayed
    // true after the first visit, so update() bailed on frame one and the second
    // laboratory accepted no input at all: an unrecoverable softlock.
    this.complete = false;
    this.fireLockFrames = 50;
    this.selectedIndex = 0;
    this.options = [];
    this.icons = [];
    this.tLeft = false;
    this.tRight = false;
    this.tFire = false;
  }

  create(): void {
    this.add.rectangle(320, 184, 640, 368, 0x1a1a2a).setDepth(-1);
    this.add.rectangle(320, 92, 520, 96, 0x0b1020, 0.65).setStrokeStyle(2, 0x314260).setDepth(1);

    this.add.text(320, 40, 'THE WIZARD\'S LABORATORY', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.add.text(320, 70,
      this.levelProgress >= 3 ? `LEVEL ${this.level} COMPLETE` : `LEVEL ${this.level} — COLOUR ${this.levelProgress} / 3`, {
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

    // (No sound.add() pre-warming here: playback below goes through
    // this.sound.play(), which self-cleans. The two Sound objects this used to
    // create were never played and were never destroyed — one pair leaked per
    // laboratory visit.)
    playSceneMusic(this, 'wizball_laboratory');
  }

  // C++ lab_manage_permanent_upgrade_icons.txt:28-81 — the icon list is built
  // from wizball_starting_loadout, not from the in-level collection.
  private buildOptions(): UpgradeOption[] {
    const options: UpgradeOption[] = [];
    const loadout = this.startingLoadout;

    if (!(loadout & WeaponFlag.LATERAL_CONTROL)) {
      options.push({ frame: 'panel_icons_11', flag: WeaponFlag.LATERAL_CONTROL, label: 'CONTROL LEFT / RIGHT' });
    } else if (!(loadout & WeaponFlag.VERTICAL_CONTROL)) {
      options.push({ frame: 'panel_icons_12', flag: WeaponFlag.VERTICAL_CONTROL, label: 'FULL CONTROL' });
    }

    if (!(loadout & WeaponFlag.SHIELD_FIRE)) {
      options.push({ frame: 'panel_icons_13', flag: WeaponFlag.SHIELD_FIRE, label: 'SHIELD FIRE' });
    } else if (!(loadout & WeaponFlag.REAR_FIRE)) {
      options.push({ frame: 'panel_icons_14', flag: WeaponFlag.REAR_FIRE, label: 'REAR FIRE' });
    }

    if (!(loadout & WeaponFlag.CATELLITE)) {
      options.push({ frame: 'panel_icons_15', flag: WeaponFlag.CATELLITE, label: 'CAT' });
    }

    if (!(loadout & WeaponFlag.DOUBLE_FIRE)) {
      options.push({ frame: 'panel_icons_16', flag: WeaponFlag.DOUBLE_FIRE, label: 'FAST FIRE' });
    }

    if (!(loadout & WeaponFlag.WIZ_SPREAD_FIRE)) {
      options.push({ frame: 'panel_icons_17', flag: WeaponFlag.WIZ_SPREAD_FIRE, label: 'WIZ SPREAD FIRE' });
    } else if (!(loadout & WeaponFlag.CAT_SPREAD_FIRE)) {
      options.push({ frame: 'panel_icons_18', flag: WeaponFlag.CAT_SPREAD_FIRE, label: 'CAT SPREAD FIRE' });
    }

    // "Always spawn an exit! ALWAYS!" — C++ :78-81.
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
    // C++ :104-108 — FIRE is only read once the icon ring has finished fading
    // in. Without this a FIRE still held from the level (the on-screen touch
    // button in particular, which reports as held rather than as a fresh press)
    // confirmed the first icon on the laboratory's opening frame.
    if (this.fireLockFrames > 0) return;
    this.complete = true;

    const selected = this.options[this.selectedIndex];
    if (selected && selected.flag !== 0) {
      // C++ :152-157 writes the chosen flag into wizball_starting_loadout. The
      // in-level collection gets it too so the upgrade still lands if the scene
      // payload isn't carrying a permanent loadout yet.
      this.startingLoadout |= selected.flag;
      this.weaponCollection |= selected.flag;
      if (selected.flag === WeaponFlag.WIZ_SPREAD_FIRE) {
        this.startingLoadout &= ~WeaponFlag.CAT_SPREAD_FIRE;
        this.weaponCollection &= ~WeaponFlag.CAT_SPREAD_FIRE;
      } else if (selected.flag === WeaponFlag.CAT_SPREAD_FIRE) {
        this.startingLoadout &= ~WeaponFlag.WIZ_SPREAD_FIRE;
        this.weaponCollection &= ~WeaponFlag.WIZ_SPREAD_FIRE;
      }
    } else {
      // C++ lab_manage_permanent_upgrade_icons.txt:158-167 — declining the bonus
      // ("No bonus = lotsa' points! Ish.") awards points instead.
      //
      // KNOWN DIVERGENCE, deliberately left in place. The original contains a
      // typo: :161 reads player_on_level_number into temp_3 and :162 immediately
      // clobbers it with `9 - temp_2` — almost certainly meant to be `9 - temp_3`.
      // temp_2 is unassigned at that point (its first write in the file is :165),
      // and it resolves to a determinate 0, not junk: temp_2 is ENT_TEMP_2, a
      // per-entity slot, and every spawn memcpys the global `reset_entity` over an
      // entity's variables (scripting.cpp:545); reset_entity is zeroed at boot
      // (scripting.cpp:3036) and its only non-zero writer is the prefab path
      // (scripting.cpp:10001), which this game never uses — `grep -rn prefab
      // wizball/scripts/` finds nothing. So the original awards a flat 9000 at
      // every level, and the level read at :161 is dead code.
      //
      // This port implements the EVIDENT INTENT, (9 - level) * 1000, which pays
      // 8000 on level 1 down to 1000 on level 8. That is a real scoring
      // difference of up to 8000 per decline, and it moves which 100,000
      // extra-life boundaries get crossed. Switching to a flat 9000 would be the
      // parity-faithful choice — the same call this port already makes for the
      // world-edge wraparound in WorldCollision.ts — and is a one-line change
      // here. It is a gameplay decision, not a bug to be quietly "fixed" in
      // either direction: two earlier passes rewrote this comment with a
      // different wrong claim each time.
      //
      // The MAXIMUM_POSSIBLE_SCORE clamp matches the add site at :166.
      this.score = Math.min(
        MAXIMUM_POSSIBLE_SCORE, this.score + Math.max(0, (9 - this.level)) * 1000
      );
    }

    if (this.cache.audio.exists('permanent_upgrade_selected')) {
      this.sound.play('permanent_upgrade_selected');
    }

    this.instructionText.setText('PREPARING NEXT LEVEL...');
    this.time.delayedCall(900, () => this.nextLevel());
  }

  // The carried-forward half of the outbound payload, READ AT THE MOMENT OF THE
  // HANDOFF rather than snapshotted earlier. This used to be a `const shared = {...}`
  // built at the top of nextLevel(), i.e. BEFORE the +7490 fly-through bonus was
  // added a dozen lines further down (C++ flythru.txt:35), and the two spreads below
  // then shipped the pre-bonus score: every completed level silently binned its
  // fly-through award (7490 x 7 = 52,430 points over an eight-level run). Only the
  // level-8 -> GameComplete branch was correct, because it reads this.score directly,
  // which is why the loss never showed up on a spot check. Building the object inside
  // a method makes the ordering bug unrepresentable — there is no window between the
  // read and the spread in which a field can still change.
  private buildPayload(): {
    score: number; weaponCollection: number; startingLoadout: number; lives: number;
    levelCompletion?: number[]; minOpenLevel?: number; maxOpenLevel?: number;
    shieldEnergy: number; catShieldEnergy: number; displayScore?: number;
  } {
    return {
      score: this.score,
      weaponCollection: this.weaponCollection,
      // C++ :170 set_global_flag (wizball_starting_loadout, ...). Forwarded even
      // when GameScene doesn't read it yet — an ignored extra payload field is
      // harmless, a dropped one loses the permanent upgrade.
      startingLoadout: this.startingLoadout,
      lives: this.lives,
      // The persistent completion array and its warp window ride back to GameScene
      // untouched (C++ main_game_controller.txt:1067-1093) — dropping them makes
      // GameScene.init() fall into its reconstruction fallback on every lab exit.
      levelCompletion: this.levelCompletion,
      minOpenLevel: this.minOpenLevel,
      maxOpenLevel: this.maxOpenLevel,
      // Globals in the C++, so pass-throughs here (see the field declarations):
      // the shield remainders and the rolling display score all have to survive the
      // lab or the next level starts with a shield of zero frames and a score
      // barrier that never pays its life.
      shieldEnergy: this.shieldEnergy,
      catShieldEnergy: this.catShieldEnergy,
      displayScore: this.displayScore
    };
  }

  private nextLevel(): void {
    if (this.levelProgress >= 3) {
      // Level fully done (all 3 colour stages). C++ flythru.txt:35 awards +7490
      // for the fly-through to the next level, clamped on the same line. Advance,
      // or finish the game. Note the score mutation happens BEFORE either handoff
      // below — hence buildPayload() being called at the scene.start, not up here.
      this.score = Math.min(MAXIMUM_POSSIBLE_SCORE, this.score + 7490);
      if (this.level >= 8) {
        this.scene.start('GameComplete', { score: this.score, level: this.level });
        return;
      }
      // C++ CAULDRON_FULLNESS_ARRAY persists across the whole game (only drained
      // per completed stage), so any surplus paint carries to the next level.
      this.scene.start(GAME, { ...this.buildPayload(), level: this.level + 1, levelProgress: 0, cauldronFill: this.cauldronFill });
    } else {
      // More colour stages remain — return to the SAME level, resuming progress.
      this.scene.start(GAME, { ...this.buildPayload(), level: this.level, levelProgress: this.levelProgress, cauldronFill: this.cauldronFill });
    }
  }

  update(): void {
    if (this.complete) return;

    if (this.fireLockFrames > 0) this.fireLockFrames--;

    // NOTE ON DIRECTION: C++ :94-102 has RIGHT decrement and LEFT increment,
    // which looks inverted next to the mapping below — but it isn't. In the C++
    // the icons sit on a ring (lab_permanent_upgrade_icon.txt: world_x =
    // 128*sin(current_angle - index*angle_size) + 320), so the index grows
    // leftwards around the ring and LEFT+1 selects the icon visually to the
    // left. This port draws a linear row with index growing rightwards
    // (createIcons: startX + index * spacing), so LEFT-1 selects the icon
    // visually to the left — same result, mirrored geometry. The C++ bounds
    // `!< 0 !> icon_total_indices_minus_one` are a modular wrap, not a clamp
    // (scripting.cpp:6186-6193, 6206-6213), which Phaser.Math.Wrap matches.
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left!)) {
      this.moveSelection(-1);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right!)) {
      this.moveSelection(1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
      this.confirmSelection();
    }

    // On-screen touch controls (mobile): d-pad changes the choice, FIRE accepts.
    const t = (window as unknown as { __wizTouch?: Record<string, boolean> }).__wizTouch || {};
    if (t.moveLeft && !this.tLeft) this.moveSelection(-1);
    if (t.moveRight && !this.tRight) this.moveSelection(1);
    if (t.fire && !this.tFire) this.confirmSelection();
    this.tLeft = !!t.moveLeft; this.tRight = !!t.moveRight; this.tFire = !!t.fire;
  }
}
