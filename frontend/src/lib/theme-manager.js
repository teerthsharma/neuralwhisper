/**
 * ZEN THEME MANAGER
 * ==========================================
 * "Choose the color of everything."
 * 
 * Manages the application's visual theme, including:
 * 1. CSS Variable injection for deep color customization.
 * 2. Background Media (Image/Video) persistence.
 * 3. Presets for "Vibes".
 */

const THEME_KEY = 'zen_theme_v1';
const MEDIA_DB_NAME = 'zen_media_db';
const MEDIA_STORE_NAME = 'backgrounds';

// Default "Zen" Theme
const DEFAULT_THEME = {
    colors: {
        primary: '#C084FC',    // Purple-ish
        accent: '#2DD4BF',     // Teal-ish
        surface: '#0F172A',    // Deep Blue-Black
        text: '#F8FAFC',       // White-ish
        backdrop_opacity: 0.7  // For glassmorphism over video
    },
    background: {
        type: 'css', // 'css', 'image', 'video'
        value: 'linear-gradient(to bottom right, #0F172A, #1E1B4B)'
    }
};

class ThemeManager {
    constructor() {
        this.theme = this._loadTheme();
        this.db = null;
        this._initDB();
        this.applyTheme(); // Apply immediately on load
    }

    _loadTheme() {
        try {
            const saved = localStorage.getItem(THEME_KEY);
            return saved ? { ...DEFAULT_THEME, ...JSON.parse(saved) } : { ...DEFAULT_THEME };
        } catch (e) {
            return { ...DEFAULT_THEME };
        }
    }

    async _initDB() {
        // We use IndexedDB for large background files (blobs) to avoid LocalStorage limits
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(MEDIA_DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
                    db.createObjectStore(MEDIA_STORE_NAME);
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                this._restoreBackgroundMedia(); // Restore huge file if exists
                resolve(this.db);
            };
            request.onerror = (e) => reject(e);
        });
    }

    _saveTheme() {
        // We don't save the potentially huge blob in localstorage, just the metadata
        const themeToSave = { ...this.theme };
        if (themeToSave.background.blob) {
            delete themeToSave.background.blob; // Don't save blob here
        }
        localStorage.setItem(THEME_KEY, JSON.stringify(themeToSave));
        this.applyTheme();
    }

    /**
     * Apply the current theme to the document root
     */
    applyTheme() {
        const root = document.documentElement;
        const { colors } = this.theme;

        // Apply Colors
        root.style.setProperty('--zen-primary', colors.primary);
        root.style.setProperty('--zen-accent', colors.accent);
        root.style.setProperty('--zen-surface', colors.surface);
        root.style.setProperty('--zen-text', colors.text);
        root.style.setProperty('--zen-backdrop-opacity', colors.backdrop_opacity);

        // Notify UI components (especially the Video Background component)
        window.dispatchEvent(new CustomEvent('zen-theme-change', { detail: this.theme }));
    }

    /**
     * Update a specific color
     */
    setColor(key, value) {
        if (this.theme.colors[key] !== undefined) {
            this.theme.colors[key] = value;
            this._saveTheme();
        }
    }

    /**
     * Set the background to a CSS value (gradient/color)
     */
    setCssBackground(cssValue) {
        this.theme.background = { type: 'css', value: cssValue };
        this._saveTheme();
    }

    /**
     * Set the background to a Media File (Image or Video)
     * @param {File} file - The uploaded file
     */
    async setMediaBackground(file) {
        // 1. Store in IndexedDB
        if (this.db) {
            const tx = this.db.transaction(MEDIA_STORE_NAME, 'readwrite');
            const store = tx.objectStore(MEDIA_STORE_NAME);
            await new Promise((resolve) => {
                store.put(file, 'current_bg'); // Always overwrite 'current_bg'
                tx.oncomplete = resolve;
            });
        }

        // 2. Create Object URL for immediate display
        const url = URL.createObjectURL(file);
        const type = file.type.startsWith('video') ? 'video' : 'image';

        this.theme.background = {
            type: type,
            value: url,
            mime: file.type // Store mime to know if video/image on restore
        };

        this._saveTheme();
    }

    /**
     * Restore the background blob from IndexedDB on reload
     */
    async _restoreBackgroundMedia() {
        if (!this.db || this.theme.background.type === 'css') return;

        try {
            const tx = this.db.transaction(MEDIA_STORE_NAME, 'readonly');
            const store = tx.objectStore(MEDIA_STORE_NAME);
            const request = store.get('current_bg');

            request.onsuccess = () => {
                const file = request.result;
                if (file) {
                    const url = URL.createObjectURL(file);
                    this.theme.background.value = url;
                    // Force re-apply to update components
                    window.dispatchEvent(new CustomEvent('zen-theme-change', { detail: this.theme }));
                }
            };
        } catch (e) {
            console.error('Failed to restore background media', e);
        }
    }
}

export const themeManager = new ThemeManager();
