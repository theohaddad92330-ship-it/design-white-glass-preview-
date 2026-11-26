import { channelCapability } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { AtSign, Bell, CheckSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * CE QUE LE MOTEUR SAIT FAIRE, PAR CANAL (#1511).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RETOUR AVAIT RAISON SUR LE FOND, ET SE TROMPAIT DE LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il demande d'annoncer « e-mail / LinkedIn / appel / SMS / WhatsApp » avec leur
 * disponibilité, et écrit la règle qui compte : *« ne jamais afficher une
 * capacité uniquement parce qu'elle serait souhaitable à terme »*.
 *
 * Or le moteur ne connaît PAS ces cinq canaux. `outreachStepKindSchema` en
 * déclare exactement trois — `email`, `reminder`, `task` — et rien d'autre n'est
 * persistable. Le gabarit « Compte froid — LinkedIn » lui-même n'a aucune étape
 * LinkedIn : ce sont des TÂCHES, que le commercial fait à la main.
 *
 * Ce bloc dit donc les trois natures RÉELLES, et ce qu'elles font. Écrire
 * « SMS — non disponible » aurait été le contraire de ce que le retour demande :
 * une ligne qui ANNONCE un canal, dans un tableau de canaux, sur un produit qui
 * n'en a jamais eu l'ombre. Le dernier paragraphe le dit en clair, pour que la
 * question ne se repose pas en réunion.
 *
 * ⚠️ Le NOM DE L'ÉDITEUR n'apparaît pas — pas « Google Workspace connecté »,
 * mais « ta messagerie est connectée ». C'est l'arbitrage du produit, et sa
 * seule exception est Réglages › Intégrations.
 */
export function ChannelsBlock({ canSend }: { canSend: boolean }) {
  const { t } = useTranslation('outreach')

  const rows = [
    {
      key: 'email',
      icon: <AtSign className="size-4 shrink-0" aria-hidden="true" />,
      label: t('channels.email'),
      // La seule ligne dont l'état DÉPEND de l'espace : les deux autres ne
      // demandent aucun connecteur, et prétendre le contraire ferait chercher
      // un réglage qui n'existe pas.
      text: canSend ? t('channels.emailReady') : t('channels.emailMissing'),
      tone: canSend ? 'bg-[var(--success-soft-text)]' : 'bg-[var(--warning-soft-text)]',
    },
    {
      key: 'reminder',
      icon: <Bell className="size-4 shrink-0" aria-hidden="true" />,
      label: t('channels.reminder'),
      text: t('channels.reminderWhat'),
      tone: 'bg-[var(--success-soft-text)]',
    },
    {
      key: 'task',
      icon: <CheckSquare className="size-4 shrink-0" aria-hidden="true" />,
      label: t('channels.task'),
      text: t('channels.taskWhat'),
      tone: 'bg-[var(--success-soft-text)]',
    },
  ]

  return (
    <Box className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="medium">
        {t('channels.title')}
      </Text>
      <Box className="grid gap-3 md:grid-cols-3">
        {rows.map(row => (
          <Box key={row.key} className="flex min-w-0 items-start gap-2">
            <Box className={`mt-1.5 size-2 shrink-0 rounded-full ${row.tone}`} aria-hidden="true" />
            <Box className="flex min-w-0 flex-col gap-0.5">
              <Box className="flex items-center gap-1.5 text-[var(--bellum-text-secondary)]">
                {row.icon}
                <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {row.label}
                </Text>
                {/* #3700.8 — la capacité RÉELLE du canal, lue du contrat (jamais « automatique » par défaut). */}
                <Badge variant={channelCapability(row.key) === 'delegable' ? 'success' : 'outline'}>
                  {t(`channels.capability.${channelCapability(row.key)}`)}
                </Badge>
              </Box>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {row.text}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('channels.nothingAuto')} {t('channels.onlyThree')}
      </Text>
    </Box>
  )
}
