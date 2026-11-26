import { Button } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { UserSearch } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreateContactDialog } from '@/features/crm-core/view/CreateContactDialog'
import type { SignalLead } from './signalLeads'

/**
 * #4324.1(b) — « cité dans un signal, pas encore de fiche » : les personnes que les signaux nomment et que le dossier
 * n'a pas encore en fiche. Nom et fonction tels que le signal les donne ; le geste est l'EXISTANT (GA-26) — la fiche
 * se crée préremplie dans `CreateContactDialog` (#2727) puis s'ouvre sur l'enrichissement de la fiche contact. Rien
 * n'est écrit avant le clic, et la source n'est jamais un nom de fournisseur : c'est « un signal ».
 */
export function SignalLeadsSection({ accountId, leads }: { accountId: string; leads: readonly SignalLead[] }) {
  const { t } = useTranslation('accountOrg')
  const navigate = useNavigate()
  const [adding, setAdding] = useState<SignalLead | null>(null)
  if (leads.length === 0) return null
  // #4509 — la variante `org` (#4465, personnes de l'organigramme sans fiche) est retirée avec son seul appelant.
  const keys = 'contactsTab.signalLeads'
  return (
    <section
      data-testid="signal-leads"
      aria-label={t(`${keys}.title`, { count: leads.length })}
      className="rounded-xl border border-[var(--bellum-border)] px-4 py-3"
    >
      <p className="text-sm font-medium text-[var(--bellum-text-primary)]">
        {t(`${keys}.title`, { count: leads.length })}
      </p>
      <ul className="mt-2 space-y-2">
        {leads.map(lead => (
          <li key={lead.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 text-sm text-[var(--bellum-text-primary)]">
              {lead.name}
              {lead.title ? <span className="text-[var(--bellum-text-secondary)]"> — {lead.title}</span> : null}
              <span className="block text-xs text-[var(--bellum-text-muted)]">{t(`${keys}.hint`)}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={UserSearch}
              className="min-h-11 shrink-0"
              onClick={() => setAdding(lead)}
            >
              {t(`${keys}.action`)}
            </Button>
          </li>
        ))}
      </ul>
      <CreateContactDialog
        key={adding?.name ?? 'none'}
        accountId={accountId}
        open={adding !== null}
        onOpenChange={open => {
          if (!open) setAdding(null)
        }}
        initialValues={
          adding
            ? {
                fullName: adding.name,
                ...(adding.title ? { title: adding.title } : {}),
                ...(adding.entity ? { entity: adding.entity } : {}),
              }
            : undefined
        }
        onCreated={contact => {
          setAdding(null)
          void navigate({ to: '/contacts/$id', params: { id: contact.id } })
        }}
      />
    </section>
  )
}
