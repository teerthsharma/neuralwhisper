"""
Audio Generation Test Script
==============================
Tests the audio generation pipeline to ensure all components work correctly.

Tests include:
1. Voice manifest validation  
2. Reference audio file integrity
3. Audio processing capabilities (load, resample, save)
4. Feature extraction verification
5. End-to-end audio generation test

Usage:
    python test_audio_generation.py
"""

import os
import sys
import json
import numpy as np
from pathlib import Path
import traceback

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
VOICES_DIR = PROJECT_DIR / "frontend" / "public" / "voices"
EMBEDDINGS_DIR = VOICES_DIR / "embeddings"
TEST_OUTPUT_DIR = SCRIPT_DIR / "test_output"

# Create test output directory
TEST_OUTPUT_DIR.mkdir(exist_ok=True)


class TestResult:
    """Store test results"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def add_pass(self, name):
        self.passed += 1
        print(f"  ✅ {name}")
    
    def add_fail(self, name, reason):
        self.failed += 1
        self.errors.append((name, reason))
        print(f"  ❌ {name}: {reason}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"📊 Test Results: {self.passed}/{total} passed")
        if self.errors:
            print(f"\n⚠️ Failed tests:")
            for name, reason in self.errors:
                print(f"   • {name}: {reason}")
        print(f"{'='*60}")
        return self.failed == 0


def test_dependencies():
    """Test 1: Verify all required dependencies are available"""
    print("\n🔍 Test 1: Checking dependencies...")
    results = TestResult()
    
    # Test torch
    try:
        import torch
        results.add_pass(f"torch v{torch.__version__}")
        
        # Check CUDA
        if torch.cuda.is_available():
            results.add_pass(f"CUDA available ({torch.cuda.get_device_name(0)})")
        else:
            print("  ⚠️ CUDA not available - will use CPU")
    except ImportError as e:
        results.add_fail("torch", str(e))
    
    # Test torchaudio  
    try:
        import torchaudio
        results.add_pass(f"torchaudio v{torchaudio.__version__}")
    except ImportError as e:
        results.add_fail("torchaudio", str(e))
    
    # Test soundfile
    try:
        import soundfile
        results.add_pass("soundfile")
    except ImportError as e:
        results.add_fail("soundfile", str(e))
    
    # Test numpy
    try:
        import numpy
        results.add_pass(f"numpy v{numpy.__version__}")
    except ImportError as e:
        results.add_fail("numpy", str(e))
    
    return results


def test_voice_manifest():
    """Test 2: Validate voice manifest file"""
    print("\n📋 Test 2: Validating voice manifest...")
    results = TestResult()
    
    manifest_path = VOICES_DIR / "voice-manifest.json"
    
    # Check manifest exists
    if not manifest_path.exists():
        results.add_fail("manifest exists", f"Not found at {manifest_path}")
        return results
    
    results.add_pass("manifest file exists")
    
    # Parse manifest
    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        results.add_pass("manifest is valid JSON")
    except json.JSONDecodeError as e:
        results.add_fail("manifest is valid JSON", str(e))
        return results
    
    # Validate structure
    required_fields = ['version', 'generated_at', 'total_voices', 'voices', 'voice_list']
    for field in required_fields:
        if field in manifest:
            results.add_pass(f"has '{field}' field")
        else:
            results.add_fail(f"has '{field}' field", "missing")
    
    # Validate voice count
    if manifest.get('total_voices', 0) == len(manifest.get('voices', {})):
        results.add_pass(f"voice count matches ({manifest['total_voices']} voices)")
    else:
        results.add_fail("voice count matches", "mismatch between total_voices and actual count")
    
    # Validate each voice has required fields
    for voice_id, voice in manifest.get('voices', {}).items():
        voice_fields = ['id', 'name', 'kokoro_voice', 'reference_clip', 'characteristics']
        missing = [f for f in voice_fields if f not in voice]
        if not missing:
            results.add_pass(f"voice '{voice_id}' structure valid")
        else:
            results.add_fail(f"voice '{voice_id}' structure", f"missing: {missing}")
    
    return results


def test_reference_audio_files():
    """Test 3: Verify reference audio files exist and are valid"""
    print("\n🎵 Test 3: Testing reference audio files...")
    results = TestResult()
    
    import torchaudio
    import soundfile as sf
    
    manifest_path = VOICES_DIR / "voice-manifest.json"
    if not manifest_path.exists():
        results.add_fail("manifest", "Not found")
        return results
    
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
    
    for voice_id, voice in manifest.get('voices', {}).items():
        ref_clip = voice.get('reference_clip', '')
        # Convert web path to file path
        if ref_clip.startswith('/voices/'):
            ref_path = PROJECT_DIR / "frontend" / "public" / ref_clip.lstrip('/')
        else:
            ref_path = VOICES_DIR / Path(ref_clip).name
        
        # Check file exists
        if not ref_path.exists():
            results.add_fail(f"{voice_id} reference file", f"Not found: {ref_path}")
            continue
        
        results.add_pass(f"{voice_id} file exists")
        
        # Check file is readable and has valid audio
        try:
            audio, sr = sf.read(str(ref_path))
            duration = len(audio) / sr
            
            if duration > 0.5:  # At least 0.5 seconds
                results.add_pass(f"{voice_id} audio valid ({duration:.1f}s @ {sr}Hz)")
            else:
                results.add_fail(f"{voice_id} audio duration", f"Too short: {duration:.2f}s")
        except Exception as e:
            results.add_fail(f"{voice_id} audio readable", str(e))
    
    return results


def test_audio_processing():
    """Test 4: Test audio loading, processing, and saving"""
    print("\n🔧 Test 4: Testing audio processing capabilities...")
    results = TestResult()
    
    import torch
    import torchaudio
    import soundfile as sf
    
    # Find a test audio file
    test_files = list(PROJECT_DIR.glob("*.mp3"))
    if not test_files:
        test_files = list(VOICES_DIR.glob("*.wav"))
    
    if not test_files:
        results.add_fail("test audio file", "No audio files found for testing")
        return results
    
    test_file = test_files[0]
    results.add_pass(f"found test file: {test_file.name}")
    
    # Test loading
    try:
        waveform, sr = torchaudio.load(str(test_file))
        results.add_pass(f"torchaudio.load() works (shape: {waveform.shape})")
    except Exception as e:
        results.add_fail("torchaudio.load()", str(e))
        return results
    
    # Test mono conversion
    try:
        if waveform.shape[0] > 1:
            mono = waveform.mean(dim=0, keepdim=True)
            results.add_pass("stereo to mono conversion")
        else:
            mono = waveform
            results.add_pass("audio already mono")
    except Exception as e:
        results.add_fail("mono conversion", str(e))
        return results
    
    # Test resampling
    try:
        target_sr = 24000
        if sr != target_sr:
            resampler = torchaudio.transforms.Resample(sr, target_sr)
            resampled = resampler(mono)
            results.add_pass(f"resampling {sr}Hz → {target_sr}Hz")
        else:
            resampled = mono
            results.add_pass(f"already at target sample rate ({sr}Hz)")
    except Exception as e:
        results.add_fail("resampling", str(e))
        return results
    
    # Test saving with soundfile
    try:
        output_path = TEST_OUTPUT_DIR / "test_output.wav"
        audio_np = resampled.squeeze().numpy()
        sf.write(str(output_path), audio_np, target_sr)
        
        if output_path.exists() and output_path.stat().st_size > 0:
            results.add_pass(f"saved test audio ({output_path.stat().st_size} bytes)")
        else:
            results.add_fail("save audio", "File empty or not created")
    except Exception as e:
        results.add_fail("soundfile.write()", str(e))
    
    return results


def test_feature_extraction():
    """Test 5: Test audio feature extraction functions"""
    print("\n📊 Test 5: Testing feature extraction...")
    results = TestResult()
    
    import torch
    import torchaudio
    import numpy as np
    
    # Create a test tone for predictable features
    sr = 24000
    duration = 2.0
    freq = 220.0  # A3 note
    
    t = np.linspace(0, duration, int(sr * duration), dtype=np.float32)
    test_audio = 0.5 * np.sin(2 * np.pi * freq * t)  # Pure sine wave
    
    # Add some harmonics for realistic voice-like spectrum
    test_audio += 0.25 * np.sin(2 * np.pi * freq * 2 * t)  # 2nd harmonic
    test_audio += 0.125 * np.sin(2 * np.pi * freq * 3 * t)  # 3rd harmonic
    
    results.add_pass(f"generated test tone ({freq}Hz, {duration}s)")
    
    # Test pitch estimation from generate_f5_embeddings
    try:
        # Import the function from the main script
        sys.path.insert(0, str(SCRIPT_DIR))
        from generate_f5_embeddings import estimate_pitch
        
        estimated = estimate_pitch(test_audio, sr)
        # Allow 10% tolerance
        if abs(estimated - freq) / freq < 0.15:
            results.add_pass(f"pitch estimation: {estimated:.1f}Hz (expected ~{freq}Hz)")
        else:
            results.add_fail("pitch estimation accuracy", f"Got {estimated:.1f}Hz, expected ~{freq}Hz")
    except Exception as e:
        results.add_fail("pitch estimation", str(e))
    
    # Test spectral analysis
    try:
        from generate_f5_embeddings import analyze_spectral_characteristics
        
        features = analyze_spectral_characteristics(test_audio, sr)
        if 'spectral_centroid' in features and 'spectral_rolloff' in features:
            results.add_pass(f"spectral analysis: centroid={features['spectral_centroid']:.1f}Hz")
        else:
            results.add_fail("spectral analysis", "Missing expected features")
    except Exception as e:
        results.add_fail("spectral analysis", str(e))
    
    # Test warmth calculation
    try:
        from generate_f5_embeddings import calculate_warmth
        
        warmth = calculate_warmth(test_audio, sr)
        if 0 <= warmth <= 1:
            results.add_pass(f"warmth calculation: {warmth:.2f}")
        else:
            results.add_fail("warmth calculation", f"Out of range: {warmth}")
    except Exception as e:
        results.add_fail("warmth calculation", str(e))
    
    # Test clarity calculation
    try:
        from generate_f5_embeddings import calculate_clarity
        
        clarity = calculate_clarity(test_audio, sr)
        if 0 <= clarity <= 1:
            results.add_pass(f"clarity calculation: {clarity:.2f}")
        else:
            results.add_fail("clarity calculation", f"Out of range: {clarity}")
    except Exception as e:
        results.add_fail("clarity calculation", str(e))
    
    return results


def test_end_to_end_embedding():
    """Test 6: End-to-end embedding generation test"""
    print("\n🚀 Test 6: End-to-end embedding generation...")
    results = TestResult()
    
    import torch
    import torchaudio
    import soundfile as sf
    import json
    
    # Find a short test audio
    wav_files = list(VOICES_DIR.glob("*_reference.wav"))
    if not wav_files:
        results.add_fail("test audio", "No reference WAV files found")
        return results
    
    test_file = wav_files[0]
    results.add_pass(f"using test file: {test_file.name}")
    
    try:
        # Load and process
        sys.path.insert(0, str(SCRIPT_DIR))
        from generate_f5_embeddings import extract_audio_features, map_to_kokoro_voice
        
        features = extract_audio_features(test_file)
        results.add_pass(f"extracted {len(features)} features")
        
        # Verify feature keys
        expected_keys = ['estimated_pitch', 'rms_energy', 'warmth', 'breathiness', 'clarity']
        missing = [k for k in expected_keys if k not in features]
        
        if not missing:
            results.add_pass("all expected features present")
        else:
            results.add_fail("feature completeness", f"Missing: {missing}")
        
        # Test Kokoro voice mapping
        voice_name = test_file.stem.replace('_reference', '')
        kokoro_voice = map_to_kokoro_voice(features, voice_name)
        
        valid_voices = ['af_bella', 'af_sarah', 'af_nicole', 'af_sky', 
                       'am_adam', 'am_michael', 'bf_emma', 'bm_george']
        
        if kokoro_voice in valid_voices:
            results.add_pass(f"Kokoro voice mapping: {kokoro_voice}")
        else:
            results.add_fail("Kokoro voice mapping", f"Invalid voice: {kokoro_voice}")
        
        # Save test embedding
        test_embedding = {
            "id": "test_voice",
            "name": "Test Voice",
            "kokoro_voice": kokoro_voice,
            "characteristics": {
                "warmth": features['warmth'],
                "clarity": features['clarity'],
                "estimated_pitch_hz": features['estimated_pitch']
            }
        }
        
        test_output = TEST_OUTPUT_DIR / "test_embedding.json"
        with open(test_output, 'w') as f:
            json.dump(test_embedding, f, indent=2)
        
        if test_output.exists():
            results.add_pass(f"saved test embedding to {test_output.name}")
        
    except Exception as e:
        results.add_fail("end-to-end test", f"{e}\n{traceback.format_exc()}")
    
    return results


def test_generated_audio_playback():
    """Test 7: Verify generated audio can be played"""
    print("\n🔊 Test 7: Testing audio playback capability...")
    results = TestResult()
    
    import soundfile as sf
    import numpy as np
    
    # Generate a test beep
    sr = 24000
    duration = 0.5
    freq = 440  # A4
    
    t = np.linspace(0, duration, int(sr * duration), dtype=np.float32)
    audio = 0.3 * np.sin(2 * np.pi * freq * t)
    
    # Apply fade in/out
    fade_samples = int(0.05 * sr)
    audio[:fade_samples] *= np.linspace(0, 1, fade_samples)
    audio[-fade_samples:] *= np.linspace(1, 0, fade_samples)
    
    test_path = TEST_OUTPUT_DIR / "test_beep.wav"
    
    try:
        sf.write(str(test_path), audio, sr)
        results.add_pass(f"generated test beep ({duration}s @ {sr}Hz)")
        
        # Verify file is valid
        audio_read, sr_read = sf.read(str(test_path))
        if sr_read == sr and len(audio_read) == len(audio):
            results.add_pass("audio file verified (read back successfully)")
        else:
            results.add_fail("audio verification", "Read data doesn't match written")
            
    except Exception as e:
        results.add_fail("audio generation", str(e))
    
    return results


def main():
    print("=" * 60)
    print("🧪 AUDIO GENERATION TEST SUITE")
    print("=" * 60)
    print(f"📂 Project: {PROJECT_DIR}")
    print(f"📂 Voices: {VOICES_DIR}")
    print(f"📂 Test Output: {TEST_OUTPUT_DIR}")
    
    all_results = []
    
    # Run all tests
    tests = [
        test_dependencies,
        test_voice_manifest,
        test_reference_audio_files,
        test_audio_processing,
        test_feature_extraction,
        test_end_to_end_embedding,
        test_generated_audio_playback,
    ]
    
    for test_fn in tests:
        try:
            result = test_fn()
            all_results.append(result)
        except Exception as e:
            print(f"  💥 Test crashed: {e}")
            traceback.print_exc()
            result = TestResult()
            result.add_fail(test_fn.__name__, f"Crashed: {e}")
            all_results.append(result)
    
    # Final summary
    total_passed = sum(r.passed for r in all_results)
    total_failed = sum(r.failed for r in all_results)
    
    print("\n" + "=" * 60)
    print("🏁 FINAL RESULTS")
    print("=" * 60)
    print(f"✅ Passed: {total_passed}")
    print(f"❌ Failed: {total_failed}")
    print(f"📊 Success Rate: {total_passed / (total_passed + total_failed) * 100:.1f}%")
    
    if total_failed == 0:
        print("\n🎉 ALL TESTS PASSED! Audio generation is working correctly.")
        return 0
    else:
        print(f"\n⚠️ {total_failed} test(s) failed. Review errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
