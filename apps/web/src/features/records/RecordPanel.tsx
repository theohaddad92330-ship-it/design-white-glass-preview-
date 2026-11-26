import type { RecordPanelKind } from '@bellum/contracts'
import {
  Box,
  Button,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ConsultantEngagementBanner } from '@/features/consultants/view/ConsultantEngagementBanner'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { RecordHistoryZone } from './RecordHistoryZone'
import { RecordLinksZone } from './RecordLinksZone'
import { RecordPropertiesZone } from './RecordPropertiesZone'
import { useRecordLinks } from './useRecordLinks'
import { useRecordStatusLabel } from './useRecordStatusLabel'

interface RecordTarget {
  kind: RecordPanelKind
  id: string
}

/**
 * #4194 (épopée #4191, lot L3) — LE panneau latéral unique : cliquer une carte
 * ou une ligne (opportunité, besoin, positionnement, mission, consultant) ouvre
 * le MÊME panneau — 1. Propriétés, 2. Historique, 3. Objets liés (cliquables :
 * un clic remplace le contenu). UN seul bouton Laura, UN seul lien « Ouvrir la
 * fiche complète » (celui de l'objet affiché).
 *
 * Sans URL : l'objet affiché est un état LOCAL, aucune route n'est ajoutée.
 *
 * `propertiesContent` / `lauraQuestion` ne valent que pour l'objet qui a ouvert
 * le panneau : dès qu'on suit un lien, la zone Propriétés lit la liste
 * générique de l'API et la question de Laura se recompose sur le nouvel objet.
 */
export function RecordPanel({
  target,
  onClose,
  propertiesContent,
  lauraQuestion,
}: {
  target: RecordTarget | null
  onClose: () => void
  propertiesContent?: ReactNode
  lauraQuestion?: string
}) {
  return (
    <Sheet open={target !== null} onOpenChange={open => (open ? undefined : onClose())}>
      {target ? (
        <RecordPanelBody
          key={`${target.kind}:${target.id}`}
          initial={target}
          onClose={onClose}
          propertiesContent={propertiesContent}
          lauraQuestion={lauraQuestion}
        />
      ) : null}
    </Sheet>
  )
}

function fullRecordLink(kind: RecordPanelKind, id: string, label: string, className: string, children: ReactNode) {
  switch (kind) {
    case 'opportunity':
      return (
        <Link to="/projects/$id" params={{ id }} className={className} aria-label={label}>
          {children}
        </Link>
      )
    case 'need':
      return (
        <Link to="/projects/needs/$needId" params={{ needId: id }} className={className} aria-label={label}>
          {children}
        </Link>
      )
    case 'submission':
      return (
        <Link to="/submissions/$id" params={{ id }} className={className} aria-label={label}>
          {children}
        </Link>
      )
    case 'mission':
      return (
        <Link to="/missions/$id" params={{ id }} className={className} aria-label={label}>
          {children}
        </Link>
      )
    case 'consultant':
      return (
        <Link to="/consultants/$id" params={{ id }} className={className} aria-label={label}>
          {children}
        </Link>
      )
  }
}

function RecordPanelBody({
  initial,
  onClose,
  propertiesContent,
  lauraQuestion,
}: {
  initial: RecordTarget
  onClose: () => void
  propertiesContent?: ReactNode
  lauraQuestion?: string
}) {
  const { t } = useTranslation('projects')
  // #4345 — lu ICI, au-dessus de `LauraIntroScope` du contenu : la portée vaut celle de la PAGE, pas du tiroir.
  const openLauraInPlace = useOpenLauraInPlace()
  const [current, setCurrent] = useState<RecordTarget>(initial)
  const query = useRecordLinks(current.kind, current.id)
  const statusLabel = useRecordStatusLabel()
  const data = query.data
  const isInitial = current.kind === initial.kind && current.id === initial.id
  const accountId = data?.links.find(g => g.kind === 'account')?.items[0]?.id
  const label = data?.label ?? ''
  const question =
    isInitial && lauraQuestion
      ? lauraQuestion
      : t('recordPanel.askLauraQuestion', { kind: t(`recordPanel.kinds.${current.kind}`), label })

  return (
    <SheetContent
      closeLabel={t('common:actions.close')}
      side="right"
      className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
    >
      <LauraIntroScope>
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetDescription>{t(`recordPanel.kinds.${current.kind}`)}</SheetDescription>
          <SheetTitle className="text-base">{label || t('recordPanel.loading')}</SheetTitle>
          {/* #4191 (E6) — le statut se LIT (« Qualifié »), jamais la valeur de base (« qualified »). */}
          {statusLabel(current.kind, data?.status) ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {statusLabel(current.kind, data?.status)}
            </Text>
          ) : null}
          <Box display="flex" className="mt-1 flex-wrap items-center gap-2">
            {/* UN SEUL bouton Laura, pour les cinq types (#4194). #4345 — sous ce tiroir (modal) la bulle est inerte :
                le geste REFERME le tiroir puis ouvre la bulle sur place, question pré-remplie, sans quitter l'écran
                (plus de lien vers /chat). Sans bulle atteignable (sur /chat), `AskLaura` garde son lien. */}
            {data ? (
              openLauraInPlace ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 pointer-coarse:min-h-11"
                  onClick={() => {
                    onClose()
                    openLauraInPlace(question)
                  }}
                >
                  <Sparkles className="size-3.5 shrink-0" aria-hidden />
                  {t('recordPanel.askLaura')}
                </Button>
              ) : (
                <AskLaura label={t('recordPanel.askLaura')} question={question} accountId={accountId} />
              )
            ) : null}
            <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
              {fullRecordLink(
                current.kind,
                current.id,
                t('recordPanel.openFull'),
                'inline-flex items-center gap-1.5',
                <>
                  <ExternalLink className="size-3.5" aria-hidden />
                  {t('recordPanel.openFull')}
                </>,
              )}
            </Button>
          </Box>
        </SheetHeader>
        {/* #4196 (L5) — la fiche d'un consultant dit-elle autre chose que sa mission en cours ?
            Une ligne quand c'est le cas, rien sinon. */}
        {current.kind === 'consultant' ? <ConsultantEngagementBanner consultantId={current.id} /> : null}
        <ScrollArea className="flex-1">
          {/* Les gestes de la fiche (Créer la mission, Exporter vers le CRM…) viennent de
              l'écran qui a ouvert le panneau, pas de la lecture des objets liés : ils ne
              disparaissent ni pendant le chargement ni si cette lecture échoue. */}
          {!data && isInitial && propertiesContent ? (
            <RecordPropertiesZone kind={current.kind} properties={[]} content={propertiesContent} />
          ) : null}
          {query.isError ? (
            <Text element="p" size="sm" className="px-5 py-4" role="alert">
              {t('recordPanel.error')}
            </Text>
          ) : !data ? (
            <Text element="p" size="sm" color="text-muted-foreground" className="px-5 py-4">
              {t('recordPanel.loading')}
            </Text>
          ) : (
            <>
              <RecordPropertiesZone
                kind={current.kind}
                properties={data.properties}
                content={isInitial ? propertiesContent : undefined}
              />
              <RecordHistoryZone kind={current.kind} history={data.history} />
              <RecordLinksZone groups={data.links} onOpen={(kind, id) => setCurrent({ kind, id })} />
            </>
          )}
        </ScrollArea>
      </LauraIntroScope>
    </SheetContent>
  )
}
