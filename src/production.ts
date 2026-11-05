import type { Setup } from './app'
import { defaults, type Settings } from './settings'
import release from './release.json'
import { productionStrategy } from 'virtual:production-strategy'

const { shape: _shape, ...releaseSettings } = release.settings
const settings: Settings = { ...defaults, ...releaseSettings as Partial<Settings> }

export const setup: Setup = () => ({ settings, strategy: () => productionStrategy })
