import { describe, expect, it } from 'vitest'
import { lauraPageContextSchema } from '@bellum/contracts'
import { pilotageLauraContext } from './pilotage-laura-context'

/**
 * #2206.45-.48 — CE QUE /PILOTAGE DIT À LAURA.
 *
 * Le contexte doit porter les quatre axes de `askLauraQuestion` : pourquoi
 * (`purpose`), quels dossiers et quelle décision (les facets de décision),
 * comment agir (`actions` / `recommendedAction`).
 */
const t = ((key: string) => key) as unknown as Parameters<typeof pilotageLauraContext>[0]

const READY = {
  isLoading: false,
  coverage: { measured: 6, total: 8 } as { measured: number; total: number } | null,
  unmeasuredLevelLabels: [] as readonly string[],
  topDecisions: [] as readonly { kindLabel: string; detail: string }[],
  canAssign: false,
}

describe('pilotageLauraContext', () => {
  it('déclare le POURQUOI et la couverture, même sans décision ouverte', () => {
    const context = pilotageLauraContext(t, READY)
    expect(context.purpose).toBe('laura.purpose')
    expect(context.facets).toEqual([{ label: 'coverageOf', value: '6/8' }])
    expect(context.actions).toBeUndefined()
    expect(context.recommendedAction).toBeUndefined()
  })

  it('nomme QUELS DOSSIERS et QUELLE DÉCISION — jusqu’à trois, dans l’ordre reçu', () => {
    const context = pilotageLauraContext(t, {
      ...READY,
      topDecisions: [
        { kindLabel: 'Compte suivi que personne n’a touché', detail: 'ACME : aucune suite depuis 34 jours.' },
        { kindLabel: 'Encaissement en retard', detail: 'Facture #204 : 40 jours de retard.' },
        { kindLabel: 'Besoin sans shortlist', detail: 'Ingénieur data : 6 jours sans profil positionné.' },
        { kindLabel: 'Relevé manquant', detail: 'Ne doit pas apparaître — coupé à trois.' },
      ],
    })
    expect(context.facets).toEqual([
      { label: 'coverageOf', value: '6/8' },
      { label: 'Compte suivi que personne n’a touché', value: 'ACME : aucune suite depuis 34 jours.' },
      { label: 'Encaissement en retard', value: 'Facture #204 : 40 jours de retard.' },
      { label: 'Besoin sans shortlist', value: 'Ingénieur data : 6 jours sans profil positionné.' },
    ])
  })

  it('coupe un détail plus long que la borne du facet plutôt que de le taire', () => {
    const long = 'x'.repeat(200)
    const context = pilotageLauraContext(t, { ...READY, topDecisions: [{ kindLabel: 'K', detail: long }] })
    expect(context.facets[1].value.length).toBeLessThanOrEqual(160)
    expect(lauraPageContextSchema.safeParse(context).success).toBe(true)
  })

  it('dit COMMENT AGIR seulement quand il y a une décision ouverte', () => {
    const withDecision = pilotageLauraContext(t, {
      ...READY,
      topDecisions: [{ kindLabel: 'K', detail: 'D' }],
    })
    expect(withDecision.actions).toEqual(['laura.actionOpen'])
    expect(withDecision.recommendedAction).toBe('laura.actionOpen')
  })

  it('#2206.53 — n’ajoute « attribuer » que pour qui porte team:manage', () => {
    const manager = pilotageLauraContext(t, {
      ...READY,
      topDecisions: [{ kindLabel: 'K', detail: 'D' }],
      canAssign: true,
    })
    expect(manager.actions).toEqual(['laura.actionOpen', 'laura.actionAssign'])

    const member = pilotageLauraContext(t, {
      ...READY,
      topDecisions: [{ kindLabel: 'K', detail: 'D' }],
      canAssign: false,
    })
    expect(member.actions).toEqual(['laura.actionOpen'])
  })

  it('nomme les maillons NON MESURÉS — non mesuré n’est pas zéro', () => {
    const context = pilotageLauraContext(t, { ...READY, unmeasuredLevelLabels: ['Sourcing', 'Capitalisation'] })
    expect(context.missing).toEqual(['Sourcing', 'Capitalisation'])
  })

  it('sans maillon non mesuré, ne déclare AUCUN manque — pas une liste vide qui ment', () => {
    const context = pilotageLauraContext(t, READY)
    expect(context.missing).toBeUndefined()
  })

  it('se déclare en chargement, et reste un contexte valide', () => {
    expect(pilotageLauraContext(t, { ...READY, isLoading: true }).state).toBe('loading')
    expect(lauraPageContextSchema.safeParse(pilotageLauraContext(t, READY)).success).toBe(true)
  })

  it('sans couverture lue (chaîne pas encore chargée), ne déclare aucun facet de couverture', () => {
    const context = pilotageLauraContext(t, { ...READY, coverage: null })
    expect(context.facets).toEqual([])
  })
})
