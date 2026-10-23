import { describe, expect, it, vi } from "vitest";
import { createPlaylistTools } from "../src/agent/playlist-tools.js";
import type { PlaylistCatalog, PlaylistRevision } from "../src/playlists/catalog.js";

function fixture() {
  const lists: PlaylistRevision[] = [
    { number: "1", name: "Main", revision: "a", tracks: ["/music/Artist - Song [id].mp3", "/music/Other.mp3"], songIds: ["song-a", "song-b"] },
    { number: "2", name: "Favorites", revision: "b", tracks: ["/music/Second.mp3"], songIds: ["song-c"] },
  ];
  const mutate = vi.fn(async (operation) => ({ changed: true, playlists: [], title: "Artist - Song", playlistNumber: operation.playlistNumber,
    playlistName: operation.playlistNumber === "1" ? "Main" : "Favorites", songId: "new-song", position: operation.position ?? 3 }));
  const create = vi.fn(async (operation) => {
    const number = operation.number ?? Array.from({ length: 98 }, (_, index) => String(index + 1))
      .find(number => !lists.some(list => list.number === number) && !operation.reservedNumbers?.includes(number))!;
    const created = { number, name: operation.name, revision: "created", tracks: [operation.filePath], songIds: ["first-song"] };
    lists.push(created);
    return created;
  });
  const catalog = { current: (number: string) => lists.find(list => list.number === number) ?? null, list: () => lists, mutate, create } as unknown as PlaylistCatalog;
  const downloader = { search: vi.fn(async () => [{ id: "abc123abc12", title: "Artist - New", url: "https://www.youtube.com/watch?v=abc123abc12" }]),
    download: vi.fn(async () => ({ filePath: "/music/New.mp3", title: "Artist - New" })) };
  const isActive = vi.fn(async () => true);
  const playSong = vi.fn(async (_filePath: string, _title: string, _signal: AbortSignal) => {});
  const options = { catalog, downloader, currentPlaylist: async () => "1", isActive, playSong,
    reservedPlaylistNumbers: ["3", "9"], skillText: "# add-phone-radio-song\nUse yt-dlp and new-music." };
  const tools = createPlaylistTools(options);
  const controller = new AbortController();
  const run = (name: string, args: unknown) => tools.execute(name, args, controller.signal) as Promise<any>;
  return { lists, catalog, mutate, create, downloader, isActive, playSong, options, tools, controller, run };
}

