import { NotFoundException } from '@nestjs/common'
import type { TalentPage, TalentRow } from '@bellum/contracts'
import { TalentPhotoService } from './talent-photo.service'

function row(id: string): TalentRow {
  return {
    id,
    kind: 'consultant',
    fullName: `Talent ${id}`,
    title: null,
    seniority: 'inconnu',
    declaredAvailability: 'inconnu',
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: null,
    financeVisible: false,
    contractType: 'inconnu',
    engagementKind: 'inconnu',
    zones: [],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [],
    skillCount: 0,
    hasCv: false,
    workMode: null,
    updatedAt: new Date().toISOString(),
  }
}

function pageOf(ids: string[]): TalentPage {
  return { items: ids.map(row), total: ids.length, page: 1, limit: 25 }
}

describe('TalentPhotoService', () => {
  it('fusionne la photo trouvée en base sur la ligne correspondante', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'a', photo_url: 'https://example.test/a.jpg' }])
    const service = new TalentPhotoService({ manager: { query } } as never)

    const result = await service.attach('ws-1', pageOf(['a', 'b']))

    expect(result.items.find(item => item.id === 'a')?.photoUrl).toBe('https://example.test/a.jpg')
    // Aucune photo trouvée pour « b » → `null`, jamais une valeur devinée.
    expect(result.items.find(item => item.id === 'b')?.photoUrl).toBeNull()
  })

  it('ne réordonne rien et ne recompte rien — seule la clé photoUrl change', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new TalentPhotoService({ manager: { query } } as never)
    const original = pageOf(['a', 'b'])

    const result = await service.attach('ws-1', original)

    expect(result.total).toBe(original.total)
    expect(result.items.map(item => item.id)).toEqual(original.items.map(item => item.id))
  })

  it('court-circuite sur une page vide — aucune requête inutile', async () => {
    const query = jest.fn()
    const service = new TalentPhotoService({ manager: { query } } as never)

    const result = await service.attach('ws-1', pageOf([]))

    expect(query).not.toHaveBeenCalled()
    expect(result.items).toEqual([])
  })
})

describe('TalentPhotoService.setPhoto — le SEUL chemin qui pose/retire une photo (31/08/2026)', () => {
  it('écrit la photo, SCOPÉE à l’espace de l’appelant', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'a' }])
    const service = new TalentPhotoService({ manager: { query } } as never)

    const result = await service.setPhoto('a', 'ws-1', 'data:image/png;base64,AAAA')

    expect(result).toEqual({ photoUrl: 'data:image/png;base64,AAAA' })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE consultants SET photo_url'), [
      'a',
      'ws-1',
      'data:image/png;base64,AAAA',
    ])
  })

  it('retire la photo avec `null` — un geste EXPLICITE, pas un défaut', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'a' }])
    const service = new TalentPhotoService({ manager: { query } } as never)

    const result = await service.setPhoto('a', 'ws-1', null)

    expect(result).toEqual({ photoUrl: null })
  })

  it('404 sur un talent d’un AUTRE espace — jamais d’écriture à l’aveugle', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new TalentPhotoService({ manager: { query } } as never)

    await expect(service.setPhoto('a', 'ws-2', 'data:image/png;base64,AAAA')).rejects.toBeInstanceOf(NotFoundException)
  })
})
