import type { TFunction } from 'i18next'
import type { ToolFamily, WorkspaceRole } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { PARTNER_PIPELINE_KEY, fetchPartnerRelations } from '@/features/partner-pipeline/api/partner-pipeline-api'
import { useConsultants } from '@/features/consultants/hooks'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { useTeam } from '@/features/team/hooks/useTeam'
import { orderByRole, type HomeSuggestionFamily } from './laura-home-role-order'

/**
 * L'ÉCRAN D'ACCUEIL DE LAURA — UNE collection, six au plus (#1600).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────
 * Le premier écran montrait trois entrées concurrentes en même temps : les
 * cinq travaux gouvernés (`LauncherExamples`), jusqu'à huit amorces de
 * conversation bornées à six avec un « + N autres », et un lien vers le
 * catalogue complet (`/chat/commandes`). Trois mécaniques pour le même geste
 * — « dis à Laura ce que tu veux » — et aucune n'était CHOISIE pour la
 * personne qui arrive : la même liste s'affichait qu'elle découvre le produit
 * ou qu'elle l'utilise tous les jours.
 *
 * Cette collection remplace les DEUX premières sur l'écran vide (le
 * catalogue complet reste la troisième voie, inchangée). Chaque suggestion
 * porte un `kind` :
 *  - `run`   — un travail qui produit un LIVRABLE (un dossier de compte, un
 *              matching). Le clic envoie la même phrase que taperait
 *              quelqu'un qui sait ce qu'il veut ; c'est Laura qui appelle le
 *              bon outil et annonce le coût AVANT de le consommer (bloc
 *              OUTILS du prompt système, « LANCER UNE ANALYSE ») — pas cette
 *              collection, qui ne fait qu'écrire la phrase.
 *  - `prompt` — une question qui ouvre une conversation, sans dépense.
 *
 * ⚠️ Ce fichier n'arme PAS le lanceur de travaux (`useLauncherArm`,
 * `apps/web/src/features/launcher/**`) : ce catalogue vit dans une autre
 * feature, avec ses propres coûts et ses propres runs par type. Le dupliquer
 * ici créerait une SECONDE liste de travaux, divergente par construction. Le
 * `run` d'une suggestion est donc une phrase adressée à Laura, qui tient déjà
 * la règle de prévisualisation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CLASSEMENT DÉPEND DU CONTEXTE RÉEL
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre familles, chacune activée par un signal REEL (jamais une case à
 * cocher) :
 *  - NOUVEL UTILISATEUR   — repli quand aucun autre signal n'est vrai.
 *  - VIVIER REMPLI        — au moins un consultant dans le vivier.
 *  - PORTEFEUILLE REMPLI  — au moins un compte analysé.
 *  - PARTENAIRES CONFIGURÉS — au moins une relation partenaire déclarée.
 *
 * Plusieurs signaux peuvent être vrais en même temps (un espace mature a un
 * portefeuille ET des partenaires) : la liste les empile dans cet ordre de
 * priorité — partenaires, portefeuille, vivier — et s'arrête à six.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1909.6 — QUATRE FAMILLES DE SIGNAUX, HUIT FAMILLES DE TRAVAIL
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Deux axes, deux listes, et une décision qui a confondu les deux le temps
 * d'une branche. La trace reste ici parce que c'est exactement l'endroit où la
 * confusion se refera :
 *
 *  · les QUATRE ci-dessus sont des familles de SIGNAUX — elles disent QUAND
 *    une suggestion apparaît (nouvel utilisateur / vivier / portefeuille /
 *    partenaires), et chacune est adossée à un signal d'espace MESURÉ ;
 *  · les HUIT de `LAURA_SUGGESTION_FAMILIES` (plus bas) sont des familles de
 *    TRAVAIL — elles disent DE QUOI une suggestion parle.
 *
 * Le 16/09, une branche a lu les quatre signaux comme la réponse à #1909.6 et
 * a écrit « on garde les quatre », au motif que le texte d'origine de la
 * taxonomie serait introuvable. Il ne l'est pas : il est cité mot pour mot
 * dans le docblock de `LAURA_SUGGESTION_FAMILIES`, et les huit familles de
 * travail sont livrées, rendues sur la carte et tenues par un test qui les
 * épelle (`laura-home-suggestions.test.ts`). La décision « quatre » ne portait
 * donc pas sur ce que #1909.6 demandait — ce paragraphe remplace le sien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2141 — (HISTORIQUE, RENVERSÉ PAR #3773 CI-DESSOUS) LA GRILLE AFFICHAIT TOUJOURS SIX AMORCES
 * ─────────────────────────────────────────────────────────────────────────
 * Revirement assumé : la version précédente de ce docblock disait « rien
 * n'oblige à ATTEINDRE six » — un nouvel espace n'avait que quatre
 * suggestions vraies, et les compléter aurait fallu en INVENTER deux, ce que
 * l'interdit « JAMAIS de donnée fictive » refuse. Décision de Louis, contre
 * la recommandation initiale : la grille affiche toujours six cartes. Les
 * amorces tirées des données de l'espace passent en premier ; quand il en
 * manque, des amorces GÉNÉRIQUES comblent le reste (`GENERIC_HOME_SUGGESTION_IDS`).
 * Une générique ne promet RIEN sur l'espace — jamais un compte, un contact,
 * un partenaire — elle ne promet que la conversation. C'est ce qui la rend
 * différente d'une donnée fictive : elle n'affirme rien de faux, elle ouvre
 * juste une porte.
 *
 * Chaque suggestion portait alors un `origin` — `'personalised'` (tirée des
 * données réelles) ou `'generic'` (comblement) — un CHAMP du modèle, pas une
 * convention de nommage sur l'`id` : c'est lui qui permet de les compter, de
 * les masquer, ou de les réordonner sans deviner la nature d'une suggestion
 * depuis son identifiant.
 */

