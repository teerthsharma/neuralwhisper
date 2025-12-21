/**
 * Voice Analyzer
 * Extracts audio features (Pitch, Warmth, Clarity, etc.) from an audio buffer.
 * Ported from Python implementation for Client-Side "Cloning".
 */

export class VoiceAnalyzer {
    constructor(audioContext) {
        this.ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)()
    }

    async analyze(audioBlob) {
        // Decode audio
        const arrayBuffer = await audioBlob.arrayBuffer()
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer)

        // Get raw data (mono)
        const channelData = audioBuffer.getChannelData(0)
        const sampleRate = audioBuffer.sampleRate

        // Analyze
        console.log("📊 Analyzing Audio Logic...")

        const pitch = this.estimatePitch(channelData, sampleRate)
        const warmth = this.calculateWarmth(channelData, sampleRate)
        const breathiness = this.calculateBreathiness(channelData, sampleRate)
        const clarity = this.calculateClarity(channelData, sampleRate)
        const speed = this.estimateSpeakingRate(channelData, sampleRate)

        return {
            estimated_pitch: pitch,
            warmth,
            breathiness,
            clarity,
            speaking_rate: speed,
            duration: audioBuffer.duration
        }
    }

    // 1. Pitch Estimation (Autocorrelation)
    estimatePitch(buffer, sampleRate) {
        const SIZE = 2048
        const input = buffer.slice(0, SIZE) // Analyze first chunk (simplified for speed)

        let rval = 0
        let k = 0
        const n = input.length
        let max_val = 0
        let max_k = 0

        // Simple Autocorrelation
        for (k = 0; k < n; k++) {
            let sum = 0
            for (let i = 0; i < n - k; i++) {
                sum += input[i] * input[i + k]
            }
            if (k > 20 && sum > max_val) { // Skip 0-lag peak
                max_val = sum
                max_k = k
            }
        }

        if (max_k === 0) return 150 // Default

        const pitch = sampleRate / max_k
        // Clamp to human range
        return Math.max(80, Math.min(600, pitch))
    }

    // 2. Warmth (Low Frequency Energy)
    calculateWarmth(buffer, sampleRate) {
        // We need frequency data. Let's do a quick FFT approximation or just simple filtering
        // Since we are offline, we can't easily use AnalyserNode without playing.
        // We'll use a simplified Zero-Crossing Rate (ZCR) proxy or just simple physics.
        // Lower ZCR often implies lower frequency dominance => Warmth.

        const zcr = this.calculateZCR(buffer)
        // Normalize: Lower ZCR = Higher Warmth. 
        // Typical speech ZCR is 0.05 to 0.1
        // Let's invert and scale.
        const warmth = 1.0 - Math.min(1.0, zcr * 5)
        return parseFloat(warmth.toFixed(2))
    }

    // 3. Breathiness (High Frequency Noise)
    calculateBreathiness(buffer, sampleRate) {
        // Breathiness is often associated with non-periodic noise.
        // We can approximate by looking at low energy segments that aren't silent.
        // Or simply high ZCR combined with low RMS.

        const zcr = this.calculateZCR(buffer)
        const rms = this.calculateRMS(buffer)

        // High ZCR + Low RMS = Breathy/Whispery
        // We'll simpler mapping: High ZCR is often breathier or sibilant.
        const breathiness = Math.min(1.0, zcr * 8)
        return parseFloat(breathiness.toFixed(2))
    }

    // 4. Clarity (Mid-Range Definition / Amplitude Variance)
    calculateClarity(buffer, sampleRate) {
        // High dynamic range usually implies clear articulation.
        // Muffled audio has lower variance.

        let sumDiff = 0
        for (let i = 1; i < buffer.length; i += 100) {
            sumDiff += Math.abs(buffer[i] - buffer[i - 1])
        }
        const avgDiff = sumDiff / (buffer.length / 100)

        // Scale to 0-1
        const clarity = Math.min(1.0, avgDiff * 10)
        return parseFloat(clarity.toFixed(2))
    }

    // 5. Speaking Rate (Syllables/Sec Proxy)
    estimateSpeakingRate(buffer, sampleRate) {
        // Count peaks in amplitude envelope
        const envelope = []
        const windowSize = Math.floor(sampleRate * 0.1) // 100ms window

        for (let i = 0; i < buffer.length; i += windowSize) {
            let sum = 0
            for (let j = 0; j < windowSize && i + j < buffer.length; j++) {
                sum += Math.abs(buffer[i + j])
            }
            envelope.push(sum / windowSize)
        }

        // Count peaks above threshold
        const threshold = 0.05 // Silence threshold
        let peaks = 0
        let isPeak = false

        for (let i = 1; i < envelope.length; i++) {
            if (envelope[i] > threshold && envelope[i] > envelope[i - 1]) {
                if (!isPeak) {
                    peaks++
                    isPeak = true
                }
            } else if (envelope[i] < threshold) {
                isPeak = false
            }
        }

        const duration = buffer.length / sampleRate
        const rate = (peaks / duration) * 1.5 // Multiplier to match expected speed factor

        // Normalize around 1.0 (0.5 to 1.5)
        return parseFloat(Math.max(0.5, Math.min(1.5, rate)).toFixed(2))
    }

    // Helpers
    calculateZCR(buffer) {
        let crossings = 0
        for (let i = 1; i < buffer.length; i += 10) { // Skip some samples for speed
            if (buffer[i] * buffer[i - 1] < 0) crossings++
        }
        return crossings / (buffer.length / 10)
    }

    calculateRMS(buffer) {
        let sum = 0
        for (let i = 0; i < buffer.length; i += 10) {
            sum += buffer[i] * buffer[i]
        }
        return Math.sqrt(sum / (buffer.length / 10))
    }
}
