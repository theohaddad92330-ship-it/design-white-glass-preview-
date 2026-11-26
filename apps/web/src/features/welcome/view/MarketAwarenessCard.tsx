import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Network } from 'lucide-react'
import { Button, Card, Text } from '@bellum/ui'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useMarketContextSearch } from '@/features/search/hooks/useMarketContextSearch'
import { ToggleChip } from '@/features/discover/view/filter-controls'
import { applyEsnOnlyFilter, marketFitFor } from '@/features/discover/lib/market-context'
import { deriveMarketAwarenessQuery } from '../lib/market-awareness'

/**
 * #1627 — LA PREMIÈRE VALEUR MARCHÉ, À L'ONBOARDING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour demande : « après le Profil ESN, avant CRM/messagerie/analyse ».
 * `/welcome` EST cet endroit — l'écran qui suit la dernière sous-étape du
 * questionnaire Temps 1 (`useOnboardingNavigation` y navigue à la complétion)
 * et qui précède `SituationPicker`, dont les quatre situations mènent vers
 * Découvrir, les comptes, le vivier ou l'import CRM. Le lot 12 a ajouté un 6e
 * jalon d'activation (`tool_connected`, `ActivationChecklist`) : ce n'est PAS
 * le même mécanisme — celui-là vit sur le tableau de bord, APRÈS l'onboarding,
 * et suit des jalons différents (analyse lancée, dossier consulté…). Il n'y a
 * rien à y insérer pour cette carte-ci.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RÉUTILISÉ, PAS RECRÉÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le moteur est celui de #1626 (`MarketMemoryService.searchByFilters`, via
 * `useMarketContextSearch` — MÊME hook, MÊME endpoint `GET /companies
 * /market-context-search`, ZÉRO crédit). Le recoupement expertise × pile
 * observée est `marketFitFor` (`@/features/discover/lib/market-context`), le
 * MÊME que Découvrir et le vivier : deux appariements écrits séparément
 * divergeraient, et celui-ci a déjà appris à ses dépens que `C#` et `Go` sont
 * des noms courts et pas des mots vides. Le patron de vocabulaire (« Observé »,
 * jamais « en place » ; la mention de gratuité) est celui de `MarketPreviewCard`
 * (#1589.2) — la même doctrine, un contexte différent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE DIT PAS, ALORS QUE LE RETOUR LE PROPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour écrit « présentent une forte affinité ». Il n'y a pas de gradation
 * ici, et ce n'est pas un oubli : `MarketStructuralFitCard` (#1635.4) puis
 * `marketFitFor` (#1626) ont tranché deux fois cette question exacte, sur ce
 * recoupement exact — « dire "forte affinité" demanderait de comparer chaque
 * compte à des entreprises de taille et de secteur voisins, ce qu'on ne sait
 * pas encore faire ». Ce qui est affiché à la place est DÉCOMPOSÉ : les
 * expertises déclarées que la pile observée retrouve, NOMMÉES une par une, et
 * combien d'environnements les portent. Le lecteur juge le rapprochement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS INTERDITS DU RETOUR, ET COMMENT ILS SONT TENUS
 * ─────────────────────────────────────────────────────────────────────────────
 * · Aucun compte n'est créé automatiquement — cette carte ne fait qu'une
 *   LECTURE (`GET`), il n'y a structurellement aucun chemin d'écriture ici.
 * · Aucune analyse n'est lancée — le CTA navigue vers Découvrir, il ne
 *   déclenche rien côté serveur.
 * · Jamais « opportunités » ni « ils recrutent aujourd'hui » — le texte ne
 *   parle que d'« environnements » et d'« observé » ; `market-awareness.test.ts`
 *   et `MarketAwarenessCard.test.tsx` gardent le vocabulaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RIEN N'EST BLOQUANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans zone territoriale ni expertise déclarée, `deriveMarketAwarenessQuery`
 * rend `null` et cette carte ne rend RIEN — jamais un état d'erreur, jamais une
 * case à cocher supplémentaire avant de pouvoir avancer. Un onboarding qui
 * refuse d'avancer ferme le produit à qui n'a pas encore de données.
 */
