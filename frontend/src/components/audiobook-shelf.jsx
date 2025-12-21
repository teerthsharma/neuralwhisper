import React from 'react';

export function AudiobookShelf({ onPlay, currentAudio, books }) {
    const defaultBooks = [];

    const displayBooks = books || defaultBooks;

    if (displayBooks.length === 0) {
        return (
            <div className="w-full glass-card p-8 rounded-3xl border border-white/10 mb-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 text-center">
                <div className="inline-block p-4 rounded-full bg-white/5 mb-4">
                    <span className="text-4xl">📚</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Audiobook Shelf</h2>
                <p className="text-white/60 mb-6 max-w-md mx-auto">
                    Our premium AI-narrated audiobooks are currently being curated. Check back soon for immersive listening experiences.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-sm text-white/80 border border-white/5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    Coming Soon
                </div>
            </div>
        );
    }

    return (
        <div className="w-full glass-card p-6 rounded-3xl border border-white/10 mb-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Premium Audiobooks</h2>
                    <p className="text-sm text-white/40">AI-Narration Samples • Neural Cloned Voices</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/60">
                    F5-TTS
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {displayBooks.map((book) => {
                    const isPlaying = currentAudio === book.file;

                    return (
                        <div
                            key={book.id}
                            className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl"
                            onClick={() => onPlay(book)}
                        >
                            {/* Background Image & Overlay */}
                            <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                                style={{ backgroundImage: `url(${book.image})` }}
                            />
                            <div className={`absolute inset-0 bg-gradient-to-t ${book.color} opacity-80 group-hover:opacity-60 transition-opacity duration-300`} />

                            {/* Content */}
                            <div className="absolute inset-0 p-6 flex flex-col justify-end">
                                <span className="text-[10px] font-bold tracking-widest uppercase text-white/60 mb-2">
                                    {book.author}
                                </span>
                                <h3 className="text-2xl font-bold text-white mb-1 leading-tight">
                                    {book.title}
                                </h3>
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xs text-white/80 bg-white/10 px-2 py-0.5 rounded backdrop-blur-sm">
                                        {book.voice}
                                    </span>
                                    <span className="text-xs text-white/60">
                                        {book.duration}
                                    </span>
                                </div>

                                {/* Play Button */}
                                <div className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-300 ${isPlaying
                                    ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                                    : 'bg-white/10 text-white hover:bg-white hover:text-black backdrop-blur-md'
                                    }`}>
                                    <span>{isPlaying ? 'Playing...' : 'Listen Now'}</span>
                                    {!isPlaying && <span>▶</span>}
                                    {isPlaying && (
                                        <div className="flex gap-0.5 h-3 items-end">
                                            <span className="w-1 bg-black animate-[bounce_1s_infinite] h-2"></span>
                                            <span className="w-1 bg-black animate-[bounce_1.2s_infinite] h-3"></span>
                                            <span className="w-1 bg-black animate-[bounce_0.8s_infinite] h-2"></span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
