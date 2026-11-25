import { defineConfig as definirConfiguracion } from 'vite';
import complementoReact from '@vitejs/plugin-react';
export default definirConfiguracion({
  plugins: [complementoReact()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001'
    }
  }
});
