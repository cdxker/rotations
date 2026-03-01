export interface SpotifyPlayerInstance {
    connect: () => Promise<boolean>
    disconnect: () => void
    addListener: (event: string, callback: (state: unknown) => void) => void
    togglePlay: () => Promise<void>
    nextTrack: () => Promise<void>
    previousTrack: () => Promise<void>
    seek: (position_ms: number) => Promise<void>
    getCurrentState: () => Promise<{ position: number }>
}

export interface SpotifyPlayerAPI {
    Player: new (options: {
        name: string
        getOAuthToken: (cb: (token: string) => void) => void
        volume: number
    }) => SpotifyPlayerInstance
}

declare global {
    interface Window {
        onSpotifyWebPlaybackSDKReady?: () => void
        Spotify?: SpotifyPlayerAPI
    }
}
