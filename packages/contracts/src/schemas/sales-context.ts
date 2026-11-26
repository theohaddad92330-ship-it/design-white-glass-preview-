import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  SalesContext — moteur méthodologie sales ESN (Annexe Théo         */
/*  2026-07-21). Plan: agent_docs/methodo-sales-esn-plan.md.          */
/*                                                                    */
/*  Thèse Théo (p2/p31) : une ESN ne gagne pas avec le plus de        */
/*  données, mais parce qu'elle CHOISIT un compte accessible, un      */
/*  angle crédible, un interlocuteur utile, une séquence disciplinée  */
/*  — ADAPTÉS AU PROFIL. Le produit doit cesser de proposer la même   */
/*  stratégie à toutes les ESN et à tous les comptes.                 */
/*                                                                    */
/*  Réduit à une phrase produit : un SalesContext DÉTERMINISTE =      */
/*    (profil + stade ESN) × (archétype compte) × (état relation)     */
/*  qui branche score / contacts / actions / plan / messages — chaque */
/*  reco citant la RÈGLE + le PROFIL + la PREUVE (p29 impl-map).       */
/*                                                                    */
/*  Ce contrat est le KEYSTONE (Phase 0) : il promeut en VRAIS champs */
/*  les dimensions aujourd'hui mortes / déclarées-user / non câblées  */
/*  (« capturé ≠ consommé », p26), et réconcilie les DEUX échelles    */
/*  de taille qui divergent (archétype 5-buckets `esn_profiler.py` vs */
/*  calibration 3-bandes `bellum_strategy.py`) en UN SEUL `esnStage`. */
/*                                                                    */
/*  Source de vérité = ce contrat zod (CLAUDE.md : zod = @bellum/     */
/*  contracts). Le JSON Schema neutre + le miroir Python sont ajoutés */
/*  dans la phase qui THREAD ce contexte dans le pipeline IA (comme   */
/*  le profil aujourd'hui), là où le verrou cross-lang sert.          */
/*                                                                    */
/*  Nommage (règle permanente) : pas de « v2/v3 ». `salesContext-     */
/*  Version` est un compteur de correction (comme OrgGraph.graph-     */
/*  Version), PAS un suffixe de version de feature.                   */
/* ------------------------------------------------------------------ */

// ─── Confidence & provenance primitives ──────────────────────────────

/** Confidence 0-100, explicable et recalculable (parité OrgGraph). */
const salesConfidenceSchema = z.number().int().min(0).max(100)

/** Comment un axe du contexte a été obtenu. Pilote l'invariant de certitude :
 *  une assertion USER est certaine (100) ; une INFÉRENCE machine plafonne (≤99)
 *  et doit citer sa preuve ; un `default` = fallback quand rien n'est connu. */
export const salesDerivationSchema = z.enum([
  'user_declared', // saisi par le commercial (onboarding / réglage compte)
  'user_override', //  l'utilisateur a corrigé une valeur inférée
  'inferred', //       dérivé de signaux (NAF, secteur, taille, CRM, statut…)
  'default', //        aucune donnée — valeur de repli, jamais présentée comme un fait
])

/** Citation obligatoire attachée à CHAQUE reco aval (score/contacts/actions/plan/
 *  messages) : « cite la règle + le profil + la preuve » (DoD p31). Exporté ici
 *  pour que toutes les phases importent UNE seule forme. */
export const salesRuleCitationSchema = z.object({
  /** Id/label de la règle métier invoquée (business_rules registry, playbook…). */
  rule: z.string().min(1),
  /** Quelle dimension du profil/stade ESN a fait pencher la reco. */
  profileBasis: z.string().optional(),
  /** Preuves : refs sources, signaux, ids CRM. Jamais inventées. */
  evidence: z.array(z.string()).default([]),
})

// ─── Axe 1 — Profil & stade ESN (cluster A, p3-4) ────────────────────

/** UNE seule source de vérité pour le stade ESN (p3). Réconcilie l'archétype
 *  5-buckets (`esn_profiler.py`) ET la calibration 3-bandes (`bellum_strategy.py`)
 *  qui divergeaient. C'est le stade qui branche portes/score/contacts/actions. */
export const esnStageSchema = z.enum([
  'freelance', //       indépendant / très petite structure — founder-led, 1 porte à la fois
  'petite', //          petite ESN (≈ < 20 consultants) — accès direct, delivery contraint
  'structuration', //   en structuration (≈ 20-80) — 2-3 sales, process en train de naître
  'etablie', //         établie (≈ 80-300) — équipe sales, références, rang1 possible
  'grande', //          grande ESN (≈ 300+) — comptes clés, panels, rang1 assumé
])

/** Position dans la chaîne de sous-traitance (rang1 = prime, rang2 = sous-traitant). */
export const esnRankPositionSchema = z.enum(['rang1', 'rang2', 'mixte', 'inconnu'])

/** Modèle de staffing dominant. */
export const esnStaffingModelSchema = z.enum([
  'regie', //             régie / assistance technique
  'forfait', //           forfait / projet
  'centre_de_service', // centre de service / managed services
  'mixte',
  'inconnu',
])

/** Bande qualitative réutilisable (marge, TJM, bench, delivery, séniorité). */
export const esnBandSchema = z.enum(['bas', 'moyen', 'haut', 'inconnu'])

/** Modèle Go-To-Market : la routine plan/actions se dimensionne dessus (p9/p17). */
export const esnGtmModelSchema = z.enum([
  'founder_led', // le fondateur vend — 1 porte à la fois, cadence resserrée
  'team', //       équipe sales dédiée — volume, owners multiples
  'inconnu',
])

/**
 * #2645.2 — d'où vient le chiffre d'affaires : d'un contrat qui se reconduit,
 * ou d'une mission qui se termine.
 *
 * Deux consommateurs le lisent, et ils ne lisent pas la même chose :
 *  - l'ANGLE (`bellum_strategy.build_system_prompt`) — une mission ponctuelle
 *    s'ouvre sur un besoin daté, une mission installée sur la durée ;
 *  - la CADENCE (`cadence-templates.ts`) — un revenu ponctuel se relance plus
 *    serré et se reprend APRÈS livraison, un revenu récurrent se suit long.
 *
 * `inconnu` est une VALEUR, pas un trou : rien ne permet de deviner
 * « récurrent » chez qui n'a rien déclaré, et un axe non mesuré sort du
 * dénominateur plutôt que de valoir 0 (GA-18/GA-19).
 */
export const esnRevenueModelSchema = z.enum([
  'recurrent', // régie longue, forfait reconduit — le revenu se rejoue tout seul
  'mixte', //     les deux, sans dominante déclarée
  'ponctuel', //  mission ponctuelle, projet unique — le revenu s'arrête à la livraison
  'inconnu', //   non déclaré — aucun consommateur ne change quoi que ce soit
])

/** Modèle économique de l'ESN. `rang1`/`rang2` conditionnent l'angle d'ouverture. */
export const esnBusinessModelSchema = z.object({
  rankPosition: esnRankPositionSchema.default('inconnu'),
  // #2645.2 — le modèle de revenu change l'angle proposé ET la cadence de relance.
  revenueModel: esnRevenueModelSchema.default('inconnu'),
  staffingModel: esnStaffingModelSchema.default('inconnu'),
  marginBand: esnBandSchema.default('inconnu'),
  tjmBand: esnBandSchema.default('inconnu'),
})

/** Capacité à délivrer — conditionne l'agressivité de la reco (ne pas pousser un
 *  compte qu'on ne peut pas staffer). Intercontrats = vivier disponible. */
export const esnCapacitySchema = z.object({
  benchAvailable: esnBandSchema.default('inconnu'), // intercontrats / dispo immédiate
  deliveryCapacity: esnBandSchema.default('inconnu'),
  seniorityBand: esnBandSchema.default('inconnu'),
})

/** Les 5 routines de la table p23. Deux d'entre elles ne se déduisent PAS d'un
 *  effectif : « fondateur + alternant » est un binôme à rôles asymétriques (le
 *  closing ne s'assigne pas à l'alternant), et « account team » est une équipe
 *  pluridisciplinaire (sales + recruteur + delivery + consultant capteur). Elles
 *  se reconnaissent au vocabulaire déclaré, d'où un champ à part entière plutôt
 *  qu'un seuil sur `salesTeamSize`. */
export const esnSalesStructureSchema = z.enum([
  'founder_solo', //       fondateur seul — 3 actions fortes/jour
  'founder_alternant', //  fondateur + alternant — volume vs stratégie/closing
  'duo_trio', //           2-3 sales — portefeuille par segment, revue hebdo
  'equipe', //             équipe 5+ — owners comptes, SDR/AE/AM, forecast
  'account_team', //       account team — objectifs de compte communs
  'inconnu', //            non déclaré — aucun consommateur ne change quoi que ce soit
])

/** Go-To-Market : structure de vente (≠ nb de consultants — p17). */
export const esnGtmSchema = z.object({
  model: esnGtmModelSchema.default('inconnu'),
  channels: z.array(z.string()).default([]),
  /** Structure sales : fondateur seul (1) / 2-3 / 5+ — dimensionne les routines. */
  salesTeamSize: z.number().int().min(0).optional(),
  /** La routine p23 retenue. `salesTeamSize` seul ne peut pas la porter. */
  structure: esnSalesStructureSchema.default('inconnu'),
})

/** Preuve sociale mobilisable dans l'angle et les messages (aujourd'hui → `N/A`). */
export const esnReferencesSchema = z.object({
  sectors: z.array(z.string()).default([]),
  clients: z.array(z.string()).default([]),
  cases: z.array(z.string()).default([]),
})

/** Profil ESN promu en vrais champs (p3-4). Remplace les 9 colonnes mortes de
 *  `esn_profiles` + les lectures `personas/avgTJM/salesCycle/references` toujours
 *  `N/A`. `stage` est la clé de branchement ; le reste nuance. */
export const esnProfileContextSchema = z.object({
  stage: esnStageSchema,
  businessModel: esnBusinessModelSchema.prefault({}),
  capacity: esnCapacitySchema.prefault({}),
  gtm: esnGtmSchema.prefault({}),
  references: esnReferencesSchema.prefault({}),
  /** Outils comme INPUT stratégie (CRM, ATS, sourcing) — pas décoratif. */
  tools: z.array(z.string()).default([]),
})

// ─── Axe 2 — Archétype compte (cluster B, p5-6) ──────────────────────

/** Archétype compte NET-NEW (p5) — au-delà du secteur seul (9 verticales) : combine
 *  secteur + taille + NAF + entités. Corrige les trous média / startup / PME /
 *  international du modèle actuel (`approachAngle` 3 valeurs + playbook plan-only). */
export const accountArchetypeSchema = z.enum([
  'startup', //            hyper-croissance, décision rapide, peu de process achat
  'pme_eti', //            PME/ETI — dirigeant proche, cycle court/moyen
  'grand_groupe', //       grand groupe privé — panels, DSI, gouvernance
  'banque_assurance', //   banque/assurance — régul, sécurité, référencement lourd
  'public', //             secteur public — marchés, CPV, temporalité longue
  'luxe_retail_media', //  luxe/retail/média — marque, saisonnalité, time-to-market
  'industrie', //          industrie — OT/IT, sites, cycles d'investissement
  'international', //       multi-pays — langue, sources, entité locale (country_packs)
  'inconnu', //            non classé — jamais forcer un archétype par défaut
])

/** Archétype compte + provenance : jamais inventé, cite ce qui l'a déterminé. */
export const accountArchetypeContextSchema = z.object({
  archetype: accountArchetypeSchema,
  derivation: salesDerivationSchema.default('inferred'),
  confidence: salesConfidenceSchema.default(0),
  /** NAF, secteur, taille, entités qui ont fait pencher la classification. */
  evidence: z.array(z.string()).default([]),
})

// ─── Axe 3 — État de la relation (cluster B, p6/p13) ─────────────────

/** Taxonomie relation AU NIVEAU DU COMPTE (p6, TABLE B) — net-new. Dérivée de
 *  `commercial_status` + présence CRM + `AnalysisContext` + dernière interaction ;
 *  override user possible. C'est ce qui différencie froid-vs-client-actif dans le
 *  ton des messages et la cadence (DoD p31). */
export const relationshipStateSchema = z.enum([
  'froid', //          aucun contact — prospection pure
  'connu', //          contact identifié, pas de relation active
  'linkedin', //       connexion LinkedIn acceptée — porte tiède
  'dormant', //        relation passée en sommeil — réactivation
  'refere', //         introduit par un tiers (référence/parrainage)
  'ancien_client', //  a déjà été client — réactivation à forte preuve
  'rang2', //          positionné en sous-traitant sur ce compte
  'client_actif', //   client en cours — expansion / cross-sell
  'besoin_ouvert', //  besoin identifié ouvert (BTMMP) — priorité haute
  // #2371.4 (#2887) — le 10e stade : une ESN PARTENAIRE de l'espace avec des
  // placements EN COURS (`partner_relations.siren` = `accounts.siren`,
  // `placements_active > 0`). On lui parle en pair, jamais en prospect.
  'partenaire_actif',
])

/** État relation + provenance + fraîcheur. */
export const relationshipContextSchema = z.object({
  state: relationshipStateSchema,
  derivation: salesDerivationSchema.default('inferred'),
  confidence: salesConfidenceSchema.default(0),
  /** ISO — dernière interaction connue (CRM/mail/LinkedIn) ; nourrit dormant/actif. */
  lastInteractionAt: z.string().optional(),
  evidence: z.array(z.string()).default([]),
})

// ─── Top-level SalesContext + invariants ─────────────────────────────

/** Forme objet (pour `.extend()` / lire `.shape`). */
export const salesContextBaseSchema = z.object({
  /** Bumpé à chaque correction user (parité OrgGraph.graphVersion) — history + recalc. */
  salesContextVersion: z.number().int().min(1).default(1),
  esnProfile: esnProfileContextSchema,
  account: accountArchetypeContextSchema,
  relationship: relationshipContextSchema,
})

/** Invariant de certitude, appliqué aux DEUX axes inférés (compte, relation).
 *  Encode « jamais inventer / cite la preuve » (p31) au niveau du type :
 *   - une assertion USER (declared/override) est certaine ⇒ confidence == 100 ;
 *   - une INFÉRENCE machine plafonne ⇒ confidence ≤ 99 ET cite ≥ 1 preuve ;
 *   - un `default` (rien de connu) ⇒ confidence == 0 et aucune preuve exigée. */
const enforceDerivation = (
  ctx: z.RefinementCtx,
  axis: 'account' | 'relationship',
  derivation: z.infer<typeof salesDerivationSchema>,
  confidence: number,
  evidenceCount: number,
) => {
  const bad = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })

  if (derivation === 'user_declared' || derivation === 'user_override') {
    if (confidence !== 100)
      bad([axis, 'confidence'], `a ${derivation} ${axis} is user-asserted and must have confidence 100`)
  } else if (derivation === 'inferred') {
    if (confidence > 99)
      bad([axis, 'confidence'], `an inferred ${axis} must have confidence ≤ 99 (100 means user-asserted)`)
    if (evidenceCount === 0)
      bad([axis, 'evidence'], `an inferred ${axis} must cite at least one piece of evidence (never fabricate)`)
  } else {
    // default
    if (confidence !== 0) bad([axis, 'confidence'], `a default ${axis} (nothing known) must have confidence 0`)
  }
}

