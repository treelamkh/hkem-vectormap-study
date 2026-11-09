import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'handle-gzipped-pbf-priority',
      configureServer(server) {
        const pbfMiddleware = (req, res, next) => {
          if (req.url && req.url.includes('.pbf')) {
            const cleanUrl = req.url.replace(/^\/hkem-vectormap-study/, '')
            const filePath = path.join(process.cwd(), 'public', cleanUrl)

            if (fs.existsSync(filePath)) {
              try {
                const fileBuffer = fs.readFileSync(filePath)
                let outputBuffer = fileBuffer

                // 自動偵測並解壓 Gzip (Magic Number: 0x1f 8b)
                if (fileBuffer.length > 2 && fileBuffer[0] === 0x1f && fileBuffer[1] === 0x8b) {
                  outputBuffer = zlib.gunzipSync(fileBuffer)
                }

                res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.removeHeader('Content-Encoding')
                res.end(outputBuffer)
                return
              } catch (err) {
                console.error('❌ PBF 處理失敗:', err)
              }
            }
          }
          next()
        }

        // 透過修改內部 stack 陣列，將 middleware 放到最前面優先執行
        if (server.middlewares.stack) {
          server.middlewares.stack.unshift({ route: '', handle: pbfMiddleware })
        } else {
          server.middlewares.use(pbfMiddleware)
        }
      }
    }
  ],
  base: '/hkem-vectormap-study/'
})