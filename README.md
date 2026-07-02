# Gridmaze

A browser-based 3D dungeon crawler built with TypeScript and Three.js.

## Play

Move across a 12×12 grid, reveal tiles under the fog, and survive the events until you reach floor 99.

## Controls

- **WASD / Arrow keys** — move one tile
- **Scroll** — zoom camera
- **Right-drag** — orbit camera
- **Middle-drag** — pan camera
- **Swipe** — move on touch devices

## Tile Types

| Tile | Effect |
|------|--------|
| Start | Initial position |
| Exit | Descend to the next floor |
| Reset | Return to the start of the floor |
| Teleport | Move to a random passable tile |
| Random Map | Regenerate the current floor |
| Compass | Reveal the exit location |
| Scan | Reveal all tile types on the floor |
| Shield | Block the next hazard effect |
| Wall | Blocks movement |

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Tech Stack

- TypeScript
- Vite
- Three.js
