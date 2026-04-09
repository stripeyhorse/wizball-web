export interface LevelData {
  level: number;
  width: number;
  height: number;
  tilesetIndex: number;
  startX: number[];
  startY: number;
  cauldronColors: {
    red: [number, number, number];
    green: [number, number, number];
    blue: [number, number, number];
  };
}

export const LEVEL_HEIGHT = 416;
export const TILE_SIZE = 16;

export const LEVELS: LevelData[] = [
  {
    level: 1,
    width: 224,
    height: 26,
    tilesetIndex: 0,
    startX: [1112, 1408, 2200, 2544],
    startY: 32,
    cauldronColors: {
      red: [255, 0, 0],
      green: [255, 0, 255],
      blue: [0, 255, 255],
    },
  },
  {
    level: 2,
    width: 258,
    height: 26,
    tilesetIndex: 1,
    startX: [768, 1728, 2448, 3152],
    startY: 32,
    cauldronColors: {
      red: [128, 64, 32],
      green: [255, 128, 0],
      blue: [255, 255, 0],
    },
  },
  {
    level: 3,
    width: 272,
    height: 26,
    tilesetIndex: 2,
    startX: [832, 1200, 1932, 2560, 3072, 3456],
    startY: 32,
    cauldronColors: {
      red: [0, 0, 255],
      green: [255, 0, 255],
      blue: [0, 255, 255],
    },
  },
  {
    level: 4,
    width: 260,
    height: 26,
    tilesetIndex: 3,
    startX: [1072, 1840, 2432, 3280],
    startY: 32,
    cauldronColors: {
      red: [128, 64, 32],
      green: [0, 255, 0],
      blue: [255, 255, 0],
    },
  },
  {
    level: 5,
    width: 260,
    height: 26,
    tilesetIndex: 4,
    startX: [688, 1280, 2832],
    startY: 32,
    cauldronColors: {
      red: [255, 0, 0],
      green: [255, 128, 0],
      blue: [0, 255, 255],
    },
  },
  {
    level: 6,
    width: 260,
    height: 26,
    tilesetIndex: 5,
    startX: [1504, 1680, 2848, 3040],
    startY: 32,
    cauldronColors: {
      red: [0, 0, 255],
      green: [255, 0, 255],
      blue: [255, 255, 0],
    },
  },
  {
    level: 7,
    width: 256,
    height: 26,
    tilesetIndex: 6,
    startX: [1856, 2816, 3008],
    startY: 32,
    cauldronColors: {
      red: [255, 0, 0],
      green: [255, 0, 255],
      blue: [255, 255, 0],
    },
  },
  {
    level: 8,
    width: 260,
    height: 26,
    tilesetIndex: 7,
    startX: [736, 1424, 1952, 2480, 3120],
    startY: 32,
    cauldronColors: {
      red: [128, 64, 32],
      green: [255, 128, 128],
      blue: [0, 255, 255],
    },
  },
];

export function getLevelData(level: number): LevelData | undefined {
  return LEVELS.find((l) => l.level === level);
}

export function getLevelWidth(level: number): number {
  const data = getLevelData(level);
  return data ? data.width * TILE_SIZE : 3584;
}
