<template>
  <div id="landType">
    <div class="landUse_p1">
      <span class="legend-title">作物类型</span>
    </div>
    <div class="landUse_p2" id="landUse_p2">
      <div id="legend-container" class="legend-container" ref="landContent">
        <div
          class="legend-item clicked"
          v-for="item in cropInfo"
          v-bind:key="item.index"
          @click="clickItem(item.index)"
        >
          <div
            class="crop-color"
          >
            <img
              :src="item.src"
              style="width: 100%; height: 100%; border-radius: 0"
            />
          </div>
          <span class="crop-name">{{ item.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import useMapStore from "@/stores/map";
import {ref, getCurrentInstance, onMounted} from "vue";
import {storeToRefs} from "pinia";

    let pageInstance = getCurrentInstance();
    let store = useMapStore()
    const {cropInfo} = storeToRefs(store)

    // 初始化
    const initCropLayers = () => {
      if (!store.map || !store.map.addLayer) {
        setTimeout(initCropLayers, 50)
        return
      }

      store.removeCropLayerLine();
      store.removeAdministrativeLayer();
      store.removeCropImageryLayers();

      // store.addCropImageryLayers(); // 作物底图（卫星）
      // store.addAdministrativeLayer(); // 行政区边界
      store.getAndLoadCropInfo(); // 获取作物info，并加载作物layer
    }
    onMounted(initCropLayers)


    // 通过按钮组，切换作物类型
    let clickedItem = ref(-1);
    const clickItem = (index) =>{
      console.log(index);
      if (clickedItem.value === index) {
        for (let i = 0; i < cropInfo.value.length; i++) {
          pageInstance.refs.landContent.children[i].classList.add("clicked");
        }
        clickedItem.value = -1;
        store.loadCrop(cropInfo.value);
      } else {
        for (let i = 0; i < cropInfo.value.length; i++) {
          pageInstance.refs.landContent.children[i].classList.remove("clicked");
        }
        pageInstance.refs.landContent.children[index].classList.add("clicked");
        clickedItem.value = index;
        if(index===5){
          store.removeCropLayer()
        }else{
          store.loadCrop([cropInfo.value[index]]);
        }
      }
    }


</script>


<style scoped>
/* 白底小窗口，钉在页面右下角，各类型竖着排一列 */
#landType {
  position: absolute;
  right: 20px;
  bottom: 28px;
  left: auto;
  top: auto;
  transform: none;
  width: auto;
  height: auto;
  padding: 9px 14px 11px;
  box-sizing: border-box;
  background-color: #ffffff;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  color: #22303f;
}

.landUse_p1 {
  position: static;
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: auto;
  height: auto;
  margin-bottom: 8px;
  text-align: left;
}

.legend-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  color: #1a56c4;
}

.landUse_p2 {
  position: static;
  margin-left: 0;
}

#legend-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.crop-color {
  width: 18px;
  height: 18px;
  margin-right: 7px;
  transition: opacity 0.2s ease;
}

.crop-name {
  font-size: 12px;
  white-space: nowrap;
  color: #22303f;
}

.legend-item.clicked .crop-color {
  opacity: 1;
}

.legend-item:not(.clicked) .crop-color {
  opacity: 0.25;
}

.legend-item:not(.clicked) .crop-name {
  color: #a9b6c6;
}

.legend-item:active .crop-color {
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.3);
}
</style>
