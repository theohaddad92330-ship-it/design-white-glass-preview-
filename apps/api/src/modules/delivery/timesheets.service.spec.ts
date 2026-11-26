import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TimesheetsService } from './timesheets.service'
import { GOOGLE_SCOPE } from '../google/google-config'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TIMESHEET = 't0000000-0000-4000-8000-000000000001'
const MISSION_A = 'a0000000-0000-4000-8000-000000000001'
const MISSION_B = 'b0000000-0000-4000-8000-000000000002'

/**
 * Le rejet motivé d'un relevé d'activité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Que le motif est exigé **côté SERVEUR**. C'est la seule chose qui compte : un
 * champ grisé dans le JSX n'est pas une garantie — un appel direct à l'API la
 * contourne, et le dépôt a déjà une garde (`wired-write-paths`) née de ce genre
 * de promesse tenue nulle part.
 *
 * Le test « refuse un motif vide » ci-dessous ROUGIT si l'on retire le `trim()`
 * + `throw` du service : c'est la preuve demandée, et c'est aussi la preuve que
 * la garde sait dire NON.
 */
function makeService(overrides: { updated?: unknown } = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      // Un `UPDATE … RETURNING` rend `[lignes, nombre]` et non les lignes. Le
      // mock rend donc la VRAIE forme de TypeORM, sans quoi le test ne
      // prouverait rien de ce que `firstReturnedRow` corrige : `rows[0]` serait
      // le TABLEAU des lignes — « truthy » même quand rien n'a été touché.
      if (sql.includes('RETURNING ts.id')) return overrides.updated ?? [[{ id: TIMESHEET }], 1]
      return []
    }),
  }
  const service = new TimesheetsService({ manager } as never)
  return { service, queries, manager }
}

