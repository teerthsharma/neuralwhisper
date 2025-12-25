/**
 * WebGPU Audio Processor
 * =======================
 * GPU-accelerated audio processing using WebGPU compute shaders.
 * Provides high-performance FFT, VAD, and audio feature extraction.
 * 
 * Falls back to Web Audio API + JavaScript if WebGPU unavailable.
 * 
 * @module webgpu-audio-processor
 */

// WebGPU state
let gpuDevice = null;
let gpuAdapter = null;
let isWebGPUAvailable = false;
let initPromise = null;

// Compute shader for FFT and audio processing
const FFT_SHADER = `
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

struct Params {
  size: u32,
  sampleRate: f32,
}

// Compute energy for Voice Activity Detection
@compute @workgroup_size(256)
fn computeEnergy(@builtin(global_invocation_id) id: vec3<u32>) {
  let frameIdx = id.x;
  let frameSize = 512u;
  let hopSize = 256u;
  let start = frameIdx * hopSize;
  
  if (start + frameSize > params.size) { return; }
  
  var energy: f32 = 0.0;
  var zcr: f32 = 0.0;
  
  for (var i = 0u; i < frameSize; i++) {
    let idx = start + i;
    let sample = input[idx];
    energy += sample * sample;
    
    if (i > 0u) {
      let prev = input[idx - 1u];
      if ((prev >= 0.0) != (sample >= 0.0)) {
        zcr += 1.0;
      }
    }
  }
  
  let energyDb = 10.0 * log(energy / f32(frameSize) + 1e-10) / log(10.0);
  let zcrNorm = zcr / f32(frameSize);
  
  // Pack results: energyDb, zcrNorm
  output[frameIdx * 2u] = energyDb;
  output[frameIdx * 2u + 1u] = zcrNorm;
}

// DFT for spectral analysis (small N for real-time)
@compute @workgroup_size(64)
fn computeSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let k = id.x;
  let N = params.size;
  
  if (k >= N / 2u + 1u) { return; }
  
  var real: f32 = 0.0;
  var imag: f32 = 0.0;
  let pi2 = 6.283185307179586;
  
  for (var n = 0u; n < N; n++) {
    let angle = -pi2 * f32(k) * f32(n) / f32(N);
    // Hann window
    let window = 0.5 * (1.0 - cos(pi2 * f32(n) / f32(N - 1u)));
    let sample = input[n] * window;
    real += sample * cos(angle);
    imag += sample * sin(angle);
  }
  
  // Power spectrum
  output[k] = (real * real + imag * imag) / f32(N);
}

// Audio features for voice analysis
@compute @workgroup_size(1)
fn computeFeatures(@builtin(global_invocation_id) id: vec3<u32>) {
  let N = params.size;
  
  // RMS Energy
  var rms: f32 = 0.0;
  for (var i = 0u; i < N; i++) {
    rms += input[i] * input[i];
  }
  rms = sqrt(rms / f32(N));
  
  // Peak amplitude
  var peak: f32 = 0.0;
  for (var i = 0u; i < N; i++) {
    peak = max(peak, abs(input[i]));
  }
  
  // Crest factor
  let crest = select(0.0, peak / rms, rms > 1e-10);
  
  output[0] = rms;
  output[1] = peak;
  output[2] = crest;
}
`;

/**
 * Initialize WebGPU
 * @returns {Promise<boolean>} True if WebGPU is available
 */
export async function initWebGPU() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            if (!navigator.gpu) {
                console.log('🎮 [WebGPU] Not supported in this browser');
                return false;
            }

            gpuAdapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });

            if (!gpuAdapter) {
                console.log('🎮 [WebGPU] No GPU adapter found');
                return false;
            }

            gpuDevice = await gpuAdapter.requestDevice({
                requiredLimits: {
                    maxStorageBufferBindingSize: 128 * 1024 * 1024, // 128MB
                    maxBufferSize: 256 * 1024 * 1024, // 256MB
                }
            });

            isWebGPUAvailable = true;
            console.log('🎮 [WebGPU] Initialized successfully');
            console.log('   Adapter:', gpuAdapter.name || 'Unknown');

            return true;
        } catch (error) {
            console.warn('🎮 [WebGPU] Initialization failed:', error);
            return false;
        }
    })();

    return initPromise;
}

