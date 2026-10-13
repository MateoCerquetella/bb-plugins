import {createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";
const identity=z.tuple([z.string().min(1).max(240),z.string().min(1).max(240)]);
export function noteMentionToken(key:string,threadId:string,noteId:string){
 const payload=Buffer.from(JSON.stringify(identity.parse([threadId,noteId]))).toString("base64url");
 return `${payload}.${createHmac("sha256",key).update(payload).digest("base64url")}`;
}
export function readNoteMentionToken(key:string,token:string){
 if(token.length>1000)throw Error("Invalid note mention");
 const parts=token.split(".");if(parts.length!==2)throw Error("Invalid note mention");
 const expected=createHmac("sha256",key).update(parts[0]).digest(),actual=Buffer.from(parts[1],"base64url");
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error("Invalid note mention");
 const [threadId,noteId]=identity.parse(JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")));
 return {threadId,noteId};
}
