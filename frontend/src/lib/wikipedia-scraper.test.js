/**
 * Wikipedia Scraper Tests
 * Run: npm test (after adding vitest to devDependencies)
 */

import { describe, it, expect } from 'vitest'
import {
    extractArticleTitle,
    cleanTextForTTS,
    isValidWikipediaUrl
} from './wikipedia-scraper.js'

describe('extractArticleTitle', () => {
    it('extracts title from standard Wikipedia URL', () => {
        expect(extractArticleTitle('https://en.wikipedia.org/wiki/ASMR'))
            .toBe('ASMR')
    })

    it('extracts title from URL with spaces (underscores)', () => {
        expect(extractArticleTitle('https://en.wikipedia.org/wiki/Artificial_intelligence'))
            .toBe('Artificial_intelligence')
    })

    it('extracts title from URL with encoded characters', () => {
        expect(extractArticleTitle('https://en.wikipedia.org/wiki/Caf%C3%A9'))
            .toBe('Café')
    })

    it('removes section anchors from URL', () => {
        expect(extractArticleTitle('https://en.wikipedia.org/wiki/ASMR#History'))
            .toBe('ASMR')
    })

    it('handles non-English Wikipedia URLs', () => {
        expect(extractArticleTitle('https://fr.wikipedia.org/wiki/France'))
            .toBe('France')
        expect(extractArticleTitle('https://de.wikipedia.org/wiki/Deutschland'))
            .toBe('Deutschland')
    })

    it('returns null for non-Wikipedia URLs', () => {
        expect(extractArticleTitle('https://google.com')).toBeNull()
        expect(extractArticleTitle('https://example.com/wiki/Test')).toBeNull()
    })

    it('returns null for invalid URLs', () => {
        expect(extractArticleTitle('not a url')).toBeNull()
        expect(extractArticleTitle('')).toBeNull()
    })

    it('returns null for Wikipedia URLs without article path', () => {
        expect(extractArticleTitle('https://en.wikipedia.org/')).toBeNull()
        expect(extractArticleTitle('https://en.wikipedia.org/wiki/')).toBeNull()
    })
})

describe('cleanTextForTTS', () => {
    it('removes reference numbers', () => {
        expect(cleanTextForTTS('This is a fact[1] and another[2].'))
            .toBe('This is a fact and another.')
    })

    it('removes citation needed tags', () => {
        expect(cleanTextForTTS('This claim[citation needed] is disputed.'))
            .toBe('This claim is disputed.')
    })

    it('removes edit links', () => {
        expect(cleanTextForTTS('Section Title[edit] Some content here.'))
            .toBe('Section Title Some content here.')
    })

    it('collapses extra whitespace', () => {
        expect(cleanTextForTTS('Too   many    spaces   here'))
            .toBe('Too many spaces here')
    })

    it('handles empty input', () => {
        expect(cleanTextForTTS('')).toBe('')
        expect(cleanTextForTTS(null)).toBe('')
        expect(cleanTextForTTS(undefined)).toBe('')
    })

    it('preserves normal text', () => {
        const text = 'This is a normal sentence with proper punctuation.'
        expect(cleanTextForTTS(text)).toBe(text)
    })
})

describe('isValidWikipediaUrl', () => {
    it('returns true for valid Wikipedia URLs', () => {
        expect(isValidWikipediaUrl('https://en.wikipedia.org/wiki/ASMR')).toBe(true)
        expect(isValidWikipediaUrl('https://fr.wikipedia.org/wiki/Paris')).toBe(true)
    })

    it('returns false for non-Wikipedia URLs', () => {
        expect(isValidWikipediaUrl('https://google.com')).toBe(false)
        expect(isValidWikipediaUrl('https://example.com')).toBe(false)
    })

    it('returns false for invalid input', () => {
        expect(isValidWikipediaUrl('')).toBe(false)
        expect(isValidWikipediaUrl('not a url')).toBe(false)
    })
})
