import type { ParsedTilemap, TileDefinition } from './TilemapParser';

export const DIRECTION_UP = 0;
export const DIRECTION_RIGHT = 1;
export const DIRECTION_DOWN = 2;
export const DIRECTION_LEFT = 3;

export const DIRECTION_BITVALUE_UP = 1;
export const DIRECTION_BITVALUE_RIGHT = 2;
export const DIRECTION_BITVALUE_DOWN = 4;
export const DIRECTION_BITVALUE_LEFT = 8;
export const DIRECTION_BITVALUE_TOTAL = 15;

export const COLL_TYPE_SLIDING_HORIZONTAL = 1;
export const COLL_TYPE_SLIDING_VERTICAL = 2;
export const COLLISION_USE_EXTRA_TEST_POINTS = 1024;
export const COLLISION_ITERATE_MOVEMENT = 2048;
export const COLLISION_NOTICE_WHEN_INSIDE_COLLISION = 4096;
export const COLLISION_HORIZONTAL_WORLD_EDGE_SOLID = 8192;
export const COLLISION_VERTICAL_WORLD_EDGE_SOLID = 16384;

export const INTERACTION_POINT_TOP = 1;
export const INTERACTION_POINT_TOP_RIGHT = 2;
export const INTERACTION_POINT_RIGHT = 4;
export const INTERACTION_POINT_BOTTOM_RIGHT = 8;
export const INTERACTION_POINT_BOTTOM = 16;
export const INTERACTION_POINT_BOTTOM_LEFT = 32;
export const INTERACTION_POINT_LEFT = 64;
export const INTERACTION_POINT_TOP_LEFT = 128;

const BLOCK_PROFILE_COUNT = 34;
const BLOCK_PROFILE_SIDES = 4;
const NEITHER_CORNER = 0;
const FIRST_CORNER = 1;
const SECOND_CORNER = 2;

// world_collision.cpp:1465-1467 - per-test-point collision outcomes. IGNORED means the
// test point was ALREADY buried in solid material before the move started.
const RESULT_COLLISION_OCCURRED = 0;
const RESULT_COLLISION_IGNORED = 1;
const RESULT_NO_COLLISION = 2;

// world_collision.h:86
const EXPOSURE_MAP_CARRY_ON = -1;

// world_collision.cpp:104-140 block_covered_sides: which sides of each block shape are
// flush with the edge of the block. Used when building the exposure profiles to resolve
// edge pixels - "assume the neighbour continues the material" - so the profiles stay
// purely block-local and never look at the real neighbouring tile.
// Indexed [shape][DIRECTION_UP|RIGHT|DOWN|LEFT].
const BLOCK_COVERED_SIDES: readonly (readonly number[])[] = [
  [0, 0, 0, 0],
  [1, 1, 1, 1],
  [1, 1, 0, 0],
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, 0, 1, 1],
  [1, 1, 0, 0],
  [1, 1, 0, 1],
  [1, 1, 0, 1],
  [1, 0, 1, 1],
  [0, 1, 1, 0],
  [0, 1, 1, 1],
  [0, 1, 1, 1],
  [0, 1, 0, 1],
  [1, 1, 0, 0],
  [1, 1, 1, 0],
  [1, 1, 1, 0],
  [0, 1, 1, 0],
  [1, 0, 0, 1],
  [1, 0, 1, 1],
  [1, 0, 1, 1],
  [0, 0, 1, 1],
  [1, 0, 1, 1],
  [1, 1, 1, 0],
  [1, 1, 0, 1],
  [0, 1, 1, 1],
  [0, 1, 1, 0],
  [0, 0, 1, 1],
  [1, 1, 0, 0],
  [1, 0, 0, 1],
  [1, 0, 0, 1],
  [1, 1, 0, 0],
  [0, 0, 1, 1],
  [0, 1, 1, 0]
];

let cachedBlockSize = 0;
let blockDataSize = 0;
let blockSidedDataSize = 0;
let blockSizeMinusOne = 0;
let blockSizeInverse = 0;
let blockSizeBitshift = 0;
let blockSolidProfiles = new Uint8Array(0);
let blockDepthProfiles = new Int16Array(0);
let blockExposureProfiles = new Int8Array(0);

export interface WorldCollisionEntity {
  worldX: number;
  worldY: number;
  upperWorldWidth: number;
  lowerWorldWidth: number;
  upperWorldHeight: number;
  lowerWorldHeight: number;
  worldCollisionLayer: number;
  worldCollisionBitmask: number;
  worldCollisionBehaviour: number;
}

export interface WorldCollisionMoveResult {
  hitUp: boolean;
  hitDown: boolean;
  hitLeft: boolean;
  hitRight: boolean;
}

interface PushResult {
  depth: number;
  collided: boolean;
  whichCorner: number;
}

function blockSolidIndex(block: number, x: number, y: number): number {
  return (block * blockDataSize) + (y * cachedBlockSize) + x;
}

function blockDepthIndex(block: number, direction: number, x: number, y: number): number {
  return (block * blockSidedDataSize) + (direction * blockDataSize) + (y * cachedBlockSize) + x;
}

