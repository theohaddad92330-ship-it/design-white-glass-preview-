import type { OverlaySpec } from '../types'
import {
  banner,
  dataRow,
  focusNote,
  heading,
  input,
  MOBILE_SHEET,
  modalPortal,
  nativeConfirm,
  paragraph,
  SCRIM,
  select,
  textarea,
} from './notes'

/**
 * Les surcouches de l'APP (`apps/web`) maquettées. Priorité aux confirmations destructives et aux
 * formulaires ; le reste de l'inventaire (`inventory.md`) y est listé avec sa raison d'attendre.
 * Les libellés sont ceux du code (i18n FR) — sauf quand la revue UX les corrige, et l'écart est alors
 * écrit en note.
 */

const W = 'apps/web/src/features'
const BOTH = ['desktop', 'mobile'] as const
const CANCEL = { label: 'Annuler' }
/** RUX-23 : une confirmation destructive ouvre le focus sur le bouton qui renonce. */
const onCancel = (source: `${string}:${number}`) => focusNote(source, '« Annuler »', 'ferme sans rien supprimer')

// ─── Confirmations destructives ───────────────────────────────────────────

const deleteAccount: OverlaySpec = {
  id: 'app/overlays/supprimer-compte',
  surface: 'app',
  kind: 'confirm',
  parent: { page: 'app/accounts' },
  source: `${W}/accounts/view/accounts-list/DeleteConfirmDialog.tsx:15`,
  title: 'Supprimer ce compte ?',
  description: 'Le compte sera retiré de ton portefeuille actif et marqué comme supprimé.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Supprimer le compte', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${W}/accounts/view/accounts-list/DeleteConfirmDialog.tsx:15`),
    SCRIM,
    modalPortal(`${W}/accounts/view/accounts-list/DeleteConfirmDialog.tsx:15`),
    {
      kind: 'ecart',
      text: 'Le bouton dit « Supprimer » seul : il nomme l’objet (« Supprimer le compte »). Si le compte est archivé et non détruit, RUX-23 retire cette confirmation au profit d’un toast « Compte supprimé » avec « Annuler » pendant 8 s.',
      source: `${W}/accounts/view/accounts-list/DeleteConfirmDialog.tsx:43`,
    },
  ],
}

const forgetMemory: OverlaySpec = {
  id: 'app/overlays/tout-oublier',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/settings-memory' },
  source: `${W}/memory/view/MemoryLedgerView.tsx:607`,
  title: 'Tout oublier ?',
  description: 'C’est irréversible. Rien ne permettra de retrouver ces lignes.',
  destructive: true,
  viewports: BOTH,
  body: [
    heading('Ce qui part'),
    paragraph(
      'Les faits que tu as épinglés, tes préférences, le résumé de tes échanges avec Laura, la trace de ses propositions et tes retours sur ses réponses.',
    ),
    heading('Ce qui reste'),
    paragraph(
      'Les faits épinglés par tes collègues, ton profil et celui de ton ESN, et les corrections portées au dossier d’un compte.',
    ),
  ],
  actions: [CANCEL, { label: 'Tout oublier', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${W}/memory/view/MemoryLedgerView.tsx:607`),
    modalPortal(`${W}/memory/view/MemoryLedgerView.tsx:607`),
    {
      kind: 'ecart',
      text: '« Oui, tout oublier » commence par « Oui » : le bouton répète le verbe seul, « Tout oublier » (RUX-23).',
      source: `${W}/memory/view/MemoryLedgerView.tsx:649`,
    },
  ],
}

const deleteTalent: OverlaySpec = {
  id: 'app/overlays/supprimer-talent',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/consultants' },
  source: `${W}/consultants/view/TalentDeleteDialog.tsx:45`,
  title: 'Supprimer Camille Martin ?',
  description: 'Ce retrait est définitif. Ce que la fiche porte est listé ci-dessous avant que tu confirmes.',
  destructive: true,
  viewports: BOTH,
  body: [
    heading('Sera supprimé'),
    paragraph('La fiche, ses compétences et ses CV.'),
    heading('Survivra sans être rattaché à personne'),
    paragraph('Les positionnements passés, dans l’historique des besoins.'),
  ],
  actions: [CANCEL, { label: 'Supprimer définitivement', variant: 'destructive' }],
  uxNotes: [onCancel(`${W}/consultants/view/TalentDeleteDialog.tsx:45`), MOBILE_SHEET],
}

