/** The still do.computer creature the Factory Bots board uses, at sidebar size. */

const COLORS = [
  "#b8674a",
  "#5f8a4e",
  "#3f7f9c",
  "#7d5a9a",
  "#c9952c",
  "#5b6672",
  "#c0607a",
  "#2f3a52",
];

const INK = "#1b2021";

function colorFor(agentId: string): string {
  let hash = 0;
  for (let index = 0; index < agentId.length; index += 1) {
    hash = (hash * 31 + agentId.charCodeAt(index)) >>> 0;
  }
  return COLORS[(hash >>> 8) % COLORS.length]!;
}

export function FactoryBotAvatar({ agentId }: { agentId: string }) {
  return (
    <svg className="size-full" viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="56" rx="15" ry="3" fill={INK} fillOpacity="0.18" />
      <path
        d="M32 11c12 0 21 9 21 21 0 11-8 20-21 20S11 43 11 32c0-12 9-21 21-21Z"
        fill={colorFor(agentId)}
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
