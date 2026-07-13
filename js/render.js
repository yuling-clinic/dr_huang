/* ============================================================
   共用資料載入
   ============================================================ */
async function loadSiteData(){
  const res = await fetch('data/articles.json', { cache: 'no-store' });
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

/* ============================================================
   卡片渲染
   ============================================================ */
function articleCardHTML(article){
  const series = article.series
    ? `<span class="series-badge">🐻 ${article.series} 系列</span>` : '';
  return `
  <article class="card">
    <a class="card-link" href="posts/${encodeURIComponent(article.id)}.html">
      <div class="card-cover">
        <img src="${article.cover}" alt="${article.title}" loading="lazy"
             onerror="this.onerror=null;this.src='images/cover-placeholder-1.svg'">
        <span class="washi"></span>
      </div>
      <div class="card-body">
        <span class="tag" data-cat="${article.category}">${article.category}</span>
        <h3>${article.title}</h3>
        <p class="excerpt">${article.excerpt || ''}</p>
        <div class="meta">${formatDate(article.date)}</div>
        ${series}
      </div>
    </a>
  </article>`;
}

/* ============================================================
   系列文章：找出同系列的所有文章，依 seriesOrder 排序
   ============================================================ */
function seriesSiblings(articles, seriesName){
  return articles
    .filter(a => a.series && a.series === seriesName)
    .sort((a,b) => (a.seriesOrder||0) - (b.seriesOrder||0));
}
function seriesBoxHTML(articles, current){
  if(!current.series) return '';
  const list = seriesSiblings(articles, current.series);
  if(list.length < 2) return '';
  const items = list.map(a => a.id === current.id
    ? `<li class="current"><span>${a.title}</span>（本篇）</li>`
    : `<li><a href="posts/${encodeURIComponent(a.id)}.html">${a.title}</a></li>`
  ).join('');
  return `<div class="series-box">
    <div class="series-title">${current.series} — 系列文章</div>
    <ol>${items}</ol>
  </div>`;
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
