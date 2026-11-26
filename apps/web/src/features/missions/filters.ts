import {
  missionRiskSeverity,
  type ContractKind,
  type MissionChannel,
  type MissionRiskSeverity,
  type MissionStatus,
  type RenewalWindow,
} from '@bellum/contracts'
import { assigneeNames, type MissionView } from './api'
import { availabilityBucket, availabilityFrom, isoDay } from './planning'

/**
 * CE QUI RESSERRE LA LISTE DES MISSIONS — une seule dérivation, deux lentilles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL N'EST PAS DANS L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq retours demandent la même chose sous cinq noms : une « synthèse
 * d'attention » cliquable (#1348), une recherche (#1358), trois filtres rapides
 * (#1359), quatre indicateurs cliquables (#1361) et une répartition dont chaque
 * segment filtre (#1368).
 *
 * Ce sont les MÊMES gestes : compter une population, la nommer, et n'afficher
 * qu'elle. Cinq implémentations en auraient fait cinq compteurs qui divergent
 * au premier changement de seuil — la loi « une dérivation vit à un seul
 * endroit » (GA-26), déjà payée sur l'échéance de mission le 03/09.
 *
 * Écrit ICI et pas dans l'écran pour une seconde raison : ça se teste sans
 * monter un DOM, donc les seuils sont vérifiés plutôt que relus.
 *
 * ⚠️ Le filtre est CLIENT, et il a le droit de l'être ici — contrairement au
 * lien de source (`accountId`, `consultantId`), qui part au serveur parce que
 * `GET /delivery/missions` plafonne à 200 lignes. Ces facettes-ci ne resserrent
 * que ce que l'écran a DÉJÀ reçu, et leurs compteurs comptent exactement la
 * même chose : la liste affichée. Une pastille qui annoncerait « 12 » au-dessus
 * d'un plafond de 200 mentirait sur son dénominateur.
 *
 * ⚠️ #2408.39, .40, .51 — BU, entité juridique, satisfaction N'ONT PAS de
 * filtre ici, et ce n'est pas un oubli : la raison de chacun (champ absent
 * de `MissionView`, ou résolution de nom manquante) est écrite UNE fois,
 * dans `columns.ts` — la même colonne manquante explique le même filtre
 * manquant, et dupliquer la raison ici romprait GA-26 au premier des deux
 * textes qu'on oublierait de mettre à jour. #2408.52 (partenaire) et #2408.53
 * (devise) ONT désormais leur filtre (`channelCounts`, `currencyCounts`
 * ci-dessous) — cette liste rétrécit avec eux.
 */

/**
 * Les fenêtres qui appellent une relance MAINTENANT — l'ordre est celui de l'urgence.
 *
 * ⚠️ #2195.5 — `j15` y est entrée EN MÊME TEMPS qu'elle est née. Sans elle, la
 * facette « À renouveler » de « En cours » aurait PERDU toutes les missions à
 * 11-15 jours, qui y figuraient la veille sous `j30` : la population affichée
 * aurait rétréci sans qu'aucun seuil ne bouge. Découper une fenêtre ne change
 * jamais qui est dedans.
 *
 * ⚠️ #2192.10 — `j45` y entre à son tour. L'issue #2192 demande un résumé
 * « Fin sous 45 jours » : c'est la MÊME population que « à renouveler »,
 * juste jusqu'à un seuil plus large — pas une sixième facette (même règle de
 * consolidation que la marge non mesurable ci-dessous, loi 4 du tome 7).
 * Avant ce point, la fenêtre s'arrêtait à J-30 : une mission à J-40 ne
 * remontait dans AUCUNE des trois facettes de cet écran.
 */
const TO_RENEW_WINDOWS: readonly RenewalWindow[] = ['overdue', 'imminent', 'j15', 'j30', 'j45']

