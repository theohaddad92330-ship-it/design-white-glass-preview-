import { describe, expect, it } from 'vitest'
import {
  PAYMENT_TERMS_BASES,
  REDACTED_FINANCE_FIELDS,
  amortizedExpenseDailyCents,
  assignmentInputSchema,
  deriveStaffing,
  missionCommercialTermsSchema,
  missionElapsedDays,
  missionExpensesTotalCents,
  missionMargin,
  missionMarginWithExpenses,
  paymentTermsBasisSchema,
  poConsumption,
  redactFinance,
  upsertCommercialTermsSchema,
  type AssignmentWindow,
} from './staffing.js'

const NOW = new Date('2026-08-17T12:00:00.000Z')

function window(over: Partial<AssignmentWindow> = {}): AssignmentWindow {
  return { loadPercent: 100, startsOn: '2026-01-01', endsOn: '2026-12-31', ...over }
}

describe('deriveStaffing', () => {
  it('ne conclut RIEN sans affectation enregistrée', () => {
    // Une ESN qui ne renseigne pas ses missions verrait sinon tout son vivier
    // basculer en « disponible » et proposerait des gens en poste.
    const state = deriveStaffing([], NOW)
    expect(state.availability).toBe('unknown')
    expect(state.freeFrom).toBeNull()
  })

  it('dit OCCUPÉ à pleine charge, avec sa date de libération', () => {
    const state = deriveStaffing([window()], NOW)
    expect(state.availability).toBe('busy')
    expect(state.loadPercent).toBe(100)
    expect(state.freeFrom).toBe('2026-12-31')
  })

  it('dit PARTIEL en dessous de 100 %', () => {
    expect(deriveStaffing([window({ loadPercent: 60 })], NOW).availability).toBe('partial')
  })

  it('additionne les charges — un sur-staffing est un FAIT, pas une erreur d’affichage', () => {
    const state = deriveStaffing([window({ loadPercent: 80 }), window({ loadPercent: 60 })], NOW)
    expect(state.loadPercent).toBe(140)
    expect(state.availability).toBe('busy')
  })

  it('n’INVENTE PAS de fin sur une affectation sans date', () => {
    // Inventer une fin ferait apparaître une disponibilité jamais promise.
    const state = deriveStaffing([window({ endsOn: null })], NOW)
    expect(state.availability).toBe('busy_open_ended')
    expect(state.freeFrom).toBeNull()
  })

  it('prend la fin la PLUS TARDIVE, pas la plus proche', () => {
    // Prendre la plus proche annoncerait quelqu'un libre le 1er alors qu'une
    // autre mission court jusqu'au 30.
    const state = deriveStaffing(
      [window({ loadPercent: 50, endsOn: '2026-09-01' }), window({ loadPercent: 50, endsOn: '2026-11-30' })],
      NOW,
    )
    expect(state.freeFrom).toBe('2026-11-30')
  })

  it('distingue « libre, on le sait » de « on ne sait pas »', () => {
    // Des affectations existent, aucune ne court : la personne est libre POUR DE
    // BON, et ce n'est pas la même chose que l'absence d'information.
    const past = deriveStaffing([window({ startsOn: '2025-01-01', endsOn: '2025-06-30' })], NOW)
    expect(past.availability).toBe('available')
    expect(past.assignments).toBe(1)
  })

  it('ignore une affectation qui n’a pas encore commencé', () => {
    const future = deriveStaffing([window({ startsOn: '2027-01-01', endsOn: '2027-06-30' })], NOW)
    expect(future.availability).toBe('available')
    expect(future.loadPercent).toBe(0)
  })

  /**
   * #3068 — une mission INTERROMPUE et pas encore confirmée ne doit jamais
   * annoncer « disponible » nulle part ailleurs que dans l'écran d'interruption
   * lui-même. `#2414.49` (« jamais disponible avant confirmation ») vit dans le
   * NO-GO de l'épopée #2414/#2986 : c'est cette interruption-là,
   * `interruptionUnconfirmed`, que `deriveStaffing` doit refuser de blanchir en
   * « available » — pas toute fin de mission normale ou expirée, qui reste hors
   * de ce NO-GO (question produit distincte, non traitée ici).
   */
  it('bascule en « à confirmer » sur une interruption NON confirmée, jamais « disponible »', () => {
    const state = deriveStaffing(
      [window({ startsOn: '2026-01-01', endsOn: '2026-08-01', interruptionUnconfirmed: true })],
      NOW,
    )
    expect(state.availability).toBe('a_confirmer')
    expect(state.freeFrom).toBeNull()
  })

  it('redevient « disponible » une fois l’interruption confirmée', () => {
    const state = deriveStaffing(
      [window({ startsOn: '2026-01-01', endsOn: '2026-08-01', interruptionUnconfirmed: false })],
      NOW,
    )
    expect(state.availability).toBe('available')
  })

  it('une fin de mission NORMALE (pas d’interruption) reste « disponible » — hors NO-GO', () => {
    const state = deriveStaffing([window({ startsOn: '2025-01-01', endsOn: '2025-06-30' })], NOW)
    expect(state.availability).toBe('available')
  })
})

