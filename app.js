(function(){
"use strict";
const APP_VERSION="1.4.0";
const DAYS=["Dg","Dl","Dt","Dc","Dj","Dv","Ds"];
const DAYNAMES=["Diumenge","Dilluns","Dimarts","Dimecres","Dijous","Divendres","Dissabte"];
const MONTHS=["gen","feb","març","abr","maig","juny","jul","ag","set","oct","nov","des"];
const CATNAMES={ss:"sweet spot",tempo:"tempo",force:"força-resistència"};
const ZONES=[["Z1 Recuperació","z1",0,.55],["Z2 Resistència","z2",.56,.75],["Z3 Tempo","z3",.76,.90],["Sweet spot","ss",.88,.94],["Z4 Llindar","z4",.91,1.05],["Z5 VO2màx","z5",1.06,1.20],["Z6 Anaeròbica","z5",1.21,1.50],["Z7 Neuromuscular","z7",1.51,null]];
const OVERLAY_KEYS=["d","status","k","adjNote","movedFrom","done","adjDone","replacedBy","type","z","t","min","maxMin","steps","ints","band","cad","cat","fuel","note","key","coachEdit"];

/* ---------- Storage ---------- */
function lsGet(k,def){try{const v=localStorage.getItem(k);return v==null?def:JSON.parse(v)}catch(e){return def}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
let plan=lsGet("qw.plan",null);
let state=lsGet("qw.state",{ftp:null,ov:{},log:[]});
if(!state.ov)state.ov={};if(!state.log)state.log=[];
let strava=lsGet("qw.strava",{});
function saveState(){lsSet("qw.state",state)}
function saveStrava(){lsSet("qw.strava",strava)}

let START="2026-10-19",WEIGHT=75,FTP0=240,GOAL=280;
let S={};
let planState="loading",planMsg="";
let stravaState="idle",stravaMsg="";
let acts={},data={},loading={},seenActs=null,lastLoad=0;
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
function actFor(s){const a=acts[s.d];if(!a||!active(s))return null;if(s.type==="rest"&&sessionsOn(s.d).some(x=>x.type!=="rest"))return null;return a}
function isMissed(s){return active(s)&&s.type!=="rest"&&s.d<todayStr&&!s.done&&!actFor(s)&&stravaState==="on"}
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
  const a=plan.athlete||{};WEIGHT=a.weight||WEIGHT;FTP0=a.ftpStart||FTP0;GOAL=a.goalFtp||GOAL;
}
function setOv(id,patch){
  const cur=Object.assign({},state.ov[id]||{});
  Object.keys(patch).forEach(k=>{if(OVERLAY_KEYS.includes(k)){if(patch[k]==null)delete cur[k];else cur[k]=patch[k]}});
  state.ov[id]=cur;S[id]=Object.assign({},S[id],patch);saveState();
}
function addLog(txt){state.log=state.log.concat([{at:new Date().toISOString(),txt}]).slice(-60);saveState()}
function loadPlan(){
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
const RANK={ok:0,warn:1,bad:2};
const worst=(a,b)=>RANK[a]>=RANK[b]?a:b;
const memo=new Map();
function analyze(p,act,d){
  const key=act.id+"|"+ftp()+"|"+(p.k||1)+"|"+p.id+"|"+p.d;
  if(memo.has(key))return memo.get(key);
  const checks=[],tables=[];let level="ok";
  const k=p.k||1,F=ftp();
  const mov=act.moving_time||0;
  const w=d.w||[],c=d.c||[],hasW=act.device_watts!==false&&w.length>0;
  const pedalW=meanNZ(w),pedalC=c.length?meanNZ(c):(act.average_cadence||0);
  const add=(l,t)=>{checks.push({l,t});level=worst(level,l)};
  if(p.type==="rest"){add("warn","Avui tocava descans. Una sortida suau no passa res, però el descans també fa pujar l'FTP.")}
  else{
    const r=(mov/60)/p.min;
    if(r>=0.85&&(p.maxMin||r<=1.35))add("ok","Durada correcta: "+fmtDur(mov)+" de "+fmtPlanDur(p)+" previstos.");
    else if(r>1.35)add("warn","Has fet "+fmtDur(mov)+", força més del previst ("+fmtPlanDur(p)+"). Vigila no acumular fatiga.");
    else if(r>=0.65)add("warn","Una mica curt: "+fmtDur(mov)+" de "+fmtPlanDur(p)+" previstos.");
    else add("bad","Massa curt: "+fmtDur(mov)+" de "+fmtPlanDur(p)+" previstos.");
  }
  if(!hasW){add("warn","Aquesta activitat no té dades de potenciòmetre, així que no puc comprovar els watts.")}
  else if(p.type!=="rest"){
    const pct=pedalW/F;
    if((p.type==="end"||p.type==="long")&&p.band){
      const lo=p.band[0]*k,hi=p.band[1]*k;
      if(pct>=lo-0.04&&pct<=hi+0.03)add("ok","Intensitat de resistència ben controlada: "+Math.round(pedalW)+" W de mitjana pedalant ("+Math.round(pct*100)+" % FTP).");
      else if(pct>hi+0.03)add(pct>hi+0.10?"bad":"warn","Massa intens per ser Z2: "+Math.round(pedalW)+" W de mitjana ("+Math.round(pct*100)+" % FTP). L'objectiu era "+Math.round(lo*F)+"–"+Math.round(hi*F)+" W.");
      else add("warn","Una mica fluix: "+Math.round(pedalW)+" W de mitjana ("+Math.round(pct*100)+" % FTP). Apunta a "+Math.round((lo+0.05)*F)+"–"+Math.round(hi*F)+" W.");
      if(!p.ints||!p.ints.length){
        let above=0,ped=0;for(const v of w){if(v>0){ped++;if(v>0.90*F)above++}}
        const fr=ped?above/ped:0,lim=p.type==="long"?0.15:0.10;
        if(fr>lim)add("warn",Math.round(fr*100)+" % del temps pedalant per sobre de "+Math.round(0.9*F)+" W. En Z2 hauria de ser menys del "+Math.round(lim*100)+" %.");
      }
    } else if(p.type==="rec"){
      if(pct<=0.60)add("ok","Recuperació de veritat: "+Math.round(pedalW)+" W de mitjana ("+Math.round(pct*100)+" % FTP).");
      else if(pct<=0.68)add("warn","Una mica alt per ser recuperació: "+Math.round(pedalW)+" W. Mantén-te per sota de "+Math.round(0.55*F)+" W.");
      else add("bad","Això no ha estat una recuperació: "+Math.round(pedalW)+" W de mitjana ("+Math.round(pct*100)+" % FTP).");
    }
    (p.ints||[]).forEach(spec=>{
      const lo=spec.lo*k,hi=spec.hi==null?null:spec.hi*k;
      const win=bestWindows(w,c,spec.s,spec.n),rows=[];let okN=0,badN=0,missing=0;
      win.forEach((x,idx)=>{
        const q=x.avg/F;let s;
        if(hi==null)s=q>=lo?"ok":(q>=lo-0.2?"warn":"bad");
        else if(q>=lo-0.03&&q<=hi+0.03)s="ok";
        else if(q>hi+0.03)s="warn";
        else if(q>=lo-0.06)s="warn";
        else s="bad";
        if(hi!=null&&q<lo*0.8)missing++;
        let cs=null;if(spec.cad&&x.cad!=null)cs=(x.cad>=spec.cad[0]-5&&x.cad<=spec.cad[1]+5)?"ok":"warn";
        if(s==="ok")okN++;if(s==="bad")badN++;
        rows.push({i:idx+1,start:x.start,len:spec.s,w:Math.round(x.avg),pct:Math.round(q*100),cad:x.cad!=null?Math.round(x.cad):null,s,cs});
      });
      for(let j=win.length;j<spec.n;j++){badN++;missing++}
      const tgt=hi==null?"més de "+Math.round(lo*F)+" W":Math.round(lo*F)+"–"+Math.round(hi*F)+" W";
      if(missing>=spec.n)add("bad","No es detecten els blocs de "+spec.label+" ("+spec.n+" × a "+tgt+").");
      else if(okN===spec.n)add("ok","Tots els blocs de "+spec.label+" dins l'objectiu ("+tgt+").");
      else if(badN===0)add("warn",okN+" de "+spec.n+" blocs de "+spec.label+" exactes. Mira la taula per veure quins se t'han escapat.");
      else add("bad","Només "+okN+" de "+spec.n+" blocs de "+spec.label+" a l'objectiu ("+tgt+").");
      if(spec.cad){const cb=rows.filter(r=>r.cs==="warn").length;if(cb)add("warn","Cadència fora de "+spec.cad[0]+"–"+spec.cad[1]+" rpm en "+cb+" dels blocs de "+spec.label+".")}
      tables.push({spec,rows,tgt,lo,hi,hiPct:hi==null?null:hi*100,missing,badN,okN});
    });
  }
  if(p.cad&&pedalC){
    const cl=p.cad[0];
    if(pedalC>=cl-2)add("ok","Cadència mitjana de "+Math.round(pedalC)+" rpm. Objectiu complert.");
    else add("warn","Cadència mitjana de "+Math.round(pedalC)+" rpm. L'objectiu és "+p.cad[0]+"–"+p.cad[1]+" rpm"+(pedalC>=cl-7?": vas pel bon camí.":": treu un pinyó i fes girar més les cames."));
  }
  const stats=[["Temps",fmtDur(mov)],["Km",act.distance?(act.distance/1000).toFixed(1).replace(".",","):"—"],
    ["Watts",act.average_watts?Math.round(act.average_watts):(hasW?Math.round(pedalW):"—")],["Rpm",pedalC?Math.round(pedalC):"—"],["kJ",act.kilojoules?Math.round(act.kilojoules):"—"]];
  const res={level,checks,tables,stats,hasW};
  memo.set(key,res);
  return res;
}
function suggestFor(s,a){
  if(!a||s.adjDone||!s.cat||!CATNAMES[s.cat])return null;
  const t=a.tables.find(x=>x.hiPct!=null);if(!t||!t.rows.length)return null;
  const next=all().find(x=>x.d>s.d&&active(x)&&!x.done&&x.cat===s.cat);
  if(!next)return null;
  const mean=t.rows.reduce((m,r)=>m+r.pct,0)/t.rows.length;
  const allOk=t.okN===t.spec.n,overs=t.rows.filter(r=>r.pct>t.hiPct+3).length;
  let f=0,why="";
  if(allOk&&mean>=t.hiPct-1){f=0.02;why="Has fet tots els blocs a la part alta del rang ("+Math.round(mean)+" % FTP de mitjana)."}
  else if(t.badN===0&&overs>0){f=0.02;why="Has anat per sobre de l'objectiu en "+overs+" blocs sense que cap se t'escapés."}
  else if(a.level==="bad"&&(t.missing>0||t.badN>=2)){f=-0.03;why="No has pogut mantenir els watts en "+t.badN+" blocs."}
  if(!f)return null;
  const curK=next.k||1,nk=Math.round((curK+f)*1000)/1000;
  const ex=(next.ints&&next.ints[0])||null;
  const range=ex&&ex.hi!=null?" ("+W(ex.lo,nk)+"–"+W(ex.hi,nk)+" W en lloc de "+W(ex.lo,curK)+"–"+W(ex.hi,curK)+" W)":"";
  return {next,f,nk,why,txt:(f>0?"Puja un "+Math.round(f*100)+" %":"Baixa un "+Math.round(-f*100)+" %")+" la intensitat de «"+next.t+"» del "+dayLabel(next.d)+range+"."};
}
const VERDICT={ok:["✓","Entreno ben fet","Has complert la sessió tal com estava planificada."],warn:["!","Fet, amb matisos","La sessió està feta, però hi ha punts a ajustar."],bad:["✕","No s'ha complert","La sessió no s'ha fet com estava prevista."]};

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
    t.rows.forEach(r=>{wins+='<rect x="'+r.start+'" width="'+r.len+'" y="0" height="100" fill="var(--'+(r.s==="ok"?"ok":r.s==="warn"?"warn":"bad")+')" opacity=".18"/>'});
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
function resultHTML(p){
  const act=actFor(p),isPast=p.d<todayStr,isToday=p.d===todayStr;
  if(!active(p))return '<div class="actions" style="align-items:center"><span class="note" style="flex:1">'+(p.status==="removed"?"Has eliminat aquesta sessió del pla.":"Substituïda per una sessió reprogramada.")+'</span>'+(p.status==="removed"?'<button class="btn" type="button" data-restore="'+esc(p.id)+'">Recupera-la</button>':'')+'</div>';
  if(!act){
    if(p.done&&p.done.by==="manual")return '<div class="result"><div class="verdict ok"><span class="ic">✓</span><div>Marcada com a feta<small>No hi ha activitat a Strava, així que no puc analitzar-la.</small></div></div><div class="actions"><button class="btn ghost" type="button" data-undone="'+esc(p.id)+'">Desfés</button></div></div>';
    if(p.type==="rest")return "";
    let h="";
    if(stravaState==="on"&&isToday)h+='<div class="empty">Encara no hi ha cap activitat d\'avui a Strava. L\'app la detectarà sola quan el Wahoo la pugi.</div>';
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
  h+='<ul class="checks">'+a.checks.map(c=>'<li><span class="m '+c.l+'">'+(c.l==="ok"?"✓":c.l==="warn"?"!":"✕")+'</span><span>'+esc(c.t)+'</span></li>').join("")+'</ul>';
  a.tables.forEach(t=>{
    if(!t.rows.length)return;
    h+='<div class="tbl"><table><thead><tr><th>'+esc(t.spec.label)+'</th><th>Watts</th><th>% FTP</th><th>Rpm</th></tr></thead><tbody>';
    t.rows.forEach(r=>{h+='<tr><td>Bloc '+r.i+'</td><td class="s-'+r.s+'">'+r.w+'</td><td class="s-'+r.s+'">'+r.pct+'</td><td'+(r.cs?' class="s-'+r.cs+'"':'')+'>'+(r.cad!=null?r.cad:"—")+'</td></tr>'});
    h+='</tbody></table></div><div class="note">Objectiu: '+t.tgt+'. Són els '+t.spec.n+' millors blocs de '+(t.spec.s>=60?t.spec.s/60+"′":t.spec.s+"″")+' de l\'activitat.</div>';
  });
  const sg=suggestFor(p,a);
  if(sg)h+='<div class="suggest"><div class="kicker">Ajust suggerit</div><div>'+esc(sg.why)+' '+esc(sg.txt)+'</div><div class="actions"><button class="btn primary" type="button" data-apply="'+esc(p.id)+'">Aplica l\'ajust</button><button class="btn ghost" type="button" data-dismiss="'+esc(p.id)+'">Deixa-ho igual</button></div></div>';
  return h+"</div>";
}
function sessionCard(p,kick){
  if(p.type==="rest"&&active(p)){
    return '<article class="card feature"><div class="in"><div class="feature-head"><div class="kicker">'+kick+'</div><h2>'+esc(p.t)+'</h2></div>'+
      '<div class="restimg"><img src="media/mano.webp" alt="La bici recolzada al contenidor del Mano"><div class="cap">Avui les cames<br>es fan al sofà</div></div>'+stepsHTML(p)+resultHTML(p)+'</div></article>';
  }
  const kpct=(p.k||1)!==1?Math.round((p.k-1)*100):0;
  return '<article class="card feature" style="--zc:var(--'+esc(p.z)+')"><div class="zonebar"></div><div class="in">'+
    '<div class="feature-head"><div class="kicker">'+kick+(p.key?" · Sessió clau":"")+'</div><h2>'+esc(p.t)+'</h2>'+
    '<div class="meta"><span>Durada <b>'+fmtPlanDur(p)+'</b></span>'+(p.cad?'<span>Cadència <b>'+p.cad[0]+'–'+p.cad[1]+' rpm</b></span>':'')+(kpct?'<span>Intensitat <b>'+(kpct>0?"+":"")+kpct+' %</b></span>':'')+'</div></div>'+
    (active(p)?profileHTML(p):"")+stepsHTML(p)+resultHTML(p)+'</div></article>';
}
function renderCover(){
  const inp=document.getElementById("ftp");if(document.activeElement!==inp)inp.value=ftp();
  document.getElementById("wkg").textContent=(ftp()/WEIGHT).toFixed(2).replace(".",",");
  document.getElementById("goal").textContent=GOAL;
  const dt=new Date();document.getElementById("issue").textContent=DAYNAMES[dt.getDay()]+" "+dt.getDate()+" "+MONTHS[dt.getMonth()]+" · S"+Math.max(1,weekNo(todayStr));
}
function renderLadder(){
  const lo=Math.min(220,FTP0-20),hi=Math.max(300,GOAL+20),F=ftp(),pos=v=>((Math.min(hi,Math.max(lo,v))-lo)/(hi-lo)*100).toFixed(1)+"%";
  const mk=(v,cls,label,sub)=>'<div class="mk '+cls+'" style="bottom:'+pos(v)+'"><i></i><span><b>'+label+'</b><br><small>'+sub+'</small></span></div>';
  const prog=Math.max(0,Math.min(100,Math.round((F-FTP0)/(GOAL-FTP0)*100)));
  document.getElementById("ladder").innerHTML='<div class="fill" style="height:'+pos(F)+'"></div>'+
    mk(GOAL,"goal",GOAL,"Objectiu gener")+(Math.abs(F-FTP0)>=12?mk(FTP0,"",FTP0,"Referència"):"")+mk(F,"now",F,F===FTP0?"Referència":"Ara · "+prog+" % del camí"+(Math.abs(F-FTP0)<12&&F!==FTP0?" (inici "+FTP0+")":""));
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
function renderToday(){
  const el=document.getElementById("today");
  const dt=new Date(),label="Avui · "+DAYNAMES[dt.getDay()]+" "+dt.getDate()+" "+MONTHS[dt.getMonth()];
  if(planState==="loading"){el.innerHTML='<article class="card"><div class="in"><div class="kicker">'+label+'</div><div class="note">Carregant el pla…</div></div></article>';return}
  if(!Object.keys(S).length){el.innerHTML='<article class="card"><div class="in"><div class="kicker">'+label+'</div><h2>Encara no hi ha cap sessió</h2><div class="note">'+esc(planMsg||"Demana a Claude que prepari el pla.")+'</div></div></article>';return}
  const list=sessionsOn(todayStr);
  if(!list.length){
    const next=all().find(x=>x.d>todayStr&&active(x));
    el.innerHTML='<article class="card"><div class="in"><div class="kicker">'+label+'</div><h2>'+(next?"Avui no hi ha sessió":"Pla completat")+'</h2><div class="note">'+(next?"La propera és «"+esc(next.t)+"», el "+esc(dayLabel(next.d))+".":"Toca «Envia el resum a Claude» perquè prepari les setmanes següents.")+'</div></div></article>';
    return;
  }
  el.innerHTML=list.map(p=>sessionCard(p,label)).join("");
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
  if(!p||!active(p)||p.type==="rest")return 0;
  return profileSegs(p).reduce((m,x)=>m+x.min/60*x.pct*x.pct*100,0);
}
function ifZone(IF){return IF<.6?"z1":IF<.76?"z2":IF<.86?"z3":IF<.95?"ss":IF<1.05?"z4":"z5"}
function weekStats(ws,we){
  const inWeek=all().filter(s=>s.d>=ws&&s.d<=we&&active(s)&&s.type!=="rest");
  let planMin=0,doneMin=0,doneN=0;
  inWeek.forEach(s=>{const pm=s.maxMin?(s.min+s.maxMin)/2:s.min||0;planMin+=pm;const a=actFor(s);if(a){doneN++;doneMin+=(a.moving_time||0)/60}else if(s.done){doneN++;doneMin+=pm}});
  return {planMin,doneMin,doneN,totN:inWeek.length};
}
function hrs(m){return (Math.round(m/6)/10).toString().replace(".",",")+" h"}
function renderWeek(){
  const weeks=[...new Set(all().map(s=>weekNo(s.d)))].sort((a,b)=>a-b);
  const tabs=document.getElementById("tabs"),strip=document.getElementById("strip"),sel=document.getElementById("sel");
  if(!weeks.length){tabs.innerHTML="";strip.innerHTML="";sel.innerHTML="";document.getElementById("weekhead").innerHTML='<div class="kicker">El pla</div><h2>Setmana a setmana</h2>';return}
  if(weekSel==null||!weeks.includes(weekSel)){const cw=weekNo(todayStr);weekSel=weeks.includes(cw)?cw:(weeks.find(w=>w>=cw)||weeks[weeks.length-1])}
  const ws=addDays(START,(weekSel-1)*7),we=addDays(ws,6),st=weekStats(ws,we);
  const wk=(plan&&plan.weeks&&plan.weeks[String(weekSel)])||{};
  const img=wk.img||"media/peloton.webp",wi=document.getElementById("weekimg");if(wi.getAttribute("src")!==img)wi.setAttribute("src",img);
  document.getElementById("weekhead").innerHTML='<div class="kicker">Setmana '+weekSel+' · '+esc(dayLabel(ws))+' – '+esc(dayLabel(we))+'</div><h2>'+esc(wk.name||("Setmana "+weekSel))+'</h2>'+
    '<div class="wkprog"><div><div class="k">Hores</div><div class="v">'+hrs(st.doneMin)+' / '+hrs(st.planMin)+'</div><div class="bar"><i style="width:'+Math.min(100,st.planMin?st.doneMin/st.planMin*100:0).toFixed(0)+'%"></i></div></div>'+
    '<div><div class="k">Sessions</div><div class="v">'+st.doneN+' / '+st.totN+'</div><div class="bar"><i style="width:'+(st.totN?st.doneN/st.totN*100:0).toFixed(0)+'%"></i></div></div><div id="wkload"></div></div>';
  tabs.innerHTML=weeks.map(w=>'<button type="button" role="tab" data-week="'+w+'" aria-selected="'+(w===weekSel)+'">S'+w+'</button>').join("");
  const days=[];for(let i=0;i<7;i++)days.push(addDays(ws,i));
  const weekSessions=all().filter(s=>s.d>=ws&&s.d<=we);
  const maxMin=Math.max(60,...weekSessions.map(s=>s.maxMin||s.min||0));
  if(!selId||!weekSessions.some(s=>s.id===selId)){const t=weekSessions.find(s=>s.d===todayStr&&active(s))||weekSessions.find(s=>active(s)&&s.d>=todayStr&&s.type!=="rest")||weekSessions[0];selId=t?t.id:null}
  const dayInfo=days.map(d=>{
    const on=weekSessions.filter(s=>s.d===d);const p=on.find(active)||on[0]||null;
    const act=acts[d]||null;
    const pl=p?plannedLoad(p):0,al=act?actualLoad(act):null;
    return {d,p,act,pl,al};
  });
  const scale=Math.max(80,...dayInfo.map(x=>Math.max(x.pl,x.al?x.al.tss:0)))*1.12;
  strip.innerHTML=dayInfo.map(({d,p,act,pl,al})=>{
    const dd=parseD(d),dl='<div class="dl"><small>'+DAYS[dd.getDay()]+'</small><b>'+dd.getDate()+'</b>'+(al?'<i class="tss">'+Math.round(al.tss)+'</i>':'<i class="tss"> </i>')+'</div>';
    if(!p&&!act)return '<div class="daybtn" aria-hidden="true"><div class="col2"></div>'+dl+'</div>';
    const ph=p?(p.type==="rest"||!active(p)?14:Math.max(8,pl/scale*100)):0;
    const ah=al?Math.max(6,al.tss/scale*100):0;
    let tick="";
    if(p&&active(p)&&p.type!=="rest"){
      const pa=actFor(p),dat=pa&&data[pa.id];
      if(pa&&dat&&!dat.error&&!loading[pa.id]){const lv=analyze(p,pa,dat).level;tick='<span class="tick '+lv+'">'+(lv==="bad"?"!":"✓")+'</span>'}
      else if(pa||p.done)tick='<span class="tick">✓</span>';
      else if(isMissed(p))tick='<span class="tick miss">?</span>';
    } else if(act&&al)tick='<span class="tick extra">+</span>';
    const top=Math.max(ph,ah);
    const pcls="pb"+(p&&p.type==="rest"?" rest":"")+(p&&!active(p)?" gone":"");
    const cls="daybtn"+(d===todayStr?" today":"");
    const label=dayLabel(d)+": "+(p?p.t:"sense sessió")+(al?". Fet: "+Math.round(al.tss)+" TSS, intensitat "+al.IF.toFixed(2):"");
    const target=p?p.id:"";
    return '<button type="button" class="'+cls+'"'+(target?' data-sel="'+esc(target)+'"':'')+' aria-pressed="'+(p&&p.id===selId)+'" style="--zc:var(--'+esc(p?p.z:"z1")+')'+(al?';--ac:var(--'+ifZone(al.IF)+')':'')+'" aria-label="'+esc(label)+'"><div class="col2">'+
      (p?'<div class="'+pcls+'" style="height:'+ph.toFixed(0)+'%"></div>':'')+(al?'<div class="ab" style="height:'+ah.toFixed(0)+'%"></div>':'')+
      (tick?'<div class="tickwrap" style="bottom:'+top.toFixed(0)+'%">'+tick+'</div>':'')+'</div>'+dl+'</button>';
  }).join("");
  const wkPlan=dayInfo.reduce((m,x)=>m+x.pl,0),wkDone=dayInfo.reduce((m,x)=>m+(x.al?x.al.tss:0),0);
  document.getElementById("wkload").innerHTML='<div class="k">Càrrega (TSS)</div><div class="v">'+Math.round(wkDone)+' / '+Math.round(wkPlan)+'</div><div class="bar"><i style="width:'+Math.min(100,wkPlan?wkDone/wkPlan*100:0).toFixed(0)+'%"></i></div>';
  const p=S[selId];
  sel.innerHTML=p?sessionCard(p,esc(dayLabel(p.d))+(p.d===todayStr?" · Avui":"")):"";
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
function render(){renderCover();renderStatus();renderSetup();renderLadder();renderDecide();renderToday();renderWeek();renderLog();renderZones();renderConn()}

/* ---------- Progress sync ---------- */
function syncDone(){
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
function startAuth(){
  const cid=(document.getElementById("cid").value||"").trim(),sec=(document.getElementById("csec").value||"").trim();
  if(!/^\d+$/.test(cid)){toast("El Client ID són només números. Copia'l de strava.com/settings/api.");return}
  if(sec.length<20){toast("El Client Secret sembla incomplet. Toca «Show» a Strava i copia'l sencer.");return}
  strava.clientId=cid;strava.clientSecret=sec;saveStrava();
  const u="https://www.strava.com/oauth/authorize?client_id="+encodeURIComponent(cid)+"&response_type=code&approval_prompt=auto&scope="+encodeURIComponent("read,activity:read_all")+"&redirect_uri="+encodeURIComponent(redirectUri());
  location.href=u;
}
function tokenRequest(params){
  const body=new URLSearchParams(Object.assign({client_id:strava.clientId,client_secret:strava.clientSecret},params));
  return fetch("https://www.strava.com/oauth/token",{method:"POST",body}).then(r=>r.json().catch(()=>({})).then(j=>{if(!r.ok)throw {code:r.status,msg:(j&&j.message)||""};return j}));
}
function handleAuthReturn(){
  const q=new URLSearchParams(location.search);
  const code=q.get("code"),err=q.get("error");
  if(!code&&!err)return Promise.resolve();
  history.replaceState(null,"",location.pathname);
  if(err){toast("No s'ha donat permís a Strava. Torna-ho a provar i accepta l'accés.");return Promise.resolve()}
  if(!strava.clientId||!strava.clientSecret){toast("Falten el Client ID i el Client Secret en aquest navegador. Torna-los a escriure.");return Promise.resolve()}
  stravaMsg="Connectant amb Strava…";renderStatus();
  return tokenRequest({code,grant_type:"authorization_code"}).then(j=>{
    strava.accessToken=j.access_token;strava.refreshToken=j.refresh_token;strava.expiresAt=j.expires_at;
    strava.athlete=j.athlete?[j.athlete.firstname,j.athlete.lastname].filter(Boolean).join(" "):"";
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
function normAct(a){return {id:String(a.id),name:a.name,sport_type:a.sport_type||a.type,start_local:a.start_date_local,moving_time:a.moving_time,distance:a.distance,average_watts:a.average_watts,device_watts:a.device_watts,average_cadence:a.average_cadence,kilojoules:a.kilojoules}}
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
  const r=planRange();
  const after=Math.floor(parseD(r[0]).getTime()/1000)-86400,before=Math.floor(parseD(r[1]).getTime()/1000)+2*86400;
  api("/athlete/activities?after="+after+"&before="+before+"&per_page=100")
  .then(list=>{
    const norm=(Array.isArray(list)?list:[]).map(normAct);
    lsSet("qw.acts",norm);
    const next=indexActs(norm);
    if(seenActs){const nw=Object.values(next).filter(a=>!seenActs.has(a.id));if(nw.length)toast("Nova activitat de Strava: «"+(nw[0].name||"sortida")+"». L'estic analitzant.")}
    seenActs=new Set(Object.values(next).map(a=>a.id));
    acts=next;stravaState="on";
    const t=new Date();stravaMsg="Strava connectat · "+String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");
    render();analyzeAll();
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
function loadDetail(id){
  loading[id]=true;
  return getStreams(id).then(st=>{
    const g=k=>st&&st[k]&&Array.isArray(st[k].data)?st[k].data:null;
    const time=g("time");
    data[id]={w:g("watts")?expand(time,g("watts")):[],c:g("cadence")?expand(time,g("cadence")):[]};memo.clear();
  }).catch(e=>{data[id]={error:errMsg(e)}})
  .then(()=>{delete loading[id];syncDone();render()});
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
      if(act&&d&&!d.error){const a=analyze(s,act,d);line+=" — "+(a.level==="ok"?"BEN FETA":a.level==="warn"?"AMB MATISOS":"INCOMPLETA")+" ("+fmtDur(act.moving_time||0)+(act.average_watts?", "+Math.round(act.average_watts)+" W":"")+")";
        a.checks.forEach(c=>{line+="\n   "+(c.l==="ok"?"✓":c.l==="warn"?"!":"✕")+" "+c.t});
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
  if(el.id==="connect"){startAuth();return}
  if(el.id==="importBtn"){
    try{const raw=(document.getElementById("importKey").value||"").trim();const j=JSON.parse(decodeURIComponent(escape(atob(raw))));
      if(!j.c||!j.s||!j.r)throw 0;strava={clientId:j.c,clientSecret:j.s,refreshToken:j.r,athlete:j.a||""};saveStrava();toast("Strava connectat ✓");render();loadActivities();
    }catch(err){toast("Aquesta clau no és vàlida. Copia-la sencera des de «Connexió amb Strava».")}
    return;
  }
  if(el.id==="exportBtn"){const k=btoa(unescape(encodeURIComponent(JSON.stringify({c:strava.clientId,s:strava.clientSecret,r:strava.refreshToken,a:strava.athlete||""}))));copyText(k,"Clau copiada. Enganxa-la a l'altra app.");return}
  if(el.id==="disconnect"){strava={clientId:strava.clientId,clientSecret:strava.clientSecret};saveStrava();acts={};data={};stravaState="idle";stravaMsg="Strava desconnectat.";render();return}
  const ds=el.dataset;
  if(ds.week){weekSel=+ds.week;selId=null;renderWeek();return}
  if(ds.sel){selId=ds.sel;renderWeek();return}
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
    toast("«"+s.t+"» passa al "+dayLabel(to)+".");memo.clear();render();return;
  }
  if(ds.remove){const s=S[ds.remove];if(!s)return;chooser=null;setOv(s.id,{status:"removed"});addLog("«"+s.t+"» del "+dayLabel(s.d)+" eliminada.");toast("Sessió eliminada. La pots recuperar des del pla.");render();return}
  if(ds.restore){const s=S[ds.restore];if(!s)return;setOv(s.id,{status:"planned"});addLog("«"+s.t+"» del "+dayLabel(s.d)+" recuperada.");render();return}
  if(ds.done){const s=S[ds.done];if(!s)return;chooser=null;setOv(s.id,{done:{by:"manual",at:new Date().toISOString()}});addLog("«"+s.t+"» del "+dayLabel(s.d)+" marcada com a feta a mà.");toast("Marcada com a feta ✓");render();return}
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
function tick(){
  const t=localDate(new Date());
  if(t!==todayStr){todayStr=t;weekSel=null;selId=null;render()}
  if(document.visibilityState==="visible"&&Date.now()-lastLoad>5*60*1000){loadActivities()}
}
setInterval(tick,60000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){const t=localDate(new Date());if(t!==todayStr){todayStr=t;weekSel=null;selId=null}render();if(Date.now()-lastLoad>60000){loadPlan();loadActivities()}}});
try{const v=document.getElementById("heroVid");v.addEventListener("canplay",()=>{const pp=v.play();if(pp&&pp.catch)pp.catch(()=>{})})}catch(e){}

/* ---------- Boot ---------- */
if(plan){applyPlanMeta();S=buildSessions();planState="ready"}
const cached=lsGet("qw.acts",null);if(Array.isArray(cached)){acts=indexActs(cached);if(strava.refreshToken){stravaState="on";stravaMsg="Carregant Strava…"}}
try{localStorage.removeItem("qw.coach")}catch(e){}
render();
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
