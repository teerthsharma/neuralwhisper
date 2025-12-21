/**
 * THE HIVE MIND
 * ==========================================
 * Client-Side "Neural" Learning System
 * 
 * "We learn from every breath, every pause, every skip."
 * 
 * This module simulates a neural feedback loop. It observes user interactions
 * and adjusts a local "User Embedding" (weights) to personalize the audio experience.
 * 
 * Architecture:
 * - Weights: Speed, Pitch, Warmth, Breathiness, SilenceDuration
 * - Learning Rate: How fast we adapt to changes (default: 0.1)
 * - Decay: How fast old preferences fade (default: 0.01)
 */

const HIVE_MEMORY_KEY = 'hive_mind_v1_weights';
const DEFAULT_WEIGHTS = {
    speed_bias: 1.0,        // Multiplier for TTS speed
    pitch_bias: 1.0,        // Multiplier for TTS pitch
    pause_scale: 1.0,       // Multiplier for silence between sentences
    volume_pref: 1.0,       // Preferred output volume
    warmth_bias: 0.0,       // EQ bias (Low-mid boost)
    air_bias: 0.0           // EQ bias (High-freq boost)
};

class HiveMind {
    constructor() {
        this.weights = this._loadWeights();
        this.sessionHistory = [];
        this.learningRate = 0.05; // Conservative learning to avoid erratic behavior
        console.log('🧠 [HIVE MIND] Online. User weights loaded:', this.weights);
    }

    /**
     * Load weights from local storage or initialize
     */
    _loadWeights() {
        try {
            const saved = localStorage.getItem(HIVE_MEMORY_KEY);
            return saved ? { ...DEFAULT_WEIGHTS, ...JSON.parse(saved) } : { ...DEFAULT_WEIGHTS };
        } catch (e) {
            console.warn('🧠 [HIVE MIND] Memory corruption. Resetting weights.', e);
            return { ...DEFAULT_WEIGHTS };
        }
    }

    /**
     * Save current weights to local storage
     */
    _saveWeights() {
        localStorage.setItem(HIVE_MEMORY_KEY, JSON.stringify(this.weights));
    }

    /**
     * THE LEARNING LOOP
     * Called when the user interacts with the player
     */
    learn(interactionType, value) {
        console.log(`🧠 [HIVE MIND] Learning from: ${interactionType} -> ${value}`);

        switch (interactionType) {
            case 'SPEED_CHANGE':
                // User manually changed speed. We drift our bias towards this new normal.
                // If user sets 1.2x, we don't just set bias to 1.2, we nudge it.
                // Value is the raw speed setting (e.g., 1.0, 1.2, 0.8)
                const targetSpeed = parseFloat(value);
                const diffSpeed = targetSpeed - 1.0;
                this.weights.speed_bias += diffSpeed * this.learningRate;
                break;

            case 'PITCH_CHANGE':
                const targetPitch = parseFloat(value);
                const diffPitch = targetPitch - 1.0;
                this.weights.pitch_bias += diffPitch * this.learningRate;
                break;

            case 'SKIP_FORWARD':
                // User skipped ahead. Maybe we are too slow? Increase speed bias slightly.
                this.weights.speed_bias *= 1.01;
                // Also reduce pause duration
                this.weights.pause_scale *= 0.98;
                break;

            case 'SKIP_BACK':
                // User missed something. We are too fast.
                this.weights.speed_bias *= 0.99;
                break;

            case 'PAUSE_LONG':
                // User paused for a long time (> 5s). Maybe they need time to digest?
                // slightly increase pause duration between sentences
                this.weights.pause_scale *= 1.02;
                break;

            case 'VOLUME_CHANGE':
                this.weights.volume_pref = parseFloat(value);
                break;
        }

        // Clamp weights to sane limits to prevent "AI hallucinations"
        this.weights.speed_bias = Math.max(0.5, Math.min(2.0, this.weights.speed_bias));
        this.weights.pitch_bias = Math.max(0.5, Math.min(1.5, this.weights.pitch_bias));
        this.weights.pause_scale = Math.max(0.5, Math.min(3.0, this.weights.pause_scale));

        this._saveWeights();

        // Notify any listeners (UI) that the brain has evolved
        window.dispatchEvent(new CustomEvent('hive-mind-update', { detail: this.weights }));
    }

    /**
     * Get the current optimized settings for a voice
     * @param {Object} baseSettings - The default profile settings {speed, pitch}
     * @returns {Object} Optimized settings {speed, pitch, ...}
     */
    getOptimizedSettings(baseSettings) {
        return {
            speed: baseSettings.speed * this.weights.speed_bias,
            pitch: baseSettings.pitch * this.weights.pitch_bias,
            volume: this.weights.volume_pref,
            pauseScale: this.weights.pause_scale,
            eq: {
                warmth: this.weights.warmth_bias,
                air: this.weights.air_bias
            }
        };
    }

    /**
     * Reset the brain (Process complete wipe)
     */
    lobotomy() {
        this.weights = { ...DEFAULT_WEIGHTS };
        this._saveWeights();
        console.log('🧠 [HIVE MIND] Reset to factory settings.');
        return this.weights;
    }
}

// Export a singleton instance
export const hiveMind = new HiveMind();
