import { afterEach, describe, expect, it } from "vitest";
import { BEAI, BeaiEmbedError } from "../src/index";
import {
  baseOptions,
  createContainer,
  getIframe,
  stubIframeContentWindow,
  TEST_EMBED_ORIGIN,
} from "./test-utils";

describe("mount/destroy idempotency", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it("creates exactly one iframe inside the container", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    expect(container.querySelectorAll("iframe")).toHaveLength(1);

    instance.destroy();
  });

  it("sets the iframe src to {embedOrigin}/embed/{token}", () => {
    container = createContainer();
    const instance = BEAI.mount(baseOptions(container, { token: "abc123" }));
    const iframe = getIframe(container);

    expect(iframe.src).toBe(`${TEST_EMBED_ORIGIN}/embed/abc123`);

    instance.destroy();
  });

  it("appends locale as a query param when given", () => {
    container = createContainer();
    const instance = BEAI.mount(baseOptions(container, { token: "abc123", locale: "it" }));
    const iframe = getIframe(container);

    expect(iframe.src).toBe(`${TEST_EMBED_ORIGIN}/embed/abc123?locale=it`);

    instance.destroy();
  });

  it("sets the allow attribute for camera/microphone/autoplay", () => {
    container = createContainer();
    const instance = BEAI.mount(baseOptions(container));
    const iframe = getIframe(container);

    expect(iframe.getAttribute("allow")).toBe("camera; microphone; autoplay");

    instance.destroy();
  });

  it("calling mount() again on an already-mounted instance is a no-op and never creates a second iframe", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    expect(() => instance.mount()).not.toThrow();
    expect(container.querySelectorAll("iframe")).toHaveLength(1);

    instance.destroy();
  });

  it("destroy() removes the iframe from the DOM", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    instance.destroy();

    expect(container.querySelectorAll("iframe")).toHaveLength(0);
  });

  it("calling destroy() twice is a safe no-op and never throws", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));

    instance.destroy();

    expect(() => instance.destroy()).not.toThrow();
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
  });

  it("throws a typed BeaiEmbedError when the container selector does not resolve", () => {
    expect(() => BEAI.mount(baseOptions("#does-not-exist"))).toThrow(BeaiEmbedError);
  });

  it("throws a typed BeaiEmbedError when start()/end() are called after destroy()", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    instance.destroy();

    expect(() => instance.start()).toThrow(BeaiEmbedError);
    expect(() => instance.end()).toThrow(BeaiEmbedError);
  });

  it("throws a typed BeaiEmbedError when mount() is called again after destroy()", () => {
    container = createContainer();
    stubIframeContentWindow();
    const instance = BEAI.mount(baseOptions(container));
    instance.destroy();

    expect(() => instance.mount()).toThrow(BeaiEmbedError);
  });
});
