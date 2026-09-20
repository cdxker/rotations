export const PCM_FRAME_DURATION_MS = 20;
export const PCM_SAMPLE_RATE = 16_000;
export const PCM_CHANNELS = 1;
export const PCM_BYTES_PER_SAMPLE = 2;
export const PCM_SAMPLES_PER_FRAME =
  (PCM_SAMPLE_RATE * PCM_FRAME_DURATION_MS) / 1_000;
export const PCM_FRAME_BYTES =
  PCM_SAMPLES_PER_FRAME * PCM_CHANNELS * PCM_BYTES_PER_SAMPLE;
export const PCM_MAX_QUEUED_FRAMES = 10;

export const DISCORD_PCM_SAMPLE_RATE = 48_000;
export const DISCORD_PCM_CHANNELS = 2;
export const DISCORD_PCM_FRAME_BYTES =
  ((DISCORD_PCM_SAMPLE_RATE * PCM_FRAME_DURATION_MS) / 1_000) *
  DISCORD_PCM_CHANNELS *
  PCM_BYTES_PER_SAMPLE;

const INT16_MIN = -32_768;
const INT16_MAX = 32_767;

export type PcmEnqueueResult = {
  droppedFrames: 0 | 1;
  queuedFrames: number;
  totalDroppedFrames: number;
};

export type PcmSourceStats = {
  droppedFrames: number;
  queuedFrames: number;
};

export type DiscordAudioSessionStats = {
  discordSpeakers: number;
  droppedDiscordFrames: number;
  droppedPhoneFrames: number;
  phoneCallers: number;
  queuedDiscordFrames: number;
  queuedPhoneFrames: number;
};

export type DiscordAudioMix = {
  discordOutput: Buffer;
  phoneOutputs: ReadonlyMap<string, Buffer>;
};

function assertByteChunk(chunk: Uint8Array): void {
  if (!(chunk instanceof Uint8Array)) {
    throw new TypeError("PCM audio must be a Uint8Array.");
  }
}

function assertPcmFrame(frame: Uint8Array): void {
  assertByteChunk(frame);

  if (frame.byteLength !== PCM_FRAME_BYTES) {
    throw new RangeError(
      `PCM frames must contain exactly ${PCM_FRAME_BYTES} bytes.`,
    );
  }
}

function frameBuffer(frame: Uint8Array): Buffer {
  return Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
}

function assertSourceId(sourceId: string): void {
  if (typeof sourceId !== "string" || sourceId.trim().length === 0) {
    throw new TypeError("Audio source IDs must be non-empty strings.");
  }
}

export function createSilencePcmFrame(): Buffer {
  return Buffer.alloc(PCM_FRAME_BYTES);
}

export function clampInt16(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("PCM sample values must be finite numbers.");
  }

  return Math.max(INT16_MIN, Math.min(INT16_MAX, Math.trunc(value)));
}

/**
 * Averages each signed 16-bit sample across the supplied frames. An empty
 * collection produces one frame of silence. Inputs are never mutated.
 */
export function mixPcmFrames(frames: readonly Uint8Array[]): Buffer {
  if (frames.length === 0) {
    return createSilencePcmFrame();
  }

  for (const frame of frames) {
    assertPcmFrame(frame);
  }

  const output = Buffer.allocUnsafe(PCM_FRAME_BYTES);
  const readableFrames = frames.map(frameBuffer);

  for (let offset = 0; offset < PCM_FRAME_BYTES; offset += 2) {
    let total = 0;

    for (const frame of readableFrames) {
      total += frame.readInt16LE(offset);
    }

    output.writeInt16LE(clampInt16(total / readableFrames.length), offset);
  }

  return output;
}

/**
 * A fixed-size FIFO for internal PCM frames. Enqueueing beyond 200 ms drops
 * the oldest audio so latency stays bounded. Dequeueing an empty/closed queue
 * yields a fresh silence frame.
 */
export class PcmFrameQueue {
  private readonly frames: Buffer[] = [];
  private droppedFrames = 0;
  private closed = false;

  public get isClosed(): boolean {
    return this.closed;
  }

  public get stats(): PcmSourceStats {
    return {
      droppedFrames: this.droppedFrames,
      queuedFrames: this.frames.length,
    };
  }

