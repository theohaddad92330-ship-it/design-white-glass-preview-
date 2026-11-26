import { z } from 'zod'
// #2543.5a/.5b/.5g — un seul endroit pose le vocabulaire de l'état de la
// source de contacts + le résultat du repli web + celui de l'élargissement
// automatique (GA-26) ; l'organigramme le RÉUTILISE.
import {
  apolloSourceStatusSchema,
  contactsFallbackOutcomeSchema,
  contactsWidenOutcomeSchema,
  type ApolloSourceStatus,
  type ContactsFallbackOutcome,
  type ContactsWidenOutcome,
} from './contacts-data.js'
// Les seuils de fraîcheur (30 j / 90 j) sont ceux du plan : un réglage vit à UN
// seul endroit (GA-26). Import à sens unique — `first-move.ts` n'importe que zod.
import { PLAN_FRESHNESS } from './first-move.js'
// #2284.5-.9 — la taxonomie d'entité commune. `entity-resolution.ts` n'importe
// d'ici que des TYPES (effacés) : aucun cycle au chargement.
import { entityKindSchema, ORG_ENTITY_TYPE_TO_ENTITY_KIND } from './entity-resolution.js'

/* ------------------------------------------------------------------ */
/*  OrgGraph — Account Mapping (Annexe Théo 2026-07-21)               */
/*                                                                    */
/*  Plan: agent_docs/org-mapping-plan.md.                             */
/*                                                                    */
/*  The org graph used to confuse hierarchy, influence and            */
/*  recommendation into one flat list. It now separates them into     */
/*  FOUR views a consumer can render independently (spec p5):         */
/*    1. organigramme vérifié  → hierarchyEdges where verified=true   */
/*    2. carte d'influence     → influenceEdges (probabilistes)       */
/*    3. buying committee      → buyingCommittee (rôles d'achat)      */
/*    4. chemin recommandé     → recommendedPath (séquence tactique)  */
/*                                                                    */
/*  Invariants the spec demands (p10/p14/p27/p30) are enforced HERE   */
/*  at the type level — a verified hierarchy line must be sourced, an  */
/*  influence must carry its reasoning, a rejected item never         */
/*  reappears, every id resolves. Strategy-dependent invariants (e.g. */
/*  "no board as first cold contact") stay in the golden tests.       */
/*                                                                    */
/*  Source of truth = this zod contract (CLAUDE.md: zod = @bellum/    */
/*  contracts). The language-neutral JSON Schema + Python mirror are  */
/*  added in the phase that first EMITS this graph (resolver/prompt), */
/*  where the cross-lang parity lock earns its keep.                  */
/* ------------------------------------------------------------------ */

// ─── Enums — Théo ontology (p6–p10) ──────────────────────────────────

/** Structural entity type (p6). A person is attached to ONE canonical node.
 *  This is the STRUCTURE axis — orthogonal to a person's buying role. */
export const orgEntityTypeSchema = z.enum([
  'groupe', //       racine, gouvernance, stratégie (TF1 Groupe, Crédit Agricole SA)
  'filiale', //      filiale / marque (LCL, TF1 Pub) — ownership/statut/pays vérifiés
  'bu', //           BU / direction (Data, DSI, Achats) — périmètre opérationnel
  'departement', //  département / équipe (Data Science) — niveau où les besoins émergent
  'programme', //    programme / projet (Graph:ID, TF1+) — overlay transverse, sponsor+équipe
  'site', //         site / région (Paris, usine) — géo, JAMAIS parent hiérarchique par défaut
  'spv', //          SPV / holding / bruit — exclu du graphe commercial par défaut
  // #2636.1 — l'organigramme ne cherchait l'IA qu'« en central » : une unité
  // IA/Data nommée comme telle (« AI Factory », « Data Office », « Lab »)
  // retombait sur le générique `bu`, invisible comme branche propre.
  'factory', //      AI/Digital Factory — unité de production IA dédiée
  'data_office', //  Data Office — gouvernance data/IA transverse au groupe
  'lab', //          Lab / Innovation Lab — exploration IA, hors delivery run
  // #2310.2/#2310.8 (épopée #2919) — deux nœuds que le graphe ne pouvait pas
  // porter : une ÉQUIPE (regroupement de personnes plus fin qu'un `bu`/
  // `departement`, ex. « squad Data »), et un PARTENAIRE (une organisation
  // TIERCE liée au compte, ex. un ESN concurrent co-traitant, un éditeur —
  // jamais un fournisseur À NOUS, doctrine « nos fournisseurs ne se nomment
  // jamais »). GA-08 : ajouts en FIN, l'ordre existant ne bouge pas.
  'equipe',
  'partenaire',
])

/** Modèle d'organisation IA/Data d'une entité (#2636.1) — collecté par Phase 1
 *  (`EntityExhaustive.it_autonomy`, `apps/ia/app/models/outputs/research.py`)
 *  mais qui n'atteignait jamais le graphe affiché : `org_graph_assembler.py`
 *  ne le lisait pas et le contrat ne le portait pas. Mêmes trois valeurs des
 *  deux côtés (GA-26 : un réglage vit à un seul endroit) — pas de synonymes
 *  « centralisé/décentralisé/hybride » inventés ici. */
export const orgItAutonomySchema = z.enum(['autonome', 'partage', 'centralise'])

/** Verified corporate status of an entity (p6: ownership/statut vérifiés). */
export const orgEntityStatusSchema = z.enum(['operating', 'ceded', 'dormant', 'unknown'])

/** Hierarchy level — computed WITHIN each entity/family, not globally (p7). */
export const orgHierarchyLevelSchema = z.enum([
  'L0', // Gouvernance — board/président/administrateur — sponsor lointain, rarement porte d'entrée
  'L1', // Exécutif — DG/DSI/CTO/CDO/CISO/CFO — vision/budget/arbitrage
  'L2', // Direction — VP/Directeur/Head of — budget de périmètre, programmes
  'L3', // Management — Manager/Lead/Responsable — douleur/équipe/besoin/accès
  'L4', // Expert/opérationnel — architecte/PO/engineer/analyst — usage/preuve/influence
  'L5', // Achats/contrôle — procurement/vendor/juridique/sécurité — processus, axe parallèle
])

/** Buying role — INDEPENDENT of the hierarchy (p8). Never fabricated: `unknown`
 *  when the data is insufficient (spec: "données insuffisantes - jamais inventer"). */
export const orgDecisionRoleSchema = z.enum([
  'economic_buyer', //  budget final sur le périmètre
  'technical_buyer', // valide faisabilité / architecture / sécurité
  'user_buyer', //      porte la douleur et utilise la prestation
  'champion', //        fait avancer, partage info et introduit
  'procurement', //     panel, contrat, tarifs et conformité
  'blocker', //         oppose / bloque pour raison identifiée
  'influencer', //      influence sans posséder la décision
  'unknown', //         données insuffisantes — jamais inventer
])

/** Structural relation carried by a hierarchyEdge (p9). `influences` is modelled
 *  separately (influenceEdge); `recommended_next` is expressed via recommendedPath.
 *  #2121.34 — `works_with` : Personne <-> Personne, HORS hiérarchie (aucun des
 *  deux ne dépend de l'autre) — preuve : mention croisée, co-signature, même
 *  projet nommé par les deux. `fromId`/`toId` n'ont pas de sens directionnel
 *  pour cette valeur ; ils sont conservés pour que le schéma reste UN seul
 *  type d'edge (GA-26), pas un cas particulier symétrique. */
export const orgHierarchyRelationSchema = z.enum([
  'reports_to', //   Manager -> Directeur (preuve: page off/LinkedIn/organigramme/bio)
  'member_of', //    Personne -> équipe/BU (preuve: titre + entité + source)
  'sponsors', //     C-level -> programme (preuve: interview/communiqué/governance)
  'owns_budget', //  Directeur -> périmètre (preuve: titre + source / hypothèse explicite)
  'procures_for', // Achats -> BU/catégorie (preuve: titre procurement / vendor)
  'works_with', //   Personne <-> Personne, collabore sur un même périmètre — pas hiérarchique
])

