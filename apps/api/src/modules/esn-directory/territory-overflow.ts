import {
  headcountGrowingFromReadings,
  newEstablishmentFromReadings,
  overflowScore,
  recentAwardFromAwards,
  type OverflowSignal,
  type TerritoryOverview,
} from '@bellum/contracts'
import { EsnDirectoryService } from './esn-directory.service'

/**
 * Les signaux du score de débordement qu'AUCUNE source branchée ne produit —
 * et la raison de chacun, vérifiée dans le code le 28/08/2026.
 *
 * Ils étaient passés en `null` muet, ce qui se lit « la valeur n'est pas encore
 * arrivée » alors qu'elle ne peut PAS arriver. Un audit a lu `republished: null`
 * comme un simple câblage manquant et l'a classé « meilleur rapport
 * valeur/effort » ; il n'y a rien à câbler, il y a une collecte à construire.
 * Les déclarer rend la différence lisible sans relire trois fichiers.
 *
 * ⚠️ Cette liste se RÉTRÉCIT quand une collecte apparaît — elle ne se complète
 * jamais pour faire taire un axe. Retirer une entrée sans brancher sa source
 * ferait mentir le calcul dans l'autre sens.
 */
const UNCOLLECTED_ON_TERRITORY: readonly OverflowSignal[] = [
  // Le service IA agrège les offres en un COMPTE par employeur avant de
  // répondre (`territory_overview.py`, `Counter(employer)`) : ni l'intitulé ni
  // la date d'une offre ne franchissent la frontière. Une republication et une
  // ancienneté moyenne ont toutes deux besoin de l'offre, pas de son compte.
  'republished',
  'averageOfferAgeDays',
  // `newEstablishment` en est SORTI le 15/10/2026 (#3921.8) : la relecture nocturne des ESN garde des relevés
  // d'établissements (`sirene_snapshots`) et les ouvertures datées par le registre. Il y revient PAR ESN tant
  // qu'elle n'a pas DEUX relevés — voir `withOverflowScores`. (Le référentiel garde la date de création de la
  // SOCIÉTÉ, jamais l'ouverture d'un site : les confondre ferait passer une société récente pour une implantation neuve.)
  // `headcountGrowing` en est SORTI le 09/10/2026 (#3921.b) : l'historique
  // `sirene_snapshots` lui donne deux points mesurés. Il y revient PAR ESN
  // tant qu'elle n'en a pas deux — voir `withOverflowScores`.
  // `recentAward` en est SORTI le 17/10/2026 (#3921.12) : il est dérivé de `public_awards` (marchés GAGNÉS,
  // relecture nocturne). Il y revient PAR ESN tant que ses marchés n'ont jamais été lus — voir `withOverflowScores`.
  'awardWithoutLocalPresence',
  // Les expertises connues d'une ESN ne sont stockées nulle part : on ne peut
  // pas dire qu'une techno en sort.
  'offersOutsideCoreTech',
  // Personne ne lit les offres ni les pages à la recherche d'une mention de
  // sous-traitance ; `subcontracting_evidence` n'a pas non plus d'écrivain.
  'subcontractingMentioned',
]

/**
 * Le score de DÉBORDEMENT, posé sur les ESN qu'un territoire a repérées.
 *
 * Il se calcule ICI et non côté IA parce que ses entrées viennent des DEUX
 * côtés : le volume d'offres du service IA, et la moyenne de recrutement, le
 * drapeau de risque et l'ouverture déclarée du référentiel. Le faire deux
 * fois — une par langage — produirait deux scores qui divergeraient au
 * premier ajustement.
 *
 * ⚠️ Cette dérivation vivait en méthode PRIVÉE de `TerritoryController`. Elle
 * en est sortie le 29/08/2026 parce qu'un second appelant est arrivé — l'outil
 * de territoire du copilote, qui passe par le pont interne et non par la route
 * JWT. La recopier là-bas aurait produit deux scores de débordement, qui
 * auraient divergé au premier axe ajouté : c'est exactement la faute que la
 * règle « une dérivation vit à un seul endroit » interdit.
 *
 * Une ESN en `alerte` est RETIRÉE de la liste avec sa raison (§9.3) : ne pas
 * s'adosser à quelqu'un pendant une procédure collective n'est pas de la
 * prudence excessive, c'est notre consultant qui rentrerait.
 */
