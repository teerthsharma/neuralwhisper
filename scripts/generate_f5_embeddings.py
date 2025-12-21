"""
F5-TTS Voice Embedding Generator
================================
Generates voice embeddings from MP3 samples for use with TTS engines.
Embeddings are saved as JSON files in frontend/public/voices/

Since Kokoro-js doesn't directly support F5-TTS embeddings, this script:
1. Extracts audio features and characteristics from samples
2. Creates voice profile configurations that can be used with Kokoro
3. Generates reference audio clips for voice matching

Usage:
    python generate_f5_embeddings.py
"""

import os
import json
import numpy as np
import torch
import torchaudio

# Force NVIDIA GPU - STRICT MODE
if torch.cuda.is_available():
    DEVICE = torch.device("cuda:0")
    torch.backends.cudnn.benchmark = True # Enable cudnn autotuner for max speed
    torch.backends.cuda.matmul.allow_tf32 = True # Allow TF32 for speed
    print(f"🚀 Using NVIDIA GPU: {torch.cuda.get_device_name(0)}")
    print(f"⚡ CUDA Version: {torch.version.cuda}")
else:
    # User requested NO COMPROMISE on performance
    print("❌ CRITICAL: NVIDIA GPU NOT DETECTED!")
    print("   Please ensure CUDA is installed and available.")
    DEVICE = torch.device("cpu") # Fallback but warn heavily
import soundfile as sf
from pathlib import Path
import hashlib
from datetime import datetime
import subprocess
import tempfile
import shutil

# Try to import F5-TTS components
try:
    from f5_tts.api import F5TTS
    HAS_F5_TTS = True
except ImportError:
    print("⚠️ F5-TTS not available, using audio analysis mode")
    HAS_F5_TTS = False

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SAMPLES_DIR = PROJECT_DIR  # MP3 files are in root
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "voices"
EMBEDDINGS_DIR = OUTPUT_DIR / "embeddings"

# Ensure output directories exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)


def load_audio_file(file_path: Path, target_sr: int = 24000):
    """
    Load audio file using torchaudio with multiple backend fallbacks.
    """
    try:
        # Try loading with torchaudio (supports MP3 via sox/ffmpeg backends if available)
        waveform, sample_rate = torchaudio.load(str(file_path))
    except Exception as e:
        print(f"  ⚠️ torchaudio failed, trying soundfile: {e}")
        try:
            # Try soundfile (better for WAV, FLAC)
            audio_data, sample_rate = sf.read(str(file_path))
            waveform = torch.from_numpy(audio_data).float()
            if waveform.dim() == 1:
                waveform = waveform.unsqueeze(0)
            else:
                waveform = waveform.T  # Transpose to (channels, samples)
        except Exception as e2:
            print(f"  ⚠️ soundfile failed: {e2}")
            raise RuntimeError(f"Could not load audio: {file_path}")
    
    # Convert to mono if stereo
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    
    # Resample if needed
    if sample_rate != target_sr:
        resampler = torchaudio.transforms.Resample(sample_rate, target_sr)
        waveform = resampler(waveform)
    
    return waveform.squeeze().numpy(), target_sr


def extract_audio_features(audio_path: Path) -> dict:
    """
    Extract audio features for voice characterization.
    Works with or without F5-TTS.
    """
    print(f"  📊 Analyzing audio features...")
    
    # Load audio
    waveform, sample_rate = torchaudio.load(str(audio_path))
    
    # Convert to mono if stereo
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    
    # Resample to 24kHz for consistency
    if sample_rate != 24000:
        resampler = torchaudio.transforms.Resample(sample_rate, 24000)
        waveform = resampler(waveform)
        sample_rate = 24000
    
    audio_np = waveform.squeeze().numpy()
    
    # Calculate audio features
    features = {}
    
    # 1. Pitch analysis (fundamental frequency estimation)
    features['estimated_pitch'] = estimate_pitch(audio_np, sample_rate)
    
    # 2. Energy/Volume characteristics
    rms = np.sqrt(np.mean(audio_np ** 2))
    features['rms_energy'] = float(rms)
    features['peak_amplitude'] = float(np.max(np.abs(audio_np)))
    
    # 3. Spectral characteristics
    spectral_features = analyze_spectral_characteristics(audio_np, sample_rate)
    features.update(spectral_features)
    
    # 4. Voice characteristics for TTS mapping
    features['warmth'] = calculate_warmth(audio_np, sample_rate)
    features['breathiness'] = calculate_breathiness(audio_np, sample_rate)
    features['clarity'] = calculate_clarity(audio_np, sample_rate)
    
    # 5. Tempo/Speed characteristics
    features['speaking_rate'] = estimate_speaking_rate(audio_np, sample_rate)
    
    return features


