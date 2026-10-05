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
    center:[78.25, 45.72],
    zoom:7.15,
    projection: 'EPSG:4326'
  })
  map.value.setView(view)
}

onMounted(setMapView)
</script>

<style scoped>
#bottom_right {
  width: 100%;
  pointer-events: none;
}
</style>