describe('assignmentInputSchema', () => {
  it('refuse une affectation qui finit avant de commencer', () => {
    expect(() =>
      assignmentInputSchema.parse({
        consultantId: '00000000-0000-4000-8000-000000000001',
        startsOn: '2026-09-01',
        endsOn: '2026-08-01',
      }),
    ).toThrow()
  })

  it('refuse une charge de zéro — ce n’est pas une affectation', () => {
    expect(() =>
      assignmentInputSchema.parse({
        consultantId: '00000000-0000-4000-8000-000000000001',
        loadPercent: 0,
        startsOn: '2026-09-01',
      }),
    ).toThrow()
  })

  it('accepte une affectation SANS fin', () => {
    const parsed = assignmentInputSchema.parse({
      consultantId: '00000000-0000-4000-8000-000000000001',
      startsOn: '2026-09-01',
    })
    expect(parsed.endsOn).toBeNull()
    expect(parsed.loadPercent).toBe(100)
  })

  /**
   * #2407.4 (suite) — consentement, documents, risques : DÉCLARATIFS,
   * additifs. Absents, ils restent `undefined`/`null` — jamais un défaut
   * inventé (GA-18/GA-19).
   */
  describe('consentement, documents, risques (#2407.4 suite)', () => {
    it('accepte les cinq champs déclaratifs', () => {
      const parsed = assignmentInputSchema.parse({
        consultantId: '00000000-0000-4000-8000-000000000001',
        startsOn: '2026-09-01',
        consentGiven: true,
        consentDate: '2026-09-01',
        documentsExpected: 'Casier judiciaire',
        documentsReceived: 'Casier judiciaire',
        declaredRisks: 'Dépendance à un seul expert',
      })
      expect(parsed.consentGiven).toBe(true)
      expect(parsed.consentDate).toBe('2026-09-01')
    })

    it('refuse une DATE de consentement sans consentement DÉCLARÉ (oui ou non)', () => {
      expect(() =>
        assignmentInputSchema.parse({
          consultantId: '00000000-0000-4000-8000-000000000001',
          startsOn: '2026-09-01',
          consentDate: '2026-09-01',
        }),
      ).toThrow()
    })

    it('accepte un consentement REFUSÉ, avec sa date — « non » se date aussi', () => {
      const parsed = assignmentInputSchema.parse({
        consultantId: '00000000-0000-4000-8000-000000000001',
        startsOn: '2026-09-01',
        consentGiven: false,
        consentDate: '2026-09-01',
      })
      expect(parsed.consentGiven).toBe(false)
    })

    it('sans aucun des cinq champs, ils restent absents — pas un défaut inventé', () => {
      const parsed = assignmentInputSchema.parse({
        consultantId: '00000000-0000-4000-8000-000000000001',
        startsOn: '2026-09-01',
      })
      expect(parsed.consentGiven).toBeUndefined()
      expect(parsed.documentsExpected).toBeUndefined()
      expect(parsed.declaredRisks).toBeUndefined()
    })
  })
})

describe('missionMargin', () => {
  it('calcule la marge quand les DEUX termes existent', () => {
    expect(missionMargin({ dailyRateCents: 65_000, loadedDailyCostCents: 45_500 })).toEqual({
      amountCents: 19_500,
      percent: 30,
    })
  })

  it('rend null dès qu’un terme manque', () => {
    // Une marge calculée sur un coût supposé est une décision commerciale prise
    // sur une invention.
    expect(missionMargin({ dailyRateCents: 65_000, loadedDailyCostCents: null })).toBeNull()
    expect(missionMargin({ dailyRateCents: null, loadedDailyCostCents: 45_500 })).toBeNull()
  })

  it('rend une marge NÉGATIVE plutôt que de la cacher', () => {
    // Une mission à perte doit se voir : c'est exactement l'information qu'on
    // cherche.
    const margin = missionMargin({ dailyRateCents: 40_000, loadedDailyCostCents: 45_000 })
    expect(margin?.amountCents).toBe(-5_000)
    expect(margin?.percent).toBeLessThan(0)
  })

  it('refuse de diviser par un TJM nul', () => {
    expect(missionMargin({ dailyRateCents: 0, loadedDailyCostCents: 45_000 })).toBeNull()
  })
})

describe('missionExpensesTotalCents', () => {
  it('additionne les lignes', () => {
    expect(missionExpensesTotalCents([{ amountCents: 1_000 }, { amountCents: 2_500 }])).toBe(3_500)
  })

  it('rend 0 sur une mission sans frais — un fait vrai, pas une invention', () => {
    expect(missionExpensesTotalCents([])).toBe(0)
  })
})

