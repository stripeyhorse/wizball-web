import Phaser from 'phaser';

interface TilemapData {
  width: number;
  height: number;
  layers: number;
  tileData: number[];
  groupData: number[];
}

export default class LevelLoader {
  private scene: Phaser.Scene;
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  loadAndParseTilemap(level: number): TilemapData | null {
    const mapKey = `LEVEL_${level}_TILEMAP`;
    
    if (!this.scene.cache.text.exists(mapKey)) {
      console.warn(`Tilemap not found: ${mapKey}`);
      return null;
    }

    const text = this.scene.cache.text.get(mapKey) as string;
    return this.parseTilemapText(text);
  }

  private parseTilemapText(text: string): TilemapData {
    const lines = text.split('\n');
    const data: TilemapData = {
      width: 0,
      height: 0,
      layers: 3,
      tileData: [],
      groupData: []
    };

    let section = 'header';
    let tileData: number[] = [];
    let groupData: number[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#')) {
        if (trimmed.includes('MAP WIDTH')) {
          data.width = parseInt(trimmed.split('=')[1]);
        } else if (trimmed.includes('MAP HEIGHT')) {
          data.height = parseInt(trimmed.split('=')[1]);
        } else if (trimmed.includes('MAP LAYERS')) {
          data.layers = parseInt(trimmed.split('=')[1]);
        } else if (trimmed.includes('#MAP TILE DATA')) {
          section = 'tiledata';
        } else if (trimmed.includes('#MAP GROUP DATA')) {
          section = 'groupdata';
        }
        continue;
      }

      if (trimmed === '' || trimmed.startsWith('//')) continue;

      if (section === 'tiledata') {
        const values = trimmed.split(',').map(v => parseInt(v.trim()));
        tileData.push(...values);
      } else if (section === 'groupdata') {
        const values = trimmed.split(',').map(v => parseInt(v.trim()));
        groupData.push(...values);
      }
    }

    data.tileData = tileData;
    data.groupData = groupData;

    return data;
  }

  renderLevelFromData(data: TilemapData, tileKey: string, bgKey: string): Phaser.Physics.Arcade.StaticGroup {
    const tileSize = 16;
    const totalTiles = data.width * data.height;
    
    // Create static physics group for walls
    const walls = this.scene.physics.add.staticGroup();
    walls.setDepth(50);

    // Render background
    if (this.scene.textures.exists(bgKey)) {
      const bg = this.scene.add.image(
        this.scene.cameras.main.width / 2,
        this.scene.cameras.main.height / 2,
        bgKey
      );
      bg.setDisplaySize(this.scene.cameras.main.width, this.scene.cameras.main.height);
      bg.setDepth(-10);
    }

    // Parse and render tiles
    // C++ tilemap has 3 layers
    for (let layer = 0; layer < data.layers; layer++) {
      const layerOffset = layer * totalTiles;
      
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const index = y * data.width + x + layerOffset;
          const tileId = data.tileData[index] || 0;
          
          if (tileId === 0) continue; // Empty tile
          
          const worldX = x * tileSize + tileSize / 2;
          const worldY = y * tileSize + tileSize / 2;

          // Add visual tile
          const tile = this.scene.add.sprite(worldX, worldY, tileKey, tileId);
          tile.setDisplaySize(tileSize, tileSize);
          tile.setDepth(50 - layer * 10);

          // Add collision for solid tiles
          // C++: tiles > 0 are solid
          if (tileId > 0) {
            const body = tile.body as Phaser.Physics.Arcade.Body;
            if (body) {
              body.setCollideWorldBounds(true);
              body.setImmovable(true);
              body.setAllowGravity(false);
              walls.add(tile);
            }
          }
        }
      }
    }

    return walls;
  }
}
