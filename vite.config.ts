
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // We use (process as any).cwd() to resolve the TypeScript error where the Process type might not include cwd in certain environments.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Use the environment variable from the system (Vercel) or the .env file
  const apiKey = process.env.API_KEY || env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // This explicitly replaces 'process.env.API_KEY' in your code with the actual key string during build
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    server: {
      port: 3000
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
