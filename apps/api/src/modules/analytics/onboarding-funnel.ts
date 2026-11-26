import { ecartEnMois, moisApres, moisDe, type EspaceInscrit, type MoisActif } from './retention-cohorts'

export type { EspaceInscrit, MoisActif }

/**
 * #1686 — L'ENTONNOIR D'ONBOARDING PAR COHORTE MENSUELLE D'ESPACES, en
 * fonctions pures.
 *
 * Lignes = mois d'inscription de l'espace (comme la rétention, #1658.1),
 * colonnes = les SEPT étapes de l'issue (#1686.5), toutes déjà émises ou déjà
 * lues ailleurs dans le dépôt — rien de neuf n'est ÉMIS ici, ce module ne fait
 * que LIRE et DÉCIDER :
 *  1. `onboarding_started` / `onboarding_completed` — `onboarding.service.ts`.
 *  2. `integration_connected` — `attio.service.ts` / `pipedrive.service.ts` / …
 *  3. `analysis_started` — `analysis.service.ts:1182` (le lancement, pas la
 *     fin — voir « ANALYSE LANCÉE, PAS TERMINÉE » plus bas).
 *  4. `premiere_action_validee` — `user_actions`, la même table que la
 *     rétention (#1658.1), MIN(created_at) par espace.
 *  5. `deuxieme_session` — `user_last_seen.previous_seen_at`, posé par le
 *     sign-in (module `auth`) : non NULL veut dire « au moins une session
 *     PRÉCÉDENTE existe ».
 *  6. `actif_j30` — réutilise `user_actions` ET le mécanisme de cohorte
 *     mensuelle de `retention-cohorts.ts` (voir « ACTIF À J+30 » plus bas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANALYSE LANCÉE, PAS TERMINÉE (#1686.5, correction de ce lot)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue nomme l'étape « 1ʳᵉ analyse LANCÉE ». La version livrée avant ce lot
 * mesurait `analysis_completed` (une analyse TERMINÉE) sous ce même libellé —
 * un libellé qui ne disait pas ce qu'il mesurait. Corrigé en changeant
 * l'ÉTAPE, pas le mot : `analysis_started` (`analysis.service.ts:1182`) est
 * déjà émis, déjà dans le vocabulaire `product_events`
 * (`product-analytics.service.ts:19`) et déjà lu ailleurs dans ce même module
 * (`team-kpis.service.ts`, `analytics-overview.service.ts`) — zéro
 * instrumentation neuve.
 *
 * `analysis_completed` ne DISPARAÎT pas du fichier : {@link ETAPE_PREMIERE_VALEUR}
 * (1686.4, délai médian jusqu'à la première VALEUR — pas jusqu'au premier
 * CLIC) continue de le lire. Les deux clés restent donc dans
 * {@link EtapeEntonnoirCle}, mais SEULE `analysis_started` est une colonne
 * affichée de {@link ETAPES_ENTONNOIR} — la différence entre « une action
 * posée » (l'étape) et « une valeur livrée » (le délai) est le point même que
 * #1686.5 demande de ne plus confondre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREMIÈRE ACTION VALIDÉE, SÉPARÉE DE L'ANALYSE (#1686.5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot, « première action validée » était CONFLATÉE avec
 * `analysis_completed` — la même colonne portait les deux sens. L'issue la
 * nomme comme le moment LE PLUS IMPORTANT de l'entonnoir, et une analyse
 * terminée n'est pas une action validée PAR UN HUMAIN : lancer une analyse est
 * un clic, valider une action (un message envoyé, une action de plan
 * terminée, un export — le même vocabulaire que `user_actions` pour la
 * rétention) suppose d'avoir déjà VU un dossier et d'avoir agi dessus.
 * `premiere_action_validee` lit donc `user_actions` (MIN(created_at) par
 * espace), pas `product_events`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUXIÈME SESSION (#1686.5)
 * ─────────────────────────────────────────────────────────────────────────────
 * `user_last_seen` (module `auth`, §8 du Journal d'activité) porte
 * `previous_seen_at` : NULL à la toute première visite, posé au sign-in
 * SUIVANT. Non-NULL veut donc dire, PAR CONSTRUCTION, « ce compte a eu au
 * moins une deuxième session » — c'est un SNAPSHOT (les deux instants les plus
 * RÉCENTS, pas un historique complet), donc `atteintLe` (= `last_seen_at`) est
 * la date de la session la PLUS RÉCENTE observée au moment de la lecture, pas
 * nécessairement la date exacte de la SECONDE session pour un compte qui s'est
 * reconnecté plusieurs fois depuis. Sans conséquence sur ce fichier : `atteintLe`
 * ne sert qu'à l'existence du franchissement pour cette étape (jamais au délai
 * de première valeur, réservé à {@link ETAPE_PREMIERE_VALEUR}).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACTIF À J+30 (#1686.5) — RÉUTILISE LA RÉTENTION, N'EN RÉÉCRIT PAS UNE SECONDE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Actif » reprend MOT POUR MOT la définition déjà tranchée par la rétention
 * (#1658.1, tête de `retention-cohorts.ts`) : au moins une ligne dans
 * `user_actions` — jamais une connexion. « J+30 » est ici le mois CALENDAIRE
 * M1 de la cohorte (celui qui suit le mois d'inscription), le même repère que
 * la case M1 de la grille `/retention` — pas une fenêtre glissante de 30 jours
 * exacts. ⚠️ Une AUTRE notion de « J+30 », plus littérale (30 jours glissants,
 * fenêtre de 7 jours, activité sur 14 jours) existe DÉJÀ dans
 * `manager-kpi.ts` (`COHORT_DAY_MARKS.activeCohort`) — mais elle mesure
 * PAR PERSONNE (`CohortMember.userId`), ce que la doctrine de CE fichier
 * interdit (« l'unité d'analyse est l'ESPACE, jamais quelqu'un », 1686.3). Les
 * deux « J+30 » du dépôt répondent donc à deux questions voisines mais
 * distinctes ; celui-ci reste au niveau ESPACE en réutilisant `retention-
 * cohorts.ts` plutôt que d'agréger le premier vers `workspace_id` — ce
 * dernier choix est resté hors du périmètre de ce lot (câblage, pas décision
 * produit) et est signalé au rapport.
 *
 * Techniquement, `actif_j30` N'EST PAS un {@link FranchissementEtape} comme
 * les six autres colonnes (« premier instant où X est arrivé, n'importe quel
 * mois ») : c'est « la cohorte a-t-elle été active PENDANT SON PROPRE mois M1,
 * et rien d'autre ». {@link construireEntonnoir} lui réserve donc une branche
 * dédiée, alimentée par `moisActifs` (le même type `MoisActif`, la même forme
 * de requête que `RetentionCohortsService.moisActifs`, dupliquée en SQL comme
 * `espacesInscrits()` l'est déjà entre les deux services — voir le docblock de
 * `onboarding-funnel.service.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS D'UNE CELLULE, ET ILS NE DISENT PAS LA MÊME CHOSE (1686.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * La question qui tranche chaque cellule, mot pour mot celle de la doctrine :
 * *si cette valeur est absente, « 0 » est-il VRAI ?*
 *
 *  · **Un franchissement réel existe** → `mesuree`, avec sa part réelle. Un
 *    SEUL espace qui a réussi suffit à savoir que l'étape est atteignable :
 *    ce signal ne se cache JAMAIS derrière « trop tôt », même dans la cohorte
 *    du mois en cours.
 *  · **Zéro franchissement, cohorte encore JEUNE** → `non_mesuree`. La
 *    cohorte n'a pas eu le temps matériel d'atteindre l'étape — le dire à 0 %
 *    mesurerait la vitesse du calendrier, pas le produit.
 *  · **Zéro franchissement, cohorte MÛRE** → `mesuree`, `part: 0`. C'est un
 *    vrai zéro, l'information que l'écran cherche justement à montrer.
 *
 * « Jeune » se mesure par ÉTAPE, pas globalement : `ETAPES_ENTONNOIR` porte un
 * délai de grâce par étape (`graceJours`), compté depuis la FIN du mois de la
 * cohorte (le dernier espace possible de la cohorte a pu s'inscrire jusqu'à la
 * dernière seconde du mois — mesurer depuis le DÉBUT du mois surestimerait le
 * temps dont dispose la moitié de la cohorte). Les délais eux-mêmes sont des
 * ordres de grandeur documentés, pas une mesure statistique du produit :
 *   · `onboarding_started` (2 j) — le questionnaire est proposé dès la
 *     première connexion ; ne pas l'avoir commencé sous 48 h est déjà un fait.
 *   · `onboarding_completed` (7 j) — délai raisonnable pour un questionnaire
 *     de douze questions.
 *   · `integration_connected` (14 j) — brancher un outil (CRM, boîte mail)
 *     est un geste secondaire, souvent différé après les premiers essais.
 *   · `analysis_started` (14 j) — hérité de l'ancienne `analysis_completed`
 *     qu'elle remplace comme colonne affichée (voir « ANALYSE LANCÉE, PAS
 *     TERMINÉE » plus haut) ; un lancement est plus RAPIDE à atteindre qu'une
 *     fin d'analyse, donc ce délai reste prudent (large), pas ajusté à la
 *     baisse sans mesure pour le justifier.
 *   · `premiere_action_validee` (21 j) — un cran au-delà de l'analyse : valider
 *     une action suppose d'avoir déjà vu un dossier ET d'avoir agi dessus,
 *     donc structurellement plus tardif que le lancement d'une analyse.
 *   · `deuxieme_session` (14 j) — même famille que `integration_connected` :
 *     un retour n'est pas immédiat, souvent différé après le premier essai.
 *   · `actif_j30` (31 j) — SEULE valeur qui n'est pas un ordre de grandeur :
 *     c'est le nombre de jours du plus long mois possible, pour que le délai
 *     de grâce couvre la totalité du mois M1 pour CHAQUE membre de la
 *     cohorte, quel que soit le jour de son inscription (voir « ACTIF À
 *     J+30 » plus haut).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NI ORDONNÉ NI CUMULATIF
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque colonne mesure une part INDÉPENDANTE de la cohorte
 * (`atteints / membres.length`), jamais « une part de ceux qui ont franchi la
 * colonne précédente ». Un espace peut apparaître dans `deuxieme_session` sans
 * apparaître dans `premiere_action_validee`, et réciproquement — l'ORDRE des
 * colonnes dans {@link ETAPES_ENTONNOIR} suit celui de l'issue (une lecture
 * naturelle du parcours), il ne prescrit ni séquence ni cumul. L'écran DOIT le
 * dire (voir `apps/dashboard-manager/src/app/produit/onboarding/page.tsx`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS DÉCIDÉ ICI (même partage que la rétention, #1658.1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le MASQUAGE des petites cohortes (1686.1, « aucune cohorte publiée sous 3
 * espaces ») vit à UN seul endroit, `COHORT_MIN_SPACES` dans
 * `apps/dashboard-manager/src/app/_components/charts.logic.ts` (#1643), et
 * c'est l'ÉCRAN qui l'applique. Ce module rend le compte d'espaces de chaque
 * cohorte pour que l'écran puisse décider ; le recopier ici en ferait deux
 * valeurs le jour où l'une change (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'UNITÉ D'ANALYSE EST L'ESPACE, JAMAIS LA PERSONNE (1686.3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ni {@link EspaceInscrit} ni {@link FranchissementEtape} ne portent
 * d'identifiant de PERSONNE — seulement des `workspaceId`. La résolution
 * « quel utilisateur a fait quoi » se fait en amont, côté service, et
 * n'atteint jamais ce fichier : c'est la doctrine `c64_analytique_produit`
 * (« cet écran est abandonné » se dit, « Sarah abandonne les écrans » ne se
 * dit pas) appliquée à la FORME des données, pas seulement à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉLAI DE PREMIÈRE VALEUR EST UNE MÉDIANE (1686.4)
 * ─────────────────────────────────────────────────────────────────────────────
 * De l'inscription de l'espace à son PREMIER `analysis_completed` — même
 * déclencheur que le complément de profil du Temps 2
 * (`OnboardingService.getComplementState`) : « une analyse TERMINÉE », parce
 * que c'est le moment où le commercial a VU un dossier, pas seulement rempli
 * un formulaire. Une MOYENNE se laisse tirer par un seul espace qui met trois
 * mois à s'y mettre ; la médiane, non — c'est la raison de l'issue, et le test
 * qui la couvre construit exactement ce cas.
 *
 * ⚠️ `maintenant` EST UN PARAMÈTRE, jamais `new Date()` — même règle que la
 * rétention : une dérivation qui lit l'horloge n'est pas testable sans la
 * figer, et diverge selon la machine qui l'exécute.
 */

