import { Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { hasPermission, pilotageCoverage } from '@bellum/contracts'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Completeness } from '@/components/primitives/Completeness'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useInterventions } from '@/features/playbooks/api'
import { PlaybooksSummary } from '@/features/playbooks/view/PlaybooksSummary'
import { useSession } from '@/lib/hooks/use-session'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { pilotageApi } from '../api'
import { orderCockpitBlocks, type CockpitBlockId } from '../lib/cockpit-block-order'
import { knownDestinations } from '../quality/lib/destinations'
import { ChainAlertsBadge } from './ChainAlertsBadge'
import { alertingLevels } from './chain-alerts'
import { ChainCompact } from './ChainCompact'
import { ChainStrip } from './ChainStrip'
import { InterestPenetrabilityPortfolioPanel } from './InterestPenetrabilityPortfolioPanel'
import { MaillonGlossary } from './MaillonGlossary'
import { MonthObjectiveBlock } from './MonthObjectiveBlock'
import { WeekDeltaFold } from './WeekDeltaStrip'
import { pilotageLauraContext } from './pilotage-laura-context'
import { WorkspaceLearningPanel } from './WorkspaceLearningPanel'
import { CockpitCash } from './cockpit/CockpitCash'
import { CockpitDecisions } from './cockpit/CockpitDecisions'
import { CockpitPipeEvolution } from './cockpit/CockpitPipeEvolution'
import { CockpitStages } from './cockpit/CockpitStages'
import { CockpitCoverage } from './cockpit/CockpitCoverage'
import { CockpitTiles } from './cockpit/CockpitTiles'
import { CockpitFold } from './cockpit/cockpit-ui'
import { useCockpitFigures } from './cockpit/useCockpitFigures'
import { PartnerGovernancePanel } from './PartnerGovernancePanel'
import { ContributionPanel } from './ContributionPanel'
import { WeakestLinkDiagnosisSection } from '@/features/weakest-link-diagnosis/WeakestLinkDiagnosisSection'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { TrajectoryVerdict } from '@/features/dashboard/components/personal/TrajectoryVerdict'

/**
 * Pilotage › COCKPIT — KPI de chaîne (annexe méthodo p24). Corps de la section `#cockpit` de la page Pilotage
 * (Théo D, Louis 22/10/2026 : une page, quatre sections ancrées) ; la page elle-même est `PilotagePage`.
 *
 * ⚠️ Louis 23/10 — LE COCKPIT DE THÉO REMPLACE CELUI DE PR11 : tuiles, « Trois décisions à prendre », cap et
 * encaissement, évolution du pipe et étapes, plis « Ce qui a bougé », « La chaîne commerciale » et « Détail »
 * (`./cockpit/*`, branche theo-refonte-pilotage). Il est monté ICI, dans la section, et plus par sa propre page :
 * c'est cette page-là qui plantait au chargement direct (elle comptait sur `ManagerTabRoute`, supprimé) ; la
 * porte de l'offre est lue par la route (`routes/pilotage/index.tsx`), le droit par section par `PilotagePage`.
 *
 * « Mesurer la chaîne, pas seulement le volume. » Les huit maillons
 * (acquisition → qualité Bellum), chacun avec ses indicateurs et un seuil
 * d'alerte : un maillon qui décroche se voit AVANT le résultat. Ce qui n'est pas
 * capté (TJM, marge, DSO) est affiché « non mesuré », jamais un faux chiffre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE LA PAGE — #1440, et il n'est pas décoratif
 * ─────────────────────────────────────────────────────────────────────────────
 * *« En 10 secondes, il doit savoir : où le système décroche → pourquoi → quels
 * dossiers sont concernés → quelle décision prendre → où cliquer pour agir. »*
 * D'où la descente : ce qui ATTEND une décision d'abord (la bande, puis la file
 * d'arbitrage), ce qui MESURE ensuite (la chaîne), ce qui EXPLIQUE en dernier
 * (impact, patterns, synthèses, dictionnaire).
 *
 * ⚠️ Deux blocs sont PARTIS, et c'est une décision :
 *  - les **rituels d'équipe** vivent sur `/team` (#1437) — c'est de
 *    l'organisation managériale, pas une décision de performance ;
 *  - la **configuration** des relances automatiques vit dans Réglages ›
 *    Routines (#1438), qui est déjà l'endroit du produit où l'on règle ce qui
 *    part tout seul. Il n'en reste ici qu'une SYNTHÈSE.
 *
 * ⚠️ Le panneau Qualité et `FinancePanel` avaient été retirés d'ici le 27/08
 * pour la même raison : ils ont leur propre route (`/pilotage/finance` ;
 * `/pilotage/qualite` a depuis été supprimée, ses contrôles reviennent ici en
 * « Données à compléter », Louis 14/10/2026), et une adresse se partage par lien.
 *
 * ⚠️ La porte vers les retours d'expérience (#3295) est partie : le REX vit
 * dans Missions (D40), Louis 14/10/2026.
 *
 * ⚠️ « À traiter » est HAUT (#1439) alors que #1440 la place en septième. Les
 * deux lectures sont tenues ensemble : haute quand il y a quelque chose à
 * arbitrer, absente quand il n'y a rien — « si nécessaire », littéralement.
 */
