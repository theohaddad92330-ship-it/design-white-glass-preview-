import { describe, expect, it } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_REPORT_STATUSES,
  RECEIPT_RETENTION_YEARS_FR,
  capForCategory,
  detectExpenseReportAnomalies,
  effectiveCapCents,
  expenseLinesTotalCents,
  expensePolicyCompliance,
  expenseVatBreakdown,
  lineCapOverageCents,
  lineRecoverableVatCents,
  mileageAllowanceCents,
  receiptRetentionUntil,
  redactExpenseReportFinance,
  rejectExpenseReportSchema,
  expenseReportListQuerySchema,
  saveExpensePolicySchema,
  saveExpenseReportSchema,
  EXPENSE_PAGE_SIZES,
  type ExpenseCapFacts,
  type ExpenseLineFacts,
  type MileageRateFacts,
} from './expense-report.js'

/**
 * LA NOTE DE FRAIS — le domaine, pas seulement l'écran (31/08/2026).
 *
 * Ce fichier tient les QUATRE dérivations qui font la différence entre un
 * tableau de montants et un domaine : le barème par client, la TVA
 * récupérable et sa ventilation, la conservation légale des justificatifs, et
 * la vérification automatique.
 *
 * La règle qui traverse les quatre : **un verdict ne se conclut pas d'un
 * silence**. Pas de barème saisi ne veut pas dire « conforme » ; pas de taux
 * de TVA lu ne veut pas dire « 0 € récupérable ». Les deux rendent `null`, et
 * ce qui n'a pas pu être évalué est COMPTÉ, pour que l'écran puisse le nommer.
 */

const line = (over: Partial<ExpenseLineFacts> = {}): ExpenseLineFacts => ({
  category: 'meal',
  amountCents: 1850,
  vatRateBps: 1000,
  spentOn: '2026-05-15',
  ...over,
})

const cap = (over: Partial<ExpenseCapFacts> = {}): ExpenseCapFacts => ({
  category: 'meal',
  capCents: 2500,
  vatRecoverable: true,
  ...over,
})

describe('les vocabulaires', () => {
  it('porte les quatre états, le brouillon AJOUTÉ EN FIN', () => {
    // GA-08 : une valeur s'ajoute en fin, jamais au milieu — même quand
    // l'ordre du cycle de vie mettrait le brouillon en premier. `draft` est
    // arrivé le 31/08/2026, le jour où un chemin de dépôt l'a écrit.
    expect(EXPENSE_REPORT_STATUSES).toEqual(['pending', 'validated', 'rejected', 'draft'])
    expect(EXPENSE_REPORT_STATUSES.slice(0, 3)).toEqual(['pending', 'validated', 'rejected'])
  })

  it('ouvre la première catégorie sur « repas » et garde « other » en dernier', () => {
    // GA-08 : un enum n'insère jamais au milieu. `other` ferme la liste pour
    // que toute catégorie nouvelle s'ajoute AVANT lui sans rien déplacer.
    expect(EXPENSE_CATEGORIES[0]).toBe('meal')
    expect(EXPENSE_CATEGORIES.at(-1)).toBe('other')
    expect(new Set(EXPENSE_CATEGORIES).size).toBe(EXPENSE_CATEGORIES.length)
  })
})

describe('expenseLinesTotalCents', () => {
  it('additionne — et zéro ligne fait zéro euro, ce qui est VRAI', () => {
    expect(expenseLinesTotalCents([])).toBe(0)
    expect(expenseLinesTotalCents([line({ amountCents: 1850 }), line({ amountCents: 12000 })])).toBe(13850)
  })
})

describe('capForCategory', () => {
  it('rend le plafond de la catégorie, et `null` quand le barème n’en porte pas', () => {
    const caps = [cap({ category: 'meal', capCents: 2500 }), cap({ category: 'hotel', capCents: 15000 })]
    expect(capForCategory(caps, 'meal')?.capCents).toBe(2500)
    expect(capForCategory(caps, 'taxi')).toBeNull()
  })
})

