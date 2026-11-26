import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SoftBrake } from '@/features/credits/components/SoftBrake'
import {
  accountIdsInReply,
  deepenActionsFor,
  deepenLevel,
  deepenTargetsFor,
  summarizeDeepenRun,
  type DeepenActionId,
  type DeepenLevel,
  type DeepenQuote,
  type DeepenRunOutcome,
  type DeepenTarget,
  type RefreshDimension,
} from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { Button, cn } from '@bellum/ui'
import { ApiError } from '@/lib/api-error'

/**
 * #2452 (LAU-FINAL-165) — APPROFONDIR UNE RÉPONSE, PROGRESSIVEMENT.
 *
 * Sous une réponse de Laura qui cite des comptes : les sept actions de l'issue
 * (#2452.3), le devis AVANT tout lancement — ce qui est déjà payé et réutilisé,
 * et le coût SUPPLÉMENTAIRE seulement (#2452.5) —, l'exécution du seul delta
 * (#2452.4), le résumé de ce qui a changé (#2452.6) et l'étape atteinte du
 * même travail : rapide, vérifié, approfondi (#2452.7).
 *
 * Tranché sans Louis (decisions §12) — reco appliquée : AUCUN moteur neuf.
 * Chaque ligne « à relancer » part par `POST /analysis/:id/refresh`, le moteur
 * par axe qui réutilise les sorties stockées des autres phases, refuse un axe
 * frais (6 h) ou déjà verrouillé, et ne débite qu'après succès. Le devis vient
 * de `POST /analysis/deepen/quote`, avec la MÊME règle (`buildDeepenQuote`).
 *
 * Ni `useQuery` ni `useMutation` : rien ne part au rendu, tout part d'un clic —
 * et `Chat` se rend dans des tests sans `QueryClientProvider`.
 *
 * #2452.1 — ce n'est PAS le bouton « Approfondir une analyse » retiré de
 * /search le 17/09 (#2162.20) : ici, un panneau fermé par défaut sous la
 * réponse, qui n'ouvre qu'un devis.
 *
 * #5032.12 / .13 / .14 — le repli « Aller plus loin sur cette réponse » (et son bouton) est
 * RETIRÉ (revient sur #2452.1 / #2907 : « Aller plus loin » dans la bulle). Le panneau garde tout
 * son contenu, mais il s'ouvre depuis Ajuster › « Approfondir (avec devis) » du pied de réponse,
 * ou depuis le CTA « Lancer une qualification complémentaire » : UN chemin vers le moteur (GA-26).
 */
type Phase = { kind: 'idle' } | { kind: 'quoting' } | { kind: 'error' } | { kind: 'quoted'; quote: DeepenQuote }

const LEVELS: readonly DeepenLevel[] = ['quick', 'verified', 'deepened']

/** #5032.12 — les comptes que l'approfondissement viserait : ceux que la réponse cite, sinon celui du fil. */
export function deepenAccountIds(content: string, fallbackAccountId: string | null): string[] {
  const cited = accountIdsInReply(content)
  return cited.length ? cited : fallbackAccountId ? [fallbackAccountId] : []
}

