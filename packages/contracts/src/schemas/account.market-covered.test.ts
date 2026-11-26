import { describe, expect, it } from 'vitest'
import { ACCOUNT_LIST_HEADLINE_FILTERS, accountListCountersSchema, accountListQuerySchema } from './account.js'

/**
 * #1575.1 — LE CINQUIÈME COMPTEUR, ET POURQUOI IL N'EST PAS UN `headline`.
 *
 * Les quatre chiffres du bandeau sont comptés par la MÊME requête que celle qui
 * liste (`headlineCounters`), et les trois qui se cliquent rejouent le prédicat
 * SQL qui les compte. « avec des parcours observés » ne partage NI cette source
 * NI ce mécanisme : sa valeur vient de `GET /accounts/market-memory-portfolio`,
 * et la couverture n'est pas une expression SQL — c'est l'arbitrage
 * `resolveMarketCompany`, en TypeScript, sur les tables d'un AUTRE module.
 *
 * Le ranger dans `ACCOUNT_LIST_HEADLINE_FILTERS` aurait donc menti deux fois :
 * en promettant un compteur de `accountListCountersSchema` qui n'existe pas, et
 * en promettant un prédicat SQL que `HEADLINE_FILTER_PREDICATE` ne peut pas
 * écrire. Il vit dans son propre axe, et ce fichier est ce qui l'y tient.
 */
describe('accountListQuerySchema.marketCovered (#1575.1)', () => {
  it('accepte « covered » — l’axe que le cinquième compteur pose', () => {
    expect(accountListQuerySchema.safeParse({ marketCovered: 'covered' }).success).toBe(true)
  })

  it('accepte « all » — l’idiome du dépôt pour « pas de filtre », comme status/lifecycle/gate', () => {
    expect(accountListQuerySchema.safeParse({ marketCovered: 'all' }).success).toBe(true)
  })

  it('absent = pas de filtre — le comportement d’avant ce chantier', () => {
    expect(accountListQuerySchema.safeParse({}).success).toBe(true)
  })

  it('rejette une valeur inventée plutôt que de filtrer sur un axe qu’on ne sait pas calculer', () => {
    expect(accountListQuerySchema.safeParse({ marketCovered: 'observed' }).success).toBe(false)
    expect(accountListQuerySchema.safeParse({ marketCovered: true }).success).toBe(false)
  })

  it('n’entre PAS dans les métriques décisionnelles : ni leur source, ni leur dénominateur', () => {
    expect([...ACCOUNT_LIST_HEADLINE_FILTERS]).not.toContain('marketCovered')
    expect(accountListQuerySchema.safeParse({ headline: 'marketCovered' }).success).toBe(false)
  })

  it('et n’est PAS un compteur de la liste : le chiffre vient de la mémoire marché', () => {
    expect(Object.keys(accountListCountersSchema.shape)).not.toContain('marketCovered')
  })
})
