import type { Block, UxNote } from '../../types'

/**
 * Blocs et notes partagés par les 17 pages du site (`apps/website`) : le
 * header et le footer sont IDENTIQUES sur toutes les pages (brief), donc un
 * seul endroit les décrit (GA-26) plutôt que dix-sept copies.
 *
 * Décision de migration (RUX-01 à 04, `docs/revue-ux.md` T1/§4, Q6) : le site
 * (violet hsl(263 70% 50%), sombre seul, Tailwind « nu ») diverge des tokens
 * de l'app (violet #5b3ee8, neutres zinc, Geist, clair ET sombre). Chaque
 * maquette de ce dossier utilise UNIQUEMENT les tokens/composants du contrat
 * partagé — RUX-01 (une seule source de tokens), RUX-02 (Geist pour le texte
 * courant, Clash Display réservé au SEUL titre du hero ≥ 36 px) et RUX-03
 * (parité clair/sombre, D79) sont donc DÉJÀ tenus par construction dans cette
 * maquette ; `TOKENS_THEME_NOTE` ci-dessous le documente sur chaque page. La
 * migration réelle du site (code) est notée en `uxNotes` `ecart`, jamais
 * recopiée dans la maquette.
 */

const NAV_LINKS = ['Produit', "Cas d'usage", 'Tarifs', 'À propos']

/** Le header (`Navbar.tsx`) : logo, liens, connexion / création de compte. */
export const SITE_NAV: Block[] = [
  {
    type: 'stack',
    direction: 'row',
    gap: '6',
    align: 'center',
    justify: 'between',
    children: [
      { type: 'component', component: 'BrandMark', props: { size: 'md' } },
      // Des liens TEXTE (Navbar.tsx), jamais des pastilles d'onglets (défaut D, 25/09/2026).
      {
        type: 'stack',
        direction: 'row',
        gap: '8',
        align: 'center',
        children: NAV_LINKS.map(
          (label): Block => ({ type: 'text', text: label, style: 'label', color: 'text/secondary' }),
        ),
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Se connecter' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', content: { label: 'Créer mon compte' } },
          },
        ],
      },
    ],
  },
]

const FOOTER_COLUMN = (title: string, items: string[]): Block => ({
  type: 'stack',
  direction: 'column',
  gap: '3',
  children: [
    { type: 'text', text: title, style: 'label', color: 'text/muted' },
    ...items.map((label): Block => ({ type: 'text', text: label, style: 'body', color: 'text/secondary' })),
  ],
})

/** Le footer (`Footer.tsx`) : marque, trois colonnes de liens, mentions. */
export const SITE_FOOTER: Block[] = [
  {
    type: 'grid',
    columns: 4,
    columnsMobile: 1,
    gap: '8',
    children: [
      {
        type: 'stack',
        direction: 'column',
        gap: '4',
        children: [
          { type: 'component', component: 'BrandMark', props: { size: 'md' } },
          {
            type: 'text',
            text: "L'IA qui transforme la prospection ESN en dossiers prêts à l'action.",
            style: 'body',
            color: 'text/muted',
          },
        ],
      },
      FOOTER_COLUMN('Produit', ["Cas d'usage", 'Tarifs', 'Garde-fous', 'Beta', 'Webinaire', 'Démo']),
      FOOTER_COLUMN('Entreprise', ['À propos', 'Se connecter', 'Créer mon compte']),
      FOOTER_COLUMN('Légal', [
        'Mentions légales',
        'Confidentialité',
        'CGU',
        'CGV',
        'Cookies',
        'Traitement des données',
      ]),
    ],
  },
  {
    type: 'stack',
    direction: 'row',
    gap: '4',
    justify: 'between',
    align: 'center',
    children: [
      { type: 'text', text: '© 2026 BellumAI. Tous droits réservés.', style: 'caption', color: 'text/muted' },
      { type: 'text', text: 'Statut · LinkedIn', style: 'caption', color: 'text/muted' },
    ],
  },
]

const planCard = (
  name: string,
  price: string,
  per: string,
  sub: string,
  cta: string,
  features: string[],
  badge?: string,
): Block => ({
  type: 'component',
  component: 'Card',
  props: {
    content: { title: badge ? `${name} · ${badge}` : `${name} — ${price}${per ? ` ${per}` : ''}`, description: sub },
  },
  children: [
    { type: 'component', component: 'Button', props: { variant: 'default', content: { label: cta } } },
    ...features.map((f): Block => ({ type: 'text', text: f, style: 'caption', color: 'text/secondary' })),
  ],
})

/**
 * RUX-43 (docs/revue-ux.md §2 P5) : « L'aperçu tarifaire de l'accueil réutilise le composant de
 * /tarifs (bascule comprise) : un prix ne s'affiche que d'une façon. » `/pricing` et l'accueil
 * appellent la MÊME fonction — trois forfaits, jamais recopiés (GA-26) — au lieu de deux versions
 * du même prix qui peuvent diverger (l'accueil n'affichait hier que le prix mensuel, sans bascule).
 */