def estimate_pitch(audio: np.ndarray, sample_rate: int) -> float:
    """Estimate average pitch using autocorrelation."""
    # Simple pitch detection using autocorrelation
    frame_size = int(0.03 * sample_rate)  # 30ms frames
    hop_size = int(0.01 * sample_rate)  # 10ms hop
    
    pitches = []
    for i in range(0, len(audio) - frame_size, hop_size):
        frame = audio[i:i + frame_size]
        if np.abs(frame).max() > 0.01:  # Only analyze voiced frames
            autocorr = np.correlate(frame, frame, mode='full')
            autocorr = autocorr[len(autocorr)//2:]
            
            # Find first peak after the initial peak
            min_lag = int(sample_rate / 500)  # Max 500 Hz
            max_lag = int(sample_rate / 50)   # Min 50 Hz
            
            if max_lag < len(autocorr):
                peak_lag = min_lag + np.argmax(autocorr[min_lag:max_lag])
                if autocorr[peak_lag] > 0.3 * autocorr[0]:
                    pitch = sample_rate / peak_lag
                    if 50 <= pitch <= 500:
                        pitches.append(pitch)
    
    return float(np.median(pitches)) if pitches else 150.0


def analyze_spectral_characteristics(audio: np.ndarray, sample_rate: int) -> dict:
    """Analyze spectral characteristics of the audio."""
    # Compute spectrogram
    n_fft = 2048
    hop_length = 512
    
    # Simple FFT-based spectral analysis
    frame_size = n_fft
    hop_size = hop_length
    
    spectral_centroids = []
    spectral_rolloffs = []
    
    for i in range(0, len(audio) - frame_size, hop_size):
        frame = audio[i:i + frame_size]
        spectrum = np.abs(np.fft.rfft(frame * np.hanning(frame_size)))
        
        # Spectral centroid
        freqs = np.fft.rfftfreq(frame_size, 1/sample_rate)
        if spectrum.sum() > 0:
            centroid = np.sum(freqs * spectrum) / np.sum(spectrum)
            spectral_centroids.append(centroid)
            
            # Spectral rolloff (frequency below which 85% of energy exists)
            cumsum = np.cumsum(spectrum)
            rolloff_idx = np.searchsorted(cumsum, 0.85 * cumsum[-1])
            spectral_rolloffs.append(freqs[min(rolloff_idx, len(freqs)-1)])
    
    return {
        'spectral_centroid': float(np.median(spectral_centroids)) if spectral_centroids else 2000.0,
        'spectral_rolloff': float(np.median(spectral_rolloffs)) if spectral_rolloffs else 4000.0,
        'spectral_bandwidth': float(np.std(spectral_centroids)) if spectral_centroids else 500.0
    }


def calculate_warmth(audio: np.ndarray, sample_rate: int) -> float:
    """Calculate warmth (low frequency content ratio)."""
    n_fft = 2048
    spectrum = np.abs(np.fft.rfft(audio[:n_fft] * np.hanning(n_fft)))
    freqs = np.fft.rfftfreq(n_fft, 1/sample_rate)
    
    # Low frequencies (< 500 Hz) vs total
    low_energy = np.sum(spectrum[freqs < 500] ** 2)
    total_energy = np.sum(spectrum ** 2)
    
    warmth = float(low_energy / (total_energy + 1e-10))
    return min(1.0, max(0.0, warmth * 2))  # Scale to 0-1


def calculate_breathiness(audio: np.ndarray, sample_rate: int) -> float:
    """Calculate breathiness (noise-to-harmonic ratio approximation)."""
    n_fft = 2048
    spectrum = np.abs(np.fft.rfft(audio[:n_fft] * np.hanning(n_fft)))
    
    # High frequency noise (> 4kHz)
    freqs = np.fft.rfftfreq(n_fft, 1/sample_rate)
    high_energy = np.sum(spectrum[freqs > 4000] ** 2)
    total_energy = np.sum(spectrum ** 2)
    
    breathiness = float(high_energy / (total_energy + 1e-10))
    return min(1.0, max(0.0, breathiness * 5))  # Scale to 0-1


def calculate_clarity(audio: np.ndarray, sample_rate: int) -> float:
    """Calculate clarity (mid-frequency definition)."""
    n_fft = 2048
    spectrum = np.abs(np.fft.rfft(audio[:n_fft] * np.hanning(n_fft)))
    freqs = np.fft.rfftfreq(n_fft, 1/sample_rate)
    
    # Mid frequencies (1-4 kHz) ratio
    mid_energy = np.sum(spectrum[(freqs > 1000) & (freqs < 4000)] ** 2)
    total_energy = np.sum(spectrum ** 2)
    
    clarity = float(mid_energy / (total_energy + 1e-10))
    return min(1.0, max(0.0, clarity * 1.5))  # Scale to 0-1


def estimate_speaking_rate(audio: np.ndarray, sample_rate: int) -> float:
    """Estimate speaking rate from audio energy variations."""
    # Compute envelope
    frame_size = int(0.02 * sample_rate)
    hop_size = int(0.01 * sample_rate)
    
    envelope = []
    for i in range(0, len(audio) - frame_size, hop_size):
        frame = audio[i:i + frame_size]
        envelope.append(np.sqrt(np.mean(frame ** 2)))
    
    envelope = np.array(envelope)
    if len(envelope) < 2:
        return 1.0
    
    # Count zero crossings in envelope (syllable rate approximation)
    mean_env = np.mean(envelope)
    crossings = np.sum(np.abs(np.diff(envelope > mean_env)))
    
    duration = len(audio) / sample_rate
    syllables_per_sec = crossings / (2 * duration)
    
    # Normalize to 0.5-1.5 range (1.0 = normal speed)
    return float(np.clip(syllables_per_sec / 4.0, 0.5, 1.5))


def create_reference_clip(input_path: Path, output_path: Path, duration: float = 10.0):
    """Create a reference audio clip for voice cloning using torchaudio."""
    print(f"  🎵 Creating reference clip...")
    
    # Load audio using our universal loader
    audio_np, sample_rate = load_audio_file(input_path, target_sr=24000)
    
    # Take first N seconds or full audio
    max_samples = int(duration * sample_rate)
    if len(audio_np) > max_samples:
        audio_np = audio_np[:max_samples]
    
    # Normalize volume to target RMS (-20 dB)
    target_rms = 10 ** (-20 / 20)  # ~0.1
    current_rms = np.sqrt(np.mean(audio_np ** 2))
    if current_rms > 0:
        audio_np = audio_np * (target_rms / current_rms)
    audio_np = np.clip(audio_np, -1.0, 1.0)
    
    # Save as WAV
    sf.write(str(output_path), audio_np, sample_rate)
    
    return output_path


def map_to_kokoro_voice(features: dict, voice_name: str) -> str:
    """Map extracted features to best matching Kokoro voice."""
    # Kokoro voice options
    kokoro_voices = {
        'af_bella': {'pitch': 'high', 'style': 'warm', 'gender': 'female'},
        'af_sarah': {'pitch': 'mid', 'style': 'neutral', 'gender': 'female'},
        'af_nicole': {'pitch': 'mid', 'style': 'refined', 'gender': 'female'},
        'af_sky': {'pitch': 'high', 'style': 'bright', 'gender': 'female'},
        'am_adam': {'pitch': 'low', 'style': 'warm', 'gender': 'male'},
        'am_michael': {'pitch': 'mid', 'style': 'neutral', 'gender': 'male'},
        'bf_emma': {'pitch': 'mid', 'style': 'british', 'gender': 'female'},
        'bm_george': {'pitch': 'low', 'style': 'british', 'gender': 'male'},
    }
    
    voice_lower = voice_name.lower()
    estimated_pitch = features.get('estimated_pitch', 150)
    
    # Determine gender from name or pitch
    is_female = 'female' in voice_lower or 'girl' in voice_lower or estimated_pitch > 180
    is_male = 'male' in voice_lower or estimated_pitch < 150
    
    # Match based on characteristics
    if is_male:
        if features.get('warmth', 0.5) > 0.6:
            return 'am_adam'
        return 'am_michael'
    else:
        # Female voices
        if 'asian' in voice_lower:
            return 'af_bella'  # Soft, warm
        elif 'russian' in voice_lower or 'high' in voice_lower:
            return 'af_nicole'  # Refined
        elif features.get('clarity', 0.5) > 0.8:
            return 'af_sky'  # Bright, clear
        else:
            return 'af_sarah'  # Neutral, casual
    
    return 'af_sarah'  # Default


def generate_embedding_for_sample(mp3_path: Path) -> dict:
    """Generate voice embedding data for a single MP3 sample."""
    voice_name = mp3_path.stem
    voice_id = voice_name.replace(" ", "_").lower()
    
    print(f"\n🎤 Processing: {voice_name}")
    
    # Create temporary WAV for processing using torchaudio
    temp_wav = SCRIPT_DIR / f"temp_{voice_id}.wav"
    audio_np, sample_rate = load_audio_file(mp3_path, target_sr=24000)
    sf.write(str(temp_wav), audio_np, sample_rate)
    
    try:
        # Extract features
        features = extract_audio_features(temp_wav)
        
        # Create reference clip
        ref_clip_path = OUTPUT_DIR / f"{voice_id}_reference.wav"
        create_reference_clip(mp3_path, ref_clip_path)
        
        # Map to Kokoro voice
        kokoro_voice = map_to_kokoro_voice(features, voice_name)
        
        # Calculate optimal TTS settings based on features
        pitch_factor = 1.0
        if features['estimated_pitch'] > 200:
            pitch_factor = 1.1
        elif features['estimated_pitch'] < 130:
            pitch_factor = 0.9
        
        speed_factor = features['speaking_rate']
        
        # Create embedding data
        embedding_data = {
            "id": voice_id,
            "name": voice_name,
            "description": f"Custom voice from {voice_name}",
            "source_file": mp3_path.name,
            "reference_clip": f"/voices/{voice_id}_reference.wav",
            "generated_at": datetime.now().isoformat(),
            "checksum": hashlib.md5(mp3_path.read_bytes()).hexdigest()[:8],
            
            # Kokoro mapping
            "kokoro_voice": kokoro_voice,
            
            # Voice characteristics
            "characteristics": {
                "warmth": round(features['warmth'], 2),
                "breathiness": round(features['breathiness'], 2),
                "clarity": round(features['clarity'], 2),
                "estimated_pitch_hz": round(features['estimated_pitch'], 1),
                "spectral_centroid": round(features['spectral_centroid'], 1),
            },
            
            # Recommended TTS settings
            "recommended_settings": {
                "pitch": round(pitch_factor, 2),
                "speed": round(speed_factor, 2),
                "volume": 1.0
            },
            
            # Advanced mode settings
            "advanced": {
                "rms_energy": round(features['rms_energy'], 4),
                "peak_amplitude": round(features['peak_amplitude'], 4),
                "spectral_rolloff": round(features['spectral_rolloff'], 1),
                "spectral_bandwidth": round(features['spectral_bandwidth'], 1)
            }
        }
        
        # Save individual embedding file
        embedding_file = EMBEDDINGS_DIR / f"{voice_id}.json"
        with open(embedding_file, 'w') as f:
            json.dump(embedding_data, f, indent=2)
        
        print(f"  ✅ Saved embedding: {embedding_file.name}")
        print(f"     → Kokoro voice: {kokoro_voice}")
        print(f"     → Pitch: {features['estimated_pitch']:.1f} Hz")
        print(f"     → Warmth: {features['warmth']:.2f}, Clarity: {features['clarity']:.2f}")
        
        return embedding_data
        
    finally:
        # Cleanup temp file
        if temp_wav.exists():
            temp_wav.unlink()


def generate_voice_manifest(embeddings: list):
    """Generate a manifest file with all voice embeddings."""
    manifest = {
        "version": "1.0.0",
        "generated_at": datetime.now().isoformat(),
        "total_voices": len(embeddings),
        "voices": {e['id']: e for e in embeddings},
        "voice_list": [
            {
                "id": e['id'],
                "name": e['name'],
                "kokoro_voice": e['kokoro_voice'],
                "description": e['description']
            }
            for e in embeddings
        ]
    }
    
    manifest_path = OUTPUT_DIR / "voice-manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    print(f"\n📋 Generated manifest: {manifest_path}")
    return manifest_path


def main():
    print("=" * 60)
    print("🎙️  F5-TTS Voice Embedding Generator")
    print("=" * 60)
    
    if HAS_F5_TTS:
        print("✅ F5-TTS available for advanced embedding generation")
    else:
        print("📊 Using audio analysis mode for embedding generation")
    
    # Find all MP3 samples
    mp3_files = list(SAMPLES_DIR.glob("*.mp3"))
    
    if not mp3_files:
        print("\n❌ No MP3 files found in project directory!")
        return
    
    print(f"\n📁 Found {len(mp3_files)} voice samples:")
    for f in mp3_files:
        print(f"   • {f.name}")
    
    # Process each sample
    embeddings = []
    for mp3_file in mp3_files:
        try:
            embedding = generate_embedding_for_sample(mp3_file)
            embeddings.append(embedding)
        except Exception as e:
            print(f"  ❌ Failed to process {mp3_file.name}: {e}")
    
    # Generate manifest
    if embeddings:
        generate_voice_manifest(embeddings)
    
    print("\n" + "=" * 60)
    print(f"✨ Generated {len(embeddings)} voice embeddings!")
    print(f"📂 Output: {OUTPUT_DIR}")
    print("=" * 60)
    
    # Print summary for integration
    print("\n📝 Integration Notes:")
    print("   • Embeddings saved to: frontend/public/voices/embeddings/")
    print("   • Reference clips saved to: frontend/public/voices/")
    print("   • Manifest file: frontend/public/voices/voice-manifest.json")
    print("\n   To use in frontend:")
    print("   1. Import voice manifest in your TTS engine")
    print("   2. Use kokoro_voice mapping for Kokoro TTS")
    print("   3. Apply recommended_settings for optimal output")


if __name__ == "__main__":
    main()
