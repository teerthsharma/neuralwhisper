/**
 * NEURAL DIRECTOR - The Living Sanctuary
 * =========================================
 * LLM-powered semantic analysis layer that transforms raw text 
 * into emotionally-tagged performance instructions.
 * 
 * Uses Gemini 1.5 Flash for real-time text analysis with:
 * - Emotion tagging (happy, melancholy, urgent, wonder, etc.)
 * - Physiological triggers ([breath], [sigh], [pause:Xms])
 * - Pacing metadata (speed/pitch modulation per segment)
 * 
 * Features:
 * - IndexedDB caching to minimize API calls
 * - Graceful fallback to rule-based parsing
 * - Rate limiting and retry logic
 */

// Gemini API Configuration
// For local dev: Set VITE_GEMINI_API_KEY in .env.local
// For Vercel: Set in Environment Variables
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// IndexedDB Cache
const DB_NAME = 'neural-director-cache';
const DB_VERSION = 1;
const STORE_NAME = 'instructions';

// Emotion to audio parameter mapping
const EMOTION_PRESETS = {
    neutral: { pitchMod: 1.0, paceMod: 1.0, breathiness: 0 },
    happy: { pitchMod: 1.08, paceMod: 1.05, breathiness: 0 },
    excited: { pitchMod: 1.12, paceMod: 1.15, breathiness: 0.1 },
    melancholy: { pitchMod: 0.95, paceMod: 0.85, breathiness: 0.2 },
    sad: { pitchMod: 0.92, paceMod: 0.8, breathiness: 0.3 },
    urgent: { pitchMod: 1.05, paceMod: 1.25, breathiness: 0 },
    whisper: { pitchMod: 1.02, paceMod: 0.7, breathiness: 0.8 },
    wonder: { pitchMod: 1.1, paceMod: 0.8, breathiness: 0.15 },
    fear: { pitchMod: 1.15, paceMod: 1.1, breathiness: 0.25 },
    calm: { pitchMod: 0.98, paceMod: 0.75, breathiness: 0.1 },
    intimate: { pitchMod: 1.0, paceMod: 0.65, breathiness: 0.5 },
    nostalgic: { pitchMod: 0.97, paceMod: 0.78, breathiness: 0.2 },
    mysterious: { pitchMod: 0.94, paceMod: 0.72, breathiness: 0.35 },
    playful: { pitchMod: 1.1, paceMod: 1.1, breathiness: 0.05 },
    solemn: { pitchMod: 0.9, paceMod: 0.7, breathiness: 0.15 }
};

// The prompt that instructs Gemini to analyze text
const DIRECTOR_PROMPT = `You are an expert ASMR audio director. Analyze the following text and break it into segments for emotional performance.

For each segment, provide:
1. "text": The exact text segment
2. "emotion": One of: neutral, happy, excited, melancholy, sad, urgent, whisper, wonder, fear, calm, intimate, nostalgic, mysterious, playful, solemn
3. "triggers": Array of physiological triggers to insert BEFORE the segment. Options:
   - "[breath]" - soft inhale/exhale
   - "[sigh]" - emotional sigh
   - "[pause:Xms]" - silence (100-2000ms)
   - "[soft_cough]" - gentle throat clear
4. "pace": Reading speed multiplier (0.6 to 1.3, where 0.7 is slow/intimate, 1.0 is normal)

Guidelines:
- Segment by emotional shifts, not just sentences
- Use [breath] before emotional revelations or after long segments
- Use [pause:500ms] for dramatic effect, [pause:1000ms] for scene transitions
- Whisper emotion for intimate/secret content
- Keep segments 10-40 words for natural pacing

Respond ONLY with valid JSON in this exact format:
{
  "segments": [
    {
      "text": "segment text here",
      "emotion": "emotion_name",
      "triggers": ["[breath]", "[pause:300ms]"],
      "pace": 0.85
    }
  ]
}

TEXT TO ANALYZE:
`;

class NeuralDirector {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.requestQueue = [];
        this.isProcessing = false;
        this.lastRequestTime = 0;
        this.minRequestInterval = 500; // Rate limit: 500ms between requests

