import { z } from 'zod'
import { GOLDEN_JOURNEYS_TOTAL, coveredGoldenJourneyNumbers, goldenJourneysCovered } from './golden-journeys.js'
import { GOLDEN_JOURNEYS_X41_TOTAL, SCENARIOS_2154_X41, coveredGoldenJourneyX41Numbers } from './golden-journeys-x41.js'
import { ROUTE_EMPTY_STATES, uncoveredEmptyStateRouteKeys } from './route-migration-empty-states.js'
import {
  ROUTE_MIGRATION_KEYS,
  ROUTE_MIGRATION_REGISTRY,
  type RouteMigrationKey,
  redirectedRoutes,
} from './route-migration-registry.js'

/**
 * Les conditions NO-GO / GO PROPRES À #2208 — #2958.94-.112.
 *
 * Le tri du 24/09 22:17 a versé 97 points `#2208.*` à cette épopée sans leur
 * donner de numéro `#2958.<k>` propre ; le lot V27 (28/09 après-midi) les a
 * numérotés. Parmi eux, neuf conditions NO-GO et sept conditions GO
 * REDEMANDENT ce que `route-migration-go-no-go.ts` (#2154.31/.32) répond déjà
 * — mais avec un VOCABULAIRE largement DIFFÉRENT (« CTA sans effet »,
 * « matching opaque », « recette recruteur »… n'existent nulle part dans
 * #2154). Exception nommée : les trois recettes Antoine/Hervé/manager sont
 * les MÊMES humains cités par les deux issues — même clé dans les deux
 * listes, sciemment, plutôt qu'un synonyme inventé pour paraître distinct.
 * Deux listes de conditions qui se ressemblent sans être identiques ne se
 * fusionnent JAMAIS (doctrine : « on propose une fusion de doublons, on ne
 * fusionne jamais » — vaut ici aussi) : ce fichier est un SECOND fichier, pas
 * une extension du premier — chaque liste reste comptée et servie séparément.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PEUT VÉRIFIER, ET CE QU'IL NE PEUT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `route_cassee` (#2958.103) est la SEULE condition NO-GO de ce lot calculée
 * contre du code réel : `routeCasseeVerifiee()` relit `redirectedRoutes()` du
 * registre #2154.3/#2208 et vérifie que CHAQUE route redirigée porte un
 * `holderFile` prouvé (donc un scénario dans
 * `legacy-addresses.test.ts`, #2958.71). Les huit
 * autres conditions NO-GO et les quatre conditions GO non humaines
 * (`tests_e2e`, `captures_avant_apres`, `chaine_complete_sans_apprentissage`)
 * n'ont aucun mécanisme dans ce dépôt qui les mesure : leur statut est
 * `not_yet_evaluable` / `not_met`, avec la raison concrète nommée plutôt
 * qu'une case cochée à main levée — inventer la preuve serait la donnée
 * fictive que la doctrine interdit.
 *
 * Les quatre recettes (#2958.106-.109) — DÉCISION LOUIS 09/10 (lot P04) :
 * chacune est SIGNÉE par un scénario e2e Playwright (une seule URL de départ,
 * on ne clique que ce que l'écran propose, chaque écriture vérifiée) — « vert
 * en CI = signé ». Ce registre ne lit pas la CI : une recette dotée de son
 * scénario reste `unknown` (le verdict est celui du job e2e), jamais `met`
 * déclaré ici. Une recette SANS scénario reste `humanOnly`. Leurs cousines de
 * #2154.32 (`route-migration-go-no-go.ts`, mêmes clés Antoine/Hervé/manager)
 * suivent la même règle depuis la décision Louis du 11/10 et lisent
 * `RECETTE_2208_SPECS` ci-dessous — un seul endroit pour le scénario qui signe.
 */

