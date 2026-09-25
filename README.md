# BEAI — embed SDK

`@beai/embed` — the TypeScript client customer sites load to embed a BEAI interview. Zero
runtime dependencies, ≤ 12 KB gzipped. Ships as ESM (`import { BEAI } from "@beai/embed"`)
and as a UMD/IIFE bundle for `<script src="https://cdn.beai.example/embed/v1.js">`,
exposing `window.BEAI`.

> **Bun only.** Bun is the sole package manager here: install, dev and build. Node runs the
> Vitest/Playwright runners only, matching `frontend`/`backoffice`.

See `docs/specs/public-api/SPEC.md` §4 "Embed SDK" in the wrapper repo for the full contract
(mount/start/end/destroy API, postMessage protocol, origin validation, test IDs
`T-SDK-001..020`).

## Scripts

- `bun run build` — builds `dist/` (ESM + CJS + IIFE + type declarations) via `tsup`.
- `bun run test:unit` — Vitest unit tests.
- `bun run test:e2e` — Playwright E2E against the `frontend` embed page.
- `bun run size` — asserts the built IIFE bundle stays ≤ 12 KB gzipped.
- `bun run typecheck` / `bun run lint` / `bun run format:check`.