/** Posture of an influence edge toward a topic/decision (p13). */
export const orgInfluenceStanceSchema = z.enum(['supporter', 'neutral', 'detractor', 'unknown'])

/** Grounding level of a source (p10) — drives verified/dotted/rejected downstream. */
export const orgGroundingSchema = z.enum([
  'A', // vérifié — site off/organigramme/registre/bio actuelle → edge plein
  'B', // probable — LinkedIn actuel/communiqué/conférence/profil fournisseur → pointillé (conf 70-89)
  'C', // hypothèse — titre seul/cooccurrence/LLM → aucun lien hiérarchique, influence seulement
  'D', // bruit — homonyme/ex-employé/source ancienne/mauvaise entité → rejeté + mémorisé
])

/** Contact lifecycle state (p15). `historical` = ex-employé/capteur (vue réseau, pas
 *  org actuel) ; `rejected` = écarté et JAMAIS réinjecté. */
export const orgIdentityStatusSchema = z.enum([
  'seed', //             non affiché ou stock brut
  'verified_identity', // nœud possible
  'classified', //       nœud avec famille/niveau/rôle
  'enriched', //         coordonnées / photo / bio
  'actionable', //       chemin recommandé possible
  'historical', //       vue réseau / capteur, pas org actuel
  'rejected', //         jamais réinjecté
])

/** Importance of an uncovered zone (mirrors the existing uncoveredZones.importance). */
export const orgZoneImportanceSchema = z.enum(['critique', 'importante', 'secondaire'])

/** Provenance kind of a source record (p9 "preuve minimale").
 *
 *  ⚠️ GA-08 — l'ordre est FIGÉ et les ajouts vont en FIN. `workspace_user` et
 *  `workspace_import` (OrgGraph FINAL §7, v3 §7.1) sont donc les deux dernières
 *  valeurs : la première nomme une correction humaine first-party, privée à
 *  l'espace ; la seconde un import CSV/CRM. Elles étaient jusqu'ici confondues
 *  avec `org_chart`, ce qui rendait impossible de distinguer « quelqu'un de
 *  l'équipe l'affirme » de « l'organigramme officiel le montre » — deux preuves
 *  de forces très différentes lorsqu'une source externe les contredit. */
export const orgSourceKindSchema = z.enum([
  'official_site',
  'org_chart',
  'registry',
  'bio',
  'linkedin',
  'press',
  'conference',
  'vendor_profile',
  'crm',
  'llm',
  'other',
  'workspace_user',
  'workspace_import',
])

/**
 * CE QU'UNE PREUVE PROUVE (OrgGraph FINAL §6 ; v3 §5.2).
 *
 * « Une preuve d'identité ne peut jamais être réutilisée comme preuve de
 * relation. Deux claims différents = deux preuves différentes. »
 *
 * Le défaut P0 que ce vocabulaire rend NOMMABLE : l'assembleur réutilisait la
 * provenance de l'IDENTITÉ d'un contact (« LinkedIn connaît cette personne »)
 * pour atteindre le seuil de création d'un lien hiérarchique (« LinkedIn dit à
 * qui elle rapporte »). Les deux phrases n'ont rien à voir, et rien dans le
 * contrat ne permettait de le dire — on ne peut pas garder ce qui n'a pas de
 * nom.
 *
 * Six claims, et la frontière qui compte est `identity` ≠ `relation`.
 */
export const orgClaimSchema = z.enum([
  'identity', //   cette personne / cette entité existe et porte ce nom
  'title', //      cette personne porte ce titre
  'level', //      cette personne se situe à ce niveau hiérarchique
  'membership', // cette personne / cette entité appartient à ce périmètre
  'roles', //      cette personne tient ces rôles de décision
  'relation', //   cette personne est en relation avec celle-là (reports_to, sponsors…)
])

/** Confidence is explicable and recalculable (p14). 0-100. */
const orgConfidenceSchema = z.number().int().min(0).max(100)

// ─── Node / edge / list shapes ───────────────────────────────────────

/** A single piece of evidence. Carried inline on entities/people; referenced by
 *  id from a hierarchyEdge's `sourceIds[]`. */
export const orgSourceSchema = z.object({
  id: z.string(),
  kind: orgSourceKindSchema,
  /** URL / citation / registry id. */
  ref: z.string().optional(),
  grounding: orgGroundingSchema,
  /** ISO date — freshness feeds the confidence score (p14: date < 12 mois → +10). */
  date: z.string().optional(),
  /**
   * Ce que cette preuve prouve, et RIEN d'autre (§6 du FINAL).
   *
   * Facultatif par rétrocompatibilité : les graphes déjà stockés portent des
   * sources sans claim, et les invalider rétroactivement effacerait des mois de
   * travail. Une source sans claim est donc une source dont on ne sait pas ce
   * qu'elle prouve — ce qui est une information, pas un blanc-seing : les
   * chemins d'écriture NEUFS (correction humaine) l'exigent, eux.
   */
  claim: orgClaimSchema.optional(),
})

/** A canonical organisational node. People attach to it by `entityId`, never by
 *  name-string (the old weakness). `parentId` builds the Groupe→Filiale→BU tree. */
export const orgEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: orgEntityTypeSchema,
  /** Parent entity id, or null for the group root. */
  parentId: z.string().nullable().optional(),
  country: z.string().optional(),
  status: orgEntityStatusSchema.default('unknown'),
  sources: z.array(orgSourceSchema).default([]),
  confidence: orgConfidenceSchema,
  /** #2636.1 — facultatif : Phase 1 ne le remplit que pour les entités
   *  majeures (comme `whatToSell`/`stack`), jamais deviné pour les autres. */
  itAutonomy: orgItAutonomySchema.optional(),
  /** #2284.5-.9, .14, .15, .17 — la taxonomie d'entité (`entity-resolution.ts`)
   *  posée sur le nœud, SEULEMENT quand elle affine `type` : une marque rangée
   *  en `filiale`, une direction métier rangée en `bu`. GA-26 : répéter la
   *  projection de `type` est refusé (`entity_kind_repeats_type`) et l'écran
   *  n'affiche qu'UNE des deux informations (`orgNodeRefinedKind`). Absent =
   *  le type suffit, ou graphe antérieur à #2284. */
  entityKind: entityKindSchema.optional(),
})

/** A person, attached to a canonical entity node. `hierarchyLevel` (structure) and
 *  `decisionRoles` (buying) are DISTINCT axes — a person can be L2 Direction AND a
 *  Champion, or L5 Achats AND Procurement (p8). */
export const orgPersonSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  title: z.string().optional(),
  /** Canonical entity this person belongs to (by id). null when not yet attached. */
  entityId: z.string().nullable().optional(),
  family: z.string().optional(),
  hierarchyLevel: orgHierarchyLevelSchema.optional(),
  decisionRoles: z.array(orgDecisionRoleSchema).default([]),
  identityStatus: orgIdentityStatusSchema,
  sources: z.array(orgSourceSchema).default([]),
  confidence: orgConfidenceSchema,
  /**
   * Le rôle de décision de cette personne est-il DÉDUIT ? (T5 §27.3 : « Badge
   * "déduit" — ✓ si inféré ».)
   *
   * `true` = aucune source n'a OBSERVÉ ce rôle : il est dérivé du titre par une
   * règle nommée (`decision_role.classify_decision_role`). C'est une inférence
   * auditable, pas un fait — et l'écran doit le dire, parce que « Sponsor » lu
   * sur une carte se lit comme une observation.
   *
   * `false` = quelqu'un l'a déclaré (saisie humaine / CRM). Absent = la personne
   * ne porte aucun rôle colorant (rôle `unknown`), il n'y a donc rien à qualifier
   * — et surtout pas un `false` qui se lirait « rôle confirmé ».
   */
  roleInferred: z.boolean().optional(),
  /**
   * Quand cette personne a été VÉRIFIÉE pour la dernière fois — pas quand sa
   * ligne a été écrite (voir `org-freshness.ts` pour la règle complète).
   *
   * Absent = **jamais vérifié**, et c'est une INFORMATION, pas un blanc : un
   * écran l'écrit en toutes lettres plutôt qu'un tiret muet, que le lecteur
   * comble tout seul — en général par « ça va ». Passer par
   * `readOrgFreshness()` : le seuil de péremption vit là-bas, et nulle part
   * ailleurs.
   */
  lastVerifiedAt: z.string().optional(),
  /**
   * #2554.1/#2554.2 — cette personne était dans le graphe STOCKÉ mais le run
   * d'actualisation le plus récent ne l'a pas retrouvée : elle n'est PAS
   * retirée (« on archive, on ne supprime pas »), elle est nommée « non
   * confirmée » depuis cette date. Ni « partie » (on n'a rien vérifié en ce
   * sens), ni « à jour » (voir `preserveNotConfirmedPeople`,
   * `org-graph-refresh-diff.ts`).
   *
   * Absent = confirmée par le dernier run qui l'a vue (ou jamais concernée).
   * Effacé dès qu'un run ultérieur la revoit.
   */
  notConfirmedSince: z.string().optional(),
})

