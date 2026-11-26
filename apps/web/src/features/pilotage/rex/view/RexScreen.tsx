import {
  CASE_BUYING_MODELS,
  CASE_ORGANISATIONS,
  CASE_STRATEGIES,
  hasPermission,
  type CaseBuyingModel,
  type CaseOrganisation,
  type CaseStrategy,
} from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  SelectField,
  Text,
  Textarea,
} from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { NotebookPen } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TheoNote, TheoPill, TheoTabPanel, TheoTabs } from '@/components/page/theo-page-grammar'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { useTeam } from '@/features/team/hooks/useTeam'
import { rexApi, REX_KEY, type CollectedRexRow, type PendingRexRow, type WorkspaceRex } from '../api'
import { formatDate } from '@/lib/locale'
import { LostDealLearningSection, useLostDealLearningCounts } from './LostDealLearningSection'

/**
 * Les retours d'expérience de l'espace (`/pilotage/rex`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT N'ÉTAIT NI LA TABLE NI LE CALCUL
 * ─────────────────────────────────────────────────────────────────────────
 * `rex_entries` existe depuis la migration `1789551204833`. La règle « une
 * mission FINIE et sans retour » est écrite et testée depuis le PDF 2 §12. Laura
 * sait même dire « une mission s'est terminée il y a plus de deux semaines sans
 * retour d'expérience ». Ce qui n'existait pas, c'est l'endroit où l'on ÉCRIT ce
 * retour : `POST /capitalisation/rex` n'avait AUCUN appelant. Une file d'attente
 * sans porte d'entrée ne peut que grandir — et un écran branché dessus aurait
 * affiché un vide permanent.
 *
 * D'où la forme : les deux moitiés sur le même écran. Ce qui ATTEND porte le
 * geste qui le fait sortir de la file ; ce qui est RECUEILLI prouve que le geste
 * mène quelque part. L'une sans l'autre, on affiche soit une liste de reproches,
 * soit une archive sans entrée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun taux, aucune moyenne, aucune courbe. « 62 % des missions débriefées »
 * serait une note ; une moyenne sur un retour serait un chiffre inventé, et
 * l'historique qu'une courbe suppose n'existe pas — nous ne servons pas de
 * série. Ce qui est affiché sont des COMPTES d'objets, et chaque compte est
 * posé juste au-dessus de la liste qu'il dénombre : « aller voir les 42 % » n'a
 * aucun sens, « voici les trois missions » en a un.
 */
