import { Button } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportNeedsDialog } from '../../open-needs/view/ImportNeedsDialog'

/**
 * LES DEUX PORTES DES ÉTATS VIDES DE LA MATIÈRE COMMERCIALE.
 *
 * Elles vivaient dans `portfolio/view/NeedsPage.tsx`, l'écran « Besoins » de
 * l'époque où le produit avait quatre mots pour la même chose. Cet écran a
 * disparu (#1332, 1/9) — sa route redirige vers `/projects` depuis des semaines
 * et plus aucune n'en rendait le composant. Les deux portes, elles, servent
 * toujours à trois endroits : la lentille Pipe, la lentille Portefeuille et
 * l'écran des besoins ouverts.
 *
 * Elles sont donc ici, et pas dans l'un des trois : les réécrire à chaque
 * appelant les ferait diverger à la première retouche — c'est la raison que
 * `OpenNeedsPage` et `ProjectsPage` invoquaient déjà pour les importer depuis
 * un écran qui n'était plus affiché.
 */

/**
 * L'état vide « pour de bon » : la matière commerciale remonte des analyses de
 * comptes, donc le chemin qui l'alimente commence à Découvrir.
 *
 * `<Link>` et non un `onClick` de navigation : ça se tabule, ça s'ouvre dans un
 * onglet, ça s'annonce (GA-35).
 */
export function DiscoverAction() {
  const { t } = useTranslation('projects')
  return (
    <Button asChild className="pointer-coarse:min-h-11">
      <Link to="/discover">{t('emptyState.discoverAction')}</Link>
    </Button>
  )
}

/**
 * #2169.27 — CRÉER UNE PREMIÈRE OPPORTUNITÉ À LA MAIN, à côté de Découvrir.
 * MÊME formulaire que le bouton de la barre d'outils du pipe (`?create=1`,
 * `CreateProjectDialog`, #2711.1) — jamais un second chemin de création
 * (GA-26). Ni compte ni mission pré-remplis : c'est le formulaire qui les
 * demande.
 */
export function CreateProjectAction() {
  const { t } = useTranslation('projects')
  return (
    <Button asChild variant="outline" className="pointer-coarse:min-h-11">
      <Link to="/projects" search={{ create: 1 }}>
        {t('emptyState.createProjectAction')}
      </Link>
    </Button>
  )
}

/**
 * #2173.56 — À CÔTÉ de Découvrir sur le vide « pour de bon » des BESOINS :
 * la matière peut aussi arriver toute prête, en fiches de poste. Seul l'écran
 * « Besoins ouverts » (`OpenNeedsPage.tsx`) ouvrait ce dépôt jusqu'ici — la
 * lentille Portefeuille du même vide (`ProjectsPage.tsx`) n'avait que
 * Découvrir. Même dialogue (`ImportNeedsDialog`, `open-needs/`), jamais
 * réécrit : monté seulement à l'ouverture, comme là-bas (`useAccounts` y lit
 * la session).
 */
export function ImportNeedsAction() {
  const { t } = useTranslation('projects')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setOpen(true)}>
        {t('openNeeds.importNeeds.cta')}
      </Button>
      {open ? <ImportNeedsDialog open onOpenChange={setOpen} /> : null}
    </>
  )
}

/** L'état vide FILTRÉ — un geste, pas une route : la matière est LÀ, derrière
 *  un onglet ou une recherche. Le geste juste est de retirer le filtre, pas de
 *  quitter l'écran. */
export function ClearFiltersAction({ onClear }: { onClear: () => void }) {
  const { t } = useTranslation('projects')
  return (
    <Button type="button" variant="outline" onClick={onClear} className="pointer-coarse:min-h-11">
      {t('emptyState.clearFilters')}
    </Button>
  )
}