/**
 * Les clés que ce fichier connaît. `analysis_completed` n'est PAS une colonne
 * affichée de {@link ETAPES_ENTONNOIR} (voir « ANALYSE LANCÉE, PAS TERMINÉE »
 * plus haut) — elle reste dans cette union parce que
 * {@link ETAPE_PREMIERE_VALEUR} la lit toujours pour le délai de #1686.4.
 * `actif_j30` n'est PAS un `event_name` de `product_events` non plus (voir
 * « ACTIF À J+30 » plus haut) : elle porte cette union pour rester une clé de
 * {@link EtapeCohorte} comme les six autres, pas parce qu'un `grep` sur elle
 * retrouverait un événement du même nom.
 */
export type EtapeEntonnoirCle =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'integration_connected'
  | 'analysis_started'
  | 'premiere_action_validee'
  | 'deuxieme_session'
  | 'actif_j30'
  | 'analysis_completed'

// Pas d'`export` sur `DefinitionEtape` / `EtapeCohorte` / `DelaiPremiereValeur` /
// `CohorteEntonnoir` ci-dessous : rien, hors ce fichier, ne les importe par
// leur nom — ils ne voyagent que comme la FORME de champs de
// {@link RapportEntonnoir}, qui lui EST exporté. Même règle que
// `CohorteRetention` dans `retention-cohorts.ts`, jamais exportée pour la même
// raison (règle du dépôt : ne jamais exporter un type consommé uniquement
// dans son propre fichier — `pnpm lint:exports:types`).
interface DefinitionEtape {
  cle: EtapeEntonnoirCle
  libelle: string
  /** Jours de grâce après la FIN du mois de la cohorte, voir le commentaire
   *  de tête pour la raison de chaque valeur. */
  graceJours: number
}

