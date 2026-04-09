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
export const COLLISION_USE_EXTRA_TEST_POINTS = 1024;
export const COLLISION_ITERATE_MOVEMENT = 2048;
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

let cachedBlockSize = 0;
let blockDataSize = 0;
let blockSidedDataSize = 0;
let blockSizeMinusOne = 0;
let blockSizeInverse = 0;
let blockSizeBitshift = 0;
let blockSolidProfiles = new Uint8Array(0);
let blockDepthProfiles = new Int16Array(0);

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

  for (let block = 0; block < BLOCK_PROFILE_COUNT; block++) {
    for (let x = 0; x < blockSize; x++) {
      const { startY, endY } = getBlockExtents(block, x, blockSize);

      for (let y = startY; y < endY; y++) {
        blockSolidProfiles[blockSolidIndex(block, x, y)] = 1;
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
        if (remainder !== 0) {
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

    const yVelocity = ((yFixed + yVelocityFixed) >> 8) - worldY;
    if (yVelocity !== 0) {
      const pushed = this.pushVertical({ ...entity, worldX, worldY }, yVelocity);
      const remainder = yVelocity - pushed.depth;

      if (!pushed.collided) {
        yFixed += yVelocityFixed;
      } else {
        yFixed += pushed.depth << 8;
        if (remainder !== 0) {
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

      switch (direction) {
        case DIRECTION_LEFT:
          return (worldEdgeHit & COLLISION_HORIZONTAL_WORLD_EDGE_SOLID) !== 0
            ? x - this.widthInPixels
            : 0;
        case DIRECTION_RIGHT:
          return (worldEdgeHit & COLLISION_HORIZONTAL_WORLD_EDGE_SOLID) !== 0
            ? -x
            : 0;
        case DIRECTION_UP:
          return (worldEdgeHit & COLLISION_VERTICAL_WORLD_EDGE_SOLID) !== 0
            ? y - this.heightInPixels
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

    while ((result = this.collisionDepth(direction, directionBitmask, layer, x, y, collisionBitmask, worldEdgeHit)) !== 0) {
      x += result;
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

    while ((result = this.collisionDepth(direction, directionBitmask, layer, x, y, collisionBitmask, worldEdgeHit)) !== 0) {
      y += result;
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
    let actualCollisionDepth = xVelocity;
    let closestResultIndex = -1;

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

      let collisionDepth = xVelocity;
      let collided = false;

      if (xVelocity < 0) {
        if (collisionEndCoord > startX + xVelocity && collisionEndCoord <= startX) {
          collisionDepth = collisionEndCoord - startX;
          collided = true;
        }
      } else if (collisionEndCoord < startX + xVelocity && collisionEndCoord >= startX) {
        collisionDepth = collisionEndCoord - startX;
        collided = true;
      }

      if (collided) {
        if (
          closestResultIndex === -1 ||
          (xVelocity < 0 ? collisionDepth > actualCollisionDepth : collisionDepth < actualCollisionDepth)
        ) {
          actualCollisionDepth = collisionDepth;
          closestResultIndex = counter;
        }
      }
    }

    if (closestResultIndex === -1) {
      return { depth: xVelocity, collided: false, whichCorner: NEITHER_CORNER };
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
    let actualCollisionDepth = yVelocity;
    let closestResultIndex = -1;

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

      let collisionDepth = yVelocity;
      let collided = false;

      if (yVelocity < 0) {
        if (collisionEndCoord > startY + yVelocity && collisionEndCoord <= startY) {
          collisionDepth = collisionEndCoord - startY;
          collided = true;
        }
      } else if (collisionEndCoord < startY + yVelocity && collisionEndCoord >= startY) {
        collisionDepth = collisionEndCoord - startY;
        collided = true;
      }

      if (collided) {
        if (
          closestResultIndex === -1 ||
          (yVelocity < 0 ? collisionDepth > actualCollisionDepth : collisionDepth < actualCollisionDepth)
        ) {
          actualCollisionDepth = collisionDepth;
          closestResultIndex = counter;
        }
      }
    }

    if (closestResultIndex === -1) {
      return { depth: yVelocity, collided: false, whichCorner: NEITHER_CORNER };
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
}
