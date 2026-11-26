import {
  Badge,
  Button,
  EntityAvatar,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { REFRESH_DIMENSION_CREDIT_COST, type ProjectRow } from '@bellum/contracts'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { NeedPlayPanel } from './NeedPlayPanel'
import { usePersistAccountPlan } from '@/features/accounts/hooks/usePersistAccountPlan'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'
import { useExportProjectToCrm } from '@/features/projects/hooks/useExportProjectToCrm'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { buildProjectIndex, projectKey } from '@/features/projects/model/project-index'
import { BtmmpPanel } from '@/features/projects/view/BtmmpPanel'
import { ProjectSectorsPanel } from '@/features/projects/view/ProjectSectorsPanel'
import { ProjectAmountControl } from '@/features/projects/view/ProjectAmountControl'
import { ProjectStageControl } from '@/features/projects/view/ProjectStageControl'
import { ProjectProvenanceLine } from '@/features/projects/view/ProjectProvenanceLine'
import { SimilarProjectsDialog } from '@/features/projects/view/SimilarProjectsDialog'
import { groupNeedsByKind, splitNeedsByConfidence, type AccountNeeds, type NeedItem } from '../model/needs'
import { NeedReminderDialog } from './NeedReminderDialog'
import { UrgencyBadge, UrgencyDot } from './NeedBadges'

/**
 * Le détail d'un compte : TOUS ses besoins, groupés par source, avec l'impact
 * business et l'offre rattachée en entier. C'est l'écran de préparation d'appel
 * — rien n'y est tronqué.
 */
export function NeedsAccountSheet({
  entry,
  onOpenAccount,
  onOpenChange,
  open,
}: {
  entry?: AccountNeeds
  onOpenAccount: (accountId: string) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { t } = useTranslation('projects')
  // Materialized opportunities carry the lifecycle + first-detected date the live
  // projection can't. Fetch only while the panel is open, index by the join key.
  const { data: opportunities = [] } = useProjects(open)
  const opportunityIndex = useMemo(() => buildProjectIndex(opportunities), [opportunities])
  const navigate = useNavigate()

  /** « Trouver les décideurs associés » : ouvre l'onglet Contacts du compte avec
   *  le besoin en recherche. Pas d'endpoint inventé — on emmène le commercial là
   *  où les contacts vivent déjà, avec le contexte du besoin. */
  const onFindDeciders = (need: NeedItem) => {
    if (!entry) return
    void navigate({
      to: '/accounts/$id',
      params: { id: entry.accountId },
      search: { tab: 'contacts', q: need.offer || need.label },
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        className="w-[min(780px,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        {entry ? (
          <>
            <SheetHeader className="border-b border-[var(--bellum-border)] p-5">
              {/*
                `pr-4 md:pr-6` réserve la gouttière du bouton de fermeture du Sheet, qui
                est rendu HORS FLUX (`absolute top-4 right-4`, icône `size-4`) et
                occupe donc la bande 16→32 px depuis le bord droit. L'en-tête est
                en `p-5` (20 px) : sans ce `pr-4 md:pr-6` (→ 44 px), le badge d'urgence
                aligné à droite passe SOUS la croix.
              */}
              <div className="flex items-start justify-between gap-4 pr-4 md:pr-6">
                <div className="flex min-w-0 items-center gap-3">
                  <EntityAvatar name={entry.companyName} size="md" />
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{entry.companyName}</SheetTitle>
                    <SheetDescription className="truncate">
                      {entry.sector ?? t('list.sectorFallback')}
                      {entry.score === null ? '' : ` · ${t('list.score', { score: entry.score.toFixed(1) })}`}
                    </SheetDescription>
                  </div>
                </div>
                <UrgencyBadge urgency={entry.topUrgency} />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenAccount(entry.accountId)}>
                  {t('detail.openAccount')}
                  <ArrowUpRight className="size-4" />
                </Button>
                <EnrichNeedsButton accountId={entry.accountId} />
              </div>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-6 p-5">
                <div className="space-y-1">
                  {/* « X opportunités détectées : Y confirmées, Z à qualifier ».
                      Confirmée = fait sourcé (pain/chantier/projet) ; à qualifier
                      = implication (déduction). Dérivé du kind, rien d'inventé. */}
                  <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                    {t('detail.countBreakdown', {
                      count: entry.needs.length,
                      ...splitNeedsByConfidence(entry.needs),
                    })}
                  </Text>
                  {/* Provenance explicite (restitution V2 §7) : lever l'ambiguïté
                      « inféré vs confirmé » en nommant d'où viennent ces éléments. */}
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('detail.provenance')}
                  </Text>
                </div>

                {groupNeedsByKind(entry.needs).map(group => (
                  <section key={group.kind} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Text
                        size="xs"
                        weight="semibold"
                        className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
                      >
                        {t(`groups.${group.kind}`)}
                      </Text>
                      <Text size="xs" className="tabular-nums text-[var(--bellum-text-muted)]">
                        {group.needs.length}
                      </Text>
                    </div>
                    <ul className="space-y-2">
                      {group.needs.map(need => (
                        <li key={need.id}>
                          <NeedCard
                            need={need}
                            accountId={entry.accountId}
                            companyName={entry.companyName}
                            onFindDeciders={onFindDeciders}
                            onOpenAccount={onOpenAccount}
                            opportunity={opportunityIndex.get(projectKey(entry.accountId, need.kind, need.label))}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}

                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('detail.enrichHint')}
                </Text>
              </div>
            </ScrollArea>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function NeedCard({
  need,
  opportunity,
  accountId,
  companyName,
  onFindDeciders,
  onOpenAccount,
}: {
  need: NeedItem
  opportunity?: ProjectRow
  accountId: string
  companyName: string
  onFindDeciders: (need: NeedItem) => void
  onOpenAccount: (accountId: string) => void
}) {
  const { t } = useTranslation('projects')
  const { addAction, isPending } = usePersistAccountPlan(accountId)
  const exportToCrm = useExportProjectToCrm()
  const [reminderOpen, setReminderOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)

  // « Ajouter au plan d'action » (V2 §7). Le besoin devient une action DATÉE et
  // rattachée : sans l'objectif ni la preuve, une ligne de plan n'est qu'un
  // pense-bête. Le texte reprend le besoin tel quel — rien de reformulé par nous.
  // #2123.46 — la ligne CANONIQUE (`POST /plan-items`), avec son résultat
  // attendu. Aucun objet visé : `need.id` est une POSITION dans l'analyse
  // (`<compte>:pain:0`), pas un besoin du référentiel — le donner pour objet
  // pointerait vers rien, et l'écran nommera le manque.
  const addToPlan = () => {
    void addAction({
      label: t('actions.planText', { need: need.label }),
      reason: t('actions.planReason', { need: need.label }),
      target: null,
      expected_outcome: t('actions.planOutcome'),
    }).catch(() => undefined)
  }

  return (
    <div className="rounded-lg border border-[var(--bellum-border)] p-3">
      <div className="flex items-start gap-2.5">
        <UrgencyDot urgency={need.urgency} />
        <Text size="sm" weight="medium" className="min-w-0 flex-1">
          {need.label}
        </Text>
        <Badge variant="outline" className="shrink-0">
          {t(`kinds.${need.kind}`)}
        </Badge>
      </div>

      {need.detail ? (
        <Text size="xs" className="mt-2 pl-5 text-[var(--bellum-text-secondary)]">
          <span className="text-[var(--bellum-text-muted)]">{t('detail.impact')} · </span>
          {need.detail}
        </Text>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
        {need.offer ? (
          <Badge variant="primary">{need.offer}</Badge>
        ) : (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('list.noOffer')}
          </Text>
        )}
        {need.timeframe ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {need.timeframe}
          </Text>
        ) : null}
      </div>

      {/* Cycle de vie + provenance : les deux ne vivent que sur le besoin
          MATÉRIALISÉ (table `opportunities`). Un besoin encore projeté à la
          volée depuis `raw_analysis` n'affiche ni l'un ni l'autre — plutôt que
          d'inventer une source ou une confiance qui n'est stockée nulle part. */}
      {opportunity ? (
        <>
          <ProjectStageControl opportunity={opportunity} />
          {/* Montant d'affaire estimé (cockpit manager §10 — pipeline valorisé).
              Uniquement sur un besoin MATÉRIALISÉ : il faut son id pour le persister. */}
          <ProjectAmountControl opportunity={opportunity} />
          <ProjectProvenanceLine opportunity={opportunity} />
          {/* Qualification BTMMP (annexe méthodo p21) — n'apparaît que sur un
              besoin matérialisé (il faut son id). */}
          <BtmmpPanel opportunityId={opportunity.id} btmmp={opportunity.btmmp} />
          {/* Le secteur de la DEMANDE — pas celui du compte (doctrine C05). */}
          <ProjectSectorsPanel
            opportunityId={opportunity.id}
            sectors={opportunity.application_sector_codes}
            domainCode={opportunity.primary_domain_code ?? null}
          />
        </>
      ) : null}

      {/* Actions demandées V2 §7. Seules celles qui ont un vrai backend sont ici :
          « ajouter au plan » écrit une action datable sur le dossier, « trouver les
          décideurs » ouvre la recherche contacts amorcée par le besoin, « créer un
          rappel » écrit un rappel daté sur le COMPTE via l'Action Router,
          « comparer » interroge le portefeuille pour ce même besoin ailleurs, et
          « ajouter au CRM » pousse le besoin comme objet idoine dans le CRM
          connecté — un Deal (HubSpot/Pipedrive), une Note sur la société (Attio),
          une tâche (Salesforce) — (`POST /opportunities/:id/export-crm`). Ces deux dernières n'apparaissent
          que sur un besoin MATÉRIALISÉ : sans ligne en base, il n'y a pas d'id — ni
          à comparer ni à exporter — et un bouton qui ne fait rien vaut moins que
          pas de bouton. */}
      <div className="mt-3 flex flex-wrap gap-2 pl-5">
        <Button type="button" variant="outline" size="sm" onClick={addToPlan} disabled={isPending}>
          {t('actions.addToPlan')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onFindDeciders(need)}>
          {t('actions.findDeciders')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setReminderOpen(true)}>
          {t('actions.createReminder')}
        </Button>
        {opportunity ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setCompareOpen(true)}>
            {t('actions.compare')}
          </Button>
        ) : null}
        {/* Export CRM : uniquement sur un besoin matérialisé (il faut son id).
            Le refus « aucun CRM connecté » (409) devient un nudge côté hook, jamais
            un faux succès — cf. useExportProjectToCrm. */}
        {opportunity ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={exportToCrm.isPending}
            onClick={() => exportToCrm.mutate(opportunity.id)}
          >
            {exportToCrm.isPending ? t('actions.exporting') : t('actions.exportCrm')}
          </Button>
        ) : null}
      </div>

      {/* Le seul geste PAYANT de l'écran (1 crédit) : il GÉNÈRE le plan d'attaque,
          il ne redévoile pas un besoin que l'analyse a déjà facturé. Une fois
          payé, il appartient à l'équipe. */}
      <NeedPlayPanel accountId={accountId} need={need} />

      {/* Montés à l'ouverture seulement : un panneau de compte affiche des dizaines
          de besoins, et chaque fenêtre porte une requête (comparaison) ou une
          mutation (rappel) qu'il serait absurde d'instancier pour chaque carte. */}
      {reminderOpen ? (
        <NeedReminderDialog
          accountId={accountId}
          companyName={companyName}
          needLabel={need.label}
          open
          onOpenChange={setReminderOpen}
        />
      ) : null}
      {opportunity && compareOpen ? (
        <SimilarProjectsDialog
          opportunity={opportunity}
          open
          onOpenChange={setCompareOpen}
          onOpenAccount={accountIdToOpen => {
            setCompareOpen(false)
            onOpenAccount(accountIdToOpen)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Enrichissement à la demande : re-run de la dimension `strategy` (pains, angles,
 * offres) sur ce dossier — c'est la phase qui PRODUIT les besoins. Débite un
 * crédit d'enrichissement côté serveur ; le hook gère le 402 (upsell) et
 * invalide le cache du compte + les crédits.
 */
function EnrichNeedsButton({ accountId }: { accountId: string }) {
  const { t } = useTranslation('projects')
  const refresh = useRefreshDimension(accountId)
  // #2116.32 — le coût s'annonce AVANT le clic, et il vient du CONTRAT.
  // Le libellé portait « · 1 crédit » écrit à la main dans les deux
  // catalogues de traduction : le jour où le poids bouge, l'écran annonce un
  // chiffre et la caisse en prélève un autre (GA-26, GA-332).

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={refresh.isPending}
      onClick={() => refresh.mutate('strategy')}
    >
      <Sparkles className="size-4" />
      {refresh.isPending ? t('detail.enriching') : t('detail.enrich')}
    </Button>
  )
}
