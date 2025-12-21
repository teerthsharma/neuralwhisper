/**
 * AudioEffects Integration
 * Provides a 7-band EQ, Compressor, Reverb, and Spatial Audio chain for the ASMR Reader.
 */

export class AudioEffects {
    constructor(audioContext) {
        this.ctx = audioContext
        this.input = null
        this.output = null
        this.isInitialized = false

        // Nodes
        this.compressor = null
        this.reverbNode = null
        this.masterGain = null
        this.stereoPanner = null
        this.filters = {} // 7-band EQ
    }

    initialize() {
        if (this.isInitialized) return

        // Create Master Gain
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.value = 1.0

        // Create Stereo Panner
        this.stereoPanner = this.ctx.createStereoPanner()

        // Create Compressor
        this.compressor = this.ctx.createDynamicsCompressor()
        this.compressor.threshold.value = -24
        this.compressor.knee.value = 30
        this.compressor.ratio.value = 12
        this.compressor.attack.value = 0.003
        this.compressor.release.value = 0.25

        // Create 7-Band EQ
        const frequencies = {
            sub: 60,
            bass: 150,
            lowMid: 400,
            mid: 1000,
            highMid: 2500,
            presence: 5000,
            brilliance: 10000
        }

        let previousNode = null

        // Chain creation start
        this.input = this.ctx.createGain()
        previousNode = this.input

        // Create and chain filters
        Object.entries(frequencies).forEach(([band, freq]) => {
            const filter = this.ctx.createBiquadFilter()
            filter.type = 'peaking'
            filter.frequency.value = freq
            filter.Q.value = 1.0 // Standard bandwidth
            filter.gain.value = 0

            this.filters[band] = filter

            // Connect previous to this
            previousNode.connect(filter)
            previousNode = filter
        })

        // Connect EQ chain to Compressor
        previousNode.connect(this.compressor)

        // Connect Compressor to Panner
        this.compressor.connect(this.stereoPanner)

        // Connect Panner to Master
        this.stereoPanner.connect(this.masterGain)

        // Connect Master to Destination
        this.masterGain.connect(this.ctx.destination)

        // Reverb (Convolver) - Parallel chain
        // Simple impulse response generation for reverb
        this.reverbNode = this.ctx.createConvolver()
        this.reverbNode.buffer = this._createImpulseResponse(2.0, 2.0) // 2s duration, decay

        // Reverb Gain (Mix)
        this.reverbGain = this.ctx.createGain()
        this.reverbGain.gain.value = 0 // Dry by default

        // Routing for Reverb: Input -> Reverb -> ReverbGain -> Master
        this.input.connect(this.reverbNode)
        this.reverbNode.connect(this.reverbGain)
        this.reverbGain.connect(this.masterGain)

        this.isInitialized = true
        console.log("AudioEffects initialized with 7-band EQ and Dynamics")
    }

