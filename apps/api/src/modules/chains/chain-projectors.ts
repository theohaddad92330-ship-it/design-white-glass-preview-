import {
  LEGACY_NEED_STATUSES,
  NEED_STATUS_ORDER,
  PROJECT_STAGES,
  derivePosition,
  needStillOpenSql,
  stageOrder,
  type ChainDerivation,
  type ChainEvidence,
  type ChainKey,
  type DecisionGate,
} from '@bellum/contracts'
import { CHAIN_CATALOG } from './chain-catalog'

/**
 * LES PROJECTEURS — un parcours est une LECTURE, plus une ligne (#1503).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ILS REMPLACENT
 * ─────────────────────────────────────────────────────────────────────────
 * `ChainsService` n'avait **aucun appelant hors de son propre module** : ni la
 * création d'un besoin, ni le lancement d'un matching, ni une soumission ne le
 * touchaient. Un parcours ne pouvait donc commencer que si quelqu'un cliquait
 * « Démarrer un parcours » — et personne ne cliquait. En production : « Dossiers
 * suivis 0 » sur les sept pistes, « Étape où l'on attend le plus : Non mesuré ».
 *
 * Brancher des déclencheurs aurait produit deux vérités sur le même dossier —
 * son état réel, et ce que la ligne croit — qui divergent au premier événement
 * raté. Ici il n'y en a qu'une : **l'objet métier**. Le parcours n'est qu'une
 * façon de le lire de travers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TIENT TOUT LE RESTE
 * ─────────────────────────────────────────────────────────────────────────
 * Une étape est atteinte quand un FAIT la porte — une ligne qui existe, une
 * date, un compteur. Jamais parce que l'étape précédente l'était. C'est ce qui
 * interdit la demi-dérivation que #1507 §6 nomme : « ne jamais avancer un
 * dossier sans événement réel, ne jamais inventer une étape ». Quand rien ne
 * porte le dossier, la dérivation rend « à déterminer » AVEC sa raison.
 *
 * ⚠️ Chaque fait porte aussi sa PREUVE (#1507 §4) : la clé i18n du fait lu, sa
 * date et son compteur. « Passé à Profil proposé car 2 positionnements sont
 * partis le 03/09 » se vérifie ; « passé à Profil proposé » ne se vérifie pas.
 */

/** Une ligne rendue par la requête d'un projecteur. Les clés sont celles du SQL. */
type Row = Record<string, unknown>

/** Ce qu'un fait a constaté. `null` = le fait n'est pas établi. */
type Hit = { at: string | null; count: number | null } | null

type FactReader = {
  /** La position du flux que ce fait porte. */
  position: number
  /** La clé i18n du fait — `fact.<chaîne>.<position>`. Jamais une phrase. */
  fact: string
  read: (row: Row) => Hit
}

type ProjectorDefinition = {
  chainKey: ChainKey
  /**
   * La requête qui trouve les sujets du parcours ET les faits qu'on lit sur
   * eux. `$1` est l'espace, toujours — aucune autre valeur n'est interpolée.
   *
   * Elle rend obligatoirement `id`, `label` et `moved_at` : les trois seules
   * choses que le service sait manipuler sans connaître le métier de la chaîne.
   */
  sql: string
  facts: FactReader[]
  /** Ce que l'OBJET répond aux portes. Une porte qu'il ne sait pas dire est absente. */
  gates?: (row: Row) => Partial<Record<DecisionGate, { decided: boolean | null; reason: string | null }>>
  /**
   * La ligne porte-t-elle un état qu'aucune étape ne couvre ?
   *
   * C'est la différence entre « je n'ai rien lu » et « j'ai lu quelque chose que
   * je ne sais pas placer » — et un utilisateur n'a pas le même geste dans les
   * deux cas : l'un attend un geste métier, l'autre une correction de données.
   */
  unmappedStatus?: (row: Row) => boolean
}

/** Où en est UN dossier, avec de quoi l'afficher sans re-interroger la base. */
export type ChainProjection = {
  subjectId: string
  label: string | null
  /** Depuis quand l'objet n'a pas bougé — la seule durée que la base sait dire. */
  movedAt: string | null
  derivation: ChainDerivation
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

const num = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Une date de base en ISO.
 *
 * ⚠️ Une colonne `date` revient en OBJET dans une requête brute, une
 * `timestamptz` aussi, et une agrégation peut rendre une chaîne. Les trois
 * passent ici, une fois, plutôt que dans quarante lecteurs de faits.
 */
const iso = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  return null
}

