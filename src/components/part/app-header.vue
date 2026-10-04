<template>
  <header class="app-header">
    <div class="app-brand">
      <span class="app-mark" aria-hidden="true"></span>
      <h1 class="app-title">巴尔喀什湖流域农业时空智能平台</h1>
    </div>
    <nav class="app-menu">
      <button
        v-for="item in items"
        :key="item.name"
        class="app-menu-item"
        :class="{ active: isActive(item.name) }"
        :title="item.label"
        @click="go(item.name)"
      >{{ item.label }}</button>
    </nav>
  </header>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 四大一级模块。“时空数据”复用已有的时序页面 timeSeriesData
const items = [
  { name: 'timeSeriesData', label: '时空数据' },
  { name: 'agriParcel', label: '农业地块' },
  { name: 'cropClassification', label: '作物结构' },
  { name: 'cropWaterRequirement', label: '水资源消耗' }
]

const isActive = name => route.name === name

const go = name => {
  if (route.name !== name) router.push({ name })
}
</script>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1200;
  /* 父容器 #bottom 设了 pointer-events: none，这里要显式收回点击 */
  pointer-events: auto;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 22px;
  box-sizing: border-box;
  background-image: linear-gradient(180deg, #ffffff 0%, #f6faff 100%);
  border-bottom: 1px solid #e2ecf8;
  box-shadow: 0 2px 10px rgba(18, 51, 107, 0.07);
}

/* 底部一条渐隐的蓝色装饰线 */
.app-header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background-image: linear-gradient(90deg, #1a73e8 0%, #58a6ff 38%, rgba(26, 115, 232, 0) 100%);
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-mark {
  flex: 0 0 auto;
  width: 5px;
  height: 22px;
  border-radius: 3px;
  background-image: linear-gradient(180deg, #1a73e8, #63a8fb);
}

.app-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1.2px;
  color: #12336b;
}

.app-menu {
  flex: 0 0 auto;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-menu-item {
  position: relative;
  padding: 8px 16px;
  font-family: inherit;
  font-size: 14px;
  white-space: nowrap;
  color: #1a56c4;
  background-color: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.app-menu-item:hover {
  background-color: #e8f1fd;
}

.app-menu-item.active {
  font-weight: 600;
  color: #ffffff;
  background-image: linear-gradient(135deg, #1a73e8, #3f8ef5);
  box-shadow: 0 2px 8px rgba(26, 115, 232, 0.35);
}
</style>
