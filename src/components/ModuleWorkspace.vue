<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ModuleDefinition } from '../lib/modules'

const props = defineProps<{
  module: ModuleDefinition
}>()

const emit = defineEmits<{
  back: []
}>()

const frameKey = ref(0)
const frameSrc = computed(() => props.module.publicEntry)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('back')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <section class="workspace-shell">
    <iframe
      :key="frameKey"
      class="workspace-frame"
      :src="frameSrc"
      :title="module.title"
    ></iframe>
  </section>
</template>

<style scoped>
.workspace-shell {
  min-height: 100vh;
  background: #050914;
}

.workspace-frame {
  width: 100%;
  height: 100vh;
  border: 0;
  background: #ffffff;
}
</style>
