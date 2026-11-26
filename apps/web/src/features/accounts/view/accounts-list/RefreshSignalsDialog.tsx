import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DEEPEN_MAX_ACCOUNTS, summarizeDeepenRun, type DeepenQuote, type DeepenRunOutcome } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { ActionPreview } from '@/components/ActionPreview'
import { SoftBrake } from '@/features/credits/components/SoftBrake'

/* ------------------------------------------------------------------------ */
/*  #2293.2 — « actualiser les signaux de tout un portefeuille », l'un des    */
/*  trois cas d'usage restants de l'épopée #2809 (Découvrir, multi-comptes). */
/*                                                                            */
/*  Tranché sans Louis (écrivain de nuit, 26/09/2026) — AUCUN moteur neuf :   */
/*  le devis multi-comptes (`POST /analysis/deepen/quote`) et l'exécution    */
/*  axe par axe (`POST /analysis/:id/refresh`, `useRefreshDimension`) sont   */
/*  déjà le moteur qui sert « Approfondir cette réponse » depuis /chat       */
/*  (#2452). Un second moteur ici aurait dupliqué le débit APRÈS succès, le  */
/*  refus « axe déjà frais » (409) et le refus démo (`demoGuard`, dossiers   */
/*  figés) que ce moteur porte déjà — GA-26. Ce fichier n'ajoute que la      */
/*  SURFACE : un bouton dans la sélection de `/accounts`, sur l'axe Signaux. */
/*                                                                            */
/*  `DEEPEN_MAX_ACCOUNTS * 4` est la même borne que `deepenQuoteRequestSchema`*/
/*  (20 cibles) — jamais un second plafond inventé ici : au-delà, seuls les  */
/*  premiers comptes sélectionnés sont actualisés, et l'écran le NOMME.      */
/* ------------------------------------------------------------------------ */

const REFRESH_PORTFOLIO_MAX = DEEPEN_MAX_ACCOUNTS * 4

type Phase = { kind: 'quoting' } | { kind: 'error' } | { kind: 'quoted'; quote: DeepenQuote }

interface RefreshSignalsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: { id: string; company_name: string }[]
  /** Appelé une fois le lot terminé — le caller vide sa sélection. */
  onDone: () => void
}

export function RefreshSignalsDialog({ open, onOpenChange, accounts, onDone }: RefreshSignalsDialogProps) {
  const { t } = useTranslation('accounts')
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ kind: 'quoting' })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [pending, setPending] = useState(false)

  const targeted = accounts.slice(0, REFRESH_PORTFOLIO_MAX)
  const capped = accounts.length > targeted.length

  useEffect(() => {
    if (!open) return
    setProgress(null)
    setPhase({ kind: 'quoting' })
    accountsApi
      .deepenQuote(targeted.map(account => ({ accountId: account.id, dimension: 'signals' as const })))
      .then(quote => setPhase({ kind: 'quoted', quote }))
      .catch(() => setPhase({ kind: 'error' }))
    // `targeted` dérive de `accounts` + la constante ci-dessus — jamais de
    // référence instable qui relancerait le devis à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accounts])

  const launch = async (quote: DeepenQuote) => {
    if (pending) return
    setPending(true)
    const toRun = quote.lines.filter(line => line.status === 'run')
    setProgress({ done: 0, total: toRun.length })
    const done: DeepenRunOutcome[] = []
    for (const line of toRun) {
      try {
        const result = await accountsApi.refreshDimension(line.accountId, 'signals')
        done.push({ dimension: 'signals', cost: line.cost, diff: result.diff ?? null })
      } catch {
        // #2293.7 — une entreprise en échec ne bloque pas les autres, et le
        // moteur ne débite qu'après succès : une ligne échouée ne coûte rien.
        done.push({ dimension: 'signals', cost: 0, diff: null, failed: true })
      }
      setProgress({ done: done.length, total: toRun.length })
    }
    setProgress(null)
    qc.invalidateQueries({ queryKey: accountKeys.all })
    qc.invalidateQueries({ queryKey: ['credits'] })
    const summary = summarizeDeepenRun(done)
    const succeeded = toRun.length - summary.failed.length
    if (summary.failed.length > 0 && succeeded > 0) {
      toast.warning(t('refreshSignalsDialog.partialSuccess', { done: succeeded, failed: summary.failed.length }))
    } else if (summary.failed.length > 0) {
      toast.error(t('refreshSignalsDialog.allFailed', { count: summary.failed.length }))
    } else if (toRun.length > 0) {
      toast.success(t('refreshSignalsDialog.success', { count: toRun.length }))
    }
    setPending(false)
    onDone()
    onOpenChange(false)
  }

  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('refreshSignalsDialog.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('refreshSignalsDialog.title')}</DialogTitle>
          <DialogDescription>{t('refreshSignalsDialog.description', { count: targeted.length })}</DialogDescription>
        </DialogHeader>

        {capped ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('refreshSignalsDialog.capped', { max: REFRESH_PORTFOLIO_MAX })}
          </Text>
        ) : null}

        {phase.kind === 'quoting' ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('refreshSignalsDialog.quoting')}
          </Text>
        ) : null}

        {phase.kind === 'error' ? (
          <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
            {t('refreshSignalsDialog.error')}
          </Text>
        ) : null}

        {phase.kind === 'quoted' ? <QuotedBody phase={phase} t={t} /> : null}

        {progress ? (
          <Text size="sm" role="status">
            {t('refreshSignalsDialog.running', { done: progress.done, total: progress.total })}
          </Text>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={close}>
            {t('refreshSignalsDialog.cancel')}
          </Button>
          {phase.kind === 'quoted' ? (
            <Button
              disabled={
                pending ||
                (phase.quote.delta > 0 && !phase.quote.sufficient) ||
                !phase.quote.lines.some(line => line.status === 'run')
              }
              onClick={() => void launch(phase.quote)}
            >
              {t('refreshSignalsDialog.submit')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuotedBody({
  phase,
  t,
}: {
  phase: { kind: 'quoted'; quote: DeepenQuote }
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const { quote } = phase
  const alreadyFresh = quote.lines.filter(line => line.status === 'reuse' || line.status === 'same_phase').length
  const toRun = quote.lines.filter(line => line.status === 'run').length
  const noDossier = quote.lines.filter(line => line.status === 'no_dossier').length
  const insufficient = quote.delta > 0 && !quote.sufficient

  return (
    <>
      <ActionPreview
        title={t('refreshSignalsDialog.previewTitle')}
        rows={[
          // #2293.2 — « on n'affiche pas ce qu'on n'a pas » : un compte déjà à
          // jour ou sans dossier ne fait une ligne QUE quand il y en a au
          // moins un (GA-18/19, jamais « 0 compte à jour »).
          ...(alreadyFresh > 0
            ? [
                {
                  label: t('refreshSignalsDialog.alreadyFreshLabel'),
                  value: t('refreshSignalsDialog.alreadyFresh', { count: alreadyFresh }),
                },
              ]
            : []),
          ...(toRun > 0
            ? [
                {
                  label: t('refreshSignalsDialog.toRunLabel'),
                  value: t('refreshSignalsDialog.toRun', { count: toRun }),
                },
              ]
            : []),
          ...(noDossier > 0
            ? [
                {
                  label: t('refreshSignalsDialog.noDossierLabel'),
                  value: t('refreshSignalsDialog.noDossier', { count: noDossier }),
                },
              ]
            : []),
        ]}
      />
      {insufficient ? <SoftBrake /> : null}
    </>
  )
}
