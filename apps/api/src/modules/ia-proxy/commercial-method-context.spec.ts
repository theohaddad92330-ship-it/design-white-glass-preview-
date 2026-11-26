import { chooseCommercialMethod, LAURA_COMMERCIAL_METHOD_LABELS_FR } from '@bellum/contracts'
import { NeedVerdictService } from '../projects/need-verdict.service'
import { commercialMethodContextFor } from './commercial-method-context'

// #3390.10/.11 — même entrée ⇒ même méthode côté écran et côté prompt : l'écran
// affiche `response.method` (NeedVerdictService.forNeed), ce rendu lit CETTE valeur.
describe('commercialMethodContextFor', () => {
  const method = chooseCommercialMethod({
    verdict: { verdict: 'go', blockingAxes: [], unmeasuredDecisiveAxes: [] },
    relationshipState: 'positive',
    accessState: 'positive',
    staffingState: 'positive',
    stale: true,
  })

  it('le texte porte les libellés de la méthode que l’écran affiche', () => {
    const text = commercialMethodContextFor({ method })
    expect(text).toContain(LAURA_COMMERCIAL_METHOD_LABELS_FR.effortLevel[method.effortLevel])
    expect(text).toContain(LAURA_COMMERCIAL_METHOD_LABELS_FR.nextStep[method.nextStep])
  })

  it('#3390.9b — la charge mesurée est nommée ; absente, aucune ligne', () => {
    const withLoad = commercialMethodContextFor({
      method,
      commercialContext: { weeklyAvailableHours: 10, overdueActions: 3, fiveP: null },
    })
    expect(withLoad).toContain('10 h par semaine')
    expect(withLoad).toContain('Ses actions en retard : 3')
    const none = commercialMethodContextFor({
      method,
      commercialContext: { weeklyAvailableHours: null, overdueActions: null, fiveP: null },
    })
    expect(none).not.toMatch(/h par semaine|en retard|saturation/)
  })

  it('une réponse sans méthode ⇒ null : Laura ne dit rien', () => {
    expect(commercialMethodContextFor({})).toBeNull()
  })
})

// #3390.10 (recette prod 04/10) — « Quelle approche pour ce compte ? » sur un compte cadré SANS
// besoin ouvert : le même moteur rend quand même la méthode, et le dit.
describe('méthode d’un compte sans besoin ouvert (#3390.10)', () => {
  function service(hours: number | null, overdue: number) {
    const query = jest.fn(async (sql: string) =>
      sql.includes('workspace_commercial_load_settings') ? [{ weekly_available_hours: hours }] : [{ overdue }],
    )
    const instance = Object.create(NeedVerdictService.prototype) as InstanceType<typeof NeedVerdictService>
    ;(instance as unknown as { needs: unknown }).needs = { manager: { query } }
    return instance
  }

  it('rend un bloc Méthode nommé, avec « aucun besoin ouvert » et relation/accès non mesurés', async () => {
    const response = await service(12, 4).methodWithoutOpenNeed('w-1', 'u-1')
    const text = commercialMethodContextFor(response, 'account') ?? ''
    expect(text).toContain('POUR CE COMPTE')
    expect(text).toContain('aucun besoin ouvert')
    expect(text).toContain(LAURA_COMMERCIAL_METHOD_LABELS_FR.effortLevel[response.method?.effortLevel as never])
    expect(text).toContain('12 h par semaine')
    expect(text).not.toContain('SON BESOIN OUVERT')
  })

  it('la méthode choisie est celle du moteur sur un verdict non évaluable, jamais un go inventé', async () => {
    const { method } = await service(null, 0).methodWithoutOpenNeed('w-1', null)
    expect(method).toEqual(
      chooseCommercialMethod({
        verdict: { verdict: 'insufficient_data', blockingAxes: [], unmeasuredDecisiveAxes: ['staffing_capacity'] },
        relationshipState: null,
        accessState: null,
        staffingState: null,
        stale: false,
      }),
    )
  })
})
