<template>
  <section class="ca-panel">
    <div class="ca-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="ca-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <div class="ca-body">
      <p class="ca-scope">
        统计范围：<b>{{ cropAnalysisScope === 'roi' ? '框选范围' : '整个流域' }}</b>
        <em v-if="cropAnalysisScope === 'roi'">（在地图上重新拉框可换范围）</em>
        <em v-else>（在地图上拉框可只看框内）</em>
      </p>
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

      <p class="ca-warn" v-if="result && cropAnalysisNotice">{{ cropAnalysisNotice }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import useMapStore from '@/stores/map'

const store = useMapStore()
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

const result = computed(() => cropAnalysisResult.value)

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
  /* 让开导航条（56px）和右上角的框选按钮 */
  top: 112px;
  right: 20px;
  z-index: 1150;
  width: 272px;
  max-height: calc(100vh - 320px);
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  color: #22303f;
  font-size: 12px;
}

.ca-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 10px 0;
}

.ca-tab {
  flex: 1 1 0;
  padding: 6px 4px;
  font-family: inherit;
  font-size: 12px;
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
  padding: 8px 12px 12px;
  overflow-y: auto;
}

.ca-hint {
  margin: 6px 0;
  color: #8494a8;
}

.ca-scope {
  margin: 0 0 6px;
  color: #55637a;
}

.ca-scope b {
  color: #1a56c4;
}

.ca-scope em {
  font-style: normal;
  color: #9aa7ba;
}

.ca-warn {
  margin: 8px 0 0;
  color: #d08700;
}

.ca-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  color: #55637a;
}

.ca-row b {
  color: #22303f;
  font-weight: 600;
  text-align: right;
}

.ca-sub {
  margin: 10px 0 4px;
  padding-top: 8px;
  border-top: 1px solid #eaf0f8;
  font-weight: 600;
  color: #1a56c4;
}

.ca-type {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.ca-icon {
  width: 16px;
  height: 16px;
}

.ca-swatch {
  width: 14px;
  height: 14px;
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
  gap: 4px;
  margin: 4px 0 8px;
}

.ca-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 8px;
  border-radius: 6px;
  background-color: #eef4fd;
}

.ca-node b {
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
  margin: 8px 0 0;
  color: #8494a8;
  line-height: 1.5;
  word-break: break-all;
}

.ca-tip code {
  font-size: 11px;
  color: #1a56c4;
}
</style>
