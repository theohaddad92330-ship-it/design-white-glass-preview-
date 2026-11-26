import { z } from 'zod'
import type { ContractKind } from './project.js'

/**
 * #3269 (BEL-SC-240 — DELIVERY MILESTONES & REINJECTION LOOPS).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La spec liste dix-sept jalons de delivery. Onze existaient déjà, chacun dans
 * sa maison canonique (GA-26, règle #4/#5 de l'instruction commune #3249) :
 * démarrage ({@link import('./mission-start-readiness.js')}), fin de mission
 * ({@link import('./mission-end.js')}), renouvellement
 * ({@link import('./mission-renewal-rail.js')}), satisfaction
 * ({@link import('./mission-feedback.js')}), risque
 * ({@link import('./mission-drift.js')}), CRA (`mission-timesheet-review.ts`),
 * REX interne/client + preuve réutilisable (`capitalisation.service.ts#findMissionsAwaitingRex`,
 * {@link import('./proof.js').proposeProofFields}), expansion
 * (`apps/ia/app/services/compilers/account_expansion_compiler.py`). Ce fichier
 * ne les RECOPIE pas — il les PROJETTE (patron `mission-board.ts` : « douze
 * colonnes, aucun nouvel état »), sur le même principe que #2953
 * (`mission-primary-action.ts`) : composer ce qui existe déjà, jamais un
 * deuxième calcul concurrent.
 *
 * Six jalons n'avaient AUCUN objet, AUCUN appelant (`git grep` confirmé,
 * 28/09/2026) : brief consultant, brief client, documents et accès, premier
 * check, revue de début, suivi périodique. Eux seuls sont un geste humain
 * DÉCLARÉ ici, même patron que `mission-end.ts` (#2414) : daté, avec son
 * auteur et sa note, jamais recalculé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES PRESETS SONT DES PRESETS (règle #8, instruction commune #3249)
 * ─────────────────────────────────────────────────────────────────────────────
 * Les décalages par défaut ({@link DECLARED_MILESTONE_DEFAULT_OFFSET_DAYS})
 * s'adaptent à la durée, la nature du contrat (régie/forfait/recrutement,
 * `ContractKind`, D35) et au risque — et une préférence workspace explicite
 * gagne toujours. Un forfait ne porte pas de cadence calendaire : il se suit à
 * ses propres jalons de facturation ({@link import('./mission.js').expectsTimesheet}),
 * pas au calendrier — `suivi_periodique` y rend `offsetDays: null`, nommé,
 * jamais une valeur inventée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES BOUCLES DE RÉINJECTION ({@link MISSION_REINJECTION_LOOPS})
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre des six boucles de la spec sont déjà appelées ailleurs (mission → REX,
 * consultant → terrain via {@link import('./declared-signal.js')}, CRM → action
 * via {@link import('./next-action.js')}, client → autre BU via le compilateur
 * d'expansion IA) : ce registre les CITE, il ne les redouble pas. Une
 * (partenaire → accès) reste un type SANS appelant dans `apps/api`
 * (`ecosystem-relation.ts#rank2_confirmed`) et appartient à la maison
 * Partenaire, pas Mission — hors lot, épopée. La dernière (fin de mission →
 * reverse market) est neuve : {@link computeMissionEndReverseMarketReadiness}
 * NE DÉCLARE JAMAIS de disponibilité automatique (NO-GO de la spec, même
 * principe que `mission-end.ts#confirmAvailability` — un second geste humain,
 * hors de cette fonction, est seul à pouvoir le faire).
 */

// ── Le catalogue, dans l'ordre de la spec #3269 ────────────────────────────

export const MISSION_DELIVERY_MILESTONE_KINDS = [
  'brief_consultant',
  'brief_client',
  'documents_acces',
  'demarrage',
  'premier_check',
  'revue_debut',
  'suivi_periodique',
  'satisfaction',
  'cra',
  'risque',
  'renouvellement',
  'fin_de_mission',
  'rex_interne',
  'rex_client',
  'preuve_reutilisable',
  'expansion',
  'disponibilite_future',
] as const
export type MissionDeliveryMilestoneKind = (typeof MISSION_DELIVERY_MILESTONE_KINDS)[number]
export const missionDeliveryMilestoneKindSchema = z.enum(MISSION_DELIVERY_MILESTONE_KINDS)

