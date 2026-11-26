import type { OverlaySpec } from '../types'
import { banner, dataRow, focusNote, heading, input, MOBILE_SHEET, paragraph, select, textarea } from './notes'

/**
 * Les surcouches de l'APP (`apps/web`) dont le fichier source est sous `features/[a-l]*` ou
 * `components/` — le reste de l'inventaire (`inventory.md`) après le premier lot (`app.ts`) et le lot
 * « 40 plus utiles » (`app-suite.ts`, `git show origin/feat/figma-sync-overlays-suite`). Chaque
 * surcouche restante a ici sa spec, ou sa raison d'attendre dans `inventory.md` (famille absente du
 * contrat, ou strictement identique à une spec déjà écrite — notée `= id`, jamais dupliquée).
 */

const W = 'apps/web/src/features'
const C = 'apps/web/src/components'
const BOTH = ['desktop', 'mobile'] as const
const CANCEL = { label: 'Annuler' }
const CLOSE = { label: 'Fermer' }

// ─── accounts/gate ─────────────────────────────────────────────────────────

const decidePriority: OverlaySpec = {
  id: 'app/overlays/decider-priorite',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/gate/AccountGateControl.tsx:68`,
  title: 'Décider de la priorité',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Prioriser ce compte' } } },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'ghost', content: { label: 'Écarter avec un motif' } },
    },
  ],
  uxNotes: [
    {
      kind: 'decision',
      text: '« Prioriser » disparaît une fois le compte écarté, plutôt qu’un bouton désactivé qui expliquerait un refus serveur.',
      source: `${W}/accounts/gate/AccountGateControl.tsx:68`,
    },
  ],
}

const parkAccount: OverlaySpec = {
  id: 'app/overlays/ecarter-compte',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/gate/AccountGateControl.tsx:131`,
  title: 'Pourquoi écarter ce compte ?',
  description:
    'Le motif est ce qui évite de reposer la question dans six mois — et de redire non pour une raison qui n’est plus vraie.',
  destructive: false,
  viewports: BOTH,
  body: [textarea('Motif', 'Concurrent installé, pas de budget, hors cible…')],
  actions: [CANCEL, { label: 'Écarter', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/accounts/gate/AccountGateControl.tsx:131`, 'les motifs rapides, puis le champ de motif'),
    {
      kind: 'decision',
      text: 'Écarter n’efface rien — la question redevient ouvrable (« Rouvrir la question ») ; le motif est obligatoire, un bouton bloqué dit pourquoi plutôt qu’un refus serveur silencieux.',
      source: `${W}/accounts/gate/AccountGateControl.tsx:131`,
    },
  ],
}

// ─── accounts/view/account-detail — tabs (contacts, organigramme, plan, partners) ──────────────

const correctContact: OverlaySpec = {
  id: 'app/overlays/corriger-contact',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/contacts/CompactContactRow.tsx:368`,
  title: 'Corriger Camille Martin',
  description: 'Chaque champ corrigé ici est marqué « saisi à la main » : la prochaine analyse ne l’écrasera pas.',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'grid', columns: 2, gap: '3', children: [input('Nom'), input('Fonction')] },
    { type: 'grid', columns: 2, gap: '3', children: [input('E-mail'), input('Téléphone')] },
    { type: 'grid', columns: 2, gap: '3', children: [input('Entité'), input('Profil professionnel')] },
  ],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/contacts/CompactContactRow.tsx:368`, 'le champ « Nom »'),
    {
      kind: 'decision',
      text: 'Édition en place (clic pour éditer), pas un formulaire à valider en bloc — chaque champ corrigé se marque « saisi à la main » séparément.',
      source: `${W}/accounts/view/account-detail/tabs/contacts/CompactContactRow.tsx:368`,
    },
  ],
}

const confrontCrm: OverlaySpec = {
  id: 'app/overlays/confronter-crm',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/contacts/CrmConfrontationDialog.tsx:52`,
  title: 'Confronter avec le CRM',
  description:
    'Ce que ton CRM connaît déjà, comparé à ce que Bellum a trouvé — sur le dernier instantané en base, sans appel au CRM.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph(
      'Une proposition, jamais une fusion automatique — choisis quelle fiche garder. Aucun champ n’est écrasé : une correction faite à la main n’est jamais remplacée.',
    ),
    dataRow('Fiche CRM', 'Camille Martin · camille.martin@exemple.fr'),
    dataRow('Fiche trouvée par Bellum', 'Camille Martin · c.martin@exemple.fr'),
  ],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/contacts/CrmConfrontationDialog.tsx:52`, 'le titre'),
    {
      kind: 'decision',
      text: 'Comparaison en lecture seule, sur le dernier instantané stocké — jamais d’appel live au CRM ni de fusion automatique.',
      source: `${W}/accounts/view/account-detail/tabs/contacts/CrmConfrontationDialog.tsx:52`,
    },
  ],
}

const signalList: OverlaySpec = {
  id: 'app/overlays/liste-signaux',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/evaluation/SignalListCard.tsx:140`,
  title: 'Actions immédiates',
  description: '3 éléments à consulter.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph('Relancer le contact clé après le silence de trois semaines.'),
    paragraph('Vérifier le budget alloué au projet data.'),
    paragraph('Confirmer la date de la prochaine réunion.'),
  ],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/evaluation/SignalListCard.tsx:140`, 'le titre du panneau'),
    {
      kind: 'decision',
      text: 'Même gabarit pour « Actions immédiates » et « Risques » — seul le titre et le contenu changent (`SignalListCard`).',
      source: `${W}/accounts/view/account-detail/tabs/evaluation/SignalListCard.tsx:140`,
    },
  ],
}

const correctOrgChart: OverlaySpec = {
  id: 'app/overlays/corriger-organigramme',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/organigramme/corrections/OrgCorrectionDrawer.tsx:259`,
  title: 'Corriger la fiche de Camille Martin',
  description:
    'Une affirmation, sa raison, sa preuve. Ce que tu écris ici gagne sur ce que l’analyse a trouvé, et reste annulable.',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'FilterChips',
      props: { items: ['Corriger', 'Confirmer', 'Obsolète', 'Pas pertinent', 'Je ne sais pas', 'Ajouter une source'] },
    },
    select('Ce que tu corriges', 'Le titre'),
    input('Ce qui est vrai', 'Ce que tu as lu, mot pour mot'),
    textarea('Pourquoi', 'Ce que tu sais, et d’où tu le tiens.'),
    select('D’où vient la preuve', 'Site officiel'),
    select('Portée', 'Ce compte'),
  ],
  actions: [CLOSE, { label: 'Enregistrer la correction', variant: 'default' }],
  uxNotes: [
    focusNote(
      `${W}/accounts/view/account-detail/tabs/organigramme/corrections/OrgCorrectionDrawer.tsx:259`,
      'le choix du motif',
    ),
    MOBILE_SHEET,
    {
      kind: 'decision',
      text: 'Le champ « Ce qui est vrai » part toujours vide — jamais pré-rempli depuis le graphe : on PROPOSE une correction, on ne présuppose pas la réponse.',
      source: `${W}/accounts/view/account-detail/tabs/organigramme/corrections/OrgCorrectionDrawer.tsx:259`,
    },
  ],
}

const enrichOrgChart: OverlaySpec = {
  id: 'app/overlays/enrichir-organigramme',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/organigramme/EnrichmentPlannerDialog.tsx:134`,
  title: 'Enrichir l’organigramme',
  description: 'Choisis jusqu’où aller. Aucun run ne reçoit tout le compte d’un coup.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph(
      'Enrichir les 25 suivants — Bellum choisit automatiquement les contacts les plus utiles selon ton contexte commercial.',
    ),
    heading('Ou cibler précisément'),
    paragraph('Cette direction · Rôles manquants · Niveau hiérarchique · Plan complet'),
    banner('info', 'Estimation avant confirmation', '18 contacts ciblés · 2 vagues · 6 crédits'),
  ],
  actions: [CANCEL, { label: 'Lancer', variant: 'default' }],
  uxNotes: [
    focusNote(
      `${W}/accounts/view/account-detail/tabs/organigramme/EnrichmentPlannerDialog.tsx:134`,
      'la carte « Enrichir les 25 suivants »',
    ),
    {
      kind: 'decision',
      text: 'Le coût (crédits, vagues, contacts) s’affiche mesuré avant que « Lancer » ne s’active — jamais un clic qui engage des crédits sans le dire.',
      source: `${W}/accounts/view/account-detail/tabs/organigramme/EnrichmentPlannerDialog.tsx:134`,
    },
  ],
}

const dismissOrgContact: OverlaySpec = {
  id: 'app/overlays/menu-ecarter-contact',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/organigramme/OrgContactDismiss.tsx:60`,
  title: 'Ce contact…',
  destructive: false,
  viewports: BOTH,
  trigger: 'Écarter Camille Martin du graphe',
  items: ['N’est plus en poste', 'N’a rien à voir avec ce compte'],
  uxNotes: [],
}

const attackAngleDetail: OverlaySpec = {
  id: 'app/overlays/angle-attaque',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/plan/AttackAnglesSection.tsx:230`,
  title: 'Angle à qualifier',
  description: 'Détail de l’angle d’attaque sélectionné.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Lecture'),
    paragraph('Le renouvellement du contrat cadre approche : une fenêtre pour proposer un audit préalable.'),
    dataRow('Point d’entrée', 'DSI'),
    dataRow('Offre associée', 'Modernisation SI'),
    dataRow('Potentiel', 'Fort'),
  ],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/plan/AttackAnglesSection.tsx:230`, 'le titre de l’angle'),
  ],
}

