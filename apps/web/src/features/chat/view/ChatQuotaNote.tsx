import type { ChatQuotaStatus } from '@bellum/contracts'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchChatQuota } from '../api/chat-quota'
import { chatQuotaReopening } from '../lib/chat-quota-text'

/**
 * #1957.5 — « Il te reste peu de demandes à Laura » : dit AVANT le mur.
 *
 * Le plafond quotidien n'apparaissait qu'APRÈS un refus (`quotaNote`,
 * `chat-error.ts`) : on apprenait l'existence de la borne en la heurtant, au
 * milieu d'une question déjà tapée.
 *
 * Discret : une ligne au bord de la saisie, rien tant qu'il en reste assez. Le
 * SEUIL n'est pas ici — le serveur rend `low` (`isChatQuotaLow`, une seule
 * dérivation), sinon deux écrans pourraient se contredire.
 *
 * Rien non plus quand on ne sait pas : `unmeasured`, `unbounded` (démonstration,
 * plafond désactivé) ou une lecture en échec. « Non mesuré » n'est jamais
 * « 0 restant ».
 *
 * `refreshKey` = « un envoi est en cours » : le compte se relit à la FIN de
 * chaque envoi (et au montage), jamais pendant — pas de boucle réseau, et une
 * valeur scalaire en dépendance, jamais une fonction.
 */
export function ChatQuotaNote({ refreshKey }: { refreshKey: boolean }) {
  const { t, i18n } = useTranslation('chat')
  const [quota, setQuota] = useState<ChatQuotaStatus | null>(null)

  useEffect(() => {
    if (refreshKey) return undefined
    let cancelled = false
    void fetchChatQuota().then(next => {
      if (!cancelled) setQuota(next)
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (quota?.state !== 'measured' || !quota.low) return null

  // Décision Louis 13/09 batch 13 — plafond selon le plan : la note dit ce que
  // le plan prévoit quand c'est LUI qui borne. Plafond de sécurité de
  // l'opérateur, ou API d'avant sans la source : rien sur le plan.
  const fromPlan = quota.limitSource === 'plan'
  const text =
    quota.remaining === 0
      ? t(fromPlan ? 'quota.exhaustedPlan' : 'quota.exhausted', {
          limit: quota.limit,
          reopening: chatQuotaReopening(t, quota.reopensAt ? new Date(quota.reopensAt) : null, {
            language: i18n.language,
          }),
        })
      : t(fromPlan ? 'quota.lowPlan' : 'quota.low', { count: quota.remaining, limit: quota.limit })

  return (
    <p role="status" className="px-4 pb-1 text-xs text-[var(--bellum-text-muted)]">
      {text}
    </p>
  )
}