/** #2958.112 — le scénario qui porte la condition GO `chaine_complete_sans_apprentissage`. */
/** #2958.111 — le spec qui capture, desktop et mobile, chacune des routes du registre. */
export const CAPTURES_ROUTES_SPEC = 'e2e/tests/web/captures-2958-111-routes-migrees.spec.ts'
export const CHAINE_SANS_APPRENTISSAGE_SPEC = 'e2e/tests/web/scenario-2958-112-chaine-sans-apprentissage.spec.ts'

/**
 * #2958.106-.109 — le scénario qui SIGNE chaque recette (décision Louis 09/10).
 * Relu par `route-migration-2208-conditions.test.ts` : le fichier existe, cite
 * son point, et n'entre que par UNE url.
 */
export const RECETTE_2208_SPECS = {
  recette_antoine: 'e2e/tests/web/recette-2958-106-antoine.spec.ts',
  recette_herve: 'e2e/tests/web/recette-2958-107-herve.spec.ts',
  recette_recruteur: 'e2e/tests/web/recette-2958-108-recruteur.spec.ts',
  recette_manager: 'e2e/tests/web/recette-2958-109-manager.spec.ts',
} as const satisfies Partial<Record<string, string>>

type RecetteKey = 'recette_antoine' | 'recette_herve' | 'recette_recruteur' | 'recette_manager'

/** Une recette : signée par son scénario s'il existe, humaine sinon — jamais `met` déclaré. */
function recetteCondition(
  key: RecetteKey,
  sourceIssue: string,
  label: string,
  signs: string,
  humanEvidence: string,
): Go2208Condition {
  const spec = (RECETTE_2208_SPECS as Partial<Record<RecetteKey, string>>)[key]
  if (spec === undefined)
    return { key, sourceIssue, label, status: 'unknown', humanOnly: true, evidence: humanEvidence }
  return {
    key,
    sourceIssue,
    label,
    status: 'unknown',
    humanOnly: false,
    evidence: `Signée par le scénario ${spec} (décision Louis 09/10 : vert en CI = signé) — ${signs} Une seule URL tapée, on ne clique que ce que l'écran propose, chaque écriture vérifiée. Le verdict « vert » est celui du job e2e de la CI, que ce registre ne peut pas signer.`,
  }
}

export const NO_GO_2208_CONDITION_KEYS = [
  'profil_importe_inutilisable',
  'cta_sans_effet',
  'matching_opaque',
  'message_generique',
  'sequence_impossible_inspecter',
  'mission_dupliquee',
  'route_cassee',
  'page_vide_sans_porte_sortie',
  'laura_ecran_non_prerempli',
] as const
export const noGo2208ConditionKeySchema = z.enum(NO_GO_2208_CONDITION_KEYS)
export type NoGo2208ConditionKey = (typeof NO_GO_2208_CONDITION_KEYS)[number]

export const GO_2208_CONDITION_KEYS = [
  'recette_antoine',
  'recette_herve',
  'recette_recruteur',
  'recette_manager',
  'tests_e2e',
  'captures_avant_apres',
  'chaine_complete_sans_apprentissage',
] as const
export const go2208ConditionKeySchema = z.enum(GO_2208_CONDITION_KEYS)
export type Go2208ConditionKey = (typeof GO_2208_CONDITION_KEYS)[number]

export const NO_GO_2208_STATUSES = ['not_yet_evaluable', 'blocked', 'clear'] as const
export const noGo2208StatusSchema = z.enum(NO_GO_2208_STATUSES)
export type NoGo2208Status = (typeof NO_GO_2208_STATUSES)[number]

export const GO_2208_STATUSES = ['not_met', 'met', 'unknown'] as const
export const go2208StatusSchema = z.enum(GO_2208_STATUSES)
export type Go2208Status = (typeof GO_2208_STATUSES)[number]

export const noGo2208ConditionSchema = z.object({
  key: noGo2208ConditionKeySchema,
  /** Le point `#2958.<k>` exact dont l'entrée répond. */
  sourceIssue: z.string().min(1),
  /** Le texte de #2208, verbatim. */
  label: z.string().min(1),
  status: noGo2208StatusSchema,
  /** Ce qui justifie le statut — jamais vide, jamais « à vérifier ». */
  evidence: z.string().min(1),
})
export type NoGo2208Condition = z.infer<typeof noGo2208ConditionSchema>

