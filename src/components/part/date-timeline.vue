<template>
  <div ref="panel" class="dt-panel" :style="panelStyle">
    <!-- 这一条既是标题也是拖动窗口的把手 -->
    <div class="dt-bar" @pointerdown="startDrag">
      <span class="dt-grip" aria-hidden="true"></span>
      <span class="dt-title">日期时间轴</span>
      <span class="dt-state">{{ statusText }}</span>
    </div>
    <div class="dt-body">
      <button
        class="dt-play"
        :disabled="parcelTimelineDates.length < 2"
        :title="parcelTimelinePlaying ? '暂停' : '播放'"
        @click="togglePlay"
      >
        <img :src="parcelTimelinePlaying ? '/img/24gl-pause2.png' : '/img/24gl-play.png'" alt="">
      </button>
      <input
        class="dt-range"
        type="range"
        min="0"
        :max="maxIndex"
        step="1"
        :value="parcelTimelineIndex"
        :disabled="parcelTimelineDates.length === 0"
        @input="onDrag"
      >
      <input
        class="dt-date"
        type="date"
        :min="firstDate"
        :max="lastDate"
        :value="currentDate"
        :disabled="parcelTimelineDates.length === 0"
        @change="onPickDate"
      >
    </div>
    <div class="dt-ticks" ref="ticksRef">
      <span v-for="tick in ticks" :key="tick.label" :style="{ left: tick.left }">{{ tick.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import useMapStore from '@/stores/map'
import { usePanelDrag } from '@/composables/usePanelDrag'

const store = useMapStore()
const {
  parcelTimelineDates,
  parcelTimelineIndex,
  parcelTimelinePlaying,
  parcelTimelineLoading,
  parcelTimelineNotice
} = storeToRefs(store)

const maxIndex = computed(() => Math.max(parcelTimelineDates.value.length - 1, 0))
const currentDate = computed(() => store.getCurrentParcelDate())

const dateOf = item => (typeof item === 'string' ? item : (item && item.date) || '')
const firstDate = computed(() => dateOf(parcelTimelineDates.value[0]))
const lastDate = computed(() => {
  const list = parcelTimelineDates.value
  return list.length ? dateOf(list[list.length - 1]) : ''
})

const statusText = computed(() => {
  const total = parcelTimelineDates.value.length
  if (total === 0) return '暂无日期数据'
  if (parcelTimelineLoading.value) return '正在加载…'
  const position = `${parcelTimelineIndex.value + 1} / ${total}`
  return parcelTimelineNotice.value ? `${position} · ${parcelTimelineNotice.value}` : position
})

// 刻度可用宽度，用来决定年份标签要不要抽稀
const ticksRef = ref(null)
const ticksWidth = ref(0)
let ticksObserver = null

// 年份刻度：取每年第一条日期所在的位置，位置不够时按间隔抽稀，避免年份挤在一起
const ticks = computed(() => {
  const list = parcelTimelineDates.value
  const total = list.length
  if (total === 0) return []
  const last = Math.max(total - 1, 1)
  const seen = new Set()
  const marks = []
  list.forEach((item, i) => {
    const date = dateOf(item)
    if (!date) return
    const year = date.slice(0, 4)
    if (seen.has(year)) return
    seen.add(year)
    marks.push({ label: year, left: (i / last) * 100 + '%' })
  })
  const width = ticksWidth.value
  if (!width || marks.length < 2) return marks
  // 相邻标签之间至少要留出的间距（年份标签约 25 像素宽，再留一点空隙）
  const MIN_GAP = 34
  // 相邻标签的实际间距是 width * step / (marks.length - 1)，据此反推需要的步长
  const step = Math.ceil((MIN_GAP * (marks.length - 1)) / width)
  return step <= 1 ? marks : marks.filter((_, i) => i % step === 0)
})

const onDrag = evt => store.selectParcelTimelineIndex(evt.target.value)
const onPickDate = evt => store.selectParcelTimelineDate(evt.target.value)
const togglePlay = () => store.toggleParcelTimelinePlay()

// 窗口拖动
const { panel, panelStyle, startDrag } = usePanelDrag()

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && ticksRef.value) {
    ticksObserver = new ResizeObserver(entries => {
      entries.forEach(entry => { ticksWidth.value = entry.contentRect.width })
    })
    ticksObserver.observe(ticksRef.value)
  }
  // 日期列表由 store 里 getParcelTimelineDates 决定数据来源，已经加载过就不重复请求
  if (parcelTimelineDates.value.length === 0) store.getParcelTimelineDates()
})

onBeforeUnmount(() => {
  if (ticksObserver) {
    ticksObserver.disconnect()
    ticksObserver = null
  }
})
</script>

<style scoped>
.dt-panel {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  z-index: 1200;
  width: 560px;
  padding: 9px 16px 12px;
  box-sizing: border-box;
  background-color: #ffffff;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  color: #22303f;
  font-size: 15px;
  user-select: none;
}

.dt-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 24px;
  cursor: move;
  touch-action: none;
}

.dt-grip {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  background-image: radial-gradient(#a9b8cc 1px, transparent 1px);
  background-size: 4px 4px;
}

.dt-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a56c4;
  white-space: nowrap;
}

.dt-state {
  margin-left: auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  color: #8494a8;
}

.dt-body {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}

.dt-play {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: #1a73e8;
  cursor: pointer;
}

.dt-play:disabled {
  opacity: 0.4;
  cursor: default;
}

.dt-play img {
  width: 17px;
  height: 17px;
  display: block;
  /* 图标本身是深色的，反转成白色才看得见 */
  filter: brightness(0) invert(1);
}

.dt-range {
  flex: 1 1 auto;
  min-width: 0;
  appearance: none;
  height: 6px;
  border: none;
  outline: none;
  border-radius: 2px;
  background-color: #d6e2f5;
  cursor: pointer;
}

.dt-range:disabled {
  opacity: 0.5;
  cursor: default;
}

.dt-range::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background-color: #1a73e8;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.dt-range::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background-color: #1a73e8;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.dt-date {
  flex: 0 0 auto;
  width: 150px;
  padding: 3px 6px;
  font-family: inherit;
  font-size: 15px;
  color: #22303f;
  background-color: #f4f7fb;
  border: 1px solid #cfdae8;
  border-radius: 4px;
  cursor: pointer;
}

.dt-date:disabled {
  opacity: 0.5;
  cursor: default;
}

.dt-ticks {
  position: relative;
  height: 18px;
  margin: 4px 162px 0 42px;
}

.dt-ticks span {
  position: absolute;
  transform: translateX(-50%);
  font-size: 13px;
  white-space: nowrap;
  color: #8494a8;
}
</style>
