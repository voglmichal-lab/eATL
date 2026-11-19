/* eTechLog – language layer.
   The app is written in Czech. In English, every text the app puts on screen is replaced by its translation
   from lang-en.js the moment it appears (before the browser paints it), and put back when the language returns
   to Czech. Values the crew types (inputs, textareas) are never touched – only texts the app itself writes.
   A text without a translation simply stays Czech, nothing breaks.
   Keys with {0},{1}… match texts with values inside ("Strana {0} z {1}"); a value that is itself a known
   text is translated too ("Pondělí"). */
(function(){
  'use strict';
  const D=self.ETL_EN||{};
  const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','PRE']);
  const ATTRS=['placeholder','title','aria-label','alt'];
  const LETTER=/[A-Za-zÀ-ž]/;
  let lang='cs';
  const exact=new Map();const buckets=new Map();const free=[];
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const norm=s=>s.replace(/\s+/g,' ').trim();
  for(const k of Object.keys(D)){
    const v=D[k];if(typeof v!=='string')continue;const key=norm(k);
    if(!/\{\d+\}/.test(key)){exact.set(key,v);continue}
    // a value glued to a word ("Přílet{0}") must not start / end inside a longer word ("Příletová")
    // values right next to each other ("{0}{1}") cannot be told apart: one group for both
    const parts=key.replace(/(\{\d+\})(?:\{\d+\})+/g,'$1').split(/(\{\d+\})/);let src='^',order=[],lit=0;const W='A-Za-zÀ-ž';
    parts.forEach((p,i)=>{const m=/^\{(\d+)\}$/.exec(p);if(m){order.push(+m[1]);const prev=parts[i-1]||'',next=parts[i+1]||'';
        const g=i===parts.length-2&&next===''?'(.*)':'(.*?)';src+=(/[A-Za-zÀ-ž]$/.test(prev)?'(?!['+W+'])':'')+g+(/^[A-Za-zÀ-ž]/.test(next)?'(?<!['+W+'])':'')}
      else{src+=esc(p);lit+=p.length}});
    const pre=parts[0];const pat={re:new RegExp(src+'$'),out:v,order,lit,pre};
    if(pre){const b=pre[0];if(!buckets.has(b))buckets.set(b,[]);buckets.get(b).push(pat)}else free.push(pat);
  }
  // headings the app writes in capitals ("PLÁN LETU")
  const upper=new Map();for(const [k,v] of exact){const u=k.toUpperCase();if(u!==k&&!exact.has(u)&&!upper.has(u))upper.set(u,v.toUpperCase())}
  const bylit=(a,b)=>b.lit-a.lit;buckets.forEach(l=>l.sort(bylit));free.sort(bylit);
  const CZC=/[ěščřžýáíéůúťďňóĚŠČŘŽÝÁÍÉŮÚŤĎŇÓ]/g;
  const score=s=>(s.match(CZC)||[]).length;
  // every pattern that fits (most specific first), translated values inside
  function viaPats(t,d,out){
    const cand=(buckets.get(t[0])||[]);let n=0;
    for(const list of [cand,free])for(const p of list){
      if(p.pre&&!t.startsWith(p.pre))continue;const m=p.re.exec(t);if(!m)continue;
      const g={};p.order.forEach((k,i)=>{g[k]=m[i+1]});
      out.push(p.out.replace(/\{(\d+)\}/g,(_,k)=>g[k]==null?'':d<4?keepWs(g[k],d+1):g[k]));
      if(++n>=6)return;
    }
  }
  const keepWs=(v,d)=>{const t=v.trim();if(!t)return v;const r=core(t,d);return r===t?v:v.slice(0,v.indexOf(t[0]))+r+v.slice(v.lastIndexOf(t[t.length-1])+1)};
  const CACHE=new Map();
  // translate one normalized text (no surrounding whitespace); the candidate leaving the least Czech wins
  function core(t,d){
    if(!t||!LETTER.test(t))return t;
    const hit=exact.get(t)??upper.get(t);if(hit!=null)return hit;
    const ck=d+'|'+t;const c=CACHE.get(ck);if(c!==undefined)return c;
    const out=[];viaPats(t,d,out);
    if(d<6){
      if(/[.!?] \S/.test(t)){const ps=t.split(/(?<=[.!?]) (?=\S)/);if(ps.length>1)out.push(ps.map(x=>core(x,d+1)).join(' '))}
      for(const sep of [' · ',' – ',' | ',', ',': ']){if(t.includes(sep))out.push(t.split(sep).map(x=>core(x,d+1)).join(sep))}
      const m=/^([·–\-:,;(\[‹›•+…\s]*)(.*?)([·–\-:,;.)\]‹›…?!\s]*)$/.exec(t);
      if(m&&(m[1]||m[3])&&m[2])out.push(m[1]+core(m[2],d+1)+m[3]);
      // a known text followed by values ("Obchodní (CAT) SUA6L")
      if(t.includes(' ')){const w=t.split(' ');for(let i=w.length-1;i>0;i--){const h=exact.get(w.slice(0,i).join(' '));if(h!=null){out.push(h+' '+core(w.slice(i).join(' '),d+1));break}}}
    }
    const s0=score(t);let best=t,bs=s0;
    for(const o of out){if(o===t)continue;const so=score(o);if(so<bs||(best===t&&so===bs&&s0===0)){best=o;bs=so}}
    if(CACHE.size>20000)CACHE.clear();CACHE.set(ck,best);return best;
  }
  function tr(s){if(lang!=='en'||s==null)return s;s=String(s);const t=norm(s);if(!t)return s;const r=core(t,0);return r===t?s:r}
  // --- live DOM ---
  const ORIG=new WeakMap();   // text node -> [czech, english]
  const AORIG=new WeakMap();  // element -> {attr:[czech, english]}
  // an <option> without value= submits its text: leave it alone
  const skip=n=>{const o=n.parentNode;if(o&&o.tagName==='OPTION'&&!o.hasAttribute('value'))return true;for(let e=n.parentNode;e&&e.nodeType===1;e=e.parentNode){if(SKIP.has(e.tagName)||e.isContentEditable||e.hasAttribute('data-notr'))return true}return false};
  function doText(n){
    const v=n.nodeValue;if(!v||!LETTER.test(v))return;
    const o=ORIG.get(n);if(o&&o[1]===v)return;      // already ours
    if(skip(n))return;
    const t=norm(v);const r=core(t,0);if(r===t){ORIG.delete(n);return}
    const lead=/^\s*/.exec(v)[0],trail=/\s*$/.exec(v)[0];const nv=lead+r+trail;
    ORIG.set(n,[v,nv]);n.nodeValue=nv;
  }
  function doAttrs(el){
    for(const a of ATTRS){const v=el.getAttribute(a);if(!v||!LETTER.test(v))continue;
      const m=AORIG.get(el)||{};if(m[a]&&m[a][1]===v)continue;
      const t=norm(v);const r=core(t,0);if(r===t)continue;
      m[a]=[v,r];AORIG.set(el,m);el.setAttribute(a,r)}
  }
  function walk(root){
    if(root.nodeType===3){doText(root);return}
    if(root.nodeType!==1&&root.nodeType!==11)return;
    if(root.nodeType===1){if(SKIP.has(root.tagName))return;doAttrs(root)}
    const it=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let n;
    while((n=it.nextNode())){if(n.nodeType===3)doText(n);else doAttrs(n)}
  }
  let mo=null;
  function onMut(list){for(const m of list){
    if(m.type==='characterData')doText(m.target);
    else if(m.type==='attributes')doAttrs(m.target);
    else m.addedNodes.forEach(walk)}}
  function restore(root){
    const it=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let n;
    while((n=it.nextNode())){
      if(n.nodeType===3){const o=ORIG.get(n);if(o&&n.nodeValue===o[1])n.nodeValue=o[0];ORIG.delete(n)}
      else{const m=AORIG.get(n);if(m){for(const a in m)if(n.getAttribute(a)===m[a][1])n.setAttribute(a,m[a][0]);AORIG.delete(n)}}
    }
  }
  function setLang(l){
    l=l==='en'?'en':'cs';if(l===lang)return false;lang=l;
    document.documentElement.lang=l;
    if(l==='en'){walk(document.body);if(!mo)mo=new MutationObserver(onMut);mo.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS})}
    else{if(mo)mo.disconnect();restore(document.body)}
    return true;
  }
  self.ETL_I18N={tr,setLang,en:s=>{const t=norm(String(s));return core(t,0)},get lang(){return lang},has:k=>exact.has(norm(k)),size:exact.size};
})();
