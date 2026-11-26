import type {
  MarketContextMatch,
  MarketMemoryCoverage,
  MarketSignalDate,
  MarketVerificationCompanyState,
  MarketVerificationState,
} from '@bellum/contracts'
import type { MarketContextQuery } from '@/features/discover/lib/market-context'

/**
 * #1625 — « ENVIRONNEMENTS COMPATIBLES BELLUM », LA TROISIÈME LECTURE DEPUIS
 * UN CONSULTANT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE RÉINVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le moteur est `MarketMemoryService.searchByFilters`, déjà exposé côté web
 * par `companiesApi.marketContextSearch` / `useMarketContextSearch` (#1626,
 * livré la nuit d'avant ce lot). Ce fichier ne fait que construire la requête
 * DEPUIS UN CONSULTANT plutôt que depuis un formulaire tapé à la main
 * (ex-panneau « Contexte marché », Découvrir — retiré 31/10), et dérive deux états d'affichage à partir
 * du MÊME objet `MarketMemoryCoverage` que Découvrir lit déjà.
 *
 * Le « fit expertise » (recoupement technologie + famille de rôle observées ×
 * compétences déclarées) réutilise `marketFitFor` / `sortByCompatibility`
 * (`@/features/discover/lib/market-context`) TELS QUELS — pas de second
 * appariement, pas de gradation Fort/Moyen (voir la doc de `marketFitFor` :
 * `MarketStructuralFitCard` a déjà tranché cette question exacte, et
 * l'appliquer à moitié ici contredirait l'écran qui l'a tranchée).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA REQUÊTE NE LIT JAMAIS SUR LE CONSULTANT
 * ─────────────────────────────────────────────────────────────────────────
 * `CompatibleEnvironmentsInput` ne porte QUE ce que la doctrine autorise à
 * classer des entreprises : les compétences (`stack`), le métier déclaré
 * (`title` — une famille de rôle en une ligne, jamais un critère protégé) et
 * la zone tenable (`zones`). Aucun nom, aucune photo, aucune date de
 * naissance, aucune situation familiale : ce type ne les PORTE pas, donc
 * aucune ligne de ce fichier ne peut les lire par accident. C'est la même
 * défense que `MatchCandidate` tient côté API pour `consultant-matching.ts`
 * (voir `protected-criteria.spec.ts`) — la fermer dans le TYPE plutôt que
 * compter sur la discipline de chaque appelant.
 */
export interface CompatibleEnvironmentsInput {
  /** Technologies et compétences déclarées — la seule matière technique. */
  readonly stack: readonly string[]
  /** Zones géographiques tenables, texte libre (« IDF », « Lyon », « remote »). */
  readonly zones: readonly string[]
  /** Le métier en une ligne (« Ingénieur data ») — sert de repli pour
   *  recouper une famille de rôle observée, jamais pour désigner la personne. */
  readonly title: string | null
}

/**
 * Des zones qui ne désignent aucun territoire réel — un mode de travail, pas
 * un lieu. Les envoyer comme `location` à `searchByFilters` ne trouverait
 * jamais rien (le corpus ne porte pas de ville « remote »), et ce serait
 * silencieux : la ligne suivante essaie donc la zone SUIVANTE plutôt que de
 * s'arrêter là.
 */
const NON_TERRITORIAL_ZONES = new Set(['remote', 'télétravail', 'teletravail', 'full remote', 'full_remote', 'hybride'])

/**
 * Un SIGLE n'est pas un territoire que le corpus puisse connaître.
 *
 * ⚠️ Mesuré en production le 11/09/2026 : une fiche dont la première zone est
 * « IDF » rendait le bloc VIDE — le corpus stocke « Ile-de-France », « Paris »,
 * « Boulogne-Billancourt », jamais l'abréviation. Et « aucun environnement ne
 * ressort » se lit comme un fait de marché, pas comme un défaut de jointure.
 *
 * **On ne MAPPE pas** « IDF » vers « Île-de-France » : ce serait une table
 * d'équivalences devinée, à maintenir, et fausse le jour où un sigle en
 * recouvre deux. On se contente de ne pas l'envoyer comme discriminant — la
 * zone suivante de la fiche est essayée, puis la compétence en repli.
 *
 * Le test : tout en capitales, pas d'espace, quatre caractères ou moins. « IDF »,
 * « PACA », « AURA » en sont ; « Paris », « Lyon », « La Défense » n'en sont
 * pas, et « NANTES » non plus (six caractères) — la borne est volontairement
 * basse : mieux vaut laisser passer un sigle rare que refuser une vraie ville
 * écrite en majuscules.
 */
