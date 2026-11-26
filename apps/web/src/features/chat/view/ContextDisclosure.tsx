import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  FileText,
  Globe,
  Info,
  Layers,
  Repeat2,
  Route,
  Shield,
} from 'lucide-react'
import { Text, Tooltip, TooltipContent, TooltipTrigger, cn } from '@bellum/ui'
import {
  KNOWLEDGE_RECEIPT_LAYERS,
  type ChatResearchMode,
  type KnowledgeReceipt,
  type KnowledgeReceiptLayer,
  type PendingChatAction,
  type PlanBrief,
  type ReplyFamilyContext,
  type CoverageReportTrace,
  type SearchUniverseTrace,
  type ThreadScopeTrace,
  type SourcePlanTrace,
  type TurnObservability,
  type WorkspacePermission,
} from '@bellum/contracts'
import type { CopilotCardWire } from '../api/copilotCardsApi'
import { stripMarkdownEmphasis } from '@/lib/strip-markdown-emphasis'
import { CHAT_SURFACE } from './chat-surface'
import type { SurfaceDisclosureCopy } from '@/features/context-contract/surface-disclosure'
import { markSettingsOpenedFromLaura } from '@/features/laura/laura-settings-origin'

/**
 * Wire shape of the transparency object the IA returns alongside each reply
 * (`data.context`). Snake_case mirrors the JSON exactly (same convention as the
 * DB-shaped `SidebarAccount`). Built server-side from REAL state — never a text
 * the model could hallucinate. See apps/ia/app/prompts/context_transparency.py.
 *
 * `as_of` et `not_consulted_actions` sont OPTIONNELS : une réponse produite avant
 * leur arrivée (historique de conversation déjà en base) s'affiche toujours, sans
 * fraîcheur ni bouton — jamais un rendu cassé.
 */
