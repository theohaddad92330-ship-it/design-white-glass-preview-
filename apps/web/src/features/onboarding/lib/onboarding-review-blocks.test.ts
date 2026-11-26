import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { PROFILE_QUESTION_OPTIONS, WEEKLY_SALES_TIME_BANDS } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { buildReviewBlocks } from './onboarding-review-blocks'
import type { OnboardingAnswers, OnboardingPrefillMeta } from '@/stores/onboardingStore'

const fr = i18n.getFixedT('fr', 'onboarding') as TFunction<'onboarding'>

const FULL_ANSWERS: OnboardingAnswers = {
  esn_name: 'Kicklox',
  // Théo O onboarding-couverture (22/10/2026) — les 26 « Précisions de cadrage » de la V23 : même inventaire que le reste
  // de cette fiche « complète » (elles sont facultatives, mais une fiche complète les porte toutes).
  activity_nature: ['ESN généraliste'],
  tools: ['Excel / Google Sheets'],
  data_sources: ['Portefeuille de comptes'],
  workflow_pain: 'Relancer les devis sans retaper les mêmes informations',
  delivery_frictions: ['Validations client'],
  first_name: 'Théo',
  scope_level: 'Mon entreprise',
  scope_unit: 'Kicklox',
  autonomy: 'Préparer puis me faire valider les actions externes',
  context_policy: 'Avec mon activité comme contexte',
  offer_pitch: 'Nous traitons les pics de charge des équipes data',
  language_capabilities: ['Français', 'Anglais'],
  priority_expertise: ['Data & Intelligence Artificielle'],
  skill_technos: ['SQL'],
  bench_status: 'Pas actuellement',
  recruiting_priorities: ['Sourcer des profils'],
  commercial_limits: 'Marge visée 20 %',
  currency: 'EUR',
  target_nature: ['Clients finaux'],
  target_size: ['ETI'],
  country_scope: ['France'],
  geography_detail: 'Île-de-France et télétravail',
  no_go: 'Pas de rang 2',
  account_access: 'Accord-cadre signé avec deux comptes',
  horizon: 'Sous 60 jours',
  success_target: 'Identifier trois comptes et préparer les bons interlocuteurs',
  consultant_size: '10-30',
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux nombres réels,
  // additifs à `consultant_size` et entièrement nouveaux pour le CA : sans
  // eux, le bloc Entreprise n'est plus complet et « Confirmé » ne serait
  // plus vrai (même inventaire que le reste de cette fiche « complète »).
  consultant_count: '32',
  // #2640.2 — le site de l'entreprise, additif à cette même sous-étape
  // (`entreprise.ts`) : sans lui, le bloc Entreprise n'est plus complet.
  esn_website: 'https://www.kicklox.com',
  annual_revenue_amount: '1500000',
  annual_revenue_period: 'Dernier exercice clos',
  sales_team_size: '2-3 personnes',
  // Les sous-étapes arrivées avec #2034/#2035, puis avec #2050/#2051 et #2054 :
  // sans elles, le bloc Entreprise n'est plus complet et « Confirmé » ne serait
  // plus vrai. Une fixture de bloc « complet » est un INVENTAIRE — chaque lot
  // qui ajoute une question à `company_info` l'ajoute ici aussi.
  esn_maturity_situation: 'Croissance',
  company_growth_goal: 'Ouvrir un nouveau territoire',
  active_clients_band: '6 à 15 clients actifs',
  revenue_recurrence: 'Un mix de récurrent et de one-shot',
  client_concentration_risk: "Le chiffre d'affaires est réparti, aucun client dominant",
  consultants_managed_by_user_band: '6 à 15 consultants',
  available_consultants_band: 'Quelques consultants disponibles en intercontrat',
  // #2035.1 / #2035.2 — deux clés de plus (`optional: true`, comptées ici
  // comme tout le reste de cette fiche « complète »).
  consultant_size_group_band: '200-500',
  consultant_size_business_unit_band: '10-30',
  // Lot #2046/#2047 — six sous-étapes de plus dans `company_info` : sans ces
  // vingt-cinq clés, la fiche « complète » ne l'est plus.
  talent_pool_identified_band: '6-15',
  talent_pool_qualified_band: '1-5',
  talent_pool_available_band: '1-5',
  talent_pool_availability_recency_band: 'Ce mois-ci',
  talent_pool_avg_tjm_band: '550-700',
  talent_pool_mobility_band: 'Mobiles en France',
  talent_pool_consent_status: 'partiel',
  talent_pool_other_processes_band: 'Quelques-uns',
  talent_pool_engagement_reality_band: 'Une partie seulement',
  talent_pool_revalidation_frequency: 'mensuelle',
  talent_pool_state_interested_band: '6-15',
  talent_pool_state_available_band: '1-5',
  talent_pool_state_secured_band: '1-5',
  talent_pool_state_presentable_band: '0',
  client_base_missions_ongoing_band: '1-5',
  client_base_missions_completed_band: '6-15',
  client_base_renewals_band: 'quelques_uns',
  client_base_satisfaction_band: 'mesuree_bonne',
  client_base_referrals_band: 'quelques_unes',
  client_base_rex_band: 'parfois',
  client_base_case_studies_band: '1-5',
  client_base_cross_sell_band: 'tente_occasionnellement',
  client_base_deadlines_band: 'quelques_unes',
  client_base_followup_regularity: 'regulier',
  client_base_followup_owner: 'Le commercial du compte',
  expertise_areas: ['Java', 'DevOps'],
  positioning: 'Spécialiste',
  target_sectors: ['Finance'],
  target_company_types: ['Grand compte'],
  staffing_model: 'Régie',
  geo_zones: ['Île-de-France'],
  main_sales_pain: 'Manque de temps',
  // Lot L19 (#2050, #2051) — le temps réel, la charge concurrente et la
  // continuité des dossiers : trois sous-étapes de plus dans `company_info`.
  weekly_sales_time_declared: '5 à 10 heures par semaine',
  weekly_sales_time_protected: '2 à 5 heures par semaine',
  weekly_sales_time_residual: 'Moins de 2 heures par semaine',
  competing_workloads: ['Le delivery et le suivi des consultants en poste'],
  workload_variability: 'Elle varie selon les semaines, mais de façon prévisible',
  weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
  protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
  dossier_continuity_practices: ['Une revue hebdomadaire du portefeuille'],
  dossier_continuity_breaks: ['Un compte reste sans prochaine action'],
  // Lot G4 (#2054) — la chaîne d'outillage : trois sous-étapes de plus dans
  // `company_info`. Les valeurs sont celles du catalogue
  // (`TOOLING_PRESENCE_SCALE` et ses voisines) : un test qui invente sa donnée
  // d'entrée ne garde rien.
  tooling_crm: 'Mon équipe commerciale',
  tooling_ats: "Nous n'avons pas cet outil",
  tooling_erp: "Toute l'ESN",
  tooling_mailbox: 'Moi seul',
  tooling_calendar: 'Moi seul',
  tooling_drive: "Toute l'ESN",
  // #4971.1 — les noms des outils MAISON (facultatif, mais une fiche « complète » les porte tous).
  tooling_internal_names: ['Atlas'],
  tooling_spreadsheet: 'Mon équipe commerciale',
  tooling_enrichment: "Nous n'avons pas cet outil",
  tooling_sourcing_platform: 'Je ne sais pas',
  tooling_bi: "Nous n'avons pas cet outil",
  tooling_personal_notes: 'Moi seul',
  tooling_reference: 'Le CRM',
  tooling_reference_data: ['Les comptes et leurs interlocuteurs'],
  tooling_reference_freshness: 'Mise à jour il y a moins d’une semaine',
  tooling_reference_confidence: 'Je vérifie les points importants',
  tooling_reference_export: 'Oui, je peux exporter moi-même',
  tooling_duplicates: 'Oui, entre deux outils',
  tooling_pain: 'Je ressaisis les mêmes contacts à trois endroits',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — la sous-étape `implantation`,
  // ajoutée en fin de `company_info`.
  company_locations: ['Paris (siège)'],
}

