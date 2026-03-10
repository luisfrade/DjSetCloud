/**
 * iOS Audio Session Unlock
 *
 * iOS Safari blocks audio playback until a user gesture activates the audio session.
 * This utility plays a tiny silent buffer via Web Audio API to unlock the session.
 * Must be called synchronously inside a user gesture handler (click / touchstart).
 */

let unlocked = false;

export function unlockAudioSession(): void {
  if (unlocked) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    unlocked = true;
  } catch {
    // Audio unlock is best-effort – swallow errors
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}