export const go2208ConditionSchema = z.object({
  key: go2208ConditionKeySchema,
  sourceIssue: z.string().min(1),
  label: z.string().min(1),
  status: go2208StatusSchema,
  evidence: z.string().min(1),
  /** `true` pour les quatre recettes humaines : aucune garde ne peut les
   *  faire passer à `met`, seul un geste humain le peut. */
  humanOnly: z.boolean(),
})
export type Go2208Condition = z.infer<typeof go2208ConditionSchema>

/**
 * #2958.103 — « une ancienne route casse » : calculée, pas déclarée. Vraie
 * seulement si CHAQUE route `redirected` du registre porte un `holderFile`
 * prouvé (le fichier que `route-migration-registry.test.ts` a relu pour
 * confirmer le `redirect(...)` littéral).
 */
export function routeCasseeVerifiee(): boolean {
  const redirected = redirectedRoutes()
  return redirected.length > 0 && redirected.every(entry => entry.holderFile !== null)
}

/** Les parcours couverts par LES DEUX registres (lots X40 : 1-20, 33, 37-40 ; X41 : 21-32, 34-36), sans doublon. */
function allCoveredJourneyNumbers(): number[] {
  return [...new Set([...coveredGoldenJourneyNumbers(), ...coveredGoldenJourneyX41Numbers()])].sort((a, b) => a - b)
}

/** #2958.99 — le parcours 30 (valider les messages) ET le scénario #2154.19 (création/validation d'une séquence) ont leur spec. */
const SEQUENCE_INSPECTABLE =
  coveredGoldenJourneyX41Numbers().includes(30) && SCENARIOS_2154_X41.some(entry => entry.point === '#2154.19')

/** Les parcours qui rendent évaluables ces deux conditions — lus dans le registre, jamais déclarés ici. */
const PROFIL_IMPORTE_PARCOURS_COUVERTS = goldenJourneysCovered([1, 2, 3, 4, 39])
const MATCHING_PARCOURS_COUVERTS = goldenJourneysCovered([12, 13])

/**
 * #2958.105 — les routes migrées pour lesquelles Laura REVENDIQUE un
 * préremplissage (`DEEP_LINK_SCREENS`, `chat_tools.py`) avec des paramètres
 * NON VIDES. `route-migration-2208-conditions.test.ts` relit le fichier réel :
 * un paramètre retiré côté Python, ou une route renommée, fait échouer le
 * test — ce n'est jamais une affirmation recopiée à la main.
 *
 * `/actions/sequences` (clé `sequences`) n'y figure PAS : son entrée existe
 * dans `chat_tools.py` mais avec `params: ()` — décision #1933.6 déjà
 * tranchée (un lien générique « ouvre Séquences » n'a pas d'audience réelle à
 * transmettre ; `prepare_campaign` ouvre l'écran déjà rempli par un AUTRE
 * chemin). Absence VOULUE, pas un oubli de cette liste.
 *
 * Les dix-sept autres routes migrées n'ont aucune entrée dans
 * `DEEP_LINK_SCREENS` : Laura n'y revendique aucun préremplissage — ce fichier
 * ne tranche pas si c'est un manque produit ou un non-besoin, il nomme
 * seulement qu'aucune preuve n'existe pour elles.
 */
export const MIGRATED_ROUTES_CLAIMING_PREFILL = [
  { key: 'contacts', deepLinkRoute: '/contacts' },
  { key: 'vivier', deepLinkRoute: '/consultants' },
  { key: 'projets', deepLinkRoute: '/projects' },
] as const satisfies readonly { key: RouteMigrationKey; deepLinkRoute: string }[]