const attackPlanSummary: OverlaySpec = {
  id: 'app/overlays/plan-attaque',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/plan/PlanAttackSummary.tsx:118`,
  title: 'Plan d’attaque',
  description: 'Lecture complète avant exécution.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Stratégie'),
    paragraph('Entrer par la DSI avec un audit court, avant l’appel d’offres de refonte.'),
    heading('Première action'),
    paragraph('Proposer un point de 30 minutes avec le DSI sur les risques de l’existant.'),
    heading('Pourquoi ?'),
    paragraph('Le contrat actuel arrive à échéance dans quatre mois et aucun concurrent n’est identifié en place.'),
  ],
  uxNotes: [focusNote(`${W}/accounts/view/account-detail/tabs/plan/PlanAttackSummary.tsx:118`, 'le titre du plan')],
}

const flagPlay: OverlaySpec = {
  id: 'app/overlays/menu-signaler-play',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/plan/PlayFeedbackButtons.tsx:83`,
  title: 'Signaler ce play',
  destructive: false,
  viewports: BOTH,
  trigger: 'Signaler',
  items: ['Information fausse', 'Information obsolète'],
  uxNotes: [],
}

const replan: OverlaySpec = {
  id: 'app/overlays/replanifier',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/plan/ReplanDialog.tsx:101`,
  title: 'Re-planifier le plan d’action',
  description:
    'Reconstruit le plan d’action autour d’un angle que TU choisis — même recherche, mêmes contacts, autre stratégie d’approche.',
  destructive: false,
  viewports: BOTH,
  body: [
    select('Angle d’attaque', 'Laisser Bellum décider'),
    select('Vecteur d’entrée (optionnel)', 'Laisser Bellum décider'),
    input('Entité à cibler (optionnel)', 'Un périmètre / une BU pour ancrer le plan'),
    paragraph('Le calcul tourne pendant une à deux minutes et n’est pas débité.'),
  ],
  actions: [CANCEL, { label: 'Re-planifier', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/plan/ReplanDialog.tsx:101`, 'le choix « Angle d’attaque »'),
    {
      kind: 'decision',
      text: 'Gratuit et synchrone (1 à 2 min), à la différence d’une ré-analyse complète — le texte le dit avant le clic.',
      source: `${W}/accounts/view/account-detail/tabs/plan/ReplanDialog.tsx:101`,
    },
  ],
}

const esnSuggestion: OverlaySpec = {
  id: 'app/overlays/suggestion-esn',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/partners/EsnNameField.tsx:69`,
  title: 'Nom de l’ESN à déclarer',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Nom de l’ESN', 'Nom de l’ESN…'),
    paragraph('ESN de notre référentiel : choisis un nom pour le reprendre, ou continue à taper le tien.'),
  ],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Choisir une suggestion REMPLACE la saisie ; le champ reste éditable même si aucune ESN du référentiel ne correspond.',
      source: `${W}/accounts/view/account-detail/tabs/partners/EsnNameField.tsx:69`,
    },
  ],
}

// ─── accounts/view/account-detail — components, sections, veille ──────────

const accountPdfPreview: OverlaySpec = {
  id: 'app/overlays/apercu-pdf-compte',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/AccountPdfPreviewSheet.tsx:40`,
  title: 'Aperçu - Acme Corp',
  description: 'Dossier de conquête généré par Bellum',
  destructive: false,
  viewports: BOTH,
  body: [{ type: 'placeholder', kind: 'image', label: 'Aperçu PDF du dossier de conquête', height: 'lg' }],
  actions: [{ label: 'Télécharger', variant: 'default' }],
  uxNotes: [
    focusNote(
      `${W}/accounts/view/account-detail/components/AccountPdfPreviewSheet.tsx:40`,
      'le bouton « Télécharger »',
    ),
  ],
}

const composerChannelMenu: OverlaySpec = {
  id: 'app/overlays/menu-canal-composition',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/contact-engagement/ComposerDock.tsx:188`,
  title: 'Canal de composition',
  destructive: false,
  viewports: BOTH,
  trigger: 'Email',
  items: ['Email', 'LinkedIn', 'Appel', 'Tâche'],
  uxNotes: [],
}

const contactChannelMenu: OverlaySpec = {
  id: 'app/overlays/menu-canal-contact',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/contact-engagement/ContactChannelMenu.tsx:76`,
  title: 'Canaux disponibles',
  destructive: false,
  viewports: BOTH,
  trigger: 'Contacter',
  items: ['Préparer un email', 'Préparer un message', 'Préparer un appel', 'Compléter les infos manquantes'],
  uxNotes: [
    {
      kind: 'decision',
      text: '« Compléter les infos manquantes » nomme son coût dans le libellé quand il s’agit d’un nouvel essai (« Réessayer quand même (1 crédit) ») — jamais un coût caché derrière un clic.',
      source: `${W}/accounts/view/account-detail/components/contact-engagement/ContactChannelMenu.tsx:76`,
    },
  ],
}

const dueDatePopover: OverlaySpec = {
  id: 'app/overlays/echeance-relance',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/PlanActionItem.tsx:222`,
  title: 'Échéance de relance',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Échéance', 'jj/mm/aaaa'),
    { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Retirer l’échéance' } } },
  ],
  uxNotes: [],
}

const moreActionsMenu: OverlaySpec = {
  id: 'app/overlays/menu-plus-actions',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/AccountDetailMoreActionsMenu.tsx:115`,
  title: 'Plus d’actions',
  destructive: false,
  viewports: BOTH,
  trigger: 'Plus d’actions',
  items: ['Marquer meilleure référence', 'Créer une cible', 'Archiver', 'Détacher', 'Supprimer'],
  uxNotes: [
    {
      kind: 'decision',
      text: '« Supprimer » est le seul item destructif (couleur danger) ; archiver et détacher restent des gestes réversibles, jamais teintés en rouge.',
      source: `${W}/accounts/view/account-detail/components/AccountDetailMoreActionsMenu.tsx:115`,
    },
  ],
}

const collaborationMenu: OverlaySpec = {
  id: 'app/overlays/menu-collaboration',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/collaboration/AccountCollaborationBand.tsx:250`,
  title: 'Attribuer ce compte à',
  destructive: false,
  viewports: BOTH,
  trigger: 'Attribuer',
  items: ['Camille Martin', 'Jean Dupont (toi)', 'Libérer le compte'],
  uxNotes: [
    {
      kind: 'decision',
      text: '« Libérer le compte » reste toujours affiché, même sans attribution en cours — le refus vient du serveur (seul l’actuel propriétaire peut libérer), jamais d’un `if` côté client.',
      source: `${W}/accounts/view/account-detail/collaboration/AccountCollaborationBand.tsx:250`,
    },
  ],
}

const provenancePanel: OverlaySpec = {
  id: 'app/overlays/sources-et-confiance',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/sections/AccountProvenancePanel.tsx:202`,
  title: 'Sources et confiance',
  description: 'Les sources qui ont nourri ce dossier (12) — chacune avec ce qu’elle a apporté et sa fraîcheur.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Registre officiel', 'Firmographie · Données financières'),
    dataRow('Site officiel', 'Positionnement · Offres'),
    dataRow('Source inconnue', 'non identifiée'),
  ],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/sections/AccountProvenancePanel.tsx:202`, 'le titre du panneau'),
  ],
}

const bellumReadDialog: OverlaySpec = {
  id: 'app/overlays/lecture-bellum',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/sections/BellumReadCard.tsx:227`,
  title: 'Lecture Bellum',
  description: 'Synthèse prioritaire issue de l’analyse du compte.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Synthèse'),
    paragraph('Un compte en forte dynamique de transformation SI, sans concurrent identifié en place.'),
    heading('Pourquoi'),
    paragraph('Recrutements techniques en cours, budget IT annoncé en hausse.'),
    heading('Prochaine action'),
    paragraph('Proposer un point de cadrage avec le DSI.'),
  ],
  uxNotes: [focusNote(`${W}/accounts/view/account-detail/tabs/sections/BellumReadCard.tsx:227`, 'le titre')],
}

const competitivePositioning: OverlaySpec = {
  id: 'app/overlays/positionnement-concurrentiel',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/sections/CompetitivePositioningCard.tsx:119`,
  title: 'Positionnement concurrentiel',
  description: 'Arguments recommandés face aux acteurs déjà présents sur le compte.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph('Position recommandée : approche par la valeur, pas par le prix.'),
    heading('Concurrent A'),
    dataRow('Angle de réponse', 'Mettre en avant la proximité et le délai de mobilisation.'),
    dataRow('Différenciation', 'Une équipe dédiée, déjà formée au secteur.'),
  ],
  uxNotes: [
    focusNote(
      `${W}/accounts/view/account-detail/tabs/sections/CompetitivePositioningCard.tsx:119`,
      'le titre du panneau',
    ),
  ],
}

const itImplications: OverlaySpec = {
  id: 'app/overlays/implications-esn',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/sections/ItImplicationsCard.tsx:59`,
  title: 'Implications pour ton ESN',
  description: 'Lecture commerciale des besoins IT identifiés sur ce compte.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph(
      'La migration cloud annoncée ouvre une fenêtre pour une mission d’architecture, puis pour le run applicatif.',
    ),
  ],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/sections/ItImplicationsCard.tsx:59`, 'le titre du panneau'),
  ],
}

const offerRecommendations: OverlaySpec = {
  id: 'app/overlays/offre-recommandee',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/sections/OfferRecommendationsCard.tsx:121`,
  title: 'Offre recommandée',
  description: 'Détail de l’offre et conditions d’intervention proposées.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Durée', '6 mois'),
    dataRow('Équipe', '3 personnes'),
    dataRow('TJM estimé', '650 €'),
    paragraph('Estimations Bellum.'),
    dataRow('Proposition', 'Audit puis accompagnement à la migration cloud.'),
  ],
  uxNotes: [
    focusNote(
      `${W}/accounts/view/account-detail/tabs/sections/OfferRecommendationsCard.tsx:121`,
      'le titre du panneau',
    ),
  ],
}

