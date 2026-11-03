import { useEffect, useRef, useState } from "react";

import type { AgentStatus } from "../contract";
import type { MascotState, Orb } from "../vendor/mascot/orb-core.js";
import { DoodAvatar, avatarLook } from "./dood";
import { drawing, isDark, prefersCalm } from "./orb";

const STATE: Record<AgentStatus, MascotState> = {
  idle: "idle",
  working: "working",
  blocked: "waiting",
};

/**
 * The live do.computer creature, drawn by its own WebGL code at card size. If
 * the window has no WebGL, the same seed falls back to the static avatar.
 */
export function DoodOrb({
  agentId,
  status,
  size = 32,
}: {
  agentId: string;
  status: AgentStatus;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<Orb | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const color = avatarLook(null, agentId).color;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let core;
    try {
      core = drawing();
    } catch {
      core = null;
    }
    if (core === null) {
      setSupported(false);
      return;
    }
    const orb = core.createOrb(canvas, {
      seed: agentId,
      color,
      dark: isDark(),
      reduced: prefersCalm(),
      size,
      slow: true,
      notice: false,
    });
    orbRef.current = orb;
    setSupported(true);
    const observer = new MutationObserver(() => orb.setTheme(isDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      observer.disconnect();
      orb.dispose();
      orbRef.current = null;
    };
  }, [agentId, color, size]);

  useEffect(() => {
    orbRef.current?.setState(STATE[status]);
  }, [status]);

  if (supported === false) return <DoodAvatar agentId={agentId} />;

  return (
    <canvas
      ref={canvasRef}
      className="fb-orb"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
