import { afterEach, describe, expect, it, vi } from "vitest";
import { BEAI } from "../src/index";
import {
  baseOptions,
  beaiEmbedMessage,
  createContainer,
  dispatchEmbedMessage,
  stubIframeContentWindow,
  TEST_EMBED_ORIGIN,
} from "./test-utils";

describe("postMessage origin validation (both directions)", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it("accepts and dispatches a message from the configured embed origin", () => {
    container = createContainer();
    const onReady = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onReady }));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));

    expect(onReady).toHaveBeenCalledTimes(1);
    instance.destroy();
  });

  it("ignores a well-formed message from a mismatched origin", () => {
    container = createContainer();
    const onReady = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onReady }));

    dispatchEmbedMessage("https://evil.example", beaiEmbedMessage("ready"));

    expect(onReady).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("ignores a message with the right origin but wrong source", () => {
    container = createContainer();
    const onReady = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onReady }));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, {
      source: "some-other-widget",
      version: 1,
      type: "ready",
    });

    expect(onReady).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("ignores a message with the right origin but wrong version", () => {
    container = createContainer();
    const onReady = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onReady }));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, { source: "beai-embed", version: 2, type: "ready" });

    expect(onReady).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("ignores a message missing the source/version envelope entirely", () => {
    container = createContainer();
    const onReady = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onReady }));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, { type: "ready" });

    expect(onReady).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("ignores a well-formed envelope with an unknown event type", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    const anyListener = vi.fn();
    // @ts-expect-error -- intentionally probing an unknown event name at the .on() boundary
    instance.on("totally-unknown-event", anyListener);

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("totally-unknown-event"));

    expect(anyListener).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("ignores non-object message data without throwing", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    expect(() => dispatchEmbedMessage(TEST_EMBED_ORIGIN, "just a string")).not.toThrow();
    expect(() => dispatchEmbedMessage(TEST_EMBED_ORIGIN, null)).not.toThrow();

    instance.destroy();
  });
});
