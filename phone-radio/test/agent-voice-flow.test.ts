import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  AGENT_PCM_FRAME_BYTES,
  AGENT_PCM_FRAME_DURATION_MS,
  AgentBridgeManager,
} from "../src/agent/bridge-manager.js";
import { LiveSession } from "../src/agent/live-session.js";

class UpstreamSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  bufferedAmount = 0;
  events: Record<string, unknown>[] = [];
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  });
  terminate = vi.fn(() => this.close());

  get socket(): WebSocket { return this as unknown as WebSocket; }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit("open");
  }

  send(payload: string, callback?: (error?: Error) => void): void {
    const event = JSON.parse(payload) as Record<string, unknown>;
    this.events.push(event);
    callback?.();
    if (event.type === "session.close") {
      this.receive({ type: "session.closed", reason: "close_requested", usage: { seconds: 1 } });
    }
  }

  receive(event: Record<string, unknown>): void {
    this.emit("message", Buffer.from(JSON.stringify(event)));
  }

  audio(audio: Buffer): void {
    this.receive({ type: "session.output_audio.delta", delta: audio.toString("base64") });
  }

  get inputAudio(): Buffer[] {
    return this.events
      .filter((event) => event.type === "session.input_audio.append")
      .map((event) => Buffer.from(event.audio as string, "base64"));
  }
}

class PhoneSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  send = vi.fn((_data: Buffer | string, callback?: (error?: Error) => void) => callback?.());
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  });

  get socket(): WebSocket { return this as unknown as WebSocket; }
  get frames(): Buffer[] {
    return this.send.mock.calls.map(([data]) => data).filter(Buffer.isBuffer);
  }
  audio(audio: Buffer): void { this.emit("message", audio, true); }
  digit(digit: string): void {
    this.emit("message", Buffer.from(JSON.stringify({ event: "websocket:dtmf", digit })), false);
  }
}

describe("agent voice flow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("connects two private Live conversations, relays PCM, and exits only the caller pressing 9", async () => {
    const upstreams: UpstreamSocket[] = [];
    const onExit = vi.fn(async () => undefined);
    const onFailure = vi.fn(async () => undefined);
    const manager = new AgentBridgeManager({
      createSession: (callbacks) => new LiveSession({
        ...callbacks,
        apiKey: "integration-test-key",
        socketFactory: () => {
          const upstream = new UpstreamSocket();
          upstreams.push(upstream);
          return upstream.socket;
        },
      }),
      onExit,
      onFailure,
    });

    try {
      const firstPhone = new PhoneSocket();
      const secondPhone = new PhoneSocket();
      const phones = [firstPhone, secondPhone];
      for (const [index, phone] of phones.entries()) {
        manager.reserve(`call-${index + 1}`, `session-${index + 1}`);
        const attaching = manager.attach(`call-${index + 1}`, `session-${index + 1}`, phone.socket);
        const upstream = upstreams[index]!;
        upstream.open();
        expect(upstream.events).toHaveLength(1);
        expect(upstream.events[0]).toMatchObject({
          type: "session.start",
          session: {
            model: "gpt-live-1",
            store: false,
            audio: { format: { type: "audio/pcm", rate: 16000 }, output: { voice: "marin" } },
            delegation: {
              type: "responses",
              responses: { model: "gpt-5.6-luna", tools: [], tool_choice: "none" },
            },
          },
        });
        upstream.receive({ type: "session.started", session: { id: `live-${index + 1}` } });
        expect(await attaching).toBe(true);
        expect(upstream.events[1]).toMatchObject({
          type: "session.instructions.append",
          delegation_id: null,
          content: expect.stringContaining("pressing 9"),
        });
      }

      const [firstUpstream, secondUpstream] = upstreams as [UpstreamSocket, UpstreamSocket];
      const firstInput = Buffer.alloc(AGENT_PCM_FRAME_BYTES, 1);
      const secondInput = Buffer.alloc(AGENT_PCM_FRAME_BYTES, 2);
      firstPhone.audio(firstInput);
      secondPhone.audio(secondInput);
      await vi.advanceTimersByTimeAsync(AGENT_PCM_FRAME_DURATION_MS);
      expect(firstUpstream.inputAudio).toEqual([firstInput]);
      expect(secondUpstream.inputAudio).toEqual([secondInput]);

      const firstReply = Buffer.alloc(AGENT_PCM_FRAME_BYTES * 2, 3);
      const secondReply = Buffer.alloc(AGENT_PCM_FRAME_BYTES, 4);
      firstUpstream.audio(firstReply);
      secondUpstream.audio(secondReply);
      expect(firstPhone.frames).toEqual([]);
      expect(secondPhone.frames).toEqual([]);
      await vi.advanceTimersByTimeAsync(AGENT_PCM_FRAME_DURATION_MS);
      expect(firstPhone.frames).toEqual([firstReply.subarray(0, AGENT_PCM_FRAME_BYTES)]);
      expect(secondPhone.frames).toEqual([secondReply]);
      await vi.advanceTimersByTimeAsync(AGENT_PCM_FRAME_DURATION_MS);
      expect(Buffer.concat(firstPhone.frames)).toEqual(firstReply);
      expect(firstPhone.frames).toHaveLength(2);

      firstPhone.digit("9");
      firstPhone.digit("9");
      await vi.advanceTimersByTimeAsync(0);
      expect(onExit).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
      expect(firstPhone.send).toHaveBeenCalledWith(JSON.stringify({ action: "clear" }));
      expect(firstUpstream.events.filter((event) => event.type === "session.close")).toHaveLength(1);
      expect(firstUpstream.close).toHaveBeenCalledOnce();
      expect(firstPhone.close).toHaveBeenCalledOnce();
      expect(secondUpstream.close).not.toHaveBeenCalled();
      expect(secondPhone.close).not.toHaveBeenCalled();

      const continuingReply = Buffer.alloc(AGENT_PCM_FRAME_BYTES, 5);
      firstUpstream.audio(Buffer.alloc(AGENT_PCM_FRAME_BYTES, 6));
      secondPhone.audio(secondInput);
      secondUpstream.audio(continuingReply);
      await vi.advanceTimersByTimeAsync(AGENT_PCM_FRAME_DURATION_MS);
      expect(firstPhone.frames).toHaveLength(2);
      expect(secondPhone.frames).toEqual([secondReply, continuingReply]);
      expect(secondUpstream.inputAudio).toEqual([secondInput, secondInput]);
      expect(onFailure).not.toHaveBeenCalled();
    } finally {
      await manager.close();
    }

    expect(upstreams.every((upstream) => upstream.readyState === WebSocket.CLOSED)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