/** Le fait est établi : voici sa date et son compteur. */
const hit = (at: unknown, count: number | null = null): Hit => ({ at: iso(at), count })

/** Le fait est établi PARCE QU'une date existe — le motif le plus fréquent. */
const dated = (at: unknown): Hit => (iso(at) === null ? null : { at: iso(at), count: null })

/** Le fait est établi parce qu'il y a AU MOINS un objet — et on dit combien. */
const counted = (value: unknown, at: unknown = null): Hit => {
  const total = num(value)
  return total > 0 ? { at: iso(at), count: total } : null
}

/** Le fait est établi si la condition tient. */
const when = (condition: boolean, at: unknown = null, count: number | null = null): Hit =>
  condition ? { at: iso(at), count } : null

/** Un stade lisible du contrat — sinon la ligne porte un état non couvert. */
const isProjectStage = (value: string): value is (typeof PROJECT_STAGES)[number] =>
  (PROJECT_STAGES as readonly string[]).includes(value)

const fact = (position: number, chainKey: ChainKey, read: (row: Row) => Hit): FactReader => ({
  position,
  fact: `fact.${chainKey}.${position}`,
  read,
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. OUVERTURE DE COMPTE — sujet : un compte
 * ═══════════════════════════════════════════════════════════════════════════ */
const ouvertureCompte: ProjectorDefinition = {
  chainKey: 'ouverture_compte',
  sql: `
    SELECT a.id::text AS id,
           a.company_name AS label,
           GREATEST(a.updated_at, a.created_at) AS moved_at,
           a.created_at AS detected_at,
           a.status AS analysis_status,
           a.priority_score,
           a.priority_gate,
           a.gate_reason,
           a.commercial_status,
           a.signals_refreshed_at,
           CASE WHEN jsonb_typeof(a.recent_signals) = 'array'
                THEN jsonb_array_length(a.recent_signals) ELSE 0 END AS signal_count,
           (SELECT max(r.created_at) FROM analysis_runs r WHERE r.account_id = a.id) AS analysis_at,
           (SELECT count(*) FROM account_entities e WHERE e.account_id = a.id) AS entity_count,
           (SELECT count(*) FROM contacts c WHERE c.account_id = a.id) AS contact_count,
           (SELECT count(*) FROM contacts c
             WHERE c.account_id = a.id AND (c.email IS NOT NULL OR c.phone IS NOT NULL)) AS enriched_count,
           (SELECT max(p.created_at) FROM action_plans p WHERE p.account_id = a.id) AS plan_at,
           (SELECT count(*) FROM attack_angles g WHERE g.account_id = a.id) AS angle_count
      FROM accounts a
     WHERE a.workspace_id = $1 AND a.merged_into_id IS NULL`,
  facts: [
    // La ligne EXISTE : c'est le seul fait de cette étape, et il est vrai.
    fact(1, 'ouverture_compte', row => hit(row.detected_at)),
    fact(2, 'ouverture_compte', row => dated(row.analysis_at)),
    fact(3, 'ouverture_compte', row => counted(row.signal_count, row.signals_refreshed_at)),
    fact(4, 'ouverture_compte', row =>
      when(row.priority_score !== null && row.priority_score !== undefined, null, num(row.priority_score)),
    ),
    fact(5, 'ouverture_compte', row => counted(row.entity_count)),
    fact(6, 'ouverture_compte', row => counted(row.contact_count)),
    fact(7, 'ouverture_compte', row => counted(row.enriched_count)),
    fact(8, 'ouverture_compte', row => dated(row.plan_at)),
    fact(9, 'ouverture_compte', row => counted(row.angle_count)),
    // Le compte est SUIVI : c'est ce que dit son statut commercial, et rien d'autre.
    fact(10, 'ouverture_compte', row =>
      when(['opportunity', 'customer'].includes(text(row.commercial_status) ?? ''), row.moved_at),
    ),
  ],
  gates: row => ({
    account_priority: {
      decided: row.priority_gate === 'pending' ? null : row.priority_gate === 'prioritised',
      reason: text(row.gate_reason),
    },
  }),
  // Une analyse en erreur a produit un dossier qu'aucune étape ne décrit :
  // le dire vaut mieux que le placer à l'étape 1 comme un compte neuf.
  unmappedStatus: row => text(row.analysis_status) === 'error',
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. ACQUISITION — sujet : un compte déjà suivi
 * ═══════════════════════════════════════════════════════════════════════════ */
const acquisition: ProjectorDefinition = {
  chainKey: 'acquisition',
  sql: `
    SELECT a.id::text AS id,
           a.company_name AS label,
           GREATEST(a.updated_at, a.created_at) AS moved_at,
           (SELECT count(*) FROM contacts c
             WHERE c.account_id = a.id AND (c.email IS NOT NULL OR c.phone IS NOT NULL)) AS qualified_count,
           (SELECT max(g.created_at) FROM attack_angles g
             WHERE g.account_id = a.id AND g.is_recommended IS TRUE) AS angle_at,
           (SELECT max(c.updated_at) FROM contacts c
             WHERE c.account_id = a.id AND c.email_message IS NOT NULL) AS draft_at,
           (SELECT max(v.occurred_at) FROM activities v
             WHERE v.account_id = a.id AND v.kind = 'email' AND v.direction = 'outbound') AS sent_at,
           (SELECT count(*) FROM activities v
             WHERE v.account_id = a.id AND v.kind = 'email' AND v.direction = 'outbound') AS sent_count,
           (SELECT max(s.created_at) FROM outreach_sequences s
              JOIN contacts c ON c.id = s.contact_id
             WHERE c.account_id = a.id) AS sequence_at,
           (SELECT max(v.occurred_at) FROM activities v
             WHERE v.account_id = a.id AND v.kind = 'email' AND v.direction = 'inbound') AS reply_at,
           (SELECT max(v.occurred_at) FROM activities v
             WHERE v.account_id = a.id AND v.kind = 'meeting') AS meeting_at,
           -- #2558.1 — un besoin existe sans projet : le compte se lit sur le
           -- BESOIN. Passer par la table des projets sous-comptait le compte de
           -- tous ses besoins de régie, qui n'ont pas de projet.
           (SELECT count(*) FROM project_needs n
             WHERE n.account_id = a.id) AS need_count,
           (SELECT min(n.created_at) FROM project_needs n
             WHERE n.account_id = a.id) AS need_at
      FROM accounts a
     WHERE a.workspace_id = $1 AND a.merged_into_id IS NULL
       AND a.commercial_status IN ('watching', 'opportunity', 'customer')`,
  facts: [
    fact(1, 'acquisition', row => counted(row.qualified_count)),
    fact(2, 'acquisition', row => dated(row.angle_at)),
    fact(3, 'acquisition', row => dated(row.draft_at)),
    fact(4, 'acquisition', row => (iso(row.sent_at) === null ? null : hit(row.sent_at, num(row.sent_count)))),
    fact(5, 'acquisition', row => dated(row.sequence_at)),
    fact(6, 'acquisition', row => dated(row.reply_at)),
    fact(7, 'acquisition', row => dated(row.meeting_at)),
    fact(8, 'acquisition', row => counted(row.need_count, row.need_at)),
  ],
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. PROSPECTION INVERSÉE — sujet : un consultant disponible
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Le catalogue déclarait `subjectType: 'account'` alors que TOUTES ses
 * étapes parlent d'un consultant qu'on pousse — « Consultant disponible »,
 * « Compétences retenues », « Comptes cibles ». Sur un compte, l'étape 1 n'a
 * aucun fait qui la porte ; sur un consultant, `availability` la porte
 * exactement. Le sujet est corrigé dans le catalogue, et c'est le genre de
 * défaut qu'une position écrite à la main pouvait masquer indéfiniment.
 */
const prospectionInversee: ProjectorDefinition = {
  chainKey: 'prospection_inversee',
  sql: `
    SELECT c.id::text AS id,
           c.full_name AS label,
           GREATEST(c.updated_at, c.created_at) AS moved_at,
           c.availability,
           c.available_from,
           c.updated_at AS availability_at,
           (SELECT count(*) FROM consultant_skills s WHERE s.consultant_id = c.id) AS skill_count,
           (SELECT count(*) FROM consultant_push_feedback f WHERE f.consultant_id = c.id) AS push_count,
           (SELECT min(f.created_at) FROM consultant_push_feedback f WHERE f.consultant_id = c.id) AS push_at,
           (SELECT count(*) FROM consultant_push_feedback f
             WHERE f.consultant_id = c.id AND f.opportunity_id IS NOT NULL) AS angled_count,
           (SELECT max(v.occurred_at) FROM activities v
              JOIN consultant_push_feedback f ON f.opportunity_id = v.project_id
             WHERE f.consultant_id = c.id AND v.kind = 'email' AND v.direction = 'outbound') AS message_at,
           (SELECT max(v.occurred_at) FROM activities v
              JOIN consultant_push_feedback f ON f.opportunity_id = v.project_id
             WHERE f.consultant_id = c.id AND v.direction = 'inbound') AS reply_at,
           (SELECT max(f.created_at) FROM consultant_push_feedback f
             WHERE f.consultant_id = c.id AND f.outcome = 'retenu') AS retained_at
      FROM consultants c
     WHERE c.workspace_id = $1 AND c.archived_at IS NULL`,
  facts: [
    // `inconnu` n'est JAMAIS présenté comme disponible — la règle de la colonne.
    fact(1, 'prospection_inversee', row =>
      when(
        ['immediate', 'sous_1_mois'].includes(text(row.availability) ?? ''),
        row.available_from ?? row.availability_at,
      ),
    ),
    fact(2, 'prospection_inversee', row => counted(row.skill_count)),
    fact(3, 'prospection_inversee', row => counted(row.push_count, row.push_at)),
    fact(4, 'prospection_inversee', row => counted(row.angled_count)),
    fact(5, 'prospection_inversee', row => dated(row.message_at)),
    fact(6, 'prospection_inversee', row => dated(row.reply_at)),
    fact(7, 'prospection_inversee', row => dated(row.retained_at)),
  ],
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. SOURCING ET MATCHING — sujet : un besoin
 * ═══════════════════════════════════════════════════════════════════════════ */
const sourcingMatching: ProjectorDefinition = {
  chainKey: 'sourcing_matching',
  sql: `
    SELECT n.id::text AS id,
           n.title AS label,
           GREATEST(n.updated_at, n.created_at) AS moved_at,
           n.created_at AS opened_at,
           n.status,
           n.staffable,
           n.staffable_reason,
           CASE WHEN jsonb_typeof(n.skills) = 'array' THEN jsonb_array_length(n.skills) ELSE 0 END AS skill_count,
           (SELECT count(*) FROM match_runs m WHERE m.need_id = n.id) AS match_count,
           (SELECT max(m.created_at) FROM match_runs m WHERE m.need_id = n.id) AS match_at,
           (SELECT count(*) FROM submissions s WHERE s.need_id = n.id) AS submission_count,
           (SELECT min(s.created_at) FROM submissions s WHERE s.need_id = n.id) AS retained_at,
           (SELECT max(l.created_at) FROM shortlists l
             WHERE l.need_id = n.id AND l.status <> 'draft') AS shortlist_at,
           (SELECT count(*) FROM submissions s
             WHERE s.need_id = n.id AND s.cv_snapshot IS NOT NULL) AS dossier_count,
           (SELECT count(*) FROM submissions s WHERE s.need_id = n.id AND s.submitted_at IS NOT NULL) AS sent_count,
           (SELECT min(s.submitted_at) FROM submissions s WHERE s.need_id = n.id) AS sent_at,
           (SELECT max(s.first_feedback_at) FROM submissions s WHERE s.need_id = n.id) AS feedback_at,
           (SELECT max(i.scheduled_at) FROM interviews i
              JOIN submissions s ON s.id = i.submission_id
             WHERE s.need_id = n.id AND i.outcome <> 'pending') AS interview_at,
           (SELECT max(s.closed_at) FROM submissions s WHERE s.need_id = n.id) AS decided_at,
           (SELECT max(t.updated_at) FROM mission_commercial_terms t
              JOIN missions ms ON ms.id = t.mission_id
             WHERE ms.need_id = n.id) AS terms_at
      FROM project_needs n
     WHERE n.workspace_id = $1
       AND ${needStillOpenSql('n.status')}`,
  facts: [
    fact(1, 'sourcing_matching', row => hit(row.opened_at)),
    fact(2, 'sourcing_matching', row => counted(row.skill_count)),
    fact(3, 'sourcing_matching', row => counted(row.match_count, row.match_at)),
    fact(4, 'sourcing_matching', row => counted(row.submission_count, row.retained_at)),
    fact(5, 'sourcing_matching', row => dated(row.shortlist_at)),
    fact(6, 'sourcing_matching', row => counted(row.dossier_count)),
    fact(7, 'sourcing_matching', row => counted(row.sent_count, row.sent_at)),
    // Ces quatre-là passaient pour « hors outil » ; ils ne le sont pas. Le
    // retour du client, l'entretien, la décision et les conditions ont chacun
    // leur table — c'est le catalogue qui les rangeait mal.
    fact(8, 'sourcing_matching', row => dated(row.feedback_at)),
    fact(9, 'sourcing_matching', row => dated(row.interview_at)),
    fact(10, 'sourcing_matching', row => dated(row.decided_at)),
    fact(11, 'sourcing_matching', row => dated(row.terms_at)),
  ],
  gates: row => ({
    need_staffable: {
      decided: row.staffable === 'unknown' ? null : row.staffable === 'yes',
      reason: text(row.staffable_reason),
    },
  }),
  unmappedStatus: row => {
    const status = text(row.status)
    if (status === null) return true
    const known: readonly string[] = [...NEED_STATUS_ORDER, ...LEGACY_NEED_STATUSES]
    return !known.includes(status)
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. APPEL D'OFFRES ET CONVERSION — sujet : un projet
 * ═══════════════════════════════════════════════════════════════════════════ */
const pushAoConversion: ProjectorDefinition = {
  chainKey: 'push_ao_conversion',
  sql: `
    SELECT o.id::text AS id,
           o.label,
           GREATEST(o.updated_at, o.first_detected_at) AS moved_at,
           o.stage,
           o.outcome,
           o.loss_reason,
           o.closed_at,
           (SELECT max(r.created_at) FROM rfps r WHERE r.account_id = o.account_id) AS rfp_at,
           -- Le garde-fou est un CASE, pas un AND : l'ordre d'évaluation des
           -- conditions n'est pas garanti en SQL, et jsonb_array_length sur
           -- autre chose qu'un tableau LEVE. C'est la forme utilisee partout
           -- ailleurs dans ce fichier.
           (SELECT count(*) FROM rfps r
             WHERE r.account_id = o.account_id
               AND CASE WHEN jsonb_typeof(r.requirements) = 'array'
                        THEN jsonb_array_length(r.requirements) ELSE 0 END > 0) AS summarised_count,
           (SELECT max(r.updated_at) FROM rfps r
             WHERE r.account_id = o.account_id AND r.decision IS NOT NULL) AS bid_at,
           (SELECT count(*) FROM submissions s WHERE s.project_id = o.id) AS profile_count,
           (SELECT min(s.created_at) FROM submissions s WHERE s.project_id = o.id) AS profile_at,
           (SELECT count(*) FROM proofs p WHERE p.account_id = o.account_id) AS proof_count,
           (SELECT count(*) FROM submissions s
             WHERE s.project_id = o.id AND s.submitted_at IS NOT NULL) AS sent_count,
           (SELECT min(s.submitted_at) FROM submissions s WHERE s.project_id = o.id) AS sent_at,
           (SELECT max(i.scheduled_at) FROM interviews i
              JOIN submissions s ON s.id = i.submission_id
             WHERE s.project_id = o.id AND i.outcome <> 'pending') AS interview_at
      FROM opportunities o
     WHERE o.workspace_id = $1
       -- L'APPARTENANCE au parcours : un projet n'est dans la chaine des appels
       -- d'offres que si son compte en a recu un. Sans ce filtre, les 651
       -- projets de l'espace y entraient, et les preuves du COMPTE suffisaient a
       -- placer 147 d'entre eux a « Preuves rassemblees » — une etape qu'aucun
       -- fait du projet ne portait. Mesure en production le 05/09/2026.
       AND EXISTS (SELECT 1 FROM rfps r WHERE r.account_id = o.account_id)`,
  facts: [
    fact(1, 'push_ao_conversion', row => dated(row.rfp_at)),
    fact(2, 'push_ao_conversion', row => counted(row.summarised_count)),
    fact(3, 'push_ao_conversion', row => dated(row.bid_at)),
    fact(4, 'push_ao_conversion', row => counted(row.profile_count, row.profile_at)),
    fact(5, 'push_ao_conversion', row => counted(row.proof_count)),
    fact(6, 'push_ao_conversion', row => counted(row.sent_count, row.sent_at)),
    fact(7, 'push_ao_conversion', row => dated(row.interview_at)),
    fact(8, 'push_ao_conversion', row => when(text(row.outcome) !== null, row.closed_at)),
  ],
  gates: row => {
    const stage = text(row.stage)
    /*
     * La porte de l'entretien se lit sur l'étape du PROJET.
     *
     * ⚠️ Le sous-ensemble ne se tape pas : il se DÉDUIT de l'ordre du contrat.
     * Écrire `['profiles_submitted','negotiation','won','lost']` recréerait une
     * quatrième définition de « où en est un projet » — GA-57 refuse, et elle a
     * raison : trois copies existaient déjà, avec trois contenus différents.
     *
     * Avant que des profils soient présentés, il n'y a rien à trancher — donc
     * pas de porte, donc aucune attente affichée à quelqu'un qui n'attend rien.
     * `dormant` ne tranche pas non plus : il dit « plus rien ne bouge », pas
     * « le client a refusé l'entretien ».
     */
    if (stage === null || !isProjectStage(stage)) return {}
    if (stageOrder(stage) < stageOrder('profiles_submitted')) return {}
    if (stage === 'profiles_submitted') return { interview_go: { decided: null, reason: null } }
    if (stage === 'dormant') return {}
    return { interview_go: { decided: stage !== 'lost', reason: stage === 'lost' ? text(row.loss_reason) : null } }
  },
  unmappedStatus: row => text(row.stage) === null,
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. PASSAGE RANG 2 → RANG 1 — sujet : un compte
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ AUCUN FILTRE DE STATUT COMMERCIAL, et c'est une correction mesurée.
 *
 * La requête ne gardait que les comptes en « opportunité » ou « client ». Sur
 * l'espace de production, AUCUN compte ne porte ces statuts — l'étape 10
 * d'« Ouverture de compte » comptait zéro dossier — alors que onze missions
 * existent. Le parcours était donc vide pour une raison qui n'a rien à voir
 * avec lui.
 *
 * L'appartenance se lit sur le PREMIER FAIT, comme dans toutes les autres
 * chaînes depuis le 05/09 : on est chez ce client si on sait par où l'on entre
 * (le mode d'accès) ou si on y est déjà entré (une mission). Un second filtre
 * qui répond à la même question dans d'autres termes finit toujours par la
 * contredire.
 */
const rang2Rang1: ProjectorDefinition = {
  chainKey: 'rang2_rang1',
  sql: `
    SELECT a.id::text AS id,
           a.company_name AS label,
           GREATEST(a.updated_at, a.created_at) AS moved_at,
           -- « Position actuelle constatee » : soit on sait PAR OU l'on entre
           -- (le mode d'acces), soit on est deja entre (une mission existe).
           -- Le predicat ne gardait que le premier, et access_mode n'est
           -- renseigne nulle part : le parcours entier etait inatteignable —
           -- zero dossier sur les sept etapes. Mesure en production le 05/09.
           (SELECT count(*) FROM opportunities o
             WHERE o.account_id = a.id AND o.access_mode IS NOT NULL) AS access_mode_count,
           (SELECT count(*) FROM missions m WHERE m.account_id = a.id) AS mission_count,
           (SELECT min(m.created_at) FROM missions m WHERE m.account_id = a.id) AS mission_at,
           (SELECT count(*) FROM rex_entries r WHERE r.account_id = a.id) AS rex_count,
           (SELECT max(r.collected_at) FROM rex_entries r WHERE r.account_id = a.id) AS rex_at,
           (SELECT count(*) FROM proofs p WHERE p.account_id = a.id) AS proof_count,
           -- strength = 'strong' n'existait PAS : les trois valeurs sont
           -- measured, attested, declared. Le predicat etait INERTE : il rendait
           -- toujours zero, donc l'etape « Preuves qualifiees » n'etait jamais
           -- atteinte et la porte refusait toujours. Un litteral hors
           -- enumeration ne leve rien et ne filtre rien. Garde ci-dessous.
           (SELECT count(*) FROM proofs p
             WHERE p.account_id = a.id AND p.strength <> 'declared') AS qualified_proof_count,
           (SELECT count(*) FROM testimonials t
             WHERE t.account_id = a.id AND t.publishable IS TRUE) AS testimonial_count,
           (SELECT max(t.created_at) FROM testimonials t WHERE t.account_id = a.id) AS testimonial_at,
           (SELECT max(o.updated_at) FROM opportunities o
             WHERE o.account_id = a.id
               AND o.access_mode IN ('direct_reference', 'direct_hors_panel')) AS direct_at
      FROM accounts a
     WHERE a.workspace_id = $1 AND a.merged_into_id IS NULL`,
  facts: [
    fact(1, 'rang2_rang1', row => counted(num(row.access_mode_count) + num(row.mission_count), row.mission_at)),
    fact(2, 'rang2_rang1', row => counted(row.mission_count, row.mission_at)),
    fact(3, 'rang2_rang1', row => counted(row.rex_count, row.rex_at)),
    fact(4, 'rang2_rang1', row => counted(row.qualified_proof_count)),
    fact(5, 'rang2_rang1', row => counted(row.testimonial_count, row.testimonial_at)),
    fact(6, 'rang2_rang1', row => dated(row.direct_at)),
  ],
  gates: row => ({
    // Aucune preuve du tout : personne n'a encore rien à trancher, la porte se
    // tait. Des preuves, mais aucune solide : la décision attend. C'est la seule
    // lecture de cette porte qui n'invente rien.
    proof_sufficiency:
      num(row.proof_count) === 0
        ? { decided: null, reason: null }
        : { decided: num(row.qualified_proof_count) > 0, reason: null },
  }),
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. ONBOARDING ET DELIVERY — sujet : une mission
 * ═══════════════════════════════════════════════════════════════════════════ */
const onboardingDelivery: ProjectorDefinition = {
  chainKey: 'onboarding_delivery',
  sql: `
    SELECT m.id::text AS id,
           m.label,
           GREATEST(m.updated_at, m.created_at) AS moved_at,
           m.created_at,
           m.status,
           m.started_on,
           m.daily_rate,
           m.stage_entered_at,
           (SELECT count(*) FROM mission_assignments s WHERE s.mission_id = m.id) AS assignment_count,
           (SELECT min(s.created_at) FROM mission_assignments s WHERE s.mission_id = m.id) AS assigned_at,
           (SELECT count(*) FROM mission_timesheets t WHERE t.mission_id = m.id) AS timesheet_count,
           (SELECT max(t.updated_at) FROM mission_timesheets t WHERE t.mission_id = m.id) AS timesheet_at,
           (SELECT count(*) FROM invoice_readiness i WHERE i.mission_id = m.id) AS invoice_count,
           (SELECT max(i.updated_at) FROM invoice_readiness i WHERE i.mission_id = m.id) AS invoice_at,
           (SELECT count(*) FROM invoice_readiness i
             WHERE i.mission_id = m.id AND i.state = 'blocked') AS invoice_blocked_count,
           (SELECT max(t.updated_at) FROM mission_commercial_terms t WHERE t.mission_id = m.id) AS terms_at,
           (SELECT count(*) FROM interventions v
             WHERE v.subject_type = 'mission' AND v.subject_id = m.id) AS risk_count,
           (SELECT count(*) FROM interventions v
             WHERE v.subject_type = 'mission' AND v.subject_id = m.id AND v.state <> 'resolved') AS open_risk_count
      FROM missions m
     WHERE m.workspace_id = $1`,
  facts: [
    fact(1, 'onboarding_delivery', row => hit(row.created_at)),
    fact(2, 'onboarding_delivery', row =>
      when(row.daily_rate !== null && row.daily_rate !== undefined, row.terms_at ?? row.created_at),
    ),
    fact(3, 'onboarding_delivery', row => counted(row.assignment_count, row.assigned_at)),
    fact(4, 'onboarding_delivery', row => when(text(row.status) === 'onboarding', row.stage_entered_at)),
    fact(5, 'onboarding_delivery', row => dated(row.started_on)),
    fact(6, 'onboarding_delivery', row => counted(row.timesheet_count, row.timesheet_at)),
    fact(7, 'onboarding_delivery', row => counted(row.invoice_count, row.invoice_at)),
    fact(8, 'onboarding_delivery', row => when(text(row.status) === 'renewed', row.stage_entered_at)),
  ],
  gates: row => ({
    // Aucune intervention ouverte sur la mission : le risque est sous contrôle,
    // et c'est un fait, pas un optimisme — l'absence d'alerte EST la réponse.
    delivery_risk:
      num(row.risk_count) === 0
        ? { decided: true, reason: null }
        : { decided: num(row.open_risk_count) === 0, reason: null },
    invoice_readiness:
      num(row.invoice_count) === 0
        ? { decided: null, reason: null }
        : { decided: num(row.invoice_blocked_count) === 0, reason: null },
  }),
}

const DEFINITIONS: readonly ProjectorDefinition[] = [
  ouvertureCompte,
  acquisition,
  prospectionInversee,
  sourcingMatching,
  pushAoConversion,
  rang2Rang1,
  onboardingDelivery,
]

/**
 * Le projecteur d'une chaîne : sa requête, et la fonction PURE qui place ses
 * lignes.
 *
 * ⚠️ Les lecteurs de faits ne lisent que des clés que la requête voisine
 * produit, et `chain-projectors.spec.ts` compare les deux listes. Un lecteur qui
 * viserait une colonne absente lirait `undefined` — donc un fait silencieusement
 * jamais établi, et une étape que plus personne n'atteint. C'est exactement le
 * genre de panne qui ne rougit nulle part.
 */
type ChainProjector = {
  readonly chainKey: ChainKey
  readonly sql: string
  /** Les colonnes que ses faits LISENT — la garde s'en sert, et rien d'autre. */
  readonly readColumns: readonly string[]
  /** Les positions du flux qu'il sait porter. Une étape absente d'ici n'est
   *  JAMAIS atteinte : tous les dossiers s'arrêteraient avant elle. */
  readonly factPositions: readonly number[]
  readonly project: (rows: readonly Row[]) => ChainProjection[]
}

/**
 * Les colonnes qu'un projecteur lit vraiment, constatées en l'EXÉCUTANT sur une
 * ligne-piège qui note chaque accès.
 *
 * Une liste écrite à la main aurait divergé au premier fait ajouté ; celle-ci ne
 * peut pas, parce qu'elle est le résultat de la lecture elle-même.
 */
function observedColumns(definition: ProjectorDefinition): string[] {
  const seen = new Set<string>()
  const spy = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (typeof key === 'string') seen.add(key)
        return undefined
      },
      has: () => true,
    },
  ) as Row
  for (const reader of definition.facts) reader.read(spy)
  definition.gates?.(spy)
  definition.unmappedStatus?.(spy)
  return [...seen]
}

function build(definition: ProjectorDefinition): ChainProjector {
  const chain = CHAIN_CATALOG.find(entry => entry.key === definition.chainKey)
  if (!chain) throw new Error(`Projecteur sans chaîne : ${definition.chainKey}`)

  return {
    chainKey: definition.chainKey,
    sql: definition.sql,
    readColumns: observedColumns(definition),
    factPositions: definition.facts.map(reader => reader.position),
    project: rows =>
      rows.flatMap(row => {
        const evidence: ChainEvidence[] = []
        for (const reader of definition.facts) {
          const found = reader.read(row)
          if (found) evidence.push({ position: reader.position, fact: reader.fact, at: found.at, count: found.count })
        }
        /*
         * L'ÉTAT NON COUVERT PASSE DEVANT, et ce n'est pas un détail d'ordre.
         *
         * La plupart des chaînes ont une première étape que l'EXISTENCE de la
         * ligne suffit à établir — « Compte détecté », « Besoin ouvert »,
         * « Mission créée ». Si l'objet porte par ailleurs un état qu'aucune
         * étape ne décrit, le placer là revient à affirmer « ce besoin est
         * ouvert » d'un dossier dont on vient de constater qu'on ne sait pas le
         * lire. C'est l'étape inventée que le §6 de #1507 interdit, sous sa
         * forme la plus discrète : plausible, et fausse.
         *
         * ⚠️ C'est aussi ce qui rend `unmapped_status` ATTEIGNABLE. Placé après
         * la dérivation, il ne se serait jamais déclenché sur ces chaînes-là —
         * une raison d'affichage qu'aucun chemin ne produit.
         */
        const derivation: ChainDerivation | null =
          definition.unmappedStatus?.(row) === true
            ? { kind: 'undetermined', reason: 'unmapped_status', evidence }
            : derivePosition(chain, evidence, definition.gates?.(row) ?? {})

        // `null` = aucun fait ne porte ce dossier, donc il n'est pas dans ce
        // parcours. Le rendre « à déterminer » ferait entrer toute la table.
        if (derivation === null) return []
        return [{ subjectId: String(row.id), label: text(row.label), movedAt: iso(row.moved_at), derivation }]
      }),
  }
}

export const CHAIN_PROJECTORS: readonly ChainProjector[] = DEFINITIONS.map(build)

export function findProjector(chainKey: ChainKey): ChainProjector | undefined {
  return CHAIN_PROJECTORS.find(projector => projector.chainKey === chainKey)
}
