import { afterEach, describe, expect, it, vi } from "vitest";
import { BEAI, BeaiEmbedError, DEFAULT_EMBED_ORIGIN } from "../src/index";
import {
  beaiEmbedMessage,
  createContainer,
  dispatchEmbedMessage,
  getIframe,
  stubIframeContentWindow,
} from "./test-utils";

describe("embedOrigin defaults", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it("defaults embedOrigin to DEFAULT_EMBED_ORIGIN when not overridden", () => {
    container = createContainer();
    const instance = BEAI.mount({ container, token: "tok" });
    const iframe = getIframe(container);

    expect(iframe.src).toBe(`${DEFAULT_EMBED_ORIGIN}/embed/tok`);

    instance.destroy();
  });

  it("normalizes a trailing-slash embedOrigin so iframe src construction is unaffected", () => {
    container = createContainer();
    const instance = BEAI.mount({
      container,
      token: "tok",
      embedOrigin: "https://embed.trailing-slash.test/",
    });
    const iframe = getIframe(container);

    expect(iframe.src).toBe("https://embed.trailing-slash.test/embed/tok");

    instance.destroy();
  });

  it("normalizes a trailing-slash embedOrigin so postMessage origin comparison still matches", () => {
    // gga finding (non-blocking): a real browser's event.origin is NEVER
    // trailing-slashed. Without normalizing embedOrigin, every comparison against
    // "https://embed.trailing-slash.test/" would silently fail forever.
    container = createContainer();
    const onReady = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount({
      container,
      token: "tok",
      embedOrigin: "https://embed.trailing-slash.test/",
      onReady,
    });

    dispatchEmbedMessage("https://embed.trailing-slash.test", beaiEmbedMessage("ready"));

    expect(onReady).toHaveBeenCalledTimes(1);
    instance.destroy();
  });

  it("throws for an opaque-origin embedOrigin instead of silently matching any opaque-origin iframe", () => {
    // gga finding, round 2 (non-blocking): a file:/data: embedOrigin resolves to the
    // literal string "null" from new URL(...).origin, which would then match ANY
    // opaque-origin iframe's event.origin, not just this SDK's own.
    container = createContainer();

    expect(() => BEAI.mount({ container, token: "tok", embedOrigin: "data:text/html,hi" })).toThrow(
      /opaque origin/,
    );
  });

  it("throws a typed BeaiEmbedError (not a native TypeError) for a scheme-less embedOrigin", () => {
    // gga round 6, finding R3-002: new URL() throws a plain TypeError for a bare hostname
    // with no scheme ("embed.beai.com") — this proves the try/catch actually converts it
    // to the SAME typed error the opaque-origin case above uses.
    container = createContainer();

    let caught: unknown;
    try {
      BEAI.mount({ container, token: "tok", embedOrigin: "embed.beai.example" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BeaiEmbedError);
    expect((caught as BeaiEmbedError).code).toBe("invalid_embed_origin");
  });
});
