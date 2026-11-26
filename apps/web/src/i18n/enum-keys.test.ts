import {
  ACTIVITY_KINDS,
  CONTACT_STOP_REASONS,
  includedActions,
  DECISION_GATES,
  GATE_DECISIONS,
  contactSourceSchema,
  EXCLUSION_REASONS,
  INTERVENTION_KINDS,
  LAURA_INTERVENTIONS,
  memoryItemKinds,
  REPLY_FEEDBACK_CORRECTION_SCOPES,
  REPLY_FEEDBACK_REASONS,
  REPLY_FEEDBACK_VERDICTS,
  REPLY_PREFERENCE_OPTIONS,
  TARGET_ITEM_KINDS,
  TARGET_PRIORITIES,
  TARGET_PROVENANCES,
  TARGET_WORK_STATUSES,
} from '@bellum/contracts'
import { SECTION_KEYS, TAB_KEYS } from '@/features/accounts/view/account-detail/components/AccountDetailTabsBar'
import {
  CATALOGUE_KEYS,
  LEXICON_CONCEPTS,
  LEXICON_OUT_OF_SCOPE,
  LEXICON_VIOLATIONS,
  CONTACT_SCORE_CRITERIA,
  CONTRACT_KINDS,
  NEED_SOURCES,
  NEED_URGENCIES,
  PARTNER_RANKS,
  PARTNER_RELATIONSHIPS,
  PRIORITY_GATES,
  PROJECT_CONFIDENCE_LEVELS,
  PROJECT_KINDS,
  PROJECT_NEED_STATUSES,
  PROJECT_STAGES,
  PROOF_SCOPES,
  PROOF_STRENGTHS,
  TECHNO_PREVALENCE_TIERS,
  CLIENT_HISTORY_FLAGS,
  CONSENT_STATES,
  CONSULTANT_CONTRACTS,
  CONSULTANT_SOURCES,
  ANONYMISATION_RULES,
  CV_DETECTIONS,
  CV_VERSION_KINDS,
  REMOTE_PREFERENCES,
  TRAVEL_ACCEPTANCES,
  DERIVED_AVAILABILITIES,
  ENGAGEMENT_KINDS,
  TALENT_DUPLICATE_REASONS,
  TALENT_DUPLICATE_ACTIONS,
  TALENT_IDENTITY_STATES,
  TALENT_COMPARED_FIELDS,
  TALENT_POOL_SEGMENTS,
  TALENT_REVIEW_STATUSES,
  TALENT_VIEWS,
  SKILL_LEVELS,
  SKILL_SOURCES,
  TALENT_KINDS,
  outreachDisplayStatusSchema,
  accountSizeValues,
  actionHistoryCategorySchema,
  decisionLevelValues,
  missionStatusSchema,
  outreachSequenceStatusSchema,
  outreachStepKindSchema,
  OUTREACH_CALL_OUTCOMES,
  OUTREACH_ENROLLMENT_EXCLUSION_CODES,
  OUTREACH_LINKEDIN_INVITE_OUTCOMES,
  watchlistRuleKinds,
  workspaceActivityEventNames,
  workspaceMarketValues,
  workspacePermissionValues,
  toolFamilyValues,
  CHAIN_SUBJECT_TYPES,
  COMMAND_DATA_SOURCES,
  COMMAND_MOMENTS,
  BLOCKER_ACTIONS,
  INVOICE_BLOCKERS,
  INVOICE_READINESS_STATES,
  MISSION_CHANNELS,
  REMINDER_TONES,
  RENEWAL_WINDOWS,
  SUBMISSION_STAGES,
  TIMESHEET_EXCEPTION_TIMELINE_KEYS,
  TIMESHEET_STATUSES,
} from '@bellum/contracts'
import { resources } from '@/i18n/resources'
import { COMPANY_AGE_BUCKETS, HEADCOUNT_RANGES, SIGNAL_SOURCES } from '@/features/discover/lib/discover-types'
import { RECENCY_WINDOWS } from '@/features/discover/lib/discover-query'

/**
 * Garde-fou « énumération complète ».
 *
 * `parity.test.ts` verrouille la parité FR↔EN : il attrape une clé présente
 * d'un côté et absente de l'autre. Il ne peut PAS attraper une clé absente des
 * DEUX catalogues — et c'est précisément le bug qu'on a eu en prod :
 * `HEADCOUNT_RANGES` contient `'any'`, `RegistryFilters.tsx` rend
 * ``t(`headcount.${range}`)``, mais ni `fr/discover.json` ni `en/discover.json`
 * ne définissaient `headcount.any`. L'écran Découvrir affichait donc la chaîne
 * brute `headcount.any` dans le menu « Tranche d'effectif ».
 *
 * Cette classe de bug est invisible tant qu'on ne sélectionne pas l'option
 * concernée : le seul moyen fiable de la prévenir est de confronter la SOURCE
 * DE VÉRITÉ de l'énumération (la constante TypeScript qui alimente le `.map()`)
 * au catalogue de traductions.
 *
 * Pour couvrir un nouveau menu construit avec une clé dynamique
 * ``t(`prefixe.${valeur}`)`` : ajouter une ligne au tableau ci-dessous. Ne PAS
 * y inscrire les appels qui passent déjà un `defaultValue` (ils sont gardés par
 * construction), ni ceux dont la valeur vient d'une chaîne serveur libre (leur
 * ensemble n'est pas connu statiquement).
 */

type EnumKeySpec = {
  /** Repère lisible dans le rapport d'échec : le site d'appel couvert. */
  callSite: string
  /** Namespace i18n du composant (`useTranslation('<ns>')`). */
  namespace: keyof typeof resources.fr
  /** Préfixe de la clé, sans le point final. */
  prefix: string
  /** Valeurs possibles de la variable interpolée. */
  values: readonly string[]
}

/**
 * Les gestes distincts de `BLOCKER_ACTIONS` (§8 d'`invoice-readiness.ts`).
 * Plusieurs bloqueurs partagent le même geste — `explain_gap` lève à la fois
 * `timesheet_anomalies` et `unexplained_gap` — donc la liste se dérive des
 * VALEURS de la table, pas de ses clés (qui sont déjà couvertes par
 * `INVOICE_BLOCKERS` ci-dessous).
 */
const BLOCKER_ACTION_KEYS: readonly string[] = Array.from(
  new Set(Object.values(BLOCKER_ACTIONS).map(({ action }) => action)),
)

/**
 * `features/missions/collections.ts` n'exporte que des TYPES
 * (`CollectionAction`, `CollectionStatus`) — aucune valeur d'exécution à
 * importer, donc les trois listes ci-dessous sont recopiées depuis les sites
 * d'appel de `CollectionsPage.tsx`, à l'identique de `chatCommands.states`
 * plus bas. `remind` est exclu de `COLLECTION_ACTION_KINDS` : il a son propre
 * rendu (`invoiceReadiness.reminders.rank`) et n'atteint jamais
 * `collections.actions.${…}`.
 */
const COLLECTION_ACTION_KINDS: readonly string[] = ['resolve_dispute', 'set_due_date', 'escalate_to_human', 'wait']
const COLLECTION_STATUS_VALUES: readonly string[] = ['paid', 'disputed', 'overdue', 'pending']
const COLLECTION_BUCKET_KEYS: readonly string[] = ['paid', 'pending', 'overdue', 'disputed']

