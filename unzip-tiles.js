import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const tilesDir = path.join(process.cwd(), 'public', 'tiles')

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      processDirectory(fullPath)
    } else if (entry.isFile() && fullPath.endsWith('.pbf')) {
      const fileBuffer = fs.readFileSync(fullPath)
      // 檢查是否為 Gzip 格式 (0x1f 8b)
      if (fileBuffer.length > 2 && fileBuffer[0] === 0x1f && fileBuffer[1] === 0x8b) {
        try {
          const unzipped = zlib.gunzipSync(fileBuffer)
          fs.writeFileSync(fullPath, unzipped)
          console.log(`✅ 已成功解壓: ${fullPath}`)
        } catch (err) {
          console.error(`❌ 解壓失敗 ${fullPath}:`, err)
        }
      }
    }
  }
}

if (fs.existsSync(tilesDir)) {
  console.log('🚀 開始批次解壓 public/tiles 內的 Gzip PBF 檔案...')
  processDirectory(tilesDir)
  console.log('✨ 所有 PBF 檔案已轉換為純二進位格式！')
} else {
  console.log('⚠️ 找不到 public/tiles 目錄')
}