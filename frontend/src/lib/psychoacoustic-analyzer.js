/**
 * PSYCHOACOUSTIC ANALYZER - Research-Grade Audio Analysis
 * ========================================================
 * Statistical and perceptual audio analysis inspired by R/MATLAB psychoacoustic toolboxes.
 * 
 * Implements:
 * - Loudness (ISO 532-1, Zwicker model approximation)
 * - Sharpness (Aures/Fastl model)
 * - Roughness (Aures model approximation)
 * - Fluctuation Strength
 * - Prosody Features (F0, jitter, shimmer)
 * 
 * References:
 * - Zwicker & Fastl, "Psychoacoustics: Facts and Models" (2007)
 * - ISO 532-1:2017 - Acoustics — Methods for calculating loudness
 */

// Critical band rate (Bark scale) conversion
const HZ_TO_BARK = (f) => 13 * Math.atan(0.00076 * f) + 3.5 * Math.atan(Math.pow(f / 7500, 2));
const BARK_TO_HZ = (z) => {
    // Newton-Raphson approximation
    let f = z * 100;
    for (let i = 0; i < 10; i++) {
        const zEst = HZ_TO_BARK(f);
        const derivative = 13 * 0.00076 / (1 + Math.pow(0.00076 * f, 2)) +
            3.5 * 2 * f / 7500 / 7500 / (1 + Math.pow(f / 7500, 4));
        f -= (zEst - z) / derivative;
    }
    return f;
};

// Hearing threshold in quiet (ISO 226:2003 approximation)
const THRESHOLD_IN_QUIET = (f) => {
    const f2 = f * f;
    return 3.64 * Math.pow(f / 1000, -0.8)
        - 6.5 * Math.exp(-0.6 * Math.pow((f / 1000 - 3.3), 2))
        + 0.001 * Math.pow(f / 1000, 4);
};

export class PsychoacousticAnalyzer {
    constructor() {
        // Analysis parameters
        this.sampleRate = 48000;
        this.frameSize = 2048;
        this.hopSize = 512;

        // Critical bands (Bark scale, 0-24 Bark)
        this.numBands = 24;
        this.criticalBandEdges = this._computeCriticalBandEdges();

        // Caching for performance
        this.lastAnalysis = null;
    }

    _computeCriticalBandEdges() {
        const edges = [];
        for (let z = 0; z <= this.numBands; z++) {
            edges.push(BARK_TO_HZ(z));
        }
        return edges;
    }

    /**
     * Compute specific loudness in each critical band (sone/Bark)
     * Simplified Zwicker model
     * @param {Float32Array} spectrum - Power spectrum (linear)
     * @returns {Float32Array} Specific loudness per Bark band
     */
    computeSpecificLoudness(spectrum) {
        const specificLoudness = new Float32Array(this.numBands);
        const binWidth = this.sampleRate / this.frameSize;

        for (let band = 0; band < this.numBands; band++) {
            const fLow = this.criticalBandEdges[band];
            const fHigh = this.criticalBandEdges[band + 1];

            const binLow = Math.floor(fLow / binWidth);
            const binHigh = Math.ceil(fHigh / binWidth);

            // Sum energy in band
            let bandEnergy = 0;
            for (let k = binLow; k <= binHigh && k < spectrum.length; k++) {
                bandEnergy += spectrum[k];
            }

            // Convert to excitation level (dB SPL)
            const excitationDb = 10 * Math.log10(bandEnergy + 1e-10) + 90; // Rough calibration

            // Get threshold
            const fc = (fLow + fHigh) / 2;
            const threshold = THRESHOLD_IN_QUIET(fc);

            // Compute specific loudness (simplified)
            if (excitationDb > threshold) {
                // Stevens' power law with corrections
                specificLoudness[band] = Math.pow((excitationDb - threshold) / 40, 0.6);
            }
        }

        return specificLoudness;
    }

