import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { NEAR_SIGNING_STAGES, activitySchema, projectStageInSql, type IngestActivityInput } from '@bellum/contracts'
import { ActivitiesService } from './activities.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const CONTACT = 'c0000000-0000-4000-8000-000000000001'
const PROJECT = 'p0000000-0000-4000-8000-000000000001'

function makeService(overrides: Partial<Record<string, unknown>> = {}) {
  const inserted: unknown[][] = []
  const queries: { sql: string; params: unknown[] }[] = []
  /** Les identifiants que l'insertion « accepte ». Une clé absente simule un
   *  conflit, c'est-à-dire une activité déjà connue. */
  const accepted = new Set<string>((overrides['accepted'] as string[]) ?? [])
  const rejectAll = overrides['rejectAll'] === true

  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('INSERT INTO activities')) {
        const externalId = params[14] as string | null
        if (rejectAll) return []
        if (externalId && accepted.size > 0 && !accepted.has(externalId)) return []
        inserted.push(params)
        return [{ id: `act-${inserted.length}` }]
      }
      if (sql.includes('FROM accounts WHERE id')) {
        return (overrides['accountExists'] ?? true) ? [{ id: params[0] }] : []
      }
      if (sql.includes('FROM profiles')) return []
      if (sql.startsWith('SELECT a.* FROM activities')) return (overrides['rows'] as unknown[]) ?? []
      if (sql.includes('SELECT DISTINCT ON (a.account_id)')) return (overrides['engagementRows'] as unknown[]) ?? []
      if (sql.includes('SELECT DISTINCT kind FROM activities')) return (overrides['observedKinds'] as unknown[]) ?? []
      if (sql.includes('-- near-signing: bellum')) return (overrides['nearSigningBellum'] as unknown[]) ?? []
      if (sql.includes('-- near-signing: crm')) return (overrides['nearSigningCrm'] as unknown[]) ?? []
      return []
    }),
  }

  const stored = (overrides['stored'] as Record<string, unknown> | undefined) ?? {
    id: 'act-1',
    workspace_id: WORKSPACE,
    user_id: USER,
    source: 'manual',
  }
  const activities = {
    manager,
    save: jest.fn(async (entity: Record<string, unknown>) => ({ id: 'saved-1', ...entity })),
    create: jest.fn((entity: Record<string, unknown>) => entity),
    findOne: jest.fn(async () => (overrides['missing'] === true ? null : stored)),
    delete: jest.fn(async () => ({ affected: 1 })),
  }
  const participants = { find: jest.fn(async () => []), insert: jest.fn(async () => undefined) }
  const contacts = {
    findOne: jest.fn(async () =>
      overrides['contactExists'] === false
        ? null
        : {
            id: CONTACT,
            account_id: ACCOUNT,
            email: overrides['contactEmail'] === undefined ? 'marie@acme.fr' : overrides['contactEmail'],
          },
    ),
  }
  const projects = {
    findOne: jest.fn(async () => (overrides['projectExists'] === false ? null : { id: PROJECT, account_id: ACCOUNT })),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const dataSource = { query: jest.fn(async () => []) }
  const actionPlanItems = { createManual: jest.fn(async () => ({ id: 'plan-item-1' })) }
  // #2984 — le lien de synchronisation CRM (SyncLinkEntity) : `null` par
  // défaut, comme un workspace sans CRM connecté ou un contact non lié.
  const syncLinks = { findOne: jest.fn(async () => (overrides['syncLink'] as unknown) ?? null) }
  // `crm` sert les DEUX appelants (#2984 diff proposé, #2386.A writeback
  // manuel) : `findContactRecord` pour le second, `logActivity` pour les
  // deux. `overrides['crm'] === false` simule un workspace sans CRM connecté
  // (dépendance `@Optional()`, règle #7).
  const crm =
    overrides['crm'] === false
      ? undefined
      : {
          findContactRecord: jest.fn(
            async () =>
              (overrides['crmRecord'] as { recordId: string; provider: 'hubspot'; email: string } | undefined) ?? null,
          ),
          logActivity: jest.fn(async () => ({ id: 'crm-note-1' })),
        }

  const service = new ActivitiesService(
    activities as never,
    participants as never,
    contacts as never,
    projects as never,
    workspaceContext as never,
    dataSource as never,
    actionPlanItems as never,
    syncLinks as never,
    crm as never,
  )
  return {
    service,
    activities,
    participants,
    contacts,
    projects,
    inserted,
    queries,
    manager,
    actionPlanItems,
    syncLinks,
    crm,
  }
}

const EMAIL: IngestActivityInput = {
  kind: 'email',
  source: 'mailbox',
  direction: 'outbound',
  subject: 'Proposition',
  body: 'Bonjour',
  occurredAt: '2026-08-10T09:00:00.000Z',
  durationSeconds: null,
  accountId: ACCOUNT,
  contactId: CONTACT,
  projectId: null,
  linkReason: 'contact_email',
  externalId: 'msg-1',
  externalUrl: null,
  participants: [],
}

