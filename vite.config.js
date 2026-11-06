import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'tile-xyz-to-yxy-fix',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // 只要請求是以 /tiles/ 開頭就進行攔截
          if (req.url && req.url.startsWith('/tiles/')) {
            const match = req.url.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf/)
            if (match) {
              const [, z, a, b] = match
              
              // 這裡我們直接彈性對應：無論前端傳來的是 x/y 還是 y/x，
              // 我們直接檢查硬碟中實際存在的檔案組合 (z/a/b 或 z/b/a)
              const path1 = path.resolve(__dirname, `public/tiles/${z}/${a}/${b}.pbf`)
              const path2 = path.resolve(__dirname, `public/tiles/${z}/${b}/${a}.pbf`)
              
              let realPath = null
              if (fs.existsSync(path1)) {
                realPath = path1
              } else if (fs.existsSync(path2)) {
                realPath = path2
              }

              if (realPath) {
                res.setHeader('Content-Type', 'application/x-protobuf')
                return fs.createReadStream(realPath).pipe(res)
              } else {
                console.warn(`⚠️ [Tile Not Found] 找不到圖磚檔案: ${path1} 或 ${path2}`)
                res.statusCode = 404
                res.end('Tile not found')
                return
              }
            }
          }
          next()
        })
      }
    }
  ],
  // 設定 base 為 /hkem-vectormap-study/，以便在 GitHub Pages 上正確部署
  base: '/hkem-vectormap-study/',
  server: {
    port: 5173
  }
})