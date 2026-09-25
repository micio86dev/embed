import { afterEach, describe, expect, it } from "vitest";
import { BEAI } from "../src/index";
import {
  baseOptions,
  beaiEmbedMessage,
  createContainer,
  dispatchEmbedMessage,
  stubIframeContentWindow,
  TEST_EMBED_ORIGIN,
} from "./test-utils";

describe("start() queuing before ready", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it("queues start() called before ready and sends it once ready arrives", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    instance.start();
    expect(postMessage).not.toHaveBeenCalled();

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { source: "beai-embed", version: 1, type: "start", payload: undefined },
      TEST_EMBED_ORIGIN,
    );

    instance.destroy();
  });

  it("sends start() immediately when ready has already arrived", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));
    expect(postMessage).not.toHaveBeenCalled();

    instance.start();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { source: "beai-embed", version: 1, type: "start", payload: undefined },
      TEST_EMBED_ORIGIN,
    );

    instance.destroy();
  });

  it("never double-sends start if ready fires more than once", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    instance.start();
    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));
    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));

    const startCalls = postMessage.mock.calls.filter((call) => call[0].type === "start");
    expect(startCalls).toHaveLength(1);

    instance.destroy();
  });

  it("sends end() immediately once ready has already arrived", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));
    instance.end();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { source: "beai-embed", version: 1, type: "end", payload: undefined },
      TEST_EMBED_ORIGIN,
    );

    instance.destroy();
  });

  it("never posts end() before ready — the iframe is still on about:blank", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    instance.end();

    expect(postMessage).not.toHaveBeenCalled();

    instance.destroy();
  });

  it("end() before ready cancels a queued start() — it never fires once ready arrives", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    instance.start();
    instance.end();
    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));

    const startCalls = postMessage.mock.calls.filter((call) => call[0].type === "start");
    expect(startCalls).toHaveLength(0);

    instance.destroy();
  });

  it("start() called twice before ready sends only one start once ready arrives", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    instance.start();
    instance.start();
    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));

    const startCalls = postMessage.mock.calls.filter((call) => call[0].type === "start");
    expect(startCalls).toHaveLength(1);

    instance.destroy();
  });
});
