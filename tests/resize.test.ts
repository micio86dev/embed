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
});
