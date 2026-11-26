import type { Block, UxNote } from '../../types'

/**
 * Ce qui est IDENTIQUE sur les ~29 pages `/settings/**` : la navigation de
 * section (mêmes groupes, même ordre que `apps/web/src/components/sidebar/
 * items.settings.ts`) et les notes UX transverses (responsive). Un seul
 * endroit (GA-26) : chaque page de ce lot importe ces constantes plutôt que
 * de retaper la nav ou les notes.
 */

/**
 * Slot `sectionNav` du gabarit `settings`. RUX-37 (`docs/revue-ux.md` §4, P3) : QUATRE groupes
 * (`SectionSidebarNav` ne connaît qu'un titre + une liste plate, donc un groupe = un bloc), les
 * mêmes ~28 entrées que l'ancienne barre à deux groupes (`items.settings.ts:33-212`), reclassées
 * par À QUI elles s'adressent plutôt que par « personnel/espace ». Un libellé par objet : « Facturation »
 * (l'abonnement) devient « Abonnement et crédits » (RUX-36, ne se confond plus avec la facturation
 * client de Missions) ; « Équipe » + « Périmètres » deviennent « Équipe et accès » ; « Listes métier »
 * + « Lexique » deviennent « Listes et lexique » ; « Pipe » + « Charge commerciale » deviennent
 * « Pipe et charge ». Les deux groupes réservés aux administrateurs portent un badge « Admin »
 * (`ADMIN_GROUP_BADGE`, posé juste avant leur bloc).
 */
export const SETTINGS_SECTION_NAV: Block[] = [
  {
    type: 'component',
    component: 'SectionSidebarNav',
    props: {
      content: { title: 'Mon compte' },
      items: [
        'Profil',
        'Préférences',
        'Notifications',
        'Sécurité',
        'Mes données',
        'Audit commercial',
        'Mes signalements',
        'Raccourcis clavier',
      ],
    },
  },
  {
    type: 'component',
    component: 'SectionSidebarNav',
    props: {
      content: { title: 'Laura' },
      items: ['Mode', 'Mémoire', 'Connaissances', 'Assistant externe (MCP)', 'Routines'],
    },
  },
  {
    type: 'component',
    component: 'Badge',
    props: { variant: 'outline', content: { label: 'Admin' } },
  },
  {
    type: 'component',
    component: 'SectionSidebarNav',
    props: {
      content: { title: 'Mon espace' },
      items: [
        'Équipe et accès',
        'Règles',
        'Marque',
        'Listes et lexique',
        'Pipe et charge',
        'Finance',
        'Entités juridiques',
        'Journal d’activité',
        'Marché inversé',
      ],
    },
  },
  {
    type: 'component',
    component: 'Badge',
    props: { variant: 'outline', content: { label: 'Admin' } },
  },
  {
    type: 'component',
    component: 'SectionSidebarNav',
    props: {
      content: { title: 'Branchements et abonnement' },
      items: ['Intégrations', 'Import', 'Abonnement et crédits'],
    },
  },
]

/**
 * Note `decision` à poser sur TOUTE page `settings` (addendum Louis 25/09) :
 * ce que chaque taille d'écran doit montrer, du plus étroit (360) au plus
 * large (1920) — le contrat ne connaît que `mobile`/`desktop`, cette note
 * porte l'intention à l'intérieur de `desktop`.
 */
export const RESPONSIVE_DECISION: UxNote = {
  kind: 'decision',
  text: 'Responsive (360→3440), priorité bureau puis mobile : sous 768 px la nav de section devient une LISTE plein écran — un tap ouvre la page, jamais deux colonnes sur 390 (RUX-38, « ‹ Réglages » pour revenir) ; les lignes de réglage (`SettingsRow`) passent en colonne, libellé au-dessus du contrôle. Entre 768 et 1194 (tablette), la nav reste une colonne étroite mais fixe, sans passer en liste. Le panneau latéral (`aside`) n’apparaît qu’à partir de 1280 px, comme `ProfileContextSubPage` le fait déjà pour son sommaire. Au-delà de 1920 (2560, 3440) on n’étire JAMAIS le contenu : la page GAGNE de la place, pas de la largeur — nav de section, réglage et aide contextuelle (`HelpIcon`/description) s’alignent côte à côte dans une troisième colonne, et le texte reste borné à 70 caractères (D81, GA-34).',
  source: 'apps/web/src/features/profile/view/ProfileContextSubPage.tsx:114',
}

/**
 * RUX-37 (`docs/revue-ux.md` §4, P3) : la navigation des ~30 entrées passe de deux groupes
 * (« Personnel », « Espace de travail ») à QUATRE, nommés par À QUI ils s'adressent.
 */