function isBareAcronym(zone: string): boolean {
  return zone.length <= 4 && !/\s/.test(zone) && zone === zone.toUpperCase() && /[A-Z]/.test(zone)
}

function firstUsableZone(zones: readonly string[]): string | null {
  for (const raw of zones) {
    const trimmed = raw.trim()
    if (!trimmed || NON_TERRITORIAL_ZONES.has(trimmed.toLowerCase())) continue
    if (isBareAcronym(trimmed)) continue
    return trimmed
  }
  return null
}

function firstUsableSkill(stack: readonly string[]): string | null {
  for (const raw of stack) {
    const trimmed = raw.trim()
    if (trimmed) return trimmed
  }
  return null
}

/**
 * Le consultant → la requête, ou `null` quand rien n'est lançable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA ZONE D'ABORD, LA COMPÉTENCE EN REPLI
 * ─────────────────────────────────────────────────────────────────────────
 * `searchByFilters` compose ses filtres en ET (`andWhere`) : demander
 * technologie ET localisation à la fois intersecterait deux critères là où le
 * retour en croise QUATRE (technologie, famille de rôle, recours externe,
 * territoire) — une intersection dure ferait quasi-toujours 0 résultat plutôt
 * que 18. Un seul discriminant SERVEUR porte donc la recherche : la zone
 * tenable, parce que c'est elle que le retour nomme explicitement
 * (« territoryAffinity ») et qu'un consultant n'en porte normalement qu'une
 * poignée courte. Le reste (technologie, famille de rôle) devient un FILTRE
 * CLIENT sur le résultat, via `marketFitFor` — même patron que
 * ancien panneau de Découvrir (retiré le 31/10), qui les envoyait au serveur et
 * calcule le fit expertise à côté, sur le retour.
 *
 * Une seule zone est retenue : plusieurs appels en parallèle (un par zone)
 * élargiraient la couverture, mais c'est un fan-out que ce lot n'ouvre pas
 * (0 crédit, mais pas 0 coût de requête sur un corpus partagé) — voir « ce que
 * je n'ai pas fait ».
 *
 * Sans zone utilisable, la première compétence déclarée sert de discriminant
 * de repli plutôt que de rendre l'écran muet pour un consultant dont la
 * mobilité n'a pas encore été renseignée.
 */
export function buildCompatibleEnvironmentsQuery(input: CompatibleEnvironmentsInput): MarketContextQuery | null {
  const location = firstUsableZone(input.zones)
  if (location) return { location }

  const technology = firstUsableSkill(input.stack)
  if (technology) return { technology }

  return null
}

/**
 * Les compétences qui alimentent `marketFitFor` — compétences déclarées PLUS
 * le métier en une ligne (repli pour l'affinité de famille de rôle, faute d'un
 * champ structuré dédié sur la fiche). Dédupliquées et triées comme
 * déclarées : `matchingExpertises` rend ses résultats dans l'ORDRE reçu.
 */
export function consultantSkillsForFit(input: Pick<CompatibleEnvironmentsInput, 'stack' | 'title'>): string[] {
  const seen = new Set<string>()
  const skills: string[] = []
  for (const raw of [...input.stack, ...(input.title ? [input.title] : [])]) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    skills.push(trimmed)
  }
  return skills
}

/**
 * « Recours externe : Observé / Inconnu » (retour #1625, verbatim) — jamais
 * « Non observé », qu'une absence d'observation ne prouve jamais.
 */