/** Le contrat validé — la forme de base PLUS les invariants de certitude/preuve
 *  que la thèse impose (p31). Parser avec CECI. */
export const salesContextSchema = salesContextBaseSchema.superRefine((sc, ctx) => {
  enforceDerivation(ctx, 'account', sc.account.derivation, sc.account.confidence, sc.account.evidence.length)
  enforceDerivation(
    ctx,
    'relationship',
    sc.relationship.derivation,
    sc.relationship.confidence,
    sc.relationship.evidence.length,
  )
})

export type SalesDerivation = z.infer<typeof salesDerivationSchema>
export type SalesRuleCitation = z.infer<typeof salesRuleCitationSchema>
export type EsnStage = z.infer<typeof esnStageSchema>
export type EsnRankPosition = z.infer<typeof esnRankPositionSchema>
export type EsnRevenueModel = z.infer<typeof esnRevenueModelSchema>
export type EsnStaffingModel = z.infer<typeof esnStaffingModelSchema>
export type EsnBand = z.infer<typeof esnBandSchema>
export type EsnGtmModel = z.infer<typeof esnGtmModelSchema>
export type EsnSalesStructure = z.infer<typeof esnSalesStructureSchema>
export type EsnBusinessModel = z.infer<typeof esnBusinessModelSchema>
export type EsnCapacity = z.infer<typeof esnCapacitySchema>
export type EsnGtm = z.infer<typeof esnGtmSchema>
export type EsnReferences = z.infer<typeof esnReferencesSchema>
export type EsnProfileContext = z.infer<typeof esnProfileContextSchema>
export type AccountArchetype = z.infer<typeof accountArchetypeSchema>
export type AccountArchetypeContext = z.infer<typeof accountArchetypeContextSchema>
export type RelationshipState = z.infer<typeof relationshipStateSchema>
export type RelationshipContext = z.infer<typeof relationshipContextSchema>
export type SalesContext = z.infer<typeof salesContextSchema>