const ENUM_KEYS: EnumKeySpec[] = [
  {
    /**
     * `gate_decision` a été ajouté à `ACTIVITY_KINDS` par le journal des portes
     * de décision (PDF 1) SANS son libellé, ni FR ni EN. C'était le seul des
     * onze à ne pas en avoir : une porte franchie s'affichait sur la timeline
     * d'un compte avec la clé brute `kinds.gate_decision`.
     *
     * `TimelinePanel` interpole sans `defaultValue` — la clé manquante se voit
     * donc en clair, mais seulement le jour où une porte est franchie sur
     * l'objet qu'on regarde. Invisible autrement.
     */
    callSite: 'features/activities/view/TimelinePanel.tsx — kinds.${activity.kind}',
    namespace: 'activities',
    prefix: 'kinds',
    values: ACTIVITY_KINDS,
  },
  {
    /**
     * `contactSourceLabel` retombe sur la valeur BRUTE quand la clé manque
     * (`defaultValue: source`). Résultat : `hunter`, `lusha` et `demo` — ajoutés
     * à l'énumération sans traduction — s'affichaient EN CLAIR sur une fiche
     * contact, alors que la règle du 02/08 interdit tout nom de fournisseur
     * d'enrichissement côté client. Le repli est bon (ne jamais inventer) ; ce
     * qui manquait, c'est une garde qui exige la clé.
     */
    callSite: 'features/contacts/lib/contactProvenance.ts — lifecycle.sources.${source}',
    namespace: 'contacts',
    prefix: 'lifecycle.sources',
    values: contactSourceSchema.options,
  },
  {
    /**
     * Les CINQ raisons, pas les trois déclarables. L'écran n'en PROPOSE que
     * trois (`unsubscribed` et `bounced` viennent du serveur de messagerie,
     * personne ne les déclare), mais il RELIT les cinq : un refus posé par un
     * rebond s'affiche sur la même carte, et sans sa clé il s'y afficherait
     * `stop.reason.bounced` en clair.
     */
    callSite: 'features/contacts/view/contact-detail/components/ContactStopCard.tsx — stop.reason.${reason}',
    namespace: 'contacts',
    prefix: 'stop.reason',
    values: CONTACT_STOP_REASONS,
  },
  {
    // #1919.1 → .6 — les six retours sous une réponse de Laura.
    callSite: 'features/chat/view/ReplyFeedback.tsx — feedback.verdict.${verdict}',
    namespace: 'chat',
    prefix: 'feedback.verdict',
    values: REPLY_FEEDBACK_VERDICTS,
  },
  {
    // #1919.8 → .13, #1928.7 — les motifs d'un « pas pertinent ».
    callSite: 'features/chat/view/ReplyFeedback.tsx — feedback.reason.${reason}',
    namespace: 'chat',
    prefix: 'feedback.reason',
    values: REPLY_FEEDBACK_REASONS,
  },
  {
    // #1919.7 — le périmètre d'une correction.
    callSite: 'features/chat/view/ReplyFeedback.tsx — feedback.scope.${scope}',
    namespace: 'chat',
    prefix: 'feedback.scope',
    values: REPLY_FEEDBACK_CORRECTION_SCOPES,
  },
  {
    // #3189 (LAU-FINAL-195) — la clé « tenders » manquait ici (visible dans
    // les logs console du retour bêta : `[i18n] clé manquante … "composer.
    // connector.family.tenders"`) alors que `families.tenders` équivalent de
    // `chatCommands.json` était déjà gardé plus bas — deux emplacements pour
    // la même énumération, un seul gardé.
    callSite: 'features/chat/view/Chat.tsx — composer.connector.family.${family}',
    namespace: 'chat',
    prefix: 'composer.connector.family',
    values: toolFamilyValues,
  },
  {
    callSite: 'features/discover/view/RegistryFilters.tsx — headcount.${range}',
    namespace: 'discover',
    prefix: 'headcount',
    values: HEADCOUNT_RANGES,
  },
  {
    callSite: 'features/discover/view/RegistryFilters.tsx — age.${bucket}',
    namespace: 'discover',
    prefix: 'age',
    values: COMPANY_AGE_BUCKETS,
  },
  {
    callSite: 'features/discover/view/SignalsFilters.tsx — signalTypes.${source}',
    namespace: 'discover',
    prefix: 'signalTypes',
    values: SIGNAL_SOURCES,
  },
  {
    callSite: 'features/discover/view/SignalsFilters.tsx — signalsMode.recency.${days}',
    namespace: 'discover',
    prefix: 'signalsMode.recency',
    values: RECENCY_WINDOWS.map(String),
  },
  {
    callSite: 'features/discover/view/ProfileSizeNotice.tsx — sidebar.size.${proposed}',
    namespace: 'discover',
    prefix: 'sidebar.size',
    values: accountSizeValues,
  },
  {
    callSite: 'features/discover/view/DiscoverSidebar.tsx — sidebar.level.${icp.decisionLevel}',
    namespace: 'discover',
    prefix: 'sidebar.level',
    values: decisionLevelValues,
  },
  /**
   * Le second bug réel trouvé par le balayage. `actionHistoryCategorySchema`
   * comporte `'other'`, et `apps/api/.../actions.service.ts` le renvoie
   * réellement dans sa branche `default` — la ligne « Catégorie » du détail
   * d'une action affichait donc la chaîne brute `tabs.other`.
   * ⚠️ L'ensemble à couvrir est celui du SCHÉMA (6 valeurs), pas la liste
   * locale `actionHistoryCategoryKeys` de la barre d'onglets, qui omet
   * délibérément `'other'` (on ne filtre pas sur « Autres »). C'est cet écart
   * entre les deux listes qui avait laissé passer le trou.
   */
  {
    callSite: 'features/action-history/view/ActionHistoryDetailPage.tsx — tabs.${category}',
    namespace: 'actions',
    prefix: 'tabs',
    values: actionHistoryCategorySchema.options,
  },
  {
    callSite: 'features/contacts/.../ContactScoreBreakdown.tsx — score.breakdown.criteria.${key}',
    namespace: 'contacts',
    prefix: 'score.breakdown.criteria',
    values: CONTACT_SCORE_CRITERIA.map(criterion => criterion.key),
  },
  {
    callSite: 'features/contacts/.../ContactOutreachCard.tsx — stepKind.${step.kind}',
    namespace: 'outreach',
    prefix: 'stepKind',
    values: outreachStepKindSchema.options,
  },
  // Lot L-B (#4165) — les issues déclarées d'une étape (invitation acceptée, issue d'un appel) et
  // les raisons d'exclusion à l'inscription : deux vocabulaires fermés du contrat, lus par clé dynamique.
  {
    callSite: 'features/outreach/view/StepChannelGestures.tsx — multichannel.outcome.${option}',
    namespace: 'outreach',
    prefix: 'multichannel.outcome',
    values: [...OUTREACH_LINKEDIN_INVITE_OUTCOMES, ...OUTREACH_CALL_OUTCOMES],
  },
  {
    callSite: 'features/outreach/view/EnrollmentExclusions.tsx — multichannel.exclusions.reason.${exclusion.code}',
    namespace: 'outreach',
    prefix: 'multichannel.exclusions.reason',
    values: OUTREACH_ENROLLMENT_EXCLUSION_CODES,
  },
  {
    callSite: 'features/contacts/.../ContactOutreachCard.tsx — status.${sequence.status}',
    namespace: 'outreach',
    prefix: 'status',
    values: outreachSequenceStatusSchema.options,
  },
  {
    callSite: 'features/team/view/ActivityLogView.tsx — events.${item.event}',
    namespace: 'activityLog',
    prefix: 'events',
    values: workspaceActivityEventNames,
  },
  {
    /**
     * Les ONZE permissions, et pas seulement celles qu'un rôle courant donne.
     * Une clé manquante afficherait `permissions.value.finance:read:own` EN
     * CLAIR dans un écran de DROITS — l'endroit du produit où une chaîne
     * technique se lit le plus mal.
     */
    callSite: 'features/team/view/MemberPermissionsDialog.tsx — permissions.value.${permission}',
    namespace: 'team',
    prefix: 'permissions.value',
    values: workspacePermissionValues,
  },
  {
    callSite: 'features/search/components/SearchCountrySelector.tsx — country.names.${code}',
    namespace: 'search',
    prefix: 'country.names',
    values: workspaceMarketValues,
  },
  {
    callSite: 'features/watchlist/rules/WatchlistRulesSection.tsx — rules.kindLabels.${kind}',
    namespace: 'watchlist',
    prefix: 'rules.kindLabels',
    values: watchlistRuleKinds,
  },
  {
    callSite: 'features/watchlist/rules/WatchlistRulesSection.tsx — rules.placeholders.${kind}',
    namespace: 'watchlist',
    prefix: 'rules.placeholders',
    values: watchlistRuleKinds,
  },
  {
    // `missions.json` déclarait `draft` et `at_risk`, qui n'existent pas dans
    // l'enum, et oubliait `onboarding`, `paused` et `terminated` : le badge de
    // l'écran Missions affichait donc la clé brute pour trois statuts sur six.
    // Rien ne l'attrapait, parce que l'enum n'était pas inscrit ici.
    callSite: 'features/missions/view/MissionsPage.tsx — status.${mission.status}',
    namespace: 'missions',
    prefix: 'status',
    values: missionStatusSchema.options,
  },
  {
    /**
     * Les CINQ canaux d'une mission. Le sélecteur des conditions commerciales
     * interpole SANS `defaultValue` : une valeur ajoutée au contrat sans son
     * libellé imprimerait `finance.channels.portage` dans une liste déroulante.
     *
     * L'énumération n'était inscrite NULLE PART ici, alors qu'elle est rendue
     * sur deux écrans. C'est le motif « une garde protège une règle, elle ne
     * l'invente pas » : la règle existait — un menu ne montre jamais une clé —
     * et personne ne la tenait pour ce menu-là. Elle s'est vue le jour où
     * `portage` est devenu le cinquième canal.
     *
     * ⚠️ Le pendant côté pilotage (`FinancePanel`, `pilotage:finance.channels`)
     * passe un `defaultValue` et n'entre donc PAS dans cette table, par la règle
     * écrite en tête de fichier. Son libellé est quand même exigé, mais par
     * `parity.test.ts` : les deux catalogues doivent coïncider.
     */
    callSite: 'features/missions/view/MissionDetailSheet.tsx — finance.channels.${channel}',
    namespace: 'missions',
    prefix: 'finance.channels',
    values: MISSION_CHANNELS,
  },
  {
    // Les onze états d'un besoin (PDF 2 §7.4, décision D13 : en base). Inscrits
    // ici DÈS leur création : c'est exactement la famille de désalignement qui
    // a fait afficher `status.undefined` sur trois statuts de mission.
    callSite: 'features/projects — needStatus.${need.status}',
    namespace: 'projects',
    prefix: 'needStatus',
    values: PROJECT_NEED_STATUSES,
  },
  /**
   * Les clés dynamiques des écrans du PDF 2. Toutes inscrites d'un coup, parce
   * que la recette en production a montré la même faute deux fois sur le même
   * écran : `t('stage.${stage}')` là où le catalogue dit `stage.states.*`, et
   * `t('kind.${kind}')` là où il dit `kinds.*`. Rien ne l'attrapait — un chemin
   * de clé faux ne casse ni le type ni le rendu, il affiche la clé.
   */
  {
    callSite: 'features/accounts/.../TabProjects.tsx — stage.states.${row.stage}',
    namespace: 'projects',
    prefix: 'stage.states',
    values: PROJECT_STAGES,
  },
  {
    callSite: 'features/accounts/.../TabProjects.tsx — kinds.${row.kind}',
    namespace: 'projects',
    prefix: 'kinds',
    values: PROJECT_KINDS,
  },
  {
    callSite: 'features/accounts/.../TabProjects.tsx — provenance.confidence.${row.confidence}',
    namespace: 'projects',
    prefix: 'provenance.confidence',
    values: PROJECT_CONFIDENCE_LEVELS,
  },
  {
    callSite: 'features/projects/open-needs — openNeeds.contract.${row.contract_kind}',
    namespace: 'projects',
    prefix: 'openNeeds.contract',
    values: CONTRACT_KINDS,
  },
  {
    callSite: 'features/projects/open-needs — openNeeds.urgency.${row.urgency}',
    namespace: 'projects',
    prefix: 'openNeeds.urgency',
    values: NEED_URGENCIES,
  },
  {
    /**
     * Les douze ORIGINES d'un besoin (§7.2). L'énumération existait dans le
     * contrat depuis des mois sans qu'aucun écran ni service ne la lise : la
     * colonne était écrite, sélectionnée, servie au navigateur — et jetée.
     *
     * ⚠️ Bloc DISTINCT de `projects:provenance.sources.*`, qui porte CINQ clés
     * d'un tout autre enum (`pain` / `challenge` / `program` / `signal` /
     * `implication`). Les réutiliser aurait donné sept clés manquantes et cinq
     * libellés faux — la pire des deux, puisqu'un libellé faux s'affiche.
     */
    callSite: 'features/projects/open-needs — openNeeds.source.${row.source}',
    namespace: 'projects',
    prefix: 'openNeeds.source',
    values: NEED_SOURCES,
  },
  {
    callSite: 'features/outreach/view/SequencesPage.tsx — status.${derived}',
    namespace: 'outreach',
    prefix: 'status',
    values: outreachDisplayStatusSchema.options,
  },
  {
    callSite: 'features/accounts/gate/AccountGateControl.tsx — gate.state.${gate}',
    namespace: 'accounts',
    prefix: 'gate.state',
    values: PRIORITY_GATES,
  },
  /**
   * #2115.21-27 — les sous-parties du dossier compte et leurs sept sections.
   *
   * `AccountDetailTabsBar` écrit `t(`tabs.${tab}`)` et `t(`tabSections.
   * ${section}`)` : une clé d'onglet ajoutée à `TAB_KEYS` sans son libellé
   * afficherait la CHAÎNE BRUTE `tabs.programs` dans la barre — exactement le
   * défaut qui a mis `integrations.disconnect` en production le 01/09. Aucune
   * garde ne pouvait le voir : les deux appels sont dynamiques.
   */
  {
    callSite: 'features/accounts/.../AccountDetailTabsBar.tsx — tabs.${tab}',
    namespace: 'accounts',
    prefix: 'tabs',
    values: TAB_KEYS,
  },
  {
    callSite: 'features/accounts/.../AccountDetailTabsBar.tsx — tabSections.${section}',
    namespace: 'accounts',
    prefix: 'tabSections',
    values: SECTION_KEYS,
  },
  {
    callSite: 'features/accounts/.../TabPartners.tsx — rank.${partner.rank}',
    namespace: 'partners',
    prefix: 'rank',
    values: PARTNER_RANKS,
  },
  {
    callSite: 'features/accounts/.../TabPartners.tsx — relationship.${partner.relationship}',
    namespace: 'partners',
    prefix: 'relationship',
    values: PARTNER_RELATIONSHIPS,
  },
  {
    callSite: 'features/accounts/.../TabProofs.tsx — strength.${proof.strength}',
    namespace: 'capitalisation',
    prefix: 'strength',
    values: PROOF_STRENGTHS,
  },
  {
    callSite: 'features/accounts/.../TabProofs.tsx — scope.${proof.scope}',
    namespace: 'capitalisation',
    prefix: 'scope',
    values: PROOF_SCOPES,
  },
  {
    callSite: 'features/accounts/.../TabProofs.tsx — proofs.prevalence.${group.tier}',
    namespace: 'capitalisation',
    prefix: 'proofs.prevalence',
    values: TECHNO_PREVALENCE_TIERS,
  },
  {
    callSite: 'features/catalogues/view/CataloguesPage.tsx — names.${catalogue.key}',
    namespace: 'catalogues',
    prefix: 'names',
    values: CATALOGUE_KEYS,
  },
  {
    callSite: 'features/catalogues/view/CataloguesPage.tsx — descriptions.${catalogue.key}',
    namespace: 'catalogues',
    prefix: 'descriptions',
    values: CATALOGUE_KEYS,
  },
  {
    callSite: 'features/lexicon/view/LexiconPage.tsx — concepts.${concept}',
    namespace: 'lexicon',
    prefix: 'concepts',
    values: LEXICON_CONCEPTS,
  },
  {
    // Ce que le lexique NE FAIT PAS est AFFICHÉ : une entrée sans libellé
    // laisserait un trou là où l'écran promet d'être franc.
    callSite: 'features/lexicon/view/LexiconPage.tsx — outOfScope.items.${item}',
    namespace: 'lexicon',
    prefix: 'outOfScope.items',
    values: LEXICON_OUT_OF_SCOPE,
  },
  {
    callSite: 'features/lexicon/view/LexiconPage.tsx — violations.${violation.code}',
    namespace: 'lexicon',
    prefix: 'violations',
    values: LEXICON_VIOLATIONS,
  },
  {
    callSite: 'features/consultants/view/ConsultantsPage.tsx — kind.${row.kind}',
    namespace: 'consultants',
    prefix: 'kind',
    values: TALENT_KINDS,
  },
  {
    callSite: 'features/consultants/view/detail/TalentConsentTab.tsx — consent.states.${state}',
    namespace: 'consultants',
    prefix: 'consent.states',
    values: CONSENT_STATES,
  },
  {
    callSite: 'features/consultants/view/detail/TalentConsentTab.tsx — sources.${source}',
    namespace: 'consultants',
    prefix: 'sources',
    values: CONSULTANT_SOURCES,
  },
  {
    callSite: 'features/consultants/view/ConsultantMatchPanel.tsx — match.clientHistory.${flag}',
    namespace: 'consultants',
    prefix: 'match.clientHistory',
    values: CLIENT_HISTORY_FLAGS,
  },
  {
    callSite: 'features/consultants/view/studio/CvStudioPanel.tsx — studio.kinds.${kind}',
    namespace: 'consultants',
    prefix: 'studio.kinds',
    values: CV_VERSION_KINDS,
  },
  {
    callSite: 'features/consultants/view/studio/CvStudioPanel.tsx — studio.rules.${rule}',
    namespace: 'consultants',
    prefix: 'studio.rules',
    values: ANONYMISATION_RULES,
  },
  {
    callSite: 'features/consultants/view/parse/CvReviewPanel.tsx — parse.detections.${detection}',
    namespace: 'consultants',
    prefix: 'parse.detections',
    values: CV_DETECTIONS,
  },
  {
    callSite: 'features/consultants/view/CvDropZone.tsx — intake.duplicate.reasons.${reason}',
    namespace: 'consultants',
    prefix: 'intake.duplicate.reasons',
    values: TALENT_DUPLICATE_REASONS,
  },
  // #2327 — l'onglet Identité d'une fiche talent.
  {
    callSite: 'features/consultants/view/detail/TalentIdentityPanel.tsx — identity.states.${state}',
    namespace: 'consultants',
    prefix: 'identity.states',
    values: TALENT_IDENTITY_STATES,
  },
  {
    callSite: 'features/consultants/view/detail/TalentIdentityPanel.tsx — identity.actions.${action}',
    namespace: 'consultants',
    prefix: 'identity.actions',
    values: TALENT_DUPLICATE_ACTIONS,
  },
  {
    callSite: 'features/consultants/view/detail/TalentIdentityPanel.tsx — identity.consequences.${action}',
    namespace: 'consultants',
    prefix: 'identity.consequences',
    values: TALENT_DUPLICATE_ACTIONS,
  },
  {
    callSite: 'features/consultants/view/detail/TalentIdentityPanel.tsx — identity.fields.${field}',
    namespace: 'consultants',
    prefix: 'identity.fields',
    values: TALENT_COMPARED_FIELDS,
  },
  {
    callSite: 'features/consultants/view/ConsultantsPage.tsx — review.${status}',
    namespace: 'consultants',
    prefix: 'review',
    values: TALENT_REVIEW_STATUSES.map(status => (status === 'needs_review' ? 'needsReview' : 'qualified')),
  },
  {
    callSite: 'features/consultants/view/pool/TalentPoolPage.tsx — pool.segments.${segment}',
    namespace: 'consultants',
    prefix: 'pool.segments',
    // #2697 — `to_revalidate` n'a plus sa propre clé : le composant lit
    // `staffing.unknown` (déjà couvert plus bas), le MÊME libellé que le
    // badge de fiche. GA-26 : un réglage vit à un seul endroit — l'exclure
    // ici plutôt que de le déclarer deux fois avec le même texte.
    values: TALENT_POOL_SEGMENTS.filter(segment => segment !== 'to_revalidate'),
  },
  {
    callSite: 'features/consultants/view/pool/TalentPoolPage.tsx — pool.explain.${segment}',
    namespace: 'consultants',
    prefix: 'pool.explain',
    values: TALENT_POOL_SEGMENTS,
  },
  {
    callSite: 'features/consultants/view/TalentFilters.tsx — views.${view}',
    namespace: 'consultants',
    prefix: 'views',
    // #2697 — même exception que `pool.segments` juste au-dessus : cette vue
    // partage `staffing.unknown` avec le badge au lieu d'une clé `views.*` à
    // elle, qui aurait porté deux fois le même texte (GA-26).
    values: TALENT_VIEWS.filter(view => view !== 'to_revalidate'),
  },
  {
    callSite: 'features/consultants/view/ConsultantFormDialog.tsx — remote.${value}',
    namespace: 'consultants',
    prefix: 'remote',
    values: REMOTE_PREFERENCES,
  },
  // #1928.2/.3/.5/.6 — les quatre réglages de réponse de Laura : chaque valeur
  // du contrat naît avec son libellé, dans les deux langues.
  {
    callSite: 'features/memory/view/ReplyPreferencesSettings.tsx — memoryLedger.reply.replyLength.${value}',
    namespace: 'knowledge',
    prefix: 'memoryLedger.reply.replyLength',
    values: REPLY_PREFERENCE_OPTIONS.replyLength,
  },
  {
    callSite: 'features/memory/view/ReplyPreferencesSettings.tsx — memoryLedger.reply.replyTone.${value}',
    namespace: 'knowledge',
    prefix: 'memoryLedger.reply.replyTone',
    values: REPLY_PREFERENCE_OPTIONS.replyTone,
  },
  {
    callSite: 'features/memory/view/ReplyPreferencesSettings.tsx — memoryLedger.reply.replyFormat.${value}',
    namespace: 'knowledge',
    prefix: 'memoryLedger.reply.replyFormat',
    values: REPLY_PREFERENCE_OPTIONS.replyFormat,
  },
  {
    callSite: 'features/memory/view/ReplyPreferencesSettings.tsx — memoryLedger.reply.replySources.${value}',
    namespace: 'knowledge',
    prefix: 'memoryLedger.reply.replySources',
    values: REPLY_PREFERENCE_OPTIONS.replySources,
  },
  // #1962.2/.5/.7/.9/.10 — les sept natures de mémoire : chaque valeur du
  // contrat naît avec son libellé ET sa phrase d'aide, dans les deux langues.
  // Une nature ajoutée sans nom afficherait sa clé brute au registre et dans le
  // choix « Enregistrer comme… ».
  {
    callSite: 'features/memory/view/MemoryFactRow.tsx — memory.kind.${value}',
    namespace: 'knowledge',
    prefix: 'memory.kind',
    values: memoryItemKinds,
  },
  {
    callSite: 'features/chat/view/SaveReply.tsx — memory.kindHint.${value}',
    namespace: 'knowledge',
    prefix: 'memory.kindHint',
    values: memoryItemKinds,
  },
  {
    callSite: 'features/consultants/view/ConsultantFormDialog.tsx — travel.${value}',
    namespace: 'consultants',
    prefix: 'travel',
    values: TRAVEL_ACCEPTANCES,
  },
  {
    callSite: 'features/consultants/view/ConsultantFormDialog.tsx — engagement.${value}',
    namespace: 'consultants',
    prefix: 'engagement',
    values: ENGAGEMENT_KINDS,
  },
  {
    callSite: 'features/consultants/view/ConsultantFormDialog.tsx — contract.${value}',
    namespace: 'consultants',
    prefix: 'contract',
    values: CONSULTANT_CONTRACTS,
  },
  {
    callSite: 'features/consultants/view/TalentAvailabilityBadge.tsx — staffing.${derived}',
    namespace: 'consultants',
    prefix: 'staffing',
    values: DERIVED_AVAILABILITIES,
  },
  {
    callSite: 'features/consultants/view/ConsultantsPage.tsx — skills.levels.${skill.level}',
    namespace: 'consultants',
    prefix: 'skills.levels',
    values: SKILL_LEVELS,
  },
  {
    callSite: 'features/consultants/view/ConsultantsPage.tsx — skills.sources.${skill.source}',
    namespace: 'consultants',
    prefix: 'skills.sources',
    values: SKILL_SOURCES,
  },
  /*
   * Missions — les quatre énumérations que les écrans du PDF 5 rendent.
   *
   * Deux bloqueurs ajoutés au contrat le 21/08 se sont affichés en clé brute
   * sur l'écran de facturation, en production : la garde ne connaissait pas
   * cette liste. Une liste fermée qui traverse le fil doit être ICI, sinon la
   * prochaine valeur ajoutée s'affichera aussi telle quelle.
   */
  /*
   * Chaînes — les deux énumérations que l'écran des pistes rend.
   *
   * Le type de sujet s'affichait BRUT en production (« account »), trouvé en
   * recette live : la garde ne connaissait pas la liste, et une clé i18n
   * manquante ne se voit qu'à l'écran.
   */
  {
    callSite: 'features/chains/view/ChainsPage.tsx — panel.subjects.${chain.subjectType}',
    namespace: 'chains',
    prefix: 'panel.subjects',
    values: CHAIN_SUBJECT_TYPES,
  },
  /*
   * ⚠️ `panel.states.${run.state}` a disparu le 05/09/2026 (#1503), et l'entrée
   * avec lui. Un parcours n'a plus d'ÉTAT stocké : sa position se dérive de
   * l'objet métier à chaque lecture, et `CHAIN_RUN_STATES` ne décrit plus que
   * des lignes archivées que personne n'affiche. Garder l'entrée aurait exigé
   * quatre libellés pour un écran qui ne les rend nulle part — la moitié
   * symétrique du défaut que cette garde attrape.
   */
  /*
   * Bibliothèque de commandes — deux énumérations rendues par clé dynamique :
   * la catégorie d'une commande, et la FAMILLE d'outil qui lui manque. La
   * seconde est la plus exposée : elle n'apparaît que sur un espace dont un
   * connecteur manque, c'est-à-dire jamais pendant un développement.
   */
  {
    // #1913 — le rangement par défaut du catalogue : un moment sans libellé
    // afficherait sa clé brute en titre de section.
    callSite: 'features/chat-commands/view/CommandDrawerButton.tsx — moments.${moment}',
    namespace: 'chatCommands',
    prefix: 'moments',
    values: COMMAND_MOMENTS,
  },
  {
    // #5043 — les puces de moment de « Idées de demandes » : libellé court.
    callSite: 'features/chat-commands/view/CommandDrawerButton.tsx — momentsShort.${moment}',
    namespace: 'chatCommands',
    prefix: 'momentsShort',
    values: COMMAND_MOMENTS,
  },
  {
    // #1913.11 — « À partir de » : la donnée lue, dérivée des outils de la commande.
    callSite: 'features/chat-commands/view/CommandDrawerButton.tsx — dataSources.${source}',
    namespace: 'chatCommands',
    prefix: 'dataSources',
    values: COMMAND_DATA_SOURCES,
  },
  {
    callSite: 'features/chat-commands/view/CommandDrawerButton.tsx — families.${family}',
    namespace: 'chatCommands',
    prefix: 'families',
    values: toolFamilyValues,
  },
  {
    callSite: 'features/chat-commands/view/CommandLibraryPage.tsx — states.${availability.state}',
    namespace: 'chatCommands',
    prefix: 'states',
    values: ['degraded', 'unavailable'],
  },
  {
    callSite: 'features/missions/view/InvoiceReadinessPanel.tsx — readiness.blockers.${blocker}',
    namespace: 'missions',
    prefix: 'readiness.blockers',
    values: INVOICE_BLOCKERS,
  },
  {
    /**
     * Le geste qui lève chaque bloqueur. `BLOCKER_ACTIONS` (§8 du contrat)
     * porte dix gestes distincts pour onze bloqueurs — `explain_gap` en sert
     * deux — mais seuls trois avaient leur libellé : sept clés brutes
     * (`readiness.actions.ask_po`…) s'affichaient sur l'écran de facturation
     * à la place d'un geste, dans les deux langues.
     */
    callSite: 'features/missions/view/InvoiceReadinessPanel.tsx — readiness.actions.${target.action}',
    namespace: 'missions',
    prefix: 'readiness.actions',
    values: BLOCKER_ACTION_KEYS,
  },
  {
    callSite: 'features/missions/view/InvoiceReadinessPanel.tsx — readiness.states.${state}',
    namespace: 'missions',
    prefix: 'readiness.states',
    values: INVOICE_READINESS_STATES,
  },
  {
    callSite: 'features/missions/view/TimesheetsPage.tsx — cra.states.${line.status}',
    namespace: 'missions',
    prefix: 'cra.states',
    values: TIMESHEET_STATUSES,
  },
  {
    callSite: 'features/missions/view/MissionsPage.tsx — renewal.${mission.renewal}',
    namespace: 'missions',
    prefix: 'renewal',
    values: RENEWAL_WINDOWS,
  },
  {
    callSite: 'features/missions/view/PaymentReminderDue.tsx — invoiceReadiness.reminders.tones.${tone}',
    namespace: 'missions',
    prefix: 'invoiceReadiness.reminders.tones',
    values: REMINDER_TONES,
  },
  /**
   * Les trois entrées ci-dessous couvrent `CollectionsPage.tsx`, l'écran
   * d'encaissement — même domaine que `InvoiceReadinessPanel.tsx` ci-dessus, et
   * découvert en auditant « la garde couvre-t-elle toutes les énumérations qui
   * ont des libellés, ou seulement certaines ? ». Aucune des trois n'était
   * couverte : les trois passaient déjà, par coïncidence — mais `collections.ts`
   * exporte un TYPE (`CollectionAction`, `CollectionStatus`), pas une valeur
   * d'exécution, donc la liste se recopie ici, comme `chatCommands.states`
   * ci-dessus, plutôt que se dériver.
   */
  {
    callSite: 'features/missions/view/CollectionsPage.tsx — collections.actions.${action.kind}',
    namespace: 'missions',
    prefix: 'collections.actions',
    // `CollectionAction['kind']` moins `remind` : `NextActionCell` rend le rang
    // de relance par `invoiceReadiness.reminders.rank` avant d'atteindre la clé
    // générique — `remind` n'a donc pas de libellé sous `collections.actions`.
    values: COLLECTION_ACTION_KINDS,
  },
  {
    callSite: 'features/missions/view/CollectionsPage.tsx — collections.status.${status}',
    namespace: 'missions',
    prefix: 'collections.status',
    values: COLLECTION_STATUS_VALUES,
  },
  {
    callSite: 'features/missions/view/CollectionsPage.tsx — collections.buckets.${bucket}',
    namespace: 'missions',
    prefix: 'collections.buckets',
    values: COLLECTION_BUCKET_KEYS,
  },
  /**
   * #2124.68 — LES QUATRE ÉNUMÉRATIONS QUI ATTEIGNENT L'HISTORIQUE D'UN DOSSIER.
   *
   * Mesuré en production le 14/09/2026 : la section « Historique & preuves »
   * de THALES affichait `account_priority — accept`. Trois émetteurs, et trois
   * seulement, écrivent une CLÉ de domaine dans l'objet d'une activité
   * (`decision-gates.service`, `projects.service`, `consultants/submissions`) ;
   * `model/timelineEvent.ts` les traduit. Une valeur qui entre dans l'une de
   * ces quatre listes sans son libellé FR+EN fait rougir la CI ici.
   *
   * `PROJECT_STAGES` est déjà couvert plus haut (`projects:stage.states`) :
   * l'historique relit le MÊME catalogue que le tableau des projets, plutôt
   * que d'en ouvrir un second qui divergerait (GA-26).
   */
  {
    callSite: 'features/activities/model/timelineEvent.ts — gates.${porte}',
    namespace: 'activities',
    prefix: 'gates',
    values: DECISION_GATES,
  },
  {
    callSite: 'features/activities/model/timelineEvent.ts — gateDecisions.${décision}',
    namespace: 'activities',
    prefix: 'gateDecisions',
    values: GATE_DECISIONS,
  },
  {
    // #2196.31 — la pose et l'annulation d'une exception de relevé, au journal.
    callSite: 'features/activities/model/timelineEvent.ts — timesheetException.${clé}',
    namespace: 'activities',
    prefix: 'timesheetException',
    values: TIMESHEET_EXCEPTION_TIMELINE_KEYS,
  },
  {
    callSite: 'features/activities/model/timelineEvent.ts — submissions:stages.${étape}',
    namespace: 'submissions',
    prefix: 'stages',
    values: SUBMISSION_STAGES,
  },
  /**
   * #2156.42 / .43 / .45 / .46 — LES STATUTS DE TRAVAIL DE « MES CIBLES ».
   *
   * `TARGET_WORK_STATUSES` est passé de cinq à NEUF valeurs le 14/09/2026
   * (`target-list.ts`), et les quatre nouvelles — `to_enrich`,
   * `ready_to_contact`, `replied`, `to_follow_up` — sont arrivées sans libellé,
   * ni FR ni EN. `TargetListCard.tsx` les interpole SANS `defaultValue` : le
   * sélecteur de statut d'un élément proposait donc quatre lignes écrites
   * « status.to_enrich », « status.ready_to_contact »… en clair, à l'écran.
   *
   * Les trois voisines du même composant entrent avec elles : elles se
   * remplissent depuis le même contrat et rien ne garantissait qu'un ajout y
   * soit mieux traité.
   */
  {
    callSite: 'features/target-lists/view/TargetListCard.tsx — status.${work_status}',
    namespace: 'targets',
    prefix: 'status',
    values: TARGET_WORK_STATUSES,
  },
  {
    callSite: 'features/target-lists/view/TargetListCard.tsx — priority.${priority}',
    namespace: 'targets',
    prefix: 'priority',
    values: TARGET_PRIORITIES,
  },
  {
    callSite: 'features/target-lists/view/TargetListCard.tsx — provenance.${provenance}',
    namespace: 'targets',
    prefix: 'provenance',
    values: TARGET_PROVENANCES,
  },
  {
    callSite: 'features/target-lists/view/TargetListCard.tsx — kind.${kind}',
    namespace: 'targets',
    prefix: 'kind',
    values: TARGET_ITEM_KINDS,
  },
]

