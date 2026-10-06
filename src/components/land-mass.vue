<template>
  <div id="bottom_right">
    <module-tabs v-model="tab" :tabs="tabs"/>

    <!-- 交互识别：框选 -->
    <section v-if="tab === 'identify'" class="ident-panel float-panel">
      <header class="panel-heading">
        <pi-icon name="target"/>
        <span>交互识别</span>
      </header>
      <div class="ident-body">
        <button class="ident-btn" :class="{ on: roiActive }" type="button" @click="toggleRoi">
          {{ roiActive ? '停止框选' : '开始框选' }}
        </button>
        <p class="ident-hint">
          在地图上拖出一个矩形即可只显示框内内容，缩放、切换日期都只在框内生效；再点一次「停止框选」恢复完整视图。
        </p>
      </div>
    </section>

    <date-timeline v-if="tab === 'visual'"/>

    <placeholder-panel
      v-if="tab === 'change'"
      icon="chart"
      title="耕地变化监测"
      subtitle="分析时段 2024 — 2026"
      :metrics="changeMetrics"
      :legend="changeLegend"
    />

    <placeholder-panel
      v-if="tab === 'stats'"
      icon="asterisk"
      title="耕地统计特征"
      subtitle="单位面积地块数量（个 / km²）"
      :metrics="statsMetrics"
      :legend="statsLegend"
    />

    <placeholder-panel
      v-if="tab === 'pattern'"
      icon="hexagon"
      title="空间格局变化"
      subtitle="分析时段 2024 — 2026"
      :metrics="patternMetrics"
      :legend="patternLegend"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { View } from 'ol'
import useMapStore from '@/stores/map'
import ModuleTabs from '@/components/part/module-tabs.vue'
import DateTimeline from '@/components/part/date-timeline.vue'
import PlaceholderPanel from '@/components/part/placeholder-panel.vue'
import PiIcon from '@/components/part/pi-icon.vue'

const store = useMapStore()
const { map, parcelRoiState } = storeToRefs(store)

// 二级模块，名称与 figma 原型一致
const tabs = [
  { id: 'identify', label: '交互识别', icon: 'sprout' },
  { id: 'visual', label: '农业地块可视化', icon: 'layers' },
  { id: 'change', label: '耕地变化监测', icon: 'chart' },
  { id: 'stats', label: '耕地统计特征', icon: 'asterisk' },
  { id: 'pattern', label: '空间格局变化', icon: 'hexagon' }
]
const tab = ref('visual')

const roiActive = computed(() => parcelRoiState.value === 'drawing' || parcelRoiState.value === 'applied')
const toggleRoi = () => store.toggleParcelRoi()

// 框选只在「交互识别」里用：切到别的二级模块就停掉正在进行的框选
watch(tab, value => {
  // 离开「交互识别」就不再识别框选：整个撤掉，回到默认视图
  if (value !== 'identify' && (parcelRoiState.value === 'drawing' || parcelRoiState.value === 'applied')) {
    store.clearParcelRoi()
  }
})

const changeMetrics = [
  { label: '持续耕地', value: '426,813 ha', delta: '66.5%' },
  { label: '新增耕地', value: '48,205 ha', delta: '+7.5%' },
  { label: '弃耕地', value: '31,642 ha', delta: '-4.9%' },
  { label: '净增耕地', value: '16,563 ha', delta: '+2.6%' }
]
const changeLegend = [
  { label: '持续耕地', color: '#e8c33f' },
  { label: '新增耕地', color: '#5cc46a' },
  { label: '弃耕地', color: '#d9534f' },
  { label: '复耕地', color: '#7fb3e8' }
]

const statsMetrics = [
  { label: '极低（＜5）', value: '8.6%' },
  { label: '低（5 – 12）', value: '19.4%' },
  { label: '中（12 – 25）', value: '35.7%' },
  { label: '高（25 – 40）', value: '24.1%' },
  { label: '极高（＞40）', value: '12.2%' }
]
const statsLegend = [
  { label: '＜5', color: '#eaf3fc' },
  { label: '5 – 12', color: '#a9cdee' },
  { label: '12 – 25', color: '#6ba6dc' },
  { label: '25 – 40', color: '#2f6fb5' },
  { label: '＞40', color: '#123e7d' }
]

const patternMetrics = [
  { label: '平均地块面积', value: '42.1 ha', delta: '+8.4%' },
  { label: '地块密度', value: '1.86', delta: '-6.2%' },
  { label: '聚合度', value: '71.8%', delta: '+4.7%' },
  { label: '边界密度', value: '32.4', delta: '-3.1%' }
]
const patternLegend = [
  { label: '基本稳定', color: '#dfe8f2' },
  { label: '地块扩大', color: '#5cc46a' },
  { label: '地块缩小', color: '#e8a33f' },
  { label: '新增地块', color: '#4a90e2' },
  { label: '连片耕地核心区', color: '#17a673' },
  { label: '耕地破碎化热点', color: '#d9534f' },
  { label: '耕地重心迁移方向', color: '#8e5ff0' }
]

const setMapView = () => {
  if (!map.value || !map.value.setView) {
    setTimeout(setMapView, 50)
    return
  }

  map.value.setView(new View({
    center: [78.25, 45.72],
    zoom: 7.15,
    projection: 'EPSG:4326'
  }))

  store.clearMap(0)
  // 时空数据页勾选的图层不要跟着过来
  store.clearTemporalLayers()
  store.addBasicLayer('World_Imagery') // 底图改为卫星图
  store.addBasinBoundaryLayer()
  store.addAgriParcelLayer() // 农田地块
}

onMounted(setMapView)
</script>
