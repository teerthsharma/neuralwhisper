/**
 * SPECTRAL STATISTICS - R-Inspired Statistical Audio Analysis
 * ============================================================
 * Statistical analysis module inspired by R's audio/tuneR packages.
 * Implements research-grade spectral and temporal statistics.
 * 
 * Features:
 * - Spectral Moments (centroid, spread, skewness, kurtosis)
 * - Temporal Statistics (envelope, modulation spectrum)
 * - Information Theory Metrics (spectral entropy, flatness)
 * - Regression-based prosody modeling
 */

/**
 * Compute spectral statistical moments
 * Based on R's seewave package
 */
export function spectralMoments(spectrum, frequencies) {
    const n = spectrum.length;

    // Normalize spectrum to probability distribution
    const total = spectrum.reduce((a, b) => a + b, 0);
    if (total === 0) return { centroid: 0, spread: 0, skewness: 0, kurtosis: 0 };

    const probabilities = spectrum.map(s => s / total);

    // First moment: Spectral Centroid (mean frequency)
    let centroid = 0;
    for (let i = 0; i < n; i++) {
        centroid += frequencies[i] * probabilities[i];
    }

    // Second moment: Spectral Spread (standard deviation)
    let variance = 0;
    for (let i = 0; i < n; i++) {
        variance += probabilities[i] * Math.pow(frequencies[i] - centroid, 2);
    }
    const spread = Math.sqrt(variance);

    // Third moment: Spectral Skewness
    let m3 = 0;
    for (let i = 0; i < n; i++) {
        m3 += probabilities[i] * Math.pow(frequencies[i] - centroid, 3);
    }
    const skewness = spread > 0 ? m3 / Math.pow(spread, 3) : 0;

    // Fourth moment: Spectral Kurtosis
    let m4 = 0;
    for (let i = 0; i < n; i++) {
        m4 += probabilities[i] * Math.pow(frequencies[i] - centroid, 4);
    }
    const kurtosis = spread > 0 ? m4 / Math.pow(spread, 4) - 3 : 0; // Excess kurtosis

    return { centroid, spread, skewness, kurtosis };
}

/**
 * Spectral Entropy - measure of spectral uniformity
 * High entropy = noise-like, Low entropy = tonal
 */
export function spectralEntropy(spectrum) {
    const total = spectrum.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const probabilities = spectrum.map(s => s / total).filter(p => p > 0);

    // Shannon entropy
    const entropy = -probabilities.reduce((sum, p) => sum + p * Math.log2(p), 0);

    // Normalize by maximum possible entropy
    const maxEntropy = Math.log2(spectrum.length);

    return entropy / maxEntropy;
}

/**
 * Spectral Flatness (Wiener entropy)
 * Geometric mean / Arithmetic mean of power spectrum
 * 0 = tonal, 1 = white noise
 */
export function spectralFlatness(spectrum) {
    const n = spectrum.length;
    if (n === 0) return 0;

    // Filter out zeros for geometric mean
    const nonZero = spectrum.filter(s => s > 0);
    if (nonZero.length === 0) return 0;

    // Log-domain computation for numerical stability
    const logSum = nonZero.reduce((sum, s) => sum + Math.log(s), 0);
    const geometricMean = Math.exp(logSum / nonZero.length);

    const arithmeticMean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;

    return geometricMean / arithmeticMean;
}

/**
 * Spectral Rolloff - frequency below which X% of energy is concentrated
 * Default: 85% (common for speech/music discrimination)
 */
export function spectralRolloff(spectrum, frequencies, percentile = 0.85) {
    const total = spectrum.reduce((a, b) => a + b, 0);
    const threshold = total * percentile;

    let cumulative = 0;
    for (let i = 0; i < spectrum.length; i++) {
        cumulative += spectrum[i];
        if (cumulative >= threshold) {
            return frequencies[i];
        }
    }

    return frequencies[frequencies.length - 1];
}

/**
 * Spectral Flux - measure of spectral change between frames
 */
export function spectralFlux(currentSpectrum, previousSpectrum) {
    if (!previousSpectrum || previousSpectrum.length !== currentSpectrum.length) {
        return 0;
    }

    let flux = 0;
    for (let i = 0; i < currentSpectrum.length; i++) {
        const diff = currentSpectrum[i] - previousSpectrum[i];
        // Half-wave rectification (only positive changes)
        flux += Math.max(0, diff) * Math.max(0, diff);
    }

    return Math.sqrt(flux);
}

/**
 * Modulation Spectrum Analysis
 * Analyzes temporal modulations in each frequency band
 */
export function modulationSpectrum(spectrumSequence, sampleRate, hopSize) {
    const numBands = spectrumSequence[0]?.length || 0;
    const numFrames = spectrumSequence.length;

    if (numBands === 0 || numFrames < 4) {
        return { modulations: [], dominantModFreq: 0 };
    }

    const frameRate = sampleRate / hopSize;
    const modulations = [];

    // For each frequency band, compute modulation spectrum
    for (let band = 0; band < numBands; band++) {
        // Extract temporal envelope for this band
        const envelope = spectrumSequence.map(s => s[band]);

        // Simple DFT of envelope to get modulation spectrum
        const modSpectrum = [];
        const modFreqResolution = frameRate / numFrames;

        for (let k = 0; k < Math.min(numFrames / 2, 50); k++) {
            let re = 0, im = 0;
            for (let n = 0; n < numFrames; n++) {
                const angle = -2 * Math.PI * k * n / numFrames;
                re += envelope[n] * Math.cos(angle);
                im += envelope[n] * Math.sin(angle);
            }
            modSpectrum.push({
                frequency: k * modFreqResolution,
                magnitude: Math.sqrt(re * re + im * im) / numFrames
            });
        }

        modulations.push(modSpectrum);
    }

    // Find dominant modulation frequency (averaged across bands)
    const avgModSpectrum = [];
    for (let k = 0; k < modulations[0].length; k++) {
        const avgMag = modulations.reduce((sum, band) => sum + band[k].magnitude, 0) / numBands;
        avgModSpectrum.push({ frequency: modulations[0][k].frequency, magnitude: avgMag });
    }

    // Find peak (excluding DC)
    let maxMag = 0;
    let dominantModFreq = 0;
    for (let k = 1; k < avgModSpectrum.length; k++) {
        if (avgModSpectrum[k].magnitude > maxMag) {
            maxMag = avgModSpectrum[k].magnitude;
            dominantModFreq = avgModSpectrum[k].frequency;
        }
    }

    return { modulations, dominantModFreq, avgModSpectrum };
}

