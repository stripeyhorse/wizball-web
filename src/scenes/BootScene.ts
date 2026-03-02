import Phaser from 'phaser';
import { BOOT, PRELOAD } from '../types/game';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: BOOT });
  }

  create(): void {
    this.scene.start(PRELOAD);
  }
}