/**
 * Check if WebGPU is available
 */
export function isGPUAvailable() {
    return isWebGPUAvailable && gpuDevice !== null;
}

/**
 * GPU-accelerated Voice Activity Detection
 */
export class GPUVoiceActivityDetector {
    constructor() {
        this.pipeline = null;
        this.bindGroupLayout = null;
    }

    async init() {
        if (!isWebGPUAvailable) {
            throw new Error('WebGPU not available');
        }

        const shaderModule = gpuDevice.createShaderModule({ code: FFT_SHADER });

        this.bindGroupLayout = gpuDevice.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            ]
        });

        this.pipeline = gpuDevice.createComputePipeline({
            layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'computeEnergy' }
        });

        console.log('🎮 [WebGPU] VAD pipeline created');
    }

    async detect(audioData, sampleRate = 44100) {
        const frameSize = 512;
        const hopSize = 256;
        const numFrames = Math.floor((audioData.length - frameSize) / hopSize) + 1;

        // Create buffers
        const inputBuffer = gpuDevice.createBuffer({
            size: audioData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const outputBuffer = gpuDevice.createBuffer({
            size: numFrames * 2 * 4, // 2 floats per frame
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const paramsBuffer = gpuDevice.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const readBuffer = gpuDevice.createBuffer({
            size: numFrames * 2 * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Upload data
        gpuDevice.queue.writeBuffer(inputBuffer, 0, audioData);
        gpuDevice.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([audioData.length]));
        gpuDevice.queue.writeBuffer(paramsBuffer, 4, new Float32Array([sampleRate]));

        // Create bind group
        const bindGroup = gpuDevice.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: outputBuffer } },
                { binding: 2, resource: { buffer: paramsBuffer } },
            ]
        });

        // Dispatch compute
        const commandEncoder = gpuDevice.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(numFrames / 256));
        passEncoder.end();

        commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, numFrames * 2 * 4);
        gpuDevice.queue.submit([commandEncoder.finish()]);

        // Read results
        await readBuffer.mapAsync(GPUMapMode.READ);
        const results = new Float32Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();

        // Process results into VAD decisions
        const vad = new Uint8Array(numFrames);
        let hangover = 0;

        for (let i = 0; i < numFrames; i++) {
            const energyDb = results[i * 2];
            const zcr = results[i * 2 + 1];

            const isSpeech = energyDb > -40 && zcr < 0.1;
            if (isSpeech) hangover = 5;
            vad[i] = hangover > 0 ? 1 : 0;
            if (hangover > 0) hangover--;
        }

        // Cleanup
        inputBuffer.destroy();
        outputBuffer.destroy();
        paramsBuffer.destroy();
        readBuffer.destroy();

        return vad;
    }
}

/**
 * GPU-accelerated Spectral Analyzer
 */
export class GPUSpectralAnalyzer {
    constructor() {
        this.pipeline = null;
        this.bindGroupLayout = null;
    }