/**
 * ─────────────────────────────────────────────────────────────────────────
 * #3773 (BEL-LAU-0610-002, 06/10/2026) — QUATRE AU PLUS, JAMAIS COMPLÉTÉES
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ RENVERSEMENT ASSUMÉ de #2141 (« la grille affiche toujours six »), daté et
 * écrit pour être lu : Louis, 06/10 — « moins de choix simultanés, pas moins de
 * produit. Cible initiale : quatre suggestions distinctes. Ne jamais compléter
 * artificiellement pour atteindre quatre. » Les amorces GÉNÉRIQUES (« Que
 * peux-tu faire ? »…) qui comblaient la grille sont donc retirées : une absence
 * ne fait pas de ligne. Le catalogue complet reste derrière « Tous les exemples »
 * (`/chat/commandes`) ; aucune capacité n'est retirée.
 *
 * Pour que quatre cartes couvrent les capacités PLUTÔT que la première famille
 * seule, la sélection prend UNE suggestion par signal, puis la deuxième de
 * chaque signal, et ainsi de suite (tourniquet), avant la coupe à quatre.
 */

type LauraHomeSuggestionKind = 'run' | 'prompt'

/**
 * #3773.5 — ce que la suggestion ne peut pas deviner. Un compte ou un consultant
 * se CHOISIT : le clic demande cet UN élément puis
 * prépare la demande, au lieu de pré-remplir un long texte portant des
 * hypothèses que la personne n'a pas faites. `null` = la question est complète.
 */
type LauraHomeSuggestionNeeds = 'account' | 'consultant'

/**
 * #1909.6 — LES HUIT FAMILLES, NOMMÉES.
 *
 * La taxonomie ne se déduit pas du code : elle est écrite dans le retour
 * (« Familles possibles : Décider, Analyser, Découvrir, Trouver, Positionner,
 * Préparer, Agir, Piloter »). La recopier telle quelle est le point — la
 * reconstruire à partir des dix suggestions existantes aurait inventé celles
 * qui manquent, et c'est ce qui avait bloqué ce point deux fois.
 *
 * Ne pas la confondre avec les QUATRE familles de SIGNAUX du docblock de tête
 * (nouvel utilisateur / vivier / portefeuille / partenaires) : celles-là disent
 * QUAND une suggestion apparaît, celle-ci dit DE QUEL TRAVAIL elle parle. Deux
 * axes distincts, deux listes distinctes.
 *
 * ⚠️ `prepare` n'a aujourd'hui aucune suggestion — « Prépare mon prochain
 * rendez-vous » suppose un agenda BRANCHÉ, et le jour où cette suggestion
 * naîtra elle devra le déclarer dans `HOME_SUGGESTION_REQUIRES`. La famille est
 * nommée quand même : une taxonomie amputée de ce qu'elle ne sert pas encore
 * ment sur sa propre forme, et le test qui l'épelle le dirait.
 */
