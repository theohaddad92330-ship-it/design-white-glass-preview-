import { Badge, Box, Button, Card, Input, Label, Text } from '@bellum/ui'
import { hasPermission, type McpAccessIntent } from '@bellum/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useTeam } from '@/features/team/hooks/useTeam'
import {
  useCreateMcpAccessIntent,
  useDecideMcpAccessIntent,
  useMcpAccessIntents,
  usePendingMcpAccessIntents,
} from '../api'

const PERIMETERS = ['mine', 'shared'] as const

/**
 * Théo D settings-outils.N1 — « Cadre d'un nouvel accès » : préparer la configuration d'un assistant. Le jeton n'est
 * délivré qu'à la connexion de l'assistant ; un administrateur valide ou refuse l'intention. Lecture uniquement par
 * construction : aucun champ d'écriture n'existe (la phrase le dit, le schéma serveur est strict).
 */
export function McpAccessIntentCard() {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant.intent' })
  const { team } = useTeam()
  const canDecide = team ? hasPermission(team.workspace.role, 'integrations:manage') : false
  const mine = useMcpAccessIntents()
  const pending = usePendingMcpAccessIntents(canDecide)
  const create = useCreateMcpAccessIntent()
  const decide = useDecideMcpAccessIntent()
  const [name, setName] = useState('')
  const [perimeter, setPerimeter] = useState<(typeof PERIMETERS)[number]>('mine')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    create.mutate(
      { name: trimmed, perimeter },
      {
        onSuccess: () => {
          setName('')
          toast.success(t('sent'))
        },
        onError: () => toast.error(t('failed')),
      },
    )
  }

  const queue = (pending.data ?? []).filter(item => item.status === 'pending')

  return (
    <Card className="flex flex-col gap-3 p-4">
      <Box>
        <Text element="h2" size="sm" weight="semibold">
          {t('title')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('subtitle')}
        </Text>
      </Box>
      <Box className="flex flex-col gap-1">
        <Label htmlFor="mcp-intent-name">{t('name')}</Label>
        <Input id="mcp-intent-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      </Box>
      <Box role="radiogroup" aria-label={t('perimeter')} className="flex flex-wrap gap-4">
        {PERIMETERS.map(value => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="mcp-intent-perimeter"
              checked={perimeter === value}
              onChange={() => setPerimeter(value)}
              className="size-4"
            />
            {t(`perimeters.${value}`)}
          </label>
        ))}
      </Box>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('readOnly')}
      </Text>
      <Box>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          disabled={!name.trim() || create.isPending}
          onClick={submit}
        >
          {t('submit')}
        </Button>
      </Box>

      {(mine.data ?? []).length > 0 ? (
        <Box as="section" aria-label={t('mineTitle')} className="flex flex-col gap-2">
          <Text size="sm" weight="medium">
            {t('mineTitle')}
          </Text>
          <ul className="flex flex-col gap-2">
            {(mine.data ?? []).map(item => (
              <IntentLine key={item.id} item={item} />
            ))}
          </ul>
        </Box>
      ) : null}

      {canDecide && queue.length > 0 ? (
        <Box as="section" aria-label={t('queueTitle')} className="flex flex-col gap-2">
          <Text size="sm" weight="medium">
            {t('queueTitle')}
          </Text>
          <ul className="flex flex-col gap-2">
            {queue.map(item => (
              <IntentLine key={item.id} item={item} showWho>
                <Box className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: item.id, decision: 'approved' })}
                  >
                    {t('approve')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: item.id, decision: 'declined' })}
                  >
                    {t('decline')}
                  </Button>
                </Box>
              </IntentLine>
            ))}
          </ul>
        </Box>
      ) : null}
    </Card>
  )
}

function IntentLine({
  item,
  showWho = false,
  children,
}: {
  item: McpAccessIntent
  showWho?: boolean
  children?: React.ReactNode
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant.intent' })
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] p-3">
      <Box className="min-w-0">
        <Text size="sm" weight="medium" className="truncate">
          {item.name}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {showWho && item.requestedByName ? `${item.requestedByName} · ` : ''}
          {t(`perimeters.${item.perimeter}`)}
        </Text>
      </Box>
      {children ?? (
        <Badge
          variant={item.status === 'declined' ? 'destructive' : item.status === 'approved' ? 'success' : 'outline'}
          className="text-xs"
        >
          {t(`status.${item.status}`)}
        </Badge>
      )}
    </li>
  )
}
