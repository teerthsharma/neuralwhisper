# 🧠 Project Architecture & Unique Features

This document details the "Game-Changing" architecture and unique features implemented in the ASMR Reader project ("Zen Edition").

## 1. Neural Document Processor (`frontend/src/lib/document-processor.js`)

Unlike standard PDF text extractors that blindly concatenate strings, our **Neural Document Processor** uses a spatial-aware approach designed specifically for preserving the "flow" required for ASMR reading.

*   **Spatial Layout Analysis**: It reads the PDF's internal coordinate system (`transform` matrices) to sort text items by their physical position (Y-coordinate descending, X-coordinate ascending) rather than their stream order. This heals broken multi-column layouts.
*   **Neural Segmentation**: We use `Intl.Segmenter` (a lightweight NLP model built into modern browsers) combined with custom heuristics to:
    *   Detect and remove headers/footers based on sparse line density.
    *   Heal hyphenated words broken across lines.
    *   Segment text into "breath groups" (natural pauses) rather than just splitting by periods.
*   **Unique Feature**: The processor returns a *semantics-first* array of objects `{ text, pause_score }` rather than a flat string, allowing the audio engine to insert dynamic silence based on semantic context (longer pauses for paragraph breaks, shorter for commas).

## 2. Deep Learning Audio Stack ("The Core")

The audio pipeline prioritizes **Fidelity** and **Latency** using a hybrid WebGPU/WASM approach.

### A. High-Fidelity TTS Engine (`tts-gpu-engine.js`)
*   **FP32 Precision**: We explicitly force `dtype: 'fp32'` when loading the `Kokoro-82M` model. While this increases VRAM usage, it eliminates quantization artifacts, resulting in "studio-grade" clarity.
*   **Strict WebGPU Priority**: The engine aggressively attempts to lock `navigator.gpu`.
*   **Robust Fallback Chain**: `WebGPU (FP32) -> WASM (FP32) -> WebSpeech API`.

### B. DSP "Atmosphere" Chain
We process raw PCM output through a custom Web Audio API graph:
1.  **Source Node**: Raw Float32 PCM.
2.  **Dynamics Compressor**: A "glue" compressor (Ratio 3:1, Threshold -24dB) that brings up soft whispers while taming loud transients.
3.  **7-Band EQ**: Custom Biquad filter bank (ASMR Mode / Podcast Mode).

### C. Offline Audiobook Generation (F5-TTS)
For "Hero" content (e.g., historical figures, cultural deep-dives), we use an offline Python pipeline:
*   **Model**: **F5-TTS** (High-fidelity diffusion transformer).
*   **Why F5?**: Unlike Kokoro (optimized for speed/streaming), F5-TTS excels at zero-shot voice cloning and emotional prosody, achieving a 95%+ match to reference audio.
*   **Pipeline**: `scripts/generate_audiobooks.py` scrapes Wikipedia -> segments text -> infers audio via PyTorch (CUDA) -> saves high-quality `.wav` files for the frontend to play via `AudiobookShelf`.

## 3. "Zen" UI System & Liquid Glass Optics

A fully dynamic, GPU-accelerated UI framework designed for immersion.

### A. Liquid Glass Sliders (`LiquidSlider.jsx`)
Replacing standard browser inputs, these components use **SVG Displacement Filters** (`feTurbulence`, `feDisplacementMap`) to create a "liquid" distortion effect within the glass thumb.
*   **Visuals**: Real-time glass refraction and specular highlights (CSS `box-shadow` layers).
*   **Interactivity**: The slider thumb "squishes" and morphs organically when dragged.

### B. Glassmorphism & Theming
*   **CSS Variable Mapping**: The entire app sits on top of abstract `--zen-*` variables (`--zen-surface`, `--zen-primary`).
*   **Dynamic Backgrounds**: The `VideoBackground` component renders a backdrop, and the UI layers above it use `backdrop-filter: blur()` combined with `color-mix()` for readability.

### C. Sleep Mode Visualization
*   **Liquid Waveform**: When playing audio (either synthesized or pre-generated audiobook), the `AudioEffects` chain analyzes the FFT spectrum.
*   **Canvas Render**: This data drives a custom fluid simulation on an HTML5 Canvas, creating a mesmerizing, lag-free visualization that responds to voice energy.

## 4. The "Hive Mind" (`hive-mind.js`)

An **Adaptive Client-Side Learning System** that personalizes the experience without a backend.

*   **Behavioral Embeddings**: The system tracks user interactions (Micro-adjustments to speed, Skip Patterns).
*   **Vector-Like Storage**: Preferences are stored in `localStorage` as weighted vectors associated with specific voice IDs.
*   **Optimization**: At runtime, `hiveMind.getOptimizedSettings(baseSettings)` injects these learned biases into the DSP chain.

## 5. Strict Backend Performance

The python backend scripts (`generate_f5_embeddings.py`, `generate_audiobooks.py`) run in **Strict Mode**:
*   **CUDA Enforcement**: Refuses to run on CPU to guarantee precision.
*   **Feature Extraction**: Extracts vocal characteristics (warmth, breathiness, pitch) to populate `voice-manifest.json`.
