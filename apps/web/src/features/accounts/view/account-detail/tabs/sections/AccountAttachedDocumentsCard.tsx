import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { capitalize } from '@bellum/utils'
import { useRagDocuments } from '@/features/rag/hooks/useRagDocuments'
import { ProcessingStatusBadge } from '@/features/knowledge/view/ProcessingStatusBadge'
import { useAccountRuns } from '@/features/accounts/hooks/useAccountRuns'

type RunWindow = { created_at: string; completed_at: string | null }

/**
 * #4294.2 (décision de Louis, 29/10/2026) — le rattachement d'une pièce lente se joue côté serveur, invisible du
 * navigateur : « l'écran le DIT ». Une pièce dont l'envoi s'achève APRÈS le lancement d'une analyse, et avant
 * qu'elle se termine (ou pendant qu'elle court), est « ajoutée après le lancement ». Le moment du rattachement ne
 * change pas, seulement sa visibilité. Aucune analyse connue ⇒ rien d'affirmé.
 */
function addedAfterLaunch(createdAt: string, runs: readonly RunWindow[]): boolean {
  const added = Date.parse(createdAt)
  if (Number.isNaN(added)) return false
  return runs.some(run => {
    const launched = Date.parse(run.created_at)
    if (Number.isNaN(launched) || added <= launched) return false
    const ended = run.completed_at ? Date.parse(run.completed_at) : Number.POSITIVE_INFINITY
    return Number.isNaN(ended) || added <= ended
  })
}

/**
 * #3623.4 (recette prod 09/10, écriture) — « après le lancement, la pièce
 * jointe disparaît de l'écran ». La bande de pièces de `/search`
 * (`AnalysisAttachmentsStrip`) porte déjà le libellé « Rattachée à <compte> »
 * depuis le lot V16, mais elle disparaît du même geste qui lance l'analyse —
 * l'écran de LANCEMENT n'existe plus une fois l'analyse partie, donc personne
 * ne voit jamais ce libellé. La fiche du compte, elle, reste ouverte : c'est
 * là que le rattachement doit se lire.
 *
 * Le document voyageait déjà jusqu'ici — `GET /rag-documents` sélectionne
 * `scope`/`account_id` côté serveur (`rag.service.ts::listForWorkspace`) —
 * mais le TYPE client ne les déclarait pas, donc aucun écran ne les lisait.
 * Rien à montrer ⇒ rien de rendu (doctrine « on n'affiche pas ce qu'on n'a
 * pas »).
 */
export function AccountAttachedDocumentsCard({ accountId, companyName }: { accountId: string; companyName: string }) {
  const { t, i18n } = useTranslation('accountDetail')
  const { data: documents } = useRagDocuments()
  const { data: runs } = useAccountRuns(accountId)
  const clock = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' })
  const attached = (documents ?? []).filter(doc => doc.scope === 'account' && doc.account_id === accountId)

  if (attached.length === 0) return null

  return (
    <section
      aria-labelledby="attached-documents-title"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5"
    >
      <Text
        element="h3"
        id="attached-documents-title"
        size="sm"
        weight="semibold"
        className="mb-3 text-[var(--text-primary)]"
      >
        {t('attachedDocuments.title')}
      </Text>
      <ul className="space-y-3">
        {attached.map(doc => (
          <li key={doc.id} className="min-w-0">
            <Text size="sm" className="break-words text-[var(--text-primary)]">
              {doc.title ?? t('attachedDocuments.untitled')}
            </Text>
            <Text size="xs" className="text-[var(--text-muted)]">
              {t('attachedDocuments.attachedTo', { company: capitalize(companyName) })}
            </Text>
            {addedAfterLaunch(doc.created_at, runs ?? []) ? (
              <Text size="xs" className="text-[var(--text-muted)]" data-testid="attached-late">
                {t('attachedDocuments.addedAfterLaunch', { time: clock.format(new Date(doc.created_at)) })}
              </Text>
            ) : null}
            <ProcessingStatusBadge status={doc.processing_status} />
          </li>
        ))}
      </ul>
    </section>
  )
}
