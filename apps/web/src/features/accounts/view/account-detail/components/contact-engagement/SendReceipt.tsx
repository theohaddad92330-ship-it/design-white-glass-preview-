import type { Contact } from '@bellum/contracts'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Non exporté : consommé seulement ici — cf. `pnpm lint:exports:types`. */
type SendReceiptChannel = 'email' | 'linkedin'
/** `verified` — Bellum a réellement expédié (le webhook fournisseur peut
 *  encore le contredire plus tard, #2733, mais l'envoi lui-même a eu lieu).
 *  `declared` — le commercial affirme avoir envoyé lui-même ; Bellum n'a
 *  aucun moyen de le vérifier (c73_fait_ne_porte_pas_preuve_denvoi).
 *  `handed_off` / `sent_mailbox` — #3699.5, les deux natures d'un e-mail
 *  individuel : « pris en charge » par le service d'envoi de l'espace, ou
 *  « envoyé » depuis la boîte connectée du commercial. Aucune des deux ne dit
 *  « livré » ni « lu » : seul un rebond connu s'ajoute, à part. */
type SendReceiptNature = 'verified' | 'declared' | 'handed_off' | 'sent_mailbox'

type SendReceiptProps = {
  contact: Contact
  channel: SendReceiptChannel
  /** ISO timestamp de l'envoi ou de la déclaration. */
  sentAt: string
}

function formatReceiptDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * #2714 — LE COMPTE RENDU, du bon côté du geste.
 *
 * « Quand on envoie un mail, manque d'un compte rendu après avoir envoyé un
 * email / contacter. » — SKAIZen Group, call du 22/09/2026. Le récapitulatif
 * existait déjà AVANT l'envoi (le dialog de confirmation dans
 * `EngagementSendEmailAction`) ; APRÈS, un toast qui disparaît et une simple
 * date étaient tout ce qui restait — exactement le trou décrit par le client.
 *
 * Nomme le destinataire, le canal et l'horodatage — et surtout la NATURE de
 * ce qui est affirmé (`c73_fait_ne_porte_pas_preuve_denvoi`) : un envoi
 * e-mail est VÉRIFIÉ (Bellum l'a réellement expédié via Resend) ; une
 * déclaration LinkedIn est ce que le commercial affirme lui-même, jamais une
 * preuve de livraison — les deux badges ne se ressemblent jamais.
 *
 * `channel: 'email' | 'linkedin'` — un seul composant, réutilisé aux deux
 * points d'envoi (`EngagementSendEmailAction`, `LinkedinSentDeclaration`)
 * plutôt qu'un récapitulatif par canal (GA-26 : un réglage/une forme, pas
 * treize variantes).
 */
export function SendReceipt({ contact, channel, sentAt, nature }: SendReceiptProps & { nature: SendReceiptNature }) {
  const { t, i18n } = useTranslation('engagement')
  const target = channel === 'email' ? contact.email : contact.linkedin_url

  return (
    <div className="w-full space-y-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-2.5 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-[var(--success-soft-text)]">
        <Check className="size-3.5 shrink-0" aria-hidden />
        {t(`message.receipt.nature.${nature}`)}
      </div>
      <ReceiptRow
        label={t('message.receipt.to')}
        value={target ? `${contact.full_name} · ${target}` : contact.full_name}
      />
      <ReceiptRow label={t('message.receipt.channel')} value={t(`message.receipt.channelLabel.${channel}`)} />
      <ReceiptRow label={t('message.receipt.sentAt')} value={formatReceiptDate(sentAt, i18n.language)} />
    </div>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[var(--bellum-text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-[var(--bellum-text-primary)]">{value}</span>
    </div>
  )
}
