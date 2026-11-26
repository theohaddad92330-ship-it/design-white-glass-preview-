import type { MessageSendBreakdown, WithheldMeasure } from '@/lib/team-kpis'
import { jour } from '@/lib/dates'

// Libellés FR centralisés pour la vue Équipes (KPIs manager).
// NOTE i18n : le dashboard-manager (backoffice interne) n'a pas de framework
// i18n — toutes ses pages sont en français en dur. On centralise ici les
// libellés des nouvelles pages pour qu'une future traduction ne demande qu'un
// fichier de remplacement (pas de chasse aux chaînes dans le JSX).

export const STR = {
  navTitle: 'Équipes',
  listTitle: 'Équipes — KPIs manager',
  listSubtitle:
    'Activité, conversion des actions et pipeline agrégés par ESN (workspace), sur la fenêtre glissante choisie. Vue cross-tenant, lecture seule.',
  detailBack: '← retour aux équipes',
  window: 'Fenêtre',
  windowDaysSuffix: 'j',
  cards: {
    analyses: 'Analyses lancées',
    messages: 'Messages envoyés',
    credits: 'Crédits consommés',
    hotAccounts: 'Comptes chauds',
  },
  table: {
    esn: 'ESN',
    members: 'Membres',
    analyses: 'Analyses',
    analysesCompleted: 'terminées',
    analysesCaption:
      'Exécutions d’analyse (analysis_runs) sur la fenêtre choisie, et celles qui sont terminées. Ce ne sont PAS des comptes : un compte réanalysé compte deux fois.',
    accounts: 'Comptes',
    accountsCompleted: 'terminés',
    accountsCaption:
      'Comptes dont une analyse a été lancée (archivés compris), et ceux dont l’analyse est terminée — la même définition que la fiche utilisateur (« lancées / terminées »). « Comptes actifs » exclut les archivés : ce n’est pas « lancés ».',
    activeAccounts: 'Comptes actifs',
    hotAccounts: 'Chauds',
    enriched: 'Contacts enrichis',
    messages: 'Messages',
    messagesVerifiedShort: 'Bellum',
    messagesDeclaredShort: 'déclarés',
    responses: 'Réponses',
    responseRate: 'Taux réponse',
    rdv: 'RDV',
    deals: 'Deals',
    credits: 'Crédits',
    activation: 'Activation',
    activated: 'activés',
    commercial: 'Commercial',
    role: 'Rôle',
    onboardedAt: 'Onboardé le',
    activatedAt: 'Activé le',
    lastActivity: 'Dernière activité',
    portfolio: 'Portefeuille',
    openActions: 'Actions ouvertes',
    overdueShort: 'en retard',
  },
  workload: {
    title: 'Charge d’actions ouvertes',
    caption:
      'Instantané (pas la fenêtre) : éléments de plan ni faits, ni reportés à plus tard, sur des comptes non archivés. Le porteur est le délégataire de l’action, sinon son créateur.',
    open: 'Ouvertes',
    overdue: 'En retard',
    dueSoon: 'À échéance ≤ 7 j',
    undated: 'Sans échéance',
    offTeam:
      'ouvertes sont portées par quelqu’un qui n’est plus membre de l’équipe — plus personne ne les voit passer.',
    empty: 'Aucune action ouverte.',
  },
  portfolio: {
    title: 'Couverture du portefeuille',
    caption:
      'Comptes non archivés selon leur RESPONSABLE désigné. Autre grandeur que « Comptes actifs », qui compte les comptes CRÉÉS par le commercial : un portefeuille se transmet, une création non.',
    assigned: 'Avec responsable',
    unassigned: 'Sans responsable',
    unassignedHint: 'Personne ne porte ces comptes.',
  },
  charts: {
    analysesPerTeam: 'Analyses lancées par ESN',
    messagesPerMember: 'Messages envoyés par commercial — part prouvée',
    messagesPerMemberCaption:
      'Uniquement les envois réellement expédiés par Bellum. Les envois déclarés (LinkedIn) figurent par commercial dans le tableau ci-dessous.',
    pipeline: 'Pipeline — comptes par statut commercial',
  },
  sections: {
    teams: 'Par équipe',
    members: 'Par commercial',
    notes: 'Méthodologie & limites (aucun chiffre inventé)',
  },
  empty: {
    teams: 'Aucune ESN.',
    members: 'Aucun membre.',
    pipeline: 'Aucun compte.',
  },
  messagesBreakdown: {
    verified: 'envoyés par Bellum',
    declared: 'déclarés',
    unattributed: 'non attribués',
    /** Note de méthodologie affichée sous tout total d'envois. */
    caption:
      "« Messages envoyés » agrège des envois RÉELLEMENT expédiés par Bellum (email) et des envois AUTO-DÉCLARÉS par le commercial (LinkedIn — Bellum n'a aucune API de messagerie et n'envoie rien). Seule la part « envoyés par Bellum » est prouvée ; la part « déclarés » repose sur la parole du commercial et ne doit pas servir seule à évaluer. « Non attribués » = lignes d'historique antérieures au marquage de provenance.",
  },
  unattributedCredits: 'crédits consommés non attribuables à un commercial (acteur inconnu dans le ledger)',
  notAvailable: '—',
  errorTitle: "Impossible de joindre l'endpoint KPIs équipes de l'API.",
  errorHint: 'Vérifie API_BASE_URL + INTERNAL_API_SECRET et que l’API tourne.',
} as const

