const assigneeSelectElement = /** @type {HTMLSelectElement} */ (document.getElementById('assignee'))
const outputElement = /** @type {HTMLTextAreaElement} */ (document.getElementById('output'))
const copyButtonElement = document.getElementById('copy')

const data = {
  projectName: '',
  title: '',
  assignee: '@ort-frontend',
  referenceHref: '',
}

function disableCopyButton() {
  if (!copyButtonElement) return
  copyButtonElement.setAttribute('disabled', '')
}

function disableAssigneeSelectElement() {
  if (!assigneeSelectElement) return
  assigneeSelectElement.setAttribute('disabled', '')
}

function refreshOutput() {
  const { projectName, title, assignee, referenceHref } = data
  outputElement.value = `[Project] ${projectName}\n[Task]: review: ${title}\n[Assignee] ${assignee}\n[Reference] ${referenceHref}`
}

async function getPRInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab.url.includes('github.com')) {
    outputElement.value = 'This extension only works on Github.'
    disableCopyButton()
    disableAssigneeSelectElement()
    return
  }

  const isPullRequest = tab.url.includes('/pull/')
  const isIssue = tab.url.includes('/issues/')

  if (!isPullRequest && !isIssue) {
    outputElement.value = 'Must be a pull request or an issue.'
    disableCopyButton()
    disableAssigneeSelectElement()
    return
  }

  const { lastAssignee = '@ort-frontend' } = await chrome.storage.local.get(['lastAssignee'])
  data.assignee = lastAssignee
  if (assigneeSelectElement) {
    assigneeSelectElement.value = lastAssignee
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [isPullRequest],
    func: (isPullRequest) => {
      const pathParts = window.location.pathname.split('/')
      // github.com/owner/repo-name/pull/7/files --> ['', 'owner', 'repo-name', 'pull', '7', 'files']
      const repoName = pathParts.at(2) ?? ''
      const projectName = repoName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, substring => substring.toUpperCase())

      const titleSelector = isPullRequest ? '.gh-header-title .js-issue-title' : '.markdown-title'
      const titleElement = /** @type {HTMLElement} */ (document.querySelector(titleSelector))
      const title = titleElement ? titleElement.innerText.trim() : '(No title found)'

      const referenceHref = `${window.location.origin}/${pathParts.slice(1, 5).join('/')}`

      return {
        projectName,
        title,
        referenceHref,
      }
    },
  })

  Object.assign(data, {
    projectName: result.projectName,
    title: result.title,
    referenceHref: result.referenceHref,
  })

  refreshOutput()
}

let copyTimeout = null

copyButtonElement.addEventListener('click', async () => {
  await navigator.clipboard.writeText(outputElement.value)

  copyButtonElement.innerText = '✅ Copied!'
  if (copyTimeout !== null) {
    clearTimeout(copyTimeout)
  }
  copyTimeout = setTimeout(() => {
    copyButtonElement.innerText = 'Copy'
  }, 1000)
})

assigneeSelectElement.addEventListener('change', async event => {
  const { value } = /** @type {HTMLSelectElement} */ (event.target)

  data.assignee = value
  await chrome.storage.local.set({
    lastAssignee: value,
  })

  refreshOutput()
})

getPRInfo()