export const NO_GO_2208_CONDITIONS: readonly NoGo2208Condition[] = [
  {
    key: 'profil_importe_inutilisable',
    sourceIssue: '#2958.94',
    label: 'un profil importé est inutilisable',
    status: PROFIL_IMPORTE_PARCOURS_COUVERTS ? 'clear' : 'not_yet_evaluable',
    evidence: PROFIL_IMPORTE_PARCOURS_COUVERTS
      ? "Évaluable depuis le lot X40 (02/10) : les parcours 1 à 4 et 39 (import de 800 CV, fiches créées sans saisie, exceptions isolées pour revue, 1 000 contacts et 7 besoins, reprise d'un import interrompu) ont chacun leur spec dans golden-journeys.ts — un profil importé s'ouvre dans le Vivier, une exception se traite depuis son compte réel, une reprise rouvre SA session. Calculé contre le registre, jamais déclaré. Portée : l'écran et ce qui part au serveur (API simulée) ; « utilisable » sur données réelles reste la recette recruteur."
      : "Au moins un des parcours d'import (1 à 4, 39) n'a plus de spec dans golden-journeys.ts — non évaluable tant qu'il manque.",
  },
  {
    key: 'cta_sans_effet',
    sourceIssue: '#2958.96',
    label: 'un CTA ne mène à rien',
    status: 'not_yet_evaluable',
    evidence:
      "`friction()` (product-analytics-read.service.ts:1179) le dit lui-même : « aucune coordonnée de clic n'entre ici, et il n'y en a pas à exclure : le traceur n'en émet structurellement aucune (#1682, union fermée gardée par GA-264). Ce tableau n'est donc pas un rage-click au sens du marché. » Un CTA sans effet, au sens produit de #2208.96, n'a donc aucune mesure possible avec l'instrumentation actuelle — distinct de #2958.88 (même gap, vocabulaire #2154).",
  },
  {
    key: 'matching_opaque',
    sourceIssue: '#2958.97',
    label: 'le matching est opaque (aucune justification du score)',
    status: MATCHING_PARCOURS_COUVERTS ? 'clear' : 'not_yet_evaluable',
    evidence: MATCHING_PARCOURS_COUVERTS
      ? "Évaluable depuis le lot X40 (02/10) : les parcours 12 (lancer le matching) et 13 (comparer les profils) ont leur spec dans golden-journeys.ts — le score s'affiche avec sa correspondance, l'axe non évaluable NOMMÉ (« Non évaluable ici : Langue »), et la comparaison met côte à côte preuves, écarts, risques et conditions, « non renseignées » quand la donnée manque. Calculé contre le registre. Portée : l'écran sur un classement simulé ; la justesse du classement réel reste la recette recruteur."
      : "Au moins un des parcours de matching (12, 13) n'a plus de spec dans golden-journeys.ts — non évaluable tant qu'il manque.",
  },
  {
    key: 'message_generique',
    sourceIssue: '#2958.98',
    label: 'un message préparé reste générique (non personnalisé)',
    status: 'not_yet_evaluable',
    evidence:
      "Le CORPS des messages ne sort jamais vers un humain ni vers le modèle (stocké au journal, jamais exposé, doctrine). #2958.98 (DEC-4036 Q5, Louis 19/10/2026, `c123_rejeu_eval_corps_compte_louis`) : exception NOMMÉE — le rejeu d'évaluation peut verser, anonymisé, le corps des messages du seul compte de Louis (`EVAL_MESSAGE_BODY_USER_ID`). Reste non évaluable tant que le juge de généricité qui lirait ces échantillons n'est pas écrit.",
  },
  {
    key: 'sequence_impossible_inspecter',
    sourceIssue: '#2958.99',
    label: 'une séquence de relance est impossible à inspecter avant envoi',
    status: SEQUENCE_INSPECTABLE ? 'clear' : 'not_yet_evaluable',
    evidence: SEQUENCE_INSPECTABLE
      ? "Évaluable depuis les lots X41 (02/10) et E02 (04/10) : le scénario #2154.19 (scenario-2154-19-sequence.spec.ts) prouve que la fenêtre dit « rien n'est envoyé automatiquement », nomme les cadences avec leurs touches et leur durée, et n'envoie qu'après le clic ; le parcours 30 (golden-journey-30-valider-messages.spec.ts) prouve la version du message affichée avant validation, sans envoi ; le parcours 29 (golden-journey-29-sequence-depuis-cible.spec.ts) prouve que l'audience d'une cible est lue et ses exclus nommés avant toute création. Calculé contre les registres. Portée : l'écran sur API simulée."
      : "Le parcours 30 ou le scénario #2154.19 n'a plus de spec dans golden-journeys-x41.ts — non évaluable tant qu'il manque.",
  },
  {
    key: 'mission_dupliquee',
    sourceIssue: '#2958.100',
    label: 'une mission se crée en double',
    status: 'clear',
    evidence:
      "Un projet n'a qu'UNE mission, tenu à trois niveaux : `delivery.service.ts` `create()` rend la mission EXISTANTE au lieu d'en écrire une seconde (BEL-FIX-001, #2958.51), `delivery.service.spec.ts` rejoue la répétition (« L'idempotence de la conversion projet → mission »), et l'index unique `missions_opportunity_uniq` (migration 1790140000001-MissionOpportunityUnique.ts) refuse le doublon en base même si le code était contourné. Les trois fichiers sont relus par route-migration-2208-conditions.test.ts. Portée : un projet gagné ; deux missions volontaires sur un même compte restent permises.",
  },
  {
    key: 'route_cassee',
    sourceIssue: '#2958.103',
    label: 'une ancienne route casse',
    status: routeCasseeVerifiee() ? 'clear' : 'blocked',
    evidence: routeCasseeVerifiee()
      ? `Calculé, pas déclaré : les ${redirectedRoutes().length} routes \`redirected\` du registre (route-migration-registry.ts, #2154.3/#2208) portent CHACUNE un \`holderFile\` prouvé par route-migration-registry.test.ts, et chacune a son scénario dans legacy-addresses.test.ts (#2958.71, 8/8). Distinct de \`route_partagee_casse\` (#2154.31, vocabulaire différent, pas fusionné) : cette condition porte spécifiquement sur les routes DE CE REGISTRE, pas sur une route partagée quelconque du produit.`
      : "Au moins une route `redirected` du registre n'a pas de `holderFile` prouvé — recalculer avant de livrer.",
  },
  {
    key: 'page_vide_sans_porte_sortie',
    sourceIssue: '#2958.104',
    label: 'une page migrée est vide sans porte de sortie',
    // #2958.104 (lot M12, 09/10) — calculé contre `route-migration-empty-states.ts`
    // (les 21 routes), dont chaque marqueur est RELU par la garde web
    // `une-page-migree-vide-a-une-porte-de-sortie.test.ts`.
    status: uncoveredEmptyStateRouteKeys().length === 0 ? 'clear' : 'not_yet_evaluable',
    evidence:
      uncoveredEmptyStateRouteKeys().length === 0
        ? `Calculé, pas déclaré : les ${ROUTE_EMPTY_STATES.length} routes du registre #2154.3/#2208 ont chacune leur entrée dans route-migration-empty-states.ts — la branche vide de l'écran de destination ET sa porte de sortie (lien, bouton, retrait de filtre), en extraits de code relus par la garde web une-page-migree-vide-a-une-porte-de-sortie.test.ts, qui échoue si une porte disparaît. ${ROUTE_EMPTY_STATES.filter(entry => entry.status === 'not_a_list').length} écran est un formulaire sans liste (Paramètres), vérifié sans « .length === 0 ». Quatre culs-de-sac trouvés et corrigés par le lot M12 : Chaînes (« aucun dossier suivi » → pipe des affaires), Intégrations (« aucun outil ne correspond » → effacer), Automatisations (cadence vide → toutes les routines), Vivier (recherche sans résultat → vider). Portée : le code de l'écran, pas une observation en production.`
        : `${uncoveredEmptyStateRouteKeys().length} route(s) du registre sans entrée dans route-migration-empty-states.ts : ${uncoveredEmptyStateRouteKeys().join(', ')}.`,
  },
  {
    key: 'laura_ecran_non_prerempli',
    sourceIssue: '#2958.105',
    label: 'Laura ouvre un écran sans le préremplir',
    status: 'clear',
    evidence:
      "`known-routes.ts::appRouteTarget()` (#1778/#1933) vérifie que la CIBLE existe, jamais qu'elle arrive préremplie — c'est `laura-deep-links.test.ts` qui ferme la boucle : pour CHAQUE entrée du catalogue réel (`DEEP_LINK_SCREENS`, chat_tools.py), chaque paramètre lu est DÉCLARÉ par `validateSearch` de la route ET LU par l'écran (test « chaque filtre du catalogue est DÉCLARÉ par la route et LU par l'écran »). `clear`, scopé aux TROIS routes migrées qui REVENDIQUENT un préremplissage avec des paramètres non vides — /contacts (`account_id`…, chat_tools.py:5387), /consultants (`q`/`new`/`name`/`importCv`, chat_tools.py:5406), /projects (`create`/`account_id`/`mission_id`, chat_tools.py:5482) — vérifiées par `route-migration-2208-conditions.test.ts` (`MIGRATED_ROUTES_CLAIMING_PREFILL`). /actions/sequences a `params: ()` VOULU (#1933.6) : pas un gap. Les 17 autres routes migrées n'ont AUCUNE entrée dans `DEEP_LINK_SCREENS` — Laura n'y revendique rien, donc rien à prouver ici pour elles ; ce n'est pas la même chose qu'un préremplissage prouvé sur les 21.",
  },
]

