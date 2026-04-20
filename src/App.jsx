import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";

const METRICS=[{key:"calls",label:"콜수",unit:"콜"},{key:"callTime",label:"콜시간",unit:"분"},{key:"materials",label:"자료수",unit:"개"},{key:"toss",label:"토스",unit:"개"},{key:"retarget",label:"재통픽스",unit:"개"},{key:"positive",label:"긍정백톡",unit:"개"},{key:"negative",label:"부정백톡",unit:"개"}];
const DEF_TARGETS={calls:200,materials:25,retarget:4};
const ADMIN_PW="admin123";
const todayStr=new Date().toISOString().slice(0,10);
const uid=()=>Math.random().toString(36).slice(2,9);
const san=s=>s.replace(/[\s/\\'":]/g,"_").slice(0,50);
const P={high:{label:"높음",color:"#ef4444",bg:"#fef2f2"},medium:{label:"중간",color:"#f59e0b",bg:"#fffbeb"},low:{label:"낮음",color:"#10b981",bg:"#f0fdf4"}};
const S={todo:{label:"할 일",color:"#6b7280",bg:"#f3f4f6"},doing:{label:"진행 중",color:"#2563eb",bg:"#eff6ff"},done:{label:"완료",color:"#10b981",bg:"#d1fae5"}};
const CE={온보딩:{color:"#d97706",bg:"#fef3c7"},관리전화:{color:"#16a34a",bg:"#dcfce7"},리포트:{color:"#dc2626",bg:"#fee2e2"}};
const DAYS=["일","월","화","수","목","금","토"];
const EF=(isAdmin)=>({title:"",project:"",priority:"medium",status:"todo",due:"",memo:"",visibility:isAdmin?"public":"personal",repeat:"none",repeatDays:[]});

const st={
  get:async(k,sh=false)=>{try{const r=await window.storage.get(k,sh);return r?JSON.parse(r.value):null;}catch{return null;}},
  set:async(k,v,sh=false)=>{try{await window.storage.set(k,JSON.stringify(v),sh);return true;}catch{return false;}},
  del:async(k,sh=false)=>{try{await window.storage.delete(k,sh);}catch{}},
  list:async(p,sh=false)=>{try{const r=await window.storage.list(p,sh);return r?.keys||[];}catch{return[];}},
};

const addBizDays=(ds,n)=>{let d=new Date(ds+"T00:00:00"),c=0;while(c<n){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6)c++;}return d.toISOString().slice(0,10);};
const subBizDays=(ds,n)=>{let d=new Date(ds+"T00:00:00"),c=0;while(c<n){d.setDate(d.getDate()-1);if(d.getDay()!==0&&d.getDay()!==6)c++;}return d.toISOString().slice(0,10);};

const genEvents=c=>{
  if(!c.startDate||!c.endDate)return[];
  const rptDate=subBizDays(c.endDate,5);
  const evts=[{type:"온보딩",date:c.startDate,cid:c.id,name:c.name}];
  let cur=c.startDate;
  while(true){cur=addBizDays(cur,10);if(cur>=rptDate)break;evts.push({type:"관리전화",date:cur,cid:c.id,name:c.name});}
  if(rptDate>c.startDate)evts.push({type:"리포트",date:rptDate,cid:c.id,name:c.name});
  return evts;
};
const ceKey=e=>`${e.cid}:${e.type}:${e.date}`;

const parseMemo=text=>{
  const line=key=>{const m=text.match(new RegExp(key+'\\s*[:\\s]\\s*([^\\n]+)'));return m?m[1].trim():'';};
  const section=(start,ends)=>{const lines=text.split('\n');let cap=false,res=[];for(const l of lines){if(l.includes(start)&&!l.includes('▪')){cap=true;continue;}if(cap&&ends.some(e=>l.includes(e)&&!l.includes('▪')))break;if(cap&&l.trim())res.push(l.trim());}return res.join('\n');};
  return{name:line('상호명'),phone:line('번호'),link:line('플레이스 링크'),products:section('상품내역',['서비스내역','결제정보','담당자']),services:section('서비스내역',['결제정보','담당자','특이사항']),total:line('총금액'),notes:line('특이사항')};
};

const sendNotif=async(url,name,ts,data,targets)=>{
  if(!url?.startsWith("http"))return;
  const lines=METRICS.map(m=>{const v=data[m.key]||0,t=targets[m.key];return`• ${m.label}: **${v}${m.unit}**${t?` / ${t}${m.unit} (${Math.round(v/t*100)}%)`:''}`;});
  try{await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"업무보고 알림",content:`📊 **[${ts}] ${name}** 실적 제출\n${lines.join('\n')}`})});}catch{}
};

/* ── 반복 레이블 ── */
const repeatLabel=t=>{
  if(!t.repeat||t.repeat==="none")return null;
  if(t.repeat==="weekly")return`🔄 매주 ${DAYS[new Date(t.due+"T00:00:00").getDay()]}`;
  if(t.repeat==="monthly")return`🔄 매월 ${parseInt(t.due.slice(8))}일`;
  if(t.repeat==="weekdays")return"🔄 평일";
  if(t.repeat==="custom")return`🔄 ${(t.repeatDays||[]).sort().map(d=>DAYS[d]).join("·")}`;
  return null;
};

/* ── isActiveToday (시작일 이후만) ── */
const isActiveToday=t=>{
  if(!t.due)return false;
  if(t.due>todayStr)return false; // 시작일 이전은 표시 안 함
  const now=new Date();const dow=now.getDay();
  if(!t.repeat||t.repeat==="none")return t.due===todayStr;
  if(t.repeat==="weekly")return new Date(t.due+"T00:00:00").getDay()===dow;
  if(t.repeat==="monthly")return parseInt(t.due.slice(8))===now.getDate();
  if(t.repeat==="weekdays")return dow>=1&&dow<=5;
  if(t.repeat==="custom")return(t.repeatDays||[]).includes(dow);
  return false;
};

