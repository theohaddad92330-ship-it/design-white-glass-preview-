import { describe, expect, it } from 'vitest'
import {
  MEMORY_DECLARED_LAYERS,
  MEMORY_LAYERS,
  MEMORY_NEVER_STORED,
  isDeclaredMemoryLayer,
  memoryForgetAllResultSchema,
  memoryLedgerEntrySchema,
  memoryLedgerSchema,
  memoryLayerSchema,
} from './memory-ledger.js'

describe('registre de mémoire — le contrat de la règle de transparence (T6 §12.1)', () => {
  it('nomme les six couches réellement lues par le copilote, dans l’ordre d’affichage', () => {
    expect(MEMORY_LAYERS).toEqual(['facts', 'preferences', 'conversations', 'refusals', 'identity', 'workspace'])
  })

  it('ajoute les couches EN FIN — un enum livré n’insère jamais au milieu (GA-08)', () => {
    // Les quatre premières valeurs sont celles de la version livrée, dans leur
    // ordre d'origine. Une insertion au milieu changerait le rang de couches
    // déjà écrites dans des URL de suppression.
    expect(MEMORY_LAYERS.slice(0, 4)).toEqual(['facts', 'preferences', 'conversations', 'refusals'])
  })

  it('sépare ce qui s’OUBLIE de ce qui se CORRIGE là où c’est saisi', () => {
    expect(MEMORY_DECLARED_LAYERS).toEqual(['identity', 'workspace'])
    expect(isDeclaredMemoryLayer('identity')).toBe(true)
    expect(isDeclaredMemoryLayer('workspace')).toBe(true)
    expect(isDeclaredMemoryLayer('facts')).toBe(false)
    expect(isDeclaredMemoryLayer('preferences')).toBe(false)
    expect(isDeclaredMemoryLayer('conversations')).toBe(false)
    expect(isDeclaredMemoryLayer('refusals')).toBe(false)
    // Toute couche déclarée est une couche du registre — sinon l'écran
    // filtrerait sur un nom qui n'existe pas et n'exempterait rien.
    for (const layer of MEMORY_DECLARED_LAYERS) {
      expect(MEMORY_LAYERS).toContain(layer)
    }
  })

  it('« tout oublier » NOMME les couches qu’il n’a pas pu vider', () => {
    const parsed = memoryForgetAllResultSchema.parse({ forgotten: 3, failedLayers: ['refusals'] })
    expect(parsed.forgotten).toBe(3)
    // Sans cette liste, un effacement à moitié raté rendrait « 3 lignes
    // oubliées » et se lirait comme un succès complet.
    expect(parsed.failedLayers).toEqual(['refusals'])
    // Une couche DÉCLARÉE ne peut pas figurer dans un compte-rendu d'oubli :
    // « tout oublier » ne la vise pas.
    expect(memoryForgetAllResultSchema.safeParse({ forgotten: 0, failedLayers: ['identity'] }).success).toBe(false)
  })

  it('exige un TEXTE non vide sur chaque ligne — « en clair » est la règle', () => {
    const parsed = memoryLedgerEntrySchema.safeParse({
      id: 'f-1',
      layer: 'facts',
      text: '',
      recordedAt: '2026-08-29T10:00:00.000Z',
      accountId: null,
      detail: null,
      expiresAt: null,
    })
    expect(parsed.success).toBe(false)
  })

  it('accepte une ligne complète et refuse une couche inconnue', () => {
    expect(
      memoryLedgerEntrySchema.safeParse({
        id: 'f-1',
        layer: 'facts',
        text: 'Le DSI décide seul',
        recordedAt: '2026-08-29T10:00:00.000Z',
        accountId: null,
        detail: 'correction',
        expiresAt: null,
      }).success,
    ).toBe(true)
    expect(memoryLayerSchema.safeParse('mailbox').success).toBe(false)
  })

  it('distingue une couche VIDE d’une couche ILLISIBLE — « non mesuré » n’est jamais « 0 »', () => {
    const ledger = memoryLedgerSchema.parse({ entries: [], unreadableLayers: ['conversations'] })
    expect(ledger.entries).toEqual([])
    // Une couche illisible n'est pas une couche sans ligne : l'écran doit le
    // dire, pas afficher « aucune ligne ».
    expect(ledger.unreadableLayers).toEqual(['conversations'])
  })

  it('énumère ce que Laura ne mémorise jamais (T6 §12.2)', () => {
    expect(MEMORY_NEVER_STORED).toEqual([
      'messageBodies',
      'otherWorkspace',
      'colleagueOutOfScope',
      'deletedByUser',
      'accidentalSecret',
    ])
  })
})
