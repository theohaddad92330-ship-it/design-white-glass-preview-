import { describe, expect, it } from 'vitest'
import {
  ACTIONABLE_RENEWAL_WINDOWS,
  CLOSED_RENEWAL_STATUSES,
  MISSION_RISK_SEVERITIES,
  RENEWAL_STATUSES,
  RENEWAL_WINDOWS,
  canRequestRenewalFeedback,
  createMissionRequestSchema,
  isRenewalDecided,
  missionAvailabilityCertainty,
  dailyMarginPercent,
  daysUntilEnd,
  missionRiskSeverity,
  missionRisks,
  renewalWindow,
  updateMissionRequestSchema,
  type Mission,
  type MissionRisk,
  type Timesheet,
} from './mission.js'
import { missionMargin } from './staffing.js'

/**
 * Delivery OS — les fenêtres de renouvellement et le radar de risque
 * (addendum final p71-72).
 *
 * Ce que le module apporte, et que ni le CRM ni l'ERP ne font : les signaux de
 * fin de mission arrivent AVANT la fin, et ils arrivent au commercial. Les tests
 * portent donc sur les deux calculs qui déclenchent tout — et sur les deux
 * refus : ne jamais supposer une date de fin, ne jamais supposer une marge.
 */

const TODAY = new Date('2026-09-01T12:00:00Z')
const inDays = (days: number) => new Date(TODAY.getTime() + days * 86_400_000).toISOString().slice(0, 10)

function mission(over: Partial<Mission> = {}): Mission {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'TMA socle data',
    status: 'active',
    started_on: '2026-01-01',
    ends_on: null,
    daily_rate: null,
    daily_cost: null,
    created_at: TODAY.toISOString(),
    updated_at: TODAY.toISOString(),
    ...over,
  }
}

