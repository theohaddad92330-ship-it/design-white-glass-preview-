import { computeMailThreadCommercialState } from './mail-commercial-state'

/**
 * #2393.2 — DOUZE ÉTATS DÉCLARÉS, TROIS PRODUITS.
 *
 * `waiting_on_me` / `waiting_on_them` se dérivent de `lastDirection` (la même
 * donnée qui alimente déjà `awaitingReply`, #2104.15) ; `positive_reply`
 * réutilise le signal déjà déterministe de `positiveReplyThreadIds`
 * (`mail-priority.ts`). Les neuf autres valeurs de l'enum demandent de
 * comprendre le CONTENU du message — aucune classification de ce type
 * n'existe côté serveur, donc la fonction ne les rend jamais : elle rend
 * `null` plutôt que deviner (doctrine « jamais de donnée fictive »).
 */
describe('computeMailThreadCommercialState — #2393.2', () => {
  it('le contact a écrit en dernier : on attend une action de MOI', () => {
    expect(computeMailThreadCommercialState({ lastDirection: 'inbound' }, false, null)).toBe('waiting_on_me')
  })

  it("j'ai écrit en dernier, sans réponse : on attend EUX", () => {
    expect(computeMailThreadCommercialState({ lastDirection: 'outbound' }, false, null)).toBe('waiting_on_them')
  })

  it('une réponse favorable détectée prime sur la direction', () => {
    expect(computeMailThreadCommercialState({ lastDirection: 'inbound' }, true, null)).toBe('positive_reply')
  })

  it('une décision manuelle (traité/non pertinent) : pas une classification commerciale', () => {
    expect(computeMailThreadCommercialState({ lastDirection: 'inbound' }, false, 'treated')).toBeNull()
    expect(computeMailThreadCommercialState({ lastDirection: 'outbound' }, false, 'irrelevant')).toBeNull()
  })
})
