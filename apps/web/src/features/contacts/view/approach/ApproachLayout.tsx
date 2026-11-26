import type { Contact } from '@bellum/contracts'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SelectField,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Eye, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { contactPhotoSrc } from '@/lib/company-logo'
import { APPROACH_MORE_CHANNELS, type ApproachChannel } from './approach-model'
import { ApproachChannelNav } from './ApproachChannelNav'

/** Les classes de la maquette de Théo (C6/C7), partagées par les deux pages d'approche. */
export const APPROACH_CARD = 'rounded-card border border-[var(--bellum-border)] bg-card'
export const APPROACH_LABEL = 'text-sm font-medium text-[var(--bellum-text-secondary)]'
export const APPROACH_FIELD =
  'min-h-11 w-full min-w-0 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-sm text-[var(--bellum-text-primary)]'

/** `.page-actions` — « Retour au contact », à droite du titre (en-tête de la coque). */
export function ApproachBackAction({ contactId }: { contactId: string }) {
  const { t } = useTranslation('engagement')
  return (
    <Button asChild variant="outline" className="min-h-11">
      <Link to="/contacts/$id" params={{ id: contactId }}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden />
        {t('approachPage.back')}
      </Link>
    </Button>
  )
}

/**
 * `.field-grid` de Théo : « Ce que tu veux obtenir » (liste) | « Canal de préparation » (segments) + « … » (autres
 * canaux). Le menu « … » ne porte que des objectifs que le moteur sait rédiger : SMS, WhatsApp et vocal restent retirés.
 */
export function ApproachTopRow({
  contactId,
  channel,
  objective,
  objectiveOptions,
  placeholder,
  onObjective,
}: {
  contactId: string
  channel: ApproachChannel
  objective: string
  objectiveOptions: { value: string; label: string }[]
  placeholder: string
  onObjective: (code: string) => void
}) {
  const { t } = useTranslation('engagement')
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="approach-top-row">
      <div className="min-w-0 space-y-2">
        <label htmlFor="approach-objective" className={APPROACH_LABEL}>
          {t('approachPage.goal.title')}
        </label>
        <SelectField
          id="approach-objective"
          ariaLabel={t('approachPage.goal.title')}
          value={objective}
          onChange={onObjective}
          placeholder={placeholder}
          options={objectiveOptions}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <span className={APPROACH_LABEL}>{t('approachPage.channel.title')}</span>
        <div className="flex items-center gap-2">
          <ApproachChannelNav contactId={contactId} active={channel} />
          <ApproachMoreChannels contactId={contactId} channel={channel} onObjective={onObjective} />
        </div>
      </div>
    </div>
  )
}

