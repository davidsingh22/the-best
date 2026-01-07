
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all envs regardless of the `VITE_` prefix.
  // FIX: Using '.' instead of process.cwd() to resolve type issues with the 'process' object in some build environments.
  const env = loadEnv(mode, '.', '');
  
  // Use the environment variable from the system (Vercel) or the .env file
  const apiKey = process.env.API_KEY || env.API_KEY;

  return {
    plugins: [react()],
    define: {
      // This explicitly replaces 'process.env.API_KEY' in your code with the actual key string during build
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
