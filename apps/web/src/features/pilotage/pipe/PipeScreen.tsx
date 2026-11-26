import { TabNav, Text } from '@bellum/ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { ChainsPage } from '@/features/chains/view/ChainsPage'
import { ProbableQuarterPanel } from '@/features/projects/probability/ProbableQuarterPanel'
import { CrmPipelinePanel } from '../view/CrmPipelinePanel'
import { PipeByOwner } from './PipeByOwner'
import { PipeInspection } from './PipeInspection'
import { PipeNeedsTracker } from './PipeNeedsTracker'
import { PipeWaterfall } from './PipeWaterfall'

/**
 * ÉCRAN PIPE — `/pilotage/pipe` (L2 de la refonte Pilotage, Louis 14/10/2026).
 *
 * De haut en bas : le mouvement du pipe (waterfall), la table d'inspection
 * éditable avec ses signaux de risque, le détail par commercial, le pipeline
 * du CRM connecté, puis l'entonnoir du positionnement au placé.
 *
 * Ce fichier NE RECODE RIEN : le CRM (`CrmPipelinePanel`) et l'entonnoir
 * (`SubmissionFunnelSummary`) sont des composants existants, montés ici.
 *
 * Le CA PROBABLE du trimestre (#4197, L6) ne vit QUE ici (GA-26, Louis 14/10) :
 * `ProbableQuarterPanel` est monté en tête, il n'est recalculé nulle part.
 *
 * Doctrine : les totaux de ce fichier sont non pondérés ; la seule probabilité
 * affichée est celle du panneau CA probable, CALIBRÉE avec ses axes, jamais nue. La catégorie « Engagé / Possible / Pipe / Hors prévision »
 * est une déclaration du commercial, pas un pourcentage.
 */
export function PipeScreen({
  manager = true,
  own = false,
  locked = null,
}: { manager?: boolean; own?: boolean; locked?: ReactNode } = {}) {
  const { t } = useTranslation('pilotagePipe')
  // Ce que l'écran DÉCLARE à Laura : à quoi il sert, et ce qu'il ne dit pas (aucun pourcentage de réussite).
  useLauraContext({
    kind: 'pilotage',
    label: t('page.title'),
    entityId: null,
    facets: [],
    state: 'ready',
    purpose: t('laura.purpose'),
  })
  // Pipe et Parcours sont deux ONGLETS : un seul est visible à la fois. Le lien historique
  // `/pilotage/pipe#parcours` ouvre directement Parcours. Les deux restent montés — seule la lecture
  // non choisie est masquée, rien n'est relu en changeant d'onglet.
  const [tab, setTab] = useState<'pipe' | 'parcours'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#parcours' ? 'parcours' : 'pipe',
  )
  const hasPipe = manager || own
  const shown = hasPipe ? tab : 'parcours'
  // Section de la page Pilotage (sections ancrées, Théo D 22/10) : la page porte le titre, pas cet écran.
  return (
    <>
      <div className="space-y-8 py-4">
        {hasPipe ? (
          <TabNav
            variant="pill"
            tabs={[
              { key: 'pipe', label: t('tabs.pipe') },
              { key: 'parcours', label: t('tabs.parcours') },
            ]}
            activeTab={tab}
            onTabChange={key => setTab(key === 'parcours' ? 'parcours' : 'pipe')}
          />
        ) : null}
        <div role="tabpanel" aria-label={t('tabs.pipe')} hidden={shown !== 'pipe'} className="space-y-8">
          {manager ? (
            <>
              <Text size="sm" color="text-muted-foreground" className="block">
                {t('page.intro')}
              </Text>
              {/* Théo D pilotage › Pipe : le CA probable à côté des besoins ouverts (`d-grid2`),
                  le mouvement du pipe (notre maquette, PIL-E15), le tableau des affaires ouvertes,
                  puis « Par commercial » à côté du pipeline du CRM. */}
              <div data-testid="pipe-row-probable" className="grid items-start gap-6 lg:grid-cols-2">
                <ProbableQuarterPanel />
                {/* RV4-E-FIX 4295.13 — le traceur : CA potentiel des besoins ouverts et dernier TJM connu. */}
                <PipeNeedsTracker />
              </div>
              <PipeWaterfall />
              <PipeInspection />
              <div data-testid="pipe-row-owners" className="grid items-start gap-6 lg:grid-cols-2">
                <PipeByOwner />
                <section aria-labelledby="pipe-crm-title" className="space-y-2">
                  <h2 id="pipe-crm-title" className="sr-only">
                    {t('crm.title')}
                  </h2>
                  <CrmPipelinePanel />
                </section>
              </div>
              {/* #4343 — l'entonnoir des positionnements (étapes candidat) vit dans le Vivier,
                plus dans le Pipe d'affaires. */}
            </>
          ) : null}
          {/* Théo D pilotage.A11 / Q5 (Louis 22/10/2026) — CHACUN SON PIPE : un commercial lit le mouvement et
              la table de SES affaires ; l'équipe, le CA probable, le CRM et le classement restent au gestionnaire. */}
          {own ? (
            <>
              <Text size="sm" color="text-muted-foreground" className="block">
                {t('page.introOwn')}
              </Text>
              <PipeWaterfall />
              <PipeInspection />
            </>
          ) : null}
          {locked}
        </div>
        {/* #4163.2 (Louis 15/10/2026) — Parcours est ouvert à tous les rôles et à tous les paliers, le
            droit se règle par section ; Théo D (23/10) en fait un onglet de Pipe, plus un bloc empilé. */}
        <div role="tabpanel" aria-label={t('tabs.parcours')} hidden={shown !== 'parcours'}>
          <ChainsPage />
        </div>
      </div>
    </>
  )
}
