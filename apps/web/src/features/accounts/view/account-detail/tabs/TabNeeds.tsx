import type { Account, OpenNeedsQuery, ProjectRow } from '@bellum/contracts'
import { projectOriginSearch } from '@/features/projects/lib/projectOrigin'
import { Button, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { observedRoleFamilyLabels } from '@/features/accounts/model/observedRoleFamilies'
import { useProjectOwners } from '@/features/projects/hooks/useProjectOwners'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { openNeedsApi, openNeedsKeys } from '@/features/projects/open-needs/api'
import { isConfirmedNeedRow, isHistoricalNeedRow, isInternalHire } from './accountNeedRows'
import { AccountOpenDemands, InternalHireNotes } from './sections/AccountOpenDemands'
import { LinkedObjectsSummary, type LinkedObjectsSummaryBucket } from './sections/LinkedObjectsSummary'
import { NeedContactActions } from './sections/NeedContactActions'

/**
 * #2115.23 — LES BESOINS CONFIRMÉS, ATTEIGNABLES DANS LEUR SECTION.
 *
 * « Opportunités : signaux · veille · projets plausibles · BESOINS CONFIRMÉS ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seau « Besoins confirmés » n'est pas écrit à neuf : il vivait dans
 * `TabProjects`, comme l'un des trois seaux de `LinkedObjectsSummary` — et il
 * disparaissait ENTIÈREMENT dès que le compte ne portait aucun projet, puisque
 * l'onglet rend alors son état vide global et rien d'autre. C'est ce qui le
 * rendait introuvable à l'écran : il n'était pas absent du code, il était
 * absent de la PAGE, ce qui revient au même pour le commercial qui cherche.
 *
 * Il est RAPATRIÉ ici, pas dupliqué : `TabProjects` ne le construit plus (loi 4
 * — rien n'apparaît deux fois sous la même forme avec le même contenu), et la
 * dérivation `stage === 'confirmed'` ne vit donc plus qu'à UN endroit.
 *
 * ⚠️ Le vocabulaire est celui du pipe, et il est tranché : l'étape `confirmed`
 * s'appelle « Demande confirmée » et son aide dit « la seule position qui
 * mérite le mot besoin ». Un projet plausible ou qualifié n'entre pas ici.
 *
 * ⚠️ Rien ne se rend PENDANT le chargement : `LinkedObjectsSummary` écrit son
 * compte entre parenthèses, et « Besoins confirmés (0) » affiché sur une
 * requête qui n'a pas répondu est un zéro de chargement — il se lit comme un
 * fait mesuré alors qu'on ne sait encore rien.
 */
export function TabNeeds({
  account,
  onOpenTab,
  hideWhenEmpty = false,
}: {
  account: Account
  /** Ouvre une autre sous-partie du dossier (la suite proposée sans demande). */
  onOpenTab?: (tab: 'veille' | 'contacts') => void
  /** #4022 (Louis 11/10) — écran Opportunités : sans demande, RIEN (ni titre ni phrase d'absence). */
  hideWhenEmpty?: boolean
}) {
  const { t } = useTranslation('projects')
  // MÊME clé de cache que `TabProjects` (`['projects', 'by-account', id]`) :
  // les deux sous-parties de la section s'affichent l'une sous l'autre, et
  // React Query ne part chercher la liste qu'une fois.
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.accounts.projects(account.id),
    queryFn: () => apiFetch<ProjectRow[]>({ path: `/projects?account_id=${account.id}` }),
  })
  const { ownerName } = useProjectOwners()

  // #3681 — les demandes ACTUELLES du compte (besoins ouverts), lues à part des
  // projets : l'erreur de l'une n'efface pas l'autre.
  const needsQuery: OpenNeedsQuery = { account_id: account.id, status: 'open', offset: 0, limit: 20 }
  const needs = useQuery({
    queryKey: openNeedsKeys.list(needsQuery),
    queryFn: () => openNeedsApi.list(needsQuery),
  })
  const openNeeds = useMemo(() => needs.data?.data ?? [], [needs.data])
  const externalDemands = useMemo(() => openNeeds.filter(need => !isInternalHire(need)), [openNeeds])
  const internalHires = useMemo(() => openNeeds.filter(isInternalHire), [openNeeds])

  // #3681 — le passé du marché (familles d'expertise observées) : agrégats seulement.
  const { data: marketContext } = useAccountMarketContext(account.id, true)

  const confirmed = useMemo(() => (data ?? []).filter(isConfirmedNeedRow), [data])
  const history = useMemo(
    () =>
      (data ?? [])
        .filter(isHistoricalNeedRow)
        .map(project => ({ project, at: project.closed_at ?? project.stage_entered_at }))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [data],
  )

  if (isLoading || needs.isLoading) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('accountTab.loading')}
      </Text>
    )
  }

  // #3681 — une source en panne n'est PAS « aucune demande » : on le dit, on ne
  // rend ni zéro ni phrase d'absence.
  if (isError && externalDemands.length === 0) {
    return (
      <section className="space-y-2">
        <DemandsTitle />
        <Text size="sm" color="text-[var(--bellum-text-muted)]" role="alert">
          {t('accountTab.openDemands.unavailable')}
        </Text>
      </section>
    )
  }

  if (confirmed.length === 0 && externalDemands.length === 0) {
    // Une lecture des besoins en panne n'est pas « aucune demande » : on le dit.
    if (needs.isError) {
      return (
        <Text size="sm" color="text-[var(--bellum-text-muted)]" role="alert">
          {t('accountTab.openDemands.unavailable')}
        </Text>
      )
    }
    // #3295 — « rien du tout » vaut pour l'ABSENCE de demande, pas pour l'historique : une affaire
    // perdue n'avait plus aucune porte depuis le compte (« Pertes documentées » vit sur sa fiche).
    if (hideWhenEmpty) {
      return history.length > 0 ? <NeedsHistory history={history} families={[]} accountId={account.id} /> : null
    }
    const families = observedRoleFamilyLabels(marketContext) ?? []
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <DemandsTitle />
          <Text size="sm" color="text-[var(--bellum-text-primary)]">
            {t(`accountTab.openDemands.${account.signals_collected_at ? 'noneFound' : 'notSearched'}`)}
          </Text>
          <div className="flex flex-wrap gap-2">
            {onOpenTab ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={() => onOpenTab('veille')}
                >
                  {t('accountTab.needsReading.seeSignals')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={() => onOpenTab('contacts')}
                >
                  {t('accountTab.needsReading.prepareApproach')}
                </Button>
              </>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="pointer-coarse:min-h-11">
              <Link to="/projects/needs" search={{ account_id: account.id }}>
                {t('accountTab.summary.openNeedsForAccount')}
              </Link>
            </Button>
          </div>
          <InternalHireNotes needs={internalHires} />
        </div>
        <NeedsHistory history={history} families={families} accountId={account.id} />
      </div>
    )
  }

  const buckets: LinkedObjectsSummaryBucket[] = [
    {
      key: 'confirmed',
      title: t('accountTab.summary.confirmed.title'),
      emptyLabel: t('accountTab.summary.confirmed.empty'),
      rows: confirmed.map(project => ({
        id: project.id,
        label: project.label,
        ownerName: ownerName(project.owner_id),
        natureLabel: t('accountOpportunity.nature.confirmedDemand'),
        // #2124.9 — signal MESURÉ (`has_mission`), jamais un nom de consultant
        // deviné : `ProjectRow` ne porte aucun nom de profil positionné.
        positionedLabel: project.has_mission ? t('accountTab.summary.positioned') : undefined,
        actions: [
          {
            label: t('accountTab.summary.openInPipe'),
            to: '/projects/$id',
            params: { id: project.id },
            // #3683.6 — le retour ramène à CE compte, à l'onglet quitté.
            search: projectOriginSearch({ accountId: account.id, tab: 'veille' }),
          },
          // #2150.39 — « Besoin > Contacts client » : l'annuaire canonique,
          // filtré sur le compte du besoin par le MÊME paramètre `company`
          // que la barre de filtres de /contacts (GA-26 — aucune route neuve).
          {
            label: t('accountTab.summary.contactsClient'),
            to: '/contacts',
            search: { company: account.company_name },
          },
        ],
      })),
    },
  ]

  return (
    <>
      <AccountOpenDemands needs={externalDemands} />
      {confirmed.length > 0 ? (
        <LinkedObjectsSummary buckets={buckets} />
      ) : isError ? (
        // #3817.2 — les demandes OUVERTES ont répondu (bloc ci-dessus), mais la
        // lecture des demandes CONFIRMÉES (`/projects`) a échoué : on le dit,
        // on ne tait pas la section derrière celle qui, elle, a une réponse.
        <section className="space-y-2">
          <DemandsTitle />
          <Text size="sm" color="text-[var(--bellum-text-muted)]" role="alert">
            {t('accountTab.openDemands.unavailable')}
          </Text>
        </section>
      ) : null}
      {/* #3624 — « Contacter <personne> » : les interlocuteurs reliés à chaque demande. */}
      {confirmed.map(project => (
        <NeedContactActions key={project.id} projectId={project.id} label={project.label} />
      ))}
      <InternalHireNotes needs={internalHires} />
      {/* #3295 — les affaires closes du compte restent atteignables même avec des demandes en cours. */}
      <NeedsHistory history={history} families={[]} accountId={account.id} />
      {/* #2777 — un besoin DÉTECTÉ, sans projet, ne vit que dans `project_needs`
          et n'entre dans AUCUN bucket ci-dessus (ils ne lisent que `projects`,
          stage `confirmed`). Le filtre `account_id` existe déjà sur le plateau
          transverse (`/projects/needs`, serveur ET client) — ce lien le pose
          depuis l'URL, rien de plus. */}
      <Button asChild variant="ghost" size="sm" className="pointer-coarse:min-h-11">
        <Link to="/projects/needs" search={{ account_id: account.id }}>
          {t('accountTab.summary.openNeedsForAccount')}
        </Link>
      </Button>
    </>
  )
}

