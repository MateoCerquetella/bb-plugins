import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { Fleet, rpcContract } from "./contract.ts";
import { Button } from "./components/ui/button.tsx";

export function ThresholdSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const [values, setValues] = useState<Fleet["thresholds"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    void rpc.call("fleet").then((fleet) => {
      if (active) setValues(fleet.thresholds);
    }).catch(() => { if (active) setStatus("Could not load thresholds."); });
    return () => { active = false; };
  }, [rpc]);

  const save = async () => {
    if (!values || saving) return;
    setSaving(true);
    setStatus("");
    try {
      setValues(await rpc.call("saveThresholds", values));
      setStatus("Thresholds saved.");
    } catch {
      setStatus("Could not save thresholds. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="host-monitor-thresholds">
      {values && (["cpu", "ram", "disk"] as const).map((metric) => (
        <label key={metric}>
          <span>{metric === "cpu" ? "CPU" : metric === "ram" ? "RAM" : "Disk"}</span>
          <input aria-label={`${metric.toUpperCase()} critical threshold`} type="range" min="1" max="100" step="1"
            disabled={saving} value={values[metric]}
            onChange={(event) => setValues({ ...values, [metric]: Number(event.target.value) })} />
          <output>{values[metric]}%</output>
        </label>
      ))}
      <Button disabled={!values || saving} onClick={() => void save()}>{saving ? "Saving..." : "Save thresholds"}</Button>
      <p role="status">{status}</p>
    </section>
  );
}
