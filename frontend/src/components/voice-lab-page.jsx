import { useState, useRef, useEffect } from 'react'
import { VoiceAnalyzer } from '../lib/voice-analyzer'
import { VoiceMapper } from '../lib/voice-mapper'
import { VoiceLabBackground } from './voice-lab-background'

export function VoiceLabPage({ onBack, onVoiceCreated }) {
    const [step, setStep] = useState('upload') // upload, scanning, result
    const [file, setFile] = useState(null)
    const [analysis, setAnalysis] = useState(null)
    const [mapping, setMapping] = useState(null)
    const [voiceName, setVoiceName] = useState('')
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

    // File inputs
    const mp3InputRef = useRef(null)
    const jsonInputRef = useRef(null)

    // Parallax effect
    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({
                x: (e.clientX / window.innerWidth - 0.5) * 5,
                y: (e.clientY / window.innerHeight - 0.5) * 5
            })
        }
        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    const handleJsonUpload = (uploadedFile) => {
        if (!uploadedFile) return

        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result)
                // Validate minimal structure
                if (config.kokoroVoice && config.characteristics) {
                    setStep('result')
                    setVoiceName(config.name || 'Imported Voice')
                    setMapping({
                        kokoroId: config.kokoroVoice,
                        settings: {
                            pitch: config.defaultPitch || 1.0,
                            speed: config.defaultSpeed || 1.0
                        }
                    })
                    setAnalysis({
                        ...config.characteristics,
                        estimated_pitch: 0 // Unknown for imported configs
                    })
                    // Mock file for display
                    setFile({ name: 'Config File' })
                } else {
                    alert('Invalid Voice Configuration File')
                }
            } catch (err) {
                console.error('Failed to parse voice config', err)
                alert('Error reading configuration file')
            }
        }
        reader.readAsText(uploadedFile)
    }

    const handleMp3Upload = async (uploadedFile) => {
        if (!uploadedFile) return

        setFile(uploadedFile)
        setVoiceName(uploadedFile.name.replace(/\.[^/.]+$/, ""))
        setStep('scanning')

        try {
            const analyzer = new VoiceAnalyzer()
            const result = await analyzer.analyze(uploadedFile)
            setAnalysis(result)

            // Artificial delay for dramatic effect
            setTimeout(() => {
                const mapResult = VoiceMapper.mapToKokoro(result, uploadedFile.name)
                setMapping(mapResult)
                setStep('result')
            }, 2500)

        } catch (e) {
            console.error(e)
            alert('Failed to analyze audio. Please try a different file.')
            setStep('upload')
        }
    }

    const handleExport = () => {
        if (!mapping || !analysis) return

        const config = {
            id: `exported_${Date.now()}`,
            name: voiceName,
            description: `Exported Identity • ${mapping.kokoroId}`,
            emoji: '💾',
            kokoroVoice: mapping.kokoroId,
            defaultPitch: mapping.settings.pitch,
            defaultSpeed: mapping.settings.speed,
            isCustom: true,
            characteristics: {
                warmth: analysis.warmth,
                breathiness: analysis.breathiness,
                clarity: analysis.clarity
            }
        }

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `voice-identity-${voiceName.toLowerCase().replace(/\s+/g, '-')}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleSave = () => {
        if (!analysis || !mapping) return

        const newVoice = {
            id: `custom_${Date.now()}`,
            name: voiceName,
            description: `Neural Clone • ${mapping.kokoroId} • ${mapping.settings.pitch}x Pitch`,
            emoji: '🧬',
            kokoroVoice: mapping.kokoroId,
            defaultPitch: mapping.settings.pitch,
            defaultSpeed: mapping.settings.speed,
            isCustom: true,
            characteristics: {
                warmth: analysis.warmth,
                breathiness: analysis.breathiness,
                clarity: analysis.clarity
            },
            // Create Object URL only if we have a valid file with a type
            // Note: Object URLs should be revoked when no longer needed to prevent memory leaks
            referenceClip: file && file.type ? URL.createObjectURL(file) : null,
            // We'll need to revoke this URL when the voice is removed from the list
            _revokeClip: function () { if (this.referenceClip) URL.revokeObjectURL(this.referenceClip) }
        }

        onVoiceCreated(newVoice)
        onBack()
    }

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white font-mono selection:bg-cyan-500/30">
            {/* Super Graphics Background */}
            <VoiceLabBackground />

            {/* HUD Overlay with Parallax */}
            <div
                className="relative z-10 flex flex-col h-screen p-8 pointer-events-none transition-transform duration-100 ease-out"
                style={{ transform: `translate(${mousePos.x}px, ${mousePos.y}px)` }}
            >

                {/* Top Bar */}
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="flex flex-col group">
                        <h1 className="text-5xl font-bold tracking-tighter uppercase mb-2 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                            Voice Lab <span className="text-cyan-400 text-sm align-top opacity-0 group-hover:opacity-100 transition-opacity duration-300">GPU</span>
                        </h1>
                        <div className="flex gap-4 text-[10px] text-cyan-300/60 uppercase tracking-widest font-semibold">
                            <span className="flex items-center gap-1"><span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span> Sys: Online</span>
                            <span className="text-white/20">|</span>
                            <span>GPU: Unhinged Mode</span>
                            <span className="text-white/20">|</span>
                            <span>Renderer: WebGL 2.0</span>
                        </div>
                    </div>
                    <button
                        onClick={onBack}
                        className="group relative px-8 py-3 bg-black/40 backdrop-blur-md overflow-hidden transition-all hover:bg-cyan-950/30 border-l-2 border-cyan-500/50"
                    >
                        <div className="absolute inset-0 bg-cyan-500/10 translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                        <span className="relative flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-cyan-100 group-hover:text-white transition-colors">
                            <span className="group-hover:-translate-x-1 transition-transform">←</span> Return to Deck
                        </span>
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex items-center justify-center pointer-events-auto perspective-[1000px]">

                    {step === 'upload' && (
                        <div className="flex gap-10 items-stretch h-[420px]">

                            {/* Card 1: JSON Import */}
                            <div
                                className="w-[380px] relative group cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 transform-gpu preserve-3d"
                                onClick={() => jsonInputRef.current?.click()}
                            >
                                <div className="absolute inset-0 bg-black/30 backdrop-blur-md border border-white/5 group-hover:bg-cyan-950/30 transition-colors shadow-2xl rounded-xl overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </div>

                                <input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={(e) => handleJsonUpload(e.target.files[0])} />

                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                                    <div className="text-6xl mb-6 text-white/20 group-hover:text-purple-400 group-hover:scale-110 transition-all duration-500 ease-out">
                                        💾
                                    </div>
                                    <h2 className="text-2xl font-bold uppercase tracking-[0.2em] mb-2 text-white drop-shadow-md group-hover:text-purple-200">Load Profile</h2>
                                    <div className="w-12 h-[2px] bg-purple-500/50 mb-4"></div>
                                    <p className="text-xs text-cyan-200/50 max-w-[200px] leading-relaxed">
                                        Import existing voice configuration via <span className="text-purple-400 font-bold">JSON</span>.
                                    </p>
                                    <div className="mt-8 px-6 py-2 border border-purple-500/30 rounded-full text-[10px] uppercase tracking-widest text-purple-300 group-hover:bg-purple-500/20 transition-all">
                                        Select File
                                    </div>
                                </div>
                            </div>

                            {/* Divider with OR */}
                            <div className="flex flex-col items-center justify-center">
                                <div className="h-full w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                                <div className="py-4 text-xs font-bold text-white/30 uppercase tracking-widest bg-black/50 backdrop-blur-xl rounded p-2 border border-white/5 z-10 my-2">OR</div>
                                <div className="h-full w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                            </div>

                            {/* Card 2: MP3 Analysis */}
                            <div
                                className="w-[380px] relative group cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 transform-gpu preserve-3d"
                                onClick={() => mp3InputRef.current?.click()}
                            >
                                <div className="absolute inset-0 bg-black/30 backdrop-blur-md border border-white/5 group-hover:bg-cyan-950/30 transition-colors shadow-2xl rounded-xl overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </div>

                                <input type="file" ref={mp3InputRef} className="hidden" accept="audio/*" onChange={(e) => handleMp3Upload(e.target.files[0])} />

                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                                    <div className="text-6xl mb-6 text-white/20 group-hover:text-cyan-400 group-hover:rotate-[360deg] transition-all duration-1000 ease-out">
                                        🧬
                                    </div>
                                    <h2 className="text-2xl font-bold uppercase tracking-[0.2em] mb-2 text-white drop-shadow-md group-hover:text-cyan-200">Neural Clone</h2>
                                    <div className="w-12 h-[2px] bg-cyan-500/50 mb-4"></div>
                                    <p className="text-xs text-cyan-200/50 max-w-[200px] leading-relaxed">
                                        Analyze audio samples to extract vocal identity from <span className="text-cyan-400 font-bold">MP3/WAV</span>.
                                    </p>
                                    <div className="mt-8 px-6 py-2 border border-cyan-500/30 rounded-full text-[10px] uppercase tracking-widest text-cyan-300 group-hover:bg-cyan-500/20 transition-all">
                                        Initiate Scan
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'scanning' && (
                        <div className="flex flex-col items-center justify-center w-[500px] h-[500px]">
                            <div className="relative w-80 h-80 mb-10 transform-gpu preserve-3d animate-[float_4s_ease-in-out_infinite]">
                                {/* Complex Ring Animation */}
                                <div className="absolute inset-0 border border-cyan-500/20 rounded-full animate-[spin_8s_linear_infinite]" style={{ transform: 'rotateX(60deg)' }}></div>
                                <div className="absolute inset-4 border border-t-transparent border-cyan-400/40 rounded-full animate-[spin_3s_linear_infinite]" style={{ transform: 'rotateY(60deg)' }}></div>
                                <div className="absolute inset-10 border border-t-transparent border-l-transparent border-cyan-300/60 rounded-full animate-[spin_5s_linear_infinite_reverse]"></div>

                                {/* Core */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-6xl animate-pulse grayscale brightness-200 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">🧠</div>
                                </div>
                            </div>
                            <h2 className="text-2xl font-bold uppercase tracking-[0.3em] animate-pulse text-cyan-100">Neural Analysis</h2>
                            <div className="mt-6 font-mono text-xs w-full max-w-xs space-y-2">
                                <div className="flex justify-between text-cyan-300/40">
                                    <span>PITCH_HARMONICS</span>
                                    <span className="text-cyan-400 typewriter">DETECTED</span>
                                </div>
                                <div className="flex justify-between text-cyan-300/40">
                                    <span>SPECTRAL_CENTROID</span>
                                    <span className="text-cyan-400">CALCULATING...</span>
                                </div>
                                <div className="w-full h-[1px] bg-cyan-900/50 my-2"></div>
                                <div className="text-right text-[10px] text-cyan-500 animate-pulse">PROCESSING...</div>
                            </div>
                        </div>
                    )}

                    {step === 'result' && analysis && mapping && (
                        <div className="grid grid-cols-2 gap-12 w-full max-w-6xl items-center animate-in fade-in zoom-in duration-500 perspective-[2000px]">

                            {/* Left: Input Stats Card */}
                            <div className="space-y-6 transform transition-transform hover:translate-z-10 preserve-3d">
                                <div className="p-8 border-l-2 border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 to-transparent backdrop-blur-sm relative overflow-hidden shadow-2xl rounded-r-xl">
                                    <div className="absolute top-0 right-0 p-2 text-cyan-500/20 text-6xl font-bold opacity-20 -rotate-12 select-none">DATA</div>

                                    <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 mb-4 font-bold">Bio-Metric Analysis</div>

                                    <div className="flex justify-between items-end mb-8">
                                        <div>
                                            <div className="text-5xl font-bold text-white tracking-tighter shadow-cyan- glow">{Math.round(analysis.estimated_pitch)} <span className="text-lg text-cyan-500/50 font-normal">Hz</span></div>
                                            <div className="text-[10px] text-cyan-300/40 uppercase tracking-widest mt-1">Fundamental Frequency</div>
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        {[
                                            { label: 'Warmth', val: analysis.warmth },
                                            { label: 'Clarity', val: analysis.clarity },
                                            { label: 'Breathiness', val: analysis.breathiness }
                                        ].map(m => (
                                            <div key={m.label} className="group">
                                                <div className="flex justify-between text-[10px] uppercase tracking-widest mb-2 text-cyan-200/70 group-hover:text-cyan-100 transition-colors">
                                                    <span>{m.label}</span>
                                                    <span>{(m.val * 100).toFixed(1)}%</span>
                                                </div>
                                                <div className="h-1 bg-white/5 w-full overflow-hidden relative">
                                                    <div
                                                        className="h-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] relative"
                                                        style={{ width: `${m.val * 100}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-8 border-l-2 border-white/10 bg-black/20 backdrop-blur-sm rounded-r-xl">
                                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3">Identity Designation</div>
                                    <input
                                        type="text"
                                        value={voiceName}
                                        onChange={(e) => setVoiceName(e.target.value)}
                                        className="w-full bg-transparent border-b border-white/10 py-2 text-2xl font-bold focus:outline-none focus:border-cyan-500 transition-all uppercase tracking-tight text-white/90 placeholder:text-white/20"
                                        placeholder="ENTER_CODENAME"
                                    />
                                </div>
                            </div>

                            {/* Right: Output Model Card (Holographic 3D) */}
                            <div className="relative group preserve-3d transition-transform duration-500 hover:rotate-y-[-5deg] hover:rotate-x-[5deg]">
                                {/* Holographic Glow */}
                                <div className="absolute -inset-1 bg-gradient-to-b from-cyan-500 to-blue-600 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>

                                <div className="relative border border-white/10 bg-black/80 backdrop-blur-xl p-10 flex flex-col items-center text-center shadow-2xl rounded-2xl">
                                    {/* Card Pattern */}
                                    <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
                                    <div className="absolute top-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

                                    <div className="relative w-32 h-32 rounded-full border-2 border-cyan-500/30 flex items-center justify-center text-5xl mb-8 shadow-[0_0_50px_rgba(34,211,238,0.15)] group-hover:shadow-[0_0_80px_rgba(34,211,238,0.3)] transition-all">
                                        <div className="absolute inset-0 border border-dashed border-cyan-500/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                                        🧬
                                    </div>

                                    <div className="text-5xl font-bold mb-6 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-cyan-200">
                                        {mapping.kokoroId}
                                    </div>

                                    <div className="flex flex-col gap-3 w-full">
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setStep('upload')}
                                                className="flex-1 py-4 border border-white/10 hover:bg-white/5 uppercase text-[10px] tracking-[0.2em] transition-colors rounded-lg"
                                            >
                                                Discard
                                            </button>
                                            <button
                                                onClick={handleExport}
                                                className="flex-1 py-4 border border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400 uppercase text-[10px] tracking-[0.2em] transition-all rounded-lg"
                                            >
                                                Export JSON
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleSave}
                                            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white uppercase text-xs tracking-[0.3em] font-bold shadow-[0_0_30px_rgba(8,145,178,0.4)] hover:shadow-[0_0_50px_rgba(6,182,212,0.6)] transition-all hover:scale-[1.02] rounded-lg"
                                        >
                                            Deploy Identity
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>

                {/* Footer Status */}
                <div className="flex justify-between text-[10px] text-cyan-500/30 uppercase tracking-[0.2em] border-t border-cyan-900/20 pt-6">
                    <div>F5-TTS Neural Bridge: <span className="text-cyan-500/60">STANDBY</span></div>
                    <div className="flex gap-4">
                        <span>LATENCY: 12ms</span>
                        <span>ENCRYPTION: AES-256</span>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .preserve-3d {
                    transform-style: preserve-3d;
                }
                .rotate-y-12 {
                    transform: rotateY(12deg);
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `}</style>
        </div>
    )
}
