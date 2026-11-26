import type { DemoPipeDeal } from './demo-dataset'
import { resolveDemoPipeRow, type DemoPipeRow } from './demo-pipe-journal'

/**
 * R33b (16/10/2026) — PARITÉ D'HISTORIQUE ET D'AFFAIRES des comptes de brief démo.
 *
 * Décision Louis (12/10 et 13/10) : en démo AUCUN compte mince ; Airbus, EDF, Renault, Thales et Orange sont à parité
 * avec Société Générale et BPCE. La recette prod du 16/10 les a trouvés muets : « Aucun échange enregistré », « Rien
 * n'a encore été fait », zéro affaire sur /projects.
 *
 * Même forme que `DEMO_ACTIVITIES` / `DEMO_USER_ACTIONS` / `DEMO_PIPE_L2` (mêmes tables, mêmes dates relatives au
 * reset), dans un module à part pour ne pas toucher `demo-dataset.ts`. Écrit par `DemoSeedService.seedParityHistory`.
 *
 * ⚠️ Aucun échange n'est attribué à une personne du dossier (décision Louis 04/10 : aucune déclaration inventée sur
 * une personne réelle) : les lignes portent sur le COMPTE (`contact: null`), comme les notes d'équipe de SNCF. Seules
 * les affaires se rattachent à des décideurs déjà semés, par leur nom complet (`project_contacts`), parce que le
 * rattachement n'affirme aucun échange. Aucune trace d'ENVOI : « Message copié » seulement, jamais un e-mail parti.
 * `source` reste `manual` (aucune messagerie connectée à une salle démo).
 */
export const DEMO_PARITY_COMPANIES = ['Renault', 'Airbus', 'EDF', 'Thales', 'Orange'] as const

type ParityCompany = (typeof DEMO_PARITY_COMPANIES)[number]

interface ParityActivity {
  company: ParityCompany
  contact: null
  kind: 'email' | 'call' | 'meeting'
  direction: 'inbound' | 'outbound'
  source?: undefined
  subject: string
  body: string | null
  daysAgo: number
  durationSeconds: number | null
  outcome?: 'connected_qualified'
}

interface ParityUserAction {
  action_type: 'analysis_completed' | 'message_copied' | 'plan_action_completed' | 'export'
  channel: 'email' | 'linkedin' | null
  company: ParityCompany
  contact: null
  hours_ago: number
  metadata: Record<string, unknown>
}

type ParityProjectRole = 'sponsor' | 'decideur' | 'prescripteur' | 'acheteur' | 'utilisateur' | 'bloqueur'

interface ParityDeal extends DemoPipeDeal {
  account: ParityCompany
  /** Décideurs DÉJÀ semés du compte, par nom complet : un nom introuvable fait sauter la ligne. */
  contacts: readonly { full_name: string; role: ParityProjectRole }[]
}

const mail = (
  company: ParityCompany,
  direction: 'inbound' | 'outbound',
  daysAgo: number,
  subject: string,
  body: string,
): ParityActivity => ({
  company,
  contact: null,
  kind: 'email',
  direction,
  subject,
  body,
  daysAgo,
  durationSeconds: null,
})

