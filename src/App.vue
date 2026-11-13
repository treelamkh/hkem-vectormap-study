<template>
  <div class="map-container">
    <div ref="mapContainer" id="map"></div>

    <!-- 控制面板 -->
    <div class="control-panel" :class="{ minimized: isPanelMinimized }">
      <!-- 頂部固定項目 -->
      <div class="panel-header">
        <div class="panel-title-row">
          <span class="panel-main-title">🗺️ 圖層與控制台</span>
          <button class="export-btn" @click="exportLayersToExcel">📊 匯出 lyrList </button>
          <button class="minimize-btn" @click="togglePanelMinimize">
            {{ isPanelMinimized ? '展開 ＋' : '最小化 －' }}
          </button>
        </div>

        <div v-show="!isPanelMinimized">
          <!-- Debug 本地 PBF Checkbox -->
          <div class="info-row checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" v-model="isDebugModeY" @change="switchMapSource" />
              <span>🛠️ Debug (使用本地 PBF)</span>
            </label>
          </div>

          <!-- 線上地圖選擇 Dropdown (當 Debug 未勾選時啟用) -->
          <div class="info-row" v-if="!isDebugModeY">
            <label>線上地圖來源:</label>
            <select v-model="onlineMapType" @change="switchMapSource">
              <option value="LandsD">LandsD (地政總署)</option>
              <option value="HKeM">HKeM (自訂 JSON Style)</option>
            </select>
          </div>

          <!-- 當前 Zoom -->
          <div class="info-row">
            <label>當前 Zoom:</label>
            <span class="zoom-badge">{{ currentZoom }}</span>
          </div>

          <!-- 手機陀螺儀旋轉開關 -->
          <div class="info-row">
            <label>陀螺儀旋轉:</label>
            <button class="gyro-btn" :class="{ active: isGyroActive }" @click="toggleGyroCompass">
              {{ isGyroActive ? '已開啟 (ON)' : '已關閉 (OFF)' }}
            </button>
          </div>

          <!-- 自訂 GeoJSON 獨立控制專區 -->
          <div class="custom-layers-section">
            <div class="section-title">📍 3DPN 點圖層控制</div>
            <div class="info-row custom-layer-row">
              <span class="layer-label">Leaflet 點圖層</span>
              <input type="checkbox" v-model="leafletGeoJsonVisible" @change="toggleLeafletGeoJson" />
            </div>
            <!-- 控制 Map Label 文字大小 -->
            <div class="info-row custom-layer-row slider-row">
              <span class="layer-label">Label 字體: {{ labelTextSize }}px</span>
              <input type="range" min="10" max="24" step="1" v-model.number="labelTextSize" @input="updateLabelTextSize" />
            </div>
          </div>

          <!-- 快速搜尋框 -->
          <div class="search-row">
            <input 
              type="text" 
              v-model="searchKeyword" 
              placeholder="🔍 快速搜尋 Layer Name..." 
              class="search-input"
            />
          </div>
        </div>
      </div>

      <template v-if="!isPanelMinimized">
        <hr />

        <!-- 動態按 Zoom Level 分類的圖層控制清單 -->
        <div class="layer-groups-container">
          <div v-for="(layers, zoomLevel) in filteredLayersByZoom" :key="zoomLevel" class="zoom-group-box">
            <div class="zoom-group-header">
              <span class="zoom-group-title">
                Zoom Level: >= {{ zoomLevel }} (共 {{ layers.length }} 個圖層)
              </span>
              <button class="toggle-btn" @click="toggleGroupCollapse(zoomLevel)">
                {{ collapsedGroups[zoomLevel] ? '展開 +' : '收起 -' }}
              </button>
            </div>
            
            <div class="zoom-content" v-show="!collapsedGroups[zoomLevel]">
              <div v-for="layer in layers" :key="layer.id" class="layer-item-row">
                <!-- 圖層名稱與類型 -->
                <div class="layer-info">
                  <input type="checkbox" v-model="layer.visible" @change="toggleLayerVisibility(layer)" title="On/Off" />
                  <span class="layer-name" :title="layer.id">{{ layer.id }}</span>
                </div>

                <!-- 獨立功能: 調整顏色 -->
                <div class="layer-controls" v-if="layer.hasColor">
                  <input type="color" v-model="layer.color" @change="updateLayerColor(layer)" title="調整顏色" />
                </div>

                <!-- 獨立功能: 調整大小 / 粗幼 -->
                <div class="layer-controls width-control" v-if="layer.hasWidth">
                  <input type="range" min="1" max="20" step="0.5" v-model.number="layer.width" @input="updateLayerWidth(layer)" title="調整粗幼" />
                  <span class="width-val">{{ layer.width }}px</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref, computed } from 'vue'
