# 🧠 Project Architecture & Unique Features

This document details the "Game-Changing" architecture and unique features implemented in the ASMR Reader project.

## 1. Neural Document Processor (`frontend/src/lib/document-processor.js`)

Unlike standard PDF text extractors that blindly concatenation strings, our **Neural Document Processor** uses a spatial-aware approach designed specifically for preserving the "flow" required for ASMR reading.

*   **Spatial Layout Analysis**: It reads the PDF's internal coordinate system (`transform` matrices) to sort text items by their physical position (Y-coordinate descending, X-coordinate ascending) rather than their stream order. This heals broken multi-column layouts.
*   **Neural Segmentation**: We use `Intl.Segmenter` (a lightweight NLP model built into modern browsers) combined with custom heuristics to:
    *   Detect and remove headers/footers based on sparse line density.
    *   Heal hyphenated words broken across lines.
    *   Segment text into "breath groups" (natural pauses) rather than just splitting by periods.
*   **Unique Feature**: The processor returns a *semantics-first* array of objects `{ text, pause_score }` rather than a flat string, allowing the audio engine to insert dynamic silence based on semantic context (longer pauses for paragraph breaks, shorter for commas).

## 2. Deep Learning Audio Stack ("The Core")

The audio pipeline has been completely rewritten to prioritize **Fidelity** and **Latency** using a hybrid WebGPU/WASM approach.

### A. High-Fidelity TTS Engine (`tts-gpu-engine.js`)
*   **FP32 Precision**: We explicitly force `dtype: 'fp32'` when loading the `Kokoro-82M` model. While this doubles VRAM usage compared to quantized models (`q8`), it eliminates quantization artifacts, resulting in "studio-grade" clarity essential for ASMR.
*   **Strict WebGPU Priority**: The engine checks for `navigator.gpu` and aggressively attempts to lock the GPU. It emits a "Fast as F***" mode signal upon success.
*   **Robust Fallback Chain**: `WebGPU (FP32) -> WASM (FP32) -> WebSpeech API`. This ensures the app never crashes, gracefully degrading from "Neural Cloning" to "Standard TTS".

### B. DSP "Atmosphere" Chain
We process the raw PCM output from the neural model through a custom Web Audio API graph:
1.  **Source Node**: Raw Float32 PCM from Kokoro.
2.  **Dynamics Compressor**: A "glue" compressor (Ratio 3:1, Threshold -24dB) that brings up soft whispers while taming loud transients—critical for consistent ASMR volume.
3.  **7-Band EQ**: Custom Biquad filter bank.
    *   *ASMR Mode*: Boosts "Air" (12kHz+) and "Warmth" (200Hz).
    *   *Podcast Mode*: Boosts "Presence" (3kHz) and cuts "Mud" (400Hz).

## 3. The "Hive Mind" (`hive-mind.js`)

An **Adaptive Client-Side Learning System** that personalizes the experience without a backend.

*   **Behavioral Embeddings**: The system tracks user interactions:
    *   *Micro-adjustments*: If a user constantly speeds up the audio, the Hive Mind learns a `speed_bias`.
    *   *Skip Patterns*: If a user skips long pauses, the system reduces the `pause_duration` global multiplier.
*   **Vector-Like Storage**: Preferences are stored in `localStorage` as weighted vectors associated with specific voice IDs.
*   **Optimization**: At runtime, `hiveMind.getOptimizedSettings(baseSettings)` injects these learned biases into the DSP chain automatically.

## 4. "Zen" UI System (`theme-manager.js` & `index.css`)

A fully dynamic, GPU-accelerated UI framework designed for immersion ("Zen Mode").

*   **CSS Variable Mapping**: The entire app sits on top of abstract `--zen-*` variables (`--zen-surface`, `--zen-primary`) rather than hardcoded hex values.
*   **Dynamic Glassmorphism**: The `VideoBackground` component renders a backdrop, and the UI layers above it use `backdrop-filter: blur()` combined with `color-mix()` to create readable glass panels that take on the tint of the user's custom background.
*   **Media Persistence**: User-uploaded video backgrounds are stored in **IndexedDB** (not localStorage) to handle large file sizes (up to 50MB) while keeping the initial page load fast.

## 5. Strict Backend Performance (`generate_f5_embeddings.py`)

The python backend script for voice cloning now runs in **Strict Mode**:
*   **CUDA Enforcement**: It refuses to run on CPU for embedding generation to guarantee the highest precision for the extracted voice vectors.
*   **Feature Extraction**: It doesn't just "clone" the voice; it extracts metadata:
    *   `warmth` (Low-mid energy ratio)
    *   `breathiness` (High-frequency noise floor)
    *   `pitch` (Fundamental frequency)
    This metadata is baked into the `voice-manifest.json` and used by the frontend to auto-select the best matching DSP preset.
