import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from '@bellum/contracts'

/**
 * GA-287 — CE QU'UN GESTE COÛTE NE S'ÉCRIT PAS À LA MAIN DANS UNE TRADUCTION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ, ET IL ÉTAIT SUR L'ÉCRAN DE FACTURATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `billing.json` annonçait, en toutes lettres et dans les deux langues :
 *
 *   « Une analyse complète coûte 8 crédits, un enrichissement de contact 1. »
 *
 * Les deux nombres étaient JUSTES le jour où ils ont été écrits, et c'est
 * précisément ce qui rend ce genre de ligne dangereux : elle ne se signale
 * jamais. Le jour où `CREDIT_WEIGHTS.account_analysis` bouge, l'écran de
 * facturation — celui qu'on ouvre pour savoir ce qu'on paie — continue
 * d'annoncer l'ancien prix, et l'écart se découvre au relevé.
 *
 * Le dépôt a déjà payé la version courte de cette faute le 04/08 : une note
 * annonçait « 1 crédit » pendant qu'un écran deux clics plus loin annonçait
 * « 8 » et débitait 8. La réponse, alors, fut `LaunchCostNote` — une annonce
 * qui vit à un seul endroit et LIT la grille. Cette garde étend la même règle
 * aux catalogues de traduction, où rien ne la tenait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VISE, ET CE QU'ELLE NE VISE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle cherche un NOMBRE collé au mot « crédit » dans un catalogue. Elle ne
 * vise donc pas :
 *  · `{{count}} crédits` — un pluriel i18next, dont le nombre vient du code ;
 *  · `{{price}}`, `{{included}}`, `{{topup}}` — les autres interpolations ;
 *  · « 0 crédit », qui n'est pas un prix lu dans la grille mais l'affirmation
 *    qu'un geste est INCLUS. C'est le sujet de ce lot, et le seul nombre qui
 *    ne se périme pas : une lecture ne redeviendra pas payante.
 */

const LOCALES = join(__dirname, '../i18n/locales')

/** Un nombre littéral collé au mot crédit — « 8 crédits », « 1 credit ». */
const HARDCODED_PRICE = /(\d+)\s+(crédits?|credits?)\b/gi

/**
 * Les nombres qu'on accepte de lire en clair devant « crédit ».
 *
 * `0` seulement : « 0 crédit » ne dit pas un PRIX, il dit qu'un geste est
 * inclus — et cette affirmation-là ne se périme pas avec la grille. Tout autre
 * nombre est un prix, et un prix se lit dans `CREDIT_WEIGHTS`.
 */
const ALLOWED_LITERALS = new Set(['0'])

function findHardcodedPrices(source: string): string[] {
  // ⚠️ `RegExp.test()` avec le drapeau `g` est STATEFUL (`lastIndex` persiste
  // entre deux appels) — le dépôt a déjà eu une garde borgne par ce chemin. On
  // n'utilise donc que `matchAll`, sur une expression reconstruite à chaque
  // appel.
  return [...source.matchAll(new RegExp(HARDCODED_PRICE))]
    .filter(match => !ALLOWED_LITERALS.has(match[1] as string))
    .map(match => match[0])
}

const BILLING_CATALOGS = ['fr', 'en'].map(locale => ({
  locale,
  source: readFileSync(join(LOCALES, locale, 'billing.json'), 'utf8'),
}))

const SEARCH_CATALOGS = ['fr', 'en'].map(locale => ({
  locale,
  source: readFileSync(join(LOCALES, locale, 'search.json'), 'utf8'),
}))

describe('GA-287 — le prix d’un geste vient de la grille, jamais d’une traduction', () => {
  it('LIT vraiment les catalogues, et ils ne sont pas vides', () => {
    // Preuve n°1 : un chemin faux rendrait cette garde verte en ne lisant rien.
    for (const { locale, source } of [...BILLING_CATALOGS, ...SEARCH_CATALOGS]) {
      expect(source.length, locale).toBeGreaterThan(500)
    }
    // #4463 — `search.json` ne dit plus « crédit » (garde `aucun-credit-visible`) : seule la
    // page Facturation, exemptée jusqu'au lot frère CR2, porte encore le mot.
    for (const { locale, source } of BILLING_CATALOGS) {
      expect(source.toLowerCase(), locale).toMatch(/cr[ée]dit/)
    }
  })

  it('sait dire NON — les trois graphies du défaut réel sont refusées', () => {
    // Preuve n°2, sur le texte EXACT qui vivait dans `billing.json`.
    expect(findHardcodedPrices('Une analyse complète coûte 8 crédits, un enrichissement de contact 1.')).toEqual([
      '8 crédits',
    ])
    expect(findHardcodedPrices('A full analysis costs 8 credits')).toEqual(['8 credits'])
    expect(findHardcodedPrices('Coût : 1 crédit par génération.')).toEqual(['1 crédit'])
  })

  it('n’attrape PAS ce qu’elle ne vise pas — quatre témoins', () => {
    // Preuve n°3. Un pluriel i18next, une autre interpolation, « 0 crédit »
    // (l'affirmation d'inclusion, sujet de ce lot), et une phrase sans nombre.
    expect(findHardcodedPrices('{{count}} crédits / mois')).toEqual([])
    expect(findHardcodedPrices('dont {{included}} de formule + {{topup}} en recharge')).toEqual([])
    expect(findHardcodedPrices('Mode démo · 0 crédit · résultat d’exemple')).toEqual([])
    expect(findHardcodedPrices('Les crédits suivent ton cycle de facturation.')).toEqual([])
  })

  it('la grille reste bien la source — les deux poids cités existent', () => {
    // Sans cette ligne, la garde protégerait une grille dont les clés auraient
    // pu disparaître : elle vérifierait une règle sans sujet.
    expect(CREDIT_WEIGHTS.account_analysis).toBeGreaterThan(0)
    expect(CREDIT_WEIGHTS.contact_enrichment).toBeGreaterThan(0)
  })

  it('AUCUN prix en crédits n’est écrit en dur dans billing.json ni search.json', () => {
    const offenders = [...BILLING_CATALOGS, ...SEARCH_CATALOGS].flatMap(({ locale, source }) =>
      findHardcodedPrices(source).map(hit => `${locale} — ${hit}`),
    )

    // ⚠️ Si cette liste cesse d'être vide : le nombre se passe en interpolation
    // depuis `creditCostOf(...)` / `CREDIT_WEIGHTS`, jamais écrit dans la clé.
    expect(offenders.sort()).toEqual([])
  })
})
