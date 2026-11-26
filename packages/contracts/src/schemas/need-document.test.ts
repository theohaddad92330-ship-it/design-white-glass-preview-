import { describe, expect, it } from 'vitest'
import {
  needDocumentSchema,
  needDocumentsResponseSchema,
  NEED_DOCUMENT_KINDS,
  NEED_DOCUMENT_STATUSES,
} from './need-document.js'

const DOC = {
  id: '11111111-1111-4111-8111-111111111111',
  needId: '22222222-2222-4222-8222-222222222222',
  kind: 'quote' as const,
  name: 'Devis_ClientDior_20052026.pdf',
  status: 'sent' as const,
  createdAt: '2026-05-20T09:00:00.000Z',
  updatedAt: '2026-05-20T09:00:00.000Z',
}

describe('needDocumentSchema', () => {
  it('accepte un document valide', () => {
    expect(needDocumentSchema.parse(DOC)).toEqual(DOC)
  })

  it('refuse un statut hors de la liste FERMÉE', () => {
    expect(() => needDocumentSchema.parse({ ...DOC, status: 'gagné' })).toThrow()
  })

  it('refuse une nature hors de la liste FERMÉE', () => {
    expect(() => needDocumentSchema.parse({ ...DOC, kind: 'facture' })).toThrow()
  })

  it('couvre les trois statuts vus sur la maquette — devis envoyé, NDA signée, contrat en attente', () => {
    for (const status of ['sent', 'signed', 'pending'] as const) {
      expect(NEED_DOCUMENT_STATUSES).toContain(status)
    }
  })

  it('couvre les trois natures de la fiche — devis, NDA, contrat cadre', () => {
    expect(NEED_DOCUMENT_KINDS).toEqual(['quote', 'nda', 'master_agreement', 'other'])
  })
})

describe('needDocumentsResponseSchema', () => {
  it('accepte une liste vide — un besoin sans document n’est pas une erreur', () => {
    expect(needDocumentsResponseSchema.parse({ items: [] })).toEqual({ items: [] })
  })
})