const eraseContact: OverlaySpec = {
  id: 'app/overlays/effacer-contact',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/contacts/view/contact-detail/components/ContactErasureCard.tsx:95`,
  title: 'Effacer définitivement Claire Dubois ?',
  description:
    'Sa fiche, ses coordonnées enrichies, ses échanges, ses tâches et ce que Laura retenait d’elle seront supprimés, sans retour possible.',
  destructive: true,
  viewports: BOTH,
  body: [
    banner(
      'info',
      'Une empreinte seulement est gardée',
      'Qui a effacé, quand, et une empreinte non réversible — pour qu’elle ne soit plus jamais recollectée.',
    ),
    input('Tape « Claire Dubois » pour confirmer', 'Claire Dubois'),
  ],
  actions: [CANCEL, { label: 'Effacer définitivement', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${W}/contacts/view/contact-detail/components/ContactErasureCard.tsx:95`),
    {
      kind: 'ecart',
      text: 'L’effacement RGPD se confirme en tapant le nom de la personne (RUX-23, niveau 3) ; le code n’a qu’un clic. Le bouton reste inactif tant que la saisie ne correspond pas.',
      source: `${W}/contacts/view/contact-detail/components/ContactErasureCard.tsx:108`,
    },
  ],
}

const deleteMyAccount: OverlaySpec = {
  id: 'app/overlays/supprimer-mon-compte',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/settings-security' },
  source: `${W}/settings/components/security/DeleteAccountDialog.tsx:65`,
  title: 'Supprimer mon compte',
  description:
    'Action irréversible. Tes données personnelles seront anonymisées, tes sessions révoquées et ton abonnement annulé (sans frais). Pour confirmer, tape SUPPRIMER.',
  destructive: true,
  viewports: BOTH,
  body: [input('Confirmation', 'SUPPRIMER')],
  actions: [CANCEL, { label: 'Supprimer définitivement', variant: 'destructive' }],
  uxNotes: [
    focusNote(`${W}/settings/components/security/DeleteAccountDialog.tsx:83`, 'le champ « Confirmation »'),
    {
      kind: 'decision',
      text: 'Le bouton destructif reste inactif tant que la saisie n’est pas exactement SUPPRIMER ; le serveur exige le même littéral.',
      source: `${W}/settings/components/security/DeleteAccountDialog.tsx:40`,
    },
  ],
}

const disable2fa: OverlaySpec = {
  id: 'app/overlays/desactiver-2fa',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/settings-security' },
  source: `${W}/settings/components/security/TwoFactorDisableDialog.tsx:68`,
  title: 'Désactiver la double authentification',
  description: 'Saisis un code de ton application d’authentification pour confirmer la désactivation.',
  destructive: true,
  viewports: BOTH,
  body: [{ type: 'component', component: 'InputOTP', props: { content: { value: '' } } }],
  actions: [CANCEL, { label: 'Désactiver', variant: 'destructive' }],
  uxNotes: [focusNote(`${W}/settings/components/security/TwoFactorDisableDialog.tsx:79`, 'la première case du code')],
}

const removeConversation: OverlaySpec = {
  id: 'app/overlays/retirer-conversation',
  surface: 'app',
  kind: 'confirm',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ConversationsPanel.tsx:577`,
  title: 'Retirer cette conversation ?',
  description:
    'Ses messages sont conservés, rangés — retrouvables dans « Voir les conversations rangées ». Son titre et ses documents joints partent, eux, pour de bon.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Retirer la conversation', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${W}/chat/view/ConversationsPanel.tsx:577`),
    nativeConfirm(`${W}/chat/view/ConversationsPanel.tsx:577`),
  ],
}

