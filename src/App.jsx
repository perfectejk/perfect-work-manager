import React,{useState,useMemo,useEffect,useCallback,useRef}from"react";
import*as XLSX from"xlsx";
import{doc,getDoc,setDoc,deleteDoc,getDocs,collection}from'firebase/firestore';
import{db}from'./firebase';

const METRICS=[{key:"calls",label:"콜수",unit:"콜"},{key:"callTime",label:"콜시간",unit:"분"},{key:"materials",label:"자료수",unit:"개"},{key:"toss",label:"토스",unit:"개"},{key:"retarget",label:"재통픽스",unit:"개"},{key:"positive",label:"긍정백톡",unit:"개"},{key:"negative",label:"부정백톡",unit:"개"}];
const DEF_TARGETS={calls:200,materials:25,retarget:4};
const ADMIN_PW="admin123";
const todayStr=new Date().toISOString().slice(0,10);
const uid=()=>Math.random().toString(36).slice(2,9);
const san=s=>s.replace(/[\s/\\'":]/g,"_").slice(0,50);
const P={high:{label:"높음",color:"#ef4444",bg:"#fef2f2"},medium:{label:"중간",color:"#f59e0b",bg:"#fffbeb"},low:{label:"낮음",color:"#10b981",bg:"#f0fdf4"}};
const S={todo:{label:"할 일",color:"#6b7280",bg:"#f3f4f6"},doing:{label:"진행 중",color:"#2563eb",bg:"#eff6ff"},done:{label:"완료",color:"#10b981",bg:"#d1fae5"}};
const CE={온보딩:{color:"#6b7280",bg:"#f3f4f6"},관리전화:{color:"#2563eb",bg:"#eff6ff"},리포트:{color:"#7c3aed",bg:"#f5f3ff"}};
const DAYS_KR=["일","월","화","수","목","금","토"];
const EF=(isAdmin)=>({title:"",project:"",priority:"medium",status:"todo",due:"",memo:"",visibility:isAdmin?"public":"personal",repeat:"none",repeatDays:[]});

const parseAmount=str=>{if(!str)return 0;const m=str.match(/(\d+(?:\.\d+)?)\s*만/);if(m)return parseFloat(m[1])*10000;const n=str.match(/(\d[\d,]*)/);if(n)return parseInt(n[1].replace(/,/g,""));return 0;};
const fmtAmount=n=>{if(!n)return"0원";if(n>=10000)return`${Math.floor(n/10000)}만원`;return`${n.toLocaleString()}원`;};

const fkey=k=>k.replace(/\//g,'__').replace(/:/g,'--');
const st={
  get:async(k)=>{try{const s=await getDoc(doc(db,'kv',fkey(k)));return s.exists()?JSON.parse(s.data().v):null;}catch{return null;}},
  set:async(k,v)=>{try{await setDoc(doc(db,'kv',fkey(k)),{v:JSON.stringify(v),k});return true;}catch{return false;}},
  del:async(k)=>{try{await deleteDoc(doc(db,'kv',fkey(k)));}catch{}},
  list:async(p)=>{try{const s=await getDocs(collection(db,'kv'));return s.docs.filter(d=>d.data().k?.startsWith(p)).map(d=>d.data().k);}catch{return[];}},
};
const ses={get:()=>{try{const v=localStorage.getItem('ses:user');return v?JSON.parse(v):null;}catch{return null;}},set:v=>{try{localStorage.setItem('ses:user',JSON.stringify(v));}catch{}},del:()=>{try{localStorage.removeItem('ses:user');}catch{}}};

const addBizDays=(ds,n)=>{let d=new Date(ds+"T00:00:00"),c=0;while(c<n){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6)c++;}return d.toISOString().slice(0,10);};
const subBizDays=(ds,n)=>{let d=new Date(ds+"T00:00:00"),c=0;while(c<n){d.setDate(d.getDate()-1);if(d.getDay()!==0&&d.getDay()!==6)c++;}return d.toISOString().slice(0,10);};
const genEvents=c=>{if(!c.startDate||!c.endDate)return[];const rptDate=subBizDays(c.endDate,3);const evts=[{type:"온보딩",date:c.startDate,cid:c.id,name:c.name,manager:c.manager||""}];let cur=c.startDate;while(true){cur=addBizDays(cur,10);if(cur>=rptDate)break;evts.push({type:"관리전화",date:cur,cid:c.id,name:c.name,manager:c.manager||""});}if(rptDate>c.startDate)evts.push({type:"리포트",date:rptDate,cid:c.id,name:c.name,manager:c.manager||""});return evts;};
const ceKey=e=>`${e.cid}:${e.type}:${e.date}`;
const parseMemo=text=>{const line=key=>{const m=text.match(new RegExp(key+'\\s*[:\\s]\\s*([^\\n]+)'));return m?m[1].trim():'';};const section=(start,ends)=>{const lines=text.split('\n');let cap=false,res=[];for(const l of lines){if(l.includes(start)&&!l.includes('▪')){cap=true;continue;}if(cap&&ends.some(e=>l.includes(e)&&!l.includes('▪')))break;if(cap&&l.trim())res.push(l.trim());}return res.join('\n');};return{name:line('상호명'),phone:line('번호'),link:line('플레이스 링크'),products:section('상품내역',['서비스내역','결제정보','담당자']),services:section('서비스내역',['결제정보','담당자','특이사항']),total:line('총금액'),manager:line('담당자'),notes:line('특이사항')};};
const sendNotif=async(url,name,ts,data,targets)=>{if(!url?.startsWith("http"))return;const lines=METRICS.map(m=>{const v=data[m.key]||0,t=targets[m.key];return`• ${m.label}: **${v}${m.unit}**${t?` / ${t}${m.unit} (${Math.round(v/t*100)}%)`:''}`;});try{await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"업무보고 알림",content:`📊 **[${ts}] ${name}** 실적 제출\n${lines.join('\n')}`})});}catch{}};
const repeatLabel=t=>{if(!t.repeat||t.repeat==="none")return null;if(t.repeat==="weekly")return`🔄 매주 ${DAYS_KR[new Date(t.due+"T00:00:00").getDay()]}`;if(t.repeat==="monthly")return`🔄 매월 ${parseInt(t.due.slice(8))}일`;if(t.repeat==="weekdays")return"🔄 평일";if(t.repeat==="custom")return`🔄 ${(t.repeatDays||[]).sort().map(d=>DAYS_KR[d]).join("·")}`;return null;};
const isActiveOnDate=(t,ds)=>{if(!t.due||t.due>ds)return false;const dow=new Date(ds+"T00:00:00").getDay();if(!t.repeat||t.repeat==="none")return t.due===ds;if(t.repeat==="weekly")return new Date(t.due+"T00:00:00").getDay()===dow;if(t.repeat==="monthly")return parseInt(t.due.slice(8))===new Date(ds+"T00:00:00").getDate();if(t.repeat==="weekdays")return dow>=1&&dow<=5;if(t.repeat==="custom")return(t.repeatDays||[]).includes(dow);return false;};
const getWeekDays=()=>{const now=new Date();const dow=now.getDay();const mon=new Date(now);mon.setDate(now.getDate()-(dow===0?6:dow-1));return Array.from({length:5},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d.toISOString().slice(0,10);});};
const expandForMonth=(tasks,y,m)=>{const dim=new Date(y,m+1,0).getDate(),res=[];const mp=`${y}-${String(m+1).padStart(2,"0")}`;tasks.forEach(t=>{if(!t.repeat||t.repeat==="none"){if(!t.due||t.due.startsWith(mp))res.push(t);return;}const sd=t.due;if(t.repeat==="weekly"){const dow=new Date(t.due+"T00:00:00").getDay();for(let d=1;d<=dim;d++){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;if(date<sd)continue;if(new Date(y,m,d).getDay()===dow)res.push({...t,id:t.id+"-w"+d,due:date,_ir:true});}}else if(t.repeat==="monthly"){const day=parseInt(t.due.slice(8));if(day<=dim){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;if(date>=sd)res.push({...t,due:date,_ir:true});}}else if(t.repeat==="weekdays"){for(let d=1;d<=dim;d++){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;if(date<sd)continue;const dow=new Date(y,m,d).getDay();if(dow>=1&&dow<=5)res.push({...t,id:t.id+"-wd"+d,due:date,_ir:true});}}else if(t.repeat==="custom"){const days=t.repeatDays||[];for(let d=1;d<=dim;d++){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;if(date<sd)continue;if(days.includes(new Date(y,m,d).getDay()))res.push({...t,id:t.id+"-c"+d,due:date,_ir:true});}}});return res;};

/* ── Avatar ── */
const ACOLORS=["#2563eb","#7c3aed","#db2777","#ea580c","#16a34a","#0891b2"];
function Avatar({name,img,size=32,onClick,border}){
  const bg=ACOLORS[(name||"?").charCodeAt(0)%ACOLORS.length];
  return(
    <div onClick={onClick} style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,cursor:onClick?"pointer":"default",border:border||"2px solid rgba(255,255,255,0.4)",boxSizing:"border-box"}}>
      {img?<img src={img} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={name}/>
        :<div style={{width:"100%",height:"100%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff"}}>{(name||"?").slice(0,1).toUpperCase()}</div>}
    </div>
  );
}

