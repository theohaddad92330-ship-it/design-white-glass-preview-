/**
 * #2288.4 (c66, 18/09/2026) — BOAMP ET DECP SE NOMMENT LÀ OÙ LA COLLECTE LES
 * INTERROGERA, ET SEULEMENT LÀ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE LANCEUR FAIT RÉELLEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * BOAMP (appels d'offres) et DECP (marchés attribués) ne tournent pas pour tout
 * run : `plan_collection` (`apps/ia/app/services/collection_focus.py`) les
 * ÉCARTE pour un pays cible hors France ou un archétype préliminaire
 * `international` / `startup`, et les GARDE pour tout le reste. Cet archétype
 * est calculé AU RUN, depuis le gagnant du registre résolu par le nom — une
 * donnée qu'aucun devis sans réseau ne peut lire pour une entreprise jamais
 * analysée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SEUL MORCEAU DÉCIDABLE AVANT LE RUN
 * ─────────────────────────────────────────────────────────────────────────────
 * `classify_account_archetype` lit le code NAF officiel AVANT tout libellé :
 * une division de `nafDivisionToArchetype` fixe l'archétype, quels que soient
 * le libellé et l'effectif. Pour une entité dont le registre a déjà donné ce
 * code (colonne `accounts.naf_code`), et un pays cible France, la décision de
 * la gate est donc connue d'avance. Partout ailleurs elle ne l'est pas, et on
 * n'annonce RIEN — jamais une source devinée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE COPIE, ET CE QUI L'EMPÊCHE DE DIVERGER
 * ─────────────────────────────────────────────────────────────────────────────
 * La racine Railway du service IA est `apps/ia` : `packages/` n'est pas dans
 * son contexte de build (même contrainte que `ingestion-guard.ts`). Les
 * constantes voyagent en JSON (`public-tenders-gate.constants.json`) :
 * `public-tenders-gate.test.ts` rougit si ce fichier s'en écarte, et
 * `apps/ia/tests/test_collection_focus.py` rougit si la gate Python s'en écarte
 * — table NAF, pays « France », et le COMPORTEMENT de `plan_collection` sur
 * chaque division (GA-26 : une règle, deux langues, une seule vérité).
 */

/** Les sources de marchés publics FR que la gate d'archétype pilote. */
export const PUBLIC_TENDER_SOURCE_IDS = ['boamp', 'decp'] as const
type PublicTenderSourceId = (typeof PUBLIC_TENDER_SOURCE_IDS)[number]

const divisions = (from: number, to: number, archetype: string): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: to - from + 1 }, (_, index) => [String(from + index).padStart(2, '0'), archetype]),
  )

/** Miroir de `_NAF_DIVISION_TO_ARCHETYPE`, `_FR_COUNTRIES` (`sales_context.py`)
 *  et des archétypes que `plan_collection` écarte. */
export const PUBLIC_TENDERS_GATE = {
  nafDivisionToArchetype: {
    '64': 'banque_assurance',
    '65': 'banque_assurance',
    '66': 'banque_assurance',
    '84': 'public',
    ...divisions(5, 39, 'industrie'),
    ...divisions(49, 53, 'industrie'),
    '45': 'luxe_retail_media',
    '46': 'luxe_retail_media',
    '47': 'luxe_retail_media',
    '58': 'luxe_retail_media',
    '59': 'luxe_retail_media',
    '60': 'luxe_retail_media',
  } as Readonly<Record<string, string>>,
  archetypesWithoutPublicTenders: ['international', 'startup'] as readonly string[],
  frenchCountries: ['fr', 'france', ''] as readonly string[],
} as const

/** Les deux premiers chiffres d'un code NAF (« 84.11Z » → « 84 »), comme `_naf_division`. */
function nafDivision(nafCode: string | null): string | null {
  const digits = (nafCode ?? '').replace(/\D/g, '')
  return digits.length >= 2 ? digits.slice(0, 2) : null
}

/**
 * Les sources de marchés publics qu'un run lancé MAINTENANT interrogera, ou
 * rien quand on ne peut pas le savoir sans le lancer.
 *
 * `runCountry` est le pays que le lanceur enverra à l'IA (`null` = marché
 * France, aucun pays envoyé) ; `knownNafCode` le code NAF déjà persisté pour
 * l'entité que ce lancement résoudra (`null` = jamais vue).
 */
export function forecastPublicTenderSources(input: {
  readonly runCountry: string | null
  readonly knownNafCode: string | null
}): readonly PublicTenderSourceId[] {
  const country = (input.runCountry ?? '').trim().toLowerCase()
  // #2288.4 — siège ciblé hors France : la gate écarte BOAMP/DECP, c'est CERTAIN.
  if (!PUBLIC_TENDERS_GATE.frenchCountries.includes(country)) return []
  const division = nafDivision(input.knownNafCode)
  const archetype = division === null ? undefined : PUBLIC_TENDERS_GATE.nafDivisionToArchetype[division]
  // #2288.4 — sans NAF qui fixe l'archétype, c'est le libellé du registre qui
  // trancherait AU RUN : on ne le sait pas, donc on n'annonce rien.
  if (archetype === undefined) return []
  if (PUBLIC_TENDERS_GATE.archetypesWithoutPublicTenders.includes(archetype)) return []
  return PUBLIC_TENDER_SOURCE_IDS
}
