import { z } from 'zod'
import { PLAN_ACTION_CHANNELS } from './action-plan-items.js'
import { METHOD_REFUSALS, METHOD_RULES } from '../knowledge/method-delta.js'
import { SALESCONNECT_CORPUS_GOVERNANCE, SALESCONNECT_CORPUS_RULES } from '../knowledge/salesconnect-corpus.js'

/** Même chaîne que `METHOD_SOURCE` côté Python (`apps/ia/app/knowledge/
 *  method_rules.py`) — `packages/` n'étant pas importable depuis `apps/ia`
 *  (cf. plus bas), la valeur est dupliquée à l'identique plutôt qu'importée ;
 *  `method-delta.parity.test.ts` garde déjà les deux jeux d'identifiants en
 *  phase, ce texte n'a pas besoin d'un second gardien pour rester constant. */
const METHOD_SOURCE = 'Méthode commerciale Bellum — delta de méthode distillé'

/**
 * BEL-SC-221 — la FONDATION : le corpus méthode versionné.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * La « Bible SalesConnect » était déjà distillée trois fois dans le dépôt —
 * `agent_docs/kb/bible-sales-hacks.md` (lecture humaine), puis en config Python
 * (`apps/ia/app/knowledge/{business_rules,method_rules,objection_library,
 * sector_playbooks}.py`), puis re-projetée en chunks RAG citables par
 * `apps/ia/app/services/method_knowledge.py` (le `method_context` de
 * LAU-FINAL-206). Chacune de ces trois couches est une FORME du même contenu,
 * pas une gouvernance : aucune ne porte de catégorie typée, de version, de
 * feature flag, de comparaison à la doctrine produit, d'historique, de
 * propriétaire, ni de mécanisme pour désactiver une règle qui produit de
 * mauvais résultats. C'est exactement la liste du ticket, section GOUVERNANCE.
 *
 * Ce module N'EST PAS une quatrième distillation : il TYPE et GOUVERNE ce qui
 * existe déjà. Les dix règles gardées et les sept refus de
 * `../knowledge/method-delta.js` (déjà la source unique côté TS, déjà reproduits
 * côté Python via `method_rules.py` et gardés en parité par
 * `method-delta.parity.test.ts`) sont DÉRIVÉS ici, jamais recopiés — un
 * changement dans `method-delta.ts` se propage sans qu'on touche ce fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES QUATRE AUTRES CATÉGORIES SONT VIDES EN v1.0.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Le ticket nomme six catégories : INVARIANT, ADAPTIVE_POLICY, PLAYBOOK,
 * CASE_STUDY, COMMERCIAL_CLAIM, SUPERSEDED. Cette version peuple INVARIANT (dérivé
 * de la source unique ci-dessus) et SUPERSEDED (l'exemple fourni verbatim par la
 * spec elle-même — aucune autre formule superseded n'est écrite nulle part dans
 * le dépôt, vérifié par recherche). ADAPTIVE_POLICY, PLAYBOOK, CASE_STUDY et
 * COMMERCIAL_CLAIM restent VIDES PAR CONSTRUCTION : le contenu qui les
 * alimenterait existe déjà côté Python (`sector_playbooks.json`,
 * `objection_library.json`, `business_rules.py`) mais migrer des dizaines
 * d'entrées sans les auditer une par une contre la doctrine produit (règle 2 de
 * l'instruction commune #3249) aurait fabriqué une gouvernance qui ment sur ce
 * qu'elle a vérifié. Le doter d'un chiffre inventé (ex. un COMMERCIAL_CLAIM
 * « 30 % d'ouverture en plus ») violerait plus directement encore « jamais de
 * donnée fictive ». Le SCHÉMA les accepte toutes les six ; les specs BEL-SC
 * suivantes qui migrent un playbook ou un chiffre commercial l'y ajoutent, sans
 * retoucher ce fichier — c'est tout le sens d'une fondation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RÉCUPÉRATION — POURQUOI LE SÉLECTEUR CI-DESSOUS N'EST PAS LE MOTEUR PYTHON
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/ia` ne peut pas importer `packages/contracts` — sa racine Railway est
 * `apps/ia`, `packages/` n'est pas dans son contexte de build (même contrainte
 * documentée dans `ingestion-guard.ts`). Le tri par pertinence qui alimente
 * RÉELLEMENT le prompt de Laura reste donc `method_knowledge.retrieve_method_chunks`
 * côté Python. `selectApplicableMethodRules` ci-dessous est l'algorithme DE
 * RÉFÉRENCE pour les consommateurs TypeScript (web, api) qui doivent appliquer la
 * même discipline — ne jamais injecter tout le corpus, toujours filtrer par
 * rôle/stade/secteur AVANT de scorer par pertinence (c'est justement ce que le
 * NO-GO « simple RAG sans typologie ni conditions d'application » interdit) — sans
 * dupliquer un second moteur de retrieval concurrent : les deux lisent la même
 * discipline, chacun dans son langage, exactement comme `METHOD_RULES` le fait
 * déjà pour les invariants.
 */

