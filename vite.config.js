import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'pbf-mime-type-only',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.includes('.pbf')) {
            // 只設定 MapLibre 要求的正確標頭，不進行任何 zlib 解壓
            res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile')
            res.setHeader('Access-Control-Allow-Origin', '*')
          }
          next()
        })
      }
    }
  ],
  base: '/hkem-vectormap-study/'
})