/**
 * #3676 — le titre du bloc, même vide, dit son état.
 *
 * #3681.2 RÉFUTÉ (recette prod 07/10 soir) — « Demandes confirmées » est le
 * vocabulaire du PIPE (étape `confirmed`, `accountTab.summary.confirmed.title`
 * juste à côté) ; CE bloc lit les besoins OUVERTS (`openNeedsApi`), jamais une
 * étape de pipe — l'issue #3681 demande « demande ACTUELLE », le libellé que
 * `openDemands.title` porte désormais.
 */
function DemandsTitle() {
  const { t } = useTranslation('projects')
  return (
    <Text element="h3" size="sm" weight="semibold">
      {t('accountTab.openDemands.title')}
    </Text>
  )
}

/**
 * #3295 — l'historique des affaires CLOSES (gagnées ou perdues) du compte, daté et séparé des demandes
 * ouvertes. Chaque ligne ouvre la fiche de l'affaire : c'est là que vivent « Pertes documentées »
 * (`LostDealRexPanel`) et le reste du REX — sans cette porte, une perte n'était lisible depuis aucun écran
 * du compte. Une absence ne fait aucune ligne : ni affaire close ni famille observée, le bloc n'existe pas.
 */
function NeedsHistory({
  history,
  families,
  accountId,
}: {
  history: { project: ProjectRow; at: string }[]
  families: string[]
  accountId: string
}) {
  const { t, i18n } = useTranslation('projects')
  if (history.length === 0 && families.length === 0) return null
  return (
    <section className="space-y-2" data-testid="needs-history" aria-label={t('accountTab.needsReading.historyTitle')}>
      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-secondary)]">
        {t('accountTab.needsReading.historyTitle')}
      </Text>
      {history.slice(0, 5).map(({ project, at }) => (
        <Button
          key={project.id}
          asChild
          variant="ghost"
          size="sm"
          className="h-auto min-h-8 max-w-full justify-start whitespace-normal text-left pointer-coarse:min-h-11"
        >
          <Link
            to="/projects/$id"
            params={{ id: project.id }}
            search={projectOriginSearch({ accountId, tab: 'veille' })}
          >
            {t('accountTab.needsReading.historyRow', { label: project.label, date: monthYear(at, i18n.language) })}
          </Link>
        </Button>
      ))}
      {families.length > 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('accountTab.needsReading.families', { families: families.join(', ') })}
        </Text>
      ) : null}
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('accountTab.needsReading.historyCaution')}
      </Text>
    </section>
  )
}

function monthYear(iso: string, language: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(language, { month: 'long', year: 'numeric' })
}
