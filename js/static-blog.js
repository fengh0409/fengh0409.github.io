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
    document.body.classList.add('detail-view')
    const body = $('#post-body')
    if (window.marked) {
      body.innerHTML = window.marked.parse(p.content)
    } else {
      body.textContent = p.content
    }
    buildCatalog()
    showCatalog(true)
    showAbout(false)
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
    if (slug) renderPost(slug); else { document.body.classList.remove('detail-view'); renderList(); showCatalog(false); showAbout(true) }
  }

  function showCatalog(show){
    const container = document.querySelector('.catalog-container')
    if (!container) return
    container.style.display = show ? '' : 'none'
    if (!show) {
      const root = document.getElementById('catalog-body')
      if (root) root.innerHTML = ''
    }
  }

  function showAbout(show){
    const el = document.getElementById('about-section')
    if (!el) return
    el.style.display = show ? '' : 'none'
  }

  function slugify(text){
    return String(text).trim().toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g,'')
      .replace(/\s+/g,'-')
      .slice(0,64)
  }

  function buildCatalog(){
    const root = document.getElementById('catalog-body')
    if (!root) return
    root.innerHTML = ''
    const headings = Array.from(document.querySelectorAll('#post-body h1, #post-body h2, #post-body h3, #post-body h4, #post-body h5, #post-body h6'))
    headings.forEach((h,i)=>{
      if (!h.id) {
        const base = slugify(h.textContent||('section-'+i))
        let id = base||('section-'+i)
        let k = 1
        while (document.getElementById(id)) { id = base+'-'+(k++) }
        h.id = id
      }
      const li = document.createElement('li')
      const level = (h.tagName||'H6').slice(1)
      li.className = 'h'+level+'_nav'
      const a = document.createElement('a')
      a.href = '#'
      a.dataset.targetId = h.id
      a.textContent = h.textContent
      li.appendChild(a)
      root.appendChild(li)
    })

    const sidebar = document.getElementById('side-catalog')
    if (!sidebar) return
    const toggle = sidebar.querySelector('.catalog-toggle')
    if (toggle) {
      toggle.addEventListener('click', function(){ sidebar.classList.toggle('fold') })
    }

    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const id = entry.target.id
        const link = root.querySelector('a[data-target-id="'+id+'"]')
        if (!link) return
        const li = link.parentElement
        if (entry.isIntersecting) {
          Array.from(root.children).forEach(x=>x.classList.remove('active'))
          li.classList.add('active')
        }
      })
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 })
    headings.forEach(h=>obs.observe(h))

    const fixedTop = sidebar.getBoundingClientRect().top + window.scrollY
    function onScroll(){
      if (window.innerWidth >= 1200) {
        if (window.scrollY > fixedTop) sidebar.classList.add('fixed'); else sidebar.classList.remove('fixed')
      } else {
        sidebar.classList.remove('fixed')
      }
    }
    window.addEventListener('scroll', onScroll)
    onScroll()

    root.addEventListener('click', function(e){
      const a = e.target.closest('a')
      if (!a) return
      e.preventDefault()
      const id = a.dataset.targetId
      const el = document.getElementById(id)
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY - 70
      window.scrollTo({ top, behavior: 'smooth' })
    })
  }

  document.addEventListener('DOMContentLoaded', function(){
    document.body.classList.remove('detail-view')
    showCatalog(false)
    showAbout(true)
    fetchPosts().then(() => {
      onHashChange()
      window.addEventListener('hashchange', onHashChange)
    })
  })
})()
