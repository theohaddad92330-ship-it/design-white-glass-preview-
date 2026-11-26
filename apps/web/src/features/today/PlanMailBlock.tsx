import { Button, Text } from '@bellum/ui'
import { Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { hasPermissions, useUserPermissions } from '@/lib/permissions'
import { generatePlanMail } from './planMail'
import type { TodayItem } from './todayQueue'

type MailDraft = { subject: string | null; body: string }

/**
 * #4521.3 — « Générer le mail », carte par carte, DANS la rafale : jamais 88 générations d'un coup, un clic = un mail.
 * Le brouillon (objet + corps) vit dans la carte, modifiable sur place ; « Copier et ouvrir » et « Fait » restent les
 * gestes de la carte (c82 : Laura prépare, le commercial envoie ; « Fait » déclaratif, c73).
 *
 * Même droit que « Préparer » sur l'onglet Plan (`records:write`, GA-05) : sans lui — ou tant qu'il n'est pas lu —
 * le bouton n'est pas offert. Le serveur reste juge.
 */
export function PlanMailBlock({
  item,
  draft,
  onDraftChange,
}: {
  item: TodayItem
  draft: MailDraft | null
  onDraftChange: (draft: MailDraft | null) => void
}) {
  const { t } = useTranslation('actions')
  const access = useUserPermissions()
  const isDemo = useIsDemo()
  const subjectId = useId()
  const bodyId = useId()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  if (access.status !== 'known' || !hasPermissions(['records:write'], access.permissions)) return null

  // #4592 — en démonstration la rédaction est éteinte À DESSEIN (aucun appel de modèle dans une salle de démo) : le
  // bouton ne s'offre pas, l'écran dit pourquoi. Jamais un faux mail, jamais un échec générique à la place.
  if (isDemo && !draft) {
    return (
      <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
        {t('today.card.mail.demoUnavailable')}
      </Text>
    )
  }

  const generate = async () => {
    setPending(true)
    setFailed(false)
    try {
      onDraftChange(await generatePlanMail(item))
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  if (!draft) {
    return (
      <div className="mt-2 flex flex-col items-start gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={Sparkles}
          iconPosition="left"
          className="pointer-coarse:min-h-11"
          disabled={pending}
          onClick={() => void generate()}
        >
          {pending ? t('today.card.mail.generating') : t('today.card.mail.generate')}
        </Button>
        {failed ? (
          <Text size="xs" color="text-[var(--bellum-warning-text)]" role="alert">
            {t('today.card.mail.failed')}
          </Text>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-2">
      <Text size="xs" weight="semibold">
        {t('today.card.mail.title')}
      </Text>
      <div className="space-y-1">
        <label htmlFor={subjectId} className="text-xs text-[var(--bellum-text-muted)]">
          {t('today.card.mail.subject')}
        </label>
        <input
          id={subjectId}
          type="text"
          value={draft.subject ?? ''}
          onChange={event => onDraftChange({ ...draft, subject: event.target.value || null })}
          className="w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 py-1 text-sm pointer-coarse:min-h-11"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={bodyId} className="text-xs text-[var(--bellum-text-muted)]">
          {t('today.card.mail.body')}
        </label>
        <textarea
          id={bodyId}
          value={draft.body}
          rows={8}
          onChange={event => onDraftChange({ ...draft, body: event.target.value })}
          className="w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 py-1 text-sm"
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="pointer-coarse:min-h-11"
        disabled={pending}
        onClick={() => void generate()}
      >
        {t('today.card.mail.regenerate')}
      </Button>
    </div>
  )
}
