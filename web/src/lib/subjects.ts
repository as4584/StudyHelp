/**
 * Subject identity: a restrained accent per academic family (DESIGN.md §2b).
 * Accents tint marks, nodes and light — never whole surfaces.
 */
export type SubjectFamily = "math" | "science" | "writing" | "computing" | "general";

export const SUBJECT_ACCENT: Record<SubjectFamily, { name: string; ink: string; mark: string; glow: string }> = {
  math: { name: "Mathematics", ink: "#3730a3", mark: "#4f46e5", glow: "rgb(79 70 229 / 0.20)" },
  science: { name: "Science", ink: "#0f766e", mark: "#14b8a6", glow: "rgb(20 184 166 / 0.20)" },
  writing: { name: "Writing & humanities", ink: "#9a3412", mark: "#d97706", glow: "rgb(217 119 6 / 0.18)" },
  computing: { name: "Computer science", ink: "#6d28d9", mark: "#8b5cf6", glow: "rgb(139 92 246 / 0.20)" },
  general: { name: "General", ink: "#3c4049", mark: "#8a8f99", glow: "rgb(99 104 115 / 0.16)" },
};

const RULES: [SubjectFamily, RegExp][] = [
  ["computing", /(computer|programm|coding|software|python|java|data struct|algorithm|\bcs\b|web dev)/i],
  ["math", /(math|calculus|algebra|geometry|statistic|trigon|probab|linear|equation)/i],
  ["science", /(physics|chemi|biolog|science|anatomy|ecology|astronom|geolog)/i],
  ["writing", /(writing|essay|english|literat|history|philosoph|language|grammar|econom|psycholog)/i],
];

export function subjectFamily(subject: string): SubjectFamily {
  return RULES.find(([, re]) => re.test(subject))?.[0] ?? "general";
}

export const accentFor = (subject: string) => SUBJECT_ACCENT[subjectFamily(subject)];
