import { describe, expect, it } from 'vitest'
import {
  RAG_CATEGORIES,
  RAG_DECAY_HORIZON_DAYS,
  RAG_DOCUMENT_SCOPES,
  RAG_PURGE_AFTER_MONTHS,
  decayedScore,
  ragDocumentScopeSchema,
  ragPurgeable,
  ragScopeUpdateInputSchema,
} from './rag.js'
import { ragZipIngestInputSchema } from './rag-zip-ingest.js'

describe('les catégories du magasin (M4)', () => {
  it('garde les trois historiques EN TÊTE et dans leur ordre', () => {
    // Permuter deux lignes ferait croire à un changement de priorité qui n'a
    // pas eu lieu — l'ordre est lu par un humain dans l'écran Connaissances.
    expect(RAG_CATEGORIES.slice(0, 3)).toEqual(['account_fact', 'sector_insight', 'winning_angle'])
  })

  it('en ajoute six, sans doublon', () => {
    expect(RAG_CATEGORIES).toHaveLength(9)
    expect(new Set(RAG_CATEGORIES).size).toBe(9)
  })
})

describe('decayedScore — la fraîcheur DANS le score (M1)', () => {
  it('ne touche pas un document d’aujourd’hui', () => {
    expect(decayedScore(0.8, 0)).toBeCloseTo(0.8)
  })

  it('fait passer le récent devant, à pertinence égale', () => {
    // Le test exact que le §41 demande.
    expect(decayedScore(0.8, 30)).toBeGreaterThan(decayedScore(0.8, 700))
  })

  it('retire la moitié au bout de deux ans, et pas davantage', () => {
    expect(decayedScore(1, RAG_DECAY_HORIZON_DAYS)).toBeCloseTo(0.5)
    // Un document de dix ans ne DISPARAÎT pas : il plafonne à la moitié.
    expect(decayedScore(1, 3650)).toBeCloseTo(0.5)
  })

  it('ne pénalise PAS une date absente ou illisible', () => {
    // L'absence de date n'est pas une preuve d'ancienneté : un document serait
    // relégué pour un défaut d'écriture qui n'est pas le sien.
    expect(decayedScore(0.9, null)).toBeCloseTo(0.9)
    expect(decayedScore(0.9, undefined)).toBeCloseTo(0.9)
    expect(decayedScore(0.9, Number.NaN)).toBeCloseTo(0.9)
    expect(decayedScore(0.9, -5)).toBeCloseTo(0.9)
  })
})

describe('ragPurgeable — ce qu’on a le droit d’effacer (M3)', () => {
  const old = RAG_PURGE_AFTER_MONTHS * 30 + 10

  it('efface un document distillé, jamais utilisé, plus vieux qu’un an', () => {
    expect(ragPurgeable([{ id: 'a', usedCount: 0, origin: 'distilled', ageDays: old }])).toEqual(['a'])
  })

  it('n’efface JAMAIS un document qui a servi une seule fois', () => {
    // La garde du §41. Il a prouvé sa valeur ; l'effacer parce qu'il n'a pas
    // reservi depuis un an détruirait la connaissance la plus rare.
    expect(ragPurgeable([{ id: 'a', usedCount: 1, origin: 'distilled', ageDays: old * 3 }])).toEqual([])
  })

  it('n’efface JAMAIS un document déposé par un humain', () => {
    // Personne ne peut le régénérer — il n'est sorti d'aucune analyse.
    expect(ragPurgeable([{ id: 'a', usedCount: 0, origin: 'uploaded', ageDays: old * 3 }])).toEqual([])
  })

  it('n’efface pas sur un âge inconnu', () => {
    expect(ragPurgeable([{ id: 'a', usedCount: 0, origin: 'distilled', ageDays: null }])).toEqual([])
  })

  it('épargne un document distillé encore jeune', () => {
    expect(ragPurgeable([{ id: 'a', usedCount: 0, origin: 'distilled', ageDays: 100 }])).toEqual([])
  })

  it('#2779 — n’efface JAMAIS un document de la base de connaissance durable, quel que soit son usage ou son âge', () => {
    expect(
      ragPurgeable([{ id: 'a', usedCount: 0, origin: 'distilled', ageDays: old, scope: 'knowledge_base' }]),
    ).toEqual([])
  })

  it('scope absent : comportement d’avant, au bit près', () => {
    expect(ragPurgeable([{ id: 'a', usedCount: 0, origin: 'distilled', ageDays: old }])).toEqual(['a'])
  })
})

describe('RAG_DOCUMENT_SCOPES — #1954.7 puis #2779, qui peut lire un document', () => {
  it('a les cinq portées de #1954, `workspace` en tête (le défaut, le comportement d’avant)', () => {
    // #2779 — « Cette conversation uniquement / Mon espace personnel / Toute
    // mon ESN / Un compte précis / Base de connaissance durable ».
    expect(RAG_DOCUMENT_SCOPES).toEqual(['workspace', 'conversation', 'personal', 'account', 'knowledge_base'])
  })

  it('accepte les cinq valeurs et rejette tout le reste', () => {
    for (const scope of RAG_DOCUMENT_SCOPES) expect(ragDocumentScopeSchema.safeParse(scope).success).toBe(true)
    expect(ragDocumentScopeSchema.safeParse('team').success).toBe(false)
    expect(ragDocumentScopeSchema.safeParse('').success).toBe(false)
  })
})

describe('ragScopeUpdateInputSchema — #2779, une portée ciblée exige sa cible', () => {
  const ACCOUNT = '11111111-1111-4111-8111-111111111111'

  it('refuse `account` sans `accountId`', () => {
    expect(ragScopeUpdateInputSchema.safeParse({ scope: 'account' }).success).toBe(false)
  })

  it('refuse un `accountId` qui n’est pas un identifiant de compte', () => {
    expect(ragScopeUpdateInputSchema.safeParse({ scope: 'account', accountId: 'acme' }).success).toBe(false)
  })

  it('accepte `account` avec son compte', () => {
    expect(ragScopeUpdateInputSchema.safeParse({ scope: 'account', accountId: ACCOUNT }).success).toBe(true)
  })

  it('accepte `personal` et `knowledge_base` sans cible', () => {
    expect(ragScopeUpdateInputSchema.safeParse({ scope: 'personal' }).success).toBe(true)
    expect(ragScopeUpdateInputSchema.safeParse({ scope: 'knowledge_base' }).success).toBe(true)
  })

  it('refuse toujours `conversation` sans fil', () => {
    expect(ragScopeUpdateInputSchema.safeParse({ scope: 'conversation' }).success).toBe(false)
  })
})

describe('ragZipIngestInputSchema — #2779, même garde que le dépôt unitaire', () => {
  it('refuse une archive `account` sans compte', () => {
    expect(ragZipIngestInputSchema.safeParse({ fileB64: 'x', filename: 'a.zip', scope: 'account' }).success).toBe(false)
  })
})
