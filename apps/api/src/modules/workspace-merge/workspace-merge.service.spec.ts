import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { WorkspaceMergeStatus } from '@bellum/contracts'
import { WorkspaceMergeService } from './workspace-merge.service'
import {
  duplicateLookupKeys,
  normalizeEmail,
  normalizeLinkedin,
  normalizeSiren,
  type DuplicateLookupKeys,
  type MergeAccountRow,
  type MergeContactRow,
} from './workspace-merge.plan'
import type {
  MergeRecordedItem,
  MergeRequestRecord,
  MergeStep,
  MergeStepResult,
  MergeWorkspaceRow,
  WorkspaceMergeStore,
} from './workspace-merge.store'

// #4158.57 (décision Louis 17/10/2026) — rapatrier l'espace PERSONNEL dans l'espace ESN rejoint.

const SOLO = 'u-solo'
const ADMIN = 'u-admin'
const SALES = 'u-sales'
const WS_PERSO = 'aaaaaaaa-0000-4000-8000-000000000001'
const WS_ESN = 'bbbbbbbb-0000-4000-8000-000000000002'
const WS_TIERS = 'cccccccc-0000-4000-8000-000000000003'

type Account = MergeAccountRow & { workspace_id: string; status: string; job_title?: string; corrected?: boolean }
type Contact = MergeContactRow & { workspace_id: string }

/** Un store en mémoire qui JOURNALISE chaque espace qu'on lui fait lire ou écrire. */
class MemoryStore implements WorkspaceMergeStore {
  workspaces: (MergeWorkspaceRow & { merged_into?: string | null })[] = [
    { id: WS_PERSO, name: 'Mon espace', ownerUserId: SOLO, isDemo: false, archivedAt: null, memberCount: 1 },
    { id: WS_ESN, name: 'ESN Alpha', ownerUserId: ADMIN, isDemo: false, archivedAt: null, memberCount: 3 },
    { id: WS_TIERS, name: 'ESN Tierce', ownerUserId: 'u-tiers', isDemo: false, archivedAt: null, memberCount: 2 },
  ]
  roles = new Map<string, string>([
    [`${SOLO}|${WS_PERSO}`, 'owner'],
    [`${SOLO}|${WS_ESN}`, 'sales'],
    [`${ADMIN}|${WS_ESN}`, 'admin'],
    [`${SALES}|${WS_ESN}`, 'sales'],
    ['u-tiers|' + WS_TIERS, 'owner'],
  ])
  accounts: Account[] = []
  contacts: Contact[] = []
  requests: MergeRequestRecord[] = []
  items: (MergeRecordedItem & { requestId: string })[] = []
  selections = new Map<string, string>()
  /** Chaque espace touché par une lecture ou une écriture de DONNÉES. */
  touched: string[] = []
  /** Coupure simulée : l'étape n° N lève. */
  failAtStep: number | null = null
  private steps = 0
  private seq = 0

