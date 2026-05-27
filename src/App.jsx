import React,{useState,useMemo,useEffect,useCallback,useRef}from"react";
import*as XLSX from"xlsx";
import{doc,getDoc,setDoc,deleteDoc,getDocs,collection}from'firebase/firestore';
import{db}from'./firebase';
const METRICS=[{key:"calls",label:"콜수",unit:"콜"},{key:"callTime",label:"콜시간",unit:"분"},{key:"materials",label:"자료수",unit:"개"},{key:"toss",label:"토스",unit:"개"},{key:"retarget",label:"재통픽스",unit:"개"},{key:"positive",label:"긍정백톡",unit:"개"},{key:"negative",label:"부정백톡",unit:"개"}];
const FINAL_METRICS=[{key:"dailySales",label:"일매출",unit:"원"},{key:"connRate",label:"도입률-연결",unit:""},{key:"rate30s",label:"도입률-30초이상",unit:""}];
const DEF_TARGETS={calls:200,materials:25,retarget:4};
const ADMIN_PW="admin123";
const todayStr=new Date().toISOString().slice(0,10);
const uid=()=>Math.random().toString(36).slice(2,9);
const san=s=>s.replace(/[\s/\\'":]/g,"_").slice(0,50);
const P={high:{label:"높음",color:"#ef4444",bg:"#fef2f2"},medium:{label:"중간",color:"#f59e0b",bg:"#fffbeb"},low:{label:"낮음",color:"#10b981",bg:"#f0fdf4"}};
const S={todo:{label:"할 일",color:"#6b7280",bg:"#f3f4f6"},doing:{label:"진행 중",color:"#2563eb",bg:"#eff6ff"},done:{label:"완료",color:"#10b981",bg:"#d1fae5"}};
const CE={온보딩:{color:"#6b7280",bg:"#f3f4f6"},순위체크:{color:"#0891b2",bg:"#ecfeff"},리포트:{color:"#7c3aed",bg:"#f5f3ff"}};
const DAYS_KR=["일","월","화","수","목","금","토"];
const EF=(isAdmin)=>({title:"",project:"",priority:"medium",status:"todo",due:"",deadline:"",memo:"",visibility:isAdmin?"public":"personal",repeat:"none",repeatDays:[]});
const getDDay=(dl)=>{if(!dl)return null;return Math.ceil((new Date(dl+"T00:00:00")-new Date(todayStr+"T00:00:00"))/(1000*60*60*24));};
const getDDayLabel=(dl)=>{if(!dl)return null;const d=getDDay(dl);if(d>0)return{text:`D-${d}`,color:d<=3?"#ef4444":"#6b7280",urgent:d<=3};if(d===0)return{text:"D-Day",color:"#ef4444",urgent:true};return{text:`D+${Math.abs(d)}초과`,color:"#ef4444",urgent:true};};
const requestNotifPerm=async()=>{if(!("Notification"in window))return false;if(Notification.permission==="granted")return true;const r=await Notification.requestPermission();return r==="granted";};
const parseAmount=str=>{if(!str)return 0;const m=str.match(/(\d+(?:\.\d+)?)\s*만/);if(m)return parseFloat(m[1])*10000;const n=str.match(/(\d[\d,]*(?:\.\d+)?)/);if(n)return parseFloat(n[1].replace(/,/g,""))||0;return 0;};
const fmtAmount=n=>{if(!n)return"0원";if(n>=10000){const v=n/10000;return`${Number.isInteger(v)?v:v.toFixed(1)}만원`;}return`${n.toLocaleString()}원`;};
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
const genEvents=c=>{if(!c.startDate||!c.endDate)return[];const rptDate=subBizDays(c.endDate,3);const evts=[{type:"온보딩",date:c.startDate,cid:c.id,name:c.name,manager:c.manager||""}];let cur=c.startDate;let rankIdx=1;while(true){const nd=new Date(cur+"T00:00:00");nd.setDate(nd.getDate()+7);const next=nd.toISOString().slice(0,10);if(next>=rptDate)break;evts.push({type:"순위체크",date:next,cid:c.id,name:c.name,manager:c.manager||"",rankIdx,initialRanks:c.initialRanks||{}});cur=next;rankIdx++;}if(rptDate>c.startDate)evts.push({type:"리포트",date:rptDate,cid:c.id,name:c.name,manager:c.manager||""});return evts;};
const ceKey=e=>`${e.cid}:${e.type}:${e.date}`;
const parseMemo=text=>{const line=key=>{const m=text.match(new RegExp(key+'\\s*[:\\s]\\s*([^\\n]+)'));return m?m[1].trim():'';};const section=(start,ends)=>{const lines=text.split('\n');let cap=false,res=[];for(const l of lines){if(l.includes(start)&&!l.includes('▪')){cap=true;continue;}if(cap&&ends.some(e=>l.includes(e)&&!l.includes('▪')))break;if(cap&&l.trim())res.push(l.trim());}return res.join('\n');};
  // 키워드 파싱: "키워드" 줄 이후 빈줄/다음섹션 전까지 여러 줄 수집
  const parseKeywords=()=>{
    const lines=text.split('\n');
    let cap=false;const res=[];
    const STOP_WORDS=['상품내역','서비스내역','결제정보','담당자','특이사항','디비유형','주소','번호','상호명','대표자','플레이스','총금액'];
    for(const l of lines){
      const trimmed=l.trim();
      if(/^키워드\s*[:：]?\s*$/.test(trimmed)||/^키워드\s*[:：]/.test(trimmed)){
        cap=true;
        // 같은 줄에 키워드가 있으면 (키워드: 화성골프) 형태
        const inline=trimmed.replace(/^키워드\s*[:：]\s*/,'').trim();
        if(inline){
          // 인라인 키워드도 쉼표/공백으로 분리
          inline.split(/[,，\/·\s]+/).map(k=>k.trim()).filter(k=>k.length>0&&k.length<=30&&k!=='키워드'&&k!=='순위키워드'&&k!=='검색키워드').forEach(k=>res.push(k));
        }
        continue;
      }
      if(!cap)continue;
      // 빈줄이나 다음 섹션 시작이면 종료
      if(!trimmed||STOP_WORDS.some(s=>trimmed.startsWith(s))||trimmed.startsWith('▪')){cap=false;continue;}
      // "키워드" 단어 자체는 스킵
      if(trimmed==='키워드'||trimmed==='순위키워드'||trimmed==='검색키워드')continue;
      // 쉼표로 구분된 경우도 처리
      trimmed.split(/[,，\/·]+/).map(k=>k.trim()).filter(k=>k.length>0&&k.length<=30&&k!=='키워드'&&k!=='순위키워드'&&k!=='검색키워드').forEach(k=>res.push(k));
    }
    return[...new Set(res)];// 중복 제거
  };
  const keywords=parseKeywords();
  return{name:line('상호명'),phone:line('번호'),link:line('플레이스 링크'),products:section('상품내역',['서비스내역','결제정보','담당자']),services:section('서비스내역',['결제정보','담당자','특이사항']),total:line('총금액'),manager:line('담당자'),notes:line('특이사항'),keywords};};
const sendNotif=async(url,name,ts,data,targets)=>{if(!url?.startsWith("http"))return;const lines=METRICS.map(m=>{const v=data[m.key]||0,t=targets[m.key];return`• ${m.label}: **${v}${m.unit}**${t?` / ${t}${m.unit} (${Math.round(v/t*100)}%)`:''}`;});try{await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"업무보고 알림",content:`[${ts}] ${name} 실적 제출\n${lines.join('\n')}`})});}catch{}};
const repeatLabel=t=>{if(!t.repeat||t.repeat==="none")return null;if(t.repeat==="weekly")return`매주 ${DAYS_KR[new Date(t.due+"T00:00:00").getDay()]}`;if(t.repeat==="monthly")return`매월 ${parseInt(t.due.slice(8))}일`;if(t.repeat==="weekdays")return"평일";if(t.repeat==="custom")return`${(t.repeatDays||[]).sort().map(d=>DAYS_KR[d]).join("·")}`;return null;};
const isActiveOnDate=(t,ds)=>{if(!t.due||t.due>ds)return false;const dow=new Date(ds+"T00:00:00").getDay();if(!t.repeat||t.repeat==="none")return t.due===ds;if(t.repeat==="weekly")return new Date(t.due+"T00:00:00").getDay()===dow;if(t.repeat==="monthly")return parseInt(t.due.slice(8))===new Date(ds+"T00:00:00").getDate();if(t.repeat==="weekdays")return dow>=1&&dow<=5;if(t.repeat==="custom")return(t.repeatDays||[]).includes(dow);return false;};
const getWeekDays=()=>{const now=new Date();const dow=now.getDay();const mon=new Date(now);mon.setDate(now.getDate()-(dow===0?6:dow-1));return Array.from({length:5},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d.toISOString().slice(0,10);});};
const expandForMonth=(tasks,y,m)=>{const dim=new Date(y,m+1,0).getDate(),res=[];const mp=`${y}-${String(m+1).padStart(2,"0")}`;tasks.forEach(t=>{if(!t.repeat||t.repeat==="none"){if(!t.due||t.due.startsWith(mp))res.push(t);return;}const sd=t.due;if(t.repeat==="weekly"){const dow=new Date(t.due+"T00:00:00").getDay();for(let d=1;d<=dim;d++){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;if(date<sd)continue;if(new Date(y,m,d).getDay()===dow)res.push({...t,id:t.id+"-w"+d,due:date,_ir:true});}}else if(t.repeat==="monthly"){const day=parseInt(t.due.slice(8));if(day<=dim){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;if(date>=sd)res.push({...t,due:date,_ir:true});}}else if(t.repeat==="weekdays"){for(let d=1;d<=dim;d++){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;if(date<sd)continue;const dow=new Date(y,m,d).getDay();if(dow>=1&&dow<=5)res.push({...t,id:t.id+"-wd"+d,due:date,_ir:true});}}else if(t.repeat==="custom"){const days=t.repeatDays||[];for(let d=1;d<=dim;d++){const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;if(date<sd)continue;if(days.includes(new Date(y,m,d).getDay()))res.push({...t,id:t.id+"-c"+d,due:date,_ir:true});}}});return res;};
const getWeekOfMonth=(dateStr)=>{const d=new Date(dateStr+"T00:00:00");const y=d.getFullYear(),m=d.getMonth();const firstDay=new Date(y,m,1).getDay();const firstMon=firstDay===0?1:8-firstDay;const day=d.getDate();if(day<firstMon)return 1;return Math.floor((day-firstMon)/7)+2;};
const getWeekLabel=(dateStr)=>{const d=new Date(dateStr+"T00:00:00");return`${d.getFullYear()}년 ${d.getMonth()+1}월 ${getWeekOfMonth(dateStr)}주차`;};
const downloadWeeklyExcel=(allData)=>{const finalRows=[];Object.entries(allData).forEach(([date,tsByDate])=>{Object.entries(tsByDate).forEach(([ts,reps])=>{if(ts==="최종마감"){reps.forEach(r=>{finalRows.push({...r,date});});}});});if(finalRows.length===0){alert("최종마감 데이터가 없습니다.");return;}const weekMap={};finalRows.forEach(r=>{const wk=getWeekLabel(r.date);if(!weekMap[wk])weekMap[wk]={};if(!weekMap[wk][r.name])weekMap[wk][r.name]=[];weekMap[wk][r.name].push(r);});const wb=XLSX.utils.book_new();const allMetrics=[...METRICS,...FINAL_METRICS];const metricKeys=allMetrics.map(m=>m.key);const metricLabels=allMetrics.map(m=>m.label+(m.unit?`(${m.unit})`:""));const sumRows=[["주차","사원",...metricLabels]];const sortedWeeks=Object.keys(weekMap).sort();sortedWeeks.forEach(wk=>{const names=Object.keys(weekMap[wk]).sort();names.forEach(name=>{const records=weekMap[wk][name];const totals=metricKeys.map(k=>records.reduce((s,r)=>s+(Number(r[k])||0),0));sumRows.push([wk,name,...totals]);});const allNames=Object.keys(weekMap[wk]);const wkTotals=metricKeys.map(k=>allNames.reduce((s,name)=>s+weekMap[wk][name].reduce((ss,r)=>ss+(Number(r[k])||0),0),0));sumRows.push([wk,"【주차 합계】",...wkTotals]);sumRows.push([]);});const ws1=XLSX.utils.aoa_to_sheet(sumRows);XLSX.utils.book_append_sheet(wb,ws1,"주차별_사원별_총합");const avgRows=[["주차","사원",...metricLabels,"보고일수"]];sortedWeeks.forEach(wk=>{const names=Object.keys(weekMap[wk]).sort();names.forEach(name=>{const records=weekMap[wk][name];const cnt=records.length;const avgs=metricKeys.map(k=>{const tot=records.reduce((s,r)=>s+(Number(r[k])||0),0);return cnt>0?Math.round((tot/cnt)*100)/100:0;});avgRows.push([wk,name,...avgs,cnt]);});avgRows.push([]);});const ws2=XLSX.utils.aoa_to_sheet(avgRows);XLSX.utils.book_append_sheet(wb,ws2,"주차별_사원별_평균");const teamRows=[["주차",...metricLabels,"참여인원"]];sortedWeeks.forEach(wk=>{const allRecords=[];Object.values(weekMap[wk]).forEach(recs=>allRecords.push(...recs));const cnt=allRecords.length;const avgs=metricKeys.map(k=>{const tot=allRecords.reduce((s,r)=>s+(Number(r[k])||0),0);return cnt>0?Math.round((tot/cnt)*100)/100:0;});const memberCount=Object.keys(weekMap[wk]).length;teamRows.push([wk,...avgs,memberCount]);});const ws3=XLSX.utils.aoa_to_sheet(teamRows);XLSX.utils.book_append_sheet(wb,ws3,"전체_주차별_평균");XLSX.writeFile(wb,"주차별_업무량_분석.xlsx");};
const ACOLORS=["#2563eb","#7c3aed","#db2777","#ea580c","#16a34a","#0891b2"];
function Avatar({name,img,size=32,onClick,border}){const bg=ACOLORS[(name||"?").charCodeAt(0)%ACOLORS.length];return(<div onClick={onClick} style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,cursor:onClick?"pointer":"default",border:border||"2px solid rgba(255,255,255,0.4)",boxSizing:"border-box"}}>{img?<img src={img} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={name}/>:<div style={{width:"100%",height:"100%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff"}}>{(name||"?").slice(0,1).toUpperCase()}</div>}</div>);}
function ProfileModal({user,profiles,onUpdateProfile,onClose,contracts}){const fileRef=useRef();const myImg=profiles[user.name];const myContracts=contracts.filter(c=>c.manager===user.name);const monthlyMap={};myContracts.forEach(c=>{if(!c.startDate)return;const[y,m]=c.startDate.split("-");const key=`${y}-${m}`;if(!monthlyMap[key])monthlyMap[key]={year:parseInt(y),month:parseInt(m),count:0,amount:0};monthlyMap[key].count++;monthlyMap[key].amount+=parseAmount(c.total);});const monthly=Object.values(monthlyMap).sort((a,b)=>b.year-a.year||b.month-a.month);const totalCount=myContracts.length;const totalAmount=myContracts.reduce((s,c)=>s+parseAmount(c.total),0);const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>onUpdateProfile(user.name,ev.target.result);r.readAsDataURL(f);};return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Pretendard',-apple-system,sans-serif"}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:28,width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><span style={{fontSize:15,fontWeight:700,color:"#0f1117"}}>내 프로필</span><button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#adb5bd"}}>✕</button></div><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:20}}><Avatar name={user.name} img={myImg} size={80} border="3px solid #f0f1f3"/><div style={{fontWeight:700,fontSize:16,color:"#0f1117"}}>{user.name}</div><div style={{fontSize:12,color:"#adb5bd",background:"#f7f8fa",borderRadius:99,padding:"3px 10px"}}>{user.isAdmin?"슈퍼관리자":user.role==="manager"?"관리자":"사원"}</div><button onClick={()=>fileRef.current.click()} style={{background:"#f0f7ff",color:"#0071CE",border:"1px solid #bfdbfe",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>프로필 사진 변경</button><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/></div><div style={{borderTop:"1px solid #f0f1f3",paddingTop:16}}><div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:10}}>내 매출 현황</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><div style={{background:"#f0f7ff",borderRadius:10,padding:"12px 14px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:"#0071CE"}}>{totalCount}건</div><div style={{fontSize:11,color:"#adb5bd",marginTop:2}}>누적 계약</div></div><div style={{background:"#f5f3ff",borderRadius:10,padding:"12px 14px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:"#8468D3"}}>{fmtAmount(totalAmount)}</div><div style={{fontSize:11,color:"#adb5bd",marginTop:2}}>누적 매출</div></div></div>{monthly.length>0?(<div style={{maxHeight:160,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>{monthly.map((s,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#f7f8fa",borderRadius:8,padding:"8px 12px"}}><span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{s.year}년 {s.month}월</span><div style={{display:"flex",gap:12}}><span style={{fontSize:12,color:"#0071CE",fontWeight:600}}>{s.count}건</span><span style={{fontSize:12,color:"#8468D3",fontWeight:600}}>{fmtAmount(s.amount)}</span></div></div>))}</div>):<p style={{fontSize:13,color:"#adb5bd",textAlign:"center",padding:"12px 0"}}>아직 담당 계약이 없습니다</p>}</div></div></div>);}
const Badge=({label,color,bg})=><span style={{fontSize:11,fontWeight:600,color,background:bg,borderRadius:6,padding:"2px 7px",whiteSpace:"nowrap"}}>{label}</span>;
function ContractMemoModal({contract,user,onClose,allContracts,rankDataMap,completions,onRankEdit,onContractUpdate}){
  const[memos,setMemos]=useState([]);const[input,setInput]=useState("");const[memoPriority,setMemoPriority]=useState("normal");const[saving,setSaving]=useState(false);const[loading,setLoading]=useState(true);const[activeTab,setActiveTab]=useState("memo");const bottomRef=useRef();
  const memoKey=`contract:memos:${contract.linkedMemoId||contract.id}`;
  useEffect(()=>{loadMemos();},[]);
  useEffect(()=>{if(bottomRef.current)bottomRef.current.scrollIntoView({behavior:"smooth"});},[memos]);
  const loadMemos=async()=>{setLoading(true);const data=await st.get(memoKey)||[];setMemos(data);setLoading(false);};
  const addMemo=async()=>{const text=input.trim();if(!text)return;setSaving(true);const now=new Date();const dateStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;const newMemo={id:uid(),date:dateStr,author:user.name,text,priority:memoPriority};const updated=[...memos,newMemo];await st.set(memoKey,updated);setMemos(updated);setInput("");if(memoPriority==="urgent"){const wh=await st.get("wt:webhook");if(wh){try{await fetch(wh,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:`🚨 **긴급 메모** | ${contract.name}\n담당: ${user.name} · ${dateStr}\n> ${text}`})});}catch(e){}}}setMemoPriority("normal");setSaving(false);};
  const deleteMemo=async(id)=>{if(!window.confirm("이 메모를 삭제할까요?"))return;const updated=memos.filter(m=>m.id!==id);await st.set(memoKey,updated);setMemos(updated);};
  const isActive=!contract.cancelled&&contract.endDate>=todayStr;
  const isCancelled=!!contract.cancelled;
  // 히스토리: 같은 상호명 계약 전체를 날짜순으로
  const history=useMemo(()=>{if(!allContracts)return[contract];const same=allContracts.filter(c=>c.name===contract.name).sort((a,b)=>(a.startDate||"").localeCompare(b.startDate||""));return same.length>0?same:[contract];},[allContracts,contract]);
  const totalAmount=history.reduce((s,c)=>s+parseAmount(c.total),0);
  const firstAmount=parseAmount(history[0]?.total);
  const lastAmount=parseAmount(history[history.length-1]?.total);
  const growthPct=history.length>1&&firstAmount>0?Math.round((lastAmount-firstAmount)/firstAmount*100):null;
  const tS={fontSize:11,fontWeight:700,fontFamily:"'Pretendard',-apple-system,sans-serif"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Pretendard',-apple-system,sans-serif",padding:"20px"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,0.15)"}}>
        {/* 헤더 */}
        <div style={{padding:"18px 20px 0",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:4}}>
                <span style={{fontSize:11,fontWeight:800,color:contract.isRenewal?"#8468D3":"#0071CE",background:contract.isRenewal?"#f5f3ff":"#f0f7ff",borderRadius:5,padding:"1px 6px",border:`1px solid ${contract.isRenewal?"#e9d5ff":"#bfd7f5"}`}}>{contract.isRenewal?`R${contract.renewalCount||""}`:"N"}</span>
                <span style={{fontWeight:800,fontSize:16,color:isCancelled?"#ef4444":"#0f1117",textDecoration:isCancelled?"line-through":"none"}}>{contract.name}</span>
                {isCancelled?<Badge label="해지" color="#ef4444" bg="#fee2e2"/>:<Badge label={isActive?"진행중":"종료"} color={isActive?"#10b981":"#9ca3af"} bg={isActive?"#d1fae5":"#f3f4f6"}/>}
                {contract.linkedMemoId&&<span style={{fontSize:10,fontWeight:600,color:"#f59e0b",background:"#fffbeb",borderRadius:6,padding:"2px 7px",border:"1px solid #fde68a"}}>메모 이어받기</span>}
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                {contract.manager&&<span style={{fontSize:11,color:"#8468D3",fontWeight:600}}>{contract.manager}</span>}
                {contract.phone&&<span style={{fontSize:11,color:"#6b7280"}}>{contract.phone}</span>}
                {contract.total&&<span style={{fontSize:11,color:"#0071CE",fontWeight:600}}>{contract.total}</span>}
                <span style={{fontSize:11,color:"#adb5bd"}}>{contract.startDate} ~ {contract.endDate}</span>
              </div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#adb5bd",flexShrink:0,marginLeft:8}}>✕</button>
          </div>
          {/* 탭 */}
          <div style={{display:"flex",borderBottom:"1px solid #f0f1f3",marginTop:4}}>
            {[{id:"memo",label:"메모"},{id:"rank",label:"순위 히스토리"},{id:"history",label:`계약 히스토리 (${history.length}회)`},{id:"detail",label:"상세정보"}].map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,padding:"9px 4px",fontSize:12,fontWeight:activeTab===t.id?700:500,color:activeTab===t.id?"#0071CE":"#adb5bd",background:"none",border:"none",borderBottom:`2px solid ${activeTab===t.id?"#0071CE":"transparent"}`,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif",marginBottom:-1}}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* 메모 탭 */}
        {activeTab==="memo"&&<>
          <div style={{flex:1,overflowY:"auto",padding:"14px 20px",display:"flex",flexDirection:"column",gap:10}}>
            {loading?<div style={{textAlign:"center",padding:"20px",color:"#adb5bd",fontSize:12}}>불러오는 중…</div>
            :memos.length===0?<div style={{textAlign:"center",padding:"30px 0",color:"#adb5bd",fontSize:12}}>아직 메모가 없습니다. 첫 번째 메모를 남겨보세요!</div>
            :memos.map(m=>(
              <div key={m.id} style={{background:"#f7f8fa",borderRadius:10,padding:"10px 12px",border:"1px solid #f0f1f3"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <div style={{display:"flex",gap:7,alignItems:"center"}}><Avatar name={m.author} size={20} border="1px solid #f0f1f3"/><span style={{fontSize:11,fontWeight:700,color:"#374151"}}>{m.author}</span><span style={{fontSize:10,color:"#adb5bd"}}>{m.date}</span></div>
                  {(user.isAdmin||user.name===m.author)&&<button onClick={()=>deleteMemo(m.id)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:11,padding:"0 2px"}}>✕</button>}
                </div>
                {m.priority&&m.priority!=="normal"&&<span style={{fontSize:10,fontWeight:800,color:m.priority==="urgent"?"#ef4444":"#f59e0b",background:m.priority==="urgent"?"#fef2f2":"#fffbeb",borderRadius:5,padding:"1px 7px",border:`1px solid ${m.priority==="urgent"?"#fecaca":"#fde68a"}`,marginBottom:4,display:"inline-block"}}>{m.priority==="urgent"?"긴급":"주의"}</span>}
                <div style={{fontSize:12,color:"#1e293b",whiteSpace:"pre-wrap",lineHeight:1.6}}>{m.text}</div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
          <div style={{padding:"12px 20px 18px",borderTop:"1px solid #f0f1f3",flexShrink:0}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{display:"flex",gap:5,marginBottom:7}}>
              {[{v:"normal",l:"일반",color:"#6b7280",bg:"#f3f4f6"},{v:"caution",l:"주의",color:"#d97706",bg:"#fffbeb"},{v:"urgent",l:"긴급",color:"#ef4444",bg:"#fef2f2"}].map(({v,l,color,bg})=>(
                <button key={v} onClick={()=>setMemoPriority(v)} style={{border:`2px solid ${memoPriority===v?color:"#f0f1f3"}`,borderRadius:99,padding:"3px 11px",fontSize:11,fontWeight:700,cursor:"pointer",background:memoPriority===v?bg:"#fff",color:memoPriority===v?color:"#9ca3af",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{l}</button>
              ))}
            </div>
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addMemo();}}} placeholder="메모 입력 (Enter 저장, Shift+Enter 줄바꿈)" rows={2} style={{flex:1,border:`1.5px solid ${memoPriority==="urgent"?"#fca5a5":memoPriority==="caution"?"#fde68a":"#f0f1f3"}`,borderRadius:10,padding:"8px 12px",fontSize:12,outline:"none",resize:"none",fontFamily:"'Pretendard',-apple-system,sans-serif",lineHeight:1.5}}/>
              <button onClick={addMemo} disabled={saving||!input.trim()} style={{background:input.trim()?"#0071CE":"#e5e7eb",color:input.trim()?"#fff":"#9ca3af",border:"none",borderRadius:10,padding:"10px 16px",fontSize:12,fontWeight:700,cursor:input.trim()?"pointer":"not-allowed",whiteSpace:"nowrap",alignSelf:"stretch",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{saving?"저장중":"저장"}</button>
            </div>
            <div style={{fontSize:10,color:"#adb5bd",marginTop:4}}>작성자: {user.name} · {todayStr}</div>
          </div>
        </>}

        {/* 히스토리 탭 */}
        {activeTab==="history"&&(
          <div style={{flex:1,overflowY:"auto",padding:"14px 20px 20px"}}>
            {/* 요약 */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
              <div style={{background:"#f0f7ff",borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:"#0071CE"}}>{history.length}회</div><div style={{fontSize:10,color:"#adb5bd",marginTop:2}}>총 계약</div></div>
              <div style={{background:"#f5f3ff",borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:800,color:"#8468D3"}}>{fmtAmount(totalAmount)}</div><div style={{fontSize:10,color:"#adb5bd",marginTop:2}}>누적 매출</div></div>
              <div style={{background:growthPct!==null&&growthPct>0?"#f0fdf4":"#f7f8fa",borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:growthPct!==null&&growthPct>0?"#10b981":"#6b7280"}}>{growthPct!==null?`${growthPct>0?"+":""}${growthPct}%`:"—"}</div><div style={{fontSize:10,color:"#adb5bd",marginTop:2}}>금액 성장</div></div>
            </div>
            {/* 타임라인 */}
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {history.map((c,i)=>{
                const isLast=i===history.length-1;
                const isCur=c.id===contract.id;
                const amt=parseAmount(c.total);
                const prevAmt=i>0?parseFloat(history[i-1]?.total)||parseAmount(history[i-1]?.total):null;
                const pct=prevAmt&&prevAmt>0?Math.round((amt-prevAmt)/prevAmt*100):null;
                return(
                  <div key={c.id} style={{display:"flex",gap:12}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,marginTop:14,background:isCur?"#10b981":c.endDate<todayStr?"#d1d5db":"#0071CE",boxShadow:isCur?"0 0 0 3px #d1fae5":"none"}}/>
                      {!isLast&&<div style={{width:1,flex:1,background:"#f0f1f3",minHeight:20,margin:"4px 0"}}/>}
                    </div>
                    <div style={{flex:1,paddingBottom:isLast?0:16}}>
                      <div style={{background:isCur?"#f0fdf4":"#f7f8fa",borderRadius:10,padding:"10px 12px",border:`1px solid ${isCur?"#bbf7d0":"#f0f1f3"}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span style={{...tS,color:c.isRenewal?"#8468D3":"#0071CE",background:c.isRenewal?"#f5f3ff":"#f0f7ff",borderRadius:5,padding:"1px 6px"}}>{i+1}차 {c.isRenewal?`재연장(R${c.renewalCount||""})`:"신규"}</span>
                            {isCur&&<span style={{...tS,color:"#10b981",background:"#d1fae5",borderRadius:5,padding:"1px 6px"}}>현재</span>}
                            {c.manager&&<span style={{fontSize:11,color:"#8468D3",fontWeight:600}}>{c.manager}</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            {pct!==null&&<span style={{fontSize:11,fontWeight:700,color:pct>=0?"#10b981":"#ef4444"}}>{pct>=0?"+":""}{pct}%</span>}
                            <span style={{fontSize:13,fontWeight:800,color:"#0071CE"}}>{c.total||"—"}</span>
                          </div>
                        </div>
                        <div style={{fontSize:11,color:"#adb5bd"}}>{c.startDate} ~ {c.endDate}</div>
                        {c.products&&<div style={{fontSize:11,color:"#374151",marginTop:5,background:"#fff",borderRadius:6,padding:"4px 7px",whiteSpace:"pre-line"}}>{c.products}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* 순위 히스토리 탭 */}
        {activeTab==="rank"&&<div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}><RankHistoryPanel contract={contract} user={user} onContractUpdate={onContractUpdate}/></div>}

        {/* 상세정보 탭 */}
        {activeTab==="detail"&&(
          <div style={{flex:1,overflowY:"auto",padding:"14px 20px 20px"}}>
            {[{label:"전화번호",value:contract.phone},{label:"플레이스 링크",value:contract.link,isLink:true},{label:"상품내역",value:contract.products},{label:"서비스내역",value:contract.services},{label:"특이사항",value:contract.notes}].map(row=>row.value?(
              <div key={row.label} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:3}}>{row.label}</div>
                {row.isLink
                  ?<a href={row.value} target="_blank" rel="noreferrer" style={{fontSize:13,color:"#0071CE",wordBreak:"break-all"}}>{row.value}</a>
                  :<div style={{fontSize:13,color:"#374151",background:"#f7f8fa",borderRadius:8,padding:"8px 10px",whiteSpace:"pre-line",lineHeight:1.6}}>{row.value}</div>}
              </div>
            ):null)}
            {!contract.phone&&!contract.link&&!contract.products&&!contract.services&&!contract.notes&&<div style={{textAlign:"center",padding:"30px 0",color:"#adb5bd",fontSize:12}}>등록된 상세정보가 없습니다</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 순위 입력 모달 ==========
function RankInputModal({event,contract,onClose,onConfirm,onDelete,existingData,onAddKeyword}){
  const keywords=contract.keywords&&contract.keywords.length>0?contract.keywords:[];
  const[ranks,setRanks]=useState(()=>{const init={};keywords.forEach(kw=>{init[kw]=existingData?.keywords?.[kw]?.rank||"";});return init;});
  const[newKw,setNewKw]=useState("");const[kwSaving,setKwSaving]=useState(false);
  const handleConfirm=async()=>{
    const filled=keywords.filter(kw=>ranks[kw]&&parseInt(ranks[kw])>0);
    if(filled.length===0)return alert("최소 1개 키워드의 순위를 입력해주세요");
    const result={};
    keywords.forEach(kw=>{if(ranks[kw]&&parseInt(ranks[kw])>0){
      // 수정 시엔 기존 prevRank 유지, 신규 시엔 initialRanks 사용
      const prev=existingData?.keywords?.[kw]?.prevRank||(contract.initialRanks?.[kw])||null;
      result[kw]={rank:parseInt(ranks[kw]),prevRank:prev?parseInt(prev):null,date:event.date||todayStr};
    }});
    onConfirm(result);
  };
  const handleAddKw=async()=>{const v=newKw.trim();if(!v)return;if(keywords.includes(v))return alert("이미 등록된 키워드입니다");setKwSaving(true);if(onAddKeyword)await onAddKeyword(v);setNewKw("");setKwSaving(false);};
  const iS2={border:"1.5px solid #e5e7eb",borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none",width:"64px",textAlign:"center",fontFamily:"'Pretendard',-apple-system,sans-serif"};
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Pretendard',-apple-system,sans-serif",padding:16}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:22,width:"100%",maxWidth:400,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
      <div style={{fontWeight:800,fontSize:15,color:"#0f1117",marginBottom:2}}>{event.rankIdx}차 순위체크</div>
      <div style={{fontSize:12,color:"#6b7280",marginBottom:16}}>{contract.name} · {event.date}</div>
      {keywords.length===0?(
        <div style={{textAlign:"center",padding:"20px 0",color:"#adb5bd",fontSize:12,marginBottom:14}}>등록된 키워드가 없습니다.<br/>아래에서 키워드를 추가해주세요.</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
          {keywords.map(kw=>{
            const prev=existingData?.keywords?.[kw]?.prevRank||(contract.initialRanks?.[kw])||null;
            const cur=parseInt(ranks[kw])||0;
            const diff=prev&&cur?parseInt(prev)-cur:null;
            return(
              <div key={kw} style={{display:"flex",alignItems:"center",gap:8,background:"#f7f8fa",borderRadius:10,padding:"10px 12px",border:"1px solid #f0f1f3"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#0f1117"}}>{kw}</div>
                  {prev?<div style={{fontSize:10,color:"#adb5bd",marginTop:1}}>직전: {prev}위</div>:<div style={{fontSize:10,color:"#adb5bd",marginTop:1}}>시작순위 미입력</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  {cur>0&&diff!==null&&<span style={{fontSize:11,fontWeight:700,color:diff>0?"#10b981":diff<0?"#ef4444":"#6b7280",minWidth:28,textAlign:"right"}}>{diff>0?"▲":diff<0?"▼":"—"}{Math.abs(diff)}</span>}
                  <input type="number" min="1" value={ranks[kw]} onChange={e=>setRanks(r=>({...r,[kw]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleConfirm()} placeholder="순위" style={iS2}/>
                  <span style={{fontSize:11,color:"#adb5bd"}}>위</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{background:"#f0f9ff",borderRadius:10,padding:"10px 12px",marginBottom:16,border:"1px solid #bae6fd"}}>
        <div style={{fontSize:11,fontWeight:600,color:"#0369a1",marginBottom:7}}>+ 키워드 추가 (계약에 영구 저장)</div>
        <div style={{display:"flex",gap:6}}>
          <input value={newKw} onChange={e=>setNewKw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),handleAddKw())} placeholder="키워드 입력 후 Enter" style={{flex:1,border:"1px solid #bae6fd",borderRadius:7,padding:"6px 9px",fontSize:12,outline:"none",fontFamily:"'Pretendard',-apple-system,sans-serif",background:"#fff"}}/>
          <button onClick={handleAddKw} disabled={kwSaving} style={{background:"#0891b2",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif",whiteSpace:"nowrap"}}>{kwSaving?"저장중":"+ 추가"}</button>
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {existingData&&onDelete&&<button onClick={()=>{if(window.confirm("이 순위체크 기록을 삭제할까요?"))onDelete();}} style={{background:"#fff5f5",color:"#ef4444",border:"1px solid #fca5a5",borderRadius:9,padding:"11px 14px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>🗑️ 삭제</button>}
        <button onClick={onClose} style={{flex:1,background:"#f3f4f6",border:"none",borderRadius:9,padding:"11px",fontSize:13,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>취소</button>
        <button onClick={handleConfirm} disabled={keywords.length===0} style={{flex:2,background:keywords.length>0?"#0071CE":"#e5e7eb",color:keywords.length>0?"#fff":"#9ca3af",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:700,cursor:keywords.length>0?"pointer":"not-allowed",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{existingData?"수정하기":"저장"}</button>
      </div>
    </div>
  </div>);
}

// ========== 공유 텍스트 박스 ==========
function ShareTextBox({contract,allKws,sortedKeys,rankHistory,localInitRanks}){
  const fS={fontFamily:"'Pretendard',-apple-system,sans-serif"};
  const[copiedMid,setCopiedMid]=useState(false);
  const[copiedA,setCopiedA]=useState(false);
  const[copiedB,setCopiedB]=useState(false);
  const[selEk,setSelEk]=useState(""); // 중간점검: 선택 회차 key
  const[originDate,setOriginDate]=useState(contract.startDate);
  useEffect(()=>{
    const findOrigin=async()=>{
      const list=await st.get("contracts:all")||[];
      let date=contract.startDate;let prevId=contract.linkedMemoId;
      const visited=new Set([contract.id]);
      while(prevId&&!visited.has(prevId)){visited.add(prevId);const prev=list.find(c=>c.id===prevId);if(prev?.startDate)date=prev.startDate;prevId=prev?.linkedMemoId;}
      setOriginDate(date);
    };
    if(contract.linkedMemoId)findOrigin();
  },[contract.id]);

  const copy=(text,setter)=>{navigator.clipboard.writeText(text).then(()=>{setter(true);setTimeout(()=>setter(false),2000);}).catch(()=>{});};

  // ── 중간점검 텍스트: 선택 회차의 직전회차→선택회차 변화 ──
  const genMidText=()=>{
    const lines=["📊 키워드 순위 결과"];
    const targetKey=selEk||sortedKeys[sortedKeys.length-1];
    if(!targetKey)return"순위 체크 기록이 없습니다.";
    const targetIdx=sortedKeys.indexOf(targetKey);
    const prevKey=targetIdx>0?sortedKeys[targetIdx-1]:null;
    allKws.forEach(kw=>{
      const curVal=rankHistory[targetKey]?.keywords?.[kw];
      if(!curVal)return;
      const curRank=curVal.rank;
      const curDate=rankHistory[targetKey]?.date?.slice(5).replace("-","/");
      // 직전: 직전 회차 기록 우선, 없으면 initialRanks
      const prevRankFromHistory=prevKey?rankHistory[prevKey]?.keywords?.[kw]?.rank:null;
      const prevRank=prevRankFromHistory||(localInitRanks[kw])||null;
      const prevDate=prevKey?rankHistory[prevKey]?.date?.slice(5).replace("-","/"):originDate?.slice(5).replace("-","/");
      const diff=prevRank&&curRank?prevRank-curRank:null;
      const arrow=diff===null?"":(diff>0?`▲${diff}`:diff<0?`▼${Math.abs(diff)}`:"");
      lines.push(`키워드 : ${kw}`);
      if(prevRank&&prevDate){
        lines.push(`${prevDate} ${prevRank}위 → ${curDate} ${curRank}위 ${arrow}`);
      }else{
        lines.push(`${curDate} ${curRank}위 ${arrow}`);
      }
    });
    lines.push("——————————");
    lines.push("중간 점검 결과 공유드립니다 😊");
    lines.push("담당자로서 매일 체크하며 관리하고 있고,");
    lines.push("순위가 꾸준히 오르고 있어 저도 뿌듯하네요!");
    lines.push("앞으로도 놓치는 부분 없이 꼼꼼하게 챙겨드릴게요.");
    lines.push("언제든 궁금한 점 있으시면 편하게 연락 주세요 🙏");
    return lines.join("\n");
  };

  // ── 리포트용 1: 재연장 카톡 ──
  const genRenewalText=()=>{
    const toItems=str=>{if(!str)return[];return str.split(/\n/).map(s=>s.trim()).filter(Boolean).map(s=>`✔ ${s}`);};
    const items=[...toItems(contract.products),...toItems(contract.services)];
    const workList=items.length>0?items.join("\n"):"✔ (서비스 내역을 등록해주세요)";
    return`안녕하세요 대표님 😊

첫 달 함께해주셔서 진심으로 감사드리고, 이번 첫 달 작업이 모두 완료되어 결과 공유드리러 왔어요 !

📋 이번 달 진행 작업
${workList}

첫 달은 플레이스 알고리즘이 매장을 인식하고 기반을 잡아가는 단계인데, 첫 달임에도 순위가 안정적으로 잡히고 있어요.
결과 바로 남겨드릴게요 !!`;
  };

  // ── 리포트용 2: 순위 결과 (최종 기준, 상승폭 최대 키워드 자동) ──
  const genRankText=()=>{
    const initDate=originDate?.slice(5).replace("-","/");
    const lines=["📊 키워드 순위 결과"];
    const hasInit=allKws.some(kw=>localInitRanks[kw]);
    if(hasInit){
      lines.push(` ━━ 초기 순위 (${initDate}) ━━ `);
      allKws.forEach(kw=>{if(localInitRanks[kw])lines.push(`${kw}   ${localInitRanks[kw]}위 `);});
      lines.push("");
    }
    lines.push(` ━━ 최종 순위 현황 ━━ `);
    // 상승폭 최대 키워드 계산
    let bestKw="";let bestDiff=-Infinity;
    allKws.forEach(kw=>{
      const kwKeys=sortedKeys.filter(ek=>rankHistory[ek]?.keywords?.[kw]);
      if(kwKeys.length===0)return;
      const latestRank=rankHistory[kwKeys[kwKeys.length-1]]?.keywords?.[kw]?.rank;
      const initRank=localInitRanks[kw];
      const diff=initRank&&latestRank?initRank-latestRank:null;
      if(diff!==null&&diff>bestDiff){bestDiff=diff;bestKw=kw;}
    });
    allKws.forEach(kw=>{
      const kwKeys=sortedKeys.filter(ek=>rankHistory[ek]?.keywords?.[kw]);
      if(kwKeys.length===0)return;
      const latestKey=kwKeys[kwKeys.length-1];
      const latestRank=rankHistory[latestKey]?.keywords?.[kw]?.rank;
      const latestDate=rankHistory[latestKey]?.date?.slice(5).replace("-","/");
      const initRank=localInitRanks[kw];
      const cumDiff=initRank&&latestRank?initRank-latestRank:null;
      const cumStr=cumDiff!==null?(cumDiff>0?`▲${cumDiff}`:cumDiff<0?`▼${Math.abs(cumDiff)}`:"변동없음"):"";
      lines.push(` `);lines.push(` 키워드 : ${kw} `);
      lines.push(`${latestDate} ${latestRank}위 ${cumStr?` (누적 ${cumStr})`:""}`);
      lines.push(` `);
    });
    lines.push("");
    const bestLabel=bestKw||"해당";
    lines.push(`${bestLabel} 키워드에서 이번 달 순위가 눈에 띄게 올라왔습니다 !`);
    lines.push("사실 플레이스 작업은 첫 달이 기반을 다지는 단계예요.");
    lines.push("알고리즘이 매장을 인식하고 신뢰도를 쌓아가는 시기라");
    lines.push("위와같은 변화는 첫 달임에도 불구하고 정말 좋은 출발선으로 판단됩니다 !");
    return lines.join("\n");
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* ── 중간점검 텍스트 ── */}
      <div style={{background:"#f0fdf4",borderRadius:12,padding:"14px 16px",border:"1px solid #bbf7d0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#166534",...fS}}>중간점검 텍스트</div>
          <button onClick={()=>copy(genMidText(),setCopiedMid)} style={{background:copiedMid?"#10b981":"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",...fS}}>{copiedMid?"✓ 복사됨!":"텍스트 복사"}</button>
        </div>
        {/* 회차 선택 */}
        {sortedKeys.length>0&&<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:10}}>
          <span style={{fontSize:11,color:"#6b7280",fontWeight:600,...fS}}>기준 회차:</span>
          {sortedKeys.map((ek,i)=>{
            const rd=rankHistory[ek];const isSel=selEk===ek;
            return(<button key={ek} onClick={()=>setSelEk(isSel?"":ek)} style={{border:`1.5px solid ${isSel?"#16a34a":"#e5e7eb"}`,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer",background:isSel?"#f0fdf4":"#fff",color:isSel?"#16a34a":"#6b7280",...fS}}>{i+1}차 {rd.date?.slice(5)||""}</button>);
          })}
        </div>}
        <div style={{background:"#fff",borderRadius:8,padding:"12px 14px",fontSize:11,color:"#374151",lineHeight:1.8,whiteSpace:"pre-wrap",border:"1px solid #bbf7d0",...fS}}>{genMidText()}</div>
      </div>

      {/* ── 리포트용 구분선 ── */}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,height:1,background:"#f0f1f3"}}/>
        <span style={{fontSize:11,color:"#adb5bd",fontWeight:600,...fS}}>리포트용 텍스트</span>
        <div style={{flex:1,height:1,background:"#f0f1f3"}}/>
      </div>

      {/* ── 리포트1: 재연장 카톡 ── */}
      <div style={{background:"#f5f3ff",borderRadius:12,padding:"14px 16px",border:"1px solid #e9d5ff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#8468D3",...fS}}>① 재연장 카톡</div>
          <button onClick={()=>copy(genRenewalText(),setCopiedA)} style={{background:copiedA?"#10b981":"#8468D3",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",...fS}}>{copiedA?"✓ 복사됨!":"텍스트 복사"}</button>
        </div>
        <div style={{background:"#fff",borderRadius:8,padding:"12px 14px",fontSize:11,color:"#374151",lineHeight:1.8,whiteSpace:"pre-wrap",border:"1px solid #e9d5ff",...fS}}>{genRenewalText()}</div>
      </div>

      {/* ── 리포트2: 순위 결과 ── */}
      <div style={{background:"#f0f7ff",borderRadius:12,padding:"14px 16px",border:"1px solid #bfdbfe"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#0071CE",...fS}}>② 순위 결과</div>
          <button onClick={()=>copy(genRankText(),setCopiedB)} style={{background:copiedB?"#10b981":"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",...fS}}>{copiedB?"✓ 복사됨!":"텍스트 복사"}</button>
        </div>
        <div style={{background:"#fff",borderRadius:8,padding:"12px 14px",fontSize:11,color:"#374151",lineHeight:1.8,whiteSpace:"pre-wrap",border:"1px solid #dbeafe",...fS}}>{genRankText()}</div>
      </div>
    </div>
  );
}

// ========== 순위 히스토리 패널 ==========
function RankHistoryPanel({contract,user,onContractUpdate}){
  const[localKws,setLocalKws]=useState(contract.keywords||[]);
  const[localInitRanks,setLocalInitRanks]=useState(contract.initialRanks||{});
  const[rankHistory,setRankHistory]=useState({});const[rankLoading,setRankLoading]=useState(true);
  const[kwInput,setKwInput]=useState("");const[kwSaving,setKwSaving]=useState(false);
  const[initEdits,setInitEdits]=useState({});const[editingRank,setEditingRank]=useState(null);
  useEffect(()=>{loadHistory();},[]);
  const loadHistory=async()=>{
    setRankLoading(true);
    const data=await st.get("ce:rankdata")||{};
    const hist={};
    // 현재 계약 순위 기록
    Object.keys(data).filter(k=>k.startsWith(`${contract.id}:순위체크:`)).forEach(k=>{hist[k]=data[k];});
    // 이전 계약(linkedMemoId) 순위 기록 체인 방식으로 소급
    const allContracts=await st.get("contracts:all")||[];
    let prevId=contract.linkedMemoId;
    const visited=new Set([contract.id]);
    while(prevId&&!visited.has(prevId)){
      visited.add(prevId);
      Object.keys(data).filter(k=>k.startsWith(`${prevId}:순위체크:`)).forEach(k=>{hist[k]=data[k];});
      const prevContract=allContracts.find(c=>c.id===prevId);
      prevId=prevContract?.linkedMemoId;
    }
    setRankHistory(hist);
    setRankLoading(false);
  };
  const saveContractField=async(fields)=>{const list=await st.get("contracts:all")||[];const idx=list.findIndex(x=>x.id===contract.id);if(idx<0)return;list[idx]={...list[idx],...fields};await st.set("contracts:all",list);if(onContractUpdate)onContractUpdate([...list]);};
  const handleAddKw=async()=>{const v=kwInput.trim();if(!v||localKws.includes(v))return alert("이미 있거나 빈 키워드입니다");setKwSaving(true);const updated=[...localKws,v];setLocalKws(updated);await saveContractField({keywords:updated});setKwInput("");setKwSaving(false);};
  const handleRemoveKw=async(kw)=>{if(!window.confirm(`키워드 "${kw}"를 삭제할까요?`))return;const updated=localKws.filter(k=>k!==kw);setLocalKws(updated);await saveContractField({keywords:updated});};
  const handleSaveInitRanks=async()=>{const toSave={};localKws.forEach(kw=>{const v=initEdits[kw]!==undefined?initEdits[kw]:localInitRanks[kw]||"";if(v&&parseInt(v)>0)toSave[kw]=parseInt(v);});const merged={...localInitRanks,...toSave};setLocalInitRanks(merged);setInitEdits({});await saveContractField({initialRanks:merged});alert("저장됐어요!");};
  const handleRankEdit=async(ek,kw,newVal)=>{if(!newVal||isNaN(parseInt(newVal)))return;const data=await st.get("ce:rankdata")||{};if(!data[ek])return;data[ek].keywords[kw].rank=parseInt(newVal);await st.set("ce:rankdata",data);setRankHistory(prev=>({...prev,[ek]:{...prev[ek],keywords:{...prev[ek].keywords,[kw]:{...prev[ek].keywords[kw],rank:parseInt(newVal)}}}}));setEditingRank(null);};
  const sortedKeys=useMemo(()=>{
    const allKeys=Object.keys(rankHistory).sort((a,b)=>{
      // 날짜 먼저 비교
      const da=rankHistory[a]?.date||a.split(":")[2]||"";
      const db=rankHistory[b]?.date||b.split(":")[2]||"";
      if(da!==db)return da.localeCompare(db);
      // 날짜 같으면 현재 계약 우선
      const aCurrent=a.startsWith(`${contract.id}:`);
      const bCurrent=b.startsWith(`${contract.id}:`);
      if(aCurrent&&!bCurrent)return-1;
      if(!aCurrent&&bCurrent)return 1;
      return 0;
    });
    // 날짜 중복 제거: 같은 날짜면 첫번째(현재계약 우선)만 유지
    const seen=new Set();
    return allKeys.filter(k=>{
      const d=rankHistory[k]?.date||k.split(":")[2]||"";
      if(seen.has(d))return false;
      seen.add(d);return true;
    });
  },[rankHistory,contract.id]);
  // 테이블용: 모든 키워드 수집
  const allKws=useMemo(()=>{const set=new Set(localKws);sortedKeys.forEach(ek=>{const rd=rankHistory[ek];if(rd?.keywords)Object.keys(rd.keywords).forEach(k=>set.add(k));});return[...set];},[localKws,sortedKeys,rankHistory]);
  // 테이블 셀: initialRanks → 1차 → 2차 ...
  const getCell=(kw,ekIdx)=>{if(ekIdx===-1){const v=localInitRanks[kw];return v?{rank:v,isStart:true}:null;}const ek=sortedKeys[ekIdx];const rd=rankHistory[ek];const v=rd?.keywords?.[kw];return v||null;};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14,padding:"14px 20px 20px",overflowX:"hidden",boxSizing:"border-box",width:"100%"}}>
      {/* 키워드 관리 */}
      <div style={{background:"#ecfeff",borderRadius:12,padding:"14px 16px",border:"1px solid #a5f3fc"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#0891b2",marginBottom:10}}>순위 체크 키워드</div>
        {localKws.length===0?<div style={{fontSize:12,color:"#adb5bd",marginBottom:10}}>등록된 키워드가 없습니다. 추가해주세요.</div>
        :<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{localKws.map((kw,i)=>(<span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,background:"#fff",border:"1px solid #a5f3fc",borderRadius:99,padding:"3px 10px",fontSize:12,color:"#0891b2",fontWeight:600}}>{kw}<button onClick={()=>handleRemoveKw(kw)} style={{background:"none",border:"none",color:"#0891b2",cursor:"pointer",padding:0,fontSize:11,opacity:0.6}}>✕</button></span>))}</div>}
        <div style={{display:"flex",gap:6}}>
          <input value={kwInput} onChange={e=>setKwInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),handleAddKw())} placeholder="키워드 추가" style={{flex:1,border:"1px solid #a5f3fc",borderRadius:7,padding:"6px 10px",fontSize:12,outline:"none",fontFamily:"'Pretendard',-apple-system,sans-serif",background:"#fff"}}/>
          <button onClick={handleAddKw} disabled={kwSaving} style={{background:"#0891b2",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{kwSaving?"저장중":"+ 추가"}</button>
        </div>
      </div>
      {/* 계약 시작 시점 초기 순위 */}
      {localKws.length>0&&(
        <div style={{background:"#f0fdf4",borderRadius:12,padding:"14px 16px",border:"1px solid #bbf7d0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:"#166534"}}>계약 시작 시점 순위</div>
            <span style={{fontSize:11,color:"#6b7280"}}>{contract.startDate}</span>
          </div>
          <div style={{fontSize:11,color:"#adb5bd",marginBottom:8}}>재연장 업체는 첫 계약 당시 순위를 직접 입력해주세요.</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {localKws.map(kw=>{const saved=localInitRanks[kw]||"";const val=initEdits[kw]!==undefined?initEdits[kw]:saved;return(
              <div key={kw} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:500,flex:1,color:"#0f1117"}}>{kw}</span>
                <input type="number" min="1" value={val} onChange={e=>setInitEdits(r=>({...r,[kw]:e.target.value}))} placeholder="시작순위" style={{width:70,border:"1px solid #bbf7d0",borderRadius:7,padding:"5px 8px",fontSize:12,outline:"none",textAlign:"center",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>
                <span style={{fontSize:11,color:"#6b7280"}}>위</span>
              </div>
            );})}
          </div>
          <button onClick={handleSaveInitRanks} style={{marginTop:10,background:"#10b981",color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>저장</button>
        </div>
      )}
      {/* 순위 변화 테이블 (가로 스크롤) */}
      {rankLoading?<div style={{textAlign:"center",padding:"20px",color:"#adb5bd",fontSize:12}}>불러오는 중…</div>:(<>
        {allKws.length>0&&sortedKeys.length>0&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:700,color:"#0f1117"}}>순위 변화 한눈에 보기</div>
              {contract.linkedMemoId&&<span style={{fontSize:10,fontWeight:600,color:"#f59e0b",background:"#fffbeb",borderRadius:6,padding:"2px 7px",border:"1px solid #fde68a"}}>이전 계약 기록 포함</span>}
            </div>
            <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #f0f1f3",WebkitOverflowScrolling:"touch"}}>
              <table style={{borderCollapse:"collapse",fontSize:11,whiteSpace:"nowrap",minWidth:"100%"}}>
                <thead>
                  <tr style={{background:"#f7f8fa"}}>
                    <td style={{padding:"8px 12px",fontWeight:700,color:"#374151",borderBottom:"1px solid #f0f1f3",position:"sticky",left:0,background:"#f7f8fa",zIndex:1,minWidth:100,maxWidth:130}}>키워드</td>
                    {localInitRanks&&Object.keys(localInitRanks).length>0&&<td style={{padding:"8px 10px",textAlign:"center",fontWeight:600,color:"#adb5bd",borderBottom:"1px solid #f0f1f3",fontSize:10}}><div>시작</div><div style={{fontSize:9}}>{contract.startDate?.slice(5)}</div></td>}
                    {sortedKeys.map((ek,i)=>{
                      const rd=rankHistory[ek];
                      const isPrev=!ek.startsWith(`${contract.id}:`);
                      return(<td key={ek} style={{padding:"8px 10px",textAlign:"center",fontWeight:600,color:isPrev?"#8468D3":"#6b7280",borderBottom:"1px solid #f0f1f3",fontSize:10,background:isPrev?"#fdf8ff":"transparent"}}>
                        <div>{i+1}차{isPrev&&<span style={{fontSize:8,color:"#8468D3",marginLeft:2}}>이전</span>}</div>
                        <div style={{fontSize:9,color:"#adb5bd"}}>{rd.date?.slice(5)||""}</div>
                      </td>);
                    })}
                  </tr>
                </thead>
                <tbody>
                  {allKws.map((kw,ki)=>(
                    <tr key={kw} style={{borderBottom:ki<allKws.length-1?"1px solid #f7f8fa":"none"}}>
                      <td style={{padding:"8px 12px",fontWeight:600,color:"#0f1117",position:"sticky",left:0,background:"#fff",zIndex:1,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis"}}>{kw}</td>
                      {localInitRanks&&Object.keys(localInitRanks).length>0&&(()=>{const v=localInitRanks[kw];return(<td style={{padding:"8px 10px",textAlign:"center"}}>{v?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontSize:12,fontWeight:700,color:"#6b7280"}}>{v}위</span><span style={{fontSize:9,color:"#0891b2",background:"#ecfeff",borderRadius:4,padding:"1px 4px",border:"1px solid #a5f3fc"}}>시작</span></div>:<span style={{color:"#e5e7eb",fontSize:11}}>—</span>}</td>);})()}
                      {sortedKeys.map((ek,i)=>{
                        const rd=rankHistory[ek];const v=rd?.keywords?.[kw];
                        const diff=v?.prevRank&&v?.rank?v.prevRank-v.rank:null;
                        const isPrev=!ek.startsWith(`${contract.id}:`);
                        return(<td key={ek} style={{padding:"8px 10px",textAlign:"center",background:isPrev?"#fdf8ff":"transparent"}}>{v?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontSize:12,fontWeight:800,color:isPrev?"#8468D3":"#0f1117"}}>{v.rank}위</span>{diff!==null&&<span style={{fontSize:9,fontWeight:700,color:diff>0?"#10b981":diff<0?"#ef4444":"#6b7280",background:diff>0?"#f0fdf4":diff<0?"#fef2f2":"#f7f8fa",borderRadius:4,padding:"1px 4px"}}>{diff>0?"▲":diff<0?"▼":"—"}{diff!==0?Math.abs(diff):""}</span>}</div>):<span style={{color:"#e5e7eb",fontSize:11}}>—</span>}</td>);
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:10,color:"#adb5bd",marginTop:4,textAlign:"right"}}>← 좌우 스크롤{contract.linkedMemoId&&" · 보라색 열 = 이전 계약 기록"}</div>
          </div>
        )}
        {/* 공유 텍스트 복사 */}
        {sortedKeys.length>0&&allKws.length>0&&<ShareTextBox contract={contract} allKws={allKws} sortedKeys={sortedKeys} rankHistory={rankHistory} localInitRanks={localInitRanks}/>}
        {/* 차수별 상세 기록 */}
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#0f1117",marginBottom:10}}>차수별 상세 기록</div>
          {sortedKeys.length===0
            ?<div style={{textAlign:"center",padding:"24px 0",color:"#adb5bd",fontSize:12,background:"#f7f8fa",borderRadius:10}}>아직 순위 체크 기록이 없습니다</div>
            :<div style={{display:"flex",flexDirection:"column",gap:10}}>
              {sortedKeys.map((ek,idx)=>{
                const rd=rankHistory[ek];
                const isPrev=!ek.startsWith(`${contract.id}:`);
              return(
                <div key={ek} style={{background:isPrev?"#fdf8ff":"#f7f8fa",borderRadius:12,padding:"12px 14px",border:`1px solid ${isPrev?"#e9d5ff":"#f0f1f3"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:12,fontWeight:700,color:isPrev?"#8468D3":"#0f1117"}}>{idx+1}차 순위체크</span>{isPrev&&<span style={{fontSize:10,fontWeight:600,color:"#8468D3",background:"#f5f3ff",borderRadius:5,padding:"1px 6px",border:"1px solid #e9d5ff"}}>이전 계약</span>}</div>
                    <span style={{fontSize:11,color:"#adb5bd"}}>{rd.date||""}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {rd.keywords&&Object.entries(rd.keywords).map(([kw,v])=>{
                      const diff=v.prevRank&&v.rank?v.prevRank-v.rank:null;
                      const isEd=editingRank?.ek===ek&&editingRank?.kw===kw;
                      return(
                        <div key={kw} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",borderRadius:8,padding:"7px 10px",border:"1px solid #f0f1f3",minWidth:0,overflow:"hidden"}}>
                          <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                            <div style={{fontSize:12,fontWeight:600,color:"#0f1117",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{kw}</div>
                            {v.prevRank&&<div style={{fontSize:10,color:"#adb5bd"}}>직전: {v.prevRank}위</div>}
                          </div>
                          {isEd?(
                            <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                              <input type="number" min="1" defaultValue={v.rank} autoFocus onKeyDown={e=>{if(e.key==="Enter")handleRankEdit(ek,kw,e.target.value);if(e.key==="Escape")setEditingRank(null);}} style={{width:52,border:"1.5px solid #0071CE",borderRadius:6,padding:"3px 5px",fontSize:12,textAlign:"center",outline:"none",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>
                              <button onClick={ev=>{const inp=ev.target.parentElement.querySelector("input");handleRankEdit(ek,kw,inp.value);}} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:6,padding:"3px 7px",fontSize:11,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>✓</button>
                              <button onClick={()=>setEditingRank(null)} style={{background:"#f3f4f6",border:"none",borderRadius:6,padding:"3px 7px",fontSize:11,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>✕</button>
                            </div>
                          ):(
                            <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                              {diff!==null&&<span style={{fontSize:11,fontWeight:700,color:diff>0?"#10b981":diff<0?"#ef4444":"#6b7280"}}>{diff>0?"▲":diff<0?"▼":"—"}{Math.abs(diff)}</span>}
                              <span style={{fontSize:13,fontWeight:800,color:"#0f1117"}}>{v.rank}위</span>
                              <button onClick={()=>setEditingRank({ek,kw})} style={{background:"none",border:"1px solid #e5e7eb",borderRadius:5,padding:"2px 5px",fontSize:10,color:"#adb5bd",cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>수정</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>}
        </div>
      </>)}
    </div>
  );
}

// ========== 순위관리 탭 컴포넌트 ==========
function WeeklyTab({contracts,webhookUrl,rankWebhookUrl,st}){
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const todayFmt=fmt(new Date());
  const [dateA,setDateA]=useState(todayFmt);
  const [dateB,setDateB]=useState(todayFmt);
  const [memos,setMemos]=useState([]);
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);

  const PRIORITY_ORDER={urgent:0,caution:1,normal:2};
  // 시작일/종료일 정렬 (어떤 순서로 선택해도 작은날짜=시작, 큰날짜=종료)
  const rangeStart=dateA<=dateB?dateA:dateB;
  const rangeEnd=dateA<=dateB?dateB:dateA;
  const isSameDay=rangeStart===rangeEnd;
  const rangeLabel=isSameDay?rangeStart:`${rangeStart} ~ ${rangeEnd}`;
  const loadMemos=async()=>{
    setLoading(true);
    const results=[];
    for(const c of contracts){
      const mk=`contract:memos:${c.linkedMemoId||c.id}`;
      const ms=await st.get(mk)||[];
      ms.forEach(m=>{
        if(!m.date)return;
        const mDate=m.date.slice(0,10);// "YYYY-MM-DD" 부분만 비교
        if(mDate>=rangeStart&&mDate<=rangeEnd){
          results.push({...m,contractName:c.name,priority:m.priority||"normal"});
        }
      });
    }
    results.sort((a,b)=>(PRIORITY_ORDER[a.priority]??2)-(PRIORITY_ORDER[b.priority]??2)||b.date.localeCompare(a.date));
    setMemos(results);setLoading(false);setLoaded(true);
  };
  const sendDiscord=async()=>{
    if(!loaded){alert("먼저 '메모 불러오기' 버튼을 눌러주세요!");return;}
    const wh=webhookUrl||await st.get("wt:webhook");
    if(!wh){alert("Discord 웹훅이 설정되지 않았습니다.\n관리자 설정 > 알림 설정에서 먼저 등록해주세요.");return;}
    const urgentList=memos.filter(m=>m.priority==="urgent");
    const cautionList=memos.filter(m=>m.priority==="caution");
    const normalList=memos.filter(m=>!m.priority||m.priority==="normal");
    const label=isSameDay?`${rangeStart} 하루`:`${rangeStart} ~ ${rangeEnd}`;
    let msg=`📋 **계약 메모 요약** (${label})\n\n`;
    const line="─────────────────────────";
    const fmtMemo=(m)=>`${line}\n🏢 **${m.contractName}**\n📝 ${m.text}\n✍️ ${m.author} · ${m.date}\n`;
    if(urgentList.length>0){msg+=`🚨 **긴급 (${urgentList.length}건)**\n`;urgentList.forEach(m=>{msg+=fmtMemo(m);});msg+=line+"\n\n";}
    if(cautionList.length>0){msg+=`⚠️ **주의 (${cautionList.length}건)**\n`;cautionList.forEach(m=>{msg+=fmtMemo(m);});msg+=line+"\n\n";}
    if(normalList.length>0){msg+=`📝 **일반 (${normalList.length}건)**\n`;normalList.forEach(m=>{msg+=fmtMemo(m);});msg+=line+"\n\n";}
    if(memos.length===0)msg+="해당 기간 메모 없음\n";
    if(msg.length>1900){msg=msg.slice(0,1900)+"\n...\n(내용이 길어 일부 생략됨)";}
    try{await fetch(wh,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:msg})});alert("Discord로 전송 완료!");}catch(e){alert("전송 실패: "+e.message);}
  };
  const bS={fontFamily:"'Pretendard',-apple-system,sans-serif"};
  const urgentList=memos.filter(m=>m.priority==="urgent");
  const cautionList=memos.filter(m=>m.priority==="caution");
  const normalList=memos.filter(m=>!m.priority||m.priority==="normal");
  const MemoCard=({m,borderColor})=>(
    <div style={{background:"#fff",borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${borderColor}`,borderLeft:`4px solid ${borderColor}`}}>
      {/* 상호명 크게 */}
      <div style={{fontSize:15,fontWeight:900,color:"#0f1117",marginBottom:4,letterSpacing:"-0.3px"}}>{m.contractName}</div>
      {/* 작성자 · 날짜 */}
      <div style={{fontSize:10,color:"#adb5bd",marginBottom:8}}>{m.author} · {m.date}</div>
      {/* 구분선 */}
      <div style={{borderTop:`1px solid ${borderColor}`,marginBottom:8}}/>
      {/* 메모 내용 */}
      <div style={{fontSize:12,color:"#374151",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{m.text}</div>
    </div>
  );
  return(
    <div>
      {/* 헤더 */}
      <div style={{fontWeight:700,fontSize:13,color:"#0f1117",marginBottom:12}}>메모 조회 및 Discord 전송</div>
      {/* 날짜 선택 영역 */}
      <div style={{background:"#f7f8fa",borderRadius:12,padding:"14px 16px",marginBottom:14,border:"1px solid #f0f1f3"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:10}}>기간 선택</div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
          <input type="date" value={dateA} onChange={e=>{setDateA(e.target.value);setLoaded(false);}} style={{border:"1.5px solid #f0f1f3",borderRadius:8,padding:"7px 10px",fontSize:12,outline:"none",background:"#fff",...bS}}/>
          <span style={{fontSize:12,color:"#adb5bd",fontWeight:600}}>~</span>
          <input type="date" value={dateB} onChange={e=>{setDateB(e.target.value);setLoaded(false);}} style={{border:"1.5px solid #f0f1f3",borderRadius:8,padding:"7px 10px",fontSize:12,outline:"none",background:"#fff",...bS}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:11,color:"#0071CE",fontWeight:700,background:"#f0f7ff",borderRadius:6,padding:"4px 10px",border:"1px solid #bfdbfe"}}>
            {isSameDay?`📌 ${rangeStart} 하루`:`📌 ${rangeStart} ~ ${rangeEnd}`}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={loadMemos} disabled={loading} style={{background:"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",...bS}}>{loading?"불러오는 중…":"메모 불러오기"}</button>
            <button onClick={sendDiscord} style={{background:"#5865F2",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",...bS}}>Discord 전송</button>
          </div>
        </div>
      </div>
      {/* 결과 */}
      {!loaded&&<div style={{textAlign:"center",padding:"30px 0",color:"#adb5bd",fontSize:12,background:"#f7f8fa",borderRadius:12,border:"1px solid #f0f1f3"}}>기간을 선택하고 메모 불러오기를 눌러주세요</div>}
      {loaded&&memos.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"#adb5bd",fontSize:12,background:"#f7f8fa",borderRadius:12,border:"1px solid #f0f1f3"}}>해당 기간에 등록된 메모가 없습니다</div>}
      {loaded&&memos.length>0&&<>
        <div style={{fontSize:11,color:"#6b7280",marginBottom:10,fontWeight:600}}>총 {memos.length}건 · 긴급 {urgentList.length} · 주의 {cautionList.length} · 일반 {normalList.length}</div>
        {/* 🚨 긴급 */}
        {urgentList.length>0&&<div style={{background:"#fef2f2",borderRadius:12,padding:"12px 14px",marginBottom:10,border:"1px solid #fecaca"}}>
          <div style={{fontWeight:700,fontSize:12,color:"#ef4444",marginBottom:8}}>긴급 ({urgentList.length}건)</div>
          {urgentList.map((m,i)=><MemoCard key={i} m={m} borderColor="#fecaca"/>)}
        </div>}
        {/* ⚠️ 주의 */}
        {cautionList.length>0&&<div style={{background:"#fffbeb",borderRadius:12,padding:"12px 14px",marginBottom:10,border:"1px solid #fde68a"}}>
          <div style={{fontWeight:700,fontSize:12,color:"#d97706",marginBottom:8}}>주의 ({cautionList.length}건)</div>
          {cautionList.map((m,i)=><MemoCard key={i} m={m} borderColor="#fde68a"/>)}
        </div>}
        {/* 📝 일반 */}
        {normalList.length>0&&<div style={{background:"#f7f8fa",borderRadius:12,padding:"12px 14px",border:"1px solid #f0f1f3"}}>
          <div style={{fontWeight:700,fontSize:12,color:"#374151",marginBottom:8}}>일반 ({normalList.length}건)</div>
          {normalList.map((m,i)=><MemoCard key={i} m={m} borderColor="#e5e7eb"/>)}
        </div>}
      </>}
    </div>
  );
}
function RankManageTab({contracts,completions,rankDataMap,setMemoContract,setRankModalEvent,setRankModalContract,toggleCE,handleRankDelete}){
  const[search,setSearch]=useState("");
  const[statusFilter,setStatusFilter]=useState("active");// active | ended | all
  const filtered=useMemo(()=>{let list=contracts;if(statusFilter==="active")list=list.filter(c=>c.endDate>=todayStr);else if(statusFilter==="ended")list=list.filter(c=>c.endDate<todayStr);if(search.trim())list=list.filter(c=>c.name?.toLowerCase().includes(search.trim().toLowerCase()));return list;},[contracts,statusFilter,search]);
  const withNext=useMemo(()=>filtered.map(c=>{
    const evts=genEvents(c);
    const rankEvts=evts.filter(e=>e.type==="순위체크");
    const rpt=evts.find(e=>e.type==="리포트");
    // 오늘 이후 기준: 오늘 또는 미래에 해당하는 미완료 체크만 "다음 체크"로 산정
    const pendingRank=rankEvts.find(e=>!completions[ceKey(e)]&&e.date>=todayStr);
    // 오늘 이후 기준 D-day 계산 (과거 미체크는 무시)
    const nextDate=pendingRank?.date||rpt?.date||c.endDate;
    const daysLeft=Math.ceil((new Date(nextDate+"T00:00:00")-new Date(todayStr+"T00:00:00"))/(1000*60*60*24));
    return{c,rankEvts,rpt,pendingRank,daysLeft};
  }).sort((a,b)=>a.daysLeft-b.daysLeft),[filtered,completions]);
  // 오늘 날짜 순위체크가 있는 업체 → 완료 여부 관계없이 오늘 섹션 유지
  const todayCheck=withNext.filter(x=>x.rankEvts.some(e=>e.date===todayStr));
  // 예정: 오늘 체크 대상 아니고, 미래 미완료 있는 업체
  const upcoming=withNext.filter(x=>!x.rankEvts.some(e=>e.date===todayStr)&&x.pendingRank&&x.pendingRank.date>todayStr);
  // 완료: 오늘 체크 대상도 아니고 미래 미완료도 없는 업체
  const allDone=withNext.filter(x=>!x.rankEvts.some(e=>e.date===todayStr)&&!x.pendingRank);
  const renderCard=({c,rankEvts,rpt})=>{
    const isEnded=c.endDate<todayStr;
    const sp=c.startDate?c.startDate.split("-"):["","",""];
    return(
      <div key={c.id} style={{background:"#fff",borderRadius:12,border:`1px solid ${isEnded?"#e9d5ff":"#f0f1f3"}`,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid #f7f8fa",cursor:"pointer",background:isEnded?"#fdfaff":"#fafbfc"}} onClick={()=>setMemoContract(c)}>
          <div style={{display:"flex",flexDirection:"column",lineHeight:1.1,flexShrink:0,width:46}}>
            <span style={{fontSize:9,color:"#adb5bd",fontWeight:600}}>{sp[0]}년 {sp[1]}월</span>
            <span style={{fontSize:18,fontWeight:800,color:isEnded?"#8468D3":"#0071CE",lineHeight:1}}>{sp[2]}</span>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:800,color:c.isRenewal?"#8468D3":"#0071CE",background:c.isRenewal?"#f5f3ff":"#f0f7ff",borderRadius:5,padding:"1px 6px",border:`1px solid ${c.isRenewal?"#e9d5ff":"#bfd7f5"}`,flexShrink:0}}>{c.isRenewal?`R${c.renewalCount||""}`:"N"}</span>
              <span style={{fontWeight:700,fontSize:13,color:"#0f1117",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
              {c.manager&&<span style={{fontSize:11,color:"#8468D3",fontWeight:600}}>{c.manager}</span>}
              {isEnded&&<span style={{fontSize:10,color:"#8468D3",background:"#f5f3ff",borderRadius:5,padding:"1px 6px",fontWeight:600}}>종료</span>}
            </div>
            <div style={{display:"flex",gap:5,marginTop:2,flexWrap:"wrap",alignItems:"center"}}>
              {c.total&&<span style={{fontSize:11,color:isEnded?"#8468D3":"#0071CE",fontWeight:700}}>{c.total}</span>}
              <span style={{fontSize:10,color:"#adb5bd"}}>{c.startDate} ~ {c.endDate}</span>
              {c.keywords&&c.keywords.map((kw,ki)=>(<span key={ki} style={{fontSize:10,color:"#0891b2",background:"#ecfeff",borderRadius:99,padding:"1px 7px",border:"1px solid #a5f3fc"}}>{kw}</span>))}
            </div>
          </div>
          <span style={{fontSize:10,color:"#adb5bd",flexShrink:0}}>상세 ›</span>
        </div>
        <div style={{display:"flex",gap:6,padding:"10px 14px",flexWrap:"wrap",alignItems:"center"}} onClick={e=>e.stopPropagation()}>
          {rankEvts.map((e,ri)=>{
            const ek=ceKey(e);const isDone=!!completions[ek];
            const isToday=e.date===todayStr;const isFuture=e.date>todayStr;const isPast=e.date<todayStr;
            const dl=Math.ceil((new Date(e.date+"T00:00:00")-new Date(todayStr+"T00:00:00"))/(1000*60*60*24));
            if(isDone){return(
              <div key={ri} style={{display:"flex",alignItems:"center",gap:4,background:"#f0fdf4",borderRadius:99,padding:"4px 10px",border:"1.5px solid #6ee7b7",cursor:"pointer"}} onClick={ev=>{ev.stopPropagation();setRankModalEvent(e);setRankModalContract(c);}}>
                <span style={{color:"#10b981",fontSize:10,fontWeight:800}}>✓</span>
                <span style={{fontSize:11,fontWeight:700,color:"#10b981",whiteSpace:"nowrap"}}>{e.rankIdx}차 {e.date.slice(5)}</span>
                <span style={{fontSize:9,color:"#a7f3d0"}}>✎</span>
              </div>
            );}
            return(
              <div key={ri} style={{display:"flex",alignItems:"center",gap:5,background:isToday?"#fef9ec":"#f7f8fa",borderRadius:8,padding:"6px 10px",border:`1.5px solid ${isToday?"#fde68a":"#e5e7eb"}`,cursor:"pointer",opacity:isPast?0.45:1}} onClick={()=>{setRankModalEvent(e);setRankModalContract(c);}}>
                <div style={{width:15,height:15,borderRadius:3,border:`1.5px solid ${isToday?"#f59e0b":"#d1d5db"}`,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}/>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:isToday?"#d97706":"#374151",whiteSpace:"nowrap"}}>
                    {e.rankIdx}차 {e.date.slice(5)}{isToday?" (오늘)":isPast?" (지남)":isFuture?` D-${dl}`:""}
                  </div>
                  {!isPast&&(c.keywords||[]).length>0&&<div style={{fontSize:9,color:"#adb5bd",marginTop:1}}>{c.keywords.slice(0,3).join(" · ")}{c.keywords.length>3&&" …"}</div>}
                </div>
              </div>
            );
          })}
                    {rpt&&(()=>{
            const ek=ceKey(rpt);const isDone=!!completions[ek];
            const isToday=rpt.date===todayStr;const isFuture=rpt.date>todayStr;const isPast=rpt.date<todayStr;
            const dl=Math.ceil((new Date(rpt.date+"T00:00:00")-new Date(todayStr+"T00:00:00"))/(1000*60*60*24));
            return(
              <div style={{display:"flex",alignItems:"center",gap:5,background:isDone?"#f5f3ff":"#f7f8fa",borderRadius:8,padding:"6px 10px",border:`1.5px solid ${isDone?"#c4b5fd":"#e5e7eb"}`}}>
                <div style={{width:15,height:15,borderRadius:3,border:`1.5px solid ${isDone?"#7c3aed":"#d1d5db"}`,background:isDone?"#7c3aed":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:isDone?"default":"pointer"}} onClick={async()=>{if(!isDone)await toggleCE(rpt);}}>
                  {isDone&&<span style={{color:"#fff",fontSize:9,fontWeight:700}}>✓</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  <div style={{fontSize:11,fontWeight:600,color:isDone?"#7c3aed":"#374151",whiteSpace:"nowrap"}}>리포트 {rpt.date.slice(5)}{isToday?" (오늘)":isFuture?` D-${dl}`:""}</div>
                  {isDone&&<span style={{fontSize:9,color:"#adb5bd",cursor:"pointer",textDecoration:"underline"}} onClick={async ev=>{ev.stopPropagation();if(window.confirm("리포트 완료를 취소할까요?"))await toggleCE(rpt,false);}}>완료 취소</span>}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* 검색 + 필터 */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="업체명 검색..." style={{width:"100%",border:"1.5px solid #f0f1f3",borderRadius:9,padding:"7px 12px",fontSize:12,outline:"none",boxSizing:"border-box",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>
        <div style={{display:"flex",gap:5}}>
          {[{v:"active",l:"진행중",c:"#10b981"},{v:"ended",l:"종료",c:"#8468D3"},{v:"all",l:"전체",c:"#6b7280"}].map(({v,l,c})=>(
            <button key={v} onClick={()=>setStatusFilter(v)} style={{border:`1.5px solid ${statusFilter===v?c:"#f0f1f3"}`,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",background:statusFilter===v?c+"18":"#fff",color:statusFilter===v?c:"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{l}</button>
          ))}
        </div>
      </div>
      {/* 오늘 체크 */}
      {todayCheck.length>0&&(<div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:12,fontWeight:700,color:"#d97706",background:"#fffbeb",borderRadius:99,padding:"3px 12px",border:"1px solid #fde68a"}}>☀ 오늘 체크 ({todayCheck.length})</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>{todayCheck.map(x=>renderCard(x))}</div>
      </div>)}
      {/* 예정 */}
      {upcoming.length>0&&(<div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:12,fontWeight:700,color:"#0891b2",background:"#ecfeff",borderRadius:99,padding:"3px 12px",border:"1px solid #a5f3fc"}}>예정 ({upcoming.length})</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>{upcoming.map(x=>renderCard(x))}</div>
      </div>)}
      {/* 완료 */}
      {allDone.length>0&&(<div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:12,fontWeight:700,color:"#10b981",background:"#f0fdf4",borderRadius:99,padding:"3px 12px",border:"1px solid #bbf7d0"}}>완료 ({allDone.length})</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>{allDone.map(x=>renderCard(x))}</div>
      </div>)}
      {withNext.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#adb5bd",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #f0f1f3"}}>{search?"검색 결과가 없습니다":"해당하는 계약 업체가 없습니다"}</div>}
    </div>
  );
}

// ========== 로그인 화면 (새 디자인) ==========
function LoginScreen({onLogin}){
  const[name,setName]=useState("");const[pw,setPw]=useState("");const[isAdmin,setIsAdmin]=useState(false);const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const[isMobile,setIsMobile]=useState(window.innerWidth<=768);
  useEffect(()=>{const handler=()=>setIsMobile(window.innerWidth<=768);window.addEventListener('resize',handler);return()=>window.removeEventListener('resize',handler);},[]);
  const go=async()=>{if(!name.trim())return setErr("이름을 입력하세요");if(!pw.trim())return setErr("비밀번호를 입력하세요");setLoading(true);if(isAdmin){if(pw!==ADMIN_PW){setErr("비밀번호가 틀렸습니다");setLoading(false);return;}onLogin({name:name.trim(),isAdmin:true});}else{const accounts=await st.get("accounts:all")||[];const acc=accounts.find(a=>a.name===name.trim()&&a.password===pw);if(!acc){setErr("이름 또는 비밀번호가 틀렸습니다");setLoading(false);return;}onLogin({name:name.trim(),isAdmin:false,role:acc.role||"staff"});}setLoading(false);};
  const iS={width:"100%",border:"1px solid #f0f1f3",borderRadius:9,padding:"10px 13px",fontSize:13,outline:"none",background:"#fafbfc",color:"#0f1117",fontFamily:"'Pretendard',-apple-system,sans-serif"};
  if(isMobile){return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Pretendard',-apple-system,sans-serif",background:"#f7f8fa",padding:"24px 20px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32}}>
        <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#8468D3,#0071CE)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:24,fontWeight:800,color:"#fff",fontStyle:"italic"}}>P</span></div>
        <div><div style={{fontSize:16,fontWeight:700,color:"#0f1117",letterSpacing:"-0.3px"}}>PRO Marketing</div><div style={{fontSize:10,color:"#adb5bd",letterSpacing:"0.5px",textTransform:"uppercase",fontWeight:500}}>Management System</div></div>
      </div>
      <div style={{width:"100%",maxWidth:400,background:"#fff",borderRadius:20,padding:"28px 24px",boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{fontSize:20,fontWeight:800,color:"#0f1117",marginBottom:4,letterSpacing:"-0.5px"}}>로그인</div>
        <div style={{fontSize:12,color:"#adb5bd",marginBottom:20,fontWeight:400}}>계정 정보를 입력하세요</div>
        <div style={{display:"flex",background:"#f7f8fa",borderRadius:10,padding:3,marginBottom:20,border:"1px solid #f0f1f3"}}>
          {[{v:false,l:"사원"},{v:true,l:"슈퍼관리자"}].map(({v,l})=>(<button key={String(v)} onClick={()=>{setIsAdmin(v);setErr("");}} style={{flex:1,padding:"10px",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",background:isAdmin===v?"#0071CE":"transparent",color:isAdmin===v?"#fff":"#adb5bd",fontFamily:"'Pretendard',-apple-system,sans-serif",transition:"all 0.15s"}}>{l}</button>))}
        </div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:"0.6px",marginBottom:6,textTransform:"uppercase"}}>이름</div><input type="text" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="이름을 입력하세요" style={{...iS,padding:"12px 14px",fontSize:14}}/></div>
        <div style={{marginBottom:24}}><div style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:"0.6px",marginBottom:6,textTransform:"uppercase"}}>비밀번호</div><input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="비밀번호를 입력하세요" style={{...iS,padding:"12px 14px",fontSize:14}}/></div>
        {err&&<p style={{margin:"0 0 14px",fontSize:12,color:"#e53e3e",fontWeight:500,textAlign:"center"}}>{err}</p>}
        <button onClick={go} disabled={loading} style={{width:"100%",background:loading?"#93c5fd":"#0071CE",color:"#fff",border:"none",borderRadius:12,padding:"15px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",letterSpacing:"1px",fontFamily:"'Pretendard',-apple-system,sans-serif",transition:"background 0.15s"}}>{loading?"확인 중…":"LOGIN"}</button>
      </div>
    </div>
  );}
  return(
    <div style={{minHeight:"100vh",display:"flex",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start",justifyContent:"center",padding:"48px 6vw",background:"#f7f8fa",borderRight:"1px solid #f0f1f3"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:36}}>
          <div style={{width:42,height:42,borderRadius:11,background:"linear-gradient(135deg,#8468D3,#0071CE)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:22,fontWeight:800,color:"#fff",fontStyle:"italic"}}>P</span>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#0f1117",letterSpacing:"-0.3px"}}>PRO Marketing</div>
            <div style={{fontSize:9,color:"#adb5bd",letterSpacing:"0.5px",textTransform:"uppercase",fontWeight:500}}>Management System</div>
          </div>
        </div>
        <div style={{fontSize:36,fontWeight:800,color:"#0f1117",letterSpacing:"-1.2px",lineHeight:1.2,marginBottom:14}}>영업팀을 위한<br/>스마트 업무관리</div>
        <div style={{fontSize:13,color:"#adb5bd",fontWeight:400,marginBottom:40,lineHeight:1.8}}>계약 현황부터 매출 랭킹까지<br/>한 곳에서 관리하세요.</div>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {[{color:"#0071CE",text:"팀 실적 실시간 관리"},{color:"#8468D3",text:"계약 현황 추적"},{color:"#10b981",text:"매출 랭킹 분석"}].map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:9}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:item.color,flexShrink:0}}/>
              <span style={{fontSize:13,color:"#6b7280",fontWeight:500}}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{width:"36vw",minWidth:340,maxWidth:440,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <div style={{width:"100%",padding:"32px 7%"}}>
          <div style={{fontSize:22,fontWeight:800,color:"#0f1117",marginBottom:4,letterSpacing:"-0.5px"}}>로그인</div>
          <div style={{fontSize:12,color:"#adb5bd",marginBottom:24,fontWeight:400}}>계정 정보를 입력하세요</div>
          <div style={{display:"flex",background:"#f7f8fa",borderRadius:10,padding:3,marginBottom:20,border:"1px solid #f0f1f3"}}>
            {[{v:false,l:"사원"},{v:true,l:"슈퍼관리자"}].map(({v,l})=>(
              <button key={String(v)} onClick={()=>{setIsAdmin(v);setErr("");}} style={{flex:1,padding:"8px",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",background:isAdmin===v?"#0071CE":"transparent",color:isAdmin===v?"#fff":"#adb5bd",fontFamily:"'Pretendard',-apple-system,sans-serif",transition:"all 0.15s"}}>{l}</button>
            ))}
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b7280",letterSpacing:"0.6px",marginBottom:6,textTransform:"uppercase"}}>이름</div>
            <input type="text" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="이름을 입력하세요" style={iS}/>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b7280",letterSpacing:"0.6px",marginBottom:6,textTransform:"uppercase"}}>비밀번호</div>
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="비밀번호를 입력하세요" style={iS}/>
          </div>
          {err&&<p style={{margin:"0 0 12px",fontSize:12,color:"#e53e3e",fontWeight:500,textAlign:"center"}}>{err}</p>}
          <button onClick={go} disabled={loading} style={{width:"100%",background:loading?"#93c5fd":"#0071CE",color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:13,fontWeight:700,cursor:loading?"not-allowed":"pointer",letterSpacing:"1px",fontFamily:"'Pretendard',-apple-system,sans-serif",transition:"background 0.15s"}}>{loading?"확인 중…":"LOGIN"}</button>
        </div>
      </div>
    </div>
  );
}

// ========== 사이드바 (새 디자인) ==========
function Sidebar({tab,setTab,user,onLogout,contracts,profiles,onOpenProfile,navOrder,setNavOrder}){
  const[isMobile,setIsMobile]=useState(window.innerWidth<=768);
  useEffect(()=>{
    const handler=()=>setIsMobile(window.innerWidth<=768);
    window.addEventListener('resize',handler);
    return()=>window.removeEventListener('resize',handler);
  },[]);
  const myCount=(user.isAdmin||user.role==="manager")?contracts.length:contracts.filter(c=>c.manager===user.name).length;
  const NAV=[
    {id:"list",label:"목록",icon:"ti-layout-list"},
    {id:"calendar",label:"캘린더",icon:"ti-calendar"},
    {id:"revenue",label:"매출현황",icon:"ti-chart-line"},
    {id:"contracts",label:"계약관리",icon:"ti-users",badge:myCount>0?myCount:null},
    {id:"report",label:"업무보고",icon:"ti-clipboard-text"},
    {id:"ranking",label:"매출 랭킹",icon:"ti-trophy"},
    {id:"keyword",label:"키워드분석",icon:"ti-search"},
  ];
  const sortedNav=navOrder.map(id=>NAV.find(n=>n.id===id)).filter(Boolean).filter(n=>!(user.role==="manager"&&n.id==="report"));

  // ===== 모바일: 드로어 메뉴 =====
  const[drawerOpen,setDrawerOpen]=useState(false);
  if(isMobile){
    return(
      <>
        {/* 드로어 오버레이 */}
        {drawerOpen&&(
          <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:9998}}/>
        )}
        {/* 드로어 패널 */}
        <div style={{position:"fixed",top:0,right:0,bottom:0,width:230,background:"#fff",zIndex:9999,transform:drawerOpen?"translateX(0)":"translateX(100%)",transition:"transform 0.25s ease",display:"flex",flexDirection:"column",paddingTop:60,padding:"60px 10px 20px",boxShadow:drawerOpen?"-4px 0 24px rgba(0,0,0,0.12)":"none",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
            {sortedNav.map(n=>(
              <button key={n.id} onClick={()=>{setTab(n.id);setDrawerOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:10,border:"none",background:tab===n.id?"#f0f7ff":"transparent",cursor:"pointer",textAlign:"left",fontFamily:"'Pretendard',-apple-system,sans-serif",position:"relative"}}>
                <i className={`ti ${n.icon}`} style={{fontSize:20,color:tab===n.id?"#0071CE":"#c1c7d0",flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:tab===n.id?700:500,color:tab===n.id?"#0071CE":"#6b7280",flex:1}}>{n.label}</span>
                {n.badge&&<span style={{background:"#8468D3",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700}}>{n.badge}</span>}
              </button>
            ))}
            {user.isAdmin&&(
              <button onClick={()=>{setTab("admin");setDrawerOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:10,border:"none",background:tab==="admin"?"#fffbeb":"transparent",cursor:"pointer",textAlign:"left",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
                <i className="ti ti-lock" style={{fontSize:20,color:tab==="admin"?"#d97706":"#c1c7d0",flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:tab==="admin"?700:500,color:tab==="admin"?"#d97706":"#6b7280"}}>관리자 설정</span>
              </button>
            )}
          </div>
          <div style={{borderTop:"1px solid #f0f1f3",paddingTop:12,display:"flex",flexDirection:"column",gap:4}}>
            <button onClick={()=>{onOpenProfile();setDrawerOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,border:"none",background:"transparent",cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#0071CE,#8468D3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden"}}>
                {profiles[user.name]?<img src={profiles[user.name]} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={user.name}/>:(user.name||"?").slice(0,1)}
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:"#0f1117",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
                <div style={{fontSize:10,color:"#adb5bd"}}>{user.isAdmin?"슈퍼관리자":user.role==="manager"?"관리자":"사원"}</div>
              </div>
            </button>
            <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,border:"none",background:"transparent",cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
              <i className="ti ti-logout" style={{fontSize:20,color:"#ef4444",flexShrink:0}}/>
              <span style={{fontSize:13,color:"#ef4444",fontWeight:500}}>로그아웃</span>
            </button>
          </div>
        </div>
        {/* 상단 메뉴 버튼만 렌더 (Sidebar는 null 반환 안 함) */}
        <div style={{position:"fixed",top:0,right:0,zIndex:9997,padding:"10px 14px"}}>
          <button onClick={()=>setDrawerOpen(v=>!v)} style={{width:38,height:38,borderRadius:10,border:"1px solid #f0f1f3",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
            <i className={`ti ${drawerOpen?"ti-x":"ti-menu-2"}`} style={{fontSize:20,color:"#374151"}}/>
          </button>
        </div>
      </>
    );
  }

  // ===== PC: 기존 사이드바 =====
  return(
    <div style={{width:220,minHeight:"100vh",background:"#fff",display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",borderRight:"1px solid #f0f1f3",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
      <div style={{padding:"20px 16px 16px",borderBottom:"1px solid #f0f1f3"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
          <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#8468D3,#0071CE)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:16,fontWeight:800,color:"#fff",fontStyle:"italic"}}>P</span>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#0f1117",letterSpacing:"-0.2px"}}>PRO Marketing</div>
            <div style={{fontSize:9,color:"#adb5bd",letterSpacing:"0.4px",textTransform:"uppercase",fontWeight:500}}>Management</div>
          </div>
        </div>
        <div onClick={onOpenProfile} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#f7f8fa",borderRadius:9,border:"1px solid #f0f1f3",cursor:"pointer"}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#0071CE,#8468D3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden"}}>
            {profiles[user.name]?<img src={profiles[user.name]} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={user.name}/>:(user.name||"?").slice(0,1)}
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600,color:"#0f1117",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
            <div style={{fontSize:9,color:"#adb5bd",fontWeight:500}}>{user.isAdmin?"슈퍼관리자":user.role==="manager"?"관리자":"사원"}</div>
          </div>
        </div>
      </div>
      <div style={{padding:"12px 10px",flex:1}}>
        <div style={{fontSize:9,fontWeight:700,color:"#c1c7d0",letterSpacing:"1.2px",textTransform:"uppercase",padding:"0 8px",marginBottom:6}}>메인 메뉴</div>
        {sortedNav.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,border:"none",background:tab===n.id?"#f0f7ff":"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
            <i className={`ti ${n.icon}`} style={{fontSize:15,color:tab===n.id?"#0071CE":"#c1c7d0",flexShrink:0}}/>
            <span style={{fontSize:12,fontWeight:tab===n.id?600:500,color:tab===n.id?"#0071CE":"#6b7280",flex:1}}>{n.label}</span>
            {n.badge&&<span style={{background:"#8468D3",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700}}>{n.badge}</span>}
          </button>
        ))}
        {user.isAdmin&&(
          <>
            <div style={{fontSize:9,fontWeight:700,color:"#c1c7d0",letterSpacing:"1.2px",textTransform:"uppercase",padding:"0 8px",margin:"12px 0 6px"}}>설정</div>
            <button onClick={()=>setTab("admin")} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,border:"none",background:tab==="admin"?"#fffbeb":"transparent",cursor:"pointer",textAlign:"left",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
              <i className="ti ti-lock" style={{fontSize:15,color:tab==="admin"?"#d97706":"#c1c7d0",flexShrink:0}}/>
              <span style={{fontSize:12,fontWeight:tab==="admin"?600:500,color:tab==="admin"?"#d97706":"#6b7280"}}>관리자 설정</span>
            </button>
          </>
        )}
      </div>
      <div style={{padding:"10px 10px 16px",borderTop:"1px solid #f0f1f3"}}>
        <button onClick={onLogout} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"transparent",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
          <i className="ti ti-logout" style={{fontSize:14,color:"#c1c7d0"}}/>
          <span style={{fontSize:12,color:"#adb5bd",fontWeight:500}}>로그아웃</span>
        </button>
      </div>
    </div>
  );
}

function TaskCard({task,onCycle,onDelete,onEdit,showOwner,canEdit}){
  const[exp,setExp]=useState(false);
  const p=P[task.priority],s=S[task.status],isDone=task.status==="done";
  const isOver=task.due&&!isDone&&!task._ir&&task.due<todayStr;
  const rl=repeatLabel(task);
  const ddLabel=!isDone&&task.deadline?getDDayLabel(task.deadline):null;
  const borderColor=isDone?"#d1fae5":ddLabel?.urgent?"#fecaca":"#e5e7eb";
  return(<div style={{background:"#fff",borderRadius:10,padding:"10px 12px",border:`1px solid ${borderColor}`,opacity:isDone?0.7:1}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
      <button onClick={()=>canEdit&&onCycle(task)} style={{flexShrink:0,marginTop:1,width:20,height:20,borderRadius:"50%",border:`2px solid ${s.color}`,background:isDone?"#10b981":task.status==="doing"?"#eff6ff":"#fff",cursor:canEdit?"pointer":"default",fontSize:9,color:s.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{isDone?"✓":task.status==="doing"?"▶":""}</button>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:12,fontWeight:600,color:isDone?"#9ca3af":"#111827",textDecoration:isDone?"line-through":"none"}}>{task.title}</span>
          <Badge label={p.label} color={p.color} bg={p.bg}/>
          <Badge label={s.label} color={s.color} bg={s.bg}/>
          {rl&&<Badge label={rl} color="#7c3aed" bg="#f5f3ff"/>}
          {ddLabel&&<span style={{fontSize:10,fontWeight:700,color:ddLabel.color,background:ddLabel.urgent?"#fef2f2":"#f3f4f6",borderRadius:6,padding:"2px 6px",border:`1px solid ${ddLabel.urgent?"#fecaca":"#e5e7eb"}`}}>{ddLabel.text}</span>}
        </div>
        <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap",alignItems:"center"}}>
          {showOwner&&task.owner&&<span style={{fontSize:10,color:"#7c3aed",fontWeight:600}}>{task.owner}</span>}
          {task.project&&<span style={{fontSize:10,color:"#6b7280"}}>{task.project}</span>}
          {task.due&&<span style={{fontSize:10,color:isOver?"#ef4444":"#9ca3af"}}>{task.due}{task._ir?" (반복)":""}</span>}
          {task.deadline&&<span style={{fontSize:10,color:ddLabel?.urgent?"#ef4444":"#9ca3af",fontWeight:ddLabel?.urgent?700:400}}>마감 {task.deadline}</span>}
          {task.memo&&<button onClick={()=>setExp(v=>!v)} style={{fontSize:9,color:"#a855f7",background:"#faf5ff",border:"none",borderRadius:5,padding:"1px 5px",cursor:"pointer"}}>메모</button>}
        </div>
        {exp&&task.memo&&<div style={{marginTop:5,background:"#faf5ff",borderRadius:7,padding:"5px 8px",fontSize:11,color:"#6b21a8",borderLeft:"3px solid #d8b4fe"}}>{task.memo}</div>}
      </div>
      {canEdit&&!task._ir&&<div style={{display:"flex",gap:2,flexShrink:0}}>
        <button onClick={()=>onEdit(task)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",padding:2,fontSize:11}}>✏️</button>
        <button onClick={()=>onDelete(task)} style={{background:"none",border:"none",color:"#d1d5db",cursor:"pointer",padding:2,fontSize:11}}>✕</button>
      </div>}
    </div>
  </div>);
}
function ContractEventCard({event,contract,isDone,onToggle,onMemo}){
  const[exp,setExp]=useState(false);const ce=CE[event.type];
  const isPast=event.date<todayStr;
  const isRankType=event.type==="순위체크";
  // 과거 일정: 순위체크는 회색+클릭가능, 리포트는 회색+클릭불가
  const cardOpacity=isDone?0.65:(isPast&&!isRankType)?0.4:1;
  const borderColor=isPast&&!isDone?"#e5e7eb":ce.color;
  return(<div style={{background:"#fff",borderRadius:10,padding:"10px 12px",border:`1.5px solid ${borderColor}40`,borderLeft:`4px solid ${isPast&&!isDone?"#d1d5db":ce.color}`,opacity:cardOpacity}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
      <button onClick={onToggle} style={{flexShrink:0,marginTop:1,width:20,height:20,borderRadius:"50%",border:`2px solid ${isDone?"#10b981":isPast&&!isRankType?"#d1d5db":ce.color}`,background:isDone?"#10b981":ce.bg,cursor:(isPast&&!isRankType&&!isDone)?"not-allowed":"pointer",fontSize:9,color:isDone?"#fff":ce.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{isDone?"✓":""}</button>
      <div style={{flex:1,minWidth:0,cursor:onMemo?"pointer":"default"}} onClick={onMemo}>
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:700,color:isDone?"#9ca3af":isPast&&!isRankType?"#9ca3af":"#111827",textDecoration:isDone?"line-through":"none"}}>[{event.type}] {contract.name}</span>
          <Badge label="계약" color={isPast&&!isDone?"#9ca3af":ce.color} bg={isPast&&!isDone?"#f3f4f6":ce.bg}/>
          {event.manager&&<Badge label={event.manager} color="#7c3aed" bg="#f5f3ff"/>}
          {isPast&&!isDone&&isRankType&&<span style={{fontSize:9,color:"#adb5bd",background:"#f3f4f6",borderRadius:4,padding:"1px 5px"}}>과거 기록 가능</span>}
        </div>
        <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap",alignItems:"center"}}>
          {contract.phone&&<span style={{fontSize:10,color:"#6b7280"}}>{contract.phone}</span>}
          {contract.total&&<span style={{fontSize:10,color:"#6b7280"}}>{contract.total}</span>}
          <button onClick={e=>{e.stopPropagation();setExp(v=>!v);}} style={{fontSize:9,color:ce.color,background:ce.bg,border:"none",borderRadius:5,padding:"1px 6px",cursor:"pointer"}}>{exp?"접기":"상세"}</button>
        </div>
        {exp&&<div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}} onClick={e=>e.stopPropagation()}>
          {contract.link&&<a href={contract.link} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#0071CE",wordBreak:"break-all"}}>{contract.link}</a>}
          {contract.products&&<div style={{fontSize:11,color:"#374151",background:"#f8fafc",borderRadius:6,padding:"5px 7px",whiteSpace:"pre-line"}}><b>상품:</b>{"\n"}{contract.products}</div>}
          {contract.notes&&<div style={{fontSize:11,color:"#6b7280"}}>{contract.notes}</div>}
        </div>}
      </div>
    </div>
  </div>);
}
function RepeatPicker({repeat,repeatDays,due,onChange}){const opts=[{v:"none",l:"반복 없음"},{v:"weekly",l:"매주"},{v:"monthly",l:"매월"},{v:"weekdays",l:"평일(월-금)"},{v:"custom",l:"요일 직접 설정"}];const toggle=d=>{const c=repeatDays||[];onChange("repeatDays",c.includes(d)?c.filter(x=>x!==d):[...c,d]);};const dueDow=due?DAYS_KR[new Date(due+"T00:00:00").getDay()]:"";return(<div><select value={repeat} onChange={e=>onChange("repeat",e.target.value)} style={{border:"1px solid #f0f1f3",borderRadius:8,padding:"6px 10px",fontSize:12,background:"#fff",width:"100%",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>{repeat==="weekly"&&due&&<div style={{marginTop:4,fontSize:11,color:"#7c3aed",background:"#f5f3ff",borderRadius:7,padding:"4px 8px"}}>매주 <b>{dueDow}요일</b> ({due} 부터)</div>}{repeat==="custom"&&(<div style={{marginTop:6}}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{DAYS_KR.map((d,i)=>(<button key={i} onClick={()=>toggle(i)} style={{width:30,height:30,borderRadius:"50%",border:`2px solid ${(repeatDays||[]).includes(i)?"#7c3aed":"#e5e7eb"}`,background:(repeatDays||[]).includes(i)?"#7c3aed":"#fff",color:(repeatDays||[]).includes(i)?"#fff":"#374151",fontSize:12,fontWeight:600,cursor:"pointer"}}>{d}</button>))}</div></div>)}</div>);}
function TaskForm({form,setForm,onSubmit,onCancel,isEdit,isAdminUser,projectCategories}){
  const iS={border:"1px solid #f0f1f3",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'Pretendard',-apple-system,sans-serif"};
  const ddLabel=form.deadline?getDDayLabel(form.deadline):null;
  return(<div style={{background:"#fff",borderRadius:14,padding:20,marginBottom:14,border:"1px solid #bfdbfe"}}>
    <p style={{margin:"0 0 12px",fontWeight:700,fontSize:15,color:"#0071CE"}}>{isEdit?"작업 수정":"새 작업 추가"}</p>
    <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="작업 제목 *" style={{...iS,marginBottom:8,fontSize:14}}/>
    <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
      <select value={form.project} onChange={e=>setForm(f=>({...f,project:e.target.value}))} style={{flex:1,minWidth:100,...iS,width:"auto"}}><option value="">프로젝트 선택</option>{projectCategories.map(p=><option key={p} value={p}>{p}</option>)}</select>
      <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{...iS,width:"auto"}}>{Object.entries(P).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
      <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{...iS,width:"auto"}}>{Object.entries(S).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"flex-start"}}>
      <div style={{flex:1,minWidth:130}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:4}}>시작 날짜</label><input type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))} style={{...iS}}/></div>
      <div style={{flex:1,minWidth:130}}><label style={{fontSize:12,color:ddLabel?.urgent?"#ef4444":"#6b7280",fontWeight:600,display:"block",marginBottom:4}}>마감 날짜{ddLabel&&<span style={{marginLeft:6,color:ddLabel.color,fontWeight:700}}>({ddLabel.text})</span>}</label><input type="date" value={form.deadline||""} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))} style={{...iS,borderColor:ddLabel?.urgent?"#fca5a5":"#f0f1f3"}}/>{form.deadline&&<button onClick={()=>setForm(f=>({...f,deadline:""}))} style={{fontSize:11,color:"#9ca3af",background:"none",border:"none",cursor:"pointer",padding:"2px 0",marginTop:2}}>✕ 마감일 제거</button>}</div>
      <div style={{flex:2,minWidth:170}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:4}}>반복 설정</label><RepeatPicker repeat={form.repeat} repeatDays={form.repeatDays} due={form.due} onChange={(k,v)=>setForm(f=>({...f,[k]:v}))}/></div>
    </div>
    {isAdminUser&&<div style={{display:"flex",gap:6,marginBottom:8}}>{[{v:"public",l:"전체공개",c:"#2563eb"},{v:"private",l:"비공개",c:"#92400e"}].map(({v,l,c})=>(<button key={v} onClick={()=>setForm(f=>({...f,visibility:v}))} style={{border:`2px solid ${form.visibility===v?c:"#e5e7eb"}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",background:form.visibility===v?c+"18":"#fff",color:form.visibility===v?c:"#9ca3af",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{l}</button>))}</div>}
    <textarea value={form.memo} onChange={e=>setForm(f=>({...f,memo:e.target.value}))} placeholder="메모 (선택사항)" rows={2} style={{...iS,resize:"vertical",marginBottom:10,fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>
    <div style={{display:"flex",gap:8}}>
      <button onClick={onSubmit} style={{flex:1,background:"#0071CE",color:"#fff",border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{isEdit?"저장":"추가하기"}</button>
      <button onClick={onCancel} style={{background:"#f3f4f6",color:"#6b7280",border:"none",borderRadius:9,padding:"10px 18px",fontSize:14,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>취소</button>
    </div>
  </div>);
}
function ContractForm({initial,onSubmit,onCancel,allContracts}){
  const blank={name:"",phone:"",link:"",products:"",services:"",total:"",manager:"",notes:"",isRenewal:false,renewalCount:0,keywords:[],initialRanks:{}};
  const[memo,setMemo]=useState("");const[parsed,setParsed]=useState(initial?{name:initial.name,phone:initial.phone,link:initial.link,products:initial.products,services:initial.services,total:initial.total,manager:initial.manager||"",notes:initial.notes,isRenewal:initial.isRenewal||false,renewalCount:initial.renewalCount||0,keywords:initial.keywords||[],initialRanks:initial.initialRanks||{}}:blank);
  const[kwInput,setKwInput]=useState("");
  const addKeyword=()=>{const v=kwInput.trim();if(!v||parsed.keywords.includes(v))return;setParsed(p=>({...p,keywords:[...p.keywords,v]}));setKwInput("");};
  const removeKeyword=kw=>setParsed(p=>({...p,keywords:p.keywords.filter(k=>k!==kw),initialRanks:Object.fromEntries(Object.entries(p.initialRanks||{}).filter(([k])=>k!==kw))}));
  const[startDate,setStartDate]=useState(initial?.startDate||"");const[endDate,setEndDate]=useState(initial?.endDate||"");const[parseMsg,setParseMsg]=useState("");
  const[linkedMemoId,setLinkedMemoId]=useState(initial?.linkedMemoId||"");const[showManualLink,setShowManualLink]=useState(false);const[autoMatched,setAutoMatched]=useState(null);
  const iS={border:"1px solid #f0f1f3",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'Pretendard',-apple-system,sans-serif"};
  const handleParse=()=>{const r=parseMemo(memo);setParsed(p=>{const mergedKws=[...new Set([...(p.keywords||[]),...(r.keywords||[])])];return{...p,...r,keywords:mergedKws};});setParseMsg("파싱 완료!"+(r.keywords?.length>0?` (키워드 ${r.keywords.length}개 추출)`:""));if(r.name){const matched=allContracts.find(c=>c.name===r.name&&(!initial||c.id!==initial.id));if(matched){setAutoMatched(matched);setLinkedMemoId(matched.id);}else{setAutoMatched(null);}}};
  return(<div style={{background:"#fff",borderRadius:14,padding:22,border:"1px solid #f0f1f3",marginBottom:12}}>
    <p style={{margin:"0 0 14px",fontWeight:700,fontSize:15,color:"#0f1117"}}>{initial?.id?"계약 수정":"계약업체 등록"}</p>
    {!initial?.id&&<div style={{marginBottom:14,background:"#f5f3ff",borderRadius:10,padding:14}}>
      <label style={{fontSize:12,color:"#8468D3",fontWeight:700,display:"block",marginBottom:6}}>메모 붙여넣기 → 자동 파싱</label>
      <textarea value={memo} onChange={e=>setMemo(e.target.value)} rows={4} style={{...iS,resize:"vertical",fontFamily:"monospace",fontSize:12,marginBottom:8,background:"#fff"}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <button onClick={handleParse} style={{background:"#8468D3",color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>자동 파싱</button>
        {parseMsg&&<span style={{fontSize:12,color:"#10b981",fontWeight:600}}>{parseMsg}</span>}
      </div>
      {autoMatched&&(<div style={{marginTop:10,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:9,padding:"10px 14px"}}><div style={{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:6}}>동일 상호명 계약 발견 — 이전 메모 이어받을까요?</div><div style={{fontSize:11,color:"#6b7280",marginBottom:8}}>기존: <b>{autoMatched.name}</b> ({autoMatched.startDate} ~ {autoMatched.endDate}) {autoMatched.total}</div><div style={{display:"flex",gap:6}}><button onClick={()=>setLinkedMemoId(autoMatched.id)} style={{border:`2px solid ${linkedMemoId===autoMatched.id?"#f59e0b":"#e5e7eb"}`,borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",background:linkedMemoId===autoMatched.id?"#fffbeb":"#fff",color:linkedMemoId===autoMatched.id?"#b45309":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>이전 메모 이어받기</button><button onClick={()=>setLinkedMemoId("")} style={{border:`2px solid ${linkedMemoId===""?"#2563eb":"#e5e7eb"}`,borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",background:linkedMemoId===""?"#eff6ff":"#fff",color:linkedMemoId===""?"#2563eb":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>새 메모 시작</button></div></div>)}
      {!autoMatched&&(<div style={{marginTop:8}}><button onClick={()=>setShowManualLink(v=>!v)} style={{fontSize:11,color:"#6b7280",background:"none",border:"1px solid #f0f1f3",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>이전 계약과 수동 연결</button>{showManualLink&&(<div style={{marginTop:8,background:"#f7f8fa",borderRadius:8,padding:"10px 12px",border:"1px solid #f0f1f3"}}><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:5}}>이전 계약 선택 (메모 이어받기)</label><select value={linkedMemoId} onChange={e=>setLinkedMemoId(e.target.value)} style={{...iS,fontSize:12}}><option value="">연결 안 함 (새 메모 시작)</option>{allContracts.filter(c=>!initial||c.id!==initial.id).sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||"")).map(c=>(<option key={c.id} value={c.id}>{c.name} ({c.startDate}~{c.endDate}) {c.total||""}</option>))}</select>{linkedMemoId&&<div style={{fontSize:11,color:"#f59e0b",marginTop:4,fontWeight:600}}>선택한 계약의 메모를 이어서 사용합니다</div>}</div>)}</div>)}
    </div>}
    {(()=>{
    const autoRenCount=(()=>{const same=allContracts.filter(c=>c.name===parsed.name&&c.isRenewal&&(!initial||c.id!==initial.id));return same.length>0?Math.max(...same.map(c=>c.renewalCount||1))+1:1;})();
    return(<>
      <div style={{display:"flex",gap:8,marginBottom:10,justifyContent:"flex-start"}}>{[{v:false,l:"신규",c:"#0071CE"},{v:true,l:"재연장",c:"#8468D3"}].map(({v,l,c})=>(<button key={String(v)} onClick={()=>setParsed(p=>({...p,isRenewal:v,renewalCount:v?autoRenCount:0}))} style={{border:`2px solid ${parsed.isRenewal===v?c:"#f0f1f3"}`,borderRadius:9,padding:"6px 20px",fontSize:13,fontWeight:700,cursor:"pointer",background:parsed.isRenewal===v?c+"18":"#fff",color:parsed.isRenewal===v?c:"#9ca3af",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{l}</button>))}</div>
      {parsed.isRenewal&&(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,background:"#f5f3ff",borderRadius:9,padding:"8px 14px",border:"1px solid #e9d5ff"}}>
        <span style={{fontSize:12,fontWeight:700,color:"#8468D3"}}>재계약 회차</span>
        <input type="number" min="1" max="99" value={parsed.renewalCount||""} onChange={e=>setParsed(p=>({...p,renewalCount:parseInt(e.target.value)||1}))} style={{width:60,border:"1px solid #e9d5ff",borderRadius:7,padding:"5px 8px",fontSize:13,fontWeight:700,textAlign:"center",outline:"none",color:"#8468D3",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>
        <span style={{fontSize:13,fontWeight:800,color:"#8468D3"}}>→ R{parsed.renewalCount||autoRenCount}</span>
        <span style={{fontSize:11,color:"#adb5bd"}}>(자동계산, 수정 가능)</span>
      </div>)}
    </>);
  })()}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>상호명 *</label><input value={parsed.name} onChange={e=>setParsed(p=>({...p,name:e.target.value}))} style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>전화번호</label><input value={parsed.phone} onChange={e=>setParsed(p=>({...p,phone:e.target.value}))} style={{...iS}}/></div></div>
    <div style={{marginBottom:8}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>플레이스 링크</label><input value={parsed.link} onChange={e=>setParsed(p=>({...p,link:e.target.value}))} placeholder="https://..." style={{...iS}}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>상품내역</label><textarea value={parsed.products} onChange={e=>setParsed(p=>({...p,products:e.target.value}))} rows={3} style={{...iS,resize:"vertical"}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>서비스내역</label><textarea value={parsed.services} onChange={e=>setParsed(p=>({...p,services:e.target.value}))} rows={3} style={{...iS,resize:"vertical"}}/></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>총금액</label><input value={parsed.total} onChange={e=>setParsed(p=>({...p,total:e.target.value}))} placeholder="00만원" style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>담당자</label><input value={parsed.manager} onChange={e=>setParsed(p=>({...p,manager:e.target.value}))} placeholder="담당자 이름" style={{...iS}}/></div></div>
    <div style={{marginBottom:8}}><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>특이사항</label><textarea value={parsed.notes} onChange={e=>setParsed(p=>({...p,notes:e.target.value}))} rows={3} style={{...iS,resize:"vertical"}}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>계약 시작일 *</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{...iS}}/></div><div><label style={{fontSize:12,color:"#6b7280",fontWeight:600,display:"block",marginBottom:3}}>계약 종료일 *</label><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{...iS}}/></div></div>
    <div style={{marginBottom:12}}><label style={{fontSize:12,color:"#0891b2",fontWeight:600,display:"block",marginBottom:5}}>순위 체크 키워드 (2~5개 권장)</label><div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:7}}>{(parsed.keywords||[]).map((kw,i)=>(<span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,background:"#ecfeff",border:"1px solid #a5f3fc",borderRadius:99,padding:"3px 10px",fontSize:12,color:"#0891b2",fontWeight:600}}>{kw}<button onClick={()=>removeKeyword(kw)} style={{background:"none",border:"none",color:"#0891b2",cursor:"pointer",padding:0,fontSize:12,lineHeight:1}}>✕</button></span>))}</div><div style={{display:"flex",gap:6}}><input value={kwInput} onChange={e=>setKwInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addKeyword())} placeholder="키워드 입력 후 Enter 또는 + 버튼" style={{...iS,flex:1}}/><button onClick={addKeyword} style={{background:"#0891b2",color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>+</button></div></div>
    {(parsed.keywords||[]).length>0&&(<div style={{marginBottom:12,background:"#f0fdf4",borderRadius:10,padding:"12px 14px",border:"1px solid #bbf7d0"}}><label style={{fontSize:12,color:"#166534",fontWeight:600,display:"block",marginBottom:8}}>키워드별 시작 순위 (선택)</label><div style={{display:"flex",flexDirection:"column",gap:6}}>{(parsed.keywords||[]).map(kw=>(<div key={kw} style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,color:"#0f1117",fontWeight:500,flex:1}}>{kw}</span><input type="number" min="1" value={(parsed.initialRanks||{})[kw]||""} onChange={e=>setParsed(p=>({...p,initialRanks:{...(p.initialRanks||{}),[kw]:e.target.value}}))} placeholder="순위" style={{width:64,border:"1px solid #bbf7d0",borderRadius:7,padding:"5px 8px",fontSize:12,outline:"none",textAlign:"center",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/><span style={{fontSize:11,color:"#6b7280"}}>위</span></div>))}</div><div style={{fontSize:10,color:"#6b7280",marginTop:6}}>입력 시 이후 순위체크에서 상승/하락 자동 표시</div></div>)}
    <div style={{background:"#f0fdf4",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"#166534"}}>[순위체크] 7일 단위 자동 생성 · [리포트] 종료 3영업일 전</div>
    <div style={{display:"flex",gap:8}}><button onClick={()=>{if(!parsed.name.trim()||!startDate||!endDate)return alert("상호명과 계약 기간은 필수입니다.");if(startDate>=endDate)return alert("종료일이 시작일보다 늦어야 합니다.");const finalInitRanks={};(parsed.keywords||[]).forEach(kw=>{if(parsed.initialRanks?.[kw])finalInitRanks[kw]=parseInt(parsed.initialRanks[kw]);});onSubmit({...parsed,startDate,endDate,id:initial?.id||uid(),linkedMemoId:linkedMemoId||undefined,keywords:parsed.keywords||[],initialRanks:finalInitRanks});}} style={{flex:1,background:"#0071CE",color:"#fff",border:"none",borderRadius:9,padding:"11px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{initial?.id?"저장":"등록하기"}</button><button onClick={onCancel} style={{background:"#f3f4f6",color:"#6b7280",border:"none",borderRadius:9,padding:"11px 18px",fontSize:14,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>취소</button></div>
  </div>);
}
function DailyAlertModal({items,onClose}){
  const contractItems=items.filter(i=>i.type==="contract");const taskItems=items.filter(i=>i.type==="task");
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:500,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,0.2)"}}>
      <div style={{padding:"20px 22px 14px",background:"linear-gradient(135deg,#8468D3,#0071CE)",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:16,fontWeight:800,color:"#fff"}}>오늘의 일정 알림</div><div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginTop:2}}>{todayStr} · 총 {items.length}개</div></div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"14px 18px",display:"flex",flexDirection:"column",gap:14}}>
        {contractItems.length>0&&(<div><div style={{fontSize:12,fontWeight:800,color:"#0071CE",marginBottom:8}}><span style={{background:"#eff6ff",borderRadius:6,padding:"2px 8px"}}>계약 관리 ({contractItems.length})</span></div><div style={{display:"flex",flexDirection:"column",gap:6}}>{contractItems.map((item,i)=>(<div key={i} style={{background:"#eff6ff",borderRadius:10,padding:"10px 14px",border:"1px solid #bfdbfe",borderLeft:"4px solid #0071CE"}}><div style={{fontSize:12,fontWeight:700,color:"#1e40af",marginBottom:2}}>[{item.ceType}] {item.title}</div><div style={{fontSize:11,color:"#6b7280"}}>{item.sub}</div></div>))}</div></div>)}
        {taskItems.length>0&&(<div><div style={{fontSize:12,fontWeight:800,color:"#8468D3",marginBottom:8}}><span style={{background:"#f5f3ff",borderRadius:6,padding:"2px 8px"}}>일반 일정 ({taskItems.length})</span></div><div style={{display:"flex",flexDirection:"column",gap:6}}>{taskItems.map((item,i)=>(<div key={i} style={{background:item.urgent?"#fef2f2":"#f5f3ff",borderRadius:10,padding:"10px 14px",border:`1px solid ${item.urgent?"#fecaca":"#e9d5ff"}`,borderLeft:`4px solid ${item.urgent?"#ef4444":"#8468D3"}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:item.urgent?"#991b1b":"#5b21b6",marginBottom:2}}>{item.title}</div><div style={{fontSize:11,color:"#6b7280"}}>{item.sub}</div></div>{item.dday&&<span style={{fontSize:11,fontWeight:800,color:item.urgent?"#ef4444":"#8468D3",background:item.urgent?"#fef2f2":"#f5f3ff",borderRadius:6,padding:"2px 8px",border:`1px solid ${item.urgent?"#fecaca":"#e9d5ff"}`,flexShrink:0,marginLeft:8}}>{item.dday}</span>}</div></div>))}</div></div>)}
        {items.length===0&&<div style={{textAlign:"center",padding:"20px",color:"#9ca3af",fontSize:13}}>오늘 일정이 없습니다</div>}
      </div>
      <div style={{padding:"12px 18px 18px",borderTop:"1px solid #f0f1f3"}}><button onClick={onClose} style={{width:"100%",background:"#0071CE",color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>확인했습니다</button></div>
    </div>
  </div>);}
function ReportCard({report,targets,timeslot,isAdmin,onEdit}){
  const[open,setOpen]=useState(false);
  const tms=[{key:"calls",label:"콜수",unit:"콜"},{key:"materials",label:"자료수",unit:"개"},{key:"retarget",label:"재통픽스",unit:"개"}];
  const others=METRICS.filter(m=>!tms.find(t=>t.key===m.key));
  const avg=Math.round(tms.reduce((s,m)=>{const t=targets[m.key];return t?s+Math.min(100,(report[m.key]||0)/t*100):s;},0)/tms.length);
  const cc=avg>=100?"#10b981":avg>=70?"#f59e0b":"#0071CE";
  const isFinal=timeslot==="최종마감";
  return(<div style={{background:"#fff",borderRadius:12,border:"1px solid #f0f1f3",overflow:"hidden",marginBottom:7}}>
    <div onClick={()=>setOpen(v=>!v)} style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
      <div style={{width:40,height:40,borderRadius:"50%",background:cc+"18",border:`2px solid ${cc}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontWeight:800,fontSize:12,color:cc}}>{avg}%</span></div>
      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:"#0f1117"}}>{report.name}</div><div style={{fontSize:11,color:"#adb5bd"}}>{timeslot}</div></div>
      <div style={{display:"flex",gap:10}}>{tms.map(m=>{const v=report[m.key]||0,t=targets[m.key];const pp=t?Math.min(100,Math.round(v/t*100)):0;return(<div key={m.key} style={{textAlign:"center"}}><div style={{fontSize:10,color:"#adb5bd"}}>{m.label}</div><div style={{fontSize:12,fontWeight:800,color:pp>=100?"#10b981":pp>=70?"#f59e0b":"#0071CE"}}>{pp}%</div></div>);})}</div>
      <span style={{fontSize:11,color:"#c1c7d0"}}>{open?"▲":"▼"}</span>
    </div>
    {open&&<div style={{borderTop:"1px solid #f7f8fa",padding:"12px 14px"}}>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>{tms.map(m=>{const v=report[m.key]||0,t=targets[m.key];const pp=t?Math.min(100,Math.round(v/t*100)):0;return(<div key={m.key}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:11,fontWeight:600}}>{m.label}</span><span style={{fontSize:11,fontWeight:700,color:pp>=100?"#10b981":pp>=70?"#f59e0b":"#0071CE"}}>{v}/{t}{m.unit} ({pp}%)</span></div><div style={{background:"#f0f1f3",borderRadius:99,height:6}}><div style={{width:`${pp}%`,background:pp>=100?"#10b981":pp>=70?"#f59e0b":"#0071CE",borderRadius:99,height:"100%"}}/></div></div>);})}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:isFinal?10:0}}>{others.map(m=>(<div key={m.key} style={{background:"#f7f8fa",borderRadius:7,padding:"6px",textAlign:"center"}}><div style={{fontSize:10,color:"#adb5bd"}}>{m.label}</div><div style={{fontSize:16,fontWeight:800,color:"#0f1117"}}>{report[m.key]||0}</div></div>))}</div>
      {isFinal&&(<div style={{background:"#f5f3ff",borderRadius:10,padding:"10px 12px",border:"1px solid #e9d5ff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"#8468D3"}}>최종마감 추가 항목</div>
          {isAdmin&&onEdit&&<button onClick={onEdit} style={{background:"#8468D3",color:"#fff",border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>수정</button>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          <div style={{background:"#fff",borderRadius:8,padding:"8px",textAlign:"center",border:"1px solid #e9d5ff"}}><div style={{fontSize:10,color:"#adb5bd",marginBottom:2}}>일매출</div><div style={{fontSize:14,fontWeight:800,color:"#8468D3"}}>{report.dailySales?Number(report.dailySales).toLocaleString()+"원":"0원"}</div></div>
          <div style={{background:"#fff",borderRadius:8,padding:"8px",textAlign:"center",border:"1px solid #e9d5ff"}}><div style={{fontSize:10,color:"#adb5bd",marginBottom:2}}>도입률-연결</div><div style={{fontSize:14,fontWeight:800,color:"#0071CE"}}>{report.connRate||0}</div></div>
          <div style={{background:"#fff",borderRadius:8,padding:"8px",textAlign:"center",border:"1px solid #e9d5ff"}}><div style={{fontSize:10,color:"#adb5bd",marginBottom:2}}>도입률-30초↑</div><div style={{fontSize:14,fontWeight:800,color:"#10b981"}}>{report.rate30s||0}</div></div>
        </div>
      </div>)}
    </div>}
  </div>);}
function AdminEditReportModal({report,dateStr,onClose,onSave}){
  const[form,setForm]=useState({calls:report.calls||0,callTime:report.callTime||0,materials:report.materials||0,toss:report.toss||0,retarget:report.retarget||0,positive:report.positive||0,negative:report.negative||0,dailySales:report.dailySales||"",connRate:report.connRate||0,rate30s:report.rate30s||0});
  const[saving,setSaving]=useState(false);
  const iS={border:"1px solid #f0f1f3",borderRadius:8,padding:"6px 10px",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'Pretendard',-apple-system,sans-serif"};
  const handleSave=async()=>{setSaving(true);await onSave({...report,...form,dailySales:parseInt((form.dailySales||"").toString().replace(/[^0-9]/g,""))||0});setSaving(false);onClose();};
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.15)"}}>
      <div style={{padding:"18px 20px",borderBottom:"1px solid #f0f1f3",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontWeight:800,fontSize:14,color:"#0f1117"}}>실적 수정 (관리자)</div><div style={{fontSize:11,color:"#adb5bd",marginTop:2}}>{report.name} · {dateStr} · 최종마감</div></div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#adb5bd"}}>✕</button>
      </div>
      <div style={{padding:"16px 20px"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:10}}>기본 업무량</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:16}}>{METRICS.map(m=>(<div key={m.key}><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>{m.label} ({m.unit})</label><input type="number" min="0" value={form[m.key]} onChange={e=>setForm(f=>({...f,[m.key]:e.target.value}))} style={{...iS}}/></div>))}</div>
        <div style={{background:"#f5f3ff",borderRadius:10,padding:"12px",border:"1px solid #e9d5ff",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#8468D3",marginBottom:10}}>최종마감 추가 항목</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>일매출 (원)</label><input type="text" inputMode="numeric" value={form.dailySales?(parseInt(form.dailySales.toString().replace(/[^0-9]/g,""))||0).toLocaleString()+"원":""} onChange={e=>{const raw=e.target.value.replace(/[^0-9]/g,"");setForm(f=>({...f,dailySales:raw}));}} placeholder="예: 500000" style={{...iS,background:"#fff",border:"1px solid #e9d5ff"}}/></div>
            <div><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>도입률-연결</label><input type="number" min="0" value={form.connRate} onChange={e=>setForm(f=>({...f,connRate:e.target.value}))} style={{...iS,background:"#fff",border:"1px solid #e9d5ff"}}/></div>
            <div><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>도입률-30초이상</label><input type="number" min="0" value={form.rate30s} onChange={e=>setForm(f=>({...f,rate30s:e.target.value}))} style={{...iS,background:"#fff",border:"1px solid #e9d5ff"}}/></div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}><button onClick={handleSave} disabled={saving} style={{flex:1,background:"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{saving?"저장 중…":"저장"}</button><button onClick={onClose} style={{background:"#f3f4f6",color:"#6b7280",border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>취소</button></div>
      </div>
    </div>
  </div>);}

// ========== 매출현황 캘린더 탭 (그라데이션 헤더) ==========
function RevenueCalendarTab({contracts,user,profiles}){
  const[calY,setCalY]=useState(new Date().getFullYear());const[calM,setCalM]=useState(new Date().getMonth());const[selectedDay,setSelectedDay]=useState(null);const[selectedManager,setSelectedManager]=useState("all");
  const visibleContracts=useMemo(()=>(user.isAdmin||user.role==="manager")?contracts:contracts.filter(c=>c.manager===user.name),[contracts,user]);
  const managers=useMemo(()=>[...new Set(visibleContracts.map(c=>c.manager).filter(Boolean))].sort(),[visibleContracts]);
  const filteredContracts=useMemo(()=>selectedManager==="all"?visibleContracts:visibleContracts.filter(c=>c.manager===selectedManager),[visibleContracts,selectedManager]);
  const monthPrefix=`${calY}-${String(calM+1).padStart(2,"0")}`;
  const contractsByDay=useMemo(()=>{const map={};filteredContracts.forEach(c=>{if(!c.startDate||!c.startDate.startsWith(monthPrefix))return;const d=parseInt(c.startDate.slice(8));if(!map[d])map[d]=[];map[d].push(c);});return map;},[filteredContracts,monthPrefix]);
  const monthTotal=useMemo(()=>{let count=0,amount=0,newCount=0,newAmount=0,renCount=0,renAmount=0;filteredContracts.forEach(c=>{if(!c.startDate||!c.startDate.startsWith(monthPrefix))return;const a=parseAmount(c.total);count++;amount+=a;if(c.isRenewal){renCount++;renAmount+=a;}else{newCount++;newAmount+=a;}});return{count,amount,newCount,newAmount,renCount,renAmount};},[filteredContracts,monthPrefix]);
  const managerMonthStats=useMemo(()=>{const map={};visibleContracts.forEach(c=>{if(!c.startDate||!c.startDate.startsWith(monthPrefix)||!c.manager)return;if(!map[c.manager])map[c.manager]={name:c.manager,count:0,amount:0,newCount:0,newAmount:0,renCount:0,renAmount:0};const a=parseAmount(c.total);map[c.manager].count++;map[c.manager].amount+=a;if(c.isRenewal){map[c.manager].renCount++;map[c.manager].renAmount+=a;}else{map[c.manager].newCount++;map[c.manager].newAmount+=a;}});return Object.values(map).sort((a,b)=>b.amount-a.amount);},[visibleContracts,monthPrefix]);
  const firstDay=new Date(calY,calM,1).getDay();const dim=new Date(calY,calM+1,0).getDate();const cells=[...Array(firstDay).fill(null),...Array.from({length:dim},(_,i)=>i+1)];while(cells.length%7)cells.push(null);
  const selDayContracts=useMemo(()=>selectedDay?filteredContracts.filter(c=>c.startDate===selectedDay).sort((a,b)=>parseAmount(b.total)-parseAmount(a.total)):[],[filteredContracts,selectedDay]);
  const selDayTotal=selDayContracts.reduce((s,c)=>s+parseAmount(c.total),0);
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    {/* 상단 헤더 - 브랜드 그라데이션 */}
    <div style={{background:"linear-gradient(135deg,#8468D3 0%,#0071CE 100%)",borderRadius:14,padding:"18px 22px",color:"#fff",boxShadow:"0 8px 24px rgba(132,104,211,0.25)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div><div style={{fontSize:11,opacity:0.85,fontWeight:600,marginBottom:2}}>{calY}년 {calM+1}월 총 매출{selectedManager!=="all"&&` · ${selectedManager}`}</div><div style={{fontSize:28,fontWeight:900,letterSpacing:-0.5}}>{fmtAmount(monthTotal.amount)}</div></div>
        <div style={{textAlign:"right",background:"rgba(255,255,255,0.18)",borderRadius:12,padding:"10px 16px",backdropFilter:"blur(8px)"}}><div style={{fontSize:11,opacity:0.9,fontWeight:600}}>총 계약</div><div style={{fontSize:26,fontWeight:900}}>{monthTotal.count}<span style={{fontSize:14,fontWeight:700,marginLeft:2,opacity:0.85}}>건</span></div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{background:"rgba(255,255,255,0.18)",borderRadius:10,padding:"10px 14px",backdropFilter:"blur(4px)"}}><div style={{fontSize:11,fontWeight:700,opacity:0.9,marginBottom:4}}>신규</div><div style={{fontSize:20,fontWeight:900}}>{monthTotal.newCount}건</div><div style={{fontSize:13,fontWeight:700,opacity:0.9,marginTop:2}}>{fmtAmount(monthTotal.newAmount)}</div></div>
        <div style={{background:"rgba(255,255,255,0.18)",borderRadius:10,padding:"10px 14px",backdropFilter:"blur(4px)"}}><div style={{fontSize:11,fontWeight:700,opacity:0.9,marginBottom:4}}>재연장</div><div style={{fontSize:20,fontWeight:900}}>{monthTotal.renCount}건</div><div style={{fontSize:13,fontWeight:700,opacity:0.9,marginTop:2}}>{fmtAmount(monthTotal.renAmount)}</div></div>
      </div>
    </div>
    <div style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #f0f1f3"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><button onClick={()=>{let m=calM-1,y=calY;if(m<0){m=11;y--;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #f0f1f3",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:16}}>‹</button><div style={{fontWeight:800,fontSize:16,color:"#0f1117"}}>{calY}년 {calM+1}월</div><button onClick={()=>{let m=calM+1,y=calY;if(m>11){m=0;y++;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #f0f1f3",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:16}}>›</button></div>
      {user.isAdmin&&managers.length>0&&(<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14,justifyContent:"center"}}><button onClick={()=>setSelectedManager("all")} style={{border:`1.5px solid ${selectedManager==="all"?"#0071CE":"#f0f1f3"}`,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",background:selectedManager==="all"?"#f0f7ff":"#fff",color:selectedManager==="all"?"#0071CE":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>전체</button>{managers.map(m=>(<button key={m} onClick={()=>setSelectedManager(m)} style={{border:`1.5px solid ${selectedManager===m?"#8468D3":"#f0f1f3"}`,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",background:selectedManager===m?"#f5f3ff":"#fff",color:selectedManager===m?"#8468D3":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{m}</button>))}</div>)}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>{DAYS_KR.map((d,i)=>(<div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:i===0?"#ef4444":i===6?"#0071CE":"#adb5bd",padding:"5px 0"}}>{d}</div>))}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>{cells.map((day,i)=>{if(!day)return <div key={i}/>;const ds=`${monthPrefix}-${String(day).padStart(2,"0")}`;const isToday=ds===todayStr;const isSel=selectedDay===ds;const dow=(firstDay+day-1)%7;const dayContracts=contractsByDay[day]||[];const dayTotal=dayContracts.reduce((s,c)=>s+parseAmount(c.total),0);const hasContracts=dayContracts.length>0;return(<div key={i} onClick={()=>hasContracts&&setSelectedDay(isSel?null:ds)} style={{minHeight:window.innerWidth<=768?130:98,background:isSel?"linear-gradient(135deg,#f0f5ff,#e8f4fd)":isToday?"#f0f7ff":hasContracts?"#f7f8fa":"#fff",border:`1.5px solid ${isSel?"#0071CE":isToday?"#bfd7f5":hasContracts?"#e2e8f0":"#f0f1f3"}`,borderRadius:9,padding:"6px 5px",cursor:hasContracts?"pointer":"default",overflow:"hidden",boxSizing:"border-box",transition:"all 0.15s"}}><div style={{fontSize:11,fontWeight:isToday?800:500,color:isToday?"#0071CE":dow===0?"#ef4444":dow===6?"#3b82f6":"#374151",marginBottom:3,textAlign:"center"}}>{isToday?<span style={{background:"#0071CE",color:"#fff",borderRadius:"50%",padding:"1px 6px"}}>{day}</span>:day}</div>{hasContracts&&(<><div style={{fontSize:10,fontWeight:800,color:"#0071CE",textAlign:"center",marginBottom:4,background:"rgba(255,255,255,0.8)",borderRadius:5,padding:"1px 2px"}}>{fmtAmount(dayTotal)}</div><div style={{display:"flex",flexDirection:"column",gap:2}}>{dayContracts.slice(0,2).map((c,ci)=>(<div key={ci} style={{fontSize:9,background:"#fff",color:"#374151",borderRadius:4,padding:"2px 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,border:"1px solid #f0f1f3"}}><b style={{color:c.isRenewal?"#8468D3":"#0071CE",marginRight:2}}>{c.isRenewal?`R${c.renewalCount||""}`:"N"}</b>{c.manager?<b style={{color:"#8468D3"}}>{c.manager}·</b>:""}{c.name}</div>))}{dayContracts.length>2&&<div style={{fontSize:9,color:"#0071CE",textAlign:"center",fontWeight:700,marginTop:1}}>+{dayContracts.length-2}건</div>}</div></>)}</div>);})}
      </div>
    </div>
    {selectedDay&&selDayContracts.length>0&&(<div style={{background:"#fff",borderRadius:12,border:"1px solid #f0f1f3",overflow:"hidden"}}><div style={{padding:"13px 20px",borderBottom:"1px solid #f0f1f3",background:"linear-gradient(90deg,#f0f7ff,#f5f3ff)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}><span style={{fontWeight:800,fontSize:14,color:"#0f1117"}}>{new Date(selectedDay+"T00:00:00").toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"})}</span><span style={{fontSize:12,color:"#0071CE",fontWeight:700,background:"#f0f7ff",borderRadius:99,padding:"3px 10px",border:"1px solid #bfd7f5"}}>{selDayContracts.length}건 · {fmtAmount(selDayTotal)}</span></div><button onClick={()=>setSelectedDay(null)} style={{background:"none",border:"none",color:"#adb5bd",cursor:"pointer",fontSize:16}}>✕</button></div><div style={{padding:"14px 18px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>{selDayContracts.map(c=>(<div key={c.id} style={{background:"#f7f8fa",borderRadius:11,padding:"12px 14px",border:"1px solid #f0f1f3"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>{c.manager?<Avatar name={c.manager} img={profiles[c.manager]} size={34} border="2px solid #fff"/>:<div style={{width:34,height:34,borderRadius:"50%",background:"#f0f1f3",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#adb5bd"}}>?</div>}<div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:1}}><span style={{fontSize:10,fontWeight:800,color:c.isRenewal?"#8468D3":"#0071CE",background:c.isRenewal?"#f5f3ff":"#f0f7ff",borderRadius:4,padding:"1px 5px"}}>{c.isRenewal?`R${c.renewalCount||""}`:"N"}</span><span style={{fontWeight:700,fontSize:13,color:"#0f1117",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span></div><div style={{fontSize:11,color:c.manager?"#8468D3":"#adb5bd",fontWeight:600}}>{c.manager||"담당자 미지정"}</div></div>{c.total&&<div style={{background:"linear-gradient(135deg,#8468D3,#0071CE)",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:12,fontWeight:800,whiteSpace:"nowrap"}}>{c.total}</div>}</div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{c.phone&&<Badge label={c.phone} color="#6b7280" bg="#f3f4f6"/>}{c.endDate&&<Badge label={`종료: ${c.endDate}`} color="#0071CE" bg="#f0f7ff"/>}{c.link&&<a href={c.link} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#0071CE",textDecoration:"none",background:"#f0f7ff",borderRadius:6,padding:"2px 7px",fontWeight:600}}>링크</a>}</div>{c.notes&&<div style={{marginTop:6,fontSize:11,color:"#6b7280",background:"#fff",borderRadius:6,padding:"5px 8px",borderLeft:"3px solid #e2e8f0"}}>{c.notes}</div>}</div>))}</div></div>)}
    {user.isAdmin&&selectedManager==="all"&&managerMonthStats.length>0&&(<div style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #f0f1f3"}}><div style={{fontWeight:700,fontSize:13,color:"#0f1117",marginBottom:10}}>이달 담당자별 매출</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{managerMonthStats.map((s,i)=>(<div key={s.name} style={{display:"flex",alignItems:"center",gap:10,background:i===0?"#f0f7ff":"#f7f8fa",borderRadius:10,padding:"10px 14px",border:i===0?"1px solid #bfd7f5":"1px solid #f0f1f3"}}><div style={{fontSize:16}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}</div><Avatar name={s.name} img={profiles[s.name]} size={28} border="2px solid #fff"/><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:"#0f1117"}}>{s.name}</div><div style={{fontSize:11,color:"#0071CE",fontWeight:700,marginTop:1}}>{fmtAmount(s.amount)} <span style={{color:"#adb5bd",fontWeight:400}}>({s.count}건)</span></div></div><div style={{display:"flex",gap:6,flexShrink:0}}><div style={{textAlign:"center",background:"#f0f7ff",borderRadius:8,padding:"5px 10px"}}><div style={{fontSize:9,color:"#0071CE",fontWeight:600,marginBottom:1}}>신규</div><div style={{fontSize:12,fontWeight:800,color:"#0071CE"}}>{s.newCount}건</div><div style={{fontSize:10,color:"#0071CE",fontWeight:600}}>{fmtAmount(s.newAmount)}</div></div><div style={{textAlign:"center",background:"#f5f3ff",borderRadius:8,padding:"5px 10px"}}><div style={{fontSize:9,color:"#8468D3",fontWeight:600,marginBottom:1}}>재연장</div><div style={{fontSize:12,fontWeight:800,color:"#8468D3"}}>{s.renCount}건</div><div style={{fontSize:10,color:"#8468D3",fontWeight:600}}>{fmtAmount(s.renAmount)}</div></div></div></div>))}</div></div>)}
    {filteredContracts.filter(c=>c.startDate?.startsWith(monthPrefix)).length===0&&(<div style={{background:"#fff",borderRadius:12,padding:"40px 20px",border:"1px solid #f0f1f3",textAlign:"center"}}><div style={{fontSize:13,color:"#adb5bd"}}>이 달 계약이 없습니다</div></div>)}
  </div>);}

// ========== 매출 랭킹 탭 (BEST/2ND/3RD 뱃지) ==========
function RankingTab({contracts,profiles,accounts}){const now=new Date();const[selYear,setSelYear]=useState(now.getFullYear());const[selMonth,setSelMonth]=useState(now.getMonth()+1);const managerStats=useMemo(()=>{const staffNames=new Set(accounts.filter(a=>!a.role||a.role==="staff").map(a=>a.name));const map={};contracts.forEach(c=>{if(!c.manager||!c.startDate)return;if(!staffNames.has(c.manager))return;const[y,m]=c.startDate.split("-");if(parseInt(y)!==selYear||parseInt(m)!==selMonth)return;if(!map[c.manager])map[c.manager]={name:c.manager,count:0,amount:0};map[c.manager].count++;map[c.manager].amount+=parseAmount(c.total);});return Object.values(map).sort((a,b)=>b.amount-a.amount);},[contracts,selYear,selMonth,accounts]);const top=managerStats.slice(0,3);const rest=managerStats.slice(3);const podium=[{rank:2,size:100,height:120,color:"#94a3b8",border:"#94a3b8"},{rank:1,size:140,height:160,color:"#0071CE",border:"#8468D3"},{rank:3,size:80,height:90,color:"#b45309",border:"#b45309"}];return(<div><div style={{background:"#fff",borderRadius:14,padding:"14px 20px",marginBottom:20,border:"1px solid #f0f1f3",display:"flex",alignItems:"center",gap:12}}><select value={selYear} onChange={e=>setSelYear(parseInt(e.target.value))} style={{border:"1px solid #f0f1f3",borderRadius:8,padding:"6px 10px",fontSize:12,background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}년</option>)}</select><select value={selMonth} onChange={e=>setSelMonth(parseInt(e.target.value))} style={{border:"1px solid #f0f1f3",borderRadius:8,padding:"6px 10px",fontSize:12,background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}</select><span style={{fontSize:13,fontWeight:600,color:"#0f1117"}}>{selYear}년 {selMonth}월 매출 랭킹</span></div>{managerStats.length===0?(<div style={{background:"#fff",borderRadius:14,padding:"60px 20px",border:"1px solid #f0f1f3",textAlign:"center"}}><div style={{fontSize:14,color:"#adb5bd"}}>이 달 계약 데이터가 없습니다</div></div>):(<><div style={{background:"linear-gradient(160deg,#f0f5ff,#e8f4fd)",borderRadius:20,padding:"32px 20px 0",marginBottom:16,overflow:"hidden",border:"1px solid #dbeafe"}}><div style={{textAlign:"center",fontSize:14,fontWeight:800,color:"#0f1117",marginBottom:24}}>{selYear}년 {selMonth}월 TOP 3</div><div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:12}}>{podium.map(({rank,size,height,color,border})=>{const s=top[rank-1];if(!s)return <div key={rank} style={{width:size+40,height:height+size+60}}/>;return(<div key={rank} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0}}><div style={{position:"relative",marginBottom:rank===1?18:12}}><div style={{width:size,height:size,borderRadius:"50%",border:rank===1?"4px solid transparent":"3px solid "+border,background:rank===1?"linear-gradient(white,white) padding-box, linear-gradient(135deg,#8468D3,#0071CE) border-box":"none",overflow:"hidden",boxShadow:rank===1?"0 8px 28px rgba(132,104,211,0.35)":"0 4px 12px rgba(0,0,0,0.1)"}}>{profiles[s.name]?<img src={profiles[s.name]} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={s.name}/>:<div style={{width:"100%",height:"100%",background:ACOLORS[s.name.charCodeAt(0)%ACOLORS.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:800,color:"#fff"}}>{s.name.slice(0,1)}</div>}</div>{rank===1&&<div style={{position:"absolute",bottom:-14,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#8468D3,#0071CE)",color:"#fff",borderRadius:99,padding:"4px 14px",fontSize:11,fontWeight:800,whiteSpace:"nowrap",letterSpacing:"0.8px",border:"2px solid #fff",boxShadow:"0 2px 10px rgba(132,104,211,0.4)"}}>BEST</div>}{rank===2&&<div style={{position:"absolute",bottom:-10,left:"50%",transform:"translateX(-50%)",background:"#94a3b8",color:"#fff",borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:700,whiteSpace:"nowrap",border:"2px solid #fff"}}>2ND</div>}{rank===3&&<div style={{position:"absolute",bottom:-10,left:"50%",transform:"translateX(-50%)",background:"#b45309",color:"#fff",borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:700,whiteSpace:"nowrap",border:"2px solid #fff"}}>3RD</div>}</div><div style={{fontSize:rank===1?14:12,fontWeight:800,color:"#0f1117",marginBottom:2,marginTop:4,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{s.name}</div><div style={{fontSize:rank===1?13:11,color:rank===1?"#0071CE":"#6b7280",fontWeight:700,marginBottom:8,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{fmtAmount(s.amount)}</div><div style={{width:size+40,height,background:"#fff",borderRadius:"12px 12px 0 0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:"0 -2px 12px rgba(0,0,0,0.06)",border:"1px solid #f0f1f3",borderBottom:"none"}}><div style={{fontSize:rank===1?32:24,fontWeight:900,color:rank===1?"#0071CE":color,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{rank}</div><div style={{fontSize:11,color:"#adb5bd",fontWeight:600,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{s.count}건</div></div></div>);})}
</div></div>{rest.length>0&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>{rest.map((s,i)=>(<div key={s.name} style={{background:"#fff",borderRadius:14,padding:"14px 18px",border:"1px solid #f0f1f3",display:"flex",alignItems:"center",gap:14}}><div style={{width:32,height:32,borderRadius:8,background:"#f7f8fa",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#adb5bd",flexShrink:0}}>{i+4}</div><Avatar name={s.name} img={profiles[s.name]} size={40} border="2px solid #f0f1f3"/><div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#0f1117",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{s.name}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:800,color:"#0f1117",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{fmtAmount(s.amount)}</div><div style={{fontSize:11,color:"#adb5bd",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{s.count}건</div></div></div>))}</div>)}{accounts.filter(a=>(!a.role||a.role==="staff")&&!managerStats.find(s=>s.name===a.name)).length>0&&(<div style={{marginTop:12,background:"#f7f8fa",borderRadius:12,padding:"12px 16px",border:"1px solid #f0f1f3"}}><div style={{fontSize:12,color:"#adb5bd",marginBottom:8,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>이달 계약 없음</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{accounts.filter(a=>(!a.role||a.role==="staff")&&!managerStats.find(s=>s.name===a.name)).map(a=>(<div key={a.name} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",borderRadius:8,padding:"5px 10px",border:"1px solid #f0f1f3"}}><Avatar name={a.name} img={profiles[a.name]} size={22} border="1px solid #f0f1f3"/><span style={{fontSize:12,color:"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{a.name}</span></div>))}</div></div>)}</>)}</div>);}

function AdminTab({projectCategories,setProjectCategories,targets,setTargets,accounts,setAccounts,webhookUrl,setWebhookUrl,rankWebhookUrl,setRankWebhookUrl,allData,loadAllData,loadingAll,contracts,navOrder,setNavOrder}){
  const[newProjInput,setNewProjInput]=useState("");const[newAccName,setNewAccName]=useState("");const[newAccPw,setNewAccPw]=useState("");const[editTargets,setEditTargets]=useState(targets);const[section,setSection]=useState("accounts");
  const iS={border:"1px solid #f0f1f3",borderRadius:8,padding:"6px 10px",fontSize:12,outline:"none",fontFamily:"'Pretendard',-apple-system,sans-serif"};
  const addProject=async()=>{const v=newProjInput.trim();if(!v||projectCategories.includes(v))return;const list=[...projectCategories,v];await st.set("config:projects",list);setProjectCategories(list);setNewProjInput("");};
  const removeProject=async name=>{const list=projectCategories.filter(p=>p!==name);await st.set("config:projects",list);setProjectCategories(list);};
  const[newAccRole,setNewAccRole]=useState("staff");const addAccount=async()=>{if(!newAccName.trim()||!newAccPw.trim())return;const list=await st.get("accounts:all")||[];if(list.find(a=>a.name===newAccName.trim()))return alert("이미 존재하는 이름입니다.");list.push({name:newAccName.trim(),password:newAccPw.trim(),role:newAccRole});await st.set("accounts:all",list);setAccounts(list);setNewAccName("");setNewAccPw("");setNewAccRole("staff");};
  const delAccount=async name=>{const list=(await st.get("accounts:all")||[]).filter(a=>a.name!==name);await st.set("accounts:all",list);setAccounts(list);};
  const saveTargets=async()=>{await st.set("wt:targets",editTargets);setTargets({...editTargets});alert("저장되었습니다!");};
  const saveWebhook=async()=>{await st.set("wt:webhook",webhookUrl);await st.set("wt:rankWebhook",rankWebhookUrl);alert("저장되었습니다!");};
  const SECTIONS=[{id:"accounts",label:"계정관리"},{id:"projects",label:"프로젝트"},{id:"targets",label:"목표 설정"},{id:"webhook",label:"알림 설정"},{id:"monthly",label:"월별 매출현황"},{id:"history",label:"누적 데이터"},{id:"navorder",label:"메뉴 순서"}];
  const monthlyStats=useMemo(()=>{const map={};contracts.forEach(c=>{if(!c.manager||!c.startDate)return;const[y,m]=c.startDate.split("-");const key=`${y}-${m}`;if(!map[key])map[key]={label:`${y}년 ${parseInt(m)}월`,managers:{},newCount:0,newAmount:0,renCount:0,renAmount:0};if(!map[key].managers[c.manager])map[key].managers[c.manager]={count:0,amount:0,newCount:0,renCount:0};map[key].managers[c.manager].count++;map[key].managers[c.manager].amount+=parseAmount(c.total);if(c.isRenewal){map[key].managers[c.manager].renCount++;map[key].renCount++;map[key].renAmount+=parseAmount(c.total);}else{map[key].managers[c.manager].newCount++;map[key].newCount++;map[key].newAmount+=parseAmount(c.total);}});return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,v])=>({key:k,label:v.label,managers:v.managers,newCount:v.newCount,newAmount:v.newAmount,renCount:v.renCount,renAmount:v.renAmount}));},[contracts]);
  return(<div style={{display:"grid",gridTemplateColumns:window.innerWidth<=768?"1fr":"200px 1fr",gap:window.innerWidth<=768?0:20}}><div style={{display:"flex",flexDirection:window.innerWidth<=768?"row":"column",gap:window.innerWidth<=768?4:4,overflowX:window.innerWidth<=768?"auto":"visible",marginBottom:window.innerWidth<=768?12:0,paddingBottom:window.innerWidth<=768?4:0,flexShrink:0}}>{SECTIONS.map(s=>(<button key={s.id} onClick={()=>setSection(s.id)} style={{textAlign:"left",padding:window.innerWidth<=768?"8px 14px":"9px 12px",borderRadius:window.innerWidth<=768?99:10,border:window.innerWidth<=768?"1.5px solid "+(section===s.id?"#0071CE":"#f0f1f3"):"none",background:section===s.id?"#f0f7ff":"transparent",color:section===s.id?"#0071CE":"#374151",fontWeight:section===s.id?600:400,fontSize:12,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif",whiteSpace:"nowrap",flexShrink:0}}>{s.label}</button>))}</div><div style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #f0f1f3"}}>{section==="accounts"&&(<div>
  <div style={{fontWeight:700,fontSize:13,color:"#0f1117",marginBottom:14}}>계정 관리</div>
  <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14,background:"#f7f8fa",borderRadius:10,padding:"12px 14px",border:"1px solid #f0f1f3"}}>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <input value={newAccName} onChange={e=>setNewAccName(e.target.value)} placeholder="이름" style={{...iS,flex:1,minWidth:80}}/>
      <input value={newAccPw} onChange={e=>setNewAccPw(e.target.value)} placeholder="비밀번호" style={{...iS,flex:1,minWidth:80}}/>
    </div>
    <div style={{display:"flex",gap:6,alignItems:"center"}}>
      <span style={{fontSize:11,fontWeight:600,color:"#6b7280",flexShrink:0}}>권한:</span>
      {[{v:"staff",l:"사원"},{v:"manager",l:"관리자"}].map(({v,l})=>(
        <button key={v} onClick={()=>setNewAccRole(v)} style={{border:`1.5px solid ${newAccRole===v?"#0071CE":"#e5e7eb"}`,borderRadius:99,padding:"3px 12px",fontSize:11,fontWeight:600,cursor:"pointer",background:newAccRole===v?"#f0f7ff":"#fff",color:newAccRole===v?"#0071CE":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{l}</button>
      ))}
      <button onClick={addAccount} style={{marginLeft:"auto",background:"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>+ 생성</button>
    </div>
  </div>
  {accounts.length===0?<p style={{fontSize:12,color:"#adb5bd",textAlign:"center"}}>등록된 계정이 없습니다</p>:
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {accounts.map(a=>(
      <div key={a.name} style={{display:"flex",alignItems:"center",gap:8,background:"#f7f8fa",borderRadius:9,padding:"9px 12px",border:"1px solid #f0f1f3"}}>
        <span style={{fontSize:10,fontWeight:700,color:a.role==="manager"?"#8468D3":"#0071CE",background:a.role==="manager"?"#f5f3ff":"#f0f7ff",borderRadius:5,padding:"1px 7px",border:`1px solid ${a.role==="manager"?"#e9d5ff":"#bfd7f5"}`,flexShrink:0}}>{a.role==="manager"?"관리자":"사원"}</span>
        <span style={{fontWeight:600,fontSize:12,color:"#0f1117",flex:1}}>{a.name}</span>
        <span style={{fontSize:11,color:"#adb5bd",fontFamily:"monospace"}}>{a.password}</span>
        <button onClick={()=>delAccount(a.name)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:12,fontFamily:"'Pretendard',-apple-system,sans-serif",flexShrink:0}}>삭제</button>
      </div>
    ))}
  </div>}
</div>)}{section==="projects"&&(<div><div style={{fontWeight:700,fontSize:13,marginBottom:14,color:"#0f1117"}}>프로젝트 카테고리</div><div style={{display:"flex",gap:8,marginBottom:10}}><input value={newProjInput} onChange={e=>setNewProjInput(e.target.value)} placeholder="새 프로젝트명" onKeyDown={e=>e.key==="Enter"&&addProject()} style={{...iS,flex:1}}/><button onClick={addProject} style={{background:"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>+ 추가</button></div>{projectCategories.length===0?<p style={{fontSize:12,color:"#adb5bd",textAlign:"center"}}>등록된 프로젝트가 없습니다</p>:<div style={{display:"flex",flexDirection:"column",gap:5}}>{projectCategories.map(p=>(<div key={p} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f7f8fa",borderRadius:9,padding:"9px 12px"}}><span style={{fontWeight:600,fontSize:12,color:"#0f1117"}}>{p}</span><button onClick={()=>removeProject(p)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:12}}>✕</button></div>))}</div>}</div>)}{section==="targets"&&(<div><div style={{fontWeight:700,fontSize:13,marginBottom:14,color:"#0f1117"}}>업무보고 목표 설정</div>{[{key:"calls",label:"목표 콜수",unit:"콜"},{key:"materials",label:"목표 자료수",unit:"개"},{key:"retarget",label:"목표 재통픽스",unit:"개"}].map(({key,label,unit})=>(<div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><label style={{fontSize:12,fontWeight:600,color:"#374151",minWidth:110}}>{label}</label><input type="number" min="0" value={editTargets[key]} onChange={e=>setEditTargets(t=>({...t,[key]:parseInt(e.target.value)||0}))} style={{...iS,width:80}}/><span style={{fontSize:11,color:"#adb5bd"}}>{unit}</span></div>))}<button onClick={saveTargets} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>저장</button></div>)}{section==="webhook"&&(<div><div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#0f1117"}}>Discord 알림 설정</div><div style={{marginBottom:14}}><p style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:5}}>📢 기본 알림 채널 (실적보고 · 긴급메모 · 메모요약)</p><div style={{display:"flex",gap:8}}><input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." style={{...iS,flex:1,fontSize:11}}/></div></div><div style={{marginBottom:14}}><p style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:5}}>📊 순위 알림 채널 (순위 하락 알림 전용)</p><div style={{display:"flex",gap:8}}><input value={rankWebhookUrl} onChange={e=>setRankWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." style={{...iS,flex:1,fontSize:11}}/></div></div><button onClick={saveWebhook} style={{background:"#5865F2",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>저장</button></div>)}{section==="monthly"&&(<div><div style={{fontWeight:700,fontSize:13,marginBottom:14,color:"#0f1117"}}>월별 사원별 매출 현황</div>{monthlyStats.length===0?<p style={{fontSize:12,color:"#adb5bd",textAlign:"center",padding:"20px 0"}}>계약 데이터가 없습니다</p>:monthlyStats.map(ms=>(<div key={ms.key} style={{marginBottom:18}}><div style={{fontWeight:700,fontSize:12,color:"#0f1117",padding:"7px 10px",background:"#f0f7ff",borderRadius:7,marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{ms.label}</span><div style={{display:"flex",gap:8}}><span style={{fontSize:11,color:"#0071CE",fontWeight:600,background:"#f0f7ff",borderRadius:5,padding:"1px 7px"}}>N {ms.newCount}건 {fmtAmount(ms.newAmount)}</span><span style={{fontSize:11,color:"#8468D3",fontWeight:600,background:"#f5f3ff",borderRadius:5,padding:"1px 7px"}}>R {ms.renCount}건 {fmtAmount(ms.renAmount)}</span></div></div>{Object.entries(ms.managers).sort((a,b)=>b[1].amount-a[1].amount).map(([name,stat],ri)=>(<div key={name} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:ri===0?"#f0f7ff":"#f7f8fa",borderRadius:9,marginBottom:5,border:ri===0?"1px solid #bfd7f5":"1px solid #f0f1f3"}}><span style={{fontSize:14}}>{ri===0?"🥇":ri===1?"🥈":ri===2?"🥉":`${ri+1}위`}</span><span style={{fontWeight:600,fontSize:12,flex:1,color:"#0f1117"}}>{name}</span><span style={{fontSize:11,color:"#0071CE",fontWeight:600,background:"#f0f7ff",borderRadius:5,padding:"1px 6px"}}>N {stat.newCount}</span><span style={{fontSize:11,color:"#8468D3",fontWeight:600,background:"#f5f3ff",borderRadius:5,padding:"1px 6px"}}>R {stat.renCount}</span><span style={{fontSize:12,color:"#374151",fontWeight:700}}>{fmtAmount(stat.amount)}</span></div>))}<div style={{display:"flex",justifyContent:"flex-end",gap:14,padding:"7px 10px",borderTop:"1px solid #f0f1f3",fontSize:11,color:"#6b7280"}}><span>합계: <b style={{color:"#0071CE"}}>{Object.values(ms.managers).reduce((s,m)=>s+m.count,0)}건</b></span><span><b style={{color:"#8468D3"}}>{fmtAmount(Object.values(ms.managers).reduce((s,m)=>s+m.amount,0))}</b></span></div></div>))}</div>)}{section==="history"&&(<div><div style={{fontWeight:700,fontSize:13,marginBottom:14,color:"#0f1117"}}>업무보고 누적 데이터</div><div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><button onClick={loadAllData} disabled={loadingAll} style={{background:"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{loadingAll?"불러오는 중…":"데이터 불러오기"}</button>{Object.keys(allData).length>0&&(<><button onClick={()=>{const wb=XLSX.utils.book_new();Object.entries(allData).sort().forEach(([date,tsByDate])=>{Object.entries(tsByDate).forEach(([ts,reps])=>{const headers=["이름","콜수","콜시간(분)","자료수","토스","재통픽스","긍정백톡","부정백톡"];const rows=reps.map(r=>[r.name,r.calls||0,r.callTime||0,r.materials||0,r.toss||0,r.retarget||0,r.positive||0,r.negative||0]);const tot=["합계",...METRICS.map(m=>reps.reduce((s,r)=>s+(r[m.key]||0),0))];const ws=XLSX.utils.aoa_to_sheet([headers,...rows,tot]);XLSX.utils.book_append_sheet(wb,ws,`${date} ${ts}`.slice(0,31));});});XLSX.writeFile(wb,"업무보고_전체.xlsx");}} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>전체 엑셀</button><button onClick={()=>downloadWeeklyExcel(allData)} style={{background:"#8468D3",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>주차별 분석 엑셀</button></>)}</div>{Object.entries(allData).sort().reverse().map(([date,tsByDate])=>(<div key={date} style={{marginBottom:14}}><div style={{fontWeight:700,fontSize:12,padding:"6px 10px",background:"#f7f8fa",borderRadius:7,marginBottom:7,color:"#0f1117"}}>{date}</div>{Object.entries(tsByDate).map(([ts,reps])=>(<div key={ts} style={{marginBottom:8}}><div style={{fontWeight:600,fontSize:11,color:"#8468D3",marginBottom:4}}>{ts} ({reps.length}명)</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:480}}><thead><tr style={{background:"#f7f8fa"}}><th style={{padding:"5px 8px",textAlign:"left",color:"#6b7280",fontWeight:600,borderBottom:"2px solid #f0f1f3"}}>이름</th>{METRICS.map(m=><th key={m.key} style={{padding:"5px 5px",textAlign:"center",color:"#6b7280",fontWeight:600,borderBottom:"2px solid #f0f1f3",whiteSpace:"nowrap"}}>{m.label}</th>)}{ts==="최종마감"&&FINAL_METRICS.map(m=><th key={m.key} style={{padding:"5px 5px",textAlign:"center",color:"#8468D3",fontWeight:600,borderBottom:"2px solid #f0f1f3",whiteSpace:"nowrap"}}>{m.label}</th>)}</tr></thead><tbody>{reps.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f7f8fa"}}><td style={{padding:"5px 8px",fontWeight:700,color:"#0f1117"}}>{r.name}</td>{METRICS.map(m=><td key={m.key} style={{padding:"5px 5px",textAlign:"center"}}>{r[m.key]||0}</td>)}{ts==="최종마감"&&FINAL_METRICS.map(m=><td key={m.key} style={{padding:"5px 5px",textAlign:"center",color:"#8468D3",fontWeight:600}}>{m.key==="dailySales"?(Number(r[m.key])||0).toLocaleString()+"원":r[m.key]||0}</td>)}</tr>))}<tr style={{background:"#f0f7ff",fontWeight:700}}><td style={{padding:"5px 8px",color:"#0071CE"}}>합계</td>{METRICS.map(m=><td key={m.key} style={{padding:"5px 5px",textAlign:"center",color:"#0071CE"}}>{reps.reduce((s,r)=>s+(r[m.key]||0),0)}</td>)}{ts==="최종마감"&&FINAL_METRICS.map(m=><td key={m.key} style={{padding:"5px 5px",textAlign:"center",color:"#8468D3"}}>{m.key==="dailySales"?reps.reduce((s,r)=>s+(Number(r[m.key])||0),0).toLocaleString()+"원":reps.reduce((s,r)=>s+(r[m.key]||0),0)}</td>)}</tr></tbody></table></div></div>))}</div>))}{Object.keys(allData).length===0&&!loadingAll&&<p style={{fontSize:12,color:"#adb5bd",textAlign:"center",padding:"14px 0"}}>버튼을 눌러 데이터를 불러오세요</p>}</div>)}{section==="navorder"&&(<div><div style={{fontWeight:700,fontSize:13,marginBottom:6,color:"#0f1117"}}>메뉴 순서 설정</div><p style={{fontSize:11,color:"#adb5bd",marginBottom:12}}>▲▼ 버튼으로 순서를 바꾸세요</p>{(()=>{const NAV_LABELS={list:"목록",calendar:"캘린더",revenue:"매출현황 캘린더",contracts:"계약관리",report:"업무보고",ranking:"매출 랭킹"};const move=async(idx,dir)=>{const arr=[...navOrder];const swap=idx+dir;if(swap<0||swap>=arr.length)return;[arr[idx],arr[swap]]=[arr[swap],arr[idx]];await st.set("config:navOrder",arr);setNavOrder(arr);};return navOrder.map((id,i)=>(<div key={id} style={{display:"flex",alignItems:"center",gap:10,background:"#f7f8fa",borderRadius:9,padding:"9px 12px",marginBottom:5,border:"1px solid #f0f1f3"}}><span style={{fontSize:12,fontWeight:600,flex:1,color:"#374151"}}>{NAV_LABELS[id]||id}</span><button onClick={()=>move(i,-1)} disabled={i===0} style={{background:"none",border:"1px solid #f0f1f3",borderRadius:6,padding:"3px 7px",cursor:i===0?"not-allowed":"pointer",color:i===0?"#d1d5db":"#374151",fontSize:11}}>▲</button><button onClick={()=>move(i,1)} disabled={i===navOrder.length-1} style={{background:"none",border:"1px solid #f0f1f3",borderRadius:6,padding:"3px 7px",cursor:i===navOrder.length-1?"not-allowed":"pointer",color:i===navOrder.length-1?"#d1d5db":"#374151",fontSize:11}}>▼</button></div>));})()}</div>)}</div></div>);}

function MainApp({user,onLogout}){
  const[tasks,setTasks]=useState([]);const[loadingTasks,setLoadingTasks]=useState(true);
  const[navOrder,setNavOrder]=useState(["list","calendar","revenue","contracts","report","ranking","keyword"]);
  const[editTaskData,setEditTaskData]=useState(null);const[form,setForm]=useState(EF(user.isAdmin));const[showForm,setShowForm]=useState(false);
  const[contracts,setContracts]=useState([]);const[showCF,setShowCF]=useState(false);const[editContract,setEditContract]=useState(null);
  const[contractPage,setContractPage]=useState(1);const[contractManager,setContractManager]=useState("all");
  const[contractMonth,setContractMonth]=useState("all");const[contractStatus,setContractStatus]=useState("all");
  const[memoContract,setMemoContract]=useState(null);const[contractSearch,setContractSearch]=useState("");
  const[completions,setCompletions]=useState({});const[rankDataMap,setRankDataMap]=useState({});const[rankModalEvent,setRankModalEvent]=useState(null);const[rankModalContract,setRankModalContract]=useState(null);const[contractSubTab,setContractSubTab]=useState("list");const[profiles,setProfiles]=useState({});const[showProfile,setShowProfile]=useState(false);
  const[calY,setCalY]=useState(new Date().getFullYear());const[calM,setCalM]=useState(new Date().getMonth());
  const[calFilter,setCalFilter]=useState("all");const[selectedDay,setSelectedDay]=useState(null);
  const[fOwner,setFOwner]=useState("all");const[fStatus,setFStatus]=useState("all");const[fPriority,setFPriority]=useState("all");const[fProject,setFProject]=useState("all");
  const[showAllTasks,setShowAllTasks]=useState(false);const[tab,setTab]=useState("list");
  const[projectCategories,setProjectCategories]=useState([]);
  const[timeslots,setTimeslots]=useState([]);const[selTs,setSelTs]=useState("");const[tsReports,setTsReports]=useState([]);
  const[myR,setMyR]=useState({calls:"",callTime:"",materials:"",toss:"",retarget:"",positive:"",negative:"",dailySales:"",connRate:"",rate30s:""});
  const[myTs,setMyTs]=useState("");const[newTs,setNewTs]=useState("");
  const[targets,setTargets]=useState(DEF_TARGETS);
  const[loadingR,setLoadingR]=useState(false);const[submitting,setSubmitting]=useState(false);const[submitMsg,setSubmitMsg]=useState("");
  const[webhookUrl,setWebhookUrl]=useState("");const[rankWebhookUrl,setRankWebhookUrl]=useState("");
  const[allData,setAllData]=useState({});const[loadingAll,setLoadingAll]=useState(false);
  const[accounts,setAccounts]=useState([]);
  const[reportViewDate,setReportViewDate]=useState(todayStr);const[dateReports,setDateReports]=useState([]);const[loadingDateR,setLoadingDateR]=useState(false);
  const[editingReport,setEditingReport]=useState(null);const[dailyAlertItems,setDailyAlertItems]=useState(null);
  const[analysisStart,setAnalysisStart]=useState("");const[analysisEnd,setAnalysisEnd]=useState("");
  const[analysisMonth,setAnalysisMonth]=useState(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`);
  const[analysisData,setAnalysisData]=useState(null);const[loadingAnalysis,setLoadingAnalysis]=useState(false);

  useEffect(()=>{loadTasks();loadContracts();loadSettings();loadCompletions();loadRankData();loadProfiles();loadProjectCategories();loadAccounts();},[]);
  useEffect(()=>{if(selTs)loadReports(selTs);},[selTs]);
  useEffect(()=>{loadDateFinalReports(reportViewDate);},[reportViewDate]);
  useEffect(()=>{
    const ALERT_TIMES=[{h:10,m:0,key:'alert10'},{h:15,m:30,key:'alert1530'},{h:18,m:0,key:'alert18'}];
    const timers=[];
    ALERT_TIMES.forEach(({h,m,key})=>{const storageKey=`dailyAlert:${todayStr}:${key}`;if(sessionStorage.getItem(storageKey))return;const now=new Date();const target=new Date(now);target.setHours(h,m,0,0);const trigger=()=>{sessionStorage.setItem(storageKey,'1');setDailyAlertItems('PENDING');};if(now>=target){trigger();}else{const tid=setTimeout(trigger,target-now);timers.push(tid);}});
    return()=>timers.forEach(clearTimeout);
  },[]);
  useEffect(()=>{
    if(dailyAlertItems!=='PENDING')return;
    const items=[];
    const myTasks=tasks.filter(t=>t.status!=="done"&&(user.isAdmin||t.owner===user.name));
    myTasks.forEach(t=>{if(t.deadline===todayStr){const dd=getDDayLabel(t.deadline);items.push({type:"task",title:t.title,sub:`마감 당일 · ${t.project||"프로젝트 없음"}`,dday:dd?.text,urgent:true});}else if(t.deadline&&getDDay(t.deadline)<=3&&getDDay(t.deadline)>0){const dd=getDDayLabel(t.deadline);items.push({type:"task",title:t.title,sub:`마감 임박 · ${t.project||""}`,dday:dd?.text,urgent:true});}});
    const myContracts=(user.isAdmin||user.role==="manager")?contracts:contracts.filter(c=>c.manager===user.name);
    myContracts.forEach(c=>{const evts=genEvents(c);evts.forEach(e=>{if(e.date===todayStr&&(e.type==="순위체크"||e.type==="리포트")){const isDone=!!completions[ceKey(e)];if(!isDone){items.push({type:"contract",ceType:e.type,title:c.name,sub:`${c.manager||"담당자 미지정"} · ${c.phone||""}`,urgent:false});}}});});
    if(items.length>0)setDailyAlertItems(items);else setDailyAlertItems(null);
  },[dailyAlertItems,tasks,contracts,completions]);

  const loadTasks=async()=>{setLoadingTasks(true);if(user.isAdmin||user.role==="manager"){const keys=await st.list("tasks:");const all=[];for(const k of keys){const items=await st.get(k)||[];items.forEach(t=>all.push({...t,_sk:k}));}setTasks(all);}else{const mine=await st.get(`tasks:${user.name}`)||[];const pub=await st.get("tasks:_pub")||[];setTasks([...mine.map(t=>({...t,_sk:`tasks:${user.name}`})),...pub.map(t=>({...t,_sk:"tasks:_pub"}))]);}setLoadingTasks(false);};
  const skForVis=v=>user.isAdmin?(v==="public"?"tasks:_pub":"tasks:_prv"):`tasks:${user.name}`;
  const submitTask=async()=>{if(!form.title.trim())return;const newSk=skForVis(form.visibility);if(editTaskData){const oldSk=editTaskData._sk;if(oldSk!==newSk){const old=await st.get(oldSk)||[];await st.set(oldSk,old.filter(t=>t.id!==editTaskData.id));const nw=await st.get(newSk)||[];await st.set(newSk,[...nw,{...form,id:editTaskData.id,owner:editTaskData.owner||user.name}]);}else{const items=await st.get(oldSk)||[];await st.set(oldSk,items.map(t=>t.id===editTaskData.id?{...form,id:t.id,owner:t.owner||user.name}:t));}}else{const items=await st.get(newSk)||[];await st.set(newSk,[...items,{...form,id:uid(),owner:user.name}]);}setForm(EF(user.isAdmin));setEditTaskData(null);setShowForm(false);await loadTasks();};
  const handleCycle=async t=>{if(!user.isAdmin&&(t._sk==="tasks:_pub"||t._sk==="tasks:_prv"))return;const o=["todo","doing","done"];const ns=o[(o.indexOf(t.status)+1)%3];const items=await st.get(t._sk)||[];await st.set(t._sk,items.map(x=>x.id===t.id?{...x,status:ns}:x));setTasks(prev=>prev.map(x=>(x.id===t.id&&x._sk===t._sk)?{...x,status:ns}:x));};
  const handleDelete=async t=>{const items=await st.get(t._sk)||[];await st.set(t._sk,items.filter(x=>x.id!==t.id));setTasks(prev=>prev.filter(x=>!(x.id===t.id&&x._sk===t._sk)));};
  const handleEditTask=t=>{setForm({title:t.title,project:t.project||"",priority:t.priority,status:t.status,due:t.due||"",deadline:t.deadline||"",memo:t.memo||"",visibility:t.visibility||"personal",repeat:t.repeat||"none",repeatDays:t.repeatDays||[]});setEditTaskData(t);setShowForm(true);setTab("list");};
  const loadContracts=async()=>{const c=await st.get("contracts:all")||[];setContracts(c);};
  const saveContract=async c=>{const list=await st.get("contracts:all")||[];const idx=list.findIndex(x=>x.id===c.id);if(idx>=0)list[idx]=c;else list.push(c);await st.set("contracts:all",list);setContracts([...list]);setShowCF(false);setEditContract(null);};
  const deleteContract=async id=>{const list=(await st.get("contracts:all")||[]).filter(c=>c.id!==id);await st.set("contracts:all",list);setContracts(list);};
  const loadCompletions=async()=>{const c=await st.get("ce:completions")||{};setCompletions(c);};
  const loadRankData=async()=>{const r=await st.get("ce:rankdata")||{};setRankDataMap(r);};
  const handleRankConfirm=async(event,keywordsResult)=>{
    const k=ceKey(event);
    // 저장
    const newRankData=await st.get("ce:rankdata")||{};
    newRankData[k]={keywords:keywordsResult,date:event.date||todayStr};
    await st.set("ce:rankdata",newRankData);
    setRankDataMap({...newRankData});
    const cData=await st.get("ce:completions")||{};
    cData[k]=true;
    await st.set("ce:completions",cData);
    setCompletions({...cData});
    // ── 순위체크 저장 → Discord 즉시 전송 ──
    try{
      const wh=await st.get("wt:rankWebhook")||await st.get("wt:webhook");
      if(!wh)return;
      const contract=contracts.find(c=>c.id===event.cid);
      if(!contract)return;
      const line="─────────────────────────";
      let msg=`📊 **순위체크 완료** · ${event.date}\n${line}\n`;
      msg+=`🏢 **${contract.name}**${contract.manager?` · ${contract.manager}`:""}\n`;
      msg+=`📅 ${event.rankIdx}차 순위체크\n`;
      // 이전 회차 데이터 찾기
      const genEvts=genEvents(contract);
      const rankEvts=genEvts.filter(e=>e.type==="순위체크").sort((a,b)=>a.date.localeCompare(b.date));
      const curIdx=rankEvts.findIndex(e=>e.date===event.date);
      const prevEvt=curIdx>0?rankEvts[curIdx-1]:null;
      // 이전 회차 실제 저장된 기록이 있는지 확인
      const prevSavedData=prevEvt?newRankData[ceKey(prevEvt)]:null;
      const curDateFmt=event.date.slice(5).replace("-","/");
      Object.entries(keywordsResult).forEach(([kw,val])=>{
        const cur=typeof val==="object"?val.rank:parseInt(val);
        const prev=typeof val==="object"&&val.prevRank?val.prevRank:null;
        const diff=prev&&cur?prev-cur:null;
        const arrow=diff===null?"":diff>0?`▲${diff}`:diff<0?`▼${Math.abs(diff)}`:"—";
        if(prev){
          // 이전 순위 출처에 따라 날짜 결정
          // prevSavedData에 이 키워드 기록이 있으면 → 직전 순위체크 날짜
          // 없으면(initialRanks에서 온 경우) → 계약 시작일
          const prevHasRecord=prevSavedData?.keywords?.[kw]?.rank;
          const prevDateRaw=prevHasRecord?prevEvt.date:contract.startDate;
          const prevDateFmt=prevDateRaw?prevDateRaw.slice(5).replace("-","/"):null;
          msg+=`• ${kw}\n  ${prevDateFmt} ${prev}위 → ${curDateFmt} ${cur}위 (${arrow})\n`;
        }else{
          msg+=`• ${kw}: ${curDateFmt} **${cur}위**\n`;
        }
      });
      msg+=line;
      await fetch(wh,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:msg})});
    }catch(e){}
  };
  const handleRankDelete=async(event)=>{
    if(!window.confirm("이 순위체크 기록을 삭제할까요?"))return;
    const k=ceKey(event);
    const newRankData=await st.get("ce:rankdata")||{};
    // 같은 날짜의 모든 키 삭제 (중복 저장된 경우 포함)
    const targetDate=event.date;
    Object.keys(newRankData).forEach(key=>{
      if(key.includes(`:순위체크:${targetDate}`)&&(key.startsWith(`${event.cid}:`)||key===k))delete newRankData[key];
    });
    await st.set("ce:rankdata",newRankData);
    setRankDataMap({...newRankData});
    const cData=await st.get("ce:completions")||{};
    Object.keys(cData).forEach(key=>{
      if(key.includes(`:순위체크:${targetDate}`)&&(key.startsWith(`${event.cid}:`)||key===k))delete cData[key];
    });
    await st.set("ce:completions",cData);
    setCompletions({...cData});
  };
  const addKeywordToContract=async(contractId,kw)=>{const list=await st.get("contracts:all")||[];const idx=list.findIndex(c=>c.id===contractId);if(idx<0)return;const existing=list[idx].keywords||[];if(existing.includes(kw))return;list[idx]={...list[idx],keywords:[...existing,kw]};await st.set("contracts:all",list);setContracts([...list]);};
  const toggleCE=async(e,forceTo)=>{const data=await st.get("ce:completions")||{};const k=ceKey(e);data[k]=forceTo!==undefined?forceTo:!data[k];await st.set("ce:completions",data);setCompletions({...data});};
  const loadProfiles=async()=>{const p=await st.get("profiles:all")||{};setProfiles(p);};
  const updateProfile=async(name,img)=>{const p=await st.get("profiles:all")||{};p[name]=img;await st.set("profiles:all",p);setProfiles({...p});};
  const loadProjectCategories=async()=>{const p=await st.get("config:projects")||[];setProjectCategories(p);};
  const loadAccounts=async()=>{const a=await st.get("accounts:all")||[];setAccounts(a);};
  const loadSettings=async()=>{const t=await st.get("wt:targets");if(t)setTargets(t);const w=await st.get("wt:webhook");if(w)setWebhookUrl(w);const rw=await st.get("wt:rankWebhook");if(rw)setRankWebhookUrl(rw);const no=await st.get("config:navOrder");if(no){if(!no.includes("keyword")){no.push("keyword");await st.set("config:navOrder",no);}
if(!no.includes("revenue")){const idx=no.indexOf("calendar");const newArr=[...no];if(idx>=0)newArr.splice(idx+1,0,"revenue");else newArr.push("revenue");await st.set("config:navOrder",newArr);setNavOrder(newArr);}else setNavOrder(no);}const ts=await st.get("wt:ts:fixed")||[];setTimeslots(ts);if(ts.length>0){setSelTs(ts[ts.length-1]);setMyTs(ts[ts.length-1]);}};
  const addTimeslot=async()=>{const ts=newTs.trim();if(!ts)return;const list=await st.get("wt:ts:fixed")||[];if(!list.includes(ts)){list.push(ts);await st.set("wt:ts:fixed",list);setTimeslots(list);}setSelTs(ts);setMyTs(ts);setNewTs("");};
  const removeTimeslot=async ts=>{const list=(await st.get("wt:ts:fixed")||[]).filter(t=>t!==ts);await st.set("wt:ts:fixed",list);setTimeslots(list);if(selTs===ts)setSelTs(list[list.length-1]||"");if(myTs===ts)setMyTs(list[list.length-1]||"");};
  const loadReports=async ts=>{setLoadingR(true);const keys=await st.list(`wr:${todayStr}:${san(ts)}:`);const rows=[];for(const k of keys){const r=await st.get(k);if(r)rows.push(r);}setTsReports(rows);setLoadingR(false);};
  const loadDateFinalReports=async(dateStr)=>{setLoadingDateR(true);const keys=await st.list(`wr:${dateStr}:${san("최종마감")}:`);const rows=[];for(const k of keys){const r=await st.get(k);if(r)rows.push(r);}setDateReports(rows);setLoadingDateR(false);};
  const handleAdminSaveReport=async(updatedReport)=>{const key=`wr:${reportViewDate}:${san("최종마감")}:${san(updatedReport.name)}`;await st.set(key,updatedReport);await loadDateFinalReports(reportViewDate);};
  const loadAnalysisData=async(startDate,endDate)=>{if(!startDate||!endDate)return;setLoadingAnalysis(true);setAnalysisData(null);const byDate={};const dates=[];let cur=new Date(startDate+"T00:00:00");while(cur.toISOString().slice(0,10)<=endDate){dates.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}for(const date of dates){const finalKeys=await st.list(`wr:${date}:${san("최종마감")}:`);let rows=[];if(finalKeys.length>0){for(const k of finalKeys){const r=await st.get(k);if(r)rows.push({...r,_ts:"최종마감"});}}else{const sixKeys=await st.list(`wr:${date}:${san("6시")}:`);for(const k of sixKeys){const r=await st.get(k);if(r)rows.push({...r,_ts:"6시"});}}if(rows.length>0)byDate[date]=rows;}setAnalysisData(byDate);setLoadingAnalysis(false);};
  const loadAnalysisByMonth=async()=>{if(!analysisMonth)return;const[y,m]=analysisMonth.split("-");const dim=new Date(parseInt(y),parseInt(m),0).getDate();await loadAnalysisData(`${analysisMonth}-01`,`${analysisMonth}-${String(dim).padStart(2,"0")}`);};
  const downloadAnalysisExcel=()=>{if(!analysisData||Object.keys(analysisData).length===0){alert("먼저 데이터를 불러오세요.");return;}const allMetrics=[...METRICS,...FINAL_METRICS];const metricKeys=allMetrics.map(m=>m.key);const metricLabels=allMetrics.map(m=>m.label+(m.unit?`(${m.unit})`:""));const wb=XLSX.utils.book_new();const sortedDates=Object.keys(analysisData).sort();const nameSet=new Set();sortedDates.forEach(d=>analysisData[d].forEach(r=>nameSet.add(r.name)));const names=[...nameSet].sort();const dailyRows=[["날짜","타임","사원",...metricLabels]];sortedDates.forEach(date=>{const rows=analysisData[date];const ts=rows[0]?._ts||"-";rows.forEach(r=>{dailyRows.push([date,ts,r.name,...metricKeys.map(k=>k==="dailySales"?Number(r[k])||0:r[k]||0)]);});const tot=metricKeys.map(k=>rows.reduce((s,r)=>s+(Number(r[k])||0),0));dailyRows.push([date,"【합계】","",...tot]);dailyRows.push([]);});XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(dailyRows),"일자별_업무량");const label=analysisStart&&analysisEnd?`${analysisStart}~${analysisEnd}`:analysisMonth||"조회";XLSX.writeFile(wb,`업무량분석_${label}.xlsx`);};
  const submitReport=async()=>{if(!myTs)return;setSubmitting(true);setSubmitMsg("");const isFinal=myTs==="최종마감";const data={name:user.name,timeslot:myTs,...Object.fromEntries(METRICS.map(m=>[m.key,parseInt(myR[m.key])||0])),...(isFinal?{dailySales:parseInt((myR.dailySales||"").toString().replace(/[^0-9]/g,""))||0,connRate:parseInt(myR.connRate)||0,rate30s:parseInt(myR.rate30s)||0}:{})};const ok=await st.set(`wr:${todayStr}:${san(myTs)}:${san(user.name)}`,data);if(ok){const wh=await st.get("wt:webhook");if(wh)await sendNotif(wh,user.name,myTs,data,targets);setSelTs(myTs);await loadReports(myTs);if(isFinal)await loadDateFinalReports(reportViewDate);setSubmitMsg("✓ 제출 완료! (재제출 시 덮어쓰기)");}else setSubmitMsg("❌ 오류 발생");setSubmitting(false);};
  const loadAllData=async()=>{setLoadingAll(true);const keys=await st.list("wr:");const byDate={};for(const k of keys){const r=await st.get(k);if(r){const date=k.split(":")[1]||todayStr;const ts=r.timeslot||"미분류";if(!byDate[date])byDate[date]={};if(!byDate[date][ts])byDate[date][ts]=[];byDate[date][ts].push(r);}}setAllData(byDate);setLoadingAll(false);};
  const filterCE=useCallback(evts=>(user.isAdmin||user.role==="manager")?evts:evts.filter(e=>!e.manager||e.manager===user.name),[user]);
  const owners=useMemo(()=>[...new Set(tasks.filter(t=>t._sk!=="tasks:_pub"&&t._sk!=="tasks:_prv").map(t=>t.owner).filter(Boolean))],[tasks]);
  const filtered=useMemo(()=>tasks.filter(t=>{if(fOwner!=="all"&&t.owner!==fOwner)return false;if(fStatus!=="all"&&t.status!==fStatus)return false;if(fPriority!=="all"&&t.priority!==fPriority)return false;if(fProject!=="all"&&t.project!==fProject)return false;return true;}),[tasks,fOwner,fStatus,fPriority,fProject]);
  const weekDays=useMemo(()=>getWeekDays(),[]);
  const visibleContracts=useMemo(()=>{const base=(user.isAdmin||user.role==="manager")?contracts:contracts.filter(c=>c.manager===user.name);return[...base].sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));},[contracts,user]);
  const allCE=useMemo(()=>visibleContracts.flatMap(genEvents),[visibleContracts]);
  const todayCE=useMemo(()=>filterCE(allCE.filter(e=>e.date===todayStr&&(e.type==="순위체크"||e.type==="리포트"))),[allCE,filterCE]);
  const todayTasks=useMemo(()=>filtered.filter(t=>isActiveOnDate(t,todayStr)&&t.status!=="done").sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority])),[filtered]);
  const allCEFiltered=useMemo(()=>filterCE(allCE.filter(e=>e.type==="순위체크"||e.type==="리포트")),[allCE,filterCE]);
  const allItems=useMemo(()=>[...filtered.map(t=>({...t,_itemType:"task"})),...allCEFiltered.map(e=>({...e,_itemType:"ce",due:e.date}))].sort((a,b)=>!a.due?1:!b.due?-1:a.due.localeCompare(b.due)),[filtered,allCEFiltered]);
  const managers=useMemo(()=>[...new Set(contracts.map(c=>c.manager).filter(Boolean))],[contracts]);
  const contractMonthOptions=useMemo(()=>{const set=new Set();visibleContracts.forEach(c=>{if(c.startDate){const[y,m]=c.startDate.split("-");set.add(`${y}-${m}`);}});return[...set].sort().reverse();},[visibleContracts]);
  const filteredContracts=useMemo(()=>{let list=contractManager==="all"?visibleContracts:visibleContracts.filter(c=>c.manager===contractManager);if(contractMonth!=="all")list=list.filter(c=>c.startDate?.startsWith(contractMonth));if(contractStatus==="active")list=list.filter(c=>!c.cancelled&&c.endDate&&c.endDate>=todayStr);else if(contractStatus==="ended")list=list.filter(c=>!c.cancelled&&c.endDate&&c.endDate<todayStr);else if(contractStatus==="cancelled")list=list.filter(c=>!!c.cancelled);else list=list.filter(c=>!c.cancelled);if(contractSearch.trim()){const q=contractSearch.trim().toLowerCase();list=list.filter(c=>c.name?.toLowerCase().includes(q));if(contractStatus==="all"||contractStatus!=="cancelled"){const cancelledMatch=(contractManager==="all"?visibleContracts:visibleContracts.filter(c=>c.manager===contractManager)).filter(c=>!!c.cancelled&&c.name?.toLowerCase().includes(q));const ids=new Set(list.map(x=>x.id));cancelledMatch.forEach(c=>{if(!ids.has(c.id))list.push(c);});}}return list;},[visibleContracts,contractManager,contractMonth,contractStatus,contractSearch]);
  const contractsPerPage=window.innerWidth<=768?5:20;
  const totalPages=useMemo(()=>Math.ceil(filteredContracts.length/contractsPerPage),[filteredContracts,contractsPerPage]);
  const pagedContracts=useMemo(()=>filteredContracts.slice((contractPage-1)*contractsPerPage,contractPage*contractsPerPage),[filteredContracts,contractPage,contractsPerPage]);
  const renewalStats=useMemo(()=>{const now={count:0,amount:0},ren={count:0,amount:0};filteredContracts.forEach(c=>{const a=parseAmount(c.total);if(c.isRenewal){ren.count++;ren.amount+=a;}else{now.count++;now.amount+=a;}});return{new:now,renewal:ren};},[filteredContracts]);
  const calTasksExp=useMemo(()=>expandForMonth(filtered,calY,calM),[filtered,calY,calM]);
  const calCE=useMemo(()=>filterCE(allCE.filter(e=>e.date.startsWith(`${calY}-${String(calM+1).padStart(2,"0")}`)&&e.type!=="온보딩"&&!visibleContracts.find(c=>c.id===e.cid)?.cancelled)),[allCE,calY,calM,filterCE,visibleContracts]);
  const tasksByDay=useMemo(()=>{const m={};if(calFilter!=="contracts")calTasksExp.forEach(t=>{if(t.due){const d=parseInt(t.due.slice(8));if(!m[d])m[d]={t:[],e:[]};m[d].t.push(t);}});if(calFilter!=="tasks")calCE.forEach(e=>{const d=parseInt(e.date.slice(8));if(!m[d])m[d]={t:[],e:[]};m[d].e.push(e);});return m;},[calTasksExp,calCE,calFilter]);
  const selDayTasks=useMemo(()=>calTasksExp.filter(t=>t.due===selectedDay),[calTasksExp,selectedDay]);
  const selDayCE=useMemo(()=>calCE.filter(e=>e.date===selectedDay),[calCE,selectedDay]);
  const done=tasks.filter(t=>t.status==="done").length;const pct=tasks.length?Math.round(done/tasks.length*100):0;
  const firstDay=new Date(calY,calM,1).getDay();const dim=new Date(calY,calM+1,0).getDate();
  const cells=[...Array(firstDay).fill(null),...Array.from({length:dim},(_,i)=>i+1)];while(cells.length%7)cells.push(null);
  const resetFilters=()=>{setFOwner("all");setFStatus("all");setFPriority("all");setFProject("all");};
  const hasFilter=fOwner!=="all"||fStatus!=="all"||fPriority!=="all"||fProject!=="all";
  const iS2={border:"1px solid #f0f1f3",borderRadius:7,padding:"5px 9px",fontSize:11,background:"#fff",cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"};
  if(loadingTasks)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"#adb5bd",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>불러오는 중…</p></div>;
  return(
    <div style={{display:"flex",minHeight:"100vh",fontFamily:"'Pretendard',-apple-system,sans-serif",background:"#f7f8fa"}}>
      {showProfile&&<ProfileModal user={user} profiles={profiles} onUpdateProfile={updateProfile} onClose={()=>setShowProfile(false)} contracts={contracts}/>}
      {memoContract&&<ContractMemoModal contract={memoContract} user={user} onClose={()=>setMemoContract(null)} allContracts={contracts} rankDataMap={rankDataMap} completions={completions} onContractUpdate={list=>setContracts([...list])}/>}
      {rankModalEvent&&rankModalContract&&<RankInputModal event={rankModalEvent} contract={rankModalContract} existingData={rankDataMap[ceKey(rankModalEvent)]} onClose={()=>{setRankModalEvent(null);setRankModalContract(null);}} onConfirm={async kwResult=>{await handleRankConfirm(rankModalEvent,kwResult);setRankModalEvent(null);setRankModalContract(null);}} onDelete={rankDataMap[ceKey(rankModalEvent)]?async()=>{await handleRankDelete(rankModalEvent);setRankModalEvent(null);setRankModalContract(null);}:undefined} onAddKeyword={async kw=>addKeywordToContract(rankModalContract.id,kw)}/>}
      {editingReport&&<AdminEditReportModal report={editingReport} dateStr={reportViewDate} onClose={()=>setEditingReport(null)} onSave={handleAdminSaveReport}/>}
      {dailyAlertItems&&dailyAlertItems!=='PENDING'&&Array.isArray(dailyAlertItems)&&<DailyAlertModal items={dailyAlertItems} onClose={()=>setDailyAlertItems(null)}/>}
      <Sidebar tab={tab} setTab={setTab} user={user} onLogout={onLogout} contracts={contracts} profiles={profiles} onOpenProfile={()=>setShowProfile(true)} navOrder={navOrder} setNavOrder={setNavOrder}/>
      <div style={{flex:1,minWidth:0,overflowY:"auto",paddingBottom:0}}>
        {window.innerWidth<=768?(
          <div style={{background:"#fff",padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f0f1f3",position:"sticky",top:0,zIndex:50}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#8468D3,#0071CE)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:13,fontWeight:800,color:"#fff",fontStyle:"italic"}}>P</span>
              </div>
              <span style={{fontSize:14,fontWeight:700,color:"#0f1117",letterSpacing:"-0.3px"}}>PRO Manager</span>
            </div>
            <div/>
          </div>
        ):(
          <div style={{background:"#fff",padding:"12px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f0f1f3",position:"sticky",top:0,zIndex:50}}>
            <div style={{fontSize:15,fontWeight:700,color:"#0f1117",letterSpacing:"-0.3px"}}>
              {tab==="list"&&"작업 목록"}{tab==="calendar"&&"캘린더"}{tab==="revenue"&&"매출현황 캘린더"}{tab==="contracts"&&"계약 관리"}{tab==="report"&&"업무 보고"}{tab==="ranking"&&"매출 랭킹"}{tab==="admin"&&"관리자 설정"}{tab==="keyword"&&"키워드 분석"}
            </div>
            <div style={{display:"flex",gap:8}}>
              {tab==="list"&&<button onClick={()=>{setEditTaskData(null);setForm(EF(user.isAdmin));setShowForm(v=>!v);}} style={{background:"#0071CE",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>+ 새 작업</button>}
              {tab==="contracts"&&(user.isAdmin||user.role==="manager")&&<button onClick={()=>{setEditContract(null);setShowCF(v=>!v);}} style={{background:"#8468D3",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>+ 계약 등록</button>}
            </div>
          </div>
        )}
         <div style={{padding:"18px 22px"}}>
          {tab==="list"&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {window.innerWidth<=768&&<button onClick={()=>{setEditTaskData(null);setForm(EF(user.isAdmin));setShowForm(v=>!v);}} style={{width:"100%",background:"#0071CE",color:"#fff",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>+ 새 작업 추가</button>}
              {showForm&&<TaskForm form={form} setForm={setForm} onSubmit={submitTask} onCancel={()=>{setShowForm(false);setEditTaskData(null);setForm(EF(user.isAdmin));}} isEdit={!!editTaskData} isAdminUser={user.isAdmin} projectCategories={projectCategories}/>}
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {user.isAdmin&&owners.length>0&&<select value={fOwner} onChange={e=>setFOwner(e.target.value)} style={iS2}><option value="all">전체 사원</option>{owners.map(o=><option key={o} value={o}>{o}</option>)}</select>}
                <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={iS2}><option value="all">전체 상태</option>{Object.entries(S).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
                <select value={fPriority} onChange={e=>setFPriority(e.target.value)} style={iS2}><option value="all">전체 우선순위</option>{Object.entries(P).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
                <select value={fProject} onChange={e=>setFProject(e.target.value)} style={iS2}><option value="all">전체 프로젝트</option>{projectCategories.map(p=><option key={p} value={p}>{p}</option>)}</select>
                {hasFilter&&<button onClick={resetFilters} style={{border:"1px solid #fca5a5",borderRadius:7,padding:"5px 9px",fontSize:11,background:"#fff7f7",color:"#ef4444",cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>초기화</button>}
              </div>
              <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #f0f1f3"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,fontWeight:700,color:"#0f1117"}}>이번 주</span><span style={{fontSize:10,color:"#adb5bd"}}>{weekDays[0].slice(5).replace("-","/")} – {weekDays[4].slice(5).replace("-","/")}</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,maxHeight:window.innerWidth<=768?180:9999,overflowY:window.innerWidth<=768?"auto":"visible"}}>
                  {weekDays.map(ds=>{const isToday=ds===todayStr;const dow=new Date(ds+"T00:00:00").getDay();const dayTasks=filtered.filter(t=>isActiveOnDate(t,ds));const dayCE=filterCE(allCE.filter(e=>e.date===ds&&(e.type==="순위체크"||e.type==="리포트")));const all=[...dayCE,...dayTasks];return(<div key={ds} style={{background:isToday?"#f0f7ff":"#f7f8fa",border:`1.5px solid ${isToday?"#bfd7f5":"#f0f1f3"}`,borderRadius:10,padding:"8px 6px",minHeight:80,boxSizing:"border-box"}}><div style={{textAlign:"center",marginBottom:5}}>{isToday?<div style={{width:20,height:20,background:"#0071CE",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 2px",fontSize:10,fontWeight:800,color:"#fff"}}>{DAYS_KR[dow]}</div>:<div style={{fontSize:10,fontWeight:700,color:"#adb5bd"}}>{DAYS_KR[dow]}</div>}<div style={{fontSize:9,color:isToday?"#93c5fd":"#adb5bd"}}>{ds.slice(5).replace("-","/")}</div></div>{all.length===0&&<div style={{fontSize:9,color:"#d1d5db",textAlign:"center"}}>없음</div>}{all.slice(0,3).map((item,i)=>{if(item.type&&CE[item.type]){const ce=CE[item.type];return <div key={i} title={`[${item.type}] ${item.name}`} style={{fontSize:9,background:ce.bg,color:ce.color,borderRadius:3,padding:"1px 4px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:700}}>[{item.type[0]}] {item.name}</div>;}return <div key={i} title={item.title} style={{fontSize:9,background:P[item.priority].bg,color:P[item.priority].color,borderRadius:3,padding:"1px 4px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,textDecoration:item.status==="done"?"line-through":"none"}}>{item.title}</div>;})} {all.length>3&&<div style={{fontSize:9,color:"#adb5bd",textAlign:"center"}}>+{all.length-3}</div>}</div>);})}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:window.innerWidth<=768?"column":"row",gap:14,alignItems:"flex-start"}}>
                <div style={{flex:window.innerWidth<=768?"none":"0 0 420px",width:window.innerWidth<=768?"100%":"auto",maxWidth:window.innerWidth<=768?"100%":420,background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #f0f1f3"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{fontSize:12,fontWeight:700,color:"#0f1117"}}>오늘 할 일</span><span style={{background:"#fef2f2",color:"#ef4444",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700}}>{todayTasks.length+todayCE.length}</span></div>
                  {todayTasks.length===0&&todayCE.length===0?<div style={{textAlign:"center",padding:"12px 0",color:"#adb5bd",fontSize:12}}>오늘 할 일이 없습니다</div>:<div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:window.innerWidth<=768?300:9999,overflowY:window.innerWidth<=768?"auto":"visible"}}>{todayCE.map((e,i)=>{const c=visibleContracts.find(x=>x.id===e.cid);return c?<ContractEventCard key={i} event={e} contract={c} isDone={!!completions[ceKey(e)]} onToggle={()=>{if(e.type==="순위체크"){setRankModalEvent(e);setRankModalContract(c);}else toggleCE(e);}} onMemo={()=>setMemoContract(c)}/>:null;})}{todayTasks.map(t=><TaskCard key={t.id+t._sk} task={t} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||t.owner===user.name}/>)}</div>}
                </div>
                <div style={{flex:1,minWidth:0,background:"#fff",borderRadius:12,border:"1px solid #f0f1f3",overflow:"hidden"}}>
                  <div onClick={()=>setShowAllTasks(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:12,fontWeight:700,color:"#0f1117"}}>전체 할 일</span><span style={{background:"#f7f8fa",color:"#6b7280",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700}}>{allItems.length}개</span></div><span style={{fontSize:10,fontWeight:600,color:"#0071CE",background:"#f0f7ff",borderRadius:6,padding:"3px 8px"}}>{showAllTasks?"숨기기 ▲":"전체보기 ▼"}</span></div>
                  {showAllTasks&&<div style={{borderTop:"1px solid #f7f8fa",padding:"10px 16px",display:"flex",flexDirection:"column",gap:6,maxHeight:600,overflowY:"auto"}}>{allItems.length===0?<div style={{textAlign:"center",padding:"12px 0",color:"#adb5bd",fontSize:12}}>작업이 없습니다</div>:allItems.map((item,i)=>{if(item._itemType==="ce"){const c=visibleContracts.find(x=>x.id===item.cid);return c?<ContractEventCard key={i} event={item} contract={c} isDone={!!completions[ceKey(item)]} onToggle={()=>{if(item.type==="순위체크"){setRankModalEvent(item);setRankModalContract(c);}else toggleCE(item);}} onMemo={()=>setMemoContract(c)}/>:null;}return <TaskCard key={item.id+item._sk} task={item} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||item.owner===user.name}/>;})}</div>}
                </div>
              </div>
            </div>
          )}
          {tab==="calendar"&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:"#fff",borderRadius:12,padding:16,border:"1px solid #f0f1f3"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><button onClick={()=>{let m=calM-1,y=calY;if(m<0){m=11;y--;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #f0f1f3",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:16}}>‹</button><div style={{fontWeight:800,fontSize:15,color:"#0f1117"}}>{calY}년 {calM+1}월</div><button onClick={()=>{let m=calM+1,y=calY;if(m>11){m=0;y++;}setCalM(m);setCalY(y);setSelectedDay(null);}} style={{background:"none",border:"1px solid #f0f1f3",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:16}}>›</button></div>
                <div style={{display:"flex",gap:5,marginBottom:12,justifyContent:"center"}}>{[["all","전체"],["tasks","일반 일정"],["contracts","계약업체"]].map(([v,l])=>(<button key={v} onClick={()=>setCalFilter(v)} style={{border:`1.5px solid ${calFilter===v?"#0071CE":"#f0f1f3"}`,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",background:calFilter===v?"#f0f7ff":"#fff",color:calFilter===v?"#0071CE":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{l}</button>))}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:3}}>{DAYS_KR.map((d,i)=>(<div key={d} style={{textAlign:"center",fontSize:window.innerWidth<=768?9:11,fontWeight:700,color:i===0?"#ef4444":i===6?"#0071CE":"#adb5bd",padding:"3px 0"}}>{d}</div>))}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>{cells.map((day,i)=>{if(!day)return <div key={i}/>;const ds=`${calY}-${String(calM+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const isToday=ds===todayStr;const isSel=selectedDay===ds;const dow=(firstDay+day-1)%7;const cell=tasksByDay[day]||{t:[],e:[]};const allCellItems=[...cell.e.map(e=>({...e,_ce:true})),...cell.t];return(<div key={i} onClick={()=>setSelectedDay(isSel?null:ds)} style={{minHeight:window.innerWidth<=768?120:82,background:isSel?"#e8f4fd":isToday?"#f0f7ff":"#fff",border:`1px solid ${isSel?"#0071CE":isToday?"#93c5fd":"#f0f1f3"}`,borderRadius:6,padding:window.innerWidth<=768?"3px 2px":"5px 4px",cursor:"pointer",overflow:"hidden",boxSizing:"border-box"}}><div style={{fontSize:window.innerWidth<=768?10:11,fontWeight:isToday?800:500,color:isToday?"#0071CE":dow===0?"#ef4444":dow===6?"#3b82f6":"#374151",marginBottom:2,textAlign:"center",lineHeight:1.2}}>{isToday?<span style={{background:"#0071CE",color:"#fff",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9}}>{day}</span>:day}</div><div style={{display:"flex",flexDirection:"column",gap:1}}>{allCellItems.slice(0,window.innerWidth<=768?3:3).map((item,ti)=>{const iD=item._ce?!!completions[ceKey(item)]:item.status==="done";const rawLabel=item._ce?item.type[0]+"."+item.name:item.title;const label=window.innerWidth<=768?(rawLabel.length>5?rawLabel.slice(0,5)+"…":rawLabel):rawLabel;const bg=item._ce?CE[item.type].bg:P[item.priority].bg;const color=item._ce?CE[item.type].color:P[item.priority].color;return <div key={ti} title={rawLabel} style={{fontSize:window.innerWidth<=768?8:9,background:bg,color,borderRadius:2,padding:"1px 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,textDecoration:iD?"line-through":"none",opacity:iD?0.6:1,lineHeight:1.3,marginBottom:1}}>{label}</div>;})} {allCellItems.length>3&&<div style={{fontSize:7,color:"#9ca3af",textAlign:"center",fontWeight:600}}>+{allCellItems.length-3}</div>}</div></div>);})} </div>
              </div>
              {selectedDay&&(<div style={{background:"#fff",borderRadius:12,border:"1px solid #f0f1f3",overflow:"hidden"}}><div style={{padding:"12px 18px",borderBottom:"1px solid #f0f1f3",background:selectedDay===todayStr?"#f0f7ff":"#f7f8fa",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontWeight:700,fontSize:13,color:"#0f1117"}}>{new Date(selectedDay+"T00:00:00").toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"})}</span>{selectedDay===todayStr&&<span style={{fontSize:10,color:"#0071CE",fontWeight:600,background:"#f0f7ff",borderRadius:99,padding:"2px 7px"}}>오늘</span>}</div><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,color:"#adb5bd"}}>{selDayTasks.length+selDayCE.length}개</span><button onClick={()=>setSelectedDay(null)} style={{background:"none",border:"none",color:"#adb5bd",cursor:"pointer",fontSize:15}}>✕</button></div></div><div style={{padding:"14px 18px"}}>{selDayTasks.length===0&&selDayCE.length===0?<div style={{textAlign:"center",padding:"16px 0",color:"#adb5bd",fontSize:12}}>이 날 일정이 없어요</div>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:7}}>{selDayCE.map((e,i)=>{const c=visibleContracts.find(x=>x.id===e.cid);return c?<ContractEventCard key={i} event={e} contract={c} isDone={!!completions[ceKey(e)]} onToggle={()=>{if(e.type==="순위체크"){setRankModalEvent(e);setRankModalContract(c);}else toggleCE(e);}} onMemo={()=>setMemoContract(c)}/>:null;})}{selDayTasks.map(t=><TaskCard key={t.id+(t._sk||"")} task={t} onCycle={handleCycle} onDelete={handleDelete} onEdit={handleEditTask} showOwner={user.isAdmin} canEdit={user.isAdmin||t.owner===user.name}/>)}</div>}</div></div>)}
            </div>
          )}
          {tab==="revenue"&&<RevenueCalendarTab contracts={contracts} user={user} profiles={profiles}/>}
          {tab==="contracts"&&(
            <div>
              {/* 세부탭 */}
              <div style={{display:"flex",background:"#fff",borderRadius:12,padding:4,marginBottom:14,border:"1px solid #f0f1f3",gap:4}}>
                {[{id:"list",label:"업체 목록"},{id:"rank",label:"순위 관리"},{id:"weekly",label:"주간요약"}].map(t=>(
                  <button key={t.id} onClick={()=>setContractSubTab(t.id)} style={{flex:1,padding:"9px",borderRadius:9,border:"none",fontSize:13,fontWeight:contractSubTab===t.id?700:500,cursor:"pointer",background:contractSubTab===t.id?"#0071CE":"transparent",color:contractSubTab===t.id?"#fff":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{t.label}</button>
                ))}
              </div>

              {/* ===== 업체목록 탭 ===== */}
              {contractSubTab==="list"&&(<div>
              {window.innerWidth<=768&&(user.isAdmin||user.role==="manager")&&<button onClick={()=>{setEditContract(null);setShowCF(v=>!v);}} style={{width:"100%",background:"#8468D3",color:"#fff",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif",marginBottom:12}}>+ 계약 등록</button>}
              {showCF&&(user.isAdmin||user.role==="manager")&&<ContractForm initial={editContract} onSubmit={saveContract} onCancel={()=>{setShowCF(false);setEditContract(null);}} allContracts={contracts}/>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div style={{background:"linear-gradient(135deg,#f0f7ff,#dbeafe)",borderRadius:12,padding:"12px 16px",border:"1px solid #bfdbfe"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,color:"#1e40af",fontWeight:700,marginBottom:2}}>신규 계약</div><div style={{fontSize:22,fontWeight:900,color:"#0071CE"}}>{renewalStats.new.count}<span style={{fontSize:12,fontWeight:600,marginLeft:2}}>건</span></div></div><div style={{textAlign:"right"}}><div style={{fontSize:11,color:"#3b82f6",fontWeight:600}}>총 매출</div><div style={{fontSize:14,fontWeight:800,color:"#0071CE"}}>{fmtAmount(renewalStats.new.amount)}</div></div></div></div>
                <div style={{background:"linear-gradient(135deg,#f5f3ff,#ede9fe)",borderRadius:12,padding:"12px 16px",border:"1px solid #ddd6fe"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,color:"#5b21b6",fontWeight:700,marginBottom:2}}>재연장</div><div style={{fontSize:22,fontWeight:900,color:"#8468D3"}}>{renewalStats.renewal.count}<span style={{fontSize:12,fontWeight:600,marginLeft:2}}>건</span></div></div><div style={{textAlign:"right"}}><div style={{fontSize:11,color:"#8468D3",fontWeight:600}}>총 매출</div><div style={{fontSize:14,fontWeight:800,color:"#8468D3"}}>{fmtAmount(renewalStats.renewal.amount)}</div></div></div></div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                <div style={{position:"relative"}}><input value={contractSearch} onChange={e=>{setContractSearch(e.target.value);setContractPage(1);}} placeholder="상호명 검색..." style={{width:"100%",border:"1.5px solid #f0f1f3",borderRadius:9,padding:"7px 12px",fontSize:12,outline:"none",boxSizing:"border-box",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>{contractSearch&&<button onClick={()=>{setContractSearch("");setContractPage(1);}} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#adb5bd",cursor:"pointer",fontSize:14,padding:0}}>✕</button>}</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:11,fontWeight:600,color:"#6b7280",flexShrink:0}}>월별:</span><button onClick={()=>{setContractMonth("all");setContractPage(1);}} style={{border:`1.5px solid ${contractMonth==="all"?"#0071CE":"#f0f1f3"}`,borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:600,cursor:"pointer",background:contractMonth==="all"?"#f0f7ff":"#fff",color:contractMonth==="all"?"#0071CE":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>전체</button>{contractMonthOptions.map(mo=>{const[y,m]=mo.split("-");return(<button key={mo} onClick={()=>{setContractMonth(mo);setContractPage(1);}} style={{border:`1.5px solid ${contractMonth===mo?"#0071CE":"#f0f1f3"}`,borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:600,cursor:"pointer",background:contractMonth===mo?"#f0f7ff":"#fff",color:contractMonth===mo?"#0071CE":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{parseInt(y)}년 {parseInt(m)}월</button>);})}</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:11,fontWeight:600,color:"#6b7280",flexShrink:0}}>상태:</span>{[{v:"all",l:"전체",c:"#6b7280"},{v:"active",l:"진행중",c:"#10b981"},{v:"ended",l:"종료",c:"#9ca3af"},{v:"cancelled",l:"해지",c:"#ef4444"}].map(({v,l,c})=>(<button key={v} onClick={()=>{setContractStatus(v);setContractPage(1);}} style={{border:`1.5px solid ${contractStatus===v?c:"#f0f1f3"}`,borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:600,cursor:"pointer",background:contractStatus===v?c+"18":"#fff",color:contractStatus===v?c:"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{l}</button>))}{(user.isAdmin||user.role==="manager")&&managers.length>0&&(<><span style={{fontSize:11,fontWeight:600,color:"#6b7280",marginLeft:4,flexShrink:0}}>담당자:</span><button onClick={()=>{setContractManager("all");setContractPage(1);}} style={{border:`1.5px solid ${contractManager==="all"?"#8468D3":"#f0f1f3"}`,borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:600,cursor:"pointer",background:contractManager==="all"?"#f5f3ff":"#fff",color:contractManager==="all"?"#8468D3":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>전체</button>{managers.map(m=>(<button key={m} onClick={()=>{setContractManager(m);setContractPage(1);}} style={{border:`1.5px solid ${contractManager===m?"#8468D3":"#f0f1f3"}`,borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:600,cursor:"pointer",background:contractManager===m?"#f5f3ff":"#fff",color:contractManager===m?"#8468D3":"#6b7280",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{m}</button>))}</>)}</div>
                {(contractMonth!=="all"||contractStatus!=="all"||contractSearch||contractManager!=="all")&&(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,color:"#6b7280"}}>{filteredContracts.length}개 업체</span><button onClick={()=>{setContractMonth("all");setContractStatus("all");setContractSearch("");setContractManager("all");setContractPage(1);}} style={{fontSize:11,color:"#ef4444",background:"#fff7f7",border:"1px solid #fca5a5",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>필터 초기화</button></div>)}
                <div style={{display:"flex",justifyContent:"flex-end"}}>
                  <button onClick={async()=>{
                    const rows=[["상호명","담당자","상태","계약시작","계약종료","금액","전화번호","키워드","상품내역","서비스내역","플레이스링크","특이사항","메모내용"]];
                    for(const c of filteredContracts){
                      const isCancelled=!!c.cancelled;
                      const isActive=!isCancelled&&c.endDate>=todayStr;
                      const status=isCancelled?"해지":isActive?"진행중":"종료";
                      const memoKey=`contract:memos:${c.linkedMemoId||c.id}`;
                      const memos=await st.get(memoKey)||[];
                      const memoText=memos.map(m=>`[${m.date}] ${m.author}: ${m.text}`).join("\n");
                      rows.push([
                        c.name||"",c.manager||"",status,
                        c.startDate||"",c.endDate||"",c.total||"",
                        c.phone||"",
                        (c.keywords||[]).join(", "),
                        c.products||"",c.services||"",
                        c.link||"",
                        c.notes||"",memoText
                      ]);
                    }
                    const ws=XLSX.utils.aoa_to_sheet(rows);
                    ws["!cols"]=[{wch:20},{wch:8},{wch:6},{wch:12},{wch:12},{wch:10},{wch:14},{wch:30},{wch:30},{wch:30},{wch:35},{wch:25},{wch:60}];
                    const wb=XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb,ws,"업체목록");
                    const label=contractSearch||contractStatus!=="all"||contractMonth!=="all"?`_필터적용`:"";;
                    XLSX.writeFile(wb,`업체목록${label}_${todayStr}.xlsx`);
                  }} style={{display:"flex",alignItems:"center",gap:5,background:"#10b981",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
                    엑셀 다운로드 ({filteredContracts.length}건)
                  </button>
                </div>
              </div>
              {filteredContracts.length===0&&!showCF?(<div style={{textAlign:"center",padding:"40px 0",color:"#adb5bd",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #f0f1f3"}}><div>{contractSearch?`"${contractSearch}"에 해당하는 업체가 없습니다`:contractMonth!=="all"?"해당 월에 계약한 업체가 없습니다":contractStatus==="active"?"진행중인 계약이 없습니다":contractStatus==="ended"?"종료된 계약이 없습니다":contractStatus==="cancelled"?"해지된 업체가 없습니다":user.isAdmin?"등록된 계약업체가 없습니다.":"담당 계약업체가 없습니다."}</div></div>)
              :<div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,alignItems:"start"}}>
                {pagedContracts.map(c=>{
                  const evts=genEvents(c);
                  const isCancelled=!!c.cancelled;
                  const isActive=!isCancelled&&c.endDate>=todayStr;
                  const rankEvts=evts.filter(e=>e.type==="순위체크");const rpt=evts.find(e=>e.type==="리포트");
                  const startParts=c.startDate?c.startDate.split("-"):["","",""];
                  const handleToggleCancel=async(e)=>{e.stopPropagation();if(isCancelled){if(!window.confirm("해지를 취소하고 복구할까요?"))return;}else{if(!window.confirm(`"${c.name}" 업체를 해지 처리할까요?`))return;}const list=await st.get("contracts:all")||[];const idx=list.findIndex(x=>x.id===c.id);if(idx>=0){list[idx]={...list[idx],cancelled:!isCancelled};await st.set("contracts:all",list);setContracts([...list]);}};
                  return(
                    <div key={c.id} style={{background:isCancelled?"#fff5f5":"#fff",borderRadius:12,border:`1px solid ${isCancelled?"#fca5a5":"#f0f1f3"}`,padding:"12px 14px",display:"flex",gap:0,alignItems:"stretch",cursor:"pointer",transition:"box-shadow 0.15s",width:"100%",overflow:"hidden",boxSizing:"border-box"}} onMouseEnter={e=>e.currentTarget.style.boxShadow=isCancelled?"0 4px 16px rgba(239,68,68,0.12)":"0 4px 16px rgba(0,113,206,0.10)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"} onClick={()=>setMemoContract(c)}>
                      {/* 날짜 열 */}
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,width:44,borderRight:`1px solid ${isCancelled?"#fecaca":"#f0f1f3"}`,marginRight:14,paddingRight:14,gap:1}}>
                        <div style={{fontSize:9,color:isCancelled?"#fca5a5":"#adb5bd",fontWeight:600}}>{startParts[1]}월</div>
                        <div style={{fontSize:20,fontWeight:800,color:isCancelled?"#ef4444":"#0071CE",lineHeight:1}}>{startParts[2]}</div>
                        <div style={{fontSize:8,color:isCancelled?"#fca5a5":"#adb5bd"}}>{startParts[0]}</div>
                      </div>
                      {/* 가운데: 상호명+담당자+기간 */}
                      <div style={{display:"flex",flexDirection:"column",justifyContent:"center",flex:1,minWidth:0,gap:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:11,fontWeight:800,color:c.isRenewal?"#8468D3":"#0071CE",background:c.isRenewal?"#f5f3ff":"#f0f7ff",borderRadius:5,padding:"1px 6px",border:`1px solid ${c.isRenewal?"#e9d5ff":"#bfd7f5"}`,flexShrink:0}}>{c.isRenewal?`R${c.renewalCount||""}`:"N"}</span>
                          <span style={{fontWeight:800,fontSize:14,color:isCancelled?"#ef4444":"#0f1117",textDecoration:isCancelled?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                          {isCancelled?<Badge label="해지" color="#ef4444" bg="#fee2e2"/>:<Badge label={isActive?"진행중":"종료"} color={isActive?"#10b981":"#9ca3af"} bg={isActive?"#d1fae5":"#f3f4f6"}/>}
                        </div>
                        {c.manager&&<div style={{fontSize:11,color:isCancelled?"#fca5a5":"#8468D3",fontWeight:600}}>{c.manager}</div>}
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <span style={{fontSize:10,color:isCancelled?"#fca5a5":"#6b7280",fontWeight:500}}>{c.startDate}</span>
                          <span style={{fontSize:10,color:"#d1d5db"}}>~</span>
                          <span style={{fontSize:10,color:isCancelled?"#fca5a5":"#6b7280",fontWeight:500}}>{c.endDate}</span>
                        </div>
                      </div>
                      {/* 오른쪽: 금액+뱃지+버튼 */}
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",justifyContent:"space-between",flexShrink:0,marginLeft:12,gap:4}} onClick={e=>e.stopPropagation()}>
                        <div style={{display:"flex",gap:3,alignItems:"center"}}>
                          <button onClick={()=>setMemoContract(c)} style={{background:"#f5f3ff",border:"1px solid #e9d5ff",color:"#8468D3",cursor:"pointer",padding:"3px 7px",borderRadius:6,fontSize:10,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>메모</button>
                          {(user.isAdmin||user.role==="manager")&&<>
                            <button onClick={handleToggleCancel} style={{background:isCancelled?"#fff7ed":"#fff5f5",border:`1px solid ${isCancelled?"#fed7aa":"#fca5a5"}`,color:isCancelled?"#ea580c":"#ef4444",cursor:"pointer",padding:"3px 7px",borderRadius:6,fontSize:10,fontWeight:600,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{isCancelled?"복구":"해지"}</button>
                            <button onClick={()=>{setEditContract(c);setShowCF(true);}} style={{background:"none",border:"none",color:"#adb5bd",cursor:"pointer",padding:2,fontSize:11}}>✏️</button>
                            <button onClick={()=>deleteContract(c.id)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",padding:2,fontSize:11}}>✕</button>
                          </>}
                        </div>
                        {c.total&&<div style={{fontSize:12,color:isCancelled?"#ef4444":"#0071CE",fontWeight:700}}>{c.total}</div>}
                        <div style={{display:"flex",gap:3,flexWrap:"wrap",justifyContent:"flex-end"}}>
                          {!isCancelled&&c.keywords&&c.keywords.length>0&&<span style={{fontSize:10,color:"#0891b2",background:"#ecfeff",borderRadius:99,padding:"1px 7px",border:"1px solid #a5f3fc"}}>{c.keywords.length}개 키워드</span>}
                          {isCancelled&&<Badge label="해지 업체" color="#ef4444" bg="#fee2e2"/>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>}
              {totalPages>1&&(<div style={{display:"flex",justifyContent:"center",gap:5,marginTop:12}}>{Array.from({length:totalPages},(_,i)=>(<button key={i} onClick={()=>setContractPage(i+1)} style={{width:30,height:30,borderRadius:7,border:`1.5px solid ${contractPage===i+1?"#0071CE":"#f0f1f3"}`,background:contractPage===i+1?"#0071CE":"#fff",color:contractPage===i+1?"#fff":"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{i+1}</button>))}</div>)}
              </div>)}

              {/* ===== 주간요약 탭 ===== */}
              {contractSubTab==="weekly"&&<WeeklyTab contracts={contracts} webhookUrl={webhookUrl} rankWebhookUrl={rankWebhookUrl} st={st}/>}

                            {/* ===== 순위관리 탭 ===== */}
              {contractSubTab==="rank"&&(()=>{
                // 진행중 + 종료 모두 포함 (해지 제외)
                const rankTargets=visibleContracts.filter(c=>!c.cancelled);
                // 검색/필터 state는 외부에서 관리 불가하므로 즉시 처리
                // 대신 useState 사용 불가 → useRef 없이 key로 처리
                // → 실제로는 아래 JSX에서 직접 useState 컴포넌트로 분리
                return <RankManageTab contracts={rankTargets} completions={completions} rankDataMap={rankDataMap} setMemoContract={setMemoContract} setRankModalEvent={setRankModalEvent} setRankModalContract={setRankModalContract} toggleCE={toggleCE} handleRankDelete={handleRankDelete}/>;
              })()}
            </div>
          )}
          {tab==="report"&&user.role!=="manager"&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #f0f1f3"}}>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:10,color:"#0f1117"}}>보고 타임</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:timeslots.length?8:0}}>
                      {timeslots.map(ts=>(<div key={ts} style={{display:"flex",alignItems:"center",gap:2}}><button onClick={()=>setSelTs(ts)} style={{border:`2px solid ${selTs===ts?"#8468D3":"#f0f1f3"}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",background:selTs===ts?"#f5f3ff":"#fff",color:selTs===ts?"#8468D3":"#374151",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{ts}</button>{user.isAdmin&&<button onClick={()=>removeTimeslot(ts)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:11}}>✕</button>}</div>))}
                      {timeslots.length===0&&<span style={{fontSize:12,color:"#adb5bd"}}>관리자가 타임을 추가해야 합니다</span>}
                    </div>
                    {user.isAdmin&&(<div style={{display:"flex",gap:7}}><input value={newTs} onChange={e=>setNewTs(e.target.value)} placeholder="새 타임 (예: 11시 타임)" onKeyDown={e=>e.key==="Enter"&&addTimeslot()} style={{flex:1,border:"1px solid #f0f1f3",borderRadius:8,padding:"7px 10px",fontSize:12,outline:"none",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/><button onClick={addTimeslot} style={{background:"#8468D3",color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>+ 추가</button></div>)}
                  </div>
                  <div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #f0f1f3"}}>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:10,color:"#0f1117"}}>내 실적 입력</div>
                    {timeslots.length>0?(<>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{timeslots.map(ts=>(<button key={ts} onClick={()=>setMyTs(ts)} style={{border:`2px solid ${myTs===ts?"#0071CE":"#f0f1f3"}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",background:myTs===ts?"#f0f7ff":"#fff",color:myTs===ts?"#0071CE":"#374151",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{ts}</button>))}</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginBottom:10}}>{METRICS.map(m=>(<div key={m.key}><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>{m.label} ({m.unit}){targets[m.key]&&<span style={{color:"#0071CE"}}> · 목표 {targets[m.key]}</span>}</label><input type="number" min="0" value={myR[m.key]} onChange={e=>setMyR(r=>({...r,[m.key]:e.target.value}))} placeholder="0" style={{width:"100%",border:"1px solid #f0f1f3",borderRadius:7,padding:"6px 9px",fontSize:12,outline:"none",boxSizing:"border-box",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/></div>))}</div>
                      {myTs==="최종마감"&&(<div style={{background:"#f5f3ff",borderRadius:10,padding:"12px",marginBottom:10,border:"1px solid #e9d5ff"}}><div style={{fontSize:12,fontWeight:700,color:"#8468D3",marginBottom:8}}>최종마감 추가 항목</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}><div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>일매출 (원)</label><input type="text" inputMode="numeric" value={myR.dailySales?(parseInt(myR.dailySales.toString().replace(/[^0-9]/g,""))||0).toLocaleString()+"원":""} onChange={e=>{const raw=e.target.value.replace(/[^0-9]/g,"");setMyR(r=>({...r,dailySales:raw}));}} placeholder="예: 500000" style={{width:"100%",border:"1px solid #e9d5ff",borderRadius:7,padding:"6px 9px",fontSize:12,outline:"none",boxSizing:"border-box",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>{myR.dailySales&&<div style={{fontSize:10,color:"#8468D3",marginTop:2,fontWeight:600}}>{Number(myR.dailySales).toLocaleString()}원</div>}</div><div><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>도입률-연결</label><input type="number" min="0" value={myR.connRate} onChange={e=>setMyR(r=>({...r,connRate:e.target.value}))} placeholder="0" style={{width:"100%",border:"1px solid #e9d5ff",borderRadius:7,padding:"6px 9px",fontSize:12,outline:"none",boxSizing:"border-box",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/></div><div><label style={{fontSize:11,color:"#6b7280",fontWeight:600,display:"block",marginBottom:2}}>도입률-30초이상</label><input type="number" min="0" value={myR.rate30s} onChange={e=>setMyR(r=>({...r,rate30s:e.target.value}))} placeholder="0" style={{width:"100%",border:"1px solid #e9d5ff",borderRadius:7,padding:"6px 9px",fontSize:12,outline:"none",boxSizing:"border-box",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/></div></div></div>)}
                      <button onClick={submitReport} disabled={submitting||!myTs} style={{width:"100%",background:myTs?"#0071CE":"#e5e7eb",color:myTs?"#fff":"#9ca3af",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:myTs?"pointer":"not-allowed",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{submitting?"저장 중…":"실적 제출 (재제출 시 자동 덮어쓰기)"}</button>
                      {submitMsg&&<p style={{fontSize:11,color:submitMsg.startsWith("✓")?"#10b981":"#ef4444",textAlign:"center",margin:"6px 0 0",fontWeight:600}}>{submitMsg}</p>}
                    </>):(<p style={{fontSize:12,color:"#adb5bd",textAlign:"center",padding:"10px 0"}}>관리자가 타임을 먼저 추가해야 합니다</p>)}
                  </div>
                  {selTs&&(<div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #f0f1f3"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontWeight:700,fontSize:12,color:"#0f1117"}}>{selTs} 팀 현황 ({tsReports.length}명)</span><button onClick={()=>loadReports(selTs)} style={{background:"none",border:"1px solid #f0f1f3",borderRadius:7,padding:"3px 8px",fontSize:11,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>새로고침</button></div>{loadingR?<div style={{textAlign:"center",padding:"16px",color:"#adb5bd"}}>불러오는 중…</div>:tsReports.length===0?<div style={{textAlign:"center",padding:"16px",color:"#adb5bd",background:"#f7f8fa",borderRadius:8}}>아직 제출된 실적이 없습니다</div>:tsReports.map((r,i)=><ReportCard key={i} report={r} targets={targets} timeslot={selTs} isAdmin={user.isAdmin} onEdit={user.isAdmin&&selTs==="최종마감"?()=>setEditingReport(r):null}/>)}</div>)}
              <div style={{background:"#fff",borderRadius:12,padding:16,border:"1px solid #f0f1f3"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#0f1117"}}>날짜별 최종마감 조회</span>
                  <input type="date" value={reportViewDate} onChange={e=>{setReportViewDate(e.target.value);}} style={{border:"1.5px solid #f0f1f3",borderRadius:8,padding:"5px 10px",fontSize:12,outline:"none",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/>
                  <button onClick={()=>loadDateFinalReports(reportViewDate)} style={{background:"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>새로고침</button>
                  <span style={{fontSize:11,color:"#adb5bd"}}>{dateReports.length}명 제출</span>
                </div>
                {loadingDateR?<div style={{textAlign:"center",padding:"20px",color:"#adb5bd",fontSize:12}}>불러오는 중…</div>
                :dateReports.length===0?<div style={{textAlign:"center",padding:"24px 0",color:"#adb5bd",background:"#f7f8fa",borderRadius:10,fontSize:13}}>해당 날짜의 최종마감 보고가 없습니다</div>
                :<div style={{display:"flex",flexDirection:"column",gap:8}}>{dateReports.map((r,i)=>(<div key={i} style={{background:"#f7f8fa",borderRadius:10,border:"1px solid #f0f1f3",padding:"12px 14px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8}}><Avatar name={r.name} size={28} border="2px solid #fff"/><span style={{fontWeight:700,fontSize:13,color:"#0f1117"}}>{r.name}</span></div>{user.isAdmin&&<button onClick={()=>setEditingReport(r)} style={{background:"#8468D3",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>수정</button>}</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:8}}>{METRICS.map(m=>(<div key={m.key} style={{background:"#fff",borderRadius:7,padding:"6px 8px",textAlign:"center",border:"1px solid #f0f1f3"}}><div style={{fontSize:10,color:"#adb5bd",marginBottom:1}}>{m.label}</div><div style={{fontSize:13,fontWeight:700,color:"#374151"}}>{r[m.key]||0}<span style={{fontSize:9,color:"#adb5bd",marginLeft:1}}>{m.unit}</span></div></div>))}</div><div style={{background:"#f5f3ff",borderRadius:8,padding:"8px 10px",border:"1px solid #e9d5ff",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}><div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#adb5bd",marginBottom:1}}>일매출</div><div style={{fontSize:13,fontWeight:800,color:"#8468D3"}}>{r.dailySales?Number(r.dailySales).toLocaleString()+"원":"0원"}</div></div><div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#adb5bd",marginBottom:1}}>도입률-연결</div><div style={{fontSize:13,fontWeight:800,color:"#0071CE"}}>{r.connRate||0}</div></div><div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#adb5bd",marginBottom:1}}>도입률-30초↑</div><div style={{fontSize:13,fontWeight:800,color:"#10b981"}}>{r.rate30s||0}</div></div></div></div>))}</div>}
              </div>
              {user.isAdmin&&(
                <div style={{background:"linear-gradient(135deg,#f0f5ff,#e8f4fd)",borderRadius:14,padding:18,border:"1px solid #dbeafe"}}>
                  <div style={{fontWeight:800,fontSize:14,color:"#1e40af",marginBottom:6}}>관리자 업무량 분석 · 엑셀 다운로드</div>
                  <div style={{fontSize:11,color:"#6b7280",marginBottom:14,background:"rgba(255,255,255,0.6)",borderRadius:8,padding:"6px 10px"}}>집계 기준: 해당 날짜 <b>최종마감</b> 보고 있으면 최종마감 사용, 없으면 <b>6시</b> 타임 사용</div>
                  <div style={{background:"#fff",borderRadius:10,padding:"12px 14px",marginBottom:10,border:"1px solid #bfdbfe"}}><div style={{fontWeight:700,fontSize:12,color:"#1e40af",marginBottom:8}}>월별 조회</div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><input type="month" value={analysisMonth} onChange={e=>setAnalysisMonth(e.target.value)} style={{border:"1.5px solid #bfdbfe",borderRadius:8,padding:"6px 10px",fontSize:12,outline:"none",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/><button onClick={loadAnalysisByMonth} disabled={loadingAnalysis} style={{background:"#0071CE",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{loadingAnalysis?"불러오는 중…":"불러오기"}</button></div></div>
                  <div style={{background:"#fff",borderRadius:10,padding:"12px 14px",marginBottom:14,border:"1px solid #bfdbfe"}}><div style={{fontWeight:700,fontSize:12,color:"#1e40af",marginBottom:8}}>기간 직접 선택</div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:11,color:"#6b7280"}}>시작</span><input type="date" value={analysisStart} onChange={e=>setAnalysisStart(e.target.value)} style={{border:"1.5px solid #bfdbfe",borderRadius:8,padding:"6px 10px",fontSize:12,outline:"none",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/></div><span style={{color:"#adb5bd",fontWeight:600}}>~</span><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:11,color:"#6b7280"}}>종료</span><input type="date" value={analysisEnd} onChange={e=>setAnalysisEnd(e.target.value)} style={{border:"1.5px solid #bfdbfe",borderRadius:8,padding:"6px 10px",fontSize:12,outline:"none",background:"#fff",fontFamily:"'Pretendard',-apple-system,sans-serif"}}/></div><button onClick={()=>loadAnalysisData(analysisStart,analysisEnd)} disabled={!analysisStart||!analysisEnd||loadingAnalysis} style={{background:analysisStart&&analysisEnd?"#0071CE":"#e5e7eb",color:analysisStart&&analysisEnd?"#fff":"#9ca3af",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:analysisStart&&analysisEnd?"pointer":"not-allowed",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>{loadingAnalysis?"불러오는 중…":"불러오기"}</button></div></div>
                  {analysisData&&(<div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
                      <div style={{fontSize:12,color:"#374151"}}>
                        <b style={{color:"#1e40af"}}>{Object.keys(analysisData).length}일</b> 데이터 · <b style={{color:"#0071CE"}}>{Object.values(analysisData).reduce((s,r)=>s+r.length,0)}건</b> 보고
                      </div>
                      <button onClick={downloadAnalysisExcel} style={{background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",border:"none",borderRadius:9,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px rgba(16,185,129,0.3)",fontFamily:"'Pretendard',-apple-system,sans-serif"}}>엑셀 다운로드</button>
                    </div>
                    {/* ===== 미리보기 테이블 ===== */}
                    <div style={{background:"#fff",borderRadius:10,border:"1px solid #bfdbfe",overflow:"hidden",marginTop:4}}>
                      <div style={{background:"#eff6ff",padding:"8px 14px",fontWeight:700,fontSize:12,color:"#1e40af",borderBottom:"1px solid #bfdbfe"}}>📊 데이터 미리보기</div>
                      <div style={{overflowX:"auto",maxHeight:340,overflowY:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
                          <thead style={{position:"sticky",top:0,background:"#f0f7ff",zIndex:1}}>
                            <tr>
                              <th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:"#374151",borderBottom:"1px solid #bfdbfe",whiteSpace:"nowrap"}}>날짜</th>
                              <th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:"#374151",borderBottom:"1px solid #bfdbfe",whiteSpace:"nowrap"}}>타임</th>
                              <th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:"#374151",borderBottom:"1px solid #bfdbfe",whiteSpace:"nowrap"}}>사원</th>
                              {METRICS.map(m=><th key={m.key} style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#374151",borderBottom:"1px solid #bfdbfe",whiteSpace:"nowrap"}}>{m.label}</th>)}
                              <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#8468D3",borderBottom:"1px solid #bfdbfe",whiteSpace:"nowrap"}}>일매출</th>
                              <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#0071CE",borderBottom:"1px solid #bfdbfe",whiteSpace:"nowrap"}}>연결률</th>
                              <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#10b981",borderBottom:"1px solid #bfdbfe",whiteSpace:"nowrap"}}>30초↑</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(analysisData).sort().map((date,di)=>{
                              const rows=analysisData[date];
                              const ts=rows[0]?._ts||"-";
                              return rows.map((r,ri)=>(
                                <tr key={date+r.name} style={{background:di%2===0?"#fff":"#f7f8fa",borderBottom:"1px solid #f0f1f3"}}>
                                  {ri===0&&<td rowSpan={rows.length} style={{padding:"6px 10px",fontWeight:700,color:"#1e40af",verticalAlign:"middle",borderRight:"1px solid #e0eefe",whiteSpace:"nowrap"}}>{date}</td>}
                                  {ri===0&&<td rowSpan={rows.length} style={{padding:"6px 8px",color:"#6b7280",verticalAlign:"middle",borderRight:"1px solid #e0eefe",whiteSpace:"nowrap",textAlign:"center"}}><span style={{background:"#eff6ff",color:"#2563eb",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:600}}>{ts}</span></td>}
                                  <td style={{padding:"6px 10px",fontWeight:600,color:"#0f1117",whiteSpace:"nowrap"}}>{r.name}</td>
                                  {METRICS.map(m=><td key={m.key} style={{padding:"6px 8px",textAlign:"center",color:"#374151"}}>{r[m.key]||0}</td>)}
                                  <td style={{padding:"6px 8px",textAlign:"center",color:"#8468D3",fontWeight:600}}>{r.dailySales?Number(r.dailySales).toLocaleString()+"원":"0원"}</td>
                                  <td style={{padding:"6px 8px",textAlign:"center",color:"#0071CE"}}>{r.connRate||0}</td>
                                  <td style={{padding:"6px 8px",textAlign:"center",color:"#10b981"}}>{r.rate30s||0}</td>
                                </tr>
                              ));
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{background:"#f0f7ff",padding:"6px 14px",fontSize:10,color:"#6b7280",borderTop:"1px solid #bfdbfe"}}>
                        ※ 날짜별로 최종마감 보고 우선, 없으면 6시 타임 표시 · 좌우 스크롤 가능
                      </div>
                    </div>
                    {/* ===== 사원별 평균 테이블 ===== */}
                    <div style={{background:"#fff",borderRadius:10,border:"1px solid #d1fae5",overflow:"hidden",marginTop:12}}>
                      <div style={{background:"#ecfdf5",padding:"8px 14px",fontWeight:700,fontSize:12,color:"#065f46",borderBottom:"1px solid #d1fae5"}}>📈 사원별 평균 (기간 내 보고일 기준)</div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'Pretendard',-apple-system,sans-serif"}}>
                          <thead style={{background:"#f0fdf4"}}>
                            <tr>
                              <th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:"#374151",borderBottom:"1px solid #d1fae5",whiteSpace:"nowrap"}}>사원</th>
                              <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#374151",borderBottom:"1px solid #d1fae5",whiteSpace:"nowrap"}}>보고일수</th>
                              {METRICS.map(m=><th key={m.key} style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#374151",borderBottom:"1px solid #d1fae5",whiteSpace:"nowrap"}}>{m.label}<br/><span style={{fontSize:9,fontWeight:400,color:"#adb5bd"}}>평균</span></th>)}
                              <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#8468D3",borderBottom:"1px solid #d1fae5",whiteSpace:"nowrap"}}>일매출<br/><span style={{fontSize:9,fontWeight:400,color:"#adb5bd"}}>평균</span></th>
                              <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#0071CE",borderBottom:"1px solid #d1fae5",whiteSpace:"nowrap"}}>연결률<br/><span style={{fontSize:9,fontWeight:400,color:"#adb5bd"}}>평균</span></th>
                              <th style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#10b981",borderBottom:"1px solid #d1fae5",whiteSpace:"nowrap"}}>30초↑<br/><span style={{fontSize:9,fontWeight:400,color:"#adb5bd"}}>평균</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(()=>{
                              // 사원별 집계
                              const personMap={};
                              Object.values(analysisData).forEach(rows=>{
                                rows.forEach(r=>{
                                  if(!personMap[r.name])personMap[r.name]={days:0,...Object.fromEntries([...METRICS,...FINAL_METRICS].map(m=>[m.key,0]))};
                                  personMap[r.name].days+=1;
                                  [...METRICS,...FINAL_METRICS].forEach(m=>{personMap[r.name][m.key]+=(Number(r[m.key])||0);});
                                });
                              });
                              const allMetrics=[...METRICS,...FINAL_METRICS];
                              return Object.entries(personMap).sort((a,b)=>a[0].localeCompare(b[0],'ko')).map(([name,acc],i)=>(
                                <tr key={name} style={{background:i%2===0?"#fff":"#f7faf8",borderBottom:"1px solid #f0f1f3"}}>
                                  <td style={{padding:"6px 10px",fontWeight:700,color:"#0f1117",whiteSpace:"nowrap"}}>{name}</td>
                                  <td style={{padding:"6px 8px",textAlign:"center"}}><span style={{background:"#d1fae5",color:"#065f46",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{acc.days}일</span></td>
                                  {METRICS.map(m=><td key={m.key} style={{padding:"6px 8px",textAlign:"center",color:"#374151"}}>{acc.days>0?(Math.round(acc[m.key]/acc.days*10)/10):0}</td>)}
                                  <td style={{padding:"6px 8px",textAlign:"center",color:"#8468D3",fontWeight:600}}>{acc.days>0?Math.round(acc.dailySales/acc.days).toLocaleString()+"원":"0원"}</td>
                                  <td style={{padding:"6px 8px",textAlign:"center",color:"#0071CE"}}>{acc.days>0?(Math.round(acc.connRate/acc.days*10)/10):0}</td>
                                  <td style={{padding:"6px 8px",textAlign:"center",color:"#10b981"}}>{acc.days>0?(Math.round(acc.rate30s/acc.days*10)/10):0}</td>
                                </tr>
                              ));
                            })()}
                            {/* 팀 전체 평균 행 */}
                            {(()=>{
                              const allRows=Object.values(analysisData).flat();
                              const totalDays=Object.keys(analysisData).length;
                              const allMetrics=[...METRICS,...FINAL_METRICS];
                              if(allRows.length===0)return null;
                              return(
                                <tr style={{background:"#ecfdf5",borderTop:"2px solid #6ee7b7"}}>
                                  <td style={{padding:"7px 10px",fontWeight:800,color:"#065f46",whiteSpace:"nowrap"}}>【팀 평균】</td>
                                  <td style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#065f46"}}>{totalDays}일</td>
                                  {METRICS.map(m=>{const tot=allRows.reduce((s,r)=>s+(Number(r[m.key])||0),0);return<td key={m.key} style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#065f46"}}>{allRows.length>0?(Math.round(tot/allRows.length*10)/10):0}</td>;})}
                                  {(()=>{const tot=allRows.reduce((s,r)=>s+(Number(r.dailySales)||0),0);return<td style={{padding:"7px 8px",textAlign:"center",fontWeight:800,color:"#8468D3"}}>{allRows.length>0?Math.round(tot/allRows.length).toLocaleString()+"원":"0원"}</td>;})()}
                                  {(()=>{const tot=allRows.reduce((s,r)=>s+(Number(r.connRate)||0),0);return<td style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#0071CE"}}>{allRows.length>0?(Math.round(tot/allRows.length*10)/10):0}</td>;})()}
                                  {(()=>{const tot=allRows.reduce((s,r)=>s+(Number(r.rate30s)||0),0);return<td style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#10b981"}}>{allRows.length>0?(Math.round(tot/allRows.length*10)/10):0}</td>;})()}
                                </tr>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                      <div style={{background:"#ecfdf5",padding:"6px 14px",fontSize:10,color:"#6b7280",borderTop:"1px solid #d1fae5"}}>
                        ※ 사원별 평균 = 해당 사원이 실제 보고한 날수 기준 · 팀 평균 = 전체 제출건수 기준
                      </div>
                    </div>
                  </div>)}

                  {!analysisData&&!loadingAnalysis&&<div style={{textAlign:"center",padding:"20px",color:"#adb5bd",fontSize:12}}>월을 선택하거나 기간을 입력 후 불러오기를 눌러주세요</div>}
                  {loadingAnalysis&&<div style={{textAlign:"center",padding:"20px",color:"#0071CE",fontSize:12}}>데이터 불러오는 중…</div>}
                </div>
              )}
                </div>
              </div>
            </div>
          )}
          {tab==="ranking"&&<RankingTab contracts={contracts} profiles={profiles} accounts={accounts}/>}
          {tab==="keyword"&&(
            <div style={{background:"#fff",borderRadius:12,border:"1px solid #f0f1f3",overflow:"hidden",height:"calc(100vh - 120px)"}}>
              <iframe
                src="https://keyword-tool-ochre.vercel.app/"
                style={{width:"100%",height:"100%",border:"none"}}
                title="키워드 분석"
              />
            </div>
          )}
          {tab==="admin"&&user.isAdmin&&(<AdminTab projectCategories={projectCategories} setProjectCategories={setProjectCategories} targets={targets} setTargets={setTargets} accounts={accounts} setAccounts={setAccounts} webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl} rankWebhookUrl={rankWebhookUrl} setRankWebhookUrl={setRankWebhookUrl} allData={allData} loadAllData={loadAllData} loadingAll={loadingAll} contracts={contracts} navOrder={navOrder} setNavOrder={setNavOrder}/>)}
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
  if(loading)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Pretendard',-apple-system,sans-serif"}}><p style={{color:"#adb5bd"}}>불러오는 중…</p></div>;
  if(!user)return <LoginScreen onLogin={handleLogin}/>;
  return <MainApp user={user} onLogout={handleLogout}/>;
}
