<template>
  <section class="ca-panel" ref="panel" :style="panelStyle">
    <!-- 拖动把手 -->
    <div class="ca-bar" @pointerdown="startDrag">
      <span class="ca-grip" aria-hidden="true"></span>
      <span class="ca-bar-title">{{ panelTitle }}</span>
    </div>
    <div v-if="!hideTabs" class="ca-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="ca-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <div class="ca-body">
      <!-- 交互识别与作物类型可视化是一体的，框选入口由页面塞进来 -->
      <slot name="actions"/>
      <p class="ca-hint" v-if="cropAnalysisLoading">
        {{ cropAnalysisScope === 'roi' ? '正在统计…' : '正在统计整个流域（约 31 万个图斑），首次需要一分钟左右…' }}
      </p>
      <p class="ca-hint" v-else-if="!result">{{ cropAnalysisNotice || '正在准备数据…' }}</p>

      <template v-else>
        <!-- 作物可视化 -->
        <template v-if="activeTab === 'visual'">
          <div class="ca-row"><span>统计年份</span><b>{{ result.latestYear }}</b></div>
          <div class="ca-row"><span>地块数</span><b>{{ result.parcelCount }}</b></div>
          <div class="ca-row"><span>作物斑块数</span><b>{{ result.patchCount }}</b></div>
          <div class="ca-row"><span>总面积</span><b>{{ result.totalArea.toFixed(1) }} km²</b></div>

          <div class="ca-sub">各类型与占比</div>
          <div class="ca-type" v-for="item in result.byType" :key="item.code">
            <img class="ca-icon" v-if="iconOf(item.code)" :src="iconOf(item.code)" alt="">
            <span class="ca-swatch" v-else></span>
            <span class="ca-name">{{ item.name }}</span>
            <span class="ca-ratio">{{ (item.ratio * 100).toFixed(1) }}%</span>
            <span class="ca-count">{{ item.count }} 块</span>
          </div>

          <div class="ca-sub">交互识别</div>
          <div class="ca-row">
            <span>点选地块</span>
            <b>{{ identified.id || '未点选' }}</b>
          </div>
          <div class="ca-row">
            <span>识别作物</span>
            <b>{{ identified.name }}</b>
          </div>
          <p class="ca-tip">在框选范围内的地图上点一下，即可识别该斑块的作物类型</p>
        </template>

        <!-- 作物时间序列 -->
        <template v-else-if="activeTab === 'series'">
          <div class="ca-chain">
            <template v-for="(node, i) in result.series" :key="node.year">
              <span class="ca-arrow" v-if="i">→</span>
              <span class="ca-node">
                <b>{{ node.year }}</b>
                <i>{{ node.name }}</i>
              </span>
            </template>
          </div>
          <div class="ca-row" v-for="node in result.series" :key="node.year">
            <span>{{ node.year }} 主导作物</span>
            <b>{{ node.name }} {{ (node.ratio * 100).toFixed(1) }}%</b>
          </div>
          <p class="ca-tip" v-if="result.years.length < 2">
            目前只取到一年数据，时间序列需要按年份配置多个图层：<br>
            <code>setCropAnalysisYears({2024:'…', 2025:'…', 2026:'…'})</code><br>
            或放 <code>public/static/cropYears.json</code>
          </p>
        </template>

        <!-- 种植分析 -->
        <template v-else>
          <div class="ca-subtabs">
            <button
              class="ca-subtab"
              :class="{ active: analysisTab === 'stability' }"
              @click="analysisTab = 'stability'"
            >种植稳定性分析</button>
            <button
              class="ca-subtab"
              :class="{ active: analysisTab === 'diversity' }"
              @click="analysisTab = 'diversity'"
            >种植多样性</button>
          </div>

          <template v-if="analysisTab === 'stability'">
          <div class="ca-base">
            <strong>以 {{ result.stability.baseline || result.baseline }} 年为基准</strong>
            <span>统计每个地块作物类型改变次数</span>
          </div>
          <div class="ca-metrics">
            <div class="ca-metric">
              <span>稳定地块占比</span>
              <strong>{{ stableShare }}</strong>
            </div>
            <div class="ca-metric">
              <span>平均改变次数</span>
              <strong>{{ avgChanges }}</strong>
            </div>
          </div>
          <div class="ca-sub">种植稳定性</div>
          <div class="ca-row"><span>基准年</span><b>{{ result.stability.baseline || result.baseline }}</b></div>
          <div class="ca-row"><span>参与对比年份</span><b>{{ result.stability.years.join(' / ') || '—' }}</b></div>
          <div class="ca-row"><span>可对比地块数</span><b>{{ result.stability.parcelCount }}</b></div>
          <div class="ca-row">
            <span>平均改变次数</span>
            <b>{{ result.stability.averageChanges === null ? '—' : result.stability.averageChanges.toFixed(2) }} 次</b>
          </div>
          <div class="ca-row" v-for="(count, changes) in result.stability.histogram" :key="changes">
            <span>改变 {{ changes }} 次</span><b>{{ count }} 个地块</b>
          </div>
          <p class="ca-tip" v-if="!result.stability.comparable">
            稳定性需要至少两年数据，当前只取到 {{ result.years.length }} 年
          </p>
          </template>

          <template v-else>
          <div class="ca-sub">种植多样性</div>
          <div class="ca-row"><span>作物种类数</span><b>{{ result.diversity.richness }}</b></div>
          <div class="ca-row">
            <span>Shannon（整体 / 地块平均）</span>
            <b>{{ result.diversity.shannon.toFixed(3) }} / {{ result.diversity.parcelShannon.toFixed(3) }}</b>
          </div>
          <div class="ca-row">
            <span>Simpson（整体 / 地块平均）</span>
            <b>{{ result.diversity.simpson.toFixed(3) }} / {{ result.diversity.parcelSimpson.toFixed(3) }}</b>
          </div>
          <div class="ca-row">
            <span>单位面积作物种类<br>（种/千km²）</span>
            <b>{{ (result.diversity.speciesPerKm2 * 1000).toFixed(2) }}</b>
          </div>
          <div class="ca-row">
            <span>单位面积作物类型<br>（种/km²，地块平均）</span>
            <b>{{ result.diversity.parcelTypesPerKm2.toFixed(2) }}</b>
          </div>
          </template>
        </template>
      </template>

      <p class="ca-warn" v-if="result && cropAnalysisNotice">{{ cropAnalysisNotice }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import useMapStore from '@/stores/map'
import { usePanelDrag } from '@/composables/usePanelDrag'

const store = useMapStore()
const { panel, panelStyle, startDrag } = usePanelDrag()
const {
  cropAnalysisResult,
  cropAnalysisLoading,
  cropAnalysisNotice,
  cropAnalysisScope,
  currentCrop,
  featureId
} = storeToRefs(store)

const tabs = [
  { id: 'visual', label: '作物可视化' },
  { id: 'series', label: '时间序列' },
  { id: 'analysis', label: '种植分析' }
]
const activeTab = ref('visual')
// 种植分析里的两个子页签：稳定性 / 多样性
const analysisTab = ref('stability')

// 二级模块导航条上的选择会切到这个面板里的对应页签
const props = defineProps({
  tab: { type: String, default: '' },
  // 二级模块导航条已经在切页签时，面板内部的页签就不重复显示了
  hideTabs: { type: Boolean, default: false }
})
watch(() => props.tab, value => {
  if (value && tabs.some(item => item.id === value)) activeTab.value = value
}, { immediate: true })

const result = computed(() => cropAnalysisResult.value)

// 标题跟着二级模块走，与原型一致
const panelTitle = computed(() => ({
  visual: '作物统计信息',
  series: '作物时间序列',
  analysis: '种植分析'
}[activeTab.value] || '作物统计信息'))

// 多年数据接入前，稳定性两个指标先按原型给的示例值展示
const SAMPLE_STABLE_SHARE = '68.4%'
const SAMPLE_AVG_CHANGES = '1.7 次'
const stableShare = computed(() => {
  const stability = result.value && result.value.stability
  if(!stability || !stability.comparable || !stability.parcelCount) return SAMPLE_STABLE_SHARE
  const stable = Number(stability.histogram && stability.histogram[0]) || 0
  return `${((stable / stability.parcelCount) * 100).toFixed(1)}%`
})
const avgChanges = computed(() => {
  const stability = result.value && result.value.stability
  if(!stability || !stability.comparable || stability.averageChanges === null) return SAMPLE_AVG_CHANGES
  return `${stability.averageChanges.toFixed(1)} 次`
})

const iconOf = code => store.cropAnalysisTypeInfo(code).icon

const identified = computed(() => ({
  id: featureId.value,
  name: currentCrop.value || '未识别'
}))

onMounted(() => {
  store.getCropAnalysisYears()
})
</script>

<style scoped>
.ca-panel {
  position: fixed;
  /* 照原型放在左上，让开顶栏和二级导航条 */
  top: calc(var(--header-h) + var(--tabs-h) + 11px);
  left: 11px;
  z-index: 1150;
  width: 356px;
  /* 默认高度避开底部的日期时间轴，内容多了内部滚动 */
  max-height: calc(100vh - var(--header-h) - var(--tabs-h) - 150px);
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  color: #22303f;
  font-size: 15px;
}

/* 拖动把手 */
.ca-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  padding: 8px 16px 0;
  cursor: move;
  touch-action: none;
}

