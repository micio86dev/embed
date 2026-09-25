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

describe("event dispatch: on*() callbacks and .on() listeners coexist", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it("fires both the onCompleted callback and a .on('completed') listener for the same message", () => {
    container = createContainer();
    const onCompleted = vi.fn();
    const onCompletedViaOn = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onCompleted }));
    instance.on("completed", onCompletedViaOn);

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("completed", { interviewId: "iv-1" }));

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith({ interviewId: "iv-1" });
    expect(onCompletedViaOn).toHaveBeenCalledTimes(1);
    expect(onCompletedViaOn).toHaveBeenCalledWith({ interviewId: "iv-1" });

    instance.destroy();
  });

  it("preserves message order across distinct events (ready, then started, then completed)", () => {
    container = createContainer();
    const order: string[] = [];
    stubIframeContentWindow();
    const instance = BEAI.mount(
      baseOptions(container, {
        onReady: () => order.push("ready"),
        onStarted: () => order.push("started"),
        onCompleted: () => order.push("completed"),
      }),
    );

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));
    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("started"));
    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("completed", { interviewId: "iv-2" }));

    expect(order).toEqual(["ready", "started", "completed"]);
    instance.destroy();
  });

  it("dispatches question:changed with { index, total } to both delivery paths", () => {
    container = createContainer();
    const onQuestionChanged = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onQuestionChanged }));
    const viaOn = vi.fn();
    instance.on("question:changed", viaOn);

    dispatchEmbedMessage(
      TEST_EMBED_ORIGIN,
      beaiEmbedMessage("question:changed", { index: 2, total: 10 }),
    );

    expect(onQuestionChanged).toHaveBeenCalledWith({ index: 2, total: 10 });
    expect(viaOn).toHaveBeenCalledWith({ index: 2, total: 10 });
    instance.destroy();
  });

  it("dispatches error events with { code, message, recoverable }", () => {
    container = createContainer();
    const onError = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onError }));

    dispatchEmbedMessage(
      TEST_EMBED_ORIGIN,
      beaiEmbedMessage("error", {
        code: "provider_unavailable",
        message: "boom",
        recoverable: false,
      }),
    );

    expect(onError).toHaveBeenCalledWith({
      code: "provider_unavailable",
      message: "boom",
      recoverable: false,
    });
    instance.destroy();
  });

  it("supports events with no dedicated on* callback (consent:granted) only via .on()", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    const listener = vi.fn();
    instance.on("consent:granted", listener);

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("consent:granted"));

    expect(listener).toHaveBeenCalledTimes(1);
    instance.destroy();
  });

  it("fires onDestroyed and .on('destroyed') listeners when destroy() is called", () => {
    container = createContainer();
    const onDestroyed = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onDestroyed }));
    const viaOn = vi.fn();
    instance.on("destroyed", viaOn);

    instance.destroy();

    expect(onDestroyed).toHaveBeenCalledTimes(1);
    expect(viaOn).toHaveBeenCalledTimes(1);
  });

  it("on() returns an unsubscribe function that stops future delivery", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    const listener = vi.fn();
    const unsubscribe = instance.on("started", listener);
    unsubscribe();

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("started"));

    expect(listener).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("no longer dispatches to listeners registered before destroy() after a later stray message", () => {
    container = createContainer();
    const listener = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    instance.on("started", listener);
    instance.destroy();

    // The window listener was removed on destroy(); this message must not reach anything.
    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("started"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("a throwing onCompleted callback does not stop a .on('completed') listener from running", () => {
    // gga round 3, findings R4-callback-isolation/R3-001: without per-handler isolation,
    // this listener would never run — the docs claim the two delivery paths "coexist
    // independently", which was untrue before this fix.
    container = createContainer();
    const onCompletedViaOn = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(
      baseOptions(container, {
        onCompleted: () => {
          throw new Error("host bug");
        },
      }),
    );
    instance.on("completed", onCompletedViaOn);

    expect(() =>
      dispatchEmbedMessage(
        TEST_EMBED_ORIGIN,
        beaiEmbedMessage("completed", { interviewId: "iv-3" }),
      ),
    ).not.toThrow();

    expect(onCompletedViaOn).toHaveBeenCalledWith({ interviewId: "iv-3" });
    instance.destroy();
  });

  it("a throwing .on() listener does not stop a LATER listener for the same event from running", () => {
    container = createContainer();
    const throwingListener = vi.fn(() => {
      throw new Error("consumer bug");
    });
    const laterListener = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    instance.on("started", throwingListener);
    instance.on("started", laterListener);

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("started"));

    expect(throwingListener).toHaveBeenCalled();
    expect(laterListener).toHaveBeenCalled();
    instance.destroy();
  });

  it("a throwing onDestroyed callback does not propagate out of destroy() itself", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(
      baseOptions(container, {
        onDestroyed: () => {
          throw new Error("host bug in onDestroyed");
        },
      }),
    );

    expect(() => instance.destroy()).not.toThrow();
  });
});