const resetBranding: OverlaySpec = {
  id: 'app/overlays/reinitialiser-marque',
  surface: 'app',
  kind: 'confirm',
  parent: { page: 'app/settings-branding' },
  source: `${W}/settings/view/BrandingView.tsx:263`,
  title: 'Revenir à la marque du produit ?',
  description:
    'Le nom, le logo, la couleur, le domaine et l’adresse d’expédition sont effacés — pour tout l’espace, pas seulement pour toi.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Effacer la marque', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${W}/settings/view/BrandingView.tsx:263`),
    nativeConfirm(`${W}/settings/view/BrandingView.tsx:263`),
  ],
}

const recordRefusal: OverlaySpec = {
  id: 'app/overlays/enregistrer-refus',
  surface: 'app',
  kind: 'confirm',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/contacts/view/contact-detail/components/ContactStopCard.tsx:134`,
  title: 'Enregistrer le refus ?',
  description:
    'Son adresse rejoint la liste de suppression, les séquences en cours s’arrêtent, et seule la personne peut revenir sur sa demande.',
  destructive: true,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Enregistrer le refus', variant: 'destructive' }],
  uxNotes: [
    onCancel(`${W}/contacts/view/contact-detail/components/ContactStopCard.tsx:134`),
    {
      kind: 'ecart',
      text: '« Confirmer le refus » ne dit pas le geste : le bouton répète le verbe du titre, « Enregistrer le refus ».',
      source: `${W}/contacts/view/contact-detail/components/ContactStopCard.tsx:153`,
    },
  ],
}

