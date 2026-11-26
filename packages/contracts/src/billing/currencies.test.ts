import { describe, expect, it } from 'vitest'
import {
  CURRENCY_MINOR_UNITS,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  formatCurrencyAmount,
  isBillingCurrency,
  priceInCurrency,
  resolveBillingCurrency,
  sanitizeCurrencyPrices,
} from './currencies.js'

const EUR = { priceCents: 11900, extraSeatPriceCents: 2900 }

describe('devises vendables', () => {
  it('toutes ont deux décimales — la convention « montant en centimes » en dépend', () => {
    // Une devise à zéro décimale (JPY) ferait prélever 11 900 ¥ là où l'on
    // affiche 119 ¥. Ce test est un mur, pas un avertissement.
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_MINOR_UNITS[currency]).toBe(2)
    }
  })

  it('reconnaît une devise vendable et refuse le reste', () => {
    expect(isBillingCurrency('usd')).toBe(true)
    expect(isBillingCurrency('jpy')).toBe(false)
    expect(isBillingCurrency('USD')).toBe(false) // le code stocké est en minuscules
    expect(isBillingCurrency(undefined)).toBe(false)
  })
})

describe('resolveBillingCurrency', () => {
  it('ce qui est DÉJÀ facturé gagne sur tout le reste — Stripe ne change pas la devise d’un abonnement', () => {
    expect(resolveBillingCurrency({ locked: 'usd', requested: 'gbp', billingCountry: 'CH' })).toBe('usd')
  })

  it('sans verrou, le choix de l’utilisateur passe avant son pays', () => {
    expect(resolveBillingCurrency({ requested: 'gbp', billingCountry: 'US' })).toBe('gbp')
  })

  it('un choix non vendable est ignoré plutôt qu’accepté à moitié', () => {
    expect(resolveBillingCurrency({ requested: 'jpy', billingCountry: 'US' })).toBe('usd')
  })

  it('le pays de facturation sert de défaut, insensible à la casse', () => {
    expect(resolveBillingCurrency({ billingCountry: 'us' })).toBe('usd')
    expect(resolveBillingCurrency({ billingCountry: 'CH' })).toBe('chf')
    expect(resolveBillingCurrency({ billingCountry: 'GB' })).toBe('gbp')
    expect(resolveBillingCurrency({ billingCountry: 'CA' })).toBe('cad')
  })

  it('un pays inconnu retombe sur l’euro, sans rien inventer', () => {
    expect(resolveBillingCurrency({ billingCountry: 'BR' })).toBe(DEFAULT_CURRENCY)
    expect(resolveBillingCurrency({})).toBe(DEFAULT_CURRENCY)
  })

  it('un verrou invalide en base ne bloque pas la facturation', () => {
    // Une valeur aberrante (devise retirée du catalogue) ne doit pas empêcher
    // un client de payer : on repart de son choix.
    expect(resolveBillingCurrency({ locked: 'xxx', requested: 'usd' })).toBe('usd')
  })
})

describe('priceInCurrency', () => {
  it('rend le prix DÉCLARÉ, jamais une conversion', () => {
    const result = priceInCurrency({
      eur: EUR,
      table: { usd: { priceCents: 12900, extraSeatPriceCents: 3200 } },
      currency: 'usd',
    })
    expect(result).toEqual({
      currency: 'usd',
      price: { priceCents: 12900, extraSeatPriceCents: 3200 },
      fellBack: false,
    })
  })

  it('une devise sans prix déclaré facture en euros — et le DIT', () => {
    const result = priceInCurrency({ eur: EUR, table: { usd: EUR }, currency: 'gbp' })
    expect(result.currency).toBe('eur')
    expect(result.price).toEqual(EUR)
    // Sans ce drapeau, le client découvrirait la devise sur son relevé.
    expect(result.fellBack).toBe(true)
  })

  it('l’euro ne tombe jamais en repli sur lui-même', () => {
    expect(priceInCurrency({ eur: EUR, table: null, currency: 'eur' }).fellBack).toBe(false)
  })

  it('une table absente n’empêche pas de vendre en euros', () => {
    const result = priceInCurrency({ eur: EUR, currency: 'usd' })
    expect(result.currency).toBe('eur')
    expect(result.fellBack).toBe(true)
  })
})

describe('formatCurrencyAmount', () => {
  it('rend le MONTANT juste, quelle que soit la langue de lecture', () => {
    // Le symbole et le séparateur suivent la langue ; le nombre, jamais.
    expect(formatCurrencyAmount(11900, 'usd', 'en-US')).toContain('119')
    expect(formatCurrencyAmount(11900, 'usd', 'fr-FR')).toContain('119')
    expect(formatCurrencyAmount(12950, 'gbp', 'en-GB')).toContain('129.50')
  })

  it('n’affiche pas de décimales inutiles sur un prix rond', () => {
    expect(formatCurrencyAmount(11900, 'eur', 'fr-FR')).not.toContain(',00')
  })
})

describe('sanitizeCurrencyPrices', () => {
  it('garde un prix bien formé', () => {
    expect(sanitizeCurrencyPrices({ usd: { priceCents: 12900, extraSeatPriceCents: 3200 } })).toEqual({
      usd: { priceCents: 12900, extraSeatPriceCents: 3200 },
    })
  })

  it('jette une devise inconnue plutôt que de créer un tarif fantôme', () => {
    expect(sanitizeCurrencyPrices({ jpy: { priceCents: 100, extraSeatPriceCents: 100 } })).toEqual({})
  })

  it('ignore l’euro : il vit dans la colonne historique, pas dans la table', () => {
    expect(sanitizeCurrencyPrices({ eur: { priceCents: 999, extraSeatPriceCents: 99 } })).toEqual({})
  })

  it('refuse un montant non entier — Stripe prélève des unités entières', () => {
    expect(sanitizeCurrencyPrices({ usd: { priceCents: 129.5, extraSeatPriceCents: 32 } })).toEqual({})
  })

  it('refuse un montant négatif — ce serait un avoir, pas une vente', () => {
    expect(sanitizeCurrencyPrices({ usd: { priceCents: -100, extraSeatPriceCents: 32 } })).toEqual({})
  })

  it('accepte zéro : offrir un palier ou un siège est un geste commercial légitime', () => {
    expect(sanitizeCurrencyPrices({ usd: { priceCents: 0, extraSeatPriceCents: 0 } })).toEqual({
      usd: { priceCents: 0, extraSeatPriceCents: 0 },
    })
  })

  it('ne casse pas sur une valeur aberrante en base', () => {
    expect(sanitizeCurrencyPrices(null)).toEqual({})
    expect(sanitizeCurrencyPrices('usd')).toEqual({})
    expect(sanitizeCurrencyPrices([{ usd: 1 }])).toEqual({})
    expect(sanitizeCurrencyPrices({ usd: 'gratuit' })).toEqual({})
  })
})
