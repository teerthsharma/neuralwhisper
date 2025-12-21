# Site Architecture Manual

## 1. Overview
ASMR Reader is a high-performance, privacy-focused web application that generates neural text-to-speech (TTS) entirely in the browser. It combines state-of-the-art Web AI technologies with a premium "Liquid Glass" aesthetic to provide a soothing user experience.

## 2. Technology Stack

### Core Framework
- **React 18**: Component-based UI libary.
- **Vite**: Next-generation frontend tooling for ultra-fast builds.

### AI & Audio Pipeline (The "Neural Engine")
The application bypasses traditional server-side APIs by running AI models locally:
1.  **Kokoro-JS (ONNX Runtime Web)**: The core TTS model. It runs quantized ONNX models via WebAssembly (WASM) or WebGPU.
2.  **Web Audio API**: Handles the audio signal chain.
    - `AudioContext`: Master timing and routing.
    - `AnalyserNode`: Real-time FFT analysis for visualizations.
    - `ConvolverNode` / `DynamicsCompressorNode`: Professional audio effects (Reverb, Compression).

### The "ASMR Brain"
- **TensorFlow.js**: Client-side deep learning library. Used for the recommender system that adapts to user preferences over time.

## 3. Key Components or Modules

### `TASGPUEngine` (`src/lib/tts-gpu-engine.js`)
A singleton class that manages the lifecycle of the ONNX inference session. It handles:
- Model downloading and caching.
- Text tokenization (phoneme conversion).
- Audio synthesis and buffering.

### `ASMRBrain` (`src/lib/asmr-brain.js`)
The "Cortex" of the application. It observes user behavior and predicts optimal settings.

### Visual System
- **Liquid Slider**: A custom GLSL shader implementation for UI controls, providing a fluid, organic feel.
- **Sleep Mode**: A full-screen canvas visualizer that reacts to audio frequencies using organic math functions (sine/cosine interference patterns).

## 4. Data Flow
1.  **User Input**: User provides Text or PDF.
2.  **Preprocessing**: Text is cleaned and chunked.
3.  **Brain Inference**: The `ASMRBrain` analyzes the current context (Time, Day) and suggests parameters.
4.  **Generation**: `TASGPUEngine` synthesizes audio on the GPU.
5.  **Post-Processing**: Audio passes through the Web Audio EQ/Compressor chain.
6.  **Feedback**: User listens/likes -> Data is fed back into `ASMRBrain` for training.

## 5. Deployment
- **Vercel**: Static hosting.
- **CI/CD**: GitHub Actions pipeline ensures database migrations (if applicable) and build checks pass before deployment.
