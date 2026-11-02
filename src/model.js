// App data, version 2 (BUILD_BRIEF section 6). Students live once; classes list the ids enrolled.
// { students: {id: {name, card}}, classes: {id: {name, color, order, archived, studentIds}},
//   sets: {classId: {setId: {title, date, questions, answers, created, updated}}},
//   settings: {cards: "app" (one number per student, the default) | "class" (numbers per class)} }
export const LETTERS = ["A", "B", "C", "D"];

export const DEFAULT_CLASSES = [
  { id: "math7", name: "7th Math", color: "--c7", order: 1 },
  { id: "math8", name: "8th Math", color: "--c8", order: 2 },
  { id: "earth", name: "Earth Science", color: "--cearth", order: 3 },
  { id: "jhsci", name: "JH Science", color: "--cjh", order: 4 },
];

// Colors for class dots, in the order new classes get them (tokens in styles.css).
export const CLASS_COLORS = ["--c7", "--c8", "--cearth", "--cjh", "--c5", "--c6", "--c9", "--c10"];

export const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyData() {
  const classes = {};
  for (const { id, ...c } of DEFAULT_CLASSES) classes[id] = { ...c, archived: false, studentIds: [] };
  return { students: {}, classes, sets: {}, settings: {} };
}

export function todayISO(d = new Date()) {
  const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

// Adds a class (any number are allowed). Returns its id, or throws with a message for the teacher.
// It gets the color used by the fewest classes, and goes at the end of the class row.
export function addClass(data, name) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!n) throw new Error("Type a name for the class.");
  const all = Object.values(data.classes);
  if (all.some(c => c.name.trim().toLowerCase() === n.toLowerCase())) throw new Error(`You already have a class called ${n}.`);
  const used = c => all.filter(x => x.color === c).length;
  const color = CLASS_COLORS.reduce((a, c) => used(c) < used(a) ? c : a);
  let id; do id = uid(); while (data.classes[id]);
  data.classes[id] = { name: n, color, order: Math.max(0, ...all.map(c => c.order || 0)) + 1, archived: false, studentIds: [] };
  return id;
}
