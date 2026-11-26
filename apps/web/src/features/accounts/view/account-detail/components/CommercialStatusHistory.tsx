import type { AccountTimeline } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'

/**
 * #2117.23, .24 — LE MOTIF ET L'HISTORIQUE DU STATUT COMMERCIAL.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE SERVICE SAIT, DEPUIS LA RECETTE DU 15/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Ce panneau disait « aucun motif n'est demandé, l'historique n'est pas
 * journalisé » — c'était VRAI : seul le passage en client écrivait une trace
 * (`deal_signed`). Désormais `PATCH :id/commercial-status` accepte un motif
 * (optionnel au contrat, obligatoire à l'écran pour un statut de sortie —
 * `COMMERCIAL_STATUSES_REQUIRING_REASON`) et CHAQUE transition écrit une
 * entrée `commercial_status_changed` (qui, de → vers, motif), servie par
 * `GET :id/timeline` avec sa `transition` en valeurs machine que l'écran
 * traduit ici.
 *
 * Les comptes déplacés AVANT ce journal n'ont pas d'entrée : le panneau dit
 * « aucun changement n'a encore été journalisé », jamais « aucun changement ».
 * Un `deal_signed` antérieur reste nommé (« Devenu client le … ») tant qu'aucune
 * transition journalisée vers « Client » ne le remplace.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SIMPLE DIVULGATION, PAS UNE INFOBULLE RADIX
 * ─────────────────────────────────────────────────────────────────────────
 * Une infobulle s'ouvre au survol/focus — invisible au clic, invisible au
 * doigt sans geste dédié, et son contenu vit dans un portail que rien dans ce
 * dépôt ne teste aujourd'hui. Un simple bouton à bascule (`aria-expanded`)
 * est atteignable au clavier, s'ouvre au clic ET au doigt, et son contenu
 * reste dans le flux du document — testable sans dépendre du timing d'un
 * portail Radix.
 */
export function CommercialStatusHistory({ accountId }: { accountId: string }) {
  const { t, i18n } = useTranslation('accounts')
  const [open, setOpen] = useState(false)

  // Même clé de requête que `AccountTimelineCard` (`account-timeline`,
  // `apiFetch<AccountTimeline>({ path: '/accounts/:id/timeline' })`) : quand
  // les deux sont montés sur le même dossier, react-query partage le cache —
  // aucun appel réseau en plus pour ce panneau.
  const timeline = useQuery({
    queryKey: ['account-timeline', accountId],
    queryFn: () => apiFetch<AccountTimeline>({ path: `/accounts/${accountId}/timeline` }),
    select: response => response.events,
    staleTime: 30_000,
    enabled: open,
  })

  const events = timeline.data ?? []
  const changes = events.flatMap(event =>
    event.kind === 'action' && event.type === 'commercial_status_changed' && event.transition
      ? [{ id: event.id, at: event.at, reason: event.detail, transition: event.transition }]
      : [],
  )
  const becameCustomer = changes.some(change => change.transition.to === 'customer')
    ? undefined
    : events.find(event => event.kind === 'action' && event.type === 'deal_signed')
  const formatDate = (at: string) => new Date(at).toLocaleDateString(i18n.language)

  return (
    <Box className="relative">
      <button
        type="button"
        aria-label={t('commercialStatusHistory.label')}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--bellum-text-muted)] outline-none transition-colors hover:text-[var(--bellum-text-primary)] focus-visible:text-[var(--bellum-text-primary)] pointer-coarse:size-11"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <Box className="absolute left-0 top-full z-widget mt-1 w-64 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 shadow-md">
          <Text element="p" size="xs" weight="medium">
            {t('commercialStatusHistory.title')}
          </Text>
          {changes.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {changes.map(change => (
                <li key={change.id}>
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('commercialStatusHistory.change', {
                      date: formatDate(change.at),
                      from: change.transition.from
                        ? t(`commercialStatus.${change.transition.from}`)
                        : t('commercialStatusHistory.fromUnknown'),
                      to: t(`commercialStatus.${change.transition.to}`),
                    })}
                  </Text>
                  {change.reason ? (
                    <Text element="p" size="xs" className="text-[var(--bellum-text-primary)]">
                      {t('commercialStatusHistory.reason', { reason: change.reason })}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {becameCustomer ? (
            <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t('commercialStatusHistory.becameCustomer', { date: formatDate(becameCustomer.at) })}
            </Text>
          ) : null}
          {changes.length === 0 && !becameCustomer ? (
            <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('commercialStatusHistory.noChangeYet')}
            </Text>
          ) : null}
        </Box>
      )}
    </Box>
  )
}
