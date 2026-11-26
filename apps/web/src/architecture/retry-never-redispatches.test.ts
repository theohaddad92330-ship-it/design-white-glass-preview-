import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1953.13 / #1953.20 — UN RÉESSAI NE RELANCE JAMAIS UNE ACTION EXTERNE DÉJÀ EXÉCUTÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE QUESTION QUI COMPTE : CE CHEMIN PEUT-IL ÉCRIRE ?
 * ─────────────────────────────────────────────────────────────────────────────
 * « Réessayer », « Répondre avec un autre angle » et « Modifier ma demande »
 * (`Chat.tsx` — `runBranch`, `reply-branch.ts`) ne font qu'une chose : rappeler
 * `askLauraStreaming`, le même chemin qu'un message tapé. Le copilote n'a
 * AUCUN chemin d'écriture depuis un tour de chat — pas une convention,
 * l'absence de code (CLAUDE.md, doctrine « le copilote n'envoie jamais »). La
 * seule porte d'écriture réelle est le CLIC de confirmation d'une carte
 * (`PendingActions.tsx` → `actionsApi.dispatch`, ou les clients CRM/mailbox
 * qu'elle appelle), un geste d'UTILISATEUR distinct, jamais rejoué par un
 * réessai.
 *
 * Cette garde vérifie l'invariant structurel qui rend ça vrai : le chemin du
 * réessai n'importe JAMAIS un de ces clients d'écriture. Si un jour quelqu'un y
 * ajoute « pour que le réessai confirme aussi la carte automatiquement »,
 * l'import apparaît ici et la garde rougit avant que le code parte en
 * production.
 *
 * ⚠️ CE QU'ELLE NE GARDE PAS : la gouvernance des cartes Action OS
 * (`copilotCardsApi`, #1998) est déjà tenue côté SERVEUR — `allowedGestures`
 * décide ce qui est cliquable, et `retry()` n'y est offert qu'après un ÉCHEC
 * (jamais après `unknown` — voir `packages/contracts/src/schemas/
 * dispatch-failure.ts:91`, `dispatchFailureOutcome`, et
 * `apps/web/src/features/actions/lib/gesture-idempotency.ts:47-55`, qui ne
 * relâche la clé d'un geste que sur une issue CONNUE). Cette garde-ci protège
 * la moitié qui ne l'était pas encore : le réessai d'une RÉPONSE.
 */

const WEB_SRC = join(__dirname, '..')

/**
 * Les clients qui SONT la porte d'écriture — nommés un par un (comme
 * `no-second-action-list.test.ts`) plutôt que par un préfixe : une dérivation
 * pure de l'un de ces dossiers pourrait un jour exister sans écrire.
 */
const DISPATCH_MODULES = [
  'features/actions/api',
  'features/attio/api',
  'features/crm/api',
  'features/pipedrive/api',
  'features/salesforce/api',
  'features/mailbox/api',
  'features/contacts/api',
  'features/routines/api',
  'features/notifications/api',
  'features/memory/api',
  'features/settings/lib/stage-sla-api',
  'features/chat/api/copilotCardsApi',
] as const

/** Les chemins bruts d'API qui ÉCRIVENT — `start_account_analysis` les appelle par `apiFetch` direct. */
const DISPATCH_PATHS = ['/analysis/start', '/actions/dispatch', '/action-os/'] as const

/** Le chemin réel du réessai — un fichier neuf, plus `Chat.tsx` qui orchestre l'envoi. */
const RETRY_SOURCES = ['features/chat/view/reply-branch.ts', 'features/chat/view/Chat.tsx'] as const

function readSource(relativePath: string): string {
  return readFileSync(join(WEB_SRC, relativePath), 'utf8')
}

/**
 * Les spécificateurs importés en VALEUR — un `import type` est effacé à la
 * compilation et ne peut rien exécuter (`Chat.tsx` importe `CopilotCardWire`
 * ainsi : un type, jamais le client).
 */
function valueImportSpecifiers(source: string): string[] {
  const out: string[] = []
  for (const line of source.split('\n')) {
    if (/^\s*import\s+type\b/.test(line)) continue
    for (const match of line.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"\n]+)['"]/g)) {
      if (match[1]) out.push(match[1])
    }
  }
  return out
}

function dispatchImportsIn(source: string): string[] {
  return valueImportSpecifiers(source).filter(specifier =>
    DISPATCH_MODULES.some(module => specifier.endsWith(module) || specifier.includes(`${module}.`)),
  )
}

function dispatchPathsIn(source: string): string[] {
  return DISPATCH_PATHS.filter(path => source.includes(`'${path}`) || source.includes(`"${path}`))
}

describe('#1953.13 / #1953.20 — un réessai ne rejoue jamais une écriture déjà partie', () => {
  it('LIT quelque chose — le chemin du réessai existe, n’est pas vide, et porte bien `runBranch`', () => {
    for (const file of RETRY_SOURCES) {
      const full = join(WEB_SRC, file)
      expect(existsSync(full)).toBe(true)
      expect(readFileSync(full, 'utf8').length).toBeGreaterThan(500)
    }
    // Sans cette assertion, un fichier renommé rendrait les deux tests suivants
    // verts pour toujours (« trois hooks inexistants surveillés »).
    expect(readSource('features/chat/view/Chat.tsx')).toContain('runBranch')
    expect(readSource('features/chat/view/reply-branch.ts')).toContain('applyPendingBranch')
  })

  it('aucun fichier du chemin de réessai n’importe une porte d’écriture', () => {
    const guilty = RETRY_SOURCES.map(file => {
      const source = readSource(file)
      return { file, modules: dispatchImportsIn(source), paths: dispatchPathsIn(source) }
    }).filter(entry => entry.modules.length > 0 || entry.paths.length > 0)
    expect(guilty).toEqual([])
  })

  it('sait dire NON — un réessai qui rejouerait un geste sortant est refusé', () => {
    expect(
      dispatchImportsIn(`import { actionsApi } from '@/features/actions/api'\nactionsApi.dispatch(intent)`),
    ).toEqual(['@/features/actions/api'])
    expect(dispatchImportsIn(`import { mailboxApi } from '@/features/mailbox/api'`)).toEqual(['@/features/mailbox/api'])
    expect(dispatchPathsIn(`await apiFetch({ path: '/analysis/start', method: 'POST' })`)).toEqual(['/analysis/start'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — rejouer une LECTURE reste permis', () => {
    // `askLauraStreaming` régénère le texte : aucun outil de proposition n'a de
    // chemin d'écriture, donc un réessai qui la rappelle est sûr.
    expect(dispatchImportsIn(`import { askLauraStreaming } from '@/features/chat/api/laura-turn'`)).toEqual([])
    // Un `import type` ne peut rien exécuter — la même ligne que `Chat.tsx`.
    expect(dispatchImportsIn(`import type { CopilotCardWire } from '../api/copilotCardsApi'`)).toEqual([])
    // Reformuler / recalculer localement : aucune porte d'écriture.
    expect(dispatchImportsIn(`import { computeDataOrigin } from './reply-branch'`)).toEqual([])
    expect(dispatchPathsIn(`await apiFetch({ path: '/ia/chat/messages' })`)).toEqual([])
  })
})
