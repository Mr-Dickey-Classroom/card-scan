// App data, version 2 (BUILD_BRIEF section 6). Students live once; classes list the ids enrolled.
// { students: {id: {name, card}}, classes: {id: {name, color, order, archived, studentIds}},
//   sets: {classId: {setId: {title, date, questions, answers, created, updated}}} }
export const LETTERS = ["A", "B", "C", "D"];

export const DEFAULT_CLASSES = [
  { id: "math7", name: "7th Math", color: "--c7", order: 1 },
  { id: "math8", name: "8th Math", color: "--c8", order: 2 },
  { id: "earth", name: "Earth Science", color: "--cearth", order: 3 },
  { id: "jhsci", name: "JH Science", color: "--cjh", order: 4 },
];

export const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyData() {
  const classes = {};
  for (const { id, ...c } of DEFAULT_CLASSES) classes[id] = { ...c, archived: false, studentIds: [] };
  return { students: {}, classes, sets: {} };
}

export function todayISO(d = new Date()) {
  const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}
