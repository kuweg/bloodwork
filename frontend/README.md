# Bloodwork Frontend

Vite + React + TypeScript + Tailwind CSS v4, matching the Figma Make "Bloodwork Analytics Dashboard" design.

## Setup

```bash
npm install
npm run dev
```

Dev server runs at http://localhost:5173 and proxies `/api/*` to the backend at http://localhost:8000.

## Stack

- React 18 + Vite 6
- Tailwind CSS v4 via `@tailwindcss/vite`
- `lucide-react` icons, `recharts` charts
- `clsx` + `tailwind-merge` (via `cn()` helper in `src/lib/utils.ts`)

## Layout

```
src/
  App.tsx                top nav with tabs + upload
  components/
    Dashboard.tsx        latest measurements as status-coded cards
    TableViewer.tsx      historical pivot table per test
    Graphics.tsx         user-built line/bar charts
  lib/
    metrics.ts           canonical test metadata + status classifier
    data.ts              transforms API reports into UI shapes
    utils.ts             cn() helper
  api/client.ts          typed fetch wrappers
  types/bloodwork.ts     API response types
  theme.css              design tokens from Figma
```

## Scripts

- `npm run dev` — start dev server
- `npm run build` — type-check and build
- `npm run typecheck` — type-check only
- `npm run preview` — preview the production build
