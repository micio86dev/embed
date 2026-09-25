import { buildIframeSrc, createIframeElement, resolveContainer } from "./dom";
import { BeaiEmbedError } from "./errors";
import {
  EMBED_MESSAGE_SOURCE,
  EMBED_MESSAGE_VERSION,
  isBeaiEmbedMessage,
  isIncomingEventType,
  type BeaiEmbedMessage,
  type CompletedPayload,
  type EmbedEventType,
  type ErrorPayload,
  type EventPayloadMap,
  type IncomingEventType,
  type OutgoingMessageType,
  type QuestionChangedPayload,
  type ThemeOptions,
} from "./protocol";

/**
 * Placeholder production default — actual embed-hosting domain isn't decided yet.
 * Override via `embedOrigin` in `BEAI.mount()` options (staging, local dev, tests).
 */
export const DEFAULT_EMBED_ORIGIN = "https://embed.beai.example";

/**
 * How long `mount()` waits for the iframe's `ready` message before giving up (gga round 3,
 * finding R4-ready-no-timeout). Without this, a host down, a CSP `frame-src` block, a
 * network failure, or simply a wrong `embedOrigin` left `start()` queued FOREVER with no
 * `onError` ever firing — nothing told the host the interview never loaded. Not
 * configurable via `MountOptions` (SPEC §4.2 doesn't name a `readyTimeoutMs` option); a
 * fixed, generous value is the smallest fix that actually surfaces the failure.
 */
export const READY_TIMEOUT_MS = 15_000;

export interface MountOptions {
  /** Selector or element the iframe is appended into. */
  container: HTMLElement | string;
  /** Session token from the client backend. */
  token: string;
  /** UI locale; defaults to the interview's own locale (decided iframe-side). */
  locale?: string;
  /** Only applied iframe-side if the org's white-label branding is enabled. */
  theme?: ThemeOptions;
  /**
   * Origin the embed iframe is served from, and the only origin the SDK accepts inbound
   * postMessage traffic from. Defaults to the (placeholder) production BEAI embed origin;
   * override for local/staging environments and in tests.
   */
  embedOrigin?: string;
  onReady?: () => void;
  onStarted?: () => void;
  onQuestionChanged?: (payload: QuestionChangedPayload) => void;
  onCompleted?: (payload: CompletedPayload) => void;
  onError?: (payload: ErrorPayload) => void;
  onDestroyed?: () => void;
}

type Listener<T extends EmbedEventType> = (payload: EventPayloadMap[T]) => void;

/**
 * Maps each event name to the `on<Event>` mount-option callback it also triggers, so the
 * PascalCase-ish callback prop (`onQuestionChanged`) and the `.on("question:changed", cb)`
 * string form normalize to, and both fire for, the same logical event. Events with no
 * dedicated callback prop (`consent:granted`, `permissions:denied`, `resize`) are reachable
 * only via `.on()`.
 */
const EVENT_TO_CALLBACK = {
  ready: "onReady",
  started: "onStarted",
  "question:changed": "onQuestionChanged",
  completed: "onCompleted",
  error: "onError",
  destroyed: "onDestroyed",
} as const satisfies Partial<Record<EmbedEventType, keyof MountOptions>>;

type EventWithCallback = keyof typeof EVENT_TO_CALLBACK;

function hasCallback(event: EmbedEventType): event is EventWithCallback {
  return event in EVENT_TO_CALLBACK;
}

/**
 * Internal implementation class. Exposed to consumers as `BEAI.mount(...)` (see
 * `index.ts`) — `BeaiEmbed` itself is not part of the public `import { BEAI }` surface.
 */
export class BeaiEmbed {
  private readonly options: MountOptions;
  private readonly embedOrigin: string;
  private iframe: HTMLIFrameElement | null = null;
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private readonly listeners = new Map<EmbedEventType, Set<Listener<EmbedEventType>>>();
  private mounted = false;
  private destroyed = false;
  private ready = false;
  private pendingStart = false;
  private readyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private constructor(options: MountOptions) {
    this.options = options;
    // new URL(...).origin (gga finding, non-blocking): "https://embed.x/" (a trailing
    // slash) is a perfectly normal way to write the origin, but event.origin from a real
    // browser postMessage event is NEVER trailing-slashed — every subsequent
    // `event.origin !== this.embedOrigin` comparison would then silently fail forever,
    // `ready` would never arrive, and a queued start() would never go out. Normalizing
    // once here, not per-comparison, fixes every call site at once.
    // try/catch → typed error (gga round 3, finding R3-002): a bare hostname with no
    // scheme ("embed.beai.com") makes new URL() throw a native TypeError, a different
    // error type than the opaque-origin case below even though both are the same class of
    // programmer misuse — BeaiEmbedError's own doc promises ALL programmer-facing misuse
    // surfaces through it.
    let embedOrigin: string;
    try {
      embedOrigin = new URL(options.embedOrigin ?? DEFAULT_EMBED_ORIGIN).origin;
    } catch {
      throw new BeaiEmbedError(
        "invalid_embed_origin",
        `embedOrigin "${options.embedOrigin}" is not a valid URL.`,
      );
    }
    // Reject an opaque origin (gga finding, round 2, non-blocking): a `file:`/`data:`
    // embedOrigin resolves to the literal string "null", which would then match ANY
    // opaque-origin iframe's `event.origin` — not just this SDK's own. `event.source`
    // still blocks a forged message, but there's no reason to accept a configuration that
    // weakens the FIRST check silently instead of refusing it outright.
    if (embedOrigin === "null") {
      throw new BeaiEmbedError(
        "invalid_embed_origin",
        `embedOrigin "${options.embedOrigin}" resolves to an opaque origin ("null"), which would match any opaque-origin iframe. Use an http(s) origin.`,
      );
    }
    this.embedOrigin = embedOrigin;
  }