const whyNowDetail: OverlaySpec = {
  id: 'app/overlays/pourquoi-maintenant',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/sections/WhyNowItemList.tsx:97`,
  title: 'Recrutement de trois profils data',
  description: 'Détails du signal sélectionné.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Source', 'Offre d’emploi publiée'),
    dataRow('Date', 'Il y a 12 jours'),
    paragraph('Trois postes data ouverts simultanément — signal d’un budget déjà voté.'),
  ],
  uxNotes: [focusNote(`${W}/accounts/view/account-detail/tabs/sections/WhyNowItemList.tsx:97`, 'le titre')],
}

const declareLinkedinSignal: OverlaySpec = {
  id: 'app/overlays/declarer-signal-linkedin',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog.tsx:71`,
  title: 'Ajouter un signal depuis LinkedIn',
  description:
    'Colle une URL et/ou le texte d’un post ou d’une annonce LinkedIn que tu as toi-même consulté. Rien n’est jamais collecté automatiquement sur LinkedIn.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('URL du post ou de l’annonce', 'https://www.linkedin.com/…'),
    textarea('Texte copié depuis LinkedIn', 'Colle ici ce que tu as lu…'),
    paragraph('Ni l’un ni l’autre n’est collecté pour toi : tu apportes ce que tu as vu.'),
  ],
  actions: [{ label: 'Déclarer ce signal', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog.tsx:71`, 'le champ URL'),
    {
      kind: 'decision',
      text: 'Jamais de collecte automatique sur LinkedIn (doctrine c79) : seul ce que l’utilisateur colle lui-même entre dans le dossier.',
      source: `${W}/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog.tsx:71`,
    },
  ],
}

const watchSources: OverlaySpec = {
  id: 'app/overlays/sources-consultees',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/veille/WatchSourcesPanel.tsx:82`,
  title: 'Sources consultées',
  description: '5 sources utilisées pour cette veille.',
  destructive: false,
  viewports: BOTH,
  body: [dataRow('Registre officiel', 'il y a 2 jours'), dataRow('Site officiel', 'il y a 5 jours')],
  uxNotes: [focusNote(`${W}/accounts/view/account-detail/tabs/veille/WatchSourcesPanel.tsx:82`, 'le titre du panneau')],
}

// ─── accounts/view/accounts-list ───────────────────────────────────────────

const absorbAccount: OverlaySpec = {
  id: 'app/overlays/rattacher-dossier',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/view/accounts-list/AbsorbAccountDialog.tsx:59`,
  title: 'Rattacher « Klesia » à un autre dossier',
  description: 'Choisis le compte qui reste. L’autre lui est rattaché ; rien n’est supprimé.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Chercher le dossier à garder…'),
    banner(
      'info',
      '« Klesia » devient une entité de « Klesia ADP »',
      '2 contacts rejoignent le dossier gardé. Signaux, projets, plan d’action et historique restent sur ce dossier, qui demeure consultable.',
    ),
  ],
  actions: [CANCEL, { label: 'Rattacher', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/accounts/view/accounts-list/AbsorbAccountDialog.tsx:59`, 'le champ de recherche'),
    {
      kind: 'decision',
      text: 'Le compte absorbé est archivé, jamais supprimé — il reste consultable et porte le nom du dossier auquel il a été rattaché.',
      source: `${W}/accounts/view/accounts-list/AbsorbAccountDialog.tsx:59`,
    },
  ],
}

const marketContextPopover: OverlaySpec = {
  id: 'app/overlays/contexte-marche',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/view/accounts-list/AccountMarketContextButton.tsx:69`,
  title: 'Contexte marché',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Recours à des externes', 'Observé'),
    dataRow('Écosystème ESN', 'Couvert'),
    paragraph('Mémoire marché Bellum.'),
  ],
  uxNotes: [],
}

const rowActionsMenu: OverlaySpec = {
  id: 'app/overlays/menu-actions-compte',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/view/accounts-list/AccountRowActionsMenu.tsx:53`,
  title: 'Actions sur ce compte',
  destructive: false,
  viewports: BOTH,
  trigger: 'Actions sur ce compte',
  items: [
    'Ouvrir le dossier',
    'Partager',
    'Relancer',
    'Demander à Laura',
    'Définir la prochaine action',
    'Attribuer',
    'Déplacer vers',
    'Mettre en veille',
    'Rattacher à un autre dossier…',
    'Archiver le compte',
    'Supprimer le compte',
  ],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Rendu à l’identique par le menu « … » et par le clic droit sur la ligne (`AccountTableRow`) — une seule liste source, jamais deux listes qui divergent.',
      source: `${W}/accounts/view/accounts-list/AccountRowActionsMenu.tsx:53`,
    },
  ],
}

const rowFactsPopover: OverlaySpec = {
  id: 'app/overlays/detail-compte',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/view/accounts-list/AccountRowFacts.tsx:95`,
  title: 'Détail du compte',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Secteur', 'Services financiers'),
    dataRow('Effectif', '200 à 249'),
    dataRow('Statut commercial', 'À potentiel'),
  ],
  uxNotes: [],
}

const commercialStatusReason: OverlaySpec = {
  id: 'app/overlays/motif-statut-commercial',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/view/accounts-list/CommercialStatusReasonDialog.tsx:53`,
  title: 'Pourquoi « Hors priorité » ?',
  description: 'Le motif est ce qui explique ce changement dans six mois, quand plus personne ne s’en souviendra.',
  destructive: false,
  viewports: BOTH,
  body: [textarea('Motif', 'Client injoignable, budget gelé…')],
  actions: [CANCEL, { label: 'Confirmer', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/accounts/view/accounts-list/CommercialStatusReasonDialog.tsx:53`, 'le champ « Motif »'),
    {
      kind: 'decision',
      text: 'Motif obligatoire seulement pour les statuts de sortie (« Hors priorité », « En veille ») : un déplacement ailleurs dans le pipe se lit déjà dans le score et les signaux.',
      source: `${W}/accounts/view/accounts-list/CommercialStatusReasonDialog.tsx:53`,
    },
  ],
}

// ─── components/ (transverse) ──────────────────────────────────────────────

const moveStage: OverlaySpec = {
  id: 'app/overlays/deplacer-etape',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/projects-index' },
  source: `${C}/effects/EffectPanel.tsx:99`,
  title: 'Déplacer vers « Négociation »',
  description: 'Le détail de ce qui va changer, et où.',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'checked', content: { label: 'Relire le signal d’origine' } },
    },
    { type: 'component', component: 'Checkbox', props: { checked: 'checked', content: { label: 'Créer la mission' } } },
    banner(
      'warning',
      'Cette case crée une mission',
      'Il n’existe aucun moyen de la supprimer ensuite — décoche-la si tu n’en es pas sûr.',
    ),
  ],
  actions: [CANCEL, { label: 'Déplacer seulement' }, { label: 'Déplacer', variant: 'default' }],
  uxNotes: [
    focusNote(`${C}/effects/EffectPanel.tsx:99`, 'la première case à cocher'),
    {
      kind: 'decision',
      text: 'Entrée ne confirme jamais (les cases déclenchent une écriture) — un garde-fou volontaire contre une validation accidentelle.',
      source: `${C}/effects/EffectPanel.tsx:99`,
    },
  ],
}

const browsableSignalDetail: OverlaySpec = {
  id: 'app/overlays/parcourir-signal',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/dashboard' },
  source: `${C}/overlay/BrowsableDialog.tsx:131`,
  title: 'Acme Corp',
  description: 'Tech',
  destructive: false,
  viewports: BOTH,
  body: [paragraph('Le détail du signal et les gestes possibles.'), dataRow('Position', '3 sur 12')],
  uxNotes: [
    focusNote(`${C}/overlay/BrowsableDialog.tsx:131`, 'le bouton « Élément précédent »'),
    {
      kind: 'decision',
      text: 'Les flèches précédent/suivant du fil passent d’un compte à l’autre dans la liste affichée, sans fermer la boîte.',
      source: `${C}/overlay/BrowsableDialog.tsx:131`,
    },
  ],
}

const explainedNumberPopover: OverlaySpec = {
  id: 'app/overlays/expliquer-nombre',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/accounts-detail' },
  source: `${C}/explain/ExplainedNumber.tsx:55`,
  title: 'Expliquer le calcul de Marge brute',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Formule', 'Chiffre d’affaires − coûts directs'),
    dataRow('Source', 'Facturation Bellum'),
    dataRow('Complétude', 'Mesurée sur 8 missions sur 8'),
  ],
  uxNotes: [],
}

const signalPreview: OverlaySpec = {
  id: 'app/overlays/apercu-signal',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/view/accounts-list/AccountTableRow.tsx:845`,
  title: 'Signal détecté',
  destructive: false,
  viewports: ['desktop'],
  body: [
    paragraph('Trois postes data ouverts simultanément — signal d’un budget déjà voté.'),
    dataRow('Source', 'Offre d’emploi · il y a 12 jours'),
  ],
  uxNotes: [],
}

// ─── actions / action-history ──────────────────────────────────────────────

const actionHistoryMenu: OverlaySpec = {
  id: 'app/overlays/menu-historique-action',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/actions-index' },
  source: `${W}/action-history/view/ActionHistoryTableCells.tsx:66`,
  title: 'Actions pour cette ligne',
  destructive: false,
  viewports: BOTH,
  trigger: 'Actions',
  items: ['Voir le détail', 'Copier l’ID'],
  uxNotes: [],
}

const executeActionMenu: OverlaySpec = {
  id: 'app/overlays/menu-executer-action',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/actions-index' },
  source: `${W}/actions/components/ActionExecuteMenu.tsx:111`,
  title: 'Action',
  destructive: false,
  viewports: BOTH,
  trigger: 'Actions exécutables',
  items: ['Marquer fait', 'Marquer préparée', 'Snooze', 'Assigner à…', 'Copier le message', 'Exporter CRM'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une capacité sans handler s’affiche désactivée avec sa raison, jamais masquée ni feinte — sauf l’export CRM, absent quand aucun CRM n’est branché.',
      source: `${W}/actions/components/ActionExecuteMenu.tsx:111`,
    },
  ],
}

const executeAction: OverlaySpec = {
  id: 'app/overlays/executer-action',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/actions-index' },
  source: `${W}/actions/components/ExecuteActionDialog.tsx:237`,
  title: 'Exécuter une action',
  description: 'Exécuter une action sur Marie Dupont. Rien ne part tant que tu n’as pas cliqué sur Exécuter.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Choisir une action'),
    paragraph('Programmer une relance · Enrichir le contact · Créer une tâche CRM'),
    input('Me rappeler le', 'jj/mm/aaaa hh:mm'),
    textarea('Note (optionnel)', 'Ajouter du contexte pour cette action…'),
    paragraph('Aucun envoi automatique. Les contacts désabonnés ou sans crédit sont ignorés côté serveur.'),
  ],
  actions: [CANCEL, { label: 'Exécuter', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/actions/components/ExecuteActionDialog.tsx:237`, 'la carte « Programmer une relance »'),
    {
      kind: 'decision',
      text: 'Le coût d’enrichissement s’affiche « jusqu’à N crédits » — jamais un prix fixe, car seuls les contacts pour lesquels une coordonnée est trouvée sont débités.',
      source: `${W}/actions/components/ExecuteActionDialog.tsx:237`,
    },
  ],
}

const relanceOutcomeMenu: OverlaySpec = {
  id: 'app/overlays/menu-issue-relance',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/actions-index' },
  source: `${W}/actions/components/MyRelancesList.tsx:56`,
  title: 'Marquer comme faite',
  destructive: false,
  viewports: BOTH,
  trigger: 'Marquer comme faite',
  items: ['Positif', 'Refus', 'Report', 'Qualifié', 'Aucune réponse'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Terminer une relance exige de choisir une issue — le serveur refuse un « fait » sans issue.',
      source: `${W}/actions/components/MyRelancesList.tsx:56`,
    },
  ],
}

// ─── agenda ─────────────────────────────────────────────────────────────────

const calendarPicker: OverlaySpec = {
  id: 'app/overlays/choisir-agendas',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/briefing' },
  source: `${W}/agenda/view/AgendaCalendarPicker.tsx:62`,
  title: 'Tous mes agendas',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'component', component: 'Checkbox', props: { checked: 'checked', content: { label: 'Agenda principal' } } },
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'unchecked', content: { label: 'Agenda partagé — lecture seule' } },
    },
  ],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Ne s’affiche que si l’utilisateur a au moins deux agendas — sinon il n’y a pas de choix à faire.',
      source: `${W}/agenda/view/AgendaCalendarPicker.tsx:62`,
    },
  ],
}

const meetingPrep: OverlaySpec = {
  id: 'app/overlays/brief-rendez-vous',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/briefing' },
  source: `${W}/agenda/view/MeetingPrepDialog.tsx:447`,
  title: 'Brief — Marie Dupont · Acme Corp',
  description: 'Ce qu’il faut avoir en tête avant ce rendez-vous, tiré de ton espace.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Rendez-vous', '14:00 · visio'),
    heading('Qui'),
    paragraph('Marie Dupont, DSI — dernier échange il y a trois semaines.'),
    heading('Ce que tu peux positionner'),
    paragraph('Un audit court avant le renouvellement du contrat cadre.'),
  ],
  actions: [{ label: 'Exporter le brief' }],
  uxNotes: [focusNote(`${W}/agenda/view/MeetingPrepDialog.tsx:447`, 'le titre du brief')],
}

const newEvent: OverlaySpec = {
  id: 'app/overlays/poser-rendez-vous',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/briefing' },
  source: `${W}/agenda/view/NewEventDialog.tsx:102`,
  title: 'Poser un rendez-vous',
  description: 'jeudi 25 septembre · 14:00 → 14:30',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Sujet', 'Cadrage — refonte du parcours'),
    input('Invités', 'prenom.nom@societe.fr, autre@societe.fr'),
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'checked', content: { label: 'Ajouter un lien visio' } },
    },
  ],
  actions: [CANCEL, { label: 'Créer', variant: 'default' }],
  uxNotes: [focusNote(`${W}/agenda/view/NewEventDialog.tsx:102`, 'le champ « Sujet »')],
}

const rescheduleEvent: OverlaySpec = {
  id: 'app/overlays/deplacer-rendez-vous',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/briefing' },
  source: `${W}/agenda/view/RescheduleDialog.tsx:74`,
  title: 'Déplacer ce rendez-vous ?',
  description: 'Cadrage — refonte du parcours',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Avant', '10:00 → 10:30'),
    dataRow('Après', '11:00 → 11:30'),
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'checked', content: { label: 'Prévenir les invités' } },
    },
  ],
  actions: [CANCEL, { label: 'Déplacer', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/agenda/view/RescheduleDialog.tsx:74`, 'la case « Prévenir les invités »'),
    {
      kind: 'decision',
      text: 'Seul geste de l’agenda qui touche le calendrier de quelqu’un d’autre — la confirmation est donc systématique, même sur un simple glisser-déposer.',
      source: `${W}/agenda/view/RescheduleDialog.tsx:74`,
    },
  ],
}

