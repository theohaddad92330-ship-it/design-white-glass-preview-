import type { OverlaySpec } from '../types'
import { dataRow, focusNote, heading, input, MOBILE_SHEET, paragraph, select, textarea } from './notes'

/**
 * Les surcouches de l'APP (`apps/web`) dont le fichier source est sous `features/[m-z]*` — le lot
 * `feat/figma-sync-overlays-m-z`. Priorité aux confirmations destructives et aux formulaires qui créent
 * ou envoient (même règle que `app.ts`) ; le reste de l'inventaire (`inventory.md`) est regroupé sous le
 * représentant de sa famille quand il lui est strictement identique, ou attend nommément un lot suivant.
 */

const W = 'apps/web/src/features'
const BOTH = ['desktop', 'mobile'] as const
const CANCEL = { label: 'Annuler' }
const onCancel = (source: `${string}:${number}`, escape = 'ferme sans rien enregistrer') =>
  focusNote(source, '« Annuler »', escape)

// ─── Envoi ──────────────────────────────────────────────────────────────

const writeToContact: OverlaySpec = {
  id: 'app/overlays/ecrire-a-contact',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/mailbox' },
  source: `${W}/mailbox/view/ContactMailboxDialog.tsx:113`,
  title: 'Écrire à Claire Dubois',
  description: 'Depuis camille.martin@esn-exemple.fr vers claire.dubois@exemple.fr',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Destinataire', 'claire.dubois@exemple.fr'),
    input('Objet', 'Vos projets data 2027'),
    textarea('Message'),
    paragraph('Le brouillon atterrit dans ta messagerie : tu le relis et tu l’envoies toi-même.'),
    paragraph('L’envoi part de ta messagerie, vers ce destinataire uniquement. Un contact désabonné est refusé.'),
  ],
  actions: [CANCEL, { label: 'Déposer un brouillon' }, { label: 'Envoyer maintenant', variant: 'black' }],
  uxNotes: [
    onCancel(`${W}/mailbox/view/ContactMailboxDialog.tsx:113`),
    {
      kind: 'decision',
      text: 'Deux issues nommées et séparées, parce qu’elles n’engagent pas la même chose : le BROUILLON n’atteint personne, l’ENVOI part vraiment. Jamais d’envoi automatique à l’ouverture — le copilote prépare, le commercial envoie.',
      source: `${W}/mailbox/view/ContactMailboxDialog.tsx:46`,
    },
  ],
}

const followUpThread: OverlaySpec = {
  id: 'app/overlays/relancer-fil',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/mailbox' },
  source: `${W}/mailbox/view/DraftDialog.tsx:142`,
  title: 'Relancer ce fil',
  description:
    'Une relance, préparée comme un nouveau brouillon dans ce fil. Rien n’est envoyé : c’est toi qui envoies.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Destinataire', 'claire.dubois@exemple.fr'),
    input('Objet', 'Re : Vos projets data 2027'),
    textarea('Message'),
    paragraph('Ta signature réelle est ajoutée automatiquement quand nous avons pu la lire.'),
  ],
  actions: [CANCEL, { label: 'Déposer le brouillon' }, { label: 'Envoyer', variant: 'black' }],
  uxNotes: [onCancel(`${W}/mailbox/view/DraftDialog.tsx:142`)],
}

