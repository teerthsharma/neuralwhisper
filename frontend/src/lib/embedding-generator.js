/**
 * Voice Embedding Generator
 * ==========================
 * Client-side voice feature extraction and Kokoro voice mapping.
 * Replaces Python generate_f5_embeddings.py for browser execution.
 * 
 * Uses WebGPU for GPU acceleration when available.
 * 
 * @module embedding-generator
 */

import { AudioProcessor } from './webgpu-audio-processor.js';
import { initDSP, isDSPAvailable, createPitchDetector, createFormantAnalyzer } from './dsp-wasm-loader.js';

// Kokoro voice presets with characteristics
const KOKORO_VOICES = {
    'af_bella': { gender: 'female', accent: 'american', pitch: 'medium', warmth: 0.7, clarity: 0.8 },
    'af_nicole': { gender: 'female', accent: 'american', pitch: 'high', warmth: 0.6, clarity: 0.9 },
    'af_sarah': { gender: 'female', accent: 'american', pitch: 'medium', warmth: 0.8, clarity: 0.75 },
    'af_sky': { gender: 'female', accent: 'american', pitch: 'high', warmth: 0.5, clarity: 0.85 },
    'am_adam': { gender: 'male', accent: 'american', pitch: 'low', warmth: 0.6, clarity: 0.8 },
    'am_michael': { gender: 'male', accent: 'american', pitch: 'medium', warmth: 0.7, clarity: 0.75 },
    'bf_emma': { gender: 'female', accent: 'british', pitch: 'medium', warmth: 0.65, clarity: 0.85 },
    'bf_isabella': { gender: 'female', accent: 'british', pitch: 'high', warmth: 0.7, clarity: 0.8 },
    'bm_george': { gender: 'male', accent: 'british', pitch: 'low', warmth: 0.6, clarity: 0.8 },
    'bm_lewis': { gender: 'male', accent: 'british', pitch: 'medium', warmth: 0.65, clarity: 0.85 },
    // ASMR-optimized voices
    'af_heart': { gender: 'female', accent: 'american', pitch: 'soft', warmth: 0.9, clarity: 0.6, asmr: true },
    'af_jessica': { gender: 'female', accent: 'american', pitch: 'medium', warmth: 0.75, clarity: 0.7 },
    'af_kailey': { gender: 'female', accent: 'american', pitch: 'high', warmth: 0.65, clarity: 0.8 },
    'af_river': { gender: 'female', accent: 'american', pitch: 'low', warmth: 0.85, clarity: 0.65, asmr: true },
};

/**
 * Voice Embedding Generator
 */
export class EmbeddingGenerator {
    constructor() {
        this.audioProcessor = null;
        this.pitchDetector = null;
        this.formantAnalyzer = null;
        this.initialized = false;
    }

    /**
     * Initialize all processing engines
     */
    async init() {
        if (this.initialized) return;

        // Initialize WebGPU audio processor
        this.audioProcessor = new AudioProcessor();
        await this.audioProcessor.init();

        // Try to initialize WASM DSP
        await initDSP();

        if (isDSPAvailable()) {
            this.pitchDetector = createPitchDetector(44100, 2048);
            this.formantAnalyzer = createFormantAnalyzer(44100, 12);
            console.log('🎤 [EmbeddingGen] WASM DSP modules loaded');
        }

        this.initialized = true;
        console.log('🎤 [EmbeddingGen] Initialized');
    }

    /**
     * Load audio file and decode to Float32Array
     */
    async loadAudio(file) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get mono audio data
        const channelData = audioBuffer.getChannelData(0);