/**
 * Linear Regression for F0 contour modeling
 * Returns slope, intercept, and R² for prosody analysis
 */
export function linearRegression(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

    // Simple linear regression: y = mx + b
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
        sumY2 += values[i] * values[i];
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (Math.abs(denominator) < 1e-10) {
        return { slope: 0, intercept: sumY / n, r2: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Coefficient of determination (R²)
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        const predicted = slope * i + intercept;
        ssTot += Math.pow(values[i] - meanY, 2);
        ssRes += Math.pow(values[i] - predicted, 2);
    }

    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, r2 };
}

/**
 * Polynomial Regression for complex F0 contours
 * Fits polynomial of specified degree
 */
export function polynomialRegression(values, degree = 3) {
    const n = values.length;
    if (n < degree + 1) {
        return { coefficients: [], r2: 0 };
    }

    // Construct Vandermonde matrix
    const X = [];
    for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j <= degree; j++) {
            row.push(Math.pow(i / n, j));  // Normalize x to [0, 1]
        }
        X.push(row);
    }

    // Solve using normal equations: (X'X)β = X'y
    // Simplified implementation using Gauss-Jordan elimination
    const XtX = matrixMultiply(transpose(X), X);
    const Xty = matrixVectorMultiply(transpose(X), values);

    const coefficients = solveLinearSystem(XtX, Xty);

    // Compute R²
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        let predicted = 0;
        for (let j = 0; j <= degree; j++) {
            predicted += coefficients[j] * Math.pow(i / n, j);
        }
        ssTot += Math.pow(values[i] - meanY, 2);
        ssRes += Math.pow(values[i] - predicted, 2);
    }

    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { coefficients, r2 };
}

// Matrix utilities
function transpose(matrix) {
    return matrix[0].map((_, j) => matrix.map(row => row[j]));
}

function matrixMultiply(A, B) {
    const result = [];
    for (let i = 0; i < A.length; i++) {
        result[i] = [];
        for (let j = 0; j < B[0].length; j++) {
            let sum = 0;
            for (let k = 0; k < A[0].length; k++) {
                sum += A[i][k] * B[k][j];
            }
            result[i][j] = sum;
        }
    }
    return result;
}

function matrixVectorMultiply(A, v) {
    return A.map(row => row.reduce((sum, a, i) => sum + a * v[i], 0));
}

function solveLinearSystem(A, b) {
    // Gauss-Jordan elimination with partial pivoting
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
        // Find pivot
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
                maxRow = row;
            }
        }
        [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

        if (Math.abs(augmented[col][col]) < 1e-10) continue;

        // Eliminate
        for (let row = 0; row < n; row++) {
            if (row !== col) {
                const factor = augmented[row][col] / augmented[col][col];
                for (let j = col; j <= n; j++) {
                    augmented[row][j] -= factor * augmented[col][j];
                }
            }
        }

        // Normalize
        const pivot = augmented[col][col];
        for (let j = col; j <= n; j++) {
            augmented[col][j] /= pivot;
        }
    }

    return augmented.map(row => row[n]);
}

/**
 * Complete statistical analysis of audio
 */
export function analyzeSpectralStatistics(spectrumSequence, frequencies, sampleRate, hopSize) {
    const results = {
        frames: [],
        summary: {}
    };

    let prevSpectrum = null;
    const centroids = [];
    const spreads = [];
    const entropies = [];
    const flatnesses = [];
    const fluxes = [];

    for (const spectrum of spectrumSequence) {
        const moments = spectralMoments(spectrum, frequencies);
        const entropy = spectralEntropy(spectrum);
        const flatness = spectralFlatness(spectrum);
        const rolloff = spectralRolloff(spectrum, frequencies);
        const flux = spectralFlux(spectrum, prevSpectrum);

        results.frames.push({
            centroid: moments.centroid,
            spread: moments.spread,
            skewness: moments.skewness,
            kurtosis: moments.kurtosis,
            entropy: entropy,
            flatness: flatness,
            rolloff: rolloff,
            flux: flux
        });

        centroids.push(moments.centroid);
        spreads.push(moments.spread);
        entropies.push(entropy);
        flatnesses.push(flatness);
        fluxes.push(flux);

        prevSpectrum = spectrum;
    }

    // Summary statistics
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = arr => {
        const m = mean(arr);
        return Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length);
    };

    results.summary = {
        centroid: { mean: mean(centroids), std: std(centroids) },
        spread: { mean: mean(spreads), std: std(spreads) },
        entropy: { mean: mean(entropies), std: std(entropies) },
        flatness: { mean: mean(flatnesses), std: std(flatnesses) },
        flux: { mean: mean(fluxes), std: std(fluxes) }
    };

    // Modulation analysis
    results.modulation = modulationSpectrum(spectrumSequence, sampleRate, hopSize);

    console.log('📊 [SpectralStats] Analysis complete:', results.summary);

    return results;
}