describe('ActivitiesService.ingest', () => {
  it('écrit une activité et la compte', async () => {
    const { service } = makeService()
    await expect(service.ingest(WORKSPACE, USER, [EMAIL])).resolves.toEqual({ ingested: 1, duplicates: 0 })
  })

  it('laisse la BASE trancher le doublon — pas un SELECT préalable', async () => {
    // Deux captures concurrentes (un cron et un clic) passeraient toutes les
    // deux un contrôle préalable. Seule la clause de conflit tranche, et le
    // nombre de lignes réellement écrites est ce qu'on rapporte.
    const { service, queries } = makeService({ rejectAll: true })
    await expect(service.ingest(WORKSPACE, USER, [EMAIL])).resolves.toEqual({ ingested: 0, duplicates: 1 })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO activities'))
    expect(insert?.sql).toContain('ON CONFLICT')
    expect(insert?.sql).toContain('DO NOTHING')
  })

  it('dédoublonne le lot AVANT de l’envoyer en base', async () => {
    const { service, inserted } = makeService()
    const result = await service.ingest(WORKSPACE, USER, [EMAIL, { ...EMAIL, subject: 'Copie' }])
    expect(result.ingested).toBe(1)
    expect(inserted).toHaveLength(1)
  })

  it('n’écrit rien sur un lot vide, et n’appelle pas la base', async () => {
    const { service, manager } = makeService()
    await expect(service.ingest(WORKSPACE, USER, [])).resolves.toEqual({ ingested: 0, duplicates: 0 })
    expect(manager.query).not.toHaveBeenCalled()
  })

  it('coupe un corps trop long et le MARQUE', async () => {
    const { service, inserted } = makeService()
    await service.ingest(WORKSPACE, USER, [{ ...EMAIL, body: 'x'.repeat(200_000) }])
    const [params] = inserted
    expect((params?.[6] as string).length).toBe(100_000)
    expect(params?.[7]).toBe(true)
  })

  it('écrit les participants du même coup', async () => {
    const { service, participants } = makeService()
    await service.ingest(WORKSPACE, USER, [
      { ...EMAIL, participants: [{ handle: 'marie@acme.fr', displayName: 'Marie', contactId: null, isSelf: false }] },
    ])
    expect(participants.insert).toHaveBeenCalledWith([
      expect.objectContaining({ handle: 'marie@acme.fr', is_self: false }),
    ])
  })

  it('n’écrit AUCUN participant quand l’activité a été refusée en doublon', async () => {
    // Sinon la table de participants grossirait à chaque capture rejouée, en
    // pointant des activités qui n'ont pas été créées.
    const { service, participants } = makeService({ rejectAll: true })
    await service.ingest(WORKSPACE, USER, [
      { ...EMAIL, participants: [{ handle: 'marie@acme.fr', displayName: null, contactId: null, isSelf: false }] },
    ])
    expect(participants.insert).not.toHaveBeenCalled()
  })
})

