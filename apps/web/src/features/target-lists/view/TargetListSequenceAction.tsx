import type { CampaignAudienceResult } from '@bellum/contracts'
import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { campaignAudienceApi } from '@/features/outreach/api'
import { CreateSequenceDialog } from '@/features/outreach/view/CreateSequenceDialog'

type Props = { listId: string; listName: string; hasLiveItems: boolean; buttonClassName: string }

/**
 * Golden journey 29 (#2208.60 / #2958.60) — « créer une séquence depuis une
 * cible ». La liste est une source de l'audience (`target_list`, #2380.2) : le
 * serveur juge qui est éligible, la fenêtre est la MÊME que partout
 * (`CreateSequenceDialog`, jamais une seconde), et ce qui sort de l'audience
 * est nommé avec sa raison. Rien n'est armé ici : la fenêtre prépare, le
 * commercial valide. Absent (pas grisé) sur une liste sans fiche vivante.
 */
export function TargetListSequenceAction({ listId, listName, hasLiveItems, buttonClassName }: Props) {
  const { t } = useTranslation('targets')
  const { t: tOutreach } = useTranslation('outreach')
  const [open, setOpen] = useState(false)
  const preview = useMutation<CampaignAudienceResult, Error, void>({
    mutationFn: () =>
      campaignAudienceApi.preview({ source: { kind: 'target_list', target_list_id: listId }, filters: {} }),
    onSuccess: result => setOpen(result.eligible.length > 0),
  })
  if (!hasLiveItems) return null
  const result = preview.data

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        aria-label={t('list.sequence', { name: listName })}
        disabled={preview.isPending}
        onClick={() => preview.mutate()}
      >
        <Send className="size-4" aria-hidden />
      </button>
      {preview.isError ? (
        <p role="alert" className="basis-full text-sm text-[var(--bellum-text-secondary)]">
          {t('list.sequenceError')}
        </p>
      ) : null}
      {result && result.eligible.length === 0 ? (
        <p className="basis-full text-sm text-[var(--bellum-text-secondary)]">{t('list.sequenceNoEligible')}</p>
      ) : null}
      {result && result.excluded.length > 0 ? (
        <div className="basis-full text-sm text-[var(--bellum-text-secondary)]">
          <p>{t('list.sequenceExcluded', { count: result.excluded.length })}</p>
          <ul>
            {result.excluded.map(entry => (
              <li key={entry.contact_id}>
                {entry.full_name ? `${entry.full_name} — ` : ''}
                {tOutreach(`audienceBuilder.reason.${entry.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* Montée à l'ouverture seulement : la fenêtre lit les contacts de l'espace, inutile sur chaque carte. */}
      {open ? (
        <CreateSequenceDialog
          open
          onOpenChange={setOpen}
          initialName={listName}
          initialContacts={(result?.eligible ?? []).map(contact => ({
            id: contact.contact_id,
            full_name: contact.full_name,
            title: contact.title,
            email: contact.email,
            assigned_to: contact.assigned_to,
          }))}
        />
      ) : null}
    </>
  )
}
