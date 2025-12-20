/**
 * GPU-Accelerated TTS Engine using Kokoro-js
 * OPTIMIZED VERSION: Parallel chunk generation, IndexedDB caching, smaller chunks
 * Uses WebGPU for client-side GPU acceleration with WASM fallback
 */

import { getVoiceProfile } from './voice-profiles.js'

// IndexedDB cache for generated audio
const DB_NAME = 'tts-audio-cache'
const DB_VERSION = 1
const STORE_NAME = 'audio-chunks'

export class TTSGPUEngine {
    constructor() {
        this.tts = null
        this.isReady = false
        this.isLoading = false
        this.loadProgress = 0
        this.backend = null // 'webgpu', 'wasm', or 'webspeech'
        this.audioContext = null
        this.analyser = null
        this.useWebSpeechFallback = true
        this.db = null // IndexedDB reference

        // Event callbacks
        this.onProgress = null
        this.onReady = null
        this.onError = null

        // Performance settings
        this.CHUNK_SIZE = 200 // Smaller chunks = faster generation
        this.PARALLEL_LIMIT = 3 // Generate 3 chunks at a time
    }

    /**
     * Initialize IndexedDB for audio caching
     */
    async _initCache() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)
            request.onerror = () => resolve(null) // Graceful fallback
            request.onsuccess = () => {
                this.db = request.result
                resolve(this.db)
            }
            request.onupgradeneeded = (event) => {
                const db = event.target.result
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'hash' })
                }
            }
        })
    }

    /**
     * Generate hash for cache key
     */
    _hashText(text, voiceId, speed) {
        const str = `${text}|${voiceId}|${speed}`
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i)
            hash |= 0
        }
        return `tts_${hash}`
    }

    /**
     * Get cached audio from IndexedDB
     */
    async _getCachedAudio(hash) {
        if (!this.db) return null
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_NAME, 'readonly')
                const store = tx.objectStore(STORE_NAME)
                const request = store.get(hash)
                request.onsuccess = () => resolve(request.result?.audio || null)
                request.onerror = () => resolve(null)
            } catch {
                resolve(null)
            }
        })
    }

    /**
     * Save audio to IndexedDB cache
     */
    async _setCachedAudio(hash, audio) {
        if (!this.db) return
        try {
            const tx = this.db.transaction(STORE_NAME, 'readwrite')
            const store = tx.objectStore(STORE_NAME)
            store.put({ hash, audio, timestamp: Date.now() })
        } catch (e) {
            console.warn('[TTS] Cache write failed:', e)
        }
    }

    /**
     * Initialize the TTS engine with caching support
     */
    async initialize() {
        if (this.isLoading || this.isReady) return

        this.isLoading = true
        this.loadProgress = 0

        try {
            // Init cache first
            await this._initCache()
            console.log('[TTS] Audio cache initialized')

            // Check WebGPU support
            const hasWebGPU = 'gpu' in navigator && navigator.gpu
            this.backend = hasWebGPU ? 'webgpu' : 'wasm'

            console.log(`[TTS] Initializing with ${this.backend} backend...`)
            this._reportProgress(5, 'Checking GPU support...')

            // Setup Web Audio API for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
            this.analyser = this.audioContext.createAnalyser()
            this.analyser.fftSize = 256

            this._reportProgress(10, 'Audio context ready...')

            // Start with Web Speech API fallback immediately
            if (window.speechSynthesis) {
                this.useWebSpeechFallback = true
                this._reportProgress(15, 'Web Speech ready, loading AI model...')
            }

            // Try to load Kokoro TTS
            try {
                this._reportProgress(20, 'Downloading Kokoro TTS model (~82MB)...')

                const { KokoroTTS } = await import('kokoro-js')

                this._reportProgress(40, 'Model downloaded, initializing...')

                this.tts = await KokoroTTS.from_pretrained(
                    'onnx-community/Kokoro-82M-v1.0-ONNX',
                    {
                        dtype: 'q8',
                        device: this.backend,
                        progress_callback: (progress) => {
                            const rawProgress = progress.progress || 0
                            const pct = Math.min(90, 40 + rawProgress * 50) // Clamp to max 90
                            this._reportProgress(pct, `Loading model: ${Math.min(100, Math.round(rawProgress * 100))}%`)
                        }
                    }
                )

                this._reportProgress(95, 'Model ready!')
                this.useWebSpeechFallback = false

            } catch (kokoroError) {
                console.warn('[TTS] Kokoro load failed, using Web Speech fallback:', kokoroError)
                this.backend = 'webspeech'
                this._reportProgress(90, 'Using Web Speech API...')
            }

            this._reportProgress(100, 'Ready!')
            this.isReady = true
            this.isLoading = false

            console.log(`[TTS] Engine ready with ${this.backend} backend`)
            this.onReady?.()

            return true
        } catch (error) {
            console.error('[TTS] Initialization failed:', error)

            if (window.speechSynthesis) {
                this.backend = 'webspeech'
                this.useWebSpeechFallback = true
                this.isReady = true
                this.isLoading = false
                this._reportProgress(100, 'Using Web Speech (fallback)')
                this.onReady?.()
                return true
            }

            this.isLoading = false
            this.onError?.(error)
            throw error
        }
    }

    /**
     * Synthesize text to audio blob with caching
     */
    async synthesize(text, options = {}) {
        if (!this.isReady) {
            await this.initialize()
        }

        const {
            voiceId = 'american_casual',
            pitch = 1.0,
            speed = 0.85,
            onChunkProgress = null
        } = options

        const profile = getVoiceProfile(voiceId)

        // Check cache first
        const cacheKey = this._hashText(text, profile.kokoroVoice, speed)
        const cached = await this._getCachedAudio(cacheKey)
        if (cached) {
            console.log('[TTS] Cache hit! Returning cached audio')
            return cached
        }

        // Use Web Speech fallback if Kokoro not loaded
        if (this.useWebSpeechFallback || !this.tts) {
            return this._synthesizeWebSpeech(text, { voiceId, pitch, speed, profile })
        }

        // Use optimized Kokoro TTS
        const result = await this._synthesizeKokoroOptimized(text, { voiceId, pitch, speed, profile, onChunkProgress })

        // Cache the result
        await this._setCachedAudio(cacheKey, result)

        return result
    }

    /**
     * Synthesize using Web Speech API (fallback)
     */
    async _synthesizeWebSpeech(text, { voiceId, pitch, speed, profile }) {
        return new Promise((resolve, reject) => {
            // Create audio context for recording
            const audioChunks = []

            // For Web Speech, we create a simple audio representation
            // Since Web Speech can't directly give us a blob, we'll simulate it
            const utterance = new SpeechSynthesisUtterance(text)

            // Find matching voice
            const voices = window.speechSynthesis.getVoices()
            const voiceMatch = this._findBestWebSpeechVoice(voiceId, voices)
            if (voiceMatch) utterance.voice = voiceMatch

            // Apply ASMR settings
            utterance.pitch = Math.max(0.1, pitch * profile.defaultPitch * 0.9)
            utterance.rate = Math.max(0.1, speed * profile.defaultSpeed * 0.8)
            utterance.volume = 0.8

            // Estimate duration (rough: 150 words per minute at normal speed)
            const wordCount = text.split(/\s+/).length
            const estimatedDuration = (wordCount / 150) * 60 / (speed * profile.defaultSpeed)

            utterance.onend = () => {
                // Create a silent audio blob as placeholder
                // The actual audio plays through the system
                const sampleRate = 44100
                const duration = estimatedDuration
                const numSamples = sampleRate * duration
                const audioData = new Float32Array(numSamples)

                // Add very subtle noise to indicate audio exists
                for (let i = 0; i < numSamples; i++) {
                    audioData[i] = (Math.random() - 0.5) * 0.001
                }

                const blob = this._createWavBlob(audioData, sampleRate)
                resolve({ blob, duration })
            }

            utterance.onerror = (e) => {
                reject(new Error(`Web Speech error: ${e.error}`))
            }

            // Speak
            window.speechSynthesis.cancel()
            window.speechSynthesis.speak(utterance)
        })
    }

    /**
     * Find best matching Web Speech voice
     */
    _findBestWebSpeechVoice(voiceId, voices) {
        const voicePrefs = {
            asian_female: ['Kyoko', 'Mei-Jia', 'Samantha', 'Karen', 'Allison'],
            american_casual: ['Samantha', 'Victoria', 'Allison', 'Karen', 'Alex'],
            russian_highclass: ['Milena', 'Anna', 'Samantha', 'Victoria', 'Karen'],
            male_deep: ['Daniel', 'Aaron', 'Gordon', 'Fred', 'Alex', 'David']
        }

        const prefs = voicePrefs[voiceId] || voicePrefs.american_casual

        for (const pref of prefs) {
            const match = voices.find(v => v.name.toLowerCase().includes(pref.toLowerCase()))
            if (match) return match
        }

        // Fallback to English voice
        return voices.find(v => v.lang.startsWith('en')) || voices[0]
    }

    /**
     * OPTIMIZED: Synthesize using Kokoro TTS with parallel generation
     */
    async _synthesizeKokoroOptimized(text, { pitch, speed, profile, onChunkProgress }) {
        const effectivePitch = pitch * profile.defaultPitch
        const effectiveSpeed = speed * profile.defaultSpeed

        try {
            console.log(`[TTS] Generating audio for ${text.length} characters with parallel Kokoro...`)
            const startTime = performance.now()

            // Split into smaller chunks for faster per-chunk generation
            const chunks = this._splitText(text, this.CHUNK_SIZE)
            const audioChunks = new Array(chunks.length)
            let completedChunks = 0

            // Process in parallel batches
            for (let i = 0; i < chunks.length; i += this.PARALLEL_LIMIT) {
                const batch = chunks.slice(i, i + this.PARALLEL_LIMIT)
                const batchPromises = batch.map((chunk, batchIdx) =>
                    this.tts.generate(chunk, {
                        voice: profile.kokoroVoice,
                        speed: effectiveSpeed
                    }).then(audio => {
                        audioChunks[i + batchIdx] = audio
                        completedChunks++
                        onChunkProgress?.(completedChunks / chunks.length)
                    })
                )

                // Wait for batch to complete before starting next
                await Promise.all(batchPromises)
            }

            // Combine all audio chunks
            const combinedAudio = this._combineAudioChunks(audioChunks)

            // Convert to blob with pitch adjustment
            const blob = await this._audioToBlob(combinedAudio, effectivePitch)
            const duration = combinedAudio.audio.length / combinedAudio.sampling_rate

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
            console.log(`[TTS] Generated ${duration.toFixed(1)}s audio in ${elapsed}s (${chunks.length} chunks, ${this.PARALLEL_LIMIT}x parallel)`)

            return { blob, duration }
        } catch (error) {
            console.error('[TTS] Kokoro synthesis failed, falling back to Web Speech:', error)
            return this._synthesizeWebSpeech(text, { voiceId: profile.id, pitch, speed, profile })
        }
    }

    /**
     * Generate a short preview (first sentence or 100 chars)
     */
    async generatePreview(text, options = {}) {
        const previewText = text.split(/[.!?]/)[0]?.slice(0, 100) || text.slice(0, 100)
        return this.synthesize(previewText + '.', options)
    }

    /**
     * Split text into chunks for processing
     */
    _splitText(text, maxLength = 500) {
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
     * Combine multiple audio outputs into one
     */
    _combineAudioChunks(chunks) {
        if (chunks.length === 1) return chunks[0]

        const samplingRate = chunks[0].sampling_rate
        const totalLength = chunks.reduce((sum, c) => sum + c.audio.length, 0)
        const combined = new Float32Array(totalLength)

        let offset = 0
        for (const chunk of chunks) {
            combined.set(chunk.audio, offset)
            offset += chunk.audio.length
        }

        return { audio: combined, sampling_rate: samplingRate }
    }

    /**
     * Convert audio data to WAV blob with pitch adjustment
     */
    async _audioToBlob(audioData, pitch = 1.0) {
        const { audio, sampling_rate } = audioData

        // Apply pitch shift if needed (simple resampling approach)
        let processedAudio = audio
        if (pitch !== 1.0) {
            processedAudio = this._pitchShift(audio, pitch)
        }

        return this._createWavBlob(processedAudio, sampling_rate)
    }

    /**
     * Create WAV blob from Float32Array
     */
    _createWavBlob(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2)
        const view = new DataView(buffer)

        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i))
            }
        }

        writeString(0, 'RIFF')
        view.setUint32(4, 36 + samples.length * 2, true)
        writeString(8, 'WAVE')
        writeString(12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, 1, true)
        view.setUint32(24, sampleRate, true)
        view.setUint32(28, sampleRate * 2, true)
        view.setUint16(32, 2, true)
        view.setUint16(34, 16, true)
        writeString(36, 'data')
        view.setUint32(40, samples.length * 2, true)

        // Convert to 16-bit PCM
        const offset = 44
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]))
            view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        }

        return new Blob([buffer], { type: 'audio/wav' })
    }

    /**
     * Simple pitch shift via resampling
     */
    _pitchShift(audio, pitchFactor) {
        const newLength = Math.floor(audio.length / pitchFactor)
        const shifted = new Float32Array(newLength)

        for (let i = 0; i < newLength; i++) {
            const srcIndex = i * pitchFactor
            const srcIndexFloor = Math.floor(srcIndex)
            const srcIndexCeil = Math.min(srcIndexFloor + 1, audio.length - 1)
            const t = srcIndex - srcIndexFloor

            // Linear interpolation
            shifted[i] = audio[srcIndexFloor] * (1 - t) + audio[srcIndexCeil] * t
        }

        return shifted
    }

    /**
     * Report loading progress
     */
    _reportProgress(percent, message) {
        this.loadProgress = percent
        this.onProgress?.(percent, message)
        console.log(`[TTS] ${percent}% - ${message}`)
    }

    /**
     * Get the analyser node for visualization
     */
    getAnalyser() {
        return this.analyser
    }

    /**
     * Check if engine is ready
     */
    getStatus() {
        return {
            isReady: this.isReady,
            isLoading: this.isLoading,
            backend: this.backend,
            progress: this.loadProgress,
            isUsingFallback: this.useWebSpeechFallback
        }
    }

    /**
     * Stop any ongoing synthesis
     */
    stop() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel()
        }
    }
}
