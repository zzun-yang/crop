<template>
  <div id="timeSlider">
    <div class="p1">
      <span class="span" style="">10M LAND COVER</span>
      <span class="span" style="color: rgb(75, 112, 125)">CHOSE A YEAR TO VIEW</span>
    </div>
    <div class="p2">
      <div style="position: relative;  top:16%;width: 100%; height: 30%;">
        <input type="range" id="year-slider" :min="YEAR_MIN" :max="YEAR_MAX" step="1" v-model="currentYear"  ref="year-slider"/>
        <div id="play-year-pause-button" style="height:25px;width:25px;background-color: transparent" @click="playOrStopYear">
          <img :src="isYearPlaying?'/img/24gl-pause2.png':'/img/24gl-play.png'" style="height:100%;width:100%">
        </div>
      </div>
      <div class="timeline_year" id="timeline_year">
      <span  class="month" v-for="item in yearInfo" v-bind:key="item.index" :style="item.style">{{item.name}}</span>
      </div>
      <div style="position: relative; top:20%;  width: 100%; height: 30%">
        <input type="range" id="month-slider" min="1" :max="monthMax" step="1" v-model="currentMonth"  style="width: 70%;left: 15%" ref="month-slider"/>
        <div id="play-month-pause-button" style="height:25px;width:25px;background-color: transparent" @click="playOrStopMonth">
          <img :src="isMonthPlaying?'/img/24gl-pause2.png':'/img/24gl-play.png'" style="height:100%;width:100%">
        </div>
      </div>
      <div class="timeline_month" id="timeline_month">
      <span class="month" :class="{ disabled: item.index >= monthMax }" v-for="item in monthInfo" v-bind:key="item.index" :style="item.style">{{item.name}}</span>
    </div>
  </div>
  </div>
</template>

<script setup>
import {computed, onBeforeUnmount, ref, watchEffect} from 'vue'
import {storeToRefs} from 'pinia'
import useMapStore from "@/stores/map";

// 时间区间和农田页的日期时间轴保持一致：2024-01 到 2026-09
const YEAR_MIN = 2024
const YEAR_MAX = 2026
const MONTH_MAX_DEFAULT = 12
const MONTH_MAX_LAST_YEAR = 9 // 最后一年只开放到 9 月

const store = useMapStore()
store.removeCropLayerLine()
store.removeAdministrativeLayer()
store.removeCropImageryLayers()
store.removeClick()
store.isShowFeautureInfo = false
let {isYearPlaying, isMonthPlaying, yearInfo, monthInfo, monthPlayer, yearPlayer} = storeToRefs(store)
let currentYear = ref(YEAR_MIN)
let currentMonth = ref(1)
store.getYearInfo()
store.getMonthInfo()

// 最后一年只到 9 月，其余年份 12 个月
const monthMax = computed(() => currentYear.value >= YEAR_MAX ? MONTH_MAX_LAST_YEAR : MONTH_MAX_DEFAULT)

watchEffect(() => {
  const year = Number(currentYear.value)
  const max = year >= YEAR_MAX ? MONTH_MAX_LAST_YEAR : MONTH_MAX_DEFAULT
  const month = Math.min(Math.max(Number(currentMonth.value), 1), max)
  // 滑块给的是字符串，回写成数字，顺带把超上限的月份收回来
  if(currentYear.value !== year) currentYear.value = year
  if(currentMonth.value !== month) currentMonth.value = month
  const monthText = month < 10 ? '0' + month : '' + month
  store.addTimeData({year, month: monthText})
})

onBeforeUnmount(() => {
  if(isYearPlaying.value){
    clearInterval(yearPlayer.value)
  }
  if(isMonthPlaying.value){
    clearInterval(monthPlayer.value)
  }
})

const playOrStopYear = function () {
  if (isYearPlaying.value) {
    clearInterval(yearPlayer.value)
    isYearPlaying.value = false
    return
  }
  isYearPlaying.value = true
  store.yearPlayer = setInterval(() => {
    currentYear.value = currentYear.value >= YEAR_MAX ? YEAR_MIN : currentYear.value + 1
  }, 2000)
}

const playOrStopMonth = function () {
  if (isMonthPlaying.value) {
    clearInterval(monthPlayer.value)
    isMonthPlaying.value = false
    return
  }
  isMonthPlaying.value = true
  store.monthPlayer = setInterval(() => {
    currentMonth.value = currentMonth.value >= monthMax.value ? 1 : currentMonth.value + 1
  }, 2000)
}
</script>

<style>
#timeSlider .month.disabled {
    opacity: 0.3;
}
</style>
