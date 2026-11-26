import { z } from 'zod'

/**
 * BEL-SC-224 (#3253, P0) — DIAGNOSTIC COMMERCIAL DU MAILLON FAIBLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PROJECTION SUR LES MAISONS CANONIQUES, JAMAIS UN DEUXIÈME SCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit (instruction commune #3249, règles 1-2) : `get_workspace_health`
 * (`apps/api/src/modules/laura/laura-detector.ts`) existe déjà et répond à une
 * question DIFFÉRENTE — sept axes d'ADOPTION PRODUIT (connecteurs, profondeur,
 * activation…), rendus comme une CAUSE unique, jamais un score. Le ticket
 * BEL-SC-224 demande un diagnostic du PROCESSUS COMMERCIAL lui-même (seize
 * familles nommées : pipeline, ciblage, qualification, delivery, rituels…),
 * avec preuves, contre-preuves, impact business et expérience recommandée —
 * une structure que `get_workspace_health` ne porte pas et n'a pas vocation à
 * porter. Verdict : KEEP `get_workspace_health` (toujours la meilleure
 * réponse à « mon espace est-il bien configuré »), ce module est un objet
 * CANONIQUE NOUVEAU, pas un doublon.
 *
 * Ce fichier ne recrée NI un score de compte (`AccountAnalysis` reste la seule
 * maison Compte), NI une qualification (`Besoin` reste la seule maison
 * qualification) : il LIT des signaux dérivés des maisons canoniques
 * existantes (Compte, Action, Opportunité, Talent) et les PROJETTE en un
 * diagnostic. `WeakestLinkAccountSignal` n'est pas un compte — c'est la vue
 * minimale que la maison canonique Compte expose à ce diagnostic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO-GO DU TICKET, APPLIQUÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le diagnostic est basé uniquement sur la perception déclarée de
 * l'utilisateur ou sur un score opaque. » → `deriveWeakestLinkDiagnosis` ne lit
 * QUE des signaux dérivés de données réelles (comptes, pipeline, vivier,
 * capacité) ; une famille sans signal disponible ne devient jamais un score à
 * zéro, elle sort du dénominateur (`not_evaluable_families`, doctrine
 * GA-18/19). Aucun champ `confidence` numérique : `low | medium | high`
 * (doctrine c26, refusée six fois : aucune PROBABILITÉ affichée). Bellum
 * sélectionne UN maillon faible principal et ne demande jamais de tout
 * résoudre en même temps (`actions_to_stop` nomme ce qu'on arrête, pas la
 * liste de tout ce qui ne va pas).
 */

// ── Les seize familles nommées par le ticket, verbatim ─────────────────────

export const BOTTLENECK_FAMILIES = [
  'pas_de_pipeline_qualifie',
  'comptes_ouverts_non_etendus',
  'offre_ou_positionnement_trop_larges',
  'mauvais_ciblage',
  'absence_de_voie_dacces',
  'qualification_insuffisante',
  'vivier_insuffisant',
  'talents_mal_securises',
  'marge_trop_faible',
  'delivery_fragile',
  'absence_de_suivi_ou_de_prochaine_action',
  'donnees_dispersees',
  'absence_de_rituels',
  'dependance_a_une_seule_personne',
  'capacite_commerciale_trop_faible',
  'activite_mal_priorisee',
] as const
export const bottleneckFamilySchema = z.enum(BOTTLENECK_FAMILIES)
export type BottleneckFamily = (typeof BOTTLENECK_FAMILIES)[number]

/** Une confiance QUALITATIVE, jamais un pourcentage (doctrine : aucune
 *  probabilité affichée — c26, refusée six fois). */
export const bottleneckConfidenceSchema = z.enum(['low', 'medium', 'high'])
export type BottleneckConfidence = z.infer<typeof bottleneckConfidenceSchema>

export const notEvaluableBottleneckFamilySchema = z.object({
  family: bottleneckFamilySchema,
  reason: z.string().min(1),
})
export type NotEvaluableBottleneckFamily = z.infer<typeof notEvaluableBottleneckFamilySchema>

export const weakestLinkBottleneckSchema = z.object({
  family: bottleneckFamilySchema,
  business_impact: z.string().min(1),
  supporting_evidence: z.array(z.string().min(1)),
  contradictory_evidence: z.array(z.string().min(1)),
  recommended_experiment: z.string().min(1),
  success_metric: z.string().min(1),
  /** ISO date (YYYY-MM-DD) — jamais un horodatage précis, ce n'est pas une
   *  échéance à la minute. */
  review_date: z.string().min(1),
  /** Doctrine du ticket : signale des problèmes secondaires, mais ne demande
   *  jamais de tout résoudre en même temps — ce que le commercial ARRÊTE. */
  actions_to_stop: z.array(z.string().min(1)),
})
export type WeakestLinkBottleneck = z.infer<typeof weakestLinkBottleneckSchema>