export function externalRecourseObserved(coverage: MarketMemoryCoverage): boolean {
  return coverage.esnObserved.length > 0
}

/**
 * « Accès » — DEUX états sur les trois que le retour propose, et c'est
 * délibéré : « Ouvert » affirmerait une voie d'accès CONNUE (un contact, un
 * compte déjà travaillé), ce qu'aucune donnée de cette lecture ne mesure — la
 * mémoire marché ne joint aucune identité de compte CRM, par doctrine, et
 * `MarketContextMatch` ne porte pas de SIREN. Une société de services
 * OBSERVÉE reste un fait réel et différent : elle ouvre un CHEMIN POTENTIEL à
 * qualifier (le vocabulaire que `market-memory.ts` impose), jamais un accès.
 * Voir le rapport de lot pour la raison de ne pas être allé plus loin.
 *
 * Non exporté : consommé uniquement par `accessStateFor` ci-dessous, dans ce
 * même fichier (`pnpm lint:exports:types` / knip refuse un type exporté sans
 * consommateur hors de son fichier — même règle que `MarketFitLabel` dans
 * `@/features/discover/lib/market-context`).
 */
type AccessState = 'potential_path' | 'unknown'

export function accessStateFor(coverage: MarketMemoryCoverage): AccessState {
  return externalRecourseObserved(coverage) ? 'potential_path' : 'unknown'
}

/**
 * #2336.5 / #2336.12-.15 — L'ENTRÉE TALENT « PRÉFÉRENCES / RESTRICTIONS »,
 * REJOINTE À LA MÉMOIRE MARCHÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA FAIT, ET CE QUE ÇA NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `Consultant.preferences.refusedTechnologies` (§8.3, `talent-preferences.ts`)
 * existe déjà et alimente déjà le matching de BESOINS
 * (`preferenceWarnings`) — mais jamais « Environnements compatibles », qui
 * n'en lisait aucune restriction. Ce fichier ne recalcule rien : il rejoint
 * la MÊME liste déclarée à la SEULE stack que la mémoire marché mesure déjà
 * (`coverage.observedStack`, le §8.3 nomme cette matière « restrictions »).
 *
 * §8.3, verbatim : « ces préférences filtrent en AVERTISSEMENT, pas en
 * EXCLUSION ». Cette fonction tient la même règle — elle NOMME une techno
 * évitée observée dans l'environnement, elle ne retire jamais la ligne du
 * tableau et n'entre dans AUCUN verdict (`reverseMarketVerdictFor` ne la lit
 * pas) : c'est le commercial qui décide, pas ce fichier.
 *
 * `null` = aucune restriction déclarée ne recoupe la stack observée — jamais
 * deviné, jamais une exclusion silencieuse.
 */
export function refusedTechnologyObservedAt(
  coverage: MarketMemoryCoverage,
  refusedTechnologies: readonly string[],
): string | null {
  const refused = new Set(refusedTechnologies.map(technology => technology.trim().toLowerCase()))
  if (refused.size === 0) return null
  const observed = coverage.observedStack.find(entry => refused.has(entry.techno.trim().toLowerCase()))
  return observed ? observed.techno.trim() : null
}

