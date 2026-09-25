# Code Review Rules — `@beai/embed` (TypeScript, zero-dependency library)

Concrete, checkable rules grounded in the binding contract:
`docs/specs/public-api/SPEC.md` §4 "Embed SDK" in the wrapper repo.

## Tooling — non-negotiable

- **Bun only.** Never `npm`, `pnpm`, `yarn`, `npx` or `pnpx`. Use `bun` / `bunx --bun`.
- **`dependencies` in `package.json` must stay `{}`.** The whole point of this package is a
  zero-runtime-dependency, ≤ 12 KB gzipped bundle a customer's site loads directly — a single
  added runtime dependency breaks that contract even if the bundle still happens to fit.
- **`bun run size` must pass before merge.** It asserts the built IIFE bundle stays
  ≤ 12 KB gzipped (SPEC §4.1). A failing size check is not a warning to note and ship anyway.

## postMessage protocol — security-critical

- **Every inbound `postMessage` handler validates `event.origin`** against the BEAI embed
  origin before touching `event.data`. An unvalidated origin lets any page that can obtain a
  reference to the iframe (or the host window) forge protocol messages.
- **No candidate PII, transcript text, or scores may cross postMessage**, in either direction.
  Only IDs, status, and progress counters (SPEC §4.3, "Only IDs and progress"). If a payload
  you're adding needs anything more descriptive than an id/index/enum, it does not belong in
  this protocol.
- **Every message carries and is checked against `{source: "beai-embed", version: 1}`.** A
  handler that trusts `type`/`payload` without checking `source` first will react to
  unrelated postMessage traffic on the same page (analytics scripts, other embeds, browser
  extensions).

## Public API surface

- **`mount()`/`destroy()` must be idempotent.** Calling `destroy()` twice, or `mount()` on an
  already-mounted instance, must never throw and must never create a second iframe.
- **`start()` called before the iframe reports `ready` must queue, never execute or drop
  silently** (SPEC §4.4). A dropped early `start()` call is a real interview a candidate never
  gets to take.
- **`theme` is applied only when the org's branding actually allows it** — never assume
  white-label is enabled just because a `theme` object was passed to `mount()`.

## Tests

- **A test that has never been seen to fail is not evidence.** Ask what mutation would make it
  fail before trusting it.
- Never weaken an assertion (a wildcard origin check, a loosened postMessage shape check) to
  restore green.
- Every public method (`mount`, `start`, `end`, `destroy`, `on`) has at least one Vitest unit
  test exercising its idempotency/ordering contract, not just its happy path.
