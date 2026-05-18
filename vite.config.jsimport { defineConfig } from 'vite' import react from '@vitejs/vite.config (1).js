import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // PWA 관련 public 파일 처리
  publicDir: 'public',
})
