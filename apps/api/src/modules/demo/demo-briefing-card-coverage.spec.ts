import { BRIEFING_ACTIONS_MAX, BRIEFING_CARD_FIELDS } from '@bellum/contracts'
import type { BriefingAction } from '@bellum/contracts'
import { buildBriefingActions } from '../briefing/briefing-actions'
import { demoBriefing } from './demo-briefing'
import { DEMO_BRIEFING_CARD_FIELDS } from './demo-coverage'

/**
 * « ET EN DÉMONSTRATION, LES QUATRE NOUVEAUX CHAMPS D'UNE CARTE MONTRENT QUOI ? »
 *
 * La garde PAR TABLE ne pose pas la question : les champs ajoutés à une carte de
 * « Aujourd’hui » n'ajoutent aucune table, ils DÉRIVENT de ce que le brief lit
 * déjà. C'est le silence qui fait découvrir un bloc vide en réunion plutôt qu'en
 * CI, et le bloc « depuis ta dernière visite » l'a payé une fois : il était
 * monté, visible, et personne n'avait vérifié ce qu'il montrait.
 *
 * ⚠️ Cette garde ne se contente pas de lire un registre. Elle CONSTRUIT le brief
 * d'une salle et relit ses cartes, puis confronte ce qu'elle voit à ce que le
 * registre déclare. Une entrée fausse dans un sens (« seedé » alors que tout est
 * nul) comme dans l'autre (« vide à dessein » alors que la salle en montre) fait
 * rougir la CI. C'est la différence entre garder une décision et garder un texte.
 */

/** L'instant de la visite. Le jeu de démonstration se date à partir de là. */
const NOW = new Date('2026-08-03T07:00:00.000Z')

/**
 * Les cartes d'une salle, construites comme `BriefingService.buildDemo` les
 * construit : le CONTENU est scripté, le TRI ne l'est pas.
 *
 * ⚠️ #1391 — il n'y a PLUS de carte « tâche » : depuis ce lot, une tâche en
 * retard vit uniquement dans le bloc « Tes tâches », la colonne d'à côté, où
 * elle est cliquable. Elle s'affichait auparavant aux deux endroits, dont un
 * inerte (`href: null`). La salle de démonstration montre donc ses tâches par
 * la table `tasks`, seedée (« dont UNE en retard »), et ses cartes d'action par
 * l'agenda, la messagerie et les comptes à suivre.
 */
function demoCards(now: Date = NOW): BriefingAction[] {
  const briefing = demoBriefing({
    now,
    timeZone: 'Europe/Paris',
    firstName: 'Théo',
    accounts: [
      { accountId: 'acc-1', companyName: 'Société Générale', website: null },
      { accountId: 'acc-2', companyName: 'Groupe BPCE', website: null },
    ],
  })
  return buildBriefingActions({
    now,
    meetings: briefing.agenda.needsPreparation,
    conflicts: briefing.agenda.conflicts,
    awaitingReply: briefing.mail.awaitingReply,
    unread: briefing.mail.unread,
    positiveReplies: briefing.mail.positiveReplies,
    accountsWithFreshSignal: briefing.accountsToWatch.map(entry => ({
      accountId: entry.accountId,
      companyName: entry.companyName,
      detectedAt: entry.detectedAt,
      detectionExact: entry.detectionExact,
      signalLabel: entry.signalLabel,
    })),
    // #2107.3 — vide ici À DESSEIN : cette fonction rejoue le brief SCRIPTÉ
    // (`demo-briefing.ts`), pas le chemin de production. Les besoins sans
    // shortlist de la salle passent par `BriefingService.buildStaleNeeds`,
    // une vraie lecture SQL sur `project_needs` — hors de portée d'un test qui
    // ne monte aucun service Nest. Le champ `needs` de la couverture démo
    // (`demo-coverage.ts`) reste donc classé côté SERVICE, jamais ici.
    staleNeeds: [],
    // #2095.19 / #2993 — le lecteur de CETTE salle : `BriefingService.buildDemo`
    // le porte toujours (`userId`), donc ce harnais scripté fait de même plutôt
    // que de déclarer `owner` seedé sur un jeu qui ne le montrerait jamais.
    ownerId: 'demo-user',
  })
}

/** Un champ est SERVI quand au moins une carte de la salle porte une valeur. */
function isServed(cards: BriefingAction[], field: (typeof BRIEFING_CARD_FIELDS)[number]): boolean {
  return cards.some(card => {
    const value = card[field]
    if (Array.isArray(value)) return value.length > 0
    return value !== null && value !== undefined
  })
}