function lookup(tree: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    tree,
  )
}

describe('i18n dynamic enum keys are fully translated', () => {
  it.each(ENUM_KEYS)('$callSite', ({ namespace, prefix, values }) => {
    for (const lang of ['fr', 'en'] as const) {
      const missing = values.filter(
        value => typeof lookup(resources[lang][namespace], [...prefix.split('.'), value]) !== 'string',
      )
      expect(missing, `missing keys in ${lang}/${namespace}.json under "${prefix}"`).toEqual([])
    }
  })
})

/**
 * #2003.22 — la borne basse que `ENUM_KEYS` ne pose pas, pour le seul corpus
 * DÉRIVÉ de la liste : `includedActions()` se calcule à partir de la grille
 * pondérée, donc une grille vidée ou entièrement payante le réduirait à zéro et
 * la comparaison ci-dessus passerait sur zéro élément — verte, et aveugle.
 */
describe('le corpus « ce qui reste utilisable » est LU, pas supposé', () => {
  it("n'est ni vide ni la grille entière", () => {
    expect(includedActions().length).toBeGreaterThanOrEqual(3)
    expect(includedActions()).toContain('copilot_message')
  })

  it("n'attrape PAS ce qu'elle ne vise pas : le bloc ne nomme aucune action payante", () => {
    // Un libellé qui SURVIVRAIT à sa sortie de la liste promettrait, en
    // français comme en anglais, une action que le serveur arrête désormais.
    for (const lang of ['fr', 'en'] as const) {
      const block = lookup(resources[lang]['billing'], ['includedActions']) as Record<string, unknown>
      expect(Object.keys(block).sort()).toEqual([...includedActions()].sort())
    }
  })
})