export const weakestLinkDiagnosisSchema = z.object({
  computed_at: z.string().min(1),
  /** `null` = pas assez de signal pour désigner un maillon principal —
   *  jamais un maillon inventé par défaut. */
  primary_bottleneck: weakestLinkBottleneckSchema.nullable(),
  secondary_bottlenecks: z.array(weakestLinkBottleneckSchema),
  not_evaluable_families: z.array(notEvaluableBottleneckFamilySchema),
  confidence: bottleneckConfidenceSchema,
  /** Non nul uniquement quand le maillon principal a changé depuis le dernier
   *  diagnostic — doctrine « explication lorsqu'il change ». */
  change_explanation: z.string().nullable(),
})
export type WeakestLinkDiagnosis = z.infer<typeof weakestLinkDiagnosisSchema>

// ── Signaux d'entrée — dérivés des maisons canoniques, jamais recalculés ────

export type WeakestLinkAccountSignal = {
  readonly account_id: string
  readonly name: string
  readonly is_open: boolean
  readonly has_next_action: boolean
  readonly has_identified_sponsor: boolean
}

export type WeakestLinkPipelineSignal = {
  readonly qualified_count: number
  readonly total_count: number
} | null

export type WeakestLinkBenchSignal = {
  readonly available_count: number
  readonly total_count: number
} | null

export type WeakestLinkCommercialCapacitySignal = {
  readonly available_hours_per_week: number | null
  readonly open_account_count: number
} | null

/**
 * #3294 (#3253.a) — la marge du portefeuille de missions ACTIVES. Seules les missions
 * chiffrées (tarif ET coût) entrent dans `measured_count` ; les autres sont NOMMÉES
 * (`unmeasured_count`) et sortent du dénominateur (« non mesuré » n'est jamais 0).
 * `floor_percent` est le plancher de la cible `gross_margin` (`KPI_TARGETS`, GA-26) :
 * il voyage avec le signal, il n'est jamais recopié ici.
 */
export type WeakestLinkMarginSignal = {
  readonly measured_count: number
  readonly below_floor_count: number
  readonly unmeasured_count: number
  readonly floor_percent: number
} | null

/**
 * #3294 (#3253.a) — les rituels de l'équipe, lus de la marque légère « tenu »
 * (`workspace_ritual_last_held`). `null` / `marked_count: 0` = AUCUN rituel jamais
 * marqué : on ne sait pas s'il y en a, ce n'est pas « aucun rituel » (non mesuré,
 * jamais 0). `weekly_days_since` = jours depuis le dernier point hebdomadaire marqué,
 * `null` = jamais marqué alors que d'autres le sont.
 */
export type WeakestLinkRitualSignal = {
  readonly marked_count: number
  readonly weekly_days_since: number | null
} | null

/**
 * #3294 (#3253.a) — la répartition des comptes OUVERTS entre porteurs
 * (`accounts.assigned_to`). Que des COMPTES, jamais un nom : aucun classement
 * nominatif de commerciaux (doctrine). Les comptes sans porteur sont nommés à part.
 */
export type WeakestLinkOwnershipSignal = {
  readonly assigned_open_count: number
  readonly unassigned_open_count: number
  readonly owners_count: number
  readonly top_owner_count: number
} | null

/**
 * X64 / #3294 (#3253.a) — la voie d'accès des comptes OUVERTS : combien n'ont AUCUN contact
 * enregistré (`contacts.account_id`). Que des COMPTES, jamais un nom. `null` = lecture
 * impossible : non mesuré, jamais « aucun compte sans contact ».
 */
export type WeakestLinkAccessPathSignal = {
  readonly measured_count: number
  readonly without_contact_count: number
} | null

/**
 * X64 / #3294 (#3253.a) — la sécurité des talents en mission : parmi les missions ACTIVES
 * qui portent une date de fin (`missions.ends_on`), combien finissent dans l'horizon sans
 * suite décidée (`renewal_status` ni reconduite, ni annoncée, ni repositionnement lancé).
 * Une mission sans date de fin n'est pas « sans suite » : elle est comptée à part
 * (`unmeasured_count`) et sort du dénominateur. Que des missions, jamais un consultant nommé.
 */
export type WeakestLinkTalentSecuritySignal = {
  readonly measured_count: number
  readonly unsecured_count: number
  readonly unmeasured_count: number
  readonly horizon_days: number
} | null

