import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleSlash, Clock3, Loader2, UserMinus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AccountFeedbackItem, AccountFeedbackVerdict, CreateAccountFeedback } from '@bellum/contracts'
import { accountKeys } from '@/features/accounts/api'
import { apiFetch } from '@/lib/api'

/**
 * « Ce contact n'est plus là / n'a rien à voir » — le geste de correction du
 * graphe d'organigramme, posé là où le commercial VOIT la personne.
 *
 * Rien de neuf côté serveur : c'est la surface de feedback dossier existante
 * (`POST /accounts/:id/feedback`, module `account-feedback`) avec la cible
 * `contact`, la seule que `OrgGraphVersionService.recordCorrection` sait
 * traduire en rejet. Le serveur fait déjà le reste — bump de `graphVersion`,
 * mémorisation du rejet pour les runs suivants, et élagage immédiat du graphe
 * stocké. On se contente donc d'invalider le dossier : la personne écartée
 * disparaît des quatre vues au rechargement, sans re-run ni crédit.
 *
 * `targetRef` = le NOM COMPLET tel qu'affiché. C'est la clé du rejet : l'API le
 * slugifie (`orgPersonIdFor`) exactement comme l'assembleur IA synthétise l'id
 * de la personne, ce qui permet au rejet de retrouver la même personne dans un
 * graphe réassemblé de zéro au run suivant.
 */
export function OrgContactDismiss({ accountId, fullName }: { accountId: string; fullName: string }) {
  const { t } = useTranslation('accountOrg')
  const qc = useQueryClient()

  const send = useMutation({
    mutationFn: (body: CreateAccountFeedback) =>
      apiFetch<{ item: AccountFeedbackItem }, CreateAccountFeedback>({
        path: `/accounts/${accountId}/feedback`,
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      toast.success(t('orgGraph.dismiss.saved', { name: fullName }))
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
    onError: () => {
      toast.error(t('orgGraph.dismiss.error'))
    },
  })

  const submit = (verdict: AccountFeedbackVerdict) => {
    if (send.isPending) return
    send.mutate({ target: 'contact', targetRef: fullName.slice(0, 300), verdict })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          data-testid="org-contact-dismiss"
          aria-label={t('orgGraph.dismiss.trigger', { name: fullName })}
          title={t('orgGraph.dismiss.trigger', { name: fullName })}
          disabled={send.isPending}
        >
          {send.isPending ? (
            <Loader2 className="size-3.5 animate-spin text-[var(--bellum-text-secondary)]" />
          ) : (
            <UserMinus className="size-3.5 text-[var(--bellum-text-secondary)]" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('orgGraph.dismiss.label')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => submit('obsolete')}>
          <Clock3 className="size-3.5" />
          {t('orgGraph.dismiss.gone')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => submit('inutile')}>
          <CircleSlash className="size-3.5" />
          {t('orgGraph.dismiss.irrelevant')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
