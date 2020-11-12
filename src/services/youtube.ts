import YoutubeScraper from 'scrape-youtube'

export class Youtube {
    async findSongs(query: string, proxy?: string|undefined, tries: number = 0): Promise<string[]> {
        try {
            // @ts-ignore
            const result = await YoutubeScraper.search(query, { baseUrl: '' })
            const final = result.videos.map(video => video.link);
            
            return final.slice(0, final.length >= 5 ? 5 : final.length) ?? null
        } catch (error) {
            return Math.random() < 0.005 ? ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"] : await this.findSongs(query)
        }
    }
}