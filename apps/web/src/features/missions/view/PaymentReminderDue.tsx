import {
  isDisputeOpen,
  isInvoicedState,
  isSettled,
  reminderDue,
  toneForReminder,
  type InvoiceReadiness,
  type ReminderTone,
} from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '../../../components/primitives/UnknownValue'

/**
 * LA RELANCE D'ENCAISSEMENT DUE SUR UN MOIS — item #87.
 *
 * Le calcul existait, testé, depuis le PDF 5 : `reminderDue` disait qu'une
 * relance était due, `toneForReminder` disait sur quel ton, et **aucun écran ne
 * les appelait**. La route `GET /delivery/invoice-readiness/reminders` n'avait
 * elle-même aucun appelant côté web. C'est la famille de défauts que ce dépôt
 * connaît par cœur : du code juste, calculé, que personne ne lit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT NE DIT PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * **Aucun canal.** `resolveChannel` sait dire « Créer les brouillons » /
 * « Préparer les messages » / « Créer les tâches », et chacun de ces libellés
 * est une PROMESSE différente. Pour la tenir, il faut savoir ce qui est
 * réellement branché — or aucune capacité (`mailboxDraft`, `teamChat`,
 * `crmTask`) n'atteint cet écran. Lui inventer un jeu de capacités produirait
 * soit l'annonce d'un brouillon qui n'existe pas, soit l'affirmation qu'aucun
 * canal n'est connecté ; les deux sont des mensonges, et le second est celui
 * que le §5.3 du PDF 6 interdit nommément. Tant que la capacité ne voyage pas
 * jusqu'ici, l'écran dit la seule chose vraie : **rien ne part tout seul**, la
 * relance se consigne une fois envoyée.
 *
 * **Aucune escalade adressée.** La source (PDF 6 §6.4) veut, au troisième rang,
 * une relance « + chargé d'affaires et sponsor ». Le mot « sponsor » n'existe
 * sur aucun objet de facturation du produit, et rien sur cette ligne ne porte
 * de chargé d'affaires. Plutôt que de laisser le ton « escalade » faire croire
 * que quelqu'un d'autre sera mis en copie, le troisième rang NOMME ce qui lui
 * manque. Un ton qui promet un destinataire absent est pire qu'un ton neutre.
 *
 * **Rien sans échéance.** Une facture émise, impayée, dont personne n'a saisi
 * l'échéance ne produit AUCUNE relance — on ne devine pas une date. L'écran le
 * DIT au lieu de se taire : un silence se lit « rien à faire », alors que le
 * geste existe et tient en une saisie.
 */
export function PaymentReminderDue({ item, now = new Date() }: { item: InvoiceReadiness; now?: Date }) {
  const { t, i18n } = useTranslation('missions')

  // ─────────────────────────────────────────────────────────────────────────
  // LE LITIGE PASSE AVANT TOUT LE RESTE
  // ─────────────────────────────────────────────────────────────────────────
  // Il est TESTÉ ici plutôt que laissé au seul `reminderDue` parce que les deux
  // réponses diffèrent : le calcul rend `null`, et `null` disparaît de l'écran.
  // Or disparaître se lit « il n'y a rien à faire », alors que ce qui s'est
  // passé est que la cadence a été SUSPENDUE. Ce qui sort d'un indicateur se
  // nomme à côté de l'indicateur — c'est la même règle que l'exclusion du
  // litige hors du délai de paiement moyen (BEL-MIS-011).
  //
  // ⚠️ Et il passe AVANT l'échéance manquante, qui est vraie en même temps :
  // des deux phrases, une seule est actionnable. Tant que le litige court,
  // saisir l'échéance ne démarrerait aucune cadence — envoyer quelqu'un
  // remplir un champ sans effet est pire qu'un silence.
  //
  // La porte, elle, est déjà là : « Lever le litige » vit sur la même ligne,
  // dans `InvoiceReadinessPanel`. La redoubler ici afficherait deux fois le
  // même geste sur le même objet.
  // #2419.4 — un paiement partiel ne sort pas de la file : `isSettled` et non
  // `paidAt`, sinon une facture réglée à moitié ET contestée perdait la phrase
  // qui explique pourquoi plus aucune relance n'apparaît.
  if (isInvoicedState(item.state) && !isSettled(item) && isDisputeOpen(item)) {
    return (
      <Box className="mt-2 rounded-md border border-border bg-muted/30 p-2">
        <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
          {t('invoiceReadiness.reminders.suspendedByDispute')}
        </Text>
      </Box>
    )
  }

  // Une facture partie, impayée, sans échéance : la cadence ne peut pas
  // démarrer. Le dire vaut mieux que de ne rien afficher — c'est réparable.
  if (isInvoicedState(item.state) && !isSettled(item) && !item.dueOn) {
    return (
      <Box className="mt-2">
        <UnknownValue reason={t('invoiceReadiness.reminders.noDueDate')} />
      </Box>
    )
  }

  const due = reminderDue(
    {
      state: item.state,
      dueOn: item.dueOn,
      paidAt: item.paidAt,
      // #2419.4 — un paiement partiel ne sort pas de la file : même raison que
      // le litige juste en dessous, un cran plus tard. Une date de règlement
      // seule éteignait la cadence d'une facture réglée à moitié.
      paidAmountCents: item.paidAmountCents,
      invoicedAmountCents: item.invoicedAmountCents,
      remindersSent: item.remindersSent,
      // ⚠️ Ces deux-là manquaient, et c'est tout le défaut : le calcul REFUSE
      // de relancer une facture contestée, mais il ne pouvait pas le savoir.
      // Ils sont obligatoires dans le contrat depuis, pour que l'oubli ne soit
      // plus possible plutôt que seulement déconseillé.
      disputedAt: item.disputedAt,
      disputeResolvedAt: item.disputeResolvedAt,
    },
    now,
  )
  if (!due) return null

  const tone = toneForReminder(due.index)
  if (!tone) return null

  return (
    <Box className="mt-2 rounded-md border border-border bg-muted/30 p-2">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Badge variant={TONE_VARIANT[tone]}>{t(`invoiceReadiness.reminders.tones.${tone}`)}</Badge>
        <Text element="span" size="xs" weight="medium">
          {t('invoiceReadiness.reminders.rank', { index: due.index })}
        </Text>
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('invoiceReadiness.reminders.dueSince', { date: formatDay(due.dueSince, i18n.language) })}
          {' · '}
          {t('invoiceReadiness.reminders.overdue', { count: due.overdueDays })}
        </Text>
      </Box>

      {tone === 'escalate' ? (
        <Text element="p" size="xs" color="text-[var(--warning-soft-text)]" className="mt-1">
          {t('invoiceReadiness.reminders.escalationGap')}
        </Text>
      ) : null}

      <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
        {t('invoiceReadiness.reminders.nothingIsSent')}
      </Text>
    </Box>
  )
}

/**
 * Le ton porte sa couleur, et elles montent avec lui. Toutes passent par les
 * variantes du badge : une classe de palette Tailwind ne suivrait pas le thème.
 */
const TONE_VARIANT: Readonly<Record<ReminderTone, 'info' | 'warning' | 'danger'>> = {
  neutral: 'info',
  firm: 'warning',
  escalate: 'danger',
}

/**
 * `YYYY-MM-DD` → date locale.
 *
 * Midi et non minuit : `new Date('2026-10-05')` est lu en UTC, et affiché dans
 * un fuseau en retard il rend le 4 octobre. Une relance datée de la veille fait
 * douter du calcul entier.
 */
function formatDay(day: string, locale: string): string {
  const date = new Date(`${day}T12:00:00`)
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(locale)
}
