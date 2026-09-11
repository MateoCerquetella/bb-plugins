import { randomBytes } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { CHANGED, defaults, settingsSchema, snapshotSchema, applySchema, slotNumberSchema, type Snapshot, type ApplyInput } from "./lib/model.ts";
import { decodeImage } from "./lib/image.ts";

export const rpcContract = defineRpcContract({
  get: { input: z.null(), output: snapshotSchema },
  apply: { input: applySchema, output: snapshotSchema },
  setDimmer: { input: z.object({ enabled: z.boolean() }).strict(), output: snapshotSchema },
  activateSlot: { input: z.object({ slot: slotNumberSchema }).strict(), output: snapshotSchema },
  deleteSlot: { input: z.object({ slot: slotNumberSchema }).strict(), output: snapshotSchema },
  reset: { input: z.null(), output: snapshotSchema },
});
type Stored = { settings: string; image_info: string | null; image_bytes: Buffer | null };
export default function aura(bb: BbPluginApi): void {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    "CREATE TABLE background (id INTEGER PRIMARY KEY CHECK (id = 1), settings TEXT NOT NULL, image_info TEXT, image_bytes BLOB)",
    "ALTER TABLE background ADD COLUMN active_slot INTEGER",
    "CREATE TABLE aura_slots (slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 6), name TEXT NOT NULL, settings TEXT NOT NULL, image_info TEXT, image_bytes BLOB)",
  ]);
  db.prepare("INSERT OR IGNORE INTO background (id, settings) VALUES (1, ?)").run(JSON.stringify(defaults));
  function read(): Snapshot {
    const row = db.prepare("SELECT settings, image_info, active_slot FROM background WHERE id = 1").get() as Stored & { active_slot: number | null };
    const slots = (db.prepare("SELECT slot, name, settings, image_info FROM aura_slots ORDER BY slot").all() as (Stored & { slot: number; name: string })[])
      .map(slot => ({ slot: slot.slot, name: slot.name, settings: JSON.parse(slot.settings), image: slot.image_info ? JSON.parse(slot.image_info) : null }));
    return snapshotSchema.parse({ settings: JSON.parse(row.settings), image: row.image_info ? JSON.parse(row.image_info) : null, slots, activeSlot: row.active_slot });
  }
  function changed(): Snapshot { const value = read(); bb.realtime.publish(CHANGED, null); return value; }
  function apply(input: ApplyInput): Snapshot {
    // Validate/decode before entering the transaction. A bad image never applies
    // partial settings or overwrites a saved slot.
    const value = applySchema.parse(input);
    const decoded = value.image.action === "replace" ? decodeImage(value.image.dataUrl) : null;
    db.transaction(() => {
      const previous = db.prepare("SELECT settings, image_info, image_bytes, active_slot FROM background WHERE id = 1").get() as Stored & { active_slot: number | null };
      let info = previous.image_info, bytes = previous.image_bytes;
      if (value.image.action === "remove") { info = null; bytes = null; }
      else if (value.image.action === "replace" && decoded) {
        bytes = decoded.bytes;
        info = JSON.stringify({ version: randomBytes(12).toString("hex"), name: value.image.name, mime: decoded.mime, bytes: bytes.length });
      }
      const settings = JSON.stringify(value.settings);
      const appearance = ({ enabled, newThreadOnly, dimmerEnabled, ...rest }: Snapshot["settings"]) => JSON.stringify(rest);
      const sameAppearance = value.image.action === "keep" && appearance(settingsSchema.parse(JSON.parse(previous.settings))) === appearance(value.settings);
      const activeSlot = value.saveSlot?.slot ?? (sameAppearance ? previous.active_slot : null);
      db.prepare("UPDATE background SET settings = ?, image_info = ?, image_bytes = ?, active_slot = ? WHERE id = 1")
        .run(settings, info, bytes, activeSlot);
      if (value.saveSlot) db.prepare("INSERT INTO aura_slots (slot, name, settings, image_info, image_bytes) VALUES (?, ?, ?, ?, ?) ON CONFLICT(slot) DO UPDATE SET name=excluded.name, settings=excluded.settings, image_info=excluded.image_info, image_bytes=excluded.image_bytes")
        .run(value.saveSlot.slot, value.saveSlot.name, settings, info, bytes);
    })();
    return changed();
  }
  function activate(slot: number): Snapshot {
    db.transaction(() => {
      const saved = db.prepare("SELECT settings, image_info, image_bytes FROM aura_slots WHERE slot = ?").get(slot) as Stored | undefined;
      if (!saved) throw new Error(`Slot ${slot} is empty.`);
      const current = read().settings;
      const settings = settingsSchema.parse({ ...JSON.parse(saved.settings), enabled: current.enabled, newThreadOnly: current.newThreadOnly, dimmerEnabled: current.dimmerEnabled });
      db.prepare("UPDATE background SET settings = ?, image_info = ?, image_bytes = ?, active_slot = ? WHERE id = 1")
        .run(JSON.stringify(settings), saved.image_info, saved.image_bytes, slot);
    })();
    return changed();
  }
  function deleteSlot(slot: number): Snapshot {
    db.transaction(() => {
      db.prepare("DELETE FROM aura_slots WHERE slot = ?").run(slot);
      db.prepare("UPDATE background SET active_slot = NULL WHERE active_slot = ?").run(slot);
    })();
    return changed();
  }
  function reset(): Snapshot {
    const current = read().settings;
    return apply({ settings: { ...defaults, enabled: current.enabled, newThreadOnly: current.newThreadOnly, dimmerEnabled: current.dimmerEnabled }, image: { action: "remove" } });
  }
  bb.rpc.register(rpcContract, { get: read, apply, setDimmer: ({ enabled }) => {
    const current = read().settings;
    return apply({ settings: { ...current, dimmerEnabled: enabled, fade: enabled && current.fade === 0 ? 1 : current.fade }, image: { action: "keep" } });
  }, activateSlot: ({slot}) => activate(slot), deleteSlot: ({slot}) => deleteSlot(slot), reset });
  bb.http.route("GET", "/image", c => {
    const version = c.req.query("v");
    if (!version || !/^[a-f0-9]{24}$/.test(version)) return c.notFound();
    // A saved slot keeps its own image, even when the active image changes.
    const row = db.prepare("SELECT image_info, image_bytes FROM background WHERE json_extract(image_info, '$.version') = ? UNION ALL SELECT image_info, image_bytes FROM aura_slots WHERE json_extract(image_info, '$.version') = ? LIMIT 1").get(version, version) as Stored | undefined;
    if (!row?.image_info || !row.image_bytes) return c.notFound();
    return new Response(new Uint8Array(row.image_bytes), { headers: {
      "Content-Type": JSON.parse(row.image_info).mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    } });
  });
  const usage = "bb aura status [--json]\nbb aura enable|disable|reset\nbb aura slots\nbb aura use <1-6>\nbb aura new-thread-only on|off\nOpen Settings → Aura to upload images and save slots.";
  bb.cli.register({
    name: "aura", summary: "Manage Aura backgrounds and saved slots",
    commands: ["status", "enable", "disable", "reset", "slots", "use", "new-thread-only"].map(name => ({ name, summary: `Aura ${name}`, usage: `bb aura ${name}` })),
    async run(argv) {
      const [command, ...args] = argv.filter(arg => arg !== "--json");
      if (!command || command === "help" || command === "--help") return { exitCode: 0, stdout: usage };
      let result: unknown;
      try {
        if (["status", "slots", "reset", "enable", "disable"].includes(command) && args.length === 0) {
          if (command === "reset") result = reset();
          else if (command === "enable" || command === "disable") result = apply({ settings: { ...read().settings, enabled: command === "enable" }, image: { action: "keep" } });
          else result = command === "slots" ? read().slots : read();
        } else if (command === "use" && args.length === 1 && /^[1-6]$/.test(args[0]!)) result = activate(Number(args[0]));
        else if (command === "new-thread-only" && args.length === 1 && ["on", "off"].includes(args[0]!)) result = apply({ settings: { ...read().settings, newThreadOnly: args[0] === "on" }, image: { action: "keep" } });
        else return { exitCode: 1, stderr: usage };
        return { exitCode: 0, stdout: JSON.stringify(result, null, 2) };
      } catch (error) { return { exitCode: 1, stderr: error instanceof Error ? error.message : String(error) }; }
    },
  });
}