export const GO_2208_CONDITIONS: readonly Go2208Condition[] = [
  recetteCondition(
    'recette_antoine',
    '#2958.106',
    'recette Antoine',
    "Antoine (#2167.42/.43) part de l'annuaire vide, importe l'export de son CRM (927 contacts : simulation sans écriture, puis UN import), la restitution nomme des contacts et le mène à l'annuaire, relu avec ses contacts.",
    'Recette humaine — aucun test ne peut la signer à sa place.',
  ),
  recetteCondition(
    'recette_herve',
    '#2958.107',
    'recette Hervé',
    "Hervé, le persona non formé (#2115.48, #2155.29, #2436.13), part de l'accueil, ouvre « Opportunités », lit la définition de chaque mot que l'écran lui montre (Pipe, Pistes à qualifier, affaire), puis ouvre sa première affaire depuis le pipe vide : rien ne part tant que le formulaire est incomplet, UNE création part ensuite.",
    'Recette humaine — aucun test ne peut la signer à sa place.',
  ),
  recetteCondition(
    'recette_recruteur',
    '#2958.108',
    'recette recruteur',
    "Le recruteur part du Vivier, ouvre un profil IMPORTÉ (lisible sans ressaisie), valide sa disponibilité (UN appel, corps vide), puis « Où placer … » : le classement inversé part UNE fois sur la portée affichée, et chaque besoin classé se nomme avec ses deux scores, ses axes et l'axe non évaluable dit tel quel — même seul.",
    'Recette humaine — aucun test ne peut la signer à sa place.',
  ),
  recetteCondition(
    'recette_manager',
    '#2958.109',
    'recette manager',
    "Le manager part de l'accueil, ouvre Pilotage puis Équipe (`/team`, le cockpit visé par le tri du 17/09 : #2108.16-20 écarté, pas de persona `/briefing`), lit l'arbitrage « 1 compte n'a aucun responsable », « Les attribuer » ouvre la section qui porte la file, et UNE attribution part avec le compte et le commercial choisis ; le compte quitte la file.",
    'Recette humaine — aucun test ne peut la signer à sa place. Dépend en plus de l’arbitrage #2108.16-20, non tranché par ce lot.',
  ),
  {
    key: 'tests_e2e',
    sourceIssue: '#2958.110',
    label: 'tests E2E verts',
    // Les 40 parcours ont leur spec, mais « verts » est le verdict du job e2e de la CI, jamais celui d'un registre :
    // `unknown` tant qu'un parcours manque ou que la CI n'a pas tranché, jamais `met` déclaré ici.
    status: allCoveredJourneyNumbers().length === GOLDEN_JOURNEYS_TOTAL ? 'unknown' : 'not_met',
    humanOnly: false,
    evidence: `${allCoveredJourneyNumbers().length} des ${GOLDEN_JOURNEYS_TOTAL} Golden Journeys ont un spec dédié (golden-journeys.ts : ${coveredGoldenJourneyNumbers().length}, golden-journeys-x41.ts : ${GOLDEN_JOURNEYS_X41_TOTAL}, relus fichier par fichier par leurs tests) — specs Playwright sur API simulée (e2e/tests/web/) et legacy-addresses.test.ts pour les anciennes URLs.${allCoveredJourneyNumbers().length === GOLDEN_JOURNEYS_TOTAL ? ' Aucun parcours ne manque : « verts » reste le verdict du job e2e de la CI, que ce registre ne peut pas signer.' : ` Il en manque ${GOLDEN_JOURNEYS_TOTAL - allCoveredJourneyNumbers().length} — condition non remplie.`}`,
  },
  {
    key: 'captures_avant_apres',
    sourceIssue: '#2958.111',
    label: 'captures desktop/mobile avant/après',
    // #2958.111 (lot ROUTES, 12/10 soir) — les captures « après » sont produites
    // par un spec à chaque run e2e (jointes au rapport Playwright) ; le verdict
    // « vert » reste celui du job e2e de la CI, jamais déclaré `met` ici.
    status: 'unknown',
    humanOnly: false,
    evidence: `Spec ${CAPTURES_ROUTES_SPEC} : chacune des ${ROUTE_MIGRATION_REGISTRY.length} routes du registre est ouverte à 1280 px (desktop) et 375 px (mobile), sans débordement horizontal, et capturée (jointe au rapport Playwright de la CI, un jeu par run). Les captures « avant » n'existent nulle part : l'ancien état n'est pas reconstituable, il n'est pas inventé. Le verdict « vert » reste celui du job e2e de la CI.`,
  },
  {
    key: 'chaine_complete_sans_apprentissage',
    sourceIssue: '#2958.112',
    label: "la chaîne complète avance sans compréhension préalable de l'utilisateur",
    // #2958.112 (lot M12, 09/10) — le scénario existe ; « avance » reste le
    // verdict du job e2e de la CI, jamais déclaré `met` ici (même règle que `tests_e2e`).
    status: 'unknown',
    humanOnly: false,
    evidence: `Scénario ${CHAINE_SANS_APPRENTISSAGE_SPEC} : une seule URL d'entrée (la liste des besoins), puis besoin → consultant → rapprochement → positionnement → affaire → entretien → négociation → signature en ne cliquant que ce que chaque écran DÉSIGNE (porte expliquée, panneau « geste suivant », action principale du dossier qui change avec l'étape), chaque écriture annoncée avant de partir. Le nombre d'URL tapées est compté par route-migration-2208-conditions.test.ts. Le verdict « vert » reste celui du job e2e de la CI ; distinct de \`laura_parcours_sans_apprentissage\` (#2154.32), qui porte sur Laura.`,
  },
]

/** GO seulement si aucune condition NO-GO propre à #2208 n'est `blocked` ET
 *  que chaque condition GO propre à #2208 est `met`. */
export function canGo2208(): boolean {
  const noBlocker = NO_GO_2208_CONDITIONS.every(condition => condition.status !== 'blocked')
  const allMet = GO_2208_CONDITIONS.every(condition => condition.status === 'met')
  return noBlocker && allMet
}
