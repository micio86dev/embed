import { BeaiEmbedError } from "./errors";

/** Resolves a `container` option (selector string or element) to a live `HTMLElement`. */
export function resolveContainer(container: HTMLElement | string): HTMLElement {
  if (typeof container !== "string") return container;

  const element = document.querySelector(container);
  if (element === null) {
    throw new BeaiEmbedError(
      "container_not_found",
      `No element matches container selector "${container}".`,
    );
  }
  return element as HTMLElement;
}

/** Builds the iframe `src`: `{embedOrigin}/embed/{token}[?locale=...]`. */
export function buildIframeSrc(embedOrigin: string, token: string, locale?: string): string {
  const url = new URL(`/embed/${encodeURIComponent(token)}`, embedOrigin);
  if (locale) {
    url.searchParams.set("locale", locale);
  }
  return url.toString();
}

/** Creates the (not-yet-attached) iframe element per SPEC §4.4's `allow` attribute. */
export function createIframeElement(src: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  // Set as an attribute (not the `.allow` IDL property) — jsdom's HTMLIFrameElement does
  // not reflect `.allow` to the DOM attribute, and the attribute is what browsers read.
  iframe.setAttribute("allow", "camera; microphone; autoplay");
  iframe.title = "BEAI interview";
  return iframe;
}