export function DeepenActions({
  content,
  fallbackAccountId,
  since,
  open,
}: {
  content: string
  /** Le compte du fil (copilote de compte), quand la réponse n'en cite aucun. */
  fallbackAccountId: string | null
  /** Quand la réponse a été rendue — l'étape se lit sur ce qui a été rejoué APRÈS. */
  since: Date | undefined
  /** #5032.12 — le panneau est ouvert par le pied de réponse (Ajuster › Approfondir, ou le CTA de qualification). */
  open: boolean
}) {
  const { t } = useTranslation('chat')
  const accountIds = deepenAccountIds(content, fallbackAccountId)
  const actions = deepenActionsFor(accountIds.length)

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [targets, setTargets] = useState<DeepenTarget[]>([])
  const [level, setLevel] = useState<DeepenLevel | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [outcomes, setOutcomes] = useState<DeepenRunOutcome[] | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  // #2452.2 — un double clic ne lance jamais deux fois : le verrou est posé
  // AVANT le premier `await`, là où un état React arriverait trop tard.
  const running = useRef(false)

  const hasActions = actions.length > 0
  const accountKey = accountIds.join(',')

  useEffect(() => {
    // L'étape atteinte : un devis de lecture sur les comptes cités — rien n'est lancé.
    if (!open || !hasActions || level !== null || !since) return
    let cancelled = false
    accountsApi
      .deepenQuote(accountKey.split(',').map(accountId => ({ accountId, dimension: 'signals' as const })))
      .then(quote => {
        if (!cancelled) setLevel(deepenLevel(quote.accounts, since.toISOString()))
      })
      .catch(() => {
        // Sans devis, on n'affiche pas d'étape plutôt qu'une étape devinée.
      })
    return () => {
      cancelled = true
    }
  }, [open, hasActions, level, since, accountKey])

  if (!hasActions || !open) return null

  const readLevel = (quote: DeepenQuote) => {
    if (since) setLevel(deepenLevel(quote.accounts, since.toISOString()))
  }

  const pick = async (action: DeepenActionId) => {
    if (running.current) return
    const next = deepenTargetsFor(action, accountIds)
    setTargets(next)
    setOutcomes(null)
    setRunError(null)
    setPhase({ kind: 'quoting' })
    try {
      const quote = await accountsApi.deepenQuote(next)
      setPhase({ kind: 'quoted', quote })
      readLevel(quote)
    } catch {
      setPhase({ kind: 'error' })
    }
  }

  const launch = async (quote: DeepenQuote) => {
    if (running.current) return
    running.current = true
    // #2452.4 — seules les lignes « à relancer » partent ; le reste est réutilisé.
    const toRun = quote.lines.filter(line => line.status === 'run')
    setProgress({ done: 0, total: toRun.length })
    const done: DeepenRunOutcome[] = []
    let firstError: string | null = null
    for (const line of toRun) {
      try {
        const result = await accountsApi.refreshDimension(line.accountId, line.dimension)
        done.push({ dimension: line.dimension, cost: line.cost, diff: result.diff ?? null })
      } catch (error) {
        // Le moteur ne débite qu'après succès : une ligne échouée ne coûte rien.
        done.push({ dimension: line.dimension, cost: 0, diff: null, failed: true })
        if (error instanceof ApiError && firstError === null) firstError = error.message
      }
      setProgress({ done: done.length, total: toRun.length })
    }
    setOutcomes(done)
    setRunError(firstError)
    setProgress(null)
    try {
      const after = await accountsApi.deepenQuote(targets)
      setPhase({ kind: 'quoted', quote: after })
      readLevel(after)
    } catch {
      // Le résumé reste affiché ; seule l'étape n'est pas relue.
    }
    running.current = false
  }

  const dimensionLabel = (dimension: RefreshDimension) => t(`deepen.dimension.${dimension}`)
  const summary = outcomes ? summarizeDeepenRun(outcomes) : null

  return (
    <div data-testid="deepen-actions" className="mt-2">
      <div className="space-y-2 rounded-md border border-[var(--bellum-border)] p-3 text-xs">
        {level ? (
          // #2452.7 — les trois étapes d'UN même travail, reliées à cette réponse.
          <ol aria-label={t('deepen.steps.label')} className="flex flex-wrap items-center gap-2">
            {LEVELS.map((step, index) => (
              <li
                key={step}
                aria-current={step === level ? 'step' : undefined}
                className={cn(
                  'rounded-full px-2 py-0.5',
                  index <= LEVELS.indexOf(level)
                    ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
                    : 'text-[var(--bellum-text-muted)]',
                )}
              >
                {t(`deepen.steps.${step}`)}
              </li>
            ))}
          </ol>
        ) : null}
        <div role="group" aria-label={t('deepen.actionsLabel')} className="flex flex-wrap gap-1.5">
          {actions.map(action => (
            <button
              key={action}
              type="button"
              disabled={progress !== null}
              onClick={() => void pick(action)}
              className="min-h-11 rounded-full border border-[var(--bellum-border)] px-3 text-xs text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)] disabled:opacity-50"
            >
              {t(`deepen.actions.${action}`)}
            </button>
          ))}
        </div>
        {phase.kind === 'quoting' ? <p className="text-[var(--bellum-text-muted)]">{t('deepen.quoting')}</p> : null}
        {phase.kind === 'error' ? <p role="alert">{t('deepen.error')}</p> : null}
        {phase.kind === 'quoted' && !outcomes && !progress ? (
          <DeepenQuoteView
            quote={phase.quote}
            dimensionLabel={dimensionLabel}
            onLaunch={() => void launch(phase.quote)}
            onCancel={() => setPhase({ kind: 'idle' })}
          />
        ) : null}
        {progress ? <p role="status">{t('deepen.running', { done: progress.done, total: progress.total })}</p> : null}
        {summary ? (
          // #2452.6 — confirmé, changé, écarté, non mesuré, et le coût RÉELLEMENT débité.
          <div role="status" className="space-y-0.5">
            <p className="font-medium text-[var(--bellum-text-primary)]">{t('deepen.summary.title')}</p>
            {summary.confirmed.length ? (
              <p>{t('deepen.summary.confirmed', { list: summary.confirmed.map(dimensionLabel).join(', ') })}</p>
            ) : null}
            {summary.changed.length ? <p>{t('deepen.summary.changed', { list: summary.changed.join(', ') })}</p> : null}
            {summary.added.length ? <p>{t('deepen.summary.added', { list: summary.added.join(', ') })}</p> : null}
            {summary.dropped.length ? <p>{t('deepen.summary.dropped', { list: summary.dropped.join(', ') })}</p> : null}
            {summary.unmeasured.length ? (
              <p>{t('deepen.summary.unmeasured', { list: summary.unmeasured.map(dimensionLabel).join(', ') })}</p>
            ) : null}
            {summary.failed.length ? (
              <p>{t('deepen.summary.failed', { list: summary.failed.map(dimensionLabel).join(', ') })}</p>
            ) : null}
            {runError ? <p role="alert">{runError}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DeepenQuoteView({
  quote,
  dimensionLabel,
  onLaunch,
  onCancel,
}: {
  quote: DeepenQuote
  dimensionLabel: (dimension: RefreshDimension) => string
  onLaunch: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('chat')
  return (
    <div className="space-y-1">
      {/* #4463 — plus de montant : on dit seulement s'il y a quelque chose à relancer. */}
      <p className="font-medium text-[var(--bellum-text-primary)]">
        {quote.delta > 0 ? t('deepen.toRun') : t('deepen.nothingToRun')}
      </p>
      <ul className="space-y-0.5 text-[var(--bellum-text-secondary)]">
        {quote.lines.map(line => (
          <li key={`${line.accountId}:${line.dimension}`}>
            {t(`deepen.line.${line.status}`, { section: dimensionLabel(line.dimension), account: line.name })}
          </li>
        ))}
      </ul>
      {quote.delta > 0 && !quote.sufficient ? <SoftBrake /> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {quote.delta > 0 && quote.sufficient ? (
          <Button type="button" size="sm" onClick={onLaunch}>
            {t('deepen.launch')}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('deepen.cancel')}
        </Button>
      </div>
    </div>
  )
}