describe('fenêtres de renouvellement', () => {
  it('place chaque mission dans son jalon', () => {
    // #2195.2 à #2195.7 — SIX fenêtres nommées par l'issue, et l'échelle en
    // porte sept : J-60, J-45, J-30, J-15, « imminente », « échue », « sans
    // date ». ⚠️ `imminent` (≤ 10 jours) SURVIT à l'arrivée de J-15 : elle
    // sépare une population que le produit distinguait déjà, et la fondre dans
    // J-15 aurait perdu l'urgence la plus courte au moment où on l'ajoute.
    expect(renewalWindow(inDays(90), TODAY)).toBe('far')
    expect(renewalWindow(inDays(55), TODAY)).toBe('j60')
    expect(renewalWindow(inDays(45), TODAY)).toBe('j45')
    expect(renewalWindow(inDays(20), TODAY)).toBe('j30')
    expect(renewalWindow(inDays(14), TODAY)).toBe('j15')
    expect(renewalWindow(inDays(5), TODAY)).toBe('imminent')
    expect(renewalWindow(inDays(-3), TODAY)).toBe('overdue')
  })

  it('les bornes sont INCLUSIVES, et chaque fenêtre en exclut la suivante', () => {
    // #2195.3, #2195.5 — un seuil qui glisse d'un jour fait rater une relance
    // pile le jour où elle comptait. Les quatre bornes sont vérifiées des deux
    // côtés : ce sont elles qui rendent les populations DISJOINTES.
    expect(renewalWindow(inDays(60), TODAY)).toBe('j60')
    expect(renewalWindow(inDays(61), TODAY)).toBe('far')
    expect(renewalWindow(inDays(46), TODAY)).toBe('j60')
    expect(renewalWindow(inDays(31), TODAY)).toBe('j45')
    expect(renewalWindow(inDays(30), TODAY)).toBe('j30')
    expect(renewalWindow(inDays(16), TODAY)).toBe('j30')
    expect(renewalWindow(inDays(15), TODAY)).toBe('j15')
    expect(renewalWindow(inDays(11), TODAY)).toBe('j15')
    expect(renewalWindow(inDays(10), TODAY)).toBe('imminent')
    expect(renewalWindow(inDays(0), TODAY)).toBe('imminent')
  })

  it('n’INSÈRE aucune valeur au milieu de l’énumération (GA-08)', () => {
    // Les six valeurs d'avant le 16/09/2026, dans leur ordre d'origine. Les
    // deux neuves s'ajoutent EN FIN : une insertion au milieu décale tout ce
    // qui sérialise l'énumération par son index.
    expect(RENEWAL_WINDOWS.slice(0, 6)).toEqual(['far', 'j60', 'j30', 'imminent', 'overdue', 'unknown'])
    expect(RENEWAL_WINDOWS).toContain('j45')
    expect(RENEWAL_WINDOWS).toContain('j15')
  })

  it('compte les jours restants, et rend « je ne sais pas » sans date', () => {
    // `null` et non un grand nombre : une question bornée (« quelles missions
    // finissent sous 30 jours ») doit pouvoir décider elle-même quoi faire des
    // missions sans échéance, plutôt que de les voir écartées en silence.
    expect(daysUntilEnd(inDays(30), TODAY)).toBe(30)
    expect(daysUntilEnd(inDays(-3), TODAY)).toBe(-3)
    expect(daysUntilEnd(null, TODAY)).toBeNull()
    expect(daysUntilEnd(undefined, TODAY)).toBeNull()
    expect(daysUntilEnd('pas une date', TODAY)).toBeNull()
  })

  it('ne dépend pas de l’heure de la journée', () => {
    // Une comparaison de dates qui bascule à midi produirait une alerte
    // différente le matin et l'après-midi.
    const morning = new Date('2026-09-01T06:00:00Z')
    const evening = new Date('2026-09-01T23:00:00Z')
    expect(renewalWindow(inDays(30), morning)).toBe(renewalWindow(inDays(30), evening))
  })

  it('dit « inconnu » plutôt que « loin » sans date de fin', () => {
    // La déclarer « loin » la ferait disparaître des alertes pour toujours — or
    // c'est exactement le trou que le module comble.
    expect(renewalWindow(null, TODAY)).toBe('unknown')
    expect(renewalWindow('pas une date', TODAY)).toBe('unknown')
  })

  it('les jalons actionnables excluent « loin » et « inconnu »', () => {
    expect(ACTIONABLE_RENEWAL_WINDOWS).not.toContain('far')
    expect(ACTIONABLE_RENEWAL_WINDOWS).not.toContain('unknown')
  })
})

/**
 * La marge lit le coût CHARGÉ des conditions commerciales (D43 · 28/08/2026).
 *
 * ⚠️ Le second terme est en CENTIMES et le TJM en EUROS. C'est la seule
 * subtilité de ce calcul, et elle a déjà coûté : « les additionner sans
 * convertir donnerait une marge de 99,9 % sur toutes les missions »
 * (`staffing.service.ts`). La conversion vit donc ICI, une fois, et aucun
 * appelant ne la refait.
 */
