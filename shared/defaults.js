/**
 * @typedef {object} Condition
 * @property {string | null} [contains] - Page URL must include this substring.
 * @property {string | null} [matches] - Page URL must match this regular expression.
 */

/**
 * @typedef {object} SelectorEntry
 * @property {string} selector - A CSS selector to try.
 * @property {Condition | null} [if] - Only use this selector when the URL matches.
 */

/**
 * @typedef {object} Field
 * @property {string} name - Used for {{ interpolation }} in a template body.
 * @property {'selector' | 'input' | 'url'} type
 * @property {string} [fallback] - Value used when nothing is extracted (selector/url).
 * @property {Array<SelectorEntry>} [selectors] - Ordered selectors to try (selector).
 * @property {Array<string>} [options] - Dropdown choices (input).
 * @property {string} [default] - Default dropdown choice (input).
 * @property {'href' | 'origin' | 'pathname'} [source] - Part of the URL to read (url).
 * @property {string} [match] - Regex applied to the source (url).
 * @property {number} [group] - Capture group to keep (url).
 * @property {Array<string>} [transforms] - Transforms applied in order (url).
 */

/**
 * @typedef {object} Template
 * @property {string} name - Shown in the popup picker.
 * @property {Array<Condition>} when - Template is offered when any condition matches (empty = always).
 * @property {string} body - The text with {{ field }} placeholders.
 */

/**
 * @typedef {object} Config
 * @property {Array<Template>} templates
 * @property {Array<Field>} fields - Shared extraction library referenced by template bodies.
 */

/** @type {Config} */
export const DEFAULT_CONFIG = {
  templates: [
    {
      name: 'Task',
      when: [
        { contains: 'github.com/', matches: '/(pull|issues)/' },
      ],
      body: '[Project] {{ project }}\n[Task] {{ action }}: {{ title }}\n[Assignee] {{ assignee }}\n[Reference] {{ reference }}',
    },
  ],
  fields: [
    {
      name: 'project',
      type: 'url',
      source: 'pathname',
      match: '^/[^/]+/([^/]+)',
      group: 1,
      transforms: ['separatorsToSpaces', 'titleCase'],
      fallback: '',
    },
    {
      name: 'action',
      type: 'input',
      options: ['review', 'confirm'],
      default: 'review',
    },
    {
      name: 'title',
      type: 'selector',
      fallback: '(No title found)',
      selectors: [
        { selector: '.gh-header-title .js-issue-title', if: { contains: '/pull/', matches: null } },
        { selector: '.markdown-title', if: null },
      ],
    },
    {
      name: 'assignee',
      type: 'input',
      options: ['@ort-frontend', '@ort-backend', '@ort-internal'],
      default: '@ort-frontend',
    },
    {
      name: 'reference',
      type: 'url',
      source: 'href',
      match: '^(https?://[^/]+/[^/]+/[^/]+/(?:pull|issues)/\\d+)',
      group: 1,
      transforms: [],
      fallback: '',
    },
  ],
}