export const DEMO_PARITY_ACTIVITIES: readonly ParityActivity[] = [
  // ── Renault — SDV, flux IA industriel, plan futuREady ────────────────────────
  {
    company: 'Renault',
    contact: null,
    kind: 'meeting',
    direction: 'outbound',
    subject: 'Cadrage — flux IA industriel et analyse vidéo',
    body: 'Notes de l’équipe : tour de table sur le cas d’usage d’analyse vidéo en usine. Le périmètre se borne à un flux démontrable ; prochaine étape : un atelier de cadrage de 45 minutes.',
    daysAgo: 41,
    durationSeconds: 3600,
  },
  mail(
    'Renault',
    'outbound',
    33,
    'Six semaines pour un flux IA industriel exploitable',
    'Bonjour,\n\nVotre plan stratégique place l’accélération technologique au cœur du groupe. Nous intervenons en renfort borné sur les flux IA industriels, sans remplacer les équipes en place. Disposez-vous de vingt minutes cette semaine ?\n\nBien à vous',
  ),
  mail(
    'Renault',
    'inbound',
    27,
    'RE: Six semaines pour un flux IA industriel exploitable',
    'Bonjour,\n\nLe sujet nous intéresse mais il passe par le panel. Envoyez-nous une présentation courte et deux profils possibles ; nous reviendrons vers vous après le point budget.\n\nCordialement',
  ),
  {
    company: 'Renault',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Point sur le panel prestataires',
    body: null,
    daysAgo: 19,
    durationSeconds: 600,
    outcome: 'connected_qualified',
  },
  mail(
    'Renault',
    'outbound',
    12,
    'Deux profils DevOps et plateformes logicielles — disponibilités',
    'Bonjour,\n\nComme convenu, deux profils DevOps pour les plateformes logicielles embarquées, disponibles sous trois semaines. Je reste disponible pour un échange de trente minutes.\n\nBien à vous',
  ),
  {
    company: 'Renault',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Relance après le point budget',
    body: null,
    daysAgo: 4,
    durationSeconds: 300,
  },
  // ── Airbus — DevSecOps, Valkyrie, IA et automatisation IT ───────────────────
  {
    company: 'Airbus',
    contact: null,
    kind: 'meeting',
    direction: 'outbound',
    subject: 'Cadrage — chaîne DevSecOps des logiciels critiques',
    body: 'Notes de l’équipe : cadrage du périmètre applicatif français. Deux ESN déjà installées ; l’entrée se fait par un renfort borné sur la chaîne de livraison. Prochaine étape : une cartographie de chaîne.',
    daysAgo: 45,
    durationSeconds: 3600,
  },
  mail(
    'Airbus',
    'outbound',
    36,
    'Chaîne DevSecOps — cartographie en six semaines',
    'Bonjour,\n\nNous proposons une cartographie de chaîne, un backlog priorisé et un profil opérationnel qualifié en six semaines, sur un périmètre applicatif français défini.\n\nSeriez-vous disponible pour un atelier de 45 minutes ?\n\nBien à vous',
  ),
  mail(
    'Airbus',
    'inbound',
    30,
    'RE: Chaîne DevSecOps — cartographie en six semaines',
    'Bonjour,\n\nMerci pour la proposition. Les achats IT passent par un panel : pouvez-vous nous transmettre votre référencement et un profil type avant notre comité de la semaine prochaine ?\n\nCordialement',
  ),
  {
    company: 'Airbus',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Référencement — pièces du dossier fournisseur',
    body: null,
    daysAgo: 21,
    durationSeconds: 540,
    outcome: 'connected_qualified',
  },
  mail(
    'Airbus',
    'outbound',
    14,
    'Profil DevSecOps et pièces de référencement',
    'Bonjour,\n\nCi-joint le profil type et les pièces de référencement demandées. Je me tiens disponible pour un point de trente minutes.\n\nBien à vous',
  ),
  {
    company: 'Airbus',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Suite du comité',
    body: null,
    daysAgo: 5,
    durationSeconds: 360,
  },
  // ── EDF — cyber OT, partenariat V2G, centrale virtuelle ─────────────────────
  {
    company: 'EDF',
    contact: null,
    kind: 'meeting',
    direction: 'outbound',
    subject: 'Cadrage — renfort cyber OT sans attendre un recrutement',
    body: 'Notes de l’équipe : périmètre OT/IT français borné, matrice de risques et relais opérationnel. Prochaine étape : un atelier de cadrage et un profil qualifié.',
    daysAgo: 48,
    durationSeconds: 3600,
  },
  mail(
    'EDF',
    'outbound',
    39,
    'Cyber OT — un relais opérationnel en six semaines',
    'Bonjour,\n\nNous renforçons les équipes cyber sur les périmètres OT/IT sans attendre un recrutement : matrice de risques, backlog priorisé et relais opérationnel.\n\nSeriez-vous disponible pour vingt minutes ?\n\nBien à vous',
  ),
  mail(
    'EDF',
    'inbound',
    32,
    'RE: Cyber OT — un relais opérationnel en six semaines',
    'Bonjour,\n\nLe besoin existe côté ingénierie, mais la décision remonte à la direction des systèmes d’information. Envoyez-nous un profil et ses disponibilités pour notre revue interne.\n\nCordialement',
  ),
  {
    company: 'EDF',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Point sur la revue interne',
    body: null,
    daysAgo: 22,
    durationSeconds: 480,
    outcome: 'connected_qualified',
  },
  mail(
    'EDF',
    'outbound',
    13,
    'Profil cyber OT — disponibilités',
    'Bonjour,\n\nComme convenu, un profil cyber OT disponible sous quatre semaines. Je reste disponible pour un échange de trente minutes.\n\nBien à vous',
  ),
  {
    company: 'EDF',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Relance — retour de la revue interne',
    body: null,
    daysAgo: 3,
    durationSeconds: 240,
  },
  // ── Thales — CI/CD critique, base de maintenance, contrat spatial ───────────
  {
    company: 'Thales',
    contact: null,
    kind: 'meeting',
    direction: 'outbound',
    subject: 'Cadrage — chaîne CI/CD critique',
    body: 'Notes de l’équipe : points de blocage de sécurité et traçabilité des déploiements sur un périmètre français défini. Prochaine étape : un plan de remédiation chiffré.',
    daysAgo: 43,
    durationSeconds: 3600,
  },
  mail(
    'Thales',
    'outbound',
    35,
    'Six semaines pour sécuriser une chaîne CI/CD critique',
    'Bonjour,\n\nNous proposons une chaîne cible documentée, des contrôles automatisés prioritaires et un plan de remédiation en six semaines.\n\nAuriez-vous vingt minutes pour en parler ?\n\nBien à vous',
  ),
  mail(
    'Thales',
    'inbound',
    28,
    'RE: Six semaines pour sécuriser une chaîne CI/CD critique',
    'Bonjour,\n\nL’approche est intéressante pour notre environnement industriel. Transmettez-nous un profil habilitable et vos disponibilités ; nous les présentons à la prochaine revue.\n\nCordialement',
  ),
  {
    company: 'Thales',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Habilitation — conditions d’accès au périmètre',
    body: null,
    daysAgo: 18,
    durationSeconds: 660,
    outcome: 'connected_qualified',
  },
  mail(
    'Thales',
    'outbound',
    9,
    'Profil CI/CD habilitable — disponibilités',
    'Bonjour,\n\nComme convenu, un profil CI/CD disponible début novembre, dans le cadre d’une habilitation à instruire. Je reste disponible pour un point de trente minutes.\n\nBien à vous',
  ),
  {
    company: 'Thales',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Suite de la revue',
    body: null,
    daysAgo: 2,
    durationSeconds: 300,
  },
  // ── Orange — Orange Business, Cyberdefense, SI vente ────────────────────────
  {
    company: 'Orange',
    contact: null,
    kind: 'meeting',
    direction: 'outbound',
    subject: 'Cadrage — renfort cybersécurité et SI de vente',
    body: 'Notes de l’équipe : deux dynamiques opposées dans le groupe, Orange Business en repli et Orange Cyberdefense en hausse. Entrée envisagée par la cybersécurité, sur un renfort borné.',
    daysAgo: 40,
    durationSeconds: 3600,
  },
  mail(
    'Orange',
    'outbound',
    31,
    'Renfort cybersécurité — profils disponibles',
    'Bonjour,\n\nNous intervenons en renfort borné sur les périmètres cybersécurité, sans remplacer les équipes en place. Disposez-vous de vingt minutes cette semaine ?\n\nBien à vous',
  ),
  mail(
    'Orange',
    'inbound',
    25,
    'RE: Renfort cybersécurité — profils disponibles',
    'Bonjour,\n\nMerci pour votre message. Envoyez-nous deux profils avec leurs disponibilités ; nous les ferons circuler en interne avant le prochain point de référencement.\n\nCordialement',
  ),
  {
    company: 'Orange',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Point sur le référencement',
    body: null,
    daysAgo: 16,
    durationSeconds: 480,
    outcome: 'connected_qualified',
  },
  mail(
    'Orange',
    'outbound',
    10,
    'Deux profils cybersécurité — disponibilités',
    'Bonjour,\n\nComme convenu, deux profils cybersécurité, disponibles sous trois semaines. Je reste disponible pour un échange de trente minutes.\n\nBien à vous',
  ),
  {
    company: 'Orange',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Relance — retour sur les profils',
    body: null,
    daysAgo: 3,
    durationSeconds: 270,
  },
]