const offboardMember: OverlaySpec = {
  id: 'app/overlays/depart-membre',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/settings-team' },
  source: `${W}/team/view/MemberOffboardingDialog.tsx:97`,
  title: 'Le départ de Julien Morel',
  description:
    'Regarde ce que cette personne porte avant de décider. Transférer son portefeuille ne retire pas son siège — c’est souvent le geste du préavis.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Ce qui change de main'),
    dataRow('Comptes', '12'),
    dataRow('Actions ouvertes', '7'),
    heading('Ce qui ne se transmet pas'),
    paragraph('Ces éléments sont personnels : ils restent chez leur propriétaire et ne sont donnés à personne.'),
    select('Qui reprend', 'Choisis un membre'),
  ],
  actions: [CANCEL, { label: 'Retirer sans transférer' }, { label: 'Transférer le portefeuille', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/team/view/MemberOffboardingDialog.tsx:176`, 'le choix « Qui reprend »'),
    {
      kind: 'decision',
      text: 'Un comptage raté s’affiche « non mesuré », jamais « 0 » : « rien à reprendre » serait faux (GA-18).',
      source: `${W}/team/view/MemberOffboardingDialog.tsx:130`,
    },
  ],
}

// ─── Envoi, restauration : irréversible pour autrui, réversible ────────────

const sendEmail: OverlaySpec = {
  id: 'app/overlays/envoyer-email',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/contact-engagement/EngagementSendEmail.tsx:96`,
  title: 'Envoyer cet email ?',
  description:
    'L’email part immédiatement, avec tes réponses redirigées vers ton adresse. Cette action est irréversible.',
  destructive: false,
  viewports: BOTH,
  body: [dataRow('À', 'Claire Dubois · claire.dubois@exemple.fr'), dataRow('Objet', 'Vos projets data 2027')],
  actions: [CANCEL, { label: 'Envoyer l’email', variant: 'default' }],
  uxNotes: [
    focusNote(
      `${W}/accounts/view/account-detail/components/contact-engagement/EngagementSendEmail.tsx:96`,
      '« Annuler »',
    ),
    {
      kind: 'decision',
      text: 'Sortant, irréversible pour autrui (RUX-23, niveau 3) : la confirmation nomme destinataire et objet. C’est le commercial qui envoie — le copilote prépare, jamais n’envoie.',
      source: `${W}/accounts/view/account-detail/components/contact-engagement/EngagementSendEmail.tsx:109`,
    },
    {
      kind: 'decision',
      text: 'Q3 (arbitrage Louis 25/09/2026, `docs/revue-ux.md` §6) : réexaminé — « Envoyer » un e-mail reste inchangé, par NOTRE relais, après cette confirmation. La piste alternative (passer par la messagerie branchée par l’espace, ou « Ouvrir dans ma messagerie » quand rien n’est branché) est écartée pour ce lot ; ce dialogue documente l’examen, pas un changement.',
      source: 'packages/figma-sync/docs/revue-ux.md:886',
    },
  ],
}

/**
 * RUX-33 (`docs/revue-ux.md` §4, P1) : une anatomie UNIQUE du panneau d'approche, quel que soit le
 * canal — avant, 5 chemins menaient au même panneau et trois fins différentes selon le canal
 * (LinkedIn : copier + ouvrir puis « déclarer envoyé » ; e-mail : Modifier + Envoyer ; autres :
 * Copier — avec deux libellés de copie). Variante EMAIL ci-dessous, la plus riche des trois.
 */
const contactEngagementPanel: OverlaySpec = {
  id: 'app/overlays/panneau-approche',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/accounts/view/account-detail/components/contact-engagement/EngagementMessage.tsx:309`,
  title: 'Message pour Claire Dubois',
  description: 'DSI Groupe · Atos France',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'component', component: 'Badge', props: { variant: 'info', content: { label: 'Préparé par Laura' } } },
    textarea('Message', 'Bonjour Claire, …'),
  ],
  // Ordre RUX-33 : action principale du canal (ici « Envoyer », confirmée par app/overlays/envoyer-email)
  // → « Ouvrir dans ma messagerie » (mailto:, e-mail seulement) → « Marquer comme fait », jamais une preuve d'envoi.
  actions: [
    { label: 'Marquer comme fait' },
    { label: 'Ouvrir dans ma messagerie' },
    { label: 'Envoyer', variant: 'default' },
  ],
  uxNotes: [
    focusNote(
      `${W}/accounts/view/account-detail/components/contact-engagement/EngagementMessage.tsx:309`,
      'le brouillon de Laura',
    ),
    {
      kind: 'decision',
      text: 'RUX-33 : anatomie unique — brouillon de Laura (éditable) → action principale du canal (« Envoyer » avec confirmation pour l’e-mail ; « Copier et ouvrir LinkedIn » ; « Copier le message » ailleurs — UN seul libellé de copie, plus « Copier » et « Copier le message » à la fois) → « Ouvrir dans ma messagerie » pour l’e-mail → « Marquer comme fait », le geste déclaratif, jamais présenté comme une preuve d’envoi (doctrine, Louis 21/09/2026). Le badge dit « Préparé par Laura », jamais « Envoyé par Laura ».',
      source: `${W}/accounts/view/account-detail/components/contact-engagement/EngagementMessage.tsx:450`,
    },
    {
      kind: 'decision',
      text: 'RUX-33/Q3 : cinq chemins menaient à ce panneau (`ContactContent.tsx:512`, `ContactDetail.tsx:51`, `PriorityPathSection.tsx:137`, `CompactContactRow.tsx:327`, `TabMessages.tsx:126`) — tous ouvrent désormais CE panneau, jamais une variante locale.',
      source: `${W}/contacts/view/ContactContent.tsx:512`,
    },
  ],
}

const restoreContext: OverlaySpec = {
  id: 'app/overlays/restaurer-contexte',
  surface: 'app',
  kind: 'confirm',
  parent: { page: 'app/settings-profile-context' },
  source: `${W}/profile-context/components/ProfileContextVersions.tsx:80`,
  title: 'Restaurer la version 3 ?',
  description:
    'Cette version remplacera ton contexte IA actuel. L’opération est réversible : la version actuelle reste dans l’historique.',
  destructive: false,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Restaurer', variant: 'default' }],
  uxNotes: [focusNote(`${W}/profile-context/components/ProfileContextVersions.tsx:80`, '« Restaurer »')],
}

// ─── Formulaires ──────────────────────────────────────────────────────────

const createProject: OverlaySpec = {
  id: 'app/overlays/ouvrir-affaire',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/projects-index' },
  source: `${W}/projects/view/CreateProjectDialog.tsx:122`,
  title: 'Ouvrir une affaire',
  description: 'Une affaire que tu ouvres toi-même, sur un compte de ton espace.',
  destructive: false,
  viewports: BOTH,
  body: [
    select('Compte', 'Choisir un compte'),
    input('Nom de l’affaire', 'Ce que tu cherches à vendre, en une ligne'),
    input('Objectif'),
    {
      type: 'grid',
      columns: 2,
      gap: '3',
      children: [input('Clôture espérée', 'jj/mm/aaaa'), input('Montant estimé (€)')],
    },
    paragraph('Laissé vide, le montant reste inconnu — jamais compté comme 0 €.'),
  ],
  actions: [CANCEL, { label: 'Créer l’affaire', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/projects/view/CreateProjectDialog.tsx:140`, 'le choix du compte'),
    {
      kind: 'ecart',
      text: 'Cinq champs : RUX-24 range un formulaire de plus de 4 champs en PAGE. Maquetté en modale tant que la page n’existe pas ; en mobile, panneau bas pleine hauteur.',
      source: `${W}/projects/view/CreateProjectDialog.tsx:123`,
    },
    MOBILE_SHEET,
  ],
}

