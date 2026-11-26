import { Link } from '@tanstack/react-router'
import { Button } from '@bellum/ui'
import { Upload, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenGuideSlot } from '@/components/shell/ScreenGuideSlot'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'

type Props = {
  /**
   * #2476 — « Ajouter un contact » partage la ligne du h1, jamais une ligne seule au-dessus.
   */
  onAddContact: () => void
  /** Théo B c1-repertoire — « Demander à Laura » vit dans l'en-tête, à gauche des deux gestes (C1.A15). */
  askLaura?: ReactNode
}

/**
 * #2155.10 / #2155.12 / #2155.22 — l'entête de la page Contacts.
 *
 * Le geste empêché : ouvrir Contacts pour chercher de nouvelles personnes sur
 * le marché. La recherche de cette page ne filtre que ce que l'espace connaît
 * déjà (`ContactsToolbar`) ; l'entête le dit, et renvoie vers les deux gestes
 * qui trouvent du neuf — Découvrir, et l'analyse d'une entreprise.
 *
 * #2167.2 — le titre porte le prénom quand il est connu (gabarit
 * `{{firstName}}` interpolé par `ScreenIntro`, cf `useFirstName`) ; sans lui,
 * `introTitleWithoutName` retombe sur la même phrase, jamais un vide ni une
 * virgule orpheline.
 */
export function ContactsIntro({ onAddContact, askLaura }: Props) {
  const { t } = useTranslation('contacts')
  return (
    // Théo B c1-repertoire `.v13-head` : surtitre, titre court et phrase à gauche ; les gestes à droite, l'import en principal.
    <header data-testid="contacts-intro" className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('page.eyebrow')}
        </p>
        <ScreenIntro
          title={t('page.introTitle')}
          titleWithoutName={t('page.introTitleWithoutName')}
          subtitle={t('page.subtitle')}
          guideSlot={false}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* #4654 — « Comment travailler ici ? » sur la rangée des gestes, à gauche ; l'import reste le plus à droite. */}
        <ScreenGuideSlot />
        {askLaura}
        <Button type="button" size="sm" variant="outline" icon={UserPlus} onClick={onAddContact}>
          {t('page.addContact')}
        </Button>
        {/* #2158.7 — même moteur d'import que `/settings/import` : aucune seconde implémentation.
            Théo B c3.R1 — le bouton ouvre « Imports & sources » (`/contacts/imports`), qui mène à ce moteur. */}
        <Button asChild type="button" size="sm" variant="default">
          <Link to="/contacts/imports">
            <Upload className="size-3.5" aria-hidden />
            {t('page.importContacts')}
          </Link>
        </Button>
      </div>
    </header>
  )
}
