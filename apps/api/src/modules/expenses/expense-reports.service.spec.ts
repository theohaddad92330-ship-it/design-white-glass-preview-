import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ExpenseReportsService } from './expense-reports.service'

/**
 * LE SERVICE DES NOTES DE FRAIS (31/08/2026).
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *
 *  1. **La marge ne compte les frais ni deux fois ni zéro fois.** Une note
 *     VALIDÉE qui porte une mission engendre UNE ligne `mission_expenses`, et
 *     `mission_expense_id` en garde la preuve. Rejouer la validation — deux
 *     clics, une reprise après timeout — ne doit rien réécrire.
 *  2. **Un refus sans motif n'existe pas**, du schéma jusqu'à la base.
 *  3. **« Pas le droit » n'est jamais « zéro »** : sans `finance:read`, les
 *     montants sortent à `null`, PRÉSENTS, et le droit voyage avec la réponse.
 *  4. **Un verdict ne se conclut pas d'un silence** : sans barème, la note
 *     n'est pas « conforme », elle est non vérifiée.
 *
 * Le dépôt exécute ses specs sans base : la fausse source ci-dessous rejoue
 * les lignes que Postgres rendrait, et ENREGISTRE le SQL — c'est la seule
 * façon de voir qu'une écriture n'a PAS eu lieu.
 */

type Row = Record<string, unknown>

/** Une fausse source qui répond par motif de requête et garde la trace. */
class FakeDb {
  readonly executed: { sql: string; params: unknown[] }[] = []
  constructor(private readonly answers: { match: RegExp; rows: Row[] | (() => Row[]) }[]) {}

  query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    this.executed.push({ sql, params })
    for (const answer of this.answers) {
      if (answer.match.test(sql)) return typeof answer.rows === 'function' ? answer.rows() : answer.rows
    }
    return []
  }

  transaction = async <T>(work: (manager: { query: FakeDb['query'] }) => Promise<T>): Promise<T> => {
    return work({ query: this.query })
  }

  sqlMatching(pattern: RegExp): { sql: string; params: unknown[] }[] {
    return this.executed.filter(entry => pattern.test(entry.sql))
  }
}

function serviceWith(db: FakeDb): ExpenseReportsService {
  // Le service n'utilise du dépôt que son `manager` — l'injecter tel quel est
  // plus honnête qu'un `as any` qui masquerait ce dont il dépend réellement.
  return new ExpenseReportsService({ manager: db } as unknown as ConstructorParameters<typeof ExpenseReportsService>[0])
}

const LINES: Row[] = [
  {
    id: 'l1',
    category: 'meal',
    label: 'Repas – Déjeuner',
    spent_on: '2026-05-15',
    city: 'Paris',
    detail: null,
    amount_cents: '1850',
    vat_rate_bps: 1000,
  },
  {
    id: 'l2',
    category: 'hotel',
    label: 'Hôtel',
    spent_on: '2026-05-14',
    city: 'Paris',
    detail: null,
    amount_cents: '12000',
    vat_rate_bps: 1000,
  },
]

const REPORT: Row = {
  id: 'r1',
  reference: 'F-2026-006',
  bearer_name: 'Hugo Laugier',
  account_name: 'DINUM',
  account_id: 'acc1',
  mission_id: 'm1',
  period_month: '2026-05',
  status: 'pending',
  submitted_at: new Date('2026-06-01T09:00:00Z'),
  decided_at: null,
  rejection_reason: null,
  mission_expense_id: null,
  line_count: 2,
  total_cents: '13850',
}

const POLICY: Row = { id: 'p1', label: 'Barème interne DINUM', reimbursement_basis: 'actual' }
const CAPS: Row[] = [
  { category: 'meal', cap_cents: '2500', vat_recoverable: true },
  { category: 'hotel', cap_cents: '15000', vat_recoverable: false },
]

function detailDb(
  over: Partial<{ report: Row; lines: Row[]; caps: Row[]; policy: Row | null; rates: Row[] }> = {},
): FakeDb {
  return new FakeDb([
    { match: /FROM expense_reports r/, rows: [{ ...REPORT, ...(over.report ?? {}) }] },
    { match: /FROM expense_report_lines/, rows: over.lines ?? LINES },
    {
      match: /FROM expense_report_attachments/,
      rows: [
        {
          id: 'a1',
          file_name: 'Facture_hotel.pdf',
          byte_size: '127000',
          storage_object_id: null,
          retention_until: '2036-05-14',
        },
      ],
    },
    { match: /FROM expense_policies/, rows: over.policy === null ? [] : [over.policy ?? POLICY] },
    { match: /FROM expense_policy_caps/, rows: over.caps ?? CAPS },
    // Le barème kilométrique est VIDE par défaut, et c'est son état livré : il
    // se saisit, il ne se pré-remplit pas.
    { match: /FROM expense_mileage_rates/, rows: over.rates ?? [] },
  ])
}

