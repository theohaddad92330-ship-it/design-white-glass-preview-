import {
  expertiseTradeTerms,
  FRENCH_REGION_DEPARTMENTS,
  type BaseReaderCriteria,
  type BaseReaderResult,
} from '@bellum/contracts'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'

/**
 * #4792 (épopée #4791) — LE PORT PAR LEQUEL DÉCOUVRIR LIT NOTRE BASE.
 *
 * `DiscoverSourcesService` ne connaît pas le nom de `BaseReaderService` : il possède cette interface,
 * et `ia-proxy.module.ts` branche l'implémentation, avec le port en TYPE DE RETOUR du `useFactory`
 * (jamais `useExisting`). Même idiome que `internal-history-source.ts` et `market-path-axis-source.ts`
 * — le cliquet des imports service → service (GA-07) ne monte pas.
 */
export const BASE_MATCHES_SOURCE = Symbol('BASE_MATCHES_SOURCE')

export interface BaseMatchesSource {
  read(
    scope: { workspaceId: string; businessUnitScope: BusinessUnitScopeClause },
    criteria: BaseReaderCriteria,
  ): Promise<BaseReaderResult>
}

/**
 * Les champs de LIEU et de MÉTIER des critères de Découvrir — les seuls que ce pont lit. Un type
 * structurel plutôt que le DTO entier : le pont ne doit pas se mettre à dépendre de quarante filtres
 * de registre dont aucun ne concerne notre base.
 */
type DiscoverPlaceAndTermFilters = {
  city?: string
  department?: string
  departments?: string[]
  region?: string
  regions?: string[]
  keywords?: string[]
  technologiesObserved?: string[]
}

/**
 * #4793.2 — le code INSEE d'une région (clé de `UnifiedFilters.region`) → ses départements. La table des départements
 * est celle de `FRENCH_REGION_DEPARTMENTS` (GA-26) ; seule la correspondance code → région est écrite ici.
 */
const DEPARTMENTS_OF_REGION_CODE: Readonly<Record<string, readonly string[]>> = {
  '11': FRENCH_REGION_DEPARTMENTS.ile_de_france,
  '84': FRENCH_REGION_DEPARTMENTS.auvergne_rhone_alpes,
  '32': FRENCH_REGION_DEPARTMENTS.hauts_de_france,
  '52': FRENCH_REGION_DEPARTMENTS.pays_de_la_loire,
  '75': FRENCH_REGION_DEPARTMENTS.nouvelle_aquitaine,
  '76': FRENCH_REGION_DEPARTMENTS.occitanie,
  '93': FRENCH_REGION_DEPARTMENTS.provence_alpes_cote_d_azur,
  '44': FRENCH_REGION_DEPARTMENTS.grand_est,
  '53': FRENCH_REGION_DEPARTMENTS.bretagne,
  '28': FRENCH_REGION_DEPARTMENTS.normandie,
  '24': FRENCH_REGION_DEPARTMENTS.centre_val_de_loire,
  '27': FRENCH_REGION_DEPARTMENTS.bourgogne_franche_comte,
  '94': ['2A', '2B'],
}

/**
 * #4792 — les critères de Découvrir traduits pour le lecteur commun.
 *
 * ⚠️ `freetext` n'entre PAS. C'est une PHRASE (« des ESN qui recrutent des devs Java à Lille »), pas
 * un métier : Découvrir la lit lui-même (`_apply_reading`) et en tire des filtres structurés, qui sont
 * ceux que ce pont reçoit. L'envoyer telle quelle en `ILIKE` ne rapprocherait rien et ferait croire
 * qu'on a cherché.
 *
 * ⚠️ AUCUNE PÉRIODE. Le lecteur commun ne pose pas de fenêtre par défaut, et Découvrir n'en impose
 * pas une ici : c'est précisément la fenêtre de 90 jours, posée puis refiltrée à la même valeur, qui
 * rendait invisible ce que la base portait déjà.
 *
 * Fonction PURE : c'est ce qui la rend mesurable sans instancier NestJS ni toucher une base.
 */
export function discoverBaseCriteria(
  filters: DiscoverPlaceAndTermFilters | undefined,
  cap: number,
): BaseReaderCriteria {
  const asked = filters ?? {}
  const clean = (values: (string | undefined)[]): string[] => {
    const out: string[] = []
    for (const value of values) {
      const text = String(value ?? '').trim()
      if (text && !out.includes(text)) out.push(text)
    }
    return out
  }
  // #4793.2 — un code RÉGION passait dans `placePatterns` comme un département (`%(32)%` = Gers) : il est converti en
  // ses départements ; un libellé (« Hauts-de-France ») ou un code inconnu reste tel quel (rien n'est deviné).
  const regionLabels: string[] = []
  const regionDepartments: string[] = []
  for (const region of clean([...(asked.regions ?? []), asked.region])) {
    const departments = DEPARTMENTS_OF_REGION_CODE[region]
    if (departments) regionDepartments.push(...departments)
    else regionLabels.push(region)
  }
  return {
    // Le métier cherché : les mots-clés du rail et les technologies observées, jamais la phrase.
    // Lot R (#4519) — une EXPERTISE du référentiel (« Data & IA ») part en MÉTIERS, jamais en libellé : aucune ligne de
    // la base ne s'intitule ainsi. Une compétence tapée reste telle quelle.
    terms: clean(
      [...(asked.keywords ?? []), ...(asked.technologiesObserved ?? [])].flatMap(term => [
        ...(expertiseTradeTerms(String(term ?? '')) ?? [term]),
      ]),
    ),
    city: String(asked.city ?? '').trim() || null,
    departments: clean([...(asked.departments ?? []), asked.department, ...regionDepartments]),
    regions: regionLabels,
    from: null,
    to: null,
    // Seuls les COMPTES nous intéressent ici : ce sont eux que la coupe de Découvrir menace.
    families: ['accounts'],
    accountIds: [],
    limit: cap,
    offset: 0,
  }
}
