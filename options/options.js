import { DEFAULT_CONFIG } from '../shared/defaults.js'
import { loadConfig, migrateConfig, saveConfig } from '../shared/storage.js'

/**
 * @typedef {import('../shared/defaults.js').Config} Config
 * @typedef {import('../shared/defaults.js').Field} Field
 * @typedef {import('../shared/defaults.js').SelectorEntry} SelectorEntry
 * @typedef {import('../shared/defaults.js').Condition} Condition
 * @typedef {import('../shared/defaults.js').Template} Template
 */

const SOURCES = ['pathname', 'href', 'origin']
const TRANSFORMS = ['trim', 'separatorsToSpaces', 'titleCase', 'lowercase', 'uppercase']
const FIELD_TYPES = ['selector', 'input', 'url']

const templatesElement = /** @type {HTMLDivElement} */ (document.getElementById('templates'))
const fieldsElement = /** @type {HTMLDivElement} */ (document.getElementById('fields'))
const statusElement = /** @type {HTMLSpanElement} */ (document.getElementById('status'))
const importFileElement = /** @type {HTMLInputElement} */ (document.getElementById('import-file'))

/** @type {Config} */
let config = structuredClone(DEFAULT_CONFIG)

/** @type {ReturnType<typeof setTimeout> | null} */
let statusTimeout = null

/**
 * Tiny DOM builder.
 *
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {Array<Node | string | null> | Node | string | null} [children]
 * @returns {HTMLElement}
 */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) {
      continue
    }

    if (key === 'class') {
      node.className = value
    } else if (key === 'text') {
      node.textContent = value
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value)
    } else {
      node.setAttribute(key, value)
    }
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined) {
      continue
    }
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }

  return node
}

/**
 * @param {string} labelText
 * @param {Node} control
 * @returns {HTMLElement}
 */
function labelled(labelText, control) {
  return el('div', { class: 'field-label' }, [
    el('span', { class: 'field-label-text', text: labelText }),
    control,
  ])
}

/**
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @param {Record<string, string>} [attrs]
 * @returns {HTMLInputElement}
 */
function textInput(value, onChange, attrs = {}) {
  return /** @type {HTMLInputElement} */ (el('input', {
    class: 'input',
    value,
    ...attrs,
    oninput: (/** @type {Event} */ event) => {
      onChange(/** @type {HTMLInputElement} */ (event.target).value)
    },
  }))
}

/**
 * @param {Array<string>} options
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @returns {HTMLSelectElement}
 */
function selectInput(options, value, onChange) {
  return /** @type {HTMLSelectElement} */ (el('select', {
    class: 'select',
    onchange: (/** @type {Event} */ event) => {
      onChange(/** @type {HTMLSelectElement} */ (event.target).value)
    },
  }, options.map(option => el('option', {
    value: option,
    text: option,
    ...(option === value ? { selected: 'selected' } : {}),
  }))))
}

/**
 * @param {{ contains?: string | null, matches?: string | null }} condition
 * @param {'contains' | 'matches'} key
 * @param {string} value
 */
function applyConditionValue(condition, key, value) {
  condition[key] = value.trim() === '' ? null : value
}

/**
 * A reusable list of OR-ed URL conditions bound to `conditions`.
 *
 * @param {Array<Condition>} conditions
 * @param {() => void} rerender
 * @returns {HTMLElement}
 */
