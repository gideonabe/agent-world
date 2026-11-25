import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 3D models ship with the engine package and are served at /models/
  publicDir: '../../packages/engine/assets',
  resolve: {
    // one copy of these across workspace packages
    dedupe: ['react', 'react-dom', 'three', 'zustand', '@react-three/fiber', '@react-three/drei'],
  },
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1600 },
});
