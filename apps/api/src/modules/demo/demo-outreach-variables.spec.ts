import { seatName } from './demo-seat-names'
/**
 * #3419.1 — les variables semées sur la carte de démo respectent le contrat de
 * l'annotation (cinq attributs, listes fermées) et montrent les DEUX états : un
 * fait établi et un fait à confirmer dont l'usage externe n'est pas établi.
 */
import {
  documentSourceTitles,
  marketMemorySourceRef,
  marketMemorySourcedVariables,
  OUTREACH_MARKET_MEMORY_SOURCE_PREFIX,
  setOutreachMessageVariableRequestSchema,
} from '@bellum/contracts'
import { DEMO_OUTREACH_MESSAGES, DEMO_RAG_DOCUMENTS } from './demo-dataset'

const seeded = DEMO_OUTREACH_MESSAGES.flatMap(entry => entry.variables ?? [])

describe('démo — variables de message (#3419.1)', () => {
  it('chaque variable semée parse le contrat', () => {
    expect(seeded.length).toBeGreaterThan(0)
    for (const variable of seeded)
      expect(setOutreachMessageVariableRequestSchema.safeParse(variable).success).toBe(true)
  })

  it('montre un fait établi ET un fait à confirmer (« non établi » n’est pas « autorisé »)', () => {
    expect(seeded.some(v => v.external_use === 'allowed' && v.confidence === 'confirmed')).toBe(true)
    expect(seeded.some(v => v.external_use === 'unknown' && v.confidence === 'unverified')).toBe(true)
  })

  it('ne porte les variables que sur une carte à relire', () => {
    for (const entry of DEMO_OUTREACH_MESSAGES.filter(e => (e.variables ?? []).length > 0)) {
      expect(entry.status).toBe('needs_review')
    }
  })
})

// #3419 (recette démo 10/10) — l'onglet « Bloqués » s'ouvre sur les cartes SNCF : 6/6 y disaient
// « Aucune variable annotée ». Les deux cartes bloquées du siège SNCF portent au moins une variable
// (valeur · source · confiance), non établie — ce que dit justement leur motif.
describe('démo — les cartes bloquées SNCF portent leurs variables (#3419)', () => {
  const sncfSeat = DEMO_OUTREACH_MESSAGES.filter(
    entry =>
      entry.contact === seatName('Directeur technique — entité numérique voyageurs') && entry.status === 'needs_review',
  )

  it('chaque carte à relire du siège SNCF porte une variable à confirmer, jamais « autorisée » sans preuve', () => {
    expect(sncfSeat.length).toBeGreaterThanOrEqual(2)
    for (const entry of sncfSeat) {
      expect((entry.variables ?? []).length).toBeGreaterThan(0)
      for (const variable of entry.variables ?? []) {
        expect(setOutreachMessageVariableRequestSchema.safeParse(variable).success).toBe(true)
        expect(variable.external_use).not.toBe('allowed')
      }
    }
  })
})

// #3752.7 — parité démo : un message de la salle montre sa SOURCE DOCUMENTAIRE, un
// document réellement semé dans la base de l'espace (jamais un titre inventé).
describe('démo — source documentaire d’un message (#3752.7)', () => {
  it('au moins une variable cite un document de la base de l’espace semée en démo', () => {
    const titles = DEMO_RAG_DOCUMENTS.map(doc => doc.title)
    const documentSourced = seeded.filter(v => titles.some(title => v.source.includes(title)))
    expect(documentSourced.length).toBeGreaterThan(0)
    for (const variable of documentSourced) {
      expect(variable.confidence).toBe('confirmed')
      expect(variable.external_use).toBe('allowed')
    }
  })

  // L'écran des approbations lit ce même champ (`documentSourceTitles`) : « Source : <titre> » s'y affiche
  // pour un message de la salle, et le titre est celui d'un document réellement semé.
  it('l’écran des approbations en tire « Source : <titre> », un titre de DEMO_RAG_DOCUMENTS', () => {
    const shown = documentSourceTitles(seeded)
    expect(shown.length).toBeGreaterThan(0)
    const titles = DEMO_RAG_DOCUMENTS.map(doc => doc.title)
    for (const title of shown) expect(titles).toContain(title)
  })
})

// #2877 / #3419.4 — parité démo : un message de la salle montre un extrait de
// mémoire marché cité, et cette variable n'est JAMAIS autorisée à l'usage
// externe (le NO-GO : la mémoire marché, seule, ne lave jamais une variable).
describe('démo — source mémoire marché d’un message (#2877 / #3419.4)', () => {
  it('au moins une variable cite un extrait de mémoire marché, jamais autorisée à l’usage externe', () => {
    const marketMemorySourced = seeded.filter(v => v.source.startsWith('Mémoire marché : '))
    expect(marketMemorySourced.length).toBeGreaterThan(0)
    for (const variable of marketMemorySourced) {
      expect(variable.external_use).not.toBe('allowed')
    }
  })

  // Décision Louis 17/10 (#4074) : le préfixe « Mémoire marché : » reste en DONNÉE (il sert de discriminant),
  // mais l'écran des approbations ne l'affiche JAMAIS — il lit `marketMemorySourceRef` (la référence
  // seule) et dit la nature de la source. Ce test dit NON si ce que l'écran en tire porte le préfixe.
  it('l’écran des approbations en tire la référence SEULE, jamais le préfixe « Mémoire marché : »', () => {
    const shown = marketMemorySourcedVariables(seeded)
    expect(shown.length).toBeGreaterThan(0)
    for (const extrait of shown) {
      expect(extrait).not.toContain('Mémoire marché')
      expect(extrait.startsWith(OUTREACH_MARKET_MEMORY_SOURCE_PREFIX)).toBe(false)
    }
    // Le préfixe reste en donnée, et la référence seule s'en tire.
    for (const variable of seeded.filter(v => v.source.startsWith(OUTREACH_MARKET_MEMORY_SOURCE_PREFIX)))
      expect(marketMemorySourceRef(variable.source)).not.toBeNull()
  })
})
