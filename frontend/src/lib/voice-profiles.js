/**
 * Voice Profiles - Pre-generated voice configurations
 * Supports both built-in Kokoro voices and custom F5-TTS-generated embeddings
 * Custom voices are loaded lazily when advanced mode is opened
 */

// Built-in voice profiles (always available, lightweight)
export const VOICE_PROFILES = {
    // === STANDARD VOICES ===
    asian_female: {
        id: 'asian_female',
        name: 'Asian Female',
        description: 'Soft, gentle whisper with delicate tones',
        emoji: '🌸',
        kokoroVoice: 'af_bella',
        defaultPitch: 1.1,
        defaultSpeed: 0.8,
        characteristics: { warmth: 0.7, breathiness: 0.8, clarity: 0.9 }
    },
    american_casual: {
        id: 'american_casual',
        name: 'American Casual',
        description: 'Relaxed, friendly conversational tone',
        emoji: '🎧',
        kokoroVoice: 'af_sarah',
        defaultPitch: 1.0,
        defaultSpeed: 0.85,
        characteristics: { warmth: 0.8, breathiness: 0.6, clarity: 0.85 }
    },
    russian_highclass: {
        id: 'russian_highclass',
        name: 'Russian Elegance',
        description: 'Refined, sophisticated whisper',
        emoji: '✨',
        kokoroVoice: 'af_nicole',
        defaultPitch: 0.95,
        defaultSpeed: 0.75,
        characteristics: { warmth: 0.6, breathiness: 0.7, clarity: 0.95 }
    },
    male_deep: {
        id: 'male_deep',
        name: 'Deep Male',
        description: 'Calm, soothing baritone',
        emoji: '🎙️',
        kokoroVoice: 'am_adam',
        defaultPitch: 0.85,
        defaultSpeed: 0.8,
        characteristics: { warmth: 0.9, breathiness: 0.5, clarity: 0.8 }
    },

    // === NEURAL MODES (ASMR / PODCAST) ===
    asmr_soft: {
        id: 'asmr_soft',
        name: 'ASMR Soft Trigger',
        description: 'Super-close, breathy, binaural-ready',
        emoji: '🤫',
        kokoroVoice: 'af_bella', // Bella is naturally soft
        defaultPitch: 1.05, // Slightly higher for "cute" whisper or 0.9 for deep
        defaultSpeed: 0.7, // Very slow
        mode: 'asmr', // Used by engine to trigger DSP
        characteristics: { warmth: 0.9, breathiness: 1.0, clarity: 0.6 }
    },
    podcast_host: {
        id: 'podcast_host',
        name: 'Podcast Host',
        description: 'Energetic, broadcast-quality compression',
        emoji: '📻',
        kokoroVoice: 'am_michael',
        defaultPitch: 1.0,
        defaultSpeed: 1.05, // Slightly faster
        mode: 'podcast',
        characteristics: { warmth: 0.5, breathiness: 0.2, clarity: 1.0 }
    }
}

export const VOICE_LIST = Object.values(VOICE_PROFILES)

/**
 * FIXED: Get Voice Profile logic
 * Now correctly handles raw Kokoro IDs (e.g. 'af_sky') by generating a temporary profile
 */
export function getVoiceProfile(voiceId) {
    // 1. Check built-in profiles
    if (VOICE_PROFILES[voiceId]) {
        return VOICE_PROFILES[voiceId]
    }

    // 2. Check custom voices cache
    if (customVoicesCache && customVoicesCache[voiceId]) {
        return customVoicesCache[voiceId]
    }

    // 3. Check if it's a raw Kokoro ID (fallback/override support)
    const rawVoice = ALL_KOKORO_VOICES.find(v => v.id === voiceId);
    if (rawVoice) {
        return {
            id: rawVoice.id,
            name: rawVoice.name,
            description: `Standard ${rawVoice.accent} ${rawVoice.gender} voice`,
            emoji: '🗣️',
            kokoroVoice: rawVoice.id,
            defaultPitch: 1.0,
            defaultSpeed: 1.0,
            isRaw: true,
            characteristics: { warmth: 0.5, breathiness: 0.5, clarity: 0.5 }
        };
    }

    // Default fallback
    console.warn(`Voice ID '${voiceId}' not found, falling back to American Casual.`);
    return VOICE_PROFILES.american_casual
}

// ============================================================================
// ADVANCED MODE: Custom F5-TTS Embeddings (Lazy Loaded)
// ============================================================================

let customVoicesCache = null
let customVoicesLoading = false