/**
 * #2968 — LES CINQ VERDICTS NOMMÉS PAR ENTREPRISE : PRIORITÉ, À QUALIFIER,
 * COMPATIBLE STRUCTURELLEMENT, RÉSERVE, ÉCARTÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE VERDICT LIT, ET N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Chaque ligne de « Environnements compatibles » porte déjà les DEUX seuls
 * axes que #2288 a câblés : `accessStateFor` (« chemin potentiel » observé
 * par la mémoire marché) et `currentSignal` (« mouvement actuel », une date
 * tranchée côté serveur — voir `CurrentSignalCell`). La STRUCTURE elle-même
 * n'est jamais un axe ICI : une ligne n'apparaît dans ce tableau que parce
 * qu'elle EST déjà structurellement compatible (`searchByFilters` a déjà
 * filtré) — la nommer une troisième fois serait une donnée redondante, pas
 * un axe de plus.
 *
 * `verificationState` est l'issue du flux « Vérifier aujourd'hui »
 * (`MarketVerificationState`, `market-verification.ts`) — SEULEMENT `stale`
 * compte ici : c'est la trace qu'une vérification humaine a existé puis a
 * vieilli, distincte d'une ligne qu'on n'a simplement jamais regardée.
 * `dismissed` est le geste « Masquer » — une correction humaine, qui gagne
 * toujours sur tout le reste (même doctrine que `decideMarketVerificationState`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ÉCARTÉ ARRIVE EN PREMIER, ET RÉSERVE SEULEMENT EN DERNIER
 * ─────────────────────────────────────────────────────────────────────────
 * L'ordre des refus EST le message (même discipline que
 * `decideMarketVerificationState`) : un masquage humain gagne AVANT tout
 * calcul — masquer une ligne par ailleurs PRIORITÉ ne la fait pas remonter en
 * À QUALIFIER, elle sort du jeu. RÉSERVE, à l'inverse, n'est choisi qu'en tout
 * dernier recours : elle ne se distingue de COMPATIBLE STRUCTURELLEMENT que
 * par la présence d'un fait pÉRIMÉ (`stale`) — une ligne jamais vérifiée
 * n'est pas mise « en réserve », elle est juste compatible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE VERDICT NE PRÉTEND PAS ATTEINDRE
 * ─────────────────────────────────────────────────────────────────────────
 * L'épopée #2968 décrit un « besoin confirmé » comme entrée possible de
 * PRIORITÉ — cette section n'en porte pas (c'est la matière de la section
 * « Besoins internes », un compte CRM nommé, pas une entreprise de la mémoire
 * marché). Cette fonction ne le simule donc jamais : PRIORITÉ n'est atteint
 * ici que par le couple signal + accès, jamais par un besoin deviné.
 */
export const REVERSE_MARKET_VERDICTS = [
  'priority',
  'to_qualify',
  'structurally_compatible',
  'reserve',
  'dropped',
] as const
export type ReverseMarketVerdict = (typeof REVERSE_MARKET_VERDICTS)[number]

interface ReverseMarketVerdictInput {
  readonly coverage: MarketMemoryCoverage
  /** `null` — jamais `undefined` — l'appelant a déjà réduit `match.currentSignal ?? null`. */
  readonly currentSignal: MarketSignalDate | null
  /** L'issue du flux « Vérifier aujourd'hui », quand elle est connue. */
  readonly verificationState?: MarketVerificationState | null
  /** Le geste « Masquer » — une correction humaine, qui gagne toujours. */
  readonly dismissed?: boolean
}

export function reverseMarketVerdictFor(input: ReverseMarketVerdictInput): ReverseMarketVerdict {
  if (input.dismissed) return 'dropped'
  const signalKnown = input.currentSignal !== null
  const accessKnown = accessStateFor(input.coverage) === 'potential_path'
  if (signalKnown && accessKnown) return 'priority'
  if (signalKnown || accessKnown) return 'to_qualify'
  if (input.verificationState === 'stale') return 'reserve'
  return 'structurally_compatible'
}