export const SETTINGS_GROUPS_DECISION: UxNote = {
  kind: 'decision',
  text: 'RUX-37 : quatre groupes — Mon compte · Laura · Mon espace (badge « Admin ») · Branchements et abonnement (badge « Admin ») — remplacent « Personnel »/« Espace de travail », qui ne disaient rien de QUI règle quoi. Laura éclatée en trois endroits (« Assistant IA », « Mémoire de Laura » côté Personnel, « Laura — mode par défaut » côté Espace) devient un seul groupe cohérent. « Facturation » (l’abonnement BellumAI) devient « Abonnement et crédits » (RUX-36) pour ne plus se confondre avec la facturation client de Missions.',
  source: 'apps/web/src/components/sidebar/items.settings.ts:35',
}

/**
 * RUX-22 (docs/revue-ux.md T5/T8, addenda au Top 20) : à poser sur toute page `settings` qui
 * comporte un champ de saisie — la validation qui n'attend pas d'être posée sur chaque formulaire
 * une par une (GA-26).
 */
export const VALIDATION_DECISION: UxNote = {
  kind: 'decision',
  text: 'RUX-22 (docs/revue-ux.md T8) : un champ se valide à sa SORTIE (`onBlur`), message d’erreur sous le champ en `soft/danger/text` — jamais un toast pour une erreur de saisie, qui disparaît avant que le regard n’y revienne. Sous 768, `SettingsRow` passe en colonne : le libellé au-dessus du contrôle, jamais à côté (déjà la cible de ce fichier, voir `RESPONSIVE_DECISION`).',
  source: 'apps/web/src/features/settings/view/PreferencesView.tsx:1',
}

/**
 * Écart constaté : rien ne borne la largeur du contenu au-delà de 1920 —
 * `CONTENT_PADDING` ne pose qu'une gouttière (`px-4 md:px-6`), aucun
 * `max-width`. Sur un 2560/3440, le contenu s'étire au lieu de gagner une
 * troisième colonne.
 */
export const RESPONSIVE_ECART_WIDE: UxNote = {
  kind: 'ecart',
  text: 'Aujourd’hui `CONTENT_PADDING` (gouttière seule, pas de `max-width`) laisse le contenu des pages `settings` s’étirer sans borne au-delà de 1920 — aucune troisième colonne, aucun plafond à 70 caractères pour le texte.',
  source: 'apps/web/src/components/page/page-gutter.ts:46',
}

/**
 * Écart constaté : la coque `SettingsPage` n'implémente PAS le patron
 * « liste puis page » sous 768 px — elle empile la sidebar complète
 * (quatorze entrées) au-dessus du contenu, mesurée à 240 px des 500
 * disponibles, coupant « Connecter Salesforce ». Même note sur toutes les
 * pages : une seule coque, un seul écart.
 */
export const RESPONSIVE_ECART_SHELL: UxNote = {
  kind: 'ecart',
  text: 'Aujourd’hui sous 768 px, `SettingsPage` empile la sidebar de réglages COMPLÈTE au-dessus du contenu (quatorze entrées visibles d’un coup) au lieu du patron liste→page de la maquette : mesuré à 240 px des 500 disponibles, le texte s’enroulait tous les trois mots et « Connecter Salesforce » était coupé.',
  source: 'apps/web/src/components/page/SettingsPage.tsx:62',
}

/**
 * Écart constaté : `SettingsRow` n'a aucune règle responsive — le libellé et
 * le contrôle restent côte à côte (`display=flex`, `justify-between`) à
 * TOUTE largeur, y compris 360/390. À ajouter : une colonne sous `md`.
 * Notée seulement sur les pages dont la maquette cite `SettingsRow`.
 */
/**
 * RUX-21 (`docs/revue-ux.md` §4, T8) : DEUX modèles d'enregistrement, et la
 * règle qui choisit — jamais un bouton « Enregistrer » par champ (5 vues du
 * code le faisaient : CommercialLoad, Finance, ReverseMarket, PipelineSla,
 * et le mélange des deux dans ReverseMarketSettingsView).
 */
export const SAVE_MODEL_DECISION: UxNote = {
  kind: 'decision',
  text: 'RUX-21 : bascule/choix unique (`Switch`, `RadioGroup`, `Select`) → enregistrement IMMÉDIAT, indicateur « Enregistré » 2 s, jamais de toast. Saisie de texte/nombre ou groupe de champs liés → UN bouton « Enregistrer » PAR GROUPE, dans le pied de la carte, aligné à droite, inactif tant que rien n’a changé ; « Annuler » à sa gauche remet les valeurs — jamais un bouton par champ. Un groupe modifié non enregistré ouvre un `AlertDialog` à la sortie de la page.',
  source: 'apps/web/src/features/profile/hooks/useAutoSaveProfile.ts:16',
}

export const RESPONSIVE_ECART_ROW: UxNote = {
  kind: 'ecart',
  text: 'Aujourd’hui `SettingsRow` reste toujours en ligne (`display="flex"`, libellé et contrôle côte à côte) — aucune bascule en colonne sous 768 px, contrairement à la maquette (libellé au-dessus du contrôle).',
  source: 'packages/ui/src/molecules/settings-row.tsx:17',
}