export type ChatResponseContext = {
  active: {
    profile: {
      present: boolean
      name: string | null
      /**
       * #2889 — le périmètre du profil ESN (secteurs prioritaires, taille
       * cible), déjà mis en forme par l'appelant (`surfaceDisclosure`), même
       * convention que `name`. Absent des surfaces de conversation (le chat
       * ne le construit pas aujourd'hui) — jamais deviné ici.
       */
      perimeter?: string | null
    }
    account: { present: boolean; name: string | null; as_of?: string | null }
    contacts_count: number
    /** Signaux datés du dossier réellement fournis au modèle. Optionnel : une IA
     *  plus ancienne ne l'envoie pas — on n'affiche alors rien plutôt qu'un 0. */
    signals_count?: number
    plan: { present: boolean }
    /**
     * #1941.4 — le portefeuille servi au modèle.
     *
     * `names` / `total` sont posés par le SERVEUR (`withReadablePortfolio`) :
     * `count` et `names.length` disent ce qui est réellement parti, `total` ce
     * que l'espace porte. Optionnels — une réponse d'avant ce champ n'en porte
     * aucun, et l'écran affiche alors le nombre seul, comme avant.
     */
    portfolio: { present: boolean; count: number; names?: string[]; total?: number }
    memory: { pinned_facts: number; has_summary: boolean }
    /** W-G (13/10) — les faits du compte (affaires, signaux…) réellement fournis au modèle.
     *  Absent = aucun fait : la puce n'existe pas, jamais « 0 ». */
    account_facts?: { present: boolean; count: number }
    /** #4071.3 (recette R6 14/10) — ce que l'espace a gardé (recherches enregistrées, listes
     *  de cibles, résumés de fils) réellement fourni au modèle. Même discipline que
     *  `account_facts` : absent = rien, aucune puce, jamais « 0 ». */
    workspace_recall?: { present: boolean; count: number }
  }
  sources: Array<{
    kind: string
    label: string
    as_of?: string | null
    excerpt?: string | null
    /** #2264.17 — le PÉRIMÈTRE du fait : ce compte, un secteur… Absent = non porté par cette source. */
    scope?: string | null
    /** #2264.18 — palier NOMMÉ, jamais un pourcentage (aucune probabilité affichée). */
    confidence?: 'high' | 'medium' | 'low' | null
    /** #2264.20 — RELATION AVEC L'OBJET : l'entité précise que ce fait concerne. */
    relatesTo?: string | null
    /** #2264.22 — VÉRIFICATION SUIVANTE nommée, distincte d'une action générique. */
    nextVerification?: string | null
    /**
     * #3775.2b — cette source vient d'une connexion PERSONNELLE de l'auteur
     * (BEL-INT-604), marquée serveur (`ia-proxy.controller.ts`). Lue par
     * `hasRestrictedSource` (`restricted-source.ts`) pour avertir avant un
     * partage — ce panneau lui-même ne l'affiche pas davantage qu'avant.
     */
    restricted?: boolean
  }>
  not_consulted: string[]
  /**
   * #3562.1 — la trace du tour (`context.reasoning_trace`, IA) : seul
   * `tools_called` est lu ici, pour que le pied de réponse ne cite pas de
   * sources sous un tour sans outil. Absente sur les réponses d'avant ce champ.
   */
  reasoning_trace?: { tools_called?: string[] }
  not_consulted_actions?: Array<{ label: string; action: string }>
  /**
   * #5086 — « Précision : … » et « Contrainte retenue : … » sortis du CORPS de la réponse par l'IA
   * (`context.reply_notes`) : le panneau Sources les lit tels quels, jamais re-parsés de la prose.
   * Absent = aucune note.
   */
  reply_notes?: string[]
  /**
   * #4150 — calculé UNE FOIS par `context_transparency.py` (`build_context_transparency`) :
   * `true` seulement si une ligne de `not_consulted` porte une action réelle
   * (connecter un CRM/une messagerie, analyser le compte) ou une panne (CRM
   * connecté mais indisponible). Jamais déduit de la longueur de
   * `not_consulted`, qui inclut des absences structurelles (réseaux
   * professionnels, signaux archivés) et un CRM connecté simplement non
   * croisé — ni l'un ni l'autre n'est un manque à qualifier. Absent (réponse
   * d'avant ce champ, ou fil relu depuis la colonne persistée) ⇒ aucun badge,
   * jamais deviné.
   */
  qualification_needed?: boolean
  /**
   * Actions PRÉPARÉES par le copilote et en attente de validation (outils
   * d'écriture). Absent tant que l'orchestration outils n'est pas active, ou
   * quand la réponse n'en propose aucune — le rendu doit tenir sans.
   */
  pending_actions?: PendingChatAction[]
  /**
   * #1998 — les CARTES du tour, gouvernées et persistées côté serveur
   * (`ia-proxy.controller.ts`, `withTurnCards`). Chacune porte son identité, son
   * état et les gestes permis dans cet état.
   *
   * ⚠️ Elles arrivaient déjà : `laura-turn.ts` recopie `data.context` en entier,
   * sans liste blanche. Il ne manquait que CE CHAMP — sans lui le champ était
   * invisible en TypeScript, donc illisible, donc jamais rendu : Laura décrivait
   * le contenu exact d'une carte en PROSE, sans un bouton (défaut n°1 du dépôt,
   * « du code juste que personne n'appelle »).
   *
   * `pending_actions` reste servi À CÔTÉ et INTACT — un onglet ouvert avant le
   * déploiement ne lit que lui. Quand les deux sont là, l'écran rend les cartes
   * et elles SEULES : les afficher toutes les deux montrerait deux fois le même
   * geste (loi 4 du tome 7).
   */
  cards?: CopilotCardWire[]
  /**
   * La précision demandée par le copilote, avec ses options CLIQUABLES.
   *
   * Portée à part des actions : ce n'est ni quelque chose de fait, ni quelque
   * chose à valider — c'est une question. Le §9.4 du PDF 6 en autorise UNE par
   * conversation, et exige des options : « tu veux dire quoi ? » fait
   * recommencer l'utilisateur.
   */
  clarification?: {
    question?: string
    options?: ClarificationOption[]
    /**
     * #1927.3 — les pistes que Laura a ÉCARTÉES avant de poser la question. La
     * raison peut manquer (`null`) : « écarté » est déjà une information, une
     * raison DEVINÉE n'en serait pas une.
     */
    ruled_out?: { option: string; reason?: string | null }[]
    /** #1927.4 — les hypothèses sur lesquelles elle avance, corrigeables d'un mot. */
    assumptions?: string[]
  }
  /**
   * #2679 — une précision posée en TEXTE se clique aussi.
   *
   * Le bloc `_BLOCK_ASK_FIRST` (apps/ia) autorise Laura à poser jusqu'à trois
   * précisions DANS le texte de sa réponse, et c'est la forme la plus fréquente
   * — la seule qui ne coûte ni un tour de modèle ni la carte de clarification du
   * fil. Elle arrivait en markdown, sans un bouton : il fallait retaper la
   * réponse qu'on venait de lire.
   *
   * ⚠️ Champ FRÈRE de `clarification`, jamais rangé dedans : la présence de
   * `clarification` DÉCIDE trois choses ailleurs (la borne d'une clarification
   * par fil, l'exonération du plafond du copilote, l'estampille `quota_exempt_at`).
   * Une précision en texte n'en déclenche aucune — elle propose des réponses,
   * c'est tout.
   *
   * Une entrée par précision posée ; `question` sert à NOMMER le groupe de
   * boutons (elle est déjà écrite dans le texte de la réponse, on ne la répète
   * pas à l'écran). Absent, ou sans `options` : aucun bouton.
   */
  reply_options?: Array<{ question?: string; options?: ClarificationOption[] }>
  /**
   * #1950.4 / .7 / .12 / .13 — le résumé du plan NOMMÉ par Laura (outil
   * silencieux `describe_plan`) : objectif, résultats attendus, données
   * manquantes, ce qui ne sera pas fait. Absent : aucune ligne.
   */
  plan_brief?: PlanBrief
  /** #3758 — la famille de réponse du tour et ce qu'il a rendu ; `text_fallback` propose de relancer en carte. */
  reply_family?: ReplyFamilyContext
  /**
   * #2276 — le job composite de Laura : la VUE servie par l'API
   * (`LauraJobService.toView`), jamais la fiche brute du modèle. `unknown` ici
   * parce que `LauraJobCard` la valide contre le contrat avant tout rendu.
   */
  laura_job?: unknown
  /**
   * #1941.5 / #1941.8 — les droits EFFECTIFS du lecteur, calculés côté serveur
   * (`ia-proxy.controller.ts`, `withReaderPermissions`) : le rôle résolu PLUS
   * les accords en propre (additif — la même paire que `WorkspacePermissionGuard`).
   * Ce composant AFFICHE ce tableau, il ne le recalcule jamais — un « viewer »
   * déduit côté navigateur ignorerait un accord accordé en propre.
   *
   * Absent (réponse d'avant ce champ, ou sans `context` du tout) : la section
   * ne se rend pas — rien n'est deviné.
   */
  permissions?: WorkspacePermission[]
  /**
   * #2840 (#2441.13) — LE REPÈRE MACHINE D'UN TOUR QUI S'EST ARRÊTÉ AVANT LA
   * FIN (délai dépassé ou panne), posé par `apps/ia/app/routers/chat.py`
   * (`_partial_response`) sur `context.partial`. `reason` vaut `turn_timeout`
   * ou `turn_error` — un rendu structuré le lit ici, il n'a rien à reparser du
   * texte de la réponse (qui porte déjà la phrase, en clair — voir
   * `_TIMEOUT_PARTIAL_REPLY` / `_FAILURE_PARTIAL_REPLY`).
   *
   * Le mécanisme actuel est TERMINAL : rien ne reprend en fond après ce
   * repère, il ne fait qu'annoncer que CE tour s'est arrêté tôt. Absent = tour
   * terminé normalement, rien ne s'affiche.
   */
  partial?: { reason: string; as_of?: string | null }
  /**
   * #2448.4 (épopée #2882) — « AUTO n'est pas un mode opaque » : LA phrase qui
   * dit pourquoi ce tour a pris le palier qu'il a pris (posée par
   * `apps/ia/app/routers/chat.py`, `explain_tier_decision`). Visible SANS
   * déplier le panneau — la même règle que `contextSummaryParts` : une
   * transparence qu'il faut cliquer pour voir n'est en pratique jamais lue.
   * Absent (réponse d'avant ce champ, ou raison inconnue de l'écran) : aucune
   * ligne, rien n'est deviné.
   *
   * #2448.10 (reste partiel, épopée #2882) — `requested_mode` (le geste de la
   * personne, `null` quand aucune surface n'en a posé un) et `tier` (le
   * palier RÉELLEMENT choisi pour ce tour) : le contrat de traçabilité que
   * l'issue demande, pas encore rendu à l'écran (aucun appelant ne les lit
   * pour l'instant) — présents pour qu'un futur écran de trace n'ait pas à
   * deviner leur forme.
   */
  mode_explanation?: {
    reason: string
    text: string
    requested_mode?: ChatResearchMode | null
    tier?: 'fast' | 'deep'
  }
  /**
   * #3193.2/.3/.4 (épopée #3217) — LE REÇU DE CONNAISSANCE STRUCTURÉ : les
   * onze couches de l'issue #3193 comme UN objet unique, chacune nommée même
   * sans rien à dire, chacune portant son état réel. Absent (réponse d'avant
   * ce champ) : la section ne se rend pas, comme `permissions` ci-dessus —
   * rien n'est deviné pour une réponse plus ancienne.
   */
  knowledge_receipt?: KnowledgeReceipt
  /**
   * #3176.10 (épopée #3216) — LA TRACE DU PLAN DE SOURCES : ce qu'un tour à
   * mode détecté (INTERNAL_ONLY/CURRENT_PUBLIC/COMBINED/WORKSPACE_FIRST)
   * demandait réellement, et ce qu'il a obtenu. Absent (le cas normal, aucun
   * marqueur détecté pour ce tour) : la section ne se rend pas, comme
   * `knowledge_receipt` ci-dessus — rien n'est deviné.
   *
   * Recette prod 29/09 (#3216) : ce champ existait déjà côté IA
   * (`data["context"]["source_plan"]`, `apps/ia/app/services/source_plan.py`)
   * mais n'était lu par AUCUN appelant côté web — « du code juste que
   * personne n'appelle ».
   */
  source_plan?: SourcePlanTrace
  /**
   * #3183.11 (recette prod 29-30/09, LAU-FINAL-189) — LA PREUVE DE
   * L'APPROFONDISSEMENT PROGRESSIF : combien de passages d'outils étaient
   * prévus pour ce tour contre combien ont réellement eu lieu. Calculée par
   * `apps/ia/app/services/chat_turn_plan.py` (#3196.6) pour CHAQUE tour, posée
   * sur `context["turn_observability"]` (`apps/ia/app/routers/chat.py`) mais
   * lue par AUCUN appelant avant ce lot — « du code juste que personne
   * n'appelle ». Absent (tour d'avant ce champ) : la section ne se rend pas,
   * comme `source_plan` ci-dessus.
   */
  turn_observability?: TurnObservability
  /**
   * #214.1 (réel, épopée #3229) — LE SEARCH UNIVERSE D'UNE DEMANDE LARGE :
   * population, géographies et rôles visés, exclusions déclarées. Absent
   * (aucun marqueur de population large détecté pour ce tour, le cas
   * normal) : la section ne se rend pas, comme `source_plan` ci-dessus.
   *
   * Ce champ existait déjà côté IA (`data["context"]["search_universe"]`,
   * `apps/ia/app/routers/chat.py`) mais n'était lu par AUCUN appelant côté
   * web — « du code juste que personne n'appelle ».
   */
  search_universe?: SearchUniverseTrace
  /**
   * #3229 (reste) — le rapport de couverture qu'un outil a construit sur ses
   * RÉSULTATS réels (liste de contacts). Un palier `null` n'est pas mesuré :
   * il ne se rend pas. Partage la section « Périmètre de recherche ».
   */
  coverage_report?: CoverageReportTrace
  /**
   * #3227 — le groupe que Laura garde comme périmètre de ce fil (appel
   * `note_thread_context`), jusque-là invisible depuis l'écran. Partage la
   * section « Périmètre de recherche » — jamais un bloc de plus.
   */
  thread_scope?: ThreadScopeTrace
}

