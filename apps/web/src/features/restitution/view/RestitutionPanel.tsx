import type { ImportObject, RestitutionBlock, WritableImportObject } from '@bellum/contracts'
import { Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ComputedAt } from '@/components/primitives/ComputedAt'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { hasRestitutionSignal, summaryPhraseCounts, type RestitutionCounts } from '../lib/restitution'
import { restitutionApi } from '../api'

/**
 * « BellumAI ne repart pas de zéro » — la restitution après une connexion ou
 * un import (#2080).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE PANNEAU LIT, ET CE QU'IL N'ÉCRIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il lit l'ISSUE d'un import déjà écrit (`counts`, fourni par l'appelant) et le
 * vivier de consultants de l'espace (`restitutionApi.consultantsTotal`) — deux
 * lectures, zéro écriture. #2080.13 : rien ici ne déclenche un nouvel audit ;
 * le bouton « Mettre à jour l'audit » navigue vers l'écran qui porte ce geste,
 * il ne l'exécute pas depuis un montage de composant.
 *
 * ⚠️ Les cinq blocs qui manquaient — relations, échéances, rendez-vous, données
 * manquantes, contradictions — sont raccordés depuis le 16/09/2026
 * (`GET /import/restitution`, #2080.3/.4/.6/.7/.8). Ils gardent EXACTEMENT le
 * même comportement quand la lecture n'aboutit pas : `null`, donc « non
 * mesuré », jamais un zéro qui mentirait. C'est le serveur qui décide lequel
 * des deux, parce que lui seul sait POURQUOI — un agenda non branché et un
 * agenda vide ne se distinguent pas depuis ici.
 *
 * Chaque bloc mesuré porte SA provenance : la ou les sources lues, et la date.
 * Un nombre sans source est un nombre dont personne ne peut dire d'où il sort,
 * et le premier réflexe devant un chiffre surprenant est de demander ça.
 */
/**
 * #2958.106 (recette Antoine) — l'écran où VIVENT les objets que l'import vient
 * d'écrire. Avant, 927 contacts importés s'annonçaient « 927 comptes
 * retrouvés » et « Voir les données » menait à /accounts : la restitution
 * parlait d'un objet que l'import n'avait pas écrit. Un objet non écrivable
 * (ou inconnu) garde la lecture « comptes », celle d'avant.
 */
const RESTITUTION_SCREENS = {
  account: '/accounts',
  contact: '/contacts',
  project: '/projects',
  need: '/projects/needs',
  talent: '/consultants',
  // #2732.1 — les missions importées se lisent dans /missions.
  mission: '/missions',
} as const satisfies Record<WritableImportObject, string>

function restitutionObject(objectType: ImportObject | null): WritableImportObject {
  return objectType !== null && objectType in RESTITUTION_SCREENS ? (objectType as WritableImportObject) : 'account'
}