describe('ActivitiesService.log', () => {
  it('complète le compte depuis le contact — une activité mi-rattachée n’apparaît nulle part', async () => {
    const { service, activities } = makeService()
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      contactId: CONTACT,
      durationSeconds: 300,
    })
    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: ACCOUNT, contact_id: CONTACT, source: 'manual', link_reason: 'manual' }),
    )
  })

  it('complète le compte depuis le projet', async () => {
    const { service, activities } = makeService()
    await service.log(USER, { kind: 'meeting', direction: 'outbound', projectId: PROJECT, durationSeconds: null })
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ account_id: ACCOUNT }))
  })

  it('refuse un contact d’un autre espace plutôt que de rattacher au flair', async () => {
    // ⚠️ Ce test SIMULE l'absence (`contactExists: false`) : le dépôt rend
    // `null` quelle que soit la requête, donc il prouvait le refus AVANT que le
    // code sache le faire — la borne `workspace_id` manquait à la lecture
    // jusqu'au 22/09/2026 (#2671). La preuve réelle, avec un dépôt qui honore
    // son `where`, vit dans `activities.scope.spec.ts` ; celui-ci garde le
    // comportement visible (404 plutôt qu'un rattachement au flair).
    const { service } = makeService({ contactExists: false })
    await expect(
      service.log(USER, { kind: 'call', direction: 'outbound', contactId: CONTACT, durationSeconds: null }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse un compte hors de l’espace', async () => {
    const { service } = makeService({ accountExists: false })
    await expect(
      service.log(USER, { kind: 'call', direction: 'outbound', accountId: ACCOUNT, durationSeconds: null }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse une activité sans aucune cible', async () => {
    const { service } = makeService()
    await expect(
      service.log(USER, { kind: 'call', direction: 'outbound', durationSeconds: null } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('date à maintenant quand rien n’est fourni, sans jamais laisser une date vide', async () => {
    const { service, activities } = makeService()
    await service.log(USER, { kind: 'note', direction: 'internal', accountId: ACCOUNT, durationSeconds: null })
    const created = activities.create.mock.calls[0]?.[0] as { occurred_at: Date }
    expect(created.occurred_at).toBeInstanceOf(Date)
    expect(Number.isNaN(created.occurred_at.getTime())).toBe(false)
  })

  it('écrit l’issue d’un appel, et la rend dans l’activité créée', async () => {
    const { service } = makeService()
    const activity = await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
      outcome: 'voicemail',
    })
    expect(activity.outcome).toBe('voicemail')
  })

  it('un appel SANS issue écrit `null` — « non renseignée », jamais un défaut', async () => {
    const { service, activities } = makeService()
    const activity = await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
    })
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ call_outcome: null }))
    expect(activity.outcome).toBeNull()
  })

  it('n’écrit jamais d’issue sur autre chose qu’un appel', async () => {
    const { service, activities } = makeService()
    await service.log(USER, { kind: 'meeting', direction: 'outbound', accountId: ACCOUNT, durationSeconds: null })
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ call_outcome: null }))
  })

  // #2377.4 — le debrief structuré s'écrit à côté du corps, jamais dedans.
  it('écrit le debrief structuré séparément du corps libre', async () => {
    const { service, activities } = makeService()
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
      body: 'Note libre',
      callDebrief: { fact: 'Marie ne porte pas le sujet', need: 'Reprise en janvier' },
    })
    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Note libre',
        // #2984 — `followUpDraft` rejoint désormais l'objet : composé à partir
        // du même `need` que ce test vérifiait déjà séparément.
        call_debrief: expect.objectContaining({
          fact: 'Marie ne porte pas le sujet',
          need: 'Reprise en janvier',
          nextAction: null,
        }),
      }),
    )
  })

  // #2377.6 — la prochaine action complète crée une VRAIE ligne
  // `action_plan_items`, réutilisée telle quelle, jamais un second système.
  it('crée une prochaine action dans le plan quand owner/date/condition sont fournis', async () => {
    const { service, actionPlanItems } = makeService()
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
      outcome: 'callback_scheduled',
      nextAction: { owner: 'Camille', dueDate: '2026-01-08', condition: 'si Marie ne rappelle pas' },
    })
    expect(actionPlanItems.createManual).toHaveBeenCalledWith(
      USER,
      ACCOUNT,
      expect.objectContaining({
        dueDate: '2026-01-08',
        ownerName: 'Camille',
        reason: 'si Marie ne rappelle pas',
      }),
    )
  })

  // #2377.6 — refusée à la création : sans compte à rattacher, aucune ligne
  // silencieusement perdue.
  it('REFUSE une prochaine action sans compte résolvable — erreur claire', async () => {
    const { service, actionPlanItems } = makeService()
    await expect(
      service.log(USER, {
        kind: 'call',
        direction: 'outbound',
        durationSeconds: null,
        nextAction: { owner: 'Camille', dueDate: '2026-01-08', condition: 'si Marie ne rappelle pas' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(actionPlanItems.createManual).not.toHaveBeenCalled()
  })

  it('sans debrief ni prochaine action, `call_debrief` reste `null`', async () => {
    const { service, activities } = makeService()
    await service.log(USER, { kind: 'call', direction: 'outbound', accountId: ACCOUNT, durationSeconds: null })
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ call_debrief: null }))
  })

  /*
   * #2386.A — la capture d'un outcome d'appel écrit son CRM : la porte
   * (`CrmService.logActivity`, déjà branchée depuis la téléphonie) existait
   * SANS appelant depuis la saisie manuelle — le chemin le plus fréquent
   * (LogActivityDialog, TimelinePanel) ne l'a jamais franchie.
   */
  it('écrit une note dans le CRM quand un appel avec issue est rattaché à un contact que le CRM connaît', async () => {
    const { service, crm } = makeService({
      crmRecord: { recordId: 'hs-42', provider: 'hubspot', email: 'marie@acme.fr' },
    })
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      contactId: CONTACT,
      durationSeconds: null,
      outcome: 'connected_qualified',
    })
    expect(crm?.findContactRecord).toHaveBeenCalledWith(USER, 'marie@acme.fr')
    expect(crm?.logActivity).toHaveBeenCalledWith(USER, 'hs-42', expect.stringContaining('Échange qualifié'))
  })

  it('n’écrit rien dans le CRM quand celui-ci ne connaît pas l’adresse du contact', async () => {
    const { service, crm } = makeService({ crmRecord: null })
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      contactId: CONTACT,
      durationSeconds: null,
      outcome: 'no_answer',
    })
    expect(crm?.logActivity).not.toHaveBeenCalled()
  })

  it('n’interroge même pas le CRM quand l’appel n’a pas d’issue — rien à écrire', async () => {
    const { service, crm } = makeService({
      crmRecord: { recordId: 'hs-42', provider: 'hubspot', email: 'marie@acme.fr' },
    })
    await service.log(USER, { kind: 'call', direction: 'outbound', contactId: CONTACT, durationSeconds: null })
    expect(crm?.findContactRecord).not.toHaveBeenCalled()
    expect(crm?.logActivity).not.toHaveBeenCalled()
  })

  it('sans e-mail sur le contact, le CRM n’est jamais interrogé', async () => {
    const { service, crm } = makeService({ contactEmail: null })
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      contactId: CONTACT,
      durationSeconds: null,
      outcome: 'voicemail',
    })
    expect(crm?.findContactRecord).not.toHaveBeenCalled()
  })

  it('une écriture CRM en échec ne fait jamais échouer l’activité — l’appel reste consigné', async () => {
    const { service, crm, activities } = makeService({
      crmRecord: { recordId: 'hs-42', provider: 'hubspot', email: 'marie@acme.fr' },
    })
    crm?.logActivity.mockRejectedValueOnce(new Error('HubSpot indisponible'))
    const activity = await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      contactId: CONTACT,
      durationSeconds: null,
      outcome: 'voicemail',
    })
    expect(activity).toBeDefined()
    expect(activities.save).toHaveBeenCalled()
  })
})

// #2984 — le consentement voyage DANS `call_debrief`, DÉCLARATIF : il ne bloque
// jamais l'écriture, contrairement à `recordingConsent: z.literal(true)` sur la
// transcription audio réelle (#2319.57).
describe('ActivitiesService#log — recordingConsent, déclaratif', () => {
  it('écrit recordingConsent à true dans call_debrief', async () => {
    const { service, activities } = makeService()
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
      recordingConsent: true,
    })
    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({ call_debrief: expect.objectContaining({ recordingConsent: true }) }),
    )
  })

  it('écrit recordingConsent à false — un refus reste un état honnête, jamais un blocage', async () => {
    const { service, activities } = makeService()
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
      recordingConsent: false,
    })
    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({ call_debrief: expect.objectContaining({ recordingConsent: false }) }),
    )
  })

  it('non déclaré, ne fabrique pas de `call_debrief` à lui seul', async () => {
    const { service, activities } = makeService()
    await service.log(USER, { kind: 'call', direction: 'outbound', accountId: ACCOUNT, durationSeconds: null })
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ call_debrief: null }))
  })
})

