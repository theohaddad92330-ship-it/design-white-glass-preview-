import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Button, Text } from '@bellum/ui'
import {
  LAURA_JOB_CAPABILITIES,
  LAURA_JOB_LIMITS,
  lauraJobAwaitsApproval,
  lauraJobGesturesOf,
  lauraJobPreviewOf,
  lauraJobViewSchema,
  type LauraJobGesture,
  type LauraJobLimit,
  type LauraJobState,
  type LauraJobView,
} from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { lauraJobApi } from '../api/lauraJobApi'
import { jobStatusOf } from './work/job-status'
import { LauraWorkStatus } from './work/LauraWorkStatus'

/**
 * #2276 — le job composite de Laura, dans le fil.
 *
 * Une demande complexe n'est plus simulée par une réponse texte : Laura pose une
 * fiche de job, l'API la persiste et sert sa VUE (`context.laura_job`,
 * `LauraJobService.toView`). Cette carte la LIT — état, intention, résultat
 * attendu, périmètre, hypothèses, étapes et dépendances, coût maximum, validations
 * — et ne recalcule rien (GA-26 : les dérivations vivent dans le contrat).
 *
 * #2276 tranche 2 — elle porte les GESTES que le contrat permet dans l'état lu
 * (`lauraJobGesturesOf`, la même lecture que le refus de l'API) : confirmer
 * (le coût maximum est réservé, rien n'est débité d'avance), valider l'étape qui
 * attend, reprendre, annuler. Chaque geste rend la vue RELUE du serveur. Pendant
 * que le job tourne, la carte relit sa fiche : on peut fermer l'onglet et revenir.
 * Chaque étape montre sa preuve (état, crédits débités, raison).
 *
 * Une forme qui n'est pas celle du contrat (onglet d'avant le déploiement,
 * réponse tronquée) ne rend RIEN : jamais une carte à moitié devinée.
 */

/** Les états où rien n'est encore parti. */
const WAITING_STATES: readonly LauraJobState[] = ['draft', 'to_confirm', 'planned']
/** Les états où le serveur travaille : la carte relit la fiche. */
const LIVE_STATES: readonly LauraJobState[] = ['planned', 'running']
const POLL_MS = 4_000

export function LauraJobCard({ job }: { job: unknown }) {
  const parsed = useMemo(() => lauraJobViewSchema.safeParse(job), [job])
  if (!parsed.success) return null
  return <LauraJobCardBody initial={parsed.data} />
}

