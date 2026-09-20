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
  const catalog = { current: (number: string) => lists.find(list => list.number === number) ?? null, list: () => lists, mutate } as unknown as PlaylistCatalog;
  const downloader = { search: vi.fn(async () => [{ id: "abc123abc12", title: "Artist - New", url: "https://www.youtube.com/watch?v=abc123abc12" }]),
    download: vi.fn(async () => ({ filePath: "/music/New.mp3", title: "Artist - New" })) };
  const isActive = vi.fn(async () => true);
  const options = { catalog, downloader, currentPlaylist: async () => "1", isActive, skillText: "# add-phone-radio-song\nUse yt-dlp and new-music." };
  const tools = createPlaylistTools(options);
  const controller = new AbortController();
  const run = (name: string, args: unknown) => tools.execute(name, args, controller.signal) as Promise<any>;
  return { lists, catalog, mutate, downloader, isActive, options, tools, controller, run };
}

describe("voice playlist tools", () => {
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
});