// #2984 — le brouillon de suivi : composé côté service, jamais par le modèle,
// à partir SEULEMENT de ce que le commercial a réellement saisi.
describe('ActivitiesService#log — le brouillon de message de suivi', () => {
  it('compose un brouillon quand un debrief a été saisi', async () => {
    const { service, activities } = makeService()
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
      callDebrief: { need: 'Reprise de projet en janvier' },
    })
    const [[written]] = activities.create.mock.calls
    const draft = (written as { call_debrief: { followUpDraft: { subject: string | null; body: string } } })
      .call_debrief.followUpDraft
    expect(draft.body).toContain('Reprise de projet en janvier')
  })

  it('ne compose AUCUN brouillon quand rien n’a été capturé — rien d’inventé', async () => {
    const { service, activities } = makeService()
    await service.log(USER, { kind: 'call', direction: 'outbound', accountId: ACCOUNT, durationSeconds: null })
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ call_debrief: null }))
  })

  it('un appel sans debrief mais avec une issue compose quand même un brouillon', async () => {
    const { service, activities } = makeService()
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      accountId: ACCOUNT,
      durationSeconds: null,
      outcome: 'interest',
    })
    const [[written]] = activities.create.mock.calls
    const debrief = (written as { call_debrief: { followUpDraft: { body: string } | null } | null }).call_debrief
    expect(debrief?.followUpDraft).not.toBeNull()
  })
})

// #2984 — le diff CRM proposé : réutilise la porte existante
// (`OutboundWriteService`, via `CrmService.logActivity`), jamais une seconde
// écriture. `origin: 'system'` : la demande reste `pending`, rien ne part tout
// seul — c'est le comportement déjà éprouvé par la porte, pas réinventé ici.
describe('ActivitiesService#log — le diff CRM proposé, best-effort', () => {
  const SYNC_LINK = { provider: 'hubspot', external_id: 'hs-42' }

  it('propose une note CRM quand le contact est lié à un CRM connecté', async () => {
    const { service, crm, syncLinks } = makeService({ syncLink: SYNC_LINK })
    await service.log(USER, {
      kind: 'call',
      direction: 'outbound',
      contactId: CONTACT,
      durationSeconds: null,
      outcome: 'interest',
    })
    expect(syncLinks.findOne).toHaveBeenCalled()
    expect(crm?.logActivity).toHaveBeenCalledWith(USER, 'hs-42', expect.any(String), { origin: 'system' })
  })

  it('ne propose AUCUNE note sans lien CRM pour ce contact', async () => {
    const { service, crm } = makeService()
    await service.log(USER, { kind: 'call', direction: 'outbound', contactId: CONTACT, durationSeconds: null })
    expect(crm?.logActivity).not.toHaveBeenCalled()
  })

  it('un échec de la porte CRM ne fait PAS échouer la saisie de l’appel', async () => {
    const { service, crm } = makeService({ syncLink: SYNC_LINK })
    ;(crm as { logActivity: jest.Mock }).logActivity.mockRejectedValueOnce(new Error('HubSpot indisponible'))
    await expect(
      service.log(USER, {
        kind: 'call',
        direction: 'outbound',
        contactId: CONTACT,
        durationSeconds: null,
        outcome: 'interest',
      }),
    ).resolves.toBeDefined()
  })
})

/**
 * #1791.2 — la trace de ce que Laura lit chez un connecteur.
 *
 * `POST internal/copilot/crm/presence` journalisait dans le logger serveur —
 * rien dans le journal que l'utilisateur peut consulter. Décision de Louis :
 * une entrée VISIBLE, sur le compte concerné (celui dont on a demandé la
 * présence), au même endroit que ses e-mails et ses rendez-vous.
 *
 * ⚠️⚠️ Deux choses que cette suite garde, chacune une doctrine du dépôt :
 *
 *  1. **Le GESTE, jamais le CONTENU.** « Laura a consulté ton CRM » se lit
 *     depuis le seul `kind` (traduit côté client) ; aucun champ ne porte ce
 *     qu'elle y a trouvé — ni `matched`, ni le nombre de contacts, ni le nom
 *     d'un CRM. `subject` et `body` restent `null` : les remplir d'une phrase
 *     ferait aussi le défaut connu « libellé français écrit dans une ligne
 *     figée pour toujours ».
 *  2. **`source: 'system'`, jamais `'crm'` ni `'manual'`.** Ce n'est ni une
 *     ligne CAPTURÉE chez le fournisseur (elle ne vient pas d'une boîte mail
 *     ou d'un agenda synchronisé), ni une SAISIE humaine — c'est le système
 *     qui journalise son propre geste. `direction: 'internal'` : ce n'est pas
 *     une touche envoyée au client.
 */