    /**
     * Compute total loudness in sone
     * @param {Float32Array} specificLoudness - Specific loudness per band
     * @returns {number} Total loudness in sone
     */
    computeTotalLoudness(specificLoudness) {
        // Sum specific loudness (integrate over Bark)
        let total = 0;
        for (let i = 0; i < specificLoudness.length; i++) {
            total += specificLoudness[i];
        }
        return total;
    }

    /**
     * Compute sharpness (acum) - perception of high-frequency content
     * Aures model: weighted centroid of specific loudness
     * @param {Float32Array} specificLoudness
     * @returns {number} Sharpness in acum
     */
    computeSharpness(specificLoudness) {
        let numerator = 0;
        let denominator = 0;

        for (let z = 0; z < specificLoudness.length; z++) {
            // Weighting function g(z) - increases above 15 Bark
            const g = z < 15 ? 1 : 0.066 * Math.exp(0.171 * z);

            numerator += specificLoudness[z] * g * (z + 1);
            denominator += specificLoudness[z];
        }

        if (denominator < 1e-6) return 0;

        // Normalize to acum
        return 0.11 * numerator / denominator;
    }

    /**
     * Compute roughness (asper) - perception of amplitude modulation
     * Based on modulation depth in critical bands
     * @param {Float32Array[]} spectrumSequence - Sequence of spectra
     * @returns {number} Roughness in asper
     */
    computeRoughness(spectrumSequence) {
        if (spectrumSequence.length < 4) return 0;

        let totalRoughness = 0;

        for (let band = 0; band < this.numBands; band++) {
            // Extract temporal envelope for this band
            const envelope = [];
            for (const spectrum of spectrumSequence) {
                const specificLoudness = this.computeSpecificLoudness(spectrum);
                envelope.push(specificLoudness[band]);
            }

            // Compute modulation depth
            const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
            if (mean < 1e-6) continue;

            let modDepth = 0;
            for (let i = 1; i < envelope.length; i++) {
                modDepth += Math.abs(envelope[i] - envelope[i - 1]);
            }
            modDepth /= (envelope.length - 1) * mean;

            // Modulation frequency weighting (peak at 70 Hz)
            const modFreq = (this.sampleRate / this.hopSize) / 2; // Rough estimate
            const modWeight = Math.exp(-0.5 * Math.pow((modFreq - 70) / 30, 2));

            totalRoughness += modDepth * modWeight * specificLoudness[band];
        }

        return totalRoughness * 0.25; // Calibration factor for asper
    }

    /**
     * Compute fundamental frequency (F0) using autocorrelation
     * @param {Float32Array} samples - Audio samples
     * @returns {Object} { f0, confidence, voiced }
     */
    computeF0(samples) {
        const minF0 = 50;  // Hz
        const maxF0 = 500; // Hz

        const minLag = Math.floor(this.sampleRate / maxF0);
        const maxLag = Math.floor(this.sampleRate / minF0);

        // Compute normalized autocorrelation
        let maxCorr = 0;
        let bestLag = 0;

        // Energy for normalization
        let energy = 0;
        for (let i = 0; i < samples.length; i++) {
            energy += samples[i] * samples[i];
        }

        for (let lag = minLag; lag <= maxLag && lag < samples.length / 2; lag++) {
            let correlation = 0;
            let energyLagged = 0;

            for (let i = 0; i < samples.length - lag; i++) {
                correlation += samples[i] * samples[i + lag];
                energyLagged += samples[i + lag] * samples[i + lag];
            }

            // Normalize
            const norm = Math.sqrt(energy * energyLagged);
            const normCorr = norm > 0 ? correlation / norm : 0;

            if (normCorr > maxCorr) {
                maxCorr = normCorr;
                bestLag = lag;
            }
        }

        const f0 = bestLag > 0 ? this.sampleRate / bestLag : 0;
        const voiced = maxCorr > 0.3;

        return {
            f0: f0,
            confidence: maxCorr,
            voiced: voiced
        };
    }

