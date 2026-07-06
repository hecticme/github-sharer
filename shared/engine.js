/**
 * @typedef {import('./defaults.js').Condition} Condition
 * @typedef {import('./defaults.js').Field} Field
 * @typedef {import('./defaults.js').Template} Template
 */

/**
 * @typedef {object} FieldValue
 * @property {string} text - Plain-text representation.
 * @property {string} html - HTML representation.
 * @property {boolean} raw - Whether `html` is trusted markup (true) or must be escaped (false).
 */

/** @type {Record<string, (value: string) => string>} */
const TRANSFORMS = {
  trim: value => value.trim(),
  lowercase: value => value.toLowerCase(),
  uppercase: value => value.toUpperCase(),
  separatorsToSpaces: value => value.replace(/[-_]/g, ' '),
  titleCase: value => value.replace(/\b\w/g, character => character.toUpperCase()),
}

const TOKEN_PATTERN = /\{\{\s*([\w-]+)\s*\}\}/g

/**
 * @param {string} url
 * @param {Condition | null | undefined} condition
 * @returns {boolean}
 */
export function matchesCondition(url, condition) {
  if (!condition) {
    return true
  }

  if (condition.contains && !url.includes(condition.contains)) {
    return false
  }

  if (condition.matches) {
    try {
      if (!new RegExp(condition.matches).test(url)) {
        return false
      }
    } catch {
      return false
    }
  }

  return true
}

/**
 * A template is offered when it has no conditions, or any one matches.
 *
 * @param {string} url
 * @param {Template} template
 * @returns {boolean}
 */
export function templateMatches(url, template) {
  const when = template.when ?? []

  if (when.length === 0) {
    return true
  }

  return when.some(condition => matchesCondition(url, condition))
}

/**
 * @param {string} url
 * @param {Array<Template>} templates
 * @returns {Array<Template>}
 */
export function matchingTemplates(url, templates) {
  return templates.filter(template => templateMatches(url, template))
}

/**
 * Unique field names referenced as {{ name }} in a template body.
 *
 * @param {string} body
 * @returns {Array<string>}
 */
export function tokensIn(body) {
  const names = new Set()

  TOKEN_PATTERN.lastIndex = 0

  let match
  while ((match = TOKEN_PATTERN.exec(body)) !== null) {
    names.add(match[1])
  }

  return [...names]
}

/**
 * @param {string} url
 * @param {Field} field
 * @returns {string}
 */
export function extractUrlField(url, field) {
  let source = url

  try {
    const parsed = new URL(url)
    source = field.source === 'origin'
      ? parsed.origin
      : field.source === 'pathname'
        ? parsed.pathname
        : parsed.href
  } catch {
    source = url
  }

  let value = source

  if (field.match) {
    try {
      const matched = source.match(new RegExp(field.match))

      if (matched) {
        const group = field.group ?? (matched.length > 1 ? 1 : 0)
        value = matched[group] ?? ''
      } else {
        value = ''
      }
    } catch {
      value = ''
    }
  }

  for (const transform of field.transforms ?? []) {
    if (TRANSFORMS[transform]) {
      value = TRANSFORMS[transform](value)
    }
  }

  return value || (field.fallback ?? '')
}

/**
 * Resolve selector fields against the URL so only applicable selectors remain.
 * The result is safe to hand to an injected page script (plain data, no conditions).
 *
 * @param {string} url
 * @param {Array<Field>} fields
 * @returns {Array<{ name: string, fallback: string, selectors: Array<string> }>}
 */
export function prepareSelectorFields(url, fields) {
  return fields
    .filter(field => field.type === 'selector')
    .map(field => ({
      name: field.name,
      fallback: field.fallback ?? '',
      selectors: (field.selectors ?? [])
        .filter(entry => matchesCondition(url, entry.if))
        .map(entry => entry.selector)
        .filter(Boolean),
    }))
}

/**
 * @param {string} value
 * @returns {string}
 */
export function htmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * @param {string} template
 * @param {Record<string, FieldValue>} values
 * @returns {string}
 */
export function renderText(template, values) {
  return template.replace(TOKEN_PATTERN, (whole, name) => {
    const value = values[name]
    return value ? value.text : whole
  })
}

/**
 * Render the HTML clipboard variant: static text is escaped and newlines become
 * `<br>`, selector values keep their original markup, other values are escaped.
 *
 * @param {string} template
 * @param {Record<string, FieldValue>} values
 * @returns {string}
 */
export function renderHtml(template, values) {
  let result = ''
  let lastIndex = 0

  TOKEN_PATTERN.lastIndex = 0

  let match
  while ((match = TOKEN_PATTERN.exec(template)) !== null) {
    result += renderStaticHtml(template.slice(lastIndex, match.index))

    const value = values[match[1]]
    if (value) {
      result += value.raw ? value.html : htmlEscape(value.text)
    } else {
      result += htmlEscape(match[0])
    }

    lastIndex = match.index + match[0].length
  }

  result += renderStaticHtml(template.slice(lastIndex))

  return result
}

/**
 * @param {string} text
 * @returns {string}
 */
function renderStaticHtml(text) {
  return htmlEscape(text).replace(/\n/g, '<br>')
}
