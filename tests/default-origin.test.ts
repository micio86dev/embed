import { afterEach, describe, expect, it } from "vitest";
import { BEAI, DEFAULT_EMBED_ORIGIN } from "../src/index";
import { createContainer, getIframe } from "./test-utils";

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
});
