import { Text, cn } from '@bellum/ui'
import { Target, TrendingUp, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'

type PriorityTone = 'primary' | 'info' | 'success'

export function SiteSidebar() {
  return (
    <aside className="flex w-full min-w-0 flex-col gap-4">
      <SitePriorityCard />
    </aside>
  )
}

/**
 * #1883 — « rendre cet élément replié par défaut car il prend trop de place sur
 * le tableau principal ».
 *
 * #3451 (retour bêta, 30/09/2026) — Louis, en recette : « mets le en dessous
 * de la carte sur toute la largeur, je ne le veux plus sur cette ligne ». La
 * carte quitte donc sa colonne de 320 px (`SitesFranceCard`) pour une ligne à
 * elle, en pleine largeur — repliée par défaut, elle ne pousse le tableau vers
 * le bas que si on l'ouvre. Chaque description (`PriorityReason`) reste
 * bornée à `max-w-[70ch]` (posé par `Text` par défaut, GA-34) : la largeur
 * pleine profite au CONTENEUR, pas à la ligne de texte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CELUI-LÀ SE REPLIE ENTIÈREMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 11/09/2026 : 320 × 637 px dans une fenêtre de 861 px de haut, soit
 * un rail entier pour de la MÉTHODE — trois raisons génériques et un
 * paragraphe d'explication, identiques d'un compte à l'autre. À côté, la carte
 * et le tableau portent les faits de CE dossier. C'est exactement le partage
 * que la règle demande : ouvert = ce qui appelle une action, replié = le reste.
 *
 * Aucun chiffre ne reste orphelin à la fermeture : cette carte n'en porte
 * aucun, donc rien de ce qui reste à l'écran ne devient faux (la question à se
 * poser devant chaque repli).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL MÉCANISME DE REPLI
 * ─────────────────────────────────────────────────────────────────────────────
 * La carte en portait DÉJÀ un, à elle : un `useState` et un lien « Plus /
 * Moins » qui cachait un quatrième paragraphe. Le laisser aurait emboîté deux
 * disclosures pour le même geste — et « un réglage vit à un seul endroit »
 * (GA-26). Le paragraphe est donc remonté dans le contenu déplié : il s'atteint
 * d'un seul clic au lieu de deux, et zéro mot n'a été perdu.
 */
function SitePriorityCard() {
  const { t } = useTranslation('accountSites')

  return (
    <CollapsedSection title={t('sidebar.title')}>
      <div className="space-y-6">
        <PriorityReason
          icon={Target}
          title={t('sidebar.strategic.title')}
          description={t('sidebar.strategic.description')}
          tone="primary"
        />
        <PriorityReason
          icon={TrendingUp}
          title={t('sidebar.growth.title')}
          description={t('sidebar.growth.description')}
          tone="info"
        />
        <PriorityReason
          icon={Users}
          title={t('sidebar.access.title')}
          description={t('sidebar.access.description')}
          tone="success"
        />
        <div className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-3">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('sidebar.details')}
          </Text>
        </div>
      </div>
    </CollapsedSection>
  )
}

function PriorityReason({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  tone: PriorityTone
}) {
  return (
    <div className="flex gap-4">
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', iconToneClass(tone))}>
        <Icon className="size-5" />
      </span>
      <div>
        <Text size="sm" weight="semibold" className={titleToneClass(tone)}>
          {title}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {description}
        </Text>
      </div>
    </div>
  )
}

function iconToneClass(tone: PriorityTone) {
  if (tone === 'primary')
    return 'bg-[var(--bellum-primary-50)] text-[var(--bellum-primary-600)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-500)_16%,transparent)] dark:text-[var(--bellum-primary-300)]'
  if (tone === 'info') return 'bg-[color-mix(in_srgb,var(--bellum-info)_12%,transparent)] text-[var(--info-soft-text)]'
  return 'bg-[color-mix(in_srgb,var(--bellum-success)_12%,transparent)] text-[var(--success-soft-text)]'
}

function titleToneClass(tone: PriorityTone) {
  if (tone === 'primary') return 'text-[var(--bellum-text-accent)]'
  if (tone === 'info') return 'text-[var(--info-soft-text)]'
  return 'text-[var(--success-soft-text)]'
}