/* ------------------------------------------------------------------ */
/*  GA-52 — une intervention de Laura naît avec sa copie, ou pas       */
/* ------------------------------------------------------------------ */

/**
 * GA-52 — TOUTE INTERVENTION DU CATALOGUE PORTE SON MESSAGE ET SON BOUTON.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE REFUSE, VU EN PRODUCTION LE 28/08
 * ─────────────────────────────────────────────────────────────────────────
 * Sur le lien de démonstration PUBLIC, la bulle de Laura affichait sa clé
 * i18n brute — `interventions.no_skills_dossier`, avec un bouton
 * `actions.no_skills_dossier`. Le catalogue déclarait trente interventions ;
 * `fr/laura.json` et `en/laura.json` n'en traduisaient que huit. Vingt-deux
 * bulles n'avaient donc ni message ni libellé de bouton, dans AUCUNE des deux
 * langues — et c'est un prospect qui l'a vu en premier.
 *
 * Pourquoi ce jour-là et pas avant : ces vingt-deux interventions n'avaient
 * aucun détecteur, donc rien ne pouvait les déclencher, donc leur absence de
 * traduction était invisible. Le jour où les détecteurs sont branchés, la clé
 * s'affiche. C'est la cause racine « allumer un drapeau sans le nourrir »,
 * appliquée à sa copie plutôt qu'à sa donnée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS UNE LIGNE DE `ENUM_KEYS`
 * ─────────────────────────────────────────────────────────────────────────
 * Deux raisons, et la seconde est celle qui compte :
 *
 * 1. Les deux préfixes vont PAR PAIRE. Un message sans libellé de bouton rend
 *    une bulle avec un bouton vide, un libellé sans message rend une bulle
 *    sans texte : c'est la même faute, et elle se lit mieux clé par clé que
 *    préfixe par préfixe.
 * 2. Le tableau `ENUM_KEYS` n'a AUCUNE borne basse sur la taille de ses
 *    corpus. Un `LAURA_INTERVENTIONS` vidé par un mauvais import passerait
 *    trente comparaisons sur zéro élément — toutes vertes. La garde borgne
 *    est le mode de défaillance le plus courant de ce dépôt (six en deux
 *    jours) ; ici elle est refusée explicitement.
 *
 * ⚠️ Elle ne dit rien de la JUSTESSE d'un libellé — c'est le rôle de
 * `lexicon.test.ts` (le ton), `no-overpromise.test.ts` (ce qu'on promet) et
 * `no-vendor-names.test.ts` (l'éditeur qu'on ne nomme pas). Une garde protège
 * une règle, elle ne l'invente pas.
 */