describe('lineRecoverableVatCents — la TVA qu’on peut réellement récupérer', () => {
  it('extrait la TVA d’un montant TTC au taux lu', () => {
    // 120,00 € TTC à 20 % = 100,00 € HT + 20,00 € de TVA.
    expect(lineRecoverableVatCents(line({ amountCents: 12000, vatRateBps: 2000 }), cap())).toBe(2000)
    // 18,50 € TTC à 10 % (restauration) = 1,68 €.
    expect(lineRecoverableVatCents(line({ amountCents: 1850, vatRateBps: 1000 }), cap())).toBe(168)
  })

  it('rend ZÉRO quand le barème dit que la catégorie n’ouvre pas droit — un zéro VRAI', () => {
    // Le transport de personnes n'ouvre pas droit à déduction en France. Ce
    // n'est pas une absence de mesure : c'est zéro, et c'est mesuré.
    expect(lineRecoverableVatCents(line({ category: 'train', vatRateBps: 1000 }), cap({ vatRecoverable: false }))).toBe(
      0,
    )
  })

  it('rend `null` quand AUCUN barème ne se prononce sur la catégorie', () => {
    // Pas de politique = pas de réponse. Écrire 0 € affirmerait que rien n'est
    // récupérable, ce que personne n'a dit.
    expect(lineRecoverableVatCents(line(), null)).toBeNull()
  })

  it('rend `null` quand le taux n’a pas été lu, et ZÉRO quand il vaut zéro', () => {
    expect(lineRecoverableVatCents(line({ vatRateBps: null }), cap())).toBeNull()
    expect(lineRecoverableVatCents(line({ vatRateBps: 0 }), cap())).toBe(0)
  })
})

describe('expenseVatBreakdown — la ventilation, et ce qu’elle n’a pas pu ventiler', () => {
  const caps: ExpenseCapFacts[] = [
    cap({ category: 'meal', vatRecoverable: true }),
    cap({ category: 'hotel', vatRecoverable: false, capCents: 15000 }),
  ]

  it('sépare ce qui se récupère de ce que l’entreprise supporte', () => {
    const result = expenseVatBreakdown(
      [
        line({ category: 'meal', amountCents: 1850, vatRateBps: 1000 }),
        line({ category: 'hotel', amountCents: 12000, vatRateBps: 1000 }),
      ],
      caps,
    )
    expect(result.recoverableCents).toBe(168)
    expect(result.borneCents).toBe(1091)
    expect(result.unmeasuredLineCount).toBe(0)
  })

  it('COMPTE les lignes qu’elle n’a pas pu ventiler plutôt que de les noyer', () => {
    const result = expenseVatBreakdown(
      [
        line({ category: 'meal', amountCents: 1850, vatRateBps: 1000 }),
        line({ category: 'taxi', amountCents: 6800, vatRateBps: 1000 }), // aucun plafond pour `taxi`
        line({ category: 'meal', amountCents: 2300, vatRateBps: null }), // taux non lu
      ],
      caps,
    )
    expect(result.recoverableCents).toBe(168)
    expect(result.unmeasuredLineCount).toBe(2)
  })

  it('rend `null` — jamais 0 — quand AUCUNE ligne n’est ventilable', () => {
    const result = expenseVatBreakdown([line({ category: 'taxi' }), line({ category: 'train' })], caps)
    expect(result.recoverableCents).toBeNull()
    expect(result.borneCents).toBeNull()
    expect(result.unmeasuredLineCount).toBe(2)
  })

  it('sur une note SANS ligne, ne prétend rien', () => {
    expect(expenseVatBreakdown([], caps)).toEqual({
      recoverableCents: null,
      borneCents: null,
      unmeasuredLineCount: 0,
    })
  })
})

describe('lineCapOverageCents — le barème par client', () => {
  it('rend le dépassement, et ZÉRO quand la ligne tient dans le plafond', () => {
    expect(lineCapOverageCents(line({ amountCents: 1850 }), 2500)).toBe(0)
    expect(lineCapOverageCents(line({ amountCents: 3200 }), 2500)).toBe(700)
    // Pile au plafond : conforme, pas de dépassement.
    expect(lineCapOverageCents(line({ amountCents: 2500 }), 2500)).toBe(0)
  })

  it('rend `null` quand aucun plafond n’est déclaré — pas « conforme »', () => {
    expect(lineCapOverageCents(line(), null)).toBeNull()
    // Le plafond vient désormais de `effectiveCapCents`, qui rend `null` sur une
    // catégorie hors barème comme sur une catégorie non plafonnée.
    expect(effectiveCapCents(line(), [])).toBeNull()
    expect(effectiveCapCents(line(), [cap({ capCents: null })])).toBeNull()
  })
})