export function RexScreen() {
  const { t } = useTranslation('pilotage')
  const { team } = useTeam()
  const qc = useQueryClient()
  const [openMission, setOpenMission] = useState<string | null>(null)

  /**
   * ⚠️ `hasPermission` et non un test de rôle en dur : le serveur garde
   * l'écriture par `records:write`, qui appartient aussi au recruteur et au
   * commercial. Comparer à `owner` cacherait le geste à ceux à qui il est ouvert
   * — la faute exacte que `SectionTabs` documente pour le Pilotage.
   */
  const canWrite = hasPermission(team?.workspace.role ?? 'member', 'records:write')

  const { data, isLoading, isError } = useQuery({
    queryKey: REX_KEY,
    queryFn: rexApi.workspace,
    staleTime: 30_000,
  })

  const collect = useMutation({
    mutationFn: rexApi.collect,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: REX_KEY })
      setOpenMission(null)
      toast.success(t('rex.form.saved'))
    },
    onError: (error: Error) => toast.error(t('rex.form.saveFailed'), { description: error.message }),
  })

  const rex = data as WorkspaceRex | undefined
  const learningCounts = useLostDealLearningCounts()
  // Théo PR12 (notre maquette validée `maq-actions-19-10/rex.html`) — quatre VRAIS onglets. Sans choix, l'écran
  // s'ouvre sur la première file qui a du contenu : ce qui attend, sinon ce qui est recueilli.
  const [chosenTab, setChosenTab] = useState<RexTab | null>(null)
  const tab: RexTab =
    chosenTab ?? (rex && rex.pending.length === 0 && rex.collected.length > 0 ? 'collected' : 'pending')
  // Le plus ancien retour en attente : celui que la question du haut propose de recueillir d'abord.
  const oldest = rex ? oldestPending(rex.pending) : null
  const openRow = rex?.pending.find(row => row.mission_id === openMission) ?? null

  const tabs: { key: RexTab; label: string; count?: number }[] = [
    {
      key: 'pending',
      label: t('rex.tabs.pending'),
      ...(rex && rex.pending.length > 0 ? { count: rex.pending.length } : {}),
    },
    {
      key: 'collected',
      label: t('rex.tabs.collected'),
      ...(rex && rex.collected.length > 0 ? { count: rex.collected.length } : {}),
    },
    {
      key: 'losses',
      label: t('rex.tabs.losses'),
      ...(learningCounts.losses ? { count: learningCounts.losses } : {}),
    },
    { key: 'rules', label: t('rex.tabs.rules'), ...(learningCounts.rules ? { count: learningCounts.rules } : {}) },
  ]

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* La question du haut (`p.question` de notre maquette) : le retour le plus ancien, et le geste qui l'ouvre. */}
      {canWrite && oldest ? (
        <div
          className="flex flex-col gap-3 rounded-card border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          data-testid="rex-question"
        >
          <Text size="sm" className="text-[var(--bellum-text-primary)]">
            {oldest.days !== null
              ? t('rex.question', { mission: oldest.row.label || t('rex.unnamedMission'), count: oldest.days })
              : t('rex.questionNoDate', { mission: oldest.row.label || t('rex.unnamedMission') })}
          </Text>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setChosenTab('pending')
              setOpenMission(oldest.row.mission_id)
            }}
          >
            {t('rex.questionCta')}
          </Button>
        </div>
      ) : null}

      {/* #3295 — l'apprentissage des pertes ne dépend plus de la longueur des files : ses deux onglets sont dans
          la barre, au-dessus de tout le contenu. */}
      <TheoTabs tabs={tabs} active={tab} onChange={setChosenTab} label={t('rex.tabsLabel')} idPrefix="rex" />

      {tab === 'losses' ? (
        <TheoTabPanel idPrefix="rex" tabKey="losses">
          <div data-testid="rex-lost-deal-learning">
            <LostDealLearningSection view="losses" />
          </div>
        </TheoTabPanel>
      ) : tab === 'rules' ? (
        <TheoTabPanel idPrefix="rex" tabKey="rules">
          <div data-testid="rex-lost-deal-learning">
            <LostDealLearningSection view="rules" />
          </div>
        </TheoTabPanel>
      ) : isLoading ? (
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('rex.loading')}
        </Text>
      ) : isError || !rex ? (
        /* Un espace ILLISIBLE et un espace SANS retour se ressemblent, et l'un
           des deux est une panne. Un compteur à zéro ferait passer la seconde
           pour la première. */
        <TheoNote tone="neutral">
          <span className="text-[var(--warning-soft-text)]">{t('rex.unavailable')}</span>
        </TheoNote>
      ) : rex.pending.length === 0 && rex.collected.length === 0 ? (
        /* L'état vide OUVRE la porte qu'il nomme : les retours viennent des
           missions terminées, et le lien mène aux missions. */
        <EmptyState
          size="md"
          align="center"
          icon={<NotebookPen className="h-10 w-10 text-[var(--bellum-text-muted)]" />}
          title={t('rex.empty.title')}
          description={t('rex.empty.description')}
          action={
            <Link
              to="/missions"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)]"
            >
              {t('rex.empty.action')}
            </Link>
          }
        />
      ) : tab === 'pending' ? (
        <TheoTabPanel idPrefix="rex" tabKey="pending">
          <section aria-label={t('rex.pending.title')} className="flex flex-col gap-3">
            {/* #1828 — la phrase de doctrine rejoint la file « À recueillir » : l'urgence de recueillir à chaud
                est le propos de CETTE file, pas de tout l'écran. */}
            <h2 className="sr-only">{t('rex.pending.title')}</h2>
            <Text size="sm" className="block text-[var(--bellum-text-secondary)]">
              {t('rex.intro')}
            </Text>
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {rex.pending.length === 0 ? t('rex.pending.none') : t('rex.pending.count', { count: rex.pending.length })}
            </Text>
            {rex.pending.length > 0 ? (
              <div className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2">
                <ResponsiveTable
                  rows={rex.pending}
                  rowKey={row => row.mission_id}
                  scrollLabel={t('rex.pending.title')}
                  columns={[
                    {
                      key: 'mission',
                      header: t('rex.col.mission'),
                      mobile: 'title',
                      render: row => (
                        <span className="flex min-w-0 flex-col">
                          <Text element="span" size="sm" weight="semibold">
                            {row.label || t('rex.unnamedMission')}
                          </Text>
                          {/* Un compte que cet espace ne porte pas reste SANS nom. « Compte inconnu » serait une
                              valeur de remplissage. */}
                          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                            {row.account_label ?? t('rex.unnamedAccount')}
                          </Text>
                        </span>
                      ),
                    },
                    {
                      key: 'end',
                      header: t('rex.col.end'),
                      mobile: 'meta',
                      className: 'whitespace-nowrap',
                      render: row => (
                        <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
                          {row.ended_on
                            ? t('rex.pending.endedOn', { date: formatDate(new Date(row.ended_on)) })
                            : t('rex.pending.noEndDate')}
                        </Text>
                      ),
                    },
                    {
                      key: 'waiting',
                      header: t('rex.col.waiting'),
                      className: 'whitespace-nowrap',
                      render: row => {
                        const days = daysSince(row.ended_on)
                        // Aucune date de fin : aucune attente à afficher — jamais « depuis 0 jour ».
                        return days === null ? null : (
                          <TheoPill tone={days > 30 ? 'warning' : 'neutral'}>
                            {t('rex.waitingDays', { count: days })}
                          </TheoPill>
                        )
                      },
                    },
                    {
                      key: 'action',
                      header: '',
                      mobile: 'field',
                      render: row =>
                        canWrite ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setOpenMission(row.mission_id)}
                            className="shrink-0 pointer-coarse:min-h-11"
                          >
                            {t('rex.pending.collect')}
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </div>
            ) : null}
            {rex.pending.length > 0 && !canWrite ? (
              /* On retire le GESTE, pas l'information : la liste reste
                 lisible, et la raison de l'absence de bouton est écrite. */
              <TheoNote tone="neutral">{t('rex.pending.noRight')}</TheoNote>
            ) : null}
          </section>
        </TheoTabPanel>
      ) : (
        <TheoTabPanel idPrefix="rex" tabKey="collected">
          <section aria-label={t('rex.collected.title')} className="flex flex-col gap-3">
            <h2 className="sr-only">{t('rex.collected.title')}</h2>
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {rex.collected.length === 0
                ? t('rex.collected.none')
                : t('rex.collected.count', { count: rex.collected.length })}
            </Text>
            {rex.collected.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {rex.collected.map(row => (
                  <CollectedRow key={row.id} row={row} />
                ))}
              </ul>
            ) : null}
          </section>
        </TheoTabPanel>
      )}

      {/* Le formulaire s'ouvre en panneau (`etat-rex-*` de notre maquette), la mission sous les yeux. */}
      <Dialog open={canWrite && openRow !== null} onOpenChange={open => (open ? null : setOpenMission(null))}>
        <DialogContent closeLabel={t('rex.form.cancel')} className="max-w-2xl">
          {openRow ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('rex.formTitle', { mission: openRow.label || t('rex.unnamedMission') })}</DialogTitle>
                <DialogDescription>
                  {openRow.account_label ?? t('rex.unnamedAccount')}
                  {' · '}
                  {openRow.ended_on
                    ? t('rex.pending.endedOn', { date: formatDate(new Date(openRow.ended_on)) })
                    : t('rex.pending.noEndDate')}
                </DialogDescription>
              </DialogHeader>
              <RexForm
                missionId={openRow.mission_id}
                accountId={openRow.account_id}
                mission={openRow.label || t('rex.unnamedMission')}
                busy={collect.isPending}
                onSubmit={input => collect.mutate(input)}
                onCancel={() => setOpenMission(null)}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type RexTab = 'pending' | 'collected' | 'losses' | 'rules'

