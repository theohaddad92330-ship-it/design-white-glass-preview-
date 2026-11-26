/**
 * Écart figma-sync — le filtre de statut de `/missions` propose « les 14
 * statuts de la machine » (`filters.ts`, `statusCounts`, commentaire #2407.5).
 * En FR, `ended` et `completed` portaient tous les deux le libellé
 * « Terminée » (`missions.json:17` et `:25`) : deux entrées du même filtre,
 * indiscernables à l'écran. L'EN distinguait déjà « Ended » / « Completed » —
 * seule la FR avait divergé.
 *
 * Le correctif est un mot différent, pas une fusion de statuts : `ended` et
 * `completed` restent deux valeurs distinctes de la machine
 * (`FINISHED_MISSION_STATUSES`, `packages/contracts/src/schemas/account-missions.ts`)
 * — les toucher serait une décision produit, hors périmètre de ce lot.
 *
 * Cette garde lit les DEUX locales et vérifie qu'aucun des 14 statuts du
 * filtre ne partage son libellé avec un autre, dans aucune des deux langues.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES_DIR = join(__dirname, '../i18n/locales')

// Les 14 statuts que `filters.ts` (`statusCounts`) propose au filtre —
// `MissionStatus` de `@bellum/contracts`. Recopiés ici plutôt qu'importés :
// cette garde vise le CONTENU des locales, pas le typage.
const MISSION_STATUSES = [
  'onboarding',
  'active',
  'paused',
  'ended',
  'terminated',
  'renewed',
  'draft',
  'ready_to_start',
  'at_risk',
  'renewal_pending',
  'ending',
  'completed',
  'cancelled',
  'archived',
] as const

function readStatusLabels(locale: 'fr' | 'en'): Record<string, string> {
  const json = JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'missions.json'), 'utf8')) as {
    status: Record<string, string>
  }
  return json.status
}

function duplicateLabels(labels: Record<string, string>): string[][] {
  const byLabel = new Map<string, string[]>()
  for (const status of MISSION_STATUSES) {
    const label = labels[status]
    byLabel.set(label, [...(byLabel.get(label) ?? []), status])
  }
  return [...byLabel.values()].filter(statuses => statuses.length > 1)
}

describe('missions.json — les 14 statuts du filtre ont chacun un libellé DISTINCT', () => {
  it('LIT un corpus complet — les 14 statuts existent dans les deux locales', () => {
    for (const locale of ['fr', 'en'] as const) {
      const labels = readStatusLabels(locale)
      for (const status of MISSION_STATUSES) {
        expect(labels[status], `${locale}/missions.json → status.${status}`).toBeTruthy()
      }
    }
  })

  it.each(['fr', 'en'] as const)('%s : aucun doublon de libellé parmi les 14 statuts', locale => {
    const duplicates = duplicateLabels(readStatusLabels(locale))
    expect(duplicates, `doublons : ${JSON.stringify(duplicates)}`).toEqual([])
  })

  it('SAIT DIRE NON — deux statuts qui partagent un libellé sont détectés', () => {
    const labels: Record<string, string> = { ended: 'Terminée', completed: 'Terminée' }
    const duplicates = duplicateLabels({ ...Object.fromEntries(MISSION_STATUSES.map(s => [s, s])), ...labels })
    expect(duplicates).toEqual([['ended', 'completed']])
  })
})
