import {
  initialPopup,
  nativeCallTimeoutMs,
  reducePopup,
  uploadRoundTripMs,
  type PopupEvent,
  type PopupPhase,
} from "./popupState";

export interface PopupClock {
  setTimeout: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
}

export interface PopupSession {
  phase(): PopupPhase;
  commit(event: PopupEvent): void;
}

/**
 * Owns the one popup phase. The watchdog is a timer of its own: it is not
 * the timer inside the native-message promise, and a late reply cannot turn
 * busy back on after the watchdog has left the in-flight phase.
 */
export function createPopupSession(options: {
  render: (phase: PopupPhase) => void;
  clock?: PopupClock;
  timeoutMs?: number;
  log?: (line: string) => void;
}): PopupSession {
  const clock = options.clock ?? globalThis;
  const timeoutMs = options.timeoutMs ?? nativeCallTimeoutMs;
  const log =
    options.log ??
    ((line: string) => {
      if (line.includes("watchdog")) console.warn(line);
      else console.info(line);
    });
  let phase = initialPopup();
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  function disarm(): void {
    if (watchdog === undefined) return;
    clock.clearTimeout(watchdog);
    watchdog = undefined;
  }

  function arm(): void {
    disarm();
    const budget = phase.name === "sending" ? uploadRoundTripMs : timeoutMs;
    watchdog = clock.setTimeout(() => {
      watchdog = undefined;
      if (!phase.busy) return;
      log(`[page-to-paper] popup watchdog timeout ${phase.name}`);
      commit({ type: "busyTimeout" });
    }, budget);
  }

  function commit(event: PopupEvent): void {
    const from = phase;
    phase = reducePopup(phase, event);
    log(`[page-to-paper] popup ${from.name} -> ${phase.name} busy=${phase.busy}`);
    options.render(phase);
    const sameBusyWork = from.busy && phase.busy && from.name === phase.name;
    if (phase.busy && !sameBusyWork) arm();
    else if (!phase.busy) disarm();
  }

  return {
    phase: () => phase,
    commit,
  };
}
