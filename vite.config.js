import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 請把 '你的專案名稱' 換成你 GitHub repository 的名稱（前後都要有斜線）
  // 例如你的 repo 叫 hk-map-study，這裡就要填 '/hk-map-study/'
  base: '/hkem-vectormap-study/', 
})