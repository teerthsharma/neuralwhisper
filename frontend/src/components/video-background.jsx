import React, { useEffect, useState, useRef } from 'react'
import { themeManager } from '../lib/theme-manager'

export function VideoBackground() {
    // Default to the CSS gradient if nothing loaded
    const [bg, setBg] = useState(themeManager.theme.background)
    const [opacity, setOpacity] = useState(themeManager.theme.colors.backdrop_opacity)
    const videoRef = useRef(null)

    useEffect(() => {
        // Initial state
        setBg(themeManager.theme.background)
        setOpacity(themeManager.theme.colors.backdrop_opacity)

        // Listen for theme changes (uploaded videos, color tweaks)
        const handleThemeChange = (e) => {
            const newTheme = e.detail
            setBg(newTheme.background)
            setOpacity(newTheme.colors.backdrop_opacity || 0.7)
        }

        window.addEventListener('zen-theme-change', handleThemeChange)
        return () => window.removeEventListener('zen-theme-change', handleThemeChange)
    }, [])

    useEffect(() => {
        // Ensure video auto-plays when source changes
        if (bg.type === 'video' && videoRef.current) {
            videoRef.current.load()
            videoRef.current.play().catch(e => console.log('Autoplay prevented', e))
        }
    }, [bg])

    const containerStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        overflow: 'hidden',
        background: bg.type === 'css' ? bg.value : '#000',
        transition: 'background 0.5s ease'
    }

    const overlayStyle = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: `rgba(15, 23, 42, ${opacity})`, // Uses 'Surface' tone but semi-transparent
        backdropFilter: 'blur(8px)', // Glassmorphism
        transition: 'background-color 0.5s ease'
    }

    return (
        <div style={containerStyle} className="zen-background">
            {bg.type === 'image' && (
                <img
                    src={bg.value}
                    alt="Atmosphere"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            )}

            {bg.type === 'video' && (
                <video
                    ref={videoRef}
                    src={bg.value}
                    loop
                    muted
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            )}

            {/* Glass Overlay for Readability */}
            <div style={overlayStyle} />
        </div>
    )
}
