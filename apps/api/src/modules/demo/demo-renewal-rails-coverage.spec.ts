import { canConfirmRenewal, type RenewalClientRail, type RenewalConsultantRail } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DU DUAL TRACK (#2413.49 à .57, .67 — épopée #2965, craft rule
 * n°9).
 *
 * Même raison que `demo-renewal-statuses-coverage.spec.ts` juste à côté :
 * `demo-coverage.spec.ts` garde les TABLES, et `missions` y est déjà classée.
 * La nouveauté de ce lot n'est pas une table, ce sont DEUX colonnes
 * (`renewal_client_rail`, `renewal_consultant_rail`) — une garde qui ne
 * regarde que les tables passerait au vert sur une salle où les deux rails
 * sont vides sur toutes les lignes, et l'écran de décision n'y montrerait
 * jamais qu'une réponse ferme.
 */

type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

function missions(): DemoMission[] {
  return DEMO_DELIVERY_CLIENT.missions
}

function clientRailOf(mission: DemoMission): RenewalClientRail | null {
  return (mission as { renewal_client_rail?: RenewalClientRail | null }).renewal_client_rail ?? null
}

function consultantRailOf(mission: DemoMission): RenewalConsultantRail | null {
  return (mission as { renewal_consultant_rail?: RenewalConsultantRail | null }).renewal_consultant_rail ?? null
}

describe('parité démo — les deux rails de renouvellement', () => {
  it('la garde LIT quelque chose — la salle porte des missions', () => {
    expect(missions().length).toBeGreaterThan(3)
  })

  it('au moins une mission porte un rail CLIENT à « oui » et une un rail CONSULTANT à « oui »', () => {
    expect(missions().some(mission => clientRailOf(mission)?.intent === 'oui')).toBe(true)
    expect(missions().some(mission => consultantRailOf(mission)?.intent === 'oui')).toBe(true)
  })

  it('#2413.57/.67 — la mission « renouvelée » de la salle satisfait le garde-fou, sinon l’état serait NO-GO', () => {
    const renouvelee = missions().find(
      mission => (mission as { renewal_status?: string | null }).renewal_status === 'renouvele',
    )
    expect(renouvelee).toBeDefined()
    expect(
      canConfirmRenewal(clientRailOf(renouvelee as DemoMission), consultantRailOf(renouvelee as DemoMission)),
    ).toBe(true)
  })

  it('au moins une mission montre un SEUL rail positif — le cas que #2413.57 refuse encore', () => {
    const partielle = missions().find(mission => {
      const client = clientRailOf(mission)
      const consultant = consultantRailOf(mission)
      const oneOui = client?.intent === 'oui' || consultant?.intent === 'oui'
      return oneOui && !canConfirmRenewal(client, consultant)
    })
    expect(partielle).toBeDefined()
  })

  it('au moins une mission n’a AUCUN rail ouvert — « pas demandé » n’est pas fabriqué', () => {
    // Non mesuré n'est jamais 0 : un rail jamais ouvert doit rester représenté
    // dans la salle, pas remplacé par une réponse que personne n'a donnée.
    const aucunRail = missions().some(mission => clientRailOf(mission) === null && consultantRailOf(mission) === null)
    expect(aucunRail).toBe(true)
  })
})
