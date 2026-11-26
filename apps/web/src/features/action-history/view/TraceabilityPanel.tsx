import { Button, Text } from '@bellum/ui'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PAGE_GUTTER_MX } from '@/components/page/page-gutter'
import { getEvidenceItems, traceabilityIcon } from './actionHistoryPresentation'

/**
 * TRAÇABILITÉ & SÉCURITÉ — une ligne, plus une colonne (#1499).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR MESURE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ce bloc prend beaucoup de largeur alors qu'il contient principalement du
 * contenu pédagogique statique. » C'est exact, et c'était structurel : un
 * `<aside>` de 320 à 340 px, collant, monté À CHAQUE visite, à droite du
 * journal — près d'un cinquième d'un écran de travail, pour trois paragraphes
 * qui ne changent jamais et qu'on a lus une fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN REPLI, ET PAS UN LIEN SEC
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour propose « drawer ou page Sécurité existante ». J'ai VÉRIFIÉ la
 * seconde branche avant de m'en servir : `SecurityView` fait trente-sept lignes
 * et ne dit pas un mot de la journalisation. Y renvoyer aurait donc SUPPRIMÉ
 * ces trois preuves du produit, pas déplacé — un lien qui ne mène pas à ce
 * qu'il promet est pire que le bloc qu'on voulait réduire.
 *
 * Elles restent donc ici, repliées : l'écran gagne la largeur, la promesse de
 * conformité reste lisible, et rien n'est perdu. Le lien vers Sécurité demeure
 * pour ce que cet écran-là couvre réellement.
 */
export function TraceabilityPanel() {
  const { t } = useTranslation('actions')
  const [open, setOpen] = useState(false)
  const Icon = traceabilityIcon

  return (
    <aside
      className={`${PAGE_GUTTER_MX} mb-4 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-2`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--bellum-primary-500)_10%,transparent)] text-[var(--bellum-primary-400)]">
          <Icon className="size-4" aria-hidden />
        </span>
        <Text element="h2" size="sm" weight="semibold">
          {t('panel.compactTitle')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('panel.compactDescription')}
        </Text>
        {/* Le geste porte son état : il commande l'apparition d'une zone, et un
            lecteur d'écran doit pouvoir le savoir sans la voir. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto pointer-coarse:min-h-11"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          {t('panel.compactCta')}
          {open ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          )}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 border-t border-[var(--bellum-border)] pt-3 md:grid-cols-3">
          {getEvidenceItems(t).map(item => (
            <EvidenceItem key={item.title} {...item} />
          ))}
          <a
            href="/settings/security"
            className="inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-semibold text-[var(--bellum-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--bellum-primary-500)_45%,transparent)] md:col-span-3"
          >
            {t('panel.securityLink')}
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </a>
        </div>
      ) : null}
    </aside>
  )
}

function EvidenceItem({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="flex gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--bellum-primary-500)_10%,transparent)]">
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <Text size="sm" weight="semibold">
          {title}
        </Text>
        <Text size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
          {description}
        </Text>
      </div>
    </div>
  )
}
