<template>
  <header class="app-header">
    <div class="app-brand">
      <span class="app-mark" aria-hidden="true"></span>
      <h1 class="app-title">巴尔喀什湖流域农业时空智能平台</h1>
    </div>
    <nav class="app-menu">
      <button
        v-for="item in items"
        :key="item.name"
        class="app-menu-item"
        :class="{ active: isActive(item.name) }"
        :title="item.label"
        :aria-expanded="item.name === 'timeSeriesData' ? timePanelOpen : undefined"
        @click="onMenuClick(item.name)"
      >{{ item.label }}</button>
    </nav>

    <section
      v-if="timePanelOpen"
      class="ts-panel"
      aria-label="时空数据图层"
      @click.stop
    >
      <header class="ts-panel-head">
        <div>
          <p class="ts-eyebrow">BALKHASH BASIN · DATA LAYERS</p>
          <h2>时空数据</h2>
        </div>
        <div class="ts-panel-actions">
          <button class="ts-collapse" type="button" :title="panelCollapsed ? '展开面板' : '收纳面板'" :aria-label="panelCollapsed ? '展开面板' : '收纳面板'" :aria-expanded="!panelCollapsed" @click="panelCollapsed = !panelCollapsed">{{ panelCollapsed ? '⌄' : '⌃' }}</button>
          <button class="ts-close" type="button" aria-label="关闭时空数据面板" @click="timePanelOpen = false">×</button>
        </div>
      </header>

      <div v-show="!panelCollapsed" class="ts-panel-content">
      <div class="ts-period">
        <label>
          <span>年份</span>
          <select v-model="selectedYear" aria-label="选择年份" @change="clampSelectedMonth">
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
        </label>
        <label>
          <span>月份</span>
          <select v-model="selectedMonth" aria-label="选择月份">
            <option v-for="month in 12" :key="month" :value="String(month).padStart(2, '0')" :disabled="Number(selectedYear) === 2026 && month > 8">{{ month }} 月</option>
          </select>
        </label>
      </div>

      <div class="ts-tabs" role="tablist" aria-label="数据类别">
        <button
          v-for="group in groups"
          :key="group.id"
          class="ts-tab"
          :class="{ active: activeGroup === group.id }"
          type="button"
          role="tab"
          :aria-selected="activeGroup === group.id"
          @click="activeGroup = group.id"
        >{{ group.label }}</button>
      </div>

      <div class="ts-list-toolbar">
        <span>数据图层</span>
        <button v-if="currentColorLayerIds.length" type="button" @click="toggleAllMapColors">{{ allMapColorsVisible ? '一键隐藏地图色块' : '一键显示地图色块' }}</button>
      </div>
      <div class="ts-layer-list">
        <div v-for="layer in currentGroup.layers" :key="layer.id" class="ts-layer-entry">
          <label class="ts-layer-row">
            <input type="checkbox" :checked="selectedLayers[layer.id] || false" @change="toggleLayer(layer, $event.target.checked)">
            <span class="ts-layer-symbol" :class="layer.kind"></span>
            <span class="ts-layer-name">{{ layer.label }}</span>
            <span class="ts-layer-meta">{{ layer.meta }}</span>
          </label>
          <button
            v-if="colorLayerIds.includes(layer.id)"
            type="button"
            class="ts-color-toggle"
            :class="{ open: mapColorVisible[layer.id] !== false }"
            :title="mapColorVisible[layer.id] === false ? '显示地图上的该数据色块' : '隐藏地图上的该数据色块'"
            :aria-label="mapColorVisible[layer.id] === false ? `显示${layer.label}地图色块` : `隐藏${layer.label}地图色块`"
            :aria-pressed="mapColorVisible[layer.id] !== false"
            @click="toggleMapColor(layer.id)"
          ><svg class="ts-visibility-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s2.8-5 8-5 8 5 8 5-2.8 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2.3"/><path v-if="mapColorVisible[layer.id] === false" d="m3 17 14-14"/></svg></button>
        </div>
      </div>

      <div v-if="currentLegendLayers.length" class="ts-legend">
        <h3>图例与注记</h3>
        <div v-for="layer in currentLegendLayers" :key="layer.id" class="ts-legend-row">
          <div class="ts-legend-name"><span class="ts-legend-swatch" :class="legendDefinitions[layer.id].kind"></span>{{ layer.label }}</div>
          <div v-if="legendDefinitions[layer.id].gradient">
            <div class="ts-legend-scale" :style="{ background: legendDefinitions[layer.id].gradient }"></div>
            <div class="ts-legend-labels"><span v-for="label in legendDefinitions[layer.id].labels" :key="label">{{ label }}</span></div>
          </div>
          <span v-else class="ts-legend-note">{{ legendDefinitions[layer.id].note }}</span>
        </div>
      </div>

      <div class="ts-fetch-state" :class="activeLayerState" role="status">
        <span class="ts-state-dot" aria-hidden="true"></span>
        <div>
          <strong>{{ activeLayerState === 'error' ? '数据获取失败' : activeLayerState === 'ready' ? '数据已加载' : activeLayerState === 'loading' ? '正在加载数据' : '选择图层以显示数据' }}</strong>
          <p>{{ fetchMessage }}</p>
        </div>
      </div>

      <p class="ts-preview-note">影像：Copernicus Sentinel / Microsoft Planetary Computer；气象：NASA POWER / MERRA-2；矢量与地形：本地数据包</p>
      </div>
    </section>

    <div v-if="timePanelOpen && temporalHoverInfo" class="ts-map-tooltip" :style="hoverTooltipStyle">
      <strong>{{ temporalHoverInfo.title }}</strong>
      <span v-for="item in temporalHoverInfo.items" :key="item.id"><b>{{ item.label }}</b>{{ item.value }}</span>
    </div>
  </header>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import useMapStore from '@/stores/map'