describe('TimesheetsService.reject — le motif est exigé par le SERVEUR', () => {
  it('refuse un motif vide, et n’écrit RIEN', async () => {
    const { service, manager } = makeService()
    await expect(service.reject(WORKSPACE, USER, TIMESHEET, '', 3, '2026-08-20')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    // Le point qui compte : le refus arrive AVANT la base. Un service qui
    // laisserait passer et compterait sur la contrainte SQL rendrait une erreur
    // 500 générique là où l'utilisateur a besoin d'une phrase.
    expect(manager.query).not.toHaveBeenCalled()
  })

  it('refuse un motif fait d’espaces — « trois espaces » n’est pas un motif', async () => {
    // Une simple vérification de présence laisserait passer celui-là, et la
    // ligne porterait un motif que personne ne peut lire.
    for (const blank of ['   ', '\n', '\t\t', ' \n \t ']) {
      const { service, manager } = makeService()
      await expect(service.reject(WORKSPACE, USER, TIMESHEET, blank, 3, '2026-08-20')).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(manager.query).not.toHaveBeenCalled()
    }
  })

  it('dit POURQUOI il refuse — un message générique fait recliquer', async () => {
    const { service } = makeService()
    await expect(service.reject(WORKSPACE, USER, TIMESHEET, '  ', 3, '2026-08-20')).rejects.toThrow(/motif/i)
  })

  it('enregistre le motif DÉTOURÉ de ses espaces', async () => {
    const { service, queries } = makeService()
    const result = await service.reject(
      WORKSPACE,
      USER,
      TIMESHEET,
      '  Trois jours de juin imputés à juillet  ',
      3,
      '2026-08-20',
    )

    expect(result.status).toBe('rejected')
    expect(result.rejectionReason).toBe('Trois jours de juin imputés à juillet')
    expect(result.rejectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const update = queries.find(entry => entry.sql.includes('RETURNING ts.id'))
    expect(update).toBeDefined()
    // Le motif STOCKÉ est le motif détouré, pas celui reçu : sinon la base
    // porterait « ␣␣Trois jours… ␣␣ » et tout affichage traînerait ses espaces.
    expect(update?.params).toContain('Trois jours de juin imputés à juillet')
    expect(update?.params).toContain(USER)
  })

  // #2415.7 — la quantité contestée et la deadline voyagent jusqu'au résultat
  // et jusqu'à la base, comme le motif juste au-dessus.
  it('#2415.7 — enregistre la quantité contestée et la deadline de correction', async () => {
    const { service, queries } = makeService()
    const result = await service.reject(WORKSPACE, USER, TIMESHEET, 'Motif réel', 3, '2026-08-20')

    expect(result.contestedDays).toBe(3)
    expect(result.correctionDeadline).toBe('2026-08-20')
    const update = queries.find(entry => entry.sql.includes('RETURNING ts.id'))
    expect(update?.sql).toContain('contested_days')
    expect(update?.sql).toContain('correction_deadline')
    expect(update?.params).toContain(3)
    expect(update?.params).toContain('2026-08-20')
  })

  it('#2415.7 — refuse une quantité contestée nulle ou négative, AVANT la base', async () => {
    const { service, manager } = makeService()
    await expect(service.reject(WORKSPACE, USER, TIMESHEET, 'Motif réel', 0, '2026-08-20')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(manager.query).not.toHaveBeenCalled()
  })

  it('#2415.7 — la quantité contestée ne peut pas dépasser les jours déclarés (tenu en BASE)', async () => {
    const { service, queries } = makeService()
    await service.reject(WORKSPACE, USER, TIMESHEET, 'Motif réel', 3, '2026-08-20')
    const sql = queries.find(entry => entry.sql.includes('RETURNING ts.id'))?.sql ?? ''
    expect(sql).toContain('<= ts.days')
  })

  it('écrit le statut `rejected` et l’auteur du rejet', async () => {
    const { service, queries } = makeService()
    await service.reject(WORKSPACE, USER, TIMESHEET, 'Jours imputés au mauvais mois', 3, '2026-08-20')
    const sql = queries.find(entry => entry.sql.includes('RETURNING ts.id'))?.sql ?? ''

    expect(sql).toContain("status = 'rejected'")
    expect(sql).toContain('rejection_reason')
    expect(sql).toContain('rejected_by')
    expect(sql).toContain('rejected_at')
  })

  it('n’EFFACE rien — on archive, on ne supprime pas', async () => {
    // Ni les jours déclarés, ni la charge attendue, ni l'explication d'écart.
    // Un rejet marque le relevé ; il ne le vide pas.
    const { service, queries } = makeService()
    await service.reject(WORKSPACE, USER, TIMESHEET, 'Jours imputés au mauvais mois', 3, '2026-08-20')
    const sql = queries.find(entry => entry.sql.includes('RETURNING ts.id'))?.sql ?? ''

    expect(sql).not.toContain('DELETE')
    expect(sql).not.toMatch(/\bdays\s*=/)
    expect(sql).not.toMatch(/expected_days\s*=/)
    expect(sql).not.toMatch(/gap_explanation\s*=/)
  })

  it('reste borné à l’espace de travail de l’appelant', async () => {
    const { service, queries } = makeService()
    await service.reject(WORKSPACE, USER, TIMESHEET, 'Jours imputés au mauvais mois', 3, '2026-08-20')
    const update = queries.find(entry => entry.sql.includes('RETURNING ts.id'))

    // Sans la jointure sur `missions`, un identifiant de relevé deviné suffirait
    // à écrire dans l'espace d'une AUTRE ESN.
    expect(update?.sql).toContain('m.workspace_id = $2')
    expect(update?.params).toContain(WORKSPACE)
  })

  it('REFUSE de rejeter un relevé déjà validé par le CLIENT', async () => {
    // La validation client est ce qui autorise à facturer. La défaire d'un clic
    // ferait disparaître un accord obtenu ailleurs — le bon chemin est le
    // litige, qui existe déjà. Le `WHERE` le tient, donc l'UPDATE ne rend rien.
    const { service, queries } = makeService({ updated: [[], 0] })
    await expect(service.reject(WORKSPACE, USER, TIMESHEET, 'Motif réel', 3, '2026-08-20')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(queries.find(entry => entry.sql.includes('RETURNING ts.id'))?.sql).toContain(
      'ts.validated_by_client_at IS NULL',
    )
  })

  it('ne prend pas un `UPDATE` sans effet pour un succès', async () => {
    // `rows[0]` sur `[[], 0]` vaut `[]` — un tableau VIDE mais « truthy ».
    // Sans `firstReturnedRow`, le service rendrait un succès et l'écran
    // afficherait « rejeté » sur une ligne que personne n'a touchée.
    const { service } = makeService({ updated: [[], 0] })
    await expect(service.reject(WORKSPACE, USER, TIMESHEET, 'Motif réel', 3, '2026-08-20')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('n’émet aucune écriture comptable — le produit s’arrête à « prêt à facturer »', async () => {
    const { service, queries } = makeService()
    await service.reject(WORKSPACE, USER, TIMESHEET, 'Jours imputés au mauvais mois', 3, '2026-08-20')
    const touched = queries.map(entry => entry.sql).join('\n')

    // Un rejet de relevé dit qu'on ne facturera pas ce mois EN L'ÉTAT. Il
    // n'émet pas d'avoir, ne touche ni la facturation ni l'encaissement.
    expect(touched).not.toContain('invoice_readiness')
    expect(touched).not.toContain('invoiced_at')
    expect(touched).not.toContain('paid_at')
  })
})

/**
 * #2415.6 — la revue INTERNE, distincte de la validation CLIENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `validateByClient` posait `validated_by_client_at` ET `validated_by` dans le
 * MÊME geste — « relu en interne » et « transmis au client » n'étaient donc
 * jamais deux faits distincts, alors que le PDF 5 §7 en demande quatre. Le
 * choix produit tranché ici (registre #2415, ligne 2415.6, sans Louis) : la
 * revue interne devient un geste SÉPARÉ, POSABLE avant la validation client,
 * qui n'écrit ni le statut ni la validation client existants — additif pur.
 */
describe('TimesheetsService.reviewInternally — un geste SÉPARÉ de la validation client (#2415.6)', () => {
  function makeService(overrides: { updated?: unknown } = {}) {
    const queries: { sql: string; params: unknown[] }[] = []
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        if (sql.includes('RETURNING ts.id')) return overrides.updated ?? [[{ id: TIMESHEET }], 1]
        return []
      }),
    }
    const service = new TimesheetsService({ manager } as never)
    return { service, queries, manager }
  }

  it('pose `internal_reviewed_at`/`internal_reviewed_by`, jamais le statut ni la validation client', async () => {
    const { service, queries } = makeService()
    await service.reviewInternally(WORKSPACE, USER, TIMESHEET)
    const update = queries.find(entry => entry.sql.includes('RETURNING ts.id'))

    expect(update?.sql).toContain('internal_reviewed_at')
    expect(update?.sql).toContain('internal_reviewed_by')
    expect(update?.sql).not.toMatch(/\bstatus\s*=/)
    expect(update?.sql).not.toContain('validated_by_client_at')
  })

  it('reste borné à l’espace de travail de l’appelant', async () => {
    const { service, queries } = makeService()
    await service.reviewInternally(WORKSPACE, USER, TIMESHEET)
    const update = queries.find(entry => entry.sql.includes('RETURNING ts.id'))

    expect(update?.sql).toContain('m.workspace_id = $2')
    expect(update?.params).toContain(WORKSPACE)
  })

  it('ne prend pas un `UPDATE` sans effet pour un succès (relevé introuvable dans cet espace)', async () => {
    const { service } = makeService({ updated: [[], 0] })
    await expect(service.reviewInternally(WORKSPACE, USER, TIMESHEET)).rejects.toBeInstanceOf(NotFoundException)
  })
})

/**
 * #2196.24 — la TROISIÈME relance escalade.
 *
 * `dueReminders` porte, depuis la cadence à trois rangs, le commentaire
 * « au-delà de trois, le sujet remonte à un humain : le produit s'arrête » —
 * et ne POSAIT rien : la ligne restait `missing` après la troisième relance
 * comme après la première. `recordReminder` est l'unique écriture du compteur
 * (`reminders_sent`) : c'est donc lui, et lui seul, qui peut savoir qu'on
 * vient d'atteindre le troisième rang — sans lecture préalable, pour rester
 * l'écriture ATOMIQUE qu'elle était déjà (course entre deux relances).
 *
 * Comme pour le refus « déjà validé par le client » un peu plus haut, la
 * preuve porte sur le TEXTE de la requête envoyée à Postgres, pas sur son
 * exécution — c'est le standard déjà tenu par ce fichier pour un `UPDATE`
 * conditionnel.
 */
describe('TimesheetsService.recordReminder — la troisième relance ESCALADE', () => {
  function makeReminderService(overrides: { updated?: unknown } = {}) {
    const queries: { sql: string; params: unknown[] }[] = []
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        if (sql.includes('RETURNING ts.reminders_sent')) return overrides.updated ?? [{ reminders_sent: 1 }]
        return []
      }),
    }
    const service = new TimesheetsService({ manager } as never)
    return { service, queries, manager }
  }

  it('la requête pose `escalated` au TROISIÈME rang, jamais avant', async () => {
    const { service, queries } = makeReminderService()
    await service.recordReminder(WORKSPACE, TIMESHEET)
    const sql = queries.find(entry => entry.sql.includes('RETURNING ts.reminders_sent'))?.sql ?? ''
    expect(sql).toContain("'escalated'")
    // Le SEUIL : `reminders_sent` vient de passer à 3 (donc `+ 1 >= 3` calculé
    // sur la valeur AVANT incrément, dans la même écriture atomique).
    expect(sql).toContain('reminders_sent + 1 >= 3')
  })

  it('ne pose l’escalade QUE sur une ligne encore SANS dépôt — jamais sur un relevé déjà soumis, validé, contesté ou rejeté', async () => {
    const { service, queries } = makeReminderService()
    await service.recordReminder(WORKSPACE, TIMESHEET)
    const sql = queries.find(entry => entry.sql.includes('RETURNING ts.reminders_sent'))?.sql ?? ''
    // La garde de statut est dans la même expression : une relance enregistrée
    // par erreur sur un relevé déjà validé ne doit RIEN changer à son statut.
    expect(sql).toMatch(/status\s+IN\s*\(\s*'expected',\s*'missing',\s*'draft'\s*\)/)
  })

  it('reste borné à l’espace de travail de l’appelant — même garde que les autres écritures', async () => {
    const { service, queries } = makeReminderService()
    await service.recordReminder(WORKSPACE, TIMESHEET)
    const update = queries.find(entry => entry.sql.includes('RETURNING ts.reminders_sent'))
    expect(update?.sql).toContain('m.workspace_id = $2')
    expect(update?.params).toEqual([TIMESHEET, WORKSPACE])
  })

  it('#2416.39 — pose l’instantané du contact CRA UNE SEULE FOIS (`COALESCE`, jamais rafraîchi)', async () => {
    const { service, queries } = makeReminderService()
    await service.recordReminder(WORKSPACE, TIMESHEET)
    const sql = queries.find(entry => entry.sql.includes('RETURNING ts.reminders_sent'))?.sql ?? ''
    expect(sql).toContain('reminder_contact_id = COALESCE(ts.reminder_contact_id, m.cra_contact_id)')
  })
})

// ── `missionId` — la fiche mission lit SES relevés, pas ceux de tout le mois ─
//
// `timesheetMonthQuerySchema.missionId` existait déjà dans le contrat, et le
// SQL de `month` le lisait déjà ($3::uuid IS NULL OR m.id = $3::uuid) — seul le
// web ne le passait pas. Ce bloc le prouve à ce niveau : pas seulement que le
// paramètre PART, mais qu'il RESTREINT vraiment le résultat. Le mock simule le
// vrai `WHERE` pour ça — un mock qui renverrait toujours les mêmes lignes,
// quel que soit le paramètre, ne prouverait rien de plus qu'un appel réussi.
describe('TimesheetsService.month — filtre par MISSION', () => {
  function craRow(over: Record<string, unknown> = {}) {
    return {
      mission_id: MISSION_A,
      mission_label: 'Mission A',
      account_name: 'ACME',
      contract_kind: 'regie',
      started_on: null,
      ends_on: null,
      consultant_id: null,
      consultant_name: null,
      ts_id: null,
      ts_days: null,
      ts_status: null,
      ts_expected: null,
      ts_explanation: null,
      ts_validated_client: null,
      ts_anomalies: null,
      ts_reminders: null,
      ts_last_reminder: null,
      ts_rejected_at: null,
      ts_rejection_reason: null,
      ...over,
    }
  }

  function makeFilteringService(rows: ReturnType<typeof craRow>[]) {
    const queries: { sql: string; params: unknown[] }[] = []
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        if (sql.includes('FROM missions m')) {
          // Le troisième paramètre est `query.missionId ?? null` : simuler ici
          // le VRAI `WHERE` du SQL est ce qui distingue « le paramètre part »
          // de « le paramètre restreint quelque chose ».
          const missionId = (params[2] as string | null) ?? null
          return missionId ? rows.filter(row => row.mission_id === missionId) : rows
        }
        return []
      }),
    }
    const service = new TimesheetsService({ manager } as never)
    return { service, queries }
  }

  it('sans `missionId`, rend les relevés de TOUTES les missions du mois', async () => {
    const { service } = makeFilteringService([
      craRow({ mission_id: MISSION_A, mission_label: 'Mission A' }),
      craRow({ mission_id: MISSION_B, mission_label: 'Mission B' }),
    ])
    const result = await service.month(WORKSPACE, { month: '2026-08' })
    expect(result.items.map(item => item.missionId)).toEqual([MISSION_A, MISSION_B])
  })

  it('avec `missionId`, ne rend QUE les relevés de cette mission-là', async () => {
    const { service, queries } = makeFilteringService([
      craRow({ mission_id: MISSION_A }),
      craRow({ mission_id: MISSION_B }),
    ])
    const result = await service.month(WORKSPACE, { month: '2026-08', missionId: MISSION_A })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.missionId).toBe(MISSION_A)

    const read = queries.find(entry => entry.sql.includes('FROM missions m'))
    expect(read?.params[2]).toBe(MISSION_A)
    expect(read?.sql).toContain('$3::uuid IS NULL OR m.id = $3::uuid')
  })

  // #2196.16 — « approbateur » : celui qui a ENREGISTRÉ la validation client
  // (`validated_by`), pas le contact client. Le nom se résout par jointure sur
  // `profiles`, nom + prénom d'abord, l'email en repli.
  it('nomme l’approbateur par prénom + nom quand le profil les porte', async () => {
    const { service } = makeFilteringService([
      craRow({ ts_id: 'ts-1', ts_approver_name: 'A. Martin', ts_approver_email: 'a.martin@example.com' }),
    ])
    const result = await service.month(WORKSPACE, { month: '2026-08' })
    expect(result.items[0]?.approverName).toBe('A. Martin')
  })

  it('replie sur l’email quand le profil n’a ni prénom ni nom', async () => {
    const { service } = makeFilteringService([
      craRow({ ts_id: 'ts-1', ts_approver_name: null, ts_approver_email: 'a.martin@example.com' }),
    ])
    const result = await service.month(WORKSPACE, { month: '2026-08' })
    expect(result.items[0]?.approverName).toBe('a.martin@example.com')
  })

  it('ne nomme PERSONNE tant que rien n’a été validé — jamais une chaîne vide', async () => {
    const { service } = makeFilteringService([
      craRow({ ts_id: 'ts-1', ts_approver_name: null, ts_approver_email: null }),
    ])
    const result = await service.month(WORKSPACE, { month: '2026-08' })
    expect(result.items[0]?.approverName).toBeNull()
  })

  it('la jointure porte sur `validated_by`, pas sur un autre identifiant', async () => {
    const { service, queries } = makeFilteringService([craRow()])
    await service.month(WORKSPACE, { month: '2026-08' })
    const read = queries.find(entry => entry.sql.includes('FROM missions m'))
    expect(read?.sql).toContain('LEFT JOIN profiles p ON p.user_id = ts.validated_by')
  })
})