  public enqueue(frame: Uint8Array): PcmEnqueueResult {
    if (this.closed) {
      throw new Error("Cannot enqueue audio into a closed PCM frame queue.");
    }

    assertPcmFrame(frame);

    let droppedFrames: 0 | 1 = 0;

    if (this.frames.length === PCM_MAX_QUEUED_FRAMES) {
      this.frames.shift();
      this.droppedFrames += 1;
      droppedFrames = 1;
    }

    this.frames.push(Buffer.from(frame));

    return {
      droppedFrames,
      queuedFrames: this.frames.length,
      totalDroppedFrames: this.droppedFrames,
    };
  }

  public dequeue(): Buffer {
    return this.tryDequeue() ?? createSilencePcmFrame();
  }

  public tryDequeue(): Buffer | undefined {
    return this.frames.shift();
  }

  public clear(): void {
    this.frames.length = 0;
  }

  public close(): void {
    this.clear();
    this.closed = true;
  }
}

/** Collects arbitrary PCM byte chunks and emits only complete 640-byte frames. */
export class PcmFrameAssembler {
  private pending = Buffer.alloc(0);
  private closed = false;

  public get bufferedBytes(): number {
    return this.pending.byteLength;
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  public push(chunk: Uint8Array): Buffer[] {
    if (this.closed) {
      throw new Error("Cannot append audio to a closed PCM frame assembler.");
    }

    assertByteChunk(chunk);

    if (chunk.byteLength === 0) {
      return [];
    }

    const combined = Buffer.concat([this.pending, Buffer.from(chunk)]);
    const frameCount = Math.floor(combined.byteLength / PCM_FRAME_BYTES);
    const frames: Buffer[] = [];

    for (let index = 0; index < frameCount; index += 1) {
      const start = index * PCM_FRAME_BYTES;
      frames.push(Buffer.from(combined.subarray(start, start + PCM_FRAME_BYTES)));
    }

    this.pending = Buffer.from(combined.subarray(frameCount * PCM_FRAME_BYTES));

    return frames;
  }

  /** Discards a partial frame and returns the number of discarded bytes. */
  public reset(): number {
    const discardedBytes = this.pending.byteLength;
    this.pending = Buffer.alloc(0);
    return discardedBytes;
  }

  /** Permanently closes the assembler and discards any partial frame. */
  public close(): number {
    const discardedBytes = this.reset();
    this.closed = true;
    return discardedBytes;
  }
}

/**
 * Converts one internal frame to Discord's raw 48 kHz stereo PCM shape using
 * deterministic 3x sample duplication. Signed sample values are unchanged.
 */
export function convert16kMonoTo48kStereoPcm(frame: Uint8Array): Buffer {
  assertPcmFrame(frame);

  const input = frameBuffer(frame);
  const output = Buffer.allocUnsafe(DISCORD_PCM_FRAME_BYTES);
  let outputOffset = 0;

  for (let inputOffset = 0; inputOffset < PCM_FRAME_BYTES; inputOffset += 2) {
    const sample = input.readInt16LE(inputOffset);

    for (let repeatedSample = 0; repeatedSample < 3; repeatedSample += 1) {
      output.writeInt16LE(sample, outputOffset);
      output.writeInt16LE(sample, outputOffset + 2);
      outputOffset += 4;
    }
  }

  return output;
}

/**
 * Transport-independent source registry and mixer. Routing owns the clock and
 * calls mixNextFrame exactly once per 20 ms interval.
 */
export class DiscordAudioSessionMixer {
  private readonly phoneCallers = new Map<string, PcmFrameQueue>();
  private readonly discordSpeakers = new Map<string, PcmFrameQueue>();
  private droppedPhoneFrames = 0;
  private droppedDiscordFrames = 0;
  private closed = false;

  public get isClosed(): boolean {
    return this.closed;
  }

  public get stats(): DiscordAudioSessionStats {
    return {
      discordSpeakers: this.discordSpeakers.size,
      droppedDiscordFrames: this.droppedDiscordFrames,
      droppedPhoneFrames: this.droppedPhoneFrames,
      phoneCallers: this.phoneCallers.size,
      queuedDiscordFrames: this.totalQueuedFrames(this.discordSpeakers),
      queuedPhoneFrames: this.totalQueuedFrames(this.phoneCallers),
    };
  }