/**
 * Une option de clarification : soit un texte plat (l'historique — une
 * réponse en base d'avant ce lot n'en a jamais eu d'autre), soit un objet de
 * désambiguïsation (#1951.10 / #1951.12-.16) pour nommer une personne ou un
 * compte homonyme avec entreprise, rôle, localisation, statut et avatar.
 *
 * `label` est TOUJOURS ce que le clic envoie comme message — les autres
 * champs ne sont que de l'affichage. Un champ absent n'est jamais deviné :
 * `chat_tools.py` (`ask_clarification`) ne le recopie que s'il est fourni.
 */
export type ClarificationOption =
  | string
  | {
      label: string
      company?: string
      role?: string
      location?: string
      status?: string
      avatar_url?: string
    }

/** Un élément du panneau : son libellé, sa nature et sa fraîcheur quand on les connaît. */
type DatedItem = { label: string; kind?: string | null; freshness?: string | null }

/**
 * Nature d'une source citée. Sans ça, la règle métier appliquée par Bellum, le
 * document déposé par le commercial et le dossier lu par un outil s'affichent en
 * pastilles rigoureusement identiques : « le copilote cite la méthode » devient
 * invisible à l'écran. Le libellé vient d'ici (donc traduit) et non du serveur —
 * une nature inconnue (serveur en avance sur le web) n'étiquette RIEN plutôt que
 * d'inventer un mot.
 *
 * `kind` est produit par apps/ia/app/prompts/context_transparency.py.
 */
const SOURCE_KIND_LABELS = {
  method_rule: 'disclosure.kindMethod',
  knowledge_doc: 'disclosure.kindDocument',
  crm: 'disclosure.kindCrm',
  account_dossier: 'disclosure.kindAccount',
  // #1599 — la source n'est PAS branchée aujourd'hui (aucun outil ne rend ce
  // `kind`) : le libellé est prêt pour le jour où elle le sera, sans qu'il
  // faille alors toucher à ce fichier.
  market_observation: 'disclosure.kindMarketObservation',
  // #2547.1 — retour CLIENT (Ludovic Marx) : « Laura m'a remonté des éléments
  // sans citer de signaux ». Un compte trouvé par le tour d'horizon EXÉCUTÉ en
  // conversation (`run_account_search`, `chat_tools.py::cited_sources`), avec
  // sa date réelle — distinct de `market_observation`, dont la date reste
  // volontairement masquée (ligne 407 plus bas) : ceci EST un fait daté.
  market_signal: 'disclosure.kindMarketSignal',
} as const

function sourceKindLabel(kind: string | null | undefined, t: TFunction<'chat'>): string | null {
  const key = kind && kind in SOURCE_KIND_LABELS ? SOURCE_KIND_LABELS[kind as keyof typeof SOURCE_KIND_LABELS] : null
  return key ? t(key) : null
}

/**
 * #3193.2 — le libellé ÉCRAN de chacune des onze couches. `dataforge` s'y lit
 * « référentiel sectoriel Bellum » : le nom interne (l'issue nomme DataForge)
 * n'atteint jamais le prompt ni l'écran, même règle que le CRM générique.
 */
const KNOWLEDGE_RECEIPT_LAYER_LABELS: Record<KnowledgeReceiptLayer, string> = {
  workspace: 'disclosure.receipt.layer.workspace',
  crm: 'disclosure.receipt.layer.crm',
  messaging: 'disclosure.receipt.layer.messaging',
  agenda: 'disclosure.receipt.layer.agenda',
  documents: 'disclosure.receipt.layer.documents',
  account_dossier: 'disclosure.receipt.layer.accountDossier',
  dataforge: 'disclosure.receipt.layer.dataforge',
  market_memory: 'disclosure.receipt.layer.marketMemory',
  current_public_sources: 'disclosure.receipt.layer.currentPublicSources',
  bellum_method: 'disclosure.receipt.layer.bellumMethod',
  inference: 'disclosure.receipt.layer.inference',
}

/**
 * #3193.3 — les champs RÉELS que porte une couche (`result_count`, `coverage`,
 * `freshness`, `caveat`), joints en une seule phrase de détail. Jamais un
 * champ deviné : seuls ceux que le serveur a réellement posés apparaissent
 * (« on n'affiche pas ce qu'on n'a pas »).
 */