describe('#2030.1-.8 — les huit blocs de récapitulatif, dans l’ordre exact', () => {
  it('rend Entreprise, BU, Utilisateur, Offre, Marché, Système, Objectifs, Inconnues', () => {
    const blocks = buildReviewBlocks({}, {}, fr)
    expect(blocks.map(b => b.code)).toEqual([
      'company',
      'businessUnit',
      'user',
      'offer',
      'market',
      'system',
      'goals',
      'unknowns',
    ])
  })
})

describe('#2030.10/.11 — état Confirmé / À vérifier', () => {
  it('un bloc SANS aucune réponse est « à vérifier »', () => {
    const [company] = buildReviewBlocks({}, {}, fr)
    expect(company.state).toBe('toVerify')
  })

  it('un bloc dont TOUTES les questions sont répondues est « confirmé »', () => {
    const blocks = buildReviewBlocks(FULL_ANSWERS, {}, fr)
    const company = blocks.find(b => b.code === 'company')!
    expect(company.state).toBe('confirmed')
  })

  it('un bloc SANS aucune question câblée (BU) ne peut jamais être « confirmé »', () => {
    // Casse volontairement : même avec toutes les réponses Temps-1 remplies,
    // un bloc à zéro ligne reste « à vérifier » — rien n'y a été confirmé.
    const blocks = buildReviewBlocks(FULL_ANSWERS, {}, fr)
    const bu = blocks.find(b => b.code === 'businessUnit')!
    expect(bu.rows).toEqual([])
    expect(bu.state).toBe('toVerify')
  })
})

