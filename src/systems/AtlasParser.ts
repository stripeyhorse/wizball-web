export interface AtlasFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
}

export function parseArbAtlas(text: string): AtlasFrame[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) {
    throw new Error('Empty atlas file');
  }

  const frameCount = parseInt(lines[0], 10);
  if (isNaN(frameCount)) {
    throw new Error(`Invalid frame count: ${lines[0]}`);
  }

  const frames: AtlasFrame[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('//')) continue;

    const parts = line.split('\t')[0].split(',').map(p => parseInt(p.trim(), 10));
    if (parts.length !== 6) {
      console.warn(`Skipping malformed line ${i}: ${line}`);
      continue;
    }

    frames.push({
      x: parts[0],
      y: parts[1],
      width: parts[2],
      height: parts[3],
      pivotX: parts[4],
      pivotY: parts[5]
    });
  }

  if (frames.length !== frameCount) {
    console.warn(`Expected ${frameCount} frames, got ${frames.length}`);
  }

  return frames;
}

export function createPhaserAtlasJSON(frames: AtlasFrame[], textureName: string): any {
  const framesObj: any = {};
  frames.forEach((frame, i) => {
    framesObj[`${textureName}_${i}`] = {
      frame: {
        x: frame.x,
        y: frame.y,
        w: frame.width,
        h: frame.height
      },
      rotated: false,
      trimmed: false,
      spriteSourceSize: {
        x: frame.pivotX - (frame.width / 2),
        y: frame.pivotY - (frame.height / 2),
        w: frame.width,
        h: frame.height
      },
      sourceSize: {
        w: frame.width,
        h: frame.height
      }
    };
  });

  return {
    meta: {
      app: 'Wizball Phaser',
      version: '1.0',
      image: `${textureName}.png`,
      format: 'RGBA8888',
      size: { w: 0, h: 0 },
      scale: 1
    },
    frames: framesObj
  };
}
