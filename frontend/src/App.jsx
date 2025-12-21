import { useState, useCallback, useRef, useEffect } from 'react'
import { processDocument } from './lib/document-processor'
import { TTSGPUEngine } from './lib/tts-gpu-engine'
import { VOICE_LIST, loadCustomVoices, getCustomVoices, areCustomVoicesLoaded, ALL_KOKORO_VOICES, getVoiceProfile } from './lib/voice-profiles'
import { previewCache } from './lib/preview-cache'
import { fetchWikipediaArticle, isValidWikipediaUrl } from './lib/wikipedia-scraper'
import { VideoBackground } from './components/video-background'
import { VoiceSelector } from './components/voice-selector'
import { themeManager } from './lib/theme-manager'
import { AudioEffects } from './lib/audio-effects'
import { WelcomeHero } from './components/welcome-hero'
import { AudiobookShelf } from './components/audiobook-shelf'
import { UrlInput } from './components/url-input'
import { LiquidSlider } from './components/liquid-slider'

// Sample text for voice preview
const PREVIEW_TEXT = "Welcome to ASMR Reader. Experience premium AI-powered whisper synthesis."

const AUDIO_PRESETS = {
    default: {
        name: 'Default (Balanced)',
        settings: {
            eq: { sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, presence: 0, brilliance: 0 },
            reverb: { mix: 0 }
        }
    },
    crisp: {
        name: 'Crisp & Clear',
        settings: {
            eq: { sub: -2, bass: -1, lowMid: -1, mid: 1, highMid: 2, presence: 3, brilliance: 4 },
            reverb: { mix: 0.05 }
        }
    },
    deep: {
        name: 'Deep Relaxation',
        settings: {
            eq: { sub: 2, bass: 3, lowMid: 2, mid: 0, highMid: -1, presence: -1, brilliance: -2 },
            reverb: { mix: 0.1 }
        }
    },
    warm: {
        name: 'Warm & Cozy',
        settings: {
            eq: { sub: 1, bass: 1, lowMid: 2, mid: 1, highMid: -1, presence: -2, brilliance: -3 },
            reverb: { mix: 0.15 }
        }
    },
    binaural: {
        name: 'Binaural Space',
        settings: {
            eq: { sub: 0, bass: 1, lowMid: 0, mid: 0, highMid: 1, presence: 2, brilliance: 1 },
            reverb: { mix: 0.25 }
        }
    }
}

