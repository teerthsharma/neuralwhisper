/**
 * GPU-Accelerated TTS Engine using Kokoro-js
 * OPTIMIZED: Parallel chunk generation, IndexedDB caching, Hive Mind Integration
 * Uses WebGPU for client-side GPU acceleration with WASM fallback
 */

import { getVoiceProfile } from './voice-profiles.js'
import { hiveMind } from './hive-mind.js'
import { neuralDirector, EMOTION_PRESETS } from './neural-director.js'

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
        this.destinationNode = null // For connecting DSP chain
        this.gainNode = null

        // DSP Nodes
        this.compressor = null
        this.eqLow = null
        this.eqHigh = null

        this.useWebSpeechFallback = true
        this.db = null // IndexedDB reference

        // Hive Mind Settings
        this.audioMode = 'plain' // 'plain', 'asmr', 'podcast'

        // Event callbacks
        this.onProgress = null
        this.onReady = null
        this.onError = null

        // Performance settings
        this.CHUNK_SIZE = 200
        this.PARALLEL_LIMIT = 3
    }

    /**
     * Initialize Audio Context & DSP Chain
     */
    _initAudioContext() {
        if (!this.audioContext) {
            // "Highest Quality" request: Force 48kHz and high-latency playback (smoother, higher fidelity)
            const AudioContextClass = window.AudioContext || window.webkitAudioContext
            this.audioContext = new AudioContextClass({
                latencyHint: 'playback',
                sampleRate: 48000
            })

            // Master Gain
            this.gainNode = this.audioContext.createGain()

            // Analyser (Visuals)
            this.analyser = this.audioContext.createAnalyser()
            this.analyser.fftSize = 2048 // Higher resolution for visuals
            this.analyser.smoothingTimeConstant = 0.8

            // DSP: Compressor (Dynamics)
            this.compressor = this.audioContext.createDynamicsCompressor()

            // DSP: EQ (Tone)
            this.eqLow = this.audioContext.createBiquadFilter()
            this.eqLow.type = 'lowshelf'
            this.eqLow.frequency.value = 200

            this.eqHigh = this.audioContext.createBiquadFilter()
            this.eqHigh.type = 'highshelf'
            this.eqHigh.frequency.value = 10000

            // Chain: Source -> EQ Low -> EQ High -> Compressor -> Gain -> Analyser -> Dest
            this.eqLow.connect(this.eqHigh)
            this.eqHigh.connect(this.compressor)
            this.compressor.connect(this.gainNode)
            this.gainNode.connect(this.analyser)
            this.analyser.connect(this.audioContext.destination)

            // Entry point for synthesis audio is eqLow
            this.destinationNode = this.eqLow
        }

        // Resume if suspended (browser policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume()
        }
    }

    /**
     * Configure DSP for specific Mode
     */
    setAudioMode(mode) {
        this.audioMode = mode
        if (!this.audioContext) return

        const now = this.audioContext.currentTime
        console.log(`[TTS] Switching Audio Mode: ${mode}`)

        switch (mode) {
            case 'asmr':
                // ASMR: Crushed dynamics (loud whispers), Warmth, Breathiness
                this.compressor.threshold.setValueAtTime(-24, now)
                this.compressor.knee.setValueAtTime(30, now)
                this.compressor.ratio.setValueAtTime(12, now) // Heavy compression
                this.compressor.attack.setValueAtTime(0.003, now)
                this.compressor.release.setValueAtTime(0.25, now)

                this.eqLow.gain.setValueAtTime(4, now) // Warmth boost
                this.eqHigh.gain.setValueAtTime(6, now) // Air/Breath boost
                break

            case 'podcast':
                // Podcast: Broadcast style, punchy, clear
                this.compressor.threshold.setValueAtTime(-18, now)
                this.compressor.ratio.setValueAtTime(4, now)

                this.eqLow.gain.setValueAtTime(2, now) // Slight body
                this.eqHigh.gain.setValueAtTime(3, now) // Clarity
                break

            default: // 'plain'
                // Neutral
                this.compressor.threshold.setValueAtTime(-50, now) // Pass-through mostly
                this.compressor.ratio.setValueAtTime(1, now)
                this.eqLow.gain.setValueAtTime(0, now)
                this.eqHigh.gain.setValueAtTime(0, now)
                break
        }
    }

    async _initCache() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)
            request.onerror = () => resolve(null)
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

    _hashText(text, voiceId, speed, pitch, mode) {
        // Mode affects hash because it changes DSP settings essentially (though DSP is post-process, 
        // if we bake it in later, we need to know. For now, DSP is real-time, so maybe we don't hash mode?)
        // Let's NOT hash mode so we can reuse raw audio and apply different DSP on top.
        const str = `${text}|${voiceId}|${speed}|${pitch}`
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i)
            hash |= 0
        }
        return `tts_${hash}`
    }

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

    async initialize() {
        if (this.isLoading || this.isReady) return

        this.isLoading = true
        this.loadProgress = 0

        try {
            await this._initCache()
            this._initAudioContext() // Init DSP

            const hasWebGPU = 'gpu' in navigator && navigator.gpu
            this.backend = hasWebGPU ? 'webgpu' : 'wasm'

            this._reportProgress(10, `Initializing ${this.backend.toUpperCase()} (High Fidelity)...`)

            if (window.speechSynthesis) {
                this.useWebSpeechFallback = true
            }

            try {
                this._reportProgress(20, 'Loading Neural Model (Full Precision)...')
                const { KokoroTTS } = await import('kokoro-js')
                this._reportProgress(30, 'Downloading Model...')

                // ATTEMPT 1: HIGH PERFORMANCE WEBGPU (FP32)
                if (this.backend === 'webgpu') {
                    try {
                        console.log('🚀 Attempting High-Performance WebGPU Init...')
                        this.tts = await KokoroTTS.from_pretrained(
                            'onnx-community/Kokoro-82M-v1.0-ONNX',
                            {
                                dtype: 'fp32',
                                device: 'webgpu',
                                progress_callback: (progress) => {
                                    const raw = progress.progress || 0
                                    this._reportProgress(30 + raw * 60, 'Loading GPU weights...')
                                }
                            }
                        )
                        console.log('✅ WebGPU Init Successful! Running in FAST AS FUCK mode.')
                    } catch (gpuError) {
                        console.warn('⚠️ WebGPU Init Failed, falling back to WASM:', gpuError)
                        this.backend = 'wasm'
                    }
                }

                // ATTEMPT 2: WASM FALLBACK (If WebGPU was skipped or failed)
                if (!this.tts && this.backend === 'wasm') {
                    this._reportProgress(40, 'Initializing WASM Fallback...')
                    this.tts = await KokoroTTS.from_pretrained(
                        'onnx-community/Kokoro-82M-v1.0-ONNX',
                        {
                            dtype: 'fp32', // Keep high quality even on CPU
                            device: 'wasm',
                            progress_callback: (progress) => {
                                const raw = progress.progress || 0
                                this._reportProgress(30 + raw * 60, 'Loading CPU weights...')
                            }
                        }
                    )
                    console.log('⚠️ Running in WASM Mode (Slower but High Quality)')
                }

                this.useWebSpeechFallback = false
                this._reportProgress(100, 'Neural Engine Ready')

            } catch (kErr) {
                console.warn('[TTS] Neural load failed completely:', kErr)
                this.backend = 'webspeech'
                this.useWebSpeechFallback = true
                this._reportProgress(100, 'Using Offline Fallback')
            }

            this.isReady = true
            this.isLoading = false
            this.onReady?.()
            return true

        } catch (error) {
            console.error('[TTS] Init failed:', error)
            this.isLoading = false
            this.onError?.(error)
            throw error
        }
    }

    /**
     * Synthesize with HIVE MIND INTELLIGENCE + NEURAL DIRECTOR
     * @param {string} text - Text to synthesize
     * @param {Object} options - Synthesis options
     * @param {boolean} options.useDirector - Enable Neural Director semantic tagging (default: true)
     */
    async synthesize(text, options = {}) {
        if (!this.isReady) await this.initialize()

        let {
            voiceId = 'american_casual',
            pitch = 1.0,
            speed = 0.85,
            onChunkProgress = null,
            useDirector = true  // NEW: Enable Neural Director by default
        } = options

        // 1. Get Base Profile
        const profile = getVoiceProfile(voiceId)

        // 2. Consult HIVE MIND for optimizations
        const baseSettings = {
            pitch: pitch * profile.defaultPitch,
            speed: speed * profile.defaultSpeed
        }
        const optimized = hiveMind.getOptimizedSettings(baseSettings)

        // 3. Set DSP Mode if profile suggests it
        if (profile.mode) {
            this.setAudioMode(profile.mode)
        } else {
            this.setAudioMode(this.audioMode)
        }

        // 4. Check Cache (use original text for cache key, not directed)
        const cacheKey = this._hashText(text, profile.kokoroVoice, optimized.speed, optimized.pitch)
        const cached = await this._getCachedAudio(cacheKey)
        if (cached) return cached

        // 5. NEW: Neural Director semantic analysis
        if (useDirector && !this.useWebSpeechFallback && this.tts) {
            try {
                console.log('[TTS] 🎬 Engaging Neural Director...')
                const instructions = await neuralDirector.analyze(text)

                if (instructions.segments && instructions.segments.length > 0) {
                    const result = await this._synthesizeDirected(instructions, {
                        voiceId: profile.kokoroVoice,
                        basePitch: optimized.pitch,
                        baseSpeed: optimized.speed,
                        onChunkProgress
                    })
                    await this._setCachedAudio(cacheKey, result)
                    return result
                }
            } catch (err) {
                console.warn('[TTS] Neural Director failed, falling back to standard synthesis:', err)
            }
        }

        // 6. Standard synthesis path
        const processedText = this._preprocessText(text, this.audioMode)
        console.log(`[TTS] Synthesizing: "${processedText.slice(0, 20)}..."`, optimized)

        if (this.useWebSpeechFallback || !this.tts) {
            return this._synthesizeWebSpeech(processedText, { ...optimized, voiceId })
        }

        const result = await this._synthesizeKokoroOptimized(processedText, {
            voiceId: profile.kokoroVoice,
            pitch: optimized.pitch,
            speed: optimized.speed,
            onChunkProgress
        })

        await this._setCachedAudio(cacheKey, result)
        return result
    }

    /**
     * NEW: Directed synthesis using Neural Director instructions
     * Synthesizes each segment with emotion-specific parameters and injects triggers
     */
    async _synthesizeDirected(instructions, { voiceId, basePitch, baseSpeed, onChunkProgress }) {
        const { segments } = instructions
        const allAudioChunks = []
        let processedSegments = 0

        console.log(`[TTS] 🎬 Directed synthesis: ${segments.length} segments`)

        for (const segment of segments) {
            // 1. Inject trigger audio (breaths, pauses) BEFORE the segment
            const triggers = neuralDirector.parseTriggers(segment)

            for (let i = 0; i < triggers.breaths; i++) {
                const breathAudio = neuralDirector.generateBreath(24000)
                allAudioChunks.push({ audio: breathAudio, sampling_rate: 24000 })
            }

            for (const pauseDuration of triggers.pauses) {
                const silenceAudio = neuralDirector.generateSilence(pauseDuration, 24000)
                allAudioChunks.push({ audio: silenceAudio, sampling_rate: 24000 })
            }

            // 2. Synthesize the segment with emotion-modified parameters
            const emotionSpeed = baseSpeed * (segment.speedMod || 1.0)
            const emotionPitch = basePitch * (segment.pitchMod || 1.0)

            try {
                const audio = await this.tts.generate(segment.text, {
                    voice: voiceId,
                    speed: emotionSpeed
                })

                if (audio && audio.audio && audio.audio.length > 0) {
                    // Apply pitch shift if needed
                    if (Math.abs(emotionPitch - 1.0) > 0.05) {
                        audio.audio = this._pitchShift(audio.audio, emotionPitch)
                    }
                    allAudioChunks.push(audio)
                    console.log(`[TTS] 🎭 Segment [${segment.emotion}]: "${segment.text.slice(0, 25)}..." speed=${emotionSpeed.toFixed(2)} pitch=${emotionPitch.toFixed(2)}`)
                }
            } catch (err) {
                console.warn(`[TTS] Segment synthesis failed:`, err)
            }

            processedSegments++
            onChunkProgress?.(processedSegments / segments.length)
        }

        // Combine all audio chunks
        const combined = this._combineAudioChunks(allAudioChunks)
        return this._audioToBlob(combined)
    }

    /**
     * Preview generation (alias for synthesize for now, might optimize later)
     */
    async generatePreview(text, options) {
        console.log('[TTS] Generating Preview...')
        return this.synthesize(text, options)
    }

    /**
     * Preprocess text for better prosody based on mode
     */
    _preprocessText(text, mode) {
        if (!text) return text

        let processed = text

        // ASMR Mode: Enhance punctuation for pacing
        if (mode === 'asmr') {
            console.log('[TTS] Applying ASMR Comma Expansion...')
            // Replace commas with a pause token or ellipsis to force Kokoro to pause
            // Kokoro treated '...' as a longer pause than ',' in testing
            processed = processed.replace(/,/g, '... ')

            // Ensure full stops have enough space for breath
            processed = processed.replace(/\./g, '... ')

            // Clean up multiple spaces
            processed = processed.replace(/\s+/g, ' ')
        }

        return processed
    }

    /**
     * Plays the audio blob through the DSP chain
     * Returns an AudioBufferSourceNode
     */
    async playBlob(blob) {
        if (!this.audioContext) this._initAudioContext()

        const arrayBuffer = await blob.arrayBuffer()
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)

        const source = this.audioContext.createBufferSource()
        source.buffer = audioBuffer

        // Connect to DSP Chain (eqLow) instead of destination directly
        source.connect(this.destinationNode)

        source.start(0)
        return source
    }

    /**
     * WebSpeech Fallback - Generates audio using browser's Speech Synthesis API
     * CRITICAL: This must produce actual audio, not empty blobs!
     */
    async _synthesizeWebSpeech(text, { voiceId, pitch, speed }) {
        return new Promise((resolve, reject) => {
            if (!window.speechSynthesis) {
                console.error('[TTS] Web Speech API not available')
                reject(new Error('Web Speech API not available'))
                return
            }

            // Create utterance
            const utterance = new SpeechSynthesisUtterance(text)
            utterance.pitch = pitch || 1.0
            utterance.rate = speed || 0.85

            // Try to find a good voice
            const voices = window.speechSynthesis.getVoices()
            if (voices.length > 0) {
                // Prefer high-quality English voices
                const preferredVoice = voices.find(v =>
                    v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Premium'))
                ) || voices.find(v => v.lang.startsWith('en')) || voices[0]
                utterance.voice = preferredVoice
            }

            // IMPORTANT: Web Speech API cannot be recorded directly to a blob
            // We must synthesize using AudioContext with oscillator simulation as fallback
            // OR inform user that WebSpeech fallback plays directly without blob export

            // For now, use direct playback for WebSpeech (can't capture to WAV)
            const startTime = Date.now()

            utterance.onend = () => {
                const duration = (Date.now() - startTime) / 1000
                console.log('[TTS] WebSpeech playback completed, duration:', duration)
                // Return a marker blob indicating WebSpeech was used (for UI purposes)
                // The audio already played through the browser
                resolve({
                    blob: new Blob(['WEBSPEECH_DIRECT'], { type: 'text/plain' }),
                    duration: duration,
                    wasWebSpeech: true,
                    alreadyPlayed: true
                })
            }

            utterance.onerror = (event) => {
                console.error('[TTS] WebSpeech error:', event.error)
                reject(new Error(`WebSpeech synthesis failed: ${event.error}`))
            }

            // Cancel any existing speech and start new
            window.speechSynthesis.cancel()
            window.speechSynthesis.speak(utterance)
        })
    }

    async _synthesizeKokoroOptimized(text, { voiceId, pitch, speed, onChunkProgress }) {
        try {
            const chunks = this._splitText(text, this.CHUNK_SIZE)
            if (!chunks.length || chunks.every(c => !c.trim())) {
                throw new Error('[TTS] No valid text chunks to synthesize')
            }

            const audioChunks = new Array(chunks.length)
            let completed = 0
            let failedChunks = 0

            for (let i = 0; i < chunks.length; i += this.PARALLEL_LIMIT) {
                const batch = chunks.slice(i, i + this.PARALLEL_LIMIT)
                const promises = batch.map((chunk, idx) =>
                    this.tts.generate(chunk, {
                        voice: voiceId,
                        speed: speed
                    }).then(audio => {
                        // CRITICAL: Validate audio output from Kokoro
                        if (!audio || !audio.audio || audio.audio.length === 0) {
                            console.error(`[TTS] Chunk ${i + idx} returned empty audio!`)
                            failedChunks++
                            return
                        }
                        // Check for white noise (all values near 0 or all same value)
                        const sample = audio.audio.slice(0, Math.min(1000, audio.audio.length))
                        const maxAbs = Math.max(...sample.map(Math.abs))
                        if (maxAbs < 0.001) {
                            console.warn(`[TTS] Chunk ${i + idx} has suspiciously low audio levels (max: ${maxAbs})`)
                        }
                        audioChunks[i + idx] = audio
                        completed++
                        onChunkProgress?.(completed / chunks.length)
                    }).catch(err => {
                        console.error(`[TTS] Chunk ${i + idx} generation failed:`, err)
                        failedChunks++
                    })
                )
                await Promise.all(promises)
            }

            // Check if we have enough valid chunks
            const validChunks = audioChunks.filter(c => c && c.audio && c.audio.length > 0)
            if (validChunks.length === 0) {
                throw new Error(`[TTS] All ${chunks.length} chunks failed to generate valid audio!`)
            }
            if (failedChunks > 0) {
                console.warn(`[TTS] ${failedChunks}/${chunks.length} chunks failed, continuing with ${validChunks.length} valid chunks`)
            }

            const combined = this._combineAudioChunks(audioChunks)

            // CRITICAL: Final validation before WAV encoding
            if (!combined.audio || combined.audio.length === 0) {
                throw new Error('[TTS] Combined audio is empty after merging chunks!')
            }

            let finalAudio = combined
            if (Math.abs(pitch - 1.0) > 0.05) {
                finalAudio.audio = this._pitchShift(combined.audio, pitch)
            }

            return this._audioToBlob(finalAudio)

        } catch (e) {
            console.error('[TTS] Kokoro synthesis failed:', e)
            throw e
        }
    }

    _splitText(text, len) {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
        const chunks = []
        let cur = ''
        for (const s of sentences) {
            if ((cur + s).length > len) {
                if (cur) chunks.push(cur.trim())
                cur = s
            } else cur += s
        }
        if (cur) chunks.push(cur.trim())
        return chunks.length ? chunks : [text]
    }

    _combineAudioChunks(chunks) {
        // Filter to only valid chunks with audio data
        const validChunks = chunks.filter(c => c && c.audio && c.audio.length > 0)

        if (validChunks.length === 0) {
            console.error('[TTS] _combineAudioChunks: No valid chunks to combine!')
            return { audio: new Float32Array(0), sampling_rate: 24000, isEmpty: true }
        }

        const total = validChunks.reduce((acc, c) => acc + c.audio.length, 0)
        const out = new Float32Array(total)
        let off = 0

        validChunks.forEach(c => {
            out.set(c.audio, off)
            off += c.audio.length
        })

        console.log(`[TTS] Combined ${validChunks.length} chunks, total samples: ${total}`)
        return { audio: out, sampling_rate: validChunks[0].sampling_rate }
    }

    /**
     * PRODUCER-GRADE AUDIO VALIDATION & NORMALIZATION
     * Prevents white noise by ensuring clean audio before encoding
     */
    _validateAndNormalizeAudio(audio) {
        if (!audio || audio.length === 0) {
            console.warn('[TTS] Empty audio buffer detected')
            return new Float32Array(0)
        }

        // Create a copy to avoid mutating original
        const processed = new Float32Array(audio.length)

        // Pass 1: Validate samples and calculate DC offset
        let sum = 0
        let peak = 0
        let hasInvalidSamples = false

        for (let i = 0; i < audio.length; i++) {
            let sample = audio[i]

            // Check for NaN or Infinity (common white noise cause)
            if (!Number.isFinite(sample)) {
                hasInvalidSamples = true
                sample = 0
            }

            processed[i] = sample
            sum += sample

            const absSample = Math.abs(sample)
            if (absSample > peak) peak = absSample
        }

        if (hasInvalidSamples) {
            console.warn('[TTS] ⚠️ Invalid samples (NaN/Infinity) detected and replaced with silence')
        }

        // Calculate and remove DC offset
        const dcOffset = sum / audio.length
        if (Math.abs(dcOffset) > 0.001) {
            console.log(`[TTS] Removing DC offset: ${dcOffset.toFixed(4)}`)
            for (let i = 0; i < processed.length; i++) {
                processed[i] -= dcOffset
            }
            // Recalculate peak after DC removal
            peak = 0
            for (let i = 0; i < processed.length; i++) {
                const absSample = Math.abs(processed[i])
                if (absSample > peak) peak = absSample
            }
        }

        // Check for silent audio (all zeros or near-zero)
        if (peak < 0.001) {
            console.warn('[TTS] Audio appears to be silent/empty')
            return processed
        }

        // Normalize to target peak with headroom (-3dB = 0.707)
        const targetPeak = 0.707
        if (peak > 0 && peak !== targetPeak) {
            const normalizeGain = targetPeak / peak
            console.log(`[TTS] 🎚️ Normalizing audio: peak=${peak.toFixed(3)} → ${targetPeak.toFixed(3)}, gain=${normalizeGain.toFixed(2)}x`)

            for (let i = 0; i < processed.length; i++) {
                processed[i] *= normalizeGain
            }
        }

        // Apply soft limiter to prevent any clipping (producer-grade protection)
        let limitedSamples = 0
        for (let i = 0; i < processed.length; i++) {
            const sample = processed[i]
            // Soft clip using tanh for musical limiting
            if (Math.abs(sample) > 0.9) {
                processed[i] = Math.tanh(sample * 1.2) * 0.95
                limitedSamples++
            }
        }

        if (limitedSamples > 0) {
            console.log(`[TTS] 🔊 Soft-limited ${limitedSamples} samples to prevent clipping`)
        }

        return processed
    }

    async _audioToBlob(audioData) {
        const { audio: rawAudio, sampling_rate, isEmpty } = audioData

        // CRITICAL VALIDATION: Prevent white noise from empty/invalid audio
        if (!rawAudio || rawAudio.length === 0 || isEmpty) {
            console.error('[TTS] Cannot create WAV blob from empty audio data!')
            return { blob: new Blob([], { type: 'audio/wav' }), duration: 0 }
        }

        // ========== PRODUCER-GRADE AUDIO PROCESSING ==========
        const audio = this._validateAndNormalizeAudio(rawAudio)

        if (audio.length === 0) {
            console.warn('[TTS] Cannot create audio blob from empty buffer after validation')
            return { blob: new Blob([], { type: 'audio/wav' }), duration: 0 }
        }

        // Final validation
        const maxAmplitude = Math.max(...audio.slice(0, Math.min(5000, audio.length)).map(Math.abs))
        console.log(`[TTS] ✅ Creating WAV: ${audio.length} samples at ${sampling_rate}Hz, peak=${maxAmplitude.toFixed(3)}`)

        const buffer = new ArrayBuffer(44 + audio.length * 2)
        const view = new DataView(buffer)

        const writeString = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }

        writeString(0, 'RIFF')
        view.setUint32(4, 36 + audio.length * 2, true)
        writeString(8, 'WAVE')
        writeString(12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, 1, true)
        view.setUint32(24, sampling_rate, true)
        view.setUint32(28, sampling_rate * 2, true)
        view.setUint16(32, 2, true)
        view.setUint16(34, 16, true)
        writeString(36, 'data')
        view.setUint32(40, audio.length * 2, true)

        // Convert to 16-bit PCM with proper clamping
        for (let i = 0; i < audio.length; i++) {
            // Hard clamp to valid range (safety net after soft limiting)
            const s = Math.max(-1, Math.min(1, audio[i]))
            view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        }

        return { blob: new Blob([buffer], { type: 'audio/wav' }), duration: audio.length / sampling_rate }
    }

    _pitchShift(audio, pitch) {
        // ... (Reuse existing pitch shift) ...
        // Simple linear interpolation
        const newLen = Math.floor(audio.length / pitch)
        const out = new Float32Array(newLen)
        for (let i = 0; i < newLen; i++) {
            const src = i * pitch
            const idx = Math.floor(src)
            const t = src - idx
            if (idx + 1 < audio.length) {
                out[i] = audio[idx] * (1 - t) + audio[idx + 1] * t
            }
        }
        return out
    }

    _reportProgress(p, m) {
        this.loadProgress = p
        this.onProgress?.(p, m)
    }

    getAnalyser() { return this.analyser }

    stop() {
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        // If playing blob via PlayAudio, handling stop is external usually
    }
}
