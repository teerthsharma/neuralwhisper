/**
 * Client-side TTS Engine
 * Uses Web Speech API with pitch/speed controls for ASMR effect
 */

export class TTSEngine {
    constructor() {
        this.synth = window.speechSynthesis
        this.voices = []
        this.isReady = false
        this.currentUtterance = null

        // Load voices
        this.loadVoices()

        // Voices may load asynchronously
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.loadVoices()
        }
    }

    loadVoices() {
        this.voices = this.synth.getVoices()
        this.isReady = this.voices.length > 0
        console.log('TTS Voices loaded:', this.voices.length)
    }

    /**
     * Get best matching voice for ASMR effect
     */
    getBestVoice(voiceId) {
        const preferences = {
            asian_female: ['Kyoko', 'Mei-Jia', 'Samantha', 'Karen'],
            american_casual: ['Samantha', 'Victoria', 'Allison', 'Alex'],
            russian_highclass: ['Milena', 'Anna', 'Samantha', 'Victoria'],
            male_deep: ['Daniel', 'Aaron', 'Gordon', 'Fred', 'Alex']
        }

        const prefs = preferences[voiceId] || preferences.american_casual

        // Find best matching voice
        for (const pref of prefs) {
            const match = this.voices.find(v =>
                v.name.toLowerCase().includes(pref.toLowerCase())
            )
            if (match) return match
        }

        // Fallback: prefer any English voice
        const englishVoice = this.voices.find(v => v.lang.startsWith('en'))
        return englishVoice || this.voices[0]
    }

    /**
     * Synthesize and SPEAK the text immediately
     * @param {string} text - Text to synthesize
     * @param {Object} options - Synthesis options
     * @returns {Promise<void>}
     */
    async synthesize(text, options = {}) {
        const {
            voice = 'american_casual',
            pitch = 1.0,
            speed = 0.85
        } = options

        // Cancel any ongoing speech
        this.synth.cancel()

        return new Promise((resolve, reject) => {
            // Split text into chunks (speechSynthesis has limits)
            const chunks = this.splitText(text, 200)
            let currentChunk = 0

            const speakNextChunk = () => {
                if (currentChunk >= chunks.length) {
                    resolve()
                    return
                }

                const utterance = new SpeechSynthesisUtterance(chunks[currentChunk])

                // Get best voice
                const selectedVoice = this.getBestVoice(voice)
                if (selectedVoice) {
                    utterance.voice = selectedVoice
                }

                // ASMR settings - lower pitch, slower speed for whisper effect
                utterance.pitch = Math.max(0.1, pitch * 0.85)
                utterance.rate = Math.max(0.1, speed * 0.75)
                utterance.volume = 0.8

                utterance.onend = () => {
                    currentChunk++
                    speakNextChunk()
                }

                utterance.onerror = (e) => {
                    console.error('Speech error:', e)
                    currentChunk++
                    speakNextChunk() // Continue with next chunk
                }

                this.currentUtterance = utterance
                this.synth.speak(utterance)
            }

            // Start speaking
            speakNextChunk()
        })
    }

    /**
     * Split text into speakable chunks
     */
    splitText(text, maxLength = 200) {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
        const chunks = []
        let currentChunk = ''

        for (const sentence of sentences) {
            if ((currentChunk + sentence).length > maxLength) {
                if (currentChunk) chunks.push(currentChunk.trim())
                currentChunk = sentence
            } else {
                currentChunk += sentence
            }
        }

        if (currentChunk) chunks.push(currentChunk.trim())

        return chunks.length > 0 ? chunks : [text]
    }

    /**
     * Stop speaking
     */
    stop() {
        this.synth.cancel()
    }
}
