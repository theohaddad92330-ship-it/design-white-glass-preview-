import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { decryptToken } from '../crm/crm-token.crypto'
import { OdooService } from './odoo.service'

// `OdooClient` fait passer chaque appel par la garde SSRF, qui résout vraiment
// le nom d'hôte ; `acme.odoo.com` n'a pas de DNS public ici, donc on simule
// une résolution publique plutôt que de contourner la garde elle-même.
jest.mock('node:dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }))

/**
 * Le service Odoo — ce qu'il écrit, et surtout ce qu'il n'écrit PAS.
 *
 * Le connecteur ne passe par aucun OAuth : la connexion est un POST
 * d'identifiants. Les quatre invariants vérifiés ici sont ceux qu'un connecteur
 * de ce type rate quand on le calque sur un connecteur OAuth.
 */

const WORKSPACE = 'ws-1'
const USER = 'user-1'

/** Un dépôt TypeORM réduit à ce que le service appelle réellement. */
function repoStub(initial: Partial<CrmConnectionEntity> | null = null) {
  const state: { row: Partial<CrmConnectionEntity> | null } = { row: initial }
  return {
    state,
    findOne: jest.fn(async () => state.row),
    create: jest.fn((row: Partial<CrmConnectionEntity>) => row),
    save: jest.fn(async (row: Partial<CrmConnectionEntity>) => {
      state.row = { ...(state.row ?? {}), ...row }
      return state.row
    }),
    delete: jest.fn(async () => ({ affected: state.row ? 1 : 0 })),
  }
}

function makeService(connections: ReturnType<typeof repoStub>, firstImport?: { enqueue: jest.Mock }) {
  const actions = { create: jest.fn((r: unknown) => r), save: jest.fn(async (r: unknown) => r) }
  const workspace = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const service = new OdooService(
    connections as unknown as Repository<CrmConnectionEntity>,
    actions as unknown as Repository<UserActionEntity>,
    workspace as unknown as WorkspaceContextService,
    undefined,
    firstImport as never,
  )
  return { service, actions }
}

const realFetch = global.fetch
let fetchMock: jest.Mock

beforeEach(() => {
  // La clé de chiffrement des jetons : le service chiffre la clé d'API avec.
  process.env['INTERNAL_API_SECRET'] = 'x'.repeat(48)
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  global.fetch = realFetch
  jest.restoreAllMocks()
})

function rpcOk(result: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', result }) } as unknown as Response
}

const CONNECT = {
  baseUrl: 'https://acme.odoo.com',
  db: 'acme-prod',
  login: 'sales@acme.fr',
  apiKey: 'k'.repeat(40),
}

describe('OdooService', () => {
  describe('sans lien, il ne fait RIEN', () => {
    it('répond « non connecté » sans émettre un seul appel', async () => {
      // « Sans clé = no-op strict » : un connecteur qui sonde l'instance à
      // chaque affichage transforme une page de réglages en sonde, et son
      // échec en panne d'écran.
      const repo = repoStub(null)
      const { service } = makeService(repo)
      await expect(service.getStatus(USER)).resolves.toEqual({ configured: true, connected: false })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuse un export avec une 404 explicite plutôt qu’un plantage', async () => {
      const repo = repoStub(null)
      const { service } = makeService(repo)
      await expect(service.exportContact(USER, { name: 'Marie' })).rejects.toBeInstanceOf(NotFoundException)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('la connexion', () => {
    it('SYNC-B — un branchement réussi met la première reprise en file ; un refus n’en met aucune', async () => {
      const firstImport = { enqueue: jest.fn().mockResolvedValue('queued') }
      fetchMock.mockResolvedValue(rpcOk(false))
      await makeService(repoStub(null), firstImport).service.connect(USER, CONNECT)
      expect(firstImport.enqueue).not.toHaveBeenCalled()

      fetchMock.mockResolvedValue(rpcOk(7))
      const result = await makeService(repoStub(null), firstImport).service.connect(USER, CONNECT)
      expect(result.ok).toBe(true)
      expect(firstImport.enqueue).toHaveBeenCalledWith({ userId: USER, workspaceId: WORKSPACE, provider: 'odoo' })
    })

    it('AUTHENTIFIE avant d’enregistrer — jamais un lien mort marqué connecté', async () => {
      const repo = repoStub(null)
      const { service } = makeService(repo)
      // `login` rend `false` : identifiants refusés.
      fetchMock.mockResolvedValue(rpcOk(false))

      const result = await service.connect(USER, CONNECT)
      expect(result.ok).toBe(false)
      // RIEN n'a été écrit : c'est tout l'objet du test.
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('chiffre la clé d’API — elle ne touche JAMAIS la base en clair', async () => {
      const repo = repoStub(null)
      const { service } = makeService(repo)
      fetchMock
        .mockResolvedValueOnce(rpcOk(12))
        .mockResolvedValueOnce(rpcOk({ server_version: '17.0' }))
        .mockResolvedValueOnce(rpcOk([{ name: 'Camille' }]))

      await service.connect(USER, CONNECT)
      const saved = repo.save.mock.calls[0][0] as CrmConnectionEntity
      expect(saved.access_token_enc).not.toContain(CONNECT.apiKey)
      // …et elle se relit, sinon on aurait chiffré pour rien.
      expect(decryptToken(saved.access_token_enc)).toBe(CONNECT.apiKey)
    })

    it('laisse expiration et rafraîchissement VIDES — une clé d’API n’expire pas', async () => {
      // Les remplir avec une date inventée ferait annoncer à l'écran une
      // reconnexion nécessaire qui n'existe pas.
      const repo = repoStub(null)
      const { service } = makeService(repo)
      fetchMock.mockResolvedValueOnce(rpcOk(12)).mockResolvedValueOnce(rpcOk({})).mockResolvedValueOnce(rpcOk([]))

      await service.connect(USER, CONNECT)
      const saved = repo.save.mock.calls[0][0] as CrmConnectionEntity
      expect(saved.expires_at).toBeNull()
      expect(saved.refresh_token_enc).toBeNull()
      expect(saved.refresh_failed_at).toBeNull()
      expect(saved.external_account_id).toBe('12')
      expect(saved.instance_url).toBe('https://acme.odoo.com')
    })

    it('retire le slash final de l’adresse avant de l’enregistrer', async () => {
      const repo = repoStub(null)
      const { service } = makeService(repo)
      fetchMock.mockResolvedValueOnce(rpcOk(12)).mockResolvedValueOnce(rpcOk({})).mockResolvedValueOnce(rpcOk([]))

      await service.connect(USER, { ...CONNECT, baseUrl: 'https://acme.odoo.com/' })
      const saved = repo.save.mock.calls[0][0] as CrmConnectionEntity
      expect(saved.instance_url).toBe('https://acme.odoo.com')
    })
  })

  describe('l’export', () => {
    const linked: Partial<CrmConnectionEntity> = {
      workspace_id: WORKSPACE,
      provider: 'odoo',
      instance_url: 'https://acme.odoo.com',
      account_label: 'acme-prod',
      external_account_id: '12',
      // La même clé, chiffrée — posée dans le test pour que `decryptToken` la relise.
      access_token_enc: '',
    }

    function linkedRepo() {
      // On chiffre à la volée avec le secret posé en `beforeEach`.
      const { encryptToken } = jest.requireActual<typeof import('../crm/crm-token.crypto')>('../crm/crm-token.crypto')
      return repoStub({ ...linked, access_token_enc: encryptToken('k'.repeat(40)) })
    }

    it('ne touche `last_used_at` qu’APRÈS un aller-retour réussi', async () => {
      // Le poser avant ferait d'une tentative échouée un « dernier usage », et
      // le registre d'outils annoncerait un connecteur vivant qui ne l'est pas.
      const repo = linkedRepo()
      const { service } = makeService(repo)
      fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as unknown as Response)

      await expect(service.exportContact(USER, { name: 'Marie' })).rejects.toThrow()
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('journalise l’export dans le journal d’activité, avec le fournisseur', async () => {
      const repo = linkedRepo()
      const { service, actions } = makeService(repo)
      fetchMock.mockResolvedValueOnce(rpcOk(99))

      const result = await service.exportContact(USER, { name: 'Jean Dupont' })
      expect(result).toEqual({ action: 'created', partnerId: 99 })
      expect(repo.save).toHaveBeenCalled()
      const logged = actions.create.mock.calls[0][0] as { action_type: string; metadata: Record<string, unknown> }
      expect(logged.action_type).toBe('crm_export')
      expect(logged.metadata).toMatchObject({ provider: 'odoo', action: 'created' })
    })

    it('refuse un lien dont l’identifiant interne est corrompu', async () => {
      // Sans ce garde-fou, `NaN` partirait au serveur et Odoo répondrait une
      // erreur qui n'aiderait personne à comprendre qu'il faut rebrancher.
      const repo = linkedRepo()
      repo.state.row = { ...repo.state.row, external_account_id: 'pas-un-nombre' }
      const { service } = makeService(repo)
      await expect(service.exportContact(USER, { name: 'Marie' })).rejects.toThrow(/incomplet/i)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('la déconnexion', () => {
    it('DIT que la clé reste valable — jamais un 204 muet', async () => {
      // Rien à révoquer côté serveur : une clé d'API Odoo se retire depuis le
      // profil du compte. Laisser croire à un accès coupé serait faux.
      const repo = repoStub({ provider: 'odoo', workspace_id: WORKSPACE })
      const { service } = makeService(repo)
      const result = await service.disconnect(USER)
      expect(result.removed).toBe(true)
      expect(result.warning).toMatch(/reste valable/i)
    })
  })
})