// ─── billing ────────────────────────────────────────────────────────────────

const creditsPopover: OverlaySpec = {
  id: 'app/overlays/solde-credits',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/dashboard' },
  source: `${W}/billing/components/CreditsBadge.tsx:137`,
  title: 'Crédits',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Plan', 'Team'),
    dataRow('Crédits restants', '40 crédits'),
    paragraph('Un crédit = une action : analyse, enrichissement ou besoin.'),
  ],
  actions: [{ label: 'Voir l’abonnement', variant: 'default' }],
  uxNotes: [],
}

const pickPlan: OverlaySpec = {
  id: 'app/overlays/choisir-plan',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/billing' },
  source: `${W}/billing/components/PlanPickerDialog.tsx:53`,
  title: 'Choisir un plan',
  description:
    'Passe à un plan supérieur pour débloquer plus de crédits. Paiement sécurisé via Stripe, résiliable à tout moment.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Team', '40 crédits/mois'),
    dataRow('Growth', '120 crédits/mois'),
    paragraph('Un seul utilisateur par abonnement. À partir de deux, l’offre Entreprise se construit avec nous.'),
  ],
  uxNotes: [focusNote(`${W}/billing/components/PlanPickerDialog.tsx:53`, 'le premier plan proposé')],
}

// ─── briefing ───────────────────────────────────────────────────────────────

const conflictDialog: OverlaySpec = {
  id: 'app/overlays/conflit-rendez-vous',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/briefing' },
  source: `${W}/briefing/view/ConflictDialog.tsx:118`,
  title: 'Deux rendez-vous en même temps',
  description: 'Ils se chevauchent de 15 min.',
  destructive: false,
  viewports: BOTH,
  body: [dataRow('Cadrage — refonte du parcours', '14:00 · 30 min'), dataRow('Point budget interne', '14:15 · 30 min')],
  actions: [{ label: 'Déplacer' }],
  uxNotes: [
    focusNote(`${W}/briefing/view/ConflictDialog.tsx:118`, 'le titre du premier rendez-vous'),
    {
      kind: 'decision',
      text: 'Les deux cartes sont symétriques : rien ne décide lequel des deux déplacer à la place de l’utilisateur.',
      source: `${W}/briefing/view/ConflictDialog.tsx:118`,
    },
  ],
}

const sourcesStripDrawer: OverlaySpec = {
  id: 'app/overlays/detail-source',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/briefing' },
  source: `${W}/briefing/view/SourcesStrip.tsx:149`,
  title: 'ton agenda',
  description: 'connecté',
  destructive: false,
  viewports: BOTH,
  body: [dataRow('Dernière lecture', 'il y a 4 minutes')],
  uxNotes: [focusNote(`${W}/briefing/view/SourcesStrip.tsx:149`, 'le titre du panneau')],
}

// ─── changelog ──────────────────────────────────────────────────────────────

const changelogMenu: OverlaySpec = {
  id: 'app/overlays/menu-nouveautes',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/dashboard' },
  source: `${W}/changelog/ChangelogMenu.tsx:84`,
  title: 'Nouveautés',
  destructive: false,
  viewports: BOTH,
  trigger: 'Nouveautés',
  items: ['Revoir la visite guidée', 'Me montrer où c’est', 'Centre d’aide'],
  uxNotes: [],
}

// ─── chat ───────────────────────────────────────────────────────────────────

const commandDrawer: OverlaySpec = {
  id: 'app/overlays/que-puis-je-demander',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/chat' },
  source: `${W}/chat-commands/view/CommandDrawerButton.tsx:133`,
  title: 'Idées de demandes',
  description:
    'Choisis une demande dans la liste, lis ce qu’elle te donne à droite, puis prépare-la : elle arrive dans ta saisie, tu la modifies, c’est toi qui envoies.',
  destructive: false,
  viewports: BOTH,
  body: [
    // #5043 — liste à gauche + aperçu à droite ; sur mobile, deux vues (liste puis aperçu).
    paragraph('Un point de départ pour ta prochaine conversation.'),
    input('Rechercher une demande…'),
    heading('Commencer ma journée'),
    paragraph('Que dois-je savoir avant mes rendez-vous aujourd’hui ?'),
    paragraph('Préparer cette demande — Tu pourras la modifier avant l’envoi.'),
  ],
  uxNotes: [
    focusNote(`${W}/chat-commands/view/CommandDrawerButton.tsx:133`, 'le champ de recherche'),
    {
      kind: 'decision',
      text: 'Aucun classement par popularité — refusé (doctrine c64) : l’analytique produit ne mesure jamais la personne.',
      source: `${W}/chat-commands/view/CommandDrawerButton.tsx:133`,
    },
  ],
}

