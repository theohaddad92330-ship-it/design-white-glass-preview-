import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import {
  Compass,
  ListPlus,
  MessageSquareText,
  Search,
  ShieldQuestion,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { ReplyActionKind } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { targetListsApi } from '@/features/target-lists/api'
import { REFINABLE_CRITERIA, replyActionPlan, replyActionTarget, type ReplyActionTarget } from './reply-actions'

/**
 * #3766 (BEL-LAU-1011) — LES ACTIONS DE LAURA : UN GESTE PRINCIPAL, DES SECONDAIRES, RIEN DE DÉCORATIF.
 *
 * Sous une réponse riche : un seul bouton plein (la recommandation de la
 * réponse), les autres en contour, « Ignorer » en dernier. Chaque geste emporte
 * le contexte de CETTE réponse — le compte cité, les critères Découvrir déjà
 * composés — et n'est offert que si son objet existe (`chat-reply-actions.ts`
 * du contrat) : jamais une vue vide, jamais un geste sans objet.
 *
 * « Ouvrir dans Découvrir » reste sur la carte de proposition (`PendingActions`,
 * qui emporte critères et fil d'origine) et « Sauvegarder » dans le pied de
 * réponse : les rendre ici les afficherait deux fois (GA-26).
 *
 * Laura n'envoie rien : « Préparer l'approche » ouvre le plan du compte, où
 * le commercial relit et envoie lui-même ; la liste de travail se crée au clic
 * (`targetListsApi`, source `laura`), jamais avant.
 *
 * Référence visuelle : `DeepenActions.tsx` (même rangée, mêmes tokens, même
 * plancher tactile) — c'est l'écran voisin de la même nature, juste dessous.
 */
const ICONS: Record<ReplyActionKind, LucideIcon> = {
  view_account: UserRound,
  find_contacts: Users,
  prepare_approach: MessageSquareText,
  refine_search: Search,
  create_worklist: ListPlus,
  qualify_further: ShieldQuestion,
  dismiss: X,
}

export function ReplyActions({
  content,
  discoverCriteria,
  notConsulted,
  onPrefill,
  onQualify,
}: {
  content: string
  discoverCriteria: Readonly<Record<string, string>> | null
  notConsulted: readonly string[] | undefined
  /** Pose un texte dans le composeur, sans l'envoyer (l'utilisateur le complète). */
  onPrefill: (text: string) => void
  /** Ouvre le panneau « Aller plus loin » (`DeepenActions`) de cette réponse. */
  onQualify: () => void
}) {
  const { t, i18n } = useTranslation('chat')
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const resolved = replyActionPlan(content, discoverCriteria, notConsulted)
  if (!resolved || dismissed) return null
  const { plan, input } = resolved

  const run = async (target: ReplyActionTarget) => {
    switch (target.kind) {
      case 'navigate-account':
        await navigate({
          to: '/accounts/$id',
          params: { id: target.accountId },
          search: target.tab ? { tab: target.tab } : {},
        })
        return
      case 'create-worklist': {
        setBusy(true)
        setFailed(false)
        try {
          const list = await targetListsApi.create({
            name: t('replyActions.worklistName', {
              date: new Date().toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB'),
            }),
            source: 'laura',
          })
          for (const accountId of target.accountIds) {
            await targetListsApi.addItem(list.id, { kind: 'account', ref_id: accountId, provenance: 'laura' })
          }
          await navigate({ to: '/accounts', search: { lens: 'lists' } })
        } catch {
          setFailed(true)
        } finally {
          setBusy(false)
        }
        return
      }
      case 'prefill': {
        const spoken = REFINABLE_CRITERIA.filter(key => target.criteria[key]).map(
          key => `${t(`replyActions.criteria.${key}`)} : ${target.criteria[key]}`,
        )
        onPrefill(t('replyActions.refinePrompt', { criteria: spoken.join(' ; ') }))
        return
      }
      case 'qualify':
        onQualify()
        return
      case 'dismiss':
        setDismissed(true)
    }
  }

  const render = (kind: ReplyActionKind, primary: boolean) => {
    const target = replyActionTarget(kind, input, discoverCriteria)
    if (!target) return null
    const Icon = ICONS[kind]
    return (
      <Button
        key={kind}
        type="button"
        size="sm"
        variant={primary ? 'default' : kind === 'dismiss' ? 'ghost' : 'outline'}
        icon={Icon}
        disabled={busy}
        data-primary={primary ? 'true' : undefined}
        onClick={() => void run(target)}
      >
        {t(`replyActions.kind.${kind}`)}
      </Button>
    )
  }

  return (
    <div data-testid="reply-actions" className="mt-2 space-y-1">
      <div role="group" aria-label={t('replyActions.label')} className="flex flex-wrap items-center gap-1.5">
        {render(plan.primary, true)}
        {plan.secondary.map(kind => render(kind, false))}
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-[var(--bellum-text-secondary)]">
          {t('replyActions.worklistFailed')}
        </p>
      ) : null}
    </div>
  )
}
