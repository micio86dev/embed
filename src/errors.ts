/** Stable, typed error codes this package throws. */
export type BeaiEmbedErrorCode =
  "container_not_found" | "instance_destroyed" | "invalid_embed_origin";

/**
 * Typed error thrown for programmer-facing misuse: a bad container selector
 * (`container_not_found`), calling a method on a destroyed instance
 * (`instance_destroyed`), or a malformed/opaque `embedOrigin` (`invalid_embed_origin`).
 * Never thrown for protocol/postMessage issues — those are silently ignored per SPEC
 * §4.3, not surfaced as exceptions.
 */
export class BeaiEmbedError extends Error {
  readonly code: BeaiEmbedErrorCode;

  constructor(code: BeaiEmbedErrorCode, message: string) {
    super(message);
    this.name = "BeaiEmbedError";
    this.code = code;
  }
}
