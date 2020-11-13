import { MessageCollector, VoiceChannel, TextChannel, Guild, DMChannel } from 'discord.js';
import ytdl from 'ytdl-core-discord'
import { QuizArgs } from './types/quiz-args'
import { CommandoMessage } from 'discord.js-commando'
import Spotify from './services/spotify'
import SpotifyApi from 'spotify-web-api-node'
import { Youtube } from './services/youtube'
import { Song } from 'song'
import { VoiceConnection } from 'discord.js'
import internal from 'stream'
import { StreamDispatcher } from 'discord.js';
require('dotenv').config();

const stopCommand = `finix is the best`
const skipCommand = `finix is cool`

export class MusicQuiz {
    guild: Guild
    textChannel: TextChannel|DMChannel
    voiceChannel: VoiceChannel
    messageCollector: MessageCollector
    arguments: QuizArgs
    songs: Song[]
    currentSong: number = 0
    skippers: string[] = []
    connection: VoiceConnection
    scores: {[key: string]: number}
    artistGuessed: boolean
    titleGuessed: boolean
    musicStream: internal.Readable
    voiceStream: StreamDispatcher
    songTimeout: NodeJS.Timeout
    reactPermissionNotified: boolean = false
    youtube: Youtube

    constructor(message: CommandoMessage, args: QuizArgs) {
        this.guild = message.guild
        this.textChannel = message.channel
        this.voiceChannel = message.member.voice.channel
        this.arguments = args
        this.youtube = new Youtube()
    }

    async start() {
        this.songs = await this.getSongs(
            this.arguments.playlist,
            parseInt(this.arguments.songs, 10)
        )

        if (!this.songs || this.songs.length === 0) {
            if (this.songs && this.songs.length === 0) {
                await this.textChannel.send('Playlist contains no songs')
            }

            this.finish()

            return
        }

        try {
            this.connection = await this.voiceChannel.join()
        } catch (e) {
            await this.textChannel.send('Could not join voice channel. Is it full?')
            await this.finish()

            return
        }

        this.currentSong = 0
        this.scores = {}
        this.textChannel.send(`
            **Let's get started**! :headphones: :tada:
            **${this.songs.length}** songs have been selected randomly from the playlist.
            You have one minute to guess each song.

            ${this.pointText()}

            Type \`${stopCommand}\` to vote for continuing to the next song.
            Type \`${skipCommand}\` to stop the quiz.

            - GLHF :microphone:
        `.replace(/  +/g, ''))
        // await this.youtube.getProxies()
        this.startPlaying()

        this.messageCollector = this.textChannel
            .createMessageCollector((message: CommandoMessage) => !message.author.bot)
            .on('collect', message => this.handleMessage(message))
    }

    async startPlaying() {
        this.titleGuessed = false
        this.artistGuessed = false
        if (this.arguments.only.toLowerCase() === 'artist') {
            this.titleGuessed = true
        } else if (this.arguments.only.toLowerCase() === 'title') {
            this.artistGuessed = true
        }

        const song = this.songs[this.currentSong]
        const links = await this.getSongLinks(song)

        if (links.length == 0) {
          this.nextSong('Could not find the song on Youtube. Skipping to next.')
          return
        }

        for (let link of links) {
          try {
            this.musicStream = await ytdl(link);
            break;
          } catch (e) {
            console.log("fucked");
          }
        }

        if (!this.musicStream) {
          this.nextSong('fucked');
          return;
        }



        this.songTimeout = setTimeout(() => {
            this.nextSong('Song was not guessed in time')
        }, 1000 * 60);

        try {
            this.voiceStream = this.connection.play(this.musicStream, { type: 'opus', volume: .5 })

            this.voiceStream.on('error', () => {
                    this.textChannel.send('Connection got interrupted. Please try again')

                    this.finish()
                })
            this.voiceStream.on('finish', () => this.finish())
            this.voiceStream
        } catch (e) {
            console.error(e);

            this.textChannel.send('Connection got interrupted. Please try again')

            this.finish()
        }
    }

    async handleMessage(message: CommandoMessage) {

        const content = message.content.toLowerCase()
        if (content === stopCommand) {
            await this.printStatus('Quiz stopped!')
            await this.finish()

            return
        }

        if (content === skipCommand) {
            await this.handleSkip(message.author.id)

            return
        }

        const song = this.songs[this.currentSong]
        let score = this.scores[message.author.id] || 0
        let correct = false

        if (!this.titleGuessed && content.includes(this.stripSongName(song.title).toLowerCase())) {
            score += 2
            this.titleGuessed = true
            correct = true
        }

        if (!this.artistGuessed && content.includes(song.artist.toLowerCase())) {
            score += 3
            this.artistGuessed = true
            correct = true
        }
        this.scores[message.author.id] = score

        if (this.titleGuessed && this.artistGuessed) {
            this.nextSong('Song guessed!')
        }

        correct ? await this.reactToMessage(message, '☑') : this.reactToMessage(message, '❌');

    }

    handleSkip(userID: string) {
        if (this.skippers.includes(userID)) return

        this.skippers.push(userID)

        const members = this.voiceChannel.members
            .filter(member => !member.user.bot)
            
        if (this.skippers.length === members.size) {
            this.nextSong('Song skipped!')

            return
        }

        this.textChannel.send(`**(${this.skippers.length}/${members.size})** to skip the song`)
    }