const route = useRoute()
const router = useRouter()
const mapStore = useMapStore()
const { temporalYear, temporalMonth, temporalLayerStatus, temporalHoverInfo } = storeToRefs(mapStore)

const items = [
  { name: 'timeSeriesData', label: '时空数据' },
  { name: 'agriParcel', label: '农业地块' },
  { name: 'cropClassification', label: '作物结构' },
  { name: 'cropWaterRequirement', label: '水资源消耗' }
]

const groups = [
  {
    id: 'imagery',
    label: '遥感影像',
    layers: [
      { id: 'sentinel2', label: 'Sentinel-2 真彩色', meta: '夏季多景拼接', kind: 'imagery' },
      { id: 'sentinel1', label: 'Sentinel-1 雷达', meta: 'VV 极化拼接', kind: 'radar' }
    ]
  },
  {
    id: 'weather',
    label: '气象数据',
    layers: [
      { id: 'temperature', label: '2 米气温', meta: '°C', kind: 'temperature' },
      { id: 'precipitation', label: '月降水量', meta: 'mm/月', kind: 'precipitation' }
    ]
  },
  {
    id: 'base',
    label: '基础图层',
    layers: [
      { id: 'rivers', label: '河流', meta: '矢量', kind: 'river' },
      { id: 'lakes', label: '湖泊', meta: '矢量', kind: 'lake' },
      { id: 'mountains', label: '山系与高地', meta: '矢量', kind: 'terrain' },
      { id: 'boundaries', label: '国家与省级边界', meta: '矢量', kind: 'boundary' },
      { id: 'elevation', label: '高程', meta: '栅格', kind: 'elevation' },
      { id: 'slope', label: '坡度', meta: '栅格', kind: 'slope' }
    ]
  }
]

