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

// ============================================================================
// FILE SIZE LIMITS (Producer-grade protection)
// ============================================================================
const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_TXT_SIZE = 5 * 1024 * 1024;  // 5 MB

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Main Entry Point: Process any file
 * @param {File} file - PDF or Text file
 * @returns {Promise<Object>} - { segments: [{ text, pause }], meta: {} }
 */
export async function processDocument(file) {
    console.log(`🧠 [DOC] Processing ${file.name} (${file.type})...`);

    // ========== FILE SIZE VALIDATION ==========
    const isPDF = file.type === 'application/pdf';
    const maxSize = isPDF ? MAX_PDF_SIZE : MAX_TXT_SIZE;
    const fileTypeLabel = isPDF ? 'PDF' : 'Text';

    if (file.size > maxSize) {
        const error = new Error(
            `${fileTypeLabel} file too large: ${formatBytes(file.size)}. ` +
            `Maximum allowed: ${formatBytes(maxSize)}. ` +
            `Please use a smaller file or split into multiple parts.`
        );
        error.code = 'FILE_TOO_LARGE';
        error.details = {
            actual: file.size,
            max: maxSize,
            type: fileTypeLabel
        };
        throw error;
    }

    let rawText = '';

    if (isPDF) {
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
            totalSegments: segments.length,
            fileSize: file.size
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
 * NEURAL SEGMENTATION - Enhanced with Breath Groups
 * Uses Intl.Segmenter + Prosodic Analysis to create "breath groups"
 * 
 * Breath Group Theory (Lieberman 1967, Ladd 1996):
 * - Intonational Phrase (IP): Major prosodic boundary with pitch reset
 * - Intermediate Phrase (ip): Minor prosodic boundary
 * - Phonological Word: Minimal stress-bearing unit
 * 
 * We segment based on:
 * 1. Syntactic boundaries (punctuation, conjunctions)
 * 2. Length constraints (7±2 words optimal for working memory)
 * 3. Prosodic weight (stressed syllables estimate)
 */
function neuralSegmentation(text) {
    // 1. Initial Cleaning
    const cleanText = text
        .replace(/\r\n/g, '\n')
        .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
        .replace(/\n\s*\d+\s*\n/g, '\n')
        .replace(/[ \t]+/g, ' ');

    // 2. Breath Group Segmentation
    const breathGroups = segmentIntoBreathGroups(cleanText);

    console.log(`🧠 [DOC] Generated ${breathGroups.length} breath groups.`);
    return breathGroups;
}

/**
 * BREATH GROUP SEGMENTER
 * Research-grade prosodic phrase segmentation
 */
function segmentIntoBreathGroups(text) {
    const segments = [];

    // Prosodic boundary markers (by strength)
    const MAJOR_BOUNDARIES = /[.!?;]/;           // IP boundaries (intonational phrase)
    const MINOR_BOUNDARIES = /[,:—–\-]/;         // ip boundaries (intermediate phrase)
    const CLAUSE_CONJUNCTIONS = /\b(and|but|or|so|yet|for|nor|because|although|while|when|if|unless|since|after|before|until|whereas|though)\b/gi;

    // Optimal breath group parameters (based on Ladd 1996)
    const MIN_WORDS = 3;
    const MAX_WORDS = 12;
    const OPTIMAL_WORDS = 7;  // Miller's 7±2

    // First pass: Split on major boundaries (sentences)
    const sentences = text.split(/(?<=[.!?;])\s+/).filter(s => s.trim());

    for (const sentence of sentences) {
        const sentenceBreathGroups = splitIntoBreathGroups(
            sentence.trim(),
            { MIN_WORDS, MAX_WORDS, OPTIMAL_WORDS, MINOR_BOUNDARIES, CLAUSE_CONJUNCTIONS }
        );
        segments.push(...sentenceBreathGroups);
    }

    return segments;
}

/**
 * Split a sentence into optimal breath groups
 */
function splitIntoBreathGroups(sentence, params) {
    const { MIN_WORDS, MAX_WORDS, OPTIMAL_WORDS, MINOR_BOUNDARIES, CLAUSE_CONJUNCTIONS } = params;
    const breathGroups = [];

    // Tokenize into words
    const words = sentence.split(/\s+/).filter(w => w);

    if (words.length === 0) return [];

    // If short enough, return as single group
    if (words.length <= MAX_WORDS) {
        return [{
            text: sentence,
            pause_duration: estimatePauseDuration(sentence, 'sentence_end'),
            breath_group_type: 'IP',  // Intonational Phrase
            word_count: words.length,
            prosodic_weight: estimateProsodicWeight(sentence)
        }];
    }

    // Find potential break points
    const breakPoints = findBreakPoints(sentence, words, params);

    // Greedily segment based on break points
    let currentStart = 0;
    let currentText = '';
    let currentWordCount = 0;

    for (let i = 0; i < words.length; i++) {
        currentText += (currentText ? ' ' : '') + words[i];
        currentWordCount++;

        const isBreakPoint = breakPoints.includes(i);
        const isLastWord = i === words.length - 1;
        const isOverOptimal = currentWordCount >= OPTIMAL_WORDS;
        const isAtMax = currentWordCount >= MAX_WORDS;

        // Decide whether to break
        const shouldBreak = isLastWord || isAtMax || (isBreakPoint && isOverOptimal);

        if (shouldBreak && currentWordCount >= MIN_WORDS) {
            const groupType = isLastWord ? 'IP' : 'ip';  // IP at end, ip elsewhere

            breathGroups.push({
                text: currentText.trim(),
                pause_duration: estimatePauseDuration(currentText, groupType),
                breath_group_type: groupType,
                word_count: currentWordCount,
                prosodic_weight: estimateProsodicWeight(currentText)
            });

            currentText = '';
            currentWordCount = 0;
        } else if (shouldBreak && currentWordCount < MIN_WORDS && !isLastWord) {
            // Too short, continue to next break point
            continue;
        }
    }

    // Handle any remaining text
    if (currentText.trim()) {
        breathGroups.push({
            text: currentText.trim(),
            pause_duration: estimatePauseDuration(currentText, 'IP'),
            breath_group_type: 'IP',
            word_count: currentWordCount,
            prosodic_weight: estimateProsodicWeight(currentText)
        });
    }

    return breathGroups;
}

/**
 * Find natural break points in a sentence
 */
function findBreakPoints(sentence, words, params) {
    const breakPoints = [];

    // Reconstruct positions
    let position = 0;
    const wordPositions = words.map(w => {
        const start = sentence.indexOf(w, position);
        position = start + w.length;
        return { word: w, start, end: position };
    });

    for (let i = 0; i < words.length - 1; i++) {
        const word = words[i];
        const nextWord = words[i + 1];
        const betweenText = sentence.slice(wordPositions[i].end, wordPositions[i + 1].start);

        // Check for punctuation breaks
        if (params.MINOR_BOUNDARIES.test(betweenText)) {
            breakPoints.push(i);
            continue;
        }

        // Check for conjunction breaks (break BEFORE the conjunction)
        if (params.CLAUSE_CONJUNCTIONS.test(nextWord)) {
            breakPoints.push(i);
            continue;
        }

        // Check for relative clause markers
        if (/^(which|who|whom|whose|that|where)$/i.test(nextWord)) {
            breakPoints.push(i);
            continue;
        }

        // Check for prepositional phrase boundaries (heuristic)
        if (/^(in|on|at|by|for|with|from|to|into|onto|upon|within|without|through|during|before|after|between|among|under|over|above|below)$/i.test(nextWord) && i > 2) {
            breakPoints.push(i);
        }
    }

    return breakPoints;
}

/**
 * Estimate pause duration based on boundary type
 * Based on Wightman et al. (1992) pause duration studies
 */
function estimatePauseDuration(text, boundaryType) {
    // Base durations (in seconds)
    const BASE_DURATIONS = {
        IP: 0.6,           // Intonational phrase boundary
        ip: 0.3,           // Intermediate phrase boundary
        word: 0.1,         // Word boundary (rare)
        sentence_end: 0.8  // End of sentence
    };

    let duration = BASE_DURATIONS[boundaryType] || 0.4;

    // Adjust for ending punctuation
    if (/[!?]$/.test(text)) {
        duration *= 1.2;  // Longer pause after exclamation/question
    }

    // Adjust for ellipsis
    if (/\.{3}|…/.test(text)) {
        duration *= 1.5;  // Dramatic pause
    }

    // Adjust for text length (longer phrases = slightly longer pause)
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 10) {
        duration *= 1.1;
    }

    return parseFloat(duration.toFixed(2));
}

/**
 * Estimate prosodic weight (approximation of stressed syllables)
 * Higher weight = more emphasis needed in TTS
 */
function estimateProsodicWeight(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.replace(/[^a-z]/g, ''));

    // Function words (unstressed)
    const functionWords = new Set([
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
        'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
        'during', 'before', 'after', 'above', 'below', 'between', 'under',
        'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so',
        'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same',
        'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
        'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
        'few', 'more', 'most', 'other', 'some', 'such', 'no', 'any', 'that',
        'this', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our',
        'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'he', 'him',
        'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
        'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what',
        'which', 'who', 'whom', 'whose'
    ]);

    let contentWords = 0;
    let totalSyllables = 0;

    for (const word of words) {
        const cleanWord = word.replace(/[^a-z]/g, '');
        if (!cleanWord) continue;

        if (!functionWords.has(cleanWord)) {
            contentWords++;
            // Estimate syllables (vowel groups)
            const syllables = (cleanWord.match(/[aeiouy]+/g) || []).length || 1;
            totalSyllables += syllables;
        }
    }

    // Prosodic weight: ratio of content words + syllable density
    const contentRatio = words.length > 0 ? contentWords / words.length : 0;
    const syllableDensity = words.length > 0 ? totalSyllables / words.length : 0;

    return parseFloat((contentRatio * 0.6 + syllableDensity * 0.4).toFixed(2));
}

/**
 * Utility: Check if text is likely a header
 */
function isHeader(str) {
    return str.length < 50 && !/[.!?]$/.test(str) && /^[A-Z]/.test(str);
}