describe('ExpenseReportsService.detail', () => {
  it('assemble le dossier : lignes, TVA ventilée, conformité et vérification', async () => {
    const detail = await serviceWith(detailDb()).detail('w1', 'r1', true, '2026-06-02')

    expect(detail.reference).toBe('F-2026-006')
    expect(detail.totalAmountCents).toBe(13850)
    expect(detail.lines).toHaveLength(2)
    // TVA : 18,50 € à 10 % récupérable = 168 ; l'hôtel n'ouvre pas droit ici.
    expect(detail.recoverableVatCents).toBe(168)
    expect(detail.borneVatCents).toBe(1091)
    expect(detail.vatUnmeasuredLineCount).toBe(0)
    expect(detail.compliance.verdict).toBe('compliant')
    expect(detail.anomalies).toEqual([])
  })

  it('Théo C missions-notes-de-frais.N6 — porte le libellé de mission, le contrôle au barème et qui a décidé', async () => {
    const detail = await serviceWith(
      detailDb({ report: { mission_label: 'Fiabilisation plateforme', status: 'validated', decided_by: 'u9' } }),
    ).detail('w1', 'r1', true, '2026-06-02')
    expect(detail.missionLabel).toBe('Fiabilisation plateforme')
    // Repas 18,50 € sous 25 € ; hôtel 120 € sous 150 € : tout est comparé, rien ne dépasse.
    expect(detail.policyCheck).toEqual({
      verdict: 'compliant',
      overageCount: 0,
      unmeasuredLineCount: 0,
      worstOverage: null,
    })
    expect(detail.decidedByName).toBeNull()
  })

  it('NOMME le dépassement de barème plutôt que de le taire', async () => {
    const detail = await serviceWith(detailDb({ lines: [{ ...LINES[0], amount_cents: '3200' }] })).detail(
      'w1',
      'r1',
      true,
      '2026-06-02',
    )

    expect(detail.compliance.verdict).toBe('breach')
    expect(detail.lines[0]?.overageCents).toBe(700)
  })

  it('sans AUCUNE politique, ne conclut pas « conforme »', async () => {
    // Le silence du barème n'est pas une garantie — c'est l'absence de contrôle.
    const detail = await serviceWith(detailDb({ policy: null, caps: [] })).detail('w1', 'r1', true, '2026-06-02')

    expect(detail.compliance.verdict).toBe('unknown')
    expect(detail.compliance.unmeasuredLineCount).toBe(2)
    expect(detail.policyLabel).toBeNull()
    // Et la TVA ne s'invente pas non plus : sans politique, rien n'est ventilable.
    expect(detail.recoverableVatCents).toBeNull()
  })

  it('remonte les anomalies de la vérification automatique', async () => {
    const detail = await serviceWith(detailDb({ lines: [{ ...LINES[0], spent_on: '2026-04-28' }] })).detail(
      'w1',
      'r1',
      true,
      '2026-06-02',
    )

    expect(detail.anomalies.length).toBeGreaterThan(0)
    expect(detail.anomalies[0]).toContain('2026-05')
  })

  it('vide les montants — jusque dans les lignes — sans `finance:read`', async () => {
    const detail = await serviceWith(detailDb()).detail('w1', 'r1', false, '2026-06-02')

    expect(detail.totalAmountCents).toBeNull()
    expect(detail.recoverableVatCents).toBeNull()
    expect(detail.lines[0]?.amountCents).toBeNull()
    expect(detail.lines[0]?.capCents).toBeNull()
    // Ce qui n'est pas un montant reste lisible : le dossier garde son sens.
    expect(detail.lines[0]?.label).toBe('Repas – Déjeuner')
    expect(detail.compliance.verdict).toBe('compliant')
  })

  it('ne rend pas la note d’un AUTRE espace', async () => {
    const db = new FakeDb([{ match: /FROM expense_reports r/, rows: [] }])
    await expect(serviceWith(db).detail('w1', 'r1', true, '2026-06-02')).rejects.toBeInstanceOf(NotFoundException)
    // La clé d'espace est dans la requête, pas seulement dans un filtre applicatif.
    expect(db.executed[0]?.params).toContain('w1')
  })
})

describe('ExpenseReportsService.list', () => {
  it('rend les tuiles avec leurs COMPTES même sans droit financier', async () => {
    const db = new FakeDb([
      { match: /GROUP BY r\.id/, rows: [REPORT] },
      { match: /GROUP BY r\.status/, rows: [{ status: 'pending', count: '15', total_cents: '2654062' }] },
    ])
    const result = await serviceWith(db).list('w1', {}, false)

    // Combien de notes attendent une décision n'est pas une information
    // financière : le cacher retirerait le seul chiffre qui dit quoi faire.
    expect(result.tiles.pending.count).toBe(15)
    expect(result.tiles.pending.totalAmountCents).toBeNull()
    expect(result.tiles.validated.count).toBe(0)
    expect(result.items[0]?.totalAmountCents).toBeNull()
    expect(result.canReadFinance).toBe(false)
  })

  it('laisse passer les montants à qui a le droit', async () => {
    const db = new FakeDb([
      { match: /GROUP BY r\.id/, rows: [REPORT] },
      { match: /GROUP BY r\.status/, rows: [{ status: 'pending', count: '15', total_cents: '2654062' }] },
    ])
    const result = await serviceWith(db).list('w1', {}, true)

    expect(result.tiles.pending.totalAmountCents).toBe(2654062)
    expect(result.items[0]?.totalAmountCents).toBe(13850)
  })

  it('passe le mois, l’état et la recherche à la requête — pas à un filtre en mémoire', async () => {
    const db = new FakeDb([{ match: /FROM expense_reports r/, rows: [] }])
    await serviceWith(db).list('w1', { month: '2026-05', status: 'pending', search: 'DINUM' }, true)

    const [first] = db.executed
    expect(first?.params).toEqual(['w1', '2026-05', 'pending', '%DINUM%', null])
  })
})