/** A sourced structural relation. verified=true ⇒ plein/sourcé/≥90 ; verified=false
 *  ⇒ pointillé/≤89 (an inferred line is never presented as a fact — p27/p30). */
export const orgHierarchyEdgeSchema = z
  .object({
    fromId: z.string(),
    toId: z.string(),
    type: orgHierarchyRelationSchema,
    /** Ids of the source records backing this edge. Required (non-empty) when verified. */
    sourceIds: z.array(z.string()).default([]),
    confidence: orgConfidenceSchema,
    verified: z.boolean(),
    /**
     * Quand ce LIEN a été vérifié pour la dernière fois. `verified: true` dit
     * QUE quelqu'un l'a affirmé ; ce champ dit QUAND — et sans le quand,
     * l'affirmation ne vieillit pas, ce qui est faux d'un rattachement.
     *
     * Absent = jamais vérifié (ou vérifié avant que ce champ n'existe) : une
     * arête `verified` sans date se LIT non vérifiée, avec la mention « jamais
     * vérifié » — voir `readVerifiedWithFreshness()`. La preuve stockée
     * (`sourceIds`) n'est pas détruite pour autant : on archive, on ne supprime
     * pas.
     */
    lastVerifiedAt: z.string().optional(),
  })
  .superRefine((edge, ctx) => {
    // Grounding thresholds (p10/p14): a VERIFIED edge is sourced AND ≥90 ; an
    // inferred edge stays ≤89 (≥90 would mean verified). No line without proof.
    if (edge.verified) {
      if (edge.sourceIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceIds'],
          message: 'a verified hierarchyEdge requires at least one sourceId (no hierarchy line without proof)',
        })
      }
      if (edge.confidence < 90) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confidence'],
          message: 'a verified hierarchyEdge requires confidence ≥ 90',
        })
      }
    } else if (edge.confidence > 89) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confidence'],
        message: 'an unverified hierarchyEdge must have confidence ≤ 89 (≥ 90 means verified)',
      })
    }
  })

/**
 * A probabilistic influence edge — always carries confidence + reasoning (p27:
 * "une influence peut être hypothétique mais doit avoir confidence et reasoning").
 *
 * ⚠️ D405 (agent_docs/orggraph-final-2026-08-29.md, D270) — LE MANQUE que ce
 * bloc corrige : jusqu'ici, la seule provenance d'une influence vivait en PROSE
 * dans `reasoning`. Une prose n'est pas une provenance — elle ne se filtre pas,
 * ne vieillit pas, ne s'affiche pas comme une source. Le même motif que
 * `orgHierarchyEdgeSchema.sourceIds` est donc réutilisé ICI plutôt que réinventé
 * (« un réglage / une dérivation vit à un seul endroit », GA-26) :
 *
 * `sourceIds` — ids des `OrgSource` étayant cette influence, résolus côté
 * lecteur exactement comme pour une arête hiérarchique (`orgSourceResolver`).
 * Optionnel, par défaut `[]` : un graphe stocké avant ce chantier n'a que sa
 * prose, et ce vide est une INFORMATION (« provenance non capturée »), pas une
 * erreur à corriger rétroactivement.
 *
 * `derivedAt` — et PAS `observedAt`. Une influence est une INFÉRENCE : personne
 * n'a « observé », à une date, qu'Untel pèse sur tel sujet — le modèle l'a
 * DÉDUIT d'un titre, d'une cooccurrence, d'un raisonnement. Nommer ce champ
 * `observedAt` mentirait sur sa nature (exactement le mensonge que ce lot
 * corrige). `derivedAt` est la date du RUN qui a produit cette ligne — la seule
 * chose qu'on sait réellement : QUAND l'inférence a été faite, jamais QUAND le
 * fait daterait. Optionnel pour la même raison que `sourceIds` : un graphe
 * antérieur n'a pas cette date, et on ne la reconstitue pas — absente, elle se
 * lit « date de dérivation inconnue », jamais une date inventée.
 *
 * Gardé par GA-139 (apps/ia/tests/test_org_graph_assembler.py) côté producteur
 * et par le rendu de `OrgGraphViews` côté écran — une influence sans provenance
 * connue le DIT (« source inconnue »), elle ne se présente pas comme sourcée.
 */
export const orgInfluenceEdgeSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  topic: z.string(),
  stance: orgInfluenceStanceSchema.default('unknown'),
  confidence: orgConfidenceSchema,
  reasoning: z.string().min(1),
  /** Ids des `OrgSource` étayant cette influence. Même mécanisme que
   *  `orgHierarchyEdgeSchema.sourceIds` — voir le docblock ci-dessus (D405). */
  sourceIds: z.array(z.string()).default([]),
  /** Date de dérivation du RUN qui a produit cette influence — jamais une date
   *  d'observation. Voir le docblock ci-dessus (D405). */
  derivedAt: z.string().optional(),
})

/**
 * ÉDGES RELATIONNELS (épopée #2919, issue #2310).
 *
 * Cinq natures que ni `orgHierarchyEdgeSchema` (structure : qui rapporte à
 * qui) ni `orgInfluenceEdgeSchema` (qui pèse sur quoi) ne portent — un lien
 * de PROJET, de BLOCAGE ou de MISE EN RELATION, entre deux nœuds du graphe
 * (personnes ET entités, `equipe`/`partenaire` compris).
 *
 * `works_with` apparaît ICI et dans `orgHierarchyRelationSchema` : ce sont
 * DEUX choses distinctes qui partagent un mot, jamais la même valeur relue
 * deux fois (#2121.34 pose le premier, personne↔personne, hors hiérarchie ;
 * #2310.13 demande celui-ci, à l'échelle d'une entité/d'un workspace — une
 * équipe qui travaille avec un partenaire, par exemple). Les deux vivent dans
 * des TABLEAUX différents (`hierarchyEdges` / `relationalEdges`), donc aucune
 * valeur ne peut se retrouver dans le mauvais tableau par erreur de saisie.
 */
export const ORG_RELATIONAL_EDGE_TYPES = [
  'works_with',
  'owns_project',
  'blocks',
  'introduced_by',
  'related_workspace',
] as const
export const orgRelationalEdgeTypeSchema = z.enum(ORG_RELATIONAL_EDGE_TYPES)

/**
 * #2310.27 — qui PORTE cette relation : `workspace` quand cet espace l'a lue
 * ou saisie directement dans SES propres recherches/corrections ;
 * `market_memory` quand elle vient de la mémoire marché partagée entre
 * espaces. Jamais fusionnés : une relation `market_memory` reste une
 * observation transverse, jamais réécrite comme si CET espace l'avait
 * constatée lui-même — et #2310.10 le tient déjà à la racine : Market Memory
 * n'alimente QUE ce tableau-ci, jamais `people[]` ni `hierarchyEdges[]`
 * (voir `apps/ia/tests/test_org_graph_market_memory_never_creates_people.py`
 * côté producteur — aucun import ne relie l'assembleur à Market Memory).
 */
