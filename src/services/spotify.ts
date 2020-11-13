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
        let all_tracks = new Array();
        const initial_response = await this.client.getPlaylistTracks(id)
        
        all_tracks = all_tracks.concat(initial_response.body.items);

        const playlist_size = initial_response.body.total;
        const chunks = Math.ceil(playlist_size / 100)
        for (let i=1; i<chunks; i++) {
          const response = await this.client.getPlaylistTracks(id, { offset: i * 100 });
          all_tracks = all_tracks.concat(response.body.items);
        }
        
        return all_tracks;
        
        
       
        
        
    }
}
