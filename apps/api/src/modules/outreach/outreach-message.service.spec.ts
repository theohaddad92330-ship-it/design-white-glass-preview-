/**
 * #2366 / #2382 — le modèle canonique de l'outreach, appliqué par l'API.
 *
 * Dépôts en mémoire : le service ne touche que ses repositories (GA-07 —
 * l'opt-out lui arrive du contrôleur sous forme de fonction de lecture).
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { FindOperator } from 'typeorm'
import { OutreachMessageService, type OutreachCtx } from './outreach-message.service'

type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const op = expected as FindOperator<unknown> | undefined
    if (op && typeof op === 'object' && 'type' in op && op.type === 'in') {
      return (op.value as unknown[]).includes(row[key])
    }
    return row[key] === expected
  })
}

function repo(rows: Row[] = []) {
  let seq = 0
  return {
    rows,
    create: (data: Row) => ({ ...data }),
    find: jest.fn(async (opts?: { where?: Row }) => rows.filter(r => matches(r, opts?.where ?? {}))),
    findOne: jest.fn(async (opts: { where: Row }) => rows.find(r => matches(r, opts.where)) ?? null),
    save: jest.fn(async (row: Row) => {
      if (!row.id) row.id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      const now = new Date('2026-09-22T20:00:00Z')
      row.created_at ??= now
      row.updated_at = now
      if (row.occurred_at === undefined) row.occurred_at = now
      if (!rows.includes(row)) rows.push(row)
      return row
    }),
  }
}

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CONTACT = '33333333-3333-4333-8333-333333333333'
const ASSET_ALWAYS = '55555555-5555-4555-8555-555555555555'
const ASSET_AFTER_INTEREST = '66666666-6666-4666-8666-666666666666'

function build() {
  const messages = repo()
  const versions = repo()
  const calls = repo()
  const transitions = repo()
  const contacts = repo([
    {
      id: CONTACT,
      workspace_id: WS,
      full_name: 'Marie Dubois',
      title: 'DSI',
      email: 'marie@client.fr',
      account_id: null,
    },
  ])
  const accounts = repo()
  const assets = repo([
    { id: ASSET_ALWAYS, workspace_id: WS, usage_rights: 'always' },
    { id: ASSET_AFTER_INTEREST, workspace_id: WS, usage_rights: 'after_interest_confirmed' },
  ])
  const sequences = repo()
  const styleTemplates = repo()
  const service = new OutreachMessageService(
    messages as never,
    versions as never,
    calls as never,
    transitions as never,
    contacts as never,
    accounts as never,
    assets as never,
    sequences as never,
    styleTemplates as never,
    repo() as never,
  )
  return { service, messages, versions, calls, transitions, contacts, accounts, assets, sequences, styleTemplates }
}

const owner: OutreachCtx = { userId: OWNER, workspaceId: WS, role: 'sales' }
const noStops = async () => new Set<string>()

async function draft(service: OutreachMessageService) {
  return service.create(
    owner,
    {
      contact_id: CONTACT,
      channel: 'email',
      intent: 'open_relationship',
      source: 'contacts',
      template: { subject: 'Bonjour', body: 'Bonjour {prénom}\nNous avons une mission.' },
      subject: 'Bonjour Marie',
      body: 'Bonjour Marie\nVotre DSI recrute. En parler ?',
    },
    noStops,
  )
}

describe('OutreachMessageService — le message canonique (#2366)', () => {
  it('garde le gabarit ET la version personnalisée, et naît à relire (#2366.3, #2382.3)', async () => {
    const { service } = build()
    const created = await draft(service)
    expect(created.status).toBe('needs_review')
    expect(created.versions.map(v => [v.version, v.kind])).toEqual([
      [1, 'template'],
      [2, 'personalized'],
    ])
    expect(created.current_version).toBe(2)
    expect(created.body).toBe('Bonjour Marie\nVotre DSI recrute. En parler ?')
    expect(created.view).toBe('to_review')
    expect(created.message_style_template_id).toBeNull()
    expect(created.message_style_template_version).toBeNull()
  })

  // #2369.12 (reste, épopée #2768) — relier le style comparé (#2369.11) au message qui naît.
  it('relie un style ACTIF de cet espace — snapshot de sa version', async () => {
    const { service, styleTemplates } = build()
    styleTemplates.rows.push({
      id: '77777777-7777-4777-8777-777777777777',
      workspace_id: WS,
      status: 'active',
      version: 3,
    })
    const created = await service.create(
      owner,
      {
        contact_id: CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: null,
        body: 'Bonjour Marie',
        message_style_template_id: '77777777-7777-4777-8777-777777777777',
      },
      noStops,
    )
    expect(created.message_style_template_id).toBe('77777777-7777-4777-8777-777777777777')
    expect(created.message_style_template_version).toBe(3)
  })

  it('refuse un style d’un AUTRE espace — jamais un identifiant non vérifié', async () => {
    const { service, styleTemplates } = build()
    styleTemplates.rows.push({
      id: '88888888-8888-4888-8888-888888888888',
      workspace_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'active',
      version: 1,
    })
    await expect(
      service.create(
        owner,
        {
          contact_id: CONTACT,
          channel: 'email',
          intent: 'open_relationship',
          source: 'contacts',
          subject: null,
          body: 'Bonjour Marie',
          message_style_template_id: '88888888-8888-4888-8888-888888888888',
        },
        noStops,
      ),
    ).rejects.toThrow(NotFoundException)
  })

  it('refuse un style qui n’est pas `active` — un brouillon ne s’applique pas à un vrai message', async () => {
    const { service, styleTemplates } = build()
    styleTemplates.rows.push({
      id: '99999999-9999-4999-8999-999999999999',
      workspace_id: WS,
      status: 'draft',
      version: 1,
    })
    await expect(
      service.create(
        owner,
        {
          contact_id: CONTACT,
          channel: 'email',
          intent: 'open_relationship',
          source: 'contacts',
          subject: null,
          body: 'Bonjour Marie',
          message_style_template_id: '99999999-9999-4999-8999-999999999999',
        },
        noStops,
      ),
    ).rejects.toThrow(ConflictException)
  })

  it('une modification crée une version et ne remplace jamais la précédente (#2366.10)', async () => {
    const { service } = build()
    const created = await draft(service)
    const revised = await service.revise(
      owner,
      created.id,
      { subject: 'Bonjour Marie', body: 'Bonjour Marie, autre texte. En parler ?', base_version: 2 },
      noStops,
    )
    expect(revised.current_version).toBe(3)
    expect(revised.versions.find(v => v.version === 2)?.body).toBe('Bonjour Marie\nVotre DSI recrute. En parler ?')
    expect(revised.view).toBe('modified')
  })

  it('refuse une édition faite sur une version périmée', async () => {
    const { service } = build()
    const created = await draft(service)
    await expect(
      service.revise(owner, created.id, { subject: null, body: 'x', base_version: 1 }, noStops),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('un message parti ne se réécrit pas (#2366.10)', async () => {
    const { service, messages } = build()
    const created = await draft(service)
    ;(messages.rows[0] as Row).status = 'sent'
    await expect(
      service.revise(owner, created.id, { subject: null, body: 'x', base_version: 2 }, noStops),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('journalise chaque transition avec ses dix champs (#2366.8)', async () => {
    const { service } = build()
    const created = await draft(service)
    const history = await service.history(owner, 'message', created.id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      from_state: null,
      to_state: 'needs_review',
      actor: OWNER,
      actor_kind: 'user',
      cause: 'created',
      tool: 'outreach.messages.create',
      permission: 'messages:send',
      result: 'applied',
      error: null,
    })
  })

  it('le modèle seul ne valide jamais : la transition est refusée ET tracée (#2366.8)', async () => {
    const { service } = build()
    const created = await draft(service)
    await expect(
      service.transition(owner, created.id, { to: 'approved', cause: 'laura', proof: null }, 'model'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    const history = await service.history(owner, 'message', created.id)
    expect(history.at(-1)).toMatchObject({ to_state: 'approved', result: 'refused', error: 'model_forbidden' })
  })
})

describe('OutreachMessageService — le centre d’approbation (#2382)', () => {
  it('valider tout n’approuve que la version affichée, exclut le bloqué (#2382.9)', async () => {
    const { service } = build()
    const a = await draft(service)
    const b = await draft(service)
    await service.revise(owner, b.id, { subject: null, body: 'modifié après affichage', base_version: 2 }, noStops)
    const result = await service.approveMany(
      owner,
      {
        items: [
          { id: a.id, version: 2 },
          { id: b.id, version: 2 },
        ],
      },
      noStops,
    )
    expect(result.approved).toEqual([a.id])
    expect(result.excluded).toEqual([{ id: b.id, reason: 'changed_since_display' }])

    const c = await draft(service)
    const blocked = await service.approveMany(
      owner,
      { items: [{ id: c.id, version: 2 }] },
      async () => new Set([CONTACT]),
    )
    expect(blocked.excluded).toEqual([{ id: c.id, reason: 'blocked' }])
  })

  it('la preuve d’approbation garde ses sept champs (#2382.8)', async () => {
    const { service } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    const approved = await service.get(owner, a.id, noStops)
    expect(approved.status).toBe('approved')
    expect(approved.approval).toMatchObject({
      author: OWNER,
      version: 2,
      audience: { kind: 'contact', contact_ids: [CONTACT], size: 1 },
      policy: 'whitespace_only_is_minor',
      cost: null,
    })
    expect(approved.approval?.conditions.length).toBeGreaterThan(0)
    expect(approved.view).toBe('ready')
  })

  it('une modification substantielle invalide l’approbation, une retouche d’espaces non (#2382.6)', async () => {
    const { service } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    const minor = await service.revise(
      owner,
      a.id,
      { subject: 'Bonjour Marie ', body: 'Bonjour Marie\n\nVotre DSI recrute. En parler ? ', base_version: 2 },
      noStops,
    )
    expect(minor.status).toBe('approved')
    expect(minor.approval).not.toBeNull()
    const major = await service.revise(
      owner,
      a.id,
      { subject: 'Bonjour Marie', body: 'Autre promesse', base_version: 3 },
      noStops,
    )
    expect(major.status).toBe('needs_review')
    expect(major.approval).toBeNull()
  })

  it('valider le message d’un autre exige la gestion d’équipe (#2382.7)', async () => {
    const { service } = build()
    const a = await draft(service)
    const colleague: OutreachCtx = { userId: OTHER, workspaceId: WS, role: 'sales' }
    const refused = await service.approveMany(colleague, { items: [{ id: a.id, version: 2 }] }, noStops)
    expect(refused.excluded).toEqual([{ id: a.id, reason: 'forbidden' }])
    expect((await service.get(colleague, a.id, noStops)).can_approve).toBe(false)

    const manager: OutreachCtx = { userId: OTHER, workspaceId: WS, role: 'sales_ops' }
    expect((await service.get(manager, a.id, noStops)).can_approve).toBe(true)
    const accepted = await service.approveMany(manager, { items: [{ id: a.id, version: 2 }] }, noStops)
    expect(accepted.approved).toEqual([a.id])
  })

  it('nomme les bloquants mesurés sur la carte (#2382.2)', async () => {
    const { service, contacts } = build()
    ;(contacts.rows[0] as Row).email = null
    const a = await draft(service)
    const read = await service.get(owner, a.id, async () => new Set([CONTACT]))
    expect(read.blockers).toEqual(['opted_out', 'missing_channel_address'])
    expect(read.view).toBe('blocked')
    expect(read.required_permission).toBe('messages:send')
  })

  /**
   * #3419/#3420 (30/09/2026, lot C16) — un message qui affirme une relation
   * non prouvée est bloqué de bout en bout : la carte le nomme, et la
   * validation le refuse (`reason: 'blocked'`), jamais silencieusement.
   */
  it('bloque une affirmation de relation non prouvée, de la création au refus de validation (#3419.2)', async () => {
    const { service } = build()
    const message = await service.create(
      owner,
      {
        contact_id: CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: null,
        body: 'Bonjour Marie,\nNous travaillons déjà avec votre groupe. En parler ?',
      },
      noStops,
    )
    const read = await service.get(owner, message.id, noStops)
    expect(read.blockers).toEqual(['unverified_relationship_claim'])
    expect(read.view).toBe('blocked')

    const result = await service.approveMany(owner, { items: [{ id: message.id, version: 1 }] }, noStops)
    expect(result.excluded).toEqual([{ id: message.id, reason: 'blocked' }])
  })

  it('bloque un message trop générique — le test de substitution ne cite ni le compte ni le contact (#3420.2)', async () => {
    const { service } = build()
    const message = await service.create(
      owner,
      {
        contact_id: CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: null,
        body: 'Nous accompagnons des DSI sur leurs projets data. En parler ?',
      },
      noStops,
    )
    const read = await service.get(owner, message.id, noStops)
    expect(read.blockers).toEqual(['generic_message'])
  })
})