function getBlockExtents(block: number, x: number, size: number): { startY: number; endY: number } {
  const xPercent = (x / size) * 0.5 * Math.PI;

  switch (block) {
    case 0:
      return { startY: 0, endY: 0 };
    case 1:
      return { startY: 0, endY: size };
    case 2:
      return { startY: 0, endY: x + 1 };
    case 3:
      return { startY: 0, endY: size - x };
    case 4:
      return { startY: (size - x) - 1, endY: size };
    case 5:
      return { startY: x, endY: size };
    case 6:
      return { startY: 0, endY: Math.trunc(x / 2) + 1 };
    case 7:
      return { startY: 0, endY: Math.trunc(x / 2) + Math.trunc(size / 2) + 1 };
    case 8:
      return { startY: 0, endY: size - Math.trunc(x / 2) };
    case 9:
      return { startY: 0, endY: size - Math.trunc(x / 2) - Math.trunc(size / 2) };
    case 10:
      return { startY: (size - Math.trunc(x / 2)) - 1, endY: size };
    case 11:
      return { startY: (size - Math.trunc(x / 2)) - Math.trunc(size / 2) - 1, endY: size };
    case 12:
      return { startY: Math.trunc(x / 2), endY: size };
    case 13:
      return { startY: Math.trunc(x / 2) + Math.trunc(size / 2), endY: size };
    case 14:
      return { startY: 0, endY: x < size / 2 ? 0 : ((x * 2) + 2) - size };
    case 15:
      return { startY: 0, endY: x < size / 2 ? (x * 2) + 2 : size };
    case 16:
      return { startY: x < size / 2 ? size - (x * 2) - 2 : 0, endY: size };
    case 17:
      return { startY: x < size / 2 ? size : size - ((x * 2) - size) - 2, endY: size };
    case 18:
      return { startY: 0, endY: x < size / 2 ? size - (x * 2) : 0 };
    case 19:
      return { startY: 0, endY: x < size / 2 ? size : (size * 2) - (x * 2) };
    case 20:
      return { startY: x < size / 2 ? 0 : (x * 2) - size, endY: size };
    case 21:
      return { startY: x < size / 2 ? x * 2 : size, endY: size };
    case 22:
      return { startY: 0, endY: x < size / 2 ? size : 0 };
    case 23:
      return { startY: 0, endY: x < size / 2 ? 0 : size };
    case 24:
      return { startY: 0, endY: Math.trunc(size / 2) };
    case 25:
      return { startY: Math.trunc(size / 2), endY: size };
    case 26:
      return { startY: size - Math.trunc(size * Math.cos(xPercent - (Math.PI / 2))), endY: size };
    case 27:
      return { startY: size - Math.trunc(size * Math.cos(xPercent)), endY: size };
    case 28:
      return { startY: 0, endY: Math.trunc(size * Math.cos(xPercent - (Math.PI / 2))) };
    case 29:
      return { startY: 0, endY: Math.trunc(size * Math.cos(xPercent)) };
    case 30:
      return { startY: 0, endY: size - Math.trunc(size * Math.cos(xPercent - (Math.PI / 2))) };
    case 31:
      return { startY: 0, endY: size - Math.trunc(size * Math.cos(xPercent)) };
    case 32:
      return { startY: Math.trunc(size * Math.cos(xPercent - (Math.PI / 2))), endY: size };
    case 33:
      return { startY: Math.trunc(size * Math.cos(xPercent)), endY: size };
    default:
      throw new Error(`Unsupported block shape ${block}`);
  }
}

function ensureBlockProfiles(blockSize: number): void {
  if (cachedBlockSize === blockSize) {
    return;
  }

  cachedBlockSize = blockSize;
  blockDataSize = blockSize * blockSize;
  blockSidedDataSize = blockDataSize * BLOCK_PROFILE_SIDES;
  blockSizeMinusOne = blockSize - 1;
  blockSizeInverse = ~blockSizeMinusOne;
  blockSizeBitshift = Math.log2(blockSize);
  blockSolidProfiles = new Uint8Array(BLOCK_PROFILE_COUNT * blockDataSize);
  blockDepthProfiles = new Int16Array(BLOCK_PROFILE_COUNT * blockSidedDataSize);
  blockExposureProfiles = new Int8Array(BLOCK_PROFILE_COUNT * blockDataSize);

  for (let block = 0; block < BLOCK_PROFILE_COUNT; block++) {
    for (let x = 0; x < blockSize; x++) {
      const { startY, endY } = getBlockExtents(block, x, blockSize);

      for (let y = startY; y < endY; y++) {
        blockSolidProfiles[blockSolidIndex(block, x, y)] = 1;
      }
    }
  }

  // Faithful port of the block_exposure_profiles pass in WORLDCOLL_setup_block_collision
  // (world_collision.cpp:918-1012). For each solid pixel the profile records which of the
  // four faces are EXPOSED, derived entirely from the block's own solid profile; pixels on
  // the block's edge fall back to the static block_covered_sides table rather than any
  // neighbouring-tile lookup. Non-solid pixels get EXPOSURE_MAP_CARRY_ON.
  for (let block = 0; block < BLOCK_PROFILE_COUNT; block++) {
    const coveredSides = BLOCK_COVERED_SIDES[block];

    for (let x = 0; x < blockSize; x++) {
      for (let y = 0; y < blockSize; y++) {
        let total = EXPOSURE_MAP_CARRY_ON;

        if (blockSolidProfiles[blockSolidIndex(block, x, y)] === 1) {
          total = DIRECTION_BITVALUE_TOTAL;

          if (x > 0) {
            if (blockSolidProfiles[blockSolidIndex(block, x - 1, y)]) {
              total -= DIRECTION_BITVALUE_LEFT;
            }
          } else if (coveredSides[DIRECTION_LEFT]) {
            total -= DIRECTION_BITVALUE_LEFT;
          }

          if (x < blockSize - 1) {
            if (blockSolidProfiles[blockSolidIndex(block, x + 1, y)]) {
              total -= DIRECTION_BITVALUE_RIGHT;
            }
          } else if (coveredSides[DIRECTION_RIGHT]) {
            total -= DIRECTION_BITVALUE_RIGHT;
          }

          if (y > 0) {
            if (blockSolidProfiles[blockSolidIndex(block, x, y - 1)]) {
              total -= DIRECTION_BITVALUE_UP;
            }
          } else if (coveredSides[DIRECTION_UP]) {
            total -= DIRECTION_BITVALUE_UP;
          }

          if (y < blockSize - 1) {
            if (blockSolidProfiles[blockSolidIndex(block, x, y + 1)]) {
              total -= DIRECTION_BITVALUE_DOWN;
            }
          } else if (coveredSides[DIRECTION_DOWN]) {
            total -= DIRECTION_BITVALUE_DOWN;
          }
        }

        blockExposureProfiles[blockSolidIndex(block, x, y)] = total;
      }
    }
  }

  for (let block = 0; block < BLOCK_PROFILE_COUNT; block++) {
    for (let x = 0; x < blockSize; x++) {
      let counter = 0;
      for (let y = 0; y < blockSize; y++) {
        if (blockSolidProfiles[blockSolidIndex(block, x, y)] !== 0) {
          counter -= blockSolidProfiles[blockSolidIndex(block, x, y)];
        } else {
          counter = 0;
        }
        blockDepthProfiles[blockDepthIndex(block, DIRECTION_UP, x, y)] = counter;
      }

      counter = 0;
      for (let y = blockSize - 1; y >= 0; y--) {
        if (blockSolidProfiles[blockSolidIndex(block, x, y)] !== 0) {
          counter += blockSolidProfiles[blockSolidIndex(block, x, y)];
        } else {
          counter = 0;
        }
        blockDepthProfiles[blockDepthIndex(block, DIRECTION_DOWN, x, y)] = counter;
      }
    }

    for (let y = 0; y < blockSize; y++) {
      let counter = 0;
      for (let x = 0; x < blockSize; x++) {
        if (blockSolidProfiles[blockSolidIndex(block, x, y)] !== 0) {
          counter -= blockSolidProfiles[blockSolidIndex(block, x, y)];
        } else {
          counter = 0;
        }
        blockDepthProfiles[blockDepthIndex(block, DIRECTION_LEFT, x, y)] = counter;
      }

      counter = 0;
      for (let x = blockSize - 1; x >= 0; x--) {
        if (blockSolidProfiles[blockSolidIndex(block, x, y)] !== 0) {
          counter += blockSolidProfiles[blockSolidIndex(block, x, y)];
        } else {
          counter = 0;
        }
        blockDepthProfiles[blockDepthIndex(block, DIRECTION_RIGHT, x, y)] = counter;
      }
    }
  }
}

