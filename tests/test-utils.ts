import { vi } from "vitest";
import type { MountOptions } from "../src/index";

export const TEST_EMBED_ORIGIN = "https://embed.test.local";

/**
 * Creates a fresh `<div>` container attached to `document.body`. Callers remove it
 * themselves in their own `afterEach` — no teardown function is returned. If a test can
 * fail before reaching `destroy()`, its `afterEach` must call `destroy()` too (not just
 * remove the container), or that instance's `window` message listener leaks into later
 * tests.
 */
export function createContainer(): HTMLDivElement {
  const el = document.createElement("div");
  el.id = `container-${Math.random().toString(36).slice(2)}`;
  document.body.appendChild(el);
  return el;
}

export function baseOptions(
  container: HTMLElement | string,
  overrides: Partial<MountOptions> = {},
): MountOptions {
  return {
    container,
    token: "test-token",
    embedOrigin: TEST_EMBED_ORIGIN,
    ...overrides,
  };
}

/** Returns the mounted iframe inside `container`, or throws if mount() didn't create one. */
export function getIframe(container: HTMLElement): HTMLIFrameElement {
  const iframe = container.querySelector("iframe");
  if (!iframe) {
    throw new Error("Expected container to have a mounted <iframe>, found none.");
  }
  return iframe;
}

/**
 * The current test's fake iframe window, set by `stubIframeContentWindow()` and read by
 * `dispatchEmbedMessage()` as the dispatched event's `source` — see both functions' own
 * docs for why this must be a STABLE object reference, not a fresh literal per access.
 */
let currentFakeIframeWindow: Window | null = null;

/**
 * Stubs `HTMLIFrameElement.prototype.contentWindow` — on the PROTOTYPE, not a specific
 * instance — with a spy-able fake window. Must be called BEFORE `BEAI.mount()` creates the
 * iframe (gga finding: an instance-level stub applied AFTER `mount()` returns cannot catch
 * a regression where `mount()` itself synchronously posts a message — that call would hit
 * jsdom's REAL `contentWindow`, not the spy, and the test would falsely stay green).
 * `configurable: true` lets each test's own call cleanly redefine it for the next test.
 *
 * Returns the SAME fake window object on every `contentWindow` access (never a fresh
 * `{ postMessage }` literal per read) — `BeaiEmbed`'s own `event.source !==
 * this.iframe?.contentWindow` check (the multi-embed cross-talk guard) can only ever match
 * a stable reference, and `dispatchEmbedMessage()` uses this same object as the dispatched
 * event's `source` so that check passes for legitimately-simulated iframe messages.
 */
export function stubIframeContentWindow() {
  const postMessage = vi.fn();
  const fakeWindow = { postMessage } as unknown as Window;
  currentFakeIframeWindow = fakeWindow;
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    configurable: true,
    get: () => fakeWindow,
  });
  return { postMessage, fakeWindow };
}

/**
 * jsdom's ORIGINAL `contentWindow` descriptor, captured once at module load — before any
 * test has had a chance to call `stubIframeContentWindow()` and overwrite it.
 */
const originalContentWindowDescriptor = Object.getOwnPropertyDescriptor(
  HTMLIFrameElement.prototype,
  "contentWindow",
);

/**
 * Restores `HTMLIFrameElement.prototype.contentWindow` to jsdom's own descriptor and
 * clears `currentFakeIframeWindow` (gga round 3, finding R3-003): without this, a test
 * that never calls `stubIframeContentWindow()` itself silently inherited whichever fake
 * window an EARLIER test in the same file installed, making that test's behavior depend on
 * execution order. Called from `tests/setup.ts`'s global `afterEach` — every test gets a
 * clean slate, not just the ones that remembered to call it themselves.
 */
export function resetIframeContentWindowStub(): void {
  if (originalContentWindowDescriptor) {
    Object.defineProperty(
      HTMLIFrameElement.prototype,
      "contentWindow",
      originalContentWindowDescriptor,
    );
  }
  currentFakeIframeWindow = null;
}

/**
 * Dispatches a fake `message` event on `window`, as if sent by the embed iframe. `source`
 * defaults to the most recent `stubIframeContentWindow()` call's fake window, matching
 * `BeaiEmbed`'s own cross-talk guard (`event.source !== this.iframe?.contentWindow`) — most
 * callers don't need to think about this. Pass `source` explicitly only to simulate a
 * message from a DIFFERENT iframe (e.g. a second, unrelated embed instance on the page).
 */
export function dispatchEmbedMessage(
  origin: string,
  data: unknown,
  source: Window | null = currentFakeIframeWindow,
): void {
  const event = new MessageEvent("message", { origin, data, source });
  window.dispatchEvent(event);
}

export function beaiEmbedMessage(type: string, payload?: unknown) {
  return { source: "beai-embed", version: 1, type, payload };
}