describe('capForCategory — un plafond a une DATE D’EFFET', () => {
  const caps = [
    cap({ category: 'meal', capCents: 2500, effectiveFrom: null }),
    cap({ category: 'meal', capCents: 2800, effectiveFrom: '2026-09-01' }),
  ]

  it('applique la révision à partir de sa date, et pas avant', () => {
    // Une dépense d'août est jugée sous le barème d'août. Sans cette date, une
    // révision de septembre rendrait rétroactivement conformes des notes de
    // mars — ou l'inverse.
    expect(capForCategory(caps, 'meal', '2026-08-15')?.capCents).toBe(2500)
    expect(capForCategory(caps, 'meal', '2026-09-01')?.capCents).toBe(2800)
    expect(capForCategory(caps, 'meal', '2026-10-02')?.capCents).toBe(2800)
  })

  it('sans date demandée, rend la dernière révision — l’état courant du barème', () => {
    expect(capForCategory(caps, 'meal')?.capCents).toBe(2800)
  })

  it('une entrée sans date d’effet est le repli, jamais la gagnante', () => {
    expect(
      capForCategory([caps[1] as ExpenseCapFacts, caps[0] as ExpenseCapFacts], 'meal', '2026-12-01')?.capCents,
    ).toBe(2800)
  })

  it('rend `null` quand aucune révision n’avait encore pris effet', () => {
    expect(capForCategory([cap({ effectiveFrom: '2026-09-01' })], 'meal', '2026-08-31')).toBeNull()
  })
})

describe('mileageAllowanceCents — un barème SAISI, jamais pré-rempli', () => {
  const rates: MileageRateFacts[] = [
    { fiscalHorsepower: 5, centsPerKm: 60, effectiveFrom: '2026-01-01' },
    { fiscalHorsepower: 5, centsPerKm: 65, effectiveFrom: '2026-06-01' },
    { fiscalHorsepower: 7, centsPerKm: 80, effectiveFrom: '2026-01-01' },
  ]
  const trip = (over: Partial<ExpenseLineFacts> = {}) =>
    line({ category: 'mileage', amountCents: 12000, distanceKm: 200, fiscalHorsepower: 5, ...over })

  it('multiplie la distance par le tarif EN VIGUEUR à la date du trajet', () => {
    expect(mileageAllowanceCents(trip({ spentOn: '2026-03-10' }), rates)).toBe(12000)
    expect(mileageAllowanceCents(trip({ spentOn: '2026-07-10' }), rates)).toBe(13000)
  })

  it('rend `null` — jamais 0 — tant que l’ESN n’a rien saisi', () => {
    // C'est LE point du chantier : un barème inventé serait une donnée fictive
    // présentée comme une règle officielle. Sans saisie, on ne conclut rien.
    expect(mileageAllowanceCents(trip(), [])).toBeNull()
    // Puissance jamais saisie au barème.
    expect(mileageAllowanceCents(trip({ fiscalHorsepower: 4 }), rates)).toBeNull()
    // Aucun tarif n'avait encore pris effet à cette date.
    expect(mileageAllowanceCents(trip({ spentOn: '2025-12-31' }), rates)).toBeNull()
  })

  it('rend `null` quand la distance ou la puissance manquent sur la ligne', () => {
    expect(mileageAllowanceCents(trip({ distanceKm: null }), rates)).toBeNull()
    expect(mileageAllowanceCents(trip({ fiscalHorsepower: null }), rates)).toBeNull()
  })

  it('ne se prononce pas sur une ligne qui n’est pas kilométrique', () => {
    expect(mileageAllowanceCents(line({ category: 'meal', distanceKm: 200, fiscalHorsepower: 5 }), rates)).toBeNull()
  })

  it('rend la ligne VÉRIFIABLE une fois le barème saisi, et pas avant', () => {
    const kilometric = trip({ amountCents: 15000, spentOn: '2026-03-10' })
    // Sans barème : non vérifiée. Le produit ne dit pas « conforme ».
    expect(expensePolicyCompliance([kilometric], []).verdict).toBe('unknown')
    // Avec : 200 km × 0,60 € = 120 €, réclamés 150 € → 30 € de dépassement.
    const judged = expensePolicyCompliance([kilometric], [], rates)
    expect(judged.verdict).toBe('breach')
    expect(judged.overages).toEqual([{ category: 'mileage', overageCents: 3000 }])
  })
})

