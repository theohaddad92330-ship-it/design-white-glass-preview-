import type { OpenNeedRow, Submission } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useSubmissions } from '@/features/submissions/api'
import { SHORTLIST_PREVIEW_SIZE, shortlistOf } from '../model/need-shortlist'

/**
 * #4344.4 — la SHORTLIST d'un besoin, là où on la cherche : sur la fiche du besoin (`all`, tous les noms)
 * et, en aperçu, sur la fiche de l'affaire qui le porte (le nombre, les trois premiers, un lien).
 *
 * Pas de shortlist → l'aperçu ne se rend PAS : une absence ne fait aucune ligne, jamais « 0 ».
 * Lecture seule : faire avancer une étape reste sur le panneau Positionnements (un seul endroit, GA-26).
 */
export function NeedShortlistPreview({
  needId,
  items,
  all = false,
  onOpen,
}: {
  needId: string
  items: readonly Submission[]
  /** Tous les noms (fiche du besoin) plutôt que les trois premiers (fiche de l'affaire). */
  all?: boolean
  onOpen?: () => void
}) {
  const { t } = useTranslation('projects')
  const { t: tSubmissions } = useTranslation('submissions')
  const { count, first } = shortlistOf(items, needId, all ? undefined : SHORTLIST_PREVIEW_SIZE)
  if (count === 0) return null

  return (
    <Box className="space-y-1" data-testid="need-shortlist">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {t('needSheet.shortlist.title', { count })}
      </Text>
      <ul className="flex flex-wrap items-center gap-1.5">
        {first.map(item => (
          <li key={item.id} className="flex items-center gap-1">
            <Text element="span" size="sm">
              {item.consultantName ?? tSubmissions('unknownTalent')}
            </Text>
            <Badge variant="secondary">{tSubmissions(`stages.${item.stage}`)}</Badge>
          </li>
        ))}
      </ul>
      {onOpen ? (
        <Button variant="link" size="sm" className="h-auto p-0 pointer-coarse:min-h-11" onClick={onOpen}>
          {t('needSheet.shortlist.open')}
        </Button>
      ) : null}
    </Box>
  )
}

/** #4344.4 — la shortlist sur la fiche du besoin : lit les positionnements du projet, garde ceux de CE besoin. */
export function NeedShortlistSection({ need, onOpen }: { need: OpenNeedRow; onOpen: () => void }) {
  const { data } = useSubmissions({ projectId: need.project_id ?? undefined })
  return <NeedShortlistPreview needId={need.id} items={data?.items ?? []} all onOpen={onOpen} />
}
