import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { needStatusRequiresReason, type NeedStoredStatus } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  NEED_BULK_ACTIONS,
  NEED_BULK_ACTIONS_REFUSED,
  NEED_BULK_CONCURRENCY,
  needActionAvailable,
  needActionNeedsReason,
  needActionTargetStatus,
  needsEligibleFor,
  runNeedBulk,
  summariseNeedBulk,
} from './need-actions'

const FEATURE = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(name)) continue
    if (/\.(test|spec)\.tsx?$/.test(name)) continue
    out.push(full)
  }
  return out
}

/**
 * L'EXPORT DE MASSE — RENVERSEMENT DATÉ DE c43 (DÉCISION LOUIS 11/10/2026, #4016 L11).
 *
 * Avant : « aucune action de masse ne sort de l'entreprise ». Désormais la
 * sélection sort en FICHIER (CSV/JSON), par UNE route gouvernée par la règle
 * d'espace (`POST /projects/needs/export`, `@DataExit()` côté API — garde
 * `data-exit-routes.spec.ts`). Ce qui reste refusé : une POUSSÉE de masse vers
 * un CRM (`export-crm`) depuis cet écran, et toute autre route de sortie.
 *
 * ⚠️ Cette garde LIT quelque chose : elle relit tous les fichiers de l'écran
 * « Besoins ouverts ». Le test de corpus non vide est là pour ça.
 *
 * Et elle SAIT DIRE NON : coller un `export-crm` ou une autre route d'export
 * dans un composant de ce dossier, ou ajouter un geste « export » au catalogue
 * qui ÉCRIT besoin par besoin, la fait échouer.
 */

/** Les chemins d'export qu'un fichier de l'écran appelle — `path: '…export…'` ou la constante. */
function exitPathsIn(source: string): string[] {
  return [...source.matchAll(/(?:path:\s*|=\s*)[`'"](\/[^`'"\n]*export[^`'"\n]*)[`'"]/gi)].map(match => match[1] ?? '')
}

const GOVERNED_EXIT = '/projects/needs/export'

describe('les actions de masse sur les besoins — ce qui sort passe par la règle d’espace', () => {
  const files = sourceFiles(FEATURE)

  it('lit un corpus non vide — sinon elle ne garde rien', () => {
    expect(files.length).toBeGreaterThan(8)
    // Et le corpus contient bien l'écran qu'elle prétend surveiller.
    expect(files.some(file => file.endsWith('OpenNeedsTable.tsx'))).toBe(true)
    expect(files.some(file => file.endsWith('NeedsSelectionBar.tsx'))).toBe(true)
  })

  it('l’export n’est PAS un geste du catalogue qui écrit besoin par besoin', () => {
    expect(NEED_BULK_ACTIONS as readonly string[]).not.toContain('export')
    for (const action of NEED_BULK_ACTIONS) {
      expect(action).not.toMatch(/export/i)
    }
  })

  it('nomme ce qui reste refusé, avec sa raison et le renversement daté', () => {
    expect(Object.keys(NEED_BULK_ACTIONS_REFUSED)).toEqual(['crm_push'])
    expect(NEED_BULK_ACTIONS_REFUSED['crm_push']).toMatch(/POUSSÉE de masse/)
    expect(NEED_BULK_ACTIONS_REFUSED['crm_push']).toMatch(/11\/10\/2026/)
  })

  it('la SEULE route de sortie de l’écran est la route gouvernée — jamais `export-crm`', () => {
    const exits = files.flatMap(file => exitPathsIn(readFileSync(file, 'utf8')))
    // Elle LIT : la route gouvernée est bien appelée quelque part.
    expect(exits).toContain(GOVERNED_EXIT)
    expect(exits.filter(path => path !== GOVERNED_EXIT)).toEqual([])
  })

  it('sait dire NON — une poussée CRM ou une autre route d’export dans un composant', () => {
    expect(exitPathsIn("apiFetch({ path: `/projects/${id}/export-crm`, method: 'POST' })")).toEqual([
      '/projects/${id}/export-crm',
    ])
    expect(exitPathsIn("apiFetch({ path: '/projects/needs/export-all' })")).toEqual(['/projects/needs/export-all'])
    // …et n'attrape pas ce qu'elle ne vise pas.
    expect(exitPathsIn("apiFetch({ path: '/projects/needs/n-1/status' })")).toEqual([])
  })

  it('les dix gestes livrés sont exactement ceux dont la route existe', () => {
    // L'ordre fait partie du contrat : « à qui » d'abord, « ça presse »
    // ensuite, « quoi faire » (#2173.48), « on fait avancer », puis « on
    // arrête / on reprend », clore, et ranger en TOUT dernier (#2173.49) — le
    // geste le plus passif du catalogue.
    expect([...NEED_BULK_ACTIONS]).toEqual([
      'assign_owner',
      'set_urgency',
      'create_actions',
      'match',
      'hold',
      'reactivate',
      'close_lost',
      'close_cancelled',
      'archive',
      'unarchive',
    ])
  })

  /**
   * PERDU ET ANNULÉ NE FUSIONNENT PAS.
   *
   * Un besoin annulé chez nous n'est pas un besoin perdu chez le client. Les
   * confondre sous un « fermer » unique fausserait le taux de perte, qui est
   * l'un des rares chiffres qu'une ESN regarde vraiment.
   */
  it('garde « perdu » et « annulé » comme DEUX gestes, vers DEUX états', () => {
    expect(needActionTargetStatus('close_lost')).toBe('lost')
    expect(needActionTargetStatus('close_cancelled')).toBe('cancelled')
    expect(needActionTargetStatus('close_lost')).not.toBe(needActionTargetStatus('close_cancelled'))
    // Et aucun geste ne s'appelle « fermer » tout court.
    expect(NEED_BULK_ACTIONS as readonly string[]).not.toContain('close')
  })

  it('mène la veille et la reprise vers les états que la porte d’état connaît', () => {
    expect(needActionTargetStatus('hold')).toBe('on_hold')
    expect(needActionTargetStatus('reactivate')).toBe('to_reactivate')
  })
})