const positionConsultant: OverlaySpec = {
  id: 'app/overlays/positionner-consultant',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/projects-needs' },
  source: `${W}/matching/view/PositionDialog.tsx:66`,
  title: 'Positionner Camille Martin',
  description: 'Rien n’est envoyé au client à ce stade.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Ce que je crée'),
    paragraph('· Une candidature sur ce besoin, visible par le client.'),
    heading('Ce que je peux préparer'),
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'checked', content: { label: 'Message d’accompagnement au client' } },
    },
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'unchecked', content: { label: 'Notification au consultant' } },
    },
    heading('Ce que je vérifie'),
    paragraph('✓ Consentement du consultant à jour.'),
    paragraph('⚠ Disponibilité non confirmée après le 14/11 — journalisé, n’empêche pas le positionnement.'),
  ],
  actions: [
    { label: 'Annuler', variant: 'ghost' },
    { label: 'Positionner', variant: 'default' },
  ],
  uxNotes: [
    onCancel(`${W}/matching/view/PositionDialog.tsx:130`),
    {
      kind: 'decision',
      text: 'Trois blocs, dans cet ordre, et l’ordre EST le message : ce qui est inévitable, ce qui est proposé (jamais coché d’office pour ce qui part vers l’extérieur), ce qui n’empêche pas mais est journalisé. Trouvé en recette : le bouton positionnait DIRECTEMENT, sans que ce préflight ne soit montré.',
      source: `${W}/matching/view/PositionDialog.tsx:27`,
    },
  ],
}

const addToOutlook: OverlaySpec = {
  id: 'app/overlays/ajouter-agenda',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/briefing' },
  source: `${W}/microsoft/components/OutlookScheduleDialog.tsx:98`,
  title: 'Ajouter à ton agenda',
  description: 'Crée un événement ou un rappel de relance dans ton agenda.',
  destructive: false,
  viewports: BOTH,
  body: [input('Titre', 'Rappeler le DSI sur les deux profils'), input('Début'), textarea('Description')],
  actions: [CANCEL, { label: 'Ajouter à l’agenda', variant: 'black' }],
  uxNotes: [
    onCancel(`${W}/microsoft/components/OutlookScheduleDialog.tsx:98`),
    {
      kind: 'ecart',
      text: 'Sans compte Outlook connecté, le corps du dialogue est remplacé par une notice « Connecte ton agenda depuis Réglages › Intégrations » — jamais un formulaire qui échouerait au clic.',
      source: `${W}/microsoft/components/OutlookScheduleDialog.tsx:110`,
    },
  ],
}

// ─── Création ───────────────────────────────────────────────────────────

const createMissionFromDocument: OverlaySpec = {
  id: 'app/overlays/creer-mission-document',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/missions-nouvelle' },
  source: `${W}/missions/view/CreateMissionFromDocumentDialog.tsx:148`,
  title: 'Créer une mission depuis un document',
  description:
    'Dépose un contrat, une fiche de poste ou un e-mail : les champs se pré-remplissent, tu vérifies et corriges avant de créer.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Compte', 'Capgemini'),
    textarea('Coller le texte du document', 'Colle ici le contrat, la fiche de poste ou l’e-mail…'),
    input('Libellé de la mission', 'Data platform — lot 2'),
    input('Rôle', 'Architecte cloud confirmé'),
    {
      type: 'grid',
      columns: 2,
      gap: '3',
      children: [input('Début'), input('Fin prévue')],
    },
    input('TJM (€)', '650'),
  ],
  actions: [CANCEL, { label: 'Créer la mission', variant: 'black' }],
  uxNotes: [
    onCancel(`${W}/missions/view/CreateMissionFromDocumentDialog.tsx:150`),
    {
      kind: 'decision',
      text: 'Une extraction est une PROPOSITION, jamais une création : les champs restent modifiables et rien n’est écrit avant le clic sur « Créer la mission ». Un champ non lu dans le document reste vide, jamais deviné.',
      source: `${W}/missions/view/CreateMissionFromDocumentDialog.tsx:50`,
    },
    MOBILE_SHEET,
  ],
}

