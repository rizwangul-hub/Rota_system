import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (mode === 'production') {
    if (!env.VITE_API_URL) {
      throw new Error('VITE_API_URL must be set to the deployed HTTPS API URL before building for production.')
    }

    let apiUrl
    try {
      apiUrl = new URL(env.VITE_API_URL)
    } catch {
      throw new Error('VITE_API_URL must be a valid absolute HTTPS URL.')
    }
    if (apiUrl.protocol !== 'https:') {
      throw new Error('VITE_API_URL must use HTTPS in production.')
    }
    if (apiUrl.pathname.replace(/\/+$/, '') !== '/api') {
      throw new Error('VITE_API_URL must end with /api.')
    }
  }

  return {
    plugins: [react()],
  }
})