/**
 * #2078.22.d — revue sécurité du lot K : le canal « brouillon » vérifie la
 * PORTÉE Google qui accorde réellement la composition, pas une portée voisine.
 * `gmail.modify` ouvre le CLASSEMENT (archiver, étiqueter), jamais composer —
 * et `https://mail.google.com/` n'est la portée d'aucune capacité que ce
 * produit demande. Les deux acceptaient encore un jeton qui n'écrira jamais
 * de brouillon, faisant miroiter un canal `mail_draft` que
 * `GoogleService.requireWriteAccess` refuse au premier clic.
 */
describe('TimesheetsService.dueReminders — le brouillon exige LA portée qui l’accorde (#2078.22.d)', () => {
  function serviceWithGoogleScope(scope: string | null) {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('AS mailbox')) return [{ mailbox: true, chat: false, crm: false }]
        if (sql.includes('SELECT scope FROM google_connections')) return [{ scope }]
        return []
      }),
    }
    return new TimesheetsService({ manager } as never)
  }

  it('`gmail.modify` seul ne fait plus miroiter le brouillon', async () => {
    const service = serviceWithGoogleScope('https://www.googleapis.com/auth/gmail.modify')
    const { channel } = await service.dueReminders(WORKSPACE, USER)
    expect(channel.channel).not.toBe('mail_draft')
  })

  it('`https://mail.google.com/` seul ne fait plus miroiter le brouillon', async () => {
    const service = serviceWithGoogleScope('https://mail.google.com/')
    const { channel } = await service.dueReminders(WORKSPACE, USER)
    expect(channel.channel).not.toBe('mail_draft')
  })

  it('TÉMOIN — `gmail.compose`, la portée qui accorde réellement le brouillon, garde le canal', async () => {
    const service = serviceWithGoogleScope('https://www.googleapis.com/auth/gmail.compose')
    const { channel } = await service.dueReminders(WORKSPACE, USER)
    expect(channel.channel).toBe('mail_draft')
  })
})

