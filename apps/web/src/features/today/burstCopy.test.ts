import { describe, expect, it } from 'vitest'
import actionsEn from '@/i18n/locales/en/actions.json'
import actionsFr from '@/i18n/locales/fr/actions.json'

/**
 * #4521.5 / #4593 — le récap de la rafale ne cite que des boutons qui EXISTENT : le geste s'appelle « Fait »
 * (« Done »), pas « Valider ». Les deux langues, et le bouton nommé est bien celui que la carte porte.
 */
describe('récap de la rafale : le bouton cité existe (#4521.5)', () => {
  it('FR : « Fait », jamais « Valider »', () => {
    const text = actionsFr.today.burst.summary.underMandate
    expect(text).not.toMatch(/valider/i)
    expect(text).toContain(actionsFr.today.card.done)
  })

  it('EN : « Done », jamais « Validate »', () => {
    const text = actionsEn.today.burst.summary.underMandate
    expect(text).not.toMatch(/validate/i)
    expect(text).toContain(actionsEn.today.card.done)
  })

  // #4593 — DÉCISION PRISE FAUTE D'ARBITRAGE le 27/10/2026, À CONFIRMER PAR LOUIS : la doctrine du 21/09 gagne,
  // « Fait » ne porte JAMAIS de preuve d'envoi. C'est donc le RÉCAP qui change, pas le geste : il ne dit plus
  // « rien ne part tant que tu n'as pas cliqué », phrase qui reliait le clic à un envoi.
  it('le récap ne relie jamais le clic sur « Fait » à un envoi (FR et EN)', () => {
    expect(actionsFr.today.burst.summary.underMandate).not.toMatch(/rien ne part|ne part pas|envoy/i)
    expect(actionsEn.today.burst.summary.underMandate).not.toMatch(/nothing goes out|goes out|sent|send/i)
  })

  it('l’infobulle de « Fait » dit que ce n’est pas une preuve d’envoi (FR et EN)', () => {
    expect(actionsFr.today.card.doneHint).toMatch(/pas une preuve d’envoi/)
    expect(actionsEn.today.card.doneHint).toMatch(/not proof of sending/)
  })
})
