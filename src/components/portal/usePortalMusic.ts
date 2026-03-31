import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type PortalMusicTrackSummary = {
  id: string
  name: string
  size: number
  createdAt: number
}

type StoredTrackRecord = PortalMusicTrackSummary & {
  type: string
  blob: Blob
}

const DB_NAME = 'shanlic-portal-music-db'
const DB_VERSION = 1
const STORE_NAME = 'tracks'
const SELECTED_TRACK_KEY = 'shanlic_portal_music_selected'

function persistSelectedTrackId(trackId: string | null) {
  try {
    if (trackId) {
      window.localStorage.setItem(SELECTED_TRACK_KEY, trackId)
    } else {
      window.localStorage.removeItem(SELECTED_TRACK_KEY)
    }
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

function readSelectedTrackId() {
  try {
    return window.localStorage.getItem(SELECTED_TRACK_KEY)
  } catch {
    return null
  }
}

function createTrackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `music_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function stripMp3Extension(fileName: string) {
  return fileName.replace(/\.mp3$/i, '').trim() || '未命名音乐'
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open music database'))
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return openDatabase().then((database) => {
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      const request = runner(store)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Music store request failed'))
      transaction.oncomplete = () => database.close()
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('Music store transaction failed'))
        database.close()
      }
      transaction.onabort = () => {
        reject(transaction.error ?? new Error('Music store transaction aborted'))
        database.close()
      }
    })
  })
}

function listStoredTracks() {
  return withStore<StoredTrackRecord[]>('readonly', (store) => store.getAll())
}

function readStoredTrack(trackId: string) {
  return withStore<StoredTrackRecord | undefined>('readonly', (store) => store.get(trackId))
}

function writeStoredTrack(record: StoredTrackRecord) {
  return withStore<IDBValidKey>('readwrite', (store) => store.put(record))
}

function deleteStoredTrack(trackId: string) {
  return withStore<undefined>('readwrite', (store) => store.delete(trackId))
}

function sortTrackSummaries(records: StoredTrackRecord[]) {
  return records
    .map(({ id, name, size, createdAt }) => ({ id, name, size, createdAt }))
    .sort((left, right) => right.createdAt - left.createdAt)
}

export function usePortalMusic() {
  const musicTracks = ref<PortalMusicTrackSummary[]>([])
  const selectedTrackId = ref<string | null>(null)
  const autoplayBlocked = ref(false)
  const playbackState = ref<'empty' | 'stopped' | 'loading' | 'playing' | 'error'>('empty')

  let audio: HTMLAudioElement | null = null
  let currentTrackUrl: string | null = null
  let currentLoadedTrackId: string | null = null

  const selectedTrack = computed(() => {
    return musicTracks.value.find((track) => track.id === selectedTrackId.value) ?? null
  })

  const musicLabel = computed(() => {
    if (musicTracks.value.length === 0) {
      return '当前播放：还没有导入 MP3'
    }

    if (!selectedTrack.value) {
      return '当前播放：音乐已关闭'
    }

    if (playbackState.value === 'loading') {
      return `当前播放：${selectedTrack.value.name} · 正在加载`
    }

    if (autoplayBlocked.value) {
      return `当前播放：${selectedTrack.value.name} · 自动播放被浏览器拦截，点一下页面即可继续`
    }

    if (playbackState.value === 'error') {
      return `当前播放：${selectedTrack.value.name} · 播放失败`
    }

    return `当前播放：${selectedTrack.value.name}`
  })

  function clearTrackUrl() {
    if (currentTrackUrl) {
      URL.revokeObjectURL(currentTrackUrl)
      currentTrackUrl = null
    }
    currentLoadedTrackId = null
  }

  function ensureAudioElement() {
    if (audio) return audio

    audio = new Audio()
    audio.preload = 'auto'
    audio.loop = true
    audio.volume = 0.78

    audio.addEventListener('playing', () => {
      playbackState.value = 'playing'
      autoplayBlocked.value = false
    })

    audio.addEventListener('pause', () => {
      if (playbackState.value !== 'error' && selectedTrackId.value) {
        playbackState.value = 'stopped'
      }
    })

    audio.addEventListener('error', () => {
      playbackState.value = 'error'
    })

    return audio
  }

  async function refreshTrackLibrary(preferredTrackId: string | null = selectedTrackId.value) {
    const records = await listStoredTracks()
    const summaries = sortTrackSummaries(records)
    musicTracks.value = summaries

    const nextTrackId = preferredTrackId && summaries.some((track) => track.id === preferredTrackId)
      ? preferredTrackId
      : (summaries[0]?.id ?? null)

    selectedTrackId.value = nextTrackId
    persistSelectedTrackId(nextTrackId)

    if (!nextTrackId) {
      playbackState.value = 'empty'
      autoplayBlocked.value = false
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      clearTrackUrl()
    }
  }

  async function loadSelectedTrackSource() {
    const trackId = selectedTrackId.value
    if (!trackId) return null

    if (currentLoadedTrackId === trackId && audio) {
      return audio
    }

    const nextAudio = ensureAudioElement()
    const record = await readStoredTrack(trackId)
    if (!record) {
      await refreshTrackLibrary(null)
      return null
    }

    clearTrackUrl()
    currentTrackUrl = URL.createObjectURL(record.blob)
    currentLoadedTrackId = trackId
    nextAudio.src = currentTrackUrl
    nextAudio.load()
    return nextAudio
  }

  async function playSelectedTrack(attemptAutoplay = false) {
    if (!selectedTrackId.value) return

    playbackState.value = 'loading'
    const nextAudio = await loadSelectedTrackSource()
    if (!nextAudio) return

    try {
      await nextAudio.play()
      autoplayBlocked.value = false
      playbackState.value = 'playing'
    } catch {
      autoplayBlocked.value = true
      playbackState.value = 'stopped'
      if (!attemptAutoplay) {
        playbackState.value = 'error'
      }
    }
  }

  function stopPlayback(resetTime = false) {
    if (!audio) return

    audio.pause()
    if (resetTime) {
      audio.currentTime = 0
    }

    if (selectedTrackId.value) {
      playbackState.value = 'stopped'
    }
  }

  async function selectTrack(trackId: string | null) {
    selectedTrackId.value = trackId
    persistSelectedTrackId(trackId)
    autoplayBlocked.value = false

    if (!trackId) {
      stopPlayback(true)
      playbackState.value = musicTracks.value.length === 0 ? 'empty' : 'stopped'
      return
    }

    await playSelectedTrack(false)
  }

  async function importTracks(files: File[]) {
    const mp3Files = files.filter((file) => {
      const lowerName = file.name.toLowerCase()
      return file.type === 'audio/mpeg' || lowerName.endsWith('.mp3')
    })

    if (mp3Files.length === 0) {
      return
    }

    let firstImportedId: string | null = null

    for (const file of mp3Files) {
      const record: StoredTrackRecord = {
        id: createTrackId(),
        name: stripMp3Extension(file.name),
        size: file.size,
        createdAt: Date.now(),
        type: file.type || 'audio/mpeg',
        blob: file,
      }

      if (!firstImportedId) {
        firstImportedId = record.id
      }

      await writeStoredTrack(record)
    }

    await refreshTrackLibrary(firstImportedId)
    if (firstImportedId) {
      await playSelectedTrack(false)
    }
  }

  async function removeTrack(trackId: string) {
    const wasSelected = selectedTrackId.value === trackId
    await deleteStoredTrack(trackId)

    if (wasSelected && currentLoadedTrackId === trackId) {
      stopPlayback(true)
      clearTrackUrl()
    }

    await refreshTrackLibrary(wasSelected ? null : selectedTrackId.value)

    if (wasSelected && selectedTrackId.value) {
      await playSelectedTrack(true)
    }
  }

  async function initializeMusic() {
    ensureAudioElement()
    await refreshTrackLibrary(readSelectedTrackId())

    if (selectedTrackId.value) {
      await playSelectedTrack(true)
    }
  }

  async function handleWindowPointerDown() {
    if (!selectedTrackId.value || !autoplayBlocked.value) return
    await playSelectedTrack(false)
  }

  onMounted(() => {
    void initializeMusic()
    window.addEventListener('pointerdown', handleWindowPointerDown, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', handleWindowPointerDown)
    stopPlayback(true)
    clearTrackUrl()
    if (audio) {
      audio.src = ''
      audio.load()
      audio = null
    }
  })

  return {
    importTracks,
    musicLabel,
    musicTracks,
    removeTrack,
    selectTrack,
    selectedTrackId,
  }
}
