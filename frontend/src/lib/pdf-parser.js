/**
 * Client-side PDF Parser using pdf.js
 * Extracts text from PDF files entirely in the browser
 */

import * as pdfjsLib from 'pdfjs-dist'

// Use unpkg CDN which reliably mirrors all npm package versions
// This works in both development and production (Vercel)
const PDF_WORKER_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL

/**
 * Extract text from a PDF file
 * @param {File} file - The PDF file to extract text from
 * @returns {Promise<string>} - The extracted text
 */
export async function extractTextFromPDF(file) {
    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()

        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

        let fullText = ''

        // Extract text from each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum)
            const textContent = await page.getTextContent()

            // Join text items
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ')

            fullText += pageText + '\n\n'
        }

        // Clean up text
        return cleanText(fullText)
    } catch (error) {
        console.error('PDF extraction error:', error)
        throw new Error('Failed to extract text from PDF')
    }
}

/**
 * Clean and normalize extracted text
 * @param {string} text - Raw extracted text
 * @returns {string} - Cleaned text
 */
function cleanText(text) {
    return text
        // Remove multiple spaces
        .replace(/\s+/g, ' ')
        // Remove multiple newlines
        .replace(/\n{3,}/g, '\n\n')
        // Fix common OCR issues
        .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
        // Trim
        .trim()
}