describe('expensePolicyCompliance — « Conforme » ne se déduit pas d’un silence', () => {
  const caps: ExpenseCapFacts[] = [cap({ category: 'meal', capCents: 2500 })]

  it('dit CONFORME quand toutes les lignes ont été vérifiées et qu’aucune ne dépasse', () => {
    const result = expensePolicyCompliance([line({ amountCents: 1850 })], caps)
    expect(result.verdict).toBe('compliant')
    expect(result.overages).toEqual([])
    expect(result.unmeasuredLineCount).toBe(0)
  })

  it('dit DÉPASSEMENT, et NOMME de combien', () => {
    const result = expensePolicyCompliance([line({ amountCents: 3200 })], caps)
    expect(result.verdict).toBe('breach')
    expect(result.overages).toEqual([{ category: 'meal', overageCents: 700 }])
  })

  it('dit INCONNU — pas « conforme » — dès qu’une ligne n’a pas pu être vérifiée', () => {
    // C'est LE défaut que ce test empêche : un barème incomplet rendait
    // « Conforme » sur une note dont la moitié n'avait été comparée à rien.
    const result = expensePolicyCompliance([line({ amountCents: 1850 }), line({ category: 'taxi' })], caps)
    expect(result.verdict).toBe('unknown')
    expect(result.unmeasuredLineCount).toBe(1)
  })

  it('un dépassement l’emporte sur l’inconnu — ce qui est constaté se dit', () => {
    const result = expensePolicyCompliance([line({ amountCents: 3200 }), line({ category: 'taxi' })], caps)
    expect(result.verdict).toBe('breach')
    expect(result.unmeasuredLineCount).toBe(1)
  })

  it('une note sans ligne ne se déclare pas conforme', () => {
    expect(expensePolicyCompliance([], caps).verdict).toBe('unknown')
  })

  it('sans AUCUN barème, le verdict est inconnu de bout en bout', () => {
    expect(expensePolicyCompliance([line()], []).verdict).toBe('unknown')
  })
})

describe('receiptRetentionUntil — la conservation légale des justificatifs', () => {
  it('reporte la durée fournie sur la date de la dépense', () => {
    expect(receiptRetentionUntil('2026-05-15', RECEIPT_RETENTION_YEARS_FR)).toBe('2036-05-15')
    expect(receiptRetentionUntil('2026-05-15', 6)).toBe('2032-05-15')
  })

  it('tient le 29 février sans inventer un 30', () => {
    expect(receiptRetentionUntil('2024-02-29', 1)).toBe('2025-02-28')
  })

  it('rend `null` sur une date illisible plutôt qu’une échéance fabriquée', () => {
    expect(receiptRetentionUntil('pas-une-date', 10)).toBeNull()
    expect(receiptRetentionUntil('', 10)).toBeNull()
  })

  it('la durée est un PARAMÈTRE — la valeur française est nommée, pas codée en dur', () => {
    // Comme les jours fériés du relevé d'activité : dix ans est le Code de
    // commerce FRANÇAIS (L123-22). Le mettre en dur serait faux ailleurs.
    expect(RECEIPT_RETENTION_YEARS_FR).toBe(10)
  })
})

describe('detectExpenseReportAnomalies — la vérification automatique', () => {
  const base = {
    periodMonth: '2026-05',
    lines: [line({ spentOn: '2026-05-14' }), line({ spentOn: '2026-05-15', amountCents: 12000 })],
    attachmentCount: 2,
    today: '2026-06-02',
  }

  it('ne trouve RIEN sur une note saine — la liste vide veut dire « rien détecté »', () => {
    expect(detectExpenseReportAnomalies(base)).toEqual([])
  })

  it('signale une ligne datée hors de la période déclarée', () => {
    const found = detectExpenseReportAnomalies({ ...base, lines: [line({ spentOn: '2026-04-28' })] })
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('2026-05')
  })

  it('signale un doublon probable — même catégorie, même date, même montant', () => {
    const twice = line({ spentOn: '2026-05-14', amountCents: 1850, category: 'meal' })
    const found = detectExpenseReportAnomalies({ ...base, lines: [twice, { ...twice }] })
    expect(found.some(message => message.includes('doublon'))).toBe(true)
  })

  it('ne crie pas au doublon sur deux repas du même jour à des montants différents', () => {
    const found = detectExpenseReportAnomalies({
      ...base,
      lines: [line({ spentOn: '2026-05-14', amountCents: 1850 }), line({ spentOn: '2026-05-14', amountCents: 2300 })],
    })
    expect(found).toEqual([])
  })

  it('signale une note sans aucun justificatif', () => {
    const found = detectExpenseReportAnomalies({ ...base, attachmentCount: 0 })
    expect(found.some(message => message.includes('justificatif'))).toBe(true)
  })

  it('ne réclame pas de justificatif à une note qui n’a aucune ligne', () => {
    expect(detectExpenseReportAnomalies({ ...base, lines: [], attachmentCount: 0 })).toEqual([])
  })

  it('signale une période qui n’a pas commencé', () => {
    const found = detectExpenseReportAnomalies({ ...base, periodMonth: '2026-09', lines: [], attachmentCount: 1 })
    expect(found.some(message => message.includes('2026-09'))).toBe(true)
  })

  it('ne compare rien plutôt que de comparer à une période illisible', () => {
    expect(detectExpenseReportAnomalies({ ...base, periodMonth: 'mai', lines: [line()], attachmentCount: 1 })).toEqual(
      [],
    )
  })
})