export const LAURA_SUGGESTION_FAMILIES = [
  'decide',
  'analyse',
  'discover',
  'find',
  'position',
  'prepare',
  'act',
  'steer',
] as const

type LauraSuggestionFamily = (typeof LAURA_SUGGESTION_FAMILIES)[number]

export type LauraHomeSuggestion = {
  id: string
  kind: LauraHomeSuggestionKind
  /** Le texte de la pastille — court, l'intention plutôt que la commande. */
  label: string
  /** Ce qui part réellement à Laura quand on clique. */
  prompt: string
  /** Le bénéfice attendu, une phrase — ce que la carte ajoute au libellé. */
  benefit: string
  /** #3773.5 — l'élément à choisir avant d'envoyer, ou `null` si la question est complète. */
  needs: LauraHomeSuggestionNeeds | null
  /**
   * #3773.5 — la même demande une fois l'élément choisi : on lui donne le NOM que la personne
   * vient de cliquer. `null` quand rien n'est à choisir.
   */
  promptFor: ((name: string) => string) | null
  /**
   * #1909.6 — la famille de travail. ABSENTE sur une amorce générique, et
   * c'est voulu : « Que peux-tu faire ? » ne relève d'aucune des huit, et lui
   * en coller une au hasard serait exactement la donnée inventée que l'on
   * refuse ailleurs.
   */
  family?: LauraSuggestionFamily
  /** Le libellé traduit de la famille — absent en même temps que `family`. */
  familyLabel?: string
}

export type LauraHomeContext = {
  /** Au moins un compte a déjà été analysé. */
  hasPortfolio: boolean
  /** Le vivier compte au moins un consultant. */
  hasVivier: boolean
  /** Au moins une relation partenaire est déclarée. */
  hasPartners: boolean
  /**
   * #1947 — VRAI seulement quand les trois lectures ont abouti. Pendant le
   * chargement, les trois booléens valent `false` sans rien savoir : une phrase
   * qui en conclurait « espace vide » dirait le contraire du vrai à un espace de
   * vingt comptes pas encore chargés. Optionnel : absent = non établi.
   */
  settled?: boolean
  /**
   * #1909.3 — le rôle dans l'espace, signal d'APPOINT : il change l'ORDRE des
   * suggestions, jamais lesquelles sont servies (`laura-home-role-order.ts`).
   * Absent, `null` ou inconnu = l'ordre qui existait avant, à l'identique.
   */
  role?: WorkspaceRole | null
  /**
   * #1902.11 — les familles d'outils BRANCHÉES, lues dans le registre des outils
   * (`useConnectedCapabilities`, la même lecture que le composeur et que
   * Réglages › Intégrations). Absent = registre pas encore lu : une suggestion
   * qui exige un outil ATTEND, comme l'amorce du composeur.
   */
  connectedFamilies?: readonly ToolFamily[]
}

/** La borne haute — #3773 : quatre (était six, #1600/#2141). */
export const MAX_HOME_SUGGESTIONS = 4

/**
 * #1909.2 — la rangée d'amorces du COMPOSEUR (fil entamé) reste à six : c'est un autre écran, que
 * #3773 ne touche pas. Elle empruntait `MAX_HOME_SUGGESTIONS` ; en descendant l'accueil à quatre,
 * la rangée du composeur serait descendue avec lui sans que personne l'ait demandé.
 */
export const MAX_COMPOSER_SUGGESTIONS = 6

/**
 * #4762 — la mémoire marché EST branchée côté Laura : l'outil `search_market_memory` figure dans
 * la liste d'outils (`apps/ia/app/services/chat_tools.py`, `SEARCH_MARKET_MEMORY_TOOL`). Le
 * drapeau restait à `false` : le sous-titre ne la nommait jamais. Il reste un commutateur unique.
 */
