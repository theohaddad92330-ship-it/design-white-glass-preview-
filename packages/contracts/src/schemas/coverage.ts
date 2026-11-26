import { z } from 'zod'
import { marketRoleFamilySchema } from './market-memory.js'

/* ------------------------------------------------------------------ */
/*  Zones blanches / coverage gaps (Drive backlog #5)                 */
/*                                                                    */
/*  Théo's plan-de-compte method (METHODE-PLAN-DE-COMPTE-ESN):        */
/*  a fully-covered account engages ~12 contacts spread across        */
/*  3 hierarchy LEVELS (C-Level sponsor · N-1 decision-maker with     */
/*  budget · N-2 manager/user with the pain) and 2-3 business-unit    */
/*  FAMILIES, with ZERO single-champion dependency. This contract     */
/*  reports, for one account, which families & levels are COVERED vs  */
/*  MISSING, a 0..1 coverage score, and a short list of concrete      */
/*  "zones blanches" (missing family×level suggestions) for the rep.  */
/* ------------------------------------------------------------------ */

/** The 3 canonical decision LEVELS of the plan-de-compte method, expressed as
 *  the relative C / N-1 / N-2 axis (knowledge-pack-v2 §"Hierarchy levels"):
 *   - `c_level` → executive sponsor (CIO/DSI, CTO, CDO, CISO, CFO, DG…)
 *   - `n1`      → direction with budget authority (Directeur/VP/Head of…)
 *   - `n2`      → management / expert / operational relay (Manager/Lead/PO…) */
export const coverageLevelSchema = z.enum(['c_level', 'n1', 'n2'])

/** Coverage status of one decision-maker FAMILY for the account. */
export const coverageFamilyStatusSchema = z.object({
  /** Canonical family key (lower-case slug): it, cyber, data, ia, infra, dev,
   *  pmo, finance, clevel, achat, rh. */
  family: z.string(),
  /** Human display label ("Cyber / Sécurité"). */
  label: z.string(),
  /** At least one contact classified in this family. */
  covered: z.boolean(),
  /** Number of the account's contacts classified in this family. */
  contact_count: z.number().int(),
  /** Whether this family counts toward the family-breadth target (the strategic
   *  buying-center BUs). Support families (PMO/C-Level/RH) are shown but do not
   *  count toward "2-3 families". */
  is_target: z.boolean(),
})

/** Coverage status of one decision LEVEL for the account. */
export const coverageLevelStatusSchema = z.object({
  level: coverageLevelSchema,
  /** Human display label ("C-Level (sponsor)"). */
  label: z.string(),
  covered: z.boolean(),
  contact_count: z.number().int(),
})

/** One concrete "zone blanche": a strategic family×level cell the account has
 *  no contact in, with a suggested decision-maker title and the rationale. */
export const coverageGapSchema = z.object({
  family: z.string(),
  family_label: z.string(),
  level: coverageLevelSchema,
  level_label: z.string(),
  /** Compact one-liner for the UI ("Cyber / Sécurité — RSSI / CISO (N-1)"). */
  label: z.string(),
  /** Example decision-maker title(s) to target for this family×level. */
  suggested_titles: z.string(),
  /** Why this gap matters (French, rep-facing). */
  reason: z.string(),
  /** 1 = most important zone blanche to close first. */
  priority: z.number().int(),
})

/** Une CELLULE de la matrice famille × niveau : combien de contacts du compte
 *  tombent exactement à cette intersection.
 *
 *  Sans elle, la réponse ne portait que des totaux par famille ET par niveau,
 *  séparément — impossible de PROUVER qu'une cellule est couverte (rapport TF1
 *  p32-33). Le front devait se rabattre sur « possible mais non prouvé ». */
export const coverageCellSchema = z.object({
  family: z.string(),
  level: coverageLevelSchema,
  /** Contacts placés à la fois dans cette famille ET à ce niveau. */
  contact_count: z.number().int(),
})

/** Une cellule ENTITÉ × famille × niveau : combien de contacts de CETTE entité du
 *  compte tombent à cette intersection.
 *
 *  L'axe manquant de la maquette p19 (« Matrice de couverture par entité, famille
 *  et niveau »). Sans lui, une famille couverte chez une filiale et vide chez une
 *  autre s'affiche « couverte » : la vraie zone blanche est masquée par
 *  l'agrégation, et l'écran ne sait pas dire QUELLE entité viser (rapport p32 §2). */