function knowledgeReceiptDetail(
  layer: KnowledgeReceipt[KnowledgeReceiptLayer],
  t: TFunction<'chat'>,
  language: string,
): string | null {
  const parts: string[] = []
  if (typeof layer.result_count === 'number') {
    parts.push(t('disclosure.receipt.resultCount', { count: layer.result_count }))
  }
  if (layer.coverage) parts.push(layer.coverage)
  const freshness = freshnessLabel(layer.freshness, t, language)
  if (freshness) parts.push(freshness)
  if (layer.caveat) parts.push(layer.caveat)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * #3217.1 (recette prod 29/09) — Louis : le reçu affichait onze couches mais
 * SEULEMENT deux statuts (Utilisé / Non utilisé), jamais les QUATRE états
 * réels que porte chaque couche. Corrigé : un panier par état RÉEL
 * (`consulted`/`not_requested`/`unavailable`/`forbidden_by_mode`), chacun
 * avec sa propre section à l'écran — une panne CRM ne se confond plus avec
 * un simple « non demandé » (#1915.11 étendu), et une couche utilisée porte
 * désormais son détail réel (`result_count`/`coverage`/`freshness`/`caveat`),
 * pas seulement sa fraîcheur.
 */
function knowledgeReceiptGroups(
  receipt: KnowledgeReceipt,
  t: TFunction<'chat'>,
  language: string,
): {
  consulted: DatedItem[]
  notRequested: DatedItem[]
  unavailable: DatedItem[]
  forbidden: DatedItem[]
  excluded: DatedItem[]
} {
  const consulted: DatedItem[] = []
  const notRequested: DatedItem[] = []
  const unavailable: DatedItem[] = []
  const forbidden: DatedItem[] = []
  // #3708 (recette prod 09/10) — une source EXCLUE pour ce fil sortait en
  // « Non demandé », EN MÊME TEMPS que la liste « NON CONSULTÉ » la disait
  // « exclue par toi » — la même source sous deux formes contradictoires.
  // Son propre groupe, jamais mélangé à « non demandé » ni à « interdit par
  // le mode » (deux raisons différentes).
  const excluded: DatedItem[] = []
  for (const key of KNOWLEDGE_RECEIPT_LAYERS) {
    const layer = receipt[key]
    const label = t(KNOWLEDGE_RECEIPT_LAYER_LABELS[key])
    const detail = knowledgeReceiptDetail(layer, t, language)
    if (layer.status === 'consulted') {
      consulted.push({ label, freshness: detail })
    } else if (layer.status === 'not_requested') {
      notRequested.push({ label })
    } else if (layer.status === 'excluded') {
      excluded.push({ label })
    } else {
      const stateReason =
        layer.status === 'unavailable'
          ? t('disclosure.receipt.stateUnavailable')
          : t('disclosure.receipt.stateForbidden')
      const reasonLine = detail ? `${stateReason} · ${detail}` : stateReason
      const item = { label: `${label} — ${reasonLine}` }
      if (layer.status === 'unavailable') unavailable.push(item)
      else forbidden.push(item)
    }
  }
  return { consulted, notRequested, unavailable, forbidden, excluded }
}

/**
 * #3176.10 (épopée #3216) — le libellé ÉCRAN de la PORTÉE demandée par le
 * plan (`source_plan_requested`) : le vocabulaire fermé de
 * `apps/ia/app/services/source_plan.py` (`SEARCH_MODES`). Une valeur inconnue
 * (serveur en avance sur le web) n'étiquette RIEN plutôt que d'inventer un mot.
 */
const SOURCE_PLAN_SCOPE_LABELS: Record<string, string> = {
  internal_only: 'disclosure.sourcePlan.scope.internalOnly',
  current_public: 'disclosure.sourcePlan.scope.currentPublic',
  combined: 'disclosure.sourcePlan.scope.combined',
  workspace_first: 'disclosure.sourcePlan.scope.workspaceFirst',
}

/**
 * #3176.10 (épopée #3216) — le libellé ÉCRAN d'une couche du plan de sources
 * (`CANONICAL_SOURCE_LAYERS`, `apps/ia/app/services/source_plan.py`). Un
 * vocabulaire DISTINCT de `KNOWLEDGE_RECEIPT_LAYER_LABELS` ci-dessus — les dix
 * couches d'un PLAN PAR TOUR ne sont pas les onze couches d'un REÇU DE
 * RÉPONSE, même quand certaines se recouvrent (GA-26 : chacune vit dans son
 * propre panneau, aucune n'est recalculée depuis l'autre). `dataforge` s'y lit
 * « référentiel sectoriel Bellum », même règle que le reçu de connaissance.
 */
const SOURCE_PLAN_LAYER_LABELS: Record<string, string> = {
  explicit_request: 'disclosure.sourcePlan.layer.explicitRequest',
  thread_memory: 'disclosure.sourcePlan.layer.threadMemory',
  profile: 'disclosure.sourcePlan.layer.profile',
  workspace: 'disclosure.sourcePlan.layer.workspace',
  connected_systems: 'disclosure.sourcePlan.layer.connectedSystems',
  account_dossier: 'disclosure.sourcePlan.layer.accountDossier',
  dataforge: 'disclosure.sourcePlan.layer.dataforge',
  market_memory: 'disclosure.sourcePlan.layer.marketMemory',
  public_sources: 'disclosure.sourcePlan.layer.publicSources',
  methodological_inference: 'disclosure.sourcePlan.layer.methodologicalInference',
}

/** Une couche du plan, dans son libellé écran — inconnue (serveur en avance) : nom brut plutôt qu'un rendu vide. */
function sourcePlanLayerLabel(layer: string, t: TFunction<'chat'>): string {
  const key = SOURCE_PLAN_LAYER_LABELS[layer]
  return key ? t(key) : layer
}

/**
 * #3176.10 (épopée #3216) — LE PLAN DE SOURCES LISIBLE (recette prod 29/09) :
 * ce qu'un tour à mode détecté a REQUIS (`requested_scope`, via
 * `layers_called`/`layers_unavailable`), distinct du reçu de connaissance
 * ci-dessus qui dit ce que CHAQUE couche a fait pour la réponse. Le plan dit
 * ce que la STRATÉGIE de recherche exigeait avant même d'appeler un outil.
 */
function SourcePlanSection({ plan, t }: { plan: SourcePlanTrace; t: TFunction<'chat'> }) {
  const scopeKey = plan.source_plan_effective ?? plan.source_plan_requested
  const scopeLabel = scopeKey && scopeKey in SOURCE_PLAN_SCOPE_LABELS ? t(SOURCE_PLAN_SCOPE_LABELS[scopeKey]) : null
  const called: DatedItem[] = plan.layers_called.map(layer => ({ label: sourcePlanLayerLabel(layer, t) }))
  const unavailable: DatedItem[] = plan.layers_unavailable.map(layer => ({ label: sourcePlanLayerLabel(layer, t) }))
  return (
    <DisclosureSection icon={Route} title={t('disclosure.sourcePlan.title')} tone="neutral">
      {scopeLabel && (
        <Text size="xs" className="mb-1.5 text-[var(--bellum-text-secondary)]">
          {t('disclosure.sourcePlan.scopeLine', { scope: scopeLabel })}
        </Text>
      )}
      <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
        {t('disclosure.sourcePlan.calledTitle')}
      </Text>
      {called.length > 0 ? <ChipRow items={called} /> : <MutedLine text={t('disclosure.sourcePlan.calledNone')} />}
      {unavailable.length > 0 && (
        <div className="mt-1.5">
          <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
            {t('disclosure.sourcePlan.unavailableTitle')}
          </Text>
          <ChipRow items={unavailable} />
        </div>
      )}
      {/* #3176.10 — la STRATÉGIE explicitement respectée : une recherche
          publique interdite par le plan, et RÉELLEMENT évitée ce tour. */}
      {plan.public_search_avoided && (
        <Text size="xs" className="mt-1.5 italic text-[var(--bellum-text-muted)]">
          {t('disclosure.sourcePlan.publicSearchAvoided')}
        </Text>
      )}
    </DisclosureSection>
  )
}

/**
 * #3183.11 (recette prod 29-30/09, LAU-FINAL-189) — LA PREUVE DE
 * L'APPROFONDISSEMENT PROGRESSIF, rendue seulement quand elle en est une :
 * un tour qui n'a pris qu'un seul passage (le cas normal, la quasi-totalité
 * des réponses) n'a rien à prouver ici — la section ne se rend qu'à partir
 * d'un SECOND passage RÉELLEMENT effectué (`completed_steps > 1`), jamais sur
 * la seule intention d'un plan approfondi qui n'aurait pas eu besoin d'aller
 * plus loin.
 */
function TurnObservabilitySection({ observability, t }: { observability: TurnObservability; t: TFunction<'chat'> }) {
  return (
    <DisclosureSection icon={Repeat2} title={t('disclosure.turnObservability.title')} tone="neutral">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('disclosure.turnObservability.passes', {
          count: observability.completed_steps,
          total: observability.planned_steps,
        })}
      </Text>
      {/* #3218 — recette 07/10 : cette section et le texte de Laura disant
          « dossier existant réutilisé » se lisaient comme contradictoires —
          ce sont deux mécanismes différents (recherche de CE tour, jamais
          une relance du pipeline d'analyse du compte). Nommé pour que texte
          et source restent cohérents. */}
      <Text size="xs" className="mt-1.5 italic text-[var(--bellum-text-muted)]">
        {t('disclosure.turnObservability.scopeNote')}
      </Text>
      {/* #3218 — les passes du moteur, NOMMÉES, et le critère d'arrêt. */}
      {observability.deepening?.map(event =>
        event.kind === 'pass' ? (
          <Text key={`pass-${event.pass}`} size="xs" className="mt-1.5 text-[var(--bellum-text-secondary)]">
            {t('disclosure.turnObservability.pass', {
              level: event.pass,
              name: t(`disclosure.turnObservability.passName.${event.pass}`, { defaultValue: '' }),
            })}
          </Text>
        ) : (
          <Text key="stop" size="xs" className="mt-1.5 text-[var(--bellum-text-secondary)]">
            {t(`disclosure.turnObservability.stop.${event.reason}`, {
              defaultValue: t('disclosure.turnObservability.stop.other'),
            })}
          </Text>
        ),
      )}
      {observability.budget_exhausted && (
        <Text size="xs" className="mt-1.5 italic text-[var(--bellum-text-muted)]">
          {t('disclosure.turnObservability.budgetExhausted')}
        </Text>
      )}
      {observability.degraded_answer && (
        <Text size="xs" className="mt-1.5 italic text-[var(--bellum-text-muted)]">
          {t('disclosure.turnObservability.degradedAnswer')}
        </Text>
      )}
    </DisclosureSection>
  )
}

/**
 * #214.1 (réel, épopée #3229) — LE SEARCH UNIVERSE LISIBLE : ce qu'une
 * demande à population large (« toutes les filiales », « tous les
 * décideurs »…) vise réellement, AVANT toute réponse — jamais un chiffre
 * fabriqué. Seuls les champs REMPLIS se rendent (doctrine : une absence ne
 * fait aucune ligne) — `build_search_universe` ne détecte aujourd'hui que
 * géographies, rôles et exclusions ; les autres champs du contrat IA
 * (périodes, sources, limites…) restent vides tant qu'aucun appelant ne les
 * calcule, et ne rendent alors rien plutôt qu'une ligne vide.
 */
function SearchUniverseSection({
  universe,
  coverage,
  threadScope,
  t,
}: {
  universe?: SearchUniverseTrace
  coverage?: CoverageReportTrace
  threadScope?: ThreadScopeTrace
  t: TFunction<'chat'>
}) {
  const geographies: DatedItem[] = (universe?.geographies ?? []).map(label => ({ label }))
  const roles: DatedItem[] = (universe?.roles ?? []).map(label => ({ label }))
  const exclusions: DatedItem[] = (universe?.exclusions ?? []).map(label => ({ label }))
  // #3229 — un palier par ligne, jamais fusionné ; un palier non mesuré (`null`)
  // ne fait AUCUNE ligne plutôt qu'un « 0 » qui se lirait comme une mesure.
  const tiers = coverage
    ? (['detected', 'resolved', 'relevant', 'verified', 'enriched'] as const).flatMap(key => {
        const count = coverage[key]
        return count === null ? [] : [{ key, count }]
      })
    : []
  return (
    <DisclosureSection icon={Globe} title={t('disclosure.searchUniverse.title')} tone="neutral">
      {universe && (
        <Text size="xs" className="mb-1.5 text-[var(--bellum-text-secondary)]">
          {t('disclosure.searchUniverse.populationLine', { population: universe.population })}
        </Text>
      )}
      {threadScope && (
        <div className="mb-1.5">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('disclosure.searchUniverse.groupRoot', { root: threadScope.root })}
          </Text>
          {threadScope.included.length > 0 && <ChipRow items={threadScope.included.map(label => ({ label }))} />}
          {threadScope.excluded.length > 0 && (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t('disclosure.searchUniverse.groupExcluded', { names: threadScope.excluded.join(', ') })}
            </Text>
          )}
        </div>
      )}
      {geographies.length > 0 && (
        <div className="mb-1.5">
          <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
            {t('disclosure.searchUniverse.geographiesTitle')}
          </Text>
          <ChipRow items={geographies} />
        </div>
      )}
      {roles.length > 0 && (
        <div className="mb-1.5">
          <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
            {t('disclosure.searchUniverse.rolesTitle')}
          </Text>
          <ChipRow items={roles} />
        </div>
      )}
      {exclusions.length > 0 && (
        <div className="mb-1.5">
          <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
            {t('disclosure.searchUniverse.exclusionsTitle')}
          </Text>
          <ChipRow items={exclusions} />
        </div>
      )}
      {tiers.length > 0 && (
        <div>
          <ul className="flex flex-col gap-0.5">
            {tiers.map(tier => (
              <li key={tier.key}>
                <Text size="xs">{t(`disclosure.searchUniverse.coverage.${tier.key}`, { count: tier.count })}</Text>
              </li>
            ))}
          </ul>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('disclosure.searchUniverse.coverage.basis')}
          </Text>
        </div>
      )}
    </DisclosureSection>
  )
}