import * as XLSX from 'xlsx'

const currentZoom = ref(11)
const mapContainer = ref(null)

const isDebugModeY = ref(false)       // Checkbox: 是否使用本地 PBF
const onlineMapType = ref('LandsD')   // Dropdown: 線上地圖選項 ('LandsD' 或 'HKeM')

const searchKeyword = ref('')
const isGyroActive = ref(false)
const isPanelMinimized = ref(false)

// 預設關閉 Leaflet 點圖層
const leafletGeoJsonVisible = ref(false)

// 調整大小的響應式變數
const labelTextSize = ref(12)

// 記錄每個 Zoom 群組的收合狀態 (false 代表展開，true 代表收起)
const collapsedGroups = reactive({})

let mapInstance = null
let realMlMap = null

// 儲存三種不同的 MapLibre 圖層實例
let glLayerLandsD = null
let glLayerHkem = null
let glLayerDebug = null
let currentActiveLayer = null

// Leaflet 獨立 GeoJSON Layer 實例
let leafletGeoJsonLayer = null

// 儲存按 Zoom Level 分類的動態圖層清單
const dynamicLayersByZoom = ref({})

// 計算屬性：根據搜尋關鍵字即時過濾圖層
const filteredLayersByZoom = computed(() => {
  if (!searchKeyword.value.trim()) {
    return dynamicLayersByZoom.value
  }
  const keyword = searchKeyword.value.toLowerCase()
  const result = {}

  Object.keys(dynamicLayersByZoom.value).forEach(zoomLevel => {
    const matchedLayers = dynamicLayersByZoom.value[zoomLevel].filter(layer => 
      layer.id.toLowerCase().includes(keyword)
    )
    if (matchedLayers.length > 0) {
      result[zoomLevel] = matchedLayers
    }
  })
  return result
})

// 切換特定 Zoom 群組的收合/展開
const toggleGroupCollapse = (zoomLevel) => {
  collapsedGroups[zoomLevel] = !collapsedGroups[zoomLevel]
}

// 切換整個控制面板的最小化/展開
const togglePanelMinimize = () => {
  isPanelMinimized.value = !isPanelMinimized.value
}

// 1. 控制 Leaflet GeoJSON Layer 顯隱
const toggleLeafletGeoJson = () => {
  if (!mapInstance || !leafletGeoJsonLayer) return
  if (leafletGeoJsonVisible.value) {
    leafletGeoJsonLayer.addTo(mapInstance)
    leafletGeoJsonLayer.bringToFront()
  } else {
    mapInstance.removeLayer(leafletGeoJsonLayer)
  }
}

// 4. 即時調整 Map Label 字體大小
const updateLabelTextSize = () => {
  if (!realMlMap) return
  const style = realMlMap.getStyle()
  if (!style || !style.layers) return

  style.layers.forEach(layer => {
    if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
      try {
        realMlMap.setLayoutProperty(layer.id, 'text-size', labelTextSize.value)
      } catch (e) {
        // 忽略不支援 text-size 的圖層
      }
    }
  })
}

