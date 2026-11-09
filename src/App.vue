<template>
  <div class="map-container">
    <div ref="mapContainer" id="map"></div>

    <!-- 依 1K / 5K / Normal 分類的批次控制器 -->
    <div class="control-panel">
      <div class="panel-header">
        <span>🗂️ 圖層三大分類批次控制面板</span>
        <!-- 移至右上角的最小化按鈕 -->
        <button class="toggle-btn" @click.stop="isMinimized = !isMinimized">
          {{ isMinimized ? '+' : '-' }}
        </button>
      </div>

      <div class="panel-body" v-show="!isMinimized">
        <!-- 當前 Zoom -->
        <div class="control-item">
          <label>當前 Zoom:</label>
          <span class="badge">{{ currentZoom }}</span>
        </div>

        <!-- Debug Mode 切換開關 -->
        <div class="control-item debug-box">
          <label>Debug Mode (本地 PBF):</label>
          <select v-model="debugMode" @change="switchDebugMode" class="select-input">
            <option value="N">N (線上 API)</option>
            <option value="Y">Y (本地 \public\tiles\)</option>
          </select>
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
          💡 切換 Y 模式可順暢載入本地 PBF，支援 Level 17+ 超量放大（Overzoom）渲染。
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
const debugMode = ref('N')

let mapInstance = null
let realMlMap = null
let glLayerNormal = null
let glLayerDebug = null
let currentActiveLayer = null

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
}

// 實例捕獲共用函式
const captureMapInstance = (layer) => {
  const findMaplibreInstance = () => {
    if (typeof layer.getMaplibreMap === 'function' && layer.getMaplibreMap()) {
      return layer.getMaplibreMap()
    }
    if (layer._glMap) return layer._glMap
    if (layer._maplibreMap) return layer._maplibreMap
    for (const key of Object.keys(layer)) {
      if (layer[key] && typeof layer[key].setPaintProperty === 'function') {
        return layer[key]
      }
    }
    return null
  }

  const checkInstance = () => {
    const instance = findMaplibreInstance()
    if (instance) {
      realMlMap = instance
      window.mlMap = realMlMap
      console.log('🎉 [Debug] 成功捕捉到 MapLibre 核心實例！')

      // ★ 加上這一行：地圖載入完成後自動印出畫面上的所有 source-layer 名稱
      setTimeout(() => {
        const layers = realMlMap.queryRenderedFeatures()
        const sourceLayers = [...new Set(layers.map(f => f.layer?.['source-layer'] || f.sourceLayer))]
        console.log('📌 【當前畫面的 source-layers 清單】：', sourceLayers)
      }, 1000)

      updateCategoryStyle('normal')
      updateCategoryStyle('layer5K')
      updateCategoryStyle('layer1K')
    } else {
      setTimeout(checkInstance, 100)
    }
  }
  checkInstance()
}

const debugSourceFeatures = () => {
  if (realMlMap && realMlMap.getSource('esri')) {
    // 取得該 source 的內部所有原始資料
    const features = realMlMap.querySourceFeatures('esri', {
      sourceLayer: 'OSP_MARK_LINE'
    });
    console.log('🎯 [強制查詢 OSP] 結果：', features);
  }
};
// 可以在地圖載入後 2 秒呼叫一次
setTimeout(debugSourceFeatures, 2000);

