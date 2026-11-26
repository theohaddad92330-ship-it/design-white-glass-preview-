import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@bellum/ui'
import { Archive, ArchiveRestore, Compass, FileText, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

/**
 * #4346 — « AUTRES GESTES » : où vivent les gestes retirés de l'en-tête de la fiche.
 *
 * L'en-tête porte exactement trois boutons (Louis 19/10/2026). Rien n'est perdu :
 * modifier, archiver (« une personne qui quitte l'ESN n'est pas une fiche erronée »),
 * ouvrir le CV (#4034, seulement s'il existe : on n'affiche pas ce qu'on n'a pas)
 * et « où placer » (prospection inversée, #2185.13, même libellé que la ligne du
 * vivier — une seule forme pour le même geste, GA-26) sont ici, dans UN menu.
 * Le menu vit dans la barre de la PAGE, à côté du retour au vivier, pas dans l'en-tête.
 */
export function TalentMoreActions({
  talentId,
  talentName,
  archived,
  archiveBusy,
  hasCv,
  onArchiveToggle,
  onOpenCv,
}: {
  talentId: string
  talentName: string
  archived: boolean
  archiveBusy: boolean
  hasCv: boolean
  onArchiveToggle: () => void
  onOpenCv: () => void
}) {
  const { t } = useTranslation('consultants')
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="min-h-11 gap-1.5" aria-label={t('detail.moreActions.trigger')}>
          <MoreHorizontal className="size-4" aria-hidden />
          {t('detail.moreActions.label')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {hasCv ? (
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={onOpenCv}>
            <FileText className="size-4" aria-hidden />
            {t('detail.header.openCv')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="min-h-11 gap-2"
          onSelect={() => void navigate({ to: '/consultants/$id/reverse-market', params: { id: talentId } })}
        >
          <Compass className="size-4" aria-hidden />
          {t('row.reverseMarket', { name: talentName })}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 gap-2" disabled={archiveBusy} onSelect={onArchiveToggle}>
          {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
          {archived ? t('detail.reactivate') : t('detail.archive')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
