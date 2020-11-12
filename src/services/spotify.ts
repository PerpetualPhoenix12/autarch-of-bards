import SpotifyApi from 'spotify-web-api-node'

export default class Spotify {
    client = new SpotifyApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    })

    async authorize() {
        const response = await this.client.clientCredentialsGrant()

        this.client.setAccessToken(response.body.access_token)

    }

    async getPlaylist(id: string) {
        const temp_result = await this.client.getPlaylistTracks(id)

        const playlist_size = temp_result.body.total;
        const offset = playlist_size <= 100 ? 0 : Math.floor(Math.random() * (playlist_size - 100));
        
        const result = await this.client.getPlaylistTracks(id, { offset })
        

        return result.body.items.map(({ track }) => track)
    }
}