const LAURA_KEYS: readonly string[] = LAURA_INTERVENTIONS.map(intervention => intervention.key)

/** Les deux clés que `LauraCard.tsx` interpole, sans `defaultValue` ni
 *  variable : une clé manquante s'affiche donc EN CLAIR dans la bulle. */
const LAURA_PREFIXES = ['interventions', 'actions'] as const

describe('GA-52 — chaque intervention de Laura porte son message et son libellé de bouton', () => {
  it('lit un corpus NON VIDE — sans ça la garde resterait verte pour toujours', () => {
    // Le catalogue en porte trente (§5.4 du PDF 10). La borne est à 25 pour
    // qu'un retrait délibéré ne casse pas la CI, et assez haute pour qu'un
    // catalogue vidé — l'import renommé, la constante déplacée — la casse.
    expect(LAURA_KEYS.length).toBeGreaterThanOrEqual(25)
    expect(new Set(LAURA_KEYS).size).toBe(LAURA_KEYS.length)
    // …et le catalogue de traductions doit être lisible des deux côtés : sans
    // ces deux branches, un `laura.json` renommé rendrait `undefined` partout
    // et le test suivant échouerait pour la mauvaise raison.
    for (const lang of ['fr', 'en'] as const) {
      for (const prefix of LAURA_PREFIXES) {
        expect(typeof lookup(resources[lang].laura, [prefix]), `${lang}/laura.json → "${prefix}"`).toBe('object')
      }
    }
  })

  it.each(LAURA_KEYS)('%s a son message ET son libellé de bouton, en FR comme en EN', key => {
    const missing: string[] = []
    for (const lang of ['fr', 'en'] as const) {
      for (const prefix of LAURA_PREFIXES) {
        if (typeof lookup(resources[lang].laura, [prefix, key]) !== 'string') {
          missing.push(`${lang}/laura.json → "${prefix}.${key}"`)
        }
      }
    }
    expect(
      missing,
      '\nUne intervention sans copie affiche sa CLÉ dans la bulle, en production.\n' +
        `Clés à écrire :\n${missing.join('\n')}\n`,
    ).toEqual([])
  })
})

