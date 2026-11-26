import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DEMO_SEEDED_TABLES, DEMO_INTENTIONALLY_EMPTY } from './demo-coverage'

/**
 * LA PARITÉ DÉMO DU BADGE « INTERRUPTION À CONFIRMER » (#3068, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` garde les TABLES, et `mission_interruptions` y est
 * désormais classée « seedée ». Elle passerait donc au vert avec une ligne
 * dont la mission serait encore ACTIVE, ou dont le consultant porterait une
 * autre affectation en cours — les deux effaceraient le badge que ce lot
 * existe pour rendre visible (`deriveStaffing` ne regarde l'interruption QUE
 * quand `active.length === 0`, `packages/contracts/src/schemas/staffing.ts`).
 * Une garde AVEUGLE n'est pas une exemption.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le JEU DE DONNÉES (`DEMO_CONSULTANTS`/`DEMO_DELIVERY_CLIENT.missions`), pas
 * la prose du semis. L'insertion réelle des lignes `mission_interruptions`
 * (`DemoSeedService.seedDeliveryClient`) reste hors de portée d'un test sans
 * base — cette garde vérifie que le JEU DE DONNÉES tient la promesse que le
 * service traduit ensuite en lignes SQL.
 */

type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

function missionsOf(consultantName: string): DemoMission[] {
  return DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.consultant === consultantName)
}

function endReasonOf(mission: DemoMission): string | null {
  return (mission as { end_reason?: string }).end_reason ?? null
}

describe('parité démo — le badge « Interruption à confirmer »', () => {
  it('au moins une mission de la salle est TERMINÉE par interruption', () => {
    const interrupted = DEMO_DELIVERY_CLIENT.missions.filter(
      mission => mission.status === 'terminated' && endReasonOf(mission) === 'interruption',
    )
    expect(interrupted.length).toBeGreaterThan(0)
  })

  it('cette mission est BORNÉE dans le passé — jamais « en cours »', () => {
    const interrupted = DEMO_DELIVERY_CLIENT.missions.filter(mission => endReasonOf(mission) === 'interruption')
    for (const mission of interrupted) {
      expect(mission.ends_in_days).not.toBeNull()
      expect(mission.ends_in_days as number).toBeLessThan(0)
    }
  })

  it('le consultant qui la porte n’a AUCUNE autre affectation — sinon le badge resterait masqué', () => {
    const interrupted = DEMO_DELIVERY_CLIENT.missions.filter(mission => endReasonOf(mission) === 'interruption')
    expect(interrupted.length).toBeGreaterThan(0)
    for (const mission of interrupted) {
      const all = missionsOf(mission.consultant)
      // Une seconde mission — même finie — ne changerait rien à `deriveStaffing`
      // (qui ne regarde que les affectations ACTIVES), mais ce test garde la
      // salle simple à lire : le badge se démontre sur un consultant qui ne
      // porte QUE ce cas, pas noyé dans un historique.
      expect(all).toHaveLength(1)
    }
  })

  it('le consultant existe dans le vivier — sans profil, aucune ligne `mission_assignments` ne part', () => {
    const interrupted = DEMO_DELIVERY_CLIENT.missions.find(mission => endReasonOf(mission) === 'interruption')
    expect(interrupted).toBeDefined()
    const consultant = DEMO_CONSULTANTS.find(c => c.full_name === interrupted?.consultant)
    expect(consultant).toBeDefined()
  })

  it('`mission_interruptions` a QUITTÉ « vide à dessein » pour « seedée »', () => {
    expect((DEMO_SEEDED_TABLES as readonly string[]).includes('mission_interruptions')).toBe(true)
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('mission_interruptions')
  })
})
