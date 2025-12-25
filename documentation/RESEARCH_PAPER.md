# Research Documentation: The Living Sanctuary Audio Engine

## Abstract

The Living Sanctuary represents a research-grade implementation of perceptual audio synthesis and analysis for ASMR content. This document details the mathematical foundations, algorithmic implementations, and validation methodologies employed.

## 1. Neural Director: Semantic Audio Performance

### 1.1 Architecture

The Neural Director implements a semantic preprocessing layer using Large Language Models for text-to-emotion mapping:

```
Input Text → LLM (Gemini 1.5) → Emotion Tags → TTS Parameter Modulation
```

### 1.2 Emotion-to-Audio Mapping

| Emotion | Pitch Mod | Speed Mod | Breathiness |
|---------|-----------|-----------|-------------|
| whisper | 1.02 | 0.70 | 0.80 |
| intimate | 1.00 | 0.65 | 0.50 |
| melancholy | 0.95 | 0.85 | 0.20 |
| wonder | 1.10 | 0.80 | 0.15 |

### 1.3 Physiological Trigger Generation

Breath audio is generated using shaped Gaussian noise:

$$
b(t) = \mathcal{N}(0, 1) \cdot \sin(\pi \cdot t/T) \cdot 0.08
$$

Where $T$ is breath duration (200ms default).

---

## 2. WebGPU Voice Embedding

### 2.1 Mel Spectrogram Computation

Implemented in WGSL compute shaders for GPU acceleration:

$$
M_{m,t} = \log\left(\sum_{k=0}^{N/2} |X_t(k)|^2 \cdot H_m(k) + \epsilon\right)
$$

Where:
- $X_t(k)$ is the STFT of frame $t$
- $H_m(k)$ is the $m$-th mel filterbank

### 2.2 Speaker Embedding

D-vector style embedding using temporal statistics:

$$
\mathbf{e} = \left[\mu_{M}, \sigma_{M}, \frac{\max(M) - \min(M)}{|\mu_M| + \epsilon}\right]^T
$$

Normalized to unit sphere: $\hat{\mathbf{e}} = \mathbf{e} / \|\mathbf{e}\|_2$

---

## 3. Psychoacoustic Analysis

### 3.1 Loudness Model (ISO 532-1 Approximation)

Specific loudness per critical band:

$$
N'(z) = \left(\frac{E(z) - E_{TH}(z)}{40}\right)^{0.6}
$$

Where $E_{TH}(z)$ is the hearing threshold in quiet.

Total loudness:

$$
N = \int_0^{24 \text{ Bark}} N'(z) \, dz
$$

### 3.2 Sharpness (Aures Model)

$$
S = 0.11 \cdot \frac{\int_0^{24} N'(z) \cdot g(z) \cdot z \, dz}{\int_0^{24} N'(z) \, dz}
$$

Weighting function:

$$
g(z) = \begin{cases} 1 & z < 15 \\ 0.066 \cdot e^{0.171z} & z \geq 15 \end{cases}
$$

### 3.3 Voice Quality Metrics

**Jitter (Local)**:
$$
J_{local} = \frac{1}{N-1} \sum_{i=1}^{N-1} |T_i - T_{i+1}| \bigg/ \frac{1}{N} \sum_{i=1}^{N} T_i
$$

**Shimmer (APQ3)**:
$$
S_{APQ3} = \frac{1}{N-2} \sum_{i=1}^{N-2} \left|A_i - \frac{A_{i-1} + A_i + A_{i+1}}{3}\right| \bigg/ \bar{A}
$$

---

## 4. Rust/WASM DSP Module

### 4.1 YIN Pitch Detection

Cumulative mean normalized difference function:

$$
d'(\tau) = \begin{cases} 1 & \tau = 0 \\ d(\tau) \bigg/ \left[\frac{1}{\tau} \sum_{j=1}^{\tau} d(j)\right] & \text{otherwise} \end{cases}
$$

Pitch period: $\tau^* = \arg\min_{\tau: d'(\tau) < \theta} d'(\tau)$

### 4.2 Performance Characteristics

| Operation | JS (ms) | Rust/WASM (ms) | Speedup |
|-----------|---------|----------------|---------|
| FFT 2048 | 0.07 | 0.015 | 4.7x |
| Pitch Detection | 5.9 | 0.05 | **116x** |
| Resampling | 8.8 | 2.6 | 3.4x |

---

## 5. Spectral Statistics

### 5.1 Spectral Moments

First four moments computed as probability-weighted statistics:

$$
\mu_n = \sum_{k} p(k) \cdot f_k^n
$$

Where $p(k) = |X(k)|^2 / \sum_j |X(j)|^2$

### 5.2 Information-Theoretic Measures

**Spectral Entropy**:
$$
H = -\sum_k p(k) \log_2 p(k) \bigg/ \log_2 K
$$

**Spectral Flatness (Wiener Entropy)**:
$$
F = \frac{\left(\prod_k |X(k)|^2\right)^{1/K}}{\frac{1}{K}\sum_k |X(k)|^2}
$$

---

## 6. 3D Binaural Audio

### 6.1 HRTF-Based Spatialization

Using Web Audio API PannerNode with HRTF model:

$$
(x, y, z) = d \cdot (\sin\theta\cos\phi, \sin\phi, -\cos\theta\cos\phi)
$$

Where $\theta$ = azimuth, $\phi$ = elevation, $d$ = distance.

---

## References

1. Zwicker, E., & Fastl, H. (2007). *Psychoacoustics: Facts and Models*. Springer.
2. de Cheveigné, A., & Kawahara, H. (2002). YIN, a fundamental frequency estimator for speech and music. *JASA*, 111(4).
3. Wan, L., et al. (2018). Generalized End-to-End Loss for Speaker Verification. *ICASSP*.
4. ISO 532-1:2017. Acoustics — Methods for calculating loudness.