// ── Catégories (ticket, section « CATÉGORIES DE CONTENU ») ────────────────────

export const METHOD_RULE_CATEGORIES = [
  'invariant',
  'adaptive_policy',
  'playbook',
  'case_study',
  'commercial_claim',
  'superseded',
] as const
export const methodRuleCategorySchema = z.enum(METHOD_RULE_CATEGORIES)
export type MethodRuleCategory = z.infer<typeof methodRuleCategorySchema>

// ── Domaine — UNIQUEMENT les maisons canoniques (instruction commune #3249,
//    règle 5), + `methode` pour ce qui traverse plusieurs objets. Un domaine
//    hors de cette liste serait un second objet métier concurrent. ───────────

export const METHOD_RULE_DOMAINS = [
  'Compte',
  'Contact',
  'Signal',
  'Besoin',
  'Talent',
  'Mission',
  'Action',
  'Partenaire',
  'Opportunité',
  'ProfileContext',
  'methode',
] as const
export const methodRuleDomainSchema = z.enum(METHOD_RULE_DOMAINS)
export type MethodRuleDomain = z.infer<typeof methodRuleDomainSchema>

export const methodRuleStatusSchema = z.enum(['active', 'deprecated'])
export type MethodRuleStatus = z.infer<typeof methodRuleStatusSchema>

/** JAMAIS un nombre : « aucune PROBABILITÉ » est refusé six fois au registre de
 *  doctrine. Une confiance qualitative peut se citer ; un pourcentage se lit
 *  comme une chance de closing. */
export const methodRuleConfidenceSchema = z.enum(['low', 'medium', 'high'])
export type MethodRuleConfidence = z.infer<typeof methodRuleConfidenceSchema>

/** Le schéma de règle du ticket, champ pour champ — aucun n'est optionnel :
 *  un champ absent est un trou dans la gouvernance, pas une valeur par défaut. */
export const methodRuleSchema = z.object({
  rule_id: z.string().min(1),
  title: z.string().min(1),
  category: methodRuleCategorySchema,
  domain: methodRuleDomainSchema,
  source_document: z.string().min(1),
  /** `null` = règle sourcée en code (pas de pagination), pas « page inconnue ». */
  source_page: z.number().int().positive().nullable(),
  /** La version du corpus où cette règle a été introduite ou révisée pour la
   *  dernière fois — pas la version DU PRODUIT. */
  version: z.string().min(1),
  status: methodRuleStatusSchema,
  /** Mots-clés / intention qui doivent faire remonter cette règle en retrieval. */
  trigger: z.string().min(1),
  /** `[]` = s'applique à tous les rôles. Filtre le RETRIEVAL, jamais un
   *  classement affiché (c76 protège l'ORDRE des cartes d'accueil, un tout
   *  autre écran) — même principe que le filtre sectoriel déjà en place côté
   *  Python (`method_knowledge.retrieve_method_chunks`, `eligible_sector`). */
  applicable_roles: z.array(z.string()).readonly(),
  applicable_stages: z.array(z.string()).readonly(),
  applicable_sectors: z.array(z.string()).readonly(),
  /** #3382 — les canaux où la règle vaut (`phone`, `email`, `linkedin`,
   *  `meeting`). `[]` = tous les canaux. Un canal inconnu au tour ne fait jamais
   *  remonter une règle à canaux restreints : on ne devine pas le canal. */
  applicable_channels: z.array(z.enum(PLAN_ACTION_CHANNELS)).readonly(),
  prerequisites: z.array(z.string()).readonly(),
  recommendation: z.string().min(1),
  exceptions: z.array(z.string()).readonly(),
  counter_example: z.string().nullable(),
  stop_condition: z.string().nullable(),
  /** Cette règle a-t-elle besoin d'une preuve (donnée du compte) avant que
   *  Laura la cite ? Porte la doctrine « chaque recommandation dit son
   *  fondement ». */
  evidence_required: z.boolean(),
  confidence: methodRuleConfidenceSchema,
  /** Doctrine : une correction humaine gagne toujours. Une règle vraiment
   *  invariante (ex. « une action non datée n'est pas une action ») peut
   *  néanmoins refuser l'override — c'est la différence entre un principe et
   *  un preset. */
  user_override_allowed: z.boolean(),
  telemetry_required: z.boolean(),
})
export type MethodRule = z.infer<typeof methodRuleSchema>

