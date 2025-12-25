/**
 * DSP WASM Loader
 * ================
 * Dynamically loads the Rust-compiled WebAssembly DSP module.
 * Provides FFT, VAD, Pitch Detection, and Formant Analysis.
 * 
 * @module dsp-wasm-loader
 */

let wasmModule = null;
let isInitialized = false;
let initPromise = null;

/**
 * Initialize the WASM DSP module
 * @returns {Promise<Object>} The initialized WASM exports
 */
export async function initDSP() {
    if (isInitialized && wasmModule) {
        return wasmModule;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            // Dynamic import of the WASM module
            const wasmPath = '/wasm/sanctuary_dsp.js';
            const wasm = await import(/* webpackIgnore: true */ wasmPath);

            // Initialize the WASM module
            await wasm.default('/wasm/sanctuary_dsp_bg.wasm');

            wasmModule = wasm;
            isInitialized = true;

            console.log('🦀 [DSP] Sanctuary DSP WASM module loaded successfully');
            return wasmModule;

        } catch (error) {
            console.warn('🦀 [DSP] WASM module failed to load, using JS fallback:', error.message);
            isInitialized = false;
            wasmModule = null;
            return null;
        }
    })();

    return initPromise;
}

/**
 * Check if WASM DSP is available
 */
export function isDSPAvailable() {
    return isInitialized && wasmModule !== null;
}

/**
 * Get FFT Processor instance
 * @param {number} size - FFT size (default 2048)
 */
export function createFftProcessor(size = 2048) {
    if (!wasmModule) {
        throw new Error('WASM DSP not initialized. Call initDSP() first.');
    }
    return new wasmModule.FftProcessor(size);
}

/**
 * Get Voice Activity Detector instance
 * @param {number} frameSize - Frame size in samples
 * @param {number} hopSize - Hop size in samples
 */
export function createVoiceActivityDetector(frameSize = 512, hopSize = 256) {
    if (!wasmModule) {
        throw new Error('WASM DSP not initialized. Call initDSP() first.');
    }
    return new wasmModule.VoiceActivityDetector(frameSize, hopSize);
}

/**
 * Get Pitch Detector instance (YIN algorithm)
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} frameSize - Frame size in samples
 */
export function createPitchDetector(sampleRate = 44100, frameSize = 2048) {
    if (!wasmModule) {
        throw new Error('WASM DSP not initialized. Call initDSP() first.');
    }
    return new wasmModule.PitchDetector(sampleRate, frameSize);
}

/**
 * Get Formant Analyzer instance
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} lpcOrder - LPC order (default 12)
 */
export function createFormantAnalyzer(sampleRate = 44100, lpcOrder = 12) {
    if (!wasmModule) {
        throw new Error('WASM DSP not initialized. Call initDSP() first.');
    }
    return new wasmModule.FormantAnalyzer(sampleRate, lpcOrder);
}

/**
 * Resample audio using high-quality sinc interpolation
 * @param {Float32Array} samples - Input samples
 * @param {number} fromRate - Source sample rate
 * @param {number} toRate - Target sample rate
 */
export function resample(samples, fromRate, toRate) {
    if (!wasmModule) {
        throw new Error('WASM DSP not initialized. Call initDSP() first.');
    }
    return wasmModule.resample(samples, fromRate, toRate);
}

// ----- JavaScript Fallback Implementations -----

/**
 * JavaScript fallback FFT using basic DFT
 * Used when WASM is not available
 */
export class FallbackFftProcessor {
    constructor(size) {
        this.size = size;
        this.window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            this.window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
        }
    }

    powerSpectrum(samples) {
        const n = Math.min(samples.length, this.size);
        const result = new Float32Array(Math.floor(this.size / 2) + 1);

        for (let k = 0; k < result.length; k++) {
            let real = 0, imag = 0;
            for (let t = 0; t < n; t++) {
                const angle = -2 * Math.PI * k * t / this.size;
                const windowed = samples[t] * this.window[t];
                real += windowed * Math.cos(angle);
                imag += windowed * Math.sin(angle);
            }
            result[k] = (real * real + imag * imag) / this.size;
        }

        return result;
    }

    magnitudeDb(samples) {
        const power = this.powerSpectrum(samples);
        const result = new Float32Array(power.length);
        for (let i = 0; i < power.length; i++) {
            result[i] = 10 * Math.log10(power[i] + 1e-10);
        }
        return result;
    }
}

/**
 * JavaScript fallback VAD
 */
export class FallbackVoiceActivityDetector {
    constructor(frameSize = 512, hopSize = 256) {
        this.frameSize = frameSize;
        this.hopSize = hopSize;
        this.energyThreshold = -40;
        this.zcrThreshold = 0.1;
    }

    detect(samples) {
        const numFrames = Math.floor((samples.length - this.frameSize) / this.hopSize) + 1;
        const result = new Uint8Array(numFrames);
        let hangover = 0;

        for (let i = 0; i < numFrames; i++) {
            const start = i * this.hopSize;
            const end = Math.min(start + this.frameSize, samples.length);

            // Energy
            let energy = 0;
            for (let j = start; j < end; j++) {
                energy += samples[j] * samples[j];
            }
            const energyDb = 10 * Math.log10(energy / (end - start) + 1e-10);

            // Zero crossing rate
            let zcr = 0;
            for (let j = start + 1; j < end; j++) {
                if ((samples[j - 1] >= 0) !== (samples[j] >= 0)) zcr++;
            }
            zcr /= (end - start);

            const isSpeech = energyDb > this.energyThreshold && zcr < this.zcrThreshold;

            if (isSpeech) hangover = 5;
            result[i] = hangover > 0 ? 1 : 0;
            if (hangover > 0) hangover--;
        }

        return result;
    }
}

export default {
    initDSP,
    isDSPAvailable,
    createFftProcessor,
    createVoiceActivityDetector,
    createPitchDetector,
    createFormantAnalyzer,
    resample,
    FallbackFftProcessor,
    FallbackVoiceActivityDetector
};