const analysis = (company: ParityCompany, hoursAgo: number): ParityUserAction => ({
  action_type: 'analysis_completed',
  channel: null,
  company,
  contact: null,
  hours_ago: hoursAgo,
  metadata: {},
})
const done = (company: ParityCompany, hoursAgo: number, action: string): ParityUserAction => ({
  action_type: 'plan_action_completed',
  channel: null,
  company,
  contact: null,
  hours_ago: hoursAgo,
  metadata: { action },
})
const copied = (
  company: ParityCompany,
  hoursAgo: number,
  channel: 'email' | 'linkedin',
  subject: string,
): ParityUserAction => ({
  action_type: 'message_copied',
  channel,
  company,
  contact: null,
  hours_ago: hoursAgo,
  metadata: { subject },
})

export const DEMO_PARITY_USER_ACTIONS: readonly ParityUserAction[] = [
  analysis('Renault', 190),
  done('Renault', 150, 'Choisir l’entité Renault à ouvrir en premier'),
  copied('Renault', 96, 'email', 'Deux profils DevOps — plateformes logicielles'),
  copied('Renault', 30, 'linkedin', 'Un flux IA industriel en six semaines — proposition de point'),
  analysis('Airbus', 200),
  done('Airbus', 160, 'Qualifier le circuit de référencement fournisseur'),
  copied('Airbus', 100, 'email', 'Profil DevSecOps et pièces de référencement'),
  {
    action_type: 'export',
    channel: null,
    company: 'Airbus',
    contact: null,
    hours_ago: 40,
    metadata: { format: 'pdf' },
  },
  analysis('EDF', 210),
  done('EDF', 170, 'Cadrer le périmètre cyber OT avec l’ingénierie'),
  copied('EDF', 88, 'email', 'Profil cyber OT — disponibilités'),
  copied('EDF', 26, 'linkedin', 'Cyber OT : un relais opérationnel — proposition de point'),
  analysis('Thales', 180),
  done('Thales', 140, 'Instruire les conditions d’habilitation'),
  copied('Thales', 84, 'email', 'Profil CI/CD habilitable — disponibilités'),
  {
    action_type: 'export',
    channel: null,
    company: 'Thales',
    contact: null,
    hours_ago: 36,
    metadata: { format: 'pdf' },
  },
  analysis('Orange', 170),
  done('Orange', 130, 'Choisir l’entité Orange à ouvrir en premier'),
  copied('Orange', 80, 'email', 'Deux profils cybersécurité — disponibilités'),
  copied('Orange', 24, 'linkedin', 'Un renfort cybersécurité borné — proposition de point'),
]