// ── Gouvernance (ticket, section « GOUVERNANCE ») ──────────────────────────────

/** Le verdict d'audit de l'instruction commune #3249, règle 2 — un par règle. */
export const productRuleComparisonSchema = z.enum(['keep', 'merge', 'superseded', 'remove_after_migration'])
export type ProductRuleComparison = z.infer<typeof productRuleComparisonSchema>

export const methodRuleGovernanceSchema = z
  .object({
    rule_id: z.string().min(1),
    /** Qui répond de cette règle — jamais anonyme, sinon personne ne peut la
     *  désactiver en connaissance de cause. */
    owner: z.string().min(1),
    /** `null` = toujours active (pas de porte). Une clé = activation par flag. */
    feature_flag_key: z.string().min(1).nullable(),
    enabled: z.boolean(),
    /** Obligatoire dès que `enabled` est faux : « désactivée » sans raison est
     *  une régression qui se redécouvre en réunion, pas en CI. */
    disabled_reason: z.string().min(1).nullable(),
    comparison_to_product_rules: productRuleComparisonSchema,
    /** `null` = non mesuré, jamais « pas d'impact » (GA-18/19 : non mesuré ≠ 0). */
    impact_metric_key: z.string().min(1).nullable(),
  })
  .superRefine((entry, ctx) => {
    if (!entry.enabled && !entry.disabled_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['disabled_reason'],
        message: 'Une règle désactivée doit porter sa raison — jamais un silence.',
      })
    }
  })
export type MethodRuleGovernance = z.infer<typeof methodRuleGovernanceSchema>

export const methodCorpusChangeLogEntrySchema = z.object({
  version: z.string().min(1),
  released_at: z.string().min(1),
  summary: z.string().min(1),
  rule_ids: z.array(z.string().min(1)).min(1),
  comparison_note: z.string().nullable(),
})
export type MethodCorpusChangeLogEntry = z.infer<typeof methodCorpusChangeLogEntrySchema>

export const methodCorpusVersionSchema = z
  .object({
    version: z.string().min(1),
    released_at: z.string().min(1),
    rules: z.array(methodRuleSchema),
    governance: z.array(methodRuleGovernanceSchema),
    change_log: z.array(methodCorpusChangeLogEntrySchema),
  })
  .superRefine((corpus, ctx) => {
    const seenRuleIds = new Set<string>()
    for (const rule of corpus.rules) {
      if (seenRuleIds.has(rule.rule_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rules'],
          message: `rule_id dupliqué : « ${rule.rule_id} ».`,
        })
      }
      seenRuleIds.add(rule.rule_id)
    }

    const governanceByRuleId = new Map(corpus.governance.map(entry => [entry.rule_id, entry]))
    for (const rule of corpus.rules) {
      const governance = governanceByRuleId.get(rule.rule_id)
      if (!governance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governance'],
          message: `la règle « ${rule.rule_id} » n'a aucune ligne de gouvernance.`,
        })
        continue
      }
      // Une règle SUPERSEDED contredit la doctrine produit actuelle : elle ne
      // peut jamais rester citable — sinon la catégorie ne veut rien dire.
      if (rule.category === 'superseded' && governance.enabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governance'],
          message: `« ${rule.rule_id} » est SUPERSEDED : elle doit être désactivée en gouvernance.`,
        })
      }
    }
    for (const entry of corpus.governance) {
      if (!corpus.rules.some(rule => rule.rule_id === entry.rule_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governance'],
          message: `la gouvernance cite « ${entry.rule_id} », qui n'existe dans aucune règle.`,
        })
      }
    }
  })
export type MethodCorpusVersion = z.infer<typeof methodCorpusVersionSchema>

// ── v1.0.0 — dérivée de method-delta.ts, jamais recopiée ──────────────────────