    async finish() {
        if (this.songTimeout) clearTimeout(this.songTimeout)
        if (this.messageCollector) this.messageCollector.stop()
        if (this.voiceStream) this.voiceStream.destroy()
        if (this.musicStream) this.musicStream.destroy()

        if (this.guild.quiz) this.guild.quiz = null
        this.voiceChannel.leave()
    }

    nextSong(status: string) {
        if (this.songTimeout) clearTimeout(this.songTimeout)
        status == "fucked" ? this.songs.splice(this.currentSong, 1) : this.printStatus(status)
          
        if (this.currentSong + 1 === this.songs.length) {
            return this.finish()
        }

        this.currentSong++
        this.skippers = []
        if (this.musicStream) this.musicStream.destroy()
        if (this.voiceStream) this.voiceStream.destroy()
        this.startPlaying()
    }

    async printStatus(message: string) {
        const song = this.songs[this.currentSong]
        await this.textChannel.send(`
            **(${this.currentSong + 1}/${this.songs.length})** ${message}
            > **${song.title}** by **${song.artist}**
            > Link: || ${song.link} ||

            **__SCORES__**
            ${this.getScores()}
        `.replace(/  +/g, ''))
    }

    getScores(): string {
        return this.voiceChannel.members
            .filter(member => !member.user.bot)
            .array()
            .sort((first, second) => (this.scores[first.id] || 0) < (this.scores[second.id] || 0) ? 1 : -1)
            .map((member, index) => {
                let position = `**${index + 1}.** `
                if (index === 0) {
                    position = ':first_place:'
                } else if (index === 1) {
                    position = ':second_place:'
                } else if (index === 2) {
                    position = ':third_place:'
                }

                return `${position} <@!${member.id}> ${this.scores[member.id] || 0} points`
            })
            .join('\n')
    }

    async reactToMessage(message: CommandoMessage, emoji: string) {
        try {
            await message.react(emoji)
        } catch (e) {
            if (this.reactPermissionNotified) {
                return
            }

            this.reactPermissionNotified = true
            this.textChannel.send(`
                Please give me permission to react to messages.
                You can easily do this by clicking the following link and adding me to your server again.
                https://discordapp.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&scope=bot&permissions=3147840
            `.replace(/  +/g, ''))
        }

    }

    async getSongs(playlist: string, amount: number): Promise<Song[]> {
        const spotify = new Spotify()
        await spotify.authorize()
        if (playlist.includes('spotify.com/playlist')) {
            playlist = playlist.match(/playlist\/([^?]+)/)[1] || playlist
        }

        // arr.slice() vs arr.filter()
        // https://jsben.ch/q1UpB
        try {
          return (this.shuffleSongs(await spotify.getPlaylist(playlist)))
          .slice(0, amount)
            .map(({ track, added_by }) => ({
              link: `https://open.spotify.com/track/${track.id}`,
              previewUrl: track.preview_url,
              title: track.name,
              artist: (track.artists[0] || {}).name,
              added_by: added_by.id
          }))

        } catch (error) {
            this.textChannel.send('Could not retrieve the playlist. Make sure it\'s public')

            return null
        }
    }

    async getSongLinks(song: Song): Promise<string[]> {
        console.log(`${song.title} - ${song.artist}`);
        try {
            return await this.youtube.findSongs(`${song.title} - ${song.artist} Audio`)
        } catch (e) {
            await this.textChannel.send('Oh no... Youtube police busted the party :(\nPlease try again later.')
            await this.finish()

            throw e
        }
    }

    /**
     * Will remove all excess from the song names
     * Examples:
     * death bed (coffee for your head) (feat. beabadoobee) -> death bed
     * Dragostea Din Tei - DJ Ross Radio Remix -> Dragostea Din Tei
     *
     * @param name string
     */
    stripSongName(name: string): string {
        return name.replace(/ \(.*\)/g, '')
             .replace(/ - .*$/, '')
             .replace(/[?!,.]/g, '')
             .replace(/&/g, 'and')
    }

    pointText(): string {
        if (this.arguments.only === 'artist') {
            return 'Guess the artist of the song by typing in chat. When guessed corretly you are awarded **3 points**.'
        }

        if (this.arguments.only === 'title') {
            return 'Guess the title of the song by typing in chat. When guessed corretly you are awarded **2 points**.'
        }

        return `
            Guess the song and artist by typing in chat. Points are awarded as follows:
            > Artist - **3 points**
            > Title - **2 points**
            > Artist + title - **5 points**
        `.replace(/  +/g, '')

    }

    shuffleSongs(songs: SpotifyApi.PlaylistTrackObject[]): SpotifyApi.PlaylistTrackObject[] {
      let curIndex = songs.length, temp, randomIndex
    
      while (0 !== curIndex) {
    
        randomIndex = Math.floor(Math.random() * curIndex)
        curIndex -= 1
    
        temp = songs[curIndex]
        songs[curIndex] = songs[randomIndex]
        songs[randomIndex] = temp
      }
      
      return songs;
    }
}