describe('#2030.12 — préremplis non confirmés mis en évidence', () => {
  it('marque une ligne prérempli-non-confirmé distinctement d’une vraie réponse', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'pappers' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const company = blocks.find(b => b.code === 'company')!
    const esnName = company.rows.find(r => r.key === 'esn_name')!
    expect(esnName.state).toBe('unconfirmedPrefill')
    // Un bloc avec un prérempli non confirmé n'est pas confirmé pour autant.
    expect(company.state).toBe('toVerify')
  })
})

describe('#2030.14 — réponses manquantes mises en évidence', () => {
  it('une ligne sans réponse vaut `null`, jamais une chaîne vide qui se lirait comme une réponse', () => {
    const [company] = buildReviewBlocks({}, {}, fr)
    for (const row of company.rows) {
      expect(row.state).toBe('missing')
      expect(row.value).toBeNull()
    }
  })
})

describe('#2030.9 — chaque bloc renvoie vers où le corriger', () => {
  it('renvoie vers la première sous-étape du stage pour un bloc câblé', () => {
    const [company] = buildReviewBlocks({}, {}, fr)
    expect(company.editTarget).toEqual({ stage: 'company_info', slug: 'entreprise' })
  })

  it('ne renvoie NULLE PART pour un bloc sans question câblée — pas de renvoi deviné', () => {
    const blocks = buildReviewBlocks({}, {}, fr)
    const businessUnit = blocks.find(b => b.code === 'businessUnit')!
    expect(businessUnit.editTarget).toBeNull()
  })
})