const CORPUS_V1_VERSION = '1.0.0'
const CORPUS_V1_RELEASED_AT = '2026-09-28'

/** La version COURANTE du corpus — celle du `MethodCorpusVersion` exporté plus
 *  bas. Distincte de `CORPUS_V1_VERSION` : les 18 règles de la fondation (BEL-
 *  SC-221) portent `version: '1.0.0'` sur ELLES-MÊMES (elles n'ont pas été
 *  révisées depuis), alors que le corpus dans son ensemble est maintenant en
 *  1.1.0 — confondre les deux ferait dater une règle non touchée de la release
 *  qui a seulement ajouté ses voisines. */
const CORPUS_CURRENT_VERSION = '1.2.0'
const CORPUS_V1_1_RELEASED_AT = '2026-09-28'
const CORPUS_V1_2_RELEASED_AT = '2026-09-29'

/** Domaine canonique de chaque invariant migré — la seule information que
 *  `method-delta.ts` ne porte pas déjà (il n'a que `id` et `statement`). */
const INVARIANT_DOMAIN_BY_RULE_ID: Record<string, MethodRuleDomain> = {
  plan_de_compte_hebdomadaire: 'Compte',
  haut_et_bas_en_parallele: 'Contact',
  fil_achats_distinct_du_fil_metier: 'Signal',
  action_avec_proprietaire_date_resultat: 'Action',
  couverture_multi_roles_niveaux_entites: 'Compte',
  consultant_capteur_avec_consentement: 'Talent',
  objection_validee_puis_exploree: 'Action',
  ouverture_construit_une_conversation: 'Action',
  non_resultat_est_un_resultat: 'Action',
  quotas_historiques_sont_des_exemples: 'methode',
  nombres_fixes_de_volumes: 'Action',
  ciblage_informatique_par_defaut: 'Compte',
  gabarits_recopies_mot_pour_mot: 'Action',
  promesses_de_delai_sans_engagement: 'Action',
  automatisation_du_reseau_professionnel: 'Contact',
  nom_de_fournisseur_technique_dans_l_app: 'methode',
  anciennes_statistiques_comme_reperes: 'methode',
}

function deriveInvariantRule(rule: { readonly id: string; readonly statement: string }, refused: boolean): MethodRule {
  return {
    rule_id: rule.id,
    title: rule.statement,
    category: 'invariant',
    domain: INVARIANT_DOMAIN_BY_RULE_ID[rule.id] ?? 'methode',
    source_document: METHOD_SOURCE,
    source_page: null,
    version: CORPUS_V1_VERSION,
    status: 'active',
    trigger: rule.id.replace(/_/g, ' '),
    applicable_roles: [],
    applicable_stages: [],
    applicable_sectors: [],
    applicable_channels: [],
    prerequisites: [],
    recommendation: refused ? `Ne jamais appliquer : ${rule.statement}` : rule.statement,
    exceptions: [],
    counter_example: null,
    stop_condition: null,
    evidence_required: true,
    confidence: 'high',
    user_override_allowed: false,
    telemetry_required: true,
  }
}

function invariantGovernance(ruleId: string): MethodRuleGovernance {
  return {
    rule_id: ruleId,
    owner: 'produit',
    feature_flag_key: null,
    enabled: true,
    disabled_reason: null,
    comparison_to_product_rules: 'keep',
    impact_metric_key: null,
  }
}

/** L'exemple SUPERSEDED est écrit VERBATIM par la spec (#3250) — ni recherché
 *  ni recopié d'ailleurs dans le dépôt (vérifié : introuvable hors du ticket). */
const SUPERSEDED_EXAMPLE_RULE_ID = 'bellum_accelere_mais_ne_pense_pas'

const SUPERSEDED_EXAMPLE_RULE: MethodRule = {
  rule_id: SUPERSEDED_EXAMPLE_RULE_ID,
  title: '« Bellum accélère mais ne pense pas. »',
  category: 'superseded',
  domain: 'methode',
  source_document: 'BEL-SC-221 (#3250)',
  source_page: null,
  version: CORPUS_V1_VERSION,
  status: 'deprecated',
  trigger: 'bellum accelere pense positionnement produit',
  applicable_roles: [],
  applicable_stages: [],
  applicable_sectors: [],
  applicable_channels: [],
  prerequisites: [],
  recommendation:
    'Ne jamais citer cette formule : elle contredit la doctrine produit actuelle (Laura raisonne sur le compte, elle n’accélère pas une saisie).',
  exceptions: [],
  counter_example: null,
  stop_condition: null,
  evidence_required: false,
  confidence: 'high',
  user_override_allowed: false,
  telemetry_required: false,
}

