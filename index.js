chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractPR') {
    const pathParts = window.location.pathname.split('/')
    const repoName = pathParts[2] || ''
    const project = repoName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
    const titleEl = document.querySelector('.gh-header-title .js-issue-title')
    const title = titleEl ? titleEl.innerText.trim() : ''
    const reference = window.location.href

    sendResponse({ project, title, reference })
  }
})
