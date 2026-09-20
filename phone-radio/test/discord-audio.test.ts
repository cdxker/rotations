import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISCORD_PCM_CHANNELS,
  DISCORD_PCM_FRAME_BYTES,
  DISCORD_PCM_SAMPLE_RATE,
  DiscordAudioSessionMixer,
  PCM_BYTES_PER_SAMPLE,
  PCM_CHANNELS,
  PCM_FRAME_BYTES,
  PCM_FRAME_DURATION_MS,
  PCM_MAX_QUEUED_FRAMES,
  PCM_SAMPLE_RATE,
  PCM_SAMPLES_PER_FRAME,
  PcmFrameAssembler,
  PcmFrameQueue,
  clampInt16,
  convert16kMonoTo48kStereoPcm,
  createSilencePcmFrame,
  mixPcmFrames,
} from "../src/discord-audio.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function constantFrame(sample: number): Buffer {
  const frame = Buffer.alloc(PCM_FRAME_BYTES);

  for (let offset = 0; offset < frame.byteLength; offset += 2) {
    frame.writeInt16LE(sample, offset);
  }

  return frame;
}

function firstSample(frame: Uint8Array): number {
  return Buffer.from(
    frame.buffer,
    frame.byteOffset,
    frame.byteLength,
  ).readInt16LE(0);
}

function expectSilence(frame: Uint8Array): void {
  expect(frame).toHaveLength(PCM_FRAME_BYTES);
  expect(Buffer.from(frame).equals(Buffer.alloc(PCM_FRAME_BYTES))).toBe(true);
}

describe("internal PCM format", () => {
  it("uses exact 20 ms 16 kHz mono signed-16 frame dimensions", () => {
    expect(PCM_FRAME_DURATION_MS).toBe(20);
    expect(PCM_SAMPLE_RATE).toBe(16_000);
    expect(PCM_CHANNELS).toBe(1);
    expect(PCM_BYTES_PER_SAMPLE).toBe(2);
    expect(PCM_SAMPLES_PER_FRAME).toBe(320);
    expect(PCM_FRAME_BYTES).toBe(640);
    expect(PCM_MAX_QUEUED_FRAMES * PCM_FRAME_DURATION_MS).toBe(200);
  });

  it("creates independent, exact-sized silence frames", () => {
    const first = createSilencePcmFrame();
    const second = createSilencePcmFrame();

    expectSilence(first);
    expectSilence(second);
    expect(first).not.toBe(second);
  });
});