describe('marge', () => {
  it('calcule le pourcentage quand TJM et coût chargé sont connus', () => {
    expect(dailyMarginPercent({ daily_rate: 600, loadedDailyCostCents: 420_00 })).toBe(30)
  })

  it('rend null plutôt qu’une marge supposée', () => {
    // Une marge inventée fait renoncer à une mission rentable ou accepter une
    // mission à perte : elle est plus dangereuse qu'une marge absente.
    expect(dailyMarginPercent({ daily_rate: 600, loadedDailyCostCents: null })).toBeNull()
    expect(dailyMarginPercent({ daily_rate: null, loadedDailyCostCents: 420_00 })).toBeNull()
    expect(dailyMarginPercent({ daily_rate: 0, loadedDailyCostCents: 420_00 })).toBeNull()
  })

  it('rend une marge négative telle quelle', () => {
    expect(dailyMarginPercent({ daily_rate: 400, loadedDailyCostCents: 500_00 })).toBe(-25)
  })

  /**
   * LE test de la décision D43 : la fiche et la liste doivent rendre le MÊME
   * nombre pour la même mission. Elles le rendront tant qu'elles passent par le
   * même noyau — c'est ce que ce test vérifie, en comparant à `missionMargin`,
   * qui est ce que la fiche affiche.
   */
  it('rend EXACTEMENT ce que la fiche affiche — même noyau, même nombre', () => {
    expect(dailyMarginPercent({ daily_rate: 650, loadedDailyCostCents: 455_00 })).toBe(
      missionMargin({ dailyRateCents: 650_00, loadedDailyCostCents: 455_00 })?.percent,
    )
    // Une décimale, pas un entier : arrondir de son côté ferait dire « 32 % » à
    // un écran et « 31,7 % » à l'autre pour la même mission.
    expect(dailyMarginPercent({ daily_rate: 600, loadedDailyCostCents: 409_00 })).toBe(31.8)
  })

  /**
   * `missions.daily_cost` n'est plus une source (D43). Le prouver demande de
   * poser la colonne morte à une valeur qui SE VERRAIT si elle était encore
   * lue : ici elle donnerait 30 %, et le calcul doit malgré tout rendre `null`.
   */
  it('ne lit PLUS missions.daily_cost — la colonne morte ne ressuscite pas', () => {
    const withDeadColumn = { daily_rate: 600, daily_cost: 420, loadedDailyCostCents: null }
    expect(dailyMarginPercent(withDeadColumn)).toBeNull()
  })
})

