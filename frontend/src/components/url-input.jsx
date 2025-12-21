import React, { useState } from 'react';

export function UrlInput({ onFetch, isLoading }) {
    const [url, setUrl] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (url.trim()) {
            onFetch(url);
            setUrl('');
        }
    };

    return (
        <div className="w-full glass-card p-1 rounded-2xl border border-white/10 shadow-lg mb-8 animate-in fade-in slide-in-from-bottom-12 duration-1200">
            <form onSubmit={handleSubmit} className="relative flex items-center">
                <div className="absolute left-4 text-white/40 text-lg">
                    🌐
                </div>
                <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste a Wikipedia URL to narrate..."
                    className="w-full bg-transparent text-white placeholder-white/30 h-14 pl-12 pr-32 rounded-xl focus:outline-none focus:bg-white/5 transition-colors font-light text-lg"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    disabled={isLoading || !url.trim()}
                    className="absolute right-2 h-10 px-6 bg-white text-black font-bold rounded-lg hover:bg-[var(--accent-primary)] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                >
                    {isLoading ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <span>Read</span>
                            <span>→</span>
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
