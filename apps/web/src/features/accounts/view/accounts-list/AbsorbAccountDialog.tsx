import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountsApi } from '@/features/accounts/api'
import { useAbsorbAccount } from '@/features/accounts/hooks/useAbsorbAccount'

/**
 * « Rattacher ce dossier à un autre » (#1111).
 *
 * « J'ai lancé deux analyses, sur KLESIA et KLESIA ADP. C'est la même chose,
 * simplement des entités. Ce serait bien de pouvoir "fusionner" deux prospects
 * / clients en un seul compte. »
 *
 * Deux temps, et le premier n'écrit rien : on montre exactement ce que le geste
 * fera — combien de contacts bougent, lesquels RESTENT et pourquoi, ce qui est
 * archivé — avant que rien ne parte. C'est la même fonction pure côté serveur
 * qui calcule les deux, donc la prévisualisation ne peut pas mentir.
 *
 * Ce que l'écran DIT avant le clic, parce que le geste est ressenti comme
 * irréversible (un dossier quitte la liste) : rien n'est supprimé. Le dossier
 * absorbé est ARCHIVÉ, il reste ouvrable, et il porte le nom de celui auquel il
 * a été rattaché.
 */
export function AbsorbAccountDialog({
  accountId,
  companyName,
  open,
  onOpenChange,
}: {
  accountId: string
  companyName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accounts')
  const absorb = useAbsorbAccount()
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)
  const [query, setQuery] = useState('')

  // On cherche parmi les comptes DÉJÀ ouverts : rattacher à une société qu'on
  // n'a pas encore analysée n'aurait rien où rattacher.
  const { data: candidates = [] } = useQuery({
    queryKey: ['accounts', 'absorbCandidates', query],
    queryFn: () => accountsApi.list(query.trim() ? { q: query.trim(), limit: 8 } : { limit: 8 }),
    enabled: open,
    // Ni lui-même, ni un dossier déjà rangé : rattacher à un archivé
    // laisserait les DEUX rangés.
    select: response => response.data.filter(item => item.id !== accountId && item.status !== 'archived'),
  })

  const { data: preview, isFetching: previewing } = useQuery({
    queryKey: ['accounts', accountId, 'absorbPreview', target?.id],
    queryFn: () => accountsApi.previewAbsorb(accountId, target!.id),
    enabled: open && target != null,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>{t('absorb.title', { name: companyName })}</DialogTitle>
          <DialogDescription>{t('absorb.description')}</DialogDescription>
        </DialogHeader>

        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('absorb.intro')}
        </Text>

        <div className="space-y-1.5">
          <input
            type="text"
            value={query}
            onChange={event => {
              setQuery(event.target.value)
              setTarget(null)
            }}
            placeholder={t('absorb.searchPlaceholder')}
            aria-label={t('absorb.searchPlaceholder')}
            className="h-10 w-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)] outline-none"
          />
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {candidates.map(candidate => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setTarget({ id: candidate.id, name: candidate.company_name })}
                aria-pressed={target?.id === candidate.id}
                className={
                  target?.id === candidate.id
                    ? 'flex min-h-8 pointer-coarse:min-h-11 w-full items-center rounded-lg border border-[var(--bellum-primary-500)] px-2.5 text-left text-sm'
                    : 'flex min-h-8 pointer-coarse:min-h-11 w-full items-center rounded-lg border border-transparent px-2.5 text-left text-sm hover:bg-[var(--bellum-bg-lighter)]'
                }
              >
                {candidate.company_name}
              </button>
            ))}
          </div>
        </div>

        {target && preview && !previewing ? (
          <div className="space-y-1.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-3">
            <Text size="sm">{t('absorb.preview.entity', { entity: preview.entityName, kept: preview.keptName })}</Text>
            <Text size="sm">{t('absorb.preview.moved', { count: preview.movedContacts })}</Text>
            {preview.keptContacts.length > 0 ? (
              /* Ce qui NE bouge PAS est nommé : un homonyme déjà présent est la
                 même personne, et l'écraser effacerait la fiche la plus
                 renseignée des deux. */
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('absorb.preview.left', {
                  count: preview.keptContacts.length,
                  names: preview.keptContacts.map(c => c.fullName).join(', '),
                })}
              </Text>
            ) : null}
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('absorb.preview.rest')}
            </Text>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('absorb.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!target || previewing || absorb.isPending}
            isLoading={absorb.isPending}
            onClick={() =>
              target &&
              absorb.mutate(
                { accountId, into: target.id },
                {
                  onSuccess: () => {
                    onOpenChange(false)
                    setTarget(null)
                  },
                },
              )
            }
          >
            {t('absorb.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
