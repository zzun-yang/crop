<template>
  <div id="bottom_right">
    <time-slider/>
  </div>
</template>

<script setup>
import TimeSlider from "@/components/part/time-slider";
import {View} from 'ol'
import useMapStore from "@/stores/map";
import {storeToRefs} from "pinia";
import {onMounted} from "vue";
const store = useMapStore()
let {map} = storeToRefs(store)
const setMapView = () => {
  if (!map.value || !map.value.setView) {
    setTimeout(setMapView, 50)
    return
  }

  const view = new View({
    center:[(85.759192+90.764236)/2, (44.044693+44.438904)/2],
    zoom:9,
    projection: 'EPSG:4326'
  })
  map.value.setView(view)
}

onMounted(setMapView)
</script>

<style scoped>
/* 时序页的年份/月份滑杆仍然贴在底部，这里单独给它一条底色 */
#bottom_right {
  width: 100%;
  pointer-events: auto;
  background-color: rgb(12, 44, 54);
  background-image: -webkit-linear-gradient(-45deg,
    rgba(0, 0, 0, .2) 25%,
    transparent 25%,
    transparent 50%,
    rgba(0, 0, 0, .2) 50%,
    rgba(0, 0, 0, .2) 75%,
    transparent 75%,
    transparent);
  background-size: 7px 7px;
}
</style>
