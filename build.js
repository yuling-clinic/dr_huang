/* 本機產生靜態頁：node build.js  （平常用後台發布即可，這支是備用/離線用） */
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname,'js/generator.js'),'utf8'));

const data = JSON.parse(fs.readFileSync(path.join(__dirname,'data/articles.json'),'utf8'));
const baseUrl = data.site.siteUrl || 'https://example.github.io/site';
if(!data.site.siteUrl){
  console.warn('⚠️  data/articles.json 裡沒有填 site.siteUrl，先用範例網址產生。');
}

fs.mkdirSync(path.join(__dirname,'posts'), {recursive:true});
data.articles.forEach(a => {
  fs.writeFileSync(path.join(__dirname,'posts',a.id+'.html'),
    buildPostHTML(data.site, data.articles, a, baseUrl));
  console.log('✓ posts/'+a.id+'.html');
});
fs.writeFileSync(path.join(__dirname,'sitemap.xml'), buildSitemap(data.site, data.articles, baseUrl));
fs.writeFileSync(path.join(__dirname,'robots.txt'), buildRobots(baseUrl));
fs.writeFileSync(path.join(__dirname,'article.html'), buildRedirectPage());
console.log('✓ sitemap.xml / robots.txt / article.html');