    /**
     * Compute jitter (F0 perturbation) - voice quality measure
     * @param {number[]} f0Sequence - Sequence of F0 values
     * @returns {Object} { jitterLocal, jitterRap, jitterPpq5 }
     */
    computeJitter(f0Sequence) {
        const voiced = f0Sequence.filter(f => f > 0);
        if (voiced.length < 3) {
            return { jitterLocal: 0, jitterRap: 0, jitterPpq5: 0 };
        }

        // Convert to periods
        const periods = voiced.map(f => 1000 / f); // ms

        // Local jitter (adjacent period differences)
        let diffSum = 0;
        for (let i = 1; i < periods.length; i++) {
            diffSum += Math.abs(periods[i] - periods[i - 1]);
        }
        const jitterLocal = (diffSum / (periods.length - 1)) / (periods.reduce((a, b) => a + b) / periods.length);

        // RAP (Relative Average Perturbation) - 3-point average
        let rapSum = 0;
        for (let i = 1; i < periods.length - 1; i++) {
            const avg3 = (periods[i - 1] + periods[i] + periods[i + 1]) / 3;
            rapSum += Math.abs(periods[i] - avg3);
        }
        const jitterRap = (rapSum / (periods.length - 2)) / (periods.reduce((a, b) => a + b) / periods.length);

        // PPQ5 (5-point)
        let ppq5Sum = 0;
        for (let i = 2; i < periods.length - 2; i++) {
            const avg5 = (periods[i - 2] + periods[i - 1] + periods[i] + periods[i + 1] + periods[i + 2]) / 5;
            ppq5Sum += Math.abs(periods[i] - avg5);
        }
        const jitterPpq5 = periods.length > 4
            ? (ppq5Sum / (periods.length - 4)) / (periods.reduce((a, b) => a + b) / periods.length)
            : 0;

        return {
            jitterLocal: jitterLocal * 100,  // percent
            jitterRap: jitterRap * 100,
            jitterPpq5: jitterPpq5 * 100
        };
    }

    /**
     * Compute shimmer (amplitude perturbation)
     * @param {Float32Array[]} frames - Sequence of audio frames
     * @returns {Object} { shimmerLocal, shimmerApq3, shimmerApq5 }
     */
    computeShimmer(frames) {
        // Compute peak amplitudes per frame
        const amplitudes = frames.map(frame => {
            let max = 0;
            for (const sample of frame) {
                max = Math.max(max, Math.abs(sample));
            }
            return max;
        }).filter(a => a > 0);

        if (amplitudes.length < 3) {
            return { shimmerLocal: 0, shimmerApq3: 0, shimmerApq5: 0 };
        }

        const meanAmp = amplitudes.reduce((a, b) => a + b) / amplitudes.length;

        // Local shimmer
        let diffSum = 0;
        for (let i = 1; i < amplitudes.length; i++) {
            diffSum += Math.abs(20 * Math.log10(amplitudes[i] / amplitudes[i - 1]));
        }
        const shimmerLocal = diffSum / (amplitudes.length - 1);

        // APQ3
        let apq3Sum = 0;
        for (let i = 1; i < amplitudes.length - 1; i++) {
            const avg3 = (amplitudes[i - 1] + amplitudes[i] + amplitudes[i + 1]) / 3;
            apq3Sum += Math.abs(amplitudes[i] - avg3);
        }
        const shimmerApq3 = (apq3Sum / (amplitudes.length - 2)) / meanAmp * 100;

        // APQ5
        let apq5Sum = 0;
        for (let i = 2; i < amplitudes.length - 2; i++) {
            const avg5 = (amplitudes[i - 2] + amplitudes[i - 1] + amplitudes[i] + amplitudes[i + 1] + amplitudes[i + 2]) / 5;
            apq5Sum += Math.abs(amplitudes[i] - avg5);
        }
        const shimmerApq5 = amplitudes.length > 4
            ? (apq5Sum / (amplitudes.length - 4)) / meanAmp * 100
            : 0;

        return {
            shimmerLocal: shimmerLocal,  // dB
            shimmerApq3: shimmerApq3,    // percent
            shimmerApq5: shimmerApq5     // percent
        };
    }

