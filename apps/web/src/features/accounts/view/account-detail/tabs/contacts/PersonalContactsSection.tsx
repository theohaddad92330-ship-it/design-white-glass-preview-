import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Box, Button, Text } from '@bellum/ui'
import { accountKeys } from '@/features/accounts/api'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { fetchPersonalContacts, sharePersonalContact } from '@/features/universal-import/api'

/**
 * #2927 (#2159.54/.55) — « MES CONTACTS PERSONNELS » : les contacts que l'utilisateur a importés en portée
 * Personnel sur ce compte. Table à part côté API (`personal_contacts`) : aucun autre écran ni outil ne les lit,
 * ce bloc est leur SEUL point d'affichage. Absent quand il n'y en a aucun — une absence ne fait aucune ligne.
 * Même patron de ligne que les autres listes de la fiche (bordure `--bellum-border`, `Text` sm/xs).
 */
export function PersonalContactsSection({ accountId, className }: { accountId?: string; className?: string }) {
  const { t } = useTranslation('accountOrg')
  const { data, isError } = useQuery({
    queryKey: ['personal-contacts', accountId ?? 'all'],
    queryFn: () => fetchPersonalContacts(accountId),
    staleTime: 30_000,
  })
  const queryClient = useQueryClient()
  // #2927 (#2159.70) — le geste explicite qui fait entrer un contact dans l'équipe ; l'API archive la ligne perso.
  const share = useMutation({
    mutationFn: (personalContactId: string) => sharePersonalContact(personalContactId),
    onSuccess: result => {
      toast.success(t(result.alreadyKnown ? 'personalContacts.alreadyKnown' : 'personalContacts.shared'))
      void queryClient.invalidateQueries({ queryKey: ['personal-contacts'] })
      if (accountId) void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
  })
  // #4805 — un échec de lecture n'est pas « aucun contact personnel » ; l'absence, elle, ne fait aucune ligne.
  if (isError) return <QueryLoadError />
  if (!Array.isArray(data) || data.length === 0) return null
  return (
    <Box className={`flex flex-col gap-2 pt-4 ${className ?? ''}`} data-testid="personal-contacts">
      <Box className="flex items-center gap-2">
        <Lock aria-hidden className="size-3.5 text-[var(--bellum-text-muted)]" />
        <Text size="sm" weight="semibold">
          {t('personalContacts.title', { count: data.length })}
        </Text>
      </Box>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('personalContacts.hint')}
      </Text>
      {data.map(contact => (
        <Box
          key={contact.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
        >
          <Box className="flex min-w-0 flex-col gap-0.5">
            <Text size="sm" weight="medium">
              {contact.fullName}
            </Text>
            {contact.title ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {contact.title}
              </Text>
            ) : null}
          </Box>
          <Button
            variant="outline"
            size="xs"
            icon={Users}
            isLoading={share.isPending && share.variables === contact.id}
            onClick={() => share.mutate(contact.id)}
          >
            {t('personalContacts.share')}
          </Button>
        </Box>
      ))}
    </Box>
  )
}
