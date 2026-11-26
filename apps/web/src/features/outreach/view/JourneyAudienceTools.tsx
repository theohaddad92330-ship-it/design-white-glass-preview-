import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import type { NavigateOptions } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { excludedRows, isHardBlocked } from '../enrollment-exclusions'
import { useEnrollmentEligibility } from '../hooks/useOutreachSequences'
import type { JourneyContact } from '../sequence-journey'

/**
 * Théo C sequences-assistant, étape 1 — « Importer » et « N contacts à vérifier ».
 *
 * L'import n'est pas refait ici : il emmène là où l'import vit déjà (prévisualisation, déduplication,
 * rattachement au compte), en rangeant d'abord le brouillon — on revient avec « Reprendre mon brouillon ».
 * Les exclusions se NOMMENT personne par personne : sans e-mail pro, opposition, déjà dans une autre séquence,
 * suivi par un collègue. Le serveur re-vérifie tout à l'enregistrement ; ceci évite la surprise.
 */

export function JourneyImportMenu({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation('outreach')
  const navigate = useNavigate()
  const go = (to: string, search?: Record<string, string>) => {
    // Le brouillon est rangé AVANT de partir : revenir sur l'assistant ne perd ni le nom ni la sélection.
    onLeave()
    void navigate({ to, search } as NavigateOptions)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11">
          {t('journey.import.cta')}
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => go('/settings/mes-donnees', { tab: 'imports' })}>
          {t('journey.import.file')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go('/settings/mes-donnees', { tab: 'imports' })}>
          {t('journey.import.crm')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go('/signals')}>{t('journey.import.lists')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type Check = { id: string; name: string; reasons: string[]; blocked: boolean }

export function JourneyExclusions({ picked }: { picked: ReadonlyMap<string, JourneyContact> }) {
  const { t } = useTranslation('outreach')
  const { t: tc } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const ids = useMemo(() => [...picked.keys()], [picked])
  const eligibility = useEnrollmentEligibility(ids)
  const membersData = useWorkspaceMembers().data

  const checks = useMemo(() => {
    const members = membersData ?? []
    const byId = new Map<string, Check>()
    const row = (contact: JourneyContact): Check => {
      const existing = byId.get(contact.id) ?? { id: contact.id, name: contact.full_name, reasons: [], blocked: false }
      byId.set(contact.id, existing)
      return existing
    }
    for (const contact of picked.values()) {
      if (!contact.email) row(contact).reasons.push(t('journey.audience.noEmail'))
      const owner = contact.assigned_to ? members.find(member => member.userId === contact.assigned_to) : undefined
      if (owner && !owner.isSelf)
        row(contact).reasons.push(
          t('journey.exclusions.followedBy', {
            name: owner.fullName ?? owner.email ?? t('journey.exclusions.colleague'),
          }),
        )
    }
    for (const excluded of excludedRows(eligibility.data)) {
      const contact = picked.get(excluded.contact_id)
      if (!contact) continue
      const entry = row(contact)
      for (const exclusion of excluded.exclusions)
        entry.reasons.push(t(`multichannel.exclusions.reason.${exclusion.code}`))
      if (isHardBlocked(excluded)) entry.blocked = true
    }
    return [...byId.values()]
  }, [picked, membersData, eligibility.data, t])

  if (checks.length === 0) return null
  const withoutEmail = [...picked.values()].filter(contact => !contact.email).length

  return (
    <Box
      role="status"
      data-testid="journey-exclusions"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warning-soft-text)] bg-[var(--warning-soft-bg)] p-3"
    >
      <Box className="flex min-w-0 flex-col gap-0.5">
        <Text size="sm" weight="semibold" className="text-[var(--warning-soft-text)]">
          {t('journey.exclusions.title', { count: checks.length })}
        </Text>
        {withoutEmail > 0 ? (
          <Text size="sm" className="text-[var(--warning-soft-text)]">
            {t('journey.audience.noEmailWarning', { count: withoutEmail })}
          </Text>
        ) : null}
      </Box>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => setOpen(true)}
      >
        {t('journey.exclusions.detail')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc('actions.close')} className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('journey.exclusions.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('journey.exclusions.dialogLead')}</DialogDescription>
          </DialogHeader>
          <ul className="flex list-none flex-col gap-3 p-0">
            {checks.map(check => (
              <li key={check.id} className="flex flex-col gap-0.5">
                <Text size="sm" weight="medium">
                  {check.name}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {check.reasons.join(' · ')}
                  {check.blocked ? ` — ${t('multichannel.exclusions.notForceable')}` : ''}
                </Text>
              </li>
            ))}
          </ul>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('journey.exclusions.hint')}
          </Text>
          <DialogFooter>
            <Button className="pointer-coarse:min-h-11" onClick={() => setOpen(false)}>
              {t('journey.exclusions.understood')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