export default function App() {
    // Core state
    const [pdfText, setPdfText] = useState('')
    const [selectedVoice, setSelectedVoice] = useState(VOICE_LIST[0])
    const [pitch, setPitch] = useState(1.0)
    const [speed, setSpeed] = useState(0.85)

    // Status state
    const [modelStatus, setModelStatus] = useState('loading') // loading, ready, error
    const [modelProgress, setModelProgress] = useState(0)
    const [gpuBackend, setGpuBackend] = useState(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [generateProgress, setGenerateProgress] = useState(0)

    // Audio state
    const [isPlaying, setIsPlaying] = useState(false)
    const [progress, setProgress] = useState(0)
    const [currentTime, setCurrentTime] = useState('0:00')
    const [duration, setDuration] = useState('0:00')
    const [audioReady, setAudioReady] = useState(false)
    const [audioUrl, setAudioUrl] = useState(null)
    const [playingSample, setPlayingSample] = useState(null) // Track which sample is playing

    // UI state
    const [dragOver, setDragOver] = useState(false)
    const [previewingVoice, setPreviewingVoice] = useState(null)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [selectedPreset, setSelectedPreset] = useState('default')
    const [customVoices, setCustomVoices] = useState([])
    const [loadingCustomVoices, setLoadingCustomVoices] = useState(false)
    const [selectedKokoroVoice, setSelectedKokoroVoice] = useState(null)

    // Sleep mode state
    const [sleepMode, setSleepMode] = useState(false)
    const [sleepModeActivating, setSleepModeActivating] = useState(false)
    const [sleepModeVolume, setSleepModeVolume] = useState(0.5)

    // Wikipedia state
    const [wikipediaUrl, setWikipediaUrl] = useState('')
    const [isFetchingWikipedia, setIsFetchingWikipedia] = useState(false)
    const [wikipediaError, setWikipediaError] = useState('')

    // Producer controls state
    const [eqSettings, setEqSettings] = useState({
        sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, presence: 0, brilliance: 0
    })
    const [compSettings, setCompSettings] = useState({
        threshold: -24, ratio: 4, attack: 3, release: 250
    })
    const [reverbMix, setReverbMix] = useState(0)
    const [stereoWidth, setStereoWidth] = useState(1.0)
    const [pan, setPan] = useState(0)
    const [masterGain, setMasterGain] = useState(1.0)

    // Refs
    const fileInputRef = useRef(null)
    const audioRef = useRef(null)
    const canvasRef = useRef(null)
    const ttsEngineRef = useRef(null)
    const audioContextRef = useRef(null)
    const sourceNodeRef = useRef(null)
    const animationRef = useRef(null)
    const sleepCanvasRef = useRef(null)
    const sleepAnalyserRef = useRef(null)
    const sleepAnimationRef = useRef(null)
    const sampleAudioRef = useRef(null) // For playing samples
    const analyserRef = useRef(null) // Main audio analyser
    const audioEffectsRef = useRef(null)

    // Initialize TTS Engine
    useEffect(() => {
        const initEngine = async () => {
            ttsEngineRef.current = new TTSGPUEngine()

            ttsEngineRef.current.onProgress = (percent, message) => {
                setModelProgress(percent)
            }

            ttsEngineRef.current.onReady = () => {
                setModelStatus('ready')
                setGpuBackend(ttsEngineRef.current.backend)
            }

            ttsEngineRef.current.onError = (err) => {
                console.error('TTS init error:', err)
                setModelStatus('error')
            }

            try {
                await ttsEngineRef.current.initialize()
            } catch (err) {
                console.error('Failed to initialize TTS:', err)
                setModelStatus('error')
            }
        }

        initEngine()

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            if (audioContextRef.current) audioContextRef.current.close()
        }
    }, [])

    // Load Custom Voices (F5-TTS Clones)
    useEffect(() => {
        const loadVoices = async () => {
            setLoadingCustomVoices(true)
            try {
                const voicesMap = await loadCustomVoices()
                if (voicesMap) {
                    const voicesList = Object.values(voicesMap)
                    setCustomVoices(voicesList)
                    console.log('Loaded custom voices:', voicesList.length)
                }
            } catch (e) {
                console.warn('Failed to load custom voices:', e)
            } finally {
                setLoadingCustomVoices(false)
            }
        }
        loadVoices()
    }, [])

    // Initialize audio context and effects when playing
    const initAudioEffects = useCallback(() => {
        if (audioContextRef.current) return

        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
        audioEffectsRef.current = new AudioEffects(audioContextRef.current)
        audioEffectsRef.current.initialize()
    }, [])

    // Waveform visualization
    const drawWaveform = useCallback(() => {
        if (!canvasRef.current || !audioContextRef.current) return

        if (!analyserRef.current) {
            analyserRef.current = audioContextRef.current.createAnalyser()
            analyserRef.current.fftSize = 256
        }

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const analyser = analyserRef.current
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        const draw = () => {
            if (!audioRef.current || audioRef.current.paused) {
                if (animationRef.current) cancelAnimationFrame(animationRef.current)
                return
            }
            animationRef.current = requestAnimationFrame(draw)

            analyser.getByteFrequencyData(dataArray)

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'

            const barWidth = (canvas.width / bufferLength) * 2.5
            let barHeight
            let x = 0

            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 2
                ctx.fillStyle = `rgba(139, 92, 246, ${barHeight / 150 + 0.5})`
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
                x += barWidth + 1
            }
        }

        // Connect source if needed
        if (audioRef.current && !sourceNodeRef.current) {
            try {
                sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current)
                sourceNodeRef.current.connect(analyser)
                if (audioEffectsRef.current && audioEffectsRef.current.input) {
                    sourceNodeRef.current.connect(audioEffectsRef.current.input)
                } else {
                    sourceNodeRef.current.connect(audioContextRef.current.destination)
                }
            } catch (e) {
                console.warn("Failed to create media source:", e)
            }
        }

        draw()
    }, [isPlaying])

    // Format time helper
    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Voice preview using GPU TTS
    const handleVoicePreview = useCallback(async (voice, e) => {
        e.stopPropagation()

        if (previewingVoice === voice.id) {
            if (audioRef.current) audioRef.current.pause()
            setPreviewingVoice(null)
            return
        }

        if (modelStatus !== 'ready') return

        setPreviewingVoice(voice.id)

        try {
            const result = await ttsEngineRef.current.generatePreview(PREVIEW_TEXT, {
                voiceId: voice.id,
                pitch,
                speed
            })

            if (audioRef.current && previewingVoice === voice.id) {
                const url = URL.createObjectURL(result.blob)
                audioRef.current.src = url
                audioRef.current.play()
                audioRef.current.onended = () => setPreviewingVoice(null)
            }
        } catch (err) {
            console.error('Preview failed:', err)
            setPreviewingVoice(null)
        }
    }, [pitch, speed, previewingVoice, modelStatus])





    // Handle file upload (PDF or Text)
    const handleFileUpload = useCallback(async (file) => {
        if (!file) return

        // Handle Media Upload for Background
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            await themeManager.setMediaBackground(file)
            return
        }

        // Handle Document Upload
        try {
            const result = await processDocument(file)
            // Join segments back for text editor, but keep structure for later if needed.
            // For now, we just show the full text, but the engine handles it smartly.
            const fullText = result.segments.map(s => s.text).join('\n\n')
            setPdfText(fullText)
            setAudioReady(false)
            setAudioUrl(null)
        } catch (error) {
            console.error('Document processing failed:', error)
            alert('Failed to process file. Supported formats: PDF, TXT')
        }
    }, [])

    // Drag and drop handlers
    const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
    const handleDragLeave = () => setDragOver(false)
    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        handleFileUpload(e.dataTransfer.files[0])
    }

    // Wikipedia fetch handler
    const handleWikipediaFetch = useCallback(async () => {
        if (!wikipediaUrl.trim()) return

        setIsFetchingWikipedia(true)
        setWikipediaError('')

        try {
            const result = await fetchWikipediaArticle(wikipediaUrl)
            setPdfText(`# ${result.title}\n\n${result.content}`)
            setAudioReady(false)
            setAudioUrl(null)
            setWikipediaUrl('') // Clear input on success
        } catch (error) {
            console.error('Wikipedia fetch failed:', error)
            setWikipediaError(error.message)
        } finally {
            setIsFetchingWikipedia(false)
        }
    }, [wikipediaUrl])

    // Generate audio
    const handleGenerate = useCallback(async () => {
        if (!pdfText.trim() || modelStatus !== 'ready') return

        setIsGenerating(true)
        setGenerateProgress(0)

        try {
            // Check cache first
            const cacheKey = { voiceId: selectedVoice.id, pitch, speed }
            const cached = await previewCache.get(pdfText, cacheKey)

            if (cached) {
                console.log('Using cached audio')
                const url = URL.createObjectURL(cached)
                setAudioUrl(url)
                if (audioRef.current) {
                    audioRef.current.src = url
                    audioRef.current.load()
                }
                setAudioReady(true)
                setIsGenerating(false)
                return
            }

            const result = await ttsEngineRef.current.synthesize(pdfText, {
                voiceId: selectedVoice.id,
                pitch,
                speed,
                onChunkProgress: (p) => setGenerateProgress(p * 100)
            })

            // Cache the result
            await previewCache.set(pdfText, cacheKey, result.blob, result.duration)

            const url = URL.createObjectURL(result.blob)
            setAudioUrl(url)

            if (audioRef.current) {
                audioRef.current.src = url
                audioRef.current.load()
            }

            setAudioReady(true)
        } catch (error) {
            console.error('TTS generation failed:', error)
            alert('Audio generation failed. Please try again.')
        } finally {
            setIsGenerating(false)
        }
    }, [pdfText, selectedVoice, pitch, speed, modelStatus])

    // Audio playback
    const togglePlayback = useCallback(() => {
        if (!audioRef.current || !audioUrl) return

        // Stop any playing sample
        if (playingSample) {
            if (sampleAudioRef.current) {
                sampleAudioRef.current.pause()
                setPlayingSample(null)
            }
        }

        if (isPlaying) {
            audioRef.current.pause()
        } else {
            initAudioEffects()
            audioRef.current.play()
            drawWaveform()
        }
        setIsPlaying(!isPlaying)
    }, [isPlaying, audioUrl, initAudioEffects, drawWaveform, playingSample])

    // Sample playback handler
    const handleSamplePlay = useCallback((sample, e) => {
        e.stopPropagation()

        // Stop main audio if playing
        if (isPlaying && audioRef.current) {
            audioRef.current.pause()
            setIsPlaying(false)
        }

        // If clicking the currently playing sample, pause it
        if (playingSample === sample.name) {
            if (sampleAudioRef.current) {
                sampleAudioRef.current.pause()
                setPlayingSample(null)
            }
            return
        }

        // Stop any other sample
        if (sampleAudioRef.current) {
            sampleAudioRef.current.pause()
        }

        // Initialize audio context if needed
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
        }
        const ctx = audioContextRef.current

        // Resume context if suspended
        if (ctx.state === 'suspended') {
            ctx.resume()
        }

        // Play new sample
        const audio = new Audio(sample.file)
        audio.crossOrigin = "anonymous" // Enable CORS for audio visualization
        audio.volume = 0.8
        sampleAudioRef.current = audio
        setPlayingSample(sample.name)

        // Connect to analyser for visualization
        try {
            const source = ctx.createMediaElementSource(audio)

            // Connect to sleep analyser if active
            if (sleepMode) {
                // Ensure sleep analyser exists
                if (!sleepAnalyserRef.current) {
                    sleepAnalyserRef.current = ctx.createAnalyser()
                    sleepAnalyserRef.current.fftSize = 512
                    sleepAnalyserRef.current.smoothingTimeConstant = 0.85
                }
                source.connect(sleepAnalyserRef.current)
                sleepAnalyserRef.current.connect(ctx.destination)
            } else {
                // Determine which analyser to use (main or sleep)
                // If not in sleep mode but playing sample, we might still want viz?
                // For now, just connect to destination to ensure sound
                source.connect(ctx.destination)
            }
        } catch (err) {
            console.error("Audio routing error:", err)
        }

        audio.play().catch(e => {
            console.error("Failed to play sample:", e)
            setPlayingSample(null)
        })

        audio.onended = () => {
            setPlayingSample(null)
        }
    }, [isPlaying, playingSample, sleepMode])

    // Audio event handlers
    const handleTimeUpdate = () => {
        if (!audioRef.current) return
        const current = audioRef.current.currentTime
        const total = audioRef.current.duration || 0
        setProgress((current / total) * 100)
        setCurrentTime(formatTime(current))
    }

    const handleLoadedMetadata = () => {
        if (!audioRef.current) return
        setDuration(formatTime(audioRef.current.duration))
    }

    const handleEnded = () => {
        setIsPlaying(false)
        setProgress(0)
        if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }

    const handleProgressClick = (e) => {
        if (!audioRef.current) return
        const rect = e.target.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        audioRef.current.currentTime = percent * audioRef.current.duration
    }

    // Apply preset
    const applyPreset = useCallback((presetKey) => {
        setSelectedPreset(presetKey)
        const preset = AUDIO_PRESETS[presetKey]
        if (preset.settings.eq) {
            setEqSettings(prev => ({
                ...prev,
                ...Object.fromEntries(
                    Object.entries(preset.settings.eq).map(([k, v]) => [k, v.gain])
                )
            }))
        }
        if (preset.settings.reverb) {
            setReverbMix(preset.settings.reverb.mix)
        }
        if (audioEffectsRef.current && preset.settings) {
            audioEffectsRef.current.loadPreset(preset.settings)
        }
    }, [])

    // Update EQ
    const updateEQ = useCallback((band, value) => {
        setEqSettings(prev => ({ ...prev, [band]: value }))
        if (audioEffectsRef.current) {
            audioEffectsRef.current.setEQ(band, value)
        }
    }, [])

    // Download audio
    const handleDownload = useCallback(() => {
        if (!audioUrl) return
        const a = document.createElement('a')
        a.href = audioUrl
        a.download = `asmr-audio-${Date.now()}.wav`
        a.click()
    }, [audioUrl])

    // Sleep mode toggle with animation
    const toggleSleepMode = useCallback(() => {
        if (sleepModeActivating) return

        if (!sleepMode) {
            // Entering sleep mode
            setSleepModeActivating(true)
            setTimeout(() => {
                setSleepMode(true)
                setSleepModeActivating(false)
                // Apply sleep volume
                if (audioRef.current) {
                    audioRef.current.volume = sleepModeVolume
                }
            }, 1500) // Animation duration
        } else {
            // Exiting sleep mode
            setSleepMode(false)
            if (audioRef.current) {
                audioRef.current.volume = 1.0
            }
            if (sleepAnimationRef.current) {
                cancelAnimationFrame(sleepAnimationRef.current)
            }
        }
    }, [sleepMode, sleepModeActivating, sleepModeVolume])

    // Sleep mode volume control
    const adjustSleepVolume = useCallback((delta) => {
        setSleepModeVolume(prev => {
            const newVol = Math.max(0, Math.min(1, prev + delta))
            if (audioRef.current) {
                audioRef.current.volume = newVol
            }
            return newVol
        })
    }, [])

    // Sleep mode waveform visualization
    const drawSleepWaveform = useCallback(() => {
        if (!sleepCanvasRef.current || !audioContextRef.current || !sleepMode) return

        // Create or get analyser
        if (!sleepAnalyserRef.current) {
            sleepAnalyserRef.current = audioContextRef.current.createAnalyser()
            sleepAnalyserRef.current.fftSize = 512
            sleepAnalyserRef.current.smoothingTimeConstant = 0.85
        }

        const canvas = sleepCanvasRef.current
        const ctx = canvas.getContext('2d')
        const analyser = sleepAnalyserRef.current
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        const draw = () => {
            if (!sleepMode) return
            sleepAnimationRef.current = requestAnimationFrame(draw)
            analyser.getByteFrequencyData(dataArray)

            // Clear with slight fade for trail effect
            ctx.fillStyle = 'rgba(5, 5, 10, 0.2)'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            const time = Date.now() * 0.002

            // Calculate audio reactivity metrics
            let bass = 0, mid = 0, high = 0
            for (let i = 0; i < bufferLength; i++) {
                const val = dataArray[i]
                if (i < bufferLength * 0.1) bass += val
                else if (i < bufferLength * 0.5) mid += val
                else high += val
            }
            bass = (bass / (bufferLength * 0.1)) / 255
            mid = (mid / (bufferLength * 0.4)) / 255
            high = (high / (bufferLength * 0.5)) / 255

            // Draw organic liquid layers
            const drawLiquidLayer = (color, offset, speed, amplitudeMod, frequency) => {
                ctx.beginPath()
                ctx.fillStyle = color

                // Start drawing wave from left
                ctx.moveTo(0, canvas.height)

                for (let x = 0; x <= canvas.width; x += 2) {
                    // Normalize x
                    const nX = x / canvas.width

                    // Complex wave function for organic feel
                    const wave1 = Math.sin(nX * frequency + time * speed + offset)
                    const wave2 = Math.cos(nX * frequency * 2.5 - time * speed * 0.5) * 0.5
                    const wave3 = Math.sin(nX * frequency * 0.5 + time * 0.2) * 0.3

                    // Modulate height based on audio tiers
                    const audioMod = (bass * 0.6 + mid * 0.3 + high * 0.1) * amplitudeMod

                    const y = canvas.height * (0.6 - audioMod * 0.4) + // Base height rises with volume
                        (wave1 + wave2 + wave3) * (30 + bass * 50) // Wave height varying with bass

                    ctx.lineTo(x, y)
                }

                ctx.lineTo(canvas.width, canvas.height)
                ctx.lineTo(0, canvas.height)
                ctx.fill()
            }

            // Draw 4 distinct layers for depth
            // Deep purple base
            drawLiquidLayer('rgba(88, 28, 135, 0.4)', 0, 1.0, 0.8, 3)

            // Mid violet
            drawLiquidLayer('rgba(124, 58, 237, 0.3)', 2, 1.5, 0.9, 5)

            // Bright cyan/blue highlights
            drawLiquidLayer('rgba(6, 182, 212, 0.25)', 4, 2.0, 1.0, 7)

            // White/blue glow top surface
            ctx.shadowBlur = 20
            ctx.shadowColor = 'rgba(139, 92, 246, 0.5)'
            drawLiquidLayer('rgba(167, 139, 250, 0.15)', 1, 2.5, 1.1, 4)
            ctx.shadowBlur = 0

            // Floating Particles (Simulating bubbles/sparkles)
            for (let i = 0; i < 20; i++) {
                const pTime = time * 0.5 + i * 100
                const x = (Math.sin(i * 123.45 + pTime * 0.5) * 0.5 + 0.5) * canvas.width

                // Y position modulated by wave height at that X
                const waveY = canvas.height * 0.6 + Math.sin(x * 0.01 + time) * 20
                const y = waveY - (Math.tan(pTime * 0.8 + i) * 0.5 + 0.5) * 100 - (bass * 100)

                if (y < canvas.height && y > 0) {
                    const size = (Math.sin(pTime * 2 + i) * 0.5 + 0.5) * 3 + (high * 5)
                    ctx.beginPath()
                    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + high * 0.7})`
                    ctx.arc(x, y, size, 0, Math.PI * 2)
                    ctx.fill()
                }
            }
        }

        draw()
    }, [sleepMode])

    // Start sleep visualization when entering sleep mode
    useEffect(() => {
        if (sleepMode && isPlaying) {
            initAudioEffects()
            drawSleepWaveform()
        }
        return () => {
            if (sleepAnimationRef.current) {
                cancelAnimationFrame(sleepAnimationRef.current)
            }
        }
    }, [sleepMode, isPlaying, drawSleepWaveform, initAudioEffects])

    // Handle Escape key to exit sleep mode
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && sleepMode) {
                setSleepMode(false)
                if (audioRef.current) audioRef.current.volume = 1.0
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [sleepMode])

    return (
        <div className="app">
            <VideoBackground />

            {/* Header */}
            <header className="header">
                <div className="logo">
                    <div className="logo-icon">🎧</div>
                    <span className="logo-text">ASMR Reader</span>
                </div>
                <div className="header-status">
                    {gpuBackend && (
                        <div className="gpu-badge">
                            <span className="gpu-icon">⚡</span>
                            {gpuBackend === 'webgpu' ? 'GPU Accelerated' : 'WASM'}
                        </div>
                    )}
                    <div className={`status-badge ${modelStatus}`}>
                        <span className="status-dot"></span>
                        {modelStatus === 'loading' && `Loading AI ${Math.min(100, Math.round(modelProgress))}%`}
                        {modelStatus === 'ready' && (gpuBackend === 'webspeech' ? 'Web Speech' : 'AI Ready')}
                        {modelStatus === 'error' && 'Using Fallback'}
                    </div>
                </div>
            </header>

            {/* Non-blocking loading banner */}
            {modelStatus === 'loading' && modelProgress < 100 && (
                <div className="loading-banner">
                    <span>🧠 Loading Kokoro AI model in background ({modelProgress}%)... Using Web Speech for now.</span>
                    <div className="mini-progress">
                        <div className="mini-fill" style={{ width: `${modelProgress}%` }}></div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="main-content">
                {/* Left Panel - PDF & Text */}
                <div className="left-panel">
                    {!pdfText ? (
                        <div className="welcome-section">
                            <WelcomeHero />

                            <UrlInput
                                onFetch={(url) => { setWikipediaUrl(url); handleWikipediaFetch(); }}
                                isLoading={isFetchingWikipedia}
                            />
                            {wikipediaError && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl mb-8 flex items-center gap-3">
                                    <span>⚠️</span>
                                    <span>{wikipediaError}</span>
                                </div>
                            )}

                            <AudiobookShelf
                                currentAudio={audioUrl}
                                onPlay={(book) => {
                                    if (audioRef.current) {
                                        audioRef.current.pause()
                                        audioRef.current.currentTime = 0
                                    }
                                    setAudioUrl(book.file)
                                    setPlayingSample(book.title)
                                    setTimeout(() => {
                                        if (audioRef.current) {
                                            audioRef.current.src = book.file
                                            initAudioEffects()
                                            audioRef.current.play()
                                            drawWaveform()
                                            setIsPlaying(true)
                                            if (sleepMode) drawSleepWaveform()
                                        }
                                    }, 100)
                                }}
                            />

                            <div className="content-divider">
                                <span>or</span>
                            </div>

                            <div
                                className={`upload-zone ${dragOver ? 'dragover' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <div className="upload-icon">📄</div>
                                <p className="upload-text">
                                    <strong>Drop PDF, TXT, or Background Media</strong>
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.txt,image/*,video/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleFileUpload(e.target.files[0])}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="text-editor glass-card fade-in">
                            <div className="text-editor-header">
                                <span className="text-editor-title">📖 Extracted Text</span>
                                <button
                                    onClick={() => { setPdfText(''); setAudioReady(false); setAudioUrl(null) }}
                                    className="clear-btn"
                                >
                                    ✕ Clear
                                </button>
                            </div>
                            <textarea
                                className="text-editor-content"
                                value={pdfText}
                                onChange={(e) => setPdfText(e.target.value)}
                                placeholder="Edit your text here..."
                            />
                        </div>
                    )
                    }

                    {/* Audio Player */}
                    {
                        audioReady && (
                            <div className="audio-player glass-card fade-in">
                                <div className="waveform-container">
                                    <canvas ref={canvasRef} className="waveform-canvas" />
                                </div>
                                <div className="player-controls">
                                    <div className="squishy-toggle small">
                                        <input
                                            type="checkbox"
                                            id="main-play-toggle"
                                            checked={isPlaying}
                                            onChange={togglePlayback}
                                        />
                                        <label htmlFor="main-play-toggle" className="squishy-button">
                                            <span className="squishy-label">{isPlaying ? '⏸' : '▶'}</span>
                                        </label>
                                    </div>
                                    <span className="time-display">{currentTime}</span>
                                    <div className="progress-bar" onClick={handleProgressClick}>
                                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                    <span className="time-display">{duration}</span>
                                    <button className="download-btn" onClick={handleDownload} title="Download">
                                        ⬇️
                                    </button>
                                </div>
                                <audio
                                    ref={audioRef}
                                    onTimeUpdate={handleTimeUpdate}
                                    onLoadedMetadata={handleLoadedMetadata}
                                    onEnded={handleEnded}
                                />
                            </div>
                        )
                    }
                </div >

                {/* Right Panel - Controls */}
                < aside className="sidebar" >
                    {/* Voice Selection */}
                    < div className="glass-card" >
                        <div className="section-header">
                            <span className="section-icon">🎤</span>
                            <h3 className="section-title">Select Voice</h3>
                        </div>
                        <div className="voice-selector">
                            {VOICE_LIST.map((voice) => (
                                <div
                                    key={voice.id}
                                    className={`voice-card ${selectedVoice.id === voice.id ? 'active' : ''}`}
                                    onClick={() => setSelectedVoice(voice)}
                                >
                                    <div className="voice-avatar">{voice.emoji}</div>
                                    <div className="voice-info">
                                        <div className="voice-name">{voice.name}</div>
                                        <div className="voice-description">{voice.description}</div>
                                    </div>
                                    <button
                                        className={`voice-preview ${previewingVoice === voice.id ? 'active' : ''}`}
                                        onClick={(e) => handleVoicePreview(voice, e)}
                                        disabled={modelStatus !== 'ready'}
                                        title="Preview voice"
                                    >
                                        {previewingVoice === voice.id ? '⏹' : '▶'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div >

                    {/* Basic Controls */}
                    < div className="glass-card" >
                        <div className="section-header">
                            <span className="section-icon">🎚️</span>
                            <h3 className="section-title">Basic Controls</h3>
                        </div>
                        <div className="asmr-controls">
                            <div className="control-group">
                                <LiquidSlider
                                    label="Pitch"
                                    min={0.5}
                                    max={1.5}
                                    step={0.05}
                                    value={pitch}
                                    onChange={(val) => setPitch(parseFloat(val))}
                                    unit="x"
                                />
                            </div>
                            <div className="control-group">
                                <LiquidSlider
                                    label="Speed"
                                    min={0.5}
                                    max={1.5}
                                    step={0.05}
                                    value={speed}
                                    onChange={(val) => setSpeed(parseFloat(val))}
                                    unit="x"
                                />
                            </div>
                        </div>
                    </div >

                    {/* Advanced Settings Toggle */}
                    < button
                        className="advanced-toggle"
                        onClick={async () => {
                            const newState = !showAdvanced
                            setShowAdvanced(newState)
                            // Lazy load custom voices when opening advanced mode
                            if (newState && !areCustomVoicesLoaded()) {
                                setLoadingCustomVoices(true)
                                try {
                                    await loadCustomVoices()
                                    setCustomVoices(getCustomVoices())
                                } catch (e) {
                                    console.error('Failed to load custom voices:', e)
                                } finally {
                                    setLoadingCustomVoices(false)
                                }
                            }
                        }}
                    >
                        <span>🎛️ Advanced Settings</span>
                        <span className={`toggle-arrow ${showAdvanced ? 'open' : ''}`}>▼</span>
                    </button >

                    {/* Advanced Producer Deck */}
                    {
                        showAdvanced && (
                            <div className="producer-deck glass-card fade-in">
                                {/* Custom F5-TTS Voices */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🎤 Custom Voice Embeddings</h4>
                                    {loadingCustomVoices ? (
                                        <div className="loading-voices">
                                            <div className="spinner-small" />
                                            Loading custom voices...
                                        </div>
                                    ) : customVoices.length > 0 ? (
                                        <div className="custom-voices-grid">
                                            {customVoices.map((voice) => (
                                                <button
                                                    key={voice.id}
                                                    className={`custom-voice-btn ${selectedVoice.id === voice.id ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setSelectedVoice(voice)
                                                        setSelectedKokoroVoice(voice.kokoroVoice)
                                                    }}
                                                    title={`${voice.description}\nKokoro: ${voice.kokoroVoice}`}
                                                >
                                                    <span className="voice-emoji">{voice.emoji}</span>
                                                    <span className="voice-label">{voice.name}</span>
                                                    <span className="voice-tag">F5-TTS</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="no-custom-voices">No custom voice embeddings found</p>
                                    )}
                                </div>

                                {/* Kokoro Voice Override */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🔊 Kokoro Voice Override</h4>
                                    <select
                                        className="kokoro-select"
                                        value={selectedKokoroVoice || selectedVoice.kokoroVoice || ''}
                                        onChange={(e) => setSelectedKokoroVoice(e.target.value)}
                                    >
                                        <option value="">Use Profile Default</option>
                                        <optgroup label="American Female">
                                            {ALL_KOKORO_VOICES.filter(v => v.accent === 'american' && v.gender === 'female').map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="American Male">
                                            {ALL_KOKORO_VOICES.filter(v => v.accent === 'american' && v.gender === 'male').map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="British Female">
                                            {ALL_KOKORO_VOICES.filter(v => v.accent === 'british' && v.gender === 'female').map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="British Male">
                                            {ALL_KOKORO_VOICES.filter(v => v.accent === 'british' && v.gender === 'male').map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                {/* Presets */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🎨 Audio Presets</h4>
                                    <div className="preset-grid">
                                        {Object.entries(AUDIO_PRESETS).map(([key, preset]) => (
                                            <button
                                                key={key}
                                                className={`preset-btn ${selectedPreset === key ? 'active' : ''}`}
                                                onClick={() => applyPreset(key)}
                                            >
                                                {preset.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 7-Band EQ */}
                                <div className="deck-section">
                                    <h4 className="deck-title">📊 7-Band Equalizer</h4>
                                    <div className="eq-container">
                                        {['sub', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'brilliance'].map((band, i) => (
                                            <div key={band} className="eq-band">
                                                <input
                                                    type="range"
                                                    className="eq-slider"
                                                    min="-12"
                                                    max="12"
                                                    step="0.5"
                                                    value={eqSettings[band]}
                                                    onChange={(e) => updateEQ(band, parseFloat(e.target.value))}
                                                    orient="vertical"
                                                />
                                                <span className="eq-value">{eqSettings[band] > 0 ? '+' : ''}{eqSettings[band]}dB</span>
                                                <span className="eq-label">{['60', '150', '400', '1k', '2.5k', '5k', '10k'][i]}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Compressor */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🔊 Compressor</h4>
                                    <div className="comp-grid">
                                        <div className="comp-control">
                                            <label>Threshold</label>
                                            <input
                                                type="range"
                                                min="-60"
                                                max="0"
                                                value={compSettings.threshold}
                                                onChange={(e) => setCompSettings(p => ({ ...p, threshold: +e.target.value }))}
                                            />
                                            <span>{compSettings.threshold}dB</span>
                                        </div>
                                        <div className="comp-control">
                                            <label>Ratio</label>
                                            <input
                                                type="range"
                                                min="1"
                                                max="20"
                                                value={compSettings.ratio}
                                                onChange={(e) => setCompSettings(p => ({ ...p, ratio: +e.target.value }))}
                                            />
                                            <span>{compSettings.ratio}:1</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Reverb & Spatial */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🌊 Reverb & Spatial</h4>
                                    <div className="spatial-grid">
                                        <div className="spatial-control">
                                            <label>Reverb Mix</label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={reverbMix}
                                                onChange={(e) => {
                                                    setReverbMix(+e.target.value)
                                                    audioEffectsRef.current?.setReverbMix(+e.target.value)
                                                }}
                                            />
                                            <span>{Math.round(reverbMix * 100)}%</span>
                                        </div>
                                        <div className="spatial-control">
                                            <label>Stereo Width</label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="2"
                                                step="0.1"
                                                value={stereoWidth}
                                                onChange={(e) => setStereoWidth(+e.target.value)}
                                            />
                                            <span>{stereoWidth.toFixed(1)}</span>
                                        </div>
                                        <div className="spatial-control">
                                            <label>Pan</label>
                                            <input
                                                type="range"
                                                min="-1"
                                                max="1"
                                                step="0.1"
                                                value={pan}
                                                onChange={(e) => {
                                                    setPan(+e.target.value)
                                                    audioEffectsRef.current?.setPan(+e.target.value)
                                                }}
                                            />
                                            <span>{pan === 0 ? 'C' : pan < 0 ? `L${Math.abs(pan * 100).toFixed(0)}` : `R${(pan * 100).toFixed(0)}`}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Master */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🎚️ Master</h4>
                                    <div className="master-control">
                                        <label>Output Gain</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.05"
                                            value={masterGain}
                                            onChange={(e) => {
                                                setMasterGain(+e.target.value)
                                                audioEffectsRef.current?.setMasterGain(+e.target.value)
                                            }}
                                        />
                                        <span>{(masterGain * 100).toFixed(0)}%</span>
                                    </div>
                                </div>

                                {/* Atmosphere & Theme */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🎨 Atmosphere & Theme</h4>
                                    <div className="atmosphere-grid">
                                        <div className="theme-control">
                                            <label>Primary Color</label>
                                            <input
                                                type="color"
                                                defaultValue={themeManager.theme.colors.primary}
                                                onChange={(e) => themeManager.updateColor('primary', e.target.value)}
                                            />
                                        </div>
                                        <div className="theme-control">
                                            <label>Accent Color</label>
                                            <input
                                                type="color"
                                                defaultValue={themeManager.theme.colors.accent}
                                                onChange={(e) => themeManager.updateColor('accent', e.target.value)}
                                            />
                                        </div>
                                        <div className="theme-control">
                                            <label>Surface Color</label>
                                            <div className="color-picker-wrapper">
                                                <input
                                                    type="color"
                                                    defaultValue={themeManager.theme.colors.surface || '#0f172a'}
                                                    onChange={(e) => themeManager.updateColor('surface', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="theme-control wide">
                                            <LiquidSlider
                                                label="Backdrop Opacity"
                                                min={0}
                                                max={1}
                                                step={0.05}
                                                value={themeManager.theme.colors.backdrop_opacity}
                                                onChange={(val) => themeManager.updateColor('backdrop_opacity', parseFloat(val))}
                                                unit=""
                                            />
                                        </div>
                                        <button
                                            className="reset-theme-btn"
                                            onClick={() => {
                                                themeManager.reset()
                                                window.location.reload() // Simple way to refresh completely
                                            }}
                                        >
                                            ↺ Reset Theme
                                        </button>
                                    </div>
                                    <p className="theme-hint">
                                        * Drag & Drop any Image or Video to set a custom background!
                                    </p>
                                </div>

                                {/* Sleep Mode Demo Launch */}
                                <div className="deck-section">
                                    <h4 className="deck-title">🌙 Sleep Mode Demo</h4>
                                    <button
                                        className="sleep-mode-toggle"
                                        onClick={() => {
                                            setSleepMode(true)
                                            // Ensure volume is appropriate
                                            if (audioRef.current) audioRef.current.volume = sleepModeVolume
                                        }}
                                    >
                                        <span className="sleep-btn-text">Launch Sleep Demo</span>
                                        <div className="sleep-btn-progress"></div>
                                    </button>
                                    <p className="sleep-hint" style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                                        Experience the ambient mode without generating audio
                                    </p>
                                </div>
                            </div>
                        )
                    }

                    {/* Generate Button */}
                    <button
                        className={`generate-button liquid-glass-btn ${isGenerating ? 'loading' : ''}`}
                        onClick={handleGenerate}
                        disabled={!pdfText.trim() || isGenerating || modelStatus !== 'ready'}
                    >
                        {isGenerating ? (
                            <>
                                <div className="spinner" />
                                Generating... {generateProgress.toFixed(0)}%
                            </>
                        ) : (
                            <>
                                ✨ Generate ASMR Audio
                            </>
                        )}
                    </button>

                    {/* Sleep Mode Toggle Button */}
                    {
                        audioReady && (
                            <button
                                className={`sleep-mode-toggle ${sleepModeActivating ? 'activating' : ''} ${sleepMode ? 'active' : ''}`}
                                onClick={toggleSleepMode}
                                disabled={sleepModeActivating}
                            >
                                <span className="sleep-btn-text">
                                    {sleepMode ? '☀️ Exit Sleep Mode' : '🌙 Sleep Mode'}
                                </span>
                                <div className="sleep-btn-progress">
                                    <div className="sleep-btn-progress-fill" />
                                </div>
                                <svg className="sleep-btn-check" viewBox="0 0 24 24">
                                    <path className="check-path" d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" strokeWidth="2" />
                                </svg>
                            </button>
                        )
                    }
                </aside >
            </main >

            {/* Sleep Mode Overlay */}
            {
                sleepMode && (
                    <div className="sleep-mode-overlay">
                        <div className="sleep-mode-content">
                            {/* Exit Button */}
                            <button className="sleep-exit-btn" onClick={() => {
                                setSleepMode(false)
                                if (audioRef.current) audioRef.current.volume = 1.0
                            }}>
                                <span>✕</span>
                            </button>

                            {/* Title */}
                            <div className="sleep-header">
                                <h2 className="sleep-title">🌙 Sleep Mode</h2>
                                <p className="sleep-subtitle">Relax with ambient audio visualization</p>
                            </div>

                            {/* AI Waveform Visualization Canvas */}
                            <div className="sleep-waveform-container">
                                <canvas
                                    ref={sleepCanvasRef}
                                    className="sleep-waveform-canvas"
                                    width={800}
                                    height={200}
                                />
                            </div>

                            {/* Volume Display */}
                            <div className="sleep-volume-display">
                                <span className="volume-label">Volume</span>
                                <span className="volume-value">{Math.round(sleepModeVolume * 100)}%</span>
                            </div>

                            {/* Squishy Volume Controls */}
                            <div className="sleep-controls">
                                {/* Volume Down - Squishy Button */}
                                <div className="squishy-toggle">
                                    <input
                                        type="checkbox"
                                        id="vol-down"
                                        onChange={() => adjustSleepVolume(-0.1)}
                                    />
                                    <label htmlFor="vol-down" className="squishy-button">
                                        <span className="squishy-label">−</span>
                                    </label>
                                </div>

                                {/* Play/Pause - Large Center Button */}
                                <div className="squishy-toggle large">
                                    <input
                                        type="checkbox"
                                        id="sleep-play"
                                        checked={isPlaying || !!playingSample}
                                        onChange={(e) => {
                                            if (playingSample) {
                                                // Determine which sample object to toggle based on name
                                                const sampleObj = [
                                                    { name: 'Asian Female', file: '/voices/asian_female_reference.wav' },
                                                    { name: 'American Casual', file: '/voices/american_casual_female_reference.wav' },
                                                    { name: 'Russian Elegance', file: '/voices/russian_high_class_girl_reference.wav' },
                                                    { name: 'Formal Male', file: '/voices/formal_english_male_reference.wav' }
                                                ].find(s => s.name === playingSample);

                                                if (sampleObj) {
                                                    handleSamplePlay(sampleObj, { stopPropagation: () => { } });
                                                }
                                            } else {
                                                togglePlayback();
                                            }
                                        }}
                                    />
                                    <label htmlFor="sleep-play" className="squishy-button">
                                        <span className="squishy-label">{(isPlaying || !!playingSample) ? '⏸' : '▶'}</span>
                                    </label>
                                </div>

                                {/* Volume Up - Squishy Button */}
                                <div className="squishy-toggle">
                                    <input
                                        type="checkbox"
                                        id="vol-up"
                                        onChange={() => adjustSleepVolume(0.1)}
                                    />
                                    <label htmlFor="vol-up" className="squishy-button">
                                        <span className="squishy-label">+</span>
                                    </label>
                                </div>
                            </div>

                            {/* Sleep Mode Samples List */}
                            <div className="sleep-samples-list">
                                <h4 className="sleep-samples-title">🎵 Ambient Voice Samples</h4>
                                <div className="sleep-samples-grid">
                                    {[
                                        { name: 'Asian Female', file: '/voices/asian_female_reference.wav', emoji: '🌸' },
                                        { name: 'American Casual', file: '/voices/american_casual_female_reference.wav', emoji: '🎧' },
                                        { name: 'Russian Elegance', file: '/voices/russian_high_class_girl_reference.wav', emoji: '❄️' },
                                        { name: 'Formal Male', file: '/voices/formal_english_male_reference.wav', emoji: '🎙️' }
                                    ].map((demo) => (
                                        <div key={demo.name} className="demo-item-container sleep-demo-item">
                                            <div className="squishy-toggle small">
                                                <input
                                                    type="checkbox"
                                                    id={`sleep-demo-${demo.name}`}
                                                    checked={playingSample === demo.name}
                                                    onChange={(e) => handleSamplePlay(demo, e)}
                                                />
                                                <label htmlFor={`sleep-demo-${demo.name}`} className="squishy-button">
                                                    <span className="squishy-label">
                                                        {playingSample === demo.name ? '⏸' : '▶'}
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="demo-info">
                                                <span className="demo-emoji">{demo.emoji}</span>
                                                <span className="demo-name">{demo.name}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Hint */}
                            <p className="sleep-hint">Press ESC to exit</p>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
