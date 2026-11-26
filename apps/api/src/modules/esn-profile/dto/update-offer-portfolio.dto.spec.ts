import { UpdateOfferPortfolioDto } from './update-offer-portfolio.dto'

/**
 * Le docblock du DTO promet qu'un écran qui oublie un champ ne remet rien aux
 * défauts. zod 4 a failli rendre cette promesse fausse : son `.partial()`
 * GARDE les `.default()`, donc un PATCH de trois champs serait arrivé au
 * service avec les treize autres remplis — et le service fusionne.
 *
 * Ce DTO ne REFUSE rien : chaque champ du portefeuille porte un `.catch()` par
 * contrat (une valeur abîmée se rattrape, elle ne casse pas la page de
 * réglages). Le NON vit un cran plus bas, sur le helper lui-même
 * (`partial-without-defaults.test.ts` : `.strict()` conservé, mauvais type
 * refusé). Ici on garde la seule chose que ce DTO doit tenir : il ne rend QUE
 * ce qu'on lui a envoyé.
 */
describe('UpdateOfferPortfolioDto — un PATCH ne touche QUE ce qu’il envoie', () => {
  const schema = UpdateOfferPortfolioDto.schema

  it('ne rend que les clés envoyées — aucun champ à défaut ne s’invite', () => {
    const parsed = schema.parse({ preferred_terms: ['Affaire'] })

    expect(parsed).toEqual({ preferred_terms: ['Affaire'] })
    expect(Object.keys(parsed)).toEqual(['preferred_terms'])
  })

  it('un corps vide reste vide — jamais le portefeuille entier remis à neuf', () => {
    expect(schema.parse({})).toEqual({})
  })

  it('rattrape une valeur abîmée SUR LA CLÉ ENVOYÉE, sans ressusciter les autres', () => {
    const parsed = schema.parse({ target_geographies: 42 })

    expect(parsed).toEqual({ target_geographies: [] })
    expect(Object.keys(parsed)).toEqual(['target_geographies'])
  })
})
