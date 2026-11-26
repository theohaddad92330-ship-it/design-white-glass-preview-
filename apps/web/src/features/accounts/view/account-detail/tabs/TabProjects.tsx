import type { Account, ProjectReadRow, ProjectRow } from '@bellum/contracts'
import { projectOriginSearch } from '@/features/projects/lib/projectOrigin'
import { INTAKE_STAGES, PROJECT_CONFIDENCE_LEVELS, PROJECT_KINDS, projectNature } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  EmptyState,
  SearchEmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Workflow } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { projectsApi } from '@/features/projects/api'
import { useProjectOwners } from '@/features/projects/hooks/useProjectOwners'
import { ClearFiltersAction } from '@/features/projects/portfolio/view/EmptyStateActions'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/lib/locale'
import { OpportunityEvidenceBadge } from './opportunities/OpportunityEvidenceBadge'
import { AccountProjectsToolbar } from './projects/AccountProjectsToolbar'
import { emptyAccountProjectFilters, filterAccountProjects, isNarrowed } from './projects/accountProjectsFilters'
import {
  LinkedObjectsSummary,
  type LinkedObjectSummaryAction,
  type LinkedObjectSummaryRow,
  type LinkedObjectsSummaryBucket,
} from './sections/LinkedObjectsSummary'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'

const HEAD = 'text-xs font-medium text-[var(--bellum-text-muted)] whitespace-nowrap'
const CELL = 'py-2 align-middle'

/**
 * L'onglet Projets d'un dossier de compte (PDF 2 §4.2, ticket BEL-CRM-104).
 *
 * Les projets d'un compte ne se voyaient que depuis le pipe global : le
 * commercial ne voyait pas la profondeur de SON compte.
 *
 * Le bandeau d'entonnoir sépare les SIGNAUX des projets, et ce n'est pas une
 * coquetterie d'affichage — c'est la règle du §4.2, reprise du §8.3 : un signal
 * n'est pas un projet, et les additionner produit un entonnoir qui promet du
 * travail qui n'existe pas.
 */