describe('radar de risque', () => {
  it('signale une mission sans date de fin', () => {
    expect(missionRisks({ ...mission(), loadedDailyCostCents: null }, [], TODAY)).toContain('no_end_date')
  })

  it('signale un renouvellement non engagé dès J-60', () => {
    expect(missionRisks({ ...mission({ ends_on: inDays(45) }), loadedDailyCostCents: null }, [], TODAY)).toContain(
      'renewal_not_started',
    )
  })

  it('ne signale rien de tel quand la fin est loin', () => {
    const risks = missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null }, [], TODAY)
    expect(risks).not.toContain('renewal_not_started')
    expect(risks).not.toContain('no_end_date')
  })

  it('signale une marge non calculable — ne pas savoir EST un risque', () => {
    expect(missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null }, [], TODAY)).toContain(
      'margin_unknown',
    )
  })

  it('signale une marge nulle ou négative', () => {
    const risks = missionRisks(
      { ...mission({ ends_on: inDays(120), daily_rate: 400 }), loadedDailyCostCents: 400_00 },
      [],
      TODAY,
    )
    expect(risks).toContain('margin_at_risk')
  })

  it('signale un relevé contesté', () => {
    const timesheets: Pick<Timesheet, 'status' | 'period_month'>[] = [
      { status: 'disputed', period_month: '2026-08-01' },
    ]
    expect(
      missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null }, timesheets, TODAY),
    ).toContain('timesheet_disputed')
  })

  /**
   * #2408.11 — `timesheet_missing` existait déjà dans l'énumération (relevé
   * manquant sur un mois passé) mais n'était jamais PRODUIT ici : la table
   * `/missions` ne pouvait donc jamais le distinguer d'un relevé contesté.
   */
  it('signale un relevé manquant — distinct d’un relevé contesté', () => {
    const timesheets: Pick<Timesheet, 'status' | 'period_month'>[] = [{ status: 'missing', period_month: '2026-08-01' }]
    const risks = missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null }, timesheets, TODAY)
    expect(risks).toContain('timesheet_missing')
    expect(risks).not.toContain('timesheet_disputed')
  })

  /**
   * #2408.18 — un bon de commande EXIGÉ mais jamais renseigné bloquera la
   * facturation en aval (`missing_po` côté lens readiness, `invoice-
   * readiness.ts`) ; la table `/missions` ne le disait pas avant qu'une
   * facture ne coince. `requiresPo`/`poNumber` sont optionnels : un appelant
   * qui ne les passe pas (aucun droit financier lu) ne voit jamais surgir ce
   * risque plutôt que d'en inventer un.
   */
  it('signale un bon de commande exigé mais absent', () => {
    const risks = missionRisks({
      ...mission({ ends_on: inDays(120) }),
      loadedDailyCostCents: null,
      requiresPo: true,
      poNumber: null,
    })
    expect(risks).toContain('missing_po')
  })

  it('se tait sur le bon de commande quand il n’est pas exigé, ou déjà renseigné', () => {
    expect(
      missionRisks({
        ...mission({ ends_on: inDays(120) }),
        loadedDailyCostCents: null,
        requiresPo: false,
        poNumber: null,
      }),
    ).not.toContain('missing_po')
    expect(
      missionRisks({
        ...mission({ ends_on: inDays(120) }),
        loadedDailyCostCents: null,
        requiresPo: true,
        poNumber: 'PO-2026-042',
      }),
    ).not.toContain('missing_po')
    // Absent des deux champs (appelant qui n'a pas lu le droit financier) :
    // jamais affirmé, jamais un badge inventé sur un silence.
    expect(missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null })).not.toContain(
      'missing_po',
    )
  })

  /**
   * #2408.8 — « fin proche » est un badge DÉDIÉ, distinct de « renouvellement
   * non engagé » : le premier dit QUAND la mission finit, le second SI
   * quelqu'un a bougé. Avant ce badge, une mission à 5 jours et une mission à
   * 55 jours portaient la MÊME étiquette dans la colonne Risques — seul le tri
   * les distinguait (#2408.8 du registre).
   */
  it('signale une échéance imminente, EN PLUS du renouvellement non engagé', () => {
    const risks = missionRisks({ ...mission({ ends_on: inDays(5) }), loadedDailyCostCents: null }, [], TODAY)
    expect(risks).toContain('ending_soon')
    expect(risks).toContain('renewal_not_started')
  })

  it('signale une échéance dépassée comme « fin proche » aussi', () => {
    const risks = missionRisks({ ...mission({ ends_on: inDays(-3) }), loadedDailyCostCents: null }, [], TODAY)
    expect(risks).toContain('ending_soon')
  })

  it('ne signale PAS « fin proche » quand l’échéance est encore loin (J-45)', () => {
    const risks = missionRisks({ ...mission({ ends_on: inDays(45) }), loadedDailyCostCents: null }, [], TODAY)
    expect(risks).not.toContain('ending_soon')
  })

  it('se tait sur une mission terminée — un risque clos n’est pas un risque', () => {
    expect(missionRisks({ ...mission({ status: 'ended' }), loadedDailyCostCents: null }, [], TODAY)).toEqual([])
    expect(missionRisks({ ...mission({ status: 'terminated' }), loadedDailyCostCents: null }, [], TODAY)).toEqual([])
  })

  it('classe la poursuite de la mission avant sa rentabilité', () => {
    // L'ordre est celui de l'urgence commerciale : perdre la mission coûte plus
    // que la faire à marge réduite.
    const risks = missionRisks(
      { ...mission({ ends_on: inDays(20), daily_rate: 400 }), loadedDailyCostCents: 500_00 },
      [],
      TODAY,
    )
    expect(risks.indexOf('renewal_not_started')).toBeLessThan(risks.indexOf('margin_at_risk'))
  })

  /**
   * #2411.7 (épopée #2881) — `owner_id` existe déjà (#2836) ; seul le calcul
   * du risque manquait. `null` MESURÉ (chargé d'affaires non désigné)
   * déclenche le badge ; `undefined` (appelant qui ne lit pas la donnée,
   * comme `create`/`updateStatus`) reste muet — même garde que `requiresPo`.
   */
  it('signale une mission sans chargé d’affaires désigné', () => {
    const risks = missionRisks({
      ...mission({ ends_on: inDays(120) }),
      loadedDailyCostCents: null,
      owner_id: null,
    })
    expect(risks).toContain('missing_owner')
  })

  it('se tait sur le porteur quand il est désigné, ou simplement pas lu par l’appelant', () => {
    expect(
      missionRisks({
        ...mission({ ends_on: inDays(120) }),
        loadedDailyCostCents: null,
        owner_id: '44444444-4444-4444-8444-444444444444',
      }),
    ).not.toContain('missing_owner')
    // `undefined` : l'appelant ne lit pas `owner_id` — jamais un badge inventé
    // sur un silence.
    expect(missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null })).not.toContain(
      'missing_owner',
    )
  })

  /**
   * #2411.6 (reste, épopée #2881) — le premier des deux signaux de
   * facturation ramenés du portefeuille à la mission (CRA et marge l'étaient
   * déjà). `true` MESURÉ (mois courant bloqué, `invoice_readiness.state`)
   * déclenche le badge ; `false` mesuré ou `undefined` (droit financier
   * absent, ou appelant qui ne charge pas la donnée) restent muets — même
   * garde que `missing_po`/`missing_owner`.
   */
  it('signale une facturation bloquée le mois courant', () => {
    const risks = missionRisks({
      ...mission({ ends_on: inDays(120) }),
      loadedDailyCostCents: null,
      invoiceBlocked: true,
    })
    expect(risks).toContain('invoice_blocked')
  })

  it('se tait sur la facturation quand elle n’est pas bloquée, ou simplement pas lue par l’appelant', () => {
    expect(
      missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null, invoiceBlocked: false }),
    ).not.toContain('invoice_blocked')
    // `undefined` : l'appelant ne lit pas la donnée (pas de `finance:read`, ou
    // décoration d'une mission qu'il vient d'écrire) — jamais un badge inventé.
    expect(missionRisks({ ...mission({ ends_on: inDays(120) }), loadedDailyCostCents: null })).not.toContain(
      'invoice_blocked',
    )
  })
})

