/**
 * Voice Mapper
 * Maps audio features to the best matching Kokoro voice and settings.
 */

import { ALL_KOKORO_VOICES } from './voice-profiles'

export class VoiceMapper {
    static mapToKokoro(features, voiceName) {
        const { estimated_pitch, warmth, clarity, speaking_rate } = features
        const nameLower = voiceName.toLowerCase()

        // 1. Determine Gender
        // Pitch mapping: Male usually < 165Hz, Female > 165Hz
        const isMale = estimated_pitch < 165 || nameLower.includes('male') || nameLower.includes('boy')

        // 2. Select Base Voice ID
        let kokoroId = 'af_sarah' // Default neutral

        if (isMale) {
            // Male Mapping
            if (warmth > 0.7) {
                kokoroId = 'am_adam' // Warm, deep
            } else if (clarity > 0.7) {
                kokoroId = 'am_michael' // Clear, broadcast
            } else if (nameLower.includes('british')) {
                kokoroId = 'bm_george'
            } else {
                kokoroId = 'am_echo' // Neutral male
            }
        } else {
            // Female Mapping
            if (warmth > 0.7) {
                kokoroId = 'af_bella' // Warm, soft
            } else if (clarity > 0.8) {
                kokoroId = 'af_sky' // Bright, clear
            } else if (nameLower.includes('british')) {
                kokoroId = 'bf_emma'
            } else if (nameLower.includes('seductive') || features.breathiness > 0.7) {
                kokoroId = 'af_nicole' // Breathier, refined
            } else {
                kokoroId = 'af_sarah' // Neutral female
            }
        }

        // 3. Calculate Settings
        // Pitch: Normalize around 1.0. 
        // If detected is very high (>250), we pitch up. If very low (<100), we pitch down.
        // But we want to map the *source* pitch to the *target* model's range.
        // Actually, for "cloning", we want to adjust the target to match the source.

        let pitchSetting = 1.0
        if (isMale) {
            // Base male pitch approx 120hz
            pitchSetting = estimated_pitch / 120.0
        } else {
            // Base female pitch approx 220hz
            pitchSetting = estimated_pitch / 220.0
        }

        // Clamp reasonable limits
        pitchSetting = Math.max(0.8, Math.min(1.2, pitchSetting))

        return {
            kokoroId,
            settings: {
                pitch: parseFloat(pitchSetting.toFixed(2)),
                speed: parseFloat(speaking_rate.toFixed(2)) // Use the measured speaking rate directly
            },
            confidence: 0.85 // We feel pretty good about this heuristic
        }
    }
}
