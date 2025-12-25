/**
 * WASM vs JS DSP Benchmark
 * ========================
 * Compares Rust/WASM performance against pure JavaScript
 * 
 * This runs in Node.js with WASM support
 */

import { readFile } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// High-resolution timer
const now = () => {
    const [sec, nsec] = process.hrtime();
    return sec * 1000 + nsec / 1e6;
};

// ========== JS Implementations ==========

class JsFftProcessor {
    constructor(size) {
        this.size = size;
        this.window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            this.window[i] = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * i / (size - 1)));
        }

        this.twiddleReal = new Float32Array(size);
        this.twiddleImag = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            const angle = -2.0 * Math.PI * i / size;
            this.twiddleReal[i] = Math.cos(angle);
            this.twiddleImag[i] = Math.sin(angle);
        }

        this.bitReverse = new Uint32Array(size);
        const bits = Math.log2(size) | 0;
        for (let i = 0; i < size; i++) {
            let reversed = 0;
            for (let j = 0; j < bits; j++) {
                if (i & (1 << j)) {
                    reversed |= 1 << (bits - 1 - j);
                }
            }
            this.bitReverse[i] = reversed;
        }
    }

    powerSpectrum(samples) {
        const n = this.size;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);

        const len = Math.min(samples.length, n);
        for (let i = 0; i < len; i++) {
            real[this.bitReverse[i]] = samples[i] * this.window[i];
        }

        for (let size = 2; size <= n; size *= 2) {
            const halfSize = size / 2;
            const step = n / size;
            for (let i = 0; i < n; i += size) {
                for (let j = 0; j < halfSize; j++) {
                    const k = j * step;
                    const tReal = this.twiddleReal[k];
                    const tImag = this.twiddleImag[k];
                    const idx1 = i + j;
                    const idx2 = i + j + halfSize;
                    const tempReal = real[idx2] * tReal - imag[idx2] * tImag;
                    const tempImag = real[idx2] * tImag + imag[idx2] * tReal;
                    real[idx2] = real[idx1] - tempReal;
                    imag[idx2] = imag[idx1] - tempImag;
                    real[idx1] += tempReal;
                    imag[idx1] += tempImag;
                }
            }
        }

        const nBins = Math.floor(n / 2) + 1;
        const result = new Float32Array(nBins);
        for (let i = 0; i < nBins; i++) {
            result[i] = (real[i] * real[i] + imag[i] * imag[i]) / n;
        }
        return result;
    }
}

class JsPitchDetector {
    constructor(sampleRate, frameSize) {
        this.sampleRate = sampleRate;
        this.frameSize = frameSize;
        this.threshold = 0.1;
    }

    detect(samples) {
        const n = Math.min(samples.length, this.frameSize);
        const tauMax = Math.floor(n / 2);

        const diff = new Float32Array(tauMax);
        for (let tau = 1; tau < tauMax; tau++) {
            for (let j = 0; j < n - tau; j++) {
                const delta = samples[j] - samples[j + tau];
                diff[tau] += delta * delta;
            }
        }

        const cmnd = new Float32Array(tauMax);
        cmnd[0] = 1.0;
        let runningSum = 0;

        for (let tau = 1; tau < tauMax; tau++) {
            runningSum += diff[tau];
            cmnd[tau] = diff[tau] * tau / Math.max(runningSum, 1e-10);
        }

        const minPeriod = Math.floor(this.sampleRate / 500);
        const maxPeriod = Math.floor(this.sampleRate / 50);

        for (let tau = minPeriod; tau < Math.min(maxPeriod, tauMax); tau++) {
            if (cmnd[tau] < this.threshold) {
                return [this.sampleRate / tau, 1.0 - cmnd[tau]];
            }
        }
        return [0.0, 0.0];
    }
}

// ========== Load WASM Module ==========