/**
 * LA SÉVÉRITÉ D'UNE PROCHAINE ÉTAPE — panneau de planification (PDF-22 §7) et
 * échelle à SIX niveaux de #2411.8 (épopée #2881). « La prochaine action
 * existe sur sept écrans et aucune ne porte de niveau d'impact » : ce calcul
 * RÉUTILISE l'ordre de {@link missionRisks} — déjà celui de l'urgence
 * commerciale — plutôt que d'inventer une seconde priorisation qui diverge de
 * la première un jour (GA-26).
 */
describe('missionRiskSeverity (#2411.8, épopée #2881)', () => {
  it('rend `null` sans aucun risque — pas de prochaine étape à suggérer', () => {
    expect(missionRiskSeverity([])).toBeNull()
  })

  it('ne regarde que le PREMIER risque — celui que missionRisks juge le plus urgent', () => {
    // Même si le second risque de la liste porte une sévérité plus élevée
    // dans la table, c'est le premier — le plus urgent selon missionRisks —
    // qui décide.
    expect(missionRiskSeverity(['no_end_date', 'margin_at_risk'])).toBe('watch')
  })

  it('un relevé contesté est CRITIQUE', () => {
    expect(missionRiskSeverity(['timesheet_disputed'])).toBe('critical')
  })

  // #2411.7 — même famille que `margin_unknown` : une donnée manquante, pas
  // un fait métier avéré.
  it('l’absence de chargé d’affaires est NON MESURÉE, pas critique', () => {
    expect(missionRiskSeverity(['missing_owner'])).toBe('unknown')
  })

  it('une marge à risque est CRITIQUE', () => {
    expect(missionRiskSeverity(['margin_at_risk'])).toBe('critical')
  })

  it('un renouvellement non engagé est EN RISQUE', () => {
    expect(missionRiskSeverity(['renewal_not_started'])).toBe('at_risk')
  })

  // #2411.6 — même famille que `timesheet_disputed` : un fait DÉJÀ AVÉRÉ,
  // transposé sur l'échelle à 6 niveaux de #2411.8.
  it('une facturation bloquée est CRITIQUE', () => {
    expect(missionRiskSeverity(['invoice_blocked'])).toBe('critical')
  })

  it('une marge non calculable est NON MESURÉE — on ne sait pas, ce n’est pas grave en soi', () => {
    expect(missionRiskSeverity(['margin_unknown'])).toBe('unknown')
  })

  it('#2408.8 — une échéance imminente ou dépassée est CRITIQUE', () => {
    expect(missionRiskSeverity(['ending_soon'])).toBe('critical')
  })

  it('#2408.18 — un bon de commande manquant est EN RISQUE, avant que ça bloque la facturation', () => {
    expect(missionRiskSeverity(['missing_po'])).toBe('at_risk')
  })

  it('une échéance sans date de fin est SOUS SURVEILLANCE — rien à faire aujourd’hui, mais rien à anticiper non plus', () => {
    expect(missionRiskSeverity(['no_end_date'])).toBe('watch')
  })

  it('couvre les DIX risques — aucun ne tombe dans un trou de la table (#2411.6 ajoute invoice_blocked)', () => {
    const risks: MissionRisk[] = [
      'renewal_not_started',
      'timesheet_disputed',
      'timesheet_missing',
      'margin_at_risk',
      'margin_unknown',
      'no_end_date',
      'missing_po',
      'ending_soon',
      'missing_owner',
      'invoice_blocked',
    ]
    for (const risk of risks) {
      expect(MISSION_RISK_SEVERITIES).toContain(missionRiskSeverity([risk]))
    }
  })

  it('l’échelle porte les SIX niveaux exacts de #2411.8, dans l’ordre du texte source', () => {
    expect(MISSION_RISK_SEVERITIES).toEqual(['information', 'watch', 'at_risk', 'critical', 'resolved', 'unknown'])
  })
})