export const LAURA_HOME_MARKET_MEMORY_AVAILABLE = true

type SuggestionId =
  | 'findCompatibleAccounts'
  | 'analyzeCompany'
  | 'zoneOpportunities'
  | 'whereInvestTime'
  | 'consultantAvailable'
  | 'matchVivier'
  | 'matchingEnvironments'
  | 'findAccessPath'
  | 'whatsChanged'
  | 'rank2PartnerUsage'
  | 'prepareMeeting'

const KIND_BY_ID: Record<SuggestionId, LauraHomeSuggestionKind> = {
  findCompatibleAccounts: 'prompt',
  analyzeCompany: 'run',
  zoneOpportunities: 'prompt',
  whereInvestTime: 'prompt',
  consultantAvailable: 'run',
  matchVivier: 'run',
  matchingEnvironments: 'prompt',
  findAccessPath: 'prompt',
  whatsChanged: 'prompt',
  rank2PartnerUsage: 'prompt',
  prepareMeeting: 'prompt',
}

// « NOUVEL UTILISATEUR » — repli, jamais combiné avec les trois autres.
const NEW_USER: SuggestionId[] = ['findCompatibleAccounts', 'analyzeCompany', 'zoneOpportunities', 'whereInvestTime']
// « VIVIER REMPLI ».
const VIVIER: SuggestionId[] = ['consultantAvailable', 'matchVivier', 'matchingEnvironments']
// « PORTEFEUILLE REMPLI ». `whereInvestTime` est PARTAGÉ avec le repli
// nouvel-utilisateur : la question reste vraie une fois qu'un portefeuille
// existe, et la dédoublonner évite de la proposer deux fois.
const PORTFOLIO: SuggestionId[] = ['whereInvestTime', 'prepareMeeting', 'findAccessPath', 'whatsChanged']
// « PARTENAIRES CONFIGURÉS ».
const PARTNERS: SuggestionId[] = ['rank2PartnerUsage']

/**
 * #1909.3 — une suggestion RETENUE, avec la famille qui l'a fait entrer.
 *
 * ⚠️ La famille se retient au moment de la SÉLECTION, elle ne se redéduit pas
 * depuis l'identifiant : `whereInvestTime` appartient à DEUX listes, et une
 * table `id → famille` l'aurait rangé sous « portefeuille » même chez un espace
 * neuf qui n'en a aucun — la question aurait alors sauté en tête du repli
 * nouvel-utilisateur, pour un espace sans portefeuille. Le défaut n'aurait
 * concerné qu'une seule suggestion, et personne ne l'aurait vu.
 */
type PickedSuggestion = { id: SuggestionId; family: HomeSuggestionFamily }

/**
 * Les identifiants retenus, dans l'ordre, avant la coupe à six.
 *
 * Priorité PARTENAIRES > PORTEFEUILLE > VIVIER : ce sont les signaux les plus
 * avancés d'un espace mature, et une relation partenaire déclarée est plus
 * rare — donc plus significative — qu'un vivier ou un portefeuille remplis.
 */
/**
 * #1902.11 — CE QUE CHAQUE SUGGESTION EXIGE D'ÊTRE BRANCHÉ.
 *
 * « Les suggestions, le catalogue et les réponses doivent tous lire le même
 * état. » Le composeur lit le registre des outils (`PROMPT_REQUIRES` dans
 * `Chat.tsx`) ; l'accueil ne le lisait pas. La table est EXHAUSTIVE — le type
 * `Record<SuggestionId, …>` refuse une onzième suggestion qui ne dirait pas ce
 * qu'elle exige.
 *
 * Aujourd'hui aucune n'exige de connecteur, et c'est vérifié une par une : les
 * dix travaillent sur ce qui vit DANS l'espace (portefeuille, vivier, besoins,
 * partenaires, signaux) — les outils qu'elles mènent Laura à appeler sont tous
 * absents de `TOOL_REQUIRED_FAMILIES` (`chat_tools.py`). `analyzeCompany`
 * consomme des crédits, mais un coût n'est pas un connecteur : Laura l'annonce
 * avant de lancer, comme le docblock de ce fichier le dit.
 */