async function loadWasm() {
    const wasmPath = join(__dirname, '../rust-dsp/pkg/sanctuary_dsp_bg.wasm');
    const jsPath = join(__dirname, '../rust-dsp/pkg/sanctuary_dsp.js');

    // Dynamic import the JS bindings (use file:// URL for Windows)
    const wasmModule = await import(pathToFileURL(jsPath).href);

    // Read and instantiate the WASM
    const wasmBytes = await readFile(wasmPath);
    await wasmModule.default(wasmBytes);

    return wasmModule;
}

// ========== Generate Test Audio ==========

function generateTestAudio(sampleRate, durationSec) {
    const numSamples = Math.floor(sampleRate * durationSec);
    const audio = new Float32Array(numSamples);
    const f0 = 220;
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        audio[i] =
            0.5 * Math.sin(2 * Math.PI * f0 * t) +
            0.3 * Math.sin(2 * Math.PI * f0 * 2 * t) +
            0.2 * Math.sin(2 * Math.PI * f0 * 3 * t) +
            0.05 * (Math.random() * 2 - 1);
    }
    return audio;
}

// ========== Benchmarks ==========

function benchmarkJsFft(iterations) {
    const fft = new JsFftProcessor(2048);
    const audio = generateTestAudio(44100, 0.05);

    // Warmup
    for (let i = 0; i < 20; i++) fft.powerSpectrum(audio);

    const start = now();
    for (let i = 0; i < iterations; i++) {
        fft.powerSpectrum(audio);
    }
    return (now() - start) / iterations;
}

function benchmarkWasmFft(wasm, iterations) {
    const fft = new wasm.FftProcessor(2048);
    const audio = generateTestAudio(44100, 0.05);

    // Warmup
    for (let i = 0; i < 20; i++) fft.power_spectrum(audio);

    const start = now();
    for (let i = 0; i < iterations; i++) {
        fft.power_spectrum(audio);
    }
    return (now() - start) / iterations;
}

function benchmarkJsPitch(iterations) {
    const detector = new JsPitchDetector(44100, 2048);
    const audio = generateTestAudio(44100, 0.05);

    // Warmup
    for (let i = 0; i < 20; i++) detector.detect(audio);

    const start = now();
    for (let i = 0; i < iterations; i++) {
        detector.detect(audio);
    }
    return (now() - start) / iterations;
}

function benchmarkWasmPitch(wasm, iterations) {
    const detector = new wasm.PitchDetector(44100, 2048);
    const audio = generateTestAudio(44100, 0.05);

    // Warmup
    for (let i = 0; i < 20; i++) detector.detect(audio);

    const start = now();
    for (let i = 0; i < iterations; i++) {
        detector.detect(audio);
    }
    return (now() - start) / iterations;
}

function benchmarkJsResample() {
    const audio = generateTestAudio(44100, 1.0);

    const resample = (samples, fromRate, toRate) => {
        const ratio = toRate / fromRate;
        const newLength = Math.floor(samples.length * ratio);
        const output = new Float32Array(newLength);
        const windowSize = 16;

        for (let i = 0; i < newLength; i++) {
            const srcPos = i / ratio;
            const srcIdx = Math.floor(srcPos);
            let sample = 0.0;
            let weightSum = 0.0;

            const jStart = Math.max(0, srcIdx - windowSize);
            const jEnd = Math.min(samples.length, srcIdx + windowSize);

            for (let j = jStart; j < jEnd; j++) {
                const x = (j - srcPos) * Math.PI;
                const sinc = Math.abs(x) < 1e-6 ? 1.0 : Math.sin(x) / x;
                const lanczosX = x / windowSize;
                let lanczos;
                if (Math.abs(lanczosX) >= 1.0) lanczos = 0.0;
                else if (Math.abs(lanczosX) < 1e-6) lanczos = 1.0;
                else {
                    const lanczosAngle = lanczosX * Math.PI;
                    lanczos = Math.sin(lanczosAngle) / lanczosAngle;
                }
                const w = sinc * lanczos;
                sample += samples[j] * w;
                weightSum += w;
            }
            output[i] = sample / Math.max(weightSum, 1e-10);
        }
        return output;
    };

    // Warmup
    resample(audio.slice(0, 4410), 44100, 16000);

    const start = now();
    resample(audio, 44100, 16000);
    return now() - start;
}