describe("mixPcmFrames", () => {
  it("returns silence when no source has a frame", () => {
    expectSilence(mixPcmFrames([]));
  });

  it("preserves every signed sample from a single source", () => {
    const source = Buffer.alloc(PCM_FRAME_BYTES);

    for (
      let sampleIndex = 0;
      sampleIndex < PCM_SAMPLES_PER_FRAME;
      sampleIndex += 1
    ) {
      source.writeInt16LE(sampleIndex - 160, sampleIndex * 2);
    }

    expect(mixPcmFrames([source])).toEqual(source);
  });

  it("deterministically averages multiple sources toward zero", () => {
    const output = mixPcmFrames([
      constantFrame(-3),
      constantFrame(2),
      constantFrame(7),
    ]);

    expect(firstSample(output)).toBe(2);
    expect(output).toEqual(constantFrame(2));
  });

  it("clamps finite sample values to the signed Int16 range", () => {
    expect(clampInt16(100_000)).toBe(32_767);
    expect(clampInt16(-100_000)).toBe(-32_768);
    expect(clampInt16(12.9)).toBe(12);
    expect(clampInt16(-12.9)).toBe(-12);
    expect(() => clampInt16(Number.NaN)).toThrow(TypeError);
    expect(() => clampInt16(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it("preserves the extreme signed values without wrapping", () => {
    expect(mixPcmFrames([constantFrame(32_767)])).toEqual(
      constantFrame(32_767),
    );
    expect(mixPcmFrames([constantFrame(-32_768)])).toEqual(
      constantFrame(-32_768),
    );
  });

  it("rejects undersized, oversized, and non-byte-array frames", () => {
    expect(() => mixPcmFrames([Buffer.alloc(PCM_FRAME_BYTES - 1)])).toThrow(
      /exactly 640 bytes/,
    );
    expect(() => mixPcmFrames([Buffer.alloc(PCM_FRAME_BYTES + 1)])).toThrow(
      /exactly 640 bytes/,
    );
    expect(() =>
      mixPcmFrames(["not audio" as unknown as Uint8Array]),
    ).toThrow(TypeError);
  });
});

describe("PcmFrameQueue", () => {
  it("is FIFO and copies enqueued input", () => {
    const queue = new PcmFrameQueue();
    const first = constantFrame(100);

    queue.enqueue(first);
    queue.enqueue(constantFrame(200));
    first.writeInt16LE(9_999, 0);

    expect(firstSample(queue.dequeue())).toBe(100);
    expect(firstSample(queue.dequeue())).toBe(200);
  });

  it("emits fresh silence frames on underflow", () => {
    const queue = new PcmFrameQueue();
    const first = queue.dequeue();
    const second = queue.dequeue();

    expectSilence(first);
    expectSilence(second);
    expect(first).not.toBe(second);
    expect(queue.tryDequeue()).toBeUndefined();
  });

  it("holds at most ten frames and drops the oldest on overflow", () => {
    const queue = new PcmFrameQueue();

    for (let sample = 0; sample <= PCM_MAX_QUEUED_FRAMES; sample += 1) {
      const result = queue.enqueue(constantFrame(sample));

      expect(result.droppedFrames).toBe(
        sample === PCM_MAX_QUEUED_FRAMES ? 1 : 0,
      );
    }

    expect(queue.stats).toEqual({ droppedFrames: 1, queuedFrames: 10 });
    expect(firstSample(queue.dequeue())).toBe(1);

    for (let sample = 2; sample <= PCM_MAX_QUEUED_FRAMES; sample += 1) {
      expect(firstSample(queue.dequeue())).toBe(sample);
    }

    expectSilence(queue.dequeue());
  });

  it("reports per-enqueue and cumulative overflow counts", () => {
    const queue = new PcmFrameQueue();

    for (let index = 0; index < PCM_MAX_QUEUED_FRAMES; index += 1) {
      queue.enqueue(constantFrame(index));
    }

    expect(queue.enqueue(constantFrame(10))).toEqual({
      droppedFrames: 1,
      queuedFrames: 10,
      totalDroppedFrames: 1,
    });
    expect(queue.enqueue(constantFrame(11))).toEqual({
      droppedFrames: 1,
      queuedFrames: 10,
      totalDroppedFrames: 2,
    });
  });

  it("rejects invalid frame sizes without changing the queue", () => {
    const queue = new PcmFrameQueue();

    expect(() => queue.enqueue(Buffer.alloc(2))).toThrow(RangeError);
    expect(queue.stats).toEqual({ droppedFrames: 0, queuedFrames: 0 });
  });

  it("clears queued audio without closing", () => {
    const queue = new PcmFrameQueue();
    queue.enqueue(constantFrame(1));

    queue.clear();

    expect(queue.stats.queuedFrames).toBe(0);
    expect(queue.isClosed).toBe(false);
    expect(queue.enqueue(constantFrame(2)).queuedFrames).toBe(1);
  });

  it("clears on close, rejects later input, and stays safely silent", () => {
    const queue = new PcmFrameQueue();
    queue.enqueue(constantFrame(1));

    queue.close();
    queue.close();

    expect(queue.isClosed).toBe(true);
    expect(queue.stats.queuedFrames).toBe(0);
    expect(() => queue.enqueue(constantFrame(2))).toThrow(/closed/);
    expect(queue.tryDequeue()).toBeUndefined();
    expectSilence(queue.dequeue());
  });
});

describe("PcmFrameAssembler", () => {
  it("splits arbitrary and sample-splitting chunks into exact frames", () => {
    const assembler = new PcmFrameAssembler();
    const input = Buffer.alloc(PCM_FRAME_BYTES * 2 + 17);

    for (let index = 0; index < input.byteLength; index += 1) {
      input[index] = index % 251;
    }

    expect(assembler.push(input.subarray(0, 111))).toEqual([]);
    const firstOutput = assembler.push(input.subarray(111, 811));
    const secondOutput = assembler.push(input.subarray(811));
    const frames = [...firstOutput, ...secondOutput];

    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.byteLength === PCM_FRAME_BYTES)).toBe(
      true,
    );
    expect(Buffer.concat(frames)).toEqual(input.subarray(0, 1_280));
    expect(assembler.bufferedBytes).toBe(17);
  });

  it("returns complete frames immediately and ignores empty chunks", () => {
    const assembler = new PcmFrameAssembler();
    const frame = constantFrame(-123);

    expect(assembler.push(Buffer.alloc(0))).toEqual([]);
    expect(assembler.push(frame)).toEqual([frame]);
    expect(assembler.bufferedBytes).toBe(0);
  });

  it("reset discards only the partial frame and remains reusable", () => {
    const assembler = new PcmFrameAssembler();
    assembler.push(Buffer.alloc(73));

    expect(assembler.reset()).toBe(73);
    expect(assembler.bufferedBytes).toBe(0);
    expect(assembler.isClosed).toBe(false);
    expect(assembler.push(constantFrame(7))).toEqual([constantFrame(7)]);
  });

  it("close reports discarded bytes, is idempotent, and rejects later chunks", () => {
    const assembler = new PcmFrameAssembler();
    assembler.push(Buffer.alloc(91));

    expect(assembler.close()).toBe(91);
    expect(assembler.close()).toBe(0);
    expect(assembler.bufferedBytes).toBe(0);
    expect(assembler.isClosed).toBe(true);
    expect(() => assembler.push(Buffer.alloc(1))).toThrow(/closed/);
  });

  it("rejects values that are not byte arrays", () => {
    const assembler = new PcmFrameAssembler();

    expect(() =>
      assembler.push("not audio" as unknown as Uint8Array),
    ).toThrow(TypeError);
    expect(assembler.bufferedBytes).toBe(0);
  });
});

describe("convert16kMonoTo48kStereoPcm", () => {
  it("creates one exact 20 ms 48 kHz stereo frame", () => {
    expect(DISCORD_PCM_SAMPLE_RATE).toBe(48_000);
    expect(DISCORD_PCM_CHANNELS).toBe(2);
    expect(DISCORD_PCM_FRAME_BYTES).toBe(3_840);
    expect(convert16kMonoTo48kStereoPcm(constantFrame(1))).toHaveLength(3_840);
  });

  it("duplicates signed mono samples three times into both stereo channels", () => {
    const input = constantFrame(77);
    const samples = [-32_768, -1_234, 0, 32_767];

    samples.forEach((sample, index) => input.writeInt16LE(sample, index * 2));

    const output = convert16kMonoTo48kStereoPcm(input);

    samples.forEach((sample, inputIndex) => {
      const firstOutputSample = inputIndex * 6;

      for (let duplicate = 0; duplicate < 6; duplicate += 1) {
        expect(output.readInt16LE((firstOutputSample + duplicate) * 2)).toBe(
          sample,
        );
      }
    });
    expect(output.readInt16LE(24 * 2)).toBe(77);
  });

  it("rejects input that is not one exact internal frame", () => {
    expect(() => convert16kMonoTo48kStereoPcm(Buffer.alloc(639))).toThrow(
      /exactly 640 bytes/,
    );
  });
});

describe("DiscordAudioSessionMixer", () => {
  it("returns silence for Discord and for every registered idle caller", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addPhoneCaller("phone-2");

    const mixed = mixer.mixNextFrame();

    expectSilence(mixed.discordOutput);
    expect([...mixed.phoneOutputs.keys()]).toEqual(["phone-1", "phone-2"]);
    expectSilence(mixed.phoneOutputs.get("phone-1")!);
    expectSilence(mixed.phoneOutputs.get("phone-2")!);
  });

  it("sends every phone caller to Discord while excluding Discord speakers", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addPhoneCaller("phone-2");
    mixer.addDiscordSpeaker("discord-1");
    mixer.enqueuePhoneFrame("phone-1", constantFrame(1_000));
    mixer.enqueuePhoneFrame("phone-2", constantFrame(3_000));
    mixer.enqueueDiscordFrame("discord-1", constantFrame(30_000));

    expect(firstSample(mixer.mixNextFrame().discordOutput)).toBe(2_000);
  });

  it("mixes Discord speakers and other callers without phone self-echo", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addPhoneCaller("phone-2");
    mixer.addDiscordSpeaker("discord-1");
    mixer.enqueuePhoneFrame("phone-1", constantFrame(1_000));
    mixer.enqueuePhoneFrame("phone-2", constantFrame(3_000));
    mixer.enqueueDiscordFrame("discord-1", constantFrame(5_000));

    const output = mixer.mixNextFrame();

    expect(firstSample(output.phoneOutputs.get("phone-1")!)).toBe(4_000);
    expect(firstSample(output.phoneOutputs.get("phone-2")!)).toBe(3_000);
  });

  it("averages multiple Discord speakers with the other phone caller", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addPhoneCaller("phone-2");
    mixer.addDiscordSpeaker("discord-1");
    mixer.addDiscordSpeaker("discord-2");
    mixer.enqueuePhoneFrame("phone-1", constantFrame(1_000));
    mixer.enqueuePhoneFrame("phone-2", constantFrame(2_000));
    mixer.enqueueDiscordFrame("discord-1", constantFrame(3_000));
    mixer.enqueueDiscordFrame("discord-2", constantFrame(6_000));

    const output = mixer.mixNextFrame();

    expect(firstSample(output.phoneOutputs.get("phone-1")!)).toBe(3_666);
    expect(firstSample(output.phoneOutputs.get("phone-2")!)).toBe(3_333);
  });

  it("does not attenuate available audio for sources that underflow", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addPhoneCaller("phone-2");
    mixer.addDiscordSpeaker("discord-idle");
    mixer.addDiscordSpeaker("discord-talking");
    mixer.enqueuePhoneFrame("phone-2", constantFrame(2_000));
    mixer.enqueueDiscordFrame("discord-talking", constantFrame(6_000));

    const firstTick = mixer.mixNextFrame();
    const secondTick = mixer.mixNextFrame();

    expect(firstSample(firstTick.phoneOutputs.get("phone-1")!)).toBe(4_000);
    expect(firstSample(firstTick.phoneOutputs.get("phone-2")!)).toBe(6_000);
    expect(firstSample(firstTick.discordOutput)).toBe(2_000);
    expectSilence(secondTick.phoneOutputs.get("phone-1")!);
    expectSilence(secondTick.phoneOutputs.get("phone-2")!);
    expectSilence(secondTick.discordOutput);
  });

  it("removes callers and speakers together with their queued audio", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addPhoneCaller("phone-2");
    mixer.addDiscordSpeaker("discord-1");
    mixer.enqueuePhoneFrame("phone-1", constantFrame(1_000));
    mixer.enqueueDiscordFrame("discord-1", constantFrame(5_000));

    expect(mixer.removePhoneCaller("phone-1")).toBe(true);
    expect(mixer.removePhoneCaller("phone-1")).toBe(false);
    expect(mixer.removeDiscordSpeaker("discord-1")).toBe(true);
    expect(mixer.getPhoneCallerStats("phone-1")).toBeNull();
    expect(mixer.getDiscordSpeakerStats("discord-1")).toBeNull();
    expect(() =>
      mixer.enqueuePhoneFrame("phone-1", constantFrame(2_000)),
    ).toThrow(/not registered/);

    const output = mixer.mixNextFrame();
    expect([...output.phoneOutputs.keys()]).toEqual(["phone-2"]);
    expectSilence(output.phoneOutputs.get("phone-2")!);
    expectSilence(output.discordOutput);
  });

  it("exposes per-source and aggregate queue drop counts", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addDiscordSpeaker("discord-1");

    for (let index = 0; index <= PCM_MAX_QUEUED_FRAMES; index += 1) {
      mixer.enqueuePhoneFrame("phone-1", constantFrame(index));
      mixer.enqueueDiscordFrame("discord-1", constantFrame(index));
    }

    expect(mixer.getPhoneCallerStats("phone-1")).toEqual({
      droppedFrames: 1,
      queuedFrames: 10,
    });
    expect(mixer.getDiscordSpeakerStats("discord-1")).toEqual({
      droppedFrames: 1,
      queuedFrames: 10,
    });
    expect(mixer.stats).toEqual({
      discordSpeakers: 1,
      droppedDiscordFrames: 1,
      droppedPhoneFrames: 1,
      phoneCallers: 1,
      queuedDiscordFrames: 10,
      queuedPhoneFrames: 10,
    });
  });

  it("rejects invalid, duplicate, and unknown sources", () => {
    const mixer = new DiscordAudioSessionMixer();

    expect(() => mixer.addPhoneCaller(" ")).toThrow(TypeError);
    mixer.addPhoneCaller("same-id");
    expect(() => mixer.addPhoneCaller("same-id")).toThrow(/already registered/);
    expect(() =>
      mixer.enqueueDiscordFrame("missing", constantFrame(1)),
    ).toThrow(/not registered/);
  });

  it("uses no implicit clock and completely clears sources on close", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const mixer = new DiscordAudioSessionMixer();
    mixer.addPhoneCaller("phone-1");
    mixer.addDiscordSpeaker("discord-1");
    mixer.enqueuePhoneFrame("phone-1", constantFrame(1));
    mixer.enqueueDiscordFrame("discord-1", constantFrame(1));

    mixer.close();
    mixer.close();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(mixer.isClosed).toBe(true);
    expect(mixer.stats).toEqual({
      discordSpeakers: 0,
      droppedDiscordFrames: 0,
      droppedPhoneFrames: 0,
      phoneCallers: 0,
      queuedDiscordFrames: 0,
      queuedPhoneFrames: 0,
    });
    expect(mixer.removePhoneCaller("phone-1")).toBe(false);
    expect(mixer.removeDiscordSpeaker("discord-1")).toBe(false);
  });

  it("deterministically rejects registration, input, and mixing after close", () => {
    const mixer = new DiscordAudioSessionMixer();
    mixer.close();

    expect(() => mixer.addPhoneCaller("phone-1")).toThrow(
      "Discord audio session mixer is closed.",
    );
    expect(() => mixer.addDiscordSpeaker("discord-1")).toThrow(
      "Discord audio session mixer is closed.",
    );
    expect(() =>
      mixer.enqueuePhoneFrame("phone-1", constantFrame(1)),
    ).toThrow("Discord audio session mixer is closed.");
    expect(() =>
      mixer.enqueueDiscordFrame("discord-1", constantFrame(1)),
    ).toThrow("Discord audio session mixer is closed.");
    expect(() => mixer.mixNextFrame()).toThrow(
      "Discord audio session mixer is closed.",
    );
  });
});
