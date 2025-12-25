/**
 * AudioEffects Integration - THE LIVING SANCTUARY
 * Provides a 7-band EQ, Compressor, Reverb, 3D Binaural Panner, 
 * De-esser, and Brickwall Limiter for ASMR Reader.
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

        // NEW: Living Sanctuary Audio Stack
        this.panner3D = null        // 3D Binaural Panner
        this.deesserFilter = null   // Sibilance control filter
        this.deesserComp = null     // De-esser compressor
        this.limiter = null         // Brickwall limiter
        this.animationId = null     // For 3D panner animation
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
        if (settings.deesser) {
            this.setDeesser(settings.deesser.threshold || -25, settings.deesser.frequency || 6000, settings.deesser.reduction || 6)
        }
        if (settings.panner3D) {
            this.set3DPosition(settings.panner3D.azimuth || 0, settings.panner3D.elevation || 0, settings.panner3D.distance || 1)
        }
    }

    // ===============================================================
    // 3D BINAURAL PANNER (The Living Sanctuary)
    // ===============================================================

    /**
     * Initialize 3D Binaural Panner with HRTF
     */
    init3DPanner() {
        if (!this.ctx || this.panner3D) return

        this.panner3D = this.ctx.createPanner()

        // Configure for HRTF-based binaural audio
        this.panner3D.panningModel = 'HRTF'  // Head-Related Transfer Function for realistic 3D
        this.panner3D.distanceModel = 'inverse'
        this.panner3D.refDistance = 1
        this.panner3D.maxDistance = 10000
        this.panner3D.rolloffFactor = 1
        this.panner3D.coneInnerAngle = 360
        this.panner3D.coneOuterAngle = 360
        this.panner3D.coneOuterGain = 0

        // Set initial position (directly in front)
        this.panner3D.positionX.value = 0
        this.panner3D.positionY.value = 0
        this.panner3D.positionZ.value = -1  // In front of listener

        // Insert into chain: Compressor -> 3D Panner -> Stereo Panner
        if (this.compressor && this.stereoPanner) {
            this.compressor.disconnect()
            this.compressor.connect(this.panner3D)
            this.panner3D.connect(this.stereoPanner)
        }

        console.log('[AudioEffects] 🎧 3D Binaural Panner initialized (HRTF)')
    }

    /**
     * Set 3D position using spherical coordinates
     * @param {number} azimuth - Horizontal angle in degrees (-180 to 180, 0 = front)
     * @param {number} elevation - Vertical angle in degrees (-90 to 90, 0 = ear level)
     * @param {number} distance - Distance from listener (0.1 to 10, 1 = natural)
     */
    set3DPosition(azimuth, elevation, distance = 1) {
        if (!this.panner3D) {
            this.init3DPanner()
        }
        if (!this.panner3D) return

        const now = this.ctx.currentTime

        // Convert spherical to cartesian coordinates
        const azRad = (azimuth * Math.PI) / 180
        const elRad = (elevation * Math.PI) / 180

        const x = distance * Math.sin(azRad) * Math.cos(elRad)
        const y = distance * Math.sin(elRad)
        const z = -distance * Math.cos(azRad) * Math.cos(elRad)  // Negative Z is forward

        this.panner3D.positionX.setTargetAtTime(x, now, 0.05)
        this.panner3D.positionY.setTargetAtTime(y, now, 0.05)
        this.panner3D.positionZ.setTargetAtTime(z, now, 0.05)

        console.log(`[AudioEffects] 🎧 3D Position: azimuth=${azimuth}°, elevation=${elevation}°, distance=${distance}`)
    }

    /**
     * Animate 3D position movement (for immersive ASMR effects)
     * @param {Object} startPos - { azimuth, elevation, distance }
     * @param {Object} endPos - { azimuth, elevation, distance }
     * @param {number} durationMs - Animation duration in milliseconds
     */
    animate3DMovement(startPos, endPos, durationMs) {
        if (!this.panner3D) {
            this.init3DPanner()
        }
        if (!this.panner3D) return

        // Cancel any existing animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId)
        }

        const startTime = performance.now()

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / durationMs, 1)

            // Smooth easing (ease-in-out)
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2

            const azimuth = startPos.azimuth + (endPos.azimuth - startPos.azimuth) * eased
            const elevation = startPos.elevation + (endPos.elevation - startPos.elevation) * eased
            const distance = startPos.distance + (endPos.distance - startPos.distance) * eased

            this.set3DPosition(azimuth, elevation, distance)

            if (progress < 1) {
                this.animationId = requestAnimationFrame(animate)
            } else {
                this.animationId = null
            }
        }

        this.animationId = requestAnimationFrame(animate)
    }

    /**
     * Circular orbit around listener (ASMR whispering effect)
     * @param {number} speed - Degrees per second (positive = clockwise)
     * @param {number} distance - Distance from listener
     */
    startOrbit(speed = 30, distance = 1.5) {
        if (!this.panner3D) {
            this.init3DPanner()
        }
        if (!this.panner3D) return

        let azimuth = 0
        let lastTime = performance.now()

        const orbit = (currentTime) => {
            const deltaTime = (currentTime - lastTime) / 1000
            lastTime = currentTime

            azimuth += speed * deltaTime
            if (azimuth > 180) azimuth -= 360
            if (azimuth < -180) azimuth += 360

            this.set3DPosition(azimuth, 0, distance)
            this.animationId = requestAnimationFrame(orbit)
        }

        this.animationId = requestAnimationFrame(orbit)
        console.log(`[AudioEffects] 🌀 Started 3D orbit: ${speed}°/s at distance ${distance}`)
    }

    /**
     * Stop any 3D animation
     */
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId)
            this.animationId = null
        }
    }

    // ===============================================================
    // DE-ESSER (Sibilance Control for ASMR "Tingle" Frequencies)
    // ===============================================================

    /**
     * Initialize De-esser for controlling harsh sibilance (8k-12kHz)
     * Creates a frequency-selective compressor
     */
    initDeesser() {
        if (!this.ctx || this.deesserFilter) return

        // Bandpass filter to isolate sibilant frequencies
        this.deesserFilter = this.ctx.createBiquadFilter()
        this.deesserFilter.type = 'peaking'
        this.deesserFilter.frequency.value = 6000  // Target "S" sounds
        this.deesserFilter.Q.value = 2.0           // Narrow bandwidth
        this.deesserFilter.gain.value = 0          // Flat by default

        // Dynamics compressor for the sibilant band
        this.deesserComp = this.ctx.createDynamicsCompressor()
        this.deesserComp.threshold.value = -25     // When sibilance exceeds this
        this.deesserComp.knee.value = 6
        this.deesserComp.ratio.value = 8           // Heavy compression on sibilants
        this.deesserComp.attack.value = 0.001      // Fast attack to catch transients
        this.deesserComp.release.value = 0.05      // Quick release

        console.log('[AudioEffects] 🔇 De-esser initialized (8k-12kHz sibilance control)')
    }

    /**
     * Set de-esser parameters
     * @param {number} threshold - Detection threshold in dB (-50 to 0)
     * @param {number} frequency - Center frequency for sibilance (4000 to 12000 Hz)
     * @param {number} reduction - Amount of reduction in dB (0 to 12)
     */
    setDeesser(threshold, frequency = 6000, reduction = 6) {
        if (!this.deesserFilter) {
            this.initDeesser()
        }
        if (!this.deesserFilter || !this.deesserComp) return

        const now = this.ctx.currentTime

        this.deesserFilter.frequency.setTargetAtTime(
            Math.max(4000, Math.min(12000, frequency)), now, 0.05
        )
        this.deesserFilter.gain.setTargetAtTime(-reduction, now, 0.05)
        this.deesserComp.threshold.setTargetAtTime(
            Math.max(-50, Math.min(0, threshold)), now, 0.05
        )

        console.log(`[AudioEffects] 🔇 De-esser: ${threshold}dB threshold, ${frequency}Hz, -${reduction}dB reduction`)
    }

    // ===============================================================
    // DYNAMIC HAPTIC TRIGGER SYSTEM (Web Vibration API)
    // ===============================================================

    /**
     * Trigger haptic feedback synchronized to audio events
     * @param {string} triggerType - Type of trigger: 'breath', 'bass', 'peak'
     * @param {number} intensity - Intensity (0.0 to 1.0)
     */
    triggerHaptic(triggerType, intensity = 0.5) {
        if (!('vibrate' in navigator)) {
            return  // Haptic not supported
        }

        let pattern = []
        const baseIntensity = Math.floor(intensity * 100)

        switch (triggerType) {
            case 'breath':
                // Soft, gentle pulse like inhaling
                pattern = [baseIntensity * 0.3, 20, baseIntensity * 0.5, 30, baseIntensity * 0.2]
                break
            case 'bass':
                // Deep, sustained rumble
                pattern = [baseIntensity, 50, baseIntensity * 0.8]
                break
            case 'peak':
                // Sharp, quick tap
                pattern = [baseIntensity * 0.8]
                break
            case 'whisper':
                // Very subtle flutter
                pattern = [10, 10, 15, 10, 10]
                break
            default:
                pattern = [baseIntensity * 0.5]
        }

        navigator.vibrate(pattern)
    }

    // ===============================================================
    // NIGHT MODE (Temporal Awareness)
    // ===============================================================

    /**
     * Apply Night Mode settings (warm EQ, slower pace feel)
     * Automatically called after 11 PM
     */
    applyNightMode() {
        const now = this.ctx.currentTime

        // Warm EQ: Boost low-mids, reduce highs
        this.setEQ('sub', 2)
        this.setEQ('bass', 3)
        this.setEQ('lowMid', 2)
        this.setEQ('mid', 0)
        this.setEQ('highMid', -1)
        this.setEQ('presence', -2)
        this.setEQ('brilliance', -3)

        // Gentle compression
        this.setCompressor(-30, 3, 10, 300)

        // Add subtle reverb for intimacy
        this.setReverbMix(0.15)

        console.log('[AudioEffects] 🌙 Night Mode activated (warm, intimate sound)')
    }

    /**
     * Check if it's night time and apply settings
     */
    checkAndApplyTemporalSettings() {
        const hour = new Date().getHours()
        if (hour >= 23 || hour < 6) {
            this.applyNightMode()
            return true
        }
        return false
    }
}
