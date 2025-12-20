/**
 * Wikipedia Scraper for ASMR Reader
 * Fetches and cleans Wikipedia article content for TTS
 */

/**
 * Extract article title from Wikipedia URL
 * Supports: /wiki/Title, /wiki/Title#section, mobile URLs
 * @param {string} url - Wikipedia URL
 * @returns {string|null} - Article title or null if invalid
 */
export function extractArticleTitle(url) {
    try {
        const urlObj = new URL(url)

        // Check if it's a Wikipedia domain
        if (!urlObj.hostname.includes('wikipedia.org')) {
            return null
        }

        // Extract title from /wiki/Title path
        const match = urlObj.pathname.match(/\/wiki\/(.+)/)
        if (!match) return null

        // Decode and clean the title
        let title = decodeURIComponent(match[1])

        // Remove section anchors
        title = title.split('#')[0]

        return title || null
    } catch (e) {
        return null
    }
}

/**
 * Clean Wikipedia text for TTS
 * @param {string} text - Raw text from Wikipedia
 * @returns {string} - Cleaned text suitable for TTS
 */
export function cleanTextForTTS(text) {
    if (!text) return ''

    let cleaned = text

    // Remove reference numbers [1], [2], [citation needed], etc.
    cleaned = cleaned.replace(/\[\d+\]/g, '')
    cleaned = cleaned.replace(/\[citation needed\]/gi, '')
    cleaned = cleaned.replace(/\[clarification needed\]/gi, '')
    cleaned = cleaned.replace(/\[note \d+\]/gi, '')

    // Remove edit links
    cleaned = cleaned.replace(/\[edit\]/gi, '')

    // Remove pronunciation guides (IPA)
    cleaned = cleaned.replace(/\([^)]*\bIPA\b[^)]*\)/gi, '')
    cleaned = cleaned.replace(/\/[^/]+\//g, '') // IPA between slashes

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ')
    cleaned = cleaned.replace(/\n\s*\n/g, '\n\n')

    // Remove leading/trailing whitespace
    cleaned = cleaned.trim()

    return cleaned
}

/**
 * Fetch Wikipedia article summary (shorter, for previews)
 * @param {string} title - Article title
 * @param {string} lang - Language code (default: 'en')
 * @returns {Promise<{title: string, extract: string}>}
 */
export async function fetchArticleSummary(title, lang = 'en') {
    const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`

    const response = await fetch(apiUrl, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'ASMR-Reader/1.0 (contact@example.com)'
        }
    })

    if (!response.ok) {
        throw new Error(`Wikipedia API error: ${response.status}`)
    }

    const data = await response.json()

    return {
        title: data.title,
        extract: cleanTextForTTS(data.extract || '')
    }
}

/**
 * Fetch full Wikipedia article content
 * @param {string} title - Article title  
 * @param {string} lang - Language code (default: 'en')
 * @param {number} maxLength - Maximum text length (default: 10000 chars)
 * @returns {Promise<{title: string, content: string, sections: Array}>}
 */
export async function fetchArticleContent(title, lang = 'en', maxLength = 10000) {
    // Use the TextExtracts API for clean text
    const apiUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
        action: 'query',
        titles: title,
        prop: 'extracts',
        explaintext: 'true', // Plain text, no HTML
        exsectionformat: 'plain',
        format: 'json',
        origin: '*' // CORS
    })

    const response = await fetch(apiUrl)

    if (!response.ok) {
        throw new Error(`Wikipedia API error: ${response.status}`)
    }

    const data = await response.json()
    const pages = data.query?.pages

    if (!pages) {
        throw new Error('No content found')
    }

    // Get the first (and usually only) page
    const pageId = Object.keys(pages)[0]
    const page = pages[pageId]

    if (pageId === '-1' || !page.extract) {
        throw new Error('Article not found')
    }

    let content = cleanTextForTTS(page.extract)

    // Truncate if too long (for TTS performance)
    if (content.length > maxLength) {
        // Try to cut at a sentence boundary
        const truncated = content.substring(0, maxLength)
        const lastPeriod = truncated.lastIndexOf('.')
        content = lastPeriod > maxLength * 0.8
            ? truncated.substring(0, lastPeriod + 1)
            : truncated + '...'
    }

    return {
        title: page.title,
        content: content
    }
}

/**
 * Main function: Fetch Wikipedia article from URL
 * @param {string} url - Wikipedia URL
 * @param {Object} options - Options
 * @param {boolean} options.fullContent - Fetch full article (default: true)
 * @param {number} options.maxLength - Max content length (default: 10000)
 * @returns {Promise<{title: string, content: string}>}
 */
export async function fetchWikipediaArticle(url, options = {}) {
    const { fullContent = true, maxLength = 10000 } = options

    // Extract title from URL
    const title = extractArticleTitle(url)
    if (!title) {
        throw new Error('Invalid Wikipedia URL. Please enter a valid Wikipedia article link.')
    }

    // Detect language from URL
    const urlObj = new URL(url)
    const langMatch = urlObj.hostname.match(/^(\w+)\.wikipedia\.org/)
    const lang = langMatch ? langMatch[1] : 'en'

    try {
        if (fullContent) {
            const result = await fetchArticleContent(title, lang, maxLength)
            return {
                title: result.title,
                content: result.content
            }
        } else {
            const result = await fetchArticleSummary(title, lang)
            return {
                title: result.title,
                content: result.extract
            }
        }
    } catch (error) {
        console.error('Wikipedia fetch error:', error)
        throw new Error(`Failed to fetch article: ${error.message}`)
    }
}

/**
 * Validate if a string is a valid Wikipedia URL
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
export function isValidWikipediaUrl(url) {
    return extractArticleTitle(url) !== null
}
