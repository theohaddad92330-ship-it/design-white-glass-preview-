import type { OverlaySpec } from '../types'
import { dataRow, focusNote, heading, nativeConfirm } from './notes'

/**
 * Les surcouches du BACKOFFICE (`apps/dashboard-manager`), en bureau ET sur téléphone (Q7, Louis
 * 25/09/2026 : le DM est un produit mobile) : la recherche globale (palette ⌘K, plein écran sous 768)
 * et les quatre `window.confirm` destructifs, redessinés en confirmations (RUX-23) — en panneau bas
 * pleine largeur sous 768.
 */

const APP = 'apps/dashboard-manager/src/app'
const BOTH = ['desktop', 'mobile'] as const
const CANCEL = { label: 'Annuler' }
const onCancel = (source: `${string}:${number}`) => focusNote(source, '« Annuler »', 'ferme sans rien faire')

const globalSearch: OverlaySpec = {
  id: 'dm/overlays/recherche-globale',
  surface: 'dm',
  kind: 'command',
  parent: { page: 'dm/accueil' },
  source: `${APP}/_components/global-search.tsx:183`,
  title: 'Rechercher',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'SearchInput',
      props: {
        content: { placeholder: 'Un utilisateur, un espace, une analyse, une facture, une page…', value: 'dur' },
      },
    },
    heading('Utilisateurs'),
    dataRow('Julien Durand', 'julien.durand@esn-exemple.fr'),
    heading('Espaces'),
    dataRow('Durance Conseil', '12 sièges'),
    heading('Pages'),
    dataRow('Santé des services', 'Page'),
  ],
  uxNotes: [
    focusNote(`${APP}/_components/global-search.tsx:197`, 'le champ de recherche'),
    {
      kind: 'decision',
      text: 'Résultats groupés par nature (utilisateurs, espaces, analyses, factures, pages) ; ↑/↓ parcourt, Entrée ouvre. C’est le modèle de la palette de l’app (RUX-07).',
      source: `${APP}/_components/global-search.logic.ts:25`,
    },
    {
      kind: 'decision',
      text: 'Sous 768, la recherche s’ouvre depuis la loupe de la barre du haut et occupe TOUT l’écran (`100dvh`) : le clavier virtuel prend la moitié basse, un panneau bas y serait masqué (Q7, 25/09/2026).',
      source: `${APP}/_components/side-rail.tsx:153`,
    },
  ],
}

const removeMember: OverlaySpec = {
  id: 'dm/overlays/retirer-membre',
  surface: 'dm',
  kind: 'confirm',
  parent: { page: 'dm/esn-detail' },
  source: `${APP}/esn/[id]/_components/remove-member-button.tsx:16`,
  title: 'Retirer Julien Durand de cette ESN ?',
  description: 'Cette personne perd l’accès à l’espace de cette ESN.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Retirer le membre', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${APP}/esn/[id]/_components/remove-member-button.tsx:16`),
    nativeConfirm(`${APP}/esn/[id]/_components/remove-member-button.tsx:16`),
    {
      kind: 'ecart',
      text: 'En cas d’échec, le bouton affiche « ✗ erreur » : l’échec se dit en message sous la confirmation, avec sa raison.',
      source: `${APP}/esn/[id]/_components/remove-member-button.tsx:16`,
    },
  ],
}

const deleteBanner: OverlaySpec = {
  id: 'dm/overlays/supprimer-bandeau',
  surface: 'dm',
  kind: 'confirm',
  parent: { page: 'dm/banners' },
  source: `${APP}/banners/_components/banner-card.tsx:76`,
  title: 'Supprimer définitivement ce bandeau ?',
  description: 'Le bandeau n’est plus affiché nulle part et ne se retrouve pas.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Supprimer le bandeau', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${APP}/banners/_components/banner-card.tsx:76`),
    nativeConfirm(`${APP}/banners/_components/banner-card.tsx:76`),
  ],
}

const stopRun: OverlaySpec = {
  id: 'dm/overlays/arreter-run',
  surface: 'dm',
  kind: 'confirm',
  parent: { page: 'dm/monitoring-detail' },
  source: `${APP}/monitoring/_components/stop-button.tsx:32`,
  title: 'Arrêter l’analyse en cours de cet utilisateur ?',
  description: 'Le run en cours s’arrête pour cet utilisateur.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Arrêter le run', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${APP}/monitoring/_components/stop-button.tsx:32`),
    nativeConfirm(`${APP}/monitoring/_components/stop-button.tsx:32`),
  ],
}

const removeJob: OverlaySpec = {
  id: 'dm/overlays/supprimer-job',
  surface: 'dm',
  kind: 'confirm',
  parent: { page: 'dm/queues' },
  source: `${APP}/queues/_components/action-button.tsx:30`,
  title: 'Supprimer le job 4812 (analysis) de la file « analysis » ?',
  description:
    'Il quitte Redis : il ne sera pas exécuté, et sa raison d’échec et sa trace de pile sont perdues. Rien ne le rattrape.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Supprimer le job', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${APP}/queues/_components/action-button.tsx:30`),
    nativeConfirm(`${APP}/queues/_components/action-button.tsx:30`),
    {
      kind: 'decision',
      text: 'La confirmation NOMME la conséquence — quel job, quelle file, ce qui est perdu, que rien ne le rattrape — jamais « Êtes-vous sûr ? ».',
      source: `${APP}/queues/queues.logic.ts:257`,
    },
  ],
}

export const DM_OVERLAYS: readonly OverlaySpec[] = [globalSearch, removeMember, deleteBanner, stopRun, removeJob]
