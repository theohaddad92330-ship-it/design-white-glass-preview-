import type { BuyerRoleFamilyKey, DiscoverResultType } from '@bellum/contracts'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import type { DiscoverContactFilters } from './discover-contact-rows'

/**
 * Presets de recherche (restitution V2 §17, migration douce §18-19).
 *
 * « Ajouter des presets : comptes accessibles, comptes qui recrutent, comptes en
 * transformation, comptes proches de vos références. » Chaque preset PRÉ-REMPLIT
 * le rail unifié (il ne fait rien d'autre) : ses filtres restent visibles et
 * modifiables ensuite, c'est un point de départ, pas une boîte noire.
 *
 * Aucun filtre fantôme : un preset qui ne saurait pas s'exprimer avec les
 * contrôles réels du rail n'existe pas ici.
 */
type DiscoverPresetId =
  | 'accessible'
  | 'middleMarket'
  | 'hiring'
  | 'transforming'
  | 'movingNow'
  | 'compatibleWithOffer'
  | 'likeReferences'
  | 'esnPartners'
  | 'decisionMakersOnExpertise'
  | 'externalRecourseObserved'
  | 'subsidiariesOfGroups'

/**
 * #2165.12 / #2165.13 — pourquoi un preset sourcé peut n'avoir RIEN à poser.
 *
 * « Non mesuré n'est jamais 0 » (CLAUDE.md, doctrine) : un preset qui n'a pas
 * sa source ne pose PAS un filtre deviné, il se désactive et LE DIT — l'écran
 * lit `disabledReason` pour écrire la phrase, jamais un texte générique.
 */
type DiscoverPresetDisabledReason = 'no_offer_sectors' | 'no_best_reference'

export interface DiscoverPreset {
  id: DiscoverPresetId
  /** Ce que le preset pose sur le rail (le reste repart de zéro). */
  patch: Partial<UnifiedFilters>
  /**
   * #2165.19 — le TYPE DE RÉSULTAT sur lequel le preset atterrit, quand ce
   * n'est pas « Comptes ».
   *
   * Un preste qui pose « lis le marché ESN » et laisse l'écran sur une liste de
   * comptes à conquérir dit deux choses contraires en un clic. Absent = le
   * preset ne touche pas au type choisi.
   */
  resultType?: DiscoverResultType
  /**
   * #2165.18 (17/09/2026) — ce que le preset pose sur les filtres de
   * PERSONNES, quand il atterrit sur `resultType: 'contacts'`. Même principe
   * que `patch` côté comptes : un point de départ visible et modifiable,
   * jamais une boîte noire. Absent = le preset ne touche pas aux filtres de
   * personnes.
   */
  contactFiltersPatch?: Partial<DiscoverContactFilters>
  /** #2165.12 / #2165.13 — absent = le preset s'applique normalement. Présent
   *  = sa SOURCE (profil ESN ou meilleure référence) est vide ; `patch` est
   *  alors `{}` et l'écran doit désactiver le bouton plutôt que l'appliquer. */
  disabledReason?: DiscoverPresetDisabledReason
}

/**
 * Les sources réelles que #2165.12 et #2165.13 demandent, calculées par
 * l'appelant (l'écran, qui seul sait lire le portefeuille d'offre et les
 * comptes marqués « meilleure référence ») et injectées ici en LECTURE
 * seule — cette fonction ne va chercher aucune donnée elle-même.
 */
interface DiscoverPresetSources {
  /**
   * #2165.12 — les secteurs déclarés dans le portefeuille d'offre
   * (`OfferPortfolio.target_application_sectors`, déjà des codes normalisés).
   * Vide = l'ESN n'a rien déclaré : le preset se désactive plutôt que de
   * proposer « tous secteurs », qui n'est pas ce qu'elle a dit.
   */
  offerSectorCodes?: readonly string[]
  /**
   * #2804 (#2291.2) — les zones de chasse déclarées au portefeuille d'offre
   * (`OfferPortfolio.target_geographies`), déjà traduites en codes région du
   * rail par l'appelant (`offerTargetRegionCodes`, la SEULE traduction — un
   * second mapping ici en serait une copie, GA-26). Vide = aucune zone
   * déclarée : le preset ne pose alors aucune contrainte de territoire,
   * jamais « France entière » devinée.
   */
  offerRegionCodes?: readonly string[]
  /**
   * #2804 (#2291.2) — la famille de rôle acheteur déclarée au portefeuille
   * d'offre (`OfferPortfolio.preferred_buyer_role_families`), déjà résolue
   * en clé du référentiel par l'appelant (`offerTargetBuyerRole`, la SEULE
   * résolution — GA-26). `null` = rien de déclaré, rien de reconnu, ou
   * plusieurs familles distinctes déclarées à la fois (aucune n'est LA
   * famille, même prudence que `offerRegionCodes`).
   */
  offerBuyerRole?: BuyerRoleFamilyKey | null
  /**
   * #2165.13 — les secteurs des comptes marqués « meilleure référence »,
   * déjà résolus en codes (`matchApplicationSectors` côté appelant, le même
   * normaliseur que l'ICP — pas un second). Vide = aucune référence marquée.
   */
  bestReferenceSectorCodes?: readonly string[]
}