export async function loadCustomVoices() {
    if (customVoicesCache) return customVoicesCache
    if (customVoicesLoading) return null

    customVoicesLoading = true

    try {
        const response = await fetch('/voices/voice-manifest.json')
        if (!response.ok) {
            console.warn('Custom voice manifest not found')
            return null
        }

        const manifest = await response.json()
        customVoicesCache = {}

        for (const [id, voice] of Object.entries(manifest.voices)) {
            customVoicesCache[id] = {
                id: voice.id,
                name: voice.name,
                description: voice.description,
                emoji: getEmojiForVoice(voice.name),
                kokoroVoice: voice.kokoro_voice,
                referenceClip: voice.reference_clip,
                isCustom: true,
                defaultPitch: voice.recommended_settings?.pitch || 1.0,
                defaultSpeed: voice.recommended_settings?.speed || 1.0,
                characteristics: {
                    warmth: voice.characteristics?.warmth || 0.5,
                    breathiness: voice.characteristics?.breathiness || 0.5,
                    clarity: voice.characteristics?.clarity || 0.5,
                },
                advanced: voice.advanced || {}
            }
        }
        return customVoicesCache

    } catch (error) {
        console.error('Failed to load custom voices:', error)
        return null
    } finally {
        customVoicesLoading = false
    }
}

function getEmojiForVoice(name) {
    const nameLower = name.toLowerCase()
    if (nameLower.includes('asian')) return '🌸'
    if (nameLower.includes('russian')) return '❄️'
    if (nameLower.includes('american')) return '🎧'
    if (nameLower.includes('male') || nameLower.includes('formal')) return '🎙️'
    if (nameLower.includes('female') || nameLower.includes('girl')) return '🎀'
    return '🔊'
}

export function getAllVoices() {
    const voices = [...VOICE_LIST]
    if (customVoicesCache) {
        voices.push(...Object.values(customVoicesCache))
    }
    return voices
}

export function getCustomVoices() {
    return customVoicesCache ? Object.values(customVoicesCache) : []
}

export function areCustomVoicesLoaded() {
    return customVoicesCache !== null
}

// ============================================================================
// All Available Kokoro Voices (for advanced mode reference)
// ============================================================================

export const ALL_KOKORO_VOICES = [
    // American Female
    { id: 'af_alloy', name: 'Alloy (AF)', gender: 'female', accent: 'american' },
    { id: 'af_aoede', name: 'Aoede (AF)', gender: 'female', accent: 'american' },
    { id: 'af_bella', name: 'Bella (AF)', gender: 'female', accent: 'american' },
    { id: 'af_heart', name: 'Heart (AF)', gender: 'female', accent: 'american' },
    { id: 'af_jessica', name: 'Jessica (AF)', gender: 'female', accent: 'american' },
    { id: 'af_koda', name: 'Koda (AF)', gender: 'female', accent: 'american' },
    { id: 'af_nicole', name: 'Nicole (AF)', gender: 'female', accent: 'american' },
    { id: 'af_nova', name: 'Nova (AF)', gender: 'female', accent: 'american' },
    { id: 'af_river', name: 'River (AF)', gender: 'female', accent: 'american' },
    { id: 'af_sarah', name: 'Sarah (AF)', gender: 'female', accent: 'american' },
    { id: 'af_sky', name: 'Sky (AF)', gender: 'female', accent: 'american' },

    // American Male
    { id: 'am_adam', name: 'Adam (AM)', gender: 'male', accent: 'american' },
    { id: 'am_echo', name: 'Echo (AM)', gender: 'male', accent: 'american' },
    { id: 'am_eric', name: 'Eric (AM)', gender: 'male', accent: 'american' },
    { id: 'am_fenrir', name: 'Fenrir (AM)', gender: 'male', accent: 'american' },
    { id: 'am_fable', name: 'Fable (AM)', gender: 'male', accent: 'american' },
    { id: 'am_liam', name: 'Liam (AM)', gender: 'male', accent: 'american' },
    { id: 'am_michael', name: 'Michael (AM)', gender: 'male', accent: 'american' },
    { id: 'am_onyx', name: 'Onyx (AM)', gender: 'male', accent: 'american' },

    // British Female
    { id: 'bf_alice', name: 'Alice (BF)', gender: 'female', accent: 'british' },
    { id: 'bf_emma', name: 'Emma (BF)', gender: 'female', accent: 'british' },
    { id: 'bf_isabella', name: 'Isabella (BF)', gender: 'female', accent: 'british' },
    { id: 'bf_lily', name: 'Lily (BF)', gender: 'female', accent: 'british' },

    // British Male
    { id: 'bm_daniel', name: 'Daniel (BM)', gender: 'male', accent: 'british' },
    { id: 'bm_george', name: 'George (BM)', gender: 'male', accent: 'british' },
    { id: 'bm_lewis', name: 'Lewis (BM)', gender: 'male', accent: 'british' },
    { id: 'bm_oliver', name: 'Oliver (BM)', gender: 'male', accent: 'british' },
]
