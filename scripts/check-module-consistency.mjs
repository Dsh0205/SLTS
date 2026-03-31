import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const modulesFile = path.join(projectRoot, 'src', 'lib', 'modules.ts')
const publicModulesDir = path.join(projectRoot, 'public', 'modules')
const storageManifestFile = path.join(projectRoot, 'electron', 'lib', 'storage-manifest.cjs')
const moduleConsistencyConfigFile = path.join(projectRoot, 'scripts', 'module-consistency.config.json')

const moduleConsistencyConfig = JSON.parse(fs.readFileSync(moduleConsistencyConfigFile, 'utf8'))
const allowedUnregisteredPublicModules = new Set(
  moduleConsistencyConfig.allowedUnregisteredPublicModules || [],
)

const modulesSource = fs.readFileSync(modulesFile, 'utf8')
const registeredModules = [...modulesSource.matchAll(/createModule\(\s*'([^']+)'/g)].map((match) => match[1])
const uniqueRegisteredModules = [...new Set(registeredModules)].sort()

const publicModuleDirs = fs
  .readdirSync(publicModulesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'shared' && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort()

const { STORAGE_MANIFEST } = require(storageManifestFile)
const mirroredModuleIds = [...new Set(STORAGE_MANIFEST.map((entry) => entry.moduleId))].sort()

const errors = []
const warnings = []

if (registeredModules.length !== uniqueRegisteredModules.length) {
  errors.push('Duplicate module keys found in src/lib/modules.ts.')
}

const missingPublicEntries = uniqueRegisteredModules.filter((moduleKey) => {
  return !fs.existsSync(path.join(publicModulesDir, moduleKey, 'index.html'))
})

if (missingPublicEntries.length > 0) {
  errors.push(`Registered modules missing public entry files: ${missingPublicEntries.join(', ')}`)
}

const staleMirroredModules = mirroredModuleIds.filter((moduleId) => !uniqueRegisteredModules.includes(moduleId))
if (staleMirroredModules.length > 0) {
  errors.push(`Desktop storage manifest references inactive modules: ${staleMirroredModules.join(', ')}`)
}

const missingMirroredEntries = STORAGE_MANIFEST.filter((entry) => {
  const relativePath = entry.pathSuffix.replace(/^\//, '')
  return !fs.existsSync(path.join(projectRoot, 'public', relativePath))
})

if (missingMirroredEntries.length > 0) {
  const missingList = missingMirroredEntries.map((entry) => `${entry.moduleId}:${entry.pathSuffix}`)
  errors.push(`Desktop storage manifest points to missing files: ${missingList.join(', ')}`)
}

const unregisteredPublicModules = publicModuleDirs.filter((moduleDir) => !uniqueRegisteredModules.includes(moduleDir))
const unexpectedUnregisteredPublicModules = unregisteredPublicModules.filter(
  (moduleDir) => !allowedUnregisteredPublicModules.has(moduleDir),
)

if (unexpectedUnregisteredPublicModules.length > 0) {
  warnings.push(`Unregistered module directories still exist under public/modules: ${unexpectedUnregisteredPublicModules.join(', ')}`)
}

const missingAllowedPublicModules = [...allowedUnregisteredPublicModules].filter(
  (moduleDir) => !publicModuleDirs.includes(moduleDir),
)

if (missingAllowedPublicModules.length > 0) {
  warnings.push(`Allowed auxiliary module directories are missing from public/modules: ${missingAllowedPublicModules.join(', ')}`)
}

console.log(`Registered modules: ${uniqueRegisteredModules.join(', ')}`)
console.log(`Public module directories: ${publicModuleDirs.join(', ')}`)
console.log(`Desktop-mirrored modules: ${mirroredModuleIds.join(', ') || '(none)'}`)
console.log(`Allowed auxiliary public modules: ${[...allowedUnregisteredPublicModules].join(', ') || '(none)'}`)

warnings.forEach((warning) => {
  console.warn(`Warning: ${warning}`)
})

if (errors.length > 0) {
  errors.forEach((error) => {
    console.error(`Error: ${error}`)
  })
  process.exit(1)
}

console.log('Module consistency checks passed.')