export const ETAPES_ENTONNOIR: readonly DefinitionEtape[] = [
  { cle: 'onboarding_started', libelle: 'Onboarding démarré', graceJours: 2 },
  { cle: 'onboarding_completed', libelle: 'Onboarding terminé', graceJours: 7 },
  { cle: 'integration_connected', libelle: 'Intégration connectée', graceJours: 14 },
  { cle: 'analysis_started', libelle: 'Première analyse lancée', graceJours: 14 },
  { cle: 'premiere_action_validee', libelle: 'Première action validée', graceJours: 21 },
  { cle: 'deuxieme_session', libelle: 'Deuxième session', graceJours: 14 },
  { cle: 'actif_j30', libelle: 'Actif un mois après l’inscription (J+30)', graceJours: 31 },
]

/** L'étape qui VAUT « première valeur » pour le délai de 1686.4 — voir le
 *  commentaire de tête du fichier pour le choix du déclencheur. */
const ETAPE_PREMIERE_VALEUR: EtapeEntonnoirCle = 'analysis_completed'

/**
 * #2085.23 — LA métrique PRINCIPALE de l'onboarding est la première ACTION
 * UTILE (`premiere_action_validee`), JAMAIS le taux de questionnaire terminé
 * (`onboarding_completed`).
 *
 * La raison : terminer un formulaire est un geste de SAISIE — il ne prouve
 * rien sur ce que le produit a livré, seulement que quelqu'un a cliqué
 * jusqu'au bout. Valider une action (§« PREMIÈRE ACTION VALIDÉE » en tête de
 * ce fichier) suppose d'avoir déjà VU un dossier ET d'avoir agi dessus —
 * c'est le premier instant où quelqu'un a REÇU quelque chose, pas seulement
 * rempli un champ. Un taux de complétion de questionnaire peut monter pendant
 * que personne n'active : c'est exactement ce que #2085 nomme « mesurer la
 * complétude de la saisie, pas la friction réelle ».
 *
 * Un seul endroit (GA-26, « un réglage vit à un seul endroit ») : un écran qui
 * voudrait mettre en avant UNE métrique « headline » lit CETTE constante, il
 * ne choisit pas la sienne — {@link PRIMARY_ONBOARDING_METRIC_LABEL} porte le
 * libellé qui va avec, pour la même raison.
 */