export default class WorldCollisionMap {
  readonly width: number;
  readonly height: number;
  readonly layers: number;
  readonly layerSize: number;
  readonly widthInPixels: number;
  readonly heightInPixels: number;

  private readonly tileSize: number;
  private readonly collisionData: Int16Array;
  private readonly exposureData: Int16Array;
  private readonly collisionBitmaskData: Uint8Array;

  constructor(parsedTilemap: ParsedTilemap, tileSize: number) {
    ensureBlockProfiles(tileSize);

    this.width = parsedTilemap.width;
    this.height = parsedTilemap.height;
    this.layers = parsedTilemap.layers.length;
    this.layerSize = this.width * this.height;
    this.widthInPixels = this.width * tileSize;
    this.heightInPixels = this.height * tileSize;
    this.tileSize = tileSize;

    const totalSize = this.layerSize * this.layers;
    this.collisionData = new Int16Array(totalSize);
    this.exposureData = new Int16Array(totalSize);
    this.collisionBitmaskData = new Uint8Array(totalSize);

    for (let layer = 0; layer < this.layers; layer++) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const tileNumber = parsedTilemap.layers[layer][(y * this.width) + x] ?? 0;
          const definition = this.getTileDefinition(parsedTilemap.tileDefinitions, tileNumber);
          const index = this.tileIndex(layer, x, y);

          this.collisionData[index] = definition.shape;
          this.exposureData[index] = definition.solidSides;
          this.collisionBitmaskData[index] = definition.collisionMask;
        }
      }

      // NOTE: C++ only applies exposure modifications when is_it_for_physics=true,
      // which is never actually passed in the game. Exposure data is used raw from the
      // tileset solidSides values without neighbor-based modification.
    }
  }

  moveEntity(
    entity: WorldCollisionEntity,
    xFixed: number,
    yFixed: number,
    xVelocityFixed: number,
    yVelocityFixed: number
  ): { xFixed: number; yFixed: number; result: WorldCollisionMoveResult } {
    let worldX = xFixed >> 8;
    let worldY = yFixed >> 8;
    const result: WorldCollisionMoveResult = {
      hitUp: false,
      hitDown: false,
      hitLeft: false,
      hitRight: false
    };

    const xVelocity = ((xFixed + xVelocityFixed) >> 8) - worldX;
    if (xVelocity !== 0) {
      const pushed = this.pushHorizontal({ ...entity, worldX, worldY }, xVelocity);
      const remainder = xVelocity - pushed.depth;

      if (!pushed.collided) {
        xFixed += xVelocityFixed;
      } else {
        xFixed += pushed.depth << 8;

        const slidingHorizontal =
          (entity.worldCollisionBehaviour & COLL_TYPE_SLIDING_HORIZONTAL) !== 0;

        if (slidingHorizontal && pushed.whichCorner !== NEITHER_CORNER) {
          // Slide along the corner to burn off the leftover movement instead of
          // dead-stopping. The push already advanced X by pushed.depth, so probe
          // from the updated integer position. Evade direction is the obstacle
          // face we slid against (opposite of travel): moving right hits a
          // left-facing wall, and vice versa (matches the C++ dispatch).
          const evadeDirection = xVelocity > 0 ? DIRECTION_LEFT : DIRECTION_RIGHT;
          const probeWorldX = xFixed >> 8;
          const slide = this.pushAgainstSlidingCollision(
            { ...entity, worldX: probeWorldX, worldY },
            evadeDirection,
            pushed.whichCorner,
            remainder,
            0
          );

          // Apply the achieved pixel deviation as a fixed-point shift, mirroring
          // the C++ ENT_X/ENT_Y += (delta << bitshift).
          xFixed += slide.deltaX << 8;
          yFixed += slide.deltaY << 8;

          // Only flag a true dead-end: the slide failed to consume the remainder.
          if (slide.remainder !== 0) {
            if (xVelocity > 0) {
              result.hitRight = true;
            } else {
              result.hitLeft = true;
            }
          }
        } else if (remainder !== 0) {
          if (xVelocity > 0) {
            result.hitRight = true;
          } else {
            result.hitLeft = true;
          }
        }
      }

      worldX = xFixed >> 8;
    } else {
      xFixed += xVelocityFixed;
      worldX = xFixed >> 8;
    }

    // A horizontal corner-slide may have nudged yFixed (perpendicular slide on
    // the Y axis); recompute worldY so the vertical push and its yVelocity see
    // the post-slide position. Mirrors the C++ recomputation of y_vel after the
    // horizontal block.
    worldY = yFixed >> 8;

    const yVelocity = ((yFixed + yVelocityFixed) >> 8) - worldY;
    if (yVelocity !== 0) {
      const pushed = this.pushVertical({ ...entity, worldX, worldY }, yVelocity);
      const remainder = yVelocity - pushed.depth;

      if (!pushed.collided) {
        yFixed += yVelocityFixed;
      } else {
        yFixed += pushed.depth << 8;

        const slidingVertical =
          (entity.worldCollisionBehaviour & COLL_TYPE_SLIDING_VERTICAL) !== 0;

        if (slidingVertical && pushed.whichCorner !== NEITHER_CORNER) {
          // Slide along the corner to burn off the leftover movement. Evade
          // direction is the obstacle face we slid against (opposite of travel):
          // moving down hits an up-facing wall, and vice versa.
          const evadeDirection = yVelocity > 0 ? DIRECTION_UP : DIRECTION_DOWN;
          const probeWorldY = yFixed >> 8;
          const slide = this.pushAgainstSlidingCollision(
            { ...entity, worldX, worldY: probeWorldY },
            evadeDirection,
            pushed.whichCorner,
            0,
            remainder
          );

          xFixed += slide.deltaX << 8;
          yFixed += slide.deltaY << 8;

          // Only flag a true dead-end: the slide failed to consume the remainder.
          if (slide.remainder !== 0) {
            if (yVelocity > 0) {
              result.hitDown = true;
            } else {
              result.hitUp = true;
            }
          }
        } else if (remainder !== 0) {
          if (yVelocity > 0) {
            result.hitDown = true;
          } else {
            result.hitUp = true;
          }
        }
      }
    } else {
      yFixed += yVelocityFixed;
    }

    return { xFixed, yFixed, result };
  }

  private getTileDefinition(tileDefinitions: TileDefinition[], tileNumber: number): TileDefinition {
    return tileDefinitions[tileNumber] ?? { shape: 0, solidSides: 0, collisionMask: 0 };
  }

  private tileIndex(layer: number, x: number, y: number): number {
    return (layer * this.layerSize) + (y * this.width) + x;
  }

  private collisionDepth(
    direction: number,
    directionBitmask: number,
    layer: number,
    x: number,
    y: number,
    collisionBitmask: number,
    worldEdgeHit: number
  ): number {
    const blockX = x >> blockSizeBitshift;
    const blockY = y >> blockSizeBitshift;

    if (blockX < 0 || blockX >= this.width || blockY < 0 || blockY >= this.height) {
      if (worldEdgeHit === 0) {
        return 0;
      }

      // world_collision.cpp:1136-1167. The C++ writes the LEFT/UP cases as
      // `x-(width<<bitshift)` and `y-(height<<bitshift)`, i.e. the NEGATIVE of what is
      // written here. Those two are self-referential: the walk does `x += result`, so
      // `result = x-W` gives x := 2x-W, which does not settle on the edge - it doubles
      // away from it. What makes the C++ nevertheless stop is 32-bit int wraparound:
      // x_n = W + 2^n*(x_0-W), and once 2^n*(x_0-W) is a multiple of 2^32 the term
      // vanishes and the walk terminates at EXACTLY x == W (verified by re-running the
      // unmodified walk with |0 accumulators - it lands on 640/416 in <=32 steps, with
      // every intermediate value far enough out of bounds to stay in this switch).
      // JS numbers have no such wraparound, so the walk diverges to +/-Infinity, trips
      // the safety bound below and reports RESULT_NO_COLLISION - leaving the bottom and
      // right world edges open while the top and left (which use the already-settling
      // `-x` / `-y` forms) hold.
      // Flipping the sign reaches the C++'s converged answer in one step for every
      // input, so all four edges are solid exactly as COLLISION_*_WORLD_EDGE_SOLID
      // intends (wizball.txt:164-165 sets both).
      switch (direction) {
        case DIRECTION_LEFT:
          return (worldEdgeHit & COLLISION_HORIZONTAL_WORLD_EDGE_SOLID) !== 0
            ? this.widthInPixels - x
            : 0;
        case DIRECTION_RIGHT:
          return (worldEdgeHit & COLLISION_HORIZONTAL_WORLD_EDGE_SOLID) !== 0
            ? -x
            : 0;
        case DIRECTION_UP:
          return (worldEdgeHit & COLLISION_VERTICAL_WORLD_EDGE_SOLID) !== 0
            ? this.heightInPixels - y
            : 0;
        case DIRECTION_DOWN:
          return (worldEdgeHit & COLLISION_VERTICAL_WORLD_EDGE_SOLID) !== 0
            ? -y
            : 0;
        default:
          return 0;
      }
    }

    const blockOffset = this.tileIndex(layer, blockX, blockY);
    if ((directionBitmask & this.exposureData[blockOffset]) !== 0) {
      return 0;
    }

    if ((collisionBitmask & this.collisionBitmaskData[blockOffset]) === 0) {
      return 0;
    }

    const blockNumber = this.collisionData[blockOffset];
    const localX = x & blockSizeMinusOne;
    const localY = y & blockSizeMinusOne;
    return blockDepthProfiles[blockDepthIndex(blockNumber, direction, localX, localY)];
  }

  // Faithful port of C++ WORLDCOLL_collision_test: returns the per-pixel solidity
  // (block_solid_profiles) at (x, y) on the given layer, gated by the tile collision
  // bitmask and clamped to map bounds (out-of-bounds == non-solid).
  private solidTest(layer: number, x: number, y: number, collisionBitmask: number): number {
    const blockX = x >> blockSizeBitshift;
    const blockY = y >> blockSizeBitshift;

    if (blockX < 0 || blockX >= this.width || blockY < 0 || blockY >= this.height) {
      return 0;
    }

    const blockOffset = this.tileIndex(layer, blockX, blockY);

    if ((collisionBitmask & this.collisionBitmaskData[blockOffset]) === 0) {
      return 0;
    }

    const blockNumber = this.collisionData[blockOffset];
    const localX = x & blockSizeMinusOne;
    const localY = y & blockSizeMinusOne;
    return blockSolidProfiles[blockSolidIndex(blockNumber, localX, localY)];
  }

  // Faithful port of C++ WORLDCOLL_collision_offset (world_collision.cpp:1366-1401).
  //
  // Returns EXPOSURE_MAP_CARRY_ON (-1) when the pixel is free (non-solid, or a tile the
  // entity's collision bitmask doesn't interact with), otherwise the BLOCK-LOCAL bitmask
  // of directions in which this pixel's face is exposed. Crucially this is not a
  // neighbouring-tile lookup: block_exposure_profiles is built from the block's own solid
  // profile with edge pixels resolved from block_covered_sides, so e.g. a pixel on the
  // bottom edge of a full block (shape 1, covered sides {1,1,1,1}) has the DOWN bit
  // cleared even when the tile below is empty.
  //
  // Out of bounds with the matching world-edge-solid flag short-circuits to 0
  // (world_collision.cpp:1373-1383) - neither the carry-on sentinel nor an evade bit, so
  // the caller treats the world edge as a dead end. Wizball sets both flags
  // (wizball.txt:164-165).
  private collisionOffset(
    layer: number,
    x: number,
    y: number,
    collisionBitmask: number,
    worldEdgeHit: number
  ): number {
    if (
      (worldEdgeHit & (COLLISION_HORIZONTAL_WORLD_EDGE_SOLID | COLLISION_VERTICAL_WORLD_EDGE_SOLID)) !== 0
    ) {
      if (
        (worldEdgeHit & COLLISION_HORIZONTAL_WORLD_EDGE_SOLID) !== 0 &&
        (x < 0 || x >= this.widthInPixels)
      ) {
        return 0;
      }

      if (
        (worldEdgeHit & COLLISION_VERTICAL_WORLD_EDGE_SOLID) !== 0 &&
        (y < 0 || y >= this.heightInPixels)
      ) {
        return 0;
      }
    }

    const blockX = x >> blockSizeBitshift;
    const blockY = y >> blockSizeBitshift;

    // The C++ has no bounds check past the world-edge short-circuit (it relies on those
    // flags being set); guard the array read here and treat an unguarded out-of-bounds
    // pixel as free space.
    if (blockX < 0 || blockX >= this.width || blockY < 0 || blockY >= this.height) {
      return EXPOSURE_MAP_CARRY_ON;
    }

    const blockOffset = this.tileIndex(layer, blockX, blockY);

    if ((collisionBitmask & this.collisionBitmaskData[blockOffset]) === 0) {
      return EXPOSURE_MAP_CARRY_ON;
    }

    const blockNumber = this.collisionData[blockOffset];
    const localX = x & blockSizeMinusOne;
    const localY = y & blockSizeMinusOne;
    return blockExposureProfiles[blockSolidIndex(blockNumber, localX, localY)];
  }

  // Faithful port of C++ WORLDCOLL_push_entity_against_sliding_collision.
  //
  // After a primary push collided against a corner, this slides the entity
  // perpendicular to the blocked axis to consume the leftover movement
  // ("remainder"), so the ball rounds the corner instead of dead-stopping.
  //
  // direction is the direction the entity was *trying* to travel (DIRECTION_*),
  // corner is FIRST_CORNER/SECOND_CORNER (which probe transgressed in the push),
  // and (xVel, yVel) is the signed remainder along the blocked axis.
  //
  // Returns the pixel deviation actually achieved (dx, dy) plus the unused
  // remainder along the blocked axis. moveEntity applies dx/dy as a fixed-point
  // shift, mirroring the C++ ENT_X/ENT_Y += (delta << bitshift).
  //
  // Corner -> evade-direction mapping (matches the C++ switch exactly):
  //   DOWN  + FIRST(top-left)    -> slide RIGHT (x_evade +1)
  //   DOWN  + SECOND(top-right)  -> slide LEFT  (x_evade -1)
  //   UP    + FIRST(bottom-left) -> slide RIGHT (x_evade +1)
  //   UP    + SECOND(bottom-right)-> slide LEFT (x_evade -1)
  //   RIGHT + FIRST(top-left)    -> slide DOWN  (y_evade +1)
  //   RIGHT + SECOND(bottom-left)-> slide UP    (y_evade -1)
  //   LEFT  + FIRST(top-right)   -> slide DOWN  (y_evade +1)
  //   LEFT  + SECOND(bottom-right)-> slide UP   (y_evade -1)
  private pushAgainstSlidingCollision(
    entity: WorldCollisionEntity,
    direction: number,
    corner: number,
    xVel: number,
    yVel: number
  ): { deltaX: number; deltaY: number; remainder: number } {
    const totalWidth = entity.upperWorldWidth + entity.lowerWorldWidth;
    const totalHeight = entity.upperWorldHeight + entity.lowerWorldHeight;

    let x = 0;
    let y = 0;
    let xAdder = 0;
    let yAdder = 0;
    let distance = 0;
    let xEvadeAdder = 0;
    let yEvadeAdder = 0;
    let evadeBitvalue = 0;
    let firstCheckXOffset = 0;
    let firstCheckYOffset = 0;
    let secondCheckXOffset = 0;
    let secondCheckYOffset = 0;

    switch (direction) {
      case DIRECTION_DOWN:
        if (corner === FIRST_CORNER) {
          // Primary corner: top-left. Secondaries: top-right and bottom-right.
          x = entity.worldX - entity.upperWorldWidth;
          y = entity.worldY - entity.upperWorldHeight;
          firstCheckXOffset = totalWidth;
          firstCheckYOffset = 0;
          secondCheckXOffset = totalWidth;
          secondCheckYOffset = totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_RIGHT;
          xEvadeAdder = 1;
          yEvadeAdder = 0;
        } else {
          // Primary corner: top-right. Secondaries: top-left and bottom-left.
          x = entity.worldX + entity.lowerWorldWidth;
          y = entity.worldY - entity.upperWorldHeight;
          firstCheckXOffset = -totalWidth;
          firstCheckYOffset = 0;
          secondCheckXOffset = -totalWidth;
          secondCheckYOffset = totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_LEFT;
          xEvadeAdder = -1;
          yEvadeAdder = 0;
        }
        distance = -yVel;
        yAdder = -1;
        xAdder = 0;
        break;

      case DIRECTION_LEFT:
        if (corner === FIRST_CORNER) {
          // Primary corner: top-right. Secondaries: bottom-right and bottom-left.
          x = entity.worldX + entity.lowerWorldWidth;
          y = entity.worldY - entity.upperWorldHeight;
          firstCheckXOffset = 0;
          firstCheckYOffset = totalHeight;
          secondCheckXOffset = -totalWidth;
          secondCheckYOffset = totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_DOWN;
          xEvadeAdder = 0;
          yEvadeAdder = 1;
        } else {
          // Primary corner: bottom-right. Secondaries: top-right and top-left.
          x = entity.worldX + entity.lowerWorldWidth;
          y = entity.worldY + entity.lowerWorldHeight;
          firstCheckXOffset = 0;
          firstCheckYOffset = -totalHeight;
          secondCheckXOffset = -totalWidth;
          secondCheckYOffset = -totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_UP;
          xEvadeAdder = 0;
          yEvadeAdder = -1;
        }
        distance = xVel;
        yAdder = 0;
        xAdder = 1;
        break;

      case DIRECTION_UP:
        if (corner === FIRST_CORNER) {
          // Primary corner: bottom-left. Secondaries: bottom-right and top-right.
          x = entity.worldX - entity.upperWorldWidth;
          y = entity.worldY + entity.lowerWorldHeight;
          firstCheckXOffset = totalWidth;
          firstCheckYOffset = 0;
          secondCheckXOffset = totalWidth;
          secondCheckYOffset = -totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_RIGHT;
          xEvadeAdder = 1;
          yEvadeAdder = 0;
        } else {
          // Primary corner: bottom-right. Secondaries: bottom-left and top-left.
          x = entity.worldX + entity.lowerWorldWidth;
          y = entity.worldY + entity.lowerWorldHeight;
          firstCheckXOffset = -totalWidth;
          firstCheckYOffset = 0;
          secondCheckXOffset = -totalWidth;
          secondCheckYOffset = -totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_LEFT;
          xEvadeAdder = -1;
          yEvadeAdder = 0;
        }
        distance = yVel;
        yAdder = 1;
        xAdder = 0;
        break;

      case DIRECTION_RIGHT:
        if (corner === FIRST_CORNER) {
          // Primary corner: top-left. Secondaries: bottom-left and bottom-right.
          x = entity.worldX - entity.upperWorldWidth;
          y = entity.worldY - entity.upperWorldHeight;
          firstCheckXOffset = 0;
          firstCheckYOffset = totalHeight;
          secondCheckXOffset = totalWidth;
          secondCheckYOffset = totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_DOWN;
          xEvadeAdder = 0;
          yEvadeAdder = 1;
        } else {
          // Primary corner: bottom-left. Secondaries: top-left and top-right.
          x = entity.worldX - entity.upperWorldWidth;
          y = entity.worldY + entity.lowerWorldHeight;
          firstCheckXOffset = 0;
          firstCheckYOffset = -totalHeight;
          secondCheckXOffset = totalWidth;
          secondCheckYOffset = -totalHeight;
          evadeBitvalue = DIRECTION_BITVALUE_UP;
          xEvadeAdder = 0;
          yEvadeAdder = -1;
        }
        distance = -xVel;
        yAdder = 0;
        xAdder = -1;
        break;

      default:
        return { deltaX: 0, deltaY: 0, remainder: direction === DIRECTION_UP || direction === DIRECTION_DOWN ? yVel : xVel };
    }

    const startX = x;
    const startY = y;
    const layer = entity.worldCollisionLayer;
    const collisionBitmask = entity.worldCollisionBitmask;
    // world_collision.cpp:2458 passes the entity's whole collision behaviour as the
    // world_edge_hit argument.
    const worldEdgeHit = entity.worldCollisionBehaviour;

    for (let counter = 0; counter < distance; counter++) {
      const oldX = x;
      const oldY = y;

      x += xAdder;
      y += yAdder;

      // WORLDCOLL_collision_offset's 3-way branch (world_collision.cpp:2458-2475):
      //   EXPOSURE_MAP_CARRY_ON      -> free pixel, carry on
      //   result & evade_bitvalue    -> exposed towards the evade side, climb out
      //   otherwise (including 0 at  -> dead-end, restore previous position
      //   a solid world edge)
      // Note this uses the block-LOCAL exposure profile, not a neighbouring-tile solid
      // test: the C++ never looks at the adjacent tile here, it assumes a covered side
      // continues the material (see collisionOffset above). Order matters - CARRY_ON is
      // -1, so it has every evade bit set and must be tested first.
      const offsetResult = this.collisionOffset(layer, x, y, collisionBitmask, worldEdgeHit);

      if (offsetResult === EXPOSURE_MAP_CARRY_ON) {
        // Carry on through free space.
      } else if ((offsetResult & evadeBitvalue) !== 0) {
        // Exposed edge faces the evade direction: climb out of the collision.
        x += xEvadeAdder;
        y += yEvadeAdder;
      } else {
        // No escape: restore and (below) bail out.
        x = oldX;
        y = oldY;
      }

      // Moving/evading may have shoved one of the other two corners into solid
      // material; if so, restore the previous position.
      if (this.solidTest(layer, x + firstCheckXOffset, y + firstCheckYOffset, collisionBitmask)) {
        x = oldX;
        y = oldY;
      } else if (this.solidTest(layer, x + secondCheckXOffset, y + secondCheckYOffset, collisionBitmask)) {
        x = oldX;
        y = oldY;
      }

      if (x === oldX && y === oldY) {
        // Other corners hit, or we simply made no progress: stop.
        break;
      }
    }

    const deltaX = x - startX;
    const deltaY = y - startY;

    let remainder: number;
    switch (direction) {
      case DIRECTION_DOWN:
      case DIRECTION_UP:
        remainder = yVel - deltaY;
        break;
      default:
        remainder = xVel - deltaX;
        break;
    }

    return { deltaX, deltaY, remainder };
  }

  // Faithful port of the result aggregation shared by WORLDCOLL_push_entity_horizontal
  // (world_collision.cpp:1761-1872) and WORLDCOLL_push_entity_vertical
  // (world_collision.cpp:2136-2246).
  //
  // The key behaviour the port was missing: an IGNORED point (one that was already buried
  // in solid material before the move) is STICKY and OVERRIDES an OCCURRED point unless
  // COLLISION_NOTICE_WHEN_INSIDE_COLLISION (4096) is set - once any point reports IGNORED
  // the whole push reports not_collided (world_collision.cpp:1866-1871 / 2242-2245) and the
  // entity moves freely on that axis. That's the escape hatch that stops an embedded entity
  // locking up, and Wizball deliberately leaves the flag unset (wizball.txt:158-165).
  private resolvePushResult(
    results: readonly number[],
    depths: readonly number[],
    velocity: number,
    noticeWhenInside: boolean
  ): PushResult {
    let overallResult = RESULT_NO_COLLISION;

    for (let counter = 0; counter < results.length; counter++) {
      if (results[counter] === RESULT_COLLISION_OCCURRED) {
        if (overallResult === RESULT_NO_COLLISION) {
          overallResult = RESULT_COLLISION_OCCURRED;
        }
      } else if (results[counter] === RESULT_COLLISION_IGNORED) {
        overallResult = noticeWhenInside ? RESULT_COLLISION_OCCURRED : RESULT_COLLISION_IGNORED;
      }
    }

    if (overallResult !== RESULT_COLLISION_OCCURRED) {
      return { depth: velocity, collided: false, whichCorner: NEITHER_CORNER };
    }

    // Pick the depth closest to the origin. When notice_when_inside is set we additionally
    // skip depths on the far side of zero, because we may be inside collision already.
    let actualCollisionDepth = velocity;
    let closestResultIndex = -1;

    for (let counter = 0; counter < depths.length; counter++) {
      const depth = depths[counter];

      if (velocity < 0) {
        if (depth > actualCollisionDepth && (!noticeWhenInside || depth <= 0)) {
          actualCollisionDepth = depth;
          closestResultIndex = counter;
        }
      } else if (depth < actualCollisionDepth && (!noticeWhenInside || depth >= 0)) {
        actualCollisionDepth = depth;
        closestResultIndex = counter;
      }
    }

    return {
      depth: actualCollisionDepth,
      collided: true,
      whichCorner:
        closestResultIndex === 0
          ? FIRST_CORNER
          : closestResultIndex === 1
            ? SECOND_CORNER
            : NEITHER_CORNER
    };
  }

  // Safety bound for the depth walks below. A legitimate walk is monotonic and leaves the
  // block it is in on every step, so it can never need more than a couple of passes along
  // the axis, and an out-of-bounds step now settles on the world edge immediately (see
  // collisionDepth). The C++ has no bound at all (world_collision.cpp:1334-1364) and relies
  // on int wraparound to escape its self-referential edge cases; JS numbers do not wrap, so
  // keep the bound as a backstop against a coordinate running away to +/-Infinity and
  // hanging the tab. Tripping it returns the walk's current coordinate, which classifies
  // exactly as the divergent case would have.
  private get maxDepthWalkSteps(): number {
    return ((this.width + this.height) * 2) + 16;
  }

  private getTotalCollisionDepthHorizontal(
    direction: number,
    directionBitmask: number,
    layer: number,
    x: number,
    y: number,
    collisionBitmask: number,
    worldEdgeHit: number
  ): number {
    let result = 0;
    let steps = this.maxDepthWalkSteps;

    while ((result = this.collisionDepth(direction, directionBitmask, layer, x, y, collisionBitmask, worldEdgeHit)) !== 0) {
      x += result;

      if (--steps <= 0) {
        break;
      }
    }

    return x;
  }

  private getTotalCollisionDepthVertical(
    direction: number,
    directionBitmask: number,
    layer: number,
    x: number,
    y: number,
    collisionBitmask: number,
    worldEdgeHit: number
  ): number {
    let result = 0;
    let steps = this.maxDepthWalkSteps;

    while ((result = this.collisionDepth(direction, directionBitmask, layer, x, y, collisionBitmask, worldEdgeHit)) !== 0) {
      y += result;

      if (--steps <= 0) {
        break;
      }
    }

    return y;
  }

  private pushHorizontal(entity: WorldCollisionEntity, xVelocity: number): PushResult {
    const startY = entity.worldY - entity.upperWorldHeight;
    const endY = entity.worldY + entity.lowerWorldHeight;
    const checkCoords = [startY, endY];
    const interactionBitmasks = xVelocity < 0
      ? [INTERACTION_POINT_TOP_LEFT, INTERACTION_POINT_BOTTOM_LEFT]
      : [INTERACTION_POINT_TOP_RIGHT, INTERACTION_POINT_BOTTOM_RIGHT];
    const big = (entity.worldCollisionBehaviour & COLLISION_USE_EXTRA_TEST_POINTS) !== 0;
    const iterate = (entity.worldCollisionBehaviour & COLLISION_ITERATE_MOVEMENT) !== 0;
    const worldEdgeHit =
      entity.worldCollisionBehaviour & (COLLISION_HORIZONTAL_WORLD_EDGE_SOLID | COLLISION_VERTICAL_WORLD_EDGE_SOLID);

    if (big) {
      const startBlockY = startY >> blockSizeBitshift;
      const endBlockY = endY >> blockSizeBitshift;

      if (startBlockY !== endBlockY) {
        const intermediateBlockCount = endBlockY - startBlockY;
        const sideMask = xVelocity < 0 ? INTERACTION_POINT_LEFT : INTERACTION_POINT_RIGHT;

        for (let counter = 0; counter < intermediateBlockCount; counter++) {
          checkCoords.push(((startBlockY + counter) * this.tileSize) + blockSizeMinusOne);
          checkCoords.push(((startBlockY + counter) * this.tileSize) + this.tileSize);
          interactionBitmasks.push(sideMask, sideMask);
        }
      } else {
        checkCoords.push(entity.worldY);
        interactionBitmasks.push(xVelocity < 0 ? INTERACTION_POINT_LEFT : INTERACTION_POINT_RIGHT);
      }
    } else {
      checkCoords.push(entity.worldY);
      interactionBitmasks.push(xVelocity < 0 ? INTERACTION_POINT_LEFT : INTERACTION_POINT_RIGHT);
    }

    const startX = xVelocity < 0
      ? entity.worldX - entity.upperWorldWidth
      : entity.worldX + entity.lowerWorldWidth;
    const pointResults: number[] = [];
    const pointDepths: number[] = [];

    for (let counter = 0; counter < checkCoords.length; counter++) {
      let collisionEndCoord = this.getTotalCollisionDepthHorizontal(
        xVelocity < 0 ? DIRECTION_RIGHT : DIRECTION_LEFT,
        interactionBitmasks[counter],
        entity.worldCollisionLayer,
        startX + xVelocity,
        checkCoords[counter],
        entity.worldCollisionBitmask,
        worldEdgeHit
      );

      if (iterate && collisionEndCoord === startX + xVelocity) {
        if (((startX + xVelocity) >> blockSizeBitshift) !== (startX >> blockSizeBitshift)) {
          let testX = xVelocity < 0
            ? ((startX + xVelocity) & blockSizeInverse)
            : ((startX + xVelocity) | blockSizeMinusOne);
          let flipFlop = true;

          do {
            if (xVelocity < 0) {
              testX += flipFlop ? blockSizeMinusOne : 1;
            } else {
              testX -= flipFlop ? blockSizeMinusOne : 1;
            }
            flipFlop = !flipFlop;

            collisionEndCoord = this.getTotalCollisionDepthHorizontal(
              xVelocity < 0 ? DIRECTION_RIGHT : DIRECTION_LEFT,
              interactionBitmasks[counter],
              entity.worldCollisionLayer,
              testX,
              checkCoords[counter],
              entity.worldCollisionBitmask,
              worldEdgeHit
            );
          } while (
            collisionEndCoord === testX &&
            (xVelocity < 0 ? testX + this.tileSize < startX : testX - this.tileSize > startX)
          );

          if (collisionEndCoord === testX) {
            collisionEndCoord = startX + xVelocity;
          }
        }
      }

      // Three outcomes, not two (world_collision.cpp:1665-1685 for x_vel<0 and
      // 1735-1755 for x_vel>0). Ending up BEYOND the start point in the direction we
      // came from means the test point was already embedded in solid material before the
      // move, which the C++ classifies as RESULT_COLLISION_IGNORED, not a collision.
      let collisionDepth = xVelocity;
      let pointResult = RESULT_NO_COLLISION;

      if (xVelocity < 0) {
        if (collisionEndCoord > startX) {
          pointResult = RESULT_COLLISION_IGNORED;
        } else if (collisionEndCoord > startX + xVelocity && collisionEndCoord <= startX) {
          collisionDepth = collisionEndCoord - startX;
          pointResult = RESULT_COLLISION_OCCURRED;
        }
      } else if (collisionEndCoord < startX) {
        pointResult = RESULT_COLLISION_IGNORED;
      } else if (collisionEndCoord < startX + xVelocity && collisionEndCoord >= startX) {
        collisionDepth = collisionEndCoord - startX;
        pointResult = RESULT_COLLISION_OCCURRED;
      }

      pointResults.push(pointResult);
      pointDepths.push(collisionDepth);
    }

    const noticeWhenInside =
      (entity.worldCollisionBehaviour & COLLISION_NOTICE_WHEN_INSIDE_COLLISION) !== 0;

    return this.resolvePushResult(pointResults, pointDepths, xVelocity, noticeWhenInside);
  }

  private pushVertical(entity: WorldCollisionEntity, yVelocity: number): PushResult {
    const startX = entity.worldX - entity.upperWorldWidth;
    const endX = entity.worldX + entity.lowerWorldWidth;
    const checkCoords = [startX, endX];
    const interactionBitmasks = yVelocity < 0
      ? [INTERACTION_POINT_TOP_LEFT, INTERACTION_POINT_TOP_RIGHT]
      : [INTERACTION_POINT_BOTTOM_LEFT, INTERACTION_POINT_BOTTOM_RIGHT];
    const big = (entity.worldCollisionBehaviour & COLLISION_USE_EXTRA_TEST_POINTS) !== 0;
    const iterate = (entity.worldCollisionBehaviour & COLLISION_ITERATE_MOVEMENT) !== 0;
    const worldEdgeHit =
      entity.worldCollisionBehaviour & (COLLISION_HORIZONTAL_WORLD_EDGE_SOLID | COLLISION_VERTICAL_WORLD_EDGE_SOLID);

    if (big) {
      const startBlockX = startX >> blockSizeBitshift;
      const endBlockX = endX >> blockSizeBitshift;

      if (startBlockX !== endBlockX) {
        const intermediateBlockCount = endBlockX - startBlockX;
        const sideMask = yVelocity < 0 ? INTERACTION_POINT_TOP : INTERACTION_POINT_BOTTOM;

        for (let counter = 0; counter < intermediateBlockCount; counter++) {
          checkCoords.push(((startBlockX + counter) * this.tileSize) + blockSizeMinusOne);
          checkCoords.push(((startBlockX + counter) * this.tileSize) + this.tileSize);
          interactionBitmasks.push(sideMask, sideMask);
        }
      } else {
        checkCoords.push(entity.worldX);
        interactionBitmasks.push(yVelocity < 0 ? INTERACTION_POINT_TOP : INTERACTION_POINT_BOTTOM);
      }
    } else {
      checkCoords.push(entity.worldX);
      interactionBitmasks.push(yVelocity < 0 ? INTERACTION_POINT_TOP : INTERACTION_POINT_BOTTOM);
    }

    const startY = yVelocity < 0
      ? entity.worldY - entity.upperWorldHeight
      : entity.worldY + entity.lowerWorldHeight;
    const pointResults: number[] = [];
    const pointDepths: number[] = [];

    for (let counter = 0; counter < checkCoords.length; counter++) {
      let collisionEndCoord = this.getTotalCollisionDepthVertical(
        yVelocity < 0 ? DIRECTION_DOWN : DIRECTION_UP,
        interactionBitmasks[counter],
        entity.worldCollisionLayer,
        checkCoords[counter],
        startY + yVelocity,
        entity.worldCollisionBitmask,
        worldEdgeHit
      );

      if (iterate && collisionEndCoord === startY + yVelocity) {
        if (((startY + yVelocity) >> blockSizeBitshift) !== (startY >> blockSizeBitshift)) {
          let testY = yVelocity < 0
            ? ((startY + yVelocity) & blockSizeInverse)
            : ((startY + yVelocity) | blockSizeMinusOne);
          let flipFlop = true;

          do {
            if (yVelocity < 0) {
              testY += flipFlop ? blockSizeMinusOne : 1;
            } else {
              testY -= flipFlop ? blockSizeMinusOne : 1;
            }
            flipFlop = !flipFlop;

            collisionEndCoord = this.getTotalCollisionDepthVertical(
              yVelocity < 0 ? DIRECTION_DOWN : DIRECTION_UP,
              interactionBitmasks[counter],
              entity.worldCollisionLayer,
              checkCoords[counter],
              testY,
              entity.worldCollisionBitmask,
              worldEdgeHit
            );
          } while (
            collisionEndCoord === testY &&
            (yVelocity < 0 ? testY + this.tileSize < startY : testY - this.tileSize > startY)
          );

          if (collisionEndCoord === testY) {
            collisionEndCoord = startY + yVelocity;
          }
        }
      }

      // Three outcomes, not two (world_collision.cpp:2041-2061 for y_vel<0 and
      // 2110-2130 for y_vel>0) - see the matching comment in pushHorizontal.
      let collisionDepth = yVelocity;
      let pointResult = RESULT_NO_COLLISION;

      if (yVelocity < 0) {
        if (collisionEndCoord > startY) {
          pointResult = RESULT_COLLISION_IGNORED;
        } else if (collisionEndCoord > startY + yVelocity && collisionEndCoord <= startY) {
          collisionDepth = collisionEndCoord - startY;
          pointResult = RESULT_COLLISION_OCCURRED;
        }
      } else if (collisionEndCoord < startY) {
        pointResult = RESULT_COLLISION_IGNORED;
      } else if (collisionEndCoord < startY + yVelocity && collisionEndCoord >= startY) {
        collisionDepth = collisionEndCoord - startY;
        pointResult = RESULT_COLLISION_OCCURRED;
      }

      pointResults.push(pointResult);
      pointDepths.push(collisionDepth);
    }

    const noticeWhenInside =
      (entity.worldCollisionBehaviour & COLLISION_NOTICE_WHEN_INSIDE_COLLISION) !== 0;

    return this.resolvePushResult(pointResults, pointDepths, yVelocity, noticeWhenInside);
  }
}
