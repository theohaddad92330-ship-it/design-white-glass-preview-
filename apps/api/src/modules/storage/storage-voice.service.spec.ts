import { BadRequestException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StorageService } from './storage.service'

/**
 * #1939 — LE STOCKAGE DES MESSAGES VOCAUX.
 *
 * Deux gestes, et ils n'ont pas la même gravité :
 *
 *  1. **le dépôt** — un enregistrement se range sous SON domaine, avec des types
 *     audio SÉPARÉS et une échéance à 30 JOURS. Les pièces de l'entreprise ne
 *     gagnent aucun format sonore au passage ;
 *  2. **l'effacement immédiat** d'un compte (décision Louis du 12/09 : « tout
 *     effacer tout de suite »). C'est le geste dangereux : il efface, sans
 *     attendre l'échéance. Il ne doit pouvoir atteindre QUE le domaine vocal —
 *     un justificatif comptable (10 ans, L123-22) et une pièce d'affaire (5 ans,
 *     L110-4) portent des obligations de conservation légale.
 */
describe('#1939 — StorageService et les messages vocaux', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111'
  const OBJECT = '22222222-2222-4222-8222-222222222222'
  const USER = '33333333-3333-4333-8333-333333333333'
  const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]).toString('base64')

  function build(over: { voiceRows?: Array<{ id: string; object_path: string }>; storeAccepts?: boolean } = {}) {
    const order: string[] = []
    const client = {
      put: jest.fn().mockResolvedValue(undefined),
      signedUrl: jest.fn(),
      remove: jest.fn().mockImplementation(() => {
        order.push('remove')
        return Promise.resolve(over.storeAccepts ?? true)
      }),
    }
    const manager = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SUM(byte_size)')) return Promise.resolve([{ used: '0' }])
        if (sql.startsWith('INSERT INTO storage_objects')) {
          return Promise.resolve([{ id: OBJECT, created_at: new Date('2026-09-12T10:00:00.000Z') }])
        }
        if (sql.includes('SELECT id, object_path')) return Promise.resolve(over.voiceRows ?? [])
        if (sql.startsWith('DELETE')) order.push('delete')
        if (sql.startsWith('UPDATE')) order.push('update')
        return Promise.resolve([])
      }),
    }
    return { service: new StorageService({ manager } as never, client as never), client, manager, order }
  }

  const voiceDeposit = {
    workspaceId: WORKSPACE,
    domain: 'chat_voice_message' as const,
    fileName: 'message-vocal.webm',
    contentType: '',
    fileB64: WEBM,
    uploadedBy: USER,
    today: '2026-09-12',
  }

  describe('le dépôt', () => {
    it('range l’enregistrement sous le domaine vocal, en type AUDIO, à rendre 30 jours plus tard', async () => {
      const { service, client, manager } = build()
      const stored = await service.put(voiceDeposit)

      const [path, , contentType] = client.put.mock.calls[0] as [string, Buffer, string]
      expect(path.startsWith(`${WORKSPACE}/chat_voice_message/`)).toBe(true)
      expect(contentType).toBe('audio/webm')
      expect(stored.retentionUntil).toBe('2026-10-12')
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO storage_objects'),
        expect.arrayContaining([WORKSPACE, 'chat_voice_message', '2026-10-12', USER]),
      )
    })

    it('NON — un PDF ne se range pas comme message vocal', async () => {
      const { service, client } = build()
      await expect(service.put({ ...voiceDeposit, fileName: 'contrat.pdf' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(client.put).not.toHaveBeenCalled()
    })

    it('NON — un justificatif de note de frais n’accepte toujours pas un .webm', async () => {
      const { service, client } = build()
      await expect(service.put({ ...voiceDeposit, domain: 'expense_receipt' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(client.put).not.toHaveBeenCalled()
    })
  })

  describe('l’effacement IMMÉDIAT des messages vocaux d’une personne', () => {
    const rows = [
      { id: 'v-1', object_path: `${WORKSPACE}/chat_voice_message/v-1/message-vocal.webm` },
      { id: 'v-2', object_path: `${WORKSPACE}/chat_voice_message/v-2/message-vocal.mp4` },
    ]

    it('efface les OCTETS puis les LIGNES — de cette seule personne, et du seul domaine vocal', async () => {
      const { service, client, manager, order } = build({ voiceRows: rows })

      expect(await service.eraseVoiceMessagesUploadedBy(USER, '2026-09-13')).toEqual({ erased: 2, deferred: 0 })

      expect(order).toEqual(['remove', 'delete'])
      expect(client.remove).toHaveBeenCalledWith(rows.map(row => row.object_path))
      const [selectSql, selectParams] = manager.query.mock.calls[0] as [string, unknown[]]
      expect(selectSql).toContain("domain = 'chat_voice_message'")
      expect(selectSql).toContain('uploaded_by = $1')
      expect(selectParams).toEqual([USER])
    })

    it('NON — aucune de ses requêtes ne peut atteindre un justificatif ni une pièce d’affaire', async () => {
      const { service, manager } = build({ voiceRows: rows })
      await service.eraseVoiceMessagesUploadedBy(USER, '2026-09-13')

      const statements = manager.query.mock.calls.map(call => call[0] as string)
      expect(statements.length).toBeGreaterThanOrEqual(2)
      for (const sql of statements) {
        // Le domaine est ÉCRIT dans la requête, jamais passé en paramètre : aucun
        // appelant ne peut le changer.
        expect(sql).toContain("domain = 'chat_voice_message'")
        expect(sql).not.toContain('expense_receipt')
        expect(sql).not.toContain('need_document')
      }
      // Et la méthode ne PREND pas de domaine : personne ne peut lui en passer un.
      expect(service.eraseVoiceMessagesUploadedBy.length).toBe(2)
      const source = readFileSync(join(__dirname, 'storage.service.ts'), 'utf8')
      const method = source.slice(
        source.indexOf('async eraseVoiceMessagesUploadedBy('),
        source.indexOf('/** La lecture BORNÉE par l'),
      )
      expect(method.length).toBeGreaterThan(200)
      expect(method).not.toMatch(/domain\s*=\s*\$\d/)
    })

    it('ne touche à rien quand la personne n’a aucun message vocal — et ne prétend rien', async () => {
      const { service, client } = build({ voiceRows: [] })
      expect(await service.eraseVoiceMessagesUploadedBy(USER, '2026-09-13')).toEqual({ erased: 0, deferred: 0 })
      expect(client.remove).not.toHaveBeenCalled()
    })

    it('si le magasin refuse : les lignes RESTENT, passent échues, et la purge de la nuit les reprend', async () => {
      // Effacer les lignes après un refus du magasin laisserait des octets que
      // plus rien ne sait retrouver — une voix conservée pour toujours.
      const { service, manager, order } = build({ voiceRows: rows, storeAccepts: false })

      expect(await service.eraseVoiceMessagesUploadedBy(USER, '2026-09-13')).toEqual({ erased: 0, deferred: 2 })
      expect(order).toEqual(['remove', 'update'])
      const update = manager.query.mock.calls.find(call => (call[0] as string).startsWith('UPDATE')) as [
        string,
        unknown[],
      ]
      expect(update[0]).toContain('retention_until')
      expect(update[1]).toEqual([['v-1', 'v-2'], '2026-09-13'])
    })
  })
})