describe('redactExpenseReportFinance — « pas le droit » n’est jamais « zéro »', () => {
  const view = {
    id: 'r1',
    totalAmountCents: 31850 as number | null,
    recoverableVatCents: 168 as number | null,
    borneVatCents: 1091 as number | null,
    lines: [{ id: 'l1', amountCents: 1850 as number | null, recoverableVatCents: 168 as number | null }],
  }

  it('laisse tout passer à qui a le droit', () => {
    expect(redactExpenseReportFinance(view, true)).toEqual(view)
  })

  it('vide les montants — PRÉSENTS et à `null`, jusque dans les lignes', () => {
    const redacted = redactExpenseReportFinance(view, false)
    expect(redacted.totalAmountCents).toBeNull()
    expect(redacted.recoverableVatCents).toBeNull()
    expect(redacted.borneVatCents).toBeNull()
    expect('totalAmountCents' in redacted).toBe(true)
    // Le trou le plus facile à laisser : l'entête rédigé, les LIGNES pas.
    expect(redacted.lines[0]?.amountCents).toBeNull()
    expect(redacted.lines[0]?.recoverableVatCents).toBeNull()
    // Ce qui n'est pas un montant ne bouge pas.
    expect(redacted.lines[0]?.id).toBe('l1')
  })

  it('n’invente pas une clé que la réponse ne portait pas', () => {
    const bare = redactExpenseReportFinance({ id: 'r2', lines: [] }, false)
    expect('totalAmountCents' in bare).toBe(false)
  })
})

