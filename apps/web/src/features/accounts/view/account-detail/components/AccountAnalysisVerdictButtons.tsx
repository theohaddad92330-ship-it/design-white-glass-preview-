import { Button } from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { Check, CircleHelp, Minus, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AccountFeedbackItem, AccountFeedbackVerdict, CreateAccountFeedback } from '@bellum/contracts'
import { FIRST_PROOF_VERDICTS } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

// #2076.13 — la même liste que la recette produit lit (GA-26).
const ANALYSIS_VERDICTS = FIRST_PROOF_VERDICTS

// #3279 — un retour de justesse = une icône NOMMÉE (aria-label + infobulle), pas un bouton à texte.
const VERDICT_ICON: Record<string, LucideIcon> = { juste: Check, partiel: Minus, faux: X, manquant: CircleHelp }

/**
 * #2076.9-.12 — « Première preuve sur une situation connue » : le retour ne
 * demande pas une opinion générale sur le dossier, il demande un verdict de
 * JUSTESSE sur un compte que l'utilisateur connaît déjà — un axe différent de
 * « utile »/« inutile » (utilité) rendu par `PlayFeedbackButtons`.
 *
 * Tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md §1, reco
 * appliquée) : vocabulaire NEUF (`ACCOUNT_FEEDBACK_VERDICTS`, extension EN
 * FIN, GA-08), MÊME endpoint (`POST /accounts/:id/feedback`), MÊME service
 * (`AccountFeedbackService` — les directives de correction en profitent
 * aussi, gratuitement), `target: 'global'` (feedback sur le DOSSIER entier,
 * pas un play/contact/signal précis).
 *
 * #2076.13 (« double destination workspace + recette produit ») reste
 * RETENU — voir le registre : le seul mécanisme de mirroring existant
 * (`FeedbackService` / `beta_feedback`) crée une issue GitHub par écriture,
 * disproportionné pour un clic de verdict.
 */
export function AccountAnalysisVerdictButtons({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts')
  const [selected, setSelected] = useState<AccountFeedbackVerdict | null>(null)

  const send = useMutation({
    mutationFn: (verdict: AccountFeedbackVerdict) =>
      apiFetch<{ item: AccountFeedbackItem }, CreateAccountFeedback>({
        path: `/accounts/${accountId}/feedback`,
        method: 'POST',
        body: { target: 'global', targetRef: '', verdict },
      }),
    onSuccess: (_data, verdict) => {
      setSelected(verdict)
      toast.success(t('analysisVerdict.saved'))
    },
    onError: () => {
      toast.error(t('analysisVerdict.error'))
    },
  })

  const submit = (verdict: AccountFeedbackVerdict) => {
    if (send.isPending) return
    send.mutate(verdict)
  }

  return (
    <div
      role="group"
      aria-label={t('analysisVerdict.prompt')}
      title={t('analysisVerdict.prompt')}
      className="flex items-center gap-1"
      data-testid="account-analysis-verdict"
    >
      {ANALYSIS_VERDICTS.map(verdict => {
        const Icon = VERDICT_ICON[verdict] ?? CircleHelp
        return (
          <Button
            key={verdict}
            type="button"
            variant="outline"
            size="icon"
            className="size-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            aria-label={t(`analysisVerdict.${verdict}`)}
            title={t(`analysisVerdict.${verdict}`)}
            aria-pressed={selected === verdict}
            disabled={send.isPending}
            onClick={() => submit(verdict)}
          >
            <Icon className="size-4" aria-hidden />
          </Button>
        )
      })}
    </div>
  )
}
