import {
  summarizeRank2Observations,
  type EsnPresenceCertainty,
  type EsnRank2Observation,
  type EsnRank2ObservationSummary,
} from '@bellum/contracts'
import { marketMatchKey } from '../market-memory/market-company-key'

/**
 * Une ligne BRUTE de `account_partners`, telle que la lit `onMyAccounts` —
 * un rang par PRÉSENCE, pas encore agrégé.
 *
 * `certainty` est `readonly EsnPresenceCertainty | null | undefined` plutôt
 * que `readonly EsnPresenceCertainty | null` : une ligne lue par une requête
 * plus ancienne (fenêtre de déploiement) ne porte pas la colonne du tout —
 * `undefined`, pas `null`. Les deux se traitent pareil ici.
 */
export interface RawAccountPartnerRow {
  readonly name: string
  readonly account_id: string
  /**
   * #2151.62 — le nom du COMPTE (pas de l'ESN), lu par la même jointure que
   * `onMyAccounts` : une seule requête sert à la fois le nombre et la liste,
   * pour qu'un seul chemin de lecture (GA-26) alimente l'annuaire et la fiche
   * compte. `?:` pour la même raison que `certainty` : une ligne d'avant ce
   * lot (fenêtre de déploiement) n'a pas encore la colonne jointe.
   */
  readonly account_name?: string
  readonly rank: string
  readonly certainty?: EsnPresenceCertainty | string | null
  /**
   * #2151.33 — la relation de l'espace à cette présence (`partner` /
   * `competitor` / `unknown`). `?:` pour la même raison que `certainty` : une
   * ligne lue par une requête plus ancienne (fenêtre de déploiement) ne porte
   * pas la colonne du tout — traitée comme `unknown`, jamais comme connue.
   */
  readonly relationship?: string | null
  /**
   * #2298.8 — la date à laquelle CETTE présence a été détectée. `?:` pour la
   * même raison que `certainty`/`relationship` : une ligne d'avant ce lot (ou
   * saisie à la main, `account-partner.entity.ts`) ne la porte pas. Le pilote
   * pg rend un `Date` sur `timestamptz` ; une ligne construite à la main dans
   * un test peut aussi porter une chaîne ISO — les deux se traitent pareil
   * (voir `rank2ObservationDateOf`).
   */
  readonly detected_at?: string | Date | null
}

