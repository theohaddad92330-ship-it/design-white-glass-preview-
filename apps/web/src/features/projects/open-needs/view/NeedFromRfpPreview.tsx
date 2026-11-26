import { needNextAction, type RfpNeedCriterion, type RfpNeedUnknown } from '@bellum/contracts'
import { Badge, Box, Button, SelectField, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { NextAction } from '@/components/primitives/NextAction'
import { formatDate } from '@/lib/locale'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { useOpenNeed } from '../hooks/useOpenNeed'
import { useRfpNeedPreview } from '../hooks/useRfpNeedPreview'

/**
 * #2571 — un appel d'offres transféré devient un besoin EN PRÉVISUALISATION.
 *
 * Retour CLIENT (François Thomas, 17/09/2026) : quand un client transfère un
 * appel d'offres en disant « trouve-moi quelqu'un », on ne veut pas ressaisir
 * le brief. Ce bloc lit le dossier déjà analysé (`/rfp`, #1097) et propose le
 * besoin qu'il ÉCRIRAIT — sans rien écrire tant que personne n'a choisi le
 * projet et cliqué « Confirmer ».
 *
 * ⚠️ #2571.4 GARDE-FOU : ce composant ne fait JAMAIS l'appel de confirmation
 * lui-même — seul le clic sur le bouton le déclenche (`confirm.mutate`,
 * `useRfpNeedPreview`). Une offre d'emploi, un signal ou une conversation
 * exploratoire arrivent tous par le même chemin d'intake ; aucun ne devient un
 * besoin confirmé sans ce geste.
 */
export function NeedFromRfpPreview({ rfpId, onDismiss }: { rfpId: string; onDismiss: () => void }) {
  const { t } = useTranslation('projects')
  const { preview, isLoading, isError, confirm } = useRfpNeedPreview(rfpId)
  const { data: projects } = useProjects()
  const [projectId, setProjectId] = useState('')
  const [createdNeedId, setCreatedNeedId] = useState<string | null>(null)

  // Seuls les projets DU COMPTE concerné, comme le panneau des offres
  // détectées : rattacher au hasard produirait un besoin sur la mauvaise
  // affaire. `account_id` absent (l'AO n'a pas été rattaché à un compte) ⇒
  // aucun filtre, plutôt qu'une liste vide qui bloquerait la confirmation.
  const candidates = (projects ?? []).filter(project =>
    preview?.account_id ? project.account_id === preview.account_id : true,
  )

  if (createdNeedId) {
    return <NeedFromRfpNextStep needId={createdNeedId} onDone={onDismiss} />
  }

  return (
    <Box className="space-y-3 rounded-md border border-border bg-card p-3">
      <Box>
        <Text element="h2" size="sm" weight="medium">
          {t('needFromRfp.title')}
        </Text>
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('needFromRfp.subtitle')}
        </Text>
      </Box>

      {isLoading ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('needFromRfp.loading')}
        </Text>
      ) : isError || !preview ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('needFromRfp.failed')}
        </Text>
      ) : (
        <>
          <Box>
            <Text element="h3" size="xs" weight="medium">
              {t('needFromRfp.criteriaTitle')}
            </Text>
            {preview.criteria.length === 0 ? (
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('needFromRfp.noCriteria')}
              </Text>
            ) : (
              <ul className="mt-1 space-y-1">
                {preview.criteria.map((criterion, index) => (
                  <li key={`${criterion.kind}-${index}`}>
                    <Text element="span" size="xs">
                      {criterionLabel(t, criterion)}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </Box>

          <Box>
            <Text element="h3" size="xs" weight="medium">
              {t('needFromRfp.unknownsTitle')}
            </Text>
            {/* #2571.1 — ce qui n'est pas dans le document reste ICI, nommé —
                jamais deviné, jamais absent silencieusement. */}
            <Box display="flex" className="mt-1 flex-wrap gap-1">
              {preview.unknowns.map((unknown, index) => (
                <Badge key={`${unknown.kind}-${index}`} variant="outline">
                  {unknownLabel(t, unknown)}
                </Badge>
              ))}
            </Box>
          </Box>

          <Box display="flex" className="flex-wrap items-center gap-2">
            <SelectField
              ariaLabel={t('needFromRfp.pickProject')}
              value={projectId}
              onChange={setProjectId}
              emptyOption={{ label: t('needFromRfp.pickProject') }}
              options={candidates.map(project => ({ value: project.id, label: project.label }))}
              className="min-w-0 max-w-full"
            />
            <Button
              type="button"
              size="sm"
              disabled={!projectId || confirm.isPending}
              onClick={() => {
                // #2571.2 — le SEUL geste qui écrit : un projet CHOISI, jamais
                // deviné, et un clic explicite.
                confirm.mutate(projectId, {
                  onSuccess: created => {
                    setCreatedNeedId(created.id)
                    toast.success(t('needFromRfp.confirmed'))
                  },
                  onError: () => toast.error(t('needFromRfp.failed')),
                })
              }}
            >
              {t('needFromRfp.confirm')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
              {t('needFromRfp.cancel')}
            </Button>
          </Box>
        </>
      )}
    </Box>
  )
}

/**
 * #2571.3 — LANCER LE RAPPROCHEMENT ET NOMMER LA PROCHAINE DÉCISION.
 *
 * Le besoin vient d'être écrit : `needNextAction` (déjà éprouvé sur les six
 * autres écrans qui portent une « prochaine action ») dit ce qu'il reste à
 * faire — et comme `needFromRfp` ne dérive jamais de compétences d'une prose,
 * c'est toujours `type_skills` qui ouvre le chemin vers le rapprochement.
 * Aucune dérivation nouvelle : `<NextAction>` rend le MÊME lien que la liste.
 */
function NeedFromRfpNextStep({ needId, onDone }: { needId: string; onDone: () => void }) {
  const { t } = useTranslation('projects')
  const { need } = useOpenNeed(needId)
  const action = need ? needNextAction(need, new Date()) : null
  return (
    <Box className="space-y-2 rounded-md border border-border bg-card p-3">
      <Text element="p" size="sm">
        {t('needFromRfp.created')}
      </Text>
      <NextAction
        action={action ? { domain: 'need', action, needId } : null}
        emptyLabel={t('needFromRfp.noNextAction')}
      />
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        {t('needFromRfp.close')}
      </Button>
    </Box>
  )
}

function criterionLabel(t: (key: string, options?: Record<string, unknown>) => string, criterion: RfpNeedCriterion) {
  switch (criterion.kind) {
    case 'issuer':
      return t('needFromRfp.criteria.issuer', { value: criterion.value })
    case 'deadline':
      return t('needFromRfp.criteria.deadline', { value: formatDate(criterion.value, { dateStyle: 'medium' }) })
    case 'lot':
      return t('needFromRfp.criteria.lot', { value: criterion.value })
    case 'requirement':
      return criterion.value
  }
}

function unknownLabel(t: (key: string, options?: Record<string, unknown>) => string, unknown: RfpNeedUnknown) {
  switch (unknown.kind) {
    case 'issuer':
      return t('needFromRfp.unknowns.issuer')
    case 'deadline':
      return t('needFromRfp.unknowns.deadline')
    case 'skills':
      return t('needFromRfp.unknowns.skills')
    case 'ambiguous_requirement':
      return t('needFromRfp.unknowns.ambiguousRequirement', { value: unknown.value })
  }
}
