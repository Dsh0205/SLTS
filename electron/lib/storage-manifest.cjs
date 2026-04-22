const STORAGE_MANIFEST = Object.freeze([
  {
    moduleId: 'notes',
    pathSuffix: '/modules/notes/index.html',
    keys: ['shanlic_notes'],
  },
  {
    moduleId: 'notes',
    pathSuffix: '/modules/notes/floating.html',
    keys: ['shanlic_notes'],
  },
  {
    moduleId: 'flight',
    pathSuffix: '/modules/flight/index.html',
    keys: ['entries-v1', 'entries-invalid-v1', 'site-theme'],
  },
  {
    moduleId: 'photography',
    pathSuffix: '/modules/photography/index.html',
    keys: ['shanlic-photography-map-v1'],
  },
  {
    moduleId: 'photography',
    pathSuffix: '/modules/photography/gallery.html',
    keys: ['shanlic-photography-map-v1'],
  },
  {
    moduleId: 'words',
    pathSuffix: '/modules/words/index.html',
    keys: ['word-practice-data-v2'],
  },
  {
    moduleId: 'quadrant',
    pathSuffix: '/modules/quadrant/index.html',
    keys: ['shanlic-time-planner-v1'],
  },
  {
    moduleId: 'hobby',
    pathSuffix: '/modules/hobby/index.html',
    keys: ['usage-checkin-heatmap-v1', 'focus-timer-state-v1'],
  },
])

module.exports = {
  STORAGE_MANIFEST,
}