export function CockpitBody() {
  const { t } = useTranslation(['pilotage', 'playbooks'])
  const { user } = useSession()
  // L'arbre de routes RÉEL de ce navigateur — voir `quality/lib/destinations` :
  // le serveur peut être livré avant le web, et un lien mort est pire qu'une
  // absence de lien. Résolu UNE fois, pas une par indicateur.
  const router = useRouter()
  const known = useMemo(() => knownDestinations(router.routesByPath as unknown as Record<string, unknown>), [router])
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pilotage-chain', user?.id],
    queryFn: pilotageApi.chain,
    enabled: !!user,
    staleTime: 30_000,
  })

  // Théo D (Louis 23/10) — UNE lecture pour les tuiles, le cap, l'encaissement et les étapes (GA-26).
  const figures = useCockpitFigures()
  const levels = data?.levels ?? []
  // La phrase qui explique la mosaïque (décision D66 du 22/08). Sans elle, un
  // espace neuf montre huit cases grises et l'utilisateur conclut à une panne.
  // Le PDF proposait un seuil d'activation pour masquer ce symptôme ; le dire
  // coûte une ligne et ne cache rien.
  const coverage = data ? pilotageCoverage(data) : null

  // #2206.45-.48 — MÊMES OBJETS QUE LES DEUX BLOCS AU-DESSUS : la file
  // d'arbitrage (`InterventionsBlock`) porte déjà les décisions ouvertes,
  // classées par gravité côté serveur (`rankInterventions`) — on les relit
  // ici, on ne les recalcule pas une seconde fois.
  const { data: interventions } = useInterventions()
  const members = useWorkspaceMembers().data ?? []
  const canAssign = hasPermission(members.find(member => member.isSelf)?.role ?? 'member', 'team:manage')

  // Ce que cet écran DÉCLARE montrer à Laura (bulle) — #2206.45-.48 : pourquoi
  // (`purpose`), quels dossiers et quelle décision (les décisions ouvertes les
  // plus graves), comment agir (`actions` + `recommendedAction`). Voir le
  // docblock de `pilotageLauraContext` pour le détail de chaque axe.
  useLauraContext(
    pilotageLauraContext(t, {
      isLoading,
      coverage,
      // « non mesuré » n'est pas « mesuré à zéro » : on NOMME les maillons
      // concernés plutôt que de laisser Laura déduire lesquels du seul ratio.
      unmeasuredLevelLabels: levels
        .filter(level => level.status === 'non_mesure')
        .map(level => t(`levels.${level.level}.title`)),
      topDecisions: (interventions ?? []).map(item => ({
        kindLabel: t(`playbooks:interventions.kinds.${item.kind}`),
        detail: item.detail,
      })),
      canAssign,
    }),
  )

  // #2206.5 — le compte des maillons qui décrochent n'est plus dans l'en-tête (sous-titre fixe chez Théo) :
  // il accompagne le repli « La chaîne ». `alertingLevels` reste LE calcul de la pastille (GA-26).
  const alertingCount = alertingLevels(levels).length

  // L'ordre des blocs dépend du RÔLE (dirigeant : l'objectif d'abord ; manager
  // commercial : les décisions d'abord) — jamais leur contenu : chaque rôle voit
  // les quatre blocs (`c76_role_reordonne_jamais_ne_filtre`).
  const userRole = useEsnProfile().data?.user_role ?? null
  const blocks: Record<CockpitBlockId, ReactNode> = {
    // a. ce qui a bougé sur 7 jours glissants — un pli (Théo D pilotage.A5).
    weekDelta: <WeekDeltaFold />,
    // b. trois décisions, la file complète dans une fenêtre, les données à compléter (#1322.1, L0a).
    decisions: <CockpitDecisions levels={levels} loading={isLoading} />,
    // c. le cap du mois et l'encaissement côte à côte, puis l'évolution du pipe et où se situe la décision,
    //    côte à côte (chacune s'efface seule si vide) — Théo D pilotage.R2/R5/R6/N1.
    objective: (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <MonthObjectiveBlock />
          <CockpitCash figures={figures} />
        </div>
        <div data-testid="cockpit-overview-row" className="grid gap-4 lg:grid-cols-2 [&>*:only-child]:lg:col-span-2">
          <CockpitPipeEvolution />
          <CockpitStages figures={figures} />
        </div>
      </div>
    ),
    // d. la chaîne commerciale — un pli : huit maillons, le glossaire, le diagnostic du maillon faible, qui ne vit
    //    QUE dans le Cockpit (Théo D pilotage.A1/A2/R1).
    chain: (
      <CockpitFold
        testId="cockpit-chain-fold"
        title={t('cockpit.chainFoldTitle', { count: levels.length || 8 })}
        badge={
          alertingCount > 0 ? (
            <span className="inline-flex min-h-6 items-center rounded-md border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-2 text-xs font-medium text-[var(--warning-soft-text)]">
              {t('cockpit.chainFoldAlerts', { count: alertingCount })}
            </span>
          ) : null
        }
        meta={
          coverage ? (
            <span className="hidden md:inline">
              {t('cockpit.chainFoldMeta', {
                measured: coverage.measured,
                unmeasured: coverage.total - coverage.measured,
              })}
            </span>
          ) : null
        }
      >
        <section aria-labelledby="cockpit-chain">
          <h2 id="cockpit-chain" className="sr-only">
            {t('cockpit.chainTitle')}
          </h2>
          {alertingCount > 0 ? (
            <div className="mb-3">
              <ChainAlertsBadge levels={levels} />
            </div>
          ) : null}
          {isLoading ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('loading')}
            </Text>
          ) : isError ? (
            // #3666.k — une chaîne illisible n'est pas une chaîne sans maillon.
            <QueryLoadError />
          ) : (
            <ChainCompact levels={levels} baseline={data?.stockBaseline}>
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('intro')}
                </Text>
                {/* #2206.51 — « maillon » n'ouvrait aucune définition. */}
                <MaillonGlossary />
              </div>
              {/* « Calculé sur … » — la complétude passe par la primitive partagée
                (tome 7, loi 2, élément n°6). Ce qui reste ici est ce que la
                primitive ne sait pas : POURQUOI les autres maillons ne sont pas
                mesurés, et que cela ne s'affiche jamais en rouge. */}
              {coverage ? (
                <div className="mb-3">
                  <Completeness counted={coverage.measured} total={coverage.total} of={t('coverageOf')} />
                  <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                    {coverage.measured === 0 ? t('coverageNone') : t('coverageWhy')}
                  </Text>
                </div>
              ) : null}
              <ChainStrip
                levels={levels}
                baseline={data?.stockBaseline}
                known={known}
                generatedAt={data?.generatedAt}
              />
            </ChainCompact>
          )}
          {/* #3253.d — le diagnostic du maillon faible, juste sous la chaîne. */}
          <WeakestLinkDiagnosisSection />
        </section>
      </CockpitFold>
    ),
  }

  return (
    <div className="space-y-6">
      {/* #2114.13 / .66 / .70 — LE VERDICT, fort, en tête : « je travaille bien mon portefeuille ? ». Il se masque
          seul quand l'espace n'a pas la feature (jamais un verdict inventé). */}
      <TrajectoryVerdict />
      {/* Théo D pilotage.R3/N3 — les quatre chiffres du jour, toujours en tête. */}
      <CockpitTiles figures={figures} />
      {/* #2114.60 / .64 — la couverture du portefeuille, avec ses deux CTA. */}
      <CockpitCoverage />
      {orderCockpitBlocks(userRole).map(id => (
        <div key={id}>{blocks[id]}</div>
      ))}

      {/* Louis 14/10/2026 (refonte Pilotage, L1) — tout ce qui n'est pas l'un des quatre blocs du Cockpit reste TEL
          QUEL, dans un seul pli « Détail » (Théo D pilotage.A4/A7-A10). La file d'arbitrage (#1439) s'ouvre depuis
          « Voir toutes les décisions », plus haut : elle ne vit qu'à un endroit (GA-26). */}
      <CockpitFold
        testId="cockpit-detail-fold"
        title={t('cockpit.detailFoldTitle')}
        meta={<span className="hidden md:inline">{t('cockpit.detailFoldMeta')}</span>}
      >
        <div data-testid="cockpit-detail-grid" className="grid items-start gap-4 lg:grid-cols-2">
          {/* #1434 — l'impact mesurable, ses trois natures d'attribution séparées et sa période. */}
          <ContributionPanel />
          {/* Boucle d'apprentissage (§6) : ce que l'équipe a fait de ses besoins passés. */}
          <WorkspaceLearningPanel />
          {/* #3270.6 — SURFACE PILOTAGE de la gouvernance rang 2. */}
          <PartnerGovernancePanel />
          {/* #3258.13 — le survol PORTEFEUILLE de la matrice intérêt × pénétrabilité. */}
          <InterestPenetrabilityPortfolioPanel />
          {/* La SYNTHÈSE de ce qui part tout seul (#1438). Celle du CRM historique (`CrmPipelinePanel`) vit dans la
              section Pipe, un seul endroit (GA-26). */}
          <div className="lg:col-span-2">
            <PlaybooksSummary />
          </div>
        </div>
      </CockpitFold>
    </div>
  )
}
