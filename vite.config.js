import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Uncomment for GitHub Pages (set to your repo name):
  // base: '/snippet-vault/',
})