  public addPhoneCaller(callerId: string): void {
    this.addSource(this.phoneCallers, callerId, "phone caller");
  }

  public addDiscordSpeaker(speakerId: string): void {
    this.addSource(this.discordSpeakers, speakerId, "Discord speaker");
  }

  public removePhoneCaller(callerId: string): boolean {
    return this.removeSource(this.phoneCallers, callerId);
  }

  public removeDiscordSpeaker(speakerId: string): boolean {
    return this.removeSource(this.discordSpeakers, speakerId);
  }

  public enqueuePhoneFrame(
    callerId: string,
    frame: Uint8Array,
  ): PcmEnqueueResult {
    this.assertOpen();
    const result = this.requireSource(
      this.phoneCallers,
      callerId,
      "phone caller",
    ).enqueue(frame);
    this.droppedPhoneFrames += result.droppedFrames;
    return result;
  }

  public enqueueDiscordFrame(
    speakerId: string,
    frame: Uint8Array,
  ): PcmEnqueueResult {
    this.assertOpen();
    const result = this.requireSource(
      this.discordSpeakers,
      speakerId,
      "Discord speaker",
    ).enqueue(frame);
    this.droppedDiscordFrames += result.droppedFrames;
    return result;
  }

  public getPhoneCallerStats(callerId: string): PcmSourceStats | null {
    return this.phoneCallers.get(callerId)?.stats ?? null;
  }

  public getDiscordSpeakerStats(speakerId: string): PcmSourceStats | null {
    return this.discordSpeakers.get(speakerId)?.stats ?? null;
  }

  public mixNextFrame(): DiscordAudioMix {
    this.assertOpen();

    const phoneFrames = this.takeAvailableFrames(this.phoneCallers);
    const discordFrames = this.takeAvailableFrames(this.discordSpeakers);
    const phoneOutputs = new Map<string, Buffer>();

    for (const callerId of this.phoneCallers.keys()) {
      const audibleFrames = [...discordFrames.values()];

      for (const [otherCallerId, frame] of phoneFrames) {
        if (otherCallerId !== callerId) {
          audibleFrames.push(frame);
        }
      }

      phoneOutputs.set(callerId, mixPcmFrames(audibleFrames));
    }

    return {
      discordOutput: mixPcmFrames([...phoneFrames.values()]),
      phoneOutputs,
    };
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    for (const queue of this.phoneCallers.values()) {
      queue.close();
    }

    for (const queue of this.discordSpeakers.values()) {
      queue.close();
    }

    this.phoneCallers.clear();
    this.discordSpeakers.clear();
    this.closed = true;
  }

  private addSource(
    sources: Map<string, PcmFrameQueue>,
    sourceId: string,
    sourceType: string,
  ): void {
    this.assertOpen();
    assertSourceId(sourceId);

    if (sources.has(sourceId)) {
      throw new Error(`Audio ${sourceType} ${sourceId} is already registered.`);
    }

    sources.set(sourceId, new PcmFrameQueue());
  }

  private removeSource(
    sources: Map<string, PcmFrameQueue>,
    sourceId: string,
  ): boolean {
    const queue = sources.get(sourceId);

    if (!queue) {
      return false;
    }

    queue.close();
    sources.delete(sourceId);
    return true;
  }

  private requireSource(
    sources: Map<string, PcmFrameQueue>,
    sourceId: string,
    sourceType: string,
  ): PcmFrameQueue {
    const queue = sources.get(sourceId);

    if (!queue) {
      throw new Error(`Audio ${sourceType} ${sourceId} is not registered.`);
    }

    return queue;
  }

  private takeAvailableFrames(
    sources: ReadonlyMap<string, PcmFrameQueue>,
  ): Map<string, Buffer> {
    const frames = new Map<string, Buffer>();

    for (const [sourceId, queue] of sources) {
      const frame = queue.tryDequeue();

      if (frame) {
        frames.set(sourceId, frame);
      }
    }

    return frames;
  }

  private totalQueuedFrames(
    sources: ReadonlyMap<string, PcmFrameQueue>,
  ): number {
    let total = 0;

    for (const queue of sources.values()) {
      total += queue.stats.queuedFrames;
    }

    return total;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("Discord audio session mixer is closed.");
    }
  }
}
