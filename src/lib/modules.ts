export type ModuleKey = 'notes' | 'lottery' | 'flight' | 'photography' | 'words' | 'quadrant' | 'hobby'

export interface ModuleDefinition {
  key: ModuleKey
  title: string
  subtitle: string
  color: string
  colorSoft: string
  publicEntry: string
  orbit: {
    size: string
    duration: string
    delay: string
    rotation: string
  }
}

type OrbitDefinition = ModuleDefinition['orbit']

function createModule(
  key: ModuleKey,
  title: string,
  subtitle: string,
  color: string,
  colorSoft: string,
  publicEntry: string,
  orbit: OrbitDefinition,
): ModuleDefinition {
  return { key, title, subtitle, color, colorSoft, publicEntry, orbit }
}

export const orbitModules: ModuleDefinition[] = [
  createModule('notes', '\u7b14\u8bb0\u7cfb\u7edf', '\u8bb0\u5f55\u4e0e\u521b\u4f5c', '#9b6dff', '#d8c3ff', 'modules/notes/index.html', {
    size: '220px',
    duration: '22s',
    delay: '-2s',
    rotation: '-16deg',
  }),
  createModule('lottery', '\u62bd\u5956\u8f6c\u76d8', '\u5de5\u5177\u4e0e\u5a31\u4e50', '#4da3ff', '#bee3ff', 'modules/lottery/index.html', {
    size: '340px',
    duration: '28s',
    delay: '-7s',
    rotation: '18deg',
  }),
  createModule('flight', '\u822a\u73ed\u67e5\u8be2', '\u67e5\u8be2\u4e0e\u68c0\u7d22', '#ff6a78', '#ffc1c9', 'modules/flight/index.html', {
    size: '460px',
    duration: '32s',
    delay: '-12s',
    rotation: '48deg',
  }),
  createModule('photography', '\u6444\u5f71\u4f5c\u54c1\u5730\u56fe', '\u5730\u56fe\u4e0e\u4f5c\u54c1\u5c55\u793a', '#27b06e', '#9af3c1', 'modules/photography/index.html', {
    size: '520px',
    duration: '35s',
    delay: '-16s',
    rotation: '-38deg',
  }),
  createModule('words', '\u5355\u8bcd\u7cfb\u7edf', '\u5b66\u4e60\u4e0e\u8bad\u7ec3', '#efd8aa', '#fff1ce', 'modules/words/index.html', {
    size: '580px',
    duration: '37s',
    delay: '-18s',
    rotation: '-34deg',
  }),
  createModule('quadrant', '\u56db\u8c61\u9650\u56fe', '\u5750\u6807\u4e0e\u8bb0\u5f55', '#0b0b0b', '#6e6e6e', 'modules/quadrant/index.html', {
    size: '700px',
    duration: '44s',
    delay: '-9s',
    rotation: '12deg',
  }),
]

for (const module of orbitModules) {
  if (module.key === 'quadrant') {
    module.title = '\u5feb\u6377\u7ed8\u56fe\u677f'
    module.subtitle = '\u65f6\u95f4\u8f74\u4e0e\u5173\u7cfb\u7bad\u5934'
  }
}

export const centerModule: ModuleDefinition = createModule(
  'hobby',
  '\u7231\u597d\u8ffd\u8e2a\u8868',
  '\u6708\u5ea6\u8bb0\u5f55\u4e0e\u6253\u5361',
  '#ff9b32',
  '#ffd08a',
  'modules/hobby/index.html',
  {
    size: '0px',
    duration: '0s',
    delay: '0s',
    rotation: '0deg',
  },
)

export const modules: ModuleDefinition[] = [
  ...orbitModules,
  centerModule,
]

export const modulesByKey = Object.fromEntries(
  modules.map((module) => [module.key, module])
) as Record<ModuleKey, ModuleDefinition>
