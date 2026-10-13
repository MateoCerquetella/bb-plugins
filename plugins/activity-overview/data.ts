export type Period = "year" | "quarter" | "month";
export type Repository = "all" | "bb-plugins" | "taskboard";
export type Overview = {
  contributions: number; opened: number; merged: number; reviews: number;
  delta: string; currentStreak: number; longestStreak: number;
  activeMonth: string; activeDay: string; heatmap: number[]; attention: string[];
};

const base: Record<Repository, Overview> = {
  all: { contributions: 1284, opened: 86, merged: 72, reviews: 214, delta: "+18% vs prior period", currentStreak: 12, longestStreak: 38, activeMonth: "October", activeDay: "Tuesday", heatmap: [], attention: ["Review requested in bb-plugins", "PR #184 has conflicts", "3 stale branches"] },
  "bb-plugins": { contributions: 742, opened: 51, merged: 44, reviews: 128, delta: "+24% vs prior period", currentStreak: 9, longestStreak: 31, activeMonth: "October", activeDay: "Tuesday", heatmap: [], attention: ["Review requested in taskboard", "PR #184 has conflicts"] },
  taskboard: { contributions: 318, opened: 22, merged: 18, reviews: 56, delta: "+11% vs prior period", currentStreak: 6, longestStreak: 19, activeMonth: "September", activeDay: "Thursday", heatmap: [], attention: ["PR #92 needs review", "Branch is 14 days old"] },
};
const periodFactor: Record<Period, number> = { year: 1, quarter: 0.34, month: 0.12 };
export const periods: { value: Period; label: string }[] = [
  { value: "year", label: "Last 12 months" }, { value: "quarter", label: "Last 90 days" }, { value: "month", label: "Last 30 days" },
];
export const repositories: { value: Repository; label: string }[] = [
  { value: "all", label: "All repositories" }, { value: "bb-plugins", label: "bb-plugins" }, { value: "taskboard", label: "taskboard" },
];
export function getOverview(period: Period, repository: Repository): Overview {
  const source = base[repository]; const factor = periodFactor[period];
  const scale = (value: number) => Math.max(0, Math.round(value * factor));
  return { ...source, contributions: scale(source.contributions), opened: scale(source.opened), merged: scale(source.merged), reviews: scale(source.reviews), currentStreak: period === "month" ? Math.min(source.currentStreak, 8) : source.currentStreak, heatmap: Array.from({ length: 364 }, (_, index) => (index * 7 + source.contributions) % 5), attention: source.attention };
}
