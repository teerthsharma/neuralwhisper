/**
 * SANCTUARY DSP - Pure JavaScript Implementation
 * ================================================
 * Complete port of the Rust sanctuary-dsp library to JavaScript.
 * All algorithms are identical to the Rust version for consistent results.
 * 
 * Features:
 * - SIMD-like optimized FFT (using typed arrays)
 * - Voice Activity Detection (VAD) with energy + ZCR
 * - Pitch Detection (YIN algorithm)
 * - Formant Analysis (LPC/Levinson-Durbin)
 * - High-quality Sinc/Lanczos Resampling
 *
 * Performance: Optimized for modern JS engines (V8, SpiderMonkey)
 * 
 * @module sanctuary-dsp
 */

console.log('🦀 [Rust DSP] Sanctuary DSP module loaded (JavaScript port)');
console.log('   All functionality ported from Rust - no WASM required');

/**
 * High-performance FFT Processor
 * Port of Rust FftProcessor using Cooley-Tukey algorithm
 */
export class FftProcessor {
    constructor(size) {
        this.size = size;

        // Pre-compute Hann window
        this.window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            this.window[i] = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * i / (size - 1)));
        }

        // Pre-compute twiddle factors for FFT
        this.twiddleReal = new Float32Array(size);
        this.twiddleImag = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            const angle = -2.0 * Math.PI * i / size;
            this.twiddleReal[i] = Math.cos(angle);
            this.twiddleImag[i] = Math.sin(angle);
        }

        // Bit-reversal permutation table
        this.bitReverse = new Uint32Array(size);
        const bits = Math.log2(size) | 0;
        for (let i = 0; i < size; i++) {
            let reversed = 0;
            for (let j = 0; j < bits; j++) {
                if (i & (1 << j)) {
                    reversed |= 1 << (bits - 1 - j);
                }
            }
            this.bitReverse[i] = reversed;
        }

        console.log(`🦀 [Rust DSP] FFT Processor initialized: ${size} samples`);
    }

    /**
     * Compute power spectrum from audio samples
     * @param {Float32Array} samples - Input audio samples
     * @returns {Float32Array} Power spectrum (positive frequencies only)
     */
    powerSpectrum(samples) {
        const n = this.size;

        // Apply window and copy to buffer
        const real = new Float32Array(n);
        const imag = new Float32Array(n);

        const len = Math.min(samples.length, n);
        for (let i = 0; i < len; i++) {
            real[this.bitReverse[i]] = samples[i] * this.window[i];
        }

        // Cooley-Tukey FFT (in-place)
        for (let size = 2; size <= n; size *= 2) {
            const halfSize = size / 2;
            const step = n / size;

            for (let i = 0; i < n; i += size) {
                for (let j = 0; j < halfSize; j++) {
                    const k = j * step;
                    const tReal = this.twiddleReal[k];
                    const tImag = this.twiddleImag[k];

                    const idx1 = i + j;
                    const idx2 = i + j + halfSize;

                    const tempReal = real[idx2] * tReal - imag[idx2] * tImag;
                    const tempImag = real[idx2] * tImag + imag[idx2] * tReal;

                    real[idx2] = real[idx1] - tempReal;
                    imag[idx2] = imag[idx1] - tempImag;
                    real[idx1] += tempReal;
                    imag[idx1] += tempImag;
                }
            }
        }

        // Compute power spectrum (positive frequencies only)
        const nBins = Math.floor(n / 2) + 1;
        const result = new Float32Array(nBins);

        for (let i = 0; i < nBins; i++) {
            result[i] = (real[i] * real[i] + imag[i] * imag[i]) / n;
        }

        return result;
    }

    /**
     * Compute magnitude spectrum in dB
     * @param {Float32Array} samples - Input audio samples
     * @returns {Float32Array} Magnitude spectrum in dB
     */
    magnitudeDb(samples) {
        const power = this.powerSpectrum(samples);
        const result = new Float32Array(power.length);

        for (let i = 0; i < power.length; i++) {
            result[i] = 10.0 * Math.log10(power[i] + 1e-10);
        }

        return result;
    }
}

/**
 * Voice Activity Detection using energy + ZCR
 * Exact port of Rust VoiceActivityDetector
 */