/**
 * #3294 (#3253.a) — l'extension des comptes ouverts : parmi les comptes ouverts qui ont AU MOINS un
 * contact (les comptes sans contact relèvent de « voie d'accès », jamais comptés deux fois), combien
 * n'en ont qu'un seul. Que des comptes, jamais un nom. `null` = lecture impossible : non mesuré.
 */
export type WeakestLinkExtensionSignal = {
  readonly measured_count: number
  readonly single_contact_count: number
} | null

export type WeakestLinkDiagnosisInput = {
  readonly accounts: readonly WeakestLinkAccountSignal[]
  readonly pipeline: WeakestLinkPipelineSignal
  readonly bench: WeakestLinkBenchSignal
  readonly commercialCapacity: WeakestLinkCommercialCapacitySignal
  /** #3294 — facultatif : omis, la famille reste non évaluable (sortie inchangée). */
  readonly margin?: WeakestLinkMarginSignal
  /** #3294 — facultatif : omis, la famille reste non évaluable (sortie inchangée). */
  readonly rituals?: WeakestLinkRitualSignal
  /** #3294 — facultatif, même garde. */
  readonly ownership?: WeakestLinkOwnershipSignal
  /** X64 / #3294 — facultatif, même garde. */
  readonly accessPath?: WeakestLinkAccessPathSignal
  /** X64 / #3294 — facultatif, même garde. */
  readonly talentSecurity?: WeakestLinkTalentSecuritySignal
  /** #3294 — facultatif, même garde. */
  readonly extension?: WeakestLinkExtensionSignal
}

/** La raison des familles que ce moteur ne sait pas encore mesurer — l'écran les COMPTE
 *  sans les lister (douze lignes de « pas câblé » seraient un mur) et nomme les autres. */
export const UNWIRED_BOTTLENECK_FAMILY_REASON = 'Pas encore de signal câblé pour cette famille (BEL-SC-224, tranche 1).'

const REVIEW_HORIZON_DAYS = 14
const MAX_SECONDARY_BOTTLENECKS = 2
const MAX_EVIDENCE_ITEMS = 5

