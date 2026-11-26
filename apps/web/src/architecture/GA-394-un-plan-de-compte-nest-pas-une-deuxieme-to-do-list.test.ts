import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-394 — #2317.2 : « Un plan de compte ne doit pas être un texte figé ni
 * une deuxième to-do list. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────
 * LAU-FINAL-058 (#2317, repris #2923) ouvre sur cette phrase avant même
 * l'objet canonique à 22 champs : le risque nommé n'est pas un CHAMP
 * manquant, c'est une SECONDE forme de tâche qui apparaîtrait un jour à côté
 * d'`action_plan_items` — écran du plan, écran Actions, ou ailleurs — avec
 * son propre triplet `label` / `done` / `due_date`, sans passer par l'objet
 * canonique (`action.ts`) qui les fusionne déjà tous
 * ({@link mergeCanonicalActions}, #2395.11).
 *
 * Vérification du 25/09/2026 (commentaire d'écrivain sur #2923) : aucune
 * garde nommée ne tenait cette promesse dans LE TEMPS — seul le code de
 * fusion existait, rien n'empêchait qu'un futur écran recrée le même triplet
 * à côté.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle lit chaque `z.object({ ... })` de `packages/contracts/src/schemas` et
 * cherche le triplet LITTÉRAL `label:` / `done:` / `due_date:` dans le MÊME
 * bloc — la forme exacte d'`actionPlanItemSchema`. Un second schéma qui la
 * reproduit est la « deuxième to-do list » que #2317.2 interdit : le plan
 * n'a qu'UNE forme de tâche persistée, et c'est celle-ci (GA-26).
 *
 * Elle ne vérifie PAS qu'un écran affiche les actions dans le bon ordre ni
 * qu'aucun composant ne garde un état local éphémère (`useState`) — un état
 * non persisté n'est pas une « deuxième to-do list », c'est un brouillon qui
 * ne survit pas au rechargement (voir `ActionPlanBoard.tsx`, `pendingActions`).
 *
 * Exception NOMMÉE, pas devinée : un bloc qui porte AUSSI `item_id` est une
 * PROJECTION en lecture d'une ligne `action_plan_items` déjà matérialisée
 * (le calendrier de cadence, `contact-cadence.ts` — « les étapes de suivi
 * sont matérialisées en `action_plan_items` datés, aucun cron dupliqué »),
 * pas une seconde forme écrite : elle POINTE la ligne canonique au lieu d'en
 * ouvrir une seconde.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const SCHEMAS_DIR = join(REPO_ROOT, 'packages/contracts/src/schemas')

/** La forme canonique, et SEULE, d'une tâche persistée du plan. */
const CANONICAL_FILE = 'action-plan-items.ts'

/** Le code sans ses commentaires — une forme CITÉE en exemple n'est pas une seconde forme réelle. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/** Chaque bloc `z.object({ ... })`, par comptage de parenthèses/accolades équilibré. */
export function blocsZodObject(code: string): string[] {
  const blocs: string[] = []
  const marqueur = 'z.object('
  let depart = code.indexOf(marqueur)
  while (depart !== -1) {
    const debutParenthese = depart + marqueur.length - 1
    let profondeur = 0
    let fin = -1
    for (let i = debutParenthese; i < code.length; i++) {
      if (code[i] === '(') profondeur++
      else if (code[i] === ')') {
        profondeur--
        if (profondeur === 0) {
          fin = i
          break
        }
      }
    }
    if (fin === -1) break
    blocs.push(code.slice(debutParenthese, fin + 1))
    depart = code.indexOf(marqueur, fin + 1)
  }
  return blocs
}

/**
 * Le bloc porte-t-il le triplet littéral d'une tâche persistée du plan,
 * SANS pointer une ligne `action_plan_items` déjà existante par `item_id` ?
 * Un bloc qui porte `item_id` est une projection en lecture, pas une seconde
 * écriture (voir l'exception documentée en tête de fichier).
 */
export function estUneFormeDeTacheDuPlan(bloc: string): boolean {
  return (
    /\blabel\s*:/.test(bloc) && /\bdone\s*:/.test(bloc) && /\bdue_date\s*:/.test(bloc) && !/\bitem_id\s*:/.test(bloc)
  )
}

function fichiersSchemas(): string[] {
  return readdirSync(SCHEMAS_DIR)
    .filter(nom => nom.endsWith('.ts') && !nom.endsWith('.test.ts'))
    .map(nom => join(SCHEMAS_DIR, nom))
}

describe('#2317.2 — un plan de compte n’est pas une deuxième to-do list (GA-394)', () => {
  it('la garde LIT quelque chose : le corpus des schémas n’est pas vide', () => {
    expect(fichiersSchemas().length).toBeGreaterThan(100)
  })

  it('sait dire NON — et n’attrape ni un sous-ensemble du triplet ni une forme citée en commentaire', () => {
    const complet = 'z.object({ label: z.string(), done: z.boolean(), due_date: z.string().nullable() })'
    expect(blocsZodObject(complet).some(estUneFormeDeTacheDuPlan)).toBe(true)

    // Deux des trois champs seulement : pas la forme visée (`tasks`, `title`/`dueOn`).
    const partiel = 'z.object({ label: z.string(), done: z.boolean() })'
    expect(blocsZodObject(partiel).some(estUneFormeDeTacheDuPlan)).toBe(false)

    // La MÊME forme, mais CITÉE dans un commentaire : pas une seconde forme réelle.
    const enCommentaire = `/*\n${complet}\n*/`
    expect(blocsZodObject(sansCommentaires(enCommentaire)).some(estUneFormeDeTacheDuPlan)).toBe(false)

    // Le triplet ET `item_id` : une PROJECTION de la ligne canonique (voir
    // `contact-cadence.ts`), pas une seconde forme écrite.
    const projection = 'z.object({ label: z.string(), done: z.boolean(), due_date: z.string(), item_id: z.string() })'
    expect(blocsZodObject(projection).some(estUneFormeDeTacheDuPlan)).toBe(false)
  })

  it('seul `action-plan-items.ts` porte le triplet `label`/`done`/`due_date` — aucune deuxième to-do list', () => {
    const fautifs: string[] = []
    for (const chemin of fichiersSchemas()) {
      const nom = chemin.split('/').pop() as string
      if (nom === CANONICAL_FILE) continue
      const code = sansCommentaires(readFileSync(chemin, 'utf8'))
      if (blocsZodObject(code).some(estUneFormeDeTacheDuPlan)) fautifs.push(nom)
    }
    expect(fautifs).toEqual([])
  })
})
