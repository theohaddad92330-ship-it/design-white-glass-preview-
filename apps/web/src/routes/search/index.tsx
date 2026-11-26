import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { analysisGeoPerimeterSchema, analysisScopeModeSchema, discoverOriginCriteriaSchema } from '@bellum/contracts'
import { CustomerPage } from '@/components/page/CustomerPage'
import { Search } from '@/features/search/view/Search'

/** #2162.27 — le routeur analyse chaque valeur en JSON (`2026` → nombre) : on la
 *  rend texte ; toute autre forme tombe à `undefined` plutôt que de casser la route. */
const presetParam = z
  .preprocess(value => (typeof value === 'number' || typeof value === 'boolean' ? String(value) : value), z.string())
  .optional()
  .catch(undefined)

/** #4432.5 — les régions en lien partageable : `zone_regions=A&zone_regions=B` (tableau) OU
 *  `zone_regions=A,B` (texte à virgules) donnent la même liste ; tout le reste tombe à `undefined`. */
const zoneRegionsParam = z
  .preprocess(
    value => {
      const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : undefined
      const names = raw
        ?.filter((v): v is string => typeof v === 'string')
        .map(v => v.trim())
        .filter(Boolean)
      return names?.length ? names : undefined
    },
    z.array(z.string().max(60)).max(18).optional(),
  )
  .catch(undefined)

export const searchSchema = z.object({
  /** #4432.5 — `/search?q=Safran` préremplit le champ entreprise (même rôle que `company`). */
  q: z.string().optional().catch(undefined),
  /** #4432.5 — régions du périmètre, en lien direct (voir `zoneRegionsParam`). */
  zone_regions: zoneRegionsParam,
  /** « Mes analyses » : `?vue=historique` ouvre l'historique d'analyses de l'espace (même route, autre vue). */
  vue: z.enum(['historique']).optional().catch(undefined),
  /** Optional account UUID to retry — Search will fetch it for company_name + user_context. */
  accountId: z.string().guid().optional(),
  /** Fallback display value while the account fetch resolves. */
  company: z.string().optional(),
  /** AnalysisDraft (Théo p.10) : périmètre choisi, persisté pour reprendre le
   *  brouillon après refresh/navigation. `.catch` tolère une valeur legacy/inconnue. */
  scope: analysisScopeModeSchema.optional().catch(undefined),
  /** #3742 — la ZONE géographique du cadrage de la dernière analyse, reprise par
   *  « Actualiser l'analyse » (`useAccountRelaunch`). Valeur INITIALE du récap de
   *  cadrage, toujours modifiable avant le débit. */
  geo: analysisGeoPerimeterSchema.optional().catch(undefined),
  geoAreas: z.array(z.string().trim().min(1).max(200)).max(20).optional().catch(undefined),
  /** #4432.2 — la ZONE de la recherche d'origine (Découvrir, cartes de Laura) : périmètre présélectionné de
   *  « Où ? », modifiable, élargissable à la France d'un clic. Une forme illisible tombe, la route ne casse pas. */
  zone: z.string().trim().min(1).max(200).optional().catch(undefined),
  /** Origine « suggestion » (Théo P0 §5) : un clic sur une suggestion de
   *  première analyse ouvre /search en pré-remplissant un brouillon ÉDITABLE.
   *  Ces deux champs ne font que TRACER la suggestion d'origine — ils
   *  n'imposent ni la société (`company`) ni le périmètre (`scope`), et sont
   *  purgés dès que l'utilisateur édite le nom (voir `Search.tsx`).
   *  `.catch(undefined)` tolère une URL partagée/legacy sans casser la route. */
  suggestionId: z.string().optional().catch(undefined),
  suggestionReason: z.string().optional().catch(undefined),
  /** #3819 (lot RBB) — les critères Découvrir posés ET satisfaits (secteur, zone,
   *  effectif, signal), persistés sur le compte au lancement. Purgés avec l'origine. */
  suggestionCriteria: discoverOriginCriteriaSchema.optional().catch(undefined),
  /**
   * #2162.27 — permet d'ouvrir `/search` avec le contexte libre déjà rédigé
   * (ex. Laura qui ouvre l'écran pré-rempli). Purement une VALEUR INITIALE
   * (comme `company`) : le champ reste éditable, rien n'est verrouillé.
   */
  context: z.string().optional().catch(undefined),
  /**
   * #2162.27 / épopée #2892 — le preset STRUCTURÉ, en lien PLAT : `preset`
   * puis un paramètre par champ, du nom du schéma (`analysis-context.ts`).
   * Lus par `analysisContextFromSearch` (`@bellum/contracts`), qui jette ce
   * qui n'appartient pas au preset annoncé. La garde
   * `laura-deep-links.test.ts` exige que chaque champ de chaque preset soit
   * déclaré ici — un champ oublié serait retiré par le routeur en silence.
   */
  preset: presetParam,
  offer: presetParam,
  pricing: presetParam,
  differentiation: presetParam,
  idealMission: presetParam,
  commercialStatus: presetParam,
  lastInteraction: presetParam,
  openOpportunity: presetParam,
  revenueOrPipeline: presetParam,
  incumbentName: presetParam,
  incumbentScope: presetParam,
  contractEndDate: presetParam,
  weakness: presetParam,
  signalType: presetParam,
  source: presetParam,
  signalDate: presetParam,
  implication: presetParam,
  prioritizationReason: presetParam,
  targetDecisionMaker: presetParam,
  potentialVolume: presetParam,
  closingHorizon: presetParam,
  similarReference: presetParam,
  missingFromPrevious: presetParam,
  newAngle: presetParam,
  hypothesis: presetParam,
})

export const Route = createFileRoute('/search/')({
  validateSearch: searchSchema,
  component: SearchPage,
})

/**
 * Coque Théo : la barre du haut porte le fil (« Analyser un compte », « … › Mes analyses ») ; le titre,
 * sa phrase, les actions et « Comment travailler ici ? » sont dessinés par l'écran (`AnalyzeHeader`,
 * `.an21-header` de la maquette) — la question « Quel compte veux-tu comprendre ? » n'est pas le nom du
 * fil, et l'en-tête de la coque ne montre aucun titre dès qu'un fil est déclaré. `skipHeader` retire
 * donc l'en-tête de la coque, jamais la barre du haut ; il n'y a qu'un h1 (GA-347).
 */
function SearchPage() {
  const { vue } = Route.useSearch()
  const { t } = useTranslation('search')

  if (vue === 'historique') {
    return (
      <CustomerPage
        contentClassName="px-0 py-0 min-h-full"
        skipHeader
        pageTitle={t('analyze.history.title')}
        breadcrumbs={[{ label: t('analyze.crumbRoot'), to: '/search' }, { label: t('analyze.myAnalyses') }]}
      >
        <Search />
      </CustomerPage>
    )
  }

  return (
    <CustomerPage
      contentClassName="px-0 py-0 min-h-full"
      skipHeader
      pageTitle={t('analyze.title')}
      breadcrumbs={[{ label: t('analyze.crumbRoot') }]}
    >
      <Search />
    </CustomerPage>
  )
}