/**
 * #2972 — l'ESCALADE (#2196.24) nommait déjà QUAND (`status: 'escalated'`,
 * 3ᵉ relance sans dépôt) mais jamais VERS QUI. `missions.owner_id` — « le
 * PORTEUR, distinct du créateur : c'est lui qu'on alerte » (`mission.entity.ts`)
 * — est une donnée déjà là, jamais lue par cet écran. Même patron que
 * `InvoiceReadinessService.dueReminders` / `reminderDue.joinOwner` : le
 * service DIT qui prévenir, il ne préviens personne — Laura prépare, un
 * humain agit.
 */
describe('TimesheetsService.dueEscalations — vers le PORTEUR de la mission (#2972)', () => {
  function craRow(over: Record<string, unknown> = {}) {
    return {
      mission_id: MISSION_A,
      mission_label: 'Mission A',
      account_name: 'ACME',
      contract_kind: 'regie',
      started_on: null,
      ends_on: null,
      consultant_id: null,
      consultant_name: null,
      ts_id: 'ts-1',
      ts_days: 0,
      ts_status: 'escalated',
      ts_expected: 20,
      ts_explanation: null,
      ts_validated_client: null,
      ts_anomalies: null,
      ts_reminders: 3,
      ts_last_reminder: null,
      ts_rejected_at: null,
      ts_rejection_reason: null,
      ...over,
    }
  }

  function makeEscalationService(
    rows: ReturnType<typeof craRow>[],
    owner: Record<string, unknown> | null,
    capabilities: { mailbox?: boolean; chat?: boolean; crm?: boolean } = {},
    partners: { consultant_id: string; partner_name: string | null }[] = [],
  ) {
    const queries: { sql: string; params: unknown[] }[] = []
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        // #2972 — le PARTENAIRE : `consultants.partner_account_id` → `accounts`.
        if (sql.includes('partner_account_id')) return partners
        if (sql.includes('FROM missions m') && sql.includes('LEFT JOIN accounts')) return rows
        if (sql.includes('FROM missions m') && sql.includes('m.id = ANY($1::uuid[])')) {
          return owner ? [owner] : []
        }
        // #2972 (lot V20b) — le CANAL de l'escalade réutilise `capabilities()`
        // (même requête que `dueReminders`), routée sur son alias `mailbox`.
        if (sql.includes('AS mailbox')) {
          return [
            {
              mailbox: capabilities.mailbox ?? false,
              chat: capabilities.chat ?? false,
              crm: capabilities.crm ?? false,
            },
          ]
        }
        if (sql.includes('microsoft_connections') && sql.includes('UNION ALL')) {
          return capabilities.mailbox ? [{ scope: GOOGLE_SCOPE.gmailCompose }] : []
        }
        return []
      }),
    }
    const service = new TimesheetsService({ manager } as never)
    return { service, queries }
  }

  it('ne rend RIEN quand aucun relevé n’est escaladé', async () => {
    const { service, queries } = makeEscalationService([craRow({ ts_status: 'missing' })], null)
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result).toEqual([])
    // Aucune jointure « owner » n'est tentée : le JOIN reste ÉTROIT.
    expect(queries.some(q => q.sql.includes('m.id = ANY($1::uuid[])'))).toBe(false)
  })

  it('nomme le PORTEUR par prénom + nom quand le profil les porte', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: 'a.martin@example.com',
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result).toHaveLength(1)
    expect(result[0]?.ownerId).toBe(USER)
    expect(result[0]?.ownerName).toBe('A. Martin')
  })

  it('nomme aussi le MANAGER CLIENT, un second candidat, sans en faire le porteur (#2972, lot V20b)', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: null,
      client_manager_contact_id: 'contact-1',
      client_manager_name: 'B. Client',
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.ownerName).toBe('A. Martin')
    expect(result[0]?.clientManagerId).toBe('contact-1')
    expect(result[0]?.clientManagerName).toBe('B. Client')
  })

  it('ne nomme PAS de manager client tant que la mission n’en désigne aucun — jamais deviné', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: null,
      client_manager_contact_id: null,
      client_manager_name: null,
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.clientManagerId).toBeNull()
    expect(result[0]?.clientManagerName).toBeNull()
  })

  it('replie sur l’email quand le profil du porteur n’a ni prénom ni nom', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: null,
      owner_email: 'a.martin@example.com',
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.ownerName).toBe('a.martin@example.com')
  })

  it('ne nomme PERSONNE tant que la mission n’a pas de porteur déclaré — jamais deviné', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: null,
      owner_name: null,
      owner_email: null,
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.ownerId).toBeNull()
    expect(result[0]?.ownerName).toBeNull()
  })

  it('le CANAL de l’escalade est une CONCLUSION tirée du réel (mail branché ⇒ brouillon)', async () => {
    const { service } = makeEscalationService(
      [craRow()],
      { id: MISSION_A, owner_id: USER, owner_name: 'A. Martin', owner_email: null },
      { mailbox: true },
    )
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.channel.channel).toBe('mail_draft')
  })

  it('le CANAL retombe sur `in_app` — jamais une promesse d’envoi — quand rien n’est branché', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: null,
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.channel.channel).toBe('in_app')
    expect(result[0]?.channel.reason).toBe('nothing_connected')
  })

  it('le DÉLAI de l’escalade compte les jours depuis la FIN de la période, même dérivation que `dueReminders`', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: null,
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08', new Date('2026-09-15T00:00:00Z'))
    // Le mois d'août finit le 01/09 (minuit) ; le 15/09 en fait 14 de plus.
    expect(result[0]?.delayDays).toBe(14)
  })

  it('nomme l’ADV — le contact de FACTURATION de la mission — à côté du porteur, jamais à sa place (#2972, #2416.20-.26)', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: null,
      billing_contact_id: 'contact-adv',
      billing_contact_name: 'C. Compta',
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.ownerName).toBe('A. Martin')
    expect(result[0]?.advContactId).toBe('contact-adv')
    expect(result[0]?.advName).toBe('C. Compta')
  })

  it('ne nomme PAS d’ADV tant que la mission n’a pas de contact de facturation — jamais deviné', async () => {
    const { service } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: null,
      billing_contact_id: null,
      billing_contact_name: null,
    })
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.advContactId).toBeNull()
    expect(result[0]?.advName).toBeNull()
  })

  it('nomme le PARTENAIRE du consultant quand il est en sous-traitance, par le compte partenaire déclaré', async () => {
    const { service, queries } = makeEscalationService(
      [craRow({ consultant_id: 'cons-1', consultant_name: 'D. Sous-traitant' })],
      { id: MISSION_A, owner_id: USER, owner_name: 'A. Martin', owner_email: null },
      {},
      [{ consultant_id: 'cons-1', partner_name: 'Partenaire SAS' }],
    )
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.partnerName).toBe('Partenaire SAS')
    // Lecture SCOPÉE à l'espace : un consultant d'un autre espace ne fuit pas.
    const partnerQuery = queries.find(q => q.sql.includes('partner_account_id'))
    expect(partnerQuery?.sql).toContain('workspace_id')
    expect(partnerQuery?.params).toContain(WORKSPACE)
  })

  it('ne nomme PAS de partenaire pour un consultant salarié ou une ligne sans consultant — silence, jamais deviné', async () => {
    const { service, queries } = makeEscalationService(
      [craRow({ consultant_id: null })],
      { id: MISSION_A, owner_id: USER, owner_name: 'A. Martin', owner_email: null },
      {},
      [{ consultant_id: 'cons-1', partner_name: 'Partenaire SAS' }],
    )
    const result = await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(result[0]?.partnerName).toBeNull()
    // Aucun consultant sur les lignes ⇒ aucune requête partenaire.
    expect(queries.some(q => q.sql.includes('partner_account_id'))).toBe(false)
  })

  it('le NIVEAU est le nombre de relances au-delà du seuil d’escalade : 3ᵉ relance ⇒ niveau 1, 5ᵉ ⇒ niveau 3', async () => {
    const owner = { id: MISSION_A, owner_id: USER, owner_name: 'A. Martin', owner_email: null }
    const at3 = await makeEscalationService([craRow({ ts_reminders: 3 })], owner).service.dueEscalations(
      WORKSPACE,
      USER,
      '2026-08',
    )
    const at5 = await makeEscalationService([craRow({ ts_reminders: 5 })], owner).service.dueEscalations(
      WORKSPACE,
      USER,
      '2026-08',
    )
    expect(at3[0]?.level).toBe(1)
    expect(at5[0]?.level).toBe(3)
  })

  it('ne relance rien : c’est une LECTURE, aucune écriture n’est tentée', async () => {
    const { service, queries } = makeEscalationService([craRow()], {
      id: MISSION_A,
      owner_id: USER,
      owner_name: 'A. Martin',
      owner_email: null,
    })
    await service.dueEscalations(WORKSPACE, USER, '2026-08')
    expect(queries.every(q => !q.sql.trim().toUpperCase().startsWith('UPDATE'))).toBe(true)
  })
})

