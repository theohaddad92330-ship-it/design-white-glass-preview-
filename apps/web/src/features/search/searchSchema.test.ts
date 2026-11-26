import { describe, expect, it } from 'vitest'
import { analysisContextFromSearch } from '@bellum/contracts'
import { searchSchema } from '@/routes/search/index'

/**
 * Propagation suggestion → analyse (Théo P0 §5). The search route must carry a
 * suggestion's origin (`suggestionId` + `suggestionReason`) alongside the
 * editable draft (`company` + `scope`), and degrade gracefully on a
 * shared/legacy URL rather than throwing (`.optional().catch(undefined)`).
 */
describe('searchSchema', () => {
  it('parses the full suggestion-origin draft (company + scope + suggestion)', () => {
    const parsed = searchSchema.parse({
      company: 'Société Générale',
      scope: 'france',
      suggestionId: 'societe-generale--banque',
      suggestionReason: 'Grand compte bancaire aligné sur ton expertise data',
    })
    expect(parsed).toEqual({
      company: 'Société Générale',
      scope: 'france',
      suggestionId: 'societe-generale--banque',
      suggestionReason: 'Grand compte bancaire aligné sur ton expertise data',
    })
  })

  it('leaves suggestion fields undefined for a plain free-search URL', () => {
    const parsed = searchSchema.parse({ company: 'Acme' })
    expect(parsed.suggestionId).toBeUndefined()
    expect(parsed.suggestionReason).toBeUndefined()
  })

  it('catches a non-string suggestionId to undefined instead of throwing', () => {
    // A malformed shared URL (e.g. ?suggestionId[]=x) must not crash the route.
    const parsed = searchSchema.parse({ company: 'Acme', suggestionId: { nope: 1 } })
    expect(parsed.suggestionId).toBeUndefined()
    expect(parsed.company).toBe('Acme')
  })

  // #3819 (lot RBB) — les critères Découvrir voyagent dans l'URL du brouillon.
  it('carries suggestionCriteria, and catches a malformed one to undefined', () => {
    const parsed = searchSchema.parse({ company: 'Axa', suggestionCriteria: { zone: 'Paris', signals: ['hiring'] } })
    expect(parsed.suggestionCriteria).toEqual({ zone: 'Paris', signals: ['hiring'] })
    expect(searchSchema.parse({ company: 'Axa', suggestionCriteria: { score: 90 } }).suggestionCriteria).toBeUndefined()
  })

  it('round-trips: parse(parse(x)) is stable for a suggestion draft', () => {
    const input = {
      company: 'Société Générale',
      suggestionId: 'societe-generale--banque',
      suggestionReason: 'raison',
    }
    const once = searchSchema.parse(input)
    const twice = searchSchema.parse(once)
    expect(twice).toEqual(once)
  })

  it('#2162.27 — garde un preset structuré, y compris une valeur que le routeur a lue en nombre', () => {
    const parsed = searchSchema.parse({ preset: 'strategic', potentialVolume: 500, closingHorizon: 'T2 2027' })
    expect(parsed).toMatchObject({ preset: 'strategic', potentialVolume: '500', closingHorizon: 'T2 2027' })
    // NON : une forme illisible tombe, la route ne casse pas.
    expect(searchSchema.parse({ preset: 'signal', source: { nope: 1 } }).source).toBeUndefined()
  })

  // #4432.5 — la forme répétée ET la forme à virgules donnent la même liste de régions.
  it('zone_regions : tableau ou texte à virgules, même liste', () => {
    expect(searchSchema.parse({ zone_regions: ['Nouvelle-Aquitaine', 'Occitanie'] }).zone_regions).toEqual([
      'Nouvelle-Aquitaine',
      'Occitanie',
    ])
    expect(searchSchema.parse({ zone_regions: 'Nouvelle-Aquitaine, Occitanie' }).zone_regions).toEqual([
      'Nouvelle-Aquitaine',
      'Occitanie',
    ])
    expect(searchSchema.parse({ zone_regions: 42 }).zone_regions).toBeUndefined()
  })

  it('q préremplit comme company', () => {
    expect(searchSchema.parse({ q: 'Safran' }).q).toBe('Safran')
  })

  it('#4432.2 — `zone` (posé par Découvrir et les cartes de Laura) est gardé, jamais retiré en silence', () => {
    const parsed = searchSchema.parse({ zone: 'Occitanie', company: 'Dassault Aviation' })
    expect(parsed.zone).toBe('Occitanie')
    expect(searchSchema.parse({ zone: 42 }).zone).toBeUndefined()
  })
})

/**
 * #5027.2 — le profil demandé à l'accueil (« Product Owner ») arrive en preset
 * STRUCTURÉ `push-offer` / `offer`, validé par le schéma de route puis par le
 * contrat (`analysisContextFromSearch`) — jamais injecté brut.
 */
describe('searchSchema — #5027.2 le profil demandé', () => {
  it('reprend le profil comme offre à pousser, prérempli et éditable', () => {
    const parsed = searchSchema.parse({ q: 'EDF', preset: 'push-offer', offer: 'Product Owner' })
    expect(analysisContextFromSearch(parsed)).toEqual({ preset: 'push-offer', offer: 'Product Owner' })
  })

  it('un preset inconnu ne pose rien', () => {
    const parsed = searchSchema.parse({ q: 'EDF', preset: 'injection', offer: 'Product Owner' })
    expect(analysisContextFromSearch(parsed)).toBeNull()
  })
})
