import React from 'react';

export function AudiobookShelf({ onPlay, currentAudio }) {
    const books = [
        {
            id: 'genghis',
            title: 'Genghis Khan',
            author: 'History',
            voice: 'Formal Male',
            image: 'https://upload.wikimedia.org/wikipedia/commons/3/35/YuanEmperorAlbumGenghisPortrait.jpg',
            file: '/audiobooks/genghis_khan_sample.wav',
            color: 'from-amber-700 to-orange-900',
            duration: '5 min'
        },
        {
            id: 'anime',
            title: 'Anime History',
            author: 'Culture',
            voice: 'Asian Female',
            image: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Anime_Girl_reading.png', // Placeholder or generic
            file: '/audiobooks/anime_sample.wav',
            color: 'from-pink-500 to-rose-900',
            duration: '4 min'
        },
        {
            id: 'russia',
            title: 'Russia',
            author: 'Geography',
            voice: 'Russian High Class',
            image: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/Moscow_Saint_Basil_Cathedral.jpg',
            file: '/audiobooks/russia_sample.wav',
            color: 'from-blue-600 to-slate-900',
            duration: '6 min'
        }
    ];

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
                {books.map((book) => {
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
