import 'reflect-metadata'
import type { RfpImportPreview, SaveRfpImportSession } from '@bellum/contracts'
import type { RfpImportSessionEntity } from '../../database/entities/rfp-import-session.entity'
import { createMockRepository } from '../../database/test-utils'
import { RfpImportSessionService } from './rfp-import-session.service'

// #2957 (#2180.53) — un import qui survit à une interruption.

const USER = 'user-1'
const WS = 'ws-1'
const PREVIEW = { draft: { title: 'AO cloud' } } as unknown as RfpImportPreview

function body(overrides: Partial<SaveRfpImportSession> = {}): SaveRfpImportSession {
  return { title: 'AO cloud', pastedText: null, documentNames: ['cctp.pdf'], preview: PREVIEW, ...overrides }
}

function build() {
  const sessions = createMockRepository<RfpImportSessionEntity>()
  sessions.save.mockImplementation(async (entity: Partial<RfpImportSessionEntity>) => ({
    id: 'session-1',
    updated_at: new Date('2026-09-30T20:00:00Z'),
    ...entity,
  }))
  const service = new RfpImportSessionService(sessions as never)
  return { service, sessions }
}

describe('RfpImportSessionService', () => {
  it('crée la session en cours, bornée à l’espace ET à la personne', async () => {
    const { service, sessions } = build()
    sessions.findOne.mockResolvedValue(null)
    const saved = await service.save(WS, USER, body())
    expect(sessions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        user_id: USER,
        status: 'in_progress',
        document_names: ['cctp.pdf'],
      }),
    )
    expect(saved.status).toBe('in_progress')
  })

  it('#2957 — garde les ENTRÉES avant que l’analyse rende : aperçu null, jamais inventé', async () => {
    const { service, sessions } = build()
    sessions.findOne.mockResolvedValue(null)
    sessions.save.mockImplementation(async (entity: Partial<RfpImportSessionEntity>) => ({
      id: 'session-2',
      updated_at: new Date('2026-10-02T10:00:00Z'),
      ...entity,
    }))
    const saved = await service.save(WS, USER, body({ preview: null, pastedText: 'texte collé' }))
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({ preview: null, pasted_text: 'texte collé' }))
    expect(saved.preview).toBeNull()
  })

  it('met à jour LA session en cours au lieu d’en ouvrir une seconde', async () => {
    const { service, sessions } = build()
    sessions.findOne.mockResolvedValue({ id: 'session-9', status: 'in_progress' })
    await service.save(WS, USER, body({ title: 'AO cloud v2' }))
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-9', title: 'AO cloud v2' }))
  })

  it('reprendre rend la session en cours, ou null — jamais une session inventée', async () => {
    const { service, sessions } = build()
    sessions.findOne.mockResolvedValue(null)
    expect(await service.current(WS, USER)).toBeNull()
    expect(sessions.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: 'ws-1', user_id: USER, status: 'in_progress' } }),
    )
  })

  it('annuler ARCHIVE la session (cancelled), ne la supprime pas', async () => {
    const { service, sessions } = build()
    sessions.findOne.mockResolvedValue({ id: 'session-1', status: 'in_progress' })
    await service.close(WS, USER, 'cancelled')
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-1', status: 'cancelled' }))
    expect(sessions.delete).not.toHaveBeenCalled()
  })

  it('fermer sans session en cours est sans effet (confirmer un import direct)', async () => {
    const { service, sessions } = build()
    sessions.findOne.mockResolvedValue(null)
    await service.close(WS, USER, 'confirmed')
    expect(sessions.save).not.toHaveBeenCalled()
  })
})
