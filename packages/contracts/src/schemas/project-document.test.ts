import { describe, expect, it } from 'vitest'
import {
  createProjectDocumentSchema,
  projectDocumentSchema,
  projectDocumentsResponseSchema,
  PROJECT_DOCUMENT_KINDS,
  PROJECT_DOCUMENT_STATUSES,
} from './project-document.js'

const DOC = {
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  kind: 'quote' as const,
  name: 'Devis_ClientDior_20052026.pdf',
  status: 'sent' as const,
  createdAt: '2026-05-20T09:00:00.000Z',
  updatedAt: '2026-05-20T09:00:00.000Z',
}

describe('projectDocumentSchema', () => {
  it('accepte un document valide', () => {
    expect(projectDocumentSchema.parse(DOC)).toEqual(DOC)
  })

  it('refuse un statut hors de la liste FERMÉE', () => {
    expect(() => projectDocumentSchema.parse({ ...DOC, status: 'gagné' })).toThrow()
  })

  it('refuse une nature hors de la liste FERMÉE', () => {
    expect(() => projectDocumentSchema.parse({ ...DOC, kind: 'facture' })).toThrow()
  })

  it('les mêmes natures et statuts que le besoin (need-document.ts)', () => {
    expect(PROJECT_DOCUMENT_KINDS).toEqual(['quote', 'nda', 'master_agreement', 'other'])
    expect(PROJECT_DOCUMENT_STATUSES).toEqual(['draft', 'sent', 'pending', 'signed', 'refused'])
  })
})

describe('projectDocumentsResponseSchema', () => {
  it('accepte une liste vide — une opportunité sans document n’est pas une erreur', () => {
    expect(projectDocumentsResponseSchema.parse({ items: [] })).toEqual({ items: [] })
  })
})

describe('createProjectDocumentSchema', () => {
  it('exige un nom — aucun fichier pour y retomber, contrairement au besoin', () => {
    expect(() => createProjectDocumentSchema.parse({ kind: 'quote', name: '' })).toThrow()
  })

  it('accepte kind + name', () => {
    expect(createProjectDocumentSchema.parse({ kind: 'nda', name: 'NDA_BellumAI.pdf' })).toEqual({
      kind: 'nda',
      name: 'NDA_BellumAI.pdf',
    })
  })
})