/** Les six jalons qu'aucun objet canonique existant ne couvre — geste humain déclaré. */
export const DECLARED_MISSION_DELIVERY_MILESTONE_KINDS = [
  'brief_consultant',
  'brief_client',
  'documents_acces',
  'premier_check',
  'revue_debut',
  'suivi_periodique',
] as const
export type DeclaredMissionDeliveryMilestoneKind = (typeof DECLARED_MISSION_DELIVERY_MILESTONE_KINDS)[number]
export const declaredMissionDeliveryMilestoneKindSchema = z.enum(DECLARED_MISSION_DELIVERY_MILESTONE_KINDS)

/** Les onze jalons qui se PROJETTENT depuis leur maison canonique existante. */
export const PROJECTED_MISSION_DELIVERY_MILESTONE_KINDS = [
  'demarrage',
  'satisfaction',
  'cra',
  'risque',
  'renouvellement',
  'fin_de_mission',
  'rex_interne',
  'rex_client',
  'preuve_reutilisable',
  'expansion',
  'disponibilite_future',
] as const
export type ProjectedMissionDeliveryMilestoneKind = (typeof PROJECTED_MISSION_DELIVERY_MILESTONE_KINDS)[number]

interface MissionDeliveryMilestoneCatalogEntry {
  key: MissionDeliveryMilestoneKind
  mode: 'declared' | 'projected'
  labelFr: string
  labelEn: string
  /** Fichier/fonction d'où ce jalon lit son état — `null` pour un jalon `declared` (posé ici). */
  groundedIn: string | null
}

export const MISSION_DELIVERY_MILESTONE_CATALOG: readonly MissionDeliveryMilestoneCatalogEntry[] = [
  {
    key: 'brief_consultant',
    mode: 'declared',
    labelFr: 'Brief consultant',
    labelEn: 'Consultant brief',
    groundedIn: null,
  },
  { key: 'brief_client', mode: 'declared', labelFr: 'Brief client', labelEn: 'Client brief', groundedIn: null },
  {
    key: 'documents_acces',
    mode: 'declared',
    labelFr: 'Documents et accès',
    labelEn: 'Documents and access',
    groundedIn: null,
  },
  {
    key: 'demarrage',
    mode: 'projected',
    labelFr: 'Démarrage',
    labelEn: 'Kickoff',
    groundedIn: 'mission-start-readiness.ts#computeMissionStartReadiness',
  },
  { key: 'premier_check', mode: 'declared', labelFr: 'Premier check', labelEn: 'First check-in', groundedIn: null },
  { key: 'revue_debut', mode: 'declared', labelFr: 'Revue de début', labelEn: 'Early review', groundedIn: null },
  {
    key: 'suivi_periodique',
    mode: 'declared',
    labelFr: 'Suivi périodique',
    labelEn: 'Periodic follow-up',
    groundedIn: null,
  },
  {
    key: 'satisfaction',
    mode: 'projected',
    labelFr: 'Satisfaction',
    labelEn: 'Satisfaction',
    groundedIn: 'mission-feedback.ts#MISSION_FEEDBACK_RAILS',
  },
  { key: 'cra', mode: 'projected', labelFr: 'CRA', labelEn: 'Timesheet', groundedIn: 'mission-timesheet-review.ts' },
  {
    key: 'risque',
    mode: 'projected',
    labelFr: 'Risque',
    labelEn: 'Risk',
    groundedIn: 'mission-drift.ts#detectMissionDrift',
  },
  {
    key: 'renouvellement',
    mode: 'projected',
    labelFr: 'Renouvellement',
    labelEn: 'Renewal',
    groundedIn: 'mission-renewal-rail.ts / mission-renewal-engine.ts',
  },
  {
    key: 'fin_de_mission',
    mode: 'projected',
    labelFr: 'Fin de mission',
    labelEn: 'Mission end',
    groundedIn: 'mission-end.ts#computeMissionEndChecklist',
  },
  {
    key: 'rex_interne',
    mode: 'projected',
    labelFr: 'REX interne',
    labelEn: 'Internal debrief',
    groundedIn: 'apps/api/src/modules/capitalisation/capitalisation.service.ts#findMissionsAwaitingRex',
  },
  {
    key: 'rex_client',
    mode: 'projected',
    labelFr: 'REX client',
    labelEn: 'Client debrief',
    groundedIn: 'apps/api/src/modules/capitalisation/capitalisation.service.ts#findMissionsAwaitingRex',
  },
  {
    key: 'preuve_reutilisable',
    mode: 'projected',
    labelFr: 'Preuve réutilisable',
    labelEn: 'Reusable proof',
    groundedIn: 'proof.ts#proposeProofFields',
  },
  {
    key: 'expansion',
    mode: 'projected',
    labelFr: 'Expansion',
    labelEn: 'Expansion',
    groundedIn: 'apps/ia/app/services/compilers/account_expansion_compiler.py',
  },
  {
    key: 'disponibilite_future',
    mode: 'projected',
    labelFr: 'Disponibilité future',
    labelEn: 'Future availability',
    groundedIn: 'mission-delivery-milestones.ts#computeMissionEndReverseMarketReadiness',
  },
] as const