  async personalWorkspaceOf(userId: string) {
    return (
      this.workspaces.find(w => w.ownerUserId === userId && !w.isDemo && w.memberCount === 1 && !w.archivedAt) ?? null
    )
  }
  async workspace(id: string) {
    return this.workspaces.find(w => w.id === id) ?? null
  }
  async roleIn(userId: string, workspaceId: string) {
    return this.roles.get(`${userId}|${workspaceId}`) ?? null
  }
  async activeAccounts(workspaceId: string) {
    this.touched.push(workspaceId)
    return this.accounts.filter(a => a.workspace_id === workspaceId && a.status !== 'archived')
  }
  async activeContacts(workspaceId: string) {
    this.touched.push(workspaceId)
    return this.contacts.filter(c => c.workspace_id === workspaceId)
  }
  async targetDuplicates(workspaceId: string, keys: DuplicateLookupKeys) {
    this.touched.push(workspaceId)
    return {
      accounts: this.accounts.filter(
        a =>
          a.workspace_id === workspaceId &&
          a.status !== 'archived' &&
          (keys.sirens.includes(normalizeSiren(a.siren) ?? '') ||
            keys.registries.some(r => r.id === a.registryId && r.country === a.registryCountry)),
      ),
      contacts: this.contacts.filter(
        c =>
          c.workspace_id === workspaceId &&
          (keys.emails.includes(normalizeEmail(c.email) ?? '') ||
            keys.linkedins.includes(normalizeLinkedin(c.linkedin) ?? '')),
      ),
    }
  }
  async liveRequestForSource(sourceWorkspaceId: string) {
    const live: WorkspaceMergeStatus[] = ['previewed', 'awaiting_admin', 'approved', 'running', 'failed']
    return this.requests.find(r => r.source_workspace_id === sourceWorkspaceId && live.includes(r.status)) ?? null
  }
  async findRequest(id: string) {
    return this.requests.find(r => r.id === id) ?? null
  }
  async requestsForTarget(workspaceId: string, statuses: readonly WorkspaceMergeStatus[]) {
    return this.requests.filter(r => r.workspace_id === workspaceId && statuses.includes(r.status))
  }
  async requestsBy(userId: string) {
    return this.requests.filter(r => r.requested_by === userId)
  }
  async insertRequest(record: Omit<MergeRequestRecord, 'id' | 'created_at'>) {
    const row = { ...record, id: `req-${++this.seq}`, created_at: new Date(1000) }
    this.requests.push(row)
    return row
  }
  async updateRequest(id: string, patch: Partial<MergeRequestRecord>) {
    Object.assign(this.requests.find(r => r.id === id)!, patch)
  }
  async recordedItems(requestId: string) {
    return this.items.filter(i => i.requestId === requestId)
  }
  async applyStep(step: MergeStep): Promise<MergeStepResult> {
    this.steps += 1
    if (this.failAtStep === this.steps) throw new Error('connexion perdue')
    if (
      this.items.some(i => i.requestId === step.requestId && i.table === step.table && i.sourceId === step.sourceId)
    ) {
      return { state: 'already' }
    }
    let targetId = step.targetId
    if (step.outcome === 'copied') {
      this.touched.push(step.sourceWorkspaceId, step.targetWorkspaceId)
      if (step.table === 'accounts') {
        const source = this.accounts.find(a => a.id === step.sourceId && a.workspace_id === step.sourceWorkspaceId)
        if (!source) return { state: 'missing' }
        targetId = `copy-${source.id}`
        this.accounts.push({ ...source, id: targetId, workspace_id: step.targetWorkspaceId })
      } else {
        const source = this.contacts.find(c => c.id === step.sourceId && c.workspace_id === step.sourceWorkspaceId)
        if (!source) return { state: 'missing' }
        targetId = `copy-${source.id}`
        this.contacts.push({
          ...source,
          id: targetId,
          workspace_id: step.targetWorkspaceId,
          accountId: step.targetAccountId,
        })
      }
    }
    this.items.push({
      requestId: step.requestId,
      table: step.table,
      sourceId: step.sourceId,
      targetId,
      outcome: step.outcome,
    })
    return { state: 'written', targetId }
  }
  async archiveSource(sourceWorkspaceId: string, targetWorkspaceId: string, ownerUserId: string) {
    const ws = this.workspaces.find(w => w.id === sourceWorkspaceId && w.ownerUserId === ownerUserId)!
    ws.archivedAt = new Date(2000)
    ws.merged_into = targetWorkspaceId
  }
  async selectActiveWorkspace(userId: string, workspaceId: string) {
    this.selections.set(userId, workspaceId)
  }
}

function account(id: string, workspace_id: string, extra: Partial<Account> = {}): Account {
  return {
    id,
    workspace_id,
    label: id,
    siren: null,
    registryCountry: null,
    registryId: null,
    status: 'active',
    ...extra,
  }
}
function contact(id: string, workspace_id: string, accountId: string | null, extra: Partial<Contact> = {}): Contact {
  return { id, workspace_id, accountId, label: id, email: null, linkedin: null, ...extra }
}

