import type { EsnAnswers } from '@bellum/contracts'
import type { MarketContextQuery } from '@/features/discover/lib/market-context'

/**
 * #1627 — LA PREMIÈRE VALEUR MARCHÉ, DÉRIVÉE DU PROFIL ESN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE DÉFAUT QUE CE FICHIER A PORTÉ, ET QUI NE RESSEMBLAIT À RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * La première version envoyait le libellé du questionnaire TEL QUEL comme
 * discriminant : `geo_zones[0]` → `location`, `expertise_areas[0]` →
 * `technology`. Or les douze choix de `Q.geo_zones` sont tous COMPOSÉS — « Lyon
 * & Auvergne-Rhône-Alpes », « Paris & Île-de-France » — et la question n'a
 * aucun champ libre. Le corpus, lui, stocke ce que le CSV d'import porte :
 * « Lyon », « Île-de-France », « France ». `signal.city LIKE '%lyon &
 * auvergne-rhone-alpes%'` ne rencontre donc JAMAIS rien, pour aucun
 * utilisateur, jamais. Même chose côté expertises : « Cloud & Infrastructure
 * (AWS, Azure, GCP, Hosting) » contre `stack.techno`, qui porte « AWS », « Java »,
 * une techno par ligne.
 *
 * La carte rendait `null` à tous les coups, et `null` est exactement ce qu'elle
 * rend quand la couverture est insuffisante : le défaut ne ressemblait à RIEN.
 * C'est le même défaut, à un écran près, que #1625 a mesuré en production sur
 * « Environnements compatibles » — un sigle de zone qui ne porte pas la
 * recherche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON FAIT — LIRE LE LIBELLÉ, JAMAIS LE TRADUIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * On coupe le libellé sur ses SÉPARATEURS (`&`, `(`, `,`, `/`) et on garde le
 * premier segment : « Lyon & Auvergne-Rhône-Alpes » → « Lyon ». Ce n'est pas
 * une table d'équivalences — celle-là, #1625 l'a refusée pour de bonnes raisons
 * (« devinée, à maintenir, et fausse le jour où un sigle en recouvre deux ») :
 * on ne fabrique aucun mot, on garde ceux que l'utilisateur a lui-même choisis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL DISCRIMINANT SERVEUR, JAMAIS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketMemoryService.searchByFilters` compose ses filtres en ET (`andWhere`).
 * Envoyer technologie ET localisation intersecte deux critères déjà larges et
 * rend quasi-toujours zéro — c'est le raisonnement écrit dans
 * `buildCompatibleEnvironmentsQuery` (#1625), et il vaut ici mot pour mot. La
 * ZONE porte donc la recherche (c'est elle que le retour nomme : « 12
 * environnements autour de Lyon »), et les expertises déclarées deviennent un
 * recoupement CLIENT sur le résultat — `marketFitFor`, le même que Découvrir et
 * le vivier, jamais un second appariement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE DÉRIVE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour cite « secteurs » et « taille cible ». `searchByFilters` ne porte
 * aucun secteur ; quant à `employeeMin`/`employeeMax`, ils bornent l'EFFECTIF
 * OBSERVÉ d'une entreprise du corpus — `target_company_types` (« ETI (500-5 000
 * salariés) ») dit qui l'ESN VEUT adresser, ce qui n'est pas la même grandeur,
 * et les ajouter resserrerait l'intersection qu'on vient justement de refuser.
 * Absents, donc, et nommés comme absents.
 */

/**
 * Des zones qui ne désignent aucun territoire que le corpus puisse porter.
 *
 * Deux familles, et la liste les NOMME une par une plutôt que de les deviner :
 * un MODE de travail (« Full remote ») n'est pas un lieu, et une PORTÉE
 * (« National », « International ») n'est pas une ville, une région ni un pays
 * — `signal.country` porte « France », jamais « National ». Les envoyer comme
 * discriminant ne trouverait rien, et ce serait SILENCIEUX : la zone suivante
 * est donc essayée, puis l'expertise en repli, exactement comme #1625.
 *
 * Comparé sur le libellé PLIÉ (minuscules, accents retirés) et sur le SEGMENT
 * déjà coupé : « Full remote (pas de contrainte géo) » arrive ici comme
 * « full remote », « National (toute la France) » comme « national ».
 */
const NON_TERRITORIAL_ZONES: ReadonlySet<string> = new Set([
  'full remote',
  'remote',
  'teletravail',
  'hybride',
  'national',
  'international',
])

/** Minuscules + accents retirés — pour COMPARER, jamais pour envoyer. */
function fold(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Le premier segment d'un libellé composé du questionnaire.
 *
 * ⚠️ Rend le segment BRUT — accents et casse compris. `searchByFilters` plie
 * les deux côtés de la LOCALISATION (`foldedColumn`), mais compare la
 * technologie par un `ILIKE` nu : or `ILIKE` est insensible à la casse et PAS
 * aux diacritiques. Envoyer « cybersecurite » ne rencontrerait jamais
 * « Cybersécurité ». Le pliage sert donc à comparer ici, jamais à composer la
 * requête.
 */
function firstSegment(label: string): string {
  return (label.split(/[&(,/]/)[0] ?? '').trim()
}

/** La première zone déclarée qui nomme un lieu, coupée sur ce lieu. */
function firstUsableZone(zones: readonly string[]): string | null {
  for (const raw of zones) {
    const segment = firstSegment(raw)
    if (!segment) continue
    if (NON_TERRITORIAL_ZONES.has(fold(segment))) continue
    return segment
  }
  return null
}

/** La première expertise déclarée, coupée sur son premier segment. */
function firstUsableExpertise(expertises: readonly string[]): string | null {
  for (const raw of expertises) {
    const segment = firstSegment(raw)
    if (segment) return segment
  }
  return null
}

/**
 * Le profil ESN → la requête, ou `null` quand rien n'est lançable.
 *
 * `null` n'est pas un état d'erreur : l'appelant (`MarketAwarenessCard`) ne rend
 * alors RIEN, et l'onboarding continue inchangé — « couverture insuffisante ⇒ on
 * garde le parcours actuel », verbatim du retour.
 */
export function deriveMarketAwarenessQuery(answers: EsnAnswers | null | undefined): MarketContextQuery | null {
  const location = firstUsableZone(answers?.geo_zones ?? [])
  if (location) return { location }

  const technology = firstUsableExpertise(answers?.expertise_areas ?? [])
  if (technology) return { technology }

  return null
}
