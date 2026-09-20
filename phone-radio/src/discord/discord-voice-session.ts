import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough } from "node:stream";
import {
  AudioPlayerStatus,
  EndBehaviorType,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Client } from "discord.js";
import prism from "prism-media";
import {
  DISCORD_PCM_FRAME_BYTES,
  DiscordAudioSessionMixer,
  PCM_FRAME_DURATION_MS,
  PcmFrameAssembler,
  convert16kMonoTo48kStereoPcm,
} from "../discord-audio.js";
import type { DiscordVoiceDestination } from "./config.js";
import {
  DISCORD_BRIDGE_MAX_PHONE_BUFFERED_BYTES,
  type DiscordBridgeSession,
  type PhoneBridgePeer,
} from "./bridge-manager.js";

type PhoneCaller = { assembler: PcmFrameAssembler; peer: PhoneBridgePeer };
type DiscordSpeaker = {
  assembler: PcmFrameAssembler;
  decoder: ReturnType<typeof createOpusDecoder>;
  ffmpeg: ChildProcessWithoutNullStreams;
};

function createOpusDecoder() {
  return new prism.opus.Decoder({ channels: 2, frameSize: 960, rate: 48_000 });
}

/** A real Discord media transport; the manager supplies its 20 ms caller set. */
export class DiscordVoiceSession implements DiscordBridgeSession {
  readonly #audioStream = new PassThrough();
  readonly #callers = new Map<string, PhoneCaller>();
  readonly #connection: VoiceConnection;
  readonly #mixer = new DiscordAudioSessionMixer();
  readonly #player = createAudioPlayer();
  readonly #speakers = new Map<string, DiscordSpeaker>();
  #closed = false;
  #timer: ReturnType<typeof setInterval> | null = null;

  private constructor(
    readonly destination: DiscordVoiceDestination,
    readonly client: Client,
    connection: VoiceConnection,
  ) {
    this.#connection = connection;
  }

  public static async create(
    client: Client,
    destination: DiscordVoiceDestination,
  ): Promise<DiscordVoiceSession> {
    const channel = await client.channels.fetch(destination.channelId);
    if (!channel?.isVoiceBased() || !channel.guild) {
      throw new Error("Configured Discord destination is not a voice channel.");
    }

    const connection = joinVoiceChannel({
      adapterCreator: channel.guild.voiceAdapterCreator,
      channelId: channel.id,
      guildId: channel.guild.id,
      selfDeaf: false,
      selfMute: false,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

    const session = new DiscordVoiceSession(destination, client, connection);
    session.start();
    return session;
  }

  public addPhoneCaller(uuid: string, peer: PhoneBridgePeer): void {
    this.assertOpen();
    if (this.#callers.has(uuid)) {
      throw new Error("Phone caller is already attached to Discord.");
    }
    this.#callers.set(uuid, { assembler: new PcmFrameAssembler(), peer });
    this.#mixer.addPhoneCaller(uuid);
  }

  public enqueuePhoneAudio(uuid: string, audio: Buffer): void {
    const caller = this.#callers.get(uuid);
    if (!caller || this.#closed) {
      return;
    }
    for (const frame of caller.assembler.push(audio)) {
      this.#mixer.enqueuePhoneFrame(uuid, frame);
    }
  }

  public removePhoneCaller(uuid: string): void {
    this.#callers.get(uuid)?.assembler.close();
    this.#callers.delete(uuid);
    this.#mixer.removePhoneCaller(uuid);
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    for (const speaker of this.#speakers.values()) this.stopSpeaker(speaker);
    this.#speakers.clear();
    for (const caller of this.#callers.values()) caller.assembler.close();
    this.#callers.clear();
    this.#mixer.close();
    this.#audioStream.end();
    this.#player.stop();
    this.#connection.destroy();
  }

  private start(): void {
    this.#connection.subscribe(this.#player);
    this.#player.play(
      createAudioResource(this.#audioStream, { inputType: StreamType.Raw }),
    );
    this.#player.on("error", () => undefined);
    this.#player.on(AudioPlayerStatus.Idle, () => {
      if (!this.#closed) {
        this.#player.play(
          createAudioResource(this.#audioStream, { inputType: StreamType.Raw }),
        );
      }
    });
    this.#connection.receiver.speaking.on("start", (userId) => {
      this.startSpeaker(userId);
    });
    this.#timer = setInterval(() => this.tick(), PCM_FRAME_DURATION_MS);
  }

  private tick(): void {
    if (this.#closed) return;
    const mix = this.#mixer.mixNextFrame();
    const discordFrame = convert16kMonoTo48kStereoPcm(mix.discordOutput);
    if (discordFrame.byteLength === DISCORD_PCM_FRAME_BYTES) {
      this.#audioStream.write(discordFrame);
    }
    for (const [uuid, frame] of mix.phoneOutputs) {
      const peer = this.#callers.get(uuid)?.peer;
      if (!peer) {
        continue;
      }
      if (
        peer.bufferedAmount !== undefined &&
        peer.bufferedAmount > DISCORD_BRIDGE_MAX_PHONE_BUFFERED_BYTES
      ) {
        peer.close(1013, "Phone audio backpressure exceeded");
        continue;
      }
      peer.send(frame);
    }
  }

  private startSpeaker(userId: string): void {
    if (this.#closed || this.#speakers.has(userId) || userId === this.client.user?.id) {
      return;
    }
    const decoder = createOpusDecoder();
    const ffmpeg = spawn("ffmpeg", [
      "-loglevel", "error", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", "pipe:0",
      "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1",
    ]);
    const speaker: DiscordSpeaker = { assembler: new PcmFrameAssembler(), decoder, ffmpeg };
    this.#speakers.set(userId, speaker);
    this.#mixer.addDiscordSpeaker(userId);
    const opus = this.#connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 200 },
    });
    opus.pipe(decoder).pipe(ffmpeg.stdin);
    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      if (this.#closed || this.#speakers.get(userId) !== speaker) return;
      for (const frame of speaker.assembler.push(chunk)) {
        this.#mixer.enqueueDiscordFrame(userId, frame);
      }
    });
    const stop = () => this.removeSpeaker(userId, speaker);
    opus.once("end", stop);
    opus.once("error", stop);
    decoder.once("error", stop);
    ffmpeg.once("error", stop);
    ffmpeg.once("exit", stop);
  }

  private removeSpeaker(userId: string, speaker: DiscordSpeaker): void {
    if (this.#speakers.get(userId) !== speaker) return;
    this.#speakers.delete(userId);
    this.#mixer.removeDiscordSpeaker(userId);
    this.stopSpeaker(speaker);
  }

  private stopSpeaker(speaker: DiscordSpeaker): void {
    speaker.assembler.close();
    speaker.decoder.destroy();
    speaker.ffmpeg.stdin.destroy();
    speaker.ffmpeg.kill();
  }

  private assertOpen(): void {
    if (this.#closed) throw new Error("Discord voice session is closed.");
  }
}
