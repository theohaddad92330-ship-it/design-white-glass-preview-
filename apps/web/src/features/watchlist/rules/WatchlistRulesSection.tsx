import {
  Badge,
  Box,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { watchlistRuleKinds, WATCHLIST_RULE_VALUE_MAX, type WatchlistRuleKind } from '@bellum/contracts'
import { useWatchlistRules } from './useWatchlistRules'

/**
 * Règles PERSONNELLES de veille (restitution V2 §11) : ajouter / lister /
 * supprimer ce qu'on veut suivre (secteur, techno, compte, besoin, personne).
 * Rendu comme une carte de réglages (même langage que les autres sections de
 * l'écran Notifications). État vide clair, non bloquant.
 */
/** `focusSignal` — un geste ailleurs sur l'écran (« Configurer une veille ») y mène : chaque nouvelle valeur > 0 met le focus sur le champ. */
export function WatchlistRulesSection({ focusSignal = 0 }: { focusSignal?: number } = {}) {
  const valueInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusSignal > 0) valueInput.current?.focus()
  }, [focusSignal])
  const { t } = useTranslation('watchlist', { keyPrefix: 'rules' })
  const { rules, isLoading, isError, createRule, isCreating, createError, removeRule, removingId } = useWatchlistRules()

  const [kind, setKind] = useState<WatchlistRuleKind>('sector')
  const [value, setValue] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || isCreating) return
    createRule({ kind, value: trimmed }, { onSuccess: () => setValue('') })
  }

  return (
    <Box as="section" className="mb-6 last:mb-0">
      <Text size="sm" weight="medium" className="mb-2">
        {t('sectionLabel')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mb-3">
        {t('sectionDescription')}
      </Text>

      <Box rounded="xl" className="border border-[var(--bellum-border)] bg-card dark:bg-neutral-900 overflow-hidden">
        {/* Formulaire d'ajout : type + libellé + bouton. */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <Select value={kind} onValueChange={next => setKind(next as WatchlistRuleKind)}>
            <SelectTrigger
              aria-label={t('kindSelectLabel')}
              className="h-9 w-full border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-sm sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {watchlistRuleKinds.map(k => (
                <SelectItem key={k} value={k}>
                  {t(`kindLabels.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            ref={valueInput}
            value={value}
            onChange={event => setValue(event.target.value)}
            maxLength={WATCHLIST_RULE_VALUE_MAX}
            placeholder={t(`placeholders.${kind}`)}
            aria-label={t('valueInputLabel')}
            className="h-9 flex-1"
          />

          <Button type="submit" size="sm" icon={Plus} disabled={!value.trim() || isCreating} className="shrink-0">
            {t('addButton')}
          </Button>
        </form>

        {createError && (
          <Box className="px-4 pb-3">
            <Text size="xs" color="text-[var(--danger-soft-text)]">
              {t('errorCreate')}
            </Text>
          </Box>
        )}

        {/* Liste des règles. */}
        <Box className="border-t border-[var(--bellum-border)]">
          {isLoading ? (
            <RowMessage>{t('loading')}</RowMessage>
          ) : isError ? (
            <RowMessage>{t('errorLoad')}</RowMessage>
          ) : rules.length === 0 ? (
            <RowMessage>{t('empty')}</RowMessage>
          ) : (
            rules.map(rule => (
              <Box
                key={rule.id}
                display="flex"
                className="items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0"
              >
                <Box display="flex" className="min-w-0 items-center gap-2">
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {t(`kindLabels.${rule.kind}`)}
                  </Badge>
                  <Text size="sm" className="truncate text-[var(--bellum-text-primary)]">
                    {rule.value}
                  </Text>
                </Box>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  icon={X}
                  aria-label={t('remove', { value: rule.value })}
                  disabled={removingId === rule.id}
                  onClick={() => removeRule(rule.id)}
                  className="size-8 shrink-0 text-[var(--bellum-text-secondary)] hover:text-[var(--danger-soft-text)]"
                />
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Box>
  )
}

function RowMessage({ children }: { children: React.ReactNode }) {
  return (
    <Box className="px-4 py-4">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {children}
      </Text>
    </Box>
  )
}
