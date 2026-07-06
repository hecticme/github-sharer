import { DEFAULT_CONFIG } from './defaults.js'

/**
 * @typedef {import('./defaults.js').Config} Config
 */

const CONFIG_KEY = 'config'
const INPUT_VALUES_KEY = 'inputValues'
const LAST_TEMPLATE_KEY = 'lastTemplate'

/**
 * Coerce arbitrary stored/imported data into the current config shape, migrating
 * the previous single-template format when encountered.
 *
 * @param {any} raw
 * @returns {Config}
 */
export function migrateConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_CONFIG)
  }

  if (Array.isArray(raw.templates)) {
    return {
      templates: raw.templates,
      fields: Array.isArray(raw.fields) ? raw.fields : [],
    }
  }

  if (typeof raw.template === 'string' || Array.isArray(raw.activeWhen)) {
    return {
      templates: [
        { name: 'Default', when: raw.activeWhen ?? [], body: raw.template ?? '' },
      ],
      fields: Array.isArray(raw.fields) ? raw.fields : [],
    }
  }

  return structuredClone(DEFAULT_CONFIG)
}

/**
 * @returns {Promise<Config>}
 */
export async function loadConfig() {
  const { [CONFIG_KEY]: config } = await chrome.storage.local.get(CONFIG_KEY)
  return config ? migrateConfig(config) : structuredClone(DEFAULT_CONFIG)
}

/**
 * @param {Config} config
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  await chrome.storage.local.set({ [CONFIG_KEY]: config })
}

/**
 * Remembered dropdown selections, keyed by field name.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function loadInputValues() {
  const { [INPUT_VALUES_KEY]: values } = await chrome.storage.local.get(INPUT_VALUES_KEY)
  return values ?? {}
}

/**
 * @param {string} name
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function saveInputValue(name, value) {
  const values = await loadInputValues()
  values[name] = value
  await chrome.storage.local.set({ [INPUT_VALUES_KEY]: values })
}

/**
 * @returns {Promise<string>}
 */
export async function loadLastTemplate() {
  const { [LAST_TEMPLATE_KEY]: name } = await chrome.storage.local.get(LAST_TEMPLATE_KEY)
  return name ?? ''
}

/**
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function saveLastTemplate(name) {
  await chrome.storage.local.set({ [LAST_TEMPLATE_KEY]: name })
}
