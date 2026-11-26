import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Input, Label, Text } from '@bellum/ui'
import { useAgendaPreferences, useSetAgendaPreferences } from '@/features/memory/hooks/useAgendaPreferences'

/**
 * Défauts d'un brouillon NEUF — le champ non touché part du même repère que
 * le calcul de capacité (`AGENDA_CAPACITY_MINUTES_PER_DOSSIER`/
 * `AGENDA_CAPACITY_RESERVE_SLOTS`, `agenda-compact.ts`), jamais un chiffre
 * arbitraire pour ce formulaire.
 */
const DRAFT_DEFAULTS = { dossierDurationMinutes: 45, reserveSlots: 1 }

/**
 * #2101.17 — LES PRÉFÉRENCES D'AGENDA, réglées par la personne, au-delà du
 * seul temps protégé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET POURQUOI CE CHOIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Même sac `user_preferences`, même écran que `ProtectedTimeSettings`
 * (Réglages › Mémoire de Laura, section « Ta façon de travailler ») — un
 * réglage vit à un seul endroit (GA-26). Sans cette fenêtre, `agenda-compact.ts`
 * ne pouvait compter la capacité qu'avec deux constantes IDENTIQUES pour tout
 * le monde : combien de minutes un dossier prend, combien de créneaux rester
 * en réserve. Deux commerciaux ne travaillent pas à la même vitesse.
 *
 * ⚠️ Effacer (bouton « Revenir aux valeurs par défaut ») retire la clé du sac
 * — jamais une valeur à `null` qui resterait une ligne du registre sans rien
 * dire (même discipline que `useSetProtectedTime`).
 */
export function AgendaPreferencesSettings() {
  const { t } = useTranslation('knowledge')
  const { data, isLoading, isError } = useAgendaPreferences()
  const setAgendaPreferences = useSetAgendaPreferences()
  const [error, setError] = useState<string | null>(null)

  const commit = (field: 'dossierDurationMinutes' | 'reserveSlots', raw: string) => {
    const value = Number(raw)
    if (!Number.isInteger(value)) return
    const current = { ...DRAFT_DEFAULTS, ...data }
    // #2770.28 (recette prod 08/10) — un blur SANS changement ne repose rien : le
    // clic sur « Revenir aux valeurs par défaut » blur l'input encore focus AVANT
    // d'effacer, et ce blur reposerait sinon la même valeur par-dessus l'effacement
    // (course gagnée au hasard de l'ordre de réponse des deux requêtes).
    if (current[field] === value) return
    const next = { ...current, [field]: value }
    if (next.dossierDurationMinutes < 15 || next.dossierDurationMinutes > 240) {
      setError(t('memoryLedger.agendaPreferences.invalidDuration'))
      return
    }
    if (next.reserveSlots < 0 || next.reserveSlots > 10) {
      setError(t('memoryLedger.agendaPreferences.invalidReserve'))
      return
    }
    setError(null)
    setAgendaPreferences.mutate(next)
  }

  if (isLoading) {
    return (
      <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
        {t('memoryLedger.loading')}
      </Text>
    )
  }
  if (isError) {
    return (
      <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
        {t('memoryLedger.reply.unreadable')}
      </Text>
    )
  }

  const hasEitherField = data?.dossierDurationMinutes !== undefined || data?.reserveSlots !== undefined

  return (
    <Box className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <Box className="flex flex-col gap-1">
        <Text element="h3" size="sm" weight="semibold">
          {t('memoryLedger.agendaPreferences.title')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('memoryLedger.agendaPreferences.intro')}
        </Text>
      </Box>
      <Box className="flex flex-wrap items-end gap-3">
        <Box className="flex flex-col gap-1">
          <Label htmlFor="agenda-preferences-duration">{t('memoryLedger.agendaPreferences.duration')}</Label>
          <Input
            // #2770.28 (recette prod 08/10) — rechargement sinon nécessaire : un
            // champ non contrôlé (`defaultValue`) ignore une nouvelle valeur de
            // `data` sur la MÊME instance (après la remise par défaut). La `key`
            // force un remount quand la donnée persistée change, jamais pendant
            // la frappe (elle ne change qu'après une mutation réussie).
            key={`duration-${data?.dossierDurationMinutes ?? 'empty'}`}
            id="agenda-preferences-duration"
            type="number"
            min={15}
            max={240}
            defaultValue={data?.dossierDurationMinutes ?? ''}
            onBlur={event => commit('dossierDurationMinutes', event.target.value)}
          />
        </Box>
        <Box className="flex flex-col gap-1">
          <Label htmlFor="agenda-preferences-reserve">{t('memoryLedger.agendaPreferences.reserve')}</Label>
          <Input
            key={`reserve-${data?.reserveSlots ?? 'empty'}`}
            id="agenda-preferences-reserve"
            type="number"
            min={0}
            max={10}
            defaultValue={data?.reserveSlots ?? ''}
            onBlur={event => commit('reserveSlots', event.target.value)}
          />
        </Box>
        {hasEitherField ? (
          <button
            type="button"
            onClick={() => setAgendaPreferences.mutate(null)}
            className="min-h-11 rounded-md px-2 text-sm text-[var(--bellum-text-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          >
            {t('memoryLedger.agendaPreferences.clear')}
          </button>
        ) : null}
      </Box>
      {error ? (
        <Text element="p" size="sm" role="alert" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      ) : null}
    </Box>
  )
}
