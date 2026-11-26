import { Badge, Box, Button, Card, Checkbox, cn, Input, Text } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { apiKeysApi, type ApiKeySummary, type CreatedApiKey, type PublicApiScope } from '@/features/api-keys/api'
import { API_KEYS_KEY, useApiKeys } from '@/features/api-keys/hooks/useApiKeys'
import { useFeatureLock } from '@/features/plan-features/useFeatureLock'

/** Public Swagger UI served by the API itself (`/v1/docs`, no secret needed). */
const DOCS_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/v1/docs`

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Théo D settings-outils.A2 — LA CLÉ N'EST JAMAIS AFFICHÉE : à la création elle part dans le presse-papiers, et ce
 * panneau le CONFIRME sans la montrer. Seul repli : si le navigateur refuse la copie, la clé s'affiche UNE fois (sans
 * elle, elle serait perdue pour de bon — le serveur n'en garde qu'une empreinte).
 */
function CreatedKeyPanel({ created, copied, onDone }: { created: CreatedApiKey; copied: boolean; onDone: () => void }) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations.apiKeys' })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.key)
      toast.success(t('copiedToast'))
    } catch {
      toast.error(t('copyError'))
    }
  }

  return (
    <Box
      rounded="lg"
      className="space-y-2 border border-[var(--bellum-primary-400)] bg-[color-mix(in_srgb,var(--bellum-primary-500)_8%,transparent)] p-3"
    >
      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
        {copied ? t('copiedTitle', { name: created.name }) : t('copyOnceTitle', { name: created.name })}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="snug">
        {copied ? t('copiedNotice') : t('copyOnceNotice')}
      </Text>
      {copied ? null : (
        <Box display="flex" className="items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 font-mono text-xs">
            {created.key}
          </code>
          <Button variant="secondary" size="sm" icon={Copy} className="min-h-11" onClick={copy}>
            {t('copyButton')}
          </Button>
        </Box>
      )}
      <Box display="flex" className="justify-end">
        <Button variant="ghost" size="sm" className="min-h-11" onClick={onDone}>
          {copied ? t('doneCopiedButton') : t('doneButton')}
        </Button>
      </Box>
    </Box>
  )
}

function ApiKeyRow({ apiKey, onRevoke, busy }: { apiKey: ApiKeySummary; onRevoke: () => void; busy: boolean }) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations.apiKeys' })
  const revoked = apiKey.revoked_at !== null

  return (
    <Box
      display="flex"
      className={`items-start gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 ${revoked ? 'opacity-60' : ''}`}
    >
      <Box className="min-w-0 flex-1">
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {apiKey.name}
          </Text>
          {revoked ? (
            <Badge variant="warning" className="text-xs">
              {t('revokedBadge')}
            </Badge>
          ) : (
            apiKey.scopes.map(scope => (
              <Badge key={scope} variant="outline" className="text-xs">
                {scope}
              </Badge>
            ))
          )}
        </Box>
        <Box display="flex" className="mt-1 flex-wrap items-center gap-x-3 gap-y-0.5">
          <Text size="xs" color="text-[var(--text-ghost)]">
            {t('createdAt', { date: formatDate(apiKey.created_at) })}
          </Text>
          <Text size="xs" color="text-[var(--text-ghost)]">
            {apiKey.last_used_at ? t('lastUsed', { date: formatDate(apiKey.last_used_at) }) : t('neverUsed')}
          </Text>
        </Box>
      </Box>
      {!revoked && (
        <Button variant="ghost" size="sm" icon={Trash2} isLoading={busy} onClick={onRevoke}>
          {t('revokeButton')}
        </Button>
      )}
    </Box>
  )
}

/**
 * « Clés API » (Réglages › Intégrations) — self-serve keys for the public
 * read-only `/v1` API. The full key value exists client-side ONLY right after
 * creation (copy-once panel); afterwards the list shows the prefix hint the
 * server kept. Management requires the RBAC `integrations:manage` seat —
 * the server enforces it, a 403 here just surfaces as an error toast.
 */
export function ApiKeysCard() {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations.apiKeys' })
  const { data: apiKeys, isLoading } = useApiKeys()
  // Émettre une clé n'a de sens que si `/v1` est ouvert au palier : l'API ferme
  // les deux ensemble. Le formulaire reste visible, grisé, et le clic dit
  // quelle offre l'ouvre.
  const apiLock = useFeatureLock('public_api')
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<PublicApiScope[]>(['read:accounts', 'read:contacts'])
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [copiedOnCreate, setCopiedOnCreate] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY })

  const toggleScope = (scope: PublicApiScope) => {
    setScopes(current => (current.includes(scope) ? current.filter(s => s !== scope) : [...current, scope]))
  }

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || scopes.length === 0 || creating) return
    setCreating(true)
    try {
      const result = await apiKeysApi.create(trimmed, scopes)
      // Théo D settings-outils.A2 — copiée tout de suite, jamais réaffichée ; l'affichage unique n'est que le repli d'une copie refusée.
      let copied = false
      try {
        await navigator.clipboard.writeText(result.key)
        copied = true
      } catch {
        copied = false
      }
      setCopiedOnCreate(copied)
      setCreated(result)
      setName('')
      invalidate()
      toast.success(t('createdToast', { name: result.name }))
    } catch {
      toast.error(t('createError'))
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (apiKey: ApiKeySummary) => {
    if (revokingId) return
    setRevokingId(apiKey.id)
    try {
      await apiKeysApi.revoke(apiKey.id)
      invalidate()
      toast.success(t('revokedToast', { name: apiKey.name }))
    } catch {
      toast.error(t('revokeError'))
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <Box display="flex" className="items-start gap-3">
        <Box
          rounded="lg"
          display="flex"
          className="shrink-0 size-9 items-center justify-center bg-[var(--bellum-surface-2)]"
        >
          <KeyRound className="size-4 text-[var(--bellum-text-secondary)]" />
        </Box>
        <Box className="min-w-0 flex-1">
          <Box display="flex" className="items-center gap-2">
            <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {t('title')}
            </Text>
          </Box>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="snug" className="mt-0.5">
            {t('description')}
          </Text>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--bellum-text-accent)] hover:underline"
          >
            <BookOpen className="size-3" />
            {t('docsLink')}
          </a>
        </Box>
      </Box>

      {created && <CreatedKeyPanel created={created} copied={copiedOnCreate} onDone={() => setCreated(null)} />}

      {isLoading ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('loading')}
        </Text>
      ) : (apiKeys?.length ?? 0) === 0 ? (
        <Text size="xs" color="text-[var(--text-ghost)]">
          {t('empty')}
        </Text>
      ) : (
        <Box className="space-y-2">
          {apiKeys?.map(apiKey => (
            <ApiKeyRow
              key={apiKey.id}
              apiKey={apiKey}
              busy={revokingId === apiKey.id}
              onRevoke={() => revoke(apiKey)}
            />
          ))}
        </Box>
      )}

      <Box className={cn('space-y-2 border-t border-[var(--bellum-border)] pt-3', apiLock.dimClassName)}>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          className="bg-card border-[var(--bellum-border)] text-xs"
          spellCheck={false}
          autoComplete="off"
        />
        <Box display="flex" className="flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={scopes.includes('read:accounts')} onCheckedChange={() => toggleScope('read:accounts')} />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('scopeAccounts')}
            </Text>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={scopes.includes('read:contacts')} onCheckedChange={() => toggleScope('read:contacts')} />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('scopeContacts')}
            </Text>
          </label>
          <Box className="ml-auto">
            <Button
              variant="default"
              size="sm"
              icon={Plus}
              disabled={!apiLock.locked && (!name.trim() || scopes.length === 0)}
              isLoading={creating}
              className={apiLock.dimClassName}
              onClick={apiLock.guard(create)}
            >
              {t('createButton')}
            </Button>
          </Box>
        </Box>
        <Text size="xs" color="text-[var(--text-ghost)]">
          {t('rateNotice')}
        </Text>
      </Box>
      {apiLock.dialog}
    </Card>
  )
}
