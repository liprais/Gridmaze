# Project Naming Design — Gridmaze

## Context

The repository is a browser-based 3D dungeon crawler built with TypeScript and Three.js. Current identifiers are inconsistent or left over from earlier work:

- `package.json` name: `dungeon-demo` (generic placeholder)
- `index.html` page title and HUD title: `Dungeon Demo`
- `README.md`: documents a wind-tunnel visualization project, which is unrelated to the current codebase

The source files (`src/main.ts`, `src/dungeon.ts`, `src/player.ts`, `src/types.ts`) implement a grid-based dungeon with fog-of-war, 99 floors, event tiles (reset, teleport, random map, compass, scan, shield), and a top-down 3D camera.

## Goals

1. Give the project a single, consistent public name.
2. Update all user-facing strings that currently reference the old placeholder.
3. Replace the stale README with an accurate project overview.

## Non-goals

- Renaming source symbols (e.g. `generateDungeon`, `DungeonData`, `Player`) — out of scope.
- Rebranding the visual style or color palette.
- Publishing the package to a registry.

## Naming Requirements

- English game/dungeon style.
- Modern, minimal feel.
- Directly evokes the core grid-based gameplay.
- Short enough for page titles, filenames, and npm-style package names.

## Candidates Considered

| Name | Pros | Cons |
|------|------|------|
| **Tilebound** | Short, modern, strong tile/grid implication; brandable. | "bound" can read as "restricted" rather than "grid-bound". |
| **Gridmaze** | Explicit about grid + maze; clear and memorable; maps well to `gridmaze` package name. | Slightly generic; "maze" overstates path complexity (the game uses simple dungeons). |
| **Depthbound** | Evokes the 99-floor descent; abstract and brandable. | Does not communicate the grid/tile mechanic. |

## Decision

Use **Gridmaze** as the project name.

- `package.json` name: `gridmaze`
- Page title: `Gridmaze`
- HUD title: `Gridmaze`
- README title: `Gridmaze`

## Scope of Changes

1. `package.json`
   - Change `"name"` from `"dungeon-demo"` to `"gridmaze"`.
2. `index.html`
   - Change `<title>` from `Dungeon Demo` to `Gridmaze`.
   - Change HUD `.title` text from `Dungeon Demo` to `Gridmaze`.
3. `README.md`
   - Remove wind-tunnel content.
   - Add a concise project overview, tech stack, controls, and development commands.

## Verification

- `npm run build` succeeds without errors.
- Browser tab title shows `Gridmaze`.
- HUD top-left title shows `Gridmaze`.
- `package.json` contains `"name": "gridmaze"`.
