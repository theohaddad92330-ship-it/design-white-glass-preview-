import { MEETING_BRIEF_BLOCKS } from '@bellum/contracts'
import { DEMO_MEETING_BRIEF_BLOCKS } from './demo-coverage'
import { DEMO_ACTIVITIES, DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { demoAgendaEvents } from './demo-agenda'

/**
 * « Et en démonstration, le brief d'avant rendez-vous montre quoi ? »
 *
 * La garde PAR TABLE ne pose pas la question : le brief n'ajoute aucune table,
 * il recompose `accounts`, `contacts`, `activities` et `consultants` à
 * l'affichage. C'est exactement le silence qui fait découvrir un panneau vide en
 * réunion plutôt qu'en CI.
 *
 * Ce que cette garde prouve, en plus de la couverture :
 *  - elle LIT un corpus non vide (les huit blocs du contrat, et le jeu de
 *    données lui-même) ;
 *  - elle sait dire NON — un bloc ajouté au contrat sans décision de démo, une
 *    justification courte, ou un « seedé » qui ne l'est PAS la font rougir ;
 *  - elle vérifie que le rendez-vous de démonstration est réellement
 *    RATTACHABLE : sans invité dont le domaine est le site d'un compte du
 *    portefeuille, les huit blocs se taisent tous ensemble, et la salle
 *    montrerait un panneau vide sans que rien ne l'annonce.
 */
describe('couverture démo — le brief d’avant rendez-vous', () => {
  const client = DEMO_DELIVERY_CLIENT
  // Décision Louis 04/10/2026 — le rendez-vous de livraison est porté par un VRAI
  // dossier : ses faits (site, signaux, enjeux) sont ceux de son brief.
  const carrier = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === client.account.company_name)!.account

  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    // #1934.10 — huitième bloc (objections probables), ajouté en fin de liste.
    // #2319 — cinq de plus : faits, limites, fiches liées, risques, à vérifier.
    // #4424 — quatre de plus : REX, proposition d'atelier, pitch, reprise du R1.
    expect(MEETING_BRIEF_BLOCKS.length).toBe(17)
    expect(Object.keys(DEMO_MEETING_BRIEF_BLOCKS).length).toBeGreaterThan(0)
  })

  it('classe CHAQUE bloc du contrat : seedé, ou vide à dessein avec sa raison', () => {
    // Si ce test tombe : un bloc a été ajouté au brief sans que personne ait
    // répondu « et en démonstration, ça montre quoi ? ».
    expect(Object.keys(DEMO_MEETING_BRIEF_BLOCKS).sort()).toEqual([...MEETING_BRIEF_BLOCKS].sort())
  })

  it('exige une raison SUBSTANTIELLE pour chaque bloc', () => {
    // Le nom du bloc fautif est DANS la valeur comparée : sans lui, un échec
    // dirait « false n'est pas true » et il faudrait le déboguer.
    const tooShort = Object.entries(DEMO_MEETING_BRIEF_BLOCKS)
      .filter(([, entry]) => entry.reason.trim().length < 120)
      .map(([key]) => key)
    expect(tooShort).toEqual([])
  })

  /* ---------------- ce qui rend les « seedé » vrais, un par un -------------- */

  it('le rendez-vous de démonstration est RATTACHABLE — le titre nomme le compte, aucun invité', () => {
    // C'est la condition de TOUT le reste. Décision Louis 04/10/2026 : aucun
    // invité (la présence d'une personne réelle serait une déclaration
    // inventée) ; le COMPTE se rattache par son nom dans le titre
    // (`matchAccountForEvent`, nom ≥ 4 caractères), le bloc « qui » se retire.
    const event = demoAgendaEvents(new Date()).find(item => item.id === 'demo-event-nova')
    expect(event).toBeDefined()
    expect(event?.attendees ?? []).toEqual([])
    expect(client.account.company_name.length).toBeGreaterThanOrEqual(4)
    expect(String(event?.summary)).toContain(client.account.company_name)
    expect(DEMO_MEETING_BRIEF_BLOCKS.who?.state).toBe('vide_a_dessein')
    expect(DEMO_MEETING_BRIEF_BLOCKS.who?.reason).toContain('aucune déclaration inventée sur une personne réelle')
  })

  it('« ce qu’on s’est dit » a de quoi se remplir — le journal porte ce compte', () => {
    const forClient = DEMO_ACTIVITIES.filter(activity => activity.company === client.account.company_name)
    expect(forClient.length).toBeGreaterThan(0)
    // Le bloc ne se date QUE sur des échanges datés. `daysAgo` est le décalage
    // relatif dont le semis dérive `occurred_at` : un `null` ferait disparaître
    // la ligne, et trois lignes disparues feraient disparaître le bloc.
    expect(forClient.every(activity => Number.isFinite(activity.daysAgo))).toBe(true)
  })

  it('« ce qui bouge chez eux » a des signaux DATÉS — sans date, le bloc se retire', () => {
    // Le bloc n'affiche que les signaux DATÉS (les signaux de projet du brief,
    // non datés, sont écartés par l'écran) : il en faut au moins un.
    const dated = carrier.recent_signals.filter(signal => Boolean(signal.date))
    expect(dated.length).toBeGreaterThan(0)
    for (const signal of dated) expect(Number.isNaN(Date.parse(String(signal.date)))).toBe(false)
  })

  it('« ses enjeux probables » a de quoi se remplir — un des deux blocs toujours déduits', () => {
    expect(carrier.it_challenges.length).toBeGreaterThan(0)
    expect(carrier.it_challenges.filter(challenge => !String(challenge.title ?? '').trim())).toEqual([])
  })

  it('« objections probables » (#1934.10) : vide à dessein — aucune objection inventée sur un vrai compte', () => {
    // Décision Louis 04/10/2026 : les objections vivaient sur le client fictif ;
    // deviner celles d'une entreprise réelle serait une déclaration invérifiable.
    expect(DEMO_MEETING_BRIEF_BLOCKS.objections?.state).toBe('vide_a_dessein')
    expect(carrier.raw_analysis['objections']).toBeUndefined()
    expect('objections' in client.analysis).toBe(false)
  })

  it('« ce que tu veux obtenir » a un état de relation — sans lui, l’objectif est ABSENT', () => {
    // C'est la clé que `deriveMeetingType` LIT. Absente, l'écran dit qu'il ne
    // sait pas — ce qui est juste, mais montre le refus au lieu de la capacité.
    expect(client.analysis.salesContext.relationship.state).toBe('besoin_ouvert')
  })

  it('la garde sait dire NON — un bloc « vide à dessein » l’est parce que la donnée manque', () => {
    // `around` lit `contacts.relations`, que le semis ne pose sur AUCUN contact.
    // Si un jour il en pose, cette assertion rougit et l'entrée doit repasser à
    // « seedé » : c'est ainsi qu'une justification ne devient pas périmée en
    // silence. Elle prouve aussi que la garde LIT le jeu de données, et ne se
    // contente pas de relire son propre registre.
    expect(DEMO_MEETING_BRIEF_BLOCKS.around?.state).toBe('vide_a_dessein')
    const withRelations = client.contacts.filter(contact => 'relations' in contact)
    expect(withRelations).toEqual([])
  })

  /* ------------------------------ #2319 ------------------------------------ */

  it('#2319.31 « ce que ce brief ne sait pas » a de quoi se remplir — l’entourage n’est pas résolu', () => {
    // La limite `relations_unknown` se CALCULE sur l'absence que la garde
    // précédente vérifie : les deux entrées tiennent ensemble.
    expect(DEMO_MEETING_BRIEF_BLOCKS.limits?.state).toBe('seede')
    expect(client.contacts.some(contact => 'relations' in contact)).toBe(false)
  })

  it('#2319.33 « opportunités et missions liées » a de quoi se remplir — le client porte ses missions', () => {
    expect(DEMO_MEETING_BRIEF_BLOCKS.linked?.state).toBe('seede')
    expect(client.missions.length).toBeGreaterThan(0)
    expect(client.missions.filter(mission => !mission.label.trim())).toEqual([])
  })

  it('#2319.38 « ce qui reste à vérifier » a de quoi se remplir — les enjeux sont DÉDUITS', () => {
    expect(DEMO_MEETING_BRIEF_BLOCKS.to_verify?.state).toBe('seede')
    expect(carrier.it_challenges.length).toBeGreaterThan(0)
  })

  it('#2319.30 — les faits sont datés : `analysis_runs` est seedée (DEMO_ANALYSIS_RUNS, DEMO_VERIFICATION_RUNS)', () => {
    expect(DEMO_MEETING_BRIEF_BLOCKS.facts?.state).toBe('seede')
  })

  it('#2319.34 — « vide à dessein » parce que la donnée manque, et la garde le VÉRIFIE', () => {
    // Risques : aucun contact du client d'exemple n'est bloqueur ni en écart
    // d'employeur. Si le semis en pose un, cette assertion rougit.
    expect(DEMO_MEETING_BRIEF_BLOCKS.risks?.state).toBe('vide_a_dessein')
    const serialized = JSON.stringify(client.contacts)
    expect(serialized).not.toContain('"blocker"')
    expect(serialized).not.toContain('"RISQUE"')
  })
})
