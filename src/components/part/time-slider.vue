<template>
  <div ref="panel" class="ts-panel" :style="panelStyle">
    <div class="ts-bar" @pointerdown="startDrag">
      <span class="ts-grip" aria-hidden="true"></span>
      <span class="ts-title">时空数据时间轴</span>
      <span class="ts-state">{{ currentYear }}年 {{ pad(currentMonth) }}月</span>
    </div>
    <div class="ts-body">
      <button class="ts-play" :title="isPlaying ? '暂停' : '播放'" @click="togglePlay">
        <img :src="isPlaying ? '/img/24gl-pause2.png' : '/img/24gl-play.png'" alt="">
      </button>
      <input class="ts-range" type="range" min="0" :max="totalMonths - 1" step="1" :value="monthIndex" @input="onSlide">
      <input class="ts-date" type="date" :min="minDate" :max="maxDate" :value="selectedDate" @change="onPickDate">
    </div>
    <div class="ts-ticks" ref="ticksRef">
      <span v-for="tick in ticks" :key="tick.year" :style="{ left: tick.left }">{{ tick.year }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import useMapStore from '@/stores/map'

const YEAR_MIN = 2024
const YEAR_MAX = 2026
const LAST_MONTH = 8
const totalMonths = (YEAR_MAX - YEAR_MIN) * 12 + LAST_MONTH
const store = useMapStore()
store.removeCropLayerLine()
store.removeAdministrativeLayer()
store.removeCropImageryLayers()
store.removeClick()
store.isShowFeautureInfo = false

const monthIndex = ref(5) // 数据包中 Sentinel 影像从每年 6 月起提供
const isPlaying = ref(false)
const selectedDate = ref('2024-06-01')
const currentYear = computed(() => YEAR_MIN + Math.floor(monthIndex.value / 12))
const currentMonth = computed(() => monthIndex.value % 12 + 1)
const pad = value => String(value).padStart(2, '0')
const minDate = `${YEAR_MIN}-01-01`
const maxDate = `${YEAR_MAX}-${pad(LAST_MONTH)}-31`
const ticks = computed(() => Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => ({
  year: YEAR_MIN + i,
  left: `${(i * 12 / (totalMonths - 1)) * 100}%`
})))

watch(monthIndex, index => {
  const year = YEAR_MIN + Math.floor(index / 12)
  const month = index % 12 + 1
  store.setTemporalPeriod({ year, month })
})

const syncDateToIndex = index => {
  const year = YEAR_MIN + Math.floor(index / 12)
  const month = index % 12 + 1
  selectedDate.value = `${year}-${pad(month)}-01`
}
const onSlide = event => {
  monthIndex.value = Number(event.target.value)
  syncDateToIndex(monthIndex.value)
}
const onPickDate = event => {
  if (!event.target.value) return
  const [year, month] = event.target.value.split('-').map(Number)
  selectedDate.value = event.target.value
  monthIndex.value = Math.min(totalMonths - 1, Math.max(0, (year - YEAR_MIN) * 12 + month - 1))
}

let playTimer = null
const stopPlay = () => {
  if (playTimer) clearInterval(playTimer)
  playTimer = null
  isPlaying.value = false
}
const togglePlay = () => {
  if (isPlaying.value) return stopPlay()
  isPlaying.value = true
  playTimer = setInterval(() => {
    monthIndex.value = monthIndex.value >= totalMonths - 1 ? 0 : monthIndex.value + 1
    syncDateToIndex(monthIndex.value)
  }, 2000)
}

const panel = ref(null)
const pos = ref(null)
const panelStyle = computed(() => pos.value
  ? { left: `${pos.value.left}px`, top: `${pos.value.top}px`, bottom: 'auto', transform: 'none' }
  : null)
let grabOffset = { x: 0, y: 0 }
const onPointerMove = event => {
  const el = panel.value
  if (!el || !pos.value) return
  const maxLeft = Math.max(window.innerWidth - el.offsetWidth - 4, 4)
  const maxTop = Math.max(window.innerHeight - el.offsetHeight - 4, 4)
  pos.value = {
    left: Math.min(Math.max(event.clientX - grabOffset.x, 4), maxLeft),
    top: Math.min(Math.max(event.clientY - grabOffset.y, 4), maxTop)
  }
}
const endDrag = () => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
}
const startDrag = event => {
  if (event.button !== 0) return
  const el = panel.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  grabOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  pos.value = { left: rect.left, top: rect.top }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
  event.preventDefault()
}
onMounted(() => store.setTemporalPeriod({ year: currentYear.value, month: currentMonth.value }))
onBeforeUnmount(() => { stopPlay(); endDrag() })
</script>

<style scoped>
.ts-panel {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 1200;
  width: min(400px, calc(100vw - 32px));
  padding: 5px 10px 7px;
  box-sizing: border-box;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .28);
  color: #22303f;
  font-size: 12px;
  user-select: none;
  pointer-events: auto;
}
.ts-bar { display: flex; align-items: center; gap: 7px; height: 18px; cursor: move; touch-action: none; }
.ts-grip { flex: 0 0 auto; width: 10px; height: 10px; background-image: radial-gradient(#a9b8cc 1px, transparent 1px); background-size: 4px 4px; }
.ts-title { color: #1a56c4; font-weight: 600; white-space: nowrap; }
.ts-state { margin-left: auto; overflow: hidden; color: #8494a8; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.ts-body { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.ts-play { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: #1a73e8; cursor: pointer; }
.ts-play img { display: block; width: 12px; height: 12px; filter: brightness(0) invert(1); }
.ts-range { flex: 1 1 auto; min-width: 0; height: 4px; appearance: none; border: 0; border-radius: 2px; outline: none; background: #d6e2f5; cursor: pointer; }
.ts-range::-webkit-slider-thumb { width: 14px; height: 14px; appearance: none; border: 2px solid #fff; border-radius: 50%; background: #1a73e8; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.ts-range::-moz-range-thumb { width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; background: #1a73e8; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.ts-date { flex: 0 0 auto; width: 112px; padding: 1px 4px; border: 1px solid #cfdae8; border-radius: 4px; background: #f4f7fb; color: #22303f; font-family: inherit; font-size: 12px; }
.ts-ticks { position: relative; height: 13px; margin: 2px 120px 0 28px; color: #8494a8; font-size: 10px; }
.ts-ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
@media (max-width: 520px) { .ts-panel { bottom: 12px; } }
</style>
