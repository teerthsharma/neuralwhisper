/**
 * NEURAL DOCUMENT PROCESSOR
 * ==========================================
 * "Understanding the flow of words."
 * 
 * unified processor for PDFs and Text files.
 * Uses layout analysis and NLP segmentation to prepare text for the Audio Engine.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Use unpkg CDN which reliably mirrors all npm package versions
const PDF_WORKER_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL

/**
 * Main Entry Point: Process any file
 * @param {File} file - PDF or Text file
 * @returns {Promise<Object>} - { segments: [{ text, pause }], meta: {} }
 */
export async function processDocument(file) {
    console.log(`🧠 [DOC] Processing ${file.name} (${file.type})...`);

    let rawText = '';

    if (file.type === 'application/pdf') {
        rawText = await extractTextFromPDF(file);
    } else {
        rawText = await extractTextFromTXT(file);
    }

    console.log(`🧠 [DOC] Extracted ${rawText.length} chars. Segmenting...`);

    // Apply Neural Segmentation
    const segments = neuralSegmentation(rawText);

    console.log(`🧠 [DOC] Generated ${segments.length} segments.`);
    return {
        segments,
        meta: {
            filename: file.name,
            totalChars: rawText.length,
            totalSegments: segments.length
        }
    };
}

/**
 * Simple Text File Reader
 */
async function extractTextFromTXT(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

/**
 * Intelligent PDF Extractor with Layout Analysis
 */
async function extractTextFromPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        let fullText = '';

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            // Get text with coordinates
            const content = await page.getTextContent({ includeMarkedContent: true });

            // Layout Analysis: Sort items by vertical position (top to bottom), 
            // then horizontal (left to right)
            // PDF coordinates: (0,0) is bottom-left usually, but we check transform matrices
            // transform[5] is Y (usually increases upwards?), transform[4] is X

            const items = content.items.map(item => ({
                str: item.str,
                // In PDF, Y usually starts from bottom, so we invert it for sorting
                // We use a "row tolerance" to group items on roughly the same line
                y: item.transform[5],
                x: item.transform[4],
                height: item.height,
                hasEOL: item.hasEOL
            }));

            // Sort: High Y (top) first, Low X (left) first
            // Note: PDF Y coordinates are often inverted (0 is bottom). 
            // Let's assume standard PDF coordinate system where higher Y is higher up on page.
            items.sort((a, b) => {
                const yDiff = b.y - a.y;
                if (Math.abs(yDiff) > 5) { // 5px tolerance for "same line"
                    return yDiff; // Sort by Y (top to bottom)
                }
                return a.x - b.x; // Sort by X (left to right)
            });

            // Reconstruct text with smart spacing
            let pageText = '';
            let lastY = null;
            let lastX = null;

            items.forEach(item => {
                if (lastY !== null) {
                    // Detect new line
                    if (Math.abs(item.y - lastY) > 8) {
                        pageText += '\n';
                    } else if (item.x - lastX > 10) {
                        // Detect column gap or wide space
                        pageText += ' ';
                    }
                }
                pageText += item.str;
                lastY = item.y;
                lastX = item.x + item.width; // Approx end of char
            });

            fullText += pageText + '\n\n';
        }

        return fullText;

    } catch (e) {
        console.error('PDF Parsing failed', e);
        throw new Error('Failed to parse PDF');
    }
}

/**
 * NEURAL SEGMENTATION
 * Uses Intl.Segmenter + Heuristics to create perfect TTS chunks
 */
function neuralSegmentation(text) {
    // 1. Initial Cleaning
    const cleanText = text
        .replace(/\r\n/g, '\n')
        // Fix split words (hyphen at end of line)
        .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
        // Remove page numbers (simple heuristic: single digits on new lines)
        .replace(/\n\s*\d+\s*\n/g, '\n')
        // Collapse multiple spaces
        .replace(/[ \t]+/g, ' ');

    // 2. Intelligent Sentence Breaking
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = [];

    // Pattern to detect "headers" or "titles" that shouldn't merge with next sentence
    const isHeader = (str) => {
        return str.length < 50 && !/[.!?]$/.test(str) && /^[A-Z]/.test(str);
    };

    for (const seg of segmenter.segment(cleanText)) {
        const s = seg.segment.trim();
        if (!s) continue;

        // Heuristic: Is this a "real" sentence?
        // If it's just a bullet point or fragment, we might treat it differently

        let pauseDuration = 0.5; // Standard sentence pause

        if (s.length < 5) {
            pauseDuration = 0.2; // Short fragment
        } else if (isHeader(s)) {
            pauseDuration = 1.0; // Header pause
        } else if (s.includes('\n')) {
            // Newline inside segment often means paragraph break in PDF
            pauseDuration = 0.8;
        }

        segments.push({
            text: s,
            pause_duration: pauseDuration
        });
    }

    return segments;
}