export const PRIMARY_ONBOARDING_METRIC: EtapeEntonnoirCle = 'premiere_action_validee'

/** Le libellé de {@link PRIMARY_ONBOARDING_METRIC} — recopié depuis
 *  {@link ETAPES_ENTONNOIR} plutôt que codé en dur une seconde fois, pour que
 *  les deux ne puissent pas diverger. */
export function primaryOnboardingMetricLabel(): string {
  return ETAPES_ENTONNOIR.find(etape => etape.cle === PRIMARY_ONBOARDING_METRIC)?.libelle ?? PRIMARY_ONBOARDING_METRIC
}

/**
 * Un espace a franchi une étape à un instant donné. Porte UNIQUEMENT
 * `workspaceId` — jamais un `userId` : voir « l'unité d'analyse » ci-dessus.
 * Si deux lignes existent pour le même (espace, étape) — deux membres qui
 * franchissent la même étape onboarding chacun de leur côté, par exemple —
 * seul le PLUS ANCIEN instant compte, comme pour toute mesure de « premier ».
 */
export interface FranchissementEtape {
  workspaceId: string
  etape: EtapeEntonnoirCle
  atteintLe: Date
}

interface EtapeCohorte {
  cle: EtapeEntonnoirCle
  /**
   * ⚠️ TROIS états, et le troisième a été trouvé EN RECETTE sur la production
   * du 09/09/2026 : la cohorte d'août affichait « Onboarding démarré **0 %** »
   * juste à côté de « Onboarding terminé **88 %** ». Quatre-vingt-huit pour
   * cent ne peuvent pas avoir TERMINÉ ce que zéro pour cent ont DÉMARRÉ.
   *
   * La cause n'est pas le calcul, elle est en amont : `onboarding_started`
   * n'est émis que sur la PREMIÈRE transition hors de `not_started`
   * (`onboarding.service.ts`), donc un espace arrivé par un autre chemin — ou
   * inscrit avant cette instrumentation — ne l'émet jamais. L'étape n'a pas
   * zéro franchissement : elle n'a **pas d'écrivain**.
   *
   * `non_instrumentee` sépare « personne ne l'a franchie » de « rien ne
   * l'écrit ». Sans elle, la seconde se lisait comme la première — et le pied
   * de l'écran, qui insiste sur « "trop tôt" n'est pas 0 % », faisait passer ce
   * zéro-là pour une mesure. C'est « non mesuré rendu 0 », la faute que ce
   * fichier existe pour éviter.
   */
  etat: 'mesuree' | 'non_mesuree' | 'non_instrumentee'
  /** Toujours le compte RÉEL, y compris quand `etat` n'est pas `mesuree` (il
   *  vaut alors 0 par construction — on ne marque « non mesurée » que
   *  l'absence totale de franchissement). */
  atteints: number
  /** `null` dès que `etat` n'est pas `mesuree`. Sinon 0 → 1. */
  part: number | null
}

