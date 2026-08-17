import { readFileSync, writeFileSync } from 'fs';

function parseArbAtlas(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) return [];
  
  const frameCount = parseInt(lines[0], 10);
  const frames = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('//')) continue;
    
    const parts = line.split('\t')[0].split(',').map(p => parseInt(p.trim(), 10));
    if (parts.length !== 6) continue;
    
    frames.push({
      x: parts[0], y: parts[1], width: parts[2], height: parts[3],
      pivotX: parts[4], pivotY: parts[5]
    });
  }
  
  return frames;
}

function generateAtlasJSON(name, txtPath, pngName) {
  const txt = readFileSync(txtPath, 'utf-8');
  const frames = parseArbAtlas(txt);
  
  const atlasJSON = {
    meta: {
      app: 'Wizball Phaser',
      version: '1.0',
      image: `${pngName}.png`,
      format: 'RGBA8888',
      size: { w: 0, h: 0 },
      scale: 1
    },
    frames: {}
  };
  
  frames.forEach((frame, i) => {
    atlasJSON.frames[`${name}_${i}`] = {
      frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
      sourceSize: { w: frame.width, h: frame.height }
    };
  });
  
  // PreloadScene loads these as `<name>-atlas.json`. This used to write
  // `<name>[arb].json`, so re-running the generator silently produced files the
  // game never read.
  writeFileSync(`public/assets/sprites/${name}-atlas.json`, JSON.stringify(atlasJSON, null, 2));
  console.log(`Generated ${name}-atlas.json with ${frames.length} frames`);
}

generateAtlasJSON('catellite', 'public/assets/sprites/catellite[arb].txt', 'catellite');
generateAtlasJSON('paintballs', 'public/assets/sprites/paintballs_and_drips[arb].txt', 'paintballs_and_drips');
generateAtlasJSON('bullets', 'public/assets/sprites/player_bullets[arb].txt', 'player_bullets');
generateAtlasJSON('pickup', 'public/assets/sprites/pickup[arb].txt', 'pickup');
generateAtlasJSON('font', 'public/assets/sprites/font[arb].txt', 'font');
