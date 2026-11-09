import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'local-tiles-middleware',
      configureServer(server) {
        server.middlewares.use('/tiles', (req, res, next) => {
          // 修改前 (指向 Python 腳本資料夾)
          // const filePath = path.join('C:/Tree/python_scripts/hkem_basemap_pbf/dl_landsd_pbf/tiles', req.url)

          // 修改後 (指向你專案入面嘅 public/tiles)
          const filePath = path.join(process.cwd(), 'public/tiles', req.url)
          
          if (fs.existsSync(filePath)) {
            // ★ 關鍵：強制指定二進位圖磚的 Content-Type，解決 parse 失敗問題
            res.setHeader('Content-Type', 'application/x-protobuf')
            res.setHeader('Access-Control-Allow-Origin', '*')
            fs.createReadStream(filePath).pipe(res)
          } else {
            res.statusCode = 404
            res.end('Tile not found on disk')
          }
        })
      }
    }
  ],
  base: '/hkem-vectormap-study/',
})