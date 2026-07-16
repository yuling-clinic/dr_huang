/* ============================================================
   共用資料載入
   ============================================================ */
async function loadSiteData(){
  const res = await fetch(`data/articles.json?_=${Date.now()}`, { cache: 'no-store' });
  if(!res.ok) throw new Error('無法載入 data/articles.json');
  return res.json();
}

function formatDate(iso){
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d)) return iso;
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function sortByDateDesc(articles){
  return [...articles].sort((a,b) => new Date(b.date) - new Date(a.date));
}

/* 取得文章內容 HTML（新版用 contentHtml，舊資料用 markdown 轉換） */
function articleHTML(a){
  return a.contentHtml || parseMarkdown(a.content || '');
}

/* 統一取得文章的系列陣列（相容舊資料的單一字串格式） */
function getSeriesArray(article){
  if(Array.isArray(article.series)) return article.series.filter(Boolean);
  if(typeof article.series === 'string' && article.series) return [article.series];
  return [];
}

/* ============================================================
   卡片渲染
   ============================================================ */
function articleCardHTML(article){
  const seriesList = getSeriesArray(article);
  const seriesBadges = seriesList.map(s => `<span class="series-badge">🐻 ${s}</span>`).join('');
  const isExternal = !!article.externalUrl;
  const href = isExternal ? article.externalUrl : `posts/${encodeURIComponent(article.id)}.html`;
  const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
  return `
  <article class="card">
    <a class="card-link" href="${href}"${linkAttrs}>
      <div class="card-cover">
        <img src="${article.cover}" alt="${article.title}" loading="lazy"
             onerror="this.onerror=null;this.src='images/cover-placeholder-1.svg'">
        <span class="washi"></span>
      </div>
      <div class="card-body">
        <span class="tag" data-cat="${article.category}">${article.category}</span>
        <h3>${article.title}${isExternal ? ' <span class="ext-icon">↗</span>' : ''}</h3>
        <p class="excerpt">${article.excerpt || ''}</p>
        <div class="meta">${formatDate(article.date)}</div>
        ${seriesBadges ? `<div class="series-badges">${seriesBadges}</div>` : ''}
      </div>
    </a>
  </article>`;
}

/* ============================================================
   系列文章：一篇文章可能同時屬於多個系列，各自列出同系列文章
   ============================================================ */
function seriesSiblings(articles, seriesName){
  const ov = a => (a.seriesOrder && typeof a.seriesOrder === 'object' && a.seriesOrder[seriesName] != null)
    ? a.seriesOrder[seriesName] : null;
  return [...articles.filter(a => getSeriesArray(a).includes(seriesName))].sort((x,y)=>{
    const ox = ov(x), oy = ov(y);
    if(ox != null && oy != null) return ox - oy;
    if(ox != null) return -1;
    if(oy != null) return 1;
    return new Date(y.date) - new Date(x.date);
  });
}
function seriesBoxHTML(articles, current){
  const seriesList = getSeriesArray(current);
  if(!seriesList.length) return '';
  const boxes = seriesList.map(seriesName => {
    const list = seriesSiblings(articles, seriesName);
    if(list.length < 2) return '';
    const items = list.map(a => a.id === current.id
      ? `<li class="current"><span>${a.title}</span>（本篇）</li>`
      : a.externalUrl
        ? `<li><a href="${a.externalUrl}" target="_blank" rel="noopener">${a.title} <span class="ext-icon">↗</span></a></li>`
        : `<li><a href="posts/${encodeURIComponent(a.id)}.html">${a.title}</a></li>`
    ).join('');
    return `<div class="series-box">
      <div class="series-title">${seriesName} — 系列文章</div>
      <ol>${items}</ol>
    </div>`;
  }).filter(Boolean);
  return boxes.join('');
}

/* ============================================================
   輕量 Markdown 解析器（給舊文章用，不依賴外部 CDN）
   ============================================================ */
function escapeHTML(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function inlineMD(s){
  return s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function parseMarkdown(md){
  if(!md) return '';
  const lines = md.split('\n');
  const out = []; let listType = null; let para = [];
  const flushPara = () => { if(para.length){ out.push('<p>' + inlineMD(escapeHTML(para.join(' '))) + '</p>'); para = []; } };
  const closeList = () => { if(listType){ out.push(`</${listType}>`); listType = null; } };
  for(const raw of lines){
    const t = raw.trim();
    if(t === ''){ flushPara(); closeList(); continue; }
    const h = t.match(/^(#{1,4})\s+(.*)/);
    if(h){ flushPara(); closeList(); out.push(`<h${h[1].length}>${inlineMD(escapeHTML(h[2]))}</h${h[1].length}>`); continue; }
    if(t.startsWith('> ')){ flushPara(); closeList(); out.push(`<blockquote>${inlineMD(escapeHTML(t.slice(2)))}</blockquote>`); continue; }
    const ul = t.match(/^[-*]\s+(.*)/), ol = t.match(/^\d+\.\s+(.*)/);
    if(ul || ol){
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if(listType !== want){ closeList(); out.push(`<${want}>`); listType = want; }
      out.push(`<li>${inlineMD(escapeHTML((ul||ol)[1]))}</li>`); continue;
    }
    closeList(); para.push(t);
  }
  flushPara(); closeList();
  return out.join('\n');
}

/* ============================================================
   行動裝置導覽列
   ============================================================ */
function initNavToggle(){
  const btn = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if(!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
document.addEventListener('DOMContentLoaded', initNavToggle);

/* ============================================================
   錨點跳轉補償：手機瀏覽器對「跨頁+錨點」常常抓不準固定導覽列的高度，
   改用 JS 主動計算捲動位置，不依賴瀏覽器原生行為
   ============================================================ */
function scrollToHashWithOffset(hash){
  const el = document.querySelector(hash);
  if(!el) return;
  const headerH = document.querySelector('.site-header')?.offsetHeight || 64;
  const y = el.getBoundingClientRect().top + window.pageYOffset - headerH - 16;
  window.scrollTo({ top: Math.max(y, 0), behavior: 'smooth' });
}
function initAnchorOffsetScroll(){
  document.querySelectorAll('a[href*="#"]').forEach(a => {
    let url;
    try{ url = new URL(a.getAttribute('href'), location.href); }catch(e){ return; }
    if(url.pathname === location.pathname && url.hash){
      a.addEventListener('click', e => {
        const el = document.querySelector(url.hash);
        if(el){
          e.preventDefault();
          scrollToHashWithOffset(url.hash);
          history.pushState(null, '', url.hash);
        }
      });
    }
  });
  // 從別頁直接帶錨點進來的情況（例如從文章頁點「關於」跳回首頁）
  if(location.hash){
    setTimeout(() => scrollToHashWithOffset(location.hash), 80);
  }
}
document.addEventListener('DOMContentLoaded', initAnchorOffsetScroll);
