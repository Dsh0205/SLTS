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
    moduleId: 'words',
    pathSuffix: '/modules/words/index.html',
    keys: ['word-practice-data-v2'],
  },
  {
    moduleId: 'hobby',
    pathSuffix: '/modules/hobby/index.html',
    keys: ['hobby-tracker-monthly-v1'],
  },
])

module.exports = {
  STORAGE_MANIFEST,
}
