import { useState } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { CircleSlash, Clock3, Flag, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AccountFeedbackItem, AccountFeedbackVerdict, CreateAccountFeedback } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Boucle de feedback dossier (A2) — pouce haut / pouce bas / signaler sur un
 * play du plan d'action. Chaque clic POSTe un retour structuré
 * (`POST /accounts/:id/feedback`) qui nourrit la mémoire du compte : les
 * directives condensées sont réinjectées aux runs suivants (refresh / re-run)
 * et au contexte du copilote.
 *
 * Composant volontairement AUTONOME (un gros chantier i18n touche apps/web en
 * parallèle) : nouveau fichier, appel API inline via `apiFetch`, clés i18n
 * nouvelles (`accounts:planFeedback.*`) — le seul point de contact avec
 * l'existant est son montage dans le slot `trailing` du plan.
 */
export function PlayFeedbackButtons({ accountId, targetRef }: { accountId: string; targetRef: string }) {
  const { t } = useTranslation('accounts')
  const [selected, setSelected] = useState<AccountFeedbackVerdict | null>(null)

  const send = useMutation({
    mutationFn: (body: CreateAccountFeedback) =>
      apiFetch<{ item: AccountFeedbackItem }, CreateAccountFeedback>({
        path: `/accounts/${accountId}/feedback`,
        method: 'POST',
        body,
      }),
    onSuccess: (_data, body) => {
      setSelected(body.verdict)
      toast.success(t('planFeedback.saved'))
    },
    onError: () => {
      toast.error(t('planFeedback.error'))
    },
  })

  const submit = (verdict: AccountFeedbackVerdict) => {
    if (send.isPending) return
    send.mutate({ target: 'play', targetRef: targetRef.slice(0, 300), verdict })
  }

  const iconClass = (active: boolean, activeClass: string) =>
    `size-3.5 ${active ? activeClass : 'text-[var(--bellum-text-secondary)]'}`

  return (
    <div className="flex items-center gap-0.5" data-testid="play-feedback" onClick={event => event.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t('planFeedback.useful')}
        title={t('planFeedback.useful')}
        aria-pressed={selected === 'utile'}
        disabled={send.isPending}
        onClick={() => submit('utile')}
      >
        <ThumbsUp className={iconClass(selected === 'utile', 'text-[var(--success-soft-text)]')} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t('planFeedback.notUseful')}
        title={t('planFeedback.notUseful')}
        aria-pressed={selected === 'inutile'}
        disabled={send.isPending}
        onClick={() => submit('inutile')}
      >
        <ThumbsDown className={iconClass(selected === 'inutile', 'text-[var(--danger-soft-text)]')} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('planFeedback.report')}
            title={t('planFeedback.report')}
            disabled={send.isPending}
          >
            <Flag
              className={iconClass(selected === 'faux' || selected === 'obsolete', 'text-[var(--warning-soft-text)]')}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
          <DropdownMenuLabel>{t('planFeedback.reportLabel')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => submit('faux')}>
            <CircleSlash className="size-3.5" />
            {t('planFeedback.wrong')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => submit('obsolete')}>
            <Clock3 className="size-3.5" />
            {t('planFeedback.outdated')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
