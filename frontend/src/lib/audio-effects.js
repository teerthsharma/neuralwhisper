/**
 * Audio Effects Processor - Producer-level audio controls
 * Implements EQ, compressor, reverb, and ASMR-specific effects
 */

export class AudioEffects {
    constructor(audioContext) {
        this.ctx = audioContext
        this.nodes = {}
        this.isConnected = false

        // Default settings
        this.settings = {
            // EQ Bands (Hz)
            eq: {
                sub: { freq: 60, gain: 0 },      // Sub bass
                bass: { freq: 150, gain: 0 },    // Bass
                lowMid: { freq: 400, gain: 0 },  // Low mids
                mid: { freq: 1000, gain: 0 },    // Mids
                highMid: { freq: 2500, gain: 0 },// High mids
                presence: { freq: 5000, gain: 0 },// Presence
                brilliance: { freq: 10000, gain: 0 } // Brilliance/air
            },
            // Compressor
            compressor: {
                threshold: -24,
                knee: 30,
                ratio: 4,
                attack: 0.003,
                release: 0.25
            },
            // Reverb
            reverb: {
                mix: 0,        // 0-1 dry/wet
                decay: 2,      // seconds
                preDelay: 0.01 // seconds
            },
            // Stereo
            stereo: {
                width: 1.0,    // 0 = mono, 1 = normal, 2 = wide
                pan: 0         // -1 to 1
            },
            // ASMR Effects
            asmr: {
                warmth: 0,     // Low freq boost
                breathiness: 0,// High freq air
                intimacy: 0,   // Compression + proximity
                softness: 0    // Transient reduction
            },
            // Master
            master: {
                gain: 1.0,
                limiter: true
            }
        }
    }

    /**
     * Initialize all audio nodes
     */
    initialize() {
        if (this.isConnected) return this.nodes.input

        const ctx = this.ctx

        // Input gain
        this.nodes.input = ctx.createGain()

        // EQ Bands (peaking filters)
        this.nodes.eq = {}
        const eqBands = ['sub', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'brilliance']
        eqBands.forEach(band => {
            const filter = ctx.createBiquadFilter()
            filter.type = 'peaking'
            filter.frequency.value = this.settings.eq[band].freq
            filter.Q.value = 1.0
            filter.gain.value = this.settings.eq[band].gain
            this.nodes.eq[band] = filter
        })

        // Compressor
        this.nodes.compressor = ctx.createDynamicsCompressor()
        this._applyCompressor()

        // Stereo panner
        this.nodes.panner = ctx.createStereoPanner()
        this.nodes.panner.pan.value = this.settings.stereo.pan

        // Convolver for reverb (using generated impulse)
        this.nodes.reverbDry = ctx.createGain()
        this.nodes.reverbWet = ctx.createGain()
        this.nodes.convolver = ctx.createConvolver()
        this._generateImpulseResponse()

        // Master gain
        this.nodes.master = ctx.createGain()
        this.nodes.master.gain.value = this.settings.master.gain

        // Limiter (compressor with extreme settings)
        this.nodes.limiter = ctx.createDynamicsCompressor()
        this.nodes.limiter.threshold.value = -1
        this.nodes.limiter.knee.value = 0
        this.nodes.limiter.ratio.value = 20
        this.nodes.limiter.attack.value = 0.001
        this.nodes.limiter.release.value = 0.1

        // Connect the chain
        this._connect()
        this.isConnected = true

        return this.nodes.input
    }

    /**
     * Connect all nodes in the signal chain
     */
    _connect() {
        const { input, eq, compressor, panner, reverbDry, reverbWet, convolver, master, limiter } = this.nodes
        const ctx = this.ctx

        // Input -> EQ chain
        let prev = input
        const eqOrder = ['sub', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'brilliance']
        eqOrder.forEach(band => {
            prev.connect(eq[band])
            prev = eq[band]
        })

        // EQ -> Compressor
        prev.connect(compressor)

        // Compressor -> Reverb (parallel dry/wet)
        compressor.connect(reverbDry)
        compressor.connect(convolver)
        convolver.connect(reverbWet)

        // Reverb -> Panner
        reverbDry.connect(panner)
        reverbWet.connect(panner)

        // Panner -> Master -> Limiter -> Output
        panner.connect(master)
        master.connect(limiter)
        limiter.connect(ctx.destination)

        // Set initial reverb mix
        this._applyReverbMix()
    }

    /**
     * Apply compressor settings
     */
    _applyCompressor() {
        const c = this.nodes.compressor
        const s = this.settings.compressor
        c.threshold.value = s.threshold
        c.knee.value = s.knee
        c.ratio.value = s.ratio
        c.attack.value = s.attack
        c.release.value = s.release
    }

    /**
     * Apply reverb dry/wet mix
     */
    _applyReverbMix() {
        const mix = this.settings.reverb.mix
        this.nodes.reverbDry.gain.value = 1 - mix
        this.nodes.reverbWet.gain.value = mix
    }

