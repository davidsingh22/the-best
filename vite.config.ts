import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Fix: Explicitly import process to provide Node.js types for process.cwd() and process.env
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load environment variables from the environment and .env files
  const env = loadEnv(mode, process.cwd(), '');
  
  // Vercel provides process.env.API_KEY during the build
  const apiKey = env.API_KEY || process.env.API_KEY || '';

  console.log('Build Mode:', mode);
  console.log('API Key detected during build:', apiKey ? 'YES (Length: ' + apiKey.length + ')' : 'NO');

  return {
    plugins: [react()],
    define: {
      // This is the critical part: it replaces the literal text "process.env.API_KEY" 
      // in your code with the actual key string.
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    }
  };
});