/**
 * #2288.5 / #2968 — le résultat se lit en CINQ seaux, jamais un total unique :
 * **compatibles** (ce que la mémoire marché a vu), **vérifiés** (un signal
 * actuel confirmé), **avec accès** (un chemin potentiel observé), **en
 * réserve** (compatibles, sans chemin connu) et **priorité** (#2968 — le
 * sous-ensemble qui porte déjà le verdict PRIORITÉ, voir
 * `reverseMarketVerdictFor`). `priority` reste TOUJOURS un compte réel — il
 * ne se devine jamais, il RECOMPTE les verdicts, la même fonction qui décide
 * chaque ligne (GA-26 : une seule décision, jamais rejouée à côté).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `verified` EST `null`, PAS `0`
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Mis à jour le 18/09/2026 (#2288.2) : le flux présélection → vérification →
 * conservation EXISTE désormais, et ce seau se COMPTE — mais seulement quand
 * les états lui sont passés. Sans eux il rend toujours `null` : une requête en
 * vol n'est pas une vérification, et un « 0 » d'une seconde se lit comme un
 * fait. Le paragraphe ci-dessous décrit l'état d'avant ce lot.
 *
 * #2288.2 (l'enchaînement présélection → vérification des signaux actuels →
 * filtrage) n'existait NULLE PART dans ce dépôt avant le 18/09/2026 — mesuré,
 * `git grep "sans signal actuel"` ne rend rien hors le registre du lot. Un
 * « 0 vérifiés » se lirait « on a vérifié, aucun ne l'est » ; la vérité est
 * qu'on n'a PAS vérifié — deux choses opposées, et c'est exactement la faute
 * que GA-18/GA-19 existent pour empêcher. Le jour où #2288.2 existe, cette
 * fonction n'a qu'à compter les lignes vérifiées au lieu de rendre `null`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `withAccess` + `reserve` == `compatible`, TOUJOURS
 * ─────────────────────────────────────────────────────────────────────────
 * `accessStateFor` ne connaît que deux états (`potential_path` / `unknown`) :
 * ils couvrent tout l'ensemble des correspondances, sans reste. « En
 * réserve » n'est donc pas un troisième calcul, c'est le complément du
 * premier — un compatible SANS chemin connu, à qualifier plus tard plutôt
 * qu'écarté.
 */
export interface CompatibleEnvironmentBuckets {
  readonly compatible: number
  readonly verified: number | null
  readonly withAccess: number
  readonly reserve: number
  /** #2968 — combien de lignes portent déjà le verdict PRIORITÉ. */
  readonly priority: number
}

export function compatibleEnvironmentBuckets(
  matches: readonly MarketContextMatch[],
  /**
   * #2288.2 — les états de conservation, quand le serveur les a rendus
   * (`POST /consultants/:id/market-verification/plan`). `null`/absent = on ne
   * les a PAS demandés ou ils ne sont pas encore arrivés : « vérifiés » reste
   * NON MESURÉ. Un `0` de repli se lirait « on a vérifié, aucun ne l'est ».
   */
  verificationStates?: readonly MarketVerificationCompanyState[] | null,
): CompatibleEnvironmentBuckets {
  const withAccess = matches.filter(match => accessStateFor(match.coverage) === 'potential_path').length
  // #2968 — le cinquième seau : combien de lignes portent DÉJÀ le verdict
  // PRIORITÉ. `verificationState` n'entre pas dans ce calcul — PRIORITÉ ne
  // dépend que du couple signal + accès (voir `reverseMarketVerdictFor`).
  const priority = matches.filter(
    match =>
      reverseMarketVerdictFor({ coverage: match.coverage, currentSignal: match.currentSignal ?? null }) === 'priority',
  ).length
  return {
    compatible: matches.length,
    verified: verifiedCount(matches, verificationStates),
    withAccess,
    reserve: matches.length - withAccess,
    priority,
  }
}

/**
 * #2288.2 — ce qui COMPTE comme vérifié, et ce qui n'en est pas.
 *
 * `kept` (vérifié, encore frais) et `corrected` (tranché à la main — la forme
 * la plus forte de vérification) comptent. `stale` et `unknown` NON : un fait
 * périmé est redevenu inconnu, un temps dépassé n'a jamais été mesuré. Les
 * compter ferait dire au bandeau qu'on sait ce qu'on ne sait plus.
 *
 * GA-259 — le dénominateur est la liste AFFICHÉE : un état qui porte sur une
 * entreprise absente du tableau ne compte pas. On mesure ce qu'on MONTRE.
 */
function verifiedCount(
  matches: readonly MarketContextMatch[],
  states: readonly MarketVerificationCompanyState[] | null | undefined,
): number | null {
  if (!states) return null
  const verified = new Set(
    states
      .filter(entry => entry.state === 'kept' || entry.state === 'corrected')
      .map(entry => entry.companyName.trim().toLowerCase()),
  )
  return matches.filter(match => verified.has(match.companyName.trim().toLowerCase())).length
}