/**
 * #2416.36 / #2416.38 / #2416.39 / #2416.40 — quatre des cinq conditions
 * d'arrêt automatique de la collecte CRA (la cinquième, l'opt-out/politique
 * interne, reste `reste` — voir #2974 pour la porte PERSONNE, non consultée
 * ici faute de savoir QUI, sur une mission, correspond au contact arrêté).
 * `month()` incluait déjà les missions suspendues/annulées (`m.status <>
 * 'draft'` seulement, ligne 185) — `dueReminders` les relançait donc comme
 * n'importe quelle mission active. Décision Louis 27/09/2026 pour les deux
 * dernières : la séquence s'arrête quand un humain agit sur le relevé
 * (`internalReviewedAt`, la revue interne #2415.6) ou quand le contact CRA de
 * la mission change depuis la première relance (`reminder_contact_id`,
 * l'instantané posé par `recordReminder`).
 */
describe('TimesheetsService.dueReminders — une mission suspendue ou annulée ne se relance pas (#2416.36/.38)', () => {
  function craRow(over: Record<string, unknown> = {}) {
    return {
      mission_id: MISSION_A,
      mission_label: 'Mission A',
      account_name: 'ACME',
      contract_kind: 'regie',
      mission_status: 'active',
      mission_cra_contact_id: null,
      started_on: null,
      ends_on: null,
      consultant_id: null,
      consultant_name: null,
      ts_id: null,
      ts_days: null,
      ts_status: null,
      ts_expected: 20,
      ts_explanation: null,
      ts_validated_client: null,
      ts_anomalies: null,
      ts_reminders: 0,
      ts_last_reminder: null,
      ts_rejected_at: null,
      ts_rejection_reason: null,
      ts_internal_reviewed_at: null,
      ts_reminder_contact_id: null,
      ...over,
    }
  }

  function makeService(rows: ReturnType<typeof craRow>[]) {
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM missions m') && sql.includes('LEFT JOIN accounts')) return rows
        // La jointure ÉTROITE de `dueReminders` — même table réelle
        // (`missions`), lue une seconde fois pour les seules missions dues.
        if (sql.includes("m.status IN ('paused', 'cancelled')")) {
          const ids = params[0] as string[]
          return rows
            .filter(
              row =>
                ids.includes(row.mission_id as string) &&
                ['paused', 'cancelled'].includes(row.mission_status as string),
            )
            .map(row => ({ id: row.mission_id }))
        }
        // #2416.39 — la jointure ÉTROITE « le contact a changé », comparant
        // l'instantané (`ts_reminder_contact_id`) au contact CRA ACTUEL de la
        // mission (`mission_cra_contact_id`).
        if (sql.includes('ts.reminder_contact_id IS DISTINCT FROM m.cra_contact_id')) {
          const ids = params[0] as string[]
          return rows
            .filter(
              row =>
                ids.includes(row.ts_id as unknown as string) &&
                row.ts_reminder_contact_id != null &&
                row.ts_reminder_contact_id !== row.mission_cra_contact_id,
            )
            .map(row => ({ id: row.ts_id }))
        }
        return []
      }),
    }
    return new TimesheetsService({ manager } as never)
  }

  // Juillet fini depuis 20 jours : au-delà du premier seuil (5 jours,
  // `REMINDER_SCHEDULE_DAYS[0]`) — une mission active y est due.
  const NOW = new Date('2026-08-20T09:00:00Z')

  it('#2416.36 — ne relance pas une mission SUSPENDUE (`paused`)', async () => {
    const service = makeService([craRow({ mission_status: 'paused' })])
    const { items } = await service.dueReminders(WORKSPACE, USER, '2026-07', NOW)
    expect(items).toEqual([])
  })

  it('#2416.38 — ne relance pas une mission dont la période est ANNULÉE (`cancelled`)', async () => {
    const service = makeService([craRow({ mission_status: 'cancelled' })])
    const { items } = await service.dueReminders(WORKSPACE, USER, '2026-07', NOW)
    expect(items).toEqual([])
  })

  it('TÉMOIN — une mission ACTIVE, dans les mêmes conditions, reste relancée', async () => {
    const service = makeService([craRow({ mission_status: 'active' })])
    const { items } = await service.dueReminders(WORKSPACE, USER, '2026-07', NOW)
    expect(items).toHaveLength(1)
  })

  it('#2416.40 — ne relance pas un relevé déjà REVU par un humain (intervention manuelle)', async () => {
    const service = makeService([craRow({ ts_id: 'ts-1', ts_internal_reviewed_at: new Date('2026-08-10T00:00:00Z') })])
    const { items } = await service.dueReminders(WORKSPACE, USER, '2026-07', NOW)
    expect(items).toEqual([])
  })

  it('#2416.39 — ne relance pas un relevé dont le contact CRA a changé depuis la première relance', async () => {
    const service = makeService([
      craRow({
        ts_id: 'ts-1',
        mission_cra_contact_id: 'contact-b',
        ts_reminder_contact_id: 'contact-a',
      }),
    ])
    const { items } = await service.dueReminders(WORKSPACE, USER, '2026-07', NOW)
    expect(items).toEqual([])
  })

  it('TÉMOIN — un relevé jamais relancé (aucun instantané de contact) reste relancé', async () => {
    const service = makeService([
      craRow({ ts_id: 'ts-1', mission_cra_contact_id: 'contact-a', ts_reminder_contact_id: null }),
    ])
    const { items } = await service.dueReminders(WORKSPACE, USER, '2026-07', NOW)
    expect(items).toHaveLength(1)
  })

  it('TÉMOIN — le contact CRA inchangé depuis la première relance reste relancé', async () => {
    const service = makeService([
      craRow({ ts_id: 'ts-1', mission_cra_contact_id: 'contact-a', ts_reminder_contact_id: 'contact-a' }),
    ])
    const { items } = await service.dueReminders(WORKSPACE, USER, '2026-07', NOW)
    expect(items).toHaveLength(1)
  })
})

