import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  '/inventory-management': { target: process.env.INVENTORY_SERVICE_URL || 'http://127.0.0.1:3001', changeOrigin: true },
  '/order-processing': { target: process.env.ORDER_SERVICE_URL || 'http://127.0.0.1:3002', changeOrigin: true },
};

export default defineConfig({ plugins: [react()], server: { proxy }, preview: { proxy } });