/**
 * #3069 — le dispatcher n'existait pas : `approved` restait `approved` pour
 * toujours, ou une transition déclarative posait `sent` sans qu'aucun envoi ne
 * soit parti. Ces méthodes sont ce que `OutreachSendSweeper` orchestre — testées
 * ici en dehors de tout connecteur réel (le sweeper porte ses propres tests).
 */
describe('OutreachMessageService — le dispatcher (#3069)', () => {
  it('`listApproved` ne rend que les messages VALIDÉS, inter-espaces', async () => {
    const { service } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    const b = await draft(service)
    const approved = await service.listApproved(10)
    expect(approved.map(m => m.id)).toEqual([a.id])
    expect(approved.map(m => m.id)).not.toContain(b.id)
  })

  it('`markSending` bascule approved → sending, jamais depuis un autre état', async () => {
    const { service } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    const claimed = await service.markSending(WS, a.id)
    expect(claimed?.status).toBe('sending')

    // Un second passage sur le même message ne le reprend pas deux fois.
    const secondPass = await service.markSending(WS, a.id)
    expect(secondPass).toBeNull()
  })

  it('`markSending` refuse sur un message qui n’a jamais été validé', async () => {
    const { service } = build()
    const a = await draft(service)
    expect(await service.markSending(WS, a.id)).toBeNull()
  })

  it('`markSent` exige une preuve non vide — la même règle que delivered/bounced/replied', async () => {
    const { service, transitions } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    await service.markSending(WS, a.id)
    await service.markSent(WS, a.id, { mailboxBatchId: 'b1', to: 'marie@client.fr' })
    const after = await service.get(owner, a.id, noStops)
    expect(after.status).toBe('sent')
    const logged = transitions.rows.find(r => r['to_state'] === 'sent')
    expect(logged?.['proof']).toEqual({ mailboxBatchId: 'b1', to: 'marie@client.fr' })
    expect(logged?.['actor_kind']).toBe('system')
  })

  it('#3234 — `markSent` persiste le message-id du fournisseur sur la ligne (colonnes), pas seulement au journal', async () => {
    const { service, messages } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    await service.markSending(WS, a.id)
    await service.markSent(WS, a.id, {
      mailboxBatchId: 'b1',
      to: 'marie@client.fr',
      providerMessageId: 'gm-42',
      providerThreadId: 'gt-7',
    })
    const row = messages.rows.find(r => r['id'] === a.id)
    expect(row?.['status']).toBe('sent')
    expect(row?.['provider_message_id']).toBe('gm-42')
    expect(row?.['provider_thread_id']).toBe('gt-7')
  })

  it('#3234 — sans identifiant rendu par le fournisseur, les colonnes restent NULL (jamais devinées)', async () => {
    const { service, messages } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    await service.markSending(WS, a.id)
    await service.markSent(WS, a.id, { mailboxBatchId: 'b1', to: 'marie@client.fr', providerMessageId: null })
    const row = messages.rows.find(r => r['id'] === a.id)
    expect(row?.['provider_message_id'] ?? null).toBeNull()
    expect(row?.['provider_thread_id'] ?? null).toBeNull()
  })

  it('`markSendFailed` NOMME l’échec, sans jamais poser un faux succès', async () => {
    const { service } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    await service.markSending(WS, a.id)
    await service.markSendFailed(WS, a.id, "La messagerie n'a pas envoyé le message.")
    const after = await service.get(owner, a.id, noStops)
    expect(after.status).toBe('failed')
  })

  it('un message `failed` peut être REPRIS — jamais bloqué pour de bon', async () => {
    const { service } = build()
    const a = await draft(service)
    await service.approveMany(owner, { items: [{ id: a.id, version: 2 }] }, noStops)
    await service.markSending(WS, a.id)
    await service.markSendFailed(WS, a.id, 'Envoi impossible')
    const retried = await service.markSending(WS, a.id)
    expect(retried?.status).toBe('sending')
  })

  it('`dispatchPayload` lit l’adresse SELON le canal, jamais devinée', async () => {
    const { service, contacts } = build()
    ;(contacts.rows[0] as Row).linkedin_url = 'https://linkedin.com/in/marie'
    const a = await draft(service)
    const payload = await service.dispatchPayload(WS, a as never)
    expect(payload.channel).toBe('email')
    expect(payload.address).toBe('marie@client.fr')
    expect(payload.subject).toBe('Bonjour Marie')
    expect(payload.body).toBe('Bonjour Marie\nVotre DSI recrute. En parler ?')
  })
})

