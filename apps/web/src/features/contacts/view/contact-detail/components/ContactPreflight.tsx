import type { ContactPreflight as ContactPreflightResult } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useContactPreflight } from '@/features/contacts/hooks/useContactPreflight'
import { formatDate } from '@/lib/locale'
import { SectionCard } from './SectionCard'
import { ContactAlertSlot } from '../alerts/ContactAlertSlot'
import { recheckFrom } from '../alerts/recheckFrom'
import { signatureOf } from '../alerts/contactAlertMemory'

type Item = ContactPreflightResult['items'][number]
type Claim = Extract<Item, { kind: 'open_conflict' }>['claims'][number]
type Unknown = ContactPreflightResult['unknowns'][number]

/** Les libellés de champ existent déjà sur la fiche (`keyInfo.*`) : réemployés, jamais redéclarés (GA-26). */
const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  title: 'keyInfo.jobTitle',
  entity: 'keyInfo.entity',
  email: 'keyInfo.email',
  phone: 'keyInfo.phone',
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — LE CONTRÔLE AVANT
 * ACTION, sur la fiche, en tête de la zone de travail : juste sous les gestes
 * « Contacter », « Séquences » et « Exporter vers le CRM » qu'il précède.
 *
 * Il NOMME ce qui diffère selon la source ou le périmètre (le MÊME calcul que
 * Laura lit, `GET /contacts/:id/preflight`) et ne tranche rien : aucune valeur
 * « choisie », aucun bouton qui écraserait la fiche — la correction reste le
 * geste ordinaire de « Corriger la fiche », et une correction humaine gagne.
 *
 * Aucun écart → aucune carte (une absence ne fait aucune ligne). Une
 * vérification seulement IMPOSSIBLE faute de donnée (contact sans compte,
 * périmètre non cartographié) ne fait pas de carte non plus — elle se nomme
 * sous des écarts quand il y en a ; un journal ILLISIBLE, lui, se dit toujours :
 * ce n'est jamais « rien à signaler ».
 */
export function ContactPreflight({
  contactId,
  onReveal,
}: {
  contactId: string
  /** #4596 — amène une zone de la fiche à l'écran (« Corriger la fiche »). */
  onReveal?: (id: string) => void
}) {
  const { t } = useTranslation('contacts')
  const { data, refetch } = useContactPreflight(contactId)
  if (!data) return null
  const unreadable = data.unknowns.some(unknown => unknown.reason === 'unreadable')
  if (data.items.length === 0 && !unreadable) return null

  // #4596 — « Revérifier » relit le MÊME calcul (lecture seule) : une valeur gardée par un humain reste gardée.
  const recheck = refetch ? () => recheckFrom(refetch) : undefined
  return (
    <ContactAlertSlot
      id="preflight"
      title={t('avantDagir.cards.preflight')}
      signature={signatureOf({ items: data.items, unknowns: data.unknowns })}
      onRecheck={recheck}
      gestures={
        onReveal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => onReveal('contact-correct')}
          >
            {t('avantDagir.gestures.correct')}
          </Button>
        ) : undefined
      }
    >
      <section aria-label={t('preflight.title')}>
        <SectionCard icon={ListChecks} title={t('preflight.title')}>
          <Text element="p" size="sm" color="text-muted-foreground" className="mb-3">
            {t('preflight.intro')}
          </Text>
          {data.items.length > 0 ? (
            <ul className="space-y-3">
              {data.items.map((item, index) => (
                <li key={`${item.kind}-${index}`}>
                  <PreflightItem item={item} />
                </li>
              ))}
            </ul>
          ) : null}
          {data.unknowns.length > 0 ? <PreflightUnknowns unknowns={data.unknowns} /> : null}
        </SectionCard>
      </section>
    </ContactAlertSlot>
  )
}

