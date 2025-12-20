/**
 * Preview Cache - IndexedDB-based audio caching
 * Caches generated audio blobs for instant replay
 */

const DB_NAME = 'asmr-reader-cache'
const DB_VERSION = 1
const STORE_NAME = 'audio-cache'
const MAX_ENTRIES = 50

class PreviewCache {
    constructor() {
        this.db = null
        this.isReady = false
    }

    async initialize() {
        if (this.isReady) return

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)

            request.onerror = () => reject(request.error)

            request.onsuccess = () => {
                this.db = request.result
                this.isReady = true
                resolve()
            }

            request.onupgradeneeded = (event) => {
                const db = event.target.result
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
                    store.createIndex('timestamp', 'timestamp', { unique: false })
                }
            }
        })
    }

    /**
     * Generate cache key from text and options
     */
    _generateKey(text, options) {
        const str = `${text}|${options.voiceId}|${options.pitch}|${options.speed}`
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        return `audio_${Math.abs(hash).toString(36)}`
    }

    /**
     * Get cached audio blob
     */
    async get(text, options) {
        if (!this.isReady) await this.initialize()

        const key = this._generateKey(text, options)

        return new Promise((resolve) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.get(key)

            request.onsuccess = () => {
                if (request.result) {
                    console.log('[Cache] Hit for', key)
                    resolve(request.result.blob)
                } else {
                    resolve(null)
                }
            }

            request.onerror = () => resolve(null)
        })
    }

    /**
     * Store audio blob in cache
     */
    async set(text, options, blob, duration) {
        if (!this.isReady) await this.initialize()

        const key = this._generateKey(text, options)

        // Cleanup old entries if needed
        await this._cleanup()

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)

            const entry = {
                id: key,
                blob,
                duration,
                timestamp: Date.now(),
                textPreview: text.slice(0, 100)
            }

            const request = store.put(entry)
            request.onsuccess = () => {
                console.log('[Cache] Stored', key)
                resolve()
            }
            request.onerror = () => reject(request.error)
        })
    }

    /**
     * Remove oldest entries if over limit
     */
    async _cleanup() {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const index = store.index('timestamp')
            const countRequest = store.count()

            countRequest.onsuccess = () => {
                const count = countRequest.result
                if (count <= MAX_ENTRIES) {
                    resolve()
                    return
                }

                // Delete oldest entries
                const deleteCount = count - MAX_ENTRIES + 10
                let deleted = 0

                const cursorRequest = index.openCursor()
                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result
                    if (cursor && deleted < deleteCount) {
                        cursor.delete()
                        deleted++
                        cursor.continue()
                    } else {
                        console.log(`[Cache] Cleaned up ${deleted} old entries`)
                        resolve()
                    }
                }
            }
        })
    }

    /**
     * Clear entire cache
     */
    async clear() {
        if (!this.isReady) await this.initialize()

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.clear()

            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }
}

export const previewCache = new PreviewCache()