// ── Presets adaptables (règle #8, instruction commune #3249) ──────────────

/** Décalage par défaut, en jours depuis le démarrage (négatif = avant) — un PRESET, pas une loi. */
export const DECLARED_MILESTONE_DEFAULT_OFFSET_DAYS: Record<DeclaredMissionDeliveryMilestoneKind, number> = {
  brief_consultant: -3,
  brief_client: -2,
  documents_acces: -1,
  premier_check: 3,
  revue_debut: 14,
  suivi_periodique: 30,
}

export interface MissionDeliveryMilestonePresetInput {
  durationDays: number | null
  contractKind: ContractKind
  riskLevel: 'faible' | 'moyen' | 'eleve' | null
  /** Une préférence explicite du workspace — gagne toujours (GA-26 : un réglage vit à un seul endroit, ici). */
  workspaceOverrides?: Partial<Record<DeclaredMissionDeliveryMilestoneKind, number>>
}

export interface MissionDeliveryMilestonePreset {
  key: DeclaredMissionDeliveryMilestoneKind
  /** `null` = pas de cadence calendaire pour ce contrat (forfait, D35) — jamais une valeur inventée. */
  offsetDays: number | null
  adapted: boolean
  reason: string | null
}

const SHORT_MISSION_THRESHOLD_DAYS = 20

export function resolveMissionDeliveryMilestonePresets(
  input: MissionDeliveryMilestonePresetInput,
): MissionDeliveryMilestonePreset[] {
  return DECLARED_MISSION_DELIVERY_MILESTONE_KINDS.map(key => {
    const override = input.workspaceOverrides?.[key]
    if (override !== undefined) {
      return { key, offsetDays: override, adapted: true, reason: 'préférence workspace' }
    }

    // Forfait : suivi aux jalons de facturation, jamais au calendrier (D35).
    if (key === 'suivi_periodique' && input.contractKind === 'forfait') {
      return {
        key,
        offsetDays: null,
        adapted: true,
        reason: 'forfait : suivi aux jalons de facturation, pas au calendrier (D35)',
      }
    }

    let offsetDays = DECLARED_MILESTONE_DEFAULT_OFFSET_DAYS[key]
    let adapted = false
    let reason: string | null = null

    if (input.durationDays !== null && input.durationDays < SHORT_MISSION_THRESHOLD_DAYS) {
      if (key === 'premier_check') {
        offsetDays = 1
        adapted = true
        reason = 'mission courte (<20j) : check avancé'
      } else if (key === 'revue_debut') {
        offsetDays = 7
        adapted = true
        reason = 'mission courte (<20j) : revue avancée'
      } else if (key === 'suivi_periodique') {
        offsetDays = 14
        adapted = true
        reason = 'mission courte (<20j) : cadence resserrée'
      }
    }

    if (key === 'suivi_periodique' && input.riskLevel === 'eleve') {
      const risqueOffset = Math.min(offsetDays, 15)
      if (risqueOffset !== offsetDays) {
        offsetDays = risqueOffset
        reason = reason ? `${reason} ; risque élevé : cadence resserrée` : 'risque élevé : cadence resserrée'
      }
      adapted = true
    }

    return { key, offsetDays, adapted, reason }
  })
}