export interface EsnOnAccountsRow {
  readonly name: string
  readonly accounts: number
  readonly rank1: number
  /**
   * #2151.34 — combien de présences tiennent le rang 2 sur un compte de
   * l'espace. Une ouverture à formaliser, pas un rang 1 : compté à part,
   * jamais fondu dans `rank1` (« rang 1 » et « rang 2 » racontent deux
   * stratégies opposées, cf. `rank1Recommendation`).
   */
  readonly rank2: number
  /**
   * #2151.33 — combien de présences portent une relation CONNUE (`partner`
   * ou `competitor`, jamais `unknown`). GA-18/GA-19 : une présence dont
   * personne n'a encore dit ce qu'elle est pour nous ne compte pas ici — la
   * confondre avec une relation connue affirmerait un fait que personne n'a
   * posé.
   */
  readonly knownRelationship: number
  /**
   * #2151.32 — combien de comptes de l'espace où la MÉMOIRE MARCHÉ a observé
   * cette ESN (des parcours relient des personnes à cette société, corpus
   * `esn_clients`, même seuil que l'onglet Partenaires — voir
   * `MarketMemoryService.esnObservedFrom`). Toujours 0 en sortie de
   * `mergeEsnByMatchKey` : seul `attachObservedClients`, appelé APRÈS, le
   * porte à sa vraie valeur — cette fonction-ci n'a jamais accès à la mémoire
   * marché, seulement à `account_partners`.
   *
   * ⚠️ N'est PAS `accounts` (présence déclarée/détectée) : une ESN peut être
   * en place chez un client sans être observée par le corpus, et l'inverse.
   * Les deux se croisent, jamais l'un ne remplace l'autre — même famille que
   * `rank2`/`knownRelationship` ci-dessus.
   */
  readonly observedAtAccounts: number
  /**
   * #2151.32 — combien de comptes, PARMI CEUX QUI PORTENT CETTE ESN, n'ont pas
   * pu être résolus par la mémoire marché (compte non couvert, résolution en
   * échec ou ambiguë — voir `MarketMemoryService.coverageFor`). Doctrine c65 /
   * GA-259 : un compte NON RÉSOLU n'est jamais compté comme « non observé » —
   * il reste « inconnu », et l'écran le dit à côté du filtre plutôt que de le
   * fondre en silence dans le dénominateur du « non ».
   */
  readonly unresolvedAtAccounts: number
  /**
   * #2298.8 — rank2Potential : un CONSTAT « déjà vue en rang 2 », datable et
   * sourçable, JAMAIS un score (décision Louis 18/09/2026, voir le docblock
   * de `esnRank2ObservationSchema`). Calculé ICI, directement depuis les
   * lignes `account_partners` du groupe (`rank = 'rank2'` ET une date réelle)
   * — contrairement à `observedAtAccounts` ci-dessus, aucune jointure externe
   * n'est nécessaire : la date de détection voyage déjà sur la ligne brute.
   *
   * ⚠️ Distinct d'`observedAtAccounts` : celui-ci vient de la MÉMOIRE MARCHÉ
   * (un tiers a observé cette ESN chez un client, tous rangs confondus) ;
   * celui-ci vient du CRM DE CET ESPACE (cette ESN a été détectée agissant
   * SPÉCIFIQUEMENT en rang 2 sur un de ses comptes). Les deux peuvent
   * diverger sans se contredire — voir le test « LE PIÈGE » du fichier de
   * specs associé.
   *
   * Une présence rang 2 SANS `detected_at` (déclarée à la main, ou détectée
   * avant que la colonne existe) ne produit AUCUNE observation : une date
   * n'est jamais devinée, et une ligne qui n'a rien à prouver ne compte pas
   * (voir `summarizeRank2Observations`, `measured: false`).
   */
  readonly rank2Observations: EsnRank2ObservationSummary
  /**
   * #1799 — la certitude de la DÉTECTION, sortie du nom. `null` quand aucune
   * ligne du groupe ne la porte (déclarée à la main, ou détectée avant que
   * `certainty` n'existe) — jamais devinée depuis le nom ou un défaut.
   *
   * `.optional()` n'est pas nécessaire ici : le champ existe toujours en
   * sortie de `mergeEsnByMatchKey` (`null` au pire). Il reste néanmoins lu
   * comme optionnel côté web (`certainty?:`), pour qu'un ANCIEN payload —
   * avant ce lot — continue de s'afficher sans lui.
   */
  readonly certainty: EsnPresenceCertainty | null
  /**
   * #2151.62 — les comptes où l'espace a VU cette ESN, nommés, pas seulement
   * comptés. Triée par nom pour un rendu déterministe (l'ordre SQL des lignes
   * brutes n'est pas garanti). Une ligne sans nom de compte (fenêtre de
   * déploiement, voir `RawAccountPartnerRow.account_name`) porte une chaîne
   * vide plutôt qu'une valeur devinée.
   */
  readonly accountsList: ReadonlyArray<{ readonly id: string; readonly name: string }>
}

const CERTAINTY_RANK: Record<EsnPresenceCertainty, number> = { forte: 3, moyenne: 2, faible: 1 }

/** La plus forte des deux certitudes — jamais une moyenne, jamais devinée :
 *  si une SEULE détection du groupe a des preuves solides, c'est un fait sur
 *  le groupe entier, pas sur cette seule ligne. */
function strongerCertainty(
  a: EsnPresenceCertainty | null,
  b: EsnPresenceCertainty | null,
): EsnPresenceCertainty | null {
  if (!a) return b
  if (!b) return a
  return CERTAINTY_RANK[b] > CERTAINTY_RANK[a] ? b : a
}

function asCertainty(value: RawAccountPartnerRow['certainty']): EsnPresenceCertainty | null {
  return value === 'forte' || value === 'moyenne' || value === 'faible' ? value : null
}

/**
 * #2298.8 — une date ISO valide, ou `null` — jamais devinée.
 *
 * `detected_at` arrive en `Date` (pilote pg sur `timestamptz`) ou en chaîne
 * (ligne construite à la main dans un test, ou déjà sérialisée). `null` ou
 * `undefined` — la ligne n'a rien à prouver — et une chaîne illisible
 * rendent toutes deux `null` : même régime que `formatDate` côté web
 * (`apps/web/src/lib/locale.ts`), jamais une date de remplissage.
 */
