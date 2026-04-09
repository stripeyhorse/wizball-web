import Phaser from 'phaser';
import { BOOT, PRELOAD } from '../types/game';
import { Settings } from '../config/Settings';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: BOOT });
  }

  create(): void {
    // Load persisted settings before anything else
    Settings.getInstance().load();

    this.scene.start(PRELOAD);
  }
}