const createSequence: OverlaySpec = {
  id: 'app/overlays/creer-sequence',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/actions-sequences' },
  source: `${W}/outreach/view/CreateSequenceDialog.tsx:344`,
  title: 'Créer une séquence',
  description:
    'Une cadence de relances datées. Les étapes e-mail préparent le message et posent un rappel — rien n’est envoyé automatiquement : l’envoi reste ton geste.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Pour qui'),
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'outline', size: 'sm', content: { label: 'Choisir dans mes contacts' } },
    },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'outline', size: 'sm', content: { label: 'Importer une liste' } },
    },
    paragraph('2 séquences seront créées, une par contact — chacune se met en pause dès que la personne répond.'),
    select('Modèle', 'Prospection — 3 touches', [
      'Prospection — 3 touches',
      'Compte froid — email',
      'Signal frais',
      'Relance après rendez-vous',
    ]),
    input('Nom de la séquence', 'Prospection — 3 touches'),
  ],
  actions: [CANCEL, { label: 'Créer la séquence', variant: 'default' }],
  uxNotes: [
    onCancel(`${W}/outreach/view/CreateSequenceDialog.tsx:347`),
    {
      kind: 'decision',
      text: '« Une séquence sera créée, sur ce contact » (audience à un seul contact) ou « N séquences seront créées, une par contact » (audience à plusieurs) : chaque séquence reste MONO-CONTACT même quand l’audience choisie en compte plusieurs — c74, campagne mono-contact.',
      source: `${W}/outreach/view/CreateSequenceDialog.tsx:511`,
    },
  ],
}