/**
 * Écran qui RÉSOUT une source non consultée. Le mapping vit ici, côté web, parce
 * que c'est lui qui connaît ses routes : l'IA ne nomme qu'une intention. Une
 * action inconnue (serveur en avance sur le web) ne produit aucun lien plutôt
 * qu'un lien mort.
 */
const NOT_CONSULTED_DESTINATIONS = {
  connect_crm: { to: '/integrations', cta: 'disclosure.actionConnectCrm' },
  // #2145.23 (via #2925) — même écran que `connect_crm` ci-dessus : la messagerie
  // absente proposait déjà sa ligne côté IA (`_ACTION_CONNECT_EMAIL`), sans lien
  // pour la résoudre — seul le mapping manquait ici.
  connect_email: { to: '/integrations', cta: 'disclosure.actionConnectEmail' },
  add_knowledge: { to: '/settings/knowledge', cta: 'disclosure.actionAddKnowledge' },
  analyse_account: { to: '/search', cta: 'disclosure.actionAnalyseAccount' },
} as const

type NotConsultedAction = keyof typeof NOT_CONSULTED_DESTINATIONS

function destinationFor(action: string): (typeof NOT_CONSULTED_DESTINATIONS)[NotConsultedAction] | null {
  return action in NOT_CONSULTED_DESTINATIONS ? NOT_CONSULTED_DESTINATIONS[action as NotConsultedAction] : null
}

/**
 * Fraîcheur lisible d'une date RÉELLE (restitution V2 §13 : un document de 2024 et
 * un signal d'hier ne doivent plus se ressembler). Sans date, ou avec une date
 * illisible, on ne rend RIEN — pas d'à-peu-près. Le comptage se fait en jours de
 * calendrier : « hier » veut dire hier, pas « il y a plus de 24 h ».
 */
function freshnessLabel(asOf: string | null | undefined, t: TFunction<'chat'>, language: string): string | null {
  if (!asOf) return null
  const date = new Date(asOf)
  if (Number.isNaN(date.getTime())) return null
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days <= 0) return t('disclosure.freshnessToday')
  if (days === 1) return t('disclosure.freshnessYesterday')
  if (days < 30) return t('disclosure.freshnessDays', { count: days })
  // Au-delà d'un mois, le nombre de jours ne parle plus : on donne la date.
  return date.toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Human labels for what WAS fed to the model — only the truthy parts are shown. */
/**
 * #1941.4 — COMBIEN DE NOMS ON ÉCRIT AVANT DE COMPTER LE RESTE.
 *
 * Trois : au-delà, la puce devient une phrase et le panneau redevient illisible
 * — le même plancher que le brief du matin (`morning-brief.ts`). Le reste ne
 * disparaît pas, il se COMPTE.
 */
const PORTFOLIO_NAMED_MAX = 3

/**
 * #1941.4 — le libellé du portefeuille : les comptes NOMMÉS, et ce qui reste.
 *
 * `total` n'apparaît que s'il DÉPASSE ce qui a été servi : « 20 comptes sur 57 »
 * dit une liste partielle, « 20 comptes sur 20 » ne dit rien de plus que « 20 ».
 */
function portfolioLabel(t: TFunction<'chat'>, names: string[], count: number, total: number | undefined): string {
  const named = names.slice(0, PORTFOLIO_NAMED_MAX).join(', ')
  const rest = names.length - PORTFOLIO_NAMED_MAX
  const list = rest > 0 ? t('disclosure.portfolioNamedMore', { names: named, count: rest }) : named
  return typeof total === 'number' && total > count
    ? t('disclosure.portfolioPartial', { list, count, total })
    : t('disclosure.portfolioNamed', { list, count })
}