describe('missionElapsedDays', () => {
  const TODAY = new Date('2026-08-30T12:00:00.000Z')

  it('rend null sans date de début — rien à amortir sur une durée inconnue', () => {
    expect(missionElapsedDays(null, null, TODAY)).toBeNull()
  })

  it('compte les jours écoulés depuis le début, jusqu’à AUJOURD’HUI si la mission continue', () => {
    // 1er août → 30 août inclus = 30 jours.
    expect(missionElapsedDays('2026-08-01', null, TODAY)).toBe(30)
  })

  it('se borne à la fin si la mission est déjà TERMINÉE', () => {
    // Une mission finie en juillet ne doit pas amortir ses frais jusqu’à
    // aujourd’hui : ça diluerait leur coût sur des jours qu’elle n’a pas vécus.
    expect(missionElapsedDays('2026-07-01', '2026-07-10', TODAY)).toBe(10)
  })

  it('rend null sur une date de début illisible', () => {
    expect(missionElapsedDays('pas-une-date', null, TODAY)).toBeNull()
  })
})

describe('amortizedExpenseDailyCents', () => {
  it('divise le total par les jours écoulés', () => {
    expect(amortizedExpenseDailyCents(3_000, 10)).toBe(300)
  })

  it('rend null sans durée — pas de division par zéro ni par l’inconnu', () => {
    expect(amortizedExpenseDailyCents(3_000, null)).toBeNull()
    expect(amortizedExpenseDailyCents(3_000, 0)).toBeNull()
  })
})

describe('missionMarginWithExpenses', () => {
  it('rend null si la marge de BASE est déjà null — rien à amortir sur un coût inconnu', () => {
    expect(
      missionMarginWithExpenses({
        dailyRateCents: null,
        loadedDailyCostCents: 45_000,
        expensesTotalCents: 10_000,
        elapsedDays: 10,
      }),
    ).toBeNull()
  })

  it('rend null quand il n’y a AUCUN frais saisi — rien à ajouter à la marge de base', () => {
    expect(
      missionMarginWithExpenses({
        dailyRateCents: 65_000,
        loadedDailyCostCents: 45_500,
        expensesTotalCents: 0,
        elapsedDays: 10,
      }),
    ).toBeNull()
  })

  it('rend null quand des frais existent mais ne sont pas AMORTISSABLES (pas de date de début)', () => {
    // Les frais existent : ils ne doivent pas disparaître en silence. C'est à
    // l'appelant de le dire — `missionExpensesTotalCents` reste positif — sans
    // fabriquer un pourcentage sur une durée qu'on ne connaît pas.
    expect(
      missionMarginWithExpenses({
        dailyRateCents: 65_000,
        loadedDailyCostCents: 45_500,
        expensesTotalCents: 10_000,
        elapsedDays: null,
      }),
    ).toBeNull()
  })

  it('déduit les frais AMORTIS de la marge journalière, une fois amortissables', () => {
    // Marge de base : 65 000 − 45 500 = 19 500 (30 %). 10 000 de frais sur 10
    // jours = 1 000/jour amortis. Marge nette : 18 500 → 28,5 %.
    const result = missionMarginWithExpenses({
      dailyRateCents: 65_000,
      loadedDailyCostCents: 45_500,
      expensesTotalCents: 10_000,
      elapsedDays: 10,
    })
    expect(result).toEqual({ amountCents: 18_500, percent: 28.5 })
  })

  it('une marge nette peut passer sous zéro — elle doit se voir, pas se cacher', () => {
    const result = missionMarginWithExpenses({
      dailyRateCents: 40_000,
      loadedDailyCostCents: 38_000,
      expensesTotalCents: 30_000,
      elapsedDays: 10,
    })
    expect(result?.amountCents).toBeLessThan(0)
  })
})

