import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1901.14 — UNE SEULE LISTE D'ACTIONS, ET ELLE VIT SUR `/actions`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE, ET POURQUOI ELLE EST NEUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le critère était marqué LIVRÉ sur `one-laura-not-six.test.ts`. Vérification du
 * 13/09/2026 : ce fichier ne parle pas de listes d'actions (il garde que
 * `<AskLaura>` est un composant unique qui ne poste jamais aveuglément), et son
 * voisin `laura-surfaces-are-not-second-assistants.test.ts` garde autre chose
 * encore — une seule route d'API depuis `features/laura`, et aucun verbe
 * d'ENVOI dans les chemins appelés. Son corpus s'arrête d'ailleurs à
 * `features/laura` : ni `features/chat`, ni `features/launcher`.
 *
 * Personne ne gardait donc le critère. C'est le constat FAUX le plus cher du
 * dépôt — un « déjà là » n'est jamais revisité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA RÈGLE DIT, ET LA LIGNE QU'ELLE TRACE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une surface de Laura — la bulle, le fil de `/chat`, le lanceur de la saisie —
 * montre des CARTES d'action préparée SOUS une réponse : ce que Laura vient de
 * proposer, dans le contexte où elle l'a proposé. Elle ne montre pas la LISTE de
 * tout ce qu'il y a à faire : cette liste-là est un écran, avec son tri, ses
 * filtres, son historique et sa traçabilité, et elle vit sur `/actions`.
 *
 * Deux listes de la même chose divergent le jour où l'une gagne un filtre, et
 * on se met alors à chercher « où est la vraie ». C'est la loi 4 du tome 7
 * (« rien n'apparaît deux fois sous la même forme avec le même contenu »)
 * appliquée à l'objet qui compte le plus dans le produit.
 *
 * ⚠️ CE QU'ELLE N'INTERDIT PAS, et c'est la moitié qui la rend tenable : la
 * couche d'ACTION (`features/actions/api`, `.../lib/*`) reste ouverte. C'est
 * elle que `PendingActions` appelle pour exécuter une carte — une carte sans
 * exécution ne serait qu'une image. La ligne n'est pas « le mot action », elle
 * est « l'ÉCRAN de liste ».
 */

const WEB_SRC = join(__dirname, '..')

/** Les surfaces où Laura parle : la bulle, le fil, le lanceur de la saisie. */
const LAURA_SURFACES = ['features/laura', 'features/chat', 'features/launcher'] as const

/**
 * Les modules qui SONT l'écran de liste des actions, par leur chemin d'import.
 *
 * Nommés un par un plutôt que par un préfixe de dossier : `action-history`
 * contient aussi des dérivations pures (`actionHistoryStatus`,
 * `actionHistoryQuery`) qu'une surface pourrait légitimement lire un jour pour
 * NOMMER un statut, sans pour autant peindre la liste.
 */
const ACTION_LIST_MODULES = [
  'features/action-history/view/ActionHistoryPage',
  'features/action-history/view/ActionHistoryTable',
  'features/action-history/view/ActionHistoryTableCells',
  'features/action-history/view/ActionHistoryRow',
  'features/action-history/view/ActionHistoryToolbar',
] as const

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

/** Les chemins de module importés par un fichier — `import` comme `import()`. */
function importedModules(source: string): string[] {
  const out: string[] = []
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"\n]+)['"]/g)) {
    const specifier = match[1]
    if (specifier) out.push(specifier)
  }
  return out
}

function importsAnActionList(source: string): string[] {
  return importedModules(source).filter(specifier =>
    ACTION_LIST_MODULES.some(module => specifier.endsWith(module) || specifier.includes(`${module}.`)),
  )
}

describe('#1901.14 — aucune surface de Laura ne rend une DEUXIÈME liste d’actions', () => {
  const surfaces = LAURA_SURFACES.flatMap(dir => sourceFiles(join(WEB_SRC, dir)))

  it('LIT quelque chose — les trois surfaces existent et portent des fichiers', () => {
    for (const dir of LAURA_SURFACES) expect(existsSync(join(WEB_SRC, dir))).toBe(true)
    expect(surfaces.length).toBeGreaterThan(30)
    // …et le corpus contient bien la surface qui porte les CARTES d'action.
    expect(surfaces.some(file => file.endsWith('PendingActions.tsx'))).toBe(true)
  })

  it('les modules surveillés existent sur le disque — on ne garde pas des fantômes', () => {
    // Trois hooks inexistants ont déjà été « surveillés » par une garde de ce
    // dépôt : un module renommé rend la règle verte pour toujours.
    for (const module of ACTION_LIST_MODULES) {
      expect(existsSync(join(WEB_SRC, `${module}.tsx`)) || existsSync(join(WEB_SRC, `${module}.ts`))).toBe(true)
    }
  })

  it('aucune n’importe l’écran de liste des actions', () => {
    const guilty = surfaces
      .map(file => ({ file, found: importsAnActionList(readFileSync(file, 'utf8')) }))
      .filter(entry => entry.found.length > 0)
    expect(guilty.map(entry => `${entry.file} — ${entry.found.join(', ')}`)).toEqual([])
  })

  it('sait dire NON — une surface qui monterait la liste est refusée', () => {
    expect(
      importsAnActionList(`import { ActionHistoryTable } from '@/features/action-history/view/ActionHistoryTable'`),
    ).toEqual(['@/features/action-history/view/ActionHistoryTable'])
    expect(
      importsAnActionList(`const Page = lazy(() => import('@/features/action-history/view/ActionHistoryPage'))`),
    ).toHaveLength(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas — la couche d’ACTION reste ouverte', () => {
    // Ce que `PendingActions` importe réellement pour exécuter une carte.
    expect(importsAnActionList(`import { actionsApi } from '@/features/actions/api'`)).toEqual([])
    expect(
      importsAnActionList(`import { gestureIdempotency } from '@/features/actions/lib/gesture-idempotency'`),
    ).toEqual([])
    // Une dérivation pure d'`action-history` NOMME un statut, elle ne peint rien.
    expect(
      importsAnActionList(`import { statusOf } from '@/features/action-history/view/actionHistoryStatus'`),
    ).toEqual([])
  })
})