function benchmarkWasmResample(wasm) {
    const audio = generateTestAudio(44100, 1.0);

    // Warmup
    wasm.resample(audio.slice(0, 4410), 44100, 16000);

    const start = now();
    wasm.resample(audio, 44100, 16000);
    return now() - start;
}

// ========== Main ==========

async function main() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('                  WASM vs JS DSP BENCHMARK                          ');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');

    console.log('Loading WASM module...');
    const wasm = await loadWasm();
    console.log('✅ WASM module loaded\n');

    const ITERATIONS = 500;

    console.log(`Running FFT benchmark (${ITERATIONS} iterations)...`);
    const jsFft = benchmarkJsFft(ITERATIONS);
    const wasmFft = benchmarkWasmFft(wasm, ITERATIONS);
    const fftSpeedup = jsFft / wasmFft;
    console.log(`  JS:   ${jsFft.toFixed(4)}ms`);
    console.log(`  WASM: ${wasmFft.toFixed(4)}ms`);
    console.log(`  Speedup: ${fftSpeedup.toFixed(1)}x\n`);

    console.log(`Running Pitch Detection benchmark (${ITERATIONS} iterations)...`);
    const jsPitch = benchmarkJsPitch(ITERATIONS);
    const wasmPitch = benchmarkWasmPitch(wasm, ITERATIONS);
    const pitchSpeedup = jsPitch / wasmPitch;
    console.log(`  JS:   ${jsPitch.toFixed(4)}ms`);
    console.log(`  WASM: ${wasmPitch.toFixed(4)}ms`);
    console.log(`  Speedup: ${pitchSpeedup.toFixed(1)}x\n`);

    console.log('Running Resampling benchmark (1 second audio)...');
    const jsResample = benchmarkJsResample();
    const wasmResample = benchmarkWasmResample(wasm);
    const resampleSpeedup = jsResample / wasmResample;
    console.log(`  JS:   ${jsResample.toFixed(2)}ms`);
    console.log(`  WASM: ${wasmResample.toFixed(2)}ms`);
    console.log(`  Speedup: ${resampleSpeedup.toFixed(1)}x\n`);

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('                              RESULTS                               ');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('| Operation        | JS (ms)  | WASM (ms) | Speedup |');
    console.log('|------------------|----------|-----------|---------|');
    console.log(`| FFT 2048         | ${jsFft.toFixed(4).padStart(8)} | ${wasmFft.toFixed(4).padStart(9)} | ${fftSpeedup.toFixed(1).padStart(6)}x |`);
    console.log(`| Pitch Detection  | ${jsPitch.toFixed(4).padStart(8)} | ${wasmPitch.toFixed(4).padStart(9)} | ${pitchSpeedup.toFixed(1).padStart(6)}x |`);
    console.log(`| Resampling (1s)  | ${jsResample.toFixed(2).padStart(8)} | ${wasmResample.toFixed(2).padStart(9)} | ${resampleSpeedup.toFixed(1).padStart(6)}x |`);
    console.log('');

    // Validation
    console.log('CLAIM VALIDATION:');
    if (pitchSpeedup >= 10) {
        console.log(`✅ Pitch Detection: ${pitchSpeedup.toFixed(1)}x speedup (claimed ~27x)`);
    } else {
        console.log(`⚠️  Pitch Detection: ${pitchSpeedup.toFixed(1)}x speedup (claimed ~27x)`);
    }

    if (fftSpeedup >= 5) {
        console.log(`✅ FFT: ${fftSpeedup.toFixed(1)}x speedup`);
    } else {
        console.log(`⚠️  FFT: ${fftSpeedup.toFixed(1)}x speedup`);
    }

    if (resampleSpeedup >= 5) {
        console.log(`✅ Resampling: ${resampleSpeedup.toFixed(1)}x speedup`);
    } else {
        console.log(`⚠️  Resampling: ${resampleSpeedup.toFixed(1)}x speedup`);
    }

    console.log('');
}

main().catch(console.error);
