import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'

/**
 * L'EN-TÊTE DE TALENTS — refonte Théo (maquette `c/talents-vivier`, 23/10/2026).
 *
 * La maquette pose un en-tête de page classique : le h1 « Vivier », la phrase
 * qui dit à quoi sert l'écran, et les actions À DROITE (Exporter · Importer ·
 * Ajouter un profil). Le h1 passe toujours par `ScreenIntro` (rôle
 * `pageTitle`, F2-FIX #4332) ; les actions arrivent de la page, qui possède
 * leurs états (dialogue d'ajout, import amorcé par `?importCv=1`).
 *
 * « Demander à Laura » (#2182.15) reste avec elles : `AskLaura`, la primitive
 * partagée (D44 — Laura est une surcouche). Il dépose la question, ne l'envoie
 * jamais.
 *
 * « Chercher un profil » (#2182.14) n'a plus de bouton : la recherche ouvre la
 * barre d'outils, TOUJOURS visible (maquette) — le bouton visait un champ qui
 * pouvait être replié ; il ne l'est plus.
 */
export function VivierIntro({ actions }: { actions?: ReactNode } = {}) {
  const { t } = useTranslation('consultants')
  return (
    <ScreenIntro
      title={t('page.introTitle')}
      titleWithoutName={t('page.introTitleWithoutName')}
      subtitle={t('page.introSubtitle')}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AskLaura question={t('page.askLauraQuestion')} label={t('page.askLaura')} />
          {actions}
        </div>
      }
    />
  )
}