// 載入並初始化自訂 GeoJSON 資料
const initCustomGeoJsonLayers = async (map, mlMap) => {
  try {
    const basePath = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${basePath}3DPN_midpt_WGS84.geojson`)
    const geoJsonData = await res.json()

    const L = window.L

    if (leafletGeoJsonLayer && map.hasLayer(leafletGeoJsonLayer)) {
      map.removeLayer(leafletGeoJsonLayer)
    }
    leafletGeoJsonLayer = L.geoJSON(geoJsonData, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: '#ff7675',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        })
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties && feature.properties.name) {
          layer.bindPopup(`<b>3DPN Point</b><br>${feature.properties.name}`)
        }
      }
    })
    
    if (leafletGeoJsonVisible.value) {
      leafletGeoJsonLayer.addTo(map)
      leafletGeoJsonLayer.bringToFront()
    }

    console.log('✨ [GeoJson] 成功載入 3DPN 點圖層！')

  } catch (err) {
    console.error('❌ [GeoJson] 載入失敗:', err)
  }
}

// 批次載入與註冊 tlamp20、walk30、tlift40 圖示至 MapLibre 核心
const setupCustomIcons = (mlMap) => {
  if (!mlMap) return
  const basePath = import.meta.env.BASE_URL || '/'
  
  const icons = [
    { name: 'tlamp20', filename: 'tlamp20.png' },
    { name: 'walk30', filename: 'walk30.png' },
    { name: 'tlift40', filename: 'tlift40.png' }
  ]

  icons.forEach(icon => {
    const iconUrl = `${window.location.origin}${basePath}${icon.filename}`
    if (!mlMap.hasImage(icon.name)) {
      mlMap.loadImage(iconUrl, (error, image) => {
        if (error) {
          console.error(`❌ [Icon Load] 載入 ${icon.filename} 失敗:`, error)
          return
        }
        if (!mlMap.hasImage(icon.name)) {
          mlMap.addImage(icon.name, image)
          console.log(`🚦 [Icon Load] 成功註冊 ${icon.name} 至 MapLibre！`)
        }
      })
    }
  })
}

// 處理手機陀螺儀事件回調
const handleDeviceOrientation = (event) => {
  if (!realMlMap) return
  const alpha = event.alpha
  if (alpha !== null && alpha !== undefined) {
    const bearing = 360 - alpha
    realMlMap.rotateTo(bearing, { duration: 0 })
  }
}

// 啟動或關閉陀螺儀地圖旋轉
const toggleGyroCompass = async () => {
  if (isGyroActive.value) {
    window.removeEventListener('deviceorientation', handleDeviceOrientation)
    isGyroActive.value = false
    if (realMlMap) {
      realMlMap.rotateTo(0, { duration: 300 })
    }
  } else {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission()
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleDeviceOrientation)
          isGyroActive.value = true
        } else {
          alert('權限被拒絕，無法使用陀螺儀旋轉地圖。')
        }
      } catch (error) {
        console.error('❌ 請求陀螺儀權限失敗:', error)
      }
    } else if ('ondeviceorientation' in window) {
      window.addEventListener('deviceorientation', handleDeviceOrientation)
      isGyroActive.value = true
    } else {
      alert('您的瀏覽器或裝置不支援陀螺儀感測器。')
    }
  }
}

// 自動從 MapLibre 實例提取所有圖層並分類
const extractAndGroupLayers = () => {
  if (!realMlMap) return
  const style = realMlMap.getStyle()
  if (!style || !style.layers) return

  const groups = {}

  style.layers.forEach(layer => {
    const minZoom = layer.minzoom !== undefined ? layer.minzoom : 0
    if (!groups[minZoom]) {
      groups[minZoom] = []
    }

    const type = layer.type
    let defaultColor = '#3388ff'
    let defaultWidth = 2
    let hasColor = false
    let hasWidth = false

    if (layer.paint) {
      if (layer.paint['line-color']) { hasColor = true; defaultColor = layer.paint['line-color'] }
      else if (layer.paint['fill-color']) { hasColor = true; defaultColor = layer.paint['fill-color'] }
      else if (layer.paint['circle-color']) { hasColor = true; defaultColor = layer.paint['circle-color'] }

      if (layer.paint['line-width']) { hasWidth = true; defaultWidth = layer.paint['line-width'] }
      else if (layer.paint['circle-radius']) { hasWidth = true; defaultWidth = layer.paint['circle-radius'] }
    }

    groups[minZoom].push({
      id: layer.id,
      type: type,
      visible: realMlMap.getLayoutProperty(layer.id, 'visibility') !== 'none',
      color: typeof defaultColor === 'string' ? defaultColor : '#3388ff',
      width: typeof defaultWidth === 'number' ? defaultWidth : 2,
      hasColor: hasColor || type === 'line' || type === 'fill' || type === 'circle',
      hasWidth: hasWidth || type === 'line' || type === 'circle'
    })
  })

  dynamicLayersByZoom.value = groups
}

// 1. 切換圖層 On/Off
const toggleLayerVisibility = (layer) => {
  if (!realMlMap) return
  const visibility = layer.visible ? 'visible' : 'none'
  try {
    realMlMap.setLayoutProperty(layer.id, 'visibility', visibility)
  } catch (e) {
    console.warn(`切換圖層 ${layer.id} 顯隱失敗:`, e)
  }
}

// 2. 調整圖層顏色
const updateLayerColor = (layer) => {
  if (!realMlMap) return
  try {
    const prop = layer.type === 'fill' ? 'fill-color' : layer.type === 'circle' ? 'circle-color' : 'line-color'
    realMlMap.setPaintProperty(layer.id, prop, layer.color)
  } catch (e) {
    console.warn(`設定圖層 ${layer.id} 顏色失敗:`, e)
  }
}

// 3. 調整圖層大小 / 粗幼
const updateLayerWidth = (layer) => {
  if (!realMlMap) return
  try {
    const prop = layer.type === 'circle' ? 'circle-radius' : 'line-width'
    realMlMap.setPaintProperty(layer.id, prop, layer.width)
  } catch (e) {
    console.warn(`設定圖層 ${layer.id} 粗幼失敗:`, e)
  }
}

// 捕捉 MapLibre 實例並進行頂層層級排列
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

      setupCustomIcons(realMlMap)

      // 確保將 maplibre-root.json 內的圖層移到頂層渲染
      try {
        if (realMlMap.getLayer('PPISLAMP')) {
          realMlMap.moveLayer('PPISLAMP')
        }
        if (realMlMap.getLayer('PPISWALK')) {
          realMlMap.moveLayer('PPISWALK')
        }
        if (realMlMap.getLayer('PPISLIFT')) {
          realMlMap.moveLayer('PPISLIFT')
        }
      } catch (e) {
        console.warn('移動圖層失敗:', e)
      }

      initCustomGeoJsonLayers(mapInstance, realMlMap)
      extractAndGroupLayers()
    } else {
      setTimeout(checkInstance, 100)
    }
  }
  checkInstance()
}

// 統一的地圖來源切換函式
const switchMapSource = () => {
  if (!mapInstance) return

  if (currentActiveLayer && mapInstance.hasLayer(currentActiveLayer)) {
    mapInstance.removeLayer(currentActiveLayer)
  }

  if (isDebugModeY.value) {
    console.log('🛠️ [Map Switch] 切換至 Debug 模式 (本地 tiles pbf)')
    if (glLayerDebug) {
      glLayerDebug.addTo(mapInstance)
      currentActiveLayer = glLayerDebug
      captureMapInstance(glLayerDebug)
    }
  } else {
    if (onlineMapType.value === 'HKeM') {
      console.log('🌐 [Map Switch] 切換至線上 HKeM (讀取 public/config/maplibre-root.json)')
      if (glLayerHkem) {
        glLayerHkem.addTo(mapInstance)
        currentActiveLayer = glLayerHkem
        captureMapInstance(glLayerHkem)
      }
    } else {
      console.log('🌐 [Map Switch] 切換至線上 LandsD Map API')
      if (glLayerLandsD) {
        glLayerLandsD.addTo(mapInstance)
        currentActiveLayer = glLayerLandsD
        captureMapInstance(glLayerLandsD)
      }
    }
  }

  setTimeout(() => {
    if (realMlMap) {
      realMlMap.resize()
      extractAndGroupLayers()
    }
  }, 300)
}

const exportLayersToExcel = () => {
  if (!realMlMap) {
    alert('地圖尚未載入完成！')
    return
  }

  const style = realMlMap.getStyle()
  if (!style || !style.layers) return

  // 1. 準備「Layer 完整清單 & Paint 設定」工作表資料
  const layerDetails = style.layers.map((layer, index) => {
    const minZ = layer.minzoom !== undefined ? layer.minzoom : 0
    const maxZ = layer.maxzoom !== undefined ? layer.maxzoom : 24

    // 計算 Zoom 8 - 20 各自嘅可見狀態 (O = 顯示, - = 隱藏)
    const zoomMatrix = {}
    for (let z = 8; z <= 20; z++) {
      zoomMatrix[`Z${z}`] = (z >= minZ && z <= maxZ) ? 'O' : '-'
    }

    return {
      'Render Order': index + 1,
      'Layer ID': layer.id,
      'Data Type': layer.type,
      'Source': layer.source || '-',
      'Source Layer': layer['source-layer'] || '-',
      'Min Zoom': minZ,
      'Max Zoom': maxZ,
      ...zoomMatrix, // 展開 Z8 ~ Z20 矩陣
      'Filtering': layer.filter ? JSON.stringify(layer.filter) : '-',
      'Paint': layer.paint ? JSON.stringify(layer.paint) : '{}',
      'Layout': layer.layout ? JSON.stringify(layer.layout) : '{}'
    }
  })

  // 2. 準備「按 Zoom Level (8-20) 分組總覽」工作表資料
  const zoomSummary = []
  for (let z = 8; z <= 20; z++) {
    const activeLayers = style.layers.filter(l => {
      const minZ = l.minzoom !== undefined ? l.minzoom : 0
      const maxZ = l.maxzoom !== undefined ? l.maxzoom : 24
      return z >= minZ && z <= maxZ
    })

    activeLayers.forEach(l => {
      zoomSummary.push({
        'Zoom Level': z,
        'Layer ID': l.id,
        'Data Type': l.type,
        'Source Layer': l['source-layer'] || '-',
        'Paint': l.paint ? JSON.stringify(l.paint) : '{}'
      })
    })
  }

  // 3. 建立 Excel Workbook 並寫入兩個分頁 (Sheets)
  const wb = XLSX.utils.book_new()
  
  const wsDetails = XLSX.utils.json_to_sheet(layerDetails)
  const wsZoomSummary = XLSX.utils.json_to_sheet(zoomSummary)

  XLSX.utils.book_append_sheet(wb, wsDetails, 'Layer Configurations')
  XLSX.utils.book_append_sheet(wb, wsZoomSummary, 'Layers in Zoom Levels')

  // 4. 根據當前模式命名並觸發下載
  const modeName = isDebugModeY.value ? 'Debug_LocalPBF' : onlineMapType.value
  XLSX.writeFile(wb, `MapLayers_Spec_${modeName}.xlsx`)
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

  let mapStyleLandsD = null
  let mapStyleHkem = null
  let mapStyleDebug = null

  const basePath = import.meta.env.BASE_URL || '/'

  // 1. 載入 LandsD 原始線上 Style
  try {
    const styleUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/resources/styles/root.json'
    const res = await fetch(styleUrl)
    const textData = await res.text()
    const fixedText = textData.replace(/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/')
    mapStyleLandsD = JSON.parse(fixedText)

    if (mapStyleLandsD.sources) {
      Object.keys(mapStyleLandsD.sources).forEach(key => {
        if (mapStyleLandsD.sources[key].type === 'vector') {
          mapStyleLandsD.sources[key].maxzoom = 15
          mapStyleLandsD.sources[key].tiles = [
            'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/tile/{z}/{y}/{x}.pbf'
          ]
        }
      })
    }
  } catch (err) {
    console.error('❌ [Map Style] LandsD 載入失敗:', err)
  }

  // 2. 載入新建立的 public/config/maplibre-root.json 作為 HKeM 樣式
  try {
    const hkemJsonUrl = `${window.location.origin}${basePath}config/maplibre-root.json`
    const resHkem = await fetch(hkemJsonUrl)
    const hkemText = await resHkem.text()

    const fixedHkemText = hkemText.replace(/\.\.\/\.\.\/|\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/')
    mapStyleHkem = JSON.parse(fixedHkemText)

    if (mapStyleHkem.sources) {
      Object.keys(mapStyleHkem.sources).forEach(key => {
        if (mapStyleHkem.sources[key].type === 'vector') {
          mapStyleHkem.sources[key].maxzoom = 15
          mapStyleHkem.sources[key].tiles = [
            'https://eo-map-rr.hkemobility.gov.hk/map_pbf/COMBINED/{z}/{x}/{y}.pbf'
          ]
          delete mapStyleHkem.sources[key].bounds
        }
      })
    }
  } catch (err) {
    console.error('❌ [Map Style] 載入 public/config/maplibre-root.json 失敗:', err)
  }

  // 3. 建立 Debug Style (指向本地 tiles pbf，樣式結構與 HKeM 保持一致)
  try {
    if (mapStyleHkem) {
      mapStyleDebug = JSON.parse(JSON.stringify(mapStyleHkem))
      if (mapStyleDebug.sources) {
        Object.keys(mapStyleDebug.sources).forEach(key => {
          if (mapStyleDebug.sources[key].type === 'vector') {
            mapStyleDebug.sources[key].tiles = [
              `${window.location.origin}${basePath}tiles/{z}/{x}/{y}.pbf`
            ]
          }
        })
      }
    }
  } catch (err) {
    console.error('❌ [Map Style] Debug 樣式建立失敗:', err)
  }

  // 4. 獨立載入並合併 Label Style 給三種版本
  try {
    const styLabelUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/styles/root.json'
    const [resL1, resL2, resL3] = await Promise.all([fetch(styLabelUrl), fetch(styLabelUrl), fetch(styLabelUrl)])
    
    const [t1, t2, t3] = await Promise.all([resL1.text(), resL2.text(), resL3.text()])
    const fixText = (txt) => txt.replace(/\.\.\/\.\.\/|\.\.\/|\.\.\/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/')

    const label1 = JSON.parse(fixText(t1))
    const label2 = JSON.parse(fixText(t2))
    const label3 = JSON.parse(fixText(t3))

    const setupLabels = (mapStyle, labelStyle, labelSourceName) => {
      if (!mapStyle) return
      mapStyle.glyphs = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/fonts/{fontstack}/{range}.pbf'
      const sKey = Object.keys(labelStyle.sources)[0] || 'esri'
      const sObj = labelStyle.sources[sKey]
      if (sObj) {
        sObj.maxzoom = 15
        sObj.tiles = ['https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/tile/{z}/{y}/{x}.pbf']
        mapStyle.sources[labelSourceName] = sObj
        if (labelStyle.layers) {
          labelStyle.layers.forEach(l => { l.source = labelSourceName })
        }
      }
      if (labelStyle.layers) {
        mapStyle.layers = [...mapStyle.layers, ...labelStyle.layers]
      }
    }

    setupLabels(mapStyleLandsD, label1, 'hk_label_landsd')
    setupLabels(mapStyleHkem, label2, 'hk_label_hkem')
    setupLabels(mapStyleDebug, label3, 'hk_label_dbg')

  } catch (err) {
    console.error('❌ [Label Style] 載入失敗:', err)
  }

  // 5. 建立圖層實例
  if (mapStyleLandsD) {
    glLayerLandsD = L.maplibreGL({ style: mapStyleLandsD, maxZoom: 20, transformRequest: fontTransform })
  }
  if (mapStyleHkem) {
    glLayerHkem = L.maplibreGL({ style: mapStyleHkem, maxZoom: 20, transformRequest: fontTransform })
  }
  if (mapStyleDebug) {
    glLayerDebug = L.maplibreGL({ style: mapStyleDebug, maxZoom: 20, transformRequest: fontTransform })
  }

  // 預設載入 LandsD
  if (glLayerLandsD) {
    glLayerLandsD.addTo(map)
    currentActiveLayer = glLayerLandsD
    captureMapInstance(glLayerLandsD)
  }
})

onUnmounted(() => {
  window.removeEventListener('deviceorientation', handleDeviceOrientation)
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
  top: 10px;
  left: 10px;
  background: white;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-height: 85vh;
  width: 350px;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  font-family: sans-serif;
  transition: width 0.2s ease, padding 0.2s ease;
}
.control-panel.minimized {
  width: 180px;
  max-height: auto;
  padding: 8px 12px;
}
.panel-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: bold;
  font-size: 13px;
  color: #2c3e50;
}
.minimize-btn {
  background: #dfe4ea;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  color: #2f3640;
  font-weight: bold;
}
.minimize-btn:hover {
  background: #ced6e0;
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: bold;
}
.checkbox-row {
  justify-content: flex-start;
  background: #f8f9fa;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #2c3e50;
}
.zoom-badge {
  background: #34495e;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.gyro-btn {
  background: #f1f2f6;
  border: 1px solid #dcdde1;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  color: #2f3640;
  font-weight: bold;
}
.gyro-btn.active {
  background: #2ed573;
  color: white;
  border-color: #26af5f;
}
.custom-layers-section {
  background: #f1f2f6;
  padding: 8px;
  border-radius: 6px;
  margin-top: 4px;
  border: 1px solid #dfe4ea;
}
.section-title {
  font-size: 11px;
  color: #2c3e50;
  margin-bottom: 4px;
  font-weight: bold;
}
.custom-layer-row {
  font-size: 11px;
  font-weight: normal;
  margin-top: 4px;
}
.slider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.slider-row input[type="range"] {
  width: 120px;
}
.layer-label {
  color: #333;
}
.search-row {
  margin-top: 4px;
}
.search-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #dcdde1;
  border-radius: 4px;
  font-size: 12px;
  box-sizing: border-box;
}
.layer-groups-container {
  overflow-y: auto;
  flex: 1;
  margin-top: 8px;
  padding-right: 4px;
}
.zoom-group-box {
  margin-bottom: 10px;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}
.zoom-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 4px;
}
.zoom-group-title {
  font-weight: bold;
  font-size: 11px;
  color: #2c3e50;
}
.toggle-btn {
  background: #dfe4ea;
  border: none;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
  color: #2f3640;
}
.toggle-btn:hover {
  background: #ced6e0;
}
.layer-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 6px;
}
.layer-info {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 150px;
  overflow: hidden;
  white-space: nowrap;
}
.layer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layer-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.width-control {
  gap: 2px;
}
.width-control input[type="range"] {
  width: 50px;
}
.width-val {
  font-size: 10px;
  width: 25px;
  text-align: right;
}
</style>