function world() {
  const store = new MemoryStore()
  const queue = { add: jest.fn(async () => undefined) }
  const service = new WorkspaceMergeService(store, queue as never)
  // L'espace perso : 3 comptes actifs (dont 1 doublon SIREN de l'ESN), 1 archivé, et leurs contacts.
  store.accounts.push(
    account('p-acc-1', WS_PERSO, { siren: '552 100 554', label: 'Doublon SA' }),
    account('p-acc-2', WS_PERSO, { siren: '111222333', label: 'Neuve SAS' }),
    account('p-acc-3', WS_PERSO, { label: 'Sans SIREN' }),
    account('p-acc-old', WS_PERSO, { status: 'archived' }),
    // L'ESN : le même SIREN, corrigé À LA MAIN (job_title corrigé = la correction humaine à protéger).
    account('e-acc-1', WS_ESN, {
      siren: '552100554',
      label: 'Doublon SA (ESN)',
      job_title: 'corrigé',
      corrected: true,
    }),
    // Un TIERS espace porte les mêmes clés : il ne doit jamais être lu ni écrit.
    account('t-acc-1', WS_TIERS, { siren: '111222333' }),
  )
  store.contacts.push(
    contact('p-c-1', WS_PERSO, 'p-acc-1'), // compte proposé → attend sa décision
    contact('p-c-2', WS_PERSO, 'p-acc-2', { email: 'Jane@Client.fr' }), // doublon e-mail dans l'ESN
    contact('p-c-3', WS_PERSO, 'p-acc-2', { linkedin: 'https://www.linkedin.com/in/bob/' }),
    contact('p-c-4', WS_PERSO, null),
    contact('p-c-old', WS_PERSO, 'p-acc-old'), // compte archivé dans l'espace perso → reste
    contact('e-c-1', WS_ESN, 'e-acc-1', { email: 'jane@client.fr' }),
    contact('t-c-1', WS_TIERS, 't-acc-1', { linkedin: 'linkedin.com/in/bob' }),
  )
  return { store, queue, service }
}

async function approvedRequest() {
  const w = world()
  const preview = await w.service.preview(SOLO, WS_ESN)
  await w.service.confirm(SOLO, preview.id, preview.previewHash)
  await w.service.approve(ADMIN, preview.id, preview.previewHash)
  return { ...w, requestId: preview.id, hash: preview.previewHash }
}

