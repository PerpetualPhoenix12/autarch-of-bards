import YoutubeScraper from 'scrape-youtube'
import { Video } from 'scrape-youtube/lib/interface';

export class Youtube {

    async findSongs(query: string, proxy?: string|undefined, tries: number = 0): Promise<string[]> {
        try {
            // @ts-ignore
            const result = await YoutubeScraper.search(query, { baseUrl: '' })
            const final = result.videos.map(video => video.link);
            
            return final.slice(0, 5) ?? null
        } catch (error) {
            if (tries > 3) {
                throw error
            }

            return Math.random() < 0.005 ? ["https://www.youtube.com/watch?v=Hm7vnOC4hoY"] : await this.findSongs(query)
        }
    }
}