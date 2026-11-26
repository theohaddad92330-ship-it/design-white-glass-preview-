import type { AgendaEvent } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { guestWarningMailto, validatedSingleEmail } from '../guest-list'

/**
 * #2938 (#2102.12) — PRÉVENIR UN INVITÉ HORS CRM.
 *
 * `RescheduleDialog` prévient déjà les invités RÉELS de l'évènement, par le
 * fournisseur (Google/Microsoft), quand un rendez-vous bouge. Ce dialogue
 * répond à une question différente, laissée HORS de la tranche #2102 (voir
 * `ConflictDialog.tsx`) : avertir quelqu'un qui n'a AUCUNE fiche CRM — donc
 * aucun fil de messagerie à reprendre, aucun dossier à ouvrir — d'un e-mail
 * simple à propos de ce rendez-vous.
 *
 * ⚠️ LE COPILOTE N'ENVOIE JAMAIS D'E-MAIL, IL PRÉPARE (doctrine, CLAUDE.md) :
 * le bouton final est un lien `mailto:` (`guestWarningMailto`), jamais un
 * appel réseau. Cliquer OUVRE le client de messagerie de la personne, sujet
 * et corps déjà écrits — l'envoi, s'il a lieu, part DE LÀ, sur un geste qui
 * n'est pas le nôtre.
 *
 * L'adresse est un champ LIBRE, validée par la MÊME règle que la liste
 * d'invités de `NewEventDialog` (`validatedSingleEmail`, GA-26) — jamais une
 * recherche dans les contacts : c'est précisément parce que cette personne
 * n'en a pas que ce dialogue existe.
 */
export function WarnGuestDialog({
  event,
  language,
  onClose,
  mode = 'warn',
}: {
  event: AgendaEvent | null
  language: string
  onClose: () => void
  /**
   * #2390.12 — `delegate` : le MÊME brouillon `mailto:`, écrit pour demander à
   * un collègue de prendre le rendez-vous. Une PROPOSITION : ni l'organisateur
   * ni les invités ne changent, rien n'est écrit dans un agenda externe.
   */
  mode?: 'warn' | 'delegate'
}) {
  const { t } = useTranslation('briefing')
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)

  // Chaque ouverture repart d'un champ vide : garder la saisie précédente
  // proposerait d'avertir la dernière personne prévenue, pas celle voulue
  // cette fois.
  useEffect(() => {
    if (event) {
      setEmail('')
      setTouched(false)
    }
  }, [event])

  if (!event) return null

  const recipient = validatedSingleEmail(email)
  const showError = touched && email.trim().length > 0 && recipient === null

  const subjectText = event.summary?.trim() || t('conflictDialog.noSubject')
  const when = formatWhen(event, language)
  const texts = mode === 'delegate' ? 'conflictDialog.delegateDialog' : 'conflictDialog.warnDialog'
  const subject = t(`${texts}.subject`, { subject: subjectText })
  const body = t(`${texts}.body`, { subject: subjectText, when: when ?? '' })
  const href = recipient ? guestWarningMailto(recipient, subject, body) : null

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`${texts}.title`)}</DialogTitle>
          <DialogDescription>{t(`${texts}.description`)}</DialogDescription>
        </DialogHeader>

        <Box className="flex flex-col gap-1 px-1">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('conflictDialog.warnDialog.emailLabel')}
          </Text>
          <Input
            type="email"
            value={email}
            autoFocus
            placeholder={t('conflictDialog.warnDialog.emailPlaceholder')}
            onChange={changed => setEmail(changed.target.value)}
            onBlur={() => setTouched(true)}
            aria-label={t('conflictDialog.warnDialog.emailLabel')}
            aria-invalid={showError}
          />
          {showError ? (
            <Text size="xs" className="text-[var(--danger-soft-text)]">
              {t('conflictDialog.warnDialog.invalidEmail')}
            </Text>
          ) : null}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('conflictDialog.warnDialog.cancel')}
          </Button>
          {/* `href` reste `null` tant que l'adresse n'est pas validée : pas de
              bouton cliquable pour un e-mail qui n'a pas encore de destinataire
              lisible — même refus que `canSubmit` dans `NewEventDialog`. */}
          {href ? (
            <Button asChild onClick={onClose}>
              <a href={href}>{t('conflictDialog.warnDialog.send')}</a>
            </Button>
          ) : (
            <Button disabled>{t('conflictDialog.warnDialog.send')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** `null` sans date lisible : le corps du message se tait sur l'horaire
 *  plutôt que d'afficher une date fausse. */
function formatWhen(event: AgendaEvent, language: string): string | null {
  if (!event.start) return null
  const at = new Date(event.start)
  if (Number.isNaN(at.getTime())) return null
  const day = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
  return `${day.format(at)} ${time.format(at)}`
}
