# Wizball - Phaser 3 Remake

A complete TypeScript + Phaser 3 remake of the classic Amiga game Wizball.

## Project Structure

```
src/
├── entities/       # Game entities (Wizball, Catellite, PaintDrop)
├── managers/       # Game systems (RoomManager)
├── scenes/         # Phaser scenes (Boot, Preload, Game)
├── types/          # TypeScript interfaces and enums
└── main.ts         # Entry point
```

## Implemented Features

### Core Mechanics
- **Wizball**: Main player character with physics-based movement and ball physics
  - Three movement modes: Basic Bounce, Controlled Bounce, Full Control
  - Weapon system with power-ups
  - Bouncing off walls with realistic physics

- **Catellite**: Companion orb that follows Wizball
  - Follows behind player horizontally
  - Controlled shooting when player holds fire
  - Independent movement system
  - Health system

- **Paint System**: Collect paint drops to paint walls
  - Four colors: Red, Green, Blue, Yellow
  - Paint drops fall from ceiling
  - Catellite collects drops to paint walls
  - Visual paint splatter on walls

- **Room System**: Multi-room level structure
  - Room boundaries with collision
  - Room transitions via exits
  - Spawn points for each room

## Controls

- **Arrow Keys**: Move Wizball/Catellite
- **Space**: Fire (Wizball) / Control Catellite

## Development

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- **Phaser 3.90**: Game framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Matter.js**: 2D physics engine

## Future Enhancements

- Enemy AI (droids, balls, snakes)
- Power-up system implementation
- Warp zone functionality
- Sound effects and music
- More complex level design
- Score system
- Multiple weapon types

## Original Study

Based on study of the original C++ source code at `../wizzball-remake/wizball/`:
- Ball physics from `wizball.txt` script
- Catellite behavior from `catellite.txt` script  
- Paint system from `paintdrop.txt` script
- Original movement patterns and collision detection
