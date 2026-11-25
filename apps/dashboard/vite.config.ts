import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 3D models ship with the engine package and are served at /models/
  publicDir: '../../packages/engine/assets',
  // relative asset URLs so the build can be hosted by the Agent World server or anywhere else
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom', 'three', 'zustand', '@react-three/fiber', '@react-three/drei'],
  },
  // docs are markdown files from across the repo (imported with ?raw)
  server: { port: 5180, fs: { allow: ['../..'] } },
  build: { chunkSizeWarningLimit: 1800 },
});