/* ──────────────────────────────────────────────────────────────────────── */
/*  Une nature de la file d'intervention porte son libellé, ou pas          */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * CHAQUE NATURE DE LA FILE D'INTERVENTION PORTE SON LIBELLÉ, EN FR COMME EN EN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET LE DÉFAUT QUI L'A PRODUITE
 * ─────────────────────────────────────────────────────────────────────────
 * Deux écrans interpolent la nature SANS `defaultValue` — le panneau des
 * playbooks (`PlaybooksPanel.tsx`) et le bloc « Ce qui attend ta décision » du
 * cockpit du commercial (`DailyGesturesBlock.tsx`, #2567.K2 — l'ancien
 * `MyActivityBlock.tsx`, avant le 18/09/2026), qui est l'écran d'arrivée du
 * produit et le premier qu'un prospect ouvre. Une nature sans libellé s'y
 * affiche donc EN CLAIR : « interventions.kinds.payment_overdue ».
 *
 * `INTERVENTION_KINDS` est passée de six à onze le 28/08/2026 en ajoutant les
 * natures du cockpit du commercial, et rien ne vérifiait la contrepartie —
 * la file du responsable est la seule surface du produit où une clé nue peut
 * apparaître sans qu'aucun test ne la voie, parce qu'elle est remplie par un
 * balayage nocturne et non par un geste d'utilisateur.
 *
 * ⚠️ Elle ne dit rien de la JUSTESSE du libellé : le ton, ce qu'on promet et
 * l'éditeur qu'on ne nomme pas ont chacun leur garde. Une garde protège une
 * règle, elle ne l'invente pas.
 */