// ── Le geste déclaré (patron mission-end.ts#missionEndCheckInputSchema) ───

export const declareMissionDeliveryMilestoneInputSchema = z.object({
  key: declaredMissionDeliveryMilestoneKindSchema,
  note: z.string().trim().min(3).max(500),
})
export type DeclareMissionDeliveryMilestoneInput = z.infer<typeof declareMissionDeliveryMilestoneInputSchema>

export interface DeclaredMissionDeliveryMilestone {
  key: DeclaredMissionDeliveryMilestoneKind
  confirmedAt: string
  confirmedBy: string
  note: string
}

// ── Le signal projeté depuis une maison canonique existante ───────────────

/** `lead_known` (#3413) : une piste existe dans les faits du client (ex. d'autres entités) sans qu'aucune démarche soit lancée. */
export type MissionDeliveryMilestoneState = 'not_started' | 'in_progress' | 'done' | 'not_evaluable' | 'lead_known'

export interface ProjectedMissionDeliveryMilestoneSignal {
  key: ProjectedMissionDeliveryMilestoneKind
  state: MissionDeliveryMilestoneState
  note: string | null
}

export interface MissionDeliveryMilestoneStatus {
  key: MissionDeliveryMilestoneKind
  mode: 'declared' | 'projected'
  labelFr: string
  labelEn: string
  state: MissionDeliveryMilestoneState
  groundedIn: string | null
  note: string | null
  confirmedAt: string | null
  confirmedBy: string | null
}

export interface MissionDeliveryMilestonesInput {
  declared: readonly DeclaredMissionDeliveryMilestone[]
  projected: readonly ProjectedMissionDeliveryMilestoneSignal[]
}

/**
 * La projection unique (GA-26) : compose les gestes déclarés et les signaux
 * lus depuis les maisons canoniques existantes, jamais recalculée autrement.
 * Un jalon projeté sans signal rend `not_evaluable` — jamais `0`, jamais deviné
 * (doctrine « non mesuré n'est jamais 0 »).
 */
export function computeMissionDeliveryMilestones(
  input: MissionDeliveryMilestonesInput,
): MissionDeliveryMilestoneStatus[] {
  return MISSION_DELIVERY_MILESTONE_CATALOG.map(entry => {
    if (entry.mode === 'declared') {
      const row = input.declared.find(d => d.key === entry.key)
      return {
        key: entry.key,
        mode: 'declared',
        labelFr: entry.labelFr,
        labelEn: entry.labelEn,
        state: row ? 'done' : 'not_started',
        groundedIn: entry.groundedIn,
        note: row?.note ?? null,
        confirmedAt: row?.confirmedAt ?? null,
        confirmedBy: row?.confirmedBy ?? null,
      }
    }
    const signal = input.projected.find(p => p.key === entry.key)
    return {
      key: entry.key,
      mode: 'projected',
      labelFr: entry.labelFr,
      labelEn: entry.labelEn,
      state: signal?.state ?? 'not_evaluable',
      groundedIn: entry.groundedIn,
      note: signal?.note ?? null,
      confirmedAt: null,
      confirmedBy: null,
    }
  })
}

// ── FIN DE MISSION → REVERSE MARKET (NO-GO) ────────────────────────────────

export const MISSION_END_REVERSE_MARKET_STATES = ['not_applicable', 'a_verifier', 'verifie'] as const
export type MissionEndReverseMarketState = (typeof MISSION_END_REVERSE_MARKET_STATES)[number]

export interface MissionEndReverseMarketReadinessInput {
  missionStatus: string
  hasOpenReplacementOnAccount: boolean
}

export interface MissionEndReverseMarketReadiness {
  state: MissionEndReverseMarketState
  /** NO-GO (#3269) — toujours `false` : seul un second geste humain, hors de cette fonction, déclare une disponibilité. */
  availabilityDeclared: false
  note: string
}

