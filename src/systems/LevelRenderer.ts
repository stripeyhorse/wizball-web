import Phaser from 'phaser';
import { ParsedTilemap } from './TilemapParser';

const TILE_SIZE = 16;
const GAME_HEIGHT = 416;

export class LevelRenderer {
  private scene: Phaser.Scene;
  private parsedTilemap: ParsedTilemap;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;

  constructor(scene: Phaser.Scene, parsedTilemap: ParsedTilemap) {
    this.scene = scene;
    this.parsedTilemap = parsedTilemap;
  }

  render(): void {
    const { width, height, tilesetIndex, layers, solidTiles } = this.parsedTilemap;
    const tilesetKey = `level_${tilesetIndex + 1}_tiles`;

    const mapConfig = {
      width,
      height,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE
    };

    this.tilemap = this.scene.make.tilemap(mapConfig);

    const tilesetImage = this.tilemap.addTilesetImage(
      `tiles_level${tilesetIndex + 1}`,
      tilesetKey,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0
    );

    if (!tilesetImage) {
      console.error(`Failed to add tileset image: ${tilesetKey}`);
      return;
    }

    for (let i = 0; i < layers.length; i++) {
      const layerData = layers[i];
      const layerName = `layer_${i}`;

      this.tilemap.createBlankLayer(layerName, tilesetImage);

      const layer = this.tilemap.getLayer(layerName);
      if (!layer || !layer.tilemapLayer) continue;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tileIndex = y * width + x;
          const tileId = layerData[tileIndex];

          if (tileId > 0) {
            const tile = layer.tilemapLayer.putTileAt(tileId, x, y);
            if (i === 0 && solidTiles.has(tileId) && tile) {
              tile.index = tileId;
            }
          }
        }
      }

      if (i === 0) {
        this.collisionLayer = layer.tilemapLayer;
        this.collisionLayer.setCollisionByProperty({ collides: true });

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const tileIndex = y * width + x;
            const tileId = layerData[tileIndex];
            if (solidTiles.has(tileId)) {
              const tile = this.collisionLayer.getTileAt(x, y);
              if (tile) {
                tile.index = tileId;
                tile.setCollision(true);
              }
            }
          }
        }
      }
    }
  }

  setupPhysics(playerSprite: Phaser.Physics.Arcade.Sprite): Phaser.Physics.Arcade.StaticGroup {
    const walls = this.scene.physics.add.staticGroup();

    if (!this.collisionLayer) {
      return walls;
    }

    const { width, height, solidTiles } = this.parsedTilemap;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = this.collisionLayer.getTileAt(x, y);
        if (tile && tile.index > 0 && solidTiles.has(tile.index)) {
          const wallRect = this.scene.add.rectangle(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            TILE_SIZE,
            TILE_SIZE
          );
          this.scene.physics.add.existing(wallRect, true);
          walls.add(wallRect);
        }
      }
    }

    this.scene.physics.add.collider(playerSprite, walls);

    return walls;
  }

  setupCamera(playerSprite: Phaser.Physics.Arcade.Sprite): void {
    const mapWidthPx = this.parsedTilemap.width * TILE_SIZE;

    this.scene.cameras.main.setBounds(0, 0, mapWidthPx, GAME_HEIGHT);
    this.scene.cameras.main.startFollow(playerSprite, true, 0.1, 0.1);
    this.scene.cameras.main.setDeadzone(100, 0);
  }

  getCollisionLayer(): Phaser.Tilemaps.TilemapLayer | null {
    return this.collisionLayer;
  }

  getTilemap(): Phaser.Tilemaps.Tilemap | null {
    return this.tilemap;
  }
}
