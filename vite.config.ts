
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all envs regardless of the `VITE_` prefix.
  // We use '.' as the directory path to avoid process.cwd() type issues in some environments.
  const env = loadEnv(mode, '.', '');
  
  // Prioritize the environment variable from Vercel/Process, then the .env file
  const apiKey = process.env.API_KEY || env.API_KEY;

  return {
    plugins: [react()],
    define: {
      // This explicitly replaces 'process.env.API_KEY' in your code with the actual key string during the build
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
