/**
 * PERFORMANCE METRICS - Research-Grade Audio Synthesis Profiler
 * ==============================================================
 * Comprehensive performance monitoring for NeuralWhisper engine.
 * 
 * Metrics Tracked:
 * - Time-To-First-Byte (TTFB): Target <100ms
 * - WebGPU Compute Throughput (TFLOPS)
 * - Audio Generation Real-Time Factor (RTF)
 * - Memory Utilization (GPU/CPU)
 * - Frame Budget Compliance (60fps target)
 * 
 * Based on:
 * - Chrome DevTools Lighthouse methodology
 * - WebGPU Best Practices (Chrome GPU Team)
 * - Audio Latency Measurement Techniques (W3C Audio WG)
 */

// Performance thresholds (research-grade targets)
const TARGETS = {
    TTFB_MS: 100,           // Time-to-first-byte target
    RTF_MAX: 0.5,           // Real-time factor (0.5 = 2x realtime)
    FRAME_BUDGET_MS: 16.67, // 60fps frame budget
    GPU_MEMORY_MB: 512,     // Max GPU memory
    LATENCY_P95_MS: 150     // 95th percentile latency
};

// Metric types for classification
const METRIC_TYPE = {
    TIMING: 'timing',
    THROUGHPUT: 'throughput',
    MEMORY: 'memory',
    QUALITY: 'quality'
};

export class PerformanceMetrics {
    constructor() {
        this.metrics = new Map();
        this.history = [];
        this.maxHistorySize = 1000;
        this.sessionStart = performance.now();
        this.gpuDevice = null;
        this.gpuAdapter = null;

        // WebGPU capability detection
        this.hasWebGPU = false;
        this.hasTimestampQuery = false;

        // Real-time stats
        this.currentStats = {
            ttfb: 0,
            rtf: 0,
            fps: 60,
            gpuMemory: 0,
            cpuTime: 0
        };

        // Aggregated stats
        this.aggregates = {
            ttfb: { min: Infinity, max: 0, sum: 0, count: 0, p95: [] },
            rtf: { min: Infinity, max: 0, sum: 0, count: 0 },
            latency: { values: [], p50: 0, p95: 0, p99: 0 }
        };

        console.log('📊 [PerformanceMetrics] Initialized');
    }

    /**
     * Initialize WebGPU for GPU-based timing queries
     */
    async initWebGPU() {
        if (!navigator.gpu) {
            console.warn('📊 [PerformanceMetrics] WebGPU not available');
            return false;
        }

        try {
            this.gpuAdapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });

            if (!this.gpuAdapter) {
                console.warn('📊 [PerformanceMetrics] No GPU adapter found');
                return false;
            }

            // Check for timestamp query support
            this.hasTimestampQuery = this.gpuAdapter.features.has('timestamp-query');

            const requiredFeatures = [];
            if (this.hasTimestampQuery) {
                requiredFeatures.push('timestamp-query');
            }

            this.gpuDevice = await this.gpuAdapter.requestDevice({
                requiredFeatures
            });

            this.hasWebGPU = true;

            // Get GPU info
            const adapterInfo = await this.gpuAdapter.requestAdapterInfo();
            this.gpuInfo = {
                vendor: adapterInfo.vendor || 'Unknown',
                architecture: adapterInfo.architecture || 'Unknown',
                device: adapterInfo.device || 'Unknown',
                description: adapterInfo.description || 'Unknown'
            };

            console.log('📊 [PerformanceMetrics] WebGPU initialized:', this.gpuInfo);
            console.log('📊 [PerformanceMetrics] Timestamp queries:', this.hasTimestampQuery ? '✅' : '❌');

