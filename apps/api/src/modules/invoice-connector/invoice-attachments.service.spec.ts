import { NotFoundException } from '@nestjs/common'
import type { DataSource } from 'typeorm'
import { InvoiceAttachmentsService } from './invoice-attachments.service'

/**
 * #2814 — le LIEN des pièces jointes d'une facture PRÉPARÉE.
 *
 * Ce que ce fichier tient : chaque requête est BORNÉE par l'espace
 * (`workspace_id`), une mission ou une pièce d'un autre espace rend 404, et la
 * liste ne porte aucun chemin de magasin — seulement la porte de l'API.
 */

const WS = 'ws-1'
const OTHER_WS = 'ws-2'
const MISSION = '11111111-1111-4111-8111-111111111111'
const MONTH = '2026-09-01'
const OBJECT = '22222222-2222-4222-8222-222222222222'
const LINK = '33333333-3333-4333-8333-333333333333'

type Call = { sql: string; params: unknown[] }

function make(options: { missionIn?: string; linkRow?: boolean } = {}) {
  const calls: Call[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM missions')) return params[1] === (options.missionIn ?? WS) ? [{ id: MISSION }] : []
    if (sql.startsWith('INSERT INTO invoice_attachments')) return [{ id: LINK }]
    if (sql.includes('JOIN storage_objects')) {
      return [
        {
          id: LINK,
          file_name: 'BC.pdf',
          content_type: 'application/pdf',
          byte_size: '1200',
          retention_until: '2036-09-25',
          created_at: '2026-09-25T10:00:00.000Z',
          object_path: `${WS}/invoice_attachment/${OBJECT}/BC.pdf`,
        },
      ]
    }
    if (sql.includes('FROM invoice_attachments'))
      return options.linkRow === false ? [] : [{ storage_object_id: OBJECT }]
    return []
  })
  return { service: new InvoiceAttachmentsService({ query } as unknown as DataSource), calls }
}

const DOWNLOAD = `/delivery/invoice-attachments/${MISSION}/${MONTH}/${LINK}/download`

describe('InvoiceAttachmentsService (#2814)', () => {
  it('SAIT DIRE NON — une mission d’un AUTRE espace : 404', async () => {
    const { service } = make({ missionIn: OTHER_WS })
    await expect(service.assertMission(WS, MISSION)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.list(WS, MISSION, MONTH)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('écrit le lien borné par l’espace et rend la porte de l’API', async () => {
    const { service, calls } = make()
    const file = await service.link({
      workspaceId: WS,
      missionId: MISSION,
      periodMonth: MONTH,
      userId: 'u-1',
      stored: {
        id: OBJECT,
        fileName: 'BC.pdf',
        contentType: 'application/pdf',
        byteSize: 1200,
        retentionUntil: '2036-09-25',
        uploadedAt: '2026-09-25T10:00:00.000Z',
      },
    })
    const insert = calls.find(call => call.sql.startsWith('INSERT INTO invoice_attachments'))
    expect(insert?.params).toEqual([WS, MISSION, MONTH, OBJECT, 'BC.pdf', 'u-1'])
    expect(file).toMatchObject({ id: LINK, downloadPath: DOWNLOAD, byteSize: 1200 })
  })

  it('liste les pièces de CE mois, bornées par l’espace, sans aucun chemin de magasin', async () => {
    const { service, calls } = make()
    const files = await service.list(WS, MISSION, MONTH)
    const select = calls.find(call => call.sql.includes('JOIN storage_objects'))
    expect(select?.sql).toContain('ia.workspace_id = $1')
    expect(select?.sql).toContain('so.workspace_id = ia.workspace_id')
    expect(select?.params).toEqual([WS, MISSION, MONTH])
    expect(files).toEqual([
      {
        id: LINK,
        fileName: 'BC.pdf',
        contentType: 'application/pdf',
        byteSize: 1200,
        retentionUntil: '2036-09-25',
        uploadedAt: '2026-09-25T10:00:00.000Z',
        downloadPath: DOWNLOAD,
      },
    ])
    expect(JSON.stringify(files)).not.toContain('invoice_attachment/')
  })

  it('retrouve l’objet d’une pièce DANS l’espace, et 404 sinon', async () => {
    const { service, calls } = make()
    await expect(service.objectIdOf(WS, MISSION, MONTH, LINK)).resolves.toBe(OBJECT)
    const lookup = calls.find(call => call.sql.includes('SELECT storage_object_id'))
    expect(lookup?.sql).toContain('workspace_id = $1')
    expect(lookup?.params).toEqual([WS, MISSION, MONTH, LINK])
    const { service: empty } = make({ linkRow: false })
    await expect(empty.objectIdOf(WS, MISSION, MONTH, LINK)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('retire le lien, toujours borné par l’espace', async () => {
    const { service, calls } = make()
    await service.unlink(WS, LINK)
    const del = calls.find(call => call.sql.startsWith('DELETE FROM invoice_attachments'))
    expect(del?.sql).toContain('workspace_id = $2')
    expect(del?.params).toEqual([LINK, WS])
  })
})
