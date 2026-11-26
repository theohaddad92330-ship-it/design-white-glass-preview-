import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * « RELANCER LA PRISE DE BRIEF » — le geste du manque B (30/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NULLE PART AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * `shouldRelaunch` est la SEULE porte : ce composant ne recalcule rien (voir
 * `accountRelaunchBrief.ts`) et ne rend RIEN quand elle vaut `false` — pas un
 * état grisé, pas une icône désactivée. Un geste sans condition est un geste
 * qu'on apprend à ignorer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ ÇA MÈNE, ET POURQUOI CET ONGLET
 * ─────────────────────────────────────────────────────────────────────────────
 * Le clic ouvre le dossier du compte sur l'onglet Projets — celui où vivent
 * les opportunités et leur qualification BTMMP — plutôt que « Vue d'ensemble » :
 * le geste demandé est de reprendre la conversation sur CES opportunités-là, pas
 * de rouvrir le dossier au hasard.
 *
 * Même squelette accessible que `AccountNextActionFlag` (bouton réel, la
 * propagation du clic arrêtée pour ne pas aussi ouvrir la ligne, cible tactile
 * agrandie au doigt) — un pictogramme différent (`ClipboardList`, la prise de
 * brief) pour ne pas se lire comme le MÊME contrôle que « aucune prochaine
 * action programmée ».
 */
export function AccountRelaunchBriefFlag({
  accountId,
  companyName,
  shouldRelaunch,
  className,
}: {
  accountId: string
  companyName: string
  shouldRelaunch: boolean
  className?: string
}) {
  const { t } = useTranslation('accounts')
  const navigate = useNavigate()

  if (!shouldRelaunch) return null

  return (
    <button
      type="button"
      data-testid="account-relaunch-brief-flag"
      title={t('list.relaunchBrief.hint')}
      aria-label={t('list.relaunchBrief.aria', { name: companyName })}
      onClick={event => {
        event.stopPropagation()
        navigate({ to: '/accounts/$id', params: { id: accountId }, search: { tab: 'projects' } })
      }}
      className={[
        // Fond à OPACITÉ, composé sur le fond du thème : le texte suit donc
        // `*-soft-text`, jamais la couleur sémantique nue (D79).
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full',
        'bg-[color-mix(in_srgb,var(--bellum-warning-text)_14%,transparent)] px-1.5 py-0',
        'text-xs leading-4 text-[var(--warning-soft-text)]',
        'hover:bg-[color-mix(in_srgb,var(--bellum-warning-text)_22%,transparent)]',
        'pointer-coarse:min-h-11 pointer-coarse:px-3',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ClipboardList className="size-2.5 shrink-0" aria-hidden />
      {t('list.relaunchBrief.flag')}
    </button>
  )
}