describe('ActivitiesService.recordCrmLookup — #1791.2', () => {
  /**
   * ⚠️ `toEqual` sur l'objet ENTIER, pas `objectContaining` : une garde qui
   * n'accepte que la présence des champs autorisés laisserait passer un champ
   * EN PLUS — exactement la façon dont un contenu (« matched », un compte de
   * contacts, un nom de CRM) fuirait sans qu'aucune assertion ne le voie.
   */
  it('écrit le GESTE seul : compte, espace, auteur, kind — jamais ce qu’elle a trouvé', async () => {
    const { service, activities } = makeService()
    await service.recordCrmLookup(WORKSPACE, USER, ACCOUNT)
    const created = activities.create.mock.calls[0]?.[0] as Record<string, unknown>
    expect(created.occurred_at).toBeInstanceOf(Date)
    const { occurred_at: _occurredAt, ...rest } = created
    expect(rest).toEqual({
      workspace_id: WORKSPACE,
      user_id: USER,
      account_id: ACCOUNT,
      kind: 'crm_lookup',
      source: 'system',
      direction: 'internal',
      subject: null,
      body: null,
      body_truncated: false,
      contact_id: null,
      project_id: null,
      link_reason: null,
      duration_seconds: null,
      external_id: null,
      external_url: null,
      call_outcome: null,
    })
    expect(activities.save).toHaveBeenCalled()
  })

  it('date à MAINTENANT — le « quand » est le moment de la lecture, jamais une date fournie de l’extérieur', async () => {
    const { service, activities } = makeService()
    const before = Date.now()
    await service.recordCrmLookup(WORKSPACE, USER, ACCOUNT)
    const created = activities.create.mock.calls[0]?.[0] as { occurred_at: Date }
    expect(created.occurred_at).toBeInstanceOf(Date)
    expect(created.occurred_at.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('sait dire NON — un contenu ajouté (matched, un compte de contacts) ferait échouer l’égalité exacte', async () => {
    const { service, activities } = makeService()
    await service.recordCrmLookup(WORKSPACE, USER, ACCOUNT)
    const created = activities.create.mock.calls[0]?.[0] as Record<string, unknown>
    // Casse volontairement l'attendu : si `recordCrmLookup` se mettait un jour
    // à écrire `matched` ou `contacts_count`, CETTE assertion — la même forme
    // que celle du premier test — le détecterait au lieu de rester silencieuse.
    expect(created).not.toHaveProperty('matched')
    expect(created).not.toHaveProperty('contacts_count')
    expect(created).not.toHaveProperty('connected')
  })
})

describe('ActivitiesService.timeline', () => {
  it('sur un COMPTE, remonte aussi ce qui touche ses contacts et ses projets', async () => {
    // Un e-mail est adressé à quelqu'un, pas à une société : une timeline de
    // compte qui n'affiche que les lignes portant `account_id` serait vide
    // dans le cas le plus courant.
    const { service, queries } = makeService()
    await service.timeline(USER, 'account', ACCOUNT)
    const read = queries.find(entry => entry.sql.startsWith('SELECT a.* FROM activities'))
    expect(read?.sql).toContain('FROM contacts WHERE account_id')
    expect(read?.sql).toContain('FROM opportunities WHERE account_id')
  })

  it('sur un CONTACT, ne remonte que ses lignes', async () => {
    const { service, queries } = makeService()
    await service.timeline(USER, 'contact', CONTACT)
    const read = queries.find(entry => entry.sql.startsWith('SELECT a.* FROM activities'))
    expect(read?.sql).toContain('a.contact_id =')
    expect(read?.sql).not.toContain('FROM contacts WHERE account_id')
  })

  it('trie du plus récent et borne à 200', async () => {
    const { service, queries } = makeService()
    await service.timeline(USER, 'account', ACCOUNT, { limit: 5000 })
    const read = queries.find(entry => entry.sql.startsWith('SELECT a.* FROM activities'))
    expect(read?.sql).toContain('ORDER BY a.occurred_at DESC')
    expect(read?.params.at(-1)).toBe(200)
  })

  it('rend un engagement vide plutôt qu’une erreur sur une fiche sans activité', async () => {
    const { service } = makeService({ rows: [] })
    const result = await service.timeline(USER, 'account', ACCOUNT)
    expect(result.items).toEqual([])
    expect(result.engagement.total).toBe(0)
    expect(result.engagement.awaitingReply).toBe(false)
  })

  it('rend l’engagement calculé sur les lignes lues', async () => {
    const { service } = makeService({
      rows: [
        {
          id: 'act-1',
          kind: 'email',
          source: 'mailbox',
          direction: 'outbound',
          subject: 'Relance',
          body: null,
          body_truncated: false,
          occurred_at: '2026-08-10T09:00:00.000Z',
          duration_seconds: null,
          account_id: ACCOUNT,
          contact_id: CONTACT,
          project_id: null,
          link_reason: 'contact_email',
          user_id: null,
          external_id: 'msg-1',
          external_url: null,
          created_at: '2026-08-10T09:00:00.000Z',
        },
      ],
    })
    const result = await service.timeline(USER, 'account', ACCOUNT)
    expect(result.items).toHaveLength(1)
    expect(result.engagement.awaitingReply).toBe(true)
    expect(result.engagement.lastOutboundAt).toBe('2026-08-10T09:00:00.000Z')
  })

  it('#2744.1 — l’engagement ne compte que les ÉCHANGES (INTERACTION_ACTIVITY_KINDS), pas une activité interne : même prédicat que le filtre « Interactions »', async () => {
    const { service } = makeService({
      rows: [
        {
          id: 'act-task',
          kind: 'task',
          source: 'manual',
          direction: 'internal',
          subject: 'Relancer le devis',
          body: null,
          body_truncated: false,
          occurred_at: '2026-08-10T09:00:00.000Z',
          duration_seconds: null,
          account_id: ACCOUNT,
          contact_id: null,
          project_id: null,
          link_reason: 'manual',
          user_id: null,
          external_id: null,
          external_url: null,
          created_at: '2026-08-10T09:00:00.000Z',
        },
      ],
    })
    const result = await service.timeline(USER, 'account', ACCOUNT)
    // La ligne reste dans la liste (visible sous « Tout » et « Actions »)…
    expect(result.items).toHaveLength(1)
    // … mais une tâche n'est pas un ÉCHANGE : le badge ne doit jamais dire
    // « 1 échange » quand le filtre « Interactions » ne montre rien.
    expect(result.engagement.total).toBe(0)
  })

  it('relit l’issue d’un appel — écrite à l’insertion, elle doit être RENDUE ici (même défaut que channel/verdict)', async () => {
    const { service } = makeService({
      rows: [
        {
          id: 'act-call',
          kind: 'call',
          source: 'manual',
          direction: 'outbound',
          subject: null,
          body: null,
          body_truncated: false,
          occurred_at: '2026-08-10T09:00:00.000Z',
          duration_seconds: 180,
          account_id: ACCOUNT,
          contact_id: null,
          project_id: null,
          link_reason: 'manual',
          user_id: null,
          external_id: null,
          external_url: null,
          created_at: '2026-08-10T09:00:00.000Z',
          call_outcome: 'connected_qualified',
        },
      ],
    })
    const result = await service.timeline(USER, 'account', ACCOUNT)
    expect(result.items[0]?.outcome).toBe('connected_qualified')
  })

  it('une ligne HÉRITÉE (colonne absente) se lit « non renseignée », jamais plantée ni confirmée', async () => {
    const { service } = makeService({
      rows: [
        {
          id: 'act-legacy-call',
          kind: 'call',
          source: 'telephony',
          direction: 'inbound',
          subject: null,
          body: null,
          body_truncated: false,
          occurred_at: '2026-08-01T09:00:00.000Z',
          duration_seconds: 60,
          account_id: ACCOUNT,
          contact_id: null,
          project_id: null,
          link_reason: 'account_domain',
          user_id: null,
          external_id: 'call-1',
          external_url: null,
          created_at: '2026-08-01T09:00:00.000Z',
          // Pas de `call_outcome` : exactement la forme d'une ligne écrite
          // avant cette colonne.
        },
      ],
    })
    const result = await service.timeline(USER, 'account', ACCOUNT)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.outcome).toBeNull()
  })
})

describe('ActivitiesService.remove', () => {
  it('retire une saisie MANUELLE faite par son auteur', async () => {
    const { service, activities } = makeService()
    await service.remove(USER, 'act-1')
    expect(activities.delete).toHaveBeenCalledWith({ id: 'act-1' })
  })

  it('REFUSE de retirer une activité capturée', async () => {
    // L'effacer ne ferait pas disparaître l'e-mail chez le fournisseur, et la
    // prochaine récupération la ramènerait. Un bouton qui ne tient pas est pire
    // que pas de bouton.
    const { service, activities } = makeService({
      stored: { id: 'act-1', workspace_id: WORKSPACE, user_id: USER, source: 'mailbox' },
    })
    await expect(service.remove(USER, 'act-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(activities.delete).not.toHaveBeenCalled()
  })

  it('REFUSE de retirer la saisie d’un collègue', async () => {
    // Effacer la note de quelqu'un d'autre réécrit l'historique d'un compte
    // partagé — un document qu'on peut réécrire n'est plus cru.
    const { service } = makeService({
      stored: { id: 'act-1', workspace_id: WORKSPACE, user_id: 'someone-else', source: 'manual' },
    })
    await expect(service.remove(USER, 'act-1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('404 sur une activité d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.remove(USER, 'act-1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

/* ------------------------------------------------------------------------- */
/*  D65 — le corps d'un message ne sort qu'à son auteur                       */
/* ------------------------------------------------------------------------- */

describe('ActivitiesService.timeline — le corps n’appartient qu’à son auteur', () => {
  const OTHER = 'u0000000-0000-4000-8000-000000000002'
  const row = (userId: string | null) => ({
    id: 'act-1',
    kind: 'email',
    source: 'mailbox',
    direction: 'outbound',
    subject: 'Proposition tarifaire',
    body: 'Bonjour, voici notre proposition à 620 € / jour.',
    body_truncated: true,
    occurred_at: '2026-08-10T09:00:00.000Z',
    duration_seconds: null,
    account_id: ACCOUNT,
    contact_id: CONTACT,
    project_id: null,
    link_reason: 'contact_email',
    user_id: userId,
    external_id: 'msg-1',
    external_url: null,
    channel: 'mail_draft',
    verdict: 'sent',
    created_at: '2026-08-10T09:00:00.000Z',
  })

  it('rend le corps à celui qui l’a écrit', async () => {
    const { service } = makeService({ rows: [row(USER)] })
    const result = await service.timeline(USER, 'account', ACCOUNT)
    expect(result.items[0]?.body).toBe('Bonjour, voici notre proposition à 620 € / jour.')
    expect(result.items[0]?.bodyRedacted).toBe(false)
    expect(result.items[0]?.bodyTruncated).toBe(true)
  })

  it('RETIRE le corps du message d’un collègue', async () => {
    // La timeline est scopée à l'espace et rendait `body` tel quel : n'importe
    // quel membre lisait le texte intégral des messages de n'importe quel autre,
    // sans permission ni trace. Le 21/08 avait fermé la lecture croisée des
    // boîtes ; la timeline recopiait le même contenu par l'autre bout.
    const { service } = makeService({ rows: [row(OTHER)] })
    const result = await service.timeline(USER, 'account', ACCOUNT)
    expect(result.items[0]?.body).toBeNull()
    expect(result.items[0]?.bodyRedacted).toBe(true)
  })

  it('garde TOUT le reste — c’est ce qu’un responsable doit voir', async () => {
    const { service } = makeService({ rows: [row(OTHER)] })
    const [item] = (await service.timeline(USER, 'account', ACCOUNT)).items
    expect(item?.subject).toBe('Proposition tarifaire')
    expect(item?.kind).toBe('email')
    expect(item?.direction).toBe('outbound')
    expect(item?.occurredAt).toBe('2026-08-10T09:00:00.000Z')
    expect(item?.userId).toBe(OTHER)
  })

  /**
   * Le commentaire du service promet « canal, objet, date, VERDICT » ; l'objet
   * rendu n'en portait aucun des deux jusqu'au 28/08/2026. Les colonnes sont
   * écrites à l'insertion, `SELECT a.*` les ramène, et le mapper les laissait
   * tomber — `activitySchema` les déclare `nullish`, donc rien ne protestait.
   *
   * On asserte la FORME contre le schéma — `.pick()` plutôt que le schéma
   * entier, parce que les identifiants de cette fixture sont volontairement
   * lisibles (`act-1`) et ne passeraient pas la validation `uuid`. Ce qui
   * compte ici est que les deux valeurs rendues appartiennent bien aux
   * énumérations du contrat, et pas seulement qu'elles soient présentes.
   */
  it('rend le canal et le verdict — écrits à l’insertion, ils doivent se relire', async () => {
    const { service } = makeService({ rows: [row(USER)] })
    const [item] = (await service.timeline(USER, 'account', ACCOUNT)).items

    expect(item?.channel).toBe('mail_draft')
    expect(item?.verdict).toBe('sent')
    expect(activitySchema.pick({ channel: true, verdict: true }).parse(item)).toEqual({
      channel: 'mail_draft',
      verdict: 'sent',
    })
  })

  it('rend `null` plutôt qu’absent quand la ligne n’en porte pas', async () => {
    // Une capture en LECTURE n'a pas de canal d'envoi : `null` est la valeur
    // VRAIE, et elle se distingue d'un champ qu'on aurait oublié de rendre.
    const { service } = makeService({ rows: [{ ...row(USER), channel: null, verdict: null }] })
    const [item] = (await service.timeline(USER, 'account', ACCOUNT)).items

    expect(item).toHaveProperty('channel', null)
    expect(item).toHaveProperty('verdict', null)
  })

  it('masque en cas de doute : une activité sans auteur identifié', async () => {
    const { service } = makeService({ rows: [row(null)] })
    const [item] = (await service.timeline(USER, 'account', ACCOUNT)).items
    expect(item?.body).toBeNull()
    expect(item?.bodyRedacted).toBe(true)
  })

  it('un échange SANS corps n’est pas « masqué » — il n’en a pas', async () => {
    // Le drapeau ne doit pas se déclencher sur un appel sans transcription :
    // « contenu réservé » à côté d'un appel ferait chercher un texte inexistant.
    const { service } = makeService({ rows: [{ ...row(OTHER), body: null }] })
    const [item] = (await service.timeline(USER, 'account', ACCOUNT)).items
    expect(item?.bodyRedacted).toBe(false)
  })
})

/**
 * #3903 — le bilan de relance multi-sources sur une fenêtre. Une LECTURE : la
 * classification vit dans `engagement-report.ts` (testée seule) ; ce bloc
 * vérifie que le service assemble la bonne requête et relaie les lignes.
 */
describe('engagementReport (#3903)', () => {
  const SINCE = '2026-07-01T00:00:00.000Z'

  function engagementRow(overrides: Record<string, unknown> = {}) {
    return {
      account_id: ACCOUNT,
      company_name: 'Acme',
      last_occurred_at: '2026-09-01T00:00:00.000Z',
      last_direction: 'outbound',
      last_kind: 'email',
      attempts: '3',
      ...overrides,
    }
  }

  it('relaie chaque compte avec sa dernière interaction, ses tentatives et sa catégorie dérivée', async () => {
    const { service } = makeService({ engagementRows: [engagementRow()] })
    const rows = await service.engagementReport(WORKSPACE, SINCE)
    expect(rows).toEqual([
      {
        accountId: ACCOUNT,
        companyName: 'Acme',
        lastOccurredAt: '2026-09-01T00:00:00.000Z',
        lastDirection: 'outbound',
        lastKind: 'email',
        attempts: 3,
        consecutiveOutboundEmails: 0,
        openCrmDeals: 0,
        openCrmDealNames: [],
        category: 'a_relancer',
      },
    ])
  })

  it('#3904 (décision Louis 09/10) — relaie le nombre d’e-mails SORTANTS consécutifs restés sans réponse', async () => {
    const { service, manager } = makeService({
      engagementRows: [engagementRow({ consecutive_outbound_emails: '2' })],
    })
    const [row] = await service.engagementReport(WORKSPACE, SINCE)
    expect(row?.consecutiveOutboundEmails).toBe(2)
    const call = manager.query.mock.calls.find(([sql]: [string]) => sql.includes('SELECT DISTINCT ON (a.account_id)'))
    // « Consécutifs » : seuls comptent les e-mails sortants POSTÉRIEURS à toute
    // autre interaction (une réponse, un appel, une réunion casse la série).
    expect(call?.[0]).toContain("a3.kind = 'email' AND a3.direction = 'outbound'")
    expect(call?.[0]).toContain("NOT (a4.kind = 'email' AND a4.direction = 'outbound')")
  })

  it('#3903 (lot M01) — un deal CRM OUVERT rattaché au compte le classe « deal jamais closé », nommé', async () => {
    const { service } = makeService({
      engagementRows: [engagementRow({ open_crm_deals: '1', open_crm_deal_names: ['TMA Banque de détail'] })],
    })
    const [row] = await service.engagementReport(WORKSPACE, SINCE)
    expect(row).toMatchObject({
      category: 'deal_jamais_close',
      openCrmDeals: 1,
      openCrmDealNames: ['TMA Banque de détail'],
    })
  })

  it('#3903 (lot M01) — la jointure lit crm_deal_facts.account_id de CET espace, jamais un nom', async () => {
    const { service, manager } = makeService({ engagementRows: [] })
    await service.engagementReport(WORKSPACE, SINCE)
    const call = manager.query.mock.calls.find(([sql]: [string]) => sql.includes('SELECT DISTINCT ON (a.account_id)'))
    expect(call?.[0]).toContain('f.account_id = a.account_id')
    expect(call?.[0]).toContain('f.workspace_id = $1')
    expect(call?.[0]).toContain('f.is_closed = false')
    expect(call?.[0]).not.toContain('company_name = f.')
  })

  it('une dernière interaction ENTRANTE classe le compte « en attente chez nous », quel que soit le silence', async () => {
    const { service } = makeService({
      engagementRows: [engagementRow({ last_direction: 'inbound', last_occurred_at: new Date().toISOString() })],
    })
    const [row] = await service.engagementReport(WORKSPACE, SINCE)
    expect(row?.category).toBe('en_attente_chez_nous')
  })

  it('une sortante TRÈS récente n’est pas encore « à relancer »', async () => {
    const { service } = makeService({
      engagementRows: [engagementRow({ last_direction: 'outbound', last_occurred_at: new Date().toISOString() })],
    })
    const [row] = await service.engagementReport(WORKSPACE, SINCE)
    expect(row?.category).toBe('en_attente_chez_le_client')
  })

  it('aucune interaction dans la fenêtre : une liste vide, jamais une erreur', async () => {
    const { service } = makeService({ engagementRows: [] })
    expect(await service.engagementReport(WORKSPACE, SINCE)).toEqual([])
  })

  it('interroge sur la fenêtre et le workspace demandés, et seulement les interactions in/out', async () => {
    const { service, manager } = makeService({ engagementRows: [] })
    await service.engagementReport(WORKSPACE, SINCE)
    const call = manager.query.mock.calls.find(([sql]: [string]) => sql.includes('SELECT DISTINCT ON (a.account_id)'))
    expect(call?.[1]).toEqual([WORKSPACE, SINCE])
    expect(call?.[0]).toContain("direction IN ('inbound', 'outbound')")
    expect(call?.[0]).toContain("status <> 'deleted'")
    // #3903 — une relance PLANIFIÉE (rappel à venir) n'a pas encore eu lieu :
    // jamais la preuve d'un dernier échange.
    expect(call?.[0]).toContain('occurred_at <= now()')
  })
})

describe('observedInteractionKinds (#3903)', () => {
  it('rend les canaux VUS dans la fenêtre pour tout l’espace', async () => {
    const { service } = makeService({ observedKinds: [{ kind: 'email' }, { kind: 'call' }] })
    expect(await service.observedInteractionKinds(WORKSPACE, '2026-07-01T00:00:00.000Z')).toEqual(['email', 'call'])
  })

  it('aucun canal vu : une liste vide, jamais une erreur', async () => {
    const { service } = makeService({ observedKinds: [] })
    expect(await service.observedInteractionKinds(WORKSPACE, '2026-07-01T00:00:00.000Z')).toEqual([])
  })
})

/**
 * #3904 — DÉCISION LOUIS 09/10 : « proche de signer » = une opportunité au
 * stade proposition OU négociation, dans Bellum OU dans le CRM branché. Jamais
 * une probabilité ; la source lue se nomme, un CRM absent se nomme.
 */
describe('nearSigning (#3904)', () => {
  it('lit les opportunités Bellum au stade « profils présentés » ou « négociation », ouvertes, de CET espace', async () => {
    const { service, manager } = makeService({
      nearSigningBellum: [
        { account_id: ACCOUNT, company_name: 'Acme', opportunity_id: 'o1', label: 'TMA', stage: 'negotiation' },
      ],
    })
    const out = await service.nearSigning(WORKSPACE)
    expect(out.bellum).toEqual([
      { accountId: ACCOUNT, companyName: 'Acme', opportunityId: 'o1', label: 'TMA', stage: 'negotiation' },
    ])
    const call = manager.query.mock.calls.find(([sql]: [string]) => sql.includes('-- near-signing: bellum'))
    expect(call?.[0]).toContain(projectStageInSql('p.stage', NEAR_SIGNING_STAGES))
    expect(call?.[0]).toContain("p.stage IN ('profiles_submitted','negotiation')")
    expect(call?.[0]).toContain('p.closed_at IS NULL')
    expect(call?.[1]).toEqual([WORKSPACE])
  })

  it('garde les affaires CRM ouvertes dont le stade dit proposition/négociation — et écarte les autres', async () => {
    const { service } = makeService({
      nearSigningCrm: [
        { account_id: ACCOUNT, company_name: 'Acme', name: 'Refonte', stage: 'x1', stage_label: 'Proposition envoyée' },
        { account_id: ACCOUNT, company_name: 'Acme', name: 'Audit', stage: 'qualif', stage_label: 'Qualification' },
      ],
    })
    const out = await service.nearSigning(WORKSPACE)
    expect(out.crm.map(deal => deal.dealName)).toEqual(['Refonte'])
    expect(out.crm[0]).toMatchObject({ accountId: ACCOUNT, stageLabel: 'Proposition envoyée' })
  })
})