describe('#2195.22 à .29 — le statut de renouvellement nomme un FAIT, jamais une chance', () => {
  it('porte les HUIT statuts, dans l’ordre gelé de la décision du 16/09/2026', () => {
    // GA-08 : un enum ne perd jamais de valeur et n’en insère jamais au milieu.
    // Cette liste est recopiée VERBATIM dans la contrainte SQL
    // `missions_renewal_status_check` (migration 1795100000001) ; GA-12 vérifie
    // que les deux ne divergent pas.
    expect([...RENEWAL_STATUSES]).toEqual([
      'non_engage',
      'feedback_demande',
      'discussion_en_cours',
      'reconduction_annoncee',
      'renouvele',
      'fin_confirmee',
      'repositionnement_lance',
      'bloque',
    ])
  })

  it('#2195.25 — AUCUN statut ne nomme une probabilité, ni un pronostic déguisé', () => {
    // La doctrine refuse toute probabilité affichée (`c26_probabilite`, refusée
    // six fois). Le piège n’est pas le calcul — un statut est saisi — c’est le
    // LIBELLÉ, qui se lit hors contexte sur une ligne de tableau.
    const pronostics = ['probable', 'chance', 'incertain', 'peut_etre', 'possible', 'risque_de', 'prevision']
    for (const status of RENEWAL_STATUSES) {
      for (const mot of pronostics) {
        expect(status).not.toContain(mot)
      }
    }
  })

  it('le palier « probable » survit sous le FAIT qui le fonde', () => {
    // La valeur existe, elle ne s’appelle simplement plus par la chance.
    expect(RENEWAL_STATUSES).toContain('reconduction_annoncee')
  })

  it('#2195.37 — seuls les trois statuts qui FERMENT la question sont clos', () => {
    expect([...CLOSED_RENEWAL_STATUSES]).toEqual(['renouvele', 'fin_confirmee', 'repositionnement_lance'])
    expect(isRenewalDecided('renouvele')).toBe(true)
    expect(isRenewalDecided('fin_confirmee')).toBe(true)
    expect(isRenewalDecided('repositionnement_lance')).toBe(true)
  })

  it('#2195.37 — une discussion en cours n’est PAS une décision, et `null` non plus', () => {
    expect(isRenewalDecided('discussion_en_cours')).toBe(false)
    expect(isRenewalDecided('bloque')).toBe(false)
    // `null` n’est pas `non_engage` : personne n’a encore ouvert la ligne.
    expect(isRenewalDecided(null)).toBe(false)
    expect(isRenewalDecided(undefined)).toBe(false)
  })

  /**
   * #2410.60 (LAU-FINAL-124, NO-GO du chapitre planning) — le renouvellement
   * gagne toujours sur la date de fin. Le bug : `availabilityFrom` du
   * planning du vivier ignorait ce statut et affichait une disponibilité
   * CERTAINE (en vert) sur une mission « à renouveler » ou en discussion.
   */
  describe('#2410.60 — la disponibilité n’est jamais certaine sur un renouvellement ouvert', () => {
    it('une fin CONFIRMÉE, ou un repositionnement lancé, rend une disponibilité certaine', () => {
      expect(missionAvailabilityCertainty('fin_confirmee')).toBe('certaine')
      expect(missionAvailabilityCertainty('repositionnement_lance')).toBe('certaine')
    })

    it('une reconduction SIGNÉE rend `renouvelee` : `ends_on` ne libère plus personne', () => {
      expect(missionAvailabilityCertainty('renouvele')).toBe('renouvelee')
    })

    it('« à renouveler », un retour demandé, une discussion, un blocage — jamais certaine', () => {
      expect(missionAvailabilityCertainty('non_engage')).toBe('incertaine')
      expect(missionAvailabilityCertainty('feedback_demande')).toBe('incertaine')
      expect(missionAvailabilityCertainty('discussion_en_cours')).toBe('incertaine')
      expect(missionAvailabilityCertainty('bloque')).toBe('incertaine')
    })

    it('une reconduction seulement ANNONCÉE n’est pas signée : reste incertaine', () => {
      expect(missionAvailabilityCertainty('reconduction_annoncee')).toBe('incertaine')
    })

    it('un statut ABSENT (`null`/`undefined`) reste incertain, jamais promu certaine', () => {
      expect(missionAvailabilityCertainty(null)).toBe('incertaine')
      expect(missionAvailabilityCertainty(undefined)).toBe('incertaine')
    })
  })

  it('#2195.32 — « Demander un feedback » ne se re-clique pas', () => {
    expect(canRequestRenewalFeedback(null)).toBe(true)
    expect(canRequestRenewalFeedback('non_engage')).toBe(true)
    expect(canRequestRenewalFeedback('discussion_en_cours')).toBe(true)
    // Le re-clic est fermé par le STATUT PERSISTÉ, pas par un drapeau d’écran :
    // un état d’écran se perd au rechargement et le client reçoit deux demandes.
    expect(canRequestRenewalFeedback('feedback_demande')).toBe(false)
    // Réclamer un avis sur une mission dont la fin est confirmée est inutile.
    expect(canRequestRenewalFeedback('fin_confirmee')).toBe(false)
    expect(canRequestRenewalFeedback('renouvele')).toBe(false)
  })
})