const scopeDialog: OverlaySpec = {
  id: 'app/overlays/nouvelle-conversation',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/chat' },
  source: `${W}/chat/scope/ScopeDialog.tsx:189`,
  title: 'Nouvelle conversation',
  description:
    'Choisis le dossier sur lequel démarrer cette conversation. Laura ne lit que les données de ton espace, et te dit sous chaque réponse ce qu’elle a utilisé.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Vue d’ensemble'),
    paragraph('Tout mon espace · Sans compte'),
    heading('Un dossier précis'),
    input('Chercher un compte…'),
  ],
  actions: [CANCEL, { label: 'Ouvrir la conversation', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/chat/scope/ScopeDialog.tsx:189`, 'le choix « Tout mon espace »'),
    {
      kind: 'decision',
      text: 'La portée gouverne seulement les données PRIVÉES lues par Laura — jamais un accès au référentiel marché partagé, qui reste toujours interrogeable.',
      source: `${W}/chat/scope/ScopeDialog.tsx:189`,
    },
  ],
}

const attachmentPreview: OverlaySpec = {
  id: 'app/overlays/apercu-piece-jointe',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/AttachmentPreviewDialog.tsx:23`,
  title: 'rapport-q3.pdf',
  destructive: false,
  viewports: BOTH,
  body: [{ type: 'placeholder', kind: 'custom', label: 'Contenu du document, en texte brut', height: 'lg' }],
  uxNotes: [focusNote(`${W}/chat/view/AttachmentPreviewDialog.tsx:23`, 'le titre du document')],
}

const chatAttachMenu: OverlaySpec = {
  id: 'app/overlays/menu-joindre-fichier',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/Chat.tsx:4519`,
  title: 'Ajouter un fichier',
  destructive: false,
  viewports: BOTH,
  trigger: 'Plus d’outils',
  items: [
    'Pour cette conversation',
    'Ajouter à la base de mon ESN',
    'Importer un dossier de CV',
    'Importer des comptes ou contacts',
  ],
  uxNotes: [
    {
      kind: 'decision',
      text: 'La destination et la durée de vie d’un fichier joint se choisissent AVANT l’envoi, jamais devinées après coup.',
      source: `${W}/chat/view/Chat.tsx:4519`,
    },
  ],
}

const conversationDetails: OverlaySpec = {
  id: 'app/overlays/details-conversation',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ConversationDetailsPanel.tsx:46`,
  title: 'Détails de la conversation',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Propriétaire', 'Camille Martin (a ouvert la conversation)'),
    dataRow('Rattachée à un compte', 'Acme Corp'),
    dataRow('Conservation légale', 'Aucune'),
  ],
  actions: [{ label: 'Explorer une autre hypothèse' }],
  uxNotes: [],
}

const conversationsDrawer: OverlaySpec = {
  id: 'app/overlays/mes-conversations',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ConversationsDrawer.tsx:51`,
  title: 'Conversations',
  destructive: false,
  viewports: ['mobile'],
  body: [dataRow('Refonte data platform', 'il y a 2 h'), dataRow('Préparation RDV Acme', 'hier')],
  uxNotes: [focusNote(`${W}/chat/view/ConversationsDrawer.tsx:51`, 'le premier fil de la liste')],
}

const conversationSummary: OverlaySpec = {
  id: 'app/overlays/resume-conversation',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ConversationSummaryPanel.tsx:56`,
  title: 'Résumé du fil',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph('Échange sur le budget data d’Acme Corp et les prochaines étapes.'),
    heading('Décisions prises'),
    paragraph('Proposer un audit court avant l’appel d’offres.'),
  ],
  actions: [{ label: 'Modifier' }],
  uxNotes: [
    {
      kind: 'decision',
      text: '« Modifier » n’apparaît que si un résumé existe déjà — corriger un résumé absent fabriquerait un souvenir qui n’existe pas.',
      source: `${W}/chat/view/ConversationSummaryPanel.tsx:56`,
    },
  ],
}

const memoryBar: OverlaySpec = {
  id: 'app/overlays/laura-garde-en-tete',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/MemoryBar.tsx:113`,
  title: 'Mémoire',
  description: 'Ce que Laura relit à chaque message — chaque ligne s’oublie d’un clic.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Le compte cible cette semaine', 'Acme Corp'),
    dataRow('Le ton préféré', 'Direct, peu de superlatifs'),
  ],
  uxNotes: [focusNote(`${W}/chat/view/MemoryBar.tsx:113`, 'le titre')],
}

const participantsPanel: OverlaySpec = {
  id: 'app/overlays/participants-conversation',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ConversationMenu.tsx:72`,
  title: 'Qui peut lire ce fil',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph(
      'Lié à ton espace : tous ses membres peuvent lire cette conversation. Ce n’est ni un fil privé, ni un lien public.',
    ),
    dataRow('Camille Martin', 'Toi'),
    dataRow('Jean Dupont', ''),
  ],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le fil est visible par tout l’espace, sans liste d’accès sélective — le panneau énonce cet état, il ne le décide pas.',
      source: `${W}/chat/view/ConversationMenu.tsx:72`,
    },
  ],
}

const pendingActionAssignMenu: OverlaySpec = {
  id: 'app/overlays/menu-assigner-action-attente',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/PendingActions.tsx:1323`,
  title: 'Assigner à',
  destructive: false,
  viewports: BOTH,
  trigger: 'Assigner à',
  items: ['Camille Martin', 'Jean Dupont'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Masqué dans un espace solo — rien à déléguer quand on est seul.',
      source: `${W}/chat/view/PendingActions.tsx:1323`,
    },
  ],
}

const REPLY_RETRY_ITEMS = [
  'Réessayer',
  'Modifier ma demande',
  'Répondre avec un autre angle',
  'Partager cette réponse',
  'Signaler un problème',
]

const replyRetrySheet: OverlaySpec = {
  id: 'app/overlays/plus-actions-reponse-mobile',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ReplyRetryMenu.tsx:177`,
  title: 'Plus d’actions sur cette réponse',
  destructive: false,
  viewports: ['mobile'],
  body: REPLY_RETRY_ITEMS.map(label => ({
    type: 'component' as const,
    component: 'Button' as const,
    props: { variant: 'ghost' as const, content: { label } },
  })),
  uxNotes: [focusNote(`${W}/chat/view/ReplyRetryMenu.tsx:177`, 'l’action « Réessayer »')],
}

const replyRetryMenu: OverlaySpec = {
  id: 'app/overlays/menu-plus-actions-reponse',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ReplyRetryMenu.tsx:211`,
  title: 'Plus d’actions sur cette réponse',
  destructive: false,
  viewports: ['desktop'],
  trigger: 'Plus d’actions sur cette réponse',
  items: [...REPLY_RETRY_ITEMS],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Les cinq actions sont décrites une seule fois et rendues deux fois (panneau bas en mobile, menu en bureau) — jamais deux listes qui divergent.',
      source: `${W}/chat/view/ReplyRetryMenu.tsx:211`,
    },
  ],
}

const shareConversation: OverlaySpec = {
  id: 'app/overlays/partager-conversation',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ShareConversation.tsx:107`,
  title: 'Partager',
  destructive: false,
  viewports: BOTH,
  body: [paragraph('Les membres de ton espace pourront lire cette conversation.')],
  actions: [{ label: 'Copier une version figée' }, { label: 'Copier le lien', variant: 'default' }],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Deux modes nommés séparément : un lien VIVANT (continue de refléter les nouveaux messages) et une version FIGÉE (jamais une copie).',
      source: `${W}/chat/view/ShareConversation.tsx:107`,
    },
  ],
}

const voiceNotice: OverlaySpec = {
  id: 'app/overlays/avant-message-vocal',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/chat' },
  source: `${W}/chat/voice/VoiceInput.tsx:346`,
  title: 'Avant ton premier message vocal',
  description:
    'Ta voix est transcrite en texte. Tu relis et corriges ce texte dans la saisie, puis c’est toi qui l’envoies.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph('L’enregistrement est conservé 30 jours, puis supprimé.'),
    paragraph('Les membres de ton espace qui lisent ce fil peuvent le réécouter.'),
  ],
  actions: [{ label: 'Pas maintenant' }, { label: 'Activer le micro', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/chat/voice/VoiceInput.tsx:346`, 'le bouton « Activer le micro »'),
    {
      kind: 'decision',
      text: 'Consentement obligatoire avant la toute première utilisation — texte imposé par la réglementation IA européenne (article 50), jamais montré après coup.',
      source: `${W}/chat/voice/VoiceInput.tsx:346`,
    },
  ],
}

// ─── commercial-audit / consultants ────────────────────────────────────────

const reportAuditInterpretation: OverlaySpec = {
  id: 'app/overlays/signaler-interpretation-audit',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/commercial-audit/components/ReportAuditInterpretation.tsx:66`,
  title: 'Signaler une interprétation de l’audit',
  description: 'Rien n’est modifié : ta demande part directement aux administrateurs de ton espace, pour relecture.',
  destructive: false,
  viewports: BOTH,
  body: [
    textarea('Pourquoi cette interprétation ne te semble-t-elle pas juste ?', 'Explique ce qui te semble incorrect…'),
  ],
  actions: [CANCEL, { label: 'Envoyer le signalement', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/commercial-audit/components/ReportAuditInterpretation.tsx:66`, 'le champ de motif'),
    {
      kind: 'decision',
      text: 'Jamais une correction : uniquement un motif libre transmis aux administrateurs, aucune valeur de remplacement n’est proposée.',
      source: `${W}/commercial-audit/components/ReportAuditInterpretation.tsx:66`,
    },
  ],
}

const consultantBrief: OverlaySpec = {
  id: 'app/overlays/brief-soutenance',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/ConsultantBriefDialog.tsx:41`,
  title: 'Brief de soutenance',
  description: 'Un résumé prêt à envoyer à ton client, bâti sur ce que la fiche porte.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Ce que le profil apporte'),
    paragraph('Sept ans sur des migrations cloud à grande échelle, dans le secteur bancaire.'),
    heading('Ce que le client va objecter'),
    paragraph('Aucun risque identifié par le matching — ce qui ne veut pas dire qu’il n’y en a pas.'),
  ],
  actions: [CLOSE],
  uxNotes: [focusNote(`${W}/consultants/view/ConsultantBriefDialog.tsx:41`, 'le titre du brief')],
}

const consultantCv: OverlaySpec = {
  id: 'app/overlays/cv-adapte-besoin',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/ConsultantCvDialog.tsx:69`,
  title: 'CV de Julie Martin adapté au besoin',
  description: 'Le CV est réécrit pour ce besoin : rien n’y est ajouté qui ne soit dans le CV d’origine.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph('Coût : 1 crédit par génération. Relire un CV déjà adapté est gratuit.'),
    heading('Expériences mises en avant'),
    paragraph('Architecture cloud chez un acteur bancaire comparable, sur un périmètre proche.'),
  ],
  actions: [{ label: 'Copier le CV' }, { label: 'Adapter le CV à ce besoin', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/consultants/view/ConsultantCvDialog.tsx:69`, 'le bouton « Adapter le CV à ce besoin »'),
    {
      kind: 'decision',
      text: 'Ce que le CV ne prouve pas (les manques) s’affiche avec le même poids visuel que les points forts — un garde-fou avant l’envoi au client.',
      source: `${W}/consultants/view/ConsultantCvDialog.tsx:69`,
    },
  ],
}

