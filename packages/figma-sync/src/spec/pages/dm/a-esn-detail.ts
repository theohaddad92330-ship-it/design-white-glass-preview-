import type { PageSpec } from '../../types'

/**
 * `/esn/[id]` — fiche ESN : renommer, la fiche partagée (profil rempli par les
 * membres), l'invitation propriétaire (préparée, jamais envoyée sans clic
 * opérateur — #2643.1/.2), membres (ajouter/retirer), invitations en attente.
 *
 * `/esn` (index) redirige vers `/clients?view=esn` depuis la consolidation
 * (#1664) : seule cette fiche de détail reste une route à part entière.
 *
 * Lu dans : `src/app/esn/[id]/page.tsx` → `_components/rename-workspace.tsx`,
 * `esn-profile-panel.tsx`, `owner-invitation-panel.tsx`, `add-member.tsx`,
 * `remove-member-button.tsx`.
 */
export const esnDetailPage: PageSpec = {
  id: 'dm/esn-detail',
  surface: 'dm',
  domain: 'clients',
  route: 'apps/dashboard-manager/src/app/esn/[id]/page.tsx',
  title: 'ESN — détail',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Breadcrumb', props: { items: ['← retour aux ESN'] } },
      { type: 'text', text: 'Wavestone Consulting', style: 'title' },
      {
        type: 'text',
        text: 'Propriétaire j••••@wavestone-consulting.fr · 4 membres',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Renommer l’ESN' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Input', props: { content: { value: 'Wavestone Consulting' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer' } },
              },
            ],
          },
        ],
      },
    ],
    summary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Fiche ESN (profil partagé)' } },
        children: [
          {
            type: 'text',
            text: 'Portée par j••••@wavestone-consulting.fr · version 3 · mise à jour le 18/09/2026.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'outline', content: { label: '9 / 12 faits sur l’entreprise renseignés' } },
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Question', 'Portée', 'État'],
                rows: [
                  ['Nom de l’ESN', 'entreprise', 'Renseignée'],
                  ['Nombre de consultants', 'entreprise', 'Renseignée'],
                  ['Taille de l’équipe commerciale', 'entreprise', 'Renseignée'],
                  ['Domaines d’expertise', 'entreprise', 'Renseignée'],
                  ['Positionnement', 'entreprise', 'Renseignée'],
                  ['Secteurs visés', 'entreprise', 'Renseignée'],
                  ['Types de comptes ciblés', 'entreprise', 'Vide'],
                  ['Modèle de staffing', 'entreprise', 'Renseignée'],
                  ['Zones géographiques', 'entreprise', 'Renseignée'],
                  ['Principal frein commercial', 'personnelle', 'Renseignée'],
                  ['Domaines d’offre', 'personnelle', 'Vide'],
                  ['Placement en CDI chez le client', 'personnelle', 'Renseignée'],
                ],
              },
            },
          },
          {
            type: 'text',
            text: 'Un associé qui rejoint cet espace hérite des faits sur l’entreprise et n’a plus à répondre qu’aux questions personnelles.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Invitation propriétaire' } },
        children: [
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'secondary', content: { label: 'Préparé, pas encore envoyé' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Envoyer' } },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Membres' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'end',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Ajouter un membre (userId)', placeholder: 'uuid du user' } },
              },
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'sm',
                  content: { label: 'Rôle', value: 'Membre' },
                  items: ['Membre', 'Admin', 'Propriétaire'],
                },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Email', 'Nom', 'Rôle', 'Depuis', ''],
                rows: [
                  ['j••••@wavestone-consulting.fr', 'Julie Ferrand', 'propriétaire', '02/01/2026', ''],
                  ['m••••@wavestone-consulting.fr', 'Marc Ollivier', 'membre', '14/02/2026', 'Retirer'],
                  ['s••••@wavestone-consulting.fr', 'Sophie Nguyen', 'membre', '03/04/2026', 'Retirer'],
                  ['t••••@wavestone-consulting.fr', 'Thomas Reboul', 'membre', '20/06/2026', 'Retirer'],
                ],
              },
            },
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Invitations en attente' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Email', 'Rôle', 'Statut', 'Expire le', 'Envoyée le'],
                rows: [
                  ['l••••@wavestone-consulting.fr', 'membre', 'en attente', '25/10/2026', '25/09/2026'],
                  ['p••••@wavestone-consulting.fr', 'membre', 'en attente', '01/11/2026', '02/10/2026'],
                ],
              },
            },
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'ESN indisponible', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le champ « Ajouter un membre » prend le userId (UUID) de la personne, saisi à la main — jamais un e-mail : il n’y a pas de recherche par adresse, c’est un identifiant technique qu’on colle depuis la fiche utilisateur. Le rôle (Membre / Admin / Propriétaire) se choisit dans le sélecteur juste à côté, par défaut « Membre ».',
      source: 'apps/dashboard-manager/src/app/esn/[id]/_components/add-member.tsx:9',
    },
    {
      kind: 'decision',
      text: 'Console neuve sur API ancienne : quand le champ `esnProfile` est absent, la fiche ESN dit « Indisponible sur cette version de l’API. » plutôt que de rendre « aucune fiche » — annoncer une panne au repos serait mentir sur l’absence de données.',
      source: 'apps/dashboard-manager/src/app/esn/[id]/_components/esn-profile-panel.tsx:47',
    },
    {
      kind: 'decision',
      text: 'Espace tout juste créé, propriétaire pas encore passé par son onboarding : la fiche ESN dit « Aucune fiche partagée pour cet espace. Chaque membre repasse donc l’intégralité du questionnaire — c’est le propriétaire qui la crée en répondant à son onboarding. »',
      source: 'apps/dashboard-manager/src/app/esn/[id]/_components/esn-profile-panel.tsx:59',
    },
    {
      kind: 'decision',
      text: 'L’invitation propriétaire a cinq états réels, un seul dessiné ici (« Préparé, pas encore envoyé ») : « Indisponible sur cette version de l’API. » (console neuve sur API ancienne) ; « Aucune invitation à préparer : le compte du propriétaire existait déjà à la création de cet espace. » (siège provisionné sur un compte déjà existant) ; un échec de génération du lien en rouge (« Le lien de définition de mot de passe n’a pas pu être engendré (raison). Réessayez depuis la fiche utilisateur. ») ; et « Envoyé » (badge + « Le {date} par {opérateur} · {n} envois au total. » + bouton « Relancer », le même geste qu’« Envoyer », #2643.3).',
      source: 'apps/dashboard-manager/src/app/esn/[id]/_components/owner-invitation-panel.tsx:29',
    },
    {
      kind: 'decision',
      text: '« Préparé, pas encore envoyé » : l’invitation propriétaire ne part JAMAIS seule — seul le clic « Envoyer »/« Relancer » la déclenche (#2643.1/.2/.3). Un geste déclaratif n’est jamais confondu avec un envoi vérifié.',
      source: 'apps/dashboard-manager/src/lib/owner-invitation-state.ts:28',
    },
    {
      kind: 'decision',
      text: 'Renommer redonne un retour d’état sous le champ : « Enregistrement… » sur le bouton pendant l’appel, « ✓ renommé » en succès, « ✗ échec » en erreur — le bouton reste désactivé tant que le nom n’a pas changé ou que l’appel est en cours.',
      source: 'apps/dashboard-manager/src/app/esn/[id]/_components/rename-workspace.tsx:46',
    },
    {
      kind: 'decision',
      text: 'Retirer un membre demande une confirmation avant d’écrire (`window.confirm`, redessinée en confirmation RUX-23 — voir `dm/overlays/retirer-membre`) : aucune suppression ne part sur un simple clic.',
      source: 'apps/dashboard-manager/src/app/esn/[id]/_components/remove-member-button.tsx:16',
    },
    {
      kind: 'decision',
      text: 'Tableau « Membres » vide : « Aucun membre. » (dans une liste, une absence ne fait aucune ligne — ce texte remplace le tableau, il n’en devient pas une ligne).',
      source: 'apps/dashboard-manager/src/app/esn/[id]/page.tsx:64',
    },
    {
      kind: 'decision',
      text: 'Tableau « Invitations en attente » vide : « Aucune invitation en attente. » (même règle : pas de ligne vide, le texte remplace le tableau).',
      source: 'apps/dashboard-manager/src/app/esn/[id]/page.tsx:113',
    },
    {
      kind: 'decision',
      text: 'Le propriétaire de l’ESN n’a pas de bouton « Retirer » dans le tableau des membres — remplacé par la mention « propriétaire », dérivée de `ownerUserId` : retirer le seul propriétaire laisserait l’espace sans responsable.',
      source: 'apps/dashboard-manager/src/lib/admin.ts:60',
    },
    {
      kind: 'decision',
      text: 'L’adresse d’un membre ou d’un invité s’affiche EN CLAIR (#3596, c87 — e-mails, téléphones et noms toujours en clair), par le composant dédié `EmailEnClair`.',
      source: 'apps/dashboard-manager/src/app/_components/email-en-clair.tsx:10',
    },
    {
      kind: 'decision',
      text: '`/esn` (sans id) redirige vers `/clients?view=esn` depuis la consolidation (#1664) — seule cette fiche de détail reste une route indépendante, gardée pour les signets et le lien « retour ».',
      source: 'apps/dashboard-manager/src/app/esn/page.tsx:9',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 le panneau latéral (invitations en attente) passe sous le tableau des membres plutôt qu’à côté, faute de place pour deux colonnes lisibles ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le panneau latéral resterait ouvert en permanence à côté du contenu principal, gagnant une vue simultanée sans étirer le tableau.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : les sections de cette fiche restent empilées verticalement à toutes les largeurs (grille CSS en colonne unique, sans media query dédiée), pas de vraie bascule maître-détail mesurée aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
  ],
}
