import { REENGAGEMENT_SILENCE_DAYS, classifyEngagement, daysSince } from './engagement-report'

/**
 * #3903 — le bilan de relance multi-sources sur une fenêtre.
 *
 * Classification DÉRIVÉE uniquement de ce que `activities` sait avec certitude
 * (sens de la DERNIÈRE interaction, silence écoulé) — jamais une probabilité,
 * le deal jamais closé vient du cache CRM (lot M01) ; « nogo retenté » est
 * abandonné (décision Louis 09/10).
 */
describe('classifyEngagement (#3903)', () => {
  it('la dernière interaction est ENTRANTE : la balle est chez nous', () => {
    expect(classifyEngagement('inbound', 1)).toBe('en_attente_chez_nous')
    expect(classifyEngagement('inbound', 200)).toBe('en_attente_chez_nous')
  })

  it('sortante et RÉCENTE (< seuil) : on attend encore une réponse, pas encore « à relancer »', () => {
    expect(classifyEngagement('outbound', 0)).toBe('en_attente_chez_le_client')
    expect(classifyEngagement('outbound', REENGAGEMENT_SILENCE_DAYS - 1)).toBe('en_attente_chez_le_client')
  })

  it('sortante et SILENCIEUSE (>= seuil) : candidat à la relance', () => {
    expect(classifyEngagement('outbound', REENGAGEMENT_SILENCE_DAYS)).toBe('a_relancer')
    expect(classifyEngagement('outbound', 365)).toBe('a_relancer')
  })
})

describe('daysSince (#3903)', () => {
  it('compte des jours PLEINS, jamais négatifs sur une horloge qui varie d’une seconde', () => {
    const now = new Date('2026-09-20T10:00:00.000Z')
    expect(daysSince('2026-09-19T10:00:00.000Z', now)).toBe(1)
    expect(daysSince('2026-09-20T09:59:59.000Z', now)).toBe(0)
  })

  it('une date future (horloge décalée) ne rend jamais un nombre négatif', () => {
    const now = new Date('2026-09-20T10:00:00.000Z')
    expect(daysSince('2026-09-21T10:00:00.000Z', now)).toBe(0)
  })
})

/**
 * #3903 (lot M01, 09/10/2026) — « deal jamais closé », croisé grâce à la
 * jointure deal CRM → compte (#3918.a) : un deal OUVERT rattaché au compte.
 */
describe('classifyEngagement — deal CRM ouvert (#3903, lot M01)', () => {
  it('un deal ouvert, balle chez le client : « deal jamais closé »', () => {
    expect(classifyEngagement('outbound', 30, 1)).toBe('deal_jamais_close')
    expect(classifyEngagement('outbound', 0, 2)).toBe('deal_jamais_close')
  })

  it('une réponse nous est due : « en attente chez nous » reste prioritaire, même avec un deal ouvert', () => {
    expect(classifyEngagement('inbound', 3, 1)).toBe('en_attente_chez_nous')
  })

  it('aucun deal ouvert : la classification d’avant, inchangée', () => {
    expect(classifyEngagement('outbound', 30, 0)).toBe('a_relancer')
    expect(classifyEngagement('outbound', 30)).toBe('a_relancer')
  })
})
