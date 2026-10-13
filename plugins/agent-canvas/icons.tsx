import { experimental_Icon as HostIcon } from "@get-bb/plugin-sdk/app";

// BB's icon registry does not include these canvas glyphs. Keep their artwork
// in the plugin rather than rendering the host's missing-icon Zap fallback.
const paths: Record<string,string> = {
  MousePointer2:"M4 3l6 17 3-7 7-3L4 3z",
  StickyNote:"M4 3h16v11l-6 7H4V3z M14 21v-7h6 M8 7h8 M8 11h5",
  Link:"M10 13l4-4 M8 15l-1 1a4 4 0 01-6-6l4-4a4 4 0 016 0 M16 9l1-1a4 4 0 016 6l-4 4a4 4 0 01-6 0",
  Type:"M4 5h16 M12 5v15 M8 20h8 M4 5v3 M20 5v3",
  Pencil:"M4 16L16 4a2.8 2.8 0 014 4L8 20l-5 1 1-5z M14 6l4 4",
  Hand:"M8 12V6a2 2 0 014 0v6 M12 12V4a2 2 0 014 0v8 M16 12V7a2 2 0 014 0v8c0 4-3 6-7 6h-1c-2 0-3-1-4-2l-5-6a2 2 0 013-2l2 2",
  Map:"M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5z M9 3v16 M15 5v16",
  Minus:"M5 12h14",
};
const aliases: Record<string,string> = {Users:"UserRound",Notebook:"Explore",GripVertical:"DragDropVertical"};
export function CanvasIcon({name}:{name:string}) {
  const path=paths[name];
  return path?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>:<HostIcon name={aliases[name]??name}/>;
}
