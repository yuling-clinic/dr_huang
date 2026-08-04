/* ============================================================
   靜態頁面產生器
   發布時把每篇文章產生成真實的 HTML 檔（posts/<id>.html），
   讓 Google 一進來就讀得到完整文字，不需要執行 JavaScript。
   同時產生 sitemap.xml 與 robots.txt。
   ============================================================ */

const FONT_LINK = '<link href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@300;400&family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet">';

function esc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* 去掉 HTML 標籤，取純文字（給 description 用） */
function stripTags(html){
  return String(html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
/* 把相對路徑轉成絕對網址（給 og:image、sitemap 用） */
function absUrl(base, path){
  if(!path) return '';
  if(/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return base.replace(/\/$/,'') + '/' + String(path).replace(/^\//,'');
}
/* 文章內文裡的連結，從 article.html?id=x 改成 posts/x.html */
function rewriteInternalLinks(html){
  return String(html||'').replace(
    /href="article\.html\?id=([^"]+)"/g,
    (m, id) => `href="${id}.html"`
  );
}
/* posts/ 在下一層，相對路徑要往上一層找 */
function relPath(p){
  if(!p) return '';
  if(/^https?:\/\//i.test(p) || p.startsWith('data:') || p.startsWith('../')) return p;
  return '../' + String(p).replace(/^\//,'');
}
/* 文章裡的相對路徑資源（圖片），因為 posts/ 在下一層，要往上一層找 */
function fixDepth(html){
  return String(html||'')
    .replace(/src="images\//g, 'src="../images/')
    .replace(/src='images\//g, "src='../images/");
}

/* ── 網站分析程式碼（Cloudflare Web Analytics，免 cookie、不追蹤個人） ── */
function analyticsSnippet(site){
  const token = (site.cfToken || '').trim();
  if(!token) return '';
  return `<!-- Cloudflare Web Analytics -->
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(token)}"}'></script>`;
}
/* ── Google Search Console 驗證標籤（若使用 meta 驗證法） ── */
function verifySnippet(site){
  const v = (site.gscVerify || '').trim();
  if(!v) return '';
  return `<meta name="google-site-verification" content="${esc(v)}">`;
}

/* 統一取得文章的系列陣列（相容舊資料的單一字串格式） */
function getSeriesArrayGen(article){
  if(Array.isArray(article.series)) return article.series.filter(Boolean);
  if(typeof article.series === 'string' && article.series) return [article.series];
  return [];
}
/* 系列排序：優先用後台拖拉設定的 seriesOrder，其次依日期新到舊 */
function sortBySeriesOrder(list, seriesName){
  const ov = a => (a.seriesOrder && typeof a.seriesOrder === 'object' && a.seriesOrder[seriesName] != null)
    ? a.seriesOrder[seriesName] : null;
  return [...list].sort((x,y)=>{
    const ox = ov(x), oy = ov(y);
    if(ox != null && oy != null) return ox - oy;
    if(ox != null) return -1;
    if(oy != null) return 1;
    return new Date(y.date) - new Date(x.date);
  });
}

/* 系列連結要帶上分類，才會回到「衛教底下的某系列」而不是「全部文章底下的某系列」。
   旅遊與生活在文章列表上合併成 life 這個分類。 */
function catParam(category){
  if(category === '旅遊' || category === '生活') return 'life';
  return category || '';
}
/* 分類本身的列表連結與顯示名稱（旅遊／生活在列表上合併為「診間之外」） */
function catHref(category){
  const cat = catParam(category);
  return cat ? '../articles.html?cat=' + encodeURIComponent(cat) : '../articles.html';
}
function catLabel(category){
  if(category === '旅遊' || category === '生活') return '診間之外';
  return category || '文章列表';
}
function seriesHref(category, seriesName){
  const cat = catParam(category);
  return '../articles.html?'
    + (cat ? 'cat=' + encodeURIComponent(cat) + '&' : '')
    + 'series=' + encodeURIComponent(seriesName);
}

/* ── 文章目錄（TOC） ──
   從內文的 h2 / h3 抓出章節，順便補上錨點 id（原本沒有 id 的才補，
   已經有 id 的保留，避免蓋掉內文自訂的錨點）。 */
function extractHeadings(html){
  const toc = [];
  let n = 0;
  const out = String(html||'').replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (m, lv, attrs, inner) => {
    const text = stripTags(inner);
    if(!text) return m;                       // 空標題不列入目錄
    const existing = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const id = existing ? existing[1] : 'sec-' + (++n);
    toc.push({ id, text, level: Number(lv) });
    const idAttr = existing ? '' : ` id="${id}"`;
    // 大標包一層 span，CSS 才能只在文字範圍畫出螢光筆色塊（整個 h2 是區塊，會拉滿整行）
    const content = (lv === '2' && !/class="hl"/.test(inner)) ? `<span class="hl">${inner}</span>` : inner;
    return `<h${lv}${attrs}${idAttr}>${content}</h${lv}>`;
  });
  return { html: out, toc };
}
/* 章節太少時不做目錄——兩三行的目錄只是雜訊，幫助不大 */
const TOC_MIN_ITEMS = 3;
function buildTocHTML(toc){
  if(toc.length < TOC_MIN_ITEMS) return '';
  return `
    <nav class="post-toc" id="post-toc" aria-label="文章目錄">
      <button class="post-toc-head" type="button" aria-expanded="true">
        <span>本篇目錄</span><span class="post-toc-caret">▾</span>
      </button>
      <ol class="post-toc-list">
        ${toc.map(h => `<li class="lv${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('\n        ')}
      </ol>
    </nav>`;
}

/* ── 單篇文章的靜態 HTML ── */
function buildPostHTML(site, articles, a, baseUrl){
  const seriesNames = getSeriesArrayGen(a);
  const seriesBox = seriesNames.map(seriesName => {
    const siblings = sortBySeriesOrder(
      articles.filter(x => getSeriesArrayGen(x).includes(seriesName)), seriesName);
    if(siblings.length < 2) return '';
    return `
    <div class="series-box">
      <a class="series-title" href="${seriesHref(a.category, seriesName)}">${esc(seriesName)} — 系列文章 <span class="series-title-arrow">→</span></a>
      <ol>
        ${siblings.map(s => s.id === a.id
          ? `<li class="current"><span>${esc(s.title)}</span>（本篇）</li>`
          : s.externalUrl
            ? `<li><a href="${esc(s.externalUrl)}" target="_blank" rel="noopener">${esc(s.title)} <span class="ext-icon">↗</span></a></li>`
            : `<li><a href="${esc(s.id)}.html">${esc(s.title)}</a></li>`).join('\n        ')}
      </ol>
    </div>`;
  }).join('');

  // 上下篇：優先取「同一系列」中的前後篇；沒有系列才退回全站日期排序
  const mySeriesList = getSeriesArrayGen(a);
  let pool, sorted;
  if(mySeriesList.length){
    const primary = mySeriesList[0];
    pool = articles.filter(x => !x.externalUrl && getSeriesArrayGen(x).some(s => mySeriesList.includes(s)));
    sorted = sortBySeriesOrder(pool, primary);
    // 系列內用手動順序，「下一篇」是順序較後者
    const i = sorted.findIndex(x => x.id === a.id);
    const prev = sorted[i-1], next = sorted[i+1];
    return finishPost(prev, next);
  } else {
    pool = articles.filter(x => !x.externalUrl);
    sorted = [...pool].sort((x,y) => new Date(y.date) - new Date(x.date));
    const idx = sorted.findIndex(x => x.id === a.id);
    return finishPost(sorted[idx+1], sorted[idx-1]);
  }

  function finishPost(prev, next){
  const parsed = extractHeadings(fixDepth(rewriteInternalLinks(a.contentHtml || '')));
  const body = parsed.html;
  const tocHTML = buildTocHTML(parsed.toc);
  const desc = (a.excerpt || stripTags(a.contentHtml)).slice(0, 150);
  const canonical = `${baseUrl.replace(/\/$/,'')}/posts/${a.id}.html`;
  const ogImage = absUrl(baseUrl, a.cover);
  const dateStr = a.date;
  const fmtDate = dateStr ? dateStr.replace(/-/g,'.') : '';

  /* 結構化資料：告訴 Google 這是一篇由醫師撰寫的文章 */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": a.title,
    "description": desc,
    "image": ogImage ? [ogImage] : undefined,
    "datePublished": dateStr,
    "dateModified": dateStr,
    "author": {
      "@type": "Person",
      "name": site.name,
      "jobTitle": site.role,
      "worksFor": { "@type": "Organization", "name": site.hospital }
    },
    "publisher": { "@type": "Person", "name": site.name },
    "mainEntityOfPage": canonical,
    "keywords": (a.tags || []).join(', ')
  };

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="../images/favicon.svg">
<link rel="icon" type="image/png" sizes="96x96" href="../images/favicon-96.png">
<link rel="icon" type="image/png" sizes="48x48" href="../images/favicon-48.png">
<link rel="apple-touch-icon" sizes="180x180" href="../images/favicon-180.png">
<title>${esc(a.title)}｜${esc(site.name)}</title>
<meta name="description" content="${esc(desc)}">
${verifySnippet(site)}
<meta name="author" content="${esc(site.name)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(site.name)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta property="article:published_time" content="${esc(dateStr)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
${FONT_LINK}
<link rel="stylesheet" href="../css/style.css">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a class="brand" href="../index.html">
      <span class="seal">醫</span>
      <span>${esc(site.name)}</span>
    </a>
    <button class="nav-toggle" aria-label="開啟選單" aria-expanded="false">☰</button>
    <nav class="site-nav">
      <a href="../index.html">首頁</a>
      <a href="../articles.html?cat=衛教">衛教</a>
      <a href="../articles.html?cat=新聞稿">新聞稿</a>
      <a href="../articles.html?cat=life">診間之外</a>
      <a href="../index.html#about">關於</a>
      <a href="../index.html#clinic" class="nav-cta">線上掛號</a>
    </nav>
  </div>
</header>

<article>
  <div class="wrap post-grid${seriesBox ? ' has-rail' : ''}">
    <div class="back-links post-full">
      ${seriesNames.length
        ? seriesNames.map(sn => `<a class="back-link back-link-series" href="${seriesHref(a.category, sn)}">← 回「${esc(sn)}」系列</a>`).join('\n      ')
        : `<a class="back-link" href="${catHref(a.category)}">← 回${esc(catLabel(a.category))}</a>`}
    </div>
    <div class="post-full post-tagline"><span class="tag" data-cat="${esc(a.category)}">${esc(a.category)}</span></div>
    <h1 class="post-full">${esc(a.title)}</h1>
    <div class="article-meta post-full">${esc(fmtDate)}${(a.tags||[]).length ? '　·　' + (a.tags||[]).map(esc).join('　·　') : ''}</div>
    ${a.cover ? `<div class="article-cover post-body-col"><img src="${esc(relPath(a.cover))}" alt="${esc(a.title)}"></div>` : ''}
    <div class="article-body post-body-col${a.font === 'serif' ? ' font-serif' : ''}">
${body}
    </div>
    <nav class="article-nav post-body-col">
      ${prev ? `<a href="${esc(prev.id)}.html">← ${esc(prev.title)}</a>` : `<a href="${catHref(a.category)}">← 回${esc(catLabel(a.category))}</a>`}
      ${next ? `<a href="${esc(next.id)}.html">${esc(next.title)} →</a>` : `<a href="${catHref(a.category)}">更多${esc(catLabel(a.category))} →</a>`}
    </nav>
    ${seriesBox ? `<aside class="series-rail post-toc-col">${seriesBox}\n    </aside>` : ''}
  </div>
</article>
${tocHTML}

<footer class="site-footer">
  <div class="wrap">
    <span>© ${new Date().getFullYear()} ${esc(site.name)}</span>
    <span>內容僅供衛教參考，實際診療請以門診評估為準</span>
  </div>
</footer>

<script>
  const t=document.querySelector('.nav-toggle'), n=document.querySelector('.site-nav');
  if(t&&n) t.addEventListener('click',()=>{const o=n.classList.toggle('open');t.setAttribute('aria-expanded',o);});

  /* 文章目錄：捲到哪一段就標示哪一項，並可收合 */
  (function(){
    var toc = document.getElementById('post-toc');
    if(!toc) return;
    var links = [].slice.call(toc.querySelectorAll('a[href^="#"]'));
    var heads = links.map(function(a){ return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });

    // 點目錄捲動時要避開固定的頁首，不然標題會被蓋住
    links.forEach(function(a,i){
      a.addEventListener('click', function(e){
        var el = heads[i];
        if(!el) return;
        e.preventDefault();
        var hd = document.querySelector('.site-header');
        var y = el.getBoundingClientRect().top + window.pageYOffset - ((hd&&hd.offsetHeight)||64) - 16;
        window.scrollTo({ top: Math.max(y,0), behavior:'smooth' });
        history.replaceState(null,'','#'+el.id);
      });
    });

    function sync(){
      var line = window.pageYOffset + ((document.querySelector('.site-header')||{}).offsetHeight||64) + 40;
      var cur = 0;
      heads.forEach(function(el,i){ if(el && el.offsetTop <= line) cur = i; });
      links.forEach(function(a,i){ a.parentNode.classList.toggle('active', i===cur); });
    }
    var tick = false;
    window.addEventListener('scroll', function(){
      if(tick) return;
      tick = true;
      requestAnimationFrame(function(){ sync(); tick = false; });
    }, {passive:true});
    sync();

    var head = toc.querySelector('.post-toc-head');
    head.addEventListener('click', function(){
      var open = toc.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  })();
</script>
${analyticsSnippet(site)}
</body>
</html>`;
  }
}

/* ── 舊網址代碼轉址頁：文章改過網址代碼後，舊網址仍要能打開並跳到新網址，
   分享出去的舊連結才不會失效。跟 buildRedirectPage 不同，這裡是 posts/ 資料夾
   內部同層的轉跳，不需要再往上一層。 ── */
function buildOldIdRedirect(newId, baseUrl){
  const canonical = `${baseUrl.replace(/\/$/,'')}/posts/${newId}.html`;
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>轉跳中…</title>
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="noindex">
<script>location.replace('${esc(newId)}.html');</script>
</head>
<body><p>這篇文章的網址已經更新，轉跳中… <a href="${esc(newId)}.html">若沒有自動跳轉請點這裡</a></p></body>
</html>`;
}

/* ── sitemap.xml ── */
function buildSitemap(site, articles, baseUrl){
  const base = baseUrl.replace(/\/$/,'');
  const today = new Date().toISOString().slice(0,10);
  const urls = [
    { loc: `${base}/`, lastmod: today, priority: '1.0' },
    { loc: `${base}/articles.html`, lastmod: today, priority: '0.8' },
    ...articles.filter(a => !a.externalUrl).map(a => ({
      loc: `${base}/posts/${a.id}.html`,
      lastmod: a.date || today,
      priority: '0.7'
    }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

/* ── robots.txt ── */
function buildRobots(baseUrl){
  const base = baseUrl.replace(/\/$/,'');
  return `User-agent: *
Allow: /
Disallow: /admin.html

Sitemap: ${base}/sitemap.xml
`;
}

/* ── 舊網址轉址頁：article.html?id=x → posts/x.html ── */
function buildRedirectPage(){
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>轉跳中…</title>
<script>
  const id = new URLSearchParams(location.search).get('id');
  location.replace(id ? 'posts/' + id + '.html' : 'articles.html');
</script>
</head>
<body><p>轉跳中… <a href="articles.html">若沒有自動跳轉請點這裡</a></p></body>
</html>`;
}
