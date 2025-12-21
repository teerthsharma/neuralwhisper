# ASMR Brain - Research Notes

## Abstract
The "ASMR Brain" is a client-side deep learning agent designed to optimize user relaxation by adapting audio synthesis parameters (Voice, Pitch, Speed) based on temporal and interaction context. Unlike traditional recommender systems that rely on server-side processing, this model operates entirely within the user's browser using WebGL-accelerated TensorFlow.js, ensuring complete data privacy and zero latency.

## 1. Problem Definition
ASMR (Autonomous Sensory Meridian Response) triggers are highly subjective and context-dependent. A user may prefer a fast-talking, crisp whisper in the morning (for focus) but a slow, deep, distinct voice at night (for sleep). Static presets fail to capture these dynamic preferences.

## 2. Model Architecture
We utilize a **Multi-Task Neural Network** implemented via `tf.sequential` or the functional API in TensorFlow.js.

### 2.1 Input Vector (Features)
The input layer consists of a normalized feature vector $X$:
- **Time of Day** ($t \in [0, 1]$): Cyclic representation using $\sin(2\pi t)$ and $\cos(2\pi t)$ to handle the 23:59 -> 00:00 transition continuity.
- **Day of Week** ($d \in [0, 6]$): One-hot encoded or normalized scalar.
- **Session Duration**: How long the user has been active.
- **Recent Interaction**: Previous Speed/Pitch deltas.

### 2.2 Hidden Layers
- **Layer 1**: Dense (16 units, Activation: ReLU) - Extracts temporal patterns.
- **Layer 2**: Dense (16 units, Activation: ReLU) - Non-linear feature combination.

### 2.3 Output Layers (Multi-Head)
The network diverges into specific prediction heads:
1.  **Voice Classifier** (Softmax): Probability distribution over available voice profiles (e.g., `american_casual`, `process_high_class`).
2.  **Speed Regressor** (Linear/Sigmoid): Predicted speech rate multiplier (0.5x - 2.0x).
3.  **Pitch Regressor** (Linear/Sigmoid): Predicted pitch shift (0.8x - 1.5x).

## 3. Training Strategy (Online Learning)
The model employs **Online Stochastic Gradient Descent (SGD)**.
- **Data Collection**: Every time the user completes a "listen" (defined as >30s duration) or explicitly "Likes" a generation, a training example $(X, Y)$ is stored in IndexedDB.
- **Training Trigger**: When $N=10$ new examples are collected, the model runs a training step (1-5 epochs) in the background.
- **Loss Function**:
    - Categorical Cross-entropy for Voice.
    - Mean Squared Error (MSE) for Speed/Pitch.

## 4. Privacy & Performance
- **Local-Only**: No data ever leaves the `localhost`.
- **WebGL Backend**: Computations are offloaded to the GPU to prevent main-thread blocking, ensuring smooth UI animations ("Liquid Glass" effect) remain uninterrupted.

## 5. Future Research Directions
- **Reinforcement Learning (RL)**: Implementing a bandit algorithm to explore new voices/settings to prevent "filter bubbles".
- **Audio Feature Extraction**: Using the Web Audio API analyzer node to feed real-time spectral centroids back into the model as feedback.
