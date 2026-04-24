import Phaser from 'phaser';

export interface MusicOptions {
  loop?: boolean;
  volume?: number;
}

const DEFAULT_MUSIC_VOLUME = 0.35;

export interface SceneMusic {
  sound: Phaser.Sound.BaseSound;
  stop: () => void;
}

// Attach background music to a scene. Auto-stops on scene shutdown/destroy.
// No-ops safely if the audio key isn't cached (e.g. asset missing).
export function playSceneMusic(
  scene: Phaser.Scene,
  key: string,
  opts: MusicOptions = {}
): SceneMusic | null {
  if (!scene.cache.audio.exists(key)) return null;

  const volume = opts.volume ?? DEFAULT_MUSIC_VOLUME;
  const loop = opts.loop ?? true;
  const sound = scene.sound.add(key, { loop, volume });
  sound.play();

  const stop = () => {
    if (sound.isPlaying) sound.stop();
    sound.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  scene.events.once(Phaser.Scenes.Events.DESTROY, stop);

  return { sound, stop };
}
