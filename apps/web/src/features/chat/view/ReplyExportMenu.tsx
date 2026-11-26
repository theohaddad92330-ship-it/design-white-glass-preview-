import { useTranslation } from 'react-i18next'
import { Download, FileText, ListChecks, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { splitReplyBlocks } from '@bellum/contracts'
import { useDataExit } from '@/lib/data-exit'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { replyCompact, replyMarkdown } from './reply-blocks/plain-text'

/**
 * #3770 (BEL-LAU-1016) — UNE RÉPONSE RICHE SORT DE L'ÉCRAN SANS PERDRE SA FORME.
 *
 * « Copier » (`ReplyFooter::CopyReply`) donne le texte nu. Quand la réponse
 * porte des cartes, trois gestes de plus : copie STRUCTURÉE (titres, tableaux,
 * étapes à cocher), copie COMPACTE (conclusions seulement) et fichier `.md`
 * partageable.
 *
 * #5032.15 — ces trois gestes vivent désormais dans le menu ⋯ du pied
 * (`ReplyRetryMenu`, « Exporter ») : ce module ne rend plus de déclencheur,
 * il SERT la liste (`useReplyExportActions`) — un seul menu, pas deux (GA-26).
 *
 * Absent pour une réponse sans carte : texte nu, structuré et compact y seraient
 * identiques, et un menu de trois gestes pour un seul résultat serait du bruit.
 * Le fichier est une SORTIE de données : il suit la règle d'espace
 * (`useDataExit`, #2081.14) comme le CSV de `FileExportCard`.
 * Laura n'envoie rien : tout ici est local, sans requête réseau.
 */
function fileNameFor(content: string, fallback: string): string {
  const first = splitReplyBlocks(content).find(segment => segment.kind === 'block')
  const title = first?.kind === 'block' && 'title' in first.block ? first.block.title : null
  const slug = (title ?? fallback)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'laura'}.md`
}

export function hasReplyBlocks(content: string): boolean {
  return splitReplyBlocks(content).some(segment => segment.kind === 'block')
}

export type ReplyExportAction = {
  key: string
  icon: LucideIcon
  label: string
  onSelect: () => void
}

/**
 * #5032.15 — les entrées « Exporter » du menu ⋯. `content` vide ou sans carte : aucune
 * entrée (jamais un geste dont le résultat serait celui de « Copier »). Appelé à chaque
 * rendu du menu : `useDataExit` n'est lu que si la réponse porte des cartes.
 */
export function useReplyExportActions(content: string | null): ReplyExportAction[] {
  const { t } = useTranslation('chat')
  const { allowed } = useDataExit()
  if (!content || !hasReplyBlocks(content)) return []

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('export.copied'), { duration: TOAST_SUCCESS_MS })
    } catch {
      toast.error(t('provenance.copyFailed'), { duration: TOAST_PROBLEM_MS })
    }
  }

  const source = content
  function download() {
    const url = URL.createObjectURL(new Blob([replyMarkdown(source)], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileNameFor(source, t('export.fileFallback'))
    link.click()
    URL.revokeObjectURL(url)
  }

  const actions: ReplyExportAction[] = [
    {
      key: 'exportStructured',
      icon: ListChecks,
      label: t('export.copyStructured'),
      onSelect: () => void copy(replyMarkdown(source)),
    },
    {
      key: 'exportCompact',
      icon: FileText,
      label: t('export.copyCompact'),
      onSelect: () => void copy(replyCompact(source)),
    },
  ]
  if (allowed) actions.push({ key: 'exportDownload', icon: Download, label: t('export.download'), onSelect: download })
  return actions
}