function conditionList(conditions, rerender) {
  return el('div', { class: 'rows' }, [
    ...conditions.map((condition, index) => el('div', { class: 'row' }, [
      textInput(condition.contains ?? '', value => applyConditionValue(condition, 'contains', value), { placeholder: 'URL contains…' }),
      textInput(condition.matches ?? '', value => applyConditionValue(condition, 'matches', value), { placeholder: 'URL matches (regex)…' }),
      el('button', {
        class: 'btn-icon',
        type: 'button',
        title: 'Remove condition',
        text: '✕',
        onclick: () => {
          conditions.splice(index, 1)
          rerender()
        },
      }),
    ])),
    el('button', {
      class: 'btn-tertiary',
      type: 'button',
      text: '+ Add URL condition',
      onclick: () => {
        conditions.push({ contains: null, matches: null })
        rerender()
      },
    }),
  ])
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * @returns {Template}
 */
function blankTemplate() {
  return { name: '', when: [], body: '' }
}

function renderTemplates() {
  templatesElement.replaceChildren(...config.templates.map((template, index) => renderTemplateCard(template, index)))
}

/**
 * @param {Template} template
 * @param {number} index
 * @returns {HTMLElement}
 */
function renderTemplateCard(template, index) {
  const header = el('div', { class: 'field-header' }, [
    textInput(template.name, value => { template.name = value }, { placeholder: 'template name', class: 'input input-name' }),
    el('button', {
      class: 'btn-icon',
      type: 'button',
      title: 'Remove template',
      text: '✕',
      onclick: () => {
        config.templates.splice(index, 1)
        renderTemplates()
      },
    }),
  ])

  const body = el('textarea', {
    class: 'textarea code',
    rows: 5,
    spellcheck: 'false',
    placeholder: '[Task] {{ title }}',
    oninput: (/** @type {Event} */ event) => {
      template.body = /** @type {HTMLTextAreaElement} */ (event.target).value
    },
  }, template.body)

  const when = el('div', { class: 'field-label' }, [
    el('span', { class: 'field-label-text', text: 'Show when' }),
    el('p', { class: 'hint hint-inline', text: 'Offered in the popup when the URL matches any row. Leave empty to always offer it.' }),
    conditionList(template.when ?? (template.when = []), renderTemplates),
  ])

  return el('div', { class: 'field-card' }, [
    header,
    el('div', { class: 'field-body' }, [
      labelled('Body', body),
      when,
    ]),
  ])
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

/**
 * @param {'selector' | 'input' | 'url'} type
 * @returns {Field}
 */
function blankField(type) {
  if (type === 'input') {
    return { name: '', type, options: [], default: '' }
  }

  if (type === 'url') {
    return { name: '', type, source: 'pathname', match: '', group: 1, transforms: [], fallback: '' }
  }

  return { name: '', type, fallback: '', selectors: [{ selector: '', if: null }] }
}

function renderFields() {
  fieldsElement.replaceChildren(...config.fields.map((field, index) => renderFieldCard(field, index)))
}

/**
 * @param {Field} field
 * @param {number} index
 * @returns {HTMLElement}
 */
function renderFieldCard(field, index) {
  const header = el('div', { class: 'field-header' }, [
    textInput(field.name, value => { field.name = value }, { placeholder: 'field name', class: 'input input-name' }),
    selectInput(FIELD_TYPES, field.type, value => {
      config.fields[index] = { ...blankField(/** @type {any} */ (value)), name: field.name }
      renderFields()
    }),
    el('button', {
      class: 'btn-icon',
      type: 'button',
      title: 'Remove field',
      text: '✕',
      onclick: () => {
        config.fields.splice(index, 1)
        renderFields()
      },
    }),
  ])

  const body = field.type === 'selector'
    ? renderSelectorBody(field)
    : field.type === 'input'
      ? renderInputBody(field)
      : renderUrlBody(field)

  return el('div', { class: 'field-card' }, [header, body])
}

/**
 * @param {Field} field
 * @returns {HTMLElement}
 */
function renderSelectorBody(field) {
  const selectors = field.selectors ?? (field.selectors = [])

  const list = el('div', { class: 'selectors' }, selectors.map((entry, index) =>
    el('div', { class: 'selector-entry' }, [
      el('div', { class: 'row' }, [
        textInput(entry.selector, value => { entry.selector = value }, { placeholder: 'CSS selector', class: 'input input-mono' }),
        el('button', {
          class: 'btn-icon',
          type: 'button',
          title: 'Remove selector',
          text: '✕',
          onclick: () => {
            selectors.splice(index, 1)
            renderFields()
          },
        }),
      ]),
      el('div', { class: 'cond-row' }, [
        el('span', { class: 'cond-label', text: 'only if' }),
        textInput(entry.if?.contains ?? '', value => updateSelectorCondition(entry, 'contains', value), { placeholder: 'URL contains…', class: 'input input-sm' }),
        textInput(entry.if?.matches ?? '', value => updateSelectorCondition(entry, 'matches', value), { placeholder: 'URL matches (regex)…', class: 'input input-sm' }),
      ]),
    ])
  ))

  return el('div', { class: 'field-body' }, [
    list,
    el('button', {
      class: 'btn-tertiary',
      type: 'button',
      text: '+ Add selector (fallback)',
      onclick: () => {
        selectors.push({ selector: '', if: null })
        renderFields()
      },
    }),
    labelled('Fallback value', textInput(field.fallback ?? '', value => { field.fallback = value }, { placeholder: 'used when nothing matches' })),
  ])
}

/**
 * @param {SelectorEntry} entry
 * @param {'contains' | 'matches'} key
 * @param {string} value
 */
function updateSelectorCondition(entry, key, value) {
  const condition = entry.if ?? { contains: null, matches: null }
  applyConditionValue(condition, key, value)
  entry.if = condition.contains == null && condition.matches == null ? null : condition
}

/**
 * @param {Field} field
 * @returns {HTMLElement}
 */
function renderInputBody(field) {
  return el('div', { class: 'field-body' }, [
    labelled('Options (one per line)', el('textarea', {
      class: 'textarea',
      rows: 3,
      placeholder: 'review\nconfirm',
      oninput: (/** @type {Event} */ event) => {
        field.options = /** @type {HTMLTextAreaElement} */ (event.target).value
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
      },
    }, (field.options ?? []).join('\n'))),
    labelled('Default', textInput(field.default ?? '', value => { field.default = value }, { placeholder: 'default selected option' })),
  ])
}

/**
 * @param {Field} field
 * @returns {HTMLElement}
 */
function renderUrlBody(field) {
  const transformRow = el('div', { class: 'transforms' }, TRANSFORMS.map(transform => {
    const checkbox = el('input', {
      type: 'checkbox',
      ...((field.transforms ?? []).includes(transform) ? { checked: 'checked' } : {}),
      onchange: (/** @type {Event} */ event) => {
        const checked = /** @type {HTMLInputElement} */ (event.target).checked
        const transforms = field.transforms ?? (field.transforms = [])
        if (checked && !transforms.includes(transform)) {
          transforms.push(transform)
        } else if (!checked) {
          field.transforms = transforms.filter(item => item !== transform)
        }
      },
    })

    return el('label', { class: 'checkbox' }, [checkbox, el('span', { text: transform })])
  }))

  return el('div', { class: 'field-body' }, [
    labelled('Read from', selectInput(SOURCES, field.source ?? 'pathname', value => { field.source = /** @type {any} */ (value) })),
    labelled('Match (regex)', textInput(field.match ?? '', value => { field.match = value }, { placeholder: '^/[^/]+/([^/]+)', class: 'input input-mono' })),
    labelled('Capture group', textInput(String(field.group ?? 1), value => { field.group = Number(value) || 0 }, { type: 'number', min: '0', class: 'input input-num' })),
    labelled('Transforms', transformRow),
    labelled('Fallback value', textInput(field.fallback ?? '', value => { field.fallback = value }, { placeholder: 'used when nothing matches' })),
  ])
}

/* ------------------------------------------------------------------ */
/* Import / Export                                                     */
/* ------------------------------------------------------------------ */

function exportConfig() {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const anchor = /** @type {HTMLAnchorElement} */ (el('a', {
    href: url,
    download: 'github-sharer-config.json',
  }))

  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(url)
  showStatus('Exported')
}

/**
 * @param {File} file
 */
function importConfig(file) {
  const reader = new FileReader()

  reader.addEventListener('load', () => {
    try {
      config = migrateConfig(JSON.parse(/** @type {string} */ (reader.result)))
      render()
      showStatus('Imported — review and Save')
    } catch {
      showStatus('Could not import: invalid JSON', true)
    }
  })

  reader.addEventListener('error', () => {
    showStatus('Could not read file', true)
  })

  reader.readAsText(file)
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function showStatus(message, isError = false) {
  statusElement.textContent = message
  statusElement.classList.toggle('status-error', isError)

  if (statusTimeout !== null) {
    clearTimeout(statusTimeout)
  }
  statusTimeout = setTimeout(() => {
    statusElement.textContent = ''
    statusElement.classList.remove('status-error')
  }, 2500)
}

function render() {
  renderTemplates()
  renderFields()
}

async function save() {
  await saveConfig(config)
  showStatus('Saved ✓')
}

async function init() {
  config = await loadConfig()
  render()

  document.getElementById('add-template')?.addEventListener('click', () => {
    config.templates.push(blankTemplate())
    renderTemplates()
  })

  document.getElementById('add-field')?.addEventListener('click', () => {
    config.fields.push(blankField('selector'))
    renderFields()
  })

  document.getElementById('export')?.addEventListener('click', exportConfig)

  document.getElementById('import')?.addEventListener('click', () => {
    importFileElement.click()
  })

  importFileElement.addEventListener('change', () => {
    const file = importFileElement.files?.[0]
    if (file) {
      importConfig(file)
    }
    importFileElement.value = ''
  })

  document.getElementById('save')?.addEventListener('click', save)

  document.getElementById('reset')?.addEventListener('click', () => {
    config = structuredClone(DEFAULT_CONFIG)
    render()
    showStatus('Reset to defaults — review and Save')
  })
}

init()
