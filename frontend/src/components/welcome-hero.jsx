import React from 'react';

export function WelcomeHero() {
    return (
        <div className="relative w-full overflow-hidden rounded-3xl glass-card border border-white/10 shadow-2xl p-8 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Background Glows */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6 hover:bg-white/10 transition-colors cursor-default">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    <span className="text-xs font-medium text-white/80 tracking-wide uppercase">System Online</span>
                </div>

                <h1 className="text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/40 mb-4 tracking-tight">
                    ASMR Reader
                </h1>

                <p className="text-lg text-white/60 max-w-2xl leading-relaxed mb-8 font-light">
                    Experience documents like never before with <span className="text-white font-medium">Neural Voice Cloning</span> and <span className="text-white font-medium">Liquid Audio Visualization</span>.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl">
                    <HeroFeature icon="🧠" title="Neural TTS" desc="Kokoro-82M v1.0" />
                    <HeroFeature icon="⚡" title="GPU Accelerated" desc="WebGPU / ONNX" />
                    <HeroFeature icon="🌊" title="Liquid Audio" desc="Reactive Sleep Mode" />
                    <HeroFeature icon="🎙️" title="Voice Cloning" desc="F5-TTS Custom Models" />
                </div>
            </div>
        </div>
    );
}

function HeroFeature({ icon, title, desc }) {
    return (
        <div className="flex flex-col items-center p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300 group hover:-translate-y-1">
            <span className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">{icon}</span>
            <span className="text-sm font-bold text-white mb-1">{title}</span>
            <span className="text-[10px] text-white/40 uppercase tracking-wider">{desc}</span>
        </div>
    );
}
