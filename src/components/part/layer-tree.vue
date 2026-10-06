<template>
  <section class="layer-tree float-panel" :class="{ collapsed }" aria-label="数据图层">
    <header class="panel-heading">
      <pi-icon name="layers"/>
      <span>数据图层</span>
      <button
        class="tree-collapse"
        type="button"
        :title="collapsed ? '展开面板' : '收起面板'"
        @click="collapsed = !collapsed"
      >{{ collapsed ? '»' : '«' }}</button>
    </header>

    <div v-show="!collapsed" class="tree-body">
      <div v-for="group in tree" :key="group.id" class="tree-group">
        <label class="tree-row is-group">
          <input
            type="checkbox"
            :checked="groupState(group) === 'all'"
            :indeterminate.prop="groupState(group) === 'some'"
            @change="toggleGroup(group, $event.target.checked)"
          >
          <button
            class="tree-caret"
            type="button"
            :title="open[group.id] === false ? '展开' : '收起'"
            @click.prevent="open[group.id] = open[group.id] === false"
          >{{ open[group.id] === false ? '›' : '⌄' }}</button>
          <span class="tree-name">{{ group.label }}</span>
        </label>

        <div v-show="open[group.id] !== false" class="tree-children">
          <label v-for="child in group.children" :key="child.id" class="tree-row">
            <input type="checkbox" :checked="isOn(child.id)" @change="toggleChild(child.id, $event.target.checked)">
            <span class="tree-name">{{ child.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <footer class="layer-status">已启用 {{ enabledCount }} 个图层</footer>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import useMapStore from '@/stores/map'
import PiIcon from '@/components/part/pi-icon.vue'

const store = useMapStore()
const { temporalLayerInstances } = storeToRefs(store)

const collapsed = ref(false)
const open = reactive({
  basemap: true,
  boundaries: true,
  terrain: true,
  imagery: true,
  weather: true
})

// 图层树结构照 figma 原型：标准底图 / 行政边界 / 地形 / 影像 / 气象
const tree = [
  {
    id: 'basemap',
    label: '标准底图',
    children: [
      { id: 'rivers', label: '河流' },
      { id: 'mountains', label: '山脉' },
      { id: 'lakes', label: '湖泊' }
    ]
  },
  {
    id: 'boundaries',
    label: '行政边界',
    children: [
      { id: 'country_border', label: '国家边界' },
      { id: 'province_border', label: '州界' }
    ]
  },
  {
    id: 'terrain',
    label: '地形',
    children: [
      { id: 'elevation', label: '高程' },
      { id: 'slope', label: '坡度' }
    ]
  },
  {
    id: 'imagery',
    label: '影像',
    children: [
      { id: 'sentinel1', label: 'Sentinel-1' },
      { id: 'sentinel2', label: 'Sentinel-2' }
    ]
  },
  {
    id: 'weather',
    label: '气象',
    children: [
      { id: 'temperature', label: '气温' },
      { id: 'precipitation', label: '降水' }
    ]
  }
]

// 默认一个都不勾选，由用户自己点
const DEFAULT_ON = []

const isOn = id => !!temporalLayerInstances.value[id]
const groupState = group => {
  const on = group.children.filter(child => isOn(child.id)).length
  if (on === 0) return 'none'
  return on === group.children.length ? 'all' : 'some'
}
const enabledCount = computed(() => tree.reduce((total, group) => (
  total + (groupState(group) === 'all' ? 1 : 0) + group.children.filter(child => isOn(child.id)).length
), 0))

const toggleChild = (id, visible) => store.setTemporalLayer(id, visible)
const toggleGroup = (group, visible) => {
  group.children.forEach(child => store.setTemporalLayer(child.id, visible))
}

// 默认打开原型里展示的那几层，让面板一进来就有内容。
// 由页面在准备好底图之后调用（子组件的 onMounted 早于父组件，不能自己跑）
const applyDefaults = () => {
  DEFAULT_ON.forEach(id => {
    if (!temporalLayerInstances.value[id]) store.setTemporalLayer(id, true)
  })
}

onMounted(() => {})

defineExpose({ applyDefaults })
</script>

<style scoped>
.layer-tree {
  position: fixed;
  top: calc(var(--header-h) + 11px);
  left: 11px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 234px;
  /* 底部要给年度时间轴留位置，不然页脚会被压住 */
  max-height: calc(100vh - var(--header-h) - 118px);
  overflow: hidden;
  pointer-events: auto;
}

.layer-tree.collapsed {
  width: auto;
}

.tree-collapse {
  margin-left: auto;
  padding: 0 4px;
  color: var(--ink-300);
  background: none;
  border: 0;
  font-size: 13px;
  cursor: pointer;
}

.tree-collapse:hover {
  color: var(--brand-500);
}

.tree-body {
  overflow-y: auto;
  padding: 0 0 2px;
}

.tree-group + .tree-group {
  border-top: 1px solid #eef3fa;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 15px;
  color: var(--ink-900);
  font-size: 13px;
  cursor: pointer;
}

.tree-row:hover {
  background-color: #f4f9ff;
}

.tree-row.is-group {
  color: var(--ink-700);
  font-weight: 600;
}

.tree-row input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  flex: 0 0 auto;
  accent-color: var(--brand-500);
  cursor: pointer;
}

.tree-caret {
  width: 12px;
  padding: 0;
  color: var(--ink-300);
  background: none;
  border: 0;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.tree-children .tree-row {
  padding-left: 38px;
}

.layer-status {
  flex: 0 0 auto;
  padding: 7px 0 7px 15px;
  color: var(--ink-300);
  background-color: #f8fafc;
  border-top: 1px solid #eef3fa;
  font-size: 11px;
}
</style>