export const orgRelationalEdgeScopeSchema = z.enum(['workspace', 'market_memory'])

/** A single relational edge (#2310.13/.15/.19/.20/.21, .27, .28). */
export const orgRelationalEdgeSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  type: orgRelationalEdgeTypeSchema,
  scope: orgRelationalEdgeScopeSchema,
  /**
   * #2310.28 — QUI l'affirme : un identifiant/nom de personne pour une
   * relation `scope: 'workspace'` saisie par un utilisateur ; le nom du
   * PROCESSUS qui l'a dérivée pour `scope: 'market_memory'` — jamais un nom
   * de fournisseur (doctrine « nos fournisseurs ne se nomment jamais »).
   */
  author: z.string().min(1).max(200),
  /** Mêmes preuves que les autres edges — ids d'`OrgSource` portés par les
   *  nœuds (voir `orgSourceResolver`). Vide = affirmation sans preuve captée. */
  sourceIds: z.array(z.string()).default([]),
  confidence: orgConfidenceSchema,
})

/** One seat of the buying committee (rôle d'achat, pas hiérarchie). */
export const orgCommitteeMemberSchema = z.object({
  personId: z.string(),
  role: orgDecisionRoleSchema,
  entityId: z.string().nullable().optional(),
  reason: z.string().optional(),
  /** 0-100 — how reachable/actionable this seat is for the seller. */
  accessScore: orgConfidenceSchema.optional(),
})

/** A relevant gap for a given strategy (p18): not an empty cell, a MISSING coverage
 *  the rep should close, with the estimated Apollo stock and the queries to run. */
export const orgUncoveredZoneSchema = z.object({
  entityId: z.string().nullable().optional(),
  family: z.string().optional(),
  hierarchyLevel: orgHierarchyLevelSchema.optional(),
  importance: orgZoneImportanceSchema.default('importante'),
  reason: z.string(),
  suggestedTitles: z.array(z.string()).default([]),
  suggestedQueries: z.array(z.string()).default([]),
  /** Estimated number of Apollo profiles available for this zone (p18: "stock estimé"). */
  estimatedAvailable: z.number().int().min(0).optional(),
})

/** One step of the recommended commercial sequence (p21). Only ACTIONABLE, non-rejected
 *  people belong here (enforced below).
 *
 * #2963 (LAU-FINAL-053, épopée Recommended Path Builder) — l'issue demande huit
 * champs par étape (constat audit 25/09/2026). `whyNow`/`expectedResult`
 * reprennent des champs DÉJÀ produits par le LLM (`why_first`/`expected_outcome`,
 * bellum_organigramme.py) mais jamais surfacés séparément — ils étaient fondus
 * dans `objective` par un simple repli de clé. Les quatre autres
 * (`questionToAsk`/`infoToObtain`/`evidenceToUse`/`gatingCondition`) sont neufs
 * côté prompt. `nextPersonId` ne demande AUCUNE nouvelle collecte : c'est le
 * `personId` de l'étape suivante dans la MÊME séquence, dérivé structurellement
 * par `org_graph_assembler.py` — jamais un second champ LLM pour une donnée déjà
 * dans le tableau. Tous optionnels : un dossier antérieur au lot n'en porte
 * aucun, jamais devinés. */
export const orgRecommendedStepSchema = z.object({
  step: z.number().int().min(1),
  personId: z.string(),
  objective: z.string(),
  channel: z.string().optional(),
  unlocks: z.string().optional(),
  fallback: z.string().optional(),
  whyNow: z.string().optional(),
  questionToAsk: z.string().optional(),
  infoToObtain: z.string().optional(),
  evidenceToUse: z.string().optional(),
  expectedResult: z.string().optional(),
  gatingCondition: z.string().optional(),
  nextPersonId: z.string().optional(),
  risk: z.string().optional(),
})

/* ------------------------------------------------------------------ */
/*  Le chemin recommandé PART DE TOI, et il a TROIS formes.            */
/*  (tome 5 §27, `T5.md:815-831` — croisement couche zéro ×            */
/*   organigramme, U26/U29 du tome 1.)                                 */
/* ------------------------------------------------------------------ */

/**
 * Les trois formes, telles que la source les nomme :
 *
 * | Forme                  | Quand                                                    |
 * | ---------------------- | -------------------------------------------------------- |
 * | **Relation directe**   | un contact existe dans la couche zéro                    |
 * | **Relation à un saut** | un contact connaît quelqu'un de l'entité cible           |
 * | **Entrée froide**      | aucune relation — et **on le dit sans détour**           |
 *
 * ⚠️ CE QUE CE CONTRAT NE ROUVRE PAS. L'outil Laura `find_intro_path` a été
 * refusé, et sa raison est écrite (`apps/ia/app/services/chat_tools.py:1018`) :
 * « rien dans le dépôt ne modélise "telle personne connaît telle autre".
 * L'inventer voudrait dire inventer la donnée. » Ce refus porte sur l'outil ET
 * sur la donnée, et il tient toujours : **aucun champ ici ne dit « connaît »**.
 *
 * Ce sur quoi le saut s'appuie à la place, et qui EXISTE déjà :
 *  - `same_entity` — les deux personnes portent le même `entityId`. C'est une
 *    appartenance assemblée et sourcée, pas une relation supposée entre elles ;
 *  - `hierarchy` — une `orgHierarchyEdge` les relie, avec ses `sourceIds` ;
 *  - `influence` — une `orgInfluenceEdge` les relie, avec son `reasoning` et
 *    ses `sourceIds`.
 *
 * Et ce qui fait de quelqu'un un contact de la COUCHE ZÉRO n'est pas davantage
 * deviné : c'est une personne dont au moins une source est first-party
 * (`crm` / `workspace_user` / `workspace_import`), c'est-à-dire une personne
 * que l'espace a DÉJÀ dans ses propres registres. Le graphe le porte déjà.
 *
 * L'écart entre « X connaît Y » et « X et Y sont dans la même direction, et
 * voici la preuve » est tout le sujet : la seconde phrase est vraie et
 * vérifiable, la première serait inventée. Le chemin ne promet donc jamais une
 * introduction — il montre par où passer, et sur quelle pièce il s'appuie.
 */
export const ORG_PATH_FORMS = ['direct', 'one_hop', 'cold'] as const
export const orgPathFormSchema = z.enum(ORG_PATH_FORMS)

/** Le lien MODÉLISÉ qui rend un saut crédible. Aucune valeur ne dit « connaît »
 *  — voir le docblock ci-dessus. ⚠️ GA-08 : ordre figé, ajouts en FIN. */
export const orgHopBasisSchema = z.enum(['same_entity', 'hierarchy', 'influence'])

/** L'intermédiaire d'un chemin « à un saut », et la pièce qui l'étaye. */
export const orgPathHopSchema = z.object({
  /** La personne par qui l'on passe — toujours un `people[].id` du graphe. */
  personId: z.string(),
  basis: orgHopBasisSchema,
  /** Ids des `OrgSource` étayant le lien. Vide = le lien est structurel
   *  (`same_entity`), l'appartenance porte ses propres sources sur la personne. */
  sourceIds: z.array(z.string()).default([]),
})

/**
 * Le nœud « TOI » — d'où le chemin part, et ce que vaut ce point de départ.
 *
 * ⚠️ **Un chemin daté qui ne dit pas sa péremption est un piège** : « passe par
 * Untel » ne vaut que ce que vaut la fraîcheur du lien. La source l'écrit sous
 * la forme d'un avertissement attaché au trait — « ⚠ relation de 5 mois, à
 * revalider ». `relationFreshness` porte cet avertissement, et il est
 * OBLIGATOIRE : une origine qui tairait la fraîcheur laisserait lire une
 * relation de trois ans comme une relation d'hier.
 *
 * `inconnu` quand aucune date n'est saisie — « non mesuré » n'est jamais
 * « frais », pas plus qu'il n'est « 0 ».
 */
