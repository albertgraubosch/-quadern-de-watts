(function(){
"use strict";
const APP_VERSION="1.20.1";
const DAYS=["Dg","Dl","Dt","Dc","Dj","Dv","Ds"];
const DAYNAMES=["Diumenge","Dilluns","Dimarts","Dimecres","Dijous","Divendres","Dissabte"];
const MONTHS=["gen","feb","març","abr","maig","juny","jul","ag","set","oct","nov","des"];
const CATNAMES={ss:"sweet spot",tempo:"tempo",force:"força-resistència"};
const ZONES=[["Z1 Recuperació","z1",0,.55],["Z2 Resistència","z2",.56,.75],["Z3 Tempo","z3",.76,.90],["Sweet spot","ss",.88,.94],["Z4 Llindar","z4",.91,1.05],["Z5 VO2màx","z5",1.06,1.20],["Z6 Anaeròbica","z5",1.21,1.50],["Z7 Neuromuscular","z7",1.51,null]];
const OVERLAY_KEYS=["d","status","k","adjNote","movedFrom","done","adjDone","replacedBy","type","z","t","min","maxMin","steps","ints","band","cad","cat","fuel","note","key","coachEdit","userAdj"];

/* ---------- Storage ---------- */
function lsGet(k,def){try{const v=localStorage.getItem(k);return v==null?def:JSON.parse(v)}catch(e){return def}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
let plan=lsGet("qw.plan",null);
let state=lsGet("qw.state",{ftp:null,ov:{},log:[]});
if(!state.ov)state.ov={};if(!state.log)state.log=[];if(!state.checkins)state.checkins={};if(!state.weights)state.weights=[];
let strava=lsGet("qw.strava",{});
function saveState(){lsSet("qw.state",state)}
function saveStrava(){lsSet("qw.strava",strava)}

let START="2026-10-19",WEIGHT=75,FTP0=240,GOAL=280;
let S={};
let planState="loading",planMsg="";
let stravaState="idle",stravaMsg="";
let runActs={},allList=[],titles=lsGet("qw.titles",null),titleOff={},gymActs={},acts={},data={},loading={},seenActs=null,lastLoad=0;
let chooser=null,weekSel=null,selId=null;
let todayStr=localDate(new Date());

const ftp=()=>state.ftp||(plan&&plan.ftp)||245;
function localDate(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function parseD(s){const a=s.split("-");return new Date(+a[0],+a[1]-1,+a[2])}
function addDays(s,n){const d=parseD(s);d.setDate(d.getDate()+n);return localDate(d)}
function dayLabel(s){const d=parseD(s);return DAYS[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()]}
function weekNo(s){return Math.floor(Math.round((parseD(s)-parseD(START))/864e5)/7)+1}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function W(p,k){return Math.round(p*(k||1)*ftp())}
function fillW(txt,k){return esc(txt).replace(/\{(\d+)(?:,(\d+))?\}/g,(_,a,b)=>'<span class="w">'+(b?W(a/100,k)+"–"+W(b/100,k):W(a/100,k))+" W</span>")}
function fmtDur(sec){sec=Math.round(sec);let h=Math.floor(sec/3600),m=Math.round((sec%3600)/60);if(m===60){h++;m=0}return h?h+"h"+String(m).padStart(2,"0"):m+"′"}
function fmtPlanDur(p){if(!p.min)return "—";if(p.maxMin)return fmtDur(p.min*60)+"–"+fmtDur(p.maxMin*60);return fmtDur(p.min*60)}
function active(s){return s.status!=="removed"&&s.status!=="replaced"}
function byOrder(a,b){return a.d<b.d?-1:a.d>b.d?1:(a.ord||0)-(b.ord||0)}
function all(){return Object.values(S).sort(byOrder)}
function sessionsOn(d){return all().filter(s=>s.d===d&&active(s))}
const RUN_RE=/Run/i;
function isRun(a){return RUN_RE.test(String(a&&a.sport_type||""))}
function indexRuns(list){const r={};(list||[]).forEach(a=>{if(a&&a.start_local&&isRun(a)){const d=a.start_local.slice(0,10);(r[d]=r[d]||[]).push(a)}});Object.values(r).forEach(x=>x.sort((a,b)=>(b.moving_time||0)-(a.moving_time||0)));return r}
function runFor(s){if(s.type!=="run"||!active(s))return null;const l=runActs[s.d];return l&&l.length?l[0]:null}
function extraRuns(d){const l=runActs[d]||[];const planned=all().filter(s=>s.d===d&&s.type==="run"&&active(s)).length;return l.slice(planned)}
function paceTxt(sec){sec=Math.round(sec);return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")}
function runStats(a){const km=(a.distance||0)/1000,t=a.moving_time||0;return [["Temps",fmtDur(t)],["Distància",km?km.toFixed(1).replace(".",",")+" km":"—"],["Ritme",km?paceTxt(t/km):"—"]]}
function actFor(s){if(s.type==="gym"||s.type==="run")return null;const a=acts[s.d];if(!a||!active(s))return null;if(s.type==="rest"&&sessionsOn(s.d).some(x=>x.type!=="rest"))return null;return a}
function isMissed(s){return active(s)&&s.type!=="rest"&&s.type!=="gym"&&s.d<todayStr&&!s.done&&!actFor(s)&&!runFor(s)&&stravaState==="on"}
function steps(s){return (s.steps||[]).map(x=>Array.isArray(x)?{l:x[0],x:x[1]}:x)}
function zoneOf(p){return p<.56?"z1":p<.76?"z2":p<.88?"z3":p<.95?"ss":p<1.06?"z4":p<1.21?"z5":"z7"}
let toastT=0;
function toast(msg){const t=document.getElementById("toast");document.getElementById("toastMsg").textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},4200)}

/* ---------- Plan ---------- */
function buildSessions(){
  const next={};
  if(!plan||!Array.isArray(plan.sessions))return next;
  plan.sessions.forEach(b=>{
    if(!b||!b.id)return;
    const o=state.ov[b.id]||{};
    next[b.id]=Object.assign({status:"planned"},b,o,{id:b.id});
  });
  return next;
}
function applyPlanMeta(){
  if(!plan)return;
  START=plan.start||START;
  const a=plan.athlete||{};WEIGHT=a.weight||WEIGHT;FTP0=a.ftpStart||FTP0;GOAL=a.goalFtp||GOAL;applyWeight();
}
function setOv(id,patch){
  const cur=Object.assign({},state.ov[id]||{});
  Object.keys(patch).forEach(k=>{if(OVERLAY_KEYS.includes(k)){if(patch[k]==null)delete cur[k];else cur[k]=patch[k]}});
  state.ov[id]=cur;S[id]=Object.assign({},S[id],patch);saveState();
}
function addLog(txt){state.log=state.log.concat([{at:new Date().toISOString(),txt}]).slice(-60);saveState()}
function loadTitles(){return fetch("titles.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(t=>{if(t&&Array.isArray(t.phrases)){titles=t;lsSet("qw.titles",t);renderTitles()}}).catch(()=>{})}
function loadPlan(){
  loadTitles();
  return fetch("plan.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("http "+r.status);return r.json()})
  .then(p=>{
    const changed=!plan||plan.updated!==p.updated||plan.version!==p.version;
    const firstLoad=!plan;
    plan=p;lsSet("qw.plan",p);applyPlanMeta();S=buildSessions();planState="ready";memo.clear();
    if(changed&&!firstLoad)toast("Pla actualitzat per Claude ("+(p.updated||"")+").");
    render();
  })
  .catch(()=>{
    if(plan){applyPlanMeta();S=buildSessions();planState="ready";planMsg="Sense connexió: mostro l'última versió del pla."}
    else{planState="err";planMsg="No s'ha pogut carregar el pla. Comprova la connexió i torna a obrir l'app."}
    render();
  });
}

/* ---------- Analysis ---------- */
function expand(time,arr){const out=[];if(!arr||!time)return out;for(let i=0;i<arr.length;i++){let dt=i+1<time.length?time[i+1]-time[i]:1;if(!(dt>=1)||dt>5)dt=1;const v=arr[i]==null?0:arr[i];for(let k=0;k<dt;k++)out.push(v)}return out}
function meanNZ(a){let s=0,n=0;for(const v of a)if(v>0){s+=v;n++}return n?s/n:0}
function bestWindows(w,cad,L,n){
  if(w.length<L)return [];
  const pre=new Float64Array(w.length+1);for(let i=0;i<w.length;i++)pre[i+1]=pre[i]+w[i];
  const m=w.length-L+1,blocked=new Uint8Array(m),res=[];
  for(let k=0;k<n;k++){
    let best=-1,bi=-1;
    for(let s=0;s<m;s++){if(blocked[s])continue;const a=pre[s+L]-pre[s];if(a>best){best=a;bi=s}}
    if(bi<0)break;
    let c=0,cn=0;if(cad)for(let j=bi;j<bi+L&&j<cad.length;j++)if(cad[j]>0){c+=cad[j];cn++}
    res.push({start:bi,avg:best/L,cad:cn?c/cn:null});
    for(let b=Math.max(0,bi-L+1);b<Math.min(m,bi+L);b++)blocked[b]=1;
  }
  return res.sort((a,b)=>a.start-b.start);
}
const RANK={ok:0,up:1,warn:2,bad:3};
const worst=(a,b)=>RANK[a]>=RANK[b]?a:b;
const memo=new Map();
// The verdict judges the work that was planned (blocks, intensity), never the clock:
// a longer ride (getting to the climb, riding home) is information, not a fault.
function analyze(p,act,d){
  const key=act.id+"|"+ftp()+"|"+(p.k||1)+"|"+p.id+"|"+p.d;
  if(memo.has(key))return memo.get(key);
  const checks=[],tables=[];let level="ok";
  const k=p.k||1,F=ftp();
  const mov=act.moving_time||0;
  const w=d.w||[],c=d.c||[],hasW=act.device_watts!==false&&w.length>0;
  const pedalW=meanNZ(w),pedalC=c.length?meanNZ(c):(act.average_cadence||0);
  const add=(l,t)=>{checks.push({l,t});if(l!=="info")level=worst(level,l)};
  const hasInts=p.ints&&p.ints.length;
  if(p.type==="rest"){add("up","Avui tocava descans i has rodat. El coach ho comptarà com a càrrega extra.")}
  else{
    const planned=p.maxMin?(p.min+p.maxMin)/2:p.min,r=planned?(mov/60)/planned:1;
    if(!hasInts&&r<0.6)add("warn","Més curta del previst: "+fmtDur(mov)+" de "+fmtPlanDur(p)+".");
    else add("info","Durada: "+fmtDur(mov)+" (previst "+fmtPlanDur(p)+")."+(r>1.15?" El temps extra no compta en contra: es valora el treball fet.":""));
  }
  if(!hasW){add("info","Aquesta activitat no té dades de potenciòmetre, així que no puc valorar els watts.")}
  else if(p.type!=="rest"){
    const pct=pedalW/F;
    if((p.type==="end"||p.type==="long")&&p.band&&!hasInts){
      const lo=p.band[0]*k,hi=p.band[1]*k;
      let above=0,ped=0;for(const v of w){if(v>0){ped++;if(v>0.90*F)above++}}
      const fr=ped?above/ped:0,lim=p.type==="long"?0.15:0.10;
      if(pct>hi+0.03||fr>lim)add("up","Més intens del previst per ser Z2: "+Math.round(pedalW)+" W de mitjana pedalant ("+Math.round(pct*100)+" % FTP) i "+Math.round(fr*100)+" % del temps per sobre de "+Math.round(0.9*F)+" W.");
      else if(pct<lo-0.04)add("info","Molt suau: "+Math.round(pedalW)+" W de mitjana pedalant. Per a un Z2, pots anar a "+Math.round(lo*F)+"–"+Math.round(hi*F)+" W.");
      else add("ok","Z2 ben controlat: "+Math.round(pedalW)+" W de mitjana pedalant ("+Math.round(pct*100)+" % FTP).");
    } else if(p.type==="rec"){
      if(pct>0.68)add("up","Més intens del previst per ser recuperació: "+Math.round(pedalW)+" W de mitjana ("+Math.round(pct*100)+" % FTP).");
      else add("ok","Recuperació ben feta: "+Math.round(pedalW)+" W de mitjana ("+Math.round(pct*100)+" % FTP).");
    }
    (p.ints||[]).forEach(spec=>{
      const lo=spec.lo*k,hi=spec.hi==null?null:spec.hi*k;
      const win=bestWindows(w,c,spec.s,spec.n),rows=[];let okN=0,upN=0,lowN=0,missing=0;
      win.forEach((x,idx)=>{
        const q=x.avg/F;let st;
        if(hi==null)st=q>=lo?"ok":(q>=lo-0.2?"warn":"bad");
        else if(q>hi+0.03)st="up";
        else if(q>=lo-0.03)st="ok";
        else if(q>=lo-0.06)st="warn";
        else st="bad";
        if(hi!=null&&q<lo*0.8){missing++;st="bad"}
        let cs=null;if(spec.cad&&x.cad!=null)cs=(x.cad>=spec.cad[0]-5&&x.cad<=spec.cad[1]+5)?"ok":"warn";
        if(st==="ok")okN++;else if(st==="up")upN++;else lowN++;
        rows.push({i:idx+1,start:x.start,len:spec.s,w:Math.round(x.avg),pct:Math.round(q*100),cad:x.cad!=null?Math.round(x.cad):null,s:st,cs});
      });
      for(let j=win.length;j<spec.n;j++){missing++;lowN++}
      const tgt=hi==null?"més de "+Math.round(lo*F)+" W":Math.round(lo*F)+"–"+Math.round(hi*F)+" W";
      const done=spec.n-missing,avgW=rows.length?Math.round(rows.reduce((m,r)=>m+r.w,0)/rows.length):0;
      if(missing>=spec.n)add("bad","No es detecten els blocs de "+spec.label+" ("+spec.n+" × a "+tgt+").");
      else if(lowN===0&&upN>0)add("up","Blocs de "+spec.label+" fets per sobre de l'objectiu: "+avgW+" W de mitjana (objectiu "+tgt+"). Si et vas trobar bé, és senyal per pujar.");
      else if(lowN===0)add("ok","Tots els blocs de "+spec.label+" dins l'objectiu ("+tgt+"), "+avgW+" W de mitjana.");
      else if(done>=Math.ceil(spec.n/2))add("warn",(okN+upN)+" de "+spec.n+" blocs de "+spec.label+" a l'objectiu ("+tgt+"); la resta, per sota.");
      else add("bad","Només "+(okN+upN)+" de "+spec.n+" blocs de "+spec.label+" a l'objectiu ("+tgt+").");
      if(spec.cad){const cb=rows.filter(r=>r.cs==="warn").length;if(cb)add("info","Cadència fora de "+spec.cad[0]+"–"+spec.cad[1]+" rpm en "+cb+" dels blocs de "+spec.label+".")}
      tables.push({spec,rows,tgt,lo,hi,hiPct:hi==null?null:hi*100,missing,okN,upN,lowN});
    });
  }
  if(p.cad&&pedalC&&!hasInts)add("info","Cadència mitjana de "+Math.round(pedalC)+" rpm (objectiu "+p.cad[0]+"–"+p.cad[1]+").");
  const stats=[["Temps",fmtDur(mov)],["Km",act.distance?(act.distance/1000).toFixed(1).replace(".",","):"—"],
    ["Watts",act.average_watts?Math.round(act.average_watts):(hasW?Math.round(pedalW):"—")],["Rpm",pedalC?Math.round(pedalC):"—"],["kJ",act.kilojoules?Math.round(act.kilojoules):"—"]];
  const res={level,checks,tables,stats,hasW};
  memo.set(key,res);
  return res;
}
// Progression is decided by the coach (daily review), not suggested in the app.
function suggestFor(){return null}
const VERDICT={ok:["✓","Objectiu complert","Has fet el treball previst."],up:["↑","Complert, més fort del previst","Has fet la feina amb més intensitat de la prevista. El coach ho tindrà en compte per a les properes sessions."],warn:["!","Complert en part","Part del treball principal ha quedat per sota de l'objectiu."],bad:["✕","Incomplet","El treball principal no s'ha pogut fer."]};
const MARK={ok:"✓",up:"↑",warn:"!",bad:"✕",info:"·"};

/* ---------- Charts ---------- */
function profileSegs(p){
  const k=p.k||1,segs=[],add=(min,pct)=>{if(min>0)segs.push({min,pct:pct*k})};
  if(p.type==="rest")return segs;
  if(p.type==="rec"){add(p.min,.5);return segs}
  const total=p.maxMin?(p.min+p.maxMin)/2:p.min;
  if(!p.ints||!p.ints.length){const mid=p.band?(p.band[0]+p.band[1])/2:.65;add(10,.55);add(total-20,mid);add(10,.5);return segs}
  let used=15;add(7.5,.55);add(7.5,.68);
  const body=[];
  p.ints.forEach((spec,si)=>{
    if(si>0)body.push({min:10,pct:.62});
    const rec=spec.s<=30?170/60:spec.s>=1200?8:spec.s>=720?6:spec.s>=600?5:4;
    const mid=spec.hi==null?Math.max(spec.lo,1.6):(spec.lo+spec.hi)/2;
    for(let i=0;i<spec.n;i++){body.push({min:spec.s/60,pct:mid});if(i<spec.n-1)body.push({min:rec,pct:.57})}
  });
  const bodyMin=body.reduce((m,s)=>m+s.min,0),cool=10,fill=Math.max(0,total-used-bodyMin-cool);
  if(p.type==="long"){add(fill,.65);body.forEach(s=>segs.push({min:s.min,pct:s.pct*k}))}
  else{add(Math.min(fill,6),.6);body.forEach(s=>segs.push({min:s.min,pct:s.pct*k}));add(Math.max(0,fill-6),.62)}
  add(cool,.5);
  return segs;
}
function profileHTML(p){
  const segs=profileSegs(p);if(!segs.length)return "";
  const tot=segs.reduce((m,s)=>m+s.min,0),top=Math.max(1.2,...segs.map(s=>s.pct))*1.05;
  let x=0,r="";
  segs.forEach(s=>{const h=s.pct/top*100;r+='<rect x="'+x.toFixed(2)+'" y="'+(100-h).toFixed(2)+'" width="'+Math.max(s.min-0.15,0.2).toFixed(2)+'" height="'+h.toFixed(2)+'" fill="var(--'+zoneOf(s.pct)+')"/>';x+=s.min});
  const fy=100-1/top*100;
  return '<div class="prof"><div class="label" style="margin-bottom:6px">Perfil de la sessió</div><div style="position:relative"><svg viewBox="0 0 '+tot.toFixed(2)+' 100" preserveAspectRatio="none" aria-label="Perfil de potència previst">'+r+
    '<line x1="0" x2="'+tot.toFixed(2)+'" y1="'+fy.toFixed(2)+'" y2="'+fy.toFixed(2)+'" stroke="var(--ink)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/></svg>'+
    '<span class="ftpl" style="top:'+(fy/100*110).toFixed(1)+'px">FTP '+ftp()+' W</span></div><div class="axis"><span>0′</span><span>'+Math.round(tot/2)+'′</span><span>'+Math.round(tot)+'′</span></div></div>';
}
const deepCache=new Map();
function rideDeep(act,d){
  const F=ftp(),key=act.id+"|"+F;if(deepCache.has(key))return deepCache.get(key);
  const w=d.w||[],c=d.c||[],n=w.length;if(n<120)return null;
  let sum=0,acc=0,cnt=0;for(let i=0;i<n;i++){sum+=w[i];if(i>=30)sum-=w[i-30];if(i>=29){const r=sum/30;acc+=r*r*r*r;cnt++}}
  const NP=Math.pow(acc/cnt,.25),avg=w.reduce((a,b)=>a+b,0)/n,IF=NP/F,sec=act.moving_time||n;
  const ZB=[[0,.55,"z1","Z1"],[.55,.75,"z2","Z2"],[.75,.90,"z3","Z3"],[.90,1.05,"z4","Z4"],[1.05,1.20,"z5","Z5"],[1.20,99,"z7","Z6+"]];
  const zt=ZB.map(z=>({z:z[2],l:z[3],s:w.filter(x=>x>=z[0]*F&&x<z[1]*F).length}));
  const pre=new Float64Array(n+1);for(let i=0;i<n;i++)pre[i+1]=pre[i]+w[i];
  const peak=L=>{if(n<L)return null;let b=0,bi=0;for(let i=0;i+L<=n;i++){const v=pre[i+L]-pre[i];if(v>b){b=v;bi=i}}return {w:b/L,at:bi}};
  const peaks=[[5,"5″"],[60,"1′"],[300,"5′"],[1200,"20′"],[3600,"60′"]].map(([L,l])=>({L,l,p:peak(L)})).filter(x=>x.p);
  const sm=new Float64Array(n);{let s2=0;for(let i=0;i<n;i++){s2+=w[i];if(i>=10)s2-=w[i-10];sm[i]=s2/Math.min(10,i+1)}}
  const eff=[];for(let i=0;i<n;){if(sm[i]>F*1.05){let j=i;while(j<n&&sm[j]>F*.95)j++;if(j-i>=20)eff.push({at:i,len:j-i,w:(pre[j]-pre[i])/(j-i)});i=j}else i++}
  let spr=0;for(let i=5;i<n;i++){const a5=(pre[i]-pre[i-5])/5,b5=i>=10?(pre[i-5]-pre[i-10])/5:0;if(a5>F*2&&b5<=F*2)spr++}
  const cz=c.filter(x=>x>20),cad85=cz.length?cz.filter(x=>x>=85).length/cz.length:0;
  const h=Math.floor(n/2),a1=(pre[h]-pre[0])/h,a2=(pre[n]-pre[h])/(n-h);
  const r={NP,avg,IF,VI:NP/avg,TSS:sec*NP*IF/(F*36),kJ:pre[n]/1000,zt,peaks,eff,spr,cad85,a1,a2,n};
  deepCache.set(key,r);return r;
}
function bestBefore(act,L){
  let b=0;Object.values(acts).forEach(a=>{if(a.id===act.id||a.start_local>=act.start_local)return;const d=data[a.id];if(!d||d.error||!d.w)return;const r=rideDeep(a,d);if(!r)return;const pk=r.peaks.find(x=>x.L===L);if(pk&&pk.p.w>b)b=pk.p.w});
  return b;
}
function deepHTML(p,act,d){
  const r=rideDeep(act,d);if(!r)return "";
  const F=ftp(),mm=s=>Math.floor(s/60)+"′"+String(s%60).padStart(2,"0")+"″";
  let h='<details class="deep" open><summary>Anàlisi detallada</summary><div class="deepin">';
  h+='<div class="stats">'+[["NP",Math.round(r.NP)+" W"],["IF",r.IF.toFixed(2)],["TSS",Math.round(r.TSS)],["VI",r.VI.toFixed(2)],["kJ",Math.round(r.kJ)],["PR Strava",act.pr_count!=null?act.pr_count:"—"]].map(x=>'<div class="stat"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join("")+'</div>';
  h+='<div class="label">Temps per zones</div><div class="zbar">'+r.zt.map(z=>z.s?'<i style="flex:'+z.s+';background:var(--'+z.z+')" title="'+z.l+'"></i>':'').join("")+'</div><div class="zleg">'+r.zt.map(z=>'<span><b style="background:var(--'+z.z+')"></b>'+z.l+' '+Math.round(z.s/60)+'′</span>').join("")+'</div>';
  h+='<div class="label">Pics de potència</div><div class="tbl"><table><thead><tr><th>Durada</th><th>Watts</th><th>% FTP</th><th>W/kg</th><th>Millor anterior</th></tr></thead><tbody>'+
    r.peaks.map(x=>{const prev=bestBefore(act,x.L),isBest=prev&&x.p.w>prev;return '<tr><td>'+x.l+'</td><td'+(isBest?' class="s-ok"':'')+'>'+Math.round(x.p.w)+(isBest?' ★':'')+'</td><td>'+Math.round(x.p.w/F*100)+'</td><td>'+(x.p.w/WEIGHT).toFixed(2).replace(".",",")+'</td><td>'+(prev?Math.round(prev):"—")+'</td></tr>'}).join("")+'</tbody></table></div>';
  h+='<div class="note">★ = millor que qualsevol sortida anterior que l\'app té carregada.</div>';
  const top=r.eff.slice().sort((a,b)=>b.len*b.w-a.len*a.w).slice(0,5);
  h+='<div class="label">Esforços per sobre de l\'FTP</div><div class="note">'+r.eff.length+' esforços de més de 20″ · '+r.spr+' esprints de més de '+(F*2)+' W</div>';
  if(top.length)h+='<ul class="checks">'+top.map(e=>'<li><span class="m warn">↑</span><span>Minut '+Math.floor(e.at/60)+': '+mm(e.len)+' a '+Math.round(e.w)+' W ('+Math.round(e.w/F*100)+' %)</span></li>').join("")+'</ul>';
  h+='<div class="note">Cadència: '+Math.round(r.cad85*100)+' % del temps a 85 rpm o més · Primera meitat '+Math.round(r.a1)+' W, segona '+Math.round(r.a2)+' W.</div>';
  if((p.type==="end"||p.type==="long"||p.type==="rec")&&(r.IF>0.78||r.eff.length>=5))h+='<div class="adj">Per ser una sessió suau, has fet massa intensitat: '+r.eff.length+' esforços per sobre de l\'FTP i IF '+r.IF.toFixed(2)+'. Aquests pics cansen i no fan pujar l\'FTP en aquesta fase.</div>';
  return h+'</div></details>';
}
function powerChartHTML(p,d,a){
  const w=d.w||[];if(w.length<120)return "";
  const B=Math.max(15,Math.round(w.length/160)),pts=[];
  for(let i=0;i<w.length;i+=B){let s=0,n=0;for(let j=i;j<Math.min(w.length,i+B);j++){s+=w[j];n++}pts.push(s/n)}
  const F=ftp(),top=Math.max(F*1.25,...pts)*1.05,T=w.length;
  const y=v=>(100-v/top*100).toFixed(2);
  let path="M0 100";pts.forEach((v,i)=>{path+=" L"+(i*B)+" "+y(v)});path+=" L"+((pts.length-1)*B)+" 100 Z";
  let line="";pts.forEach((v,i)=>{line+=(i?" L":"M")+(i*B)+" "+y(v)});
  let bands="",wins="";
  a.tables.forEach(t=>{
    if(t.hi!=null)bands+='<rect x="0" width="'+T+'" y="'+y(t.hi*F)+'" height="'+((t.hi-t.lo)*F/top*100).toFixed(2)+'" fill="var(--accent)" opacity=".14"/>';
    t.rows.forEach(r=>{wins+='<rect x="'+r.start+'" width="'+r.len+'" y="0" height="100" fill="var(--'+(r.s==="ok"?"ok":r.s==="up"?"up":r.s==="warn"?"warn":"bad")+')" opacity=".18"/>'});
  });
  const fy=+y(F),mins=Math.round(T/60);
  return '<div class="pc"><div class="label" style="margin-bottom:6px">La teva potència</div><div style="position:relative"><svg viewBox="0 0 '+T+' 100" preserveAspectRatio="none" aria-label="Gràfic de potència de l\'activitat">'+bands+wins+
    '<path d="'+path+'" fill="var(--ink)" opacity=".1"/><path d="'+line+'" fill="none" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'+
    '<line x1="0" x2="'+T+'" y1="'+fy+'" y2="'+fy+'" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/></svg>'+
    '<span class="lbl" style="top:'+(fy/100*150).toFixed(1)+'px">FTP '+F+' W</span></div><div class="axis"><span>0′</span><span>'+Math.round(mins/2)+'′</span><span>'+mins+'′</span></div>'+
    (a.tables.length?'<div class="legend" style="margin-top:6px"><span><i style="background:var(--accent);opacity:.35"></i>Rang objectiu</span><span><i style="background:var(--ok);opacity:.5"></i>Bloc dins</span><span><i style="background:var(--warn);opacity:.5"></i>Bloc fora</span></div>':'')+'</div>';
}

/* ---------- Render ---------- */
function stepsHTML(p){
  let h="";
  if(p.adjNote)h+='<div class="adj">'+esc(p.adjNote)+'</div>';
  if(p.note)h+='<div class="adj">'+esc(p.note)+'</div>';
  if(p.movedFrom)h+='<div class="note">Reprogramada des del '+esc(dayLabel(p.movedFrom))+'.</div>';
  h+='<dl class="steps">';steps(p).forEach(s=>{h+="<dt>"+esc(s.l)+"</dt><dd>"+fillW(s.x,p.k)+"</dd>"});h+="</dl>";
  if(p.fuel&&p.type!=="rest")h+='<div class="fuel"><img src="media/watermelon.webp" alt=""><div><div class="label">Combustible</div>'+esc(p.fuel)+'</div></div>';
  return h;
}
function runResultHTML(p){
  const a=runFor(p),isPast=p.d<todayStr,isToday=p.d===todayStr;
  if(!a){
    if(p.done&&p.done.by==="manual")return '<div class="result"><div class="verdict ok"><span class="ic">✓</span><div>Marcada com a feta<small>No hi ha cap cursa a Strava aquest dia.</small></div></div><div class="actions"><button class="btn ghost" type="button" data-undone="'+esc(p.id)+'">Desfés</button></div></div>';
    let h="";
    if(stravaState==="on"&&isToday)h+='<div class="empty">Encara no hi ha cap cursa d\'avui a Strava. La detectaré sola quan la pugis.</div>';
    if(isPast||isToday)h+='<div class="actions"><button class="btn ghost" type="button" data-done="'+esc(p.id)+'">Marca-la com a feta</button></div>';
    return h;
  }
  const km=(a.distance||0)/1000,pace=km?(a.moving_time||0)/km:0,checks=[];
  if(p.min&&(a.moving_time||0)<p.min*60*0.7)checks.push({l:"info",t:"Més curta del previst ("+fmtDur(a.moving_time||0)+" de "+fmtDur(p.min*60)+")."});
  if(p.pace&&pace){if(pace<p.pace[0]-10)checks.push({l:"warn",t:"Ritme de "+paceTxt(pace)+"/km: més ràpid del previst ("+paceTxt(p.pace[0])+"–"+paceTxt(p.pace[1])+"). Els dies suaus, suaus de veritat."});else checks.push({l:"ok",t:"Ritme de "+paceTxt(pace)+"/km, dins del que tocava."})}
  checks.push({l:"info",t:Math.round(a.total_elevation_gain||0)+" m de desnivell · càrrega estimada ≈ "+Math.round(actTSS(a))+" TSS."});
  const lv=checks.some(c=>c.l==="warn")?"warn":"ok";
  return '<div class="result"><div class="verdict '+lv+'"><span class="ic">'+(lv==="ok"?"✓":"!")+'</span><div>'+(lv==="ok"?"Cursa feta":"Feta, però massa ràpida")+'<small>'+esc(a.name||"Cursa")+'</small></div></div>'+
    '<div class="stats">'+runStats(a).map(x=>'<div class="stat"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join("")+'</div>'+
    '<ul class="checks">'+checks.map(c=>'<li><span class="m '+c.l+'">'+MARK[c.l]+'</span><span>'+esc(c.t)+'</span></li>').join("")+'</ul>'+checkinHTML(a)+'</div>';
}
function extraCard(d){
  const l=extraRuns(d);
  const ride=acts[d]&&!all().some(s=>s.d===d&&active(s)&&s.type!=="gym"&&s.type!=="run"&&s.type!=="rest")?acts[d]:null;
  let rh="";
  if(ride){const km=(ride.distance||0)/1000;rh='<article class="card feature" style="--zc:var(--z2)"><div class="zonebar"></div><div class="in"><div class="feature-head"><div class="kicker">'+esc(dayLabel(d))+' · Fora del pla · Bici</div><h2>'+esc(ride.name||"Sortida")+'</h2></div><div class="stats">'+[["Temps",fmtDur(ride.moving_time||0)],["Km",km.toFixed(1).replace(".",",")],["Watts",ride.average_watts?Math.round(ride.average_watts):"—"]].map(x=>'<div class="stat"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join("")+'</div><div class="note">Càrrega estimada ≈ '+Math.round(actTSS(ride))+' TSS.</div>'+checkinHTML(ride)+'</div></article>'+(l.length?'<div style="height:14px"></div>':'')}
  if(!l.length)return rh;
  return rh+l.map(a=>'<article class="card feature runcard" style="--zc:var(--z2)"><div class="zonebar"></div><div class="in"><div class="feature-head"><div class="kicker">'+esc(dayLabel(d))+' · Fora del pla · Córrer</div><h2>'+esc(a.name||"Cursa")+'</h2></div>'+
    '<div class="stats">'+runStats(a).map(x=>'<div class="stat"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join("")+'</div><div class="note">'+Math.round(a.total_elevation_gain||0)+' m de desnivell · càrrega estimada ≈ '+Math.round(actTSS(a))+' TSS. Compta per a la fatiga i la forma.</div>'+checkinHTML(a)+'</div></article>').join('<div style="height:14px"></div>');
}
function resultHTML(p){
  if(p.type==="run"&&active(p))return runResultHTML(p);
  const act=actFor(p),isPast=p.d<todayStr,isToday=p.d===todayStr;
  if(!active(p))return '<div class="actions" style="align-items:center"><span class="note" style="flex:1">'+(p.status==="removed"?"Has eliminat aquesta sessió del pla.":"Substituïda per una sessió reprogramada.")+'</span>'+(p.status==="removed"?'<button class="btn" type="button" data-restore="'+esc(p.id)+'">Recupera-la</button>':'')+'</div>';
  if(!act){
    if(p.done&&p.type==="gym")return '<div class="result"><div class="verdict ok"><span class="ic">✓</span><div>Gimnàs fet<small>'+(p.done.by==="strava"?esc(p.done.name||"Activitat de Strava"):"Marcat a mà")+'</small></div></div>'+(p.done.by==="manual"?'<div class="actions"><button class="btn ghost" type="button" data-undone="'+esc(p.id)+'">Desfés</button></div>':'')+(gymActs[p.d]?checkinHTML(gymActs[p.d]):'')+'</div>';
    if(p.done&&p.done.by==="manual")return '<div class="result"><div class="verdict ok"><span class="ic">✓</span><div>Marcada com a feta<small>No hi ha activitat a Strava, així que no puc analitzar-la.</small></div></div><div class="actions"><button class="btn ghost" type="button" data-undone="'+esc(p.id)+'">Desfés</button></div></div>';
    if(p.type==="rest")return "";
    let h="";
    if(stravaState==="on"&&isToday&&p.type!=="gym")h+='<div class="empty">Encara no hi ha cap activitat d\'avui a Strava. L\'app la detectarà sola quan el Wahoo la pugi.</div>';
    if(isPast||isToday)h+='<div class="actions"><button class="btn ghost" type="button" data-done="'+esc(p.id)+'">Marca-la com a feta</button></div>';
    return h;
  }
  const d=data[act.id];
  if(!d||loading[act.id])return '<div class="result"><div class="note">Analitzant «'+esc(act.name||"activitat")+'»…</div></div>';
  if(d.error)return '<div class="result"><div class="empty">'+esc(d.error)+' <button class="btn ghost" type="button" data-retry="'+esc(act.id)+'">Torna-ho a provar</button></div></div>';
  const a=analyze(p,act,d),v=VERDICT[a.level];
  let h='<div class="result"><div class="verdict '+a.level+'"><span class="ic">'+v[0]+'</span><div>'+v[1]+'<small>'+esc(act.name||"Activitat")+' · '+esc(v[2])+'</small></div></div>';
  h+='<div class="stats">'+a.stats.map(s=>'<div class="stat"><div class="k">'+s[0]+'</div><div class="v">'+s[1]+'</div></div>').join("")+'</div>';
  h+=powerChartHTML(p,d,a);
  h+=deepHTML(p,act,d);
  const recs=recordsFor(String(act.id));
  if(recs.length)a.checks.concat([]);
  h+='<ul class="checks">'+a.checks.map(c=>'<li><span class="m '+c.l+'">'+MARK[c.l]+'</span><span>'+esc(c.t)+'</span></li>').join("")+(recs.length?'<li><span class="m up">★</span><span>Rècord: '+recs.sort((x,y)=>x.L-y.L).map(r=>DLAB[r.L]+" a "+r.w+" W (abans "+r.prev+")").join(" · ")+'.</span></li>':'')+'</ul>';
  a.tables.forEach(t=>{
    if(!t.rows.length)return;
    h+='<div class="tbl"><table><thead><tr><th>'+esc(t.spec.label)+'</th><th>Watts</th><th>% FTP</th><th>Rpm</th></tr></thead><tbody>';
    t.rows.forEach(r=>{h+='<tr><td>Bloc '+r.i+'</td><td class="s-'+r.s+'">'+r.w+'</td><td class="s-'+r.s+'">'+r.pct+'</td><td'+(r.cs?' class="s-'+r.cs+'"':'')+'>'+(r.cad!=null?r.cad:"—")+'</td></tr>'});
    h+='</tbody></table></div><div class="note">Objectiu: '+t.tgt+'. Són els '+t.spec.n+' millors blocs de '+(t.spec.s>=60?t.spec.s/60+"′":t.spec.s+"″")+' de l\'activitat.</div>';
  });
  const sg=suggestFor(p,a);
  h+=checkinHTML(act);
  if(sg)h+='<div class="suggest"><div class="kicker">Ajust suggerit</div><div>'+esc(sg.why)+' '+esc(sg.txt)+'</div><div class="actions"><button class="btn primary" type="button" data-apply="'+esc(p.id)+'">Aplica l\'ajust</button><button class="btn ghost" type="button" data-dismiss="'+esc(p.id)+'">Deixa-ho igual</button></div></div>';
  return h+"</div>";
}
const DEFNAME=/^(morning|afternoon|evening|night|lunch) (ride|run)$|^cycling$|^ride$|^run$|^carrera|^bicicleta|^sortida (en bici|matinal|de)|^vuelta|^volta/i;
function doneTitle(p,a){
  if(p.doneT)return p.doneT;
  if(p.t)return p.t;
  const km=(a.distance||0)/1000,el=Math.round(a.total_elevation_gain||0);
  return (isRun(a)?"Cursa de ":"Sortida de ")+(km>=10?Math.round(km):km.toFixed(1).replace(".",","))+" km"+(el>=100?" i "+el+" m":"");
}
function doneMeta(a){
  const km=(a.distance||0)/1000,L=[["Temps",fmtDur(a.moving_time||0)],["Distància",(km>=10?Math.round(km):km.toFixed(1).replace(".",","))+" km"]];
  if(a.total_elevation_gain>=50)L.push(["Desnivell",Math.round(a.total_elevation_gain)+" m"]);
  if(isRun(a)&&km)L.push(["Ritme",paceTxt((a.moving_time||0)/km)+"/km"]);else if(a.average_watts)L.push(["Mitjana",Math.round(a.average_watts)+" W"]);
  return '<div class="meta">'+L.map(x=>'<span>'+x[0]+' <b>'+x[1]+'</b></span>').join("")+'</div>';
}
function plannedBox(p,inner){return '<details class="planned"><summary>Previst: '+esc(p.t)+'</summary><div class="stack" style="gap:12px;margin-top:10px">'+inner+'</div></details>'}
function sessionCard(p,kick){
  const da=p.type!=="gym"&&p.type!=="rest"?(actFor(p)||runFor(p)):null;
  if(da){
    const zc=p.type==="run"?"z2":esc(p.z||"z2");
    return '<article class="card feature'+(p.type==="run"?" runcard":"")+'" style="--zc:var(--'+zc+')"><div class="zonebar"></div><div class="in">'+
      '<div class="feature-head"><div class="kicker">'+kick+' · Fet'+(p.type==="run"?" · Córrer":"")+'</div><h2>'+esc(doneTitle(p,da))+'</h2>'+doneMeta(da)+'</div>'+
      (p.doneNote?'<div class="note">'+esc(p.doneNote)+'</div>':'')+
      plannedBox(p,(p.type!=="run"&&active(p)?profileHTML(p):"")+stepsHTML(p))+resultHTML(p)+'</div></article>';
  }
  if(p.type==="run"){
    return '<article class="card feature runcard" style="--zc:var(--z2)"><div class="zonebar"></div><div class="in"><div class="feature-head"><div class="kicker">'+kick+' · Córrer</div><h2>'+esc(p.t)+'</h2><div class="meta"><span>Durada <b>'+fmtPlanDur(p)+'</b></span>'+(p.pace?'<span>Ritme <b>'+paceTxt(p.pace[0])+'–'+paceTxt(p.pace[1])+'/km</b></span>':'')+'</div></div>'+stepsHTML(p)+changeHTML(p)+resultHTML(p)+'</div></article>';
  }
  if(p.type==="gym"){
    return '<article class="card feature gymcard" style="--zc:var(--z7)"><div class="zonebar"></div><div class="in"><div class="feature-head"><div class="kicker">'+kick+' · Gimnàs</div><h2>'+esc(p.t)+'</h2><div class="meta"><span>Durada <b>'+fmtPlanDur(p)+'</b></span><span>Esforç <b>'+esc(p.rpe||"RPE 6–7")+'</b></span></div></div>'+(p.ex&&p.ex.length?(p.note?'<div class="note">'+esc(p.note)+'</div>':'')+gymLogHTML(p):stepsHTML(p)+resultHTML(p))+'</div></article>';
  }
  if(p.type==="rest"&&active(p)){
    return '<article class="card feature"><div class="in"><div class="feature-head"><div class="kicker">'+kick+'</div><h2>'+esc(p.t)+'</h2></div>'+
      '<div class="restimg"><img src="media/mano.webp" alt="La bici recolzada al contenidor del Mano"><div class="cap">Avui les cames<br>es fan al sofà</div></div>'+stepsHTML(p)+resultHTML(p)+'</div></article>';
  }
  const kpct=(p.k||1)!==1?Math.round((p.k-1)*100):0;
  return '<article class="card feature" style="--zc:var(--'+esc(p.z)+')"><div class="zonebar"></div><div class="in">'+
    '<div class="feature-head"><div class="kicker">'+kick+(p.key?" · Sessió clau":"")+'</div><h2>'+esc(p.t)+'</h2>'+
    '<div class="meta"><span>Durada <b>'+fmtPlanDur(p)+'</b></span>'+(p.cad?'<span>Cadència <b>'+p.cad[0]+'–'+p.cad[1]+' rpm</b></span>':'')+(kpct?'<span>Intensitat <b>'+(kpct>0?"+":"")+kpct+' %</b></span>':'')+'</div></div>'+
    (active(p)?profileHTML(p):"")+stepsHTML(p)+whereHTML(p)+changeHTML(p)+resultHTML(p)+
    (active(p)&&!p.done&&!actFor(p)?'<div class="actions"><button class="btn ghost" type="button" data-copywo="'+esc(p.id)+'">Copia per a intervals.icu</button></div>':'')+'</div></article>';
}
function mainTarget(p){
  const k=p.k||1;
  if(p.ints&&p.ints.length){const x=p.ints[0];return x.hi==null?">"+W(x.lo,k):W(x.lo,k)+"–"+W(x.hi,k)}
  if(p.band)return W(p.band[0],k)+"–"+W(p.band[1],k);
  if(p.type==="rec")return W(.45,k)+"–"+W(.55,k);
  return "—";
}
function renderHero(){
  const inp=document.getElementById("ftp");if(document.activeElement!==inp)inp.value=ftp();
  const dt=new Date(),kick=document.getElementById("heroKick"),title=document.getElementById("heroTitle"),sub=document.getElementById("heroSub"),tiles=document.getElementById("heroTiles"),ver=document.getElementById("heroVerdict");
  kick.textContent="Avui · "+DAYNAMES[dt.getDay()]+" "+dt.getDate()+" "+MONTHS[dt.getMonth()];
  sub.hidden=true;ver.hidden=true;ver.innerHTML="";tiles.innerHTML="";
  if(planState==="loading"){title.textContent="Carregant…";return}
  if(!Object.keys(S).length){title.textContent="Sense pla";sub.hidden=false;sub.textContent=planMsg||"Demana a Claude que prepari el pla.";return}
  const todays=sessionsOn(todayStr),p=todays.find(x=>x.type!=="gym")||todays[0],gym=todays.find(x=>x.type==="gym"&&x!==p);
  if(!p){const next=all().find(x=>x.d>todayStr&&active(x));title.textContent=next?"Dia lliure":"Pla completat";sub.hidden=false;sub.textContent=next?"Propera sessió: «"+next.t+"», "+dayLabel(next.d)+".":"Envia el resum a Claude per preparar les setmanes següents.";return}
  if(p.type==="rest"){title.textContent=p.t;sub.hidden=false;sub.textContent=p.note||"Avui les cames es fan al sofà. El descans també fa pujar l'FTP.";return}
  const hda=p.type!=="gym"?(actFor(p)||runFor(p)):null;
  title.textContent=hda?doneTitle(p,hda):p.t;
  if(hda)kick.textContent+=" · Fet";else if(p.key){kick.textContent+=" · Sessió clau"}
  if(gym){sub.hidden=false;sub.textContent="+ "+gym.t+" ("+fmtPlanDur(gym)+")"+(gym.done?" ✓":", després de la bici")}
  if(p.type==="run"){
    tiles.innerHTML=[["Durada",fmtPlanDur(p)],["Ritme",p.pace?paceTxt(p.pace[0])+"–"+paceTxt(p.pace[1]):"suau"],["Esforç","suau"]].map(x=>'<div class="tile2"><span class="k">'+x[0]+'</span><span class="v">'+esc(x[1])+'</span></div>').join("");
    const ra=runFor(p);
    if(ra){const km=(ra.distance||0)/1000;ver.hidden=false;ver.innerHTML='<span class="vpill ok"><i>✓</i>Cursa feta · '+fmtDur(ra.moving_time||0)+(km?" · "+km.toFixed(1).replace(".",",")+" km":"")+'</span>'}
    else if(p.done){ver.hidden=false;ver.innerHTML='<span class="vpill"><i>✓</i>Marcada com a feta</span>'}
    return;
  }
  const t=p.type==="gym"?[["Durada",fmtPlanDur(p)],["Exercicis",String(steps(p).length)],["Esforç",p.rpe||"RPE 6"]]:[["Durada",fmtPlanDur(p)],["Watts",mainTarget(p)],["Rpm",p.cad?p.cad[0]+"–"+p.cad[1]:"lliure"]];
  tiles.innerHTML=t.map(x=>'<div class="tile2"><span class="k">'+x[0]+'</span><span class="v">'+esc(x[1])+'</span></div>').join("");
  const act=actFor(p),d=act&&data[act.id];
  if(act){const km=(act.distance||0)/1000;tiles.innerHTML=[["Temps",fmtDur(act.moving_time||0)],["Km",String(Math.round(km))],["Desnivell",Math.round(act.total_elevation_gain||0)+" m"]].map(x=>'<div class="tile2"><span class="k">'+x[0]+'</span><span class="v">'+esc(x[1])+'</span></div>').join("")}
  if(act&&d&&!d.error&&!loading[act.id]){
    const a=analyze(p,act,d);
    ver.hidden=false;ver.innerHTML='<span class="vpill '+a.level+'"><i>'+MARK[a.level]+'</i>'+VERDICT[a.level][1]+' · '+fmtDur(act.moving_time||0)+(act.average_watts?" · "+Math.round(act.average_watts)+" W":"")+'</span>';
  } else if(act){ver.hidden=false;ver.innerHTML='<span class="vpill"><i>✓</i>Feta · analitzant…</span>'}
  else if(p.done){ver.hidden=false;ver.innerHTML='<span class="vpill"><i>✓</i>Marcada com a feta</span>'}
}
function actTSS(a){
  const F=ftp(),sec=a.moving_time||0,st=String(a.sport_type||"");
  if(/Ride|Cycl|Bike/i.test(st)){
    const d=data[a.id];if(d&&!d.error&&d.w&&d.w.length>=60)return actualLoad(a).tss;
    const np=a.weighted_average_watts||(a.average_watts?a.average_watts*1.05:0);
    if(np){const IF=np/F;return sec*np*IF/(F*36)}
    return sec/3600*45;
  }
  if(/Run/i.test(st))return sec/3600*65;
  if(/WeightTraining|Workout|Crossfit/i.test(st))return sec/3600*35;
  return sec/3600*30;
}
function loadModel(){
  const list=lsGet("qw.acts",[])||[];if(!list.length)return null;
  const daily={};list.forEach(a=>{if(!a.start_local)return;const d=a.start_local.slice(0,10);daily[d]=(daily[d]||0)+actTSS(a)});
  const days=Object.keys(daily).sort();if(!days.length)return null;
  let d=days[0],ctl=0,atl=0;const series=[];
  while(d<=todayStr){const t=daily[d]||0;ctl+=(t-ctl)/42;atl+=(t-atl)/7;series.push({d,t,ctl,atl});d=addDays(d,1)}
  const last=series[series.length-1],prev=series[series.length-2]||last;
  const tsb=prev.ctl-prev.atl; // form going into today
  const wk=series.slice(-7).reduce((m,x)=>m+x.t,0);
  return {ctl:last.ctl,atl:last.atl,tsb,wk,series,firstDay:days[0]};
}
function renderState(){
  const el=document.getElementById("state");if(!el)return;
  const m=loadModel();
  if(!m){el.innerHTML='<div class="in"><h3>Estat</h3><div class="note">Quan Strava estigui connectat, aquí veuràs la forma, la fatiga i la càrrega.</div></div>';return}
  const t=m.tsb;let lab,col,txt;
  if(t>5){lab="Fresc";col="ok";txt="Bon moment per a una sessió clau o un test."}
  else if(t>-10){lab="Equilibrat";col="ok";txt="Carregues i recuperes al ritme adequat."}
  else if(t>-25){lab="Carregat";col="warn";txt="Normal en setmanes de càrrega. Els dies suaus, suaus de veritat."}
  else{lab="Massa fatiga";col="bad";txt="Cal descansar: el coach rebaixarà els propers dies."}
  const ser=m.series.slice(-42),mx=Math.max(10,...ser.map(x=>Math.max(x.ctl,x.atl)));
  const pts=k=>ser.map((x,i)=>(i/(ser.length-1)*100).toFixed(1)+","+(40-x[k]/mx*38).toFixed(1)).join(" ");
  el.innerHTML='<div class="in" style="gap:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3>Estat</h3><span class="spill '+col+'">'+lab+'</span></div>'+
    '<div class="stats"><div class="stat"><div class="k">Forma (CTL)</div><div class="v">'+Math.round(m.ctl)+'</div></div><div class="stat"><div class="k">Fatiga (ATL)</div><div class="v">'+Math.round(m.atl)+'</div></div><div class="stat"><div class="k">Balanç (TSB)</div><div class="v">'+(t>0?"+":"")+Math.round(t)+'</div></div><div class="stat"><div class="k">TSS 7 dies</div><div class="v">'+Math.round(m.wk)+'</div></div></div>'+
    '<svg class="spark" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Forma i fatiga de les últimes 6 setmanes"><polyline points="'+pts("atl")+'" fill="none" stroke="var(--z5)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><polyline points="'+pts("ctl")+'" fill="none" stroke="var(--z2)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>'+
    '<div class="legend2" style="opacity:1;color:var(--muted)"><span><i style="width:10px;height:2px;background:var(--z2)"></i>Forma</span><span><i style="width:10px;height:2px;background:var(--z5)"></i>Fatiga</span><span>Últimes 6 setmanes</span></div>'+
    '<div class="note">'+txt+(m.firstDay>addDays(todayStr,-60)?" Amb menys de 2 mesos d'historial, la forma és orientativa.":"")+'</div></div>';
}
function allNotes(){return (plan&&Array.isArray(plan.coachNotes)?plan.coachNotes:[]).map((n,i)=>Object.assign({i},n)).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:b.i-a.i)}
function noteKey(n){return n.date+"|"+String(n.text||"").slice(0,48)}
function renderCoachNotes(){
  const el=document.getElementById("coachNotes");if(el){el.hidden=true;el.innerHTML=""}
  const read=state.notesRead||[],fresh=allNotes().filter(n=>n.date>=addDays(todayStr,-2)&&!read.includes(noteKey(n)));
  const b=document.querySelector('#nav [data-page="diari"]');if(b)b.classList.toggle("dot",fresh.length>0);
}
function renderNotesView(){
  const el=document.getElementById("notesList");if(!el)return;
  const notes=allNotes();
  if(!notes.length){el.innerHTML='<p class="note">Encara no hi ha cap nota. El coach n\'escriu una cada vespre després de revisar la sortida.</p>';return}
  let h="",last="";
  notes.forEach(n=>{
    if(n.date!==last){const d=parseD(n.date);h+=(last?'</div>':'')+'<div class="nday"><h3>'+DAYNAMES[d.getDay()]+' '+d.getDate()+' '+MONTHS[d.getMonth()]+'</h3><span class="note">Setmana '+weekNo(n.date)+'</span>';last=n.date}
    h+='<p class="ntext">'+esc(n.text)+'</p>';
  });
  el.innerHTML=h+'</div>';
}
function openNotes(){setPage("diari")}
function renderProgress(){
  const el=document.getElementById("progress"),F=ftp();
  const prog=Math.max(0,Math.min(100,(F-FTP0)/(GOAL-FTP0)*100));
  el.innerHTML='<div class="in" style="gap:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3>Cap als '+GOAL+' W</h3><span class="note">Test a la S4</span></div>'+
    '<div class="bar2"><i style="width:'+Math.max(2,prog).toFixed(0)+'%"></i></div>'+
    '<div class="row"><span>Ara <b>'+F+' W</b> · <b>'+(F/WEIGHT).toFixed(2).replace(".",",")+'</b> W/kg</span><span>Objectiu <b>'+GOAL+' W</b> · <b>'+(GOAL/70).toFixed(1).replace(".",",")+'</b> W/kg</span></div>'+
    '<div class="note">L\'FTP només es mou amb un test. Fins aleshores, la referència és '+FTP0+' W.</div></div>';
}
function renderSetup(){
  const el=document.getElementById("setup");
  if(strava.refreshToken){el.hidden=true;el.innerHTML="";return}
  el.hidden=false;
  const cb=location.hostname||"localhost";
  el.innerHTML='<div class="in setup"><div><div class="kicker">Primer pas</div><h3 style="margin-top:6px">Connecta Strava</h3></div>'+
    '<ol><li>Entra a <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> i crea una aplicació. Nom: «Quadern de Watts». Web: aquesta adreça.</li>'+
    '<li>A «Authorization Callback Domain» posa exactament:<div class="code" style="margin-top:6px">'+esc(cb)+'</div></li>'+
    '<li>Copia aquí el <b>Client ID</b> i el <b>Client Secret</b> que et dona Strava. Es queden només en aquest mòbil.</li></ol>'+
    '<div class="field"><label for="cid">Client ID</label><input id="cid" inputmode="numeric" autocomplete="off" value="'+esc(strava.clientId||"")+'"></div>'+
    '<div class="field"><label for="csec">Client Secret</label><input id="csec" autocomplete="off" autocapitalize="off" spellcheck="false" value="'+esc(strava.clientSecret||"")+'"></div>'+
    '<div class="actions"><button class="btn primary" type="button" id="connect">Connecta amb Strava</button></div>'+
    '<details><summary class="note" style="cursor:pointer">Ja l\'has connectat a Safari i tens una clau?</summary><div class="field" style="margin-top:8px"><label for="importKey">Enganxa la clau</label><textarea id="importKey"></textarea></div><div class="actions" style="margin-top:8px"><button class="btn ghost" type="button" id="importBtn">Fes servir la clau</button></div></details></div>';
}
function renderConn(){
  const el=document.getElementById("conn");
  if(!strava.refreshToken){el.innerHTML='<div class="note">Encara no està connectat. Fes servir el formulari de dalt.</div>';return}
  el.innerHTML='<div>Connectat'+(strava.athlete?' com a <b>'+esc(strava.athlete)+'</b>':'')+'.</div>'+
    '<div class="note">Si l\'has connectat a Safari i l\'app de la pantalla d\'inici et torna a demanar la connexió, copia aquesta clau aquí i enganxa-la allà.</div>'+
    '<div class="actions"><button class="btn ghost" type="button" id="exportBtn">Copia la clau de connexió</button><button class="btn danger" type="button" id="disconnect">Desconnecta</button></div>';
}
function renderDecide(){
  const el=document.getElementById("decide");
  const missed=all().filter(isMissed);
  if(!missed.length){el.hidden=true;el.innerHTML="";return}
  el.hidden=false;
  let h='<div class="in"><div><div class="kicker" style="color:var(--bad)">Sessions sense fer</div><h3 style="margin-top:6px">'+(missed.length===1?"Un dia no vas entrenar":missed.length+" dies sense entrenar")+'</h3></div>';
  missed.forEach(s=>{
    h+='<div class="miss"><div><span class="t">'+esc(dayLabel(s.d))+' · '+esc(s.t)+'</span><div class="note">No hi ha cap activitat a Strava. Què en fem?</div></div>';
    if(chooser===s.id){
      h+='<div class="choose"><div class="note">Tria un dia nou. Evita posar dues sessions dures seguides.</div>';
      for(let i=0;i<7;i++){
        const d=addDays(todayStr,i),on=sessionsOn(d);
        const block=on.find(x=>x.type!=="rest"&&x.type!=="rec"&&!x.done&&x.id!==s.id);
        const doneDay=on.find(x=>x.done||actFor(x));
        const repl=on.filter(x=>(x.type==="rest"||x.type==="rec")&&!x.done);
        let sub=block?"ja té «"+block.t+"»":repl.length?"substitueix «"+repl.map(x=>x.t).join(" + ")+"»":on.length?"":"dia lliure";
        if(!block&&doneDay&&i===0)sub="avui ja has entrenat";
        const dis=!!block||(!!doneDay&&i===0);
        h+='<button class="opt" type="button" data-move="'+esc(s.id)+'" data-to="'+d+'"'+(dis?" disabled":"")+'><span>'+(i===0?"Avui":i===1?"Demà":esc(dayLabel(d)))+'</span><small>'+esc(sub)+'</small></button>';
      }
      h+='<div class="actions"><button class="btn ghost" type="button" data-cancel="1">Cancel·la</button></div></div>';
    } else {
      h+='<div class="actions"><button class="btn primary" type="button" data-choose="'+esc(s.id)+'">Reprograma</button><button class="btn danger" type="button" data-remove="'+esc(s.id)+'">Elimina</button><button class="btn ghost" type="button" data-done="'+esc(s.id)+'">La vaig fer</button></div>';
    }
    h+='</div>';
  });
  el.innerHTML=h+'</div>';
}
const loadCache=new Map();
function actualLoad(a){
  const d=data[a.id],F=ftp(),key=a.id+"|"+F+"|"+(d&&d.w?d.w.length:0);
  if(loadCache.has(key))return loadCache.get(key);
  let np=0;const w=d&&!d.error&&d.w?d.w:null;
  if(w&&w.length>=60){let sum=0,acc=0,n=0;for(let i=0;i<w.length;i++){sum+=w[i];if(i>=30)sum-=w[i-30];if(i>=29){const r=sum/30;acc+=r*r*r*r;n++}}np=Math.pow(acc/n,0.25)}
  else if(a.average_watts)np=a.average_watts*1.05;
  const sec=a.moving_time||0,IF=np?np/F:0.6;
  const tss=np?sec*np*IF/(F*3600)*100:sec/3600*36;
  const r={tss,IF,np,estimated:!(w&&w.length>=60)};
  loadCache.set(key,r);return r;
}
function plannedLoad(p){
  if(!p||!active(p)||p.type==="rest"||p.type==="gym")return 0;
  if(p.type==="run")return (p.min||0)/60*(p.tssH||60);
  return profileSegs(p).reduce((m,x)=>m+x.min/60*x.pct*x.pct*100,0);
}
function ifZone(IF){return IF<.6?"z1":IF<.76?"z2":IF<.86?"z3":IF<.95?"ss":IF<1.05?"z4":"z5"}
function weekStats(ws,we){
  const inWeek=all().filter(s=>s.d>=ws&&s.d<=we&&active(s)&&s.type!=="rest");
  let planMin=0,doneMin=0,doneN=0;
  inWeek.forEach(s=>{const pm=s.type==="gym"?0:(s.maxMin?(s.min+s.maxMin)/2:s.min||0);planMin+=pm;const a=actFor(s)||runFor(s);if(a){doneN++;doneMin+=(a.moving_time||0)/60}else if(s.done){doneN++;doneMin+=pm}});
  return {planMin,doneMin,doneN,totN:inWeek.length};
}
function hrs(m){return (Math.round(m/6)/10).toString().replace(".",",")+" h"}
function renderWeek(){
  const weeks=[...new Set(all().map(s=>weekNo(s.d)))].sort((a,b)=>a-b);
  const strip=document.getElementById("strip"),sel=document.getElementById("sel");
  if(!weeks.length){strip.innerHTML="";sel.innerHTML="";document.getElementById("wkName").textContent="Setmana";document.getElementById("wkLoad").textContent="";return}
  if(weekSel==null||!weeks.includes(weekSel)){const cw=weekNo(todayStr);weekSel=weeks.includes(cw)?cw:(weeks.find(w=>w>=cw)||weeks[weeks.length-1])}
  const ws=addDays(START,(weekSel-1)*7),we=addDays(ws,6);
  const wk=(plan&&plan.weeks&&plan.weeks[String(weekSel)])||{};
  document.getElementById("wkName").textContent="Setmana "+weekSel+(wk.name?" · "+wk.name:"");
  document.getElementById("wkPrev").disabled=weekSel<=weeks[0];
  document.getElementById("wkNext").disabled=weekSel>=weeks[weeks.length-1];
  const days=[];for(let i=0;i<7;i++)days.push(addDays(ws,i));
  const weekSessions=all().filter(s=>s.d>=ws&&s.d<=we);
  if(!selId||!(weekSessions.some(s=>s.id===selId)||(selId.startsWith("day:")&&selId.slice(4)>=ws&&selId.slice(4)<=we))){const t=weekSessions.find(s=>s.d===todayStr&&active(s))||weekSessions.find(s=>active(s)&&s.d>=todayStr&&s.type!=="rest")||weekSessions.find(active)||weekSessions[0];selId=t?t.id:null}
  const dayInfo=days.map(d=>{
    const on=weekSessions.filter(s=>s.d===d);const p=on.find(x=>active(x)&&x.type!=="gym")||on.find(active)||on[0]||null;const g=on.find(x=>x.type==="gym"&&active(x));
    const ride=acts[d]||null,runs=runActs[d]||[];
    let al=ride?Object.assign({},actualLoad(ride)):null;
    if(runs.length){const rt=runs.reduce((m,a)=>m+actTSS(a),0);al=al?Object.assign(al,{tss:al.tss+rt}):{tss:rt,IF:.7,run:true}}
    const act=ride||runs[0]||null,rn=on.some(x=>x.type==="run"&&active(x))||runs.length>0;
    return {d,p,g,act,rn,runDone:runs.length>0,pl:p?plannedLoad(p):0,al};
  });
  const scale=Math.max(80,...dayInfo.map(x=>Math.max(x.pl,x.al?x.al.tss:0)))*1.12;
  strip.innerHTML=dayInfo.map(({d,p,g,act,rn,runDone,pl,al})=>{
    const dd=parseD(d),dl='<div class="dl"><small>'+DAYS[dd.getDay()]+'</small><b>'+dd.getDate()+'</b><i class="tss">'+(al?Math.round(al.tss):" ")+'</i>'+(g?'<span class="gymb'+(g.done?" done":"")+'" title="Gimnàs">GYM</span>':'')+(rn?'<span class="runb'+(runDone?" done":"")+'" title="Córrer">RUN</span>':'')+'</div>';
    if(!p&&!act)return '<div class="daybtn" aria-hidden="true"><div class="col2"></div>'+dl+'</div>';
    const ph=p?(p.type==="rest"||!active(p)?12:Math.max(8,pl/scale*100)):0;
    const ah=al?Math.max(6,al.tss/scale*100):0;
    let tick="";
    if(p&&active(p)&&p.type!=="rest"){
      const pa=actFor(p),dat=pa&&data[pa.id];
      if(p.type==="run"&&(runFor(p)||p.done))tick='<span class="tick ok">✓</span>';
      else if(pa&&dat&&!dat.error&&!loading[pa.id]){const lv=analyze(p,pa,dat).level;tick='<span class="tick '+lv+'">'+MARK[lv]+'</span>'}
      else if(pa||p.done)tick='<span class="tick">✓</span>';
      else if(isMissed(p))tick='<span class="tick miss">?</span>';
    } else if(act&&al)tick='<span class="tick extra">+</span>';
    const top=Math.max(ph,ah);
    const pcls="pb"+(p&&p.type==="rest"?" rest":"")+(p&&!active(p)?" gone":"");
    const label=dayLabel(d)+": "+(p?p.t:"sense sessió")+(al?". Fet: "+Math.round(al.tss)+" TSS":"");
    return '<button type="button" class="daybtn'+(d===todayStr?" today":"")+'"'+' data-sel="'+esc(p?p.id:"day:"+d)+'" aria-pressed="'+(p?p.id===selId:selId==="day:"+d)+'" style="--zc:var(--'+esc(p?p.z:"z1")+')'+(al?';--ac:var(--'+ifZone(al.IF)+')':'')+'" aria-label="'+esc(label)+'"><div class="col2">'+
      (p?'<div class="'+pcls+'" style="height:'+ph.toFixed(0)+'%"></div>':'')+(al?'<div class="ab" style="height:'+ah.toFixed(0)+'%"></div>':'')+
      (tick?'<div class="tickwrap" style="bottom:'+top.toFixed(0)+'%">'+tick+'</div>':'')+'</div>'+dl+'</button>';
  }).join("");
  const wkPlan=dayInfo.reduce((m,x)=>m+x.pl,0),wkDone=dayInfo.reduce((m,x)=>m+(x.al?x.al.tss:0),0);
  document.getElementById("wkLoad").textContent=Math.round(wkDone)+" / "+Math.round(wkPlan)+" TSS";
  if(selId&&selId.startsWith("day:")){sel.innerHTML=extraCard(selId.slice(4));renderFood();return}
  const p=S[selId];
  const dayL=p?all().filter(x=>x.d===p.d&&(x.id===p.id||active(x))):[];
  const gyms=dayL.filter(x=>x.type==="gym");
  sel.innerHTML=(p?dayL.filter(x=>x.type!=="gym").map(x=>sessionCard(x,esc(dayLabel(x.d))+(x.d===todayStr?" · Avui":""))).join('<div style="height:14px"></div>'):"")+
    gyms.map(g=>'<button type="button" class="gymlink" data-gopen="'+esc(g.id)+'"><span>Gimnàs</span><b>'+esc(g.t)+'</b><i>'+(g.done||gymActs[g.d]?"✓ Fet":"Obre →")+'</i></button>').join("")+(p&&extraRuns(p.d).length?'<div style="height:14px"></div>'+extraCard(p.d):"");
  renderFood();
}
function renderLog(){
  document.getElementById("logBox").hidden=!state.log.length;
  document.getElementById("log").innerHTML=state.log.slice(-8).reverse().map(e=>{const t=new Date(e.at);return '<li><time>'+(isNaN(t)?"":t.getDate()+" "+MONTHS[t.getMonth()]+" · "+String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0"))+'</time>'+esc(e.txt)+'</li>'}).join("");
}
function renderZones(){
  document.getElementById("zones").innerHTML=ZONES.map(z=>'<tr><td><span class="zsw" style="background:var(--'+z[1]+')"></span>'+z[0]+'</td><td>'+(z[3]==null?">"+Math.round(z[2]*100-1)+" %":Math.round(z[2]*100)+"–"+Math.round(z[3]*100)+" %")+'</td><td>'+(z[3]==null?">"+W(z[2])+" W":W(z[2])+"–"+W(z[3])+" W")+'</td></tr>').join("");
}
function renderStatus(){
  const s=document.getElementById("status");
  const err=planState==="err"||stravaState==="err";
  s.className="status"+(stravaState==="on"&&planState==="ready"?" on":err?" err":"");
  document.getElementById("statusMsg").textContent=planState==="err"?planMsg:(stravaMsg||(planMsg||"Carregant…"));
  document.getElementById("refresh").disabled=!strava.refreshToken;
  document.getElementById("ver").textContent="Versió "+APP_VERSION+(plan&&plan.updated?" · pla del "+plan.updated:"")+".";
}
function weighCfg(){return {day:state.weighDay==null?1:state.weighDay,hour:state.weighHour==null?8:state.weighHour}}
function weighDue(){const l=state.weights||[],last=l.length?l[l.length-1].d:null;if(last===todayStr)return false;const c=weighCfg(),now=new Date(),wd=now.getDay();
  if(wd===c.day&&now.getHours()>=c.hour)return true;
  return !!last&&last<addDays(todayStr,-7)||(!last&&wd===c.day)}
function weighCfgHTML(){const c=weighCfg();return '<div class="row2" style="align-items:center;flex-wrap:wrap"><span class="note">Recordatori a l\'app:</span><select id="wDay" aria-label="Dia">'+DAYNAMES.map((n,i)=>'<option value="'+i+'"'+(i===c.day?" selected":"")+'>'+n+'</option>').join("")+'</select><select id="wHour" aria-label="Hora">'+Array.from({length:17},(_,i)=>i+5).map(h=>'<option value="'+h+'"'+(h===c.hour?" selected":"")+'>'+h+':00</option>').join("")+'</select></div>'}
function renderAvuiExtras(){
  const wp=document.getElementById("wPrompt");if(wp){if(weighDue()){const l=state.weights||[];wp.hidden=false;wp.innerHTML='<div class="in" style="gap:10px"><div class="kicker">Toca pesar-te</div><div class="note">En dejú, després d\'anar al lavabo i abans d\'esmorzar.'+(l.length?' L\'últim: '+String(l[l.length-1].kg).replace(".",",")+' kg ('+dayLabel(l[l.length-1].d)+').':'')+' Cada '+DAYNAMES[weighCfg().day].toLowerCase()+' a les '+weighCfg().hour+':00 (ho canvies a Rendiment → Pes).</div><div class="row2"><div class="field" style="flex:1"><label for="wkg2">Pes (kg)</label><input id="wkg2" type="number" inputmode="decimal" step="0.1" min="40" max="150" placeholder="'+String(curWeight()).replace(".",",")+'"></div><button class="btn primary" type="button" id="wSave2">Desa</button></div></div>'}else{wp.hidden=true;wp.innerHTML=""}}
  renderFood();
  const w=document.getElementById("wkSum");if(w){const wd=parseD(todayStr).getDay();if(wd===0||wd===1){w.hidden=false;w.innerHTML=weekSummaryHTML(wd===0?mondayOf(todayStr):addDays(mondayOf(todayStr),-7),wd===0?"Resum de la setmana":"Resum de la setmana passada")}else{w.hidden=true;w.innerHTML=""}}
}
function render(){renderHero();renderStatus();renderSetup();renderDecide();renderWeek();renderLog();renderZones();renderConn();renderWahoo();renderCoachNotes();renderTitles();renderWeather();renderAvuiExtras();renderPage();icuSchedule()}

/* ---------- Títols per a Strava ---------- */
function normT(x){return String(x||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function recentAct(){
  const from=addDays(todayStr,-1);let best=null;
  allList.forEach(a=>{if(a&&a.start_local&&a.start_local.slice(0,10)>=from&&(!best||a.start_local>best.start_local))best=a});
  return best;
}
function actTags(a){
  const st=String(a.sport_type||""),ride=/Ride|Cycl|Bike/i.test(st),run=/Run/i.test(st),gym=/WeightTraining|Workout|Crossfit/i.test(st);
  const h=(a.moving_time||0)/3600,day=a.start_local.slice(0,10),hr=parseInt(a.start_local.slice(11,13),10),wd=parseD(day).getDay();
  const t=new Set();
  if(ride)t.add("ride");if(run)t.add("run");if(gym)t.add("gym");
  if((ride&&h>=3)||(run&&h>=1.5))t.add("long");
  if((ride&&h<1.25)||(run&&h<.6))t.add("short");
  const w=a.weighted_average_watts||(a.device_watts?a.average_watts:null),IF=ride&&w?w/ftp():null;
  if(IF&&IF>=.85)t.add("hard");if(IF&&IF<.70)t.add("easy");
  const km=(a.distance||0)/1000,el=a.total_elevation_gain||0;
  if(km>0&&el>=300&&el/km>=(run?20:12))t.add("climb");
  if(hr<9)t.add("morning");if(hr>=19)t.add("night");
  if(wd===0)t.add("sunday");if(wd===0||wd===6)t.add("weekend");if(wd===1)t.add("monday");if(wd>=1&&wd<=5)t.add("weekday");
  const ses=sessionsOn(day);if(ses.length&&ses.every(x=>x.type==="rest"||x.type==="gym")&&!gym)t.add("rest");
  if(a.athlete_count>1)t.add("group");else if(a.athlete_count===1)t.add("solo");
  if(a.pr_count>0)t.add("pr");
  return t;
}
function seeded(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return((h>>>0)%10000)/10000}}
function titleOptions(a){
  if(!titles)return [];
  const tags=actTags(a),day=a.start_local.slice(0,10);
  const used=new Set(allList.filter(x=>x.id!==a.id).map(x=>normT(x.name)));
  const pool=[];
  (titles.phrases||[]).forEach(p=>pool.push({t:p.t,tags:p.tags||[],top:false}));
  (titles.topical||[]).forEach(p=>{if((!p.from||day>=p.from)&&(!p.to||day<=p.to))pool.push({t:p.t,tags:p.tags||[],top:true})});
  const rnd=seeded(String(a.id));
  const own=((titles.byDay||{})[day]||[]).filter(t=>!used.has(normT(t)));
  return own.concat(pool.filter(p=>!own.some(o=>normT(o)===normT(p.t))).filter(p=>p.tags.every(x=>tags.has(x))&&!used.has(normT(p.t)))
    .map(p=>({t:p.t,k:p.tags.length*1.2+(p.top?1.4:0)+rnd()*2.2}))
    .sort((x,y)=>y.k-x.k).map(p=>p.t));
}
function renderTitles(){
  const el=document.getElementById("titles");if(!el)return;
  const a=recentAct(),opts=a?titleOptions(a):[];
  if(!a||!opts.length){el.hidden=true;el.innerHTML="";return}
  const n=Math.ceil(opts.length/5),off=(titleOff[a.id]||0)%n,page=opts.slice(off*5,off*5+5);
  const cur=normT(a.name),chosen=opts.concat((titles.phrases||[]).map(p=>p.t)).find(t=>normT(t)===cur);
  const when=a.start_local.slice(0,10)===todayStr?"avui":"ahir";
  el.hidden=false;
  el.innerHTML='<div class="in" style="gap:10px"><div class="kicker">Títol per a Strava · '+when+'</div>'+
    '<div class="note">'+(chosen?'Ja hi has posat «'+esc(a.name)+'» ✓':'Ara es diu «'+esc(a.name||"activitat")+'». Toca\'n un i es copia.')+'</div>'+
    '<div class="tlist">'+page.map(t=>'<button class="topt" type="button" data-title="'+esc(t)+'">'+esc(t)+'</button>').join("")+'</div>'+
    '<div class="actions">'+(n>1?'<button class="btn ghost" type="button" data-tmore="'+esc(a.id)+'">Altres 5</button>':'')+'</div></div>';
}

/* ---------- Pàgines ---------- */
const PAGES=["avui","gimnas","nutricio","rendiment","diari","ajustos"];
let page="avui";
function setPage(p,keepScroll){
  if(!PAGES.includes(p))p="avui";
  page=p;
  document.querySelectorAll(".page").forEach(el=>{el.hidden=el.dataset.page!==p});
  document.querySelectorAll("#nav button").forEach(b=>b.setAttribute("aria-current",b.dataset.page===p?"page":"false"));
  try{history.replaceState(null,"",p==="avui"?location.pathname:"#"+p)}catch(e){}
  renderPage();
  if(!keepScroll)window.scrollTo(0,0);
}
function renderPage(){
  if(page==="gimnas")renderGym();
  else if(page==="nutricio")renderNut();
  else if(page==="rendiment")renderPerf();
  else if(page==="diari")renderDiary();
  else if(page==="ajustos")renderSettings();
}

/* ---------- Pes ---------- */
function curWeight(){const l=state.weights||[];return l.length?l[l.length-1].kg:((plan&&plan.athlete&&plan.athlete.weight)||75)}
function applyWeight(){WEIGHT=curWeight()}

/* ---------- Com et trobes (check-in) ---------- */
const CK={
  sleep:{l:"Son",n:5,t:["Fatal","Malament","Normal","Bé","Molt bé"]},
  legs:{l:"Cames",n:5,t:["Mortes","Carregades","Normals","Bé","Fresques"]},
  mood:{l:"Ganes",n:5,t:["Cap","Poques","Normals","Moltes","A tope"]},
  blocs:{l:"Esforç de les sèries",n:10,t:["Molt suau","Molt suau","Suau","Suau","Moderat","Moderat","Dur","Dur","Molt dur","Màxim"]},
  rpe:{l:"Esforç de la sortida, en general",n:10,t:["Molt suau","Molt suau","Suau","Suau","Moderat","Moderat","Dur","Dur","Molt dur","Màxim"]}
};
let ckDraft={},ckEdit=null;
function ckOf(id){return (state.checkins||{})[String(id)]||null}
function ckSummary(c){return (c.blocs?"Sèries "+c.blocs+"/10 · ":"")+"Sortida "+c.rpe+"/10 · "+["legs","sleep","mood"].map(k=>CK[k].l+" "+c[k]+"/5").join(" · ")}
function hasBlocks(act){const d=act&&act.start_local?act.start_local.slice(0,10):null;if(!d)return false;return all().some(s=>s.d===d&&active(s)&&s.ints&&s.ints.length&&(actFor(s)===act))}
function checkinHTML(act){
  if(!act)return "";
  const id=String(act.id),c=ckOf(id);
  if(c&&ckEdit!==id)return '<div class="ckdone"><div><div class="label">Com et vas trobar</div><div>'+esc(ckSummary(c))+'</div>'+(c.note?'<div class="note">«'+esc(c.note)+'»</div>':'')+'</div><button class="btn ghost" type="button" data-ckedit="'+esc(id)+'">Edita</button></div>';
  const d=ckDraft[id]||(c?Object.assign({},c):{});ckDraft[id]=d;const blk=hasBlocks(act);
  let h='<div class="ck"><div><div class="kicker">Com t\'has trobat?</div><div class="note">10 segons.'+(blk?' Valora les sèries per una banda i la sortida sencera (amb tot el que hi hagis afegit) per l\'altra.':'')+'</div></div>';
  (blk?["blocs","rpe","legs","sleep","mood"]:["rpe","legs","sleep","mood"]).forEach(k=>{
    const s=CK[k],v=d[k];
    const lab=k==="rpe"&&!blk?"Esforç de la sessió":s.l;
    h+='<div class="ckrow"><div class="ckl"><span>'+lab+'</span><b>'+(v?esc(s.t[v-1])+(s.n===10?" · "+v+"/10":""):"")+'</b></div><div class="ckb ck'+s.n+'">';
    for(let i=1;i<=s.n;i++)h+='<button type="button" class="'+(v===i?"on":"")+'" data-ck="'+esc(id)+'|'+k+'|'+i+'" aria-label="'+s.l+' '+i+'">'+i+'</button>';
    h+='</div></div>';
  });
  h+='<div class="field"><label for="cknote-'+esc(id)+'">Alguna cosa més? (opcional)</label><input id="cknote-'+esc(id)+'" data-cknote="'+esc(id)+'" value="'+esc(d.note||"")+'" placeholder="Ex.: m\'ha costat arrencar, al final bé" autocomplete="off"></div>';
  const ready=d.rpe&&d.legs&&d.sleep&&d.mood&&(!blk||d.blocs);
  h+='<div class="actions"><button class="btn primary" type="button" data-cksave="'+esc(id)+'"'+(ready?"":" disabled")+'>Desa</button>'+(c?'<button class="btn ghost" type="button" data-ckcancel="'+esc(id)+'">Cancel·la</button>':'')+'</div></div>';
  return h;
}
function saveCheckin(id){
  const d=ckDraft[id];if(!d||!(d.rpe&&d.legs&&d.sleep&&d.mood))return;
  const a=allList.find(x=>String(x.id)===id);
  const inp=document.querySelector('[data-cknote="'+id+'"]');if(inp)d.note=inp.value.trim().slice(0,300);
  state.checkins=state.checkins||{};
  state.checkins[id]={d:a&&a.start_local?a.start_local.slice(0,10):todayStr,name:a?a.name:"",sport:a?a.sport_type:"",sleep:d.sleep,legs:d.legs,mood:d.mood,rpe:d.rpe,blocs:d.blocs||null,note:d.note||"",at:new Date().toISOString()};
  saveState();delete ckDraft[id];ckEdit=null;queueSync();
  toast(sync.token?"Desat. El coach ho veurà aquest vespre.":"Desat.");render();
}

/* ---------- Corba de potència, rècords i FTP estimat ---------- */
const CURVE_D=[5,15,30,60,120,180,300,480,600,1200,1800,3600];
const DLAB={5:"5″",15:"15″",30:"30″",60:"1′",120:"2′",180:"3′",300:"5′",480:"8′",600:"10′",1200:"20′",1800:"30′",3600:"60′"};
let curves=lsGet("qw.curve",{});
let recSeen=lsGet("qw.recSeen",[]);
function computeCurve(w){
  const n=w.length,pre=new Float64Array(n+1);for(let i=0;i<n;i++)pre[i+1]=pre[i]+w[i];
  const b={};CURVE_D.forEach(L=>{if(n<L)return;let m=0;for(let i=0;i+L<=n;i++){const v=pre[i+L]-pre[i];if(v>m)m=v}b[L]=Math.round(m/L)});
  return b;
}
function storeCurve(a,w){
  if(!a||!w||w.length<60)return;
  const id=String(a.id);if(curves[id])return;
  curves[id]={d:a.start_local.slice(0,10),t:a.start_local,b:computeCurve(w)};
  lsSet("qw.curve",curves);
  const recs=recordsFor(id);
  if(recs.length&&curves[id].d>=addDays(todayStr,-2)&&!recSeen.includes(id)){
    recSeen=recSeen.concat([id]).slice(-60);lsSet("qw.recSeen",recSeen);
    const top=recs.sort((x,y)=>y.L-x.L)[0];
    toast("Rècord nou: "+DLAB[top.L]+" a "+top.w+" W"+(recs.length>1?" (i "+(recs.length-1)+" més)":"")+".");
  }
}
function recordsFor(id){
  const c=curves[id];if(!c)return [];
  const before=Object.entries(curves).filter(([k,v])=>k!==id&&v.t<c.t);
  if(before.length<3)return [];
  const out=[];
  Object.keys(c.b).forEach(L=>{const prev=Math.max(0,...before.map(([,v])=>v.b[L]||0));if(prev&&c.b[L]>prev)out.push({L:+L,w:c.b[L],prev})});
  return out;
}
function bestCurve(from,to){
  const b={},src={};
  Object.entries(curves).forEach(([id,v])=>{if(v.d<from||v.d>to)return;Object.keys(v.b).forEach(L=>{if(!b[L]||v.b[L]>b[L]){b[L]=v.b[L];src[L]=v.d}})});
  return {b,src};
}
// FTP estimat: diversos mètodes sobre la corba de potència dels últims 90 dies.
// Els esforços que no són a tope només poden subestimar, així que el resultat és la mitjana
// dels dos mètodes més alts i el rang va del segon al primer.
const EFTP_M=[
  {L:180,f:.75,t:"3′ a tope × 0,75 (relació habitual entre VO2màx i llindar)"},
  {L:300,f:.82,t:"5′ × 0,82"},
  {L:480,f:.90,t:"8′ × 0,90 (protocol de 2 × 8′)"},
  {L:1200,f:.95,t:"20′ × 0,95 (test clàssic)"},
  {L:3600,f:1,t:"60′ × 1"}
];
function eftp(asOf){
  const to=asOf||todayStr,{b,src}=bestCurve(addDays(to,-90),to);
  const m=EFTP_M.filter(x=>b[x.L]).map(x=>({L:x.L,t:x.t,w:b[x.L],d:src[x.L],v:Math.round(b[x.L]*x.f)})).sort((x,y)=>y.v-x.v);
  if(!m.length)return null;
  const top=m.slice(0,2),v=Math.round(top.reduce((a,x)=>a+x.v,0)/top.length);
  return {v,lo:top[top.length-1].v,hi:top[0].v,from:top[0],methods:m};
}
function curveQueue(){
  const from=addDays(todayStr,-120);
  allList.filter(a=>a&&a.start_local&&a.start_local.slice(0,10)>=from&&/Ride|Cycl|Bike/i.test(String(a.sport_type||""))&&a.device_watts!==false&&!curves[String(a.id)])
    .sort((x,y)=>x.start_local<y.start_local?1:-1).slice(0,60)
    .forEach(a=>{const id=String(a.id);if(loading[id])return;chain=chain.then(()=>data[id]&&data[id].w?storeCurve(a,data[id].w):loadDetail(id,true)).then(()=>new Promise(r=>setTimeout(r,350)))});
}

/* ---------- Perfil de potència (escala aproximada de Coggan, homes) ---------- */
const LV=["Inicial","Bàsic","Mitjà","Bo","Molt bo","Excel·lent","Excepcional","Professional"];
const TH={5:[0,11.27,13.44,15.61,17.78,19.95,22.12,24.29],60:[0,5.87,6.79,7.71,8.63,9.55,10.47,11.39],300:[0,2.55,3.37,4.19,5.01,5.83,6.65,7.47],ftp:[0,2.05,2.76,3.47,4.18,4.89,5.6,6.31]};
function lvl(key,wkg){const t=TH[key];let i=0;while(i+1<t.length&&wkg>=t[i+1])i++;const nx=t[i+1]||t[i]+1;return {i,f:i+Math.min(1,Math.max(0,(wkg-t[i])/(nx-t[i]))),name:LV[i]}}
function profileData(){
  const {b,src}=bestCurve(addDays(todayStr,-120),todayStr),kg=curWeight(),F=ftp(),e=eftp();
  const rows=[[5,"Sprint · 5″",b[5],src[5]],[60,"Anaeròbic · 1′",b[60],src[60]],[300,"VO2màx · 5′",b[300],src[300]],["ftp","Llindar · FTP",F,null]];
  return rows.filter(r=>r[2]).map(r=>{const wkg=r[2]/kg;return {key:r[0],label:r[1],w:r[2],d:r[3],wkg,lv:lvl(r[0],wkg)}}).concat([]).map(x=>Object.assign(x,{eftp:e}));
}
function profileType(rows){
  if(rows.length<4)return null;
  const f=k=>rows.find(r=>r.key===k).lv.f;
  const sp=(f(5)+f(60))/2,ae=(f(300)+f("ftp"))/2;
  if(ae-sp>0.8)return ["Rodador / escalador d'esforços llargs","El teu punt fort són el 5′ i el llindar; l'esprint i el minut queden per sota. Rendeixes en pujades llargues i ritmes sostinguts."];
  if(sp-ae>0.8)return ["Explosiu / esprintador","Destaques en esforços curts. El llindar és el que més marge té."];
  if(f(60)>f("ftp")+0.6&&f(300)>f("ftp")+0.3)return ["Puncheur","Bo en pujades curtes i canvis de ritme de 1–5′."];
  return ["Tot terreny","Perfil equilibrat entre esforços curts i llargs."];
}

/* ---------- Objectius ---------- */
function goals(){
  return (plan&&Array.isArray(plan.goals)&&plan.goals.length?plan.goals:[
    {t:"Test d'FTP (20′)",d:"2026-11-14",kind:"test"},
    {t:"FTP 280 W",d:"2026-12-25",kind:"ftp",target:280},
    {t:"Mitja Marató de Girona",d:"2027-02-28",kind:"race",target:"Sota 1:30 · 4:15/km"}
  ]).filter(g=>g.d>=todayStr);
}
function daysTo(d){return Math.round((parseD(d)-parseD(todayStr))/864e5)}

/* ---------- Resum setmanal ---------- */
function mondayOf(d){const x=parseD(d),wd=(x.getDay()+6)%7;return addDays(d,-wd)}
function weekSummary(ws){
  const we=addDays(ws,6),list=allList.filter(a=>a&&a.start_local&&a.start_local.slice(0,10)>=ws&&a.start_local.slice(0,10)<=we);
  const isRide=a=>/Ride|Cycl|Bike/i.test(String(a.sport_type||"")),isGym=a=>/WeightTraining|Workout|Crossfit|Yoga|Pilates/i.test(String(a.sport_type||""));
  const agg=f=>{const l=list.filter(f);return {n:l.length,sec:l.reduce((m,a)=>m+(a.moving_time||0),0),km:l.reduce((m,a)=>m+(a.distance||0)/1000,0),el:l.reduce((m,a)=>m+(a.total_elevation_gain||0),0),tss:l.reduce((m,a)=>m+actTSS(a),0)}};
  const bike=agg(isRide),run=agg(isRun),gym=agg(isGym);
  const gymPlanned=all().filter(s=>s.d>=ws&&s.d<=we&&active(s)&&s.type==="gym"),gymDone=gymPlanned.filter(s=>s.done).length;
  const ses=all().filter(s=>s.d>=ws&&s.d<=we&&active(s)&&s.type!=="rest");
  const done=ses.filter(s=>s.done||actFor(s)||runFor(s)).length,keys=ses.filter(s=>s.key),keysDone=keys.filter(s=>s.done||actFor(s)).length;
  const recs=list.reduce((m,a)=>m+recordsFor(String(a.id)).length,0);
  const cks=Object.values(state.checkins||{}).filter(c=>c.d>=ws&&c.d<=we);
  const avg=k=>cks.length?(cks.reduce((m,c)=>m+c[k],0)/cks.length):null;
  const planned=ses.reduce((m,s)=>m+plannedLoad(s),0);
  return {ws,we,bike,run,gym,gymN:Math.max(gym.n,gymDone),gymP:gymPlanned.length,tss:bike.tss+run.tss+gym.tss,planned,done,tot:ses.length,keys:keys.length,keysDone,recs,legs:avg("legs"),rpe:avg("rpe")};
}

function weekSummaryHTML(ws,title){
  const r=weekSummary(ws),nx=all().filter(s=>s.d>addDays(ws,6)&&s.d<=addDays(ws,13)&&active(s)&&s.key);
  const f1=x=>x.toFixed(1).replace(".",","),st=a=>'<div class="stats">'+a.map(x=>'<div class="stat"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join("")+'</div>';
  let h='<div class="in" style="gap:14px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3>'+esc(title)+'</h3><span class="note">'+esc(dayLabel(r.ws))+' – '+esc(dayLabel(r.we))+'</span></div>';
  h+='<div class="note">Total: '+hrs((r.bike.sec+r.run.sec+r.gym.sec)/60)+' · '+Math.round(r.tss)+(r.planned?" de "+Math.round(r.planned):"")+' TSS</div>';
  h+='<div class="sport"><div class="sph"><span class="dotc" style="background:var(--z4)"></span>Ciclisme<span class="note">'+r.bike.n+(r.bike.n===1?" sortida":" sortides")+'</span></div>'+(r.bike.n?st([["Hores",hrs(r.bike.sec/60)],["Km",Math.round(r.bike.km)],["Desnivell",Math.round(r.bike.el)+" m"],["TSS",Math.round(r.bike.tss)]]):'<div class="note">Cap sortida.</div>')+'</div>';
  if(r.run.n)h+='<div class="sport"><div class="sph"><span class="dotc" style="background:var(--z2)"></span>Running<span class="note">'+r.run.n+(r.run.n===1?" cursa":" curses")+'</span></div>'+st([["Hores",hrs(r.run.sec/60)],["Km",f1(r.run.km)],["Ritme /km",r.run.km?paceTxt(r.run.sec/r.run.km):"—"],["TSS",Math.round(r.run.tss)]])+'</div>';
  if(r.gymN||r.gymP)h+='<div class="sport"><div class="sph"><span class="dotc" style="background:var(--z7)"></span>Gimnàs<span class="note">'+r.gymN+(r.gymP?" de "+r.gymP:"")+((r.gymP||r.gymN)===1?" sessió":" sessions")+'</span></div>'+(r.gym.sec?st([["Hores",hrs(r.gym.sec/60)],["TSS",Math.round(r.gym.tss)]]):'')+'</div>';
  const L=[];
  L.push({l:r.done>=r.tot?"ok":"info",t:"Sessions del pla fetes: "+r.done+" de "+r.tot+(r.keys?" · claus: "+r.keysDone+" de "+r.keys:"")+"."});
  if(r.recs)L.push({l:"up",t:r.recs+(r.recs===1?" rècord de potència":" rècords de potència")+"."});
  if(r.legs!=null)L.push({l:"info",t:"Cames de mitjana "+f1(r.legs)+"/5 · esforç "+f1(r.rpe)+"/10."});
  if(nx.length)L.push({l:"info",t:"La setmana següent: "+nx.map(s=>s.t+" ("+DAYS[parseD(s.d).getDay()]+")").join(", ")+"."});
  h+='<ul class="checks">'+L.map(c=>'<li><span class="m '+c.l+'">'+MARK[c.l]+'</span><span>'+esc(c.t)+'</span></li>').join("")+'</ul></div>';
  return h;
}

/* ---------- Avui no puc / estic cansat ---------- */
let chg=null;
const ADJ_KEYS=["type","z","t","min","maxMin","ints","band","cad","k","steps","note","key","fuel"];
function canChange(p){return p&&active(p)&&p.type!=="rest"&&p.type!=="gym"&&p.d>=todayStr&&!p.done&&!actFor(p)&&!runFor(p)}
function adjOptions(p){
  const o=[];
  if(p.type==="int"){
    const n=p.ints&&p.ints[0]?p.ints[0].n:0;
    o.push({id:"soft",g:"cansat",t:"Versió suau",d:(n>1?"Un bloc menys i ":"")+"els watts un 5 % més baixos."});
    o.push({id:"short",g:"temps",t:"Versió curta d'1h",d:"Els mateixos blocs, amb 10′ d'escalfament i tornada curta."});
  }
  if(p.type==="long"){
    o.push({id:"soft",g:"cansat",t:"Versió suau",d:"Fins a 2h30 en Z2, sense blocs de tempo."});
    o.push({id:"short",g:"temps",t:"Versió de 2 h",d:"2 h en Z2"+(p.ints&&p.ints.length?" amb un sol bloc de tempo":"")+"."});
  }
  if(p.type==="end"||p.type==="rec"){
    o.push({id:"soft",g:"cansat",t:"Més suau",d:"Z1–Z2 baix, sense passar de "+W(.68)+" W."});
    o.push({id:"short",g:"temps",t:"Versió d'1 h",d:"1 h en Z2."});
  }
  if(p.type==="run"){
    o.push({id:"soft",g:"cansat",t:"Més suau i curta",d:"35′ molt suaus o caminar ràpid."});
  }
  if(p.type!=="end"&&p.type!=="rec"&&p.type!=="run")o.push({id:"z2",g:"cansat",t:"Canvia-la per Z2 1h30",d:"Res d'intensitat. Si és clau, el coach la recol·loca."});
  o.push({id:"rest",g:"cansat",t:"Descans",d:"Avui res. El coach reorganitzarà la setmana aquest vespre."});
  return o;
}
function adjPatch(p,kind){
  const k=p.k||1,P={};
  if(kind==="soft"){
    if(p.type==="int"){P.ints=(p.ints||[]).map((x,i)=>i===0?Object.assign({},x,{n:Math.max(1,x.n-1)}):x);P.k=Math.round(k*0.95*100)/100;P.t=p.t+" (suau)"}
    else if(p.type==="long"){P.ints=[];P.min=Math.min(p.min||150,120);P.maxMin=150;P.band=[.56,.72];P.t="Fons suau en Z2";P.z="z2";P.steps=[{l:"Sessió",x:"2h–2h30 en Z2 a {58,70}, pujades com a màxim a {75}"}]}
    else if(p.type==="run"){P.min=35;P.t="Córrer molt suau 35′";P.steps=[{l:"Sessió",x:"35′ molt suaus (5:40–6:00/km) o caminar ràpid"}]}
    else{P.band=[.5,.68];P.t=p.t+" (suau)";P.steps=[{l:"Sessió",x:fmtDur((p.min||90)*60)+" a {50,68}, sense apretar a les pujades"}]}
  } else if(kind==="short"){
    if(p.type==="int"){P.min=60;P.maxMin=null;P.t=p.t+" (1 h)";P.steps=[{l:"Escalfament",x:"10′ progressius + 1′ a {100}"}].concat(steps(p).filter(s=>/Principal|Pla B/.test(s.l))).concat([{l:"Calma",x:"Fins a 1 h, en Z1–Z2"}])}
    else if(p.type==="long"){P.min=120;P.maxMin=null;P.ints=p.ints&&p.ints.length?[Object.assign({},p.ints[0],{n:1})]:[];P.t="Fons de 2 h";P.steps=[{l:"Sessió",x:"2 h en Z2 a {61,73}"+(P.ints.length?" · 1 bloc de tempo a la segona hora":"")}]}
    else{P.min=60;P.maxMin=null;P.t="Z2 d'1 h";P.steps=[{l:"Sessió",x:"1 h en Z2 a {61,73}"}]}
  } else if(kind==="z2"){
    Object.assign(P,{type:"end",z:"z2",t:"Z2 suau 1h30",min:90,maxMin:null,ints:[],band:[.56,.72],cad:[85,92],key:false,steps:[{l:"Sessió",x:"1h30 en Z2 a {58,72}, sense passar de {75}"}],fuel:"Aigua i 30 g/h"});
  }
  return P;
}
function applyAdj(id,kind){
  const p=S[id];if(!p)return;
  if(kind==="rest"){setOv(id,{status:"removed",userAdj:{kind,at:new Date().toISOString(),keys:[]}});addLog("Avui no: «"+p.t+"» del "+dayLabel(p.d)+" eliminada.");toast("Fet. Avui descans; el coach ho reorganitza aquest vespre.");chg=null;queueSync();render();return}
  const P=adjPatch(p,kind),keys=Object.keys(P),label={soft:"versió suau",short:"versió curta",z2:"Z2 1h30"}[kind];
  P.adjNote="Canvi teu ("+label+"). El coach en té constància i ajustarà la resta de la setmana.";
  P.userAdj={kind,at:new Date().toISOString(),keys:keys.concat(["adjNote"]),from:p.t};
  setOv(id,P);S=buildSessions();memo.clear();addLog("«"+P.userAdj.from+"» del "+dayLabel(p.d)+": "+label+".");chg=null;queueSync();toast("Fet: "+label+".");render();
}
function undoAdj(id){
  const p=S[id];if(!p||!p.userAdj)return;
  const patch={userAdj:null,status:p.userAdj.kind==="rest"?"planned":undefined};
  (p.userAdj.keys||[]).forEach(k=>{patch[k]=null});
  if(patch.status===undefined)delete patch.status;
  setOv(id,patch);S=buildSessions();memo.clear();addLog("Desfet el canvi de «"+(p.userAdj.from||p.t)+"».");queueSync();render();
}
function changeHTML(p){
  if(!canChange(p)&&!(p&&p.userAdj))return "";
  if(p.userAdj)return '<div class="actions"><button class="btn ghost" type="button" data-undoadj="'+esc(p.id)+'">Desfés el meu canvi</button></div>';
  if(chg!==p.id)return '<div class="actions"><button class="btn ghost" type="button" data-chg="'+esc(p.id)+'">'+(p.d===todayStr?"Avui no puc / estic cansat":"Canvia aquesta sessió")+'</button></div>';
  const o=adjOptions(p);
  let h='<div class="chg"><div class="label">Estic cansat</div>'+o.filter(x=>x.g==="cansat").map(x=>'<button class="opt" type="button" data-adj="'+esc(p.id)+'|'+x.id+'"><span>'+esc(x.t)+'</span><small>'+esc(x.d)+'</small></button>').join("");
  const t=o.filter(x=>x.g==="temps");
  if(t.length)h+='<div class="label">Tinc poc temps</div>'+t.map(x=>'<button class="opt" type="button" data-adj="'+esc(p.id)+'|'+x.id+'"><span>'+esc(x.t)+'</span><small>'+esc(x.d)+'</small></button>').join("");
  h+='<div class="label">Avui no puc: passa-la a un altre dia</div>';
  for(let i=1;i<=6;i++){
    const d=addDays(p.d,i),on=sessionsOn(d),block=on.find(x=>x.type!=="rest"&&x.type!=="rec"&&x.type!=="gym"&&x.id!==p.id);
    const hard=x=>x&&(x.key||x.type==="int"||x.type==="long");
    const nb=[sessionsOn(addDays(d,-1)),sessionsOn(addDays(d,1))].flat().filter(x=>x.id!==p.id).some(hard);
    const sub=block?"ja té «"+block.t+"»":(hard(p)&&nb?"queda enganxada a una altra sessió dura":on.some(x=>x.type==="rest")?"substitueix el descans":"dia lliure");
    h+='<button class="opt" type="button" data-move="'+esc(p.id)+'" data-to="'+d+'"'+(block?" disabled":"")+'><span>'+(i===1&&p.d===todayStr?"Demà":esc(dayLabel(d)))+'</span><small>'+esc(sub)+'</small></button>';
  }
  return h+'<div class="actions"><button class="btn ghost" type="button" data-chgcancel="1">Cancel·la</button></div></div>';
}

/* ---------- On fer les sèries ---------- */
// Pujades que l'Albert fa sovint (dades dels seus segments de Strava: temps i watts reals).
const CLIMBS=[
  {n:"Els Àngels per Madremanya",km:3.85,m:279,g:7.2,t:1179,w:241,near:true},
  {n:"Els Àngels des de Girona",km:10.8,m:424,g:3.9,t:2353,w:199,near:true},
  {n:"Santa Pellaia (des de Cassà)",km:8.4,m:280,g:3.3,t:1572,w:207,near:true},
  {n:"Montnegre (des de Quart)",km:5.4,m:283,g:5.3,t:1350,w:181,near:true},
  {n:"Can Mascort",km:3.15,m:145,g:4.6,t:778,w:206,near:true},
  {n:"Les Encies",km:3.6,m:150,g:4.1,t:720,w:212,near:true},
  {n:"Sant Martí Sacalm per Amer",km:8.2,m:602,g:7.3,t:2661,w:211,near:false},
  {n:"Bordils – Madremanya",km:6.1,m:112,g:1.8,t:965,w:175,near:true,flat:true},
  {n:"Girona – Celrà (pla)",km:6.8,m:25,g:0.4,t:856,w:167,near:true,flat:true}
];
function climbTime(c,P){const e=c.g>=5?0.9:c.g>=3?0.7:0.4;return c.t*Math.pow(c.w/P,e)}
function whereHTML(p){
  if(!p||!active(p)||p.type==="rest"||p.type==="gym"||p.type==="run"||p.done||actFor(p))return "";
  const F=ftp(),k=p.k||1,mm=s=>Math.round(s/60)+"′";
  let rows=[];
  if(p.ints&&p.ints.length){
    const sp=p.ints[0],mid=sp.hi==null?sp.lo:(sp.lo+sp.hi)/2,P=mid*F*k,rec=sp.s>=900?300:240,force=sp.cad&&sp.cad[0]<70,long=p.type==="long";
    CLIMBS.forEach(c=>{
      if(c.flat&&!long&&!(sp.s>=900&&mid<.85))return;
      if(!c.near&&!long)return;
      const T=climbTime(c,P),r=T/sp.s;if(r<0.95)return;
      const per=Math.max(1,Math.floor((T+rec*0.5)/(sp.s+rec*0.5)));
      let sc=r<=1.5?3:r<=2.6?2:1;
      if(force)sc+=(c.g>=4&&c.g<=7)?2:-1;
      else if(sp.s>=900)sc+=(c.g>=2.5&&c.g<=5)?1.5:0;
      else if(sp.s<=600)sc+=(c.g>=6)?1.5:0;
      if(long&&!c.near)sc+=0.5;
      rows.push({c,T,per,sc,txt:per>=sp.n?"hi caben els "+sp.n+" blocs seguits (recuperant suau)":per>1?per+" blocs per pujada; repeteix-la":"1 bloc per pujada; baixa i repeteix"});
    });
    rows.sort((a,b)=>b.sc-a.sc);rows=rows.slice(0,3);
    if(!rows.length)return "";
    return '<div class="where"><div class="label">On fer-ho</div><ul class="checks">'+rows.map(x=>'<li><span class="m info">▲</span><span><b>'+esc(x.c.n)+'</b> · '+String(x.c.km).replace(".",",")+' km al '+String(x.c.g).replace(".",",")+' %. A '+Math.round(P)+' W, la pujada et dura uns '+mm(x.T)+': '+esc(x.txt)+'.</span></li>').join("")+'</ul><div class="note">Temps calculats amb els teus watts i temps reals a cada pujada.</div></div>';
  }
  if(p.type==="end"||p.type==="rec"||p.type==="long"){
    const top=(p.band?p.band[1]:.72)*F*k;
    const opts=CLIMBS.filter(c=>c.near&&c.g<=4.2).slice(0,3);
    return '<div class="where"><div class="label">On rodar</div><div class="note">Terreny pla o de pujada suau. A les pujades, no passis de '+Math.round(top)+' W: '+opts.map(c=>c.n+" ("+String(c.g).replace(".",",")+" %)").join(", ")+'.</div></div>';
  }
  return "";
}

/* ---------- El temps ---------- */
let wx=lsGet("qw.wx",null),wxBusy=false;
function loadWeather(force){
  if(wxBusy)return;
  if(!force&&wx&&Date.now()-wx.at<60*60*1000)return;
  wxBusy=true;
  fetch("https://api.open-meteo.com/v1/forecast?latitude=41.98&longitude=2.82&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m&timezone=Europe%2FMadrid&forecast_days=3&wind_speed_unit=kmh")
  .then(r=>r.ok?r.json():Promise.reject(r.status)).then(j=>{if(j&&j.hourly){wx={at:Date.now(),h:j.hourly};lsSet("qw.wx",wx)}})
  .catch(()=>{}).then(()=>{wxBusy=false;renderWeather()});
}
const WDIR=["N","NE","E","SE","S","SO","O","NO"];
function windName(deg){const i=Math.round(((deg%360)+360)%360/45)%8;return WDIR[i]+(i===0||i===7?" (tramuntana)":i===1?" (gregal)":i===4?" (migjorn)":i===6?" (ponent)":i===2?" (llevant)":"")}
function wxTarget(){
  const today=sessionsOn(todayStr).find(x=>x.type!=="gym"&&x.type!=="rest");
  if(today&&!today.done&&!actFor(today)&&!runFor(today))return today;
  const tm=addDays(todayStr,1);return sessionsOn(tm).find(x=>x.type!=="gym"&&x.type!=="rest")||null;
}
function clothes(minT,maxT,rain,wind,run){
  const L=[];
  if(run){
    if(minT>=15)L.push("Samarreta i pantaló curts.");else if(minT>=8)L.push("Samarreta de màniga llarga fina i pantaló curt o malles.");else L.push("Màniga llarga tèrmica, malles i guants fins.");
  } else {
    if(minT>=21)L.push("Mallot i culot curts.");
    else if(minT>=16)L.push("Mallot i culot curts + armilla a la butxaca per a les baixades.");
    else if(minT>=11)L.push("Mallot curt amb maniguets i camals (o genolleres), armilla i guants curts.");
    else if(minT>=6)L.push("Mallot de màniga llarga tèrmic o jaqueta lleugera, culot llarg, guants llargs i buff.");
    else L.push("Jaqueta d'hivern, culot llarg tèrmic, guants d'hivern, cobresabates i buff.");
    if(maxT-minT>=6)L.push("Hi haurà "+Math.round(maxT-minT)+"° de diferència: vés per capes.");
  }
  if(rain>=40)L.push("Probabilitat de pluja del "+Math.round(rain)+" %: jaqueta impermeable"+(run?"":" i guardafangs si en tens")+".");
  if(wind>=25)L.push("Vent fort: surt de cara al vent i torna amb el vent a favor.");
  return L;
}
function renderWeather(){
  const el=document.getElementById("weather");if(!el)return;
  const p=wxTarget();
  if(!p||!wx||!wx.h){el.hidden=true;el.innerHTML="";return}
  const dep=state.depHour==null?10:state.depHour,dur=Math.max(1,Math.ceil(((p.maxMin?(p.min+p.maxMin)/2:p.min)||60)/60));
  const idx=[];wx.h.time.forEach((t,i)=>{if(t.slice(0,10)===p.d){const hh=+t.slice(11,13);if(hh>=dep&&hh<=dep+dur)idx.push(i)}});
  if(!idx.length){el.hidden=true;el.innerHTML="";return}
  const H=wx.h,pick=k=>idx.map(i=>H[k][i]);
  const tmin=Math.min(...pick("apparent_temperature")),tmax=Math.max(...pick("temperature_2m")),rain=Math.max(...pick("precipitation_probability").map(x=>x||0));
  const wind=Math.max(...pick("wind_speed_10m")),gust=Math.max(...pick("wind_gusts_10m")),wdir=H.wind_direction_10m[idx[0]];
  el.hidden=false;
  el.innerHTML='<div class="in" style="gap:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><div><div class="kicker">El temps · '+(p.d===todayStr?"avui":"demà")+'</div><h3 style="margin-top:6px">'+Math.round(tmin)+'–'+Math.round(tmax)+'°</h3></div>'+
    '<div class="dep"><button type="button" class="btn ghost" data-dep="-1" aria-label="Surto abans">−</button><span>Surto a les <b>'+dep+':00</b></span><button type="button" class="btn ghost" data-dep="1" aria-label="Surto més tard">+</button></div></div>'+
    '<div class="wxrow">'+idx.map(i=>'<div><small>'+H.time[i].slice(11,13)+'h</small><b>'+Math.round(H.temperature_2m[i])+'°</b><i>'+(H.precipitation_probability[i]||0)+'%</i></div>').join("")+'</div>'+
    '<div class="note">Vent '+Math.round(wind)+' km/h del '+windName(wdir)+(gust>wind+10?", ràfegues de "+Math.round(gust):"")+' · sensació mínima '+Math.round(tmin)+'°.</div>'+
    '<ul class="checks">'+clothes(tmin,tmax,rain,wind,p.type==="run").map(t=>'<li><span class="m info">·</span><span>'+esc(t)+'</span></li>').join("")+'</ul></div>';
}

/* ---------- Què menjar ---------- */
function dayKind(d){
  const l=sessionsOn(d).filter(x=>x.type!=="gym");
  if(!l.length||l.every(x=>x.type==="rest"))return "rest";
  if(l.some(x=>x.type==="long"||(x.min||0)>=180))return "long";
  if(l.some(x=>x.key||x.type==="int"))return "key";
  return "easy";
}
const CARB={rest:[3,4],easy:[4,5],key:[5,7],long:[7,9]};
function foodHTML(d){
  d=d||todayStr;
  const kg=curWeight(),k=dayKind(d),nd=addDays(d,1),tk=dayKind(nd),isToday=d===todayStr;
  const p=sessionsOn(d).find(x=>x.type!=="gym"&&x.type!=="rest");
  const done=p&&(p.done||actFor(p)||runFor(p));
  let lo=CARB[k][0],hi=CARB[k][1];if(tk==="long"||tk==="key"){lo+=1;hi+=1}
  const g=x=>Math.round(x*kg/10)*10;
  const L=[],dn=isToday?"Avui":dayLabel(d),post="20–30 g de proteïna i "+(k==="key"||k==="long"?Math.round(kg/10)*10:Math.round(kg/20)*10)+" g d'hidrats en la primera hora: iogurt grec amb fruita i civada, o entrepà de pernil o pollastre.";
  if(done){
    L.push({h:"Ara, per recuperar",t:post+" Després, àpats normals amb hidrats i proteïna."});
  } else {
    L.push({h:dn+" en total",t:"Uns "+g(lo)+"–"+g(hi)+" g d'hidrats ("+lo+"–"+hi+" g/kg) i "+Math.round(1.6*kg)+"–"+Math.round(2*kg)+" g de proteïna repartida en 4 àpats."+(k==="rest"||k==="easy"?" Dia tranquil: és on pots menjar una mica menys per baixar de pes.":" Dia de feina: no és dia de passar gana.")});
    if(p){
      const durH=((p.maxMin?(p.min+p.maxMin)/2:p.min)||60)/60,pre=Math.round((k==="easy"?1:1.5)*kg/10)*10;
      L.push({h:"2–3 h abans",t:"Uns "+pre+" g d'hidrats: civada amb llet i plàtan, o torrades amb mel i un parell d'ous. Si surts d'hora i no hi ha temps, un plàtan i un iogurt 45′ abans."});
      const fm=p.fuel?String(p.fuel).match(/(\d+)\D+(\d+)\s*g\/h/):null;
      const gh=p.type==="run"?0:durH<1.25?0:fm?(+fm[1]+ +fm[2])/2:durH>2.5?70:k==="key"?55:35;
      if(gh){const tot=Math.round(gh*durH/5)*5,gels=Math.round(tot/25);L.push({h:"A la bici",t:gh+" g/h · "+tot+" g en total ≈ "+gels+" gels de 25 g (o barretes i plàtans equivalents). Comença al minut 30 i menja cada 30–40′. Aigua amb sals."})}
      else L.push({h:p.type==="run"?"Corrent":"A la bici",t:"Sessió curta: aigua i prou."});
      L.push({h:"En acabar",t:post});
    }
  }
  if(tk==="long"||tk==="key")L.push({h:isToday?"Per a demà":"Per a l'endemà",t:(isToday?"Demà":"L'endemà")+" toca «"+(sessionsOn(nd).find(x=>x.type!=="gym")||{}).t+"»: sopar amb arròs, pasta o patata generós, i proteïna."});
  const title=done?"Recupera bé":{rest:"Dia de descans",easy:"Dia suau",key:"Dia de sessió clau",long:"Dia de fons llarg"}[k];
  return '<div class="in" style="gap:12px"><div><div class="kicker">Què menjar · '+esc(isToday?"avui":dayLabel(d))+'</div><h3 style="margin-top:6px">'+title+'</h3></div><dl class="steps">'+L.map(x=>'<dt>'+esc(x.h)+'</dt><dd>'+esc(x.t)+'</dd>').join("")+'</dl><div class="note">Calculat per a '+String(kg).replace(".",",")+' kg. Orientatiu: si tens gana de veritat, menja.</div></div>';
}
function selDay(){if(!selId)return todayStr;if(selId.startsWith("day:"))return selId.slice(4);return S[selId]?S[selId].d:todayStr}
function renderFood(){const f=document.getElementById("food");if(!f)return;f.className="";f.hidden=false;f.innerHTML=nutLinkHTML()}

/* ---------- Sincronització amb el coach (repositori privat) ---------- */
let sync=lsGet("qw.sync",{token:"",repo:"albertgraubosch/quadern-privat",last:null,err:""});
function saveSync(){lsSet("qw.sync",sync)}
let syncT=0,syncBusy=false;
function queueSync(){if(!sync.token)return;clearTimeout(syncT);syncT=setTimeout(pushInbox,2500)}
function inboxData(){
  const adj=all().filter(s=>s.userAdj).map(s=>({id:s.id,d:s.d,kind:s.userAdj.kind,from:s.userAdj.from||s.t,now:s.t,at:s.userAdj.at,status:s.status}));
  const moved=all().filter(s=>s.movedFrom).map(s=>({id:s.id,from:s.movedFrom,to:s.d,t:s.t}));
  const removed=all().filter(s=>s.status==="removed"&&!s.userAdj).map(s=>({id:s.id,d:s.d,t:s.t}));
  return {updated:new Date().toISOString(),app:APP_VERSION,ftpApp:state.ftp||null,weights:(state.weights||[]).slice(-30),checkins:state.checkins||{},changes:{adjusted:adj,moved,removed},log:state.log.slice(-30),ftpTests:state.ftpTests||[]};
}
function b64(s){return btoa(unescape(encodeURIComponent(s)))}
function pushInbox(){
  if(!sync.token||syncBusy)return Promise.resolve();
  syncBusy=true;
  const url="https://api.github.com/repos/"+sync.repo+"/contents/inbox.json",H={Authorization:"Bearer "+sync.token,Accept:"application/vnd.github+json"};
  return fetch(url,{headers:H,cache:"no-store"}).then(r=>r.status===404?{}:r.ok?r.json():Promise.reject({status:r.status}))
  .then(cur=>fetch(url,{method:"PUT",headers:Object.assign({"Content-Type":"application/json"},H),body:JSON.stringify({message:"App: dades de l'Albert",content:b64(JSON.stringify(inboxData(),null,1)),sha:cur.sha})}))
  .then(r=>{if(!r.ok)return Promise.reject({status:r.status});sync.last=new Date().toISOString();sync.err="";saveSync()})
  .catch(e=>{sync.err=e&&e.status===401?"El token no és vàlid o ha caducat.":e&&e.status===404?"No trobo el repositori «"+sync.repo+"» o el token no hi té accés.":e&&e.status===403?"El token no té permís d'escriptura (Contents: Read and write).":"No s'ha pogut enviar. Ho tornaré a provar.";saveSync()})
  .then(()=>{syncBusy=false;if(page==="ajustos")renderSettings()});
}

/* ---------- Strava: posar el títol directament ---------- */
function canWrite(){return /activity:write/.test(strava.scope||"")}
function apiPut(path,body){
  return ensureToken(false).then(tok=>fetch(API+path,{method:"PUT",headers:{Authorization:"Bearer "+tok,"Content-Type":"application/json"},body:JSON.stringify(body)})).then(r=>{if(!r.ok)throw {code:r.status===401?"reauth":"http",status:r.status};return r.json()});
}
function setStravaTitle(id,name){
  apiPut("/activities/"+id,{name}).then(()=>{const a=allList.find(x=>String(x.id)===String(id));if(a){a.name=name;lsSet("qw.acts",allList)}toast("Títol posat a Strava ✓");renderTitles()})
  .catch(e=>{copyText(name,e&&(e.status===401||e.status===403)?"Strava no deixa escriure: torna a donar el permís a Ajustos. L'he copiat.":"No s'ha pogut posar. L'he copiat perquè l'enganxis.")});
}

/* ---------- Rendiment ---------- */
function renderPerf(){
  const el=document.getElementById("perfBody");if(!el)return;
  const kg=curWeight(),F=ftp(),e=eftp(),f2=x=>x.toFixed(2).replace(".",",");
  let h="";
  // FTP i rècords
  const nC=Object.keys(curves).length;
  h+='<section class="card"><div class="in" style="gap:12px"><div class="kicker">FTP</div><div class="stats">'+
    '<div class="stat"><div class="k">FTP oficial</div><div class="v">'+F+' W</div></div>'+
    '<div class="stat"><div class="k">Estimat ara</div><div class="v">'+(e?e.v+" W":"—")+'</div>'+(e&&e.hi!==e.lo?'<div class="note">'+e.lo+'–'+e.hi+' W</div>':'')+'</div>'+
    '<div class="stat"><div class="k">W/kg</div><div class="v">'+f2(F/kg)+'</div></div></div>'+
    '<div class="note">'+(e?"Calculat amb les teves millors marques dels últims 90 dies per diversos mètodes. Com que els esforços que no són a tope només poden tirar-lo avall, faig servir els dos més alts. L'oficial el fixa el test.":nC?"Encara no hi ha prou dades per estimar-lo.":"Llegint les teves sortides de Strava…")+'</div>'+
    (e?'<details class="deep"><summary>Com el calculo</summary><div class="tbl" style="margin-top:8px"><table><thead><tr><th>Mètode</th><th>Marca</th><th>FTP</th></tr></thead><tbody>'+e.methods.map((x,i)=>'<tr><td style="font-family:var(--f-body);white-space:normal">'+esc(x.t)+'<div class="note">'+esc(dayLabel(x.d))+'</div></td><td>'+x.w+' W</td><td'+(i<2?' class="s-ok"':'')+'>'+x.v+'</td></tr>').join("")+'</tbody></table></div></details>':'');
  const tp=all().find(s=>s.cat==="test"&&s.d<=todayStr&&acts[s.d]&&curves[String(acts[s.d].id)]&&s.d>=addDays(todayStr,-7));
  if(tp){const c=curves[String(acts[tp.d].id)].b,v=c[1200]?Math.round(c[1200]*0.95):null;if(v&&v!==F)h+='<div class="suggest"><div class="kicker">Resultat del test</div><div>20′ a '+c[1200]+' W → FTP = '+v+' W ('+f2(v/kg)+' W/kg).</div><div class="actions"><button class="btn primary" type="button" data-setftp="'+v+'">Fes-lo servir com a FTP</button></div></div>'}
  const rec=[];Object.keys(curves).filter(id=>curves[id].d>=addDays(todayStr,-30)).forEach(id=>recordsFor(id).forEach(r=>rec.push(Object.assign({d:curves[id].d},r))));
  rec.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:b.L-a.L);
  if(rec.length)h+='<div class="label">Rècords dels últims 30 dies</div><div class="tbl"><table><thead><tr><th>Durada</th><th>Watts</th><th>Abans</th><th>Dia</th></tr></thead><tbody>'+rec.slice(0,8).map(r=>'<tr><td>'+DLAB[r.L]+'</td><td class="s-ok">'+r.w+'</td><td>'+r.prev+'</td><td>'+esc(dayLabel(r.d))+'</td></tr>').join("")+'</tbody></table></div>';
  h+='</div></section>';
  // Perfil
  const rows=profileData(),ty=profileType(rows);
  h+='<section class="card"><div class="in" style="gap:12px"><div><div class="kicker">Perfil de potència</div><h3 style="margin-top:6px">'+(ty?esc(ty[0]):"Perfil")+'</h3></div>'+(ty?'<div class="note">'+esc(ty[1])+'</div>':'');
  h+='<div class="prof2">'+rows.map(r=>'<div class="pr"><div class="prh"><span>'+esc(r.label)+'</span><b>'+r.w+' W · '+f2(r.wkg)+' W/kg</b></div><div class="lvbar"><i style="width:'+Math.min(100,r.lv.f/8*100).toFixed(1)+'%"></i></div><div class="note">'+esc(r.lv.name)+(r.d?" · "+esc(dayLabel(r.d)):" · FTP oficial")+'</div></div>').join("")+'</div>';
  h+='<div class="lvleg">'+LV.map(l=>'<span>'+esc(l)+'</span>').join("")+'</div><div class="note">Millors marques dels últims 4 mesos amb '+String(kg).replace(".",",")+' kg. Nivells aproximats de l\'escala de Coggan (homes). L\'esprint i el minut només són fiables si algun dia els has fet a tope.</div>';
  // Evolució mensual
  const months=[];for(let i=3;i>=0;i--){const d=parseD(todayStr);d.setDate(1);d.setMonth(d.getMonth()-i);const from=localDate(d);d.setMonth(d.getMonth()+1);d.setDate(0);months.push([from,localDate(d)])}
  const mb=months.map(([a,b])=>bestCurve(a,b).b);
  if(mb.some(b=>Object.keys(b).length))h+='<div class="label">Evolució per mesos</div><div class="tbl"><table><thead><tr><th></th>'+months.map(([a])=>'<th>'+MONTHS[parseD(a).getMonth()]+'</th>').join("")+'</tr></thead><tbody>'+[5,60,300,1200].map(L=>'<tr><td>'+DLAB[L]+'</td>'+mb.map(b=>'<td>'+(b[L]||"—")+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
  h+='</div></section>';
  // Pes
  const ws=state.weights||[];
  h+='<section class="card"><div class="in" style="gap:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><div><div class="kicker">Pes</div><h3 style="margin-top:6px">'+String(kg).replace(".",",")+' kg</h3></div><span class="note">Objectiu 70 kg</span></div>';
  if(ws.length>1){const v=ws.slice(-12),mn=Math.min(70,...v.map(x=>x.kg))-0.5,mx=Math.max(...v.map(x=>x.kg))+0.5,yy=x=>(40-(x-mn)/(mx-mn)*38).toFixed(1);
    h+='<svg class="spark" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Evolució del pes"><line x1="0" x2="100" y1="'+yy(70)+'" y2="'+yy(70)+'" stroke="var(--ok)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><polyline points="'+v.map((x,i)=>(i/(v.length-1)*100).toFixed(1)+","+yy(x.kg)).join(" ")+'" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>'}
  h+='<div class="row2"><div class="field" style="flex:1"><label for="wkg">Pes d\'avui (kg)</label><input id="wkg" type="number" inputmode="decimal" step="0.1" min="40" max="150" placeholder="'+String(kg).replace(".",",")+'"></div><button class="btn primary" type="button" id="wSave">Desa</button></div>';
  h+='<div class="note">Amb el mateix FTP, a 70 kg series a '+f2(F/70)+' W/kg (ara '+f2(F/kg)+'). Pesa\'t un cop per setmana, al matí i en dejú.</div>'+weighCfgHTML()+(ws.length?'<div class="note">Últims: '+ws.slice(-4).reverse().map(x=>dayLabel(x.d)+" "+String(x.kg).replace(".",",")).join(" · ")+'</div>':'')+'</div></section>';
  // Objectius
  const G=goals();
  if(G.length)h+='<section class="card"><div class="in" style="gap:12px"><div class="kicker">Objectius</div>'+G.map(g=>{
    const n=daysTo(g.d);let extra="";
    if(g.kind==="ftp"){const now=Math.max(F,e?e.v:0),pc=Math.max(0,Math.min(100,(now-FTP0)/(g.target-FTP0)*100));extra='<div class="bar2"><i style="width:'+Math.max(3,pc).toFixed(0)+'%"></i></div><div class="note">Ara '+now+' W de '+g.target+' W · en falten '+Math.max(0,g.target-now)+'.</div>'}
    else if(g.target)extra='<div class="note">'+esc(g.target)+'</div>';
    return '<div class="goal"><div class="gl"><b>'+esc(g.t)+'</b><span>'+esc(dayLabel(g.d))+'</span></div><div class="gn">'+(n===0?"Avui":n===1?"Demà":n+" dies")+'</div>'+extra+'</div>'}).join("")+'</div></section>';
  h+='<section class="card" id="state"></section>';
  h+='<section class="card">'+weekSummaryHTML(mondayOf(todayStr),"Aquesta setmana")+'</section>';
  h+='<section class="card">'+weekSummaryHTML(addDays(mondayOf(todayStr),-7),"Setmana passada")+'</section>';
  el.innerHTML=h;renderState();
}

/* ---------- Diari ---------- */
function renderDiary(){
  const fr=allNotes().filter(n=>n.date>=addDays(todayStr,-2));state.notesRead=[...new Set((state.notesRead||[]).concat(fr.map(noteKey)))].slice(-80);saveState();
  const nb=document.querySelector('#nav [data-page="diari"]');if(nb)nb.classList.remove("dot");
  const el=document.getElementById("notesList");if(!el)return;
  const notes=allNotes(),cks=Object.entries(state.checkins||{}).map(([id,c])=>Object.assign({id},c));
  const dates=[...new Set(notes.map(n=>n.date).concat(cks.map(c=>c.d)))].sort().reverse();
  if(!dates.length){el.innerHTML='<p class="note">Encara no hi ha res. El coach escriu una nota cada vespre i aquí també veuràs com t\'has trobat a cada sortida.</p>';return}
  el.innerHTML=dates.map(d=>{
    const dd=parseD(d);
    return '<div class="nday"><h3>'+DAYNAMES[dd.getDay()]+' '+dd.getDate()+' '+MONTHS[dd.getMonth()]+'</h3><span class="note">Setmana '+weekNo(d)+'</span>'+
      cks.filter(c=>c.d===d).map(c=>'<div class="ckmini"><b>Tu'+(c.name?" · "+esc(c.name):"")+'</b><span>'+esc(ckSummary(c))+'</span>'+(c.note?'<span>«'+esc(c.note)+'»</span>':'')+'</div>').join("")+
      notes.filter(n=>n.date===d).map(n=>'<p class="ntext"><b class="who">Coach</b> '+esc(n.text)+'</p>').join("")+'</div>';
  }).join("");
}

/* ---------- Ajustos ---------- */
function renderSettings(){
  const el=document.getElementById("syncBox");if(!el)return;
  if(!sync.token){
    el.innerHTML='<div class="in setup"><div><div class="kicker">Connexió amb el coach</div><h3 style="margin-top:6px">Que el coach vegi com et trobes</h3></div>'+
      '<div class="note">Les valoracions, el pes i els canvis que facis a l\'app s\'envien a un repositori <b>privat</b> teu a GitHub. La revisió de cada vespre els llegeix d\'allà. Sense això, només es queden en aquest mòbil.</div>'+
      '<ol><li>A GitHub, crea un token: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>. Nom: «Quadern de Watts». Caducitat: 1 any.</li><li>«Repository access»: <b>Only select repositories</b> → <b>quadern-privat</b>.</li><li>«Permissions» → «Contents»: <b>Read and write</b>. Genera\'l i copia\'l aquí. Es queda només en aquest mòbil.</li></ol>'+
      '<div class="field"><label for="syncRepo">Repositori</label><input id="syncRepo" autocomplete="off" autocapitalize="off" spellcheck="false" value="'+esc(sync.repo)+'"></div>'+
      '<div class="field"><label for="syncTok">Token</label><input id="syncTok" autocomplete="off" autocapitalize="off" spellcheck="false"></div>'+
      '<div class="actions"><button class="btn primary" type="button" id="syncSave">Connecta i prova</button></div></div>';
  } else {
    const l=sync.last?new Date(sync.last):null;
    el.innerHTML='<div class="in" style="gap:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3>Coach</h3><span class="note">'+esc(sync.repo)+'</span></div>'+
      '<div class="note">'+(syncBusy?"Enviant…":sync.err?'<span style="color:var(--bad)">'+esc(sync.err)+'</span>':l?"Últim enviament: "+l.getDate()+" "+MONTHS[l.getMonth()]+" a les "+String(l.getHours()).padStart(2,"0")+":"+String(l.getMinutes()).padStart(2,"0")+". S'envia sol cada cop que puntues una sortida, et peses o canvies una sessió.":"Encara no s'ha enviat res.")+'</div>'+
      '<div class="actions"><button class="btn primary" type="button" id="syncNow">Envia ara</button><button class="btn ghost" type="button" id="syncForget">Treu el token</button></div></div>';
  }
  const sw=document.getElementById("stravaWrite");
  if(sw)sw.innerHTML=!strava.refreshToken?"":canWrite()?'<div class="note">✓ L\'app pot posar els títols directament a Strava.</div>':'<div class="note">Perquè l\'app posi el títol directament a Strava (sense copiar i enganxar), cal donar-li permís d\'escriptura un cop.</div><div class="actions"><button class="btn ghost" type="button" id="stravaWriteBtn">Permet posar títols a Strava</button></div>';
  const dh=document.getElementById("depHourTxt");if(dh)dh.textContent=(state.depHour==null?10:state.depHour)+":00";
}

/* ---------- Registre de gimnàs ---------- */
function gymHistAll(){
  const seed=(plan&&Array.isArray(plan.gymLog)?plan.gymLog:[]),loc=state.gymHist||[];
  const m={};seed.concat(loc).forEach(e=>{m[e.d+"|"+e.ex]=e});
  return Object.values(m).sort((a,b)=>a.d<b.d?-1:1);
}
function gymLast(name,before){const l=gymHistAll().filter(e=>e.ex===name&&(!before||e.d<before));return l.length?l[l.length-1]:null}
function setTxt(x,unit){return (x.kg?String(x.kg).replace(".",",")+" kg × ":"")+x.reps+(unit==="s"?"″":"")}
function gymLogHTML(p){
  const cur=(state.gymSets||{})[p.id]||{},done=p.done||!!gymActs[p.d];
  let h='<div class="glog">';
  p.ex.forEach((e,i)=>{
    const last=gymLast(e.n,p.d),same=gymHistAll().find(x=>x.d===p.d&&x.ex===e.n),rows=cur[i]||(same?same.sets.map(x=>({kg:x.kg,reps:x.reps,ok:true})):[]),n=Math.max(same&&!cur[i]?same.sets.length:(e.sets||3),rows.length);
    h+='<div class="gx"><div class="gxh"><b>'+esc(e.n)+'</b><span>'+esc((e.sets||3)+" × "+(e.reps||"10")+(e.kg?" · "+e.kg:""))+'</span></div>';
    if(e.tip)h+='<div class="note">'+esc(e.tip)+'</div>';
    if(last)h+='<div class="note">Últim cop ('+esc(dayLabel(last.d))+'): '+esc(last.sets.map(x=>setTxt(x,e.unit)).join(" · "))+(last.note?" · "+esc(last.note):"")+'</div>';
    h+='<div class="gsets">';
    for(let j=0;j<n;j++){
      const r=rows[j]||{},ph=last&&last.sets[Math.min(j,last.sets.length-1)]||{};
      h+='<div class="gset'+(r.ok?" ok":"")+'"><span class="gn">'+(j+1)+'</span>'+
        '<label><input type="number" inputmode="decimal" step="0.5" min="0" data-gk="'+esc(p.id)+'|'+i+'|'+j+'|kg" value="'+(r.kg!=null?r.kg:"")+'" placeholder="'+(ph.kg!=null?ph.kg:(e.bw?"0":"kg"))+'"><i>kg</i></label>'+
        '<label><input type="number" inputmode="numeric" step="1" min="0" data-gk="'+esc(p.id)+'|'+i+'|'+j+'|reps" value="'+(r.reps!=null?r.reps:"")+'" placeholder="'+(ph.reps!=null?ph.reps:String(e.reps||"10").replace(/\D.*$/,""))+'"><i>'+(e.unit==="s"?"seg":"reps")+'</i></label>'+
        '<button type="button" class="gok" data-gok="'+esc(p.id)+'|'+i+'|'+j+'" aria-label="Sèrie feta">✓</button></div>';
    }
    h+='</div><button type="button" class="btn ghost gadd" data-gadd="'+esc(p.id)+'|'+i+'">+ sèrie</button></div>';
  });
  h+='</div>';
  if(done)h+='<div class="verdict ok"><span class="ic">✓</span><div>Gimnàs fet<small>'+(p.done&&p.done.by==="log"?"Registrat a l'app":gymActs[p.d]?esc(gymActs[p.d].name||"Activitat de Strava"):"Marcat a mà")+'</small></div></div>';
  h+='<div class="actions"><button class="btn primary" type="button" data-gsave="'+esc(p.id)+'">'+(done?"Actualitza el registre":"Desa i marca'l com a fet")+'</button></div>';
  if(gymActs[p.d])h+=checkinHTML(gymActs[p.d]);
  return h;
}
function gymSet(pid,i,j){state.gymSets=state.gymSets||{};const s=state.gymSets[pid]=state.gymSets[pid]||{};const r=s[i]=s[i]||[];r[j]=r[j]||{};return r[j]}
function gymSave(pid){
  const p=S[pid];if(!p||!p.ex)return;
  const cur=(state.gymSets||{})[pid]||{};let any=false;
  state.gymHist=(state.gymHist||[]).filter(e=>!(e.d===p.d&&p.ex.some(x=>x.n===e.ex)));
  p.ex.forEach((e,i)=>{const sets=(cur[i]||[]).filter(r=>r&&r.ok&&r.reps).map(r=>({kg:r.kg||0,reps:r.reps}));if(sets.length){any=true;state.gymHist.push({d:p.d,ex:e.n,sets})}});
  if(!any){toast("Marca amb ✓ almenys una sèrie.");return}
  saveState();setOv(pid,{done:{by:"log",at:new Date().toISOString()}});addLog("Gimnàs registrat: «"+p.t+"».");queueSync();toast("Gimnàs desat ✓");render();
}
function gymPerfHTML(){
  const H=gymHistAll();if(!H.length)return "";
  const names=[...new Set(H.map(e=>e.ex))];
  const best=e=>e.sets.reduce((m,x)=>Math.max(m,(x.kg||0)*(1+x.reps/30)+x.reps/1000),0);
  return '<section class="card"><div class="in" style="gap:12px"><div class="kicker">Gimnàs</div><div class="tbl"><table><thead><tr><th>Exercici</th><th>Últim</th><th>Millor</th><th>Cops</th></tr></thead><tbody>'+
    names.map(n=>{const l=H.filter(e=>e.ex===n),last=l[l.length-1],b=l.reduce((m,e)=>best(e)>best(m)?e:m,l[0]),top=x=>x.sets.reduce((m,s)=>(s.kg||0)>(m.kg||0)||((s.kg||0)===(m.kg||0)&&s.reps>m.reps)?s:m,x.sets[0]);
      return '<tr><td style="font-family:var(--f-body);white-space:normal">'+esc(n)+'<div class="note">'+esc(dayLabel(last.d))+'</div></td><td>'+esc(setTxt(top(last)))+'</td><td>'+esc(setTxt(top(b)))+'</td><td>'+l.length+'</td></tr>'}).join("")+
    '</tbody></table></div><div class="note">«Millor» té en compte pes i repeticions. Quan les últimes repeticions surtin fàcils, +2 kg.</div></div></section>';
}

let gymSel=null;
function renderGym(){
  const el=document.getElementById("gymBody");if(!el)return;
  const gs=all().filter(x=>x.type==="gym"&&active(x));
  const ws=mondayOf(todayStr),we=addDays(ws,6);
  let p=gymSel&&S[gymSel]&&S[gymSel].type==="gym"?S[gymSel]:null;
  if(!p)p=gs.find(x=>x.d===todayStr)||gs.find(x=>x.d>todayStr&&!x.done)||gs.filter(x=>x.d<todayStr).pop()||null;
  let h="";
  const week=gs.filter(x=>x.d>=ws&&x.d<=addDays(we,7));
  if(week.length)h+='<section class="card"><div class="in" style="gap:10px"><div class="kicker">Sessions</div><div class="glist">'+week.map(x=>{const dn=x.done||gymActs[x.d];return '<button type="button" class="gli'+(p&&x.id===p.id?" on":"")+'" data-gsel="'+esc(x.id)+'"><span class="gd">'+esc(x.d===todayStr?"Avui":dayLabel(x.d))+'</span><span class="gt">'+esc(x.t)+'</span><span class="gs">'+(dn?"✓":x.d<todayStr?"—":"")+'</span></button>'}).join("")+'</div></div></section>';
  if(p)h+=sessionCard(p,p.d===todayStr?"Avui":dayLabel(p.d));
  else h+='<section class="card"><div class="in"><div class="note">No hi ha cap sessió de gimnàs al pla.</div></div></section>';
  h+=gymPerfHTML();
  el.innerHTML=h;
}

/* ---------- Nutrició ---------- */
// Pautes: hidrats periodificats segons la càrrega del dia (3–10 g/kg), proteïna 1,8–2,2 g/kg en 4 àpats
// de 0,3–0,4 g/kg, greix ~1 g/kg. Dèficit moderat només els dies suaus o de descans; mai els dies durs.
let nutDay=null;
function bmr(){const kg=curWeight(),h=state.height||178,age=(plan&&plan.athlete&&plan.athlete.age)||23;return 10*kg+6.25*h-5*age+5}
function sessKcal(s){
  if(!s||!active(s)||s.type==="rest")return 0;
  const min=(s.maxMin?(s.min+s.maxMin)/2:s.min)||0;
  if(s.type==="gym")return Math.round(min*5);
  if(s.type==="run"){const pace=s.pace?(s.pace[0]+s.pace[1])/2:330;return Math.round(min*60/pace*curWeight())}
  const IF=s.type==="int"?(s.cat==="test"?0.80:0.78):s.type==="long"?0.72:s.type==="rec"?0.55:0.65;
  return Math.round(ftp()*IF*0.88*min*60/1000);
}
function dayNut(d){
  const L=sessionsOn(d).filter(s=>active(s)),k=dayKind(d),nk=dayKind(addDays(d,1)),kg=curWeight();
  const done=L.filter(s=>s.type!=="gym"&&s.type!=="rest").map(s=>actFor(s)||runFor(s)).filter(Boolean);
  let ex=L.reduce((m,s)=>m+sessKcal(s),0);
  if(done.length){const real=done.reduce((m,a)=>m+(a.kilojoules||(a.average_watts&&a.moving_time?a.average_watts*a.moving_time/1000:0)||(isRun(a)?(a.distance||0)/1000*kg:0)),0);if(real)ex=real+L.filter(s=>s.type==="gym").reduce((m,s)=>m+sessKcal(s),0)}
  const tdee=Math.round(bmr()*1.35+ex);
  const goalLoss=curWeight()>70.5;
  const def=goalLoss?Math.max(0,{rest:400,easy:350,key:150,long:0}[k]-((nk==="long"||nk==="key")&&k!=="long"?150:0)):0;
  const target=tdee-def;
  const P=Math.round(kg*(goalLoss?2.0:1.8));
  const cLo=CARB[k][0]+((nk==="long"||nk==="key")&&k!=="long"?1:0),cHi=CARB[k][1]+((nk==="long"||nk==="key")?1:0);
  let F=Math.round(kg*0.9);
  let C=Math.round((target-P*4-F*9)/4);
  C=Math.max(Math.round(cLo*kg),Math.min(Math.round(cHi*kg),C));
  F=Math.max(Math.round(kg*0.8),Math.min(Math.round(kg*1.2),Math.round((target-P*4-C*4)/9)));
  C=Math.round(C/5)*5;
  const kcal=Math.round((P*4+C*4+F*9)/50)*50;
  return {d,k,nk,L,kcal,P,C,F,ex:Math.round(ex),tdee,goalLoss};
}
const FOOD={
  esm:{alt:["Civada (80 g) cuita amb llet, un plàtan i mel + 2 ous remenats","3 llesques de pa amb tomàquet i pernil dolç + suc de taronja + iogurt grec"],mitja:["2 llesques de pa amb tomàquet i 2 ous + una peça de fruita","Iogurt grec amb civada (40 g), fruita i un grapat de nous"],baix:["Truita de 2–3 ous amb espinacs + 1 llesca de pa integral + fruita","Iogurt grec (250 g) amb fruits vermells i nous"]},
  din:{alt:["Arròs (100 g en sec) amb pollastre (150 g) i verdures saltejades","Pasta (110 g en sec) amb tonyina, tomàquet i formatge"],mitja:["Arròs o pasta (70 g en sec) + peix o pollastre (150 g) + amanida","Patates (250 g) al forn amb ous i verdura + pa"],baix:["Llegums (70 g en sec) amb verdures i un ou dur","Amanida gran amb salmó o pollastre (150 g), alvocat i 1 llesca de pa"]},
  ber:{alt:["Entrepà de pernil o gall dindi + plàtan","Iogurt amb mel, civada i fruita"],mitja:["Iogurt grec amb fruita","Torrada amb crema de cacauet i plàtan"],baix:["Iogurt grec o formatge fresc amb fruita","Un grapat de fruits secs i una peça de fruita"]},
  sop:{alt:["Noodles o arròs (80 g en sec) amb pollastre, verdures i ou","Patata (300 g) i peix blanc (180 g) amb verdura + pa"],mitja:["Truita de patates (2 ous, 150 g de patata) + amanida","Pasta (60 g en sec) amb salmó i verdures"],baix:["Peix o pollastre (180 g) a la planxa amb verdures i una mica de patata","Crema de verdures + truita de 2 ous o tonyina"]}
};
function pick(arr,d,i){return arr[(parseD(d).getDate()+i)%arr.length]}
function lvlFor(g){return g>=85?"alt":g>=50?"mitja":"baix"}
function hh(h){h=Math.round((((h%24)+24)%24)*4)/4;const m=Math.round((h%1)*60);return Math.floor(h)+":"+String(m).padStart(2,"0")}
function mealsFor(n){
  const d=n.d,kg=curWeight(),s=n.L.find(x=>x.type!=="gym"&&x.type!=="rest"),dep=state.depHour==null?10:state.depHour;
  const durH=s?((s.maxMin?(s.min+s.maxMin)/2:s.min)||60)/60:0;
  const ses=s&&!(s.type==="rec"&&durH<1);
  const pp=Math.round(kg*0.4/5)*5;
  const M=[];
  let Cleft=n.C;
  const add=(o)=>{M.push(o)};
  if(ses){
    const fm=s.fuel?String(s.fuel).match(/(\d+)\D+(\d+)\s*g\/h/):null;
    const gh=s.type==="run"?0:durH<1.25?0:fm?(+fm[1]+ +fm[2])/2:durH>2.5?70:n.k==="key"?55:35;
    const dur=Math.round(gh*durH/5)*5;
    const pre=Math.round((n.k==="long"||n.k==="key"?1.5:1)*kg/5)*5;
    const post=Math.round((n.k==="long"||n.k==="key"?1:0.6)*kg/5)*5;
    const morning=dep<12;
    add({h:hh(dep-2.5),t:"Esmorzar (abans de la sessió)",c:pre,p:pp,food:pick(FOOD.esm[lvlFor(pre)],d,0),tip:"2–3 h abans. Poca fibra i poc greix."});
    if(!morning)add({h:"8:00",t:"Esmorzar",c:Math.round(n.C*0.18/5)*5,p:pp,food:pick(FOOD.esm.mitja,d,1)});
    add({h:hh(dep)+"–"+hh(dep+durH),t:"Durant: "+s.t,c:dur,p:0,food:dur?Math.round(gh)+" g/h → "+Math.round(dur/25)+" gels de 25 g o l'equivalent (barretes, plàtans, dàtils). Comença al minut 30. Aigua amb sals: 500–750 ml/h.":"Aigua i prou.",tip:""});
    add({h:hh(dep+durH+0.5),t:"Recuperació (primera hora)",c:post,p:pp,food:n.k==="long"||n.k==="key"?"Iogurt grec amb civada, mel i fruita, o entrepà de pernil amb un suc":"Iogurt grec amb fruita, o un got de llet amb cacau"});
    Cleft=n.C-pre-dur-post-(morning?0:Math.round(n.C*0.18/5)*5);
    const rest=morning?[["din",14,0.45],["ber",17.5,0.15],["sop",21,0.40]]:[["din",13,0.5],["sop",21,0.5]];
    rest.forEach(([k,h,f],i)=>{const g=Math.max(20,Math.round(Cleft*f/5)*5);if(morning&&k==="din"&&dep+durH+0.5>12.5)h=Math.max(h,dep+durH+1.5);add({h:hh(h),t:{din:"Dinar",ber:"Berenar",sop:"Sopar"}[k],c:g,p:k==="ber"?Math.round(pp*0.6/5)*5:pp,food:pick(FOOD[k][lvlFor(g)],d,i+2),tip:k==="sop"&&(n.nk==="key"||n.nk==="long")?"Demà hi ha sessió dura: aquí carrega hidrats.":""})});
  } else {
    [["esm","8:00","Esmorzar",0.25],["din","13:30","Dinar",0.35],["ber","17:30","Berenar",0.10],["sop","21:00","Sopar",0.30]].forEach(([k,h,t,f],i)=>{const g=Math.max(15,Math.round(n.C*f/5)*5);add({h,t,c:g,p:k==="ber"?Math.round(pp*0.6/5)*5:pp,food:pick(FOOD[k][lvlFor(g+(k==="sop"&&(n.nk==="key"||n.nk==="long")?40:0))],d,i),tip:k==="sop"&&(n.nk==="key"||n.nk==="long")?"Demà hi ha sessió dura: aquí carrega hidrats.":""})});
  }
  const g=n.L.find(x=>x.type==="gym");
  if(g)M.push({h:"",t:"Gimnàs",c:0,p:0,food:"Si el fas lluny d'un àpat, pren 25–30 g de proteïna en acabar (iogurt grec, llet o un batut).",tip:""});
  return M;
}
const DK={rest:"Descans",easy:"Dia suau",key:"Sessió clau",long:"Fons llarg"};
function weekLabelNut(ws){const days=[];for(let i=0;i<7;i++)days.push(addDays(ws,i));const nm=days.map(dayKind);const keys=nm.filter(x=>x==="key"||x==="long").length;const test=all().some(s=>s.cat==="test"&&s.d>=ws&&s.d<=addDays(ws,6));return test?"Setmana de descàrrega i test: menys volum, així que menys hidrats els dies suaus; el dia abans i el del test, carrega.":keys>=2?"Setmana de càrrega: menja bé els dies durs (no són dies de fer dieta) i aprofita els suaus per al dèficit.":"Setmana tranquil·la: és la millor per baixar de pes, sempre amb proteïna alta."}
function renderNut(){
  const el=document.getElementById("nutBody");if(!el)return;
  const ws=mondayOf(todayStr);
  if(!nutDay||nutDay<todayStr&&nutDay<ws)nutDay=todayStr;
  const n=dayNut(nutDay),M=mealsFor(n),kg=curWeight();
  let h='<section class="card"><div class="in" style="gap:10px"><div class="kicker">Setmana</div><div class="nweek">';
  for(let i=0;i<7;i++){const d=addDays(ws,i),k=dayKind(d);h+='<button type="button" class="nwd'+(d===nutDay?" on":"")+' k-'+k+'" data-nday="'+d+'"><small>'+DAYS[parseD(d).getDay()]+'</small><b>'+parseD(d).getDate()+'</b><i></i></button>'}
  h+='</div><div class="note">'+esc(weekLabelNut(ws))+'</div></div></section>';
  const s=n.L.find(x=>x.type!=="gym"&&x.type!=="rest");
  h+='<section class="card"><div class="in" style="gap:12px"><div><div class="kicker">'+esc(nutDay===todayStr?"Avui":dayLabel(nutDay))+' · '+DK[n.k]+'</div><h3 style="margin-top:6px">'+(s?esc(s.t):"Sense sessió de bici")+'</h3></div>'+
    '<div class="stats">'+[["Kcal",n.kcal],["Hidrats",n.C+" g"],["Proteïna",n.P+" g"],["Greix",n.F+" g"]].map(x=>'<div class="stat"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join("")+'</div>'+
    '<div class="note">Despesa estimada '+n.tdee+' kcal (entrenament ≈ '+n.ex+'). '+(n.goalLoss?(n.tdee-n.kcal>0?"Dèficit de "+(n.tdee-n.kcal)+" kcal per anar baixant cap als 70 kg.":"Avui sense dèficit: és un dia dur."):"Ja ets al pes: mantenir.")+' Hidrats '+(Math.round(n.C/kg*10)/10).toString().replace(".",",")+' g/kg.</div></div></section>';
  h+='<section class="card"><div class="in" style="gap:4px"><div class="kicker" style="margin-bottom:8px">Àpats</div>'+M.map(m=>'<div class="meal"><div class="mh"><span class="mt">'+esc(m.h)+'</span><b>'+esc(m.t)+'</b>'+(m.c||m.p?'<span class="mm">'+(m.c?m.c+" g H":"")+(m.c&&m.p?" · ":"")+(m.p?m.p+" g P":"")+'</span>':'')+'</div><div class="mf">'+esc(m.food)+'</div>'+(m.tip?'<div class="note">'+esc(m.tip)+'</div>':'')+'</div>').join("")+'</div></section>';
  h+='<section class="card"><div class="in" style="gap:10px"><div class="kicker">Claus</div><ul class="checks">'+[
    "Proteïna a cada àpat: ~"+Math.round(kg*0.4)+" g (un palmell de carn o peix, 3 ous o un iogurt grec gran). És el que protegeix el múscul mentre baixes de pes.",
    "Els hidrats segueixen l'entrenament: molts els dies durs, pocs els de descans. El dèficit es fa els dies suaus, mai abans ni durant les sessions clau.",
    "Verdura o fruita a cada àpat principal. Aigua: 2–2,5 l al dia, més els dies d'entreno.",
    "Cafè: 1–2 cafès (≈ 3 mg/kg) 45–60′ abans de les sèries o del test ajuden. No a la tarda si dorms malament.",
    "Si tens gana de veritat, menja. Baixar 0,3–0,5 kg per setmana és el ritme bo: més ràpid et buida les cames."
  ].map(t=>'<li><span class="m info">·</span><span>'+esc(t)+'</span></li>').join("")+'</ul>'+
  '<div class="row2"><div class="field" style="flex:1"><label for="hcm">Alçada (cm)</label><input id="hcm" type="number" inputmode="numeric" min="140" max="210" value="'+(state.height||"")+'" placeholder="178"></div><button class="btn ghost" type="button" id="hSave">Desa</button></div>'+
  '<div class="note">'+(state.height?"":"Posa la teva alçada perquè les calories siguin exactes. ")+'Calculat per a '+String(kg).replace(".",",")+' kg i sortida a les '+(state.depHour==null?10:state.depHour)+':00 (ho canvies a El temps, a Avui). Orientatiu.</div></div></section>';
  el.innerHTML=h;
}
function nutLinkHTML(){
  const n=dayNut(todayStr);
  return '<button type="button" class="gymlink nutlink" data-page="nutricio"><span>Nutrició</span><b>Avui: '+n.kcal+' kcal · '+n.C+' g d\'hidrats · '+n.P+' g de proteïna</b><i>Obre →</i></button>';
}

/* ---------- Progress sync ---------- */
function syncDone(){
  all().forEach(s=>{const r=runFor(s);if(r&&!(s.done&&s.done.activityId===String(r.id)))setOv(s.id,{done:{by:"strava",activityId:String(r.id),name:r.name||"Cursa",movingMin:Math.round((r.moving_time||0)/60),km:Math.round((r.distance||0)/100)/10,at:new Date().toISOString()}})});
  all().forEach(s=>{if(s.type==="gym"&&active(s)&&!s.done&&gymActs[s.d]){setOv(s.id,{done:{by:"strava",name:gymActs[s.d].name||"Gimnàs",movingMin:Math.round((gymActs[s.d].moving_time||0)/60),at:new Date().toISOString()}})}});
  all().forEach(s=>{
    const act=actFor(s);if(!act)return;const d=data[act.id];if(!d||d.error||loading[act.id])return;
    const a=analyze(s,act,d),id=String(act.id);
    if(s.done&&s.done.activityId===id&&s.done.level===a.level&&s.done.ftp===ftp())return;
    setOv(s.id,{done:{by:"strava",activityId:id,level:a.level,ftp:ftp(),name:act.name||"",movingMin:Math.round((act.moving_time||0)/60),avgWatts:act.average_watts?Math.round(act.average_watts):null,checks:a.checks.map(c=>c.l+": "+c.t).slice(0,8),at:new Date().toISOString()}});
  });
}

/* ---------- Strava ---------- */
const API="https://www.strava.com/api/v3";
function redirectUri(){return location.origin+location.pathname}
function startAuth(write){
  const ci=document.getElementById("cid"),cs=document.getElementById("csec");
  const cid=(ci?ci.value:strava.clientId||"").trim(),sec=(cs?cs.value:strava.clientSecret||"").trim();
  if(!/^\d+$/.test(cid)){toast("El Client ID són només números. Copia'l de strava.com/settings/api.");return}
  if(sec.length<20){toast("El Client Secret sembla incomplet. Toca «Show» a Strava i copia'l sencer.");return}
  strava.clientId=cid;strava.clientSecret=sec;saveStrava();
  const u="https://www.strava.com/oauth/authorize?client_id="+encodeURIComponent(cid)+"&response_type=code&approval_prompt=auto&scope="+encodeURIComponent(write?"read,activity:read_all,activity:write":"read,activity:read_all")+"&redirect_uri="+encodeURIComponent(redirectUri());
  location.href=u;
}
function tokenRequest(params){
  const body=new URLSearchParams(Object.assign({client_id:strava.clientId,client_secret:strava.clientSecret},params));
  return fetch("https://www.strava.com/oauth/token",{method:"POST",body}).then(r=>r.json().catch(()=>({})).then(j=>{if(!r.ok)throw {code:r.status,msg:(j&&j.message)||""};return j}));
}
function handleAuthReturn(){
  const q=new URLSearchParams(location.search);
  const code=q.get("code"),err=q.get("error");if(q.get("scope"))strava.scope=q.get("scope");
  if(!code&&!err)return Promise.resolve();
  history.replaceState(null,"",location.pathname);
  if(err){toast("No s'ha donat permís a Strava. Torna-ho a provar i accepta l'accés.");return Promise.resolve()}
  if(!strava.clientId||!strava.clientSecret){toast("Falten el Client ID i el Client Secret en aquest navegador. Torna-los a escriure.");return Promise.resolve()}
  stravaMsg="Connectant amb Strava…";renderStatus();
  return tokenRequest({code,grant_type:"authorization_code"}).then(j=>{
    strava.accessToken=j.access_token;strava.refreshToken=j.refresh_token;strava.expiresAt=j.expires_at;
    strava.athlete=j.athlete?[j.athlete.firstname,j.athlete.lastname].filter(Boolean).join(" "):"";if(q.get("scope"))strava.scope=q.get("scope");
    saveStrava();toast("Strava connectat ✓");
  }).catch(e=>{
    stravaState="err";
    stravaMsg=e&&e.code===400?"Strava ha rebutjat la connexió. Revisa que el Client Secret sigui correcte i torna-ho a provar.":"No s'ha pogut completar la connexió amb Strava. Torna-ho a provar.";
  });
}
function ensureToken(force){
  if(!strava.refreshToken)return Promise.reject({code:"no_auth"});
  if(!force&&strava.accessToken&&strava.expiresAt&&strava.expiresAt-120>Date.now()/1000)return Promise.resolve(strava.accessToken);
  return tokenRequest({grant_type:"refresh_token",refresh_token:strava.refreshToken}).then(j=>{
    strava.accessToken=j.access_token;strava.refreshToken=j.refresh_token||strava.refreshToken;strava.expiresAt=j.expires_at;saveStrava();return strava.accessToken;
  }).catch(e=>{if(e&&(e.code===400||e.code===401))throw {code:"reauth"};throw {code:"net"}});
}
function api(path,retried){
  return ensureToken(false).then(tok=>fetch(API+path,{headers:{Authorization:"Bearer "+tok}})).then(r=>{
    if(r.status===401&&!retried){strava.accessToken=null;return ensureToken(true).then(()=>api(path,true))}
    if(r.status===401)throw {code:"reauth"};
    if(r.status===429)throw {code:"rate"};
    if(!r.ok)throw {code:"http",status:r.status};
    return r.json();
  },e=>{if(e&&e.code)throw e;throw {code:"net"}});
}
function errMsg(e){
  switch(e&&e.code){
    case "no_auth":return "Strava encara no està connectat.";
    case "reauth":return "Cal tornar a connectar Strava. Obre «Connexió amb Strava», desconnecta i torna-ho a fer.";
    case "rate":return "Strava limita les consultes. Ho tornaré a provar d'aquí 15 minuts.";
    case "net":return "Sense connexió amb Strava. Mostro el que ja tenia.";
    default:return "Strava ha donat un error"+(e&&e.status?" ("+e.status+")":"")+". Toca «Actualitza» per tornar-ho a provar.";
  }
}
function planRange(){const ds=all().map(s=>s.d).concat([START,todayStr]).sort();return [ds[0],ds[ds.length-1]>todayStr?ds[ds.length-1]:todayStr]}
function normAct(a){return {id:String(a.id),name:a.name,sport_type:a.sport_type||a.type,start_local:a.start_date_local,moving_time:a.moving_time,distance:a.distance,average_watts:a.average_watts,device_watts:a.device_watts,average_cadence:a.average_cadence,kilojoules:a.kilojoules,max_watts:a.max_watts,weighted_average_watts:a.weighted_average_watts,pr_count:a.pr_count,achievement_count:a.achievement_count,total_elevation_gain:a.total_elevation_gain,athlete_count:a.athlete_count}}
function indexActs(list){
  const next={};
  list.forEach(a=>{
    if(!a||!a.start_local||!/Ride|Cycl|Bike/i.test(String(a.sport_type||"")))return;
    const day=a.start_local.slice(0,10),cur=next[day];
    if(!cur||(a.moving_time||0)>(cur.moving_time||0))next[day]=a;
  });
  return next;
}
let busy=false;
function loadActivities(){
  if(!strava.refreshToken||busy)return;
  busy=true;lastLoad=Date.now();
  if(stravaState!=="on"){stravaState="loading";stravaMsg="Llegint les teves activitats de Strava…";renderStatus()}
  const r=planRange(),from=addDays(todayStr,-120)<r[0]?addDays(todayStr,-120):r[0];
  const after=Math.floor(parseD(from).getTime()/1000)-86400,before=Math.floor(parseD(r[1]).getTime()/1000)+2*86400;
  api("/athlete/activities?after="+after+"&before="+before+"&per_page=200")
  .then(list=>{
    const norm=(Array.isArray(list)?list:[]).map(normAct);
    lsSet("qw.acts",norm);allList=norm;
    const next=indexActs(norm);
    if(seenActs){const nw=norm.filter(a=>(/Ride|Cycl|Bike/i.test(String(a.sport_type||""))||isRun(a))&&a.start_local&&a.start_local.slice(0,10)>=addDays(todayStr,-1)&&!seenActs.has(a.id));if(nw.length)toast("Nova activitat de Strava: «"+(nw[0].name||"sortida")+"». L'estic analitzant.")}
    seenActs=new Set(norm.map(a=>a.id));
    acts=next;runActs=indexRuns(norm);gymActs={};norm.forEach(a=>{if(a.start_local&&/WeightTraining|Workout|Crossfit|Yoga|Pilates/i.test(String(a.sport_type||"")))gymActs[a.start_local.slice(0,10)]=a});stravaState="on";
    const t=new Date();stravaMsg="Strava connectat · "+String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");
    syncDone();render();analyzeAll();curveQueue();loadWeather();
  })
  .catch(e=>{stravaState=e&&e.code==="net"&&Object.keys(acts).length?"on":"err";stravaMsg=errMsg(e);render()})
  .then(()=>{busy=false});
}
const STREAM_CACHE="qw-streams-v1";
function getStreams(id){
  const key="/streams/"+id;
  const fromNet=()=>api("/activities/"+id+"/streams?keys=time,watts,cadence&key_by_type=true").then(j=>{
    try{if(window.caches)caches.open(STREAM_CACHE).then(c=>c.put(key,new Response(JSON.stringify(j),{headers:{"Content-Type":"application/json"}}))).catch(()=>{})}catch(e){}
    return j;
  });
  if(!window.caches)return fromNet();
  return caches.open(STREAM_CACHE).then(c=>c.match(key)).then(r=>r?r.json():fromNet()).catch(()=>fromNet());
}
let renderT=0;
function renderSoon(){clearTimeout(renderT);renderT=setTimeout(render,700)}
function loadDetail(id,quiet){
  loading[id]=true;
  return getStreams(id).then(st=>{
    const g=k=>st&&st[k]&&Array.isArray(st[k].data)?st[k].data:null;
    const time=g("time"),w=g("watts")?expand(time,g("watts")):[];
    const a=allList.find(x=>String(x.id)===String(id));if(a&&w.length)storeCurve(a,w);
    if(!quiet){data[id]={w,c:g("cadence")?expand(time,g("cadence")):[]};memo.clear()}
  }).catch(e=>{if(!quiet)data[id]={error:errMsg(e)}})
  .then(()=>{delete loading[id];if(quiet){renderSoon();return}syncDone();render()});
}
let chain=Promise.resolve();
function analyzeAll(){
  Object.keys(acts).sort().reverse().forEach(day=>{
    const a=acts[day];
    if(!all().some(s=>s.d===day&&active(s)))return;
    if(data[a.id]&&!data[a.id].error)return;
    if(loading[a.id])return;
    chain=chain.then(()=>loadDetail(a.id));
  });
}

/* ---------- Share summary ---------- */
function summaryText(){
  const L=["Resum del Quadern de Watts ("+dayLabel(todayStr)+")","FTP: "+ftp()+" W · Pla del "+(plan&&plan.updated||"?"),""];
  const ws=addDays(START,(weekNo(todayStr)-2)*7);
  all().filter(s=>s.d>=ws&&s.d<=addDays(todayStr,7)).forEach(s=>{
    let line=s.d+" · "+s.t;
    if(!active(s))line+=" — "+(s.status==="removed"?"ELIMINADA":"substituïda");
    else if(s.type==="rest")line+=" — descans";
    else{
      const act=actFor(s),d=act&&data[act.id];
      if(act&&d&&!d.error){const a=analyze(s,act,d);line+=" — "+VERDICT[a.level][1].toUpperCase()+" ("+fmtDur(act.moving_time||0)+(act.average_watts?", "+Math.round(act.average_watts)+" W":"")+")";
        a.checks.forEach(c=>{line+="\n   "+MARK[c.l]+" "+c.t});
        a.tables.forEach(t=>{if(t.rows.length)line+="\n   "+t.spec.label+": "+t.rows.map(r=>r.w+" W/"+(r.cad!=null?r.cad:"–")+" rpm").join(" · ")});
      }
      else if(s.done)line+=" — feta (marcada a mà)";
      else if(s.d<todayStr)line+=" — NO FETA";
      else line+=" — pendent";
    }
    if(s.movedFrom)line+="\n   (reprogramada des del "+s.movedFrom+")";
    if((s.k||1)!==1)line+="\n   (intensitat ajustada "+Math.round((s.k-1)*100)+" %)";
    L.push(line);
  });
  if(state.log.length){L.push("","Canvis recents:");state.log.slice(-6).forEach(e=>L.push("- "+e.txt))}
  L.push("","Com m'he trobat: ");
  return L.join("\n");
}
function shareSummary(){
  const text=summaryText();
  if(navigator.share){navigator.share({title:"Quadern de Watts",text}).catch(()=>{});return}
  copyText(text,"Resum copiat. Enganxa'l al xat amb Claude.");
}
function copyText(text,okMsg){
  const fallback=()=>{const ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch(e){}document.body.removeChild(ta);toast(ok?okMsg:"No s'ha pogut copiar. Torna-ho a provar.")};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>toast(okMsg),fallback);else fallback();
}

/* ---------- Wahoo (via intervals.icu) ---------- */
let icu=lsGet("qw.icu",{key:"",last:null,lastHash:"",err:""});
function saveIcu(){lsSet("qw.icu",icu)}
function durTxt(sec){sec=Math.round(sec);if(sec<60)return sec+"s";const m=Math.floor(sec/60),r=sec%60;return r?m+"m"+r+"s":m+"m"}
function pctTxt(lo,hi,k){const a=Math.round(lo*k*100);if(hi==null)return a+"%";const b=Math.round(hi*k*100);return a===b?a+"%":a+"-"+b+"%"}
function cadTxt(c){return c?" "+c[0]+"-"+c[1]+"rpm":""}
function workoutText(p){
  const k=p.k||1,L=[];
  if(p.type==="rec"){L.push("- "+durTxt(p.min*60)+" "+pctTxt(.45,.55,k)+cadTxt(p.cad||[88,92]));return L.join("\n")}
  const total=(p.maxMin?(p.min+p.maxMin)/2:p.min)*60;
  if(!p.ints||!p.ints.length){
    const b=p.band||[.56,.75];
    L.push("Escalfament","- 10m ramp "+pctTxt(.45,b[0]+.05,k)+cadTxt(p.cad),"","Principal","- "+durTxt(Math.max(5*60,total-20*60))+" "+pctTxt(b[0]+.04,b[1]-.02,k)+cadTxt(p.cad),"","Calma","- 10m "+pctTxt(.45,.55,k));
    return L.join("\n");
  }
  const warm=p.type==="long"||(p.maxMin&&p.maxMin>=150)?20:15;
  L.push("Escalfament","- "+warm+"m ramp "+pctTxt(.5,.7,k)+cadTxt(p.cad),"");
  let body=0;
  p.ints.forEach((sp,i)=>{
    const rec=sp.s<=30?170:sp.s>=1200?480:sp.s>=720?360:sp.s>=600?300:240;
    if(i>0){L.push("Transició","- 10m "+pctTxt(.6,.7,k),"");body+=600}
    L.push(sp.label||"Intervals",sp.n+"x","- "+durTxt(sp.s)+" "+(sp.hi==null?pctTxt(sp.lo,null,k):pctTxt(sp.lo,sp.hi,k))+cadTxt(sp.cad),"- "+durTxt(rec)+" "+pctTxt(.55,.6,k)+" 90rpm","");
    body+=sp.n*(sp.s+rec);
  });
  const rest=total-warm*60-body-600;
  if(rest>=300){const b=p.band||[.61,.73],fill=["Fons","- "+durTxt(Math.round(rest/60)*60)+" "+pctTxt(Math.max(.6,b[0]),Math.min(.73,b[1]),k)+" 85-90rpm",""];
    if(p.type==="long"){const at=L.indexOf("",L.indexOf("Escalfament"))+1;L.splice(at,0,...fill)}else L.push(...fill)}
  L.push("Calma","- 10m "+pctTxt(.45,.55,k));
  return L.join("\n");
}
function icuEvents(){
  const from=todayStr,to=addDays(todayStr,13),ev=[];
  all().filter(s=>s.d>=from&&s.d<=to&&s.type!=="rest").forEach(s=>{
    const live=active(s)&&!s.done&&!actFor(s);
    if(!live&&!(active(s)===false))return; // done sessions are left as they are
    if(s.type==="run"){if(active(s))ev.push({category:"NOTE",start_date_local:s.d+"T00:00:00",name:"Córrer: "+s.t,description:steps(s).map(x=>x.l+": "+x.x).join("\n"),external_id:"qw-"+s.id});return}
    if(s.type==="gym"){if(active(s))ev.push({category:"NOTE",start_date_local:s.d+"T00:00:00",name:"Gimnàs: "+s.t,description:steps(s).map(x=>x.l+": "+x.x).join("\n"),external_id:"qw-"+s.id});return}
    ev.push(live?{category:"WORKOUT",type:"Ride",start_date_local:s.d+"T00:00:00",name:s.t+(s.key?" ★":""),description:workoutText(s),external_id:"qw-"+s.id}
               :{category:"NOTE",start_date_local:s.d+"T00:00:00",name:"Cancel·lada: "+s.t,description:"Sessió treta del pla al Quadern de Watts.",external_id:"qw-"+s.id});
  });
  return ev;
}
function icuHash(ev){return JSON.stringify(ev.map(e=>[e.external_id,e.category,e.start_date_local,e.description]))+"|"+ftp()}
let icuBusy=false,icuTimer=0;
function icuPush(manual){
  if(!icu.key||icuBusy)return Promise.resolve();
  const ev=icuEvents(),h=icuHash(ev);
  if(!manual&&h===icu.lastHash)return Promise.resolve();
  if(!ev.length){if(manual)toast("No hi ha sessions pendents en els propers 14 dies.");return Promise.resolve()}
  icuBusy=true;renderWahoo();
  return fetch("https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Basic "+btoa("API_KEY:"+icu.key)},body:JSON.stringify(ev)})
  .then(r=>r.text().then(t=>{if(!r.ok)throw {status:r.status,body:t.slice(0,200)};return t}))
  .then(()=>{icu.last=new Date().toISOString();icu.lastHash=h;icu.err="";saveIcu();if(manual)toast("Enviat a intervals.icu ✓ Wahoo el rebrà en sincronitzar.")})
  .catch(e=>{icu.err=e&&e.status?(e.status===401||e.status===403?"intervals.icu no accepta la clau. Revisa-la (Settings → Developer Settings).":"intervals.icu ha donat un error ("+e.status+")."):"No s'ha pogut connectar amb intervals.icu des de l'app. Fes servir «Copia per a intervals.icu» a cada sessió.";saveIcu();if(manual)toast(icu.err)})
  .then(()=>{icuBusy=false;renderWahoo()});
}
function icuSchedule(){if(!icu.key)return;clearTimeout(icuTimer);icuTimer=setTimeout(()=>icuPush(false),2500)}
function renderWahoo(){
  const el=document.getElementById("wahoo");if(!el)return;
  if(!icu.key){
    el.innerHTML='<div class="in setup"><div><div class="kicker">Wahoo</div><h3 style="margin-top:6px">Envia els entrenaments al Wahoo</h3></div>'+
      '<div class="note">Les sessions passen per intervals.icu, i d\'allà a la teva app de Wahoo («My plan») i a l\'ELEMNT o el KICKR. Enganxa la teva API key d\'intervals.icu (Settings → Developer Settings). Es queda només en aquest mòbil.</div>'+
      '<div class="field"><label for="icuKey">API key d\'intervals.icu</label><input id="icuKey" autocomplete="off" autocapitalize="off" spellcheck="false"></div>'+
      '<div class="actions"><button class="btn primary" type="button" id="icuSave">Connecta i envia</button></div></div>';
    return;
  }
  const last=icu.last?new Date(icu.last):null;
  el.innerHTML='<div class="in" style="gap:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3>Wahoo</h3><span class="note">via intervals.icu</span></div>'+
    '<div class="note">'+(icuBusy?"Enviant…":icu.err?'<span style="color:var(--bad)">'+esc(icu.err)+'</span>':last?"Últim enviament: "+last.getDate()+" "+MONTHS[last.getMonth()]+" a les "+String(last.getHours()).padStart(2,"0")+":"+String(last.getMinutes()).padStart(2,"0")+". Els canvis del pla s'envien sols.":"Encara no s'ha enviat res.")+'</div>'+
    '<div class="actions"><button class="btn primary" type="button" id="icuPush"'+(icuBusy?" disabled":"")+'>Envia els propers 14 dies</button><button class="btn ghost" type="button" id="icuForget">Treu la clau</button></div></div>';
}

/* ---------- Events ---------- */
document.getElementById("ftp").addEventListener("change",e=>{
  const v=parseInt(e.target.value,10);
  if(!(v>=100&&v<=500)){e.target.value=ftp();return}
  if(v===ftp())return;
  const old=ftp();state.ftp=v;saveState();addLog("FTP canviat de "+old+" W a "+v+" W.");memo.clear();syncDone();render();
});
document.getElementById("refresh").addEventListener("click",()=>{loadPlan();loadActivities();checkAppUpdate()});
document.getElementById("share").addEventListener("click",shareSummary);
document.addEventListener("click",e=>{
  const el=e.target.closest("button");if(!el)return;
  if(el.dataset&&el.dataset.title){const ra=recentAct();if(canWrite()&&ra)setStravaTitle(ra.id,el.dataset.title);else copyText(el.dataset.title,"Copiat. Ara enganxa'l com a títol a Strava.");return}
  if(el.dataset&&el.dataset.page){setPage(el.dataset.page);return}
  if(el.dataset&&el.dataset.gok){const [pid,i,j]=el.dataset.gok.split("|");const r=gymSet(pid,+i,+j);const row=el.closest(".gset");if(row){row.querySelectorAll("input").forEach(inp=>{const f=inp.dataset.gk.split("|")[3];if(r[f]==null&&inp.value==="")r[f]=inp.placeholder&&!isNaN(+inp.placeholder)?+inp.placeholder:null;else if(inp.value!=="")r[f]=+inp.value})}r.ok=!r.ok;saveState();renderWeek();renderPage();return}
  if(el.dataset&&el.dataset.gadd){const [pid,i]=el.dataset.gadd.split("|");const p=S[pid];const cur=((state.gymSets||{})[pid]||{})[+i]||[];gymSet(pid,+i,Math.max(cur.length,(p.ex[+i].sets||3)));saveState();renderWeek();renderPage();return}
  if(el.dataset&&el.dataset.gsave){gymSave(el.dataset.gsave);return}
  if(el.dataset&&el.dataset.gsel){gymSel=el.dataset.gsel;renderGym();return}
  if(el.dataset&&el.dataset.nday){nutDay=el.dataset.nday;renderNut();return}
  if(el.id==="hSave"){const v=parseInt(document.getElementById("hcm").value,10);if(!(v>=140&&v<=210)){toast("Escriu l'alçada en cm, per exemple 178.");return}state.height=v;saveState();toast("Alçada desada.");renderNut();renderFood();return}
  if(el.dataset&&el.dataset.gopen){gymSel=el.dataset.gopen;setPage("gimnas");return}
  if(el.dataset&&el.dataset.noteok){const fresh=allNotes().filter(n=>n.date>=addDays(todayStr,-2));state.notesRead=(state.notesRead||[]).concat(fresh.map(noteKey)).slice(-80);saveState();renderCoachNotes();return}
  if(el.dataset&&el.dataset.ck){const [id,k,v]=el.dataset.ck.split("|");ckDraft[id]=ckDraft[id]||{};ckDraft[id][k]=+v;const inp=document.querySelector('[data-cknote="'+id+'"]');if(inp)ckDraft[id].note=inp.value;renderWeek();return}
  if(el.dataset&&el.dataset.cksave){saveCheckin(el.dataset.cksave);return}
  if(el.dataset&&el.dataset.ckedit){ckEdit=el.dataset.ckedit;renderWeek();return}
  if(el.dataset&&el.dataset.ckcancel){ckEdit=null;delete ckDraft[el.dataset.ckcancel];renderWeek();return}
  if(el.dataset&&el.dataset.chg){chg=el.dataset.chg;renderWeek();return}
  if(el.dataset&&el.dataset.chgcancel){chg=null;renderWeek();return}
  if(el.dataset&&el.dataset.adj){const [id,kind]=el.dataset.adj.split("|");applyAdj(id,kind);return}
  if(el.dataset&&el.dataset.undoadj){undoAdj(el.dataset.undoadj);return}
  if(el.dataset&&el.dataset.dep){state.depHour=Math.max(5,Math.min(20,(state.depHour==null?10:state.depHour)+(+el.dataset.dep)));saveState();renderWeather();return}
  if(el.dataset&&el.dataset.setftp){const v=+el.dataset.setftp,old=ftp();state.ftp=v;state.ftpTests=(state.ftpTests||[]).concat([{d:todayStr,ftp:v,old}]);saveState();addLog("FTP del test: de "+old+" W a "+v+" W.");memo.clear();queueSync();toast("FTP actualitzat a "+v+" W.");render();return}
  if(el.id==="wSave"||el.id==="wSave2"){const v=parseFloat(String(document.getElementById(el.id==="wSave"?"wkg":"wkg2").value).replace(",","."));if(!(v>=40&&v<=150)){toast("Escriu el pes en kg, per exemple 74,6.");return}state.weights=(state.weights||[]).filter(x=>x.d!==todayStr).concat([{d:todayStr,kg:Math.round(v*10)/10}]);saveState();applyWeight();queueSync();toast("Pes desat.");render();return}
  if(el.id==="syncSave"){const t=(document.getElementById("syncTok").value||"").trim(),r=(document.getElementById("syncRepo").value||"").trim();if(t.length<20){toast("El token sembla incomplet.");return}if(!/^[\w.-]+\/[\w.-]+$/.test(r)){toast("El repositori ha de ser usuari/nom.");return}sync.token=t;sync.repo=r;sync.err="";saveSync();renderSettings();pushInbox().then(()=>toast(sync.err||"Connectat amb el coach ✓"));return}
  if(el.id==="syncNow"){pushInbox().then(()=>toast(sync.err||"Enviat ✓"));renderSettings();return}
  if(el.id==="syncForget"){sync={token:"",repo:sync.repo,last:null,err:""};saveSync();renderSettings();return}
  if(el.id==="stravaWriteBtn"){startAuth(true);return}
  if(el.dataset&&el.dataset.tmore){titleOff[el.dataset.tmore]=(titleOff[el.dataset.tmore]||0)+1;renderTitles();return}
  if(el.id==="openNotes"){openNotes();return}
  if(el.id==="wkPrev"||el.id==="wkNext"){weekSel=(weekSel||1)+(el.id==="wkNext"?1:-1);selId=null;renderWeek();return}
  if(el.id==="icuSave"){const k=(document.getElementById("icuKey").value||"").trim();if(k.length<10){toast("La clau sembla incompleta. Copia-la sencera.");return}icu.key=k;icu.lastHash="";icu.err="";saveIcu();renderWahoo();icuPush(true);return}
  if(el.id==="icuPush"){icuPush(true);return}
  if(el.id==="icuForget"){icu={key:"",last:null,lastHash:"",err:""};saveIcu();renderWahoo();return}
  if(el.dataset&&el.dataset.copywo){const s0=S[el.dataset.copywo];if(s0)copyText(workoutText(s0),"Copiat. A intervals.icu: calendari → dia → Add Workout → enganxa-ho a la descripció.");return}
  if(el.id==="connect"){startAuth();return}
  if(el.id==="importBtn"){
    try{const raw=(document.getElementById("importKey").value||"").trim();const j=JSON.parse(decodeURIComponent(escape(atob(raw))));
      if(!j.c||!j.s||!j.r)throw 0;strava={clientId:j.c,clientSecret:j.s,refreshToken:j.r,athlete:j.a||"",scope:j.sc||""};saveStrava();toast("Strava connectat ✓");render();loadActivities();
    }catch(err){toast("Aquesta clau no és vàlida. Copia-la sencera des de «Connexió amb Strava».")}
    return;
  }
  if(el.id==="exportBtn"){const k=btoa(unescape(encodeURIComponent(JSON.stringify({c:strava.clientId,s:strava.clientSecret,r:strava.refreshToken,a:strava.athlete||"",sc:strava.scope||""}))));copyText(k,"Clau copiada. Enganxa-la a l'altra app.");return}
  if(el.id==="disconnect"){strava={clientId:strava.clientId,clientSecret:strava.clientSecret};saveStrava();acts={};data={};stravaState="idle";stravaMsg="Strava desconnectat.";render();return}
  const ds=el.dataset;
  if(ds.week){weekSel=+ds.week;selId=null;renderWeek();return}
  if(ds.sel){selId=ds.sel;renderWeek();const t=document.getElementById("sel");if(t&&t.getBoundingClientRect().top>window.innerHeight*0.6)t.scrollIntoView({behavior:"smooth",block:"start"});return}
  if(ds.retry){delete data[ds.retry];loadDetail(ds.retry);return}
  if(ds.choose){chooser=ds.choose;renderDecide();return}
  if(ds.cancel){chooser=null;renderDecide();return}
  if(ds.move){
    const s=S[ds.move],to=ds.to;if(!s)return;
    const repl=sessionsOn(to).filter(x=>(x.type==="rest"||x.type==="rec")&&!x.done&&x.id!==s.id);
    const from=s.d;chooser=null;
    repl.forEach(x=>setOv(x.id,{status:"replaced",replacedBy:s.id}));
    setOv(s.id,{d:to,movedFrom:s.movedFrom||from});
    addLog("«"+s.t+"» reprogramada del "+dayLabel(from)+" al "+dayLabel(to)+(repl.length?", en lloc de «"+repl.map(x=>x.t).join(" + ")+"».":"."));
    toast("«"+s.t+"» passa al "+dayLabel(to)+".");chg=null;memo.clear();queueSync();render();return;
  }
  if(ds.remove){const s=S[ds.remove];if(!s)return;chooser=null;setOv(s.id,{status:"removed"});addLog("«"+s.t+"» del "+dayLabel(s.d)+" eliminada.");toast("Sessió eliminada. La pots recuperar des del pla.");queueSync();render();return}
  if(ds.restore){const s=S[ds.restore];if(!s)return;setOv(s.id,{status:"planned"});addLog("«"+s.t+"» del "+dayLabel(s.d)+" recuperada.");render();return}
  if(ds.done){const s=S[ds.done];if(!s)return;chooser=null;setOv(s.id,{done:{by:"manual",at:new Date().toISOString()}});addLog("«"+s.t+"» del "+dayLabel(s.d)+" marcada com a feta a mà.");toast("Marcada com a feta ✓");queueSync();render();return}
  if(ds.undone){const s=S[ds.undone];if(!s)return;setOv(s.id,{done:null});render();return}
  if(ds.apply||ds.dismiss){
    const s=S[ds.apply||ds.dismiss];if(!s)return;const act=actFor(s);const d=act&&data[act.id];
    if(ds.apply&&d&&!d.error){
      const sg=suggestFor(s,analyze(s,act,d));
      if(sg){const note="Ajustada "+(sg.f>0?"+":"")+Math.round(sg.f*100)+" % després de «"+s.t+"» del "+dayLabel(s.d)+".";setOv(sg.next.id,{k:sg.nk,adjNote:note});addLog(sg.txt);toast("Fet. «"+sg.next.t+"» ja té els watts nous.")}
    }
    setOv(s.id,{adjDone:ds.apply?"applied":"dismissed"});memo.clear();render();return;
  }
});
document.addEventListener("change",e=>{const t=e.target;if(t&&(t.id==="wDay"||t.id==="wHour")){if(t.id==="wDay")state.weighDay=+t.value;else state.weighHour=+t.value;saveState();const c=weighCfg();toast("Et recordaré de pesar-te cada "+DAYNAMES[c.day].toLowerCase()+" a les "+c.hour+":00.");renderAvuiExtras()}});
document.addEventListener("input",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.gk){const [pid,i,j,f]=t.dataset.gk.split("|");const r=gymSet(pid,+i,+j);r[f]=t.value===""?null:+t.value;saveState();return}if(t&&t.dataset&&t.dataset.cknote){const id=t.dataset.cknote;ckDraft[id]=ckDraft[id]||{};ckDraft[id].note=t.value}});
function tick(){
  const t=localDate(new Date());
  if(t!==todayStr){todayStr=t;weekSel=null;selId=null;render()}
  if(document.visibilityState==="visible"&&Date.now()-lastLoad>5*60*1000){loadActivities()}
}
setInterval(tick,60000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){const t=localDate(new Date());if(t!==todayStr){todayStr=t;weekSel=null;selId=null}render();if(Date.now()-lastLoad>60000){loadPlan();loadActivities()}}});

/* ---------- Boot ---------- */
if(plan){applyPlanMeta();S=buildSessions();planState="ready"}
const cached=lsGet("qw.acts",null);if(Array.isArray(cached)){allList=cached;acts=indexActs(cached);runActs=indexRuns(cached);if(strava.refreshToken){stravaState="on";stravaMsg="Carregant Strava…"}}
try{localStorage.removeItem("qw.coach")}catch(e){}
render();{const hsh=location.hash.slice(1);setPage(hsh==="notes"?"diari":hsh||"avui",true)}loadWeather();
handleAuthReturn().then(()=>{render();return loadPlan()}).then(()=>{if(strava.refreshToken)loadActivities()});
function checkAppUpdate(){
  if(!("serviceWorker" in navigator))return;
  navigator.serviceWorker.getRegistration().then(reg=>{if(reg)reg.update().catch(()=>{})}).catch(()=>{});
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkAppUpdate()});
if("serviceWorker" in navigator&&location.protocol==="https:"){
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(reg=>{reg.update().catch(()=>{})}).catch(()=>{});
  const hadCtrl=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!hadCtrl||reloaded)return;reloaded=true;location.reload()});
}
})();