describe('OutreachMessageService — filtre par contact (#2366.1, fiche Contact)', () => {
  it('`list` filtré par contact ne rend que les messages de CE contact', async () => {
    const { service, contacts } = build()
    const OTHER_CONTACT = '44444444-4444-4444-8444-444444444444'
    contacts.rows.push({ id: OTHER_CONTACT, workspace_id: WS, full_name: 'Paul Martin', title: null, email: null })
    const mine = await draft(service)
    await service.create(
      owner,
      {
        contact_id: OTHER_CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: 'Bonjour Paul',
        body: 'Bonjour Paul',
      },
      noStops,
    )
    const forContact = await service.list(owner, noStops, undefined, CONTACT)
    expect(forContact.map(m => m.id)).toEqual([mine.id])
  })
})

describe('OutreachMessageService — la tâche d’appel (#2366.5)', () => {
  it('suit sa propre machine et refuse un saut', async () => {
    const { service } = build()
    const call = await service.createCallTask(
      owner,
      {
        contact_id: CONTACT,
        source: 'today',
        reason: 'Nouveau DSI',
        objective: 'Obtenir un rendez-vous',
        // #2395.8 — désormais exigé, jamais un objectif seul.
        expected_outcome: 'Un rendez-vous confirmé',
      },
      noStops,
    )
    expect(call.status).toBe('proposed')
    // #2395 — le porteur de l'appel voyage avec lui : l'objet Action canonique
    // ne lit que MES appels, comme il ne lit que MES actions du plan.
    expect(call.user_id).toBe(owner.userId)
    await expect(
      service.transitionCallTask(owner, call.id, { to: 'qualified', cause: 'x', proof: null }),
    ).rejects.toBeInstanceOf(ConflictException)
    const ready = await service.transitionCallTask(owner, call.id, { to: 'ready', cause: 'prêt', proof: null })
    expect(ready.status).toBe('ready')
  })

  it('reporte l’échéance d’un appel — le sien seulement, jamais un appel terminé (L-A)', async () => {
    const { service } = build()
    const call = await service.createCallTask(
      owner,
      {
        contact_id: CONTACT,
        source: 'today',
        reason: 'Nouveau DSI',
        objective: 'Obtenir un rendez-vous',
        expected_outcome: 'Un rendez-vous confirmé',
      },
      noStops,
    )
    const moved = await service.postponeCallTask(owner, call.id, '2026-10-16T08:00:00.000Z')
    expect(moved.scheduled_at).toBe('2026-10-16T08:00:00.000Z')
    // un autre membre de l'espace, sans droit d'équipe : refusé
    await expect(
      service.postponeCallTask({ ...owner, userId: OTHER }, call.id, '2026-10-17T08:00:00.000Z'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    // un autre espace : introuvable (l'appartenance se vérifie par l'espace)
    await expect(
      service.postponeCallTask(
        { ...owner, workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        call.id,
        '2026-10-17T08:00:00.000Z',
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
    // un appel terminé ne se reporte pas
    await service.transitionCallTask(owner, call.id, { to: 'cancelled', cause: 'abandon', proof: null })
    await expect(service.postponeCallTask(owner, call.id, '2026-10-18T08:00:00.000Z')).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  /**
   * #2380.59 — GA-122 : `createCallTask` n'a jamais consulté AUCUNE porte
   * (absent du registre `send-paths-consult-the-stop.spec.ts`) — un contact
   * ayant dit « ne m'appelez plus » pouvait tout de même se voir proposer un
   * appel. La porte PERSONNE (`ContactStopService.stoppedAmong`, déjà
   * consultée par `create`/`list`/`approveMany`) ferme maintenant ce chemin
   * aussi.
   */
  it('refuse de proposer un appel à un contact arrêté (#2380.59)', async () => {
    const { service } = build()
    const stoppedContact = async () => new Set([CONTACT])
    await expect(
      service.createCallTask(
        owner,
        {
          contact_id: CONTACT,
          source: 'today',
          reason: 'Nouveau DSI',
          objective: 'Obtenir un rendez-vous',
          expected_outcome: 'Un rendez-vous confirmé',
        },
        stoppedContact,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})

/** Enregistre une réponse positive du contact — la même preuve que `MailboxService.stopSequencesForContact` écrit (#2381.6) : une séquence `cancelled` et sa transition `subject_kind='sequence'`, `cause='reply_positive'`, `result='applied'`. */
function recordConfirmedInterest(sequences: ReturnType<typeof repo>, transitions: ReturnType<typeof repo>): void {
  const sequenceId = '77777777-7777-4777-8777-777777777777'
  sequences.rows.push({ id: sequenceId, workspace_id: WS, contact_id: CONTACT, status: 'cancelled' })
  transitions.rows.push({
    id: '88888888-8888-4888-8888-888888888888',
    workspace_id: WS,
    subject_kind: 'sequence',
    subject_id: sequenceId,
    cause: 'reply_positive',
    result: 'applied',
  })
}

describe('OutreachMessageService — le gate d’envoi conditionnel (#2372.6)', () => {
  it('refuse de joindre un asset "after_interest_confirmed" tant qu’aucun intérêt n’est confirmé, avec une raison nommée', async () => {
    const { service, messages } = build()
    const attempt = service.create(
      owner,
      {
        contact_id: CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: 'Bonjour Marie',
        body: 'Bonjour Marie',
        asset_id: ASSET_AFTER_INTEREST,
      },
      noStops,
    )
    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    await expect(attempt).rejects.toThrow(/interest_not_confirmed/)
    expect(messages.rows).toHaveLength(0)
  })

  it('laisse joindre un asset "after_interest_confirmed" une fois une réponse positive enregistrée pour ce contact', async () => {
    const { service, sequences, transitions } = build()
    recordConfirmedInterest(sequences, transitions)
    const created = await service.create(
      owner,
      {
        contact_id: CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: 'Bonjour Marie',
        body: 'Bonjour Marie, voici le cas client demandé.',
        asset_id: ASSET_AFTER_INTEREST,
      },
      noStops,
    )
    expect(created.asset_id).toBe(ASSET_AFTER_INTEREST)
  })

  it('un asset "always" s’attache sans condition, intérêt confirmé ou non', async () => {
    const { service } = build()
    const created = await service.create(
      owner,
      {
        contact_id: CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: 'Bonjour Marie',
        body: 'Bonjour Marie, notre plaquette générale.',
        asset_id: ASSET_ALWAYS,
      },
      noStops,
    )
    expect(created.asset_id).toBe(ASSET_ALWAYS)
  })

  it('un asset introuvable dans cet espace refuse la préparation', async () => {
    const { service } = build()
    await expect(
      service.create(
        owner,
        {
          contact_id: CONTACT,
          channel: 'email',
          intent: 'open_relationship',
          source: 'contacts',
          subject: 'Bonjour Marie',
          body: 'Bonjour Marie',
          asset_id: '99999999-9999-4999-8999-999999999999',
        },
        noStops,
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

/**
 * #3420 (lot Q06, 30/09) — les critères de CONTEXTE, lus par le service sur ce
 * qu'il détient (statut du contact, messages déjà partis, messages de la même
 * séquence) — de la création au refus de validation.
 */
describe('OutreachMessageService — critères de contexte (#3420 lot Q06)', () => {
  const GOOD = 'Bonjour Marie,\nNous aidons des DSI sur leurs migrations. Seriez-vous ouverte à en parler ?'
  const make = (
    service: OutreachMessageService,
    over: Record<string, unknown> = {},
    link: { sequence_id: string; sequence_step_id: string } | null = null,
  ) =>
    service.create(
      owner,
      {
        contact_id: CONTACT,
        channel: 'email',
        intent: 'open_relationship',
        source: 'contacts',
        subject: null,
        body: GOOD,
        ...over,
      } as never,
      noStops,
      'user',
      link,
    )

  it('un message propre n’a aucun bloquant — le banc ne bloque pas tout', async () => {
    const { service } = build()
    const message = await make(service)
    expect((await service.get(owner, message.id, noStops)).blockers).toEqual([])
  })

  it('#9 refuse la validation d’un message à quelqu’un qui a REFUSÉ — pas de relance après un refus ferme', async () => {
    const { service, contacts } = build()
    ;(contacts.rows[0] as Record<string, unknown>).user_status = 'refused'
    const message = await make(service, { intent: 'follow_up' })
    const read = await service.get(owner, message.id, noStops)
    expect(read.blockers).toContain('contradicts_history')
    const result = await service.approveMany(owner, { items: [{ id: message.id, version: 1 }] }, noStops)
    expect(result.excluded).toEqual([{ id: message.id, reason: 'blocked' }])
  })

  it('#2 une OUVERTURE vers un contact déjà joint par un message PARTI est un mauvais scénario', async () => {
    const { service, messages } = build()
    messages.rows.push({ id: 'prior', workspace_id: WS, contact_id: CONTACT, status: 'sent', created_at: new Date() })
    const message = await make(service)
    expect((await service.get(owner, message.id, noStops)).blockers).toEqual(['relationship_scenario_mismatch'])
  })

  it('#10 deux étapes d’une même séquence qui se répètent mot pour mot sont signalées', async () => {
    const { service } = build()
    const sequence_id = '77777777-7777-4777-8777-777777777777'
    const step = '88888888-8888-4888-8888-888888888888'
    const first = await make(service, {}, { sequence_id, sequence_step_id: step })
    const second = await make(service, { intent: 'follow_up' }, { sequence_id, sequence_step_id: step })
    // L'étape 1 est la plus ancienne ; la seconde répète la première.
    expect((await service.get(owner, second.id, noStops)).blockers).toContain('sequence_inconsistent')
    expect((await service.get(owner, first.id, noStops)).blockers).toContain('sequence_inconsistent')
  })

  it('#11 un e-mail au-delà du plafond du canal est bloqué, le même texte en canal manuel ne l’est pas', async () => {
    const { service } = build()
    const long = `${GOOD} ${'mot '.repeat(160)}`
    const email = await make(service, { body: long })
    const manual = await make(service, { body: long, channel: 'manual' })
    expect((await service.get(owner, email.id, noStops)).blockers).toEqual(['too_long_for_channel'])
    expect((await service.get(owner, manual.id, noStops)).blockers).toEqual([])
  })
  // #3420 (recette prod 02/10, Y18) — « Le message ne cite rien de ce qu'on sait du
  // compte » s'affichait AUSSI sur un message « Validé » : contradiction. Un message
  // validé a passé le contrôle ; les motifs de qualité ne se lisent plus sur lui.
  // 49685bbf69 (#4399.7) : « migrations » cite désormais « migration » (racine du mot) ; le fait
  // à ne pas citer doit donc partager aucune racine avec GOOD.
  it('un message VALIDÉ ne porte aucun motif de qualité — le même texte à relire, lui, le porte', async () => {
    const { service, messages } = build()
    const toReview = await make(service, { reason: 'levée de fonds' })
    const validated = await make(service, { reason: 'levée de fonds' })
    expect((await service.get(owner, toReview.id, noStops)).blockers).toEqual(['scope_unclear'])
    const row = messages.rows.find(r => r.id === validated.id)!
    row.status = 'approved'
    expect((await service.get(owner, validated.id, noStops)).blockers).toEqual([])
  })

  // Louis 23/10 (recette prod, séquence Luca Dominicis) — « Le message ne cite rien de ce qu'on sait du compte »
  // alors que le brouillon cite le communiqué du 14/10 : les signaux du compte sont écrits sous la clé `signal`
  // (celle que la collecte pose), que la lecture des ancres ne regardait pas.
  describe('un fait cité (signal, communiqué, offre) est reconnu', () => {
    const ACCOUNT = '99999999-9999-4999-8999-999999999999'
    const withSignal = () => {
      const built = build()
      built.contacts.rows[0]!.account_id = ACCOUNT
      built.accounts.rows.push({
        id: ACCOUNT,
        workspace_id: WS,
        sector: null,
        recent_signals: [{ signal: 'Communiqué de presse : résultats semestriels', date: '2026-10-14' }],
      })
      return built
    }

    it('OUI : le brouillon cite le communiqué du signal du compte → pas de scope_unclear', async () => {
      const { service } = withSignal()
      const created = await make(service, {
        body: 'Bonjour Marie,\nVotre communiqué du 14/10 m’a interpellée. Seriez-vous ouverte à en parler ?',
      })
      expect((await service.get(owner, created.id, noStops)).blockers).not.toContain('scope_unclear')
    })

    it('NON : un brouillon qui ne cite rien de ce signal reste bloqué', async () => {
      const { service } = withSignal()
      const created = await make(service, { body: GOOD })
      expect((await service.get(owner, created.id, noStops)).blockers).toContain('scope_unclear')
    })
  })
})
