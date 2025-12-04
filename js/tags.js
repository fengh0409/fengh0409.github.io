;(function(){
  const state = { posts: [], tags: {} }
  function $(sel, root=document){ return root.querySelector(sel) }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])) }
  function fetchPosts(){ return fetch('data/posts.json').then(r=>r.json()).then(j=>{ state.posts = j.posts||[]; return state.posts }) }
  function buildTags(){ const map = {}; state.posts.forEach(p=>{ (p.tags||[]).forEach(t=>{ if(!map[t]) map[t]=[]; map[t].push(p) }) }); state.tags = map }
  function renderCloud(){ const root = $('#tag_cloud'); root.innerHTML = ''; const names = Object.keys(state.tags).sort((a,b)=>a.localeCompare(b)); names.forEach(name=>{ const a = document.createElement('a'); a.href = `#${encodeURIComponent(name)}`; a.title = name; a.setAttribute('rel', String(state.tags[name].length)); a.textContent = name; root.appendChild(a) }) }
  function renderLists(){ const root = $('#tag_lists'); root.innerHTML = ''; const names = Object.keys(state.tags).sort((a,b)=>a.localeCompare(b)); names.forEach(name=>{ const wrap = document.createElement('div'); wrap.className = 'one-tag-list'; const sep = document.createElement('span'); sep.className = 'fa fa-tag listing-seperator'; sep.id = name; const tt = document.createElement('span'); tt.className = 'tag-text'; tt.textContent = name; sep.appendChild(tt); wrap.appendChild(sep); state.tags[name].forEach(p=>{ const preview = document.createElement('div'); preview.className = 'post-preview'; const a = document.createElement('a'); a.href = `./#${encodeURIComponent(p.slug)}`; const h2 = document.createElement('h2'); h2.className = 'post-title'; h2.textContent = p.title; a.appendChild(h2); preview.appendChild(a); wrap.appendChild(preview); const hr = document.createElement('hr'); wrap.appendChild(hr) }); root.appendChild(wrap) }) }
  function onHash(){ const id = decodeURIComponent(location.hash.replace('#','')); if(!id) return; const el = document.getElementById(id); if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}) } }
  document.addEventListener('DOMContentLoaded', function(){ fetchPosts().then(()=>{ buildTags(); renderCloud(); renderLists(); onHash(); window.addEventListener('hashchange', onHash) }) })
})()

