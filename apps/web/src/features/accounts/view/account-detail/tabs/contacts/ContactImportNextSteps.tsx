import { Button, Text } from '@bellum/ui'
import type { BulkImportSkipReason } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Target } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { useCreateTargetFromAccount } from '@/features/target-lists/useCreateTargetFromAccount'

/**
 * #2159.64/.65/.66/.63 — les quatre gestes que l'assistant d'import de
 * contacts doit proposer après un import réussi.
 *
 * Même parti pris que `CvImportNextSteps` (#2183.52-.55) : aucune destination
 * inventée, chacun pointe vers un geste qui existe déjà —
 *  - « Créer une première cible » réutilise `useCreateTargetFromAccount`
 *    (#2164.44, déjà câblé depuis le dossier compte) ;
 *  - « Mettre à jour mon audit » navigue vers CE dossier (`/accounts/$id`) ;
 *  - « Demander à Laura » réutilise `AskLaura` (D44 : un seul moteur de
 *    conversation) plutôt qu'un second lien fabriqué à la main ;
 *  - « Voir les exceptions » (#2159.63) liste `skippedDetails` TEL QUE
 *    `bulkImportManual` l'a calculé — jamais un statut « à vérifier »
 *    inventé côté écran. Un tableau vide n'affiche AUCUN bouton (on
 *    n'affiche pas ce qu'on n'a pas).
 */
export function ContactImportNextSteps({
  accountId,
  companyName,
  skippedDetails,
}: {
  accountId: string
  companyName: string | null
  skippedDetails?: { full_name: string; reason: BulkImportSkipReason }[]
}) {
  const { t } = useTranslation('accountOrg')
  const createTarget = useCreateTargetFromAccount()
  const [showExceptions, setShowExceptions] = useState(false)
  const exceptions = skippedDetails ?? []

  const reasonLabel: Record<BulkImportSkipReason, string> = {
    blank_name: t('import.exceptionsPanel.reasonBlankName'),
    duplicate: t('import.exceptionsPanel.reasonDuplicate'),
  }

  return (
    <LauraIntroScope>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          icon={Target}
          isLoading={createTarget.isPending}
          onClick={() => createTarget.mutate({ accountId, companyName })}
        >
          {t('import.next.createTarget')}
        </Button>
        <Link to="/accounts/$id" params={{ id: accountId }}>
          <Button variant="outline" size="xs">
            {t('import.next.updateAudit')}
          </Button>
        </Link>
        <AskLaura
          accountId={accountId}
          question={t('import.next.askLauraPrompt', { company: companyName ?? t('import.next.thisAccount') })}
          label={t('import.next.askLaura')}
        />
        {exceptions.length > 0 ? (
          <Button
            variant="outline"
            size="xs"
            icon={AlertTriangle}
            aria-expanded={showExceptions}
            onClick={() => setShowExceptions(value => !value)}
          >
            {t('import.next.exceptions')}
          </Button>
        ) : null}
      </div>

      {showExceptions && exceptions.length > 0 ? (
        <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bellum-bg)] p-3">
          <Text element="p" size="xs" weight="semibold" className="mb-2 text-[var(--text-primary)]">
            {t('import.exceptionsPanel.title')}
          </Text>
          <ul className="space-y-1">
            {exceptions.map((row, i) => (
              <li key={`${row.full_name}-${i}`} className="flex items-center justify-between gap-2">
                <Text size="xs" className="truncate text-[var(--text-primary)]">
                  {row.full_name || '—'}
                </Text>
                <Text size="xs" className="shrink-0 text-[var(--text-muted)]">
                  {reasonLabel[row.reason]}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </LauraIntroScope>
  )
}
