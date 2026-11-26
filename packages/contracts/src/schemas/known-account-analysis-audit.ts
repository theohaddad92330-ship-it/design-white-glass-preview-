import { z } from 'zod'

/**
 * #2929 (LAU-FINAL-033, #2292) — ANALYSE COMPTE CONNU : L'AUDIT des points
 * retenus qui restent SANS appelant réel après trois lots de nuit (24-26/09).
 *
 * Cinq points étaient déjà couverts avant ce lot (#2292.7 « déjà là » —
 * `LaunchCostNote` ; #2292.17/.18 — libellés de fraîcheur ; #2292.22/.25 —
 * `chat_tools.py`, `resolve_account_territory`/`get_account_contacts`). Un
 * sixième, #2292.2, est reclassé « déjà là » PAR ce fichier : le préflight
 * existe déjà sous un autre nom, `RelaunchImpactTooltip`
 * (`apps/web/src/features/accounts/view/account-detail/components/RelaunchImpact.tsx`)
 * — au survol d'« Actualiser l'analyse », il dit ce qui est CONSERVÉ (contacts
 * déjà trouvés, fiche corrigée à la main) et LE COÛT, avant le clic. Le grep du
 * mot littéral « préflight »/« preflight » (lots précédents) ne le trouvait
 * pas — chercher l'APPELANT réel plutôt que le mot de l'issue en trouve un.
 *
 * Les NEUF restants forment, comme les trois lots précédents l'ont mesuré à
 * chaque passage, UN seul système (nouveau cadrage de périmètre, cinq modes de
 * run neufs, nouveau routage de résultat IA, UI de sélection multi-scope) :
 * ajouter une valeur d'énumération sans appelant reproduirait l'anti-motif
 * que CLAUDE.md nomme (« du code juste, calculé, testé, que personne
 * n'appelle »). Ce fichier ne les laisse pas dans un silence — il les AUDITE,
 * point par point, avec la preuve du plus proche voisin déjà réel (même
 * discipline que `page-contract.ts` / `architecture-doctrine-audit.ts`).
 */

export const KNOWN_ACCOUNT_ANALYSIS_POINTS = [
  'preflight_scope_framing',
  'preflight_missing_before_launch',
  'preflight_proposes_mode',
  'mode_entities_and_sites',
  'mode_ecosystem',
  'mode_access',
  'mode_meeting_prep',
  'mode_scope_comparison',
  'multi_scope_comparator',
] as const
export const knownAccountAnalysisPointSchema = z.enum(KNOWN_ACCOUNT_ANALYSIS_POINTS)
export type KnownAccountAnalysisPoint = z.infer<typeof knownAccountAnalysisPointSchema>

export const KNOWN_ACCOUNT_ANALYSIS_STATUSES = ['present', 'absent', 'unverified'] as const
export const knownAccountAnalysisStatusSchema = z.enum(KNOWN_ACCOUNT_ANALYSIS_STATUSES)
export type KnownAccountAnalysisStatus = z.infer<typeof knownAccountAnalysisStatusSchema>

export type KnownAccountAnalysisEntry = {
  claim: string
  status: KnownAccountAnalysisStatus
  /** `fichier:ligne` du plus proche voisin réel, ou `null` si rien n'existe. */
  nearestNeighborEvidence: string | null
  note: string
}

export const KNOWN_ACCOUNT_ANALYSIS_AUDIT: Readonly<Record<KnownAccountAnalysisPoint, KnownAccountAnalysisEntry>> = {
  preflight_scope_framing: {
    claim: 'Le préflight cadre le scope (groupe/filiale/BU/pays/objectif/exclusions) avant le lancement.',
    status: 'absent',
    nearestNeighborEvidence: null,
    note: 'RelaunchImpactTooltip (#2292.2, déjà là) ne propose aucun cadrage de périmètre — un seul compte, sans découpage groupe/filiale/BU.',
  },
  preflight_missing_before_launch: {
    claim: 'Le préflight indique ce qui manque avant de lancer.',
    status: 'absent',
    nearestNeighborEvidence: 'apps/ia/app/prompts/bellum_advisor.py',
    note: "« Ce qu'on ne sait pas » existe en POST-analyse (bellum_advisor.py) ; le porter en PRÉ-run demanderait un nouvel appel avant tout lancement, pas une extension de RelaunchImpactTooltip.",
  },
  preflight_proposes_mode: {
    claim: "Le préflight propose un mode d'analyse à l'utilisateur.",
    status: 'absent',
    nearestNeighborEvidence: null,
    note: "Dépend des cinq modes neufs (ci-dessous) et d'un sélecteur d'écran ; rien à proposer tant que les modes n'existent pas dans `run_mode`.",
  },
  mode_entities_and_sites: {
    claim: 'Mode « Entités et sites » sélectionnable au lancement.',
    status: 'absent',
    nearestNeighborEvidence: 'packages/contracts/src/schemas/analysis.ts:188',
    note: "`run_mode` (contrat) n'a que full/refresh/contacts/signals, jamais appelé par aucun écran (code mort) — ajouter une 5ᵉ valeur sans appelant reproduirait l'anti-motif du dépôt.",
  },
  mode_ecosystem: {
    claim: 'Mode « Écosystème » sélectionnable au lancement.',
    status: 'absent',
    nearestNeighborEvidence: 'packages/contracts/src/schemas/analysis.ts:564',
    note: '`ecosystem` existe comme DIMENSION de refresh (REFRESH_DIMENSION_CREDIT_COST), pas comme mode de run sélectionnable au lancement.',
  },
  mode_access: {
    claim: 'Mode « Accès » sélectionnable au lancement.',
    status: 'absent',
    nearestNeighborEvidence: 'packages/contracts/src/schemas/account-score.ts',
    note: '`access` existe comme AXE de score, pas comme mode de run.',
  },
  mode_meeting_prep: {
    claim: 'Mode « Préparation rendez-vous » sélectionnable au lancement.',
    status: 'absent',
    nearestNeighborEvidence: 'packages/contracts/src/schemas/daily-briefing.ts:532',
    note: "`meeting_prep` existe comme type de brief séparé (briefing quotidien), pas comme mode de run au lancement d'une analyse.",
  },
  mode_scope_comparison: {
    claim: 'Mode « Comparaison de périmètres » sélectionnable au lancement.',
    status: 'absent',
    nearestNeighborEvidence: 'packages/contracts/src/schemas/reply-blocks.ts:185',
    note: '`comparisonBlock` (rendu générique de réponse) existe, non câblé à un mode « comparer périmètres » — nouveau routage de résultat, pas une extension.',
  },
  multi_scope_comparator: {
    claim: 'Comparateur multi-scope (siège vs filiales vs BU vs sites).',
    status: 'absent',
    nearestNeighborEvidence: 'packages/contracts/src/schemas/reply-blocks.ts:185',
    note: '`comparisonBlock` générique existe ; le câbler à un mode compte + une UI de sélection multi-scope est le même chantier que `mode_scope_comparison`.',
  },
}