export const HOME_SUGGESTION_REQUIRES: Readonly<Record<SuggestionId, ToolFamily | null>> = {
  findCompatibleAccounts: null,
  analyzeCompany: null,
  zoneOpportunities: null,
  whereInvestTime: null,
  consultantAvailable: null,
  matchVivier: null,
  matchingEnvironments: null,
  findAccessPath: null,
  whatsChanged: null,
  rank2PartnerUsage: null,
  // #3773.3 — « un utilisateur sans agenda connecté peut préparer un rendez-vous à partir
  // d'informations fournies » : aucun connecteur n'est exigé.
  prepareMeeting: null,
}

/**
 * #1909.6 — LA FAMILLE DE CHAQUE SUGGESTION DE DONNÉES.
 *
 * `Record<SuggestionId, …>` : une onzième suggestion ne peut pas naître sans
 * dire de quel travail elle parle. Les rapprochements suivent les exemples du
 * retour : « Quels comptes dois-je travailler cette semaine ? » → Décider,
 * « J'ai un consultant disponible : où le positionner ? » → Positionner,
 * « Trouve les bons interlocuteurs chez Total » → Trouver.
 */
export const HOME_SUGGESTION_FAMILY: Readonly<Record<SuggestionId, LauraSuggestionFamily>> = {
  findCompatibleAccounts: 'discover',
  analyzeCompany: 'analyse',
  zoneOpportunities: 'discover',
  whereInvestTime: 'decide',
  consultantAvailable: 'position',
  matchVivier: 'position',
  matchingEnvironments: 'position',
  findAccessPath: 'find',
  whatsChanged: 'steer',
  rank2PartnerUsage: 'act',
  prepareMeeting: 'prepare',
}

/**
 * #1909.7 — « NE JAMAIS PROPOSER REVERSE MARKET SI LE VIVIER EST VIDE ».
 *
 * Reverse Market, sur cet écran, c'est `consultantAvailable` — « Positionner un
 * consultant disponible », l'exemple du retour mot pour mot. Le tableau `VIVIER`
 * ci-dessus disait déjà dans quel ORDRE ces suggestions remontent, mais l'ordre
 * n'est pas une permission : le jour où l'une d'elles serait listée sous un
 * SECOND signal (comme `whereInvestTime` l'est déjà sous deux), elle
 * s'afficherait à un espace au vivier vide et promettrait de positionner un
 * consultant qui n'existe pas.
 *
 * Cette table est la PERMISSION, déclarée par suggestion, et c'est elle qui
 * tranche dans `resolveSuggestionIds`. `Record<SuggestionId, boolean>` : une
 * onzième suggestion doit dire si elle parle du vivier.
 */
export const HOME_SUGGESTION_REQUIRES_VIVIER: Readonly<Record<SuggestionId, boolean>> = {
  findCompatibleAccounts: false,
  analyzeCompany: false,
  zoneOpportunities: false,
  whereInvestTime: false,
  consultantAvailable: true,
  matchVivier: true,
  matchingEnvironments: true,
  findAccessPath: false,
  whatsChanged: false,
  rank2PartnerUsage: false,
  prepareMeeting: false,
}

/**
 * #3773.5 — CE QUE CHAQUE SUGGESTION DEMANDE DE CHOISIR AVANT D'ÊTRE PRÉPARÉE.
 * `Record<SuggestionId, …>` : une suggestion neuve doit dire si elle suppose un
 * compte, un consultant ou un rendez-vous. Les questions qui portent sur tout
 * l'espace (portefeuille, vivier entier, partenaires) n'ont rien à choisir.
 */
const NEEDS_BY_ID: Readonly<Record<SuggestionId, LauraHomeSuggestionNeeds | null>> = {
  findCompatibleAccounts: null,
  // Une entreprise se NOMME à la saisie (souvent pas encore au portefeuille) : rien à choisir dans une liste.
  analyzeCompany: null,
  zoneOpportunities: null,
  whereInvestTime: null,
  consultantAvailable: 'consultant',
  matchVivier: null,
  matchingEnvironments: null,
  findAccessPath: 'account',
  whatsChanged: null,
  rank2PartnerUsage: null,
  // « Préparer mon prochain rendez-vous » est complète : Laura demande ce qui manque.
  prepareMeeting: null,
}