export const coverageEntityCellSchema = z.object({
  /** Libellé d'entité tel que porté par les contacts (jamais réécrit). */
  entity: z.string(),
  family: z.string(),
  level: coverageLevelSchema,
  contact_count: z.number().int(),
})

/** `GET /accounts/:id/coverage-gaps` response. */
export const coverageGapsResponseSchema = z.object({
  account_id: z.string().guid(),
  /** Overall decision-coverage score 0..1 — an even blend of family-breadth and
   *  level-depth coverage. 1 = every target family + all 3 levels engaged. */
  score: z.number(),
  /** Total contacts on the account (incl. unclassified). */
  contacts_total: z.number().int(),
  /** Contacts we could place on the family OR level map (the "engaged" set). */
  classified_contacts: z.number().int(),
  /** Théo's engaged-contact target (~12). */
  target_contacts: z.number().int(),
  /** Per-family coverage map (all canonical families). */
  families: z.array(coverageFamilyStatusSchema),
  /** Distinct TARGET families with ≥1 contact. */
  families_covered: z.number().int(),
  /** Minimum distinct target families to aim for (Théo: 2-3 → 3). */
  families_target: z.number().int(),
  /** Per-level coverage map (c_level / n1 / n2). */
  levels: z.array(coverageLevelStatusSchema),
  /** Levels with ≥1 contact. */
  levels_covered: z.number().int(),
  /** Level target (always 3: C-Level / N-1 / N-2). */
  levels_target: z.number().int(),
  /** Contacts flagged as champions (decision_role champion/sponsor). */
  champion_count: z.number().int(),
  /** True when the account's decision access rests on a single point of failure
   *  (≤1 engaged contact or ≤1 covered family) — Théo: ZERO single-champion
   *  dependency. */
  single_champion_risk: z.boolean(),
  /** Ranked concrete zones blanches (missing family×level suggestions). */
  gaps: z.array(coverageGapSchema),
  /** Matrice famille × niveau — uniquement les cellules PEUPLÉES (≥1 contact).
   *  Optionnel : un payload mis en cache avant ce champ reste valide, et le front
   *  retombe alors sur son ancien affichage « non prouvé ». */
  cells: z.array(coverageCellSchema).optional(),
  /** Rôles du comité d'achat effectivement couverts (p33 « Rôles couverts 4/8 »). */
  roles_covered: z.number().int().optional(),
  /** Taille du comité d'achat de référence (8 rôles, knowledge pack). */
  roles_target: z.number().int().optional(),
  /** Entités du compte où l'on a au moins un contact (p33 « Entités couvertes 2/7 »). */
  entities_covered: z.number().int().optional(),
  /** Entités connues du compte (cartographie). 0 = cartographie absente. */
  entities_total: z.number().int().optional(),
  /** NOMS des entités où l'on a au moins un contact, du mieux couvert au moins
   *  couvert (maquette p19 : la tuile dit « 2/7 » ET « TF1 SA, TF1 Pub »). */
  entities_covered_names: z.array(z.string()).optional(),
  /** NOMS des entités de la cartographie sans AUCUN contact prouvé — la réponse à
   *  « quelle entité viser ? » (p32 §2). Rapprochement par égalité stricte du nom
   *  normalisé : en cas de doute une entité est déclarée NON couverte, jamais
   *  couverte à tort. */
  entities_uncovered_names: z.array(z.string()).optional(),
  /** NOMS lus dans la cartographie et ÉCARTÉS du ratio parce que ce ne sont pas
   *  des entités — aujourd'hui : des PERSONNES.
   *
   *  Recette live du 29/08/2026, ROCHE : « Entités couvertes 26/27 · À ouvrir :
   *  Wafaa Mamilli — Chief Digital Technology Officer ». Un nom de personne
   *  gonflait le dénominateur, et le compte paraissait moins couvert qu'il ne
   *  l'est.
   *
   *  ⚠️ Ce champ existe pour que l'écart soit DIT. Écarter en silence ferait
   *  passer 26/27 à 26/26 sans que personne ne puisse expliquer la différence —
   *  et « on archive, on ne supprime pas » vaut ici comme ailleurs : l'entrée
   *  reste dans `raw_analysis`, elle cesse seulement de compter. */
  entities_excluded_names: z.array(z.string()).optional(),
  /** Rôles du comité d'achat SANS titulaire (le « qui manque » derrière le 4/8). */
  roles_missing: z.array(z.string()).optional(),
  /** #4324.1 — POURQUOI le siège technique (DSI / RSSI) est vide, quand il l'est : `no_it_contact` = aucun contact IT
   *  collecté ; `it_below_director` = des contacts IT (`it_contacts`), aucun au niveau direction. Absent = un titulaire
   *  est reconnu (rôle posé ou intitulé équivalent) ou payload antérieur : jamais un motif deviné. */
  technical_gap: z
    .object({ reason: z.enum(['no_it_contact', 'it_below_director']), it_contacts: z.number().int().nonnegative() })
    .optional(),
  /** Matrice ENTITÉ × famille × niveau — cellules PEUPLÉES uniquement. Absente
   *  d'un payload en cache : l'écran retombe alors sur la matrice agrégée. */
  entity_cells: z.array(coverageEntityCellSchema).optional(),
  /** Confiance DONNÉE /100 (p29) — distincte du taux de couverture : elle dit à quel
   *  point on peut se fier à ce qu'on a, pas combien on en a. */
  confidence: z
    .object({
      score: z.number().int(),
      /** Les 5 composants de la grille p29, chacun /100, pour l'explicabilité. */
      identity: z.number().int(),
      freshness: z.number().int(),
      coverage: z.number().int(),
      sources: z.number().int(),
      consistency: z.number().int(),
      /** #2307.7 — « personnes vérifiées », DIAGNOSTIC seulement : ne compte
       *  PAS dans `score`. Distinct de `identity` (joignable ≠ vérifié) — un
       *  contact peut porter un email jamais vérifié (`email_verified`).
       *  Optionnel : absent d'un payload émis avant son ajout. */
      verified: z.number().int().optional(),
      /** #2307.2 — « scope résolu », DIAGNOSTIC seulement : ne compte PAS dans
       *  `score`. 100 quand `raw_analysis.entity_resolution.state` est ANCRÉ
       *  (`isEntityResolutionAnchored`), 0 quand résolu mais NON ancré
       *  (ambigu/non résolu…) — un vrai fait, jamais un 0 par défaut. Absent
       *  quand `entity_resolution` n'existe pas encore (dossier antérieur à
       *  #2284) : « non mesuré » n'est jamais un score. */
      scope: z.number().int().optional(),
    })
    .optional(),
  /** Contacts placés dans une famille CIBLE. Réconcilie les dénominateurs :
   *  `classified_contacts` compte « famille OU niveau », `families_covered` ne
   *  compte que les familles cibles — d'où des écrans « 9 contacts / 0 famille »
   *  qui se contredisaient (p33). */
  target_family_contacts: z.number().int().optional(),
  /**
   * Les familles de rôles OBSERVÉES autour de ce compte par la mémoire marché
   * (#1610) — une TROISIÈME nature de preuve, à côté des contacts propres à
   * l'espace ci-dessus. Calculé côté service depuis #1579 (`roleFamilies` sur
   * `MarketMemoryService.coverageFor`), jamais lu côté écran jusqu'à ce lot.
   *
   * ⚠️ Ne participe JAMAIS à `score`, `families_covered` ni à aucun axe de la
   * matrice ci-dessus : le vocabulaire du corpus (« Direction / Conseil »,
   * « Développement »…) n'est pas celui des familles internes
   * (`BuyerRoleFamilyKey`), et l'écran ne tente AUCUN rapprochement entre les
   * deux — un faux rapprochement serait pire que l'absence d'info. Le libellé
   * imposé côté écran est « Famille observée sans contact actuel identifié »,
   * jamais « Non couvert » : cette liste ne dit PAS qu'une famille interne est
   * manquante, elle dit qu'un corpus tiers a observé des rôles de cette
   * nature autour du compte.
   *
   * Absent quand la mémoire marché n'est pas couverte pour ce compte — pas
   * assez d'observations, entreprise non résolue, lecture en panne. Les trois
   * cas se rendent pareil : le bloc n'apparaît pas, comme les ESN observées de
   * l'onglet Accès (#1579).
   */
  market_role_families_observed: z.array(marketRoleFamilySchema).optional(),
})

export type CoverageLevel = z.infer<typeof coverageLevelSchema>
export type CoverageFamilyStatus = z.infer<typeof coverageFamilyStatusSchema>
export type CoverageLevelStatus = z.infer<typeof coverageLevelStatusSchema>
export type CoverageGap = z.infer<typeof coverageGapSchema>
export type CoverageCell = z.infer<typeof coverageCellSchema>
export type CoverageEntityCell = z.infer<typeof coverageEntityCellSchema>
export type CoverageGapsResponse = z.infer<typeof coverageGapsResponseSchema>
