<template>
  <div class="map-container">
    <div ref="mapContainer" id="map"></div>

    <!-- 控制面板 -->
    <div class="control-panel" :class="{ minimized: isPanelMinimized }">
      <!-- 頂部固定項目 -->
      <div class="panel-header">
        <div class="panel-title-row">
          <span class="panel-main-title">🗺️ 圖層與控制台</span>
          <button class="minimize-btn" @click="togglePanelMinimize">
            {{ isPanelMinimized ? '展開 ＋' : '最小化 －' }}
          </button>
        </div>

        <div v-show="!isPanelMinimized">
          <div class="info-row">
            <label>當前 Zoom:</label>
            <span class="zoom-badge">{{ currentZoom }}</span>
          </div>
          <div class="info-row">
            <label>Debug Mode:</label>
            <select v-model="debugMode" @change="switchDebugMode">
              <option value="N">N (線上 API)</option>
              <option value="Y">Y (本地 tiles pbf)</option>
            </select>
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
            <div class="info-row custom-layer-row">
              <span class="layer-label">MapLibre 點圖層</span>
              <input type="checkbox" v-model="maplibreGeoJsonVisible" @change="toggleMaplibreGeoJson" />
            </div>
            <!-- 控制 tlamp20.png Icon 大小 -->
            <div class="info-row custom-layer-row slider-row">
              <span class="layer-label">紅綠燈大小: {{ tlampIconSize }}x</span>
              <input type="range" min="0.1" max="1.5" step="0.05" v-model.number="tlampIconSize" @input="updateTlampIconSize" />
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

const currentZoom = ref(11)
const mapContainer = ref(null)
const debugMode = ref('N')
const searchKeyword = ref('')
const isGyroActive = ref(false)
const isPanelMinimized = ref(false)

// 預設關閉兩個 3DPN 點圖層
const leafletGeoJsonVisible = ref(false)
const maplibreGeoJsonVisible = ref(false)

// 調整大小的響應式變數
const tlampIconSize = ref(0.35)
const labelTextSize = ref(12)

// 記錄每個 Zoom 群組的收合狀態 (false 代表展開，true 代表收起)
const collapsedGroups = reactive({})

let mapInstance = null
let realMlMap = null
let glLayerNormal = null
let glLayerDebug = null
let currentActiveLayer = null

// Leaflet 獨立 GeoJSON Layer 實例
let leafletGeoJsonLayer = null

// OSP 圖層的控制狀態
const ospConfig = reactive({
  visible: true,
  color: '#d3d3d3',
  width: 2
})

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

// 2. 控制 MapLibre GeoJSON Layer 顯隱
const toggleMaplibreGeoJson = () => {
  if (!realMlMap) return
  const layerId = 'custom-3dpn-maplibre-layer'
  if (realMlMap.getLayer(layerId)) {
    const visibility = maplibreGeoJsonVisible.value ? 'visible' : 'none'
    realMlMap.setLayoutProperty(layerId, 'visibility', visibility)
  }
}

// 3. 即時調整 tlamp20.png Icon 大小
const updateTlampIconSize = () => {
  if (!realMlMap) return
  const layerId = 'pedestrian-point-tlamp-layer'
  if (realMlMap.getLayer(layerId)) {
    realMlMap.setLayoutProperty(layerId, 'icon-size', tlampIconSize.value)
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

    const sourceId = 'custom-3dpn-source'
    const layerId = 'custom-3dpn-maplibre-layer'

    if (mlMap.getSource(sourceId)) {
      mlMap.getSource(sourceId).setData(geoJsonData)
    } else {
      mlMap.addSource(sourceId, {
        type: 'geojson',
        data: geoJsonData
      })
    }

    if (!mlMap.getLayer(layerId)) {
      mlMap.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        minzoom: 0,
        maxzoom: 24,
        layout: {
          visibility: maplibreGeoJsonVisible.value ? 'visible' : 'none'
        },
        paint: {
          'circle-radius': 5,
          'circle-color': '#0984e3',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff'
        }
      })
    }

    mlMap.moveLayer(layerId)
    console.log('✨ [GeoJson] 成功載入 3DPN 點圖層！')

  } catch (err) {
    console.error('❌ [GeoJson] 載入失敗:', err)
  }
}

