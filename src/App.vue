<template>
  <!-- 主容器 -->
  <div id="app">
    <!-- 标题 -->
    <h1>Welcome to My Simple Vue App</h1>

    <nav>
      <router-link to="/">Home</router-link> |
      <li> <a href="/2048.html"> AI 生成的小游戏 2048 </a></li>
      <li><a href="/snake.html"> AI 生成的小游戏 贪吃蛇 </a></li>
      <li><a href="/workplace-seating-query-system.html">工位查询</a></li>
      <li><a href="/frontend-implementation.html">工位查询(带仿真)</a></li>
      <li><a href="/drama_index.html">AI Agent 内容</a></li>
      <li><a href="/test_duiba.html">iframe 测试</a></li>
      <li><a href="/reading-style-quiz-page.html">读书风格测试</a></li>
    </nav>

    <!-- 按钮，点击触发方法 -->
    <button @click="toggleText">Toggle Text</button>
    <!-- 显示或隐藏的文本区域 -->
    <p v-if="showText" class="animated-text">This is some cool text that can appear and disappear!</p>
    <!-- 鼠标悬停变色的元素 -->
    <!-- 修改这一行，绑定背景颜色 -->
    <div class="hover-color-change" @mouseenter="changeColor('red')" @mouseleave="changeColor('blue')"
      :style="{ backgroundColor: textColor }">
      Hover me to change color
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

// 定义响应式变量，控制文本的显示与隐藏
const showText = ref(true);
// 定义响应式变量，存储元素的颜色
const textColor = ref('blue');

// 切换文本显示状态的方法
const toggleText = () => {
  showText.value = !showText.value;
};

// 改变元素颜色的方法
const changeColor = (color) => {
  textColor.value = color;
};
</script>

<style scoped>
/* 主容器样式 */
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

/* 按钮样式 */
button {
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
}

/* 动画文本样式 */
.animated-text {
  animation: fadeInOut 0.5s ease;
}

/* 定义淡入淡出动画 */
@keyframes fadeInOut {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* 鼠标悬停变色元素样式 */
.hover-color-change {
  margin-top: 20px;
  padding: 10px;
  color: white;
  transition: background-color 0.3s;
}
</style>