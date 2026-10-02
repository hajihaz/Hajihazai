/* Shared JARVIS AI boundary contract. No credentials or provider configuration. */
(function (root, factory) {
  const contract = factory();
  if (typeof module === "object" && module.exports) module.exports = contract;
  else root.JarvisAIContract = contract;
})(globalThis, function () {
  "use strict";
  const LIMITS = Object.freeze({ message:4000, history:4, historyText:1500, reply:12000, contextBytes:12000, actions:5, amount:1e12 });
  const CATEGORIES = ["gold","silver","green","rose","car","bike","scooter","home","apartment","land","stocks","crypto","business","travel","education","electronics","jewellery","watch","other"];
  const record = v => !!v && typeof v === "object" && !Array.isArray(v);
  function redact(value) {
    return value.replace(/\b(?:gsk_|sk-|sbp_)[A-Za-z0-9_-]{20,}\b/g,"[redacted]")
      .replace(/\bBearer\s+[A-Za-z0-9_.-]{12,}/gi,"Bearer [redacted]")
      .replace(/\b(?:password|api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi,"[redacted credential]");
  }
  const text = (v,max) => typeof v === "string" ? redact(v.trim()).slice(0,max) : "";
  const number = (v,min=0,max=LIMITS.amount) => typeof v === "number" && Number.isFinite(v) && v>=min && v<=max ? v : null;
  const id = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : "";
  function validDate(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v+"T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v && v>="1900-01-01" && v<="2200-12-31";
  }
  const date = v => validDate(v) ? v : "";
  const pickNumbers = (input,names,min=0,max=LIMITS.amount) => {
    const out={};if(!record(input))return out;
    for(const name of names){const v=number(input[name],min,max);if(v!==null)out[name]=v}return out;
  };
  function goal(v) {
    if(!record(v))return null;
    const current=number(v.current),target=number(v.target,Number.MIN_VALUE);
    if(current===null||target===null||!text(v.name,120)||!text(v.unit,8))return null;
    return {id:id(v.id),name:text(v.name,120),category:CATEGORIES.includes(v.category)?v.category:"other",unit:text(v.unit,8),current,target,deadline:date(v.deadline),subtitle:text(v.subtitle,100),progress:Math.min(100,current/target*100),pace:pickNumbers(v.pace,["days","daily","weekly","monthly"],0)};
  }
  function todo(v) {
    if(!record(v)||!text(v.title,100))return null;
    return {id:id(v.id),title:text(v.title,100),notes:text(v.notes,180),due:date(v.due),priority:["low","normal","high"].includes(v.priority)?v.priority:"normal",recurrence:["none","daily","weekly","monthly"].includes(v.recurrence)?v.recurrence:"none",link:text(v.link,80),done:v.done===true};
  }
  const moneyRow = v => record(v)&&text(v.name,80)&&number(v.value)!==null ? {id:id(v.id),name:text(v.name,80),value:v.value} : null;
  const list = (v,max,clean) => Array.isArray(v) ? v.slice(0,max).map(clean).filter(Boolean) : [];
  function sanitizeContext(value) {
    const v=record(value)?value:{};
    const out={goals:list(v.goals,20,goal),todos:list(v.todos,20,todo),assets:list(v.assets,15,moneyRow),liabilities:list(v.liabilities,15,moneyRow),businessInvestments:list(v.businessInvestments,10,goal),summary:{...pickNumbers(v.summary,["goalCount","openTodos","assets","liabilities"]),...pickNumbers(v.summary,["netWorth"],-LIMITS.amount)}};
    if(record(v.life))out.life={dob:date(v.life.dob),age:pickNumbers(v.life.age,["years","months","days"],0,150),daysToNextBirthday:number(v.life.daysToNextBirthday,0,366)};
    if(typeof v.now==="string"&&!Number.isNaN(Date.parse(v.now)))out.now=v.now.slice(0,30);
    if(record(v.attendance)){
      const a=v.attendance;
      out.attendance={target:number(a.target,1,99),semesterEnd:date(a.semesterEnd),semesterFinished:a.semesterFinished===true,overall:pickNumbers(a.overall,["present","absent","total","percentage","classesNeeded"],0,100000),subjects:list(a.subjects,15,x=>record(x)?{code:text(x.code,40),name:text(x.name,100),...pickNumbers(x,["present","absent","total","percentage","classesNeeded"],0,100000)}:null)};
      if(record(a.nextCollegeDay))out.attendance.nextCollegeDay={date:date(a.nextCollegeDay.date),holiday:a.nextCollegeDay.holiday===true,classes:list(a.nextCollegeDay.classes,8,x=>record(x)?{time:text(x.time,20),code:text(x.code,40),name:text(x.name,100),status:["present","absent","unmarked"].includes(x.status)?x.status:"unmarked"}:null)};
    }
    out.assessments=list(v.assessments,15,x=>record(x)?{code:text(x.code,40),name:text(x.name,100),cla1:{assignment:x.cla1?.assignment===true,viva:x.cla1?.viva===true},cla2:{assignment:x.cla2?.assignment===true,viva:x.cla2?.viva===true}}:null);
    const omitted={};
    const buckets=[
      ["todos",out.todos,v.todos,20],["goals",out.goals,v.goals,20],
      ["businessInvestments",out.businessInvestments,v.businessInvestments,10],
      ["assets",out.assets,v.assets,15],["liabilities",out.liabilities,v.liabilities,15],
      ["assessments",out.assessments,v.assessments,15],
      ["attendance.subjects",out.attendance?.subjects,v.attendance?.subjects,15],
      ["attendance.classes",out.attendance?.nextCollegeDay?.classes,v.attendance?.nextCollegeDay?.classes,8]
    ];
    for(const [key,,input,max] of buckets){
      const prior=record(v.omitted)?number(v.omitted[key],0,100000):null;
      const count=(prior||0)+(Array.isArray(input)?Math.max(0,input.length-max):0);
      if(count)omitted[key]=Math.min(100000,count);
    }
    if(Object.keys(omitted).length)out.omitted=omitted;
    const bytes=()=>new TextEncoder().encode(JSON.stringify(out)).length;
    while(bytes()>LIMITS.contextBytes){
      const bucket=buckets.find(([,rows])=>Array.isArray(rows)&&rows.length);
      if(!bucket)break;
      const [key,rows]=bucket;rows.pop();omitted[key]=(omitted[key]||0)+1;out.omitted=omitted;
    }
    return out;
  }
  function sanitizeHistory(value) {
    return list(Array.isArray(value)?value.slice(-LIMITS.history):[],LIMITS.history,x=>record(x)&&["user","assistant"].includes(x.role)&&text(x.content,LIMITS.historyText)?{role:x.role,content:text(x.content,LIMITS.historyText)}:null).slice(-LIMITS.history);
  }
  function validateAction(value, goals) {
    if(!record(value)||!record(value.payload))return null;
    const p=value.payload;let payload;
    if(value.type==="create_goal"){
      if(typeof p.name!=="string"||!p.name.trim()||p.name.trim().length>120||typeof p.unit!=="string"||!p.unit.trim()||p.unit.length>8||!CATEGORIES.includes(p.category))return null;
      const target=number(p.target,Number.MIN_VALUE),current=p.current===undefined?0:number(p.current);
      if(target===null||current===null||current>target||p.deadline!==undefined&&typeof p.deadline!=="string"||p.deadline&& !validDate(p.deadline)||p.subtitle!==undefined&&typeof p.subtitle!=="string")return null;
      payload={name:text(p.name,120),unit:text(p.unit,8),category:p.category,current,target,deadline:p.deadline||"",subtitle:text(p.subtitle,100)};
    }else if(value.type==="update_goal_progress"){
      const current=number(p.current),goalId=id(p.goalId);if(!goalId||current===null)return null;
      if(Array.isArray(goals)){const g=goals.find(g=>g.id===goalId);if(!g||current>g.target)return null}
      payload={goalId,current};
    }else if(value.type==="create_todo"){
      if(typeof p.title!=="string"||!p.title.trim()||p.title.trim().length>100||p.due!==undefined&&typeof p.due!=="string"||p.due&&!validDate(p.due))return null;
      if(p.priority!==undefined&&!["low","normal","high"].includes(p.priority)||p.recurrence!==undefined&&!["none","daily","weekly","monthly"].includes(p.recurrence))return null;
      for(const [key,max] of [["notes",500],["link",80]])if(p[key]!==undefined&&(typeof p[key]!=="string"||p[key].length>max))return null;
      payload={title:text(p.title,100),notes:text(p.notes,500),due:p.due||"",priority:p.priority||"normal",recurrence:p.recurrence||"none",link:text(p.link,80)};
    }else return null;
    return {type:value.type,label:text(value.label,120)||value.type.replace(/_/g," "),payload};
  }
  function normalizeReply(value, goals) {
    if(!record(value)||typeof value.reply!=="string"||!value.reply.trim()||value.reply.length>LIMITS.reply)return null;
    if(value.model==="none"||value.provider==="none")return null;
    const reply=text(value.reply,LIMITS.reply).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<analysis>[\s\S]*?<\/analysis>/gi,"").trim();
    if(!reply||/^\s*<(?:think|analysis)>/i.test(reply))return null;
    return {reply,actions:Array.isArray(value.actions)?value.actions.slice(0,LIMITS.actions).map(x=>validateAction(x,goals)).filter(Boolean):[]};
  }
  return Object.freeze({LIMITS,CATEGORIES,redact,text,record,number,id,validDate,sanitizeContext,sanitizeHistory,validateAction,normalizeReply});
});