/**
 * Les trois facettes de « En cours » (#1348, #1359).
 *
 * ⚠️ #1348 demandait « 1 renouvellement à engager · 3 missions sans date de
 * fin · 1 marge non mesurable » et #1359 « À renouveler · Sans date de fin ·
 * Avec risque ». Ce sont les mêmes populations à un mot près : la marge non
 * mesurable EST un risque nommé (`margin_unknown`), déjà compté par la
 * troisième. Les rendre toutes les deux aurait affiché deux fois le même objet
 * sous deux formes — la loi 4 du tome 7.
 *
 * ⚠️ #2408.60 — `consultantsSoonAvailable` REJOINT les trois EN PLUS, une
 * QUATRIÈME population, pas un synonyme : `toRenew` compte toute mission qui
 * APPROCHE une décision de renouvellement, CERTITUDE comprise ou pas — une
 * mission « à renouveler » peut très bien être reconduite, auquel cas son
 * consultant ne se libère jamais. Celle-ci ne compte QUE les missions dont la
 * fin CONFIRMÉE (`missionAvailabilityCertainty`, #2410.60 — fin déjà signée
 * ou repositionnement lancé, jamais une reconduction seulement annoncée) tombe
 * dans les {@link SOON_WINDOW_DAYS} jours — la même dérivation, éprouvée sur
 * `/missions/planning` (`availabilityFrom`/`availabilityBucket`,
 * `planning.ts`), rejouée ici sur le MÊME champ de la MÊME lentille, jamais
 * une jointure vers une autre route.
 */
export const MISSION_FACETS = ['toRenew', 'noEndDate', 'withRisk', 'marginAtRisk', 'consultantsSoonAvailable'] as const
export type MissionFacet = (typeof MISSION_FACETS)[number]

/**
 * Est-ce que cette mission tombe dans cette facette ?
 *
 * `today` ne sert qu'à `consultantsSoonAvailable` (#2408.60) — les autres
 * facettes lisent des champs déjà calculés côté serveur (`renewal`, `risks`)
 * et n'ont jamais besoin de l'horloge du lecteur. Par défaut, l'HORLOGE
 * RÉELLE (`isoDay(new Date())`) ; les tests passent une date FIGÉE.
 */
export function matchesFacet(mission: MissionView, facet: MissionFacet, today: string = isoDay(new Date())): boolean {
  switch (facet) {
    case 'toRenew':
      return TO_RENEW_WINDOWS.includes(mission.renewal ?? 'unknown')
    case 'noEndDate':
      // La FENÊTRE, et pas `ends_on == null` : c'est `daysUntilEnd` qui décide,
      // et une date illisible est aussi une date qu'on n'a pas. Deux prédicats
      // pour la même question divergeraient au premier format exotique.
      return (mission.renewal ?? 'unknown') === 'unknown'
    case 'consultantsSoonAvailable': {
      // `undefined`/`null`/`[]` disent tous « personne à libérer d'ici » —
      // même garde que `withRisk` juste en dessous : un silence n'est jamais
      // promu « oui ».
      if ((mission.assignees ?? []).length === 0) return false
      const bucket = availabilityBucket(availabilityFrom(mission.ends_on, today, mission.renewal_status), today)
      return bucket === 'now' || bucket === 'soon'
    }
    case 'withRisk':
      // `undefined` n'est PAS « aucun risque » : le champ absent veut dire que
      // le serveur ne l'a pas renvoyé. Conclure « rien à signaler » d'un
      // silence est une cause racine du dépôt — la mission sort de la facette
      // sans être comptée comme saine.
      return (mission.risks ?? []).length > 0
    case 'marginAtRisk':
      /**
       * #2408.49 — LA MARGE SEULE, isolée de `withRisk` qui mélange les six
       * types de risque. `margin_at_risk` (marge négative ou nulle) SEUL —
       * jamais `margin_unknown` (marge non mesurable), une question
       * différente. Le serveur retire déjà les deux du tableau sans
       * `finance:read` (`MARGIN_RISKS`, `delivery.service.ts`) : la
       * VISIBILITÉ de ce filtre suit `canReadFinance` côté écran
       * (`MissionsToolbar`), ce prédicat lit juste ce qui lui arrive.
       */
      return (mission.risks ?? []).includes('margin_at_risk')
  }
}

/**
 * Ce sur quoi la recherche porte — « une mission, un compte ou un consultant »
 * (#1358, #1368), et rien d'autre.
 *
 * ⚠️ `assigneeNames` et jamais `...(mission.assignees ?? [])` : depuis #1350 le
 * champ porte des objets, et l'étalement y injecterait « [object Object] ».
 *
 * ⚠️ #2192.37 — `ownerName` y entre. L'issue demande un filtre « Owner » : une
 * liste déroulante dupliquerait le mécanisme qui filtre déjà « Compte » et
 * « Consultant » sur ce même écran, pour la même sorte de donnée (un nom de
 * personne, non fermé) — loi 4 du tome 7. Le porteur est déjà résolu côté
 * serveur (`ownerName`, #2195.13) ; il ne manquait qu'au foin.
 */