// #2560.6 — DÉCISION LOUIS 18/09/2026 : le client citait « le consultant »
// dans son retour, mais le critère de recette de #2560 ne portait que sur
// compte/rôle/dates/TJM/jours — l'affectation d'un consultant à la mission en
// cours de création restait hors de ce que `createMissionRequestSchema`
// pouvait porter, alors que l'objet existe déjà (`MissionAssignment`,
// `staffing.ts`). Ce test protège l'EXTENSION, pas une réécriture : les 12
// champs déjà là restent tous acceptés à côté du nouveau.
describe('#2560.6 — createMissionRequestSchema porte un consultantId optionnel', () => {
  const base = { accountId: '11111111-1111-4111-8111-111111111111', label: 'Mission' }

  it('accepte une création SANS consultant — le cas ordinaire, inchangé', () => {
    const result = createMissionRequestSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.consultantId).toBeUndefined()
  })

  it('accepte un consultantId valide, à côté des champs déjà là', () => {
    const consultantId = '22222222-2222-4222-8222-222222222222'
    const result = createMissionRequestSchema.safeParse({ ...base, consultantId })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.consultantId).toBe(consultantId)
  })

  it('refuse un consultantId qui n’est pas un UUID — jamais deviné, jamais toléré', () => {
    const result = createMissionRequestSchema.safeParse({ ...base, consultantId: 'pas-un-uuid' })
    expect(result.success).toBe(false)
  })
})