/**
 * LE MOTIF EST DEMANDÉ AVANT D'AGIR — et la liste ne se recopie pas.
 *
 * `needActionNeedsReason` DÉRIVE du contrat (`needStatusRequiresReason`) au lieu
 * de redire lui-même quels états réclament un motif. Deux listes qui disent la
 * même chose divergent : le jour où le serveur en exige un de plus, un écran qui
 * porte sa propre copie enverrait un 400 sans avoir posé la question.
 */
describe('le motif, et qui l’exige', () => {
  it('l’exige sur la veille et sur les DEUX clôtures, jamais sur la reprise', () => {
    expect(needActionNeedsReason('hold')).toBe(true)
    expect(needActionNeedsReason('close_lost')).toBe(true)
    expect(needActionNeedsReason('close_cancelled')).toBe(true)
    // Réactiver EFFACE le motif côté serveur : le demander afficherait la
    // raison d'un arrêt à côté d'un besoin qu'on remet en marche.
    expect(needActionNeedsReason('reactivate')).toBe(false)
    expect(needActionNeedsReason('match')).toBe(false)
    expect(needActionNeedsReason('assign_owner')).toBe(false)
    expect(needActionNeedsReason('set_urgency')).toBe(false)
    // #2173.48 — un libellé n'est pas un motif : la question posée est « quoi
    // faire », jamais « pourquoi ».
    expect(needActionNeedsReason('create_actions')).toBe(false)
    // #2173.49 — archiver ne demande RIEN : c'est un rangement neutre, pas
    // une décision qui se justifie.
    expect(needActionNeedsReason('archive')).toBe(false)
    expect(needActionNeedsReason('unarchive')).toBe(false)
  })

  /**
   * ⚠️ Cette garde tient le type `NeedReasonAction`, écrit à la main parce
   * qu'un type ne peut pas se déduire d'une fonction qui s'évalue à
   * l'exécution. Elle filtre le catalogue AVEC la fonction dérivée du contrat :
   * le jour où le contrat exige un motif de plus, elle tombe, et le type est
   * corrigé au lieu de mentir en silence.
   */
  it('filtre le catalogue exactement sur les trois gestes que le type nomme', () => {
    expect(NEED_BULK_ACTIONS.filter(action => needActionNeedsReason(action))).toEqual([
      'hold',
      'close_lost',
      'close_cancelled',
    ])
  })

  it('dit exactement ce que le contrat dit de l’état visé', () => {
    const statusActions = ['hold', 'reactivate', 'close_lost', 'close_cancelled'] as const
    for (const action of statusActions) {
      expect(needActionNeedsReason(action)).toBe(needStatusRequiresReason(needActionTargetStatus(action)))
    }
  })
})

/**
 * CE QUE LA SÉLECTION PEUT RÉELLEMENT PRENDRE.
 *
 * Compter AVANT d'agir est ce qui permet de dire « 7 sur 12 » plutôt que de
 * lancer douze appels dont cinq reviendront en 400. La réponse vient de
 * `canTransitionNeedStatus`, la MÊME fonction que le serveur consulte : la
 * recopier ferait diverger l'écran de la règle en trois semaines.
 */