function LauraJobCardBody({ initial }: { initial: LauraJobView }) {
  const { t } = useTranslation('chat')
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setView(initial), [initial])

  const live = LIVE_STATES.includes(view.state)
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      lauraJobApi
        .get(view.id)
        .then(setView)
        .catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [live, view.id])

  const { brief } = view
  const labelOf = new Map(brief.steps.map(step => [step.key, step.label]))
  const accountSteps = new Set(
    brief.steps.filter(step => LAURA_JOB_CAPABILITIES[step.capability].targetsAccounts).map(step => step.key),
  )
  const needsApproval = new Set(view.validationsRequired.map(step => step.key))
  const waitingStep = view.state === 'awaiting_approval' ? lauraJobAwaitsApproval(brief) : null
  // « Valider » ne se montre que s'il nomme l'étape qui attend — jamais un bouton sans objet.
  const gestures = lauraJobGesturesOf(view.state, brief).filter(name => name !== 'approve' || waitingStep)
  const waiting = WAITING_STATES.includes(view.state)
  const preview = lauraJobPreviewOf(brief)
  // #5045 — dès que le travail est parti, les étapes se replient sous « Voir le détail ».
  const started = jobStatusOf(view).started

  function limitText(limit: LauraJobLimit): string {
    const label = labelOf.get(limit.stepKey) ?? limit.stepKey
    // #3860.1 — une analyse vise des COMPTES, pas des contacts : la limite le nomme.
    const onAccounts = accountSteps.has(limit.stepKey)
    switch (limit.kind) {
      case 'max_targets':
        return t(onAccounts ? 'lauraJob.preview.maxAccountTargets' : 'lauraJob.preview.maxTargets', {
          label,
          count: limit.max,
        })
      case 'no_targets':
        return t(onAccounts ? 'lauraJob.preview.noAccountTargets' : 'lauraJob.preview.noTargets', { label })
      case 'not_executable':
        return t('lauraJob.preview.notExecutable', { label })
      case 'missing_criteria':
        return t('lauraJob.preview.missingCriteria', { label })
      case 'targets_from_step':
        // #3860.2 — les cibles viendront de l'étape en amont, pas du périmètre de départ.
        return t('lauraJob.preview.targetsFromStep', {
          label,
          from: labelOf.get(limit.fromStepKey) ?? limit.fromStepKey,
        })
    }
  }

  async function act(name: LauraJobGesture) {
    setBusy(true)
    setError(null)
    try {
      setView(await lauraJobApi.gesture(view.id, name, name === 'approve' ? waitingStep?.key : undefined))
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : null
      setError(
        t(
          status === 402
            ? 'lauraJob.error.insufficient'
            : status === 409
              ? 'lauraJob.error.conflict'
              : 'lauraJob.error.generic',
        ),
      )
      if (status === 409) void lauraJobApi.get(view.id).then(setView, () => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label={t('lauraJob.aria', { intent: brief.intent })}
      className="mt-2 flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
    >
      <LauraWorkStatus view={view} />
      <div className="flex flex-wrap items-center gap-2">
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('lauraJob.title')}
        </Text>
        <span className="rounded-full border border-[var(--bellum-border)] px-2 py-0.5 text-xs text-[var(--bellum-text-primary)]">
          {t(`lauraJob.state.${view.state}`)}
        </span>
      </div>
      <Text size="sm" weight="semibold">
        {brief.intent}
      </Text>
      <Text size="xs">{t('lauraJob.expectedOutcome', { text: brief.expectedOutcome })}</Text>
      <Text size="xs">{t('lauraJob.scope', { text: brief.scope.description })}</Text>
      {brief.assumptions.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('lauraJob.assumptions', { items: brief.assumptions.join(' · ') })}
        </Text>
      ) : null}

      <StepsFold started={started}>
        <Text size="xs" weight="semibold">
          {t('lauraJob.steps')}
        </Text>
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          {brief.steps.map(step => {
            const results = brief.intermediateResults.filter(result => result.stepKey === step.key)
            return (
              <li key={step.key} className="text-xs text-[var(--bellum-text-primary)]">
                <span>{step.label}</span>
                <span className="text-[var(--bellum-text-muted)]">
                  {' — '}
                  {t(`lauraJob.capability.${step.capability}`)}
                  {step.units > 1 ? ` ${t('lauraJob.units', { count: step.units })}` : ''}
                </span>
                {step.dependsOn.length > 0 ? (
                  <span className="text-[var(--bellum-text-muted)]">
                    {' · '}
                    {step.dependsOn.map(key => t('lauraJob.after', { label: labelOf.get(key) ?? key })).join(', ')}
                  </span>
                ) : null}
                {needsApproval.has(step.key) ? (
                  <span className="text-[var(--bellum-text-muted)]">
                    {' · '}
                    {step.approvedAt ? t('lauraJob.approved') : t('lauraJob.needsApproval')}
                  </span>
                ) : null}
                {/* #2276.59 — la preuve de l'étape, dès qu'elle a bougé. */}
                {step.status !== 'todo' ? (
                  <span className="block text-[var(--bellum-text-muted)]">
                    {t(`lauraJob.stepStatus.${step.status}`)}
                    {step.note ? ` · ${t(`lauraJob.note.${step.note}`)}` : ''}
                    {/* #3860.1 — une étape qui attend ses analyses asynchrones le dit. */}
                    {step.awaiting.length > 0 ? ` · ${t('lauraJob.awaiting', { count: step.awaiting.length })}` : ''}
                    {results.length > 0
                      ? ` · ${t('lauraJob.result', { summary: results[results.length - 1]?.summary ?? '' })}`
                      : ''}
                  </span>
                ) : null}
              </li>
            )
          })}
          {view.synthesis ? <SynthesisStep synthesis={view.synthesis} /> : null}
        </ol>
      </StepsFold>

      {/* #2276.46 / .47 / .51 — la prévisualisation : ce qui est relu, ce qui est
          neuf, et les limites que l'exécuteur appliquera — lus au contrat. */}
      {preview.reused.length > 0 ? (
        <Text size="xs">
          {t('lauraJob.preview.reused', { items: preview.reused.map(step => step.label).join(' · ') })}
        </Text>
      ) : null}
      {preview.newActions.length > 0 ? (
        <Text size="xs">
          {t('lauraJob.preview.newActions', { items: preview.newActions.map(step => step.label).join(' · ') })}
        </Text>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <Text size="xs" weight="semibold">
          {t('lauraJob.preview.limitsTitle')}
        </Text>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-[var(--bellum-text-muted)]">
          {preview.limits.map(limit => (
            <li key={`${limit.kind}-${limit.stepKey}`}>{limitText(limit)}</li>
          ))}
          <li>
            {t('lauraJob.preview.ceilings', {
              contacts: LAURA_JOB_LIMITS.maxContacts,
              accounts: LAURA_JOB_LIMITS.maxAccounts,
            })}
          </li>
        </ul>
      </div>
      {brief.sources.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('lauraJob.sources', { items: brief.sources.join(' · ') })}
        </Text>
      ) : null}
      {/* #2276.49 — la durée ne s'affiche que MESURÉE (posée par le serveur sur
          les étapes réellement exécutées, avec sa base) ; « non estimée » ne
          s'affiche pas : jamais « 0 min » (GA-18), jamais une durée inventée. */}
      {brief.estimatedDurationSeconds !== null && brief.estimatedDurationBasis !== null ? (
        <Text size="xs">
          {t('lauraJob.durationMeasured', {
            minutes: Math.max(1, Math.round(brief.estimatedDurationSeconds / 60)),
            count: brief.estimatedDurationBasis,
          })}
        </Text>
      ) : null}
      {view.validationsRequired.length > 0 && waiting ? (
        <Text size="xs">{t('lauraJob.validations', { count: view.validationsRequired.length })}</Text>
      ) : null}
      {/* #3860.4 — une fois le job au bout, la synthèse porte ce qui a été produit
          et les erreurs : rien ne s'affiche deux fois sous la même forme (GA-26). */}
      {!view.synthesis && brief.createdObjects.length > 0 ? (
        <Text size="xs">
          {t('lauraJob.created', { items: brief.createdObjects.map(object => object.label).join(' · ') })}
        </Text>
      ) : null}
      {!view.synthesis && brief.errors.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('lauraJob.errors', { items: brief.errors.map(entry => entry.message).join(' · ') })}
        </Text>
      ) : null}
      {view.state === 'draft' ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('lauraJob.draftMissing')}
        </Text>
      ) : null}
      {view.state === 'draft' || view.state === 'to_confirm' ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('lauraJob.nothingLaunched')}
        </Text>
      ) : null}

      {gestures.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {gestures.map(name => (
            <Button
              key={name}
              size="sm"
              {...(name === 'cancel' ? { variant: 'ghost' as const } : {})}
              disabled={busy}
              onClick={() => void act(name)}
            >
              {name === 'approve'
                ? t('lauraJob.gesture.approve', { label: waitingStep?.label ?? '' })
                : t(`lauraJob.gesture.${name}`)}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-[var(--bellum-text-primary)]">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/**
 * #5045 — la liste des VRAIES étapes du job : visible avant lancement (on relit
 * le plan), repliable « Voir le détail » dès que le travail est parti.
 */
function StepsFold({ started, children }: { started: boolean; children: React.ReactNode }) {
  const { t } = useTranslation('chat')
  const title = (
    <Text size="xs" weight="semibold">
      {t('lauraJob.steps')}
    </Text>
  )
  if (!started) {
    return (
      <div className="flex flex-col gap-1">
        {title}
        {children}
      </div>
    )
  }
  return (
    <details className="flex flex-col gap-1">
      <summary className="min-h-11 cursor-pointer text-xs font-semibold text-[var(--bellum-text-primary)]">
        {t('lauraJob.work.detail')}
      </summary>
      {children}
    </details>
  )
}

const LINK_CLASS = 'underline underline-offset-2 hover:text-[var(--bellum-text-primary)]'

/**
 * #3860.4 — DÉCISION LOUIS 09/10 : la DERNIÈRE étape du job, sa synthèse —
 * ce qu'il a produit (comptes analysés, contacts, messages préparés, chacun
 * avec son lien) et ce qui a échoué ou reste `unknown`. Lue telle quelle
 * (`view.synthesis`, `lauraJobSynthesisOf`), jamais recalculée ; aucun crédit.
 * Une liste vide ne fait AUCUNE ligne (on n'affiche pas ce qu'on n'a pas).
 */
function SynthesisStep({ synthesis }: { synthesis: NonNullable<LauraJobView['synthesis']> }) {
  const { t } = useTranslation('chat')
  const produced = synthesis.accounts.length + synthesis.contacts.length + synthesis.messages.length > 0
  const links = (items: ReadonlyArray<{ key: string; node: React.ReactNode }>) =>
    items.map((item, index) => (
      <span key={item.key}>
        {index > 0 ? ' · ' : ''}
        {item.node}
      </span>
    ))
  return (
    <li data-testid="laura-job-synthesis" className="text-xs text-[var(--bellum-text-primary)]">
      <span>{t('lauraJob.synthesis.title')}</span>
      {synthesis.accounts.length > 0 ? (
        <span className="block text-[var(--bellum-text-muted)]">
          {t('lauraJob.synthesis.accounts', { count: synthesis.accounts.length })}{' '}
          {links(
            synthesis.accounts.map(account => ({
              key: account.id,
              node: (
                <Link to="/accounts/$id" params={{ id: account.id }} className={LINK_CLASS}>
                  {account.name}
                </Link>
              ),
            })),
          )}
        </span>
      ) : null}
      {synthesis.contacts.length > 0 ? (
        <span className="block text-[var(--bellum-text-muted)]">
          {t('lauraJob.synthesis.contacts', { count: synthesis.contacts.length })}{' '}
          {links(
            synthesis.contacts.map(contact => ({
              key: contact.id,
              node: (
                <Link to="/contacts/$id" params={{ id: contact.id }} className={LINK_CLASS}>
                  {contact.name}
                </Link>
              ),
            })),
          )}
        </span>
      ) : null}
      {synthesis.messages.length > 0 ? (
        <span className="block text-[var(--bellum-text-muted)]">
          {t('lauraJob.synthesis.messages', { count: synthesis.messages.length })}{' '}
          {links(
            synthesis.messages.map(message => ({
              key: message.id,
              // Les brouillons se relisent dans le centre d'approbation : rien n'est envoyé.
              node: (
                <Link to="/actions/sequences" className={LINK_CLASS}>
                  {message.label}
                </Link>
              ),
            })),
          )}
        </span>
      ) : null}
      {produced ? null : (
        <span className="block text-[var(--bellum-text-muted)]">{t('lauraJob.synthesis.nothing')}</span>
      )}
      {synthesis.failed.length > 0 ? (
        <span className="block text-[var(--bellum-text-muted)]">
          {t('lauraJob.synthesis.failed', { items: synthesis.failed.map(step => step.label).join(' · ') })}
        </span>
      ) : null}
      {synthesis.unknown.length > 0 ? (
        <span className="block text-[var(--bellum-text-muted)]">
          {t('lauraJob.synthesis.unknown', { items: synthesis.unknown.map(step => step.label).join(' · ') })}
        </span>
      ) : null}
      {synthesis.errors.length > 0 ? (
        <span className="block text-[var(--bellum-text-muted)]">
          {t('lauraJob.errors', { items: synthesis.errors.join(' · ') })}
        </span>
      ) : null}
    </li>
  )
}
