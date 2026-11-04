import type { Setup } from './app'
import { defaults, type Settings } from './settings'
import release from './release.json'
import { productionStrategy } from 'virtual:production-strategy'

const settings: Settings = { ...defaults, ...release.settings as Partial<Settings>, shape: 'circle' }

export const setup: Setup = () => ({ settings, strategy: () => productionStrategy })
