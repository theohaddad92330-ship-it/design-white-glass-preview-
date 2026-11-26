import { describe, expect, it } from 'vitest'
import {
  LEGAL_CONTRACT_UPLOAD_LINK_TTL_DAYS,
  createLegalContractUploadLinkSchema,
  depositLegalContractUploadSchema,
  legalContractUploadLinkExpiresAt,
  legalContractUploadLinkIsUsable,
  legalContractUploadLinkPublicStatusSchema,
} from './legal-contract-upload-link.js'

describe('legalContractUploadLinkExpiresAt — #2422.6, sept jours', () => {
  it('ajoute exactement sept jours à la création', () => {
    const createdAt = new Date('2026-10-07T10:00:00.000Z')
    expect(legalContractUploadLinkExpiresAt(createdAt).toISOString()).toBe('2026-10-14T10:00:00.000Z')
    expect(LEGAL_CONTRACT_UPLOAD_LINK_TTL_DAYS).toBe(7)
  })
})

describe('legalContractUploadLinkIsUsable — le lien sait dire NON', () => {
  const createdAt = new Date('2026-10-07T10:00:00.000Z')
  const expiresAt = legalContractUploadLinkExpiresAt(createdAt).toISOString()

  it('un lien NEUF, jamais révoqué, avant son échéance : usable', () => {
    const now = new Date('2026-10-08T10:00:00.000Z')
    expect(legalContractUploadLinkIsUsable({ expiresAt, revokedAt: null }, now)).toBe(true)
  })

  it('un jeton EXPIRÉ est refusé, même jamais révoqué', () => {
    const now = new Date('2026-10-15T00:00:00.000Z')
    expect(legalContractUploadLinkIsUsable({ expiresAt, revokedAt: null }, now)).toBe(false)
  })

  it('un jeton RÉVOQUÉ est refusé, même avant son échéance', () => {
    const now = new Date('2026-10-08T10:00:00.000Z')
    const revokedAt = new Date('2026-10-08T09:00:00.000Z').toISOString()
    expect(legalContractUploadLinkIsUsable({ expiresAt, revokedAt }, now)).toBe(false)
  })

  it('à l’instant exact de l’échéance, le lien n’est plus usable (strictement AVANT)', () => {
    const now = new Date(expiresAt)
    expect(legalContractUploadLinkIsUsable({ expiresAt, revokedAt: null }, now)).toBe(false)
  })
})

describe('createLegalContractUploadLinkSchema — une MISSION, rien de plus', () => {
  it('accepte un missionId seul', () => {
    expect(
      createLegalContractUploadLinkSchema.safeParse({ missionId: '3fe1b9b0-0000-4000-8000-000000000000' }).success,
    ).toBe(true)
  })

  it('refuse un contractId/workspaceId glissé dans le corps — `.strict()`', () => {
    expect(
      createLegalContractUploadLinkSchema.safeParse({
        missionId: '3fe1b9b0-0000-4000-8000-000000000000',
        contractId: '3fe1b9b0-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false)
  })

  it('refuse un missionId absent', () => {
    expect(createLegalContractUploadLinkSchema.safeParse({}).success).toBe(false)
  })
})

describe('depositLegalContractUploadSchema — AUCUN champ ne nomme un contrat ou une mission', () => {
  it('accepte le fichier seul (fileName/contentType/fileB64)', () => {
    expect(
      depositLegalContractUploadSchema.safeParse({ fileName: 'piece.pdf', contentType: '', fileB64: 'QQ==' }).success,
    ).toBe(true)
  })

  it('refuse un missionId/contractId/workspaceId glissé dans le corps — `.strict()`', () => {
    expect(
      depositLegalContractUploadSchema.safeParse({
        fileName: 'piece.pdf',
        contentType: '',
        fileB64: 'QQ==',
        missionId: '3fe1b9b0-0000-4000-8000-000000000000',
      }).success,
    ).toBe(false)
  })
})

describe('legalContractUploadLinkPublicStatusSchema — jamais le journal, jamais le tarif', () => {
  it('un statut `valid` porte les libellés et les bornes de dépôt, rien d’autre', () => {
    const parsed = legalContractUploadLinkPublicStatusSchema.safeParse({
      status: 'valid',
      contractLabel: 'Contrat-cadre BlaBlaCar',
      missionLabel: 'Mission Paris',
      accountName: 'BlaBlaCar',
      acceptedExtensions: '.pdf,.png',
      maxBytes: 1_000_000,
    })
    expect(parsed.success).toBe(true)
  })

  it('un statut refusé (expiré/révoqué/introuvable) ne porte AUCUN champ de plus', () => {
    for (const status of ['expired', 'revoked', 'not_found'] as const) {
      expect(legalContractUploadLinkPublicStatusSchema.safeParse({ status }).success).toBe(true)
      expect(legalContractUploadLinkPublicStatusSchema.safeParse({ status, contractLabel: 'fuite' }).success).toBe(
        false,
      )
    }
  })
})