const SUPERSEDED_EXAMPLE_GOVERNANCE: MethodRuleGovernance = {
  rule_id: SUPERSEDED_EXAMPLE_RULE_ID,
  owner: 'produit',
  feature_flag_key: null,
  enabled: false,
  disabled_reason: 'SUPERSEDED (BEL-SC-221) : contredit la doctrine produit actuelle.',
  comparison_to_product_rules: 'superseded',
  impact_metric_key: null,
}

const CORPUS_V1_CHANGE_LOG: MethodCorpusChangeLogEntry = {
  version: CORPUS_V1_VERSION,
  released_at: CORPUS_V1_RELEASED_AT,
  summary:
    'Fondation du corpus gouverné (BEL-SC-221). Migration des 17 règles de method-delta.ts (10 conservées + 7 refus) ' +
    'sous la catégorie INVARIANT, comparaison KEEP — dérivées de leur source unique, jamais recopiées. Ajout de ' +
    "l'exemple SUPERSEDED fourni verbatim par la spec, désactivé en gouvernance. ADAPTIVE_POLICY, PLAYBOOK, " +
    'CASE_STUDY et COMMERCIAL_CLAIM restent VIDES par construction : le contenu qui les peuplerait existe côté ' +
    "apps/ia (sector_playbooks, objection_library, business_rules) mais n'a pas été audité règle par règle contre " +
    'la doctrine produit dans ce lot — les specs BEL-SC suivantes les peuplent au fil de cet audit.',
  rule_ids: [...METHOD_RULES.map(rule => rule.id), ...METHOD_REFUSALS.map(rule => rule.id), SUPERSEDED_EXAMPLE_RULE_ID],
  comparison_note:
    'KEEP sur les 17 invariants migrés (capacité déjà plus aboutie que la Bible brute) ; SUPERSEDED sur l’exemple de la spec.',
}

/** BEL-SC-CORPUS (#3250, lot du 28/09 soir) — le CONTENU : 162 règles migrées
 *  des trois documents de travail SalesConnect (pitch, 100 hacks, méthode
 *  d'audit/stratégie généralisée) vers ADAPTIVE_POLICY, PLAYBOOK, CASE_STUDY et
 *  COMMERCIAL_CLAIM — les quatre catégories que la fondation 1.0.0 avait
 *  laissées vides par construction. Détail complet dans
 *  `../knowledge/salesconnect-corpus.ts`. */
const CORPUS_V1_1_CHANGE_LOG: MethodCorpusChangeLogEntry = {
  version: CORPUS_CURRENT_VERSION,
  released_at: CORPUS_V1_1_RELEASED_AT,
  summary:
    'Peuplement du corpus (BEL-SC-CORPUS, #3250) : 162 règles migrées des trois documents SalesConnect fournis — ' +
    '101 des 100 Hacks, 43 de la fiche pitch téléphonique, 18 de la méthode d’audit et de stratégie généralisée ' +
    '(aucune donnée du dossier client original). Peuplent ADAPTIVE_POLICY (14), PLAYBOOK (141), CASE_STUDY (3) et ' +
    'COMMERCIAL_CLAIM (3) — les quatre catégories vides depuis la fondation 1.0.0. Une entrée est SUPERSEDED (dépôt ' +
    'de faux CV, contredit « jamais de donnée fictive »). Les 18 règles INVARIANT de 1.0.0 ne sont pas retouchées.',
  rule_ids: SALESCONNECT_CORPUS_RULES.map(rule => rule.rule_id),
  comparison_note:
    'KEEP sur 161 des 162 règles (capacité nouvelle, ne concurrence aucun objet canonique existant) ; SUPERSEDED sur ' +
    'le dépôt de faux CV (100 Hacks, section 14).',
}

/** #3262.22/.29 (épopée #3284, lot P05 29/09) — les DEUX points de BEL-SC-233
 *  (cadence de revue, NO-GO logo prestigieux) qualifiés par l'épopée comme
 *  « une entrée de corpus méthode », jamais un champ de compte ni un second
 *  moteur. Sourcées au TICKET lui-même (comme `SUPERSEDED_EXAMPLE_RULE`
 *  l'était à sa spec), pas aux trois documents SalesConnect. */