    /**
     * Generate impulse response for reverb
     */
    _generateImpulseResponse() {
        const ctx = this.ctx
        const decay = this.settings.reverb.decay
        const sampleRate = ctx.sampleRate
        const length = sampleRate * decay
        const impulse = ctx.createBuffer(2, length, sampleRate)

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel)
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
            }
        }

        this.nodes.convolver.buffer = impulse
    }

    /**
     * Update EQ band
     */
    setEQ(band, gain) {
        if (this.nodes.eq && this.nodes.eq[band]) {
            this.settings.eq[band].gain = gain
            this.nodes.eq[band].gain.value = gain
        }
    }

    /**
     * Update compressor settings
     */
    setCompressor(setting, value) {
        this.settings.compressor[setting] = value
        if (this.nodes.compressor) {
            this.nodes.compressor[setting].value = value
        }
    }

    /**
     * Update reverb mix
     */
    setReverbMix(mix) {
        this.settings.reverb.mix = mix
        this._applyReverbMix()
    }

    /**
     * Update stereo width
     */
    setStereoWidth(width) {
        this.settings.stereo.width = width
        // Stereo width is applied during processing
    }

    /**
     * Update pan
     */
    setPan(pan) {
        this.settings.stereo.pan = pan
        if (this.nodes.panner) {
            this.nodes.panner.pan.value = pan
        }
    }

    /**
     * Update master gain
     */
    setMasterGain(gain) {
        this.settings.master.gain = gain
        if (this.nodes.master) {
            this.nodes.master.gain.value = gain
        }
    }

    /**
     * Apply ASMR preset - warmth
     */
    setWarmth(value) {
        this.settings.asmr.warmth = value
        // Boost low frequencies for warmth
        this.setEQ('sub', value * 3)
        this.setEQ('bass', value * 4)
        this.setEQ('lowMid', value * 2)
    }

    /**
     * Apply ASMR preset - breathiness
     */
    setBreathiness(value) {
        this.settings.asmr.breathiness = value
        // Boost high frequencies for air
        this.setEQ('presence', value * 3)
        this.setEQ('brilliance', value * 5)
    }

    /**
     * Apply ASMR preset - intimacy
     */
    setIntimacy(value) {
        this.settings.asmr.intimacy = value
        // Increase compression for consistent level
        const threshold = -24 - (value * 12)
        const ratio = 4 + (value * 8)
        this.setCompressor('threshold', threshold)
        this.setCompressor('ratio', ratio)
    }

    /**
     * Get current settings
     */
    getSettings() {
        return { ...this.settings }
    }

    /**
     * Load preset
     */
    loadPreset(preset) {
        Object.assign(this.settings, preset)
        this._applyAllSettings()
    }

    /**
     * Apply all settings to nodes
     */
    _applyAllSettings() {
        if (!this.isConnected) return

        // EQ
        Object.keys(this.settings.eq).forEach(band => {
            this.nodes.eq[band].gain.value = this.settings.eq[band].gain
        })

        // Compressor
        this._applyCompressor()

        // Reverb
        this._applyReverbMix()

        // Stereo
        this.nodes.panner.pan.value = this.settings.stereo.pan

        // Master
        this.nodes.master.gain.value = this.settings.master.gain
    }

    /**
     * Get the input node to connect audio source
     */
    getInput() {
        return this.nodes.input
    }

    /**
     * Disconnect all nodes
     */
    disconnect() {
        if (!this.isConnected) return

        Object.values(this.nodes).forEach(node => {
            if (node && typeof node.disconnect === 'function') {
                try { node.disconnect() } catch (e) { }
            }
        })

        this.isConnected = false
    }
}

// Producer presets
export const AUDIO_PRESETS = {
    default: {
        name: 'Default',
        settings: {}
    },
    asmr_whisper: {
        name: 'ASMR Whisper',
        settings: {
            eq: {
                sub: { freq: 60, gain: 2 },
                bass: { freq: 150, gain: 3 },
                lowMid: { freq: 400, gain: 1 },
                mid: { freq: 1000, gain: 0 },
                highMid: { freq: 2500, gain: 2 },
                presence: { freq: 5000, gain: 4 },
                brilliance: { freq: 10000, gain: 5 }
            },
            compressor: { threshold: -30, knee: 40, ratio: 6, attack: 0.01, release: 0.3 },
            reverb: { mix: 0.15, decay: 1.5 }
        }
    },
    intimate_close: {
        name: 'Intimate & Close',
        settings: {
            eq: {
                sub: { freq: 60, gain: 4 },
                bass: { freq: 150, gain: 5 },
                lowMid: { freq: 400, gain: 2 },
                mid: { freq: 1000, gain: -1 },
                highMid: { freq: 2500, gain: 1 },
                presence: { freq: 5000, gain: 2 },
                brilliance: { freq: 10000, gain: 3 }
            },
            compressor: { threshold: -35, knee: 30, ratio: 8, attack: 0.005, release: 0.2 },
            reverb: { mix: 0.05, decay: 0.8 }
        }
    },
    dreamy_ethereal: {
        name: 'Dreamy & Ethereal',
        settings: {
            eq: {
                sub: { freq: 60, gain: 1 },
                bass: { freq: 150, gain: 2 },
                lowMid: { freq: 400, gain: 0 },
                mid: { freq: 1000, gain: -2 },
                highMid: { freq: 2500, gain: 3 },
                presence: { freq: 5000, gain: 5 },
                brilliance: { freq: 10000, gain: 6 }
            },
            compressor: { threshold: -20, knee: 40, ratio: 3, attack: 0.02, release: 0.5 },
            reverb: { mix: 0.4, decay: 3 }
        }
    },
    podcast_clear: {
        name: 'Podcast Clear',
        settings: {
            eq: {
                sub: { freq: 60, gain: -2 },
                bass: { freq: 150, gain: 1 },
                lowMid: { freq: 400, gain: 0 },
                mid: { freq: 1000, gain: 2 },
                highMid: { freq: 2500, gain: 3 },
                presence: { freq: 5000, gain: 2 },
                brilliance: { freq: 10000, gain: 1 }
            },
            compressor: { threshold: -18, knee: 20, ratio: 4, attack: 0.003, release: 0.25 },
            reverb: { mix: 0.02, decay: 0.5 }
        }
    }
}
