<template>
  <div class="bottom-pill ts-pill">
    <span class="ts-pill-label">年份</span>

    <div class="ts-years">
      <div class="ts-line"></div>
      <button
        v-for="item in stops"
        :key="item.year"
        type="button"
        class="ts-stop"
        :class="{ active: item.year === year }"
        :style="{ left: item.left }"
        :title="item.year + ' 年'"
        @click="pickYear(item.year)"
      >
        <span class="ts-dot"></span>
        <span class="ts-year">{{ item.year }}</span>
      </button>
    </div>

    <label class="ts-month">
      <span>月份</span>
      <select :value="month" @change="pickMonth(Number($event.target.value))">
        <option v-for="m in 12" :key="m" :value="m">{{ m }} 月</option>
      </select>
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import useMapStore from '@/stores/map'

const store = useMapStore()
const { temporalYear, temporalMonth } = storeToRefs(store)

const YEARS = [2024, 2025, 2026]

const year = computed(() => Number(temporalYear.value))
const month = computed(() => Number(temporalMonth.value))
const stops = computed(() => YEARS.map((value, index) => ({
  year: value,
  left: `${(index / (YEARS.length - 1)) * 100}%`
})))

const pickYear = value => store.setTemporalPeriod({ year: value, month: month.value })
const pickMonth = value => store.setTemporalPeriod({ year: year.value, month: value })
</script>

<style scoped>
.ts-pill {
  padding: 8px 22px 6px;
  gap: 20px;
}

.ts-pill-label {
  flex: 0 0 auto;
  color: var(--ink-300);
  font-size: 12px;
}

.ts-years {
  position: relative;
  flex: 1 1 auto;
  height: 46px;
  min-width: 0;
}

.ts-line {
  position: absolute;
  top: 6px;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 1px;
  background-color: #cfe0f5;
}

.ts-stop {
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 0;
  transform: translateX(-50%);
  color: var(--ink-900);
  background: none;
  border: 0;
  cursor: pointer;
}

.ts-dot {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid var(--brand-400);
  border-radius: 50%;
  background-color: #fff;
}

.ts-year {
  font-size: 12px;
  white-space: nowrap;
}

.ts-stop.active .ts-dot {
  border-color: var(--brand-500);
  background-color: var(--brand-500);
  box-shadow: 0 0 0 3px rgba(21, 110, 228, 0.18);
}

.ts-stop.active .ts-year {
  color: var(--brand-500);
  font-weight: 600;
}

.ts-month {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  color: var(--ink-300);
  font-size: 12px;
}

.ts-month select {
  padding: 3px 6px;
  color: var(--ink-900);
  background-color: #f4f8fd;
  border: 1px solid #d8e5f5;
  border-radius: 5px;
  font-family: inherit;
  font-size: 12px;
}
</style>