function rank2ObservationDateOf(value: RawAccountPartnerRow['detected_at']): string | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * #1799 — un nom d'ESN est une société, pas une phrase.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MESURÉ EN PRODUCTION LE 09/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * `GET /api/partners/on-my-accounts`, espace de Louis, APRÈS le correctif
 * #1799.1 ci-dessous : 50 entrées, dont 34 n'étaient pas des entreprises.
 * Deux causes, toutes deux dans `comp.get("name")` côté producteur
 * (`apps/ia/app/services/esn_presence.py`, corrigé séparément) :
 *
 * 1. de la PROSE stockée comme un nom (« Aucun concurrent ESN identifié »,
 *    « ESN non identifiée ») — la phrase de repli d'un modèle sommé de
 *    produire un minimum d'entrées ;
 * 2. un degré de certitude collé DANS le nom (« Capgemini — probable »),
 *    alors que la colonne `certainty` de `account_partners` est SA place.
 *
 * Ce filtre est une DÉFENSE EN PROFONDEUR : il protège cet endpoint mesuré
 * contre les lignes DÉJÀ écrites en base par l'ancien pipeline (aucun
 * nettoyage destructif ici — les lignes restent en base, seul l'AFFICHAGE
 * change) et contre toute régression future du producteur. Structurel, pas
 * une liste de phrases françaises : une liste de phrases exactes serait
 * fausse en anglais et au prochain reformulement du modèle. Voir
 * `apps/ia/tests/test_esn_presence.py` pour le même filtre côté producteur.
 */
const CERTAINTY_PAREN_RE = /\s*\(\s*probable\b[^)]*\)\s*$/i
const CERTAINTY_SUFFIX_RE = /\s*[-–—]\s*probable\s*$/i
const CERTAINTY_PREFIX_RE = /^\s*probable\s*[:\-–—]\s*/i

/**
 * #1799 (second tour, 09/09/2026) — les trois formes que la première version
 * laissait passer, RELEVÉES à l'écran après le rattrapage en base :
 *
 *   « Capgemini probable »                         → le suffixe exigeait un TIRET
 *   « Airbus (client principal, probable partenaire IT) » → la parenthèse devait
 *                                                    COMMENCER par « probable »
 *   « Inetum | CGI | Devoteam »                    → le séparateur ne connaissait
 *                                                    que « / » entouré d'espaces
 *
 * Le principe ne change pas — structurel plutôt que lexical — mais il
 * s'applique désormais à la FORME du nom, pas à une position dans la chaîne.
 */

/** Un mot de certitude posé nu en fin de nom, sans ponctuation pour l'annoncer. */
const CERTAINTY_BARE_SUFFIX_RE = /\s+(probable|possible|supposée?|incertaine?|à\s+confirmer)\s*$/i

/**
 * Une parenthèse finale COURTE est un commentaire qu'on retire (« Acasi
 * (acquis juillet 2026) » désigne bien Acasi). Au-delà, ce n'est plus une
 * précision, c'est une phrase — et une phrase ne désigne pas une société :
 * la ligne entière est écartée par `isPlausibleEsnName`, jamais rabotée en un
 * nom qui aurait l'air juste. « Airbus (client principal, probable partenaire
 * IT) » deviendrait « Airbus », c'est-à-dire un CLIENT affiché comme une ESN
 * en place — silencieusement faux, donc pire que rien.
 */
const SHORT_PAREN_RE = /\s*\(([^)]{1,24})\)\s*$/
const ANY_PAREN_RE = /[()]/

/**
 * « / » ou « | », entourés d'espaces ou non : trois noms ne sont pas un nom.
 *
 * #1799 (troisième tour, 10/09/2026) — le docblock promettait déjà « entourés
 * d'espaces ou non », mais seule la branche `|` (`\s*\|\s*`) le tenait ; la
 * branche `/` exigeait les deux espaces (`\s\/\s`). Le code et le
 * commentaire se contredisaient, et c'est le code qui tournait : quatre
 * lignes RÉELLEMENT mesurées en production le prouvent (« Agences
 * web/e-commerce généralistes », « Éditeur/intégrateur ERP »…). Les deux
 * branches ont maintenant la même forme.
 */
