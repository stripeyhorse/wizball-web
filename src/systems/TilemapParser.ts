// Tile boolean property flags from C++ tilesets.h
export const BOOL_CONVEY = 1;
export const BOOL_ACCELLERATE = 2;
export const BOOL_SLIPPERY = 4;
export const BOOL_CLIMBABLE_UP_DOWN = 8;
export const BOOL_CLIMBABLE_LEFT_RIGHT = 16;
export const BOOL_CLIMBABLE_OMNI = 32;
export const BOOL_CLIMBABLE_WALL_UP_DOWN = 64;
export const BOOL_CLIMBABLE_MONKEY_BARS = 128;
export const BOOL_STICKY_WALL = 256;
export const BOOL_STICKY_FLOOR = 512;
export const BOOL_DEADLY = 1024;
export const BOOL_KLUDGE_UP_BLOCK = 2048;
export const BOOL_KLUDGE_DOWN_BLOCK = 4096;
export const BOOL_DEKLUDGER = 8192;
export const BOOL_TILE_PATHFIND_IGNORE = 16384;
export const BOOL_ZONE_PATHFIND_IGNORE = 32768;
export const BOOL_WATER = 65536;
export const BOOL_DEEP_WATER = 131072;
export const BOOL_HARMFUL = 262144;
export const BOOL_FORCE_FIELD = 524288;
export const BOOL_SLOPE_RIGHT = 1048576;
export const BOOL_SLOPE_LEFT = 2097152;

export interface ParsedTilemap {
  width: number;
  height: number;
  tilesetIndex: number;
  layers: number[][];
  solidTiles: Set<number>;
  tileDefinitions: TileDefinition[];
  warpZones: WarpZone[];
  spawnPoints: SpawnPoint[];
}

export interface TileDefinition {
  shape: number;
  solidSides: number;
  collisionMask: number;
  // Full tile properties from C++ tileset
  defaultEnergy: number;
  nextOfKin: number;
  vulnerabilityFlag: boolean;
  vulnerabilities: [number, number, number, number]; // top, right, bottom, left
  booleanProperties: number;
  conveyX: number;
  conveyY: number;
  accelX: number;
  accelY: number;
  friction: number;
  priority: number;
  deadScript: string;
  params: number;
}

export interface WarpZone {
  name: string;
  script: string;
  x: number;
  y: number;
}

export interface SpawnPoint {
  name: string;
  script: string;
  x: number;
  y: number;
  idType: string;
  uid: number;
  parentUid: number;
  nextSiblingUid: number;
  parameters: number[];
}

function createDefaultTileDefinition(): TileDefinition {
  return {
    shape: 0,
    solidSides: 0,
    collisionMask: 0,
    defaultEnergy: 0,
    nextOfKin: 0,
    vulnerabilityFlag: false,
    vulnerabilities: [0, 0, 0, 0],
    booleanProperties: 0,
    conveyX: 0,
    conveyY: 0,
    accelX: 0,
    accelY: 0,
    friction: 0,
    priority: 0,
    deadScript: 'UNSET',
    params: 0
  };
}