function activeLabels(active: ChatResponseContext['active'], t: TFunction<'chat'>, language: string): DatedItem[] {
  const labels: DatedItem[] = []
  if (active.profile.present) {
    labels.push({
      label: active.profile.name
        ? t('disclosure.profileNamed', { name: active.profile.name })
        : t('disclosure.profile'),
    })
    // #2889 — le périmètre est une PUCE séparée, jamais fondue dans le nom :
    // les deux faits (qui, sur quel périmètre) restent chacun leur ligne.
    if (active.profile.perimeter) labels.push({ label: active.profile.perimeter })
  }
  if (active.account.present) {
    labels.push({
      label: active.account.name
        ? t('disclosure.accountNamed', { name: active.account.name })
        : t('disclosure.account'),
      // Les signaux d'un compte datent de sa dernière analyse : c'est cette date-là.
      freshness: freshnessLabel(active.account.as_of, t, language),
    })
  }
  if (active.contacts_count > 0) labels.push({ label: t('disclosure.contacts', { count: active.contacts_count }) })
  if ((active.signals_count ?? 0) > 0) {
    labels.push({ label: t('disclosure.signals', { count: active.signals_count }) })
  }
  if (active.plan.present) labels.push({ label: t('disclosure.plan') })
  if (active.account_facts && active.account_facts.count > 0) {
    labels.push({ label: t('disclosure.accountFacts', { count: active.account_facts.count }) })
  }
  if (active.workspace_recall && active.workspace_recall.count > 0) {
    labels.push({ label: t('disclosure.workspaceRecall', { count: active.workspace_recall.count }) })
  }
  if (active.portfolio.present) {
    // #1941.4 — « Comprendre les comptes lisibles » : la PUCE nomme les comptes
    // quand le serveur les a nommés. Un nombre seul ne dit pas LESQUELS, et
    // c'est exactement la question qu'on se pose en lisant une réponse qui parle
    // « de ton portefeuille ». Au-delà de PORTFOLIO_NAMED_MAX, la liste dit
    // combien il en reste — elle ne se coupe jamais en silence.
    const names = active.portfolio.names ?? []
    const total = active.portfolio.total
    labels.push({
      label:
        names.length > 0
          ? portfolioLabel(t, names, active.portfolio.count, total)
          : t('disclosure.portfolio', { count: active.portfolio.count }),
    })
  }
  if (active.memory.pinned_facts > 0) {
    labels.push({ label: t('disclosure.memory', { count: active.memory.pinned_facts }) })
  }
  return labels
}

/**
 * Phrase d'une ligne, visible SANS déplier (restitution V2 §13 : « afficher
 * cette réponse utilise votre profil, 2 comptes, 3 signaux et 1 document
 * interne »). Le détail existait déjà mais il fallait cliquer pour le voir, donc
 * en pratique personne ne le voyait — la transparence ne compte que si elle est
 * lue. Comptes déterministes, issus du même objet que le panneau ; aucun élément
 * à zéro n'est mentionné, et sans rien d'utilisé la phrase disparaît.
 */
export function contextSummaryParts(context: ChatResponseContext, t: TFunction<'chat'>): string[] {
  const parts: string[] = []
  const { active } = context
  if (active.profile.present) parts.push(t('disclosure.summaryProfile'))
  // #1779 — LE DOSSIER OUVERT ET LE PORTEFEUILLE NE SE FONDENT PAS.
  //
  // Les deux étaient additionnés en un « N comptes » que rien à l'écran
  // n'expliquait. Un client a ouvert une conversation « Sans compte » et reçu
  // une réponse appuyée sur deux comptes de son portefeuille : la seule phrase
  // qui pouvait le lui dire comptait 1 + 2 et affichait « 3 comptes ».
  //
  // Ce sont deux provenances distinctes — un dossier qu'on a ouvert, et
  // l'ensemble qu'on suit — et le portefeuille se NOMME.
  if (active.account.present) parts.push(t('disclosure.summaryAccounts', { count: 1 }))
  if (active.portfolio.present && active.portfolio.count > 0) {
    parts.push(t('disclosure.summaryPortfolio', { count: active.portfolio.count }))
  }
  if (active.contacts_count > 0) parts.push(t('disclosure.summaryContacts', { count: active.contacts_count }))
  if ((active.signals_count ?? 0) > 0) parts.push(t('disclosure.summarySignals', { count: active.signals_count }))
  if (active.plan.present) parts.push(t('disclosure.summaryPlan'))
  if (active.account_facts && active.account_facts.count > 0) {
    parts.push(t('disclosure.summaryAccountFacts', { count: active.account_facts.count }))
  }
  if (active.workspace_recall && active.workspace_recall.count > 0) {
    parts.push(t('disclosure.summaryWorkspaceRecall', { count: active.workspace_recall.count }))
  }
  if (context.sources.length > 0) parts.push(t('disclosure.summaryDocs', { count: context.sources.length }))
  if (active.memory.pinned_facts > 0) parts.push(t('disclosure.summaryMemory', { count: active.memory.pinned_facts }))
  return parts
}

/**
 * Sober, collapsible « ce que le copilote a utilisé » panel rendered under each
 * assistant reply (P0 démo): active context, cited sources, and — critically —
 * what was NOT consulted, so a beta tester never assumes Bellum crossed HubSpot
 * when it did not.
 */
