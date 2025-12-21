# Voice Lab - Technical Documentation

## 1. Overview
The "Voice Lab" is a dedicated module within ASMR Reader that allows users to create custom voice identities ("Neural Clones") from audio samples. It interfaces with the backend (or client-side simulation) to analyze audio characteristics and map them to the closest available semantic token space in the Kokoro TTS engine.

## 2. Architecture

### 2.1 The F5-TTS Concept
F5-TTS (Flow-matching based 5-step Text-to-Speech) is a diffusion-based model capable of zero-shot voice cloning. In our implementation:
- **Input**: A 5-10 second `.mp3` or `.wav` reference clip.
- **Process**: The audio is encoded into a high-dimensional latent vector (embedding).
- **Mapping**: This embedding is used to condition the diffusion process, effectively "styling" the generated speech to match the timbre, prosody, and accent of the reference.

### 2.2 Client-Side Analysis Logic (`frontend/src/lib/voice-analyzer.js`)
We use the Web Audio API to perform real-time spectral analysis on the uploaded file before it hits the neural network:
1.  **Pitch Detection**: Uses auto-correlation to estimate the fundamental frequency ($F_0$).
2.  **Spectral Centroid**: Calculates the "brightness" of the voice to distinguish between deep/muffled and bright/crisp voices.
3.  **Harmonic-to-Noise Ratio (HNR)**: Estimates "breathiness" (a key ASMR characteristic).

### 2.3 The "Voice Mapper" (`frontend/src/lib/voice-mapper.js`)
Since the browser-based Kokoro model has a fixed set of weights, we use a mapping heuristic to approximate custom voices if full F5-TTS inference is unavailable (fallback mode):
- **Input**: Extracted features (Pitch, Brightness, Breathiness).
- **Logic**: A KD-Tree or nearest-neighbor search against the known characteristics of the 28 pre-baked Kokoro voices (e.g., `af_nicole`, `am_adam`).
- **Output**: The ID of the closest base voice + a set of `Pitch` and `Speed` modifiers to emulate the target.

## 3. Data Structure (Voice Identity JSON)
A "Voice Identity" is a portable JSON object that contains all the data needed to reconstruct the voice persona.

```json
{
  "id": "custom_1708934123",
  "name": "Midnight Whisper",
  "description": "Neural Clone • af_nicole • 0.9x Pitch",
  "emoji": "🧬",
  "kokoroVoice": "af_nicole", // The base model used
  "defaultPitch": 0.9,        // Pitch shift to match target
  "defaultSpeed": 0.85,       // Speed shift to match target
  "isCustom": true,
  "characteristics": {
    "warmth": 0.8,
    "breathiness": 0.6,
    "clarity": 0.4
  },
  "referenceClip": "blob:..." // Local reference for playback
}
```

## 4. Integration with App.jsx
The `App.jsx` component maintains a `customVoices` state array.
1.  **Creation**: When `onVoiceCreated` is called from the Lab, the new object is appended to `customVoices`.
2.  **Persistence**: The array is serialized to `localStorage` (or IndexedDB) so identities survive page reloads.
3.  **Selection**: Custom voices appear in the "Advanced Settings" > "Custom Voice Embeddings" deck.