// #2089.11/.15-.19 — le statut DOCTRINE à cinq valeurs (Confirmé / Proposé / À
// vérifier / Inconnu / Contradictoire), additif à `row.state` (`answered` /
// `missing` / `unconfirmedPrefill`, #2030, ne bouge pas — 26 assertions
// existantes le pinnent). `toVerify` (confiance moyenne/basse d'un prérempli
// non confirmé) et `contradictory` (clé impliquée dans une tension détectée
// par `detectQuestionnaireContradictions`) sont dérivés plus bas (#2089.17/.19).
// existantes le pinnent).
//
// ⚠️ Ce commentaire disait, jusqu'au 16/09/2026, que `toVerify` et
// `contradictory` n'étaient « pas dérivables aujourd'hui ». C'était vrai du
// PROMPT (#2088.34), pas du dépôt : les deux signaux existaient déjà, écrits,
// testés, et personne ne les lisait ici —
//  - `PrefillConfidence` porte `low`, et `PrefillBadge.tsx` le traite depuis
//    des mois comme un « check me » plutôt que comme un fait (#2089.17) ;
//  - `detectQuestionnaireContradictions` (@bellum/contracts) rend, pour chaque
//    tension, les CLÉS de question en cause (#2089.19).
describe('#2089.11/.15-.19 — statut à cinq valeurs par élément', () => {
  it('une réponse tapée par l’utilisateur est « confirmed »', () => {
    const [company] = buildReviewBlocks(FULL_ANSWERS, {}, fr)
    expect(company.rows.every(r => r.status === 'confirmed')).toBe(true)
  })

  it('un prérempli non confirmé est « proposed », jamais « confirmed »', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'pappers' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.status).toBe('proposed')
    expect(esnName.status).not.toBe('confirmed')
  })

  it('une réponse absente est « unknown », jamais « confirmed » — casse le code pour vérifier', () => {
    const [company] = buildReviewBlocks({}, {}, fr)
    expect(company.rows.every(r => r.status === 'unknown')).toBe(true)
    // Le test suivant DOIT échouer si la dérivation devient `status: 'confirmed'`
    // pour une ligne manquante — c'est la garde qui sait dire NON.
    expect(company.rows.some(r => r.status === 'confirmed')).toBe(false)
  })

  // #2089.17 — « À vérifier » : la SOURCE elle-même annonce une confiance
  // faible. Un prérempli `low` n'est pas au même niveau qu'un prérempli
  // `high` : le badge de question le traite déjà en « vérifie-moi », le
  // récapitulatif le disait « Proposé », comme un fait de registre.
  it('#2089.17 — un prérempli de confiance FAIBLE est « toVerify », pas « proposed »', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'low', source: 'pappers' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.status).toBe('toVerify')
    // La garde qui sait dire NON : si la dérivation retombe sur `proposed`,
    // le palier faible redevient invisible.
    expect(esnName.status).not.toBe('proposed')
  })

  // ⚠️ La fixture disait `medium` sous un titre qui annonce « HAUTE ». Le
  // docblock de `PrefillConfidence` (contrats) tranche : `high` se lit comme un
  // fait, `medium`/`low` invitent à relire. Un `medium` rendu « proposed »
  // aurait donc contredit le contrat — et le test voisin #2089.17 qui l'attend
  // en « toVerify ». Le témoin garde son rôle, avec la VRAIE confiance haute.
  it('#2089.17 — un prérempli de confiance HAUTE reste « proposed » (témoin du cas voisin)', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'pappers' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.status).toBe('proposed')
  })

  // #2089.19 — « Contradictoire » : la ligne est en TENSION avec une autre
  // réponse du questionnaire. Le signal n'est pas inventé ici — il vient des
  // huit détecteurs de `@bellum/contracts`, qui nomment déjà les CLÉS en cause.
  it('#2089.19 — une réponse en tension avec une autre est « contradictory »', () => {
    const answers = {
      ...FULL_ANSWERS,
      // `high_target_low_time` : l'objectif mensuel le plus haut face à la
      // bande de temps la plus basse. ⚠️ Des valeurs RÉELLES des catalogues —
      // une valeur inventée se ferait refuser par `validate` et la ligne
      // retomberait « unknown », ce qui ressemblerait exactement à une absence
      // de dérivation.
      weekly_sales_time_declared: WEEKLY_SALES_TIME_BANDS[0],
      monthly_target: PROFILE_QUESTION_OPTIONS.monthly_target[4],
    }
    const blocks = buildReviewBlocks(answers, {}, fr)
    const company = blocks.find(b => b.code === 'company')!
    const time = company.rows.find(r => r.key === 'weekly_sales_time_declared')!

    expect(time.status).toBe('contradictory')
    // Le témoin du cas voisin : une ligne HORS tension du MÊME bloc reste
    // « confirmed » — la dérivation ne repeint pas tout le questionnaire.
    expect(company.rows.find(r => r.key === 'esn_name')!.status).toBe('confirmed')
  })

  it('#2089.19 — sans tension détectée, aucune ligne n’est « contradictory »', () => {
    const blocks = buildReviewBlocks(FULL_ANSWERS, {}, fr)
    const rows = blocks.flatMap(b => b.rows)
    // Le corpus n'est pas vide : sans ligne lue, ce test ne prouverait rien.
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some(r => r.status === 'contradictory')).toBe(false)
  })
})