export function pricingPlansSection(): Block[] {
  return [
    {
      type: 'stack',
      direction: 'row',
      gap: '3',
      align: 'center',
      children: [
        { type: 'component', component: 'ModeTabs', props: { items: ['Mensuel', 'Annuel'] } },
        { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: '−20 %' } } },
      ],
    },
    {
      // RUX-30 (docs/revue-ux.md T16) : trois forfaits, trois colonnes — jamais une grille à 4
      // colonnes qui laisse un emplacement vide dès 1280 px (`minmax` avec un nombre de colonnes
      // égal au nombre d'éléments, jamais plus).
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        planCard(
          'Free',
          '0 €',
          '',
          'Pour tester BellumAI sans risque, sur des dossiers simulés déjà préparés.',
          'Créer mon compte',
          [
            'Accès à 5 comptes de démonstration',
            'Données simulées sur contacts, signaux, besoins et actions',
            'Vue cockpit + comptes + contacts + copilote en mode lecture',
            'Aucun enrichissement, aucune automatisation, aucun export',
          ],
        ),
        planCard(
          'Growth',
          '199 €',
          'HT / mois',
          'Le produit entier, pour un commercial : toutes les fonctions ouvertes, 250 crédits par mois.',
          'Créer mon compte',
          [
            '1 utilisateur',
            '250 crédits / mois',
            'Toutes les fonctions, sans exception',
            'Dossier de compte complet : entités, décideurs, organigramme',
            "Signaux d'achat, projets détectés et comptes comparables",
            "Messages, angles d'accroche et séquences de relance",
            "Plan d'action commercial et exports PDF / CSV",
            'Copilote IA avec historique, notes et contexte commercial',
            "Besoins, vivier et pilotage d'équipe",
            'Intégrations : messagerie, agenda, CRM',
            'À partir de deux utilisateurs : offre Entreprise',
          ],
          'Le plus choisi',
        ),
        planCard(
          'Entreprise',
          'Sur devis',
          '',
          'Pour les ESN qui veulent piloter plusieurs commerciaux, mutualiser les crédits et industrialiser leur revenue engine.',
          'Parler à l’équipe',
          [
            '3 à 5 utilisateurs et plus',
            'Crédits mutualisés et enveloppes adaptées',
            'Supervision manager, visibilité sur les actions et routines',
            "Partage de dossiers, notes, plans d'action et bibliothèque commune",
            'Workflows, automatisations et accompagnement au déploiement',
          ],
          'Pour managers & équipes commerciales',
        ),
      ],
    },
  ]
}

/**
 * RUX-06 (`docs/revue-ux.md` §4, T2) : le header basculait en menu hamburger sous
 * `xl` (1280 px, `Navbar.tsx:52` et `:83`) au lieu de la borne unique 768 px
 * (GA-28/29) — entre 768 et 1279, un écran de TABLETTE affichait un menu mobile
 * alors que la largeur était celle d'un desktop. La CIBLE : une seule borne pour
 * les trois surfaces, 768 px ; de 768 à 1279 les liens principaux restent
 * visibles (`NAV_LINKS` n'en compte que 4, sous la limite de 5 — pas de « Plus »
 * nécessaire ici). Note par défaut de toute page du site : le header est
 * partagé, la décision l'est aussi.
 */
export const HEADER_BREAKPOINT_NOTE: UxNote = {
  kind: 'decision',
  text: 'RUX-06 : le header bascule en menu hamburger sous 768 px, la même borne unique que l’app et le DM (GA-28) — plus de menu mobile affiché sur un écran de tablette (768–1279) alors que la largeur est celle d’un bureau. De 768 à 1279, les liens principaux (4, sous la limite de 5) restent visibles.',
  source: 'apps/website/src/components/Navbar.tsx:52',
}

/**
 * RUX-01 à 04 (`docs/revue-ux.md` T1/§4, Q6) : une source de tokens, une police, le thème clair sur
 * le site. Posée sur chaque page du site (voir l’en-tête de ce fichier) ; `site/home` la détaille
 * pour le hero (Clash Display, dégradé décoratif).
 */
export const TOKENS_THEME_NOTE: UxNote = {
  kind: 'decision',
  text: 'RUX-01 à 04 : cette maquette utilise UNIQUEMENT les tokens du contrat partagé (`packages/figma-sync/src/spec/token-names.generated.ts`, dérivé de `apps/web/src/styles/tokens.css`) — le violet, les neutres, les deux thèmes et Geist sont donc déjà ceux de l’app, jamais le violet chaud propre au site ni son thème sombre codé en dur. RUX-01 : une seule source de tokens (le site et le DM gardent des alias locaux le temps de migrer, puis les suppriment). RUX-02 : Geist pour le texte courant des trois surfaces ; Clash Display reste autorisé UNIQUEMENT pour le titre du hero (`text/display`, ≥ 36 px). RUX-03 : le site gagne le thème clair, suit la préférence système comme le DM — la parité clair/sombre (D79) est une promesse, et le site est la première qu’un prospect lit. RUX-04 : aucun dégradé de marque sur un bouton ni sur du texte, nulle part.',
  source: 'apps/website/src/app/globals.css:1',
}

const RESPONSIVE_PREAMBLE =
  'Responsive : priorité bureau puis mobile, sur 360, 390, 768, 1024, 1280, 1440, 1920, 2560 et 3440. ' +
  'Bureau (1024-1920) : grilles de section 3 → 2 colonnes selon la largeur, contenu centré et borné ' +
  '(nav max 1280 px, sections max 1152-1200 px), fond de section en pleine largeur derrière. ' +
  'Tablette (768-1194) : les grilles de section passent déjà à 2 colonnes. ' +
  'Mobile (360-767) : une seule colonne, menu du header en tiroir sous le logo. ' +
  'Très grands écrans (1920-3440) : le contenu reste borné et centré, jamais de texte ni de grille étirés ' +
  '— seul le fond de section (dégradés `SiteLayout.tsx`) suit la largeur complète.'

/** Note `decision` Responsive commune, avec le détail propre à la page et sa source. */
export function responsiveNote(detail: string, source: `${string}:${number}`): UxNote {
  return { kind: 'decision', text: `${RESPONSIVE_PREAMBLE} ${detail}`, source }
}
