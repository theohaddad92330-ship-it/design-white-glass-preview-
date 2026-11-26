import type { PageSpec } from '../../types'

/**
 * /expenses/bareme — le barème de frais, LA porte du réglage et la seule
 * (loi 1 du tome 7, GA-26) : plafonds par catégorie, barème kilométrique
 * saisi (jamais pré-rempli), révisions datées et conservées.
 *
 * Lu dans : `apps/web/src/routes/expenses/bareme.tsx` →
 * `ExpensePolicyEditor.tsx` (Théo HT-5, 22/10/2026 : l'éditeur vit désormais dans Réglages › Règles métier › Frais, `/expenses/bareme` redirige ; sélection du barème, base de remboursement, date
 * d’effet, plafonds par catégorie, tarifs kilométriques, historique).
 * Textes de `apps/web/src/i18n/locales/fr/expenses.json` (`policyPage.*`).
 */
export const expensesBaremePage: PageSpec = {
  id: 'app/expenses-bareme',
  surface: 'app',
  domain: 'expenses',
  route: 'apps/web/src/routes/expenses/bareme.tsx',
  title: 'Barème de frais',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour aux notes de frais' } },
      },
      { type: 'text', text: 'Barème de frais', style: 'title' },
      {
        type: 'text',
        text: 'Ce que ton entreprise rembourse, par catégorie et par client. Une catégorie sans plafond n’est pas « conforme » : elle est non vérifiée.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: [
      {
        type: 'component',
        component: 'Select',
        props: { size: 'md', content: { label: 'Quel barème', value: 'Barème par défaut de l’espace' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Nom du barème' } },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Nom du barème', value: 'Barème interne' } },
          },
          {
            type: 'component',
            component: 'Select',
            props: {
              size: 'md',
              content: {
                label: 'Base de remboursement',
                value: 'Au réel — on rembourse le ticket, le plafond sert d’alerte',
              },
            },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Date d’effet' } } },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Plafonds par catégorie',
            description: 'Un champ laissé vide veut dire « non plafonnée » — ce n’est pas un plafond à zéro.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Repas', value: 'Non plafonnée' } },
          },
          { type: 'component', component: 'SettingsRow', props: { content: { label: 'Hôtel', value: '—' } } },
          {
            type: 'component',
            component: 'Switch',
            props: { size: 'default', checked: 'off', content: { label: 'TVA récupérable' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Barème kilométrique',
            description: 'Aucun barème n’est fourni : saisis celui que ton entreprise applique.',
          },
        },
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Puissance fiscale (CV)' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Euros par km' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter un tarif' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Révisions enregistrées',
            description: 'Elles restent : une note de mars continue d’être jugée sous le barème de mars.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Depuis toujours', value: '3 plafonds' } },
          },
        ],
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer le barème' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Le barème n’a pas pu être chargé',
            description:
              'Ce n’est pas « aucun barème » : la lecture a échoué. Réessaie plutôt que d’écrire par-dessus.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le barème par défaut de l’espace ET les barèmes négociés par client vivent tous les deux sur cet écran, jamais sur la fiche d’un compte : un réglage vit à un seul endroit (GA-26), et le symptôme du contraire est « j’ai changé le plafond et ça n’a rien fait » parce qu’on l’avait changé de l’autre côté.',
      source: 'apps/web/src/features/expenses/view/ExpensePolicyEditor.tsx:63',
    },
    {
      kind: 'decision',
      text: 'Une révision est DATÉE et l’histoire reste : enregistrer n’écrase que les entrées à la MÊME date d’effet, les révisions antérieures restent visibles en lecture — sinon relever un plafond en septembre rendrait rétroactivement conformes des notes déjà décidées en mars.',
      source: 'apps/web/src/features/expenses/view/ExpensePolicyEditor.tsx:63',
    },
    {
      kind: 'decision',
      text: 'Aucun tarif kilométrique n’est pré-rempli : un barème recopié de mémoire serait une donnée fictive présentée comme une règle officielle. Tant que rien n’est saisi, une ligne kilométrique reste « non vérifiée » et l’écran le DIT plutôt que de laisser croire au contraire (JAMAIS de donnée fictive).',
      source: 'apps/web/src/features/expenses/view/ExpensePolicyEditor.tsx:63',
    },
    {
      kind: 'decision',
      text: 'Responsive : le formulaire est en une colonne à toute largeur (mobile, tablette 768-1194, desktop 1195-1920) — un barème se lit et se corrige comme un texte, jamais comme un tableau dense. Au-delà de 1920 px (2560, 3440) : le formulaire garde sa largeur de lecture (D81, un réglage n’est pas une liste), l’espace en plus devient de la marge autour de la colonne, jamais des champs plus larges.',
      source: 'apps/web/src/features/expenses/view/ExpensePolicyEditor.tsx:63',
    },
  ],
}
