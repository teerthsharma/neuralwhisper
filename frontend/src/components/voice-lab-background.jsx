import { useEffect, useRef } from 'react'

export function VoiceLabBackground() {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const gl = canvas.getContext('webgl')
        if (!gl) return

        // Vertex Shader (Simple Pass-through)
        const vsSource = `
            attribute vec4 aVertexPosition;
            void main() {
                gl_Position = aVertexPosition;
            }
        `;

        // Fragment Shader (Neural Liquid Network)
        const fsSource = `
            precision highp float;
            uniform float uTime;
            uniform vec2 uResolution;
            uniform vec2 uMouse;

            // Simplex noise (3D)
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {
                const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

                // First corner
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 = v - i + dot(i, C.xxx) ;

                // Other corners
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );

                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
                vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

                // Permutations
                i = mod289(i);
                vec4 p = permute( permute( permute(
                            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

                // Gradients: 7x7 points over a square, mapped onto an octahedron.
                // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
                float n_ = 0.142857142857; // 1.0/7.0
                vec3  ns = n_ * D.wyz - D.xzx;

                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);

                vec4 b0 = vec4( x.xy, y.xy );
                vec4 b1 = vec4( x.zw, y.zw );

                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));

                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);

                //Normalise gradients
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;

                // Mix final noise value
                vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                            dot(p2,x2), dot(p3,x3) ) );
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / uResolution.xy;
                vec2 p = uv * 2.0 - 1.0; // -1 to 1
                p.x *= uResolution.x / uResolution.y;

                float time = uTime * 0.2;
                
                // Mouse interaction
                vec2 mouse = uMouse / uResolution.xy * 2.0 - 1.0;
                float mouseDist = length(p - mouse);
                float mouseInfluence = smoothstep(0.5, 0.0, mouseDist);

                // Layers of noise (Octaves)
                float n = 0.0;
                float amp = 1.0;
                float freq = 1.5;
                for(int i = 0; i < 3; i++) {
                    n += snoise(vec3(p * freq + time * 0.1, time * 0.5)) * amp;
                    amp *= 0.5;
                    freq *= 2.0;
                }

                // Warp domain with noise
                vec2 warpedP = p + vec2(n * 0.5, n * 0.3);
                
                // Hexagon/Grid pattern overlay (SDF)
                vec2 grid = fract(warpedP * 5.0) - 0.5;
                float dist = length(grid);
                float glow = 0.02 / (abs(dist - 0.2) + 0.01);

                // Color palette: Deep Space Cyan & Purple
                vec3 color1 = vec3(0.05, 0.05, 0.1); // Dark base
                vec3 color2 = vec3(0.1, 0.4, 0.5);   // Cyan mid
                vec3 color3 = vec3(0.6, 0.2, 0.8);   // Purple highlight

                // Mix colors based on noise and warp
                vec3 finalColor = mix(color1, color2, n * 0.5 + 0.5);
                finalColor = mix(finalColor, color3, smoothstep(0.3, 0.8, n + mouseInfluence * 0.5));

                // Add grid glow
                finalColor += vec3(0.2, 0.8, 1.0) * glow * 0.5;

                // Vignette
                float vignette = 1.0 - length(uv - 0.5) * 1.5;
                finalColor *= max(0.0, vignette);

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
        if (!shaderProgram) return;

        const programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
            },
            uniformLocations: {
                uResolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
                uTime: gl.getUniformLocation(shaderProgram, 'uTime'),
                uMouse: gl.getUniformLocation(shaderProgram, 'uMouse'),
            },
        };

        const buffers = initBuffers(gl);

        // Render Loop
        let animationFrameId;
        const startTime = Date.now();
        const mouse = { x: 0, y: 0 };

        const handleMouseMove = (e) => {
            mouse.x = e.clientX;
            mouse.y = canvas.height - e.clientY; // Invert Y for GL
        };
        window.addEventListener('mousemove', handleMouseMove);

        const render = () => {
            resizeCanvasToDisplaySize(gl.canvas);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clearDepth(1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            drawScene(gl, programInfo, buffers, (Date.now() - startTime) * 0.001, mouse);
            animationFrameId = requestAnimationFrame(render);
        };
        render();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0" />
    )
}

// === WebGL Helpers ===
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function initBuffers(gl) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    return { position: positionBuffer };
}

function drawScene(gl, programInfo, buffers, time, mouse) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.useProgram(programInfo.program);

    gl.uniform2f(programInfo.uniformLocations.uResolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(programInfo.uniformLocations.uTime, time);
    gl.uniform2f(programInfo.uniformLocations.uMouse, mouse.x, mouse.y);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function resizeCanvasToDisplaySize(canvas) {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
}
