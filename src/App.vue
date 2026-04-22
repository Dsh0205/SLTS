<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ModuleWorkspace from './components/ModuleWorkspace.vue'
import PortalScene from './components/PortalScene.vue'
import { centerModule, modulesByKey, orbitModules, type ModuleDefinition, type ModuleKey } from './lib/modules'

const activeModuleKey = ref<ModuleKey | null>(null)

const activeModule = computed<ModuleDefinition | null>(() => {
  return activeModuleKey.value ? modulesByKey[activeModuleKey.value] : null
})

function openModule(moduleKey: ModuleKey) {
  if (activeModuleKey.value === moduleKey && window.location.hash === `#/module/${moduleKey}`) {
    return
  }

  activeModuleKey.value = moduleKey
  window.location.hash = `#/module/${moduleKey}`
}

function returnHome() {
  if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
    activeModuleKey.value = null
    return
  }

  window.location.hash = '#/'
}

function resolveRoute() {
  const hash = window.location.hash || '#/'
  const moduleMatch = hash.match(/^#\/module\/([a-z0-9_-]+)$/i)

  if (!moduleMatch) {
    activeModuleKey.value = null
    return
  }

  const candidate = moduleMatch[1] as ModuleKey
  activeModuleKey.value = modulesByKey[candidate] ? candidate : null
}

onMounted(() => {
  resolveRoute()
  window.addEventListener('hashchange', resolveRoute)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', resolveRoute)
})
</script>

<template>
  <div class="app-shell">
    <PortalScene
      v-if="!activeModule"
      :modules="orbitModules"
      :center-module="centerModule"
      @open-module="openModule"
    />
    <ModuleWorkspace
      v-else
      :module="activeModule"
      @back="returnHome"
    />
  </div>
</template>