const createContact: OverlaySpec = {
  id: 'app/overlays/ajouter-contact',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts' },
  source: `${W}/crm-core/view/CreateContactDialog.tsx:164`,
  title: 'Ajouter un contact',
  description: 'Un nom suffit. Le reste peut se compléter plus tard, ou par l’enrichissement.',
  destructive: false,
  viewports: BOTH,
  body: [
    select('Entreprise', 'Choisir une entreprise existante'),
    input('Nom'),
    input('Fonction'),
    input('E-mail'),
    input('Téléphone'),
  ],
  actions: [CANCEL, { label: 'Créer le contact', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/crm-core/view/CreateContactDialog.tsx:199`, 'le champ « Nom » (`autoFocus`)'),
    {
      kind: 'ecart',
      text: 'Sept champs dans le code (entité et profil professionnel en plus) : au-delà de 4, RUX-24 en fait une page. La maquette garde les 5 premiers ; « Importer des contacts » reste un lien sous le formulaire.',
      source: `${W}/crm-core/view/CreateContactDialog.tsx:205`,
    },
  ],
}

const logActivity: OverlaySpec = {
  id: 'app/overlays/noter-echange',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/contacts-detail' },
  source: `${W}/activities/view/LogActivityDialog.tsx:225`,
  title: 'Noter un échange',
  description: 'Ce qui s’est dit au téléphone n’est écrit nulle part. Note-le ici, il restera attaché au dossier.',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'RadioGroup',
      props: { content: { legend: 'Nature' }, items: ['Appel', 'Rendez-vous', 'E-mail'] },
    },
    input('Objet', 'Point budget, relance, découverte…'),
    textarea('Ce qui s’est dit'),
  ],
  actions: [CANCEL, { label: 'Noter l’échange', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/activities/view/LogActivityDialog.tsx:235`, 'le choix « Nature »'),
    {
      kind: 'decision',
      text: 'L’issue de l’appel est facultative : laissée vide, elle se lit « non renseignée », jamais devinée. Les natures « Note » et « Réseau professionnel » suivent les trois premières (le groupe passe à la ligne).',
      source: `${W}/activities/view/LogActivityDialog.tsx:306`,
    },
  ],
}