.ca-grip {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  background-image: radial-gradient(#a9b8cc 1px, transparent 1px);
  background-size: 4px 4px;
}

.ca-bar-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a56c4;
  white-space: nowrap;
}

.ca-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 16px 0;
}

.ca-tab {
  flex: 1 1 0;
  padding: 9px 6px;
  font-family: inherit;
  font-size: 15px;
  white-space: nowrap;
  color: #1a56c4;
  background-color: #eef4fd;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.ca-tab.active {
  color: #ffffff;
  background-image: linear-gradient(135deg, #1a73e8, #3f8ef5);
}

.ca-body {
  padding: 10px 16px 16px;
  overflow-y: auto;
}

.ca-hint {
  margin: 8px 0;
  color: #8494a8;
  line-height: 1.5;
}

.ca-scope {
  margin: 0 0 8px;
  color: #55637a;
  line-height: 1.5;
}

.ca-scope b {
  color: #1a56c4;
}

.ca-scope em {
  font-style: normal;
  color: #9aa7ba;
}

.ca-warn {
  margin: 10px 0 0;
  color: #d08700;
}

.ca-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  color: #55637a;
}

.ca-row b {
  color: #22303f;
  font-weight: 600;
  text-align: right;
}

.ca-sub {
  margin: 14px 0 6px;
  padding-top: 12px;
  border-top: 1px solid #eaf0f8;
  font-size: 16px;
  font-weight: 600;
  color: #1a56c4;
}

