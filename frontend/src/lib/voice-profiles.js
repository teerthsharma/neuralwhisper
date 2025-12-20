/**
 * Voice Profiles - Pre-generated voice configurations
 * Supports both built-in Kokoro voices and custom F5-TTS-generated embeddings
 * Custom voices are loaded lazily when advanced mode is opened
 */

// Built-in voice profiles (always available, lightweight)
export const VOICE_PROFILES = {
    asian_female: {
        id: 'asian_female',
        name: 'Asian Female',
        description: 'Soft, gentle whisper with delicate tones',
        emoji: '🌸',
        kokoroVoice: 'af_bella',
        defaultPitch: 1.1,
        defaultSpeed: 0.8,
        characteristics: {
            warmth: 0.7,
            breathiness: 0.8,
            clarity: 0.9
        }
    },
    american_casual: {
        id: 'american_casual',
        name: 'American Casual',
        description: 'Relaxed, friendly conversational tone',
        emoji: '🎧',
        kokoroVoice: 'af_sarah',
        defaultPitch: 1.0,
        defaultSpeed: 0.85,
        characteristics: {
            warmth: 0.8,
            breathiness: 0.6,
            clarity: 0.85
        }
    },
    russian_highclass: {
        id: 'russian_highclass',
        name: 'Russian Elegance',
        description: 'Refined, sophisticated whisper',
        emoji: '✨',
        kokoroVoice: 'af_nicole',
        defaultPitch: 0.95,
        defaultSpeed: 0.75,
        characteristics: {
            warmth: 0.6,
            breathiness: 0.7,
            clarity: 0.95
        }
    },
    male_deep: {
        id: 'male_deep',
        name: 'Deep Male',
        description: 'Calm, soothing baritone',
        emoji: '🎙️',
        kokoroVoice: 'am_adam',
        defaultPitch: 0.85,
        defaultSpeed: 0.8,
        characteristics: {
            warmth: 0.9,
            breathiness: 0.5,
            clarity: 0.8
        }
    }
}

export const VOICE_LIST = Object.values(VOICE_PROFILES)

export function getVoiceProfile(voiceId) {
    // Check built-in profiles first
    if (VOICE_PROFILES[voiceId]) {
        return VOICE_PROFILES[voiceId]
    }
    // Check custom voices cache
    if (customVoicesCache && customVoicesCache[voiceId]) {
        return customVoicesCache[voiceId]
    }
    return VOICE_PROFILES.american_casual
}

// ============================================================================
// ADVANCED MODE: Custom F5-TTS Embeddings (Lazy Loaded)
// ============================================================================

let customVoicesCache = null
let customVoicesLoading = false

/**
 * Lazy load custom voice embeddings from the manifest
 * Only called when user opens advanced settings
 */
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

        // Transform manifest voices into profile format
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

                // Use recommended settings from embedding generation
                defaultPitch: voice.recommended_settings?.pitch || 1.0,
                defaultSpeed: voice.recommended_settings?.speed || 1.0,

                // Voice characteristics from audio analysis
                characteristics: {
                    warmth: voice.characteristics?.warmth || 0.5,
                    breathiness: voice.characteristics?.breathiness || 0.5,
                    clarity: voice.characteristics?.clarity || 0.5,
                    estimatedPitchHz: voice.characteristics?.estimated_pitch_hz,
                    spectralCentroid: voice.characteristics?.spectral_centroid
                },

                // Advanced producer settings
                advanced: voice.advanced || {}
            }
        }

        console.log(`[Voices] Loaded ${Object.keys(customVoicesCache).length} custom voices`)
        return customVoicesCache

    } catch (error) {
        console.error('Failed to load custom voices:', error)
        return null
    } finally {
        customVoicesLoading = false
    }
}

/**
 * Get emoji based on voice name
 */
function getEmojiForVoice(name) {
    const nameLower = name.toLowerCase()
    if (nameLower.includes('asian')) return '🌸'
    if (nameLower.includes('russian')) return '❄️'
    if (nameLower.includes('american')) return '🎧'
    if (nameLower.includes('male') || nameLower.includes('formal')) return '🎙️'
    if (nameLower.includes('female') || nameLower.includes('girl')) return '🎀'
    return '🔊'
}

/**
 * Get combined list: built-in + custom voices
 * Custom voices only available after loadCustomVoices() is called
 */
export function getAllVoices() {
    const voices = [...VOICE_LIST]
    if (customVoicesCache) {
        voices.push(...Object.values(customVoicesCache))
    }
    return voices
}

/**
 * Get only custom voices (for advanced mode)
 */
export function getCustomVoices() {
    return customVoicesCache ? Object.values(customVoicesCache) : []
}

/**
 * Check if custom voices are loaded
 */
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