function haystack(mission: MissionView): string {
  return [mission.label, mission.accountName, mission.role_title, mission.ownerName, ...assigneeNames(mission)]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
}

/** Sans accents ni casse : « Kaczmarek » se trouve en tapant « kaczmarek ». */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function matchesQuery(mission: MissionView, query: string): boolean {
  const needle = fold(query.trim())
  if (needle.length === 0) return true
  return fold(haystack(mission)).includes(needle)
}

/**
 * La liste resserrée.
 *
 * Les facettes se CUMULENT en ET : « à renouveler » et « avec risque » cochées
 * ensemble donnent les missions qui portent les deux, ce qui est la file de
 * travail la plus courte — donc celle qu'on ouvre en premier. Un OU aurait
 * rendu la liste plus longue à chaque clic, l'inverse de ce qu'on demande à un
 * filtre.
 */
export function filterMissions(
  missions: readonly MissionView[],
  { query, facets }: { query: string; facets: readonly MissionFacet[] },
  today: string = isoDay(new Date()),
): MissionView[] {
  return missions.filter(
    mission => matchesQuery(mission, query) && facets.every(facet => matchesFacet(mission, facet, today)),
  )
}

/**
 * Combien de missions chaque facette retiendrait, la RECHERCHE déjà appliquée.
 *
 * ⚠️ Le compte se fait sur la liste filtrée par la recherche mais PAS par les
 * autres facettes. Sinon cocher « Sans date de fin » ferait tomber « Avec
 * risque » à zéro alors que trois missions y répondent : une pastille à « 0 »
 * qu'un clic remplit se lit comme une panne.
 *
 * `today` même raison que sur {@link matchesFacet} : un défaut sur l'horloge
 * réelle, une date FIGÉE dans les tests.
 */
export function facetCounts(
  missions: readonly MissionView[],
  query: string,
  today: string = isoDay(new Date()),
): Record<MissionFacet, number> {
  const searched = missions.filter(mission => matchesQuery(mission, query))
  return {
    toRenew: searched.filter(mission => matchesFacet(mission, 'toRenew', today)).length,
    noEndDate: searched.filter(mission => matchesFacet(mission, 'noEndDate', today)).length,
    withRisk: searched.filter(mission => matchesFacet(mission, 'withRisk', today)).length,
    marginAtRisk: searched.filter(mission => matchesFacet(mission, 'marginAtRisk', today)).length,
    consultantsSoonAvailable: searched.filter(mission => matchesFacet(mission, 'consultantsSoonAvailable', today))
      .length,
  }
}

/**
 * #2407.5 — COMBIEN DE MISSIONS PORTENT CHAQUE STATUT, la RECHERCHE appliquée.
 *
 * ⚠️ Contrairement à `renewalCounts`, la Map n'est PAS pré-remplie à zéro : un
 * statut qu'aucune mission ne porte reste ABSENT de la Map plutôt que d'y
 * valoir 0. C'est ce qui permet à l'appelant (`FilterChips`, dont `count:
 * undefined` n'affiche aucun chiffre) de proposer les 14 statuts de la
 * machine sans jamais peindre un « 0 » sur ceux qu'aucune mission ne porte —
 * une absence n'affiche jamais 0 (GA-18/19). `renewalCounts` mesure une
 * fenêtre TOUJOURS calculable pour chaque mission (même `unknown` compte) ;
 * un statut, lui, peut être absent de tout le parc — ce sont deux questions
 * différentes.
 */
