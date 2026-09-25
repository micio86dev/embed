import { afterEach, describe, expect, it, vi } from "vitest";
import { BEAI } from "../src/index";
import {
  baseOptions,
  beaiEmbedMessage,
  createContainer,
  dispatchEmbedMessage,
  getIframe,
  stubIframeContentWindow,
  TEST_EMBED_ORIGIN,
} from "./test-utils";

describe("resize auto-height", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it("sets the iframe's style.height from a resize message unconditionally, with no callback registered", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    const iframe = getIframe(container);

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("resize", { height: 480 }));

    expect(iframe.style.height).toBe("480px");
    instance.destroy();
  });

  it("also notifies a .on('resize') listener (no dedicated on* callback exists for resize)", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    const listener = vi.fn();
    instance.on("resize", listener);

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("resize", { height: 620 }));

    expect(listener).toHaveBeenCalledWith({ height: 620 });
    instance.destroy();
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a negative number", -10],
    ["a string", "480"],
  ])("never writes style.height for an invalid resize payload (%s)", (_label, height) => {
    // gga finding (non-blocking): proves Number.isFinite()/>= 0 actually reject these —
    // removing either guard would go unnoticed without this test.
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    const iframe = getIframe(container);
    iframe.style.height = "";

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("resize", { height }));

    expect(iframe.style.height).toBe("");
    instance.destroy();
  });
});
