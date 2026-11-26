import { Box, Button, SelectField, Text } from '@bellum/ui'
import { Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AccountTeamScope } from '@bellum/contracts'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAccountTeam, useAccountTeamMutations, useGroupEntityFiches } from '../hooks'
import { AccountTeamScopeDialog } from './AccountTeamScopeDialog'
import { DistributeByScopeDialog } from './DistributeByScopeDialog'

/**
 * #4158.25 — l'ÉQUIPE d'un compte : le responsable (`assigned_to`) et ses
 * co-équipiers. Ajout/retrait par le responsable ou `team:manage` (l'API le
 * tient ; `can_edit` ne fait qu'éviter de proposer un geste refusé).
 *
 * Les co-équipiers ne changent PAS la visibilité — tout l'espace voit déjà tout :
 * ils servent au filtre « mes comptes » et aux notifications à venir.
 */
export function AccountTeamCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('teamGuardrails')
  const { data } = useAccountTeam(accountId)
  const { add, remove } = useAccountTeamMutations(accountId)
  const members = useWorkspaceMembers().data ?? []
  const fiches = useGroupEntityFiches(accountId).data ?? []
  const [editing, setEditing] = useState<string | null>(null)
  if (!data) return null
  // Rien à dire : ni responsable, ni co-équipier, ni droit d'en ajouter.
  if (!data.responsible && data.members.length === 0 && !data.can_edit) return null

  const taken = new Set([data.responsible?.user_id, ...data.members.map(m => m.user_id)])
  const candidates = members.filter(m => !taken.has(m.userId))

  // #4996 — les droits viennent du contrat (`can_edit`, `can_edit_own_scope`) ; le web ne les recalcule pas.
  const selfId = members.find(m => m.isSelf)?.userId
  const canEditScopeOf = (userId: string) => data.can_edit || (data.can_edit_own_scope === true && userId === selfId)
  // Responsable + co-équipiers, chacun avec ses zones : un membre sans zone n'a AUCUNE ligne « Périmètre ».
  const people = [
    ...(data.responsible ? [{ ...data.responsible, scopes: data.responsible.scopes ?? [] }] : []),
    ...data.members.map(m => ({ user_id: m.user_id, name: m.name, scopes: m.scopes ?? [] })),
  ]
  const scopeLine = (scopes: AccountTeamScope[]) => scopes.map(scope => scope.label).join(' · ')
  const editedPerson = people.find(person => person.user_id === editing)
  const followed = fiches.filter(fiche => fiche.ownerUserId)
  const nameOf = (userId: string | null) =>
    people.find(p => p.user_id === userId)?.name ??
    members.find(m => m.userId === userId)?.fullName ??
    members.find(m => m.userId === userId)?.email ??
    null

  return (
    <section
      aria-label={t('team.region')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
    >
      <Text element="h3" size="sm" weight="medium">
        {t('team.title')}
      </Text>
      {data.responsible ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
          {t('team.responsible', { name: data.responsible.name })}
        </Text>
      ) : null}
      {data.members.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-2">
          {data.members.map(member => (
            <li
              key={member.user_id}
              className="flex items-center gap-1 rounded-full border border-[var(--bellum-border)] px-3 py-1"
            >
              <Text size="sm">{member.name}</Text>
              {data.can_edit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  icon={X}
                  className="min-h-11 min-w-11"
                  aria-label={t('team.remove', { name: member.name })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(member.user_id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-2 flex flex-col gap-1">
        {people
          .filter(person => person.scopes.length > 0 || canEditScopeOf(person.user_id))
          .map(person => (
            <li key={person.user_id} className="flex flex-wrap items-center justify-between gap-x-3">
              <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="min-w-0">
                {person.scopes.length > 0 ? (
                  <>
                    <span className="font-medium text-[var(--bellum-text-primary)]">{person.name}</span>
                    {' — '}
                    {t('team.scopeLine', { labels: scopeLine(person.scopes) })}
                  </>
                ) : null}
              </Text>
              {canEditScopeOf(person.user_id) ? (
                <Button
                  size="icon"
                  variant="ghost"
                  icon={Pencil}
                  className="min-h-11 min-w-11"
                  aria-label={t('team.edit', { name: person.name })}
                  onClick={() => setEditing(person.user_id)}
                />
              ) : null}
            </li>
          ))}
      </ul>
      {followed.length > 0 ? (
        <Box className="mt-2">
          <Text size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
            {t('team.followed.title')}
          </Text>
          <ul>
            {followed.map(fiche => (
              <li key={fiche.id}>
                <Text size="sm">
                  {t('team.followed.line', { entity: fiche.companyName, name: nameOf(fiche.ownerUserId) ?? '' })}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
      {data.can_edit ? (
        <Box className="mt-2">
          <DistributeByScopeDialog accountId={accountId} />
        </Box>
      ) : null}
      {editedPerson ? (
        <AccountTeamScopeDialog
          accountId={accountId}
          member={editedPerson}
          open
          onOpenChange={open => !open && setEditing(null)}
        />
      ) : null}
      {data.can_edit && candidates.length > 0 ? (
        <Box className="mt-2">
          <SelectField
            value=""
            onChange={next => next && add.mutate(next)}
            ariaLabel={t('team.addLabel')}
            emptyOption={{ label: t('team.add') }}
            options={candidates.map(member => ({
              value: member.userId,
              label: member.fullName ?? member.email ?? member.userId,
            }))}
            size="sm"
            className="w-full min-w-48"
            disabled={add.isPending}
          />
        </Box>
      ) : null}
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
        {t('team.note')}
      </Text>
    </section>
  )
}