const consultantForm: OverlaySpec = {
  id: 'app/overlays/modifier-consultant',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/ConsultantFormDialog.tsx:182`,
  title: 'Modifier le consultant',
  description: 'Renseigne ce que tu sais. Hors le nom, rien n’est obligatoire — tout se complète plus tard.',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'grid', columns: 2, gap: '3', children: [input('Nom complet'), input('Intitulé de poste')] },
    {
      type: 'grid',
      columns: 2,
      gap: '3',
      children: [select('Séniorité', 'Confirmé'), select('Disponibilité', 'Disponible')],
    },
    { type: 'grid', columns: 2, gap: '3', children: [input('Email'), input('Téléphone')] },
    input('TJM cible (€/jour)', '620'),
    textarea('CV du consultant', 'Colle le CV existant.'),
  ],
  actions: [CANCEL, { label: 'Enregistrer', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/consultants/view/ConsultantFormDialog.tsx:182`, 'le champ « Nom complet »'),
    MOBILE_SHEET,
    {
      kind: 'decision',
      text: 'À la création, un doublon probable (nom ou email proche d’une fiche existante) affiche un motif avant de laisser créer quand même — jamais une fusion silencieuse.',
      source: `${W}/consultants/view/ConsultantFormDialog.tsx:182`,
    },
  ],
}

const cvCsvImport: OverlaySpec = {
  id: 'app/overlays/importer-csv-consultants',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/CvCsvImportDialog.tsx:68`,
  title: 'Importer un fichier CSV de consultants',
  description:
    'Colonnes reconnues : nom complet (ou prénom/nom), poste, email, téléphone. Une colonne non reconnue est ignorée, jamais devinée.',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'outline', content: { label: 'Choisir un fichier .csv' } },
    },
  ],
  actions: [CLOSE],
  uxNotes: [focusNote(`${W}/consultants/view/CvCsvImportDialog.tsx:68`, 'le bouton « Choisir un fichier .csv »')],
}

const cvMailImport: OverlaySpec = {
  id: 'app/overlays/importer-cv-email',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/CvMailImportDialog.tsx:65`,
  title: 'Importer une pièce jointe d’un fil autorisé',
  description:
    'Seuls les fils que ta messagerie connectée peut déjà lire apparaissent ici. Le corps du message ne voyage jamais.',
  destructive: false,
  viewports: BOTH,
  body: [dataRow('Relance CV — Camille D.', 'il y a 3 jours')],
  actions: [CLOSE],
  uxNotes: [focusNote(`${W}/consultants/view/CvMailImportDialog.tsx:65`, 'le premier fil de la liste')],
}

const cvZipImport: OverlaySpec = {
  id: 'app/overlays/importer-zip-cv',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/CvZipImportDialog.tsx:64`,
  title: 'Importer une archive ZIP de CV',
  description:
    'Chaque fichier de l’archive suit le dépôt automatique : une fiche fiable se met à jour seule, une ambiguïté est isolée pour ta revue.',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph(
      'Jusqu’à 200 fichiers par archive. Au-delà, les fichiers en trop sont nommés dans le résultat, pas découverts par un échec.',
    ),
  ],
  actions: [CLOSE],
  uxNotes: [focusNote(`${W}/consultants/view/CvZipImportDialog.tsx:64`, 'le bouton « Choisir une archive .zip »')],
}

const verificationPlan: OverlaySpec = {
  id: 'app/overlays/cout-verification',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultant-reverse-market' },
  source: `${W}/consultants/view/reverse-market/VerificationPlanDialog.tsx:114`,
  title: 'Ce que cette vérification va coûter',
  description: 'Cinq informations, avant le geste. Rien n’est débité depuis cet écran.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Candidats à vérifier', '14 entreprises'),
    dataRow('Sources mobilisées', 'Registre officiel · Site de l’entreprise · Offres d’emploi publiées'),
    dataRow('Coût', '9 crédits'),
    dataRow('Durée', 'de 2 à 5 minutes par entreprise'),
  ],
  actions: [CANCEL, { label: 'Lancer les vérifications', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/consultants/view/reverse-market/VerificationPlanDialog.tsx:114`, 'le titre du devis'),
    {
      kind: 'decision',
      text: 'Le coût n’est jamais deviné : s’il ne peut pas être mesuré, rien n’est proposé tant qu’il n’est pas connu — jamais un montant à « 0 crédit ».',
      source: `${W}/consultants/view/reverse-market/VerificationPlanDialog.tsx:114`,
    },
  ],
}

const talentFilters: OverlaySpec = {
  id: 'app/overlays/plus-de-filtres-vivier',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/TalentFilterDrawer.tsx:148`,
  title: 'Plus de filtres',
  description: 'Ces critères ne s’appliquent qu’au clic sur « Appliquer ».',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'grid', columns: 2, gap: '3', children: [input('Ville', 'Paris, Lyon…'), select('Rayon', 'Indifférent')] },
    { type: 'grid', columns: 2, gap: '3', children: [input('TJM minimum'), input('TJM maximum')] },
    select('Disponibilité déclarée', 'Toutes'),
    select('Séniorité', 'Toutes'),
  ],
  actions: [{ label: 'Réinitialiser' }, { label: 'Appliquer', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/consultants/view/TalentFilterDrawer.tsx:148`, 'le champ « Ville »', 'ferme sans appliquer'),
  ],
}

const talentSkills: OverlaySpec = {
  id: 'app/overlays/competences-consultant',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/TalentSkillsDialog.tsx:92`,
  title: 'Compétences — Julie Martin',
  description: 'La stack dit ce que la personne connaît. Ici on dit à quel NIVEAU, et surtout d’où on le sait.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Compétence', 'Kubernetes, Java, Snowflake…'),
    select('Source de la compétence', 'déclaré'),
    dataRow('Kubernetes', 'Autonome · lu sur un CV'),
    dataRow('Java', 'Expert · vu en mission'),
  ],
  actions: [{ label: 'Ajouter', variant: 'default' }],
  uxNotes: [focusNote(`${W}/consultants/view/TalentSkillsDialog.tsx:92`, 'le champ « Compétence »')],
}

const vivierRowMenu: OverlaySpec = {
  id: 'app/overlays/menu-vivier',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/VivierRowParts.tsx:94`,
  title: 'Autres actions pour Julie Martin',
  destructive: false,
  viewports: BOTH,
  trigger: 'Autres actions pour Julie Martin',
  items: ['Compétences de Julie Martin', 'Modifier', 'Retirer du vivier'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Chaque libellé nomme la personne plutôt qu’un verbe seul, pour qu’un lecteur d’écran ne répète pas « Modifier » vingt fois de façon indistincte.',
      source: `${W}/consultants/view/VivierRowParts.tsx:94`,
    },
  ],
}

// ─── contacts ───────────────────────────────────────────────────────────────

const enrichConfirm: OverlaySpec = {
  id: 'app/overlays/confirmer-enrichissement',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/contacts/components/EnrichConfirmDialog.tsx:135`,
  title: 'Enrichir ce contact ?',
  description: '1 crédit d’enrichissement sera consommé · via nos sources d’enrichissement',
  destructive: false,
  viewports: BOTH,
  body: [
    banner('info', 'Champs attendus', 'Email · Téléphone · LinkedIn'),
    paragraph('Aucun crédit n’est débité si rien n’est trouvé.'),
  ],
  actions: [CANCEL, { label: 'Enrichir (1 crédit)', variant: 'default' }],
  uxNotes: [focusNote(`${W}/contacts/components/EnrichConfirmDialog.tsx:135`, 'le bouton « Enrichir (1 crédit) »')],
}

const enrichIdentity: OverlaySpec = {
  id: 'app/overlays/completer-identite',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/contacts/components/EnrichIdentityDialog.tsx:71`,
  title: 'Compléter l’identité',
  description:
    'Bellum va rechercher « Global Head of Procurement » chez Acme Corp pour retrouver la vraie personne et compléter son identité.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Nom complet du contact', 'Prénom Nom'),
    paragraph('1 crédit d’enrichissement sera consommé · Aucun crédit n’est débité si rien n’est trouvé.'),
  ],
  actions: [CANCEL, { label: 'Enrichir (1 crédit)', variant: 'default' }],
  uxNotes: [focusNote(`${W}/contacts/components/EnrichIdentityDialog.tsx:71`, 'le champ « Nom complet du contact »')],
}

const callTask: OverlaySpec = {
  id: 'app/overlays/proposer-appel',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/contacts/view/contact-detail/components/ContactCallTaskDialog.tsx:68`,
  title: 'Planifier un appel',
  description:
    'Planifier crée une tâche à venir (raison, objectif, résultat attendu) dans Actions › Séquences › Appels. Un appel déjà passé se consigne, il ne se planifie pas.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Raison de l’appel', 'Ex. Relance après silence'),
    textarea('Objectif de l’appel', 'Ex. Fixer un rendez-vous'),
    textarea('Résultat attendu', 'Ex. Une date de rendez-vous confirmée'),
  ],
  actions: [CANCEL, { label: 'Enregistrer', variant: 'default' }],
  uxNotes: [
    focusNote(
      `${W}/contacts/view/contact-detail/components/ContactCallTaskDialog.tsx:68`,
      'le champ « Raison de l’appel »',
    ),
  ],
}

const crmExportMenu: OverlaySpec = {
  id: 'app/overlays/exporter-crm',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/contacts/view/contact-detail/components/ContactCrmExport.tsx:168`,
  title: 'Exporter vers',
  destructive: false,
  viewports: BOTH,
  trigger: 'Exporter',
  items: ['Ton CRM', 'Connecter un autre CRM'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Aucun nom d’éditeur affiché — seulement « Ton CRM » : nos fournisseurs ne se nomment jamais.',
      source: `${W}/contacts/view/contact-detail/components/ContactCrmExport.tsx:168`,
    },
  ],
}

