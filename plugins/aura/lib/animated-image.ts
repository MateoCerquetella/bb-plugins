// Plays an animated GIF into the WebGL texture frame by frame. A WebGL texture
// upload from an <img> only ever captures one frame, so the shader path decodes
// frames itself with WebCodecs' ImageDecoder and uploads each when it is due.

export interface DecodedFrame { image: TexImageSource & { close?(): void }; duration: number }
export interface FramePlayer {
  readonly current: TexImageSource;
  /** Returns the next frame once the current one has played for its delay, else null. */
  advance(now: number): TexImageSource | null;
  dispose(): void;
}

/** GIF delays in ms. Like browsers, treat 0–10 ms frames as 100 ms. */
export function gifFrameDelay(durationMicroseconds: number | null | undefined): number {
  const ms = (durationMicroseconds ?? 0) / 1000;
  return ms <= 10 ? 100 : ms;
}

export function createFramePlayer(count: number, first: DecodedFrame, decode: (index: number) => Promise<DecodedFrame>): FramePlayer {
  let current = first, index = 0, shownAt: number | null = null;
  let next: { frame: DecodedFrame; index: number } | null = null;
  let pending = false, failed = false, disposed = false;
  function prefetch(): void {
    if (pending || next || failed || disposed || count < 2) return;
    pending = true;
    const nextIndex = (index + 1) % count;
    decode(nextIndex).then(frame => {
      pending = false;
      if (disposed) frame.image.close?.();
      else next = { frame, index: nextIndex };
    }, () => { pending = false; failed = true; }); // Keep the last good frame.
  }
  return {
    get current() { return current.image; },
    advance(now) {
      if (disposed) return null;
      if (shownAt === null) shownAt = now;
      if (!next || now - shownAt < current.duration) { prefetch(); return null; }
      current.image.close?.();
      current = next.frame; index = next.index; next = null; shownAt = now;
      prefetch();
      return current.image;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      current.image.close?.(); next?.frame.image.close?.(); next = null;
    },
  };
}

interface ImageDecoderLike {
  readonly completed: Promise<void>;
  readonly tracks: { readonly ready: Promise<void>; readonly selectedTrack: { readonly frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<{ image: TexImageSource & { close(): void; readonly duration: number | null } }>;
  close(): void;
}
type ImageDecoderConstructor = new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike;

export function animatedImagesSupported(): boolean {
  return typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder === "function";
}

/** Decode a GIF URL into a frame player, or null when WebCodecs is unavailable. */
export async function openAnimatedImage(url: string, signal: AbortSignal): Promise<FramePlayer | null> {
  const Decoder = (globalThis as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder;
  if (!Decoder) return null;
  const response = await fetch(url, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`Aura: GIF request failed (${response.status})`);
  const decoder = new Decoder({ data: await response.arrayBuffer(), type: "image/gif" });
  try {
    await decoder.completed; await decoder.tracks.ready;
    const count = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
    const decode = async (frameIndex: number): Promise<DecodedFrame> => {
      const { image } = await decoder.decode({ frameIndex });
      return { image, duration: gifFrameDelay(image.duration) };
    };
    const first = await decode(0);
    if (signal.aborted) { first.image.close?.(); decoder.close(); return null; }
    const player = createFramePlayer(count, first, decode);
    return { get current() { return player.current; }, advance: now => player.advance(now), dispose() { player.dispose(); decoder.close(); } };
  } catch (error) { decoder.close(); throw error; }
}
