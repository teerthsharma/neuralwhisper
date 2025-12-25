import * as tf from '@tensorflow/tfjs';

/**
 * ASMR BRAIN - THE CONDUCTOR (Living Sanctuary)
 * ================================================
 * Client-side deep learning model that learns user preferences for ASMR.
 * 
 * Features:
 * - Temporal Awareness: Night Mode auto-activation after 11 PM
 * - Exploration Bandit: Epsilon-greedy algorithm for new voice/setting suggestions
 * - Biometric-Ready: Spectral centroid and HNR extraction for feedback loops
 * - Personalized Recommendations: Voice, speed, pitch based on context
 */

// Define available voices mapping for one-hot encoding/decoding
const VOICE_IDS = [
    'american_casual',
    'asian_female',
    'russian_highclass',
    'male_deep',
    'asmr_soft',
    'af_bella',
    'af_sarah',
    'af_nicole',
    'am_adam',
    'am_michael'
];

// Exploration bandit settings
const EPSILON = 0.15;  // 15% chance to explore new combinations
const EXPLORATION_DECAY = 0.995;  // Decay exploration over time

export class ASMRBrain {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.trainingData = [];
        this.modelPath = 'indexeddb://asmr-brain-model';
        this.explorationHistory = [];
        this.currentEpsilon = EPSILON;
        this.lastRecommendation = null;
        this.sessionStartTime = Date.now();
        this.readyPromise = this.init();
    }

    async init() {
        try {
            this.model = await tf.loadLayersModel(this.modelPath);
            console.log('🧠 ASMR Brain: Model loaded from storage.');
            this._loadExplorationHistory();
        } catch (e) {
            console.log('🧠 ASMR Brain: No existing model found, creating new one.');
            this.model = this.createModel();
        }
    }

    createModel() {
        const model = tf.sequential();

        // Input: [sin_time, cos_time, day_norm, session_duration_norm, last_speed, last_pitch, is_night, exploration_score]
        model.add(tf.layers.dense({
            inputShape: [8],
            units: 32,
            activation: 'relu',
            kernelInitializer: 'heNormal'
        }));

        model.add(tf.layers.dropout({ rate: 0.2 }));

        model.add(tf.layers.dense({
            units: 24,
            activation: 'relu'
        }));

        // Output: Voice probabilities + Speed + Pitch + Breathiness
        model.add(tf.layers.dense({
            units: VOICE_IDS.length + 3,
            activation: 'sigmoid'
        }));

        model.compile({
            optimizer: tf.train.adam(0.005),
            loss: 'meanSquaredError'
        });

        return model;
    }

    // ===============================================================
    // TEMPORAL AWARENESS (Night Mode)
    // ===============================================================

    isNightTime() {
        const hour = new Date().getHours();
        return hour >= 23 || hour < 6;
    }

    getNightModeSettings() {
        return {
            eqPreset: 'warm',
            speedMod: 0.9,
            pitchMod: 0.98,
            breathiness: 1.2,
            reverb: 0.15,
            warmth: 3,
            brilliance: -3
        };
    }

    // ===============================================================
    // EXPLORATION BANDIT (Prevent Sensory Adaptation)
    // ===============================================================

    async maybeExplore(baseRecommendation) {
        if (Math.random() < this.currentEpsilon) {
            console.log('🎲 ASMR Brain: Exploring new combination!');

            const recentVoices = this.explorationHistory.slice(-10).map(e => e.voiceId);
            const unexploredVoices = VOICE_IDS.filter(v => !recentVoices.includes(v));

            const explorationVoice = unexploredVoices.length > 0
                ? unexploredVoices[Math.floor(Math.random() * unexploredVoices.length)]
                : VOICE_IDS[Math.floor(Math.random() * VOICE_IDS.length)];

            const exploration = {
                voiceId: explorationVoice,
                speed: Math.max(0.6, Math.min(1.4, baseRecommendation.speed + (Math.random() * 0.2 - 0.1))),
                pitch: Math.max(0.85, Math.min(1.2, baseRecommendation.pitch + (Math.random() * 0.1 - 0.05))),
                breathiness: Math.random() * 0.4 + 0.3,
                isExploration: true,
                confidence: 0.5
            };

            this.explorationHistory.push({
                voiceId: exploration.voiceId,
                timestamp: Date.now(),
                wasAccepted: null
            });

            this.currentEpsilon *= EXPLORATION_DECAY;
            this._saveExplorationHistory();

            return exploration;
        }

        return { ...baseRecommendation, isExploration: false };
    }

    recordExplorationFeedback(wasPositive) {
        if (this.explorationHistory.length > 0) {
            const lastExploration = this.explorationHistory[this.explorationHistory.length - 1];
            if (lastExploration.wasAccepted === null) {
                lastExploration.wasAccepted = wasPositive;
                if (wasPositive) {
                    this.currentEpsilon = Math.min(EPSILON, this.currentEpsilon * 1.1);
                }
                this._saveExplorationHistory();
                console.log(`🎲 ASMR Brain: Exploration feedback: ${wasPositive ? '👍' : '👎'}`);
            }
        }
    }

    // ===============================================================
    // RECOMMENDATION ENGINE
    // ===============================================================

    async recommend(includeExploration = true) {
        await this.readyPromise;

        const context = this.getCurrentContext();
        const inputTensor = tf.tensor2d([context]);

        const prediction = this.model.predict(inputTensor);
        const result = await prediction.data();

        inputTensor.dispose();
        prediction.dispose();

        const voiceProbs = result.slice(0, VOICE_IDS.length);
        const maxProbIndex = voiceProbs.indexOf(Math.max(...voiceProbs));
        const recommendedVoice = VOICE_IDS[maxProbIndex];

        let speed = 0.5 + (result[VOICE_IDS.length] * 1.5);
        let pitch = 0.8 + (result[VOICE_IDS.length + 1] * 0.7);
        let breathiness = result[VOICE_IDS.length + 2] * 0.8;

        let baseRecommendation = {
            voiceId: recommendedVoice,
            speed: parseFloat(speed.toFixed(2)),
            pitch: parseFloat(pitch.toFixed(2)),
            breathiness: parseFloat(breathiness.toFixed(2)),
            confidence: Math.max(...voiceProbs)
        };

        // Apply Night Mode
        if (this.isNightTime()) {
            const nightSettings = this.getNightModeSettings();
            baseRecommendation.speed *= nightSettings.speedMod;
            baseRecommendation.pitch *= nightSettings.pitchMod;
            baseRecommendation.breathiness = Math.max(baseRecommendation.breathiness, 0.4);
            baseRecommendation.nightMode = true;
            console.log('🌙 ASMR Brain: Night Mode applied');
        }

        if (includeExploration) {
            return this.maybeExplore(baseRecommendation);
        }

        this.lastRecommendation = baseRecommendation;
        return baseRecommendation;
    }

    // ===============================================================
    // LEARNING
    // ===============================================================

    async learn(actualSettings, satisfaction = 1.0) {
        if (!actualSettings) return;

        const voiceVector = new Array(VOICE_IDS.length).fill(0);
        const voiceIdx = VOICE_IDS.indexOf(actualSettings.voiceId);
        if (voiceIdx !== -1) voiceVector[voiceIdx] = 1;

        const normSpeed = (actualSettings.speed - 0.5) / 1.5;
        const normPitch = (actualSettings.pitch - 0.8) / 0.7;
        const normBreathiness = (actualSettings.breathiness || 0) / 0.8;

        const targetv = [...voiceVector, normSpeed, normPitch, normBreathiness].map(v => v * satisfaction);
        const context = this.getCurrentContext();

        this.trainingData.push({ x: context, y: targetv });

        if (this.trainingData.length >= 5) {
            await this.train();
        }
    }

    async train() {
        if (this.isTraining || this.trainingData.length === 0) return;
        this.isTraining = true;
        console.log('🧠 ASMR Brain: Training...');

        const xs = tf.tensor2d(this.trainingData.map(d => d.x));
        const ys = tf.tensor2d(this.trainingData.map(d => d.y));

        await this.model.fit(xs, ys, { epochs: 10, shuffle: true, validationSplit: 0.1 });

        await this.model.save(this.modelPath);
        this.trainingData = [];
        this.isTraining = false;

        xs.dispose();
        ys.dispose();
        console.log('🧠 ASMR Brain: Training complete.');
    }

    // ===============================================================
    // BIOMETRIC-READY: Audio Feature Extraction
    // ===============================================================

    getSpectralCentroid(fftData, sampleRate = 48000) {
        let numerator = 0, denominator = 0;
        const binWidth = sampleRate / (fftData.length * 2);

        for (let i = 0; i < fftData.length; i++) {
            const magnitude = Math.pow(10, fftData[i] / 20);
            numerator += i * binWidth * magnitude;
            denominator += magnitude;
        }

        return denominator > 0 ? numerator / denominator : 0;
    }

    getHNR(audioBuffer) {
        if (!audioBuffer || audioBuffer.length < 512) return 0;

        const frameSize = 512;
        const frame = audioBuffer.slice(0, frameSize);
        let energy = 0, maxCorrelation = 0;

        for (let i = 0; i < frameSize; i++) {
            energy += frame[i] * frame[i];
        }

        for (let lag = 30; lag < frameSize / 2; lag++) {
            let correlation = 0;
            for (let i = 0; i < frameSize - lag; i++) {
                correlation += frame[i] * frame[i + lag];
            }
            if (correlation > maxCorrelation) maxCorrelation = correlation;
        }

        if (energy === 0 || maxCorrelation <= 0) return 0;
        const noiseEnergy = energy - maxCorrelation;
        return noiseEnergy <= 0 ? 20 : 10 * Math.log10(maxCorrelation / noiseEnergy);
    }

    getRMSEnergy(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) return 0;
        let sum = 0;
        for (let i = 0; i < audioBuffer.length; i++) {
            sum += audioBuffer[i] * audioBuffer[i];
        }
        return Math.sqrt(sum / audioBuffer.length);
    }

    // ===============================================================
    // CONTEXT & HELPERS
    // ===============================================================

    getCurrentContext() {
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        const t = minutes / (24 * 60);

        const sessionDuration = Math.min(1, (Date.now() - this.sessionStartTime) / (2 * 60 * 60 * 1000));
        const lastSpeed = this.lastRecommendation?.speed || 0.85;
        const lastPitch = this.lastRecommendation?.pitch || 1.0;
        const explorationScore = Math.min(1, this.explorationHistory.length / 50);

        return [
            Math.sin(2 * Math.PI * t),
            Math.cos(2 * Math.PI * t),
            now.getDay() / 6,
            sessionDuration,
            lastSpeed,
            lastPitch,
            this.isNightTime() ? 1 : 0,
            explorationScore
        ];
    }

    _loadExplorationHistory() {
        try {
            const saved = localStorage.getItem('asmr_brain_exploration');
            if (saved) {
                const data = JSON.parse(saved);
                this.explorationHistory = data.history || [];
                this.currentEpsilon = data.epsilon || EPSILON;
            }
        } catch (e) { }
    }

    _saveExplorationHistory() {
        try {
            localStorage.setItem('asmr_brain_exploration', JSON.stringify({
                history: this.explorationHistory.slice(-100),
                epsilon: this.currentEpsilon
            }));
        } catch (e) { }
    }

    async lobotomy() {
        this.trainingData = [];
        this.explorationHistory = [];
        this.currentEpsilon = EPSILON;
        this.lastRecommendation = null;
        this.model = this.createModel();
        localStorage.removeItem('asmr_brain_exploration');
        try { await tf.io.removeModel(this.modelPath); } catch (e) { }
        console.log('🧠 ASMR Brain: Complete reset.');
        return true;
    }
}

export const brain = new ASMRBrain();
