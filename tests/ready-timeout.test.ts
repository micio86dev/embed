import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BEAI, READY_TIMEOUT_MS } from "../src/index";
import {
  baseOptions,
  beaiEmbedMessage,
  createContainer,
  dispatchEmbedMessage,
  stubIframeContentWindow,
  TEST_EMBED_ORIGIN,
} from "./test-utils";

// gga round 3, finding R4-ready-no-timeout: without this, a host down, a CSP frame-src
// block, a network failure, or a wrong embedOrigin left start() queued forever with no
// onError ever firing — nothing told the host the interview failed to load.
describe("ready timeout", () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    container?.remove();
    vi.useRealTimers();
  });

  it("fires onError (and .on('error')) if ready never arrives within READY_TIMEOUT_MS", () => {
    container = createContainer();
    const onError = vi.fn();
    const onErrorViaOn = vi.fn();
    const instance = BEAI.mount(baseOptions(container, { onError }));
    instance.on("error", onErrorViaOn);

    vi.advanceTimersByTime(READY_TIMEOUT_MS);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "embed_unreachable", recoverable: false }),
    );
    expect(onErrorViaOn).toHaveBeenCalledTimes(1);
    instance.destroy();
  });

  it("never fires the timeout error if ready arrives first", () => {
    container = createContainer();
    const onError = vi.fn();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { onError }));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));
    vi.advanceTimersByTime(READY_TIMEOUT_MS);

    expect(onError).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("never fires after destroy() — the timer is cleared", () => {
    container = createContainer();
    const onError = vi.fn();
    const instance = BEAI.mount(baseOptions(container, { onError }));

    instance.destroy();
    vi.advanceTimersByTime(READY_TIMEOUT_MS);

    expect(onError).not.toHaveBeenCalled();
  });
});