        this._initDB();
        console.log('🎬 [NEURAL DIRECTOR] Initializing...');
    }

    async _initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.warn('🎬 [NEURAL DIRECTOR] IndexedDB not available, caching disabled');
                resolve();
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                console.log('🎬 [NEURAL DIRECTOR] Cache initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
                }
            };
        });
    }

    /**
     * Generate a hash for caching
     */
    _hashText(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `nd_${Math.abs(hash).toString(16)}`;
    }

    /**
     * Get cached instructions
     */
    async _getCached(hash) {
        if (!this.db) return null;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(hash);

                request.onsuccess = () => {
                    if (request.result) {
                        console.log('🎬 [NEURAL DIRECTOR] Cache hit!');
                        resolve(request.result.instructions);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    /**
     * Store instructions in cache
     */
    async _setCache(hash, instructions) {
        if (!this.db) return;

        try {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put({ hash, instructions, timestamp: Date.now() });
        } catch (e) {
            console.warn('🎬 [NEURAL DIRECTOR] Cache write failed:', e);
        }
    }

    /**
     * Call Gemini API with rate limiting
     */
    async _callGemini(text) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(r => setTimeout(r, this.minRequestInterval - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();

        const requestBody = {
            contents: [{
                parts: [{
                    text: DIRECTOR_PROMPT + text
                }]
            }],
            generationConfig: {
                temperature: 0.4,
                topK: 32,
                topP: 0.95,
                maxOutputTokens: 4096,
                responseMimeType: "application/json"
            }
        };

        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('🎬 [NEURAL DIRECTOR] API Error:', response.status, errorText);
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();

            // Extract JSON from Gemini response
            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) {
                throw new Error('Empty response from Gemini');
            }

            // Parse JSON response
            const instructions = JSON.parse(responseText);
            console.log('🎬 [NEURAL DIRECTOR] Gemini response:', instructions);

            return this._validateAndEnrich(instructions);

        } catch (error) {
            console.error('🎬 [NEURAL DIRECTOR] API call failed:', error);
            throw error;
        }
    }

    /**
     * Validate and enrich instructions with audio parameters
     */
    _validateAndEnrich(instructions) {
        if (!instructions.segments || !Array.isArray(instructions.segments)) {
            throw new Error('Invalid instruction format');
        }

        return {
            segments: instructions.segments.map(seg => {
                const emotion = seg.emotion?.toLowerCase() || 'neutral';
                const preset = EMOTION_PRESETS[emotion] || EMOTION_PRESETS.neutral;

                return {
                    text: seg.text || '',
                    emotion: emotion,
                    triggers: Array.isArray(seg.triggers) ? seg.triggers : [],
                    pace: Math.max(0.5, Math.min(1.5, seg.pace || 1.0)),
                    // Enriched audio parameters from emotion preset
                    pitchMod: preset.pitchMod,
                    breathiness: preset.breathiness,
                    // Combine pace from LLM with emotion modifier
                    speedMod: (seg.pace || 1.0) * preset.paceMod
                };
            })
        };
    }

    /**
     * Fallback: Rule-based parsing when API fails
     */
    _fallbackParse(text) {
        console.log('🎬 [NEURAL DIRECTOR] Using fallback parser');

        // Split by sentences
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const segments = [];

        sentences.forEach((sentence, index) => {
            const trimmed = sentence.trim();
            if (!trimmed) return;

            // Simple emotion detection based on punctuation and keywords
            let emotion = 'neutral';
            let pace = 1.0;
            const triggers = [];

            // Add breath before long sentences or at paragraph starts
            if (index === 0 || trimmed.length > 100) {
                triggers.push('[breath]');
            }

            // Detect emotion from content
            const lower = trimmed.toLowerCase();
            if (lower.includes('!')) {
                emotion = 'excited';
                pace = 1.1;
            } else if (lower.includes('?')) {
                emotion = 'wonder';
                pace = 0.9;
            } else if (lower.includes('whisper') || lower.includes('quiet') || lower.includes('soft')) {
                emotion = 'whisper';
                pace = 0.7;
            } else if (lower.includes('sad') || lower.includes('sorrow') || lower.includes('tears')) {
                emotion = 'melancholy';
                pace = 0.8;
            } else if (lower.includes('love') || lower.includes('heart') || lower.includes('dear')) {
                emotion = 'intimate';
                pace = 0.75;
            } else if (lower.includes('fear') || lower.includes('terror') || lower.includes('afraid')) {
                emotion = 'fear';
                pace = 1.05;
            } else if (lower.includes('dream') || lower.includes('memory') || lower.includes('remember')) {
                emotion = 'nostalgic';
                pace = 0.8;
            }

            // Add pause after emotional sentences
            if (['whisper', 'melancholy', 'intimate', 'nostalgic'].includes(emotion)) {
                triggers.push('[pause:400ms]');
            }

            const preset = EMOTION_PRESETS[emotion];
            segments.push({
                text: trimmed,
                emotion,
                triggers,
                pace,
                pitchMod: preset.pitchMod,
                breathiness: preset.breathiness,
                speedMod: pace * preset.paceMod
            });
        });

        return { segments };
    }

    /**
     * Main entry point: Analyze text and return performance instructions
     * @param {string} text - Raw text to analyze
     * @param {boolean} useCache - Whether to use caching (default: true)
     * @returns {Promise<Object>} Instruction schema
     */
    async analyze(text, useCache = true) {
        if (!text || text.trim().length === 0) {
            return { segments: [] };
        }

        const hash = this._hashText(text);

        // Check cache first
        if (useCache) {
            const cached = await this._getCached(hash);
            if (cached) {
                return cached;
            }
        }

        try {
            // Try API
            const instructions = await this._callGemini(text);

            // Cache successful result
            if (useCache) {
                await this._setCache(hash, instructions);
            }

            return instructions;

        } catch (error) {
            // Fallback to rule-based parsing
            console.warn('🎬 [NEURAL DIRECTOR] Falling back to rule-based parsing');
            return this._fallbackParse(text);
        }
    }

    /**
     * Analyze text in chunks for long documents
     * @param {string[]} chunks - Array of text chunks
     * @returns {Promise<Object>} Combined instruction schema
     */
    async analyzeChunks(chunks) {
        const allSegments = [];

        for (const chunk of chunks) {
            const result = await this.analyze(chunk);
            allSegments.push(...result.segments);
        }

        return { segments: allSegments };
    }

    /**
     * Parse trigger tags from a segment
     * @param {Object} segment - Segment with triggers
     * @returns {Object} Parsed trigger info { breaths, pauses, sighs }
     */
    parseTriggers(segment) {
        const result = {
            breaths: 0,
            sighs: 0,
            coughs: 0,
            pauses: []
        };

        if (!segment.triggers) return result;

        for (const trigger of segment.triggers) {
            if (trigger === '[breath]') {
                result.breaths++;
            } else if (trigger === '[sigh]') {
                result.sighs++;
            } else if (trigger === '[soft_cough]') {
                result.coughs++;
            } else if (trigger.startsWith('[pause:')) {
                const match = trigger.match(/\[pause:(\d+)ms\]/);
                if (match) {
                    result.pauses.push(parseInt(match[1], 10));
                }
            }
        }

        return result;
    }

    /**
     * Generate silence audio (for pause triggers)
     * @param {number} durationMs - Duration in milliseconds
     * @param {number} sampleRate - Audio sample rate (default: 24000)
     * @returns {Float32Array} Silent audio samples
     */
    generateSilence(durationMs, sampleRate = 24000) {
        const samples = Math.floor((durationMs / 1000) * sampleRate);
        return new Float32Array(samples);
    }

    /**
     * Generate breath audio (soft noise texture)
     * @param {number} sampleRate - Audio sample rate
     * @returns {Float32Array} Breath audio samples
     */
    generateBreath(sampleRate = 24000) {
        // ~200ms breath sound
        const duration = 0.2;
        const samples = Math.floor(duration * sampleRate);
        const audio = new Float32Array(samples);

        // Generate shaped noise that sounds like a soft breath
        for (let i = 0; i < samples; i++) {
            const t = i / samples;
            // Bell curve envelope
            const envelope = Math.sin(Math.PI * t) * 0.08;
            // Low-pass filtered noise
            const noise = (Math.random() * 2 - 1) * envelope;
            audio[i] = noise;
        }

        return audio;
    }

    /**
     * Clear the instruction cache
     */
    async clearCache() {
        if (!this.db) return;

        try {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            await store.clear();
            console.log('🎬 [NEURAL DIRECTOR] Cache cleared');
        } catch (e) {
            console.warn('🎬 [NEURAL DIRECTOR] Failed to clear cache:', e);
        }
    }
}

// Export singleton instance
export const neuralDirector = new NeuralDirector();
export { EMOTION_PRESETS };