const MULTI_ENTITY_RE = /\s*[/|]\s*/
/**
 * #1799 (troisième tour) — le trou PRINCIPAL, plus grave que la clause de
 * certitude de #1818 : une liste séparée par des virgules passait
 * intégralement le filtre. « Capgemini, Accenture, Sopra Steria, Atos » fait
 * 5 mots (sous `MAX_NAME_WORDS`), ne porte ni parenthèse ni négation — rien
 * ne la distinguait d'un vrai nom pour l'ancien filtre.
 *
 * MESURÉ EN PRODUCTION LE 10/09/2026 sur `GET /api/partners/on-my-accounts` :
 * six lignes de cette forme, dont CINQ contiennent Capgemini — qui porte
 * DÉJÀ sa propre ligne (détecté seul sur 20 comptes). « Pourquoi y a deux
 * fois Capgemini », six fois : le symptôme originel de #1799, jamais fermé
 * par le premier correctif.
 *
 * Structurel — n'importe quelle virgule, jamais une liste de noms français —
 * au même titre que `MULTI_ENTITY_RE` : une garde qui ne reconnaîtrait que
 * des exemples précis serait aveugle à la septième liste. Vérifié contre les
 * 477 raisons sociales du référentiel ESN du dépôt (`esn-seed-names.ts`) :
 * aucune n'en porte, donc aucune n'est perdue par cette règle — voir le
 * témoin à l'échelle dans `esn-on-accounts-merge.spec.ts`.
 */
const COMMA_LIST_RE = /,/
const NEGATION_RE = /\b(aucune?s?|non|inconnue?s?)\b/i
const MAX_NAME_WORDS = 6

/**
 * #1818 — un tiret suivi d'une CLAUSE, pas d'un mot, n'est pas une décoration.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MESURÉ À L'ÉCRAN LE 10/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * « EBTrans — ressources internes probables » a survécu au filtre : EBTrans
 * est un COMPTE de l'espace, pas une ESN, et la phrase entière dit le
 * CONTRAIRE d'une présence d'ESN. `CERTAINTY_SUFFIX_RE` / `CERTAINTY_BARE_SUFFIX_RE`
 * ne reconnaissent qu'un tiret suivi d'un SEUL mot de certitude (« —
 * probable ») — jamais une clause de plusieurs mots qui se termine par un mot
 * de certitude accordé au pluriel (« … probableS »).
 *
 * Même principe que la parenthèse longue (`SHORT_PAREN_RE` / `ANY_PAREN_RE`
 * ci-dessus) : une clause COURTE après le tiret — un seul mot — est une
 * décoration que `stripCertaintyDecoration` retire ; au-delà, c'est une
 * phrase, et une phrase ne désigne pas une société. La raboter donnerait
 * « EBTrans », c'est-à-dire un COMPTE affiché comme une ESN détectée chez
 * lui-même — silencieusement faux, donc pire que rien. La ligne entière est
 * écartée par `isPlausibleEsnName`, jamais rabotée.
 *
 * Structurel plutôt que lexical au même titre que le reste du fichier : le
 * vocabulaire de certitude (probable/possible/supposé/incertain/à confirmer)
 * est déjà celui du producteur (voir `apps/ia/app/services/esn_presence.py`),
 * pas une liste de mots français devinée ici. Le témoin de non-sur-attrapage
 * (« Business & Decision », « Accenture Technology Solutions », « Groupe
 * Onepoint », « Sopra Steria » — aucun ne porte de tiret) vit dans
 * `esn-on-accounts-merge.spec.ts`.
 */
const DASH_CERTAINTY_CLAUSE_RE =
  /[-–—]\s+\S+(?:\s+\S+)*\s+(?:probables?|possibles?|supposée?s?|incertaine?s?|à\s+confirmer)\s*$/i