const MISSION_ENDED_STATUSES = new Set(['ended', 'terminated', 'completed'])

/**
 * « Préparer le prochain positionnement sans déclarer automatiquement le
 * consultant disponible » (#3269, garde-fou). Même patron que
 * `mission-end.ts#confirmAvailability` : cette fonction ne lève JAMAIS
 * `availabilityDeclared` — un second geste humain, ailleurs, en est seul
 * capable.
 */
export function computeMissionEndReverseMarketReadiness(
  input: MissionEndReverseMarketReadinessInput,
): MissionEndReverseMarketReadiness {
  if (!MISSION_ENDED_STATUSES.has(input.missionStatus)) {
    return { state: 'not_applicable', availabilityDeclared: false, note: 'Mission encore active.' }
  }
  if (input.hasOpenReplacementOnAccount) {
    return {
      state: 'verifie',
      availabilityDeclared: false,
      note: 'Un remplacement est déjà en cours sur ce compte — prochain positionnement déjà amorcé.',
    }
  }
  return {
    state: 'a_verifier',
    availabilityDeclared: false,
    note: 'Mission terminée — à vérifier avant tout prochain positionnement (jamais de disponibilité déclarée automatiquement).',
  }
}

// ── Les six boucles de réinjection (#3269) ─────────────────────────────────

export const MISSION_REINJECTION_LOOP_KEYS = [
  'mission_rex',
  'consultant_terrain',
  'crm_action',
  'client_autre_bu',
  'partenaire_acces',
  'fin_mission_reverse_market',
] as const
export type MissionReinjectionLoopKey = (typeof MISSION_REINJECTION_LOOP_KEYS)[number]

/** `deja_la` : appelant réel déjà branché ailleurs. `retenu_livre` : neuf, livré ici. `hors_lot` : posé, jamais appelé, épopée. */
export type MissionReinjectionLoopStatus = 'deja_la' | 'retenu_livre' | 'hors_lot'

export interface MissionReinjectionLoop {
  key: MissionReinjectionLoopKey
  labelFr: string
  targetCanonicalObject: string
  status: MissionReinjectionLoopStatus
  groundedIn: string
  guardrails: readonly string[]
}

/** Les six garde-fous de la spec (#3269) — nommés une fois, réutilisés par chaque boucle. */
export const MISSION_REINJECTION_GUARDRAILS = [
  'consentement',
  'confidentialite',
  'permissions',
  'aucune_publication_automatique',
  'aucun_logo_sans_autorisation',
  'aucun_signal_terrain_comme_preuve_publique',
] as const

export const MISSION_REINJECTION_LOOPS: readonly MissionReinjectionLoop[] = [
  {
    key: 'mission_rex',
    labelFr: 'MISSION → REX',
    targetCanonicalObject: 'Proof',
    status: 'deja_la',
    groundedIn:
      'apps/api/src/modules/capitalisation/capitalisation.service.ts#findMissionsAwaitingRex + packages/contracts/src/schemas/proof.ts#proposeProofFields',
    guardrails: MISSION_REINJECTION_GUARDRAILS,
  },
  {
    key: 'consultant_terrain',
    labelFr: 'CONSULTANT → TERRAIN',
    targetCanonicalObject: 'Signal',
    status: 'deja_la',
    groundedIn: 'packages/contracts/src/schemas/declared-signal.ts + apps/api/src/modules/accounts/accounts.service.ts',
    guardrails: MISSION_REINJECTION_GUARDRAILS,
  },
  {
    key: 'crm_action',
    labelFr: 'CRM → ACTION',
    targetCanonicalObject: 'Action',
    status: 'deja_la',
    groundedIn:
      'packages/contracts/src/schemas/next-action.ts (dérivation UNIQUE) + porte d’approbation CRM/ERP (doctrine)',
    guardrails: MISSION_REINJECTION_GUARDRAILS,
  },
  {
    key: 'client_autre_bu',
    labelFr: 'CLIENT → AUTRE BU',
    targetCanonicalObject: 'Opportunité',
    status: 'deja_la',
    groundedIn: 'apps/ia/app/services/compilers/account_expansion_compiler.py (EXPANSION_PISTES, #2792/#2315)',
    guardrails: MISSION_REINJECTION_GUARDRAILS,
  },
  {
    key: 'partenaire_acces',
    labelFr: 'PARTENAIRE → ACCÈS',
    targetCanonicalObject: 'Partenaire',
    status: 'hors_lot',
    groundedIn:
      'packages/contracts/src/schemas/ecosystem-relation.ts (rank2_confirmed/rank2_to_rank1) — type posé, ZÉRO appelant dans apps/api au 28/09/2026 (git grep confirmé) ; sa maison canonique est Partenaire, pas Mission (règle #5, instruction commune #3249) — épopée',
    guardrails: MISSION_REINJECTION_GUARDRAILS,
  },
  {
    key: 'fin_mission_reverse_market',
    labelFr: 'FIN DE MISSION → REVERSE MARKET',
    targetCanonicalObject: 'Talent',
    status: 'retenu_livre',
    groundedIn: 'packages/contracts/src/schemas/mission-delivery-milestones.ts#computeMissionEndReverseMarketReadiness',
    guardrails: MISSION_REINJECTION_GUARDRAILS,
  },
] as const