// #2089.17 — un prérempli non confirmé de confiance moyenne/basse invite une
// relecture AVANT de cliquer (docblock `PrefillConfidence`, contrats) :
// distinct de « proposed », qui reste la confiance `high`.
describe('#2089.17 — statut « à vérifier » (toVerify) sur un prérempli de confiance moyenne/basse', () => {
  it('un prérempli non confirmé de confiance `medium` est « toVerify », jamais « proposed »', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'medium', source: 'pappers' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.status).toBe('toVerify')
    expect(esnName.status).not.toBe('proposed')
  })

  it('un prérempli non confirmé de confiance `low` est aussi « toVerify »', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'low', source: 'website' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.status).toBe('toVerify')
  })

  it('un prérempli non confirmé de confiance `high` reste « proposed » — ne bascule pas en « toVerify »', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'pappers' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.status).toBe('proposed')
  })

  it('une réponse ABSENTE de confiance basse reste « unknown », jamais « toVerify » — casse le code pour vérifier', () => {
    // Un prérempli non confirmé suppose une VALEUR remplie (`filled`) : une
    // case vide n'entre jamais dans cette branche, même avec une confiance
    // basse posée par erreur dans les métadonnées.
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'low', source: 'website' } }
    const blocks = buildReviewBlocks({}, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.status).toBe('unknown')
  })
})

// #2089.19 — la clé d'une question en tension avec une autre (détectée par
// les huit détecteurs purs de `@bellum/contracts`, #2029) porte « contradictory »,
// jamais « confirmed »/« proposed » — nommer la tension, jamais trancher pour
// l'utilisateur.
describe('#2089.19 — statut « contradictoire » sur une tension détectée', () => {
  it('deux zones géographiques aux extrémités opposées, sans justification nationale, sont « contradictory »', () => {
    const answers = {
      ...FULL_ANSWERS,
      geo_zones: ['Lille & Hauts-de-France', 'Bordeaux & Nouvelle-Aquitaine'],
    }
    const blocks = buildReviewBlocks(answers, {}, fr)
    const market = blocks.find(b => b.code === 'market')!
    const geoZones = market.rows.find(r => r.key === 'geo_zones')!
    expect(geoZones.status).toBe('contradictory')
    expect(geoZones.status).not.toBe('confirmed')
  })

  it('une zone nationale désamorce la tension — le statut redevient « confirmed », casse le code pour vérifier', () => {
    const answers = {
      ...FULL_ANSWERS,
      geo_zones: ['Lille & Hauts-de-France', 'Bordeaux & Nouvelle-Aquitaine', 'National (toute la France)'],
    }
    const blocks = buildReviewBlocks(answers, {}, fr)
    const market = blocks.find(b => b.code === 'market')!
    const geoZones = market.rows.find(r => r.key === 'geo_zones')!
    expect(geoZones.status).toBe('confirmed')
  })

  it('une question hors de toute tension détectée n’est jamais « contradictory » — la garde n’attrape pas ce qu’elle ne vise pas', () => {
    const blocks = buildReviewBlocks(FULL_ANSWERS, {}, fr)
    const company = blocks.find(b => b.code === 'company')!
    expect(company.rows.some(r => r.status === 'contradictory')).toBe(false)
  })
})

describe('#2089.12 — chaque élément porte sa provenance (source + date)', () => {
  it('un prérempli non confirmé porte la source et la date de `prefillMeta`', () => {
    const prefillMeta: OnboardingPrefillMeta = {
      esn_name: { confidence: 'high', source: 'pappers', asOf: '2026-03-01T00:00:00.000Z' },
    }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.provenance).toEqual({ source: 'pappers', asOfIso: '2026-03-01T00:00:00.000Z' })
  })

  it('une réponse tapée directement n’a PAS de provenance inventée', () => {
    const [company] = buildReviewBlocks(FULL_ANSWERS, {}, fr)
    expect(company.rows.every(r => r.provenance === null)).toBe(true)
  })

  it('une date de source manquante reste `null`, jamais une date devinée', () => {
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'pappers' } }
    const blocks = buildReviewBlocks(FULL_ANSWERS, prefillMeta, fr)
    const esnName = blocks.find(b => b.code === 'company')!.rows.find(r => r.key === 'esn_name')!
    expect(esnName.provenance).toEqual({ source: 'pappers', asOfIso: null })
  })
})