  /** Creates a new instance and mounts it immediately — the `BEAI.mount()` factory shape. */
  static mount(options: MountOptions): BeaiEmbed {
    const instance = new BeaiEmbed(options);
    instance.mount();
    return instance;
  }

  /**
   * Creates the iframe and attaches it to the resolved container. Idempotent: calling
   * `mount()` again on an already-mounted instance is a no-op that returns `this` without
   * creating a second iframe or registering a second message listener (AGENTS.md
   * idempotency rule). Calling `mount()` again after `destroy()` throws
   * `BeaiEmbedError("instance_destroyed")` — a destroyed instance is never resurrected.
   */
  mount(): this {
    if (this.mounted) return this;
    this.assertNotDestroyed();

    const container = resolveContainer(this.options.container);
    const src = buildIframeSrc(this.embedOrigin, this.options.token, this.options.locale);
    const iframe = createIframeElement(src);
    container.appendChild(iframe);
    this.iframe = iframe;

    this.messageListener = (event: MessageEvent): void => this.handleMessage(event);
    window.addEventListener("message", this.messageListener);

    // See READY_TIMEOUT_MS's own doc — cleared the moment `ready` arrives
    // (processIncomingEvent) or the instance is destroyed.
    this.readyTimeoutId = setTimeout(() => this.handleReadyTimeout(), READY_TIMEOUT_MS);

    this.mounted = true;
    return this;
  }