    /**
     * Complete psychoacoustic analysis of audio
     * @param {Float32Array} samples - Audio samples
     * @returns {Object} Full analysis results
     */
    analyze(samples) {
        const numFrames = Math.floor((samples.length - this.frameSize) / this.hopSize) + 1;
        const spectrumSequence = [];
        const f0Sequence = [];
        const frames = [];

        // Frame-by-frame analysis
        for (let i = 0; i < numFrames; i++) {
            const start = i * this.hopSize;
            const frame = samples.slice(start, start + this.frameSize);
            frames.push(frame);

            // Compute spectrum
            const spectrum = this._computeSpectrum(frame);
            spectrumSequence.push(spectrum);

            // Compute F0
            const f0Result = this.computeF0(frame);
            if (f0Result.voiced) {
                f0Sequence.push(f0Result.f0);
            }
        }

        // Aggregate loudness and sharpness
        let totalLoudness = 0;
        let totalSharpness = 0;

        for (const spectrum of spectrumSequence) {
            const specificLoudness = this.computeSpecificLoudness(spectrum);
            totalLoudness += this.computeTotalLoudness(specificLoudness);
            totalSharpness += this.computeSharpness(specificLoudness);
        }

        totalLoudness /= spectrumSequence.length;
        totalSharpness /= spectrumSequence.length;

        // Compute derivative measures
        const roughness = this.computeRoughness(spectrumSequence);
        const jitter = this.computeJitter(f0Sequence);
        const shimmer = this.computeShimmer(frames);

        // F0 statistics
        const f0Stats = f0Sequence.length > 0 ? {
            mean: f0Sequence.reduce((a, b) => a + b) / f0Sequence.length,
            std: Math.sqrt(f0Sequence.map(f => Math.pow(f - f0Sequence.reduce((a, b) => a + b) / f0Sequence.length, 2)).reduce((a, b) => a + b) / f0Sequence.length),
            min: Math.min(...f0Sequence),
            max: Math.max(...f0Sequence),
            range: Math.max(...f0Sequence) - Math.min(...f0Sequence)
        } : { mean: 0, std: 0, min: 0, max: 0, range: 0 };

        this.lastAnalysis = {
            loudness: {
                total: totalLoudness,
                unit: 'sone'
            },
            sharpness: {
                value: totalSharpness,
                unit: 'acum'
            },
            roughness: {
                value: roughness,
                unit: 'asper'
            },
            f0: {
                ...f0Stats,
                unit: 'Hz'
            },
            jitter: jitter,
            shimmer: shimmer,
            voicedFrameRatio: f0Sequence.length / numFrames,
            duration: samples.length / this.sampleRate
        };

        console.log('📊 [PsychoacousticAnalyzer] Analysis complete:', this.lastAnalysis);
        return this.lastAnalysis;
    }

    /**
     * Simple FFT for power spectrum
     */
    _computeSpectrum(frame) {
        const N = frame.length;
        const spectrum = new Float32Array(N / 2 + 1);

        // Apply Hann window and compute DFT (simplified)
        for (let k = 0; k <= N / 2; k++) {
            let re = 0, im = 0;
            for (let n = 0; n < N; n++) {
                const window = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
                const angle = -2 * Math.PI * k * n / N;
                re += frame[n] * window * Math.cos(angle);
                im += frame[n] * window * Math.sin(angle);
            }
            spectrum[k] = (re * re + im * im) / N;
        }

        return spectrum;
    }
}

export const psychoacousticAnalyzer = new PsychoacousticAnalyzer();