export async function withOverflowScores(
  overview: TerritoryOverview,
  directory: Pick<EsnDirectoryService, 'factsByName'> &
    Partial<Pick<EsnDirectoryService, 'headcountHistoryBySiren' | 'establishmentSignalsBySiren'>>,
): Promise<TerritoryOverview> {
  const listed = overview.overflow.esn ?? []
  if (listed.length === 0) return overview
  const facts = await directory.factsByName(listed.map(item => EsnDirectoryService.normalize(item.name)))
  // #3921.b — les relevés d'effectif DATÉS des ESN connues, une seule requête.
  const sirens = [...facts.values()].map(row => row.siren).filter((s): s is string => Boolean(s))
  const history = directory.headcountHistoryBySiren ? await directory.headcountHistoryBySiren(sirens) : new Map()
  // #3921.8 — les relevés d'établissements et les ouvertures datées, une seule requête.
  const establishments = directory.establishmentSignalsBySiren
    ? await directory.establishmentSignalsBySiren(sirens)
    : new Map()

  const scored = listed.map(item => {
    const known = facts.get(EsnDirectoryService.normalize(item.name))
    const baseline = readBaseline(known?.hiringBaseline ?? null)
    const headcountGrowing = headcountGrowingFromReadings(known?.siren ? (history.get(known.siren) ?? []) : [])
    const establishment = known?.siren ? establishments.get(known.siren) : undefined
    const newEstablishment = newEstablishmentFromReadings(
      establishment?.readingDays ?? [],
      establishment?.openingDays ?? [],
    )
    // #3921.12 — les marchés gagnés lus au référentiel, ou `null` (jamais lus : ni faux ni « aucun »).
    const recentAward = recentAwardFromAwards(
      known?.publicAwards as { date?: string | null }[] | undefined,
      known?.awardsRefreshedAt,
    )
    const score = overflowScore({
      offers90d: item.offers,
      // `null` tant qu'aucun historique n'existe : l'axe Volume sort alors du
      // dénominateur (règle 2 du §19.1) au lieu de valoir zéro.
      baseline,
      // Les signaux ci-dessous valent `null` parce que RIEN ne les collecte
      // — voir `UNCOLLECTED_ON_TERRITORY`, qui le DIT au calcul.
      republished: null,
      averageOfferAgeDays: null,
      // #3921.8 — deux relevés d'établissements mesurés, ou `null` (non mesuré, jamais déduit).
      newEstablishment,
      // #3921.b — deux relevés mesurés, ou `null` (non mesuré, jamais déduit).
      headcountGrowing,
      // #3921.12 — marché GAGNÉ il y a moins de six mois, lu au référentiel ; `null` = marchés jamais lus.
      recentAward,
      awardWithoutLocalPresence: null,
      offersOutsideCoreTech: null,
      subcontractingMentioned: null,
      // Depuis le 30/08/2026 (N16), la colonne A un écrivain :
      // `EsnDirectoryService.declareSubcontracting()` la pose via l'agrégat
      // communautaire (≥ 3 espaces, D589-D593). Elle reste ABSENTE et non
      // « non collectée » quand aucun agrégat n'a encore été promu — ce n'est
      // toujours pas un signal qu'une source publique alimente.
      declaredOpen: known?.openToSubcontracting === 'oui' ? true : null,
      riskFlag: (known?.riskFlag ?? 'aucun') as 'aucun' | 'vigilance' | 'alerte',
      // Sans deux relevés mesurés, la hausse d'effectif est NOMMÉE non
      // collectée pour CETTE ESN — jamais un `null` muet.
      uncollected: [
        ...UNCOLLECTED_ON_TERRITORY,
        ...(headcountGrowing === null ? (['headcountGrowing'] as const) : []),
        ...(newEstablishment === null ? (['newEstablishment'] as const) : []),
        ...(recentAward === null ? (['recentAward'] as const) : []),
      ],
    })
    // Le service IA rend la CLÉ du référentiel (« capgemini »), parce que
    // c'est elle qui permet la jointure ci-dessus et le regroupement de deux
    // graphies d'une même ESN. L'écran, lui, doit lire un nom propre : on
    // resubstitue le libellé d'origine du référentiel dès qu'on le connaît.
    // Sans ça, la correction de l'appariement aurait affiché « capgemini » en
    // minuscules — un défaut visible créé par un correctif invisible.
    const name = known?.inputName || item.name
    return { ...item, name, score }
  })

  const excluded = scored.filter(item => item.score.excluded)
  return {
    ...overview,
    overflow: {
      ...overview.overflow,
      esn: scored.filter(item => !item.score.excluded),
      // Ce qui est retiré est DIT, jamais escamoté : « je ne te la propose
      // plus » est une information, sa disparition silencieuse n'en est pas.
      reason:
        excluded.length > 0
          ? [overview.overflow.reason, ...excluded.map(item => `${item.name} — ${item.score.exclusionReason}`)]
              .filter(Boolean)
              .join(' · ')
          : (overview.overflow.reason ?? null),
    },
  }
}

/** La moyenne trimestrielle stockée, ou `null` si elle n'a pas encore de sens. */
function readBaseline(stored: Record<string, unknown> | null): number | null {
  const value = stored?.['quarterlyAverage']
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
