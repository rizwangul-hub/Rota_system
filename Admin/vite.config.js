import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (mode === 'production' && !env.VITE_API_URL) {
    console.warn('⚠️ [VITE] VITE_API_URL is not set. Set VITE_API_URL in Vercel Environment Variables to point to your backend API.')
  }

  return {
    plugins: [react()],
  }
})