const timePanelOpen = ref(route.name === 'timeSeriesData')
const panelCollapsed = ref(false)
const activeGroup = ref('imagery')
const selectedYear = ref(String(temporalYear.value))
const selectedMonth = ref(String(temporalMonth.value).padStart(2, '0'))
const selectedLayers = reactive({})
const mapColorVisible = reactive({})
const colorLayerIds = ['temperature', 'precipitation', 'mountains', 'elevation', 'slope']
const currentGroup = computed(() => groups.find(group => group.id === activeGroup.value) || groups[0])
const activeLayer = computed(() => currentGroup.value.layers.find(layer => selectedLayers[layer.id]))
const activeLayerState = computed(() => activeLayer.value ? (temporalLayerStatus.value[activeLayer.value.id] || 'loading') : 'idle')
const legendDefinitions = {
  temperature: {kind:'temperature', gradient:'linear-gradient(90deg,#3155a5,#479bc2,#91c994,#f0d56a,#e87946,#a83238)', labels:['-25°','-15°','-5°','5°','15°','25°','35°C']},
  precipitation: {kind:'precipitation', gradient:'linear-gradient(90deg,#f6f2c1,#c5df9b,#68b7a3,#4380b8,#44377b)', labels:['0','40','80','120','160','200 mm']},
  elevation: {kind:'elevation', gradient:'linear-gradient(90deg,#2d6d39,#73a84b,#c5c96e,#d89c6e,#fff5e9)', labels:['0','1250','2500','3750','5000+ m']},
  slope: {kind:'slope', gradient:'linear-gradient(90deg,#fffde8,#f5d88c,#eea24d,#bc5125)', labels:['0°','15°','30°','45+°']},
  rivers: {kind:'river', note:'蓝色线 · 河流'},
  lakes: {kind:'lake', note:'蓝色面 · 湖泊'},
  mountains: {kind:'terrain', note:'橙色面 · 山系与高地'},
  boundaries: {kind:'boundary', note:'红色实线 · 国家边界；橙色虚线 · 省级边界'}
}
const currentColorLayerIds = computed(() => currentGroup.value.layers
  .filter(layer => colorLayerIds.includes(layer.id))
  .map(layer => layer.id))
const currentLegendLayers = computed(() => currentGroup.value.layers
  .filter(layer => selectedLayers[layer.id] && legendDefinitions[layer.id]))
const allMapColorsVisible = computed(() => currentColorLayerIds.value.length > 0 && currentColorLayerIds.value.every(id => mapColorVisible[id] !== false))
const hoverTooltipStyle = computed(() => {
  if (!temporalHoverInfo.value) return {}
  return {
    left: `${Math.min(temporalHoverInfo.value.left + 14, window.innerWidth - 250)}px`,
    top: `${Math.min(temporalHoverInfo.value.top + 14, window.innerHeight - 180)}px`
  }
})

const fetchMessage = computed(() => {
  if (!activeLayer.value) return '勾选上方图层即可叠加到地图。'
  if (activeLayerState.value === 'error') return '请检查本地数据文件或在线影像服务连接。'
  if (activeLayer.value.id === 'sentinel1' || activeLayer.value.id === 'sentinel2') return `${selectedYear.value} 年 6—9 月多景拼接影像，日期滑块按年份切换。`
  if (activeLayer.value.id === 'temperature' || activeLayer.value.id === 'precipitation') return `${selectedYear.value} 年 ${Number(selectedMonth.value)} 月数据，日期滑块按年月切换。`
  return '静态地理要素，不随时间变化。'
})

watch([selectedYear, selectedMonth], ([year, month]) => {
  mapStore.setTemporalPeriod({ year, month })
})
watch([temporalYear, temporalMonth], ([year, month]) => {
  selectedYear.value = String(year)
  selectedMonth.value = String(month).padStart(2, '0')
})
watch(activeGroup, group => mapStore.setTemporalHoverGroup(group), { immediate: true })

watch(() => route.name, name => {
  timePanelOpen.value = name === 'timeSeriesData'
})

const isActive = name => name === 'timeSeriesData' ? (timePanelOpen.value || route.name === name) : route.name === name

function onMenuClick(name) {
  if (name === 'timeSeriesData') {
    timePanelOpen.value = true
    if (route.name !== name) router.push({ name })
    return
  }

  timePanelOpen.value = false
  if (route.name !== name) router.push({ name })
}