const createNeed: OverlaySpec = {
  id: 'app/overlays/creer-besoin',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/projects-needs' },
  source: `${W}/projects/open-needs/view/CreateNeedDialog.tsx:35`,
  title: 'Créer un besoin',
  description:
    'Le minimum pour poser un besoin avant même d’avoir ouvert le projet : un titre, et le projet auquel le rattacher. Le reste — compétences, TJM, urgence — se saisit ensuite sur sa fiche.',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Titre du besoin', 'Ex. : Architecte cloud confirmé'),
    select('Projet de rattachement', 'Choisir un projet'),
    paragraph(
      'Un projet regroupe les besoins d’un même client. Pas encore de projet pour ce client ? Crée-en un juste en dessous.',
    ),
  ],
  actions: [CANCEL, { label: 'Créer', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/projects/open-needs/view/NeedWizard.tsx:510`, 'le champ « Titre du besoin »'),
    {
      kind: 'ecart',
      text: 'Le code est un assistant à quatre étapes (`NeedWizard`) avec une colonne « Conseils de Laura » à côté : la maquette garde les deux premiers champs de l’étape 1 (le minimum pour poser un besoin), les étapes suivantes (télétravail, séniorité, effectif) se maquettent avec la fiche du besoin.',
      source: `${W}/projects/open-needs/view/CreateNeedDialog.tsx:12`,
    },
  ],
}

const createTarget: OverlaySpec = {
  id: 'app/overlays/creer-cible',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/mes-cibles' },
  source: `${W}/target-lists/view/CreateTargetListFromSelectionDialog.tsx:121`,
  title: 'Créer une cible',
  description: '12 fiches sélectionnées',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Nom de la cible', 'Comptes tech IDF — 25/09'),
    input('Objectif', 'Ex. Décrocher 3 rendez-vous DSI'),
    {
      type: 'stack',
      direction: 'row',
      gap: '6',
      children: [dataRow('Type', 'Comptes'), dataRow('Comptes inclus', '9'), dataRow('Contacts inclus', '3')],
    },
    paragraph('2 fiches sont déjà dans une autre cible.'),
  ],
  actions: [
    { label: 'Annuler', variant: 'ghost' },
    { label: 'Créer la cible', variant: 'default' },
  ],
  uxNotes: [
    onCancel(`${W}/target-lists/view/CreateTargetListFromSelectionDialog.tsx:122`),
    {
      kind: 'decision',
      text: 'Le nom est PROPOSÉ (date du jour), jamais vide, et modifiable avant toute validation. Le nombre de doublons ne s’affiche que s’il est supérieur à zéro — jamais « 0 doublon » (GA-18/19) : une fiche peut légitimement vivre dans plusieurs cibles, on le NOMME, on ne le bloque pas.',
      source: `${W}/target-lists/view/CreateTargetListFromSelectionDialog.tsx:170`,
    },
  ],
}

const importTarget: OverlaySpec = {
  id: 'app/overlays/importer-cible',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/mes-cibles' },
  source: `${W}/target-lists/view/ImportTargetListDialog.tsx:68`,
  title: 'Importer une liste',
  description:
    'Colle des noms de comptes ou de contacts déjà dans ton espace : ceux qu’on retrouve exactement rejoignent la liste, les autres restent non trouvés — jamais inventés.',
  destructive: false,
  viewports: BOTH,
  body: [input('Nom de la liste', 'Ex. Banques régionales — T4'), textarea('Noms à retrouver, un par ligne')],
  actions: [CANCEL, { label: 'Importer', variant: 'default' }],
  uxNotes: [
    onCancel(`${W}/target-lists/view/ImportTargetListDialog.tsx:69`),
    {
      kind: 'decision',
      text: 'Le contrat exige un `ref_id` réel : cette boîte ne crée jamais une fiche à partir d’un nom collé, elle en RETROUVE parmi celles déjà dans l’espace — doctrine « jamais de donnée fictive ».',
      source: `${W}/target-lists/view/ImportTargetListDialog.tsx:24`,
    },
  ],
}

// ─── Sécurité, portabilité, permissions ────────────────────────────────

const enroll2fa: OverlaySpec = {
  id: 'app/overlays/activer-2fa',
  surface: 'app',
  kind: 'wizard',
  parent: { page: 'app/settings-security' },
  source: `${W}/settings/components/security/TwoFactorEnrollDialog.tsx:91`,
  title: 'Activer la double authentification',
  description:
    'Scanne le QR code avec Google Authenticator, 1Password ou toute application TOTP, puis saisis le code à 6 chiffres généré.',
  destructive: false,
  viewports: BOTH,
  body: [
    { type: 'placeholder', kind: 'image', label: 'QR code de configuration 2FA', height: 'sm' },
    paragraph('Ou saisis cette clé manuellement :'),
    {
      type: 'component',
      component: 'CopyField',
      props: { content: { label: 'Clé manuelle', value: 'JBSW Y3DP EHPK 3PXP' } },
    },
    paragraph('Code de vérification'),
    { type: 'component', component: 'InputOTP', props: { content: { value: '' } } },
  ],
  uxNotes: [
    focusNote(`${W}/settings/components/security/TwoFactorEnrollDialog.tsx:128`, 'la première case du code'),
    {
      kind: 'decision',
      text: 'Aucun bouton de validation : les 6 chiffres se vérifient dès la dernière case saisie. Un secret neuf est régénéré à chaque ouverture du dialogue.',
      source: `${W}/settings/components/security/TwoFactorEnrollDialog.tsx:82`,
    },
  ],
}

const exportMyData: OverlaySpec = {
  id: 'app/overlays/export-mes-donnees',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/settings-mes-donnees' },
  source: `${W}/settings/view/MyDataView.tsx:397`,
  title: 'Voici ce que ton export contiendra',
  description: 'Rien n’est téléchargé avant que tu confirmes.',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Comptes suivis', '42 lignes'),
    dataRow('Contacts', '318 lignes'),
    dataRow('Talents et compétences', 'non mesuré'),
    heading('Non inclus'),
    paragraph('Données partagées de l’espace, référentiels communs.'),
    paragraph('Un fichier JSON unique. Pour un CSV, télécharge l’objet qui t’intéresse depuis la liste.'),
  ],
  actions: [CANCEL, { label: 'Télécharger mon export', variant: 'default' }],
  uxNotes: [
    onCancel(`${W}/settings/view/MyDataView.tsx:398`),
    {
      kind: 'decision',
      text: 'La liste vient du même manifeste que l’export serveur — jamais rédigée à la main, jamais en écart avec ce qui part réellement. Un compte illisible reste « non mesuré », jusque dans ce récapitulatif : un « 0 » ferait renoncer quelqu’un à un export qui, lui, emporte bien la donnée (GA-18/19).',
      source: `${W}/settings/view/MyDataView.tsx:371`,
    },
  ],
}

const memberPermissions: OverlaySpec = {
  id: 'app/overlays/droits-membre',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/settings-team' },
  source: `${W}/team/view/MemberPermissionsDialog.tsx:83`,
  title: 'Droits en propre — Camille Martin',
  description:
    'Tu accordes ces droits à Camille Martin, en plus de son rôle (Commercial). Le geste est enregistré au journal d’activité, au nom de Julien Morel.',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'checked', state: 'disabled', content: { label: 'Lancer une analyse — inclus dans son rôle' } },
    },
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'checked', content: { label: 'Exporter des données — accordé en propre' } },
    },
    {
      type: 'component',
      component: 'Checkbox',
      props: { checked: 'unchecked', content: { label: 'Gérer la facturation' } },
    },
  ],
  actions: [
    { label: 'Annuler', variant: 'ghost' },
    { label: 'Enregistrer les droits', variant: 'default' },
  ],
  uxNotes: [
    onCancel(`${W}/team/view/MemberPermissionsDialog.tsx:137`),
    {
      kind: 'decision',
      text: 'Ce que le RÔLE donne déjà n’est pas proposé en exception : coché, inerte, et dit comme tel — le montrer comme un accord laisserait croire à un privilège là où il n’y en a pas. La liste envoyée est COMPLÈTE (la route REMPLACE) : neuf rôles ne couvrent jamais une ESN réelle, d’où des exceptions nominatives plutôt que de monter tout le monde en admin.',
      source: `${W}/team/view/MemberPermissionsDialog.tsx:39`,
    },
  ],
}

// ─── Doctrine facturation ───────────────────────────────────────────────

const markInvoicedElsewhere: OverlaySpec = {
  id: 'app/overlays/facture-ailleurs',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/chat' },
  source: `${W}/missions/view/InvoiceReadinessPanel.tsx:729`,
  title: 'Préparer la facture',
  description: 'Data platform — lot 2',
  destructive: false,
  viewports: BOTH,
  body: [
    paragraph(
      'BellumAI n’émet rien : tu DÉCLARES qu’une facture est partie ailleurs, sans preuve de connecteur — l’écran le dira partout comme « déclaré », jamais « facturé ». Les trois champs sont facultatifs et restent vides si tu ne les remplis pas.',
    ),
    input('Référence de la facture', 'FA-2026-0142'),
    input('Montant facturé, en euros', 'Montant en euros'),
    input('Échéance de règlement'),
  ],
  actions: [CANCEL, { label: 'Enregistrer', variant: 'default' }],
  uxNotes: [
    onCancel(`${W}/missions/view/InvoiceReadinessPanel.tsx:731`),
    {
      kind: 'decision',
      text: '« Facturé » ne s’écrit que sur PREUVE du connecteur de l’outil branché par le client ; cette déclaration manuelle reste nommée « déclaré », jamais confondue avec « facturé » (c80). Un champ laissé vide reste vide — jamais 0 €, jamais une échéance inventée.',
      source: `${W}/missions/view/InvoiceReadinessPanel.tsx:702`,
    },
  ],
}

// ─── Billing, contexte, correction ──────────────────────────────────────

const upgradePlan: OverlaySpec = {
  id: 'app/overlays/changer-plan',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/billing' },
  source: `${W}/plan-features/PlanUpgradeDialog.tsx:31`,
  title: 'Veille',
  description: 'Disponible à partir de l’offre Team — Tes comptes suivis te préviennent quand quelque chose bouge.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Ce que Team débloque (49 €/mois)'),
    paragraph('✓ Découvrir — Trouve les comptes à cibler au lieu de les saisir un par un.'),
    paragraph('✓ Base de connaissance — Tes documents nourrissent les analyses et les messages de l’équipe.'),
  ],
  actions: [{ label: 'Passer à Team pour en profiter', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/plan-features/PlanUpgradeDialog.tsx:32`, 'le bouton « Passer à Team pour en profiter »'),
    {
      kind: 'decision',
      text: 'Ce qui s’ouvre sur un bouton grisé, jamais une réponse muette : le palier nomme son prix et liste tout ce qu’il débloque — même contenu que l’écran verrouillé pleine page, un seul endroit où cette promesse est écrite.',
      source: `${W}/plan-features/UpgradeBenefits.tsx:14`,
    },
  ],
}

