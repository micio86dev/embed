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

  private constructor(options: MountOptions) {
    this.options = options;
    this.embedOrigin = options.embedOrigin ?? DEFAULT_EMBED_ORIGIN;
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
      // Number.isFinite() (gga finding, non-blocking) — a bare `typeof height === "number"`
      // still lets NaN, Infinity and negative values through to a DOM write.
      if (typeof height === "number" && Number.isFinite(height) && height >= 0 && this.iframe) {
        this.iframe.style.height = `${height}px`;
      }
    }

    this.dispatch(type, payload as EventPayloadMap[typeof type]);
  }

  private dispatch<T extends EmbedEventType>(event: T, payload: EventPayloadMap[T]): void {
    if (hasCallback(event)) {
      const callbackName = EVENT_TO_CALLBACK[event];
      // Single isolated cast: `MountOptions`'s `on*` props each have a different concrete
      // signature, so a dynamic lookup by key can't be expressed without one.
      const callback = this.options[callbackName] as
        ((payload: EventPayloadMap[T]) => void) | undefined;
      callback?.(payload);
    }

    const listenersForEvent = this.listeners.get(event);
    if (listenersForEvent) {
      for (const listener of listenersForEvent) {
        (listener as Listener<T>)(payload);
      }
    }
  }
}