export function MarketAwarenessCard() {
  const { t } = useTranslation('welcome')
  const navigate = useNavigate()
  const { data: esnAnswers } = useEsnProfile()
  const query = deriveMarketAwarenessQuery(esnAnswers)
  const { data: read, isPending } = useMarketContextSearch(query)
  // #2074.21 — le filtre « recours externe observé uniquement », EN PLUS de
  // l'affichage du compte : Louis a tranché les deux (15/09), contre la
  // recommandation. `applyEsnOnlyFilter` est le MÊME post-filtre que
  // l'ex-`MarketObservedSection.tsx` de Découvrir (retirée 31/10 ; GA-26, pas un second calcul).
  const [externalRecourseOnly, setExternalRecourseOnly] = useState(false)

  if (!query || isPending || !read || read.status !== 'ok' || read.matches.length === 0) return null

  const declared = esnAnswers?.expertise_areas ?? []

  /**
   * #2074.21 — combien d'environnements portent un recours externe OBSERVÉ
   * (`coverage.esnObserved`, déjà mesuré par la mémoire marché — GA-259/c65 :
   * ce bloc de couverture mesure ce qu'on SAIT, jamais ce que le marché FAIT).
   * `0` n'affiche RIEN : un recours externe qui n'existe pas encore dans nos
   * sources n'est pas la même chose qu'un « aucun » mesuré à zéro sur un axe
   * qui, lui, se serait tu (#2067/#2074 nuance).
   */
  const environmentsWithExternalRecourse = read.matches.filter(item => item.coverage.esnObserved.length > 0).length
  const visibleMatches = applyEsnOnlyFilter(read.matches, externalRecourseOnly)

  /**
   * Les expertises DÉCLARÉES que la pile observée retrouve, dédupliquées et
   * rendues dans l'ordre DÉCLARÉ — l'utilisateur doit reconnaître sa propre
   * liste, pas en découvrir une réordonnée selon un critère qu'on ne lui
   * explique pas (même règle que `matchingExpertises`).
   */
  const matchedNames = new Set<string>()
  let environmentsWithFit = 0
  for (const item of visibleMatches) {
    const fit = marketFitFor(item.coverage, declared)
    if (fit.label !== 'matched') continue
    environmentsWithFit += 1
    for (const name of fit.matched) matchedNames.add(name)
  }
  const matchedExpertises = declared.filter(name => matchedNames.has(name))

  const goToDiscover = () => {
    void navigate({
      to: '/discover',
      search: {
        ...(query.technology ? { mc_technology: query.technology } : {}),
        ...(query.location ? { mc_location: query.location } : {}),
        // #2074.21 — le filtre voyage jusqu'à Découvrir : `marketContextFiltersFromSearch`
        // lit `mc_esnOnly` et préremplit le MÊME panneau, plutôt qu'un second réglage à retenir.
        ...(externalRecourseOnly ? { mc_esnOnly: 'true' } : {}),
      },
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Network className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h2" size="base" weight="semibold">
          {t('marketAwareness.title', { count: visibleMatches.length })}
        </Text>
      </div>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {query.location
          ? t('marketAwareness.criteriaLocation', { location: query.location })
          : t('marketAwareness.criteriaTechnology', { technology: query.technology })}
      </Text>
      {/* #2090.44 — DÉCISION Louis 22/09 soir (§1, reco appliquée) : le retour
          demandait « Ces entreprises ne sont pas encore des opportunités »,
          mais le mot lui-même reste interdit sur cet écran (garde EXISTANTE,
          `MarketAwarenessCard.test.tsx`) — le sens est rendu SANS lui. */}
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('marketAwareness.notYetTracked')}
      </Text>
      {matchedExpertises.length > 0 ? (
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {/* R15N-12 — mesuré en production : « 20 environnements » puis « 20
              d'entre eux » trois mots plus loin, l'antécédent de « d'entre
              eux » vivant dans le TITRE au-dessus. Quand le compte OBSERVÉ
              égale le total annoncé, la phrase le dit au lieu de répéter le
              même nombre ; la fraction ne s'écrit que quand les deux diffèrent. */}
          {environmentsWithFit === visibleMatches.length
            ? t('marketAwareness.expertiseOverlapAll', {
                count: environmentsWithFit,
                expertises: matchedExpertises.join(' · '),
              })
            : t('marketAwareness.expertiseOverlap', {
                count: environmentsWithFit,
                expertises: matchedExpertises.join(' · '),
              })}
        </Text>
      ) : null}
      {environmentsWithExternalRecourse > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('marketAwareness.externalRecourseObserved', { count: environmentsWithExternalRecourse })}
          </Text>
          {/* Une bascule seule passe par la pastille partagée (GA-249). */}
          <ToggleChip active={externalRecourseOnly} onClick={() => setExternalRecourseOnly(value => !value)}>
            {t('marketAwareness.externalRecourseOnlyToggle')}
          </ToggleChip>
        </div>
      ) : null}
      <Button type="button" variant="default" size="default" className="mt-3" onClick={goToDiscover}>
        {t('marketAwareness.cta')}
      </Button>
      <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
        {t('marketAwareness.freeOfCharge')}
      </Text>
      {/* #2074.26 — l'autre moitié de « première valeur gratuite » : cette
          carte ne fait qu'une LECTURE (voir docblock, « LES TROIS
          INTERDITS »), le dire évite qu'on le suppose. */}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('marketAwareness.noAutoAccount')}
      </Text>
    </Card>
  )
}
