import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(() => {
    return {
        build: {
            rollupOptions: {
                input: {
                    'main': resolve(__dirname, 'index.html'),
                    'prompt-template': resolve(__dirname, 'prompt-template.html'),
                },
            },
        },
        resolve: {
            alias: {
                '@': resolve(__dirname, './src'),
            },
        },
        server: {
            port: 3000,
            middlewareMode: false,
        },
    }
})