describe('redactFinance', () => {
  it('met le champ à `null` — PRÉSENT, jamais retiré (D45 du 28/08/2026)', () => {
    // Trois rédactions écrites à la main divergeaient : `delivery` RETIRAIT le
    // champ, `staffing` le mettait à `null`. Un client qui lit
    // `data.margin === undefined` ne peut pas distinguer « le serveur ne me
    // l'envoie pas » d'« il n'y a pas de clé de ce nom » ; un `null` PRÉSENT,
    // lui, se lit comme une case connue et vide.
    const redacted = redactFinance(
      { id: 'm1', margin: { amountCents: 100, percent: 10 }, loadedDailyCostCents: 45_000 },
      false,
    )
    expect('margin' in redacted).toBe(true)
    expect('loadedDailyCostCents' in redacted).toBe(true)
    expect(redacted.margin).toBeNull()
    expect(redacted.loadedDailyCostCents).toBeNull()
    expect(redacted.id).toBe('m1')
  })

  it('ne met JAMAIS zéro — un zéro se lit comme une marge nulle', () => {
    const redacted = redactFinance({ marginPercent: 32 }, false)
    expect(redacted.marginPercent).toBeNull()
    expect(redacted.marginPercent).not.toBe(0)
  })

  it('vide TOUS les porteurs de coût, de marge et de montant, quel que soit leur nom', () => {
    // Cinq familles :
    //  · le coût et la marge — `margin` (`{amountCents, percent}`),
    //    `marginPercent` (un nombre nu), `loadedDailyCostCents` (le coût),
    //    `terms` (l'objet QUI CONTIENT le coût) ;
    //  · l'argent du mois (29/08/2026) — le préparé, le facturé, l'encaissé et
    //    le total immobilisé de « prêt à facturer » ;
    //  · les frais (30/08/2026) — leur somme et la marge nette qui en tient
    //    compte ;
    //  · les factures fournisseur (30/08/2026) — leur somme ;
    //  · la cession de créance (31/08/2026) — le montant cédé, la commission
    //    retenue, et le réglé/écart/net-attendu de sa réconciliation.
    //
    // ⚠️ L'objet porte les DIX-NEUF exprès. Le test boucle sur la liste du
    // contrat : n'en fournir qu'une partie le rendrait vert sur `undefined`,
    // c'est-à-dire vert sur les champs qu'il ne teste pas — la garde borgne
    // du dépôt.
    const redacted = redactFinance(
      {
        margin: { amountCents: 100, percent: 10 },
        marginPercent: 10,
        loadedDailyCostCents: 45_000,
        terms: { missionId: 'm1', loadedDailyCostCents: 45_000 },
        preparedAmountCents: 1_170_000,
        invoicedAmountCents: 840_000,
        paidAmountCents: 840_000,
        blockedAmountCents: 330_000,
        expensesTotalCents: 10_000,
        marginWithExpenses: { amountCents: 90, percent: 9 },
        supplierInvoicesTotalCents: 20_000,
        // Les trois montants du paiement SORTANT (31/08/2026). Ce cas vérifie
        // que TOUT `REDACTED_FINANCE_FIELDS` est vidé : la charge utile doit
        // donc porter chaque champ déclaré, sinon le test passerait au vert en
        // n'ayant simplement rien eu à vider.
        payableAmountCents: 620_000,
        settledAmountCents: 400_000,
        totalAmountCents: 1_020_000,
        // Le comportement de paiement d'un client (01/09/2026) : un OBJET, et
        // pas un montant. Il est ici pour la même raison que les trois
        // au-dessus — un champ déclaré et absent de cette charge utile ferait
        // passer le test au vert sans rien avoir eu à vider.
        paymentBehaviour: {
          measurability: { measurable: true, observed: 11, required: 5, missing: 0 },
          invoiceCount: 11,
          lateCount: 3,
          disputedCount: 0,
          withoutDueDate: 1,
          windowMonths: 12,
        },
        // Les deux montants du CA non adressé (01/09/2026) — même raison :
        // sans eux dans la charge utile, la boucle ci-dessous n'aurait rien à
        // vider sur ces deux champs et resterait verte pour de mauvaises raisons.
        unaddressedRevenueCents: 4_100_000,
        cumulativeDayRateCents: 186_000,
        // Les cinq chiffres de la CESSION (31/08/2026) — même raison exacte
        // que les trois juste au-dessus : sans eux ici, le test passerait au
        // vert en n'ayant rien eu à vider sur ces champs-là. `expectedNetCents`
        // a rejoint les quatre premiers après coup : c'était la fuite que le
        // test de service de `factoring` a débusquée.
        assignedAmountCents: 1_000_000,
        commissionAmountCents: 25_000,
        settledCents: 975_000,
        varianceCents: -15_000,
        expectedNetCents: 975_000,
        // #2420 — le calcul du moteur de marge : un OBJET qui porte les coûts.
        marginEngine: { costsUsed: [{ key: 'loaded_daily_cost', amountCents: 60_000, level: 'commercial' }] },
        // #2124.26 — le revenu historique (23/09/2026) : même raison exacte
        // que les champs au-dessus, sans lui la boucle resterait verte pour
        // de mauvaises raisons sur ce champ-là.
        historicalInvoicedRevenueCents: 5_400_000,
      },
      false,
    )
    for (const field of REDACTED_FINANCE_FIELDS) {
      expect(redacted[field], field).toBeNull()
      // Jamais `0` : un zéro se lit comme un montant réel.
      expect(redacted[field], field).not.toBe(0)
      // Et la CLÉ reste présente (D45).
      expect(field in redacted, field).toBe(true)
    }
  })

  it('le prix de VENTE unitaire n’est PAS rédigé — trois fausses alertes sur ce point', () => {
    // Le TJM facturé et le TJM cible d'un besoin sortent SANS `finance:read` :
    // le board les rend inconditionnellement, les totaux de colonne du kanban
    // des besoins se calculent dessus. Les rédiger masquerait un chiffre que le
    // produit montre exprès — inventer une règle au lieu d'en protéger une.
    const kept = redactFinance(
      { dailyRateCents: 65_000, target_tjm_cents: 60_000, marginPercent: 32 } as never,
      false,
    ) as unknown as Record<string, unknown>
    expect(kept['dailyRateCents']).toBe(65_000)
    expect(kept['target_tjm_cents']).toBe(60_000)
    // …pendant que la marge, elle, est bien vidée.
    expect(kept['marginPercent']).toBeNull()
  })

  it('n’INVENTE pas un champ que la réponse ne portait pas', () => {
    // « Présent mais vide » vaut pour ce qui existe. Ajouter `margin: null` à
    // une réponse qui n'a jamais eu de marge annoncerait une case qui n'existe
    // pas — l'inverse exact de ce que la règle cherche.
    const redacted = redactFinance({ id: 'm1' }, false)
    expect('margin' in redacted).toBe(false)
    expect('marginPercent' in redacted).toBe(false)
  })

  it('laisse tout passer avec le droit — le même objet, sans copie', () => {
    const row = { id: 'm1', margin: { amountCents: 100, percent: 10 } }
    const kept = redactFinance(row, true)
    expect(kept).toBe(row)
    expect(kept.margin).toEqual({ amountCents: 100, percent: 10 })
  })

  it('ne touche PAS au prix de vente — il est visible par design', () => {
    // Deux fausses alertes ont déjà été levées là-dessus : le TJM FACTURÉ sort
    // sans `finance:read` (le board le rend inconditionnellement), c'est le
    // COÛT et la MARGE qui se gardent. Le mettre dans la liste rédigée
    // masquerait un chiffre que le produit montre exprès.
    expect(REDACTED_FINANCE_FIELDS).not.toContain('dailyRateCents')
    const kept = redactFinance({ dailyRateCents: 60_000, margin: null }, false)
    expect(kept.dailyRateCents).toBe(60_000)
  })
})

