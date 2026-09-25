import { BeaiEmbed, type MountOptions } from "./embed";

export { DEFAULT_EMBED_ORIGIN, READY_TIMEOUT_MS, type MountOptions } from "./embed";
export { BeaiEmbedError, type BeaiEmbedErrorCode } from "./errors";
export type {
  CompletedPayload,
  EmbedEventType,
  ErrorPayload,
  IncomingEventType,
  QuestionChangedPayload,
  ResizePayload,
  ThemeOptions,
} from "./protocol";

/**
 * Public entry point, matching the literal `BEAI.mount(options)` call shape from
 * SPEC §4.2 (`@beai/embed`): `BEAI` is a plain namespace object, `BeaiEmbed` (see
 * `embed.ts`) is the internal instance class it hands back.
 *
 * ```ts
 * import { BEAI } from "@beai/embed";
 * const interview = BEAI.mount({ container: "#el", token });
 * ```
 *
 * The IIFE build (see `tsup.config.ts` — `dist/embed.iife.js`; no separate UMD output is
 * built) exposes this same object as `window.BEAI`.
 */
export const BEAI = {
  mount(options: MountOptions): BeaiEmbed {
    return BeaiEmbed.mount(options);
  },
};
