import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleDashed, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Button, Text, cn, semanticColors } from '@bellum/ui'
import { densityGap, densityPadding, useReplyDensity, type ReplyDensity } from './density'

/**
 * #3761 — LES PIÈCES QUI DISENT CE QUI MANQUE OU CE QUI SE VALIDE : bandeau de
 * prudence, état vide / partiel, bloc de validation d'action. (Le pied de sources
 * est absorbé par `ReplyBasis` + le pied de réponse — GA-26.)
 *
 * Doctrine tenue ici, pas chez l'appelant :
 *  - une réponse riche ne maquille jamais une absence : l'état partiel NOMME ce
 *    qui manque ;
 *  - Laura prépare, le commercial valide et envoie — le bloc d'action n'a pas de
 *    bouton « envoyer », seulement « valider la préparation » / « modifier » /
 *    « ignorer » ; « fait » ne porte jamais de preuve d'envoi.
 */

export function ReplyCautionBanner({ title, children }: { title?: string; children: ReactNode }) {
  const colors = semanticColors.warning
  return (
    <div
      role="note"
      data-reply-caution
      className={cn('flex gap-2 rounded-lg border p-3', colors.bgSubtle, colors.border)}
    >
      <TriangleAlert className={cn('mt-0.5 size-4 shrink-0', colors.icon)} aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title ? (
          <Text size="sm" weight="semibold" element="div" className={colors.text}>
            {title}
          </Text>
        ) : null}
        <Text size="sm" element="div" leading="relaxed" color="text-[var(--bellum-text-secondary)]">
          {children}
        </Text>
      </div>
    </div>
  )
}

type ReplyMissingItem = {
  what: string
  how?: string | null
  /**
   * #3761.16 — rendu entièrement composé par l'appelant (lien structuré, texte
   * markdown…), à la place du texte générique « comment la renseigner » + `how`.
   * Un appelant qui a besoin de plus qu'un texte brut (un lien, une raison en
   * plus) passe `detail` ; sans lui, `how` garde son rendu texte d'avant.
   */
  detail?: ReactNode
}

/** État vide ou partiel : ce qu'on a, ce qui manque (NOMMÉ), le geste qui le comble.
 *
 * #3761.16 — `title` est OPTIONNEL : composé dans une carte déjà titrée (ex.
 * `MissingDataCard`), ce panneau n'écrit pas un second titre identique
 * (GA-26, « rien n'apparaît deux fois sous la même forme »). Utilisé seul
 * (prochaine famille de réponse sans carte), il porte son propre titre.
 */
export function ReplyPartialState({
  title,
  missing,
  children,
  footer,
  density,
}: {
  title?: string
  missing: readonly ReplyMissingItem[]
  children?: ReactNode
  /** Ce qui reste possible malgré le manque — affiché APRÈS la liste. */
  footer?: ReactNode
  density?: ReplyDensity
}) {
  const { t } = useTranslation('chat')
  const d = useReplyDensity(density)
  const named = missing.filter(item => item.what.trim() !== '')
  return (
    <section
      data-reply-partial
      aria-label={title || undefined}
      className={cn(
        'rounded-lg border border-dashed border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]',
        densityPadding(d),
        densityGap(d),
      )}
    >
      {title ? (
        <div className="flex items-center gap-1.5">
          <CircleDashed className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {title}
          </Text>
        </div>
      ) : null}
      {children ? (
        <Text size="sm" element="div" color="text-[var(--bellum-text-secondary)]">
          {children}
        </Text>
      ) : null}
      {named.length > 0 ? (
        <ul className="space-y-1">
          {named.map((item, index) => (
            <li key={`missing-${index}`} className="text-sm text-[var(--bellum-text-secondary)]">
              <span className="font-medium text-[var(--bellum-text-primary)]">{item.what}</span>
              {item.detail ??
                (item.how ? (
                  <>
                    {' — '}
                    <span>
                      {t('replyKit.howToFill')} {item.how}
                    </span>
                  </>
                ) : null)}
            </li>
          ))}
        </ul>
      ) : null}
      {footer ? (
        <Text size="sm" element="div" color="text-[var(--bellum-text-secondary)]">
          {footer}
        </Text>
      ) : null}
    </section>
  )
}

/**
 * Bloc de validation d'action. L'état « validated » se lit « préparation validée »,
 * jamais « envoyé » (doctrine : « Fait » ne porte jamais de preuve d'envoi).
 */
export function ReplyActionBlock({
  title,
  description,
  state = 'pending',
  onValidate,
  onEdit,
  onDismiss,
  validateLabel,
  editLabel,
  dismissLabel,
  note,
  disabled = false,
  density,
  icon: Icon,
  chatKind,
  className,
  extraActions,
  children,
}: {
  title: string
  description?: string | null
  state?: 'pending' | 'validated' | 'dismissed'
  onValidate?: () => void
  onEdit?: () => void
  onDismiss?: () => void
  /**
   * #3761.16 — libellés propres à l'appelant (« Valider ces 3 changements »), quand le verbe générique
   * ne dit pas ce qui sera validé. Sans eux, les trois verbes du kit.
   */
  validateLabel?: string
  editLabel?: string
  dismissLabel?: string
  /** La mention sous les boutons : absente = « Laura prépare, c'est toi qui envoies » ; `null` = aucune. */
  note?: string | null
  disabled?: boolean
  density?: ReplyDensity
  /**
   * #4129.1 — l'icône du geste, devant le titre.
   */
  icon?: LucideIcon
  /** #4129.1 — la peau de l'appelant (une carte d'action du fil a son propre liseré) ; fusionnée au cadre du kit. */
  className?: string
  /** #4129.1 — la nature de surface du fil (`data-chat-kind`), posée par l'appelant qui la tient. */
  chatKind?: string
  /** #4129.1 — gestes propres à l'appelant (copier, assigner…), entre « valider » et « ignorer ». */
  extraActions?: ReactNode
  /** Ce qui va être validé (la liste des changements…) — entre la description et les boutons. */
  children?: ReactNode
}) {
  const { t } = useTranslation('chat')
  const d = useReplyDensity(density)
  const youSend = note === undefined ? t('replyKit.action.youSend') : note
  return (
    <section
      data-reply-action={state}
      data-chat-kind={chatKind}
      aria-label={title}
      className={cn(
        'rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]',
        densityPadding(d),
        densityGap(d),
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {Icon ? <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden /> : null}
        <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
      </div>
      {description ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {description}
        </Text>
      ) : null}
      {children}
      {state === 'pending' ? (
        <>
          {onValidate || onEdit || onDismiss || extraActions ? (
            <div data-reply-actions className="flex flex-wrap items-center gap-2">
              {onValidate ? (
                <Button type="button" size="sm" disabled={disabled} onClick={onValidate}>
                  {validateLabel ?? t('replyKit.action.validate')}
                </Button>
              ) : null}
              {onEdit ? (
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onEdit}>
                  {editLabel ?? t('replyKit.action.edit')}
                </Button>
              ) : null}
              {extraActions}
              {onDismiss ? (
                <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onDismiss}>
                  {dismissLabel ?? t('replyKit.action.dismiss')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {youSend ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {youSend}
            </Text>
          ) : null}
        </>
      ) : (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {state === 'validated' ? t('replyKit.action.validated') : t('replyKit.action.dismissed')}
        </Text>
      )}
    </section>
  )
}