/* ── expandForMonth (시작일 이후만) ── */
const expandForMonth=(tasks,y,m)=>{
  const dim=new Date(y,m+1,0).getDate(),res=[];
  tasks.forEach(t=>{
    if(!t.due||!t.repeat||t.repeat==="none"){res.push(t);return;}
    const startDate=t.due;
    if(t.repeat==="weekly"){
      const dow=new Date(t.due+"T00:00:00").getDay();
      for(let d=1;d<=dim;d++){
        const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        if(date<startDate)continue;
        if(new Date(y,m,d).getDay()===dow)res.push({...t,id:t.id+"-w"+d,due:date,_ir:true});
      }
    }else if(t.repeat==="monthly"){
      const day=parseInt(t.due.slice(8));
      if(day<=dim){
        const date=`${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        if(date>=startDate)res.push({...t,due:date,_ir:true});
      }
    }else if(t.repeat==="weekdays"){
      for(let d=1;d<=dim;d++){
        const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        if(date<startDate)continue;
        const dow=new Date(y,m,d).getDay();
        if(dow>=1&&dow<=5)res.push({...t,id:t.id+"-wd"+d,due:date,_ir:true});
      }
    }else if(t.repeat==="custom"){
      const days=t.repeatDays||[];
      for(let d=1;d<=dim;d++){
        const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        if(date<startDate)continue;
        if(days.includes(new Date(y,m,d).getDay()))res.push({...t,id:t.id+"-c"+d,due:date,_ir:true});
      }
    }
  });
  return res;
};

/* ── UI Atoms ── */
const Badge=({label,color,bg})=><span style={{fontSize:11,fontWeight:600,color,background:bg,borderRadius:6,padding:"2px 7px",whiteSpace:"nowrap"}}>{label}</span>;
const SecHead=({title,count,color="#2563eb"})=>(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}><span style={{fontWeight:700,fontSize:14,color}}>{title}</span>{count!=null&&<span style={{background:color+"22",color,borderRadius:99,padding:"1px 9px",fontSize:12,fontWeight:700}}>{count}</span>}</div>);
const Sel=({value,onChange,opts,placeholder})=>(<select value={value} onChange={e=>onChange(e.target.value)} style={{border:"1px solid #e5e7eb",borderRadius:8,padding:"6px 10px",fontSize:12,background:"#fff",cursor:"pointer"}}><option value="all">{placeholder}</option>{Object.entries(opts).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>);

/* ── Login ── */
function LoginScreen({onLogin}){
  const[name,setName]=useState("");const[pw,setPw]=useState("");const[isAdmin,setIsAdmin]=useState(false);const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const go=async()=>{if(!name.trim())return setErr("이름을 입력하세요");if(!pw.trim())return setErr("비밀번호를 입력하세요");setLoading(true);if(isAdmin){if(pw!==ADMIN_PW){setErr("비밀번호가 틀렸습니다");setLoading(false);return;}await st.set("ses:user",{name:name.trim(),isAdmin:true});onLogin({name:name.trim(),isAdmin:true});}else{const accounts=await st.get("accounts:all",true)||[];const acc=accounts.find(a=>a.name===name.trim()&&a.password===pw);if(!acc){setErr("이름 또는 비밀번호가 틀렸습니다");setLoading(false);return;}await st.set("ses:user",{name:name.trim(),isAdmin:false});onLogin({name:name.trim(),isAdmin:false});}setLoading(false);};
  const iS={border:"1px solid #e5e7eb",borderRadius:10,padding:"11px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"};
  return(<div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}><div style={{background:"#fff",borderRadius:20,padding:32,width:"100%",maxWidth:360,border:"1px solid #e5e7eb",boxShadow:"0 4px 24px rgba(0,0,0,0.06)"}}><div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:36,marginBottom:8}}>📋</div><h2 style={{margin:0,fontSize:21,fontWeight:800,color:"#111827"}}>업무 관리 시스템</h2><p style={{margin:"6px 0 0",fontSize:13,color:"#9ca3af"}}>로그인하여 시작하세요</p></div><div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,marginBottom:18,gap:3}}>{[{v:false,l:"👤 사원"},{v:true,l:"🔒 관리자"}].map(({v,l})=>(<button key={String(v)} onClick={()=>{setIsAdmin(v);setErr("");}} style={{flex:1,border:"none",borderRadius:8,padding:"8px",fontSize:13,fontWeight:600,cursor:"pointer",background:isAdmin===v?"#fff":"transparent",color:isAdmin===v?"#111827":"#9ca3af"}}>{l}</button>))}</div><div style={{display:"flex",flexDirection:"column",gap:10}}><input value={name} onChange={e=>setName(e.target.value)} placeholder="이름" onKeyDown={e=>e.key==="Enter"&&go()} style={iS}/><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="비밀번호" onKeyDown={e=>e.key==="Enter"&&go()} style={iS}/>{err&&<p style={{margin:0,fontSize:12,color:"#ef4444",textAlign:"center"}}>{err}</p>}<button onClick={go} disabled={loading} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"12px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:4}}>{loading?"확인 중…":"로그인"}</button></div></div></div>);
}

/* ── Task Card ── */
function TaskCard({task,onCycle,onDelete,onEdit,showOwner,canEdit}){
  const[exp,setExp]=useState(false);const p=P[task.priority],s=S[task.status],isDone=task.status==="done";const isOver=task.due&&!isDone&&!task._ir&&task.due<todayStr;const isPub=task.visibility==="public",isPrv=task.visibility==="private";
  const rl=repeatLabel(task);
  return(<div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:`1px solid ${isDone?"#d1fae5":isPub?"#bfdbfe":isPrv?"#fde68a":"#e5e7eb"}`,opacity:isDone?0.7:1}}><div style={{display:"flex",alignItems:"flex-start",gap:10}}><button onClick={()=>canEdit&&onCycle(task)} style={{flexShrink:0,marginTop:1,width:24,height:24,borderRadius:"50%",border:`2px solid ${s.color}`,background:isDone?"#10b981":task.status==="doing"?"#eff6ff":"#fff",cursor:canEdit?"pointer":"default",fontSize:11,color:s.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{isDone?"✓":task.status==="doing"?"▶":""}</button><div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:14,fontWeight:600,color:isDone?"#9ca3af":"#111827",textDecoration:isDone?"line-through":"none"}}>{task.title}</span><Badge label={p.label} color={p.color} bg={p.bg}/><Badge label={s.label} color={s.color} bg={s.bg}/>{rl&&<Badge label={rl} color="#7c3aed" bg="#f5f3ff"/>}{isPub&&<Badge label="📢 전체공개" color="#1d4ed8" bg="#dbeafe"/>}{isPrv&&<Badge label="🔒 비공개" color="#92400e" bg="#fef3c7"/>}</div><div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>{showOwner&&task.owner&&<span style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>👤 {task.owner}</span>}{task.project&&<span style={{fontSize:12,color:"#6b7280"}}>📁 {task.project}</span>}{task.due&&<span style={{fontSize:12,color:isOver?"#ef4444":"#9ca3af"}}>{isOver?"⚠️ ":"📅 "}{task.due}{task._ir?" (반복)":""}</span>}{task.memo&&<button onClick={()=>setExp(v=>!v)} style={{fontSize:11,color:"#a855f7",background:"#faf5ff",border:"none",borderRadius:5,padding:"1px 6px",cursor:"pointer"}}>📝 메모</button>}</div>{exp&&task.memo&&<div style={{marginTop:6,background:"#faf5ff",borderRadius:8,padding:"7px 10px",fontSize:12,color:"#6b21a8",borderLeft:"3px solid #d8b4fe"}}>{task.memo}</div>}</div>{canEdit&&!task._ir&&<div style={{display:"flex",gap:2,flexShrink:0}}><button onClick={()=>onEdit(task)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",padding:3,fontSize:13}}>✏️</button><button onClick={()=>onDelete(task)} style={{background:"none",border:"none",color:"#d1d5db",cursor:"pointer",padding:3,fontSize:13}}>✕</button></div>}</div></div>);
}

/* ── Contract Event Card ── */
function ContractEventCard({event,contract,isDone,onToggle}){
  const[exp,setExp]=useState(false);const ce=CE[event.type];
  return(<div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:`1.5px solid ${ce.color}40`,borderLeft:`4px solid ${ce.color}`,opacity:isDone?0.65:1}}><div style={{display:"flex",alignItems:"flex-start",gap:10}}><button onClick={onToggle} style={{flexShrink:0,marginTop:1,width:24,height:24,borderRadius:"50%",border:`2px solid ${isDone?"#10b981":ce.color}`,background:isDone?"#10b981":ce.bg,cursor:"pointer",fontSize:11,color:isDone?"#fff":ce.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{isDone?"✓":""}</button><div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:14,fontWeight:700,color:isDone?"#9ca3af":"#111827",textDecoration:isDone?"line-through":"none"}}>[{event.type}] {contract.name}</span><Badge label="계약업체" color={ce.color} bg={ce.bg}/></div><div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>{contract.phone&&<span style={{fontSize:12,color:"#6b7280"}}>📞 {contract.phone}</span>}{event.date&&<span style={{fontSize:12,color:"#9ca3af"}}>📅 {event.date}</span>}{contract.total&&<span style={{fontSize:12,color:"#6b7280"}}>💰 {contract.total}</span>}<button onClick={()=>setExp(v=>!v)} style={{fontSize:11,color:ce.color,background:ce.bg,border:"none",borderRadius:5,padding:"1px 7px",cursor:"pointer"}}>{exp?"접기":"상세"}</button></div>{exp&&<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>{contract.link&&<a href={contract.link} target="_blank" rel="noreferrer" style={{fontSize:12,color:"#2563eb",wordBreak:"break-all"}}>🔗 {contract.link}</a>}{contract.products&&<div style={{fontSize:12,color:"#374151",background:"#f8fafc",borderRadius:6,padding:"6px 8px",whiteSpace:"pre-line"}}><b>상품:</b>{"\n"}{contract.products}</div>}{contract.services&&<div style={{fontSize:12,color:"#374151",background:"#f8fafc",borderRadius:6,padding:"6px 8px",whiteSpace:"pre-line"}}><b>서비스:</b>{"\n"}{contract.services}</div>}{contract.notes&&<div style={{fontSize:12,color:"#6b7280"}}>📌 {contract.notes}</div>}</div>}</div></div></div>);
}

/* ── Repeat Picker (새 컴포넌트) ── */
function RepeatPicker({repeat,repeatDays,due,onChange}){
  const opts=[{v:"none",l:"반복 없음"},{v:"weekly",l:"🔄 매주"},{v:"monthly",l:"🔄 매월"},{v:"weekdays",l:"🔄 평일(월-금)"},{v:"custom",l:"🔄 요일 직접 설정"}];
  const toggleDay=d=>{const cur=repeatDays||[];const next=cur.includes(d)?cur.filter(x=>x!==d):[...cur,d];onChange("repeatDays",next);};
  // weekly 선택 시 due 날짜의 요일 표시
  const dueDow=due?DAYS[new Date(due+"T00:00:00").getDay()]:"";
  return(
    <div>
      <select value={repeat} onChange={e=>onChange("repeat",e.target.value)} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,background:"#fff",width:"100%"}}>
        {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      {repeat==="weekly"&&due&&<div style={{marginTop:6,fontSize:12,color:"#7c3aed",background:"#f5f3ff",borderRadius:8,padding:"5px 10px"}}>📅 매주 <b>{dueDow}요일</b> 반복 ({due} 부터)</div>}
      {repeat==="monthly"&&due&&<div style={{marginTop:6,fontSize:12,color:"#7c3aed",background:"#f5f3ff",borderRadius:8,padding:"5px 10px"}}>📅 매월 <b>{parseInt(due.slice(8))}일</b> 반복 ({due} 부터)</div>}
      {repeat==="weekdays"&&due&&<div style={{marginTop:6,fontSize:12,color:"#7c3aed",background:"#f5f3ff",borderRadius:8,padding:"5px 10px"}}>📅 월~금 평일 반복 ({due} 부터)</div>}
      {repeat==="custom"&&(
        <div style={{marginTop:8}}>
          <div style={{fontSize:12,color:"#6b7280",marginBottom:5}}>반복할 요일 선택 ({due} 부터)</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {DAYS.map((d,i)=>(
              <button key={i} onClick={()=>toggleDay(i)} style={{width:36,height:36,borderRadius:"50%",border:`2px solid ${(repeatDays||[]).includes(i)?"#7c3aed":"#e5e7eb"}`,background:(repeatDays||[]).includes(i)?"#7c3aed":"#fff",color:(repeatDays||[]).includes(i)?"#fff":"#374151",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                {d}
              </button>
            ))}
          </div>
          {(repeatDays||[]).length>0&&<div style={{marginTop:6,fontSize:12,color:"#7c3aed"}}>선택됨: {(repeatDays||[]).sort().map(d=>DAYS[d]).join(", ")}요일</div>}
        </div>
      )}
    </div>
  );
}

/* ── Task Form ── */
function TaskForm({form,setForm,onSubmit,onCancel,isEdit,isAdminUser}){
  const iS={border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
  const handleRepeat=(key,val)=>setForm(f=>({...f,[key]:val}));
  return(<div style={{background:"#fff",borderRadius:14,padding:18,marginBottom:14,border:"1px solid #bfdbfe"}}><p style={{margin:"0 0 12px",fontWeight:700,fontSize:14,color:"#1d4ed8"}}>{isEdit?"✏️ 작업 수정":"➕ 새 작업 추가"}</p><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="작업 제목 *" style={{...iS,marginBottom:8}}/><div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}><input value={form.project} onChange={e=>setForm(f=>({...f,project:e.target.value}))} placeholder="프로젝트명" style={{flex:1,minWidth:90,border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none"}}/><select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,background:"#fff"}}>{Object.entries(P).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,background:"#fff"}}>{Object.entries(S).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
  <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"flex-start"}}>
    <div style={{display:"flex",flexDirection:"column",gap:6,flex:1,minWidth:140}}>
      <label style={{fontSize:12,color:"#6b7280",fontWeight:600}}>시작 날짜</label>
      <input type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13}}/>
    </div>
    <div style={{flex:2,minWidth:180}}>
      <label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:6}}>반복 설정</label>
      <RepeatPicker repeat={form.repeat} repeatDays={form.repeatDays} due={form.due} onChange={handleRepeat}/>
    </div>
  </div>
  {isAdminUser&&<div style={{display:"flex",gap:4,marginBottom:8}}>{[{v:"public",l:"📢 전체공개",c:"#2563eb"},{v:"private",l:"🔒 비공개",c:"#92400e"}].map(({v,l,c})=>(<button key={v} onClick={()=>setForm(f=>({...f,visibility:v}))} style={{border:`2px solid ${form.visibility===v?c:"#e5e7eb"}`,borderRadius:10,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",background:form.visibility===v?c+"18":"#fff",color:form.visibility===v?c:"#9ca3af"}}>{l}</button>))}</div>}
  <textarea value={form.memo} onChange={e=>setForm(f=>({...f,memo:e.target.value}))} placeholder="메모 (선택사항)" rows={2} style={{...iS,resize:"vertical",marginBottom:10,fontFamily:"inherit"}}/><div style={{display:"flex",gap:8}}><button onClick={onSubmit} style={{flex:1,background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:14,fontWeight:600,cursor:"pointer"}}>{isEdit?"저장":"추가하기"}</button><button onClick={onCancel} style={{background:"#f3f4f6",color:"#6b7280",border:"none",borderRadius:10,padding:"10px 16px",fontSize:14,cursor:"pointer"}}>취소</button></div></div>);
}

/* ── Contract Form ── */
function ContractForm({initial,onSubmit,onCancel}){
  const blank={name:"",phone:"",link:"",products:"",services:"",total:"",notes:""};
  const[memo,setMemo]=useState("");const[parsed,setParsed]=useState(initial?{name:initial.name,phone:initial.phone,link:initial.link,products:initial.products,services:initial.services,total:initial.total,notes:initial.notes}:blank);
  const[startDate,setStartDate]=useState(initial?.startDate||"");const[endDate,setEndDate]=useState(initial?.endDate||"");const[parseMsg,setParseMsg]=useState("");
  const iS={border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
  const handleParse=()=>{if(!memo.trim())return;const r=parseMemo(memo);setParsed(r);setParseMsg("✓ 파싱 완료!");};
  const handleSubmit=()=>{if(!parsed.name.trim()||!startDate||!endDate)return alert("상호명과 계약 기간은 필수입니다.");if(startDate>=endDate)return alert("종료일이 시작일보다 늦어야 합니다.");onSubmit({...parsed,startDate,endDate,id:initial?.id||uid()});};
  return(<div style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #e5e7eb",marginBottom:14}}><p style={{margin:"0 0 14px",fontWeight:700,fontSize:14,color:"#111827"}}>{initial?.id?"✏️ 계약 수정":"➕ 계약업체 등록"}</p>{!initial?.id&&<div style={{marginBottom:14,background:"#f5f3ff",borderRadius:12,padding:14}}><label style={{fontSize:12,color:"#7c3aed",fontWeight:700,display:"block",marginBottom:6}}>📋 메모 붙여넣기 → 자동 파싱</label><textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="메모 내용을 여기에 붙여넣으세요..." rows={5} style={{...iS,resize:"vertical",fontFamily:"monospace",fontSize:12,marginBottom:8,background:"#fff"}}/><button onClick={handleParse} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>🔍 자동 파싱</button>{parseMsg&&<span style={{fontSize:12,color:"#10b981",marginLeft:10,fontWeight:600}}>{parseMsg}</span>}</div>}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>상호명 *</label><input value={parsed.name} onChange={e=>setParsed(p=>({...p,name:e.target.value}))} style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>전화번호</label><input value={parsed.phone} onChange={e=>setParsed(p=>({...p,phone:e.target.value}))} style={{...iS}}/></div></div><div style={{marginBottom:8}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>플레이스 링크</label><input value={parsed.link} onChange={e=>setParsed(p=>({...p,link:e.target.value}))} placeholder="https://..." style={{...iS}}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>상품내역</label><textarea value={parsed.products} onChange={e=>setParsed(p=>({...p,products:e.target.value}))} rows={3} style={{...iS,resize:"vertical",fontFamily:"inherit"}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>서비스내역</label><textarea value={parsed.services} onChange={e=>setParsed(p=>({...p,services:e.target.value}))} rows={3} style={{...iS,resize:"vertical",fontFamily:"inherit"}}/></div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>총금액</label><input value={parsed.total} onChange={e=>setParsed(p=>({...p,total:e.target.value}))} placeholder="00만원" style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>특이사항</label><input value={parsed.notes} onChange={e=>setParsed(p=>({...p,notes:e.target.value}))} style={{...iS}}/></div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>계약 시작일 *</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>계약 종료일 *</label><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{...iS}}/></div></div><div style={{background:"#f0fdf4",borderRadius:10,padding:"9px 14px",marginBottom:12,fontSize:12,color:"#166534"}}>📅 자동 생성: <b>[온보딩]</b> 시작일 · <b>[관리전화]</b> 영업일 10일 간격 (리포트 전까지) · <b>[리포트]</b> 종료 5영업일 전</div><div style={{display:"flex",gap:8}}><button onClick={handleSubmit} style={{flex:1,background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:14,fontWeight:600,cursor:"pointer"}}>{initial?.id?"저장":"등록하기"}</button><button onClick={onCancel} style={{background:"#f3f4f6",color:"#6b7280",border:"none",borderRadius:10,padding:"10px 16px",fontSize:14,cursor:"pointer"}}>취소</button></div></div>);
}

/* ── Report Card ── */
function ReportCard({report,targets,timeslot}){
  const[open,setOpen]=useState(false);const tms=[{key:"calls",label:"콜수",unit:"콜"},{key:"materials",label:"자료수",unit:"개"},{key:"retarget",label:"재통픽스",unit:"개"}];const others=METRICS.filter(m=>!tms.find(t=>t.key===m.key));const avg=Math.round(tms.reduce((s,m)=>{const t=targets[m.key];return t?s+Math.min(100,(report[m.key]||0)/t*100):s;},0)/tms.length);const cc=avg>=100?"#10b981":avg>=70?"#f59e0b":"#2563eb";
  return(<div style={{background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",overflow:"hidden",marginBottom:8}}><div onClick={()=>setOpen(v=>!v)} style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}><div style={{width:44,height:44,borderRadius:"50%",background:cc+"18",border:`2.5px solid ${cc}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontWeight:800,fontSize:13,color:cc}}>{avg}%</span></div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:"#111827"}}>{report.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{timeslot}</div></div><div style={{display:"flex",gap:12,flexShrink:0}}>{tms.map(m=>{const v=report[m.key]||0,t=targets[m.key];const p=t?Math.min(100,Math.round(v/t*100)):0;return(<div key={m.key} style={{textAlign:"center"}}><div style={{fontSize:10,color:"#9ca3af"}}>{m.label}</div><div style={{fontSize:13,fontWeight:800,color:p>=100?"#10b981":p>=70?"#f59e0b":"#2563eb"}}>{p}%</div><div style={{fontSize:10,color:"#9ca3af"}}>{v}{m.unit}</div></div>);})}</div><span style={{fontSize:11,color:"#c4c4c4"}}>{open?"▲":"▼"}</span></div>{open&&<div style={{borderTop:"1px solid #f3f4f6",padding:"14px 16px"}}><div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>{tms.map(m=>{const v=report[m.key]||0,t=targets[m.key];const p=t?Math.min(100,Math.round(v/t*100)):0;return(<div key={m.key}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{m.label}</span><span style={{fontSize:12,fontWeight:700,color:p>=100?"#10b981":p>=70?"#f59e0b":"#2563eb"}}>{v}/{t}{m.unit} ({p}%)</span></div><div style={{background:"#e5e7eb",borderRadius:99,height:7}}><div style={{width:`${p}%`,background:p>=100?"#10b981":p>=70?"#f59e0b":"#2563eb",borderRadius:99,height:"100%"}}/></div></div>);})}</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>{others.map(m=>(<div key={m.key} style={{background:"#f8fafc",borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,color:"#9ca3af"}}>{m.label}</div><div style={{fontSize:18,fontWeight:800,color:"#111827"}}>{report[m.key]||0}</div><div style={{fontSize:10,color:"#9ca3af"}}>{m.unit}</div></div>))}</div></div>}</div>);
}