export function parseTilemap(tilemapText: string, tilesetText: string): ParsedTilemap {
  const tilemapLines = tilemapText.split('\n').map(l => l.trim());
  const tilesetLines = tilesetText.split('\n').map(l => l.trim());

  let width = 224;
  let height = 26;
  let tilesetIndex = 0;
  const layers: number[][] = [[], [], []];
  const warpZones: WarpZone[] = [];
  const spawnPoints: SpawnPoint[] = [];

  for (const line of tilemapLines) {
    if (line.startsWith('#MAP WIDTH')) {
      width = parseInt(line.split('=')[1].trim(), 10);
    } else if (line.startsWith('#MAP HEIGHT')) {
      height = parseInt(line.split('=')[1].trim(), 10);
    } else if (line.startsWith('#DEFAULT TILE SET')) {
      const match = line.match(/TILESET_#(\d+)/);
      if (match) {
        tilesetIndex = parseInt(match[1], 10);
      }
    }
  }

  // Parse tile data
  const tileValues: number[] = [];
  let inTileData = false;

  for (const line of tilemapLines) {
    if (line.startsWith('#MAP TILE DATA')) {
      inTileData = true;
      continue;
    }

    if (line.startsWith('#MAP GROUP DATA')) {
      break;
    }

    if (!inTileData || line === '' || line.startsWith('#')) {
      continue;
    }

    const values = line
      .split(',')
      .map(v => parseInt(v.trim(), 10))
      .filter(v => !Number.isNaN(v));

    tileValues.push(...values);
  }

  const layerSize = width * height;
  for (let layerIndex = 0; layerIndex < 3; layerIndex++) {
    const start = layerIndex * layerSize;
    const end = start + layerSize;
    layers[layerIndex] = tileValues.slice(start, end);
  }

  // Parse tileset - extract ALL properties per tile
  const solidTiles = new Set<number>();
  const tileDefinitions: TileDefinition[] = [];
  let currentTile = -1;

  const getOrCreateTileDefinition = (tileNumber: number): TileDefinition => {
    if (!tileDefinitions[tileNumber]) {
      tileDefinitions[tileNumber] = createDefaultTileDefinition();
    }

    return tileDefinitions[tileNumber];
  };

  for (let i = 0; i < tilesetLines.length; i++) {
    const line = tilesetLines[i];

    if (line.startsWith('#TILE NUMBER')) {
      const match = line.match(/TILE NUMBER = (\d+)/);
      if (match) {
        currentTile = parseInt(match[1], 10);
        getOrCreateTileDefinition(currentTile);
      }
    } else if (currentTile >= 0) {
      const tileDefinition = getOrCreateTileDefinition(currentTile);

      if (line.startsWith('#TILE SHAPE')) {
        tileDefinition.shape = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#SOLID SIDES')) {
        const rawSolidSides = parseInt(line.split('=')[1].trim(), 10);
        tileDefinition.solidSides = 255 - rawSolidSides;
        if (rawSolidSides > 0) {
          solidTiles.add(currentTile);
        }
      } else if (line.startsWith('#COLLISION MASK')) {
        tileDefinition.collisionMask = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#DEFAULT ENERGY')) {
        tileDefinition.defaultEnergy = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#NEXT OF KIN')) {
        tileDefinition.nextOfKin = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#VULNERABLE')) {
        tileDefinition.vulnerabilityFlag = line.split('=')[1].trim() === 'TRUE';
      } else if (line.startsWith('#VULNERABILITY (TOP)')) {
        tileDefinition.vulnerabilities[0] = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#VULNERABILITY (RIGHT)')) {
        tileDefinition.vulnerabilities[1] = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#VULNERABILITY (BOTTOM)')) {
        tileDefinition.vulnerabilities[2] = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#VULNERABILITY (LEFT)')) {
        tileDefinition.vulnerabilities[3] = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#BOOLEAN PROPERTIES')) {
        tileDefinition.booleanProperties = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#X CONVEY')) {
        tileDefinition.conveyX = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#Y CONVEY')) {
        tileDefinition.conveyY = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#X ACCELL')) {
        tileDefinition.accelX = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#Y ACCELL')) {
        tileDefinition.accelY = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#FRICTION')) {
        tileDefinition.friction = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#PRIORITY')) {
        tileDefinition.priority = parseInt(line.split('=')[1].trim(), 10);
      } else if (line.startsWith('#DEAD SCRIPT')) {
        tileDefinition.deadScript = line.split('=')[1].trim();
      } else if (line.startsWith('#PARAMETERS')) {
        tileDefinition.params = parseInt(line.split('=')[1].trim(), 10);
      }
    }
  }

  // Parse spawn points (including warp zones and enemy spawns)
  let currentSpawnPoint: Partial<SpawnPoint> | null = null;

  const maybeCommitSpawnPoint = (): void => {
    if (!currentSpawnPoint) return;

    const sp: SpawnPoint = {
      name: currentSpawnPoint.name ?? '',
      script: currentSpawnPoint.script ?? '',
      x: currentSpawnPoint.x ?? 0,
      y: currentSpawnPoint.y ?? 0,
      idType: currentSpawnPoint.idType ?? '',
      uid: currentSpawnPoint.uid ?? 0,
      parentUid: currentSpawnPoint.parentUid ?? -1,
      nextSiblingUid: currentSpawnPoint.nextSiblingUid ?? -1,
      parameters: currentSpawnPoint.parameters ?? []
    };

    spawnPoints.push(sp);

    if (sp.idType === 'WARP_ZONES') {
      warpZones.push({
        name: sp.name,
        script: sp.script,
        x: sp.x,
        y: sp.y
      });
    }
  };

  let parsingParameters = false;
  let parameterValues: number[] = [];

  for (const line of tilemapLines) {
    if (line.startsWith('#SPAWN POINT NUMBER')) {
      maybeCommitSpawnPoint();
      currentSpawnPoint = {};
      parsingParameters = false;
      parameterValues = [];
      continue;
    }

    if (!currentSpawnPoint) {
      continue;
    }

    if (line.startsWith('#NAME = ')) {
      currentSpawnPoint.name = line.split('=')[1].trim();
    } else if (line.startsWith('#SCRIPT = ')) {
      currentSpawnPoint.script = line.split('=')[1].trim();
    } else if (line.startsWith('#X POS = ')) {
      currentSpawnPoint.x = parseInt(line.split('=')[1].trim(), 10);
    } else if (line.startsWith('#Y POS = ')) {
      currentSpawnPoint.y = parseInt(line.split('=')[1].trim(), 10);
    } else if (line.startsWith('#ID TYPE = ')) {
      currentSpawnPoint.idType = line.split('=')[1].trim();
    } else if (line.startsWith('#UNIQUE IDENTIFIER NUMBER = ')) {
      currentSpawnPoint.uid = parseInt(line.split('=')[1].trim(), 10);
    } else if (line.startsWith('#PARENT UID = ')) {
      currentSpawnPoint.parentUid = parseInt(line.split('=')[1].trim(), 10);
    } else if (line.startsWith('#NEXT SIBLING UID = ')) {
      currentSpawnPoint.nextSiblingUid = parseInt(line.split('=')[1].trim(), 10);
    } else if (line.startsWith('#PARAMETERS')) {
      parsingParameters = true;
      parameterValues = [];
    } else if (parsingParameters) {
      if (line.startsWith('#') || line === '') {
        parsingParameters = false;
        currentSpawnPoint.parameters = parameterValues;
      } else {
        const vals = line.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !Number.isNaN(v));
        parameterValues.push(...vals);
      }
    }
  }

  maybeCommitSpawnPoint();

  return {
    width,
    height,
    tilesetIndex,
    layers,
    solidTiles,
    tileDefinitions,
    warpZones,
    spawnPoints
  };
}