describe('ExpenseReportsService.validate — le lien avec la marge', () => {
  const validateDb = (over: Partial<{ decided: Row[]; total: Row[]; inserted: Row[] }> = {}) =>
    new FakeDb([
      { match: /UPDATE expense_reports[\s\S]*'validated'/, rows: over.decided ?? ([[{ ...REPORT }], 1] as never) },
      { match: /SELECT[\s\S]*MAX\(spent_on\)/, rows: over.total ?? [{ total: '13850', last_spent_on: '2026-05-15' }] },
      { match: /INSERT INTO mission_expenses/, rows: over.inserted ?? [{ id: 'me1' }] },
    ])

  it('écrit UNE ligne de frais de mission, et garde sa preuve', async () => {
    const db = validateDb()
    const result = await serviceWith(db).validate('w1', 'u1', 'r1')

    expect(result.status).toBe('validated')
    expect(result.missionExpenseId).toBe('me1')

    const inserts = db.sqlMatching(/INSERT INTO mission_expenses/)
    expect(inserts).toHaveLength(1)
    // Le montant poussé dans la marge est celui de la note, au centime.
    expect(inserts[0]?.params).toContain(13850)
    // La preuve est reliée : sans elle, rejouer écrirait une seconde ligne.
    expect(db.sqlMatching(/SET mission_expense_id/)).toHaveLength(1)
  })

  it('ne réécrit RIEN quand la note porte déjà sa ligne de frais', async () => {
    // Le cas réel : une reprise après timeout. Deux lignes ici, et la marge de
    // la mission compte les frais deux fois — sans que rien ne l'indique.
    const db = validateDb({ decided: [[{ ...REPORT, mission_expense_id: 'me1' }], 1] as never })
    const result = await serviceWith(db).validate('w1', 'u1', 'r1')

    expect(result.missionExpenseId).toBe('me1')
    expect(db.sqlMatching(/INSERT INTO mission_expenses/)).toHaveLength(0)
  })

  it('n’écrit aucune ligne de coût pour une note SANS mission', async () => {
    const db = validateDb({ decided: [[{ ...REPORT, mission_id: null }], 1] as never })
    const result = await serviceWith(db).validate('w1', 'u1', 'r1')

    expect(result.missionExpenseId).toBeNull()
    expect(db.sqlMatching(/INSERT INTO mission_expenses/)).toHaveLength(0)
  })

  it('n’écrit aucune ligne de coût pour une note à zéro — la contrainte SQL la refuserait', async () => {
    const db = validateDb({ total: [{ total: '0', last_spent_on: null }] })
    const result = await serviceWith(db).validate('w1', 'u1', 'r1')

    expect(result.missionExpenseId).toBeNull()
    expect(db.sqlMatching(/INSERT INTO mission_expenses/)).toHaveLength(0)
  })

  it('refuse de valider une note déjà décidée', async () => {
    const db = validateDb({ decided: [[], 0] as never })
    await expect(serviceWith(db).validate('w1', 'u1', 'r1')).rejects.toBeInstanceOf(NotFoundException)
    expect(db.sqlMatching(/INSERT INTO mission_expenses/)).toHaveLength(0)
  })
})

