import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Dependency optimization
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
    include: ['react', 'react-dom', 'pdfjs-dist']
  },

  // Production build optimizations
  build: {
    target: 'esnext',
    minify: 'esbuild', // Use esbuild (built-in, no extra deps)
    sourcemap: false,

    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'pdfjs': ['pdfjs-dist']
        },
        // Clean asset naming
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },

    // Performance thresholds
    chunkSizeWarningLimit: 500
  },

  // Development server settings
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  // Preview (production) server settings
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
