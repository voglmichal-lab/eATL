
(async function(){
'use strict';

/* ---------- constants ---------- */
const ROLE={admin:'Správce',crew:'Posádka',mech:'Mechanik',camo:'CAMO'};
const CFG_DEFAULT={opName:'',aoc:'',bases:['LKPR'],ftlBy:'fl3xx',ftlRules:'EASA',omRef:'',reportMin:60,postMin:30,splitDuty:false,pageFmt:'seq',crsQuick:['Daily check','Weekly check','50 FH','100 FH','Phase inspection','Výměna kola','Výměna brzd'],
  ofpRules:[{k:'to_flaps',type:'',def:'15',max:''},{k:'vfto',type:'',def:'160',max:''},{k:'vfs',type:'',def:'160',max:''}]};
// OFP fields the operator can pre-fill or limit
const OFP_FIELDS=[['to_w','TO weight',1],['to_dist','TO dist',1],['to_pwr','Power',0],['to_flaps','Flaps (vzlet)',0],['v1','V1',1],['vr','VR',1],['v2','V2',1],['vfto','VFTO',1],['emr_vref','EMR VREF',1],['emr_vapp','EMR VAPP',1],['ld_w','LD weight',1],['ld_dist','LD dist',1],['vref','VREF',1],['vapp','VAPP',1],['vfs','VFS',1],['magrad','MA grad',0],['ld167','LD × 1,67',1]];
const OFP_FL=Object.fromEntries(OFP_FIELDS.map(f=>[f[0],f]));
const PAGE_FMT={seq:'Jako na papíře – předčíslí letadla + pořadové číslo (např. 400216)',date:'Registrace + datum (např. WND-261106, druhá stránka dne WND-261106-2)'};
const FTL_BY={fl3xx:'Fl3xx – eATL posílá skutečné časy, Fl3xx počítá službu',internal:'eATL – vestavěný výpočet',none:'Nepočítat'};
const FTL_RULES={EASA:'EASA ORO.FTL / CS FTL.1',SUBQ:'EU-OPS Subpart Q (air taxi, národní pravidla)',FAA135:'FAA Part 135 Subpart F',FAA117:'FAA Part 117',CUSTOM:'Vlastní – dle provozní příručky'};
const KIND={CAT:'Obchodní (CAT)',FERRY:'Přelet',TRN:'Výcvik',TECH:'Technický let',NCO:'Neobchodní'};
const MELDAYS={A:null,B:3,C:10,D:120};
const DAILY={PRE:'Předletová prohlídka',DAILY:'Denní prohlídka',POST:'Poletová prohlídka'};
const PER_PAGE=5;

/* ---------- storage (per device) ---------- */
/* local store: IndexedDB (survives far better than localStorage on iPad), held in memory for synchronous reads */
const KV={data:{},db:null,
  async init(){
    try{
      this.db=await new Promise((res,rej)=>{const r=indexedDB.open('etechlog',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
      this.data=await new Promise((res,rej)=>{const out={};const c=this.db.transaction('kv').objectStore('kv').openCursor();c.onsuccess=()=>{const cur=c.result;if(cur){out[cur.key]=cur.value;cur.continue()}else res(out)};c.onerror=()=>rej(c.error)});
    }catch(e){this.db=null;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('etl.'))this.data[k]=JSON.parse(localStorage.getItem(k))}}catch(x){}}
    try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
  },
  put(k,v){this.data[k]=v;
    if(this.db){try{this.db.transaction('kv','readwrite').objectStore('kv').put(v,k);return}catch(e){}}
    try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
await KV.init();
const store={get(k,d){return k in KV.data?KV.data[k]:d},set(k,v){KV.put(k,v)}};

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const v=id=>{const el=document.getElementById(id);return el?String(el.value||'').trim():''};
const chk=id=>{const el=document.getElementById(id);return !!(el&&el.checked)};
function rid(p){let r='';try{r=crypto.randomUUID().replace(/-/g,'')}catch(e){r=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)} return p+'-'+Date.now().toString(36)+'-'+r.slice(0,8)}
function hm(min){if(min==null||isNaN(min))return '–';const neg=min<0;min=Math.abs(Math.round(min));const h=Math.floor(min/60);return (neg?'-':'')+h.toLocaleString('cs-CZ').replace(/\s/g,' ')+':'+pad(min%60)}
function parseHM(s){const m=String(s||'').trim().match(/^(\d{1,2}):?(\d{2})$/);if(!m)return null;const h=+m[1],mi=+m[2];if(h>23||mi>59)return null;return h*60+mi}
function normHM(s){const t=parseHM(s);return t==null?s:pad(Math.floor(t/60))+':'+pad(t%60)}
function parseDur(s){const m=String(s||'').replace(/[\s ]/g,'').match(/^(\d+):(\d{2})$/);if(!m||+m[2]>59)return null;return (+m[1])*60+(+m[2])}
function dur(a,b){const x=parseHM(a),y=parseHM(b);if(x==null||y==null)return null;return (y-x+1440)%1440}
function todayISO(){return new Date().toISOString().slice(0,10)}
function fmtDate(iso){if(!iso)return '–';const [y,m,d]=iso.split('-');return d+'/'+m+'/'+y}
function parseDate(s){const m=String(s||'').trim().match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);if(!m)return null;const d=+m[1],mo=+m[2],y=+m[3];const dt=new Date(Date.UTC(y,mo-1,d));if(dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)return null;return y+'-'+pad(mo)+'-'+pad(d)}
function addDays(iso,n){const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function daysBetween(a,b){return Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/864e5)}
function fmtTs(iso){if(!iso)return '–';const d=new Date(iso);return pad(d.getUTCDate())+'/'+pad(d.getUTCMonth()+1)+'/'+d.getUTCFullYear()+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+'Z'}
function fmtClock(ms){const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())}
async function sha(s){if(crypto&&crypto.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')} let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return 'fnv'+(h>>>0).toString(16)}
function legBy(l){return l.signed||l.opened||{}}
function legAt(l){return legBy(l).at||''}
const dash=x=>x?esc(x):'–';
function legDepIso(l){return l.date+'T'+(parseHM(l.out)!=null?normHM(l.out):'00:00')+':00.000Z'}
function legArrIso(l){const o=parseHM(l.out),i=parseHM(l.in);const d=(o!=null&&i!=null&&i<o)?addDays(l.date,1):l.date;return d+'T'+(i!=null?normHM(l.in):'23:59')+':00.000Z'}
function nowHM(){const d=new Date();return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())}
const DAYS=['Neděle','Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota'];
function has(u,r){return !!(u&&Array.isArray(u.roles)&&u.roles.includes(r))}
function withTimeout(p,ms){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),ms))])}

/* ---------- state ---------- */
let EV=store.get('etl.ev',{});          // all known events (local replica)
let OUT=store.get('etl.out',[]);        // event ids waiting to be sent
let DEV=store.get('etl.dev',null); if(!DEV){DEV='dev-'+rid('x').slice(-8);store.set('etl.dev',DEV)}
let SEQ=store.get('etl.seq',0);
let SESSION=store.get('etl.session',null);
let SIMOFF=store.get('etl.simoff',false);
const UI={acId:store.get('etl.ac',null),tab:'log',page:null,defFilter:'active',loginUser:null,auditAll:false};
const OFFREQ=['./','index.html','app.css','fonts.css','app.js','config.js','version.js','manifest.webmanifest','vendor/supabase.js','vendor/591.supabase.js','vendor/pdf.min.js','vendor/pdf.worker.min.js','vendor/qrcode.min.js','vendor/jsqr.min.js','vendor/pdf-lib.min.js','vendor/fontkit.min.js','fonts/pdf/barlow-400.ttf','fonts/pdf/barlow-600.ttf','fonts/pdf/plexmono-400.ttf','fonts/pdf/plexmono-600.ttf'];
const off={ready:null,missing:[],checking:false};
const net={state:'connecting',err:null,last:store.get('etl.last',null),flushing:false,slow:false,loaded:!!store.get('etl.cursor',null),email:null};
let db=null,S=null,sheetSubmit=null,sheetLive=null,sbChan=null;

let BIND=store.get('etl.bind',null);   // this device is the iPad of this aircraft
let CREW=store.get('etl.crew',null);   // crew of the day on this iPad
UI.office=store.get('etl.office',false);UI.crewView='today';UI.startPic=null;UI.startSic=null;
UI.draft=(()=>{const d=store.get('etl.draft',null);return d&&d.ac===BIND&&d.d?d.d:{}})();

function persist(){store.set('etl.ev',EV);store.set('etl.out',OUT);store.set('etl.seq',SEQ)}
function mode(){return UI.office?'office':'crew'}
// Shared account (all iPads) → crew picks themselves and signs with PIN.
// Personal account (web) → its e-mail matches a person in the log, who is signed in directly.
function acctEmail(){return String(net.email||store.get('etl.acct','')||'').toLowerCase()}
function personal(){const e=acctEmail();if(!e||!S)return null;return Object.values(S.users).find(x=>x.active!==false&&x.email&&x.email===e)||null}
function setOffice(on){UI.office=on;store.set('etl.office',on)}
function isBase(icao){return !!icao&&(S.cfg.bases||[]).includes(String(icao).toUpperCase())}
function crewValid(){return !!(S&&CREW&&Date.now()-CREW.at<18*3600e3&&S.users[CREW.pic]&&S.users[CREW.pic].active!==false)}
function me(){if(!S)return null;if(mode()==='crew')return crewValid()?S.users[CREW.pic]:null;return SESSION&&S.users[SESSION.userId]||null}
function saveDraft(){store.set('etl.draft',{ac:BIND,d:UI.draft})}

/* ---------- event log ---------- */
function emit(items,asId){
  const at=new Date().toISOString();const u=(asId&&S.users[asId])||me();
  items.forEach(([type,p],i)=>{SEQ++;const ev={id:rid('ev'),type,p:JSON.parse(JSON.stringify(p)),at,n:i,by:u?u.id:'system',bn:u?u.name:'Systém',dev:DEV,seq:SEQ};EV[ev.id]=ev;OUT.push(ev.id)});
  persist();rebuild();render();flush();
}

function rebuild(){
  const list=Object.values(EV).sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:((a.n||0)-(b.n||0))||(a.id<b.id?-1:1));
  const s={ac:{},users:{},legs:{},defects:{},crs:[],daily:{},grounds:[],secs:[],ofps:{},cfg:Object.assign({},CFG_DEFAULT),list,out:new Set(OUT)};
  for(const e of list){
    const p=e.p||{};const who={id:e.by,name:e.bn,at:e.at,ev:e.id,dev:e.dev};
    switch(e.type){
      case 'ac.upsert':{const prev=s.ac[p.acId]||{};s.ac[p.acId]=Object.assign({},prev,p);if(p.live&&!prev.live)s.ac[p.acId].liveWho=who;break}
      case 'user.upsert':s.users[p.userId]=Object.assign({},s.users[p.userId]||{},p,{id:p.userId});break;
      case 'leg.open':s.legs[p.legId]=Object.assign({},p,{state:'open',opened:who,signed:null,history:[],ev:e.id,openEv:e.id});break;
      case 'leg.sign':{const ex=s.legs[p.legId];s.legs[p.legId]=Object.assign({},ex||{},p,{state:'closed',signed:who,history:ex?ex.history:[],ev:e.id,openEv:ex?ex.openEv:null,opened:ex?ex.opened:null});break}
      case 'leg.amend':{const l=s.legs[p.legId];if(!l)break;const prev={};for(const k in p.changes)prev[k]=l[k];Object.assign(l,p.changes);l.history.push(Object.assign({},who,{reason:p.reason,changes:p.changes,prev}));break}
      case 'leg.void':{const l=s.legs[p.legId];if(l)l.void=Object.assign({},who,{reason:p.reason});break}
      case 'daily.sign':{const k=p.acId+'|'+p.date;(s.daily[k]=s.daily[k]||[]).push(Object.assign({},p,who));break}
      case 'defect.report':s.defects[p.defId]=Object.assign({},p,{status:'open',reported:who,trail:[Object.assign({t:p.src==='paper'?'Převzato z papírového deníku'+(p.paperPage?', str. '+p.paperPage:''):'Zapsáno'},who)]});break;
      case 'defect.defer':{const d=s.defects[p.defId];if(!d)break;d.status='deferred';d.deferral=Object.assign({},p,who);d.trail.push(Object.assign({t:'Odloženo dle MEL '+(p.melItem||'')+' kat. '+p.cat},who));break}
      case 'defect.rectify':{const d=s.defects[p.defId];if(!d)break;d.status='closed';d.rect=Object.assign({},p,who);d.trail.push(Object.assign({t:'Odstraněno, CRS vydáno'},who));break}
      case 'crs.issue':s.crs.push(Object.assign({},p,who));break;
      case 'ac.ground':s.grounds.push(Object.assign({},p,who));break;
      case 'sec.sign':s.secs.push(Object.assign({},p,who));break;
      case 'cfg.set':Object.assign(s.cfg,p);s.cfgSet=who;break;
      case 'ofp.import':if(!s.ofps[p.ofpId])s.ofps[p.ofpId]=Object.assign({},p.data,{ofpId:p.ofpId,acId:p.acId,file:p.file,imported:who,fill:{},defs:p.defs||null,signed:null,void:null});break;
      case 'ofp.fill':{const o=s.ofps[p.ofpId];if(o)Object.assign(o.fill,p.data);break}
      case 'ofp.sign':{const o=s.ofps[p.ofpId];if(o&&!o.signed)o.signed=who;break}
      case 'ofp.void':{const o=s.ofps[p.ofpId];if(o)o.void=Object.assign({},who,{reason:p.reason});break}
      case 'ofp.close':{const o=s.ofps[p.ofpId];if(o){o.closed=who;o.missing=p.missing||[];if(p.defs&&!o.defs)o.defs=p.defs}break}
      case 'ofp.reopen':{const o=s.ofps[p.ofpId];if(o){o.closed=null;(o.reopened=o.reopened||[]).push(Object.assign({},who,{reason:p.reason}))}break}
    }
  }
  s.acList=Object.values(s.ac).filter(a=>!a.archived).sort((a,b)=>String(a.reg).localeCompare(String(b.reg)));
  for(const ac of Object.values(s.ac))deriveAc(s,ac);
  // an aircraft is open to crews only after CAMO/admin confirmed its starting state from the paper log
  for(const ac of Object.values(s.ac))ac.isLive=!!ac.live||ac.legs.length>0;
  s.liveList=s.acList.filter(a=>a.isLive);
  S=s;
  if(!UI.acId||!s.ac[UI.acId])UI.acId=s.acList[0]?s.acList[0].acId:null;
}

function deriveAc(s,ac){
  const sk=l=>{const t=[l.out,l.std,l.sec&&l.sec.time].map(parseHM).find(x=>x!=null);return t==null?0:t};
  const legs=Object.values(s.legs).filter(l=>l.acId===ac.acId).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(sk(a)-sk(b))||(legAt(a)<legAt(b)?-1:1));
  let air=ac.openAir||0,cyc=ac.openCyc||0,num=parseInt(ac.startPage,10)||1,prev=null,cur=null;const pages=[];const seen={};
  const byDate=s.cfg.pageFmt==='date',dayCnt={},rcode=String(ac.reg||'').split('-').pop();
  const nextNo=d=>{if(!byDate)return num++;dayCnt[d]=(dayCnt[d]||0)+1;return rcode+'-'+d.slice(2).replace(/-/g,'')+(dayCnt[d]>1?'-'+dayCnt[d]:'')};
  for(const l of legs){
    l.air=dur(l.off,l.on)||0;l.block=dur(l.out,l.in)||0;l.gap=null;l.dup=false;
    if(l.state==='open'){l.air=0;l.block=0}
    if(!cur||cur.date!==l.date||cur.legs.length>=PER_PAGE){cur={no:nextNo(l.date),date:l.date,legs:[],bfAir:air,bfCyc:cyc,acId:ac.acId};pages.push(cur)}
    l.page=cur.no;l.idx=cur.legs.length+1;cur.legs.push(l);
    if(!l.void){
      if(prev&&prev.to&&l.from&&prev.to!==l.from)l.gap=prev.to;
      if(l.state!=='open'){
        const k=l.date+'|'+l.from+'|'+l.out; if(seen[k]){l.dup=true;seen[k].dup=true} else seen[k]=l;
        air+=l.air;cyc+=(+l.ldg||0);prev=l;
      }
    }
    l.ttaf=air;l.tcyc=cyc;cur.cfAir=air;cur.cfCyc=cyc;
  }
  for(const p of pages){p.pending=p.legs.some(l=>s.out.has(l.ev));const act=p.legs.filter(l=>!l.void);p.air=p.cfAir-p.bfAir;p.block=act.reduce((a,l)=>a+l.block,0);p.ldg=p.cfCyc-p.bfCyc;p.key=ac.acId+'|'+p.no}
  const defs=Object.values(s.defects).filter(d=>d.acId===ac.acId).sort((a,b)=>a.reported.at<b.reported.at?-1:1);
  const code=String(ac.reg||'').split('-').pop();
  defs.forEach((d,i)=>{d.no=code+'-'+String(i+1).padStart(3,'0');const l=d.legId&&s.legs[d.legId];d.pageRef=l?l.page+'/'+l.idx:null});
  const today=todayISO();
  const open=defs.filter(d=>d.status==='open'),deferred=defs.filter(d=>d.status==='deferred');
  const overdue=deferred.filter(d=>d.deferral&&d.deferral.due&&d.deferral.due<today);
  const lastG=[...s.grounds].reverse().find(g=>g.acId===ac.acId);
  const lastC=[...s.crs].reverse().find(c=>c.acId===ac.acId);
  const grounded=lastG&&(!lastC||lastC.at<lastG.at)?lastG:null;
  ac.ofps=Object.values(s.ofps).filter(o=>o.acId===ac.acId).sort((a,b)=>(a.date+a.std)<(b.date+b.std)?-1:1);
  for(const o of ac.ofps)o.leg=legs.find(l=>l.ofpId===o.ofpId&&!l.void)||null;
  const openLegs=legs.filter(l=>l.state==='open'&&!l.void);
  const openLeg=openLegs[openLegs.length-1]||null;
  ac.openLegs=openLegs;
  // security searches belong to the next departure: signed after the previous on-block, before this off-block (+5 min)
  const secs=s.secs.filter(x=>x.acId===ac.acId).sort((a,b)=>a.at<b.at?-1:1);
  const flown=legs.filter(l=>l.state!=='open'&&!l.void).sort((a,b)=>legDepIso(a)<legDepIso(b)?-1:1);
  let prevArr='';
  for(const l of flown){
    const dep=new Date(new Date(legDepIso(l)).getTime()+5*60e3).toISOString();
    if(!l.sec){const c=secs.filter(x=>x.at>prevArr&&x.at<=dep);const x=c[c.length-1];if(x)l.sec={time:x.time,place:x.from,result:x.result,notes:x.notes,byName:x.name,ev:x.ev}}
    prevArr=legArrIso(l);
  }
  const ps=[...secs].reverse().find(x=>x.at>prevArr);
  ac.secs=secs;ac.pendingSec=ps&&Date.now()-new Date(ps.at).getTime()<18*3600e3?ps:null;
  Object.assign(ac,{legs,pages,air,cyc,lastLeg:prev,openLeg,defects:defs,open,deferred,overdue,grounded,lastCrs:lastC,nextPage:num});
  ac.status=(grounded||open.length||overdue.length)?'warn':deferred.length?'caution':'ok';
}
const STATUS_LABEL={ok:'Provozuschopné',caution:'Provoz s odklady',warn:'Neprovozuschopné'};

/* ---------- sync ---------- */
/* ---------- sync with Supabase: append-only event log ---------- */
const CONF=window.ETL_CONFIG||{};
const PAGE=1000;
function toRow(ev){return {id:ev.id,type:ev.type,p:ev.p,at:ev.at,n:ev.n||0,by:ev.by,bn:ev.bn,dev:ev.dev,seq:ev.seq||0}}
function fromRow(r){return {id:r.id,type:r.type,p:r.p||{},at:r.at,n:r.n||0,by:r.by,bn:r.bn,dev:r.dev,seq:r.seq||0}}
function sbErr(e){const m=String(e&&(e.message||e.msg)||e||'');if(/JWT|auth|401|not authenticated/i.test(m))return 'Přihlášení zařízení vypršelo – přihlaste se znovu.';if(/permission|42501|row-level/i.test(m))return 'Server odmítl zápis – účet nemá oprávnění.';if(/fetch|network|Failed/i.test(m))return 'Server není dostupný.';return m.slice(0,160)}
async function initDb(){
  if(!window.supabase||!CONF.supabaseUrl||!CONF.supabaseKey){net.state='local';net.err=CONF.supabaseUrl?'Knihovna Supabase se nenačetla.':'Chybí nastavení serveru (config.js).';softRender();return}
  db=window.supabase.createClient(CONF.supabaseUrl,CONF.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'etl.sb.auth'}});
  db.auth.onAuthStateChange((ev,session)=>{
    net.email=session&&session.user?session.user.email:null;if(net.email)store.set('etl.acct',net.email);
    if(ev==='SIGNED_OUT'){net.state='auth';stopSync();softRender()}
  });
  await ensureSession();
}
// offline-first: a missing network never locks the crew out. Only a device that was never signed in
// (or whose sign-in the server rejected) needs to sign in, and even then local work goes on.
function hadSession(){try{return !!localStorage.getItem('etl.sb.auth')}catch(e){return false}}
async function ensureSession(){
  if(!db||net.checking)return;net.checking=true;
  try{
    const {data,error}=await db.auth.getSession();
    if(data&&data.session){net.email=data.session.user.email;if(!sbChan)startSync();else{pull();flush()}return}
    const retry=error&&(error.name==='AuthRetryableFetchError'||error.status===0||/fetch|network/i.test(String(error.message)));
    if(hadSession()&&(retry||navigator.onLine===false)){net.state='nosignal';net.err=null}
    else{net.state='auth';stopSync()}
  }catch(e){net.state=hadSession()?'nosignal':'auth'}
  finally{net.checking=false;softRender()}
}
// offline start needs: home-screen app (iOS keeps a separate store for it), an active service worker
// and every required file of this version in its cache
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
async function checkOffline(){
  if(off.checking)return;off.checking=true;const was=off.ready;
  try{
    if(!('serviceWorker' in navigator)||!window.caches){off.ready=false;off.missing=['prohlížeč nepodporuje offline režim']}
    else{
      const reg=await navigator.serviceWorker.getRegistration();
      const c=await caches.open('etl-'+(window.ETL_VERSION||'dev'));
      const miss=[];for(const f of OFFREQ){if(!(await c.match(new URL(f,location.href).href,{ignoreSearch:true})))miss.push(f)}
      off.missing=miss;off.ready=!!(reg&&reg.active)&&!miss.length;
      if(!(reg&&reg.active))off.missing=['offline režim se instaluje'].concat(miss);
    }
  }catch(e){off.ready=false;off.missing=[String(e&&e.message||e)]}
  finally{off.checking=false;if(was!==off.ready)softRender();else renderPill()}
}
function offlineNote(){
  if(isIOS&&!standalone())return `<div class="warnline warn wrap"><b>Otevřeno v Safari.</b> Bez signálu se spustí jen aplikace z ikony na ploše: Sdílet → Přidat na plochu a dál otevírejte jen ikonu.</div>`;
  if(off.ready===false)return `<div class="warnline caution wrap"><b>Offline režim ještě není připravený.</b> Nechte aplikaci chvíli otevřenou se signálem${off.missing.length?` <span class="muted">(${esc(off.missing.slice(0,3).join(', '))}${off.missing.length>3?'…':''})</span>`:''}.</div>`;
  return '';
}
function stopSync(){try{if(sbChan)db.removeChannel(sbChan)}catch(e){}sbChan=null}
function startSync(){
  net.state='connecting';softRender();
  stopSync();
  sbChan=db.channel('etl-events').on('postgres_changes',{event:'INSERT',schema:'public',table:'events'},pl=>{if(!SIMOFF&&pl&&pl.new)merge([pl.new])})
    .subscribe(st=>{if(st==='SUBSCRIBED'){pull()}else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){if(net.state==='live')net.state='stale';renderPill()}});
  pull().then(flush);
}
function merge(rows){
  let changed=false,cur=store.get('etl.cursor',null);
  for(const r of rows){
    if(!r||!r.id||!r.type)continue;
    if(!EV[r.id]){EV[r.id]=fromRow(r);changed=true}
    if(OUT.includes(r.id)){OUT=OUT.filter(x=>x!==r.id);changed=true}
    if(r.created_at&&(!cur||r.created_at>cur))cur=r.created_at;
  }
  if(cur)store.set('etl.cursor',cur);
  if(changed){persist();rebuild();softRender()}else renderPill();
}
async function pull(){
  if(!db||SIMOFF||net.pulling)return;net.pulling=true;
  try{
    // overlap 2 min behind the cursor so rows committed out of order are not missed; duplicates are ignored by id
    const cur=store.get('etl.cursor',null);const since=cur?new Date(new Date(cur).getTime()-120e3).toISOString():null;
    for(let from=0;;from+=PAGE){
      let q=db.from('events').select('*').order('created_at',{ascending:true}).order('id',{ascending:true}).range(from,from+PAGE-1);
      if(since)q=q.gte('created_at',since);
      const {data,error}=await q;if(error)throw error;
      merge(data||[]);if(!data||data.length<PAGE)break;
    }
    net.loaded=true;net.state='live';net.err=null;net.last=Date.now();store.set('etl.last',net.last);
  }catch(e){net.err=sbErr(e);net.state=/vypršelo/.test(net.err)?'auth':navigator.onLine===false||/není dostupný/.test(net.err)?'nosignal':'error'}
  finally{net.pulling=false;softRender()}
}
async function flush(){
  if(net.flushing||!db||net.state==='auth'||SIMOFF||!OUT.length||navigator.onLine===false)return;
  net.flushing=true;renderPill();
  try{
    for(let i=0;i<OUT.length;i+=200){
      const ids=OUT.slice(i,i+200).filter(id=>EV[id]);if(!ids.length)continue;
      const {error}=await withTimeout(db.from('events').upsert(ids.map(id=>toRow(EV[id])),{onConflict:'id',ignoreDuplicates:true}),20000);
      if(error)throw error;
      OUT=OUT.filter(x=>!ids.includes(x));i-=ids.length;net.last=Date.now();store.set('etl.last',net.last);net.err=null;persist();
    }
  }catch(e){net.err=e&&e.code==='timeout'?'Server neodpověděl včas.':sbErr(e);if(/vypršelo/.test(net.err))net.state='auth'}
  finally{net.flushing=false;rebuild();softRender()}
}
function resume(){if(!db)return;if(net.state==='nosignal'||!sbChan)ensureSession();else if(net.state!=='auth'){pull();flush()}}
window.addEventListener('online',()=>{renderPill();resume()});
window.addEventListener('offline',renderPill);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume()});
setInterval(()=>{if(db&&net.state!=='auth'&&navigator.onLine!==false)resume()},60000);

function renderDeviceLogin(){
  return `<div class="wrap"><div class="center">
    <div><p class="label">Přihlášení</p><h1>Připojit k serveru</h1><p class="muted" style="margin-top:6px"><b>iPad v letadle:</b> společný účet iPadů – jednou, pak se posádka jen vybírá a podepisuje PINem.<br><b>Web:</b> váš osobní e-mail. Zápisy uložené v zařízení zůstávají a odešlou se po přihlášení.</p></div>
    <form id="dev-login" class="panel" data-keep novalidate>
      <div class="fgrid wide"><label class="fld"><span>E-mail</span><input type="text" id="dl-email" autocomplete="username" inputmode="email" autocapitalize="off" value="${esc(store.get('etl.lastEmail','')||'')}"></label>
      <label class="fld"><span>Heslo</span><input type="password" id="dl-pass" autocomplete="current-password"></label></div>
      <p class="form-err" id="dl-err" hidden></p>
      <div><button class="btn primary" type="submit">Přihlásit zařízení</button></div>
    </form>
    ${OUT.length?`<div class="warnline caution">${OUT.length} záznamů v tomto zařízení čeká na odeslání – odešlou se po přihlášení.</div>`:''}
  </div></div>`;
}
function syncInfo(){
  const n=OUT.length;const q=n?` · ${n} čeká`:'';
  if(SIMOFF)return {cls:'caution',t:'Offline (simulace)'+q};
  if(navigator.onLine===false)return {cls:'caution',t:'Offline'+q};
  if(net.state==='auth')return {cls:'warn',t:'Zařízení není přihlášené'+q};
  if(net.state==='nosignal')return {cls:'caution',t:'Čeká na signál'+q};
  if(net.state==='local')return {cls:'caution',t:'Jen v tomto zařízení'+q};
  if(net.state==='error')return {cls:'warn',t:'Chyba synchronizace'+q};
  if(net.flushing)return {cls:'busy',t:'Odesílám '+n+'…'};
  if(net.state==='connecting')return {cls:'busy',t:'Připojuji…'};
  if(net.state==='stale')return {cls:'caution',t:'Server neodpovídá'+q};
  if(n)return {cls:'caution',t:n+' čeká na odeslání'};
  return {cls:'ok',t:'Synchronizováno'+(net.last?' '+fmtClock(net.last):'')};
}
function renderPill(){const el=document.getElementById('syncpill');if(!el)return;const s=syncInfo();el.innerHTML=`<span class="dot ${s.cls}"></span><span>${esc(s.t)}</span>`}

/* ---------- permissions ---------- */
const can={
  leg:u=>has(u,'crew')||has(u,'camo'),
  defer:u=>has(u,'crew')||has(u,'mech')||has(u,'camo'),
  rectify:u=>has(u,'mech'),
  crs:u=>has(u,'mech'),
  ground:u=>has(u,'mech')||has(u,'camo'),
  daily:u=>has(u,'crew')||has(u,'mech'),
  // CAME: corrections only by the PIC of that flight or by CAMO
  amend:(u,l)=>!!u&&(has(u,'camo')||(!!l&&l.pic===u.id)),
  admin:u=>has(u,'camo')||has(u,'admin'),
  settings:u=>has(u,'admin')||(!Object.values(S.users).some(x=>x.active!==false&&has(x,'admin'))&&has(u,'camo'))
};

/* ---------- render ---------- */
const ICON={
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  plane:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-6z" transform="translate(.5 0)"/></svg>',
  wrench:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L22 13.6 13.6 22l-2.3-2.3a4 4 0 0 0-5-5L2 10.4 10.4 2z" transform="scale(.9) translate(1.3 1.3)"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01"/></svg>',
  stop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  clip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/></svg>'
};

function header(){
  const u=me();const crew=mode()==='crew';const bac=BIND&&S.ac[BIND];
  let right='';
  if(crew){if(crewValid()){const sic=CREW.sic&&S.users[CREW.sic];right=`<div class="who"><span><b>${esc(u.name)}</b>${sic?' · '+esc(sic.name):''}</span><button class="btn sm" data-act="crew-end">Konec dne</button><button class="btn sm" data-act="crew-logout">Odhlásit</button></div>`}}
  else if(u&&personal())right=`<div class="who"><span><b>${esc(u.name)}</b> · ${u.roles.map(r=>ROLE[r]).join(', ')}</span><button class="btn sm" data-act="dev-logout">Odhlásit</button></div>`;
  else if(u)right=`<div class="who"><span><b>${esc(u.name)}</b> · ${u.roles.map(r=>ROLE[r]).join(', ')}</span><button class="btn sm" data-act="office-off">Režim posádky</button><button class="btn sm" data-act="logout">Odhlásit</button></div>`;
  return `<header class="top"><div class="top-in wrap">
    <div class="brand"><span class="brand-mark">ATL</span><div><b>${S.cfg.opName?esc(S.cfg.opName)+' ':''}eTechLog</b><small>${crew&&bac?'iPad · '+esc(bac.reg):S.cfg.aoc?esc(S.cfg.aoc):'nenastaveno'} · testovací verze</small></div></div>
    <button class="pill" id="syncpill" data-act="sync-panel" aria-label="Stav synchronizace"></button>
    ${right}
  </div></header>`;
}

let renderPending=false;
function softRender(){
  const a=document.activeElement;
  if(a&&a.closest&&a.closest('#app [data-keep]')&&a.matches&&a.matches('input,textarea,select')){renderPending=true;renderPill();return}
  render();
}
function render(){
  const app=$('#app');
  if(!S)return;
  renderPending=false;
  let body='';
  const users=Object.values(S.users).filter(x=>x.active!==false);
  const pu=personal();
  if(pu){if(!UI.office)setOffice(true);if(!SESSION||SESSION.userId!==pu.userId){SESSION={userId:pu.userId,at:Date.now()};store.set('etl.session',SESSION)}}
  if(db&&net.state==='auth'&&(!Object.keys(S.users).length||store.get('etl.needLogin',false))){
    body=renderDeviceLogin();
  }else if(!Object.keys(S.users).length){
    body=db&&!net.loaded?(net.state==='error'||net.state==='nosignal'||navigator.onLine===false?`<div class="wrap"><div class="center"><div class="empty"><h2>První spuštění potřebuje internet</h2><p>Zařízení si musí jednou stáhnout data ze serveru. Připojte se k síti.</p>${net.err?`<p class="muted">${esc(net.err)}</p>`:''}<button class="btn" data-act="sync-now">Zkusit znovu</button></div></div></div>`:`<div class="loading">Načítám data ze serveru…</div>`):renderSetup();
  }else if(!pu&&acctEmail()&&Object.values(S.users).some(x=>x.email===acctEmail()&&x.active===false)){
    body=`<div class="wrap"><div class="center"><div class="empty"><h2>Účet je deaktivovaný</h2><p>Přístup pro ${esc(acctEmail())} správce vypnul.</p><button class="btn" data-act="dev-logout">Odhlásit</button></div></div></div>`;
  }else if(mode()==='crew'){
    body=renderCrew();
  }else if(!me()||me().active===false){
    if(SESSION){SESSION=null;store.set('etl.session',null)}
    body=renderLogin(users);
  }else body=renderApp();
  // a sync can re-render while someone is half-way through a form: keep what they typed
  const kept={};app.querySelectorAll('[data-keep] input[id],[data-keep] textarea[id]').forEach(el=>{if(el.type!=='checkbox'&&el.type!=='radio'&&el.type!=='file'&&el.value)kept[el.id]=el.value});
  app.innerHTML=header()+(Object.keys(S.users).length?offlineNote():'')+body+`<p class="footnote wrap">Testovací verze. Neslouží jako úřední záznam – papírový technický deník platí dál. Zařízení <span class="mono">${esc(DEV)}</span> · časy v UTC.</p>`;
  for(const k in kept){const el=document.getElementById(k);if(el&&!el.value&&el.closest('[data-keep]'))el.value=kept[k]}
  renderPill();
  if(mode()==='crew')crewLive();
}

function renderSetup(){
  return `<div class="wrap"><div class="center">
    <div><p class="label">První spuštění</p><h1>Založte účet správce</h1><p class="muted" style="margin-top:6px">Databáze je prázdná. Správce pak v úvodním nastavení zadá provozovatele, letadla s počátečním stavem z papírového deníku a uživatele. Posádky začnou zapisovat, až správce letadlo uvede do elektronického deníku.</p></div>
    <form id="setup-form" class="panel" data-keep novalidate>
      <div class="fgrid wide">
        <label class="fld"><span>Jméno</span><input type="text" id="su-name" autocomplete="off"></label>
        <label class="fld"><span>PIN (4–6 číslic)</span><input type="password" id="su-pin" inputmode="numeric" autocomplete="off"></label>
      </div>
      <p class="form-err" id="su-err" hidden></p>
      <div><button class="btn primary" type="submit">Založit účet</button></div>
    </form></div></div>`;
}

function renderLogin(users){
  const sel=UI.loginUser&&S.users[UI.loginUser];
  return `<div class="wrap"><div class="center">
    <div class="chips"><button class="btn" data-act="office-off">‹ Zpět na výběr letadla</button></div>
    <div><p class="label">Přihlášení na zařízení</p><h1>Kdo zapisuje?</h1><p class="muted" style="margin-top:6px">Každý zápis se podepisuje vaším PINem. Data se ukládají v zařízení a odesílají, jakmile je síť.</p></div>
    <div class="user-grid">${users.sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<button class="user-btn ${UI.loginUser===x.userId?'sel':''}" data-act="pick-user" data-id="${esc(x.userId)}"><b>${esc(x.name)}</b><span>${x.roles.map(r=>ROLE[r]).join(' · ')}${x.licence?' · '+esc(x.licence):''}</span></button>`).join('')}</div>
    ${sel?`<form id="login-form" class="panel" data-keep novalidate>
      <label class="fld"><span>PIN – ${esc(sel.name)}</span><input type="password" id="lg-pin" inputmode="numeric" autocomplete="off" autofocus></label>
      <p class="form-err" id="lg-err" hidden></p>
      <div><button class="btn primary" type="submit">Přihlásit</button></div></form>`:''}
    ${testPins()}
  </div></div>`;
}
const TEST_PINS={};
function testPins(){const r=Object.keys(TEST_PINS).filter(id=>S.users[id]&&S.users[id].active!==false);if(!r.length)return '';
  return `<div class="panel" style="gap:8px"><p class="label">Testovací PINy</p><div class="pick">${r.map(id=>`<div class="user-btn" style="cursor:default"><b>${esc(S.users[id].name)}</b><span>PIN <b class="mono" style="font-size:1.05rem;color:var(--ink)">${TEST_PINS[id]}</b></span></div>`).join('')}</div></div>`}
function bindControl(){return `<div class="inline"><select id="bind-sel" aria-label="Letadlo">${S.liveList.map(a=>`<option value="${esc(a.acId)}" ${a.acId===UI.acId?'selected':''}>${esc(a.reg)}</option>`).join('')}</select><button class="btn" data-act="bind">Režim posádky</button></div>`}

function renderApp(){
  const u=me();const ac=S.ac[UI.acId];
  if(!ac){
    if(can.admin(u))return `<div class="wrap view">${UI.tab==='admin'?`<div class="chips"><button class="btn" data-act="tab" data-id="setup">‹ Úvodní nastavení</button></div>${viewAdmin(u)}`:viewSetup(u)}</div>`;
    return `<div class="wrap view"><div class="empty"><h2>Zatím žádné letadlo</h2><p>Deník se teprve nastavuje. Požádejte správce nebo CAMO o dokončení úvodního nastavení.</p></div></div>`;
  }
  const fleet=`<div class="wrap"><div class="fleet">${S.acList.map(a=>`
    <button class="ac-card ${a.acId===UI.acId?'sel':''}" data-act="pick-ac" data-id="${esc(a.acId)}" aria-pressed="${a.acId===UI.acId}">
      <div class="row"><span class="ac-reg">${esc(a.reg)}</span><span class="ann ${a.status}">${STATUS_LABEL[a.status]}</span></div>
      <div class="ac-meta"><span>${esc(a.type||'–')}</span><span>TTAF <b>${hm(a.air)}</b></span><span>Cykly <b>${a.cyc}</b></span></div>
      <div class="ac-meta"><span>Poslední přistání <b>${a.lastLeg?esc(a.lastLeg.to):'–'}</b></span>${a.deferred.length?`<span>Odklady <b>${a.deferred.length}</b></span>`:''}</div>
      ${a.pendingSec?`<div class="ac-meta"><span class="ann info">Security ${esc(a.pendingSec.from)} ${esc(a.pendingSec.time)}Z</span><span>${esc(a.pendingSec.name)}</span><span style="color:${S.out.has(a.pendingSec.ev)?'var(--caution)':'var(--ok)'}">${S.out.has(a.pendingSec.ev)?'čeká na síť':a.pendingSec.result==='FOUND'?'NÁLEZ':'připraveno k odletu'}</span></div>`:''}
      ${a.openLeg?`<div class="ac-meta"><span class="ann info">Let zahájen</span><span><b>${esc(a.openLeg.from)}→${esc(a.openLeg.to)}</b></span>${a.openLeg.sec?`<span>SEC <b>${esc(a.openLeg.sec.time)}Z</b></span>`:''}<span style="color:${S.out.has(a.openLeg.ev)?'var(--caution)':'var(--ok)'}">${S.out.has(a.openLeg.ev)?'čeká na síť':'odesláno'}</span></div>`:''}
    </button>`).join('')}</div>${statusNote(ac)}</div>`;

  const acts=[];
  if(!ac.isLive){acts.push(can.admin(u)?`<button class="btn primary" data-act="tab" data-id="setup">Dokončit úvodní nastavení ${esc(ac.reg)}</button>`:`<span class="muted">${esc(ac.reg)} zatím není uvedeno do elektronického deníku.</span>`)}
  else{
  if(can.leg(u)){
    if(ac.openLeg)acts.push(`<button class="btn primary" data-act="close-flight">${ICON.check}Uzavřít let ${esc(ac.openLeg.from)} → ${esc(ac.openLeg.to)}</button>`);
    else{acts.push(`<button class="btn primary" data-act="start-flight">${ICON.plus}Začít let</button>`);if(has(u,'camo'))acts.push(`<button class="btn" data-act="leg-form">Zapsat let ručně (z papíru)</button>`)}
  }
  if(can.daily(u)&&has(u,'mech'))acts.push(`<button class="btn" data-act="daily-form">${ICON.clip}Prohlídka</button>`);
  acts.push(`<button class="btn" data-act="defect-form">${ICON.alert}Zapsat závadu</button>`);
  if(can.crs(u))acts.push(`<button class="btn" data-act="crs-form">${ICON.check}Uvolnit do provozu (CRS)</button>`);
  if(can.ground(u)&&!ac.grounded)acts.push(`<button class="btn danger" data-act="ground-form">${ICON.stop}Uzemnit</button>`);
  }

  const nOpen=ac.open.length,nDef=ac.deferred.length;
  const tabs=[['log','Technický deník'],['ofp','OFP'],['defects','Závady',nOpen+nDef,nOpen?'warn':nDef?'caution':''],['crs','Uvolnění'],['reports','Výkazy'],['search','Hledat'],['audit','Audit']];
  if(can.admin(u)){if(!setupState().done)tabs.unshift(['setup','Úvodní nastavení']);tabs.push(['admin','Správa'])}
  if(!ac.isLive&&['log','ofp','crs'].includes(UI.tab))UI.tab=can.admin(u)?'setup':'defects';
  if(!tabs.some(t=>t[0]===UI.tab))UI.tab='log';
  const tabHtml=`<div class="wrap"><div class="actions">${acts.join('')}</div><nav class="tabs" role="tablist">${tabs.map(t=>`<button class="tab ${UI.tab===t[0]?'on':''}" role="tab" aria-selected="${UI.tab===t[0]}" data-act="tab" data-id="${t[0]}">${t[1]}${t[2]?`<span class="cnt ${t[3]||''}">${t[2]}</span>`:''}</button>`).join('')}</nav></div>`;
  let view='';
  switch(UI.tab){
    case 'log':view=viewLog(ac,u);break;
    case 'defects':view=viewDefects(ac,u);break;
    case 'crs':view=viewCrs(ac,u);break;
    case 'reports':view=viewReports(ac);break;
    case 'search':view=viewSearch(ac);break;
    case 'ofp':{const o=UI.ofpId&&ofpOf(UI.ofpId);view=o&&o.acId===ac.acId?`<div class="chips"><button class="btn" data-act="ofp-back">‹ Seznam OFP</button></div>${viewOfp(o,u)}`:viewOfpList(ac);break}
    case 'audit':view=viewAudit(ac);break;
    case 'admin':view=viewAdmin(u);break;
    case 'setup':view=viewSetup(u);break;
  }
  return fleet+tabHtml+`<div class="wrap view">${view}</div>`;
}

function statusNote(ac){
  if(ac.status==='ok')return '';
  const r=[];
  if(ac.grounded)r.push(`Uzemněno ${fmtTs(ac.grounded.at)} – ${esc(ac.grounded.name)}: ${esc(ac.grounded.reason)}`);
  ac.open.forEach(d=>r.push(`Otevřená závada ${esc(d.no)}: ${esc(d.text)}`));
  ac.overdue.forEach(d=>r.push(`Prošlý odklad ${esc(d.no)} (MEL ${esc(d.deferral.melItem)}, do ${fmtDate(d.deferral.due)})`));
  if(ac.status==='caution')ac.deferred.forEach(d=>r.push(`Odklad ${esc(d.no)} – MEL ${esc(d.deferral.melItem)} kat. ${d.deferral.cat}, platí do ${fmtDate(d.deferral.due)}`));
  return `<div class="status-note ${ac.status}"><b>${esc(ac.reg)}: ${STATUS_LABEL[ac.status]}</b><ul>${r.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
}

/* --- log view --- */
function viewLog(ac,u){
  if(!ac.pages.length)return `<div class="empty"><h2>Deník je prázdný</h2><p>První stránka dostane číslo <span class="mono">${S.cfg.pageFmt==='date'?esc(String(ac.reg).split('-').pop())+'-'+todayISO().slice(2).replace(/-/g,''):esc(ac.startPage)}</span>. Počáteční stav: TTAF ${hm(ac.openAir)}, ${ac.openCyc} cyklů.</p>${can.leg(u)?`<button class="btn primary" data-act="start-flight">${ICON.plus}Začít let</button>`:''}</div>`;
  let pg=ac.pages.find(p=>p.key===UI.page);if(!pg)pg=ac.pages[ac.pages.length-1];
  const i=ac.pages.indexOf(pg);
  const opts=[...ac.pages].reverse().map(p=>`<option value="${esc(p.key)}" ${p===pg?'selected':''}>${p.no} · ${fmtDate(p.date)} · ${p.legs.length} let${p.legs.length>1?(p.legs.length>4?'ů':'y'):''}${p.pending?' · neodesláno':''}</option>`).join('');
  const pager=`<div class="pager"><button class="btn sm" data-act="page" data-id="${i>0?esc(ac.pages[i-1].key):''}" ${i>0?'':'disabled'} aria-label="Předchozí stránka">‹ Předchozí</button><select id="page-sel" aria-label="Vybrat stránku">${opts}</select><button class="btn sm" data-act="page" data-id="${i<ac.pages.length-1?esc(ac.pages[i+1].key):''}" ${i<ac.pages.length-1?'':'disabled'} aria-label="Další stránka">Další ›</button></div>`;
  const rows=pg.legs.map(l=>{
    const flags=[];
    if(S.out.has(l.ev))flags.push('<span class="ann caution">neodesláno</span>');
    else if(l.state==='open')flags.push('<span class="ann ok">na serveru</span>');
    if(l.history.length)flags.push(`<span class="ann info">opraveno ×${l.history.length}</span>`);
    if(l.paper)flags.push('<span class="ann mute">z papíru '+esc(l.paper.page||'')+'</span>');
    if(l.dup&&!l.void)flags.push('<span class="ann warn">možná duplicita</span>');
    if(l.void)flags.push('<span class="ann mute">zneplatněno</span>');
    for(const d of ac.defects.filter(x=>x.legId===l.legId))flags.push(`<span class="ann ${d.status==='open'?'warn':d.status==='deferred'?'caution':'ok'}">${esc(d.no)} ${d.status==='open'?'otevřená':d.status==='deferred'?'odložená':'odstraněná'}</span>`);
    const pic=S.users[l.pic],sic=S.users[l.sic];
    const gap=l.gap?`<tr class="gaprow"><td colspan="16">Přerušený řetězec: předchozí let přistál v <b class="mono">${esc(l.gap)}</b>, tento odlétá z <b class="mono">${esc(l.from)}</b>. Chybí zápis, nebo jde o přelet mimo deník?</td></tr>`:'';
    const op=l.state==='open'&&!l.void;
    return gap+`<tr class="${l.void?'void':''} ${S.out.has(l.ev)?'pending':''} ${op?'openrow':''}">
      <td class="mono">${l.idx}</td><td class="mono">${esc(l.from)}</td><td class="mono">${esc(l.to)}</td>
      <td class="mono">${dash(l.out)}</td><td class="mono">${dash(l.off)}</td><td class="mono">${dash(l.on)}</td><td class="mono">${dash(l.in)}</td>
      <td class="mono">${l.state==='open'?'–':hm(l.air)}</td><td class="mono">${l.state==='open'?'–':hm(l.block)}</td><td class="mono">${l.state==='open'?'–':esc(l.ldg)}</td><td class="mono" style="white-space:nowrap">${l.state==='open'?'–':dash(l.app)}</td><td class="mono" style="font-size:.84rem;white-space:nowrap">${l.fuelBlk!=null&&l.fuelBlk!==''?`+${fmtN(l.fuelUp)} L<br>odl. ${fmtN(l.fuelBlk)}${l.fuelMin?` <span class="muted">(min ${fmtN(l.fuelMin)})</span>`:''}${l.fuelRem!=null&&l.fuelRem!==''?`<br>přist. ${fmtN(l.fuelRem)} · sp. ${fmtN(l.fuelBurn)}`:''}`:'–'}</td>
      <td>${esc(KIND[l.kind]||l.kind||'')}${l.fno?`<br><span class="mono muted">${esc(l.fno)}</span>`:''}</td>
      <td class="sig">${esc(pic?pic.name:'–')}${l.pf&&l.pf===l.pic?' <span class="ann info" style="font-size:.62rem;padding:0 4px">PF</span>':''}<small>SIC ${esc(sic?sic.name:'–')}${l.pf&&l.sic&&l.pf===l.sic?' · PF':''}</small></td>
      <td class="sig">${l.state==='open'?'<span class="ann info">Probíhá</span>':`${esc(l.signed.name)}<small>${fmtTs(l.signed.at)}</small>`}${l.sec?`<small>SEC ${esc(l.sec.time)}Z · ${esc(l.sec.byName||'')}</small>`:''}${flags.length?`<div class="flags">${flags.join('')}</div>`:''}</td>
      <td class="keep"><div style="display:grid;gap:6px;justify-items:stretch">${op?`<button class="btn sm primary" data-act="complete-leg" data-id="${esc(l.legId)}">Uzavřít let</button>`:''}<button class="btn sm" data-act="leg-detail" data-id="${esc(l.legId)}">Detail</button>${crsOf(l).map(c=>`<span class="ann ok" title="${esc(c.name)} ${fmtTs(c.at)}">CRS ✓</span>`).join('')}${!op&&!l.void&&can.crs(u)?`<button class="btn sm" data-act="crs-leg" data-id="${esc(l.legId)}">CRS</button>`:''}</div></td></tr>`;
  }).join('');
  const dailies=S.daily[ac.acId+'|'+pg.date]||[];
  const pageDefs=ac.defects.filter(d=>d.legId&&pg.legs.some(l=>l.legId===d.legId));
  return `${unfinishedBlock(ac,true)}<div class="panel-head">${pager}<span class="muted">Stránka = letadlo + den, max. ${PER_PAGE} letů</span></div>
  <article class="atl-page">
    <header class="atl-head">
      <div class="kv"><span class="label">Registrace</span><b>${esc(ac.reg)}</b></div>
      <div class="kv"><span class="label">Typ</span><b>${esc(ac.type||'–')}</b></div>
      <div class="kv"><span class="label">Výr. číslo</span><b>${esc(ac.msn||'–')}</b></div>
      <div class="kv"><span class="label">Datum (UTC)</span><b>${fmtDate(pg.date)}</b></div>
      <div class="pg"><span class="label">Stránka</span><b>${pg.no}</b>${pg.pending?'<span class="ann caution">čeká na sync</span>':''}</div>
    </header>
    <div class="scroll-x"><table class="atl">
      <thead><tr><th>#</th><th>Odkud</th><th>Kam</th><th>Off-blk</th><th>Vzlet</th><th>Přist.</th><th>On-blk</th><th>Let</th><th>Blok</th><th>Ldg</th><th>APP</th><th>Palivo</th><th>Druh</th><th>PIC / SIC</th><th>Podpis</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="totals">
      <div class="h"></div><div class="h">Drak – let</div><div class="h">Blok</div><div class="h">Cykly</div>
      <div class="label" style="align-self:center">Převod z předchozí strany</div><div class="v">${hm(pg.bfAir)}</div><div class="v">–</div><div class="v">${pg.bfCyc}</div>
      <div class="label" style="align-self:center">Tato stránka</div><div class="v">${hm(pg.air)}</div><div class="v">${hm(pg.block)}</div><div class="v">${pg.ldg}</div>
      <div class="label" style="align-self:center">Celkem k přenosu</div><div class="v strong">${hm(pg.cfAir)}</div><div class="v">–</div><div class="v strong">${pg.cfCyc}</div>
    </div>
    <section class="sheet-sec"><span class="label">Prohlídky ${fmtDate(pg.date)}</span>
      ${dailies.length?`<div class="list">${dailies.map(d=>`<div class="line-item"><span class="ann ok">${esc(DAILY[d.kind]||d.kind)}</span><span>${esc(d.name)}</span><span class="mono muted">${fmtTs(d.at)}</span>${d.tyres?`<span class="muted">Pneu N/L/P ${esc(d.tyres)} psi</span>`:''}${d.oil?`<span class="muted">Olej ${esc(d.oil)}</span>`:''}${d.brakes?'<span class="muted">Brzdy OK</span>':''}${d.notes?`<span>${esc(d.notes)}</span>`:''}</div>`).join('')}</div>`:`<p class="muted">Na tento den není podepsaná žádná prohlídka.</p>`}
    </section>
    ${(()=>{const cr=pg.legs.flatMap(l=>crsOf(l).map(c=>({c,l})));return `<section class="sheet-sec"><span class="label">Uvolnění do provozu na této stránce</span>${cr.length?`<div class="list">${cr.map(({c,l})=>`<div class="line-item"><span class="ann ok">CRS</span><span>po letu ${l.idx} ${esc(l.from)} → ${esc(l.to)}</span><span>${esc(crsTitle(c))}${c.wo?' · WO '+esc(c.wo):''}</span><span class="muted">${esc(c.name)} · ${esc(c.licence||'')} · ${fmtTs(c.at)}</span></div>`).join('')}</div>`:'<p class="muted">Na této stránce zatím žádné CRS.</p>'}</section>`})()}
    <section class="sheet-sec"><span class="label">Závady a jejich odstranění</span>
      ${pageDefs.length?`<div class="scroll-x"><table class="plain defrect"><thead><tr><th>Let</th><th>Závada</th><th>Odstranění závady / odklad</th></tr></thead><tbody>${pageDefs.map(d=>defRectRow(d,pg)).join('')}</tbody></table></div>`:`<p class="muted">NIL – žádné závady.</p>`}
    </section>
  </article>`;
}

function defRectRow(d,pg){
  const l=pg.legs.find(x=>x.legId===d.legId);const st=d.status;
  const df=d.deferral,r=d.rect;
  const defTxt=df?`<div class="${r?'muted':''}"><b>Odloženo dle MEL ${esc(df.melItem||'')} kat. ${esc(df.cat||'')}</b> – platí do ${fmtDate(df.due)}${df.procO||df.procM?` · ${df.procO?'(O)':''}${df.procM?' (M)':''} provedeno`:''}${df.rem?`<br>${esc(df.rem)}`:''}<br><small>${esc(df.name)} · ${fmtTs(df.at)}</small></div>`:'';
  const rectTxt=r?`<div><b>${esc(r.action)}</b><br><span class="mono">ATA ${esc(r.ata||'–')} · WO ${esc(r.wo||'–')}</span><br><small>CRS ${esc(r.name)} (${esc(r.licence||'–')}) · ${fmtTs(r.at)} · TTAF ${hm(r.acAir)} / ${esc(r.acCyc)} cyklů</small></div>`:'';
  const right=defTxt+rectTxt||`<span class="ann warn">Otevřená</span> <span class="muted">čeká na odstranění nebo odklad</span>`;
  return `<tr class="${st}"><td class="mono" style="white-space:nowrap">${l?`${l.idx} · ${esc(l.from)}–${esc(l.to)}`:''}<br><span class="muted">${esc(d.no)}</span></td>
    <td>${esc(d.text)}<br><small class="muted">${d.ata?'ATA '+esc(d.ata)+' · ':''}${esc(d.reported.name)} · ${fmtTs(d.reported.at)}</small></td>
    <td><span class="ann ${st==='open'?'warn':st==='deferred'?'caution':'ok'}" style="margin-bottom:4px">${st==='open'?'Otevřená':st==='deferred'?'Odložená':'Odstraněná'}</span>${st==='open'?'<br><span class="muted">čeká na odstranění nebo odklad</span>':'<br>'+right}</td></tr>`;
}

/* --- defects view --- */
function defectCard(d,u,ac){
  const st=d.status;const lbl={open:'Otevřená',deferred:'Odložená',closed:'Uzavřená'}[st];
  let extra='';
  if(d.deferral){const left=d.deferral.due?daysBetween(todayISO(),d.deferral.due):null;
    extra+=`<div class="box"><b>MEL ${esc(d.deferral.melItem)} · kategorie ${esc(d.deferral.cat)}</b><span>Platí do ${fmtDate(d.deferral.due)}${left!=null?(left<0?` – <b style="color:var(--warn)">prošlé o ${-left} d</b>`:` – zbývá ${left} d`):''}</span><span class="muted">${[d.deferral.procO?'(O) provedeno':'',d.deferral.procM?'(M) provedeno':'',d.deferral.placard?'štítek INOP umístěn':''].filter(Boolean).join(' · ')}${d.deferral.rem?' · '+esc(d.deferral.rem):''}</span><span class="muted">Odložil ${esc(d.deferral.name)}, ${fmtTs(d.deferral.at)}</span></div>`}
  if(d.rect)extra+=`<div class="box"><b>Odstranění · ATA ${esc(d.rect.ata||'–')} · WO ${esc(d.rect.wo||'–')}</b><span>${esc(d.rect.action)}</span>${d.rect.parts?`<span class="muted">Díly: ${esc(d.rect.parts)}</span>`:''}<span class="muted">CRS: ${esc(d.rect.name)} (${esc(d.rect.licence||'–')}) · ${fmtTs(d.rect.at)} · TTAF ${hm(d.rect.acAir)} / ${esc(d.rect.acCyc)} cyklů</span></div>`;
  const btns=[];
  if(st==='open'&&can.defer(u))btns.push(`<button class="btn sm" data-act="defer-form" data-id="${esc(d.defId)}">Odložit dle MEL</button>`);
  if(st!=='closed'&&can.rectify(u))btns.push(`<button class="btn sm primary" data-act="rectify-form" data-id="${esc(d.defId)}">Odstranit a uvolnit (CRS)</button>`);
  btns.push(`<button class="btn sm ghost" data-act="defect-detail" data-id="${esc(d.defId)}">Historie</button>`);
  return `<div class="defect ${st}"><div class="stripe"></div><div class="body">
    <div class="top-row"><span class="mono">${esc(d.no)}</span><span class="ann ${st==='open'?'warn':st==='deferred'?'caution':'ok'}">${lbl}</span>${d.pageRef?`<span class="muted mono">str. ${esc(d.pageRef)}</span>`:d.src==='paper'?`<span class="ann mute">z papíru${d.paperPage?' str. '+esc(d.paperPage):''}</span>`:`<span class="muted">mimo let</span>`}${S.out.has(d.reported.ev)?'<span class="ann caution">neodesláno</span>':''}</div>
    <p class="txt">${esc(d.text)}</p>
    <p class="meta">Zapsal ${esc(d.reported.name)} · ${fmtTs(d.reported.at)}${d.ata?` · ATA ${esc(d.ata)}`:''}</p>
    ${extra}<div class="btns">${btns.join('')}</div></div></div>`;
}
function viewDefects(ac,u){
  const f=UI.defFilter;const all=[...ac.defects].reverse();
  const list=all.filter(d=>f==='all'||(f==='active'?d.status!=='closed':d.status===f));
  const chips=[['active','Aktivní'],['open','Otevřené'],['deferred','Odložené'],['closed','Uzavřené'],['all','Vše']];
  return `<div class="panel-head"><div class="chips">${chips.map(c=>`<button class="chip ${f===c[0]?'on':''}" data-act="def-filter" data-id="${c[0]}">${c[1]}</button>`).join('')}</div><button class="btn" data-act="defect-form">${ICON.alert}Zapsat závadu</button></div>
  ${list.length?`<div class="grid-list">${list.map(d=>defectCard(d,u,ac)).join('')}</div>`:`<div class="empty"><p>Žádné závady v tomto filtru.</p></div>`}`;
}

/* --- CRS view --- */
function viewCrs(ac,u){
  const items=[];
  S.crs.filter(c=>c.acId===ac.acId).forEach(c=>items.push({at:c.at,kind:'crs',c}));
  S.grounds.filter(g=>g.acId===ac.acId).forEach(g=>items.push({at:g.at,kind:'ground',c:g}));
  ac.defects.filter(d=>d.rect).forEach(d=>items.push({at:d.rect.at,kind:'rect',c:d}));
  items.sort((a,b)=>a.at<b.at?1:-1);
  const row=it=>{
    if(it.kind==='crs')return `<div class="defect closed"><div class="stripe"></div><div class="body"><div class="top-row"><span class="ann ok">CRS</span><span class="mono">WO ${esc(it.c.wo||'–')}</span><span class="muted mono">${fmtTs(it.at)}</span></div><p class="txt">${esc(crsTitle(it.c))}</p>${it.c.wo?'<p class="meta">Rozsah a dílčí podpisy viz workpack '+esc(it.c.wo)+'</p>':''}<p class="meta">${esc(it.c.name)} · ${esc(it.c.licence||'–')} · ${esc(it.c.org||'')} · TTAF ${hm(it.c.acAir)} / ${esc(it.c.acCyc)} cyklů</p></div></div>`;
    if(it.kind==='ground')return `<div class="defect open"><div class="stripe"></div><div class="body"><div class="top-row"><span class="ann warn">Uzemněno</span><span class="muted mono">${fmtTs(it.at)}</span></div><p class="txt">${esc(it.c.reason)}</p><p class="meta">${esc(it.c.name)}${it.c.wo?' · WO '+esc(it.c.wo):''}</p></div></div>`;
    return `<div class="defect closed"><div class="stripe"></div><div class="body"><div class="top-row"><span class="ann ok">CRS k závadě</span><span class="mono">${esc(it.c.no)}</span><span class="muted mono">${fmtTs(it.at)}</span></div><p class="txt">${esc(it.c.text)}</p><p class="meta">${esc(it.c.rect.action)} · ${esc(it.c.rect.name)} (${esc(it.c.rect.licence||'–')})</p></div></div>`;
  };
  return `<div class="panel"><div class="panel-head"><div><p class="label">Aktuální stav</p><h2>${esc(ac.reg)} · <span class="ann ${ac.status}">${STATUS_LABEL[ac.status]}</span></h2></div>${can.crs(u)?`<button class="btn primary" data-act="crs-form">${ICON.check}Vydat CRS</button>`:''}</div>
  <p class="muted">${ac.lastCrs?`Poslední samostatné CRS ${fmtTs(ac.lastCrs.at)} – ${esc(ac.lastCrs.name)}, WO ${esc(ac.lastCrs.wo||'–')}.`:'Zatím žádné samostatné CRS.'} Otevřené závady se uzavírají přes „Odstranit a uvolnit“ v záložce Závady, uzemnění ruší vydání CRS.</p></div>
  ${items.length?`<div class="grid-list">${items.map(row).join('')}</div>`:`<div class="empty"><p>Zatím žádná uvolnění ani uzemnění.</p></div>`}`;
}

/* --- reports --- */
function monthly(ac){
  const m={};
  for(const l of ac.legs){if(l.void||l.state==='open')continue;const k=l.date.slice(0,7);const r=m[k]=m[k]||{k,legs:0,air:0,block:0,ldg:0,ttaf:0,tcyc:0};r.legs++;r.air+=l.air;r.block+=l.block;r.ldg+=(+l.ldg||0);r.ttaf=l.ttaf;r.tcyc=l.tcyc}
  return Object.values(m).sort((a,b)=>a.k<b.k?1:-1);
}
function viewReports(ac){
  const rows=monthly(ac);
  return `<div class="panel"><div class="panel-head"><div><p class="label">Měsíční výkaz hodin a cyklů</p><h2>${esc(ac.reg)}</h2></div><div class="chips"><button class="btn sm" data-act="export-month">Export CSV výkazu</button><button class="btn sm" data-act="export-legs">Export CSV letů</button></div></div>
  ${rows.length?`<div class="scroll-x"><table class="plain"><thead><tr><th>Měsíc</th><th class="r">Lety</th><th class="r">Let (drak)</th><th class="r">Blok</th><th class="r">Přistání</th><th class="r">TTAF na konci</th><th class="r">Cykly na konci</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="mono">${r.k.slice(5)}/${r.k.slice(0,4)}</td><td class="r mono">${r.legs}</td><td class="r mono">${hm(r.air)}</td><td class="r mono">${hm(r.block)}</td><td class="r mono">${r.ldg}</td><td class="r mono">${hm(r.ttaf)}</td><td class="r mono">${r.tcyc}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Zatím žádné lety.</p>'}
  <p class="muted">Tohle je podklad, který dnes CAMO ručně přepisuje z papírových stránek. Zneplatněné lety se nepočítají.</p></div>${viewOil(ac)}`;
}


/* --- oil consumption per engine --- */
function parseOil(x){const n=String(x||'').replace(/,/g,'.').match(/\d+(?:\.\d+)?/g);if(!n||n.length<2)return null;const l=+n[0],r=+n[1];return (l||r)?{l,r}:null}
function oilData(ac){
  const m={};const add=(date,o,src)=>{if(!o)return;const k=date.slice(0,7);const r=m[k]=m[k]||{k,l:0,r:0,air:0,n:0};r.l+=o.l;r.r+=o.r;r.n++};
  for(const l of ac.legs){if(l.void||l.state==='open')continue;const k=l.date.slice(0,7);const r=m[k]=m[k]||{k,l:0,r:0,air:0,n:0};r.air+=l.air;add(l.date,parseOil(l.oil))}
  for(const key in S.daily){if(!key.startsWith(ac.acId+'|'))continue;for(const d of S.daily[key])add(d.date,parseOil(d.oil))}
  return Object.values(m).sort((a,b)=>a.k<b.k?-1:1).map(r=>Object.assign(r,{fh:r.air/60,ql:r.air?r.l/(r.air/60):null,qr:r.air?r.r/(r.air/60):null}));
}
function niceMax(v){const steps=[0.02,0.05,0.1,0.2,0.25,0.5,1,2,5,10];return steps.find(s=>s>=v)||Math.ceil(v)}
function oilChart(rows){
  const W=680,H=230,pl=44,pr=8,pt=14,pb=30,iw=W-pl-pr,ih=H-pt-pb;
  const mx=niceMax(Math.max(0.01,...rows.flatMap(r=>[r.ql||0,r.qr||0])));
  const y=v=>pt+ih-(v/mx)*ih;const bw=iw/rows.length;const w=Math.max(6,Math.min(18,(bw-12)/2));
  const bar=(x,v,cls,lab)=>{if(v==null)return '';const h=Math.max(1,(v/mx)*ih),y0=pt+ih-h,rr=Math.min(4,w/2,h);
    return `<path class="bar" fill="var(${cls})" d="M${x},${pt+ih}V${y0+rr}Q${x},${y0} ${x+rr},${y0}H${x+w-rr}Q${x+w},${y0} ${x+w},${y0+rr}V${pt+ih}Z"><title>${lab}: ${v.toFixed(3)} qt/FH</title></path>`};
  const ticks=[0,mx/2,mx];
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spotřeba oleje v qt na letovou hodinu po měsících, levý a pravý motor">
    ${ticks.map(t=>`<line x1="${pl}" x2="${W-pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${pl-6}" y="${y(t)+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${t.toFixed(t<0.1&&t>0?3:2)}</text>`).join('')}
    ${rows.map((r,i)=>{const cx=pl+i*bw+bw/2;return bar(cx-w-1,r.ql,'--s1',`${r.k.slice(5)}/${r.k.slice(0,4)} levý`)+bar(cx+1,r.qr,'--s2',`${r.k.slice(5)}/${r.k.slice(0,4)} pravý`)+`<text x="${cx}" y="${H-10}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${r.k.slice(5)}/${r.k.slice(2,4)}</text>`}).join('')}
  </svg></div>`;
}
function viewOil(ac){
  const rows=oilData(ac);const withOil=rows.filter(r=>r.n);
  const head=`<div class="panel-head"><div><p class="label">Spotřeba oleje</p><h2>${esc(ac.reg)} · qt na letovou hodinu</h2></div></div>`;
  if(!withOil.length)return `<div class="panel">${head}<p class="muted">Zatím žádné doplnění oleje. Zapisuje se při uzavření letu („Olej doplněn L/P“) nebo při denní prohlídce, ve tvaru „0.5 / 0“.</p></div>`;
  const last=rows.slice(-12);const tl=withOil.reduce((a,r)=>a+r.l,0),tr=withOil.reduce((a,r)=>a+r.r,0),fh=rows.reduce((a,r)=>a+r.fh,0);
  return `<div class="panel">${head}
    <div class="legend"><span><i style="background:var(--s1)"></i>Levý motor · celkem ${fh?(tl/fh).toFixed(3):'–'} qt/FH</span><span><i style="background:var(--s2)"></i>Pravý motor · celkem ${fh?(tr/fh).toFixed(3):'–'} qt/FH</span></div>
    ${oilChart(last)}
    <div class="scroll-x"><table class="plain"><thead><tr><th>Měsíc</th><th class="r">Let (FH)</th><th class="r">Olej L (qt)</th><th class="r">Olej P (qt)</th><th class="r">L qt/FH</th><th class="r">P qt/FH</th></tr></thead><tbody>${[...rows].reverse().map(r=>`<tr><td class="mono">${r.k.slice(5)}/${r.k.slice(0,4)}</td><td class="r mono">${r.fh.toFixed(1)}</td><td class="r mono">${r.l||'–'}</td><td class="r mono">${r.r||'–'}</td><td class="r mono">${r.ql!=null&&r.n?r.ql.toFixed(3):'–'}</td><td class="r mono">${r.qr!=null&&r.n?r.qr.toFixed(3):'–'}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">Rostoucí spotřeba na jednom motoru bývá časný signál problému. Limity spotřeby jsou v EMM motoru.</p></div>`;
}

/* --- search across the log --- */
const fold=x=>String(x==null?'':x).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function hl(txt,q){const t=String(txt==null?'':txt);const i=fold(t).indexOf(q);if(!q||i<0)return esc(t);return esc(t.slice(0,i))+'<mark>'+esc(t.slice(i,i+q.length))+'</mark>'+esc(t.slice(i+q.length))}
function searchResults(ac){
  const q=fold(String(UI.q||'').trim());
  if(q.length<2)return '<p class="muted">Napište aspoň 2 znaky – letiště, text závady, číslo WO, datum (06/11), číslo stránky nebo jméno.</p>';
  const acs=UI.qAll?Object.values(S.ac):[ac];const nm=id=>(S.users[id]||{}).name||'';
  const legs=[],defs=[],crs=[];
  for(const a of acs){
    for(const l of a.legs){const hay=[a.reg,l.from,l.to,fmtDate(l.date),l.page,l.fno,l.app,nm(l.pic),nm(l.sic),legBy(l).name,l.rem].map(fold).join(' | ');if(hay.includes(q))legs.push({a,l})}
    for(const d of a.defects){const hay=[a.reg,d.no,d.text,fmtDate(d.date),d.ata,d.deferral&&d.deferral.melItem,d.rect&&d.rect.action,d.rect&&d.rect.wo,d.reported.name].map(fold).join(' | ');if(hay.includes(q))defs.push({a,d})}
  }
  for(const c of S.crs){const a=S.ac[c.acId];if(!a||!acs.includes(a))continue;const hay=[a.reg,c.wo,c.scope,c.name,c.licence,fmtTs(c.at)].map(fold).join(' | ');if(hay.includes(q))crs.push({a,c})}
  const sec=(t,arr,f)=>arr.length?`<div style="display:grid;gap:6px"><p class="label">${t} (${arr.length})</p><div class="sres">${arr.slice(-50).reverse().map(f).join('')}</div></div>`:'';
  const out=sec('Lety',legs,({a,l})=>`<button type="button" data-act="leg-detail" data-id="${esc(l.legId)}"><span class="k">${hl(a.reg,q)}</span><span>${hl(l.from,q)} → ${hl(l.to,q)} · ${hl(fmtDate(l.date),q)} · str. ${hl(l.page,q)}${l.state==='open'?' · <b>neukončený</b>':''}${l.void?' · zneplatněno':''}</span><span class="d">${l.state==='open'?'':'Off '+esc(l.out)+' – On '+esc(l.in)+' · '}PIC ${hl(nm(l.pic),q)}${l.app?' · '+hl(l.app,q):''}</span></button>`)
    +sec('Závady',defs,({a,d})=>`<button type="button" data-act="defect-detail" data-id="${esc(d.defId)}"><span class="k">${hl(d.no,q)}</span><span>${hl(d.text,q)}</span><span class="d">${hl(fmtDate(d.date),q)} · ${d.status==='open'?'otevřená':d.status==='deferred'?'odložená MEL '+hl(d.deferral.melItem,q):'uzavřená'}${d.rect&&d.rect.wo?' · WO '+hl(d.rect.wo,q):''}</span></button>`)
    +sec('Uvolnění (CRS)',crs,({a,c})=>`<button type="button" ${c.legId?`data-act="leg-detail" data-id="${esc(c.legId)}"`:''}><span class="k">${hl(a.reg,q)}</span><span>${hl(crsTitle(c),q)}${c.wo?' · WO '+hl(c.wo,q):''}</span><span class="d">${hl(c.name,q)} · ${hl(fmtTs(c.at),q)}</span></button>`);
  return out||'<p class="muted">Nic nenalezeno.</p>';
}
function viewSearch(ac){
  return `<div class="panel" data-keep><div class="panel-head"><h2>Hledat v deníku</h2><label class="check"><input type="checkbox" id="q-all" ${UI.qAll?'checked':''}><span>Celá flotila</span></label></div>
    <input type="text" id="q" value="${esc(UI.q||'')}" placeholder="Letiště (LSGG), závada, WO, datum 06/11, stránka, jméno…" autocomplete="off" aria-label="Hledat">
    <div id="q-res" style="display:grid;gap:14px">${searchResults(ac)}</div></div>`;
}

/* ================= electronic OFP ================= */
const PDFJS_V='3.11.174';
let pdfLib=null;
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Čtečku PDF se nepodařilo načíst. Otevřete aplikaci jednou se signálem, aby se uložila do zařízení.'));document.head.appendChild(s)})}
function loadPdfJs(){
  if(!pdfLib)pdfLib=(async()=>{if(!window.pdfjsLib)await loadScript('vendor/pdf.min.js');
    const lib=window.pdfjsLib;if(!lib)throw new Error('Čtečka PDF se nenačetla.');lib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';return lib})().catch(e=>{pdfLib=null;throw e});
  return pdfLib;
}
// shared: turn pdf.js text items into fixed-width text lines
function itemsToLines(items){
  const rows=new Map();
  for(const it of items){if(!it.str)continue;const x=it.transform[4],y=Math.round(it.transform[5]*2)/2;const fs=Math.abs(it.transform[0])||9;
    let r=rows.get(y);if(!r){r=[];rows.set(y,r)}r.push({x,s:it.str,cw:fs*0.6})}
  const ys=[...rows.keys()].sort((a,b)=>b-a);
  return ys.map(y=>{const r=rows.get(y).sort((a,b)=>a.x-b.x);let line='';for(const it of r){const col=Math.max(0,Math.round((it.x-26)/it.cw));if(line.length<col)line+=' '.repeat(col-line.length);else if(line.length>col&&line.length&&line[line.length-1]!==' '&&it.s[0]!==' ')line+=' ';line+=it.s}return line});
}
// parse NAVsystem OFP text lines (array of pages, each an array of lines) into flight plans
function ofpParse(pages){
  const HDR=/^(\S+):\s*([A-Z]{4})-([A-Z]{4}),\s*STD\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}),\s*OFP ID:\s*([\w\/]+)/;
  const groups=new Map();
  for(const lines of pages){
    const h=lines.map(l=>l.trim().match(HDR)).find(Boolean);if(!h)continue;
    const id=h[8];if(!groups.has(id))groups.set(id,{id,hdr:h,lines:[]});groups.get(id).lines.push(...lines);
  }
  const num=x=>x==null||x===''?null:parseInt(x,10);
  const out=[];
  for(const g of groups.values()){
    const L=g.lines;const T=L.join('\n');const m=re=>{const r=T.match(re);return r};
    const segs=l=>l.split('│');
    const o={ofpId:g.id,flt:g.hdr[1],dep:g.hdr[2],des:g.hdr[3],std:g.hdr[7],date:'20'+g.hdr[4]+'-'+g.hdr[5]+'-'+g.hdr[6]};
    let r;
    if((r=m(/DOF:\s*(\d{2})\/(\d{2})\D?(\d{4})/)))o.date=r[3]+'-'+r[2]+'-'+r[1];
    if((r=m(/ACFT:\s*(\S+)\s+(\S+)/))){o.reg=r[1];o.type=r[2]}
    if((r=m(/DEP:\s*([A-Z]{4})\s+(.*?)\s+-?\d+\s*ft\s+STD\s+(\d{2}:\d{2})/))){o.dep=r[1];o.depName=r[2].trim();o.std=r[3]}
    if((r=m(/DES:\s*([A-Z]{4})\s+(.*?)\s+-?\d+\s*ft\s+STA\s+(\d{2}:\d{2})/))){o.des=r[1];o.desName=r[2].trim();o.sta=r[3]}
    if((r=m(/ALTN:\s*([A-Z]{4})\s+(.*?)\s+-?\d+\s*ft/))){o.altn=r[1];o.altnName=r[2].trim()}
    if((r=m(/ALTN2:\s*([A-Z]{4})\s+(.*?)\s+-?\d+\s*ft/))){o.altn2=r[1]}
    if((r=m(/DISTANCE:\s*(\d+)\s*NM/)))o.dist=num(r[1]);
    if((r=m(/MAX FL:\s*(\d+)/)))o.maxFl=num(r[1]);
    if((r=m(/WIND COMP:\s*(\d+)\s*KTS\s*(TAIL|HEAD)/)))o.wind=(r[2]==='HEAD'?'-':'+')+r[1]+' kt';
    if((r=m(/TYPE OF OPS:\s*([A-Z ]+?)\s*│/)))o.ops=r[1].trim();
    if((r=m(/WEIGHT UNITS:\s*(\w+)/)))o.units=r[1];
    if((r=m(/CMD_*([A-Z][A-Z .\-]*?)\s*│/)))o.cmd=r[1].trim();
    if((r=m(/F\/O_*([A-Z][A-Z .\-]*?)\s*│/)))o.fo=r[1].trim();
    if((r=m(/(\d+)\/\s*(\d+)\/\s*(\d+)\/\s*(\d+)\s*│/)))o.pax={m:num(r[1]),f:num(r[2]),c:num(r[3]),i:num(r[4])};
    if((r=m(/TOT PAX:\s*(\d+)/)))o.totPax=num(r[1]);
    if((r=m(/POB:\s*(\d+)/)))o.pob=num(r[1]);
    if((r=m(/CARGO:\s*(\d+)/)))o.cargo=num(r[1]);
    // ATC route (first line + indented continuation lines)
    const ri=L.findIndex(l=>/ATC ROUTE:/.test(l));
    if(ri>=0){let s=segs(L[ri])[1].replace(/^\s*ATC ROUTE:\s*/,'').trim();for(let i=ri+1;i<L.length;i++){const t=(segs(L[i])[1]||'').trim();if(!t||/^[├└]/.test(L[i].trim()))break;s+=' '+t}o.route=s.replace(/\s+/g,' ')}
    // fuel block
    const fuel={};const F=(k,re)=>{const x=m(re);if(x){fuel[k]={time:x[1]||null,fuel:num(x[2])}}};
    F('trip',/│TRIP\s+(\d{2}:\d{2})\s+(\d+)/);F('altn',/│ALTN\s+(\d{2}:\d{2})\s+(\d+)/);F('cont',/│CONT[^│\d]*\d*%?\s+(\d{2}:\d{2})\s+(\d+)/);
    F('final',/│FINAL RSRV\s+(\d{2}:\d{2})\s+(\d+)/);F('taxi',/│TAXI\s+(\d{2}:\d{2})\s+(\d+)/);F('add',/│\s*ADD\s+(\d{2}:\d{2})\s+(\d+)/);
    F('extra',/│EXTRA EST\s+(\d{2}:\d{2})\s+(\d+)/);F('discr',/│DISCR\.\s+(\d{2}:\d{2})\s+(\d+)/);
    if((r=m(/RAMP MREQ\s+(\d+)/)))fuel.rampMreq=num(r[1]);
    if((r=m(/RAMP EST\/ACT\s+(\d+)/)))fuel.rampEst=num(r[1]);
    if((r=m(/USED CALC\/ACT\s+(\d+)/)))fuel.usedCalc=num(r[1]);
    if((r=m(/│TRIP\s+\d{2}:\d{2}\s+\d+\s+\d+\s*\/\s*\d+\s+\d+\s+\S+\s+\d+\s+\S+\s+(\d+)/)))fuel.fmcRes=num(r[1]);
    o.fuel=fuel;
    // weights box
    const w={};for(const l of L)for(const sg of segs(l)){const x=sg.trim().match(/^(BOM|PLD|ZFM|FUEL|TOM|TRIP|ELM)\s+(?:(\d+)\s+)?(\d+)$/);if(x&&!w[x[1]])w[x[1]]={max:num(x[2]),est:num(x[3])}}
    o.weights=w;
    // waypoint log (trip and route to alternate)
    o.wpts=[];o.altWpts=[];let tgt=null,last=null;
    for(const l of L){
      const t=l.trim();
      if(/^TRIP:\s*$/.test(t)){tgt=o.wpts;continue}
      if(/ROUTE TO ALTERNATE/.test(t)){tgt=o.altWpts;continue}
      if(!tgt)continue;
      if(/Departure\s+Correction/.test(t)){tgt=null;continue}
      if(/RVSM:\s*ALT DIFF/.test(t)){tgt.push({rvsm:true});continue}
      const s=segs(l);if(s.length<10)continue;
      const tm=(s[6]||'').trim().match(/(\S+)\s+(\S+)\s+(\d+)\s+(\d{2}:\d{2})$/);
      const fu=(s[9]||'').trim();
      if(tm&&/^\d+$/.test(fu)){
        const tk=s[1].trim().split(/\s+/);const isFl=x=>/^(\d{2,3}|CLB|DSC)$/.test(x);
        let awy='',fl='',wpt='',freq='';
        if(tk.length>=3&&isFl(tk[1])){[awy,fl,wpt,freq]=[tk[0],tk[1],tk[2],tk[3]||'']}else if(isFl(tk[0])){[fl,wpt,freq]=[tk[0],tk[1]||'',tk[2]||'']}
        const d=(s[3]||'').trim().split(/\s+/);const wd=(s[4]||'').trim();
        last={awy,fl,wpt,freq,name:(s[2]||'').trim(),mora:num(d[0]),mt:num(d[1]),distInt:num(d[d.length-2]),distAcc:num(d[d.length-1]),wind:wd.replace(/\s+\S+$/,'').replace(/\s+/g,''),tas:tm[1],gs:tm[2],tInt:num(tm[3]),tAcc:tm[4],mreq:num(fu)};
        tgt.push(last);
      }else if(last&&/[NS]\d{4}\.\d/.test(s[2]||'')){last.pos=s[2].trim().replace(/\s+/g,' ');const fir=(s[1]||'').trim();if(fir)last.fir=fir}
    }
    // alternates list
    o.alternates=[];for(const l of L){const x=l.match(/│\s*\d\.\s+([A-Z]{4})\W?([A-Z]{4})\s+(\w+)\s+\d+\s+\d+\s+(\d+)\s+(\d+)\s+\d+\s+\S+\s+(\d{2}:\d{2})\s+(\d+)/);if(x)o.alternates.push({icao:x[2],rank:x[3],dist:num(x[4]),fl:num(x[5]),time:x[6],fuel:num(x[7])})}
    out.push(o);
  }
  return out;
}
async function readOfpPdf(file){
  const lib=await loadPdfJs();const data=new Uint8Array(await file.arrayBuffer());
  const doc=await lib.getDocument({data,isEvalSupported:false,disableFontFace:true,useSystemFonts:false}).promise;
  const pages=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const tc=await p.getTextContent();pages.push(itemsToLines(tc.items))}
  return ofpParse(pages);
}
function regKey(r){return String(r||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
async function importOfp(file){
  toast('Čtu OFP…');
  let list;try{list=await readOfpPdf(file)}catch(e){openSheet('OFP se nepodařilo načíst',`<div class="warnline warn">${esc(e&&e.message||'Soubor se nepodařilo přečíst.')}</div>`,{focus:false});return}
  if(!list.length){openSheet('V souboru není OFP',`<div class="warnline warn">V PDF jsem nenašel žádný OFP ve formátu NAVsystem. Je to opravdu letový plán?</div>`,{focus:false});return}
  const acOpts=S.acList.map(a=>[a.acId,a.reg]);
  const rows=list.map((o,i)=>{const m=S.acList.find(a=>regKey(a.reg)===regKey(o.reg));const dup=S.ofps[o.ofpId];
    return `<div class="def-row"><label class="check"><input type="checkbox" id="oi-${i}" ${dup?'':'checked'}><span><b class="mono">${esc(o.flt)} · ${esc(o.dep)} → ${esc(o.des)}</b> · ${fmtDate(o.date)} · STD ${esc(o.std)}Z · MREQ ${fmtN(o.fuel.rampMreq)} lbs${dup?' · <span class="ann mute">už nahráno</span>':''}</span></label>
      ${m?`<p class="muted">Letadlo ${esc(m.reg)} (v OFP ${esc(o.reg)})</p><input type="hidden" id="oa-${i}" value="${esc(m.acId)}">`:`<div class="warnline caution">OFP je pro ${esc(o.reg)}, takové letadlo v deníku není. Přiřadit k:</div>${F.sel('oa-'+i,'Letadlo',acOpts,BIND||UI.acId)}`}</div>`}).join('');
  UI.ofpImport=list;
  openSheet(`Nahrát OFP (${list.length})`,`<p class="muted">Z ${esc(file.name)}. Zkontrolujte lety a nahrajte je do deníku.</p>${rows}`,{submit:'Nahrát vybrané',onSubmit:async()=>{
    const items=[];UI.ofpImport.forEach((o,i)=>{if(!chk('oi-'+i))return;const acId=v('oa-'+i);if(!acId)return;const ac2=S.ac[acId];const dd=ofpDefsNow({acId,type:o.type});items.push(['ofp.import',{ofpId:o.ofpId,acId,file:file.name,data:o,defs:dd}])});
    if(!items.length)fail('Nevybrali jste žádný OFP.');
    emit(items);closeSheet();toast(`Nahráno OFP: ${items.length}`);
  }});
}
function ofpOf(id){return S.ofps[id]||null}
function ofpDateTxt(o){const l=o.leg;if(l&&l.date&&l.date!==o.date)return `${fmtDate(l.date)} <span class="muted" style="font-size:.85em">(plán ${fmtDate(o.date)})</span>`;return fmtDate(o.date)}
function parsePos(p){const m=String(p||'').match(/([NS])(\d{2})(\d{2}\.\d)\s+([EW])(\d{3})(\d{2}\.\d)/);if(!m)return null;const la=(+m[2]+ +m[3]/60)*(m[1]==='S'?-1:1),lo=(+m[5]+ +m[6]/60)*(m[4]==='W'?-1:1);return {la,lo}}
function gcNm(a,b){const r=x=>x*Math.PI/180;const dla=r(b.la-a.la),dlo=r(b.lo-a.lo);const h=Math.sin(dla/2)**2+Math.cos(r(a.la))*Math.cos(r(b.la))*Math.sin(dlo/2)**2;return 2*3440.065*Math.asin(Math.sqrt(h))}
function ofpRules(type){const out={};const rs=(S.cfg.ofpRules||[]).filter(r=>r&&OFP_FL[r.k]);
  for(const r of rs.filter(r=>!r.type))out[r.k]={def:r.def||'',max:r.max||''};
  for(const r of rs.filter(r=>r.type&&r.type===type)){const o=out[r.k]||(out[r.k]={def:'',max:''});if(r.def)o.def=r.def;if(r.max)o.max=r.max}
  return out}
function ofpType(o){const a=S.ac[o.acId];return (a&&a.type)||o.type||''}
function ofpDefsNow(o){const r=ofpRules(ofpType(o));const d={};for(const k in r)if(r[k].def!=='')d[k]=r[k].def;return d}
function ofpDefs(o){return o.defs||(o.closed||o.void?{}:ofpDefsNow(o))}
function ofpVal(o,k){const d=UI.ofpDirty&&UI.ofpDirty.id===o.ofpId?UI.ofpDirty.data:{};if(k in d)return d[k];if(o.fill[k]!=null)return o.fill[k];const df=ofpDefs(o)[k];return df==null?'':df}
// limit for a field: from settings, and the OFP's own max weights
function ofpMax(o,k){const w=o.weights||{};const lim=[];const r=ofpRules(ofpType(o))[k];if(r&&num(r.max)!=null)lim.push(num(r.max));
  if(k==='to_w'&&w.TOM&&w.TOM.max)lim.push(w.TOM.max);if(k==='ld_w'&&w.ELM&&w.ELM.max)lim.push(w.ELM.max);return lim.length?Math.min(...lim):null}
function ofpOver(o){const out=[];for(const [k,lb,n] of OFP_FIELDS){if(!n)continue;const mx=ofpMax(o,k),v=num(ofpVal(o,k));if(mx!=null&&v!=null&&v>mx)out.push(`${lb} ${fmtN(v)} > max ${fmtN(mx)}`)}return out}
function ofpFlush(){
  const d=UI.ofpDirty;clearTimeout(ofpFlush.t);if(!d||!Object.keys(d.data).length)return;UI.ofpDirty=null;
  SEQ++;const u=me();const ev={id:rid('ev'),type:'ofp.fill',p:{ofpId:d.id,data:d.data},at:new Date().toISOString(),n:0,by:u?u.id:'system',bn:u?u.name:'Systém',dev:DEV,seq:SEQ};
  EV[ev.id]=ev;OUT.push(ev.id);persist();rebuild();softRender();flush();
}
function ofpSet(id,k,val){const oo=ofpOf(id);if(oo&&(oo.closed||oo.void))return;if(!UI.ofpDirty||UI.ofpDirty.id!==id){ofpFlush();UI.ofpDirty={id,data:{}}}UI.ofpDirty.data[k]=val;clearTimeout(ofpFlush.t);ofpFlush.t=setTimeout(ofpFlush,2500)}
window.addEventListener('pagehide',()=>{try{ofpFlush()}catch(e){}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){try{ofpFlush()}catch(e){}}});

function ofpStatus(o){if(o.void)return ['mute','zrušeno'];if(o.closed)return ['ok','uzavřeno'];if(o.leg&&o.leg.state==='closed')return ['ok','let uzavřen'];if(o.leg)return ['info','let probíhá'];return ['caution','plánováno']}
function viewOfpList(ac){
  const list=[...(ac.ofps||[])].reverse();
  return `<div class="panel"><div class="panel-head"><div><p class="label">Elektronické OFP</p><h2>${esc(ac.reg)}</h2></div><div class="chips"><button class="btn primary" data-act="ofp-pick">${ICON.plus}Nahrát OFP (PDF)</button></div></div>
    <input type="file" id="ofp-file" accept="application/pdf,.pdf" hidden>
    ${list.length?`<div class="sres">${list.map(o=>{const [c,t]=ofpStatus(o);return `<button type="button" data-act="ofp-open" data-id="${esc(o.ofpId)}"><span class="k">${esc(o.flt)}</span><span>${esc(o.dep)} → ${esc(o.des)} · ${ofpDateTxt(o)} · STD ${esc(o.std)}Z <span class="ann ${c}" style="font-size:.66rem">${t}</span>${o.signed?' <span class="ann ok" style="font-size:.66rem">podepsáno</span>':''}</span><span class="d">OFP ${esc(o.ofpId)} · MREQ ${fmtN(o.fuel.rampMreq)} lbs · trip ${fmtN(o.fuel.trip&&o.fuel.trip.fuel)} lbs · ${esc(o.cmd||'')}</span></button>`}).join('')}</div>`
    :'<div class="empty"><p>Zatím žádné OFP. Nahrajte PDF z NAVsystemu – jeden soubor může obsahovat všechny lety dne.</p></div>'}</div>`;
}
function plannedOfps(ac){const lim=addDays(todayISO(),-7);return (ac.ofps||[]).filter(o=>!o.void&&!o.leg&&o.date>=lim)}
function ofpIn(o,k,label,opt){opt=opt||{};const val=ofpVal(o,k);if(o.closed||o.void)opt.ro=true;
  const mx=opt.num?ofpMax(o,k):null;const over=mx!=null&&num(val)!=null&&num(val)>mx;
  if(mx!=null)opt.cls=((opt.cls||'')+'" data-max="'+mx).trim();
  return `<label class="fld ${opt.full?'full':''} ${over?'over':''}"><span>${label}${mx!=null?` <small class="lim">max ${fmtN(mx)}</small>`:''}</span>${opt.area?`<textarea data-of="${esc(k)}" ${opt.ro?'readonly':''}>${esc(val)}</textarea>`:`<input type="text" data-of="${esc(k)}" value="${esc(val)}" ${opt.ro?'readonly':''} ${opt.num?'inputmode="numeric"':''} ${opt.ph?`placeholder="${esc(opt.ph)}"`:''} ${opt.cls?`class="${opt.cls}"`:''}>`}</label>`}
function ofpCalc(o){
  const l=o.leg;
  const atd=l&&parseHM(l.off)!=null?parseHM(l.off):parseHM(ofpVal(o,'x_off')||ofpVal(o,'atd'));
  const nonR=!!ofpVal(o,'nonRvsm');
  // DIRECT TO: points between the DCT origin and target are skipped; ETO downstream shortened by saved time
  const W=o.wpts||[];const dcts=[];const skip=new Set();
  W.forEach((p,i)=>{if(!p.rvsm&&ofpVal(o,'w'+i+'_dct')){const a=num(ofpVal(o,'w'+i+'_dctFrom'));if(a==null||!W[a])return;
    for(let k=a+1;k<i;k++)if(!W[k].rvsm)skip.add(k);
    const route=(p.distAcc||0)-(W[a].distAcc||0);const pa=parsePos(W[a].pos),pb=parsePos(p.pos);const direct=pa&&pb?gcNm(pa,pb):route;
    const saved=Math.max(0,route-direct);const gs=num(p.gs)||num(W[a].gs)||(()=>{const tm=(parseHM(p.tAcc)||0)-(parseHM(W[a].tAcc)||0);return tm>0?route/tm*60:null})();
    dcts.push({from:a,to:i,saved:Math.round(saved),min:gs?Math.round(saved/gs*60):0})}});
  const savedBefore=i=>dcts.filter(d=>d.to<=i).reduce((x,d)=>x+d.min,0);
  const lastPassed=(()=>{let r=0;W.forEach((p,i)=>{if(!p.rvsm&&!skip.has(i)&&parseHM(ofpVal(o,'w'+i+'_ato'))!=null)r=i});return r})();
  // ETO: after a passed point, rebase on its actual ATO (+ planned time from there − DCT savings); before it, plan from ATD
  const lastAto=lastPassed>0?parseHM(ofpVal(o,'w'+lastPassed+'_ato')):null;
  const etoAdj=(acc,i)=>{const a=parseHM(acc);if(a==null)return '';let t;
    if(lastAto!=null&&i>lastPassed){const b=parseHM(W[lastPassed].tAcc)||0;t=lastAto+(a-b)-dcts.filter(d=>d.to>lastPassed&&d.to<=i).reduce((x,d)=>x+d.min,0)}
    else{if(atd==null)return '';t=atd+a-savedBefore(i)}
    t=((t%1440)+1440)%1440;return pad(Math.floor(t/60))+':'+pad(t%60)};
  return {atd,nonR,W,dcts,skip,lastPassed,etoAdj};
}
function viewOfp(o,u){
  const f=o.fuel||{},w=o.weights||{},l=o.leg;const ro=!!o.void;
  const {atd,nonR,W,dcts,skip,lastPassed,etoAdj}=ofpCalc(o);
  const eto=acc=>{const a=parseHM(acc);return atd==null||a==null?'':(()=>{const t=(atd+a)%1440;return pad(Math.floor(t/60))+':'+pad(t%60)})()};
  const fr=(k,lab)=>f[k]?`<tr><td>${lab}</td><td class="r mono">${esc(f[k].time||'')}</td><td class="r mono">${fmtN(f[k].fuel)}</td></tr>`:'';
  const [sc,st]=ofpStatus(o);
  const LK=!!(o.closed||o.void);
  const wrows=W.map((p,i)=>{
    if(p.rvsm)return `<tr class="rvsmrow rvsm-only" ${nonR?'hidden':''}><td colspan="3"><b>RVSM</b> ALT DIFF (ft)</td><td colspan="8"><span class="inline" style="gap:6px;max-width:360px">${['lh','sb','rh'].map(x=>`<input type="text" data-of="r${i}_${x}" value="${esc(ofpVal(o,'r'+i+'_'+x))}" inputmode="numeric" placeholder="${x.toUpperCase()}" aria-label="RVSM ${x.toUpperCase()}">`).join('')}</span></td></tr>`;
    const sk=skip.has(i);const isDct=!!ofpVal(o,'w'+i+'_dct');const d=dcts.find(x=>x.to===i);
    const act=num(ofpVal(o,'w'+i+'_fuel'));const diff=act!=null&&p.mreq!=null?act-p.mreq:null;
    const dctBtn=sk?'<span class="muted" style="font-size:.78rem">vynecháno</span>':LK?(isDct?'<span class="ann info" style="font-size:.62rem">DCT</span>':''):isDct?`<button type="button" class="btn sm" data-act="ofp-dct-undo" data-id="${esc(o.ofpId)}|${i}">Zrušit DCT</button>`:(i>lastPassed&&i>0&&!o.void?`<button type="button" class="btn sm" data-act="ofp-dct" data-id="${esc(o.ofpId)}|${i}" title="ATC: direct to ${esc(p.wpt)}">DCT</button>`:'');
    return `<tr class="${sk?'skip':''}"><td>${dctBtn}</td><td><b class="mono">${esc(p.wpt)}</b>${isDct?' <span class="ann info" style="font-size:.62rem;padding:0 4px">DCT</span>':''}${p.name?`<br><span class="muted" style="font-size:.78rem">${esc(p.name)}</span>`:''}${d?`<br><span style="font-size:.78rem;color:var(--ok)">z ${esc(W[d.from].wpt)} −${d.saved} NM · −${d.min} min</span>`:''}</td><td class="mono" style="font-size:.84rem">${esc(p.awy)}<br>${esc(p.fl)}</td><td class="r mono">${p.distInt??''}<br><span class="muted">${p.distAcc??''}</span></td><td class="r mono">${esc(p.tAcc)}</td><td class="r mono">${sk?'–':(etoAdj(p.tAcc,i)||'–')}</td>
      <td><input type="text" class="t4 ofp-t" data-of="w${i}_ato" value="${esc(ofpVal(o,'w'+i+'_ato'))}" inputmode="numeric" maxlength="5" placeholder="––:––" aria-label="ATO ${esc(p.wpt)}" ${sk||LK?'disabled':''}></td>
      <td class="r mono">${fmtN(p.mreq)}</td><td><input type="text" class="ofp-n" data-of="w${i}_fuel" value="${esc(ofpVal(o,'w'+i+'_fuel'))}" inputmode="numeric" aria-label="Palivo ${esc(p.wpt)}" ${sk||LK?'disabled':''}></td>
      <td class="r mono" id="wd-${i}" style="color:${diff==null?'inherit':diff<0?'var(--warn)':'var(--ok)'}">${diff==null?'':(diff>0?'+':'')+fmtN(diff)}</td>
      <td><input type="text" class="ofp-note" data-of="w${i}_note" value="${esc(ofpVal(o,'w'+i+'_note'))}" aria-label="Poznámka ${esc(p.wpt)}" placeholder="FL / pozn." ${LK?'disabled':''}></td></tr>`}).join('');
  const dctSum=dcts.length?`<div class="warnline info">${dcts.map(d=>`DCT <b class="mono">${esc(W[d.from].wpt)} → ${esc(W[d.to].wpt)}</b>: zkráceno o ${d.saved} NM, ~${d.min} min`).join('<br>')}. ETO dalších bodů je posunuté. Plánované palivo (MREQ) zůstává podle OFP.</div>`:'';
  const atl=l?`<dl class="kvgrid"><dt>Ramp ACT (palivo na odlet)</dt><dd class="mono">${fmtN(l.fuelBlk)} lbs <span class="muted">plán ${fmtN(f.rampEst)} · MREQ ${fmtN(f.rampMreq)}</span></dd>
      <dt>Used ACT (spáleno)</dt><dd class="mono">${l.state==='closed'?fmtN(l.fuelBurn)+' lbs':'–'} <span class="muted">plán ${fmtN(f.usedCalc)}</span>${l.state==='closed'&&l.fuelBurn!=null&&f.usedCalc?` <b style="color:${l.fuelBurn>f.usedCalc?'var(--caution)':'var(--ok)'}">${l.fuelBurn>f.usedCalc?'+':''}${fmtN(l.fuelBurn-f.usedCalc)}</b>`:''}</dd>
      <dt>Landing (po přistání)</dt><dd class="mono">${l.state==='closed'?fmtN(l.fuelRem)+' lbs':'–'} <span class="muted">plán ${fmtN(f.fmcRes)}</span></dd>
      <dt>DEP ${esc(l.from)}</dt><dd class="mono">${l.state==='closed'?`block ${esc(l.out)} · flight ${esc(l.off)}`:'–'}</dd>
      <dt>ARR ${esc(l.to)}</dt><dd class="mono">${l.state==='closed'?`block ${esc(l.in)} · flight ${esc(l.on)}`:'–'}</dd>
      <dt>Celkem</dt><dd class="mono">${l.state==='closed'?`block ${hm(l.block)} · flight ${hm(l.air)}`:'–'} <span class="muted">plán trip ${esc(f.trip&&f.trip.time||'')}</span></dd></dl>`
    :'<p class="muted">Tyto údaje se doplní samy, až se podle tohoto OFP zahájí a uzavře let v ATL.</p>';
  return `<div class="ofp" data-keep data-ofp="${esc(o.ofpId)}">
  <div class="panel"><div class="panel-head"><div><p class="label">OFP ${esc(o.ofpId)} · ${esc(o.reg)} ${esc(o.type||'')}</p><h2 class="mono">${esc(o.flt)} · ${esc(o.dep)} → ${esc(o.des)}</h2><p class="muted">${ofpDateTxt(o)} · STD ${esc(o.std)}Z · STA ${esc(o.sta||'')}Z · ALTN ${esc(o.altn||'–')}${o.altn2?' / '+esc(o.altn2):''} · CMD ${esc(o.cmd||'–')}</p></div>
    <div class="chips"><span class="ann ${sc}">${st}</span>${o.signed?`<span class="ann ok">podepsal ${esc(o.signed.name)} ${hmOfIso(o.signed.at)}Z</span>`:''}<button type="button" class="btn sm" data-act="ofp-pdf" data-id="${esc(o.ofpId)}">PDF / tisk</button></div></div>
    ${l?'':(!o.void&&can.leg(u)?`<div class="chips"><button class="btn primary" data-act="ofp-start" data-id="${esc(o.ofpId)}">${ICON.plus}Začít let podle tohoto OFP</button></div>`:'')}
  </div>
  <div class="two">
    <div class="panel"><p class="label">Plán letu</p><dl class="kvgrid"><dt>Vzdálenost</dt><dd class="mono">${fmtN(o.dist)} NM · max FL ${esc(o.maxFl||'')}</dd><dt>Vítr</dt><dd class="mono">${esc(o.wind||'–')}</dd><dt>PAX / POB</dt><dd class="mono">${o.pax?`${o.pax.m}/${o.pax.f}/${o.pax.c}/${o.pax.i}`:'–'} · ${esc(o.totPax??'')} PAX · POB ${esc(o.pob??'')} · cargo ${fmtN(o.cargo)} lb</dd><dt>Druh</dt><dd>${esc(o.ops||'')}</dd></dl>
      <p class="label" style="margin-top:6px">ATC route</p><p class="mono" style="font-size:.84rem;overflow-wrap:anywhere">${esc(o.route||'')}</p></div>
    <div class="panel"><p class="label">Palivo (lbs)</p><table class="plain"><tbody>${fr('trip','Trip')}${fr('altn','Alternate')}${fr('cont','Contingency')}${fr('final','Final reserve')}${fr('taxi','Taxi')}${fr('add','Additional')}${fr('extra','Extra')}
      <tr><td><b>Ramp MREQ</b></td><td></td><td class="r mono"><b>${fmtN(f.rampMreq)}</b></td></tr><tr><td>Ramp EST</td><td></td><td class="r mono">${fmtN(f.rampEst)}</td></tr><tr><td>Used CALC</td><td></td><td class="r mono">${fmtN(f.usedCalc)}</td></tr>${fr('discr','Discretionary')}</tbody></table>
      <p class="label" style="margin-top:6px">Váhy (lb) max / est</p><p class="mono" style="font-size:.84rem">${['ZFM','TOM','ELM','PLD','FUEL'].filter(k=>w[k]).map(k=>`${k} ${w[k].max?fmtN(w[k].max)+' / ':''}${fmtN(w[k].est)}`).join(' · ')}</p></div>
  </div>
  <div class="panel"><p class="label">Před odletem</p>
    <div class="fgrid wide">${ofpIn(o,'clr','ATC clearance',{area:true})}${ofpIn(o,'atisDep','ATIS DEP',{area:true})}</div>
    <div><p class="label">Kontrola výškoměrů (ft)</p>
      <p class="muted" style="margin:4px 0 0;font-weight:600">On ground</p><div class="fgrid">${ofpIn(o,'rg_lh','LH',{num:true})}${ofpIn(o,'rg_sb','SBY',{num:true})}${ofpIn(o,'rg_rh','RH',{num:true})}</div>
      <p class="muted" style="margin:8px 0 0;font-weight:600">RVSM</p>
      <div class="fgrid rvsm-only" ${nonR?'hidden':''}>${ofpIn(o,'re_lh','Entry FL LH',{num:true})}${ofpIn(o,'re_sb','Entry FL SBY',{num:true})}${ofpIn(o,'re_rh','Entry FL RH',{num:true})}</div>
      <label class="check"><input type="checkbox" data-of="nonRvsm" ${nonR?'checked':''} ${LK?'disabled':''}><span>Let není prováděn v RVSM</span></label></div>
    <div><p class="label">Vzletová data</p><div class="fgrid">${ofpIn(o,'to_w','Weight',{num:true})}${ofpIn(o,'to_dist','TO Dist',{num:true})}${ofpIn(o,'to_pwr','Power')}${ofpIn(o,'to_flaps','Flaps')}${ofpIn(o,'v1','V1',{num:true})}${ofpIn(o,'vr','VR',{num:true})}${ofpIn(o,'v2','V2',{num:true})}${ofpIn(o,'vfto','VFTO',{num:true})}</div>
      <div class="emr"><p class="label">Emergency return</p><div class="fgrid">${ofpIn(o,'emr_vref','EMR VREF',{num:true})}${ofpIn(o,'emr_vapp','EMR VAPP',{num:true})}</div></div></div>
    ${o.signed?'':`<div class="chips">${can.leg(u)?`<button class="btn" data-act="ofp-sign" data-id="${esc(o.ofpId)}">${ICON.check}Podepsat OFP – velitel</button>`:''}</div>`}
  </div>
  <div class="panel"><p class="label">Odlet a navigační log – ETO počítá z času vzletu</p>
    ${l&&parseHM(l.off)!=null?`<p class="mono">Off-block ${esc(l.out||'–')}Z · vzlet ${esc(l.off)}Z <span class="muted">z ATL</span></p>`:`<div class="t4grid" style="max-width:420px;grid-template-columns:repeat(2,minmax(0,1fr))">${[['x_out','Off-block',ofpVal(o,'x_out')],['x_off','Vzlet (ATD)',ofpVal(o,'x_off')||ofpVal(o,'atd')]].map(([k,lb,val])=>`<label class="fld"><span>${lb}</span><input type="text" class="t4 ofp-t" data-of="${k}" value="${esc(val)}" inputmode="numeric" maxlength="5" placeholder="––:––" ${LK?'disabled':''}></label>`).join('')}</div>`}
    <p class="muted" style="font-size:.86rem">ETO = čas vzletu + plánovaný čas z OFP. Po přeletu bodu (vyplněné ATO) se další ETO počítají od skutečného ATO; direct je zkrátí o ušetřený čas.</p>
    <div class="scroll-x"><table class="plain ofplog"><thead><tr><th>Direct</th><th>WPT</th><th>AWY / FL</th><th class="r">Dist</th><th class="r">Čas</th><th class="r">ETO</th><th>ATO</th><th class="r">MREQ</th><th>Palivo ACT</th><th class="r">±</th><th>FL / Poznámka</th></tr></thead><tbody>${wrows}</tbody></table></div>${dctSum}</div>
  ${ofpDivertPanel(o,LK)}
  <div class="panel"><p class="label">Přílet${ofpVal(o,'dv')?` – DIVERT ${esc(divTo(o))}`:''}</p>
    <div class="fgrid wide">${ofpIn(o,'atisArr','ATIS ARR',{area:true})}</div>
    <div><p class="label">Přistávací data</p><div class="fgrid">${ofpIn(o,'ld_w','Weight',{num:true})}${ofpIn(o,'ld_dist','LD Dist',{num:true})}${ofpIn(o,'vref','VREF',{num:true})}${ofpIn(o,'vapp','VAPP',{num:true})}${ofpIn(o,'vfs','VFS',{num:true,ph:'160'})}${ofpIn(o,'magrad','MA grad')}${ofpIn(o,'ld167','LD × 1,67',{num:true})}</div></div></div>
  ${ofpClosePanel(o,u,atl)}
  <div class="panel">${ofpIn(o,'notes','Poznámky',{area:true,full:true})}<p class="muted" style="font-size:.86rem">Vyplněné údaje se ukládají samy a každá změna zůstává v auditu.${o.void?'':''}</p>
    ${!o.void&&!l&&can.leg(u)?`<div class="links"><button type="button" class="linkbtn" data-act="ofp-void" data-id="${esc(o.ofpId)}">Zrušit tento OFP (špatný soubor, nahrazen novějším)</button></div>`:''}</div>
  </div>`;
}

/* --- OFP as PDF: print, archive, send. Built in the iPad, works without signal. --- */
let pdfKit=null;
function loadPdfKit(){
  if(!pdfKit)pdfKit=(async()=>{
    if(!window.PDFLib)await loadScript('vendor/pdf-lib.min.js');if(!window.fontkit)await loadScript('vendor/fontkit.min.js');
    const get=async f=>{const r=await fetch('fonts/pdf/'+f);if(!r.ok)throw new Error('Písmo pro PDF se nenačetlo.');return r.arrayBuffer()};
    const [b,bs,m,ms]=await Promise.all(['barlow-400.ttf','barlow-600.ttf','plexmono-400.ttf','plexmono-600.ttf'].map(get));
    return {lib:window.PDFLib,fk:window.fontkit,fonts:{b,bs,m,ms}};
  })().catch(e=>{pdfKit=null;throw e});
  return pdfKit;
}
async function ofpPdf(o){
  ofpFlush();
  const {lib,fk,fonts}=await loadPdfKit();const {PDFDocument,rgb}=lib;
  const doc=await PDFDocument.create();doc.registerFontkit(fk);
  const F={b:await doc.embedFont(fonts.b,{subset:true}),bs:await doc.embedFont(fonts.bs,{subset:true}),m:await doc.embedFont(fonts.m,{subset:true}),ms:await doc.embedFont(fonts.ms,{subset:true})};
  const C={ink:rgb(.08,.11,.15),mute:rgb(.42,.46,.52),line:rgb(.80,.83,.87),soft:rgb(.95,.96,.97),ok:rgb(.09,.47,.29),caut:rgb(.60,.36,.02),warn:rgb(.69,.16,.13)};
  const PW=595.28,PH=841.89,M=34,CW=PW-2*M,BOT=48;
  let page,y;const pages=[];
  const clean=v=>String(v==null?'':v).replace(/[   ]/g,' ').replace(/→/g,'-').replace(/[^\S\n ]+/g,' ');
  const tw=(t,f,sz)=>F[f].widthOfTextAtSize(clean(t),sz);
  const T=(t,x,yy,f='b',sz=9,c=C.ink)=>{t=clean(t);if(t)page.drawText(t,{x,y:yy,size:sz,font:F[f],color:c})};
  const TR=(t,xr,yy,f='m',sz=8.5,c=C.ink)=>T(t,xr-tw(t,f,sz),yy,f,sz,c);
  const fit=(t,f,sz,w)=>{t=clean(t);if(tw(t,f,sz)<=w)return t;while(t.length>1&&tw(t+'…',f,sz)>w)t=t.slice(0,-1);return t+'…'};
  const wrap=(t,f,sz,w)=>{const out=[];for(const para of clean(t).split('\n')){let line='';for(let word of para.split(' ')){
      while(tw(word,f,sz)>w){let k=word.length;while(k>1&&tw(word.slice(0,k),f,sz)>w)k--;if(line){out.push(line);line=''}out.push(word.slice(0,k));word=word.slice(k)}
      const cand=line?line+' '+word:word;if(tw(cand,f,sz)>w&&line){out.push(line);line=word}else line=cand}
    out.push(line)}return out};
  const HL=(yy,x1=M,x2=PW-M,c=C.line,th=.6)=>page.drawLine({start:{x:x1,y:yy},end:{x:x2,y:yy},thickness:th,color:c});
  const newPage=()=>{page=doc.addPage([PW,PH]);pages.push(page);y=PH-M};
  const need=h=>{if(y-h<BOT){newPage();return true}return false};
  const val=k=>ofpVal(o,k);const dash=v=>v==null||String(v).trim()===''?'–':String(v).trim();
  const l=o.leg;const f=o.fuel||{},w=o.weights||{};const cfg=S.cfg;
  const {atd,nonR,W,dcts,skip,etoAdj}=ofpCalc(o);
  const section=t=>{need(34);y-=14;T(t.toUpperCase(),M,y,'bs',8,C.mute);y-=4;HL(y);y-=11};
  // label/value cells in columns
  const cells=(items,cols)=>{const cw=CW/cols;for(let i=0;i<items.length;i+=cols){const row=items.slice(i,i+cols);
      const lines=row.map(([,v,o2])=>wrap(dash(v),(o2&&o2.font)||'m',8.5,cw-8));const h=10+Math.max(...lines.map(x=>x.length))*10.5+4;need(h);
      row.forEach(([lab,,o2],j)=>{const x=M+j*cw;T(lab,x,y,'b',7,C.mute);lines[j].forEach((ln,k)=>T(ln,x,y-10.5-k*10.5,(o2&&o2.font)||'m',8.5,(o2&&o2.color)||C.ink))});
      y-=h}};
  newPage();
  // --- header ---
  const opn=[cfg.opName,cfg.aoc].filter(Boolean).join(' · ');
  T(opn||'eTechLog',M,y-2,'bs',9,C.mute);TR('OPERATIONAL FLIGHT PLAN',PW-M,y-2,'bs',9,C.mute);y-=24;
  T(`${o.flt||''}  ${o.dep||''} – ${o.des||''}`,M,y,'ms',17);
  const st=o.void?['ZRUŠENO',C.warn]:o.closed?['UZAVŘENO',C.ok]:l&&l.state==='closed'?['LET UZAVŘEN, OFP NEUZAVŘENO',C.caut]:['ROZPRACOVÁNO',C.caut];
  TR(st[0],PW-M,y+2,'bs',10,st[1]);y-=16;
  const dTxt=l&&l.date&&l.date!==o.date?`${fmtDate(l.date)} (plán ${fmtDate(o.date)})`:fmtDate(o.date);
  T(`${dTxt}  ·  STD ${o.std||'–'}Z  ·  STA ${o.sta||'–'}Z  ·  ${o.reg||''} ${o.type||''}  ·  ALTN ${o.altn||'–'}${o.altn2?' / '+o.altn2:''}  ·  OFP ${o.ofpId}`,M,y,'m',8.5);y-=12;
  const pic=l&&S.users[l.pic],sic=l&&l.sic&&S.users[l.sic];
  T(`CMD (OFP) ${o.cmd||'–'}${pic?'  ·  PIC '+pic.name:''}${sic?'  ·  SIC '+sic.name:''}`,M,y,'b',9);y-=8;HL(y,M,PW-M,C.ink,1);y-=4;
  // --- plan and fuel ---
  section('Plán letu');
  cells([['Vzdálenost',`${fmtN(o.dist)} NM`],['Max FL',o.maxFl],['Vítr',o.wind],['PAX / POB',`${o.totPax??'–'} PAX · POB ${o.pob??'–'}`],['Cargo',o.cargo!=null?fmtN(o.cargo)+' lb':''],['Druh',o.ops]],6);
  if(o.route){need(24);T('ATC route',M,y,'b',7,C.mute);y-=10.5;for(const ln of wrap(o.route,'m',8,CW)){need(10);T(ln,M,y,'m',8);y-=10}y-=2}
  section('Palivo (lbs)');
  const fk2=[['trip','Trip'],['altn','Alternate'],['cont','Contingency'],['final','Final reserve'],['taxi','Taxi'],['add','Additional'],['extra','Extra'],['discr','Discretionary']].filter(([k])=>f[k]);
  cells(fk2.map(([k,lb])=>[lb,`${fmtN(f[k].fuel)}${f[k].time?'  '+f[k].time:''}`]).concat([['Ramp MREQ',fmtN(f.rampMreq),{font:'ms'}],['Ramp EST',fmtN(f.rampEst)],['Used CALC',fmtN(f.usedCalc)]]),6);
  const wk=['ZFM','TOM','ELM','PLD','FUEL'].filter(k=>w[k]);if(wk.length)cells(wk.map(k=>[k+' max / est (lb)',`${w[k].max?fmtN(w[k].max)+' / ':''}${fmtN(w[k].est)}`]),5);
  // --- before departure ---
  section('Před odletem');
  cells([['ATC clearance',val('clr')],['ATIS DEP',val('atisDep')]],2);
  cells([['Výškoměry on ground LH',val('rg_lh')],['SBY',val('rg_sb')],['RH',val('rg_rh')]].concat(nonR?[['RVSM','let není prováděn v RVSM',{font:'b'}]]:[['RVSM entry FL LH',val('re_lh')],['SBY',val('re_sb')],['RH',val('re_rh')]]),6);
  cells([['TO weight',val('to_w')],['TO dist',val('to_dist')],['Power',val('to_pwr')],['Flaps',val('to_flaps')],['V1',val('v1')],['VR',val('vr')],['V2',val('v2')],['VFTO',val('vfto')],['EMR VREF',val('emr_vref')],['EMR VAPP',val('emr_vapp')]],6);
  const offb=l&&l.state==='closed'?l.out:val('x_out'),tko=l&&parseHM(l.off)!=null?l.off:(val('x_off')||val('atd'));
  cells([['Off-block (UTC)',offb,{font:'ms'}],['Vzlet / ATD (UTC)',tko,{font:'ms'}],['Podpis velitele',o.signed?`${o.signed.name} · ${fmtTs(o.signed.at)}`:'nepodepsáno',{font:'b',color:o.signed?C.ink:C.warn}]],3);
  // --- nav log ---
  section('Navigační log');
  const cols=[['WPT',70,'l'],['AWY / FL',62,'l'],['DIST',34,'r'],['ACC',34,'r'],['ČAS',34,'r'],['ETO',36,'r'],['ATO',36,'r'],['MREQ',44,'r'],['ACT',44,'r'],['±',38,'r']];
  const used=cols.reduce((a,c)=>a+c[1],0);cols.push(['Poznámka',CW-used,'l']);
  const head=()=>{page.drawRectangle({x:M,y:y-4,width:CW,height:14,color:C.soft});let x=M;for(const [h,wd,al] of cols){if(al==='r')TR(h,x+wd-3,y,'bs',7,C.mute);else T(h,x+3,y,'bs',7,C.mute);x+=wd}y-=16};
  need(40);head();
  W.forEach((p,i)=>{
    if(p.rvsm){if(nonR)return;if(need(14))head();
      T(`RVSM ALT DIFF (ft)   LH ${dash(val('r'+i+'_lh'))}   SBY ${dash(val('r'+i+'_sb'))}   RH ${dash(val('r'+i+'_rh'))}`,M+3,y,'m',8,C.ink);y-=6;HL(y);y-=9;return}
    const sk=skip.has(i);const isD=!!val('w'+i+'_dct');const d=dcts.find(x=>x.to===i);
    const note=val('w'+i+'_note');const noteL=note?wrap(note,'b',7.5,cols[10][1]-6):[];
    const rh=Math.max(20,8+Math.max(2,noteL.length)*9);if(need(rh))head();
    const act=num(val('w'+i+'_fuel'));const diff=act!=null&&p.mreq!=null?act-p.mreq:null;
    const cc=sk?C.mute:C.ink;let x=M;
    T(fit(p.wpt+(isD?' DCT':''),'ms',8.5,cols[0][1]-4),x+3,y,'ms',8.5,cc);T(fit(sk?'vynecháno (DCT)':d?`z ${W[d.from].wpt} −${d.min} min`:(p.name||''),'b',6.8,cols[0][1]-4),x+3,y-9,'b',6.8,sk||d?C.caut:C.mute);x+=cols[0][1];
    T(fit(p.awy||'','m',7.5,cols[1][1]-4),x+3,y,'m',7.5,cc);T(fit(p.fl||'','m',7.5,cols[1][1]-4),x+3,y-9,'m',7.5,C.mute);x+=cols[1][1];
    const rv=[p.distInt??'',p.distAcc??'',p.tAcc||'',sk?'–':(etoAdj(p.tAcc,i)||'–'),sk?'–':dash(val('w'+i+'_ato')),fmtN(p.mreq),sk?'–':(act!=null?fmtN(act):'–'),diff==null?'':(diff>0?'+':'')+fmtN(diff)];
    rv.forEach((t,k)=>{const c=cols[k+2];const col=k===4&&t!=='–'?C.ink:k===7&&diff!=null?(diff<0?C.warn:C.ok):cc;TR(String(t),x+c[1]-3,y,k===4||k===6?'ms':'m',8,col);x+=c[1]});
    noteL.forEach((ln,k)=>T(ln,x+3,y-k*9,'b',7.5));
    y-=rh-8;HL(y);y-=9;
  });
  if(nonR){need(14);T('Let není prováděn v RVSM.',M+3,y,'b',8,C.mute);y-=12}
  if(dcts.length){need(14);for(const d of dcts){need(11);T(`DCT ${W[d.from].wpt} - ${W[d.to].wpt}: zkráceno o ${d.saved} NM, ~${d.min} min`,M+3,y,'b',8,C.caut);y-=11}}
  if(val('dv')){
    section('Divert – route to alternate → '+divTo(o));
    cells([['Začátek divertu (UTC)',val('dv_start'),{font:'ms'}],['Letiště',divTo(o),{font:'ms'}]],4);
    const A=o.altWpts||[];if(A.length){need(40);head();
      for(const {p,i,eto,act,diff} of divRows(o)){const note=val('a'+i+'_note');const noteL=note?wrap(note,'b',7.5,cols[10][1]-6):[];
        const rh=Math.max(20,8+Math.max(2,noteL.length)*9);if(need(rh))head();let x=M;
        T(fit(p.wpt,'ms',8.5,cols[0][1]-4),x+3,y,'ms',8.5);T(fit(p.name||'','b',6.8,cols[0][1]-4),x+3,y-9,'b',6.8,C.mute);x+=cols[0][1];
        T(fit(p.awy||'','m',7.5,cols[1][1]-4),x+3,y,'m',7.5);T(fit(p.fl||'','m',7.5,cols[1][1]-4),x+3,y-9,'m',7.5,C.mute);x+=cols[1][1];
        [p.distInt??'',p.distAcc??'',p.tAcc||'',eto||'–',dash(val('a'+i+'_ato')),fmtN(p.mreq),act!=null?fmtN(act):'–',diff==null?'':(diff>0?'+':'')+fmtN(diff)].forEach((t,k)=>{const c=cols[k+2];TR(String(t),x+c[1]-3,y,k===4||k===6?'ms':'m',8,k===7&&diff!=null?(diff<0?C.warn:C.ok):C.ink);x+=c[1]});
        noteL.forEach((ln,k)=>T(ln,x+3,y-k*9,'b',7.5));y-=rh-8;HL(y);y-=9}}
  }
  // --- arrival ---
  section('Přílet'+(val('dv')?' – divert '+divTo(o):''));
  cells([['ATIS ARR',val('atisArr')]],1);
  cells([['LD weight',val('ld_w')],['LD dist',val('ld_dist')],['VREF',val('vref')],['VAPP',val('vapp')],['VFS',val('vfs')],['MA grad',val('magrad')],['LD × 1,67',val('ld167')]],7);
  // --- ATL ---
  section('Technický deník (ATL)');
  if(l&&l.state==='closed'){
    const pf=l.pf&&S.users[l.pf];
    cells([['Off-block',l.out,{font:'ms'}],['Vzlet',l.off,{font:'ms'}],['Přistání',l.on,{font:'ms'}],['On-block',l.in,{font:'ms'}],['Block',hm(l.block),{font:'ms'}],['Flight',hm(l.air),{font:'ms'}],
      ['Palivo na odlet',l.fuelBlk!=null?fmtN(l.fuelBlk)+' lbs':''],['Spáleno',l.fuelBurn!=null?`${fmtN(l.fuelBurn)} lbs (plán ${fmtN(f.usedCalc)})`:''],['Po přistání',l.fuelRem!=null?fmtN(l.fuelRem)+' lbs':''],['Přiblížení',l.app],['Přistání (počet)',l.ldg],['Pilot flying',pf?pf.name:''],
      ['Stránka ATL',l.page?l.page+'/'+l.idx:''],['Let podepsal',l.signed?`${l.signed.name} · ${fmtTs(l.signed.at)}`:'',{font:'b'}]],6);
  }else{
    cells([['Přistání',val('x_on'),{font:'ms'}],['On-block',val('x_in'),{font:'ms'}],['Po přistání (lbs)',val('x_fuelRem')],['Spáleno (lbs)',val('x_fuelBurn')],['Přiblížení',val('x_app')==='OTHER'?val('x_appOther'):val('x_app')],['Závada',val('x_defText')||'NIL',{font:'b'}]],6);
    need(12);T(l?'Let v ATL ještě není uzavřený – údaje jsou z rozpracovaného OFP.':'Podle tohoto OFP zatím nebyl zahájen let v ATL.',M,y,'b',8,C.caut);y-=12;
  }
  if(String(val('notes')).trim()){section('Poznámky');for(const ln of wrap(val('notes'),'b',9,CW)){need(12);T(ln,M,y,'b',9);y-=12}}
  // --- signatures ---
  section('Podpisy a záznam');
  const sig=[];
  sig.push(['OFP podepsal (velitel)',o.signed?`${o.signed.name} · ${fmtTs(o.signed.at)} · zařízení ${o.signed.dev||'–'}`:'nepodepsáno']);
  (o.reopened||[]).forEach(r=>sig.push(['Znovu otevřel',`${r.name} · ${fmtTs(r.at)} · důvod: ${r.reason||'–'}`]));
  if(o.closed)sig.push(['OFP uzavřel',`${o.closed.name} · ${fmtTs(o.closed.at)}${o.closed.dev?' · zařízení '+o.closed.dev:''}`]);
  if(o.closed&&o.missing&&o.missing.length)sig.push(['Při uzavření chybělo',o.missing.join(', ')]);
  if(o.void)sig.push(['Zrušil',`${o.void.name} · ${fmtTs(o.void.at)} · ${o.void.reason||''}`]);
  sig.push(['Importováno',`${o.imported?o.imported.name+' · '+fmtTs(o.imported.at):''}${o.file?' · '+o.file:''}`]);
  for(const [a,b] of sig){const ls=wrap(b,'b',8.5,CW-130);need(ls.length*11+2);T(a,M,y,'b',8,C.mute);ls.forEach((ln,k)=>T(ln,M+130,y-k*11,'b',8.5));y-=ls.length*11+2}
  need(26);y-=6;for(const ln of wrap(`Vytvořeno ${fmtTs(new Date().toISOString())} v zařízení ${DEV}, eTechLog ${window.ETL_VERSION||''}. Elektronický záznam: údaje a podpisy (PIN) jsou uložené jako neměnné záznamy s časem a autorem v auditu eTechLogu.`,'b',7.5,CW)){T(ln,M,y,'b',7.5,C.mute);y-=9.5}
  // --- footer on every page ---
  pages.forEach((pg,i)=>{page=pg;HL(30,M,PW-M,C.line,.5);T(`${o.flt||''} ${o.dep||''}-${o.des||''} · ${l&&l.date?fmtDate(l.date):fmtDate(o.date)} · OFP ${o.ofpId}`,M,19,'m',7,C.mute);TR(`${st[0]} · strana ${i+1}/${pages.length}`,PW-M,19,'b',7,C.mute)});
  doc.setTitle(`OFP ${o.flt||''} ${o.dep||''}-${o.des||''} ${o.ofpId}`);doc.setAuthor(opn||'eTechLog');doc.setCreator('eTechLog');doc.setProducer('eTechLog');
  const bytes=await doc.save();
  const dt=String((l&&l.date)||o.date||'').replace(/\D/g,'');
  return {bytes,name:`OFP-${clean(o.flt||'').replace(/[^A-Z0-9]/gi,'')}-${o.dep||''}-${o.des||''}-${dt}.pdf`};
}
let pdfOut=null;
async function openOfpPdf(id){
  const o=ofpOf(id);if(!o)return;
  openSheet('PDF – OFP '+(o.flt||''),`<p id="pdf-st">Vytvářím PDF…</p>`,{focus:false});
  try{
    const r=await ofpPdf(o);
    if(pdfOut)URL.revokeObjectURL(pdfOut.url);
    const blob=new Blob([r.bytes],{type:'application/pdf'});pdfOut={name:r.name,blob,url:URL.createObjectURL(blob)};
    const canShare=(()=>{try{return !!(navigator.canShare&&navigator.canShare({files:[new File([blob],r.name,{type:'application/pdf'})]}))}catch(e){return false}})();
    hoBody(`<p><b class="mono">${esc(r.name)}</b> · ${Math.max(1,Math.round(r.bytes.length/1024))} kB</p>
      <div class="chips">${canShare?`<button type="button" class="btn primary" data-act="pdf-share">Tisk / sdílet / uložit</button>`:''}<a class="btn ${canShare?'':'primary'}" id="pdf-open" href="${pdfOut.url}" download="${esc(r.name)}" target="_blank" rel="noopener">Otevřít PDF</a></div>
      <p class="muted" style="font-size:.86rem">${canShare?'V nabídce sdílení je Tisk (AirPrint), Uložit do Souborů, AirDrop a e-mail.':'PDF se otevře nebo stáhne – vytisknete ho z prohlížeče.'} ${o.closed?'':'OFP ještě není uzavřené – v PDF je označené jako rozpracované.'}</p>`);
  }catch(e){hoBody(`<p class="form-err">PDF se nepodařilo vytvořit: ${esc(e.message||String(e))}</p>`)}
}
function sharePdf(){if(!pdfOut)return;const file=new File([pdfOut.blob],pdfOut.name,{type:'application/pdf'});
  navigator.share({files:[file],title:pdfOut.name}).catch(e=>{if(e&&e.name!=='AbortError'){const a=document.getElementById('pdf-open');if(a)a.click()}})}

/* --- close OFP and transfer to ATL --- */
const XT=[['out','Off-block'],['off','Vzlet'],['on','Přistání'],['in','On-block']];
function xget(o){return k=>{
  if(k==='defOn')return !!String(ofpVal(o,'x_defText')||'').trim();
  if(k==='defText')return ofpVal(o,'x_defText');
  if(k==='off'){const v=ofpVal(o,'x_off');return v||ofpVal(o,'atd')}
  if(k==='ldg'){return ofpVal(o,'x_ldg')||'1'}
  if(k==='cto'){return ofpVal(o,'x_cto')||(ofpVal(o,'dv')?divTo(o):'')}
  if(k==='cdate')return ofpVal(o,'x_cdate')||'';
  return ofpVal(o,'x_'+k)}}
// --- divert: OFP "route to alternate" becomes the nav log from the decision point ---
function divTo(o){return (String(ofpVal(o,'dv_to')||'').toUpperCase().trim())||o.altn||''}
function divRows(o){
  const A=o.altWpts||[];const start=parseHM(ofpVal(o,'dv_start'));
  // after an actual ATO, later ETOs follow it
  let lastI=-1,lastT=null;A.forEach((p,i)=>{const t=parseHM(ofpVal(o,'a'+i+'_ato'));if(t!=null){lastI=i;lastT=t}});
  return A.map((p,i)=>{const acc=parseHM(p.tAcc);let eto='';
    if(acc!=null){let t=null;if(lastT!=null&&i>lastI)t=lastT+acc-(parseHM(A[lastI].tAcc)||0);else if(start!=null)t=start+acc;
      if(t!=null){t=((t%1440)+1440)%1440;eto=pad(Math.floor(t/60))+':'+pad(t%60)}}
    const act=num(ofpVal(o,'a'+i+'_fuel'));return {p,i,eto,act,diff:act!=null&&p.mreq!=null?act-p.mreq:null}})}
function ofpDivertPanel(o,LK){
  const on=!!ofpVal(o,'dv');const A=o.altWpts||[];const alt=(o.alternates||[])[0];
  if(!on)return LK?'':`<div class="panel"><div class="panel-head"><div><p class="label">Divert</p><p class="muted" style="margin:0">OFP obsahuje route to alternate ${esc(o.altn||'')}${alt?` · ${fmtN(alt.dist)} NM · ${esc(alt.time)} · FL ${esc(alt.fl)}`:''}${A.length?'':' (bez bodů trati)'}.</p></div>
    <button type="button" class="btn danger" data-act="ofp-divert" data-id="${esc(o.ofpId)}">DIVERT ${esc(o.altn||'')}</button></div></div>`;
  const rows=divRows(o);
  return `<div class="panel divert"><div class="panel-head"><div><p class="label">Divert – route to alternate</p><h2 class="mono">→ ${esc(divTo(o))}</h2></div>${LK?'':`<button type="button" class="btn sm" data-act="ofp-divert-undo" data-id="${esc(o.ofpId)}">Zrušit divert</button>`}</div>
    <div class="t4grid" style="max-width:520px;grid-template-columns:repeat(2,minmax(0,1fr))"><label class="fld"><span>Začátek divertu (UTC)</span><input type="text" class="t4 ofp-t" data-of="dv_start" value="${esc(ofpVal(o,'dv_start'))}" inputmode="numeric" maxlength="5" placeholder="––:––" ${LK?'disabled':''}></label>
      <label class="fld"><span>Letiště (jiné než ${esc(o.altn||'ALTN')}?)</span><input type="text" class="icao" data-of="dv_to" value="${esc(ofpVal(o,'dv_to'))}" maxlength="4" placeholder="${esc(o.altn||'')}" autocapitalize="characters" ${LK?'disabled':''}></label></div>
    <p class="muted" style="font-size:.86rem">ETO = začátek divertu + plánovaný čas z OFP, po vyplnění ATO od skutečného času. Přistání a palivo se zapisují dole jako obvykle; letiště přistání se do ATL přenese jako ${esc(divTo(o))}.</p>
    ${A.length?`<div class="scroll-x"><table class="plain ofplog"><thead><tr><th>WPT</th><th>AWY / FL</th><th class="r">Dist</th><th class="r">Čas</th><th class="r">ETO</th><th>ATO</th><th class="r">MREQ</th><th>Palivo ACT</th><th class="r">±</th><th>Poznámka</th></tr></thead><tbody>
    ${rows.map(({p,i,eto,diff})=>`<tr><td><b class="mono">${esc(p.wpt)}</b>${p.name?`<br><span class="muted" style="font-size:.78rem">${esc(p.name)}</span>`:''}</td><td class="mono">${esc(p.awy||'')}<br><span class="muted">${esc(p.fl||'')}</span></td>
      <td class="r mono">${p.distInt??''}<br><span class="muted">${p.distAcc??''}</span></td><td class="r mono">${esc(p.tAcc||'')}</td><td class="r mono"><b>${eto||'–'}</b></td>
      <td><input type="text" class="t4 ofp-t" data-of="a${i}_ato" value="${esc(ofpVal(o,'a'+i+'_ato'))}" inputmode="numeric" maxlength="5" placeholder="––:––" aria-label="ATO ${esc(p.wpt)}" ${LK?'disabled':''}></td>
      <td class="r mono">${fmtN(p.mreq)}</td><td><input type="text" class="ofp-n" data-of="a${i}_fuel" value="${esc(ofpVal(o,'a'+i+'_fuel'))}" inputmode="numeric" aria-label="Palivo ${esc(p.wpt)}" ${LK?'disabled':''}></td>
      <td class="r mono" style="color:${diff==null?'inherit':diff<0?'var(--warn)':'var(--ok)'}">${diff==null?'':(diff>0?'+':'')+fmtN(diff)}</td>
      <td><input type="text" class="ofp-note" data-of="a${i}_note" value="${esc(ofpVal(o,'a'+i+'_note'))}" aria-label="Poznámka ${esc(p.wpt)}" placeholder="FL / pozn." ${LK?'disabled':''}></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">OFP neobsahuje body trati k alternate.</p>'}</div>`;
}
function ofpMissing(o){
  const m=[];const v=k=>String(ofpVal(o,k)||'').trim();
  if(!o.signed)m.push('podpis velitele');if(!v('clr'))m.push('ATC clearance');if(!v('atisDep'))m.push('ATIS DEP');if(!v('atisArr'))m.push('ATIS ARR');
  if(!v('v1')||!v('vr')||!v('v2'))m.push('V1/VR/V2');if(!v('vref')||!v('vapp'))m.push('VREF/VAPP');
  if(!v('rg_lh')||!v('rg_rh'))m.push('kontrola výškoměrů on ground');
  if(!v('nonRvsm')&&(!v('re_lh')||!v('re_rh')))m.push('kontrola výškoměrů RVSM (nebo zaškrtnout let mimo RVSM)');
  const W=o.wpts||[];const skip=new Set();W.forEach((p,i)=>{if(!p.rvsm&&ofpVal(o,'w'+i+'_dct')){const a=num(ofpVal(o,'w'+i+'_dctFrom'));if(a!=null)for(let k=a+1;k<i;k++)skip.add(k)}});
  let ato=0,fu=0;W.forEach((p,i)=>{if(p.rvsm||skip.has(i)||i===0)return;if(parseHM(ofpVal(o,'w'+i+'_ato'))==null)ato++;if(num(ofpVal(o,'w'+i+'_fuel'))==null)fu++});
  if(ato)m.push(`ATO u ${ato} bodů`);if(fu)m.push(`palivo u ${fu} bodů`);
  if(v('dv')&&!v('dv_start'))m.push('začátek divertu');
  for(const x of ofpOver(o))m.push('nad limitem: '+x);
  return m;
}
function ofpClosePanel(o,u,atl){
  const l=o.leg;const lk=!!(o.closed||o.void);
  if(o.closed)return `<div class="panel"><div class="panel-head"><p class="label">Uzavřeno</p><span class="ann ok">${esc(o.closed.name)} · ${fmtTs(o.closed.at)}</span></div>${atl}
    ${o.missing&&o.missing.length?`<p class="muted">Při uzavření chybělo: ${esc(o.missing.join(', '))}</p>`:''}
    ${(can.amend(u,l||{pic:null})||has(u,'camo'))?`<div class="links"><button type="button" class="linkbtn" data-act="ofp-reopen" data-id="${esc(o.ofpId)}">Znovu otevřít OFP (oprava s důvodem)</button></div>`:''}</div>`;
  if(o.void)return '';
  if(!l)return `<div class="panel"><p class="label">Přenos do ATL</p><p class="muted">Podle tohoto OFP zatím nebyl zahájen let. Zahajte ho tlačítkem nahoře – pak půjde OFP uzavřít a údaje přenést do ATL.</p></div>`;
  if(l.state==='closed')return `<div class="panel"><p class="label">Z technického deníku</p>${atl}<div class="chips">${can.leg(u)?`<button class="btn primary" data-act="ofp-close" data-id="${esc(o.ofpId)}">${ICON.check}Uzavřít OFP</button>`:''}</div><p class="muted" style="font-size:.86rem">Let už je v ATL uzavřený, OFP se jen uzavře a zamkne.</p></div>`;
  const val=k=>ofpVal(o,k);const dep=num(l.fuelBlk);
  const pic=S.users[l.pic],sic=l.sic&&S.users[l.sic];
  return `<div class="panel"><p class="label">Přistání – údaje pro ATL</p>
    <div class="fgrid"><label class="fld"><span>Datum letu (UTC)</span><input type="text" class="t-date" data-of="x_cdate" value="${esc(val('x_cdate')||fmtDate(l.date))}" inputmode="numeric"></label></div>
    <p class="muted" style="font-size:.9rem">Odlet: off-block <b class="mono">${esc(val('x_out')||'–')}</b> · vzlet <b class="mono">${esc(val('x_off')||val('atd')||'–')}</b> <span style="font-size:.84rem">(vyplňuje se nahoře u navigačního logu)</span></p>
    <div class="t4grid">${XT.filter(([k])=>k==='on'||k==='in').map(([k,lb])=>`<label class="fld"><span>${lb}</span><input type="text" class="t4 ofp-t" data-of="x_${k}" value="${esc(val('x_'+k))}" inputmode="numeric" maxlength="5" placeholder="––:––"></label>`).join('')}</div>
    <div class="fgrid">
      <label class="fld"><span>Kam (při odklonu přepište)</span><input type="text" class="icao" data-of="x_cto" value="${esc(val('x_cto'))}" maxlength="4" placeholder="${esc(val('dv')?divTo(o):l.to)}" autocapitalize="characters"></label>
      <label class="fld"><span>Přistání (počet)</span><input type="text" data-of="x_ldg" value="${esc(val('x_ldg')||'1')}" inputmode="numeric"></label>
      <label class="fld"><span>Typ přiblížení</span><select data-of="x_app"><option value="">– vyberte –</option>${APPS.concat(['OTHER']).map(a=>`<option value="${a}" ${val('x_app')===a?'selected':''}>${a==='OTHER'?'Jiné…':a}</option>`).join('')}</select></label>
      <label class="fld"><span>Jiné přiblížení</span><input type="text" data-of="x_appOther" value="${esc(val('x_appOther'))}" placeholder="jen u Jiné" autocapitalize="characters"></label>
      ${sic?`<label class="fld"><span>Pilot Flying</span><select data-of="x_pf"><option value="">– vyberte –</option><option value="pic" ${val('x_pf')==='pic'?'selected':''}>${esc(pic?pic.name:'PIC')}</option><option value="sic" ${val('x_pf')==='sic'?'selected':''}>${esc(sic.name)}</option></select></label>`:''}
    </div>
    <div><p class="label">Palivo${dep!=null?` – na odlet ${fmtN(dep)} lbs, druhé pole se dopočítá`:''}</p><div class="fgrid">
      <label class="fld"><span>Po přistání (lbs)</span><input type="text" id="x-frem" data-of="x_fuelRem" data-pair="x-fburn" data-dep="${dep??''}" value="${esc(val('x_fuelRem'))}" inputmode="numeric"></label>
      <label class="fld"><span>Spáleno (lbs)</span><input type="text" id="x-fburn" data-of="x_fuelBurn" data-pair="x-frem" data-dep="${dep??''}" value="${esc(val('x_fuelBurn'))}" inputmode="numeric"></label>
      <label class="fld"><span>Olej doplněn L/P (qt)</span><input type="text" data-of="x_oil" value="${esc(val('x_oil'))}" placeholder="0 / 0"></label></div></div>
    <label class="fld"><span>Závada (prázdné = NIL)</span><textarea data-of="x_defText" placeholder="Jen pokud se během letu objevila závada">${esc(val('x_defText'))}</textarea></label>
    <div class="chips">${can.leg(u)?`<button class="btn primary big" data-act="ofp-close" data-id="${esc(o.ofpId)}">${ICON.check}Uzavřít OFP a přenést do ATL</button>`:''}</div>
    <p class="muted" style="font-size:.86rem">Jedním podpisem se uzavře OFP i let v ATL. Platí stejné kontroly jako při uzavření letu v deníku.</p></div>`;
}
function openOfpClose(id){
  ofpFlush();const o=ofpOf(id);if(!o)return;const l=o.leg;const miss=ofpMissing(o);const toAtl=!!(l&&l.state==='open');
  let preview='';
  if(toAtl){try{const r=readClose(xget(o),l);const p=r.items[0][1];
      preview=`<div class="statement">Do ATL se zapíše: <b class="mono">${esc(l.from)} → ${esc(p.to)}</b> · off ${esc(p.out)} · T/O ${esc(p.off)} · LDG ${esc(p.on)} · on ${esc(p.in)} · ${esc(p.ldg)} přist. ${esc(p.app)} · palivo po přistání ${fmtN(p.fuelRem)} lbs, spáleno ${fmtN(p.fuelBurn)} lbs${p.nil?' · závady NIL':' · se závadou'}</div>${(r.warn||[]).map(m=>`<div class="warnline caution">${esc(m)}</div>`).join('')}`}
    catch(e){openSheet('Nelze přenést do ATL',`<div class="warnline warn">${esc(e.message)}</div><p class="muted">Doplňte údaje v části „Přistání – údaje pro ATL“.</p>`,{focus:false});return}}
  openSheet(toAtl?'Uzavřít OFP a přenést do ATL':'Uzavřít OFP',`${preview}${miss.length?`<div class="warnline caution"><b>V OFP chybí:</b> ${esc(miss.join(', '))}. Uzavřít jde i tak – chybějící položky zůstanou zaznamenané.</div>`:'<div class="warnline info">OFP je kompletně vyplněný.</div>'}<p class="muted">Po uzavření se OFP zamkne. Opravit ho půjde jen znovuotevřením s důvodem.</p>`,{submit:toAtl?'Uzavřít a podepsat':'Uzavřít OFP',sign:true,onSubmit:async()=>{
    const items=[];if(toAtl){const r=readClose(xget(o),l);items.push(...r.items)}
    await checkPin();items.push(['ofp.close',Object.assign({ofpId:o.ofpId,legId:l?l.legId:null,toAtl,missing:miss},o.defs?{}:{defs:ofpDefsNow(o)})]);
    emit(items);closeSheet();toast(toAtl?'OFP uzavřen a let zapsán do ATL':'OFP uzavřen');
  }});
}
function startFromOfp(id){
  const o=ofpOf(id);if(!o)return;
  if(mode()==='crew'){
    if(BIND!==o.acId){BIND=o.acId;store.set('etl.bind',BIND)}
    const keep=UI.draft.who;UI.draft={who:keep,ofpId:o.ofpId,fno:o.flt,to:o.des,fuelMin:o.fuel.rampMreq!=null?String(o.fuel.rampMreq):''};
    const cur=curFrom(S.ac[o.acId]);if(o.dep&&o.dep!==cur){UI.draft.from=o.dep;UI.draft.fromEdit=true}
    if(o.date!==todayISO()){UI.draft.date=fmtDate(o.date);UI.draft.dateEdit=true}
    saveDraft();closeSheet();UI.crewView='today';render();setTimeout(()=>{const c=document.querySelector('.step.next');if(c)c.scrollIntoView({block:'start',behavior:'smooth'})},40);
  }else{UI.acId=o.acId;closeSheet();render();openStartFlight(o.ofpId)}
}

/* --- audit --- */
function evAc(e){const p=e.p||{};if(p.acId)return p.acId;if(p.legId&&S.legs[p.legId])return S.legs[p.legId].acId;if(p.defId&&S.defects[p.defId])return S.defects[p.defId].acId;return null}
function evText(e){
  const p=e.p||{};const ac=S.ac[evAc(e)];const reg=ac?ac.reg+' · ':'';
  switch(e.type){
    case 'sec.sign':return `${reg}Security ${esc(p.from)} ${esc(p.time)}Z – ${p.result==='FOUND'?'NÁLEZ: '+esc(p.notes):p.result==='NA'?'nebylo nutné, letadlo pod dohledem':'bez nálezu'}`;
    case 'leg.open':return `${reg}Před odletem ${esc(p.from)}→${esc(p.to)} ${fmtDate(p.date)} – bezpečnostní prohlídka ${esc(p.sec&&p.sec.time)}Z${p.sec&&p.sec.result==='FOUND'?' (NÁLEZ)':''} podepsána`;
    case 'leg.sign':return `${reg}Let ${esc(p.from)}–${esc(p.to)} ${fmtDate(p.date)} podepsán${p.paper?' (zpětně z papíru)':''}`;
    case 'leg.amend':return `${reg}Oprava letu – ${esc(Object.keys(p.changes||{}).join(', '))}. Důvod: ${esc(p.reason)}`;
    case 'leg.void':return `${reg}Let zneplatněn. Důvod: ${esc(p.reason)}`;
    case 'defect.report':return `${reg}${p.src==='paper'?'Závada převzata z papírového deníku'+(p.paperPage?' (str. '+esc(p.paperPage)+')':''):'Závada zapsána'}: ${esc(p.text)}`;
    case 'defect.defer':return `${reg}Závada odložena dle MEL ${esc(p.melItem)} kat. ${esc(p.cat)} do ${fmtDate(p.due)}`;
    case 'defect.rectify':return `${reg}Závada odstraněna, CRS – ${esc(p.action)}`;
    case 'crs.issue':return `${reg}CRS vydáno, WO ${esc(p.wo||'–')} – ${esc(crsTitle(p))}`;
    case 'ac.ground':return `${reg}Letadlo uzemněno: ${esc(p.reason)}`;
    case 'daily.sign':return `${reg}${esc(DAILY[p.kind]||p.kind)} ${fmtDate(p.date)} podepsána`;
    case 'ac.upsert':return p.live&&!p.reg?`Letadlo ${esc((S.ac[p.acId]||{}).reg||'')} uvedeno do elektronického deníku – počáteční stav potvrzen`:`Letadlo ${esc(p.reg||(S.ac[p.acId]||{}).reg||'')} – údaje uloženy`;
    case 'ofp.import':return `${reg}OFP ${esc(p.data&&p.data.flt)} ${esc(p.data&&p.data.dep)}→${esc(p.data&&p.data.des)} ${fmtDate(p.data&&p.data.date)} nahráno (${esc(p.ofpId)})`;
    case 'ofp.fill':return `${reg}OFP ${esc(p.ofpId)} – vyplněno: ${esc(Object.keys(p.data||{}).join(', '))}`;
    case 'ofp.sign':return `${reg}OFP ${esc(p.ofpId)} podepsán velitelem`;
    case 'ofp.void':return `${reg}OFP ${esc(p.ofpId)} zrušen: ${esc(p.reason)}`;
    case 'ofp.close':return `${reg}OFP ${esc(p.ofpId)} uzavřen${p.toAtl?' a přenesen do ATL':''}${p.missing&&p.missing.length?' – chybělo: '+esc(p.missing.join(', ')):''}`;
    case 'ofp.reopen':return `${reg}OFP ${esc(p.ofpId)} znovu otevřen: ${esc(p.reason)}`;
    case 'cfg.set':return `Nastavení provozovatele změněno – pravidla ${esc(FTL_RULES[p.ftlRules]||p.ftlRules||'')}${p.omRef?', '+esc(p.omRef):''}, základny ${esc((p.bases||[]).join(', '))}`;
    case 'user.upsert':return `Uživatel ${esc(p.name||(S.users[p.userId]||{}).name||'')} – údaje uloženy`;
  }
  return esc(e.type);
}
function viewAudit(ac){
  const list=[...S.list].reverse().filter(e=>UI.auditAll||evAc(e)===ac.acId).slice(0,300);
  return `<div class="panel"><div class="panel-head"><div><p class="label">Neměnný záznam všech podpisů</p><h2>Audit trail</h2></div><label class="check"><input type="checkbox" id="audit-all" ${UI.auditAll?'checked':''}> Všechna letadla a správa</label></div>
  <p class="muted">Záznamy se nikdy nepřepisují. Oprava letu je nový záznam s důvodem, původní hodnota zůstává v historii.</p>
  <div>${list.map(e=>`<div class="ev"><span class="t">${fmtTs(e.at)}<br>${esc(e.dev)}</span><div><div>${evText(e)}</div><div class="muted" style="font-size:.84rem">${esc(e.bn)}</div></div><span>${S.out.has(e.id)?'<span class="ann caution">čeká</span>':'<span class="ann ok">na serveru</span>'}</span></div>`).join('')||'<p class="muted">Žádné záznamy.</p>'}</div></div>`;
}

/* --- admin --- */
function viewAdmin(u){
  const acs=Object.values(S.ac).sort((a,b)=>String(a.reg).localeCompare(String(b.reg)));
  const users=Object.values(S.users).sort((a,b)=>a.name.localeCompare(b.name));
  const c=S.cfg;
  const rules=(c.ofpRules||[]).filter(r=>r&&OFP_FL[r.k]);
  const rulesPanel=`<div class="panel"><div class="panel-head"><div><p class="label">OFP – předvyplnění a limity</p><h2>${rules.length} ${rules.length===1?'pravidlo':rules.length>1&&rules.length<5?'pravidla':'pravidel'}</h2></div>${can.settings(u)?`<button class="btn sm" data-act="ofp-rules">Upravit</button>`:''}</div>
    ${rules.length?`<div class="scroll-x"><table class="plain"><thead><tr><th>Pole</th><th>Typ letadla</th><th>Předvyplnit</th><th>Max</th></tr></thead><tbody>${rules.map(r=>`<tr><td>${esc(OFP_FL[r.k][1])}</td><td>${esc(r.type||'všechny')}</td><td class="mono">${esc(r.def||'–')}</td><td class="mono">${r.max?fmtN(num(r.max)):'–'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Žádná pravidla.</p>'}
    <p class="muted" style="font-size:.86rem">Předvyplněné hodnoty se uloží do OFP při nahrání – pozdější změna nastavení už nahraná OFP nezmění. Max vzletová a přistávací hmotnost se navíc hlídá podle limitů v OFP.</p></div>`;
  return rulesPanel+`<div class="panel"><div class="panel-head"><div><p class="label">Nastavení provozovatele</p><h2>${esc(c.opName)} · ${esc(c.aoc)}</h2></div>${can.settings(u)?`<button class="btn sm" data-act="settings-form">Upravit nastavení</button>`:'<span class="muted">Mění jen správce</span>'}</div>
    <dl class="kvgrid"><dt>Domovské základny</dt><dd class="mono">${(c.bases||[]).map(esc).join(', ')||'–'}</dd>
    <dt>Doba letu a služby</dt><dd>${esc(FTL_BY[c.ftlBy]||c.ftlBy)}</dd>
    <dt>Pravidla</dt><dd>${esc(FTL_RULES[c.ftlRules]||c.ftlRules)}${c.omRef?` · <b>${esc(c.omRef)}</b>`:' · <span style="color:var(--caution)">chybí odkaz na OM</span>'}</dd>
    <dt>Nástup / ukončení</dt><dd>${esc(c.reportMin)} min před 1. off-blockem · ${esc(c.postMin)} min po posledním on-blocku</dd>
    <dt>Split duty</dt><dd>${c.splitDuty?'povolena dle OM':'nepoužívá se'}</dd>
    <dt>Číslování stránek</dt><dd>${esc(PAGE_FMT[c.pageFmt||'seq'])}</dd>
    <dt>Rychlé volby CRS</dt><dd>${(c.crsQuick||[]).length?(c.crsQuick||[]).map(esc).join(' · '):'žádné'}</dd></dl></div>
  <div class="two">
  <div class="panel"><div class="panel-head"><h2>Letadla</h2><button class="btn sm" data-act="ac-form">${ICON.plus}Přidat</button></div>
    <div class="scroll-x"><table class="plain"><thead><tr><th>Registrace</th><th>Typ</th><th>První str.</th><th class="r">TTAF</th><th></th></tr></thead><tbody>${acs.map(a=>`<tr><td class="mono">${esc(a.reg)}${a.archived?' <span class="ann mute">archiv</span>':!a.isLive?' <span class="ann caution">nastavuje se</span>':''}</td><td>${esc(a.type||'–')}</td><td class="mono">${esc(a.startPage)}</td><td class="r mono">${hm(a.air)}</td><td><button class="btn sm" data-act="ac-form" data-id="${esc(a.acId)}">Upravit</button></td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><div class="panel-head"><h2>Uživatelé</h2><button class="btn sm" data-act="user-form">${ICON.plus}Přidat</button></div>
    <div class="scroll-x"><table class="plain"><thead><tr><th>Jméno</th><th>Role</th><th>Licence / web</th><th></th></tr></thead><tbody>${users.map(x=>`<tr><td>${esc(x.name)}${x.active===false?' <span class="ann mute">neaktivní</span>':''}</td><td>${x.roles.map(r=>ROLE[r]).join(', ')}</td><td class="mono">${esc(x.licence||'–')}${x.email?`<br><span class="muted" style="font-size:.84rem">web: ${esc(x.email)}</span>`:''}</td><td><button class="btn sm" data-act="user-form" data-id="${esc(x.userId)}">Upravit</button></td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><h2>Záloha a obnova</h2>
    <p class="muted">Data leží ve sdílené databázi a zároveň v každém zařízení, které deník otevřelo. Úplná záloha je celý log podpisů – z něj se dá cokoliv obnovit.</p>
    <div class="chips"><button class="btn" data-act="export-json">Stáhnout úplnou zálohu (JSON)</button><button class="btn" data-act="export-legs">Lety vybraného letadla (CSV)</button></div>
    <label class="fld"><span>Obnovit ze zálohy</span><input type="file" id="import-file" accept=".json,application/json"></label>
    <p class="muted" style="font-size:.86rem">Obnova jen doplní záznamy, které chybí. Nic nepřepíše ani nesmaže.</p></div>
  <div class="panel"><h2>Synchronizace tohoto zařízení</h2>${syncDetails()}</div>
  </div>`;
}
function syncDetails(){
  const s=syncInfo();
  return `<dl class="kvgrid"><dt>Stav</dt><dd><span class="dot ${s.cls}" style="display:inline-block"></span> ${esc(s.t)}</dd>
    <dt>Spuštění bez signálu</dt><dd>${isIOS&&!standalone()?'<span style="color:var(--warn)">ne – otevřeno v Safari, použijte ikonu na ploše</span>':off.ready?'<span style="color:var(--ok)">připraveno</span> · verze '+esc(window.ETL_VERSION||''):off.ready===false?'<span style="color:var(--caution)">nepřipraveno</span> – '+esc(off.missing.join(', ')):'ověřuji…'}</dd>
    <dt>Účet zařízení</dt><dd>${esc(net.email||'–')}</dd>
    <dt>Zařízení</dt><dd class="mono">${esc(DEV)}</dd>
    <dt>Záznamů v zařízení</dt><dd class="mono">${Object.keys(EV).length}</dd>
    <dt>Čeká na odeslání</dt><dd class="mono">${OUT.length}</dd>
    <dt>Poslední spojení</dt><dd>${net.last?fmtClock(net.last):'–'}</dd>
    ${net.err?`<dt>Chyba</dt><dd style="color:var(--warn)">${esc(net.err)}</dd>`:''}</dl>
    <label class="check"><input type="checkbox" id="simoff" ${SIMOFF?'checked':''}> <span><b>Simulovat výpadek sítě</b><br><span class="muted">Zápisy zůstanou v zařízení a odešlou se po vypnutí simulace. Pro skutečný test stačí zapnout režim letadlo.</span></span></label>
    <div class="chips"><button class="btn sm" data-act="ho">⇄ Předat / převzít – druhý iPad</button><button class="btn sm" data-act="sync-now" ${(!db||SIMOFF)?'disabled':''}>Synchronizovat teď</button>${db&&net.email&&net.state!=='auth'?`<button class="btn sm" data-act="dev-logout">Odhlásit zařízení</button>`:''}${db&&net.state==='auth'?`<button class="btn sm primary" data-act="dev-login">Přihlásit zařízení</button>`:''}</div>
    <p class="mode-note">Verze aplikace ${esc(window.ETL_VERSION||'')}</p>
    ${BIND&&S.ac[BIND]?`<p class="mode-note">Na tomto zařízení je naposledy zvolené letadlo <b class="mono">${esc(S.ac[BIND].reg)}</b>.</p>`:''}`;
}

/* ---------- crew mode: iPad in the aircraft ---------- */
function curFrom(ac){return String(UI.draft.from||(ac.pendingSec&&ac.pendingSec.from)||(ac.lastLeg&&ac.lastLeg.to)||'').toUpperCase()}
function whoId(){return UI.draft.who==='sic'&&CREW.sic?CREW.sic:CREW.pic}
function recentAirports(ac,from){const seen=[];for(const l of [...ac.legs].reverse()){if(l.void)continue;for(const a of [l.to,l.from]){if(a&&a!==from&&!seen.includes(a))seen.push(a)}if(seen.length>=5)break}return seen.slice(0,5)}
function online(){return !!db&&!SIMOFF&&navigator.onLine!==false}

function renderPicker(){
  const list=S.liveList;
  return `<div class="wrap"><div class="crew">
    <div><p class="label">${S.cfg.opName?esc(S.cfg.opName)+' · ':''}eTechLog</p><h1>Které letadlo?</h1><p class="muted" style="margin-top:6px">iPad si volbu zapamatuje – příště se otevře rovnou. Změnit jde kdykoli nahoře u registrace.</p></div>
    ${list.length?`<div class="fleet" style="padding:0">${list.map(a=>`<button class="ac-card" data-act="pick-crew-ac" data-id="${esc(a.acId)}">
      <div class="row"><span class="ac-reg">${esc(a.reg)}</span><span class="ann ${a.status}">${STATUS_LABEL[a.status]}</span></div>
      <div class="ac-meta"><span>${esc(a.type||'–')}</span>${a.lastLeg?`<span>Stojí v <b>${esc(a.lastLeg.to)}</b>${isBase(a.lastLeg.to)?' · základna':''}</span>`:''}</div>
      ${a.openLeg?`<div class="ac-meta"><span class="ann info">Let probíhá</span><span><b>${esc(a.openLeg.from)}→${esc(a.openLeg.to)}</b></span></div>`:''}
    </button>`).join('')}</div>`:`<div class="empty"><h2>Deník se teprve nastavuje</h2><p>${S.acList.length?'Správce ještě nepotvrdil počáteční stav letadel z papírového deníku.':'V deníku zatím není žádné letadlo.'} Úvodní nastavení dokončí správce nebo CAMO v Kanceláři.</p></div>`}
    <div class="links"><button class="linkbtn" data-act="office-on">Kancelář – CAMO, mechanik, správce</button></div>
  </div></div>`;
}
function renderCrew(){
  const ac=S.ac[BIND];
  if(!ac||ac.archived||!ac.isLive)return renderPicker();
  UI.acId=BIND;
  if(!crewValid())return renderCrewStart(ac);
  if(UI.crewView!=='today'){
    const u=me();
    return `<div class="wrap view"><div class="chips"><button class="btn" data-act="crew-view" data-id="today">‹ Zpět na dnešek</button><button class="btn" data-act="ho">⇄ Druhý iPad</button></div>${UI.crewView==='log'?viewLog(ac,u):UI.crewView==='search'?viewSearch(ac):UI.crewView==='ofp'?((UI.ofpId&&ofpOf(UI.ofpId))?`<div class="chips"><button class="btn" data-act="ofp-back">‹ Seznam OFP</button></div>${viewOfp(ofpOf(UI.ofpId),u)}`:viewOfpList(ac)):viewDefects(ac,u)}</div>`;
  }
  return crewToday(ac);
}
function crewHead(ac){
  const lbl=ac.status==='ok'?'Provozuschopné':ac.status==='caution'?`Odklady MEL: ${ac.deferred.length}`:'Neprovozuschopné';
  return `<div class="crew-head"><div><span class="reg-big">${esc(ac.reg)}</span> <span class="muted">${esc(ac.type||'')}</span> <button type="button" class="linkbtn" data-act="change-ac" style="display:inline;min-height:0;padding:0 0 0 8px">změnit letadlo</button> <button type="button" class="linkbtn" data-act="ho" style="display:inline;min-height:0;padding:0 0 0 8px">⇄ druhý iPad</button></div><button class="ann lg ${ac.status}" data-act="crew-view" data-id="defects">${lbl} ›</button></div>${ac.status==='warn'?statusNote(ac):''}`;
}
function briefing(ac){
  const it=[];
  if(ac.grounded)it.push(`<li class="b-warn"><b>Uzemněno:</b> ${esc(ac.grounded.reason)}</li>`);
  (ac.openLegs||[]).forEach(l=>it.push(`<li class="b-caution"><b>Neukončený let:</b> <span class="mono">${esc(l.from)} → ${esc(l.to)}</span>, zahájen ${fmtDate(l.date)} ${hmOfIso(l.opened.at)}Z (${esc(l.opened.name)}) – po přihlášení ho uzavřete nebo zrušte</li>`));
  ac.open.forEach(d=>it.push(`<li class="b-warn"><b>Otevřená závada:</b> ${esc(d.text)}</li>`));
  ac.deferred.forEach(d=>{const left=daysBetween(todayISO(),d.deferral.due);it.push(`<li class="b-caution"><b>MEL ${esc(d.deferral.melItem)} kat. ${esc(d.deferral.cat)}:</b> ${esc(d.text)} – ${left<0?'odklad prošlý':'platí ještě '+left+' d'}${d.deferral.rem?' · '+esc(d.deferral.rem):''}</li>`)});
  return `<div class="panel"><p class="label">Stav letadla</p>${it.length?`<ul class="brief">${it.join('')}</ul>`:'<p>Bez otevřených závad a odkladů.</p>'}<p class="muted">${ac.lastLeg?`Stojí v <b class="mono">${esc(ac.lastLeg.to)}</b> ${isBase(ac.lastLeg.to)?'<span class="ann ok">základna</span>':'<span class="ann mute">mimo základnu</span>'}`:'Zatím bez letu'} · TTAF <span class="mono">${hm(ac.air)}</span> · ${ac.cyc} cyklů</p></div>`;
}
function renderCrewStart(ac){
  const crew=Object.values(S.users).filter(x=>x.active!==false&&has(x,'crew')).sort((a,b)=>a.name.localeCompare(b.name));
  const p=UI.startPic&&S.users[UI.startPic]?UI.startPic:null,s=UI.startSic;
  return `<div class="wrap"><div class="crew">
    ${crewHead(ac)}${briefing(ac)}
    <form class="step next" id="start-form" data-keep novalidate>
      <h2>Kdo dnes letí?</h2>
      <div><p class="label">Kapitán (PIC)</p><div class="pick">${crew.map(x=>`<button type="button" class="user-btn ${p===x.userId?'sel':''}" data-act="start-pic" data-id="${esc(x.userId)}"><b>${esc(x.name)}</b></button>`).join('')}</div></div>
      ${p?`<div><p class="label">Druhý pilot</p><div class="pick">${crew.filter(x=>x.userId!==p).map(x=>`<button type="button" class="user-btn ${s===x.userId?'sel':''}" data-act="start-sic" data-id="${esc(x.userId)}"><b>${esc(x.name)}</b></button>`).join('')}<button type="button" class="user-btn ${s==='-'?'sel':''}" data-act="start-sic" data-id="-"><b>Bez druhého pilota</b></button></div></div>
      <label class="fld"><span>PIN – ${esc(S.users[p].name)} (jen jednou za den)</span><input type="password" id="st-pin" class="big-in" inputmode="numeric" autocomplete="off"></label>
      <p class="form-err" id="st-err" hidden></p>
      <button type="submit" class="btn big primary">Začít den</button>`:''}
    </form>
    ${testPins()}
    <div class="links"><button class="linkbtn" data-act="office-on">Kancelář – CAMO, mechanik, správce</button></div>
  </div></div>`;
}
function whoSeg(){
  const sic=CREW.sic&&S.users[CREW.sic];if(!sic)return '';const w=UI.draft.who==='sic'?'sic':'pic';
  return `<div class="who-row"><span class="label">Provedl</span><div class="seg"><button type="button" class="${w==='pic'?'on':''}" data-act="who" data-id="pic">${esc(S.users[CREW.pic].name)}</button><button type="button" class="${w==='sic'?'on':''}" data-act="who" data-id="sic">${esc(sic.name)}</button></div></div>`;
}
function crewToday(ac){
  const today=todayISO();const d=UI.draft;
  const items=[];
  (S.daily[ac.acId+'|'+today]||[]).forEach(x=>items.push({t:x.at,k:'daily',x}));
  ac.secs.filter(x=>x.at.slice(0,10)===today).forEach(x=>items.push({t:x.at,k:'sec',x}));
  ac.legs.filter(l=>l.date===today&&l.state!=='open').forEach(l=>items.push({t:legDepIso(l),k:'leg',x:l}));
  items.sort((a,b)=>a.t<b.t?-1:1);
  const sent=(ev,okTxt)=>S.out.has(ev)?'<span class="sync-s wait">čeká na signál</span>':`<span class="sync-s ok">${okTxt||'odesláno'}</span>`;
  const row=it=>{
    const x=it.x;
    if(it.k==='daily')return `<div class="tl-row"><span class="tl-time">${hmOfIso(x.at)}Z</span><span class="tl-ico">${ICON.check}</span><div class="tl-main"><b>${esc(DAILY[x.kind]||x.kind)}</b><span class="tl-sub">${esc(x.name)}</span></div><div class="tl-end">${sent(x.ev)}</div></div>`;
    if(it.k==='sec'){const f=x.result==='FOUND';return `<div class="tl-row"><span class="tl-time">${esc(x.time)}Z</span><span class="tl-ico ${f?'warn':''}">${f?ICON.alert:ICON.check}</span><div class="tl-main"><b>Security <span class="mono">${esc(x.from)}</span></b><span class="tl-sub">${f?'Nález: '+esc(x.notes):x.result==='NA'?'Nebylo nutné – letadlo pod dohledem':'Bez nálezu'} · ${esc(x.name)}</span></div><div class="tl-end">${sent(x.ev,'firma vidí')}</div></div>`}
    const defs=ac.defects.filter(df=>df.legId===x.legId);
    return `<div class="tl-row"><span class="tl-time">${esc(x.out)}Z</span><span class="tl-ico ${defs.some(df=>df.status==='open')?'warn':''}">${ICON.check}</span><div class="tl-main" style="${x.void?'text-decoration:line-through;color:var(--muted)':''}"><span class="route">${esc(x.from)} → ${esc(x.to)}</span><span class="tl-sub">Off ${esc(x.out)} · T/O ${esc(x.off)} · LDG ${esc(x.on)} · On ${esc(x.in)}</span><span class="tl-sub">Let ${hm(x.air)} · blok ${hm(x.block)} · ${esc(x.ldg)} přist.${x.app?' '+esc(x.app):''} · palivo ${fuelTxt(x)} · str. ${x.page}${defs.length?' · závady: '+defs.map(df=>esc(df.text)).join(', '):''}</span></div><div class="tl-end">${sent(x.ev)}<button type="button" class="btn sm" data-act="leg-detail" data-id="${esc(x.legId)}">Detail</button></div></div>`;
  };
  const from=curFrom(ac);
  const tgt=targetOpen(ac);
  const pl=tgt?[]:plannedOfps(ac);
  const plannedHtml=tgt?'':`<div class="panel"><div class="panel-head"><p class="label">Plánované lety z OFP</p><button class="btn sm" data-act="ofp-pick">${ICON.plus}Nahrát OFP (PDF)</button></div><input type="file" id="ofp-file" accept="application/pdf,.pdf" hidden>
    ${pl.length?`<div class="sres">${pl.map(o=>`<div class="planned"><div><b class="mono">${esc(o.flt)} · ${esc(o.dep)} → ${esc(o.des)}</b><div class="muted" style="font-size:.88rem">${fmtDate(o.date)} · STD ${esc(o.std)}Z · MREQ ${fmtN(o.fuel.rampMreq)} lbs · plán ${fmtN(o.fuel.rampEst)} lbs</div></div><div class="chips"><button class="btn sm" data-act="ofp-open" data-id="${esc(o.ofpId)}">OFP</button><button class="btn sm ${UI.draft.ofpId===o.ofpId?'':'primary'}" data-act="ofp-start" data-id="${esc(o.ofpId)}">${UI.draft.ofpId===o.ofpId?'Vybráno':'Začít tento let'}</button></div></div>`).join('')}</div>`:'<p class="muted">Žádné plánované lety. Nahrajte PDF z NAVsystemu, nebo zapište let ručně níže.</p>'}</div>`;
  const cards=[tgt?(n=>cardClose(ac,n)):(n=>cardStart(ac,from,n))];
  const dn=new Date();
  return `<div class="wrap"><div class="crew">
    ${crewHead(ac)}
    <div class="daybar"><span>${DAYS[dn.getUTCDay()]} ${fmtDate(today)} · časy UTC</span><span class="chips"><button class="btn sm" data-act="crew-view" data-id="log">Stránka deníku</button><button class="btn sm" data-act="crew-view" data-id="defects">Závady</button><button class="btn sm" data-act="crew-view" data-id="ofp">OFP</button><button class="btn sm" data-act="crew-view" data-id="search">Hledat</button></span></div>
    ${(ac.openLegs||[]).length>1?unfinishedBlock(ac,false):''}
    ${items.length?`<div class="tl">${items.map(row).join('')}</div>`:''}
    ${plannedHtml}
    ${cards.map((c,i)=>c(i===0)).join('')}
  </div></div>`;
}
function hmOfIso(iso){const t=new Date(iso);return pad(t.getUTCHours())+':'+pad(t.getUTCMinutes())}
function num(x){const t=String(x==null?'':x).replace(/[\s\u00a0\u2009]/g,'');return /^\d+$/.test(t)?parseInt(t,10):null}
function fmtN(n){return n==null||n===''||isNaN(Number(n))?'–':Number(n).toLocaleString('cs-CZ')}
function readFuel(get){
  const up=num(get('fuelUp')),dep=num(get('fuelBlk')),min=num(get('fuelMin'));
  if(up==null)fail('Doplňte, kolik paliva bylo natankováno, v litrech (0, pokud se netankovalo).');
  if(dep==null||dep<=0)fail('Doplňte palivo na odlet v lbs.');
  if(min==null||min<=0)fail('Doplňte minimum required fuel v lbs.');
  if(up>20000)fail('Natankované množství je moc vysoké – zadává se v litrech.');
  if(dep<min)fail(`Palivo na odlet (${fmtN(dep)} lbs) je nižší než minimum required (${fmtN(min)} lbs).`);
  return {fuelUp:up,fuelBlk:dep,fuelMin:min};
}
function fuelTxt(l){if(l.fuelBlk==null&&(l.fuelUp==null||l.fuelUp===''))return '–';return `+${fmtN(l.fuelUp)} L · odlet ${fmtN(l.fuelBlk)} lbs${l.fuelMin?' · min '+fmtN(l.fuelMin)+' lbs':''}${l.fuelRem!=null&&l.fuelRem!==''?' · přist. '+fmtN(l.fuelRem)+' lbs':''}${l.fuelBurn!=null?' · spáleno '+fmtN(l.fuelBurn)+' lbs':''}`}
// landing fuel and burn: typing one fills the other from fuel on departure
function landFuelFields(l,pre,get,draft){
  const dep=num(l.fuelBlk);const a=(k,id,pair,label)=>`<label class="fld"><span>${label}</span><input type="text" class="big-in" id="${pre}${id}" ${draft?`data-k="${k}"`:''} data-pair="${pre}${pair}" data-dep="${dep==null?'':dep}" value="${esc(get(k)==null?'':get(k))}" inputmode="numeric"></label>`;
  return `<div><p class="label">Palivo${dep!=null?` – na odlet ${fmtN(dep)} lbs, druhé pole se dopočítá samo`:''}</p><div class="fgrid">${a('fuelRem','frem','fburn','Po přistání (lbs)')}${a('fuelBurn','fburn','frem','Spáleno (lbs)')}</div></div>`;
}
function readLandFuel(get,l){
  const dep=num(l.fuelBlk);let rem=num(get('fuelRem')),burn=num(get('fuelBurn'));
  if(rem==null&&burn==null)fail('Doplňte palivo po přistání nebo spálené palivo (lbs).');
  if(dep!=null){if(rem==null)rem=dep-burn;if(burn==null)burn=dep-rem}
  else if(rem==null||burn==null)fail('Doplňte palivo po přistání i spálené palivo (lbs).');
  if(rem<0)fail('Palivo po přistání nemůže být záporné – zkontrolujte spálené palivo.');
  if(dep!=null&&rem>dep)fail(`Palivo po přistání (${fmtN(rem)} lbs) je vyšší než palivo na odlet (${fmtN(dep)} lbs).`);
  if(burn<=0)fail('Spálené palivo musí být větší než 0 – zkontrolujte palivo po přistání.');
  return {fuelRem:rem,fuelBurn:burn};
}
function fuelFields(get,draft){
  const f=(k,id,label,ph)=>`<label class="fld"><span>${label}</span><input type="text" ${draft?`class="big-in" data-k="${k}"`:`id="${id}"`} value="${esc(get(k)==null?'':get(k))}" inputmode="numeric" placeholder="${ph}"></label>`;
  return `<div><p class="label">Palivo</p><div class="fgrid">${f('fuelUp','f-fuelup','Natankováno (L)','0')}${f('fuelBlk','f-fuelblk','Na odlet (lbs)','')}${f('fuelMin','f-fuelmin','Min. required (lbs)','')}</div></div>`;
}
const APPS=['VIS','ILS','VOR','CAT II','RNP'];
function readApp(get){const a=get('app');if(!a)fail('Vyberte typ přiblížení.');if(a==='OTHER'){const o=String(get('appOther')||'').trim().toUpperCase();if(o.length<2)fail('Napište typ přiblížení (např. LOC, NDB, RNP AR).');return o}return a}
function appField(cur,other,draft){
  const isOther=cur==='OTHER'||(cur&&!APPS.includes(cur));
  const name=draft?'c-app':'s-app';
  return `<div><p class="label">Typ přiblížení</p><div class="tiles app-tiles">${APPS.concat(['OTHER']).map(a=>`<label class="tile"><input type="radio" name="${name}" value="${a}" ${(a==='OTHER'?isOther:cur===a)?'checked':''} ${draft?'data-k="app"':''}>${a==='OTHER'?'Jiné':a}</label>`).join('')}</div>
    <label class="fld" ${isOther?'':'hidden'} id="${name}-other"><span>Jaké přiblížení</span><input type="text" ${draft?'data-k="appOther"':'id="f-appother"'} value="${esc(isOther&&cur!=='OTHER'?cur:(other||''))}" autocapitalize="characters" placeholder="např. LOC, NDB, RNP AR"></label></div>`;
}
// a leg may not overlap another flown leg of the same aircraft; a newly closed leg may not depart before the last on-block
function checkTimes(acId,legId,c,afterLast){
  const ac=S.ac[acId];if(!ac)return;
  const dep=legDepIso(c),arr=legArrIso(c);
  const others=ac.legs.filter(x=>x.legId!==legId&&!x.void&&x.state!=='open');
  for(const x of others){if(dep<legArrIso(x)&&legDepIso(x)<arr)fail(`Časy se překrývají s letem ${x.from} → ${x.to} (${fmtDate(x.date)}, off-block ${x.out} – on-block ${x.in}). Zkontrolujte časy nebo datum.`)}
  if(arr>new Date(Date.now()+10*60e3).toISOString())fail(`On-block ${c.in}Z je v budoucnosti – zkontrolujte čas nebo datum letu.`);
  // a flight that lies wholly before the latest logged flight is allowed (late entry) – only flagged so a wrong date is noticed
  const warns=[];
  if(afterLast){let lx=null;for(const x of others){if(!lx||legArrIso(x)>legArrIso(lx))lx=x}
    if(lx&&dep<legArrIso(lx))warns.push(`Let je časově před posledním zapsaným letem ${lx.from} → ${lx.to} (${fmtDate(lx.date)} ${lx.in}Z) a zařadí se do deníku před něj. Pokud to nesedí, zkontrolujte datum.`)}
  return warns;
}
function pfSeg(l,cur,draft){
  const p=S.users[l.pic],sc=l.sic&&S.users[l.sic];if(!sc)return '';
  if(draft)return `<div class="who-row"><span class="label">Pilot Flying</span><div class="seg"><button type="button" class="${cur==='pic'?'on':''}" data-act="pf" data-id="pic">${esc(p?p.name:'PIC')}</button><button type="button" class="${cur==='sic'?'on':''}" data-act="pf" data-id="sic">${esc(sc.name)}</button></div><span class="muted" style="font-size:.85rem">druhý je PM</span></div>`;
  return `<div><p class="label">Pilot Flying (druhý je PM)</p><div class="tiles"><label class="tile"><input type="radio" name="s-pf" value="pic">${esc(p?p.name:'PIC')}</label><label class="tile"><input type="radio" name="s-pf" value="sic">${esc(sc.name)}</label></div></div>`;
}
function targetOpen(ac){const sel=UI.closeLeg&&S.legs[UI.closeLeg];if(sel&&sel.acId===ac.acId&&sel.state==='open'&&!sel.void)return sel;return ac.openLeg}
function ageH(l){return (Date.now()-new Date(l.opened?l.opened.at:legAt(l)).getTime())/36e5}
function unfinishedBlock(ac,withBtn){
  const ol=ac.openLegs||[];if(!ol.length)return '';
  return `<div class="unfinished"><b>${ol.length===1?'Neukončený let':'Neukončené lety ('+ol.length+')'}</b>${ol.map(l=>{const h=ageH(l);return `<div class="item"><span><span class="mono"><b>${esc(l.from)} → ${esc(l.to)}</b></span> · zahájen ${fmtDate(l.date)} ${hmOfIso(l.opened.at)}Z · ${esc(l.opened.name)}${h>12?` · <b style="color:var(--warn)">otevřený ${Math.floor(h)} h</b>`:''}</span>${withBtn||ol.length>1?`<button type="button" class="btn sm primary" data-act="complete-leg" data-id="${esc(l.legId)}">Uzavřít let</button>`:''}</div>`}).join('')}</div>`;
}
function secTiles(name,cur,draft){const dk=draft?' data-k="secRes"':'';return `<div class="tiles">
  <label class="tile"><input type="radio" name="${name}" value="NIL" ${cur==='NIL'?'checked':''}${dk}>Provedena, bez nálezu</label>
  <label class="tile"><input type="radio" name="${name}" value="NA" ${cur==='NA'?'checked':''}${dk}>Nebylo nutné – letadlo pod dohledem</label>
  <label class="tile found"><input type="radio" name="${name}" value="FOUND" ${cur==='FOUND'?'checked':''}${dk}>Nález – nahlášeno</label></div>`}
const TIMES=[['out','Off-block'],['off','Vzlet'],['on','Přistání'],['in','On-block']];
function hasPreToday(ac){return (S.daily[ac.acId+'|'+todayISO()]||[]).some(x=>x.kind==='PRE'||x.kind==='DAILY')}
function cardStart(ac,from,next){
  const d=UI.draft;const rec=recentAirports(ac,from);const pre=hasPreToday(ac);
  return `<section class="step ${next?'next':'dim'}" data-keep>
    ${d.ofpId&&ofpOf(d.ofpId)?(()=>{const o=ofpOf(d.ofpId);return `<div class="warnline info">Podle OFP <b class="mono">${esc(o.flt)}</b> ${esc(o.dep)} → ${esc(o.des)} · MREQ ${fmtN(o.fuel.rampMreq)} lbs · plán na odlet ${fmtN(o.fuel.rampEst)} lbs · <button type="button" class="linkbtn" style="display:inline;min-height:0;padding:0" data-act="ofp-unlink">odpojit OFP</button></div>`})():''}
    <div class="step-h"><h2>Začít let</h2><span class="muted">${esc(d.date||fmtDate(todayISO()))}${d.dateEdit?'':' · <button type="button" class="linkbtn" style="display:inline;min-height:0;padding:0" data-act="date-edit">jiný den?</button>'}</span></div>
    ${d.dateEdit?`<label class="fld"><span>Datum letu (dd/mm/rrrr)</span><input type="text" class="t-date" data-k="date" value="${esc(d.date||fmtDate(todayISO()))}" inputmode="numeric"></label>`:''}
    <div class="fgrid">
      ${(!from||d.fromEdit)?`<label class="fld"><span>Odkud</span><input type="text" class="icao big-in" data-k="from" value="${esc(d.from||from)}" maxlength="4" autocapitalize="characters" placeholder="LKPR"></label>`:`<div class="fld"><span>Odkud</span><div class="big-static mono">${esc(from)} <button type="button" class="linkbtn" data-act="from-edit">změnit</button></div></div>`}
      <label class="fld"><span>Kam</span><input type="text" class="icao big-in" id="c-to" data-k="to" value="${esc(d.to||'')}" maxlength="4" autocapitalize="characters" placeholder="____"></label>
      <label class="fld"><span>Číslo letu</span><input type="text" class="big-in" data-k="fno" value="${esc(d.fno||'')}" autocapitalize="characters" placeholder="nepovinné"></label>
    </div>
    ${rec.length?`<div class="airchips">${rec.map(a=>`<button type="button" class="chip" data-act="pick-to" data-id="${esc(a)}">${esc(a)}</button>`).join('')}</div>`:''}
    ${fuelFields(k=>d[k],true)}
    <div style="display:grid;gap:10px"><div class="who-row"><span class="label">Security search</span>${whoSeg().replace('<span class="label">Provedl</span>','')}</div>
      ${secTiles('c-secres',d.secRes,true)}
      ${d.secRes==='FOUND'?`<label class="fld"><span>Co a kde jste našli, komu nahlášeno</span><textarea data-k="secNote">${esc(d.secNote||'')}</textarea></label>`:''}</div>
    ${pre?'':`<label class="check"><input type="checkbox" data-k="pre" ${d.pre!==false?'checked':''}><span>Předletová prohlídka provedena – podepíše se zároveň</span></label>`}
    <div class="warns" id="c-warn"></div><p class="form-err" id="c-err" hidden></p>
    <button type="button" class="btn big primary" data-act="crew-start">${ICON.check}Začít let – podepsat</button>
    <p class="muted" style="font-size:.88rem">Firma po podpisu hned vidí, že let začal a security je hotová.</p>
  </section>`;
}
function cardClose(ac,next){
  const d=UI.draft;const l=targetOpen(ac);const s=l.sec;const age=ageH(l);
  return `<section class="step ${next?'next':'dim'}" data-keep>
    ${l.ofpId&&ofpOf(l.ofpId)?`<div class="warnline info">Let má OFP ${esc(ofpOf(l.ofpId).flt)}. Uzavřít ho můžete tady, nebo v OFP tlačítkem „Uzavřít OFP a přenést do ATL“ – údaje se zapíšou jednou. <button type="button" class="btn sm" data-act="ofp-open" data-id="${esc(l.ofpId)}">Otevřít OFP</button></div>`:''}
    <div class="step-h"><h2>Uzavřít let</h2><span class="muted">${S.out.has(l.ev)?'<span class="sync-s wait">začátek letu čeká na signál</span>':'<span class="sync-s ok">začátek letu odeslán</span>'}</span></div>
    ${age>12?`<div class="warnline warn">Tento let je otevřený už ${Math.floor(age)} h (zahájen ${fmtDate(l.date)}). Pokud proběhl, doplňte ho; pokud ne, zrušte ho.</div>`:''}
    <div class="warnline info"><b class="mono">${esc(l.from)} → ${esc(d.cto||l.to)}</b>${l.fno?' · '+esc(l.fno):''} · zahájeno ${hmOfIso(l.opened.at)}Z · security ${s?esc(s.time)+'Z '+(s.result==='FOUND'?'NÁLEZ':s.result==='NA'?'nebyla nutná':'✓'):'–'} · palivo ${fuelTxt(l)}</div>
    ${pfSeg(l,d.pf,true)}
    ${d.cdateEdit?`<label class="fld"><span>Datum letu (dd/mm/rrrr) – změní se i datum security</span><input type="text" class="t-date" data-k="cdate" value="${esc(d.cdate||fmtDate(l.date))}" inputmode="numeric"></label>`:`<p class="muted" style="font-size:.9rem">Datum letu <b class="mono">${esc(d.cdate||fmtDate(l.date))}</b> · <button type="button" class="linkbtn" style="display:inline;min-height:0;padding:0" data-act="cdate-edit">opravit datum</button></p>`}
    ${d.divert?`<label class="fld"><span>Kde jste přistáli (ICAO)</span><input type="text" class="icao big-in" data-k="cto" value="${esc(d.cto||l.to)}" maxlength="4" autocapitalize="characters"></label>`:`<div class="links"><button type="button" class="linkbtn" data-act="divert">Přistáli jste jinde než v ${esc(l.to)}?</button></div>`}
    <div><p class="label">Časy UTC – stačí napsat 4 číslice, kurzor skočí sám</p><div class="t4grid">${TIMES.map(([k,lb])=>`<label class="fld"><span>${lb}</span><input type="text" class="t4" id="c-${k}" data-k="${k}" value="${esc(d[k]||'')}" inputmode="numeric" maxlength="5" placeholder="––:––"></label>`).join('')}</div></div>
    <div class="row2"><div><p class="label">Přistání</p><div class="stepper"><button type="button" data-act="ldg" data-id="-1" aria-label="Méně přistání">−</button><input type="text" id="c-ldg" data-k="ldg" value="${esc(d.ldg||'1')}" inputmode="numeric" aria-label="Počet přistání"><button type="button" data-act="ldg" data-id="1" aria-label="Více přistání">+</button></div></div><div class="crew-calc" id="c-calc"></div></div>
    ${appField(d.app,d.appOther,true)}
    ${landFuelFields(l,'c-',k=>d[k],true)}
    <div><p class="label">Závady</p><div class="toggle2"><button type="button" class="${!d.defOn?'on':''}" data-act="def-on" data-id="0">Žádné (NIL)</button><button type="button" class="${d.defOn?'on':''}" data-act="def-on" data-id="1">Zapsat závadu</button></div></div>
    ${d.defOn?`<label class="fld"><span>Popis závady</span><textarea data-k="defText" placeholder="Co se stalo, kdy, jaká indikace">${esc(d.defText||'')}</textarea></label>
      <label class="check"><input type="checkbox" data-k="defMel" ${d.defMel?'checked':''}><span>Odloženo podle MEL – štítek INOP umístěn</span></label>
      ${d.defMel?`<div class="fgrid"><label class="fld"><span>Položka MEL</span><input type="text" data-k="defItem" value="${esc(d.defItem||'')}" placeholder="např. 33-40-01"></label><label class="fld"><span>Kategorie</span><select data-k="defCat">${['C','B','D'].map(c=>`<option ${d.defCat===c?'selected':''}>${c}</option>`).join('')}</select></label></div>`:''}`:''}
    <div class="links"><button type="button" class="linkbtn" data-act="fuel-open">${d.fuelOpen?'Skrýt olej':'+ Olej doplněn (nepovinné)'}</button></div>
    ${d.fuelOpen?`<div class="fgrid"><label class="fld"><span>Olej doplněn L/P (qt)</span><input type="text" data-k="oil" value="${esc(d.oil||'')}" placeholder="0 / 0"></label></div>`:''}
    <div class="warns" id="c-warn"></div><p class="form-err" id="c-err" hidden></p>
    <button type="button" class="btn big primary" data-act="crew-close">${ICON.check}Uzavřít a podepsat let</button>
    <div class="links"><button type="button" class="linkbtn" data-act="void-form" data-id="${esc(l.legId)}">Let se neuskutečnil – zrušit</button></div>
  </section>`;
}
function crewLive(){
  const ac=S.ac[BIND];if(!ac||!crewValid())return;const d=UI.draft;
  const el=document.getElementById('c-calc');
  if(el){const air=dur(d.off,d.on),blk=dur(d.out,d.in);el.innerHTML=`<div><span class="label">Let</span><b>${hm(air)}</b></div><div><span class="label">Blok</span><b>${hm(blk)}</b></div>`}
  const w=document.getElementById('c-warn');if(!w)return;const o=[];
  if(!ac.openLeg){
    const from=curFrom(ac);
    if(ac.status==='warn')o.push(`<div class="warnline warn"><b>${esc(ac.reg)} není uvolněné do provozu.</b> Bez CRS letadlo nesmí odletět – kontaktujte techniku.</div>`);
    if(ac.lastLeg&&from.length===4&&from!==ac.lastLeg.to)o.push(`<div class="warnline caution">Minulé přistání bylo v <b class="mono">${esc(ac.lastLeg.to)}</b>. Pokud mezitím proběhl let, který tu chybí, doplňte ho.</div>`);
    const dep=num(d.fuelBlk),mn=num(d.fuelMin);if(dep!=null&&mn!=null&&dep<mn)o.push(`<div class="warnline warn">Palivo na odlet (${fmtN(dep)} lbs) je pod minimem required (${fmtN(mn)} lbs).</div>`);
    if(!online())o.push(`<div class="warnline caution">iPad teď není na síti. Začátek letu se uloží a odešle, jakmile bude signál.</div>`);
  }else{
    const l=targetOpen(ac);const out=parseHM(d.out)!=null?normHM(d.out):null;const inn=parseHM(d.in)!=null?normHM(d.in):null;
    if(out&&ac.legs.some(x=>x!==l&&!x.void&&x.date===l.date&&x.from===l.from&&x.out===out))o.push(`<div class="warnline warn">Let se stejným off-blockem už je zapsaný. Nezapisuje ho právě druhý pilot?</div>`);
    else if(out&&inn){try{(checkTimes(l.acId,l.legId,{date:parseDate(d.cdate||'')||l.date,out,in:inn},true)||[]).forEach(m=>o.push(`<div class="warnline caution">${esc(m)}</div>`))}catch(x){o.push(`<div class="warnline warn">${esc(x.message)}</div>`)}}
  }
  w.innerHTML=o.join('');
}
function crewErr(x){const err=document.getElementById('c-err');if(err){err.textContent=x.message;err.hidden=false;err.scrollIntoView({block:'center',behavior:'smooth'})}}
function crewStart(){
  const ac=S.ac[BIND];const d=UI.draft;
  try{
    if(ac.openLeg)fail('Let už je zahájený – nejdřív ho uzavřete.');
    const from=curFrom(ac),to=String(d.to||'').toUpperCase();
    if(!/^[A-Z]{4}$/.test(from))fail('Doplňte letiště odletu (4 písmena ICAO).');
    if(!/^[A-Z]{4}$/.test(to))fail('Doplňte, kam letíte (4 písmena ICAO).');
    if(!d.secRes)fail('Potvrďte security search – vyberte jednu z možností.');
    if(d.secRes==='FOUND'&&String(d.secNote||'').trim().length<3)fail('Popište, co jste našli a komu jste to nahlásili.');
    const date=parseDate(d.date||fmtDate(todayISO()));if(!date)fail('Datum ve tvaru dd/mm/rrrr.');
    const fuel=readFuel(k=>d[k]);
    if(d.ofpId){const o=ofpOf(d.ofpId);if(o&&o.leg)fail('Podle tohoto OFP už let proběhl – vyberte jiný nebo OFP odpojte.')}
    const who=whoId();const legId=rid('leg');
    emit([['leg.open',{legId,acId:ac.acId,date,kind:'CAT',fno:String(d.fno||'').toUpperCase(),from,to,std:'',pic:CREW.pic,sic:CREW.sic||'',ofpId:d.ofpId||null,fuelUp:fuel.fuelUp,fuelBlk:fuel.fuelBlk,fuelMin:fuel.fuelMin,sec:{time:nowHM(),place:from,result:d.secRes,notes:d.secRes==='FOUND'?String(d.secNote).trim():d.secRes==='NA'?'Letadlo pod dohledem posádky':'',byName:S.users[who].name}}]]);
    if(!hasPreToday(ac)&&d.pre!==false)emit([['daily.sign',{acId:ac.acId,date,kind:'PRE',tyres:'',oil:'',brakes:false,notes:''}]],who);
    UI.draft={who:d.who};saveDraft();render();window.scrollTo({top:0,behavior:'smooth'});
    toast(online()?`Let ${from} → ${to} zahájen – firma vidí security`:`Let ${from} → ${to} zahájen – odešle se, až bude signál`);
  }catch(x){crewErr(x)}
}
function readClose(get,l){
  const date=get('cdate')?parseDate(get('cdate')):l.date;if(!date)fail('Datum letu zadejte ve tvaru dd/mm/rrrr.');
  if(date>addDays(todayISO(),1))fail('Datum letu je v budoucnosti.');
  let pf=l.pic;if(l.sic){const w=get('pf');if(w!=='pic'&&w!=='sic')fail('Vyberte, kdo byl Pilot Flying (PF).');pf=w==='sic'?l.sic:l.pic}
  const to=String(get('cto')||l.to).toUpperCase();if(!/^[A-Z]{4}$/.test(to))fail('Letiště přistání musí mít 4 písmena ICAO.');
  const L={out:'off-block',off:'vzlet',on:'přistání',in:'on-block'};const t={};
  for(const k in L){if(parseHM(get(k))==null)fail(`Doplňte čas ${L[k]} – 4 číslice, např. 0722.`);t[k]=normHM(get(k))}
  const a=dur(t.out,t.off),b=dur(t.off,t.on),c=dur(t.on,t.in);
  if(a+b+c!==dur(t.out,t.in)||b<=0)fail('Časy nejdou po sobě: off-block → vzlet → přistání → on-block.');
  const twarn=checkTimes(l.acId,l.legId,{date,out:t.out,in:t.in},true);
  const ldg=parseInt(get('ldg')||'1',10);if(!(ldg>=1&&ldg<=50))fail('Počet přistání musí být alespoň 1.');
  const app=readApp(get);
  const lf=readLandFuel(get,l);
  const defOn=!!get('defOn'),defText=String(get('defText')||'').trim(),defMel=!!get('defMel'),defItem=String(get('defItem')||'').trim(),defCat=get('defCat')||'C';
  if(defOn&&defText.length<3)fail('Popište závadu, nebo zvolte „Žádné“.');
  if(defOn&&defMel&&!defItem)fail('U odkladu dle MEL doplňte položku MEL.');
  const items=[['leg.sign',{legId:l.legId,acId:l.acId,date,pf,kind:l.kind||'CAT',fno:l.fno||'',from:l.from,to,out:t.out,off:t.off,on:t.on,in:t.in,ldg,app,pic:l.pic,sic:l.sic||'',fuelRem:lf.fuelRem,fuelBurn:lf.fuelBurn,oil:get('oil')||'',rem:'',nil:!defOn,paper:null}]];
  if(defOn){const defId=rid('def');items.push(['defect.report',{defId,acId:l.acId,legId:l.legId,date,text:defText,src:'crew'}]);
    if(defMel)items.push(['defect.defer',{defId,melItem:defItem,cat:defCat,due:addDays(date,MELDAYS[defCat]),procO:true,procM:false,placard:true,rem:''}])}
  return {items,to,warn:twarn};
}
function crewClose(){
  const ac=S.ac[BIND];const l=targetOpen(ac);if(!l)return;
  try{const r=readClose(k=>UI.draft[k],l);UI.draft={who:UI.draft.who};UI.closeLeg=null;saveDraft();emit(r.items);window.scrollTo({top:0,behavior:'smooth'});
    toast(`Let ${l.from} → ${r.to} uzavřen a podepsán${online()?'':' · odešle se, až bude signál'}`)}
  catch(x){crewErr(x)}
}

/* --- start / close flight from the office view (same events, in a sheet) --- */
function openStartFlight(ofpId){
  const O=ofpId?ofpOf(ofpId):null;
  const u=me();const ac=S.ac[UI.acId];if(ac.openLeg){openCloseFlight();return}
  const from=O?O.dep:(ac.lastLeg?ac.lastLeg.to:'');const rec=recentAirports(ac,from);
  const html=`<div class="warns" id="sfwarn"></div>
    <div class="fgrid">${O?`<input type="hidden" id="f-ofpid" value="${esc(O.ofpId)}"><div class="warnline info full" style="grid-column:1/-1">Podle OFP <b class="mono">${esc(O.flt)}</b> · MREQ ${fmtN(O.fuel.rampMreq)} lbs · plán na odlet ${fmtN(O.fuel.rampEst)} lbs</div>`:''}${F.date('f-date','Datum (UTC)',O?O.date:todayISO())}${F.text('f-fno','Číslo letu',O?O.flt:'',{attrs:'autocapitalize="characters" placeholder="nepovinné"'})}${F.icao('f-from','Odkud',from)}${F.icao('f-to','Kam',O?O.des:'')}</div>
    ${rec.length?`<div class="airchips">${rec.map(a=>`<button type="button" class="chip" data-act="sheet-to" data-id="${esc(a)}">${esc(a)}</button>`).join('')}</div>`:''}
    <div class="fgrid">${F.sel('f-pic','PIC',crewOpts(false),has(u,'crew')?u.id:'')}${F.sel('f-sic','SIC',crewOpts(true),'')}</div>
    ${fuelFields(k=>k==='fuelMin'&&O?O.fuel.rampMreq:'',false)}
    <fieldset><legend class="label">Security search</legend>${secTiles('s-secres','',false)}
      <div class="fgrid">${F.time('f-sectime','Čas security (UTC)',nowHM())}</div>
      <label class="fld" id="s-secnote" hidden><span>Co a kde jste našli, komu nahlášeno</span><textarea id="f-secnotes"></textarea></label></fieldset>
    ${hasPreToday(ac)?'':F.check('f-pre','Předletová prohlídka provedena – podepíše se zároveň',true)}`;
  openSheet('Začít let – '+ac.reg,html,{sub:'Po podpisu firma hned vidí, že let začal a security je hotová.',submit:'Začít let',sign:true,live:()=>{
    const r=document.querySelector('input[name="s-secres"]:checked');const n=document.getElementById('s-secnote');if(n)n.hidden=!(r&&r.value==='FOUND');
    const w=document.getElementById('sfwarn');if(!w)return;const o=[];const f=v('f-from').toUpperCase();
    if(ac.status==='warn')o.push(`<div class="warnline warn"><b>${esc(ac.reg)} není uvolněné do provozu.</b> Bez CRS letadlo nesmí odletět.</div>`);
    if(ac.deferred.length)o.push(`<div class="warnline caution">Odklady: ${ac.deferred.map(x=>`MEL ${esc(x.deferral.melItem)} do ${fmtDate(x.deferral.due)} – ${esc(x.text)}`).join('; ')}</div>`);
    if(ac.lastLeg&&f.length===4&&f!==ac.lastLeg.to)o.push(`<div class="warnline caution">Minulé přistání bylo v <b class="mono">${esc(ac.lastLeg.to)}</b>.</div>`);
    const dep=num(v('f-fuelblk')),mn=num(v('f-fuelmin'));if(dep!=null&&mn!=null&&dep<mn)o.push(`<div class="warnline warn">Palivo na odlet je pod minimem required.</div>`);
    w.innerHTML=o.join('');
  },onSubmit:async()=>{
    if(S.ac[ac.acId].openLeg)fail('Let už je zahájený – nejdřív ho uzavřete.');
    const date=parseDate(v('f-date'));if(!date)fail('Datum ve tvaru dd/mm/rrrr.');
    const f=v('f-from').toUpperCase(),t=v('f-to').toUpperCase();if(!/^[A-Z]{4}$/.test(f)||!/^[A-Z]{4}$/.test(t))fail('Odkud a kam zadejte jako 4písmenný ICAO kód.');
    if(!v('f-pic'))fail('Vyberte PIC.');
    const r=document.querySelector('input[name="s-secres"]:checked');if(!r)fail('Potvrďte security search – vyberte jednu z možností.');
    const st=v('f-sectime');if(parseHM(st)==null)fail('Čas security zadejte jako HH:MM UTC.');
    if(r.value==='FOUND'&&v('f-secnotes').length<3)fail('Popište, co jste našli a komu jste to nahlásili.');
    const fuel=readFuel(k=>({fuelUp:v('f-fuelup'),fuelBlk:v('f-fuelblk'),fuelMin:v('f-fuelmin')})[k]);
    await checkPin();
    const items=[['leg.open',{legId:rid('leg'),acId:ac.acId,ofpId:v('f-ofpid')||null,date,kind:'CAT',fno:v('f-fno').toUpperCase(),from:f,to:t,std:'',pic:v('f-pic'),sic:v('f-sic'),fuelUp:fuel.fuelUp,fuelBlk:fuel.fuelBlk,fuelMin:fuel.fuelMin,sec:{time:normHM(st),place:f,result:r.value,notes:r.value==='FOUND'?v('f-secnotes'):r.value==='NA'?'Letadlo pod dohledem posádky':'',byName:me().name}}]];
    if(chk('f-pre'))items.push(['daily.sign',{acId:ac.acId,date,kind:'PRE',tyres:'',oil:'',brakes:false,notes:''}]);
    UI.page=null;UI.tab='log';emit(items);closeSheet();toast(online()?`Let ${f} → ${t} zahájen – firma vidí security`:'Uloženo – odešle se, až bude signál');
  }});
}
function openCloseFlight(legId){
  const ac=S.ac[UI.acId];const l=(legId&&S.legs[legId]&&S.legs[legId].state==='open'&&!S.legs[legId].void)?S.legs[legId]:ac.openLeg;if(!l){openStartFlight();return}
  const html=`<div class="warnline info"><b class="mono">${esc(l.from)} → ${esc(l.to)}</b>${l.fno?' · '+esc(l.fno):''} · zahájeno ${fmtTs(l.opened.at)} · security ${l.sec?esc(l.sec.time)+'Z':'–'} · palivo ${fuelTxt(l)}</div>
    ${pfSeg(l,'',false)}
    <div class="fgrid">${F.date('f-cdate','Datum letu (UTC)',l.date)}${F.icao('f-to','Kam (přepište při odklonu)',l.to)}</div>
    <p class="muted" style="font-size:.88rem">Oprava data se promítne i do záznamu security search tohoto letu.</p>
    <div><p class="label">Časy UTC – stačí napsat 4 číslice, kurzor skočí sám</p><div class="t4grid">${TIMES.map(([k,lb])=>`<label class="fld"><span>${lb}</span><input type="text" class="t4" id="s-${k}" inputmode="numeric" maxlength="5" placeholder="––:––"></label>`).join('')}</div></div>
    <div class="row2"><div><p class="label">Přistání</p><div class="stepper"><button type="button" data-act="sldg" data-id="-1" aria-label="Méně přistání">−</button><input type="text" id="s-ldg" value="1" inputmode="numeric" aria-label="Počet přistání"><button type="button" data-act="sldg" data-id="1" aria-label="Více přistání">+</button></div></div><div class="crew-calc" id="s-calc"></div></div>
    ${appField('','',false)}
    ${landFuelFields(l,'s-',()=>'',false)}
    <fieldset><legend class="label">Závady</legend><div class="tiles"><label class="tile"><input type="radio" name="s-def" value="0" checked>Žádné (NIL)</label><label class="tile found"><input type="radio" name="s-def" value="1">Zapsat závadu</label></div>
      <div id="s-defbox" style="display:grid;gap:10px" hidden><label class="fld"><span>Popis závady</span><textarea id="f-deftext"></textarea></label>${F.check('f-defmel','Odloženo podle MEL – štítek INOP umístěn',false)}
      <div class="fgrid">${F.text('f-defitem','Položka MEL','')}${F.sel('f-defcat','Kategorie',[['C','C'],['B','B'],['D','D']],'C')}</div></div></fieldset>
    <details><summary class="linkbtn">+ Olej doplněn (nepovinné)</summary><div class="fgrid">${F.text('f-oil','Olej doplněn L/P (qt)','',{attrs:'placeholder="0 / 0"'})}</div></details>
    <div class="links"><button type="button" class="linkbtn" data-act="void-form" data-id="${esc(l.legId)}">Let se neuskutečnil – zrušit</button></div>`;
  openSheet('Uzavřít let – '+ac.reg,html,{submit:'Uzavřít a podepsat let',sign:true,live:()=>{
    const c=document.getElementById('s-calc');if(c){const air=dur(v('s-off'),v('s-on')),blk=dur(v('s-out'),v('s-in'));c.innerHTML=`<div><span class="label">Let</span><b>${hm(air)}</b></div><div><span class="label">Blok</span><b>${hm(blk)}</b></div>`}
    const r=document.querySelector('input[name="s-def"]:checked');const b=document.getElementById('s-defbox');if(b)b.hidden=!(r&&r.value==='1');
    const ra=document.querySelector('input[name="s-app"]:checked');const oa=document.getElementById('s-app-other');if(oa)oa.hidden=!(ra&&ra.value==='OTHER');
  },onSubmit:async()=>{
    const r=document.querySelector('input[name="s-def"]:checked');
    const ra=document.querySelector('input[name="s-app"]:checked');const rp=document.querySelector('input[name="s-pf"]:checked');const map={cdate:v('f-cdate'),pf:rp?rp.value:'',app:ra?ra.value:'',appOther:v('f-appother'),cto:v('f-to'),out:v('s-out'),off:v('s-off'),on:v('s-on'),in:v('s-in'),ldg:v('s-ldg'),defOn:r&&r.value==='1',defText:v('f-deftext'),defMel:chk('f-defmel'),defItem:v('f-defitem'),defCat:v('f-defcat'),fuelRem:v('s-frem'),fuelBurn:v('s-fburn'),oil:v('f-oil')};
    const res=readClose(k=>map[k],l);await checkPin();emit(res.items);closeSheet();toast(`Let ${l.from} → ${res.to} uzavřen a podepsán`);
  }});
}
/* --- logout with open-flight check --- */
function openFlightsOf(ids){return Object.values(S.legs).filter(l=>l.state==='open'&&!l.void&&(ids.includes(l.pic)||ids.includes(l.sic)))}
function openFlightsBlock(open){
  if(!open.length)return '<div class="warnline info">Všechny vaše lety jsou uzavřené.</div>';
  return `<div class="warnline warn"><b>${open.length===1?'Jeden let není uzavřený':'Neuzavřené lety: '+open.length}</b><br>${open.map(l=>`<span class="mono">${esc((S.ac[l.acId]||{}).reg||'')} · ${esc(l.from)} → ${esc(l.to)}</span> · zahájen ${hmOfIso(l.opened.at)}Z`).join('<br>')}<br>Pokud je neuzavřete, zůstanou otevřené a další posádka je uvidí jako probíhající.</div>
  <div class="chips">${open.map(l=>`<button type="button" class="btn primary" data-act="goto-close" data-id="${esc(l.legId)}">Uzavřít ${esc((S.ac[l.acId]||{}).reg||'')} ${esc(l.from)} → ${esc(l.to)}</button>`).join('')}</div>`;
}
function pendingBlock(){return OUT.length?`<div class="warnline caution">${OUT.length} ${OUT.length===1?'záznam ještě čeká':'záznamů ještě čeká'} na odeslání. Nechte iPad zapnutý – odešle je sám, až bude signál.</div>`:''}
function openLogout(kind){
  const ids=kind==='crew'?[CREW.pic,CREW.sic].filter(Boolean):[SESSION&&SESSION.userId].filter(Boolean);
  const open=openFlightsOf(ids);
  if(kind==='office'&&!open.length&&!OUT.length){doLogout('office');return}
  openSheet(open.length?'Lety nejsou uzavřené':'Odhlásit?',`${openFlightsBlock(open)}${pendingBlock()}
    <div class="chips"><button type="button" class="btn" data-act="close-sheet">Zpět</button><button type="button" class="btn ${open.length?'danger':'primary'}" data-act="logout-confirm" data-id="${kind}">${open.length?'Odhlásit i tak':'Odhlásit'}</button></div>`,{focus:false});
}
function doLogout(kind){
  if(kind==='crew'){CREW=null;store.set('etl.crew',null);UI.draft={};saveDraft();UI.crewView='today';UI.startPic=null;UI.startSic=null}
  else{SESSION=null;store.set('etl.session',null);UI.loginUser=null}
  closeSheet();render();window.scrollTo(0,0);toast('Odhlášeno');
}
function openCrewEnd(){
  const ac=S.ac[BIND];const today=todayISO();
  const legs=ac.legs.filter(l=>l.date===today&&l.state!=='open'&&!l.void);
  const air=legs.reduce((s,l)=>s+l.air,0),blk=legs.reduce((s,l)=>s+l.block,0),ldg=legs.reduce((s,l)=>s+(+l.ldg||0),0);
  const pages=[...new Set(legs.map(l=>l.page))];
  openSheet('Konec dne – '+ac.reg,`<dl class="kvgrid"><dt>Lety dnes</dt><dd>${legs.length}</dd><dt>Let / blok</dt><dd class="mono">${hm(air)} / ${hm(blk)}</dd><dt>Přistání</dt><dd>${ldg}</dd><dt>Stránka deníku</dt><dd class="mono">${pages.join(', ')||'–'}</dd><dt>TTAF letadla</dt><dd class="mono">${hm(ac.air)} · ${ac.cyc} cyklů</dd></dl>
    ${openFlightsOf([CREW.pic,CREW.sic].filter(Boolean)).length?openFlightsBlock(openFlightsOf([CREW.pic,CREW.sic].filter(Boolean))):''}
    ${OUT.length?`<div class="warnline caution">${OUT.length} ${OUT.length===1?'záznam ještě čeká':'záznamů ještě čeká'} na odeslání. Nechte iPad zapnutý – odešle je sám, až bude signál.</div>`:'<div class="warnline info">Všechno je odeslané.</div>'}
    <div class="chips"><button type="button" class="btn" data-act="close-sheet">Zpět</button><button type="button" class="btn primary" data-act="crew-end-confirm">Ukončit den</button></div>`,{focus:false});
}

/* ---------- sheet ---------- */
function openSheet(title,html,opt){
  opt=opt||{};const u=me();
  const foot=opt.submit?`<footer class="sheet-foot">${opt.sign&&mode()==='crew'?`<span class="pin"><span class="label">Podepisuje</span><b>${esc(u?u.name:'')}</b></span>`:opt.sign?`<label class="pin"><span class="label">Podpis – PIN ${esc(u?u.name:'')}</span><input type="password" id="f-pin" inputmode="numeric" autocomplete="off"></label>`:'<span style="margin-right:auto"></span>'}<button type="button" class="btn" data-act="close-sheet">Zrušit</button><button type="submit" class="btn primary">${esc(opt.submit)}</button></footer>`:'';
  const el=$('#sheet');
  el.innerHTML=`<div class="sheet-back" data-act="close-sheet"></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><form id="sf" novalidate autocomplete="off"><header class="sheet-head"><div><h2>${esc(title)}</h2>${opt.sub?`<p>${opt.sub}</p>`:''}</div><button type="button" class="btn ghost sm" data-act="close-sheet">Zavřít</button></header><div class="sheet-body">${html}<p class="form-err" id="ferr" hidden></p></div>${foot}</form></div>`;
  el.hidden=false;document.body.classList.add('noscroll');
  sheetSubmit=opt.onSubmit||null;sheetLive=opt.live||null;
  if(sheetLive)sheetLive();
  const first=el.querySelector('.sheet-body input:not([type=hidden]):not([readonly]),.sheet-body textarea,.sheet-body select');
  if(first&&opt.focus!==false&&matchMedia('(pointer:fine)').matches)first.focus();
}
function closeSheet(){hoStop();const el=$('#sheet');el.hidden=true;el.innerHTML='';document.body.classList.remove('noscroll');sheetSubmit=null;sheetLive=null}
function fail(msg){throw new Error(msg)}
async function checkPin(){if(mode()==='crew'&&crewValid())return;const pin=v('f-pin');const u=me();if(!pin)fail('Pro podpis zadejte svůj PIN.');const h=await sha(u.id+':'+pin);if(h!==u.pinHash){const el=document.getElementById('f-pin');if(el){el.value='';el.classList.add('bad')}fail('Nesprávný PIN.')}}
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{el.hidden=true},3200)}

const F={
  text:(id,label,val,extra)=>`<label class="fld ${extra&&extra.full?'full':''}"><span>${label}</span><input type="text" id="${id}" value="${esc(val==null?'':val)}" ${extra&&extra.attrs||''}></label>`,
  time:(id,label,val)=>`<label class="fld"><span>${label}</span><input type="text" class="t-hm" id="${id}" value="${esc(val||'')}" inputmode="numeric" maxlength="5" placeholder="HH:MM"></label>`,
  icao:(id,label,val)=>`<label class="fld"><span>${label}</span><input type="text" class="icao" id="${id}" value="${esc(val||'')}" maxlength="4" autocapitalize="characters" placeholder="LKPR"></label>`,
  date:(id,label,val)=>`<label class="fld"><span>${label}</span><span class="inline"><input type="text" class="t-date" id="${id}" value="${esc(val?fmtDate(val):'')}" inputmode="numeric" placeholder="dd/mm/rrrr"><button type="button" class="btn sm" data-act="today" data-id="${id}">Dnes</button></span></label>`,
  sel:(id,label,opts,val)=>`<label class="fld"><span>${label}</span><select id="${id}">${opts.map(o=>`<option value="${esc(o[0])}" ${String(o[0])===String(val)?'selected':''}>${esc(o[1])}</option>`).join('')}</select></label>`,
  area:(id,label,val,ph)=>`<label class="fld full"><span>${label}</span><textarea id="${id}" placeholder="${esc(ph||'')}">${esc(val||'')}</textarea></label>`,
  check:(id,label,on)=>`<label class="check"><input type="checkbox" id="${id}" ${on?'checked':''}><span>${label}</span></label>`
};
const CRS_TEXT='Osvědčuje se, že uvedená práce byla provedena v souladu s Part-145 a letadlo je z hlediska této práce způsobilé k uvolnění do provozu.';

/* --- leg form --- */
function crewOpts(blank){const o=Object.values(S.users).filter(x=>x.active!==false&&has(x,'crew')).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>[x.userId,x.name]);return blank?[['','–']].concat(o):o}
function legFields(l,ac){
  const u=me();
  return `<fieldset><legend class="label">Let</legend><div class="fgrid">
    ${F.date('f-date','Datum (UTC)',l.date)}
    ${F.sel('f-kind','Druh letu',Object.entries(KIND),l.kind||'CAT')}
    ${F.text('f-fno','Číslo letu / volací znak',l.fno,{attrs:'autocapitalize="characters"'})}
    ${F.icao('f-from','Odkud',l.from)}${F.icao('f-to','Kam',l.to)}
    ${F.text('f-ldg','Přistání (počet)',l.ldg==null?'1':l.ldg,{attrs:'inputmode="numeric"'})}
    ${F.sel('f-app','Typ přiblížení',[['','– vyberte –']].concat(APPS.map(a=>[a,a])).concat([['OTHER','Jiné…']]),l.app&&!APPS.includes(l.app)?'OTHER':(l.app||''))}
    ${F.text('f-appother','Jiné přiblížení',l.app&&!APPS.includes(l.app)?l.app:'',{attrs:'autocapitalize="characters" placeholder="jen u Jiné"'})}
  </div></fieldset>
  <fieldset><legend class="label">Časy UTC</legend><div class="fgrid">
    ${F.time('f-out','Off-block',l.out)}${F.time('f-off','Vzlet',l.off)}${F.time('f-on','Přistání',l.on)}${F.time('f-in','On-block',l.in)}
  </div><div class="calc" id="calc"></div></fieldset>
  <fieldset><legend class="label">Posádka a provozní údaje</legend><div class="fgrid">
    ${F.sel('f-pic','PIC',crewOpts(false),l.pic||(has(u,'crew')?u.id:''))}${F.sel('f-sic','SIC',crewOpts(true),l.sic||'')}${F.sel('f-pf','Pilot Flying',[['pic','PIC'],['sic','SIC']],l.pf&&l.pf===l.sic?'sic':'pic')}
    ${F.text('f-fuelup','Natankováno (L)',l.fuelUp,{attrs:'inputmode="numeric"'})}${F.text('f-fuelblk','Palivo na odlet (lbs)',l.fuelBlk,{attrs:'inputmode="numeric"'})}${F.text('f-fuelmin','Min. required (lbs)',l.fuelMin,{attrs:'inputmode="numeric"'})}
  </div>${l.state==='open'?'':landFuelFields(l,'f-',k=>l[k],false)}<div class="fgrid">
    ${F.text('f-oil','Olej doplněn L/P (qt)',l.oil,{attrs:'placeholder="0 / 0"'})}
    ${F.area('f-rem','Poznámka',l.rem,'')}
  </div></fieldset>`;
}
function legFuel(amend){
  const g=k=>({fuelUp:v('f-fuelup'),fuelBlk:v('f-fuelblk'),fuelMin:v('f-fuelmin')})[k];const out={};
  if(!(amend&&!g('fuelUp')&&!g('fuelBlk')&&!g('fuelMin')))Object.assign(out,readFuel(g));
  if(document.getElementById('f-frem')&&(v('f-frem')||v('f-fburn')))Object.assign(out,readLandFuel(k=>({fuelRem:v('f-frem'),fuelBurn:v('f-fburn')})[k],{fuelBlk:out.fuelBlk!=null?out.fuelBlk:null}));
  return out;
}
function readLeg(amend){
  const date=parseDate(v('f-date'));if(!date)fail('Datum musí být ve tvaru dd/mm/rrrr.');
  if(date>addDays(todayISO(),1))fail('Datum letu je v budoucnosti.');
  const from=v('f-from').toUpperCase(),to=v('f-to').toUpperCase();
  if(!/^[A-Z]{4}$/.test(from)||!/^[A-Z]{4}$/.test(to))fail('Letiště zadejte jako 4písmenný ICAO kód.');
  const t={out:v('f-out'),off:v('f-off'),on:v('f-on'),in:v('f-in')};
  for(const k in t){if(parseHM(t[k])==null)fail('Všechny čtyři časy musí být HH:MM UTC.');t[k]=normHM(t[k])}
  const a=dur(t.out,t.off),b=dur(t.off,t.on),c=dur(t.on,t.in),blk=dur(t.out,t.in);
  if(a+b+c!==blk)fail('Časy nejdou po sobě: off-block → vzlet → přistání → on-block.');
  if(b<=0)fail('Doba letu musí být delší než 0.');
  const ldg=parseInt(v('f-ldg'),10);if(!(ldg>=1&&ldg<=50))fail('Počet přistání musí být alespoň 1.');
  const app=readApp(k=>({app:v('f-app'),appOther:v('f-appother')})[k]);
  if(!v('f-pic'))fail('Vyberte PIC.');
  return {date,kind:v('f-kind'),fno:v('f-fno').toUpperCase(),from,to,out:t.out,off:t.off,on:t.on,in:t.in,ldg,app,pic:v('f-pic'),sic:v('f-sic'),pf:v('f-pf')==='sic'&&v('f-sic')?v('f-sic'):v('f-pic'),...legFuel(amend),oil:v('f-oil'),rem:v('f-rem')};
}
function legLive(ac,editingId){
  return ()=>{
    const el=document.getElementById('calc');if(!el)return;
    const air=dur(v('f-off'),v('f-on')),blk=dur(v('f-out'),v('f-in'));
    const base=editingId?null:ac.air;
    el.innerHTML=`<div><span class="label">Doba letu</span><b>${hm(air)}</b></div><div><span class="label">Blok</span><b>${hm(blk)}</b></div>${base!=null?`<div><span class="label">TTAF po letu</span><b>${air!=null?hm(base+air):'–'}</b></div><div><span class="label">Cykly po letu</span><b>${ac.cyc+(parseInt(v('f-ldg'),10)||0)}</b></div>`:''}`;
    const w=document.getElementById('legwarn');if(!w)return;const out=[];
    if(!editingId){
      if(ac.status==='warn')out.push(`<div class="warnline warn"><b>${esc(ac.reg)} je neprovozuschopné.</b> Zapište jen let, který skutečně proběhl (např. přelet na povolení), a zkontrolujte stav s mechanikem.</div>`);
      const from=v('f-from').toUpperCase();
      if(ac.lastLeg&&from.length===4&&from!==ac.lastLeg.to)out.push(`<div class="warnline caution">Poslední zapsané přistání je <b class="mono">${esc(ac.lastLeg.to)}</b>. Odlet z <b class="mono">${esc(from)}</b> vytvoří díru v řetězci – zápis projde, ale bude označen.</div>`);
      const d=parseDate(v('f-date')),out1=normHM(v('f-out'));
      if(d&&from&&ac.legs.some(l=>!l.void&&l.date===d&&l.from===from&&l.out===out1))out.push(`<div class="warnline warn">Let ${esc(from)} s off-block ${esc(out1)} je pro tento den už zapsaný – možná ho zadal druhý pilot na svém iPadu.</div>`);
    }
    w.innerHTML=out.join('');
  };
}
function openLegForm(){
  const u=me();const ac=S.ac[UI.acId];
  const open=ac.openLeg;
  const pre=open?Object.assign({},open,{ldg:1}):{date:todayISO(),from:ac.lastLeg?ac.lastLeg.to:'',ldg:1};
  const head=open?`<div class="warnline info">Předletový zápis podepsal ${esc(open.opened.name)} v ${fmtTs(open.opened.at)}${open.sec?` · bezpečnostní prohlídka ${esc(open.sec.time)}Z`:''}. Doplňte časy a přistání. Při odklonu přepište letiště „Kam“.</div>`:'';
  const html=`${head}<div class="warns" id="legwarn"></div>${legFields(pre,ac)}
  ${open?'':`<fieldset><legend class="label">Bezpečnostní prohlídka</legend>
    <div class="warnline caution">Při běžném provozu se prohlídka podepisuje před odletem přes „Před odletem + Security“, aby o ní firma věděla včas. Tady ji zapište jen zpětně.</div>
    ${F.check('f-sec','Bezpečnostní prohlídka letadla byla před letem provedena',false)}<div class="fgrid">${F.time('f-sectime','Čas prohlídky (UTC)','')}</div></fieldset>`}
  <fieldset><legend class="label">Závady</legend>
    <div id="def-rows" class="grid-list"></div>
    <div class="chips"><button type="button" class="btn sm" data-act="add-defrow">${ICON.plus}Přidat závadu</button></div>
    <p class="muted" id="nil-note">Bez závad se let podepíše jako NIL.</p>
  </fieldset>
  ${open?'':`<fieldset><legend class="label">Zpětný zápis</legend>
    ${F.check('f-paper','Zápis přepisuji z papírového technického deníku (výpadek tabletu)',false)}
    <div class="fgrid" id="paper-row" hidden>${F.text('f-paperpg','Číslo papírové stránky','')}</div>
  </fieldset>`}`;
  openSheet((open?'Dokončení letu – ':'Zápis letu – ')+ac.reg,html,{sub:`Následuje stránka ${ac.pages.length&&ac.pages[ac.pages.length-1].date===todayISO()&&ac.pages[ac.pages.length-1].legs.length<PER_PAGE?ac.pages[ac.pages.length-1].no:(S.cfg.pageFmt==='date'?'nová':ac.nextPage)} · TTAF ${hm(ac.air)}`,submit:'Podepsat let',sign:true,live:legLive(ac,null),onSubmit:async()=>{
    const leg=readLeg();checkTimes(ac.acId,open?open.legId:null,leg,false);
    const rows=[...document.querySelectorAll('.def-row')].map(r=>{const q=s=>r.querySelector(s);return {text:q('.d-text').value.trim(),mel:q('.d-mel').checked,item:q('.d-item').value.trim(),cat:q('.d-cat').value,due:q('.d-due').value.trim()}}).filter(r=>r.text||r.mel);
    for(const r of rows){if(!r.text)fail('Každá závada musí mít popis.');if(r.mel){if(!r.item)fail('U odkladu dle MEL vyplňte číslo položky.');if(r.cat==='A'&&!parseDate(r.due))fail('Kategorie A potřebuje datum platnosti odkladu.')}}
    const paper=chk('f-paper');if(paper&&!v('f-paperpg'))fail('Uveďte číslo papírové stránky, ze které zápis přepisujete.');
    let sec;
    if(!open&&chk('f-sec')){const st=v('f-sectime');if(parseHM(st)==null)fail('Zadejte čas bezpečnostní prohlídky HH:MM UTC.');sec={time:normHM(st),place:'',result:'NIL',notes:'Zapsáno zpětně se zápisem letu',byName:u.name}}
    await checkPin();
    const legId=open?open.legId:rid('leg');const lp=Object.assign({legId,acId:ac.acId},leg,{nil:!rows.length,paper:paper?{page:v('f-paperpg')}:null});if(sec)lp.sec=sec;
    const items=[['leg.sign',lp]];
    for(const r of rows){const defId=rid('def');items.push(['defect.report',{defId,acId:ac.acId,legId,date:leg.date,text:r.text,src:'crew'}]);
      if(r.mel){const due=r.cat==='A'?parseDate(r.due):addDays(leg.date,MELDAYS[r.cat]);items.push(['defect.defer',{defId,melItem:r.item,cat:r.cat,due,procO:true,procM:false,placard:true,rem:''}])}}
    UI.page=null;UI.tab='log';emit(items);closeSheet();toast(`Let ${leg.from}–${leg.to} podepsán${rows.length?' · závady: '+rows.length:''}`);
  }});
}
/* --- pre-departure + security search --- */
function openPredep(){
  const u=me();const ac=S.ac[UI.acId];
  const now=new Date();const nowHM=pad(now.getUTCHours())+':'+pad(now.getUTCMinutes());
  const hasPre=(S.daily[ac.acId+'|'+todayISO()]||[]).some(d=>d.kind==='PRE');
  const html=`<div class="warns" id="pdwarn"></div>
  <fieldset><legend class="label">Let</legend><div class="fgrid">
    ${F.date('f-date','Datum (UTC)',todayISO())}
    ${F.sel('f-kind','Druh letu',Object.entries(KIND),'CAT')}
    ${F.text('f-fno','Číslo letu / volací znak','',{attrs:'autocapitalize="characters"'})}
    ${F.icao('f-from','Odkud',ac.lastLeg?ac.lastLeg.to:'')}${F.icao('f-to','Kam (plán)','')}
    ${F.time('f-std','Plánovaný off-block (UTC)','')}
    ${F.sel('f-pic','PIC',crewOpts(false),has(u,'crew')?u.id:'')}${F.sel('f-sic','SIC',crewOpts(true),'')}
    ${F.text('f-fuelup','Palivo doplněno (kg)','',{attrs:'inputmode="numeric"'})}${F.text('f-fuelblk','Palivo před odletem (kg)','',{attrs:'inputmode="numeric"'})}
  </div></fieldset>
  <fieldset><legend class="label">Bezpečnostní prohlídka letadla (security search)</legend><div class="fgrid">
    ${F.time('f-sectime','Čas prohlídky (UTC)',nowHM)}${F.text('f-secplace','Stání / místo (nepovinné)','',{attrs:'placeholder="např. GA stání 12"'})}
    ${F.sel('f-secres','Výsledek',[['NIL','Bez nálezu'],['FOUND','Nález – nahlášeno']],'NIL')}
    ${F.area('f-secnotes','Poznámka','','Při nálezu: co, kde a komu bylo nahlášeno')}</div>
    ${F.check('f-secok','Prohledání letadla bylo provedeno podle bezpečnostního programu provozovatele',false)}
  </fieldset>
  ${hasPre?'':`<fieldset><legend class="label">Předletová prohlídka</legend>${F.check('f-pre','Současně podepsat předletovou prohlídku pro tento den',true)}</fieldset>`}
  <p class="muted">Zápis se hned odešle firmě. Po přistání ho dokončíte tlačítkem „Dokončit let“ – doplníte jen časy a přistání.</p>`;
  openSheet('Před odletem – '+ac.reg,html,{sub:'Předvyplnění stránky a podpis bezpečnostní prohlídky',submit:'Podepsat před odletem',sign:true,live:()=>{
    const w=document.getElementById('pdwarn');if(!w)return;const o=[];
    if(ac.status==='warn')o.push(`<div class="warnline warn"><b>${esc(ac.reg)} je neprovozuschopné.</b> Bez uvolnění do provozu letadlo nesmí odletět.</div>`);
    if(ac.deferred.length)o.push(`<div class="warnline caution">Aktivní odklady: ${ac.deferred.map(d=>`MEL ${esc(d.deferral.melItem)} kat. ${esc(d.deferral.cat)} do ${fmtDate(d.deferral.due)} – ${esc(d.text)}`).join('; ')}. Zkontrolujte provozní omezení.</div>`);
    const from=v('f-from').toUpperCase();
    if(ac.lastLeg&&from.length===4&&from!==ac.lastLeg.to)o.push(`<div class="warnline caution">Poslední zapsané přistání je <b class="mono">${esc(ac.lastLeg.to)}</b>, odlet z <b class="mono">${esc(from)}</b> vytvoří díru v řetězci.</div>`);
    if(SIMOFF||navigator.onLine===false||!db)o.push(`<div class="warnline caution">Zařízení teď není připojené. Zápis se uloží a odešle, jakmile bude síť – firma ho do té doby neuvidí.</div>`);
    w.innerHTML=o.join('');
  },onSubmit:async()=>{
    if(ac.openLeg)fail(`Pro ${ac.reg} už je otevřený předletový zápis ${ac.openLeg.from}–${ac.openLeg.to}. Nejdřív ho dokončete nebo zrušte.`);
    const date=parseDate(v('f-date'));if(!date)fail('Datum musí být ve tvaru dd/mm/rrrr.');
    const from=v('f-from').toUpperCase(),to=v('f-to').toUpperCase();
    if(!/^[A-Z]{4}$/.test(from)||!/^[A-Z]{4}$/.test(to))fail('Letiště zadejte jako 4písmenný ICAO kód.');
    if(v('f-std')&&parseHM(v('f-std'))==null)fail('Plánovaný off-block zadejte jako HH:MM UTC.');
    if(!v('f-pic'))fail('Vyberte PIC.');
    const st=v('f-sectime');if(parseHM(st)==null)fail('Zadejte čas bezpečnostní prohlídky HH:MM UTC.');
    const res=v('f-secres');if(res==='FOUND'&&v('f-secnotes').length<4)fail('Při nálezu popište, co bylo nalezeno a komu nahlášeno.');
    if(!chk('f-secok'))fail('Potvrďte provedení bezpečnostní prohlídky.');
    await checkPin();
    const legId=rid('leg');
    const items=[['leg.open',{legId,acId:ac.acId,date,kind:v('f-kind'),fno:v('f-fno').toUpperCase(),from,to,std:v('f-std')?normHM(v('f-std')):'',pic:v('f-pic'),sic:v('f-sic'),fuelUp:v('f-fuelup'),fuelBlk:v('f-fuelblk'),sec:{time:normHM(st),place:v('f-secplace'),result:res,notes:v('f-secnotes'),byName:u.name}}]];
    if(chk('f-pre'))items.push(['daily.sign',{acId:ac.acId,date,kind:'PRE',tyres:'',oil:'',brakes:false,notes:'Podepsáno s předletovým zápisem'}]);
    const online=!!db&&!SIMOFF&&navigator.onLine!==false;
    UI.page=null;UI.tab='log';emit(items);closeSheet();
    toast(online?'Podepsáno – odesílám firmě':'Uloženo v zařízení – odešle se po připojení');
  }});
}
function secText(l){
  const ac=S.ac[l.acId];const s=l.sec;
  return [`${ac.reg} · ATL str. ${l.page}/${l.idx} · ${fmtDate(l.date)}`,
    `${l.from} → ${l.to}${l.fno?' · '+l.fno:''}${l.std?' · plán off-block '+l.std+'Z':''}`,
    `Bezpečnostní prohlídka: ${s.time}Z${s.place?', '+s.place:''}, ${s.result==='FOUND'?'NÁLEZ – '+s.notes:'bez nálezu'}`,
    `Podepsal: ${s.byName||''} · ${fmtTs(l.opened?l.opened.at:legAt(l))}`,
    `Stav záznamu: ${S.out.has(l.openEv||l.ev)?'zatím neodesláno':'uloženo na serveru'}`].join('\n');
}
function defRowHtml(){
  return `<div class="def-row"><label class="fld full"><span>Popis závady</span><textarea class="d-text" placeholder="Co posádka zjistila, ve které fázi letu, jaká indikace"></textarea></label>
  <label class="check"><input type="checkbox" class="d-mel"><span>Odložit dle MEL (posádka provedla (O) postup a umístila štítek)</span></label>
  <div class="fgrid d-melf" hidden><label class="fld"><span>Položka MEL</span><input type="text" class="d-item" placeholder="např. 33-40-01"></label>
  <label class="fld"><span>Kategorie</span><select class="d-cat"><option>C</option><option>B</option><option>D</option><option>A</option></select></label>
  <label class="fld"><span>Platnost (jen kat. A)</span><input type="text" class="d-due t-date" placeholder="dd/mm/rrrr"></label></div>
  <div><button type="button" class="btn sm ghost" data-act="del-defrow">Odebrat</button></div></div>`;
}

/* --- leg detail / amend / void --- */
function openLegDetail(id){
  const l=S.legs[id];const u=me();const ac=S.ac[l.acId];
  const pic=S.users[l.pic],sic=S.users[l.sic];
  const hist=l.history.map(h=>`<li><b>${esc(h.name)}</b> ${fmtTs(h.at)} – ${esc(h.reason)}<br><span class="muted">${Object.keys(h.changes).map(k=>`${esc(k)}: ${esc(h.prev[k])} → ${esc(h.changes[k])}`).join('; ')}</span></li>`).join('');
  const isOpen=l.state==='open';const s=l.sec;
  const secTxt=s?`${esc(s.time)}Z${s.place?' · '+esc(s.place):''} · ${s.result==='FOUND'?'<b style="color:var(--warn)">nález</b>':'bez nálezu'}${s.notes?' · '+esc(s.notes):''} · ${esc(s.byName||'')}`:'<span style="color:var(--caution)">nezapsána</span>';
  const btns=[];
  if(l.ofpId&&ofpOf(l.ofpId))btns.push(`<button type="button" class="btn" data-act="ofp-open" data-id="${esc(l.ofpId)}">Otevřít OFP ${esc(ofpOf(l.ofpId).flt)}</button>`);
  if(s)btns.push(`<button type="button" class="btn" data-act="copy-sec" data-id="${esc(id)}">Kopírovat potvrzení (Fl3xx)</button>`);
  if(!isOpen&&!l.void&&can.crs(u))btns.push(`<button type="button" class="btn" data-act="crs-leg" data-id="${esc(id)}">${ICON.check}Vydat CRS po tomto letu</button>`);
  const lc=crsOf(l);
  if(!l.void&&isOpen&&can.leg(u))btns.push(`<button type="button" class="btn primary" data-act="complete-leg" data-id="${esc(id)}">Dokončit let</button>`,`<button type="button" class="btn danger" data-act="void-form" data-id="${esc(id)}">Zrušit – let se neuskutečnil</button>`);
  else if(!l.void&&can.amend(u,l))btns.push(`<button type="button" class="btn" data-act="amend-form" data-id="${esc(id)}">Opravit zápis</button>`,`<button type="button" class="btn danger" data-act="void-form" data-id="${esc(id)}">Zneplatnit (duplicita / omyl)</button>`);
  else if(!l.void&&!isOpen)btns.push(`<span class="muted" style="font-size:.9rem">Opravit tento let může jen jeho PIC${pic?' ('+esc(pic.name)+')':''} nebo CAMO.</span>`);
  const html=`<dl class="kvgrid">
    <dt>Stav</dt><dd>${l.void?'<span class="ann mute">zneplatněno</span>':isOpen?'<span class="ann info">Let zahájen</span>':'<span class="ann ok">Podepsáno</span>'} ${S.out.has(l.ev)?'<span class="ann caution">neodesláno</span>':'<span class="ann ok">na serveru</span>'}</dd>
    <dt>Stránka / let</dt><dd class="mono">${l.page} / ${l.idx}</dd><dt>Trasa</dt><dd class="mono">${esc(l.from)} → ${esc(l.to)}</dd>
    <dt>Bezpečnostní prohlídka</dt><dd>${secTxt}</dd>
    ${isOpen?`<dt>Plán off-block</dt><dd class="mono">${dash(l.std)}</dd>`:`<dt>Časy UTC</dt><dd class="mono">${esc(l.out)} · ${esc(l.off)} · ${esc(l.on)} · ${esc(l.in)}</dd>
    <dt>Let / blok</dt><dd class="mono">${hm(l.air)} / ${hm(l.block)}</dd><dt>Přistání</dt><dd class="mono">${esc(l.ldg)}${l.app?' · '+esc(l.app):''}</dd>
    <dt>TTAF po letu</dt><dd class="mono">${hm(l.ttaf)} · ${l.tcyc} cyklů</dd>`}
    <dt>PIC / SIC</dt><dd>${esc(pic?pic.name:'–')} / ${esc(sic?sic.name:'–')}</dd>${l.pf?`<dt>PF / PM</dt><dd>PF ${esc((S.users[l.pf]||{}).name||'')} · PM ${esc((S.users[l.pf===l.pic?l.sic:l.pic]||{}).name||'–')}</dd>`:''}<dt>Druh</dt><dd>${esc(KIND[l.kind]||'')} ${esc(l.fno||'')}</dd>
    <dt>Palivo</dt><dd>natankováno ${fmtN(l.fuelUp)} L · na odlet ${fmtN(l.fuelBlk)} lbs · min. required ${fmtN(l.fuelMin)} lbs${isOpen?'':` · po přistání ${fmtN(l.fuelRem)} lbs · spáleno ${fmtN(l.fuelBurn)} lbs`}</dd>
    ${isOpen?'':`<dt>Olej</dt><dd>${dash(l.oil)}</dd>`}
    ${l.rem?`<dt>Poznámka</dt><dd>${esc(l.rem)}</dd>`:''}
    ${l.opened?`<dt>Před odletem</dt><dd>${esc(l.opened.name)} · ${fmtTs(l.opened.at)} · <span class="mono">${esc(l.opened.dev)}</span></dd>`:''}
    ${l.signed?`<dt>Let podepsal</dt><dd>${esc(l.signed.name)} · ${fmtTs(l.signed.at)} · <span class="mono">${esc(l.signed.dev)}</span></dd>`:''}
    ${l.paper?`<dt>Zdroj</dt><dd>Přepis z papírové stránky ${esc(l.paper.page)}</dd>`:''}
    ${l.void?`<dt>Zneplatněno</dt><dd>${esc(l.void.name)} · ${fmtTs(l.void.at)} – ${esc(l.void.reason)}</dd>`:''}
  </dl>${hist?`<div><p class="label">Historie oprav</p><ul>${hist}</ul></div>`:''}
  ${lc.length?`<div><p class="label">Uvolnění do provozu po tomto letu</p><ul>${lc.map(c=>`<li><b>${esc(crsTitle(c))}</b>${c.wo?' · WO '+esc(c.wo):''} – ${esc(c.name)} (${esc(c.licence||'–')}), ${fmtTs(c.at)}</li>`).join('')}</ul></div>`:''}
  ${btns.length?`<div class="chips">${btns.join('')}</div>`:''}`;
  openSheet(`${ac.reg} · ${l.from}–${l.to} · ${fmtDate(l.date)}`,html,{focus:false});
}
function openAmend(id){
  const l=S.legs[id];const ac=S.ac[l.acId];
  const pic=S.users[l.pic];
  openSheet('Oprava zápisu letu',`<div class="warnline info">Opravu smí podepsat jen PIC tohoto letu${pic?' ('+esc(pic.name)+')':''} nebo CAMO. Původní hodnoty zůstanou v historii, oprava musí mít důvod. Změna časů nebo přistání se promítne do TTAF a cyklů na všech dalších stránkách.</div>${legFields(l,ac)}${F.area('f-reason','Důvod opravy','', 'např. překlep v čase přistání podle záznamu FMS')}`,{submit:'Podepsat opravu',sign:true,live:legLive(ac,id),onSubmit:async()=>{
    const n=readLeg(true);checkTimes(l.acId,id,n,false);const reason=v('f-reason');if(!can.amend(me(),l))fail('Opravu smí podepsat jen PIC tohoto letu nebo CAMO.');if(reason.length<5)fail('Napište důvod opravy.');
    const changes={};for(const k in n){if(String(n[k]??'')!==String(l[k]??''))changes[k]=n[k]}
    if(!Object.keys(changes).length)fail('Nic se nezměnilo.');
    await checkPin();emit([['leg.amend',{legId:id,changes,reason}]]);closeSheet();toast('Oprava podepsána');
  }});
}
function openVoid(id){
  const l=S.legs[id];
  openSheet('Zneplatnit zápis letu',`<div class="warnline warn">Let ${esc(l.from)}–${esc(l.to)} ${fmtDate(l.date)} zůstane v deníku přeškrtnutý a přestane se počítat do hodin a cyklů. Použijte jen pro duplicitní nebo omylem zapsaný let.</div>${F.area('f-reason','Důvod','','např. duplicitní zápis – let zapsal i druhý pilot')}`,{submit:'Podepsat zneplatnění',sign:true,onSubmit:async()=>{
    const reason=v('f-reason');if(reason.length<5)fail('Napište důvod.');if(l.state!=='open'&&!can.amend(me(),l))fail('Zneplatnit smí jen PIC tohoto letu nebo CAMO.');await checkPin();emit([['leg.void',{legId:id,reason}]]);closeSheet();toast('Let zneplatněn');
  }});
}

/* --- defects --- */
function openDefectForm(){
  const ac=S.ac[UI.acId];const u=me();
  openSheet('Zapsat závadu – '+ac.reg,`${F.date('f-date','Datum zjištění (UTC)',todayISO())}${F.area('f-text','Popis závady','','Co bylo zjištěno, kde, za jakých podmínek')}${F.text('f-ata','ATA kapitola (nepovinné)','',{attrs:'inputmode="numeric" maxlength="2" placeholder="např. 32"'})}<p class="muted">Závada zapsaná mimo let (např. při prohlídce na zemi). Letadlo bude do odložení nebo odstranění vedeno jako neprovozuschopné.</p>`,{submit:'Podepsat zápis',sign:true,onSubmit:async()=>{
    const date=parseDate(v('f-date'));if(!date)fail('Datum musí být ve tvaru dd/mm/rrrr.');const text=v('f-text');if(text.length<4)fail('Popište závadu.');
    await checkPin();emit([['defect.report',{defId:rid('def'),acId:ac.acId,legId:null,date,text,ata:v('f-ata'),src:has(u,'mech')?'mech':has(u,'crew')?'crew':'camo'}]]);UI.tab='defects';closeSheet();toast('Závada zapsána');
  }});
}
function openDefer(id){
  const d=S.defects[id];
  openSheet('Odklad dle MEL – '+d.no,`<p class="txt">${esc(d.text)}</p><div class="fgrid">
    ${F.text('f-item','Položka MEL','',{attrs:'placeholder="např. 33-40-01"'})}
    ${F.sel('f-cat','Kategorie',[['C','C – 10 dní'],['B','B – 3 dny'],['D','D – 120 dní'],['A','A – dle poznámky MEL']],'C')}
    ${F.date('f-due','Platnost do',addDays(d.date||todayISO(),10))}</div>
    ${F.check('f-o','(O) provozní postup proveden',false)}${F.check('f-m','(M) údržbový postup proveden',false)}${F.check('f-pl','Štítek INOP umístěn',false)}
    ${F.area('f-rem','Poznámka / omezení','','např. let jen VMC, bez známé námrazy')}`,{submit:'Podepsat odklad',sign:true,live:()=>{
      const c=v('f-cat');const due=document.getElementById('f-due');if(due&&c!=='A'&&!due.dataset.touched)due.value=fmtDate(addDays(d.date||todayISO(),MELDAYS[c]));},onSubmit:async()=>{
    const item=v('f-item');if(!item)fail('Vyplňte položku MEL.');const due=parseDate(v('f-due'));if(!due)fail('Platnost musí být ve tvaru dd/mm/rrrr.');if(!chk('f-pl'))fail('Před odkladem musí být umístěn štítek INOP.');
    await checkPin();emit([['defect.defer',{defId:id,melItem:item,cat:v('f-cat'),due,procO:chk('f-o'),procM:chk('f-m'),placard:true,rem:v('f-rem')}]]);closeSheet();toast('Odklad podepsán');
  }});
}
function openRectify(id){
  const d=S.defects[id];const ac=S.ac[d.acId];const u=me();
  openSheet('Odstranění závady a CRS – '+d.no,`<p class="txt">${esc(d.text)}</p><div class="fgrid">
    ${F.text('f-ata','ATA kapitola',d.ata||'',{attrs:'inputmode="numeric" maxlength="2"'})}${F.text('f-wo','Číslo WO','')}
    ${F.text('f-air','TTAF při odstranění',hm(ac.air).replace(/ /g,''),{attrs:'inputmode="numeric" class="mono"'})}${F.text('f-cyc','Cykly',String(ac.cyc),{attrs:'inputmode="numeric"'})}
    ${F.text('f-lic','Číslo licence / oprávnění',u.licence||'')}</div>
    ${F.area('f-action','Provedená opatření','','Co bylo provedeno, podle jakého dokumentu (AMM/IPC kapitola)')}
    <div class="statement">${CRS_TEXT}</div>${F.check('f-stmt','Potvrzuji prohlášení o uvolnění do provozu',false)}`,{submit:'Podepsat CRS',sign:true,onSubmit:async()=>{
    const action=v('f-action');if(action.length<4)fail('Popište provedená opatření.');const air=parseDur(v('f-air'));if(air==null)fail('TTAF zadejte jako hodiny:minuty, např. 3455:40.');
    if(!v('f-lic'))fail('Vyplňte číslo licence.');if(!chk('f-stmt'))fail('Potvrďte prohlášení CRS.');
    await checkPin();emit([['defect.rectify',{defId:id,ata:v('f-ata'),wo:v('f-wo'),acAir:air,acCyc:parseInt(v('f-cyc'),10)||0,licence:v('f-lic'),action}]]);closeSheet();toast('Závada uzavřena, CRS podepsáno');
  }});
}
function openDefectDetail(id){
  const d=S.defects[id];
  openSheet('Historie závady '+d.no,`<p class="txt">${esc(d.text)}</p><ul>${d.trail.map(t=>`<li><b>${esc(t.t)}</b> – ${esc(t.name)}, ${fmtTs(t.at)} <span class="mono muted">${esc(t.dev)}</span></li>`).join('')}</ul>`,{focus:false});
}

/* --- CRS, ground, daily --- */
const CRS_KIND={SCHED:'Pravidelná prohlídka',WP:'Plánovaná údržba',UNSCHED:'Neplánovaná údržba'};
function crsTitle(c){return c.scope||(c.kind&&CRS_KIND[c.kind])||'Údržba dle workpacku'}
function crsOf(l){return S.crs.filter(c=>c.legId&&c.legId===l.legId)}
function openCrs(legId){
  const L=legId&&S.legs[legId];const ac=S.ac[L?L.acId:UI.acId];const u=me();
  const tAir=L?L.ttaf:ac.air,tCyc=L?L.tcyc:ac.cyc;const last=[...S.crs].reverse().find(c=>c.licence&&c.id===u.id);
  openSheet('Uvolnění do provozu – '+ac.reg,`${L?`<div class="warnline info">Po letu <b class="mono">${esc(L.from)} → ${esc(L.to)}</b> · ${fmtDate(L.date)} · stránka ${esc(L.page)}/${L.idx} · on-block ${esc(L.in)}Z</div>`:''}${ac.open.length?`<div class="warnline caution">Otevřené závady (${ac.open.length}) se samostatným CRS neuzavřou – uzavřete je v záložce Závady.</div>`:''}
    <div class="fgrid">${F.text('f-wo','Číslo WO / workpacku','',{attrs:'autocapitalize="characters" placeholder="např. WO-2026-0142"'})}</div>
    <div class="fgrid wide">${F.text('f-scope','Krátké označení (nepovinné)','',{attrs:'placeholder="např. 50 FH + výměna kola NLG"'})}</div>
    <div class="airchips">${(S.cfg.crsQuick||[]).map(q=>`<button type="button" class="chip" data-act="crs-quick" data-id="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="fgrid">${F.text('f-air','TTAF',hm(tAir).replace(/\u2009/g,''),{attrs:'inputmode="numeric"'})}${F.text('f-cyc','Cykly',String(tCyc),{attrs:'inputmode="numeric"'})}
    ${F.text('f-org','Organizace Part-145',last?last.org:'',{attrs:'placeholder="CZ.145.xxxx"'})}${F.text('f-lic','Číslo licence / oprávnění',u.licence||'')}</div>
    <div class="statement">Údržba byla provedena v rozsahu uvedeného workpacku. Jednotlivé úkoly, dílčí podpisy a použité podklady jsou ve workpacku. ${CRS_TEXT}</div>${F.check('f-stmt','Potvrzuji prohlášení o uvolnění do provozu',false)}`,{submit:'Podepsat CRS',sign:true,onSubmit:async()=>{
    const wo=v('f-wo').toUpperCase();if(wo.length<2)fail('Doplňte číslo WO / workpacku – rozsah práce je v něm.');
    const air=parseDur(v('f-air'));if(air==null)fail('TTAF zadejte jako hodiny:minuty.');if(!v('f-lic'))fail('Vyplňte číslo licence.');if(!chk('f-stmt'))fail('Potvrďte prohlášení CRS.');
    await checkPin();emit([['crs.issue',{crsId:rid('crs'),acId:ac.acId,legId:L?L.legId:null,page:L?L.page:null,wo,scope:v('f-scope'),org:v('f-org'),acAir:air,acCyc:parseInt(v('f-cyc'),10)||0,licence:v('f-lic')}]]);UI.tab='crs';closeSheet();toast('CRS podepsáno');
  }});
}
function openGround(){
  const ac=S.ac[UI.acId];
  openSheet('Uzemnit '+ac.reg,`<div class="warnline warn">Letadlo bude vedeno jako neprovozuschopné, dokud mechanik nevydá CRS.</div>${F.area('f-reason','Důvod','','např. plánovaná 600 FH inspekce, AOG – čeká na díl')}${F.text('f-wo','Číslo WO (nepovinné)','')}`,{submit:'Podepsat uzemnění',sign:true,onSubmit:async()=>{
    const reason=v('f-reason');if(reason.length<4)fail('Napište důvod.');await checkPin();emit([['ac.ground',{acId:ac.acId,reason,wo:v('f-wo')}]]);closeSheet();toast(ac.reg+' uzemněno');
  }});
}
function openDaily(){
  const ac=S.ac[UI.acId];const u=me();
  openSheet('Prohlídka – '+ac.reg,`<div class="fgrid">${F.date('f-date','Datum (UTC)',todayISO())}${F.sel('f-kind','Druh',Object.entries(DAILY),has(u,'mech')?'DAILY':'PRE')}</div>
    <fieldset><legend class="label">Měření (nepovinné)</legend><div class="fgrid">
    ${F.text('f-tn','Pneu příďová (psi)','',{attrs:'inputmode="numeric"'})}${F.text('f-tl','Pneu hlavní L (psi)','',{attrs:'inputmode="numeric"'})}${F.text('f-tr','Pneu hlavní P (psi)','',{attrs:'inputmode="numeric"'})}
    ${F.text('f-oil','Olej doplněn L/P (qt)','',{attrs:'placeholder="0 / 0"'})}</div>
    ${F.check('f-brk','Indikátory opotřebení brzd v limitu',false)}</fieldset>
    ${F.area('f-notes','Poznámka','','')}`,{submit:'Podepsat prohlídku',sign:true,onSubmit:async()=>{
    const date=parseDate(v('f-date'));if(!date)fail('Datum musí být ve tvaru dd/mm/rrrr.');
    const ty=[v('f-tn'),v('f-tl'),v('f-tr')];
    await checkPin();emit([['daily.sign',{acId:ac.acId,date,kind:v('f-kind'),tyres:ty.some(Boolean)?ty.map(x=>x||'–').join('/'):'',oil:v('f-oil'),brakes:chk('f-brk'),notes:v('f-notes')}]]);closeSheet();toast('Prohlídka podepsána');
  }});
}

function openOfpRules(){
  const rules=(S.cfg.ofpRules||[]).filter(r=>r&&OFP_FL[r.k]);const rows=rules.concat(Array(4).fill({k:'',type:'',def:'',max:''}));
  const types=[...new Set(S.acList.map(a=>a.type).filter(Boolean))];
  openSheet('OFP – předvyplnění a limity',`<p class="muted">Pro každé pole můžete nastavit hodnotu, která se v OFP předvyplní, a maximum, nad kterým OFP pole zvýrazní a upozorní při uzavření. Pravidlo pro konkrétní typ má přednost před pravidlem pro všechny. Řádek s prázdným polem se smaže; další řádky přibudou po uložení.</p>
    <div class="scroll-x"><table class="plain rules"><thead><tr><th>Pole</th><th>Typ letadla</th><th>Předvyplnit</th><th>Max</th></tr></thead><tbody>${rows.map((r,i)=>`<tr>
      <td><select id="rk-${i}"><option value="">–</option>${OFP_FIELDS.map(f=>`<option value="${f[0]}" ${r.k===f[0]?'selected':''}>${esc(f[1])}</option>`).join('')}</select></td>
      <td><select id="rt-${i}"><option value="">všechny</option>${types.concat(r.type&&!types.includes(r.type)?[r.type]:[]).map(t=>`<option ${r.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><input type="text" id="rd-${i}" value="${esc(r.def||'')}" style="max-width:110px"></td>
      <td><input type="text" id="rm-${i}" value="${esc(r.max||'')}" inputmode="numeric" style="max-width:110px"></td></tr>`).join('')}</tbody></table></div>`,{submit:'Uložit',sign:true,onSubmit:async()=>{
    const out=[];const seen=new Set();
    rows.forEach((_,i)=>{const k=v('rk-'+i);if(!k)return;const type=v('rt-'+i),def=v('rd-'+i),max=v('rm-'+i).replace(/[\s ]/g,'');
      if(seen.has(k+'|'+type))fail(`${OFP_FL[k][1]} (${type||'všechny'}) je v seznamu dvakrát.`);seen.add(k+'|'+type);
      if(max&&!OFP_FL[k][2])fail(`${OFP_FL[k][1]}: maximum jde nastavit jen u číselných polí.`);
      if(max&&num(max)==null)fail(`${OFP_FL[k][1]}: maximum musí být celé číslo.`);
      if(!def&&!max)fail(`${OFP_FL[k][1]}: vyplňte hodnotu nebo maximum, nebo pole nastavte na –.`);
      out.push({k,type,def,max})});
    await checkPin();emit([['cfg.set',{ofpRules:out}]]);closeSheet();toast('Pravidla OFP uložena');
  }});
}

/* --- setup guide: operator, aircraft with their starting state, users --- */
function setupState(){
  const acs=S.acList;const users=Object.values(S.users).filter(x=>x.active!==false);
  const op=!!S.cfgSet,ac=acs.length>0,live=ac&&acs.every(a=>a.isLive),ppl=users.length>1;
  return {op,ac,live,ppl,mech:users.some(x=>has(x,'mech')),done:op&&live&&ppl};
}
function firstPageLabel(a){return S.cfg.pageFmt==='date'?esc(String(a.reg).split('-').pop())+'-rrmmdd (podle data)':esc(a.startPage)}
function viewSetup(u){
  const st=setupState();const c=S.cfg;const acs=S.acList;
  const users=Object.values(S.users).filter(x=>x.active!==false).sort((a,b)=>a.name.localeCompare(b.name));
  const mark=d=>d?'<span class="ann ok">hotovo</span>':'<span class="ann caution">zbývá</span>';
  const step=(n,done,title,body,act)=>`<div class="panel"><div class="panel-head"><div><p class="label">Krok ${n} ${mark(done)}</p><h2>${title}</h2></div>${act||''}</div>${body}</div>`;
  const s1=step(1,st.op,'Provozovatel a provoz',st.op?`<dl class="kvgrid"><dt>Provozovatel</dt><dd>${esc(c.opName)}${c.aoc?' · '+esc(c.aoc):''}</dd>
      <dt>Domovské základny</dt><dd class="mono">${(c.bases||[]).map(esc).join(', ')}</dd>
      <dt>Doba služby</dt><dd>${esc(FTL_RULES[c.ftlRules]||c.ftlRules)}${c.omRef?' · '+esc(c.omRef):' · <span style="color:var(--caution)">chybí odkaz na OM</span>'}</dd>
      <dt>Číslování stránek</dt><dd>${esc(PAGE_FMT[c.pageFmt||'seq'])}</dd>
      <dt>Potvrdil</dt><dd>${esc(S.cfgSet.name)} · ${fmtTs(S.cfgSet.at)}</dd></dl>`
    :`<p class="muted">Název provozovatele, číslo AOC / CAMO, domovské základny, pravidla doby služby s odkazem na OM a způsob číslování stránek deníku. Platí pro všechna letadla a zařízení.</p>`,
    can.settings(u)?`<button class="btn ${st.op?'sm':'primary'}" data-act="settings-form">${st.op?'Upravit':'Vyplnit'}</button>`:'<span class="muted">Vyplní správce</span>');
  const acCard=a=>{const carried=a.defects.filter(d=>d.src==='paper');
    return `<div class="panel" style="margin:0"><div class="panel-head"><div><span class="ac-reg">${esc(a.reg)}</span> <span class="muted">${esc(a.type||'')}${a.msn?' · MSN '+esc(a.msn):''}</span></div>${a.isLive?'<span class="ann ok">v e-deníku</span>':'<span class="ann caution">nastavuje se</span>'}</div>
      <dl class="kvgrid"><dt>Přechod z papíru</dt><dd>${a.openDate?fmtDate(a.openDate):'–'} · poslední papírová str. <span class="mono">${esc(a.lastPaper||'–')}</span></dd>
      <dt>První e-stránka</dt><dd class="mono">${firstPageLabel(a)}</dd>
      <dt>TTAF / cykly při přechodu</dt><dd class="mono">${hm(a.openAir)} / ${esc(a.openCyc)}</dd>
      <dt>Převzaté závady</dt><dd>${carried.length?`<ul class="brief">${carried.map(d=>`<li class="${d.status==='open'?'b-warn':d.status==='deferred'?'b-caution':''}">${d.status==='deferred'?`<b>MEL ${esc(d.deferral.melItem)} kat. ${esc(d.deferral.cat)}, do ${fmtDate(d.deferral.due)}:</b> `:d.status==='open'?'<b>Otevřená:</b> ':''}${esc(d.text)}</li>`).join('')}</ul>`:'žádné'}</dd>
      ${a.isLive&&a.liveWho?`<dt>V e-deníku od</dt><dd>${fmtTs(a.liveWho.at)} · ${esc(a.liveWho.name)}</dd>`:''}</dl>
      ${a.isLive?'':`<div class="chips"><button class="btn sm" data-act="ac-form" data-id="${esc(a.acId)}">Upravit počáteční stav</button><button class="btn sm" data-act="carry-form" data-id="${esc(a.acId)}">${ICON.plus}Převzít závadu z papíru</button><button class="btn sm primary" data-act="golive-form" data-id="${esc(a.acId)}" ${st.op?'':'disabled'}>Potvrdit a uvést do e-deníku</button></div>${st.op?'':'<p class="muted" style="font-size:.86rem">Uvést do e-deníku jde až po potvrzení kroku 1.</p>'}`}</div>`};
  const s2=step(2,st.live,'Letadla a počáteční stav',`<p class="muted">U každého letadla opište z poslední podepsané stránky papírového deníku hodiny a cykly, číslo stránky a všechny otevřené a odložené závady. Posádky letadlo uvidí, až počáteční stav podepíšete.</p>
    ${acs.length?`<div class="grid-list">${acs.map(acCard).join('')}</div>`:''}`,`<button class="btn ${acs.length?'sm':'primary'}" data-act="ac-form">${ICON.plus}Přidat letadlo</button>`);
  const s3=step(3,st.ppl,'Posádky a mechanici',`<p class="muted">Každý pilot a mechanik má vlastní jméno a PIN, kterým podepisuje zápisy. ${st.mech?'':'<span style="color:var(--caution)">Zatím tu není mechanik s licencí – bez něj nejde vydat CRS.</span>'}</p>
    <div class="scroll-x"><table class="plain"><thead><tr><th>Jméno</th><th>Role</th><th>Licence / web</th><th></th></tr></thead><tbody>${users.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.roles.map(r=>ROLE[r]).join(', ')}</td><td class="mono">${esc(x.licence||'–')}${x.email?`<br><span class="muted" style="font-size:.84rem">web: ${esc(x.email)}</span>`:''}</td><td><button class="btn sm" data-act="user-form" data-id="${esc(x.userId)}">Upravit</button></td></tr>`).join('')}</tbody></table></div>`,
    `<button class="btn ${st.ppl?'sm':'primary'}" data-act="user-form">${ICON.plus}Přidat</button>`);
  const s4=step(4,st.done,'iPady v letadlech',`<ol class="muted" style="margin:0;padding-left:1.2em"><li>Na iPadu otevřete adresu deníku v Safari (se signálem).</li><li>Sdílet → Přidat na plochu, dál spouštějte jen z ikony.</li><li>Přihlaste zařízení jeho účtem a vyberte letadlo – iPad si ho zapamatuje.</li><li>Zkuste zahájit a uzavřít cvičný let v režimu letadlo.</li></ol>
    ${st.done?'<p style="margin-top:10px"><b>Úvodní nastavení je hotové.</b> Další letadla a uživatele přidáte ve Správě.</p>':''}`);
  return `<div><p class="label">Správce</p><h1>Úvodní nastavení</h1><p class="muted" style="margin-top:6px">Než posádky začnou zapisovat, nastavte provoz a převezměte stav letadel z papírového deníku. Každý krok se podepisuje PINem a zůstává v auditu.</p></div>${s1}${s2}${s3}${s4}`;
}
function openCarryForm(acId){
  const a=S.ac[acId];
  openSheet('Převzít závadu z papíru – '+a.reg,`<div class="warnline info">Opište otevřenou nebo odloženou závadu tak, jak je v papírovém deníku – s původním datem a platností odkladu.</div>
    <div class="fgrid">${F.date('f-date','Datum zápisu v papírovém deníku',a.openDate||todayISO())}${F.text('f-pp','Stránka papírového deníku',a.lastPaper||'',{attrs:'inputmode="numeric"'})}${F.text('f-ata','ATA kapitola (nepovinné)','',{attrs:'inputmode="numeric" maxlength="2"'})}</div>
    ${F.area('f-text','Popis závady','','text z papírového deníku')}
    ${F.sel('f-st','Stav v papírovém deníku',[['deferred','Odložená dle MEL'],['open','Otevřená – letadlo neprovozuschopné']],'deferred')}
    <fieldset id="carry-mel"><legend class="label">Odklad</legend><div class="fgrid">
      ${F.text('f-item','Položka MEL','',{attrs:'placeholder="např. 33-40-01"'})}${F.sel('f-cat','Kategorie',[['C','C'],['B','B'],['D','D'],['A','A']],'C')}${F.date('f-due','Platnost do','')}</div>
      ${F.check('f-o','(O) provozní postup proveden',false)}${F.check('f-m','(M) údržbový postup proveden',false)}${F.check('f-pl','Štítek INOP je na místě',false)}
      ${F.area('f-rem','Poznámka / omezení','','např. let jen VMC')}</fieldset>`,{submit:'Podepsat převzetí',sign:true,
    live:()=>{const fs=document.getElementById('carry-mel');if(fs)fs.hidden=v('f-st')!=='deferred'},
    onSubmit:async()=>{
      const date=parseDate(v('f-date'));if(!date)fail('Datum musí být ve tvaru dd/mm/rrrr.');
      const text=v('f-text');if(text.length<4)fail('Popište závadu.');
      const pp=v('f-pp');if(!pp)fail('Uveďte stránku papírového deníku.');
      const defId=rid('def');const items=[['defect.report',{defId,acId,legId:null,date,text,ata:v('f-ata'),src:'paper',paperPage:pp}]];
      if(v('f-st')==='deferred'){const item=v('f-item');if(!item)fail('Vyplňte položku MEL.');
        const due=parseDate(v('f-due'));if(!due)fail('Platnost odkladu opište z papírového deníku (dd/mm/rrrr).');
        if(!chk('f-pl'))fail('Odložená závada musí mít štítek INOP.');
        items.push(['defect.defer',{defId,melItem:item,cat:v('f-cat'),due,procO:chk('f-o'),procM:chk('f-m'),placard:true,rem:v('f-rem'),carried:true}])}
      await checkPin();emit(items);closeSheet();toast('Závada převzata');
    }});
}
function openGoLive(acId){
  const a=S.ac[acId];
  if(!S.cfgSet){toast('Nejdřív potvrďte nastavení provozovatele (krok 1).');return}
  const carried=a.defects.filter(d=>d.src==='paper');
  openSheet('Uvést '+a.reg+' do elektronického deníku',`<p>Podpisem potvrzujete přechodový bod z papírového deníku. Pak letadlo uvidí posádky na iPadech a mohou zapisovat lety.</p>
    <dl class="kvgrid"><dt>Datum přechodu</dt><dd>${a.openDate?fmtDate(a.openDate):'–'}</dd><dt>Poslední papírová stránka</dt><dd class="mono">${esc(a.lastPaper||'–')}</dd>
    <dt>První elektronická stránka</dt><dd class="mono">${firstPageLabel(a)}</dd><dt>TTAF při přechodu</dt><dd class="mono">${hm(a.openAir)}</dd><dt>Cykly při přechodu</dt><dd class="mono">${esc(a.openCyc)}</dd>
    <dt>Převzaté závady</dt><dd>${carried.length?carried.map(d=>esc(d.no)+' '+esc(d.text)).join('<br>'):'žádné'}</dd></dl>
    ${F.check('f-c1','Hodiny, cykly a čísla stránek odpovídají poslední stránce papírového deníku',false)}
    ${F.check('f-c2',carried.length?'Všechny otevřené a odložené závady z papírového deníku jsou převzaté':'V papírovém deníku nejsou žádné otevřené ani odložené závady',false)}
    <p class="muted">Přechodový bod zapište i do CAME.</p>`,{submit:'Podepsat a uvést do provozu',sign:true,onSubmit:async()=>{
    if(!chk('f-c1')||!chk('f-c2'))fail('Potvrďte obě kontroly.');
    await checkPin();emit([['ac.upsert',{acId,live:true}]]);closeSheet();toast(a.reg+' je v elektronickém deníku');
  }});
}

/* --- handover between iPads without signal: QR codes or a file (AirDrop) ---
   The package is a set of signed records. Records only ever get added and each has its own id,
   so taking over the same data twice, or in both directions, never duplicates or overwrites anything.
   Records taken over are queued for upload here too: whichever iPad gets signal first sends them. */
const HO_TYPES=new Set(['user.upsert','ac.upsert','cfg.set','leg.open','leg.sign','leg.amend','leg.void','defect.report','defect.defer','defect.rectify','crs.issue','ac.ground','daily.sign','sec.sign','ofp.import','ofp.fill','ofp.sign','ofp.void','ofp.close','ofp.reopen']);
const HO_HOURS=36,HO_CHUNK=900;
let hoRun=null;
function hoAcId(){return mode()==='crew'?BIND:UI.acId}
function hoEvents(acId){
  ofpFlush();
  const since=new Date(Date.now()-HO_HOURS*3600e3).toISOString();
  const legs=new Set(),ofps=new Set(),defs=new Set();
  for(const l of Object.values(S.legs))if(!acId||l.acId===acId)legs.add(l.legId);
  for(const o of Object.values(S.ofps))if(!acId||o.acId===acId)ofps.add(o.ofpId);
  for(const d of Object.values(S.defects))if(!acId||d.acId===acId)defs.add(d.defId);
  const mine=e=>{const p=e.p||{};return !acId||p.acId===acId||legs.has(p.legId)||ofps.has(p.ofpId)||defs.has(p.defId)};
  const pick=new Map();
  for(const e of Object.values(EV))if((e.at>=since&&mine(e))||S.out.has(e.id))pick.set(e.id,e);
  // records the picked ones build on (flight opened, OFP imported, defect reported) come along even if older
  const need=new Set();for(const e of pick.values()){const p=e.p||{};if(p.legId)need.add('l'+p.legId);if(p.ofpId)need.add('o'+p.ofpId);if(p.defId)need.add('d'+p.defId)}
  for(const e of Object.values(EV)){const p=e.p||{};
    if((e.type==='leg.open'&&need.has('l'+p.legId))||(e.type==='ofp.import'&&need.has('o'+p.ofpId))||(e.type==='defect.report'&&need.has('d'+p.defId)))pick.set(e.id,e)}
  return [...pick.values()].sort((a,b)=>a.at<b.at?-1:1).map(e=>({id:e.id,type:e.type,p:e.p,at:e.at,n:e.n||0,by:e.by,bn:e.bn,dev:e.dev,seq:e.seq||0}));
}
function hoPackage(){const acId=hoAcId();const ac=acId&&S.ac[acId];
  return {f:'etl-handover',v:1,ac:acId||null,reg:ac?ac.reg:'',dev:DEV,at:new Date().toISOString(),ev:hoEvents(acId)}}
function hoMerge(pkg){
  if(!pkg||pkg.f!=='etl-handover'||!Array.isArray(pkg.ev))throw new Error('Tohle nejsou data z eTechLogu.');
  let added=0;
  for(const e of pkg.ev){
    if(!e||typeof e.id!=='string'||!HO_TYPES.has(e.type)||typeof e.at!=='string'||!e.p||typeof e.p!=='object')continue;
    if(EV[e.id])continue;
    EV[e.id]={id:e.id,type:e.type,p:e.p,at:e.at,n:+e.n||0,by:e.by,bn:e.bn,dev:e.dev,seq:+e.seq||0};OUT.push(e.id);added++;
  }
  if(added){persist();rebuild();render();flush()}
  return {added,total:pkg.ev.length,reg:pkg.reg||''};
}
// base45 (RFC 9285): binary as QR "alphanumeric" characters, the densest QR mode
const B45='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function b45enc(u8){let o='';for(let i=0;i<u8.length;i+=2){if(i+1<u8.length){let n=u8[i]*256+u8[i+1];o+=B45[n%45]+B45[(n/45|0)%45]+B45[n/2025|0]}else{const n=u8[i];o+=B45[n%45]+B45[n/45|0]}}return o}
function b45dec(s){const out=[];for(let i=0;i<s.length;i+=3){const c=B45.indexOf(s[i]),d=B45.indexOf(s[i+1]);if(c<0||d<0)throw new Error('Poškozený QR kód.');
  if(i+2<s.length){const e=B45.indexOf(s[i+2]);if(e<0)throw new Error('Poškozený QR kód.');const n=c+d*45+e*2025;out.push(n>>8,n&255)}else out.push(c+d*45)}return new Uint8Array(out)}
async function zip(u8,dir){const S2=dir?window.CompressionStream:window.DecompressionStream;if(!S2)return null;
  const st=new Blob([u8]).stream().pipeThrough(new S2('deflate'));return new Uint8Array(await new Response(st).arrayBuffer())}
async function hoFrames(pkg){
  const raw=new TextEncoder().encode(JSON.stringify(pkg));const z=await zip(raw,true).catch(()=>null);
  const body=b45enc(z||raw);const sid=Math.random().toString(36).slice(2,6).toUpperCase().padEnd(4,'0');
  const n=Math.max(1,Math.ceil(body.length/HO_CHUNK));const fr=[];
  // header: ETL + Z (deflate) / R (raw), 4-char session, frame index and count (3 digits each)
  for(let i=0;i<n;i++)fr.push('ETL'+(z?'Z':'R')+sid+String(i).padStart(3,'0')+String(n).padStart(3,'0')+body.slice(i*HO_CHUNK,(i+1)*HO_CHUNK));
  return fr;
}
function hoStop(){if(!hoRun)return;clearInterval(hoRun.timer);cancelAnimationFrame(hoRun.raf);if(hoRun.stream)hoRun.stream.getTracks().forEach(t=>t.stop());hoRun=null}
function hoBody(html){const b=document.querySelector('#sheet .sheet-body');if(b)b.innerHTML=html}
function openHandover(){
  hoStop();const acId=hoAcId();const ac=acId&&S.ac[acId];const evs=hoEvents(acId);const pend=evs.filter(e=>S.out.has(e.id)).length;
  openSheet('Druhý iPad'+(ac?' – '+ac.reg:''),`<div class="two">
    <div class="panel" style="margin:0"><p class="label">Předat z tohoto iPadu</p><p><b>${evs.length}</b> záznamů${ac?' letadla '+esc(ac.reg):''} za posledních ${HO_HOURS} h – lety, OFP, závady${pend?`, z toho <b>${pend}</b> ještě neodeslaných`:''}.</p>
      <div class="chips"><button type="button" class="btn primary" data-act="ho-qr" ${evs.length?'':'disabled'}>Ukázat QR kód</button><button type="button" class="btn" data-act="ho-file" ${evs.length?'':'disabled'}>Poslat souborem</button></div>
      <p class="muted" style="font-size:.84rem">Soubor jde poslat přes AirDrop – v režimu letadlo se zapnutou Wi-Fi a Bluetooth.</p></div>
    <div class="panel" style="margin:0"><p class="label">Převzít do tohoto iPadu</p><p>Z druhého iPadu, který ukazuje QR kód nebo poslal soubor.</p>
      <div class="chips"><button type="button" class="btn primary" data-act="ho-scan">Skenovat QR kód</button><label class="btn">Načíst soubor<input type="file" id="ho-in" accept=".json,application/json" hidden></label></div></div></div>
    <p class="muted">Data se jen doplní – nic se nepřepíše ani nezdvojí. Převzaté záznamy odešle na server i tento iPad, jakmile bude signál.</p>`,{focus:false});
}
async function hoShowQr(){
  try{
    if(!window.qrcode)await loadScript('vendor/qrcode.min.js');
    const fr=await hoFrames(hoPackage());
    hoBody(`<div style="text-align:center"><canvas id="ho-cv" style="width:min(100%,560px);aspect-ratio:1;background:#fff;border-radius:10px;image-rendering:pixelated"></canvas>
      <p style="margin:8px 0 0">Kód <b id="ho-i">1</b> / ${fr.length}</p>
      <p class="muted">Na druhém iPadu: <b>Druhý iPad → Skenovat QR kód</b>. Držte kameru nad tímto displejem, dokud druhý iPad neohlásí <b>Převzato</b>.</p>
      <div class="chips" style="justify-content:center"><button type="button" class="btn" data-act="close-sheet">Hotovo</button></div></div>`);
    const cv=document.getElementById('ho-cv');const ctx=cv.getContext('2d');
    const imgs=fr.map(t=>{const q=qrcode(0,'L');q.addData(t,'Alphanumeric');q.make();return q});
    const mc=Math.max(...imgs.map(q=>q.getModuleCount()));const sc=Math.max(3,Math.floor(560/(mc+8)));cv.width=cv.height=(mc+8)*sc;
    let i=0;const draw=()=>{const q=imgs[i];const m=q.getModuleCount();const off=Math.floor((cv.width-m*sc)/2);
      ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle='#000';
      for(let r=0;r<m;r++)for(let c=0;c<m;c++)if(q.isDark(r,c))ctx.fillRect(off+c*sc,off+r*sc,sc,sc);
      const el=document.getElementById('ho-i');if(el)el.textContent=i+1;i=(i+1)%imgs.length};
    draw();hoRun={timer:imgs.length>1?setInterval(draw,320):0,raf:0,frames:fr.length};
  }catch(e){hoBody(`<p class="form-err">QR kód se nepodařilo vytvořit: ${esc(e.message||e)}</p>`)}
}
async function hoScan(){
  hoStop();
  hoBody(`<video id="ho-v" playsinline muted autoplay style="width:100%;max-height:60vh;background:#000;border-radius:10px"></video>
    <p id="ho-st" style="margin:8px 0 4px">Namiřte kameru na QR kód na druhém iPadu…</p><div style="height:8px;background:var(--line,#ccd);border-radius:4px;overflow:hidden"><div id="ho-bar" style="height:100%;width:0;background:var(--ok,#2a7)"></div></div>`);
  try{
    if(!window.jsQR)await loadScript('vendor/jsqr.min.js');
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('Kamera tu není k dispozici.');
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
    const v=document.getElementById('ho-v');if(!v){stream.getTracks().forEach(t=>t.stop());return}
    v.srcObject=stream;await v.play().catch(()=>{});
    const cv=document.createElement('canvas');const ctx=cv.getContext('2d',{willReadFrequently:true});
    const got={};let sid=null,n=0,last=0;
    hoRun={timer:0,raf:0,stream};
    const tick=async t=>{
      if(!hoRun||hoRun.stream!==stream)return;
      hoRun.raf=requestAnimationFrame(tick);
      if(t-last<90||v.readyState<2)return;last=t;
      const w=Math.min(1024,v.videoWidth),h=Math.round(v.videoHeight*w/v.videoWidth);if(!w||!h)return;
      cv.width=w;cv.height=h;ctx.drawImage(v,0,0,w,h);
      const code=jsQR(ctx.getImageData(0,0,w,h).data,w,h,{inversionAttempts:'dontInvert'});
      if(!code||!/^ETL[ZR][0-9A-Z]{4}\d{6}/.test(code.data))return;
      const d=code.data,s2=d.slice(3,8),i=+d.slice(8,11),cnt=+d.slice(11,14);
      if(s2!==sid){sid=s2;n=cnt;for(const k in got)delete got[k]}
      if(got[i]==null){got[i]=d.slice(14);const k=Object.keys(got).length;
        const bar=document.getElementById('ho-bar'),st=document.getElementById('ho-st');if(bar)bar.style.width=Math.round(k/n*100)+'%';if(st)st.textContent=`Načteno ${k} z ${n} kódů…`}
      if(Object.keys(got).length===n){
        cancelAnimationFrame(hoRun.raf);stream.getTracks().forEach(x=>x.stop());hoRun=null;
        let body='';for(let k=0;k<n;k++)body+=got[k];
        let bytes=b45dec(body);if(s2[0]&&d[3]==='Z'){const u=await zip(bytes,false);if(!u)throw new Error('Tento iPad neumí rozbalit data – aktualizujte iPadOS.');bytes=u}
        hoDone(JSON.parse(new TextDecoder().decode(bytes)));
      }
    };
    hoRun.raf=requestAnimationFrame(tick);
  }catch(e){hoStop();const denied=e&&(e.name==='NotAllowedError'||e.name==='SecurityError');
    hoBody(`<p class="form-err">${denied?'Aplikace nemá povolenou kameru. Povolte ji v Nastavení iPadu (Soukromí → Kamera) a zkuste to znovu.':esc(e.message||String(e))}</p><div class="chips"><button type="button" class="btn" data-act="ho-scan">Zkusit znovu</button></div>`)}
}
function hoDone(pkg){
  try{const r=hoMerge(pkg);
    hoBody(`<div class="warnline ${r.added?'ok':'info'}" style="margin:0"><b>${r.added?'Převzato':'Nic nového'}</b> – ${r.added?`${r.added} nových záznamů`:'všech '+r.total+' záznamů už tento iPad má'}${r.reg?' · '+esc(r.reg):''}.</div>
      <div class="chips" style="margin-top:10px"><button type="button" class="btn primary" data-act="close-sheet">Hotovo</button></div>`);
    if(r.added)toast(`Převzato ${r.added} záznamů z druhého iPadu`);
  }catch(e){hoBody(`<p class="form-err">${esc(e.message||String(e))}</p>`)}
}
function hoSendFile(){
  // build synchronously: iOS opens the share sheet only straight from the tap
  const pkg=hoPackage();const json=JSON.stringify(pkg);
  const d=new Date();const stamp=d.toISOString().slice(0,16).replace(/[-:]/g,'').replace('T','-');
  const name=`eTechLog-${(pkg.reg||'data').replace(/[^A-Z0-9-]/gi,'')}-${stamp}.json`;
  let file=null;try{file=new File([json],name,{type:'application/json'})}catch(e){}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
    navigator.share({files:[file],title:name}).then(()=>toast('Soubor odeslán')).catch(e=>{if(e&&e.name!=='AbortError')saveFile(name,json)});
  }else saveFile(name,json);
}
function hoReadFile(file){
  const r=new FileReader();
  r.onload=()=>{let pkg;try{pkg=JSON.parse(r.result)}catch(e){hoBody('<p class="form-err">Soubor nejde přečíst.</p>');return}
    if(pkg&&pkg.format==='silesia-etechlog-backup'&&Array.isArray(pkg.events))pkg={f:'etl-handover',v:1,reg:'',ev:pkg.events};
    hoDone(pkg)};
  r.readAsText(file);
}

/* --- admin forms --- */
function openAcForm(id){
  const a=id?S.ac[id]:{};const hasLegs=id&&a.legs&&a.legs.length;
  openSheet(id?'Upravit '+a.reg:'Nové letadlo',`${hasLegs?'<div class="warnline caution">Letadlo už má zapsané lety. Změna počátečních hodin, cyklů nebo prvního čísla stránky přepočítá všechny navazující součty.</div>':''}<div class="fgrid wide">
    ${F.text('f-reg','Registrace',a.reg,{attrs:'autocapitalize="characters" placeholder="OK-ABC"'})}${F.text('f-type','Typ',a.type,{attrs:'placeholder="C560XLS+"'})}${F.text('f-msn','Výrobní číslo',a.msn)}
    ${F.text('f-start','Číslo první elektronické stránky',a.startPage,{attrs:'inputmode="numeric"'})}
    ${F.text('f-oair','TTAF při přechodu (h:mm)',a.openAir!=null?hm(a.openAir).replace(/ /g,''):'',{attrs:'inputmode="numeric" placeholder="3412:15"'})}${F.text('f-ocyc','Cykly při přechodu',a.openCyc!=null?String(a.openCyc):'',{attrs:'inputmode="numeric"'})}
    ${F.date('f-odate','Datum přechodu z papíru',a.openDate||todayISO())}${F.text('f-lastpaper','Poslední papírová stránka',a.lastPaper)}</div>
    ${id?F.check('f-arch','Archivovat (letadlo už neprovozujeme)',!!a.archived):''}
    <p class="muted">Přechodový bod z papíru – poslední papírová stránka, TTAF a cykly – je údaj, který patří i do CAME.</p>`,{submit:'Uložit',sign:true,onSubmit:async()=>{
    const reg=v('f-reg').toUpperCase();if(!/^[A-Z0-9]{1,2}-?[A-Z0-9]{2,5}$/.test(reg))fail('Registrace ve tvaru OK-ABC.');
    const start=parseInt(v('f-start'),10);if(!(start>0))fail('Zadejte číslo první stránky.');
    const oa=parseDur(v('f-oair'));if(oa==null)fail('TTAF ve tvaru hodiny:minuty.');const oc=parseInt(v('f-ocyc'),10);if(!(oc>=0))fail('Zadejte cykly.');
    await checkPin();const acId=id||rid('ac');emit([['ac.upsert',{acId,reg,type:v('f-type'),msn:v('f-msn'),startPage:start,openAir:oa,openCyc:oc,openDate:parseDate(v('f-odate'))||todayISO(),lastPaper:v('f-lastpaper'),archived:id?chk('f-arch'):false}]]);if(!id)UI.acId=acId;closeSheet();toast('Letadlo uloženo');
  }});
}
function openSettings(){
  const c=S.cfg;
  openSheet('Nastavení provozovatele',`<div class="warnline info">Platí pro celý deník a všechna zařízení. Každá změna se podepisuje a zůstává v auditu.</div>
    <div class="fgrid wide">${F.text('f-op','Název provozovatele',c.opName,{attrs:'placeholder="např. Silesia Air"'})}${F.text('f-aoc','Číslo AOC / CAMO',c.aoc,{attrs:'placeholder="např. CZ.CAMO.0092"'})}
    ${F.text('f-bases','Domovské základny (ICAO, oddělené čárkou)',(c.bases||[]).join(', '),{attrs:'autocapitalize="characters" placeholder="LKPR, LKTB"'})}</div>
    <fieldset><legend class="label">Doba letu a doba služby posádek</legend>
    <div class="fgrid wide">${F.sel('f-ftlby','Kdo počítá službu',Object.entries(FTL_BY),c.ftlBy)}${F.sel('f-rules','Pravidla',Object.entries(FTL_RULES),c.ftlRules)}
    ${F.text('f-om','Odkaz na provozní příručku',c.omRef,{attrs:'placeholder="např. OM-A 7, rev. 14"'})}
    ${F.text('f-rep','Nástup před 1. off-blockem (min)',String(c.reportMin),{attrs:'inputmode="numeric"'})}${F.text('f-post','Ukončení po posledním on-blocku (min)',String(c.postMin),{attrs:'inputmode="numeric"'})}</div>
    ${F.check('f-split','Provozní příručka povoluje split duty',!!c.splitDuty)}</fieldset>
    <fieldset><legend class="label">Technický deník</legend>${F.sel('f-pfmt','Číslování stránek',Object.entries(PAGE_FMT),c.pageFmt||'seq')}<p class="muted" style="font-size:.88rem">Změna formátu přečísluje zobrazení všech stránek – udělejte ji jen při přechodu z papíru a zapište ji do CAME.</p>
    <label class="fld full"><span>Rychlé volby pro CRS (jedna na řádek, nepovinné)</span><textarea id="f-crsq" placeholder="Daily check&#10;50 FH">${esc((c.crsQuick||[]).join('\n'))}</textarea></label></fieldset>
    <p class="muted">Výpočet služby zatím v testovací verzi neběží – tyto hodnoty určí, podle čeho se bude počítat a kam se budou posílat skutečné časy.</p>`,{submit:'Uložit nastavení',sign:true,onSubmit:async()=>{
    const op=v('f-op');if(op.length<2)fail('Vyplňte název provozovatele.');
    const bases=v('f-bases').toUpperCase().split(/[\s,;]+/).filter(Boolean);
    if(!bases.length||bases.some(b=>!/^[A-Z]{4}$/.test(b)))fail('Domovské základny zadejte jako 4písmenné ICAO kódy, např. LKPR.');
    const rep=num(v('f-rep')),post=num(v('f-post'));if(rep==null||post==null||rep>240||post>240)fail('Nástup a ukončení zadejte v minutách (0–240).');
    await checkPin();
    emit([['cfg.set',{opName:op,aoc:v('f-aoc'),bases,ftlBy:v('f-ftlby'),ftlRules:v('f-rules'),omRef:v('f-om'),reportMin:rep,postMin:post,splitDuty:chk('f-split'),pageFmt:v('f-pfmt')||'seq',crsQuick:v('f-crsq').split(/\n/).map(x=>x.trim()).filter(Boolean).slice(0,20)}]]);closeSheet();toast('Nastavení uloženo');
  }});
}
function openUserForm(id){
  const x=id?S.users[id]:{roles:['crew']};
  openSheet(id?'Upravit uživatele':'Nový uživatel',`<div class="fgrid wide">${F.text('f-name','Jméno',x.name)}${F.text('f-lic','Licence / oprávnění (mechanik)',x.licence)}
    ${F.text('f-email','Osobní e-mail pro přihlášení z webu (nepovinné)',x.email||'',{attrs:'inputmode="email" autocapitalize="off" autocomplete="off" placeholder="jmeno@firma.cz"'})}
    <label class="fld"><span>${id?'Nový PIN (nepovinné)':'PIN (4–6 číslic)'}</span><input type="password" id="f-upin" inputmode="numeric" autocomplete="off"></label></div>
    <fieldset><legend class="label">Role</legend>${F.check('r-crew','Posádka – zápis letů, závad a odkladů',x.roles.includes('crew'))}${F.check('r-mech','Mechanik – CRS, odstranění závad, uzemnění',x.roles.includes('mech'))}${F.check('r-camo','CAMO – opravy zápisů, správa, zálohy',x.roles.includes('camo'))}${can.settings(me())?F.check('r-admin','Správce – nastavení provozovatele, pravidla služby, základny',x.roles.includes('admin')):''}</fieldset>
    ${(S.cfg.bases||[]).length>1?F.sel('f-hb','Domovská základna',S.cfg.bases.map(b=>[b,b]),x.homeBase||S.cfg.bases[0]):''}
    ${id?F.check('f-active','Aktivní',x.active!==false):''}`,{submit:'Uložit',sign:true,onSubmit:async()=>{
    const name=v('f-name');if(name.length<3)fail('Vyplňte jméno.');const roles=['admin','crew','mech','camo'].filter(r=>chk('r-'+r)||(r==='admin'&&!can.settings(me())&&x.roles.includes('admin')));if(!roles.length)fail('Vyberte alespoň jednu roli.');
    const pin=v('f-upin');if(!id&&!/^\d{4,6}$/.test(pin))fail('PIN musí mít 4–6 číslic.');if(pin&&!/^\d{4,6}$/.test(pin))fail('PIN musí mít 4–6 číslic.');
    if(roles.includes('mech')&&!v('f-lic'))fail('Mechanik potřebuje číslo licence.');
    const email=v('f-email').toLowerCase();
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('E-mail není ve správném tvaru.');
    if(email&&Object.values(S.users).some(y=>y.userId!==id&&y.email===email))fail('Tento e-mail už má jiný uživatel.');
    if(email&&BIND&&email===acctEmail())fail('Tohle je účet iPadu v letadle – osobní e-mail musí být jiný, jinak by se iPady přihlašovaly jako tento uživatel.');
    if(id===me().id&&!roles.includes('camo')&&!roles.includes('admin'))fail('Sám sobě správu neodebírejte – zůstali byste bez přístupu.');
    if(id===me().id&&has(me(),'admin')&&!roles.includes('admin')&&!Object.values(S.users).some(y=>y.userId!==id&&y.active!==false&&has(y,'admin')))fail('Jste poslední správce – nejdřív přidělte roli správce někomu dalšímu.');
    await checkPin();const userId=id||rid('usr');const p={userId,name,licence:v('f-lic'),email,roles,active:id?chk('f-active'):true};if(v('f-hb'))p.homeBase=v('f-hb');if(pin)p.pinHash=await sha(userId+':'+pin);
    emit([['user.upsert',p]]);closeSheet();toast('Uživatel uložen');
  }});
}
function openSyncPanel(){openSheet('Synchronizace',`<div id="syncbody">${syncDetails()}</div><p class="muted">Každý zápis se nejdřív uloží v tomto zařízení. Odešle se hned, jak je spojení. Zápisy z ostatních iPadů se sem stáhnou automaticky.</p>`,{focus:false})}

/* --- exports --- */
async function saveFile(name,text){
  try{const type=/\.json$/.test(name)?'application/json':'text/csv';const url=URL.createObjectURL(new Blob([text],{type:type+';charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Soubor připraven ke stažení');return}catch(e){}
  openSheet('Export – '+name,`<p class="muted">Stažení tady není k dispozici. Obsah zkopírujte a uložte jako <span class="mono">${esc(name)}</span>.</p><div class="chips"><button type="button" class="btn sm" data-act="copy-out">Kopírovat</button></div><pre class="out" id="out-pre">${esc(text)}</pre>`,{focus:false});
}
function csv(rows){return rows.map(r=>r.map(c=>{const s=String(c==null?'':c);return /[",;\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(';')).join('\n')}
function exportLegs(){
  const ac=S.ac[UI.acId];const rows=[['stranka','let','datum','odkud','kam','off_block','vzlet','pristani','on_block','doba_letu','blok','pristani_pocet','druh','cislo_letu','PIC','SIC','podepsal','podepsano_utc','TTAF_po','cykly_po','opravy','zneplatneno','z_papiru','stav','security_cas','security_vysledek','security_podepsal','natankovano_L','palivo_odlet_lbs','min_required_lbs','palivo_po_pristani_lbs','spaleno_lbs','typ_priblizeni','PF']];
  for(const l of ac.legs){const op=l.state==='open';rows.push([l.page,l.idx,fmtDate(l.date),l.from,l.to,l.out,l.off,l.on,l.in,op?'':hm(l.air).replace(/ /g,''),op?'':hm(l.block).replace(/ /g,''),op?'':l.ldg,KIND[l.kind]||l.kind,l.fno,(S.users[l.pic]||{}).name,(S.users[l.sic]||{}).name,legBy(l).name,legAt(l),hm(l.ttaf).replace(/ /g,''),l.tcyc,l.history.length,l.void?'ano':'',l.paper?l.paper.page:'',op?'před odletem':'podepsáno',l.sec?l.sec.time:'',l.sec?(l.sec.result==='FOUND'?'nález':'bez nálezu'):'',l.sec?l.sec.byName:'',l.fuelUp??'',l.fuelBlk??'',l.fuelMin??'',l.fuelRem??'',l.fuelBurn??'',l.app??'',(S.users[l.pf]||{}).name||''])}
  saveFile(`ATL_${ac.reg}_lety_${todayISO()}.csv`,'﻿'+csv(rows));
}
function exportMonth(){
  const ac=S.ac[UI.acId];const rows=[['mesic','lety','doba_letu','blok','pristani','TTAF_konec','cykly_konec']];
  for(const r of monthly(ac))rows.push([r.k,r.legs,hm(r.air).replace(/ /g,''),hm(r.block).replace(/ /g,''),r.ldg,hm(r.ttaf).replace(/ /g,''),r.tcyc]);
  saveFile(`ATL_${ac.reg}_vykaz_${todayISO()}.csv`,'﻿'+csv(rows));
}
function exportJson(){
  const data={format:'silesia-etechlog-backup',version:1,exportedAt:new Date().toISOString(),device:DEV,events:S.list};
  saveFile(`ATL_zaloha_${todayISO()}.json`,JSON.stringify(data,null,1));
}
function importJson(file){
  const r=new FileReader();
  r.onload=()=>{try{const d=JSON.parse(r.result);if(d.format!=='silesia-etechlog-backup'||!Array.isArray(d.events))throw 0;let n=0;
    for(const e of d.events){if(e&&e.id&&e.type&&!EV[e.id]){EV[e.id]=e;OUT.push(e.id);n++}}
    persist();rebuild();render();flush();toast(n?`Obnoveno ${n} záznamů`:'Záloha neobsahuje nic nového');
  }catch(e){toast('Soubor není záloha eTechLogu')}};
  r.readAsText(file);
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;
  const act=t.dataset.act,id=t.dataset.id;
  if(['tab','crew-view','pick-ac','change-ac','logout','crew-logout','crew-end','office-on','office-off','page'].includes(act))ofpFlush();
  switch(act){
    case 'close-sheet':closeSheet();break;
    case 'pick-ac':UI.acId=id;UI.page=null;store.set('etl.ac',id);render();break;
    case 'tab':UI.tab=id;render();break;
    case 'page':if(id){UI.page=id;render()}break;
    case 'def-filter':UI.defFilter=id;render();break;
    case 'pick-user':UI.loginUser=id;render();setTimeout(()=>{const p=document.getElementById('lg-pin');if(p)p.focus()},30);break;
    case 'logout':openLogout('office');break;
    case 'crew-logout':openLogout('crew');break;
    case 'logout-confirm':doLogout(id);break;
    case 'goto-close':{const l=S.legs[id];if(!l)break;closeSheet();
      if(mode()==='crew'){if(BIND!==l.acId){UI.draft={who:UI.draft.who};}BIND=l.acId;store.set('etl.bind',BIND);saveDraft();UI.crewView='today';render();setTimeout(()=>{const c=document.querySelector('.step.next');if(c)c.scrollIntoView({block:'start',behavior:'smooth'})},40)}
      else{UI.acId=l.acId;store.set('etl.ac',l.acId);render();openCloseFlight()}break}
    case 'sync-panel':openSyncPanel();break;
    case 'sync-now':if(db&&net.state!=='auth'){pull();flush()}break;
    case 'dev-login':openSheet('Přihlásit zařízení',`<p class="muted">Zápisy v tomto zařízení zůstávají a po přihlášení se odešlou.</p><div class="fgrid wide">${F.text('dl-email','E-mail účtu zařízení',store.get('etl.lastEmail','')||'',{attrs:'autocomplete="username" inputmode="email" autocapitalize="off"'})}<label class="fld"><span>Heslo</span><input type="password" id="dl-pass" autocomplete="current-password"></label></div>`,{submit:'Přihlásit',onSubmit:async()=>{
      const email=v('dl-email'),pass=document.getElementById('dl-pass').value;if(!email||!pass)fail('Vyplňte e-mail a heslo.');
      const {data,error}=await db.auth.signInWithPassword({email,password:pass});
      if(error)fail(/Invalid login/i.test(String(error.message))?'Nesprávný e-mail nebo heslo.':navigator.onLine===false?'Přihlášení potřebuje internet.':sbErr(error));
      store.set('etl.lastEmail',email);store.set('etl.acct',data.user.email);store.set('etl.needLogin',false);net.email=data.user.email;net.err=null;closeSheet();startSync();toast('Zařízení přihlášeno')}});break;
    case 'dev-logout':openSheet(personal()?'Odhlásit se?':'Odhlásit zařízení?',`<p>${personal()?'Účet '+esc(acctEmail())+' se v tomto prohlížeči odhlásí.':'Zařízení se odpojí od serveru.'} Data v něm zůstanou${OUT.length?`, ale <b>${OUT.length} neodeslaných záznamů</b> se odešle až po novém přihlášení`:''}.</p><div class="chips"><button type="button" class="btn" data-act="close-sheet">Zpět</button><button type="button" class="btn danger" data-act="dev-logout-ok">${personal()?'Odhlásit':'Odhlásit zařízení'}</button></div>`,{focus:false});break;
    case 'dev-logout-ok':{const was=personal();closeSheet();store.set('etl.acct','');store.set('etl.needLogin',true);if(was){SESSION=null;store.set('etl.session',null)}Promise.resolve().then(()=>db.auth.signOut()).catch(()=>{}).finally(()=>{net.email=null;net.state='auth';stopSync();render()});break}
    case 'leg-form':openLegForm();break;
    case 'predep-form':openPredep();break;
    case 'ofp-pick':{const f=document.getElementById('ofp-file');if(f)f.click();break}
    case 'ofp-open':ofpFlush();UI.ofpId=id;closeSheet();if(mode()==='crew'){const o=ofpOf(id);if(o&&o.acId!==BIND){BIND=o.acId;store.set('etl.bind',BIND)}UI.crewView='ofp'}else{const o=ofpOf(id);if(o){UI.acId=o.acId;store.set('etl.ac',o.acId)}UI.tab='ofp'}render();window.scrollTo(0,0);break;
    case 'ofp-dct':case 'ofp-dct-undo':{const [oid,ix]=String(id).split('|');const o=ofpOf(oid);if(!o)break;const i=+ix;
      if(act==='ofp-dct'){let from=0;o.wpts.forEach((p,k)=>{if(k<i&&!p.rvsm&&parseHM(ofpVal(o,'w'+k+'_ato'))!=null)from=k});ofpSet(oid,'w'+i+'_dct','1');ofpSet(oid,'w'+i+'_dctFrom',String(from));toast(`Direct to ${o.wpts[i].wpt} z ${o.wpts[from].wpt}`)}
      else{ofpSet(oid,'w'+i+'_dct','');ofpSet(oid,'w'+i+'_dctFrom','')}
      ofpFlush();render();break}
    case 'ofp-back':ofpFlush();UI.ofpId=null;render();window.scrollTo(0,0);break;
    case 'ofp-start':ofpFlush();startFromOfp(id);break;
    case 'ofp-unlink':UI.draft.ofpId=null;saveDraft();render();break;
    case 'ofp-sign':{ofpFlush();const o=ofpOf(id);if(!o)break;openSheet('Podpis OFP – '+o.flt,`<div class="statement">Velitel letadla potvrzuje, že převzal provozní letový plán ${esc(o.flt)} ${esc(o.dep)} → ${esc(o.des)} (OFP ${esc(o.ofpId)}).</div>`,{submit:'Podepsat OFP',sign:true,onSubmit:async()=>{await checkPin();emit([['ofp.sign',{ofpId:o.ofpId}]]);closeSheet();toast('OFP podepsán')}});break}
    case 'ofp-close':openOfpClose(id);break;
    case 'ofp-reopen':{const o=ofpOf(id);if(!o)break;openSheet('Znovu otevřít OFP '+o.flt,`${F.area('f-reason','Důvod','','např. oprava ATO, doplnění přistávacích dat')}<p class="muted">Let v ATL se tím nemění – opravuje se přes Opravit zápis.</p>`,{submit:'Otevřít OFP',sign:true,onSubmit:async()=>{const r=v('f-reason');if(r.length<4)fail('Napište důvod.');const l=o.leg;if(!(has(me(),'camo')||(l&&l.pic===me().id)))fail('Znovu otevřít smí jen PIC letu nebo CAMO.');await checkPin();emit([['ofp.reopen',{ofpId:o.ofpId,reason:r}]]);closeSheet();toast('OFP otevřen')}});break}
    case 'ofp-void':{const o=ofpOf(id);if(!o)break;openSheet('Zrušit OFP '+o.flt,`${F.area('f-reason','Důvod','','např. nahrán nový OFP, let zrušen')}`,{submit:'Zrušit OFP',sign:true,onSubmit:async()=>{const r=v('f-reason');if(r.length<4)fail('Napište důvod.');await checkPin();emit([['ofp.void',{ofpId:o.ofpId,reason:r}]]);UI.ofpId=null;closeSheet();toast('OFP zrušen')}});break}
    /* crew mode */
    case 'start-pic':UI.startPic=id;UI.startSic=null;render();setTimeout(()=>{const s=document.querySelector('[data-act="start-sic"]');if(s)s.scrollIntoView({block:'center',behavior:'smooth'})},30);break;
    case 'start-sic':UI.startSic=id;render();setTimeout(()=>{const p=document.getElementById('st-pin');if(p){p.focus();p.scrollIntoView({block:'center',behavior:'smooth'})}},30);break;
    case 'crew-view':UI.crewView=id;UI.page=null;render();window.scrollTo(0,0);break;
    case 'crew-end':openCrewEnd();break;
    case 'crew-end-confirm':CREW=null;store.set('etl.crew',null);UI.draft={};saveDraft();UI.crewView='today';closeSheet();render();toast('Den ukončen');break;
    case 'crew-pre':emit([['daily.sign',{acId:BIND,date:todayISO(),kind:'PRE',tyres:'',oil:'',brakes:false,notes:''}]],whoId());toast('Předletová prohlídka podepsána');break;
    case 'sec-found':UI.draft.secFound=id==='1';saveDraft();render();if(id==='1')setTimeout(()=>{const ta=document.querySelector('[data-k="secNote"]');if(ta)ta.focus()},30);break;
    case 'who':UI.draft.who=id;saveDraft();render();break;
    case 'from-edit':UI.draft.fromEdit=true;saveDraft();render();break;
    case 'date-edit':UI.draft.dateEdit=true;saveDraft();render();break;
    case 'fuel-open':UI.draft.fuelOpen=!UI.draft.fuelOpen;saveDraft();render();break;
    case 'def-on':UI.draft.defOn=id==='1';saveDraft();render();if(id==='1')setTimeout(()=>{const ta=document.querySelector('[data-k="defText"]');if(ta)ta.focus()},30);break;
    case 'pick-to':{UI.draft.to=id;saveDraft();const el=document.getElementById('c-to');if(el)el.value=id;crewLive();const o=document.getElementById('c-out');if(o&&!o.value)o.focus();break}
    case 'ldg':{const el=document.getElementById('c-ldg');const n=Math.min(20,Math.max(1,(parseInt(el&&el.value,10)||1)+parseInt(id,10)));UI.draft.ldg=String(n);saveDraft();if(el)el.value=n;break}
    case 'crew-start':crewStart();break;
    case 'crew-close':crewClose();break;
    case 'cdate-edit':UI.draft.cdateEdit=true;saveDraft();render();break;
    case 'pf':UI.draft.pf=id;saveDraft();render();break;
    case 'divert':UI.draft.divert=true;saveDraft();render();break;
    case 'start-flight':openStartFlight();break;
    case 'close-flight':openCloseFlight();break;
    case 'sheet-to':{const el=document.getElementById('f-to');if(el){el.value=id;if(sheetLive)sheetLive()}break}
    case 'sldg':{const el=document.getElementById('s-ldg');if(el)el.value=Math.min(20,Math.max(1,(parseInt(el.value,10)||1)+parseInt(id,10)));break}
    case 'pick-crew-ac':BIND=id;store.set('etl.bind',BIND);UI.draft={};saveDraft();UI.crewView='today';render();window.scrollTo(0,0);break;
    case 'change-ac':BIND=null;store.set('etl.bind',null);UI.crewView='today';render();window.scrollTo(0,0);break;
    case 'settings-form':openSettings();break;
    case 'crs-quick':{const el=document.getElementById('f-scope');if(el){el.value=el.value?el.value+' + '+id:id}break}
    case 'office-on':setOffice(true);SESSION=null;store.set('etl.session',null);render();window.scrollTo(0,0);break;
    case 'office-off':setOffice(false);SESSION=null;store.set('etl.session',null);render();window.scrollTo(0,0);break;
    case 'bind':{const sel=document.getElementById('bind-sel');if(sel&&sel.value){BIND=sel.value;store.set('etl.bind',BIND);UI.office=false;UI.draft={};saveDraft();CREW=null;store.set('etl.crew',null);closeSheet();render();window.scrollTo(0,0)}break}
    case 'unbind':openSheet('Odpojit iPad od letadla?',`<p>iPad přestane být iPadem letadla ${esc((S.ac[BIND]||{}).reg||'')} a vrátí se k přihlášení jménem. Zapsané záznamy zůstávají.</p><div class="chips"><button type="button" class="btn" data-act="close-sheet">Zpět</button><button type="button" class="btn danger" data-act="unbind-confirm">Odpojit</button></div>`,{focus:false});break;
    case 'unbind-confirm':BIND=null;store.set('etl.bind',null);CREW=null;store.set('etl.crew',null);UI.draft={};UI.office=false;closeSheet();render();break;
    case 'complete-leg':{const l=S.legs[id];if(!l)break;closeSheet();
      if(mode()==='crew'){if(BIND!==l.acId){UI.draft={who:UI.draft.who};saveDraft()}BIND=l.acId;store.set('etl.bind',BIND);UI.closeLeg=id;UI.crewView='today';render();setTimeout(()=>{const c=document.querySelector('.step.next');if(c)c.scrollIntoView({block:'start',behavior:'smooth'})},40)}
      else{UI.acId=l.acId;store.set('etl.ac',l.acId);render();openCloseFlight(id)}break}
    case 'copy-sec':{const l=S.legs[id];if(!l||!l.sec)break;const txt=secText(l);
      const fallback=()=>{openSheet('Potvrzení bezpečnostní prohlídky',`<p class="muted">Text je připravený ke zkopírování.</p><pre class="out" id="out-pre">${esc(txt)}</pre>`,{focus:false});selectPre(document.getElementById('out-pre'))};
      try{navigator.clipboard.writeText(txt).then(()=>toast('Potvrzení zkopírováno'),fallback)}catch(err){fallback()}break}
    case 'leg-detail':openLegDetail(id);break;
    case 'amend-form':openAmend(id);break;
    case 'void-form':openVoid(id);break;
    case 'defect-form':openDefectForm();break;
    case 'defer-form':openDefer(id);break;
    case 'rectify-form':openRectify(id);break;
    case 'defect-detail':openDefectDetail(id);break;
    case 'crs-form':openCrs();break;
    case 'crs-leg':{const l=S.legs[id];if(l){UI.acId=l.acId;closeSheet();openCrs(id)}break}
    case 'ground-form':openGround();break;
    case 'daily-form':openDaily();break;
    case 'ac-form':openAcForm(id);break;
    case 'ho':openHandover();break;
    case 'ofp-pdf':openOfpPdf(id);break;
    case 'ofp-rules':openOfpRules();break;
    case 'ofp-divert':ofpSet(id,'dv','1');ofpFlush();render();setTimeout(()=>{const el=document.querySelector('[data-of="dv_start"]');if(el){el.scrollIntoView({block:'center'});el.focus()}},50);break;
    case 'ofp-divert-undo':ofpSet(id,'dv','');ofpFlush();render();toast('Divert zrušen – vyplněné údaje zůstávají v auditu');break;
    case 'pdf-share':sharePdf();break;
    case 'ho-qr':hoShowQr();break;
    case 'ho-scan':hoScan();break;
    case 'ho-file':hoSendFile();break;
    case 'carry-form':openCarryForm(id);break;
    case 'golive-form':openGoLive(id);break;
    case 'user-form':openUserForm(id);break;
    case 'export-json':exportJson();break;
    case 'export-legs':exportLegs();break;
    case 'export-month':exportMonth();break;
    case 'today':{const el=document.getElementById(id);if(el){el.value=fmtDate(todayISO());el.dispatchEvent(new Event('input',{bubbles:true}))}break}
    case 'add-defrow':{const box=document.getElementById('def-rows');box.insertAdjacentHTML('beforeend',defRowHtml());const n=document.getElementById('nil-note');if(n)n.hidden=true;const ta=box.lastElementChild.querySelector('textarea');if(ta)ta.focus();break}
    case 'del-defrow':{t.closest('.def-row').remove();const n=document.getElementById('nil-note');if(n)n.hidden=!!document.querySelector('.def-row');break}
    case 'copy-out':{const pre=document.getElementById('out-pre');const txt=pre?pre.textContent:'';
      try{navigator.clipboard.writeText(txt).then(()=>toast('Zkopírováno'),()=>selectPre(pre))}catch(err){selectPre(pre)}break}
  }
});
function selectPre(pre){if(!pre)return;const r=document.createRange();r.selectNodeContents(pre);const s=getSelection();s.removeAllRanges();s.addRange(r);toast('Text je označený – zkopírujte ho')}

document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='page-sel'){UI.page=t.value;render()}
  else if(t.id==='simoff'){SIMOFF=t.checked;store.set('etl.simoff',SIMOFF);if(!SIMOFF){applyRemote();flush()}render();const sb=document.getElementById('syncbody');if(sb)sb.innerHTML=syncDetails()}
  else if(t.id==='audit-all'){UI.auditAll=t.checked;render()}
  else if(t.id==='q-all'){UI.qAll=t.checked;const r=document.getElementById('q-res');if(r)r.innerHTML=searchResults(S.ac[UI.acId])}
  else if(t.id==='ofp-file'&&t.files&&t.files[0]){importOfp(t.files[0]);t.value=''}
  else if(t.id==='import-file'&&t.files&&t.files[0]){importJson(t.files[0]);t.value=''}
  else if(t.type==='checkbox'&&t.dataset&&t.dataset.of==='nonRvsm'){const c=t.closest('[data-ofp]');if(c){ofpSet(c.dataset.ofp,'nonRvsm',t.checked?'1':'');c.querySelectorAll('.rvsm-only').forEach(x=>x.hidden=t.checked)}}
  else if(t.id==='ho-in'&&t.files&&t.files[0]){hoReadFile(t.files[0]);t.value=''}
  else if(t.id==='f-paper'){const r=document.getElementById('paper-row');if(r)r.hidden=!t.checked}
  else if(t.classList.contains('d-mel')){const f=t.closest('.def-row').querySelector('.d-melf');if(f)f.hidden=!t.checked}
  else if(t.dataset&&t.dataset.k&&(t.type==='checkbox'||t.type==='radio'||t.tagName==='SELECT')){UI.draft[t.dataset.k]=t.type==='checkbox'?t.checked:t.value;saveDraft();if(t.dataset.k==='defMel'||t.dataset.k==='secRes')render();else if(t.dataset.k==='app'){const o=document.getElementById('c-app-other');if(o)o.hidden=t.value!=='OTHER';crewLive()}else crewLive()}
  if(sheetLive&&t.closest('#sf'))sheetLive();
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.classList.contains('icao'))t.value=t.value.toUpperCase().replace(/[^A-Z]/g,'');
  const ofpC=t.closest&&t.closest('[data-ofp]');
  if(ofpC&&t.dataset.of){
    if(t.classList.contains('t4')){const dg=t.value.replace(/\D/g,'').slice(0,4);if(dg.length===4){t.value=dg.slice(0,2)+':'+dg.slice(2);t.classList.toggle('bad',parseHM(t.value)==null)}else t.classList.remove('bad')}
    ofpSet(ofpC.dataset.ofp,t.dataset.of,t.type==='checkbox'?(t.checked?'1':''):t.value);
    if(t.dataset.max){const f2=t.closest('.fld');if(f2)f2.classList.toggle('over',num(t.value)!=null&&num(t.value)>+t.dataset.max)}
    if(t.dataset.of==='nonRvsm')ofpC.querySelectorAll('.rvsm-only').forEach(x=>x.hidden=t.checked);
    if(t.dataset.pair){const ot=document.getElementById(t.dataset.pair);const dep=num(t.dataset.dep),vv=num(t.value);if(ot&&dep!=null){ot.value=vv==null?'':String(dep-vv);ot.classList.toggle('bad',vv!=null&&dep-vv<0);ofpSet(ofpC.dataset.ofp,ot.dataset.of,ot.value)}}
    if(t.classList.contains('t4')&&/^\d{2}:\d{2}$/.test(t.value)&&/^x_/.test(t.dataset.of)){const nxt={x_out:'x_off',x_on:'x_in'}[t.dataset.of];const nx=nxt&&ofpC.querySelector(`[data-of="${nxt}"]`);if(nx)nx.focus();else t.blur()}
    if(t.classList.contains('icao'))ofpSet(ofpC.dataset.ofp,t.dataset.of,t.value);
    const mm=t.dataset.of.match(/^w(\d+)_fuel$/);if(mm){const o=ofpOf(ofpC.dataset.ofp);const p=o&&o.wpts[+mm[1]];const c=document.getElementById('wd-'+mm[1]);const a=num(t.value);if(c&&p){const df=a==null?null:a-p.mreq;c.textContent=df==null?'':(df>0?'+':'')+fmtN(df);c.style.color=df==null?'inherit':df<0?'var(--warn)':'var(--ok)'}}
    return;
  }
  if(t.id==='f-pin'||t.id==='lg-pin')t.classList.remove('bad');
  if(t.id==='f-due')t.dataset.touched='1';
  if(t.id==='q'){UI.q=t.value;const r=document.getElementById('q-res');if(r)r.innerHTML=searchResults(S.ac[UI.acId]);return}
  if(t.id==='st-pin'){t.classList.remove('bad');const er=document.getElementById('st-err');if(er)er.hidden=true}
  if(t.classList.contains('t4')){
    const dg=t.value.replace(/\D/g,'').slice(0,4);
    if(dg.length===4){t.value=dg.slice(0,2)+':'+dg.slice(2);const ok=parseHM(t.value)!=null;t.classList.toggle('bad',!ok);
      if(ok){const pre=t.id.slice(0,2);const order=['out','off','on','in'].map(k=>pre+k);const nx=document.getElementById(order[order.indexOf(t.id)+1]);if(t.dataset.k){UI.draft[t.dataset.k]=t.value;saveDraft();crewLive()}if(sheetLive&&t.closest('#sf'))sheetLive();if(nx)nx.focus();else t.blur();return}}
    else t.classList.remove('bad');
  }
  if(t.dataset&&t.dataset.pair){const o=document.getElementById(t.dataset.pair);const dep=num(t.dataset.dep),val=num(t.value);
    if(o&&dep!=null){o.value=val==null?'':String(dep-val);o.classList.toggle('bad',val!=null&&dep-val<0);if(o.dataset.k){UI.draft[o.dataset.k]=o.value}}}
  if(t.dataset&&t.dataset.k&&t.type!=='checkbox'&&t.type!=='radio'&&t.tagName!=='SELECT'){UI.draft[t.dataset.k]=t.value;saveDraft();const er=document.getElementById('c-err');if(er)er.hidden=true;crewLive()}
  if(sheetLive&&t.closest('#sf'))sheetLive();
});
document.addEventListener('focusout',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('t-hm')&&t.value){t.value=normHM(t.value);t.classList.toggle('bad',parseHM(t.value)==null);if(sheetLive)sheetLive()}
  if(t.classList&&t.classList.contains('t-date')&&t.value){const d=parseDate(t.value);t.classList.toggle('bad',!d);if(d){t.value=fmtDate(d);if(t.dataset.k){UI.draft[t.dataset.k]=t.value;saveDraft()}}}
  if(t.classList&&t.classList.contains('t4')&&t.value){const n=normHM(t.value);t.value=n;t.classList.toggle('bad',parseHM(n)==null);if(t.dataset.k){UI.draft[t.dataset.k]=n;saveDraft();crewLive()}else if(t.dataset.of){const c=t.closest('[data-ofp]');if(c)ofpSet(c.dataset.ofp,t.dataset.of,n)}else if(sheetLive)sheetLive()}
  if(renderPending)setTimeout(()=>{if(renderPending)softRender()},60);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});

document.addEventListener('submit',async e=>{
  const f=e.target;e.preventDefault();
  if(f.id==='sf'&&sheetSubmit){
    const err=document.getElementById('ferr');err.hidden=true;const btn=f.querySelector('button[type=submit]');if(btn)btn.disabled=true;
    try{await sheetSubmit(f)}catch(x){if(err){err.textContent=x&&x.message?x.message:'Uložení se nepovedlo.';err.hidden=false;err.scrollIntoView({block:'nearest'})}}
    finally{if(btn&&document.body.contains(btn))btn.disabled=false}
  }else if(f.id==='dev-login'){
    const email=v('dl-email'),pass=document.getElementById('dl-pass').value;const err=document.getElementById('dl-err');const btn=f.querySelector('button[type=submit]');
    if(!email||!pass){err.textContent='Vyplňte e-mail a heslo.';err.hidden=false;return}
    btn.disabled=true;
    try{const {data,error}=await db.auth.signInWithPassword({email,password:pass});if(error)throw error;store.set('etl.lastEmail',email);store.set('etl.acct',data.user.email);store.set('etl.needLogin',false);net.email=data.user.email;net.err=null;startSync()}
    catch(x){err.textContent=/Invalid login/i.test(String(x&&x.message))?'Nesprávný e-mail nebo heslo.':navigator.onLine===false?'Přihlášení potřebuje internet.':sbErr(x);err.hidden=false;btn.disabled=false}
  }else if(f.id==='start-form'){
    const u=S.users[UI.startPic];const pin=v('st-pin');const err=document.getElementById('st-err');
    if(u&&pin&&await sha(u.userId+':'+pin)===u.pinHash){CREW={acId:BIND,pic:u.userId,sic:UI.startSic&&UI.startSic!=='-'?UI.startSic:null,at:Date.now()};store.set('etl.crew',CREW);UI.startPic=null;UI.startSic=null;UI.crewView='today';render();window.scrollTo(0,0)}
    else{err.textContent='Nesprávný PIN.';err.hidden=false;const p=document.getElementById('st-pin');if(p){p.value='';p.classList.add('bad')}}
  }else if(f.id==='login-form'){
    const u=S.users[UI.loginUser];const pin=v('lg-pin');const err=document.getElementById('lg-err');
    if(u&&pin&&await sha(u.userId+':'+pin)===u.pinHash){SESSION={userId:u.userId,at:Date.now()};store.set('etl.session',SESSION);UI.loginUser=null;UI.tab='log';render()}
    else{err.textContent='Nesprávný PIN.';err.hidden=false;const p=document.getElementById('lg-pin');p.value='';p.classList.add('bad')}
  }else if(f.id==='setup-form'){
    const name=v('su-name'),pin=v('su-pin');const err=document.getElementById('su-err');
    if(name.length<3||!/^\d{4,6}$/.test(pin)){err.textContent='Vyplňte jméno a PIN o 4–6 číslicích.';err.hidden=false;return}
    const userId=rid('usr');const pinHash=await sha(userId+':'+pin);
    SEQ++;const ev={id:rid('ev'),type:'user.upsert',p:{userId,name,roles:['admin','camo','crew'],licence:'',pinHash,active:true},at:new Date().toISOString(),n:0,by:userId,bn:name,dev:DEV,seq:SEQ};
    EV[ev.id]=ev;OUT.push(ev.id);SESSION={userId,at:Date.now()};store.set('etl.session',SESSION);setOffice(true);persist();rebuild();UI.tab='setup';render();flush();
  }
});

/* ---------- boot ---------- */
rebuild();render();initDb();
checkOffline();if('serviceWorker' in navigator){navigator.serviceWorker.ready.then(()=>setTimeout(checkOffline,500)).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>setTimeout(checkOffline,500))}
setInterval(()=>{if(off.ready!==true)checkOffline()},15000);
})();