export function statusCounts(missions: readonly MissionView[], query: string): Map<MissionStatus, number> {
  const counts = new Map<MissionStatus, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const status = mission.status as MissionStatus
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.43 — COMBIEN DE MISSIONS PORTENT CHAQUE NATURE DE CONTRAT, la
 * RECHERCHE appliquée. Même patron que `statusCounts` juste au-dessus, et la
 * même raison : `contract_kind` porte QUATRE valeurs fermées (régie, forfait,
 * recrutement, inconnu) déjà affichées en colonne (`columns.ts`, clé
 * `contractKind`) mais jamais filtrables. La Map n'est PAS pré-remplie à
 * zéro — une nature qu'aucune mission ne porte reste ABSENTE plutôt que d'y
 * valoir 0 (GA-18/19), même règle que pour un statut.
 */
export function contractKindCounts(missions: readonly MissionView[], query: string): Map<ContractKind, number> {
  const counts = new Map<ContractKind, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const kind = mission.contract_kind as ContractKind
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.38 — COMBIEN DE MISSIONS PORTENT CHAQUE PORTEUR, la RECHERCHE
 * appliquée. Même patron que `statusCounts`/`contractKindCounts`, mais SANS
 * énumération fermée à parcourir : `ownerName` est un nom résolu côté
 * serveur (`DeliveryService.ownersOf`), pas une valeur de schéma. `null`
 * (aucun porteur, ou lecture illisible) ne pose AUCUNE clé — une absence
 * n'affiche jamais 0 (GA-18/19), et il n'y a pas de « non renseigné » à
 * inventer.
 */
export function ownerCounts(missions: readonly MissionView[], query: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const owner = mission.ownerName
    if (!owner) continue
    counts.set(owner, (counts.get(owner) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.41 — COMBIEN DE MISSIONS PORTENT CHAQUE COMPTE, la RECHERCHE
 * appliquée. Un SÉLECTEUR dédié, en plus de la recherche texte libre déjà là
 * (`haystack`, ci-dessus) : celle-ci demande de connaître l'orthographe
 * exacte, celui-là se parcourt. Même garde que `ownerCounts` : une clé
 * seulement pour les comptes RENSEIGNÉS.
 */
export function accountCounts(missions: readonly MissionView[], query: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const account = mission.accountName
    if (!account) continue
    counts.set(account, (counts.get(account) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.52, #2408.62 — COMBIEN DE MISSIONS PORTENT CHAQUE CANAL DE STAFFING
 * (direct / partenaire / sous-traitance / portage), la RECHERCHE appliquée.
 * Même patron qu'`ownerCounts`/`accountCounts` juste au-dessus : `channel`
 * est ABSENT sans `finance:read`, ou quand la mission n'a aucune ligne de
 * conditions commerciales — une clé seulement pour ce qui est CONNU, jamais
 * un « non renseigné » inventé (GA-18/19).
 */
export function channelCounts(missions: readonly MissionView[], query: string): Map<MissionChannel, number> {
  const counts = new Map<MissionChannel, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const channel = mission.channel
    if (!channel) continue
    counts.set(channel, (counts.get(channel) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.53 — COMBIEN DE MISSIONS PORTENT CHAQUE DEVISE, la RECHERCHE
 * appliquée. Même patron que `channelCounts` juste au-dessus, mais SANS
 * énumération fermée à parcourir (ISO 4217 est un ensemble OUVERT, comme
 * `ownerCounts`/`accountCounts`) : les options du filtre sont celles
 * RENCONTRÉES, pas un référentiel de devises. `!currency` exclut à la fois
 * `undefined` (sans `finance:read`, ou aucune ligne de conditions
 * commerciales) et `null` (ligne lue, devise non renseignée) — les deux sont
 * une absence, jamais un « EUR » deviné (GA-18/19).
 */
export function currencyCounts(missions: readonly MissionView[], query: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const currency = mission.currency
    if (!currency) continue
    counts.set(currency, (counts.get(currency) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.39, #2408.40 — COMBIEN DE MISSIONS PORTENT CHAQUE BU / AGENCE, la
 * RECHERCHE appliquée. Même patron que `currencyCounts` (ensemble OUVERT, les
 * options sont celles RENCONTRÉES). La BU est celle du COMPTE porteur, résolue
 * serveur (`MissionView.businessUnitName`) : `undefined` (forme d'avant) et
 * `null` (compte sans BU déclarée) ne posent AUCUNE clé — une absence ne fait
 * pas de ligne, jamais une BU devinée (GA-18/19).
 */
export function businessUnitCounts(missions: readonly MissionView[], query: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const unit = mission.businessUnitName
    if (!unit) continue
    counts.set(unit, (counts.get(unit) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.42 — COMBIEN DE MISSIONS PORTENT CHAQUE CONSULTANT, la RECHERCHE
 * appliquée. Même raison que `accountCounts` juste au-dessus.
 *
 * ⚠️ Une mission peut porter PLUSIEURS affectés (`assigneeNames`) : chacun
 * compte pour lui-même, comme la recherche les traite déjà tous les deux.
 */
export function consultantCounts(missions: readonly MissionView[], query: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    for (const name of assigneeNames(mission)) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * LA RÉPARTITION DES ÉCHÉANCES — #1361, #1368.
 *
 * ⚠️ C'est la même chose que « 4 KPI cliquables » (#1361) et que la « mini
 * visualisation compacte de la répartition » (#1368) : cinq populations
 * disjointes, chacune nommée, chacune comptée, chacune cliquable. Les livrer en
 * trois objets — des cartes, des pastilles et des barres — aurait mis trois
 * fois le même chiffre sur le même écran.
 *
 * L'ordre est celui de l'urgence, `unknown` AVANT `far` : une mission sans date
 * de fin ne serait jamais relancée à temps, et l'enterrer en bas est ce qui la
 * fait rater. C'est le même rang que celui du tri de la liste.
 *
 * ⚠️ #2195.2 à #2195.7 — SEPT paliers depuis le 16/09/2026, pour les SIX
 * fenêtres que l'issue nomme. Le septième est `imminent` (≤ 10 jours), qui
 * existait avant J-15 et lui survit : les deux comptent des populations
 * disjointes, et la fondre aurait perdu l'urgence la plus courte.
 *
 * ⚠️ #2195.50 — HUIT paliers depuis le 20/09/2026 (décision de Louis) : `far`
 * REJOINT la liste, EN DERNIER — la lentille sert désormais `GET
 * /delivery/renewals` avec `includeFar: true` (`delivery.service.ts`), et une
 * fenêtre que le serveur envoie mérite sa pastille, même à zéro. `unknown`
 * reste AVANT elle : « Sans date de fin » appelle un geste (renseigner la
 * date), une échéance lointaine n'en appelle aucun — les reléguer dans le même
 * ordre inverserait exactement ce que #2195.50 corrige.
 *
 * ⚠️ Cet ordre n'est PAS celui de `RENEWAL_WINDOWS` dans le contrat : là-bas
 * les valeurs neuves sont ajoutées en FIN (GA-08, un enum n'insère jamais au
 * milieu). Ici, c'est l'urgence qui commande, et c'est le seul ordre affiché.
 */
export const RENEWAL_WINDOWS_IN_URGENCY_ORDER: readonly RenewalWindow[] = [
  'overdue',
  'imminent',
  'j15',
  'j30',
  'j45',
  'j60',
  'unknown',
  'far',
]

export function renewalCounts(missions: readonly MissionView[], query: string): Map<RenewalWindow, number> {
  const counts = new Map<RenewalWindow, number>()
  for (const window of RENEWAL_WINDOWS_IN_URGENCY_ORDER) counts.set(window, 0)
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const window = mission.renewal ?? 'unknown'
    // #2195.50 — `far` COMPTE désormais : la lentille des renouvellements sert
    // cette fenêtre, et un zéro compté ici est une fenêtre mesurée et vide, pas
    // une absence de donnée. `MissionsPage` (« En cours »), qui ne sert PAS
    // `far` côté serveur, ne rend pas cette pastille — elle n'appelle jamais
    // `renewalCounts`.
    if (counts.has(window)) counts.set(window, (counts.get(window) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.51 — LE FILTRE SATISFACTION (contrat Louis 31/10/2026).
 *
 * Trois niveaux DÉCLARÉS plus « non mesurée ». Un niveau retient la mission
 * dès qu'UN rail le porte — les deux rails restent séparés, jamais fondus en
 * un score (#2412.1). « Non mesurée » = la liste a LU la satisfaction et
 * aucun rail n'est déclaré ; une clé ABSENTE (API antérieure) n'entre dans
 * aucune population : un silence ne se range nulle part (GA-18/19).
 */
export const SATISFACTION_FILTER_VALUES = ['low', 'medium', 'high', 'unmeasured'] as const
export type SatisfactionFilterValue = (typeof SATISFACTION_FILTER_VALUES)[number]

function satisfactionBuckets(mission: MissionView): SatisfactionFilterValue[] {
  const satisfaction = mission.satisfaction
  if (!satisfaction) return []
  const levels = [satisfaction.client, satisfaction.consultant].filter(
    (level): level is NonNullable<typeof level> => level != null,
  )
  return levels.length === 0 ? ['unmeasured'] : [...new Set(levels)]
}

export function matchesSatisfaction(mission: MissionView, selected: readonly SatisfactionFilterValue[]): boolean {
  if (selected.length === 0) return true
  return satisfactionBuckets(mission).some(bucket => selected.includes(bucket))
}

export function satisfactionCounts(
  missions: readonly MissionView[],
  query: string,
): Map<SatisfactionFilterValue, number> {
  const counts = new Map<SatisfactionFilterValue, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    for (const bucket of satisfactionBuckets(mission)) counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.40 — LA SOCIÉTÉ JURIDIQUE (celle de l'ESN qui porte la mission),
 * résolue en nom côté serveur (`legalEntityName`). Même patron que
 * `businessUnitCounts` : seules les sociétés CONNUES sont proposées.
 */
export function legalEntityCounts(missions: readonly MissionView[], query: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const mission of missions) {
    if (!matchesQuery(mission, query)) continue
    const entity = mission.legalEntityName
    if (!entity) continue
    counts.set(entity, (counts.get(entity) ?? 0) + 1)
  }
  return counts
}

/**
 * #2408.54, .56, .57, .58, .59 — LES VUES PRÊTES (contrat Louis 31/10/2026).
 *
 * Une vue prête NOMME une population que la liste porte DÉJÀ — risques
 * calculés côté serveur (`missionRisks()`), badge de facturation
 * (`billingAlert`). Aucune ne recalcule rien (GA-26) ; « Mes vues »
 * (`SavedMissionViews`) reste le mécanisme des vues PERSONNELLES.
 *
 * Les trois vues FINANCIÈRES ne sont proposées qu'à qui a `finance:read`
 * ({@link presetViewsFor}) : sans ce droit, le serveur retire déjà les
 * risques et le badge qu'elles lisent — une vue toujours vide mentirait.
 */
export const MISSION_PRESET_VIEWS = [
  'thisWeek',
  'timesheetsMissing',
  'invoicesBlocked',
  'paymentsLate',
  'marginUnmeasured',
] as const
export type MissionPresetView = (typeof MISSION_PRESET_VIEWS)[number]

const FINANCE_PRESET_VIEWS: ReadonlySet<MissionPresetView> = new Set([
  'invoicesBlocked',
  'paymentsLate',
  'marginUnmeasured',
])

/** Les fenêtres qui tombent CETTE semaine ou sont déjà passées. */
const THIS_WEEK_WINDOWS: readonly RenewalWindow[] = ['overdue', 'imminent']

export function presetViewsFor(canReadFinance: boolean | undefined): MissionPresetView[] {
  return MISSION_PRESET_VIEWS.filter(view => canReadFinance === true || !FINANCE_PRESET_VIEWS.has(view))
}

export function matchesPresetView(mission: MissionView, view: MissionPresetView): boolean {
  const risks = mission.risks ?? []
  switch (view) {
    case 'thisWeek':
      // Une échéance dépassée ou sous dix jours, ou une exception déjà AVÉRÉE.
      return (
        THIS_WEEK_WINDOWS.includes(mission.renewal ?? 'unknown') ||
        risks.some(risk => missionRiskSeverity([risk]) === 'critical')
      )
    case 'timesheetsMissing':
      return risks.includes('timesheet_missing')
    case 'invoicesBlocked':
      return risks.includes('invoice_blocked')
    case 'paymentsLate':
      return mission.billingAlert === 'invoice_overdue' || mission.billingAlert === 'payment_late'
    case 'marginUnmeasured':
      return risks.includes('margin_unknown')
  }
}

/**
 * #2408 « tri par urgence » — à fenêtre égale, la mission qui porte
 * l'exception la plus grave passe devant. Le rang se DÉRIVE de
 * `missionRiskSeverity` (le PREMIER risque, déjà ordonné par `missionRisks()`),
 * jamais d'une seconde échelle (GA-26).
 */
const SEVERITY_URGENCY: readonly (MissionRiskSeverity | null)[] = ['critical', 'at_risk', 'unknown', 'watch']

export function exceptionUrgencyRank(mission: MissionView): number {
  const index = SEVERITY_URGENCY.indexOf(missionRiskSeverity(mission.risks ?? []))
  return index === -1 ? SEVERITY_URGENCY.length : index
}
