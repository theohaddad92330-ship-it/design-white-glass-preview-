import type { ProjectReadRow } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { BriefcaseBusiness } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'
import { opportunityDraftKey } from '@/features/projects/model/opportunityDraft'
import { projectOriginSearch } from '@/features/projects/lib/projectOrigin'
import { CreateProjectDialog } from '@/features/projects/view/CreateProjectDialog'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { watchSignalToOpportunityDraft } from './watchActions'

/**
 * #3683.2 — LE GESTE QUI DIT CE QU'IL FAIT SUR UN SIGNAL.
 *
 *  - une affaire du même nom existe déjà sur ce compte → « Ouvrir l'opportunité » : un LIEN vers
 *    `/projects/$id` (retour au même compte et onglet), jamais une seconde création ;
 *  - sinon → « Préparer une opportunité » : ouvre le BROUILLON (`CreateProjectDialog`), renseigné du
 *    fait, manques visibles, validation attendue. Aucune création au clic sur un fait public.
 *
 * La liste lue est LA MÊME clé que l'onglet Projets et la file de pistes : une lecture pour trois.
 */
export function SignalOpportunityAction({ accountId, signal }: { accountId: string; signal: WatchSignal }) {
  const { t } = useTranslation('accountWatch')
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const projects = useQuery({
    queryKey: ['projects', 'by-account', accountId],
    queryFn: () => apiFetch<ProjectReadRow[]>({ path: `/projects?account_id=${accountId}` }),
  })
  const draft = useMemo(() => watchSignalToOpportunityDraft(signal), [signal])
  const existing = (projects.data ?? []).find(
    row => opportunityDraftKey(row.label) === opportunityDraftKey(draft.label),
  )
  // Tant que la liste n’est pas lue : pas de bouton. Une lecture en échec laisse « Préparer » : le serveur refuse le doublon.
  if (projects.isPending) return null
  if (existing) {
    return (
      <Button asChild type="button" variant="ghost" size="sm" icon={BriefcaseBusiness}>
        <Link
          to="/projects/$id"
          params={{ id: existing.id }}
          search={projectOriginSearch({ accountId, tab: 'veille' })}
        >
          {t('timeline.openOpportunity')}
        </Link>
      </Button>
    )
  }
  return (
    <>
      <Button type="button" variant="ghost" size="sm" icon={BriefcaseBusiness} onClick={() => setOpen(true)}>
        {t('timeline.prepareOpportunity')}
      </Button>
      <CreateProjectDialog
        open={open}
        onOpenChange={setOpen}
        accountId={accountId}
        draft={draft}
        onOpenCreated={projectId =>
          void navigate({
            to: '/projects/$id',
            params: { id: projectId },
            search: projectOriginSearch({ accountId, tab: 'veille' }),
          })
        }
      />
    </>
  )
}