  /**
   * Registers a listener for a protocol event (iframe → host) or the local `"destroyed"`
   * event. Fires independently of, and in addition to, any matching `on<Event>` callback
   * passed to `mount()` — both delivery paths coexist. Returns an unsubscribe function.
   */
  on<T extends EmbedEventType>(event: T, callback: Listener<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback as Listener<EmbedEventType>);
    return () => {
      set?.delete(callback as Listener<EmbedEventType>);
    };
  }

  /**
   * Sends `start` to the iframe. If the iframe hasn't reported `ready` yet, the intent is
   * queued and flushed automatically the moment `ready` arrives, rather than sent
   * immediately or dropped (SPEC §4.4 / AGENTS.md: a dropped early `start()` is a real
   * interview a candidate never gets to take).
   */
  start(): void {
    this.assertNotDestroyed();
    if (this.ready) {
      this.postToIframe("start");
    } else {
      this.pendingStart = true;
    }
  }

  /**
   * Ends the interview. Before `ready`, this ALWAYS cancels a queued `start()` (gga finding:
   * "start() then end() before ready" previously left `pendingStart` set, so the queued
   * `start` still fired the moment `ready` arrived — an interview the host had already
   * cancelled would still begin) and never posts `end` to the iframe: before `ready` the
   * iframe is still on `about:blank`, so a posted message would be silently dropped by the
   * browser's own origin check anyway — clearing the pending intent locally is the real
   * cancellation, not something to leave to that incidental browser behavior. After `ready`,
   * `end` is sent immediately; the iframe's own state machine handles it.
   */
  end(): void {
    this.assertNotDestroyed();
    if (!this.ready) {
      this.pendingStart = false;
      return;
    }
    this.postToIframe("end");
  }

  /**
   * Removes the iframe and the window message listener, and fires `destroyed`. Idempotent:
   * calling `destroy()` more than once is a safe no-op that never throws.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.clearReadyTimeout();

    if (this.messageListener) {
      window.removeEventListener("message", this.messageListener);
      this.messageListener = null;
    }
    if (this.iframe?.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
    this.iframe = null;
    this.mounted = false;

    this.dispatch("destroyed", undefined);
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new BeaiEmbedError(
        "instance_destroyed",
        "This BEAI embed instance has already been destroyed.",
      );
    }
  }

  private clearReadyTimeout(): void {
    if (this.readyTimeoutId !== null) {
      clearTimeout(this.readyTimeoutId);
      this.readyTimeoutId = null;
    }
  }

  /**
   * See READY_TIMEOUT_MS's own doc. Fires the SAME "error" event real iframe-emitted
   * errors use (SPEC §4.3's ErrorPayload shape), through both delivery paths (`onError`
   * and `.on('error')`) — a host that only listens for iframe-originated errors still
   * hears about this one, since from the host's point of view "the interview never loaded"
   * is the same class of failure regardless of WHERE it was detected. `code:
   * "embed_unreachable"` is an SDK-synthesized code, not one of SPEC §4.3's iframe-emitted
   * codes (`origin_not_allowed`, `cookie_blocked`, etc.) — this failure was never sent BY
   * the iframe, since the iframe never loaded far enough to send anything.
   */
  private handleReadyTimeout(): void {
    this.readyTimeoutId = null;
    if (this.ready || this.destroyed) return;

    const payload: ErrorPayload = {
      code: "embed_unreachable",
      message: `The embed iframe did not report ready within ${READY_TIMEOUT_MS}ms.`,
      recoverable: false,
    };
    this.dispatch("error", payload);
  }

  private postToIframe(type: OutgoingMessageType, payload?: unknown): void {
    const target = this.iframe?.contentWindow;
    if (!target) return;
    const message: BeaiEmbedMessage<OutgoingMessageType> = {
      source: EMBED_MESSAGE_SOURCE,
      version: EMBED_MESSAGE_VERSION,
      type,
      payload,
    };
    target.postMessage(message, this.embedOrigin);
  }

  private handleMessage(event: MessageEvent): void {
    // (a) reject anything from an unexpected origin — before even parsing the payload.
    if (event.origin !== this.embedOrigin) return;
    // (a.1) reject anything not from THIS instance's own iframe (gga finding, non-blocking
    // but real): two embeds mounted on the same page share the same embedOrigin, so an
    // origin check alone cannot tell them apart — without this, each instance would also
    // react to the OTHER instance's `ready`/`completed`/etc. messages, misrouting a
    // `completed { interviewId }` to the wrong callback.
    if (event.source !== this.iframe?.contentWindow) return;
    // (b) reject anything not shaped like `{source: "beai-embed", version: 1, type, payload?}`.
    if (!isBeaiEmbedMessage(event.data)) return;
    const { type, payload } = event.data;
    if (!isIncomingEventType(type)) return;

    this.processIncomingEvent(type, payload);
  }

  private processIncomingEvent(type: IncomingEventType, payload: unknown): void {
    if (type === "ready") {
      this.ready = true;
      this.clearReadyTimeout();
      // The SDK's job is only to relay `set-theme`; the org's white-label flag gates
      // whether it's actually applied, and that gating happens iframe-side (SPEC §4.2:
      // "only applied if org white-label allows"). Never move that decision into this
      // package — it has no visibility into org branding settings.
      if (this.options.theme) {
        this.postToIframe("set-theme", this.options.theme);
      }
      if (this.pendingStart) {
        this.pendingStart = false;
        this.postToIframe("start");
      }
    }

    if (type === "resize") {
      const height = (payload as { height?: unknown } | undefined)?.height;
      // Number.isFinite() (gga finding) — a bare `typeof height === "number"` still lets
      // NaN, Infinity and negative values through to a DOM write.
      const validHeight = typeof height === "number" && Number.isFinite(height) && height >= 0;
      if (validHeight && this.iframe) {
        this.iframe.style.height = `${height}px`;
      }
      // Skip dispatch entirely for an invalid payload (gga round 3, finding
      // R2-resize-payload-type): the DOM write was already guarded, but a `.on('resize')`
      // listener received the SAME unvalidated payload regardless — typed as
      // `ResizePayload` (`{ height: number }`) while actually possibly NaN, negative, or a
      // string. A listener has no reason to see a payload the SDK itself refused to act on.
      if (!validHeight) return;
    }

    this.dispatch(type, payload as EventPayloadMap[typeof type]);
  }

  /**
   * Each handler (the `on<Event>` mount callback and every `.on()` listener) runs inside
   * its OWN try/catch (gga round 3, finding R4-callback-isolation/R3-001): without this,
   * a throwing `onCompleted` would skip every `.on('completed')` listener registered after
   * it — the two delivery paths this class's own docs promise "coexist independently" did
   * not, in practice, survive one consumer's bug. For the `destroyed` event specifically, an
   * uncaught exception here would also propagate OUT of `destroy()` itself, leaving cleanup
   * (the iframe removal, the listener teardown) already done but the caller seeing a thrown
   * `destroy()` call. A caught handler exception is logged, never rethrown or swallowed
   * silently — `console.error` is the same visibility level `dom.ts`'s own container-lookup
   * failure gets, just non-fatal here since it is the HOST's bug, not this SDK's.
   */
  private dispatch<T extends EmbedEventType>(event: T, payload: EventPayloadMap[T]): void {
    if (hasCallback(event)) {
      const callbackName = EVENT_TO_CALLBACK[event];
      // Single isolated cast: `MountOptions`'s `on*` props each have a different concrete
      // signature, so a dynamic lookup by key can't be expressed without one.
      const callback = this.options[callbackName] as
        ((payload: EventPayloadMap[T]) => void) | undefined;
      this.invokeSafely(() => callback?.(payload));
    }

    const listenersForEvent = this.listeners.get(event);
    if (listenersForEvent) {
      for (const listener of listenersForEvent) {
        this.invokeSafely(() => (listener as Listener<T>)(payload));
      }
    }
  }

  private invokeSafely(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      // The one place a host's own handler bug is surfaced without breaking every OTHER
      // handler for the same event.
      console.error("@beai/embed: a host event handler threw", error);
    }
  }
}