// relecture onboarding : libellés, pas les codes (mesuré en prod le 15/09/2026)
describe('relecture onboarding — libellés, pas les codes (mesuré en prod le 15/09/2026)', () => {
  it('un `multi-grouped` codé (domaines d’offre) affiche ses libellés FR, pas ses codes', () => {
    const blocks = buildReviewBlocks({ offer_domains: ['CLOUD_DEVOPS_SRE', 'CYBER_IAM_GRC'] }, {}, fr)
    const offer = blocks.find(b => b.code === 'offer')!
    const row = offer.rows.find(r => r.key === 'offer_domains')!
    expect(row.value).toBe(
      'Cloud, DevOps, SRE, plateformes & FinOps, Cybersécurité, IAM, GRC, SOC & résilience numérique',
    )
  })

  it('un `single` codé (recrutement CDI) affiche son libellé FR, pas « yes »', () => {
    const blocks = buildReviewBlocks({ recruits_for_clients: 'yes' }, {}, fr)
    const offer = blocks.find(b => b.code === 'offer')!
    const row = offer.rows.find(r => r.key === 'recruits_for_clients')!
    expect(row.value).toBe('Oui, je place aussi des profils en CDI chez mes clients')
  })

  it('un code SANS libellé connu s’affiche TEL QUEL — jamais vide, jamais deviné — casse la résolution pour vérifier', () => {
    const blocks = buildReviewBlocks({ offer_domains: ['NOT_A_REAL_DOMAIN'] }, {}, fr)
    const offer = blocks.find(b => b.code === 'offer')!
    const row = offer.rows.find(r => r.key === 'offer_domains')!
    expect(row.value).toBe('NOT_A_REAL_DOMAIN')
  })
})

/**
 * #2027.4 — les inconnues DÉCLARÉES alimentent le bloc « Informations à
 * compléter » (`unknowns`), jamais un score négatif ni une confusion avec une
 * réponse manquante ou une réponse mesurée.
 */
describe('#2027.4 — les réponses incertaines alimentent le bloc « unknowns »', () => {
  it('une réponse marquée « Je ne sais pas encore » sort de son bloc d’origine et entre dans « unknowns »', () => {
    const answers: OnboardingAnswers = { ...FULL_ANSWERS, available_consultants_band: 'Je ne sais pas encore' }
    const blocks = buildReviewBlocks(answers, {}, fr)
    const company = blocks.find(b => b.code === 'company')!
    const unknowns = blocks.find(b => b.code === 'unknowns')!
    expect(company.rows.find(r => r.key === 'available_consultants_band')).toBeUndefined()
    const row = unknowns.rows.find(r => r.key === 'available_consultants_band')!
    expect(row.unknownReason).toBe('not_yet_known')
    expect(row.value).toBe('Je ne sais pas encore')
  })

  it('#2027.3 — son statut est « unmeasuredByChoice », jamais « manquante » ni « confirmée »', () => {
    const answers: OnboardingAnswers = { ...FULL_ANSWERS, available_consultants_band: 'Non applicable' }
    const blocks = buildReviewBlocks(answers, {}, fr)
    const unknowns = blocks.find(b => b.code === 'unknowns')!
    const row = unknowns.rows.find(r => r.key === 'available_consultants_band')!
    expect(row.status).toBe('unmeasuredByChoice')
    expect(row.state).toBe('answered')
  })

  it('une vraie réponse mesurée ne porte AUCUNE raison d’incertitude', () => {
    const blocks = buildReviewBlocks(FULL_ANSWERS, {}, fr)
    const company = blocks.find(b => b.code === 'company')!
    const row = company.rows.find(r => r.key === 'available_consultants_band')!
    expect(row.unknownReason).toBeNull()
    expect(row.status).toBe('confirmed')
  })

  it('un bloc d’origine reste éligible « confirmé » sur son reste — une inconnue déclarée n’est pas un problème', () => {
    const answers: OnboardingAnswers = { ...FULL_ANSWERS, available_consultants_band: 'Je ne sais pas encore' }
    const blocks = buildReviewBlocks(answers, {}, fr)
    const company = blocks.find(b => b.code === 'company')!
    expect(company.state).toBe('confirmed')
  })
})
