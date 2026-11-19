// Lists the Czech texts of the app that have no English translation in lang-en.js.
// Run after changing texts:  cd tools && npm i acorn acorn-walk && node i18n-check.js
// Add each reported text to lang-en.js ("Czech text":"English", values as {0},{1}…). A text without a
// translation is simply shown in Czech in the English version – nothing breaks.
// extracts every user-visible text fragment from the app sources -> keys.json
// key = normalized text; dynamic parts become {0},{1}…
const fs=require('fs'),acorn=require('acorn'),walk=require('acorn-walk');
const SRC=require('path').join(__dirname,'..');
const files=['app.js','atis.js','ftl.js'];
const M='\u0001';
const ent=s=>s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#8209;/g,'‑');
const norm=s=>ent(s).replace(/\s+/g,' ').trim();
const keys=new Map(); // key -> {n, files:Set}
const CZ=/[ěščřžýáíéůúťďňóĚŠČŘŽÝÁÍÉŮÚŤĎŇÓ]/;
function addKey(k,f){k=k.trim();if(!/[A-Za-zÀ-ž]/.test(k))return;if(k.length<2&&!CZ.test(k))return;
  const e=keys.get(k)||{n:0,files:new Set()};e.n++;e.files.add(f);keys.set(k,e)}
const ATTR=/\b(title|placeholder|aria-label|alt|data-tip)="([^"]*)"/g;
function processText(str,f){ // str may contain M placeholders and html
  // attributes inside tags
  {let m;ATTR.lastIndex=0;while((m=ATTR.exec(str)))seg(m[2],f)}
  for(const part of str.split(/<[^>]*>|<[^>]*$|^[^<]*>/))seg(part,f);
}
function seg(t,f){
  // a tag cut by a placeholder (`<div ${x}>`) leaves junk like ` class="x"` — drop segments that look like markup/code
  t=norm(t);if(!t)return;
  if(/^[\w-]+="/.test(t)||/=["']/.test(t)&&!/\s[a-zěščřžýáíéůú]{3,}\s/i.test(t.replace(/\w+="[^"]*"/g,'')))return;
  if(t.includes(M)){let i=0;const pat=t.replace(new RegExp(M,'g'),()=>'{'+(i++)+'}');
    if(/[A-Za-zÀ-ž]/.test(pat.replace(/\{\d+\}/g,'')))addKey(pat,f);
    for(const p of t.split(M))addKey(norm(p),f);
  }else addKey(t,f);
}
function flat(node,out){ // flatten a + chain
  if(node.type==='BinaryExpression'&&node.operator==='+'){flat(node.left,out);flat(node.right,out)}else out.push(node);return out}
function tplStr(node){return node.quasis.map((q,i)=>q.value.cooked+(i<node.expressions.length?M:'')).join('')}
for(const f of files){
  const code=fs.readFileSync(SRC+'/'+f,'utf8');
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'script',allowHashBang:true});
  walk.ancestor(ast,{
    Literal(n){if(typeof n.value==='string')processText(n.value,f)},
    TemplateLiteral(n,anc){processText(tplStr(n),f)},
    BinaryExpression(n,anc){
      if(n.operator!=='+')return;const par=anc[anc.length-2];if(par&&par.type==='BinaryExpression'&&par.operator==='+')return;
      const ops=flat(n,[]);if(!ops.some(o=>(o.type==='Literal'&&typeof o.value==='string')||o.type==='TemplateLiteral'))return;
      if(ops.every(o=>o.type!=='Literal'&&o.type!=='TemplateLiteral'))return;
      const s=ops.map(o=>o.type==='Literal'&&typeof o.value==='string'?o.value:o.type==='TemplateLiteral'?tplStr(o):M).join('');
      processText(s,f);
    }
  });
}
// index.html text
{const h=fs.readFileSync(SRC+'/index.html','utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,'');processText(h,'index.html')}
const all=[...keys.entries()].map(([k,v])=>({k,cz:CZ.test(k),pat:/\{\d+\}/.test(k)}));
const code=x=>{const s=x.k;const lit=s.replace(/\{\d+\}/g,'');
  if(!/[A-Za-zÀ-ž]{2}/.test(lit))return true;
  if(/^[a-z0-9_.:\-\/?=#\[\]\(\)\*@,+]+$/.test(lit.trim()))return true; // identifiers, paths, keys
  if(/^(etl|var\(|--|#|data-|fonts\/|vendor\/|\(prefers|\(display|sb_|https?:)/.test(lit)||(/^[.\[]/.test(lit)&&!/ /.test(lit)))return true;
  if(/^[A-Z0-9_]+$/.test(lit)&&/_/.test(lit))return true;
  if(/^[A-Z][a-z]+[A-Z]\w*$/.test(lit))return true; // CamelCase
  if(/[{};]\s*$|^\s*[{}]|=>|\bfunction\b|\$\{/.test(lit))return true;
  if(/^[a-z-]+:[^ ]/.test(lit)&&!/ /.test(lit))return true;
  if(/^[\w-]+( [\w-]+)*$/.test(lit)&&/^[a-z]/.test(lit)&&/-/.test(lit)&&!/[ěščřžýáíéůú]/.test(lit))return true; // css classes "btn sm primary"
  return false};
global.self=global;require('../lang-en.js');require('../i18n.js');const EN=self.ETL_I18N.en;const CZC=/[ěščřžýáíéůúťďňó]/i;
const miss=all.filter(x=>!code(x)&&!/:not\(|\[[a-z-]+[=\]]/.test(x.k)&&(x.cz||/^[.(]/.test(x.k))&&!(x.k in self.ETL_EN)&&CZC.test(EN(x.k.replace(/\{\d+\}/g,'X'))));
console.log(miss.length?miss.map(x=>JSON.stringify(x.k)).join('\n'):'all Czech texts have a translation');
console.log(`(${miss.length} missing; texts without diacritics are not checked – look at the English app)`);
