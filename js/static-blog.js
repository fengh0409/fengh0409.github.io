;(function(){
  const state = { posts: [], current: null }

  function $(sel, root=document){ return root.querySelector(sel) }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)) }

  function fetchPosts(){
    return fetch('data/posts.json')
      .then(r => r.json())
      .then(j => { state.posts = j.posts || []; return state.posts })
  }

  function truncate(str, n){
    if (!str) return ''
    const s = str.replace(/\r?\n/g,' ')
    return s.length > n ? s.slice(0, n) + '…' : s
  }

  function renderList(){
    const container = $('.postlist-container')
    container.innerHTML = ''
    state.posts.forEach(p => {
      const el = document.createElement('div')
      el.className = 'post-preview'
      const href = `#${encodeURIComponent(p.slug)}`
      el.innerHTML = `
        <a href="${href}">
          <h2 class="post-title">${escapeHtml(p.title)}</h2>
          <div class="post-content-preview">${escapeHtml(truncate(p.content, 200))}</div>
        </a>
        <p class="post-meta">Posted ${p.author?('by '+escapeHtml(p.author)+' '):''}on ${formatDate(p.date)}</p>
        <hr>
      `
      container.appendChild(el)
    })
  }

  function renderPost(slug){
    const p = state.posts.find(x => x.slug === slug)
    if (!p) { renderList(); return }
    const container = $('.postlist-container')
    container.innerHTML = `
      <div class="post-container">
        <h1>${escapeHtml(p.title)}</h1>
        <p class="post-meta">${formatDate(p.date)}${p.author?(' · '+escapeHtml(p.author)):''}</p>
        <div id="post-body"></div>
        <p><a href="#" class="btn btn-link">← 返回列表</a></p>
      </div>
    `
    const body = $('#post-body')
    if (window.marked) {
      body.innerHTML = window.marked.parse(p.content)
    } else {
      body.textContent = p.content
    }
  }

  function formatDate(d){
    if (!d) return ''
    try { return new Date(d).toLocaleDateString() } catch { return d }
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))
  }

  function onHashChange(){
    const slug = decodeURIComponent(location.hash.replace('#',''))
    if (slug) renderPost(slug); else renderList()
  }

  document.addEventListener('DOMContentLoaded', function(){
    fetchPosts().then(() => {
      onHashChange()
      window.addEventListener('hashchange', onHashChange)
    })
  })
})()