const steps = (chain: readonly { to: string; at: number }[]): { from: string | null; to: string; at: number }[] =>
  chain.map((step, index) => ({ from: index === 0 ? null : (chain[index - 1]?.to ?? null), ...step }))

export const DEMO_PARITY_DEALS: readonly ParityDeal[] = [
  {
    account: 'Airbus',
    label: 'Renfort DevSecOps — chaîne de logiciels critiques',
    detail: 'Un profil DevSecOps pour la chaîne de livraison des logiciels critiques, périmètre applicatif français.',
    stage: 'negotiation',
    amountCents: 180_000_00,
    category: 'best_case',
    expectedCloseInDays: 28,
    created: 62,
    stageEntered: 9,
    transitions: steps([
      // #4338.1 — Besoin exprimé, puis Qualifié.
      { to: 'confirmed', at: 62 },
      { to: 'qualified', at: 40 },
      { to: 'profiles_submitted', at: 22 },
      { to: 'negotiation', at: 9 },
    ]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 5,
    contacts: [
      { full_name: 'Ansgar Kirchner', role: 'decideur' },
      { full_name: 'Alexa Figgess', role: 'acheteur' },
      { full_name: 'Alan Zaccardelle', role: 'prescripteur' },
    ],
  },
  {
    account: 'Airbus',
    label: 'Cadrage — automatisation IT et digital workplace',
    detail: 'Cadrage d’un renfort sur l’automatisation IT et le poste de travail numérique ; périmètre à chiffrer.',
    stage: 'qualified',
    amountCents: null,
    category: null,
    expectedCloseInDays: 75,
    created: 12,
    stageEntered: 12,
    transitions: steps([{ to: 'qualified', at: 12 }]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 14,
    contacts: [{ full_name: 'Cornelius Waidelich', role: 'sponsor' }],
  },
  {
    account: 'EDF',
    label: 'Renfort cyber OT — périmètre borné',
    detail: 'Un profil cyber OT pour un relais opérationnel sur un périmètre OT/IT français borné.',
    stage: 'profiles_submitted',
    amountCents: 120_000_00,
    category: 'pipeline',
    expectedCloseInDays: 40,
    created: 55,
    stageEntered: 13,
    transitions: steps([
      { to: 'qualified', at: 55 },
      { to: 'confirmed', at: 34 },
      { to: 'profiles_submitted', at: 13 },
    ]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 3,
    contacts: [
      { full_name: 'Julien Villeret', role: 'decideur' },
      { full_name: 'François Raynaud', role: 'sponsor' },
    ],
  },
  {
    account: 'EDF',
    label: 'Assistance exploitation — systèmes d’information de l’ingénierie',
    detail: 'Assistance à l’exploitation des systèmes d’information de l’ingénierie, référencement à confirmer.',
    stage: 'confirmed',
    amountCents: 85_000_00,
    category: null,
    expectedCloseInDays: 60,
    created: 30,
    stageEntered: 18,
    transitions: steps([
      { to: 'qualified', at: 30 },
      { to: 'confirmed', at: 18 },
    ]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 10,
    contacts: [{ full_name: 'Franck Michon', role: 'prescripteur' }],
  },
  {
    account: 'Renault',
    label: 'Atelier de cadrage — flux IA industriel',
    detail: 'Atelier de cadrage d’un flux IA industriel exploitable : analyse vidéo en usine, périmètre démontrable.',
    stage: 'qualified',
    amountCents: 60_000_00,
    category: null,
    expectedCloseInDays: 50,
    created: 20,
    stageEntered: 20,
    transitions: steps([{ to: 'qualified', at: 20 }]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 4,
    contacts: [
      { full_name: 'Claire Suedile', role: 'sponsor' },
      { full_name: 'Adrien Weber', role: 'utilisateur' },
    ],
  },
  {
    account: 'Renault',
    label: 'Renfort DevOps — plateformes logicielles embarquées',
    detail: 'Deux profils DevOps pour les plateformes logicielles embarquées, après le point budget.',
    stage: 'profiles_submitted',
    amountCents: 140_000_00,
    category: 'best_case',
    expectedCloseInDays: 35,
    created: 48,
    stageEntered: 12,
    transitions: steps([
      { to: 'qualified', at: 48 },
      { to: 'confirmed', at: 30 },
      { to: 'profiles_submitted', at: 12 },
    ]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 4,
    contacts: [
      { full_name: 'Charles Baudey', role: 'prescripteur' },
      { full_name: 'Claire Suedile', role: 'decideur' },
    ],
  },
  {
    account: 'Thales',
    label: 'Industrialisation CI/CD sécurisée — chaîne critique',
    detail: 'Chaîne CI/CD cible documentée, contrôles automatisés et plan de remédiation, profil habilitable.',
    stage: 'negotiation',
    amountCents: 160_000_00,
    category: 'commit',
    expectedCloseInDays: 21,
    created: 58,
    stageEntered: 8,
    transitions: steps([
      { to: 'qualified', at: 58 },
      { to: 'confirmed', at: 38 },
      { to: 'profiles_submitted', at: 20 },
      { to: 'negotiation', at: 8 },
    ]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 2,
    contacts: [
      { full_name: 'Aurelia Peltier', role: 'decideur' },
      { full_name: 'Axel Hurgon', role: 'sponsor' },
      { full_name: 'Caroline Gibon', role: 'prescripteur' },
    ],
  },
  {
    account: 'Thales',
    label: 'Support opérationnel — soutien aux systèmes d’information',
    detail: 'Soutien opérationnel d’un lot de systèmes d’information, reconduit après la première mission.',
    stage: 'won',
    amountCents: 75_000_00,
    category: null,
    expectedCloseInDays: -18,
    created: 70,
    stageEntered: 18,
    closed: 18,
    transitions: steps([
      { to: 'qualified', at: 70 },
      { to: 'confirmed', at: 52 },
      { to: 'profiles_submitted', at: 36 },
      { to: 'negotiation', at: 26 },
      { to: 'won', at: 18 },
    ]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 18,
    contacts: [{ full_name: 'Annemijn Voorgt', role: 'sponsor' }],
  },
  {
    account: 'Orange',
    label: 'Renfort cybersécurité — profils pour le référencement',
    detail: 'Deux profils cybersécurité présentés pour le prochain point de référencement du groupe.',
    stage: 'profiles_submitted',
    amountCents: 130_000_00,
    category: 'pipeline',
    expectedCloseInDays: 38,
    created: 44,
    stageEntered: 10,
    transitions: steps([
      { to: 'qualified', at: 44 },
      { to: 'confirmed', at: 26 },
      { to: 'profiles_submitted', at: 10 },
    ]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 3,
    contacts: [
      { full_name: 'Hicham Sabre', role: 'decideur' },
      { full_name: 'Jean-Christophe Boulay', role: 'sponsor' },
    ],
  },
  {
    account: 'Orange',
    label: 'Chef de projet SI — vente ProPME',
    detail: 'Appui projet sur le système d’information de vente ProPME ; périmètre et montant à qualifier.',
    stage: 'qualified',
    amountCents: null,
    category: null,
    expectedCloseInDays: 70,
    created: 15,
    stageEntered: 15,
    transitions: steps([{ to: 'qualified', at: 15 }]),
    amountChanges: [],
    closeDateChanges: [],
    lastActivityDaysAgo: 15,
    contacts: [{ full_name: 'Olivier Guénon', role: 'utilisateur' }],
  },
]

interface ParityDealRow extends DemoPipeRow {
  deal: ParityDeal
}

export function buildParityDealRows(now: Date): ParityDealRow[] {
  return DEMO_PARITY_DEALS.map(deal => ({ ...resolveDemoPipeRow(deal, now), deal }))
}
