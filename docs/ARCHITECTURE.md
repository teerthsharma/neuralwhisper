# NeuralWhisper Architecture

## Overview

**NeuralWhisper** (ASMR Reader) is a 100% client-side application that brings studio-quality AI audio to the browser. It runs an 82 million parameter neural TTS model directly on your GPU using WebGPU, ensuring privacy and zero latency after the initial load.

## System Architecture

The following high-level diagram illustrates the data flow from user input to immersive audio output.

```mermaid
graph TB
    subgraph Browser["🌐 Browser (100% Client-Side)"]
        direction TB
        Input[User Input]
        
        Input -->|PDF Upload| PDFJS[pdf.js Parser]
        Input -->|Wiki URL| Scraper[Wikipedia Scraper]
        
        PDFJS --> TEXT[Clean Text]
        Scraper --> TEXT
        
        TEXT --> KOKORO[Kokoro TTS Engine]
        
        subgraph Neural_Inference
            KOKORO --> ONNX[ONNX Runtime]
            ONNX --> GPU[WebGPU Backend]
            GPU --> RAW_AUDIO[Raw PCM Audio]
        end
        
        subgraph Audio_Post_Processing
            RAW_AUDIO --> FX[AudioEffects Chain]
            FX --> EQ[7-Band EQ]
            EQ --> COMP[Dynamics Compressor]
            COMP --> VIZ[Liquid Waveform Viz]
        end
        
        VIZ --> OUTPUT[Speaker Output]
    end
    
    subgraph Model_Source["🤖 Model Weights"]
        direction LR
        HF[HuggingFace Hub] -->|Fetches .onnx| CACHED[Browser Cache (IndexedDB)]
    end
    
    KOKORO -.->|Loads Weights| Model_Source
```

## Key Components

### Frontend (`/frontend`)
| File | Purpose |
|------|---------|
| `App.jsx` | Main React application, state management, and UI orchestration. |
| `lib/tts-gpu-engine.js` | The core neural engine wrapper. Manages WebGPU sessions and inference. |
| `lib/audio-effects.js` | **NEW**: Professional DSP chain (EQ, Compressor, Reverb). |
| `lib/wikipedia-scraper.js` | **NEW**: Fetches and sanitizes Wikipedia articles for reading. |
| `lib/pdf-parser.js` | Handles complex PDF layouts and text extraction. |
| `lib/voice-profiles.js` | Database of voice characteristics and metadata. |

### Voice Processing (`/scripts`)
Python scripts (`generate_f5_embeddings.py`) are used offline to generate "voice embeddings" (.pt/.bin files) from reference audio. These embeddings act as the "identity" for the TTS model, allowing it to clone specific voices.

## Data Flow Details

1.  **Input**: The user provides a PDF or a Wikipedia URL.
2.  **Normalization**: Text is stripped of artifacts (citations, page numbers) and segmented into natural "breath groups" for pacing.
3.  **Inference**:
    *   The `Kokoro-82M` model receives phonemized text and a voice embedding.
    *   It runs on the GPU via ONNX Runtime Web.
    *   It outputs raw 24kHz float32 audio data.
4.  **Post-Processing**:
    *   Raw audio is piped into the `AudioEffects` class.
    *   **EQ**: Shapes the tone (e.g., boosting bass for "Deep" mode).
    *   **Compression**: Evens out the dynamic range for a consistent whisper volume.
5.  **Playback**: The processed audio is played via the Web Audio API, synchronized with the visualizer.

## Technology Stack

-   **AI Core**: Kokoro-js 1.2.1 (82M params)
-   **Inference**: ONNX Runtime Web 1.23.2 (WebGPU/WASM)
-   **Frontend**: React 18.2 + Vite 5.0
-   **Audio**: Web Audio API (Spatial Audio & DSP)
-   **PDF**: pdf.js 4.0