describe('couverture démo — les quatre champs d’une carte de « Aujourd’hui »', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    const cards = demoCards()
    expect(cards.length).toBeGreaterThan(0)
    // #2095 / #2099 — quatre champs à l'origine, onze depuis que la carte porte
    // le contrat canonique du candidat du jour, treize depuis `owner`/
    // `permission` (#2095.19, #2095.34, #2993). Le nombre est écrit en dur à
    // dessein : c'est ce qui force la relecture de ce fichier le jour où un
    // quatorzième champ arrive, plutôt qu'une garde qui se rend vraie toute seule.
    expect(BRIEFING_CARD_FIELDS.length).toBe(13)
    expect(Object.keys(DEMO_BRIEFING_CARD_FIELDS).length).toBeGreaterThan(0)
  })

  // #3414 (recette 02/10) — « Tes décisions » classe les cartes SERVIES (plafond
  // `BRIEFING_ACTIONS_MAX`). Sept cartes de protection évinçaient toute carte
  // « compte » : la catégorie « prochain mouvement » restait vide et la tête
  // des décisions était identique en Dirigeant, Manager et Commercial.
  it('#3414 — la salle sert au moins une carte d’opportunité malgré le plafond', () => {
    const kinds = demoCards().map(card => card.kind)
    expect(kinds).toContain('account')
  })

  // #3414 (Y11, 02/10 après-midi) — l'après-midi la salle sert cinq préparations de rendez-vous et
  // aucune relance : la place d'une carte à potentiel n'avait personne à qui la prendre. Elle doit
  // être servie à TOUTE heure de la journée, pas seulement le matin où le test était écrit.
  it.each(['06:30', '09:00', '11:00', '12:48', '14:30', '16:00', '18:00', '20:00'])(
    '#3414 — la carte d’opportunité est servie à %s UTC, et le plafond reste un plafond',
    time => {
      const cards = demoCards(new Date(`2026-10-02T${time}:00.000Z`))
      expect(cards.map(card => card.kind)).toContain('account')
      expect(cards.length).toBeLessThanOrEqual(BRIEFING_ACTIONS_MAX)
      // Jamais un conflit ni une réponse évincés pour elle.
      expect(cards.filter(card => card.kind === 'conflict').length).toBeGreaterThan(0)
    },
  )

  it('classe CHAQUE champ du contrat : seedé, ou vide à dessein avec sa raison', () => {
    // Si ce test tombe : un champ a été ajouté à la carte sans que personne
    // ait répondu « et en démonstration, ça montre quoi ? ».
    expect(Object.keys(DEMO_BRIEFING_CARD_FIELDS).sort()).toEqual([...BRIEFING_CARD_FIELDS].sort())
  })

  it('exige une raison SUBSTANTIELLE pour chaque champ laissé vide', () => {
    // Une raison doit tenir devant quelqu'un qui présente le produit. Le nom du
    // champ fautif est DANS la valeur comparée : jest n'accepte pas de message
    // sur `expect`, et sans lui l'échec serait indéchiffrable.
    const tooShort = Object.entries(DEMO_BRIEFING_CARD_FIELDS)
      .filter(([, entry]) => entry.state !== 'seede' && entry.reason.length <= 200)
      .map(([field]) => field)
    expect(tooShort).toEqual([])
  })

  it('ce que le registre DÉCLARE est ce que la salle MONTRE', () => {
    // La moitié qui compte. Un registre qui se dit implémenté sans l'être est
    // un défaut que ce dépôt a déjà payé — d'où la confrontation à des cartes
    // réellement construites, et non à une intention écrite.
    const cards = demoCards()
    const observed = Object.fromEntries(
      BRIEFING_CARD_FIELDS.map(field => [field, isServed(cards, field) ? 'seede' : 'vide_a_dessein']),
    )
    const declared = Object.fromEntries(
      BRIEFING_CARD_FIELDS.map(field => [field, DEMO_BRIEFING_CARD_FIELDS[field]?.state]),
    )
    expect(observed).toEqual(declared)
  })

  it('la salle date ses faits — un prospect ne voit pas « date inconnue » partout', () => {
    // L'état d'EXCEPTION du produit (une date illisible) ne doit pas s'afficher
    // comme son état normal devant quelqu'un à qui on montre l'outil.
    const cards = demoCards()
    const withFact = cards.filter(card => card.fact !== null)
    expect(withFact.length).toBeGreaterThan(0)
    expect(withFact.filter(card => card.fact?.provenance.observedAt === null)).toEqual([])
  })

  it('la salle montre PLUSIEURS capacités — une seule source se lirait comme une panne', () => {
    const capabilities = new Set(demoCards().map(card => card.fact?.provenance.capability))
    capabilities.delete(undefined)
    expect(capabilities.size).toBeGreaterThan(1)
  })
})
