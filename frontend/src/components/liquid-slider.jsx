import React, { useRef, useEffect, useState } from 'react';

export function LiquidSlider({ value, min, max, step, onChange, label, unit }) {
    const containerRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [localValue, setLocalValue] = useState(value);

    // Sync with external value when not dragging
    useEffect(() => {
        if (!dragging) {
            setLocalValue(value);
        }
    }, [value, dragging]);

    const calculateValue = (clientX) => {
        if (!containerRef.current) return min;

        const rect = containerRef.current.getBoundingClientRect();
        let percentage = (clientX - rect.left) / rect.width;
        percentage = Math.max(0, Math.min(1, percentage));

        const rawValue = min + percentage * (max - min);
        // Step alignment
        const steppedValue = Math.round(rawValue / step) * step;
        const finalValue = Math.min(Math.max(steppedValue, min), max);

        return finalValue;
    };

    const handlePointerDown = (e) => {
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);

        const newValue = calculateValue(e.clientX);
        setLocalValue(newValue);
        onChange(newValue);
    };

    const handlePointerMove = (e) => {
        if (!dragging) return;

        const newValue = calculateValue(e.clientX);
        setLocalValue(newValue);
        onChange(newValue);
    };

    const handlePointerUp = (e) => {
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const percentage = ((localValue - min) / (max - min)) * 100;

    return (
        <div className="w-full mb-6">
            <div className="flex justify-between text-white/60 mb-2 font-medium text-sm">
                <span>{label}</span>
                <span className="text-white">{typeof localValue === 'number' ? localValue.toFixed(2) : localValue}{unit}</span>
            </div>

            <div
                ref={containerRef}
                className="slider-container w-full"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ cursor: 'pointer', touchAction: 'none' }}
            >
                {/* Progress Fill */}
                <div
                    className="slider-progress"
                    style={{ width: `${percentage}%` }}
                />

                {/* Glass Thumb */}
                <div
                    className={`slider-thumb-glass ${dragging ? 'active' : ''}`}
                    style={{ left: `${percentage}%` }}
                >
                    <div className="slider-thumb-glass-filter" />
                    <div className="slider-thumb-glass-overlay" />
                    <div className="slider-thumb-glass-specular" />
                </div>
            </div>
        </div>
    );
}
