import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  LIVE_MAX_BUFFERED_BYTES,
  LIVE_SESSION_TIMEOUT_MS,
  LIVE_TOOL_TIMEOUT_MS,
  LiveSession,
  type LiveSessionOptions,
  type LiveTools,
} from "../src/agent/live-session.js";

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  bufferedAmount = 0;
  sent: Record<string, any>[] = [];
  sendError: Error | null = null;
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  });
  terminate = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  });

  send(data: string, callback?: (error?: Error) => void): void {
    this.sent.push(JSON.parse(data));
    callback?.(this.sendError ?? undefined);
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit("open");
  }

  receive(event: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(event)));
  }
}

function fixture(tools?: LiveTools) {
  const socket = new FakeSocket();
  const onAudio = vi.fn();
  const onFailure = vi.fn();
  const onUsage = vi.fn();
  const onFinalization = vi.fn();
  const socketFactory = vi.fn(() => socket) as unknown as NonNullable<
    LiveSessionOptions["socketFactory"]
  >;
  const session = new LiveSession({
    apiKey: "private-test-key",
    onAudio,
    onFailure,
    onUsage,
    onFinalization,
    socketFactory,
    tools,
  });
  return { socket, session, onAudio, onFailure, onUsage, onFinalization, socketFactory };
}

async function ready(tools?: LiveTools) {
  const context = fixture(tools);
  const start = context.session.start();
  context.socket.open();
  context.socket.receive({ type: "session.started", session: { id: "session-1" } });
  await start;
  return context;
}

function backend(socket: FakeSocket, event: Record<string, unknown>, delegationId = "delegation-1") {
  socket.receive({ type: "response.event", delegation_id: delegationId, event });
}

function created(socket: FakeSocket, id = "response-1", delegationId = "delegation-1") {
  backend(socket, { type: "response.created", response: { id, output: [] } }, delegationId);
}

function called(socket: FakeSocket, id = "call-1", name = "edit_playlist", args = '{"song":"song-1"}', responseId?: string, delegationId = "delegation-1") {
  backend(socket, {
    type: "response.output_item.done",
    ...(responseId ? { response_id: responseId } : {}),
    item: { type: "function_call", call_id: id, name, arguments: args },
  }, delegationId);
}

function completed(socket: FakeSocket, id = "response-1", delegationId = "delegation-1") {
  backend(socket, { type: "response.completed", response: { id, status: "completed", output: [] } }, delegationId);
}

function toolFixture(execute = vi.fn<LiveTools["execute"]>().mockResolvedValue({ ok: true })) {
  return {
    execute,
    definitions: [{ type: "function", name: "edit_playlist", parameters: { type: "object" } }],
    instructions: "Use the add-phone-radio-song skill. Confirm results before reporting success.",
  };
}