describe("voice playlist tools", () => {
  it("plays a whole playlist from its first track with continuation attached", async () => {
    const { run, playSong, downloader, mutate, controller, tools } = fixture();
    expect(await run("play_playlist", { playlist_number: "1" })).toMatchObject({
      ok: true, playlist_number: "1", playlist_name: "Main", song_count: 2,
    });
    expect(playSong).toHaveBeenCalledExactlyOnceWith(
      "/music/Artist - Song [id].mp3", "Artist - Song", controller.signal,
      { playlistNumber: "1", trackIndex: 0, catalogRevision: "a" },
    );
    expect(downloader.search).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(tools.instructions).toContain("use play_playlist");
  });

  it("rejects unavailable playlists and ended conversations without starting playback", async () => {
    const { run, playSong, lists, isActive } = fixture();
    expect(await run("play_playlist", { playlist_number: "98" })).toMatchObject({ ok: false });
    lists[0] = { ...lists[0], tracks: [], songIds: [] };
    expect(await run("play_playlist", { playlist_number: "1" })).toMatchObject({ ok: false });
    isActive.mockResolvedValue(false);
    expect(await run("play_playlist", { playlist_number: "2" })).toMatchObject({ ok: false });
    expect(playSong).not.toHaveBeenCalled();
  });

  it("reports a failed playlist handoff without claiming playback started", async () => {
    const { run, playSong } = fixture();
    playSong.mockRejectedValueOnce(new Error("Playback could not start."));
    expect(await run("play_playlist", { playlist_number: "1" }))
      .toEqual({ ok: false, error: "Playback could not start." });
  });

  it("loads the requested skill and provides caller context without exposing paths", async () => {
    const { tools, run } = fixture();
    expect(tools.instructions).toContain("Use yt-dlp and new-music.");
    expect(tools.instructions).toContain("update playback live");
    expect(await run("list_playlists", {})).toMatchObject({ ok: true, current_playlist_number: "1", playlists: [{ number: "1", song_count: 2 }, { number: "2", song_count: 1 }] });
    const listing = await run("list_playlist_songs", { playlist_number: "1", query: "Artist", offset: 0 });
    expect(listing.songs).toEqual([{ title: "Artist - Song", position: 1, song_id: "song-a", playlist_number: "1", playlist_name: "Main" }]);
    expect(JSON.stringify(listing)).not.toContain("/music/");
  });

  it("searches without editing, then downloads exactly the selected YouTube result", async () => {
    const { run, mutate, downloader, controller } = fixture();
    const found = await run("search_songs", { query: "Artist", source: "both" });
    expect(found.results).toHaveLength(2);
    expect(mutate).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    const result = await run("add_song_to_playlist", { playlist_number: "2", result_id: found.results[1].result_id, youtube_url: null, position: 1 });
    expect(result).toMatchObject({ ok: true, changed: true, playlist_number: "2", position: 1 });
    expect(downloader.download).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc123abc12", controller.signal);
    expect(mutate).toHaveBeenCalledWith({ kind: "add", playlistNumber: "2", filePath: "/music/New.mp3", position: 1 }, controller.signal);
  });

  it("reuses an existing library file, moves a membership, and removes only membership", async () => {
    const { run, mutate, downloader, controller } = fixture();
    const found = await run("search_songs", { query: "Artist", source: "library" });
    await run("add_song_to_playlist", { playlist_number: "2", result_id: found.results[0].result_id, youtube_url: null, position: null });
    expect(mutate).toHaveBeenLastCalledWith({ kind: "add", playlistNumber: "2", filePath: "/music/Artist - Song [id].mp3", position: undefined }, controller.signal);
    expect(downloader.download).not.toHaveBeenCalled();
    await run("move_song_to_playlist", { source_playlist_number: "1", song_id: "song-a", target_playlist_number: "2", position: null });
    expect(mutate).toHaveBeenLastCalledWith({ kind: "move", sourcePlaylistNumber: "1", playlistNumber: "2", songId: "song-a", position: undefined }, controller.signal);
    expect(await run("remove_song_from_playlist", { playlist_number: "1", song_id: "song-a" })).toMatchObject({ ok: true, audio_file_preserved: true });
    expect(mutate).toHaveBeenLastCalledWith({ kind: "remove", playlistNumber: "1", songId: "song-a" }, controller.signal);
  });

  it("cannot use another caller's search ID or a caller-supplied file path", async () => {
    const { run, options, controller, mutate } = fixture();
    const found = await run("search_songs", { query: "Artist", source: "library" });
    const other = createPlaylistTools(options);
    expect(await other.execute("add_song_to_playlist", { playlist_number: "2", result_id: found.results[0].result_id, youtube_url: null, position: null }, controller.signal)).toMatchObject({ ok: false });
    expect(await run("add_song_to_playlist", { playlist_number: "2", result_id: null, youtube_url: null, position: null, filePath: "/secret" })).toMatchObject({ ok: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects invalid destinations/positions before spending time on downloads", async () => {
    const { run, downloader, mutate } = fixture();
    for (const args of [{ playlist_number: "99", position: null }, { playlist_number: "2", position: 3 }, { playlist_number: "2", position: 0 }]) {
      expect(await run("add_song_to_playlist", { ...args, result_id: null, youtube_url: "https://youtu.be/abc123abc12" })).toMatchObject({ ok: false });
    }
    expect(downloader.download).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not edit after a download fails or the caller leaves", async () => {
    const { run, downloader, mutate, isActive, controller } = fixture();
    const args = { playlist_number: "2", result_id: null, youtube_url: "https://youtu.be/abc123abc12", position: null };
    downloader.download.mockRejectedValueOnce(new Error("Song download failed."));
    expect(await run("add_song_to_playlist", args)).toMatchObject({ ok: false });
    downloader.download.mockImplementationOnce(async () => { isActive.mockResolvedValue(false); return { filePath: "/music/New.mp3", title: "New" }; });
    expect(await run("add_song_to_playlist", args)).toMatchObject({ ok: false });
    controller.abort();
    expect(await run("remove_song_from_playlist", { playlist_number: "1", song_id: "song-a" })).toMatchObject({ ok: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps library results when YouTube is unavailable and rejects stale memberships", async () => {
    const { run, downloader, lists, mutate } = fixture();
    downloader.search.mockRejectedValueOnce(new Error("unavailable"));
    const found = await run("search_songs", { query: "Artist", source: "both" });
    expect(found.warning).toContain("YouTube");
    lists[0] = { ...lists[0], tracks: ["/music/Other.mp3"], songIds: ["song-b"] };
    expect(await run("add_song_to_playlist", { playlist_number: "2", result_id: found.results[0].result_id, youtube_url: null, position: null })).toMatchObject({ ok: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("creates a playlist from a library song, returns its assigned number, and accepts later additions", async () => {
    const { tools, run, create, downloader, mutate, controller } = fixture();
    const found = await run("search_songs", { query: "Artist", source: "library" });
    const result = await run("create_playlist", { name: " Evening ", playlist_number: null,
      result_id: found.results[0].result_id, youtube_url: null });
    expect(create).toHaveBeenCalledWith({ name: "Evening", number: undefined, filePath: "/music/Artist - Song [id].mp3",
      reservedNumbers: ["3", "9"] }, controller.signal);
    expect(result).toMatchObject({ ok: true, playlist_name: "Evening", playlist_number: "4", title: "Artist - Song", position: 1, song_count: 1 });
    expect(JSON.stringify(result)).not.toContain("/music/");
    expect(downloader.download).not.toHaveBeenCalled();
    expect((await run("list_playlists", {})).playlists).toContainEqual({ name: "Evening", number: "4", song_count: 1 });
    expect(await run("add_song_to_playlist", { playlist_number: "4", result_id: null,
      youtube_url: "https://youtu.be/abc123abc12", position: null })).toMatchObject({ ok: true });
    expect(mutate).toHaveBeenCalledWith({ kind: "add", playlistNumber: "4", filePath: "/music/New.mp3", position: undefined }, controller.signal);
    expect(tools.instructions).toContain("first song");
  });

  it("creates a playlist at the requested number with a downloaded first song", async () => {
    const { run, create, downloader, controller } = fixture();
    const found = await run("search_songs", { query: "Artist - New", source: "youtube" });
    expect(await run("create_playlist", { name: "New songs", playlist_number: "27", result_id: found.results[0].result_id,
      youtube_url: null })).toMatchObject({ ok: true, playlist_number: "27", title: "Artist - New" });
    expect(downloader.download).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc123abc12", controller.signal);
    expect(create).toHaveBeenCalledWith({ name: "New songs", number: "27", filePath: "/music/New.mp3", reservedNumbers: ["3", "9"] }, controller.signal);
  });

  it("rejects invalid, used, and reserved playlist names or numbers before downloading", async () => {
    const { run, create, downloader } = fixture();
    for (const input of [
      { name: "", playlist_number: null }, { name: "main", playlist_number: null },
      { name: "x".repeat(121), playlist_number: null }, { name: "New\nname", playlist_number: null },
      ...["0", "01", "99", "100", "-1", "1.5", "1", "3", "9"].map(playlist_number => ({ name: "New", playlist_number })),
    ]) {
      expect(await run("create_playlist", { ...input, result_id: null, youtube_url: "https://youtu.be/abc123abc12" })).toMatchObject({ ok: false });
    }
    expect(downloader.download).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("requires exactly one first song and rejects extra or missing creation fields", async () => {
    const { run, create, downloader } = fixture();
    const args = { name: "New", playlist_number: null, result_id: null, youtube_url: null };
    for (const input of [args, { ...args, result_id: "result", youtube_url: "https://youtu.be/abc123abc12" },
      { ...args, filePath: "/secret" }, { name: "New", result_id: null, youtube_url: null }]) {
      expect(await run("create_playlist", input)).toMatchObject({ ok: false });
    }
    expect(downloader.download).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("plays an existing library song once without downloading or editing playlists", async () => {
    const { run, playSong, create, mutate, downloader, controller } = fixture();
    const found = await run("search_songs", { query: "Artist", source: "library" });
    const result = await run("play_song", { result_id: found.results[0].result_id, youtube_url: null });
    expect(result).toMatchObject({ ok: true, title: "Artist - Song" });
    expect(JSON.stringify(result)).not.toContain("/music/");
    expect(playSong).toHaveBeenCalledExactlyOnceWith(
      "/music/Artist - Song [id].mp3",
      "Artist - Song",
      controller.signal,
      { playlistNumber: "1", trackIndex: 0, catalogRevision: "a" },
    );
    expect(result.applies).toContain("next song");
    expect(downloader.download).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("downloads an explicit song for immediate playback without adding it to a playlist", async () => {
    const { run, playSong, create, mutate, downloader, controller } = fixture();
    expect(await run("play_song", { result_id: null, youtube_url: "https://youtu.be/abc123abc12" })).toMatchObject({ ok: true, title: "Artist - New" });
    expect(downloader.download).toHaveBeenCalledExactlyOnceWith("https://youtu.be/abc123abc12", controller.signal);
    expect(playSong).toHaveBeenCalledExactlyOnceWith("/music/New.mp3", "Artist - New", controller.signal);
    expect(create).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each(["create_playlist", "play_song"])("rejects cross-session and stale song handles for %s", async name => {
    const { run, options, controller, create, mutate, playSong, downloader, lists } = fixture();
    const found = await run("search_songs", { query: "Artist", source: "library" });
    const args = { ...(name === "create_playlist" ? { name: "New", playlist_number: null } : {}),
      result_id: found.results[0].result_id, youtube_url: null };
    expect(await createPlaylistTools(options).execute(name, args, controller.signal)).toMatchObject({ ok: false });
    lists[0] = { ...lists[0], tracks: ["/music/Other.mp3"], songIds: ["song-b"] };
    expect(await run(name, args)).toMatchObject({ ok: false });
    expect(downloader.download).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(playSong).not.toHaveBeenCalled();
  });

  it.each(["create_playlist", "play_song"])("does not perform %s after a failed download or ended conversation", async name => {
    const { run, create, mutate, playSong, downloader, isActive, controller } = fixture();
    const args = { ...(name === "create_playlist" ? { name: "New", playlist_number: null } : {}),
      result_id: null, youtube_url: "https://youtu.be/abc123abc12" };
    downloader.download.mockRejectedValueOnce(new Error("Download failed."));
    expect(await run(name, args)).toMatchObject({ ok: false });
    downloader.download.mockImplementationOnce(async () => { isActive.mockResolvedValue(false); return { filePath: "/music/New.mp3", title: "New" }; });
    expect(await run(name, args)).toMatchObject({ ok: false });
    isActive.mockResolvedValue(true);
    downloader.download.mockImplementationOnce(async () => { controller.abort(); return { filePath: "/music/New.mp3", title: "New" }; });
    expect(await run(name, args)).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(playSong).not.toHaveBeenCalled();
  });

  it("reports playback failure without falling back to a playlist edit", async () => {
    const { run, playSong, create, mutate } = fixture();
    playSong.mockRejectedValueOnce(new Error("Playback could not start."));
    expect(await run("play_song", { result_id: null, youtube_url: "https://youtu.be/abc123abc12" }))
      .toEqual({ ok: false, error: "Playback could not start." });
    expect(playSong).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });
});