    _createImpulseResponse(duration, decay) {
        const rate = this.ctx.sampleRate
        const length = rate * duration
        const impulse = this.ctx.createBuffer(2, length, rate)
        const left = impulse.getChannelData(0)
        const right = impulse.getChannelData(1)

        for (let i = 0; i < length; i++) {
            const n = i / length
            // Exponential decay noise
            left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay)
            right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay)
        }
        return impulse
    }

    setEQ(band, gain) {
        if (this.filters[band]) {
            this.filters[band].gain.setTargetAtTime(gain, this.ctx.currentTime, 0.1)
        }
    }

    setReverbMix(mix) {
        // Linear mix: 0 = dry, 1 = wet (though usually we keep dry signal and just add wet)
        // Here we just control the wet level
        if (this.reverbGain) {
            this.reverbGain.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.1)
        }
    }

    // ===============================================================
    // PRODUCER-GRADE COMPRESSOR CONTROLS
    // ===============================================================

    /**
     * Set compressor parameters
     * @param {number} threshold - Threshold in dB (-60 to 0)
     * @param {number} ratio - Compression ratio (1 to 20)
     * @param {number} attack - Attack time in ms (1 to 100)
     * @param {number} release - Release time in ms (10 to 1000)
     */
    setCompressor(threshold, ratio, attack, release) {
        if (!this.compressor) return

        const now = this.ctx.currentTime

        // Clamp values to valid ranges
        this.compressor.threshold.setTargetAtTime(Math.max(-60, Math.min(0, threshold)), now, 0.05)
        this.compressor.ratio.setTargetAtTime(Math.max(1, Math.min(20, ratio)), now, 0.05)
        this.compressor.attack.setTargetAtTime(Math.max(0.001, Math.min(0.1, attack / 1000)), now, 0.05)
        this.compressor.release.setTargetAtTime(Math.max(0.01, Math.min(1, release / 1000)), now, 0.05)

        console.log(`[AudioEffects] Compressor: ${threshold}dB, ${ratio}:1, ${attack}ms attack, ${release}ms release`)
    }

    /**
     * Get compressor gain reduction (for metering)
     */
    getCompressorReduction() {
        return this.compressor ? this.compressor.reduction : 0
    }

    // ===============================================================
    // LIMITER (Brickwall output protection)
    // ===============================================================

    /**
     * Initialize output limiter (call after initialize())
     */
    initLimiter() {
        if (!this.ctx || this.limiter) return

        this.limiter = this.ctx.createDynamicsCompressor()
        this.limiter.threshold.value = -1 // Very high threshold
        this.limiter.knee.value = 0       // Hard knee for brickwall
        this.limiter.ratio.value = 20     // Maximum ratio
        this.limiter.attack.value = 0.001 // Instant attack
        this.limiter.release.value = 0.1  // Fast release

        // Reconnect: Master -> Limiter -> Destination
        this.masterGain.disconnect()
        this.masterGain.connect(this.limiter)
        this.limiter.connect(this.ctx.destination)

        console.log('[AudioEffects] Brickwall limiter initialized')
    }

    /**
     * Set limiter ceiling
     * @param {number} ceiling - Output ceiling in dB (-6 to 0)
     */
    setLimiterCeiling(ceiling) {
        if (!this.limiter) {
            this.initLimiter()
        }
        if (this.limiter) {
            this.limiter.threshold.setTargetAtTime(Math.max(-6, Math.min(0, ceiling)), this.ctx.currentTime, 0.05)
            console.log(`[AudioEffects] Limiter ceiling: ${ceiling}dB`)
        }
    }

    setStereoWidth(width) {
        // Web Audio API doesn't have a direct "Width" node without complex M/S matrixing.
        // For simplicity, we'll map extreme width to panning or just placeholder.
        // Or we could implement M/S processing if needed.
        // For now, let's treat it as a placeholder or subtle effect if feasible.
        // Actually, let's keep it simple: no-op for now unless we add M/S.
        console.log("Stereo width set to " + width + " (Not fully implemented in vanilla WebAudio without worklets)")
    }

    setPan(pan) {
        if (this.stereoPanner) {
            this.stereoPanner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.1)
        }
    }

    setMasterGain(gain) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.1)
        }
    }

    loadPreset(settings) {
        if (settings.eq) {
            Object.entries(settings.eq).forEach(([band, val]) => {
                // Handle both simple number or object with gain
                const gain = typeof val === 'object' ? val.gain : val
                this.setEQ(band, gain)
            })
        }
        if (settings.reverb) {
            this.setReverbMix(settings.reverb.mix)
        }
        if (settings.compressor) {
            const c = settings.compressor
            this.setCompressor(c.threshold || -24, c.ratio || 4, c.attack || 3, c.release || 250)
        }
        if (settings.limiter) {
            this.setLimiterCeiling(settings.limiter.ceiling || -1)
        }
    }
}