function toggleLayer(layer, visible) {
  selectedLayers[layer.id] = visible
  mapStore.setTemporalLayer(layer.id, visible)
  if (visible && colorLayerIds.includes(layer.id)) {
    mapColorVisible[layer.id] = true
    mapStore.setTemporalLayerColorVisibility(layer.id, true)
  }
}

function toggleMapColor(id) {
  const visible = mapColorVisible[id] === false
  mapColorVisible[id] = visible
  mapStore.setTemporalLayerColorVisibility(id, visible)
}

function toggleAllMapColors() {
  const visible = !allMapColorsVisible.value
  currentColorLayerIds.value.forEach(id => {
    mapColorVisible[id] = visible
    mapStore.setTemporalLayerColorVisibility(id, visible)
  })
}

function clampSelectedMonth() {
  if (Number(selectedYear.value) === 2026 && Number(selectedMonth.value) > 8) selectedMonth.value = '08'
}
</script>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1200;
  pointer-events: auto;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 22px;
  box-sizing: border-box;
  background-image: linear-gradient(180deg, #ffffff 0%, #f6faff 100%);
  border-bottom: 1px solid #e2ecf8;
  box-shadow: 0 2px 10px rgba(18, 51, 107, 0.07);
}

.app-header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background-image: linear-gradient(90deg, #1a73e8 0%, #58a6ff 38%, rgba(26, 115, 232, 0) 100%);
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-mark {
  flex: 0 0 auto;
  width: 5px;
  height: 22px;
  border-radius: 3px;
  background-image: linear-gradient(180deg, #1a73e8, #63a8fb);
}

.app-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1.2px;
  color: #12336b;
}

.app-menu {
  flex: 0 0 auto;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-menu-item {
  position: relative;
  padding: 8px 16px;
  font-family: inherit;
  font-size: 14px;
  white-space: nowrap;
  color: #1a56c4;
  background-color: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.app-menu-item:hover {
  background-color: #e8f1fd;
}

.app-menu-item.active {
  font-weight: 600;
  color: #ffffff;
  background-image: linear-gradient(135deg, #1a73e8, #3f8ef5);
  box-shadow: 0 2px 8px rgba(26, 115, 232, 0.35);
}

.ts-panel {
  position: fixed;
  top: 112px;
  right: 20px;
  z-index: 1300;
  width: min(310px, calc(100vw - 32px));
  max-height: calc(100vh - 138px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  color: #22303f;
  background: #ffffff;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  font-size: 12px;
}

.ts-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 13px 14px 10px;
  flex: 0 0 auto;
}

.ts-panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ts-collapse {
  padding: 5px 8px;
  border: 1px solid #d5e2f2;
  border-radius: 5px;
  background: #f6f9fd;
  color: #1a56c4;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.ts-panel-content {
  min-height: 0;
  overflow-y: auto;
}

.ts-eyebrow {
  margin: 0 0 4px;
  color: #8494a8;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .12em;
}

.ts-panel-head h2 {
  margin: 0;
  color: #22303f;
  font-size: 17px;
  font-weight: 650;
}

.ts-close {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: #eef4fd;
  color: #1a56c4;
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
}

.ts-period {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 14px 11px;
}

.ts-period label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: #55637a;
  font-size: 11px;
}

.ts-period select {
  min-width: 78px;
  padding: 5px 7px;
  border: 1px solid #d9e4f2;
  border-radius: 5px;
  background: #fff;
  color: #22303f;
  font-family: inherit;
  font-size: 11px;
}

.ts-tabs {
  display: flex;
  gap: 4px;
  padding: 0 10px;
}

.ts-tab {
  flex: 1;
  min-width: 0;
  padding: 7px 3px;
  border: 0;
  border-radius: 6px;
  background: #eef4fd;
  color: #1a56c4;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}

.ts-tab.active {
  background-image: linear-gradient(135deg, #1a73e8, #3f8ef5);
  color: #fff;
}

.ts-layer-list {
  min-height: 86px;
  padding: 8px 12px;
  overflow-y: auto;
}

.ts-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 0;
  color: #8494a8;
  font-size: 10px;
}

.ts-list-toolbar button {
  padding: 3px 6px;
  border: 1px solid #dce7f5;
  border-radius: 4px;
  background: #fff;
  color: #1a56c4;
  font-family: inherit;
  font-size: 9px;
  cursor: pointer;
}

.ts-layer-entry { position: relative; }

.ts-layer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 2px 28px 2px 4px;
  border-radius: 5px;
  color: #55637a;
  cursor: pointer;
}

.ts-color-toggle {
  position: absolute;
  top: 6px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 20px;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.ts-color-toggle:hover,
.ts-color-toggle.open { border-color: #d7e4f4; background: #f2f7fd; }
.ts-visibility-icon { width: 15px; height: 15px; fill: none; stroke: #58708d; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.ts-color-toggle:not(.open) .ts-visibility-icon { stroke: #a1afbf; }
.ts-color-chip { display: inline-block; width: 16px; height: 9px; border: 1px solid #d3deea; border-radius: 2px; }
.ts-color-chip.river { height: 0; border: 0; border-top: 2px solid #218bb4; border-radius: 0; }
.ts-color-chip.lake { background: rgba(55,153,198,.65); border-color: #3789b8; }
.ts-color-chip.terrain { height: 11px; background: rgba(255,145,0,.3); border-color: #e85d04; }
.ts-color-chip.boundary { height: 0; border: 0; border-top: 2px solid #e63946; border-radius: 0; }
.ts-color-chip.boundary::after { content: ''; display: block; position: relative; top: 3px; width: 16px; border-top: 2px dashed #f59e0b; }
.ts-layer-row:hover {
  background: #f4f8fe;
}

.ts-layer-row input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #1a73e8;
  cursor: pointer;
}

.ts-layer-symbol {
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
  border: 1px solid #8fb5e9;
  border-radius: 3px;
  background: #eaf2fd;
}

.ts-layer-symbol.imagery { background: linear-gradient(135deg, #5485c6, #89b579, #d5ad70); border: 0; }
.ts-layer-symbol.radar { background: linear-gradient(135deg, #ded9e9, #5b5268); border: 0; }
.ts-layer-symbol.temperature { background: linear-gradient(90deg, #477ac0, #e5bd79, #ce665e); border: 0; }
.ts-layer-symbol.precipitation { background: linear-gradient(90deg, #d5e9c9, #58a6a0, #334f9b); border: 0; }
.ts-layer-symbol.river { background: #58afd3; border-color: #58afd3; }
.ts-layer-symbol.lake { background: #6ca9d5; border-color: #6ca9d5; }
.ts-layer-symbol.terrain { background: #c9a36b; border-color: #c9a36b; }
.ts-layer-symbol.boundary { background: #b7a3dc; border-color: #b7a3dc; }
.ts-layer-symbol.elevation { background: linear-gradient(135deg, #688b5d, #d8ba76, #986d5a); border: 0; }
.ts-layer-symbol.slope { background: linear-gradient(135deg, #bad69b, #6e9b83, #485f72); border: 0; }

.ts-layer-name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
}

.ts-layer-meta {
  color: #8494a8;
  font-size: 10px;
  white-space: nowrap;
}

.ts-fetch-state {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0 12px 9px;
  padding: 9px 10px;
  border: 1px solid #f2dfc2;
  border-radius: 7px;
  background: #fff9ef;
  color: #735c37;
}

.ts-state-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 3px;
  border-radius: 50%;
  background: #e2a03c;
  box-shadow: 0 0 0 3px rgba(226, 160, 60, .14);
}

.ts-fetch-state strong {
  color: #a66a12;
  font-size: 11px;
}

.ts-fetch-state p {
  margin: 3px 0 0;
  color: #8c7b60;
  font-size: 10px;
  line-height: 1.45;
}

.ts-fetch-state.ready {
  border-color: #cdebd7;
  background: #f0fbf4;
}

.ts-fetch-state.ready .ts-state-dot {
  background: #36a269;
  box-shadow: 0 0 0 3px rgba(54, 162, 105, .14);
}

.ts-fetch-state.ready strong { color: #28794e; }
.ts-fetch-state.error { border-color: #f0caca; background: #fff4f2; }
.ts-fetch-state.error .ts-state-dot { background: #d45b51; box-shadow: 0 0 0 3px rgba(212, 91, 81, .14); }
.ts-fetch-state.error strong { color: #a43e38; }

.ts-preview-note {
  margin: 0;
  padding: 8px 13px 10px;
  border-top: 1px solid #eaf0f8;
  color: #8494a8;
  font-size: 9px;
  line-height: 1.45;
}

.ts-legend {
  margin: 0 12px 9px;
  padding: 8px 9px;
  border: 1px solid #e5edf7;
  border-radius: 7px;
  background: #f9fbfe;
}

.ts-legend h3 {
  margin: 0 0 6px;
  color: #4c5d73;
  font-size: 11px;
  font-weight: 600;
}

.ts-legend-row + .ts-legend-row { margin-top: 8px; }
.ts-legend-name { display: flex; align-items: center; gap: 6px; color: #55637a; font-size: 10px; }
.ts-legend-swatch { display: inline-block; width: 17px; height: 9px; flex: 0 0 auto; border: 1px solid transparent; border-radius: 2px; }
.ts-legend-swatch.river { height: 0; border: 0; border-top: 2px solid #218bb4; border-radius: 0; }
.ts-legend-swatch.lake { background: rgba(55,153,198,.65); border-color: #3789b8; }
.ts-legend-swatch.terrain { height: 11px; background: rgba(255,145,0,.3); border-color: #e85d04; }
.ts-legend-swatch.boundary { height: 0; border: 0; border-top: 2px solid #e63946; border-radius: 0; }
.ts-legend-swatch.boundary::after { content: ''; display: block; position: relative; top: 3px; width: 17px; border-top: 2px dashed #f59e0b; }
.ts-legend-swatch.temperature { background: linear-gradient(90deg,#3155a5,#479bc2,#91c994,#f0d56a,#e87946,#a83238); }
.ts-legend-swatch.precipitation { background: linear-gradient(90deg,#f6f2c1,#c5df9b,#68b7a3,#4380b8,#44377b); }
.ts-legend-swatch.elevation { background: linear-gradient(90deg,#2d6d39,#73a84b,#c5c96e,#d89c6e,#fff5e9); }
.ts-legend-swatch.slope { background: linear-gradient(90deg,#fffde8,#f5d88c,#eea24d,#bc5125); }
.ts-legend-scale { height: 8px; margin-top: 4px; border-radius: 4px; }
.ts-legend-labels { display: flex; justify-content: space-between; gap: 3px; margin-top: 3px; color: #8494a8; font-size: 9px; }
.ts-legend-note { margin: 3px 0 0 23px; color: #8494a8; font-size: 9px; }

.ts-map-tooltip {
  position: fixed;
  z-index: 1400;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 230px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 7px 9px;
  border: 1px solid rgba(183, 202, 225, .9);
  border-radius: 6px;
  background: rgba(255,255,255,.97);
  box-shadow: 0 3px 12px rgba(22, 46, 81, .18);
  color: #536278;
  font-size: 11px;
  pointer-events: none;
}

.ts-map-tooltip strong { color: #1a56c4; font-size: 11px; }
.ts-map-tooltip span { line-height: 1.4; }
.ts-map-tooltip span b { display: inline-block; min-width: 54px; margin-right: 4px; color: #263d5a; font-weight: 600; }

@media (max-width: 700px) {
  .app-header { padding: 0 10px; }
  .app-title { font-size: 14px; letter-spacing: 0; }
  .app-menu { gap: 0; }
  .app-menu-item { padding: 8px 7px; font-size: 11px; }
  .ts-panel { top: 68px; right: 10px; max-height: calc(100vh - 80px); }
}
</style>