export function TabProjects({ account }: { account: Account }) {
  const { t } = useTranslation('projects')
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.accounts.projects(account.id),
    // #2119.2 — `ProjectReadRow`, et pas `ProjectRow` : l'API attache le NIVEAU
    // DE PREUVE à chaque ligne depuis des mois, et ce typage-là l'effaçait à la
    // frontière. Le champ arrivait, personne ne pouvait le lire.
    queryFn: () => apiFetch<ProjectReadRow[]>({ path: `/projects?account_id=${account.id}` }),
  })
  const rows = useMemo(() => data ?? [], [data])

  /**
   * #1889 — ce que l'utilisateur a resserré. État LOCAL et pas dans l'URL :
   * `accountDetailSearch` ne porte que l'onglet et une amorce de recherche de
   * CONTACT, et l'onglet Contacts du même dossier garde déjà ses filtres en
   * local. Deux conventions sur le même écran se contredisent.
   */
  const [filters, setFilters] = useState(emptyAccountProjectFilters)

  // Un projet de type `signal` reste un signal : il n'entre pas dans le compte
  // des projets, il est annoncé À CÔTÉ.
  const signals = rows.filter(row => row.kind === 'signal')
  const nonSignals = rows.filter(row => row.kind !== 'signal')
  // #3714 — UNE généralité (déduction sans fait ni travail) n'est ni un projet
  // ni un compteur commercial : même classification que le serveur et Laura
  // (`projectNature`, un seul endroit). Elle reste LISIBLE en contexte secondaire
  // plus bas — rien n'est effacé — et une affaire travaillée, même mal
  // intitulée, n'est jamais reclassée.
  const generics = nonSignals.filter(row => projectNature(row) === 'generic')
  const projects = nonSignals.filter(row => projectNature(row) !== 'generic')

  // #2124.5 — le porteur côté ESN, résolu par le MÊME hook que le Pipe
  // (`useProjectOwners`) : une seconde résolution divergerait le jour où
  // l'espace renomme quelqu'un.
  const { ownerName } = useProjectOwners()
  const queryClient = useQueryClient()
  // #2124.12 — « Qualifier ce projet plausible » réutilise l'écriture
  // EXISTANTE du Pipe (`PATCH /projects/:id/stage`, celle du drag-and-drop) :
  // aucune nouvelle route, aucun nouveau formulaire.
  const qualify = useMutation({
    mutationFn: (id: string) => projectsApi.updateStage(id, 'qualified'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.projects(account.id) }),
  })

  function summaryRow(project: ProjectRow, extraActions: LinkedObjectSummaryAction[] = []): LinkedObjectSummaryRow {
    const actions: LinkedObjectSummaryAction[] = [
      // #2124.10 — présente sur CHAQUE ligne désormais, pas seulement sur
      // l'état totalement vide.
      {
        label: t('accountTab.summary.openInPipe'),
        to: '/projects/$id',
        params: { id: project.id },
        // #3683.6 — le retour ramène à CE compte, à l'onglet quitté.
        search: projectOriginSearch({ accountId: account.id, tab: 'veille' }),
      },
      // #2150.39/.54 — même porte que TabNeeds (« Besoin > Contacts client ») :
      // l'annuaire canonique filtré sur le compte, le MÊME filtre `company`
      // (GA-26), qu'un projet soit actif ou plausible.
      {
        label: t('accountTab.summary.contactsClient'),
        to: '/contacts',
        search: { company: account.company_name },
      },
      ...extraActions,
    ]
    return {
      id: project.id,
      label: project.label,
      ownerName: ownerName(project.owner_id),
      // #2124.9 — signal MESURÉ (`has_mission`), jamais un nom de consultant
      // deviné : `ProjectRow` ne porte aucun nom de profil positionné.
      positionedLabel: project.has_mission ? t('accountTab.summary.positioned') : undefined,
      actions,
    }
  }

  // #2124.1/.2/.3 — trois buckets par ÉTAPE, mutuellement exclusifs (un projet
  // n'est jamais compté deux fois) : le détecté/potentiel encore non regardé
  // (« plausible »), l'étape « Besoin exprimé » nommée par le pipe
  // (« confirmé »), et le reste du pipe ouvert (« actif »). `won`/`lost`/
  // `dormant` n'entrent dans aucun bucket : ce n'est plus ce qui est ACTIF.
  const plausibleProjects = projects.filter(project => (INTAKE_STAGES as readonly string[]).includes(project.stage))
  const activeOpportunities = projects.filter(
    project =>
      project.stage === 'qualified' || project.stage === 'profiles_submitted' || project.stage === 'negotiation',
  )

  // #3918 (R20) — les affaires CLOSES du compte (gagnées / perdues / en sommeil), avec leur issue et leur
  // date, y compris sur un compte archivé : elles n'entrent dans aucun bucket « actif », mais restaient
  // illisibles sur la fiche. Une rubrique sans ligne ne s'affiche pas.
  const pastProjects = projects.filter(
    project => project.stage === 'won' || project.stage === 'lost' || project.stage === 'dormant',
  )

  const summaryBuckets: LinkedObjectsSummaryBucket[] = [
    {
      key: 'active',
      title: t('accountTab.summary.active.title'),
      emptyLabel: t('accountTab.summary.active.empty'),
      rows: activeOpportunities.map(project => summaryRow(project)),
    },
    // #2115.23 — LE SEAU « BESOINS CONFIRMÉS » A DÉMÉNAGÉ dans sa propre
    // sous-partie de la section Opportunités (`TabNeeds`), qui la promettait.
    // Il n'est pas rendu deux fois : `stage === 'confirmed'` ne se filtre plus
    // qu'à cet endroit-là. Ici il disparaissait entièrement dès que le compte
    // ne portait aucun projet — l'onglet rend alors son état vide global.
    {
      key: 'plausible',
      title: t('accountTab.summary.plausible.title'),
      emptyLabel: t('accountTab.summary.plausible.empty'),
      rows: plausibleProjects.map(project =>
        summaryRow(project, [
          {
            label: t('accountTab.summary.qualify'),
            onClick: () => qualify.mutate(project.id),
            disabled: qualify.isPending,
          },
        ]),
      ),
    },
    {
      key: 'past',
      title: t('accountTab.summary.past.title'),
      emptyLabel: '',
      hideWhenEmpty: true,
      rows: pastProjects.map(project => {
        const date = formatDate(project.closed_at ?? project.stage_entered_at)
        const issue = t(`stage.states.${project.stage}`)
        return { ...summaryRow(project), outcomeLabel: date ? `${issue} · ${date}` : issue }
      }),
    },
  ]

  // ⚠️ Les comptes du bandeau et des pastilles se mesurent sur la liste
  // COMPLÈTE, la liste affichée sur la liste filtrée. Mélanger les deux ferait
  // un entête qui se contredit lui-même à chaque clic.
  const visible = useMemo(() => filterAccountProjects(rows, filters), [rows, filters])
  const narrowed = isNarrowed(filters)

  if (isLoading) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('accountTab.loading')}
      </Text>
    )
  }

  // #3666.k — une lecture en échec n'est pas « aucune affaire ».
  if (isError) return <QueryLoadError />

  if (rows.length === 0) {
    return (
      <EmptyState
        size="md"
        align="center"
        icon={<Workflow className="h-10 w-10" />}
        title={t('accountTab.empty.title')}
        description={t('accountTab.empty.description')}
        // ⚠️ #2124.11/#2124.13 (23/09/2026) — LA PORTE QUI MANQUAIT EST POSÉE.
        // Le commentaire qui vivait ici disait, à raison à l'époque : aucun
        // `POST /projects` n'existe, un bouton de création serait un geste qui
        // échoue. Ce n'est plus vrai — #2195.33 (« Ouvrir une affaire ») a posé
        // la route (`projects.controller.ts:350`, `@Post()`, porte
        // `records:write`, clic = décision humaine) et son formulaire
        // (`CreateProjectDialog`, ouvert par `/projects?create=1`, même porte
        // que le lien « Créer un projet » du dossier de mission, #2711.1).
        // Les deux boutons ci-dessous NAVIGUENT vers ce même formulaire,
        // compte pré-rempli — aucune écriture locale, un formulaire générique
        // (doctrine c75), pas un dédié par bouton.
        action={
          <Box display="flex" className="flex-wrap items-center justify-center gap-2">
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/projects" search={{ create: 1, account_id: account.id }}>
                {t('accountTab.createOpportunity')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/projects" search={{ create: 1, account_id: account.id, create_stage: 'confirmed' }}>
                {t('accountTab.createConfirmedNeed')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/projects">{t('accountTab.empty.action')}</Link>
            </Button>
            <Button asChild variant="ghost" className="pointer-coarse:min-h-11">
              <Link to="/settings/mes-donnees" search={{ tab: 'imports' }}>
                {t('accountTab.empty.importAction')}
              </Link>
            </Button>
          </Box>
        }
      />
    )
  }

  return (
    <Box className="space-y-4">
      {/* #2124 (lot M1-9) — LE RÉSUMÉ COMPACT. Le geste empêché : depuis le
          dossier, on ne voyait pas d'un coup ce qui est ACTIF sur ce compte.
          Au-dessus du tableau détaillé, qui reste la vue exhaustive. */}
      <LinkedObjectsSummary buckets={summaryBuckets} />

      {/* #1889 — chercher et resserrer. La barre est AU-DESSUS du bandeau de
          comptes : c'est elle qui commande la liste, et le bandeau décrit ce
          que le compte porte en tout. */}
      <AccountProjectsToolbar
        filters={filters}
        onChange={setFilters}
        counts={{ projects: projects.length, signals: signals.length }}
      />

      <Box display="flex" className="flex-wrap items-center gap-3">
        <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('accountTab.funnel.projects', { count: projects.length })}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('accountTab.funnel.signals', { count: signals.length })}
        </Text>
        {/* Quand la liste est resserrée, elle le DIT et donne son dénominateur.
            Sans cette phrase, le bandeau annonce vingt et un projets au-dessus
            d'un tableau qui en montre six — deux chiffres qui se contredisent. */}
        {narrowed ? (
          <Text size="sm" color="text-[var(--bellum-text-muted)]">
            {t('accountTab.funnel.filtered', { shown: visible.length, total: rows.length })}
          </Text>
        ) : null}
        {/* #2124.11/#2124.13 — la porte reste atteignable même quand le compte
            porte déjà des projets : le compte qui en a un ne cesse pas d'en
            détecter ou d'en ouvrir un second. */}
        <Box display="flex" className="ml-auto flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
            <Link to="/projects" search={{ create: 1, account_id: account.id }}>
              {t('accountTab.createOpportunity')}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
            <Link to="/projects" search={{ create: 1, account_id: account.id, create_stage: 'confirmed' }}>
              {t('accountTab.createConfirmedNeed')}
            </Link>
          </Button>
        </Box>
      </Box>

      {visible.length === 0 && narrowed ? (
        <SearchEmptyState
          title={t('accountTab.filteredEmpty.title')}
          description={t('accountTab.filteredEmpty.description')}
          action={<ClearFiltersAction onClear={() => setFilters(emptyAccountProjectFilters())} />}
        />
      ) : (
        <Box className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD}>{t('accountTab.columns.label')}</TableHead>
                <TableHead className={cn(HEAD, 'max-lg:hidden')}>{t('accountTab.columns.kind')}</TableHead>
                <TableHead className={HEAD}>{t('accountTab.columns.stage')}</TableHead>
                {/* #2119.2 — LE NIVEAU DE PREUVE, à côté de l'étape et jamais à
                  sa place : l'étape dit où en est l'affaire dans le pipe, le
                  niveau dit SUR QUOI elle repose. Une ligne peut être « en
                  négociation » sur un faisceau de faits, et c'est précisément ce
                  qu'il faut voir. */}
                <TableHead className={cn(HEAD, 'max-lg:hidden')}>{t('accountTab.columns.evidence')}</TableHead>
                <TableHead className={cn(HEAD, 'max-xl:hidden')}>{t('accountTab.columns.confidence')}</TableHead>
                <TableHead className={cn(HEAD, 'max-md:hidden')}>{t('accountTab.columns.amount')}</TableHead>
                {/* #1889 — « voir ce qui compte ». Le tableau disait ce QU'EST
                  chaque ligne (type, étape, confiance) et jamais ce qu'il RESTE
                  à faire dessus — l'information qui décide d'un geste. Même clé
                  d'i18n que le pipe : un seul mot pour la même colonne. */}
                <TableHead className={cn(HEAD, 'max-lg:hidden')}>{t('table.columns.nextAction')}</TableHead>
                <TableHead className={cn(HEAD, 'max-lg:hidden')}>{t('accountTab.columns.closeDate')}</TableHead>
                <TableHead className={cn(HEAD, 'max-md:hidden')}>{t('accountTab.columns.stageAge')}</TableHead>
                {/* #2966 (#2119.61) — le secteur DU PROJET/DE LA MISSION, distinct
                  du secteur du COMPTE : ne jamais recopier ce dernier dans tous
                  les projets (#2119, critères de recette). `row.sector` existe
                  déjà (`project.ts:184`), jamais affiché dans le dossier compte
                  avant ce lot — seul le portefeuille transverse le montrait
                  (`NeedsList.tsx`). */}
                <TableHead className={cn(HEAD, 'max-xl:hidden')}>{t('accountTab.columns.sector')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(row => (
                <TableRow key={row.id}>
                  <TableCell className={CELL}>
                    {/* #2708.2 — LE JUMEAU DE `QualificationLeadsQueue.tsx` (#2172).
                        Même cause, même écran (`?tab=projects`), mesurée à 197 px
                        pour la pire ligne : `row.label` porte le texte intégral
                        d'un signal détecté par l'analyse (aucune borne de
                        longueur), rendu sur plusieurs lignes dans une ligne de
                        TABLEAU dense. `line-clamp-2` borne la HAUTEUR, `title`
                        garde le texte intégral atteignable au survol — on ne
                        coupe que l'AFFICHAGE (GA-385). */}
                    <Text
                      size="sm"
                      weight="semibold"
                      color="text-[var(--bellum-text-primary)]"
                      className="line-clamp-2 break-words"
                      title={row.label}
                    >
                      {row.label}
                    </Text>
                    {/* La PORTE ouverte par une relation, sur l'écran où elle
                      existe réellement.
                      ⚠️ Le badge du lot 8 avait été posé sur le pipe, qui filtre
                      sur `isPipelineStage()` — or `openDoorFromMove` insère la
                      porte à `stage: 'detected'` ET `kind: 'signal'`, deux
                      valeurs que le pipe écarte. Il était donc inatteignable
                      pour une vraie porte, et son test passait au vert parce
                      qu'il fabriquait un projet déjà entré dans le pipe.
                      Ici, la porte EST listée depuis toujours — rien ne la
                      distinguait des cent quatre-vingt-dix autres signaux du
                      compte, ce qui est le défaut d'origine à un écran près.
                      Même clé que le pipe : un seul endroit dit le libellé. */}
                    {row.access_mode === 'introduction_relation' ? (
                      <Text element="p" size="xs" color="text-[var(--bellum-text-accent)]">
                        {t('pipeline.doorViaRelation')}
                      </Text>
                    ) : null}
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-lg:hidden')}>
                    <Badge variant="outline" className="px-1 py-0 text-xs">
                      {(PROJECT_KINDS as readonly string[]).includes(row.kind) ? t(`kinds.${row.kind}`) : row.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className={CELL}>
                    <Badge variant="outline" className="whitespace-nowrap px-1 py-0 text-xs">
                      {t(`stage.states.${row.stage}`)}
                    </Badge>
                  </TableCell>
                  {/* #2119.2 — muet quand l'API n'a rien dit, « non mesuré »
                    quand elle a répondu qu'elle ne sait pas. Voir
                    `OpportunityEvidenceBadge`. */}
                  <TableCell className={cn(CELL, 'max-lg:hidden')}>
                    <OpportunityEvidenceBadge evidence={row.evidence} />
                  </TableCell>
                  {/* Trouvé en recette du 11/09 : un projet REPRIS D'UN FICHIER
                    n'a pas de confiance, et la cellule écrivait alors
                    « provenance.confidence.null » — la clé de traduction elle-même,
                    parce qu'un `null` interpolé dans un gabarit devient la chaîne
                    « null » et qu'i18next rend la clé qu'il ne connaît pas.

                    La règle est celle de la colonne `kind` juste au-dessus, qui
                    l'appliquait déjà : on ne traduit que ce qui est DANS l'échelle,
                    on rend tel quel ce qui est stocké hors échelle, et une valeur
                    ABSENTE s'affiche « – » comme le montant — jamais un mot inventé,
                    jamais une clé technique. Une règle écrite pour un cas et pas pour
                    son jumeau est le défaut que cette ligne vient de payer. */}
                  <TableCell className={cn(CELL, 'max-xl:hidden')}>
                    {row.confidence == null ? (
                      <Dash />
                    ) : (PROJECT_CONFIDENCE_LEVELS as readonly string[]).includes(row.confidence) ? (
                      t(`provenance.confidence.${row.confidence}`)
                    ) : (
                      row.confidence
                    )}
                  </TableCell>
                  {/* Un projet sans montant affiche « – ». Jamais 0 € : c'est la
                    règle du §8.2, et le pire défaut d'un pipe est un montant faux. */}
                  <TableCell className={cn(CELL, 'max-md:hidden')}>
                    {row.amount_cents == null ? <Dash /> : formatCents(row.amount_cents)}
                  </TableCell>
                  {/* TRIVALENT, et les trois états se rendent différemment :
                    `undefined` (l'API n'a pas dit — réponse antérieure au champ
                    pendant un déploiement) reste MUET, `null` (aucune tâche
                    ouverte) le DIT, et une tâche s'affiche avec son échéance.
                    Écrire « aucune prochaine action » sur une réponse muette
                    serait une affirmation que rien ne fonde. */}
                  <TableCell className={cn(CELL, 'max-lg:hidden')}>
                    {row.next_action === undefined ? (
                      <Dash />
                    ) : row.next_action === null ? (
                      <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                        {t('accountTab.noNextAction')}
                      </Text>
                    ) : (
                      <Text element="span" size="sm" color="text-[var(--bellum-text-primary)]">
                        {row.next_action.title}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-lg:hidden')}>
                    {row.expected_close_on ? formatDate(new Date(row.expected_close_on)) : <Dash />}
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-md:hidden')}>
                    {t('accountTab.days', { count: daysSince(row.stage_entered_at) })}
                  </TableCell>
                  {/* #2966 (#2119.61) — jamais le secteur du compte : `row.sector`
                    seul, `null` s'affiche « – » comme les autres colonnes. */}
                  <TableCell className={cn(CELL, 'max-xl:hidden')}>{row.sector ?? <Dash />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {generics.length > 0 ? (
        <details className="rounded-md border border-[var(--bellum-border)] px-3 py-2" data-testid="generic-context">
          <summary className="cursor-pointer text-xs text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11">
            {t('accountTab.genericContext.title', { count: generics.length })}
          </summary>
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
            {t('accountTab.genericContext.hint')}
          </Text>
          <ul className="mt-2 space-y-1">
            {generics.map(row => (
              <li key={row.id} className="line-clamp-2 break-words text-xs" title={row.label}>
                {row.label}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Box>
  )
}

function Dash() {
  return (
    <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
      –
    </Text>
  )
}

/** L'âge d'étape en jours. Une date illisible rend 0 plutôt que `NaN` : un
 *  « NaN jour » à l'écran est le genre de détail qui fait douter de tout le reste. */
function daysSince(value: string): number {
  const entered = new Date(value).getTime()
  if (Number.isNaN(entered)) return 0
  return Math.max(0, Math.floor((Date.now() - entered) / 86_400_000))
}
