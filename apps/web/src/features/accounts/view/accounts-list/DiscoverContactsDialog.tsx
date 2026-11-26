import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ContactDiscoveryOutcome, ContactDiscoveryQuote } from '@bellum/contracts'
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
/*  #2809 (#2293.11, #2294.*) — DÉCOUVERTE FRAÎCHE de contacts sur une        */
/*  sélection de comptes : des personnes JAMAIS collectées, cherchées par     */
/*  critère (rôles). Distinct de `RefreshContactsDialog` (rejeu d'un axe sur  */
/*  un compte déjà analysé) : ici, aucune analyse préalable n'est requise —   */
/*  la recherche porte sur des personnes que le compte n'a encore jamais vu   */
/*  passer, scopée par le nom/domaine du compte (jamais un critère            */
/*  cross-comptes non ancré : chaque ligne du devis, puis chaque exécution,   */
/*  cible UN compte).                                                        */
/*                                                                            */
/*  Même grammaire que `RefreshContactsDialog`/`AnalyzeBatchDialog` : devis   */
/*  EXACT avant tout clic (coût ANNONCÉ, par compte), puis exécution          */
/*  compte par compte, débit par compte. Un fournisseur ne se nomme jamais    */
/*  à l'écran — sans clé configurée, chaque ligne rend `status: 'unconfigured'` */
/*  et l'écran le dit en termes génériques, jamais un nom de fournisseur.     */
/* ------------------------------------------------------------------------ */

type Phase = { kind: 'quoting' } | { kind: 'error' } | { kind: 'quoted'; quote: ContactDiscoveryQuote }

interface DiscoverContactsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: { id: string; company_name: string }[]
  /** Appelé une fois le lot terminé — le caller vide sa sélection. */
  onDone: () => void
}

export function DiscoverContactsDialog({ open, onOpenChange, accounts, onDone }: DiscoverContactsDialogProps) {
  const { t } = useTranslation('accounts')
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ kind: 'quoting' })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setProgress(null)
    setPhase({ kind: 'quoting' })
    accountsApi
      .discoverFreshContactsQuote(accounts.map(account => account.id))
      .then(quote => setPhase({ kind: 'quoted', quote }))
      .catch(() => setPhase({ kind: 'error' }))
  }, [open, accounts])

  const launch = async (quote: ContactDiscoveryQuote) => {
    if (pending) return
    setPending(true)
    setProgress({ done: 0, total: quote.lines.length })
    const outcomes: ContactDiscoveryOutcome[] = []
    let failed = 0
    for (const line of quote.lines) {
      try {
        outcomes.push(await accountsApi.discoverFreshContacts(line.accountId))
      } catch {
        // #2293.7 (même discipline que RefreshContactsDialog) — un compte en
        // échec ne bloque pas les autres.
        failed += 1
      }
      setProgress({ done: outcomes.length + failed, total: quote.lines.length })
    }
    setProgress(null)
    qc.invalidateQueries({ queryKey: accountKeys.all })
    qc.invalidateQueries({ queryKey: ['credits'] })

    const unconfigured = outcomes.length > 0 && outcomes.every(o => o.status === 'unconfigured')
    const created = outcomes.reduce((sum, o) => sum + o.created, 0)
    if (unconfigured) {
      toast.warning(t('discoverContactsDialog.unconfigured'))
    } else if (failed > 0 && outcomes.length > 0) {
      toast.warning(t('discoverContactsDialog.partialSuccess', { done: outcomes.length, failed }))
    } else if (failed > 0) {
      toast.error(t('discoverContactsDialog.allFailed', { count: failed }))
    } else if (created > 0) {
      toast.success(t('discoverContactsDialog.success', { count: created }))
    } else {
      toast(t('discoverContactsDialog.noneFound'))
    }
    setPending(false)
    onDone()
    onOpenChange(false)
  }

  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('discoverContactsDialog.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('discoverContactsDialog.title')}</DialogTitle>
          <DialogDescription>{t('discoverContactsDialog.description', { count: accounts.length })}</DialogDescription>
        </DialogHeader>

        {phase.kind === 'quoting' ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('discoverContactsDialog.quoting')}
          </Text>
        ) : null}

        {phase.kind === 'error' ? (
          <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
            {t('discoverContactsDialog.error')}
          </Text>
        ) : null}

        {phase.kind === 'quoted' ? <QuotedBody phase={phase} t={t} /> : null}

        {progress ? (
          <Text size="sm" role="status">
            {t('discoverContactsDialog.running', { done: progress.done, total: progress.total })}
          </Text>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={close}>
            {t('discoverContactsDialog.cancel')}
          </Button>
          {phase.kind === 'quoted' ? (
            <Button
              disabled={pending || (phase.quote.delta > 0 && !phase.quote.sufficient) || phase.quote.lines.length === 0}
              onClick={() => void launch(phase.quote)}
            >
              {t('discoverContactsDialog.submit')}
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
  phase: { kind: 'quoted'; quote: ContactDiscoveryQuote }
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const { quote } = phase
  const insufficient = quote.delta > 0 && !quote.sufficient

  return (
    <>
      <ActionPreview
        title={t('discoverContactsDialog.previewTitle')}
        rows={[
          {
            label: t('discoverContactsDialog.accountsLabel'),
            value: t('discoverContactsDialog.accountsCount', { count: quote.lines.length }),
          },
        ]}
      />
      {insufficient ? <SoftBrake /> : null}
    </>
  )
}