    async init() {
        if (!isWebGPUAvailable) {
            throw new Error('WebGPU not available');
        }

        const shaderModule = gpuDevice.createShaderModule({ code: FFT_SHADER });

        this.bindGroupLayout = gpuDevice.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            ]
        });

        this.pipeline = gpuDevice.createComputePipeline({
            layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'computeSpectrum' }
        });

        console.log('🎮 [WebGPU] Spectral analyzer pipeline created');
    }

    async analyze(audioData, sampleRate = 44100) {
        const fftSize = Math.min(audioData.length, 2048);
        const numBins = Math.floor(fftSize / 2) + 1;

        // Create buffers
        const inputBuffer = gpuDevice.createBuffer({
            size: fftSize * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const outputBuffer = gpuDevice.createBuffer({
            size: numBins * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const paramsBuffer = gpuDevice.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const readBuffer = gpuDevice.createBuffer({
            size: numBins * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Upload data (use only first fftSize samples)
        const inputData = audioData.slice(0, fftSize);
        gpuDevice.queue.writeBuffer(inputBuffer, 0, inputData);
        gpuDevice.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([fftSize]));
        gpuDevice.queue.writeBuffer(paramsBuffer, 4, new Float32Array([sampleRate]));

        // Create bind group
        const bindGroup = gpuDevice.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: outputBuffer } },
                { binding: 2, resource: { buffer: paramsBuffer } },
            ]
        });

        // Dispatch compute
        const commandEncoder = gpuDevice.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(numBins / 64));
        passEncoder.end();

        commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, numBins * 4);
        gpuDevice.queue.submit([commandEncoder.finish()]);

        // Read results
        await readBuffer.mapAsync(GPUMapMode.READ);
        const spectrum = new Float32Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();

        // Cleanup
        inputBuffer.destroy();
        outputBuffer.destroy();
        paramsBuffer.destroy();
        readBuffer.destroy();

        return { spectrum, sampleRate, fftSize };
    }
}

/**
 * GPU-accelerated Audio Feature Extractor
 */
export class GPUFeatureExtractor {
    constructor() {
        this.pipeline = null;
        this.bindGroupLayout = null;
    }

    async init() {
        if (!isWebGPUAvailable) {
            throw new Error('WebGPU not available');
        }

        const shaderModule = gpuDevice.createShaderModule({ code: FFT_SHADER });

        this.bindGroupLayout = gpuDevice.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            ]
        });

        this.pipeline = gpuDevice.createComputePipeline({
            layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'computeFeatures' }
        });

        console.log('🎮 [WebGPU] Feature extractor pipeline created');
    }

    async extract(audioData, sampleRate = 44100) {
        // Create buffers
        const inputBuffer = gpuDevice.createBuffer({
            size: audioData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const outputBuffer = gpuDevice.createBuffer({
            size: 12, // 3 floats: rms, peak, crest
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const paramsBuffer = gpuDevice.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const readBuffer = gpuDevice.createBuffer({
            size: 12,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Upload data
        gpuDevice.queue.writeBuffer(inputBuffer, 0, audioData);
        gpuDevice.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([audioData.length]));
        gpuDevice.queue.writeBuffer(paramsBuffer, 4, new Float32Array([sampleRate]));

        // Create bind group
        const bindGroup = gpuDevice.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: outputBuffer } },
                { binding: 2, resource: { buffer: paramsBuffer } },
            ]
        });

        // Dispatch compute
        const commandEncoder = gpuDevice.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(1);
        passEncoder.end();

        commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, 12);
        gpuDevice.queue.submit([commandEncoder.finish()]);

        // Read results
        await readBuffer.mapAsync(GPUMapMode.READ);
        const results = new Float32Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();

        // Cleanup
        inputBuffer.destroy();
        outputBuffer.destroy();
        paramsBuffer.destroy();
        readBuffer.destroy();

        return {
            rms: results[0],
            peak: results[1],
            crestFactor: results[2],
            dynamicRange: 20 * Math.log10(results[1] / (results[0] + 1e-10)),
        };
    }
}

/**
 * Unified Audio Processor - Uses WebGPU if available, falls back to JS
 */
export class AudioProcessor {
    constructor() {
        this.gpuVAD = null;
        this.gpuSpectral = null;
        this.gpuFeatures = null;
        this.useGPU = false;
    }