export class VoiceActivityDetector {
    constructor(frameSize = 512, hopSize = 256) {
        this.frameSize = frameSize;
        this.hopSize = hopSize;
        this.energyThreshold = -40.0; // dB
        this.zcrThreshold = 0.1;
        this.hangoverFrames = 5;

        console.log(`🦀 [Rust DSP] VAD initialized: frame=${frameSize}, hop=${hopSize}`);
    }

    /**
     * Set detection thresholds
     */
    setThresholds(energyDb, zcr) {
        this.energyThreshold = energyDb;
        this.zcrThreshold = zcr;
    }

    /**
     * Detect voice activity, returns array of 0/1
     * @param {Float32Array} samples - Input audio samples
     * @returns {Uint8Array} VAD decisions (0 = silence, 1 = speech)
     */
    detect(samples) {
        const numFrames = Math.floor((samples.length - this.frameSize) / this.hopSize) + 1;
        if (numFrames <= 0) return new Uint8Array(0);

        const vad = new Uint8Array(numFrames);
        let hangoverCounter = 0;

        for (let i = 0; i < numFrames; i++) {
            const start = i * this.hopSize;
            const end = Math.min(start + this.frameSize, samples.length);

            // Compute frame energy in dB
            let energy = 0;
            for (let j = start; j < end; j++) {
                energy += samples[j] * samples[j];
            }
            const energyDb = 10.0 * Math.log10(energy / (end - start) + 1e-10);

            // Compute zero-crossing rate
            let zcr = 0;
            for (let j = start + 1; j < end; j++) {
                if ((samples[j - 1] >= 0) !== (samples[j] >= 0)) {
                    zcr++;
                }
            }
            zcr /= (end - start);

            // Decision with hangover
            const isSpeech = energyDb > this.energyThreshold && zcr < this.zcrThreshold;

            if (isSpeech) {
                hangoverCounter = this.hangoverFrames;
            }

            if (hangoverCounter > 0) {
                vad[i] = 1;
                hangoverCounter--;
            } else {
                vad[i] = 0;
            }
        }

        return vad;
    }

    /**
     * Get voice segments as start/end sample indices
     * @param {Float32Array} samples - Input audio samples
     * @returns {Uint32Array} Alternating start/end indices
     */
    getSegments(samples) {
        const vad = this.detect(samples);
        const segments = [];
        let inSegment = false;
        let segmentStart = 0;

        for (let i = 0; i < vad.length; i++) {
            if (vad[i] === 1 && !inSegment) {
                segmentStart = i * this.hopSize;
                inSegment = true;
            } else if (vad[i] === 0 && inSegment) {
                segments.push(segmentStart);
                segments.push(i * this.hopSize);
                inSegment = false;
            }
        }

        if (inSegment) {
            segments.push(segmentStart);
            segments.push(vad.length * this.hopSize);
        }

        return new Uint32Array(segments);
    }
}

/**
 * YIN Pitch Detection Algorithm
 * Reference: "YIN, a fundamental frequency estimator for speech and music" 
 * (de Cheveigné & Kawahara, 2002)
 * 
 * Exact port of Rust PitchDetector
 */
export class PitchDetector {
    constructor(sampleRate = 44100, frameSize = 2048) {
        this.sampleRate = sampleRate;
        this.frameSize = frameSize;
        this.threshold = 0.1;

        console.log(`🦀 [Rust DSP] YIN Pitch Detector: sr=${sampleRate}, frame=${frameSize}`);
    }

    /**
     * Set YIN threshold
     */
    setThreshold(threshold) {
        this.threshold = threshold;
    }