const CADENCE_REVUE_CONFIGURABLE_RULE: MethodRule = {
  rule_id: 'cadence_de_revue_configurable',
  title: 'La cadence de revue d’un compte écarté ou en veille se règle, elle ne se fige pas.',
  category: 'adaptive_policy',
  domain: 'Compte',
  source_document: 'BEL-SC-233 (#3262, épopée #3284)',
  source_page: null,
  version: CORPUS_CURRENT_VERSION,
  status: 'active',
  trigger: 'cadence revue compte ecarte watch no_go reexamen prochaine condition',
  applicable_roles: [],
  applicable_stages: [],
  applicable_sectors: [],
  applicable_channels: [],
  prerequisites: [],
  recommendation:
    'La cadence de revue issue de la Bible est un point de départ, jamais une loi imposée à tous les comptes : elle ' +
    's’ajuste selon la catégorie du compte (le niveau de sprint), le cycle commercial, le rôle du contact concerné, ' +
    'le signal qui a déclenché la mise en veille, l’historique de la relation et la capacité commerciale disponible.',
  exceptions: [],
  counter_example: null,
  stop_condition: null,
  evidence_required: false,
  confidence: 'medium',
  user_override_allowed: true,
  telemetry_required: true,
}

const LOGO_PRESTIGIEUX_NO_GO_RULE: MethodRule = {
  rule_id: 'logo_prestigieux_ne_justifie_jamais_la_priorite',
  title: 'Un compte ne reste jamais prioritaire uniquement parce que son logo est prestigieux.',
  category: 'invariant',
  domain: 'Compte',
  source_document: 'BEL-SC-233 (#3262, épopée #3284)',
  source_page: null,
  version: CORPUS_CURRENT_VERSION,
  status: 'active',
  trigger: 'logo prestigieux marque connue priorite justification maintien',
  applicable_roles: [],
  applicable_stages: [],
  applicable_sectors: [],
  applicable_channels: [],
  prerequisites: [],
  recommendation:
    'Ne jamais maintenir un compte en Focus ou au sprint parce qu’il porte un logo prestigieux : la priorité se ' +
    'justifie par un signal d’affaires réel (accès, sponsor, cycle, marge), jamais par la seule notoriété du ' +
    'client. Aucun signal « logo prestigieux » n’est mesuré dans le produit — l’inventer serait la donnée fictive ' +
    'que la doctrine interdit.',
  exceptions: [],
  counter_example: null,
  stop_condition: null,
  evidence_required: false,
  confidence: 'high',
  user_override_allowed: false,
  telemetry_required: true,
}

function bel3262Governance(ruleId: string): MethodRuleGovernance {
  return {
    rule_id: ruleId,
    owner: 'produit',
    feature_flag_key: null,
    enabled: true,
    disabled_reason: null,
    comparison_to_product_rules: 'keep',
    impact_metric_key: null,
  }
}

const CORPUS_V1_2_CHANGE_LOG: MethodCorpusChangeLogEntry = {
  version: CORPUS_CURRENT_VERSION,
  released_at: CORPUS_V1_2_RELEASED_AT,
  summary:
    'BEL-SC-233 (#3262, épopée #3284) : deux points qualifiés « entrée de corpus méthode » plutôt qu’un champ de ' +
    'compte ou un second moteur. `cadence_de_revue_configurable` (ADAPTIVE_POLICY) nomme les six axes qui rendent ' +
    'la cadence de revue réglable (catégorie, cycle, rôle, signal, historique, capacité) plutôt qu’imposée. ' +
    '`logo_prestigieux_ne_justifie_jamais_la_priorite` (INVARIANT) porte le NO-GO de la spec.',
  rule_ids: [CADENCE_REVUE_CONFIGURABLE_RULE.rule_id, LOGO_PRESTIGIEUX_NO_GO_RULE.rule_id],
  comparison_note: 'KEEP sur les deux — aucune ne concurrence un objet canonique existant.',
}

/** Le corpus méthode gouverné, version courante (1.2.0) — la fondation
 *  (BEL-SC-221, 18 règles INVARIANT + SUPERSEDED), son contenu (BEL-SC-CORPUS,
 *  162 règles ADAPTIVE_POLICY/PLAYBOOK/CASE_STUDY/COMMERCIAL_CLAIM), et les
 *  deux points de BEL-SC-233 (#3262/#3284). `.parse()` au chargement du
 *  module : une incohérence (rule_id dupliqué, gouvernance orpheline,
 *  SUPERSEDED actif) fait échouer au premier import, pas au premier appel en
 *  production. */
