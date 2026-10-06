<template>
  <div v-if="visible" class="scan-progress">
    <div class="scan-progress-track">
      <div class="scan-progress-fill" :class="{ done }"></div>
    </div>
    <span>{{ done ? '识别完成' : '正在识别…' }}</span>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import useMapStore from '@/stores/map'

const store = useMapStore()
const { parcelRoiExtent, cropAnalysisLoading } = storeToRefs(store)

const phase = ref('idle') // idle / running / done
let doneTimer = null

const visible = computed(() => phase.value !== 'idle' && !!parcelRoiExtent.value)
const done = computed(() => phase.value === 'done')

// 统计一开始就走进度，统计结束的瞬间填满并淡出
watch(cropAnalysisLoading, loading => {
  if(loading){
    phase.value = 'running'
    return
  }
  if(phase.value === 'running'){
    phase.value = 'done'
    if(doneTimer) clearTimeout(doneTimer)
    doneTimer = setTimeout(() => { phase.value = 'idle' }, 900)
  }
}, {immediate: true})

onBeforeUnmount(() => { if(doneTimer) clearTimeout(doneTimer) })
</script>

<style scoped>
.scan-progress {
  position: fixed;
  /* 固定停在页面正中间 */
  left: 50%;
  top: 50%;
  z-index: 1250;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  transform: translate(-50%, -50%);
  color: #fff;
  background-color: rgba(6, 34, 84, 0.74);
  border-radius: 8px;
  font-size: 11px;
  pointer-events: none;
}

.scan-progress-track {
  width: 110px;
  height: 6px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 0.28);
  border-radius: 3px;
}

.scan-progress-fill {
  height: 100%;
  width: 0;
  border-radius: 3px;
  background-image: linear-gradient(90deg, #56d5ff, #2c93ff);
  /* 和 map.js 里的 CROP_ANALYSIS_BLINK_MAX_MS 对齐：走满就刚好统计完成 */
  animation: scanFill 8s linear forwards;
}

.scan-progress-fill.done {
  width: 100%;
  animation: none;
  background-image: linear-gradient(90deg, #58c98a, #17a673);
}

@keyframes scanFill {
  from { width: 0; }
  to { width: 100%; }
}
</style>
