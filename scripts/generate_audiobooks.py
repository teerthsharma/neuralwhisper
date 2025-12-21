"""
Generate Premium Audiobooks using F5-TTS
========================================
Optimized for NVIDIA RTX 4060 (8GB VRAM)

Generates 3 samples:
1. Genghis Khan (History) -> formal english male
2. Anime (Culture) -> ASIAN female
3. Russia (Geography) -> Russian High class girl
"""

import os
import torch
import soundfile as sf
from pathlib import Path
from f5_tts.api import F5TTS
import requests
import re

# Logic to prevent OOM on 8GB card
torch.backends.cudnn.benchmark = True

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "audiobooks"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Wikipedia API
def get_wikipedia_summary(title, sentences=15):
    """Get clean summary text from Wikipedia."""
    print(f"📖 Fetching Wikipedia: {title}...")
    try:
        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "format": "json",
            "titles": title,
            "prop": "extracts",
            "exintro": True,
            "explaintext": True,
        }
        r = requests.get(url, params=params).json()
        page = next(iter(r["query"]["pages"].values()))
        text = page["extract"]
        
        # Clean text
        text = re.sub(r'\[.*?\]', '', text) # Remove citations
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Limit length roughly (F5-TTS context window)
        # We'll stick to the intro for a good 3-5 min sample
        return text
    except Exception as e:
        print(f"❌ Failed to fetch {title}: {e}")
        return None

def main():
    print("🚀 Initializing F5-TTS for Audiobook Generation...")
    
    if not torch.cuda.is_available():
        print("❌ Error: CUDA not available. This script requires a GPU.")
        return

    # Check VRAM
    vram = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"🎮 GPU: {torch.cuda.get_device_name(0)} ({vram:.1f} GB VRAM)")
    
    # Load F5-TTS Model
    try:
        f5tts = F5TTS() # Default init uses local config/ckpt if available or downloads
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return

    # Task List
    tasks = [
        {
            "title": "Genghis Khan",
            "wiki_title": "Genghis_Khan",
            "voice_file": "frontend/public/voices/formal_english_male_reference.wav",
            "output_file": "genghis_khan_sample.wav"
        },
        {
            "title": "Anime",
            "wiki_title": "Anime",
            "voice_file": "frontend/public/voices/asian_female_reference.wav",
            "output_file": "anime_sample.wav"
        },
        {
            "title": "Russia",
            "wiki_title": "Russia",
            "voice_file": "frontend/public/voices/russian_high_class_girl_reference.wav",
            "output_file": "russia_sample.wav"
        }
    ]

    for task in tasks:
        print(f"\n🎙️ Processing Audiobook: {task['title']}")
        
        # 1. Get Text
        text = get_wikipedia_summary(task['wiki_title'])
        if not text:
            continue
            
        print(f"   📝 Text length: {len(text)} chars")
        
        # 2. Get Reference Audio
        ref_audio = PROJECT_DIR / task['voice_file']
        if not ref_audio.exists():
            print(f"   ❌ Reference audio not found: {ref_audio}")
            continue
            
        # 3. Generate Audio
        print(f"   ⚡ Synthesizing (Optimized for 8GB VRAM)...")
        try:
            # F5-TTS API handling
            wav, sr, _ = f5tts.infer(
                ref_file=str(ref_audio),
                ref_text="",  # F5-TTS can auto-transcribe ref if empty, or we can leave it blank if using cross-attn
                gen_text=text,
                remove_silence=True,
                speed=1.0
            )
            
            # 4. Save
            out_path = OUTPUT_DIR / task['output_file']
            sf.write(str(out_path), wav, sr)
            print(f"   ✅ Saved to: {out_path}")
            
            # Clear Cache to prevent VRAM formatting issues between huge tasks
            torch.cuda.empty_cache()
            
        except Exception as e:
            print(f"   ❌ Generation failed: {e}")

    print("\n✨ All Audiobooks Generated!")

if __name__ == "__main__":
    main()
