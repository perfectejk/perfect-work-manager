// 주간계획 · 블로그/영수증 리뷰 계획 · 작업 캘린더가 같이 쓰는 날짜·수량 도구.
// App.jsx 에 있던 코드를 글자 그대로 옮겨 왔다(동작 같음).
export const PLAN_TYPES=[
  {k:"traffic",label:"트래픽",pk:"rewardTraffic",unit:"타",color:"#0071CE"},
  {k:"route",label:"길찾기 트래픽",pk:"rewardTraffic",unit:"타",color:"#0891b2"},
  {k:"savetraffic",label:"저장+트래픽",pk:"rewardTraffic",unit:"타",color:"#8468D3"},
  {k:"premium",label:"프리미엄 트래픽",pk:"premiumTraffic",unit:"타",color:"#b45309"},
  {k:"save",label:"저장",pk:null,unit:"건",color:"#f59e0b"},
  {k:"alarm",label:"알림받기",pk:null,unit:"건",color:"#10b981"},
];
// 로컬 날짜 그대로 포맷한다. toISOString() 을 쓰면 UTC 로 밀려 한국에서 하루가 어긋난다.
export const ymdLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
export const planAddDays=(ds,n)=>{const d=new Date(ds+"T00:00:00");d.setDate(d.getDate()+n);return ymdLocal(d);};
// 작업일수 = 시작일과 종료일을 모두 포함한 일수. 날짜가 비면 저장된 값으로 대체.
export const planDays=r=>{
  if(r&&r.start&&r.end&&r.end>=r.start)return Math.round((new Date(r.end+"T00:00:00")-new Date(r.start+"T00:00:00"))/86400000)+1;
  return parseInt(r&&r.days)||0;
};
export const intOr=(v,f)=>{const n=parseInt(v);return isNaN(n)?f:n;};
// 리뷰나우·영수증 리뷰는 지정한 요일에만 올릴 수 있다.
// r.days = [0~6] (0=일). 비어 있거나 없으면 "매일"(null)
export const blogDaysOf=r=>{const d=r&&r.days;return Array.isArray(d)&&d.length&&d.length<7?d:null;};