export const orgPathOriginSchema = z
  .object({
    form: orgPathFormSchema,
    /** Qui, côté ESN, porte la relation (`relationship_memory.owner`). */
    owner: z.string().max(200).optional(),
    /** L'état de la relation en clair, TEL QUE SAISI. Jamais reformulé. */
    relation: z.string().max(500).optional(),
    /** Date du dernier contact (`YYYY-MM-DD`) — la date de la RELATION, pas
     *  celle du run. Absente = jamais saisie. */
    relationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'relationDate must be YYYY-MM-DD')
      .optional(),
    /** L'avertissement de péremption. Mêmes seuils que le plan (30/90 j) —
     *  un réglage vit à UN seul endroit (GA-26), voir `first-move.ts`. */
    relationFreshness: z.enum(PLAN_FRESHNESS),
    /** L'intermédiaire — présent SI ET SEULEMENT SI la forme est `one_hop`. */
    hop: orgPathHopSchema.optional(),
  })
  .superRefine((origin, ctx) => {
    // Une forme « à un saut » sans intermédiaire est un saut qui ne dit pas par
    // qui : la promesse creuse que l'exigence interdit. Et un intermédiaire sur
    // une forme directe ou froide ferait lire un relais là où il n'y en a pas.
    if (origin.form === 'one_hop' && !origin.hop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hop'],
        message: 'a one_hop path must name the person it hops through',
      })
    }
    if (origin.form !== 'one_hop' && origin.hop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hop'],
        message: `a ${origin.form} path cannot carry a hop`,
      })
    }
  })

/** An item the pipeline rejected and MEMORISED so it never reappears (p10 D / p27). */
export const orgRejectedItemSchema = z.object({
  /** Id of the rejected person/entity/candidate. */
  sourceId: z.string(),
  reason: z.string(),
  /** #2284.14 — ce qu'EST l'écarté dans la taxonomie (un homonyme, une société
   *  cédée, un véhicule juridique…). Absent = non qualifié, jamais deviné. */
  entityKind: entityKindSchema.optional(),
})

/**
 * Une personne DÉCLARÉE par un humain sur ce compte (#1103).
 *
 * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un,
 * soit pouvoir décrire des éléments et ensuite ça intègre. »
 *
 * Miroir exact de {@link orgRejectedItemSchema} : le rejet mémorise ce qu'un run
 * ne doit JAMAIS réinjecter, la déclaration mémorise ce qu'il ne doit JAMAIS
 * perdre. Sans elle, une personne saisie à la main disparaîtrait à la première
 * réanalyse — et c'est le pire des deux mondes : on a demandé du travail à
 * quelqu'un et on l'a jeté sans le dire.
 *
 * Ce qui n'y est PAS, et pourquoi : aucun `entityId` ni `managerId`. On garde
 * les NOMS écrits par la personne. Un id ne survit pas au run suivant (les
 * entités sont réassemblées à chaque fois) ; un nom, lui, se re-rapproche. Une
 * entité qu'on ne retrouve pas laisse la personne rattachée à rien plutôt que
 * d'inventer un nœud — et un manager introuvable ne produit aucun lien
 * hiérarchique, jamais un lien vers quelqu'un d'autre.
 */
export const orgDeclaredPersonSchema = z.object({
  fullName: z.string().min(1).max(120),
  title: z.string().max(160).optional(),
  /** Entité/direction telle qu'ÉCRITE. Rapprochée par nom à chaque lecture. */
  entityName: z.string().max(160).optional(),
  /** Le N+1, tel qu'écrit. Aucun lien si on ne le retrouve pas. */
  managerName: z.string().max(120).optional(),
  linkedinUrl: z.string().max(300).optional(),
  /** ISO — quand la personne l'a déclaré. Ce n'est pas la date de lecture. */
  declaredAt: z.string(),
  /** Id de l'utilisateur qui déclare. Une déclaration a un auteur. */
  declaredBy: z.string().optional(),
  /**
   * #2553.3 — la date du DOCUMENT importé (organigramme daté), PAS celle du
   * geste d'import. « importer un organigramme qui a 3 ans, [que] les users
   * en ont conscience » (retour client 17/09/2026).
   *
   * Distinct de `declaredAt` : un formulaire ou un texte affirment
   * « aujourd'hui » — la personne qui tape le sait maintenant. Un FICHIER
   * importé porte un fait plus ancien, et confondre les deux ferait passer un
   * organigramme de 2023 pour vérifié ce jour. Absent = comme avant, la
   * personne est affirmée à la date du geste (formulaire, texte).
   */
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'documentDate must be YYYY-MM-DD')
    .optional(),
})

export type OrgDeclaredPerson = z.infer<typeof orgDeclaredPersonSchema>

/**
 * Ce qu'un écran envoie pour déclarer des personnes (#1103).
 *
 * `declaredAt` et `declaredBy` ne sont PAS dans la requête : ils sont posés par
 * le serveur. Une date d'origine cliente se règle, et un auteur choisi par
 * l'appelant n'est pas un auteur.
 */
export const declareOrgPeopleRequestSchema = z.object({
  people: z
    .array(orgDeclaredPersonSchema.omit({ declaredAt: true, declaredBy: true }))
    .min(1)
    // Au-delà, ce n'est plus une saisie mais un import de référentiel — qui
    // passerait par l'assistant d'import, avec sa simulation figée.
    .max(200),
  /** #2553 / #3740 — un organigramme IMPORTÉ crée aussi des contacts du compte
   *  (les nouvelles personnes ; les connues se lient, rien n'est écrasé). Absent
   *  = formulaire / texte : le graphe seul, comme avant. */
  createContacts: z.boolean().optional(),
})

export type DeclareOrgPeopleRequest = z.infer<typeof declareOrgPeopleRequestSchema>

/** Le compte-rendu d'une déclaration. `grafted: false` = l'ardoise est écrite,
 *  le dossier n'a pas encore de graphe où greffer — la personne apparaîtra au
 *  premier organigramme produit. L'écran le DIT plutôt que de laisser croire à
 *  un échec. */
export const declareOrgPeopleResponseSchema = z.object({
  graphVersion: z.number().int().min(1),
  declared: z.number().int().min(0),
  grafted: z.boolean(),
  /** #2553 / #3740 — présent quand `createContacts` était demandé : pour chaque
   *  personne, son contact et s'il a été créé ou seulement lié (déjà connu). */
  contacts: z
    .array(
      z.object({
        fullName: z.string(),
        contactId: z.string(),
        status: z.enum(['created', 'linked']),
      }),
    )
    .optional(),
})

export type DeclareOrgPeopleResponse = z.infer<typeof declareOrgPeopleResponseSchema>

/**
 * #3740 — l'APERÇU d'un organigramme importé : pour chaque ligne, ce que Bellum
 * sait déjà de la personne. Rien n'est écrit par l'aperçu.
 *
 * `known_in_graph` = déjà dans l'organigramme (la déclaration la CONFIRME) ;
 * `known_contact` = connue comme contact du compte mais absente du graphe (la
 * déclaration la greffe ET la complète) ; `new` = Bellum ne la connaît pas.
 * `fills` nomme ce que Bellum ajoute à la ligne du fichier — jamais ce que le
 * fichier a déjà écrit. Coordonnées en CLAIR (doctrine c87).
 */
export const orgImportPreviewRowSchema = z.object({
  fullName: z.string(),
  match: z.enum(['known_in_graph', 'known_contact', 'new']),
  bellum: z
    .object({
      title: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      linkedinUrl: z.string().optional(),
    })
    .optional(),
  fills: z.array(z.enum(['title', 'linkedinUrl'])),
})

export type OrgImportPreviewRow = z.infer<typeof orgImportPreviewRowSchema>

export const orgImportPreviewResponseSchema = z.object({ rows: z.array(orgImportPreviewRowSchema) })

export type OrgImportPreviewResponse = z.infer<typeof orgImportPreviewResponseSchema>