// ── #3269.3/#3269.4 (suite #3291) — LA SUGGESTION, jamais l'écriture ──────

/**
 * Quel jalon DÉCLARÉ alimente quelle boucle — décision produit « tranché sans
 * Louis » (#3291) : la qualification est PROPOSÉE automatiquement à la
 * confirmation d'un jalon (l'écran l'affiche dès que le jalon est `done`),
 * jamais seulement sur demande explicite — même famille que
 * `proposeProofFields` (`proof.ts`) : on désigne, on n'écrit jamais tout seul.
 *
 * Un jalon de CADRAGE (brief consultant/client, documents et accès) qualifie
 * une ACTION (CRM → ACTION) : cadrer révèle typiquement un geste à engager
 * avant le démarrage. Un jalon de SUIVI (premier check, revue de début, suivi
 * périodique) qualifie un SIGNAL (CONSULTANT → TERRAIN) : un point d'étape
 * est le moment où le consultant rapporte ce qu'il observe sur le terrain.
 * Les deux boucles ciblées sont `deja_la` (jamais `partenaire_acces`, hors
 * lot, ni une boucle qui n'a pas d'appelant réel).
 *
 * ⚠️ Cette fonction ne fait QUE désigner (même principe que `next-action.ts`
 * : « un lien mort est pire qu'un texte »). Elle n'écrit ni signal ni action
 * — la note du jalon voyage VERBATIM, jamais reformulée. L'écran qui l'appelle
 * reste un texte nommé tant qu'aucune écriture dédiée n'existe pour ce jalon :
 * `declared-signal.ts` n'admet aujourd'hui que la source LinkedIn (#2634.1),
 * et lui rattacher une note de mission inventerait une provenance.
 */
export const MISSION_DELIVERY_MILESTONE_REINJECTION_LOOP: Record<
  DeclaredMissionDeliveryMilestoneKind,
  Extract<MissionReinjectionLoopKey, 'consultant_terrain' | 'crm_action'>
> = {
  brief_consultant: 'crm_action',
  brief_client: 'crm_action',
  documents_acces: 'crm_action',
  premier_check: 'consultant_terrain',
  revue_debut: 'consultant_terrain',
  suivi_periodique: 'consultant_terrain',
}

interface MissionDeliveryMilestoneReinjectionSuggestion {
  loopKey: 'consultant_terrain' | 'crm_action'
  targetCanonicalObject: string
  /** La note du jalon, verbatim — jamais reformulée. */
  note: string
}

export function suggestMissionReinjectionFromMilestone(
  milestone: Pick<DeclaredMissionDeliveryMilestone, 'key' | 'note'>,
): MissionDeliveryMilestoneReinjectionSuggestion {
  const loopKey = MISSION_DELIVERY_MILESTONE_REINJECTION_LOOP[milestone.key]
  const loop = MISSION_REINJECTION_LOOPS.find(l => l.key === loopKey)!
  return { loopKey, targetCanonicalObject: loop.targetCanonicalObject, note: milestone.note }
}
