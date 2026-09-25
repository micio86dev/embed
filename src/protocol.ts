/**
 * The postMessage protocol between the host page (this SDK) and the BEAI embed iframe,
 * per SPEC §4.3. Every message on the wire — in both directions — carries this envelope.
 */
export const EMBED_MESSAGE_SOURCE = "beai-embed" as const;
export const EMBED_MESSAGE_VERSION = 1 as const;

export interface BeaiEmbedMessage<TType extends string = string, TPayload = unknown> {
  source: typeof EMBED_MESSAGE_SOURCE;
  version: typeof EMBED_MESSAGE_VERSION;
  type: TType;
  payload?: TPayload;
}

/** Host → iframe message types (sent via `postToIframe`). */
export type OutgoingMessageType = "start" | "end" | "set-theme";

/** Only applied iframe-side if the org's white-label branding is enabled (SPEC §4.2). */
export interface ThemeOptions {
  primaryColor?: string;
  borderRadius?: string;
  logoUrl?: string;
}

export interface QuestionChangedPayload {
  index: number;
  total: number;
}

export interface CompletedPayload {
  interviewId: string;
}

export interface ErrorPayload {
  code: string;
  /**
   * Static, non-PII text only (SPEC §4.3: "No candidate PII, transcript, or scores cross
   * postMessage"). This field is free text by protocol shape, but the iframe must never put
   * candidate-derived content in it — nothing on the SDK side enforces this; it is a
   * contract on the iframe's own error-reporting code.
   */
  message: string;
  recoverable: boolean;
}

export interface ResizePayload {
  height: number;
}

/** Iframe → host event types (SPEC §4.3). */
export type IncomingEventType =
  | "ready"
  | "consent:granted"
  | "permissions:denied"
  | "started"
  | "question:changed"
  | "completed"
  | "error"
  | "resize";

/** Fired by the SDK itself when `destroy()` runs — never received over postMessage. */
export type LocalEventType = "destroyed";

export type EmbedEventType = IncomingEventType | LocalEventType;

/** Payload shape for each event name; `undefined` means "no payload". */
export interface EventPayloadMap {
  ready: undefined;
  "consent:granted": undefined;
  "permissions:denied": undefined;
  started: undefined;
  "question:changed": QuestionChangedPayload;
  completed: CompletedPayload;
  error: ErrorPayload;
  resize: ResizePayload;
  destroyed: undefined;
}

const INCOMING_EVENT_TYPES: ReadonlySet<string> = new Set<IncomingEventType>([
  "ready",
  "consent:granted",
  "permissions:denied",
  "started",
  "question:changed",
  "completed",
  "error",
  "resize",
]);

/**
 * Validates that `data` is shaped like a BEAI embed protocol message: an object carrying
 * exactly `source: "beai-embed"`, `version: 1`, and a string `type`. Deliberately does not
 * validate `payload` — the protocol is a thin transport, and payloads are validated at the
 * point of use (e.g. `resize`'s `height` is checked before it drives a DOM write).
 */
export function isBeaiEmbedMessage(data: unknown): data is BeaiEmbedMessage {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.source === EMBED_MESSAGE_SOURCE &&
    candidate.version === EMBED_MESSAGE_VERSION &&
    typeof candidate.type === "string"
  );
}

/** Narrows a validated envelope's `type` to a known iframe → host event name. */
export function isIncomingEventType(type: string): type is IncomingEventType {
  return INCOMING_EVENT_TYPES.has(type);
}
