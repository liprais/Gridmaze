# Project Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the new project name `Gridmaze` to `package.json`, `index.html`, and `README.md`, then verify the build still works.

**Architecture:** This is a branding-only change. No source logic is modified. The changes are limited to package metadata, page title/HUD text, and project documentation.

**Tech Stack:** TypeScript, Vite, Three.js, npm

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | npm package metadata; `name` field becomes `gridmaze`. |
| `index.html` | Browser page title and HUD title displayed on screen. |
| `README.md` | Project overview, tech stack, controls, and commands. |

## Task 1: Update package.json name

**Files:**
- Modify: `package.json:2`

- [ ] **Step 1: Change the package name**

```json
{
  "name": "gridmaze",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "three": "^0.170.0"
  },
  "devDependencies": {
    "@types/three": "^0.170.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "console.log(require('./package.json').name)"`
Expected output: `gridmaze`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename package to gridmaze"
```

## Task 2: Update index.html title and HUD title

**Files:**
- Modify: `index.html:6`
- Modify: `index.html:42`

- [ ] **Step 1: Update the browser tab title**

Replace line 6:
```html
  <title>Gridmaze</title>
```

- [ ] **Step 2: Update the HUD title**

Replace line 42:
```html
    <div class="title">Gridmaze</div>
```

- [ ] **Step 3: Verify both strings were updated**

Run: `grep -n "Gridmaze\|Dungeon Demo" index.html`
Expected: two lines containing `Gridmaze`, zero lines containing `Dungeon Demo`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "chore: update page and HUD title to Gridmaze"
```

## Task 3: Rewrite README.md with project overview

**Files:**
- Modify: `README.md` (full replacement)

- [ ] **Step 1: Replace README contents**

```markdown
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
```

- [ ] **Step 2: Verify the README no longer references the old topic**

Run: `grep -i "wind\|tunnel\|openfoam\|paraview" README.md || echo "clean"`
Expected output: `clean`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for Gridmaze"
```

## Task 4: Verify the build

**Files:**
- Read: `package.json`
- Read: `index.html`
- Read: `README.md`

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: exit code 0; `dist/` folder is generated with `index.html` and `assets/`.

- [ ] **Step 2: Confirm title in dist output**

Run: `grep -o "<title>.*</title>" dist/index.html`
Expected output: `<title>Gridmaze</title>`

- [ ] **Step 3: Commit (if build artifacts are tracked)**

If `dist/` is tracked:
```bash
git add dist/
git commit -m "chore: rebuild dist with Gridmaze branding"
```

If `dist/` is not tracked, no commit is needed for this step.

---

## Self-Review

- [ ] Spec coverage: `package.json` name, `index.html` title/HUD, and `README.md` replacement are each covered by a task.
- [ ] Placeholder scan: no TBD, TODO, or vague instructions remain.
- [ ] Type consistency: no code types are introduced; all strings use `Gridmaze` consistently.