describe('upsertCommercialTermsSchema', () => {
  it('n’invente aucun coût — absent vaut null', () => {
    const parsed = upsertCommercialTermsSchema.parse({})
    expect(parsed.loadedDailyCostCents).toBeNull()
    expect(parsed.noticeDays).toBeNull()
  })

  it('refuse un champ inconnu', () => {
    expect(() => upsertCommercialTermsSchema.parse({ marginPercent: 30 })).toThrow()
  })
})

/**
 * Deux colonnes LUES et jamais ÉCRITES — le défaut de la vague B2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT CASSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `requires_po` existe en base (`NOT NULL DEFAULT false`) depuis la migration
 * « prêt à facturer », et `assessInvoiceReadiness` la lit pour pousser le
 * bloqueur `missing_po`. Aucun chemin d'écriture ne la posait : la colonne
 * valait donc `false` sur TOUTES les lignes de TOUS les espaces, et le bloqueur
 * « bon de commande exigé et absent » ne pouvait se déclencher nulle part.
 *
 * `partner_commission_daily_cents` a exactement la même histoire :
 * {@link trueDailyCostCents} la lit, `marginByChannel` en dépend, et rien ne
 * l'écrivait — la marge des canaux `partner` et `subcontracting` était donc
 * structurellement `null`, c'est-à-dire muette sur les deux canaux que
 * l'indicateur existe pour comparer.
 *
 * C'est le motif « colonne lue, jamais écrite » : le repli honnête (`false`,
 * `null`) ressemble à une base vide, et personne ne voit la panne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CES DEUX CHAMPS-LÀ SONT « ABSENT = INCHANGÉ »
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six champs d'origine sont en REMPLACEMENT : absent vaut `null`, et le
 * client RECOPIE ceux qu'il ne modifie pas — la fiche mission le fait déjà,
 * avec un commentaire qui dit pourquoi (« enregistrer un coût ne doit pas
 * remettre le chemin de la mission à non renseigné »).
 *
 * Un champ AJOUTÉ ne peut pas hériter de cette règle : aucun client écrit avant
 * lui ne sait le recopier, donc chaque enregistrement de coût l'effacerait en
 * silence. C'est le défaut « `raw_analysis` remplacé, pas fusionné » — un
 * « Actualiser » qui détruit ce qu'un humain a saisi.
 *
 * `undefined` = « je ne parle pas de ce champ » ; une valeur explicite, `null`
 * compris pour la commission, est une décision et s'écrit.
 */
