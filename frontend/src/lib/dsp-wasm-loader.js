/**
 * DSP WASM Loader - Compatibility Layer
 * =======================================
 * This module re-exports from the pure JavaScript DSP implementation.
 * No WASM required - everything runs natively in the browser.
 * 
 * The Rust DSP has been fully ported to JavaScript in sanctuary-dsp.js
 * 
 * @module dsp-wasm-loader
 */

// Re-export everything from the pure JS implementation
export {
    FftProcessor,
    VoiceActivityDetector,
    PitchDetector,
    FormantAnalyzer,
    resample,
    createFftProcessor,
    createVoiceActivityDetector,
    createPitchDetector,
    createFormantAnalyzer,
    initDSP,
    isDSPAvailable,
} from './sanctuary-dsp.js';

// Also export the fallback classes for backwards compatibility
export { FftProcessor as FallbackFftProcessor } from './sanctuary-dsp.js';
export { VoiceActivityDetector as FallbackVoiceActivityDetector } from './sanctuary-dsp.js';

// Default export
import SanctuaryDSP from './sanctuary-dsp.js';
export default SanctuaryDSP;
