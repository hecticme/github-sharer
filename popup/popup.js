import {
  loadConfig,
  loadInputValues,
  loadLastTemplate,
  saveInputValue,
  saveLastTemplate,
} from '../shared/storage.js'
import {
  extractUrlField,
  matchingTemplates,
  prepareSelectorFields,
  renderHtml,
  renderText,
  tokensIn,
} from '../shared/engine.js'

/**
 * @typedef {import('../shared/defaults.js').Config} Config
 * @typedef {import('../shared/defaults.js').Field} Field
 * @typedef {import('../shared/defaults.js').Template} Template
 * @typedef {import('../shared/engine.js').FieldValue} FieldValue
 */

const templatePickerElement = /** @type {HTMLDivElement} */ (document.getElementById('template-picker'))
const inputsElement = /** @type {HTMLDivElement} */ (document.getElementById('inputs'))
const outputElement = /** @type {HTMLTextAreaElement} */ (document.getElementById('output'))
const copyButtonElement = /** @type {HTMLButtonElement} */ (document.getElementById('copy'))
const settingsButtonElement = /** @type {HTMLButtonElement} */ (document.getElementById('settings'))

/** @type {Config | null} */
let config = null

/** @type {Record<string, FieldValue>} */
const values = {}

/** @type {Array<Template>} */
let available = []

/** @type {Template | null} */
let selected = null

/** @type {ReturnType<typeof setTimeout> | null} */
let copyTimeout = null

function refreshOutput() {
  if (selected) {
    outputElement.value = renderText(selected.body, values)
  }
}

function disableEverything() {
  copyButtonElement.setAttribute('disabled', '')
  outputElement.setAttribute('disabled', '')
}

/**
 * @param {Field} field
 */
function renderInputDropdown(field) {
  const label = document.createElement('label')
  label.className = 'label'
  label.textContent = field.name
  label.setAttribute('for', `input-${field.name}`)

  const select = document.createElement('select')
  select.className = 'select'
  select.id = `input-${field.name}`

  const current = values[field.name]?.text

  for (const option of field.options ?? []) {
    const optionElement = document.createElement('option')
    optionElement.value = option
    optionElement.textContent = option
    optionElement.selected = option === current
    select.append(optionElement)
  }

  select.addEventListener('change', async event => {
    const { value } = /** @type {HTMLSelectElement} */ (event.target)
    values[field.name] = { text: value, html: value, raw: false }
    await saveInputValue(field.name, value)
    refreshOutput()
  })

  inputsElement.append(label, select)
}

/**
 * Show only the input dropdowns referenced by the selected template.
 */
function renderInputs() {
  inputsElement.replaceChildren()

  if (!config || !selected) {
    return
  }

  const referenced = new Set(tokensIn(selected.body))

  for (const field of config.fields) {
    if (field.type === 'input' && referenced.has(field.name)) {
      renderInputDropdown(field)
    }
  }
}

/**
 * @param {Template} template
 */
function selectTemplate(template) {
  selected = template
  renderInputs()
  refreshOutput()
}

function renderPicker() {
  templatePickerElement.replaceChildren()

  if (available.length <= 1) {
    return
  }

  const label = document.createElement('label')
  label.className = 'label'
  label.textContent = 'Template'
  label.setAttribute('for', 'template-select')

  const select = document.createElement('select')
  select.className = 'select'
  select.id = 'template-select'

  available.forEach((template, index) => {
    const optionElement = document.createElement('option')
    optionElement.value = String(index)
    optionElement.textContent = template.name || `Template ${index + 1}`
    optionElement.selected = template === selected
    select.append(optionElement)
  })

  select.addEventListener('change', async event => {
    const { value } = /** @type {HTMLSelectElement} */ (event.target)
    const template = available[Number(value)]
    selectTemplate(template)
    await saveLastTemplate(template.name)
  })

  templatePickerElement.append(label, select)
}

/**
 * @param {string} url
 * @param {number | undefined} tabId
 */
async function extractSelectorFields(url, tabId) {
  if (!config) {
    return
  }

  const selectorFields = prepareSelectorFields(url, config.fields)

  if (selectorFields.length === 0 || tabId == null) {
    for (const field of selectorFields) {
      values[field.name] = { text: field.fallback, html: field.fallback, raw: true }
    }
    return
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [selectorFields],
      func: fields => {
        /** @type {Record<string, { text: string, html: string }>} */
        const extracted = {}

        for (const field of fields) {
          let text = field.fallback
          let html = field.fallback

          for (const selector of field.selectors) {
            let element = null
            try {
              element = /** @type {HTMLElement | null} */ (document.querySelector(selector))
            } catch {
              element = null
            }

            if (element) {
              text = element.innerText.trim()
              html = element.innerHTML.trim()
              break
            }
          }

          extracted[field.name] = { text, html }
        }

        return extracted
      },
    })

    for (const [name, { text, html }] of Object.entries(result ?? {})) {
      values[name] = { text, html, raw: true }
    }
  } catch {
    for (const field of selectorFields) {
      values[field.name] = { text: field.fallback, html: field.fallback, raw: true }
    }
  }
}

async function init() {
  config = await loadConfig()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url ?? ''

  available = matchingTemplates(url, config.templates)

  if (available.length === 0) {
    outputElement.value = 'No templates match this page.\nAdd or adjust templates in the settings.'
    disableEverything()
    return
  }

  const inputValues = await loadInputValues()

  for (const field of config.fields) {
    if (field.type === 'input') {
      const options = field.options ?? []
      const stored = inputValues[field.name]
      const initial = options.includes(stored)
        ? stored
        : (field.default ?? options[0] ?? '')

      values[field.name] = { text: initial, html: initial, raw: false }
    } else if (field.type === 'url') {
      const value = extractUrlField(url, field)
      values[field.name] = { text: value, html: value, raw: false }
    }
  }

  await extractSelectorFields(url, tab?.id)

  const lastName = await loadLastTemplate()
  selected = available.find(template => template.name === lastName) ?? available[0]

  renderPicker()
  selectTemplate(selected)
}

copyButtonElement.addEventListener('click', async () => {
  if (!selected) {
    return
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([renderHtml(selected.body, values)], { type: 'text/html' }),
      'text/plain': new Blob([outputElement.value], { type: 'text/plain' }),
    }),
  ])

  copyButtonElement.innerText = '✅ Copied!'
  if (copyTimeout !== null) {
    clearTimeout(copyTimeout)
  }
  copyTimeout = setTimeout(() => {
    copyButtonElement.innerText = 'Copy'
  }, 1000)
})

settingsButtonElement.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') })
})

init()