describe('chaque nature de la file d’intervention porte son libellé', () => {
  it('lit un corpus NON VIDE — sans ça la garde resterait verte pour toujours', () => {
    // Six natures pour le responsable, cinq pour le commercial. La borne est
    // sous les onze pour qu'un retrait délibéré ne casse pas la CI, et assez
    // haute pour qu'une énumération vidée — l'import renommé, la constante
    // déplacée — la casse.
    expect(INTERVENTION_KINDS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(INTERVENTION_KINDS).size).toBe(INTERVENTION_KINDS.length)
    // …et le dictionnaire doit être lisible des deux côtés : sans cette
    // branche, un `playbooks.json` renommé rendrait `undefined` partout et le
    // test suivant échouerait pour la mauvaise raison.
    for (const lang of ['fr', 'en'] as const) {
      expect(
        typeof lookup(resources[lang].playbooks, ['interventions', 'kinds']),
        `${lang}/playbooks.json → "interventions.kinds"`,
      ).toBe('object')
    }
  })

  it.each(INTERVENTION_KINDS)('%s a son libellé, en FR comme en EN', kind => {
    const missing: string[] = []
    for (const lang of ['fr', 'en'] as const) {
      if (typeof lookup(resources[lang].playbooks, ['interventions', 'kinds', kind]) !== 'string') {
        missing.push(`${lang}/playbooks.json → "interventions.kinds.${kind}"`)
      }
    }
    expect(
      missing,
      '\nUne nature sans libellé affiche sa CLÉ dans la file, en production.\n' +
        `Clés à écrire :\n${missing.join('\n')}\n`,
    ).toEqual([])
  })
})

/* ──────────────────────────────────────────────────────────────────────── */
/*  Les onze motifs d'exclusion du matching portent leur libellé            */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * CHAQUE MOTIF D'EXCLUSION PORTE SON LIBELLÉ HUMAIN, EN FR COMME EN EN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────
 * `EXCLUSION_REASONS` est une liste FERMÉE de onze codes que la source du
 * PDF 4 (§4.1) qualifie de conformité, pas de confort : « aucun profil n'est
 * écarté sans code de motif ». Deux d'entre eux sont des OBLIGATIONS —
 * `consent_expired` (RGPD) et `previously_rejected_by_client`.
 *
 * Trois endroits rendent le code par ``t(`reasons.${…}`)`` SANS `defaultValue` :
 * la pastille d'une carte (`MatchCard.tsx`), le compteur par motif du bloc
 * « écartés » (`MatchDrawer.tsx`) et le matching inverse
 * (`InverseMatchPanel.tsx`). Un code sans libellé n'y affiche donc pas un mot
 * approximatif : il affiche `reasons.rate_out_of_range` là où le recruteur
 * attend l'explication, et là où le candidat a le droit d'apprendre pourquoi il
 * n'a pas été proposé.
 *
 * Un code brut à l'écran n'est pas une explication — c'est très exactement ce
 * que l'exigence refuse.
 *
 * ⚠️ Elle ne dit rien de ce que le moteur POSE : qu'aucun des onze ne soit resté
 * sans producteur est tenu côté API par `exclusion-catalogue.spec.ts`. Une garde
 * protège une règle, elle ne l'invente pas.
 */
