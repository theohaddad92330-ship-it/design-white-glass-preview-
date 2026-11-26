import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PUBLIC_PLAN_ORDER, SHIPPED_PLAN_CODES, SHIPPED_PLAN_GRID } from './shipped-plan-grid.js'

/**
 * Le site marketing ne dépend pas de `@bellum/contracts` (il est déployé seul,
 * sur Vercel, avec son propre build). Ses prix sont donc des CHAÎNES dans ses
 * catalogues i18n — un quatrième exemplaire des mêmes chiffres.
 *
 * Ne pouvant pas l'importer, on le relit : ce test échoue dès qu'une carte du
 * site annonce un prix que le produit n'embarque pas. C'est la seule chose qui
 * empêche la landing de vendre 199 € ce que Stripe facture 259 €.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const messagesDir = join(repoRoot, 'apps', 'website', 'messages')

/** `"119 €"`, `"€119"`, `"€ 119"` → `119`. Les quatre locales ne posent pas le
 *  signe au même endroit ; seul le nombre nous intéresse. */
function euros(price: string): number {
  const digits = price.replace(/[^\d]/g, '')
  return Number(digits)
}

describe('grille embarquée — parité avec le site marketing', () => {
  const locales = existsSync(messagesDir)
    ? readdirSync(messagesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    : []

  it('trouve les catalogues du site (sinon le garde ne garde rien)', () => {
    expect(locales.length).toBeGreaterThan(0)
  })

  it.each(locales)('locale %s : les cartes affichent les prix mensuels embarqués', locale => {
    const file = join(messagesDir, locale, 'pricing.json')
    const catalog = JSON.parse(readFileSync(file, 'utf8')) as {
      plans?: { items?: { name: string; price: { monthly: string; annual: string } }[] }
    }
    const items = catalog.plans?.items ?? []

    expect(items).toHaveLength(PUBLIC_PLAN_ORDER.length)
    items.forEach((item, index) => {
      const plan = SHIPPED_PLAN_GRID[PUBLIC_PLAN_ORDER[index]!]!
      expect({ name: item.name, monthly: euros(item.price.monthly) }).toEqual({
        name: plan.label,
        monthly: plan.priceCents / 100,
      })
    })
  })

  it.each(locales)('locale %s : la carte gratuite ne promet ni prix ni palier', locale => {
    // « Free » n'est pas un abonnement à 0 € : c'est la démonstration publique.
    // Si un jour quelqu'un lui met un montant, c'est qu'il a inventé un palier
    // que ni le catalogue ni Stripe ne connaissent.
    const file = join(messagesDir, locale, 'pricing.json')
    const catalog = JSON.parse(readFileSync(file, 'utf8')) as {
      plans?: { free?: { price?: string; cta?: string; features?: string[] } }
    }
    const free = catalog.plans?.free

    expect(free).toBeDefined()
    expect(euros(free!.price!)).toBe(0)
    expect(free!.cta?.length).toBeGreaterThan(0)
    expect(free!.features?.length).toBeGreaterThan(0)
  })

  it.each(locales)('locale %s : la carte Team / Enterprise reste SANS chiffre', locale => {
    // « Sur devis » veut dire qu'aucun montant n'est engagé. Un « à partir de
    // 259 € » ici serait une promesse que personne n'a prise.
    const file = join(messagesDir, locale, 'pricing.json')
    const catalog = JSON.parse(readFileSync(file, 'utf8')) as {
      plans?: { enterprise?: { price?: string; cta?: string; features?: string[] } }
    }
    const enterprise = catalog.plans?.enterprise

    expect(enterprise).toBeDefined()
    expect(enterprise!.price).not.toMatch(/\d/)
    expect(enterprise!.features?.length).toBeGreaterThan(0)
  })

  it.each(locales)('locale %s : le prix annuel est bien le mensuel remisé de 20 %%', locale => {
    // −20 % annoncé sur les cartes ; la charge réelle est calculée côté serveur
    // (`cycleUnitAmountCents`). Un écart ici, c'est une promesse non tenue au
    // moment du paiement.
    const file = join(messagesDir, locale, 'pricing.json')
    const catalog = JSON.parse(readFileSync(file, 'utf8')) as {
      plans?: { items?: { price: { monthly: string; annual: string } }[] }
    }

    for (const item of catalog.plans?.items ?? []) {
      expect(euros(item.price.annual)).toBe(Math.round(euros(item.price.monthly) * 0.8))
    }
  })
})

describe('grille embarquée — cohérence interne', () => {
  it('ne laisse aucun palier public sans prix', () => {
    for (const code of PUBLIC_PLAN_ORDER) {
      expect(SHIPPED_PLAN_GRID[code].priceCents).toBeGreaterThan(0)
      expect(SHIPPED_PLAN_GRID[code].selfServe).toBe(true)
    }
  })

  it('range les paliers publics du moins cher au plus cher', () => {
    const prices = PUBLIC_PLAN_ORDER.map(code => SHIPPED_PLAN_GRID[code].priceCents)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
  })

  it('donne plus de crédits et plus de sièges à mesure qu’on monte', () => {
    const credits = PUBLIC_PLAN_ORDER.map(code => SHIPPED_PLAN_GRID[code].creditsPerCycle)
    const seats = PUBLIC_PLAN_ORDER.map(code => SHIPPED_PLAN_GRID[code].seats)
    expect([...credits].sort((a, b) => a - b)).toEqual(credits)
    expect([...seats].sort((a, b) => a - b)).toEqual(seats)
  })
})

/**
 * Le seul essai est la DÉMONSTRATION (Louis, 02/09/2026).
 *
 * L'écran d'onboarding annonçait « plus d'entrée gratuite » depuis le 24/07
 * pendant que le trigger de signup posait 48 crédits sur chaque compte créé en
 * self-service, et qu'un bouton permettait de monter à 120. Ce garde tient le
 * fait, pas l'intention : un palier à prix nul ne porte aucun crédit.
 */
describe('grille embarquée — aucun palier gratuit ne porte de crédits', () => {
  const FREE_CODES = SHIPPED_PLAN_CODES.filter(code => SHIPPED_PLAN_GRID[code].priceCents === 0)

  it('trouve bien des paliers à prix nul (sinon le garde ne garde rien)', () => {
    expect(FREE_CODES.length).toBeGreaterThan(0)
  })

  it.each(FREE_CODES)('%s : prix nul, donc zéro crédit — on voit le produit en démonstration', code => {
    expect(SHIPPED_PLAN_GRID[code].creditsPerCycle).toBe(0)
  })

  it('et aucun d’eux n’est achetable en self-service', () => {
    for (const code of FREE_CODES) expect(SHIPPED_PLAN_GRID[code].selfServe).toBe(false)
  })
})

// décision Louis 13/09 batch 13 — plafond selon le plan
/**
 * Le plafond de demandes à Laura vit DANS la grille des plans, une valeur par
 * palier — plus un réglage unique pour tout le monde. Une valeur illisible est
 * lue par l'API comme « pas de plafond de plan » et retombe sur le plafond
 * opérateur (`CHAT_DAILY_MESSAGE_LIMIT`) : ce garde tient qu'aucune ligne
 * embarquée n'en arrive là.
 */
describe('grille embarquée — le plafond de Laura suit le plan', () => {
  it('lit un corpus non vide', () => {
    expect(SHIPPED_PLAN_CODES.length).toBeGreaterThanOrEqual(6)
  })

  it.each(SHIPPED_PLAN_CODES)('%s : un plafond de demandes entier et positif — jamais 0, jamais illimité', code => {
    const limit = SHIPPED_PLAN_GRID[code].chatDailyMessageLimit
    expect(Number.isInteger(limit)).toBe(true)
    expect(limit).toBeGreaterThan(0)
  })

  // #4016 L7 — décision Louis 11/10/2026 : le plan fait foi, et les paliers
  // « à fixer par Louis » reçoivent des valeurs GÉNÉREUSES (proposées, à
  // confirmer par lui). Growth garde la valeur que Louis a fixée le 15/09.
  it('Growth garde la valeur fixée par Louis (100)', () => {
    expect(SHIPPED_PLAN_GRID.growth.chatDailyMessageLimit).toBe(100)
  })

  it.each(SHIPPED_PLAN_CODES)('%s : jamais sous l’ancien plafond unique (50) — le plan ne bride plus', code => {
    expect(SHIPPED_PLAN_GRID[code].chatDailyMessageLimit).toBeGreaterThan(50)
  })

  it('les paliers d’équipe (Team, Bêta) laissent travailler toute une équipe : au moins le triple de l’ancien plafond', () => {
    expect(SHIPPED_PLAN_GRID.team.chatDailyMessageLimit).toBeGreaterThanOrEqual(150)
    expect(SHIPPED_PLAN_GRID.beta.chatDailyMessageLimit).toBeGreaterThanOrEqual(150)
  })
})
