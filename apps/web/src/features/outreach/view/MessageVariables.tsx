import {
  OUTREACH_MARKET_MEMORY_SOURCE_PREFIX,
  OUTREACH_VARIABLE_CONFIDENCES,
  OUTREACH_VARIABLE_EXTERNAL_USES,
  marketMemorySourceRef,
  variablesNotClearedForExternalUse,
  type OutreachVariableConfidence,
  type OutreachVariableExternalUse,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatDate } from '@/lib/locale'
import { outreachKeys, outreachMessagesApi } from '../api'

/**
 * #3419.1 — les variables de la VERSION courante d'un message : valeur,
 * source, date, confiance, autorisation d'usage externe.
 *
 * Annotation DÉCLARÉE par le relecteur (le corps n'est jamais lu pour la
 * deviner). Rien n'a de valeur par défaut : confiance et usage externe se
 * choisissent, et « non établi » n'est jamais lu comme « autorisé » — le
 * relecteur est averti des variables à ne pas citer à l'extérieur. Panneau
 * déplié depuis la rangée d'actions de la carte, comme la comparaison des
 * versions.
 */
export function MessageVariables({ messageId, canWrite }: { messageId: string; canWrite: boolean }) {
  const { t } = useTranslation('outreach')
  const query = useQuery({
    queryKey: [...outreachKeys.all, 'variables', messageId],
    queryFn: () => outreachMessagesApi.variables(messageId),
    staleTime: 15_000,
  })
  const variables = query.data ?? []
  // #4074 — le préfixe persisté (donnée) ne se rend jamais : on dit la nature de la source.
  const displaySource = (source: string): string => {
    const ref = marketMemorySourceRef(source)
    return ref === null ? source : t('approval.variables.marketSource', { ref })
  }
  const notCleared = variablesNotClearedForExternalUse(variables)

  return (
    <Box className="space-y-3 rounded-md border border-[var(--border-subtle)] p-3">
      {query.isSuccess && variables.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('approval.variables.empty')}
        </Text>
      ) : null}
      {/* #2947 — une lecture en échec se DIT (recette 04/10 : formulaire seul, sans cause). */}
      {query.isError ? (
        <Text size="sm" role="alert" className="text-[var(--bellum-warning-text)]">
          {t('approval.variables.readFailed')}
        </Text>
      ) : null}
      {variables.length > 0 ? (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {variables.map(variable => (
            <li key={variable.id} className="space-y-1 py-2 first:pt-0 last:pb-0">
              <Box className="flex flex-wrap items-center gap-2">
                <Text size="sm" weight="medium">
                  {variable.name}
                </Text>
                <Badge variant="secondary" className="text-xs">
                  {t(`approval.variables.confidenceKind.${variable.confidence}`)}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    variable.external_use === 'allowed' ? 'text-xs' : 'text-xs text-[var(--bellum-warning-text)]'
                  }
                >
                  {t(`approval.variables.externalUseBadge.${variable.external_use}`)}
                </Badge>
              </Box>
              <Text size="sm">{variable.value}</Text>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('approval.variables.meta', {
                  source: displaySource(variable.source),
                  date: formatDate(variable.as_of),
                })}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
      {notCleared.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-warning-text)]">
          {t('approval.variables.notCleared', { count: notCleared.length })}
        </Text>
      ) : null}
      {canWrite ? <VariableForm messageId={messageId} /> : null}
    </Box>
  )
}