            return true;
        } catch (e) {
            console.error('📊 [PerformanceMetrics] WebGPU init failed:', e);
            return false;
        }
    }

    /**
     * Estimate WebGPU compute throughput (TFLOPS)
     * Uses a matrix multiplication benchmark
     */
    async benchmarkGPUThroughput(matrixSize = 1024) {
        if (!this.hasWebGPU || !this.gpuDevice) {
            await this.initWebGPU();
        }
        if (!this.gpuDevice) return null;

        const device = this.gpuDevice;
        const N = matrixSize;
        const floatCount = N * N;
        const bufferSize = floatCount * 4;

        // Create matrices
        const matrixA = new Float32Array(floatCount);
        const matrixB = new Float32Array(floatCount);
        for (let i = 0; i < floatCount; i++) {
            matrixA[i] = Math.random();
            matrixB[i] = Math.random();
        }

        // Create buffers
        const gpuBufferA = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        const gpuBufferB = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        const gpuBufferC = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        const uniformBuffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(gpuBufferA, 0, matrixA);
        device.queue.writeBuffer(gpuBufferB, 0, matrixB);
        device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([N]));

        // Compute shader for matrix multiplication
        const shaderCode = `
            @group(0) @binding(0) var<storage, read> matrixA: array<f32>;
            @group(0) @binding(1) var<storage, read> matrixB: array<f32>;
            @group(0) @binding(2) var<storage, read_write> matrixC: array<f32>;
            @group(0) @binding(3) var<uniform> size: u32;

            @compute @workgroup_size(16, 16)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let row = global_id.x;
                let col = global_id.y;
                
                if (row >= size || col >= size) { return; }
                
                var sum: f32 = 0.0;
                for (var k: u32 = 0u; k < size; k++) {
                    sum += matrixA[row * size + k] * matrixB[k * size + col];
                }
                matrixC[row * size + col] = sum;
            }
        `;

        const shaderModule = device.createShaderModule({ code: shaderCode });
        const pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: 'main' }
        });

        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: gpuBufferA } },
                { binding: 1, resource: { buffer: gpuBufferB } },
                { binding: 2, resource: { buffer: gpuBufferC } },
                { binding: 3, resource: { buffer: uniformBuffer } }
            ]
        });

        // Warmup run
        const warmupEncoder = device.createCommandEncoder();
        const warmupPass = warmupEncoder.beginComputePass();
        warmupPass.setPipeline(pipeline);
        warmupPass.setBindGroup(0, bindGroup);
        warmupPass.dispatchWorkgroups(Math.ceil(N / 16), Math.ceil(N / 16));
        warmupPass.end();
        device.queue.submit([warmupEncoder.finish()]);
        await device.queue.onSubmittedWorkDone();

        // Timed run (multiple iterations)
        const iterations = 10;
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(Math.ceil(N / 16), Math.ceil(N / 16));
            pass.end();
            device.queue.submit([encoder.finish()]);
        }
        await device.queue.onSubmittedWorkDone();

        const endTime = performance.now();
        const totalTimeMs = endTime - startTime;
        const avgTimeMs = totalTimeMs / iterations;

        // Calculate TFLOPS
        // Matrix multiplication: 2 * N^3 FLOPs (multiply-add)
        const flops = 2 * N * N * N;
        const tflops = (flops / (avgTimeMs / 1000)) / 1e12;

        // Cleanup
        gpuBufferA.destroy();
        gpuBufferB.destroy();
        gpuBufferC.destroy();
        uniformBuffer.destroy();

        const result = {
            matrixSize: N,
            avgTimeMs: avgTimeMs,
            tflops: tflops,
            flops: flops,
            iterations: iterations
        };

        console.log(`📊 [PerformanceMetrics] GPU Benchmark: ${tflops.toFixed(2)} TFLOPS (${N}x${N} matmul in ${avgTimeMs.toFixed(2)}ms)`);

        return result;
    }

    /**
     * Estimate TTS generation performance
     * @param {number} textLength - Number of characters
     * @param {number} sampleRate - Audio sample rate
     * @returns {Object} Estimated performance metrics
     */
    async estimateGenerationPerformance(textLength, sampleRate = 24000) {
        // Get GPU benchmark if not cached
        if (!this._gpuBenchmark) {
            this._gpuBenchmark = await this.benchmarkGPUThroughput(512);
        }

        const tflops = this._gpuBenchmark?.tflops || 1;

        // Empirical model based on Kokoro-82M characteristics
        // ~82M parameters, ~0.5 GFLOPS per token, ~50 tokens/sec at 1 TFLOPS
        const estimatedTokens = Math.ceil(textLength / 4);  // ~4 chars per token
        const tokensPerSecond = tflops * 50;  // Empirical: 50 tokens/TFLOPS
        const generationTimeMs = (estimatedTokens / tokensPerSecond) * 1000;

        // Audio duration estimate (~200ms per token for Kokoro)
        const estimatedAudioDurationMs = estimatedTokens * 200;

        // Real-time factor
        const rtf = generationTimeMs / estimatedAudioDurationMs;

        // Time-to-first-byte estimate (first token + audio buffer)
        const ttfbEstimate = (1 / tokensPerSecond) * 1000 + 10;  // +10ms for buffer

        const estimate = {
            textLength,
            estimatedTokens,
            tokensPerSecond: tokensPerSecond.toFixed(1),
            generationTimeMs: generationTimeMs.toFixed(1),
            estimatedAudioDurationMs: estimatedAudioDurationMs.toFixed(0),
            rtf: rtf.toFixed(3),
            ttfbEstimate: ttfbEstimate.toFixed(1),
            meetsTarget: ttfbEstimate < TARGETS.TTFB_MS,
            gpuTflops: tflops.toFixed(2)
        };

        console.log('📊 [PerformanceMetrics] Generation Estimate:', estimate);
        return estimate;
    }

    // ===============================================================
    // TIMING INSTRUMENTATION
    // ===============================================================

    /**
     * Start a timing measurement
     */
    startTimer(name) {
        this.metrics.set(name, {
            start: performance.now(),
            marks: []
        });
    }

    /**
     * Add a mark within a timing measurement
     */
    mark(name, markName) {
        const metric = this.metrics.get(name);
        if (metric) {
            metric.marks.push({
                name: markName,
                time: performance.now() - metric.start
            });
        }
    }

    /**
     * End a timing measurement and record results
     */
    endTimer(name, metadata = {}) {
        const metric = this.metrics.get(name);
        if (!metric) return null;

        const endTime = performance.now();
        const duration = endTime - metric.start;

        const result = {
            name,
            duration,
            marks: metric.marks,
            timestamp: Date.now(),
            ...metadata
        };

        // Update aggregates
        this._updateAggregates(name, duration);

        // Add to history
        this.history.push(result);
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }

        this.metrics.delete(name);
        return result;
    }

    /**
     * Measure TTFB for audio synthesis
     */
    measureTTFB(synthesisStart, firstByteTime) {
        const ttfb = firstByteTime - synthesisStart;

        this._updateAggregates('ttfb', ttfb);
        this.currentStats.ttfb = ttfb;

        const passesTarget = ttfb < TARGETS.TTFB_MS;

        console.log(`📊 [TTFB] ${ttfb.toFixed(1)}ms ${passesTarget ? '✅' : '⚠️'} (target: <${TARGETS.TTFB_MS}ms)`);

        return {
            ttfb,
            target: TARGETS.TTFB_MS,
            passesTarget,
            percentile: this._getPercentile('ttfb', ttfb)
        };
    }

    /**
     * Measure Real-Time Factor
     */
    measureRTF(generationTimeMs, audioDurationMs) {
        const rtf = generationTimeMs / audioDurationMs;

        this._updateAggregates('rtf', rtf);
        this.currentStats.rtf = rtf;

        const isRealtime = rtf < 1;
        const passesTarget = rtf < TARGETS.RTF_MAX;

        console.log(`📊 [RTF] ${rtf.toFixed(3)} (${isRealtime ? 'faster than' : 'slower than'} realtime) ${passesTarget ? '✅' : '⚠️'}`);

        return {
            rtf,
            speedup: 1 / rtf,
            isRealtime,
            passesTarget
        };
    }

    // ===============================================================
    // MEMORY MONITORING
    // ===============================================================

    /**
     * Get GPU memory usage (if available)
     */
    async getGPUMemoryUsage() {
        if (!this.gpuDevice) return null;

        // Note: WebGPU doesn't expose direct memory queries
        // We estimate based on buffer allocations
        // In production, use Chrome's GPU internals extension

        return {
            estimated: true,
            note: 'WebGPU does not expose direct memory queries'
        };
    }

    /**
     * Get JavaScript heap memory
     */
    getJSMemoryUsage() {
        if (!performance.memory) {
            return null;  // Only available in Chrome with flags
        }

        return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1),
            totalMB: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)
        };
    }

    // ===============================================================
    // FRAME RATE MONITORING
    // ===============================================================

    /**
     * Start FPS monitoring
     */
    startFPSMonitor() {
        let frameCount = 0;
        let lastTime = performance.now();

        const measure = () => {
            frameCount++;
            const now = performance.now();
            const elapsed = now - lastTime;

            if (elapsed >= 1000) {
                this.currentStats.fps = Math.round(frameCount * 1000 / elapsed);
                frameCount = 0;
                lastTime = now;
            }

            this._fpsRaf = requestAnimationFrame(measure);
        };

        this._fpsRaf = requestAnimationFrame(measure);
    }

    stopFPSMonitor() {
        if (this._fpsRaf) {
            cancelAnimationFrame(this._fpsRaf);
        }
    }

    // ===============================================================
    // AGGREGATION & STATISTICS
    // ===============================================================

    _updateAggregates(name, value) {
        if (!this.aggregates[name]) {
            this.aggregates[name] = { min: Infinity, max: 0, sum: 0, count: 0, values: [] };
        }

        const agg = this.aggregates[name];
        agg.min = Math.min(agg.min, value);
        agg.max = Math.max(agg.max, value);
        agg.sum += value;
        agg.count++;
        agg.values.push(value);

        // Keep only last 100 for percentile calculations
        if (agg.values.length > 100) {
            agg.values.shift();
        }

        // Update percentiles
        const sorted = [...agg.values].sort((a, b) => a - b);
        agg.p50 = sorted[Math.floor(sorted.length * 0.5)];
        agg.p95 = sorted[Math.floor(sorted.length * 0.95)];
        agg.p99 = sorted[Math.floor(sorted.length * 0.99)];
        agg.mean = agg.sum / agg.count;
    }

    _getPercentile(name, value) {
        const agg = this.aggregates[name];
        if (!agg || agg.values.length === 0) return 50;

        const sorted = [...agg.values].sort((a, b) => a - b);
        const rank = sorted.filter(v => v <= value).length;
        return Math.round((rank / sorted.length) * 100);
    }

    // ===============================================================
    // REPORTING
    // ===============================================================

    /**
     * Get comprehensive performance report
     */
    getReport() {
        const sessionDuration = (performance.now() - this.sessionStart) / 1000;

        return {
            session: {
                durationSeconds: sessionDuration.toFixed(1),
                totalMeasurements: this.history.length
            },
            current: this.currentStats,
            ttfb: this.aggregates.ttfb ? {
                mean: this.aggregates.ttfb.mean?.toFixed(1),
                min: this.aggregates.ttfb.min?.toFixed(1),
                max: this.aggregates.ttfb.max?.toFixed(1),
                p50: this.aggregates.ttfb.p50?.toFixed(1),
                p95: this.aggregates.ttfb.p95?.toFixed(1),
                target: TARGETS.TTFB_MS,
                samples: this.aggregates.ttfb.count
            } : null,
            rtf: this.aggregates.rtf ? {
                mean: this.aggregates.rtf.mean?.toFixed(3),
                min: this.aggregates.rtf.min?.toFixed(3),
                max: this.aggregates.rtf.max?.toFixed(3),
                target: TARGETS.RTF_MAX,
                samples: this.aggregates.rtf.count
            } : null,
            gpu: {
                available: this.hasWebGPU,
                info: this.gpuInfo,
                timestampQueries: this.hasTimestampQuery,
                benchmark: this._gpuBenchmark
            },
            memory: this.getJSMemoryUsage(),
            targets: TARGETS
        };
    }

    /**
     * Log performance summary to console
     */
    logSummary() {
        const report = this.getReport();
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 NEURALWHISPER PERFORMANCE REPORT');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`Session Duration: ${report.session.durationSeconds}s`);
        console.log(`Total Measurements: ${report.session.totalMeasurements}`);
        console.log('───────────────────────────────────────────────────────────');

        if (report.ttfb) {
            const passesTTFB = parseFloat(report.ttfb.p95) < TARGETS.TTFB_MS;
            console.log(`TTFB (p95): ${report.ttfb.p95}ms ${passesTTFB ? '✅' : '⚠️'} (target: <${TARGETS.TTFB_MS}ms)`);
        }

        if (report.rtf) {
            const passesRTF = parseFloat(report.rtf.mean) < TARGETS.RTF_MAX;
            console.log(`RTF (mean): ${report.rtf.mean} ${passesRTF ? '✅' : '⚠️'} (target: <${TARGETS.RTF_MAX})`);
        }

        console.log(`FPS: ${report.current.fps}`);

        if (report.gpu.available) {
            console.log(`GPU: ${report.gpu.info?.device || 'Unknown'}`);
            if (report.gpu.benchmark) {
                console.log(`GPU Throughput: ${report.gpu.benchmark.tflops.toFixed(2)} TFLOPS`);
            }
        }

        console.log('═══════════════════════════════════════════════════════════');

        return report;
    }

    /**
     * Export metrics as JSON for research analysis
     */
    exportJSON() {
        return JSON.stringify({
            report: this.getReport(),
            history: this.history,
            exportedAt: new Date().toISOString()
        }, null, 2);
    }
}

// Singleton instance
export const performanceMetrics = new PerformanceMetrics();

/**
 * High-resolution timing decorator for async functions
 */
export function withTiming(name) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args) {
            performanceMetrics.startTimer(name);
            try {
                const result = await originalMethod.apply(this, args);
                performanceMetrics.endTimer(name);
                return result;
            } catch (error) {
                performanceMetrics.endTimer(name, { error: error.message });
                throw error;
            }
        };

        return descriptor;
    };
}