interface DelaiPremiereValeur {
  /** Arrondi à 0,1 jour. `null` quand aucun espace de la cohorte n'a encore
   *  atteint {@link ETAPE_PREMIERE_VALEUR} — JAMAIS 0, qui dirait « immédiat ». */
  medianJours: number | null
  /** Combien d'espaces portent la mesure — le dénominateur de la médiane, pour
   *  qu'un écran puisse dire « médiane sur 2 espaces » plutôt que la taire. */
  echantillon: number
}

interface CohorteEntonnoir {
  /** `YYYY-MM` — le mois d'INSCRIPTION, jamais un mois d'activité. */
  cohorte: string
  /** Espaces inscrits ce mois-là. Le dénominateur de chaque étape, et ce qui
   *  décide du masquage CÔTÉ ÉCRAN (`COHORT_MIN_SPACES`, pas ici). */
  espaces: number
  /** Une entrée par étape de {@link ETAPES_ENTONNOIR}, dans le même ordre. */
  etapes: EtapeCohorte[]
  delaiPremiereValeur: DelaiPremiereValeur
}

export interface RapportEntonnoir {
  /** De la cohorte la plus ANCIENNE à la plus récente. */
  cohortes: CohorteEntonnoir[]
  /** Le catalogue des étapes, pour que l'écran puisse afficher les libellés
   *  sans les recopier. */
  etapes: readonly DefinitionEtape[]
  /** Espaces retenus dans le calcul — le total des dénominateurs. */
  espaces: number
  /** L'instant de la lecture, tel que le serveur l'a employé. */
  calculeA: string
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000

/** La médiane d'une liste de jours, arrondie à 0,1 jour. `null` sur une liste
 *  vide — jamais 0, qui dirait « immédiat » d'une absence de mesure. */
function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null
  const triees = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(triees.length / 2)
  const brut = triees.length % 2 === 0 ? (triees[milieu - 1]! + triees[milieu]!) / 2 : triees[milieu]!
  return Math.round(brut * 10) / 10
}

