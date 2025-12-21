import { useState, useMemo } from 'react'
import { VOICE_LIST, ALL_KOKORO_VOICES, getVoiceProfile } from '../lib/voice-profiles'

export function VoiceSelector({ selectedVoiceId, onSelect, customVoices = [] }) {
    const [isOpen, setIsOpen] = useState(false)
    const [filter, setFilter] = useState('all') // all, female, male, custom

    // Get current profile for the main button
    const selectedProfile = getVoiceProfile(selectedVoiceId)

    // Deduplicate and Sort Voices
    const uniqueVoices = useMemo(() => {
        const voiceMap = new Map()

        // 1. Add Standard Voices first
        VOICE_LIST.forEach(voice => {
            voiceMap.set(voice.id, { ...voice, type: 'standard' })
        })

        // 2. Add/Override with Custom Voices
        // If a custom voice has the same ID, it overwrites the standard one
        customVoices.forEach(voice => {
            voiceMap.set(voice.id, { ...voice, type: 'custom' })
        })

        // Convert back to array
        return Array.from(voiceMap.values())
    }, [customVoices])

    // Filter Logic
    const filteredVoices = useMemo(() => {
        return uniqueVoices.filter(v => {
            if (filter === 'all') return true
            if (filter === 'custom') return v.type === 'custom'

            // Gender check
            // Use metadata gender if available, else derive from ID/Name or map to Kokoro base
            const isFemale = v.name.toLowerCase().includes('female') ||
                v.id.includes('female') ||
                v.gender === 'female' ||
                (v.kokoroVoice && v.kokoroVoice.startsWith('af_') || v.kokoroVoice.startsWith('bf_'))

            if (filter === 'female') return isFemale
            if (filter === 'male') return !isFemale // simplified assumption for non-female

            return true
        })
    }, [uniqueVoices, filter])

    return (
        <div className="voice-selector-container relative z-20 font-sans">
            {/* Main Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full glass-card p-5 flex items-center justify-between group hover:bg-white/5 transition-all duration-300 border border-white/10 hover:border-white/20 shadow-2xl backdrop-blur-xl rounded-2xl"
            >
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-3xl shadow-inner border border-white/10 group-hover:scale-105 transition-transform duration-300">
                            {selectedProfile.emoji}
                        </div>
                        {selectedProfile.isCustom && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-r from-amber-300 to-orange-400 rounded-full flex items-center justify-center shadow-lg border border-black/50">
                                <span className="text-[10px]">⭐</span>
                            </div>
                        )}
                    </div>

                    <div className="text-left flex flex-col">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1">
                            Active Voice
                        </span>
                        <h3 className="text-xl font-medium text-white tracking-tight">
                            {selectedProfile.name}
                        </h3>
                        {selectedProfile.isCustom && (
                            <span className="text-[10px] text-amber-200/80 font-medium tracking-wide">
                                Neural Clone
                            </span>
                        )}
                    </div>
                </div>

                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <svg
                        className={`w-5 h-5 text-white/60 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-4 glass-card overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top rounded-2xl border border-white/10 shadow-2xl ring-1 ring-black/5 p-4 z-50 bg-[#0a0a0a]/90 backdrop-blur-2xl">

                    {/* Filters */}
                    <div className="flex gap-2 mb-4 p-1 bg-white/5 rounded-xl w-fit mx-auto">
                        {['all', 'female', 'male', 'custom'].map(f => (
                            <button
                                key={f}
                                onClick={(e) => { e.stopPropagation(); setFilter(f); }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-200 ${filter === f
                                        ? 'bg-white/20 text-white shadow-lg'
                                        : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {filteredVoices.map(voice => (
                            <button
                                key={voice.id}
                                onClick={() => { onSelect(voice); setIsOpen(false); }}
                                className={`relative p-3 rounded-xl border text-left transition-all duration-200 group flex items-start gap-3 ${selectedVoiceId === voice.id
                                        ? 'bg-white/10 border-white/20 shadow-inner'
                                        : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'
                                    }`}
                            >
                                <div className="text-2xl mt-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                    {voice.emoji}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <h4 className={`text-sm font-medium truncate ${selectedVoiceId === voice.id ? 'text-white' : 'text-white/80'
                                            }`}>
                                            {voice.name}
                                        </h4>
                                        {voice.type === 'custom' && (
                                            <span className="text-[9px] bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-200 px-1.5 py-0.5 rounded border border-amber-500/30">
                                                PRO
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-white/40 line-clamp-1 group-hover:text-white/60 transition-colors">
                                        {voice.description}
                                    </p>

                                    {/* Characteristics Mini-bar */}
                                    {voice.characteristics && (
                                        <div className="flex items-center gap-2 mt-2 opacity-50 text-[9px] text-white/30">
                                            {voice.characteristics.warmth > 0.7 && <span>🔥 Warm</span>}
                                            {voice.characteristics.breathiness > 0.7 && <span>💨 Airy</span>}
                                            {voice.characteristics.clarity > 0.8 && <span>✨ Clear</span>}
                                        </div>
                                    )}
                                </div>

                                {selectedVoiceId === voice.id && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
