import {
  BellDot,
  Book,
  Bot,
  Brain,
  Bug,
  ClipboardCheck,
  CreditCard,
  Building2,
  DownloadCloud,
  Gauge,
  Languages,
  Percent,
  Radar,
  Timer,
  UserX,
  Palette,
  Network,
  Plug,
  Repeat,
  SlidersHorizontal,
  ListChecks,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'
import type { SidebarSection } from './items'

export const SETTINGS_SECTIONS: SidebarSection[] = [
  {
    labelKey: 'sections.personal',
    items: [
      { labelKey: 'items.preferences', to: '/settings', icon: Settings2, searchKeys: ['items.shortcuts'] },
      { labelKey: 'items.notifications', to: '/settings/notifications', icon: BellDot },
      { labelKey: 'items.security', to: '/settings/security', icon: Shield },
      // MES DONNÉES (PDF 7 §9.2). La réversibilité était une clause de CGU et
      // un bouton perdu entre la double authentification et la suppression de
      // compte : trois lignes qui parlent de risque, et au milieu la seule qui
      // parle de liberté. C'est un ARGUMENT DE VENTE — il a besoin d'une porte.
      //
      // Ici et pas dans « Espace de travail » : l'export est PERSONNEL, borné à
      // l'utilisateur qui le demande (RGPD art. 15 & 20). Le ranger côté espace
      // laisserait croire qu'il emporte le travail de l'équipe.
      // `searchKeys` : « Imports » et « Export du vivier » n'ont plus d'entrée propre (#4532/#4533) — la recherche des
      // Réglages doit continuer de les trouver, et elle les trouve ICI, sur l'écran qui les porte en onglet et en carte.
      {
        labelKey: 'items.myData',
        to: '/settings/mes-donnees',
        icon: DownloadCloud,
        searchKeys: ['items.import', 'items.vivierExport'],
      },
      // #1960.10 — MES SIGNALEMENTS (décision de Louis du 13/09/2026). Le widget
      // rendait une référence (« Signalement n° 913 ») sans aucun endroit où la
      // suivre : la personne ne savait jamais si ce qu'elle avait remonté était
      // reçu, pris en main ou corrigé.
      //
      // Ici, juste après « Mes données », et pas dans « Espace de travail » : un
      // signalement est PERSONNEL — la page ne liste que ceux de la personne
      // connectée, jamais ceux d'un collègue. L'icône est celle du bouton qui
      // les crée, pour qu'on reconnaisse l'un dans l'autre.
      { labelKey: 'items.myReports', to: '/settings/mes-signalements', icon: Bug },
      // #4535 — « Raccourcis clavier » n'a PLUS d'entrée de menu (défait la PR #1255, 30/08) : la page
      // `/settings/shortcuts` reste, elle ouvre Préférences › Raccourcis ; « Préférences » s'y allume
      // (`settings-nav-active.ts`) et la recherche « raccourcis » y mène (`searchKeys` de Préférences).
    ],
  },
  {
    /* MON ESPACE (maquette `settings-espace`, Théo V22 — Louis 22/10/2026). Cinq entrées là où il y en avait seize :
       Périmètres & sociétés (R2), Règles métier (R3 — Pipeline, Charge, Marché inversé, Frais, Marge, « Ne pas contacter »
       et la grille de qualification y sont des ONGLETS), Catalogues & vocabulaire (R4 — le lexique y est un onglet) et
       Marque & documents (R5). Les adresses `/settings/pipeline`, `commercial-load`, `reverse-market`, `finance`,
       `do-not-contact`, `legal-entities`, `lexicon` et `/expenses/bareme` survivent par redirection (on archive, on ne
       supprime pas) mais ne sont plus des ENTRÉES de la barre : une entrée qui renvoie ailleurs s'allume jamais. */
    labelKey: 'sections.space',
    items: [
      { labelKey: 'items.profile', to: '/settings/profile', icon: User },
      /* #2071 — L'AUDIT COMMERCIAL A BESOIN D'UNE PORTE, PAS D'UNE URL.
         « Voici ce que le produit a compris de ton activité » naît après le
         questionnaire, et le retour le veut « immédiatement après la
         génération » — ce lien-là appartient au parcours d'accueil, qui n'est
         pas dans ce lot. Ici vit la porte DURABLE : celle par laquelle on y
         revient, à côté du profil qui l'alimente et qui le corrige. Sans elle,
         l'écran serait atteignable par aucun chemin — le défaut n°1 de ce
         dépôt, neuf occurrences. */
      { labelKey: 'items.commercialAudit', to: '/settings/profile/audit', icon: ClipboardCheck },
      { labelKey: 'items.team', to: '/settings/team', icon: Users },
      // LES PÉRIMÈTRES DE TRAVAIL (#2005.5) — la fiche d'une BU, d'une agence
      // ou d'une équipe : capacité disponible, objectif du trimestre. La
      // liste, l'entité et la route `PATCH /business-units/:id` existaient
      // sans aucun appelant web. Ici et pas dans Personnel : une fiche de
      // périmètre change ce que le moteur cite pour TOUTE l'équipe qui le
      // porte. PAS `managerOnly` : le serveur ouvre la LECTURE à tout membre
      // (`@WorkspaceRead`), masquer l'entrée fermerait une porte que l'API
      // laisse ouverte — l'ÉCRITURE reste sous `team:manage`, comme côté API.
      { labelKey: 'items.businessUnits', to: '/settings/business-units', icon: Network },
      // #2081.14 — LES RÈGLES D'ESPACE (DÉCISION Louis 19/09/2026) : posées par
      // l'administrateur pour tout l'espace, elles priment sur les réglages
      // individuels. Juste après les Périmètres, dont la première règle règle
      // la visibilité des comptes. PAS `managerOnly` : l'API ouvre la LECTURE à
      // tout membre (qui se voit refuser un export doit pouvoir lire pourquoi) ;
      // le CHANGEMENT reste propriétaire ou administrateur, côté API.
      { labelKey: 'items.workspaceRules', to: '/settings/workspace-rules', icon: ShieldCheck },
      // Les catalogues (BEL-CRM-105) : le vocabulaire de l'espace. Réservé aux
      // gestionnaires, comme le journal — renommer un motif change ce que TOUT
      // LE MONDE voit dans ses sélecteurs.
      { labelKey: 'items.catalogues', to: '/settings/catalogues', icon: ListChecks, managerOnly: true },
      // LA MARQUE DE L'ESPACE (marque blanche, 01/09/2026). Les six colonnes
      // et `PATCH /workspaces/brand` existaient sans qu'aucun clic ne les
      // atteigne — le défaut n°1 du dépôt : du code juste que personne
      // n'appelle. Poser une marque demandait un accès à la base.
      //
      // Ici et pas dans Personnel : le nom, le logo et le domaine changent ce
      // que TOUT LE MONDE voit — et ce que voient les clients de l'espace.
      // `managerOnly`, comme le journal et les catalogues : le serveur exige
      // déjà `owner` ou `admin`, masquer l'entrée ne ferme donc aucune porte
      // que l'API laisserait ouverte, elle évite un refus après coup.
      { labelKey: 'items.branding', to: '/settings/branding', icon: Palette, managerOnly: true },
      /* ─── ADRESSES-ALIAS ─────────────────────────────────────────────────────────────────────────────────────────
         Ces sept écrans ne sont PLUS des entrées de la barre : ils sont des ONGLETS de la page qui les porte
         (`aliasOf`). Ils restent DÉCLARÉS ici parce que cette liste est la source unique de ce que Laura sait ouvrir et
         écrire (`SETTINGS_SCREENS`, `chat_tools.py`, test de synchronisation) et de la recherche des Réglages : « durées
         cibles » ou « marge » doivent toujours mener quelque part. `/settings/<alias>` redirige vers l'onglet. */
      // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
      // concurrentes. « Priorisation commerciale » mêlait DEUX sujets (les
      // recruteurs du marché externe, la charge commerciale) et doublait les
      // deux entrées plus bas. Un seul écran par sujet : le rail liste
      // « Marché inversé » et « Charge commerciale », rien entre les deux.
      // LES SOCIÉTÉS DE L'ESN (D9). La table, l'entité, le module NestJS et ses
      // quatre routes gardées existaient depuis des mois ; `grep -rn
      // "legal_entit" apps/web/src` rendait UNE ligne, et c'était un
      // commentaire. Une ESN à plusieurs structures n'avait donc pour seule
      // réponse que « un espace par société ».
      //
      // Ici et pas dans Personnel : une raison sociale qui facture est un
      // registre d'ESPACE — tout le monde la lit, seul le siège facturation
      // l'écrit. Et PAS `managerOnly` : le serveur ouvre la LECTURE à tous les
      // membres, masquer l'entrée fermerait une porte que l'API laisse ouverte.
      {
        labelKey: 'items.legalEntities',
        to: '/settings/legal-entities',
        aliasOf: '/settings/business-units',
        icon: Building2,
      },
      // #4158.22 — LA LISTE « NE PAS CONTACTER » DE L'ESPACE : contacts et domaines
      // que personne ne sollicite, avec motif et auteur. PAS `managerOnly` : tout
      // membre la lit et propose une entrée ; seul le retrait demande `team:manage`
      // (l'API le re-vérifie).
      {
        labelKey: 'items.doNotContact',
        to: '/settings/do-not-contact',
        aliasOf: '/settings/workspace-rules',
        icon: UserX,
      },
      // LE SEUIL D'ALERTE DE MARGE (#2420.17). `PATCH
      // delivery/finance/margin-threshold` existait sans aucun appelant web :
      // « Seuil d'alerte · non réglé » restait en LECTURE SEULE sur
      // `/pilotage/finance` chez tous les clients. PAS `managerOnly` : la
      // LECTURE reste ouverte à qui peut lire la marge (`finance:read` ou
      // `finance:read:own`) ; l'écran refuse lui-même l'accès à qui n'a
      // aucun des deux, et le formulaire à qui n'a pas `finance:write`.
      {
        labelKey: 'items.marginThreshold',
        to: '/settings/finance',
        aliasOf: '/settings/workspace-rules',
        icon: Percent,
      },
      // Le lexique (D17) : les mots de l'ESN pour les objets du produit. Juste
      // après les Catalogues, qui portent le vocabulaire des LISTES — mêmes
      // gestionnaires, même nature de réglage, et l'un se cherche là où l'autre
      // se trouve. Renommer un objet change ce que TOUT LE MONDE lit.
      {
        labelKey: 'items.lexicon',
        to: '/settings/lexicon',
        aliasOf: '/settings/catalogues',
        icon: Languages,
        managerOnly: true,
      },
      // LES DUREES CIBLES D'ETAPE (PDF 3 §3.5). A cote des Catalogues et du
      // Lexique : memes gestionnaires, meme nature de reglage — changer un
      // seuil change ce que TOUT LE MONDE voit dans la file d'interventions.
      {
        labelKey: 'items.pipelineSla',
        to: '/settings/pipeline',
        aliasOf: '/settings/workspace-rules',
        icon: Timer,
        managerOnly: true,
      },
      // MARCHÉ INVERSÉ (`#2035.10`, 18/09/2026). La lecture existait déjà
      // (`ReverseMarketPage.tsx`) sans aucun réglage : ni activer, ni dire
      // combien de sollicitations l'espace accepte de traiter. `managerOnly`,
      // comme le SLA du pipe juste au-dessus : le serveur exige déjà
      // `team:manage` en écriture, masquer l'entrée n'y ferme aucune porte.
      {
        labelKey: 'items.reverseMarketSettings',
        to: '/settings/reverse-market',
        aliasOf: '/settings/workspace-rules',
        icon: Radar,
        managerOnly: true,
      },
      // CHARGE COMMERCIALE (`#2035.11`, 18/09/2026). Rien n'existait, ni côté
      // IA ni côté produit — deux plafonds sur des colonnes déjà réelles
      // (`accounts.assigned_to`, `project_needs.status`). Même gate.
      {
        labelKey: 'items.commercialLoadSettings',
        to: '/settings/commercial-load',
        aliasOf: '/settings/workspace-rules',
        icon: Gauge,
        managerOnly: true,
      },
    ],
  },
  {
    /* LAURA (maquette `settings-laura`, Théo V22 — Louis 22/10/2026) : Comportement, Mémoire, Documents & références,
       Routines & veilles — une section à part, comme chez Théo, au lieu de quatre entrées perdues parmi les réglages
       personnels et ceux de l'espace. */
    labelKey: 'sections.laura',
    items: [
      // #2451.9 — LAURA, LE MODE PAR DÉFAUT DE L'ESPACE. Juste après les Règles
      // d'espace, dont ce n'en est délibérément PAS une (#2081.14 plafonne leur
      // socle à deux et une règle ne fait que RESTREINDRE) : un réglage qui pose
      // une valeur de repli pour un fil neuf. PAS `managerOnly`, même raison que
      // les Règles d'espace : l'API ouvre la LECTURE à tout membre (savoir dans
      // quel mode part une conversation neuve n'est pas un fait privilégié) ;
      // le CHANGEMENT reste propriétaire ou administrateur, côté API.
      { labelKey: 'items.lauraDefaultMode', to: '/settings/laura-mode', icon: SlidersHorizontal },
      // MÉMOIRE DE LAURA (tome 6 §12.1) — « l'utilisateur voit cette mémoire,
      // en clair, dans un écran dédié, et peut en supprimer n'importe quelle
      // ligne ». Cette entrée EST la moitié de la règle : deux des quatre
      // couches (les préférences, le résumé de conversation) étaient relues à
      // chaque tour par le copilote sans qu'aucun écran ne les montre. Un écran
      // qu'aucun clic n'atteint n'est pas livré — c'est ce que `/actions/
      // sequences` a coûté pendant des mois.
      //
      // Ici et pas ailleurs : c'est PERSONNEL (les préférences et les refus le
      // sont), et ça se cherche à côté de l'assistant, pas dans l'espace de
      // travail.
      { labelKey: 'items.memory', to: '/settings/memory', icon: Brain },
      // Connaissances re-hébergée ici (D1) : documents, templates, playbooks,
      // méthode, données CRM — plus une page autonome.
      { labelKey: 'items.knowledge', to: '/settings/knowledge', icon: Book },
      { labelKey: 'items.routines', to: '/settings/routines', icon: Repeat },
    ],
  },
  {
    labelKey: 'sections.tools',
    items: [
      // INTÉGRATIONS. Elle a vécu ici, puis a été promue entrée de premier
      // niveau (« Outils › Intégrations ») quand deux écrans se contredisaient.
      // La réduction du menu à neuf entrées a supprimé la section « Outils » —
      // et l'a fait disparaître des DEUX portes pendant un déploiement, parce
      // que les onglets de section ne s'affichent pas sur les Réglages, qui ont
      // leur propre barre. Elle revient là où elle a toujours eu sa place : la
      // barre de Réglages EST la sous-navigation de la section.
      { labelKey: 'items.integrations', to: '/integrations', icon: Plug },
      // #4532/#4533 (Louis 24/10/2026) — « Imports » et « Export du vivier » n'ont PLUS d'entrée : ce sont les deux
      // onglets de Mes données (Exports · Imports, ce dernier réservé aux gestionnaires — `MyDataTabs`). Les adresses
      // `/settings/import` et `/settings/vivier-export` redirigent. Revient sur #3950 (page Export du vivier).
      { labelKey: 'items.aiAssistant', to: '/settings/mcp', icon: Bot },
      // Journal d'activité (Théo p.21) — `team:manage` roles only; the nav is
      // gated in SettingsNavbarBody, the page + API enforce the same matrix.
      { labelKey: 'items.activityLog', to: '/settings/activity', icon: ScrollText, managerOnly: true },
      { labelKey: 'items.billing', to: '/billing', icon: CreditCard },
    ],
  },
]