// 載入與註冊 tlamp20.png 圖示至 MapLibre 核心
const setupCustomIcons = (mlMap) => {
  if (!mlMap) return
  const basePath = import.meta.env.BASE_URL || '/'
  const iconUrl = `${window.location.origin}${basePath}tlamp20.png`

  if (!mlMap.hasImage('tlamp20-icon')) {
    mlMap.loadImage(iconUrl, (error, image) => {
      if (error) {
        console.error('❌ [Icon Load] 載入 tlamp20.png 失敗:', error)
        return
      }
      if (!mlMap.hasImage('tlamp20-icon')) {
        mlMap.addImage('tlamp20-icon', image)
        console.log('🚦 [Icon Load] 成功註冊 tlamp20-icon (PNG) 至 MapLibre！')
      }
    })
  }
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

      try {
        if (realMlMap.getLayer('td-polygon-layer')) {
          realMlMap.moveLayer('td-polygon-layer')
        }
        if (realMlMap.getLayer('osp-mark-line-layer')) {
          realMlMap.moveLayer('osp-mark-line-layer')
        }
        if (realMlMap.getLayer('pedestrian-point-tlamp-layer')) {
          realMlMap.moveLayer('pedestrian-point-tlamp-layer')
        }
        if (realMlMap.getLayer('custom-3dpn-maplibre-layer')) {
          realMlMap.moveLayer('custom-3dpn-maplibre-layer')
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

// 切換 Debug Mode
const switchDebugMode = () => {
  if (!mapInstance) return

  if (currentActiveLayer && mapInstance.hasLayer(currentActiveLayer)) {
    mapInstance.removeLayer(currentActiveLayer)
  }

  if (debugMode.value === 'Y') {
    if (glLayerDebug) {
      glLayerDebug.addTo(mapInstance)
      currentActiveLayer = glLayerDebug
      captureMapInstance(glLayerDebug)
    }
  } else {
    if (glLayerNormal) {
      glLayerNormal.addTo(mapInstance)
      currentActiveLayer = glLayerNormal
      captureMapInstance(glLayerNormal)
    }
  }

  setTimeout(() => {
    if (realMlMap) {
      realMlMap.resize()
      extractAndGroupLayers()
    }
  }, 300)
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

  let mapStyleNormal = null
  let mapStyleDebug = null

  // 1. 載入線上 Normal Style
  try {
    const styleUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/resources/styles/root.json'
    const res = await fetch(styleUrl)
    const textData = await res.text()
    const fixedText = textData.replace(/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/')
    mapStyleNormal = JSON.parse(fixedText)

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
  } catch (err) {
    console.error('❌ [Debug] Basemap Normal 載入失敗:', err)
  }

  // 2. 建立 Debug Style
  try {
    if (mapStyleNormal) {
      mapStyleDebug = JSON.parse(JSON.stringify(mapStyleNormal))
      const basePath = import.meta.env.BASE_URL || '/'

      if (mapStyleDebug.sources) {
        Object.keys(mapStyleDebug.sources).forEach(key => {
          if (mapStyleDebug.sources[key].type === 'vector') {
            mapStyleDebug.sources[key].maxzoom = 15
            mapStyleDebug.sources[key].tiles = [
              `${window.location.origin}${basePath}tiles/{z}/{x}/{y}.pbf`
            ]
            delete mapStyleDebug.sources[key].bounds
          }
        })

        const vKey = Object.keys(mapStyleDebug.sources).find(k => mapStyleDebug.sources[k].type === 'vector') || 'esri'
        
        if (mapStyleDebug.layers) {
          // A. 注入 OSP 線圖層 (設定 minzoom: 16)
          const hasOsp = mapStyleDebug.layers.some(l => l.id === 'osp-mark-line-layer')
          if (!hasOsp) {
            mapStyleDebug.layers.push({
              id: 'osp-mark-line-layer',
              type: 'line',
              source: vKey,
              'source-layer': 'OSP_MARK_LINE',
              minzoom: 16, // 改為 16 級才顯示
              maxzoom: 24,
              paint: {
                'line-color': '#d3d3d3',
                'line-width': 2
              }
            })
          }

          // B. 注入 TD_Polygon 面圖層 (維持預設 0 級或依需求)
          const hasTdPoly = mapStyleDebug.layers.some(l => l.id === 'td-polygon-layer')
          if (!hasTdPoly) {
            mapStyleDebug.layers.push({
              id: 'td-polygon-layer',
              type: 'fill',
              source: vKey,
              'source-layer': 'TD_Polygon',
              minzoom: 0,
              maxzoom: 24,
              paint: {
                'fill-color': '#ffdf6a',
                'fill-opacity': 0.6
              }
            })
          }

          // C. 注入 PedestrianPoint 紅綠燈圖層 (設定 minzoom: 16)
          const hasPedPoint = mapStyleDebug.layers.some(l => l.id === 'pedestrian-point-tlamp-layer')
          if (!hasPedPoint) {
            mapStyleDebug.layers.push({
              id: 'pedestrian-point-tlamp-layer',
              type: 'symbol',
              source: vKey,
              'source-layer': 'PedestrianPoint',
              filter: ['==', ['get', 'FeatureType'], 30],
              minzoom: 16, // 改為 16 級才顯示
              maxzoom: 24,
              layout: {
                'icon-image': 'tlamp20-icon',
                'icon-size': tlampIconSize.value,
                'icon-allow-overlap': true
              }
            })
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ [Debug] 建立 Debug Style 失敗:', err)
  }

  // 3. 獨立載入並合併 Label Style 給雙版本
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

  // 4. 建立圖層實例
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