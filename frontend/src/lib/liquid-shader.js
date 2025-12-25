/**
 * LIQUID SHADER - THE LIVING SANCTUARY
 * =====================================
 * FFT-synced WebGL shader for organic, audio-reactive visualization.
 * 
 * Features:
 * - Real-time FFT band analysis (bass, mid, high)
 * - Simplex noise-based fluid simulation
 * - Glass refraction and metallic effects
 * - Performance-optimized for 60fps
 */

// Vertex Shader
const VERTEX_SHADER = `
    attribute vec2 position;
    varying vec2 vUv;
    
    void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
    }
`;

// Fragment Shader - Liquid Glass with FFT Response
const FRAGMENT_SHADER = `
    precision highp float;
    
    varying vec2 vUv;
    
    uniform float uTime;
    uniform float uBass;      // 0-300Hz energy
    uniform float uMid;       // 300Hz-4kHz energy  
    uniform float uHigh;      // 4kHz-20kHz energy
    uniform float uBrightness;
    uniform vec2 uResolution;
    uniform vec3 uColorA;     // Primary gradient color
    uniform vec3 uColorB;     // Secondary gradient color
    uniform vec3 uColorC;     // Accent color
    
    // Simplex 3D Noise (optimized)
    vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    
    float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        
        i = mod(i, 289.0);
        vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            
        float n_ = 1.0/7.0;
        vec3 ns = n_ * D.wyz - D.xzx;
        
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
    
    // Fractal Brownian Motion for organic flow
    float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for (int i = 0; i < 4; i++) {
            value += amplitude * snoise(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
        }
        
        return value;
    }
    
    void main() {
        vec2 uv = vUv;
        vec2 p = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
        
        // Time modulation with audio reactivity
        float timeBase = uTime * 0.15;
        float bassTime = timeBase + uBass * 0.5;
        float midTime = timeBase * 1.2 + uMid * 0.3;
        
        // Multi-layer liquid distortion
        vec3 noiseCoord1 = vec3(p * 1.5, bassTime);
        vec3 noiseCoord2 = vec3(p * 2.5 + 10.0, midTime);
        vec3 noiseCoord3 = vec3(p * 3.5 + 20.0, timeBase * 0.5);
        
        float noise1 = fbm(noiseCoord1) * (1.0 + uBass * 2.0);
        float noise2 = fbm(noiseCoord2) * (1.0 + uMid * 1.5);
        float noise3 = snoise(noiseCoord3) * (1.0 + uHigh * 1.0);
        
        // Combine noises for liquid flow
        float flowField = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
        
        // Warp UV coordinates for refraction effect
        vec2 warpedUv = uv + vec2(
            sin(noise1 * 3.14159 + uTime) * 0.05,
            cos(noise2 * 3.14159 + uTime * 0.7) * 0.05
        ) * (1.0 + uBass);
        
        // Gradient based on warped position
        float gradientPos = warpedUv.y + flowField * 0.3;
        
        // Color mixing with audio reactivity
        vec3 color = mix(uColorA, uColorB, smoothstep(0.2, 0.8, gradientPos));
        color = mix(color, uColorC, smoothstep(0.6, 1.0, noise1 + uMid) * 0.5);
        
        // Glass refraction highlights
        float highlight = pow(max(0.0, noise2 * 0.5 + 0.5), 3.0) * (0.3 + uHigh * 0.7);
        
        // Rim lighting based on position
        float rim = pow(1.0 - abs(p.x), 2.0) * pow(1.0 - abs(p.y), 2.0);
        
        // Bass pulse effect (pulsing glow)
        float bassPulse = uBass * 0.3 * sin(uTime * 3.14159 * 2.0) + 0.5;
        
        // Combine all effects
        color += highlight * vec3(1.0, 0.95, 0.9);
        color += rim * uColorC * 0.2 * (1.0 + uMid);
        color *= 0.8 + bassPulse * 0.2;
        
        // Vignette
        float vignette = 1.0 - length(p) * 0.3;
        color *= vignette;
        
        // Apply overall brightness
        color *= uBrightness;
        
        // Gamma correction
        color = pow(color, vec3(1.0 / 2.2));
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

export class LiquidShader {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.startTime = Date.now();
        this.animationId = null;
        this.isRunning = false;

        // FFT data
        this.bass = 0;
        this.mid = 0;
        this.high = 0;

        // Color themes
        this.themes = {
            ocean: {
                colorA: [0.05, 0.1, 0.2],
                colorB: [0.1, 0.3, 0.5],
                colorC: [0.3, 0.6, 0.8]
            },
            aurora: {
                colorA: [0.1, 0.05, 0.2],
                colorB: [0.2, 0.4, 0.3],
                colorC: [0.5, 0.2, 0.6]
            },
            ember: {
                colorA: [0.15, 0.05, 0.02],
                colorB: [0.3, 0.1, 0.05],
                colorC: [0.6, 0.2, 0.1]
            },
            midnight: {
                colorA: [0.02, 0.02, 0.08],
                colorB: [0.05, 0.05, 0.15],
                colorC: [0.1, 0.15, 0.3]
            },
            zen: {
                colorA: [0.08, 0.08, 0.1],
                colorB: [0.12, 0.12, 0.18],
                colorC: [0.2, 0.25, 0.35]
            }
        };

        this.currentTheme = 'zen';
        this.brightness = 1.0;
    }

    init() {
        const gl = this.canvas.getContext('webgl', {
            alpha: false,
            antialias: true,
            powerPreference: 'high-performance'
        });

        if (!gl) {
            console.error('[LiquidShader] WebGL not supported');
            return false;
        }

        this.gl = gl;

        // Create shader program
        const vertexShader = this._compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

        if (!vertexShader || !fragmentShader) {
            return false;
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('[LiquidShader] Program link error:', gl.getProgramInfoLog(this.program));
            return false;
        }

        gl.useProgram(this.program);

        // Create fullscreen quad
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(this.program, 'position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        // Get uniform locations
        this.uniforms = {
            uTime: gl.getUniformLocation(this.program, 'uTime'),
            uBass: gl.getUniformLocation(this.program, 'uBass'),
            uMid: gl.getUniformLocation(this.program, 'uMid'),
            uHigh: gl.getUniformLocation(this.program, 'uHigh'),
            uBrightness: gl.getUniformLocation(this.program, 'uBrightness'),
            uResolution: gl.getUniformLocation(this.program, 'uResolution'),
            uColorA: gl.getUniformLocation(this.program, 'uColorA'),
            uColorB: gl.getUniformLocation(this.program, 'uColorB'),
            uColorC: gl.getUniformLocation(this.program, 'uColorC')
        };

        // Set initial theme
        this.setTheme(this.currentTheme);

        console.log('[LiquidShader] ✨ Initialized successfully');
        return true;
    }

    _compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('[LiquidShader] Shader compile error:', this.gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    setTheme(themeName) {
        if (!this.themes[themeName]) {
            console.warn(`[LiquidShader] Theme '${themeName}' not found`);
            return;
        }

        this.currentTheme = themeName;
        const theme = this.themes[themeName];

        if (this.gl && this.program) {
            this.gl.useProgram(this.program);
            this.gl.uniform3fv(this.uniforms.uColorA, theme.colorA);
            this.gl.uniform3fv(this.uniforms.uColorB, theme.colorB);
            this.gl.uniform3fv(this.uniforms.uColorC, theme.colorC);
        }

        console.log(`[LiquidShader] Theme set: ${themeName}`);
    }

    setBrightness(value) {
        this.brightness = Math.max(0, Math.min(2, value));
    }

    /**
     * Update FFT data from AnalyserNode
     * @param {AnalyserNode} analyser - Web Audio API AnalyserNode
     */
    updateFromAnalyser(analyser) {
        if (!analyser) return;

        const fftSize = analyser.frequencyBinCount;
        const dataArray = new Float32Array(fftSize);
        analyser.getFloatFrequencyData(dataArray);

        // Calculate band energies
        const sampleRate = analyser.context.sampleRate;
        const binWidth = sampleRate / (fftSize * 2);

        let bassEnergy = 0, bassCount = 0;
        let midEnergy = 0, midCount = 0;
        let highEnergy = 0, highCount = 0;

        for (let i = 0; i < fftSize; i++) {
            const freq = i * binWidth;
            const magnitude = Math.pow(10, dataArray[i] / 20);  // dB to linear

            if (freq < 300) {
                bassEnergy += magnitude;
                bassCount++;
            } else if (freq < 4000) {
                midEnergy += magnitude;
                midCount++;
            } else {
                highEnergy += magnitude;
                highCount++;
            }
        }

        // Normalize and smooth
        const smoothing = 0.8;
        this.bass = this.bass * smoothing + (bassCount > 0 ? bassEnergy / bassCount : 0) * (1 - smoothing);
        this.mid = this.mid * smoothing + (midCount > 0 ? midEnergy / midCount : 0) * (1 - smoothing);
        this.high = this.high * smoothing + (highCount > 0 ? highEnergy / highCount : 0) * (1 - smoothing);

        // Clamp values
        this.bass = Math.min(1, this.bass * 5);
        this.mid = Math.min(1, this.mid * 8);
        this.high = Math.min(1, this.high * 10);
    }

    /**
     * Manually set FFT values (for testing or external data)
     */
    setFFTValues(bass, mid, high) {
        this.bass = bass;
        this.mid = mid;
        this.high = high;
    }

    render() {
        if (!this.gl || !this.program) return;

        const gl = this.gl;

        // Handle resize
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            gl.viewport(0, 0, width, height);
        }

        gl.useProgram(this.program);

        // Update uniforms
        const time = (Date.now() - this.startTime) / 1000;
        gl.uniform1f(this.uniforms.uTime, time);
        gl.uniform1f(this.uniforms.uBass, this.bass);
        gl.uniform1f(this.uniforms.uMid, this.mid);
        gl.uniform1f(this.uniforms.uHigh, this.high);
        gl.uniform1f(this.uniforms.uBrightness, this.brightness);
        gl.uniform2f(this.uniforms.uResolution, width, height);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        const animate = () => {
            if (!this.isRunning) return;
            this.render();
            this.animationId = requestAnimationFrame(animate);
        };

        animate();
        console.log('[LiquidShader] ▶️ Animation started');
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('[LiquidShader] ⏹️ Animation stopped');
    }

    destroy() {
        this.stop();
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
        }
        this.gl = null;
        this.program = null;
    }
}

/**
 * Helper to connect LiquidShader to an audio analyser
 * @param {LiquidShader} shader - The shader instance
 * @param {AnalyserNode} analyser - Web Audio API AnalyserNode
 */
export function connectShaderToAudio(shader, analyser) {
    const update = () => {
        if (!shader.isRunning) return;
        shader.updateFromAnalyser(analyser);
        requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}