function resolveSuggestionIds(
  context: LauraHomeContext,
  requires: Readonly<Record<SuggestionId, ToolFamily | null>>,
  requiresVivier: Readonly<Record<SuggestionId, boolean>>,
): SuggestionId[] {
  // #3773 — tourniquet : une suggestion par signal, puis la deuxième de chacun… Sans lui, la coupe à
  // quatre garderait la seule première famille et un espace mature ne verrait jamais son vivier.
  const groups: Array<{ family: HomeSuggestionFamily; ids: readonly SuggestionId[] }> = []
  if (context.hasPartners) groups.push({ family: 'partners', ids: PARTNERS })
  if (context.hasPortfolio) groups.push({ family: 'portfolio', ids: PORTFOLIO })
  if (context.hasVivier) groups.push({ family: 'vivier', ids: VIVIER })
  if (groups.length === 0) groups.push({ family: 'newUser', ids: NEW_USER })
  const ordered: PickedSuggestion[] = []
  const rounds = Math.max(...groups.map(group => group.ids.length))
  for (let round = 0; round < rounds; round += 1) {
    for (const { family, ids } of groups) {
      const id = ids[round]
      if (id) ordered.push({ id, family })
    }
  }

  // #1902.11 — une suggestion dont l'outil n'est pas branché n'est pas visible.
  // Filtrée AVANT la coupe à six : elle ne doit pas occuper une place vide.
  const connected = context.connectedFamilies ?? []
  const seen = new Set<SuggestionId>()
  const deduped = ordered.filter(({ id }) => {
    const needs = requires[id]
    if (needs !== null && !connected.includes(needs)) return false
    // #1909.7 — « jamais Reverse Market si le vivier est vide ». La PERMISSION
    // est lue ici, pas déduite du groupe qui a fait remonter l'id : c'est la
    // seule forme qui tient quand une suggestion remonte par deux signaux.
    if (requiresVivier[id] && !context.hasVivier) return false
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  // #1909.3 — LE RÔLE PÈSE ICI, ET SEULEMENT ICI : après la sélection ET après
  // la coupe à quatre. Réordonner avant la coupe changerait l'ENSEMBLE servi — un
  // rôle perdrait la suggestion qu'un autre garde, ce qui est exactement le
  // filtrage que Louis a refusé. Ici, seul l'ordre de lecture bouge.
  return orderByRole(deduped.slice(0, MAX_HOME_SUGGESTIONS), context.role, picked => picked.family).map(
    picked => picked.id,
  )
}

/** Construit une suggestion DE DONNÉES depuis ses clés de traduction. */
function buildSuggestion(t: TFunction<'chat'>, id: SuggestionId): LauraHomeSuggestion {
  // #1909.6 — la famille de travail reste dans le modèle (le catalogue la nomme) ; #3773.2 — la
  // carte ne l'affiche plus en sur-titre.
  const family = HOME_SUGGESTION_FAMILY[id]
  const needs = NEEDS_BY_ID[id]
  return {
    id,
    kind: KIND_BY_ID[id],
    label: t(`home.suggestions.${id}.label`),
    prompt: t(`home.suggestions.${id}.prompt`),
    benefit: t(`home.suggestions.${id}.benefit`),
    needs,
    promptFor: needs ? name => t(`home.suggestions.${id}.promptFor`, { name }) : null,
    family,
    familyLabel: t(`home.suggestionFamilies.${family}`),
  }
}

/**
 * #5011 / #5027 — l'UNIQUE chemin « J'ai un compte en tête » de l'accueil : hors du classement par signaux (il ne
 * compte pas dans les trois cartes), il demande le compte puis le profil. Même forme qu'une carte pour réutiliser
 * le choix du compte (`TargetPicker`).
 */
export function buildKnownAccountEntry(t: TFunction<'chat'>): LauraHomeSuggestion {
  return {
    id: 'knownAccount',
    kind: 'prompt',
    label: t('home.knownAccount.label'),
    prompt: t('home.knownAccount.prompt'),
    benefit: '',
    needs: 'account',
    promptFor: name => t('home.knownAccount.promptFor', { name }),
    family: 'position',
    familyLabel: '',
  }
}

/**
 * La collection affichée sur l'écran vide — QUATRE au plus (#3773), jamais
 * complétée : moins de signaux vrais, moins de cartes.
 */
export function resolveLauraHomeSuggestions(
  t: TFunction<'chat'>,
  context: LauraHomeContext,
  requires: Readonly<Record<SuggestionId, ToolFamily | null>> = HOME_SUGGESTION_REQUIRES,
  requiresVivier: Readonly<Record<SuggestionId, boolean>> = HOME_SUGGESTION_REQUIRES_VIVIER,
): LauraHomeSuggestion[] {
  // Revient sur #3654 (arbitrage Louis 31/10, #5042) : plus de six amorces propres au compte ciblé.
  return resolveSuggestionIds(context, requires, requiresVivier).map(id => buildSuggestion(t, id))
}

/**
 * Les trois signaux, lus depuis les sources réelles de l'espace.
 *
 * ⚠️ `hasPortfolio` reçoit le compte de portefeuille déjà chargé par l'écran
 * (`useAccounts`) au lieu de le relire : `Chat.tsx` l'a déjà, et une seconde
 * requête pour la même donnée pourrait diverger de celle que l'entête
 * affiche.
 */
export function useLauraHomeContext(portfolioCount: number | null, portfolioFailed = false): LauraHomeContext {
  const consultantsQuery = useConsultants()
  const consultants = consultantsQuery.data
  // #1909.3 — le rôle, par la MÊME lecture que l'entête du fil (`TEAM_KEY`,
  // même clé de cache : aucune requête de plus). Pas encore lu = `null`, donc
  // l'ordre par défaut — jamais une liste vide en attendant.
  const { team, isLoading, isError: teamError } = useTeam()
  // #5042 R3 — la requête d'équipe est DÉSACTIVÉE tant que la session n'est pas prête : `isLoading` vaut alors
  // `false` avec `team` absente. Sans cette clause, `settled` passait vrai avec un rôle inconnu et les cartes se
  // figeaient dans l'ordre par défaut, avant l'arrivée du vrai rôle. Un échec de lecture, lui, libère les cartes.
  // #5042 R5 — une équipe arrivée SANS rôle (réponse partielle) ne vaut pas « lue » non plus : le rôle décide de l'ordre.
  const teamLoading = isLoading || (!teamError && (team === undefined || !team.workspace?.role))
  const partnersQuery = useQuery({
    queryKey: PARTNER_PIPELINE_KEY,
    queryFn: fetchPartnerRelations,
    staleTime: 30_000,
  })
  const partners = partnersQuery.data
  // #5042 R4 — une lecture est « arrivée » si elle a une donnée OU a échoué (jamais `!isLoading` : désactivée, une
  // requête a `isLoading=false` sans donnée). Un échec libère les cartes au lieu de les retenir jusqu'au délai.
  const arrived = (query: { data?: unknown; isError?: boolean }) => query.data !== undefined || query.isError === true
  // #1902.11 — le registre des outils, par la MÊME lecture que le composeur
  // (même clé de cache : aucune requête de plus).
  const { families, isLoading: registryLoading, arrived: registryArrived } = useConnectedCapabilities()

  return {
    hasPortfolio: (portfolioCount ?? 0) > 0,
    hasVivier: (consultants?.length ?? 0) > 0,
    hasPartners: (partners?.length ?? 0) > 0,
    role: team?.workspace?.role ?? null,
    // #5042 R2 — « settled » couvre TOUTES les lectures dont dépend la liste figée : le registre des outils change
    // l'ENSEMBLE des cartes (`connectedFamilies` absent = toute carte à outil écartée) et l'équipe change leur ORDRE
    // (rôle). Les omettre figeait un état partiel différent à chaque chargement.
    settled:
      (portfolioCount !== null || portfolioFailed) &&
      arrived(consultantsQuery) &&
      arrived(partnersQuery) &&
      registryArrived !== false &&
      !registryLoading &&
      !teamLoading,
    ...(registryLoading || registryArrived === false ? {} : { connectedFamilies: families }),
  }
}
