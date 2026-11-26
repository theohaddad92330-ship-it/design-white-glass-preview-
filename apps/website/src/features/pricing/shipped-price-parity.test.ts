import { PUBLIC_PLAN_ORDER, SHIPPED_PLAN_CODES, SHIPPED_PLAN_GRID } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import type { LiveCatalogCopy } from './live-prices'
import { structuredDataEntryPrice } from './structured-data-price'

/**
 * LE PRIX QUE LE SITE AFFICHE SANS CATALOGUE LIVE EST CELUI DE LA GRILLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ VIT LE PRIX, ET POURQUOI PAS DANS LE CODE DU SITE
 * ─────────────────────────────────────────────────────────────────────────────
 * `packages/contracts/src/billing/shipped-plan-grid.ts` porte LA grille
 * embarquée : c'est la source unique de ce que le produit annonce quand le
 * catalogue éditable de l'opérateur ne répond pas. L'API et l'application la
 * lisent par import.
 *
 * Le site public, lui, ne dépend pas de ce paquet — c'est un Next.js de
 * marketing qu'on ne charge pas d'un paquet de schémas zod, et c'est une
 * décision écrite de longue date (`annual-discount-parity.test.ts`). Son prix
 * embarqué vit donc dans les catalogues de messages, à côté du reste de la
 * carte, dans les quatre langues — c'est LUI que le visiteur lit, et depuis ce
 * correctif c'est aussi lui que la donnée structurée publie.
 *
 * Deux endroits, donc, et c'est assumé. Ce qui n'est pas assumé, c'est qu'ils
 * puissent diverger en silence : cette garde LIT la grille et refuse l'écart.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE AURAIT VU
 * ─────────────────────────────────────────────────────────────────────────────
 * La page d'accueil publiait `?? '119'` dans `Offer.price` — le prix de
 * `starter`, retiré de la vente le 27/08. Le chiffre avait survécu à deux
 * refontes de grille parce que rien ne le regardait. Cette garde regarde, et
 * elle regarde le seul endroit qui reste : les cartes.
 */

/** Le catalogue live muet : ce que rend `fetchLiveCatalogCopy` quand l'API échoue. */
const CATALOG_DOWN: LiveCatalogCopy = {
  prices: [],
  seats: [],
  seatLabel: '—',
  seatUniform: true,
  entryPriceDigits: null,
}

/** Les langues servies par le site. */
const LOCALES = ['fr', 'en', 'de', 'nl'] as const

/** Le palier d'entrée de la grille embarquée — lu, jamais recopié. */
const ENTRY = SHIPPED_PLAN_GRID[PUBLIC_PLAN_ORDER[0]]

/** Son prix mensuel en euros, sous la forme que publie `Offer.price`. */
const ENTRY_PRICE_DIGITS = String(Math.round(ENTRY.priceCents / 100))

type HomeCatalog = { pricing: { plans: { name: string; price: string }[] } }
type PricingCatalog = { plans: { items: { name: string; price: { monthly: string } }[] } }

async function home(locale: string): Promise<HomeCatalog> {
  const loaded = (await import(`../../../messages/${locale}/home.json`)) as { default: HomeCatalog }
  return loaded.default
}

async function pricing(locale: string): Promise<PricingCatalog> {
  const loaded = (await import(`../../../messages/${locale}/pricing.json`)) as { default: PricingCatalog }
  return loaded.default
}

describe('le prix embarqué du site est celui de la grille du contrat', () => {
  it('lit une grille réelle — sans quoi la garde serait verte sur du vide', () => {
    // La leçon des six gardes borgnes : prouver qu'on LIT quelque chose.
    expect(SHIPPED_PLAN_CODES.length).toBeGreaterThan(3)
    expect(PUBLIC_PLAN_ORDER).toEqual(['growth'])
    expect(ENTRY.selfServe).toBe(true)
    expect(ENTRY.priceCents).toBeGreaterThan(0)
    // Un prix rond en euros : la grille ne porte pas de centimes, et la donnée
    // structurée n'en publierait pas correctement.
    expect(ENTRY.priceCents % 100).toBe(0)
  })

  it.each(LOCALES)('%s : la carte du palier d’entrée porte le prix de la grille', async locale => {
    const cards = (await home(locale)).pricing.plans
    expect(cards.length).toBeGreaterThan(0)
    // On passe par la fonction de PRODUCTION, pas par une lecture parallèle :
    // c'est le chemin exact qu'emprunte `Offer.price` quand l'API ne répond
    // pas. Une dérivation qui vit à deux endroits diverge.
    expect(structuredDataEntryPrice(CATALOG_DOWN, cards)).toBe(ENTRY_PRICE_DIGITS)
  })

  it.each(LOCALES)('%s : la page tarifs annonce le même montant que la page d’accueil', async locale => {
    const items = (await pricing(locale)).plans.items
    expect(items).toHaveLength(PUBLIC_PLAN_ORDER.length)
    const monthly = items.map(item => ({ name: item.name, price: item.price.monthly }))
    expect(structuredDataEntryPrice(CATALOG_DOWN, monthly)).toBe(ENTRY_PRICE_DIGITS)
  })

  it.each(LOCALES)('%s : aucune carte publique ne cite un palier retiré de la vente', async locale => {
    // `starter` (119 €) et `team` (259 €) ne sont plus achetables depuis le
    // 27/08 — `selfServe: false`. Une carte qui affiche encore leur montant
    // propose au visiteur une offre qu'aucun bouton ne peut acheter. C'est
    // exactement ce que la donnée structurée faisait.
    const retired = SHIPPED_PLAN_CODES.filter(code => !SHIPPED_PLAN_GRID[code].selfServe)
      .map(code => SHIPPED_PLAN_GRID[code].priceCents)
      .filter(cents => cents > 0)
      .map(cents => String(Math.round(cents / 100)))
    expect(retired.length).toBeGreaterThan(0)

    const shown = [
      ...(await home(locale)).pricing.plans.map(plan => plan.price),
      ...(await pricing(locale)).plans.items.map(item => item.price.monthly),
    ]
    expect(shown.length).toBeGreaterThan(0)

    const digits = shown.map(price => price.replace(/[^\d]/g, '')).filter(Boolean)
    expect(digits.filter(value => retired.includes(value))).toEqual([])
  })

  it('la garde sait dire NON — un catalogue qui aurait gardé l’ancien prix est vu', () => {
    // Preuve destructive, jouée sur une carte fabriquée : c'est littéralement
    // le catalogue d'avant le 27/08. Si la comparaison était molle, elle
    // passerait ici, et elle serait passée en production.
    const stale = [{ name: 'Growth', price: '119 €' }]
    expect(structuredDataEntryPrice(CATALOG_DOWN, stale)).not.toBe(ENTRY_PRICE_DIGITS)
    expect(structuredDataEntryPrice(CATALOG_DOWN, stale)).toBe('119')
  })
})
