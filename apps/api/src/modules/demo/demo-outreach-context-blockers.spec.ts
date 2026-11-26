import { outreachContextBlockers, type OutreachBlocker } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT, DEMO_OUTREACH_MESSAGES } from './demo-dataset'

/**
 * #3420 (lot Q06, 30/09) — PARITÉ DÉMO des critères de contexte (craft rule 9).
 *
 * Le centre d'approbation juge chaque message de la salle avec les mêmes
 * critères que la production. Sans ce banc, un nouveau critère range en
 * « bloqué » des messages de démonstration qui devaient être « à relire » ou
 * « prêts » — et ça se découvre en réunion. Le contexte est reconstruit ici
 * comme le serveur le lit : messages déjà PARTIS (`copied_manual`) vers le même
 * contact ; aucun compte ni séquence liés dans ce jeu.
 */
function contextBlockersOf(index: number): OutreachBlocker[] {
  const entry = DEMO_OUTREACH_MESSAGES[index]!
  // Un message déjà PARTI n'est plus jugé (voir `blockersOf`, statuts à juger).
  if (entry.status === 'copied_manual') return []
  const prior = DEMO_OUTREACH_MESSAGES.filter(
    (other, i) => i !== index && other.contact === entry.contact && other.status === 'copied_manual',
  ).length
  return outreachContextBlockers({
    body: entry.edit?.body ?? entry.body,
    channel: 'email',
    intent: entry.intent,
    contactName: entry.contact,
    // Le statut RÉEL de la fiche semée (le siège de livraison : « nouveau » depuis le 04/10/2026), jamais « new » par défaut (#3420, X76).
    contactStatus: DEMO_DELIVERY_CLIENT.contacts.find(c => c.full_name === entry.contact)?.user_status ?? 'new',
    priorContactedCount: prior,
    accountAnchors: [],
    verifiedTechStack: [],
    siblingBodies: [],
    sequencePosition: null,
  })
}

// Les messages que la salle bloque À DESSEIN pour un motif de contexte, avec le motif.
const BLOCKED_ON_PURPOSE: Readonly<Record<string, OutreachBlocker[]>> = {
  'Un rendez-vous jeudi': ['forced_meeting'],
  // #3419.2 (lot Z08) — « vous utilisez Databricks » : aucune stack confirmée sur le compte.
  'Votre plateforme data': ['unverified_tech_claim'],
}

describe('messages de démo — critères de contexte (#3420 lot Q06)', () => {
  it.each(DEMO_OUTREACH_MESSAGES.map((entry, index) => [`${entry.contact} (${entry.intent})`, index] as const))(
    '%s : aucun bloquant de contexte, sauf ceux nommés à dessein',
    (_label, index) => {
      const entry = DEMO_OUTREACH_MESSAGES[index]!
      expect(contextBlockersOf(index)).toEqual(BLOCKED_ON_PURPOSE[entry.subject] ?? [])
    },
  )

  it('la salle montre AU MOINS un bloquant de contexte — sinon l’écran livré est vide en démo', () => {
    const shown = DEMO_OUTREACH_MESSAGES.flatMap((_entry, index) => contextBlockersOf(index))
    expect(shown.length).toBeGreaterThan(0)
  })
})