describe('upsertCommercialTermsSchema — les deux champs jamais écrits', () => {
  it('ACCEPTE le bon de commande exigé — sans quoi le bloqueur n’existe pas', () => {
    expect(upsertCommercialTermsSchema.parse({ requiresPo: true }).requiresPo).toBe(true)
    expect(upsertCommercialTermsSchema.parse({ requiresPo: false }).requiresPo).toBe(false)
  })

  it('ACCEPTE la commission d’intermédiaire, en centimes', () => {
    expect(upsertCommercialTermsSchema.parse({ partnerCommissionDailyCents: 5_000 }).partnerCommissionDailyCents).toBe(
      5_000,
    )
  })

  it('ZÉRO est une réponse — un partenaire qui ne prend rien, ça existe', () => {
    expect(upsertCommercialTermsSchema.parse({ partnerCommissionDailyCents: 0 }).partnerCommissionDailyCents).toBe(0)
  })

  it('`null` EFFACE la commission — « on ne sait plus » se saisit', () => {
    // Et il se distingue de l'absence : `null` est une décision, `undefined`
    // est un silence.
    expect(upsertCommercialTermsSchema.parse({ partnerCommissionDailyCents: null }).partnerCommissionDailyCents).toBe(
      null,
    )
  })

  it('ABSENT n’est pas `null` — un client d’avant le champ ne l’efface pas', () => {
    const parsed = upsertCommercialTermsSchema.parse({})
    expect(parsed.requiresPo).toBeUndefined()
    expect(parsed.partnerCommissionDailyCents).toBeUndefined()
    // Et la clé n'est pas inventée : « je ne parle pas de ce champ » ne doit pas
    // se lire comme « mets-le à sa valeur par défaut ».
    expect('requiresPo' in parsed).toBe(false)
    expect('partnerCommissionDailyCents' in parsed).toBe(false)
  })

  it('refuse une commission NÉGATIVE — un intermédiaire ne rembourse pas', () => {
    expect(() => upsertCommercialTermsSchema.parse({ partnerCommissionDailyCents: -1 })).toThrow()
  })

  it('refuse une commission non entière — les centimes ne se divisent pas', () => {
    expect(() => upsertCommercialTermsSchema.parse({ partnerCommissionDailyCents: 12.5 })).toThrow()
  })

  it('ABSENT = INCHANGÉ pour les trois termes du bon de commande, comme la commission', () => {
    const parsed = upsertCommercialTermsSchema.parse({})
    expect(parsed.poIssuedOn).toBeUndefined()
    expect(parsed.poAmountCents).toBeUndefined()
    expect(parsed.poVolumeDays).toBeUndefined()
    expect('poIssuedOn' in parsed).toBe(false)
    expect('poAmountCents' in parsed).toBe(false)
    expect('poVolumeDays' in parsed).toBe(false)
  })

  it('`null` EFFACE chacun des trois termes du bon de commande', () => {
    const parsed = upsertCommercialTermsSchema.parse({
      poIssuedOn: null,
      poAmountCents: null,
      poVolumeDays: null,
    })
    expect(parsed.poIssuedOn).toBeNull()
    expect(parsed.poAmountCents).toBeNull()
    expect(parsed.poVolumeDays).toBeNull()
  })

  it('accepte une saisie complète du bon de commande, jours décimaux compris', () => {
    const parsed = upsertCommercialTermsSchema.parse({
      poIssuedOn: '2026-03-01',
      poAmountCents: 2_800_000,
      poVolumeDays: 49.5,
    })
    expect(parsed.poIssuedOn).toBe('2026-03-01')
    expect(parsed.poAmountCents).toBe(2_800_000)
    expect(parsed.poVolumeDays).toBe(49.5)
  })

  it('refuse une date de bon de commande au mauvais format', () => {
    expect(() => upsertCommercialTermsSchema.parse({ poIssuedOn: '01/03/2026' })).toThrow()
  })

  it('refuse un montant ou un volume négatif', () => {
    expect(() => upsertCommercialTermsSchema.parse({ poAmountCents: -1 })).toThrow()
    expect(() => upsertCommercialTermsSchema.parse({ poVolumeDays: -1 })).toThrow()
  })

  // #2566.2 — `poValidUntil` rejoint le même régime de FUSION que les trois
  // termes juste au-dessus, pour la même raison exacte : il naît après eux, et
  // un `PUT` écrit avant lui ne sait pas le recopier.
  it('ABSENT = INCHANGÉ pour `poValidUntil`, comme les trois autres termes', () => {
    const parsed = upsertCommercialTermsSchema.parse({})
    expect(parsed.poValidUntil).toBeUndefined()
    expect('poValidUntil' in parsed).toBe(false)
  })

  it('`null` EFFACE `poValidUntil`', () => {
    expect(upsertCommercialTermsSchema.parse({ poValidUntil: null }).poValidUntil).toBeNull()
  })

  it('accepte une date de validité de bon de commande', () => {
    expect(upsertCommercialTermsSchema.parse({ poValidUntil: '2026-09-30' }).poValidUntil).toBe('2026-09-30')
  })

  it('refuse une date de validité au mauvais format', () => {
    expect(() => upsertCommercialTermsSchema.parse({ poValidUntil: '30/09/2026' })).toThrow()
  })
})