/* 种植分析里的小页签：种植稳定性分析 / 种植多样性 */
.ca-subtabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.ca-subtab {
  flex: 1 1 0;
  padding: 7px 10px;
  font-family: inherit;
  font-size: 13px;
  color: #164f9a;
  background-color: #f2f7fd;
  border: 1px solid #dfeaf8;
  border-radius: 6px;
  cursor: pointer;
}

.ca-subtab.active {
  color: #fff;
  font-weight: 600;
  background-image: linear-gradient(#2c93ff, #156ee4);
  border-color: transparent;
}

/* 以某年为基准的说明条 */
.ca-base {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background-color: #f6faff;
  border-left: 3px solid #2c93ff;
  border-radius: 0 6px 6px 0;
}

.ca-base strong {
  color: #164f9a;
  font-size: 13px;
}

.ca-base span {
  color: #7890aa;
  font-size: 12px;
}

.ca-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 4px;
}

.ca-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background-color: #f5f9fe;
  border: 1px solid #e6eefa;
  border-radius: 8px;
}

.ca-metric span {
  color: #7890aa;
  font-size: 12px;
}

.ca-metric strong {
  color: #102b56;
  font-size: 18px;
}

.ca-type {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 0;
}

.ca-icon {
  width: 22px;
  height: 22px;
}

.ca-swatch {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  background-color: #c7ced8;
}

.ca-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ca-ratio {
  color: #1a56c4;
  font-weight: 600;
}

.ca-count {
  color: #8494a8;
}

.ca-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0 10px;
}

.ca-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  background-color: #eef4fd;
}

.ca-node b {
  font-size: 16px;
  color: #1a56c4;
}

.ca-node i {
  font-style: normal;
  color: #22303f;
}

.ca-arrow {
  color: #8494a8;
}

.ca-tip {
  margin: 10px 0 0;
  color: #8494a8;
  line-height: 1.6;
  word-break: break-all;
}

.ca-tip code {
  font-size: 13px;
  color: #1a56c4;
}
</style>
