import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StorageService } from './storage.service'

/**
 * #2876 (#2433.4) — L'EFFACEMENT IMMÉDIAT DES IMAGES DE CHAT D'UNE PERSONNE.
 *
 * Même geste que `eraseVoiceMessagesUploadedBy` (#1939.9), sur le domaine
 * `chat_image_attachment` — une image jointe au chat peut porter la donnée
 * personnelle d'un tiers, jamais une pièce de l'entreprise : elle part TOUT
 * DE SUITE à l'effacement d'un compte, sans attendre ses 30 jours. Test dupliqué
 * plutôt que généralisé (même raison que `storage-voice.service.spec.ts`) : le
 * domaine est ÉCRIT dans chaque requête, jamais reçu en paramètre.
 */
describe('#2876 (#2433.4) — StorageService et les images de chat', () => {
  const USER = '33333333-3333-4333-8333-333333333333'

  function build(over: { rows?: Array<{ id: string; object_path: string }>; storeAccepts?: boolean } = {}) {
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
        if (sql.includes('SELECT id, object_path')) return Promise.resolve(over.rows ?? [])
        if (sql.startsWith('DELETE')) order.push('delete')
        if (sql.startsWith('UPDATE')) order.push('update')
        return Promise.resolve([])
      }),
    }
    return { service: new StorageService({ manager } as never, client as never), client, manager, order }
  }

  const rows = [
    { id: 'i-1', object_path: 'ws-1/chat_image_attachment/i-1/capture.png' },
    { id: 'i-2', object_path: 'ws-1/chat_image_attachment/i-2/photo.jpg' },
  ]

  it('efface les OCTETS puis les LIGNES — de cette seule personne, et du seul domaine image de chat', async () => {
    const { service, client, manager, order } = build({ rows })

    expect(await service.eraseChatImageAttachmentsUploadedBy(USER, '2026-09-28')).toEqual({ erased: 2, deferred: 0 })

    expect(order).toEqual(['remove', 'delete'])
    expect(client.remove).toHaveBeenCalledWith(rows.map(row => row.object_path))
    const [selectSql, selectParams] = manager.query.mock.calls[0] as [string, unknown[]]
    expect(selectSql).toContain("domain = 'chat_image_attachment'")
    expect(selectSql).toContain('uploaded_by = $1')
    expect(selectParams).toEqual([USER])
  })

  it('NON — aucune de ses requêtes ne peut atteindre un justificatif ni une pièce d’affaire', async () => {
    const { service, manager } = build({ rows })
    await service.eraseChatImageAttachmentsUploadedBy(USER, '2026-09-28')

    const statements = manager.query.mock.calls.map(call => call[0] as string)
    expect(statements.length).toBeGreaterThanOrEqual(2)
    for (const sql of statements) {
      expect(sql).toContain("domain = 'chat_image_attachment'")
      expect(sql).not.toContain('expense_receipt')
      expect(sql).not.toContain('need_document')
    }
    expect(service.eraseChatImageAttachmentsUploadedBy.length).toBe(2)
    const source = readFileSync(join(__dirname, 'storage.service.ts'), 'utf8')
    const method = source.slice(
      source.indexOf('async eraseChatImageAttachmentsUploadedBy('),
      source.indexOf('/** La lecture BORNÉE par l'),
    )
    expect(method.length).toBeGreaterThan(200)
    expect(method).not.toMatch(/domain\s*=\s*\$\d/)
  })

  it('ne touche à rien quand la personne n’a aucune image de chat — et ne prétend rien', async () => {
    const { service, client } = build({ rows: [] })
    expect(await service.eraseChatImageAttachmentsUploadedBy(USER, '2026-09-28')).toEqual({ erased: 0, deferred: 0 })
    expect(client.remove).not.toHaveBeenCalled()
  })

  it('si le magasin refuse : les lignes RESTENT, passent échues, et la purge de la nuit les reprend', async () => {
    const { service, manager, order } = build({ rows, storeAccepts: false })

    expect(await service.eraseChatImageAttachmentsUploadedBy(USER, '2026-09-28')).toEqual({ erased: 0, deferred: 2 })
    expect(order).toEqual(['remove', 'update'])
    const update = manager.query.mock.calls.find(call => (call[0] as string).startsWith('UPDATE')) as [
      string,
      unknown[],
    ]
    expect(update[0]).toContain("domain = 'chat_image_attachment'")
  })
})