/**
 * #4361.1 — la définition du « middle market » : un seul endroit (GA-26), lu par le préréglage ET
 * par la puce du rail. Effectif 250 à 4 999 (borne haute = la grande entreprise du registre) et
 * sociétés PROUVÉES cotées retirées — une cotation non établie ne retire rien.
 */
export const MIDDLE_MARKET_PATCH: Pick<UnifiedFilters, 'headcount' | 'excludeListed'> = {
  headcount: ['250-4999'],
  excludeListed: true,
}

/** La puce « Middle market » est active quand LES DEUX moitiés sont posées. */
export function isMiddleMarketActive(filters: Pick<UnifiedFilters, 'headcount' | 'excludeListed'>): boolean {
  return filters.excludeListed && filters.headcount.includes('250-4999')
}

/**
 * #4572.5 — REVIENT sur #4572 (qui gardait l'union des zones de chasse comme volontaire) : Louis demande la
 * correction à la source. La carte « Territoire » est UNE zone : un clic ⇒ UNE région (la première déclarée),
 * jamais `region=11,44`. Les autres zones restent posables à la main dans la rubrique Territoire.
 */
export function withSingleRegion(preset: DiscoverPreset): DiscoverPreset {
  const regions = preset.patch.region ?? []
  if (regions.length <= 1) return preset
  return { ...preset, patch: { ...preset.patch, region: regions.slice(0, 1) } }
}

/**
 * #4572.6 — la carte « Territoire » ne promet que ce que son clic POSE : l'indice dit « secteurs et zone » seulement
 * quand les deux partent, sinon il nomme celui qui part (la puce secteur resterait « Tous les secteurs » — on ne
 * promet pas un territoire cadré qu'on ne cadre pas). Clé de `overview.*` (fr/en).
 */
export function territoryTrackHintKey(
  patch: Pick<Partial<UnifiedFilters>, 'sectors' | 'region'>,
):
  | 'trackTerritoryHint'
  | 'trackTerritoryHintRegionOnly'
  | 'trackTerritoryHintSectorsOnly'
  | 'trackTerritoryHintNothing' {
  const hasSectors = (patch.sectors?.length ?? 0) > 0
  const hasRegion = (patch.region?.length ?? 0) > 0
  if (hasSectors && hasRegion) return 'trackTerritoryHint'
  if (hasRegion) return 'trackTerritoryHintRegionOnly'
  if (hasSectors) return 'trackTerritoryHintSectorsOnly'
  return 'trackTerritoryHintNothing'
}

/** Poser la puce, ou la retirer d'un clic — les autres tranches cochées restent. */
export function toggleMiddleMarket(
  filters: Pick<UnifiedFilters, 'headcount' | 'excludeListed'>,
): Pick<UnifiedFilters, 'headcount' | 'excludeListed'> {
  if (isMiddleMarketActive(filters)) {
    return { headcount: filters.headcount.filter(range => range !== '250-4999'), excludeListed: false }
  }
  return {
    headcount: filters.headcount.includes('250-4999') ? filters.headcount : [...filters.headcount, '250-4999'],
    excludeListed: true,
  }
}

/**
 * Les presets, dans l'ordre d'affichage. Aucun n'impose de secteur au hasard :
 * le secteur pertinent vient du profil ESN (« Appliquer ma cible »), de la
 * source d'un preset sourcé (`sources`), ou du choix du commercial — un
 * preset n'a pas à le deviner à sa place.
 */
