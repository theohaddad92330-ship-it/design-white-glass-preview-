import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import { Box, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Text } from '@bellum/ui'
import { TheoPill } from '@/components/page/theo-page-grammar'
import { AskLaura } from '@/components/primitives/AskLaura'
import { CreateProjectDialog } from '@/features/projects/view/CreateProjectDialog'
import { useCreateTargetFromAccount } from '@/features/target-lists/useCreateTargetFromAccount'
import type { AccountForTalent } from './accountsForTalent'

/**
 * Théo C talents-comptes.R2 / N1 / N3 / R3 / A4 — le classement UNIQUE de comptes.
 *
 * Une ligne par compte : rang « 01 », étiquette d'état, le besoin qui porte le
 * rang, les compétences en commun, UNE phrase de raison, puis les deux gestes de
 * Théo (Explorer le compte · Préparer avec Laura). « Créer une cible » et
 * « Créer une affaire » (A4) vivent dans le menu « … » de la ligne. Aucune note
 * chiffrée : le rang s'explique, il ne se note pas (« jamais un score nu »).
 */
export function AccountsForTalentList({ rows, talentName }: { rows: readonly AccountForTalent[]; talentName: string }) {
  const { t } = useTranslation('consultants')
  return (
    <ol className="flex flex-col gap-3" aria-label={t('reverseMarket.accounts.listAria', { name: talentName })}>
      {rows.map(row => (
        <AccountForTalentRow key={row.key} row={row} talentName={talentName} />
      ))}
    </ol>
  )
}

function AccountForTalentRow({ row, talentName }: { row: AccountForTalent; talentName: string }) {
  const { t } = useTranslation('consultants')
  const createTarget = useCreateTargetFromAccount()
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [lauraOpen, setLauraOpen] = useState(false)
  const accountLabel = row.accountName ?? t('reverseMarket.internal.interlocutors.accountUnnamed')
  const reason = row.hasRelation
    ? t('reverseMarket.accounts.reason.relation', { role: row.role })
    : row.commonSkills.length > 0
      ? t('reverseMarket.accounts.reason.skills', { role: row.role, skills: row.commonSkills.join(', ') })
      : t('reverseMarket.accounts.reason.role', { role: row.role })

  const initials = accountLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')

  // Théo C talents-comptes `.match-row` : [rang + initiales] [compte, besoin, chips, raison, gestes] [statut teinté].
  return (
    <li
      className="flex flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
      data-testid={`account-for-talent-${row.key}`}
    >
      <Box className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Box className="flex flex-col items-center gap-1.5">
          <Text element="span" size="xs" weight="semibold" className="tabular-nums text-[var(--bellum-text-muted)]">
            {String(row.rank).padStart(2, '0')}
          </Text>
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
          >
            {initials}
          </span>
        </Box>
        <Box className="flex min-w-0 flex-col gap-1.5">
          <Text element="h3" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {row.accountId ? (
              <Link
                to="/accounts/$id"
                params={{ id: row.accountId }}
                className="rounded-sm hover:text-[var(--bellum-text-accent)] hover:underline"
              >
                {accountLabel}
              </Link>
            ) : (
              accountLabel
            )}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {row.location ? `${row.location} · ${row.role}` : row.role}
            {row.needCount > 1 ? ` · ${t('reverseMarket.accounts.needCount', { count: row.needCount })}` : ''}
          </Text>
          {row.commonSkills.length > 0 ? (
            <Box className="flex flex-wrap gap-1.5">
              {row.commonSkills.map(skill => (
                <TheoPill key={skill}>{skill}</TheoPill>
              ))}
            </Box>
          ) : null}
          <Text size="sm" className="leading-relaxed text-[var(--bellum-text-primary)]">
            {reason}
          </Text>
          <Box className="mt-1 flex flex-wrap items-center gap-2">
            {row.accountId ? (
              <Button size="sm" variant="soft" asChild>
                <Link to="/accounts/$id" params={{ id: row.accountId }} search={{ tab: 'contacts' }}>
                  {t('reverseMarket.accounts.explore')}
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="plain" aria-expanded={lauraOpen} onClick={() => setLauraOpen(open => !open)}>
              {t('reverseMarket.accounts.prepareWithLaura')}
            </Button>
            {row.accountId ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={MoreHorizontal}
                    aria-label={t('reverseMarket.accounts.moreAria', { account: accountLabel })}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      createTarget.mutate({ accountId: row.accountId ?? '', companyName: row.accountName })
                    }
                  >
                    {t('reverseMarket.accounts.createTarget')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCreateProjectOpen(true)}>
                    {t('reverseMarket.accounts.createDeal', { name: talentName })}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </Box>
        </Box>
        <Box className="col-start-2 sm:col-start-3 sm:row-start-1">
          <TheoPill tone={row.state === 'need' ? 'success' : 'warning'}>
            {t(`reverseMarket.accounts.state.${row.state}`)}
          </TheoPill>
        </Box>
      </Box>

      {/* Un panneau EN LIGNE, pas une surcouche : sous une modale, la bulle de Laura est inerte (voir AskLaura). */}
      {lauraOpen ? (
        <Box
          className="rounded-md border border-border bg-[var(--bellum-surface-2)] p-3"
          data-testid={`laura-prepare-${row.key}`}
        >
          <Text size="sm" weight="medium">
            {t('reverseMarket.accounts.laura.title', { account: accountLabel })}
          </Text>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('reverseMarket.accounts.laura.description', { name: talentName, account: accountLabel })}
          </Text>
          <Box className="mt-2 flex flex-col gap-2">
            {(['message', 'plan', 'r1'] as const).map(kind => (
              <AskLaura
                key={kind}
                alwaysVisible
                accountId={row.accountId ?? undefined}
                question={t(`reverseMarket.accounts.laura.${kind}.question`, {
                  name: talentName,
                  account: accountLabel,
                })}
                label={t(`reverseMarket.accounts.laura.${kind}.label`)}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      {createProjectOpen ? (
        <CreateProjectDialog
          open={createProjectOpen}
          onOpenChange={setCreateProjectOpen}
          accountId={row.accountId ?? undefined}
          onCreated={() => setCreateProjectOpen(false)}
        />
      ) : null}
    </li>
  )
}