/* ── Profile Modal ── */
function ProfileModal({user,profiles,onUpdateProfile,onClose,contracts}){
  const fileRef=useRef();
  const myImg=profiles[user.name];
  const myContracts=contracts.filter(c=>c.manager===user.name);
  const monthlyMap={};
  myContracts.forEach(c=>{if(!c.startDate)return;const[y,m]=c.startDate.split("-");const key=`${y}-${m}`;if(!monthlyMap[key])monthlyMap[key]={year:parseInt(y),month:parseInt(m),count:0,amount:0};monthlyMap[key].count++;monthlyMap[key].amount+=parseAmount(c.total);});
  const monthly=Object.values(monthlyMap).sort((a,b)=>b.year-a.year||b.month-a.month);
  const totalCount=myContracts.length;const totalAmount=myContracts.reduce((s,c)=>s+parseAmount(c.total),0);
  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>onUpdateProfile(user.name,ev.target.result);r.readAsDataURL(f);};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:28,width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontSize:15,fontWeight:700,color:"#111827"}}>내 프로필</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#9ca3af"}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:20}}>
          <Avatar name={user.name} img={myImg} size={80} border="3px solid #e5e7eb"/>
          <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>{user.name}</div>
          <div style={{fontSize:12,color:"#9ca3af",background:"#f3f4f6",borderRadius:99,padding:"3px 10px"}}>{user.isAdmin?"🔒 관리자":"👤 사원"}</div>
          <button onClick={()=>fileRef.current.click()} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:8,padding:"7px 16px",fontSize:12,fontWeight:600,cursor:"pointer"}}>📷 프로필 사진 변경</button>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
        </div>
        <div style={{borderTop:"1px solid #f3f4f6",paddingTop:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:10}}>📊 내 매출 현황</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div style={{background:"#f0f5ff",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:800,color:"#2563eb"}}>{totalCount}건</div>
              <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>누적 계약</div>
            </div>
            <div style={{background:"#fdf4ff",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:800,color:"#7c3aed"}}>{fmtAmount(totalAmount)}</div>
              <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>누적 매출</div>
            </div>
          </div>
          {monthly.length>0?(
            <div style={{maxHeight:160,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
              {monthly.map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#f8fafc",borderRadius:8,padding:"8px 12px"}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{s.year}년 {s.month}월</span>
                  <div style={{display:"flex",gap:12}}>
                    <span style={{fontSize:12,color:"#2563eb",fontWeight:600}}>{s.count}건</span>
                    <span style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>{fmtAmount(s.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          ):<p style={{fontSize:13,color:"#9ca3af",textAlign:"center",padding:"12px 0"}}>아직 담당 계약이 없습니다</p>}
        </div>
      </div>
    </div>
  );
}

const Badge=({label,color,bg})=><span style={{fontSize:11,fontWeight:600,color,background:bg,borderRadius:6,padding:"2px 7px",whiteSpace:"nowrap"}}>{label}</span>;

/* ── Login ── */
function LoginScreen({onLogin}){
  const[name,setName]=useState("");const[pw,setPw]=useState("");const[isAdmin,setIsAdmin]=useState(false);const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const go=async()=>{if(!name.trim())return setErr("이름을 입력하세요");if(!pw.trim())return setErr("비밀번호를 입력하세요");setLoading(true);if(isAdmin){if(pw!==ADMIN_PW){setErr("비밀번호가 틀렸습니다");setLoading(false);return;}onLogin({name:name.trim(),isAdmin:true});}else{const accounts=await st.get("accounts:all")||[];const acc=accounts.find(a=>a.name===name.trim()&&a.password===pw);if(!acc){setErr("이름 또는 비밀번호가 틀렸습니다");setLoading(false);return;}onLogin({name:name.trim(),isAdmin:false});}setLoading(false);};
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",position:"relative",overflow:"hidden",background:"#1e40af",padding:"32px 20px 40px"}}>
      {[{w:420,h:420,bg:"#1d4ed8",t:-130,l:-100,op:1},{w:360,h:360,bg:"#f8fafc",b:-100,r:-80,op:0.95},{w:300,h:300,bg:"#e0f2fe",t:"15%",r:-30,op:0.85},{w:240,h:240,bg:"#f0f9ff",b:"5%",l:-30,op:0.7}].map((b,i)=>(
        <div key={i} style={{position:"absolute",width:b.w,height:b.h,background:b.bg,borderRadius:"50%",top:b.t,left:b.l,bottom:b.b,right:b.r,filter:"blur(70px)",opacity:b.op,zIndex:0}}/>
      ))}
      <div style={{position:"relative",zIndex:10,fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:24,color:"#fff",textAlign:"center",lineHeight:1.3,letterSpacing:1,textShadow:"0 2px 16px rgba(0,0,0,0.15)",marginBottom:30}}>PRO Marketing<br/>Management</div>
      <div style={{position:"relative",zIndex:10,width:"100%",maxWidth:340,paddingTop:48}}>
        <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:88,height:88,background:"rgba(59,130,246,0.8)",border:"3px solid rgba(255,255,255,0.75)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20}}>
          <svg width="38" height="38" viewBox="0 0 38 38" fill="none"><circle cx="19" cy="14" r="7" stroke="rgba(255,255,255,0.95)" strokeWidth="2.3"/><path d="M5 34c0-7.732 6.268-12 14-12s14 4.268 14 12" stroke="rgba(255,255,255,0.95)" strokeWidth="2.3" strokeLinecap="round"/></svg>
        </div>
        <div style={{background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.45)",borderRadius:22,padding:"52px 28px 28px",backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.18)"}}>
          <div style={{display:"flex",background:"rgba(0,0,0,0.12)",borderRadius:10,padding:3,gap:3,marginBottom:18}}>
            {[{v:false,l:"사원"},{v:true,l:"관리자"}].map(({v,l})=>(
              <button key={String(v)} onClick={()=>{setIsAdmin(v);setErr("");}} style={{flex:1,border:"none",borderRadius:8,padding:"8px",fontSize:12,fontWeight:600,cursor:"pointer",background:isAdmin===v?"rgba(255,255,255,0.28)":"transparent",color:isAdmin===v?"#fff":"rgba(255,255,255,0.4)",fontFamily:"'Inter',sans-serif"}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[{v:name,sv:setName,ph:"이름을 입력하세요",type:"text"},{v:pw,sv:setPw,ph:"비밀번호",type:"password"}].map((f,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.35)",borderRadius:10,padding:"11px 14px",gap:10}}>
                <input type={f.type} value={f.v} onChange={e=>f.sv(e.target.value)} placeholder={f.ph} onKeyDown={e=>e.key==="Enter"&&go()} style={{background:"none",border:"none",outline:"none",fontSize:13,color:"#fff",flex:1,fontFamily:"'Inter',sans-serif"}}/>
              </div>
            ))}
            {err&&<p style={{margin:0,fontSize:12,color:"#fca5a5",textAlign:"center"}}>{err}</p>}
            <button onClick={go} disabled={loading} style={{background:"#fff",color:"#1e40af",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:900,cursor:"pointer",marginTop:6,letterSpacing:2,fontFamily:"'Orbitron',sans-serif"}}>{loading?"확인 중…":"LOGIN"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar ── */
function Sidebar({tab,setTab,user,onLogout,contracts,profiles,onOpenProfile,navOrder,setNavOrder}){
  const myCount=user.isAdmin?contracts.length:contracts.filter(c=>c.manager===user.name).length;
  const NAV=[
    {id:"list",label:"목록",icon:<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1.3" fill="white"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.3" fill="white" opacity="0.4"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1.3" fill="white" opacity="0.4"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.3" fill="white"/></svg>},
    {id:"calendar",label:"캘린더",icon:<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="2" width="13" height="12" rx="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3"/><path d="M5 1v2M10 1v2M1 6h13" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" strokeLinecap="round"/></svg>},
    {id:"contracts",label:"계약관리",icon:<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="5.5" cy="4.5" r="2.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3"/><path d="M1.5 12c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" strokeLinecap="round"/><path d="M11 7v5M9 9.5h4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" strokeLinecap="round"/></svg>,badge:myCount>0?myCount:null,badgeColor:"rgba(167,139,250,0.35)",badgeTextColor:"#c4b5fd"},
    {id:"report",label:"업무보고",icon:<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="9" width="3" height="5" rx="1" fill="rgba(255,255,255,0.4)"/><rect x="6" y="5.5" width="3" height="8.5" rx="1" fill="rgba(255,255,255,0.4)"/><rect x="11" y="2" width="3" height="12" rx="1" fill="rgba(255,255,255,0.4)"/></svg>},
    {id:"ranking",label:"매출 랭킹",icon:<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1l1.5 3.5L13 5l-3 3 .5 4L7.5 10 4 12l.5-4L1.5 5l4-.5L7.5 1z" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinejoin="round"/></svg>},
  ];
  const sortedNav=navOrder.map(id=>NAV.find(n=>n.id===id)).filter(Boolean);
  return(
    <div style={{width:200,minHeight:"100vh",background:"linear-gradient(160deg,#1e3a8a 0%,#1e40af 40%,rgba(59,130,246,0.45) 100%)",display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",borderRight:"1px solid rgba(255,255,255,0.08)"}}>
      <div style={{padding:"20px 16px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <div style={{width:28,height:28,background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1.2" fill="white"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2" fill="white" opacity="0.5"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2" fill="white" opacity="0.5"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2" fill="white"/></svg>
          </div>
          <span style={{fontSize:11,fontWeight:800,color:"#fff"}}>PRO Marketing</span>
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{new Date().toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"})}</div>
        {/* 프로필 클릭 */}
        <div onClick={onOpenProfile} style={{background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 12px",marginTop:12,border:"1px solid rgba(255,255,255,0.12)",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
          <Avatar name={user.name} img={profiles[user.name]} size={30}/>
          <div style={{minWidth:0}}><div style={{fontSize:10,color:"rgba(255,255,255,0.45)",fontWeight:600}}>{user.isAdmin?"관리자":"사원"}</div><div style={{fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div></div>
        </div>
      </div>
      <div style={{padding:"0 8px",flex:1}}>
        {sortedNav.map(n=>
          <button key={n.id} onClick={()=>setTab(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"10px 12px",borderRadius:10,border:tab===n.id?"1px solid rgba(255,255,255,0.18)":"1px solid transparent",background:tab===n.id?"rgba(255,255,255,0.15)":"transparent",cursor:"pointer",textAlign:"left",marginBottom:2}}>
            {n.icon}
            <span style={{fontSize:13,fontWeight:tab===n.id?600:500,color:tab===n.id?"#fff":"rgba(255,255,255,0.4)"}}>{n.label}</span>
            {n.badge&&<span style={{marginLeft:"auto",background:n.badgeColor,color:n.badgeTextColor,borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700}}>{n.badge}</span>}
          </button>
        ))}
        {/* 관리자 전용 메뉴 */}
        {user.isAdmin&&(
          <button onClick={()=>setTab("admin")} style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"10px 12px",borderRadius:10,border:tab==="admin"?"1px solid rgba(251,191,36,0.4)":"1px solid transparent",background:tab==="admin"?"rgba(251,191,36,0.15)":"transparent",cursor:"pointer",textAlign:"left",marginBottom:2,marginTop:4}}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="3" y="7" width="9" height="7" rx="1.5" stroke="rgba(251,191,36,0.7)" strokeWidth="1.3"/><path d="M5 7V5a2.5 2.5 0 015 0v2" stroke="rgba(251,191,36,0.7)" strokeWidth="1.3" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r="1" fill="rgba(251,191,36,0.7)"/></svg>
            <span style={{fontSize:13,fontWeight:tab==="admin"?600:500,color:tab==="admin"?"#fbbf24":"rgba(251,191,36,0.6)"}}>관리자 설정</span>
          </button>
        )}
      </div>
      <div style={{padding:"10px 8px 16px",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
        <button onClick={onLogout} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:9,cursor:"pointer"}}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5.5 12H3a1 1 0 01-1-1V3a1 1 0 011-1h2.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" strokeLinecap="round"/><path d="M9.5 10l3-3-3-3M12.5 7H5.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.7)",fontWeight:500}}>로그아웃</span>
        </button>
      </div>
    </div>
  );
}

/* ── Task Card ── */
function TaskCard({task,onCycle,onDelete,onEdit,showOwner,canEdit}){
  const[exp,setExp]=useState(false);const p=P[task.priority],s=S[task.status],isDone=task.status==="done";const isOver=task.due&&!isDone&&!task._ir&&task.due<todayStr;const rl=repeatLabel(task);
  return(<div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:`1px solid ${isDone?"#d1fae5":"#e5e7eb"}`,opacity:isDone?0.7:1}}><div style={{display:"flex",alignItems:"flex-start",gap:10}}><button onClick={()=>canEdit&&onCycle(task)} style={{flexShrink:0,marginTop:1,width:22,height:22,borderRadius:"50%",border:`2px solid ${s.color}`,background:isDone?"#10b981":task.status==="doing"?"#eff6ff":"#fff",cursor:canEdit?"pointer":"default",fontSize:10,color:s.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{isDone?"✓":task.status==="doing"?"▶":""}</button><div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:13,fontWeight:600,color:isDone?"#9ca3af":"#111827",textDecoration:isDone?"line-through":"none"}}>{task.title}</span><Badge label={p.label} color={p.color} bg={p.bg}/><Badge label={s.label} color={s.color} bg={s.bg}/>{rl&&<Badge label={rl} color="#7c3aed" bg="#f5f3ff"/>}</div><div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>{showOwner&&task.owner&&<span style={{fontSize:11,color:"#7c3aed",fontWeight:600}}>👤 {task.owner}</span>}{task.project&&<span style={{fontSize:11,color:"#6b7280"}}>📁 {task.project}</span>}{task.due&&<span style={{fontSize:11,color:isOver?"#ef4444":"#9ca3af"}}>{isOver?"⚠️ ":"📅 "}{task.due}{task._ir?" (반복)":""}</span>}{task.memo&&<button onClick={()=>setExp(v=>!v)} style={{fontSize:10,color:"#a855f7",background:"#faf5ff",border:"none",borderRadius:5,padding:"1px 6px",cursor:"pointer"}}>📝</button>}</div>{exp&&task.memo&&<div style={{marginTop:6,background:"#faf5ff",borderRadius:8,padding:"7px 10px",fontSize:12,color:"#6b21a8",borderLeft:"3px solid #d8b4fe"}}>{task.memo}</div>}</div>{canEdit&&!task._ir&&<div style={{display:"flex",gap:2,flexShrink:0}}><button onClick={()=>onEdit(task)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",padding:3,fontSize:12}}>✏️</button><button onClick={()=>onDelete(task)} style={{background:"none",border:"none",color:"#d1d5db",cursor:"pointer",padding:3,fontSize:12}}>✕</button></div>}</div></div>);
}

/* ── Contract Event Card ── */
function ContractEventCard({event,contract,isDone,onToggle}){
  const[exp,setExp]=useState(false);const ce=CE[event.type];
  return(<div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:`1.5px solid ${ce.color}40`,borderLeft:`4px solid ${ce.color}`,opacity:isDone?0.65:1}}><div style={{display:"flex",alignItems:"flex-start",gap:10}}><button onClick={onToggle} style={{flexShrink:0,marginTop:1,width:22,height:22,borderRadius:"50%",border:`2px solid ${isDone?"#10b981":ce.color}`,background:isDone?"#10b981":ce.bg,cursor:"pointer",fontSize:10,color:isDone?"#fff":ce.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{isDone?"✓":""}</button><div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:700,color:isDone?"#9ca3af":"#111827",textDecoration:isDone?"line-through":"none"}}>[{event.type}] {contract.name}</span><Badge label="계약" color={ce.color} bg={ce.bg}/>{event.manager&&<Badge label={`👤 ${event.manager}`} color="#7c3aed" bg="#f5f3ff"/>}</div><div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>{contract.phone&&<span style={{fontSize:11,color:"#6b7280"}}>📞 {contract.phone}</span>}{contract.total&&<span style={{fontSize:11,color:"#6b7280"}}>💰 {contract.total}</span>}<button onClick={()=>setExp(v=>!v)} style={{fontSize:10,color:ce.color,background:ce.bg,border:"none",borderRadius:5,padding:"1px 7px",cursor:"pointer"}}>{exp?"접기":"상세"}</button></div>{exp&&<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>{contract.link&&<a href={contract.link} target="_blank" rel="noreferrer" style={{fontSize:12,color:"#2563eb",wordBreak:"break-all"}}>🔗 {contract.link}</a>}{contract.products&&<div style={{fontSize:12,color:"#374151",background:"#f8fafc",borderRadius:6,padding:"6px 8px",whiteSpace:"pre-line"}}><b>상품:</b>{"\n"}{contract.products}</div>}{contract.notes&&<div style={{fontSize:12,color:"#6b7280"}}>📌 {contract.notes}</div>}</div>}</div></div></div>);
}

/* ── Repeat Picker ── */
function RepeatPicker({repeat,repeatDays,due,onChange}){
  const opts=[{v:"none",l:"반복 없음"},{v:"weekly",l:"🔄 매주"},{v:"monthly",l:"🔄 매월"},{v:"weekdays",l:"🔄 평일(월-금)"},{v:"custom",l:"🔄 요일 직접 설정"}];
  const toggle=d=>{const c=repeatDays||[];onChange("repeatDays",c.includes(d)?c.filter(x=>x!==d):[...c,d]);};
  const dueDow=due?DAYS_KR[new Date(due+"T00:00:00").getDay()]:"";
  return(<div><select value={repeat} onChange={e=>onChange("repeat",e.target.value)} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,background:"#fff",width:"100%"}}>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>{repeat==="weekly"&&due&&<div style={{marginTop:5,fontSize:12,color:"#7c3aed",background:"#f5f3ff",borderRadius:8,padding:"5px 10px"}}>매주 <b>{dueDow}요일</b> ({due} 부터)</div>}{repeat==="custom"&&(<div style={{marginTop:8}}><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{DAYS_KR.map((d,i)=>(<button key={i} onClick={()=>toggle(i)} style={{width:34,height:34,borderRadius:"50%",border:`2px solid ${(repeatDays||[]).includes(i)?"#7c3aed":"#e5e7eb"}`,background:(repeatDays||[]).includes(i)?"#7c3aed":"#fff",color:(repeatDays||[]).includes(i)?"#fff":"#374151",fontSize:13,fontWeight:600,cursor:"pointer"}}>{d}</button>))}</div></div>)}</div>);
}

/* ── Task Form ── */
function TaskForm({form,setForm,onSubmit,onCancel,isEdit,isAdminUser,projectCategories}){
  const iS={border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
  return(<div style={{background:"#fff",borderRadius:14,padding:18,marginBottom:14,border:"1px solid #bfdbfe"}}><p style={{margin:"0 0 12px",fontWeight:700,fontSize:14,color:"#1d4ed8"}}>{isEdit?"✏️ 작업 수정":"➕ 새 작업 추가"}</p>
    <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="작업 제목 *" style={{...iS,marginBottom:8}}/>
    <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
      <select value={form.project} onChange={e=>setForm(f=>({...f,project:e.target.value}))} style={{flex:1,minWidth:110,border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,background:"#fff"}}>
        <option value="">프로젝트 선택</option>
        {projectCategories.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
      <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,background:"#fff"}}>{Object.entries(P).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
      <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,background:"#fff"}}>{Object.entries(S).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"flex-start"}}>
      <div style={{flex:1,minWidth:130}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:5}}>시작 날짜</label><input type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box"}}/></div>
      <div style={{flex:2,minWidth:180}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:5}}>반복 설정</label><RepeatPicker repeat={form.repeat} repeatDays={form.repeatDays} due={form.due} onChange={(k,v)=>setForm(f=>({...f,[k]:v}))}/></div>
    </div>
    {isAdminUser&&<div style={{display:"flex",gap:4,marginBottom:8}}>{[{v:"public",l:"📢 전체공개",c:"#2563eb"},{v:"private",l:"🔒 비공개",c:"#92400e"}].map(({v,l,c})=>(<button key={v} onClick={()=>setForm(f=>({...f,visibility:v}))} style={{border:`2px solid ${form.visibility===v?c:"#e5e7eb"}`,borderRadius:10,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",background:form.visibility===v?c+"18":"#fff",color:form.visibility===v?c:"#9ca3af"}}>{l}</button>))}</div>}
    <textarea value={form.memo} onChange={e=>setForm(f=>({...f,memo:e.target.value}))} placeholder="메모 (선택사항)" rows={2} style={{...iS,resize:"vertical",marginBottom:10,fontFamily:"inherit"}}/>
    <div style={{display:"flex",gap:8}}><button onClick={onSubmit} style={{flex:1,background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:14,fontWeight:600,cursor:"pointer"}}>{isEdit?"저장":"추가하기"}</button><button onClick={onCancel} style={{background:"#f3f4f6",color:"#6b7280",border:"none",borderRadius:10,padding:"10px 16px",fontSize:14,cursor:"pointer"}}>취소</button></div>
  </div>);
}

/* ── Contract Form ── */
function ContractForm({initial,onSubmit,onCancel}){
  const blank={name:"",phone:"",link:"",products:"",services:"",total:"",manager:"",notes:""};
  const[memo,setMemo]=useState("");const[parsed,setParsed]=useState(initial?{name:initial.name,phone:initial.phone,link:initial.link,products:initial.products,services:initial.services,total:initial.total,manager:initial.manager||"",notes:initial.notes}:blank);
  const[startDate,setStartDate]=useState(initial?.startDate||"");const[endDate,setEndDate]=useState(initial?.endDate||"");const[parseMsg,setParseMsg]=useState("");
  const iS={border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
  return(<div style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #e5e7eb",marginBottom:14}}><p style={{margin:"0 0 14px",fontWeight:700,fontSize:14}}>{initial?.id?"✏️ 계약 수정":"➕ 계약업체 등록"}</p>
    {!initial?.id&&<div style={{marginBottom:14,background:"#f5f3ff",borderRadius:12,padding:14}}><label style={{fontSize:12,color:"#7c3aed",fontWeight:700,display:"block",marginBottom:6}}>📋 메모 붙여넣기 → 자동 파싱</label><textarea value={memo} onChange={e=>setMemo(e.target.value)} rows={5} style={{...iS,resize:"vertical",fontFamily:"monospace",fontSize:12,marginBottom:8,background:"#fff"}}/><button onClick={()=>{const r=parseMemo(memo);setParsed(r);setParseMsg("✓ 파싱 완료!");}} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>🔍 자동 파싱</button>{parseMsg&&<span style={{fontSize:12,color:"#10b981",marginLeft:10,fontWeight:600}}>{parseMsg}</span>}</div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>상호명 *</label><input value={parsed.name} onChange={e=>setParsed(p=>({...p,name:e.target.value}))} style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>전화번호</label><input value={parsed.phone} onChange={e=>setParsed(p=>({...p,phone:e.target.value}))} style={{...iS}}/></div></div>
    <div style={{marginBottom:8}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>플레이스 링크</label><input value={parsed.link} onChange={e=>setParsed(p=>({...p,link:e.target.value}))} placeholder="https://..." style={{...iS}}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>상품내역</label><textarea value={parsed.products} onChange={e=>setParsed(p=>({...p,products:e.target.value}))} rows={3} style={{...iS,resize:"vertical",fontFamily:"inherit"}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>서비스내역</label><textarea value={parsed.services} onChange={e=>setParsed(p=>({...p,services:e.target.value}))} rows={3} style={{...iS,resize:"vertical",fontFamily:"inherit"}}/></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>총금액</label><input value={parsed.total} onChange={e=>setParsed(p=>({...p,total:e.target.value}))} placeholder="00만원" style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>담당자</label><input value={parsed.manager} onChange={e=>setParsed(p=>({...p,manager:e.target.value}))} placeholder="담당자 이름" style={{...iS}}/></div></div>
    <div style={{marginBottom:8}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>특이사항</label><input value={parsed.notes} onChange={e=>setParsed(p=>({...p,notes:e.target.value}))} style={{...iS}}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>계약 시작일 *</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>계약 종료일 *</label><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{...iS}}/></div></div>
    <div style={{background:"#f0fdf4",borderRadius:10,padding:"9px 14px",marginBottom:12,fontSize:12,color:"#166534"}}>📅 [온보딩] 시작일 · [관리전화] 영업일 10일 간격 · [리포트] 종료 3영업일 전</div>
    <div style={{display:"flex",gap:8}}><button onClick={()=>{if(!parsed.name.trim()||!startDate||!endDate)return alert("상호명과 계약 기간은 필수입니다.");if(startDate>=endDate)return alert("종료일이 시작일보다 늦어야 합니다.");onSubmit({...parsed,startDate,endDate,id:initial?.id||uid()});}} style={{flex:1,background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:14,fontWeight:600,cursor:"pointer"}}>{initial?.id?"저장":"등록하기"}</button><button onClick={onCancel} style={{background:"#f3f4f6",color:"#6b7280",border:"none",borderRadius:10,padding:"10px 16px",fontSize:14,cursor:"pointer"}}>취소</button></div>
  </div>);
}

/* ── Report Card ── */
function ReportCard({report,targets,timeslot}){
  const[open,setOpen]=useState(false);const tms=[{key:"calls",label:"콜수",unit:"콜"},{key:"materials",label:"자료수",unit:"개"},{key:"retarget",label:"재통픽스",unit:"개"}];const others=METRICS.filter(m=>!tms.find(t=>t.key===m.key));const avg=Math.round(tms.reduce((s,m)=>{const t=targets[m.key];return t?s+Math.min(100,(report[m.key]||0)/t*100):s;},0)/tms.length);const cc=avg>=100?"#10b981":avg>=70?"#f59e0b":"#2563eb";
  return(<div style={{background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",overflow:"hidden",marginBottom:8}}><div onClick={()=>setOpen(v=>!v)} style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}><div style={{width:44,height:44,borderRadius:"50%",background:cc+"18",border:`2.5px solid ${cc}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontWeight:800,fontSize:13,color:cc}}>{avg}%</span></div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{report.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{timeslot}</div></div><div style={{display:"flex",gap:12}}>{tms.map(m=>{const v=report[m.key]||0,t=targets[m.key];const pp=t?Math.min(100,Math.round(v/t*100)):0;return(<div key={m.key} style={{textAlign:"center"}}><div style={{fontSize:10,color:"#9ca3af"}}>{m.label}</div><div style={{fontSize:13,fontWeight:800,color:pp>=100?"#10b981":pp>=70?"#f59e0b":"#2563eb"}}>{pp}%</div></div>);})}</div><span style={{fontSize:11,color:"#c4c4c4"}}>{open?"▲":"▼"}</span></div>{open&&<div style={{borderTop:"1px solid #f3f4f6",padding:"14px 16px"}}><div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>{tms.map(m=>{const v=report[m.key]||0,t=targets[m.key];const pp=t?Math.min(100,Math.round(v/t*100)):0;return(<div key={m.key}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:600}}>{m.label}</span><span style={{fontSize:12,fontWeight:700,color:pp>=100?"#10b981":pp>=70?"#f59e0b":"#2563eb"}}>{v}/{t}{m.unit} ({pp}%)</span></div><div style={{background:"#e5e7eb",borderRadius:99,height:7}}><div style={{width:`${pp}%`,background:pp>=100?"#10b981":pp>=70?"#f59e0b":"#2563eb",borderRadius:99,height:"100%"}}/></div></div>);})}</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>{others.map(m=>(<div key={m.key} style={{background:"#f8fafc",borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,color:"#9ca3af"}}>{m.label}</div><div style={{fontSize:18,fontWeight:800}}>{report[m.key]||0}</div></div>))}</div></div>}</div>);
}

/* ── Ranking Tab ── */
function RankingTab({contracts,profiles,accounts}){
  const now=new Date();
  const[selYear,setSelYear]=useState(now.getFullYear());
  const[selMonth,setSelMonth]=useState(now.getMonth()+1);
  const managerStats=useMemo(()=>{
    const map={};
    contracts.forEach(c=>{
      if(!c.manager||!c.startDate)return;
      const[y,m]=c.startDate.split("-");
      if(parseInt(y)!==selYear||parseInt(m)!==selMonth)return;
      if(!map[c.manager])map[c.manager]={name:c.manager,count:0,amount:0};
      map[c.manager].count++;
      map[c.manager].amount+=parseAmount(c.total);
    });
    return Object.values(map).sort((a,b)=>b.amount-a.amount);
  },[contracts,selYear,selMonth]);

  const top=managerStats.slice(0,3);
  const rest=managerStats.slice(3);

  // 포디움 순서: 2등 - 1등 - 3등
  const podium=[
    {rank:2,size:100,height:120,color:"#94a3b8",bg:"linear-gradient(135deg,#f1f5f9,#e2e8f0)",border:"#94a3b8"},
    {rank:1,size:140,height:160,color:"#f59e0b",bg:"linear-gradient(135deg,#fef9c3,#fde68a)",border:"#f59e0b"},
    {rank:3,size:80,height:90,color:"#b45309",bg:"linear-gradient(135deg,#fef3c7,#fde68a)",border:"#b45309"},
  ];
  const medals=["🥇","🥈","🥉"];

  return(
    <div>
      {/* 월 선택 */}
      <div style={{background:"#fff",borderRadius:14,padding:"14px 20px",marginBottom:20,border:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:12}}>
        <select value={selYear} onChange={e=>setSelYear(parseInt(e.target.value))} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:13,background:"#fff"}}>
          {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={selMonth} onChange={e=>setSelMonth(parseInt(e.target.value))} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:13,background:"#fff"}}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
        </select>
        <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>{selYear}년 {selMonth}월 매출 랭킹</span>
      </div>

      {managerStats.length===0?(
        <div style={{background:"#fff",borderRadius:14,padding:"60px 20px",border:"1px solid #e2e8f0",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>🏆</div>
          <div style={{fontSize:14,color:"#9ca3af"}}>이 달 계약 데이터가 없습니다</div>
        </div>
      ):(
        <>
          {/* 포디움 */}
          <div style={{background:"linear-gradient(160deg,#1e3a8a,#2563eb)",borderRadius:20,padding:"32px 20px 0",marginBottom:16,overflow:"hidden"}}>
            <div style={{textAlign:"center",fontSize:16,fontWeight:800,color:"#fff",marginBottom:24,letterSpacing:1}}>🏆 {selYear}년 {selMonth}월 TOP 3</div>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:12}}>
              {podium.map(({rank,size,height,color,bg,border})=>{
                const s=top[rank-1];
                if(!s)return <div key={rank} style={{width:size+40,height:height+size+60}}/>;
                return(
                  <div key={rank} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
                    {/* 아바타 */}
                    <div style={{position:"relative",marginBottom:8}}>
                      <div style={{width:size,height:size,borderRadius:"50%",border:`4px solid ${border}`,overflow:"hidden",boxShadow:`0 0 0 4px rgba(255,255,255,0.2), 0 8px 24px rgba(0,0,0,0.3)`}}>
                        {profiles[s.name]
                          ?<img src={profiles[s.name]} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={s.name}/>
                          :<div style={{width:"100%",height:"100%",background:ACOLORS[s.name.charCodeAt(0)%ACOLORS.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:800,color:"#fff"}}>{s.name.slice(0,1)}</div>
                        }
                      </div>
                      <div style={{position:"absolute",bottom:-4,right:-4,width:28,height:28,borderRadius:"50%",background:bg,border:`2px solid ${border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{medals[rank-1]}</div>
                    </div>
                    <div style={{fontSize:rank===1?14:12,fontWeight:800,color:"#fff",marginBottom:2}}>{s.name}</div>
                    <div style={{fontSize:rank===1?13:11,color:"rgba(255,255,255,0.8)",marginBottom:8}}>{fmtAmount(s.amount)}</div>
                    {/* 단상 */}
                    <div style={{width:size+40,height:height,background:bg,borderRadius:"12px 12px 0 0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:"0 -4px 12px rgba(0,0,0,0.2)"}}>
                      <div style={{fontSize:rank===1?32:24,fontWeight:900,color:color}}>{rank}</div>
                      <div style={{fontSize:11,color:"#374151",fontWeight:600}}>{s.count}건</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4등 이하 */}
          {rest.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {rest.map((s,i)=>(
                <div key={s.name} style={{background:"#fff",borderRadius:14,padding:"14px 18px",border:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:32,height:32,borderRadius:8,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#64748b",flexShrink:0}}>{i+4}</div>
                  <Avatar name={s.name} img={profiles[s.name]} size={40} border="2px solid #e5e7eb"/>
                  <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{s.name}</div></div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#374151"}}>{fmtAmount(s.amount)}</div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>{s.count}건</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 미참여자 */}
          {accounts.filter(a=>!managerStats.find(s=>s.name===a.name)).length>0&&(
            <div style={{marginTop:12,background:"#f8fafc",borderRadius:12,padding:"12px 16px",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:12,color:"#9ca3af",marginBottom:8}}>이달 계약 없음</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {accounts.filter(a=>!managerStats.find(s=>s.name===a.name)).map(a=>(
                  <div key={a.name} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",borderRadius:8,padding:"5px 10px",border:"1px solid #e5e7eb"}}>
                    <Avatar name={a.name} img={profiles[a.name]} size={22} border="1px solid #e5e7eb"/>
                    <span style={{fontSize:12,color:"#6b7280"}}>{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Admin Tab ── */
function AdminTab({projectCategories,setProjectCategories,targets,setTargets,accounts,setAccounts,webhookUrl,setWebhookUrl,allData,loadAllData,loadingAll,contracts,navOrder,setNavOrder}){
  const[newProjInput,setNewProjInput]=useState("");
  const[newAccName,setNewAccName]=useState("");const[newAccPw,setNewAccPw]=useState("");
  const[editTargets,setEditTargets]=useState(targets);
  const[section,setSection]=useState("accounts");
  const iS={border:"1px solid #e2e8f0",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none"};

  const addProject=async()=>{const v=newProjInput.trim();if(!v||projectCategories.includes(v))return;const list=[...projectCategories,v];await st.set("config:projects",list);setProjectCategories(list);setNewProjInput("");};
  const removeProject=async name=>{const list=projectCategories.filter(p=>p!==name);await st.set("config:projects",list);setProjectCategories(list);};
  const addAccount=async()=>{if(!newAccName.trim()||!newAccPw.trim())return;const list=await st.get("accounts:all")||[];if(list.find(a=>a.name===newAccName.trim()))return alert("이미 존재하는 이름입니다.");list.push({name:newAccName.trim(),password:newAccPw.trim()});await st.set("accounts:all",list);setAccounts(list);setNewAccName("");setNewAccPw("");};
  const delAccount=async name=>{const list=(await st.get("accounts:all")||[]).filter(a=>a.name!==name);await st.set("accounts:all",list);setAccounts(list);};
  const saveTargets=async()=>{await st.set("wt:targets",editTargets);setTargets({...editTargets});alert("저장되었습니다!");};
  const saveWebhook=async()=>{await st.set("wt:webhook",webhookUrl);alert("저장되었습니다!");};

  const SECTIONS=[{id:"accounts",label:"👥 계정관리"},{id:"projects",label:"📁 프로젝트"},{id:"targets",label:"🎯 목표 설정"},{id:"webhook",label:"🔔 알림 설정"},{id:"monthly",label:"📊 월별 매출현황"},{id:"history",label:"📂 누적 데이터"},{id:"navorder",label:"📌 메뉴 순서"}];

  // 월별 사원별 집계
  const monthlyStats=useMemo(()=>{
    const map={};
    contracts.forEach(c=>{if(!c.manager||!c.startDate)return;const[y,m]=c.startDate.split("-");const key=`${y}-${m}`;if(!map[key])map[key]={label:`${y}년 ${parseInt(m)}월`,managers:{}};if(!map[key].managers[c.manager])map[key].managers[c.manager]={count:0,amount:0};map[key].managers[c.manager].count++;map[key].managers[c.manager].amount+=parseAmount(c.total);});
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,v])=>({key:k,label:v.label,managers:v.managers}));
  },[contracts]);

  return(
    <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:20}}>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {SECTIONS.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{textAlign:"left",padding:"10px 14px",borderRadius:10,border:"none",background:section===s.id?"#eff6ff":"transparent",color:section===s.id?"#2563eb":"#374151",fontWeight:section===s.id?600:400,fontSize:13,cursor:"pointer"}}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #e2e8f0"}}>
        {section==="accounts"&&(
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#111827",marginBottom:16}}>👥 사원 계정 관리</div>
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              <input value={newAccName} onChange={e=>setNewAccName(e.target.value)} placeholder="사원 이름" style={{...iS,flex:1,minWidth:100}}/>
              <input type="password" value={newAccPw} onChange={e=>setNewAccPw(e.target.value)} placeholder="비밀번호" style={{...iS,flex:1,minWidth:100}}/>
              <button onClick={addAccount} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ 생성</button>
            </div>
            {accounts.length===0?<p style={{fontSize:13,color:"#9ca3af",textAlign:"center"}}>등록된 사원 계정이 없습니다</p>
              :<div style={{display:"flex",flexDirection:"column",gap:6}}>{accounts.map(a=>(<div key={a.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8fafc",borderRadius:10,padding:"10px 14px"}}><span style={{fontWeight:600,fontSize:13}}>👤 {a.name}</span><button onClick={()=>delAccount(a.name)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:13}}>✕ 삭제</button></div>))}</div>}
          </div>
        )}
        {section==="projects"&&(
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>📁 프로젝트 카테고리</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input value={newProjInput} onChange={e=>setNewProjInput(e.target.value)} placeholder="새 프로젝트명" onKeyDown={e=>e.key==="Enter"&&addProject()} style={{...iS,flex:1}}/>
              <button onClick={addProject} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ 추가</button>
            </div>
            {projectCategories.length===0?<p style={{fontSize:13,color:"#9ca3af",textAlign:"center"}}>등록된 프로젝트가 없습니다</p>
              :<div style={{display:"flex",flexDirection:"column",gap:6}}>{projectCategories.map(p=>(<div key={p} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8fafc",borderRadius:10,padding:"10px 14px"}}><span style={{fontWeight:600,fontSize:13}}>📁 {p}</span><button onClick={()=>removeProject(p)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:13}}>✕</button></div>))}</div>}
          </div>
        )}
        {section==="targets"&&(
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>🎯 업무보고 목표 설정</div>
            {[{key:"calls",label:"목표 콜수",unit:"콜"},{key:"materials",label:"목표 자료수",unit:"개"},{key:"retarget",label:"목표 재통픽스",unit:"개"}].map(({key,label,unit})=>(
              <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <label style={{fontSize:13,fontWeight:600,color:"#374151",minWidth:120}}>{label}</label>
                <input type="number" min="0" value={editTargets[key]} onChange={e=>setEditTargets(t=>({...t,[key]:parseInt(e.target.value)||0}))} style={{...iS,width:90}}/>
                <span style={{fontSize:12,color:"#9ca3af"}}>{unit}</span>
              </div>
            ))}
            <button onClick={saveTargets} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:10,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>💾 저장</button>
          </div>
        )}
        {section==="webhook"&&(
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔔 Discord 알림 설정</div>
            <p style={{fontSize:13,color:"#374151",marginBottom:10}}>사원 실적 제출 시 Discord 웹훅으로 알림 전송</p>
            <div style={{display:"flex",gap:8}}>
              <input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." style={{...iS,flex:1,fontSize:12}}/>
              <button onClick={saveWebhook} style={{background:"#5865F2",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>저장</button>
            </div>
          </div>
        )}
        {section==="monthly"&&(
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>📊 월별 사원별 매출 현황</div>
            {monthlyStats.length===0?<p style={{fontSize:13,color:"#9ca3af",textAlign:"center",padding:"20px 0"}}>계약 데이터가 없습니다</p>
              :monthlyStats.map(ms=>(
                <div key={ms.key} style={{marginBottom:20}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#0f172a",padding:"8px 12px",background:"#f0f5ff",borderRadius:8,marginBottom:8}}>{ms.label}</div>
                  {Object.entries(ms.managers).sort((a,b)=>b[1].amount-a[1].amount).map(([name,stat],ri)=>(
                    <div key={name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:ri===0?"#fffbeb":"#f8fafc",borderRadius:10,marginBottom:6,border:ri===0?"1px solid #fde68a":"1px solid #f1f5f9"}}>
                      <span style={{fontSize:16}}>{ri===0?"🥇":ri===1?"🥈":ri===2?"🥉":`${ri+1}위`}</span>
                      <span style={{fontWeight:600,fontSize:13,flex:1}}>{name}</span>
                      <span style={{fontSize:13,color:"#2563eb",fontWeight:600}}>{stat.count}건</span>
                      <span style={{fontSize:13,color:"#7c3aed",fontWeight:700}}>{fmtAmount(stat.amount)}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"flex-end",gap:16,padding:"8px 12px",borderTop:"1px solid #e2e8f0",fontSize:12,color:"#6b7280"}}>
                    <span>합계: <b style={{color:"#2563eb"}}>{Object.values(ms.managers).reduce((s,m)=>s+m.count,0)}건</b></span>
                    <span><b style={{color:"#7c3aed"}}>{fmtAmount(Object.values(ms.managers).reduce((s,m)=>s+m.amount,0))}</b></span>
                  </div>
                </div>
              ))
            }
          </div>
        )}
        {section==="history"&&(
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>📂 업무보고 누적 데이터</div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <button onClick={loadAllData} disabled={loadingAll} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{loadingAll?"불러오는 중…":"📂 데이터 불러오기"}</button>
              {Object.keys(allData).length>0&&<button onClick={()=>{const wb=XLSX.utils.book_new();Object.entries(allData).sort().forEach(([date,tsByDate])=>{Object.entries(tsByDate).forEach(([ts,reps])=>{const headers=["이름","콜수","콜시간(분)","자료수","토스","재통픽스","긍정백톡","부정백톡"];const rows=reps.map(r=>[r.name,r.calls||0,r.callTime||0,r.materials||0,r.toss||0,r.retarget||0,r.positive||0,r.negative||0]);const tot=["합계",...METRICS.map(m=>reps.reduce((s,r)=>s+(r[m.key]||0),0))];const ws=XLSX.utils.aoa_to_sheet([headers,...rows,tot]);XLSX.utils.book_append_sheet(wb,ws,`${date} ${ts}`.slice(0,31));});});XLSX.writeFile(wb,"업무보고_전체.xlsx");}} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>📥 엑셀 저장</button>}
            </div>
            {Object.entries(allData).sort().reverse().map(([date,tsByDate])=>(<div key={date} style={{marginBottom:16}}><div style={{fontWeight:700,fontSize:13,padding:"7px 12px",background:"#f3f4f6",borderRadius:8,marginBottom:8}}>📅 {date}</div>{Object.entries(tsByDate).map(([ts,reps])=>(<div key={ts} style={{marginBottom:10}}><div style={{fontWeight:600,fontSize:12,color:"#7c3aed",marginBottom:5}}>⏰ {ts} ({reps.length}명)</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:480}}><thead><tr style={{background:"#f8fafc"}}><th style={{padding:"6px 10px",textAlign:"left",color:"#6b7280",fontWeight:600,borderBottom:"2px solid #e2e8f0"}}>이름</th>{METRICS.map(m=><th key={m.key} style={{padding:"6px 6px",textAlign:"center",color:"#6b7280",fontWeight:600,borderBottom:"2px solid #e2e8f0",whiteSpace:"nowrap"}}>{m.label}</th>)}</tr></thead><tbody>{reps.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f3f4f6"}}><td style={{padding:"6px 10px",fontWeight:700}}>{r.name}</td>{METRICS.map(m=><td key={m.key} style={{padding:"6px 6px",textAlign:"center"}}>{r[m.key]||0}</td>)}</tr>))}<tr style={{background:"#eff6ff",fontWeight:700}}><td style={{padding:"6px 10px",color:"#2563eb"}}>합계</td>{METRICS.map(m=><td key={m.key} style={{padding:"6px 6px",textAlign:"center",color:"#2563eb"}}>{reps.reduce((s,r)=>s+(r[m.key]||0),0)}</td>)}</tr></tbody></table></div></div>))}</div>))}
            {Object.keys(allData).length===0&&!loadingAll&&<p style={{fontSize:13,color:"#9ca3af",textAlign:"center",padding:"16px 0"}}>버튼을 눌러 데이터를 불러오세요</p>}
          </div>
        )}
        {section==="navorder"&&(
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>📌 메뉴 순서 설정</div>
            <p style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>드래그 대신 위/아래 버튼으로 순서를 바꾸세요</p>
            {(()=>{
              const NAV_LABELS={list:"📋 목록",calendar:"📅 캘린더",contracts:"🤝 계약관리",report:"📊 업무보고",ranking:"🏆 매출 랭킹"};
              const move=async(idx,dir)=>{
                const arr=[...navOrder];
                const swap=idx+dir;
                if(swap<0||swap>=arr.length)return;
                [arr[idx],arr[swap]]=[arr[swap],arr[idx]];
                await st.set("config:navOrder",arr);
                setNavOrder(arr);
              };
              return navOrder.map((id,i)=>(
                <div key={id} style={{display:"flex",alignItems:"center",gap:10,background:"#f8fafc",borderRadius:10,padding:"10px 14px",marginBottom:6,border:"1px solid #e2e8f0"}}>
                  <span style={{fontSize:13,fontWeight:600,flex:1,color:"#374151"}}>{NAV_LABELS[id]}</span>
                  <button onClick={()=>move(i,-1)} disabled={i===0} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px",cursor:i===0?"not-allowed":"pointer",color:i===0?"#d1d5db":"#374151",fontSize:12}}>▲</button>
                  <button onClick={()=>move(i,1)} disabled={i===navOrder.length-1} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px",cursor:i===navOrder.length-1?"not-allowed":"pointer",color:i===navOrder.length-1?"#d1d5db":"#374151",fontSize:12}}>▼</button>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════ MAIN APP ══════════ */
function MainApp({user,onLogout}){
  const[tasks,setTasks]=useState([]);const[loadingTasks,setLoadingTasks]=useState(true);
  const[navOrder,setNavOrder]=useState(["list","calendar","contracts","report","ranking"]);
  const[editTaskData,setEditTaskData]=useState(null);const[form,setForm]=useState(EF(user.isAdmin));const[showForm,setShowForm]=useState(false);
  const[contracts,setContracts]=useState([]);const[showCF,setShowCF]=useState(false);const[editContract,setEditContract]=useState(null);
  const[completions,setCompletions]=useState({});
  const[profiles,setProfiles]=useState({});
  const[showProfile,setShowProfile]=useState(false);
  const[calY,setCalY]=useState(new Date().getFullYear());const[calM,setCalM]=useState(new Date().getMonth());
  const[calFilter,setCalFilter]=useState("all");const[selectedDay,setSelectedDay]=useState(null);
  const[fOwner,setFOwner]=useState("all");const[fStatus,setFStatus]=useState("all");const[fPriority,setFPriority]=useState("all");const[fProject,setFProject]=useState("all");
  const[showAllTasks,setShowAllTasks]=useState(false);
  const[tab,setTab]=useState("list");
  const[projectCategories,setProjectCategories]=useState([]);
  const[timeslots,setTimeslots]=useState([]);const[selTs,setSelTs]=useState("");const[tsReports,setTsReports]=useState([]);
  const[myR,setMyR]=useState({calls:"",callTime:"",materials:"",toss:"",retarget:"",positive:"",negative:""});const[myTs,setMyTs]=useState("");const[newTs,setNewTs]=useState("");
  const[targets,setTargets]=useState(DEF_TARGETS);
  const[loadingR,setLoadingR]=useState(false);const[submitting,setSubmitting]=useState(false);const[submitMsg,setSubmitMsg]=useState("");
  const[webhookUrl,setWebhookUrl]=useState("");
  const[allData,setAllData]=useState({});const[loadingAll,setLoadingAll]=useState(false);
  const[accounts,setAccounts]=useState([]);

  useEffect(()=>{
    const link=document.createElement('link');link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@700;900&display=swap';
    document.head.appendChild(link);
    loadTasks();loadContracts();loadSettings();loadCompletions();loadProfiles();loadProjectCategories();loadAccounts();
  },[]);
  useEffect(()=>{if(selTs)loadReports(selTs);},[selTs]);

  const loadTasks=async()=>{setLoadingTasks(true);if(user.isAdmin){const keys=await st.list("tasks:");const all=[];for(const k of keys){const items=await st.get(k)||[];items.forEach(t=>all.push({...t,_sk:k}));}setTasks(all);}else{const mine=await st.get(`tasks:${user.name}`)||[];const pub=await st.get("tasks:_pub")||[];setTasks([...mine.map(t=>({...t,_sk:`tasks:${user.name}`})),...pub.map(t=>({...t,_sk:"tasks:_pub"}))]);}setLoadingTasks(false);};
  const skForVis=v=>user.isAdmin?(v==="public"?"tasks:_pub":"tasks:_prv"):`tasks:${user.name}`;
  const submitTask=async()=>{if(!form.title.trim())return;const newSk=skForVis(form.visibility);if(editTaskData){const oldSk=editTaskData._sk;if(oldSk!==newSk){const old=await st.get(oldSk)||[];await st.set(oldSk,old.filter(t=>t.id!==editTaskData.id));const nw=await st.get(newSk)||[];await st.set(newSk,[...nw,{...form,id:editTaskData.id,owner:editTaskData.owner||user.name}]);}else{const items=await st.get(oldSk)||[];await st.set(oldSk,items.map(t=>t.id===editTaskData.id?{...form,id:t.id,owner:t.owner||user.name}:t));}}else{const items=await st.get(newSk)||[];await st.set(newSk,[...items,{...form,id:uid(),owner:user.name}]);}setForm(EF(user.isAdmin));setEditTaskData(null);setShowForm(false);await loadTasks();};
  const handleCycle=async t=>{if(!user.isAdmin&&(t._sk==="tasks:_pub"||t._sk==="tasks:_prv"))return;const o=["todo","doing","done"];const ns=o[(o.indexOf(t.status)+1)%3];const items=await st.get(t._sk)||[];await st.set(t._sk,items.map(x=>x.id===t.id?{...x,status:ns}:x));setTasks(prev=>prev.map(x=>(x.id===t.id&&x._sk===t._sk)?{...x,status:ns}:x));};
  const handleDelete=async t=>{const items=await st.get(t._sk)||[];await st.set(t._sk,items.filter(x=>x.id!==t.id));setTasks(prev=>prev.filter(x=>!(x.id===t.id&&x._sk===t._sk)));};
  const handleEditTask=t=>{setForm({title:t.title,project:t.project||"",priority:t.priority,status:t.status,due:t.due||"",memo:t.memo||"",visibility:t.visibility||"personal",repeat:t.repeat||"none",repeatDays:t.repeatDays||[]});setEditTaskData(t);setShowForm(true);setTab("list");};
  const loadContracts=async()=>{const c=await st.get("contracts:all")||[];setContracts(c);};
  const saveContract=async c=>{const list=await st.get("contracts:all")||[];const idx=list.findIndex(x=>x.id===c.id);if(idx>=0)list[idx]=c;else list.push(c);await st.set("contracts:all",list);setContracts([...list]);setShowCF(false);setEditContract(null);};
  const deleteContract=async id=>{const list=(await st.get("contracts:all")||[]).filter(c=>c.id!==id);await st.set("contracts:all",list);setContracts(list);};
  const loadCompletions=async()=>{const c=await st.get("ce:completions")||{};setCompletions(c);};
  const toggleCE=async e=>{const data=await st.get("ce:completions")||{};const k=ceKey(e);data[k]=!data[k];await st.set("ce:completions",data);setCompletions({...data});};
  const loadProfiles=async()=>{const p=await st.get("profiles:all")||{};setProfiles(p);};
  const updateProfile=async(name,img)=>{const p=await st.get("profiles:all")||{};p[name]=img;await st.set("profiles:all",p);setProfiles({...p});};
  const loadProjectCategories=async()=>{const p=await st.get("config:projects")||[];setProjectCategories(p);};
  const loadAccounts=async()=>{const a=await st.get("accounts:all")||[];setAccounts(a);};
  const loadSettings=async()=>{const t=await st.get("wt:targets");if(t)setTargets(t);const w=await st.get("wt:webhook");if(w)setWebhookUrl(w);const no=await st.get("config:navOrder");if(no)setNavOrder(no);const ts=await st.get("wt:ts:fixed")||[];setTimeslots(ts);if(ts.length>0){setSelTs(ts[ts.length-1]);setMyTs(ts[ts.length-1]);}};
  const addTimeslot=async()=>{const ts=newTs.trim();if(!ts)return;const list=await st.get("wt:ts:fixed")||[];if(!list.includes(ts)){list.push(ts);await st.set("wt:ts:fixed",list);setTimeslots(list);}setSelTs(ts);setMyTs(ts);setNewTs("");};
  const removeTimeslot=async ts=>{const list=(await st.get("wt:ts:fixed")||[]).filter(t=>t!==ts);await st.set("wt:ts:fixed",list);setTimeslots(list);if(selTs===ts)setSelTs(list[list.length-1]||"");if(myTs===ts)setMyTs(list[list.length-1]||"");};
  const loadReports=async ts=>{setLoadingR(true);const keys=await st.list(`wr:${todayStr}:${san(ts)}:`);const rows=[];for(const k of keys){const r=await st.get(k);if(r)rows.push(r);}setTsReports(rows);setLoadingR(false);};
  const submitReport=async()=>{if(!myTs)return;setSubmitting(true);setSubmitMsg("");const data={name:user.name,timeslot:myTs,...Object.fromEntries(METRICS.map(m=>[m.key,parseInt(myR[m.key])||0]))};const ok=await st.set(`wr:${todayStr}:${san(myTs)}:${san(user.name)}`,data);if(ok){const wh=await st.get("wt:webhook");if(wh)await sendNotif(wh,user.name,myTs,data,targets);setSelTs(myTs);await loadReports(myTs);setSubmitMsg("✓ 제출 완료!");}else setSubmitMsg("❌ 오류 발생");setSubmitting(false);};
  const loadAllData=async()=>{setLoadingAll(true);const keys=await st.list("wr:");const byDate={};for(const k of keys){const r=await st.get(k);if(r){const date=k.split(":")[1]||todayStr;const ts=r.timeslot||"미분류";if(!byDate[date])byDate[date]={};if(!byDate[date][ts])byDate[date][ts]=[];byDate[date][ts].push(r);}}setAllData(byDate);setLoadingAll(false);};
  const filterCE=useCallback(evts=>user.isAdmin?evts:evts.filter(e=>!e.manager||e.manager===user.name),[user]);

  const owners=useMemo(()=>[...new Set(tasks.filter(t=>t._sk!=="tasks:_pub"&&t._sk!=="tasks:_prv").map(t=>t.owner).filter(Boolean))]  ,[tasks]);
  const filtered=useMemo(()=>tasks.filter(t=>{if(fOwner!=="all"&&t.owner!==fOwner)return false;if(fStatus!=="all"&&t.status!==fStatus)return false;if(fPriority!=="all"&&t.priority!==fPriority)return false;if(fProject!=="all"&&t.project!==fProject)return false;return true;}),[tasks,fOwner,fStatus,fPriority,fProject]);
  const weekDays=useMemo(()=>getWeekDays(),[]);
  const visibleContracts=useMemo(()=>user.isAdmin?contracts:contracts.filter(c=>c.manager===user.name),[contracts,user]);
  const allCE=useMemo(()=>visibleContracts.flatMap(genEvents),[visibleContracts]);
  const todayCE=useMemo(()=>filterCE(allCE.filter(e=>e.date===todayStr&&(e.type==="관리전화"||e.type==="리포트"))),[allCE,filterCE]);
  const todayTasks=useMemo(()=>filtered.filter(t=>isActiveOnDate(t,todayStr)&&t.status!=="done").sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority])),[filtered]);
  const allCEFiltered=useMemo(()=>filterCE(allCE.filter(e=>e.type==="관리전화"||e.type==="리포트")),[allCE,filterCE]);
  const allItems=useMemo(()=>[...filtered.map(t=>({...t,_itemType:"task"})),...allCEFiltered.map(e=>({...e,_itemType:"ce",due:e.date}))].sort((a,b)=>!a.due?1:!b.due?-1:a.due.localeCompare(b.due)),[filtered,allCEFiltered]);
  const calTasksExp=useMemo(()=>expandForMonth(filtered,calY,calM),[filtered,calY,calM]);
  const calCE=useMemo(()=>filterCE(allCE.filter(e=>e.date.startsWith(`${calY}-${String(calM+1).padStart(2,"0")}`))),[allCE,calY,calM,filterCE]);
  const tasksByDay=useMemo(()=>{const m={};if(calFilter!=="contracts")calTasksExp.forEach(t=>{if(t.due){const d=parseInt(t.due.slice(8));if(!m[d])m[d]={t:[],e:[]};m[d].t.push(t);}});if(calFilter!=="tasks")calCE.forEach(e=>{const d=parseInt(e.date.slice(8));if(!m[d])m[d]={t:[],e:[]};m[d].e.push(e);});return m;},[calTasksExp,calCE,calFilter]);
  const selDayTasks=useMemo(()=>calTasksExp.filter(t=>t.due===selectedDay),[calTasksExp,selectedDay]);
  const selDayCE=useMemo(()=>calCE.filter(e=>e.date===selectedDay),[calCE,selectedDay]);
  const done=tasks.filter(t=>t.status==="done").length;const pct=tasks.length?Math.round(done/tasks.length*100):0;
  const firstDay=new Date(calY,calM,1).getDay();const dim=new Date(calY,calM+1,0).getDate();
  const cells=[...Array(firstDay).fill(null),...Array.from({length:dim},(_,i)=>i+1)];while(cells.length%7)cells.push(null);
  const resetFilters=()=>{setFOwner("all");setFStatus("all");setFPriority("all");setFProject("all");};
  const hasFilter=fOwner!=="all"||fStatus!=="all"||fPriority!=="all"||fProject!=="all";
  const iS2={border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 10px",fontSize:12,background:"#fff",cursor:"pointer"};

  if(loadingTasks)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"#9ca3af"}}>불러오는 중…</p></div>;

  return(
    <div style={{display:"flex",minHeight:"100vh",fontFamily:"'Inter',sans-serif",background:"#f0f5ff"}}>
      {showProfile&&<ProfileModal user={user} profiles={profiles} onUpdateProfile={updateProfile} onClose={()=>setShowProfile(false)} contracts={contracts}/>}
      <Sidebar tab={tab} setTab={setTab} user={user} onLogout={onLogout} contracts={contracts} profiles={profiles} onOpenProfile={()=>setShowProfile(true)} navOrder={navOrder} setNavOrder={setNavOrder}/>

      <div style={{flex:1,minWidth:0,overflowY:"auto"}}>
        <div style={{background:"#fff",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #e2e8f0",position:"sticky",top:0,zIndex:50}}>
          <div style={{fontSize:16,fontWeight:800,color:"#0f172a"}}>
            {tab==="list"&&"📋 작업 목록"}{tab==="calendar"&&"📅 캘린더"}{tab==="contracts"&&"🤝 계약 관리"}{tab==="report"&&"📊 업무 보고"}{tab==="ranking"&&"🏆 매출 랭킹"}{tab==="admin"&&"🔒 관리자 설정"}
          </div>
          <div style={{display:"flex",gap:8}}>
            {tab==="list"&&<button onClick={()=>{setEditTaskData(null);setForm(EF(user.isAdmin));setShowForm(v=>!v);}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ 새 작업</button>}
            {tab==="contracts"&&user.isAdmin&&<button onClick={()=>{setEditContract(null);setShowCF(v=>!v);}} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ 계약 등록</button>}
          </div>
        </div>

        <div style={{padding:"20px 24px"}}>
          {/* 진행률 */}
          {tab!=="admin"&&tab!=="ranking"&&(
            <div style={{background:"#fff",borderRadius:14,padding:"14px 20px",marginBottom:20,border:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:20}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#64748b"}}>전체 작업 진행률</span><span style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>{done}/{tasks.length} 완료 ({pct}%)</span></div>
                <div style={{background:"#e2e8f0",borderRadius:99,height:6}}><div style={{width:`${pct}%`,background:"linear-gradient(90deg,#2563eb,#60a5fa)",borderRadius:99,height:"100%",transition:"width .4s"}}/></div>
              </div>
              <div style={{display:"flex",gap:16,flexShrink:0}}>
                {Object.entries(S).map(([k,v])=>(<div key={k} style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:v.color}}>{tasks.filter(t=>t.status===k).length}</div><div style={{fontSize:10,color:"#94a3b8"}}>{v.label}</div></div>))}
                <div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:"#7c3aed"}}>{visibleContracts.length}</div><div style={{fontSize:10,color:"#94a3b8"}}>계약</div></div>
              </div>
            </div>
          )}

          {/* ══ LIST ══ */}
          {tab==="list"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {showForm&&<TaskForm form={form} setForm={setForm} onSubmit={submitTask} onCancel={()=>{setShowForm(false);setEditTaskData(null);setForm(EF(user.isAdmin));}} isEdit={!!editTaskData} isAdminUser={user.isAdmin} projectCategories={projectCategories}/>}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {user.isAdmin&&owners.length>0&&<select value={fOwner} onChange={e=>setFOwner(e.target.value)} style={iS2}><option value="all">전체 사원</option>{owners.map(o=><option key={o} value={o}>{o}</option>)}</select>}
                <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={iS2}><option value="all">전체 상태</option>{Object.entries(S).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
                <select value={fPriority} onChange={e=>setFPriority(e.target.value)} style={iS2}><option value="all">전체 우선순위</option>{Object.entries(P).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
                <select value={fProject} onChange={e=>setFProject(e.target.value)} style={iS2}><option value="all">전체 프로젝트</option>{projectCategories.map(p=><option key={p} value={p}>{p}</option>)}</select>
                {hasFilter&&<button onClick={resetFilters} style={{border:"1px solid #fca5a5",borderRadius:8,padding:"6px 10px",fontSize:12,background:"#fff7f7",color:"#ef4444",cursor:"pointer"}}>초기화</button>}
              </div>
              {/* 오늘 */}
              <div style={{background:"#fff",borderRadius:14,padding:"16px 18px",border:"1px solid #e2e8f0"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="#ef4444" strokeWidth="1.3"/><path d="M6.5 3.5v3l2 1.5" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/></svg><span style={{fontSize:13,fontWeight:700}}>오늘 할 일</span><span style={{background:"#fef2f2",color:"#ef4444",borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:700}}>{todayTasks.length+todayCE.length}</span></div>
                {todayTasks.length===0&&todayCE.length===0?<div style={{textAlign:"center",padding:"16px 0",color:"#9ca3af",fontSize:13}}>오늘 할 일이 없습니다 🎉</div>
                  :<div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {todayCE.map((e,i)=>{const c=visibleContracts.find(x=>x.id===e.cid);return c?<ContractEventCard key={i} event={e} contract={c} isDone={!!completions[ceKey(e)]} onToggle={()=>toggleCE(e)}/>:null;})}
                    {todayTasks.map(t=><TaskCard key={t.id+t._sk} task={t} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||t.owner===user.name}/>)}
                  </div>}
              </div>
              {/* 이번 주 */}
              <div style={{background:"#fff",borderRadius:14,padding:"16px 18px",border:"1px solid #e2e8f0"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1.5" width="11" height="10" rx="1.5" stroke="#2563eb" strokeWidth="1.3"/><path d="M4 1v2M9 1v2M1 5h11" stroke="#2563eb" strokeWidth="1.3" strokeLinecap="round"/></svg><span style={{fontSize:13,fontWeight:700}}>이번 주</span></div>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{weekDays[0].slice(5).replace("-","/")} – {weekDays[4].slice(5).replace("-","/")}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {weekDays.map(ds=>{
                    const isToday=ds===todayStr;const dow=new Date(ds+"T00:00:00").getDay();
                    const dayTasks=filtered.filter(t=>isActiveOnDate(t,ds));
                    const dayCE=filterCE(allCE.filter(e=>e.date===ds&&(e.type==="관리전화"||e.type==="리포트")));
                    const all=[...dayCE,...dayTasks];
                    return(
                      <div key={ds} style={{background:isToday?"#eff6ff":"#f8fafc",border:`1.5px solid ${isToday?"#bfdbfe":"#e2e8f0"}`,borderRadius:12,padding:"10px 8px",minHeight:90,boxSizing:"border-box"}}>
                        <div style={{textAlign:"center",marginBottom:6}}>
                          {isToday?<div style={{width:22,height:22,background:"#2563eb",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 2px",fontSize:11,fontWeight:800,color:"#fff"}}>{DAYS_KR[dow]}</div>:<div style={{fontSize:11,fontWeight:700,color:"#64748b"}}>{DAYS_KR[dow]}</div>}
                          <div style={{fontSize:10,color:isToday?"#93c5fd":"#9ca3af"}}>{ds.slice(5).replace("-","/")}</div>
                        </div>
                        {all.length===0&&<div style={{fontSize:9,color:"#d1d5db",textAlign:"center"}}>없음</div>}
                        {all.slice(0,3).map((item,i)=>{
                          if(item.type&&CE[item.type]){const ce=CE[item.type];return <div key={i} title={`[${item.type}] ${item.name}`} style={{fontSize:9,background:ce.bg,color:ce.color,borderRadius:4,padding:"2px 5px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:700}}>[{item.type[0]}] {item.name}</div>;}
                          return <div key={i} title={item.title} style={{fontSize:9,background:P[item.priority].bg,color:P[item.priority].color,borderRadius:4,padding:"2px 5px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,textDecoration:item.status==="done"?"line-through":"none"}}>{item.title}</div>;
                        })}
                        {all.length>3&&<div style={{fontSize:9,color:"#9ca3af",textAlign:"center"}}>+{all.length-3}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 전체 */}
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                <div onClick={()=>setShowAllTasks(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 4h9M2 7h7M2 10h5" stroke="#6b7280" strokeWidth="1.3" strokeLinecap="round"/></svg><span style={{fontSize:13,fontWeight:700}}>전체 할 일</span><span style={{background:"#f3f4f6",color:"#6b7280",borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:700}}>{allItems.length}개</span></div>
                  <span style={{fontSize:11,fontWeight:600,color:"#2563eb",background:"#eff6ff",borderRadius:7,padding:"4px 10px"}}>{showAllTasks?"숨기기 ▲":"전체보기 ▼"}</span>
                </div>
                {showAllTasks&&<div style={{borderTop:"1px solid #f1f5f9",padding:"12px 18px",display:"flex",flexDirection:"column",gap:7}}>
                  {allItems.length===0?<div style={{textAlign:"center",padding:"16px 0",color:"#9ca3af",fontSize:13}}>작업이 없습니다</div>
                    :allItems.map((item,i)=>{if(item._itemType==="ce"){const c=visibleContracts.find(x=>x.id===item.cid);return c?<ContractEventCard key={i} event={item} contract={c} isDone={!!completions[ceKey(item)]} onToggle={()=>toggleCE(item)}/>:null;}return <TaskCard key={item.id+item._sk} task={item} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||item.owner===user.name}/>;})
                  }
                </div>}
              </div>
            </div>
          )}

          {/* ══ CALENDAR ══ */}
          {tab==="calendar"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #e2e8f0"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <button onClick={()=>{let m=calM-1,y=calY;if(m<0){m=11;y--;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:17}}>‹</button>
                  <div style={{fontWeight:800,fontSize:17,color:"#0f172a"}}>{calY}년 {calM+1}월</div>
                  <button onClick={()=>{let m=calM+1,y=calY;if(m>11){m=0;y++;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:17}}>›</button>
                </div>
                <div style={{display:"flex",gap:6,marginBottom:14,justifyContent:"center"}}>
                  {[["all","전체"],["tasks","일반 일정"],["contracts","계약업체"]].map(([v,l])=>(<button key={v} onClick={()=>setCalFilter(v)} style={{border:`1.5px solid ${calFilter===v?"#2563eb":"#e2e8f0"}`,borderRadius:99,padding:"5px 14px",fontSize:12,fontWeight:600,cursor:"pointer",background:calFilter===v?"#eff6ff":"#fff",color:calFilter===v?"#2563eb":"#6b7280"}}>{l}</button>))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
                  {DAYS_KR.map((d,i)=>(<div key={d} style={{textAlign:"center",fontSize:12,fontWeight:700,color:i===0?"#ef4444":i===6?"#2563eb":"#9ca3af",padding:"5px 0"}}>{d}</div>))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                  {cells.map((day,i)=>{
                    if(!day)return <div key={i}/>;
                    const ds=`${calY}-${String(calM+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                    const isToday=ds===todayStr;const isSel=selectedDay===ds;const dow=(firstDay+day-1)%7;
                    const cell=tasksByDay[day]||{t:[],e:[]};const allCellItems=[...cell.e.map(e=>({...e,_ce:true})),...cell.t];
                    return(
                      <div key={i} onClick={()=>setSelectedDay(isSel?null:ds)} style={{height:90,background:isSel?"#eff6ff":isToday?"#f0f9ff":"#fff",border:`1.5px solid ${isSel?"#2563eb":isToday?"#93c5fd":"#e2e8f0"}`,borderRadius:10,padding:"6px 5px",cursor:"pointer",overflow:"hidden",boxSizing:"border-box"}}>
                        <div style={{fontSize:12,fontWeight:isToday?800:500,color:isToday?"#2563eb":dow===0?"#ef4444":dow===6?"#3b82f6":"#374151",marginBottom:3,textAlign:"center"}}>
                          {isToday?<span style={{background:"#2563eb",color:"#fff",borderRadius:"50%",padding:"1px 6px"}}>{day}</span>:day}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {allCellItems.slice(0,3).map((item,ti)=>{
                            const iD=item._ce?!!completions[ceKey(item)]:item.status==="done";
                            const label=item._ce?`[${item.type[0]}] ${item.name}`:`${item._ir?"🔄":""}${item.title}`;
                            const bg=item._ce?CE[item.type].bg:P[item.priority].bg;
                            const color=item._ce?CE[item.type].color:P[item.priority].color;
                            return <div key={ti} title={label} style={{fontSize:10,background:bg,color,borderRadius:4,padding:"1px 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:item._ce?700:600,textDecoration:iD?"line-through":"none",opacity:iD?0.6:1}}>{label}</div>;
                          })}
                          {allCellItems.length>3&&<div style={{fontSize:9,color:"#9ca3af",textAlign:"center"}}>+{allCellItems.length-3}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {selectedDay&&(
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                  <div style={{padding:"14px 20px",borderBottom:"1px solid #e2e8f0",background:selectedDay===todayStr?"#eff6ff":"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:700,fontSize:14}}>{new Date(selectedDay+"T00:00:00").toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"})}</span>{selectedDay===todayStr&&<span style={{fontSize:11,color:"#2563eb",fontWeight:600,background:"#eff6ff",borderRadius:99,padding:"2px 8px"}}>오늘</span>}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:12,color:"#9ca3af"}}>{selDayTasks.length+selDayCE.length}개</span><button onClick={()=>setSelectedDay(null)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:16}}>✕</button></div>
                  </div>
                  <div style={{padding:"16px 20px"}}>
                    {selDayTasks.length===0&&selDayCE.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#9ca3af",fontSize:13}}>이 날 일정이 없어요</div>
                      :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:8}}>
                        {selDayCE.map((e,i)=>{const c=visibleContracts.find(x=>x.id===e.cid);return c?<ContractEventCard key={i} event={e} contract={c} isDone={!!completions[ceKey(e)]} onToggle={()=>toggleCE(e)}/>:null;})}
                        {selDayTasks.map(t=><TaskCard key={t.id+(t._sk||"")} task={t} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||t.owner===user.name}/>)}
                      </div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ CONTRACTS ══ */}
          {tab==="contracts"&&(
            <div>
              {showCF&&<ContractForm initial={editContract} onSubmit={saveContract} onCancel={()=>{setShowCF(false);setEditContract(null);}}/>}
              {visibleContracts.length===0&&!showCF?<div style={{textAlign:"center",padding:"48px 0",color:"#9ca3af",fontSize:13,background:"#fff",borderRadius:14,border:"1px solid #e2e8f0"}}>{user.isAdmin?"등록된 계약업체가 없습니다.":"담당 계약업체가 없습니다."}</div>
              :<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{visibleContracts.map(c=>{const evts=genEvents(c);const isActive=c.endDate>=todayStr;const nextCall=evts.filter(e=>e.type==="관리전화"&&e.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date))[0];const rpt=evts.find(e=>e.type==="리포트");return(
                <div key={c.id} style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:16,opacity:isActive?1:0.65}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:800,fontSize:15}}>{c.name}</span><Badge label={isActive?"진행중":"종료"} color={isActive?"#10b981":"#9ca3af"} bg={isActive?"#d1fae5":"#f3f4f6"}/></div><div style={{fontSize:12,color:"#64748b",marginTop:3}}>📅 {c.startDate} ~ {c.endDate}</div></div>
                    {user.isAdmin&&<div style={{display:"flex",gap:4}}><button onClick={()=>{setEditContract(c);setShowCF(true);}} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:13}}>✏️</button><button onClick={()=>deleteContract(c.id)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:13}}>✕</button></div>}
                  </div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>{c.phone&&<span style={{fontSize:12}}>📞 {c.phone}</span>}{c.total&&<span style={{fontSize:12}}>💰 {c.total}</span>}{c.link&&<a href={c.link} target="_blank" rel="noreferrer" style={{fontSize:12,color:"#2563eb"}}>🔗 링크</a>}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{nextCall&&<Badge label={`📞 ${nextCall.date}`} color="#16a34a" bg="#dcfce7"/>}{rpt&&<Badge label={`📋 ${rpt.date}`} color="#7c3aed" bg="#f5f3ff"/>}{c.notes&&<Badge label={`📌 ${c.notes}`} color="#6b7280" bg="#f3f4f6"/>}</div>
                </div>
              );})}</div>}
            </div>
          )}

          {/* ══ REPORT ══ */}
          {tab==="report"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e2e8f0"}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>⏰ 보고 타임</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:timeslots.length?10:0}}>
                    {timeslots.map(ts=>(<div key={ts} style={{display:"flex",alignItems:"center",gap:2}}><button onClick={()=>setSelTs(ts)} style={{border:`2px solid ${selTs===ts?"#7c3aed":"#e2e8f0"}`,borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer",background:selTs===ts?"#f5f3ff":"#fff",color:selTs===ts?"#7c3aed":"#374151"}}>{ts}</button>{user.isAdmin&&<button onClick={()=>removeTimeslot(ts)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:12}}>✕</button>}</div>))}
                    {timeslots.length===0&&<span style={{fontSize:13,color:"#9ca3af"}}>관리자가 타임을 추가해야 합니다</span>}
                  </div>
                  {user.isAdmin&&<div style={{display:"flex",gap:8}}><input value={newTs} onChange={e=>setNewTs(e.target.value)} placeholder="새 타임 (예: 11시 타임)" onKeyDown={e=>e.key==="Enter"&&addTimeslot()} style={{flex:1,border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,outline:"none"}}/><button onClick={addTimeslot} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ 추가</button></div>}
                </div>
                <div style={{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e2e8f0"}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>✏️ 내 실적 입력</div>
                  {timeslots.length>0?(<><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>{timeslots.map(ts=><button key={ts} onClick={()=>setMyTs(ts)} style={{border:`2px solid ${myTs===ts?"#2563eb":"#e2e8f0"}`,borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer",background:myTs===ts?"#eff6ff":"#fff",color:myTs===ts?"#2563eb":"#374151"}}>{ts}</button>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>{METRICS.map(m=>(<div key={m.key}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>{m.label} ({m.unit}){targets[m.key]&&<span style={{color:"#2563eb"}}> · 목표 {targets[m.key]}</span>}</label><input type="number" min="0" value={myR[m.key]} onChange={e=>setMyR(r=>({...r,[m.key]:e.target.value}))} placeholder="0" style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>))}</div><button onClick={submitReport} disabled={submitting||!myTs} style={{width:"100%",background:myTs?"#2563eb":"#e5e7eb",color:myTs?"#fff":"#9ca3af",border:"none",borderRadius:10,padding:"11px",fontSize:14,fontWeight:700,cursor:myTs?"pointer":"not-allowed"}}>{submitting?"저장 중…":"실적 제출"}</button>{submitMsg&&<p style={{fontSize:12,color:submitMsg.startsWith("✓")?"#10b981":"#ef4444",textAlign:"center",margin:"8px 0 0",fontWeight:600}}>{submitMsg}</p>}</>):<p style={{fontSize:13,color:"#9ca3af",textAlign:"center",padding:"12px 0"}}>관리자가 타임을 먼저 추가해야 합니다</p>}
                </div>
              </div>
              <div>
                {selTs&&<div style={{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e2e8f0",marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontWeight:700,fontSize:13}}>👥 {selTs} 팀 현황 ({tsReports.length}명)</span><button onClick={()=>loadReports(selTs)} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"4px 10px",fontSize:12,cursor:"pointer"}}>🔄</button></div>{loadingR?<div style={{textAlign:"center",padding:"20px",color:"#9ca3af"}}>불러오는 중…</div>:tsReports.length===0?<div style={{textAlign:"center",padding:"20px",color:"#9ca3af",background:"#f8fafc",borderRadius:10}}>아직 제출된 실적이 없습니다</div>:tsReports.map((r,i)=><ReportCard key={i} report={r} targets={targets} timeslot={selTs}/>)}</div>}
              </div>
            </div>
          )}

          {/* ══ RANKING ══ */}
          {tab==="ranking"&&<RankingTab contracts={contracts} profiles={profiles} accounts={accounts}/>}

          {/* ══ ADMIN ══ */}
          {tab==="admin"&&user.isAdmin&&(
            <AdminTab
              projectCategories={projectCategories} setProjectCategories={setProjectCategories}
              targets={targets} setTargets={setTargets}
              accounts={accounts} setAccounts={setAccounts}
              webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
              allData={allData} loadAllData={loadAllData} loadingAll={loadingAll}
              contracts={contracts}
              navOrder={navOrder} setNavOrder={setNavOrder}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const[user,setUser]=useState(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{const u=ses.get();if(u)setUser(u);setLoading(false);},[]);
  const handleLogout=()=>{ses.del();setUser(null);};
  const handleLogin=u=>{ses.set(u);setUser(u);};
  if(loading)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif"}}><p style={{color:"#9ca3af"}}>불러오는 중…</p></div>;
  if(!user)return <LoginScreen onLogin={handleLogin}/>;
  return <MainApp user={user} onLogout={handleLogout}/>;
  }
