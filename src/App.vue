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

  // 初始化時立即同步一次 Zoom Level
  currentZoom.value = Number(map.getZoom().toFixed(1))

  let mapStyle = null

  try {
    const styleUrl = 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/resources/styles/root.json'
    const res = await fetch(styleUrl)
    const textData = await res.text()

    // 2. 修正相對路徑
    const fixedText = textData.replace(/\.\.\/\.\.\//g, 'https://mapapi.hkmapservice.gov.hk/gs/api/v1.0.0/vt/basemap/WGS84/')
    mapStyle = JSON.parse(fixedText)

    // 3. 設定 Source 級別
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

    // 4. 針對 5K (minzoom: 15) 與 1K (minzoom: 18) 進行分級與圖層排序
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
    console.error('Failed to load map style:', err)
  }

  // 5. 建立 MapLibre 底圖圖層
  const glLayer = L.maplibreGL({
    style: mapStyle,
    maxZoom: 20,
    transformRequest: (url, resourceType) => {
      let reqUrl = url
      if (reqUrl && reqUrl.includes('/fonts/')) {
        reqUrl = reqUrl.replace(/Arial%20Regular/g, 'Noto%20Sans%20Regular')
                     .replace(/Arial Regular/g, 'Noto Sans Regular')
                     .replace(/Arial%20Bold/g, 'Noto%20Sans%20Bold')
                     .replace(/Arial Bold/g, 'Noto Sans Bold')
                     .replace(/Arial/g, 'Noto%20Sans%20Regular')
      }
      return { url: reqUrl }
    }
  })

  glLayer.addTo(map)

  // 6. 載入並管理 GeoJSON 圖層 (結合 Vite base 路徑，避免 GitHub Pages 404)
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
      currentZoom.value = Number(zoom.toFixed(1))

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

    // 隨時監聽地圖縮放事件
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