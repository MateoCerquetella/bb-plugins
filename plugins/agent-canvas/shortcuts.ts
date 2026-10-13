export const shortcutDefaults={search:"Mod+K",fit:"0",minimap:"Mod+Shift+M",attention:"Mod+Shift+A",nextNode:"Mod+Tab",previousNode:"Mod+Shift+Tab",nextWorkspace:"Mod+ArrowDown",previousWorkspace:"Mod+ArrowUp",connect:"Mod+L",ensembles:"Mod+Shift+L",settings:"Mod+,",sidebar:"Mod+S"} as const;
export type ShortcutAction=keyof typeof shortcutDefaults;
export const shortcutLabels:Record<ShortcutAction,string>={search:"Search",fit:"Fit all",minimap:"Minimap",attention:"Next agent needing attention",nextNode:"Next element",previousNode:"Previous element",nextWorkspace:"Next workspace",previousWorkspace:"Previous workspace",connect:"Connect selected element",ensembles:"Ensembles",settings:"Settings",sidebar:"Toggle sidebar"};
export function bindingFor(action:ShortcutAction,custom:Record<string,string>){return custom[action]??shortcutDefaults[action];}
export function matchesBinding(event:Pick<KeyboardEvent,"key"|"ctrlKey"|"metaKey"|"shiftKey"|"altKey">,binding:string){
 const parts=binding.toLowerCase().split("+"),key=parts.pop()!;
 return event.key.toLowerCase()===key&&Boolean(event.ctrlKey||event.metaKey)===parts.includes("mod")&&event.shiftKey===parts.includes("shift")&&event.altKey===parts.includes("alt");
}
export function captureBinding(event:Pick<KeyboardEvent,"key"|"ctrlKey"|"metaKey"|"shiftKey"|"altKey">){if(["Control","Meta","Shift","Alt"].includes(event.key))return null;return [...(event.ctrlKey||event.metaKey?["Mod"]:[]),...(event.shiftKey?["Shift"]:[]),...(event.altKey?["Alt"]:[]),event.key.length===1?event.key.toUpperCase():event.key].join("+");}
