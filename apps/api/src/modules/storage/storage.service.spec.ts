import { BadRequestException, NotFoundException } from '@nestjs/common'
import { STORED_FILE_MAX_BYTES } from '@bellum/contracts'
import { createHash } from 'node:crypto'
import { StorageService } from './storage.service'

/**
 * LE STOCKAGE — ce que ces tests protègent.
 *
 * Trois invariants, et ils ne sont pas de même nature :
 *
 *  1. **le cloisonnement** — un objet d'un AUTRE espace n'existe pas, même si
 *     son identifiant a été deviné, et aucune URL n'est jamais signée pour lui.
 *     C'est la première règle du lot ;
 *  2. **le refus NOMMÉ** — chaque échec de dépôt dit ce qui ne va pas, et
 *     l'ordre des refus est une décision (la taille se corrige seule, le quota
 *     se négocie) ;
 *  3. **aucun octet orphelin** — si l'écriture en base échoue APRÈS l'écriture
 *     des octets, les octets repartent. Sans ce retour en arrière, le quota
 *     d'un espace enflerait sans qu'aucune ligne ne le dise.
 */
describe('StorageService', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111'
  const OTHER_WORKSPACE = '99999999-9999-4999-8999-999999999999'
  const OBJECT = '22222222-2222-4222-8222-222222222222'
  const USER = '33333333-3333-4333-8333-333333333333'

  function build(over: { used?: number; row?: unknown; insertThrows?: boolean } = {}) {
    const client = {
      put: jest.fn().mockResolvedValue(undefined),
      signedUrl: jest.fn().mockResolvedValue('https://magasin.example/objet?signature=abc'),
      remove: jest.fn().mockResolvedValue(undefined),
    }
    const manager = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SUM(byte_size)')) return Promise.resolve([{ used: String(over.used ?? 0) }])
        if (sql.startsWith('INSERT INTO storage_objects')) {
          if (over.insertThrows) return Promise.reject(new Error('unique_violation'))
          return Promise.resolve([{ id: OBJECT, created_at: new Date('2026-08-31T10:00:00.000Z') }])
        }
        if (sql.includes('FROM storage_objects')) return Promise.resolve(over.row ? [over.row] : [])
        return Promise.resolve([])
      }),
    }
    const objects = { manager }
    return { service: new StorageService(objects as never, client as never), client, manager }
  }

  // #2438.7 — préfixé de la signature PDF réelle (`%PDF-1.4`) : depuis que
  // `refuseStoredFile` vérifie les octets contre l'extension déclarée, un
  // contenu texte ordinaire nommé `.pdf` serait refusé (`content_mismatch`).
  const PDF_CONTENT = '%PDF-1.4\nun justificatif'
  const deposit = {
    workspaceId: WORKSPACE,
    domain: 'expense_receipt' as const,
    fileName: 'Facture_hotel.pdf',
    contentType: 'application/octet-stream',
    fileB64: Buffer.from(PDF_CONTENT).toString('base64'),
    uploadedBy: USER,
    today: '2026-08-31',
  }

  describe('le dépôt', () => {
    it('écrit les octets, puis la ligne — et rend le fichier rangé', async () => {
      const { service, client, manager } = build()
      const stored = await service.put(deposit)

      expect(client.put).toHaveBeenCalledTimes(1)
      const [path, bytes, contentType] = client.put.mock.calls[0] as [string, Buffer, string]
      // Le cloisonnement est ÉCRIT dans le chemin : l'espace en est le premier
      // segment, et rien ne le rend devinable depuis un autre espace.
      expect(path.startsWith(`${WORKSPACE}/expense_receipt/`)).toBe(true)
      // #2438.7 — le fixture porte désormais la signature PDF réelle
      // (`%PDF-1.4`) : `refuseStoredFile` vérifie les octets contre l'extension.
      expect(bytes.toString()).toBe(PDF_CONTENT)
      // ⚠️ Le type retenu est celui de l'EXTENSION, jamais celui que le client
      // déclare — ici `application/octet-stream` a été écarté.
      expect(contentType).toBe('application/pdf')

      expect(stored.byteSize).toBe(PDF_CONTENT.length)
      expect(stored.retentionUntil).toBe('2036-08-31')
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO storage_objects'),
        expect.arrayContaining([WORKSPACE, 'expense_receipt']),
      )
    })

    /**
     * #2438.7 — L'EMPREINTE (hash) est calculée et CONSERVÉE, pas juste
     * calculée en passant : elle voyage jusqu'à l'écriture. Ni antivirus ni
     * lecture de contenu — un hachage ne LIT rien du contenu, il le résume.
     */
    it('#2438.7 — calcule l’empreinte SHA-256 des octets et la CONSERVE à l’écriture', async () => {
      const { service, manager } = build()
      await service.put(deposit)

      const expectedHash = createHash('sha256').update(Buffer.from(PDF_CONTENT)).digest('hex')
      const insertCall = manager.query.mock.calls.find((call: unknown[]) =>
        (call[0] as string).startsWith('INSERT INTO storage_objects'),
      ) as [string, unknown[]]
      expect(insertCall[1]).toContain(expectedHash)
    })

    it('refuse un type non autorisé — sans jamais toucher au magasin', async () => {
      const { service, client } = build()
      await expect(service.put({ ...deposit, fileName: 'charge.sh' })).rejects.toBeInstanceOf(BadRequestException)
      expect(client.put).not.toHaveBeenCalled()
    })

    it('refuse un fichier trop gros, et le DIT — pas « une erreur est survenue »', async () => {
      const { service } = build()
      const tooBig = Buffer.alloc(STORED_FILE_MAX_BYTES + 1).toString('base64')
      await expect(service.put({ ...deposit, fileB64: tooBig })).rejects.toThrow(/10 Mo/)
    })

    it('refuse quand le quota de l’ESPACE serait dépassé, et nomme le quota', async () => {
      const { service } = build({ used: 2 * 1024 * 1024 * 1024 })
      await expect(service.put(deposit)).rejects.toThrow(/espace de stockage/i)
    })

    it('refuse un fichier VIDE autrement qu’un fichier trop gros', async () => {
      const { service } = build()
      await expect(service.put({ ...deposit, fileB64: Buffer.from('').toString('base64') })).rejects.toThrow(/vide/i)
    })

    it('RETIRE les octets quand la ligne ne s’écrit pas — aucun octet orphelin', async () => {
      const { service, client } = build({ insertThrows: true })
      await expect(service.put(deposit)).rejects.toBeInstanceOf(Error)
      expect(client.remove).toHaveBeenCalledTimes(1)
      const [paths] = client.remove.mock.calls[0] as [string[]]
      expect(paths[0]?.startsWith(`${WORKSPACE}/`)).toBe(true)
    })
  })

  describe('l’URL signée', () => {
    const row = {
      id: OBJECT,
      workspace_id: WORKSPACE,
      domain: 'expense_receipt',
      object_path: `${WORKSPACE}/expense_receipt/${OBJECT}/Facture_hotel.pdf`,
      file_name: 'Facture_hotel.pdf',
      content_type: 'application/pdf',
      byte_size: '124000',
      retention_until: '2036-08-31',
      created_at: new Date('2026-08-31T10:00:00.000Z'),
    }

    it('ne se fabrique QUE pour un objet de l’espace du demandeur', async () => {
      const { service, client, manager } = build({ row: null })
      await expect(service.signedUrlFor(OTHER_WORKSPACE, OBJECT)).rejects.toBeInstanceOf(NotFoundException)
      // Le magasin n'est même pas interrogé : rien n'a pu fuiter.
      expect(client.signedUrl).not.toHaveBeenCalled()
      // La lecture est BORNÉE par l'espace — pas filtrée après coup.
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('workspace_id = $2'),
        expect.arrayContaining([OBJECT, OTHER_WORKSPACE]),
      )
    })

    it('rend l’URL, son échéance et le nom du fichier', async () => {
      const { service } = build({ row })
      const signed = await service.signedUrlFor(WORKSPACE, OBJECT)
      expect(signed.url).toContain('signature=')
      expect(signed.fileName).toBe('Facture_hotel.pdf')
      expect(Date.parse(signed.expiresAt)).toBeGreaterThan(Date.now())
    })
  })

  describe('la purge des fichiers échus', () => {
    it('efface les OCTETS avant les lignes — l’inverse perdrait le chemin', async () => {
      const expired = [
        { id: 'o-1', object_path: `${WORKSPACE}/expense_receipt/o-1/vieux.pdf` },
        { id: 'o-2', object_path: `${WORKSPACE}/need_document/o-2/vieille-nda.pdf` },
      ]
      const client = { put: jest.fn(), signedUrl: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) }
      const order: string[] = []
      const manager = {
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('SELECT id, object_path')) return Promise.resolve(expired)
          if (sql.startsWith('DELETE')) {
            order.push('delete')
            return Promise.resolve([])
          }
          return Promise.resolve([])
        }),
      }
      client.remove.mockImplementation(() => {
        order.push('remove')
        return Promise.resolve()
      })
      const service = new StorageService({ manager } as never, client as never)

      expect(await service.purgeExpired('2026-08-31', 500)).toEqual({ removed: 2 })
      expect(order).toEqual(['remove', 'delete'])
    })

    it('ne touche à rien quand rien n’est échu — et ne prétend pas avoir purgé', async () => {
      const client = { put: jest.fn(), signedUrl: jest.fn(), remove: jest.fn() }
      const manager = { query: jest.fn().mockResolvedValue([]) }
      const service = new StorageService({ manager } as never, client as never)
      expect(await service.purgeExpired('2026-08-31', 500)).toEqual({ removed: 0 })
      expect(client.remove).not.toHaveBeenCalled()
    })
  })
})
