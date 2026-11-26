import type { PageSpec } from '../../types'

/**
 * /share/$slug — lien public, sans compte, vers un dossier de conquête réduit
 * (fiche d'entreprise, score de priorité, contacts). Le destinataire sait
 * EXPLICITEMENT que le dossier a été réduit (chiffre d'affaires et coordonnées
 * peuvent être masqués) plutôt que de deviner une absence.
 *
 * Aucun gabarit n'était nommé pour cette route dans le périmètre du lot ;
 * `detail` (header, summary, primary) est le plus proche de l'écran réel :
 * une fiche d'entité unique, en lecture seule.
 *
 * Lu dans : `apps/web/src/routes/share/$slug.tsx` → `PublicSharePage.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/share.json`.
 */
export const sharePage: PageSpec = {
  id: 'app/share',
  surface: 'app',
  domain: 'share',
  route: 'apps/web/src/routes/share/$slug.tsx',
  title: 'Dossier partagé',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Compte exemple', style: 'title' },
      { type: 'text', text: 'Dossier partagé · expire le —', style: 'caption', color: 'text/muted' },
    ],
    summary: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 2,
        gap: '4',
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'Secteur', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Employés', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'CA', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Adresse', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Site', value: '—' } } },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          content: {
            description:
              'Certaines informations (chiffre d’affaires, coordonnées des contacts) ne sont pas incluses sur ce lien partagé.',
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Score de priorité' } },
        children: [
          { type: 'placeholder', kind: 'chart', label: 'Score de priorité et sa justification', height: 'sm' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Contacts (—)' } },
        children: [
          {
            type: 'grid',
            columns: 2,
            columnsMobile: 1,
            gap: '3',
            children: [
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Contact exemple 1', description: 'Fonction exemple' } },
                children: [{ type: 'text', text: '—@—.— · —', style: 'caption', color: 'text/muted' }],
              },
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Contact exemple 2', description: 'Fonction exemple' } },
                children: [{ type: 'text', text: '—@—.— · —', style: 'caption', color: 'text/muted' }],
              },
            ],
          },
        ],
      },
    ],
    footer: [
      { type: 'text', text: 'Lien valable jusqu’au —', style: 'caption', color: 'text/muted' },
      { type: 'component', component: 'BrandMark', props: { size: 'sm' } },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Page introuvable',
            description: 'Cette adresse ne correspond à aucun contenu partagé. Vérifie le lien et réessaie.',
          },
        },
      },
      { type: 'component', component: 'Button', props: { content: { label: 'Découvrir BellumAI' } } },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Chargement et 404 affichent la marque du PRODUIT et jamais celle du dernier espace vu : à ces deux instants, on ne sait pas encore de quel espace vient le lien — deviner ferait clignoter l’entête ou servirait une marque qui n’est pas la bonne.',
      source: 'apps/web/src/features/share/view/PublicSharePage.tsx:170',
    },
    {
      kind: 'decision',
      text: 'Une information masquée sur le lien public se dit explicitement (« ne sont pas incluses sur ce lien partagé ») plutôt que de laisser deviner un manque — la même doctrine que « non mesuré n’est jamais 0 », appliquée ici à « non montré » plutôt qu’à « non mesuré ».',
      source: 'apps/web/src/features/share/view/PublicSharePage.tsx:85',
    },
    {
      kind: 'ecart',
      text: 'Aucun gabarit n’était assigné à cette route par le brief de ce lot — choix `detail` motivé par la structure réelle (une fiche d’entité en lecture seule). Un autre lot pourrait légitimement choisir `marketing` étant donné l’absence de compte et le pied de page « Propulsé par ».',
      source: 'apps/web/src/features/share/view/PublicSharePage.tsx:32',
    },
    {
      kind: 'decision',
      text: 'Responsive : la grille de faits (Secteur, Employés, CA…) passe de 2 colonnes sous 640 px à 3 dès `sm` (640 px) ; la grille de contacts (2 colonnes) reste à 1 sous 640 px. Le corps de page est borné à `max-w-4xl` de 768 à 1920 px. Au-delà (2560, 3440), on n’étire jamais ce contenu : la maquette cible un espace neutre plus large de chaque côté, jamais une fiche d’entreprise à pleine largeur d’écran.',
      source: 'apps/web/src/features/share/view/PublicSharePage.tsx:50',
    },
  ],
}
