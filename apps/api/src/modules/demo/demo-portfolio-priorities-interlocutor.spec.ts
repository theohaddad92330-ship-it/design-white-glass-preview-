import { derivePortfolioPriorities, type PortfolioAccountRow } from '../accounts/portfolio-priorities'
import { pickInterlocutor } from '../accounts/portfolio-priorities'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3399 (« la démo n'a pas été re-vérifiée ») — « Quel compte attaquer en premier ? » EN DÉMO.
 *
 * Le gabarit de Laura nomme une personne (nom, rôle, périmètre) pour CHAQUE compte
 * listé, ou « Interlocuteur à identifier ». La recette prod n'a jamais pu voir le cas
 * « plusieurs comptes maintenant » : le portefeuille réel n'en avait aucun. La salle
 * de démonstration, elle, DOIT le montrer. Cette garde rejoue ce que
 * `AccountsService.portfolioPriorities` fait (les cinq meilleurs contacts visibles,
 * `pickInterlocutor`, `derivePortfolioPriorities`) sur les données SEMÉES du dossier.
 */
const rows: PortfolioAccountRow[] = DEMO_DOSSIERS.map(dossier => {
  const { account } = dossier
  // Même tri que la requête SQL : score décroissant, priorité croissante, nom.
  const candidates = [...dossier.contacts]
    .sort(
      (a, b) =>
        b.contact_score - a.contact_score ||
        (a.priority ?? 99) - (b.priority ?? 99) ||
        a.full_name.localeCompare(b.full_name),
    )
    .slice(0, 5)
    .map(contact => ({ name: contact.full_name, role: contact.decision_role || contact.title, scope: null }))
  return {
    id: account.company_name,
    companyName: account.company_name,
    sprint: account.sprint,
    sprintExitReason: account.sprint_exit_reason,
    priorityGate: account.priority_gate,
    priorityScore: account.priority_score,
    priorityJustification: account.priority_justification,
    commercialStatus: account.commercial_status,
    groupHeadSiren: null,
    lastActionAt: null,
    movementRationale: null,
    firstActionLabel: null,
    firstActionHorizon: null,
    betHorizon: null,
    betSize: null,
    betAccess: null,
    betResource: null,
    headquarters: account.headquarters,
    interlocutor: pickInterlocutor(candidates),
  }
})

describe('#3399 — la démo montre « plusieurs comptes maintenant », chacun avec son interlocuteur', () => {
  const priorities = derivePortfolioPriorities(rows)

  it('au moins DEUX comptes sont « maintenant » (le cas que la prod n’a jamais pu montrer)', () => {
    expect(priorities.now.length).toBeGreaterThanOrEqual(2)
  })

  it('chaque compte « maintenant » porte une personne NOMMÉE avec son rôle — jamais un prénom seul', () => {
    for (const item of priorities.now) {
      expect(item.interlocutor).not.toBeNull()
      expect(item.interlocutor?.name.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
      expect(item.interlocutor?.role).toBeTruthy()
    }
  })

  it('un compte sans contact lisible porte `null` explicite, jamais un nom deviné (et sait dire NON à un rôle sans personne)', () => {
    expect(pickInterlocutor([{ name: '', role: 'DSI', scope: null }])).toBeNull()
    expect(pickInterlocutor([])).toBeNull()
  })
})
