import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,       // שורש הפרונט
  base: './',            // חשוב: קבצים יחסיים עבור file://
  build: {
    outDir: path.resolve(__dirname, 'dist'), // יוצר src/ui/dist
    emptyOutDir: true,
    assetsDir: 'assets'
  },
  plugins: [react()]
})