/**
 * #2416.37 — la résolution du CONTACT CRA d'une relance candidate, à l'appui
 * de la cinquième condition d'arrêt (l'opt-out). Lecture PURE, bornée aux
 * tables de ce module — le service ne consulte PAS `ContactStopService`
 * lui-même (§3.2, garde GA-07 : un service n'importe pas le service d'un
 * voisin). C'est au CONTRÔLEUR, seule couche qui compose deux modules
 * légitimement, d'interroger la porte PERSONNE avec ce que cette méthode rend.
 */
describe('TimesheetsService.craContactIdsFor — le contact CRA réel d’une relance (#2416.37)', () => {
  function makeService(
    rows: {
      ts_id: string | null
      mission_id: string
      reminder_contact_id: string | null
      cra_contact_id: string | null
    }[],
  ) {
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        // Jointure ÉTROITE (relevés AVEC une ligne) — l'instantané s'il
        // existe, sinon le contact CRA actuel de la mission.
        if (sql.includes('COALESCE(ts.reminder_contact_id, m.cra_contact_id) AS contact_id')) {
          const ids = params[0] as string[]
          return rows
            .filter(row => row.ts_id != null && ids.includes(row.ts_id))
            .map(row => ({ id: row.ts_id, contact_id: row.reminder_contact_id ?? row.cra_contact_id }))
        }
        // Jointure ÉTROITE (relevés jamais soumis) — le contact CRA porté par
        // la MISSION elle-même.
        if (sql.includes('cra_contact_id AS contact_id FROM missions')) {
          const ids = params[0] as string[]
          return rows
            .filter(row => ids.includes(row.mission_id))
            .map(row => ({ id: row.mission_id, contact_id: row.cra_contact_id }))
        }
        return []
      }),
    }
    return { service: new TimesheetsService({ manager } as never), manager }
  }

  it('résout le contact CRA ACTUEL de la mission quand le relevé n’a jamais été relancé', async () => {
    const { service } = makeService([
      { ts_id: 'ts-1', mission_id: MISSION_A, reminder_contact_id: null, cra_contact_id: 'contact-a' },
    ])
    const result = await service.craContactIdsFor(WORKSPACE, [{ timesheetId: 'ts-1', missionId: MISSION_A }])
    expect(result.get('ts-1')).toBe('contact-a')
  })

  it('préfère l’INSTANTANÉ figé au contact CRA actuel, quand les deux existent', async () => {
    const { service } = makeService([
      { ts_id: 'ts-1', mission_id: MISSION_A, reminder_contact_id: 'contact-figé', cra_contact_id: 'contact-nouveau' },
    ])
    const result = await service.craContactIdsFor(WORKSPACE, [{ timesheetId: 'ts-1', missionId: MISSION_A }])
    expect(result.get('ts-1')).toBe('contact-figé')
  })

  it('un relevé JAMAIS SOUMIS (aucune ligne) résout le contact CRA de la MISSION', async () => {
    const { service } = makeService([
      { ts_id: null, mission_id: MISSION_A, reminder_contact_id: null, cra_contact_id: 'contact-a' },
    ])
    const result = await service.craContactIdsFor(WORKSPACE, [{ timesheetId: null, missionId: MISSION_A }])
    expect(result.get(`mission:${MISSION_A}`)).toBe('contact-a')
  })

  it('rend `null` quand aucune mission/relevé ne porte de contact CRA — jamais deviné', async () => {
    const { service } = makeService([
      { ts_id: 'ts-1', mission_id: MISSION_A, reminder_contact_id: null, cra_contact_id: null },
    ])
    const result = await service.craContactIdsFor(WORKSPACE, [{ timesheetId: 'ts-1', missionId: MISSION_A }])
    expect(result.get('ts-1')).toBeNull()
  })

  it('reste borné à l’espace de travail de l’appelant', async () => {
    const { service, manager } = makeService([
      { ts_id: 'ts-1', mission_id: MISSION_A, reminder_contact_id: null, cra_contact_id: 'contact-a' },
    ])
    await service.craContactIdsFor(WORKSPACE, [{ timesheetId: 'ts-1', missionId: MISSION_A }])
    const call = manager.query.mock.calls.find(([sql]) => (sql as string).includes('COALESCE(ts.reminder_contact_id'))
    expect(call?.[1]).toEqual([['ts-1'], WORKSPACE])
  })

  it('ne fait aucun appel base sur une liste vide', async () => {
    const { service, manager } = makeService([])
    const result = await service.craContactIdsFor(WORKSPACE, [])
    expect(result.size).toBe(0)
    expect(manager.query).not.toHaveBeenCalled()
  })
})