const regenerateContext: OverlaySpec = {
  id: 'app/overlays/regenerer-contexte',
  surface: 'app',
  kind: 'confirm',
  parent: { page: 'app/settings-profile-context' },
  source: `${W}/profile-context/components/RegenerateContextButton.tsx:48`,
  title: 'Régénérer ton contexte IA ?',
  description:
    'BellumAI va relancer l’analyse de ton profil et remplacer le contexte actuel. La version actuelle reste consultable et restaurable dans « Versions ».',
  destructive: false,
  viewports: BOTH,
  actions: [CANCEL, { label: 'Régénérer', variant: 'violet' }],
  uxNotes: [focusNote(`${W}/profile-context/components/RegenerateContextButton.tsx:60`, '« Régénérer »')],
}

const reportCorrection: OverlaySpec = {
  id: 'app/overlays/signaler-correction',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/settings-profile-identity' },
  source: `${W}/profile/components/ReportCorrectionDialog.tsx:57`,
  title: 'Signaler une information fausse',
  description: 'Rien n’est modifié : ta demande part directement aux administrateurs de ton espace.',
  destructive: false,
  viewports: BOTH,
  body: [textarea('Pourquoi cette information est-elle fausse ?', 'Explique ce qui a changé…')],
  actions: [
    { label: 'Annuler', variant: 'ghost' },
    { label: 'Envoyer le signalement', variant: 'default' },
  ],
  uxNotes: [
    focusNote(`${W}/profile/components/ReportCorrectionDialog.tsx:67`, 'le champ de raison'),
    {
      kind: 'decision',
      text: 'Ce dialogue n’écrit JAMAIS le profil : la seule mutation possible est la demande de correction — la correction elle-même reste le geste de qui a le droit d’écrire (owner/admin/sales_ops).',
      source: `${W}/profile/components/ReportCorrectionDialog.tsx:26`,
    },
  ],
}