const createTask: OverlaySpec = {
  id: 'app/overlays/nouvelle-tache',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/actions-index' },
  source: `${W}/tasks/view/TaskComposer.tsx:93`,
  title: 'Nouvelle tâche',
  description:
    'Une tâche sans échéance ne remonte dans aucune vue : la date est donc obligatoire, et pré-remplie à aujourd’hui.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Intitulé', 'Rappeler le DSI sur les deux profils'),
    textarea('Résultat attendu', 'RDV pris avec le DSI'),
    select('Qui s’en occupe', 'Moi'),
    input('Échéance', 'Aujourd’hui'),
  ],
  actions: [CANCEL, { label: 'Créer la tâche', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/tasks/view/TaskComposer.tsx:101`, 'le champ « Intitulé »'),
    {
      kind: 'ecart',
      text: 'Le bouton dit « Créer » seul : il nomme l’objet, « Créer la tâche ». Le champ « Détail » du code passe sous « Plus de détails » pour tenir en 4 champs (RUX-24).',
      source: `${W}/tasks/view/TaskComposer.tsx:194`,
    },
  ],
}

const changeEmail: OverlaySpec = {
  id: 'app/overlays/changer-email',
  surface: 'app',
  kind: 'wizard',
  parent: { page: 'app/settings-profile-identity' },
  source: `${W}/profile/components/ChangeEmailDialog.tsx:40`,
  title: 'Changer d’adresse email',
  description: 'Pour confirmer la nouvelle adresse, nous lui enverrons un code à 6 caractères.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Nouvelle adresse email', 'tu@entreprise.com'),
    paragraph('Adresse actuelle : camille.martin@esn-exemple.fr'),
  ],
  actions: [CANCEL, { label: 'Envoyer le code', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/profile/components/ChangeEmailDialog.tsx:96`, 'le champ « Nouvelle adresse email »'),
    {
      kind: 'decision',
      text: 'Deux temps dans la même modale : la nouvelle adresse, puis le code reçu (« Code de confirmation »). L’étape 1 est maquettée.',
      source: `${W}/profile/components/ChangeEmailDialog.tsx:157`,
    },
  ],
}

const shareAccount: OverlaySpec = {
  id: 'app/overlays/partager-dossier',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/AccountShareDialog.tsx:55`,
  title: 'Partager le dossier',
  description: 'Lien public en lecture seule, valable 30 jours.',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'CopyField',
      props: { content: { label: 'Lien public', value: 'https://app.bellum.ai/share/8f2c…' } },
    },
  ],
  actions: [{ label: 'Autre…' }, { label: 'Partager sur LinkedIn', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/accounts/view/account-detail/components/AccountShareDialog.tsx:96`, 'le bouton « Copier le lien »'),
  ],
}

const launchAnalysis: OverlaySpec = {
  id: 'app/overlays/analyser-entreprise',
  surface: 'app',
  kind: 'wizard',
  parent: { page: 'app/accounts' },
  source: `${W}/launcher/AccountLaunchSurface.tsx:207`,
  title: 'Analyser une entreprise',
  description: 'Tape le nom d’une entreprise, choisis-la dans la liste, et l’analyse part d’ici.',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'Stepper',
      props: { items: ['Identifier', 'Confirmer'] },
    },
    { type: 'component', component: 'SearchInput', props: { content: { placeholder: 'Nom de l’entreprise' } } },
    dataRow('Durée', '3 à 6 min'),
    paragraph('Rien n’est débité avant ta confirmation.'),
  ],
  actions: [CANCEL, { label: 'Lancer l’analyse', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/launcher/AccountLaunchSurface.tsx:210`, 'le champ de recherche'),
    {
      kind: 'decision',
      text: 'RUX-31 : toutes les portes « Analyser » ouvrent CE dialogue, en 2 temps (identifier → confirmer périmètre, coût, durée) ; le bouton final porte le coût, « Lancer l’analyse — n crédits ».',
      source: `${W}/launcher/AccountLaunchSurface.tsx:331`,
    },
  ],
}

// ─── Palette, panneaux, menus, info-bulle, toasts ─────────────────────────

const commandPalette: OverlaySpec = {
  id: 'app/overlays/palette-commandes',
  surface: 'app',
  kind: 'command',
  parent: { page: 'app/dashboard' },
  source: 'apps/dashboard-manager/src/app/_components/global-search.logic.ts:25',
  title: 'Rechercher ou analyser',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'SearchInput',
      props: { content: { placeholder: 'Un compte, un contact, une mission, une page…', value: 'Capg' } },
    },
    heading('Comptes'),
    dataRow('Capgemini', 'Compte · analysé'),
    heading('Pages'),
    dataRow('Missions', 'Page'),
    heading('Analyser'),
    dataRow('Analyser « Capg »', '↵'),
  ],
  uxNotes: [
    focusNote('apps/dashboard-manager/src/app/_components/global-search.tsx:197', 'le champ de recherche'),
    {
      kind: 'ecart',
      text: 'L’app n’a pas de palette ⌘K : RUX-07 la crée sur le modèle de celle du DM (comptes, contacts, missions, consultants, pages, puis « Analyser “<saisie>” »). Dialog centré de 640 px ; sur mobile, ouverte depuis la loupe de l’entête.',
      source: `${W}/accounts/view/account-detail/tabs/partners/EsnNameField.tsx:19`,
    },
  ],
}

const missionSheet: OverlaySpec = {
  id: 'app/overlays/apercu-mission',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/missions' },
  source: `${W}/missions/view/MissionDetailSheet.tsx:104`,
  title: 'Data platform — lot 2',
  description: 'Banque Exemple · en cours',
  destructive: false,
  viewports: BOTH,
  body: [dataRow('Consultant', 'Camille Martin'), dataRow('Fin prévue', '31/12/2026'), dataRow('TJM', '650 €')],
  actions: [{ label: 'Demander à Laura' }, { label: 'Ouvrir le dossier', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/missions/view/MissionDetailSheet.tsx:104`, 'le titre du panneau'),
    {
      kind: 'ecart',
      text: 'Missions ouvre ce panneau, Planification en ouvre un autre (`MissionDetailPanel`) : RUX-24 garde UN aperçu latéral de 480 px pour consulter sans quitter la liste.',
      source: `${W}/missions/view/PlanningPage.tsx:700`,
    },
  ],
}

