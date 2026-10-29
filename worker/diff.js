export const FIELD_LABELS = {
  title: "Titre",
  servings: "Personnes",
  time: "Durée (min)",
  category: "Type de plat",
  ingredients: "Ingrédients",
  steps: "Étapes",
  source: "Lien d'origine",
};
export const LIST_FIELDS = new Set(["ingredients", "steps"]);

// Diff ligne à ligne (plus longue sous-suite commune) : « - » supprimé, « + » ajouté, deux espaces = inchangé.
export function diffLines(before, after) {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i++]}`);
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  while (i < a.length) out.push(`- ${a[i++]}`);
  while (j < b.length) out.push(`+ ${b[j++]}`);
  return out.join("\n");
}
