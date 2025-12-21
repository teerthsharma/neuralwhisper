# 🌊 Open Source ASMR Reader ("Zen Edition")

> *The world's most intelligent, high-fidelity neural audio reader.*

![Zen UI Preview](https://via.placeholder.com/1200x600?text=Zen+UI+Preview)

**ASMR Reader** is a next-generation text-to-speech application designed for deep relaxation, podcasting, and immersive reading. It moves beyond standard TTS by combining **Neural Document Processing** with a **High-Fidelity WebGPU Audio Stack** to create an experience that feels alive.

## 🚀 Key Features ("Game-Changing")

### 🧠 Neural Document Intelligence
Stop listening to broken PDF text. Our **Neural Processor** understands layout and flow.
-   **Spatial Reconstruction**: Reads PDF `transform` matrices to reconstruct multi-column layouts perfectly.
-   **NLP Segmentation**: Uses natural language processing to detect "breath groups," inserting dynamic pauses where a human reader would breath.
-   **Smart Cleaning**: Automatically removes neurological interruptions like headers, footers, and page numbers.

### 🔊 Studio-Grade Audio Stack (FP32)
We don't do "robotic." We do **Hyper-Realism**.
-   **WebGPU Accelerated**: Runs `Kokoro-82M` models directly on your GPU in **Full Precision (FP32)** mode. No quantization artifacts.
-   **Real-Time DSP**: Integrated "Atmosphere" chain with:
    -   *Dynamics Compressor*: Smooths volume for ASMR intimacy.
    -   *7-Band EQ*: Presets for "ASMR," "Podcast Host," and "Reference."
-   **Robust Fallback**: Automatically degrades from `WebGPU -> WASM -> WebSpeech` if hardware limits are hit.

### 🎨 "Zen" Atmosphere System
Your reading environment matters.
-   **Dynamic Glassmorphism**: The UI adapts to your background using real-time blur and color mixing.
-   **Live Backgrounds**: Drag & Drop **4K Video Loops** or Images to set the mood.
-   **The Hive Mind**: The app **learns** from you. If you skip pauses or speed up specific voices, it remembers and adapts future playback automatically.

### 🎙️ F5-TTS Voice Cloning (Advanced)
Clone any voice with industry-leading precision.
-   **Strict CUDA Backend**: Python scripts enforce NVIDIA GPU usage to extract deep vocal characteristics (warmth, breathiness, pitch).
-   **Voice Manifest**: Auto-generates JSON profiles that map your custom samples to the closest neural characteristics in the engine.

---

## 🛠️ Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep dive into the Neural Processor, Hive Mind vectors, and DSP signal flow.

## 📦 Installation (Local)

### Prerequisites
-   Node.js 18+
-   Python 3.10+ (for Voice Cloning)
-   NVIDIA GPU (Optional, for Cloning/Fast Inference)

### 1. Clone & Install
```bash
git clone https://github.com/your-username/asmr-reader.git
cd asmr-reader

# Install Frontend
cd frontend
npm install

# Install Python Backend (Optional)
cd ../scripts
pip install -r requirements.txt
```

### 2. Run Development Server
```bash
cd frontend
npm run dev
```

## 🌍 Deployment

### Vercel (Recommended)
This project is optimized for Vercel.
1.  Install Vercel CLI: `npm i -g vercel`
2.  Deploy:
    ```bash
    vercel --prod
    ```

## 🤝 Contributing

We welcome PRs for:
-   New DSP Audio Presets
-   Enhanced PDF Parsing Heuristics
-   New Visual Themes

## 📄 License
MIT License. Built with ❤️ for the ASMR community.