/**
 * #1799 (quatrième tour, 10/09/2026) — deux formes de DESCRIPTION, mesurées
 * dix minutes après le correctif du troisième tour sur `GET
 * /api/partners/on-my-accounts` (50 lignes) : 18 % (9 lignes) étaient encore
 * des descriptions plutôt que des noms — ni virgule, ni « / », ni parenthèse,
 * ni négation, ni clause de certitude, et ≤ 6 mots, donc invisibles aux
 * règles précédentes.
 *
 * 1. « cabinet de conseil IT généraliste », « équipe ou partenaire interne
 *    Fnac Darty »… commencent par une MINUSCULE. Une raison sociale est un
 *    nom propre — mais UN SEUL mot stylisé en minuscules (« coconsult »,
 *    une vraie ESN du référentiel) n'est pas une phrase. La règle porte donc
 *    sur la PHRASE (minuscule ET plusieurs mots), jamais sur la casse d'un
 *    mot seul : `LOWERCASE_START_MULTIWORD_RE` exige un second mot après le
 *    premier caractère minuscule.
 * 2. « Agences digitales locales », « ESN locale Occitanie »… commencent par
 *    une MAJUSCULE mais par un nom de tête GÉNÉRIQUE — la catégorie d'une
 *    ESN, pas son nom. Lexical, contrairement au reste de ce fichier — mais
 *    pas un précédent : `CERTAINTY_BARE_SUFFIX_RE` et `NEGATION_RE`
 *    ci-dessus sont déjà des listes de mots.
 *
 * Vérifiées TOUTES LES DEUX contre les 477 raisons sociales du référentiel
 * ESN (`esn-seed-names.ts`) : aucune n'est écartée par l'une ou l'autre —
 * voir le témoin à l'échelle dans `esn-on-accounts-merge.spec.ts`. Sans ce
 * témoin, la liste de noms de tête resterait une opinion : « Groupe » aurait
 * pu y entrer par erreur (proche d'« ESN »/« Agences » dans l'esprit), et
 * aurait écarté « Groupe Onepoint », « Groupe Open », « Groupe Talan »… —
 * c'est pour ça qu'il n'y figure pas.
 *
 * #1799 (cinquième tour, résidu du 10/09/2026) — « Freelances » rejoint cette
 * liste. MESURÉ EN PRODUCTION sur `GET /api/partners/on-my-accounts` après
 * les quatre tours précédents : 50 entrées réduites à 2 suspects, dont
 * « Freelances et micro-agences » — un SEAU DE RÉSIDU (une catégorie de
 * marché), pas une société, exactement la même famille que « Agences
 * digitales locales ». Aucune des 477 raisons sociales du référentiel ne
 * commence par « Freelance » (voir le témoin à l'échelle dans
 * `esn-on-accounts-merge.spec.ts`), donc rien de réel n'y tombe.
 */
const LOWERCASE_START_MULTIWORD_RE = /^\p{Ll}\S*\s/u
const GENERIC_HEAD_NOUN_RE =
  /^(esn|agences?|éditeurs?|intégrateurs?|fournisseurs?|cabinets?|prestataires?|freelances?)(?=\s|$)/i

/**
 * #1799 (quatrième tour) — « & » et « et » sont la MÊME conjonction dans une
 * raison sociale, et `marketMatchKey` (le normaliseur PARTAGÉ,
 * `market-memory/market-company-key.ts`) ne les rapproche pas : « & » est de
 * la ponctuation qu'il efface déjà, « et » est un mot qu'il GARDE (il n'est
 * pas dans ses `NOISE_TOKENS`). « Crédit Agricole Technologies & Services »
 * et « … Technologies et Services » — la MÊME entité, mesurée deux fois en
 * production le 10/09/2026 — produisaient donc deux clés différentes.
 *
 * ⚠️ RAYON DE SOUFFLE MESURÉ AVANT D'ÉCRIRE CETTE LIGNE : `marketMatchKey`
 * est appelé par 7 AUTRES fichiers hors de ce module, dont
 * `market-memory-import.ts` et `market-memory.service.ts` — la mémoire
 * marché, qui joint ~60 000 lignes sur cette même clé. Un correctif DANS
 * `market-company-key.ts` (ajouter « et » à `NOISE_TOKENS`) aurait le même
 * effet pour tout le monde, mais je ne peux pas vérifier son impact sur ces
 * 60 000 lignes depuis ce fichier. Le repli ci-dessous est donc LOCAL à cet
 * écran : il ne transforme que la chaîne passée à `marketMatchKey` ICI,
 * jamais le normaliseur partagé lui-même — zéro risque pour les 7 autres
 * appelants. Proposition pour la mémoire marché, pas une décision prise ici :
 * voir le rapport de la tâche.
 *
 * Vérifié contre les 477 raisons sociales du référentiel : 455 groupes avant
 * ce repli, 455 après — aucune collision nouvelle entre deux entités
 * distinctes (dont les 8 qui portent un « & », de `B&D Conseil` à `McKinsey
 * & Company`, qui restent chacune seule dans son groupe). Voir le témoin à
 * l'échelle dans `esn-on-accounts-merge.spec.ts`.
 */
const AMPERSAND_RE = /\s*&\s*/g
function foldAmpersandAsEt(name: string): string {
  return name.replace(AMPERSAND_RE, ' et ')
}

/** « Capgemini — probable » -> « Capgemini ». La certitude n'est pas perdue :
 *  elle vit dans la colonne `certainty`, jamais dans le nom. */
