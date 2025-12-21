import { useEffect, useRef } from 'react'

export function HeavyBackground() {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const gl = canvas.getContext('webgl')
        if (!gl) return

        // Vertex Shader (Standard full-screen quad)
        const vsSource = `
            attribute vec4 aVertexPosition;
            void main() {
                gl_Position = aVertexPosition;
            }
        `;

        // Fragment Shader (The "Heavy" Logic)
        // Inspired by Igloo.inc: Dark, Noise, Chromatic Aberration, Fluid/Terrain
        const fsSource = `
            precision highp float;
            uniform vec2 uResolution;
            uniform float uTime;
            uniform float uIntensity;

            // Pseudo-random
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            // Noise
            float noise(vec2 st) {
                vec2 i = floor(st);
                vec2 f = fract(st);
                float a = random(i);
                float b = random(i + vec2(1.0, 0.0));
                float c = random(i + vec2(0.0, 1.0));
                float d = random(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }

            // FBM for terrain/cloud effect
            float fbm(vec2 st) {
                float value = 0.0;
                float amplitude = 0.5;
                for (int i = 0; i < 5; i++) {
                    value += amplitude * noise(st);
                    st *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                vec2 st = gl_FragCoord.xy / uResolution.xy;
                st.x *= uResolution.x / uResolution.y;

                // Heavy distortion
                vec2 uv = st;
                float t = uTime * 0.1;
                
                // Liquid distinct layers
                float n1 = fbm(uv * 3.0 + t);
                float n2 = fbm(uv * 6.0 - t * 0.5 + n1);

                // "Igloo" Color Palette: Dark, Deep Blue, White Accents
                vec3 color = vec3(0.02, 0.02, 0.05); // Base dark background
                
                // Electric Blue Flow
                float flow = smoothstep(0.4, 0.7, n2);
                vec3 electricBlue = vec3(0.1, 0.3, 0.9);
                color = mix(color, electricBlue, flow * 0.4);

                // White/Grey "Ice" ridges
                float ridge = smoothstep(0.7, 0.8, n2) - smoothstep(0.8, 0.9, n2);
                color = mix(color, vec3(0.9, 0.95, 1.0), ridge * 0.8);

                // Scanlines / Grid
                float scanline = sin(gl_FragCoord.y * 0.1 - uTime * 5.0) * 0.5 + 0.5;
                color *= 0.8 + 0.2 * scanline;

                // Grain
                float grain = random(uv * uTime) * 0.1;
                color += grain;

                // Vignette
                float dist = distance(gl_FragCoord.xy / uResolution.xy, vec2(0.5));
                color *= 1.0 - dist * 0.8;

                // Intensity mod based on audio/action (passed as uniform if needed)
                color *= 0.8 + uIntensity * 0.2;

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        // Shader setup boilerplate
        const shaderProgram = initShaderProgram(gl, vsSource, fsSource)
        const programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
            },
            uniformLocations: {
                resolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
                time: gl.getUniformLocation(shaderProgram, 'uTime'),
                intensity: gl.getUniformLocation(shaderProgram, 'uIntensity'),
            },
        }

        // Buffer
        const buffers = initBuffers(gl)

        // Render Loop
        let startTime = Date.now()
        let animationFrameId

        function render() {
            const currentTime = (Date.now() - startTime) * 0.001
            gl.viewport(0, 0, canvas.width, canvas.height)
            gl.clearColor(0.0, 0.0, 0.0, 1.0)
            gl.clear(gl.COLOR_BUFFER_BIT)

            gl.useProgram(programInfo.program)

            // Bind vertices
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position)
            gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0)
            gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition)

            // Set uniforms
            gl.uniform2f(programInfo.uniformLocations.resolution, canvas.width, canvas.height)
            gl.uniform1f(programInfo.uniformLocations.time, currentTime)
            gl.uniform1f(programInfo.uniformLocations.intensity, 0.5) // Placeholder for audio reactivity

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

            animationFrameId = requestAnimationFrame(render)
        }

        // Resize handler
        function resize() {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
        }
        window.addEventListener('resize', resize)
        resize()
        render()

        return () => {
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />
}

// Shader Helpers
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource)
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource)

    const shaderProgram = gl.createProgram()
    gl.attachShader(shaderProgram, vertexShader)
    gl.attachShader(shaderProgram, fragmentShader)
    gl.linkProgram(shaderProgram)

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram))
        return null
    }
    return shaderProgram
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
    }
    return shader
}

function initBuffers(gl) {
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    const positions = [1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, -1.0]
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)
    return { position: positionBuffer }
}
