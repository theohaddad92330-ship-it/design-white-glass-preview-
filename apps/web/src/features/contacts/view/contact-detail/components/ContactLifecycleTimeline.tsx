import {
  CONTACT_LIFECYCLE_LABELS,
  contactLifecycleLabel,
  type ContactLifecycleState,
  type ContactLifecycleTransition,
} from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { CheckCircle2, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Provenance } from '@/components/primitives/Provenance'
import { contactProvenanceKind, contactSourceLabel, formatContactDate } from '@/features/contacts/lib/contactProvenance'
import { useContactLifecycle } from '@/features/contacts/hooks/useContactLifecycle'
import { SectionCard } from './SectionCard'

/** One row: "Détecté le 16 juil. 2026 · via Pappers". */
function TransitionRow({ transition }: { transition: ContactLifecycleTransition }) {
  const { t } = useTranslation('contacts')
  const label = contactLifecycleLabel(transition.to_state)
  const date = formatContactDate(transition.occurred_at)
  const source = transition.source ? contactSourceLabel(transition.source) : null
  // La FAMILLE de la source, quand on sait la nommer — `null` sinon, et la
  // ligne garde alors son libellé plutôt qu'une catégorie devinée.
  const sourceKind = transition.source ? contactProvenanceKind(transition.source) : null
  return (
    <Box display="flex" className="items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-500/10 text-[var(--bellum-text-accent)]">
        <CheckCircle2 className="size-4" />
      </span>
      <Box className="min-w-0 flex-1">
        <Text element="p" size="sm" weight="medium" color="text-foreground">
          {date ? t('lifecycle.stateOn', { label, date }) : label}
        </Text>
        {/* La provenance de CE passage : la catégorie (qui dit quoi en faire)
            puis le libellé de la source. La date vit déjà dans la ligne
            au-dessus — la répéter ici la ferait apparaître deux fois. */}
        {source &&
          (sourceKind ? (
            <Provenance source={sourceKind} detail={source} />
          ) : (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('lifecycle.viaSource', { source })}
            </Text>
          ))}
      </Box>
    </Box>
  )
}

/**
 * Contact lifecycle timeline (P0 « états + providers ») — the persisted state
 * badge + the dated, sourced history of each passage (détecté le … / vérifié
 * le … / enrichi le …). Reuses the canonical labels from `@bellum/contracts`.
 */
export function ContactLifecycleTimeline({ contactId }: { contactId: string }) {
  const { t } = useTranslation('contacts')
  const { data, isLoading } = useContactLifecycle(contactId)
  if (isLoading || !data) return null

  const state: ContactLifecycleState | null = data.state
  return (
    <SectionCard icon={History} title={t('lifecycle.title')}>
      {state && (
        <Box display="flex" className="mb-4 items-center gap-2">
          <Text element="span" size="sm" color="text-muted-foreground">
            {t('lifecycle.currentState')}
          </Text>
          <Badge variant="primary">{CONTACT_LIFECYCLE_LABELS[state]}</Badge>
        </Box>
      )}
      {data.transitions.length > 0 ? (
        <Box className="space-y-4">
          {data.transitions.map(transition => (
            <TransitionRow key={transition.id} transition={transition} />
          ))}
        </Box>
      ) : (
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('lifecycle.emptyHistory')}
        </Text>
      )}
    </SectionCard>
  )
}
