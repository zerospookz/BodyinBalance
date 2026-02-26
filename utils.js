export function uid(len=10){
  const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<len;i++) s+=a[Math.floor(Math.random()*a.length)];
  return s;
}
export function escapeHtml(str){
  return String(str??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
export function linkify(htmlEscaped){
  // input already escaped
  const urlRegex = /(https?:\/\/[^\s<]+)|(www\.[^\s<]+)/g;
  return htmlEscaped.replace(urlRegex, (m)=>{
    const href = m.startsWith("http") ? m : "https://" + m;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${m}</a>`;
  });
}
export function normalizeDay(day){
  const d0 = String(day||"").trim();
  const d = d0.toLowerCase();
  const map = {
    "понеделник":"Понеделник","mon":"Понеделник","monday":"Понеделник",
    "вторник":"Вторник","tue":"Вторник","tues":"Вторник","tuesday":"Вторник",
    "сряда":"Сряда","wed":"Сряда","wednesday":"Сряда",
    "четвъртък":"Четвъртък","thu":"Четвъртък","thur":"Четвъртък","thurs":"Четвъртък","thursday":"Четвъртък",
    "петък":"Петък","fri":"Петък","friday":"Петък",
    "събота":"Събота","sat":"Събота","saturday":"Събота",
    "неделя":"Неделя","sun":"Неделя","sunday":"Неделя"
  };
  if(map[d]) return map[d];
  for(const k of Object.keys(map)){
    if(d.startsWith(k+" ")||d.startsWith(k+"-")||d.startsWith(k+"–")||d.startsWith(k+"—")) return map[k];
  }
  const num = d.match(/\bday\s*([1-7])\b/i) || d.match(/\bday\s*([1-7])/i) || d.match(/\bден\s*([1-7])\b/i) || d.match(/\bден\s*([1-7])/i) || d.match(/^\s*([1-7])\b/);
  if(num){ const n=Number(num[1]); const days=["Понеделник","Вторник","Сряда","Четвъртък","Петък","Събота","Неделя"]; return days[n-1]; }
  return "Понеделник";
}