describe('WorkspaceMergeService — aperçu (condition a)', () => {
  it('compte, par table, ce qui part, les doublons proposés et ce qui attend — sans rien écrire', async () => {
    const { store, service } = world()
    const accountsBefore = JSON.stringify(store.accounts)
    const contactsBefore = JSON.stringify(store.contacts)

    const view = await service.preview(SOLO, WS_ESN)

    expect(view.tables).toEqual([
      { table: 'accounts', total: 3, moving: 2, duplicates: 1, held: 0 },
      { table: 'contacts', total: 4, moving: 2, duplicates: 1, held: 1 },
    ])
    expect(view.proposals.map(p => [p.sourceId, p.targetId, p.duplicateKey])).toEqual([
      ['p-acc-1', 'e-acc-1', 'siren'],
      ['p-c-2', 'e-c-1', 'email'],
    ])
    expect(view.status).toBe('previewed')
    expect(view.previewHash).toMatch(/^[0-9a-f]{64}$/)
    // La simulation n'écrit AUCUNE donnée.
    expect(JSON.stringify(store.accounts)).toBe(accountsBefore)
    expect(JSON.stringify(store.contacts)).toBe(contactsBefore)
    expect(store.items).toHaveLength(0)
  })

  it('l’aperçu est PERSISTÉ avec son empreinte, et refaire l’aperçu remplace la demande non validée', async () => {
    const { store, service } = world()
    const first = await service.preview(SOLO, WS_ESN)
    store.accounts.push(account('p-acc-4', WS_PERSO))
    const second = await service.preview(SOLO, WS_ESN)
    expect(store.requests).toHaveLength(1)
    expect(second.id).toBe(first.id)
    expect(second.previewHash).not.toBe(first.previewHash)
    expect(store.requests[0]!.preview_hash).toBe(second.previewHash)
  })

  it('l’empreinte ignore un renommage, pas une ligne ajoutée', async () => {
    const { store, service } = world()
    const first = await service.preview(SOLO, WS_ESN)
    store.accounts.find(a => a.id === 'p-acc-2')!.label = 'Renommée'
    expect((await service.preview(SOLO, WS_ESN)).previewHash).toBe(first.previewHash)
  })

  it('refuse une cible dont l’utilisateur n’est pas membre, la démo, ou un espace qui n’est pas personnel', async () => {
    const { store, service } = world()
    await expect(service.preview(SOLO, WS_TIERS)).rejects.toBeInstanceOf(ForbiddenException)
    store.workspaces.find(w => w.id === WS_PERSO)!.memberCount = 2
    await expect(service.preview(SOLO, WS_ESN)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('WorkspaceMergeService — double validation sur l’empreinte (condition b)', () => {
  it('l’utilisateur valide CE hash ; un autre hash est refusé', async () => {
    const { service } = world()
    const view = await service.preview(SOLO, WS_ESN)
    await expect(service.confirm(SOLO, view.id, 'f'.repeat(64))).rejects.toBeInstanceOf(ConflictException)
    await expect(service.confirm(SOLO, view.id, view.previewHash)).resolves.toMatchObject({ status: 'awaiting_admin' })
  })

  it('la donnée a changé depuis l’aperçu : la validation est refusée, il faut refaire l’aperçu', async () => {
    const { store, service } = world()
    const view = await service.preview(SOLO, WS_ESN)
    store.accounts.push(account('e-acc-2', WS_ESN, { siren: '111222333' })) // p-acc-2 devient doublon
    await expect(service.confirm(SOLO, view.id, view.previewHash)).rejects.toBeInstanceOf(ConflictException)
  })

  it('seul un admin de l’espace CIBLE peut accepter — pas un commercial, pas le demandeur commercial', async () => {
    const { service, queue } = world()
    const view = await service.preview(SOLO, WS_ESN)
    await service.confirm(SOLO, view.id, view.previewHash)
    await expect(service.approve(SALES, view.id, view.previewHash)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.approve(SOLO, view.id, view.previewHash)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.approve('u-tiers', view.id, view.previewHash)).rejects.toBeInstanceOf(ForbiddenException)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('l’admin ne peut pas accepter avant la validation de l’utilisateur', async () => {
    const { service } = world()
    const view = await service.preview(SOLO, WS_ESN)
    await expect(service.approve(ADMIN, view.id, view.previewHash)).rejects.toBeInstanceOf(ConflictException)
  })

  it('l’admin accepte le MÊME hash → le job part, porteur de ce hash', async () => {
    const { queue, requestId, hash, store } = await approvedRequest()
    expect(store.requests[0]!.status).toBe('approved')
    expect(store.requests[0]!.admin_validated_by).toBe(ADMIN)
    expect(queue.add).toHaveBeenCalledWith(
      'merge',
      { requestId, hash, write: true },
      expect.objectContaining({ jobId: expect.stringContaining(requestId) }),
    )
  })

  it('les demandes en attente ne se lisent que par un admin de la cible', async () => {
    const { service } = world()
    const view = await service.preview(SOLO, WS_ESN)
    await service.confirm(SOLO, view.id, view.previewHash)
    await expect(service.pendingFor(ADMIN, WS_ESN)).resolves.toHaveLength(1)
    await expect(service.pendingFor(SALES, WS_ESN)).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('WorkspaceMergeService — exécution (conditions c, e, f, g)', () => {
  it('SIMULATION par défaut : run() sans écriture rend l’aperçu et n’écrit rien', async () => {
    const { service, store, requestId } = await approvedRequest()
    const result = await service.run(requestId, {})
    expect(result.written).toBe(false)
    expect(store.items).toHaveLength(0)
  })

  it('l’écriture réelle exige le hash VALIDÉ', async () => {
    const { service, store, requestId } = await approvedRequest()
    await expect(service.run(requestId, { write: true, hash: 'f'.repeat(64) })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(store.items).toHaveLength(0)
  })

  it('recopie, propose, archive la source sans rien supprimer, et pose la cible comme espace actif', async () => {
    const { service, store, requestId, hash } = await approvedRequest()
    const sourceRowsBefore = JSON.stringify([
      store.accounts.filter(a => a.workspace_id === WS_PERSO),
      store.contacts.filter(c => c.workspace_id === WS_PERSO),
    ])

    await service.run(requestId, { write: true, hash })

    const copies = store.accounts.filter(a => a.workspace_id === WS_ESN).map(a => a.id)
    expect(copies.sort()).toEqual(['copy-p-acc-2', 'copy-p-acc-3', 'e-acc-1'])
    const copiedContacts = store.contacts.filter(c => c.workspace_id === WS_ESN && c.id.startsWith('copy-'))
    expect(copiedContacts.map(c => [c.id, c.accountId])).toEqual([
      ['copy-p-c-3', 'copy-p-acc-2'],
      ['copy-p-c-4', null],
    ])
    // Les lignes d'origine sont INTACTES et lisibles ; l'espace est archivé, pas supprimé.
    expect(
      JSON.stringify([
        store.accounts.filter(a => a.workspace_id === WS_PERSO),
        store.contacts.filter(c => c.workspace_id === WS_PERSO),
      ]),
    ).toBe(sourceRowsBefore)
    const perso = store.workspaces.find(w => w.id === WS_PERSO)!
    expect(perso.archivedAt).not.toBeNull()
    expect(perso.merged_into).toBe(WS_ESN)
    expect(store.selections.get(SOLO)).toBe(WS_ESN)
    expect(store.requests[0]!.status).toBe('done')
    expect(store.items.filter(i => i.outcome === 'duplicate_proposed').map(i => i.targetId)).toEqual([
      'e-acc-1',
      'e-c-1',
    ])
  })

  it('correction humaine gagne : la fiche corrigée de l’espace cible n’est jamais réécrite', async () => {
    const { service, store, requestId, hash } = await approvedRequest()
    const before = JSON.stringify(store.accounts.find(a => a.id === 'e-acc-1'))
    const contactBefore = JSON.stringify(store.contacts.find(c => c.id === 'e-c-1'))
    await service.run(requestId, { write: true, hash })
    expect(JSON.stringify(store.accounts.find(a => a.id === 'e-acc-1'))).toBe(before)
    expect(JSON.stringify(store.contacts.find(c => c.id === 'e-c-1'))).toBe(contactBefore)
    // Aucune copie n'est rattachée au compte existant : le doublon reste une PROPOSITION.
    expect(store.contacts.some(c => c.workspace_id === WS_ESN && c.accountId === 'e-acc-1' && c.id !== 'e-c-1')).toBe(
      false,
    )
  })

  it('cloisonnement : aucune ligne d’un TIERS espace n’est lue ni écrite, même aux mêmes clés', async () => {
    const { service, store, requestId, hash } = await approvedRequest()
    const tiersBefore = JSON.stringify([
      store.accounts.filter(a => a.workspace_id === WS_TIERS),
      store.contacts.filter(c => c.workspace_id === WS_TIERS),
    ])
    await service.run(requestId, { write: true, hash })
    expect(new Set(store.touched)).toEqual(new Set([WS_PERSO, WS_ESN]))
    expect(
      JSON.stringify([
        store.accounts.filter(a => a.workspace_id === WS_TIERS),
        store.contacts.filter(c => c.workspace_id === WS_TIERS),
      ]),
    ).toBe(tiersBefore)
    // Les clés du tiers (SIREN 111222333, LinkedIn bob) n'ont fait de p-acc-2 / p-c-3 aucun doublon.
    expect(store.items.find(i => i.sourceId === 'p-acc-2')!.outcome).toBe('copied')
    expect(store.items.find(i => i.sourceId === 'p-c-3')!.outcome).toBe('copied')
  })

  it('idempotent : rejouer le job ne recopie rien', async () => {
    const { service, store, requestId, hash } = await approvedRequest()
    await service.run(requestId, { write: true, hash })
    const accounts = store.accounts.length
    const contacts = store.contacts.length
    store.requests[0]!.status = 'running' // un second passage du même job (livraison en double)
    await service.run(requestId, { write: true, hash })
    expect(store.accounts).toHaveLength(accounts)
    expect(store.contacts).toHaveLength(contacts)
  })

  it('reprenable : une coupure au milieu laisse la demande en échec, la reprise finit sans doublon', async () => {
    const { service, store, requestId, hash, queue } = await approvedRequest()
    store.failAtStep = 3
    await expect(service.run(requestId, { write: true, hash })).rejects.toThrow('connexion perdue')
    expect(store.requests[0]!.status).toBe('failed')
    expect(store.requests[0]!.last_error).toBe('connexion perdue')
    expect(store.workspaces.find(w => w.id === WS_PERSO)!.archivedAt).toBeNull()
    const partial = store.items.length
    expect(partial).toBe(2)

    await service.resume(SOLO, requestId)
    expect(queue.add).toHaveBeenLastCalledWith(
      'merge',
      { requestId, hash, write: true },
      expect.objectContaining({ jobId: expect.stringContaining(requestId) }),
    )
    store.failAtStep = null
    await service.run(requestId, { write: true, hash })
    expect(store.requests[0]!.status).toBe('done')
    expect(store.items).toHaveLength(7)
    expect(store.accounts.filter(a => a.id.startsWith('copy-'))).toHaveLength(2)
  })

  it('un compte devenu doublon APRÈS la validation est proposé, jamais écrit par-dessus', async () => {
    const { service, store, requestId, hash } = await approvedRequest()
    store.accounts.push(account('e-acc-late', WS_ESN, { siren: '111222333' }))
    await service.run(requestId, { write: true, hash })
    expect(store.items.find(i => i.sourceId === 'p-acc-2')).toMatchObject({
      outcome: 'duplicate_proposed',
      targetId: 'e-acc-late',
    })
    expect(store.items.find(i => i.sourceId === 'p-c-3')!.outcome).toBe('held_with_account')
    expect(store.accounts.some(a => a.id === 'copy-p-acc-2')).toBe(false)
  })

  it('une demande inconnue ou d’un autre utilisateur ne se lit pas (404, rien ne fuit)', async () => {
    const { service, requestId } = await approvedRequest()
    await expect(service.resume('u-autre', requestId)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.confirm(SOLO, 'req-absente', 'x')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('duplicateLookupKeys', () => {
  it('ne cherche jamais par nom — seulement SIREN, registre, e-mail, LinkedIn', () => {
    const keys = duplicateLookupKeys(
      [account('a', WS_PERSO, { siren: '552 100 554', label: 'Même nom' })],
      [contact('c', WS_PERSO, null, { email: ' A@B.FR ', linkedin: 'http://linkedin.com/in/x/?utm=1' })],
    )
    expect(keys).toEqual({
      sirens: ['552100554'],
      registries: [],
      emails: ['a@b.fr'],
      linkedins: ['linkedin.com/in/x'],
    })
  })
})
