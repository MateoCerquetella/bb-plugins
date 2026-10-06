import path from "node:path";
export function relativeResourcePath(raw:string):string{
 if(!raw||raw.length>2000||raw.includes("\0")||raw.includes("\\")||path.posix.isAbsolute(raw)||raw.split("/").some(segment=>segment===".."))throw Error("File path must stay within the selected environment");
 const normalized=path.posix.normalize(raw);if(normalized==="."||normalized.startsWith("../"))throw Error("Choose a file within the selected environment");return normalized;
}
