"""
ASMR Voice Sample Processor
===========================
Cleans YouTube-sourced ASMR samples for voice cloning.

Pipeline:
1. Demucs - Isolate vocals from background music/noise
2. Silero VAD - Detect speech-only segments
3. Extract cleanest 6-10 second whisper clip

Usage:
    python process_samples.py
"""

import os
import torch
import torchaudio
import numpy as np
from pathlib import Path
from pydub import AudioSegment
import subprocess
import shutil

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SAMPLES_DIR = PROJECT_DIR  # MP3 files are in root
OUTPUT_DIR = PROJECT_DIR / "processed_voices"
TEMP_DIR = PROJECT_DIR / "temp_processing"

# Ensure output directories exist
OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

def load_silero_vad():
    """Load Silero VAD model for voice activity detection."""
    model, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-vad',
        model='silero_vad',
        force_reload=False,
        onnx=False
    )
    (get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils
    return model, get_speech_timestamps, read_audio, collect_chunks

def separate_vocals_demucs(input_path: Path, output_dir: Path) -> Path:
    """
    Use Demucs to separate vocals from background audio.
    Returns path to isolated vocals.
    """
    print(f"  🎵 Separating vocals with Demucs...")
    
    # Run demucs command
    cmd = [
        "python", "-m", "demucs",
        "--two-stems", "vocals",  # Only extract vocals
        "-o", str(output_dir),
        str(input_path)
    ]
    
    subprocess.run(cmd, check=True, capture_output=True)
    
    # Find the vocals output
    stem_name = input_path.stem
    vocals_path = output_dir / "htdemucs" / stem_name / "vocals.wav"
    
    if not vocals_path.exists():
        raise FileNotFoundError(f"Demucs output not found: {vocals_path}")
    
    return vocals_path

def extract_best_segment(audio_path: Path, model, get_speech_timestamps, read_audio, collect_chunks) -> np.ndarray:
    """
    Use Silero VAD to find the cleanest speech segment (6-10 seconds).
    """
    print(f"  🎤 Detecting speech segments with VAD...")
    
    # Read audio at 16kHz for VAD
    wav = read_audio(str(audio_path), sampling_rate=16000)
    
    # Get speech timestamps
    speech_timestamps = get_speech_timestamps(
        wav, 
        model,
        threshold=0.5,
        min_speech_duration_ms=500,
        min_silence_duration_ms=100
    )
    
    if not speech_timestamps:
        print("  ⚠️ No speech detected, using full audio")
        return wav.numpy()
    
    # Find segments between 6-10 seconds
    target_min = 6 * 16000  # 6 seconds in samples
    target_max = 10 * 16000  # 10 seconds in samples
    
    best_segment = None
    best_score = 0
    
    # Try single segments first
    for ts in speech_timestamps:
        duration = ts['end'] - ts['start']
        if target_min <= duration <= target_max:
            # Prefer segments closer to 8 seconds
            score = 1.0 - abs(duration - 8 * 16000) / (4 * 16000)
            if score > best_score:
                best_score = score
                best_segment = wav[ts['start']:ts['end']]
    
    # If no single segment fits, combine adjacent segments
    if best_segment is None:
        combined_samples = []
        current_duration = 0
        
        for ts in speech_timestamps:
            segment = wav[ts['start']:ts['end']]
            combined_samples.append(segment)
            current_duration += len(segment)
            
            if current_duration >= target_min:
                break
        
        if combined_samples:
            best_segment = torch.cat(combined_samples)
            
            # Trim to max 10 seconds
            if len(best_segment) > target_max:
                best_segment = best_segment[:target_max]
    
    if best_segment is None:
        # Fallback: use first 8 seconds
        best_segment = wav[:min(len(wav), 8 * 16000)]
    
    return best_segment.numpy()

def normalize_audio(audio: np.ndarray, target_db: float = -20.0) -> np.ndarray:
    """Normalize audio to target dB level."""
    rms = np.sqrt(np.mean(audio ** 2))
    if rms > 0:
        target_rms = 10 ** (target_db / 20)
        audio = audio * (target_rms / rms)
    return np.clip(audio, -1.0, 1.0)

def process_sample(input_path: Path, output_path: Path, vad_model, vad_utils):
    """Process a single ASMR sample."""
    print(f"\n🔊 Processing: {input_path.name}")
    
    get_speech_timestamps, read_audio, collect_chunks = vad_utils
    
    # Step 1: Convert MP3 to WAV if needed
    temp_wav = TEMP_DIR / f"{input_path.stem}_temp.wav"
    audio = AudioSegment.from_file(str(input_path))
    audio = audio.set_channels(1).set_frame_rate(44100)
    audio.export(str(temp_wav), format="wav")
    
    # Step 2: Separate vocals with Demucs
    try:
        vocals_path = separate_vocals_demucs(temp_wav, TEMP_DIR)
    except Exception as e:
        print(f"  ⚠️ Demucs failed: {e}, using original audio")
        vocals_path = temp_wav
    
    # Step 3: Extract best segment with VAD
    best_segment = extract_best_segment(
        vocals_path, 
        vad_model, 
        get_speech_timestamps, 
        read_audio, 
        collect_chunks
    )
    
    # Step 4: Normalize
    normalized = normalize_audio(best_segment)
    
    # Step 5: Save as WAV (16kHz for XTTS compatibility)
    # Convert to tensor for saving
    audio_tensor = torch.from_numpy(normalized).unsqueeze(0).float()
    torchaudio.save(str(output_path), audio_tensor, 16000)
    
    duration = len(normalized) / 16000
    print(f"  ✅ Saved: {output_path.name} ({duration:.1f}s)")
    
    return output_path

def main():
    print("=" * 50)
    print("🎧 ASMR Voice Sample Processor")
    print("=" * 50)
    
    # Find all MP3 files in project directory
    mp3_files = list(SAMPLES_DIR.glob("*.mp3"))
    
    if not mp3_files:
        print("❌ No MP3 files found in project directory!")
        return
    
    print(f"\n📁 Found {len(mp3_files)} samples to process:")
    for f in mp3_files:
        print(f"   - {f.name}")
    
    # Load VAD model
    print("\n🔄 Loading Silero VAD model...")
    vad_model, get_speech_timestamps, read_audio, collect_chunks = load_silero_vad()
    vad_utils = (get_speech_timestamps, read_audio, collect_chunks)
    
    # Process each sample
    processed = []
    for mp3_file in mp3_files:
        # Create clean output name
        voice_name = mp3_file.stem.replace(" ", "_").lower()
        output_path = OUTPUT_DIR / f"{voice_name}.wav"
        
        try:
            process_sample(mp3_file, output_path, vad_model, vad_utils)
            processed.append(output_path)
        except Exception as e:
            print(f"  ❌ Failed: {e}")
    
    # Cleanup temp directory
    print("\n🧹 Cleaning up temporary files...")
    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    
    print("\n" + "=" * 50)
    print(f"✨ Processing complete! {len(processed)} voices ready.")
    print(f"📂 Output directory: {OUTPUT_DIR}")
    print("=" * 50)
    
    # List processed files
    for p in processed:
        print(f"   ✓ {p.name}")

if __name__ == "__main__":
    main()