function ApproachMoreChannels({
  contactId,
  channel,
  onObjective,
}: {
  contactId: string
  channel: ApproachChannel
  onObjective: (code: string) => void
}) {
  const { t } = useTranslation('engagement')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="size-11 shrink-0 p-0"
          aria-label={t('approachPage.more.label')}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>{t('approachPage.more.caption')}</DropdownMenuLabel>
        {APPROACH_MORE_CHANNELS.map(item =>
          item.channel === channel ? (
            <DropdownMenuItem key={item.id} className="min-h-11" onSelect={() => onObjective(item.code)}>
              {t(`approachPage.more.${item.id}`)}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={item.id} asChild className="min-h-11">
              <Link to="/contacts/$id/approach/$channel" params={{ id: contactId, channel: item.channel }}>
                {t(`approachPage.more.${item.id}`)}
              </Link>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** `aside .card` « Le contexte à garder » : la personne, son compte, l'objectif, le sujet, l'élément cité et sa preuve. */
export function ApproachContextCard({
  contact,
  account,
  objective,
  subject,
  element,
  freeAngle = false,
  onProof,
}: {
  contact: Contact
  /** #4524.4 — le compte (nom du compte, pas l'entité du poste) ; `null` = contact sans compte, aucune ligne. */
  account: string | null
  objective: string | null
  subject: string | null
  /** #4524.3 — LE fait utilisé : son libellé et sa preuve. */
  element: { label: string; proof: string | null } | null
  /** « Angle libre » : aucun fait du dossier n'est imposé. */
  freeAngle?: boolean
  onProof: () => void
}) {
  const { t } = useTranslation('engagement')
  const initials = contact.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <section className={APPROACH_CARD} aria-labelledby="approach-context">
      <div className="px-5 pt-5">
        <h2 id="approach-context" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
          {t('approachPage.context.title')}
        </h2>
      </div>
      <div className="space-y-4 p-5">
        <Link to="/contacts/$id" params={{ id: contact.id }} className="flex min-h-11 items-center gap-3">
          {/* La photo d'un tiers passe par le relais de notre origine (`contactPhotoSrc`), jamais en direct. */}
          {contactPhotoSrc(contact.photo_url) ? (
            <img
              src={contactPhotoSrc(contact.photo_url) ?? undefined}
              alt=""
              className="size-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft-bg)] text-base font-semibold text-[var(--accent-soft-text)]"
            >
              {initials}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-base font-semibold text-[var(--bellum-text-primary)]">{contact.full_name}</span>
            {contact.title ? (
              <span className="mt-1 block text-sm text-[var(--bellum-text-secondary)]">{contact.title}</span>
            ) : null}
          </span>
        </Link>
        <dl className="divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
          {account ? (
            <ContextProperty label={t('approachPage.context.account')}>
              {contact.account_id ? (
                <Link
                  to="/accounts/$id"
                  params={{ id: contact.account_id }}
                  className="inline-flex min-h-11 items-center font-medium text-[var(--bellum-text-accent)] hover:underline"
                >
                  {account}
                </Link>
              ) : (
                account
              )}
            </ContextProperty>
          ) : null}
          <ContextProperty label={t('approachPage.context.goal')}>
            {objective ?? <Muted>{t('approachPage.context.notSet')}</Muted>}
          </ContextProperty>
          {subject ? <ContextProperty label={t('approachPage.context.subject')}>{subject}</ContextProperty> : null}
          <ContextProperty label={t('approachPage.context.element')}>
            {element ? (
              <>
                {element.label}
                {element.proof ? (
                  <span className="mt-0.5 block text-xs text-[var(--bellum-text-muted)]">{element.proof}</span>
                ) : null}
              </>
            ) : (
              <Muted>{freeAngle ? t('approachPage.context.freeAngle') : t('approachPage.context.none')}</Muted>
            )}
            <Button type="button" variant="ghost" size="sm" className="mt-1 min-h-11 px-2" onClick={onProof}>
              <Eye className="mr-1.5 size-4" aria-hidden />
              {t('approachPage.actions.proof')}
            </Button>
          </ContextProperty>
        </dl>
      </div>
    </section>
  )
}

function ContextProperty({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-sm text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-[var(--bellum-text-muted)]">{children}</span>
}

/** `aside .card` « Éviter le message passe-partout » — les deux règles, adaptées au canal. */
export function ApproachAvoidCard({ variant }: { variant: 'message' | 'call' }) {
  const { t } = useTranslation('engagement')
  return (
    <section className={APPROACH_CARD} aria-labelledby="approach-avoid">
      <div className="px-5 pt-5">
        <h2 id="approach-avoid" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
          {t('approachPage.avoid.title')}
        </h2>
      </div>
      <div className="space-y-3 p-5 text-sm text-[var(--bellum-text-secondary)]">
        <p>{t('approachPage.avoid.ruleOne')}</p>
        <p>{variant === 'call' ? t('approachPage.avoid.ruleTwoCall') : t('approachPage.avoid.ruleTwo')}</p>
      </div>
    </section>
  )
}

/** `aside .card` « Objections à anticiper » — celles du dossier du compte ; aucune, aucune carte. */
export function ApproachObjectionsCard({ objections }: { objections: { objection: string; response: string }[] }) {
  const { t } = useTranslation('engagement')
  if (objections.length === 0) return null
  return (
    <section className={APPROACH_CARD} aria-labelledby="approach-objections">
      <div className="px-5 pt-5">
        <h2 id="approach-objections" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
          {t('approachPage.avoid.objections')}
        </h2>
      </div>
      <ul className="space-y-3 p-5">
        {objections.map(item => (
          <li key={`${item.objection}-${item.response}`} className="text-sm text-[var(--bellum-text-secondary)]">
            <strong className="font-semibold text-[var(--bellum-text-primary)]">« {item.objection} »</strong>{' '}
            {item.response}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** `.t-banner` — bandeau d'une ligne (garde-fou, modèle approuvé). */
export function ApproachBanner({
  tone = 'neutral',
  title,
  children,
  action,
  icon,
}: {
  tone?: 'neutral' | 'danger' | 'warning'
  title: string
  children?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-[var(--danger-soft-bg)]'
      : tone === 'warning'
        ? 'bg-[var(--warning-soft-bg)]'
        : 'bg-[var(--bellum-surface-2)]'
  return (
    <div
      role={tone === 'neutral' ? undefined : 'alert'}
      className={`flex flex-wrap items-center gap-3 rounded-card border border-[var(--bellum-border)] px-4 py-3 ${toneClass}`}
    >
      {icon}
      <div className="min-w-0 grow">
        <p className="text-sm font-semibold text-[var(--bellum-text-primary)]">{title}</p>
        {children ? <p className="text-sm text-[var(--bellum-text-secondary)]">{children}</p> : null}
      </div>
      {action}
    </div>
  )
}