describe('les corps de requête', () => {
  it('exige un motif de refus non vide, borné, et rien d’autre', () => {
    expect(rejectExpenseReportSchema.parse({ reason: '  Justificatif illisible  ' })).toEqual({
      reason: 'Justificatif illisible',
    })
    expect(rejectExpenseReportSchema.safeParse({}).success).toBe(false)
    expect(rejectExpenseReportSchema.safeParse({ reason: '   ' }).success).toBe(false)
    expect(rejectExpenseReportSchema.safeParse({ reason: 'x'.repeat(500) }).success).toBe(true)
    expect(rejectExpenseReportSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false)
    expect(rejectExpenseReportSchema.safeParse({ reason: 'Motif', status: 'validated' }).success).toBe(false)
  })

  it('accepte une recherche vide et refuse un mois mal formé', () => {
    expect(expenseReportListQuerySchema.parse({}).month).toBeUndefined()
    expect(expenseReportListQuerySchema.safeParse({ month: '2026-05' }).success).toBe(true)
    // Théo C missions-notes-de-frais.N7 — le filtre « Compte » : un identifiant, pas du texte libre.
    expect(expenseReportListQuerySchema.safeParse({ accountId: '5e8bb1a0-6a89-4a3c-9a3d-3d2c2a0f1b11' }).success).toBe(
      true,
    )
    expect(expenseReportListQuerySchema.safeParse({ accountId: 'pas-un-uuid' }).success).toBe(false)
    expect(expenseReportListQuerySchema.safeParse({ month: 'mai 2026' }).success).toBe(false)
    expect(expenseReportListQuerySchema.safeParse({ status: 'validated' }).success).toBe(true)
    expect(expenseReportListQuerySchema.safeParse({ status: 'draft' }).success).toBe(true)
    expect(expenseReportListQuerySchema.safeParse({ status: 'archivee' }).success).toBe(false)
  })

  it('lit la page depuis une CHAÎNE de requête, et borne la taille', () => {
    // Sans coercition, `page=2` échouerait la validation et l'écran retomberait
    // en silence sur la première page — ce qui se lit « la pagination ne marche
    // pas », pas « la requête est refusée ».
    expect(expenseReportListQuerySchema.parse({ page: '3', pageSize: '25' })).toMatchObject({ page: 3, pageSize: 25 })
    expect(expenseReportListQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(expenseReportListQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false)
    // La liste proposée à l'écran est la même que celle que le serveur accepte.
    expect(EXPENSE_PAGE_SIZES.every(size => expenseReportListQuerySchema.safeParse({ pageSize: size }).success)).toBe(
      true,
    )
  })

  it('accepte une note SANS ligne — un brouillon commence vide', () => {
    const parsed = saveExpenseReportSchema.parse({
      reference: '  F-2026-010 ',
      bearerName: 'Inès Kaczmarek',
      periodMonth: '2026-05',
    })
    expect(parsed.reference).toBe('F-2026-010')
    expect(parsed.lines).toEqual([])
    expect(parsed.missionId).toBeNull()
  })

  it('garde « taux non lu » distinct de « taux zéro » sur une ligne saisie', () => {
    const withoutRate = saveExpenseReportSchema.parse({
      reference: 'F-2026-011',
      bearerName: 'Hakim Barreau',
      periodMonth: '2026-05',
      lines: [{ category: 'meal', label: 'Déjeuner', spentOn: '2026-05-14', amountCents: 1850 }],
    })
    // ⚠️ `null`, jamais 0 : un défaut à zéro rendrait la note indistinguable
    // d'une note à taux zéro, et la ventilation aurait l'air complète.
    expect(withoutRate.lines[0]?.vatRateBps).toBeNull()
    expect(
      saveExpenseReportSchema.safeParse({
        reference: 'F',
        bearerName: 'X',
        periodMonth: '2026-05',
        lines: [{ category: 'meal', label: 'Déjeuner', spentOn: '2026-05-14', amountCents: 0 }],
      }).success,
    ).toBe(false)
  })

  it('refuse un lien de téléchargement fourni par le client', () => {
    // Une URL que le serveur n'a pas vérifiée serait ensuite rendue à tous les
    // membres de l'espace. Le lien vient du stockage, pas du formulaire.
    expect(
      saveExpenseReportSchema.safeParse({
        reference: 'F',
        bearerName: 'X',
        periodMonth: '2026-05',
        attachments: [{ fileName: 'note.pdf', downloadUrl: 'https://ailleurs.example/note.pdf' }],
      }).success,
    ).toBe(false)
  })

  it('le barème accepte « non plafonnée » comme une valeur, pas comme un oubli', () => {
    const parsed = saveExpensePolicySchema.parse({
      label: 'Barème interne',
      reimbursementBasis: 'actual',
      effectiveFrom: '2026-09-01',
      caps: [{ category: 'supplies', capCents: null, vatRecoverable: true }],
    })
    expect(parsed.caps[0]?.capCents).toBeNull()
    expect(parsed.accountId).toBeNull()
    expect(parsed.mileageRates).toEqual([])
    // Un plafond à zéro n'est pas « non plafonné » : c'est « interdit ». La
    // contrainte SQL le refuse déjà, le schéma le refuse avant l'aller-retour.
    expect(
      saveExpensePolicySchema.safeParse({
        label: 'X',
        reimbursementBasis: 'actual',
        effectiveFrom: '2026-09-01',
        caps: [{ category: 'meal', capCents: 0, vatRecoverable: true }],
      }).success,
    ).toBe(false)
  })

  it('une révision de barème exige SA date d’effet, une seule pour tout le lot', () => {
    // Sans elle, l'enregistrement écraserait l'historique — donc rejugerait des
    // notes déjà décidées, ce que la date d'effet existe pour empêcher.
    expect(
      saveExpensePolicySchema.safeParse({
        label: 'X',
        reimbursementBasis: 'actual',
        mileageRates: [{ fiscalHorsepower: 5, centsPerKm: 60 }],
      }).success,
    ).toBe(false)
    expect(
      saveExpensePolicySchema.safeParse({
        label: 'X',
        reimbursementBasis: 'actual',
        effectiveFrom: '2026-01-01',
        mileageRates: [{ fiscalHorsepower: 5, centsPerKm: 60 }],
      }).success,
    ).toBe(true)
    // Une date par plafond n'entre pas : la révision est datée, pas la ligne.
    expect(
      saveExpensePolicySchema.safeParse({
        label: 'X',
        reimbursementBasis: 'actual',
        effectiveFrom: '2026-01-01',
        caps: [{ category: 'meal', capCents: 2500, vatRecoverable: true, effectiveFrom: '2026-02-01' }],
      }).success,
    ).toBe(false)
  })
})