export const METHOD_CORPUS_V1: MethodCorpusVersion = methodCorpusVersionSchema.parse({
  version: CORPUS_CURRENT_VERSION,
  released_at: CORPUS_V1_2_RELEASED_AT,
  rules: [
    ...METHOD_RULES.map(rule => deriveInvariantRule(rule, false)),
    ...METHOD_REFUSALS.map(rule => deriveInvariantRule(rule, true)),
    SUPERSEDED_EXAMPLE_RULE,
    ...SALESCONNECT_CORPUS_RULES,
    CADENCE_REVUE_CONFIGURABLE_RULE,
    LOGO_PRESTIGIEUX_NO_GO_RULE,
  ],
  governance: [
    ...METHOD_RULES.map(rule => invariantGovernance(rule.id)),
    ...METHOD_REFUSALS.map(rule => invariantGovernance(rule.id)),
    SUPERSEDED_EXAMPLE_GOVERNANCE,
    ...SALESCONNECT_CORPUS_GOVERNANCE,
    bel3262Governance(CADENCE_REVUE_CONFIGURABLE_RULE.rule_id),
    bel3262Governance(LOGO_PRESTIGIEUX_NO_GO_RULE.rule_id),
  ],
  change_log: [CORPUS_V1_CHANGE_LOG, CORPUS_V1_1_CHANGE_LOG, CORPUS_V1_2_CHANGE_LOG],
} satisfies MethodCorpusVersion)

/**
 * #3274.3 — miroir JSON pour `apps/ia`, même mécanique que
 * `ingestion-guard.constants.json` : `apps/ia/app/services/method_knowledge.py`
 * ne peut pas importer ce module (racine Railway = `apps/ia`, `packages/` hors
 * de son contexte de build), donc l'ACTIVATION d'une règle (gouvernance +
 * statut SUPERSEDED — les deux premières conditions de
 * {@link resolveRuleActivation}, `workspaceContradictedRuleIds` restant hors
 * périmètre côté apps/ia comme documenté plus bas) voyage en JSON versionné.
 * `method-corpus.runtime-governance.test.ts` fait rougir la CI dès que ce
 * fichier diverge de `METHOD_CORPUS_V1` ; côté Python,
 * `test_method_corpus_governance.py` compare le même JSON à
 * `app/knowledge/method_corpus_governance.py`.
 */
export const METHOD_CORPUS_RUNTIME_GOVERNANCE: ReadonlyArray<{
  readonly rule_id: string
  readonly superseded: boolean
  readonly enabled: boolean
  readonly feature_flag_key: string | null
  /** #3285.6 — les trois champs de garde que le moteur Python LIT désormais
   *  (`method_corpus_governance.rule_guard`, rendus dans le chunk cité). */
  readonly exceptions: readonly string[]
  readonly stop_condition: string | null
  readonly user_override_allowed: boolean
}> = METHOD_CORPUS_V1.governance.map(entry => {
  const rule = METHOD_CORPUS_V1.rules.find(candidate => candidate.rule_id === entry.rule_id)
  if (!rule) throw new Error(`gouvernance orpheline (aucune règle) : ${entry.rule_id}`)
  return {
    rule_id: entry.rule_id,
    superseded: rule.category === 'superseded',
    enabled: entry.enabled,
    feature_flag_key: entry.feature_flag_key,
    exceptions: rule.exceptions,
    stop_condition: rule.stop_condition,
    user_override_allowed: rule.user_override_allowed,
  }
})

// ── Activation & retrieval — la discipline du NO-GO, appliquée ────────────────

/**
 * Cette règle est-elle utilisable MAINTENANT ? Trois raisons de dire non, dans
 * cet ordre : elle est SUPERSEDED (contredit la doctrine, quoi que dise sa
 * gouvernance), elle est désactivée (« possibilité de désactiver une règle qui
 * produit de mauvais résultats »), ou elle est derrière un feature flag inactif
 * (« activation par feature flag »).
 */