const contactSelectionSheet: OverlaySpec = {
  id: 'app/overlays/selection-contacts',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/contacts/view/ContactContent.tsx:867`,
  title: '3 contacts sélectionnés',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'black', content: { label: 'Envoyer l’email rédigé (3)' } },
    },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'outline', content: { label: 'Ajouter à une séquence' } },
    },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'outline', content: { label: 'Enrichir maintenant · jusqu’à 3 crédits' } },
    },
  ],
  uxNotes: [focusNote(`${W}/contacts/view/ContactContent.tsx:867`, 'le bouton « Envoyer l’email rédigé (3) »')],
}

const bulkSendEmail: OverlaySpec = {
  id: 'app/overlays/envoyer-emails-en-masse',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts' },
  source: `${W}/contacts/view/contacts-list/BulkSendEmailDialog.tsx:65`,
  title: 'Envoyer l’email rédigé à 8 contacts',
  description: 'Le message préparé de chaque contact est envoyé à son adresse.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Destinataires (avec email)', '8'),
    dataRow('Exclus (sans email)', '2'),
    paragraph('Les contacts désabonnés ou déjà contactés sont ignorés automatiquement.'),
  ],
  actions: [CANCEL, { label: 'Envoyer (8)', variant: 'default' }],
  uxNotes: [focusNote(`${W}/contacts/view/contacts-list/BulkSendEmailDialog.tsx:65`, 'le bouton « Envoyer (8) »')],
}

const contactSelectionAddMenu: OverlaySpec = {
  id: 'app/overlays/menu-ajouter-a-selection',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/contacts' },
  source: `${W}/contacts/view/contacts-list/ContactSelectionPanel.tsx:219`,
  title: 'Ajouter des contacts à la sélection',
  destructive: false,
  viewports: BOTH,
  trigger: 'Ajouter des contacts à la sélection',
  items: ['Rechercher un contact…', 'Camille Martin', 'Jean Dupont'],
  uxNotes: [],
}

const contactSelectionAssignMenu: OverlaySpec = {
  id: 'app/overlays/menu-attribuer-selection',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/contacts' },
  source: `${W}/contacts/view/contacts-list/ContactSelectionPanel.tsx:326`,
  title: 'Attribuer la sélection à',
  destructive: false,
  viewports: BOTH,
  trigger: 'Attribuer à…',
  items: ['Camille Martin (moi)', 'Jean Dupont', 'Retirer l’attribution'],
  uxNotes: [],
}

const contactRowMenuList: OverlaySpec = {
  id: 'app/overlays/menu-ligne-contact',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/contacts' },
  source: `${W}/contacts/view/contacts-list/ContactTableRow.tsx:500`,
  title: 'Actions',
  destructive: false,
  viewports: BOTH,
  trigger: 'Actions',
  items: ['Voir la fiche', 'Contacter par mail', 'Contacter via LinkedIn', 'Enrichir coordonnées'],
  uxNotes: [
    {
      kind: 'decision',
      text: '« Identité incomplète — à vérifier » s’affiche en entrée désactivée : un état, pas une action.',
      source: `${W}/contacts/view/contacts-list/ContactTableRow.tsx:500`,
    },
  ],
}

const createTargetListFromContacts: OverlaySpec = {
  id: 'app/overlays/creer-cible-selection',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts' },
  source: `${W}/contacts/view/contacts-list/CreateTargetListDialog.tsx:47`,
  title: 'Créer une cible depuis la sélection',
  description: 'Une nouvelle liste dans Mes cibles, avec les 6 contacts sélectionnés comme éléments.',
  destructive: false,
  viewports: BOTH,
  body: [input('Nom de la cible', 'Ex. Grands comptes retail — T4')],
  actions: [CANCEL, { label: 'Créer la cible', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/contacts/view/contacts-list/CreateTargetListDialog.tsx:47`, 'le champ « Nom de la cible »'),
  ],
}

// ─── crm / dashboard / discover / documents / expenses / factoring ────────

const logCrmActivity: OverlaySpec = {
  id: 'app/overlays/journaliser-activite-crm',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/crm/view/CrmDataPanel.tsx:171`,
  title: 'Journaliser une activité',
  description: 'La note sera ajoutée à l’historique de 3 contacts dans ton CRM.',
  destructive: false,
  viewports: BOTH,
  body: [textarea('Note', 'Ex : Email de prospection envoyé depuis Bellum.')],
  actions: [CANCEL, { label: 'Enregistrer', variant: 'default' }],
  uxNotes: [focusNote(`${W}/crm/view/CrmDataPanel.tsx:171`, 'le champ de note')],
}

const structuralPotential: OverlaySpec = {
  id: 'app/overlays/potentiel-structurel',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/dashboard' },
  source: `${W}/dashboard/components/perspective/StructuralPotentialBadge.tsx:37`,
  title: 'Potentiel structurel',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph('Bellum a observé 4 parcours professionnels en lien avec Acme SAS.'),
    paragraph('Ce potentiel ne dit rien de la situation actuelle de Acme SAS : à qualifier avant d’agir.'),
  ],
  uxNotes: [],
}

const addToTargetList: OverlaySpec = {
  id: 'app/overlays/ajouter-a-une-cible',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/discover' },
  source: `${W}/discover/view/AddToTargetListDialog.tsx:105`,
  title: 'Ajouter à une cible',
  description: 'Éléments sélectionnés',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'RadioGroup',
      props: { items: ['Créer une nouvelle cible', 'Ajouter à une cible existante'] },
    },
    input('Nom de la cible'),
  ],
  actions: [CANCEL, { label: 'Ajouter', variant: 'default' }],
  uxNotes: [focusNote(`${W}/discover/view/AddToTargetListDialog.tsx:105`, 'le choix « Créer une nouvelle cible »')],
}

const launchAnalyzeSelection: OverlaySpec = {
  id: 'app/overlays/lancer-analyse-selection',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/discover' },
  source: `${W}/discover/view/AnalyzeSelectionDialog.tsx:132`,
  title: 'Lancer l’analyse',
  description: 'Entreprises sélectionnées',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Coût', '5 analyses — 40 crédits au total.'),
    dataRow('Déjà analysées', '1 entreprise — son dossier sera rouvert sans débit.'),
  ],
  actions: [CANCEL, { label: 'Lancer l’analyse', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/discover/view/AnalyzeSelectionDialog.tsx:132`, 'la liste des entreprises sélectionnées'),
    {
      kind: 'decision',
      text: 'Le coût annoncé est la somme exacte du devis serveur, jamais un prix forfaitaire par élément — et bloque le lancement tant qu’il n’est pas mesuré.',
      source: `${W}/discover/view/AnalyzeSelectionDialog.tsx:132`,
    },
  ],
}

const assignSelection: OverlaySpec = {
  id: 'app/overlays/attribuer-selection',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/discover' },
  source: `${W}/discover/view/AssignSelectionDialog.tsx:76`,
  title: 'Attribuer',
  description: 'Éléments sélectionnés',
  destructive: false,
  viewports: BOTH,
  body: [select('Attribuer à', 'Camille Martin')],
  actions: [CANCEL, { label: 'Attribuer', variant: 'default' }],
  uxNotes: [focusNote(`${W}/discover/view/AssignSelectionDialog.tsx:76`, 'le choix « Attribuer à »')],
}

const quickPresets: OverlaySpec = {
  id: 'app/overlays/pistes-rapides',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/discover' },
  source: `${W}/discover/view/DiscoverQuickPresetsDialog.tsx:37`,
  title: 'Pistes rapides',
  description: 'Chaque piste pré-remplit le rail de filtres — tu peux l’ajuster ensuite.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Comptes accessibles', 'PME et ETI de 50 à 249 salariés.'),
    dataRow('Comptes qui recrutent', 'Offres IT publiées ces 90 derniers jours.'),
    dataRow('Comptes en transformation', 'Marchés publics ouverts et attribués sur 6 mois.'),
  ],
  uxNotes: [focusNote(`${W}/discover/view/DiscoverQuickPresetsDialog.tsx:37`, 'la première piste')],
}

const allFilters: OverlaySpec = {
  id: 'app/overlays/tous-les-filtres-decouvrir',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/discover' },
  source: `${W}/discover/view/FilterRail.tsx:392`,
  title: 'Tous les filtres',
  description: 'Croise ce que tu veux : cible, signaux d’intention et fit se cumulent dans une seule recherche.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Périmètre de recherche'),
    {
      type: 'grid',
      columns: 2,
      gap: '3',
      children: [select('Groupe / filiale', 'Peu importe'), select('Effectif', 'Tous')],
    },
    heading('Performance & signaux'),
    select('Type d’entité', 'Les deux'),
    heading('Relation & fit'),
    select('Niveau de fit', 'Tous les fits'),
  ],
  actions: [{ label: 'Appliquer', variant: 'default' }],
  uxNotes: [focusNote(`${W}/discover/view/FilterRail.tsx:392`, 'le premier champ du rail')],
}

