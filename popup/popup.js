const outputElement = /** @type {HTMLTextAreaElement} */ (document.getElementById('output'))
const copyButtonElement = document.getElementById('copy')

async function getPRInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab.url.includes('github.com') || !tab.url.includes('/pull/')) {
    outputElement.value = 'Not a GitHub PR page.'
    return
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const pathParts = window.location.pathname.split('/')
      // github.com/owner/repo-name/pull/7/files --> ['', 'owner', 'repo-name', 'pull', '7', 'files']
      const repoName = pathParts.at(2) ?? ''
      const projectName = repoName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, substring => substring.toUpperCase())

      const titleElement = /** @type {HTMLElement} */ (document.querySelector('.gh-header-title .js-issue-title'))
      const title = titleElement ? titleElement.innerText.trim() : '(No title found)'

      return `[Project] ${projectName}\n[Task]: review: ${title}\n[Assignee]\n[Reference] ${window.location.href}`
    },
  })

  outputElement.value = result
}

copyButtonElement.addEventListener('click', () => {
  navigator.clipboard.writeText(outputElement.value)
})

getPRInfo()
