/**
 * The static creature from computer.do's protocol package. The live Dood is a
 * three.js mascot; this is the still the clients use while that loads, and the
 * only form the board needs.
 */

export const AVATAR_COLORS = [
  { id: "clay", label: "Clay", hex: "#b8674a" },
  { id: "moss", label: "Moss", hex: "#5f8a4e" },
  { id: "tide", label: "Tide", hex: "#3f7f9c" },
  { id: "plum", label: "Plum", hex: "#7d5a9a" },
  { id: "honey", label: "Honey", hex: "#c9952c" },
  { id: "slate", label: "Slate", hex: "#5b6672" },
  { id: "rose", label: "Rose", hex: "#c0607a" },
  { id: "ink", label: "Ink", hex: "#2f3a52" },
] as const;

export type AvatarColorId = (typeof AVATAR_COLORS)[number]["id"];

const INK = "#1b2021";

/** A stable default so an agent's color does not change between reloads. */
export function defaultAvatar(agentId: string): { color: AvatarColorId } {
  let hash = 0;
  for (let index = 0; index < agentId.length; index += 1) {
    hash = (hash * 31 + agentId.charCodeAt(index)) >>> 0;
  }
  return { color: AVATAR_COLORS[(hash >>> 8) % AVATAR_COLORS.length]!.id };
}

/** The seed/color pair an agent's creature is drawn from. */
export function avatarLook(
  avatar: { color?: string; seed?: string } | null | undefined,
  agentId: string,
): { seed: string; color: string } {
  const resolved: { color?: string; seed?: string } =
    avatar ?? defaultAvatar(agentId);
  const color =
    AVATAR_COLORS.find((entry) => entry.id === resolved.color)?.hex ??
    AVATAR_COLORS.find((entry) => entry.id === defaultAvatar(agentId).color)!.hex;
  return { seed: resolved.seed ?? agentId, color };
}

/** The same still as an SVG string, for a non-React consumer or a test. */
export function avatarSvg(agentId: string): string {
  const { color } = avatarLook(null, agentId);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<ellipse cx="32" cy="56" rx="15" ry="3" fill="${INK}" fill-opacity="0.18"/>` +
    `<path d="M32 11c12 0 21 9 21 21 0 11-8 20-21 20S11 43 11 32c0-12 9-21 21-21Z" fill="${color}"/>` +
    `<g fill="#fff"><ellipse cx="25" cy="32" rx="4.2" ry="5"/><ellipse cx="39" cy="32" rx="4.2" ry="5"/></g>` +
    `<g fill="${INK}"><circle cx="25.6" cy="33" r="2.4"/><circle cx="39.6" cy="33" r="2.4"/></g>` +
    `</svg>`
  );
}

/** One static Dood for an agent. The color is seeded by the agent's name. */
export function DoodAvatar({ agentId }: { agentId: string }) {
  const { color } = avatarLook(null, agentId);
  return (
    <svg className="fb-dood" viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="56" rx="15" ry="3" fill={INK} fillOpacity="0.18" />
      <path
        d="M32 11c12 0 21 9 21 21 0 11-8 20-21 20S11 43 11 32c0-12 9-21 21-21Z"
        fill={color}
      />
      <g fill="#fff">
        <ellipse cx="25" cy="32" rx="4.2" ry="5" />
        <ellipse cx="39" cy="32" rx="4.2" ry="5" />
      </g>
      <g fill={INK}>
        <circle cx="25.6" cy="33" r="2.4" />
        <circle cx="39.6" cy="33" r="2.4" />
      </g>
    </svg>
  );
}