/** Fenêtres proposées (jours). */
export const WINDOWS = [7, 30, 90] as const

/** Ratio 0..1 → « 40 % », ou « — » quand non dérivable (null). */
export function fmtRate(rate: number | null): string {
  return rate === null ? STR.notAvailable : `${Math.round(rate * 100)} %`
}

/**
 * #1681.1 — RETENU N'EST PAS NON MESURÉ.
 *
 * L'API applique le seuil des cinq sujets distincts et rend `activationWithheld`
 * À CÔTÉ du taux (un champ ajouté, jamais un champ dont la forme change). Cet
 * écran rendait `fmtRate(null)` : le MÊME tiret qu'une absence de mesure.
 *
 * Or les deux absences n'envoient pas l'opérateur au même endroit. « — » lui
 * fait chercher une panne d'instrumentation ; ici la mesure EXISTE et on refuse
 * de la publier, parce que sous le seuil une moyenne DÉSIGNE quelqu'un.
 *
 * Le seuil affiché vient de `minSubjects`, jamais d'un `5` écrit ici : un
 * réglage vit à un seul endroit (GA-26), et c'est `@bellum/contracts`.
 */
export function fmtActivationRate(rate: number | null, withheld: WithheldMeasure | null | undefined): string {
  // Le retrait passe AVANT le taux : si l'API oubliait un jour de mettre
  // `activationRate` à `null` en même temps, l'écran ne publierait pas pour
  // autant. Une règle de confidentialité ne se tient pas à deux endroits.
  if (withheld) return `retenu — moins de ${withheld.minSubjects} membres onboardés`
  return fmtRate(rate)
}

/**
 * Décomposition d'un total d'envois en une ligne lisible — « 12 envoyés par
 * Bellum · 8 déclarés ». Jamais de total nu : c'est ce qui rendait le KPI
 * trompeur (un envoi déclaré ne prouve rien).
 */
export function fmtMessageBreakdown(breakdown: MessageSendBreakdown): string {
  if (breakdown.total === 0) return STR.notAvailable
  const parts: string[] = []
  if (breakdown.verified > 0) parts.push(`${breakdown.verified} ${STR.messagesBreakdown.verified}`)
  if (breakdown.declared > 0) parts.push(`${breakdown.declared} ${STR.messagesBreakdown.declared}`)
  if (breakdown.unattributed > 0) parts.push(`${breakdown.unattributed} ${STR.messagesBreakdown.unattributed}`)
  return parts.join(' · ')
}

/** ISO → date courte FR, ou « — ». */
export function fmtDate(iso: string | null): string {
  return jour(iso, STR.notAvailable)
}

/** Le paramètre ?days= validé (7/30/90), défaut 30. */
export function parseWindow(days: string | undefined): number {
  const n = Number.parseInt(days ?? '', 10)
  return (WINDOWS as readonly number[]).includes(n) ? n : 30
}

/**
 * Les libellés des trois familles d'indicateurs profonds. Back-office : FR
 * seul, comme le reste du DM — c'est l'outil de l'opérateur, pas du client.
 */
export const DEEP_KPI_STR = {
  title: 'Indicateurs profonds',
  subtitle:
    'CRM, matching et qualité. Ils restent ici et jamais dans l’application : un taux affiché à un commercial devient une promesse chiffrée qu’il faut tenir.',
  crmTitle: 'CRM',
  matchingTitle: 'Matching',
  qualityTitle: 'Qualité',
  unreadable: 'Lecture impossible. Ce n’est pas « rien à signaler ».',
  empty: 'Aucun indicateur rendu.',
  notMeasured: 'non mesuré',
  noSample: 'aucune observation',
  onSample: 'sur',
  needMore: 'non mesurable —',
  target: 'cible',
  crm: {
    accounts_prioritised: 'Comptes passés en priorisé',
    accounts_without_next_action: 'Comptes suivis sans prochaine action',
    signal_to_action_days: 'Délai signal → action (médiane)',
    detected_to_qualified: 'Détecté → qualifié',
    stage_age_days: 'Âge d’étape (médiane)',
    needs_without_shortlist: 'Besoins ouverts sans shortlist',
    unstaffable_by_reason: 'Besoins non staffables',
    plan_age_days: 'Âge des plans d’action (médiane)',
    duplicate_contacts: 'Contacts en doublon probable',
  } as Record<string, string>,
  matching: {
    submission_win_rate: 'Positionnements acceptés',
    need_to_shortlist_days: 'Besoin → shortlist',
    shortlist_to_submission_days: 'Shortlist → positionnement',
    profiles_per_need: 'Profils poussés par besoin',
    exclusion_rate: 'Profils écartés',
  } as Record<string, string>,
} as const