/**
 * BEL-SC-235 — NO-GO : « le système applique mécaniquement une règle du PDF
 * malgré des résultats contraires dans le workspace ». `governance.enabled` et
 * `disabled_reason` sont un interrupteur GLOBAL (le même pour tous les
 * workspaces) ; `workspaceContradictedRuleIds` est le cran propre à CE
 * workspace — le comparatif produit/méthode (règle 7 de l'instruction commune
 * #3249 : « la donnée réelle du workspace [...] prime sur une règle générale
 * de la méthode ») appliqué à l'ACTIVATION elle-même, pas seulement au texte
 * du prompt.
 *
 * Ce module ne décide JAMAIS lui-même qu'un résultat est contraire — il
 * applique l'exclusion une fois que l'appelant le lui donne. D'où vient cet
 * ensemble (quel seuil d'échecs observés, sur quelle fenêtre) est un calcul
 * côté service, hors de ce module pur — non câblé dans ce lot (voir l'épopée
 * de suivi #3264) : `selectApplicableMethodRules` en apps/ia n'a aujourd'hui
 * aucune source de résultats par règle à lui passer. Un appelant qui ne le
 * fournit pas garde le comportement byte-identique d'avant ce paramètre.
 */
export function resolveRuleActivation(
  rule: MethodRule,
  governance: MethodRuleGovernance,
  activeFeatureFlags: readonly string[],
  workspaceContradictedRuleIds?: ReadonlySet<string>,
): boolean {
  if (rule.category === 'superseded') return false
  if (!governance.enabled) return false
  if (governance.feature_flag_key && !activeFeatureFlags.includes(governance.feature_flag_key)) return false
  if (workspaceContradictedRuleIds?.has(rule.rule_id)) return false
  return true
}

const DEFAULT_TOP_K = 3

function normalizeToken(token: string): string {
  return token.trim().toLowerCase()
}

function triggerTokens(trigger: string): Set<string> {
  return new Set(trigger.split(/\s+/).map(normalizeToken).filter(Boolean))
}

/**
 * Les règles pertinentes à l'intention du tour — jamais le corpus entier
 * (NO-GO explicite du ticket). Filtre D'ABORD par activation + applicabilité
 * (rôle / stade / secteur), score ENSUITE par recoupement avec le trigger : un
 * simple RAG qui scorerait sans typologie ferait remonter une règle hors
 * contexte à condition qu'elle partage un mot — exactement le second NO-GO.
 */
export function selectApplicableMethodRules(
  corpus: MethodCorpusVersion,
  params: {
    readonly intentTokens: readonly string[]
    readonly role?: string
    readonly stage?: string
    readonly sector?: string
    /** #3382 — canal du tour (`phone`, `email`, `linkedin`, `meeting`). */
    readonly channel?: (typeof PLAN_ACTION_CHANNELS)[number]
    readonly activeFeatureFlags?: readonly string[]
    readonly topK?: number
    /** BEL-SC-235 NO-GO — voir {@link resolveRuleActivation}. Absent = comportement byte-identique. */
    readonly workspaceContradictedRuleIds?: ReadonlySet<string>
  },
): MethodRule[] {
  const intentTokens = new Set(params.intentTokens.map(normalizeToken).filter(Boolean))
  if (intentTokens.size === 0) return []

  const activeFeatureFlags = params.activeFeatureFlags ?? []
  const governanceByRuleId = new Map(corpus.governance.map(entry => [entry.rule_id, entry]))
  const topK = params.topK ?? DEFAULT_TOP_K

  const scored: { rule: MethodRule; score: number }[] = []
  for (const rule of corpus.rules) {
    const governance = governanceByRuleId.get(rule.rule_id)
    if (
      !governance ||
      !resolveRuleActivation(rule, governance, activeFeatureFlags, params.workspaceContradictedRuleIds)
    )
      continue

    if (rule.applicable_roles.length > 0 && (!params.role || !rule.applicable_roles.includes(params.role))) continue
    if (rule.applicable_stages.length > 0 && (!params.stage || !rule.applicable_stages.includes(params.stage))) continue
    if (rule.applicable_sectors.length > 0 && (!params.sector || !rule.applicable_sectors.includes(params.sector)))
      continue

    if (rule.applicable_channels.length > 0 && (!params.channel || !rule.applicable_channels.includes(params.channel)))
      continue

    let score = 0
    for (const token of triggerTokens(rule.trigger)) {
      if (intentTokens.has(token)) score += 1
    }
    if (score > 0) scored.push({ rule, score })
  }

  scored.sort((a, b) => b.score - a.score || a.rule.rule_id.localeCompare(b.rule.rule_id))
  return scored.slice(0, Math.max(0, topK)).map(entry => entry.rule)
}
