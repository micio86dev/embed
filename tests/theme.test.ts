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

// The SDK's job is only to relay `set-theme` to the iframe; whether the theme is actually
// applied is gated iframe-side by the org's white-label flag (SPEC §4.2: "only applied if
// org white-label allows"), which is outside this package. So these tests assert the SDK
// ALWAYS sends the message when a theme is given, never that it decides to apply it.
describe("set-theme relay", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it("sends set-theme to the iframe once ready arrives, when a theme was given to mount()", () => {
    container = createContainer();
    const theme = { primaryColor: "#123456", borderRadius: "8px", logoUrl: "https://x/logo.png" };
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { theme }));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));

    expect(postMessage).toHaveBeenCalledWith(
      { source: "beai-embed", version: 1, type: "set-theme", payload: theme },
      TEST_EMBED_ORIGIN,
    );

    instance.destroy();
  });

  it("never sends set-theme before ready, even though a theme was given", () => {
    container = createContainer();
    const theme = { primaryColor: "#123456" };
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container, { theme }));

    expect(postMessage).not.toHaveBeenCalled();

    instance.destroy();
  });

  it("never sends set-theme when no theme was given to mount()", () => {
    container = createContainer();
    const { postMessage } = stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    dispatchEmbedMessage(TEST_EMBED_ORIGIN, beaiEmbedMessage("ready"));

    const themeCalls = postMessage.mock.calls.filter((call) => call[0].type === "set-theme");
    expect(themeCalls).toHaveLength(0);

    instance.destroy();
  });
});