export function RestitutionPanel({
  counts,
  sessionId = null,
  objectType = null,
  onDismiss,
}: {
  counts: RestitutionCounts
  /** L'objet RÉELLEMENT écrit par la session (`ImportSession.object_type`). */
  objectType?: ImportObject | null
  /** Le LOT qui vient d'entrer. Sans lui, « données manquantes » n'a rien à
   *  compter — et le dit, au lieu d'afficher zéro. */
  sessionId?: string | null
  /** Ferme le panneau — le geste derrière « corriger les correspondances » ET
   *  « continuer » : les deux ramènent au même endroit, l'assistant d'import
   *  toujours visible derrière ce panneau, avec des intentions différentes. */
  onDismiss: () => void
}) {
  const { t } = useTranslation('restitution')
  const { data: consultants } = useQuery({
    queryKey: ['restitution', 'consultants-total'],
    queryFn: restitutionApi.consultantsTotal,
    retry: false,
  })
  // #2080.3/.4/.6/.7/.8 — les cinq blocs qui demandaient une lecture réelle.
  const { data: summary } = useQuery({
    queryKey: ['restitution', 'summary', sessionId],
    queryFn: () => restitutionApi.summary(sessionId),
    retry: false,
  })

  // Un panneau qui n'a rien à montrer se tait — l'afficher sur du vide
  // promettrait « ne repart pas de zéro » à quelqu'un qui, précisément, en
  // repart.
  if (!hasRestitutionSignal(counts)) return null

  const phrase = summaryPhraseCounts(counts, null)
  const object = restitutionObject(objectType)

  return (
    <Card data-testid="restitution-panel">
      <Box className="space-y-3 p-4">
        <Box display="flex" className="items-start justify-between gap-2">
          <Text size="base" weight="semibold">
            {t('title')}
          </Text>
          <Button variant="ghost" size="sm" icon={X} onClick={onDismiss} aria-label={t('dismiss')} />
        </Box>

        {/* #2080.9 — la phrase mesurée. Le second chiffre n'apparaît que quand
            il est mesuré ; sinon la phrase s'arrête au premier, jamais complétée
            par un zéro inventé. */}
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {phrase.withoutNextAction === null
            ? t(`objects.${object}.summary`, { total: phrase.total })
            : t(`objects.${object}.summaryWithGap`, { total: phrase.total, gap: phrase.withoutNextAction })}
        </Text>

        <Box display="grid" className="grid-cols-2 gap-2 sm:grid-cols-3">
          <RestitutionBlock label={t(`objects.${object}.block`)} value={counts.created + counts.updated} />
          <RestitutionBlock label={t('blocks.consultants')} value={consultants ?? null} />
          <RestitutionBlock label={t('blocks.relations')} block={summary?.relations ?? null} />
          <RestitutionBlock label={t('blocks.upcoming')} block={summary?.upcoming ?? null} />
          <RestitutionBlock label={t('blocks.meetings')} block={summary?.meetings ?? null} />
          <RestitutionBlock label={t('blocks.missingData')} block={summary?.missing_data ?? null} />
          <RestitutionBlock label={t('blocks.contradictions')} block={summary?.contradictions ?? null} />
        </Box>

        <Box display="flex" className="flex-wrap gap-2">
          {/* #2080.10 — navigue vers l'écran de compte, où le geste (et son
              coût, avant le clic) vit déjà. Ce panneau ne le déclenche jamais
              lui-même. */}
          <Button variant="secondary" size="sm" asChild>
            <Link to="/accounts">{t('actions.updateAudit')}</Link>
          </Button>
          {/* #2080.11 */}
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            {t('actions.fixMapping')}
          </Button>
          {/* #2080.12 — #2958.106 : l'écran de l'objet écrit, pas toujours /accounts. */}
          <Button variant="outline" size="sm" asChild>
            <Link to={RESTITUTION_SCREENS[object]}>{t('actions.seeData')}</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {t('actions.continue')}
          </Button>
        </Box>
      </Box>
    </Card>
  )
}

/**
 * Un bloc du panneau — un nombre MESURÉ avec sa provenance, ou « non mesuré ».
 *
 * Deux entrées possibles, et c'est délibéré : `value` pour les comptes que
 * l'écran tient lui-même (ce que l'écriture vient de produire, le vivier), et
 * `block` pour ceux qui arrivent du serveur AVEC leur provenance. Un même
 * composant, parce que la règle est la même des deux côtés : `null` s'écrit
 * « non mesuré », jamais « 0 ».
 */
function RestitutionBlock({
  label,
  value,
  block,
}: {
  label: string
  value?: number | null
  block?: RestitutionBlock | null
}) {
  const { t } = useTranslation(['restitution', 'dashboard'])
  const shown = block ? block.value : (value ?? null)
  const sources = (block?.provenance?.sources ?? []).map(source => t(`dashboard:perspective.sources.${source}`))

  return (
    <Box className="rounded-lg border border-[var(--bellum-border)] p-2">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      {/* `UnknownValue` rend déjà son propre `<Text>` — l'imbriquer dans un
          second `<Text>` produirait un `<p>` dans un `<p>`, invalide en HTML. */}
      {shown === null ? (
        <UnknownValue />
      ) : (
        <Text size="lg" weight="semibold">
          {shown}
        </Text>
      )}
      {/* La source ET la date — un nombre sans provenance n'est pas
          vérifiable, et ce panneau existe pour être cru. */}
      {shown !== null && sources.length > 0 && block ? (
        <Box display="flex" className="flex-wrap items-center gap-x-1.5">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('dashboard:perspective.sourcesLine', { list: sources.join(' · ') })}
          </Text>
          <ComputedAt at={block.provenance.computed_at} />
        </Box>
      ) : null}
    </Box>
  )
}
