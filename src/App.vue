<template>
  <div class="map-container">
    <div ref="mapContainer" id="map"></div>

    <!-- 依 1K / 5K / Normal 分類的批次控制器（支援最小化） -->
    <div class="control-panel">
      <div class="panel-header">
        <span>🗂️ 圖層三大分類批次控制面板</span>
        <button class="toggle-btn" @click="isMinimized = !isMinimized">
          {{ isMinimized ? '+' : '-' }}
        </button>
      </div>

      <div class="panel-body" v-show="!isMinimized">
        <!-- 當前 Zoom -->
        <div class="control-item">
          <label>當前 Zoom:</label>
          <span class="badge">{{ currentZoom }}</span>
        </div>

        <!-- 1. Normal 圖層控制 -->
        <div class="category-box">
          <div class="category-title">Normal 圖層 (共 {{ categories.normal.length }} 個)</div>
          <div class="control-row">
            <label>顏色:</label>
            <input type="color" v-model="categories.normal.color" @change="updateCategoryStyle('normal')" />
            <label>粗幼: {{ categories.normal.width }}px</label>
            <input type="range" min="1" max="20" step="0.5" v-model.number="categories.normal.width" @input="updateCategoryStyle('normal')" />
          </div>
        </div>

        <!-- 2. 5K 圖層控制 -->
        <div class="category-box">
          <div class="category-title">5K 圖層 (共 {{ categories.layer5K.length }} 個)</div>
          <div class="control-row">
            <label>顏色:</label>
            <input type="color" v-model="categories.layer5K.color" @change="updateCategoryStyle('layer5K')" />
            <label>粗幼: {{ categories.layer5K.width }}px</label>
            <input type="range" min="1" max="20" step="0.5" v-model.number="categories.layer5K.width" @input="updateCategoryStyle('layer5K')" />
          </div>
        </div>

        <!-- 3. 1K 圖層控制 -->
        <div class="category-box">
          <div class="category-title">1K 圖層 (共 {{ categories.layer1K.length }} 個)</div>
          <div class="control-row">
            <label>顏色:</label>
            <input type="color" v-model="categories.layer1K.color" @change="updateCategoryStyle('layer1K')" />
            <label>粗幼: {{ categories.layer1K.width }}px</label>
            <input type="range" min="1" max="20" step="0.5" v-model.number="categories.layer1K.width" @input="updateCategoryStyle('layer1K')" />
          </div>
        </div>

        <div class="hint-text">
          💡 點擊右上角 [-] 可最小化面板，方便檢視地圖。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

const currentZoom = ref(11)
const mapContainer = ref(null)
const isMinimized = ref(false)

let mapInstance = null
let realMlMap = null

// 定義三大類別及其對應的圖層 ID 清單與當前設定的樣式數值
const categories = reactive({
  normal: { ids: [], length: 0, color: '#2c3e50', width: 2 },
  layer5K: { ids: [], length: 0, color: '#e67e22', width: 3 },
  layer1K: { ids: [], length: 0, color: '#e74c3c', width: 4 }
})

// 執行樣式更新的核心邏輯
const updateCategoryStyle = (categoryKey) => {
  if (!realMlMap) {
    console.warn('⚠️ [Debug] MapLibre 實例尚未就緒')
    return
  }

  const cat = categories[categoryKey]
  console.log(`🔄 [Debug] 正在更新 [${categoryKey}] 類別，目標顏色: ${cat.color}，寬度: ${cat.width}px，共 ${cat.ids.length} 個圖層`)

  let successCount = 0
  cat.ids.forEach(id => {
    try {
      const layer = realMlMap.getLayer(id)
      if (layer) {
        if (layer.type === 'line') {
          realMlMap.setPaintProperty(id, 'line-color', cat.color)
          realMlMap.setPaintProperty(id, 'line-width', cat.width)
          successCount++
        } else if (layer.type === 'fill') {
          realMlMap.setPaintProperty(id, 'fill-color', cat.color)
          successCount++
        } else if (layer.type === 'circle') {
          realMlMap.setPaintProperty(id, 'circle-color', cat.color)
          realMlMap.setPaintProperty(id, 'circle-radius', cat.width)
          successCount++
        }
      }
    } catch (err) {
      // 略過不支援的屬性
    }
  })
  console.log(`🎉 [Debug] [${categoryKey}] 更新完成，成功修改 ${successCount}/${cat.ids.length} 個圖層`)
}

