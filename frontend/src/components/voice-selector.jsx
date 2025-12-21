import { useState } from 'react'
import { VOICE_LIST, ALL_KOKORO_VOICES, getVoiceProfile } from '../lib/voice-profiles'

export function VoiceSelector({ selectedVoiceId, onSelect, customVoices = [] }) {
    const [isOpen, setIsOpen] = useState(false)
    const [filter, setFilter] = useState('all') // all, female, male, custom

    const selectedProfile = getVoiceProfile(selectedVoiceId)

    // Combine standard voices with any loaded custom voices
    const allDisplays = [
        ...VOICE_LIST,
        ...customVoices
    ]

    const filteredVoices = allDisplays.filter(v => {
        if (filter === 'all') return true
        if (filter === 'custom') return v.isCustom
        if (v.isCustom) return false // Don't show custom in gender filters to avoid confusion, or check metadata

        // Approximate gender check
        const kVoice = ALL_KOKORO_VOICES.find(k => k.id === v.kokoroVoice)
        if (!kVoice) return true
        return kVoice.gender === filter
    })

    return (
        <div className="voice-selector-container relative z-20">
            {/* Main Display Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full glass-card p-4 flex items-center justify-between group hover:bg-[var(--bg-glass-hover)] transition-all duration-300"
            >
                <div className="flex items-center gap-4">
                    <div className="text-4xl filter drop-shadow-lg group-hover:scale-110 transition-transform">
                        {selectedProfile.emoji}
                    </div>
                    <div className="text-left">
                        <div className="text-xs uppercase tracking-widest text-[var(--accent-primary)] font-bold mb-1">
                            Current Voice
                        </div>
                        <h3 className="text-xl font-bold text-white leading-none mb-1">
                            {selectedProfile.name}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] opacity-80">
                            {selectedProfile.description}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] bg-[rgba(255,255,255,0.05)] px-2 py-1 rounded text-[var(--text-secondary)]">
                        {selectedProfile.tags?.join(' • ') || 'Standard'}
                    </span>
                    <svg
                        className={`w-5 h-5 text-[var(--text-secondary)] transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Dropdown / Grid */}
            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-4 glass-card overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">

                    {/* Filter Tabs */}
                    <div className="flex gap-2 p-2 mb-2 overflow-x-auto no-scrollbar border-b border-[rgba(255,255,255,0.05)]">
                        {['all', 'female', 'male', 'custom'].map(f => (
                            <button
                                key={f}
                                onClick={(e) => { e.stopPropagation(); setFilter(f); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${filter === f
                                        ? 'bg-[var(--accent-primary)] text-white shadow-[0_0_15px_var(--accent-glow)]'
                                        : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)]'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Scrollable Grid */}
                    <div className="max-h-[60vh] overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {filteredVoices.map(voice => (
                            <div
                                key={voice.id}
                                onClick={() => { onSelect(voice); setIsOpen(false); }}
                                className={`p-3 rounded-xl border border-transparent hover:border-[var(--accent-primary)] hover:bg-[var(--bg-glass-hover)] cursor-pointer transition-all group ${selectedVoiceId === voice.id ? 'bg-[var(--bg-glass-heavy)] border-[var(--accent-secondary)]' : 'bg-transparent'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="text-2xl mt-1 group-hover:scale-110 transition-transform duration-300">
                                        {voice.emoji}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <h4 className={`font-bold ${selectedVoiceId === voice.id ? 'text-[var(--accent-primary)]' : 'text-white'}`}>
                                                {voice.name}
                                            </h4>
                                            {voice.mode === 'asmr' && (
                                                <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                                                    ASMR PRO
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">
                                            {voice.description}
                                        </p>

                                        {/* Metadata Badges */}
                                        <div className="flex flex-wrap gap-1.5">
                                            <Badge label="Warmth" value={voice.characteristics?.warmth} color="orange" />
                                            <Badge label="Air" value={voice.characteristics?.breathiness} color="cyan" />
                                            {voice.recommendedFor && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)] border border-[rgba(255,255,255,0.05)]">
                                                    Best for: {voice.recommendedFor.split(',')[0]}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function Badge({ label, value, color }) {
    if (value === undefined) return null
    // Simple visualizer: filled dots
    const dots = Math.round(value * 5)
    return (
        <div className="flex items-center gap-1.5 bg-[rgba(0,0,0,0.2)] px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.02)]">
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">{label}</span>
            <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className={`w-1 h-3 rounded-full ${i < dots ? `bg-${color}-400 shadow-[0_0_5px_${color}]` : 'bg-[rgba(255,255,255,0.1)]'}`}
                    />
                ))}
            </div>
        </div>
    )
}
