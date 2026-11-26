import { Link } from '@tanstack/react-router'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { REPLY_PREFERENCE_KEYS, REPLY_PREFERENCE_OPTIONS, type ReplyPreferenceKey } from '@bellum/contracts'
import { Box, FilterChips, Text } from '@bellum/ui'
import { useReplyPreferences, useSetReplyPreference } from '@/features/memory/hooks/useReplyPreferences'

/**
 * La valeur « aucun réglage ». Elle n'est JAMAIS écrite dans le sac : la choisir
 * RETIRE la clé, et Laura répond alors exactement comme avant ce lot.
 */
const DEFAULT_CHOICE = 'default'

/**
 * #1928.9 — COMMENT LAURA TE RÉPOND, modifiable et effaçable à tout moment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Dans Réglages › Mémoire de Laura, section « Ta façon de travailler » : c'est
 * l'écran où vit déjà le sac `user_preferences` que ces réglages remplissent, et
 * où l'on vient vérifier ce que Laura relit. Un second écran « Style de Laura »
 * aurait fait deux portes vers le même sac (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La LANGUE (#1928.4) : Laura répond dans celle de l'interface, qui se règle
 * dans Réglages › Préférences. Un lien, pas un second sélecteur.
 *
 * ⚠️ Une lecture ÉCHOUÉE ne s'affiche pas « Par défaut » : ce serait dire à
 * quelqu'un qu'il n'a rien réglé alors qu'on n'a simplement rien lu.
 */
export function ReplyPreferencesSettings() {
  const { t } = useTranslation('knowledge')
  const { data, isLoading, isError } = useReplyPreferences()
  const setPreference = useSetReplyPreference()

  const choose = (key: ReplyPreferenceKey, next: string | null) => {
    const current = data?.[key] ?? DEFAULT_CHOICE
    if (!next || next === current || setPreference.isPending) return
    setPreference.mutate({ key, value: next === DEFAULT_CHOICE ? null : next })
  }

  return (
    <Box className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <Box className="flex flex-col gap-1">
        <Text element="h3" size="sm" weight="semibold">
          {t('memoryLedger.reply.title')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('memoryLedger.reply.intro')}
        </Text>
      </Box>

      {isLoading ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
          {t('memoryLedger.loading')}
        </Text>
      ) : isError || !data ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
          {t('memoryLedger.reply.unreadable')}
        </Text>
      ) : (
        <Box className="flex flex-col gap-2">
          {REPLY_PREFERENCE_KEYS.map(key => (
            // `FilterChips` porte déjà ce que l'écran doit tenir : un groupe
            // NOMMÉ, des boutons tabulables (`aria-pressed`), 44 px sous un
            // pointeur grossier (GA-30), et un nom visible de la dimension.
            <FilterChips
              key={key}
              ariaLabel={t(`memoryLedger.reply.${key}.label`)}
              legend={t(`memoryLedger.reply.${key}.label`)}
              value={data[key] ?? DEFAULT_CHOICE}
              onChange={next => choose(key, next)}
              options={[
                {
                  value: DEFAULT_CHOICE,
                  label: t('memoryLedger.reply.default'),
                  hint: t('memoryLedger.reply.defaultHint'),
                },
                ...(REPLY_PREFERENCE_OPTIONS[key] as readonly string[]).map(value => ({
                  value,
                  label: t(`memoryLedger.reply.${key}.${value}`),
                })),
              ]}
            />
          ))}
        </Box>
      )}

      {/* #1928.4 — la langue a UN réglage, celui de l'interface. */}
      <Box className="flex flex-wrap items-center gap-2">
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('memoryLedger.reply.language')}
        </Text>
        <Link
          to="/settings"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-[var(--bellum-text-accent)] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        >
          <Languages className="size-3.5" aria-hidden />
          {t('memoryLedger.reply.languageLink')}
        </Link>
      </Box>
    </Box>
  )
}
