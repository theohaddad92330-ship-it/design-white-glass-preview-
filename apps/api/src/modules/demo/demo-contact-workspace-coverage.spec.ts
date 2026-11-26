import { seatName } from './demo-seat-names'
import { DEMO_ACTIVITIES, DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_NOTES, DEMO_TASKS } from './demo-dataset'

/**
 * #3688 (craft rule n°9) — la fiche contact met « note + historique » en tête
 * de la zone de travail. La salle doit y montrer, sur UN contact, ce que
 * l'issue énumère : deux notes, un e-mail, un appel consigné, une tâche FUTURE
 * et un événement INTERNE (qui n'est pas un échange client).
 *
 * ⚠️ Les notes référencent le contact par son NOM : un nom qui ne correspond à
 * aucun contact est sauté EN SILENCE par `DemoSeedService` (`entityId`
 * introuvable → `null`). C'est ce qui avait vidé les notes de ce contact : la
 * garde ci-dessous le dit au lieu de laisser la réunion le découvrir.
 */
const SEAT = seatName('Directeur des systèmes d’information groupe')
// Les interlocuteurs simulés du client de livraison (lot D01) vivent dans
// `DEMO_DELIVERY_CLIENT.contacts` : `seedDeliveryClient` les enregistre dans
// le registre partagé AVANT les notes, donc ils comptent comme existants.
const allContactNames = new Set([
  ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts.map(contact => contact.full_name)),
  ...DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name),
])

describe('démo — le contact de la fiche « note + historique » (#3688)', () => {
  it('tout contact cité par une note, un échange ou une tâche EXISTE dans le jeu (sinon la ligne est sautée en silence)', () => {
    const cited = [
      ...DEMO_NOTES.map(note => note.contact),
      ...DEMO_ACTIVITIES.map(activity => activity.contact),
      ...DEMO_TASKS.map(task => task.contact),
    ].filter((name): name is string => name !== null)
    const missing = [...new Set(cited)].filter(name => !allContactNames.has(name))
    expect(missing).toEqual([])
  })

  it('deux notes sur le contact', () => {
    expect(DEMO_NOTES.filter(note => note.contact === SEAT).length).toBeGreaterThanOrEqual(2)
  })

  it('un e-mail, un appel consigné et un événement INTERNE sur le contact', () => {
    const lines = DEMO_ACTIVITIES.filter(activity => activity.contact === SEAT)
    expect(lines.some(line => line.kind === 'email')).toBe(true)
    expect(lines.some(line => line.kind === 'call')).toBe(true)
    expect(lines.some(line => line.direction === 'internal' && line.kind === 'meeting')).toBe(true)
  })

  it('une tâche FUTURE ouverte — distincte des échanges passés', () => {
    const future = DEMO_TASKS.filter(task => task.contact === SEAT && !task.closed && task.dueInDays > 0)
    expect(future.length).toBeGreaterThanOrEqual(1)
  })

  it('un rendez-vous PLANIFIÉ (daysAgo négatif) : « planifié » ≠ « tenu » se voit en salle', () => {
    expect(DEMO_ACTIVITIES.some(line => line.contact === SEAT && line.daysAgo < 0)).toBe(true)
  })
})