describe('missionCommercialTermsSchema — ce que la fiche RELIT', () => {
  it('rend les deux champs, avec leurs défauts d’avant le déploiement', () => {
    // Une ligne écrite avant le champ n'a ni l'un ni l'autre : `false` est la
    // valeur de la colonne (`NOT NULL DEFAULT false`), `null` est l'absence de
    // commission — jamais 0, qui se lirait « le partenaire ne prend rien ».
    const parsed = missionCommercialTermsSchema.parse({
      missionId: '11111111-1111-4111-8111-111111111111',
      loadedDailyCostCents: 45_500,
      poNumber: null,
      poIssuedOn: null,
      poAmountCents: null,
      poVolumeDays: null,
      poConsumedDays: null,
      poConsumption: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
      updatedAt: '2026-08-29T10:00:00.000Z',
    })
    expect(parsed.requiresPo).toBe(false)
    expect(parsed.partnerCommissionDailyCents).toBeNull()
    expect(parsed.poIssuedOn).toBeNull()
    expect(parsed.poAmountCents).toBeNull()
    expect(parsed.poVolumeDays).toBeNull()
    expect(parsed.poConsumedDays).toBeNull()
    expect(parsed.poConsumption).toBeNull()
  })

  it('relit ce qui a été saisi', () => {
    const parsed = missionCommercialTermsSchema.parse({
      missionId: '11111111-1111-4111-8111-111111111111',
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      requiresPo: true,
      poNumber: 'PO-2026-0418',
      poIssuedOn: '2026-03-01',
      poAmountCents: 2_800_000,
      poVolumeDays: 50,
      poConsumedDays: 28,
      poConsumption: { percent: 56, remainingDays: 22 },
      billingCadence: null,
      partnerCommissionDailyCents: 6_000,
      noticeDays: null,
      notes: null,
      updatedAt: '2026-08-29T10:00:00.000Z',
    })
    expect(parsed.requiresPo).toBe(true)
    expect(parsed.partnerCommissionDailyCents).toBe(6_000)
    expect(parsed.poIssuedOn).toBe('2026-03-01')
    expect(parsed.poAmountCents).toBe(2_800_000)
    expect(parsed.poVolumeDays).toBe(50)
    expect(parsed.poConsumedDays).toBe(28)
    expect(parsed.poConsumption).toEqual({ percent: 56, remainingDays: 22 })
  })

  // #2566.2 — `poValidUntil` relit comme les autres termes du bon de commande.
  it('relit `poValidUntil`', () => {
    const parsed = missionCommercialTermsSchema.parse({
      missionId: '11111111-1111-4111-8111-111111111111',
      loadedDailyCostCents: 45_500,
      requiresPo: true,
      poNumber: 'PO-2026-0418',
      poValidUntil: '2026-09-30',
      billingCadence: null,
      noticeDays: null,
      notes: null,
      updatedAt: '2026-08-29T10:00:00.000Z',
    })
    expect(parsed.poValidUntil).toBe('2026-09-30')
  })
})

describe('poConsumption', () => {
  it('affiche 56 % pour un bon de commande de 50 jours avec 28 consommés', () => {
    expect(poConsumption(50, 28)).toEqual({ percent: 56, remainingDays: 22 })
  })

  it('ne dit RIEN — jamais 0 % — quand le volume manque', () => {
    // Un volume non renseigné ne donne pas une barre à 0 % : ce serait annoncer
    // « rien consommé » alors qu'on n'a même pas la taille du bon de commande.
    expect(poConsumption(null, 28)).toBeNull()
  })

  it('ne dit RIEN — jamais 0 % — quand la consommation n’est pas mesurable', () => {
    // Aucun relevé compté : c'est l'absence d'une mesure, pas une mesure de
    // zéro.
    expect(poConsumption(50, null)).toBeNull()
  })

  it('rend `null` quand les DEUX manquent', () => {
    expect(poConsumption(null, null)).toBeNull()
  })

  it('DIT un dépassement au lieu de se borner en silence à 100 %', () => {
    // C'est exactement l'information qui vaut quelque chose : le bon de
    // commande est en train de manquer.
    expect(poConsumption(50, 60)).toEqual({ percent: 120, remainingDays: -10 })
  })

  it('ne divise pas par un volume à zéro', () => {
    expect(poConsumption(0, 0)).toBeNull()
  })
})

/**
 * LE DÉLAI CONTRACTUEL — « À 60 jours fin de mois » (PDF-22 §7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `dueOn` (invoice-readiness.ts) porte l'ÉCHÉANCE d'une facture PRÉCISE, une
 * fois qu'elle existe. Il ne portait pas le DÉLAI contractuel qui la produit —
 * la condition qu'on négocie AVANT toute facture, et qui reste vraie mission
 * après mission. Les deux champs FUSIONNENT, exactement comme les trois termes
 * du bon de commande : `undefined` = « je ne parle pas de ce champ », un
 * `PUT` écrit avant eux (la fiche mission) ne sait pas les recopier.
 */