function reviewDateFrom(now: Date): string {
  const reviewed = new Date(now.getTime() + REVIEW_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  return reviewed.toISOString().slice(0, 10)
}

type CandidateBuilder = {
  readonly family: BottleneckFamily
  readonly evaluable: boolean
  readonly notEvaluableReason?: string
  readonly build?: () => Omit<WeakestLinkBottleneck, 'review_date'> | null
}

function evaluateFollowUp(accounts: readonly WeakestLinkAccountSignal[]): CandidateBuilder {
  const open = accounts.filter(a => a.is_open)
  if (open.length === 0) {
    return {
      family: 'absence_de_suivi_ou_de_prochaine_action',
      evaluable: false,
      notEvaluableReason: 'Aucun compte ouvert dans cet espace.',
    }
  }
  const unworked = open.filter(a => !a.has_next_action && !a.has_identified_sponsor)
  const worked = open.filter(a => a.has_next_action && a.has_identified_sponsor)
  return {
    family: 'absence_de_suivi_ou_de_prochaine_action',
    evaluable: true,
    build: () => {
      if (unworked.length === 0) return null
      const evidence = unworked
        .slice(0, MAX_EVIDENCE_ITEMS)
        .map(a => `${a.name} : aucune prochaine action, aucun sponsor identifié.`)
      return {
        family: 'absence_de_suivi_ou_de_prochaine_action',
        business_impact: `${unworked.length} compte(s) ouvert(s) sur ${open.length} n'ont ni prochaine action ni sponsor identifié — un compte ouvert sans les deux ne progresse pas seul.`,
        supporting_evidence: evidence,
        // #3253.b — confrontation avant retenue : le sous-ensemble du MÊME
        // portefeuille qui suit déjà la règle, quand il existe. Vide si le
        // problème est total (rien à opposer, jamais une contre-preuve devinée).
        contradictory_evidence:
          worked.length > 0
            ? [
                `${worked.length} compte(s) ouvert(s) sur ${open.length} ont bien une prochaine action ET un sponsor identifié — la difficulté n'est pas générale au portefeuille.`,
              ]
            : [],
        recommended_experiment: `Reprendre les ${Math.min(3, unworked.length)} comptes les plus prometteurs parmi ceux sans suivi : fixer une prochaine action datée et identifier un sponsor avant d'en ouvrir un nouveau.`,
        success_metric: 'Nombre de comptes ouverts avec une prochaine action ET un sponsor identifié.',
        actions_to_stop: [
          "Ne pas lancer de nouvelle recherche de comptes tant que les comptes déjà ouverts n'ont pas de prochaine action.",
          'Ne pas ouvrir de nouveau compte avant d’avoir statué sur ceux sans sponsor identifié.',
        ],
      }
    },
  }
}

function evaluatePipeline(pipeline: WeakestLinkPipelineSignal): CandidateBuilder {
  if (pipeline === null || pipeline.total_count === 0) {
    return {
      family: 'pas_de_pipeline_qualifie',
      evaluable: false,
      notEvaluableReason: 'Aucune opportunité mesurable dans cet espace.',
    }
  }
  return {
    family: 'pas_de_pipeline_qualifie',
    evaluable: true,
    build: () => {
      if (pipeline.qualified_count > 0) return null
      return {
        family: 'pas_de_pipeline_qualifie',
        business_impact: `Aucune opportunité qualifiée sur ${pipeline.total_count} suivie(s) — le pipeline existe mais n'a pas franchi la qualification.`,
        supporting_evidence: [`0 opportunité qualifiée sur ${pipeline.total_count}.`],
        // #3253.b — signal agrégé (compte unique), pas de sous-ensemble par
        // opportunité à confronter dans ce lot : reste honnêtement vide plutôt
        // qu'une contre-preuve inventée.
        contradictory_evidence: [],
        recommended_experiment: 'Qualifier les opportunités déjà ouvertes avant d’en ajouter de nouvelles.',
        success_metric: 'Nombre d’opportunités qualifiées.',
        actions_to_stop: ['Ne pas ajouter de nouvelles opportunités tant qu’aucune n’est qualifiée.'],
      }
    },
  }
}

function evaluateBench(bench: WeakestLinkBenchSignal): CandidateBuilder {
  if (bench === null || bench.total_count === 0) {
    return {
      family: 'vivier_insuffisant',
      evaluable: false,
      notEvaluableReason: 'Aucun talent suivi dans cet espace.',
    }
  }
  return {
    family: 'vivier_insuffisant',
    evaluable: true,
    build: () => {
      const ratio = bench.available_count / bench.total_count
      if (ratio > 0.1) return null
      return {
        family: 'vivier_insuffisant',
        business_impact: `${bench.available_count} talent(s) disponible(s) sur ${bench.total_count} — le vivier ne couvre presque plus de nouvelle mission.`,
        supporting_evidence: [`${bench.available_count}/${bench.total_count} talents disponibles.`],
        // #3253.b — le vivier n'est jamais totalement vide tant que ce compte
        // reste positif : nommer ce reste plutôt que le taire.
        contradictory_evidence:
          bench.available_count > 0
            ? [`${bench.available_count} talent(s) tout de même disponible(s) — le vivier n'est pas totalement vide.`]
            : [],
        recommended_experiment:
          'Prioriser la sécurisation ou le recrutement des profils les plus demandés avant de vendre de nouvelles missions.',
        success_metric: 'Nombre de talents disponibles.',
        actions_to_stop: ['Ne pas promettre de nouvelles missions tant que le vivier disponible reste sous 10 %.'],
      }
    },
  }
}

function evaluateCommercialCapacity(capacity: WeakestLinkCommercialCapacitySignal): CandidateBuilder {
  if (capacity === null || capacity.available_hours_per_week === null || capacity.open_account_count === 0) {
    return {
      family: 'capacite_commerciale_trop_faible',
      evaluable: false,
      notEvaluableReason: 'Temps disponible ou portefeuille non renseigné.',
    }
  }
  const availableHoursPerWeek = capacity.available_hours_per_week
  const hoursPerAccount = availableHoursPerWeek / capacity.open_account_count
  return {
    family: 'capacite_commerciale_trop_faible',
    evaluable: true,
    build: () => {
      if (hoursPerAccount >= 1) return null
      return {
        family: 'capacite_commerciale_trop_faible',
        business_impact: `${capacity.available_hours_per_week} h/semaine disponibles pour ${capacity.open_account_count} comptes ouverts — moins d'une heure par compte et par semaine.`,
        supporting_evidence: [
          `${capacity.available_hours_per_week} h/semaine pour ${capacity.open_account_count} comptes.`,
        ],
        // #3253.b — les heures restantes sont réelles même quand le ratio est
        // insuffisant : un partage différent du portefeuille peut suffire.
        contradictory_evidence:
          availableHoursPerWeek > 0
            ? [
                `${availableHoursPerWeek} h/semaine restent disponibles — un partage différent du portefeuille pourrait suffire.`,
              ]
            : [],
        recommended_experiment:
          'Réduire le portefeuille actif à ce que le temps disponible permet réellement de suivre.',
        success_metric: 'Heures disponibles par compte ouvert et par semaine.',
        actions_to_stop: [
          'Ne pas ouvrir de nouveaux comptes tant que le temps disponible par compte reste sous une heure.',
        ],
      }
    },
  }
}

/** Au moins un tiers des missions chiffrées sous le plancher : en dessous, c'est un cas, pas un maillon.
 *  Tranché sans Louis (#3294) : le plus simple des seuils lisibles, écrit ici une seule fois. */
const MARGIN_BELOW_FLOOR_SHARE = 1 / 3

function evaluateMargin(margin: WeakestLinkMarginSignal | undefined): CandidateBuilder {
  if (!margin || margin.measured_count === 0) {
    return {
      family: 'marge_trop_faible',
      evaluable: false,
      notEvaluableReason:
        margin && margin.unmeasured_count > 0
          ? `${margin.unmeasured_count} mission(s) active(s), aucune avec tarif et coût renseignés.`
          : 'Aucune mission active chiffrée dans cet espace.',
    }
  }
  return {
    family: 'marge_trop_faible',
    evaluable: true,
    build: () => {
      if (margin.below_floor_count / margin.measured_count < MARGIN_BELOW_FLOOR_SHARE) return null
      const holding = margin.measured_count - margin.below_floor_count
      const unmeasuredNote =
        margin.unmeasured_count > 0
          ? ` ${margin.unmeasured_count} mission(s) sans marge mesurable restent hors du compte.`
          : ''
      return {
        family: 'marge_trop_faible',
        business_impact: `${margin.below_floor_count} mission(s) chiffrée(s) sur ${margin.measured_count} sont sous ${margin.floor_percent} % de marge — vendre plus de volume à ce niveau n'améliore pas le résultat.${unmeasuredNote}`,
        supporting_evidence: [
          `${margin.below_floor_count} mission(s) chiffrée(s) sur ${margin.measured_count} sous ${margin.floor_percent} % de marge.`,
        ],
        contradictory_evidence:
          holding > 0
            ? [
                `${holding} mission(s) chiffrée(s) tiennent le plancher de ${margin.floor_percent} % — la difficulté n'est pas générale.`,
              ]
            : [],
        recommended_experiment:
          'Revoir le tarif ou le coût des missions sous le plancher au prochain renouvellement, en commençant par les plus grosses.',
        success_metric: 'Part des missions chiffrées au-dessus du plancher de marge.',
        actions_to_stop: ['Ne pas signer de nouvelle mission sous le plancher de marge sans décision écrite.'],
      }
    },
  }
}

/** Un point hebdomadaire non tenu depuis plus de deux semaines : le rituel a décroché.
 *  Tranché sans Louis (#3294) : deux fois sa cadence, écrit ici une seule fois. */
const WEEKLY_RITUAL_STALE_DAYS = 14

function evaluateRituals(rituals: WeakestLinkRitualSignal | undefined): CandidateBuilder {
  if (!rituals || rituals.marked_count === 0) {
    return {
      family: 'absence_de_rituels',
      evaluable: false,
      notEvaluableReason: 'Aucun rituel marqué comme tenu : on ne sait pas s’il y en a, rien n’est conclu.',
    }
  }
  return {
    family: 'absence_de_rituels',
    evaluable: true,
    build: () => {
      const never = rituals.weekly_days_since === null
      if (!never && (rituals.weekly_days_since ?? 0) <= WEEKLY_RITUAL_STALE_DAYS) return null
      const since = rituals.weekly_days_since
      return {
        family: 'absence_de_rituels',
        business_impact: never
          ? `${rituals.marked_count} rituel(s) marqué(s) comme tenu(s), mais jamais le point hebdomadaire — le pipe n’est pas relu à une cadence fixe.`
          : `Le point hebdomadaire n’a pas été tenu depuis ${since} jours — le pipe n’est plus relu à une cadence fixe.`,
        supporting_evidence: [
          never
            ? 'Point hebdomadaire jamais marqué comme tenu.'
            : `Dernier point hebdomadaire marqué il y a ${since} jours (seuil : ${WEEKLY_RITUAL_STALE_DAYS}).`,
        ],
        // Les autres rituels marqués existent : la discipline n'est pas absente partout.
        contradictory_evidence: [
          `${rituals.marked_count} rituel(s) ont tout de même été marqué(s) comme tenu(s) — l’équipe se réunit.`,
        ],
        recommended_experiment:
          'Tenir le point hebdomadaire deux semaines de suite avec son ordre du jour, puis le marquer comme tenu.',
        success_metric: 'Nombre de semaines consécutives avec un point hebdomadaire marqué comme tenu.',
        actions_to_stop: ['Ne pas remplacer le point hebdomadaire par des échanges au fil de l’eau.'],
      }
    },
  }
}

/** Au moins 4 comptes attribués et 2 porteurs lisibles, un porteur à 75 % ou plus : en dessous, c'est une
 *  répartition, pas une dépendance. Tranché sans Louis (#3294), écrit ici une seule fois. */
const OWNERSHIP_MIN_ASSIGNED = 4
const OWNERSHIP_TOP_SHARE = 0.75

function evaluateOwnership(ownership: WeakestLinkOwnershipSignal | undefined): CandidateBuilder {
  if (!ownership || ownership.assigned_open_count < OWNERSHIP_MIN_ASSIGNED || ownership.owners_count < 2) {
    return {
      family: 'dependance_a_une_seule_personne',
      evaluable: false,
      notEvaluableReason:
        'Répartition illisible : moins de quatre comptes ouverts attribués, ou un seul porteur visible.',
    }
  }
  return {
    family: 'dependance_a_une_seule_personne',
    evaluable: true,
    build: () => {
      if (ownership.top_owner_count / ownership.assigned_open_count < OWNERSHIP_TOP_SHARE) return null
      const rest = ownership.assigned_open_count - ownership.top_owner_count
      const unassignedNote =
        ownership.unassigned_open_count > 0
          ? ` ${ownership.unassigned_open_count} compte(s) sans porteur restent hors du compte.`
          : ''
      return {
        family: 'dependance_a_une_seule_personne',
        business_impact: `${ownership.top_owner_count} compte(s) ouvert(s) sur ${ownership.assigned_open_count} attribués reposent sur une seule personne — son absence arrête l’essentiel du portefeuille.${unassignedNote}`,
        supporting_evidence: [
          `${ownership.top_owner_count} compte(s) ouvert(s) sur ${ownership.assigned_open_count} chez un même porteur.`,
        ],
        contradictory_evidence: [
          `${rest} compte(s) ouvert(s) sont portés par ${ownership.owners_count - 1} autre(s) personne(s) — la répartition n’est pas nulle.`,
        ],
        recommended_experiment:
          'Doubler les trois comptes les plus avancés de ce portefeuille par un second interlocuteur interne avant d’en ouvrir de nouveaux.',
        success_metric: 'Part des comptes ouverts portée par le porteur principal.',
        actions_to_stop: [
          'Ne pas attribuer de nouveau compte au porteur principal tant que la répartition ne bouge pas.',
        ],
      }
    },
  }
}

/** Au moins 3 comptes ouverts, la moitié ou plus sans aucun contact : en dessous, c'est un retard de
 *  saisie, pas une absence de voie d'accès. Tranché sans Louis (X64), écrit ici une seule fois. */
const ACCESS_PATH_MIN_ACCOUNTS = 3
const ACCESS_PATH_WITHOUT_SHARE = 0.5

function evaluateAccessPath(accessPath: WeakestLinkAccessPathSignal | undefined): CandidateBuilder {
  if (!accessPath || accessPath.measured_count < ACCESS_PATH_MIN_ACCOUNTS) {
    return {
      family: 'absence_de_voie_dacces',
      evaluable: false,
      notEvaluableReason: 'Moins de trois comptes ouverts lisibles : la part sans contact ne se lit pas.',
    }
  }
  return {
    family: 'absence_de_voie_dacces',
    evaluable: true,
    build: () => {
      const { measured_count: total, without_contact_count: without } = accessPath
      if (without < ACCESS_PATH_MIN_ACCOUNTS || without / total < ACCESS_PATH_WITHOUT_SHARE) return null
      return {
        family: 'absence_de_voie_dacces',
        business_impact: `${without} compte(s) ouvert(s) sur ${total} n’ont aucun contact enregistré — on ne sait par qui entrer.`,
        supporting_evidence: [`${without} compte(s) ouvert(s) sur ${total} sans aucun contact.`],
        contradictory_evidence: [
          `${total - without} compte(s) ouvert(s) ont au moins un contact — la voie d’accès existe ailleurs.`,
        ],
        recommended_experiment:
          'Identifier un premier contact sur les trois comptes ouverts les plus avancés, avant d’ouvrir de nouveaux comptes.',
        success_metric: 'Part des comptes ouverts qui ont au moins un contact enregistré.',
        actions_to_stop: ['Ne pas ouvrir de nouveau compte tant que ces comptes n’ont aucune personne à joindre.'],
      }
    },
  }
}

/** Au moins 3 comptes ouverts joignables, la moitié ou plus à un seul contact : en dessous, un compte
 *  à un contact est un compte jeune, pas un portefeuille non étendu. Tranché sans Louis (E14). */
const EXTENSION_MIN_ACCOUNTS = 3
const EXTENSION_SINGLE_SHARE = 0.5

function evaluateExtension(extension: WeakestLinkExtensionSignal | undefined): CandidateBuilder {
  if (!extension || extension.measured_count < EXTENSION_MIN_ACCOUNTS) {
    return {
      family: 'comptes_ouverts_non_etendus',
      evaluable: false,
      notEvaluableReason:
        'Moins de trois comptes ouverts avec un contact : le nombre d’interlocuteurs par compte ne se lit pas.',
    }
  }
  return {
    family: 'comptes_ouverts_non_etendus',
    evaluable: true,
    build: () => {
      const { measured_count: total, single_contact_count: single } = extension
      if (single < EXTENSION_MIN_ACCOUNTS || single / total < EXTENSION_SINGLE_SHARE) return null
      return {
        family: 'comptes_ouverts_non_etendus',
        business_impact: `${single} compte(s) ouvert(s) sur ${total} ne reposent que sur un seul contact — une absence ou un départ ferme la porte.`,
        supporting_evidence: [`${single} compte(s) ouvert(s) sur ${total} n’ont qu’un seul contact enregistré.`],
        contradictory_evidence: [
          `${total - single} compte(s) ouvert(s) ont déjà au moins deux contacts — l’extension existe ailleurs.`,
        ],
        recommended_experiment:
          'Ajouter un second interlocuteur sur les trois comptes ouverts les plus avancés, avant d’ouvrir de nouveaux comptes.',
        success_metric: 'Part des comptes ouverts qui ont au moins deux contacts enregistrés.',
        actions_to_stop: [
          'Ne pas ouvrir de nouveau compte tant que les comptes avancés ne reposent que sur une personne.',
        ],
      }
    },
  }
}

function evaluateTalentSecurity(talentSecurity: WeakestLinkTalentSecuritySignal | undefined): CandidateBuilder {
  if (!talentSecurity || talentSecurity.measured_count === 0) {
    return {
      family: 'talents_mal_securises',
      evaluable: false,
      notEvaluableReason: 'Aucune mission active avec une date de fin renseignée : la suite des talents ne se lit pas.',
    }
  }
  return {
    family: 'talents_mal_securises',
    evaluable: true,
    build: () => {
      const {
        measured_count: total,
        unsecured_count: unsecured,
        unmeasured_count: unmeasured,
        horizon_days,
      } = talentSecurity
      if (unsecured === 0) return null
      const unmeasuredNote = unmeasured > 0 ? ` ${unmeasured} mission(s) sans date de fin restent hors du compte.` : ''
      return {
        family: 'talents_mal_securises',
        business_impact: `${unsecured} mission(s) active(s) sur ${total} finissent dans les ${horizon_days} jours sans suite décidée — ces talents ne sont pas sécurisés.${unmeasuredNote}`,
        supporting_evidence: [
          `${unsecured} mission(s) active(s) sur ${total} avec une fin sous ${horizon_days} jours et aucun renouvellement acté, annoncé ni repositionnement lancé.`,
        ],
        contradictory_evidence: [
          `${total - unsecured} mission(s) active(s) datée(s) ont une suite décidée ou une fin plus lointaine.`,
        ],
        recommended_experiment:
          'Ouvrir la décision de renouvellement sur chaque mission qui finit sous 60 jours, en commençant par la plus proche.',
        success_metric: 'Nombre de missions finissant sous 60 jours sans suite décidée.',
        actions_to_stop: [
          'Ne pas laisser une fin de mission proche sans décision de renouvellement ou de repositionnement.',
        ],
      }
    },
  }
}

/** Ordre de priorité fixe entre familles ex-æquo — le suivi (l'exemple du
 *  ticket) passe avant le pipeline, qui passe avant le vivier, qui passe
 *  avant la capacité : un maillon qui bloque L'EXÉCUTION de ce qui existe déjà
 *  prime sur un maillon qui bloque l'ACQUISITION de nouvelle matière. */
const FAMILY_PRIORITY: readonly BottleneckFamily[] = [
  'absence_de_suivi_ou_de_prochaine_action',
  'pas_de_pipeline_qualifie',
  'vivier_insuffisant',
  'capacite_commerciale_trop_faible',
  // #3294 — en fin de liste (même règle d'ordre que CHAT_TOOLS).
  'marge_trop_faible',
  'absence_de_rituels',
  'dependance_a_une_seule_personne',
  // X64 / #3294 — en fin de liste, même règle d'ordre.
  'absence_de_voie_dacces',
  'talents_mal_securises',
  // #3294 — en fin de liste, même règle d'ordre.
  'comptes_ouverts_non_etendus',
]

export function deriveWeakestLinkDiagnosis(
  input: WeakestLinkDiagnosisInput,
  now: Date = new Date(),
): WeakestLinkDiagnosis {
  const builders = [
    evaluateFollowUp(input.accounts),
    evaluatePipeline(input.pipeline),
    evaluateBench(input.bench),
    evaluateCommercialCapacity(input.commercialCapacity),
    evaluateMargin(input.margin),
    evaluateRituals(input.rituals),
    evaluateOwnership(input.ownership),
    evaluateAccessPath(input.accessPath),
    evaluateTalentSecurity(input.talentSecurity),
    evaluateExtension(input.extension),
  ]

  const notEvaluable: NotEvaluableBottleneckFamily[] = []
  const candidates: Omit<WeakestLinkBottleneck, 'review_date'>[] = []

  for (const builder of builders) {
    if (!builder.evaluable) {
      notEvaluable.push({ family: builder.family, reason: builder.notEvaluableReason ?? 'Signal indisponible.' })
      continue
    }
    const built = builder.build?.() ?? null
    if (built) candidates.push(built)
  }

  // Les familles du ticket qui n'ont aucun signal câblé dans cette tranche
  // (voir commentaire d'en-tête : c'est le ticket lui-même, section
  // MISE À JOUR, qui autorise un lot à en porter une partie — la structure
  // accueille les seize, ce lot en évalue quatre honnêtement).
  const wiredFamilies = new Set(builders.map(b => b.family))
  for (const family of BOTTLENECK_FAMILIES) {
    if (!wiredFamilies.has(family)) {
      notEvaluable.push({ family, reason: UNWIRED_BOTTLENECK_FAMILY_REASON })
    }
  }

  candidates.sort((a, b) => FAMILY_PRIORITY.indexOf(a.family) - FAMILY_PRIORITY.indexOf(b.family))

  const reviewDate = reviewDateFrom(now)
  const [primaryCandidate, ...rest] = candidates
  const primary_bottleneck: WeakestLinkBottleneck | null = primaryCandidate
    ? { ...primaryCandidate, review_date: reviewDate }
    : null
  const secondary_bottlenecks: WeakestLinkBottleneck[] = rest
    .slice(0, MAX_SECONDARY_BOTTLENECKS)
    .map(c => ({ ...c, review_date: reviewDate }))

  const evaluableCount = builders.filter(b => b.evaluable).length
  const confidence: BottleneckConfidence = evaluableCount === 0 ? 'low' : evaluableCount <= 2 ? 'medium' : 'high'

  return {
    computed_at: now.toISOString(),
    primary_bottleneck,
    secondary_bottlenecks,
    not_evaluable_families: notEvaluable,
    confidence,
    change_explanation: null,
  }
}

/** Doctrine du ticket, section MISE À JOUR : « explication lorsqu'il change ».
 *  `null` si le maillon principal (ou son absence) est resté le même. */
export function explainDiagnosisChange(
  previous: WeakestLinkDiagnosis | null,
  current: WeakestLinkDiagnosis,
): string | null {
  if (!previous) return null
  const previousFamily = previous.primary_bottleneck?.family ?? null
  const currentFamily = current.primary_bottleneck?.family ?? null
  if (previousFamily === currentFamily) return null
  if (previousFamily && currentFamily) {
    return `Le maillon faible principal est passé de « ${previousFamily} » à « ${currentFamily} ».`
  }
  if (currentFamily) {
    return `Un maillon faible principal a été identifié : « ${currentFamily} » (aucun n'était désignable au diagnostic précédent).`
  }
  return `Plus aucun maillon faible principal désignable (« ${previousFamily} » ne l'est plus).`
}

export type DiagnosisReevaluationDue = 'not_due' | 'due_light_weekly' | 'due_full'

const LIGHT_WEEKLY_INTERVAL_DAYS = 7

/**
 * Doctrine du ticket, section MISE À JOUR : réévaluation hebdomadaire légère,
 * réévaluation complète après un événement significatif — jamais l'inverse
 * (un événement significatif ne doit pas attendre le cycle hebdomadaire).
 */
export function shouldReevaluateDiagnosis(params: {
  readonly lastComputedAt: Date
  readonly now: Date
  readonly significantEventOccurred: boolean
}): DiagnosisReevaluationDue {
  if (params.significantEventOccurred) return 'due_full'
  const elapsedDays = (params.now.getTime() - params.lastComputedAt.getTime()) / (24 * 60 * 60 * 1000)
  return elapsedDays >= LIGHT_WEEKLY_INTERVAL_DAYS ? 'due_light_weekly' : 'not_due'
}