const DAY_MS = 24 * 60 * 60 * 1000

/** Jours écoulés depuis la fin de la mission — un FAIT daté, pas une note. Sans date : `null`, rien ne s'affiche. */
function daysSince(endedOn: string | null): number | null {
  if (!endedOn) return null
  const ms = Date.now() - new Date(endedOn).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / DAY_MS)
}

function oldestPending(rows: PendingRexRow[]): { row: PendingRexRow; days: number | null } | null {
  if (rows.length === 0) return null
  const dated = rows
    .map(row => ({ row, days: daysSince(row.ended_on) }))
    .sort((left, right) => (right.days ?? -1) - (left.days ?? -1))
  return dated[0] ?? null
}

type CollectInput = Parameters<typeof rexApi.collect>[0]

/**
 * Le formulaire — le seul appelant de `POST /capitalisation/rex`.
 *
 * Trois champs, tous écrits par un humain, aucun calculé. Le résumé est le seul
 * obligatoire : un retour sans texte ne rapporte l'expérience de personne, et
 * enregistrer une ligne vide ferait sortir la mission de la file sans que rien
 * n'ait été appris.
 */
function RexForm({
  missionId,
  accountId,
  mission,
  busy,
  onSubmit,
  onCancel,
}: {
  missionId: string
  accountId: string | null
  mission: string
  busy: boolean
  onSubmit: (input: CollectInput) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('pilotage')
  const [summary, setSummary] = useState('')
  const [worked, setWorked] = useState('')
  const [failed, setFailed] = useState('')
  // #2424.3 — trois des quinze champs nommés (équipe, compétences,
  // contraintes). Douze autres restent à trancher avec la liste réelle.
  const [team, setTeam] = useState('')
  const [skills, setSkills] = useState('')
  const [constraints, setConstraints] = useState('')
  // #3210.2 (épopée #3246) — sept des douze champs restants d'un cas validé.
  const [offer, setOffer] = useState('')
  const [expertise, setExpertise] = useState('')
  const [accessPath, setAccessPath] = useState('')
  const [firstDoor, setFirstDoor] = useState('')
  const [proofUsed, setProofUsed] = useState('')
  const [cycleDuration, setCycleDuration] = useState('')
  const [partner, setPartner] = useState('')
  // #3246 (lot W9 + lot cloud 14/10) — trois choix FERMÉS ; '' = non renseigné, envoyé `null`.
  const [strategy, setStrategy] = useState('')
  const [buyingModel, setBuyingModel] = useState('')
  const [organisation, setOrganisation] = useState('')

  const fields: { id: string; label: string; placeholder: string; value: string; set: (value: string) => void }[] = [
    {
      id: `rex-summary-${missionId}`,
      label: t('rex.form.summary'),
      placeholder: t('rex.form.summaryPlaceholder'),
      value: summary,
      set: setSummary,
    },
    {
      id: `rex-worked-${missionId}`,
      label: t('rex.form.worked'),
      placeholder: t('rex.form.workedPlaceholder'),
      value: worked,
      set: setWorked,
    },
    {
      id: `rex-failed-${missionId}`,
      label: t('rex.form.failed'),
      placeholder: t('rex.form.failedPlaceholder'),
      value: failed,
      set: setFailed,
    },
    {
      id: `rex-team-${missionId}`,
      label: t('rex.form.team'),
      placeholder: t('rex.form.teamPlaceholder'),
      value: team,
      set: setTeam,
    },
    {
      id: `rex-skills-${missionId}`,
      label: t('rex.form.skills'),
      placeholder: t('rex.form.skillsPlaceholder'),
      value: skills,
      set: setSkills,
    },
    {
      id: `rex-constraints-${missionId}`,
      label: t('rex.form.constraints'),
      placeholder: t('rex.form.constraintsPlaceholder'),
      value: constraints,
      set: setConstraints,
    },
    {
      id: `rex-offer-${missionId}`,
      label: t('rex.form.offer'),
      placeholder: t('rex.form.offerPlaceholder'),
      value: offer,
      set: setOffer,
    },
    {
      id: `rex-expertise-${missionId}`,
      label: t('rex.form.expertise'),
      placeholder: t('rex.form.expertisePlaceholder'),
      value: expertise,
      set: setExpertise,
    },
    {
      id: `rex-access-path-${missionId}`,
      label: t('rex.form.access_path'),
      placeholder: t('rex.form.access_pathPlaceholder'),
      value: accessPath,
      set: setAccessPath,
    },
    {
      id: `rex-first-door-${missionId}`,
      label: t('rex.form.first_door'),
      placeholder: t('rex.form.first_doorPlaceholder'),
      value: firstDoor,
      set: setFirstDoor,
    },
    {
      id: `rex-proof-used-${missionId}`,
      label: t('rex.form.proof_used'),
      placeholder: t('rex.form.proof_usedPlaceholder'),
      value: proofUsed,
      set: setProofUsed,
    },
    {
      id: `rex-cycle-duration-${missionId}`,
      label: t('rex.form.cycle_duration'),
      placeholder: t('rex.form.cycle_durationPlaceholder'),
      value: cycleDuration,
      set: setCycleDuration,
    },
    {
      id: `rex-partner-${missionId}`,
      label: t('rex.form.partner'),
      placeholder: t('rex.form.partnerPlaceholder'),
      value: partner,
      set: setPartner,
    },
  ]

  return (
    <div className="mt-4 space-y-4 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4">
      <Text size="sm" weight="semibold" className="block text-[var(--bellum-text-primary)]">
        {t('rex.form.legend', { mission })}
      </Text>

      {fields.map(field => (
        <div key={field.id}>
          <label htmlFor={field.id} className="mb-1 block text-xs font-medium text-[var(--bellum-text-secondary)]">
            {field.label}
          </label>
          <Textarea
            id={field.id}
            value={field.value}
            maxLength={2000}
            rows={2}
            placeholder={field.placeholder}
            onChange={event => field.set(event.target.value)}
          />
        </div>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs text-[var(--bellum-text-muted)]">{t('rex.form.strategy')}</span>
          <SelectField
            ariaLabel={t('rex.form.strategy')}
            value={strategy}
            onChange={setStrategy}
            placeholder={t('rex.form.choicePlaceholder')}
            emptyOption={{ label: t('rex.form.choiceNone') }}
            options={CASE_STRATEGIES.map(code => ({ value: code, label: t(`rex.strategies.${code}`) }))}
          />
        </div>
        <div>
          <span className="mb-1 block text-xs text-[var(--bellum-text-muted)]">{t('rex.form.buying_model')}</span>
          <SelectField
            ariaLabel={t('rex.form.buying_model')}
            value={buyingModel}
            onChange={setBuyingModel}
            placeholder={t('rex.form.choicePlaceholder')}
            emptyOption={{ label: t('rex.form.choiceNone') }}
            options={CASE_BUYING_MODELS.map(code => ({ value: code, label: t(`rex.buyingModels.${code}`) }))}
          />
        </div>
        <div>
          <span className="mb-1 block text-xs text-[var(--bellum-text-muted)]">{t('rex.form.organisation')}</span>
          <SelectField
            ariaLabel={t('rex.form.organisation')}
            value={organisation}
            onChange={setOrganisation}
            placeholder={t('rex.form.choicePlaceholder')}
            emptyOption={{ label: t('rex.form.choiceNone') }}
            options={CASE_ORGANISATIONS.map(code => ({ value: code, label: t(`rex.organisations.${code}`) }))}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={summary.trim().length === 0 || busy}
          className="pointer-coarse:min-h-11"
          onClick={() =>
            onSubmit({
              mission_id: missionId,
              account_id: accountId,
              summary: summary.trim(),
              // Un champ laissé vide est ABSENT, pas une chaîne vide : la base
              // le stocke `null`, et « rien à signaler » ne s'écrit pas « ».
              what_worked: worked.trim() || null,
              what_failed: failed.trim() || null,
              team: team.trim() || null,
              skills: skills.trim() || null,
              constraints: constraints.trim() || null,
              offer: offer.trim() || null,
              expertise: expertise.trim() || null,
              access_path: accessPath.trim() || null,
              first_door: firstDoor.trim() || null,
              proof_used: proofUsed.trim() || null,
              cycle_duration: cycleDuration.trim() || null,
              partner: partner.trim() || null,
              strategy: CASE_STRATEGIES.find(code => code === strategy) ?? null,
              buying_model: CASE_BUYING_MODELS.find(code => code === buyingModel) ?? null,
              organisation: CASE_ORGANISATIONS.find(code => code === organisation) ?? null,
            })
          }
        >
          {t('rex.form.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onCancel}>
          {t('rex.form.cancel')}
        </Button>
      </div>
    </div>
  )
}

function CollectedRow({ row }: { row: CollectedRexRow }) {
  const { t } = useTranslation('pilotage')

  return (
    <li className="w-full rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* F1 · Mention — le libellé ouvre le dossier de la mission (D200). Un
          retour d'expérience se relit toujours avec la mission sous les yeux :
          « bien passé » ne veut rien dire sans la durée, le canal et qui était
          dessus. Le libellé était du texte mort. */}
          {row.mission_label ? (
            <ObjectMention kind="mission" id={row.mission_id} name={row.mission_label} />
          ) : (
            <Text size="sm" weight="medium">
              {t('rex.unnamedMission')}
            </Text>
          )}
          <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
            {row.account_label ?? t('rex.unnamedAccount')}
          </Text>
        </div>
        {/* La date vit dans la pastille (une donnée, un endroit) : un retour sans sa date ne se relit pas. */}
        <TheoPill tone="success">{t('rex.collected.on', { date: formatDate(new Date(row.collected_at)) })}</TheoPill>
      </div>
      <Text size="sm" className="mt-3 block leading-relaxed">
        {row.summary}
      </Text>
      {/* Une rubrique ne s'ouvre que si elle a un contenu : un intitulé suivi
          d'un vide promet quelque chose qui n'existe pas. */}
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4 empty:hidden sm:grid-cols-2">
        {row.what_worked && <Detail label={t('rex.collected.worked')} value={row.what_worked} />}
        {row.what_failed && <Detail label={t('rex.collected.failed')} value={row.what_failed} />}
        {row.team && <Detail label={t('rex.collected.team')} value={row.team} />}
        {row.skills && <Detail label={t('rex.collected.skills')} value={row.skills} />}
        {row.constraints && <Detail label={t('rex.collected.constraints')} value={row.constraints} />}
        {row.offer && <Detail label={t('rex.collected.offer')} value={row.offer} />}
        {row.expertise && <Detail label={t('rex.collected.expertise')} value={row.expertise} />}
        {row.access_path && <Detail label={t('rex.collected.access_path')} value={row.access_path} />}
        {row.first_door && <Detail label={t('rex.collected.first_door')} value={row.first_door} />}
        {row.proof_used && <Detail label={t('rex.collected.proof_used')} value={row.proof_used} />}
        {row.cycle_duration && <Detail label={t('rex.collected.cycle_duration')} value={row.cycle_duration} />}
        {row.partner && <Detail label={t('rex.collected.partner')} value={row.partner} />}
        {row.strategy && <Detail label={t('rex.form.strategy')} value={t(`rex.strategies.${row.strategy}`)} />}
        {row.buying_model && (
          <Detail label={t('rex.form.buying_model')} value={t(`rex.buyingModels.${row.buying_model}`)} />
        )}
        {row.organisation && (
          <Detail label={t('rex.form.organisation')} value={t(`rex.organisations.${row.organisation}`)} />
        )}
      </div>
    </li>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" weight="medium" className="block text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm" className="block">
        {value}
      </Text>
    </div>
  )
}