    /**
     * Detect pitch using YIN algorithm
     * @param {Float32Array} samples - Input audio samples
     * @returns {Float32Array} [frequency, confidence] or [0, 0] if unvoiced
     */
    detect(samples) {
        const n = Math.min(samples.length, this.frameSize);
        const tauMax = Math.floor(n / 2);

        // Step 1: Difference function
        const diff = new Float32Array(tauMax);
        for (let tau = 1; tau < tauMax; tau++) {
            for (let j = 0; j < n - tau; j++) {
                const delta = samples[j] - samples[j + tau];
                diff[tau] += delta * delta;
            }
        }

        // Step 2: Cumulative mean normalized difference (CMND)
        const cmnd = new Float32Array(tauMax);
        cmnd[0] = 1.0;
        let runningSum = 0;

        for (let tau = 1; tau < tauMax; tau++) {
            runningSum += diff[tau];
            cmnd[tau] = diff[tau] * tau / Math.max(runningSum, 1e-10);
        }

        // Step 3: Absolute threshold with parabolic interpolation
        const minPeriod = Math.floor(this.sampleRate / 500); // Max F0 = 500 Hz
        const maxPeriod = Math.floor(this.sampleRate / 50);   // Min F0 = 50 Hz

        for (let tau = minPeriod; tau < Math.min(maxPeriod, tauMax); tau++) {
            if (cmnd[tau] < this.threshold) {
                // Step 4: Parabolic interpolation for sub-sample accuracy
                if (tau > 0 && tau < tauMax - 1) {
                    const s0 = cmnd[tau - 1];
                    const s1 = cmnd[tau];
                    const s2 = cmnd[tau + 1];

                    const denominator = 2.0 * (s0 - 2.0 * s1 + s2);
                    if (Math.abs(denominator) > 1e-10) {
                        const adjustment = (s0 - s2) / denominator;
                        const refinedTau = tau + adjustment;
                        const frequency = this.sampleRate / refinedTau;
                        const confidence = 1.0 - cmnd[tau];

                        return new Float32Array([frequency, confidence]);
                    }
                }

                const frequency = this.sampleRate / tau;
                const confidence = 1.0 - cmnd[tau];
                return new Float32Array([frequency, confidence]);
            }
        }

        // No pitch found - unvoiced
        return new Float32Array([0.0, 0.0]);
    }

    /**
     * Batch pitch detection over frames
     * @param {Float32Array} samples - Input audio samples
     * @param {number} hopSize - Hop size in samples
     * @returns {Float32Array} Interleaved [freq, conf, freq, conf, ...]
     */
    detectBatch(samples, hopSize = 512) {
        const numFrames = Math.floor((samples.length - this.frameSize) / hopSize) + 1;
        if (numFrames <= 0) return new Float32Array(0);

        const results = new Float32Array(numFrames * 2);

        for (let i = 0; i < numFrames; i++) {
            const start = i * hopSize;
            const end = Math.min(start + this.frameSize, samples.length);
            const frame = samples.slice(start, end);

            const result = this.detect(frame);
            results[i * 2] = result[0];
            results[i * 2 + 1] = result[1];
        }

        return results;
    }
}

/**
 * Formant Analyzer using LPC (Linear Predictive Coding)
 * Exact port of Rust FormantAnalyzer
 */
export class FormantAnalyzer {
    constructor(sampleRate = 44100, lpcOrder = 12) {
        this.sampleRate = sampleRate;
        this.lpcOrder = lpcOrder;

        console.log(`🦀 [Rust DSP] Formant Analyzer: sr=${sampleRate}, order=${lpcOrder}`);
    }

    /**
     * Compute LPC coefficients using Levinson-Durbin recursion
     * @private
     */
    _computeLpc(samples) {
        const n = samples.length;
        const order = this.lpcOrder;

        // Compute autocorrelation
        const r = new Float32Array(order + 1);
        for (let i = 0; i <= order; i++) {
            for (let j = 0; j < n - i; j++) {
                r[i] += samples[j] * samples[j + i];
            }
        }

        if (Math.abs(r[0]) < 1e-10) {
            return new Float32Array(order);
        }

        // Levinson-Durbin recursion
        const a = new Float32Array(order);
        const aPrev = new Float32Array(order);
        let e = r[0];

        for (let i = 0; i < order; i++) {
            let lambda = r[i + 1];
            for (let j = 0; j < i; j++) {
                lambda -= aPrev[j] * r[i - j];
            }
            lambda /= e;

            a[i] = lambda;
            for (let j = 0; j < i; j++) {
                a[j] = aPrev[j] - lambda * aPrev[i - 1 - j];
            }

            e *= (1.0 - lambda * lambda);
            aPrev.set(a);
        }

        return a;
    }

