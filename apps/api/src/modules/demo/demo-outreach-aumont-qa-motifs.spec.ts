import { outreachContentBlockers, outreachContextBlockers, type OutreachBlocker } from '@bellum/contracts'
import {
  DEMO_DELIVERY_CARRIER_ACCOUNT,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_OUTREACH_MESSAGES,
} from './demo-dataset'
import { seatName } from './demo-seat-names'

/**
 * #3420 (X76, recette prod 03/10) — chaque motif QA affiché sur la fiche de
 * Directeur technique — entité numérique voyageurs doit être JUSTE pour le texte semé.
 *
 * L'ancien banc (`demo-outreach-context-blockers.spec.ts`) jugeait tous les
 * messages avec `contactStatus: 'new'`. Le siège visé est « nouveau » : pour le
 * serveur, c'est une relation déjà en place, et une « ouverture de relation »
 * lui est un mauvais scénario relationnel. Ce banc-ci juge avec le statut RÉEL
 * de la fiche et le secteur RÉEL du compte, comme `blockersOf` côté API.
 */
// Décision Louis 04/10/2026 — un SIÈGE (sans nom) du dossier SNCF, sans statut
// de relation déclaré : aucune déclaration sur une personne réelle.
const aumont = DEMO_DOSSIERS.find(
  d => d.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name,
)!.contacts.find(c => c.full_name === seatName('Directeur technique — entité numérique voyageurs'))!

function motifsOf(index: number): OutreachBlocker[] {
  const entry = DEMO_OUTREACH_MESSAGES[index]!
  if (entry.status === 'approved' || entry.status === 'copied_manual') return []
  const body = entry.edit?.body ?? entry.body
  return [
    ...outreachContentBlockers({
      body,
      accountName: DEMO_DELIVERY_CLIENT.account.company_name,
      contactName: entry.contact,
    }),
    ...outreachContextBlockers({
      body,
      channel: 'email',
      intent: entry.intent,
      contactName: entry.contact,
      contactStatus: aumont.user_status ?? 'new',
      priorContactedCount: 0,
      accountAnchors: [DEMO_DELIVERY_CARRIER_ACCOUNT.sector],
      verifiedTechStack: [],
      siblingBodies: [],
      sequencePosition: null,
    }),
  ]
}

const EXPECTED: Readonly<Record<string, OutreachBlocker[]>> = {
  // « vous utilisez Databricks » : aucune stack confirmée — et RIEN d'autre.
  'Votre plateforme data': ['unverified_tech_claim'],
  // « notre consultant est disponible » : sans preuve — et RIEN d'autre.
  'Un consultant pour votre équipe plateforme': ['unverifiable_claim'],
}

describe('messages de démo de Directeur technique — entité numérique voyageurs — motifs QA exacts (#3420)', () => {
  const indexes = DEMO_OUTREACH_MESSAGES.map((m, i) => [m.subject, i, m.contact] as const).filter(
    ([, , contact]) => contact === seatName('Directeur technique — entité numérique voyageurs'),
  )

  it('la garde LIT quelque chose — le siège est « nouveau », avec plusieurs messages à relire', () => {
    expect(aumont.user_status ?? 'new').toBe('new')
    expect(indexes.filter(([subject]) => subject in EXPECTED)).toHaveLength(2)
  })

  it.each(indexes.filter(([subject]) => subject in EXPECTED))('%s : exactement le motif attendu', (subject, index) => {
    expect(motifsOf(index)).toEqual(EXPECTED[subject])
  })

  it('la garde sait dire NON — une ouverture à froid sur ce contact en relation lèverait le mauvais scénario', () => {
    const body = 'Bonjour,\nVotre plateforme logistique nous intéresse. Un échange vous dirait-il ?'
    const out = outreachContextBlockers({
      body,
      channel: 'email',
      intent: 'open_relationship',
      contactName: seatName('Directeur technique — entité numérique voyageurs'),
      contactStatus: 'meeting',
      priorContactedCount: 0,
      accountAnchors: [],
      verifiedTechStack: [],
      siblingBodies: [],
      sequencePosition: null,
    })
    expect(out).toContain('relationship_scenario_mismatch')
  })
})