// ─── Entretiens, retours ─────────────────────────────────────────────────

const scheduleInterview: OverlaySpec = {
  id: 'app/overlays/planifier-entretien',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/projects-needs' },
  source: `${W}/submissions/view/ScheduleInterviewDialog.tsx:92`,
  title: 'Planifier un entretien avec Camille Martin',
  description:
    'La date part chez toi et chez le client. Programmer un entretien fait avancer ce positionnement à l’étape « Entretien ».',
  destructive: false,
  viewports: BOTH,
  body: [
    input('Date et heure'),
    {
      type: 'component',
      component: 'RadioGroup',
      props: { content: { legend: 'Format' }, items: ['Sur site', 'À distance', 'Téléphone'] },
    },
    input('Personnes côté client', 'Séparées par des virgules'),
    textarea('Notes'),
  ],
  actions: [
    { label: 'Annuler', variant: 'ghost' },
    { label: 'Planifier', variant: 'default' },
  ],
  uxNotes: [focusNote(`${W}/submissions/view/ScheduleInterviewDialog.tsx:101`, 'le champ « Date et heure »')],
}

const consultantFeedback: OverlaySpec = {
  id: 'app/overlays/retour-consultant',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/projects-needs' },
  source: `${W}/submissions/view/SubmissionConsultantFeedbackDialog.tsx:68`,
  title: 'Retour du consultant sur Camille Martin',
  description:
    'Ce que le consultant a dit après la présentation. Un bloc entièrement séparé du retour client — les deux ne se mélangent jamais.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Intérêt pour la mission'),
    {
      type: 'component',
      component: 'FilterChips',
      props: { items: ['Non abordé', 'En dessous', 'Correspond', 'Au-dessus'] },
    },
    heading('Compréhension du besoin'),
    {
      type: 'component',
      component: 'FilterChips',
      props: { items: ['Non abordé', 'En dessous', 'Correspond', 'Au-dessus'] },
    },
    heading('Sa décision'),
    {
      type: 'component',
      component: 'FilterChips',
      props: { items: ['Non abordé', 'En dessous', 'Correspond', 'Au-dessus'] },
    },
    textarea('Verbatim', '« Le poste l’intéresse, veut en savoir plus. »'),
  ],
  actions: [
    { label: 'Annuler', variant: 'ghost' },
    { label: 'Enregistrer le retour', variant: 'default' },
  ],
  uxNotes: [
    focusNote(`${W}/submissions/view/SubmissionConsultantFeedbackDialog.tsx:76`, 'le premier axe'),
    {
      kind: 'decision',
      text: '« Non abordé » est la valeur PAR DÉFAUT de chaque axe et veut dire que le consultant n’en a pas parlé. La confondre avec « en dessous » ferait un reproche que personne n’a formulé. Un retour vide n’est pas un retour : le bouton reste éteint tant qu’aucun axe n’est renseigné et que rien n’est écrit.',
      source: `${W}/submissions/view/SubmissionConsultantFeedbackDialog.tsx:20`,
    },
  ],
}

