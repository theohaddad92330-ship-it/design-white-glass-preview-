/**
 * #3529 — la FORMULE et la SOURCE d'un indicateur, en langage métier.
 *
 * `formula` et `source` de `manager-kpi.ts` restent écrites pour être
 * vérifiables (SQL, noms de tables) ; l'écran, lui, n'a pas à les montrer : un
 * commercial lit « Comptes passés en priorisé », pas `COUNT(accounts)…`. Les
 * phrases vivent ici, résolues par la clé de l'indicateur (GA-26 : une seule
 * place), et une garde (`manager-kpi-plain.test.ts`) refuse tout identifiant
 * technique dans ce que l'écran affiche.
 */
interface KpiBilingual {
  fr: string
  en: string
}

const f = (fr: string, en: string): KpiBilingual => ({ fr, en })

/** Le vocabulaire des sources : une table ou une colonne → un mot de métier. */
export const KPI_SOURCE_WORDS: Readonly<Record<string, KpiBilingual>> = {
  accounts: f('comptes', 'accounts'),
  'accounts.recent_signals': f('signaux des comptes', 'account signals'),
  'accounts.sector': f('secteur des comptes', 'account sectors'),
  account_partners: f('partenaires des comptes', 'account partners'),
  action_plans: f('plans d’action', 'action plans'),
  activities: f('activités', 'activities'),
  consultant_skills: f('compétences des consultants', 'consultant skills'),
  consultants: f('consultants', 'consultants'),
  contacts: f('contacts', 'contacts'),
  crm_connections: f('CRM branché', 'connected CRM'),
  decision_gate_crossings: f('passages de décision', 'decision passages'),
  google_connections: f('messagerie Google branchée', 'connected Google mailbox'),
  import_sessions: f('imports', 'imports'),
  interviews: f('entretiens', 'interviews'),
  invoice_readiness: f('suivi de facturation', 'invoicing follow-up'),
  microsoft_connections: f('messagerie Microsoft branchée', 'connected Microsoft mailbox'),
  mission_assignments: f('affectations', 'assignments'),
  mission_timesheets: f('relevés d’activité', 'timesheets'),
  missions: f('missions', 'missions'),
  notifications: f('notifications', 'notifications'),
  opportunities: f('projets', 'projects'),
  'opportunities.stage_entered_at': f('date d’entrée dans l’étape des projets', 'date projects entered their stage'),
  profiles: f('profils', 'profiles'),
  proactivity_counters: f('compteurs de proactivité', 'proactivity counters'),
  project_needs: f('besoins projet', 'project needs'),
  proofs: f('preuves', 'proofs'),
  routine_subscriptions: f('routines activées', 'enabled routines'),
  shortlists: f('shortlists', 'shortlists'),
  skill_alias_library: f('référentiel de compétences', 'skills referential'),
  submission_feedback: f('retours sur candidatures', 'feedback on submissions'),
  submissions: f('candidatures', 'submissions'),
  subscriptions: f('abonnement', 'subscription'),
  tasks: f('tâches', 'tasks'),
  user_actions: f('actions des membres', 'member actions'),
}

/** La source brute (`a, b.c`) → une phrase sans identifiant. Jette si un mot manque. */
export function plainSourceOf(raw: string, kpiKey: string): KpiBilingual {
  const words = raw.split(',').map(part => {
    const word = KPI_SOURCE_WORDS[part.trim()]
    if (!word) throw new Error(`${kpiKey}: source « ${part.trim()} » sans mot de métier dans KPI_SOURCE_WORDS`)
    return word
  })
  return { fr: words.map(w => w.fr).join(', '), en: words.map(w => w.en).join(', ') }
}