    /**
     * Find formant frequencies from audio samples
     * @param {Float32Array} samples - Input audio samples
     * @returns {Float32Array} Formant frequencies (up to 4)
     */
    analyze(samples) {
        const lpc = this._computeLpc(samples);

        // Find roots of LPC polynomial via frequency response peaks
        const nPoints = 512;
        const response = [];

        for (let i = 0; i < nPoints; i++) {
            const freq = i * this.sampleRate / 2.0 / nPoints;
            const omega = 2.0 * Math.PI * freq / this.sampleRate;

            let realSum = 1.0;
            let imagSum = 0.0;

            for (let k = 0; k < lpc.length; k++) {
                const angle = -(k + 1) * omega;
                realSum -= lpc[k] * Math.cos(angle);
                imagSum -= lpc[k] * Math.sin(angle);
            }

            const magnitude = 1.0 / Math.sqrt(realSum * realSum + imagSum * imagSum + 1e-10);
            response.push({ freq, magnitude });
        }

        // Find peaks (formants)
        const formants = [];
        for (let i = 1; i < response.length - 1; i++) {
            if (response[i].magnitude > response[i - 1].magnitude &&
                response[i].magnitude > response[i + 1].magnitude) {
                // Check if this is a significant peak
                const avg = (response[i - 1].magnitude + response[i + 1].magnitude) / 2.0;
                if (response[i].magnitude > avg * 1.5) {
                    formants.push(response[i].freq);
                }
            }
        }

        // Return first 4 formants
        return new Float32Array(formants.slice(0, 4));
    }
}

/**
 * High-quality resampler using Sinc/Lanczos interpolation
 * Exact port of Rust resample function
 * 
 * @param {Float32Array} samples - Input audio samples
 * @param {number} fromRate - Source sample rate
 * @param {number} toRate - Target sample rate
 * @returns {Float32Array} Resampled audio
 */
export function resample(samples, fromRate, toRate) {
    const ratio = toRate / fromRate;
    const newLength = Math.floor(samples.length * ratio);
    const output = new Float32Array(newLength);

    // Sinc interpolation window size
    const windowSize = 16;

    for (let i = 0; i < newLength; i++) {
        const srcPos = i / ratio;
        const srcIdx = Math.floor(srcPos);

        let sample = 0.0;
        let weightSum = 0.0;

        const jStart = Math.max(0, srcIdx - windowSize);
        const jEnd = Math.min(samples.length, srcIdx + windowSize);

        for (let j = jStart; j < jEnd; j++) {
            const x = (j - srcPos) * Math.PI;

            // Sinc function
            const sinc = Math.abs(x) < 1e-6 ? 1.0 : Math.sin(x) / x;

            // Lanczos window
            const lanczosX = x / windowSize;
            let lanczos;
            if (Math.abs(lanczosX) >= 1.0) {
                lanczos = 0.0;
            } else if (Math.abs(lanczosX) < 1e-6) {
                lanczos = 1.0;
            } else {
                const lanczosAngle = lanczosX * Math.PI;
                lanczos = Math.sin(lanczosAngle) / lanczosAngle;
            }

            const w = sinc * lanczos;
            sample += samples[j] * w;
            weightSum += w;
        }

        output[i] = sample / Math.max(weightSum, 1e-10);
    }

    console.log(`🦀 [Rust DSP] Resampled: ${fromRate}Hz → ${toRate}Hz (${samples.length} → ${newLength} samples)`);

    return output;
}

// ========================================
// Convenience Factory Functions
// ========================================

/**
 * Create FFT Processor
 */
export function createFftProcessor(size = 2048) {
    return new FftProcessor(size);
}

/**
 * Create Voice Activity Detector
 */
export function createVoiceActivityDetector(frameSize = 512, hopSize = 256) {
    return new VoiceActivityDetector(frameSize, hopSize);
}

/**
 * Create Pitch Detector
 */
export function createPitchDetector(sampleRate = 44100, frameSize = 2048) {
    return new PitchDetector(sampleRate, frameSize);
}

/**
 * Create Formant Analyzer
 */
export function createFormantAnalyzer(sampleRate = 44100, lpcOrder = 12) {
    return new FormantAnalyzer(sampleRate, lpcOrder);
}

// ========================================
// Compatibility Layer (matches dsp-wasm-loader.js API)
// ========================================

/**
 * Initialize DSP (no-op for pure JS, exists for API compatibility)
 */
export async function initDSP() {
    console.log('🦀 [DSP] Pure JavaScript DSP ready (Rust port)');
    return true;
}

/**
 * Check if DSP is available (always true for JS)
 */
export function isDSPAvailable() {
    return true;
}

export default {
    // Classes
    FftProcessor,
    VoiceActivityDetector,
    PitchDetector,
    FormantAnalyzer,

    // Functions
    resample,
    createFftProcessor,
    createVoiceActivityDetector,
    createPitchDetector,
    createFormantAnalyzer,

    // Compatibility
    initDSP,
    isDSPAvailable,
};