export function discoverPresets(sources: DiscoverPresetSources = {}): DiscoverPreset[] {
  const offerSectorCodes = sources.offerSectorCodes ?? []
  const offerRegionCodes = sources.offerRegionCodes ?? []
  const offerBuyerRole = sources.offerBuyerRole ?? null
  const bestReferenceSectorCodes = sources.bestReferenceSectorCodes ?? []

  return [
    // PME/ETI : la taille où une ESN atteint le décideur sans référencement groupe.
    { id: 'accessible', patch: { headcount: ['50-249'] } },
    // #4361.1 — « Middle market » : 250 à 4 999 salariés ET sociétés cotées retirées, en UNE puce.
    { id: 'middleMarket', patch: MIDDLE_MARKET_PATCH },
    // Recrutement IT en cours = budget déjà voté (même lecture que la Veille).
    // #2616.2 — « budget déjà voté » suppose une décision d'achat SPONTANÉE :
    // un employeur PUBLIC recrute sur un cycle budgétaire et un concours
    // fixés d'avance, pas sur une opportunité qu'un commercial déclenche.
    // `excludePublicEmployers` l'écarte (`applyRailConstraints`), au niveau
    // du preset et non d'un réglage visible au rail — voir le rapport du lot.
    { id: 'hiring', patch: { signalSources: ['hiring'], sinceDays: 90, excludePublicEmployers: true } },
    // Marchés publics ouverts + attributions récentes : une organisation qui
    // achète est une organisation qui change.
    { id: 'transforming', patch: { signalSources: ['tender', 'award'], sinceDays: 180 } },
    // #2165.15 — RÉFUTÉ en prod le 19/09 : « Qui bougent actuellement »
    // n'existait pas parmi les 9 pistes, et « Comptes en transformation » ne
    // pose QUE tender/award. Ce que les trois presets signal se partagent
    // n'est pas la NATURE (déjà distinguée par `hiring`/`transforming`), c'est
    // la FRAÎCHEUR : ce preset pose les TROIS sources que le rail sait
    // demander (`SIGNAL_SOURCES` — `legal`/`tech` sont rendus mais jamais
    // demandables à la source, `hasSignalOfNature`) sur la fenêtre la plus
    // courte du rail (`RECENCY_WINDOWS`, 30 j) : « en ce moment », pas « ces
    // 6 derniers mois ».
    { id: 'movingNow', patch: { signalSources: ['tender', 'award', 'hiring'], sinceDays: 30 } },
    // #2165.12 — « Compatibles avec mon offre » : les secteurs que l'ESN a
    // ELLE-MÊME déclarés dans son portefeuille d'offre (Réglages › Profil),
    // pas un mapping deviné entre un domaine de conseil et des codes NAF.
    // #2804 (#2291.2) — et désormais la ZONE, quand le portefeuille en porte
    // une (`target_geographies`, traduite en amont par `offerTargetRegionCodes`),
    // et le RÔLE ACHETEUR, quand une SEULE famille s'en résout
    // (`preferred_buyer_role_families`, traduite en amont par
    // `offerTargetBuyerRole`) — posé côté CONTACTS (`expertise`), le seul
    // filtre que ce référentiel arme, indépendamment du type de résultat sur
    // lequel ce preset atterrit (comme `esnPartners` pré-remplit son propre
    // filtre sans changer `resultType`). Les trois axes sont INDÉPENDANTS : un
    // seul déclaré pose CET axe seul — même règle que `discoverCapacityNotice`
    // (« un axe non évaluable sort du dénominateur »). Rien de déclaré sur
    // AUCUN des trois ⇒ désactivé, DIT (doctrine : jamais « tous secteurs »,
    // « toutes régions » ni « tout rôle » à la place d'un silence).
    {
      id: 'compatibleWithOffer',
      patch: {
        ...(offerSectorCodes.length > 0 ? { sectors: [...offerSectorCodes] } : {}),
        ...(offerRegionCodes.length > 0 ? { region: [...offerRegionCodes] } : {}),
      },
      ...(offerBuyerRole ? { contactFiltersPatch: { expertise: offerBuyerRole } } : {}),
      disabledReason:
        offerSectorCodes.length > 0 || offerRegionCodes.length > 0 || offerBuyerRole ? undefined : 'no_offer_sectors',
    },
    // #2165.13 — CORRIGÉ : posait avant une tranche d'effectif et un âge
    // FIXES (`250-999`, `3to10`), jamais lus sur une vraie référence — la
    // valeur inventée que la doctrine interdit. Lit maintenant les secteurs
    // des comptes que le commercial a lui-même marqués « meilleure
    // référence » (`AccountsService.bestReferenceSectors`, un seul chemin de
    // lecture). Aucune référence marquée ⇒ désactivé, DIT.
    {
      id: 'likeReferences',
      patch: bestReferenceSectorCodes.length > 0 ? { sectors: [...bestReferenceSectorCodes] } : {},
      disabledReason: bestReferenceSectorCodes.length > 0 ? undefined : 'no_best_reference',
    },
    // #2151.29 (16/09/2026) — même moisson, lue en prospection PARTENAIRE : la
    // même bascule que le rail expose déjà sous « Tous les filtres »
    // (`FilterRail.tsx:434-439`), en entrée visible. `entityType` ne prend
    // effet qu'en mode SIGNAUX (`SignalsFilters`, `discover-query.ts:251`) —
    // sans signal coché la requête retombe en mode registre, qui l'ignore et
    // rendrait un preset qui ne fait rien. Les trois signaux existants
    // (marché public gagné/attribué, recrutement) : une ESN qui en montre au
    // moins un est une ESN active, donc un partenaire qui vaut d'être qualifié.
    // #2165.19 (16/09/2026) — et il ATTERRIT sur la liste de partenaires
    // désormais qu'elle existe : poser « lis le marché ESN » pour rendre une
    // liste de comptes à conquérir disait deux choses contraires en un clic.
    {
      id: 'esnPartners',
      patch: { entityType: 'esn', signalSources: ['tender', 'award', 'hiring'], sinceDays: 180 },
      resultType: 'partners',
    },
    // #2165.18 (17/09/2026) — « Décideurs sur une expertise » : atterrit sur
    // le type de résultat CONTACTS, avec le niveau posé sur « N-1 » — le
    // libellé que le produit donne DÉJÀ au décideur (`LEVEL_LABELS.n1 =
    // "N-1 (décideur)"`, `coverage.service.ts`), pas le sponsor C-Level.
    // L'EXPERTISE reste à `any` : c'est le contrôle que ce preset EXPOSE
    // (comme `entityType` pour `esnPartners`), pas une valeur qu'il devine à
    // la place du commercial. Pas de `patch` côté comptes : la recherche de
    // personnes ne dépend d'aucun critère registre/signal (`Discover.tsx`,
    // « un moteur à part »).
    {
      id: 'decisionMakersOnExpertise',
      patch: {},
      resultType: 'contacts',
      contactFiltersPatch: { level: 'n1' },
    },
    // #2165.14 (17/09/2026) — « Avec recours externe observé » : filtre SERVEUR
    // sur la mémoire marché (#2165.30, `externalRecourseObserved`), pas une
    // heuristique côté écran. DÉCISION Louis 17/09 midi (QCM Découvrir) : le
    // recours externe se lit par ESN OBSERVÉE (`observed-esn.ts`), et un
    // compte non observé n'est jamais compté « sans recours externe »
    // (doctrine c65, GA-259) — le preset pose `true`, jamais `false`.
    { id: 'externalRecourseObserved', patch: { externalRecourseObserved: true } },
    // #2165.16 (17/09/2026) — « Filiales accessibles de grands groupes » :
    // filiale (pas la tête, verrouillée et déjà travaillée par tout le monde)
    // d'une taille où une ESN atteint le décideur sans référencement groupe
    // (même borne que le preset « accessible » ci-dessus). N'affiche que des
    // comptes déjà possédés dont le lien capitalistique est résolu
    // (`groupRole`, #2165.24) — un candidat neuf n'a pas encore ce fait.
    { id: 'subsidiariesOfGroups', patch: { groupRole: 'filiale', headcount: ['50-249'] } },
  ]
}