describe('l’éligibilité d’un geste', () => {
  const need = (status: NeedStoredStatus, skills: number, archivedAt: string | null = null) => ({
    id: `n-${status}-${skills}`,
    status,
    skills: Array.from({ length: skills }, (_, index) => ({ term: `skill-${index}`, required: true, level: null })),
    archived_at: archivedAt,
  })

  it('refuse le rapprochement sans compétence typée — le moteur rendrait une liste vide', () => {
    expect(needActionAvailable(need('to_match', 0), 'match')).toBe(false)
    expect(needActionAvailable(need('to_match', 2), 'match')).toBe(true)
  })

  it('refuse de clore ce qui est déjà clos, et laisse le rouvrir', () => {
    expect(needActionAvailable(need('lost', 1), 'close_lost')).toBe(false)
    expect(needActionAvailable(need('lost', 1), 'close_cancelled')).toBe(false)
    expect(needActionAvailable(need('lost', 1), 'reactivate')).toBe(true)
    expect(needActionAvailable(need('qualified', 1), 'close_lost')).toBe(true)
    expect(needActionAvailable(need('qualified', 1), 'close_cancelled')).toBe(true)
  })

  it('laisse attribuer et prioriser même un besoin clos — ce sont des champs, pas des étapes', () => {
    expect(needActionAvailable(need('lost', 0), 'assign_owner')).toBe(true)
    expect(needActionAvailable(need('lost', 0), 'set_urgency')).toBe(true)
  })

  it('laisse créer une action même sur un besoin clos — préparer un suivi reste légitime', () => {
    expect(needActionAvailable(need('lost', 0), 'create_actions')).toBe(true)
    expect(needActionAvailable(need('to_qualify', 0), 'create_actions')).toBe(true)
  })

  /**
   * #2173.49 — ARCHIVER NE DÉPEND QUE DU RANGEMENT, JAMAIS DU STATUT.
   *
   * C'est exactement ce qu'une implémentation pressée casserait : faire
   * dépendre l'éligibilité du statut referait de l'archivage un sous-produit
   * du statut, alors que la décision de Louis dit l'inverse — un besoin
   * `won`, `lost` ou `to_qualify` s'archive de la MÊME façon.
   */
  it('archiver et désarchiver ne dépendent QUE du rangement, jamais du statut', () => {
    expect(needActionAvailable(need('won', 0), 'archive')).toBe(true)
    expect(needActionAvailable(need('lost', 0), 'archive')).toBe(true)
    expect(needActionAvailable(need('to_qualify', 0), 'archive')).toBe(true)
    expect(needActionAvailable(need('won', 0), 'unarchive')).toBe(false)

    const archived = need('lost', 0, '2026-09-17T09:00:00.000Z')
    expect(needActionAvailable(archived, 'archive')).toBe(false)
    expect(needActionAvailable(archived, 'unarchive')).toBe(true)
  })

  it('ne garde de la sélection que les lignes que le geste peut toucher', () => {
    const rows = [need('qualified', 2), need('lost', 2), need('cancelled', 0)]
    expect(needsEligibleFor(rows, 'close_lost').map(row => row.status)).toEqual(['qualified'])
    // `to_reactivate` reste ouvert depuis n'importe quel état — c'est le
    // contrat, pas une tolérance de l'écran : un besoin qu'on remet dans la
    // pile est un geste légitime même s'il n'était pas clos.
    expect(needsEligibleFor(rows, 'reactivate').map(row => row.status)).toEqual(['qualified', 'lost', 'cancelled'])
    expect(needsEligibleFor(rows, 'match').map(row => row.status)).toEqual(['qualified', 'lost'])
    expect(needsEligibleFor(rows, 'assign_owner')).toHaveLength(3)
  })
})

/**
 * Le lot est BORNÉ et TOLÉRANT.
 *
 * Un `Promise.all` s'effondre au premier rejet : un seul besoin déjà en veille
 * emporterait les quarante-neuf autres, et l'écran dirait « ça n'a pas marché »
 * alors que rien n'a été tenté. C'est un défaut déjà payé par ce dépôt (le
 * fan-out fournisseur d'une routine du matin).
 */
describe('runNeedBulk', () => {
  it('rattrape chaque échec et va au bout du lot', async () => {
    const seen: string[] = []
    const outcomes = await runNeedBulk(['a', 'b', 'c'], async needId => {
      seen.push(needId)
      if (needId === 'b') throw new Error('Ce besoin est déjà dans cet état.')
    })

    expect(seen.sort()).toEqual(['a', 'b', 'c'])
    expect(summariseNeedBulk(outcomes)).toEqual({ done: 2, failed: 1 })
    // La raison du serveur voyage : « déjà dans cet état » se corrige,
    // « une erreur est survenue » ne dit rien à personne.
    expect(outcomes[1]).toEqual({ needId: 'b', status: 'failed', reason: 'Ce besoin est déjà dans cet état.' })
  })

  it('rend les issues dans l’ordre de la sélection, pas dans l’ordre d’achèvement', async () => {
    const outcomes = await runNeedBulk(
      ['lent', 'rapide'],
      async needId => {
        if (needId === 'lent') await new Promise(resolve => setTimeout(resolve, 10))
      },
      { concurrency: 2 },
    )
    expect(outcomes.map(outcome => outcome.needId)).toEqual(['lent', 'rapide'])
  })

  it('ne lance jamais plus de quatre appels à la fois', async () => {
    let running = 0
    let peak = 0
    const ids = Array.from({ length: 20 }, (_, index) => `n-${index}`)

    await runNeedBulk(ids, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise(resolve => setTimeout(resolve, 1))
      running -= 1
    })

    expect(peak).toBeLessThanOrEqual(NEED_BULK_CONCURRENCY)
    expect(peak).toBeGreaterThan(1)
  })

  it('ne fait rien sur une sélection vide', async () => {
    const apply = async () => {
      throw new Error('ne devrait pas être appelé')
    }
    await expect(runNeedBulk([], apply)).resolves.toEqual([])
  })
})