    async init() {
        const gpuAvailable = await initWebGPU();

        if (gpuAvailable) {
            this.gpuVAD = new GPUVoiceActivityDetector();
            this.gpuSpectral = new GPUSpectralAnalyzer();
            this.gpuFeatures = new GPUFeatureExtractor();

            await Promise.all([
                this.gpuVAD.init(),
                this.gpuSpectral.init(),
                this.gpuFeatures.init(),
            ]);

            this.useGPU = true;
            console.log('🎮 [AudioProcessor] GPU acceleration enabled');
        } else {
            console.log('🎮 [AudioProcessor] Using CPU fallback');
        }

        return this;
    }

    /**
     * Detect voice activity in audio
     */
    async detectVoiceActivity(audioData, sampleRate = 44100) {
        if (this.useGPU) {
            return this.gpuVAD.detect(audioData, sampleRate);
        }

        // CPU fallback
        return this._cpuVAD(audioData, sampleRate);
    }

    /**
     * Analyze audio spectrum
     */
    async analyzeSpectrum(audioData, sampleRate = 44100) {
        if (this.useGPU) {
            return this.gpuSpectral.analyze(audioData, sampleRate);
        }

        // CPU fallback
        return this._cpuSpectrum(audioData, sampleRate);
    }

    /**
     * Extract audio features
     */
    async extractFeatures(audioData, sampleRate = 44100) {
        if (this.useGPU) {
            return this.gpuFeatures.extract(audioData, sampleRate);
        }

        // CPU fallback
        return this._cpuFeatures(audioData, sampleRate);
    }

    // ----- CPU Fallbacks -----

    _cpuVAD(audioData, sampleRate) {
        const frameSize = 512;
        const hopSize = 256;
        const numFrames = Math.floor((audioData.length - frameSize) / hopSize) + 1;
        const vad = new Uint8Array(numFrames);
        let hangover = 0;

        for (let i = 0; i < numFrames; i++) {
            const start = i * hopSize;
            const end = Math.min(start + frameSize, audioData.length);

            let energy = 0;
            let zcr = 0;

            for (let j = start; j < end; j++) {
                energy += audioData[j] * audioData[j];
                if (j > start && (audioData[j - 1] >= 0) !== (audioData[j] >= 0)) zcr++;
            }

            const energyDb = 10 * Math.log10(energy / (end - start) + 1e-10);
            const zcrNorm = zcr / (end - start);

            const isSpeech = energyDb > -40 && zcrNorm < 0.1;
            if (isSpeech) hangover = 5;
            vad[i] = hangover > 0 ? 1 : 0;
            if (hangover > 0) hangover--;
        }

        return vad;
    }

    _cpuSpectrum(audioData, sampleRate) {
        const fftSize = Math.min(audioData.length, 2048);
        const numBins = Math.floor(fftSize / 2) + 1;
        const spectrum = new Float32Array(numBins);

        for (let k = 0; k < numBins; k++) {
            let real = 0, imag = 0;
            for (let n = 0; n < fftSize; n++) {
                const window = 0.5 * (1 - Math.cos(2 * Math.PI * n / (fftSize - 1)));
                const angle = -2 * Math.PI * k * n / fftSize;
                real += audioData[n] * window * Math.cos(angle);
                imag += audioData[n] * window * Math.sin(angle);
            }
            spectrum[k] = (real * real + imag * imag) / fftSize;
        }

        return { spectrum, sampleRate, fftSize };
    }

    _cpuFeatures(audioData, sampleRate) {
        let rms = 0, peak = 0;

        for (let i = 0; i < audioData.length; i++) {
            rms += audioData[i] * audioData[i];
            peak = Math.max(peak, Math.abs(audioData[i]));
        }

        rms = Math.sqrt(rms / audioData.length);

        return {
            rms,
            peak,
            crestFactor: rms > 1e-10 ? peak / rms : 0,
            dynamicRange: 20 * Math.log10(peak / (rms + 1e-10)),
        };
    }
}

export default {
    initWebGPU,
    isGPUAvailable,
    GPUVoiceActivityDetector,
    GPUSpectralAnalyzer,
    GPUFeatureExtractor,
    AudioProcessor,
};