// 切換 Debug Mode
const switchDebugMode = () => {
  if (!mapInstance) return

  if (currentActiveLayer && mapInstance.hasLayer(currentActiveLayer)) {
    mapInstance.removeLayer(currentActiveLayer)
  }

  if (debugMode.value === 'Y') {
    console.log('🛠️ [Debug] 切換至 Debug Mode: Y (使用本地 \public\tiles\ pbf)')
    if (glLayerDebug) {
      glLayerDebug.addTo(mapInstance)
      currentActiveLayer = glLayerDebug
      captureMapInstance(glLayerDebug)
    }
  } else {
    console.log('🌐 [Debug] 切換至 Debug Mode: N (使用線上 API)')
    if (glLayerNormal) {
      glLayerNormal.addTo(mapInstance)
      currentActiveLayer = glLayerNormal
      captureMapInstance(glLayerNormal)
    }
  }
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
  map.on('move', debugSourceFeatures)

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

  let mapStyleNormal = null
  let mapStyleDebug = null

  // 1. 載入並處理線上 Basemap Style (Normal 與 Debug 雙版本)
  try {
    //const styleUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/resources/styles/root.json'
    //const res = await fetch(styleUrl)
    //const textData = await res.text()
    //const fixedText = textData.replace(/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/')

    const res = await fetch(`${import.meta.env.BASE_URL}config/basemap-style.json`)
    const textData = await res.text()
    const fixedText = textData.replace(/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/')
    
    mapStyleNormal = JSON.parse(fixedText)
    mapStyleDebug = JSON.parse(JSON.stringify(mapStyleNormal))

    if (mapStyleNormal.sources) {
      Object.keys(mapStyleNormal.sources).forEach(key => {
        if (mapStyleNormal.sources[key].type === 'vector') {
          mapStyleNormal.sources[key].maxzoom = 15
          mapStyleNormal.sources[key].tiles = [
            'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/tile/{z}/{y}/{x}.pbf'
          ]
        }
      })
    }

    if (mapStyleDebug.sources) {
      Object.keys(mapStyleDebug.sources).forEach(key => {
        if (mapStyleDebug.sources[key].type === 'vector') {
          mapStyleDebug.sources[key].maxzoom = 15
          mapStyleDebug.sources[key].tiles = [
            `${window.location.origin}/tiles/{z}/{x}/{y}.pbf`
          ]
          delete mapStyleDebug.sources[key].bounds
        }
      })
    }

    if (mapStyleNormal.layers) {
      const normalIds = []
      const layer5KIds = []
      const layer1KIds = []

      mapStyleNormal.layers.forEach(layer => {
        const sourceLayer = (layer['source-layer'] || '').toUpperCase()
        const layerId = layer.id || ''
        const layerIdLower = layerId.toLowerCase()

        // 1. 排除文字標籤與符號
        if (layerIdLower.includes('label') || layerIdLower.includes('text') || layer.type === 'symbol') {
            return
        }

        // 🎯 2. Special Handle: OSP 獨立處理邏輯
        if (sourceLayer.includes('OSP') || layerIdLower.includes('osp')) {
            // 印出除錯資訊，確定它被處理了
            console.log('[Debug OSP] 成功捕獲 OSP 圖層:', layerId)
            
            // 根據需求設定它的 minzoom（例如設為 10，確保它在低視角就能開始顯示）
            // 如果你希望它在 Zoom 10 就能出線：
            layer.minzoom = 10;
            
            // 將它放入 normalIds 或是你獨立的類別
            normalIds.push(layerId)
            return // 處理完 OSP 後直接跳過後續的 1K/5K 判斷
        }

        // 3. 原本的 1K / 5K 邏輯
        if (sourceLayer.includes('1K') || layerIdLower.includes('1k')) {
            layer.minzoom = 18
            layer1Kids.push(layerId)
        } 
        else if (sourceLayer.includes('5K') || layerIdLower.includes('5k')) {
            layer.minzoom = 15
            layer5Kids.push(layerId)
        } 
        else {
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

  // 2. 獨立載入並合併 Label Style 給雙版本
  try {
    const styLabelUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/styles/root.json'
    const [resLabel1, resLabel2] = await Promise.all([fetch(styLabelUrl), fetch(styLabelUrl)])
    
    const text1 = await resLabel1.text()
    const text2 = await resLabel2.text()

    const fixed1 = text1.replace(/\.\.\/\.\.\/|\.\.\/|\.\.\/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/')
    const fixed2 = text2.replace(/\.\.\/\.\.\/|\.\.\/|\.\.\/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/')

    const labelStyle1 = JSON.parse(fixed1)
    const labelStyle2 = JSON.parse(fixed2)

    if (mapStyleNormal) {
      mapStyleNormal.glyphs = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/fonts/{fontstack}/{range}.pbf'
      const sKey = Object.keys(labelStyle1.sources)[0] || 'esri'
      const sObj = labelStyle1.sources[sKey]
      if (sObj) {
        sObj.maxzoom = 15
        sObj.tiles = ['https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/tile/{z}/{y}/{x}.pbf']
        mapStyleNormal.sources['hk_label_norm'] = sObj
        if (labelStyle1.layers) {
          labelStyle1.layers.forEach(l => { l.source = 'hk_label_norm' })
        }
      }
      if (labelStyle1.layers) {
        mapStyleNormal.layers = [...mapStyleNormal.layers, ...labelStyle1.layers]
      }
    }

    if (mapStyleDebug) {
      mapStyleDebug.glyphs = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/fonts/{fontstack}/{range}.pbf'
      const sKey2 = Object.keys(labelStyle2.sources)[0] || 'esri'
      const sObj2 = labelStyle2.sources[sKey2]
      if (sObj2) {
        sObj2.maxzoom = 15
        sObj2.tiles = ['https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/tile/{z}/{y}/{x}.pbf']
        mapStyleDebug.sources['hk_label_dbg'] = sObj2
        if (labelStyle2.layers) {
          labelStyle2.layers.forEach(l => { l.source = 'hk_label_dbg' })
        }
      }
      if (labelStyle2.layers) {
        mapStyleDebug.layers = [...mapStyleDebug.layers, ...labelStyle2.layers]
      }
    }
  } catch (err) {
    console.error('❌ [Debug] Label Style 載入失敗:', err)
  }

  // 3. 建立圖層實例
  if (mapStyleNormal) {
    glLayerNormal = L.maplibreGL({ style: mapStyleNormal, maxZoom: 20, transformRequest: fontTransform })
  }
  if (mapStyleDebug) {
    glLayerDebug = L.maplibreGL({ style: mapStyleDebug, maxZoom: 20, transformRequest: fontTransform })
  }

  // 預設載入線上版 (N)
  if (glLayerNormal) {
    glLayerNormal.addTo(map)
    currentActiveLayer = glLayerNormal
    captureMapInstance(glLayerNormal)
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
  pointer-events: auto; /* 確保按鈕可點擊 */
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
.debug-box {
  background: #e8f4f8;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #bbe1fa;
}
.select-input {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #ccc;
  font-weight: bold;
  background: white;
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