export function ContextDisclosure({
  context,
  /**
   * Rendu DÉJÀ OUVERT, sans son propre bouton ni son résumé.
   *
   * ⚠️ C'est ce qui évite deux boutons pour le même geste : le pied de réponse
   * (`ReplyFooter`) porte désormais « Voir la source » et la fraîcheur ; laisser
   * ce composant garder son toggle demanderait DEUX clics pour ouvrir un
   * panneau, et afficherait deux fois le même résumé — la loi 4 du tome 7.
   *
   * Le mode par défaut (`false`) est inchangé, avec son bouton et son résumé :
   * il reste le comportement de tout appelant historique.
   */
  alwaysOpen = false,
  /**
   * #1916.24 — la mémoire consultée pour cette réponse, rendue sous « Ce qui a
   * servi ». Un NŒUD fourni par le pied de réponse, qui seul connaît l'identifiant
   * du message enregistré : ce composant ne lit rien lui-même.
   */
  memorySlot = null,
  /**
   * #1933.2 — le compte auquel LA CONVERSATION est scopée (`ChatScope`, pas
   * `context.active.account`) : un fait connu côté écran, indépendant de ce
   * que l'IA a résolu pour CETTE réponse précise. `null` hors scope compte —
   * jamais un identifiant deviné.
   */
  accountId = null,
  /**
   * #2454.6 — les phrases d'une surface HORS conversation (Découvrir,
   * Analyser) : « cette recherche » au lieu de « cette réponse ». Le panneau
   * reste LE MÊME composant (GA-26) — seul le vocabulaire change. Absent : le
   * texte de Laura, byte-identique.
   */
  surfaceCopy = null,
  /**
   * #3163 (retour bêta, 28/09/2026) — Louis, sur la chip `/discover` : « mets
   * tout ça sur une ligne, plus simple, net, synthétique ». À l'état replié,
   * la phrase de résumé et le bouton vivaient chacun sur sa PROPRE ligne
   * (empilés, `mt-1.5 w-full`). `compact` les met CÔTE À CÔTE sur une seule
   * ligne : la phrase tronque (troncature CSS, texte complet dans une
   * infobulle Radix — hover ET focus clavier, jamais un `title=` brut,
   * invisible au clavier et au tactile) et le bouton perd son texte pour ne
   * garder que l'icône, MÊME geste, MÊME `aria-label`. N'affecte QUE l'état
   * replié : agrandi (`open`/`alwaysOpen`), le panneau reste identique — un
   * appelant historique (`ReplyFooter.tsx`, `alwaysOpen`) ne passe jamais ce
   * prop et son rendu ne bouge pas d'un pixel.
   */
  compact = false,
}: {
  context: ChatResponseContext
  alwaysOpen?: boolean
  memorySlot?: ReactNode
  accountId?: string | null
  surfaceCopy?: SurfaceDisclosureCopy | null
  compact?: boolean
}) {
  const { t, i18n } = useTranslation(['chat', 'team'])
  const [open, setOpen] = useState(false)
  const expanded = alwaysOpen || open
  const active = activeLabels(context.active, t, i18n.language)
  const sourcesCount = context.sources.length
  const summary = surfaceCopy ? surfaceCopy.summaryParts : contextSummaryParts(context, t)
  const summaryText = surfaceCopy ? surfaceCopy.summary : t('disclosure.summary', { parts: summary.join(', ') })
  const toggleLabel = `${t('disclosure.toggle')}${sourcesCount > 0 ? t('disclosure.sourcesSuffix', { count: sourcesCount }) : ''}`
  // Réponse d'avant cette PR (historique) → pas d'actions : le panneau retombe
  // simplement sur la liste en texte.
  const actions = new Map((context.not_consulted_actions ?? []).map(a => [a.label, a.action]))

  return (
    <div className={compact ? 'min-w-0 flex-1' : 'mt-1.5 w-full'}>
      {!alwaysOpen && compact ? (
        <div className="flex min-w-0 items-center gap-1">
          {summary.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Text
                  element="span"
                  size="xs"
                  tabIndex={0}
                  className="min-w-0 flex-1 cursor-help truncate text-[var(--bellum-text-muted)] outline-none"
                >
                  {summaryText}
                </Text>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {summaryText}
                {context.mode_explanation ? ` — ${context.mode_explanation.text}` : ''}
              </TooltipContent>
            </Tooltip>
          )}
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            aria-label={toggleLabel}
            className="flex shrink-0 items-center gap-0.5 rounded-md p-1 text-[var(--bellum-text-muted)] outline-none transition-colors hover:text-[var(--bellum-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
          >
            <Info className="size-3.5" />
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      ) : (
        <>
          {!alwaysOpen && summary.length > 0 && (
            <Text size="xs" className="px-1.5 pb-1 text-[var(--bellum-text-muted)]">
              {summaryText}
            </Text>
          )}
          {/* #2448.4 (épopée #2882) — « AUTO n'est pas un mode opaque » : la
              raison du tour, visible SANS déplier — un panneau qu'il faut ouvrir
              pour comprendre pourquoi Laura a pris son temps n'est en pratique
              jamais lu. */}
          {context.mode_explanation && (
            <Text size="xs" className="px-1.5 pb-1 italic text-[var(--bellum-text-muted)]">
              {context.mode_explanation.text}
            </Text>
          )}
          {!alwaysOpen && (
            <button
              type="button"
              onClick={() => setOpen(value => !value)}
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[var(--bellum-text-muted)] outline-none transition-colors hover:text-[var(--bellum-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
            >
              <Info className="size-3.5" />
              <Text size="xs" weight="medium">
                {t('disclosure.toggle')}
                {sourcesCount > 0 ? t('disclosure.sourcesSuffix', { count: sourcesCount }) : ''}
              </Text>
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
            </button>
          )}
        </>
      )}

      {expanded ? (
        // #1907.13 — la preuve est EN RETRAIT (le creux, sans trait) : elle ne se lit plus comme une bulle de plus.
        <div data-chat-kind="proof" className={cn('mt-1.5 space-y-2.5 p-3', CHAT_SURFACE.proof)}>
          <DisclosureSection icon={Check} title={surfaceCopy?.activeTitle ?? t('disclosure.activeTitle')} tone="ok">
            {active.length > 0 ? <ChipRow items={active} /> : <MutedLine text={t('disclosure.noContext')} />}
          </DisclosureSection>

          {/* #1941.5 / #1941.8 — les droits EFFECTIFS du lecteur, rendus TELS
              QUE le serveur les a calculés. Absent (réponse d'avant ce champ) :
              la section entière ne se rend pas, rien n'est deviné côté écran. */}
          {context.permissions !== undefined && (
            <DisclosureSection icon={Shield} title={t('disclosure.permissionsTitle')} tone="neutral">
              {context.permissions.length > 0 ? (
                <ChipRow
                  items={context.permissions.map(permission => ({
                    // #1941.5/.8 — le libellé vit à UN seul endroit (GA-26) :
                    // l'espace de noms `team` (`MemberPermissionsDialog.tsx`),
                    // jamais recopié ici. La clé PORTE un `:` (`team:manage`) —
                    // `nsSeparator: false` l'empêche d'être lu comme un espace
                    // de noms (même piège déjà documenté côté `team`).
                    label: t(`permissions.value.${permission}`, { ns: 'team', nsSeparator: false }),
                  }))}
                />
              ) : (
                <MutedLine text={t('disclosure.noPermissions')} />
              )}
            </DisclosureSection>
          )}

          {memorySlot}

          <DisclosureSection
            icon={FileText}
            title={surfaceCopy?.sourcesTitle ?? t('disclosure.sourcesTitle')}
            tone="neutral"
          >
            {sourcesCount > 0 ? (
              <ChipRow
                items={context.sources.map(source => ({
                  // #3382 (recette prod 26755bbac3, lot C1, 30/09) — cette
                  // pastille affiche du texte brut, jamais rendu par le moteur
                  // markdown de la conversation : un titre de règle qui porte
                  // encore sa syntaxe (`**gras**`) ne doit pas s'y afficher tel
                  // quel.
                  label: stripMarkdownEmphasis(source.label),
                  kind: sourceKindLabel(source.kind, t),
                  /*
                    #1599 — ⚠️ AUCUNE DATE DE CORPUS VISIBLE. Une observation
                    de mémoire marché porte une date de PÉRIODE (le corpus
                    qu'elle agrège), pas une fraîcheur : l'afficher comme les
                    autres `as_of` la ferait lire « fraîche » ou « périmée » à
                    tort. Sa case affiche donc une phrase FIXE plutôt qu'une
                    date — la période reste stockée pour l'audit dans
                    `source.as_of`, elle n'est simplement jamais RENDUE.
                  */
                  freshness:
                    source.kind === 'market_observation'
                      ? t('disclosure.marketObservationCaption')
                      : freshnessLabel(source.as_of, t, i18n.language),
                }))}
              />
            ) : (
              <MutedLine text={surfaceCopy?.noDocument ?? t('disclosure.noDocument')} />
            )}
            {/* #1954.21/#1954.31 — un extrait RÉEL du document, pas seulement son
                titre : « voir la source » montre un passage qu'on peut confronter
                à la réponse. Jamais affirmé comme LA phrase citée par Laura —
                voir la note sur `excerpt` dans `context_transparency.py`. */}
            {context.sources.some(source => source.excerpt) && (
              <div className="mt-1.5 flex flex-col gap-1">
                {context.sources
                  .filter(source => source.excerpt)
                  .map(source => (
                    <Text key={source.label} size="xs" color="text-[var(--bellum-text-muted)]">
                      <span className="font-medium">{t('disclosure.sourceExcerptLabel')}</span>
                      {' — '}
                      <span className="italic">« {stripMarkdownEmphasis(source.excerpt ?? '')} »</span>
                      {' — '}
                      {stripMarkdownEmphasis(source.label)}
                    </Text>
                  ))}
              </div>
            )}
            {/* #2264.17/.18/.20 — périmètre, confiance et relation à l'objet ne
                s'affichent QUE quand la source les porte réellement : « on
                n'affiche pas ce qu'on n'a pas ». */}
            {context.sources.some(
              source => source.scope || source.confidence || source.relatesTo || source.nextVerification,
            ) && (
              <div className="mt-1.5 flex flex-col gap-1">
                {context.sources
                  .filter(source => source.scope || source.confidence || source.relatesTo || source.nextVerification)
                  .map(source => (
                    <Text key={source.label} size="xs" color="text-[var(--bellum-text-muted)]">
                      {source.scope && (
                        <>
                          <span className="font-medium">{t('disclosure.sourceScopeLabel')}</span>
                          {` ${source.scope}`}
                        </>
                      )}
                      {source.confidence && (
                        <>
                          {source.scope ? ' · ' : ''}
                          <span className="font-medium">{t('disclosure.sourceConfidenceLabel')}</span>
                          {` ${t(`disclosure.sourceConfidence.${source.confidence}`)}`}
                        </>
                      )}
                      {source.relatesTo && (
                        <>
                          {source.scope || source.confidence ? ' · ' : ''}
                          <span className="font-medium">{t('disclosure.sourceRelatesToLabel')}</span>
                          {` ${source.relatesTo}`}
                        </>
                      )}
                      {source.nextVerification && (
                        <>
                          {source.scope || source.confidence || source.relatesTo ? ' · ' : ''}
                          <span className="font-medium">{t('disclosure.sourceNextVerificationLabel')}</span>
                          {` ${source.nextVerification}`}
                        </>
                      )}
                    </Text>
                  ))}
              </div>
            )}
          </DisclosureSection>

          <DisclosureSection icon={Ban} title={t('disclosure.notConsultedTitle')} tone="muted">
            <ul className="space-y-1">
              {context.not_consulted.map(item => (
                <li key={item} className="flex items-start gap-1.5">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--bellum-text-muted)]" />
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {item}
                  </Text>
                  <ConnectLink action={actions.get(item)} accountId={accountId} t={t} />
                </li>
              ))}
            </ul>
          </DisclosureSection>

          {/* #3193.2/.3/.4 (épopée #3217) — le reçu de connaissance structuré :
              les onze couches, chacune nommée, dans le format de l'exemple de
              l'issue (« Utilisé pour cette réponse » / « Non utilisé »).
              Absent (réponse d'avant ce champ) : rien n'est deviné.

              #3217.1 (recette prod 29/09) — QUATRE sections, une par état
              RÉEL (consulted/not_requested/unavailable/forbidden_by_mode),
              jamais un binaire Utilisé/Non-utilisé qui noie la panne CRM
              dans le même panier qu'un « non demandé ». Une section vide ne
              se rend pas (#3193 : « on n'affiche pas ce qu'on n'a pas »). */}
          {context.knowledge_receipt &&
            (() => {
              const { consulted, notRequested, unavailable, forbidden, excluded } = knowledgeReceiptGroups(
                context.knowledge_receipt,
                t,
                i18n.language,
              )
              return (
                <DisclosureSection icon={Layers} title={t('disclosure.receipt.title')} tone="neutral">
                  <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
                    {t('disclosure.receipt.usedTitle')}
                  </Text>
                  {consulted.length > 0 ? (
                    <ChipRow items={consulted} />
                  ) : (
                    <MutedLine text={t('disclosure.receipt.usedNone')} />
                  )}
                  {notRequested.length > 0 && (
                    <div className="mt-1.5">
                      <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
                        {t('disclosure.receipt.notRequestedTitle')}
                      </Text>
                      <ChipRow items={notRequested} />
                    </div>
                  )}
                  {unavailable.length > 0 && (
                    <div className="mt-1.5">
                      <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
                        {t('disclosure.receipt.unavailableTitle')}
                      </Text>
                      <ChipRow items={unavailable} />
                    </div>
                  )}
                  {forbidden.length > 0 && (
                    <div className="mt-1.5">
                      <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
                        {t('disclosure.receipt.forbiddenTitle')}
                      </Text>
                      <ChipRow items={forbidden} />
                    </div>
                  )}
                  {excluded.length > 0 && (
                    <div className="mt-1.5">
                      <Text size="xs" weight="medium" className="mb-1 text-[var(--bellum-text-secondary)]">
                        {t('disclosure.receipt.excludedTitle')}
                      </Text>
                      <ChipRow items={excluded} />
                    </div>
                  )}
                </DisclosureSection>
              )
            })()}

          {/* #3176.10 (épopée #3216) — recette prod 29/09 : le plan de sources
              n'était jusqu'ici lisible NULLE PART à l'écran. Absent (aucun
              mode de recherche détecté ce tour, le cas normal) : rien ne se
              rend, comme le reçu de connaissance ci-dessus. */}
          {context.source_plan && <SourcePlanSection plan={context.source_plan} t={t} />}

          {/* #3183.11 (recette prod 29-30/09) — la preuve d'approfondissement,
              seulement quand un second passage a RÉELLEMENT eu lieu ce tour. */}
          {context.turn_observability &&
            (context.turn_observability.completed_steps > 1 ||
              Boolean(context.turn_observability.deepening?.length)) && (
              <TurnObservabilitySection observability={context.turn_observability} t={t} />
            )}

          {/* #214.1 (réel, épopée #3229) — absent sans marqueur de population
              large détecté ce tour, le cas normal. */}
          {(context.search_universe || context.coverage_report || context.thread_scope) && (
            <SearchUniverseSection
              universe={context.search_universe}
              coverage={context.coverage_report}
              threadScope={context.thread_scope}
              t={t}
            />
          )}

          {/* #1941.14 — le panneau expliquait CE QUI a servi, jamais où en lire
              le détail complet. La route existe déjà côté Réglages (Mes
              données) : ce lien ne construit rien de neuf, il rend atteignable
              un écran qui l'était déjà. */}
          <Link
            to="/settings/mes-donnees"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
          >
            {t('disclosure.privacyLink')}
            <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function DisclosureSection({
  children,
  icon: Icon,
  title,
  tone,
}: {
  children: ReactNode
  icon: typeof Check
  title: string
  tone: 'ok' | 'neutral' | 'muted'
}) {
  const iconColor =
    tone === 'ok'
      ? 'text-[var(--bellum-text-accent)]'
      : tone === 'neutral'
        ? 'text-[var(--bellum-text-secondary)]'
        : 'text-[var(--bellum-text-muted)]'
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={cn('size-3.5', iconColor)} />
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {title}
        </Text>
      </div>
      {children}
    </div>
  )
}

const CONNECT_LINK_CLASS =
  'inline-flex shrink-0 items-center gap-0.5 rounded text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]'

/**
 * Le raccourci qui RÉPARE la ligne « non consulté » : le manque devient une
 * action au lieu d'un constat. Rien n'est rendu sans destination réelle — on ne
 * pointe jamais vers un écran qui n'existe pas.
 *
 * #1933.2 — « Lancer une analyse » porte le compte déjà SCOPÉ, quand la
 * conversation en a un. Cette ligne n'apparaît QUE si l'IA n'a résolu AUCUN
 * compte pour cette réponse (`context_transparency.py` : `has_account` est
 * faux) — mais la conversation elle-même peut rester scopée sur un compte
 * côté écran (`ChatScope`), et c'est un fait RÉEL, jamais deviné : `/search`
 * sait retrouver seul l'entreprise, son pays et son périmètre depuis un
 * `accountId` (`routes/search/index.tsx`), exactement comme `LaunchPlanNote`
 * le fait déjà pour une relance. Sans compte scopé, le lien reste nu, comme
 * avant — jamais un identifiant inventé.
 */
function ConnectLink({ action, accountId, t }: { action?: string; accountId: string | null; t: TFunction<'chat'> }) {
  const destination = action ? destinationFor(action) : null
  if (!destination) return null
  if (destination.to === '/search' && accountId) {
    return (
      <Link to="/search" search={{ accountId }} className={CONNECT_LINK_CLASS}>
        {t(destination.cta)}
        <ArrowRight className="size-3" />
      </Link>
    )
  }
  // #2925 (#2145.20) — le SEUL point d'entrée réel des Réglages depuis une
  // conversation avec Laura : poser le signal juste avant de partir, pour que
  // le repli de secours des Réglages (origine inconnue) sache d'où le clic
  // venait, sans jamais rouvrir Laura elle-même (elle ne s'ouvre jamais seule).
  const isSettingsDestination = destination.to.startsWith('/settings')
  return (
    <Link
      to={destination.to}
      onClick={isSettingsDestination ? markSettingsOpenedFromLaura : undefined}
      className={CONNECT_LINK_CLASS}
    >
      {t(destination.cta)}
      <ArrowRight className="size-3" />
    </Link>
  )
}

function ChipRow({ items }: { items: DatedItem[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => (
        <span
          key={item.label}
          className="rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
        >
          {item.kind ? (
            <span className="mr-1 font-medium uppercase tracking-wide text-xs text-[var(--bellum-text-muted)]">
              {item.kind}
            </span>
          ) : null}
          {item.label}
          {item.freshness ? <span className="ml-1 text-[var(--bellum-text-muted)]">· {item.freshness}</span> : null}
        </span>
      ))}
    </div>
  )
}

function MutedLine({ text }: { text: string }) {
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]">
      {text}
    </Text>
  )
}
