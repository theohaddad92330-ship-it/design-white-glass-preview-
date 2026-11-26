import { computeMailThreadPriority } from './mail-priority'

/**
 * #2104.14 / #2104.16 / #2104.17 — LE CLASSEMENT, en 6 niveaux FUSIONNÉS.
 *
 * Avant ce module, l'écran ne connaissait que TROIS onglets de filtre
 * (`TRIAGE_INTENTS`) : aucun tri unique, aucune raison affichée par fil. Ce
 * module remplace ça par UNE fonction pure, testée, qui rend à la fois le
 * NIVEAU (pour trier) et la RAISON (pour expliquer) — jamais l'un sans
 * l'autre : un score n'est jamais nu (doctrine).
 */
const base = {
  unread: false,
  awaitingReply: false,
  daysSinceLastMessage: null as number | null,
}

describe('computeMailThreadPriority — 6 niveaux fusionnés', () => {
  it('niveau 1 : réponse favorable NON LUE — le plus urgent', () => {
    expect(computeMailThreadPriority({ ...base, unread: true }, true, 7, null)).toEqual({
      state: 'unread',
      level: 1,
      reason: 'positive_reply_unread',
    })
  })

  it('niveau 2 : réponse favorable déjà lue', () => {
    expect(computeMailThreadPriority({ ...base, unread: false }, true, 7, null)).toEqual({
      state: 'read',
      level: 2,
      reason: 'positive_reply',
    })
  })

  it('niveau 3 : non lu, sans signal positif', () => {
    expect(computeMailThreadPriority({ ...base, unread: true }, false, 7, null)).toEqual({
      state: 'unread',
      level: 3,
      reason: 'unread',
    })
  })

  it('niveau 4 : en attente de réponse depuis PLUS que le seuil de silence', () => {
    expect(
      computeMailThreadPriority({ ...base, awaitingReply: true, daysSinceLastMessage: 9 }, false, 7, null),
    ).toEqual({ state: 'awaiting_reply', level: 4, reason: 'awaiting_reply_late' })
  })

  it('niveau 5 : en attente de réponse, mais encore SOUS le seuil de silence', () => {
    expect(
      computeMailThreadPriority({ ...base, awaitingReply: true, daysSinceLastMessage: 2 }, false, 7, null),
    ).toEqual({ state: 'awaiting_reply', level: 5, reason: 'awaiting_reply' })
  })

  it('niveau 5 aussi quand l’ancienneté du silence est inconnue — jamais 0 ni deviné', () => {
    expect(
      computeMailThreadPriority({ ...base, awaitingReply: true, daysSinceLastMessage: null }, false, 7, null),
    ).toEqual({ state: 'awaiting_reply', level: 5, reason: 'awaiting_reply' })
  })

  it('niveau 6 : rien de particulier — lu, pas en attente, pas positif', () => {
    expect(computeMailThreadPriority(base, false, 7, null)).toEqual({ state: 'read', level: 6, reason: 'none' })
  })

  it('un fil MARQUÉ TRAITÉ retombe au niveau 6, quels que soient les autres signaux', () => {
    // #2104.7 — un fil traité n'a plus besoin d'attirer l'attention, même s'il
    // était par ailleurs non lu ou en attente longue.
    expect(computeMailThreadPriority({ ...base, unread: true }, true, 7, 'treated')).toEqual({
      state: 'treated',
      level: 6,
      reason: 'treated',
    })
  })

  it('un fil SIGNALÉ NON PERTINENT retombe aussi au niveau 6, avec sa PROPRE raison', () => {
    // #2104.8 — distinct de « traité » : deux gestes, deux raisons, jamais la
    // même étiquette pour deux décisions différentes.
    expect(
      computeMailThreadPriority({ ...base, awaitingReply: true, daysSinceLastMessage: 30 }, false, 7, 'irrelevant'),
    ).toEqual({
      state: 'irrelevant',
      level: 6,
      reason: 'irrelevant',
    })
  })

  it('le classement reste EXPLICABLE : chaque combinaison rend une raison, jamais vide', () => {
    // #2104.17 — un score n'est jamais nu : même le niveau le plus bas NOMME
    // pourquoi il l'est.
    const result = computeMailThreadPriority(base, false, 7, null)
    expect(result.reason).toBeTruthy()
    expect(result.level).toBeGreaterThanOrEqual(1)
    expect(result.level).toBeLessThanOrEqual(6)
  })
})

describe('Théo B M1.N1 — un fil archivé', () => {
  it('se range comme un fil traité : niveau 6, il ne remonte pas', () => {
    const signals = { unread: true, awaitingReply: false, daysSinceLastMessage: 1 }
    expect(computeMailThreadPriority(signals, true, 7, 'archived')).toEqual(
      computeMailThreadPriority(signals, true, 7, 'treated'),
    )
  })
})