// ─── Couverture — ce qu'une VAGUE a couvert du compte ────────────────

/**
 * Ce que l'analyse a MESURÉ du corpus de contacts du compte (PDF-22 FINAL §3).
 *
 * Le défaut que ce bloc corrige : `CONTACTS_ENRICH_MAX` (50) plafonnait le
 * GRAPHE et pas seulement la vague d'enrichissement IA. Sur un compte à 2 241
 * contacts découverts, l'organigramme en portait 30 à 50 — et rien, nulle part,
 * ne disait que les 2 191 autres existaient. Le commercial concluait
 * raisonnablement « Bellum ne connaît que ces gens-là ».
 *
 * Ce bloc décorrèle les deux : `discovered` parle du CORPUS, `llmEnriched` de ce
 * qu'une vague a approfondi. `50` redevient ce qu'il aurait toujours dû être —
 * la taille d'une vague, pas la taille du compte.
 *
 * ⚠️ Ce qui n'est PAS ici, et pourquoi : les 2 241 fiches. La base Contacts
 * reste le corpus canonique ; `people[]` est une PROJECTION — les nœuds utiles à
 * la structure, pas l'annuaire. Dupliquer 2 000 profils dans ce blob JSON est
 * explicitement refusé au §15 du FINAL (scalabilité, et surtout : dès la
 * première correction humaine, deux copies divergeraient).
 *
 * ⚠️ Ce bloc est ABSENT quand le run n'a rien mesuré (dossier antérieur au
 * chantier, corpus jamais lu). Absent ≠ « 0 découvert » : c'est la distinction
 * que {@link deriveOrgCoverage} rend explicite en renvoyant `null`.
 */