export const KPI_PLAIN_FORMULAS: Readonly<Record<string, KpiBilingual>> = {
  accounts_opened: f(
    'Nombre de comptes passés en priorisé pendant la période.',
    'Number of accounts moved to prioritised during the period.',
  ),
  pipeline_amount: f(
    'Somme des montants saisis sur les projets des quatre étapes encore en jeu.',
    'Sum of the amounts entered on projects in the four stages still in play.',
  ),
  stage_age_days: f(
    'Médiane du temps passé dans l’étape actuelle, sur les projets ouverts.',
    'Median time spent in the current stage, across open projects.',
  ),
  accounts_without_next_action: f(
    'Part des comptes suivis sans tâche ni rappel à venir.',
    'Share of followed accounts with no upcoming task or reminder.',
  ),
  signal_to_action_days: f(
    'Médiane du délai entre la détection d’un signal et la première action qui le suit.',
    'Median delay between a signal being detected and the first action that follows it.',
  ),
  detected_to_qualified: f(
    'Part des projets détectés qui atteignent l’étape « qualifié ».',
    'Share of detected projects that reach the “qualified” stage.',
  ),
  meetings_held: f('Nombre de rendez-vous tenus pendant la période.', 'Number of meetings held during the period.'),
  reply_rate: f('Part des contacts relancés par e-mail qui ont répondu.', 'Share of contacts emailed that replied.'),
  projects_won: f('Nombre de projets gagnés pendant la période.', 'Number of projects won during the period.'),
  win_rate: f(
    'Projets gagnés ÷ (gagnés + perdus) ; les projets ouverts ne comptent dans aucun des deux.',
    'Won ÷ (won + lost); open projects count in neither.',
  ),
  rfp_win_rate: f('Appels d’offres gagnés ÷ appels d’offres remis.', 'Tenders won ÷ tenders submitted.'),
  rank1_access_obtained: f(
    'Nombre d’accès direct au décideur obtenus pendant la période.',
    'Number of direct accesses to the decision-maker obtained during the period.',
  ),
  known_availability_rate: f(
    'Part des consultants actifs dont on sait déduire la disponibilité.',
    'Share of active consultants whose availability can be worked out.',
  ),
  need_to_shortlist_days: f(
    'Médiane du délai entre la réception d’un besoin et sa shortlist.',
    'Median delay between receiving a need and its shortlist.',
  ),
  shortlist_to_submission_days: f(
    'Médiane du délai entre la shortlist et la première candidature envoyée.',
    'Median delay between the shortlist and the first submission sent.',
  ),
  needs_without_shortlist: f(
    'Part des besoins ouverts qui n’ont encore aucune shortlist.',
    'Share of open needs that still have no shortlist.',
  ),
  unstaffable_rate: f(
    'Part des besoins tranchés jugés non staffables, ventilée par motif.',
    'Share of settled needs judged unstaffable, broken down by reason.',
  ),
  proven_skills_rate: f(
    'Part des compétences prouvées par une mission réelle.',
    'Share of skills proven by an actual mission.',
  ),
  profiles_per_need: f(
    'Médiane du nombre de profils proposés par besoin.',
    'Median number of profiles proposed per need.',
  ),
  submission_win_rate: f(
    'Candidatures acceptées ÷ (acceptées + refusées avec motif) ; les sans-retour sont exclues.',
    'Accepted ÷ (accepted + refused with a reason); unanswered ones are left out.',
  ),
  time_to_feedback_days: f(
    'Médiane du délai entre l’envoi d’une candidature et le premier retour du client.',
    'Median delay between sending a submission and the client’s first feedback.',
  ),
  interview_conversion: f(
    'Part des entretiens ayant une issue qui aboutissent à un placement.',
    'Share of interviews with an outcome that end in a placement.',
  ),
  time_to_fill_days: f(
    'Médiane du délai entre la réception d’un besoin et le démarrage de la mission.',
    'Median delay between receiving a need and the mission starting.',
  ),
  missions_active: f('Nombre de missions en cours.', 'Number of missions in progress.'),
  missions_without_end_date: f(
    'Part des missions en cours sans date de fin.',
    'Share of missions in progress with no end date.',
  ),
  missions_ending_without_plan: f(
    'Nombre de missions qui se terminent sous 30 jours sans tâche de renouvellement.',
    'Number of missions ending within 30 days with no renewal task.',
  ),
  bench_rate: f(
    'Part des consultants sans affectation en cours, parmi ceux dont l’affectation est renseignée.',
    'Share of consultants with no current assignment, among those whose assignment is recorded.',
  ),
  bench_duration_days: f(
    'Médiane du temps écoulé depuis la fin de la dernière affectation, pour les consultants en intercontrat.',
    'Median time since the last assignment ended, for consultants on the bench.',
  ),
  timesheets_on_time: f(
    'Part des relevés d’activité déposés avant le cinquième jour du mois suivant.',
    'Share of timesheets filed before the fifth day of the following month.',
  ),
  timesheet_gaps: f(
    'Part des relevés présentant un écart qui n’ont aucune explication.',
    'Share of timesheets showing a gap that have no explanation.',
  ),
  missions_at_risk: f(
    'Nombre de missions dont le score de risque calculé dépasse le seuil.',
    'Number of missions whose computed risk score is above the threshold.',
  ),
  unmeasurable_missions: f(
    'Part des missions en cours dont moins de trois axes de risque sont renseignés.',
    'Share of missions in progress with fewer than three risk axes filled in.',
  ),
  renewal_rate: f(
    'Part des missions arrivées à échéance qui ont été prolongées.',
    'Share of missions past their end date that were extended.',
  ),
  assignments_without_rate: f(
    'Nombre d’affectations en cours sans tarif journalier.',
    'Number of current assignments with no daily rate.',
  ),
  client_nps: f(
    'Moyenne des notes recueillies auprès des clients, avec le nombre de répondants.',
    'Average of the scores collected from clients, with the number of respondents.',
  ),
  consultant_nps: f(
    'Moyenne des notes recueillies auprès des consultants, avec le nombre de répondants.',
    'Average of the scores collected from consultants, with the number of respondents.',
  ),
  delivery_incidents: f(
    'Nombre d’incidents déclarés, rapporté aux missions en cours.',
    'Number of incidents declared, relative to missions in progress.',
  ),
  proofs_collected: f('Nombre de preuves créées pendant la période.', 'Number of proofs created during the period.'),
  proofs_usable: f('Part des preuves utilisables telles quelles.', 'Share of proofs usable as they are.'),
  proofs_reused: f(
    'Part des preuves utilisables rattachées à au moins un projet.',
    'Share of usable proofs attached to at least one project.',
  ),
  sector_coverage: f(
    'Nombre de secteurs distincts couverts par au moins une preuve utilisable.',
    'Number of distinct sectors covered by at least one usable proof.',
  ),
  partners_identified: f(
    'Part des comptes suivis pour lesquels au moins un partenaire est identifié.',
    'Share of followed accounts with at least one partner identified.',
  ),
  skills_referential_coverage: f(
    'Part des compétences rattachées à un terme du référentiel.',
    'Share of skills linked to a term of the referential.',
  ),
  pending_skill_aliases: f(
    'Nombre d’intitulés de compétence en attente de rattachement au référentiel.',
    'Number of skill names waiting to be linked to the referential.',
  ),
  accounts_with_plan: f(
    'Part des comptes prioritaires qui ont un plan récent.',
    'Share of priority accounts with a recent plan.',
  ),
  rex_per_mission: f(
    'Nombre de retours d’expérience par mission terminée sur la période.',
    'Number of lessons-learned write-ups per mission completed over the period.',
  ),
  proof_to_win_contribution: f(
    'Part des projets gagnés auxquels une preuve est rattachée.',
    'Share of won projects with a proof attached.',
  ),
  revenue_signed: f(
    'Somme des montants des projets gagnés — jamais tarif journalier × durée.',
    'Sum of the amounts of won projects — never daily rate × duration.',
  ),
  revenue_produced: f(
    'Jours travaillés × tarif journalier de la mission, additionnés.',
    'Days worked × the mission’s daily rate, added up.',
  ),
  revenue_invoiced: f('Somme des montants facturés.', 'Sum of the amounts invoiced.'),
  revenue_collected: f('Somme des montants effectivement encaissés.', 'Sum of the amounts actually collected.'),
  gross_margin: f(
    'Marge (tarif − coût) × jours ÷ chiffre d’affaires, sur les missions chiffrées.',
    'Margin (rate − cost) × days ÷ revenue, over missions with figures.',
  ),
  unmeasured_margin: f(
    'Part des missions en cours sans tarif ou sans coût renseigné.',
    'Share of missions in progress with no rate or no cost entered.',
  ),
  timesheets_received: f(
    'Part des relevés attendus qui sont déposés ou validés ; un forfait n’attend aucun relevé.',
    'Share of expected timesheets filed or validated; a fixed-price mission expects none.',
  ),
  dso_days: f(
    'Médiane du délai entre la facture et son paiement, sur les factures payées et correctement datées.',
    'Median delay between invoice and payment, over paid, correctly dated invoices.',
  ),
  client_concentration_top_account: f(
    'Part du chiffre d’affaires produit portée par le premier client.',
    'Share of produced revenue carried by the top client.',
  ),
  revenue_growth: f(
    'Évolution du chiffre d’affaires produit entre le mois précédent et le mois courant.',
    'Change in produced revenue between the previous month and the current one.',
  ),
  signup_to_first_import_days: f(
    'Médiane du délai entre l’inscription et le premier import.',
    'Median delay between signing up and the first import.',
  ),
  auto_captured_activities: f(
    'Part des activités captées automatiquement plutôt que saisies à la main.',
    'Share of activities captured automatically rather than typed in by hand.',
  ),
  connectors_operational: f(
    'Part des outils branchés dont une lecture récente est prouvée.',
    'Share of connected tools with a recent successful read.',
  ),
  active_members: f(
    'Part des sièges occupés dont le titulaire a agi dans les 14 derniers jours.',
    'Share of occupied seats whose holder acted in the last 14 days.',
  ),
  credits_consumed_ratio: f(
    'Comptes analysés ÷ (quota de l’abonnement + report + recharges).',
    'Accounts analysed ÷ (subscription quota + carry-over + top-ups).',
  ),
  routines_active: f(
    'Part des routines disponibles qui sont activées.',
    'Share of available routines that are enabled.',
  ),
  proactivity_suppressed: f(
    'Part des notifications candidates retenues plutôt qu’envoyées.',
    'Share of candidate notifications held back rather than sent.',
  ),
}