const deliverablePreview: OverlaySpec = {
  id: 'app/overlays/apercu-livrable',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/documents/view/AccountDeliverables.tsx:162`,
  title: 'PDF',
  description: 'Ce que contient ce livrable avant de le télécharger ou de le partager.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Contenu inclus', 'Dossier de conquête complet'),
    dataRow('Périmètre', 'Ce compte uniquement — Acme Corp'),
    dataRow('Coût', 'Inclus dans ton abonnement — aucun crédit débité'),
  ],
  actions: [{ label: 'Partager dans l’équipe' }, { label: 'Télécharger', variant: 'default' }],
  uxNotes: [focusNote(`${W}/documents/view/AccountDeliverables.tsx:162`, 'le titre du livrable')],
}

const expenseReportDetail: OverlaySpec = {
  id: 'app/overlays/detail-note-de-frais',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/expenses-index' },
  source: `${W}/expenses/view/ExpenseReportDrawer.tsx:75`,
  title: 'F-2026-006',
  description: 'Camille Martin · Acme Corp',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Montant total', '842,50 € TTC'),
    dataRow('Conformité politique frais', 'Conforme'),
    dataRow('TVA', 'Récupérable'),
  ],
  actions: [{ label: 'Refuser' }, { label: 'Valider', variant: 'default' }],
  uxNotes: [focusNote(`${W}/expenses/view/ExpenseReportDrawer.tsx:75`, 'la référence de la note')],
}

const expenseReportEditor: OverlaySpec = {
  id: 'app/overlays/deposer-note-de-frais',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/expenses-index' },
  source: `${W}/expenses/view/ExpenseReportEditor.tsx:357`,
  title: 'Déposer une note de frais',
  description: 'Dépose tes justificatifs — chacun ouvre une ligne à compléter et valider.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Référence', 'F-2026-014'),
    input('Porteur de la note'),
    select('Catégorie', 'Repas'),
    input('Montant TTC', '18,50'),
  ],
  actions: [{ label: 'Enregistrer le brouillon' }, { label: 'Soumettre', variant: 'default' }],
  uxNotes: [focusNote(`${W}/expenses/view/ExpenseReportEditor.tsx:357`, 'le champ « Référence »'), MOBILE_SHEET],
}

const cessionAssignmentMenu: OverlaySpec = {
  id: 'app/overlays/menu-cession',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/missions-cessions' },
  source: `${W}/factoring/view/CessionsSection.tsx:804`,
  title: 'Actions sur cette cession',
  destructive: false,
  viewports: BOTH,
  trigger: 'Actions sur cette cession',
  items: [
    'Marquer transmise au factor',
    'Marquer réglée',
    'Le factor a refusé cette créance',
    'Le factor a repris cette créance',
  ],
  uxNotes: [],
}

const cessionContractMenu: OverlaySpec = {
  id: 'app/overlays/menu-contrat-affacturage',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/missions-cessions' },
  source: `${W}/factoring/view/CessionsSection.tsx:958`,
  title: 'Contrat d’affacturage',
  destructive: false,
  viewports: BOTH,
  trigger: 'Contrat d’affacturage',
  items: ['BNP Factor', 'Société Générale Factoring'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Sans contrat d’affacturage déclaré, le bouton porte la phrase complète « Aucun contrat d’affacturage… » plutôt qu’un menu vide.',
      source: `${W}/factoring/view/CessionsSection.tsx:958`,
    },
  ],
}

const cessionReconcileMenu: OverlaySpec = {
  id: 'app/overlays/menu-rapprocher-reglement',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/missions-cessions' },
  source: `${W}/factoring/view/CessionsSection.tsx:1127`,
  title: 'Rapprocher ce règlement d’une cession',
  destructive: false,
  viewports: BOTH,
  trigger: 'Rapprocher',
  items: ['Acme Corp — septembre 2026', 'Data Platform — août 2026'],
  uxNotes: [],
}

// ─── feedback / google / guide / integration-center ────────────────────────

const feedbackWidget: OverlaySpec = {
  id: 'app/overlays/signaler-probleme',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/dashboard' },
  source: `${W}/feedback/FeedbackWidget.tsx:366`,
  title: 'Signaler un problème',
  description:
    'Décris ce qui ne va pas. Tout ce qui accompagne ton message est listé ci-dessous, et rien ne part avant que tu l’envoies.',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'component', component: 'RadioGroup', props: { items: ['Bug', 'Métier', 'Autre'] } },
    textarea('Message', 'Que s’est-il passé ? Qu’attendais-tu ?'),
  ],
  actions: [{ label: 'Envoyer le signalement', variant: 'default' }],
  uxNotes: [focusNote(`${W}/feedback/FeedbackWidget.tsx:366`, 'le champ « Message »')],
}

const addToCalendarGoogle: OverlaySpec = {
  id: 'app/overlays/ajouter-agenda-google',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/briefing' },
  source: `${W}/google/components/AddToCalendarDialog.tsx:98`,
  title: 'Ajouter à ton agenda',
  description: 'Crée un événement ou un rappel de relance dans ton agenda.',
  destructive: false,
  viewports: BOTH,
  body: [input('Titre'), input('Début', 'jj/mm/aaaa hh:mm'), textarea('Description')],
  actions: [CANCEL, { label: 'Ajouter à l’agenda', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/google/components/AddToCalendarDialog.tsx:98`, 'le champ « Titre »'),
    {
      kind: 'decision',
      text: 'Absent si Google n’est pas connecté : un `GoogleConnectNotice` remplace le formulaire plutôt qu’un bouton mort.',
      source: `${W}/google/components/AddToCalendarDialog.tsx:98`,
    },
  ],
}

const driveImport: OverlaySpec = {
  id: 'app/overlays/importer-drive',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/integrations' },
  source: `${W}/google/components/DriveImportDialog.tsx:118`,
  title: 'Importer depuis ton espace documentaire',
  description: 'Choisis un document ou un PDF à ajouter à tes connaissances.',
  destructive: false,
  viewports: BOTH,
  body: [input('Rechercher par nom ou par contenu…'), dataRow('Rapport Q3.pdf', '')],
  actions: [CANCEL, { label: 'Importer', variant: 'default' }],
  uxNotes: [focusNote(`${W}/google/components/DriveImportDialog.tsx:118`, 'le champ de recherche')],
}

const helpCenter: OverlaySpec = {
  id: 'app/overlays/centre-aide',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/dashboard' },
  source: `${W}/guide/GuideHelpCenter.tsx:30`,
  title: 'Centre d’aide',
  description:
    'Laura te montre où sont les choses, écran par écran. Rien ne se fait à ta place : tu lis, tu fermes quand tu veux.',
  destructive: false,
  viewports: BOTH,
  body: [dataRow('Analyser un compte', 'Sur tous les écrans'), dataRow('Construire ses cibles', '3 étapes')],
  uxNotes: [focusNote(`${W}/guide/GuideHelpCenter.tsx:30`, 'le premier guide de la liste')],
}

const odooConnect: OverlaySpec = {
  id: 'app/overlays/connecter-odoo',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/integrations' },
  source: `${W}/integration-center/view/cards/OdooCard.tsx:198`,
  title: 'Connecter ton instance Odoo',
  description:
    'Odoo ne passe pas par une page d’autorisation : il faut quatre valeurs, que tu trouves dans ton instance.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Adresse de l’instance', 'https://exemple.odoo.com'),
    input('Nom de la base'),
    input('Identifiant'),
    input('Clé d’API'),
  ],
  actions: [CANCEL, { label: 'Connecter', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/integration-center/view/cards/OdooCard.tsx:198`, 'le champ « Adresse de l’instance »'),
    {
      kind: 'decision',
      text: 'La clé d’API est nommée comme telle, jamais « mot de passe » : elle se révoque sans toucher au compte Odoo.',
      source: `${W}/integration-center/view/cards/OdooCard.tsx:198`,
    },
  ],
}

export const APP_A_L_OVERLAYS: readonly OverlaySpec[] = [
  decidePriority,
  parkAccount,
  correctContact,
  confrontCrm,
  signalList,
  correctOrgChart,
  enrichOrgChart,
  dismissOrgContact,
  attackAngleDetail,
  attackPlanSummary,
  flagPlay,
  replan,
  esnSuggestion,
  accountPdfPreview,
  composerChannelMenu,
  contactChannelMenu,
  dueDatePopover,
  moreActionsMenu,
  collaborationMenu,
  provenancePanel,
  bellumReadDialog,
  competitivePositioning,
  itImplications,
  offerRecommendations,
  whyNowDetail,
  declareLinkedinSignal,
  watchSources,
  absorbAccount,
  marketContextPopover,
  rowActionsMenu,
  rowFactsPopover,
  commercialStatusReason,
  moveStage,
  browsableSignalDetail,
  explainedNumberPopover,
  signalPreview,
  actionHistoryMenu,
  executeActionMenu,
  executeAction,
  relanceOutcomeMenu,
  calendarPicker,
  meetingPrep,
  newEvent,
  rescheduleEvent,
  creditsPopover,
  pickPlan,
  conflictDialog,
  sourcesStripDrawer,
  changelogMenu,
  commandDrawer,
  scopeDialog,
  attachmentPreview,
  chatAttachMenu,
  conversationDetails,
  conversationsDrawer,
  conversationSummary,
  memoryBar,
  participantsPanel,
  pendingActionAssignMenu,
  replyRetrySheet,
  replyRetryMenu,
  shareConversation,
  voiceNotice,
  reportAuditInterpretation,
  consultantBrief,
  consultantCv,
  consultantForm,
  cvCsvImport,
  cvMailImport,
  cvZipImport,
  verificationPlan,
  talentFilters,
  talentSkills,
  vivierRowMenu,
  enrichConfirm,
  enrichIdentity,
  callTask,
  crmExportMenu,
  contactSelectionSheet,
  bulkSendEmail,
  contactSelectionAddMenu,
  contactSelectionAssignMenu,
  contactRowMenuList,
  createTargetListFromContacts,
  logCrmActivity,
  structuralPotential,
  addToTargetList,
  launchAnalyzeSelection,
  assignSelection,
  quickPresets,
  allFilters,
  deliverablePreview,
  expenseReportDetail,
  expenseReportEditor,
  cessionAssignmentMenu,
  cessionContractMenu,
  cessionReconcileMenu,
  feedbackWidget,
  addToCalendarGoogle,
  driveImport,
  helpCenter,
  odooConnect,
]