export const orgCoverageSchema = z
  .object({
    /** Contacts découverts sur le compte, tous états confondus. */
    discovered: z.number().int().min(0),
    /**
     * Ceux qui portent une entité identifiée.
     *
     * OPTIONNEL, et absent en pratique aujourd'hui — c'est un trou NOMMÉ, pas un
     * oubli. Le rattachement à une entité est produit par la classification :
     * une graine de découverte porte `fullName`, `title`, `linkedinUrl`, jamais
     * d'entité. Le compter sur le corpus entier donnerait le nombre d'enrichis,
     * présenté comme un nombre de rattachés — donc « 40 rattachés sur 2 241 »
     * là où la vérité est « on ne sait pas pour 2 201 d'entre eux ».
     *
     * La question à se poser : si cette valeur est absente, « 0 » est-il VRAI ?
     * Non. Elle reste donc absente jusqu'à ce que le rattachement déterministe
     * couvre le corpus.
     */
    attachedToEntity: z.number().int().min(0).optional(),
    /** Ceux qu'un classement DÉTERMINISTE a situés dans la hiérarchie — 0 crédit. */
    deterministicClassified: z.number().int().min(0),
    /** Ceux qu'une vague LLM a approfondis (rôles, influence, N+1 probable). */
    llmEnriched: z.number().int().min(0),
    /** Taille de la vague d'enrichissement — le « 50 » du CTA. */
    enrichmentBatchSize: z.number().int().min(1).optional(),
    /** #2543.5a — l'état de la source pour CETTE recherche. Absent = non
     *  mesuré, jamais un « ok » deviné. Voir {@link apolloSourceStatusSchema}. */
    sourceStatus: apolloSourceStatusSchema.optional(),
    /** #2543.5a — la population que la source elle-même ANNONCE, pas
     *  seulement ce que le run a retenu. */
    sourceTotalEntries: z.number().int().min(0).optional(),
    /** #2543.5b — le repli web : tenté ou non, combien trouvés, l'échec
     *  nommé s'il a levé. Voir {@link contactsFallbackOutcomeSchema}. */
    fallback: contactsFallbackOutcomeSchema.optional(),
    /** #2543.5g — la passe d'élargissement automatique : tentée ou non,
     *  stock initial, combien ajoutés (même 0). Absente = non tentée.
     *  Voir {@link contactsWidenOutcomeSchema}. */
    widened: contactsWidenOutcomeSchema.optional(),
  })
  .superRefine((coverage, ctx) => {
    // Un sous-ensemble ne dépasse pas son ensemble. Sans ces trois bornes, un
    // compteur pris à la mauvaise source (« enrichis » lu sur la liste complète)
    // passerait inaperçu et le bandeau annoncerait plus d'enrichis que de
    // contacts — exactement le genre de chiffre qu'on ne peut plus rattraper à
    // l'écran.
    const bounded: [keyof typeof coverage, number | undefined][] = [
      ['attachedToEntity', coverage.attachedToEntity],
      ['deterministicClassified', coverage.deterministicClassified],
      ['llmEnriched', coverage.llmEnriched],
    ]
    for (const [field, value] of bounded) {
      if (value != null && value > coverage.discovered) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${String(field)} (${value}) cannot exceed discovered (${coverage.discovered})`,
        })
      }
    }
  })

/**
 * Le bandeau de couverture, tel qu'un écran doit le lire.
 *
 * `number | null` et jamais `number` par défaut : « non mesuré » n'est pas
 * « mesuré à zéro ». Un dossier analysé avant ce chantier n'a AUCUN compteur de
 * corpus — écrire « 0 contact découvert » sur un compte qui en a 2 241 serait
 * plus faux que de ne rien écrire.
 *
 * Les trois derniers, eux, sont toujours des nombres : le graphe les porte, donc
 * ils sont toujours mesurables. Un graphe sans aucun lien vérifié en a
 * réellement zéro — ici « 0 » est VRAI.
 */
export type OrgCoverageHeader = {
  discovered: number | null
  attachedToEntity: number | null
  /** `discovered − attachedToEntity` : les personnes sans entité identifiée. */
  unassigned: number | null
  deterministicClassified: number | null
  llmEnriched: number | null
  /** Ce qu'une vague suivante peut encore approfondir. */
  remainingEnrichment: number | null
  enrichmentBatchSize: number | null
  hierarchyVerified: number
  hierarchyProbable: number
  uncoveredZones: number
  /** #2543.5a — voir {@link apolloSourceStatusSchema}. `null` = non mesuré. */
  sourceStatus: ApolloSourceStatus | null
  /** #2543.5a — la population ANNONCÉE par la source. `null` = non mesuré. */
  sourceTotalEntries: number | null
  /** #2543.5b — voir {@link contactsFallbackOutcomeSchema}. `null` = non
   *  applicable (aucune recherche live n'a mesuré le repli cette requête-ci). */
  fallback: ContactsFallbackOutcome | null
  /** #2543.5g — voir {@link contactsWidenOutcomeSchema}. `null` = la passe
   *  d'élargissement n'a pas tourné cette requête-ci. */
  widened: ContactsWidenOutcome | null
}

/**
 * La dérivation du bandeau — à UN seul endroit (loi 1 du tome 7).
 *
 * Deux chemins qui la referaient divergeraient : l'API et l'écran
 * n'annonceraient pas le même nombre de liens vérifiés, et personne ne saurait
 * lequel croire. Le compte des liens n'est donc JAMAIS stocké — il se recalcule
 * du graphe, ce qui le rend juste après une correction qui vient d'en élaguer un
 * (un compteur figé, lui, aurait menti d'une unité pour toujours).
 *
 * ⚠️ Ce que « deux chemins divergent » a VRAIMENT coûté (mesuré le 30/08/2026).
 * L'écran de l'organigramme ne passait pas par ici : il recomptait le bandeau
 * sur `graph.people`, LA PROJECTION. Deux compteurs sur six en sortaient faux,
 * et tous deux plafonnés par la taille de la vague d'enrichissement :
 *
 *   · « rattachés » — un nombre que ce fichier REFUSE de produire, affiché sans
 *     réserve (« 2 241 découverts · 43 rattachés » sur AIRBUS, quand la vérité
 *     est « on ne sait pas pour 2 198 d'entre eux ») ;
 *   · « enrichis IA » — 9 annoncés là où le run en avait mesuré 16, sur le
 *     dossier de démonstration Société Générale.
 *
 * `live` existe pour que l'écran n'ait plus AUCUNE raison de recompter. Le
 * dossier connaît sa liste de contacts en direct, le run n'en connaît qu'un
 * instantané : une recherche ciblée qui ajoute des contacts après le run rend le
 * total du bloc `coverage` périmé, jamais faux. `live.discovered` remplace donc
 * ce SEUL compteur — et rien d'autre : `remainingEnrichment` et `unassigned`
 * restent ancrés sur ce que le run a mesuré, sinon on annoncerait « il reste
 * 2 241 contacts à enrichir » à un run qui n'en a jamais vu que 2 000.
 */
export function deriveOrgCoverage(graph: OrgGraph, live: { discovered?: number | null } = {}): OrgCoverageHeader {
  const measured = graph.coverage ?? null
  return {
    discovered: typeof live.discovered === 'number' ? live.discovered : (measured?.discovered ?? null),
    attachedToEntity: measured?.attachedToEntity ?? null,
    // Dérivé du rattachement, donc absent avec lui : « 2 241 non rattachés »
    // serait aussi faux que « 0 rattaché ».
    unassigned: measured?.attachedToEntity == null ? null : measured.discovered - measured.attachedToEntity,
    deterministicClassified: measured?.deterministicClassified ?? null,
    llmEnriched: measured?.llmEnriched ?? null,
    remainingEnrichment: measured ? measured.discovered - measured.llmEnriched : null,
    enrichmentBatchSize: measured?.enrichmentBatchSize ?? null,
    hierarchyVerified: graph.hierarchyEdges.filter(edge => edge.verified).length,
    hierarchyProbable: graph.hierarchyEdges.filter(edge => !edge.verified).length,
    uncoveredZones: graph.uncoveredZones.length,
    // #2543.5a/.5b — pourquoi le stock est mince : non dérivé de `live`, ancré
    // sur ce que LE RUN a mesuré (comme `remainingEnrichment`) — un
    // rafraîchissement ciblé qui ajoute des contacts après coup ne rend pas
    // cet état périmé faux, il devient l'état d'AVANT ce rafraîchissement.
    sourceStatus: measured?.sourceStatus ?? null,
    sourceTotalEntries: measured?.sourceTotalEntries ?? null,
    fallback: measured?.fallback ?? null,
    widened: measured?.widened ?? null,
  }
}

/**
 * Le graphe connaît-il AU MOINS UN lien hiérarchique ?
 *
 * ⚠️ ARBITRAGE DATÉ — Louis 12/10/2026 (« la démo comme le produit soit carré »).
 * « 0 liens vérifiés · 0 liens probables · 0 zones à couvrir » est VRAI mais
 * illisible : trois zéros en rang disent « rien à voir » alors que la réalité est
 * « on ne connaît encore aucune hiérarchie ». Quand le graphe n'a AUCUNE arête,
 * ces trois compteurs ne s'affichent PAS ; l'écran dit à la place « Aucun lien
 * hiérarchique connu pour ce compte ». Dès qu'il y a ≥ 1 arête, rien ne change :
 * un vrai 0 reste un 0 (3 liens probables, 0 vérifié). Vaut pour TOUTES les
 * fiches. Garde : `org-coverage-banner-is-derived.test.ts`.
 */
export function orgHasHierarchyEdges(
  coverage: Pick<OrgCoverageHeader, 'hierarchyVerified' | 'hierarchyProbable'>,
): boolean {
  return coverage.hierarchyVerified + coverage.hierarchyProbable > 0
}

// ─── Le plancher de gris — mesuré par le GÉNÉRATEUR ──────────────────

/**
 * La part de nœuds GRIS que le générateur a produite (T5 §27.2, `T5.md:798-802`).
 *
 * > « Un organigramme où tout est coloré est un organigramme inventé. »
 * > Contrainte dure : sur un compte sans enrichissement lancé, au moins 60 % des
 * > nœuds sont gris. **Si le générateur colore plus, il invente.**
 *
 * Trois précisions que le dépôt avait perdues en chemin, et que ce bloc rétablit :
 *
 *  · le NUMÉRATEUR compte des NŒUDS de rôle `unknown`, pas des arêtes inférées ;
 *  · le DÉNOMINATEUR est l'ensemble des personnes que l'enrichissement n'a PAS
 *    touchées — « sans enrichissement lancé » est dans la phrase de la source, et
 *    une personne enrichie a le droit d'être colorée : c'est le travail qu'on a payé ;
 *  · le SENS est un PLANCHER qui accuse le GÉNÉRATEUR, pas un plafond d'étiquette
 *    posé au lecteur — c'est pourquoi la mesure est produite là où le graphe est
 *    ASSEMBLÉ (`apps/ia/app/services/org_graph_colouring.py`) et voyage AVEC lui.
 *
 * Le bloc est ABSENT quand il n'y a rien à mesurer (aucune personne non enrichie,
 * ou graphe antérieur à ce chantier). Absent ≠ « 0 % de gris » : la question ne
 * se pose pas, ce n'est pas qu'elle a une réponse nulle.
 */
/**
 * Le plancher, pour les graphes qui ne le transportent PAS.
 *
 * Un dossier analysé avant ce chantier n'a pas de bloc `colouring` : le lecteur
 * doit alors le recalculer, et il lui faut le seuil. Les graphes produits depuis
 * portent LEUR seuil (`colouring.floor`) et c'est celui-là qui gagne — un graphe
 * stocké reste lisible même si la valeur bouge un jour.
 */
export const ORG_GREY_NODE_FLOOR = 0.6

export const orgColouringSchema = z
  .object({
    /** Personnes que l'enrichissement n'a pas touchées — le seul ensemble visé. */
    unenriched: z.number().int().min(1),
    /** Parmi elles, celles dont le rôle de décision reste `unknown`. */
    grey: z.number().int().min(0),
    /** Le plancher appliqué (0-1). Voyage avec la mesure pour qu'un graphe
     *  stocké reste lisible même si le seuil bouge un jour. */
    floor: z.number().min(0).max(1),
  })
  .superRefine((colouring, ctx) => {
    if (colouring.grey > colouring.unenriched) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grey'],
        message: `grey (${colouring.grey}) cannot exceed unenriched (${colouring.unenriched})`,
      })
    }
  })

export type OrgColouring = z.infer<typeof orgColouringSchema>

/**
 * La lecture du plancher — à UN seul endroit (loi 1 du tome 7).
 *
 * `null` quand le graphe ne porte pas la mesure : soit rien n'était mesurable,
 * soit il a été produit avant ce chantier. Dans les deux cas l'écran se tait —
 * il n'affiche pas « 0 % gris », qui serait une accusation inventée.
 */
export function readOrgColouring(
  graph: OrgGraph,
): { unenriched: number; grey: number; share: number; floor: number; meetsFloor: boolean } | null {
  const measured = graph.colouring
  if (!measured || measured.unenriched === 0) return null
  const share = measured.grey / measured.unenriched
  return { ...measured, share, meetsFloor: share >= measured.floor }
}

// ─── Top-level OrgGraph + referential integrity ──────────────────────

/** The plain object shape (use this to `.extend()` / read `.shape`). */
export const orgGraphBaseSchema = z.object({
  /** Bumped on every user correction (p30) so history + score recalc can hang off it. */
  graphVersion: z.number().int().min(1).default(1),
  /** Hash of the prompt+inputs that produced this graph — reproducibility (p16 persist). */
  promptHash: z.string().optional(),
  entities: z.array(orgEntitySchema).default([]),
  people: z.array(orgPersonSchema).default([]),
  hierarchyEdges: z.array(orgHierarchyEdgeSchema).default([]),
  influenceEdges: z.array(orgInfluenceEdgeSchema).default([]),
  /** #2919/#2310.13-.21/.27/.28 — projet, blocage, mise en relation,
   *  workspace lié. Additif : un graphe antérieur n'en porte pas et se relit
   *  à l'identique, `[]` par défaut comme les autres tableaux d'edges. */
  relationalEdges: z.array(orgRelationalEdgeSchema).default([]),
  buyingCommittee: z.array(orgCommitteeMemberSchema).default([]),
  uncoveredZones: z.array(orgUncoveredZoneSchema).default([]),
  recommendedPath: z.array(orgRecommendedStepSchema).default([]),
  /** D'OÙ part le chemin, et ce que vaut ce point de départ — voir
   *  {@link orgPathOriginSchema}. Optionnel, et il doit le rester : un dossier
   *  antérieur à ce chantier n'en porte pas, et se relit à l'identique. Absent
   *  = la forme du chemin n'a pas été calculée, ce qui n'est PAS « entrée
   *  froide » : ne rien savoir de la relation et savoir qu'il n'y en a pas sont
   *  deux états différents, et l'écran ne doit pas les confondre. */
  pathOrigin: orgPathOriginSchema.optional(),
  rejectedItems: z.array(orgRejectedItemSchema).default([]),
  /** Ce que le run a MESURÉ du corpus de contacts — voir {@link orgCoverageSchema}.
   *  Absent = non mesuré, et surtout PAS « 0 découvert ». Additif : un dossier
   *  antérieur au chantier reste valide et se lit exactement comme avant. */
  coverage: orgCoverageSchema.optional(),
  /** Le plancher de gris tel que le GÉNÉRATEUR l'a mesuré — voir
   *  {@link orgColouringSchema}. Absent = rien à mesurer, jamais « 0 % ». */
  colouring: orgColouringSchema.optional(),
})

/** The validated contract — the base shape PLUS the cross-array referential
 *  integrity the spec's invariants demand (p27/p30). Parse with THIS. */
export const orgGraphSchema = orgGraphBaseSchema.superRefine((graph, ctx) => {
  const entityIds = new Set(graph.entities.map(e => e.id))
  const peopleIds = new Set(graph.people.map(p => p.id))
  const nodeIds = new Set([...entityIds, ...peopleIds])
  const rejectedIds = new Set(graph.rejectedItems.map(r => r.sourceId))

  const bad = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })

  graph.entities.forEach((entity, i) => {
    if (entity.parentId != null && entity.parentId === entity.id)
      bad(['entities', i, 'parentId'], 'an entity cannot be its own parent')
    if (entity.parentId != null && !entityIds.has(entity.parentId))
      bad(['entities', i, 'parentId'], `parentId "${entity.parentId}" is not in entities[]`)
    // #2284.5 — GA-26 : un kind qui ne dit rien de plus que le type est un doublon.
    if (entity.entityKind !== undefined && entity.entityKind === ORG_ENTITY_TYPE_TO_ENTITY_KIND[entity.type])
      bad(['entities', i, 'entityKind'], 'entity_kind_repeats_type')
  })

  graph.people.forEach((person, i) => {
    if (person.entityId != null && !entityIds.has(person.entityId))
      bad(['people', i, 'entityId'], `entityId "${person.entityId}" is not in entities[]`)
  })

  graph.hierarchyEdges.forEach((edge, i) => {
    if (!nodeIds.has(edge.fromId)) bad(['hierarchyEdges', i, 'fromId'], `fromId "${edge.fromId}" is not a known node`)
    if (!nodeIds.has(edge.toId)) bad(['hierarchyEdges', i, 'toId'], `toId "${edge.toId}" is not a known node`)
  })

  graph.influenceEdges.forEach((edge, i) => {
    if (!nodeIds.has(edge.fromId)) bad(['influenceEdges', i, 'fromId'], `fromId "${edge.fromId}" is not a known node`)
    if (!nodeIds.has(edge.toId)) bad(['influenceEdges', i, 'toId'], `toId "${edge.toId}" is not a known node`)
  })

  graph.relationalEdges.forEach((edge, i) => {
    if (!nodeIds.has(edge.fromId)) bad(['relationalEdges', i, 'fromId'], `fromId "${edge.fromId}" is not a known node`)
    if (!nodeIds.has(edge.toId)) bad(['relationalEdges', i, 'toId'], `toId "${edge.toId}" is not a known node`)
  })

  graph.buyingCommittee.forEach((member, i) => {
    if (!peopleIds.has(member.personId))
      bad(['buyingCommittee', i, 'personId'], `personId "${member.personId}" is not in people[]`)
  })

  graph.recommendedPath.forEach((stepEntry, i) => {
    if (!peopleIds.has(stepEntry.personId))
      bad(['recommendedPath', i, 'personId'], `personId "${stepEntry.personId}" is not in people[]`)
    if (rejectedIds.has(stepEntry.personId))
      bad(
        ['recommendedPath', i, 'personId'],
        `rejected person "${stepEntry.personId}" cannot appear in recommendedPath`,
      )
  })

  graph.rejectedItems.forEach((item, i) => {
    if (nodeIds.has(item.sourceId))
      bad(['rejectedItems', i, 'sourceId'], `rejected "${item.sourceId}" still appears as an active entity/person`)
  })

  // L'intermédiaire d'un saut est soumis aux MÊMES règles qu'une étape : il doit
  // exister, et un élément rejeté ne revient jamais par la porte du saut. Sans
  // ça, « passe par Untel » pourrait désigner quelqu'un qu'on a justement écarté
  // — l'exemple type du fait qu'on a mémorisé comme faux et qui ressuscite.
  const hop = graph.pathOrigin?.hop
  if (hop) {
    if (!peopleIds.has(hop.personId))
      bad(['pathOrigin', 'hop', 'personId'], `personId "${hop.personId}" is not in people[]`)
    if (rejectedIds.has(hop.personId))
      bad(['pathOrigin', 'hop', 'personId'], `rejected person "${hop.personId}" cannot be hopped through`)
  }
})

export type OrgEntityType = z.infer<typeof orgEntityTypeSchema>
export type OrgEntityStatus = z.infer<typeof orgEntityStatusSchema>
export type OrgHierarchyLevel = z.infer<typeof orgHierarchyLevelSchema>
export type OrgDecisionRole = z.infer<typeof orgDecisionRoleSchema>
export type OrgHierarchyRelation = z.infer<typeof orgHierarchyRelationSchema>
export type OrgInfluenceStance = z.infer<typeof orgInfluenceStanceSchema>
export type OrgGrounding = z.infer<typeof orgGroundingSchema>
export type OrgIdentityStatus = z.infer<typeof orgIdentityStatusSchema>
export type OrgZoneImportance = z.infer<typeof orgZoneImportanceSchema>
export type OrgSourceKind = z.infer<typeof orgSourceKindSchema>
export type OrgClaim = z.infer<typeof orgClaimSchema>
export type OrgSource = z.infer<typeof orgSourceSchema>
export type OrgEntity = z.infer<typeof orgEntitySchema>
export type OrgPerson = z.infer<typeof orgPersonSchema>
export type OrgHierarchyEdge = z.infer<typeof orgHierarchyEdgeSchema>
export type OrgInfluenceEdge = z.infer<typeof orgInfluenceEdgeSchema>
export type OrgRelationalEdgeType = z.infer<typeof orgRelationalEdgeTypeSchema>
export type OrgRelationalEdgeScope = z.infer<typeof orgRelationalEdgeScopeSchema>
export type OrgRelationalEdge = z.infer<typeof orgRelationalEdgeSchema>
export type OrgCommitteeMember = z.infer<typeof orgCommitteeMemberSchema>
export type OrgUncoveredZone = z.infer<typeof orgUncoveredZoneSchema>
export type OrgRecommendedStep = z.infer<typeof orgRecommendedStepSchema>
export type OrgRejectedItem = z.infer<typeof orgRejectedItemSchema>
export type OrgPathForm = z.infer<typeof orgPathFormSchema>
export type OrgPathHop = z.infer<typeof orgPathHopSchema>
export type OrgPathOrigin = z.infer<typeof orgPathOriginSchema>
export type OrgGraph = z.infer<typeof orgGraphSchema>