type PresetPatch = { patch: Partial<UnifiedFilters> }

/**
 * #4530.3 — une carte (piste) est ACTIVE quand tout ce qu'elle pose est déjà posé sur le rail : un 2ᵉ clic la retire
 * (bascule) au lieu de ne rien faire. Un preset sans critère n'est jamais actif.
 */
export function isPresetActive(preset: PresetPatch, filters: UnifiedFilters): boolean {
  const entries = Object.entries(preset.patch).filter(([, value]) => !(Array.isArray(value) && value.length === 0))
  if (entries.length === 0) return false
  return entries.every(([key, value]) => {
    const current = (filters as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) return Array.isArray(current) && value.every(item => current.includes(item))
    return current === value
  })
}

/** #4530.3 — le rail sans les critères que le preset avait posés (les autres réglages restent). */
export function withoutPreset(preset: PresetPatch, filters: UnifiedFilters): UnifiedFilters {
  const next = { ...filters } as unknown as Record<string, unknown>
  const empty = emptyUnifiedFilters() as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(preset.patch)) {
    const current = next[key]
    if (Array.isArray(value) && Array.isArray(current)) {
      const posed: readonly unknown[] = value
      next[key] = (current as unknown[]).filter(item => !posed.includes(item))
    } else next[key] = empty[key]
  }
  return next as unknown as UnifiedFilters
}
