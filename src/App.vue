<template>
  <div class="map-container">
    <div ref="mapContainer" id="map"></div>
    <div class="zoom-info">
      Current Zoom Level: {{ currentZoom }}
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const currentZoom = ref(11)
const mapContainer = ref(null)

onMounted(async () => {
  if (!mapContainer.value) return

  const L = window.L
  if (!L) return

  // 1. 初始化 Leaflet 地圖
  const map = L.map(mapContainer.value, {
    center: [22.3193, 114.1694],
    zoom: 11,
    minZoom: 8,
    maxZoom: 20,
    zoomSnap: 0.1,
    zoomDelta: 0.1,
    fadeAnimation: false
  })

  // 即時更新 Zoom Level 數值
  const updateZoom = () => {
    currentZoom.value = Number(map.getZoom().toFixed(1))
  }
  updateZoom()
  map.on('zoom', updateZoom)
  map.on('zoomend', updateZoom)

  let mapStyle = null

  // 2. 載入並處理底圖 Style (Basemap)
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

    // 針對底圖進行 5K / 1K 分級，並濾掉底圖內建標籤
    if (mapStyle.layers) {
      const normalLayers = []
      const layer5K = []
      const layer1K = []
      mapStyle.layers.forEach(layer => {
        const sourceLayer = (layer['source-layer'] || '').toUpperCase()
        const layerId = (layer.id || '').toLowerCase()
        if (layerId.includes('label') || layerId.includes('text') || layer.type === 'symbol') {
          return
        }
        if (sourceLayer.includes('1K')) {
          layer.minzoom = 18
          layer1K.push(layer)
        } else if (sourceLayer.includes('5K')) {
          layer.minzoom = 15
          layer5K.push(layer)
        } else {
          normalLayers.push(layer)
        }
      })
      mapStyle.layers = [...normalLayers, ...layer5K, ...layer1K]
    }
  } catch (err) {
    console.error('❌ [Basemap] 載入失敗:', err)
  }

  // 3. 載入 Label Style 並以獨立的 source ('hk_label') 合併進 mapStyle
  try {
    const styLabelUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/styles/root.json'
    const resLabel = await fetch(styLabelUrl)
    const textLabelData = await resLabel.text()
    const fixedLabelText = textLabelData.replace(/\.\.\/\.\.\/|\.\.\/|\.\.\/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/')
    const mapLabelStyle = JSON.parse(fixedLabelText)

    // 設定合法的 glyphs
    mapStyle.glyphs = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/resources/fonts/{fontstack}/{range}.pbf'

    // ★ 關鍵修正：將 Label 的 source 命名為獨立的 'hk_label'，避免覆蓋底圖的 source
    if (mapLabelStyle.sources) {
      const labelSourceKey = Object.keys(mapLabelStyle.sources)[0] || 'esri'
      const labelSourceObj = mapLabelStyle.sources[labelSourceKey]
      
      if (labelSourceObj) {
        labelSourceObj.maxzoom = 15
        labelSourceObj.tiles = [
          'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/label/hk/tc/WGS84/tile/{z}/{y}/{x}.pbf'
        ]
        // 註冊到 mapStyle 中
        mapStyle.sources['hk_label'] = labelSourceObj

        // 將所有 label layer 的 source 指向這個新的 'hk_label'
        if (mapLabelStyle.layers) {
          mapLabelStyle.layers.forEach(layer => {
            layer.source = 'hk_label'
          })
        }
      }
    }

    // 將 Label 的 layers 串接到最尾端（確保畫在最上層）
    if (mapLabelStyle.layers && mapStyle.layers) {
      mapStyle.layers = [...mapStyle.layers, ...mapLabelStyle.layers]
    }
  } catch (err) {
    console.error('❌ [Label Style Merge] 失敗:', err)
  }

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

  // 4. 建立單一高效的 MapLibre 合併圖層
  if (mapStyle) {
    const glLayer = L.maplibreGL({
      style: mapStyle,
      maxZoom: 20,
      transformRequest: fontTransform
    })
    glLayer.addTo(map)
  }

  // 5. 載入並管理 GeoJSON 點位圖層 (minzoom >= 18)
  try {
    const baseUrl = import.meta.env.BASE_URL || '/'
    
    const customIcon = L.icon({
      iconUrl: `${baseUrl}tlamp20.svg`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -8]
    })

    const geoJsonRes = await fetch(`${baseUrl}3DPN_midpt_WGS84.geojson`)
    const geoJsonData = await geoJsonRes.json()

    const tlampLayer = L.geoJSON(geoJsonData, {
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng, { icon: customIcon })
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          const props = feature.properties
          const popupContent = Object.keys(props)
            .map(key => `<b>${key}:</b> ${props[key]}`)
            .join('<br>')
          layer.bindPopup(popupContent)
        }
      }
    })

    const updateGeoJsonVisibility = () => {
      const zoom = map.getZoom()
      if (zoom >= 18) {
        if (!map.hasLayer(tlampLayer)) {
          tlampLayer.addTo(map)
        }
      } else {
        if (map.hasLayer(tlampLayer)) {
          map.removeLayer(tlampLayer)
        }
      }
    }

    updateGeoJsonVisibility()
    map.on('zoom', updateGeoJsonVisibility)
    map.on('zoomend', updateGeoJsonVisibility)

  } catch (geoJsonErr) {
    console.error('Failed to load 3DPN GeoJSON or Icon:', geoJsonErr)
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

.zoom-info {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.9);
  padding: 8px 12px;
  border-radius: 4px;
  font-weight: bold;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  font-family: sans-serif;
}
</style>