        return {
            samples: new Float32Array(channelData),
            sampleRate: audioBuffer.sampleRate,
            duration: audioBuffer.duration,
        };
    }

    /**
     * Estimate pitch using autocorrelation (JS fallback)
     */
    _estimatePitchJS(samples, sampleRate) {
        const frameSize = 2048;
        const hopSize = 512;
        const minPeriod = Math.floor(sampleRate / 500); // 500 Hz max
        const maxPeriod = Math.floor(sampleRate / 50);  // 50 Hz min

        const pitches = [];

        for (let start = 0; start + frameSize < samples.length; start += hopSize) {
            const frame = samples.slice(start, start + frameSize);

            // Autocorrelation
            let bestPeriod = 0;
            let bestCorr = -1;

            for (let period = minPeriod; period < Math.min(maxPeriod, frameSize / 2); period++) {
                let corr = 0;
                let norm1 = 0, norm2 = 0;

                for (let i = 0; i < frameSize - period; i++) {
                    corr += frame[i] * frame[i + period];
                    norm1 += frame[i] * frame[i];
                    norm2 += frame[i + period] * frame[i + period];
                }

                corr /= Math.sqrt(norm1 * norm2 + 1e-10);

                if (corr > bestCorr) {
                    bestCorr = corr;
                    bestPeriod = period;
                }
            }

            if (bestCorr > 0.5 && bestPeriod > 0) {
                pitches.push(sampleRate / bestPeriod);
            }
        }

        if (pitches.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };

        pitches.sort((a, b) => a - b);
        const q1 = pitches[Math.floor(pitches.length * 0.25)];
        const q3 = pitches[Math.floor(pitches.length * 0.75)];
        const iqr = q3 - q1;
        const filtered = pitches.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);

        const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
        const variance = filtered.reduce((a, b) => a + (b - mean) ** 2, 0) / filtered.length;

        return {
            mean,
            std: Math.sqrt(variance),
            min: Math.min(...filtered),
            max: Math.max(...filtered),
        };
    }

    /**
     * Calculate warmth (low frequency energy ratio)
     */
    _calculateWarmth(spectrum, sampleRate, fftSize) {
        const lowFreqBin = Math.floor(500 * fftSize / sampleRate);
        const midFreqBin = Math.floor(2000 * fftSize / sampleRate);

        let lowEnergy = 0, midEnergy = 0;

        for (let i = 1; i < lowFreqBin && i < spectrum.length; i++) {
            lowEnergy += spectrum[i];
        }

        for (let i = lowFreqBin; i < midFreqBin && i < spectrum.length; i++) {
            midEnergy += spectrum[i];
        }

        return lowEnergy / (lowEnergy + midEnergy + 1e-10);
    }

    /**
     * Calculate clarity (high frequency definition)
     */
    _calculateClarity(spectrum, sampleRate, fftSize) {
        const midFreqBin = Math.floor(2000 * fftSize / sampleRate);
        const highFreqBin = Math.floor(8000 * fftSize / sampleRate);

        let midEnergy = 0, highEnergy = 0;

        for (let i = midFreqBin; i < highFreqBin && i < spectrum.length; i++) {
            midEnergy += spectrum[i];
        }

        for (let i = highFreqBin; i < spectrum.length; i++) {
            highEnergy += spectrum[i];
        }

        return highEnergy / (midEnergy + highEnergy + 1e-10);
    }

    /**
     * Estimate speaking rate from energy variations
     */
    _estimateSpeakingRate(samples, sampleRate) {
        const frameSize = Math.floor(sampleRate * 0.025); // 25ms frames
        const hopSize = Math.floor(sampleRate * 0.010);   // 10ms hop

        const energies = [];
        for (let start = 0; start + frameSize < samples.length; start += hopSize) {
            let energy = 0;
            for (let i = 0; i < frameSize; i++) {
                energy += samples[start + i] ** 2;
            }
            energies.push(Math.sqrt(energy / frameSize));
        }

        // Count energy peaks (syllables)
        const threshold = Math.max(...energies) * 0.3;
        let peaks = 0;
        let wasAbove = false;

        for (const energy of energies) {
            const isAbove = energy > threshold;
            if (isAbove && !wasAbove) peaks++;
            wasAbove = isAbove;
        }

        const duration = samples.length / sampleRate;
        return peaks / duration; // Syllables per second
    }

    /**
     * Classify gender based on pitch
     */
    _classifyGender(pitchMean) {
        if (pitchMean < 165) return 'male';
        if (pitchMean > 200) return 'female';
        return 'neutral';
    }

    /**
     * Map features to best Kokoro voice
     */
    mapToKokoroVoice(features) {
        let bestVoice = 'af_bella';
        let bestScore = -Infinity;

        for (const [voiceId, voiceParams] of Object.entries(KOKORO_VOICES)) {
            let score = 0;

            // Gender match
            if (voiceParams.gender === features.gender) score += 5;

            // Warmth similarity
            score -= Math.abs(voiceParams.warmth - features.warmth) * 3;

            // Clarity similarity
            score -= Math.abs(voiceParams.clarity - features.clarity) * 2;

            // ASMR bonus for breathy voices
            if (voiceParams.asmr && features.breathiness > 0.3) score += 2;

            if (score > bestScore) {
                bestScore = score;
                bestVoice = voiceId;
            }
        }

        return {
            voiceId: bestVoice,
            confidence: Math.min(1, (bestScore + 10) / 15),
            voiceParams: KOKORO_VOICES[bestVoice],
        };
    }

    /**
     * Generate full voice embedding from audio file
     */
    async generateEmbedding(file) {
        await this.init();

        console.log('🎤 [EmbeddingGen] Processing:', file.name);

        // Load audio
        const { samples, sampleRate, duration } = await this.loadAudio(file);
        console.log(`   Audio: ${duration.toFixed(2)}s @ ${sampleRate}Hz`);

        // Extract features using WebGPU
        const [vadResult, spectrumResult, basicFeatures] = await Promise.all([
            this.audioProcessor.detectVoiceActivity(samples, sampleRate),
            this.audioProcessor.analyzeSpectrum(samples, sampleRate),
            this.audioProcessor.extractFeatures(samples, sampleRate),
        ]);

        // Count voiced frames
        const voicedFrames = Array.from(vadResult).reduce((a, b) => a + b, 0);
        const voicedRatio = voicedFrames / vadResult.length;

        // Pitch analysis
        let pitchStats;
        if (isDSPAvailable() && this.pitchDetector) {
            // Use WASM pitch detector
            const pitchData = this.pitchDetector.detect_batch(samples, 512);
            const frequencies = [];
            for (let i = 0; i < pitchData.length; i += 2) {
                if (pitchData[i] > 50 && pitchData[i + 1] > 0.3) {
                    frequencies.push(pitchData[i]);
                }
            }
            if (frequencies.length > 0) {
                const mean = frequencies.reduce((a, b) => a + b) / frequencies.length;
                const variance = frequencies.reduce((a, b) => a + (b - mean) ** 2, 0) / frequencies.length;
                pitchStats = {
                    mean,
                    std: Math.sqrt(variance),
                    min: Math.min(...frequencies),
                    max: Math.max(...frequencies),
                };
            } else {
                pitchStats = this._estimatePitchJS(samples, sampleRate);
            }
        } else {
            pitchStats = this._estimatePitchJS(samples, sampleRate);
        }

        // Spectral features
        const warmth = this._calculateWarmth(
            spectrumResult.spectrum,
            spectrumResult.sampleRate,
            spectrumResult.fftSize
        );

        const clarity = this._calculateClarity(
            spectrumResult.spectrum,
            spectrumResult.sampleRate,
            spectrumResult.fftSize
        );

        // Speaking rate
        const speakingRate = this._estimateSpeakingRate(samples, sampleRate);

        // Breathiness estimate (crest factor proxy)
        const breathiness = Math.min(1, basicFeatures.crestFactor / 10);

        // Gender classification
        const gender = this._classifyGender(pitchStats.mean);

        // Build feature object
        const features = {
            pitch: pitchStats,
            warmth,
            clarity,
            breathiness,
            speakingRate,
            voicedRatio,
            gender,
            rms: basicFeatures.rms,
            dynamicRange: basicFeatures.dynamicRange,
        };

        // Map to Kokoro voice
        const voiceMapping = this.mapToKokoroVoice(features);

        // Create embedding
        const embedding = {
            version: '2.0',
            generatedBy: 'NeuralWhisper WebGPU',
            timestamp: new Date().toISOString(),
            sourceFile: file.name,
            sourceHash: await this._hashFile(file),
            duration,
            sampleRate,
            features,
            kokoroMapping: voiceMapping,
            audioSettings: {
                recommendedSpeed: Math.max(0.8, Math.min(1.2, 1.5 / speakingRate)),
                recommendedPitch: 1.0,
                recommendedVolume: 0.8,
            },
        };

        console.log('🎤 [EmbeddingGen] Complete:', voiceMapping.voiceId, `(${(voiceMapping.confidence * 100).toFixed(0)}% confidence)`);

        return embedding;
    }

    /**
     * Hash file for identification
     */
    async _hashFile(file) {
        const buffer = await file.slice(0, 1024 * 1024).arrayBuffer(); // First 1MB
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }

    /**
     * Export embedding as JSON file
     */
    exportAsJSON(embedding, filename = null) {
        const json = JSON.stringify(embedding, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `${embedding.sourceFile.replace(/\.[^.]+$/, '')}_embedding.json`;
        a.click();

        URL.revokeObjectURL(url);
    }
}

// Singleton instance
let instance = null;

/**
 * Get or create embedding generator instance
 */
export async function getEmbeddingGenerator() {
    if (!instance) {
        instance = new EmbeddingGenerator();
        await instance.init();
    }
    return instance;
}

export default {
    EmbeddingGenerator,
    getEmbeddingGenerator,
    KOKORO_VOICES,
};