describe('ExpenseReportsService.reject', () => {
  const rejectDb = (rows: unknown = [[{ id: 'r1' }], 1]) =>
    new FakeDb([{ match: /UPDATE expense_reports[\s\S]*'rejected'/, rows: rows as never }])

  it('enregistre le refus, son motif nettoyé et sa date', async () => {
    const db = rejectDb()
    const result = await serviceWith(db).reject('w1', 'u1', 'r1', '  Justificatif illisible  ')

    expect(result.status).toBe('rejected')
    expect(result.rejectionReason).toBe('Justificatif illisible')
    expect(db.executed[0]?.params).toContain('Justificatif illisible')
  })

  it('refuse un motif qui n’est que des espaces — avant même de toucher la base', async () => {
    // Un motif vide passe toute validation de présence et ne dit rien à
    // personne. Trois remparts : le schéma, ceci, puis la contrainte SQL.
    const db = rejectDb()
    await expect(serviceWith(db).reject('w1', 'u1', 'r1', '   ')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.executed).toHaveLength(0)
  })

  it('n’efface rien d’autre : une note refusée garde ses lignes', async () => {
    const db = rejectDb()
    await serviceWith(db).reject('w1', 'u1', 'r1', 'Motif')
    // On archive, on ne supprime pas.
    expect(db.sqlMatching(/DELETE/)).toHaveLength(0)
  })

  it('refuse une note déjà décidée (rejet)', async () => {
    await expect(serviceWith(rejectDb([[], 0])).reject('w1', 'u1', 'r1', 'Motif')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  LES JUSTIFICATIFS — le bouton qui n'existait pas (31/08/2026)             */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Avant ce lot, `download_url` valait `NULL` PARTOUT et l'écran n'offrait aucun
 * bouton — à raison : « un bouton qui ne télécharge rien est une donnée fictive
 * sous forme d'affordance ». Ce que ces tests protègent, c'est que la condition
 * du bouton reste la DÉTENTION des octets, pas leur promesse.
 */
describe('ExpenseReportsService — les justificatifs', () => {
  function attachmentsDb(rows: Row[]): FakeDb {
    return new FakeDb([
      { match: /FROM expense_reports r/, rows: [REPORT] },
      { match: /FROM expense_report_lines/, rows: LINES },
      { match: /FROM expense_report_attachments/, rows },
      { match: /FROM expense_policies/, rows: [POLICY] },
      { match: /FROM expense_policy_caps/, rows: CAPS },
    ])
  }

  it('offre une porte de téléchargement pour la pièce RANGÉE, et rien pour l’autre', async () => {
    const detail = await serviceWith(
      attachmentsDb([
        {
          id: 'a1',
          file_name: 'Facture_hotel.pdf',
          byte_size: '127000',
          retention_until: '2036-05-14',
          storage_object_id: 'obj-1',
        },
        {
          id: 'a2',
          file_name: 'Recu_taxi.jpg',
          byte_size: null,
          retention_until: '2036-05-14',
          storage_object_id: null,
        },
      ]),
    ).detail('w1', 'r1', true, '2026-06-02')

    // ⚠️ Ce n'est PAS l'URL du magasin : c'est la porte de l'API, qui vérifiera
    // le droit puis signera. Une URL de magasin dans une réponse de liste
    // vivrait cinq minutes et fuiterait au copier-coller.
    expect(detail.attachments[0]?.downloadUrl).toBe('/expenses/reports/r1/attachments/a1/download')
    // Pièce référencée sans octets : aucun bouton, comme avant ce lot.
    expect(detail.attachments[1]?.downloadUrl).toBeNull()
    // Et un poids inconnu reste inconnu — jamais « 0 KB ».
    expect(detail.attachments[1]?.byteSize).toBeNull()
  })

  it('rattache une pièce à une note ENCORE EN ATTENTE, et borne l’écriture à l’espace', async () => {
    const db = new FakeDb([
      { match: /SELECT id, status\s+FROM expense_reports/, rows: [{ id: 'r1', status: 'pending' }] },
      { match: /INSERT INTO expense_report_attachments/, rows: [{ id: 'a9' }] },
    ])
    const view = await serviceWith(db).attach('w1', 'r1', {
      objectId: 'obj-9',
      fileName: 'Facture_hotel.pdf',
      contentType: 'application/pdf',
      byteSize: 127000,
      retentionUntil: '2036-08-31',
    })

    expect(view).toEqual({
      id: 'a9',
      fileName: 'Facture_hotel.pdf',
      byteSize: 127000,
      downloadUrl: '/expenses/reports/r1/attachments/a9/download',
      retentionUntil: '2036-08-31',
    })
    const [insert] = db.sqlMatching(/INSERT INTO expense_report_attachments/)
    expect(insert?.params).toEqual(expect.arrayContaining(['r1', 'w1', 'obj-9']))
  })

  it('refuse de rattacher une pièce à une note DÉCIDÉE — un dossier tranché ne se complète pas', async () => {
    const db = new FakeDb([
      { match: /SELECT id, status\s+FROM expense_reports/, rows: [{ id: 'r1', status: 'validated' }] },
    ])
    await expect(
      serviceWith(db).attach('w1', 'r1', {
        objectId: 'obj-9',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        byteSize: 10,
        retentionUntil: '2036-08-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(db.sqlMatching(/INSERT INTO expense_report_attachments/)).toHaveLength(0)
  })

  it('refuse une note d’un AUTRE espace avant toute écriture', async () => {
    const db = new FakeDb([{ match: /SELECT id, status\s+FROM expense_reports/, rows: [] }])
    await expect(
      serviceWith(db).attach('w-autre', 'r1', {
        objectId: 'obj-9',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        byteSize: 10,
        retentionUntil: '2036-08-31',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(db.sqlMatching(/INSERT/)).toHaveLength(0)
  })

  it('ne rend l’objet d’une pièce que si la note ET la pièce sont dans l’espace', async () => {
    const found = new FakeDb([{ match: /SELECT a.storage_object_id/, rows: [{ storage_object_id: 'obj-1' }] }])
    expect(await serviceWith(found).attachmentObjectId('w1', 'r1', 'a1')).toBe('obj-1')

    const absent = new FakeDb([{ match: /SELECT a.storage_object_id/, rows: [] }])
    await expect(serviceWith(absent).attachmentObjectId('w1', 'r1', 'a1')).rejects.toBeInstanceOf(NotFoundException)
    // La jointure est BORNÉE par l'espace des DEUX côtés : la pièce ET sa note.
    const [read] = absent.sqlMatching(/SELECT a.storage_object_id/)
    expect(read?.sql).toContain('r.workspace_id = $3')
  })

  it('dit « pas de fichier » plutôt que de lever, quand la pièce existe sans octets', async () => {
    const db = new FakeDb([{ match: /SELECT a.storage_object_id/, rows: [{ storage_object_id: null }] }])
    expect(await serviceWith(db).attachmentObjectId('w1', 'r1', 'a1')).toBeNull()
  })
})

/*  LE DÉPÔT (31/08/2026) — le chemin qui manquait au domaine                 */
/* ══════════════════════════════════════════════════════════════════════════ */

const SAVE_INPUT = {
  reference: 'F-2026-010',
  bearerName: 'Inès Kaczmarek',
  periodMonth: '2026-05',
  missionId: null,
  accountId: null,
  lines: [
    {
      category: 'meal' as const,
      label: 'Repas – Déjeuner',
      spentOn: '2026-05-15',
      city: 'Paris',
      detail: null,
      amountCents: 1850,
      vatRateBps: null,
      distanceKm: null,
      fiscalHorsepower: null,
    },
  ],
  attachments: [{ fileName: 'Ticket.pdf', contentType: 'application/pdf', byteSize: null }],
}

describe('ExpenseReportsService.save — une note se DÉPOSE', () => {
  it('crée une note en BROUILLON, sans date de dépôt', async () => {
    const db = new FakeDb([{ match: /INSERT INTO expense_reports/, rows: [{ id: 'new1' }] }])
    const saved = await serviceWith(db).save('w1', 'u1', null, SAVE_INPUT)

    expect(saved).toEqual({ id: 'new1', status: 'draft' })
    const [insert] = db.sqlMatching(/INSERT INTO expense_reports/)
    // ⚠️ `submitted_at` est NULL : une note que personne n'a déposée n'a pas de
    // date de dépôt, et en inventer une afficherait un fait faux.
    expect(insert?.sql).toContain("'draft', NULL")
  })

  it('refuse une référence déjà prise, avec une phrase que le déposant peut corriger', async () => {
    // `ON CONFLICT DO NOTHING` plutôt qu'une violation d'index remontée en 500.
    const db = new FakeDb([{ match: /INSERT INTO expense_reports/, rows: [] }])
    await expect(serviceWith(db).save('w1', 'u1', null, SAVE_INPUT)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('écrit « taux non lu » comme `null`, jamais comme 0', async () => {
    const db = new FakeDb([{ match: /INSERT INTO expense_reports/, rows: [{ id: 'new1' }] }])
    await serviceWith(db).save('w1', 'u1', null, SAVE_INPUT)

    const [line] = db.sqlMatching(/INSERT INTO expense_report_lines/)
    // Le 9e paramètre est `vat_rate_bps`. Un `?? 0` ici annulerait la colonne
    // nullable, et la ventilation aurait l'air complète sur un ticket non lu.
    expect(line?.params[8]).toBeNull()
  })

  it('ne fabrique AUCUNE URL de téléchargement — le stockage n’est pas branché', async () => {
    const db = new FakeDb([{ match: /INSERT INTO expense_reports/, rows: [{ id: 'new1' }] }])
    await serviceWith(db).save('w1', 'u1', null, SAVE_INPUT)

    const [attachment] = db.sqlMatching(/INSERT INTO expense_report_attachments/)
    // Un bouton qui ne télécharge rien est une donnée fictive sous forme
    // d'affordance — on le découvre en réunion, pas en CI.
    expect(attachment?.sql).toContain('NULL, $6::date')
    // L'échéance de conservation est CALCULÉE puis STOCKÉE : dix ans après la
    // dernière dépense de la note, et jamais recalculée à l'affichage.
    expect(attachment?.params[5]).toBe('2036-05-15')
  })

  it('remplace les lignes d’une note qu’on corrige, et refuse d’en toucher une décidée', async () => {
    const db = new FakeDb([{ match: /UPDATE expense_reports/, rows: [[{ id: 'r1', status: 'pending' }], 1] as never }])
    const saved = await serviceWith(db).save('w1', 'u1', 'r1', SAVE_INPUT)
    expect(saved.status).toBe('pending')
    // La condition est posée en BASE : deux requêtes concurrentes franchissent
    // un `if`, pas un `WHERE`.
    expect(db.sqlMatching(/UPDATE expense_reports/)[0]?.sql).toContain("status IN ('draft', 'pending')")
    expect(db.sqlMatching(/DELETE FROM expense_report_lines/)).toHaveLength(1)

    const decided = new FakeDb([{ match: /UPDATE expense_reports/, rows: [[], 0] as never }])
    await expect(serviceWith(decided).save('w1', 'u1', 'r1', SAVE_INPUT)).rejects.toBeInstanceOf(NotFoundException)
    // Rien n'a été effacé sur une note qu'on n'avait pas le droit de toucher.
    expect(decided.sqlMatching(/DELETE/)).toHaveLength(0)
  })
})

describe('ExpenseReportsService.submit / withdraw', () => {
  it('soumettre date le dépôt, et ne le redate pas au second clic', async () => {
    const db = new FakeDb([{ match: /UPDATE expense_reports/, rows: [[{ id: 'r1' }], 1] as never }])
    const result = await serviceWith(db).submit('w1', 'r1')
    expect(result.status).toBe('pending')
    expect(result.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // `WHERE status = 'draft'` : repousser la date d'un clic effacerait le
    // retard qu'on lit pour dire « ça attend depuis douze jours ».
    expect(db.executed[0]?.sql).toContain("status = 'draft'")

    const already = new FakeDb([{ match: /UPDATE expense_reports/, rows: [[], 0] as never }])
    await expect(serviceWith(already).submit('w1', 'r1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('retirer une note EN ATTENTE la rend au brouillon et efface sa date de dépôt', async () => {
    const db = new FakeDb([{ match: /UPDATE expense_reports/, rows: [[{ id: 'r1' }], 1] as never }])
    expect(await serviceWith(db).withdraw('w1', 'r1')).toEqual({ id: 'r1', status: 'draft' })
    expect(db.executed[0]?.sql).toContain('submitted_at = NULL')
    // Garder l'ancienne date ferait remonter, à la re-soumission, un délai
    // d'attente qui n'a pas eu lieu.
    expect(db.executed[0]?.sql).toContain("status = 'pending'")
  })

  it('ne retire PAS une note décidée — on la refuse avec un motif, on ne la défait pas', async () => {
    const db = new FakeDb([{ match: /UPDATE expense_reports/, rows: [[], 0] as never }])
    await expect(serviceWith(db).withdraw('w1', 'r1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('ExpenseReportsService.list — la pagination', () => {
  const paginated = () =>
    new FakeDb([
      // ⚠️ `AS total` et non `COUNT(DISTINCT r.id)` seul : la requête des TUILES
      // porte elle aussi ce compte, et un motif trop large lui aurait fait
      // rendre la réponse du décompte — quatre tuiles à zéro, sans erreur.
      { match: /COUNT\(DISTINCT r\.id\)::int AS total/, rows: [{ total: 60 }] },
      { match: /GROUP BY r\.id/, rows: [REPORT] },
      { match: /GROUP BY r\.status/, rows: [{ status: 'draft', count: '2', total_cents: '4200' }] },
    ])

  it('rend le TOTAL du filtre, pas le nombre de lignes rendues', async () => {
    // C'est lui qui écrit « 1–10 sur 60 ». Sans lui, l'écran ne saurait pas
    // s'il existe une page suivante et proposerait des pages vides.
    const result = await serviceWith(paginated()).list('w1', {}, true)
    expect(result.total).toBe(60)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(10)
  })

  it('décale la fenêtre en base, jamais en mémoire', async () => {
    const db = paginated()
    await serviceWith(db).list('w1', { page: 3, pageSize: 25 }, true)
    const [listed] = db.sqlMatching(/GROUP BY r\.id/)
    expect(listed?.sql).toContain('LIMIT $5 OFFSET $6')
    expect(listed?.params.slice(4, 6)).toEqual([25, 50])
  })

  it('compte les BROUILLONS dans leur propre tuile', async () => {
    // Sans elle, le déposant ne verrait pas ce qu'il a commencé sans finir, et
    // le total de la période — qui distingue « le mois est vide » de « c'est
    // ton filtre qui a tout retiré » — compterait faux.
    const result = await serviceWith(paginated()).list('w1', {}, true)
    expect(result.tiles.draft.count).toBe(2)
    expect(result.tiles.pending.count).toBe(0)
  })

  it('ne compte pas le total en additionnant les tuiles', async () => {
    // Les tuiles ignorent le filtre d'ÉTAT (elles le remplacent) : leur somme
    // répondrait à une autre question dès qu'un état est sélectionné.
    const db = paginated()
    await serviceWith(db).list('w1', { status: 'pending' }, true)
    const [counted] = db.sqlMatching(/COUNT\(DISTINCT r\.id\)/)
    expect(counted?.params[2]).toBe('pending')
    const [tiles] = db.sqlMatching(/GROUP BY r\.status/)
    expect(tiles?.params).toHaveLength(4)
  })
})

describe('ExpenseReportsService.detail — le barème kilométrique', () => {
  const kilometric: Row = {
    id: 'l9',
    category: 'mileage',
    label: 'Trajet Paris → Rouen',
    spent_on: '2026-05-12',
    city: 'Paris',
    detail: null,
    amount_cents: '15000',
    vat_rate_bps: null,
    distance_km: 200,
    fiscal_horsepower: 5,
  }

  it('laisse la ligne NON VÉRIFIÉE tant que rien n’est saisi', async () => {
    // Un barème inventé serait une donnée fictive présentée comme une règle
    // officielle : sans saisie, le produit ne conclut rien.
    const detail = await serviceWith(detailDb({ lines: [kilometric] })).detail('w1', 'r1', true, '2026-06-02')
    expect(detail.compliance.verdict).toBe('unknown')
    expect(detail.lines[0]?.capCents).toBeNull()
    expect(detail.lines[0]?.overageCents).toBeNull()
    expect(detail.lines[0]?.distanceKm).toBe(200)
  })

  it('juge la ligne une fois le barème saisi, sans rien affirmer sur sa TVA', async () => {
    const db = detailDb({
      lines: [kilometric],
      rates: [{ fiscal_horsepower: 5, cents_per_km: '60', effective_from: '2026-01-01' }],
    })
    const detail = await serviceWith(db).detail('w1', 'r1', true, '2026-06-02')

    // 200 km × 0,60 € = 120 € opposables, 150 € réclamés → 30 € de dépassement.
    expect(detail.lines[0]?.capCents).toBe(12000)
    expect(detail.lines[0]?.overageCents).toBe(3000)
    expect(detail.compliance.verdict).toBe('breach')
    // ⚠️ La TVA reste NON MESURÉE : le barème kilométrique ne porte aucun droit
    // à déduction, et en inventer un affirmerait un fait fiscal que personne
    // n'a saisi.
    expect(detail.lines[0]?.recoverableVatCents).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Théo C missions-notes-de-frais.N3-N5 — la liste dit où en est la vérification */
/* -------------------------------------------------------------------------- */

describe('ExpenseReportsService.list — la vérification au barème, ligne par ligne', () => {
  const PENDING_REPORT: Row = {
    ...REPORT,
    id: 'r1',
    reference: 'NDF-2026-10-014',
    bearer_name: 'Yanis Berthier',
    mission_label: 'Fiabilisation plateforme — renfort exploitation',
    account_id: 'acc1',
    submitted_at: new Date('2026-10-10T09:00:00Z'),
    decided_at: null,
    decided_by: null,
  }
  const DRAFT_REPORT: Row = {
    ...REPORT,
    id: 'r3',
    reference: 'NDF-2026-10-017',
    bearer_name: 'Camille Roussel',
    status: 'draft',
    account_id: 'acc1',
    submitted_at: null,
  }
  const SCALE_LINES: Row[] = [
    // Repas 78 € contre un plafond de 25 € : dépassement de 53 €.
    {
      expense_report_id: 'r1',
      category: 'meal',
      spent_on: '2026-10-09',
      amount_cents: '7800',
      vat_rate_bps: null,
      distance_km: null,
      fiscal_horsepower: null,
    },
    // Hôtel 138 € sous un plafond de 150 € : conforme.
    {
      expense_report_id: 'r1',
      category: 'hotel',
      spent_on: '2026-10-09',
      amount_cents: '13800',
      vat_rate_bps: null,
      distance_km: null,
      fiscal_horsepower: null,
    },
    // Fournitures : aucune catégorie au barème — NON VÉRIFIÉE, pas conforme.
    {
      expense_report_id: 'r3',
      category: 'supplies',
      spent_on: '2026-10-15',
      amount_cents: '2500',
      vat_rate_bps: null,
      distance_km: null,
      fiscal_horsepower: null,
    },
  ]

  const verifiedDb = (reports: Row[] = [PENDING_REPORT, DRAFT_REPORT]) =>
    new FakeDb([
      { match: /GROUP BY r\.id/, rows: reports },
      { match: /GROUP BY r\.status/, rows: [{ status: 'pending', count: '1', total_cents: '21600' }] },
      {
        match: /r\.status IN \('pending', 'draft'\)/,
        rows: [
          { id: 'r1', reference: 'NDF-2026-10-014', bearer_name: 'Yanis Berthier', account_id: 'acc1' },
          { id: 'r3', reference: 'NDF-2026-10-017', bearer_name: 'Camille Roussel', account_id: 'acc1' },
        ],
      },
      { match: /FROM expense_report_lines l/, rows: SCALE_LINES },
      { match: /FROM expense_policies/, rows: [{ id: 'p1', account_id: null }] },
      { match: /FROM expense_policy_caps/, rows: CAPS },
      { match: /FROM expense_report_attachments/, rows: [{ expense_report_id: 'r1', attachment_count: 2 }] },
      { match: /FROM profiles/, rows: [{ user_id: 'u9', first_name: 'Maëva', last_name: 'Coet' }] },
    ])

  it('porte pour chaque note le verdict, le nombre de dépassements et le plus gros, avec le droit financier', async () => {
    const result = await serviceWith(verifiedDb()).list('w1', {}, true)
    const first = result.items.find(item => item.id === 'r1')
    expect(first?.missionLabel).toBe('Fiabilisation plateforme — renfort exploitation')
    expect(first?.policyCheck.verdict).toBe('breach')
    expect(first?.policyCheck.overageCount).toBe(1)
    expect(first?.policyCheck.worstOverage).toEqual({ category: 'meal', overageCents: 5300 })
    expect(first?.submittedAt).toBe('2026-10-10T09:00:00.000Z')
  })

  it('ne conclut JAMAIS « conforme » d’une catégorie absente du barème', async () => {
    const result = await serviceWith(verifiedDb()).list('w1', {}, true)
    const draft = result.items.find(item => item.id === 'r3')
    expect(draft?.policyCheck.verdict).toBe('unknown')
    expect(draft?.policyCheck.unmeasuredLineCount).toBe(1)
    expect(draft?.policyCheck.worstOverage).toBeNull()
    expect(draft?.submittedAt).toBeNull()
  })

  it('met le montant du dépassement à null — présent, jamais 0 — sans `finance:read`', async () => {
    const result = await serviceWith(verifiedDb()).list('w1', {}, false)
    const first = result.items.find(item => item.id === 'r1')
    expect(first?.policyCheck.overageCount).toBe(1)
    expect(first?.policyCheck.worstOverage).toEqual({ category: 'meal', overageCents: null })
    expect(result.verification.overages[0]?.overageCents).toBeNull()
  })

  it('nomme celui qui a décidé, quand le profil se lit', async () => {
    const validated: Row = {
      ...PENDING_REPORT,
      id: 'r2',
      status: 'validated',
      decided_at: new Date('2026-10-02T10:00:00Z'),
      decided_by: 'u9',
    }
    const result = await serviceWith(verifiedDb([validated])).list('w1', {}, true)
    expect(result.items[0]?.decidedByName).toBe('Maëva Coet')
    expect(result.items[0]?.decidedAt).toBe('2026-10-02T10:00:00.000Z')
  })

  it('dit « personne » plutôt que d’inventer un nom quand le profil manque', async () => {
    const validated: Row = { ...PENDING_REPORT, id: 'r2', status: 'validated', decided_by: 'u-inconnu' }
    const result = await serviceWith(verifiedDb([validated])).list('w1', {}, true)
    expect(result.items[0]?.decidedByName).toBeNull()
  })

  it('résume ce qui reste à regarder sur les notes en attente et en brouillon : dépassements, lignes non vérifiées, justificatifs', async () => {
    const result = await serviceWith(verifiedDb()).list('w1', {}, true)
    expect(result.verification.overages).toEqual([
      {
        reportId: 'r1',
        reference: 'NDF-2026-10-014',
        bearerName: 'Yanis Berthier',
        category: 'meal',
        overageCents: 5300,
      },
    ])
    expect(result.verification.unmeasuredLineCount).toBe(1)
    expect(result.verification.lineCount).toBe(3)
    expect(result.verification.attachmentCount).toBe(2)
    // La note r3 porte une ligne et aucune pièce : on la compte, on ne la devine pas conforme.
    expect(result.verification.reportsWithoutReceipt).toBe(1)
  })

  it('sans aucune ligne, ne fabrique ni verdict « conforme » ni zéro', async () => {
    const db = new FakeDb([
      { match: /GROUP BY r\.id/, rows: [{ ...PENDING_REPORT, line_count: 0 }] },
      { match: /GROUP BY r\.status/, rows: [] },
    ])
    const result = await serviceWith(db).list('w1', {}, true)
    expect(result.items[0]?.policyCheck.verdict).toBe('unknown')
    expect(result.verification.overages).toEqual([])
  })
})

describe('ExpenseReportsService.list — le filtre par compte (Théo C missions-notes-de-frais.N7)', () => {
  const ACCOUNT = '5e8bb1a0-6a89-4a3c-9a3d-3d2c2a0f1b11'

  it('passe le compte à la requête de la liste, du décompte et des tuiles — pas à un filtre en mémoire', async () => {
    const db = new FakeDb([
      { match: /COUNT\(DISTINCT r\.id\)::int AS total/, rows: [{ total: 1 }] },
      { match: /GROUP BY r\.id/, rows: [REPORT] },
    ])
    await serviceWith(db).list('w1', { accountId: ACCOUNT }, true)

    const [counted] = db.sqlMatching(/COUNT\(DISTINCT r\.id\)::int AS total/)
    expect(counted?.params).toContain(ACCOUNT)
    const [listed] = db.sqlMatching(/GROUP BY r\.id/)
    expect(listed?.params).toContain(ACCOUNT)
    expect(listed?.sql).toContain('r.account_id =')
    const [tiles] = db.sqlMatching(/GROUP BY r\.status/)
    expect(tiles?.params).toContain(ACCOUNT)
  })

  it('sans compte, ne filtre rien', async () => {
    const db = new FakeDb([{ match: /GROUP BY r\.id/, rows: [REPORT] }])
    await serviceWith(db).list('w1', {}, true)
    const [listed] = db.sqlMatching(/GROUP BY r\.id/)
    expect(listed?.params[6]).toBeNull()
  })
})