export function stripCertaintyDecoration(name: string): string {
  return name
    .replace(CERTAINTY_PAREN_RE, '')
    .replace(SHORT_PAREN_RE, '')
    .replace(CERTAINTY_SUFFIX_RE, '')
    .replace(CERTAINTY_BARE_SUFFIX_RE, '')
    .replace(CERTAINTY_PREFIX_RE, '')
    .trim()
}

/**
 * Structurel plutôt que lexical : longueur, séparateur « / », mot de
 * négation en mot ENTIER (jamais une sous-chaîne — « Business & Decision »
 * ne contient aucun de ces mots). Le témoin de non-sur-attrapage vit dans
 * `esn-on-accounts-merge.spec.ts`.
 */
export function isPlausibleEsnName(name: string): boolean {
  if (!name) return false
  if (MULTI_ENTITY_RE.test(name)) return false
  // #1799 (troisième tour) — deux entités séparées par une virgule ne sont
  // pas un nom. La ligne s'écarte ENTIÈREMENT : la raboter sur la première
  // entité (« Capgemini » depuis « Capgemini, Accenture, Sopra Steria »)
  // fabriquerait un compte de trois comptes attribué à une seule ESN — la
  // même faute que #1818 a déjà refusée sur EBTrans.
  if (COMMA_LIST_RE.test(name)) return false
  // Une parenthèse SURVIVANTE après `stripCertaintyDecoration` est trop longue
  // pour être une précision : c'est une phrase, et une phrase ne désigne pas
  // une société. Voir le commentaire de `SHORT_PAREN_RE`.
  if (ANY_PAREN_RE.test(name)) return false
  // #1818 — même principe pour un TIRET : un seul mot de certitude après lui
  // est une décoration déjà retirée par `stripCertaintyDecoration` ; une
  // clause de plusieurs mots qui SURVIT jusqu'ici est une phrase. Voir
  // `DASH_CERTAINTY_CLAUSE_RE`.
  if (DASH_CERTAINTY_CLAUSE_RE.test(name)) return false
  // #1799 (quatrième tour) — une PHRASE commence par une minuscule quand
  // elle a plusieurs mots (« cabinet de conseil… ») ; un mot seul stylisé en
  // minuscules (« coconsult ») reste une vraie ESN. Voir
  // `LOWERCASE_START_MULTIWORD_RE`.
  if (LOWERCASE_START_MULTIWORD_RE.test(name)) return false
  // #1799 (quatrième tour) — un nom de tête GÉNÉRIQUE (« Agences… », « ESN
  // locale… ») nomme la CATÉGORIE d'une ESN, jamais une société précise.
  // Voir `GENERIC_HEAD_NOUN_RE`.
  if (GENERIC_HEAD_NOUN_RE.test(name)) return false
  if (NEGATION_RE.test(name)) return false
  if (name.split(/\s+/).filter(Boolean).length > MAX_NAME_WORDS) return false
  return true
}

/**
 * #1799.1 — « pourquoi y a deux fois Capgemini ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CAUSE, MESURÉE
 * ─────────────────────────────────────────────────────────────────────────
 * `onMyAccounts` groupait en SQL par `p.name` — le texte SAISI, comparé
 * OCTET PAR OCTET. Une ESN entrée « Capgemini » sur un compte (saisie à la
 * main) et « CAPGEMINI » sur un autre (détectée par l'analyse, ou saisie par
 * un second commercial) formait deux groupes SQL distincts : deux lignes pour
 * la même entreprise. C'est la même famille de défaut que ce dépôt a déjà
 * payée ailleurs — deux référentiels qui ne se rencontrent pas parce que le
 * rapprochement se fait sur le nom BRUT plutôt que sur une clé normalisée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CORRECTIF : RÉUTILISER, NE PAS RÉÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────
 * `marketMatchKey` est DÉJÀ le normaliseur de ce dépôt pour rapprocher un nom
 * d'entreprise : accents retirés, casse aplatie, formes juridiques et mots de
 * structure écartés (SA, SAS, Groupe, France…). L'écrire une seconde fois
 * ici produirait deux normalisations qui ne se rencontrent jamais — le défaut
 * exact que la doctrine documente pour la mémoire marché.
 *
 * ⚠️ `marketMatchKey` ne retire QUE les mots de structure, jamais un mot qui
 * distingue deux entités : « Capgemini Invent » garde sa propre clé, distincte
 * de « Capgemini ». Deux entreprises réellement différentes ne sont donc
 * JAMAIS rapprochées par cette fonction — voir le test témoin dans
 * `esn-on-accounts-merge.spec.ts`.
 */
