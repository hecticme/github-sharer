const outputElement = /** @type {HTMLTextAreaElement} */ (document.getElementById('output'))
const copyButtonElement = document.getElementById('copy')

const data = {
  projectName: '',
  title: '',
  assignee: '',
  referenceHref: '',
}

function disableCopyButton() {
  if (!copyButtonElement) return
  copyButtonElement.setAttribute('disabled', '')
}

async function getPRInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab.url.includes('github.com')) {
    outputElement.value = 'This extension only works on Github.'
    disableCopyButton()
    return
  }

  const isPullRequest = tab.url.includes('/pull/')
  const isIssue = tab.url.includes('/issues/')

  if (!isPullRequest && !isIssue) {
    outputElement.value = 'Must be a pull request or an issue.'
    disableCopyButton()
    return
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

  outputElement.value = `[Project] ${data.projectName}\n[Task]: review: ${data.title}\n[Assignee]\n[Reference] ${data.referenceHref}`
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

getPRInfo()