describe('upsertCommercialTermsSchema — les conditions de règlement', () => {
  it('ABSENT = INCHANGÉ, comme les autres champs FUSIONNÉS', () => {
    const parsed = upsertCommercialTermsSchema.parse({})
    expect(parsed.paymentTermsDays).toBeUndefined()
    expect(parsed.paymentTermsBasis).toBeUndefined()
    expect('paymentTermsDays' in parsed).toBe(false)
    expect('paymentTermsBasis' in parsed).toBe(false)
  })

  it('`null` EFFACE le délai — « on ne sait plus » se saisit', () => {
    const parsed = upsertCommercialTermsSchema.parse({ paymentTermsDays: null, paymentTermsBasis: null })
    expect(parsed.paymentTermsDays).toBeNull()
    expect(parsed.paymentTermsBasis).toBeNull()
  })

  it('accepte « 60 jours fin de mois »', () => {
    const parsed = upsertCommercialTermsSchema.parse({ paymentTermsDays: 60, paymentTermsBasis: 'end_of_month' })
    expect(parsed.paymentTermsDays).toBe(60)
    expect(parsed.paymentTermsBasis).toBe('end_of_month')
  })

  it('refuse un délai négatif — un délai de règlement ne se compte pas en arrière', () => {
    expect(() => upsertCommercialTermsSchema.parse({ paymentTermsDays: -1 })).toThrow()
  })

  it('refuse une base hors énumération', () => {
    expect(() => upsertCommercialTermsSchema.parse({ paymentTermsBasis: 'net' })).toThrow()
  })

  it('les deux bases connues restent lisibles', () => {
    expect(PAYMENT_TERMS_BASES).toEqual(['invoice_date', 'end_of_month'])
    for (const basis of PAYMENT_TERMS_BASES) {
      expect(paymentTermsBasisSchema.parse(basis)).toBe(basis)
    }
  })
})

describe('missionCommercialTermsSchema — relit le délai de règlement', () => {
  it('une ligne d’avant le champ ne porte ni l’un ni l’autre', () => {
    const parsed = missionCommercialTermsSchema.parse({
      missionId: '11111111-1111-4111-8111-111111111111',
      loadedDailyCostCents: null,
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
      paymentTermsDays: null,
      paymentTermsBasis: null,
      updatedAt: '2026-08-29T10:00:00.000Z',
    })
    expect(parsed.paymentTermsDays).toBeNull()
    expect(parsed.paymentTermsBasis).toBeNull()
  })

  it('relit ce qui a été saisi', () => {
    const parsed = missionCommercialTermsSchema.parse({
      missionId: '11111111-1111-4111-8111-111111111111',
      loadedDailyCostCents: null,
      poNumber: null,
      billingCadence: 'monthly',
      noticeDays: null,
      notes: null,
      paymentTermsDays: 60,
      paymentTermsBasis: 'end_of_month',
      updatedAt: '2026-08-29T10:00:00.000Z',
    })
    expect(parsed.paymentTermsDays).toBe(60)
    expect(parsed.paymentTermsBasis).toBe('end_of_month')
  })
})

describe('#2420 — les conditions commerciales portent la source du coût et la devise', () => {
  it('les quatre champs du moteur de marge sont en FUSION : absents, ils restent absents', () => {
    const parsed = upsertCommercialTermsSchema.parse({})
    expect(parsed.costSource).toBeUndefined()
    expect(parsed.currency).toBeUndefined()
    expect(parsed.costCurrency).toBeUndefined()
    expect(parsed.costBreakdown).toBeUndefined()
  })

  it('accepte une source, une devise ISO et une décomposition ; refuse une devise mal formée ou un salaire', () => {
    const parsed = upsertCommercialTermsSchema.parse({
      costSource: 'freelance',
      currency: 'CHF',
      costCurrency: null,
      costBreakdown: { supplierDailyRateCents: 55_000 },
    })
    expect(parsed.costSource).toBe('freelance')
    expect(parsed.currency).toBe('CHF')
    expect(parsed.costBreakdown).toEqual({ supplierDailyRateCents: 55_000 })
    expect(() => upsertCommercialTermsSchema.parse({ currency: 'euro' })).toThrow()
    expect(() => upsertCommercialTermsSchema.parse({ costSource: 'salary' })).toThrow()
    expect(() => upsertCommercialTermsSchema.parse({ costBreakdown: { salaryCents: 1 } })).toThrow()
  })

  it('une réponse d’avant le moteur se lit encore', () => {
    const parsed = missionCommercialTermsSchema.parse({
      missionId: '00000000-0000-4000-8000-000000000001',
      loadedDailyCostCents: null,
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
      updatedAt: '2026-09-17T00:00:00.000Z',
    })
    expect(parsed.costSource).toBeUndefined()
  })

  it('le calcul du moteur est rédigé comme les autres montants (D45)', () => {
    expect(REDACTED_FINANCE_FIELDS).toContain('marginEngine')
  })
})