// #2339.7 (épopée #2795) — le positionnement dont la mission est la
// conversion (`missions.submission_id`, migration `1796321996935`). Même
// raison d'extension que `consultantId` juste au-dessus.
describe('#2339.7 — createMissionRequestSchema porte un submissionId optionnel', () => {
  const base = { accountId: '11111111-1111-4111-8111-111111111111', label: 'Mission' }

  it('accepte une création SANS positionnement — le cas ordinaire, inchangé', () => {
    const result = createMissionRequestSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.submissionId).toBeUndefined()
  })

  it('accepte un submissionId valide, à côté des champs déjà là', () => {
    const submissionId = '33333333-3333-4333-8333-333333333333'
    const result = createMissionRequestSchema.safeParse({ ...base, submissionId })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.submissionId).toBe(submissionId)
  })

  it('refuse un submissionId qui n’est pas un UUID — jamais deviné, jamais toléré', () => {
    const result = createMissionRequestSchema.safeParse({ ...base, submissionId: 'pas-un-uuid' })
    expect(result.success).toBe(false)
  })
})

// #2953 (#2193.17/.18) — l'objectif et le périmètre de la mission, dans le
// MÊME formulaire de réparation que la fiche (`updateMissionRequestSchema`),
// pas une route dédiée.
describe('#2193.17/.18 — updateMissionRequestSchema porte l’objectif et le périmètre', () => {
  it('accepte l’objectif seul, sans les autres champs', () => {
    const result = updateMissionRequestSchema.safeParse({ objective: 'Reprendre le run applicatif' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.objective).toBe('Reprendre le run applicatif')
  })

  it('accepte le périmètre seul, sans les autres champs', () => {
    const result = updateMissionRequestSchema.safeParse({ perimeter: 'TMA du portail transporteurs' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.perimeter).toBe('TMA du portail transporteurs')
  })

  it('coupe les espaces, comme le fait terrain d’un partenaire', () => {
    const result = updateMissionRequestSchema.safeParse({ objective: '  Stabiliser la plateforme  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.objective).toBe('Stabiliser la plateforme')
  })

  it('accepte `null` pour effacer l’un ou l’autre', () => {
    const result = updateMissionRequestSchema.safeParse({ objective: null, perimeter: null })
    expect(result.success).toBe(true)
  })

  it('refuse plus de 500 caractères', () => {
    expect(updateMissionRequestSchema.safeParse({ objective: 'x'.repeat(501) }).success).toBe(false)
    expect(updateMissionRequestSchema.safeParse({ perimeter: 'x'.repeat(501) }).success).toBe(false)
  })

  it('refuse toute clé hors du schéma — `.strict()` n’a pas changé', () => {
    expect(updateMissionRequestSchema.safeParse({ objectif: 'x' }).success).toBe(false)
  })
})