function PreflightItem({ item }: { item: Item }) {
  const { t, i18n } = useTranslation('contacts')
  const fieldLabel = (field: string) => {
    if (FIELD_LABEL_KEYS[field]) return t(FIELD_LABEL_KEYS[field])
    // #3400 — le libellé du champ vient du dictionnaire des champs de fiche (`crm:fields.*`),
    // jamais de la clé brute (`careerLevers`).
    if (i18n.exists(`crm:fields.${field}`)) return t(`crm:fields.${field}`)
    return field
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .toLowerCase()
  }

  switch (item.kind) {
    case 'open_conflict':
    case 'scope_difference': {
      const recheck = item.kind === 'open_conflict' ? formatDate(item.nextCheck, DATE_OPTIONS) : null
      return (
        <Box>
          <Text size="sm" weight="medium" className="block text-[var(--bellum-text-primary)]">
            {t(item.kind === 'open_conflict' ? 'preflight.openConflict' : 'preflight.scopeDifference', {
              field: fieldLabel(item.field),
            })}
          </Text>
          {item.claims.map((claim, index) => (
            <ClaimLine key={index} claim={claim} />
          ))}
          {recheck ? (
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {t('accountDetail:provenance.conflicts.recheck', { date: recheck })}
            </Text>
          ) : null}
        </Box>
      )
    }
    case 'employer_differs':
    case 'title_differs':
      return (
        <Box>
          <Text size="sm" weight="medium" className="block text-[var(--bellum-text-primary)]">
            {t(item.kind === 'employer_differs' ? 'preflight.employerDiffers' : 'preflight.titleDiffers', {
              record: item.recordValue ?? '',
              source: item.sourceValue,
            })}
          </Text>
          {item.recordKeptByHuman ? (
            <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
              {t('preflight.keptByHuman')}
            </Text>
          ) : null}
        </Box>
      )
    case 'out_of_account_scope':
      return (
        <Text size="sm" className="block text-[var(--bellum-text-primary)]">
          {item.entity ? t('preflight.outOfScopeEntity', { entity: item.entity }) : t('preflight.outOfScope')}
        </Text>
      )
    case 'identity_doubt':
      return (
        <Text size="sm" className="block text-[var(--bellum-text-primary)]">
          {t('preflight.identityDoubt')}
        </Text>
      )
  }
}

/**
 * #3400 — une valeur du journal peut arriver comme tableau sérialisé (`["a","b"]`) :
 * on la lit en liste (« a, b »), un tableau vide ne fait aucune valeur. Jamais de JSON à l'écran.
 */
function readableClaimValue(raw: string | null): string | null {
  if (raw === null) return null
  const text = raw.trim()
  if (!/^[[{]/.test(text)) return text || null
  try {
    return flattenValue(JSON.parse(text))
  } catch {
    return text.replace(/[[\]{}"]/g, '').trim() || null
  }
}

function flattenValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map(flattenValue).filter((part): part is string => part !== null)
    return parts.length > 0 ? parts.join(', ') : null
  }
  if (value && typeof value === 'object') return flattenValue(Object.values(value))
  return null
}

function ClaimLine({ claim }: { claim: Claim }) {
  const { t } = useTranslation('contacts')
  const base = t('accountDetail:provenance.conflicts.claim', {
    value: readableClaimValue(claim.value) ?? t('preflight.blankValue'),
    source: t(`accountDetail:provenance.conflicts.sourceTypes.${claim.source}`),
    date: formatDate(claim.at, DATE_OPTIONS) ?? '',
  })
  return (
    <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
      {claim.scope ? t('preflight.claimScoped', { claim: base, scope: claim.scope }) : base}
    </Text>
  )
}

function PreflightUnknowns({ unknowns }: { unknowns: readonly Unknown[] }) {
  const { t } = useTranslation('contacts')
  return (
    <Box className="mt-3 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" weight="medium" className="block text-[var(--bellum-text-muted)]">
        {t('preflight.unknownsTitle')}
      </Text>
      {unknowns.map(unknown => (
        <Text key={`${unknown.section}-${unknown.reason}`} size="xs" className="block text-[var(--bellum-text-muted)]">
          {t(`preflight.unknowns.${unknown.section}.${unknown.reason}`)}
        </Text>
      ))}
    </Box>
  )
}