const needsFilters: OverlaySpec = {
  id: 'app/overlays/filtres-besoins',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/projects-needs' },
  source: `${W}/projects/open-needs/view/NeedsFilterDrawer.tsx:80`,
  title: 'Plus de filtres',
  description: 'Les critères s’appliquent quand tu cliques sur « Appliquer ».',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Compétence'),
    input('Séniorité'),
    input('Localisation'),
    select('Urgence', 'Tous'),
    select('Statut', 'Tous'),
    { type: 'component', component: 'Checkbox', props: { content: { label: 'Sans shortlist' } } },
  ],
  actions: [{ label: 'Réinitialiser' }, { label: 'Appliquer (2)', variant: 'default' }],
  uxNotes: [
    focusNote(
      `${W}/projects/open-needs/view/NeedsFilterDrawer.tsx:94`,
      'le champ « Compétence »',
      'ferme sans appliquer',
    ),
  ],
}

const backgroundTasks: OverlaySpec = {
  id: 'app/overlays/taches-de-fond',
  surface: 'app',
  kind: 'sheet',
  parent: { page: 'app/dashboard' },
  source: 'apps/web/src/components/sidebar/background-tasks/BackgroundTasksSheet.tsx:29',
  title: 'Tâches de fond',
  description: 'Mise à jour en temps réel',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('En cours'),
    dataRow('Analyse de Capgemini', '62 %'),
    dataRow('Import de contacts', 'En cours'),
    heading('Terminées'),
    dataRow('Analyse de Sopra Steria', 'Prête'),
  ],
  uxNotes: [
    focusNote('apps/web/src/components/sidebar/background-tasks/BackgroundTasksSheet.tsx:30', 'le bouton « Fermer »'),
  ],
}

const userMenu: OverlaySpec = {
  id: 'app/overlays/menu-utilisateur',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/dashboard' },
  source: 'apps/web/src/components/sidebar/UserDropdownMenu.tsx:117',
  title: 'Menu du compte',
  destructive: false,
  viewports: BOTH,
  trigger: 'Camille Martin',
  items: ['Mon profil', 'Raccourcis clavier', 'Déconnexion'],
  uxNotes: [],
}

