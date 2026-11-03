import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5174,
      open: true,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'https://rota-system-kohl.vercel.app',
          changeOrigin: true,
          secure: true
        }
      }
    }
  };
});
