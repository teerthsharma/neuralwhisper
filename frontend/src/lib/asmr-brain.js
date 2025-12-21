import * as tf from '@tensorflow/tfjs';

// Define available voices mapping for one-hot encoding/decoding
// This should match the keys in your voice manifest or be passed in
const VOICE_IDS = [
    'american_casual_female',
    'asian_female',
    'formal_english_male',
    'russian_high_class_girl'
];

export class ASMRBrain {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.trainingData = [];
        this.modelPath = 'indexeddb://asmr-brain-model';
        this.readyPromise = this.init();
    }

    async init() {
        try {
            // Try to load existing model
            this.model = await tf.loadLayersModel(this.modelPath);
            console.log('🧠 ASMR Brain: Model loaded from storage.');
        } catch (e) {
            console.log('🧠 ASMR Brain: No existing model found, creating new one.');
            this.model = this.createModel();
        }
    }

    createModel() {
        const model = tf.sequential();

        // Input: [sin_time, cos_time, day_norm, session_duration_norm, last_speed, last_pitch]
        // Size: 6

        // Hidden Layer 1
        model.add(tf.layers.dense({
            inputShape: [6],
            units: 16,
            activation: 'relu',
            kernelInitializer: 'heNormal'
        }));

        // Hidden Layer 2
        model.add(tf.layers.dense({
            units: 16,
            activation: 'relu'
        }));

        // We need multi-output... but tf.sequential is single pipe.
        // For simplicity in this v1, we will have one large output vector and slice it manually
        // or use distinct models. 
        // Let's use a single output layer of size:
        // [Voice_Prob_1, ..., Voice_Prob_4, Speed, Pitch]
        // Size: 4 (Voices) + 1 (Speed) + 1 (Pitch) = 6 units

        model.add(tf.layers.dense({
            units: VOICE_IDS.length + 2,
            activation: 'sigmoid' // simple bounding for normalized outputs
        }));

        model.compile({
            optimizer: tf.train.adam(0.01),
            loss: 'meanSquaredError' // Simplified loss for mixed output vectors
        });

        return model;
    }

    /**
     * Get recommendation based on current context
     */
    async recommend() {
        await this.readyPromise;

        const context = this.getCurrentContext();
        const inputTensor = tf.tensor2d([context]);

        const prediction = this.model.predict(inputTensor);
        const result = await prediction.data();

        inputTensor.dispose();
        prediction.dispose();

        // Decode Result
        // First N outputs are Voice Probabilities
        const voiceProbs = result.slice(0, VOICE_IDS.length);
        const maxProbIndex = voiceProbs.indexOf(Math.max(...voiceProbs));
        const recommendedVoice = VOICE_IDS[maxProbIndex];

        // Next is Speed (map 0-1 back to 0.5-2.0)
        let speed = result[VOICE_IDS.length];
        speed = 0.5 + (speed * 1.5);

        // Next is Pitch (map 0-1 back to 0.8-1.5)
        let pitch = result[VOICE_IDS.length + 1];
        pitch = 0.8 + (pitch * 0.7);

        return {
            voiceId: recommendedVoice,
            speed: parseFloat(speed.toFixed(2)),
            pitch: parseFloat(pitch.toFixed(2)),
            confidence: Math.max(...voiceProbs) // Simplistic confidence
        };
    }

    /**
     * Learn from a user interaction
     * @param {Object} actualSettings - { voiceId, speed, pitch }
     * @param {number} satisfaction - 0.0 to 1.0 (1.0 for "Like", 0.5 for "Listen")
     */
    async learn(actualSettings, satisfaction = 1.0) {
        if (!actualSettings) return;

        // Create Training Target Vector
        // 1. One-hot voice
        const voiceVector = new Array(VOICE_IDS.length).fill(0);
        const voiceIdx = VOICE_IDS.indexOf(actualSettings.voiceId);
        if (voiceIdx !== -1) voiceVector[voiceIdx] = 1;

        // 2. Normalize Speed (0.5 - 2.0 -> 0 - 1)
        const normSpeed = (actualSettings.speed - 0.5) / 1.5;

        // 3. Normalize Pitch (0.8 - 1.5 -> 0 - 1)
        const normPitch = (actualSettings.pitch - 0.8) / 0.7;

        const targetv = [...voiceVector, normSpeed, normPitch];

        // Get Input Context
        const context = this.getCurrentContext();

        // Store
        this.trainingData.push({ x: context, y: targetv });

        // Auto-train if we have enough new data
        if (this.trainingData.length >= 5) {
            await this.train();
        }
    }

    async train() {
        if (this.isTraining || this.trainingData.length === 0) return;
        this.isTraining = true;
        console.log('🧠 ASMR Brain: Training started...');

        const xs = tf.tensor2d(this.trainingData.map(d => d.x));
        const ys = tf.tensor2d(this.trainingData.map(d => d.y));

        await this.model.fit(xs, ys, {
            epochs: 5,
            shuffle: true
        });

        console.log('🧠 ASMR Brain: Training complete.');

        // Save
        await this.model.save(this.modelPath);

        // Clear buffer
        this.trainingData = [];
        this.isTraining = false;

        xs.dispose();
        ys.dispose();
    }

    /**
     * Helpers
     */
    getCurrentContext() {
        const now = new Date();

        // 1. Cyclic Time
        const minutes = now.getHours() * 60 + now.getMinutes();
        const totalMinutes = 24 * 60;
        const t = minutes / totalMinutes;
        const sinTime = Math.sin(2 * Math.PI * t);
        const cosTime = Math.cos(2 * Math.PI * t);

        // 2. Day of Week (Normalized)
        const day = now.getDay() / 6;

        // 3. Session Duration (not implemented fully, using random small noise for variation)
        const sessionNoise = Math.random() * 0.1;

        // 4. Placeholders for previous state (0 for now)
        return [sinTime, cosTime, day, sessionNoise, 0, 0];
    }
}

export const brain = new ASMRBrain();
