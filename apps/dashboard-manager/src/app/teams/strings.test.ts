import { describe, expect, it } from 'vitest'

import { STR, fmtActivationRate, fmtRate } from './strings'

/**
 * #1681.1 — RETENU N'EST PAS NON MESURÉ, ET NI L'UN NI L'AUTRE N'EST « 0 ».
 *
 * L'API applique le seuil des cinq sujets distincts depuis `90897cd95` et rend
 * `activationWithheld` À CÔTÉ du taux — un champ AJOUTÉ, jamais un champ dont la
 * forme change. Cet écran-ci ne le lisait pas : il rendait `fmtRate(null)`,
 * c'est-à-dire le MÊME tiret qu'une absence de mesure.
 *
 * Les deux absences ne disent pas la même chose, et c'est l'opérateur qui paie
 * la confusion : « — » l'envoie chercher une panne d'instrumentation, alors que
 * la mesure existe et qu'on refuse de la publier — sous le seuil, une moyenne
 * DÉSIGNE quelqu'un.
 */
describe('fmtActivationRate — #1681.1', () => {
  it('rend le taux quand il est publiable', () => {
    expect(fmtActivationRate(0.4, null)).toBe('40 %')
    expect(fmtActivationRate(0, null)).toBe('0 %')
  })

  it('DIT le retrait, et ne le confond pas avec le tiret de l’absence', () => {
    const retenu = fmtActivationRate(null, {
      kind: 'below_threshold',
      metric: 'activationRate',
      subjects: 3,
      minSubjects: 5,
    })
    expect(retenu).not.toBe(STR.notAvailable)
    expect(retenu).toContain('5')
    expect(retenu).toContain('retenu')
  })

  it('le seuil affiché vient de la charge utile, jamais d’une constante recopiée ici (GA-26)', () => {
    // Si le seuil produit changeait, cet écran suivrait sans être réédité. Une
    // valeur en dur ici aurait été la deuxième définition d'un réglage.
    expect(
      fmtActivationRate(null, { kind: 'below_threshold', metric: 'activationRate', subjects: 2, minSubjects: 8 }),
    ).toContain('8')
  })

  it('un taux absent SANS retrait reste le tiret — les deux causes gardent deux rendus', () => {
    expect(fmtActivationRate(null, null)).toBe(STR.notAvailable)
    expect(fmtRate(null)).toBe(STR.notAvailable)
  })

  it('le retrait gagne sur le taux — un taux qui aurait fuité ne s’affiche pas', () => {
    // Ceinture : l'API met déjà `activationRate` à `null` quand elle retient.
    // Si un jour elle oubliait, l'écran ne publierait pas pour autant.
    expect(
      fmtActivationRate(0.66, { kind: 'below_threshold', metric: 'activationRate', subjects: 3, minSubjects: 5 }),
    ).not.toContain('66')
  })
})
