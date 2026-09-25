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

  it("never writes style.height for a non-number resize payload", () => {
    // gga round 8 (mutation-tested against the real source, not just reasoned about): the
    // ORIGINAL it.each here covered NaN/Infinity/-10/"480" as if all four proved
    // Number.isFinite()/>= 0/typeof, but jsdom's CSS parser silently ignores an invalid
    // length ("NaNpx", "Infinitypx", "-10px") — style.height stayed "" whether the guard
    // ran or not, so three of those four cases could not fail even with EVERY guard check
    // deleted. Only the STRING case is genuinely provable through the DOM route: with the
    // whole guard removed, `"480" >= 0` coerces to `480 >= 0` (true), so `` `${"480"}px` ``
    // WOULD reach jsdom's parser as the same valid "480px" a real numeric height produces
    // — this is the one invalid-input shape a broken guard can't hide behind CSS parsing.
    // (typeof and Number.isFinite are individually redundant against a string — isFinite
    // rejects non-numbers without coercion either way — so this proves the guard AS A
    // WHOLE, not one specific check; the it.each below isolates the individual checks.)
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    const iframe = getIframe(container);
    iframe.style.height = "";

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("resize", { height: "480" }));

    expect(iframe.style.height).toBe("");
    instance.destroy();
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a negative number", -10],
    ["a string", "480"],
  ])(
    "never notifies a .on('resize') listener for an invalid resize payload (%s), proven with a positive control",
    (_label, height) => {
      // gga round 6/8: the LISTENER path is where the guard's effect is genuinely
      // observable — nothing parses the value on the way to a listener, unlike the
      // DOM-write test above. Verified by actually mutating each guard (not just reasoned
      // about): removing Number.isFinite() alone lets ONLY Infinity through (NaN is still
      // blocked by `>= 0`, since `NaN >= 0` is itself false); removing `>= 0` alone lets
      // ONLY the negative number through; `typeof height === "number"` is redundant at
      // runtime against BOTH NaN and the string case, since `Number.isFinite()` already
      // rejects non-numbers without coercion — it exists for TypeScript narrowing, not a
      // runtime effect a test can distinguish. NaN and the string case are kept anyway:
      // they still prove the guard as a whole correctly rejects those values, even though
      // neither pinpoints a single line the way Infinity/-10 do.
      container = createContainer();
      stubIframeContentWindow();
      const instance = BEAI.mount(baseOptions(container));
      const listener = vi.fn();
      instance.on("resize", listener);

      dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("resize", { height }));
      expect(listener).not.toHaveBeenCalled();

      // Positive control: without this, the assertion above would ALSO pass if the
      // listener wiring were broken entirely, proving nothing about THIS guard specifically.
      dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("resize", { height: 300 }));
      expect(listener).toHaveBeenCalledWith({ height: 300 });

      instance.destroy();
    },
  );
});
