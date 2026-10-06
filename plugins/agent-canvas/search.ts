export type SearchEntry={id:string;label:string;kind:string;workspaceId?:string;detail?:string;body?:string;keywords?:string;run:()=>void};
export const fold=(value:string)=>value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase();
function subsequence(query:string,text:string){let position=0,first=-1,last=-1;for(const char of query){const found=text.indexOf(char,position);if(found<0)return null;if(first<0)first=found;last=found;position=found+1;}return last-first-query.length+1;}
export function rankSearch(entries:SearchEntry[],query:string,workspaceId:string|null){
 const words=fold(query).trim().split(/\s+/).filter(Boolean);
 return entries.flatMap(entry=>{
  const label=fold(entry.label),meta=fold(`${entry.kind} ${entry.detail??""} ${entry.keywords??""}`),body=fold(entry.body??"");
  let score=entry.workspaceId===workspaceId?15:0;
  for(const word of words){
   const at=label.indexOf(word);
   if(at>=0){score+=120+(at===0?30:0);continue;}
   if(meta.includes(word)){score+=60;continue;}
   if(body.includes(word)){score+=20;continue;}
   const gap=subsequence(word,label);
   if(gap===null||gap>Math.max(8,word.length*3))return [];
   score+=Math.max(1,35-gap);
  }
  if(!words.length)score+=entry.kind==="Action"?200:0;
  return [{entry,score}];
 }).sort((a,b)=>b.score-a.score||a.entry.label.localeCompare(b.entry.label)||a.entry.id.localeCompare(b.entry.id)).slice(0,80).map(v=>v.entry);
}
