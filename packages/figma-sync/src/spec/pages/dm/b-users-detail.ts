import type { PageSpec } from '../../types'
import { GAIN_ASIDE, responsiveDecision, sectionCard } from './_shared'

/**
 * /users/[userId] — la fiche complète d'un utilisateur : identité, offre et
 * crédits, statut du compte, ESN et rôles, actions de sécurité (reset,
 * créditer, usurper, supprimer). Page qui MUTE la donnée qu'elle affiche.
 *
 * Lu dans : `apps/dashboard-manager/src/app/users/[userId]/page.tsx` →
 * `_components/{reset-link,grant-credits,delete-user,impersonate}.tsx`.
 */
export const dmUsersDetailPage: PageSpec = {
  id: 'dm/users-detail',
  surface: 'dm',
  domain: 'users',
  route: 'apps/dashboard-manager/src/app/users/[userId]/page.tsx',
  title: 'Fiche utilisateur',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: '← retour aux utilisateurs' } },
      },
      { type: 'text', text: 'Compte exemple', style: 'title' },
      { type: 'text', text: 'email@exemple.fr · inscrit le —', style: 'body', color: 'text/secondary' },
    ],
    summary: [
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'User ID', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Email', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Nom', value: '—' } } },
        ],
      },
    ],
    primary: [
      sectionCard('Offre & crédits', [
        {
          type: 'component',
          component: 'Select',
          props: { size: 'sm', content: { label: 'Plan' }, items: ['Starter', 'Growth', 'Entreprise'] },
        },
        { type: 'component', component: 'DataRow', props: { content: { label: 'Crédits utilisés', value: '— / —' } } },
        {
          type: 'component',
          component: 'DataRow',
          props: { content: { label: 'Dossiers analysés (total)', value: '—' } },
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'secondary', size: 'sm', content: { label: 'Créditer / ajuster' } },
        },
      ]),
      sectionCard('Statut du compte', [
        {
          type: 'stack',
          direction: 'row',
          gap: '2',
          children: [
            {
              type: 'component',
              component: 'Badge',
              props: { variant: 'success', content: { label: 'Email confirmé' } },
            },
            { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'Actif' } } },
          ],
        },
        {
          type: 'component',
          component: 'DataRow',
          props: { content: { label: 'Dernière connexion', value: 'jamais connecté' } },
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'destructive', size: 'sm', content: { label: 'Suspendre le compte' } },
        },
      ]),
      sectionCard('ESN & rôles', [
        {
          type: 'component',
          component: 'Badge',
          props: { variant: 'outline', content: { label: 'ESN exemple · owner · espace actif' } },
        },
      ]),
      sectionCard('Actions de sécurité', [
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'outline', size: 'sm', content: { label: 'Envoyer un lien de réinitialisation' } },
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'outline', size: 'sm', content: { label: 'Usurper (impersonate)' } },
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'destructive', size: 'sm', content: { label: 'Supprimer le compte' } },
        },
      ]),
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Utilisateur indisponible', description: 'Message technique renvoyé tel quel.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Trois états de compte distincts — actif, suspendu, inconnu (magasin d’auth en panne) — jamais un repli qui devine « actif » quand l’auth ne répond pas : le troisième n’offre aucun geste.',
      source: 'apps/dashboard-manager/src/app/users/users.logic.ts:44',
    },
    {
      kind: 'decision',
      text: 'Toute action destructive (suspension, suppression) demande une confirmation qui NOMME la conséquence — ce qui survit, ce qui disparaît — jamais un « êtes-vous sûr ? » générique.',
      source: 'apps/dashboard-manager/src/app/users/_components/suspend-consequence.ts:9',
    },
    {
      kind: 'decision',
      text: 'Usurpation et suppression sont ABSENTES DU DOM sous le seuil « poste de travail » (768 px) — jamais masquées en CSS, qui laisserait le geste atteignable au clavier ou par script. Le DM cible 1280+ : ce gate reste toujours ouvert ici, mais la règle qu’il porte (un geste irréversible ne se déclenche pas depuis un écran étroit) doit survivre si le produit ouvre un jour ces écrans en dessous de 1280.',
      source: 'apps/dashboard-manager/src/ui/PosteDeTravailSeulement.tsx:29',
    },
    responsiveDecision(GAIN_ASIDE),
    {
      kind: 'ecart',
      text: 'Chaque section (`className="card"`) est une pile verticale simple à toute largeur — aucune ne passe en deux colonnes ni ne bascule le panneau latéral à côté du contenu au-delà de 1920 : le fichier ne porte aucun media query.',
      source: 'apps/dashboard-manager/src/ui/PosteDeTravailSeulement.tsx:36',
    },
  ],
}