/**
 * La grille, à partir de ce que la base a mesuré.
 *
 * `espaces` porte le dénominateur de chaque cohorte ; `franchissements` porte
 * les numérateurs pour SIX des sept étapes, résolus CÔTÉ SERVICE (jointure
 * `workspace_members` pour celles qui ne portent que `userId`, lecture directe
 * pour celles qui portent déjà `workspace_id`). `moisActifs` porte le
 * numérateur de la SEPTIÈME (`actif_j30`), qui n'est pas un « premier instant »
 * mais « actif pendant le mois M1 de SA COHORTE » — voir « ACTIF À J+30 » en
 * tête de fichier. Cette fonction ne sait pas d'où vient chaque ligne, et n'a
 * pas besoin de le savoir.
 */
export function construireEntonnoir(entree: {
  espaces: readonly EspaceInscrit[]
  franchissements: readonly FranchissementEtape[]
  moisActifs: readonly MoisActif[]
  maintenant: Date
}): RapportEntonnoir {
  const { espaces, franchissements, moisActifs, maintenant } = entree
  const moisCourant = moisDe(maintenant)

  // Le PLUS ANCIEN franchissement par (espace, étape).
  const atteintParEspace = new Map<string, Map<EtapeEntonnoirCle, Date>>()
  for (const f of franchissements) {
    const parEtape = atteintParEspace.get(f.workspaceId) ?? new Map<EtapeEntonnoirCle, Date>()
    const existant = parEtape.get(f.etape)
    if (!existant || f.atteintLe < existant) parEtape.set(f.etape, f.atteintLe)
    atteintParEspace.set(f.workspaceId, parEtape)
  }

  // Les mois d'activité par espace — même construction que
  // `construireCohortes` dans `retention-cohorts.ts`, réemployée pour
  // `actif_j30` (voir « ACTIF À J+30 » en tête de fichier).
  const actifsParEspace = new Map<string, Set<string>>()
  for (const ligne of moisActifs) {
    const dejaVu = actifsParEspace.get(ligne.workspaceId) ?? new Set<string>()
    dejaVu.add(ligne.mois)
    actifsParEspace.set(ligne.workspaceId, dejaVu)
  }

  // Les espaces, par mois d'inscription.
  const parCohorte = new Map<string, EspaceInscrit[]>()
  for (const espace of espaces) {
    const cohorte = moisDe(espace.createdAt)
    // Un espace créé « dans le futur » (horloge décalée) n'a aucune cohorte à
    // rejoindre — même garde que la rétention (#1658.1).
    if (ecartEnMois(cohorte, moisCourant) < 0) continue
    const liste = parCohorte.get(cohorte) ?? []
    liste.push(espace)
    parCohorte.set(cohorte, liste)
  }

  // Une étape muette PENDANT QUE D'AUTRES PARLENT n'est pas une étape à zéro :
  // c'est une étape que rien n'écrit. Le corpus entier est le seul niveau où la
  // question se pose — par cohorte, un vrai zéro et une absence d'écrivain sont
  // indiscernables.
  //
  // ⚠️ LA CONDITION QUI REND LA RÈGLE JUSTE : il faut qu'AU MOINS UNE étape ait
  // été observée. Sur un corpus entièrement vide — une instance neuve, ou une
  // fixture de test — le silence ne prouve rien du tout, et marquer les sept
  // étapes « non instrumentées » avalerait les vrais zéros que ce fichier tient
  // depuis #1686.2. Première version de cette règle : elle les avalait, et
  // quatre tests l'ont dit.
  const etapesObservees = new Set<EtapeEntonnoirCle>()
  for (const etapes of atteintParEspace.values()) for (const cle of etapes.keys()) etapesObservees.add(cle)
  if ([...actifsParEspace.values()].some(mois => mois.size > 0)) etapesObservees.add('actif_j30')

  const jamaisFranchies = new Set<EtapeEntonnoirCle>(
    etapesObservees.size === 0 ? [] : ETAPES_ENTONNOIR.map(def => def.cle).filter(cle => !etapesObservees.has(cle)),
  )

  const cohortes: CohorteEntonnoir[] = [...parCohorte.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohorte, membres]) => {
      // Premier instant qui n'appartient PLUS au mois de la cohorte — le
      // dernier espace possible a pu s'y inscrire jusqu'à la dernière
      // seconde, donc la grâce se compte depuis LÀ, pas depuis le début.
      const finDuMois = new Date(`${moisApres(cohorte, 1)}-01T00:00:00.000Z`)
      // Le mois M1 de CETTE cohorte — le seul mois qui compte pour `actif_j30`.
      const moisM1 = moisApres(cohorte, 1)

      const etapes: EtapeCohorte[] = ETAPES_ENTONNOIR.map(def => {
        const atteints =
          def.cle === 'actif_j30'
            ? membres.filter(m => actifsParEspace.get(m.workspaceId)?.has(moisM1)).length
            : membres.filter(m => atteintParEspace.get(m.workspaceId)?.has(def.cle)).length

        if (atteints > 0) {
          return { cle: def.cle, etat: 'mesuree', atteints, part: atteints / membres.length }
        }

        // AVANT le délai de grâce : rien ne l'écrit, donc aucun délai ne rendra
        // ce zéro vrai. Attendre ne mesure que notre patience.
        if (jamaisFranchies.has(def.cle)) {
          return { cle: def.cle, etat: 'non_instrumentee', atteints: 0, part: null }
        }

        const matureLe = new Date(finDuMois.getTime() + def.graceJours * MS_PAR_JOUR)
        if (maintenant.getTime() >= matureLe.getTime()) {
          // La cohorte a eu le temps ; personne n'a franchi l'étape. Un vrai zéro.
          return { cle: def.cle, etat: 'mesuree', atteints: 0, part: 0 }
        }
        // Trop tôt pour savoir — surtout pas un zéro.
        return { cle: def.cle, etat: 'non_mesuree', atteints: 0, part: null }
      })

      const delaisJours = membres
        .map(m => {
          const atteint = atteintParEspace.get(m.workspaceId)?.get(ETAPE_PREMIERE_VALEUR)
          return atteint ? (atteint.getTime() - m.createdAt.getTime()) / MS_PAR_JOUR : null
        })
        .filter((v): v is number => v !== null)

      return {
        cohorte,
        espaces: membres.length,
        etapes,
        delaiPremiereValeur: { medianJours: mediane(delaisJours), echantillon: delaisJours.length },
      }
    })

  const retenus = [...parCohorte.values()].flat()
  return { cohortes, etapes: ETAPES_ENTONNOIR, espaces: retenus.length, calculeA: maintenant.toISOString() }
}