const contactRowMenu: OverlaySpec = {
  id: 'app/overlays/menu-contact',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/tabs/contacts/CompactContactRow.tsx:305`,
  title: 'Actions sur le contact',
  destructive: false,
  viewports: BOTH,
  trigger: 'Actions',
  items: ['Voir la fiche', 'Corriger', 'Préparer un message', 'Contacter par mail'],
  uxNotes: [],
}

const collectionMenu: OverlaySpec = {
  id: 'app/overlays/menu-encaissement',
  surface: 'app',
  kind: 'dropdown',
  parent: { page: 'app/missions-encaissements' },
  source: `${W}/missions/view/CollectionsPage.tsx:692`,
  title: 'Actions sur la facture',
  destructive: false,
  viewports: BOTH,
  trigger: 'Actions',
  items: ['Marquer réglée', 'Consigner une relance', 'Déclarer un litige'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Quatre statuts d’encaissement, jamais un cinquième : aucune entrée « partiellement réglée » — le reste dû se nomme sur la ligne.',
      source: `${W}/missions/view/CollectionsPage.tsx:692`,
    },
  ],
}

const priorityPopover: OverlaySpec = {
  id: 'app/overlays/priorite-contact',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/contacts' },
  source: `${W}/contacts/components/ContactPriorityBadge.tsx:32`,
  title: 'Priorité 2 sur 5',
  destructive: false,
  viewports: BOTH,
  body: [paragraph('1 = à contacter en premier. Le rang tient au rôle et aux signaux, jamais à un critère protégé.')],
  uxNotes: [],
}

const crmTooltip: OverlaySpec = {
  id: 'app/overlays/present-crm',
  surface: 'app',
  kind: 'tooltip',
  parent: { page: 'app/accounts-detail' },
  source: `${W}/accounts/view/account-detail/components/CrmPresenceBadge.tsx:30`,
  title: 'Ce compte existe déjà dans ton CRM',
  destructive: false,
  viewports: ['desktop'],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une info-bulle ne vit qu’au survol et au focus clavier : en mobile, son texte passe dans la ligne (pas de survol au doigt) — d’où le bureau seul.',
      source: `${W}/accounts/view/account-detail/components/CrmPresenceBadge.tsx:30`,
    },
  ],
}

const conversationRemoved: OverlaySpec = {
  id: 'app/overlays/toast-conversation-retiree',
  surface: 'app',
  kind: 'toast',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ConversationsPanel.tsx:581`,
  title: 'Conversation retirée.',
  description: 'Retrouvable dans « Voir les conversations rangées ».',
  destructive: false,
  viewports: BOTH,
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un toast annonce un résultat hors de la vue (la conversation a quitté la liste) ; en bas à droite en bureau, en haut en mobile (RUX-25).',
      source: 'apps/web/src/App.tsx:131',
    },
  ],
}

const actionFailed: OverlaySpec = {
  id: 'app/overlays/toast-echec',
  surface: 'app',
  kind: 'toast',
  parent: { page: 'app/chat' },
  source: `${W}/chat/view/ConversationsPanel.tsx:588`,
  title: 'L’action n’a pas pu être enregistrée.',
  description: 'Rôle insuffisant pour cette action.',
  destructive: true,
  viewports: BOTH,
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un échec serveur se dit en toast avec sa raison ; une erreur de SAISIE, jamais — elle s’écrit sous le champ (RUX-22).',
      source: `${W}/chat/view/ConversationsPanel.tsx:588`,
    },
  ],
}

export const APP_OVERLAYS: readonly OverlaySpec[] = [
  deleteAccount,
  forgetMemory,
  deleteTalent,
  eraseContact,
  deleteMyAccount,
  disable2fa,
  removeConversation,
  resetBranding,
  recordRefusal,
  offboardMember,
  sendEmail,
  contactEngagementPanel,
  restoreContext,
  createProject,
  createContact,
  logActivity,
  createTask,
  changeEmail,
  shareAccount,
  launchAnalysis,
  commandPalette,
  missionSheet,
  needsFilters,
  backgroundTasks,
  userMenu,
  contactRowMenu,
  collectionMenu,
  priorityPopover,
  crmTooltip,
  conversationRemoved,
  actionFailed,
]
