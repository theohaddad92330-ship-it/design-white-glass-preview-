import { Box, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import { useProjectContacts } from '../hooks/useProjectContacts'

/**
 * #4291.7 (recette 23/10, démo forfait) — en espace forfait / conseil, une demande confirmée se lit comme un PROJET
 * À CADRER : périmètre, sponsor, budget. Aucun champ neuf : le périmètre est le grain saisi (`scope_label`) à défaut du
 * contexte (`detail`), le sponsor le contact rattaché avec le rôle « sponsor » (à défaut « décideur »), le budget le
 * montant de l'affaire. Même carte, mêmes mots que la fiche besoin (`needSheet.framing`, GA-26) ; chaque absence se
 * NOMME « à cadrer », jamais un « 0 » ni un nom inventé (GA-18 / GA-19).
 */
export function ProjectFramingBlock({
  project,
}: {
  project: { id: string; scope_label?: string | null; detail?: string | null; amount_cents?: number | null }
}) {
  const { t } = useTranslation('projects')
  const contacts = useProjectContacts(project.id)
  const scope = project.scope_label?.trim() || project.detail?.trim() || null
  const people = contacts.data ?? []
  const sponsors = people.filter(contact => contact.role === 'sponsor')
  const named = sponsors.length > 0 ? sponsors : people.filter(contact => contact.role === 'decideur')
  const sponsor = named.map(contact => contact.full_name).join(', ')
  return (
    <Box data-anchor="project-framing" data-testid="project-framing" className="space-y-2 px-5 pt-4">
      <Text element="h4" size="sm" weight="medium" color="text-muted-foreground">
        {t('needSheet.framing.title')}
      </Text>
      <dl className="grid gap-2">
        <Field label={t('needSheet.framing.scope')}>
          {scope ?? <UnknownValue reason={t('needSheet.framing.scopeToFrame')} />}
        </Field>
        <Field label={t('needSheet.framing.sponsor')}>
          {sponsor || <UnknownValue reason={t('needSheet.framing.sponsorToFrame')} />}
        </Field>
        <Field label={t('needSheet.budget')}>
          {project.amount_cents == null ? (
            <UnknownValue reason={t('needSheet.framing.budgetToFrame')} />
          ) : (
            formatCents(project.amount_cents)
          )}
        </Field>
      </dl>
    </Box>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="min-w-[7rem] text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}
