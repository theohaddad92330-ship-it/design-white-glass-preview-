/**
 * #2630.2 — CE QUI EST DÉJÀ TROUVÉ, gardé sur la course en cours.
 *
 * Le contrat partagé décide de la FORME d'un partiel ; ce fichier tient ce que
 * l'état local en fait : il les garde dans l'ordre d'arrivée, il n'en garde
 * qu'un par phase (une phase rejouée à la reprise ne double pas la ligne), et il
 * les OUBLIE quand la course se termine — le dossier remplace alors l'aperçu.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { AnalysisPartial } from '@bellum/contracts'
import { useAnalysisStore } from './analysisStore'

const CONTACTS: AnalysisPartial = {
  phase: 'contacts_complete',
  at: 1_758_000_000_000,
  findings: [{ kind: 'contacts', count: 4, samples: ['Claire Roggeman', 'Marc Oberlé'] }],
}
const ANGLES: AnalysisPartial = {
  phase: 'research_complete',
  at: 1_758_000_001_000,
  findings: [{ kind: 'angles', count: 2, samples: ['Migration du SI de production'] }],
}

function runOf(accountId: string) {
  return useAnalysisStore.getState().runs[accountId]
}

describe('#2630.2 — les partiels d’une analyse en cours', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    useAnalysisStore.getState().start('acc-1', 'job-1', 'Roggeman Structures')
  })

  it('une course neuve n’en a aucun — on n’affiche pas ce qu’on n’a pas encore', () => {
    expect(runOf('acc-1').partials).toEqual([])
  })

  it('les garde dans l’ordre d’arrivée', () => {
    useAnalysisStore.getState().addPartial('acc-1', ANGLES)
    useAnalysisStore.getState().addPartial('acc-1', CONTACTS)
    expect(runOf('acc-1').partials.map(partial => partial.phase)).toEqual(['research_complete', 'contacts_complete'])
  })

  it('n’en garde qu’UN par phase — une phase rejouée remplace, elle ne double pas', () => {
    useAnalysisStore.getState().addPartial('acc-1', CONTACTS)
    const replayed: AnalysisPartial = {
      ...CONTACTS,
      at: CONTACTS.at + 5_000,
      findings: [{ kind: 'contacts', count: 6, samples: ['Claire Roggeman'] }],
    }
    useAnalysisStore.getState().addPartial('acc-1', replayed)

    expect(runOf('acc-1').partials).toHaveLength(1)
    expect(runOf('acc-1').partials[0].findings[0].count).toBe(6)
  })

  it('ignore un partiel pour une course inconnue — rien ne se crée par effet de bord', () => {
    useAnalysisStore.getState().addPartial('acc-inconnu', CONTACTS)
    expect(useAnalysisStore.getState().runs['acc-inconnu']).toBeUndefined()
  })

  it('les OUBLIE à la fin : le dossier remplace l’aperçu, il ne s’y ajoute pas', () => {
    useAnalysisStore.getState().addPartial('acc-1', CONTACTS)
    useAnalysisStore.getState().setComplete('acc-1')
    expect(runOf('acc-1').partials).toEqual([])
  })
})