const clientFeedback: OverlaySpec = {
  id: 'app/overlays/retour-client',
  surface: 'app',
  kind: 'dialog',
  parent: { page: 'app/projects-needs' },
  source: `${W}/submissions/view/SubmissionFeedbackDialog.tsx:85`,
  title: 'Retour du client sur Camille Martin',
  description:
    'Ce que le client a dit après la présentation. Un axe dont il n’a pas parlé reste « non abordé » — le noter « en dessous » ferait un reproche que personne n’a formulé.',
  destructive: false,
  viewports: BOTH,
  body: [
    heading('Compétences techniques'),
    {
      type: 'component',
      component: 'FilterChips',
      props: { items: ['Non abordé', 'En dessous', 'Correspond', 'Au-dessus'] },
    },
    heading('Tarif'),
    {
      type: 'component',
      component: 'FilterChips',
      props: { items: ['Non abordé', 'En dessous', 'Correspond', 'Au-dessus'] },
    },
    textarea('Verbatim', '« Bon profil, cherchait plus senior en data. »'),
    textarea('Apprentissage (optionnel)', '« TJM annoncé 100 € trop haut. »'),
  ],
  actions: [
    { label: 'Annuler', variant: 'ghost' },
    { label: 'Enregistrer le retour', variant: 'default' },
  ],
  uxNotes: [
    focusNote(`${W}/submissions/view/SubmissionFeedbackDialog.tsx:93`, 'le premier axe'),
    {
      kind: 'decision',
      text: 'L’apprentissage reste attaché à CE positionnement — il n’est jamais relu pour réécrire le profil du consultant.',
      source: `${W}/submissions/view/SubmissionFeedbackDialog.tsx:32`,
    },
  ],
}

// ─── Import ──────────────────────────────────────────────────────────────

const importNeeds: OverlaySpec = {
  id: 'app/overlays/importer-fiches-poste',
  surface: 'app',
  kind: 'wizard',
  parent: { page: 'app/projects-needs' },
  source: `${W}/projects/open-needs/view/ImportNeedsDialog.tsx:171`,
  title: 'Importer des fiches de poste',
  description: 'Dépose plusieurs fiches de poste d’un coup — chacune devient un besoin, à relire avant création.',
  destructive: false,
  viewports: BOTH,
  body: [
    select('Compte client', 'Choisis le compte client'),
    paragraph('Glisse-dépose tes fichiers ici ou clique pour les parcourir'),
    paragraph('PDF, DOC, DOCX, TXT (max. 20 Mo par fichier, 10 fichiers par dépôt)'),
    paragraph('Relis chaque besoin avant de valider — une case décochée ne sera pas créée.'),
  ],
  actions: [CANCEL, { label: 'Extraire', variant: 'default' }],
  uxNotes: [
    focusNote(`${W}/projects/open-needs/view/ImportNeedsDialog.tsx:171`, 'le choix du compte client'),
    {
      kind: 'decision',
      text: 'Deux phases, jamais une création sans relecture : `extract()` ne fait qu’extraire (aucun besoin écrit) ; la création ne part qu’au clic sur le bouton de validation de l’écran de relecture, et seulement pour les lignes COCHÉES — un doublon signalé reste décoché par défaut.',
      source: `${W}/projects/open-needs/view/ImportNeedsDialog.tsx:46`,
    },
  ],
}