describe("LiveSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts the Live protocol and greets only after session.started", async () => {
    const { session, socket, socketFactory, onAudio } = fixture();
    const start = session.start();
    expect(session.start()).toBe(start);
    expect(socketFactory).toHaveBeenCalledWith(
      "wss://api.openai.com/v1/live/sessions",
      expect.objectContaining({ headers: { Authorization: "Bearer private-test-key" } }),
    );
    expect(socket.sent).toEqual([]);
    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toMatchObject({
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
    session.writeAudio(Buffer.from([1, 2]));
    socket.receive({ type: "session.output_audio.delta", delta: "AQI=" });
    expect(onAudio).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(1);
    socket.receive({ type: "session.started" });
    await start;
    expect(socket.sent[1]).toMatchObject({
      type: "session.instructions.append",
      delegation_id: null,
      content: expect.stringContaining("pressing 9"),
    });
    socket.receive({ type: "session.started" });
    expect(socket.sent).toHaveLength(2);
  });

  it("preserves input sample order across odd chunk boundaries and decodes audio", async () => {
    const { session, socket, onAudio } = await ready();
    session.writeAudio(Buffer.from([1]));
    session.writeAudio(Buffer.from([2, 3, 4, 5]));
    session.writeAudio(Buffer.from([6]));
    expect(socket.sent.slice(2)).toEqual([
      { type: "session.input_audio.append", audio: Buffer.from([1, 2, 3, 4]).toString("base64") },
      { type: "session.input_audio.append", audio: Buffer.from([5, 6]).toString("base64") },
    ]);
    const output = Buffer.from([9, 8, 7, 6]);
    socket.receive({ type: "session.output_audio.delta", delta: output.toString("base64") });
    expect(onAudio).toHaveBeenCalledExactlyOnceWith(output);
  });

  it("closes gracefully after final usage and stops forwarding audio immediately", async () => {
    const { session, socket, onAudio, onUsage, onFailure, onFinalization } = await ready();
    socket.receive({ type: "session.usage.updated", usage: { seconds: 12 } });
    socket.receive({ type: "session.usage.updated", usage: { seconds: 15 } });
    const closed = session.close();
    expect(session.close()).toBe(closed);
    expect(socket.sent.at(-1)).toEqual({ type: "session.close" });
    expect(socket.close).not.toHaveBeenCalled();
    session.writeAudio(Buffer.from([1, 2]));
    socket.receive({ type: "session.output_audio.delta", delta: "AQI=" });
    expect(onAudio).not.toHaveBeenCalled();
    socket.receive({ type: "session.closed", usage: { seconds: 17 }, reason: "close_requested" });
    await closed;
    expect(onUsage.mock.calls).toEqual([[12], [15], [17]]);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(onFinalization).toHaveBeenCalledExactlyOnceWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("terminates a close that never receives finalization", async () => {
    const { session, socket, onFailure, onFinalization } = await ready();
    const closed = session.close();
    await vi.advanceTimersByTimeAsync(LIVE_SESSION_TIMEOUT_MS);
    await closed;
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    expect(onFinalization).toHaveBeenCalledExactlyOnceWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { type: "error", error: { code: "context_injection_incomplete", type: "server_error", message: "private pending instruction" } },
    { type: "response.event", event: { type: "response.failed", error: { message: "private pending response" } } },
  ])("drains final usage after pending work errors while closing (%s)", async (event) => {
    const { session, socket, onFailure, onUsage, onFinalization } = await ready();
    const closed = session.close();
    socket.receive(event);
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(onFinalization).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    socket.receive({ type: "session.closed", reason: "close_requested", usage: { seconds: 3 } });
    await closed;
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(3);
    expect(onFinalization).toHaveBeenCalledExactlyOnceWith(true);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the close timeout after a rejected pending instruction", async () => {
    const { session, socket, onFailure, onFinalization } = await ready();
    const closed = session.close();
    socket.receive({ type: "error", error: { code: "context_injection_incomplete" } });
    await vi.advanceTimersByTimeAsync(LIVE_SESSION_TIMEOUT_MS);
    await closed;
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(onFinalization).toHaveBeenCalledExactlyOnceWith(false);
    expect(onFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out startup and reports a sanitized failure once", async () => {
    const { session, socket, onFailure } = fixture();
    const start = expect(session.start()).rejects.toThrow("live-start-timeout");
    socket.open();
    await vi.advanceTimersByTimeAsync(LIVE_SESSION_TIMEOUT_MS);
    await start;
    socket.emit("error", new Error("provider secret detail"));
    socket.receive({ type: "session.started" });
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-start-timeout");
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(socket.sent).toHaveLength(1);
  });

  it.each([false, true])("cancels startup cleanly, socket open=%s", async (opened) => {
    const { session, socket, onFailure } = fixture();
    const start = expect(session.start()).rejects.toThrow("closed during startup");
    if (opened) socket.open();
    await session.close();
    await start;
    socket.open();
    socket.receive({ type: "session.started" });
    expect(socket.sent).toHaveLength(opened ? 1 : 0);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a startup error without exposing provider error details", async () => {
    const { session, socket, onFailure } = fixture();
    const start = expect(session.start()).rejects.toThrow("live-session-error");
    socket.open();
    socket.receive({ type: "error", error: { message: "private-test-key user transcript" } });
    await start;
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-session-error");
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it("handles a failed WebSocket constructor with a sanitized error", async () => {
    const onFailure = vi.fn();
    const session = new LiveSession({
      apiKey: "private-test-key",
      onAudio: vi.fn(),
      onFailure,
      socketFactory: () => { throw new Error("private-test-key provider detail"); },
    });
    await expect(session.start()).rejects.toThrow("live-connection-error");
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-connection-error");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cannot restart a closed private session", async () => {
    const { session, socketFactory } = fixture();
    await session.close();
    await expect(session.start()).rejects.toThrow("Live session is closed.");
    expect(socketFactory).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without forwarding event content", async () => {
    const { socket, onFailure } = await ready();
    socket.emit("message", Buffer.from("private malformed provider text"));
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-invalid-event");
  });

  it("bounds transport cleanup even after receiving session.closed", async () => {
    const { session, socket, onUsage } = await ready();
    socket.close.mockImplementation(() => { socket.readyState = WebSocket.CLOSING; });
    const closed = session.close();
    socket.receive({ type: "session.closed", usage: { seconds: 7 } });
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(7);
    await vi.advanceTimersByTimeAsync(LIVE_SESSION_TIMEOUT_MS);
    await closed;
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [{ type: "error", error: { message: "private details" } }, "live-session-error"],
    [{ type: "response.event", event: { type: "response.failed" } }, "live-backend-error"],
    [{ type: "session.closed", usage: { seconds: 2 }, reason: "expired" }, "live-session-ended"],
    [{ type: "session.output_audio.delta", delta: "not base64" }, "live-invalid-audio"],
    [{ type: "session.output_audio.delta", delta: "AQ==" }, "live-invalid-audio"],
    [null, "live-invalid-event"],
  ])("ends a failed active session (%s)", async (event, reason) => {
    const { session, socket, onFailure, onAudio } = await ready();
    socket.receive(event);
    socket.emit("error", new Error("private detail"));
    socket.receive({ type: "session.output_audio.delta", delta: "AQI=" });
    await session.close();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(reason);
    expect(onAudio).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back on a dropped transport", async () => {
    const { socket, onFailure, onFinalization } = await ready();
    socket.close();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-connection-closed");
    expect(onFinalization).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("fails explicitly on input backpressure instead of dropping audio", async () => {
    const { session, socket, onFailure } = await ready();
    socket.bufferedAmount = LIVE_MAX_BUFFERED_BYTES;
    session.writeAudio(Buffer.alloc(640));
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-audio-backpressure");
    expect(socket.sent).toHaveLength(2);
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it("handles asynchronous send errors without logging the error", async () => {
    const { session, socket, onFailure } = await ready();
    socket.sendError = new Error("private-test-key");
    session.writeAudio(Buffer.alloc(640));
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-send-error");
  });

  it("ignores transcript payloads and unrelated event types", async () => {
    const { socket, onAudio, onFailure } = await ready();
    socket.receive({ type: "session.input_transcript.delta", delta: "private user words" });
    socket.receive({ type: "session.output_transcript.delta", delta: "private response" });
    socket.receive({ type: "response.event", event: { type: "response.output_text.delta", delta: "answer" } });
    expect(onAudio).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(2);
  });

  it("configures optional tools and delegates playlist requests", async () => {
    const tools = toolFixture();
    const { socket } = await ready(tools);
    expect(socket.sent[0].session.instructions).toContain("Always delegate playlist requests");
    expect(socket.sent[0].session.delegation.responses).toMatchObject({
      tools: tools.definitions,
      tool_choice: "auto",
      parallel_tool_calls: false,
      instructions: expect.stringContaining(tools.instructions),
    });
    expect(socket.sent[1].content).toContain("edit playlists");
  });

  it("collects finished calls, waits for completion, returns every result, then continues once", async () => {
    const tools = toolFixture();
    const { socket, onFailure } = await ready(tools);
    created(socket);
    backend(socket, { type: "response.function_call_arguments.done", arguments: '{"ignored":true}' });
    called(socket);
    called(socket, "call-2", "edit_playlist", '{"song":"song-2"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute).not.toHaveBeenCalled();
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ["edit_playlist", { song: "song-1" }],
      ["edit_playlist", { song: "song-2" }],
    ]);
    expect(socket.sent.slice(2)).toEqual([
      { type: "response.item.create", event_id: "tool_response-1_call-1", item: { type: "function_call_output", call_id: "call-1", output: '{"ok":true}' } },
      { type: "response.item.create", event_id: "tool_response-1_call-2", item: { type: "function_call_output", call_id: "call-2", output: '{"ok":true}' } },
      { type: "response.create", event_id: "continue_response-1" },
    ]);
    expect(onFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not repeat mutations for duplicate items, completions, or call IDs", async () => {
    const tools = toolFixture();
    const { socket } = await ready(tools);
    created(socket);
    called(socket);
    called(socket);
    completed(socket);
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    created(socket, "response-2");
    called(socket);
    completed(socket, "response-2");
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(socket.sent.filter((event) => event.type === "response.item.create")).toHaveLength(2);
    expect(socket.sent.filter((event) => event.type === "response.create")).toHaveLength(2);
  });

  it("waits for an earlier mutation before starting the next completed batch", async () => {
    let finishFirst!: (value: unknown) => void;
    const execute = vi.fn<LiveTools["execute"]>().mockResolvedValue({ ok: true });
    execute.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    const { socket } = await ready(toolFixture(execute));
    created(socket);
    called(socket);
    completed(socket);
    created(socket, "response-2", "delegation-2");
    called(socket, "call-2", "edit_playlist", '{"song":"song-2"}', undefined, "delegation-2");
    completed(socket, "response-2", "delegation-2");
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(socket.sent.filter((event) => event.type === "response.create")).toEqual([]);
    finishFirst({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(socket.sent.slice(2).map((event) => [event.type, event.item?.call_id])).toEqual([
      ["response.item.create", "call-1"], ["response.create", undefined],
      ["response.item.create", "call-2"], ["response.create", undefined],
    ]);
  });

  it("rejects reuse of a call ID for a different mutation", async () => {
    const tools = toolFixture();
    const { socket, onFailure } = await ready(tools);
    created(socket);
    called(socket);
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    created(socket, "response-2");
    called(socket, "call-1", "edit_playlist", '{"song":"different-song"}');
    completed(socket, "response-2");
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-invalid-tool-call");
  });

  it("keeps responses from different delegations separate and ignores mismatched events", async () => {
    const tools = toolFixture();
    const { socket } = await ready(tools);
    created(socket);
    created(socket, "response-2", "delegation-2");
    called(socket, "call-wrong", "edit_playlist", "{}", "response-2");
    called(socket, "call-2", "edit_playlist", '{"song":"song-2"}', undefined, "delegation-2");
    called(socket);
    completed(socket, "response-1", "delegation-2");
    completed(socket, "response-2", "delegation-2");
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute.mock.calls.map(([, args]) => args)).toEqual([{ song: "song-2" }, { song: "song-1" }]);
  });

  it("returns safe errors for unknown tools, malformed arguments, and failed operations", async () => {
    const tools = toolFixture(vi.fn<LiveTools["execute"]>().mockRejectedValue(new Error("secret-key private filesystem path")));
    const { socket, onFailure } = await ready(tools);
    created(socket);
    called(socket, "unknown", "run_shell", "{}");
    called(socket, "malformed", "edit_playlist", "not JSON");
    called(socket);
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    const results = socket.sent.filter((event) => event.type === "response.item.create").map((event) => JSON.parse(event.item.output));
    expect(results.map((result) => result.error)).toEqual(["unknown_tool", "invalid_arguments", "tool_failed"]);
    expect(JSON.stringify(socket.sent)).not.toContain("secret-key");
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(socket.sent.at(-1)?.type).toBe("response.create");
    expect(onFailure).not.toHaveBeenCalled();
  });

  it.each(["close", "provider failure"])("aborts an in-flight tool on %s and skips queued mutations", async (reason) => {
    let finishTool!: (value: unknown) => void;
    const tools = toolFixture(vi.fn<LiveTools["execute"]>(() => new Promise((resolve) => { finishTool = resolve; })));
    const { session, socket, onAudio } = await ready(tools);
    created(socket);
    called(socket);
    called(socket, "call-2");
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    socket.receive({ type: "session.output_audio.delta", delta: "AQI=" });
    expect(onAudio).toHaveBeenCalledOnce();
    const signal = tools.execute.mock.calls[0][2];
    expect(signal.aborted).toBe(false);
    if (reason === "close") {
      const closed = session.close();
      socket.receive({ type: "session.closed" });
      await closed;
    } else {
      socket.receive({ type: "error" });
    }
    expect(signal.aborted).toBe(true);
    finishTool({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(socket.sent.filter((event) => event.type === "response.item.create")).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds slow tools, aborts their work, and reports an unconfirmed outcome", async () => {
    const tools = toolFixture(vi.fn<LiveTools["execute"]>(() => new Promise(() => {})));
    const { socket, onFailure } = await ready(tools);
    created(socket);
    called(socket);
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(LIVE_TOOL_TIMEOUT_MS);
    expect(tools.execute.mock.calls[0][2].aborted).toBe(true);
    const result = socket.sent.find((event) => event.type === "response.item.create");
    expect(JSON.parse(result?.item.output)).toMatchObject({ ok: false, error: "tool_timeout" });
    expect(socket.sent.at(-1)?.type).toBe("response.create");
    expect(onFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never executes calls from incomplete responses", async () => {
    const tools = toolFixture();
    const { socket } = await ready(tools);
    created(socket);
    called(socket);
    backend(socket, { type: "response.incomplete", response: { id: "response-1" } });
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it("rejects oversized arguments before they reach a tool", async () => {
    const tools = toolFixture();
    const { socket, onFailure } = await ready(tools);
    created(socket);
    called(socket, "call-1", "edit_playlist", JSON.stringify({ data: "x".repeat(16 * 1024) }));
    completed(socket);
    await vi.advanceTimersByTimeAsync(0);
    expect(tools.execute).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("live-tool-limit");
  });
});