/* ── Day Detail Panel ── */
function DayDetailPanel({date,tasks,ceItems,contracts,completions,onToggleCE,onCycle,onDelete,onEdit,isAdmin,user}){
  if(!date)return null;
  const label=new Date(date+"T00:00:00").toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});
  if(tasks.length===0&&ceItems.length===0)return(<div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:16,textAlign:"center",color:"#9ca3af",fontSize:13}}>📅 {label} — 일정 없음</div>);
  return(<div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:16}}><div style={{fontWeight:700,fontSize:14,color:"#111827",marginBottom:10}}>📅 {label}</div><div style={{display:"flex",flexDirection:"column",gap:7}}>{ceItems.map((e,i)=>{const c=contracts.find(x=>x.id===e.cid);return c?<ContractEventCard key={i} event={e} contract={c} isDone={!!completions[ceKey(e)]} onToggle={()=>onToggleCE(e)}/>:null;})}{tasks.map(t=><TaskCard key={t.id+t._sk} task={t} onCycle={onCycle} onDelete={onDelete} onEdit={onEdit} showOwner={isAdmin} canEdit={isAdmin||t.owner===user.name}/>)}</div></div>);
}

/* ══════════ MAIN APP ══════════ */
function MainApp({user,onLogout}){
  const[tasks,setTasks]=useState([]);const[loadingTasks,setLoadingTasks]=useState(true);
  const[editTaskData,setEditTaskData]=useState(null);const[form,setForm]=useState(EF(user.isAdmin));const[showForm,setShowForm]=useState(false);
  const[contracts,setContracts]=useState([]);const[showCF,setShowCF]=useState(false);const[editContract,setEditContract]=useState(null);
  const[completions,setCompletions]=useState({});
  const[calY,setCalY]=useState(new Date().getFullYear());const[calM,setCalM]=useState(new Date().getMonth());
  const[calFilter,setCalFilter]=useState("all");const[selectedDay,setSelectedDay]=useState(null);
  const[fOwner,setFOwner]=useState("all");const[fStatus,setFStatus]=useState("all");const[fPriority,setFPriority]=useState("all");const[fProject,setFProject]=useState("all");
  const[tab,setTab]=useState("list");
  const[timeslots,setTimeslots]=useState([]);const[selTs,setSelTs]=useState("");const[tsReports,setTsReports]=useState([]);
  const[myR,setMyR]=useState({calls:"",callTime:"",materials:"",toss:"",retarget:"",positive:"",negative:""});const[myTs,setMyTs]=useState("");const[newTs,setNewTs]=useState("");
  const[targets,setTargets]=useState(DEF_TARGETS);const[editTargets,setEditTargets]=useState(DEF_TARGETS);
  const[loadingR,setLoadingR]=useState(false);const[submitting,setSubmitting]=useState(false);const[submitMsg,setSubmitMsg]=useState("");
  const[webhookUrl,setWebhookUrl]=useState("");const[adminSec,setAdminSec]=useState("");
  const[allData,setAllData]=useState({});const[loadingAll,setLoadingAll]=useState(false);
  const[accounts,setAccounts]=useState([]);const[newAccName,setNewAccName]=useState("");const[newAccPw,setNewAccPw]=useState("");

  useEffect(()=>{loadTasks();loadContracts();loadSettings();loadCompletions();if(user.isAdmin)loadAccounts();},[]);
  useEffect(()=>{if(selTs)loadReports(selTs);},[selTs]);

  const loadTasks=async()=>{setLoadingTasks(true);if(user.isAdmin){const keys=await st.list("tasks:",true);const all=[];for(const k of keys){const items=await st.get(k,true)||[];items.forEach(t=>all.push({...t,_sk:k}));}setTasks(all);}else{const mine=await st.get(`tasks:${user.name}`,true)||[];const pub=await st.get("tasks:_pub",true)||[];setTasks([...mine.map(t=>({...t,_sk:`tasks:${user.name}`})),...pub.map(t=>({...t,_sk:"tasks:_pub"}))]);}setLoadingTasks(false);};
  const skForVis=v=>user.isAdmin?(v==="public"?"tasks:_pub":"tasks:_prv"):`tasks:${user.name}`;
  const submitTask=async()=>{if(!form.title.trim())return;const newSk=skForVis(form.visibility);if(editTaskData){const oldSk=editTaskData._sk;if(oldSk!==newSk){const old=await st.get(oldSk,true)||[];await st.set(oldSk,old.filter(t=>t.id!==editTaskData.id),true);const nw=await st.get(newSk,true)||[];await st.set(newSk,[...nw,{...form,id:editTaskData.id,owner:editTaskData.owner||user.name}],true);}else{const items=await st.get(oldSk,true)||[];await st.set(oldSk,items.map(t=>t.id===editTaskData.id?{...form,id:t.id,owner:t.owner||user.name}:t),true);}}else{const items=await st.get(newSk,true)||[];await st.set(newSk,[...items,{...form,id:uid(),owner:user.name}],true);}setForm(EF(user.isAdmin));setEditTaskData(null);setShowForm(false);await loadTasks();};
  const handleCycle=async t=>{if(!user.isAdmin&&(t._sk==="tasks:_pub"||t._sk==="tasks:_prv"))return;const o=["todo","doing","done"];const ns=o[(o.indexOf(t.status)+1)%3];const items=await st.get(t._sk,true)||[];await st.set(t._sk,items.map(x=>x.id===t.id?{...x,status:ns}:x),true);setTasks(prev=>prev.map(x=>(x.id===t.id&&x._sk===t._sk)?{...x,status:ns}:x));};
  const handleDelete=async t=>{const items=await st.get(t._sk,true)||[];await st.set(t._sk,items.filter(x=>x.id!==t.id),true);setTasks(prev=>prev.filter(x=>!(x.id===t.id&&x._sk===t._sk)));};
  const handleEditTask=t=>{setForm({title:t.title,project:t.project||"",priority:t.priority,status:t.status,due:t.due||"",memo:t.memo||"",visibility:t.visibility||"personal",repeat:t.repeat||"none",repeatDays:t.repeatDays||[]});setEditTaskData(t);setShowForm(true);setTab("list");};
  const loadContracts=async()=>{const c=await st.get("contracts:all",true)||[];setContracts(c);};
  const saveContract=async c=>{const list=await st.get("contracts:all",true)||[];const idx=list.findIndex(x=>x.id===c.id);if(idx>=0)list[idx]=c;else list.push(c);await st.set("contracts:all",list,true);setContracts([...list]);setShowCF(false);setEditContract(null);};
  const deleteContract=async id=>{const list=(await st.get("contracts:all",true)||[]).filter(c=>c.id!==id);await st.set("contracts:all",list,true);setContracts(list);};
  const allCE=useMemo(()=>contracts.flatMap(genEvents),[contracts]);
  const loadCompletions=async()=>{const c=await st.get("ce:completions",true)||{};setCompletions(c);};
  const toggleCE=async e=>{const data=await st.get("ce:completions",true)||{};const k=ceKey(e);data[k]=!data[k];await st.set("ce:completions",data,true);setCompletions({...data});};
  const loadSettings=async()=>{const t=await st.get("wt:targets",true);if(t){setTargets(t);setEditTargets(t);}const w=await st.get("wt:webhook",true);if(w)setWebhookUrl(w);const ts=await st.get("wt:ts:fixed",true)||[];setTimeslots(ts);if(ts.length>0){setSelTs(ts[ts.length-1]);setMyTs(ts[ts.length-1]);}};
  const loadAccounts=async()=>{const a=await st.get("accounts:all",true)||[];setAccounts(a);};
  const addAccount=async()=>{if(!newAccName.trim()||!newAccPw.trim())return;const list=await st.get("accounts:all",true)||[];if(list.find(a=>a.name===newAccName.trim()))return alert("이미 존재하는 이름입니다.");list.push({name:newAccName.trim(),password:newAccPw.trim()});await st.set("accounts:all",list,true);setAccounts(list);setNewAccName("");setNewAccPw("");};
  const delAccount=async name=>{const list=(await st.get("accounts:all",true)||[]).filter(a=>a.name!==name);await st.set("accounts:all",list,true);setAccounts(list);};
  const addTimeslot=async()=>{const ts=newTs.trim();if(!ts)return;const list=await st.get("wt:ts:fixed",true)||[];if(!list.includes(ts)){list.push(ts);await st.set("wt:ts:fixed",list,true);setTimeslots(list);}setSelTs(ts);setMyTs(ts);setNewTs("");};
  const removeTimeslot=async ts=>{const list=(await st.get("wt:ts:fixed",true)||[]).filter(t=>t!==ts);await st.set("wt:ts:fixed",list,true);setTimeslots(list);if(selTs===ts)setSelTs(list[list.length-1]||"");if(myTs===ts)setMyTs(list[list.length-1]||"");};
  const loadReports=async ts=>{setLoadingR(true);const keys=await st.list(`wr:${todayStr}:${san(ts)}:`,true);const rows=[];for(const k of keys){const r=await st.get(k,true);if(r)rows.push(r);}setTsReports(rows);setLoadingR(false);};
  const submitReport=async()=>{if(!myTs)return;setSubmitting(true);setSubmitMsg("");const data={name:user.name,timeslot:myTs,...Object.fromEntries(METRICS.map(m=>[m.key,parseInt(myR[m.key])||0]))};const ok=await st.set(`wr:${todayStr}:${san(myTs)}:${san(user.name)}`,data,true);if(ok){const wh=await st.get("wt:webhook",true);if(wh)await sendNotif(wh,user.name,myTs,data,targets);setSelTs(myTs);await loadReports(myTs);setSubmitMsg("✓ 제출 완료!");}else setSubmitMsg("❌ 오류 발생");setSubmitting(false);};
  const loadAllData=async()=>{setLoadingAll(true);const keys=await st.list("wr:",true);const byDate={};for(const k of keys){const r=await st.get(k,true);if(r){const date=k.split(":")[1]||todayStr;const ts=r.timeslot||"미분류";if(!byDate[date])byDate[date]={};if(!byDate[date][ts])byDate[date][ts]=[];byDate[date][ts].push(r);}}setAllData(byDate);setLoadingAll(false);};

  const owners=useMemo(()=>[...new Set(tasks.filter(t=>t._sk!=="tasks:_pub"&&t._sk!=="tasks:_prv").map(t=>t.owner).filter(Boolean))]  ,[tasks]);
  const projects=useMemo(()=>[...new Set(tasks.map(t=>t.project).filter(Boolean))]  ,[tasks]);
  const filtered=useMemo(()=>tasks.filter(t=>{if(fOwner!=="all"&&t.owner!==fOwner)return false;if(fStatus!=="all"&&t.status!==fStatus)return false;if(fPriority!=="all"&&t.priority!==fPriority)return false;if(fProject!=="all"&&t.project!==fProject)return false;return true;}),[tasks,fOwner,fStatus,fPriority,fProject]);
  const todayCE=useMemo(()=>allCE.filter(e=>e.date===todayStr&&(e.type==="관리전화"||e.type==="리포트")),[allCE]);
  const todayTasks=useMemo(()=>filtered.filter(t=>isActiveToday(t)&&t.status!=="done").sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority])),[filtered]);
  const allCEFiltered=useMemo(()=>allCE.filter(e=>e.type==="관리전화"||e.type==="리포트"),[allCE]);
  const allItems=useMemo(()=>[...filtered.map(t=>({...t,_itemType:"task"})),...allCEFiltered.map(e=>({...e,_itemType:"ce",due:e.date}))].sort((a,b)=>!a.due?1:!b.due?-1:a.due.localeCompare(b.due)),[filtered,allCEFiltered]);
  const calTasksExp=useMemo(()=>expandForMonth(filtered,calY,calM),[filtered,calY,calM]);
  const calCE=useMemo(()=>allCE.filter(e=>e.date.startsWith(`${calY}-${String(calM+1).padStart(2,"0")}`)),[allCE,calY,calM]);
  const tasksByDay=useMemo(()=>{const m={};if(calFilter!=="contracts")calTasksExp.forEach(t=>{if(t.due){const d=parseInt(t.due.slice(8));if(!m[d])m[d]={t:[],e:[]};m[d].t.push(t);}});if(calFilter!=="tasks")calCE.forEach(e=>{const d=parseInt(e.date.slice(8));if(!m[d])m[d]={t:[],e:[]};m[d].e.push(e);});return m;},[calTasksExp,calCE,calFilter]);

  const done=tasks.filter(t=>t.status==="done").length;const pct=tasks.length?Math.round(done/tasks.length*100):0;
  const firstDay=new Date(calY,calM,1).getDay();const dim=new Date(calY,calM+1,0).getDate();
  const cells=[...Array(firstDay).fill(null),...Array.from({length:dim},(_,i)=>i+1)];while(cells.length%7)cells.push(null);

  const TabBtn=({id,icon,label})=>(<button onClick={()=>setTab(id)} style={{flex:1,padding:"9px 2px",border:"none",background:"none",fontWeight:700,fontSize:11,color:tab===id?"#2563eb":"#9ca3af",borderBottom:`2.5px solid ${tab===id?"#2563eb":"transparent"}`,cursor:"pointer"}}>{icon} {label}</button>);
  const resetFilters=()=>{setFOwner("all");setFStatus("all");setFPriority("all");setFProject("all");};
  const hasFilter=fOwner!=="all"||fStatus!=="all"||fPriority!=="all"||fProject!=="all";
  if(loadingTasks)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"#9ca3af"}}>불러오는 중…</p></div>;

  return(
    <div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",background:"#f8fafc",minHeight:"100vh",padding:"20px 14px"}}>
      <div style={{maxWidth:720,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div><h1 style={{fontSize:20,fontWeight:800,color:"#111827",margin:0}}>업무 관리</h1><p style={{fontSize:12,color:"#9ca3af",margin:"2px 0 0"}}>{new Date().toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"short"})}</p></div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{background:user.isAdmin?"#fef9c3":"#eff6ff",borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:600,color:user.isAdmin?"#92400e":"#1d4ed8"}}>{user.isAdmin?"🔒 관리자":"👤"} {user.name}</div>
            <button onClick={onLogout} style={{background:"none",border:"1px solid #e5e7eb",borderRadius:8,padding:"5px 11px",fontSize:12,cursor:"pointer",color:"#9ca3af"}}>로그아웃</button>
            {tab==="list"&&<button onClick={()=>{setEditTaskData(null);setForm(EF(user.isAdmin));setShowForm(v=>!v);}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{showForm&&!editTaskData?"✕":"+ 새 작업"}</button>}
            {tab==="contracts"&&user.isAdmin&&<button onClick={()=>{setEditContract(null);setShowCF(v=>!v);}} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{showCF&&!editContract?"✕":"+ 계약 등록"}</button>}
          </div>
        </div>

        <div style={{background:"#fff",borderRadius:14,padding:"13px 16px",marginBottom:14,border:"1px solid #e5e7eb"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{fontSize:12,color:"#6b7280"}}>전체 작업 진행률</span><span style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>{done}/{tasks.length} 완료 ({pct}%)</span></div>
          <div style={{background:"#e5e7eb",borderRadius:99,height:6}}><div style={{width:`${pct}%`,background:"linear-gradient(90deg,#2563eb,#60a5fa)",borderRadius:99,height:"100%",transition:"width .4s"}}/></div>
          <div style={{display:"flex",gap:16,marginTop:10}}>{Object.entries(S).map(([k,v])=>(<div key={k}><span style={{fontSize:17,fontWeight:800,color:v.color}}>{tasks.filter(t=>t.status===k).length}</span><span style={{fontSize:11,color:"#9ca3af",marginLeft:3}}>{v.label}</span></div>))}<div style={{marginLeft:"auto"}}><span style={{fontSize:17,fontWeight:800,color:"#7c3aed"}}>{contracts.length}</span><span style={{fontSize:11,color:"#9ca3af",marginLeft:3}}>계약업체</span></div></div>
        </div>

        <div style={{background:"#fff",borderRadius:12,marginBottom:14,border:"1px solid #e5e7eb",display:"flex"}}>
          <TabBtn id="list" icon="📋" label="목록"/><TabBtn id="calendar" icon="📅" label="캘린더"/><TabBtn id="contracts" icon="🤝" label="계약관리"/><TabBtn id="report" icon="📊" label="업무보고"/>
        </div>

        {/* ══ LIST ══ */}
        {tab==="list"&&(
          <div>
            {showForm&&<TaskForm form={form} setForm={setForm} onSubmit={submitTask} onCancel={()=>{setShowForm(false);setEditTaskData(null);setForm(EF(user.isAdmin));}} isEdit={!!editTaskData} isAdminUser={user.isAdmin}/>}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              {user.isAdmin&&owners.length>0&&<Sel value={fOwner} onChange={setFOwner} opts={Object.fromEntries(owners.map(o=>[o,o]))} placeholder="전체 사원"/>}
              <Sel value={fStatus} onChange={setFStatus} opts={Object.fromEntries(Object.entries(S).map(([k,v])=>[k,v.label]))} placeholder="전체 상태"/>
              <Sel value={fPriority} onChange={setFPriority} opts={Object.fromEntries(Object.entries(P).map(([k,v])=>[k,v.label]))} placeholder="전체 우선순위"/>
              {projects.length>0&&<Sel value={fProject} onChange={setFProject} opts={Object.fromEntries(projects.map(p=>[p,p]))} placeholder="전체 프로젝트"/>}
              {hasFilter&&<button onClick={resetFilters} style={{border:"1px solid #fca5a5",borderRadius:8,padding:"6px 10px",fontSize:12,background:"#fff7f7",color:"#ef4444",cursor:"pointer"}}>초기화</button>}
            </div>
            <div style={{marginBottom:22}}>
              <SecHead title="🔥 오늘 할 일" count={todayTasks.length+todayCE.length} color="#ef4444"/>
              {todayTasks.length===0&&todayCE.length===0
                ?<div style={{textAlign:"center",padding:"22px 0",color:"#9ca3af",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #e5e7eb"}}>오늘 할 일이 없습니다 🎉</div>
                :<div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {todayCE.map((e,i)=>{const c=contracts.find(x=>x.id===e.cid);return c?<ContractEventCard key={i} event={e} contract={c} isDone={!!completions[ceKey(e)]} onToggle={()=>toggleCE(e)}/>:null;})}
                  {todayTasks.map(t=><TaskCard key={t.id+t._sk} task={t} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||t.owner===user.name}/>)}
                </div>}
            </div>
            <div>
              <SecHead title="📋 전체 작업" count={allItems.length} color="#2563eb"/>
              {allItems.length===0?<div style={{textAlign:"center",padding:"22px 0",color:"#9ca3af",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #e5e7eb"}}>작업이 없습니다</div>
                :<div style={{display:"flex",flexDirection:"column",gap:7}}>{allItems.map((item,i)=>{if(item._itemType==="ce"){const c=contracts.find(x=>x.id===item.cid);return c?<ContractEventCard key={i} event={item} contract={c} isDone={!!completions[ceKey(item)]} onToggle={()=>toggleCE(item)}/>:null;}return <TaskCard key={item.id+item._sk} task={item} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||item.owner===user.name}/>;})}</div>}
            </div>
          </div>
        )}

        {/* ══ CALENDAR ══ */}
        {tab==="calendar"&&(
          <div style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #e5e7eb"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <button onClick={()=>{let m=calM-1,y=calY;if(m<0){m=11;y--;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #e5e7eb",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:17}}>‹</button>
              <div style={{fontWeight:800,fontSize:17}}>{calY}년 {calM+1}월</div>
              <button onClick={()=>{let m=calM+1,y=calY;if(m>11){m=0;y++;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #e5e7eb",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:17}}>›</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:14,justifyContent:"center"}}>
              {[["all","전체"],["tasks","일반 일정"],["contracts","계약업체"]].map(([v,l])=>(<button key={v} onClick={()=>setCalFilter(v)} style={{border:`1.5px solid ${calFilter===v?"#2563eb":"#e5e7eb"}`,borderRadius:99,padding:"5px 14px",fontSize:12,fontWeight:600,cursor:"pointer",background:calFilter===v?"#eff6ff":"#fff",color:calFilter===v?"#2563eb":"#6b7280"}}>{l}</button>))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
              {DAYS.map((d,i)=>(<div key={d} style={{textAlign:"center",fontSize:12,fontWeight:700,color:i===0?"#ef4444":i===6?"#2563eb":"#9ca3af",padding:"5px 0"}}>{d}</div>))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
              {cells.map((day,i)=>{
                if(!day)return <div key={i}/>;
                const ds=`${calY}-${String(calM+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const isToday=ds===todayStr;const isSel=selectedDay===ds;const dow=(firstDay+day-1)%7;
                const cell=tasksByDay[day]||{t:[],e:[]};
                const allCellItems=[...cell.e.map(e=>({...e,_ce:true})),...cell.t];
                return(
                  <div key={i} onClick={()=>setSelectedDay(isSel?null:ds)} style={{minHeight:80,background:isSel?"#eff6ff":isToday?"#f0f9ff":"#fff",border:`1.5px solid ${isSel?"#2563eb":isToday?"#93c5fd":"#f0f0f0"}`,borderRadius:10,padding:"5px 4px",cursor:"pointer"}}>
                    <div style={{fontSize:12,fontWeight:isToday?800:500,color:isToday?"#2563eb":dow===0?"#ef4444":dow===6?"#3b82f6":"#374151",marginBottom:2,textAlign:"center"}}>
                      {isToday?<span style={{background:"#2563eb",color:"#fff",borderRadius:"50%",padding:"1px 6px"}}>{day}</span>:day}
                    </div>
                    {allCellItems.slice(0,2).map((item,ti)=>{
                      const iD=item._ce?!!completions[ceKey(item)]:item.status==="done";
                      if(item._ce){const ce=CE[item.type];return <div key={ti} style={{fontSize:10,background:ce.bg,color:ce.color,borderRadius:4,padding:"1px 4px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:700,textDecoration:iD?"line-through":"none",opacity:iD?0.6:1}}>[{item.type[0]}] {item.name}</div>;}
                      return <div key={ti} style={{fontSize:10,background:P[item.priority].bg,color:P[item.priority].color,borderRadius:4,padding:"1px 4px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,textDecoration:iD?"line-through":"none",opacity:iD?0.6:1}}>{item._ir?"🔄":""}{item.title}</div>;
                    })}
                    {allCellItems.length>2&&<div style={{fontSize:10,color:"#9ca3af",textAlign:"center"}}>+{allCellItems.length-2}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:10,marginTop:12,justifyContent:"center",flexWrap:"wrap"}}>
              {Object.entries(P).map(([k,v])=><div key={k} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,background:v.bg,border:`1.5px solid ${v.color}`,borderRadius:3}}/><span style={{fontSize:11,color:"#6b7280"}}>{v.label}</span></div>)}
              {Object.entries(CE).map(([k,v])=><div key={k} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,background:v.bg,border:`1.5px solid ${v.color}`,borderRadius:3}}/><span style={{fontSize:11,color:"#6b7280"}}>{k}</span></div>)}
              <span style={{fontSize:11,color:"#9ca3af"}}>날짜 클릭 → 상세보기</span>
            </div>
            <DayDetailPanel date={selectedDay} tasks={calTasksExp.filter(t=>t.due===selectedDay)} ceItems={calCE.filter(e=>e.date===selectedDay)} contracts={contracts} completions={completions} onToggleCE={toggleCE} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} isAdmin={user.isAdmin} user={user}/>
          </div>
        )}

        {/* ══ CONTRACTS ══ */}
        {tab==="contracts"&&(
          <div>
            {showCF&&<ContractForm initial={editContract} onSubmit={saveContract} onCancel={()=>{setShowCF(false);setEditContract(null);}}/>}
            {contracts.length===0&&!showCF?<div style={{textAlign:"center",padding:"48px 0",color:"#9ca3af",fontSize:13,background:"#fff",borderRadius:14,border:"1px solid #e5e7eb"}}>{user.isAdmin?"등록된 계약업체가 없습니다. 위의 버튼으로 추가하세요.":"등록된 계약업체가 없습니다."}</div>
            :<div style={{display:"flex",flexDirection:"column",gap:10}}>{contracts.map(c=>{const evts=genEvents(c);const isActive=c.endDate>=todayStr;const nextCall=evts.filter(e=>e.type==="관리전화"&&e.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date))[0];const rpt=evts.find(e=>e.type==="리포트");return(
              <div key={c.id} style={{background:"#fff",borderRadius:14,border:`1px solid ${isActive?"#e5e7eb":"#f3f4f6"}`,padding:16,opacity:isActive?1:0.65}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
                  <div><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:800,fontSize:15,color:"#111827"}}>{c.name}</span><Badge label={isActive?"진행중":"종료"} color={isActive?"#10b981":"#9ca3af"} bg={isActive?"#d1fae5":"#f3f4f6"}/></div><div style={{fontSize:12,color:"#6b7280",marginTop:3}}>📅 {c.startDate} ~ {c.endDate}</div></div>
                  {user.isAdmin&&<div style={{display:"flex",gap:4,flexShrink:0}}><button onClick={()=>{setEditContract(c);setShowCF(true);}} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:13,padding:3}}>✏️</button><button onClick={()=>deleteContract(c.id)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:13,padding:3}}>✕</button></div>}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>{c.phone&&<span style={{fontSize:12,color:"#374151"}}>📞 {c.phone}</span>}{c.total&&<span style={{fontSize:12,color:"#374151"}}>💰 {c.total}</span>}{c.link&&<a href={c.link} target="_blank" rel="noreferrer" style={{fontSize:12,color:"#2563eb"}}>🔗 플레이스 링크</a>}</div>
                {(c.products||c.services)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>{c.products&&<div style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:"#9ca3af",marginBottom:2}}>상품내역</div><div style={{fontSize:12,color:"#374151",whiteSpace:"pre-line"}}>{c.products}</div></div>}{c.services&&<div style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:"#9ca3af",marginBottom:2}}>서비스내역</div><div style={{fontSize:12,color:"#374151",whiteSpace:"pre-line"}}>{c.services}</div></div>}</div>}
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{nextCall&&<Badge label={`📞 다음 관리전화: ${nextCall.date}`} color="#16a34a" bg="#dcfce7"/>}{rpt&&<Badge label={`📋 리포트: ${rpt.date}`} color="#dc2626" bg="#fee2e2"/>}{c.notes&&<Badge label={`📌 ${c.notes}`} color="#6b7280" bg="#f3f4f6"/>}</div>
              </div>
            );})}</div>}
          </div>
        )}

        {/* ══ REPORT ══ */}
        {tab==="report"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e5e7eb"}}>
              <SecHead title="⏰ 보고 타임" color="#7c3aed"/>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:timeslots.length?10:0}}>
                {timeslots.map(ts=>(<div key={ts} style={{display:"flex",alignItems:"center",gap:2}}><button onClick={()=>setSelTs(ts)} style={{border:`2px solid ${selTs===ts?"#7c3aed":"#e5e7eb"}`,borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer",background:selTs===ts?"#f5f3ff":"#fff",color:selTs===ts?"#7c3aed":"#374151"}}>{ts}</button>{user.isAdmin&&<button onClick={()=>removeTimeslot(ts)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:12,padding:"0 2px"}}>✕</button>}</div>))}
                {timeslots.length===0&&<span style={{fontSize:13,color:"#9ca3af"}}>관리자가 타임을 추가해야 합니다</span>}
              </div>
              {user.isAdmin&&<div style={{display:"flex",gap:8}}><input value={newTs} onChange={e=>setNewTs(e.target.value)} placeholder="새 타임 (예: 11시 타임)" onKeyDown={e=>e.key==="Enter"&&addTimeslot()} style={{flex:1,border:"1px solid #e5e7eb",borderRadius:10,padding:"8px 12px",fontSize:13,outline:"none"}}/><button onClick={addTimeslot} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ 추가</button></div>}
            </div>
            {selTs&&<div style={{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e5e7eb"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><SecHead title={`👥 ${selTs} 팀 현황`} count={tsReports.length} color="#7c3aed"/><button onClick={()=>loadReports(selTs)} style={{background:"none",border:"1px solid #e5e7eb",borderRadius:8,padding:"4px 10px",fontSize:12,cursor:"pointer",color:"#6b7280"}}>🔄</button></div>{loadingR?<div style={{textAlign:"center",padding:"20px",color:"#9ca3af",fontSize:13}}>불러오는 중…</div>:tsReports.length===0?<div style={{textAlign:"center",padding:"24px",color:"#9ca3af",fontSize:13,background:"#f8fafc",borderRadius:10}}>아직 제출된 실적이 없습니다</div>:tsReports.map((r,i)=><ReportCard key={i} report={r} targets={targets} timeslot={selTs}/>)}</div>}
            <div style={{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e5e7eb"}}>
              <SecHead title="✏️ 내 실적 입력" color="#2563eb"/>
              {timeslots.length>0?(<><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}><span style={{fontSize:12,color:"#6b7280",fontWeight:600}}>타임:</span>{timeslots.map(ts=><button key={ts} onClick={()=>setMyTs(ts)} style={{border:`2px solid ${myTs===ts?"#2563eb":"#e5e7eb"}`,borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer",background:myTs===ts?"#eff6ff":"#fff",color:myTs===ts?"#2563eb":"#374151"}}>{ts}</button>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>{METRICS.map(m=>(<div key={m.key}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>{m.label} <span style={{color:"#9ca3af",fontWeight:400}}>({m.unit})</span>{targets[m.key]&&<span style={{color:"#2563eb"}}> · 목표 {targets[m.key]}</span>}</label><input type="number" min="0" value={myR[m.key]} onChange={e=>setMyR(r=>({...r,[m.key]:e.target.value}))} placeholder="0" style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>))}</div><button onClick={submitReport} disabled={submitting||!myTs} style={{width:"100%",background:myTs?"#2563eb":"#e5e7eb",color:myTs?"#fff":"#9ca3af",border:"none",borderRadius:10,padding:"11px",fontSize:14,fontWeight:700,cursor:myTs?"pointer":"not-allowed"}}>{submitting?"저장 중…":"실적 제출"}</button>{submitMsg&&<p style={{fontSize:12,color:submitMsg.startsWith("✓")?"#10b981":"#ef4444",textAlign:"center",margin:"8px 0 0",fontWeight:600}}>{submitMsg}</p>}</>):<p style={{fontSize:13,color:"#9ca3af",textAlign:"center",padding:"12px 0"}}>관리자가 타임을 먼저 추가해야 합니다</p>}
            </div>
            {user.isAdmin&&<div style={{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e5e7eb"}}>
              <SecHead title="🔒 관리자 설정" color="#6b7280"/>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>{[["accounts","👥 계정관리"],["targets","🎯 목표"],["webhook","🔔 알림"],["history","📂 누적데이터"]].map(([id,label])=>(<button key={id} onClick={()=>setAdminSec(adminSec===id?"":id)} style={{border:`1.5px solid ${adminSec===id?"#374151":"#e5e7eb"}`,borderRadius:9,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",background:adminSec===id?"#111827":"#fff",color:adminSec===id?"#fff":"#6b7280"}}>{label}</button>))}</div>
              {adminSec==="accounts"&&<div><div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}><input value={newAccName} onChange={e=>setNewAccName(e.target.value)} placeholder="사원 이름" style={{flex:1,minWidth:100,border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none"}}/><input type="password" value={newAccPw} onChange={e=>setNewAccPw(e.target.value)} placeholder="비밀번호 설정" style={{flex:1,minWidth:100,border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none"}}/><button onClick={addAccount} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ 생성</button></div>{accounts.length===0?<p style={{fontSize:13,color:"#9ca3af",textAlign:"center"}}>등록된 사원 계정이 없습니다</p>:<div style={{display:"flex",flexDirection:"column",gap:6}}>{accounts.map(a=>(<div key={a.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8fafc",borderRadius:10,padding:"10px 14px"}}><div><span style={{fontWeight:600,fontSize:13,color:"#111827"}}>👤 {a.name}</span><span style={{fontSize:12,color:"#9ca3af",marginLeft:8}}>{'•'.repeat(Math.min(a.password.length,8))}</span></div><button onClick={()=>delAccount(a.name)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:13}}>✕ 삭제</button></div>))}</div>}</div>}
              {adminSec==="targets"&&<div>{[{key:"calls",label:"목표 콜수",unit:"콜"},{key:"materials",label:"목표 자료수",unit:"개"},{key:"retarget",label:"목표 재통픽스",unit:"개"}].map(({key,label,unit})=>(<div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><label style={{fontSize:13,fontWeight:600,color:"#374151",minWidth:110}}>{label}</label><input type="number" min="0" value={editTargets[key]} onChange={e=>setEditTargets(t=>({...t,[key]:parseInt(e.target.value)||0}))} style={{width:90,border:"1px solid #e5e7eb",borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none"}}/><span style={{fontSize:12,color:"#9ca3af"}}>{unit}</span></div>))}<button onClick={async()=>{await st.set("wt:targets",editTargets,true);setTargets({...editTargets});alert("저장되었습니다!");}} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:10,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>💾 저장</button></div>}
              {adminSec==="webhook"&&<div><p style={{fontSize:13,color:"#374151",margin:"0 0 8px"}}>Discord 웹훅으로 실적 제출 알림 전송</p><div style={{display:"flex",gap:8}}><input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." style={{flex:1,border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:12,outline:"none"}}/><button onClick={async()=>{await st.set("wt:webhook",webhookUrl,true);alert("저장되었습니다!");}} style={{background:"#5865F2",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>저장</button></div></div>}
              {adminSec==="history"&&<div>
                <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                  <button onClick={loadAllData} disabled={loadingAll} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{loadingAll?"불러오는 중…":"📂 데이터 불러오기"}</button>
                  {Object.keys(allData).length>0&&<button onClick={()=>{const wb=XLSX.utils.book_new();Object.entries(allData).sort().forEach(([date,tsByDate])=>{Object.entries(tsByDate).forEach(([ts,reps])=>{const headers=["이름","콜수","콜시간(분)","자료수","토스","재통픽스","긍정백톡","부정백톡"];const rows=reps.map(r=>[r.name,r.calls||0,r.callTime||0,r.materials||0,r.toss||0,r.retarget||0,r.positive||0,r.negative||0]);const tot=["합계",...METRICS.map(m=>reps.reduce((s,r)=>s+(r[m.key]||0),0))];const ws=XLSX.utils.aoa_to_sheet([headers,...rows,tot]);XLSX.utils.book_append_sheet(wb,ws,`${date} ${ts}`.slice(0,31));});});XLSX.writeFile(wb,"업무보고_전체.xlsx");}} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>📥 엑셀 저장</button>}
                </div>
                {Object.entries(allData).sort().reverse().map(([date,tsByDate])=>(<div key={date} style={{marginBottom:20}}><div style={{fontWeight:800,fontSize:14,color:"#111827",padding:"8px 12px",background:"#f3f4f6",borderRadius:8,marginBottom:10}}>📅 {date}</div>{Object.entries(tsByDate).map(([ts,reps])=>(<div key={ts} style={{marginBottom:12}}><div style={{fontWeight:700,fontSize:13,color:"#7c3aed",marginBottom:6}}>⏰ {ts} <span style={{fontSize:12,color:"#9ca3af",fontWeight:400}}>({reps.length}명)</span></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:480}}><thead><tr style={{background:"#f8fafc"}}><th style={{padding:"7px 10px",textAlign:"left",color:"#6b7280",fontWeight:600,borderBottom:"2px solid #e5e7eb"}}>이름</th>{METRICS.map(m=><th key={m.key} style={{padding:"7px 6px",textAlign:"center",color:"#6b7280",fontWeight:600,borderBottom:"2px solid #e5e7eb",whiteSpace:"nowrap"}}>{m.label}</th>)}</tr></thead><tbody>{reps.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f3f4f6"}}><td style={{padding:"7px 10px",fontWeight:700}}>{r.name}</td>{METRICS.map(m=><td key={m.key} style={{padding:"7px 6px",textAlign:"center"}}>{r[m.key]||0}</td>)}</tr>))}<tr style={{background:"#eff6ff",fontWeight:700}}><td style={{padding:"7px 10px",color:"#2563eb"}}>합계</td>{METRICS.map(m=><td key={m.key} style={{padding:"7px 6px",textAlign:"center",color:"#2563eb"}}>{reps.reduce((s,r)=>s+(r[m.key]||0),0)}</td>)}</tr></tbody></table></div></div>))}</div>))}
                {Object.keys(allData).length===0&&!loadingAll&&<p style={{fontSize:13,color:"#9ca3af",textAlign:"center",padding:"16px 0"}}>버튼을 눌러 데이터를 불러오세요</p>}
              </div>}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App(){
  const[user,setUser]=useState(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{st.get("ses:user").then(u=>{if(u)setUser(u);setLoading(false);});},[]);
  const handleLogout=async()=>{await st.del("ses:user");setUser(null);};
  if(loading)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"#9ca3af"}}>불러오는 중…</p></div>;
  if(!user)return <LoginScreen onLogin={setUser}/>;
  return <MainApp user={user} onLogout={handleLogout}/>;
}