function VariableForm({ messageId }: { messageId: string }) {
  const { t } = useTranslation('outreach')
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [source, setSource] = useState('')
  const [asOf, setAsOf] = useState('')
  const [confidence, setConfidence] = useState<OutreachVariableConfidence | ''>('')
  const [externalUse, setExternalUse] = useState<OutreachVariableExternalUse | ''>('')
  // #2877 / #3419.4 — « la mémoire marché ne produit jamais seule une
  // affirmation nominative » : cochée, la source ENVOYÉE se préfixe
  // (même mécanisme que la source documentaire, #3752.7 — aucune colonne de
  // plus) et « Autorisé » sort des choix d'usage externe AVANT même d'essayer
  // d'envoyer (le serveur refuse aussi cette combinaison, en dernier recours).
  const [marketMemory, setMarketMemory] = useState(false)
  const externalUseOptions = marketMemory
    ? OUTREACH_VARIABLE_EXTERNAL_USES.filter(kind => kind !== 'allowed')
    : OUTREACH_VARIABLE_EXTERNAL_USES

  const save = useMutation({
    mutationFn: () => {
      if (confidence === '' || externalUse === '') throw new Error(t('approval.variables.failed'))
      return outreachMessagesApi.setVariable(messageId, {
        name: name.trim(),
        value: value.trim(),
        source: marketMemory ? `${OUTREACH_MARKET_MEMORY_SOURCE_PREFIX}${source.trim()}` : source.trim(),
        as_of: asOf,
        confidence,
        external_use: externalUse,
      })
    },
    onSuccess: async () => {
      toast.success(t('approval.variables.saved'))
      setName('')
      setValue('')
      setSource('')
      setAsOf('')
      setConfidence('')
      setExternalUse('')
      setMarketMemory(false)
      await qc.invalidateQueries({ queryKey: [...outreachKeys.all, 'variables', messageId] })
    },
    onError: err => toast.error(err instanceof Error ? err.message : t('approval.variables.failed')),
  })

  const complete =
    name.trim() !== '' &&
    value.trim() !== '' &&
    source.trim() !== '' &&
    asOf !== '' &&
    confidence !== '' &&
    externalUse !== ''

  return (
    <Box className="grid gap-2 md:grid-cols-2">
      <Input
        aria-label={t('approval.variables.name')}
        placeholder={t('approval.variables.name')}
        value={name}
        maxLength={80}
        onChange={e => setName(e.target.value)}
      />
      <Input
        aria-label={t('approval.variables.value')}
        placeholder={t('approval.variables.value')}
        value={value}
        maxLength={500}
        onChange={e => setValue(e.target.value)}
      />
      <Input
        aria-label={t('approval.variables.source')}
        placeholder={t('approval.variables.source')}
        value={source}
        maxLength={200}
        onChange={e => setSource(e.target.value)}
      />
      <Input
        aria-label={t('approval.variables.asOf')}
        type="date"
        value={asOf}
        onChange={e => setAsOf(e.target.value)}
      />
      <Select value={confidence} onValueChange={v => setConfidence(v as OutreachVariableConfidence)}>
        <SelectTrigger aria-label={t('approval.variables.confidence')}>
          <SelectValue placeholder={t('approval.variables.confidence')} />
        </SelectTrigger>
        <SelectContent>
          {OUTREACH_VARIABLE_CONFIDENCES.map(kind => (
            <SelectItem key={kind} value={kind}>
              {t(`approval.variables.confidenceKind.${kind}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={externalUse} onValueChange={v => setExternalUse(v as OutreachVariableExternalUse)}>
        <SelectTrigger aria-label={t('approval.variables.externalUse')}>
          <SelectValue placeholder={t('approval.variables.externalUse')} />
        </SelectTrigger>
        <SelectContent>
          {externalUseOptions.map(kind => (
            <SelectItem key={kind} value={kind}>
              {t(`approval.variables.externalUseKind.${kind}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 pointer-coarse:min-h-11 md:col-span-2">
        <Checkbox
          checked={marketMemory}
          onCheckedChange={checked => {
            const next = checked === true
            setMarketMemory(next)
            // #2877 / #3419.4 — « Autorisé » devient invalide dès que la case
            // est cochée : on ne laisse jamais un choix fait AVANT de passer
            // au NO-GO survivre en silence.
            if (next && externalUse === 'allowed') setExternalUse('')
          }}
          aria-label={t('approval.variables.marketMemory')}
        />
        <Text size="sm">{t('approval.variables.marketMemory')}</Text>
      </label>
      <Box>
        <Button
          type="button"
          size="sm"
          disabled={!complete || save.isPending}
          className="pointer-coarse:min-h-11"
          onClick={() => save.mutate()}
        >
          {t('approval.variables.submit')}
        </Button>
      </Box>
    </Box>
  )
}
