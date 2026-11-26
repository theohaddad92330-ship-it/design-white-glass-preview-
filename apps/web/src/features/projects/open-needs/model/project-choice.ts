/**
 * #2575 — comment un projet se NOMME dans le sélecteur du formulaire mission.
 *
 * Recette prod du 07/10/2026 : le libellé du projet de rattachement était une
 * description sectorielle de ~400 caractères, tronquée au milieu d'un mot.
 * Le projet n'a pas de champ « nom » distinct de `label` : on tient donc le
 * titre court (compte + début du libellé, coupé à un mot) en premier, et la
 * description COMPLÈTE en secondaire — jamais inventée, jamais perdue.
 *
 * R3b-5 (08/10/2026) — le nom du compte peut lui-même être une LISTE de comptes
 * (108-156 car. mesurés en prod) : il est borné aussi, et un libellé qui
 * recopie le compte en tête ne le redit pas.
 */
const TITLE_MAX = 60
const ACCOUNT_MAX = 40

interface ProjectChoice {
  /** Court : « Compte — début du libellé… ». */
  title: string
  /** Le libellé complet, seulement s'il a dû être coupé. */
  description: string | null
}

function shorten(label: string, max: number): { text: string; cut: boolean } {
  const clean = label.trim()
  if (clean.length <= max) return { text: clean, cut: false }
  const head = clean.slice(0, max)
  const lastSpace = head.lastIndexOf(' ')
  const atWord = lastSpace > max / 2 ? head.slice(0, lastSpace) : head
  return { text: `${atWord.replace(/[\s,;:.\-–—]+$/, '')}…`, cut: true }
}

export function projectChoice(project: { company_name: string | null; label: string }): ProjectChoice {
  const company = project.company_name?.trim() ?? ''
  const label = project.label.trim()
  const account = shorten(company, ACCOUNT_MAX)
  const rest = company && label.startsWith(company) ? label.slice(company.length).replace(/^[\s,;:\-–—]+/, '') : label
  const { text, cut } = shorten(rest || label, TITLE_MAX)
  return {
    title: account.text ? `${account.text} — ${text}` : text,
    description: cut || account.cut ? label : null,
  }
}
