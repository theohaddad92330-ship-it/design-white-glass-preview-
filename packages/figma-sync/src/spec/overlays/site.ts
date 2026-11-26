import type { OverlaySpec } from '../types'
import { focusNote } from './notes'

/**
 * Les surcouches du SITE (`apps/website`) : le menu mobile, le choix de langue, les deux toasts de la
 * demande de démo. Le widget de discussion de Laura attend (voir `inventory.md`).
 */

const NAVBAR = 'apps/website/src/components/Navbar.tsx'
const DEMO_FORM = 'apps/website/src/features/demo/DemoForm.tsx'

const mobileMenu: OverlaySpec = {
  id: 'site/overlays/menu-mobile',
  surface: 'site',
  kind: 'sheet',
  parent: { page: 'site/home' },
  source: `${NAVBAR}:105`,
  title: 'Menu',
  destructive: false,
  viewports: ['mobile'],
  body: (['Produit', 'Cas d’usage', 'Tarifs', 'À propos'] as const).map(label => ({
    type: 'component' as const,
    component: 'Button' as const,
    props: { variant: 'ghost' as const, content: { label } },
  })),
  actions: [{ label: 'Se connecter' }, { label: 'Demander une démo', variant: 'default' }],
  uxNotes: [
    focusNote(`${NAVBAR}:112`, 'le premier lien'),
    {
      kind: 'ecart',
      text: 'Le burger ouvre un bloc déroulé sous l’entête, sans voile, jusqu’à 1 280 px (`xl:hidden`) : RUX-06 le ramène à la borne unique de 768 px, et le menu devient un panneau (sheet) voilé, liens en boutons pleine largeur.',
      source: `${NAVBAR}:52`,
    },
  ],
}

const languageMenu: OverlaySpec = {
  id: 'site/overlays/langue',
  surface: 'site',
  kind: 'dropdown',
  parent: { page: 'site/home' },
  source: 'apps/website/src/components/LanguageSwitcher.tsx:135',
  title: 'Langue',
  destructive: false,
  viewports: ['desktop', 'mobile'],
  trigger: 'FR',
  items: ['Français', 'English', 'Deutsch', 'Nederlands'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Chaque langue se nomme en elle-même (endonyme) ; la langue active porte `aria-current`.',
      source: 'apps/website/src/components/LanguageSwitcher.tsx:11',
    },
  ],
}

const demoSent: OverlaySpec = {
  id: 'site/overlays/toast-demo-envoyee',
  surface: 'site',
  kind: 'toast',
  parent: { page: 'site/demo' },
  source: `${DEMO_FORM}:95`,
  title: 'Demande envoyée',
  description: 'Nous revenons vers vous très vite.',
  destructive: false,
  viewports: ['desktop', 'mobile'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'En bas à droite en bureau (`SiteLayout`), en haut sous 768 (RUX-25).',
      source: 'apps/website/src/components/SiteLayout.tsx:22',
    },
  ],
}

const demoFailed: OverlaySpec = {
  id: 'site/overlays/toast-demo-echec',
  surface: 'site',
  kind: 'toast',
  parent: { page: 'site/demo' },
  source: `${DEMO_FORM}:98`,
  title: 'L’envoi a échoué',
  description: 'Réessayez ou écrivez-nous à theo@bellum-it.com.',
  destructive: true,
  viewports: ['desktop', 'mobile'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’échec d’ENVOI se dit en toast avec une issue (l’adresse) ; une erreur de saisie s’écrit sous son champ (RUX-22).',
      source: `${DEMO_FORM}:98`,
    },
  ],
}

export const SITE_OVERLAYS: readonly OverlaySpec[] = [mobileMenu, languageMenu, demoSent, demoFailed]