describe('chaque motif d’exclusion du matching porte son libellé', () => {
  it('lit un corpus NON VIDE — sans ça la garde resterait verte pour toujours', () => {
    // Onze, et la liste est fermée. La borne est sous onze pour qu'un retrait
    // délibéré ne casse pas la CI, et assez haute pour qu'une énumération vidée
    // — l'import renommé, la constante déplacée — la casse.
    expect(EXCLUSION_REASONS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(EXCLUSION_REASONS).size).toBe(EXCLUSION_REASONS.length)
    for (const lang of ['fr', 'en'] as const) {
      expect(typeof lookup(resources[lang].matching, ['reasons']), `${lang}/matching.json → "reasons"`).toBe('object')
    }
  })

  it.each(EXCLUSION_REASONS)('%s a son libellé, en FR comme en EN', reason => {
    const missing: string[] = []
    for (const lang of ['fr', 'en'] as const) {
      const label = lookup(resources[lang].matching, ['reasons', reason])
      // Une clé présente mais vide s'affiche comme une pastille muette : moins
      // bruyant qu'une clé brute, tout aussi faux.
      if (typeof label !== 'string' || label.trim().length === 0) {
        missing.push(`${lang}/matching.json → "reasons.${reason}"`)
      }
    }
    expect(
      missing,
      '\nUn motif sans libellé affiche sa CLÉ à la place de l’explication due.\n' +
        `Clés à écrire :\n${missing.join('\n')}\n`,
    ).toEqual([])
  })

  it('aucun libellé ne SURVIT au motif qu’il nommait', () => {
    // Le sens inverse : une traduction qui reste après le retrait de son code est
    // une ligne morte que le prochain lecteur prendra pour une fonctionnalité —
    // et sur une liste FERMÉE de conformité, pour un motif encore posé.
    const closed = new Set<string>(EXCLUSION_REASONS)
    for (const lang of ['fr', 'en'] as const) {
      const table = lookup(resources[lang].matching, ['reasons']) as Record<string, unknown>
      expect(
        Object.keys(table).filter(key => !closed.has(key)),
        `${lang}/matching.json`,
      ).toEqual([])
    }
  })
})

/* ------------------------------------------------------------------ */
/*  #2124.68 — l'historique d'un dossier n'est pas un journal technique */
/* ------------------------------------------------------------------ */

/**
 * LES DEUX REGISTRES DE L'HISTORIQUE SE COMPARENT, DANS LES DEUX SENS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE REFUSE, MESURÉ EN PRODUCTION LE 14/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Section « Historique & preuves » du dossier THALES, événement du 14/09 à
 * 19:02 : `account_priority — accept`. Les onze portes de décision existaient
 * depuis le 19/08, aucune n'avait de libellé — ni FR ni EN. La clé sortait donc
 * en clair, sur l'écran qu'un commercial ouvre cinq minutes avant un
 * rendez-vous.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE SENS INVERSE, ET POURQUOI IL EST ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Défaut JUMEAU trouvé le MÊME jour sur `entityTypes.ts` : deux libellés
 * traduits (`site`, `programme`) qu'aucune clé ne pouvait plus atteindre. Un
 * libellé qui survit à sa clé est une ligne morte que le prochain lecteur
 * prendra pour une fonctionnalité. La garde compare donc les deux registres
 * dans les deux sens, plutôt que trois valeurs choisies à la main.
 *
 * `unknown` est le SEUL supplément admis de chaque côté : c'est le repli qui
 * nomme l'inconnu (« Porte de décision — issue non nommée ») pour qu'une clé
 * sans libellé n'atteigne jamais l'écran. Le filet ne dispense pas du rouge :
 * c'est précisément ce que les deux premiers tests tiennent.
 */
describe('#2124.68 — chaque clé d’événement de l’historique porte son libellé', () => {
  /** Les tables de libellés du namespace `activities`, avec leur énumération. */
  const REGISTRIES = [
    { table: 'gates', values: DECISION_GATES, min: 8 },
    { table: 'gateDecisions', values: GATE_DECISIONS, min: 3 },
  ] as const

  it('lit un corpus NON VIDE — sans ça la garde resterait verte pour toujours', () => {
    for (const { table, values, min } of REGISTRIES) {
      expect(values.length, `${table} : énumération vidée ou import renommé`).toBeGreaterThanOrEqual(min)
      expect(new Set(values).size, `${table} : doublon dans l’énumération`).toBe(values.length)
      for (const lang of ['fr', 'en'] as const) {
        expect(typeof lookup(resources[lang].activities, [table]), `${lang}/activities.json → "${table}"`).toBe(
          'object',
        )
      }
    }
  })

  it.each(REGISTRIES.flatMap(({ table, values }) => values.map(value => [table, value] as const)))(
    '%s.%s a son libellé, en FR comme en EN',
    (table, value) => {
      const missing: string[] = []
      for (const lang of ['fr', 'en'] as const) {
        const label = lookup(resources[lang].activities, [table, value])
        // Une clé présente mais VIDE ne rend pas la clé : elle rend un blanc,
        // qui se lit comme un objet manquant. Tout aussi faux.
        if (typeof label !== 'string' || label.trim().length === 0) {
          missing.push(`${lang}/activities.json → "${table}.${value}"`)
        }
      }
      expect(
        missing,
        '\nUne clé d’événement sans libellé s’affiche EN CLAIR dans l’historique d’un dossier.\n' +
          `Clés à écrire :\n${missing.join('\n')}\n`,
      ).toEqual([])
    },
  )

  it('aucun libellé ne SURVIT à la clé qu’il nommait', () => {
    for (const { table, values } of REGISTRIES) {
      const closed = new Set<string>([...values, 'unknown'])
      for (const lang of ['fr', 'en'] as const) {
        const written = lookup(resources[lang].activities, [table]) as Record<string, unknown>
        expect(
          Object.keys(written).filter(key => !closed.has(key)),
          `${lang}/activities.json → "${table}" : libellé sans clé`,
        ).toEqual([])
      }
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas — les objets écrits par un humain', () => {
    // Le témoin du cas légitime voisin : `kinds`, `sources` et `linkReasons`
    // sont des tables du MÊME fichier que la garde ne doit pas confondre avec
    // un registre d'événement. Et le repli `unknown` n'a rien à y faire : il
    // n'existe que là où une clé de domaine peut arriver sans libellé.
    for (const lang of ['fr', 'en'] as const) {
      for (const table of ['kinds', 'sources', 'linkReasons'] as const) {
        const written = lookup(resources[lang].activities, [table]) as Record<string, unknown>
        expect(Object.keys(written).length, `${lang}/activities.json → "${table}"`).toBeGreaterThan(0)
        expect(Object.keys(written), `${lang}/activities.json → "${table}" ne porte pas de repli`).not.toContain(
          'unknown',
        )
      }
    }
  })
})