export function mergeEsnByMatchKey(rows: readonly RawAccountPartnerRow[]): EsnOnAccountsRow[] {
  interface Group {
    // #2151.62 — account_id -> nom du compte, plutôt qu'un Set : la taille
    // (`.size`) rend toujours le même compte qu'avant, et la map porte en
    // plus de quoi nommer chaque compte dans `accountsList`.
    readonly accounts: Map<string, string>
    rank1: number
    // #2151.33 / #2151.34 — mêmes compteurs que `rank1`, une ligne à la fois.
    rank2: number
    knownRelationship: number
    readonly nameCounts: Map<string, number>
    certainty: EsnPresenceCertainty | null
    // #2298.8 — une entrée par présence rang 2 DATÉE ; `summarizeRank2Observations`
    // s'en charge à la fin, jamais ici (une seule dérivation, GA-26).
    readonly rank2Observed: EsnRank2Observation[]
  }
  const groups = new Map<string, Group>()

  for (const row of rows) {
    // #1799 — la décoration de certitude est retirée d'abord (elle peut
    // entourer un VRAI nom : « Capgemini — probable »), puis ce qui reste
    // doit encore avoir la forme d'un nom de société, sans quoi la ligne
    // entière est écartée — jamais affichée comme une valeur de remplissage.
    const trimmedName = stripCertaintyDecoration(row.name.trim())
    // Une ligne sans nom ne désigne personne : elle ne peut rejoindre aucun
    // groupe, et la faire tomber dans une clé vide commune la rapprocherait
    // de toutes les autres lignes sans nom.
    if (!trimmedName) continue
    if (!isPlausibleEsnName(trimmedName)) continue

    // #1799 (quatrième tour) — « & » replié en « et » AVANT `marketMatchKey`,
    // uniquement pour le calcul de la clé (`trimmedName`, affiché, n'est pas
    // touché) : voir `foldAmpersandAsEt` pour le rayon de souffle mesuré.
    // Une clé vide (nom fait entièrement de symboles) retombe sur le nom brut
    // en minuscules : la vider ferait de toutes ces lignes UNE seule ESN.
    const key = marketMatchKey(foldAmpersandAsEt(trimmedName)) || trimmedName.toLowerCase()

    let group = groups.get(key)
    if (!group) {
      group = {
        accounts: new Map(),
        rank1: 0,
        rank2: 0,
        knownRelationship: 0,
        nameCounts: new Map(),
        certainty: null,
        rank2Observed: [],
      }
      groups.set(key, group)
    }
    // #2151.62 — une ligne SANS nom de compte (fenêtre de déploiement) ne doit
    // pas EFFACER un nom déjà connu pour ce compte par une ligne précédente.
    group.accounts.set(row.account_id, row.account_name || group.accounts.get(row.account_id) || '')
    if (row.rank === 'rank1') group.rank1 += 1
    if (row.rank === 'rank2') {
      group.rank2 += 1
      // #2298.8 — un CONSTAT, jamais un score : seule une présence DATÉE
      // devient une observation. `rank2ObservationDateOf` rend `null` sur une
      // date illisible ou absente (déclarée à la main) — jamais une date
      // inventée pour faire nombre.
      const observedAt = rank2ObservationDateOf(row.detected_at)
      if (observedAt) {
        group.rank2Observed.push({
          kind: 'already_subcontracted',
          observedAt,
          // #2298.8 — le compte reste NOMMÉ : c'est la donnée de l'espace
          // lui-même (son propre `account_partners`), jamais une donnée d'un
          // autre espace — voir le docblock de `EsnOnAccountsRow.rank2Observations`.
          source: row.account_name
            ? `détecté sur le compte ${row.account_name}`
            : 'détecté sur un compte de cet espace',
        })
      }
    }
    // #2151.33 — `unknown`, absent ou toute autre valeur ne compte jamais
    // comme une relation connue : seul `partner`/`competitor` l'est.
    if (row.relationship === 'partner' || row.relationship === 'competitor') group.knownRelationship += 1
    group.nameCounts.set(trimmedName, (group.nameCounts.get(trimmedName) ?? 0) + 1)
    group.certainty = strongerCertainty(group.certainty, asCertainty(row.certainty))
  }

  const result: EsnOnAccountsRow[] = []
  for (const group of groups.values()) {
    // Le nom affiché est la variante la plus FRÉQUEMMENT saisie dans le
    // groupe — pas la première rencontrée, qui dépendrait de l'ordre de la
    // requête SQL. À égalité, l'ordre alphabétique départage pour un rendu
    // déterministe d'un appel à l'autre.
    let displayName = ''
    let bestCount = -1
    for (const [name, count] of group.nameCounts) {
      if (count > bestCount || (count === bestCount && name.localeCompare(displayName) < 0)) {
        displayName = name
        bestCount = count
      }
    }
    // #2151.62 — triée par nom : un ordre déterministe pour l'écran, distinct
    // de l'ordre (par présence) des lignes elles-mêmes.
    const accountsList = [...group.accounts.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    result.push({
      name: displayName,
      accounts: group.accounts.size,
      rank1: group.rank1,
      rank2: group.rank2,
      knownRelationship: group.knownRelationship,
      // #2151.32 — cette fonction n'a jamais accès à la mémoire marché
      // (seulement à `account_partners`) : `attachObservedClients` seul les
      // porte à leur vraie valeur, en aval.
      observedAtAccounts: 0,
      unresolvedAtAccounts: 0,
      // #2298.8 — la seule dérivation de « combien de fois, et quand pour la
      // dernière fois » (GA-26) : jamais un second recomptage à l'écran.
      rank2Observations: summarizeRank2Observations(group.rank2Observed),
      certainty: group.certainty,
      accountsList,
    })
  }

  // Même ordre que l'ancienne requête SQL : le plus présent d'abord, le nom
  // ensuite pour départager — l'écran et ses tests n'ont pas à changer.
  result.sort((left, right) => right.accounts - left.accounts || left.name.localeCompare(right.name))
  return result
}

/**
 * #2151.32 — ce que la mémoire marché sait d'UN compte de l'espace, tri-état.
 *
 * `'unknown'` ≠ un ensemble VIDE : un compte non résolu (siren/site absents,
 * corpus indisponible, résolution ambiguë) n'a JAMAIS été regardé, alors qu'un
 * compte `'ok'` dont `observedEsnKeys` ne contient pas la clé d'une ESN a été
 * regardé et ne l'a pas trouvée. Les deux se lisent très différemment côté
 * filtre (GA-18/GA-19, doctrine c65/GA-259) : confondre les deux ferait
 * passer « on n'a pas su » pour « on a vérifié, il n'y a rien ».
 */
export type AccountObservationStatus =
  | { readonly status: 'ok'; readonly observedEsnKeys: ReadonlySet<string> }
  | { readonly status: 'unknown' }

/**
 * #2151.32 — LE FILTRE « CLIENTS OBSERVÉS », SUR LE MODÈLE EXACT DE
 * `knownRelationship`/`rank2` CI-DESSUS.
 *
 * Croise, pour chaque ESN déjà groupée par `mergeEsnByMatchKey`, ses comptes
 * (`accountsList`, déjà résolus ci-dessus) avec ce que la mémoire marché sait
 * de CHACUN de ces comptes (`byAccountId`, lu par l'appelant — cette fonction
 * ne fait AUCUN appel réseau elle-même, comme le reste de ce fichier).
 *
 * Le rapprochement ESN ↔ observation passe par LA MÊME clé que tout ce
 * fichier (`marketMatchKey`) : une seconde normalisation divergerait de la
 * première, le défaut exact que #1799.1 a déjà payé.
 *
 * Un compte ABSENT de `byAccountId` (jamais interrogé par l'appelant — hors
 * périmètre du lot qui a construit la map) ne compte ni observé ni inconnu :
 * il est simplement hors de la question posée, pas une réponse en soi.
 */
export function attachObservedClients(
  rows: readonly EsnOnAccountsRow[],
  byAccountId: ReadonlyMap<string, AccountObservationStatus>,
): EsnOnAccountsRow[] {
  return rows.map(row => {
    const key = marketMatchKey(foldAmpersandAsEt(row.name)) || row.name.toLowerCase()
    let observedAtAccounts = 0
    let unresolvedAtAccounts = 0
    for (const account of row.accountsList) {
      const status = byAccountId.get(account.id)
      if (!status) continue
      if (status.status === 'unknown') {
        unresolvedAtAccounts += 1
        continue
      }
      if (status.observedEsnKeys.has(key)) observedAtAccounts += 1
    }
    return { ...row, observedAtAccounts, unresolvedAtAccounts }
  })
}
