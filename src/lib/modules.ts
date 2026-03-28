export type ModuleKey = 'notes' | 'lottery' | 'flight' | 'words' | 'quadrant'

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

export const modules: ModuleDefinition[] = [
  {
    key: 'notes',
    title: '\u7b14\u8bb0\u7cfb\u7edf',
    subtitle: '\u8bb0\u5f55\u4e0e\u521b\u4f5c',
    color: '#9b6dff',
    colorSoft: '#d8c3ff',
    publicEntry: 'modules/notes/index.html',
    orbit: {
      size: '220px',
      duration: '22s',
      delay: '-2s',
      rotation: '-16deg'
    }
  },
  {
    key: 'lottery',
    title: '\u62bd\u5956\u8f6c\u76d8',
    subtitle: '\u5de5\u5177\u4e0e\u5a31\u4e50',
    color: '#4da3ff',
    colorSoft: '#bee3ff',
    publicEntry: 'modules/lottery/index.html',
    orbit: {
      size: '340px',
      duration: '28s',
      delay: '-7s',
      rotation: '18deg'
    }
  },
  {
    key: 'flight',
    title: '\u822a\u73ed\u67e5\u8be2',
    subtitle: '\u67e5\u8be2\u4e0e\u68c0\u7d22',
    color: '#ff6a78',
    colorSoft: '#ffc1c9',
    publicEntry: 'modules/flight/index.html',
    orbit: {
      size: '460px',
      duration: '32s',
      delay: '-12s',
      rotation: '48deg'
    }
  },
  {
    key: 'words',
    title: '\u5355\u8bcd\u7cfb\u7edf',
    subtitle: '\u5b66\u4e60\u4e0e\u8bad\u7ec3',
    color: '#efd8aa',
    colorSoft: '#fff1ce',
    publicEntry: 'modules/words/index.html',
    orbit: {
      size: '580px',
      duration: '37s',
      delay: '-18s',
      rotation: '-34deg'
    }
  },
  {
    key: 'quadrant',
    title: '\u56db\u8c61\u9650\u56fe',
    subtitle: '\u5750\u6807\u4e0e\u8bb0\u5f55',
    color: '#0b0b0b',
    colorSoft: '#6e6e6e',
    publicEntry: 'modules/quadrant/index.html',
    orbit: {
      size: '700px',
      duration: '44s',
      delay: '-9s',
      rotation: '12deg'
    }
  },
]

export const modulesByKey = Object.fromEntries(
  modules.map((module) => [module.key, module])
) as Record<ModuleKey, ModuleDefinition>