onMounted(async () => {
  if (!mapContainer.value) return

  const L = window.L
  if (!L) return

  const map = L.map(mapContainer.value, {
    center: [22.3193, 114.1694],
    zoom: 11,
    minZoom: 8,
    maxZoom: 20,
    zoomSnap: 0.1,
    zoomDelta: 0.1,
    fadeAnimation: false
  })
  mapInstance = map

  map.on('zoom', () => { currentZoom.value = Number(map.getZoom().toFixed(1)) })

  // 字型轉譯攔截器
  const fontTransform = (url) => {
    let reqUrl = url
    if (reqUrl && reqUrl.includes('/fonts/')) {
      reqUrl = reqUrl.replace(/LianHeiHK%20Bold/g, 'Noto%20Sans%20Bold')
                   .replace(/LianHeiHK Bold/g, 'Noto Sans Bold')
                   .replace(/LianHeiHK%20Regular/g, 'Noto%20Sans%20Regular')
                   .replace(/LianHeiHK Regular/g, 'Noto Sans Regular')
                   .replace(/CyansHeiHK%20Bold/g, 'Noto%20Sans%20Bold')
                   .replace(/CyansHeiHK Bold/g, 'Noto Sans Bold')
                   .replace(/CyansHeiHK%20Regular/g, 'Noto%20Sans%20Regular')
                   .replace(/CyansHeiHK Regular/g, 'Noto Sans Regular')
                   .replace(/Arial%20Regular/g, 'Noto%20Sans%20Regular')
                   .replace(/Arial Regular/g, 'Noto Sans Regular')
                   .replace(/Arial%20Bold/g, 'Noto%20Sans%20Bold')
                   .replace(/Arial Bold/g, 'Noto Sans Bold')
                   .replace(/Arial/g, 'Noto%20Sans%20Regular')
    }
    return { url: reqUrl }
  }

  let mapStyle = null

  // 1. 載入並處理底圖 Style
  try {
    const styleUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/resources/styles/root.json'
    const res = await fetch(styleUrl)
    const textData = await res.text()
    const fixedText = textData.replace(/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/')
    mapStyle = JSON.parse(fixedText)

    if (mapStyle.sources) {
      Object.keys(mapStyle.sources).forEach(key => {
        if (mapStyle.sources[key].type === 'vector') {
          mapStyle.sources[key].maxzoom = 15
          mapStyle.sources[key].tiles = [
            'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/tile/{z}/{y}/{x}.pbf'
          ]
        }
      })
    }

    // 核心分類邏輯
    if (mapStyle.layers) {
      const normalIds = []
      const layer5KIds = []
      const layer1KIds = []

      mapStyle.layers.forEach(layer => {
        const sourceLayer = (layer['source-layer'] || '').toUpperCase()
        const layerId = layer.id || ''
        const layerIdLower = layerId.toLowerCase()

        if (layerIdLower.includes('label') || layerIdLower.includes('text') || layer.type === 'symbol') {
          return
        }

        if (sourceLayer.includes('1K') || layerIdLower.includes('1k')) {
          layer.minzoom = 18
          layer1KIds.push(layerId)
        } else if (sourceLayer.includes('5K') || layerIdLower.includes('5k')) {
          layer.minzoom = 15
          layer5KIds.push(layerId)
        } else {
          normalIds.push(layerId)
        }
      })

      categories.normal.ids = normalIds
      categories.normal.length = normalIds.length

      categories.layer5K.ids = layer5KIds
      categories.layer5K.length = layer5KIds.length

      categories.layer1K.ids = layer1KIds
      categories.layer1K.length = layer1KIds.length
    }
  } catch (err) {
    console.error('❌ [Debug] Basemap 載入失敗:', err)
  }

  // 2. 載入 Label Style 並合併
  try {
    const styLabelUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/styles/root.json'
    const resLabel = await fetch(styLabelUrl)
    const textLabelData = await resLabel.text()
    const fixedLabelText = textLabelData.replace(/\.\.\/\.\.\/|\.\.\/|\.\.\/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/')
    const mapLabelStyle = JSON.parse(fixedLabelText)

    mapStyle.glyphs = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/fonts/{fontstack}/{range}.pbf'

    if (mapLabelStyle.sources) {
      const labelSourceKey = Object.keys(mapLabelStyle.sources)[0] || 'esri'
      const labelSourceObj = mapLabelStyle.sources[labelSourceKey]
      
      if (labelSourceObj) {
        labelSourceObj.maxzoom = 15
        labelSourceObj.tiles = [
          'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/tile/{z}/{y}/{x}.pbf'
        ]
        mapStyle.sources['hk_label'] = labelSourceObj

        if (mapLabelStyle.layers) {
          mapLabelStyle.layers.forEach(layer => {
            layer.source = 'hk_label'
          })
        }
      }
    }

    if (mapLabelStyle.layers && mapStyle.layers) {
      mapStyle.layers = [...mapStyle.layers, ...mapLabelStyle.layers]
    }
  } catch (err) {
    console.error('❌ [Debug] Label Style 載入失敗:', err)
  }

  // 3. 建立 MapLibre 圖層並捕獲實例
  if (mapStyle) {
    const glLayer = L.maplibreGL({
      style: mapStyle,
      maxZoom: 20,
      transformRequest: fontTransform
    })
    glLayer.addTo(map)

    const findMaplibreInstance = () => {
      if (typeof glLayer.getMaplibreMap === 'function' && glLayer.getMaplibreMap()) {
        return glLayer.getMaplibreMap()
      }
      if (glLayer._glMap) return glLayer._glMap
      if (glLayer._maplibreMap) return glLayer._maplibreMap
      for (const key of Object.keys(glLayer)) {
        if (glLayer[key] && typeof glLayer[key].setPaintProperty === 'function') {
          return glLayer[key]
        }
      }
      return null
    }

    const checkInstance = () => {
      const instance = findMaplibreInstance()
      if (instance) {
        realMlMap = instance
        window.mlMap = realMlMap
        console.log('🎉 [Debug] 成功捕捉到 MapLibre 核心實例！', realMlMap)
      } else {
        setTimeout(checkInstance, 100)
      }
    }
    checkInstance()
  }
})
</script>

<style scoped>
.map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
}
#map {
  width: 100%;
  height: 100%;
}
.control-panel {
  position: absolute;
  top: 15px;
  right: 15px;
  z-index: 1000;
  width: 340px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-family: sans-serif;
  overflow: hidden;
}
.panel-header {
  background: #2c3e50;
  color: white;
  padding: 10px 14px;
  font-weight: bold;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toggle-btn {
  background: #34495e;
  color: white;
  border: 1px solid #4e6d8d;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.toggle-btn:hover {
  background: #4e6d8d;
}
.panel-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  max-height: 80vh;
  overflow-y: auto;
}
.control-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.category-box {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  padding: 8px 10px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.category-title {
  font-weight: bold;
  color: #2c3e50;
  font-size: 12px;
}
.control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.badge {
  background: #3498db;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
}
.hint-text {
  font-size: 11px;
  color: #666;
  background: #fff3cd;
  padding: 6px;
  border-radius: 4px;
  border: 1px solid #ffeeba;
}
</style>