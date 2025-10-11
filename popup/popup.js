async function getPRInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab.url.includes('github.com') || !tab.url.includes('/pull/')) {
    document.getElementById('output').value = 'Not a GitHub PR page.'
    return
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const pathParts = window.location.pathname.split('/')
      const repoName = pathParts[2] || ''
      const project = repoName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())

      const titleEl = document.querySelector('.gh-header-title .js-issue-title')
      const title = titleEl ? titleEl.innerText.trim() : '(No title found)'

      const reference = window.location.href

      return `[Project] ${project}\n[Task]: review: ${title}\n[Assignee]\n[Reference] ${reference}`
    },
  })

  document.getElementById('output').value = result
}

document.getElementById('copy').addEventListener('click', () => {
  const text = document.getElementById('output').value
  navigator.clipboard.writeText(text)
})

getPRInfo()