// ─── Popovers ──────────────────────────────────────────────────────────

const deleteSavedView: OverlaySpec = {
  id: 'app/overlays/supprimer-vue',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/projects-index' },
  source: `${W}/projects/view/SavedPipelineViews.tsx:86`,
  title: 'Vues enregistrées',
  destructive: false,
  viewports: BOTH,
  body: [
    dataRow('Mes affaires à signer', ''),
    dataRow('Grands comptes — T4', ''),
    paragraph('Chaque vue porte un bouton « Supprimer la vue « … » » (icône corbeille).'),
    input('Nom de la vue', 'Ex. : Mes affaires à signer'),
    { type: 'component', component: 'Button', props: { size: 'sm', content: { label: 'Enregistrer cette vue' } } },
  ],
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Le bouton « Supprimer la vue » supprime au premier clic, sans confirmation ni annulation possible — à ramener dans la grammaire des confirmations destructives (RUX-23) plutôt que de rester une corbeille nue.',
      source: `${W}/projects/view/SavedPipelineViews.tsx:124`,
    },
    {
      kind: 'decision',
      text: 'Au-delà de 20 vues sur ce pipe, le bouton « Enregistrer » se désactive et le dit : « au-delà, on ne choisit plus » — jamais une troncature silencieuse de la liste.',
      source: `${W}/projects/view/SavedPipelineViews.tsx:64`,
    },
  ],
}

const companyAutocomplete: OverlaySpec = {
  id: 'app/overlays/recherche-entreprise',
  surface: 'app',
  kind: 'popover',
  parent: { page: 'app/search' },
  source: `${W}/search/components/SearchAutocomplete.tsx:58`,
  title: 'Nom de l’entreprise (ex : Capgemini)',
  destructive: false,
  viewports: BOTH,
  body: [
    {
      type: 'component',
      component: 'SearchInput',
      props: { content: { placeholder: 'Nom de l’entreprise (ex : Capgemini)', value: 'roch' } },
    },
    paragraph('3 des résultats portent le nom « ROCHE ».'),
    dataRow('ROCHE SAS · Boulogne-Billancourt', '41 parcours observés'),
    dataRow('ROCHE BOBOIS · Paris', 'Aucun parcours observé'),
  ],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Ce qui distingue deux homonymes (ville, activité, effectif, SIREN) porte la ligne ; ce qu’elles partagent (le nom) ne se répète pas cinq fois sous cinq lignes — il s’annonce une fois, en tête. Un effectif non publié par le registre reste silencieux, jamais « 0 salarié ».',
      source: `${W}/search/components/SearchSuggestionItem.tsx:38`,
    },
  ],
}

export const APP_M_Z_OVERLAYS: readonly OverlaySpec[] = [
  writeToContact,
  followUpThread,
  positionConsultant,
  addToOutlook,
  createMissionFromDocument,
  markInvoicedElsewhere,
  createSequence,
  upgradePlan,
  regenerateContext,
  reportCorrection,
  createNeed,
  importNeeds,
  enroll2fa,
  exportMyData,
  scheduleInterview,
  consultantFeedback,
  clientFeedback,
  createTarget,
  importTarget,
  memberPermissions,
  deleteSavedView,
  companyAutocomplete,
]
