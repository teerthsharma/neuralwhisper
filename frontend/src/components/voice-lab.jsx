import { useState, useRef, useEffect } from 'react'
import { VoiceAnalyzer } from '../lib/voice-analyzer'
import { VoiceMapper } from '../lib/voice-mapper'
import { themeManager } from '../lib/theme-manager'

export function VoiceLab({ isOpen, onClose, onVoiceCreated }) {
    const [step, setStep] = useState('upload') // upload, analyzing, result
    const [file, setFile] = useState(null)
    const [analysis, setAnalysis] = useState(null)
    const [mapping, setMapping] = useState(null)
    const [audioUrl, setAudioUrl] = useState(null)
    const [voiceName, setVoiceName] = useState('')

    const fileInputRef = useRef(null)

    // Reset when closed
    useEffect(() => {
        if (!isOpen) {
            setStep('upload')
            setFile(null)
            setAnalysis(null)
            setAudioUrl(null)
        }
    }, [isOpen])

    const handleFileUpload = async (uploadedFile) => {
        if (!uploadedFile) return

        setFile(uploadedFile)
        setVoiceName(uploadedFile.name.replace(/\.[^/.]+$/, ""))
        setAudioUrl(URL.createObjectURL(uploadedFile))
        setStep('analyzing')

        // process
        try {
            const analyzer = new VoiceAnalyzer()
            const result = await analyzer.analyze(uploadedFile)
            setAnalysis(result)

            // Map
            const mapResult = VoiceMapper.mapToKokoro(result, uploadedFile.name)
            setMapping(mapResult)

            // Artificial delay for "processing" feel
            setTimeout(() => {
                setStep('result')
            }, 1000)

        } catch (e) {
            console.error(e)
            alert("Failed to analyze audio.")
            setStep('upload')
        }
    }

    const handleSave = () => {
        if (!analysis || !mapping) return

        const newVoice = {
            id: `custom_${Date.now()}`,
            name: voiceName,
            description: `Cloned Voice • Pitch: ${mapping.settings.pitch}x`,
            emoji: '🧬', // DNA emoji for clone
            kokoroVoice: mapping.kokoroId,
            defaultPitch: mapping.settings.pitch,
            defaultSpeed: mapping.settings.speed,
            isCustom: true,
            characteristics: {
                warmth: analysis.warmth,
                breathiness: analysis.breathiness,
                clarity: analysis.clarity
            },
            referenceClip: audioUrl
        }

        onVoiceCreated(newVoice)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900/90 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-xl">
                            🧪
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Voice Lab</h2>
                            <p className="text-xs text-white/50">Client-Side Neural Cloning</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        Close
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex-1 overflow-y-auto">

                    {step === 'upload' && (
                        <div
                            className="border-2 border-dashed border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer group"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault()
                                handleFileUpload(e.dataTransfer.files[0])
                            }}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="audio/*"
                                onChange={(e) => handleFileUpload(e.target.files[0])}
                            />
                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform duration-300">
                                🎙️
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">Drop voice sample here</h3>
                            <p className="text-sm text-white/40 max-w-xs">
                                Upload a clean recording (MP3/WAV) to clone its characteristics.
                            </p>
                            <div className="mt-6 px-4 py-2 bg-white/10 rounded-full text-xs font-mono text-purple-300">
                                Runs 100% locally
                            </div>
                        </div>
                    )}

                    {step === 'analyzing' && (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="relative w-24 h-24 mb-6">
                                <div className="absolute inset-0 border-4 border-purple-500/30 rounded-full animate-ping"></div>
                                <div className="absolute inset-0 border-4 border-t-purple-500 rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center text-2xl">
                                    🧠
                                </div>
                            </div>
                            <h3 className="text-lg font-medium text-white animate-pulse">Analyzing Voice DNA...</h3>
                            <p className="text-sm text-white/40 mt-2">Extracting pitch, timbre, and cadence</p>
                        </div>
                    )}

                    {step === 'result' && analysis && mapping && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">

                            {/* Analysis Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <div className="text-xs text-white/40 mb-1">Detected Pitch</div>
                                    <div className="text-2xl font-bold text-white flex items-end gap-2">
                                        {Math.round(analysis.estimated_pitch)} <span className="text-sm text-white/40 mb-1">Hz</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-1 mt-3 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-400" style={{ width: `${Math.min(100, (analysis.estimated_pitch / 300) * 100)}%` }}></div>
                                    </div>
                                </div>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <div className="text-xs text-white/40 mb-1">Speaking Rate</div>
                                    <div className="text-2xl font-bold text-white flex items-end gap-2">
                                        {analysis.speaking_rate}x
                                    </div>
                                    <div className="w-full bg-white/10 h-1 mt-3 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-400" style={{ width: `${analysis.speaking_rate * 50}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            {/* Match Card */}
                            <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 p-6 rounded-2xl border border-purple-500/20 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-50 text-6xl select-none">🧬</div>
                                <h3 className="text-sm text-purple-300 font-bold tracking-wider uppercase mb-4">Neural Match Found</h3>

                                <div className="flex items-center gap-6">
                                    <div className="flex-1">
                                        <div className="text-xs text-white/50 mb-1">Base Model</div>
                                        <div className="text-xl text-white font-medium">{mapping.kokoroId}</div>
                                    </div>
                                    <div className="hidden md:block w-px h-10 bg-white/10"></div>
                                    <div className="flex-1">
                                        <div className="text-xs text-white/50 mb-1">Pitch Shift</div>
                                        <div className="text-xl text-white font-medium">{mapping.settings.pitch}x</div>
                                    </div>
                                    <div className="hidden md:block w-px h-10 bg-white/10"></div>
                                    <div className="flex-1">
                                        <div className="text-xs text-white/50 mb-1">Warmth</div>
                                        <div className="text-xl text-white font-medium">{Math.round(analysis.warmth * 100)}%</div>
                                    </div>
                                </div>
                            </div>

                            {/* Voice Name Input */}
                            <div>
                                <label className="block text-sm text-white/60 mb-2">Name your Clone</label>
                                <input
                                    type="text"
                                    value={voiceName}
                                    onChange={(e) => setVoiceName(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                />
                            </div>

                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-black/20 flex justify-end gap-3">
                    {step === 'result' ? (
                        <>
                            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                                Discard
                            </button>
                            <button onClick={handleSave} className="px-6 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-900/20 hover:scale-105 transition-transform">
                                Save Clone
                            </button>
                        </>
                    ) : null}
                </div>

            </div>
        </div>
    )
}
