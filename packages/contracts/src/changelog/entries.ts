/**
 * Catalogue statique du changelog produit — LE propriétaire unique des ids.
 *
 * Il vivait dans `apps/web` tant que le seul consommateur était le panneau
 * « Nouveautés » de la sidebar. La Newsletter Changelog (email bimensuel envoyé
 * par l'API) en a fait un contrat partagé : l'API n'a pas à lire un fichier de
 * l'app web, donc les ids ET les libellés (`labels.fr.ts` / `labels.en.ts`)
 * ont déménagé ici. Un seul catalogue, deux consommateurs — pas de miroir à
 * resynchroniser, donc pas de divergence silencieuse possible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVENTION — KEEP THIS IN SYNC WITH WHAT WE SHIP (Louis, règle récurrente)
 * ─────────────────────────────────────────────────────────────────────────
 * Toute feature user-facing qui part en prod AJOUTE une entrée ici, AVANT le
 * merge. Non négociable — c'est ainsi qu'on peut toujours suivre le changelog
 * dans l'app. Process complet : `agent_docs/changelog-convention.md`.
 *
 * Pour ajouter une entrée :
 *   1. Choisir un `id` UNIQUE, préfixé par la date `AAAA-MM-JJ`. Plusieurs
 *      thèmes le même jour → suffixe court (`2026-07-16-credits`). L'`id`
 *      n'est jamais affiché ; seule la `date` (libellé) l'est.
 *   2. Ajouter l'objet `{ id, itemCount }` EN TÊTE du tableau (newest-first).
 *   3. Renseigner `entries.<id>.{date,title,item1..itemN}` dans les DEUX
 *      catalogues `labels.fr.ts` ET `labels.en.ts` (parité stricte —
 *      verrouillée par `changelog.test.ts`).
 *   4. `itemCount` = le nombre exact d'`itemN` (même test).
 * N'annoncer QUE des features réellement mergées — zéro vaporware.
 */

/** One catalogue row: the stable id and how many bullet points it carries. */
export type ChangelogEntryRef = { id: string; itemCount: number }

/**
 * Localised labels of ONE entry: `date`, `title` and `item1`…`itemN`.
 * Kept as a flat string map so the web can hand it straight to i18next as the
 * `changelog` namespace, and the API can read it without an i18n runtime.
 */
export type ChangelogEntryLabels = Record<string, string>

/** A whole language catalogue, shaped like the i18n namespace it feeds. */
export type ChangelogCatalog = {
  /** Libellés du panneau lui-même (titre du bouton « Nouveautés »). Le
   *  déménagement du catalogue vers ce package (#736) a laissé ce bloc derrière
   *  lui : le bouton affichait la CLÉ BRUTE `menu.title` en prod, et son
   *  aria-label valait « menu.title ». */
  menu: { title: string }
  entries: Record<string, ChangelogEntryLabels>
}

/** A fully resolved entry, labels included — what the UI and the email render. */
export type ChangelogEntry = {
  id: string
  date: string
  title: string
  items: string[]
}

/** Static ids + item counts, NEWEST FIRST. */
export const CHANGELOG_IDS: ChangelogEntryRef[] = [
  // #5048 #5046 #4944 (31/10) — « Mon profil » et « Tes outils » vivent dans le composeur ; le menu Outils et sources ne fait plus que dire l'état.
  { id: '2026-10-31-composeur-profil-et-outils-v8', itemCount: 3 },
  // #5043 (31/10) — « Idées de demandes » : une liste de demandes à gauche, un aperçu à droite ; la vue « Par domaine » part.
  { id: '2026-10-31-idees-de-demandes-liste-apercu', itemCount: 2 },
  // #5086 (31/10) — « Contrainte retenue » et « Précision » quittent le corps d'une réponse de Laura et se lisent dans le panneau Sources.
  { id: '2026-10-31-laura-notes-dans-sources', itemCount: 1 },
  // #5044 (31/10) — le corps d'une réponse de Laura ne plie plus rien : Sources, Limites et la note de substance passent dans le panneau Sources.
  { id: '2026-10-31-laura-corps-de-reponse-v8', itemCount: 2 },
  // #4345, #4309 (31/10) — « Demander à Laura » ouvre la bulle sur la page courante, aussi sur mobile, au lieu d'aller sur /chat.
  { id: '2026-10-31-laura-demander-sans-quitter-la-page', itemCount: 2 },
  // #5045 (31/10) — la recherche accompagnée de Laura : statut, étape en cours et « x sur y » lus à l’état réel du travail.
  { id: '2026-10-31-laura-recherche-accompagnee-v8', itemCount: 2 },
  // #2323.19-.23 / #2323.46 (31/10) — la fiche besoin dit où il en est : matchable, présentable, prêt à engager, et ce qui manque.
  { id: '2026-10-31-besoin-resume-qualite', itemCount: 2 },
  // #5032 (31/10) — le pied de réponse de Laura tient sur une rangée invisible au repos : Sources, Copier, Enregistrer, Ajuster, ⋯.
  { id: '2026-10-31-laura-pied-de-reponse-v8', itemCount: 3 },
  // Intégration anciennes (29/10, #4293.7 #4401.1 #4418.1 #4420.4 #4291.8 #4287.4) — journée sans agenda, actions écartées dites, secteur coché, projet gagné, une seule famille de rendu.
  { id: '2026-10-29-anciennes-journee-secteur-mission-famille', itemCount: 11 },
  // #4611 (28/10) — Laura dit où en est le travail lancé : analyses, imports, enrichissements, synchros CRM, rattrapages.
  { id: '2026-10-28-avancement-du-travail-lance', itemCount: 3 },
  // Vague XIX (27/10, #4305 #4503) — Découvrir dit ce qui reste à chercher ; l'e-mail d'un contact se coupe d'abord à « @ » ; la ville du compte sur la ligne.
  { id: '2026-10-27-vague-xix-portee-recherche-email-coupe', itemCount: 3 },
  // Vague XVII (27/10, #4647 #4626 #4419 #4643 #4644 #4525.5 #4524.9) — dates en toutes lettres lues, nom de personne, listes égales à leur bande, onglet Appel.
  { id: '2026-10-27-vague-xvii-dates-listes-appel', itemCount: 4 },
  // Vague XV (26/10, #4632 #4419 #4627 #4626 #4617 #4621 #4546.4 #4609) — Découvrir : une seule recherche, l'entonnoir par critère, la zone recomptée, un registre qui refuse se dit ; compte archivé nommé, plusieurs boîtes Google, 404 du mail classé.
  { id: '2026-10-26-vague-xv-decouvrir-comptes-mail', itemCount: 5 },
  // VAGUE XIV (26/10) — #4419 #4627 #4628 #4626 #4433.17 #4631 #4284.5 — Découvrir : entonnoir par critère, annoncé = rendu, zone demandée tenue.
  { id: '2026-10-26-decouvrir-entonnoir-annonce-rendu', itemCount: 5 },
  // VAGUE XIV (26/10) — #4610 #4417.1 #4408.1 #4631 #4293.7 #4432.4 #4590.2 #4437.5 #4290.18 #4290.19 #4289.12 #4294.11 #2843.14 #4623 #4625 #4464.2 — Laura, contacts, reprise CRM, interface.
  { id: '2026-10-26-laura-contacts-crm-interface', itemCount: 8 },
  // FIX RECETTE C (25/10, #4292.13 #4295.21 #4286.11 #4324.1) — aperçu PDF du dossier, partenaires « estimé », demandeur d'une offre sur la fiche, raison d'un rôle non identifié.
  { id: '2026-10-25-fix-recette-c', itemCount: 4 },
  // lot FIX-RECETTE-B (25/10) — #4409 / #4408 / #4396 / #4398 / #4405 — Analyser, chat, Veille du compte, boîte mail.
  { id: '2026-10-25-recette-b', itemCount: 4 },
  // #4323.2 / #4420.4 / #4403.1 / #4327.2 / #4283.8 (lot FIX-RECETTE-2510, 25/10) — recette prod : Concurrence au compte juste, écartés de Découvrir comptés, Signaux métier d'abord, filiale non confirmée dite, « Suivre » dans la fiche.
  { id: '2026-10-25-fix-recette-concurrence-ecartes-signaux-filiales-suivre', itemCount: 5 },
  // #4521 (lot RAFALE-EMAILS, 24/10) — Ma journée › Traiter : E-mails nomme le contact et le signal sur chaque carte du plan, et génère le mail à la demande.
  { id: '2026-10-24-rafale-emails-4521', itemCount: 2 },
  { id: '2026-10-24-mon-crm-comptes', itemCount: 2 },
  // #4520 + #4529.9 (25/10) — barre latérale allégée (plus de rangée d'identité au pied), « Ma cible » ne pose plus de taille.
  { id: '2026-10-25-barre-allegee-ma-cible', itemCount: 3 },
  // #4532/#4533/#4534/#4535 (24/10) — Mes données en deux onglets Exports · Imports, « Retour à l'app » fiable, Raccourcis dans Préférences.
  { id: '2026-10-24-parametres-mes-donnees', itemCount: 3 },
  // #4528 (24/10) — Talents garde la personne : les présentations vivent à un seul endroit, Affaires › Présentations.
  { id: '2026-10-24-talents-sans-presentations', itemCount: 2 },
  // #4421.15-.18 + #4419.30 (lot DÉCISIONS, 25/10) — « Obtenir l'e-mail » d'une personne proposée hors espace ; registre public plus rapide.
  { id: '2026-10-25-laura-revele-email', itemCount: 2 },
  // #4421 (lot LAURA-MISSIONS, 24/10) — « trouve-moi une mission » : CV joint lu, offres CDI et recrutement, collecte fraîche, besoins ouverts en plus.
  { id: '2026-10-24-laura-missions-cv-joint', itemCount: 4 },
  // DÉCOUVRIR NEUTRE + « MA CIBLE » (24/10) — #4529 #4530 : arrivée sans filtre, bouton bascule à la place du panneau.
  { id: '2026-10-24-decouvrir-ma-cible', itemCount: 4 },
  // DÉCOUVRIR-RÉCOLTE (24/10) — #4419 #4515 #4516 #4518 #4519 #4493.7 : plus de comptes, ville à 25 km, taille proposée.
  { id: '2026-10-24-decouvrir-recolte', itemCount: 5 },
  // #4536 (lot VOCAL-DEUX-BOUTONS, 24/10) — deux boutons vocaux au lieu de trois : Dicter (🎤) et Conversation (〰️) ; l'interrupteur de la dictée disparaît.
  { id: '2026-10-24-vocal-deux-boutons', itemCount: 2 },
  // #4471 / #4469 / #4479 (25/10) — corrections : doublons lus sur tout l'espace, compétence hors lieu, noms de contacts sans erreur.
  { id: '2026-10-25-corrections-doublons-competence', itemCount: 3 },
  // RESTES-A (25/10, #4474) — l'icône d'un bouton ne chevauche plus son libellé (Contacter, Compléter…).
  { id: '2026-10-25-restes-a-icone-bouton', itemCount: 1 },
  // APPROCHE (25/10, #4524, #4525) — « Sur quoi Laura s'appuie » avant de générer, et l'appel devient un onglet de la page d'approche.
  { id: '2026-10-25-approche-sur-quoi-appuyer', itemCount: 3 },
  // PR 12C TUTOIEMENT (24/10) — l'interface tutoie partout, comme Laura ; seuls les messages destinés aux prospects vouvoient.
  { id: '2026-10-24-pr12c-tutoiement', itemCount: 1 },
  // PR 12C AM.58 (24/10) — « Ajouter un CV » directement dans le fil de Laura, sans quitter la conversation.
  { id: '2026-10-24-pr12c-am58-cv-dans-le-fil', itemCount: 2 },
  // PR 12C pannes (24/10, #4470-#4486) — Laura relit la dernière perte, listes de contacts complètes, doublons sur tout l'espace, et un bandeau pour clore les vieilles relances.
  { id: '2026-10-24-pr12c-bugs', itemCount: 4 },
  // PR 12C ARBITRAGES (24/10) — Signaler et Exporter à leur place, « Créer sa fiche » dans l'organigramme, carte d'affaire allégée, Intégrations épurée.
  { id: '2026-10-24-pr12c-arbitrages', itemCount: 4 },
  // PR 12C restes (24/10) — repère CRM dans la hiérarchie, approche directe gardée depuis le composer, écartés hors secteur.
  { id: '2026-10-24-pr12c-restes', itemCount: 3 },
  // PR 12C NAV (24/10, #4491, #4492) — sous-menus V22 sous l'entrée active, Équipe et Pilotage sous Ma journée.
  { id: '2026-10-24-pr12c-navigation-v22', itemCount: 4 },
  // PR 12C (24/10) — Intégrations : en-tête et cartes au dessin de la maquette V22, le détail dans le tiroir (#4510, #4511).
  { id: '2026-10-24-pr12c-integrations', itemCount: 2 },
  // PR 12C lot ANALYSER (#4512, 24/10) — « Analyser un compte » au dessin V22, réglages fins repliés sous Personnalisation.
  { id: '2026-10-24-pr12c-analyser', itemCount: 3 },
  // PR 12C COMPTES-FICHE (24/10) — l'en-tête de la fiche compte au dessin V22 (#4507), plus de ligne recherche + parcours (#4508), plus de pistes d'organigramme dans Contacts (#4509).
  { id: '2026-10-24-pr12c-comptes-fiche-en-tete', itemCount: 4 },
  // #4505 / #4506 (lot PR12C-SIGNAUX, 24/10) — Signaux au dessin V22 (grille, barre, sans mur de comptes) ; Mes veilles en tableau, veille multi-comptes, plafond de 3 comptes suivis tenu.
  { id: '2026-10-24-pr12c-signaux-veilles', itemCount: 3 },
  // #4499 (PR 12C, 24/10) — Affaires reprise au dessin de la maquette V22 : en-tête sobre, ligne de synthèse, menu « … ».
  { id: '2026-10-24-pr12c-affaires-v22', itemCount: 4 },
  // FICHE CONTACT (24/10) — #4522 badges courts « disponible », #4523 le bas de la fiche en rangées pleine largeur.
  { id: '2026-10-24-fiche-contact-rangees', itemCount: 2 },
  // PR 12C TALENTS (#4500, #4501, #4502, 24/10) — Vivier allégé (recherche + modale Filtres, cinq colonnes), Recrutement à cinq étapes, Présentations en tableau.
  { id: '2026-10-24-pr12c-talents', itemCount: 3 },
  // PR 12C CONTACTS (24/10) — #4503 répertoire (onglets, ligne, puces, doublons), #4504 fiche contact (en-tête compact).
  { id: '2026-10-24-pr12c-contacts', itemCount: 4 },
  // PR 12C API BRANCHÉE (24/10) — ville et sujet de recherche, filtres multi-sélection, poste du consultant, équipe lisible, onglets de Contacts.
  { id: '2026-10-24-pr12c-api-branchee', itemCount: 5 },
  // PR 12C (24/10) — Comptes au dessin V22 : une rangée de menus, la modale « Filtrer mon portefeuille », l'Intérêt et ses axes.
  { id: '2026-10-24-pr12c-comptes-liste', itemCount: 4 },
  // PR 12C DÉCOUVRIR (24/10) — #4493 page, #4494 « Cadrer la recherche », #4495 cartes de comptes (maquette V22).
  { id: '2026-10-24-pr12c-decouvrir', itemCount: 3 },
  // N-WEB-B (23/10) — « Ma journée » nomme l'écran, Signaux et Recherche récupèrent leurs anciennes adresses, la recette du 23/10.
  { id: '2026-10-23-n-web-b-ma-journee-et-recette', itemCount: 5 },
  // Refonte Théo (23/10) — « Tes comptes » : chiffres, Reprendre le fil, quatre onglets, décision d'équipe en mots.
  { id: '2026-10-23-theo-comptes-import', itemCount: 4 },
  { id: '2026-10-23-theo-comptes-liste', itemCount: 6 },
  // Refonte Théo (23/10) — la fiche compte : « Ce que je sais » en un seul panneau, « Par qui commencer » sur 10 personnes, « Décideur » dans chaque liste, organigramme en arbre.
  { id: '2026-10-23-theo-refonte-comptes-fiche', itemCount: 13 },
  // Théo PR12 (23/10) — Mes cibles (maquette validée), Marché, fiche de zone, Partenaires et Brief d'avant-rendez-vous passent au design Théo : en-têtes à la coque, vrais onglets, tableaux communs, badge Décideur.
  { id: '2026-10-23-theo-pr12-comptes-plus', itemCount: 4 },
  // Refonte Théo (23/10, lot CONTACTS-A) — le répertoire annonce « N doublons à relire » en bandeau ; la relecture s'ouvre dans une fenêtre.
  // Refonte Théo (23/10, lot CONTACTS-A) — le répertoire reprend la maquette : en-tête, synthèse, puces, tableau paginé, barre de sélection.
  // Refonte Théo (23/10, lot CONTACTS-A) — Mes listes : une grille de cartes, renommer, supprimer la liste seule, ressortir.
  // Refonte Théo (23/10, lot CONTACTS-A) — fiche contact : trois colonnes, priorité en mots, plus aucun score en points.
  { id: '2026-10-23-theo-contacts-a-fiche-contact', itemCount: 3 },
  { id: '2026-10-23-theo-contacts-a-mes-listes', itemCount: 2 },
  { id: '2026-10-23-theo-contacts-a-repertoire', itemCount: 4 },
  { id: '2026-10-23-theo-contacts-a-bandeau-doublons', itemCount: 1 },
  // Théo B contacts-b (23/10) — « Prépare ton appel » sur sa page ; « Imports & sources » (six sources, historique en tableau, reprise) ; l'assistant d'import en quatre étapes.
  { id: '2026-10-23-theo-contacts-b', itemCount: 3 },
  // Refonte Théo (23/10) — Découvrir (en-tête, barre d'exploration, pistes, indicateurs, répartition, tiroir « Aperçu du compte »), Signaux en bibliothèque de cartes, Mes veilles et Mes recherches ; la démo montre trois recherches enregistrées.
  { id: '2026-10-23-theo-refonte-decouvrir', itemCount: 4 },
  // Théo PR12 (23/10) — lots d'analyse, radar, Ta journée, tableau de bord, connecteurs et facturation dans la grammaire Théo.
  { id: '2026-10-23-refonte-decouvrir-integrations-facturation', itemCount: 3 },
  // Refonte Théo (23/10) — Aujourd’hui : une seule file triée par urgence, des tuiles de synthèse, un sélecteur Moi / Équipe.
  { id: '2026-10-23-theo-aujourdhui-file-unique', itemCount: 5 },
  // Louis 23/10 (lot R23-N-WEB-A) — « Ta journée » : le titre de la maquette, et ce que la vue jour PR11 portait en plus revient dans l'écran Théo.
  { id: '2026-10-23-r23-ta-journee-portefeuille', itemCount: 3 },
  // Théo PR12 (23/10, lot actions-plus) — détail d'une action, journal des essais, REX, point d'équipe, « Des comptes pour… » : la grammaire des maquettes.
  { id: '2026-10-23-pr12-actions-plus-grammaire-theo', itemCount: 3 },
  // Théo C (23/10) — Séquences refaites comme leurs maquettes : liste, bibliothèque de modèles, détail de campagne, assistant.
  { id: '2026-10-23-theo-sequences', itemCount: 4 },
  // THEO-REFONTE-MESSAGERIE (23/10) — reporter un échange, créer une tâche liée, régénérer la réponse de Laura ;
  // la boîte de réception en deux volets (liste + lecture), intentions combinables, « Nouveau message ».
  { id: '2026-10-23-theo-messagerie', itemCount: 6 },
  // Refonte Théo (23/10) — Affaires : une barre Pipeline · Besoins · Présentations sur les trois écrans, sans repasser par une fiche.
  { id: '2026-10-23-affaires-onglets', itemCount: 5 },
  // Refonte Théo (23/10) — Talents : Vivier, Recrutement, fiche talent, « Où placer ».
  { id: '2026-10-23-talents-theo', itemCount: 4 },
  // Louis 23/10 (lot R23-N-WEB-A) — Vivier : « Mes vues » (les vues enregistrées) revient dans la barre de Théo.
  { id: '2026-10-23-r23-vivier-mes-vues', itemCount: 1 },
  // THEO-REFONTE-MISSIONS-A (23/10) — Planning, dossier de mission, relevés d'activité et prêt à facturer refaits comme leurs maquettes.
  { id: '2026-10-23-theo-refonte-missions-a', itemCount: 4 },
  // Refonte Théo (23/10, lot MISSIONS-B) — Vue financière : chiffres du mois, marge mesurée, quatre prochaines semaines, ce qui sort.
  { id: '2026-10-23-theo-refonte-missions-finance', itemCount: 1 },
  // Refonte Théo (23/10, lot MISSIONS-B) — Encaissements : règlements à rapprocher, suivi rédigé par Laura, filtres multiples, journal ; « Ce qui sort » passe dans la vue financière.
  { id: '2026-10-23-theo-refonte-missions-encaissements', itemCount: 1 },
  // Refonte Théo (23/10, lot MISSIONS-B) — Factures : titre, guide, tuiles-filtres, filtres multiples et fenêtre d’une facture.
  { id: '2026-10-23-theo-refonte-missions-factures', itemCount: 1 },
  // Théo PR12 (23/10) — Notes de frais, Facturation et Nouvelle mission refondus dans la grammaire des maquettes Missions.
  { id: '2026-10-23-theo-pr12-missions-plus', itemCount: 4 },
  // Théo D (23/10) — Équipe : six onglets, sous-onglets réels, vue d'ensemble, objectifs & affaires, activité & échanges.
  { id: '2026-10-23-theo-equipe', itemCount: 6 },
  // Théo D (23/10) — Pilotage refait comme la maquette : tuiles, cap du mois, encaissement, décisions, moi / équipe.
  { id: '2026-10-23-theo-pilotage', itemCount: 6 },
  // Louis 23/10 (lot R23-N-WEB-A) — Pilotage : le Cockpit de Théo dans la section Cockpit, l'offre lue par la route, chargement direct réparé.
  { id: '2026-10-23-r23-pilotage-cockpit-theo', itemCount: 2 },
  // Refonte Théo (lot ÉQUIPE, 23/10) — le point d’équipe, l’administration en trois sous-onglets, Plans & actions, Recherches et la fiche d’un membre.
  { id: '2026-10-23-theo-refonte-equipe', itemCount: 4 },
  // (23/10) — refonte Théo des Réglages : les six écrans refaits d'après leurs maquettes.
  { id: '2026-10-23-theo-refonte-reglages', itemCount: 8 },
  // 23/10 — refonte Théo PR12 : les réglages de l'espace prennent la grammaire des maquettes (en-tête, blocs, onglets).
  { id: '2026-10-23-theo-pr12-reglages-espace', itemCount: 4 },
  // (23/10) — refonte Théo des Réglages personnels (PR12) : profil, audit, contexte, et les écrans perso.
  { id: '2026-10-23-theo-pr12-profil-etapes', itemCount: 7 },
  // Refonte Théo (PR12, 23/10) — connexion, inscription, démo, invitation et pages publiques reprennent la grammaire de l'onboarding.
  { id: '2026-10-23-pr12-acces-refonte-theo', itemCount: 2 },
  // Théo O (23/10) — refonte de l'onboarding : l'essentiel en cinq blocs, le guide en huit étapes, le lancement après la validation.
  { id: '2026-10-23-refonte-onboarding-cadrage', itemCount: 4 },
  // (lot PR12-ONBOARDING-PARCOURS, 23/10) — les écrans Entreprise et Offre du parcours d'arrivée prennent l'en-tête, le pied et les repères de la nouvelle maquette.
  { id: '2026-10-23-pr12-parcours-onboarding-refonte', itemCount: 3 },
  // Coque Théo (23/10) — barre latérale, barre du haut, en-tête de page et jetons des maquettes appliquées.
  { id: '2026-10-23-coque-theo', itemCount: 4 },
  // Composants globaux Théo (23/10) — recherche ⌘K, Laura, cloche, aide, bandeaux, lanceurs.
  { id: '2026-10-23-composants-theo', itemCount: 6 },
  // Refonte Théo (23/10) — « Analyser un compte » refait comme sa maquette, « Mes analyses » (historique de l'espace, même route), Laura : cartes de réponse en grille avec le prochain geste.
  { id: '2026-10-23-refonte-analyser-laura', itemCount: 5 },
  { id: '2026-10-23-recette-corrections', itemCount: 4 },
  // Refonte Théo (23/10, lot trous) — fiche besoin en sous-onglets, liste des missions en multi-sélection, historique des imports en tableau, assistant d'import en quatre temps.
  { id: '2026-10-23-theo-trous-ecrans', itemCount: 4 },
  // #4490.1 / #4490.2 (23/10) — Découvrir : aucune recherche ne part seule à l'arrivée, et « Arrêter » coupe une recherche en cours.
  { id: '2026-10-23-4490-decouvrir-aucune-recherche-seule-arreter', itemCount: 2 },
  // #4429, #4433.3, #4469, #4396.1, #4347.2, #4401.1 (lot R23-FIX-RECETTE-M, 23/10) — zone élargie par paliers sur une compétence, offres du métier, brouillon sans doublon, nom de CV.
  { id: '2026-10-23-recette-m', itemCount: 4 },
  // #4418.1 / #4467 / #4294.6 / #4291.8 (23/10) — relances J+3/J+6/J+9, synchro CRM expliquée, signaux dédoublonnés, projets signés suivis.
  { id: '2026-10-23-relances-synchro-projets', itemCount: 4 },
  // #4462.2, #4462.3, #4421.3, #4289.4, #4437.5, #4295.27, #4427.3 (lot R23-O, 23/10) — liste de comptes à analyser, contacts en clair par compte, alternatives motivées, offres rattachées, signature d'une proposition, statut Lemlist gardé.
  { id: '2026-10-23-r23-o-laura-listes-contacts-signature', itemCount: 6 },
  // #4399.2, #4327.1, #4399.5, #4399.6, #4399.7 (lot R22-FAIL-F1, 22/10) — fiche compte : besoins d'équipe, périmètres, personnes du plan, étapes sans répétition, message qui cite le compte.
  { id: '2026-10-22-r22-fail-f1-fiche-compte', itemCount: 5 },
  // #4418.1, #4283.8, #4347.2, #4344.2, #4299.1 (lot F2, 22/10) — « Marquer envoyé » au plan d'un contact, prochaine mise à jour des comptes suivis, message au consultant tutoyé, carte du pipe → fiche du besoin.
  { id: '2026-10-22-f2-marquer-envoye-suivis-besoin-tutoiement', itemCount: 5 },
  // #4405.1 / #4417.1 (22/10) — « Préparer la réponse » et « réponds au dernier mail » lisent le fil par son identifiant.
  { id: '2026-10-22-f3-reponse-lit-le-fil', itemCount: 1 },
  // #4424.3 (22/10) — « Préparer le RDV » reste sur le dossier de la mission, plus seulement sous le toast de création.
  { id: '2026-10-22-f3-mission-preparer-rdv', itemCount: 1 },
  // #4415.2 / #4426.2 / #4426.4 / #4426.7 / #4290.2 (23/10) — recette Julien : chaque étape du plan a son geste, le tier se lit sur la ligne, les campagnes importées restent visibles, la synchro CRM se dit pareil partout.
  { id: '2026-10-23-recette-e-plan-tier-campagnes-synchro', itemCount: 4 },
  // R23-FIX-RECETTE-F (23/10) — préparer le RDV depuis la mission, élargissement de zone juste, classement de fin de lot, secteur filtre la compétence.
  { id: '2026-10-23-recette-f', itemCount: 4 },
  // #4386.1, #4386.4, #4399.2, #4437.5 (23/10, recette) — Laura retrouve « Théo Haddad chez Bellum », le vide d'une recherche de personne nomme les sources interrogées, « Autres besoins » sous les équipes, compétence et famille sur les offres à intitulé libre.
  { id: '2026-10-23-r23-g-recette-personnes-besoins-offres', itemCount: 4 },
  // #4396.1 / #4398.1 / #4401 / #4465 / #4285.1 / #4291.7 / #4283.8 / #4191.9 (lot R23-FIX-RECETTE-H, 23/10) — recette prod : Recrutements hors métier, CV, Contacts, levée démo, forfait, ré-analyse, porteur des affaires démo.
  { id: '2026-10-23-recette-h', itemCount: 7 },
  // #4464.1–.4 (23/10) — recette K : le refus pour solde de l'écran de confirmation d'analyse est le frein doux commun, avec le lien vers l'équipe.
  { id: '2026-10-23-4464-frein-doux-confirmation-analyse', itemCount: 1 },
  // #4420 (22/10) — Découvrir par compétence : toute la plage d'offres lue est rendue, et un zéro dont les sources n'ont pas toutes répondu ne dit plus « aucune offre ».
  { id: '2026-10-22-decouvrir-offres-plage-entiere', itemCount: 2 },
  // #4324.1 / #4426.7 (22/10) — rejeu des contacts : « IT / DSI » reste un angle mort sans DSI, les archivés ne comptent plus, un décideur cité dans un signal devient une piste, le bilan d'import dit les mails.
  { id: '2026-10-22-julien-rejeu-contacts', itemCount: 4 },
  // #4290.17 / #4324.1 / #4426.1 / #4426.8 (22/10) — recette Julien : la synchro Pipedrive se dit avant le branchement, un DSI absent dit pourquoi, un seul endroit pour déposer ses documents, Laura voit les imports de l'écran.
  { id: '2026-10-22-recette-julien', itemCount: 4 },
  // #4466 (22/10) — Facturation : le forfait, le moyen de paiement et les factures, sans compteur ni recharge de crédits.
  { id: '2026-10-22-4466-facturation-forfait-factures', itemCount: 1 },
  // #4463 / #4464 (22/10) — plus aucun compteur ni coût affiché dans l'app ; un espace très sollicité reçoit un message humain et un contact.
  { id: '2026-10-22-aucun-credit-visible', itemCount: 3 },
  // #4469 (22/10) — Découvrir par compétence : une compétence se cherche dans le métier de l'offre, jamais dans son lieu.
  { id: '2026-10-22-competence-hors-lieu', itemCount: 1 },
  // Théo A (22/10) — Mon agenda en liste, ajouter / reprogrammer un rendez-vous par une modale ; Importer dans le portefeuille en une modale.
  { id: '2026-10-22-agenda-liste-import-modale', itemCount: 3 },
  // Théo B c5 (22/10) — fiche contact : deux colonnes, badge de relation à déclarer, source des signaux, brouillon dans le fil.
  { id: '2026-10-22-fiche-contact-deux-colonnes', itemCount: 4 },
  // Théo C actions-aujourdhui (22/10, lot r22-ecran-c1) — Actions en trois onglets, états de la file, brouillons de la messagerie.
  { id: '2026-10-22-r22-c1-actions-trois-onglets', itemCount: 4 },
  // Théo C (22/10) — Séquences : l'écran des campagnes (audience, modèles de départ) et la séquence en page.
  { id: '2026-10-22-sequences-ecran-campagnes', itemCount: 3 },
  // Théo C (lot r22-ecran-c3, 22/10) — Actions retrouve son onglet Automatisations ; l'assistant de séquence part d'une audience.
  { id: '2026-10-22-theo-c3-automatisations-et-assistant-sequence', itemCount: 3 },
  // Théo C refonte (23/10, lot theo-refonte-automations) — liste en cartes, bibliothèque fusionnée avec les modèles, éditeur en quatre maillons.
  { id: '2026-10-23-theo-refonte-automatisations', itemCount: 3 },
  // Théo C automations-bibliotheque / automations-editeur (22/10) — bibliothèque de routines, journal des essais, éditeur de règle à brouillon testé.
  { id: '2026-10-22-theo-c-automatisations', itemCount: 3 },
  // Théo C projects-fiche / projects-presentations (22/10) — la fiche affaire en trois onglets, Présentations, la proposition fondue.
  { id: '2026-10-22-fiche-affaire-presentations', itemCount: 3 },
  // Théo C projects-besoins (22/10) — Besoins : trois statuts, source cliquable, fiche dans la grammaire de l'affaire.
  { id: '2026-10-22-besoins-trois-statuts', itemCount: 3 },
  // Théo C projects-rapprochement (22/10) — critères étayés / à confirmer et interrupteur à deux sens.
  { id: '2026-10-22-rapprochement-deux-sens', itemCount: 2 },
  // Théo C talents-comptes (22/10) — fiche talent : « Des comptes pour {prénom} », un seul classement de comptes.
  { id: '2026-10-22-talent-des-comptes', itemCount: 2 },
  // Théo C missions-planning (lot R22-ECRAN-C11, 22/10) — Planning : échéances à préparer, filtre « Bloquées », conflits signalés, export, onglet Notes de frais.
  { id: '2026-10-22-c11-missions-planning-echeances', itemCount: 4 },
  // Dossier de mission (22/10) — ce qui bloque le démarrage en tête, cycle de vie en cinq étapes, onglets renommés.
  { id: '2026-10-22-dossier-mission-bloquants', itemCount: 3 },
  // Théo C missions-preparation (22/10) — Prêt à facturer : chaîne en 4 étapes, quatre tuiles montants, contrôle ADV en pied.
  { id: '2026-10-22-r22-pret-a-facturer', itemCount: 2 },
  // Théo C missions-cra (22/10) — Relevés d'activité : chaîne en 4 étapes, quatre tuiles d'état, menu État, export de la sélection.
  { id: '2026-10-22-r22-releves-activite', itemCount: 3 },
  // Théo C (22/10) — Factures : la liste des documents, de la préparation au solde ; Encaissements : encours, ancienneté, et les paiements sortants au même endroit.
  { id: '2026-10-22-theo-c-factures-encaissements', itemCount: 3 },
  // Théo C missions-finance (22/10) — Missions › Finance : la vue financière, avec les cessions d'affacturage en section.
  { id: '2026-10-22-missions-finance-cessions', itemCount: 2 },
  // R22-ECRAN-c16 (22/10) — Notes de frais devient un onglet de Missions ; le barème se lit sur chaque note, sans « conforme » tiré d'un silence.
  { id: '2026-10-22-r22-c16-notes-de-frais-onglet', itemCount: 3 },
  { id: '2026-10-22-equipe-point-equipe', itemCount: 3 },
  // Théo D5 (22/10) — Préférences en trois onglets (Affichage · Mon identité · Raccourcis), densité, Laura sur ⌘J et recherche sur ⌘K.
  { id: '2026-10-22-theo-d5-preferences', itemCount: 3 },
  // Théo D5 (22/10) — Notifications en cinq familles, plage de tranquillité ; Sécurité en rubriques.
  { id: '2026-10-22-theo-d5-notifications-securite', itemCount: 3 },
  // Théo D5 (22/10) — Mes données : trois cartes en tête, confidentialité et conservation en bas de page.
  { id: '2026-10-22-theo-d5-mes-donnees', itemCount: 2 },
  // R22-ECRAN-d6 (22/10) — Réglages › Mon espace et Réglages › Laura : pages à onglets, signature et pied de document, profil et mémoire.
  { id: '2026-10-22-r22-d6-reglages-espace-laura', itemCount: 4 },
  // Théo O onboarding-accueil (22/10) — l'accueil de l'onboarding en trois temps : bienvenue, comprendre, rencontrer Laura.
  { id: '2026-10-22-onboarding-accueil', itemCount: 2 },
  // #4307.3, #4436.3, #4419.8, #4421.3, #4430.9, #4403.1, #4409 (recette PR9) — les correctifs sur le chemin servi.
  { id: '2026-10-22-recette-pr9-chemins-servis', itemCount: 4 },
  // #4434.3 / #4438.1 / #4408 / #4432.2 (lot R22-FIX-RECETTE-PR9-LAURA, 22/10) — Laura agit sans demander le périmètre, filtre par métier recruté, met à part les filiales ; /search reprend la zone.
  { id: '2026-10-22-laura-agit-metier-recrute-zone', itemCount: 4 },
  // #4347.2, #4323.1, #4324.2, #4327.1, recette 23/10 (lot R22-FIX-RECETTE-C) — message au consultant tutoyé, compteur ESN sans total partiel, rôles « non identifiés », filiale du vocabulaire, date 1900 masquée.
  { id: '2026-10-23-r22-fix-recette-c', itemCount: 5 },
  // #4386.2 (recette prod 23/10) — recherche globale : prénom + nom + entreprise tapés ensemble, dans le désordre.
  { id: '2026-10-23-recherche-prenom-nom-entreprise', itemCount: 1 },
  // #4459.2 (recette prod 23/10) — compte venu de HubSpot : « Déjà dans ton CRM » aussi pour les contacts reliés par la synchro.
  { id: '2026-10-23-deja-dans-ton-crm-relies', itemCount: 1 },
  // #4418.1 (recette prod 23/10) — « Marquer envoyé » sur le brouillon d'un email : déclaratif, planifie les relances.
  { id: '2026-10-23-marquer-envoye-brouillon', itemCount: 2 },
  // #4433.2, #4435.2 (22/10) — Découvrir : une compétence inconnue s'élargit au domaine, un secteur voisin s'affiche vraiment.
  { id: '2026-10-22-paliers-competence-secteur-voisin', itemCount: 3 },
  // #4436.3 / #4432.2 (lot R22-TZ, 22/10) — taille non publiée au lieu de « 0 salarié » ; la boîte Analyser reprend la zone cherchée d'un siège hors zone.
  { id: '2026-10-22-taille-non-publiee-zone-analyser', itemCount: 2 },
  // Théo O onboarding-couverture (22/10) — l'onboarding V23 : 26 précisions de cadrage facultatives, plus aucun plafond de sélection, le vivier dès la création.
  { id: '2026-10-22-onboarding-v23-cadrage', itemCount: 3 },
  // Théo D (22/10) — Équipe : Objectifs & affaires, Plans & actions, fiche d'un membre ; une cible se propose, le membre répond.
  { id: '2026-10-22-d3-equipe-objectifs-plans-fiche-membre', itemCount: 4 },
  // Théo D (22/10) — Équipe : Recherches de l'équipe, Activité & échanges, Administration (membres, droits, règles).
  { id: '2026-10-22-theo-d-equipe-recherches-activite-admin', itemCount: 4 },
  // Théo A today-jour (22/10) — « Ta journée » : quatre chiffres, « Commencer ici », plan, rendez-vous ; le Tableau de bord n'existe plus.
  { id: '2026-10-22-ta-journee', itemCount: 3 },
  // Théo A signaux (22/10) — Signaux devient une bibliothèque d'informations par compte, avec ses veilles à cadence.
  { id: '2026-10-22-signaux-bibliotheque', itemCount: 3 },
  // R22 a7 (22/10) — dossier de référence : archive figée en lecture seule, copie de travail, sections propres, identités à revalider.
  { id: '2026-10-22-dossier-reference-archive', itemCount: 4 },
  // Théo B c3-imports-sources / c4-assistant-import (22/10) — Contacts › Imports & sources, et un assistant à quatre étapes où tout import est vérifié ligne à ligne avant d'écrire.
  { id: '2026-10-22-r22-contacts-imports-sources-verification', itemCount: 4 },
  // Théo B r1-recherche (22/10) — « Analyser un compte » : trois étapes, objectifs multiples, angle, tous les réglages sous « Affiner ».
  { id: '2026-10-22-r22-recherche-cadrage-en-trois-etapes', itemCount: 4 },
  // Théo C vivier (22/10) — cinq colonnes, disponibilité déclarée contre planning, score ouvrable, sélecteur, ajout à trois portes.
  { id: '2026-10-22-theo-c-vivier', itemCount: 4 },
  // Théo O onboarding-relecture (lot R22-ECRAN-O2, 22/10) — « Ce que Laura a compris », orientations décidées, validation explicite du cadrage, premier échange modifiable.
  { id: '2026-10-22-o2-relecture-ce-que-laura-a-compris', itemCount: 3 },
  // Théo O onboarding-catalogue / onboarding-theme (lot R22-ECRAN-O2, 22/10) — 16 thèmes à approfondir, recherche dans tout le questionnaire, cinq statuts par réponse, export du cadrage.
  { id: '2026-10-22-o2-onboarding-themes-statuts', itemCount: 3 },
  // #4429 / #4433 (22/10) — Découvrir : plus de tailles hors tranche sans étiquette, et « Siège » n'est plus une zone inconnue.
  { id: '2026-10-22-fiche-compte-coordonnees-sources', itemCount: 4 },
  { id: '2026-10-22-taille-voisine-etiquetee', itemCount: 2 },
  // #4462 (22/10) — une liste de comptes nommés collée à Laura : les absents de l'espace sont analysés d'office.
  { id: '2026-10-22-4462-laura-liste-noms', itemCount: 2 },
  // #4445.1 (22/10) — une longue liste dans une réponse de Laura se replie : 5 éléments, puis « Voir les N autres ».
  { id: '2026-10-22-lp-chat-liste-repliee', itemCount: 1 },
  // #4432.9 (lot ZE, 22/10) — zone sans entité du groupe : le dossier s'élargit seul (région, puis France) et le dit.
  { id: '2026-10-22-zone-sans-entite-elargie', itemCount: 1 },
  // #4459 (22/10) — compte venu du CRM : ce qui y était, ce que l'analyse a apporté, et compléter le CRM en un geste.
  { id: '2026-10-22-completer-compte-crm', itemCount: 3 },
  // #4424 (22/10) — préparer un R1 ou un R2 depuis la fiche compte, sans agenda synchronisé ; « Préparer le RDV » y mène.
  { id: '2026-10-22-4424-r1-r2-fiche-compte', itemCount: 2 },
  // #4422.3 (22/10) — l'audit ne parle plus de dispersion pour un cabinet au forfait spécialisé sur une seule fonction.
  { id: '2026-10-22-4422-audit-specialisation-fonctionnelle', itemCount: 1 },
  // #4426.1, .4, .7 et #4422.1 (lot JF2, 22/10) — le pack de contexte : le bon onglet, le tier visible, les scripts gardés, l'historique complet.
  { id: '2026-10-22-pack-contexte-onglets-tiers-scripts', itemCount: 4 },
  // #4429.6 / #4432.7 / #4432.8 (lot ZD, 21/10) — commune corrigée ou homonyme dite ; dossier zoné : filiales, établissements et offres de la zone en tête.
  { id: '2026-10-21-commune-corrigee-dossier-zone', itemCount: 3 },
  // #4358.4, #4419.10, #4435.4, #4401.2 (lot R22-SC, 21/10) — le secteur se lit par NAF + activité + site ; l'import d'un CV lit aussi la ville et les expériences.
  { id: '2026-10-21-r22-sc-secteur-trois-sources-cv-coordonnees', itemCount: 2 },
  // #4433.9 (21/10) — Mes cibles, veille, analyse : la liste s’ouvre seule sous 10 résultats et le dit.
  { id: '2026-10-21-paliers-surfaces', itemCount: 3 },
  // Théo D (lot R22-ECRAN-d7, 22/10) — connecteurs en grille, écarts à relire, historique, facturation en quatre onglets.
  { id: '2026-10-22-d7-connecteurs-et-outils', itemCount: 4 },
  // THEO-DS (22/10) — le design system de Théo V22 : couleurs, formes et composants de base.
  { id: '2026-10-22-theo-ds', itemCount: 3 },
  // Théo M2 (22/10) — programmer l'envoi d'un brouillon validé ; il part seul, par ta boîte, à l'heure choisie.
  // Théo C (22/10) — Talents › Recrutement (cinq étapes pour une personne) et Affaires (cinq colonnes de Théo).
  { id: '2026-10-22-recrutement-talents', itemCount: 3 },
  { id: '2026-10-22-envoi-programme', itemCount: 2 },
  // Théo B (22/10) — retraits assumés (Kanban des contacts, Découvrir intégré, SMS / WhatsApp / vocal) et brouillons relus.
  { id: '2026-10-22-theo-b-retraits-et-brouillons-relus', itemCount: 4 },
  // Théo B c2-mes-listes (22/10) — « Contacts › Mes listes » : sélecteur Contacts / Comptes, renommer, archiver.
  { id: '2026-10-22-theo-b-mes-listes', itemCount: 3 },
  // Théo B r2-mes-analyses (22/10) — « Mes analyses » : l'historique des analyses de l'espace, filtrable « Moi ».
  { id: '2026-10-22-theo-b-mes-analyses', itemCount: 3 },
  // Théo B c7-approche-appel (22/10) — « Préparer ton appel » : le support d'appel en page dédiée.
  { id: '2026-10-22-theo-b-preparer-un-appel', itemCount: 3 },
  // Théo L1 (22/10) — sélecteur avancé de Laura : partir d'une offre d'emploi, choix effaçable, lien partageable.
  { id: '2026-10-22-theo-l1-laura-selecteur-offre-emploi', itemCount: 3 },
  // Recette 22/10 (fiche compte) — nom légal, ré-analyse d'un compte non suivi, offres en double, filet « non placé » inclusif.
  { id: '2026-10-22-fiche-compte-recette', itemCount: 4 },
  // #4405.1 / #4405.2 (22/10) — « Préparer la réponse » marche aussi sur un fil de groupe ; la fiche consultant ne redit plus intitulé, e-mail, téléphone.
  { id: '2026-10-22-reponse-fil-groupe-fiche-sans-doublon', itemCount: 2 },
  // #4286.15 (22/10) — base commune : les tendances de marché entre espaces, et un ancien n'est plus présenté comme actuel.
  { id: '2026-10-22-base-commune-tendances-marche', itemCount: 3 },
  // R22-DC (22/10) — Découvrir : la carte dit d'où vient son secteur (code NAF, activité déclarée ou site).
  { id: '2026-10-22-decouvrir-secteur-provenance', itemCount: 1 },
  // R22-DV (22/10) — Découvrir : un compte hors zone n'entre plus, zone/secteur/taille en tête de « Tous les filtres », espace de la compétence gardé, taille du profil retirée respectée.
  { id: '2026-10-22-decouvrir-defauts-recette', itemCount: 4 },
  // #4421 / #4408 / #4438 / #4434 / #4430 (lot R22-LAURA-V14, 22/10) — Laura tient le volume demandé par paliers, annonce ce qu'elle a retenu, date chaque offre citée et ne contredit jamais sa carte.
  { id: '2026-10-22-r22-laura-v14-volume-tenu', itemCount: 4 },
  // #4438 / #4421.2 / #4429.3 (lot R22-LG, 22/10) — Laura ne s'arrête plus sur un zéro, nomme son palier, missions du marché sans consultant.
  { id: '2026-10-22-r22-lg-laura-livre', itemCount: 3 },
  // #4322 / #4323 / #4326 (22/10) — fiche compte : parcours dits en clair, une seule ligne ESN, Paris et Bordeaux dans la liste des sites.
  { id: '2026-10-22-fiche-compte-lisible', itemCount: 3 },
  // #4409 #4403 #4401 #4406 #4431 (22/10) — recette prod : sélecteur d'entreprise (tête de groupe), hors métier sur Mes cibles, fiche talent robuste, Beeper, Salesforce à la reconnexion.
  { id: '2026-10-22-recette-prod-vf', itemCount: 5 },
  // THEO-DS (22/10) — le design system de Théo V22 : couleurs, formes et composants de base.
  // Théo M2 (22/10) — programmer l'envoi d'un brouillon validé ; il part seul, par ta boîte, à l'heure choisie.
  // Théo B (22/10) — retraits assumés (Kanban des contacts, Découvrir intégré, SMS / WhatsApp / vocal) et brouillons relus.
  // Théo B c1 (22/10) — Contacts : en-tête court, tuiles « réseau à faire vivre », coordonnées disponibles à chercher, liste compacte.
  { id: '2026-10-22-theo-b-c1-repertoire', itemCount: 4 },
  // Théo B m2-brouillons (22/10) — la Messagerie en quatre vues : À traiter, Brouillons, À venir, Historique.
  { id: '2026-10-22-theo-b-messagerie-quatre-vues', itemCount: 4 },
  // Théo L1 (22/10) — sélecteur avancé de Laura : partir d'une offre d'emploi, choix effaçable, lien partageable.
  // Théo B l1-laura (22/10) — l'accueil de Laura, ses dossiers, son composeur resserré et le lien de chaque source citée.
  { id: '2026-10-22-theo-b-l1-laura-ecran', itemCount: 3 },
  // Théo M1 (22/10) — Messagerie : quatre onglets (À traiter · Brouillons · À venir · Historique), Sources, réponse d'absence.
  { id: '2026-10-22-theo-m1-messagerie-onglets', itemCount: 3 },
  // #4409 / #4403 (22/10, suite) — sélecteur : le sigle tapé relie la holding et rappelle la tête de groupe ; Mes cibles marque aussi facteur / hôte de vente pour un profil qui place chez ses clients.
  { id: '2026-10-22-recette-prod-vf-suite', itemCount: 2 },
  // Théo D (22/10) — Pilotage en une page à sections ancrées : quatre chiffres du jour, le cap du mois, chacun son pipe, export de la synthèse.
  { id: '2026-10-22-theo-d-pilotage-page-unique', itemCount: 4 },
  // #4412 (21/10) — « Préparer un e-mail » depuis Contacts crée aussi le brouillon dans Gmail / Outlook.
  { id: '2026-10-22-4465-poste-actuel', itemCount: 2 },
  { id: '2026-10-22-4286-employeur-fiche', itemCount: 2 },
  { id: '2026-10-21-brouillon-boite', itemCount: 2 },
  // #4408 (21/10) — « pas de gros process achat » : Laura écarte les grandes structures de la sélection et nomme pourquoi.
  { id: '2026-10-21-4408-laura-petite-structure', itemCount: 1 },
  // #4285 (21/10) — Découvrir : l'augmentation de capital (BODACC) devient un fait daté de la carte, et les levées se rapprochent aussi par la raison sociale.
  { id: '2026-10-21-decouvrir-augmentation-capital', itemCount: 2 },
  // #4291 J (21/10) — un second espace démo, au profil forfait / conseil.
  { id: '2026-10-21-demo-forfait', itemCount: 2 },
  // Recette 21/10 (lot L) — « hors de ton métier » : marque et rang bas au lieu d'écarter, séparateur sous tous les tris, décideur avant le référent, besoins d'équipe dépliés.
  { id: '2026-10-21-recette-hors-metier', itemCount: 4 },
  // #4404 / #4400 / #4402 (recette 21/10 M) — fiche contact, recherche souple, fiche talent éditable en ligne.
  { id: '2026-10-21-recette-m', itemCount: 4 },
  // #4295.14 / #4287.14 / #4401 (recette 21/10) — export CSV des affaires, relance des N derniers contacts, identité d'un CV importé.
  { id: '2026-10-21-recette-export-relances-cv', itemCount: 3 },
  // recette 21/10 U (Ludovic) — « Appliquer ma cible » pose tout ce que ton profil dit et nomme le reste, avec l'origine de chaque critère.
  { id: '2026-10-21-cible-complete', itemCount: 3 },
  // #4362, #4315, #4306, #4301, #4299 (lot R21-Z, call bêta 21/10) — un seul filtre de taille (TPE / PME / ETI / GC), signaux expliqués, repères nommés, résumé retient / écarte, libellés lisibles.
  { id: '2026-10-21-r21-z-taille-unique-signaux-expliques', itemCount: 5 },
  // #4413, #4414 (lot R21-V, call bêta 21/10) — « Tous les filtres » ouvre sur zone, secteur, taille ; « Actualiser l'analyse » porte son libellé sur la fiche compte.
  { id: '2026-10-21-r21-v-filtres-zone-en-tete-actualiser-libelle', itemCount: 2 },
  // #4415 / #4416 (lot R21-W, call bêta 21/10) — onglet Plan : trois étapes numérotées en tête ; fiche contact : « Plan pour <prénom> ».
  { id: '2026-10-21-plan-etapes', itemCount: 3 },
  // #4415.2 / #4416.3 (lot R22-PF, recette 22/10) — « Préparer » ouvre le préparateur avec l'angle de l'étape ; LinkedIn et appel : « Copier le message » ; démo : Till Rausch porte son plan.
  { id: '2026-10-22-pf-plan-preparer-copier', itemCount: 3 },
  // #4405 (retour bêta 21/10) — Messagerie : « Préparer la réponse » ouvre le mail déjà rédigé.
  { id: '2026-10-21-preparer-reponse', itemCount: 2 },
  // #4417 / #4418 (call bêta 21/10) — Laura répond à un mail dans le fil ; « Marquer envoyé » planifie les relances.
  { id: '2026-10-21-repondre-relances', itemCount: 3 },
  // #4363.3 / #4358.3 / #4307.2 / #4327.2 (lot R21-Y, 21/10) — Découvrir : premières entreprises plus tôt, secteur à données minces dit, historique gratuit, filiale non confirmée étiquetée.
  { id: '2026-10-21-decouvrir-lisibilite', itemCount: 4 },
  // #4348.4 / #4347.3 / #4344.4 / #4343.2 (21/10) — Talents et Affaires : profil lié, objectif du message, shortlist, pipe propre.
  { id: '2026-10-21-talents-affaires', itemCount: 4 },
  // #4419 (21/10) — Découvrir par compétence : des dizaines de comptes là où il en rendait 0 ou 1, et ce qui est retiré se dit.
  { id: '2026-10-21-decouvrir-competence-volume', itemCount: 3 },
  // #4438 (21/10) — Laura agit au lieu de demander : elle va au bout, élargit seule, parle peu.
  { id: '2026-10-21-laura-agit', itemCount: 3 },
  // #4421 (21/10) — « trouve-moi des missions » : Laura agit sans questionner, comptes + besoins + contacts.
  { id: '2026-10-21-laura-missions-consultant', itemCount: 3 },
  // #4406 (lot R21-BB, 21/10) — Beeper : brancher son Beeper Desktop, lire et répondre aux conversations, sous mandat.
  { id: '2026-10-21-beeper', itemCount: 3 },
  // R21-JE (import contexte Je, 21/10) — « Dépose tes documents » : un dépôt, chaque fichier rangé là où il sert.
  { id: '2026-10-21-depose-tes-documents', itemCount: 3 },
  // #4426.4 à #4426.7 (lot JF, 21/10) — les importeurs lisent des fichiers clients bien faits : bon onglet, en-têtes tolérants, lignes de synthèse ignorées.
  { id: '2026-10-21-importeurs-tolerants', itemCount: 4 },
  // #4423.3 (lot JB, 21/10) — l'avis d'accompagnement ne dit plus « lecture seule » : il nomme ce que l'équipe peut et ne peut pas faire sur ton espace.
  { id: '2026-10-21-jb-incarnation-dit-ce-quelle-permet', itemCount: 1 },
  // #4427 (21/10) — Lemlist : clé d'API par espace, ajout d'un contact à une campagne existante, statuts relus.
  { id: '2026-10-21-lemlist', itemCount: 3 },
  // LOT JP #4290.15-17 / #4324.1 (21/10) — reprise Pipedrive, une seule date de synchro, mode de mise à jour, DSI des comptes suivis.
  { id: '2026-10-21-lot-jp-pipedrive-dsi', itemCount: 4 },
  // #4424 (21/10) — préparer un R1, un R2, et un pitch ; « Préparer le RDV » proposé à la création d'une mission ou d'un besoin.
  { id: '2026-10-21-prepa-r1-r2', itemCount: 4 },
  // #4425 (lot JA, 21/10) — l'audit se corrige à la source : réponses éditables en place, blocs calculés nommés, expertises non évaluables questionnées, « Confirmer » sur les origines non établies.
  { id: '2026-10-21-audit-corrigeable-a-la-source', itemCount: 4 },
  // #4434 / #4435 / #4436 (épopée #4433, 21/10) — compétence, secteur, taille : un référentiel partagé, des paliers étiquetés.
  { id: '2026-10-21-paliers-voisins', itemCount: 3 },
  // #4429 / #4432 (lot ZP, 21/10) — zone par paliers visibles ; le dossier reprend la zone cherchée comme périmètre.
  { id: '2026-10-21-zone-paliers-perimetre', itemCount: 4 },
  // #4430, #4437 (lot OF, 21/10) — Laura et Découvrir : offres fraîches des comptes proposés, recherche par compétence remplie, signal maigre élargi aux faits voisins.
  { id: '2026-10-21-of-offres-fraiches', itemCount: 3 },
  // #4431 (21/10) — Salesforce sur le domaine de l'organisation : champ facultatif + sandbox sur la carte, erreur du fournisseur lisible.
  { id: '2026-10-21-salesforce-domaine-organisation', itemCount: 3 },
  // #4331 (20/10) — fiche contact : un bouton principal « Contacter » + menu « Autres actions ».
  { id: '2026-10-20-fiche-contact-menu', itemCount: 3 },
  // #4361.1 / #4361.2 (lot MIDDLE-MARKET, 20/10) — Découvrir : la puce « Middle market » (250 à 4 999 salariés, non coté) et l'interrupteur « Exclure les sociétés cotées ».
  { id: '2026-10-20-middle-market-non-cote', itemCount: 3 },
  // LUDOVIC-F LC.1 / LC.4 / LC.6 (20/10) — zones de chasse toutes lues, liste d’appels dans son conteneur, lieu du contact.
  { id: '2026-10-20-ludovic-f', itemCount: 3 },
  // CEDRIC-FIX2 C.2 (20/10) — « Agrandir la recherche » s'ancre sur l'organisation.
  { id: '2026-10-20-agrandir-ancre', itemCount: 2 },
  // RECHERCHE-NOM #4386 (20/10) — chercher une personne par nom interroge plusieurs sources, et le vide se dit.
  { id: '2026-10-20-recherche-nom', itemCount: 3 },
  // ENTREPRISE-TOUT #4381 (20/10) — l'offre Entreprise ouvre toutes les fonctions.
  { id: '2026-10-20-entreprise-tout', itemCount: 1 },
  // MEYER-FIX2 M2.1 → M2.3 (20/10) — l'assistant d'import reconnaît l'export de contacts, et l'import de CV refuse un tableur.
  { id: '2026-10-20-meyer-fix2', itemCount: 3 },
  // MEYER-IMPORT M.1 → M.4 (20/10) — l'export BoondManager s'importe (comptes et contacts), le bilan dit pourquoi, /accounts a son total.
  { id: '2026-10-20-meyer-import', itemCount: 4 },
  // R23-ANTOINE-A (23/10) — Pipedrive, import validé d'un clic, historique multi-lots, Laura qui enchaîne et oriente.
  { id: '2026-10-23-antoine-a', itemCount: 4 },
  // LOIC-FIX2 (re-recette Loïc Inacio, 20/10) — O.3 / O.4 / O.5, score OGF, rôles, accords.
  { id: '2026-10-20-loic-fix2', itemCount: 4 },
  // LOIC-FIX O.1 → O.5 (20/10) — la recette prod OGF : messages non préparés dits, décideurs et scores cohérents, fiche en un clic, recherche par nom.
  { id: '2026-10-20-loic-fix', itemCount: 5 },
  // LUDOVIC-E LC.1 → LC.6 (20/10) — la recette prod du 20/10 : remise aux règles, appel, pack, tableau, zones, positionnement.
  { id: '2026-10-20-ludovic-e', itemCount: 6 },
  // KEVIN-FIX (20/10) — retours de la recette bêta Talosi : Laura profil libre, zone ville, compétences, secteurs, cadrage site.
  { id: '2026-10-20-kevin-fix', itemCount: 6 },
  // CEDRIC-FIX C.2 / C.2b / C.6 / C.10 (20/10) — la recette prod du 20/10 : contacts d'un grand groupe, nombres nommés, entité à taper, crédits du back-office.
  { id: '2026-10-20-cedric-fix', itemCount: 4 },
  // SIMON-FIX (re-recette prod 20/10 16 h 40) — S.9 / S.10 / S.11 / S.14 / S.16 / S.18b / S.19 / S.22 / S.24.
  { id: '2026-10-20-simon-fix-recette-prod', itemCount: 4 },
  // SIMON-FIX (recette Simon Elghozi, 20/10) — S.4 / S.10 / S.14 / S.18 / S.19, bandeau Découvrir, modales.
  { id: '2026-10-20-simon-fix', itemCount: 4 },
  // #4381 (lot PLAN-GATE, 20/10) — le plan posé par le back-office est celui que lit le verrou ; le bandeau de verrou nomme la fonction, jamais sa clé.
  { id: '2026-10-20-plan-gate-plan-de-lespace-vivier-nomme', itemCount: 2 },
  // COMPETENCE-TROUVE (20/10) — une compétence posée trouve les comptes qui recrutent dessus, cabinets et ESN à part.
  { id: '2026-10-20-competence-trouve', itemCount: 3 },
  // #4348, #4307 (lot H-DECISIONS, 20/10) — une fiche se pré-remplit depuis l'adresse d'un profil LinkedIn ; l'historique des signaux reste gratuit.
  { id: '2026-10-20-h-decisions', itemCount: 2 },
  // G-FIX #4309, #4318, #4319, #4294.10 (20/10) — Laura sur chaque carte de Découvrir, plus de filtre posé en silence, recherche incomplète en mots simples, un fait une seule fois.
  { id: '2026-10-20-g-fix', itemCount: 4 },
  // F2-FIX #4302, #4301, #4332, #4297 (20/10) — aide de vue au prénom, filtres inclus/exclus, titres et chiffres clés unifiés, Brief ouvert sur les tâches, réponses à traiter.
  { id: '2026-10-20-f2-fix', itemCount: 6 },
  // F1-FIX #4345 / #4340 / #4341 / #4344 / #4354 (20/10) — Laura sur place, Affaires = Pipe, Signaux, récap de la rafale.
  { id: '2026-10-20-f1-fix', itemCount: 4 },
  // #3769.1 / #3399.6 / #3777.8 / #4016.46 / #4270.3 / #4016.8 / #4191.4 (lot RV4-E-FIX, 20/10) — recette production : vide de Laura, alternatives, badge estimé, besoin à cadrer, traceur du pipe, noms du planning.
  { id: '2026-10-20-rv4-e-fix', itemCount: 6 },
  // #4307, #4306, #4313, #4315, #4322, #4362 (lot DECOUVRIR-UX, 20/10) — libellés lisibles, recherches récentes, bornes de taille (l'historique des signaux reste gratuit : #4307, H-DECISIONS).
  { id: '2026-10-20-decouvrir-ux-historique-signaux', itemCount: 5 },
  // #4294.9 / #4285.3 (lot RADAR-DATAFORGE, 20/10) — l'historique des besoins d'un compte lu par l'analyse, Laura et Découvrir.
  { id: '2026-10-20-radar-dataforge', itemCount: 3 },
  // #4283.8 / #4291.8 / #4292.16 / #4294.7 (lot RETENUS-B, 20/10) — ré-analyse des comptes suivis, forfait gagné suivi, numéro de téléphone entier, « déjà travaillées » avec les missions.
  { id: '2026-10-20-retenus-b', itemCount: 4 },
  // #4284.13, #4284.8, #4284.24 (lot RETENUS-A, 20/10) — Découvrir : deux recherches signaux identiques ne se gênent plus, « accès refusé » ne se dit que d'un refus, « Qualifier » dit pourquoi il ne part pas.
  { id: '2026-10-20-retenus-a-decouvrir', itemCount: 3 },
  // V4-CORRECTIFS-B (20/10) — la clôture d'un bloc du plan de journée se voit, Laura ne cite que tes outils branchés, la démo répond « par quelle entité » et date juste.
  { id: '2026-10-20-v4-correctifs-b', itemCount: 4 },
  // V4-CORRECTIFS 4290.12 / 4290.2 / 4288.1 (20/10) — contacts partis dans la liste, dernière synchro datée, ordre de recherche de Laura.
  { id: '2026-10-20-v4-correctifs', itemCount: 3 },
  // LUDOVIC-D LC.2 / LC.6 / LC.10 (20/10) — homonymes dans les actus et angles, Laura sur le moteur de Découvrir, incarnations.
  { id: '2026-10-20-ludovic-d', itemCount: 3 },
  // LUDOVIC-C LC.1 → LC.9 (20/10) — la recette prod du 19/10 : contacts existants, liste d'appels, appel, zones, verdict.
  { id: '2026-10-20-ludovic-c', itemCount: 7 },
  // #4016 (lot L5, reprise 20/10) — Laura et les étapes de séquence déposent enfin leurs e-mails sous le mandat signé.
  { id: '2026-10-20-4016-l5-mandat-branche', itemCount: 3 },
  // #4336.1 / #4339.1 / #4295.14 / #4295.15 / #4295.17-18 / #4291.5 / #4290.12 / #4291.1 (lot CHRON-C, 20/10) — recette production : affaires, besoins, /privacy, estimé, profil d'espace.
  { id: '2026-10-20-chron-c-projets-reglages-recette', itemCount: 9 },
  // #4287.11 / #4287.14 / #4287.9 / #4287.8 / #4287.5 / #4289.3-.5 / #4284.19 / #4291.11 (lot CHRON-B, 20/10) — Laura : derniers contacts, anciens besoins, expérience en CV, alternatives hors portefeuille, parcours ; Consultants : relecture des CV.
  { id: '2026-10-20-chron-b-laura-consultants', itemCount: 7 },
  // #4284.23 / #4286.3 / #4284.18 / #4289.8 / #4295.11 (lot CHRON-A, 20/10) — cartes Découvrir variées, historique daté de la fiche, heure de calcul du plan, démo « ne pas contacter ».
  { id: '2026-10-20-chron-a', itemCount: 4 },
  // décision Louis 19/10 (lot MAILLON-COCKPIT) — le maillon faible ne vit que dans le Cockpit : plus de ligne sur Profil ni Bienvenue, plus de bloc dans la restitution d'onboarding.
  { id: '2026-10-19-maillon-faible-cockpit-seul', itemCount: 1 },
  // #4346 (lot FICHE-CONSULTANT, 20/10) — l'en-tête de la fiche consultant se réduit à trois boutons.
  { id: '2026-10-20-fiche-consultant', itemCount: 2 },
  // #4333 / #4347 (lot MESSAGES-LAURA, 20/10) — les fenêtres de message s'ouvrent déjà rédigées par Laura.
  { id: '2026-10-20-messages-laura', itemCount: 2 },
  // #4323 / #4324 / #4325 (lot COMPTE-SAIS, 20/10) — « Vue d'ensemble » fusionnée dans « Ce que je sais », une seule liste d'ESN, « Autre » détaillé, DSI/RSSI rapprochés par intitulé.
  { id: '2026-10-20-compte-sais', itemCount: 4 },
  // #4288 / #4289 / #4290 / #4293 (lot FIX-RECETTE-H, 19/10) — Laura, comptes comparables, mail, envoi CRM, mandat, brief.
  { id: '2026-10-19-fix-recette-h', itemCount: 7 },
  // #4326 / #4327 / #4317 / #4300 / #4363 / #4299 (lot FIX-PROD-D, 19/10) — carte des établissements complète, filiales du web conservées, Découvrir : une colonne, progression par source, contraste.
  { id: '2026-10-19-fix-prod-d', itemCount: 5 },
  // #4305 / #4312 / #4358 (lot DECOUVRIR-C, 19/10) — Découvrir : second passage automatique, bon repère de menu, recherche retrouvée, secteur e-commerce.
  { id: '2026-10-19-decouvrir-c', itemCount: 4 },
  // CRM-SYNC-D.1 / D.2 / D.3 / D.4 (lot CRM-SYNC-D, 19/10) — un CRM déjà branché se reprend tout seul, la carte dit la reprise.
  { id: '2026-10-19-crm-sync-d', itemCount: 3 },
  // #4284.26 / #4319.2 / #4301.2 / #4303 (lot DEC-B, 19/10) — Découvrir : comptes hors métier gardés, liste des entreprises, zones suggérées.
  { id: '2026-10-20-adresses-retirees', itemCount: 2 },
  // #4349 V.1 V.2 V.3 (lot VIVIER-RANGEMENT, 20/10) — qualité des fiches dans Réglages, compétences sans profil dans Staffing, guide Vivier à jour.
  { id: '2026-10-20-vivier-rangement', itemCount: 3 },
  { id: '2026-10-19-decouvrir-b', itemCount: 4 },
  // #4282 / #4281 (lot RADAR, 19/10) — radar par technologie (Laura + Découvrir) et besoins historiques datés.
  { id: '2026-10-19-radar-technologie', itemCount: 3 },
  // #3712.6 / #3866 (lot DEC-4036, 19/10) — la fiche compte ne nomme plus les limites du brief ; adéquation Data/BI sur compétence nommée.
  { id: '2026-10-19-dec-4036', itemCount: 2 },
  // #4308.1 / #4310.1 / #4304.1 / #4315.1 / #4316.1 / #4318.1 / #4317.2 / #4313.1 / #4361.1 / #4362.1 / #4302.1 / #4301.1 / #4306 (lot DEC, vague 4, 19/10) — Découvrir : lisibilité et recherche.
  { id: '2026-10-19-v4-dec-decouvrir-lisibilite-recherche', itemCount: 5 },
  // #4284.1 / #4284.23 / #4284.15 / #4283.1 / #4286.12 / #4292.6 / #4294.3 / #4294.6 (lot V4-CORRECTIFS-C, recette prod 20/10).
  { id: '2026-10-20-v4-correctifs-c', itemCount: 5 },
  // #4353.1 / #4354.1-.2 / #4355.1 / #4357.1 (lot ACTIONS, vague 4, 19/10) — Actions : un seul parcours Séquences.
  { id: '2026-10-19-actions', itemCount: 3 },
  // #4338 / #4340 / #4341 / #4344 / #4349 / #4335.2 / #4342 (lot PIPE, vague 4, 19/10).
  { id: '2026-10-19-pipe-affaires-talents', itemCount: 4 },
  // #4329.1 / #4328.1 (lot OPPS, 19/10) — l'onglet Opportunités du compte, refondu.
  { id: '2026-10-19-opportunites', itemCount: 2 },
  // #4298.2 / #4298.1 / #4296.2 / #4297.2 / #4296.1 / #4332.1 / #4356.1 (lot PLATEFORME-B, 19/10) — Tableau de bord : période et source, grammaire Cockpit, ma journée d'abord ; Messagerie : une action ; une échelle de titres ; parcours guidé.
  { id: '2026-10-19-plateforme-b', itemCount: 6 },
  // #4279 / #4280 / #4267.5 / #4270.4 / #4270.5 / #4142.6 (lot RESTES-19-10, 19/10) — Découvrir lisible, suivi ré-analysé, espace forfait, exclusions reliées à une source.
  { id: '2026-10-19-restes', itemCount: 5 },
  // #4191.4 / #4191.6 / #4191.8 (correctif R22-FIX, 19/10) — missions : intitulé sur deux lignes, mission née d'une signature, porteur nommé.
  { id: '2026-10-19-r22-fix', itemCount: 3 },
  // LUDB.1–LUDB.9 (lot LUDOVIC-B, 19/10) — ce que la recette de l'espace industriel a cassé.
  { id: '2026-10-19-ludovic-b', itemCount: 8 },
  // LUD.1 → LUD.6 (lot LUDOVIC, 19/10) — l'ESN industrielle de bout en bout : marchés, zone, recrutement BTP, placement, Laura, contacts.
  { id: '2026-10-19-ludovic-industriel', itemCount: 5 },
  // SYNC-A/B/C + CRM-L + FIX-RECETTE-G + DISCOVER-TAILLE (intégration du 19/10) — le CRM entier dans Bellum.
  { id: '2026-10-19-crm-miroir', itemCount: 5 },
  // #4343 (lot PIPE-SEPARE, 20/10) — étapes d'affaire et étapes de candidat ne se mélangent plus.
  { id: '2026-10-20-pipe-separe', itemCount: 3 },
  // #4336, #4337, #4339 (lot AFFAIRES-A, 19/10) — Affaires : origine lisible partout, table qui ne se coupe plus, propositions de changement de colonne qui font réellement quelque chose.
  { id: '2026-10-19-affaires-a', itemCount: 3 },
  // #4072 / #4142.3 / #4191.4 / #4016.L9d / #4051.5 / #3085.1 / #4055.10 / #3905 / #4269 / #4271 / #4267 / #4270 (vague C→H, 18/10).
  { id: '2026-10-18-vague-c-h', itemCount: 8 },
  // #3246.3 / #4189.2 / #3295.7 / #3278.8 / #3935.3 / #4065.1 / #4065.9 / #4067.4 / #4068.7 / #3247.2 (lots FIX-RECETTE-D/E, 18/10) — correctifs de la recette du 18/10.
  { id: '2026-10-18-fix-recette-de', itemCount: 4 },
  // VU.1 / VU.2 / VU.4 / #3295.3 / #4036.3 / #3941.1 / #3941.3 / #3901.7 (lots FIX-RECETTE-A/B, 18/10) — correctifs de la recette du 18/10.
  { id: '2026-10-18-fix-recette-ab', itemCount: 3 },
  // VC.1 / VC.2 / VC.3 (lot VEILLE-COMMUNAUTAIRE, 18/10) — la veille quotidienne réutilise les recherches récentes sur la même société.
  { id: '2026-10-18-veille-communautaire', itemCount: 2 },
  // #4055.4 / .5 / .6 / .7 / .9 / #4045.12 / #3901.14 / #4158.58 (lot V12-RETENU-B, 17/10) — compléter un compte, alias à l'import, périmètre des notes.
  { id: '2026-10-17-v12-retenu-b', itemCount: 3 },
  // #3246.3 / #4184.4 / #4188.3 / #3973.7 / #3819.11 / #3901.9 (lot V13-FIX-R44, 17/10) — dimensions non évaluables nommées, synchro et CRM nommés, homonymes.
  { id: '2026-10-17-v13-fix-r44', itemCount: 3 },
  // #3915.30 / #3915.42 / #3983.1 / #3983.11 / #4182.5 / #2916.7 (lot V14-FIX-R45, 17/10) — compteur des marchés publics, mot-clé Découvrir, zone, dirigeant du groupe, demandeur, diff des routines.
  { id: '2026-10-17-v14-fix-r45', itemCount: 3 },
  // #4158.57 (lot V13-FUSION-ESPACE, 17/10) — rapatrier l'espace personnel dans l'espace ESN rejoint : aperçu figé, double validation, archivage.
  { id: '2026-10-17-v13-rapatrier-espace-personnel', itemCount: 2 },
  // #4072.7 / #4072.1 / #3920.5 / #4189.8 (lot V15-FIX-R46, 17/10) — la démo ne casse plus : organigramme des documents, « Déjà connu », cloche CRM, note de synchro.
  { id: '2026-10-17-v15-fix-r46', itemCount: 3 },
  // #4067 / #3769 (lot V16-FIX-R47, 17/10) — Découvrir plus varié, mission terminée lue « passée », import lisible, /discover/signals redirigé, ville du siège en casse de titre.
  { id: '2026-10-17-v16-fix-r47', itemCount: 5 },
  // #3247 / #3243 / #3918.2 / #4180 / #3941.5 / #3666.9 / #3777 / #3711.17 / #2370 (lot V11-FIX-R41, 17/10) — ce que la recette prod ne voyait pas à l'écran.
  // #4016.61 / #4016.121 / #4073.5 / #3905.5 / #3895.1 / #4051.10 / #4088.14 / #4191 R22 (lot V12-RETENU-A, 17/10) — les derniers manques de la carte de clôture, et le R22-FIX.
  { id: '2026-10-17-v12-retenu-a', itemCount: 4 },
  { id: '2026-10-17-v11-fix-r41', itemCount: 3 },
  // #3917 / #3278 / #3295 (lot V12-FIX-R42, 17/10) — dates des actualités, preuves de la route, affaires perdues.
  { id: '2026-10-17-v12-fix-r42', itemCount: 3 },
  // #3917 / #3278 (lot FIX-R39, 17/10) — actualités datées, route et signal du plan, date de calcul du plan.
  { id: '2026-10-17-r39-actualites-datees-plan-signal', itemCount: 3 },
  // #3941.5 / #3819 / #3921.11 (17/10) — Découvrir : « Augmentation de capital » à cocher ; le tri choisi prime ; événements du registre national sur la fiche.
  { id: '2026-10-17-decouvrir-capital-registre', itemCount: 3 },
  // V10-B (17/10) — Laura liste les affaires du CRM, les candidats vus en entretien et les missions terminées ; le brief du jour date l'historique du compte ; une mission au démarrage futur est « à venir ».
  { id: '2026-10-17-laura-crm-ats-historique', itemCount: 4 },
  // #3623.11, #3666.8/.10, #3777, #4180, #4088.3, #4074, #2947.R16 (lot V10-C-FICHE-IMPORT, 17/10) — l'import d'archive passe par une file avec un statut lisible ; la fiche dit « Même verdict depuis le … » et montre le badge Décideur dans les voies d'accès ; « Non mesuré » ne s'écrit plus que sous un score.
  { id: '2026-10-17-v10-c-fiche-import', itemCount: 4 },
  // #2204.65 (lot V10-D, 17/10) — un style de message peut être posé sur une équipe ou sur le fil d'un contact, et le composer l'applique.
  { id: '2026-10-17-v10-d-style-equipe-et-fil', itemCount: 2 },
  // #4016.L4 (lot V10-E, 17/10) — à la saisie d'un besoin, le porteur du projet est proposé comme propriétaire, badgé « suggéré », appliqué sur un clic.
  { id: '2026-10-17-v10e-valeur-suggeree-besoin', itemCount: 1 },
  // #4016.L4 (lot V10-E, 17/10) — coût d'accès estimé sur la déclaration de l'espace au même verrou, badgé « estimé ».
  { id: '2026-10-17-v10e-cout-acces-estime', itemCount: 1 },
  // #4016.L4 (lot V10-E, 17/10) — angle en hypothèse, ESN probable, priors de la base de référence en hypothèse : badgés « estimé » avec leur base.
  { id: '2026-10-17-v10e-estime-angle-esn-priors', itemCount: 3 },
  // #4016.L8b (lot V10-E, 17/10) — « Ne plus me demander » le coût d'enrichir UN contact, préférence personnelle réversible.
  { id: '2026-10-17-v10e-ne-plus-me-demander-le-cout', itemCount: 1 },
  // #4016.L13 (lot V10-E, 17/10) — un fait confirmé à la main reste affiché ; la source qui le contredit se nomme à côté, datée.
  { id: '2026-10-17-v10e-fait-confirme-contredit', itemCount: 1 },
  // #2370 (épopée #2947, 17/10) — Laura prépare un message sur sept canaux de plus (SMS, WhatsApp, introduction, partenaire, suivi, profil, note LinkedIn).
  { id: '2026-10-17-canaux-messages-prepares', itemCount: 2 },
  // #3295 (lot FIX-R37-ECRAN, 16/10) — « Règles apprises » liste en lecture les pertes documentées qui fondent une proposition.
  { id: '2026-10-16-r37-rex-pertes-lisibles', itemCount: 1 },
  // #3915.decp (16/10) — les marchés publics attribués du compte (acheteur ou titulaire) relus en continu, datés, sur la fiche, la Veille, Laura et Découvrir.
  { id: '2026-10-16-marches-publics-attribues-continu', itemCount: 2 },
  // #3973.7 (16/10) — Réglages › Intégrations montre les logos de marque des outils, les mêmes que le sélecteur de Laura.
  { id: '2026-10-16-logos-integrations', itemCount: 1 },
  // #3246.relation, #3246.timing (lot CAS-DIMENSIONS, 16/10) — la relation (stade choisi dans une liste) et le timing (position dans le cycle habituel, calculée) entrent dans la comparaison des cas ; remplace la tranche de durée prévue.
  { id: '2026-10-16-cas-relation-et-timing', itemCount: 2 },
  // #4189.9, #4051, #4142 (lot V8-DÉCISIONS, 16/10) — garder la valeur du CRM sur un conflit, bilan d'import par famille + origine sur la fiche, signaux sans quasi-doublons.
  { id: '2026-10-16-v8-decisions-conflits-imports-signaux', itemCount: 4 },
  // R38 (lot FIX-R38, 16/10) — recette Découvrir et démo.
  { id: '2026-10-16-r38-recette-decouvrir-demo', itemCount: 4 },
  // #3278.3, #3259.3 (lot V5-E6, 16/10) — la route commerciale lit deux entrées accumulées : références publiables du secteur et canaux déjà utilisés.
  { id: '2026-10-16-v5e6-route-preuves-et-canaux', itemCount: 1 },
  // #3246, #3210.3 (lot V5-E6, 16/10) — timing : Laura compare la durée de cycle par tranche, prévue pour le compte contre constatée sur le cas.
  { id: '2026-10-16-v5e6-laura-compare-duree-cycle', itemCount: 1 },
  // #4158.60-.62 (lot V4-L11, 16/10) — une fiche par entité d'un groupe : la fiche compte nomme les autres entités avec leur responsable ; les notes suivent le périmètre de chaque entité.
  { id: '2026-10-16-equipe-entites-groupe', itemCount: 2 },
  // #3623.9 (lot V4-L7-IMPORT, 16/10) — « Confirmer et lancer » part sans attendre plus de 10 s une pièce jointe lente, qui est rattachée au compte quand elle arrive.
  { id: '2026-10-16-import-piece-lente-ne-retient-pas-le-lancement', itemCount: 1 },
  // #4067, #4068.1 (lot V4-L3-DECOUVRIR, 16/10) — la carte Découvrir garde 5 faits forts et fait place à la nature manquante, l'alternance reste en contexte ; un compte que l'espace connaît n'est plus coupé à la page.
  { id: '2026-10-16-v4-l3-decouvrir-variete-et-comptes-connus', itemCount: 3 },
  // #3983.8, #4177.3 (lot V4-L4-COMPTE, 16/10) — la démo de Découvrir honore une zone région ; une personne citée sous deux entités du groupe n'est qu'un nœud de l'organigramme.
  { id: '2026-10-16-v4-l4-compte-zone-region-personne-unique', itemCount: 2 },
  // #4072.1, #4074.2 (lot V4-L8-FAITS, 16/10) — l'organigramme se lit aussi dans les documents de l'espace ; la garde des textes refuse aussi les noms de fournisseurs.
  { id: '2026-10-16-v4-l8-faits', itemCount: 2 },
  // LOT DATA-B (15/10) — Laura lit technos, concurrents, budgets, faits publics, firmographie et organigramme déjà collectés ; enrichissement sans carte payante pour une coordonnée connue ; plus de relance web automatique ; digest du plan coupé par section.
  { id: '2026-10-15-data-b-laura-lit-le-dossier', itemCount: 4 },
  // DISCOVER-OFFRES (15/10) — Découvrir n'achète plus rien : le volume d'offres par carte est gratuit, les offres complètes se lisent sur la fiche.
  { id: '2026-10-15-decouvrir-offres', itemCount: 3 },
  // #3983.1, #3769, #4072.4 (lot RESTE-15-10) — la holding écartée au profit de sa filiale est nommée dans Découvrir ; la carte de priorités de Laura s'actualise au lieu de se dupliquer ; la Watchlist dit la récurrence d'un signal.
  { id: '2026-10-15-reste-holding-priorites-recurrence', itemCount: 3 },
  // #4078, #3901/#3866, #3935, #3920, #3247, #2916, #3905, #3973, #3989, #3916, recette 15/10 — les décisions du QCM de Louis du 15/10 et les correctifs de recette.
  { id: '2026-10-15-decisions-qcm-recette', itemCount: 7 },
  // Lot R15-FIX (15/10) — cinq correctifs de recette : #2887, #3889, #4057, #3894, #4063, #4053.
  { id: '2026-10-15-r15-fix', itemCount: 5 },
  // #3901, #4067, #3246, #3921, #3917, #4068 (lot R17-FIX, 15/10) — compteur Découvrir juste, faits de carte lisibles, fiche d'une perte comparable, effectif et filiale sans doublon.
  { id: '2026-10-15-r17-fix-recette', itemCount: 5 },
  // #3295, #4069.4 (lot R18-FIX, 15/10) — les pertes citées pour proposer une règle se distinguent, une règle n'apparaît qu'une fois, les notes de l'équipe se lisent sur la fiche compte.
  { id: '2026-10-15-r18-fix-recette', itemCount: 3 },
  // #3885, #3918, #4059, #4065, #3712 (lot R20-FIX, 15/10) — le filtre Recrutements retient les offres d'emploi ; les affaires passées se lisent sur la fiche compte ; un besoin collé n'affiche plus la date d'une autre donnée ; un listing s'affiche en entier ; l'entité d'un contact est cliquable.
  { id: '2026-10-15-r20-fix-recette', itemCount: 5 },
  // #4073 (lot PDF-FIX, 15/10) — l'export PDF de la fiche compte repart : un seul rendu par ouverture, un échec dit, jamais d'attente infinie.
  { id: '2026-10-15-pdf-fix-export-fiche-compte', itemCount: 2 },
  // #4163 (lot Parcours, 15/10) — Parcours devient un onglet de Pilotage, ouvert à tous les rôles ; les droits se règlent par onglet.
  { id: '2026-10-15-pilotage-parcours', itemCount: 2 },
  // #3939.3, #4149, #3911.2, #4060, échelle du score (lot R12-FIX, 15/10) — « Demander à Laura » ouvre bien un fil neuf ; la raison du « non mesuré » ESN est exacte ; la date des contacts se lit en entier ; un brouillon préparé est dit préparé ; chaque score porte son nom.
  { id: '2026-10-15-r12-fix-recette', itemCount: 5 },
  // #4158.47-56 (lot L8, 14/10) — les restes du mode équipe : séquence sur le contact d'un collègue, ligne d'action d'un collègue, références partagées, exemple de bibliothèque, « ne pas contacter » en liste, Équipe sur mobile.
  { id: '2026-10-14-equipe-l8', itemCount: 5 },
  // #4045 (lot R11, 14/10 soir) — Découvrir montre les offres que l'analyse d'un compte a déjà collectées (cache partagé par SIREN) et cherche aussi les offres publiées sur les sites carrières.
  { id: '2026-10-14-r11-decouvrir-offres-cache-partage', itemCount: 2 },
  // #4158.37-46 (lot L7, 14/10) — le tableau d'équipe /team refondu : en-tête, à traiter, pouls, par commercial, revue de pipeline, staffing, activité, détail replié.
  { id: '2026-10-14-equipe-l7', itemCount: 4 },
  // #4158.28-.31 (mode équipe, lot L5, 14/10) — digest du lundi pour le manager, répartition d'un portefeuille entre plusieurs collègues, modèles partagés ou personnels, délégation avec note et fils résolus.
  { id: '2026-10-14-equipe-l5', itemCount: 4 },
  // #4158.20 à .25 (lot L4, 14/10) — garde-fous entre collègues : déjà travaillé par, contacté par, ne pas contacter, consultant déjà proposé, doublon probable, équipe de compte.
  { id: '2026-10-14-equipe-l4', itemCount: 5 },
  // #4158.14 à .19 (lot L3, 14/10) — boîte de réception d'équipe : assignation, délégation, mention, ESN à décrire ; e-mail entre collègues en opt-in.
  { id: '2026-10-14-equipe-l3', itemCount: 3 },
  // #4158.34 + .4 + .12 (intégration mode équipe, 14/10) — l'interrupteur « Privé » sur la fiche d'un projet, d'un besoin, d'une mission ; un membre qui attend l'administrateur ne se voit plus proposer la reprise des questions entreprise.
  { id: '2026-10-14-equipe-integration', itemCount: 2 },
  // #4158.34 (lot L6, 14/10) — « Dossiers associés » d'un contact : un objet privé ne fait aucune ligne chez qui n'a pas les droits.
  { id: '2026-10-14-equipe-l6', itemCount: 1 },
  // #4158.9 à .12 (lot L2 mode équipe, 14/10) — Équipe en entrée de la barre dès deux membres actifs ; un membre arrivé avant l'administrateur ne répond qu'à ses questions perso.
  { id: '2026-10-14-equipe-l2', itemCount: 2 },
  // #4158.1-6 (mode équipe, lot L1, 14/10) — rôles admin réservés, renvoi d'invitation, invitations expirées, départ d'un membre, plan d'action partagé.
  { id: '2026-10-14-equipe-l1', itemCount: 5 },
  // #3939.3, #4016.L9.a, #4060, #4069.4 (lot R10B, 14/10 soir) — « Demander à Laura » ouvre un fil neuf sur le compte ; une saturation passagère se dit ; le Score et la Vue d'ensemble s'accordent ; la démo date ses réponses.
  { id: '2026-10-14-r10b-chat-score-demo-fiabilite', itemCount: 5 },
  // #4045 (lot R10, 14/10) — Découvrir lit les offres d'emploi en commençant par le haut de la liste, et ne range plus une panne comme « ne recrute pas ».
  { id: '2026-10-14-r10-decouvrir-offres-page-un-d-abord', itemCount: 2 },
  // #4045.1-.4 (lot REC, 14/10 après-midi) — Découvrir dit la panne d'une source d'offres plutôt que de se taire, et sert une offre déjà connue en repli.
  { id: '2026-10-14-rec-decouvrir-recrutements-fiabilite', itemCount: 2 },
  // #3247.4 (décision Louis 14/10) — le chemin d'accès d'une alternative se calcule aussi via une filiale déjà possédée.
  { id: '2026-10-14-ep3247-acces-via-filiale', itemCount: 1 },
  // #2876.1 (décision Louis 14/10) — les zones lues sur une capture de chat s'archivent (jamais ne s'effacent) passé 30 jours.
  { id: '2026-10-14-ep2876-zones-vision-archivees', itemCount: 1 },
  // #3939.3 (lot S4, 14/10) — « Demander à Laura » depuis une fiche compte ouvre bien un fil neuf, et un check-in générique fait aussi ressortir une douleur sourcée.
  { id: '2026-10-14-s4-laura-fil-neuf-point-rapide', itemCount: 2 },
  // #3989 (14/10) — la base commune des faits publics (registre, annonces légales, marchés, offres, presse) ne garde aucune trace de l'espace qui a collecté, tenu en SQL.
  { id: '2026-10-14-base-commune-faits-publics', itemCount: 1 },
  // #4078 (14/10) — la Synthèse dit quand les cinq blocs du dossier complet sont antérieurs à leur production réelle (rattrapage ciblé, jamais au déploiement).
  { id: '2026-10-14-dossier-blocs-collecte-anterieure', itemCount: 1 },
  // #4088.12, #3235 (recette prod 14/10) — « Pourquoi ça compte » n'est plus jamais vide ; Laura dit un seul verdict et nomme les causes d'un changement.
  { id: '2026-10-14-r8b-cibles-verdict', itemCount: 2 },
  // #1124.1 (14/10) — un espace qui place des CDI chez ses clients voit toutes les offres d'emploi comme des pistes, sans rangement « hors métier ».
  { id: '2026-10-14-r9-placement-cdi-offres', itemCount: 1 },
  // #3278, #2887 (lot R9-FIX, 14/10) — le plan nomme toutes ses routes en clair et relit les signaux posés depuis l'analyse ; Découvrir compte ses offres ; la recherche de contacts n'attend plus ; « proche de signer » se range par stade.
  { id: '2026-10-14-r9-fix-recette-plan-routes-recherche', itemCount: 5 },
  // #4063.3 + #3702 + #4051 + #4053 (recette prod 14/10) — toast d'enrichissement exact, promesse « rien ne part sans validation » sur la carte d'approche, une seule source « messagerie connectée », import : un bilan par famille, société à valider, profil société, annulation qui archive.
  { id: '2026-10-14-r9b-recette-import-et-fiche-contact', itemCount: 4 },
  // #4187/#4189 (épopée #4184, 14/10) — Zoho CRM branchable ; Salesforce, Pipedrive, Attio, Odoo et Zoho se relisent chaque nuit, depuis la dernière synchro.
  { id: '2026-10-14-crm-zoho-lecture-synchro', itemCount: 3 },
  // #4185/#4186/#4188 (épopée #4184, 14/10) — envoyer un compte et ses contacts vers son CRM (unitaire et en lot), par la porte d'écriture, tous CRM.
  { id: '2026-10-14-crm-envoi-comptes-contacts', itemCount: 3 },
  // #4180 (lot SIGNAUX-LAURA, 14/10) — sur un compte suivi : ce qui a changé depuis la dernière vérification, chaque ligne datée du fait.
  { id: '2026-10-14-compte-suivi-ce-qui-a-change', itemCount: 2 },
  // #4182 (lot SIGNAUX-LAURA, 14/10) — une offre RH remonte à l'équipe demandeuse quand le texte la nomme, sinon un rôle à identifier avec sa méthode.
  { id: '2026-10-14-signaux-offre-equipe-demandeuse', itemCount: 2 },
  // #4179, #4181 (lot ENVOI, 14/10) — envoi Outlook sans double envoi ni promesse non observée ; une réponse reçue arrête les relances.
  { id: '2026-10-14-envoi-relances', itemCount: 3 },
  // #4177 (lot CONTACTS-ORG, 14/10) — groupe multi-entités : l'entité demandée est celle qu'on lit, sa couverture manquante se dit.
  { id: '2026-10-14-organigramme-changer-entite', itemCount: 1 },
  // #4178 (lot CONTACTS-ORG, 14/10) — la nature d'un numéro : jamais « professionnel » par déduction.
  { id: '2026-10-14-contacts-nature-telephone', itemCount: 2 },
  // #4070.2/.4 (lot S9, 14/10) — le re-plan et l'actualisation à la demande reçoivent aussi l'historique du compte (jusqu'ici seule l'analyse complète le portait).
  { id: '2026-10-14-s9-faits-a-la-demande', itemCount: 1 },
  // #4074.2 + #4073.1 (lot S9, 14/10) — plus aucun fournisseur nommé dans l'échec d'une analyse ; le dossier PDF porte l'historique chez ce client.
  { id: '2026-10-14-s9-faits-ecrans', itemCount: 2 },
  // #4045, #3901, #3866 (lot REC, 14/10) — Découvrir : des recrutements sur toute la page, triés par le métier du vendeur.
  { id: '2026-10-14-rec-decouvrir-recrutements-profondeur-pertinence', itemCount: 2 },
  // #3921 (décision Louis 13/10/2026, lot S7 14/10) — un changement de tranche d'effectif devient un signal, « observé le … ».
  { id: '2026-10-14-s7-effectif-observe', itemCount: 1 },
  // #3246, #3210.3 (lot cloud, 14/10) — organisation de la décision : un troisième champ à choix fermé, comparé par Laura entre cas gagnés et perdus, au même patron que la stratégie et le modèle d'achat.
  { id: '2026-10-14-cloud14-laura-compare-organisation-decision', itemCount: 1 },
  // #4022.1 (lot S2, 14/10) — le doublon d'intitulé d'offre levé sur `veille` (FINITION-13-10) revenait sur son jumeau `projects` (même écran, MERGED_SUB_TABS).
  { id: '2026-10-14-s2-accounts-synthese-sans-doublon', itemCount: 1 },
  // #4142 (lot S1, 14/10) — « Cadrer la collecte » avertit dès une 2ᵉ entité ou un 2ᵉ thème prioritaire : l'ancrage ne porte plus que sur un seul.
  { id: '2026-10-14-s1-cadrage-ancre-avertie', itemCount: 1 },
  // #4142 (lot S1, 14/10) — « Cadrer la collecte » permet désormais de viser une tranche d'effectif (minimum et/ou maximum).
  { id: '2026-10-14-s1-cadrage-effectif', itemCount: 1 },
  // #4142 (lot S1, 14/10) — les 6 exclusions préréglées du cadrage, qui ne retiraient rien pour de vrai, sont retirées.
  { id: '2026-10-14-s1-exclusions-preregles-honnetes', itemCount: 1 },
  // #4141 (lot S1, 14/10) — le bloc « Reste à vérifier » est retiré du récapitulatif avant lancement.
  { id: '2026-10-14-s1-recap-sans-reste-a-verifier', itemCount: 1 },
  // #4142 (lot S1, 14/10) — « Cadrer la collecte » : une entité ou un thème ne peut plus être à la fois prioritaire et écarté, un ajout dans un champ retire désormais le même libellé de son opposé.
  { id: '2026-10-14-s1-cadrage-sans-doublon', itemCount: 1 },
  // #4140 (lot S1, 14/10) — « Ouvrir ce compte » est désormais coché par défaut sur une arrivée fraîche sur /search.
  { id: '2026-10-14-s1-search-intent-defaut', itemCount: 1 },
  // Lot RESTES cloud (14/10) — cinq correctifs de recette : #4149, #3869.1, #3894.1, #4045.1, #4099.
  { id: '2026-10-14-restes-14-10', itemCount: 5 },
  // #4071.3, #4069.4, #2770.37 (lot R6-FIX, 14/10) — contradiction de Laura corrigée, démo des comptes analysés et libellé de plage en saisie.
  { id: '2026-10-14-r6-fix', itemCount: 3 },
  // #4016 L2.a, L3.a, L6.a (lot E7, 13/10) — trois mentions d'affichage : « vu le » d'un champion, « Laura a lu ce fil », le lien vers l'appel source d'une détection.
  { id: '2026-10-13-e7-affichages', itemCount: 3 },
  // #4016.L9.a + L10.c (lot E6, 13/10) — score de compte dès deux axes, nombre d'axes dit ; un signal isolé suffit pour « chaud ».
  { id: '2026-10-13-e6-scores-deux-axes-signal-chaud', itemCount: 3 },
  // #3989.b (lot E5, 13/10) — un nom ou un poste corrigé à la main ne repart jamais dans la base commune comme un fait nommé.
  { id: '2026-10-13-e5-correction-humaine-nom-poste', itemCount: 1 },
  // #2770.37 (lot E4, 13/10) — la politique d'équipe de la salle porte une plage PAR JOUR (« 12:00–14:00 (lun.) »), respectée par le plan.
  { id: '2026-10-13-e4-demo-agenda-jours', itemCount: 1 },
  // Lot E2 (13/10) — déclencheurs : un événement résolu ou échu ne sonne plus, et un même fait ne sonne qu'une fois.
  { id: '2026-10-13-e2-triggers-alertes', itemCount: 2 },
  // #4068 (lot E1, 13/10) — les messages d'erreur IA ne nomment plus le fournisseur du modèle.
  { id: '2026-10-13-e1-erreurs-ia-sans-fournisseur', itemCount: 1 },
  // #4069, #4071 (lot W-G, 13/10) — Laura reçoit les affaires gagnées/perdues saisies dans Bellum, et le panneau « contexte utilisé » liste les faits du compte.
  { id: '2026-10-13-w-g-faits-du-compte', itemCount: 2 },
  // #3920, #3666 (lot W-F, 13/10) — l'alerte « nouveau signal » compare toutes les sources et nomme le fait ; une liste dont la lecture échoue le dit au lieu d'afficher « Aucun … ».
  { id: '2026-10-13-w-f-signaux-et-erreurs-de-liste', itemCount: 3 },
  // #3939.3 + #3666 (lot W-D2, 13/10) — Laura propose d'elle-même une douleur sourcée et datée sur un compte ; l'avancement d'une analyse se dit en étapes, plus en pourcentage.
  { id: '2026-10-13-w-d2-laura-douleur-etapes', itemCount: 3 },
  // #4055.1 (recette prod 14/10, lot R4a) — la carte « Cartographie » d'un tour d'horizon écarte les ESN connues et nomme les comptes déjà dans la base ou à rapprocher.
  { id: '2026-10-14-r4a-cartographie-esn-et-niveaux', itemCount: 1 },
  // #3889.1 (recette prod 14/10, lot R4a) — « quels projets a <compte> dans nos documents » reste toujours proposé à Laura, même quand la sélection d'outils (#4112) est active.
  { id: '2026-10-14-r4a-fiabilite-lecture-projets-documents', itemCount: 1 },
  // #4058.1 / #4057.1 (recette prod 14/10, lot R4a) — « interlocuteurs cyber GRC de EDF » (entreprise absente du portefeuille) relance la recherche de personnes dans le même tour plutôt qu'un texte « 0 contact ».
  { id: '2026-10-14-r4a-recherche-personnes-entreprise-absente', itemCount: 1 },
  // #4150 (recette prod 14/10, lot R4a) — le bandeau « Qualification complémentaire nécessaire » ne s'allume plus sur une absence structurelle ni sur un CRM connecté simplement non croisé.
  { id: '2026-10-14-r4a-badge-qualification-action-reelle-ou-panne', itemCount: 1 },
  // #3705.1 (R4b, 14/10) — « logiciels » est lu comme une activité (Éditeurs & tech), plus un mot cherché dans le nom légal.
  { id: '2026-10-14-r4b-logiciels-est-une-activite', itemCount: 1 },
  // #3941.1 (R4b, 14/10) — Laura route « startup » vers le préréglage Découvrir, en conversation comme sur la carte.
  { id: '2026-10-14-r4b-laura-route-startup', itemCount: 1 },
  // Point 6 (R4b, 14/10) — /projects ne répète plus « non mesuré » devant sa propre raison.
  { id: '2026-10-14-r4b-non-mesure-ne-se-repete-plus', itemCount: 1 },
  // #3916.1 (R4b, 14/10) — une annonce légale déjà figée sans lien par l'analyse reprend le lien trouvé par la veille continue du registre.
  { id: '2026-10-14-r4b-annonce-legale-ne-perd-plus-son-lien', itemCount: 1 },
  // #3918.1 (R4b, 14/10) — les affaires CRM gagnées/perdues/en sommeil sont montées sur la fiche compte (Opportunités).
  { id: '2026-10-14-r4b-affaires-crm-sur-la-fiche', itemCount: 1 },
  // #3928.1 (R4b, 14/10) — la synthèse du compte lit désormais le même lecteur de signaux que l'onglet Opportunités.
  { id: '2026-10-14-r4b-synthese-meme-lecteur-signaux', itemCount: 1 },
  // #4127 (13/10) — /accounts sans le bandeau « État du portefeuille » ; revient délibérément sur #4087.1 (Louis 13/10).
  { id: '2026-10-13-accounts-sans-bandeau-portefeuille', itemCount: 1 },
  // #3400 (lot W-E, 13/10) — « Avant d'agir » sans clé brute ni JSON.
  { id: '2026-10-13-w-e-avant-d-agir-lisible', itemCount: 1 },
  // #3819, #3918.3, #4055 (lot W-C, 13/10) — la compétence suit le compte, /integrations dit le hors périmètre, nom proche ≠ « Nouvelle cible ».
  { id: '2026-10-13-w-c-competence-integrations-nom-proche', itemCount: 3 },
  // #4057, #3866, #4060, #4071.3 (lot W-B, 13/10) — Laura : compte par son nom, partenaire par SIREN, approche directe, contexte élargi.
  { id: '2026-10-13-w-b-laura-nom-partenaire-approche-contexte', itemCount: 4 },
  // #4061.c, #4045.9, #3895.1 (lot W-A, 13/10) — Focale dans l'URL, besoins par famille, portée de note éditable.
  { id: '2026-10-13-w-a-focale-besoins-portee-note', itemCount: 3 },
  // #4087 (lot PETITS-2, 13/10) — (#4087.1 retiré par #4127) /contacts ne redit plus le compte des sélectionnés.
  { id: '2026-10-13-petits-2-bande-portefeuille-et-compte-selection', itemCount: 1 },
  // #3894, #4057, #3889, #3983, #3295 (lot RECETTE-4-FIX, 13/10) — un brouillon par contact nommé, la carte de recherche de personnes quand l'espace n'a pas la personne, un document cité par projet, la démo qui garde la tête de groupe et deux pertes au même motif.
  { id: '2026-10-13-recette-4-fix-brouillons-personnes-projets-demo', itemCount: 1 },
  // #3939, #3769, #3235, #4101 (lot RECETTE-3-FIX, 13/10) — douleurs sourcées, carte de priorités actualisée, comparaison des verdicts, plan de journée placé, « 0 lien vérifié » dit autrement.
  { id: '2026-10-13-recette-3-fix-laura-plan-douleur-verdict', itemCount: 5 },
  // #4022.1 / #4061 (FINITION-13-10) — la synthèse de la veille compte au lieu de répéter ; l'organigramme garde sa vue au retour.
  { id: '2026-10-13-finition', itemCount: 2 },
  // #4068 (lot DECOUVRIR-CARTE, 13/10) — la carte Découvrir : 5 signaux forts, 10 de contexte, le bruit hors carte, un fait = une ligne.
  { id: '2026-10-13-decouvrir-carte-signaux-forts', itemCount: 3 },
  // #4067 (lot DECOUVRIR-COLLECTE, 13/10) — chaque carte de Découvrir est interrogée (offres, actualités) ; les faits publics déjà collectés resservent à tous les espaces.
  { id: '2026-10-13-decouvrir-collecte-chaque-carte-cherchee', itemCount: 3 },
  // #3866, #3869, #4045, #4097, #4098, #4099 (lot RECETTE-GRANDE-FIX, 13/10) — l'offre visée sur chaque carte, l'approche des décideurs connus dans le même tour, le mot-clé de Découvrir qui reclasse, la file de Laura sans doublon, le markdown du panneau Laura, « contacts clés » = contacts pertinents.
  { id: '2026-10-13-recette-grande-fix', itemCount: 6 },
  // #4085, #4086, #4087, #4092, #4093 (13/10) — petits écrans : /search sans champs de contexte, un intent par clic, bande de comptes sur une ligne, « Voir la fiche » sur les cartes d'opportunité, case par entreprise dans /contacts.
  { id: '2026-10-13-petits-ecrans', itemCount: 4 },
  // #4078 (lot PARITE-DEMO, 12/10) — les cinq blocs du dossier complet produits par une vraie analyse.
  { id: '2026-10-12-parite-demo-blocs-dossier', itemCount: 3 },
  // #2877.1 (lot MESSAGES, 12/10 soir) — Mémoire de style : la règle apprise sur la base commune (anonymisée) s'affiche, proposée et jamais appliquée.
  { id: '2026-10-12-messages-regle-commune-a-lecran', itemCount: 1 },
  // #3623.8 (lot DIVERS, 12/10 soir) — le trombone de /search lit aussi les textes usuels (tsv, log, xml, yaml).
  { id: '2026-10-12-divers-pieces-jointes-textes-usuels', itemCount: 1 },
  // #3873.5 (lot DECOUVRIR, 12/10 soir) — en mode Neutre, la cible du profil n'est plus affichée dans Découvrir.
  { id: '2026-10-12-decouvrir-neutre-sans-cible-du-profil', itemCount: 1 },
  // #3246, #3247 (lot CAS-REX, 12/10 soir) — stratégie et modèle d'achat saisissables sur une perte déjà clôturée ; les preuves au secteur composé (« Banque — … ») sont reconnues.
  { id: '2026-10-12-cas-rex-perte-cloturee-secteur-preuve', itemCount: 2 },
  // #3234 (lot RAISON-B, 12/10) — Laura mesure aussi les réponses par angle de message, sur les e-mails envoyés depuis l'app.
  { id: '2026-10-12-raison-b-reponses-par-angle', itemCount: 1 },
  // #4016.4 (lot VERROUS, 12/10) — le bloc « Envois sous mandat signé » dit que le mandat est renouvelable.
  { id: '2026-10-12-verrous-mandat-renouvelable', itemCount: 1 },
  // #4044.1 (RECETTE-M-FIX, 12/10) — chaque carte de signal porte ses propres contacts ; plus de bloc « contacts connus » répété.
  // #4061 — tout nœud de l'arbre de l'organigramme s'ouvre (fiche ou panneau personne).
  // #4050.3 — « Préparer un e-mail par personne » génère tous les brouillons à l'ouverture, en parallèle borné.
  // #4045.3 — Découvrir : le mot-clé trie réellement les signaux (le recoupement d'abord, « Correspond à » le cite).
  // #4022.7 — Opportunités : une offre = une seule occurrence visible (le résumé d'équipe compte, ne renomme plus).
  { id: '2026-10-12-recette-m-fix', itemCount: 5 },
  // #4044 (lot STAGES-HORS-SIGNAUX, 12/10) — une offre de stage n'est plus jamais un signal : veille, Opportunités, Découvrir, Mes cibles, Laura, alertes.
  { id: '2026-10-12-stages-hors-signaux', itemCount: 2 },
  // #4050.1 (12/10) — l'envoi groupé rédige ses mails en parallèle borné (4), avec « N / total rédigés ».
  { id: '2026-10-12-envoi-groupe-redaction-parallele', itemCount: 1 },
  // #4047.1, #4049.1 (12/10) — « Actualiser » dans l'avis de collecte des signaux ; cartes de l'arbre hiérarchique cliquables.
  { id: '2026-10-12-compte-clic-actualiser-et-arbre', itemCount: 2 },
  // #4034 (lot CV-APERCU, 12/10) — le CV original est conservé ; « Ouvrir le CV » ouvre son aperçu.
  { id: '2026-10-12-4034-apercu-cv', itemCount: 2 },
  // #4051 #4052 #4053 (lot IMPORT-CRM, 12/10) — un export contacts crée ses comptes, références CRM reconnues, bilan par famille.
  { id: '2026-10-12-import-crm-references-et-bilan', itemCount: 3 },
  // #4054 / #4055 (lot LAURA-BASE, 12/10) — « que travailler lundi ? » depuis la base importée : contacts connus et manques ; recherche de comptes en trois niveaux de rapprochement.
  { id: '2026-10-12-laura-base-priorites-rapprochement', itemCount: 3 },
  // #4057, #4058, #4060 (lot LAURA-RECHERCHE, 12/10) — « interlocuteurs cyber de X » sans formulaire stratégique ; expertise et secteur distincts ; approche directe au choix.
  { id: '2026-10-12-laura-recherche-interlocuteurs-sans-formulaire', itemCount: 3 },
  // #4056 / #4062 / #4063 (lot ORG-CONTACT, 12/10) — organigramme superposé au CRM, message préparable sans e-mail, enrichissement téléphone retrouvé au retour sur la fiche.
  { id: '2026-10-12-org-contact-crm-brouillon-sans-email-enrichissement-repris', itemCount: 3 },
  // décision Louis 12/10 (lot DEMO-PRODUIT) — « Lire comme » s'ouvre dans le produit aux rôles qui encadrent : même brief, autre ordre.
  { id: '2026-10-12-demo-produit-lire-comme', itemCount: 1 },
  // #4064, #4065 (lot LISTINGS, 12/10) — Laura dresse des listes sur une période passée ou à venir, depuis chaque outil branché, croisement inclus.
  { id: '2026-10-12-listings-laura-toutes-sources', itemCount: 3 },
  // #4066 (lot FILE-LAURA, 12/10) — écris à Laura pendant qu'elle répond : tes messages attendent leur tour (5 au plus), modifiables et retirables.
  { id: '2026-10-12-file-laura-messages-en-attente', itemCount: 3 },
  // #4070 (lot ANALYSE-FAITS, 12/10) — l'analyse lit tout l'historique du compte, daté : affaires, missions, interlocuteurs connus, analyse précédente.
  { id: '2026-10-12-analyse-faits-historique-du-compte', itemCount: 3 },
  // #4072 (lot ECRANS-FAITS, 12/10) — organigramme, relances, préparation de RDV, alertes, listes de cibles et matching nourris par l'historique du compte, daté.
  { id: '2026-10-12-ecrans-faits-historique-du-compte', itemCount: 4 },
  // #4073 (lot EXPORTS-FAITS, 12/10) — l'export CSV d'une liste cible porte les faits datés de chaque compte, sans jamais nommer leur provenance.
  { id: '2026-10-12-exports-faits-liste-cible', itemCount: 2 },
  // #4069 / #4071 (lot FAITS-SOCLE, 12/10) — un seul lecteur des faits du compte ; Laura les reçoit tous, datés, sans jamais nommer leur provenance.
  { id: '2026-10-12-faits-socle-laura-faits-du-compte', itemCount: 2 },
  // #4074 (lot NOMMAGE, 12/10) — plus aucun nom de source ni « Mémoire marché » à l'écran ni dans les réponses de Laura : un fait se dit par sa nature et sa date.
  { id: '2026-10-12-4074-nommage-sources', itemCount: 2 },
  // #4067 (lot DECOUVRIR-SOURCES, 12/10) — Découvrir classe aussi avec l'historique, le CRM, la mémoire marché, le référentiel, le Drive et les missions ; ligne « Pourquoi ».
  { id: '2026-10-12-decouvrir-sources-classement', itemCount: 3 },
  // #4054, #4065, #4066 (lot RECETTE-N-FIX, 12/10) — « que travailler lundi » lit la base importée ; la file de Laura repart ; l'agenda se lit jusqu'au bout ; une valeur absente ne s'affiche plus « non mesuré ».
  { id: '2026-10-12-recette-n-fix-file-agenda-affichage', itemCount: 4 },
  // #3935 (lot BATCH-CV, 12/10) — 400 à 2000 CV d'un coup : lecture en parallèle, pause propre quand le service sature.
  { id: '2026-10-12-cv-batch-echelle', itemCount: 2 },
  // #4045 (lot DISCOVER-MOTCLE, 12/10) — le mot-clé de la recherche Découvrir trie les signaux ; plus de bruit du greffe ni de « Sans lien vérifiable ».
  { id: '2026-10-12-discover-motcle-signaux-tries', itemCount: 3 },
  // #3295 (lot DEMO-FIX, 12/10) — une affaire perdue reste atteignable depuis le dossier du compte, avec ses « Pertes documentées ».
  { id: '2026-10-12-demo-fix-affaires-closes-atteignables', itemCount: 1 },
  // #4016 (lot L1, 11/10) — la probabilité de signature s'affiche, calibrée sur les affaires closes, avec ses axes et son intervalle ; CA probable du trimestre sur /projects.
  { id: '2026-10-11-4016-l1-probabilite-calibree', itemCount: 3 },
  // #4016 L4 (décision Louis 11/10) — données ESTIMÉES badgées : e-mail déduit du motif de l'entreprise puis vérifié, N+1 probable déduit des intitulés.
  { id: '2026-10-11-4016-donnees-estimees-badgees', itemCount: 4 },
  // #4016 (lot L6, 11/10) — doublons certains fusionnés seuls (réversible), pipe « détecté, à revoir », Action OS autonome ; le CRM garde son go.
  { id: '2026-10-11-4016-l6-ecriture-automatique', itemCount: 3 },
  // #4016 (lots L11 et L13, 11/10) — export de masse des besoins, registre luxembourgeois sur contrat documenté, note libre en faits à revoir, « Envoyé » détecté dans la boîte.
  { id: '2026-10-11-4016-l11-l13-export-collecte', itemCount: 4 },
  // #4016 L12 (11/10) — alertes Découvrir en SMS vers BE/CH/LU, analyse d'appels avec enregistrement annoncé, résumés hebdo jamais cochés remis à zéro.
  { id: '2026-10-11-l12-sms-be-ch-lu-appels-consentis-digest-remis-a-zero', itemCount: 3 },
  // #3278.1 (lot X1, 11/10) — deux routes de plus pour Laura : événement ou communauté, inbound ou contenu.
  { id: '2026-10-11-x1-routes-evenement-et-inbound', itemCount: 1 },
  // #4016 L3 (lot X1, 11/10) — Laura lit le contenu d'un fil de TA messagerie, pour toi seul.
  { id: '2026-10-11-x1-laura-lit-le-contenu-de-tes-fils', itemCount: 2 },
  // #4016 L2 (lot X1, 11/10) — « Ton champion a changé de boîte » : l'employeur des champions est relu chaque mois.
  { id: '2026-10-11-x1-champion-change-de-boite', itemCount: 1 },
  // #4016 (lot X2/L8, 11/10) — un commercial voit « Ce qu'il reste à vendre » : la capacité de l'équipe, pas la sienne.
  { id: '2026-10-11-x2-l8-commercial-voit-la-capacite-equipe', itemCount: 1 },
  // #4016 (lot X2/L9, 11/10) — le score d'une filiale ou d'une BU (onglet Accès) s'affiche avec ses axes, et nomme ceux qu'on n'a pas pu évaluer.
  { id: '2026-10-11-x2-l9-score-entite-avec-ses-axes', itemCount: 1 },
  // #4016 (lot X2/L10, 11/10) — une société de services concurrente se montre dès un seul parcours observé, dite « 1-2 parcours ».
  { id: '2026-10-11-x2-l10-concurrent-des-un-parcours', itemCount: 1 },
  // #4006, #3769, #3761.16, #3764, #3861 (lot W1, 11/10) — la saisie du chat ne perd plus ses premiers caractères ; les réponses de Laura composent les pièces communes ; la ligne « Complétude » disparaît.
  { id: '2026-10-11-w1-chat-saisie-et-reponses-composees', itemCount: 4 },
  // #4034, #2979, #3234 (lot W3, 11/10) — « Ouvrir le CV » depuis l'en-tête d'une fiche consultant ; lignes de /missions plus compactes ; une réponse à un message envoyé depuis l'app retrouve son contact par l'identifiant d'envoi.
  { id: '2026-10-11-w3-cv-missions-reponses', itemCount: 3 },
  // #3819 / #3941 / #3928 (lot W4, 11/10) — Découvrir : « N besoins connus » lit l'analyse, compétences reliées aux signaux, levées de fonds datées et sourcées, une seule règle de récence.
  { id: '2026-10-11-w4-decouvrir-besoins-levees-signaux', itemCount: 3 },
  // #3579 / #2434.77 / #2899 (lot W5, 11/10) — message vocal : langue par segment ; échantillonnage anonymisé opt-in par espace.
  { id: '2026-10-11-w5-voix-langue-par-segment-et-echantillonnage-opt-in', itemCount: 2 },
  // #3866 / #3243.1 / #3247 / #3889 (lot W6, 11/10) — Laura nomme le type de relation de chaque compte, pousse toujours un consultant voulu, trouve les chemins via un partenaire, lit les documents par nom d'entreprise.
  { id: '2026-10-11-w6-laura-adequation-relation-consultant-acces', itemCount: 4 },
  // #3921.2 / #2433.4 / #3666.6 (lot W8, 11/10) — changement de dirigeant lu dans les annonces légales ; zones lues d'une capture relues à la réouverture du fil ; import « exploitable par Laura ».
  { id: '2026-10-11-w8-registre-vision-import', itemCount: 3 },
  // #3916 / #3901 / #3700 (lot W10, 11/10) — les annonces légales reviennent sur la fiche, un appel d'offres n'est rattaché qu'à son acheteur, la carte Séquences ressort du pli.
  { id: '2026-10-11-w10-annonces-legales-appels-offres-acheteur', itemCount: 3 },
  // #3935 (lot OCR-PARTOUT, 12/10) — l'OCR lit aussi Mes documents, les appels d'offres, les organigrammes (images), les missions et les pièces jointes de Laura ; les CV .doc/.rtf et photo sont lus.
  { id: '2026-10-12-ocr-partout', itemCount: 3 },
  // #3935 (lot CV-OCR, 12/10) — le texte d'un CV PDF est jugé, recollé s'il est espacé lettre à lettre, relu par OCR / Claude s'il reste mauvais.
  { id: '2026-10-12-cv-ocr-qualite-texte', itemCount: 2 },
  // #3935, #3947 (lot QUALIF-AUTO, 12/10) — un CV importé et lu = fiche qualifiée, visible du matching ; plus de validation manuelle.
  { id: '2026-10-12-qualif-auto-cv-lu-fiche-qualifiee', itemCount: 2 },
  // Lot B1-RESTES (12/10) — mandat d'envoi lié à la messagerie, « Ajouter une plage » opérant, outils branchés cohérents, tri de la boîte mail sans envoi.
  { id: '2026-10-12-b1-restes-mandat-plage-outils-boite', itemCount: 3 },
  // #2770.37 (lot AGENDA, 12/10 soir) — une plage de la politique d'équipe peut ne valoir que certains jours de la semaine.
  { id: '2026-10-12-agenda-plages-par-jour', itemCount: 1 },
  // #4022 (lot OPP-FIX, recette prod 12/10) — Opportunités : offres d'emploi classées en recrutements, articles dédoublonnés, vision repliée à 5, contacts connus une fois, programmes fondus.
  { id: '2026-10-12-opp-fix-4022-cartes-dedoublonnees', itemCount: 2 },
  // Lot RECETTE-B4-FIX (12/10) — périmètre France sur les lieux en langue locale, textes presse dédoublonnés, brouillon par personne borné avec erreur nommée, un seul lieu sur la fiche consultant.
  { id: '2026-10-12-recette-b4-fix-perimetre-brouillon-lieu', itemCount: 3 },
  // #4042 (lot ENVOI-GROUPE, 12/10) — « Envoyer le mail rédigé » ouvre une revue personne par personne : modifier chaque mail, pièces jointes, générer les mails manquants.
  { id: '2026-10-12-envoi-groupe-revue-par-personne', itemCount: 2 },
  // Lot B2-RESTES (12/10) — Entrée envoie dans /chat, « que faire cette semaine » ouvre par rôle × stade, compteur « Jobs IT » visible, recruteurs d'offres rattachés.
  { id: '2026-10-12-b2-restes-chat-semaine-jobs', itemCount: 4 },
  // #3278.1 (lot PERSONA-ROUTE, 12/10 soir) — le plan d'action nomme les mêmes routes que Laura (veille, talent, événement, inbound) ; l'écran Équipe renvoie vers le profil pour le rôle et la taille de l'ESN. #3386.
  { id: '2026-10-12-persona-route-plan-memes-routes', itemCount: 2 },
  // #4044 / #4045 / #4046 (lot MATIN-12-10, retours de Louis du 12/10) — Découvrir montre recrutements, projets et vie de l'entreprise avec leurs liens ; la ligne occupe la largeur.
  { id: '2026-10-12-matin-12-10-decouvrir-signaux-contacts', itemCount: 3 },
  // #3678.6 (lot COMPTE-SUITE, 12/10 soir) — un signal hors de ton offre connue reste consultable, jamais promu en recommandation.
  { id: '2026-10-12-compte-suite-signal-hors-cible-consultable', itemCount: 1 },
  // #4045.1 (lot LIENS-RATTRAPAGE, 12/10) — les comptes déjà analysés retrouvent le lien de leurs offres d'emploi, sans nouvelle collecte.
  { id: '2026-10-12-liens-rattrapage-4045-offres', itemCount: 1 },
  // Lot BATCH-CV (Louis 12/10, #3935/#3883), repris à l'intégration du 15/10 — archive ZIP jusqu'à 2,5 Gio, progression « N / total lus », échecs nommés et relançables.
  { id: '2026-10-12-batch-cv-import-2000', itemCount: 3 },
  // #3386 (décision Louis 11/10, « fais tout ») — le tableau rôle × stade (28 combinaisons) ordonne /briefing et cadre Laura.
  { id: '2026-10-11-3386-roles-stades-combinaisons', itemCount: 2 },
  // #4009 (lot FIX-4009, 11/10) — le maillon faible ne cite plus une fiche supprimée ou archivée ; plus de plantage au premier chargement d'un dossier.
  { id: '2026-10-11-fix-4009-maillon-faible-chargement-froid', itemCount: 2 },
  // SIG-B (11/10) — les recruteurs nommés par une offre publiée deviennent des contacts candidats, preuve à l'appui.
  { id: '2026-10-11-sig-b-recruteurs-offres', itemCount: 2 },
  // #2875 (11/10) — les rappels d'hygiène (débrief d'appel, retour d'expérience manquants) sortent du budget d'interruption de Laura.
  { id: '2026-10-11-2875-rappels-hygiene-hors-budget', itemCount: 2 },
  // #2916 (#2399.2, 11/10) — « Matcher un besoin entrant » : routine qui écrit le matching de chaque nouveau besoin, sans geste, rien n'est envoyé.
  { id: '2026-10-11-2916-matching-auto-besoin-entrant', itemCount: 2 },
  // #2770.35/.37 (décision Louis 11/10) — « Organise-moi ma journée » lit les outils branchés et la politique d'équipe saisie par le manager.
  { id: '2026-10-11-2770-plan-outils-politique-equipe', itemCount: 2 },
  // #3989 + #2877 GLOBAL (Louis 11/10) — la base commune capitalise : faits société de Bellum partagés, apports d'utilisateurs anonymisés, effacement RGPD propagé, apprentissage des messages de tous les espaces.
  { id: '2026-10-11-3989-base-commune-capitalise', itemCount: 3 },
  // #3219 (#190.2 côté contact, décision Louis 11/10) — avant d'agir sur un contact, la fiche et Laura disent ce qui diffère selon la source ou le périmètre, sans trancher.
  { id: '2026-10-11-3219-controle-avant-action-contact', itemCount: 2 },
  // #4016 L7 (11/10) — les quotas ne brident plus : plafond de Laura = celui du plan, raisonnement et documents élargis, veille de tout le portefeuille, Découvrir sans palier.
  { id: '2026-10-11-4016-l7-quotas-leves', itemCount: 4 },
  // #3223 (décision Louis 11/10) — back-office : juge évalué des recommandations génériques + classement agrégé des contestations.
  { id: '2026-10-11-3223-juge-recommandations-generiques', itemCount: 2 },
  // Métiers placés déduits (Louis 11/10) — les métiers de l'ESN se déduisent de tout son contexte et élargissent ses signaux de recrutement.
  { id: '2026-10-11-metiers-places-deduits', itemCount: 3 },
  // #4016 (lot L5, 11/10) — l'envoi automatique devient possible, toujours derrière un mandat signé, une portée par usage.
  { id: '2026-10-11-4016-l5-envoi-sous-mandat', itemCount: 3 },
  // DECATHLON 11/10 — les offres de toutes les entités d'un groupe remontent ; une offre datée passe devant un texte non daté.
  { id: '2026-10-11-offres-groupe', itemCount: 2 },
  // SIG-A (11/10) — offres des grands sites d'emploi triées par les métiers de l'espace ; pile technique et effectif complétés par les offres publiées.
  { id: '2026-10-11-sig-a-offres-publiees', itemCount: 2 },
  // #4016 (lot L14, 11/10) — la politique de confidentialité publiée décrit les nouveaux traitements et les durées réellement appliquées.
  { id: '2026-10-11-4016-l14-politique-confidentialite', itemCount: 2 },
  // #3705.5 rouvert (Louis 11/10) — une filiale présidée par sa holding est aussi vérifiée : « holding → filiale » sort plus souvent.
  { id: '2026-10-11-3705-holding-filiale-presidee', itemCount: 1 },
  // #3889 (épopée #3977, 11/10) — Laura cherche les projets d'un compte dans les documents de l'espace : besoins ouverts, anciens besoins, missions, chacun avec sa source.
  { id: '2026-10-11-3889-laura-projets-documents', itemCount: 2 },
  // #3978 / #3678 (lot RBE, 11/10) — chaque signal, pain et enjeu est classé par domaine d'offre à l'analyse : « Ce que ça change » peut enfin sortir sur un compte réel.
  { id: '2026-10-11-rbe-signaux-classes-par-domaine-offre', itemCount: 2 },
  // #3973 / #3708 (lot RBH, 11/10) — « Outils et sources » exclut l'outil décoché, pas toute sa famille.
  // item2 (#3973, reste RBH) — messagerie et agenda : le backend décoché n'est jamais lu, l'autre branché l'est.
  { id: '2026-10-11-rbh-outils-sources-exclusion-par-outil', itemCount: 2 },
  // #3399 / #3245 (lot RBI, 11/10) — « Quel compte attaquer en premier ? » rend la carte complète des priorités, paris longs nommés.
  { id: '2026-10-11-rbi-priorites-carte-complete-premier-compte', itemCount: 1 },
  // #3399 / #3245 (lot F3399, 11/10) — « Quel compte attaquer en premier ? » : le compte que Laura retient ne cache plus Accor, Airbus et les autres.
  { id: '2026-10-11-f3399-compte-a-attaquer-hors-plafond', itemCount: 1 },
  // #3857 / #3218 (lot RBJ, 11/10) — fiches homonymes en boutons nommés, périmètre retenu transmis au run.
  { id: '2026-10-11-rbj-fiches-homonymes-boutons-perimetre-run', itemCount: 2 },
  // #3866 (11/10) — l'offre cherchée survit à une relance de la recherche de comptes.
  { id: '2026-10-11-3866-relance-garde-offre', itemCount: 1 },
  // #3236 / #3857 (lot W2, 11/10) — l'étude Approfondie interrompue reprend seule en fond ; le clic sur une fiche homonyme l'ouvre.
  { id: '2026-10-11-w2-etude-approfondie-reprend-en-fond', itemCount: 2 },
  // #3678 / #2979 / #3895 (lot RBD, 11/10) — « Ce que ça change » en démo SNCF, lignes /missions compactes, historique Sanofi.
  { id: '2026-10-11-rbd-ce-que-ca-change-missions-compactes-historique-sanofi', itemCount: 3 },
  // #3901 (11/10) — les offres d'emploi d'un compte suivent le domaine d'offre et les métiers placés du profil.
  { id: '2026-10-11-3901-offres-par-compte-profil', itemCount: 2 },
  // #4009 (11/10) — le brief ne cite plus aucune fiche supprimée.
  { id: '2026-10-11-4009-brief-fiches-supprimees', itemCount: 1 },
  // #4006 / #3857 (lot RBA, 11/10) — saisie du chat protégée pendant une touche morte, réserve dite une fois, pas d'options promises sans bouton.
  { id: '2026-10-11-rba-chat-saisie-reserve-options', itemCount: 3 },
  // #3819 (lot RBB, 11/10) — la raison et les critères de Découvrir suivent le compte (analyse + dossier) ; besoins connus en démo.
  { id: '2026-10-11-rbb-criteres-decouvrir-suivent-le-compte', itemCount: 3 },
  // #3705.5 (lot RBC, 11/10) — « Filiale de <groupe> » sur les lignes de Découvrir et de la recherche de Laura.
  { id: '2026-10-11-rbc-filiale-de-groupe-par-ligne', itemCount: 2 },
  // #3218 / #3670 / #3399 (lot RAW, 11/10) — « lance-la » relance un dossier existant, fiche supprimée retrouvée, priorités en carte.
  { id: '2026-10-11-raw-relance-fiche-supprimee-priorites', itemCount: 3 },
  // #3192.2 / #3671 (lot RAY, 11/10) — la carte « facture 30 jours » sur Facturation, une seule ancienneté de retard.
  { id: '2026-10-11-ray-facture-30-jours-anciennete-retard', itemCount: 2 },
  // #3678 / #2979 (lot RAX, 11/10) — Réserve / À faire dits une fois sur les pistes affichées, nom du compte sur une ligne dans /missions.
  { id: '2026-10-11-rax-pistes-groupees-compte-sur-une-ligne', itemCount: 2 },
  // #3993 / #3678 (lot RAQ, 10/10) — hypothèses qualifiées à gauche, intitulé « Ce que ça change » sur les pistes.
  { id: '2026-10-10-raq-hypotheses-a-gauche-ce-que-ca-change', itemCount: 2 },
  // #3925 / #3231 (lot RAP, 10/10) — « Voir l'offre » dans « Ce que BellumAI ajoute », fiche des rôles servie d'office.
  { id: '2026-10-10-rap-lien-offre-fiche-roles', itemCount: 2 },
  // #3777 / #2986 (lot RAM2, 10/10) — « Cinq questions de terrain » sur le Plan, échéance de mission nommée dans le bloc.
  { id: '2026-10-10-ram2-questions-terrain-plan-echeance-mission', itemCount: 2 },
  // #3769 / #3871 / #3718 / #3700 / #3925 / #3777 / #2986 (lot RAM, 10/10) — Répondu et historique, lien vers l'offre, plan SNCF, mission.
  { id: '2026-10-10-ram-contacts-repondu-historique-signaux', itemCount: 4 },
  // #3678 / #3682 / #3668 / #3419 / #3420 (lot RAH, 10/10) — pistes lisibles, dernière vérification, contexte visible, cartes bloquées.
  { id: '2026-10-10-rah-pistes-verification-contexte-cartes', itemCount: 4 },
  // #3677 / #3702 / #3742 / #3416 / #3883 (lot RAI, 10/10) — lien Programmes, expéditeur, changement de pays, actions terminées, CV jamais lus.
  { id: '2026-10-10-rai-programmes-expediteur-pays-actions-cv', itemCount: 5 },
  // #3720 / #3670 / #3861 (lot RAJ, 10/10) — carte « Prochaine action » seule, compte retrouvé par son début, badge des sources enroulé, composeur sans débordement.
  { id: '2026-10-10-raj-prochaine-action-altran-sources-composeur', itemCount: 4 },
  // #3218 / #3868 / #3903 / #3245 / #3248 (lot RAL, 10/10) — Laura lance sur « lance-la », compare les quatre voies d'accès, bilan de relance en cinq colonnes, pari long cité, prérequis nommés.
  { id: '2026-10-10-ral-laura-lancer-voies-relance-pari-prerequis', itemCount: 5 },
  // #3677 / #3671 / #3416 / #3704 (lots RS et RT, 10/10) — retard de paiement unique, lien Programmes, prochaine action, critères de Laura gardés.
  { id: '2026-10-10-rt-retard-programmes-prochaine-action-criteres', itemCount: 4 },
  // #3672 / #3819 / #3850 / #3720 / #3705 / #3710 / #3938 (lots RU2 et RV, 10/10) — numéros, porte d'entrée, comptes sans signal, Y aller, filiale, titre, plan manuel.
  { id: '2026-10-10-r-d-numeros-entree-sans-signal-y-aller', itemCount: 8 },
  // #3386 (lot RX, 10/10) — matrice rôle × stade : Laura adapte son angle au rôle (dirigeant, Business Developer…).
  { id: '2026-10-10-rx-laura-roles-stades', itemCount: 2 },
  // #3873.6 / #3866 / #3670 (lot R-w, 10/10) — Découvrir hors cibles, Laura sans « Recommandé » non prouvé, compte retrouvé.
  { id: '2026-10-10-rw-laura-decouvrir', itemCount: 3 },
  // #3866 (lot RAR, 10/10) — Laura : un recrutement hors du domaine de l'offre ne prouve pas l'adéquation.
  { id: '2026-10-10-rar-laura-recrutement-hors-offre', itemCount: 1 },
  // #3702 (lot RZ, 10/10) — une séquence e-mail prépare son brouillon relisible (« À valider »), l'échec se nomme ; fiche contact : bouton de refus et champ Nom lisibles.
  { id: '2026-10-10-rz-sequence-brouillon-relisible', itemCount: 2 },
  // #3218 / #3670 / #3704 / #3720 / #2979 (lot RAT, 10/10) — reprise de RAN réfutée en prod : « lance-la » lance, fiche archivée retrouvée, la zone survit au tour suivant, bandeau visible, nom de compte entier.
  { id: '2026-10-10-rat-lance-la-zone-gardee-bandeau-visible', itemCount: 5 },
  // #3218 / #3245 / #3670 / #3704 / #3399 / #3677 / #3720 / #2979 (lot RAN, 10/10) — Laura lance sur « lance-la », cite tous les paris longs, retrouve un compte, garde ses critères, nomme l'interlocuteur ; lien Programmes ; colonne Compte lisible.
  { id: '2026-10-10-ran-laura-lance-paris-interlocuteur-programmes', itemCount: 5 },
  // #3769 / #3246 (lot RAA, 10/10) — la frappe gagne sur le brouillon restauré ; cas similaires : décompte par secteur et taille, ou « non renseigné ».
  { id: '2026-10-10-raa-frappe-gagne-decompte-cas-similaires', itemCount: 2 },
  // Louis 10/10 — l'analyse Approfondie devient le choix par défaut (10 crédits) ; Rapide coûte 5 crédits.
  { id: '2026-10-10-rab-analyse-approfondie-par-defaut-rapide-5', itemCount: 2 },
  // #3235 / #3282 / #3247 / #3962 (lot RAC, 10/10) — version DataForge au versioning, niveau d'entrée du comité, filiales autonomes, Vivier sans « À réveiller ».
  { id: '2026-10-10-rac-versioning-comite-filiales-vivier', itemCount: 4 },
  // #3894.3 (lot RAE2, 10/10) — un message à plusieurs contacts, seulement quand tu les nommes.
  { id: '2026-10-10-rae2-message-plusieurs-contacts-nommes', itemCount: 2 },
  // #3700 / #3231 / #3925 / #3695 / #3683 (lot RAF, 10/10) — gestes promis enfin atteignables : séquences, fiche compte, offre, objectifs, pipe, filtres.
  { id: '2026-10-10-raf-gestes-promis-atteignables', itemCount: 5 },
  // #2773 / #3711 / #2986 (lot RAG, 10/10) — fiche besoin sans phrase vide, accueil sans chiffres de décor, repositionnement sans doublon.
  { id: '2026-10-10-rag-fiche-besoin-accueil-repositionnement', itemCount: 3 },
  // #3995 / #3883 (lot RAO, 10/10) — la liste des signaux de la Veille passe au-dessus des pistes et montre tout.
  { id: '2026-10-10-rao-veille-liste-signaux-au-dessus-des-pistes', itemCount: 2 },
  // #3928 / #3901 / #3857.2 / #3399 / #3243 (lot RAD, 10/10) — levée de fonds en historique, offres selon ton profil, synonymes métier, priorisation, garde-fous de Laura.
  { id: '2026-10-10-rad-offres-profil-synonymes-priorisation', itemCount: 5 },
  // #3861 / #3866 / #3885 / #3864 / #3859 (lots R06 et R07, 10/10) — types de relation, badge des sources, actualités datées, tableaux lisibles, vraie raison d'échec.
  { id: '2026-10-10-rb-relations-sources-tableaux-echec', itemCount: 5 },
  // #3769 / #3713 / #3901.w (lots Q07 et Q08, 10/10) — saisie à froid de Laura, brouillon conservé, colonne Suivi, recrutements par métier.
  { id: '2026-10-10-ra-score-analyse-suivi-brouillon-cas-similaires', itemCount: 4 },
  { id: '2026-10-10-q07-q08-saisie-brouillon-suivi-recrutements', itemCount: 4 },
  // #3923 / #3876.5 / #3903 / #3246 / #3904 (lot Q06, 10/10) — métiers placés, Découvrir par ville, plan en tableau, cas similaires, compte proche de la signature.
  { id: '2026-10-10-q06-metiers-decouvrir-plan-cas-signature', itemCount: 5 },
  // #3684 / #3713 / #3666 / #3879.2 / #3708 (lot Q04, 10/10) — synthèse, contacts, comptes, chat, Découvrir.
  { id: '2026-10-10-q04-finitions-synthese-contacts-comptes', itemCount: 5 },
  // #3901.w (lot Q05, 10/10) — veille du compte et Mes cibles classent les recrutements par métier placé ; titre de mission dans la facturation.
  { id: '2026-10-10-q05-veille-cibles-metiers-facturation', itemCount: 1 },
  // #3901 (lot Q03, 10/10) — Comptes qui recrutent : recrutements classés par métier placé.
  { id: '2026-10-10-q03-comptes-qui-recrutent-metiers', itemCount: 1 },
  // #3901 (lot Q01, 09/10) — Découvrir : la carte d'un compte n'écrit plus deux fois « Recrutement », une offre non informatique n'est plus étiquetée « Recrutement IT ».
  { id: '2026-10-09-q01-decouvrir-carte-recrutement', itemCount: 1 },
  // #3769 / #3876 / #3879 / #3246 / #3922 (lot Q02, 09/10) — Laura garde la zone appliquée, nomme les sièges hors ville, sans code technique ; premier message conservé ; bandeau de collecte antérieure ; lien de presse ; cas gagnés et perdus par ressemblance.
  { id: '2026-10-09-q02-laura-zone-cas-liens', itemCount: 1 },
  // #3860.4 (lot P01, 09/10) — décision Louis : un travail de Laura se termine par sa synthèse, avec les liens de ce qu'il a produit.
  { id: '2026-10-09-p01-3860-synthese-du-travail-de-laura', itemCount: 1 },
  // #3904 (lot P01, 09/10) — décision Louis : « proche de signer » = stade proposition ou négociation ; « appeler » couvre deux e-mails sans réponse.
  { id: '2026-10-09-p01-3904-plan-actions-proche-de-signer-appeler', itemCount: 2 },
  // #3923 (lot P01, 09/10) — décision Louis : les métiers placés se déclarent au complément de profil ET dans « Mon profil », une seule valeur.
  { id: '2026-10-09-p01-3923-metiers-places-declares', itemCount: 1 },
  // #3903 (lot P01, 09/10) — décision Louis : le critère « nogo déjà retenté » est abandonné, Laura ne l'annonce plus comme non évalué.
  { id: '2026-10-09-p01-3903-bilan-relance-sans-nogo-retente', itemCount: 1 },
  // P05 (#3246, lot 09/10) — base anonyme commune entre espaces : Laura cite « ce qui marche ailleurs » à côté de « chez nous ».
  { id: '2026-10-09-p05-base-anonyme-commune', itemCount: 3 },
  // #2434.68 (lot P06, 09/10) — la vibration du micro suit la préférence « mouvement réduit » du système.
  { id: '2026-10-09-p06-2434-vibration-selon-preferences', itemCount: 1 },
  // #3476 (#3242 / #185.2, lot P06, 09/10) — Laura lit enfin les secteurs où tu déclares une référence.
  { id: '2026-10-09-p06-3476-references-sectorielles', itemCount: 1 },
  // #3711.8 (lot P06, 09/10) — plus de grande carte vide sous « Messages déjà préparés ».
  { id: '2026-10-09-p06-3711-messages-prepares-une-ligne', itemCount: 1 },
  // #3924 (lot P06, 09/10) — coller un post LinkedIn depuis Découvrir et Laura, sans jamais contacter LinkedIn.
  { id: '2026-10-09-p06-3924-coller-un-post-linkedin', itemCount: 2 },
  // #3970 (lot P07, 09/10) — la veille d'un compte tire des signaux de natures différentes, et dit qui vient d'être recruté, à quel rôle, et pourquoi ça colle à ton contexte.
  { id: '2026-10-09-p07-signaux-diversifies-recrutements-recents', itemCount: 3 },
  // #3918 / #3920 / #3903 (lot M01, 09/10) — les affaires du CRM deviennent des signaux visibles sous le bon compte.
  { id: '2026-10-09-m01-signaux-crm-relies-au-compte', itemCount: 3 },
  // #3915 / #3917 / #3923 / #3925 (lot M04, 09/10) — rattachement par employeur unique, presse par SIREN, financement daté, offres jugées contre les métiers placés.
  { id: '2026-10-09-m04-signaux-rattaches-et-pertinents', itemCount: 4 },
  // #3935 (lot P03, décision Louis 09/10) — une période d'expérience écrite à l'année seule (« 2019 – 2021 ») est gardée avec sa précision : la fiche affiche « 2019 », jamais un mois inventé.
  { id: '2026-10-09-p03-3935-cv-dates-a-l-annee', itemCount: 2 },
  // #3935.2b (lot M07, 09/10) — les expériences lues dans le CV s'écrivent dans la fiche (rôle, entreprise, période, réalisations), provenance par champ ; une expérience saisie à la main n'est jamais réécrite.
  { id: '2026-10-09-m07-3935-cv-experiences-structurees', itemCount: 2 },
  // #3935.2a (lot M07, 09/10) — environnements, outils et certifications lus dans le CV sont désormais écrits sur la fiche (provenance par champ, une correction humaine gagne) ; « non lu » se dit, jamais une liste vide.
  { id: '2026-10-09-m07-3935-cv-environnements-outils-certifications', itemCount: 2 },
  // #3708.a (lot M07, 09/10) — popover « Outils et sources » : la liste n'a plus de plafond fixe de 320 px, la dernière ligne (Outlook) n'est plus tranchée au bord.
  { id: '2026-10-09-m07-3708-outils-sources-liste-entiere', itemCount: 1 },
  // #3939.a (lot M02, 09/10) — onglet Veille : les hypothèses qualifiées et leurs signaux fondateurs, retrouvables.
  { id: '2026-10-09-m02-veille-hypotheses-qualifiees', itemCount: 1 },
  // #3901.t (lot M02, 09/10) — Découvrir par territoire : une offre d'une mairie n'est plus rattachée à l'entreprise homonyme.
  { id: '2026-10-09-m02-decouvrir-employeur-homonyme', itemCount: 1 },
  // #3922.n (lot M02, 09/10) — la notification « Nouveau signal » porte le lien vérifiable du signal, ou « Sans lien vérifiable ».
  { id: '2026-10-09-m02-cloche-lien-du-signal', itemCount: 1 },
  // #3928.1 (lot M02, 09/10) — un signal sans date n'est plus présenté comme récent par Laura ni par Découvrir.
  { id: '2026-10-09-m02-signal-sans-date-pas-recent', itemCount: 1 },
  // #3928.a (lot M02, 09/10) — un seul lecteur de recent_signals pour la veille, Mes cibles, Découvrir, la cloche et Laura.
  { id: '2026-10-09-m02-signaux-un-seul-lecteur', itemCount: 1 },
  // #3869.a (lot M05, 09/10) — Laura propose de chercher de nouvelles personnes sur un rôle non pourvu d'un compte (carte à valider, coût annoncé).
  { id: '2026-10-09-m05-laura-cherche-de-nouvelles-personnes', itemCount: 1 },
  // #3904.3 (lot M05, 09/10) — une lecture unique de l'état des quatre sources (CRM, téléphonie, agenda, mail), à l'écran Intégrations et dans le plan d'actions de Laura.
  { id: '2026-10-09-m05-ce-que-laura-lit', itemCount: 1 },
  // #3904.4 (lot M05, 09/10) — le plan d'actions de Laura ajoute le geste « contacter » (comptes sans action depuis 30 jours, réseau dormant).
  { id: '2026-10-09-m05-laura-plan-geste-contacter', itemCount: 1 },
  // #3904.1 (lot M05, 09/10) — Laura compose un plan d'actions par geste (répondre, relancer, appeler) à partir du bilan de relance.
  { id: '2026-10-09-m05-laura-plan-d-actions-par-geste', itemCount: 1 },
  // #2947 (#2204.60/.61/.63, lot M09, 09/10) — un style de message porte pitch, ton et signature déclarés.
  { id: '2026-10-09-m09-style-pitch-ton-signature', itemCount: 1 },
  // #3243 (#186.10, lot M09, 09/10) — Laura challenge une demande de message identique pour plusieurs personnes.
  { id: '2026-10-09-m09-laura-challenge-message-generique', itemCount: 1 },
  // #2887 (#2371.4, lot M09, 09/10) — 10e stade de relation « partenaire actif » (placements en cours, même SIREN).
  { id: '2026-10-09-m09-stade-partenaire-actif', itemCount: 2 },
  // #2947 (#2204.11, lot M09, 09/10) — « Re-planifier » : l'objectif choisi rejoue les messages M1-M2-M3 du dossier.
  { id: '2026-10-09-m09-objectif-messages-plan', itemCount: 1 },
  // #3889.3 (lot M13, 09/10) — Laura : un projet décrit dans un CV garde sa nature, sa période et sa source.
  { id: '2026-10-09-m13-projet-documentaire-nature-source', itemCount: 1 },
  // #3876.5 (lot M13, 09/10) — Laura et Découvrir : une ville reste une ville, jamais son département entier.
  { id: '2026-10-09-m13-laura-ville-reste-une-ville', itemCount: 1 },
  // #3879.2 (lot M13, 09/10) — Découvrir : un même critère porte le même mot sur les cinq vues, sans jargon technique.
  { id: '2026-10-09-m13-decouvrir-un-critere-un-mot', itemCount: 1 },
  // #3920.a (lot M03, 09/10) — l'alerte « Nouveau signal » couvre toutes les sources (offres, BODACC, Sirene, presse, avis) et nomme le fait neuf ; un seul plafond d'alertes par jour.
  { id: '2026-10-09-m03-alertes-toutes-sources', itemCount: 2 },
  // #3921.b (lot M03, 09/10) — Territoire : « effectif en hausse » ne compte que sur deux relevés mesurés du registre, sinon il reste nommé non mesuré.
  { id: '2026-10-09-m03-effectif-en-hausse-deux-releves', itemCount: 1 },
  // #3921.a (lot M03, 09/10) — la veille relève Sirene chaque matin : une ouverture d'établissement devient une annonce datée, liée à sa page officielle.
  { id: '2026-10-09-m03-ouvertures-etablissement-quotidiennes', itemCount: 1 },
  // #3916.a / #3916.b (lot M03, 09/10) — fiche compte : toutes les annonces BODACC relues chaque matin, avec leur lien ; Découvrir « pourquoi maintenant » les lit ; une ESN en procédure collective n'est plus proposée comme partenaire.
  { id: '2026-10-09-m03-annonces-registre-en-continu', itemCount: 3 },
  // #3860.1/.2 (lot M06, 09/10) — les jobs de Laura enchaînent leurs étapes : les contacts trouvés par une analyse alimentent la suite, et analyse, actualisation, mémoire marché, matching et photo de territoire partent dans un job.
  { id: '2026-10-09-m06-3860-jobs-enchaines', itemCount: 2 },
  // #3769.3 (lot M06, 09/10) — une cartographie refusée par le contrat ne s'affiche plus en puces brutes (« filter », « Occitanie ») : remplacée par la carte réellement rendue, ou par une absence nommée.
  { id: '2026-10-09-m06-3769-carte-refusee-jamais-en-puces', itemCount: 1 },
  // #3769.2 (lot M06, 09/10) — « seulement en Occitanie » après « priorise mes comptes » filtre réellement la priorisation sur le siège des comptes, sans reposer de question.
  { id: '2026-10-09-m06-3769-priorites-filtre-zone', itemCount: 1 },
  // #3864.6 (lot M06, 09/10) — « trouve-moi des besoins » rend une carte déjà bornée par l'outil (7 colonnes), jamais un tableau refusé faute de place.
  { id: '2026-10-09-m06-3864-carte-besoins-bornee', itemCount: 1 },
  // #3211.9 (#3234, lot M11, 09/10) — le Centre d'actions présente les actions faites sans issue et permet de déclarer l'issue après coup.
  { id: '2026-10-09-m11-issues-a-declarer', itemCount: 1 },
  // #3210.1 (#3246, lot M11, 09/10) — cas similaires : les rendez-vous captés comptent, la mémoire par cas compte les gagnés/perdus de l'espace sans nommer de client.
  { id: '2026-10-09-m11-cas-similaires-rendez-vous-memoire', itemCount: 2 },
  // #3211.11 (#3234, lot M11, 09/10) — Laura dit quelle cadence, quelle route et quelle priorité ont le mieux marché chez toi, en comptes d'issues déclarées, jamais en probabilité.
  { id: '2026-10-09-m11-laura-cadence-route-priorite', itemCount: 1 },
  // #3278.2 (lot M11, 09/10) — six critères de la route commerciale se déclarent sur la fiche du compte ; Laura les cite, un critère vide reste nommé non évalué.
  { id: '2026-10-09-m11-route-criteres-declares', itemCount: 1 },
  // #3278.1 (lot M11, 09/10) — deux routes commerciales de plus, chacune portée par un fait : « veille seule » (niveau d'effort veille) et « depuis un talent » (vivier).
  { id: '2026-10-09-m11-route-veille-et-talent', itemCount: 2 },
  // #3699.6 (lot M08, 09/10) — de vraies pièces jointes à l'envoi individuel d'un e-mail.
  { id: '2026-10-09-m08-pieces-jointes-envoi-email', itemCount: 3 },
  // #2958.109 (lot P04, 09/10) — /team : « Les attribuer » et les autres gestes d'arbitrage ouvrent la section repliée qui porte leur destination.
  { id: '2026-10-09-p04-arbitrages-equipe-menent-quelque-part', itemCount: 1 },
  // #2958.108 (lot P04, 09/10) — « Où placer … » : chaque besoin classé se nomme avec ses scores et ses axes, même seul.
  { id: '2026-10-09-p04-ou-placer-score-par-besoin', itemCount: 1 },
  // #2958.107 (lot P04, 09/10) — « Ces mots, précisément » définit Pipe, Pistes à qualifier et affaire ; un échec du pipe nomme le pipe.
  { id: '2026-10-09-p04-mots-du-pipe-definis', itemCount: 1 },
  // #2958.106 (lot P04, 09/10) — après un import de contacts, la restitution nomme des contacts, mène à l'annuaire, et l'annuaire relit ses lignes.
  { id: '2026-10-09-p04-import-contacts-retrouves', itemCount: 1 },
  // #2446.17 (lot M12, 09/10) — la fiche besoin ouvre son affaire ; le dossier relit son étape après « Changer d'étape ».
  { id: '2026-10-09-m12-besoin-vers-affaire-sans-rupture', itemCount: 1 },
  // #3775.a (lot M12, 09/10) — salle démo : un fil cite une source personnelle, « Partager dans l'espace » montre la ligne orange.
  { id: '2026-10-09-m12-demo-ligne-orange-partage', itemCount: 1 },
  // #2958.104 (lot M12, 09/10) — quatre écrans vides gagnent leur porte de sortie (Chaînes, Intégrations, Automatisations, Vivier filtré).
  { id: '2026-10-09-m12-pages-vides-avec-porte', itemCount: 1 },
  // #2433.12 (épopée #2876, lot P02 09/10) — l'aperçu d'une image jointe au chat propose un recadrage et rend le tableau lu.
  { id: '2026-10-09-p02-recadrage-tableau-image-chat', itemCount: 1 },
  // #2433.4 (épopée #2876, lot M10 09/10) — l'aperçu d'une image jointe au chat surligne où chaque ligne a été lue.
  { id: '2026-10-09-m10-zones-lecture-image-chat', itemCount: 1 },
  // #2433.7 (épopée #2876, lot M10 09/10) — Laura prépare un signalement de bug depuis une capture ; le clic l'envoie par le formulaire de signalement.
  { id: '2026-10-09-m10-laura-prepare-signalement-bug', itemCount: 1 },
  // #3759.4 (recette prod 09/10, lot I01) — une puce de contexte de la cartographie ne s'affiche plus en anglais brut (« territory »).
  { id: '2026-10-09-i01-chat-carte-puce-contexte-langue', itemCount: 1 },
  // #3811.4 (lot I04, 09/10) — salle démo : la revue du CV de Julien Fabre montre le bandeau « Lecture partielle » et la saisie manuelle des compétences.
  { id: '2026-10-09-i04-demo-lecture-cv-partielle', itemCount: 1 },
  // #3830.4 (lot I04, 09/10) — salle démo : une compétence libre (« Analyse de risque ») rend le filtre par sous-chaîne observable.
  { id: '2026-10-09-i04-vivier-demo-competence-libre', itemCount: 1 },
  // #3781 (lot I04, 09/10) — /consultants : « Tout sélectionner » nomme ce qu'il laisse dehors et un bouton sélectionne tout le résultat (jusqu'à 500).
  { id: '2026-10-09-i04-vivier-selectionner-tout-le-resultat', itemCount: 1 },
  // #3829 (lot I04, 09/10) — /consultants/:id : le bloc « Complétude de la fiche » de l'entête est retiré (« suppprime »).
  { id: '2026-10-09-i04-fiche-talent-sans-bloc-completude', itemCount: 1 },
  // #3963 (lot I04, 09/10) — /consultants : plus de pastille « aucun consultant à contrôler » quand il n'y a aucun consultant.
  { id: '2026-10-09-i04-vivier-pastille-vide-masquee', itemCount: 1 },
  // #3831 (recette salle démo 09/10, lot I04) — en salle de démonstration, « Enrichir » sur une fiche sans LinkedIn propose désormais « Chercher par nom », comme en production.
  { id: '2026-10-09-i04-demo-enrichir-sans-linkedin', itemCount: 1 },
  // #2371.5 (lot J02, 09/10) — le panneau « Pourquoi ce message » nomme la longueur visée du canal, lue de la même source que le prompt.
  { id: '2026-10-09-j02-longueur-du-canal-dans-pourquoi-ce-message', itemCount: 1 },
  // #3278.2 (lot J07, 09/10) — la route commerciale nomme le panel/référencement déclaré comme seul sous-aspect connu du processus d'achat.
  { id: '2026-10-09-j07-route-commerciale-processus-achat-panel', itemCount: 1 },
  // #3720.1 (lot J08, 09/10) — une suggestion « Ce que je ferais maintenant » enregistrée avec l'ancienne clé d'un onglet retombe sur l'onglet courant.
  { id: '2026-10-09-j08-suggestion-ancien-onglet-retombe', itemCount: 1 },
  // #3922 / #3916 / #3917 / #3901 / #3920 / #3921 / #3923 / #3928 (lot K01, 09/10) — chaque signal porte le lien vers sa source, ou dit « Sans lien vérifiable ».
  { id: '2026-10-09-k01-signaux-un-lien-par-source', itemCount: 4 },
  // #3861 (VU, recette prod 09/10, lot H06) — l'en-tête d'un compte n'écrit plus « mondial salariés » quand l'effectif connu n'est qu'une portée, jamais un chiffre.
  { id: '2026-10-09-h06-compte-effectif-scope-sans-salaries', itemCount: 1 },
  // #3861 (recette prod 09/10, lot H06) — en mode Approfondi, « Envoyer » ne passe plus sous les réglages de la saisie, sur desktop.
  { id: '2026-10-09-h06-chat-composer-envoyer-une-ligne', itemCount: 1 },
  // #3670.9 (recette prod 09/10, lot H06) — Laura retrouve un compte à peine repéré même si son nom n'a qu'une casse différente, dans un grand portefeuille.
  { id: '2026-10-09-h06-chat-compte-casse-differente-grand-portefeuille', itemCount: 1 },
  // #3399 (recette prod 09/10, lot H05) — l'interlocuteur d'un compte prioritaire ouvre désormais son propre segment nommé, au lieu d'être noyé dans la phrase d'action.
  { id: '2026-10-09-h05-interlocuteur-segment-nomme', itemCount: 1 },
  // #3868 (recette prod 09/10, lot H05) — Laura nomme désormais le titulaire de marché comme voie d'accès à part, et classe avec ce qu'elle sait déjà si la lecture détaillée de l'accès échoue.
  { id: '2026-10-09-h05-laura-titulaire-marche-et-acces-degrade', itemCount: 2 },
  // VU (recette prod 09/10, lot H05) — « Mes documents » traduit les catégories distillées plutôt que leur nom technique.
  { id: '2026-10-09-h05-documents-categorie-distillee-traduite', itemCount: 1 },
  // #3546.3 (recette prod 09/10, lot H05) — la colonne Consultant de /missions ne déborde plus dans la colonne Statut.
  { id: '2026-10-09-h05-missions-consultant-ne-deborde-plus', itemCount: 1 },
  // #3685.5 (recette prod 09/10, lot H06) — le dossier Compte, onglet Contacts, ne montre plus l'entonnoir en tête : les interlocuteurs viennent d'abord.
  { id: '2026-10-09-h06-compte-contacts-sans-entonnoir-permanent', itemCount: 1 },
  // #3941.2 (recette prod 09/10, lot H06) — /discover : le champ du préréglage « Startup » se nomme désormais « Registre », pas « Segment « Startup » ».
  { id: '2026-10-09-h06-discover-registre-segment-startup', itemCount: 1 },
  // #3939.1 (recette prod 09/10, lot H06) — une liste numérotée aérée (ligne vide entre les items) ne repart plus de 1 à chaque item dans /chat.
  { id: '2026-10-09-h06-chat-liste-numerotee-aeree', itemCount: 1 },
  // #3850.4 (lot H03, 09/10) — le téléphone s'affiche en international lisible sur l'organigramme, la barre d'appel, la fiche mission et le champ corrigeable de la fiche contact.
  { id: '2026-10-09-h03-telephone-international-partout', itemCount: 1 },
  // #3950.1 (décision Louis 09/10/2026, lot G01) — Laura peut désormais lancer l'export du vivier (ATS ou en lot) sur demande, par le même bouton que l'écran.
  { id: '2026-10-09-g01-laura-lance-export-vivier', itemCount: 1 },
  // #3942.5 (brief F05, 09/10) — /contacts, portée Recommandés : la liste se groupe désormais par compte (même priorité que /accounts) puis par rang du chemin recommandé, avec le rang affiché sur chaque ligne.
  { id: '2026-10-09-f05-contacts-recommandes-groupes-par-compte', itemCount: 1 },
  // #3713.2/#3684/#3713 (lot H07, 09/10, recette RQ4) — densité de la liste Contacts, cartes « Passage »
  // qui répétaient 3 fois la même idée, et petit défaut visuel sur l'anneau de score.
  { id: '2026-10-09-h07-contacts-passage-anneau-score', itemCount: 3 },
  // #3759.3 (recette prod 09/10, lot F04) — une recherche de comptes par ville dans le chat a moins de chances d'échouer sec sans résultat.
  { id: '2026-10-09-f04-chat-recherche-comptes-budget-marge', itemCount: 1 },
  // #3673.10 (recette prod 09/10, lot F04) — « Préparer le rendez-vous » s'ouvre désormais dès l'arrivée sur un compte déjà analysé.
  { id: '2026-10-09-f04-preparer-rendez-vous-ouvert-si-analyse', itemCount: 1 },
  // Lot F04 (07/10, vu en passant recette prod 09/10) — /contacts/<id> : la bulle Laura ne coupe plus le titre du dernier pli de la colonne de droite.
  { id: '2026-10-09-f04-bulle-laura-reserve-marge-fiche-contact', itemCount: 1 },
  // vu en passant (lot G03, 09/10) — la première frappe après confirmation de « Nouvelle conversation » / changement de portée atteint désormais le composer, pas le bouton qui a ouvert la modale.
  { id: '2026-10-09-g03-scope-dialog-focus-composer', itemCount: 1 },
  // vu en passant (lot G03, 09/10) — l'entrée « Reprendre » de l'accueil de Laura réserve sa place pendant la lecture de l'historique, les cartes de suggestion ne descendent plus d'un bloc après coup.
  { id: '2026-10-09-g03-laura-home-resume-reserve-sa-place', itemCount: 1 },
  // #3697.7 (lot G03, 09/10) — le placeholder « Choisir un scénario » (modèle approuvé) ne se tronque plus dans le déclencheur fermé.
  { id: '2026-10-09-g03-3697-placeholder-scenario-pas-tronque', itemCount: 1 },
  // #3708 (lot G03, 09/10) — un CRM exclu dans « Outils et sources » n'alimente plus le prompt de Laura par la présence CRM déjà résolue côté API, même sans aucun appel d'outil ce tour.
  { id: '2026-10-09-g03-3708-crm-presence-exclue-hors-prompt', itemCount: 1 },
  // #3704 (lot G03, 09/10) — « Classé selon » garde sa ligne région/département d'un tour à l'autre, même quand une relance ne rappelle pas la recherche de comptes.
  { id: '2026-10-09-g03-3704-classe-selon-geographie-sans-relecture', itemCount: 1 },
  // #3859 (lot G03, 09/10) — l'outil d'analyse de compte nomme désormais explicitement la demande de contacts/décideurs chez une entreprise absente de l'espace.
  { id: '2026-10-09-g03-3859-outil-analyse-nomme-demande-contacts', itemCount: 1 },
  // #3677.2 (lot G03, 09/10) — le lien ?tab=programs défile désormais jusqu'à la carte même quand un bloc voisin grandit sans ajouter ni retirer de nœud (image, police).
  { id: '2026-10-09-g03-3677-defilement-resize-observer', itemCount: 1 },
  // #3864.6 / #3903.7 (lot G03, 09/10) — une carte tableau (besoins retrouvés, bilan de relance…) qui dépasse une limite du contrat strict reste un vrai tableau, jamais une liste à puces d'une cellule par ligne.
  { id: '2026-10-09-g03-3864-3903-carte-tableau-refusee-reste-tableau', itemCount: 1 },
  // #3769.1 (lot H04, 09/10) — Laura nomme désormais le siège (« Siège : Toulouse. ») de chaque compte d'un classement d'entreprises, même quand le registre a déjà rendu de vrais facteurs de score, pas seulement en repli.
  { id: '2026-10-09-h04-3769-siege-classement-entreprises', itemCount: 1 },
  // /chat (lot H04, 09/10) — un texte tapé avant de confirmer le dossier de « Nouvelle conversation » n'est plus perdu quand le dossier choisi est un compte précis.
  { id: '2026-10-09-h04-chat-saisie-survit-au-choix-du-dossier', itemCount: 1 },
  // #3700 (lot H04, 09/10) — la carte « Séquences » de la fiche contact affiche désormais son état vide, avec le geste pour créer une séquence, au lieu de disparaître entièrement.
  { id: '2026-10-09-h04-3700-sequences-etat-vide-avec-geste', itemCount: 1 },
  // #3694 (lot H04, 09/10) — « Paramètres du message » s'ouvre désormais en superposition (popover) : le fil de la conversation ne s'écrase plus à 83 px quand le panneau est déplié.
  { id: '2026-10-09-h04-3694-parametres-message-en-superposition', itemCount: 1 },
  // #3873 (lot H04, 09/10) — « Rejouer » une recherche enregistrée de Découvrir date désormais sa dernière exécution : la carte ne dit plus « Jamais rejouée » juste après le clic.
  { id: '2026-10-09-h04-3873-rejouer-date-lexecution', itemCount: 1 },
  // #3812.3 (lot H04, 09/10) — la colonne « Complétude » du vivier ne cache plus le score (« 60/100 ») derrière son propre libellé quand la colonne est étroite.
  { id: '2026-10-09-h04-3812-completude-score-jamais-tronque', itemCount: 1 },
  // vu en passant (lot F02, 09/10) — /chat ne désactive plus la saisie après une navigation où la session est déjà connue : les premières frappes ne sont plus perdues.
  { id: '2026-10-09-f02-chat-saisie-premieres-frappes', itemCount: 1 },
  // #3864.3 (lot F02, 09/10) — un échec de lecture de "trouve-moi des besoins" n'excuse plus un simple "la recherche n'a pas abouti" : Laura nomme ce qu'elle a cherché et propose la stratégie de qualification, comme pour une absence confirmée.
  { id: '2026-10-09-f02-3864-echec-lecture-etat-vide-conforme', itemCount: 1 },
  // #3708 (lot F02, 09/10) — un CRM exclu pour un fil n'alimente plus aucune réponse (filtré à la source, pas seulement au reçu) ; il ne liste plus « Ton CRM » à la fois sous Non consulté et Non demandé ; popover Outils et sources : titre et pied protégés d'un chevauchement.
  { id: '2026-10-09-f02-3708-crm-exclu-filtre-contexte', itemCount: 3 },
  // #3855 (lot F02, 09/10) — « fais-le quand même » sur un compte fermé (zéro contact joignable) fait désormais lancer la recherche de contacts promise, au lieu de répéter le désaccord.
  { id: '2026-10-09-f02-3855-choix-maintenu-lance-la-recherche', itemCount: 1 },
  // #3903.sens (lot F02, 09/10) — le bilan de relance de Laura porte désormais une colonne « Sens » (entrant/sortant) sur CHAQUE compte, jamais en prose pour une partie seulement.
  { id: '2026-10-09-f02-3903-bilan-relance-colonne-sens', itemCount: 1 },
  // #3697.6 (lot F02, 09/10) — le niveau (contact ou tous niveaux) de chaque trame approuvée est désormais nommé ; les libellés de scénario passent à la ligne au lieu d'être tronqués.
  { id: '2026-10-09-f02-3697-trames-niveau-et-libelles-complets', itemCount: 2 },
  // #3907 (lot F02, 09/10) — « ce que fait l'entreprise » (libellé NAF décodé) est maintenant visible sur la carte Découvrir, pas seulement dans le détail déplié ; signaux « Pourquoi maintenant » affichés un par ligne.
  { id: '2026-10-09-f02-3907-discover-activite-sur-la-carte', itemCount: 2 },
  // #3677.2 (lot F02, 09/10) — l'ancien lien ?tab=programs défile désormais jusqu'à la carte « Projets et transformations » même quand les données du compte arrivent après la réécriture de l'URL.
  { id: '2026-10-09-f02-3677-programmes-scroll-donnees-tardives', itemCount: 1 },
  // #3809.1 (vu en passant, lot F03, 09/10) — un fil quitté pendant que Laura répond encore nomme l'interruption au retour, au lieu de rester « En attente » sans explication.
  { id: '2026-10-09-f03-fil-quitte-interruption-nommee-au-retour', itemCount: 1 },
  // #3859 (lot F03, 09/10) — une entreprise absente de l'espace déclenche désormais la recherche directement, sans proposer une analyse à valider.
  { id: '2026-10-09-f03-entreprise-absente-lance-la-recherche', itemCount: 1 },
  // #3704 (lot F03, 09/10) — « Classé selon » garde désormais la géographie (région/département) d'un tour d'horizon au tour suivant, même quand le message ne la redit pas.
  { id: '2026-10-09-f03-tour-horizon-geographie-persiste-entre-tours', itemCount: 1 },
  // #3853 (lot F03, 09/10) — en portée « Sans les données de l'espace », le tour d'horizon ne lit plus le portefeuille et ne marque plus un compte « déjà dans ton espace ».
  { id: '2026-10-09-f03-exclusion-stricte-tour-horizon-sans-portefeuille', itemCount: 1 },
  // #3852.4 (lot F03, 09/10) — la fiche besoin nomme désormais niveau d'effort, route d'ouverture et trajectoire, même quand la route ou la trajectoire ne s'applique pas (« non évalué », jamais une ligne absente).
  { id: '2026-10-09-f03-methode-trois-libelles-nommes', itemCount: 1 },
  // #3702 (recette prod 09/10, écriture) — la modale « Déléguer l'envoi » nomme désormais pourquoi elle est bloquée (boîte d'envoi non connectée / aucune séquence e-mail validée) et le geste qui débloque, au lieu d'un « Expéditeur : — » et d'un « Aucun message » muets.
  { id: '2026-10-09-g02-delegation-nomme-son-blocage', itemCount: 1 },
  // #3952 (recette prod 09/10, réserve) — un CV déposé un par un (hors ZIP/pièce jointe) part désormais AUSSI en lecture automatique : avant, seul un dépôt par lot déclenchait la file, et une fiche née d'un dépôt unitaire restait « Non renseigné » jusqu'à ce qu'un humain ouvre la revue à la main.
  { id: '2026-10-09-g02-depot-unitaire-lecture-auto', itemCount: 1 },
  // #3935.3 (recette prod 09/10, écriture) — le vivier porte désormais le geste « Relire les CV incomplets » (rattrapage de complétude posé au lot Z02, sans aucun déclencheur d'écran jusqu'ici) : son compteur, et le rattrapage sans crédit.
  { id: '2026-10-09-g02-vivier-relire-cv-incomplets', itemCount: 1 },
  // #3623.4 (recette prod 09/10, écriture) — la fiche du compte analysé (section Sources) liste désormais le document joint à l'analyse depuis /search, avec « Rattachée à <compte> » — il disparaissait avec la bande de /search au lancement.
  { id: '2026-10-09-g02-fiche-documents-rattaches', itemCount: 1 },
  // #3666.4 (recette prod 09/10, écriture) — le bandeau global « En cours » restait affiché plusieurs minutes après la fin réelle d'une analyse quand l'onglet était resté en arrière-plan : le sondage de secours continue désormais même onglet caché.
  { id: '2026-10-09-g02-bandeau-fin-analyse-arriere-plan', itemCount: 1 },
  // #3666.2/.3 (recette prod 09/10, écriture) — /accounts : un compte ranimé après suppression ne garde plus le score d'une ancienne analyse, le nom du compte ne tronque plus sur une ligne chargée, et un compte en cours d'analyse remonte en tête du tri par défaut.
  { id: '2026-10-09-g02-accounts-score-nom-tri', itemCount: 3 },
  // G02.1 (recette prod 09/10, écriture) — « Se connecter » partait d'un seul clic pour l'autoremplissage natif du navigateur, mais pas pour un gestionnaire de mots de passe (extension), plus lent à écrire le champ.
  { id: '2026-10-09-g02-connexion-un-seul-clic', itemCount: 1 },
  // #3865.1 (lot N09, 08/10) — la salle de démonstration répond désormais « quels besoins compatibles avec Camille Roussel ? », rangés par compartiment (find_needs_for_talent), distinct de « où la placer ».
  { id: '2026-10-08-n09-besoins-compatibles-consultant-demo', itemCount: 1 },
  // #3776.5 (lot N09, 08/10) — la salle de démonstration porte désormais les trois badges de fondement d'une source (Preuve / Interprétation / Historique).
  { id: '2026-10-08-n09-badges-fondement-source-demo', itemCount: 1 },
  // #3942.2 (recette prod 09/10, lot F01) — /contacts : la portée « Recommandés » filtre désormais côté serveur, sur tout l'espace et avant pagination — plus de liste vide sur un gros portefeuille.
  { id: '2026-10-09-f01-contacts-recommandes-portee-serveur', itemCount: 1 },
  // #3419 (recette prod nuit 08→09/10, lot N07) — « Autres accroches » ne change plus que l'ouverture du message, et ne laisse plus de placeholders bruts.
  { id: '2026-10-09-n07-autre-accroche-ouverture-seule-sans-placeholder', itemCount: 1 },
  // #3596 (recette prod nuit 08→09/10, lot N07) — les coordonnées des contacts d'une recherche dans tout l'espace restent en clair, même avec un prénom abrégé.
  { id: '2026-10-09-n07-coordonnees-contacts-espace-en-clair', itemCount: 1 },
  // #3769.7 (recette prod nuit 08→09/10, lot N07) — les priorités du portefeuille nomment désormais la ville du siège de chaque compte.
  { id: '2026-10-09-n07-priorites-portefeuille-siege-nomme', itemCount: 1 },
  // #3758.9 (recette prod nuit 08→09/10, lot N07) — un plan d'action dont le JSON touche la clôture d'ouverture se rend quand même en carte, du premier coup.
  { id: '2026-10-09-n07-plan-action-json-colle-a-la-cloture', itemCount: 1 },
  // #3717.7 (épopée #3777, lot E01, 08/10) — « Prochaines actions » nomme combien sont déjà suivies dans le tableau, avec un lien, sans en retirer aucune.
  { id: '2026-10-08-e01-prochaines-actions-recoupement-tableau', itemCount: 1 },
  // #3667.R1 (épopée #3777, lot E01, 08/10) — une ESN citée par la stratégie 5P porte le même statut que dans Écosystème et Accès.
  { id: '2026-10-08-e01-esn-citee-statut-canonique', itemCount: 1 },
  // #3720.6 (épopée #3720, lot E03, 08/10) — Découvrir > Contacts et « Mes relances » ouvrent désormais par un vrai lien : clic droit / ctrl-clic / molette proposent « nouvel onglet ».
  { id: '2026-10-08-e03-liens-reels-decouvrir-relances', itemCount: 2 },
  // #2947 (#2204.34, lot E08, 08/10) — persona « Partenaire » : un prestataire en mission chez le compte ne reçoit plus un message écrit comme à un prospect.
  { id: '2026-10-08-e08-persona-partenaire-prestataire-en-mission', itemCount: 1 },
  // #3944 (lot Z01, 08/10) — l'analyse ne propose plus que deux profondeurs : Rapide (4 crédits) et Approfondie (10 crédits).
  { id: '2026-10-08-z01-search-deux-profondeurs', itemCount: 1 },
  // #3950 (lot Z01, 08/10) — l'export du vivier (ATS, en lot) quitte /consultants pour Réglages › Espace de travail.
  { id: '2026-10-08-z01-vivier-export-reglages', itemCount: 1 },
  // #3948 (lot Z01, 08/10) — les vues rapides et les filtres du vivier se rangent dans un panneau « Filtres » repliable.
  { id: '2026-10-08-z01-vivier-filtres-repliables', itemCount: 1 },
  // #3947 (lot Z01, 08/10) — le bandeau « CV pas encore lus » disparaît du vivier ; tous les CV sont lus automatiquement, sans réglage.
  { id: '2026-10-08-z01-vivier-lecture-auto-cv-sans-bandeau', itemCount: 1 },
  // #3945 / #3946 (lot Z01, 08/10) — la fiche contact retire la ligne de provenance/confiance/coût sous l'e-mail et le téléphone ; les coordonnées restent en clair.
  { id: '2026-10-08-z01-contact-meta-retiree', itemCount: 1 },
  // #3943 (lot Z01, 08/10) — « Reste à vérifier », avant une analyse, perd son cadre.
  { id: '2026-10-08-z01-search-reste-a-verifier-sans-cadre', itemCount: 1 },
  // #3934 (lot Z01, 08/10) — l'entête personnalisé de /actions (titre, sous-titre, « Demander à Laura ») est retiré.
  { id: '2026-10-08-z01-actions-entete-retire', itemCount: 1 },
  // #3933 (lot Z01, 08/10) — le bandeau d'entonnoir de qualification disparaît de /contacts.
  { id: '2026-10-08-z01-contacts-entonnoir-retire', itemCount: 1 },
  // #3713.1 (lot V15, 08/10) — /contacts : la date de vérification tient sur une ligne, la pastille de score ne se fait plus rogner.
  { id: '2026-10-08-v15-contacts-suivi-une-ligne', itemCount: 2 },
  // #3814 (lot V15, 08/10) — /discover : « 0 salarié » ne remonte plus devant une tranche d'effectif réelle au tri « Taille ».
  { id: '2026-10-08-v15-discover-taille-0-salarie-en-fin-de-tri', itemCount: 1 },
  // #3774.3.1 (lot V15, 08/10) — Odoo affiche désormais ses capacités réelles (Lire, Modifier), comme les autres CRM.
  { id: '2026-10-08-v15-odoo-capacites-reelles', itemCount: 1 },
  // #3764 (lot V15, 08/10) — démo /chat : « Où en est mon portefeuille ? » compte désormais les mêmes six comptes partout, et porte un badge.
  { id: '2026-10-08-v15-demo-portefeuille-coherent', itemCount: 2 },
  // Vu en passant (lot V15, 08/10) — /chat : une réponse incomplète ne dit plus « Incomplet », « Complétude partielle » et « Qualification complémentaire nécessaire » à la fois.
  { id: '2026-10-08-v15-une-seule-mention-incomplet', itemCount: 1 },
  // #3670.5 (recette prod 08/10, lot V17) — Laura retrouve dans /chat un compte que le briefing a déjà cité (signal frais, sans analyse ni contact).
  { id: '2026-10-08-v17-chat-connait-les-comptes-du-briefing', itemCount: 1 },
  // #3671.3 (recette prod 08/10, lot V17, GA-26) — le retard d'un paiement (carte du briefing, écran Encaissements) vient maintenant d'une seule formule.
  { id: '2026-10-08-v17-briefing-retard-paiement-une-seule-formule', itemCount: 1 },
  // #3671.2 (recette prod 08/10, lot V17) — un e-billet/confirmation de voyage ne produit plus de carte dans le briefing.
  { id: '2026-10-08-v17-briefing-e-billet-sans-carte', itemCount: 1 },
  // #3671.1 (recette prod 08/10, lot V17) — « Donnée fausse » sur une carte du briefing retire vraiment la carte, et le geste tient au rechargement.
  { id: '2026-10-08-v17-briefing-donnee-fausse-tient-au-rechargement', itemCount: 1 },
  // V16.4 (lot V16, 08/10) — ouvrir le sélecteur de mode de /chat ne décale plus le composeur.
  { id: '2026-10-08-v16-selecteur-de-mode-ne-decale-plus', itemCount: 1 },
  // #3861.3 (lot V16, 08/10) — « Complétude : partielle — 2 sources non consultées » nomme désormais lesquelles, dans la même ligne.
  { id: '2026-10-08-v16-completude-nomme-les-sources', itemCount: 1 },
  // #3670.2 (lot V16, 08/10) — une demande d'orientation sans titre nommé (« je commence par qui côté data ? ») nomme désormais aussi la route sponsor, en parallèle.
  { id: '2026-10-08-v16-orientation-nomme-la-route-sponsor', itemCount: 1 },
  // #3623.1 (lot V16, 08/10) — un .zip invalide est refusé dès l'ajout ; une pièce en échec ne bloque plus le lancement.
  { id: '2026-10-08-v16-piece-jointe-zip-invalide', itemCount: 3 },
  // #3935.2 (lot Z02, 08/10) — lecture de CV : LinkedIn/Malt et les langues rejoignent la fiche.
  { id: '2026-10-08-z02-cv-linkedin-et-langues', itemCount: 2 },
  // #3942.2 (lot Z03, 08/10) — « Préparer un e-mail par personne » : depuis la sélection de /contacts, un brouillon personnalisé par personne, relu et validé un par un, jamais envoyé.
  { id: '2026-10-08-z03-preparer-un-email-par-personne', itemCount: 1 },
  // #3942.1 (lot Z03, 08/10) — /contacts n'affiche plus par défaut que les contacts recommandés par compte, avec un compteur et un retour « Tous » en un clic.
  { id: '2026-10-08-z03-contacts-recommandes-par-defaut', itemCount: 1 },
  // #3941.1 (lot Z04, 08/10) — Découvrir : un préréglage « Startup » (âge, forme juridique, catégorie), pour ne plus remonter des micro-entreprises à la place de startups.
  { id: '2026-10-08-z04-decouvrir-segment-startup', itemCount: 1 },
  // #3938.1 (lot Z04, 08/10) — le fil d'un compte montre désormais l'objet d'un e-mail envoyé, jamais seulement « Email envoyé ».
  { id: '2026-10-08-z04-fil-objet-email-envoye', itemCount: 1 },
  // #2985 (épopée #2319, lot E07 08/10) — « Prépare-moi un point manager sur <compte> » rend une carte structurée, plus un paragraphe.
  { id: '2026-10-08-e07-revue-manager-carte', itemCount: 1 },
  // #3246 (épopée #3210, lot E16 08-09/10) — « À quoi ce compte ressemble » rejoint le catalogue de commandes du chat.
  { id: '2026-10-09-e16-commande-cas-similaires', itemCount: 1 },
  // #2159.8/#2159.9/#2159.13 (épopée #2927, lot E06 08/10) — un classeur Excel ou une archive ZIP glissés-déposés sur l'assistant d'import se disent, au lieu de se décoder en charabia.
  { id: '2026-10-08-e06-import-classeur-excel-glisse-depose', itemCount: 1 },
  // #2414.48 (épopée #2986, lot E09 08/10) — le repositionnement précoce nomme aussi l'historique de présentation récent.
  { id: '2026-10-08-e09-repositionnement-historique-presentation', itemCount: 1 },
  // #2422.6 (épopée #2869, lot R24 08/10) — un contact externe dépose une pièce de contrat par lien signé, sans compte BellumAI.
  { id: '2026-10-08-r24-depot-externe-piece-contrat', itemCount: 1 },
  // #3243 (#186.10, lot R25, 08/10) — Laura refuse d'écrire un message délibérément agressif ou insultant, avec sa raison, et propose une alternative ferme.
  { id: '2026-10-08-r25-laura-refuse-ton-agressif', itemCount: 1 },
  // #2947 (#2204.35, lot R25, 08/10) — la prudence « consultant présenté / ex-prestataire » atteint désormais les messages préparés en lot, contact par contact.
  { id: '2026-10-08-r25-prudence-relation-declaree-messages-batch', itemCount: 1 },
  // #2947 (#2204.10/.15, lot R25, 08/10) — « Changer de stratégie » porte désormais des contraintes de forme jusqu'aux messages batch, et la voie d'accès probable les atteint aussi.
  { id: '2026-10-08-r25-strategie-contraintes-et-voie-acces-messages-batch', itemCount: 2 },
  // #2916 (#2399.2, lot R25, 08/10) — « Comptes sans prochaine action », nouveau modèle de routine désactivé par défaut dans Réglages › Routines.
  { id: '2026-10-08-r25-routine-comptes-sans-prochaine-action', itemCount: 1 },
  // #3749.1 / #3749.2 (lot R26, 08/10) — la colonne Grille de qualification nomme « Grille non remplie » au lieu d'un tiret ; le verdict rejoint aussi /briefing.
  { id: '2026-10-08-r26-grille-qualification-nommee-liste-et-briefing', itemCount: 2 },
  // #3828.2 (lot R26, 08/10) — l'écran Marché propose de créer une zone quand l'espace n'en a aucune.
  { id: '2026-10-08-r26-ecran-marche-creer-une-zone', itemCount: 1 },
  // #3702 (lot R26, 08/10) — la délégation d'envoi nomme ce qu'elle a arrêté (réponse, opposition, exclusion).
  { id: '2026-10-08-r26-delegation-nomme-ses-arrets', itemCount: 1 },
  // #3761 (lot R26, 08/10) — corrige le contraste en thème clair des badges « Info » et « Non disponible » des cartes de Laura.
  { id: '2026-10-08-r26-contraste-badges-info-danger-theme-clair', itemCount: 1 },
  // #3671.2bis (lot S09, 08/10) — Découvrir : signaler qu'une carte montre la mauvaise entreprise, elle ne revient plus dans vos recherches.
  { id: '2026-10-08-s09-decouvrir-mauvaise-entreprise', itemCount: 1 },
  // #3687.13 (lot S10, 08/10) — fiche contact : identité incertaine et sollicitation en double, nommées au bon endroit.
  { id: '2026-10-08-s10-fiche-contact-alertes-identite-sollicitation', itemCount: 2 },
  // #2414.34-.48 (épopée #2986, lot S14, 08/10) — le détail du repositionnement précoce redevient visible sur le dossier d'une mission.
  { id: '2026-10-08-s14-repositionnement-precoce-visible-sur-le-dossier', itemCount: 1 },
  // #2875/#3398 (lot T06, 08/10) — Laura nomme sur /chat un entretien dont le brief n'a pas encore été ouvert.
  { id: '2026-10-08-t06-chat-entretien-a-preparer', itemCount: 1 },
  // #3704.B (recette prod 08/10, lot V18) — une relance « donne-moi aussi des besoins » ne pose plus de question et ne reformule plus les critères du tour d'horizon précédent.
  { id: '2026-10-08-v18-relance-besoins-sans-question-ni-reformulation', itemCount: 1 },
  // #3704.A (recette prod 08/10, lot V18) — la carte de nouvelles cibles n'annonce plus un compte différent de ce qu'elle affiche réellement.
  { id: '2026-10-08-v18-carte-cibles-annonce-le-compte-affiche', itemCount: 1 },
  // #3893.1 (recette prod 08/10, lot V18) — le pied de réponse de Laura nomme le compte DE LA RÉPONSE, plutôt qu'un reste de portefeuille, sur une question mono-compte.
  { id: '2026-10-08-v18-pied-reponse-nomme-le-compte-de-la-reponse', itemCount: 1 },
  // #3763 (recette prod 08/10, lot V18) — « compare-moi X et Y » : Laura sait désormais retrouver les comptes nommés pour rendre la carte de comparaison, même sans leurs identifiants.
  { id: '2026-10-08-v18-comparer-par-nom-carte-comparison', itemCount: 1 },
  // #3822 (recette prod 08/10, lot V18) — enrichissement de lot : un seul bouton « Enrichir maintenant », le récapitulatif reste jusqu'à fermeture, un seul solde de crédits affiché, la bulle de Laura ne chevauche plus /accounts.
  { id: '2026-10-08-v18-enrichissement-lot-un-bouton-recap-stable', itemCount: 4 },
  // #3819.4 (lot N03, 08/10) — Découvrir : un compte sans signal se nomme « sélectionné sur le profil » et classe après tout compte qui porte une raison datée, même la seule vie juridique.
  { id: '2026-10-08-n03-discover-sans-signal-classe-apres', itemCount: 1 },
  // #3816.4 (lot N04, 09/10, recette prod 08/10) — « trouve-moi des missions pour ce profil » ne se refuse plus au nom d'un département qu'elle croit non suivi.
  { id: '2026-10-09-n04-missions-pour-profil-sans-refus-departement', itemCount: 1 },
  // #3952 (lot N04, 09/10, retour bêta 08/10) — le profil LinkedIn se lit désormais sur un CV importé, et sa case se nomme dans le formulaire.
  { id: '2026-10-09-n04-cv-linkedin-identite', itemCount: 2 },
  // #3809 (lot N06, 08→09/10) — « Nouvelle conversation » n'attend plus la fin d'une réponse en cours ailleurs.
  { id: '2026-10-09-n06-nouvelle-conversation-pendant-un-tour', itemCount: 1 },
  // #219.6 (#3231, lot J05, 09/10) — une direction interne se décrit par quatre rôles que tu nommes sur la fiche compte.
  { id: '2026-10-09-j05-direction-interne-quatre-roles-nommes', itemCount: 1 },
  // #3679 (lot D01, 08/10) — la salle de démonstration porte désormais une piste complète (SNCF), pour que « Préparer l'approche » s'y prouve.
  { id: '2026-10-08-d01-piste-complete-preparer-approche', itemCount: 1 },
  // #3717.7 (lot D01, 08/10) — la salle de démonstration déclenche désormais le cas « Déjà en tête » sur le plan de Société Générale.
  { id: '2026-10-08-d01-deja-en-tete-sg', itemCount: 1 },
  // V13.3 (lot V13, 08/10, recette prod 08/10) — /chat : la saisie n'accepte plus la frappe avant d'être prête.
  { id: '2026-10-08-v13-composeur-pas-de-frappe-avant-chargement', itemCount: 1 },
  // #3820 (recette prod 08/10, lot V12) — une reprise d'analyse n'annonce plus la phase déjà faite comme « en train de démarrer », et l'écran dit désormais « nouvelle tentative N/M » au lieu de rester sur « Lancement de l'analyse ».
  { id: '2026-10-08-v12-analyse-reprise-fidele', itemCount: 1 },
  // #3840 / #3842 (recette prod 08/10, lot V12) — fiche contact : provenance, confiance et coût tiennent VRAIMENT sur une seule ligne désormais (le lot précédent laissait encore 3 lignes visuelles malgré un seul conteneur).
  { id: '2026-10-08-v12-fiche-contact-une-ligne-pour-de-vrai', itemCount: 1 },
  // #3278 (recette prod 08/10, lot V12) — la liste des critères de route sans source se cite désormais VERBATIM (avec un exemple concret dans l'outil), au lieu d'une prose qui pouvait en inventer.
  { id: '2026-10-08-v12-route-commerciale-criteres-verbatim', itemCount: 1 },
  // VU EN PASSANT (lot V12, 08/10) — fiche contact : le statut « Non vérifié » d'une coordonnée rejoint la ligne de l'étiquette, jamais sa propre 3e ligne sous la valeur.
  { id: '2026-10-08-v12-fiche-contact-statut-sur-etiquette', itemCount: 1 },
  // #3840 / #3842 / #3843 (lot V02, 08/10) — fiche contact : moins de lignes de métadonnées par coordonnée, badge « Vérifié » retiré.
  { id: '2026-10-08-v02-fiche-contact-metadonnees-compactees', itemCount: 2 },
  // #3852 (lot V11, 08/10) — Laura retrouve un besoin déjà connu par son identifiant, pas seulement par son titre.
  { id: '2026-10-08-v11-besoin-retrouve-par-identifiant', itemCount: 1 },
  // #3871.1 (lot V11, 08/10) — « ce contact a quitté l'entreprise » propose désormais le passage en historique, au lieu d'un refus.
  { id: '2026-10-08-v11-contact-parti-propose-historique', itemCount: 1 },
  // #3862.1 (lot I02, 09/10) — la réponse complète referme l'étude interrompue : le bandeau de reprise ne revient plus au rechargement.
  { id: '2026-10-09-i02-etude-interrompue-refermee', itemCount: 1 },
  // #3871 (lot I02, 09/10) — la salle de démonstration porte un contact écarté en plus du contact en historique.
  { id: '2026-10-09-i02-demo-contact-ecarte', itemCount: 1 },
  // #3889.2 (lot I02, 09/10) — Laura retrouve les anciens besoins fermés d'un compte comme historique, jamais comme pistes ouvertes.
  { id: '2026-10-09-i02-besoins-fermes-historique', itemCount: 1 },
  // #3866 / #3867 / #3889 (lot I02, 09/10) — trois réponses scriptées de la salle : adéquation Data/BI, stratégie complète, historique des besoins.
  { id: '2026-10-09-i02-demo-strategie-adequation-historique', itemCount: 1 },
  // #3889.1 (lot I02, 09/10) — Laura retrouve qui a travaillé chez un compte d'après les CV autorisés, sans exiger de mission Bellum.
  { id: '2026-10-09-i02-experience-cv-autorise', itemCount: 1 },
  // #3871 (lot I02, 09/10) — la salle répond « déjà en historique » / « déjà écarté » quand on dit qu'un contact a quitté l'entreprise.
  { id: '2026-10-09-i02-demo-contact-parti-deja-traite', itemCount: 1 },
  // #3903 (lot Y10, 08/10) — « chez qui puis-je relancer ? » : Laura répond avec le bilan de relance sur une fenêtre, métadonnées seulement, jamais le corps des messages.
  { id: '2026-10-08-y10-laura-bilan-de-relance', itemCount: 1 },
  // #3919 (lot Y10, 08/10) — « qu'est-ce qui bouge chez ce compte ? » : Laura répond avec les signaux non périmés, datés et sourcés, jamais un lien inventé.
  { id: '2026-10-08-y10-laura-signaux-de-compte', itemCount: 1 },
  // VU EN PASSANT (lot V09, 08/10) — « Source du 22 septembre » sous une réponse du 08/10 se lisait
  // comme la date de la source consultée, jamais comme celle du fait qu'elle rapporte.
  { id: '2026-10-08-v09-fraicheur-nomme-la-donnee', itemCount: 1 },
  // VU EN PASSANT (lot V09, 08/10) — /discover proposait de diviser la recherche dès 2 secteurs
  // cochés, quel que soit le volume ; seuil jugé trop bas en recette prod 08/10.
  { id: '2026-10-08-v09-seuil-diviser-la-recherche-secteurs', itemCount: 1 },
  // #3697 (lot V09, 08/10) — recette prod 8c42a4032c réfutée : « Consigner le résultat » montrait
  // Sens=Envoyé déjà sélectionné sans qu'on l'ait cliqué — aucune valeur unique possible pour lui.
  { id: '2026-10-08-v09-consigner-appel-sens-jamais-presuppose', itemCount: 1 },
  // #3876 (lot V09, 08/10, VU EN PASSANT) — la commune du siège d'une entreprise du registre se
  // lisait sous une clé qui n'existe pas dans la réponse réelle : toujours vide, même connue.
  { id: '2026-10-08-v09-commune-du-siege-lue-sous-sa-vraie-cle', itemCount: 1 },
  // #3676 (lot V09, 08/10) — recette prod 8c42a4032c réfutée : le même fait signal apparaissait
  // jusqu'à 3 fois sur ?tab=veille (mission, piste, synthèse) — un fait couvert par une mission
  // (piste active OU affaire ouverte) ne faisait pas encore une seconde ligne ailleurs.
  { id: '2026-10-08-v09-veille-un-fait-une-ligne', itemCount: 1 },
  // #3858 (lot V09, 08/10) — recette prod 8c42a4032c réfutée : une question sur un compte nommé
  // (Sanofi) répondait juste mais le panneau "Ce qui a servi" ne nommait aucun dossier du compte.
  { id: '2026-10-08-v09-dossier-compte-cite-dans-ce-qui-a-servi', itemCount: 1 },
  // #3859.1 (lot V09, 08/10) — recette prod 8c42a4032c réfutée : Laura cherchait des décideurs
  // chez une entreprise non encore en CRM en demandant d'élargir la recherche au lieu de la lancer.
  { id: '2026-10-08-v09-laura-lance-la-recherche-de-decideurs', itemCount: 1 },
  // Vu en passant (lot V10, 08/10, recette prod 2335320781 Q #3899) — /chat : « Bien démarrer » ne revient plus dans un fil déjà commencé ; la première frappe après la navigation n'est plus perdue ; /contacts : les colonnes Relation et Suivi ne tronquent plus en plein mot à 1512 px.
  { id: '2026-10-08-v10-vu-en-passant-chat-contacts', itemCount: 3 },
  // #3711.entonnoir (lot V10, 08/10, recette prod 2335320781 Q #3899) — /contacts : le bandeau d'entonnoir replié tient sur une seule ligne compacte, plus trois.
  { id: '2026-10-08-v10-entonnoir-contacts-une-seule-ligne', itemCount: 1 },
  // #3677.scroll (lot V10, 08/10, recette prod 2335320781 Q #3899) — ?tab=programs défile jusqu'à la carte « Projets et transformations » même quand elle finit de charger après 4 secondes.
  { id: '2026-10-08-v10-programmes-defilement-fenetre-genereuse', itemCount: 1 },
  // #3864 (lot V10, 08/10, recette prod 2335320781 Q #3899) — « trouve-moi des besoins » rend une carte, une ligne par besoin, jamais un paragraphe qui les cite en texte.
  { id: '2026-10-08-v10-besoins-en-carte-jamais-en-texte', itemCount: 1 },
  // #3708.exclusion (lot V10, 08/10, recette prod 2335320781 Q #3899) — une source décochée dans « Outils et sources » se nomme EXCLUE dans le reçu de connaissance, jamais « non croisée »/« indisponible ».
  { id: '2026-10-08-v10-source-exclue-jamais-non-croisee', itemCount: 1 },
  // #3901 (lot Y07, 08/10) — offres d'emploi : un homonyme commune/entreprise n'est plus attribué au compte.
  { id: '2026-10-08-y07-offres-emploi-homonyme-commune-entreprise', itemCount: 1 },
  // #3907 (lot Y07, 08/10) — Découvrir : l'activité de l'entreprise se lit en clair, jamais un code NAF brut.
  { id: '2026-10-08-y07-decouvrir-activite-en-clair-jamais-naf-brut', itemCount: 1 },
  // #3906 (lot Y07, 08/10) — Découvrir : un signal plus vieux que la fenêtre choisie sort de « Pourquoi maintenant ».
  { id: '2026-10-08-y07-decouvrir-signaux-perimes-hors-pourquoi-maintenant', itemCount: 1 },
  // #3908 (lot Y07, 08/10) — Découvrir : plusieurs tranches d'effectif cochables ensemble (cumul, union).
  { id: '2026-10-08-y07-decouvrir-plusieurs-tranches-effectif', itemCount: 1 },
  // #3763.1 (lot V08, 08/10) — les réponses de Laura se replient : raison courte visible, preuve dépliable, « Ce qui manque » jamais caché.
  { id: '2026-10-08-v08-laura-reponses-depliables', itemCount: 2 },
  // #3890 (ADD-SANOFI-04, lot Y04, 08/10) — deux volumes de contacts mesurés
  // différemment ne se lisent plus comme une contradiction ; le total d'une
  // recherche par fonction reste cohérent avec ce qu'elle a trouvé.
  { id: '2026-10-08-y04-populations-de-contacts-distinguees', itemCount: 2 },
  // #3891 (ADD-SANOFI-05, lot Y04, 08/10) — l'absence de besoin client
  // confirmé ne bloque plus une approche de qualification.
  { id: '2026-10-08-y04-prerequis-par-operation', itemCount: 1 },
  // #3892 (ADD-SANOFI-06, lot Y04, 08/10) — un fait épinglé sur UN compte se
  // nomme désormais quand Laura le réutilise ailleurs, et un délai déclaré ne
  // se présente plus comme une garantie de démarrage.
  { id: '2026-10-08-y04-portee-memoire-nommee', itemCount: 2 },
  // #3896 / #3897 (lot Y06, 08/10) — la ligne « Fondée sur / Périmètre / Complétude / Certitude » rejoint le panneau « Voir la source », au lieu de s'afficher sur une ligne permanente sous chaque réponse.
  { id: '2026-10-08-y06-fondement-rejoint-voir-la-source', itemCount: 1 },
  // #3910 (lot Y08, 08/10) — depuis Découvrir, « Raison de la priorisation » est prérempli par la raison calculée, signalée « proposé par Bellum », modifiable.
  { id: '2026-10-08-y08-raison-priorisation-proposee-par-bellum', itemCount: 1 },
  // #3913 (lot Y08, 08/10) — le verdict rapide de Découvrir parle en mots de commercial, plus en jargon de barème (« axe pesé »).
  { id: '2026-10-08-y08-verdict-rapide-vocabulaire-commercial', itemCount: 1 },
  // #3914 (lot Y08, 08/10) — un compte venu de Découvrir dont l'analyse conclut « mettre en veille » cite sur quoi Découvrir l'avait fait remonter.
  { id: '2026-10-08-y08-pont-decouvrir-analyse', itemCount: 1 },
  // #3912 (lot Y09, 08/10) — le chemin d'accès recommandé dit ce que mesurent le score et la confiance d'un contact.
  { id: '2026-10-08-y09-score-confiance-contact-infobulle', itemCount: 1 },
  // #3911 (lot Y09, 08/10) — un contact trouvé sans ancre exacte (homonyme d'entreprise) se marque HYPOTHÈSE, jamais rattaché avec la confiance d'un annuaire vérifié.
  { id: '2026-10-08-y09-contact-homonyme-hypothese', itemCount: 1 },
  // #3788.6 (lot R20, 07/10) — la frontière démo ↔ réel vide le scroll infini des comptes et des contacts, dans les deux sens.
  { id: '2026-10-07-r20-demo-vide-le-cache-comptes-contacts', itemCount: 2 },
  // #3830.3 (lot R20, 07/10) — vivier démo : Kubernetes, Java et Spring sont désormais indexés, le filtre compétences se prouve en salle.
  { id: '2026-10-07-r20-vivier-demo-java-spring', itemCount: 1 },
  // #3822 (lot R14, 07/10, réfuté en recette) — un enrichissement de lot n'est plus coupé par un rechargement automatique.
  { id: '2026-10-07-r14-lot-enrichissement-survit-au-rechargement', itemCount: 1 },
  // #2985 (lot R22, 07/10) — "Fais-moi un point manager" sans compte nommé rend une carte de répartition du portefeuille, jamais un paragraphe sur un seul compte.
  { id: '2026-10-07-r22-point-manager-portefeuille', itemCount: 1 },
  // Vu en passant (lot R22, 07/10) — la fiche contact ne montre plus "N/A" : le compte associé prend sa place au fil d'Ariane et à la ligne Entité.
  { id: '2026-10-07-r22-fiche-contact-jamais-na', itemCount: 1 },
  // #3235 (lot R22, 07/10) — "pourquoi le verdict a changé" cite désormais l'ancien verdict, le nouveau et chaque cause, ou dit qu'aucune révision n'est disponible.
  { id: '2026-10-07-r22-pourquoi-le-verdict-a-change', itemCount: 1 },
  // #3245 (lot R22, 07/10) — un pari long déclaré se cite par compte, même sur un portefeuille "maintenant" mélangé.
  { id: '2026-10-07-r22-pari-long-par-compte', itemCount: 1 },
  // #3218 (lot R22, 07/10) — la section Approfondissement précise qu'elle ne concerne que cette réponse, jamais une relance de l'analyse du compte.
  { id: '2026-10-07-r22-approfondissement-note-de-portee', itemCount: 1 },
  // #3831 (lot R22, 07/10) — recherche d'un consultant par nom : plus de ligne vide ni de virgule orpheline quand le poste ou la ville sont inconnus.
  { id: '2026-10-07-r22-homonyme-sans-ligne-orpheline', itemCount: 1 },
  // #3704.1 (lot R23, 07/10) — recette prod 8d7c6957f0 réfutée : « nouvelle cible » / « déjà dans ton
  // espace » manquait encore quand Laura écrivait elle-même sa carte de recherche.
  { id: '2026-10-07-r23-nouvelle-cible-recopiee-vers-le-modele', itemCount: 1 },
  // #3704.2 (lot R23, 07/10) — recette prod 8d7c6957f0 réfutée : « donne-moi aussi des besoins »
  // faisait repartir Laura sur le portefeuille et oublier les cibles neuves trouvées.
  { id: '2026-10-07-r23-besoins-garde-le-perimetre-des-cibles', itemCount: 1 },
  // #3763 (lot R23, 07/10) — recette prod 8d7c6957f0 réfutée : « pourquoi X prioritaire vs Y »
  // sortait en prose + tableau, sans Verdict/Pourquoi/Réserves ni « Voir pourquoi » dépliable.
  { id: '2026-10-07-r23-pourquoi-prioritaire-gabarit-conseil', itemCount: 1 },
  // #3210.1 (lot R17, 07/10) — Laura compare aussi les canaux déjà utilisés et la référence client publiable entre tes cas.
  { id: '2026-10-07-r17-laura-compare-canaux-et-references', itemCount: 2 },
  // #3774 (lot V07, 08/10) — Chat : « Lire » apparaît enfin parmi les capacités, une capacité non accordée reste cachée.
  { id: '2026-10-08-v07-chat-capacite-lire-visible', itemCount: 1 },
  // #3814 (lot V07, 08/10) — Découvrir : le tri « Taille (effectif) » lit la tranche numérique, plus le libellé fabriqué.
  { id: '2026-10-08-v07-discover-tri-taille-tranche-numerique', itemCount: 1 },
  // #3815 (lot V07, 08/10) — Découvrir : un groupe de secteurs refusé nomme les sous-secteurs écartés.
  { id: '2026-10-08-v07-discover-secteurs-groupe-nomme-ecartes', itemCount: 1 },
  // #3713 (lot V07, 08/10) — colonnes Contacts : entêtes et cellules à nouveau alignés, dates lisibles entières.
  { id: '2026-10-08-v07-contacts-colonnes-alignees', itemCount: 1 },
  // #3740 (lot V07, 08/10) — déposer une image dans l'organigramme le dit clairement, plus de 502.
  { id: '2026-10-08-v07-organigramme-image-refus-nomme', itemCount: 1 },
  // #3849.1 (lot V01, 08/10) — glisser un fichier dans le chat l'attache, et un format refusé se nomme avant tout envoi.
  { id: '2026-10-08-v01-chat-glisser-deposer-fichier', itemCount: 2 },
  // #3848.1 (lot V01, 08/10) — le choix des secteurs d'une cible trop large part de 0, plus de présélection.
  { id: '2026-10-08-v01-secteurs-cible-repart-de-zero', itemCount: 1 },
  // #3846.1 (lot V01, 08/10) — le mode de contexte (Mon activité / Neutre) redevient visible depuis l'en-tête du fil.
  { id: '2026-10-08-v01-mode-contexte-visible-en-tete', itemCount: 1 },
  // #3845.1 (lot V01, 08/10) — un menu qui ne tenait pas sous la fenêtre se coupait hors écran au lieu de défiler.
  { id: '2026-10-08-v01-menu-defile-hors-ecran', itemCount: 1 },
  // #3850 (lot V04, 08/10) — téléphone : validation stricte à l'écriture, état d'attente nommé, toast qui ne conclut plus trop tôt, affichage international lisible.
  { id: '2026-10-08-v04-telephone-validation-attente-affichage', itemCount: 3 },
  // #3884 (lot V05, 08/10) — /chat n'affiche plus deux salutations à l'accueil.
  { id: '2026-10-08-v05-chat-une-seule-salutation', itemCount: 1 },
  // #3877.4 (lot X09, 08/10) — /discover : la ligne compte nomme le nombre d'établissements d'un compte, sans jamais gonfler le nombre de comptes.
  { id: '2026-10-08-x09-discover-nombre-etablissements', itemCount: 1 },
  // #3878.1 (lot X09, 08/10) — /discover : « trop de filtres » n'est plus déduit d'un comptage, mais d'une incohérence réellement détectée.
  { id: '2026-10-08-x09-discover-vide-incoherence-detectee', itemCount: 1 },
  // #3880.5 (lot X10, 08/10) — la shortlist Découvrir ne traverse plus un changement d'espace.
  { id: '2026-10-08-x10-decouvrir-shortlist-change-espace', itemCount: 1 },
  // #3694.8 (lot T01, 08/10) — une identité ambiguë (homonyme non résolu, entité hors périmètre) bloque l'ENVOI d'un message, jamais la rédaction du brouillon.
  { id: '2026-10-08-t01-identite-ambigue-bloque-envoi', itemCount: 1 },
  // #3740.3 (lot T02, 08/10) — un organigramme importé complète le LinkedIn d'un contact existant qui n'en avait aucun.
  { id: '2026-10-08-t02-organigramme-linkedin-ecriture-inverse', itemCount: 1 },
  // #3820 (lot T05, 08/10) — périmètre « Site » : le dossier (contacts et organigramme) applique le filtre de ville, pas seulement le chemin recommandé.
  { id: '2026-10-08-t05-site-filtre-contacts-dossier', itemCount: 1 },
  // #3847 (lot Y01, 08/10) — /chat passe en pleine largeur : plus de bande vide à droite du composeur sur un grand écran.
  { id: '2026-10-08-y01-chat-pleine-largeur', itemCount: 1 },
  // #3579 (lot V06, 08/10) — Laura clarifie chaque homonyme séparément, et reprend un nom déjà clarifié au lieu de tout redemander.
  { id: '2026-10-08-v06-laura-homonymes-un-par-un', itemCount: 1 },
  // #2773 (lot V06, 08/10) — le panneau de matching dit qu'il ne débite aucun crédit.
  { id: '2026-10-08-v06-matching-gratuit-annonce', itemCount: 1 },
  // #3677 (lot V06, 08/10) — ?tab=programs défile à nouveau jusqu'à la carte « Projets et transformations », même si un bloc au-dessus finit de charger plus tard.
  { id: '2026-10-08-v06-tab-programs-defilement-fiable', itemCount: 1 },
  // #3711 (lot V06, 08/10) — /contacts : l'entonnoir de qualification se replie en une ligne, la liste reste visible sans défiler.
  { id: '2026-10-08-v06-contacts-entonnoir-replie', itemCount: 1 },
  // #3712 (lot V06, 08/10) — l'étape d'un projet associé à un contact se traduit ; le menu « Associer à un projet » tient la largeur de son bouton.
  { id: '2026-10-08-v06-contact-associations-etape-et-menu', itemCount: 2 },
  // #3708.2 (lot V06, 08/10) — une source exclue dans « Outils et sources » se dit exclue, jamais « non disponible ».
  { id: '2026-10-08-v06-source-exclue-dite-exclue', itemCount: 1 },
  // #3706.1 (lot V06, 08/10) — recette prod : le premier envoi de chaque recherche de comptes neuve n'échoue plus après ~2 min.
  { id: '2026-10-08-v06-chat-premier-envoi-marge-reelle', itemCount: 1 },
  // #3866.1 (lot X05, 08/10) — un tour d'horizon nomme ses critères comme des critères, jamais une preuve d'intérêt.
  { id: '2026-10-08-x05-criteres-ne-sont-pas-une-preuve-dinteret', itemCount: 1 },
  // #3865.2 (lot X05, 08/10) — « quels besoins compatibles avec ce consultant ? » dans Laura.
  { id: '2026-10-08-x05-besoins-compatibles-consultant', itemCount: 1 },
  // #3864.1 (lot X05, 08/10) — « trouve-moi des besoins » lance une recherche, plus une explication des limites.
  { id: '2026-10-08-x05-trouve-moi-des-besoins', itemCount: 1 },
  // #3867 / #3868 / #3869 (lot X06, 08/10, bêta) — Laura : stratégie complète arbitrée, voies d'accès distinguées, approche préparée tout de suite.
  { id: '2026-10-08-x06-laura-strategie-voies-approche', itemCount: 3 },
  // #2021 (lot Y02, 08/10) — un utilisateur déjà onboardé qui redemande une reconfiguration voit un bandeau de reprise, plus une redirection forcée.
  { id: '2026-10-08-bandeau-reconfiguration-onboarding', itemCount: 2 },
  // #3803 (07/10) — aperçu fidèle d'un document déposé (grille, PDF, docx, slides) et téléchargement de l'original.
  { id: '2026-10-07-apercu-fidele-documents', itemCount: 3 },
  // #3680.6 reste (lot R9, 07/10) — Pistes à qualifier : « X affichées sur Y » quand la liste est tronquée, jamais une contradiction avec le compteur du filtre.
  { id: '2026-10-07-r9-pistes-x-affichees-sur-y', itemCount: 1 },
  // #3680 reste (lot R9, 07/10) — démo : Société Générale porte deux articles sur le même événement, pour montrer le fusionnement en salle.
  { id: '2026-10-07-r9-demo-doublon-evenement-veille', itemCount: 1 },
  // #3717.7 reste (lot R9, 07/10) — « Résumé du plan » ne répète plus mot pour mot la tête de « Prochaines actions » : un lien vers la ligne réelle.
  { id: '2026-10-07-r9-plan-resume-echo-prochaines-actions', itemCount: 1 },
  // #3679 reste (lot R9, 07/10) — « Préparer l'approche » ouvre le brouillon de message, plus la préparation de conversion.
  { id: '2026-10-07-r9-preparer-approche-brouillon-message', itemCount: 1 },
  // #3714.6 reste (lot R9, 07/10) — le brief du jour n'annonce plus un signal non adopté comme une affaire sans prochaine action ou vieillissante.
  { id: '2026-10-07-r9-brief-signal-non-adopte-exclu', itemCount: 1 },
  // #3675 reste (lot R9, 07/10) — « Score commercial », onglet Score, porte enfin son explication accessible (title + aria-describedby).
  { id: '2026-10-07-r9-score-commercial-infobulle-accessible', itemCount: 1 },
  // #3674.R1 (lot R9, 07/10) — revenir d'une fiche contact ramène aux filtres de l'onglet Contacts, pas seulement au compte.
  { id: '2026-10-07-r9-fil-ariane-filtres-contacts', itemCount: 1 },
  // #3278.2 (lot R10, 07/10) — Laura nomme la route commerciale et les critères de sélection sans source, dans /chat.
  { id: '2026-10-07-r10-route-commerciale-et-criteres-sans-source-en-chat', itemCount: 1 },
  // #3278.1 (lot R10, 07/10) — un signal d'achat déclaré sur le compte ouvre la route commerciale « signal entrant ».
  { id: '2026-10-07-r10-signal-declare-ouvre-la-route-commerciale', itemCount: 1 },
  // #3263.28 (lot R10, 07/10) — Comité d'achat : un contact déjà sollicité par une collègue le nomme sur son siège.
  { id: '2026-10-07-r10-comite-risque-de-collision', itemCount: 1 },
  // #3263.31 / #3263.37 (lot R10, 07/10) — Comité d'achat : dirigeant du groupe et interlocuteur hors périmètre, nommés sur le siège.
  { id: '2026-10-07-r10-comite-dirigeant-mondial-et-perimetre', itemCount: 2 },
  // #3263.46 / #3263.48 (lot R10, 07/10) — Comité d'achat : « Préparer l'approche » et « Créer une introduction » ouvrent le composeur réel sur la personne du siège.
  { id: '2026-10-07-r10-comite-approche-et-introduction', itemCount: 2 },
  // #2770.28 / .35 / .36 / .37 / .69 (lot R11, 07/10) — le plan de journée de Laura : tes préférences pèsent, ce qui n'a pas pu être lu se nomme.
  { id: '2026-10-07-r11-plan-de-journee-preferences', itemCount: 3 },
  // #2875/#3398 (lot R12, 07/10) — Laura signale sur /chat les appels loggés à la main et restés sans compte rendu.
  { id: '2026-10-07-r12-chat-appels-sans-debrief', itemCount: 1 },
  // #2537 / #2538 / #2539 / #2540 / #2548 (lot C, 08/10) — l'onboarding rendu plus clair : positionnements expliqués, « Je n'en ai pas encore ».
  { id: '2026-10-08-c-onboarding-positionnements-explique', itemCount: 3 },
  // #2545 / #2546 / #2550 / #3819 / #3814 (démo 08/10) — Découvrir : dix personnes à appeler par entreprise, signaux commerciaux d'abord.
  { id: '2026-10-08-discover-liste-appels-signaux', itemCount: 4 },
  // Lot R2d (08/10) — Missions : préparation de facture visible sur la synthèse, ventes Odoo en erreur claire.
  { id: '2026-10-08-d-missions-facture-synthese-odoo', itemCount: 2 },
  // #2563 / #2566 / #2567 / #2557 / #2558 / #2560 (lot G2, 07/10) — la facture mensuelle reconduite et le contrôle du bon de commande.
  { id: '2026-10-07-g2-facture-reconduite-controle-bc', itemCount: 6 },
  // #2553 / #3740 (lot F, 08/10) — importer un organigramme PDF, image ou PowerPoint, daté.
  { id: '2026-10-08-f-organigramme-importe-pdf-image-pptx', itemCount: 3 },
  // #3772 / #3678 / #3681 / #3690 (lot R7, 07/10 soir) — les points réfutés en recette prod du 07/10 soir, repris à la cause.
  { id: '2026-10-07-r7-refutes-chat-veille-besoins-contact', itemCount: 4 },
  // #3673 (lot R8, 07/10) — « Enjeux à adresser » nomme son absence plutôt que de disparaître.
  { id: '2026-10-07-r8-enjeux-non-evalues-nommes', itemCount: 1 },
  // #3816 (lot R8, 07/10) — chaque compte de « Comptes où placer un consultant » porte ses suites.
  { id: '2026-10-07-r8-missions-suites-par-compte', itemCount: 1 },
  // #3673 (lot R8, 07/10, vu en passant) — séparateur de milliers sur le dénominateur d'un taux /pilotage.
  { id: '2026-10-07-r8-pilotage-milliers', itemCount: 1 },
  // #3762 / #3769 (lot R8, 07/10) — une ville citée à Laura est résolue par la commune officielle, jamais devinée.
  { id: '2026-10-07-r8-ville-resolue-cote-serveur', itemCount: 2 },
  // #3830 (lot K15, 07/10) — /consultants : filtrer par compétence ou par nom réduit enfin la liste.
  { id: '2026-10-07-k15-consultants-filtres', itemCount: 1 },
  // Lot K01 (07/10) — recette prod : trois défauts de /chat, une adresse hors catalogue.
  { id: '2026-10-07-k01-recette-chat-360px', itemCount: 4 },
  // #3788 (lot K02, 07/10) — salle démo : sortie et accès réellement étanches.
  { id: '2026-10-07-k02-salle-demo-sortie-etanche', itemCount: 4 },
  // #3772.1 (lot K04, 07/10) — dossier ciblé et personnalisation dans le même panneau Contexte, ouvert depuis l'en-tête.
  { id: '2026-10-07-k04-panneau-contexte-unique', itemCount: 1 },
  // #3769.4b (lot K04, 07/10) — la continuité de forme d'un fil Laura reconnaît aussi les badges déjà employés.
  { id: '2026-10-07-k04-laura-continuite-des-badges', itemCount: 1 },
  // #3695 / #3696 / #3690 (lot K12, 07/10) — le modèle/style appliqué à un message et tes corrections sont enregistrés et retrouvés après rechargement ; le référent d'un relais s'affiche quand il est renseigné.
  { id: '2026-10-07-k12-brouillon-trace-et-persiste', itemCount: 2 },
  // #3816 / #3823 (lot C4, 07/10) — des missions pour un profil dans Laura ; l'onglet Opportunités recentré sur les missions.
  { id: '2026-10-07-c4-missions-profil-et-compte', itemCount: 4 },
  // #3819 (lot C2, 07/10) — Découvrir : chaque carte dit ses besoins connus, ses critères satisfaits, et ce qui n'a pas été cherché.
  { id: '2026-10-07-c2-discover-carte-besoins-criteres-non-cherche', itemCount: 3 },
  // #3815 (lot C2, 07/10) — Découvrir : un groupe de secteurs ajoute ce qui tient sous le plafond de 5, nomme le reste ; à 5/5, les cases restantes se désactivent avant le clic.
  { id: '2026-10-07-c2-discover-groupe-secteurs-plafond-nomme', itemCount: 1 },
  // #3814 (lot C2, 07/10) — Découvrir tous secteurs : tri par taille, par défaut sans secteur ; sortie maigre : élargissement précis.
  { id: '2026-10-07-c2-discover-tri-taille-elargissement-precis', itemCount: 2 },
  // #3817 / #3818 / #3820 (lot C3, 07/10) — signal principal et demandes confirmées nomment une source en panne, verdict sans objectif, périmètre « site ».
  { id: '2026-10-07-lot-c3-signal-objectif-site', itemCount: 3 },
  // #3762 / #3707 / #3764 / #3673 / #3676 / #3678 / #3672 / #3677 (lot R4, 07/10) — les points réfutés en recette prod, repris à la cause.
  { id: '2026-10-07-r4-refutes-carte-comptes-signaux', itemCount: 4 },
  // #3774 / #3775 (lot K05, 07/10) — /chat : un seul bouton vers le catalogue de commandes, capacités réelles par outil connecté, signalement sans recouvrir la saisie en bureau, avertissement au partage d'une source personnelle.
  { id: '2026-10-07-k05-chat-un-seul-acces-au-catalogue', itemCount: 4 },
  // #3697 (reste (a), lot K08, 07/10) — le support d'appel généré adapte son ton au rôle du contact et n'impose plus de rendez-vous par défaut.
  { id: '2026-10-07-k08-support-appel-role-et-objectif', itemCount: 1 },
  // #3740 (reste, lot K08, 07/10) — importer un organigramme en PDF, Excel ou PowerPoint ; une image se fait refuser nommément, faute d'OCR.
  { id: '2026-10-07-k08-organigramme-pdf-xlsx-pptx', itemCount: 1 },
  // #3757 (reste, lot K08, 07/10) — Découvrir distingue une ESN concurrente supposée d'un partenaire que l'espace a déjà déclaré.
  { id: '2026-10-07-k08-discover-partenaire-declare', itemCount: 1 },
  // #3742 / #3744 (lot K08, 07/10) — la carte d'influence et l'organigramme suivent désormais le même filtre géographique que les contacts.
  { id: '2026-10-07-k08-organigramme-influence-filtre-geo', itemCount: 1 },
  // #3687.16 (lot N02, 07/10) — le retour vers /contacts garde les filtres quittés, et la position de lecture.
  { id: '2026-10-07-n02-contacts-retour-liste-filtres-position', itemCount: 2 },
  // E1 (#3698, #3822, 07/10) — téléphone + e-mail + LinkedIn, état par coordonnée, débit sur trouvaille.
  { id: '2026-10-07-e1-enrichissement-telephone-email-linkedin', itemCount: 4 },
  // #3831.1 (lot N01, 07/10) — enrichir une fiche vivier sans profil LinkedIn connu, via une recherche libre par nom.
  { id: '2026-10-07-n01-vivier-enrichir-sans-linkedin', itemCount: 1 },
  // #3704 (lot N04, 07/10) — recette prod 06/10 : « nouvelle cible » et « déjà dans ton espace » se voient enfin.
  { id: '2026-10-07-n04-laura-nouvelle-cible-marquee', itemCount: 1 },
  // #3809 (lot N05, 07/10) — « Nouvelle conversation » : la modale de portée ne reste plus muette pendant le chargement.
  { id: '2026-10-07-n05-modale-de-portee-jamais-muette', itemCount: 1 },
  // #3702.9 (lot N06, 07/10) — un contact exclu arrête la délégation d'envoi.
  { id: '2026-10-07-n06-delegation-exclusion', itemCount: 1 },
  // #3828 (lot N07, 07/10) — la liste « Marchés locaux » quitte Comptes, Pilotage › Marché porte seul ce geste.
  { id: '2026-10-07-n07-marches-locaux-vers-pilotage-marche', itemCount: 1 },
  // #2021 (lot N08, 07/10) — en démo, « revoir en mode guidé » ouvre la visite guidée existante.
  { id: '2026-10-07-n08-mode-guide-demo-visite-existante', itemCount: 1 },
  // #3295 (brief P01, 07/10) — un REX de perte documenté en démo, sur un vrai dossier (jamais un compte fictif).
  { id: '2026-10-07-p01-rex-de-perte-en-demo-sur-un-vrai-dossier', itemCount: 1 },
  // #3234 (#3211.11, lot P02, 07/10) — l'angle d'un brouillon Laura devient la raison du message, et la relance identique est refusée pour de vrai.
  { id: '2026-10-07-p02-angle-brouillon-laura-devient-raison', itemCount: 1 },
  // #2877 / #3419.4 (lot P02, 07/10) — une variable sourcée sur la mémoire marché ne lave jamais, seule, l'usage externe.
  { id: '2026-10-07-p02-memoire-marche-variable-message', itemCount: 1 },
  // #3219 (#190.2, lot P02, 07/10) — relancer l'analyse sous un autre périmètre ne crée plus une fausse contradiction d'effectif.
  { id: '2026-10-07-p02-effectif-portees-differentes', itemCount: 1 },
  // #3231 (#219.8, lot P02, 07/10) — la relation déclarée atteint Laura même sans appel d'outil ce tour.
  { id: '2026-10-07-p02-relation-declaree-contexte-de-base', itemCount: 1 },
  // #3235 (lot R6, 07/10) — « pourquoi le verdict a changé ? » cite aussi la révision du pipeline et la version de scoring.
  { id: '2026-10-07-r6-verdict-cite-pipeline-et-scoring', itemCount: 1 },
  // #2850 (lot R6, 07/10) — un export de besoins déposé au chat est reconnu même sans intitulé d'appel d'offres.
  { id: '2026-10-07-r6-csv-besoins-reconnu-au-chat', itemCount: 1 },
  // #3218.1 / #3218.2 (lot R6, 07/10) — accepter un périmètre par défaut ou une puce déclenche l'analyse, sans reposer la question.
  { id: '2026-10-07-r6-perimetre-accepte-declenche-analyse', itemCount: 1 },
  // #3245.1 (lot R6, 07/10) — « où investir mon temps » cite la charge commerciale et l'objectif des comptes « maintenant ».
  { id: '2026-10-07-r6-ou-investir-mon-temps-charge-et-objectif', itemCount: 2 },
  // #3811 (lot C6, 07/10) — un CV en tableau ne sort plus les intitulés de colonne ni les phrases de mission dans ses compétences.
  { id: '2026-10-07-c6-cv-competences-qualite', itemCount: 1 },
  // #3763.5 (reste du lot J19, lot K03, 07/10) — les réponses explicatives se structurent (résumé, réserves, sources repliées).
  { id: '2026-10-07-k03-reponses-explicatives-structurees', itemCount: 1 },
  // #3758 (reste du lot J14, lot K03, 07/10) — le compte rendu de rendez-vous enregistré sort en carte.
  { id: '2026-10-07-k03-compte-rendu-enregistre-en-carte', itemCount: 1 },
  // #3761.16 (lot K03, 07/10) — la bibliothèque de réponses de Laura se resserre sous 768 px.
  { id: '2026-10-07-k03-reponses-laura-densite-mobile', itemCount: 1 },
  // #3707 / #3762 / #3767 / #3771 / #3764 / #3768 (lot L1, 07/10) — les formes connues de Laura partent en carte.
  { id: '2026-10-07-l1-laura-formes-connues-en-carte', itemCount: 4 },
  // #3618 / #3672 / #3673 / #3676 / #3677 / #3678 (lot R3, 07/10) — les points réfutés en prod, repris à la cause.
  { id: '2026-10-07-r3-refutes-search-fiche-compte-veille', itemCount: 5 },
  // #3751.4 / #3754.6 (07/10) — onglets nommés dans l'aperçu d'un classeur ; niveau décideur qui ne met plus tout à 1.
  { id: '2026-10-07-onglets-classeur-niveau-decideur', itemCount: 2 },
  // #3641 / #3640 / #3639 / #3689 / #3637 / #3624 / #3670 / #3707 (lot R2, 07/10) — les points réfutés en prod, repris à la cause.
  { id: '2026-10-07-r2-refutes-fiche-contact-plan-recherche', itemCount: 5 },
  // #3688 (lot F12, 06/10) — fiche contact : l'historique se trouve sans défiler (relation client, planifié ≠ tenu, recherche, saisie protégée).
  { id: '2026-10-06-f12-fiche-contact-historique-retrouve', itemCount: 4 },
  // #3694 / #3695 (lot F15, 06/10) — e-mail suggéré sans question inutile, brief corrigeable, version tracée, signal ancien jamais « récent ».
  { id: '2026-10-06-lot-f15-email-sans-question-inutile-brief-corrigeable-version-tracee', itemCount: 4 },
  // #3702 / #3700 (lot F18, 06/10) — délégation d'envoi explicite, bornée, révocable ; capacité réelle par canal.
  { id: '2026-10-06-f18-delegation-envoi', itemCount: 3 },
  // #3703 / #3704 (lot F20, 06/10) — Neutre ferme aussi e-mail et agenda, la recherche de Laura se reprend par source et mène à l'analyse.
  { id: '2026-10-06-f20-neutre-boites-privees-recherche-reprise-analyse', itemCount: 4 },
  // #3696 / #3697 (lot F16, 06/10) — panneau de contact plus large, fermable au clavier ; rédaction qui continue après « Fermer » ; appel : support sans numéro, résultat consigné depuis le support, objection exprimée dans la relation, trames ordonnées par rôle.
  { id: '2026-10-06-lot-f16-appel-sans-numero-resultat-objection-generation-continue', itemCount: 5 },
  // #3701 / #3713 (lot F19, 06/10) — « Tous les résultats » plafonné avec revue, homonymes/exclus/sans e-mail nommés, sélection et position rendues au retour d'une fiche, résultat partiel sans perte de sélection.
  { id: '2026-10-06-f19-contacts-selection-revue-et-retour-fiche', itemCount: 4 },
  // #3752.7 / #3754.6 / #3797 (06/10) — finitions du pack de contexte : source documentaire visible, rapprochement des postes cibles resserré, cibles lisibles, suppression d'un document confirmée.
  { id: '2026-10-06-pack-contexte-finitions', itemCount: 4 },
  // #3698 / #3699 (lot F17, 06/10) — enrichir : l'échec dit sa vraie cause et l'équipe est prévenue ; contacter : canal choisi, expéditeur réel, envoi incertain à vérifier.
  { id: '2026-10-06-f17-enrichir-contacter-verite', itemCount: 4 },
  // #3670 (06/10) — la méthode validée guide aussi l'analyse de compte, l'approche, la séquence et la préparation d'appel.
  { id: '2026-10-06-methode-validee-hors-chat', itemCount: 3 },
  // #3671 (lot F04, 06/10) — un fait corrigé ne revient pas tel quel ; Market Memory en lecture seule.
  { id: '2026-10-06-lot-f04-fait-corrige-ne-revient-pas-tel-quel', itemCount: 2 },
  { id: '2026-10-06-f25-fiche-compte-contacter', itemCount: 1 },
  // #3637 / #3697.1 (06/10, lot F26) — « Préparer mon appel » sans numéro.
  { id: '2026-10-06-f26-preparer-mon-appel-sans-numero', itemCount: 1 },
  // #3705 / #3706 (lot F21, 06/10) — Laura : zone dite « siège », filiale probable nommée, secteurs exclus, point d'entrée choisi, compte connu signalé.
  { id: '2026-10-06-f21-laura-groupe-zone-exclusions-choix', itemCount: 4 },
  // #3707 / #3708 / #3709 (lot F22, 06/10) — Laura : parité carte↔texte tenue sur la salle, états « accès limité / non connecté », profondeur « Standard ».
  { id: '2026-10-06-f22-laura-outils-etats-standard-parite-salle', itemCount: 4 },
  // #3788 (06/10) — /login ferme la session démo avant d'ouvrir la vraie.
  { id: '2026-10-06-f32-login-ferme-la-demo', itemCount: 1 },
  // I35 (06/10) — retours de recette : historique daté, Signaux et besoins, programmes, pistes, composeur de Laura.
  { id: '2026-10-06-i35-recette-fiche-compte', itemCount: 6 },
  // #3666 (lot F01, 06/10) — une analyse en cours se suit depuis toutes les pages ; statuts d'opération en mots ; import : fichier reçu ≠ lignes écrites.
  { id: '2026-10-06-f01-operations-sur-toutes-les-pages', itemCount: 3 },
  // #3692 / #3693 (lot F14, 06/10) — synthèse Laura : copie fidèle, contact pauvre, motif générique retiré ; rendez-vous planifié depuis la fiche.
  { id: '2026-10-06-f14-fiche-contact-synthese-rdv', itemCount: 3 },
  // #3712 / #3718 / #3719 (lot F23, 06/10) — associer à un projet, réponses détectées, export CRM retrouvable.
  { id: '2026-10-06-f23-associer-reponses-export-crm', itemCount: 4 },
  // #3490, #3473 (lot F29, 06/10) — désarchiver un compte écarté, onglet Accès plus rapide.
  { id: '2026-10-06-desarchiver-un-compte-ecarte-et-acces-plus-rapide', itemCount: 3 },
  // #3747 (06/10) — salle de démonstration : jamais servie à moitié semée, attente annoncée honnêtement.
  { id: '2026-10-06-d01-demo-recette-ecran', itemCount: 3 },
  { id: '2026-10-06-salle-demo-jamais-partielle', itemCount: 2 },
  // #3687 (lot F11, 06/10) — fiche contact : la colonne « Informations clés » tient un e-mail pro, jamais coupé.
  { id: '2026-10-06-f11-fiche-contact-email-entier', itemCount: 1 },
  // #3687 / #3688 (lot I21, 05/10) — fiche contact recomposée en zones, note / échange / tâche en tête.
  { id: '2026-10-05-i21-fiche-contact-en-zones', itemCount: 3 },
  // #3689 / #3690 (lot I22, 05/10) — fiche contact : un seul parcours de préparation (brouillons et réponses gardés), relais d'introduction sans les huit étapes.
  { id: '2026-10-05-lot-i22-fiche-contact-un-seul-parcours-relais-conserve', itemCount: 4 },
  // #3691 / #3692 / #3712 (lot I23, 05/10) — fiche contact : où en est la relation, pourquoi le contact compte (faits / hypothèses), dossiers associés.
  { id: '2026-10-05-i23-fiche-contact-relation-synthese-dossiers', itemCount: 4 },
  // #3693 / #3716 (lot I24, 05/10) — fiche contact : préparer, consigner, planifier ; parcours et colonnes importées rangés dans un détail.
  { id: '2026-10-05-i24-fiche-contact-gestes-distincts-et-detail-parcours', itemCount: 4 },
  { id: '2026-10-05-i25-traiter-la-reponse-et-export-historique', itemCount: 2 },
  // #3701 / #3713 (lot I26, 05/10) — la sélection de Contacts nomme son périmètre ; une erreur de chargement n'est plus « aucun contact ».
  { id: '2026-10-05-i26-contacts-selection-perimetre-et-erreur', itemCount: 2 },
  // Lot I29 (05/10) — #3698/#3699 : échec d'enrichissement expliqué (crédits ≠ service), e-mail seul gardé, expéditeur réel avant l'envoi.
  { id: '2026-10-05-i29-enrichir-contacter-verite', itemCount: 3 },
  // #3700 (lot I30, 05/10) — les séquences se gèrent dans Actions ; la fiche contact les résume.
  { id: '2026-10-05-i30-sequences-gerees-dans-actions', itemCount: 3 },
  // #3764 (lot J20, 06/10) — les réponses de Laura parlent avec dix badges de statut et cinq familles de libellés.
  { id: '2026-10-06-j20-badges-reponses-laura', itemCount: 2 },
  // #3766 (lot J22, 06/10) — sous une réponse riche, Laura propose une suite réelle : un geste principal, des secondaires, jamais un bouton sans objet.
  { id: '2026-10-06-j22-laura-actions-de-suite-coherentes', itemCount: 3 },
  // #3768 (lot J24, 06/10) — « Retravailler » sous une réponse de Laura : huit gestes qui transforment la réponse affichée.
  { id: '2026-10-06-j24-retravailler-une-reponse', itemCount: 3 },
  { id: '2026-10-06-j26-reponses-laura-copie-export', itemCount: 3 },
  // J27 (06/10) — #3771 : une réponse riche de Laura nomme ce que sa forme laisserait croire (un seul compte, sources rares, cellules non mesurées).
  { id: '2026-10-06-j27-laura-forme-sans-faux-poids', itemCount: 3 },
  // #3772 (lot J28, 06/10) — Laura /chat : « Sans dossier ciblé » ne promet plus une exclusion, et l'exclusion stricte existe vraiment.
  { id: '2026-10-06-j28-laura-contexte-sans-donnees', itemCount: 3 },
  // #3774 (lot J30, 06/10) — /chat : saisie sur la grille du fil, accueil au ras de la saisie, menu « Sources », profondeur sans phrase permanente.
  { id: '2026-10-06-j30-chat-grille-commune-sources-et-profondeur', itemCount: 4 },
  // #3715 (lot J03, 06/10) — la stratégie de compte n'empile plus cinq cartes qui répètent les mêmes personnes.
  { id: '2026-10-06-j03-strategie-de-compte-sans-cartes-annexes', itemCount: 2 },
  // #3740 (lot J05, 06/10) — l'organigramme importé montre, avant validation, ce que Bellum sait déjà de chaque personne, et la complète.
  { id: '2026-10-06-j05-import-organigramme-apercu-bellum', itemCount: 2 },
  // Lot J07 (06/10) — /search : France présélectionnée et première des choix.
  { id: '2026-10-06-j07-search-france', itemCount: 1 },
  // #3623 (06/10) — /search : le trombone joint de vrais documents (CSV, ZIP, classeurs…) à l'analyse.
  { id: '2026-10-06-search-documents-joints', itemCount: 3 },
  // #3751 (06/10) — Connaissances : docx / xlsx / pptx comme le chat, dépôt multiple, un statut par fichier.
  { id: '2026-10-06-connaissances-bureautique', itemCount: 3 },
  // #3750 (06/10) — les documents de connaissance découpés par onglet / diapositive / section, cités par leur unité.
  { id: '2026-10-06-rag-decoupage-par-onglet', itemCount: 3 },
  // Lot RBF (11/10) — #3979 : « Exporter » dans l'en-tête de /chat (Markdown, PDF), cartes lisibles dans l'export.
  { id: '2026-10-11-rbf-export-conversation-laura', itemCount: 2 },
  // Lot RBG (11/10, #3983) — siège ≠ implantation dans Découvrir et dans Laura, d'après le registre public.
  { id: '2026-10-11-rbg-siege-implantation-dans-laura-et-decouvrir', itemCount: 3 },
  // #3983 (reste, 11/10) — holding hors zone : sa filiale implantée dans la zone sort comme cible à sa place.
  { id: '2026-10-11-rbg-holding-filiale-dans-la-zone', itemCount: 2 },
  // #3895 (lot S-2958, 11/10) — une note de compte peut valoir aussi pour une autre entité du même groupe, dite par son auteur.
  { id: '2026-10-11-s2958-note-portee-entite-du-groupe', itemCount: 2 },
  // #4016 (lot W12, 11/10) — les rapports annuels et autres documents publics sont lus en local : l'analyse en lit davantage sans consommer le quota de lecture web.
  { id: '2026-10-11-w12-documents-web-lus-en-local', itemCount: 1 },
  // #4059 (lot MATCHING-BESOIN, 12/10) — le classement d'un besoin dit ce qu'un CV ajouté ou une exigence modifiée change.
  { id: '2026-10-12-matching-besoin-comparaison-qui-senrichit', itemCount: 3 },
  // Lot DECOUVRIR-LISIBLE (12/10) — #4068.1-.4 : faits datés et typés, sources jamais nommées.
  { id: '2026-10-12-decouvrir-lisible-faits-dates', itemCount: 4 },
  // Lot LAURA-B (12/10) — Laura lit les notes d'un compte avec leur portée de groupe ; une approche demandée est toujours préparée dans le tour.
  { id: '2026-10-12-laura-b-notes-de-compte-et-approche-demandee', itemCount: 2 },
  // Lot H (05/10) — approfondir un compte analysé, /briefing, accroches, porte « À trancher », relance datée, import d'équipe, question au composeur.
  // #3763 (lot J19, 06/10) — réponses de Laura dépliables : raison courte visible, preuve / sources / limites derrière un bouton nommé.
  { id: '2026-10-06-j19-reponses-laura-depliables', itemCount: 2 },
  { id: '2026-10-06-j25-laura-style-du-fil', itemCount: 2 },
  { id: '2026-10-05-h-refutes-relances-lanceur', itemCount: 7 },
  // G1 (05/10) — fiche compte et opportunités : /search sans en-tête, onglet Contacts allégé, un seul écran Opportunité, « Joindre des documents ».
  { id: '2026-10-05-g1-fiche-compte-opportunites', itemCount: 5 },
  // #3684 / #3678 (lot I19, 05/10) — ESN citée en stratégie fondée sur une déclaration ou un placement ; une action principale par piste.
  { id: '2026-10-05-i19-esn-fondee-action-principale-signal', itemCount: 1 },
  // #3752 (06/10) — le message généré parle avec la voix de l'ESN : positionnement, preuves de ses documents (source nommée), mots interdits contrôlés.
  { id: '2026-10-06-messages-voix-de-lesn', itemCount: 3 },
  // #3753 (06/10) — importer un ciblage déjà fait : liste cible tiérée A/B/C, raison, problématiques injectées dans l'analyse comme hypothèses du vendeur.
  { id: '2026-10-06-import-ciblage-tier', itemCount: 3 },
  // Postes cibles de l'ESN (06/10) — import csv/xlsx avec niveau décideur, ordre des contacts et raison « Niveau N pour vous ».
  { id: '2026-10-06-postes-cibles-niveau-decideur', itemCount: 3 },
  // #3756 (06/10) — Séquences › bibliothèque de campagnes : import xlsx/csv, application à un contact, variables, étape bloquée nommée.
  { id: '2026-10-06-sequences-bibliotheque-campagnes', itemCount: 3 },
  // #3755 (06/10) — la grille de qualification propre à l'espace : import/édition dans Réglages, verdict axe par axe sur la fiche.
  { id: '2026-10-06-grille-qualification', itemCount: 3 },
  // Marchés locaux (05/10) — Comptes › « Marchés locaux » : la fiche d'une zone, la puce « Marché local » sur le compte, le renvoi depuis la veille.
  { id: '2026-10-05-marches-locaux-parcours', itemCount: 3 },
  { id: '2026-10-05-i17-compteurs-dossier-et-demandes-ouvertes', itemCount: 3 },
  // #3677/#3679/#3717 (lot I16, 06/10) — programmes avec les signaux, pistes à action principale, plan sans réseau global.
  { id: '2026-10-06-j18-cartographie-de-comptes-gabarit', itemCount: 3 },
  { id: '2026-10-06-i16-programmes-pistes-plan-general', itemCount: 4 },
  // #3676 / #3714 (lot I15, 05/10) — « Signaux et besoins » en une surface, bandeau « À regarder en premier » retiré, généralités hors des compteurs.
  { id: '2026-10-05-lot-i15-signaux-et-besoins-en-une-surface', itemCount: 3 },
  // #3674 / #3675 (lot I14, 05/10) — le dossier s'ouvre sur la stratégie de compte, les cinq P deviennent cinq questions.
  { id: '2026-10-05-i14-dossier-compte-ouvre-sur-la-strategie', itemCount: 4 },
  // #2770 / #2985 (lot E25, 05/10) — plan de la semaine dit une seule fois, rendez-vous récurrent en démo, place réservée sous la ligne d'amorce de Laura.
  { id: '2026-10-05-e25-plan-semaine-une-fois-et-recurrent-en-demo', itemCount: 3 },
  // #3682 / #3683 (lot I18, 05/10) — fait ancien = contexte historique ; « Ouvrir dans le pipe » ouvre le projet.
  { id: '2026-10-05-i18-comptes-contexte-historique-et-ouvrir-le-projet', itemCount: 2 },
  // #3590/#3591/#3592/#3593/#3594/#3598/#3599/#3610 — huit retours bêta d'interface (lot E26).
  { id: '2026-10-05-e26-fiche-compte-plus-lisible', itemCount: 4 },
  // Lot I13 (05/10) — provenance sans jargon : date et certitude restent, les noms de briques internes disparaissent (#3672).
  { id: '2026-10-05-i13-provenance-sans-jargon', itemCount: 2 },
  // #3658 / #3660 / #3661 (lot I02, 05/10) — bandeau de compteurs de la veille, lien de Laura sur Opportunités et lien de barre latérale « Mémoire collective » retirés.
  { id: '2026-10-05-i02-entrees-retirees-cibles-opportunites-memoire', itemCount: 3 },
  // Lot I05 (05/10) — Laura : compte analysé non suivi scopable, mode Neutre sans profil ni CRM, zone d'une recherche affinable.
  { id: '2026-10-05-i05-laura-compte-neutre-precision', itemCount: 3 },
  // Lot F10 (06/10) — #3685 contacts du compte (lecture courte, filtres actifs, bandeau /contacts visible) et #3654 compte non suivi scopé jusque dans l'accueil.
  { id: '2026-10-06-f10-contacts-compte-laura-compte-non-suivi', itemCount: 3 },
  // #3704 / #3705 (lot I06, 05/10) — Laura cherche de nouvelles entreprises et tient secteur, zone et taille.
  { id: '2026-10-05-i06-laura-vraie-recherche-perimetre', itemCount: 4 },
  // #3707 / #3708 / #3709 (lot I07, 05/10) — Laura : forme de réponse stable, « Outils et sources » effectif, réglages qui ne déplacent plus la saisie.
  { id: '2026-10-05-lot-i07-laura-forme-stable-outils-et-sources-reglages-stables', itemCount: 4 },
  // #3666 (lot I08, 05/10) — pendant une analyse : « Actualisation en cours » sur l'ancien dossier, aucun pourcentage inventé, « Continuer à consulter » si l'attente s'allonge.
  { id: '2026-10-05-i08-rester-utilisable-pendant-une-analyse', itemCount: 3 },
  // Lot H4 (05/10) — missions sur deux lignes, prochaine action sur la carte du comité, retours d'expérience en tête, carte de Laura bornée.
  // #3646 / #3659 (lot I03, 05/10) — Découvrir : critères porte unique, « Appliquer » n'ouvre plus la recherche.
  { id: '2026-10-05-i03-decouvrir-criteres-porte-unique-appliquer-sans-lancer', itemCount: 3 },
  { id: '2026-10-05-h4-missions-comite-rex-laura', itemCount: 4 },
  // Incident 05/10 (PR #3647) — import de CV volumineux : archive téléchargée une fois, progression dès le téléchargement.
  { id: '2026-10-05-import-zip-cv-volumineux', itemCount: 1 },
  // #2979 / #3282 / #3263.19 / #3549.6 / #3295 (lot F3, 05/10) — lignes de missions uniformes, date de prochaine action sur tout siège du comité, numéro entier, retours d'expérience en haut de Pilotage.
  { id: '2026-10-05-lot-f3-missions-uniformes-comite-dates-numeros-entiers-rex-en-haut', itemCount: 4 },
  // #3215.4 / #3356 / #3416 / #3419.3 (lot E27, 05/10) — « Demander à Laura » garde le compte, cibles 44 px du composeur, puce « +N autres », /outreach.
  { id: '2026-10-05-e27-refutes-recette-pile-a', itemCount: 4 },
  // #3632 / #3634 / #3635 / #3636 / #3637 / #3638 / #3639 / #3640 / #3641 / #3642 / #3644 (lot G2, 05/10) — fiche contact en cinq onglets, notes avec Contacter, pitch et objections par Laura, e-mail suggéré cadré par trois questions (#3633).
  { id: '2026-10-05-g2-fiche-contact-en-cinq-onglets', itemCount: 4 },
  // #3597 (04/10) — Découvrir : une seule liste de comptes, une ligne compacte repliable, dix comptes puis « Voir 10 de plus ».
  { id: '2026-10-04-3597-decouvrir-une-seule-liste', itemCount: 3 },
  // #3586 (04/10) — la connaissance produit de Bellum alimente Laura en continu.
  { id: '2026-10-04-drive-interne-rag-produit', itemCount: 5 },
  // #3192.2 / #3549.5 / #3282 / #3295 / #2947 (lot E23, 04/10) — fil de /chat plus haut, libellés courts dans /contacts, prochaine action du comité SG en démo, porte vers les retours d'expérience, lecture des variables qui se dit.
  { id: '2026-10-04-e23-reliquats-z2-chat-contacts-demo-pilotage', itemCount: 4 },
  // Import ZIP de 688 CV (04/10) — l'archive volumineuse passe, chaque CV importé est lu par le modèle, rattrapage « Lire les CV non lus ».
  { id: '2026-10-04-import-zip-cv-lecture-automatique', itemCount: 3 },
  // #3192 / #3549 / #3386 (lot E18, 04/10) — fil de /chat dégagé, « pas encore cherché » nommé, rôle métier réglé dans le Profil et qui ordonne Aujourd'hui.
  { id: '2026-10-04-e18-fil-libre-mobile-nomme-role-ordonne-aujourdhui', itemCount: 3 },
  // Lot E20 (04/10) — décision Louis : coordonnées pro toujours en clair ; un nom complet en base n'est plus réduit à une initiale.
  { id: '2026-10-04-e20-coordonnees-pro-en-clair', itemCount: 1 },
  // #3596 (lot I12, 05/10) — le back-office aussi : adresses e-mail en clair sur tous ses écrans.
  { id: '2026-10-05-i12-adresses-en-clair-back-office', itemCount: 1 },
  // #3416 / #3419 / #3443 (lot W4, 04/10) — plan : quatre puces visibles puis « +N » ; centre d'approbation en démo ; Laura ne clôt plus sur une demande de compte.
  { id: '2026-10-04-w4-plan-puces-centre-approbation-cloture-laura', itemCount: 3 },
  // #3585 (04/10) — la mémoire collective passe dans le Pilotage ; la barre de famille de Comptes disparaît sur ordinateur.
  { id: '2026-10-04-memoire-collective-pilotage', itemCount: 2 },
  // #2773 / #2958 (lot E02, 04/10) — « Mes cibles » devient une source de séquence : audience lue, exclus nommés.
  { id: '2026-10-04-e02-sequence-depuis-une-cible', itemCount: 2 },
  // #2422.10 (#2869, lot E05 04/10) — le dépôt d'une pièce de contrat se fait depuis l'onglet Missions.
  { id: '2026-10-04-e05-deposer-une-piece-de-contrat', itemCount: 1 },
  // #3243 (lot E08, 04/10) — Laura challenge un interlocuteur de direction générale.
  { id: '2026-10-04-e08-laura-challenge-interlocuteur-trop-haut', itemCount: 1 },
  // #3231 (#219.8, lot E13, 04/10) — la relation déclarée d'un contact dit ce qu'elle autorise comme introduction et nomme le risque de collision.
  { id: '2026-10-04-e13-relation-declaree-introduction-et-collision', itemCount: 1 },
  // #2926 / #2770 (#2390.1, #2770.27, lot E01, 04/10) — chaque évènement de l'agenda dit sa nature ; le plan de Laura suit tes heures de travail.
  { id: '2026-10-04-e01-agenda-nature-des-evenements', itemCount: 3 },
  // #3419.1 (épopée #2947, lot E07, 04/10) — les variables d'un message portent valeur, source, date, confiance, usage externe.
  { id: '2026-10-04-e07-variables-du-message-annotees', itemCount: 1 },
  // #3295 (lot E07, 04/10) — une action peut suivre une règle apprise activée ; ses issues se comptent par règle.
  { id: '2026-10-04-e07-suivre-une-regle-apprise-et-mesurer', itemCount: 1 },
  // #3282 (lot E14, 04/10) — le comité nomme la première porte et les relations existantes.
  { id: '2026-10-04-e14-comite-premiere-porte-relations', itemCount: 1 },
  // #3289 (lot E14, 04/10) — un jour imposé aux relances de cadence, réglage d'espace.
  { id: '2026-10-04-e14-jour-impose-aux-relances', itemCount: 1 },
  // #3294 (lot E14, 04/10) — le maillon faible lit aussi les comptes ouverts qui ne tiennent que sur un contact.
  { id: '2026-10-04-e14-comptes-ouverts-non-etendus', itemCount: 2 },
  // #3390 / #3382 / #3384 / #3356 / #3398 / #3416 / #3419 / #3438 / #3563 / #3578 (lots X81 à X87, 03/10) — méthode et équipe lues par Laura, frise du compte, relances datées, autres accroches.
  { id: '2026-10-03-y25-methode-bu-frise-relances-accroches', itemCount: 6 },
  // #3578 / #3559 / #3243 (lot X79, 03/10) — démo prête après un déploiement, ligne de renouvellement cliquable, Laura sans redite.
  { id: '2026-10-03-x79-recette-y23-demo-prete-renouvellements-laura', itemCount: 4 },
  // #2927 (lot E04, 04/10) — « Partager avec l’équipe » : un contact personnel entre dans les contacts d’équipe, sur geste.
  { id: '2026-10-04-e04-partager-contact-personnel-avec-lequipe', itemCount: 1 },
  // #3440 / #3437 / #3420 / #3407 / #3551 / #3532 (lot X80, 03/10) — reliquats de la recette prod Y23.
  { id: '2026-10-03-x80-recette-y23-reliquats', itemCount: 6 },
  // #3420 / #3532 / #2927 (lot X76, 03/10) — reliquats de la recette démo : fiche Aumont, historique du compte, import Personnel.
  { id: '2026-10-03-x76-recette-demo-aumont-historique-import-personnel', itemCount: 6 },
  // #3533 / #3473 / #3490 / #3544 (lot X77, 03/10) — restes de la recette prod Y20-Y22.
  { id: '2026-10-03-x77-restes-de-la-recette-y20-y22', itemCount: 4 },
  // #3243 / #3218 / #2959 / #3294 / #3245 / #2979 / #3551 (lot X70, 03/10) — restes de la recette prod Y19.
  { id: '2026-10-03-x70-restes-de-la-recette-y19', itemCount: 8 },
  // #3437 / #3438 / #3440 / #3469 / #3482 / #3559 / #3565 (lot X71, 03/10) — séquences par étape, première frappe du chat, amorce de statut.
  { id: '2026-10-03-x71-sequences-par-etape-et-chat-sans-amorce', itemCount: 4 },
  // #3551 / #3274 / #3277 / #3294 (lot X64, 02/10) — restes de la recette prod Y15.
  { id: '2026-10-02-x64-restes-de-la-recette-y15', itemCount: 4 },
  // #3246 (lot X65, 02/10) — Laura cite un cas gagné et un cas perdu en démo ; l'absence de cas se nomme (ce qui a été regardé).
  { id: '2026-10-02-x65-cas-comparables-en-demo-et-absence-nommee', itemCount: 2 },
  // #3389 (lot X65, 02/10) — une reprise de veille échue passe parmi les cartes visibles d'Aujourd'hui.
  { id: '2026-10-02-x65-reprise-echue-en-tete-aujourdhui', itemCount: 1 },
  // #2979 (lot X65, 02/10) — les pastilles du filtre missions comptent ce que le clic montre.
  { id: '2026-10-02-x65-pastilles-missions-comptent-la-vue-active', itemCount: 1 },
  // #3243 (lot X65, 02/10) — le challenge « partenaire prospecté comme client » part enfin sur la fiche compte du chat ; une personne proposée est une fiche lue.
  { id: '2026-10-02-x65-laura-challenge-partenaire-sur-compte-esn', itemCount: 1 },
  // #3434 / #3420 / #3415 / #3384 / #3403 / #2297 (lot X68, 02/10) — reliquats de la recette prod Y18.
  // #3434 / #3384 / #3403 / #2927 / #2770 / #2297 (lot X73, 03/10) — reliquats de la recette prod Y20.
  { id: '2026-10-03-recette-x73-reliquats-y20', itemCount: 5 },
  { id: '2026-10-02-recette-x68-reliquats-y18', itemCount: 6 },
  // #3443 / #3398 / #3413 / #3416 / #3528 / #3551 (lot X37, 02/10) — restes de la recette prod Y12.
  { id: '2026-10-02-x37-restes-de-la-recette-y12', itemCount: 6 },
  // #2877 / #2926 / #2974 (lot X38, 02/10) — défauts vus en passant dans la recette prod Y12.
  { id: '2026-10-02-x69-reliquats-recette-y18', itemCount: 6 },
  { id: '2026-10-02-x38-recette-y12-defauts-vus-en-passant', itemCount: 5 },
  // #2877 (lot X38, 02/10) — l'onglet Mémoire de style lit ce que les messages de l'espace ont appris.
  { id: '2026-10-02-x38-ce-que-les-messages-ont-appris', itemCount: 1 },
  // #3274.1 / #3274.4 (lot X39, 02/10) — corpus méthode classé règle par règle ; les actions du plan et les relances portent leur règle.
  { id: '2026-10-02-x39-chaque-action-de-laura-porte-sa-regle-de-methode', itemCount: 2 },
  { id: '2026-10-02-x59-chaleur-du-lien-declaree', itemCount: 2 },
  { id: '2026-10-02-x59-niveaux-vendus-vs-seniorite-cherchee', itemCount: 2 },
  // #3225 / #3224 / #3444 / #3405 / #3229 / #3415 / #3563 / #3578 (lot X61, 02/10) — reliquats de la recette prod Y14.
  { id: '2026-10-02-recette-x61-reliquats-y14', itemCount: 7 },
  // #3224 (lot X36, 02/10) — chaque contrainte du fil porte son tour ; un conflit cite les deux contraintes et leur tour.
  { id: '2026-10-02-laura-nomme-le-tour-de-chaque-contrainte-en-conflit', itemCount: 1 },
  // #3262.20 / #3262.21 (épopée #3284, lot X47, 02/10) — la prochaine revue et les évènements de réactivation, dits par Laura.
  { id: '2026-10-02-x47-laura-dit-quand-revoir-ou-reactiver-un-compte', itemCount: 3 },
  // #3390.9 (lot X49, 02/10) — le bloc « Méthode » d'un besoin dit les actions en retard du commercial.
  { id: '2026-10-02-la-methode-dit-les-actions-en-retard', itemCount: 1 },
  // #3389.13 (lot X49, 02/10) — une veille dont la reprise prévue est échue remonte dans « Aujourd’hui ».
  { id: '2026-10-02-une-reprise-de-veille-echue-remonte-au-brief', itemCount: 1 },
  // #2979 (#2408.39, #2408.40, #2408.88, lot X52, 02/10) — filtre BU / agence sur /missions.
  { id: '2026-10-02-les-missions-se-filtrent-par-bu-ou-agence', itemCount: 1 },
  // #3473 / #3490 / #2770 / #3562.1 / #3419 / #3407 (lot X56, 02/10) — reliquats de la recette prod Y13.
  { id: '2026-10-02-lot-x56-recette-y13-reliquats', itemCount: 6 },
  // #3238 / #3551 / #3524 / #3527 / #3416 / #3398 (lot X24, 02/10) — restes de la recette prod Y8.
  { id: '2026-10-02-lot-x24-recette-y8-score-unique-et-relance-sur-le-brief', itemCount: 6 },
  // #3546 / #2986 / #3405 / #3282 / #3294 / #3408 / #3348 (lot X20, 02/10) — restes de la recette prod Y3.
  { id: '2026-10-02-x20-recette-y3-chat-par-compte-missions-comite', itemCount: 7 },
  // #3483 / #3544 / #3405 / #3532 / #3504 / #3505 / #3414 (lot X30, 02/10) — restes de la recette prod Y11.
  { id: '2026-10-02-x30-restes-de-la-recette-y11', itemCount: 6 },
  // #3550 / #3418 / #3487 / #3504 / #3471 / #3483 / #3488 / #3529 (lot X22, 02/10) — restes ÉCRAN de la recette prod Y3b.
  { id: '2026-10-02-x22-restes-ecran-de-la-recette-y3b', itemCount: 6 },
  // #3533 (lot X43, 02/10) — un fil de messagerie ou un rendez-vous sans objet ne s'affiche plus « (sans objet) » dans le briefing.
  { id: '2026-10-02-x43-briefing-sans-objet-ne-fait-aucune-ligne', itemCount: 1 },
  // #3533 / #3405 / #3505 / #3504 / #3483 / #3408 / #3414 (lot X08, 02/10) — l'absence se dit une fois, les répétitions se regroupent.
  { id: '2026-10-02-x08-restes-de-recette-lecture-sans-doublon', itemCount: 6 },
  // #3480 / #3488 / #3494 / #3513 / #3486 / #3471 (lot X04, 01/10) — restes de la recette prod.
  { id: '2026-10-01-x04-restes-de-recette', itemCount: 4 },
  // #3528.3 (lot D1, 02/10) — filtre « niveau de décision » dans le rail Découvrir.
  { id: '2026-10-02-decouvrir-filtre-par-niveau-de-decision', itemCount: 1 },
  // #3205.1 (lot D1, 02/10) — sous-domaines du compte lus dans les certificats publics (crt.sh), CNAME vers un prestataire connu.
  { id: '2026-10-02-les-sous-domaines-du-compte-revelent-ses-prestataires', itemCount: 1 },
  // #2130.102 (lot D1, 02/10) — l'onglet Accès nomme la contradiction Partenaires / Accès.
  { id: '2026-10-02-partenaires-et-acces-se-contredisent-nommement', itemCount: 1 },
  // #2380.11 (épopée #2974, lot Z16) — le constructeur d'audience choisit un événement.
  { id: '2026-10-02-laudience-propose-les-participants-dun-evenement', itemCount: 1 },
  // #3234 (#3211.11, lot Z17 02/10) — la réponse mesurée se coupe aussi par rôle de décision.
  { id: '2026-10-02-laura-lit-quel-role-repond', itemCount: 1 },
  // #2297.26 (lot Z06, 02/10) — la liste Contacts nomme un contact sous délai de protection d'enrichissement.
  { id: '2026-10-02-la-liste-nomme-les-contacts-enrichis-recemment', itemCount: 1 },
  // #2297 (lot X57, 02/10) — panneau de sélection : action d'enrichissement grisée sans objet, compteurs sans « 0 ».
  { id: '2026-10-02-recette-x57-enrichissement-grise-et-compteurs-sans-zero', itemCount: 4 },
  // #3419.2 (lot Z08, 02/10) — « vous utilisez telle technologie » bloqué tant que le compte ne la confirme pas.
  { id: '2026-10-02-une-technologie-affirmee-doit-etre-confirmee', itemCount: 1 },
  // #3407 / #3413 (lot Z09, 02/10) — plafond du Focus de l'espace ; entités du client sur la mission.
  { id: '2026-10-02-plafond-focus-et-autres-entites', itemCount: 2 },
  // #3285 (#3255, lot EP2 02/10) — le reçu de réponse nomme « ouverture de compte fermé ».
  { id: '2026-10-02-le-recu-nomme-louverture-de-compte-ferme', itemCount: 1 },
  // #2959 (lot EP5, 02/10) — la route du plan suit une relation déclarée ou un
  // partenaire déclaré en place.
  { id: '2026-10-02-la-route-du-plan-suit-une-relation-ou-un-partenaire-en-place', itemCount: 1 },
  // #2770 / #3490 / #2852 / #3473 / #3222 / #3562 (lot X26, 02/10) — restes de la recette prod Y9 : l'agenda se lit enfin pour le plan, les doublons se balaient.
  { id: '2026-10-02-recette-x26-agenda-du-plan-et-doublons', itemCount: 7 },
  // #2770.55-.62 / #2852 (lot X14, 02/10) — Laura organise la semaine ; ses lectures de pilotage nomment ce qu'elles n'ont pas pu lire.
  { id: '2026-10-02-laura-organise-ta-semaine', itemCount: 2 },
  // #3523 / #3524 / #3525 / #3526 / #3527 / #3528 / #3439 / #3238 (lot F1b, 02/10) — les restes de la recette prod du lot F1.
  { id: '2026-10-02-recette-f1b-restes-du-dossier-et-de-decouvrir', itemCount: 6 },
  // #3523 / #3524 / #3525 / #3526 / #3527 / #3528 / #3480 (lot F1, 02/10) — retours bêta de Louis : dossier compte, parcours, filtres Contacts, plafond Découvrir.
  { id: '2026-10-02-recette-f1-dossier-compte-contacts-et-decouvrir', itemCount: 5 },
  // #3486 / #3417 / #3418 / #3237 / #3408 / #3415 / #3296 (lot X31, 02/10) — reliquats de la recette prod Y11.
  { id: '2026-10-02-recette-x31-reliquats-y11', itemCount: 6 },
  // #3540 / #3486 / #3415 / #3288 / #3277 (lot X18, 02/10) — reliquats de la recette prod Y7.
  { id: '2026-10-02-recette-x18-reliquats-y7', itemCount: 5 },
  // #3540 / #3541 / #3486 / #3415 / #3397 (lot X11, 02/10) — chiffres sourcés, micro refusé, un seul verdict, tendance mesurée, lien Pilotage.
  { id: '2026-10-02-recette-x11-chiffres-sources-micro-et-pilotage', itemCount: 5 },
  // #3224 / #3406 / #3416 / #3443 (lot X12, 02/10) — phrase d'hypothèse nette, déclarant nommé, cartes terminées, appel à froid.
  { id: '2026-10-02-lot-x12-phrases-nom-et-cartes-terminees', itemCount: 4 },
  // #3455 / #3468 (recette prod 01/10/2026) — la conversation vocale montre le niveau du micro ; l'entrée en démo ne tourne plus sans fin.
  { id: '2026-10-02-le-micro-se-voit-et-la-demo-ne-tourne-plus-sans-fin', itemCount: 2 },
  // #3288 (épopée, lot EP1 02/10) — profondeur d'analyse à trois paliers.
  { id: '2026-10-02-trois-profondeurs-danalyse-au-choix', itemCount: 1 },
  // #3295 (épopée, lot EP1 02/10) — l'apprentissage contrôlé de bout en bout.
  { id: '2026-10-02-les-pertes-deviennent-des-regles-que-laura-connait', itemCount: 1 },
  // #3298.5 (#3271.12, partie proactive, lot EP1 02/10) — la proposition de masquer.
  { id: '2026-10-02-un-rituel-sans-effet-propose-de-se-masquer', itemCount: 1 },
  // #3289.29 (lot X46, 02/10) — la cadence de relance suit le jour appris par l'équipe.
  { id: '2026-10-02-la-cadence-suit-le-jour-appris', itemCount: 1 },
  // #3277 / #3243 (lot EP11, 02/10) — la stratégie 5P lit les missions et les ESN du compte ; Laura challenge une personne partie.
  { id: '2026-10-02-strategie-5p-sources-reelles', itemCount: 4 },
  // #3243 (#186.9, lot X48, 02/10) — Laura challenge une approche « client » visant une ESN, un cabinet ou une agence.
  { id: '2026-10-02-x48-laura-challenge-un-partenaire-prospecte-en-client', itemCount: 1 },
  // #3246 (#3210.1, lot X48, 02/10) — la comparaison de cas lit aussi les ESN partenaires en place.
  { id: '2026-10-02-x48-laura-compare-aussi-les-partenaires-en-place', itemCount: 1 },
  // Brief commercial « Ce que je sais » sur la fiche compte.
  // #3356 (LAU-UI-309, lot Z02, 02/10) — focus clavier uniforme sur les boutons de la barre de saisie.
  { id: '2026-10-02-z02-barre-de-saisie-focus-clavier-uniforme', itemCount: 1 },
  // #3356 (lot X27, 02/10) — le bouton de portée d'une pièce jointe porte le focus partagé.
  { id: '2026-10-02-x27-portee-piece-jointe-focus-clavier', itemCount: 1 },
  // #3473 (lot Z02, 02/10) — la raison du rang d'une entité d'accès se dit dans la langue de l'écran.
  { id: '2026-10-02-z02-la-raison-du-rang-dune-entite-se-traduit', itemCount: 1 },
  // #3486 — « Pourquoi ? » d'un parcours se lit tout de suite sur la fiche.
  { id: '2026-10-02-pourquoi-se-lit-dun-coup-doeil', itemCount: 1 },
  { id: '2026-10-01-le-brief-ce-que-je-sais', itemCount: 1 },
  // #3516 / #3503 (lot Z01, 01/10).
  { id: '2026-10-01-z01-dossier-barre-sous-le-header', itemCount: 2 },
  // #3464 / #3473 / #3508 / #3414 / #3416 / #3406 — lot X03 : restes de la recette prod du 01/10 soir.
  { id: '2026-10-01-recette-x03-restes-de-la-recette-du-soir', itemCount: 4 },
  // Lot X02 (#3408, #3238, #3483, #3504, #3505, #2953) — restes de la recette prod du 01/10 : comptes, découverte, missions.
  { id: '2026-10-01-recette-x02-comptes-decouverte-missions', itemCount: 5 },
  // #3224, #3236 (lot W05, 01/10) — Laura relève deux contraintes qui se contredisent avant de chercher ; un tour Approfondi à court de budget laisse une reprise.
  { id: '2026-10-01-laura-releve-les-conflits-de-contraintes', itemCount: 2 },
  // #2843 (#2398.2) — routine recruteur « vivier dormant ».
  { id: '2026-10-01-routine-vivier-dormant', itemCount: 1 },
  // #2985 — la revue manager de Laura : verdict à raisons comptées, faits importants, décisions en attente.
  { id: '2026-10-01-revue-manager-verdict-et-decisions', itemCount: 2 },
  // #2882 / #3215 / #2983 (lot W02, 01/10) — le mode de recherche dit ce qu'il fait, Laura signale l'absence de preuve, la relève du pack interne.
  { id: '2026-10-01-le-mode-de-recherche-dit-ce-quil-fait', itemCount: 3 },
  // #3405 / #3439 (lot W01, recette prod 01/10) — l'historique du compte sans doublon, les faits obligatoires d'une séquence se confirment.
  { id: '2026-10-01-historique-sans-doublon-et-faits-a-confirmer', itemCount: 2 },
  // #3488 / #3489 / #3486 / #3480 / #3494 / #3471 / #3492 / #3513 (lot U07, 01/10).
  { id: '2026-10-01-u07-vivier-verdicts-et-ecrans-finis', itemCount: 4 },
  // #3483.3a / #3354 / #3421 / #3504 / #3505 — lot U02 : restes de la recette prod du 01/10.
  { id: '2026-10-01-recette-u02-restes-de-recette-prod', itemCount: 5 },
  // Lot U03 (#3428, #3392, #2953, #3293) — recette prod du 01/10 : le sprint de Laura, la checklist de sortie, la stratégie du compte.
  { id: '2026-10-01-laura-propose-le-sprint-et-la-checklist-se-lit-une-fois', itemCount: 3 },
  // #3225 — la mémoire marché d'un groupe se lit entité par entité.
  { id: '2026-10-01-laura-lit-chaque-filiale-une-par-une', itemCount: 1 },
  // #3291 (reste de #3269) — les jalons de delivery se lisent en liste, les jalons pas commencés se replient.
  { id: '2026-10-01-jalons-de-delivery-lisibles', itemCount: 1 },
  // #3511 / #3508 / #3509 / #3510 / #3404 / #3238 (lot U05, recette démo 01/10) — la salle de démonstration.
  { id: '2026-10-01-demo-session-et-recette', itemCount: 4 },
  // #3512 / #3408 (lot U06, 01/10) — Découvrir lit « développeurs Python » comme un profil recherché, pas un nom ; le périmètre conseillé se remplit.
  { id: '2026-10-01-decouvrir-lit-le-profil-recrute', itemCount: 2 },
  // #3427 (V04, 01/10) — la bibliothèque d'exemples se remplit dans un espace réel.
  { id: '2026-10-01-la-bibliotheque-se-remplit-dans-ton-espace', itemCount: 3 },
  // #3487, #3401 (recette 01/10) — l'employeur obsolète se lit aussi dans « Utilité commerciale », qui propose la question à poser.
  { id: '2026-10-01-utilite-commerciale-question-a-poser', itemCount: 3 },
  // #3389.13 (lot V06, 01/10) — une mise en veille porte sa date de reprise prévue.
  { id: '2026-10-01-une-veille-porte-sa-date-de-reprise', itemCount: 2 },
  // #3389.9/.10 (lot V06, 01/10) — le verdict du besoin lit le cadre d'achat et le risque contractuel.
  { id: '2026-10-01-le-verdict-lit-achats-et-risque', itemCount: 2 },
  // #3499 — finitions de la synthèse d'un compte (recette du 01/10).
  { id: '2026-10-01-synthese-du-compte-finitions', itemCount: 2 },
  // #3486, #3487 (recette 01/10) — verdict et recommandation d'un besoin sur la même source ; un seul CTA et un employeur obsolète nommé sur la fiche contact.
  { id: '2026-10-01-un-seul-verdict-un-seul-bouton-sur-les-fiches', itemCount: 3 },
  // #3488, #3490 — un vivier « vide » qui cache des archivés, et les comptes au nom quasi identique se proposent en rattachement.
  { id: '2026-10-01-vivier-archives-et-comptes-en-double', itemCount: 2 },
  // #3427 (Z04, 02/10) — Laura nomme chaque modèle écarté, ceux bloqués par la règle absolue d'abord.
  { id: '2026-10-02-laura-nomme-les-modeles-ecartes', itemCount: 1 },
  // #3492 / #3494 / #3480 / #3465 — finitions de recette : rien n'est coupé, rien ne saute, rien n'est recouvert.
  { id: '2026-10-01-lecrans-ne-se-coupent-plus-et-ne-sautent-plus', itemCount: 4 },
  // #3499 — la synthèse d'un compte se comprend en un scroll (retour Louis + Théo, 01/10).
  // #3475 / #3473 / #3471 (lot T06, 01/10) — squelette Pilotage, statut unique des ESN, sélection Contacts.
  { id: '2026-10-01-pilotage-et-contacts-sans-ecran-noir-ni-tableau-masque', itemCount: 3 },
  { id: '2026-10-01-la-synthese-du-compte-en-un-scroll', itemCount: 3 },
  // #3470, #3467, #3468, #3480 — finitions de la recette du 30/09.
  { id: '2026-09-30-quatre-finitions-de-recette', itemCount: 4 },
  // #3427 / #3415 / #3395 (lot K03, 30/09) — bibliothèque d'exemples lisible, lecture des indicateurs, verdicts traduits.
  { id: '2026-09-30-la-bibliotheque-se-lit-et-les-verdicts-se-traduisent', itemCount: 3 },
  // #3219 (#190.1/#190.2) — la carte Sources et confiance nomme les contradictions de champ et leur date de revérification.
  { id: '2026-09-30-les-contradictions-de-champ-sur-le-dossier', itemCount: 2 },
  // #3215 (#3175.3) — Laura route « challenger un compte » et « comprendre un écosystème » vers de vrais outils.
  { id: '2026-09-30-laura-reconnait-challenger-et-ecosysteme', itemCount: 2 },
  // #3218 (#189.1/#189.7) — Laura enchaîne les niveaux d'approfondissement et s'arrête quand un passage n'apporte plus rien.
  { id: '2026-09-30-laura-approfondit-toute-seule', itemCount: 2 },
  // #2414.41/.42 (épopée #2986) — un besoin ouvert compatible démarre le repositionnement.
  { id: '2026-09-30-un-besoin-ouvert-demarre-le-repositionnement', itemCount: 1 },
  // Dossier 7 de la démo (30/09) — tout le relevé Groupe BPCE.
  { id: '2026-09-30-le-compte-groupe-bpce-entier-en-demo', itemCount: 2 },
  // #3241 (lot P11, 30/09) — réparation active : la limite s'ajoute à la réponse.
  { id: '2026-09-30-laura-ajoute-la-limite-quand-elle-sest-trop-avancee', itemCount: 2 },
  // #3243/#3242 (lot P11, 30/09) — Laura challenge un compte exclu, périmé ou pas encore une cible.
  { id: '2026-09-30-laura-challenge-un-compte-exclu-ancien-ou-pas-encore-cible', itemCount: 3 },
  // #3237 (#3203.4) — six axes du delivery fit lus dans le texte des offres.
  { id: '2026-09-30-delivery-fit-lit-langues-fuseaux-securite-et-statut', itemCount: 1 },
  // #3211.9 (épopée #3234) — Laura redemande le résultat d'une action échue.
  { id: '2026-09-30-laura-redemande-le-resultat-des-actions-echues', itemCount: 1 },
  // #3245 (reste de #3209.6, lot P13 30/09) — le profil de pari se déclare et Laura nomme un portefeuille trop homogène.
  { id: '2026-09-30-le-profil-de-pari-se-declare', itemCount: 2 },
  // #3408 (lot J05, 30/09) — Découvrir : périmètre conseillé, risque et première action sur chaque carte.
  { id: '2026-09-30-decouvrir-explique-perimetre-risque-action', itemCount: 1 },
  // #3416 (lot J05, 30/09) — l'issue choisie sur une action se lit sur la ligne et met à jour le contact et le board du compte.
  { id: '2026-09-30-lissue-choisie-se-propage-et-se-lit', itemCount: 2 },
  // #3414 (lot J05, 30/09) — « Lire comme » : la salle de démonstration lit le brief dans l'ordre d'un autre rôle.
  { id: '2026-09-30-lire-le-brief-comme-un-recruteur', itemCount: 1 },
  { id: '2026-09-30-declarer-la-relation-dun-contact-avec-son-entreprise', itemCount: 1 },
  { id: '2026-09-30-laura-compare-des-scenarios-par-ce-qui-change', itemCount: 1 },
  { id: '2026-09-30-un-verdict-se-rattache-a-la-version-de-la-memoire-marche', itemCount: 1 },
  // #2957 (#2180.53, lot Q05, 30/09) — un import d'appel d'offres interrompu
  // se reprend ou s'abandonne depuis l'écran d'import.
  { id: '2026-09-30-un-import-dappel-doffres-interrompu-se-reprend', itemCount: 1 },
  // #3393 / #3382 (lot Q05, 30/09) — Laura répond d'abord à « qui est le DSI
  // de… », et les contradictions entre sources de méthode sont tranchées.
  { id: '2026-09-30-laura-repond-dabord-puis-signale-le-second-sujet', itemCount: 2 },
  // #3420 (lot Q06, 30/09) — huit critères de qualité d’un message lus sur le contexte : destinataire, scénario, périmètre, prochaine étape, historique, séquence, longueur, rendez-vous.
  { id: '2026-09-30-le-controle-des-messages-lit-le-contexte', itemCount: 2 },
  // #3423.7 (lot Q06, 30/09) — une correction de rôle posée sur la carte d’influence atteint aussi l’onglet Contacts.
  { id: '2026-09-30-un-role-corrige-sur-la-carte-suit-dans-contacts', itemCount: 1 },
  // #3229 (lot Q06, 30/09) — la couverture d’une liste de contacts construite sur les résultats réels ; la mémoire consultée ne se répète plus.
  { id: '2026-09-30-la-couverture-dune-recherche-de-contacts-se-lit', itemCount: 2 },
  // #3421 (lot Q06, 30/09) — le détail d’une séquence dit ce qui l’arrête.
  { id: '2026-09-30-une-sequence-dit-sa-condition-darret', itemCount: 1 },
  // #3402 / #3403 / #3404 / #3405 / #3407 (lot J04, recette 30/09) — la fiche compte et le portefeuille.
  { id: '2026-09-30-fiche-compte-et-portefeuille-restes', itemCount: 5 },
  // #2204.7/.15 (lot P04, 30/09) — le composer accepte un périmètre visé et
  // des contraintes de forme, chacun rendu à sa place dans le prompt.
  { id: '2026-09-30-le-composer-accepte-un-perimetre-et-des-contraintes', itemCount: 1 },
  // #2959 (lot P04, 30/09) — la route du plan suit un sponsor nommé ou un
  // manager joignable du dossier.
  { id: '2026-09-30-la-route-du-plan-suit-un-sponsor-ou-un-manager-nomme', itemCount: 1 },
  // #2204.21 (lot P04, 30/09) — « valider un contexte » : un quatorzième
  // objectif de message, qui fait CONFIRMER une hypothèse.
  { id: '2026-09-30-valider-un-contexte-objectif-de-message', itemCount: 1 },
  // #2204.59-.65 (lot P04, 30/09) — créer un style de message directement,
  // sans passer par l'import d'un exemple.
  { id: '2026-09-30-creer-un-style-de-message-sans-import', itemCount: 1 },
  // #2972 (lot P04, 30/09) — l'escalade d'un relevé CRA nomme aussi l'ADV
  // (le contact de facturation), le partenaire du consultant en
  // sous-traitance et son niveau : les cinq champs sont dits.
  { id: '2026-09-30-lescalade-cra-nomme-ladv-le-partenaire-et-son-niveau', itemCount: 1 },
  // #2926 (#2390.16) — un évènement privé reste un créneau « Indisponible ».
  { id: '2026-09-30-agenda-evenement-prive-indisponible', itemCount: 1 },
  // #2429.4/.9 (épopée #2852, lot P07, 30/09) — un plan de Laura se modifie dans le chat ; chaque modification crée une version, le texte d’origine reste.
  { id: '2026-09-30-un-plan-de-laura-se-modifie-en-gardant-ses-versions', itemCount: 1 },
  // #2190.3 (épopée #2818, lot P07, 30/09) — « Chercher hors vivier » commence par les recommandations du réseau (fiches cooptées non relues).
  { id: '2026-09-30-chercher-hors-vivier-commence-par-le-reseau', itemCount: 1 },
  // #1952.3/.7 (épopée #2844, lot P07, 30/09) — Laura propose de lancer en tâche de fond un matching massif ou une recherche hors vivier ; le clic lance.
  { id: '2026-09-30-laura-propose-de-lancer-un-matching-massif-ou-une-recherche-hors-vivier', itemCount: 1 },
  // #2265.5/.7 (épopée #2851, lot P07, 30/09) — un compte partenaire déclaré ou une source de données se nomme, sur les listes, la fiche et Découvrir.
  { id: '2026-09-30-un-partenaire-ou-une-source-de-donnees-se-nomme', itemCount: 1 },
  // #3289 (suivi #3264.41, lot P09 30/09) — une règle méthode contredite par l'espace n'est plus citée.
  { id: '2026-09-30-laura-ne-cite-plus-une-regle-que-ton-equipe-a-contredite', itemCount: 1 },
  // #3287 (#3265.2, lot P09 30/09) — origine, règle, arrêt et exécution externe d'une action.
  { id: '2026-09-30-une-action-dit-dou-elle-vient-et-quand-elle-sarrete', itemCount: 2 },
  // #3289 (#3264.31/.32/.33, lot P09 30/09) — le créneau d'envoi appris par l'espace.
  { id: '2026-09-30-le-creneau-que-ton-equipe-a-appris', itemCount: 2 },
  // #3246.3 (lot P10, 30/09) — la comparaison de cas gagnés/perdus gagne cinq critères structurés.
  { id: '2026-09-30-laura-compare-plus-de-criteres-entre-tes-cas', itemCount: 3 },
  // #2770.63/.64/.65 (lot F02, 30/09) — la mesure post-bloc du plan de
  // journée : réalisé, interrompu ou reporté, un clic déclaré sur un bloc
  // déjà confirmé.
  { id: '2026-09-30-le-chat-tient-ta-saisie-ton-clic-et-ta-voix', itemCount: 4 },
  { id: '2026-09-30-le-plan-de-journee-mesure-un-bloc', itemCount: 1 },
  // #2770.52 (lot R03, 30/09) — l'annulation d'un bloc du plan de journée
  // réellement créé (bouton « Annuler »), livrée sans entrée de changelog ce
  // jour-là ; ajoutée ici pour tenir la convention (craft rule n°9).
  // #3261.15 (#3293, lot Q04) — les listes de noms des cartes du compte se
  // plafonnent à 5 avec « +N autres » (la colonne RH faisait 1148 px).
  { id: '2026-09-30-les-longues-listes-de-la-carte-colonnes-se-replient', itemCount: 1 },
  // #3262.24 (#3284, lot Q04) — la carte « sans mouvement » passe avant les
  // cartes d'hygiène et se voit en salle de démo.
  { id: '2026-09-30-la-carte-sans-mouvement-passe-avant-lhygiene', itemCount: 1 },
  // #2770.66/.67 (lot Q04) — le résultat libre et la durée réelle, déclarés.
  { id: '2026-09-30-un-bloc-du-plan-garde-son-resultat-et-sa-duree', itemCount: 1 },
  { id: '2026-09-30-annuler-un-bloc-du-plan-de-journee', itemCount: 1 },
  // #2843 (#2398.6/#2398.14) — la fiche d'une routine nomme désormais sa
  // condition d'arrêt, quand elle est connue.
  { id: '2026-09-30-la-routine-dit-quand-elle-sarrete', itemCount: 1 },
  // #2395.8 (épopée #2871), seconde moitié — une tâche demande désormais son
  // résultat attendu à la création, comme elle demandait déjà son objectif.
  { id: '2026-09-30-une-tache-demande-son-resultat-attendu', itemCount: 1 },
  // #2957 (#2180.54, lot F06, 30/09) — le fichier source d'un appel d'offres
  // importé se conserve désormais et se ré-ouvre depuis le dossier.
  { id: '2026-09-30-le-document-source-dun-appel-doffres-se-conserve', itemCount: 1 },
  // #3392/#3428 (lot G01, reste de recette prod 30/09) — le sprint 10 dont 3
  // se voit désormais à l'écran (carte dédiée), et le lien vers Découvrir
  // conserve le filtre région.
  { id: '2026-09-30-le-sprint-de-comptes-se-voit-a-lecran', itemCount: 2 },
  // #3424 (reste, lot G03, 30/09) — les garde-fous du serveur MCP deviennent visibles sur /settings/mcp.
  { id: '2026-09-30-les-garde-fous-mcp-se-voient', itemCount: 1 },
  // #3261.15 (épopée #3293, lot I01 30/09) — la carte Colonnes du compte gagne
  // une colonne RH, sur le titre du contact.
  { id: '2026-09-30-colonne-rh-du-dossier-compte', itemCount: 1 },
  // #3262.24 (épopée #3284, lot I01 30/09) — la bande de pilotage nomme les
  // comptes actifs (file exécution) sans mouvement récent.
  { id: '2026-09-30-pilotage-comptes-actifs-sans-mouvement', itemCount: 1 },
  // #3206.3 (épopée #3240, reste du 30/09) — un signal remplacé par une
  // analyse plus récente se distingue enfin dans la Watchlist.
  { id: '2026-09-30-un-signal-remplace-se-distingue-dans-la-watchlist', itemCount: 1 },
  // #3204.7 (épopée #3238, reste du 30/09) — l'expansion d'équipe et le
  // remplacement probable atteignent enfin l'écran Découvrir.
  { id: '2026-09-30-decouvrir-signale-une-expansion-ou-un-remplacement', itemCount: 1 },
  // #3204.2 (épopée #3238, reste du 30/09) — une offre Découvrir nomme la
  // ville exacte de son site, distincte du nom déjà résolu de l'entreprise.
  { id: '2026-09-30-une-offre-decouvrir-nomme-sa-ville', itemCount: 1 },
  // #3291 (lot I03, 30/09) — le board d'effort propose la route partenaire
  // dès qu'un partenaire est lié, sans rien écrire au journal des bascules.
  { id: '2026-09-30-le-board-deffort-suggere-la-route-partenaire', itemCount: 1 },
  // #3291 (lot I03, 30/09) — le CRA d'une mission se lit désormais depuis le
  // relevé du mois précédent, au lieu de rester "non évaluable".
  { id: '2026-09-30-le-jalon-cra-se-mesure', itemCount: 1 },
  // #3388 (recette 30/09, lot J02) — le stade commercial canonique se voit
  // désormais au Vivier et dans le Journal d'activité, comme sur Projets,
  // Besoins et Missions.
  { id: '2026-09-30-le-stade-commercial-se-voit-au-vivier-et-dans-actions', itemCount: 2 },
  // #3390 (recette 30/09, lot J02) — la méthode de Laura affiche désormais sa
  // condition de bascule et sa condition d'arrêt, pas seulement ses six
  // premiers champs.
  { id: '2026-09-30-la-methode-de-laura-montre-sa-bascule-et-son-arret', itemCount: 1 },
  // #3263.17 (reste de #3282) — la relation réseau connue se voit sur le siège du comité.
  { id: '2026-09-30-le-comite-dachat-nomme-la-relation-connue', itemCount: 1 },
  // #3474 (lot J08, 30/09) — Laura ne mélange plus une reprise de travail avec une question neuve.
  { id: '2026-09-30-laura-ne-mele-plus-une-reprise-a-une-question-neuve', itemCount: 1 },
  // #3475 (lot J08, 30/09) — Pilotage affiche sa coque et des cartes dès l'ouverture.
  { id: '2026-09-30-pilotage-se-montre-sans-attendre', itemCount: 1 },
  // #3348 (LAU-FINAL-258, recette prod 30/09, lot J09) — un besoin dont le
  // démarrage attendu est passé est désormais reconnu comme périmé au MÊME
  // endroit que Laura et que l'écran des besoins ouverts.
  { id: '2026-09-30-laura-et-lecran-des-besoins-disent-la-meme-date-perimee', itemCount: 1 },
  // #3419/#3420 (lot C16, 30/09) — vérification factuelle et contrôle qualité avant validation.
  { id: '2026-09-30-un-message-trop-affirmatif-ou-trop-generique-se-bloque', itemCount: 2 },
  // #3391/#3392/#3393 (retour bêta 30/09) — Laura challenge un volume de
  // recherche irréaliste et signale la question métier qu'elle soupçonne
  // derrière ta demande.
  { id: '2026-09-30-laura-challenge-le-volume-et-la-question-cachee', itemCount: 2 },
  // #2926 (#2390.4/#2390.17) — un rendez-vous client sans tâche de préparation
  // ouverte en reçoit désormais une, dans le plan du compte concerné.
  { id: '2026-09-30-un-rendez-vous-sans-preparation-recoit-une-tache', itemCount: 1 },
  // #2448.8 / #2882.11 (épopée #2882) — Vérifié/Approfondi annoncent coût et durée avant de lancer.
  { id: '2026-09-30-verifie-et-approfondi-annoncent-leur-cout-et-duree', itemCount: 1 },
  // #213.2 (#3207, épopée #3228) — le contrat de comptage (dédup, résolution
  // d'identité, seuil de confidentialité) obtient sa carte dans le chat.
  { id: '2026-09-30-un-comptage-se-voit-avec-sa-deduplication', itemCount: 1 },
  // #3269.3/#3269.4 (suite #3291) — un jalon de delivery confirmé nomme la
  // boucle (signal/action) qu'il pourrait alimenter.
  { id: '2026-09-30-un-jalon-confirme-nomme-la-boucle-quil-alimente', itemCount: 1 },
  // #3272.6 (reste de #3295) — Laura cite le REX de perte déjà connu d'un compte.
  { id: '2026-09-30-laura-cite-le-rex-de-perte-du-compte', itemCount: 1 },
  // #3253.b (reste de #3294) — la carte du maillon faible nomme aussi ce qui la nuance.
  { id: '2026-09-30-le-maillon-faible-nomme-ce-qui-le-nuance', itemCount: 1 },
  // #3258.15 (épopée #3362, lot E25 30/09) — la comparaison structurée de
  // 2 à 5 comptes montre désormais la matrice intérêt × pénétrabilité de
  // chacun, la même que sur sa fiche.
  { id: '2026-09-30-comparer-des-comptes-sur-la-matrice', itemCount: 1 },
  // #2843 (#2205.45) — le plafond de destinataires de la routine relances,
  // distinct de la cible calculée, réglable de 1 à 5 par passage.
  { id: '2026-09-30-la-relance-choisit-son-plafond-par-passage', itemCount: 1 },
  // #2395.8 (épopée #2871) — une tâche demande désormais son objectif à la création.
  { id: '2026-09-30-une-tache-demande-son-objectif', itemCount: 1 },
  // #3381 — la recherche du dossier rejoint la ligne d'Acquisition.
  { id: '2026-09-30-recherche-dossier-sur-la-ligne-acquisition', itemCount: 1 },
  { id: '2026-09-30-demo-appareil-deconnecte', itemCount: 1 },
  // #3390 (lot C03) — le verdict GO/NO-GO d'un besoin choisit désormais une
  // méthode (effort, route d'ouverture, trajectoire, action suivante) avant
  // tout message, affichée sur la fiche besoin.
  { id: '2026-09-30-le-verdict-dun-besoin-choisit-sa-methode', itemCount: 1 },
  // #3395.1 (recette prod 30/09/2026) — la carte verdict nomme la route
  // recommandée et la personne utile maintenant.
  { id: '2026-09-30-le-verdict-nomme-la-route-et-le-contact', itemCount: 1 },
  // #3394.2/.4 (recette prod 30/09/2026) — Laura pose deux précisions au plus,
  // et sait laquelle demander en premier quand plusieurs manquent.
  { id: '2026-09-30-laura-pose-moins-de-questions-et-dans-lordre', itemCount: 1 },
  // #3400/#3401 (lot C07 du 30/09) — la fiche contact sépare le rôle de
  // décision et explique l'utilité commerciale de chaque contact recommandé.
  { id: '2026-09-30-la-fiche-contact-explique-son-utilite', itemCount: 3 },
  // #3411 (retour bêta #3411) — Laura distingue désormais les deux sens de
  // « prospection inversée » avant de répondre.
  { id: '2026-09-30-laura-distingue-les-deux-prospections-inversees', itemCount: 1 },
  // #3406 (retour bêta #3406) — capitaliser une information terrain remontée
  // par un consultant, avec consentement, provenance et veto par information.
  { id: '2026-09-30-capitaliser-une-information-terrain', itemCount: 1 },
  // #3406.reste (recette prod 30/09) — le formulaire montre désormais qui
  // enregistre et quand, avant même de valider ; Annuler efface la saisie
  // comme Échap (même chemin de fermeture).
  { id: '2026-09-30-le-formulaire-terrain-montre-qui-et-quand', itemCount: 1 },
  // #3417.reste/#3418.reste (recette prod 30/09, « NON PROUVABLE ») —
  // « Préparer la première approche »/« Préparer une reprise » ouvrent
  // maintenant le composeur au lieu de seulement défiler jusqu'à une carte
  // d'amorces qui n'y menait pas.
  { id: '2026-09-30-preparer-ouvre-desormais-le-composeur', itemCount: 1 },
  // #3410.10/.11/.13/.14 (retour bêta #3410) — quatre préférences nouvelles
  // sur la fiche consultant : types de clients préférés, clients refusés,
  // environnements à éviter, conditions non négociables.
  { id: '2026-09-30-quatre-preferences-neuves-sur-la-fiche-consultant', itemCount: 1 },
  // #3416.1 (beta-feedback #3416, lot C14 30/09) — quatre issues manquantes à
  // la complétion d'une action : bloqué par les achats, bloqué par la marge,
  // erreur technique, abandonné.
  { id: '2026-09-30-quatre-nouvelles-issues-dactions', itemCount: 1 },
  // #3415.2/#3415.1 (beta-feedback #3415, lot C14 30/09) — seuil/cause/
  // décision/responsable sur un maillon de la chaîne qui décroche, et un
  // nouvel indicateur de croissance pour la vue Fondateur.
  { id: '2026-09-30-pilotage-nomme-la-cause-dun-decrochage', itemCount: 1 },
  // #3441/#3442/#3444/#3445 (lot C20 du 30/09/2026) — la bibliothèque de
  // contenu approuvé (emails, scripts d'appel, objections, pitchs), citable
  // verbatim par Laura dans le chat.
  { id: '2026-09-30-laura-cite-la-bibliotheque-de-contenu-approuve', itemCount: 1 },
  // #3402 — la carte d'influence devient des trajectoires commerciales : par
  // le haut, par le terrain, par un manager intermédiaire, en parallèle.
  { id: '2026-09-30-des-trajectoires-commerciales-plutot-quun-organigramme', itemCount: 2 },
  // #3403 — l'onglet Accès du compte montre désormais PAR QUI on entre (un
  // ancien collègue, un consultant déjà en poste, un partenaire en rang 2…),
  // jamais garanti sans confirmation.
  { id: '2026-09-30-les-voies-dacces-personnelles-du-compte', itemCount: 3 },
  // #3371/#3372/#3373/#3374 — parcours du compte en une ligne + modale ; la
  // rangée d'en-tête n'écrase plus ses bandes.
  { id: '2026-09-30-laura-second-passage-automatique', itemCount: 1 },
  { id: '2026-09-30-entete-compte-parcours-sur-une-ligne', itemCount: 1 },
  // #3183.11 (recette prod 29-30/09, LAU-FINAL-189) — quand Laura relance une
  // recherche pour approfondir une première réponse, le panneau « Contexte
  // utilisé » le prouve désormais avec le nombre réel de passages effectués.
  { id: '2026-09-30-lapprofondissement-se-prouve', itemCount: 1 },
  // #3298 (reste, recette prod 30/09) — le verdict « pas encore mesurable »
  // (moins de 3 photos mensuelles) restait sans écran : seul « sans effet »
  // s'affichait, invisible pour la quasi-totalité des espaces récents.
  { id: '2026-09-30-un-rituel-pas-encore-mesurable-le-dit', itemCount: 1 },
  // #3271.8 reste (épopée #3298) — « Créer une action » depuis un rituel tague la
  // tâche ; le rituel dit combien d'actions il a produites, sans troisième journal.
  { id: '2026-09-30-un-rituel-compte-les-actions-quil-a-creees', itemCount: 1 },
  // #2387.7 (épopée #2767) — « En attente des autres » liste aussi les profils
  // envoyés au client restés sans retour, en plus des fils de messagerie.
  { id: '2026-09-30-en-attente-des-autres-montre-les-profils-sans-retour', itemCount: 1 },
  // #2297.26 (LAU-FINAL-038) — l'aperçu d'un enrichissement de lot annonce
  // maintenant les contacts déjà enrichis récemment (cooldown serveur) qui
  // ne partiront pas, avec leur nombre — comme les deux autres raisons
  // d'exclusion déjà annoncées.
  { id: '2026-09-30-enrichissement-de-lot-annonce-le-cooldown', itemCount: 1 },
  // #3270.6 (BEL-SC-241, SURFACES) — la fiche Compte montre désormais le
  // statut de gouvernance rang 2 d'une ESN, quand elle porte une relation
  // partenaire du même nom — en lecture seule, sans fondre les deux objets.
  { id: '2026-09-30-la-fiche-compte-montre-le-cadre-partenaire', itemCount: 1 },
  // #3340 (LAU-FINAL-250, retour bêta 29/09) — un consultant décrit par
  // morceaux, sans CV, obtient désormais un brief provisoire à l'écran plutôt
  // qu'une réponse qui n'en montrait qu'une partie.
  { id: '2026-09-30-le-brief-consultant-provisoire-se-voit-a-lecran', itemCount: 1 },
  // #2974 (lot E3, #2380.55/.65/.13) — plafond par canal, boîtes personnelles écartées, source partenaires.
  { id: '2026-09-30-laudience-ecarte-les-boites-personnelles', itemCount: 2 },
  // #1952.6 (épopée #2844) — l'export du vivier en lot (sans plafond de
  // lignes) devient cliquable depuis le vivier, à côté de l'export ATS.
  { id: '2026-09-29-exporter-le-vivier-en-lot', itemCount: 1 },
  // #3258.13 (épopée #3362, lot P01) — Pilotage montre désormais le
  // portefeuille de la matrice intérêt × pénétrabilité : combien de comptes
  // sont en priorité immédiate, route longue, test court ou no-go/veille.
  { id: '2026-09-29-pilotage-montre-le-portefeuille-interet-penetrabilite', itemCount: 1 },
  // #3272 (reste de #3295) — les dix derniers champs du REX de perte.
  { id: '2026-09-29-le-rex-de-perte-a-ses-dix-derniers-champs', itemCount: 1 },
  // #3265.13 (épopée #3287) — sur « Aujourd'hui », la carte d'un compte
  // montre désormais son dernier résultat déclaré, quand une action faite en
  // porte un.
  { id: '2026-09-29-la-carte-daujourdhui-montre-le-dernier-resultat-du-compte', itemCount: 1 },
  // #3262.23 (épopée #3284, lot P05 29/09) — Laura sait dire qu'un compte
  // Focus traîne, avec le nombre de jours et une recommandation de sortie —
  // jamais un compteur d'actions inventé.
  { id: '2026-09-29-laura-dit-quand-un-compte-focus-traine', itemCount: 1 },
  // #3258.16/.17/.18 (épopée #3362) — la carte matrice intérêt × pénétrabilité
  // d'un compte porte désormais trois interrupteurs de simulation, jamais
  // enregistrés : avec un partenaire, avec une nouvelle référence, sur une
  // filiale plutôt que le groupe.
  { id: '2026-09-29-simuler-un-levier-sur-la-matrice-du-compte', itemCount: 1 },
  // #2926 (reste R05/R06) — en vue semaine, une carte de rendez-vous ne
  // s'ouvrait au clic d'aucune façon ; elle mène désormais au pré-brief ou,
  // sur un conflit, à la boîte de conflit — mêmes écrans qu'en vue jour.
  { id: '2026-09-29-la-carte-de-la-semaine-souvre-au-clic', itemCount: 1 },
  // #2974 (#2380.53) — plafond de fréquence PAR CONTACT dans le constructeur d'audience.
  { id: '2026-09-29-laudience-de-campagne-plafonne-aussi-par-contact', itemCount: 1 },
  // #3298 (suite #3271.11, .12, .8) — un rituel sans effet mesurable le dit, et sa dernière tenue se marque d'un geste.
  { id: '2026-09-29-un-rituel-dit-sil-sert-encore', itemCount: 2 },
  // Chantier perf « pages lentes » — moins d'appels au démarrage, Laura chargée après la page, lectures serveur regroupées.
  { id: '2026-09-29-des-pages-plus-rapides', itemCount: 3 },
  // #3296 (#3257.7b, #3257.8, #3257.4) — la carte du board d'effort montre la vraie
  // prochaine action (avec son lien), la route partenaire nomme son partenaire, et
  // veille / route partenaire ont leurs mouvements nommés.
  { id: '2026-09-29-le-board-deffort-montre-la-vraie-prochaine-action', itemCount: 3 },
  // #2974 (#2380.8 .12 .54 .56 .61) — sources import/dormants, plafonds de fréquence, motif d'arrêt.
  { id: '2026-09-29-laudience-de-campagne-a-deux-sources-de-plus-et-des-plafonds', itemCount: 3 },
  // #2926 (#2390.8, #2390.12, #2390.14, #2390.18) — l'agenda : l'heure chez l'invité,
  // déléguer en proposition, les réponses des invités, les tâches d'un rendez-vous annulé.
  { id: '2026-09-29-agenda-fuseau-invite-deleguer-annulation', itemCount: 3 },
  // #2947 / #2204.77 — un style de message passe enfin de « validé » à « actif » depuis l'écran.
  { id: '2026-09-29-un-style-de-message-sactive-depuis-lecran', itemCount: 1 },
  // #3265.13 (épopée #3287) — la fiche Contact montre le dernier résultat déclaré et le prochain geste.
  { id: '2026-09-29-la-fiche-contact-montre-le-dernier-resultat-et-le-prochain-geste', itemCount: 1 },
  // #3265.12 (épopée #3287) — après un résultat « réorienté », Laura relit ce
  // que tu as déclaré et propose la suite sur la personne nommée.
  { id: '2026-09-29-laura-propose-la-suite-apres-une-reorientation', itemCount: 1 },
  // #3252 (BEL-SC-223, P0) — la fin de l'onboarding devient une première
  // démonstration de valeur : ce que Bellum a compris, le maillon faible
  // principal, ce qui n'est pas recommandé, les trois premières priorités.
  { id: '2026-09-28-la-fin-donboarding-montre-ce-que-bellum-a-compris', itemCount: 1 },
  // #3253 (BEL-SC-224, P0) — avant de proposer plus de comptes, de contacts
  // ou de campagnes, Laura désigne le principal point qui limite la machine
  // commerciale — avec sa preuve, jamais une perception ou un score opaque.
  { id: '2026-09-28-le-maillon-faible-commercial-est-diagnostique', itemCount: 1 },
  // #3255 (BEL-SC-226, P0) — le panneau de sources du chat nomme discrètement
  // quand une dimension des 5P mérite d'être traitée avant d'aller plus loin.
  { id: '2026-09-28-laura-signale-discretement-les-5p-a-completer', itemCount: 1 },
  // #3257 (BEL-SC-228, P0) — le board d'effort (« Priorités de la semaine »)
  // gagne deux niveaux (Veille, Route partenaire) et une décision écrite par
  // compte (raison, effort estimé, date de revue, conditions de promotion et
  // de déclassement).
  { id: '2026-09-28-le-board-deffort-gagne-veille-et-route-partenaire', itemCount: 2 },
  // #3258 (BEL-SC-229, P0) — la fiche compte montre désormais la matrice
  // intérêt × pénétrabilité : deux axes nommés, jamais fusionnés en un score.
  { id: '2026-09-28-la-fiche-compte-montre-linteret-et-la-penetrabilite', itemCount: 1 },
  // #3261 (BEL-SC-232, P0) — le dossier compte s'ouvre sur un en-tête de
  // décision (verdict, intérêt, pénétrabilité, confiance, meilleure route,
  // prochaine action), la carte 5P gagne un manque critique nommé et des CTA
  // Laura, et cinq cartes (périmètre, influence, flux de décision, écosystème,
  // colonnes du compte) la rejoignent en tête de page.
  { id: '2026-09-28-le-dossier-compte-souvre-sur-la-decision', itemCount: 3 },
  // #3267 (BEL-SC-238, P0) — la fiche talent capture ce que l'entretien a
  // appris (communication, autonomie, temps avant efficacité), jamais un CV.
  { id: '2026-09-28-la-fiche-talent-capture-ce-que-lentretien-a-appris', itemCount: 1 },
  // #3268 (BEL-SC-239, P0) — le studio de proposition nomme les objections
  // anticipées et le statut du CV adapté de chaque profil retenu.
  { id: '2026-09-28-la-proposition-anticipe-les-objections-et-le-cv-adapte', itemCount: 1 },
  // #3270 (BEL-SC-241, P0) — l'écran Partenaires montre désormais si le
  // cadre rang 2 (accès, marge, non-contournement…) est réellement posé
  // avant de recommander une route, jamais sur la seule présence du nom.
  { id: '2026-09-28-partenaires-montre-le-cadre-rang-2', itemCount: 1 },
  // #3271 (BEL-SC-242, P0) — un rituel peut être masqué par l'espace, jamais
  // supprimé du catalogue.
  { id: '2026-09-28-un-rituel-peut-etre-masque-par-lespace', itemCount: 1 },
  // #3271 (BEL-SC-242, P0) — le dictionnaire des indicateurs de pilotage se
  // réordonne selon le rôle de l'appelant (dépôt automatique inchangé).
  { id: '2026-09-28-le-dictionnaire-des-indicateurs-se-priorise-selon-ton-role', itemCount: 1 },
  // #3254 (BEL-SC-225, P0) — la fiche compte montre désormais les 5P de la
  // stratégie de compte : ce qui est connu, ce qui manque, la dimension qui
  // mérite la prochaine action.
  { id: '2026-09-28-la-fiche-compte-montre-les-5p-de-la-strategie', itemCount: 1 },
  // #2390.9 (épopée #2926, 29/09) — une salle réservée n'est plus comptée
  // comme une personne invitée : elle s'affiche à part, sur sa propre ligne.
  { id: '2026-09-29-une-salle-reservee-ne-compte-plus-comme-un-invite', itemCount: 1 },
  // #2871 (#2395.8) — l'objectif est requis à la création d'une action du plan.
  { id: '2026-09-29-une-action-du-plan-exige-son-objectif', itemCount: 1 },
  // #2959 (#2273.2) — la fiche compte affiche l'étape de sa chaîne.
  { id: '2026-09-29-la-fiche-compte-dit-ou-en-est-la-chaine', itemCount: 1 },
  // #2843 (#2398.11/.13/.14) — la fiche d'une routine porte sa configuration,
  // et l'activer montre d'abord ce qu'elle lit, son niveau et ce qui l'arrête.
  { id: '2026-09-29-activer-une-routine-montre-dabord-ce-quelle-fait', itemCount: 2 },
  // #3282 (#3263.39) — l'écran « Comité d'achat » sur la fiche compte.
  { id: '2026-09-29-lecran-comite-dachat', itemCount: 1 },
  // #2390.9 (épopée #2926) — recette écran 29/09 : une salle réservée
  // (invité marqué ressource par Google/Microsoft) se nommait déjà dans les
  // données mais restait comptée comme une personne invitée sur la grille
  // journalière de l'agenda, sans jamais s'identifier à l'écran.
  { id: '2026-09-29-lagenda-nomme-la-salle-reservee', itemCount: 1 },
  // #3262.24-28 (lot R11 29/09) — la bande de décision du pilotage porte
  // quatre nouveaux faits : Focus trop anciens, No-Go à revisiter, comptes
  // sans propriétaire, comptes sans prochaine revue.
  { id: '2026-09-29-la-bande-de-decision-voit-quatre-signaux-de-plus', itemCount: 1 },
  // #3256 (BEL-SC-227.19, lot R11 29/09) — « Aujourd'hui » signale les
  // comptes où au moins deux risques (impayé, renouvellement non engagé, AO
  // non couvert) convergent — jamais un score de plus.
  { id: '2026-09-29-les-risques-critiques-se-voient-ensemble', itemCount: 1 },
  // #3266.1 (épopée #3292, lot R12 29/09, tranché sans Louis) — une affaire
  // peut désormais porter le grain équipe/site/projet qui la concerne, saisi
  // par le commercial à la création.
  { id: '2026-09-29-le-perimetre-equipe-site-projet-dune-affaire', itemCount: 1 },
  // #2897 (#2091.28/.34) — l'écran de bienvenue s'appuie sur l'audit : carte dérivée, audit transmis à Laura.
  { id: '2026-09-29-bienvenue-issue-de-laudit', itemCount: 2 },
  // Retour prospect 29/09 — la page d'inscription à la démo ne défilait pas.
  { id: '2026-09-29-inscription-demo-defile', itemCount: 1 },
  // #3303 (ENG-1720) — l'import ZIP volumineux tient désormais une vraie
  // archive de terrain : dépôt repris par morceaux, ZIP imbriqués dépaquetés,
  // doublons reconnus, plafond dit à l'écran.
  { id: '2026-09-28-limport-zip-volumineux-tient-une-vraie-archive', itemCount: 4 },
  // #3279 / #3280 (bugs bêta, 29/09) — l'entête du dossier de compte, deux fois moins haut.
  { id: '2026-09-29-lentete-du-dossier-de-compte-se-condense', itemCount: 2 },
  // #3299 / #3300 (bugs bêta, 29/09) — la liste des comptes se resserre.
  { id: '2026-09-29-la-liste-des-comptes-se-resserre', itemCount: 2 },
  // #3302 (bug bêta, 29/09) — l'import d'archive ZIP du vivier : Fermer sur la ligne des autres boutons.
  { id: '2026-09-29-vivier-import-zip-boutons-sur-une-ligne', itemCount: 1 },
  // #3286 #3281 #3302 #3279 (recette prod 29/09) — quatre correctifs refaits après mesure en production.
  { id: '2026-09-29-quatre-retours-mesures-en-production', itemCount: 4 },
  // #3286 (bug bêta, 29/09) — la bascule En cours / Prêt à facturer rejoint la ligne du titre, à droite.
  { id: '2026-09-29-missions-la-bascule-en-haut-a-droite', itemCount: 1 },
  // #3281, #3283 (bug bêta, 29/09) — la barre d'outils du pipe sur une ligne, Pipe et Pistes à qualifier dans la barre du haut.
  { id: '2026-09-29-opportunites-pipe-et-pistes-dans-la-barre', itemCount: 2 },
  // #3181 / #3209 / #3166 (recette 29/09) — alternatives après verdict, portefeuille en 4 catégories, menu de ligne.
  { id: '2026-09-29-laura-propose-des-alternatives-et-repartit-le-portefeuille', itemCount: 3 },
  // #3273 (bug bêta, 28/09) — une réponse de Laura de 3572px de haut, sans
  // titre ni liste ni gras localisé. Couleur, taille et rendu markdown élargi.
  { id: '2026-09-28-la-reponse-de-laura-se-lit', itemCount: 2 },
  // SRC8 (28/09) — Allo rejoint Aircall/Ringover comme outil d'appel branchable.
  { id: '2026-09-28-allo-rejoint-les-outils-dappel', itemCount: 1 },
  // SRC8 (28/09) — le registre légal SAIT désormais qu'une société a changé de
  // nom ou fermé un site, et le dit dans les signaux du compte.
  { id: '2026-09-28-le-registre-legal-se-souvient', itemCount: 1 },
  // #3217 (#3193.2/.3/.4, 28/09) — le panneau de transparence nomme désormais
  // les onze couches de connaissance de Laura comme un objet structuré unique,
  // chacune avec son état réel (consultée, indisponible, non demandée, coupée
  // par le réglage du tour).
  { id: '2026-09-28-le-recu-de-connaissance-nomme-les-onze-couches', itemCount: 1 },
  // #3238/#3239 (lot E14, 28/09 soir) — LAU-FINAL-210/211 : le signal de
  // recrutement dit plus (famille métier, technologies, équipe, statut
  // encore ouvert), regroupe les offres qui forment une même tendance, et la
  // fiche prestataire porte le risque concurrentiel et deux stratégies de
  // plus pour entrer sur un compte verrouillé.
  { id: '2026-09-28-le-signal-de-recrutement-dit-plus', itemCount: 4 },
  // #2882 (épopée), #2450.4/.5/.7/.14/.16, #2448.4/.16 (lot écrivain, 28/09) —
  // les quatre modes de recherche de Laura se distinguent enfin réellement, et
  // elle dit pourquoi elle a choisi le sien.
  { id: '2026-09-28-les-quatre-modes-de-laura-se-distinguent-et-sexpliquent', itemCount: 2 },
  // #2390.10 (épopée #2926, lot SRC1 28/09) — le brief avant rendez-vous
  // signale les contacts déjà connus du compte, absents des invités.
  { id: '2026-09-28-le-brief-signale-un-contact-connu-non-invite', itemCount: 1 },
  // #1952.4 (épopée #2844, lot SRC5 28/09 soir) — Laura peut désormais OUVRIR
  // le dépôt pré-ciblé pour un import de CV en lot (elle ne le lance
  // toujours pas elle-même — la conversation ne transporte aucun fichier).
  { id: '2026-09-28-laura-ouvre-ton-depot-de-cv-en-lot', itemCount: 1 },
  // #2399.8 (épopée #2843, lot src6 28/09) — un manager/admin voit désormais,
  // en LECTURE SEULE, les routines déjà réglées par son équipe.
  { id: '2026-09-28-vue-manager-des-routines-de-lequipe', itemCount: 1 },
  // #1952.4 (épopée #2844, lot V15 28/09) — Laura sait désormais LIRE l'état
  // d'un import de CV en lot déjà lancé depuis l'écran (elle ne le lance
  // toujours pas — la conversation ne transporte aucun fichier).
  { id: '2026-09-28-laura-lit-ton-import-de-cv-en-lot', itemCount: 1 },
  // #2927 (#2159.32/.33, lot V17 28/09 — passe 2) — un téléphone ou un profil
  // LinkedIn partagé par deux lignes du même fichier est désormais signalé
  // pour revue, sans jamais être écarté automatiquement (les deux contacts
  // restent créés).
  { id: '2026-09-28-limport-signale-telephone-et-linkedin-partages', itemCount: 1 },
  // #2927 (#2159.60, lot V17 28/09) — une ligne écartée à l'import reste
  // consultable une par une, pas seulement son total par raison.
  { id: '2026-09-28-limport-liste-chaque-ligne-ecartee', itemCount: 1 },
  // #2927 (#2159.46/.48/.50, lot V17 28/09) — l'assistant d'import compte
  // désormais les comptes rapprochés, les conflits et les colonnes sensibles
  // AVANT l'écriture, plutôt que de laisser deviner leur nombre dans la liste.
  { id: '2026-09-28-limport-compte-rapproches-conflits-et-sensibles', itemCount: 1 },
  // #2972 (lot V20b, 28/09) — l'escalade d'un relevé CRA dit aussi depuis
  // combien de jours elle dure, la même dérivation que le retard des
  // relances.
  { id: '2026-09-28-lescalade-cra-dit-aussi-son-delai', itemCount: 1 },
  // #2972 (lot V20b, 28/09) — l'escalade d'un relevé CRA nomme aussi le
  // manager client, un second candidat à côté du porteur déjà affiché.
  { id: '2026-09-28-lescalade-cra-nomme-aussi-le-manager-client', itemCount: 1 },
  // #2398.13/#2205.38/#2205.42/.61 (épopée #2843, lot V21 passe 2, 28/09) —
  // simulation sans écriture pour la routine de relance, et un refus avant
  // appel modèle quand le solde est épuisé.
  { id: '2026-09-28-simuler-la-relance-sans-reponse', itemCount: 2 },
  // #2993 (lot V35, recette écran du 28/09 soir) — deux paiements en retard
  // évincés puis réintégrés par le plafond du brief ressortaient dans l'ordre
  // inverse — le plus récent avant le plus ancien.
  { id: '2026-09-28-le-brief-ne-mele-plus-les-paiements-en-retard-reintegres', itemCount: 1 },
  // #2942 (lot V35, recette écran du 28/09 soir) — un lien de Laura qui ouvre
  // le créateur de besoin PRÉ-REMPLI n'arrivait plus vide sur un vieux
  // brouillon local sans rapport.
  { id: '2026-09-28-le-createur-de-besoin-garde-le-pre-remplissage-de-laura', itemCount: 1 },
  // #2770.54 — un bouton « Copier le plan » (texte brut) est toujours
  // proposé sur la carte du plan de journée, qu'un agenda soit connecté en
  // écriture ou non — la voie de secours quand #2770.49/.50/.51 ne peut pas
  // écrire directement.
  { id: '2026-09-28-copier-le-plan-de-journee', itemCount: 1 },
  // #2770.47 — la carte du plan de journée permet désormais de retirer un
  // bloc proposé avant d'en décider (jamais un éditeur de titre/horaire, le
  // plan n'étant jamais persisté ailleurs que la carte).
  { id: '2026-09-28-retirer-un-bloc-du-plan-de-journee', itemCount: 1 },
  // #2770.49/.50/.51 — la carte du plan de journée (« organise ma journée »)
  // propose un bouton par bloc pour l'ajouter réellement à l'agenda, un à la
  // fois, sur un geste explicite — la carte elle-même continue de ne rien
  // écrire seule.
  { id: '2026-09-28-un-bloc-du-plan-de-journee-sajoute-a-lagenda', itemCount: 1 },
  // #2770 (#2101.19/.21/.22/.37) — un rendez-vous confirmé que la porte de
  // proposition de créneau a écrit se distingue maintenant sur la grille et
  // le plateau d'agenda partagés, pas seulement sur la fiche compte qui a
  // posé le geste.
  { id: '2026-09-28-un-rendez-vous-propose-se-distingue-sur-toute-la-grille', itemCount: 1 },
  // #2075.14 (épopée #2880, lot V33) — valider un bloc de l'audit seul.
  { id: '2026-09-28-valider-un-bloc-de-laudit', itemCount: 1 },
  // #2175.29/.30/.32 (épopée #2880, lot V33) — quatre états par fait, accord réel, prêt à démarrer.
  { id: '2026-09-28-un-besoin-dit-sil-est-pret-a-demarrer', itemCount: 3 },
  // Épopée #2880 (lot V33) — le croisement expertise ↔ preuve et l'audit à 3 états.
  { id: '2026-09-28-chaque-expertise-dit-ce-qui-la-prouve', itemCount: 3 },
  // #2897 (#2091.36, #2091.37) — un compte dont l'onboarding précède la
  // refonte de l'écran Welcome (21/07/2026) le voit dire, une fois, ce qui a
  // changé — et que ses réponses n'ont pas bougé.
  { id: '2026-09-28-un-message-pour-qui-a-connu-lancien-welcome', itemCount: 1 },
  // #2809 (#2293.11, #2294.*) — depuis /accounts, une sélection de comptes
  // peut désormais chercher des contacts JAMAIS collectés, coût annoncé par
  // compte avant le clic.
  { id: '2026-09-28-trouver-des-contacts-jamais-collectes-depuis-comptes', itemCount: 3 },
  // Épopées #2967 (machine d'état commerciale canonique) et #2974 (audience de campagne), lot V39.
  { id: '2026-09-28-laura-propose-tu-valides-la-trace-le-dit', itemCount: 3 },
  // #2957 (lot V24 passe 3) — appels d'offres : section masquable, empty state honnête.
  { id: '2026-09-28-appels-doffres-passe-3', itemCount: 7 },
  // #2107.31 — un signal de la Veille dit désormais aussi son AMPLEUR business,
  // distincte de la lecture ESN déjà affichée (#2687).
  { id: '2026-09-28-un-signal-dit-aussi-son-ampleur', itemCount: 1 },
  // #2818 (lot T4, 28/09) — le sourcing hors vivier dit ce qu'il coûte et
  // combien de temps il prend AVANT le clic, et propose trois voies réelles
  // pour aller plus loin qu'un scraping qui n'existe pas.
  { id: '2026-09-28-sourcing-hors-vivier-va-plus-loin', itemCount: 3 },
  // #3144 — recette écran 28/09/2026, bis : le dépliable de la première
  // correction du jour (`2026-09-28-missions-condense-encore-son-entete`)
  // était bien fermé, mais mesuré en prod ENSUITE, l'entête fermé faisait
  // 589 px — pire que les 511 px d'avant. Cause : les trois tuiles KPI
  // cockpit (fusionnées séparément le même jour) restaient sur leur propre
  // rangée toujours visible. Elles rejoignent le dépliable, et le titre, la
  // recherche, le bouton « Filtres » et l'action principale tiennent
  // maintenant sur une seule rangée compacte.
  { id: '2026-09-28-missions-entete-compact-en-une-rangee', itemCount: 1 },
  // #3167 — retour bêta 28/09/2026 : après enregistrement du formulaire
  // d'édition, la fiche du vivier ne relisait pas les nouvelles valeurs
  // (cache non invalidé) — corrigé.
  { id: '2026-09-28-la-fiche-du-vivier-se-met-a-jour-apres-le-formulaire', itemCount: 1 },
  // #3166 — retour bêta 28/09/2026 : l'icône du menu d'actions (le « … » de
  // fin de ligne, /accounts) collait à son libellé — corrigé pour retrouver
  // le même espacement que le menu du clic droit.
  { id: '2026-09-28-licone-du-menu-dactions-respire-a-nouveau', itemCount: 1 },
  // #3163 — retour bêta 28/09/2026 : la chip « Contexte » de /discover (et
  // /search, /analysis-batches) tient désormais sur une seule ligne — le
  // texte long tronque, avec la phrase complète dans une infobulle.
  { id: '2026-09-28-la-chip-contexte-tient-sur-une-ligne', itemCount: 1 },
  // #3162 — retour bêta 28/09/2026 : le dépliable « Voir le détail » du
  // bandeau de statistiques du Vivier disparaît ; son contenu (tendance,
  // complétude, raisons de non-mesure) se lit désormais au survol et au
  // focus clavier des pastilles du haut.
  { id: '2026-09-28-le-detail-des-statistiques-du-vivier-se-lit-au-survol', itemCount: 1 },
  // #3161 — retour bêta 28/09/2026 : le bandeau qui affichait le CA cumulé du
  // compte sur sa fiche (déjà visible sur l'onglet Missions du même dossier)
  // est retiré ; le rattachement de groupe garde sa propre carte, seule.
  { id: '2026-09-28-le-rattachement-de-groupe-reste-seul-sur-la-fiche-compte', itemCount: 1 },
  // #2988 — recette écran 28/09/2026 : sur /contacts, la fiche contact et la
  // liste, cliquer « Enrichir » débitait un crédit sans jamais proposer la
  // portée (email seul / téléphone seul / les deux) que le pipeline serveur
  // sait déjà filtrer depuis le 25/09.
  { id: '2026-09-28-enrichir-un-contact-choisit-sa-portee-avant-le-credit', itemCount: 1 },
  // #2791 — recette écran 28/09/2026 : la table secteur → sièges du comité
  // d'achat (livrée le 27/09) n'atteignait que la prélecture de compte,
  // jamais l'outil que Laura appelle réellement pour « qui est au comité
  // d'achat de X » — elle continuait donc à ne citer que des rôles génériques.
  { id: '2026-09-28-le-comite-dachat-se-nomme-aussi-en-conversation', itemCount: 1 },
  // #3144 — recette écran 28/09/2026 (bêta) : malgré le dépliable posé le
  // 27/09, le header de /missions mesurait encore 511 px — les cinq
  // pastilles rapides et le filtre « Devise » restaient affichés hors du
  // dépliable, et le compteur du bouton « Filtres » les ignorait.
  { id: '2026-09-28-missions-condense-encore-son-entete', itemCount: 1 },
  // #2097.17/.36 (28/09) — recette écran V3 du brief : la phrase de Laura
  // sous le titre passe à la taille de la maquette, et les cartes de
  // priorité animent leur changement de rang au lieu de sauter dessus.
  { id: '2026-09-28-le-brief-affine-son-verdict-et-son-mouvement', itemCount: 2 },
  // #2099.17-.32 (épopée #2767, 28/09) — Reporter / Pas pertinent / Déjà
  // traité sur chaque priorité du jour, gestes personnels respectés le
  // lendemain.
  { id: '2026-09-28-priorites-reporter-refuser-deja-traite', itemCount: 3 },
  // #2159.11/.13/.17 et suivants (27/09) — l'assistant d'import nomme un export
  // BoondManager à sa signature de colonnes publique, propose une correspondance
  // approchante avec sa confiance (jamais un pourcentage), et distingue un CONFLIT
  // d'un doublon rapproché d'une simple mise à jour.
  { id: '2026-09-27-import-detection-boondmanager-et-confiance-de-mapping', itemCount: 3 },
  // #2297.18 — recette écran du 27/09 : la salle de démo ne pouvait montrer
  // qu'un enrichissement « trouvé » ou « rien trouvé », jamais « ambigu ».
  { id: '2026-09-27-un-enrichissement-de-demo-peut-repondre-ambigu', itemCount: 1 },
  // #3153/#3154/#3155 — trois retours d'un client bêta sur la fiche compte et
  // la fiche contact, le 27/09 : le regroupement des contacts, ses modes
  // disponibles, et la carte « pourquoi c'est un contact clé ».
  { id: '2026-09-27-contacts-regroupes-par-persona-et-fiche-cle-plus-courte', itemCount: 3 },
  // #2961 (#2302.28) — la question « quelles entreprises peux-tu citer comme
  // références ? » collecte désormais un NOM par entrée (plus une phrase
  // libre), pour que Laura puisse les citer comme comptes comparables quand
  // elle recommande un territoire commercial.
  { id: '2026-09-28-references-clients-nommees', itemCount: 1 },
  // Exigence Louis 27/09 — l'import accepte n'importe quel nombre de lignes
  // (fin du plafond de 500 de la fiche compte), lu en arrière-plan par paquets.
  { id: '2026-09-27-import-universel-sans-limite-de-lignes', itemCount: 3 },
  // #3132/#3141/#3142/#3143/#3144/#3145/#3146 — sept retours bêta du 27/09,
  // regroupés en une entrée : chacun condense ou dégage un écran devenu trop
  // haut ou trop étroit (sept écrans, sept régressions de densité distinctes).
  { id: '2026-09-27-sept-retours-beta-condensent-les-ecrans-charges', itemCount: 7 },
  // Trois défauts constatés en production le 27/09 (logs bellum-ia-service +
  // recette écran) : la recherche documentaire de Laura échouait à chaque
  // message (méthode manquante côté client Supabase maison), la mémoire de
  // conversation ne s'écrivait plus (contrainte NOT NULL non respectée), et
  // #2942 — le créateur de besoin ouvert depuis la carte « Besoin compilé »
  // s'ouvrait sans le compte visé.
  { id: '2026-09-27-laura-retrouve-ses-documents-sa-memoire-et-le-bon-compte', itemCount: 3 },
  // #2876 (#2433.4/.5/.12) — la vision de Laura sur une image jointe au chat :
  // la source se rouvre depuis la pastille du message, une photo mobile
  // tournée part droite et allégée avant l'envoi, et un tableau capturé garde
  // ses colonnes et ses cellules vides (jamais un zéro inventé).
  { id: '2026-09-27-laura-relit-mieux-les-images-jointes-au-chat', itemCount: 3 },
  // #2021 — recette écran 27/09 sur l'espace RÉEL de Louis : le lien du
  // 26/09 (entrée juste en dessous) restait invisible pour tout compte au
  // milieu du parcours fin, faute d'un statut terminal.
  { id: '2026-09-27-revoir-son-profil-en-mode-guide-quel-que-soit-le-statut', itemCount: 1 },
  // FINIR-V2-27-09 — cinq blocs du dossier de démonstration Société Générale
  // (axes de lecture, écosystème, domaines d'opportunité, indicateurs
  // financiers, mises en garde sur la fiabilité des données) n'avaient aucun
  // champ d'accueil : `keyNoteSchema` (générique) en donne un aux cinq, dans
  // n'importe quelle analyse — pas seulement ce compte.
  { id: '2026-09-27-cinq-lectures-de-plus-sur-la-fiche-compte', itemCount: 1 },
  // #2369.11/.12 (reste, épopée #2768) — l'onglet « Mémoire de style »
  // (Connaissances) compare désormais le même message d'exemple sous les
  // quatre couches de style, et mesure quatre taux d'usage PAR STYLE.
  { id: '2026-09-27-memoire-de-style-comparatif-et-usage', itemCount: 2 },
  // #2809 (#2293.2/.3/.11, #2294.*) — recherche multi-comptes de Découvrir :
  // deux des trois points restants de l'épopée. Le rejeu de contacts sur
  // plusieurs comptes RÉUTILISE le moteur d'axe déjà livré pour Signaux
  // (`POST /analysis/deepen/quote` + `POST /analysis/:id/refresh`, jamais
  // l'analyse entière) ; le sélecteur de source branche « liste cible »,
  // « import » et « demandé à Laura » sur les listes cibles réelles de
  // l'espace (`target_lists.source`).
  { id: '2026-09-27-decouvrir-multi-comptes-contacts-et-liste-cible', itemCount: 2 },
  // #2386.1/.9 — un fil « étape suivante » relie Découvrir → Séquences → CRM,
  // et la session de prospection expose sa télémétrie par parcours.
  { id: '2026-09-27-fil-de-prospection-et-sa-telemetrie', itemCount: 2 },
  // #2339.1/.2/.3/.5/.6/.8/.10/.11/.13 (épopée #2795) — Laura pouvait déjà
  // ÉCRIRE le parcours besoin→shortlist→positionnement→mission ; elle peut
  // maintenant le RELIRE dans la conversation, sans rouvrir trois écrans.
  { id: '2026-09-27-laura-relit-le-parcours-complet-dun-besoin', itemCount: 4 },
  // #2434.8/.9/.10/.12/.24/.30/.40/.66-.70/.74/.75/.77 — le mode conversation
  // vocale de Laura (dictée → envoi → lecture de la réponse → réécoute), la
  // langue de dictée (français/anglais/détection automatique) avec les
  // passages incertains signalés, et le retour haptique + casque Bluetooth au
  // téléphone.
  { id: '2026-09-27-conversation-vocale-avec-laura', itemCount: 3 },
  // #2872 (reste, constat PRODUCTION 27/09) — Laura répondait « aucun besoin
  // ouvert » sur un besoin pourtant réel et ouvert (le correctif des mots
  // vides, PR #3147, ne suffisait pas) : l'outil `find_needs` du chat lisait
  // des clés que le pont ne rend jamais (`items`/`label`/`starts_on` au lieu
  // de `data`/`title`/`start_on`), donc aucun résultat n'atteignait jamais
  // la conversation, quelle que soit la recherche.
  { id: '2026-09-27-laura-retrouve-les-besoins-ouverts-par-competence', itemCount: 1 },
  // #2183.21/#2183.26 (#2784) — recette écran 27/09 : une fiche née d'un CV
  // déposé affichait « Non renseigné » sur la ville ET les formations. La
  // ville était déjà persistée depuis #2183.21 mais jamais sur toutes les
  // fiches encore analysées côté démo ; les formations n'étaient tout
  // simplement jamais écrites au-delà de l'écran de revue d'import — les deux
  // rejoignent désormais la fiche talent.
  { id: '2026-09-27-la-fiche-talent-porte-la-ville-et-les-formations-du-cv', itemCount: 1 },
  // #2319.114 (épopée #2985) — une tâche CRM créée par BellumAI chez HubSpot
  // pouvait être RETIRÉE (note rectificative) depuis le Journal, jamais
  // clôturée réellement chez le fournisseur — passe par la même porte
  // d'écriture que toute écriture CRM.
  { id: '2026-09-27-une-tache-crm-se-cloture-depuis-le-journal', itemCount: 1 },
  // #2326.25 (épopée #2794) — le CTA qui suit un import de CV/CSV disait
  // « Voir les exceptions », sans jamais dire combien.
  { id: '2026-09-27-limport-de-cv-nomme-le-nombre-dexceptions', itemCount: 1 },
  // #2434.1/.8-.12/.30/.40/.55/.85 (lot H7, 27/09) — conversation vocale
  // continue, mot incertain souligné, dictée d'une liste à importer.
  { id: '2026-09-27-conversation-vocale-continue-et-dictee-de-liste', itemCount: 3 },
  // #2097 — recette écran 27/09 (fenêtre 500px) : aucun avatar en tête
  // d'écran sur /briefing, le premier n'apparaissait qu'à 5 847px de haut.
  { id: '2026-09-27-lavatar-rejoint-len-tete-du-brief-sous-768px', itemCount: 1 },
  // #3050 — recette écran 27/09 (fenêtre 500px) : sur /chat mobile, le fil ne
  // prenait que 38% de la hauteur utile et le composeur n'était pas collé à
  // la navigation basse.
  { id: '2026-09-27-le-fil-de-laura-reprend-toute-la-hauteur-sous-768px', itemCount: 2 },
  // #2989 (recette 27/09) — glisser une barre du Gantt de planification que
  // la règle refuse (bord ouvert ou rogné) ne produisait NI mouvement NI
  // message : le blocage était correct (aucune date inventée) mais muet, lu
  // comme un bouton cassé. La poignée nomme désormais la raison, au clic
  // comme au clavier.
  { id: '2026-09-27-le-planning-dit-pourquoi-une-barre-ne-bouge-pas', itemCount: 1 },
  // #2403.13 — Laura se taisait déjà pendant une saisie, une action critique
  // ou le mode vocal ; elle lit désormais l'agenda déjà synchronisé pour se
  // taire aussi pendant un rendez-vous en cours.
  { id: '2026-09-27-laura-se-tait-pendant-un-rendez-vous', itemCount: 1 },
  // #2798 — recette écran 27/09 : le mode de campagne (nurturing,
  // prospection, relance post-RDV…) n'était visible qu'à la création d'une
  // séquence, jamais sur l'écran des séquences lui-même.
  { id: '2026-09-27-le-mode-de-campagne-se-voit-sur-la-ligne', itemCount: 1 },
  // #2374.7 — le contact d'une relation partenaire était déjà collecté
  // (formulaire « Ajouter un partenaire ») mais n'avait aucun rendu sur
  // l'écran Partenaires.
  { id: '2026-09-27-le-contact-du-partenaire-se-voit-sur-sa-carte', itemCount: 1 },
  // #2786 — recette écran 27/09 : Laura pouvait répondre depuis sa
  // connaissance générale d'une entreprise plutôt que depuis la fiche
  // canonique du compte (siège, SIREN) quand les deux divergent.
  { id: '2026-09-27-laura-cite-la-fiche-du-compte-avant-sa-memoire', itemCount: 1 },
  // #2791 — recette écran 27/09 : le comité d'achat ne nommait que des
  // catégories génériques, jamais les sièges propres au secteur du compte
  // (pharma, automobile) — même sans contact qui les remplit encore.
  { id: '2026-09-27-le-comite-dachat-nomme-les-sieges-du-secteur', itemCount: 1 },
  // #2866 — recette 27/09 (réel) : aucun bouton « Annuler » sur une action
  // déjà exécutée, dans aucun onglet de /actions, Terminées comprises. La
  // fenêtre d'annulation (72h) n'existait pas non plus — un pas exécuté il y
  // a des mois restait annulable comme s'il datait de la minute.
  { id: '2026-09-27-annuler-une-action-terminee', itemCount: 2 },
  // #2847 — recette 27/09 (réel) : Réglages › Profil › « Mes périmètres »
  // était vide et non éditable, et les trois axes du modèle de territoire
  // déjà posés comme réponses (agences, remote et déplacements, capacité)
  // n'apparaissaient nulle part hors du questionnaire d'onboarding.
  { id: '2026-09-27-mes-perimetres-modele-de-territoire', itemCount: 2 },
  // #2862 — recette 27/09 (réel) : /settings/lexicon n'affichait AUCUNE
  // version, y compris pour un lexique jamais modifié.
  { id: '2026-09-27-lexique-affiche-sa-version', itemCount: 1 },
  // #2777 — recette écran 27/09 : « Noter un échange » enregistrait la note
  // mais ne proposait aucune cascade (récap/opportunité/besoin/contacts). Le
  // service existait déjà (`MeetingNotesCard`) ; il lui manquait cet appelant.
  { id: '2026-09-27-note-compte-propose-la-cascade', itemCount: 1 },
  // #2938 — recette écran 27/09 : la carte conflit d'agenda hors du top 3 (sur
  // /actions) n'ouvrait aucun geste. `ActionsBlock` ouvrait déjà le bon
  // dialogue ; `OverflowPriorities` en manquait le câblage.
  { id: '2026-09-27-conflit-agenda-prevenir-et-replanifier-partout', itemCount: 1 },
  // #2932 — constat recette 27/09 (salle démo) : le badge Verdict de la fiche
  // compte nommait déjà les cinq catégories métier, la liste /accounts
  // affichait encore l'ancien libellé GO/PRUDENT/NO-GO sur la même ligne.
  { id: '2026-09-27-liste-comptes-nomme-le-verdict-comme-la-fiche', itemCount: 1 },
  // #2818 — le sourcing externe de consultants : chercher hors du vivier
  // qualifié, depuis un besoin, sur les sources déjà connectées à l'espace.
  { id: '2026-09-27-sourcing-externe-consultants', itemCount: 3 },
  // #2939 (#2174) — l'assistant de création d'un besoin passe de quatre à
  // cinq étapes : coller un brief/un e-mail, dupliquer un besoin existant,
  // dire comment le client décide et qui décide, relire ce qui a été compris
  // et ce qui manque encore.
  { id: '2026-09-27-assistant-besoin-brief-decision-relecture', itemCount: 4 },
  // #2450.8/.9/.12 (épopée #2882) — un mode Rapide explicite sur une demande
  // d'actualité restait muet sur sa propre limite.
  { id: '2026-09-27-laura-dit-la-limite-dun-mode-rapide', itemCount: 1 },
  // #2398.10 (épopée #2843) — la routine relances ne faisait que compter les
  // fils sans réponse, jamais préparer quoi que ce soit.
  { id: '2026-09-27-relance-sans-reponse-prepare-un-brouillon', itemCount: 1 },
  // #2336.13 — le type de contrat voulu, déclaré mais jamais lu par le
  // matching consultant. #2968 — la SURFACE qui manquait : le comparateur de
  // profils le noyait dans la liste générique « Risques », entre un refus
  // client et un consentement expiré — ligne à part désormais, sur `CompareTable.tsx`.
  { id: '2026-09-27-vivier-type-de-contrat-voulu-recoupe', itemCount: 2 },
  // #2206.42 — l'écran Marché ne portait qu'un seul horizon (le delta entre
  // deux photos). Il en porte désormais deux, clairement séparés.
  { id: '2026-09-27-marche-separe-tendance-de-fond-et-tendance-du-moment', itemCount: 2 },
  // #3096/#3097 — constat en prod le 27/09 : les filtres livrés la veille (lot
  // n9) ne survivaient ni au partage ni au rechargement d'une recherche
  // Découvrir, et le serveur ne les recevait jamais — corrigé à la racine
  // (URL + requête IA), voir `agent_docs/chantiers-livres.md`.
  { id: '2026-09-27-teletravail-et-seniorite-tiennent-au-partage-decouvrir', itemCount: 2 },
  // #3088 — retour bêta (call Apricot Labs du 24/09/2026) : « trop d'infos en
  // général » sur le dossier compte. Le risque principal et la voie d'accès
  // rejoignent la section repliée « Le contexte du compte » (#1881) : ils
  // restent lisibles, à la demande, au lieu d'occuper la colonne ouverte en
  // permanence.
  { id: '2026-09-26-le-dossier-compte-respire-un-peu-plus', itemCount: 1 },
  // Lot n9 (26/09) — #3095/#3096/#3097 : prestataires détectés par crédit de
  // site, filtre télétravail dans Découvrir, séniorité + salaire des offres
  // d'emploi (compte ET Découvrir).
  { id: '2026-09-26-decouvrir-teletravail-seniorite-prestataires-site', itemCount: 3 },
  // #2021 — recette écran 26/09 : un compte déjà onboardé n'avait qu'un
  // chemin vers la reconfiguration guidée, plus bas sur Réglages › Profil.
  // Une seconde entrée, directement depuis l'éditeur d'une étape, réutilise
  // le MÊME geste (#2022) pour le rendre trouvable de là où on le cherche.
  { id: '2026-09-26-revoir-son-profil-en-mode-guide-se-trouve-depuis-chaque-etape', itemCount: 1 },
  // Correctif visuel du 26/09 — `shadow-xs` (ThemeToggle, cartes de fiche
  // compte, bulle « Nouveautés »…) était écrit dans ~10 fichiers sans jamais
  // se peindre : le thème Tailwind installé (3.4) ne génère pas ce nom.
  // Trouvé par la synchro Figma du design system (elle liste ce que le CSS
  // n'importe pas) ; corrigé à la source, dans le config Tailwind de l'app.
  { id: '2026-09-26-le-relief-discret-des-cartes-et-boutons-se-voit-enfin', itemCount: 1 },
  // #2842.1/.2 — deux nouvelles règles de l'audit commercial lisent
  // désormais une réalité réelle (positionnements, renouvellements de
  // mission), au lieu de rester « non mesuré ».
  { id: '2026-09-25-laudit-commercial-voit-les-positionnements-et-renouvellements', itemCount: 1 },
  // #2148.16 (épopée #2849) — joindre un fichier « pour cette conversation »
  // (le geste par défaut) ne dépose plus une ligne dans la base de
  // connaissance : Laura le lit pour la question en cours, rien n'est gardé.
  // Ajouter à la base reste un geste explicite séparé, inchangé.
  { id: '2026-09-25-une-piece-jointe-de-conversation-ne-se-garde-plus', itemCount: 1 },
  // #2323.1/.32/.34/.35/.36/.38-.45 — niveau « détecté » avant qualification,
  // question prioritaire par axe de qualification, et détection de
  // contradictions sur un besoin (démarrage/entretiens, séniorité/budget,
  // full remote/présence, freelance exclu, mission longue/budget non validé,
  // habilitation indisponible), chacune avec un arbitrage proposé.
  { id: '2026-09-25-detection-questions-contradictions-besoin', itemCount: 3 },
  // 25/09 — trois lots #2325.27-.31 / #2107.48 / #2107.9-.11-.16 : capacité du
  // pipe, portefeuille respecté dans le brief, cartes CRA/facturation.
  { id: '2026-09-25-capacite-pipe-portefeuille-brief-facturation', itemCount: 3 },
  // Vague 43 (25/09) — résumé de quatre lots user-facing sans entrée propre :
  // #2325.34 (collisions de staffing dans le diagnostic de pipe), #2323.13/.30/.47
  // (porte matcher unique sur les besoins ouverts), #2408.75-.81 (actions de
  // ligne sur /missions), #2263.1/.13-24 (vérifier un poste depuis /chat +
  // agrégation CRM/Market Memory avant une analyse payante).
  { id: '2026-09-25-vague-43-pipe-matcher-missions-verification-poste', itemCount: 4 },
  // #2434.27 — interrompre la lecture d'une réponse rendait EXACTEMENT le
  // même état qu'une fin naturelle : rien ne les distinguait à l'écran.
  { id: '2026-09-25-interrompre-une-lecture-vocale-se-voit', itemCount: 1 },
  // #2434.28 / #2434.29 — le toast d'erreur du message vocal disparaissait
  // seul ; la raison reste maintenant visible jusqu'à la nouvelle tentative,
  // et la panne réseau porte une mention distincte de l'erreur générique.
  { id: '2026-09-25-vocal-erreur-persistante-et-hors-ligne-distinct', itemCount: 1 },
  // #2107.6 — une disponibilité saisie il y a plus de 60 jours, jamais
  // reconfirmée depuis, apparaît désormais dans « Aujourd'hui » — la routine
  // du vivier existait déjà, elle n'atteignait jamais cet écran.
  { id: '2026-09-25-disponibilite-a-reconfirmer-dans-aujourdhui', itemCount: 1 },
  // #2185.13 — « où placer cette personne ? » n'était atteignable que depuis
  // la ligne du vivier, jamais depuis la fiche elle-même.
  { id: '2026-09-25-la-fiche-talent-mene-a-son-tour-a-la-prospection-inversee', itemCount: 1 },
  // #2185.36/.38 — la dernière année de pratique d'une compétence et le type
  // d'un document (certification comprise) existaient dans le schéma sans
  // jamais atteindre l'écran.
  { id: '2026-09-25-la-fiche-talent-date-une-competence-et-nomme-un-document', itemCount: 2 },
  // #2185.30/.31 — les préférences de mission et la mobilité géographique
  // étaient saisies (le formulaire d'édition les écrit) sans qu'aucun onglet
  // ne les relise.
  { id: '2026-09-25-le-profil-relit-enfin-les-preferences-quil-collectait-deja', itemCount: 1 },
  // #2185.6/.7/.9/.11 — la zone, la mobilité structurée, le cadre contractuel
  // et la fraîcheur de la fiche existaient déjà sur la personne ; ils
  // n'atteignaient pas encore l'entête, où on la découvre en premier.
  { id: '2026-09-25-lentete-dune-fiche-talent-dit-ou-comment-et-depuis-quand', itemCount: 4 },
  // #2325.7/.15/.16/.21/.23/.24/.25 — « quelle est la santé de mon pipe,
  // quelles affaires prioriser » partait vers un classement de comptes,
  // jamais vers le diagnostic du pipe d'opportunités.
  { id: '2026-09-25-la-sante-du-pipe-ne-tombe-plus-dans-un-classement-de-comptes', itemCount: 1 },
  // #2097 — la recette écran du 25/09 avait réfuté sept points de design sur
  // /briefing : titres de section, tonalité des cartes, hiérarchie du bloc de
  // décision, mouvement d'arrivée des priorités.
  { id: '2026-09-25-brief-hierarchie-visuelle', itemCount: 1 },
  // #2091.40 — Laura parle en premier sur l'écran d'après onboarding, avant
  // le résumé de profil et tout le reste.
  { id: '2026-09-25-laura-parle-en-premier-sur-lecran-daccueil', itemCount: 1 },
  // #2175.37 — la prochaine action d'un besoin parle le vocabulaire du
  // produit (« Qualifier le budget », « Préparer le push »).
  { id: '2026-09-25-la-prochaine-action-dun-besoin-change-de-mots', itemCount: 1 },
  // #2103.30 — un rendez-vous qui invite deux entreprises du portefeuille
  // demande laquelle préparer, au lieu de deviner la première trouvée.
  { id: '2026-09-25-plusieurs-entreprises-le-brief-demande-laquelle', itemCount: 1 },
  // #2408.8 / .11 / .18 — la colonne Risques de /missions signale désormais
  // une échéance très proche ou dépassée, un relevé d'activité manquant
  // (distinct d'un relevé contesté) et un bon de commande exigé mais absent.
  { id: '2026-09-25-missions-echeance-proche-releve-manquant-po-manquant', itemCount: 1 },
  // #2634.1 (24/09/2026) — coller une URL et/ou un texte LinkedIn ajoute un
  // signal d'achat sur la fiche compte, sans jamais que Bellum ne contacte
  // LinkedIn lui-même.
  { id: '2026-09-24-un-signal-linkedin-que-tu-apportes-toi-meme', itemCount: 1 },
  // #2162.27 / épopée #2892 — Laura ouvre « Nouvelle analyse » préremplie
  // d'un contexte STRUCTURÉ (offre à pousser, signal, sortant en place…).
  { id: '2026-09-24-laura-ouvre-une-analyse-preremplie', itemCount: 1 },
  // #2874 / #2367.17 — un échantillon de message, pour un contact réel de la
  // campagne, à voir avant de créer une séquence à plusieurs contacts.
  { id: '2026-09-24-echantillon-de-message-avant-campagne', itemCount: 1 },
  // #2452.1 / épopée #2907 — « Aller plus loin sur cette réponse » sous les
  // réponses de la bulle Laura, comme sur l'écran /chat.
  { id: '2026-09-24-approfondir-une-reponse-de-laura-aussi-dans-la-bulle', itemCount: 1 },
  // #2867 (#2200.39/.42/.43) — la file « À valider » se filtre enfin par
  // risque, agent (humain ou automatisation) et source du déclenchement.
  { id: '2026-09-24-la-file-a-valider-se-filtre-par-risque-agent-et-source', itemCount: 1 },
  // #2095.57 — chaque carte du brief du matin porte désormais son propre
  // « Pourquoi ? » vers Laura, avec le fait de la carte (et le compte, s'il
  // en mentionne un) déjà dans la question.
  { id: '2026-09-25-brief-pourquoi-cette-carte', itemCount: 1 },
  // #2112.35 — le sélecteur d'agendas de /briefing nomme un agenda partagé en
  // lecture seule.
  { id: '2026-09-25-agenda-lecture-seule', itemCount: 1 },
  // #2184.37 / #2184.38 — ré-ouvrir la revue d'un CV déjà validé montre qui a
  // revu chaque bloc et quand.
  { id: '2026-09-24-la-revue-dun-cv-dit-qui-la-valide-et-quand', itemCount: 1 },
  // #2203.62 / #2378.7 — le détail d'une séquence propose « Dupliquer » vers
  // un autre contact ; la route serveur existait déjà, testée, sans bouton.
  { id: '2026-09-25-une-sequence-se-duplique-vers-un-autre-contact', itemCount: 1 },
  // #2206.6 — la bande « Ce qui attend ta décision » n'affichera jamais plus de
  // cinq cartes, même le jour où une quatrième ou cinquième source s'ajoute.
  { id: '2026-09-25-pilotage-cinq-decisions-au-plus', itemCount: 1 },
  // #2158.6 / #2158.51 / #2158.72 — l'annuaire /contacts ouvre directement sur
  // les contacts prêts (le bouton d'en-tête y mène aussi, lien partageable), et
  // la recherche retrouve un contact par son numéro de téléphone.
  { id: '2026-09-25-annuaire-contacts-vue-par-defaut-et-recherche-telephone', itemCount: 2 },
  // #2106.21 / #2106.22 / #2106.23 — le bloc « BellumAI a préparé pour toi »
  // et les lignes cliquables « depuis ta dernière visite » existaient déjà
  // sur « Aujourd'hui » ; ils rejoignent aussi le Tableau de bord.
  { id: '2026-09-25-le-tableau-de-bord-dit-aussi-ce-qui-a-bouge', itemCount: 2 },
  // #2449.34-.37 (épopée #2896) — le niveau d'action de Laura se règle dans
  // Réglages › Laura, s'affiche sur chaque proposition et sa prévisualisation,
  // et chaque routine dit le sien.
  { id: '2026-09-25-le-niveau-daction-de-laura-se-regle-et-se-voit', itemCount: 2 },
  // #2177.11 / .12 / .13 / .15 / .21 — le sous-statut d'un positionnement
  // (existant depuis #2335 mais jamais éditable) avance d'un clic vers la
  // cible suivante, sans jamais toucher l'étape affichée à côté.
  { id: '2026-09-25-le-sous-statut-dun-positionnement-avance', itemCount: 1 },
  // #2192 — le cockpit des missions en cours resserre l'écart avec la demande
  // (sous-titre, résumé « fin sous 45 jours », recherche par owner, état vide,
  // trois gestes depuis la fiche mission).
  { id: '2026-09-25-le-cockpit-missions-se-resserre', itemCount: 5 },
  // #2179.4/.5/.6/.16/.17/.18/.33/.36 — l'écran « Tes appels d'offres » se
  // présente enfin (titre, sous-titre, accès à Laura), se filtre par statut,
  // et refuse de créer deux besoins pour le même dossier. #2171.31 — on
  // rattache un contact à une opportunité sans quitter sa fiche.
  { id: '2026-09-25-tes-appels-doffres-se-presentent-et-se-filtrent', itemCount: 4 },
  // #2075.24/.27/.28 — après validation de l'audit commercial, le relais
  // (compte à tester, consultant, question à Laura) reprend le VRAI compte
  // suggéré et la VRAIE priorité de la semaine, pas un texte générique.
  { id: '2026-09-25-le-relais-apres-validation-de-laudit-propose-du-reel', itemCount: 1 },
  // #2214.24 — onze parcours guidés (analyser un compte, dossier compte,
  // cibles, Découvrir, Laura, actions, boîte mail, projets/besoins, missions,
  // outils, import) et le centre d'aide qui les liste tous.
  { id: '2026-09-24-onze-nouveaux-guides-et-un-centre-daide', itemCount: 1 },
  // #2284 (tranches 1-3) — l'organigramme dit qu'une entité est une marque ou
  // une direction métier, nomme un homonyme écarté, et signale (sans jamais
  // fusionner) deux comptes comparés qui sont la même entreprise.
  { id: '2026-09-24-lorganigramme-dit-marque-ou-direction-homonyme', itemCount: 1 },
  // #2276 (tranches 1-3) — le job composite de Laura : effort adapté à la
  // complexité, aperçu avant confirmation (réutilisé/neuf/limites/durée), et
  // reprise dans la conversation au rechargement.
  { id: '2026-09-24-le-travail-de-laura-se-previsualise-et-se-reprend', itemCount: 1 },
  // #2170.48/.49/.51 — filtres rapides du pipe (vieillissant/sans profil/à
  // signer), en Kanban comme en tableau, et le bug qui vidait la colonne
  // entière dès qu'un autre filtre était posé.
  { id: '2026-09-24-le-pipe-filtre-en-un-clic', itemCount: 1 },
  // #2408.43 — nouveau filtre « Nature » (régie/forfait/recrutement) sur la
  // liste des missions.
  { id: '2026-09-24-missions-filtre-nature', itemCount: 1 },
  // #2194 (planning) / #2198 (encaissements) — menu d'actions par mission
  // depuis le planning d'équipe, et colonnes dernière action/interlocuteur/
  // export sur les encaissements.
  { id: '2026-09-24-missions-menu-dactions-et-encaissements', itemCount: 2 },
  // #2391 — Laura propose un plan de journée en blocs de temps, calculé
  // depuis l'agenda réellement libre.
  { id: '2026-09-24-le-plan-de-journee-de-laura', itemCount: 1 },
  // #2429.13 — l'approche commerciale de Laura (objectif, angle, cas
  // d'usage) rend en carte dédiée plutôt qu'un titre markdown à reconnaître.
  { id: '2026-09-24-lapproche-commerciale-en-carte-dediee', itemCount: 1 },
  // #2297.41 / #2297.42 / #2297.48 / #2297.49 / #2297.50 / #2297.55 / #1952.9
  // (vague 33) — l'enrichissement payant demande la permission, exclut les
  // numéros personnels, et récapitule le lot champ par champ ; Laura
  // n'annonce plus terminé un travail seulement lancé.
  { id: '2026-09-24-lenrichissement-demande-ta-permission-avant-tout-appel-payant', itemCount: 2 },
  // #1952.24 (vague 33) — une carte de suivi sans proposition ouvre un lien
  // « Voir le détail » vers la fiche du compte.
  { id: '2026-09-24-une-carte-de-suivi-ouvre-le-dossier-du-compte', itemCount: 1 },
  // #2106.6 / #2107.5 / #2106.22 / #2106.23 (vague 33) — un consultant qui se
  // libère bientôt apparaît dans « Aujourd'hui » avec un lien vers sa fiche,
  // et deux lignes du digest ouvrent une page filtrée réelle.
  { id: '2026-09-24-le-brief-signale-un-consultant-qui-se-libere', itemCount: 2 },
  // #2156.67 / #2156.74 (vague 33) — Mes cibles se lit aussi en tableau.
  { id: '2026-09-24-mes-cibles-se-lit-aussi-en-tableau', itemCount: 1 },
  // #2705.9 (vague 33) — un message de remerciement, avec le prénom saisi,
  // se lit avant la redirection vers la démo.
  { id: '2026-09-24-un-message-de-remerciement-avant-la-demo', itemCount: 1 },
  // #2074.12 — l'audit commercial nomme désormais le vivier de consultants
  // sans disponibilité immédiate.
  { id: '2026-09-24-laudit-commercial-voit-le-vivier-sans-disponibilite', itemCount: 1 },
  // #2425.8 — Laura sait expliquer l'écart entre CA prévu et encaissé, avec
  // les mêmes causes chiffrées que l'écran.
  { id: '2026-09-24-laura-explique-lecart-entre-ca-prevu-et-encaisse', itemCount: 1 },
  // #2755 — un compte analysé avant le correctif de l'organigramme le dit
  // désormais, au lieu d'afficher un onglet vide sans raison.
  { id: '2026-09-24-lorganigramme-dit-quand-un-compte-est-anterieur-au-correctif', itemCount: 1 },
  // #2372.8 — à contexte mince, le message de prospection pose une question
  // honnête plutôt que d'affirmer une actualité non prouvée.
  { id: '2026-09-24-laura-pose-une-question-honnete-plutot-quune-actualite-inventee', itemCount: 1 },
  // #2191.17 / #2191.18 — staffer un besoin en mission en reprend maintenant
  // le lieu et la préférence de télétravail.
  { id: '2026-09-24-la-mission-copie-le-lieu-et-le-teletravail-du-besoin', itemCount: 1 },
  // #2395.4 / #2395.9 — le canal et le résultat attendu, déjà écrits par le
  // plan, sont enfin enregistrés sur chaque action (rattrapage des actions
  // déjà générées inclus).
  { id: '2026-09-24-le-plan-pose-enfin-le-canal-et-lattendu-des-actions', itemCount: 1 },
  // #2157.10 — le composer de Laura cède la place à la barre de sélection des
  // comptes, au lieu de la recouvrir.
  { id: '2026-09-24-le-composer-cede-la-place-a-la-barre-de-selection', itemCount: 1 },
  // #2095.2 / #2095.7 — une relance ne fait plus disparaître, sans exception,
  // la fin de mission ou l'impayé du brief du matin.
  { id: '2026-09-24-le-brief-ne-laisse-plus-les-relances-evincer-lessentiel', itemCount: 1 },
  // #2395.10 — la liste unifiée des actions montre aussi les interventions.
  { id: '2026-09-24-mes-actions-voit-aussi-mes-interventions', itemCount: 1 },
  // #2415.6 — la revue interne d'un relevé d'activité devient un geste séparé
  // de la validation client.
  { id: '2026-09-24-la-revue-interne-dun-cra-devient-un-geste-separe', itemCount: 1 },
  // #2297.25 / #2297.26 — un enrichissement par lot nomme désormais pourquoi
  // un contact en est exclu, au lieu de disparaître en silence.
  { id: '2026-09-23-lenrichissement-par-lot-nomme-ses-exclusions', itemCount: 1 },
  // #1950.4 / .7 / .10 / .12 / .13 — le plan de Laura dit son objectif, ses
  // résultats attendus, ce qui manque, ce qui ne se fera pas, et son horizon daté.
  { id: '2026-09-23-le-plan-de-laura-dit-son-objectif', itemCount: 2 },
  // #2409.8 / #2409.9 — Laura annonce d'elle-même un démarrage de mission
  // incomplet, puis l'arrivée du jour 1 à confirmer (sans relancer personne).
  { id: '2026-09-23-laura-annonce-le-demarrage-dune-mission', itemCount: 2 },
  // #2424.12 — Laura filtre la bibliothèque de preuves par secteur,
  // expertise ou technologies quand la conversation les nomme.
  { id: '2026-09-23-laura-filtre-les-references-par-secteur-et-technologies', itemCount: 1 },
  // #1903.12 — le compte rendu de rendez-vous, une fois validé, écrit
  // réellement une note sur le compte (au lieu de rester bloqué).
  { id: '2026-09-23-le-compte-rendu-de-rendez-vous-ecrit-une-note-sur-le-compte', itemCount: 1 },
  // #2366.5 — le SEUL appelant manquant : la route de création d'appel
  // existait déjà côté serveur (gardée, testée), aucun écran ne la proposait.
  { id: '2026-09-23-un-appel-se-propose-depuis-la-fiche-contact', itemCount: 1 },
  // #2425 — le prévisionnel par horizon : sept composantes, quatre scénarios
  // sans pondération, décisions et vue manager à cinq lignes.
  { id: '2026-09-23-le-previsionnel-se-lit-par-horizon', itemCount: 2 },
  // #2395 — l'objet Action canonique : « Mes relances » montre aussi mes tâches et mes appels.
  { id: '2026-09-23-mes-actions-toutes-les-maisons', itemCount: 2 },
  // #2371 — relation non mesurée nommée ; prémisse d'objectif contredite nommée.
  { id: '2026-09-23-laura-ne-confond-plus-relation-inconnue-et-compte-froid', itemCount: 2 },
  // #2095.8 — le brief « Aujourd’hui » ajoute un nouveau type de priorité :
  // un appel d'offres dont l'échéance approche.
  { id: '2026-09-23-le-brief-voit-les-appels-doffres-proches', itemCount: 1 },
  // #2095.7 — le brief « Aujourd’hui » ajoute un nouveau type de priorité :
  // un paiement client en retard de règlement.
  { id: '2026-09-23-le-brief-voit-les-paiements-en-retard', itemCount: 1 },
  // #2095.2 — le brief « Aujourd’hui » ajoute un nouveau type de priorité :
  // une mission qui approche de sa fin (`missions.ends_on`, sous 30 jours).
  { id: '2026-09-23-le-brief-voit-les-missions-qui-approchent-de-leur-fin', itemCount: 1 },
  // #2366.5 — le script d'appel devient une tâche d'appel, dont l'issue se pose
  // d'un geste dans « Appels à passer ».
  { id: '2026-09-23-le-script-dappel-devient-un-appel-a-passer', itemCount: 1 },
  // #2372.6 — le document utile s'annonce ; le contrôle avant envoi signale
  // celui qu'un message de séquence joindrait avant tout intérêt.
  { id: '2026-09-23-un-document-utile-sannonce-avant-de-partir', itemCount: 1 },
  // #2731.2 — un scénario commercial guidé, sur les données réelles de
  // l'espace, lançable depuis Réglages › Démarrage.
  { id: '2026-09-23-le-scenario-commercial-guide-depuis-les-reglages', itemCount: 1 },
  // #2415.8 — les relevés d'activité d'une mission à plusieurs consultants se
  // regroupent enfin, avec un état de préparation de facturation partagé.
  { id: '2026-09-23-les-releves-dune-mission-se-regroupent', itemCount: 1 },
  // #2425.8 — Laura nomme la cause de l'écart entre CA et cash (délai de
  // facturation ou retard de recouvrement), jamais un second chiffre nu.
  { id: '2026-09-23-laura-nomme-lecart-entre-ca-et-cash', itemCount: 1 },
  // #2156.55 — un CTA « Importer une liste » sur Mes cibles : coller des noms
  // ajoute les fiches RETROUVÉES dans l'espace, jamais une fiche inventée.
  { id: '2026-09-23-importer-une-liste-de-cibles', itemCount: 1 },
  // #2156.73 — une liste de Mes cibles ne naît plus jamais sans action
  // suivante : le formulaire manuel, la création depuis un compte, Contacts
  // ou Découvrir reçoivent tous le même défaut, au seul endroit qu'ils
  // traversent déjà.
  { id: '2026-09-23-une-liste-de-cibles-nait-avec-son-action-suivante', itemCount: 1 },
  // #2306.10 — Laura lit désormais les sept axes du score détaillé d'un
  // compte (le même bloc que l'onglet Évaluation), plutôt que de répondre en
  // doctrine générale sans jamais les citer.
  { id: '2026-09-23-laura-decompose-le-score-en-sept-axes', itemCount: 1 },
  // #2325 — le diagnostic du pipe dit maintenant LESQUELLES de vos affaires
  // méritent le plus votre temps, avec une décision, un owner et une date par
  // dossier, jamais un montant ou une probabilité.
  { id: '2026-09-23-laura-dit-quelles-affaires-meritent-votre-temps', itemCount: 2 },
  // #2095.77 / #2095.78 — le brief du matin resserre ses priorités et ne
  // répète plus deux fois le même clic.
  { id: '2026-09-23-le-brief-va-a-lessentiel', itemCount: 2 },
  // #2394.35/.36 — un brouillon d'e-mail ne se dit plus « déposé » sans un
  // identifiant réel, et un fil de réponse déclaré ne peut plus être vide.
  { id: '2026-09-23-un-brouillon-depose-porte-un-identifiant-reel', itemCount: 1 },
  // #2394.10/.11/.12/.13 — Laura connaît déjà l'état d'un fil de messagerie
  // (compte, priorité, qui a la balle) : elle le relaie enfin en conversation
  // au lieu de le recalculer à la volée, sans jamais lire le corps.
  { id: '2026-09-23-laura-lit-letat-dun-fil-de-messagerie', itemCount: 1 },
  // #2324.39 — Laura prépare une mise à jour d'opportunité (étape, montant
  // estimé, prochaine étape) : une carte avec son diff « avant → après ».
  // #2324.37 — et les RISQUES de l'affaire : sur la fiche, et proposables par Laura.
  { id: '2026-09-23-laura-propose-une-mise-a-jour-dopportunite', itemCount: 2 },
  // #2451.1 / #2453.7 / #2453.8 — le mode de contexte de Laura (Mon activité,
  // Mission ponctuelle, Neutre) se choisit aussi dans Analyser et Découvrir,
  // avec le MÊME sélecteur, et le serveur l'applique vraiment.
  { id: '2026-09-23-le-mode-de-contexte-vaut-aussi-pour-analyser-et-decouvrir', itemCount: 2 },
  // #2388.24 — la reprise de CRM couvre maintenant les SOCIÉTÉS, pas
  // seulement les contacts (onglet Contacts/Entreprises).
  { id: '2026-09-23-la-reprise-de-crm-retrouve-aussi-les-entreprises', itemCount: 1 },
  // #2388.49 — la reprise de CRM dit désormais QUELS CHAMPS seront écrits,
  // pas seulement COMBIEN de lignes, avant le clic sur « Importer pour de bon ».
  { id: '2026-09-23-la-reprise-de-crm-dit-quels-champs-seront-ecrits', itemCount: 1 },
  // #2388.2 — le pré-consentement Google/HubSpot/Odoo/Salesforce dit
  // désormais explicitement que rien au-delà des capacités listées n'est lu
  // ni modifié, pas seulement ce qui ne sera « jamais » fait.
  { id: '2026-09-23-le-pre-consentement-dit-ce-qui-nest-pas-touche', itemCount: 1 },
  // #2434.19 / #2434.21 — la notice du micro dit comment arrêter l'écoute, et
  // un refus déjà donné au navigateur se voit avant même le premier clic.
  { id: '2026-09-23-micro-refuse-se-voit-avant-le-clic', itemCount: 1 },
  // #2434.34 / #2434.35 / #2434.36 / #2434.37 / #2434.38 — le message vocal
  // reconnaît mieux le jargon ESN, les acronymes et le format des nombres/dates.
  { id: '2026-09-23-la-dictee-reconnait-mieux-le-jargon-esn', itemCount: 1 },
  // #2434.47 / #2434.48 / #2434.49 / #2434.51 — Laura ne lit jamais à voix
  // haute un tableau long, une coordonnée sensible ou un long avertissement.
  { id: '2026-09-23-laura-ne-lit-pas-tout-a-voix-haute', itemCount: 1 },
  // #2376 — Laura prépare un brief d'appel avant une prospection : identité,
  // entreprise, fonction, questions et branches de traitement d'objection.
  { id: '2026-09-23-laura-prepare-un-brief-dappel', itemCount: 1 },
  // #2424.10 — l'expansion depuis un REX positif nomme enfin ses pistes dans le plan.
  { id: '2026-09-23-lexpansion-nomme-sa-piste-quand-le-rex-est-positif', itemCount: 1 },
  // #2424.8 — Laura sait préparer un brouillon de demande de témoignage.
  { id: '2026-09-23-laura-prepare-une-demande-de-temoignage', itemCount: 1 },
  // #2424.2 / #2424.3 — une mission « completed » demande aussi son retour, et
  // le formulaire porte trois champs de plus (équipe, compétences, contraintes).
  { id: '2026-09-23-le-retour-de-mission-sait-plus-de-choses', itemCount: 2 },
  // #2382.1/#2382.2/#2382.3 (2e recette, 23/09) — une séquence née avant même
  // l'existence du message canonique (créée avant le 22/09) voit enfin son
  // centre d'approbation à l'ouverture de l'écran, sans attendre qu'on la
  // retouche.
  { id: '2026-09-23-le-centre-approbation-rattrape-les-vieilles-sequences', itemCount: 1 },
  // #2423.9 — l'avenant que Laura propose dans le chat (TJM, société, lieu,
  // pause, dates…) se voit enfin à l'écran, avec son diff et sa preuve.
  { id: '2026-09-23-laura-propose-un-avenant-de-mission', itemCount: 1 },
  // #2191.31 — staffer deux fois le même besoin avec le même consultant ne
  // crée plus de mission en double.
  { id: '2026-09-23-staffer-deux-fois-ne-cree-plus-de-mission-en-double', itemCount: 1 },
  // #2191.17 / #2191.18 — le télétravail et le lieu du besoin se reprennent
  // sur la fiche mission au handoff.
  { id: '2026-09-23-le-teletravail-et-le-lieu-se-reprennent-sur-la-mission', itemCount: 1 },
  // #2192.6 — l'entête de Missions porte le point final exact de l'issue.
  { id: '2026-09-23-tes-missions-porte-son-point-final', itemCount: 1 },
  // #2158.3 / #2158.4 / #2158.7 / #2158.8 — l'en-tête de Contacts se lit
  // comme la demande, et ouvre l'import et « Mes cibles ».
  { id: '2026-09-23-lentete-de-contacts-dit-ce-quil-fait', itemCount: 2 },
  // #2149.30 / #2149.31 — Découvrir continue vers l'écran suivant : un compte
  // suivi ou une cible créée ouvrent leur destination sans repasser par la
  // liste.
  { id: '2026-09-23-decouvrir-continue-vers-lecran-suivant', itemCount: 2 },
  // #2202.1/.2/.3/.4/.6/.8 — cinq situations commerciales sans cadence dédiée :
  // un message seul, une session d'appels, une cadence légère, l'entretien
  // d'une relation (nurturing), la relance après un rendez-vous.
  { id: '2026-09-23-cinq-cadences-de-plus-pour-creer-une-sequence', itemCount: 1 },
  // #2200.13 / #2200.14 / #2200.21 — une carte « À valider » ne disait, avant
  // décision, ni qui avait déclenché la demande, ni depuis quoi, ni ce qui
  // suivrait une fois approuvée — trois réponses qu'un run déjà terminé
  // donnait déjà.
  { id: '2026-09-23-la-carte-a-valider-dit-qui-et-la-suite', itemCount: 2 },
  // #2182.10 — le résumé du Vivier compte les fiches incomplètes, à côté du
  // pourcentage de profils enrichis dont c'est le complément.
  { id: '2026-09-23-fiches-incompletes-dans-le-resume-du-vivier', itemCount: 1 },
  // #2106.8 / #2107.7 — une mission qui approche de sa fin apparaît dans « Aujourd'hui ».
  { id: '2026-09-23-une-mission-a-echeance-apparait-dans-aujourdhui', itemCount: 1 },
  // #2708.2 (2e retour) du 23/09 — la carte de tête « À regarder en premier »
  // borne enfin la hauteur d'un libellé de projet long, sans effacer le texte
  // complet (survol) — même correctif que le résumé « Projets plausibles ».
  { id: '2026-09-23-la-carte-a-regarder-en-premier-ne-deborde-plus', itemCount: 1 },
  // #2150.31 — un compte créé par un import de fichier entre désormais dans
  // le portefeuille de la personne qui importe (assigned_to posé).
  { id: '2026-09-23-un-compte-importe-rejoint-ton-portefeuille', itemCount: 1 },
  // #2104.30 — la carte de proposition d'un brouillon de messagerie peut être
  // copiée avant même de cliquer sur « Créer le brouillon ».
  { id: '2026-09-23-le-brouillon-propose-se-copie-avant-creation', itemCount: 1 },
  // #2146.6 — « Demander à Laura » depuis une fiche compte (mobile, ou une
  // instance qui a perdu la course de la bulle) emporte désormais ce que la
  // fiche affichait, pas seulement le compte et la question.
  { id: '2026-09-23-demander-a-laura-emporte-ce-que-la-fiche-affichait', itemCount: 1 },
  // #2415.9 — un forfait affiche enfin ses jalons sur sa fiche mission (backend
  // livré par #2417.3, jamais consommé côté écran jusqu'ici).
  { id: '2026-09-23-un-forfait-affiche-ses-jalons', itemCount: 1 },
  // #2439.2 — chaque donnée de « Mes données » affiche désormais son niveau
  // de classification (six niveaux nommés, de public à technique).
  { id: '2026-09-23-mes-donnees-affiche-une-classification', itemCount: 1 },
  // #2392.2 — une nouvelle routine du soir propose de clôturer la journée
  // seulement s'il reste une boucle ouverte (tâche à décider, fil sans
  // réponse) — jamais un rappel creux.
  { id: '2026-09-23-routine-du-soir-cloture-de-journee', itemCount: 1 },
  // #2399.8 / #2399.9 — une automatisation qui a besoin de comptes suivis se
  // bloque désormais réellement quand l'espace n'en a aucun, au lieu de
  // rester activable pour rien.
  { id: '2026-09-23-routine-sans-compte-suivi-se-bloque', itemCount: 1 },
  // #2265.13 — quand la désambiguïsation d'homonymes retient un candidat
  // dominant sans confirmation, la fiche compte l'annonce désormais.
  { id: '2026-09-23-la-fiche-annonce-lhomonymie-tranchee', itemCount: 1 },
  // #2183.43 — l'import en masse de CV affiche un temps restant estimé.
  { id: '2026-09-23-limport-de-cv-en-masse-dit-le-temps-restant', itemCount: 1 },
  // #2149.30 — suivre un compte depuis Découvrir propose désormais un lien
  // direct vers la liste Comptes, où le compte vient d'atterrir.
  { id: '2026-09-23-suivre-un-compte-depuis-decouvrir-mene-a-comptes', itemCount: 1 },
  // #2149.27 — le lanceur « Territoire » du copilote menait à une route
  // retirée le 10/09 (#1796.2) ; il ouvre de nouveau un écran qui existe.
  { id: '2026-09-23-le-lanceur-territoire-mene-de-nouveau-a-decouvrir', itemCount: 1 },
  // #2091.21 — carte « Comment souhaites-tu que Laura te prévienne ? » sur
  // l'écran des connecteurs, lien vers les préférences existantes (GA-26).
  { id: '2026-09-23-comment-souhaites-tu-que-laura-te-previenne', itemCount: 1 },
  // #2036.9 — la zone de développement souhaitée (distincte de la zone où on
  // intervient déjà) était écrite mais jamais relue au rechargement du profil.
  { id: '2026-09-23-ta-zone-de-developpement-souhaitee-reste-affichee', itemCount: 1 },
  // #2746 / #2747 — reformulé : l'entête de « Mes cibles » se replie au lieu
  // d'être supprimée (garantie #2155.14 repliée, bloc de veille repliable).
  // #2746.2 — le résumé chiffré et les deux CTA secondaires rejoignent le
  // même dépliant, sinon l'entête dépassait les 1 à 2 lignes demandées.
  { id: '2026-09-23-lentete-de-mes-cibles-se-replie', itemCount: 3 },
  // #2616.1 — « Comptes qui recrutent » lit désormais Welcome to the Jungle
  // et les ATS publics (Lever, Greenhouse, Teamtailor, SmartRecruiters,
  // Welcomekit), en plus de France Travail et de l'APEC.
  { id: '2026-09-23-comptes-qui-recrutent-lit-plus-de-plateformes', itemCount: 1 },
  // #2117.66 — sur mobile, l'action principale du dossier reste atteignable
  // même une fois le haut de la page défilé hors écran.
  { id: '2026-09-23-laction-principale-du-dossier-reste-a-portee-sur-mobile', itemCount: 1 },
  // #2308.45 — la carte de couverture du dossier se filtre aussi par
  // objectif (familles cible / familles support), en plus du périmètre.
  { id: '2026-09-23-la-carte-de-couverture-se-filtre-par-objectif', itemCount: 1 },
  // #1954.21/#1954.31 — le panneau « Sources citées » montre désormais un
  // extrait réel du document consulté, pas seulement son titre.
  { id: '2026-09-23-le-panneau-de-sources-montre-un-extrait', itemCount: 1 },
  // #2402.13 — un signal ouvert depuis plus de 60 jours arrête d'être marqué
  // urgent dans la file « À traiter » ; il y reste, badge neutre « Périmé ».
  { id: '2026-09-23-un-signal-trop-vieux-arrete-de-crier-urgent', itemCount: 1 },
  // #2441.12 — relire un message plus haut dans le fil n'est plus interrompu
  // par un saut automatique en bas à chaque nouveau token de Laura.
  { id: '2026-09-23-relire-le-fil-ne-se-fait-plus-arracher-par-lauto-scroll', itemCount: 1 },
  // #2437.14 — une clé de traduction manquante ne s'affiche plus jamais sous
  // sa forme technique brute à l'écran ; elle se journalise pour l'équipe.
  { id: '2026-09-23-une-traduction-manquante-ne-saffiche-jamais-brute', itemCount: 1 },
  // #2337 — le terrain de jeu multi-talents : plusieurs consultants, un seul
  // plan de comptes, un seul angle par compte.
  { id: '2026-09-23-le-terrain-de-jeu-de-plusieurs-consultants', itemCount: 2 },
  // #2366.1 — la fiche Contact relit le même message qu'a préparé Laura.
  { id: '2026-09-23-la-fiche-contact-relit-les-messages-prepares', itemCount: 1 },
  // #2371.7 — le contrôle avant envoi repère un catalogue technique déroulé
  // à un décideur (persona), en plus des douze points déjà vérifiés.
  { id: '2026-09-23-le-controle-avant-envoi-repere-le-catalogue-technique', itemCount: 1 },
  // #2454 — Découvrir et Analyser disent le contexte qu'ils lisent ; Découvrir a un mode « Neutre ».
  { id: '2026-09-23-decouvrir-et-analyser-disent-leur-contexte', itemCount: 3 },
  // #2149.3 / #2149.4 — /search dit où aller pour une personne ou un besoin,
  // au lieu de dupliquer un chemin qui existe déjà ailleurs (GA-26).
  { id: '2026-09-23-recherche-dit-ou-verifier-une-personne-ou-un-besoin', itemCount: 1 },
  // #2201.19 — chaque écriture CRM en attente dit sa conséquence, jamais une
  // probabilité : `target.risk` voyageait déjà dans le contrat, inutilisé.
  { id: '2026-09-23-une-ecriture-en-attente-dit-sa-consequence', itemCount: 1 },
  // #2164.44 — un bouton « Créer une cible » depuis le dossier compte : une
  // liste neuve dans Mes cibles, seedée avec ce compte.
  { id: '2026-09-23-creer-une-cible-depuis-le-dossier-compte', itemCount: 1 },
  // #2160.53 — une personne partie de l'entreprise n'est plus recommandée
  // comme un contact actuel dans le classement de priorité.
  { id: '2026-09-23-une-personne-partie-nest-plus-recommandee', itemCount: 1 },
  // #2451 / #2453 — « Contexte de travail » sous le composeur de Laura : Mon
  // activité, Mission ponctuelle ou Neutre, appliqué côté serveur. #2451.9 —
  // un administrateur règle désormais le mode par défaut de tout l'espace.
  { id: '2026-09-23-laura-choisit-ce-quelle-utilise-pour-toi', itemCount: 3 },
  // #2200.23 — une carte d'exécution du Centre d'actions ouvre directement le
  // compte et/ou le contact concerné.
  { id: '2026-09-23-une-carte-dexecution-ouvre-son-compte-et-son-contact', itemCount: 1 },
  // #2205.49-52/.62 — chaque routine (Réglages › Routines) a désormais un
  // historique consultable, au-delà de sa seule dernière exécution.
  { id: '2026-09-23-lhistorique-dune-routine-se-consulte', itemCount: 1 },
  // #2200.38 — le journal d'activité se filtre désormais par canal
  // (LinkedIn, e-mail, téléphone, RDV, autre).
  { id: '2026-09-23-le-journal-se-filtre-par-canal', itemCount: 1 },
  // #2162.27 (tranche web) — /search peut s'ouvrir avec l'entreprise ET le
  // contexte libre déjà rédigés.
  { id: '2026-09-23-search-souvre-avec-le-contexte-deja-redige', itemCount: 1 },
  // #2162.23 — la barre de personnalisation du composeur porte une action
  // « Corriger mon profil » directe.
  { id: '2026-09-23-corriger-mon-profil-depuis-le-composeur', itemCount: 1 },
  // #2162.10/#2162.14 — chaque résultat du champ entreprise nomme son pays et
  // signale une entité cessée.
  { id: '2026-09-23-le-champ-entreprise-nomme-le-pays-et-le-statut', itemCount: 2 },
  // #2412 — le double pouls de satisfaction (client/consultant) d'une mission,
  // désormais visible ET saisissable depuis la fiche mission.
  { id: '2026-09-23-le-pouls-de-satisfaction-dune-mission', itemCount: 1 },
  // #2431 — ingestion de documents : plusieurs fichiers en un seul dépôt.
  { id: '2026-09-23-plusieurs-fichiers-en-un-depot', itemCount: 5 },
  // #2714 — après un envoi ou une déclaration, le compte rendu (destinataire,
  // canal, date, nature vérifiée/déclarée) reste affiché à la place d'un
  // simple toast qui disparaît.
  { id: '2026-09-23-le-compte-rendu-dun-envoi-se-relit-apres-coup', itemCount: 1 },
  // #2755 — le bouton « Enrichir la carte » relisait le research du compte en
  // camelCase alors qu'il est persisté snake_case : la carte restait vide.
  { id: '2026-09-23-enrichir-la-carte-remplit-lorganigramme', itemCount: 1 },
  // #2007.11 — le bouton « passer » du questionnaire de profil note désormais
  // la question sciemment ignorée, transmise à Laura comme non évaluable.
  { id: '2026-09-23-passer-une-question-la-note-nommement', itemCount: 1 },
  // #1940.7 — attribuer une carte d'action de Laura à un collègue notifie
  // réellement la personne choisie, plutôt qu'un simple texte inséré.
  { id: '2026-09-23-une-carte-de-laura-sassigne-a-un-collegue', itemCount: 1 },
  // #2121.21 — la carte d'influence commerciale se zoome et se déplace.
  { id: '2026-09-23-la-carte-dinfluence-se-zoome', itemCount: 1 },
  // #2124.19/#2124.26 — le résumé des missions d'un compte nomme le chargé
  // d'affaires par ligne et le revenu historique facturé (droit finance).
  { id: '2026-09-23-le-charge-daffaires-et-le-revenu-historique-du-compte', itemCount: 1 },
  // #2124.11/#2124.13 — le dossier de compte ouvre une opportunité ou un
  // besoin confirmé sans attendre qu'une analyse le détecte.
  { id: '2026-09-23-un-compte-ouvre-une-opportunite-ou-un-besoin-confirme', itemCount: 1 },
  // Lot L8 outreach du 23/09 — #2384.5 un bloc « Délivrabilité » sur les
  // séquences (envoyés/rebonds/raisons réels), distinct du reste de l'écran.
  { id: '2026-09-23-la-delivrabilite-se-lit-a-part-du-reste', itemCount: 1 },
  // Lot L8 outreach du 23/09 — #2378.3 un rebond confirmé par le fournisseur
  // arrête désormais la séquence outreach en cours (et pas seulement l'ancien
  // rappel interne), au lieu de continuer à programmer des relances sur une
  // adresse morte.
  { id: '2026-09-23-un-rebond-confirme-arrete-la-sequence-en-cours', itemCount: 1 },
  // Lot #2338 / #2409 du 23/09 — une mission ne passe « prête à démarrer »
  // qu'avec l'accord du client ET du consultant, et la checklist du premier jour.
  { id: '2026-09-23-une-mission-demarre-sur-deux-accords-et-sa-checklist', itemCount: 3 },
  // #2735 du 23/09 — la fenêtre « Partager le dossier » créait déjà un lien
  // public à l'ouverture, sans le moindre clic ; elle s'ouvre maintenant vide,
  // un bouton « Créer le lien » le fabrique.
  { id: '2026-09-23-le-lien-de-partage-se-cree-au-clic', itemCount: 1 },
  // #2723 du 23/09 — retour bêta (Loïc Inacio) : une analyse, une recherche ou
  // un enrichissement demandés à Laura partent directement, sans carte de
  // crédits à valider. Renverse D1 (14/09) ; le filet passe en aval
  // (remboursement nocturne des crédits débités à tort).
  { id: '2026-09-23-laura-analyse-sans-carte-a-valider', itemCount: 1 },
  // #2748.2 du 23/09 — retour bêta : un bouton « + » reste dans le rail replié
  // des conversations pour lancer une nouvelle conversation sans redéplier.
  { id: '2026-09-23-un-bouton-plus-dans-le-rail-des-conversations', itemCount: 1 },
  // #2749 du 23/09 — retour bêta : la grille de suggestions de l'accueil /chat
  // prend moins de place (cartes plus compactes, même information).
  { id: '2026-09-23-la-grille-de-suggestions-de-laccueil-prend-moins-de-place', itemCount: 1 },
  // #2714 du 23/09 — après l'envoi d'un e-mail depuis le panneau d'approche,
  // un vrai compte rendu remplace le simple « Envoyé le … ».
  { id: '2026-09-23-un-compte-rendu-suit-lenvoi-dun-email', itemCount: 1 },
  // #2725 du 23/09 — le tableau des contacts et le bloc Contacts d'un compte
  // annoncent désormais la fiche complète avant le clic (la ligne l'ouvrait
  // déjà) ; Découvrir le faisait déjà avec un bouton dédié.
  { id: '2026-09-23-la-fiche-contact-sannonce-avant-le-clic', itemCount: 1 },
  // #2738 du 23/09 — la rangée « Tous / À qualifier » de /contacts porte
  // désormais son nom (« Portée »), comme « État de travail » juste en
  // dessous : elle ne se lisait plus comme un doublon sans but.
  { id: '2026-09-23-la-portee-des-contacts-porte-enfin-son-nom', itemCount: 1 },
  // #2731 du 23/09 — retour bêta : la visite guidée se relance désormais
  // aussi depuis Réglages › Démarrage, pas seulement depuis « Nouveautés ».
  { id: '2026-09-23-revoir-la-visite-guidee-depuis-les-reglages', itemCount: 1 },
  // #2737 du 23/09 — retour bêta : les boutons de la colonne « Actions » du
  // Vivier débordaient sur la colonne voisine à 1280 px de fenêtre.
  { id: '2026-09-23-le-vivier-tient-ses-boutons-a-1280px', itemCount: 1 },
  // #2384.7 du 23/09 — l'historique d'une action annulée nomme désormais si
  // elle reste à compenser ou si aucune compensation n'est possible.
  { id: '2026-09-23-un-pas-annule-nomme-sa-compensation', itemCount: 1 },
  // #2366.4/#2382.1/#2382.2/#2382.3/#2366.5 du 23/09 — le centre
  // d'approbation de l'outreach affiche enfin les messages d'une séquence
  // à laquelle une étape e-mail a été ajoutée après coup, et ne se tait
  // plus quand seuls des appels sont en attente.
  { id: '2026-09-23-le-centre-approbation-outreach-voit-ses-messages', itemCount: 2 },
  // #2708.2 du 23/09 — le résumé « Projets plausibles » d'un compte borne
  // enfin la hauteur d'un libellé long, sans effacer le texte complet
  // (survol).
  { id: '2026-09-23-les-libelles-longs-ne-debordent-plus-le-resume-du-compte', itemCount: 1 },
  // #2399.3 du 23/09 — la fiche d'une routine (Réglages › Routines) dit
  // désormais aussi ce qu'elle LIT, pas seulement ce qui la déclenche et
  // comment elle prouve qu'elle marche.
  { id: '2026-09-23-une-routine-dit-ce-quelle-lit', itemCount: 1 },
  // #2727 du 23/09 — Découvrir cherche enfin une PERSONNE par nom et prénom
  // (+ entreprise supposée) : la liste des homonymes se distingue (poste,
  // entreprise, ville), jamais une coordonnée, et « Ajouter et enrichir »
  // ouvre le geste de création de contact existant.
  { id: '2026-09-23-decouvrir-cherche-une-personne-par-nom', itemCount: 1 },
  // #2166.57 du 23/09 — « Chercher les contacts » depuis une sélection de
  // comptes montre enfin les entreprises retenues (puces retirables) et
  // nomme un 0 résultat au lieu de le taire.
  { id: '2026-09-23-la-selection-de-comptes-se-voit-dans-la-recherche-de-contacts', itemCount: 1 },
  // #2306.12/.13/.30 du 23/09 — le score de compte dit désormais quand il ne
  // peut rien dire de l'accès à un décideur ou de l'achat externe.
  { id: '2026-09-23-le-score-de-compte-dit-quand-il-ne-sait-rien-de-lacces-ou-de-lachat', itemCount: 1 },
  // #2294 du 23/09 — Laura retrouve une personne à travers TOUS les comptes de
  // l'espace (« qui connaît-on chez X », « quel DSI a déjà échangé avec nous »).
  { id: '2026-09-23-laura-cherche-un-contact-dans-tout-lespace', itemCount: 1 },
  // #2422.3 du 23/09 — Réglages › Sociétés porte désormais TVA, adresse et
  // devise en plus de la raison sociale, de l'identifiant légal et du pays.
  { id: '2026-09-23-tes-societes-portent-aussi-tva-adresse-et-devise', itemCount: 1 },
  // #2265.4 / #2265.9 du 23/09 — Découvrir reconnaît maintenant une offre
  // publiée par une plateforme de mise en relation (Malt, Collective.work…)
  // comme un intermédiaire, au même titre qu'un cabinet de recrutement.
  { id: '2026-09-23-decouvrir-reconnait-les-plateformes-intermediaires', itemCount: 1 },
  // #2392 du 23/09 — Laura compile la clôture de fin de journée (tâches cochées,
  // engagements, réponses attendues, blocages, première action de demain) et
  // chaque tâche restée ouverte se décide une par une, diff avant validation.
  { id: '2026-09-23-laura-cloture-ta-journee', itemCount: 2 },
  // Lot #2409.10 du 23/09 — annuler une mission avant son démarrage libère
  // désormais le consultant automatiquement (l'affectation planifiée passe
  // terminée, sans second geste).
  { id: '2026-09-23-annuler-une-mission-avant-demarrage-libere-le-consultant', itemCount: 1 },
  // Lot L11 du 23/09 — #2393.5/#2393.7 la messagerie affiche enfin la RAISON
  // de son classement et propose marquer traité/non pertinent + rattacher un
  // compte directement depuis la liste (le hook et le dialogue existaient,
  // sans bouton pour les atteindre).
  { id: '2026-09-23-la-messagerie-explique-son-classement', itemCount: 2 },
  // #2166.57 — depuis Découvrir, « Chercher les contacts » chaîne la
  // sélection de plusieurs entreprises en une seule recherche de personnes.
  { id: '2026-09-23-chercher-les-contacts-depuis-une-selection', itemCount: 1 },
  // #2455.6 du 23/09 — Laura propose de mettre ton profil à jour depuis un
  // contexte de travail, tu appliques ou tu ignores.
  { id: '2026-09-23-laura-propose-de-mettre-ton-profil-a-jour', itemCount: 1 },
  // #2021.11 — au fil de l'onboarding, la réponse à la question précédente
  // immédiate se relit désormais en une ligne, sans ouvrir le tiroir « Voir
  // mes réponses ».
  { id: '2026-09-23-la-question-precedente-se-relit-en-ligne', itemCount: 1 },
  // #2293 du 23/09 — le lot d'analyses multi-comptes : coller une liste,
  // préview (coût exact, ambiguïtés, doublons), un clic, un lot suivi.
  { id: '2026-09-23-analyser-une-liste-dentreprises-en-un-geste', itemCount: 4 },
  // #2744 du 23/09 — le badge « N échange(s) » de la fiche compte et le
  // filtre « Interactions » de l'Historique lisent désormais le même
  // prédicat (#2744.1) ; les 5 cartes d'encaissement de /pilotage/finance ne
  // s'écrasent plus (#2744.2).
  { id: '2026-09-23-le-compte-dechanges-et-les-cartes-dencaissement-se-corrigent', itemCount: 2 },
  // 23/09 — #2679 la précision de relance (canal mail/LinkedIn/téléphone) se
  // clique désormais, même sans compte actif ; #2444.1 le retour « Pas
  // pertinent » atteint 15+ catégories distinctes (motifs élargis).
  { id: '2026-09-23-la-relance-se-clique-et-le-motif-senrichit', itemCount: 2 },
  // Correctifs du 23/09 (suite retours bêta du 22/09) — #2715.1 le plan
  // distingue un e-mail vraiment envoyé d'une relance déclarée, #2721/#2678
  // les sources citées par Laura deviennent des liens cliquables, #2740 le
  // libellé « Famille » n'est plus tronqué dans le filtre de /discover.
  { id: '2026-09-23-plan-liens-et-filtre-discover', itemCount: 3 },
  // Lot #2407 (statuts/provenance) du 23/09 — #2407.5 les 14 statuts d'une
  // mission se filtrent désormais sur /missions (le filtre ne proposait que
  // ceux du parc), #2407.3 la provenance du client, de l'intitulé, des dates
  // et du TJM s'affiche sur la fiche mission.
  { id: '2026-09-23-le-statut-mission-se-filtre-et-sa-provenance-se-trace', itemCount: 2 },
  // Vague 20 du 23/09 — #2397.2/#2397.7 le départage des priorités du jour par
  // axes nommés et « prioritaire pour moi » qui bouge vraiment le rang,
  // #2419.9 le seau « non rapproché » séparé sur /pilotage/finance, #2421.7
  // l'avertissement d'une étape incohérente sur la chaîne mission-to-cash,
  // #2407.4 l'affectation qui porte consentement/documents/risques déclarés,
  // #2419.8 la relance de facture qui distingue déclaratif et prouvé.
  { id: '2026-09-23-les-priorites-se-departagent-et-laffectation-se-documente', itemCount: 5 },
  // Vague 19 du 23/09 — #2455/#1940 les contextes de travail enregistrés et
  // le fil qui se commente à plusieurs, #2721/#2678/#2679 Laura qui cite ses
  // sources sur une question d'actualité publique.
  { id: '2026-09-23-les-contextes-de-travail-et-laura-cite-ses-sources', itemCount: 4 },
  // Vague 18 du 22-23/09 — huit chantiers distincts qui touchent l'écran :
  // #2381 la réponse qui arrête/met en pause une séquence, #2418 la facture
  // préparée enrichie, #2419/#2417/#2407 le paiement/la déclaration/le statut
  // d'une mission, #2330/#2333 le matching CV et la validation de version,
  // #2375/#2377 la session de prospection multi-canal et son debrief,
  // #2335 la soumission (sous-statuts, timeline, feedback client/consultant),
  // #2452 le devis d'approfondissement sous une réponse de Laura, #2153.57
  // le résultat d'une action du plan aligné avec le CRA.
  { id: '2026-09-23-une-reponse-arrete-la-sequence-une-facture-se-prepare', itemCount: 8 },
  // Vague 17 du 22/09 soir — quatre chantiers distincts qui touchent l'écran :
  // #2382/#2366/#2378 l'approbation des séquences de prospection, #2419/#2421
  // l'encaissement distingué du facturé, #2087 l'onboarding à plusieurs
  // agences, #2435 la fermeture mobile (hors-ligne, clavier, capture photo).
  { id: '2026-09-22-la-prospection-sapprouve-et-lencaissement-se-suit', itemCount: 4 },
  // #2703 / #2704 — un espace à plusieurs sièges (Apricot Labs, 22/09) : le fil
  // de Laura par défaut appartient à son auteur, et une analyse lancée par un
  // coéquipier se suit, se reprend et nomme qui l'a lancée.
  { id: '2026-09-22-un-espace-a-plusieurs-ne-melange-plus-les-fils', itemCount: 3 },
  // #2322 — Laura compile un besoin à partir d'une source collée (email, compte
  // rendu, notes), chaque champ cité ; une proposition, jamais une création.
  { id: '2026-09-22-laura-prepare-un-besoin-depuis-une-source', itemCount: 1 },
  // #2695 — une action créée depuis un signal laissait aucune trace et restait
  // introuvable ; elle s'inscrit à l'historique et le message mène au plan.
  { id: '2026-09-22-une-action-nee-dun-signal-se-retrouve', itemCount: 1 },
  // #2708 / #2692 — un libellé de piste long déformait la file « Pistes à
  // qualifier » ; il tient sur deux lignes, le texte entier au survol.
  { id: '2026-09-22-un-libelle-de-piste-long-tient-sa-ligne', itemCount: 1 },
  // #1961.5 — la mémoire de marché acceptait déjà `location` en repli large ;
  // `city`/`region` s'y ajoutent pour un rappel plus précis, sans deviner un
  // département que le corpus ne porte pas.
  { id: '2026-09-22-la-memoire-de-marche-se-filtre-plus-finement', itemCount: 1 },
  // #2616.1 — le bucket « comptes qui recrutent » de Découvrir ne lisait que
  // France Travail et l'APEC ; Welcome to the Jungle rejoint la récolte.
  { id: '2026-09-22-decouvrir-elargit-les-comptes-qui-recrutent', itemCount: 1 },
  // #1943.3 / #1943.11 / #1943.13 / #1943.14 — trois refus qui se taisaient ou
  // se généralisaient à tort disent maintenant leur vraie raison.
  { id: '2026-09-22-les-refus-se-nomment-plutot-que-de-se-taire', itemCount: 3 },
  // #2150.37 / .39 / .41 / .54 / .60 — la fiche contact était un cul-de-sac
  // accessible depuis un seul écran ; elle s'ouvre maintenant de partout, et
  // affiche son propre historique de corrections et permissions.
  { id: '2026-09-22-la-fiche-contact-souvre-de-partout', itemCount: 2 },
  // #2125.5 / .10 / .12-22 / .15 — un livrable restait une boîte fermée
  // jusqu'à l'ouvrir ; il se prévisualise, se partage en équipe et s'exporte.
  { id: '2026-09-22-un-livrable-se-partage-et-sexporte', itemCount: 3 },
  // #2121.2 / .15 / .32 / .34 / .35 / .54 — la carte d'influence gagne ses
  // liens dessinés, trois vues et un classement aligné sur Contacts.
  { id: '2026-09-22-la-carte-dinfluence-dessine-ses-liens', itemCount: 3 },
  // #2153.31 / #2153.39 — une séquence de prospection lancée restait figée ;
  // elle peut recevoir une relance de plus, et son détail relit le vrai texte.
  { id: '2026-09-22-une-sequence-de-prospection-vit-apres-son-lancement', itemCount: 2 },
  // #2036.7 / #2045.1 / .2 / .4 / .6 / .7 — deux questions de l'onboarding
  // s'affinent : le réseau personnel se compte en bandes, les zones se
  // priorisent au-delà de trois choix.
  { id: '2026-09-22-le-questionnaire-donboarding-affine-deux-questions', itemCount: 2 },
  // #2616.1 — le preset « Comptes qui recrutent » ne lisait que France
  // Travail côté Découvrir, quand l'analyse de compte lit déjà quatre
  // sources : un candidat déjà trouvé est désormais corroboré par les boards
  // ATS (Greenhouse/Lever), en plus de France Travail et l'APEC.
  { id: '2026-09-22-comptes-qui-recrutent-croise-plusieurs-plateformes', itemCount: 1 },
  // #2679 — une précision que Laura pose DANS le texte de sa réponse arrivait
  // sans un bouton : il fallait retaper la réponse qu'on venait de lire.
  { id: '2026-09-21-une-precision-de-laura-se-clique', itemCount: 1 },
  // #2652.1 / #2680.1 — même bloc : les secteurs exclus de « Tous les
  // filtres » rendaient une puce par ligne, deux grilles imbriquées posant
  // chacune leur nombre de colonnes sur un palier de fenêtre.
  { id: '2026-09-21-les-secteurs-de-decouvrir-se-lisent-en-colonnes', itemCount: 1 },
  // #2691.1 — un remplaçant du panneau « comptes prioritaires » se rendait en
  // texte nu, sans le même encadré que ses voisins.
  { id: '2026-09-21-un-remplacant-reprend-lencadre-de-ses-voisins', itemCount: 1 },
  // #2439.10 — « oublier » une mémoire faisait un DELETE SQL, contre la doctrine
  // du dépôt (« on archive, on ne supprime pas »). Trois tables archivent
  // désormais, et toutes les lectures excluent l'archivé.
  { id: '2026-09-21-une-memoire-oubliee-est-archivee', itemCount: 2 },
  // #2688.1 (retour bêta 21/09) — le bouton qui ouvre la décision de priorité
  // d'un compte (prioriser / écarter / rouvrir la question) affichait le
  // STATUT courant du compte (« À trancher ») comme son propre libellé, pas
  // l'action que le clic déclenche.
  { id: '2026-09-21-le-bouton-de-priorite-dit-ce-quil-fait', itemCount: 1 },
  // #2692.1 (retour bêta 21/09) — dans la file « Pistes à qualifier », une
  // piste sans date connue affichait son absence à la taille du LIBELLÉ de la
  // ligne (texte par défaut du composant partagé), pas à celle de la date
  // qu'elle remplace : la ligne dense perdait son alignement d'un coup d'œil.
  { id: '2026-09-21-la-piste-non-datee-se-lit-a-la-bonne-taille', itemCount: 1 },
  // #2404.7 — mesuré en production le 21/09/2026 : le panneau de notifications
  // ne rendait aucune source, sur 18 items. La messagerie connectée le disait
  // déjà (lot du 21/09) ; le signal d'achat, le type le plus visible, ne
  // relayait jamais la sienne (registre public, presse) alors qu'elle
  // existait déjà dans les données.
  { id: '2026-09-21-le-signal-dachat-dit-aussi-sa-source', itemCount: 1 },
  // #1954.22 — une pièce jointe du chat n'avait pas de menu pour changer sa
  // portée une fois attachée (« ce fil » ↔ « base de l'ESN », #1954.7) : la
  // seule sortie était de la retirer puis la rattacher.
  { id: '2026-09-23-changer-la-portee-dune-piece-jointe-deja-attachee', itemCount: 1 },
  // #1954.19 — une pièce jointe du chat n'affichait que son nom : impossible
  // de relire son contenu sans la retélécharger depuis son poste.
  { id: '2026-09-23-previsualiser-une-piece-jointe-deja-attachee', itemCount: 1 },
  // #2640.2 — le site web d'un compte s'affichait en lecture seule, sans dire
  // d'où il venait ni permettre de le corriger.
  { id: '2026-09-21-le-site-web-dit-do-il-vient-et-se-corrige', itemCount: 1 },
  // #2616.2 — le preset « comptes qui recrutent » ne croisait jamais le fait
  // (déjà calculé) qu'un employeur recruteur est un organisme public.
  { id: '2026-09-21-comptes-qui-recrutent-exclut-les-employeurs-publics', itemCount: 1 },
  // #2646.1 — le badge d'accès à un compte rendait un rang sans jamais dire
  // sur quoi il se fondait.
  { id: '2026-09-21-le-badge-dacces-dit-sur-quoi-il-se-fonde', itemCount: 1 },
  // #2640.1 — le choix automatique du site web d'un compte ne priorisait pas
  // encore l'identité résolue depuis le SIREN.
  { id: '2026-09-21-le-choix-du-site-web-complete-lordre-siren-e-mail-nom', itemCount: 1 },
  // #2310.54 — le contrat et la route API acceptaient déjà `objectType:
  // 'entity'`, mais l'écran n'ouvrait le tiroir de correction que sur une
  // personne (`objectType: 'person'` codé en dur). La vue Groupe, qui expose
  // les entités, porte désormais le même geste « Corriger » qu'une carte de
  // personne.
  { id: '2026-09-21-corriger-une-entite-comme-une-personne', itemCount: 1 },
  // #2299.27 — la diversification déjà existante par secteur (#2489.2) n'avait
  // pas d'équivalent territorial : à score égal, une recherche sur plusieurs
  // départements/régions pouvait rendre douze comptes de la même métropole
  // avant d'en montrer un ailleurs.
  { id: '2026-09-21-decouvrir-diversifie-aussi-par-territoire', itemCount: 1 },
  // #2435.6 — le serveur était injoignable (panne, quota, réseau) et l'écran
  // ne le disait jamais : la mesure existait, rien ne la montrait.
  { id: '2026-09-21-une-panne-serveur-se-dit', itemCount: 1 },
  // #2627.1 — l'en-tête « Score /10 » appelait bien le tri et le contrat le
  // portait, mais le schéma de recherche de la route recopiait sa propre liste
  // de quatre clés : `score_asc`/`score_desc` étaient jetés en silence.
  { id: '2026-09-21-le-portefeuille-se-trie-par-verdict', itemCount: 1 },
  // #2442.5 — une panne qu'on ne peut pas RETROUVER coûte deux fois : à la
  // personne, puis à qui cherche dans les journaux sans savoir quelle requête
  // regarder.
  { id: '2026-09-21-un-ecran-derreur-donne-sa-reference', itemCount: 2 },
  // #2436.4 / #2436.5 / #2436.6 / #2436.9 / #2436.15 / #2436.19 — le lot
  // « l'écran se tient sans souris et sans vision parfaite ».
  { id: '2026-09-21-lecran-se-tient-sans-souris', itemCount: 3 },
  // #2449 / #2400 — les quatre niveaux d'action deviennent une porte : le niveau
  // n'est plus une étiquette d'affichage, c'est ce qui autorise ou refuse.
  { id: '2026-09-21-laura-sait-jusquou-elle-a-le-droit-daller', itemCount: 4 },
  // #2383.1 — chaque action de connecteur (lire, préparer, écrire, envoyer…)
  // porte désormais son niveau de capacité, visible sur la carte de diagnostic.
  { id: '2026-09-21-le-niveau-dune-capacite-se-lit-sur-sa-carte', itemCount: 1 },
  // #2331 — un zéro résultat de rapprochement était calculé et testé, mais
  // aucun écran ne le lisait : le panneau de matching le propose désormais.
  { id: '2026-09-21-un-zero-resultat-propose-un-arbitrage', itemCount: 1 },
  // #2616.2 — un employeur public ne qualifie plus « comptes qui recrutent ».
  { id: '2026-09-21-qui-recrute-exclut-lemployeur-public', itemCount: 1 },
  // #2401.6 — le bandeau du matin compte ce qui a été préparé et dit,
  // au passé, que rien n'a été envoyé.
  { id: '2026-09-21-le-matin-compte-ce-qui-est-prepare', itemCount: 1 },
  // #2368.2 / .12 / .14 — le composer de message refuse un packet vide et
  // bloque une affirmation sans preuve, avant de facturer un appel modèle.
  { id: '2026-09-21-le-message-refuse-le-vague-et-linvente', itemCount: 2 },
  // #2648.1 — un échec de génération d'accroche retombait entièrement sur un
  // message générique, quelle que soit la cause réelle.
  { id: '2026-09-21-laccroche-dit-ce-qui-lempeche', itemCount: 1 },
  // #2170.19 (lot W20, registre 16/09) — la carte du pipe ne disait pas
  // combien de profils avaient déjà été positionnés sur les besoins d'un
  // projet, alors que le fait était déjà compté côté serveur pour chaque
  // besoin.
  { id: '2026-09-21-la-carte-du-pipe-compte-les-profils-positionnes', itemCount: 1 },
  // #2174.17 / #2174.25 / #2174.26 / #2174.30 (lot W20, registre 16/09) —
  // quatre champs existaient déjà au contrat de création d'un besoin (le
  // problème à résoudre, le démarrage, la durée, le type de contrat) sans
  // qu'aucune saisie de l'assistant ne les propose : ils ne s'écrivaient
  // qu'après coup, sur la fiche.
  { id: '2026-09-21-le-createur-de-besoin-capture-quatre-champs-de-plus', itemCount: 1 },
  // #2171.5 / #2171.7 / #2171.10 / #2171.12 / #2171.13 / #2171.14 / #2171.15
  // (lot W20, registre 16/09) — le dossier d'une opportunité dit maintenant
  // qui la porte, depuis quand elle existe, sa dernière activité, sa
  // prochaine action et son niveau de confiance dans son en-tête, et relie
  // les contacts du comité de décision (sponsor, décideur, prescripteur,
  // acheteur, utilisateur, bloqueur) — un rattachement qui fonctionnait déjà
  // côté API et qu'aucun écran ne lisait.
  { id: '2026-09-21-le-dossier-opportunite-dit-qui-quand-et-avec-qui', itemCount: 1 },
  // #2170.15 / #2170.17 / #2170.20 (lot W20, registre 16/09) — la carte du pipe
  // ne rendait ni l'owner, ni la dernière activité, ni le niveau de preuve,
  // alors que les trois étaient déjà calculés ailleurs (owner résolu côté
  // tableau, `updated_at` déjà servi, `evidence` déjà calculé par l'API et
  // effacé à la frontière TypeScript).
  { id: '2026-09-21-la-carte-du-pipe-dit-qui-quand-quelle-preuve', itemCount: 1 },
  // #2404.7 — une notification dit maintenant D'OÙ vient l'information
  // (ta messagerie connectée), quand la source est nommable.
  { id: '2026-09-21-une-notification-dit-sa-source', itemCount: 1 },
  // #2617.2 — mesuré en production le 21/09/2026 : le plan d'action disait sept
  // fois « Non produit », et chaque carte d'opportunité annonçait trois axes
  // absents. Doctrine #2613 : dans une liste, une absence ne fait aucune ligne.
  { id: '2026-09-21-le-dossier-ne-dit-plus-ce-quil-na-pas', itemCount: 4 },
  // #2621.1 — mesuré le 20/09/2026 : le pays du workspace alimentait déjà
  // l'analyse, jamais Découvrir. La liste de personnes reste désormais au
  // pays de l'espace par défaut, avec une bascule explicite pour l'ouvrir.
  { id: '2026-09-21-decouvrir-reste-au-pays-du-workspace', itemCount: 1 },
  // #2642.2 — « ville précise » et le rayon avaient été retirés de Découvrir
  // le 16/09/2026 (#2486) parce qu'ils ne filtraient rien. Le rayon revient,
  // branché pour de vrai sur le moteur déjà existant du registre.
  { id: '2026-09-21-un-rayon-autour-de-la-ville-dans-decouvrir', itemCount: 1 },
  // #2111.31 — la bande de sources d'« Aujourd'hui » disait « Gérer les
  // connexions » même le premier jour, quand rien n'est encore branché. Le
  // lien reste le même (Intégrations), seul le mot change avec le fait.
  { id: '2026-09-21-connecter-mes-outils', itemCount: 2 },
  // #2630.2 — ce qu'on voit pendant qu'une analyse tourne. La matière était
  // déjà sur le fil (`emitPhaseComplete(…, payload)`), le navigateur la jetait.
  { id: '2026-09-21-une-analyse-dit-ce-quelle-a-deja-trouve', itemCount: 2 },
  // #2630.1 (décision Louis 20/09/2026, QCM) — la passe rapide sur vingt
  // comptes : verdict Go / Prudence / Non, ses axes nommés, jamais un
  // pourcentage.
  { id: '2026-09-21-la-passe-rapide-sur-vingt-comptes', itemCount: 3 },
  // #2617.1 — RETENU : la veille d'un compte classait ses signaux en
  // jobs/news/legal/budget/stack/pains, qui ne correspondaient pas aux six
  // catégories métier demandées par Simon.
  { id: '2026-09-21-la-veille-classe-ses-signaux-en-six-categories-metier', itemCount: 1 },
  // #2165.60 — RÉFUTÉ EN PRODUCTION le 20/09/2026 : « qui recrute des
  // développeurs Java à Toulouse » listait tout comme « non pris en compte »
  // et rendait des résultats hors sujet, aucun à Toulouse ni dans le 31.
  { id: '2026-09-21-une-question-naturelle-change-vraiment-les-resultats', itemCount: 1 },
  // #2197.41 / #2298.7 (décision Louis 21/09/2026) — une saisie manuelle
  // « facturé » ne devient jamais une preuve de connecteur, et une relation
  // partenaire déclarée porte désormais qui l'a déclarée.
  { id: '2026-09-21-une-declaration-nest-pas-une-preuve', itemCount: 2 },
  // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
  // Deux vagues d'intégration lancées en parallèle ont livré les mêmes réglages
  // deux fois, sur TROIS écrans dont un mêlait deux sujets et doublait un
  // plafond. Ce que l'utilisateur VOIT : deux écrans, un par sujet.
  { id: '2026-09-21-les-reglages-despace-ont-un-seul-endroit', itemCount: 2 },
  // #2298.10 — chaque porte de l'onglet Accès ne portait qu'un nom et un
  // statut. Elle s'ouvre désormais sur un vrai détail : voie recommandée,
  // prérequis, première personne à voir, question à poser, ce qui vient
  // ensuite, un repli si ça ne marche pas, et — quand elle est écrite — la
  // raison de l'éviter (décision Louis du 21/09/2026, qui remplace celle du
  // 20/09 sur ce dernier point).
  { id: '2026-09-21-chaque-porte-dacces-souvre-sur-son-detail', itemCount: 2 },
  // #2298.8 — « Sur mes comptes » du pipeline partenaire calculait déjà deux
  // faits par ESN sans jamais les montrer : combien de tes comptes la
  // mémoire marché a observé cette société de services, et depuis quand elle
  // a été vue agir en rang 2 (sous-traitance) chez toi.
  { id: '2026-09-21-deux-faits-de-plus-par-esn', itemCount: 1 },
  // #2614.1 (correction) — réfuté en recette écran le 21/09/2026 : une
  // recherche qui remplit sa page perdait TOUS ses comptes écartés à la coupe
  // (triés derniers), avant même d'atteindre le compteur du 20/09 —
  // « N exclues » retombait à zéro, un motif de plus déjà nommé mais compté
  // sur une liste déjà tronquée.
  { id: '2026-09-21-decouvrir-compte-les-comptes-ecartes-meme-recherche-pleine', itemCount: 1 },
  // #2614.2 (correction) — réfuté en recette écran le 21/09/2026 : la notice
  // « recherche incomplète » du 20/09 ne se déclenchait JAMAIS sur une
  // recherche en texte libre (`/discover/registry`, le chemin de toute
  // recherche classique) — sa mesure n'existe que sur le chemin borné par
  // signal.
  { id: '2026-09-21-la-recherche-incomplete-se-declenche-enfin-en-texte-libre', itemCount: 1 },
  // #2615.1 (correction) — réfuté en recette écran le 21/09/2026 : seul le 1er
  // des cinq « Comptes prioritaires » du 20/09 portait sa raison datée — la
  // recherche de signaux datés restait bornée à trois candidats, posée avant
  // ce panneau de cinq.
  { id: '2026-09-21-cinq-comptes-prioritaires-ont-enfin-tous-leur-raison', itemCount: 1 },
  // #2068.24/.26/.27 (décision Louis 21/09/2026) — trois aires produit que
  // l'audit promettait (« Scoring », « Carte d'influence », « Messages »)
  // ne s'affichaient JAMAIS : leur seul porteur était écrit `null` en dur.
  // L'audit dit désormais, par aire, quels réglages de cet espace le
  // produit lit — et lesquels ne sont pas réglés.
  { id: '2026-09-21-laudit-dit-ce-quil-faut-configurer', itemCount: 1 },
  // #2113 / #2099 / #2101 / #2112 — la fondation de « Aujourd'hui » : un
  // en-tête qui résume la journée et propose un geste, une carte de priorité
  // qui dit ses facettes, un agenda du jour en une ligne, et trois
  // destinations qui disent à quoi elles servent.
  { id: '2026-09-21-la-fondation-daujourdhui', itemCount: 4 },
  // #2006.22 (décision Louis 20/09/2026, QCM) — réfuté en production le
  // 20/09 : chaque réponse du profil affichait la même coche, migrée ou
  // confirmée. Une réponse saisie ou corrigée par l'utilisateur est
  // désormais marquée `confirmed`, et le badge de statut reste éteint tant
  // qu'aucune réponse n'a jamais été réellement confirmée.
  { id: '2026-09-20-le-badge-confirme-dit-vrai', itemCount: 1 },
  // #2613 étendu (décision Louis du 20/09/2026) — « on n'affiche pas ce qu'on
  // n'a pas » gagne les FICHES de compte (organigramme + dossier), après les
  // listes de Découvrir. Une absence pure (« Entité non renseignée », « Forces
  // non renseignées »…) ne fait plus de ligne ; un score et sa raison de
  // fraîcheur de collecte restent nommés, eux.
  { id: '2026-09-20-une-fiche-de-compte-naffiche-pas-ce-quelle-ignore', itemCount: 1 },
  // #2614.1 — mesuré en production le 20/09/2026 : Découvrir savait déjà
  // compter les comptes écartés par le conseil de qualification, mais
  // l'écran ne lisait jamais ce compte (chaîne coupée à la normalisation).
  { id: '2026-09-20-decouvrir-nomme-les-comptes-ecartes', itemCount: 1 },
  // #2120.57 — mesuré en production le 20/09/2026 : le dialogue
  // d'enrichissement affichait « environ 0 s » pour une durée réelle sous la
  // seconde, et mélangeait les recherches sans résultat (quasi instantanées)
  // avec les enrichissements aboutis (30-85 s) dans la même médiane.
  { id: '2026-09-20-une-duree-sous-la-seconde-ne-vaut-pas-zero', itemCount: 2 },
  // #2645.2 (arbitrage Louis du 20/09/2026) — le modèle de revenu déclaré au
  // questionnaire était capté, stocké, transporté… et lu par personne pour
  // décider quoi que ce soit. Il change désormais deux choses, les deux que
  // Louis a nommées : l'angle d'attaque proposé et la cadence de relance.
  { id: '2026-09-20-ton-modele-de-revenu-change-les-recos', itemCount: 2 },
  // #2615.1 — cinq comptes prioritaires + remplaçants automatiques, chacun
  // avec sa raison (palier de fit nommé) — le suivi/écarté reste manuel.
  { id: '2026-09-20-cinq-comptes-prioritaires-automatiques', itemCount: 1 },
  // #2614.2 — un ou deux comptes trouvés dans Découvrir n'affichait ni panne
  // ni vide : rien. Un bandeau le dit maintenant et propose d'élargir.
  { id: '2026-09-20-decouvrir-dit-la-recherche-incomplete', itemCount: 1 },
  // #2644.1 — GA-43 : deux caches persistés (comptes, contacts) survivaient à
  // la bascule d'espace et au hard reload qui suit, montrant un instant la
  // liste de l'espace quitté sous le nom du nouveau.
  { id: '2026-09-20-basculer-despace-ne-melange-plus-rien', itemCount: 1 },
  // #2624.1 — territoire, taille d'effectif et exclusions cadraient déjà une
  // analyse lancée depuis l'écran ; ils étaient silencieusement ignorés quand
  // le lancement passait par la conversation avec Laura.
  { id: '2026-09-20-le-perimetre-voyage-jusquaux-appels', itemCount: 1 },
  // #2647.1 — les besoins que l'analyse a détectés chez un client (offres
  // d'emploi publiques) n'apparaissaient que dans la vue transverse de tous
  // les comptes (`/projects/needs`), jamais dans le dossier du compte
  // concerné. Une section « Besoins » apparaît désormais en tête du dossier,
  // cloisonnée à ce seul compte.
  { id: '2026-09-20-les-besoins-detectes-remontent-dans-le-dossier', itemCount: 1 },
  // #2628.1 — la porte d'entrée recommandée se classait sur la séniorité par
  // défaut : l'axe « offre » sortait du score tant que rien n'était saisi.
  // Il se préremplit désormais depuis les domaines d'expertise déclarés du
  // profil ESN, sans geste du commercial.
  { id: '2026-09-20-la-porte-dentree-se-classe-aussi-sur-loffre', itemCount: 1 },
  // #2632.1 — le badge « probablement parti » (employeur détecté ≠ compte)
  // n'existait que pour les DÉPARTS. La liste des contacts affiche désormais
  // aussi une ARRIVÉE : un employeur détecté qui correspond au compte, après
  // un employeur différent dans l'historique.
  { id: '2026-09-20-une-arrivee-se-voit-aussi', itemCount: 1 },
  // #2646.1 (arbitrage Louis du 20/09/2026) — l'accès à un compte se nomme
  // désormais : direct, rang 2, rang 3 ou plus, ou inconnu. Visible dès
  // Découvrir, avant toute fiche compte, pas seulement sur l'onglet Accès.
  { id: '2026-09-20-lacces-au-compte-se-nomme', itemCount: 1 },
  // #2404.3 — le niveau nommé (Information/Action/Urgent/Critique) était déjà
  // dérivé et écrit à la création de chaque notification, mais aucun écran ne
  // le lisait : la cloche affichait le titre et le corps, jamais le niveau.
  { id: '2026-09-20-le-niveau-des-notifications-sapplique-a-lecran', itemCount: 1 },
  // Trouvé en RECETTE de production, dans aucune issue : deux questions du
  // questionnaire de profil affichaient leur clé de traduction au lieu de leur
  // libellé, et l'une d'elles était obligatoire — un nouvel arrivant restait
  // coincé devant `profileQuestions.items.role_functions_practiced.label`.
  { id: '2026-09-20-deux-questions-affichaient-leur-cle', itemCount: 1 },
  // #2067.2 (arbitrage Louis du 20/09/2026) — le DERNIER point non répondu de
  // #2067 : l'audit commercial recommandait un nombre de comptes et de
  // rendez-vous par mois, mais rien pour les partenaires. Le moteur calcule
  // désormais une cible partenaires par archétype d'ESN, ancrée sur le nombre
  // de partenaires réguliers déclaré — et reste MUET quand il ne sait pas.
  { id: '2026-09-20-une-cible-de-partenaires-par-mois', itemCount: 1 },
  // #2084.24 — le cloisonnement par unité opérationnelle tenait en LECTURE de
  // fiche et tombait partout ailleurs : sur les six actions destructrices, et
  // sur les écrans qui agrègent le portefeuille. User-facing au sens strict —
  // ce qu'un commercial cloisonné voit et peut faire change.
  { id: '2026-09-20-le-cloisonnement-tient-aussi-en-ecriture', itemCount: 3 },
  // #2419.4 — un paiement partiel ne sort plus de la file de relance, et le
  // montant encaissé peut enfin se saisir.
  { id: '2026-09-20-un-paiement-partiel-nest-pas-un-paiement', itemCount: 3 },
  // #2430.9 (20/09/2026, décision Louis QCM) — « Supprimer » une conversation
  // avec Laura ARCHIVE ses messages désormais, elle ne les efface plus (le
  // mécanisme d'archivage existant, #1120, réutilisé — GA-26). Le bouton se
  // renomme « Retirer »/« Remove », pour ne plus promettre une suppression
  // qu'il ne fait pas.
  { id: '2026-09-20-une-conversation-sarchive-elle-ne-disparait-pas', itemCount: 1 },
  // #2088.26 — mesuré 20/09 : `company_locations` (implantation) n'avait
  // aucun catalogue à proposer. Un vrai référentiel des régions, guidé mais
  // toujours à texte libre.
  { id: '2026-09-20-les-regions-ont-leur-catalogue', itemCount: 1 },
  // Vague Y du 20/09/2026 — quatre livrables user-facing du même lot :
  // #2598.4 bis (affordance de correction permanente), #2058.2/.10 (deux
  // nouvelles questions du profil), #2195.50 (fenêtre « au-delà de 60 jours »
  // sur les renouvellements) et #2318.7/.8/.10 (panneau « Où ta correction
  // est arrivée »).
  { id: '2026-09-20-quatre-livraisons-de-la-vague-y', itemCount: 4 },
  // #2032.11 / #2088.34 / #2088.26 — sellerRole était déjà lu par les
  // prompts mais rien à l'écran ne s'y adaptait. Laura reste plus compressée
  // par défaut avec un dirigeant, signale une tension entre deux réponses du
  // questionnaire sans bloquer l'avancement, et le champ « Autre » (technos,
  // secteurs) propose le catalogue avant de créer une nouvelle orthographe.
  { id: '2026-09-20-le-questionnaire-sadapte-au-role', itemCount: 3 },
  // #2120.57 / #2297.23 — le dialogue « Enrichir ce contact ? » disait « Durée
  // : non mesurée » faute de source serveur. Chaque enrichissement mesure
  // désormais sa durée, et le dialogue annonce une estimation dès qu'assez de
  // mesures existent.
  { id: '2026-09-19-la-duree-dun-enrichissement-se-mesure', itemCount: 1 },
  // #2298.4 (réfuté en production le 19/09/2026) — deux comptes du même
  // espace se contredisaient sur l'état du CRM parce que l'axe Relation était
  // calculé au moment de l'analyse, jamais rafraîchi à l'affichage.
  { id: '2026-09-19-la-relation-dit-toutes-ses-sources', itemCount: 2 },
  // #1950.14 / #1950.18 / #1950.20 / #1950.22 — un plan de Laura (plusieurs
  // cartes dans une réponse) se lance en entier ou par sa 1re étape, chaque
  // étape a son état, et une étape dont le prérequis DÉCLARÉ a échoué est
  // bloquée. Rien de ce qui écrit hors de Bellum ne part au passage du plan.
  { id: '2026-09-19-le-plan-de-laura-se-lance-en-entier', itemCount: 3 },
  // #2306.25 — décision Louis 19/09/2026 : sur un dossier dont les secteurs ou
  // les offres ont changé depuis le calcul, un bandeau propose le recalcul
  // avec son coût affiché — rien ne part sans le clic.
  { id: '2026-09-19-le-dossier-propose-son-recalcul', itemCount: 1 },
  // #2323.33 — décision Louis 19/09/2026 : sur la fiche d'un besoin, Laura
  // nomme laquelle des questions manquantes poser en premier — l'économie
  // passe devant les cinq autres axes du verdict — et dit pourquoi.
  { id: '2026-09-19-laura-pose-dabord-la-question-economie', itemCount: 1 },
  // #2298.4 — l'axe RELATION de l'adressabilité lit maintenant tes missions,
  // ton agenda, tes e-mails (dates seulement) et tes corrections, en plus de
  // ton CRM.
  { id: '2026-09-19-la-relation-se-lit-a-plusieurs-sources', itemCount: 1 },
  // #2261.13 (décision Louis 19/09) — la fiche d'un outil connecté sur
  // /integrations affiche maintenant sa latence probable MESURÉE sur les
  // synchronisations réelles de l'espace, jamais une valeur de documentation.
  { id: '2026-09-19-la-latence-se-mesure', itemCount: 1 },
  // #2532.2 bis — la recherche ciblée par thème dit désormais son résultat
  // (combien trouvées, leurs noms, ou pourquoi zéro) à l'endroit du geste,
  // et ne compte plus un contact hors thème comme s'il en venait.
  { id: '2026-09-19-la-recherche-par-theme-dit-ce-quelle-trouve', itemCount: 2 },
  // #2068.1/.24-.31 — décision Louis 19/09/2026 (2068.11) : la replanification
  // vit dans Actions, l'audit y renvoie. Le « Plan à 4 semaines » lit
  // désormais les actions ouvertes de l'utilisateur au lieu de rester
  // « non mesuré » en dur.
  { id: '2026-09-19-le-plan-de-laudit-vient-dactions', itemCount: 2 },
  // #2650.2 — les rafraîchissements d'axe déjà payés dans les 6 h, débités
  // AVANT le correctif #2650.1, sont remboursés par un geste d'opérateur
  // (ciblé, espace par espace) ; la ligne apparaît au relevé de crédits.
  { id: '2026-09-19-un-rafraichissement-deja-paye-est-rembourse', itemCount: 1 },
  // #2196.31 — « Marquer non applicable » un relevé d'activité : une exception
  // tracée (qui, quand, pourquoi), réversible, qui prime sur le contrat pour
  // CE mois, visible au journal de la mission.
  { id: '2026-09-19-un-releve-se-marque-non-applicable', itemCount: 2 },
  // #2159.26 — les étiquettes (colonne « Tags » d'un export CRM) arrivent sur
  // les contacts et les comptes : rattachées toutes seules à l'import,
  // affichées sur les fiches, filtrables dans les deux listes.
  { id: '2026-09-19-les-etiquettes-arrivent-avec-limport', itemCount: 2 },
  // #2165.55 / #2165.56 / #2151.34 — RÉFUTÉ en prod le 19/09 : sur le panneau
  // Partenaires de Découvrir, 0 carte sur 24 portait un bloc complémentarité
  // et 0 ligne un statut de rang 2 ; le filtre « Tient le rang 2 quelque
  // part » laissait les 24 cartes. Chaque ligne dit désormais sa
  // complémentarité (ou pourquoi elle reste inconnue) et son rang 2 —
  // déclaré par l'ESN elle-même, observé sur un dossier de ton espace, ou
  // inconnu, jamais confondus.
  { id: '2026-09-19-les-partenaires-disent-complementarite-et-rang-deux', itemCount: 2 },
  // #2165.60 — RÉFUTÉ en prod le 19/09 : une phrase libre en mode Besoins
  // ("qui recrute des développeurs Java à Toulouse") rendait des résultats
  // hors sujet, sur des départements sans rapport, avec un rail resté VIDE. Le
  // texte libre part toujours comme une recherche registre ; ce qu'il sait
  // poser (la ville) atteint désormais la requête réellement envoyée.
  { id: '2026-09-19-la-phrase-libre-pose-ce-quelle-peut-sur-le-rail', itemCount: 1 },
  // #2165.15 — RÉFUTÉ en prod le 19/09 : la modale « Pistes rapides » de
  // Découvrir listait 9 pistes et aucune « Qui bougent actuellement ». La
  // dixième pose les trois signaux d'intention que le rail sait demander
  // (recrutement, appel d'offres, marché attribué) sur la fenêtre la plus
  // courte (30 jours), là où les autres pistes signal couvrent 90 ou 180 j.
  { id: '2026-09-19-une-piste-pour-ce-qui-bouge-actuellement', itemCount: 1 },
  // #2165.44 / #2165.46 / #2165.48 — RÉFUTÉS en prod le 19/09 : sur
  // /discover?type=needs, resserrer la fenêtre de fraîcheur ou le département
  // ne changeait RIEN à la liste de besoins (ils ne s'appliquaient qu'à la
  // requête serveur, jamais aux lignes déjà rendues) ; le niveau de preuve
  // filtrait bien mais sans jamais dire combien de lignes il avait retirées.
  { id: '2026-09-19-les-lignes-de-besoin-tiennent-la-fenetre-et-la-zone', itemCount: 1 },
  // #2291.9 — le nombre de comptes que Découvrir propose suit maintenant la
  // taille d'équipe commerciale déclarée au profil (grille 1-3/4-8/9+).
  { id: '2026-09-19-le-volume-propose-suit-ta-capacite-commerciale', itemCount: 1 },
  // #2165.51 — le panneau Découvrir › Partenaires a maintenant un filtre
  // Expertise (secteur résolu au registre), même patron que les filtres
  // « Clients observés »/« Relation déjà qualifiée ».
  { id: '2026-09-19-le-filtre-partenaires-a-son-expertise', itemCount: 1 },
  // #2291.2 (lot R) — le modèle de contrat observé de Découvrir SURVIT à
  // l'analyse complète d'un compte : sa fiche l'affiche, avec sa source, sa
  // période et son jour de constat — et un dossier analysé avant cette
  // capacité le dit plutôt que de rester silencieux.
  { id: '2026-09-19-le-modele-de-contrat-survit-a-la-recherche', itemCount: 2 },
  // #2291.2 — DÉCISION Louis 19/09 : Découvrir OBSERVE comment une entreprise
  // contractualise (offres qu'elle publie, avis de marchés publics qu'elle
  // passe), et un filtre « recourt au freelance / à la régie » s'appuie
  // dessus — un compte non observé reste inconnu, et le filtre le dit.
  { id: '2026-09-19-decouvrir-observe-le-modele-de-contrat', itemCount: 2 },
  // #2081.14 — les règles d'espace (DÉCISION Louis 19/09/2026) : posées par
  // l'administrateur dans Réglages › Règles d'espace, elles priment sur les
  // réglages individuels — comptes d'une unité privés, export réservé aux
  // administrateurs. Lues par l'API à l'endroit qui décide, avec la trace de
  // qui les a changées et quand.
  // #2081.14 (décision Louis 19/09) — la règle d'export ne ferme que la SORTIE
  // de données, et tous les chemins de sortie la lisent (item4).
  { id: '2026-09-19-les-regles-despace', itemCount: 4 },
  // #2297.51 — décision Louis 19/09/2026 : l'opposition d'une personne effacée
  // est TOUJOURS posée, et le ledger de corrections d'organigramme est purgé.
  { id: '2026-09-19-un-effacement-pose-toujours-son-opposition', itemCount: 2 },
  // #2297.51 — décisions Louis 19/09/2026 : l'effacement purge l'organigramme
  // tout de suite, et l'opposition d'une personne effacée ne reste qu'en empreinte.
  { id: '2026-09-19-un-effacement-ne-laisse-rien-de-lisible', itemCount: 2 },
  // #2297 — décisions Louis 19/09/2026 (QCM) : effacer une personne prospectée
  // (RGPD art. 17), et le catalogue des champs interdits appliqué à la collecte.
  { id: '2026-09-19-une-personne-peut-etre-effacee', itemCount: 3 },
  // #2297.51/.52/.54/.57 — les règles de conformité de l'enrichissement
  // (décisions Louis 19/09/2026) : la joignabilité ne fait plus que départager.
  { id: '2026-09-19-lenrichissement-a-ses-regles-de-conformite', itemCount: 3 },
  // #2195.12 — la colonne « Manager » du tableau des missions (et de
  // `/missions/renouvellements`) : le manager du/des consultant(s) affecté(s),
  // résolu côté serveur, jamais deviné. Colonne optionnelle, décochée par
  // défaut.
  { id: '2026-09-19-la-colonne-manager-arrive-sur-les-missions', itemCount: 1 },
  // #2151.33/.34 — les chips « Relation déjà qualifiée » et « Tient le rang 2
  // quelque part » de Découvrir › Partenaires disent maintenant combien d'ESN
  // ils ont retirées, et combien faute de savoir (jamais parce qu'on sait
  // « non ») — avec un bouton pour retirer le chip nommé. Le message générique
  // « aucune ESN dans cette recherche » ne s'affiche plus quand ce sont ces
  // chips, et non la recherche elle-même, qui ont vidé la liste.
  { id: '2026-09-18-le-filtre-partenaires-dit-ce-quil-a-retire', itemCount: 1 },
  // #2544.1 — le filtre RÉGION de Découvrir restreint vraiment la liste, et la
  // ville affichée est celle de l'établissement qui a matché la zone, pas
  // toujours le siège du groupe.
  { id: '2026-09-18-le-filtre-region-atteint-la-bonne-source', itemCount: 1 },
  // #2532.2 — retour client : chercher des contacts sur un métier absent des
  // thèmes IT ne retombait plus que sur le mot-clé tapé littéralement, sans
  // expansion. La recherche élargit maintenant le périmètre à la variante
  // grammaticale du métier (masculin/féminin), pour n'importe quelle
  // profession, IT ou non.
  { id: '2026-09-18-la-recherche-de-contacts-hors-informatique', itemCount: 1 },
  // #2598.4 — le bouton « corriger » d'un champ de fiche (contact, compte…)
  // se voyait seulement au survol de la souris : invisible au doigt sur
  // mobile/tablette. Il se voit maintenant d'emblée sur un pointeur tactile,
  // reste atteignable au clavier et garde sa cible de 44 px.
  { id: '2026-09-18-corriger-un-champ-se-voit-sans-survol', itemCount: 1 },
  // #2060.9 — sur une réponse libre du questionnaire d'onboarding, un bouton
  // explicite fait reformuler par Laura ; les deux versions s'affichent, seul
  // ce que l'utilisateur choisit est enregistré.
  { id: '2026-09-18-laura-reformule-une-reponse-libre', itemCount: 1 },
  // #2151.32 — le troisième filtre partenaire de Découvrir : ne garder que
  // les ESN que la mémoire marché a observées chez tes clients, sur le même
  // modèle que « relation existante » et « ouverture au rang 2 ».
  { id: '2026-09-18-clients-observes-decouvrir-partenaires', itemCount: 1 },
  // #2173.56 — l'état vide des besoins ouverts ouvre désormais le dépôt de
  // PLUSIEURS fiches de poste d'un coup (jamais un tableur) : chaque fichier
  // s'extrait indépendamment, un échec est nommé sans bloquer les autres, et
  // rien ne se crée sans une prévisualisation relue et cochée.
  { id: '2026-09-18-importer-plusieurs-fiches-de-poste-dun-coup', itemCount: 1 },
  // #2173.29 / #2173.56 — la colonne « Télétravail » de la liste des besoins
  // ouverts, et le CTA honnête de son état vide (mène à l'import unitaire
  // existant — le dépôt d'une fiche de poste — jamais à un import de masse
  // qui n'existe pas encore).
  { id: '2026-09-18-les-besoins-disent-le-teletravail-et-simportent', itemCount: 2 },
  // #2567.3 — la démonstration montre aussi CRA, facturation, bons de
  // commande et vivier dans « Ce qui attend ta décision » — quatre natures
  // de plus, produites par la même dérivation que le balayeur nocturne.
  { id: '2026-09-18-la-demo-montre-cra-facturation-po-vivier', itemCount: 1 },
  // #2067.2 / .4 / .5 / .6 — l'audit commercial arbitre ta charge active :
  // partenaires, créneaux, réserve et éléments à reporter, dérivés de tes
  // réponses par une règle lisible, ou « non établi » avec la réponse à donner.
  // Reprise H26 (décisions Louis du 18/09) : la question « avec combien de
  // partenaires ? » et un seul nombre de fronts sur la relecture et l'audit.
  { id: '2026-09-18-laudit-arbitre-ta-charge-active', itemCount: 5 },
  // #2166.56 — analyser une SÉLECTION de Découvrir en un clic : le coût EXACT
  // (ce que le lancement débitera réellement, jamais un prix de grille × N)
  // s'annonce avant tout débit, rien ne part sans ce clic. Libellé corrigé le
  // même soir : le devis sur-annonçait une entreprise déjà analysée.
  { id: '2026-09-18-analyser-une-selection-decouvrir', itemCount: 1 },
  // #2288.2/.3/.4 — « Où placer ce profil ? » savait montrer des environnements
  // compatibles, jamais vérifier lesquels bougent aujourd'hui. Trois étapes
  // désormais : présélectionner (gratuit), vérifier (le coût est annoncé
  // avant), conserver (ce qui est vérifié ne se repaie pas). La vérification
  // reste FACULTATIVE — c'est ce qui l'empêche d'être un péage.
  // #2288.4 (c66, 18/09) — le devis nomme France Travail, la source publique
  // prévue sans gate d'archétype (item6), puis BOAMP/DECP là où la collecte
  // les interrogera réellement (item7).
  { id: '2026-09-18-verification-a-la-demande', itemCount: 7 },
  // #2086.17 — le hero de bienvenue de l'onboarding gagne de la respiration,
  // une composition éditoriale (panneau dédié) et un diagramme léger qui
  // relie les trois étapes de la promesse (comprendre, identifier, préparer).
  { id: '2026-09-18-le-hero-de-bienvenue-respire', itemCount: 1 },
  // #2612 — le zoom / dézoom de la carte des sites d'un compte ne
  // fonctionnait plus une fois la carte chargée : l'attache du comportement
  // D3 loupait le nœud SVG réel (chargé après coup), molette, glisser et les
  // boutons +/- restaient inertes malgré le curseur « grab » promis.
  { id: '2026-09-18-le-zoom-de-la-carte-des-sites', itemCount: 1 },
  // #2074.10-.15 / #2090.7 — l'audit commercial se termine par ses premiers
  // mouvements, dérivés des ruptures déjà mesurées plus haut.
  { id: '2026-09-18-laudit-se-termine-par-trois-mouvements', itemCount: 4 },
  // #2602.1 (lot H5) — « Découvrir le produit en démo » de l'onboarding menait
  // au site marketing au lieu de la vraie démo de l'app ; il le dit maintenant
  // avant le clic, puisqu'il remplace la session en cours.
  { id: '2026-09-18-le-bouton-de-demonstration-mene-a-la-demonstration', itemCount: 1 },
  // #2087.9 / #2088.3 — réfuté en production le 18/09 : les cartes de « Où en
  // est ton activité aujourd'hui ? » n'avaient aucune icône, et les 18 rôles
  // de « Quel est ton rôle principal ? » aucune description.
  { id: '2026-09-18-icones-maturite-et-descriptions-role', itemCount: 2 },
  // #2261.8/#2261.16 — les fiches HubSpot, Salesforce, Google Workspace,
  // Microsoft 365 et Notion de l'écran Intégrations déclarent maintenant leur
  // période couverte plutôt que de la laisser « non précisée » en silence.
  { id: '2026-09-18-manifeste-connecteur-periode-couverte', itemCount: 1 },
  // #2650.1 — mesuré en production le 18/09/2026 : un second clic sur
  // « Rafraîchir » PENDANT que la phase tournait encore (avant que la fenêtre
  // anti-double-clic de 6h ne s'écrive) rejouait la phase et débitait un
  // second crédit. L'axe est désormais réservé dès le premier clic.
  { id: '2026-09-18-un-clic-pendant-le-rafraichissement-ne-coute-rien', itemCount: 1 },
  // #2565.10 — le premier adaptateur de facturation : Odoo reçoit un
  // BROUILLON de facture client (jamais validé ni envoyé), depuis la fiche
  // d'une mission prête, après une prévisualisation qui le dit.
  { id: '2026-09-18-odoo-brouillon-de-facture', itemCount: 3 },
  // #2195.36/.48/.52 — le panneau de décision de renouvellement pose un
  // bouton « Créer une action », montre bien les deux points à préparer
  // (client et consultant) sans que l'un ne disparaisse, et le copilote
  // n'engage plus jamais un renouvellement sans dire à qui, sur quoi, et
  // avec quelle preuve.
  { id: '2026-09-18-le-panneau-de-renouvellement-finit-son-tour', itemCount: 3 },
  // #2074.26 — la carte « premier aperçu du marché » de l'onboarding dit
  // maintenant, à côté de la gratuité déjà affichée, qu'aucun compte n'est
  // créé automatiquement : elle ne fait qu'une lecture.
  { id: '2026-09-18-marche-aucun-compte-automatique', itemCount: 1 },
  // #2075.25 — après avoir cliqué « Valider » sur l'audit commercial, un
  // message de remerciement ponctuel confirme que le contexte est suffisant
  // — distinct du statut permanent « Validé le … », qui reste affiché seul
  // sur un rechargement.
  { id: '2026-09-18-audit-merci-contexte-suffisant', itemCount: 1 },
  // #2008.10 — la relecture avant de générer l'audit dit maintenant que
  // l'audit ne s'actualise qu'au clic sur « Générer mon audit », jamais
  // pendant l'édition des réponses.
  { id: '2026-09-18-laudit-sactualise-a-la-validation', itemCount: 1 },
  // #2108.37 — mesuré à l'écran le 18/09 : la tuile « Messages (7j) » du
  // cockpit personnel ne menait nulle part au clic. Elle ouvre maintenant la
  // messagerie.
  { id: '2026-09-18-la-tuile-messages-mene-a-la-messagerie', itemCount: 1 },
  // #2037.1/.3/.4/.5/.6/.11 — le questionnaire d'entrée demande maintenant qui
  // fait quoi au-delà du commercial : associés, recruteurs, delivery,
  // marketing, ops, et comment l'équipe se coordonne.
  { id: '2026-09-18-qui-fait-quoi-au-dela-du-commercial', itemCount: 1 },
  // #2081.1/.2/.3/.7/.11/.12 — après l'audit commercial, une carte propose la
  // collaboration : la question, ce qui est partagé/personnel/visible, puis
  // seulement ensuite l'invitation ou le report — jamais avant.
  { id: '2026-09-18-collaboration-apres-laudit', itemCount: 1 },
  // #2114.16-.27 (lot FA, 18/09/2026) — sept objectifs commerciaux nommés,
  // cible + réalisé + période + couverture, sur le tableau de bord personnel.
  { id: '2026-09-18-mes-objectifs-commerciaux', itemCount: 3 },
  // #2120.48/#2120.50 — un bouton « Confronter avec mon CRM » sur la fiche
  // compte propose les paires de contacts probablement dupliquées entre le
  // CRM branché et Bellum, sur le dernier instantané déjà en base (aucun
  // appel live) ; il ne fusionne jamais, le seul geste est de masquer une
  // fiche, et l'écran montre la date de cet instantané.
  { id: '2026-09-18-confronter-avec-le-crm', itemCount: 2 },
  // #2602.1 — la démonstration se quittait en fermant l'onglet, la seule
  // issue trouvée en recette : un bouton dans le bandeau « Mode démo » rend
  // maintenant la main sur l'espace réel.
  { id: '2026-09-18-quitter-la-demonstration', itemCount: 1 },
  // #2598.2/#2598.3 — un numéro ou un e-mail cherché par un enrichissement et
  // resté vide le dit maintenant, au lieu de disparaître de la fiche sans un
  // mot ; la date d'un prochain essai est montrée quand l'idempotence de
  // crédit protège encore le canal.
  { id: '2026-09-18-le-numero-dit-non-trouve', itemCount: 1 },
  // #2591 — un rafraîchissement ciblé qui ne recalcule pas le score de
  // priorité (ex. « Signaux » seul) le DIT désormais, au lieu de laisser
  // lire « rien n'a bougé ».
  { id: '2026-09-18-un-score-non-recalcule-se-nomme', itemCount: 1 },
  // #2591.6 — même correctif que #2591.1, appliqué à la CONFIANCE : un
  // rafraîchissement ciblé qui ne recalcule pas la confiance (ex. « Contacts »
  // seul) le DIT désormais.
  { id: '2026-09-18-la-confiance-non-recalculee-se-nomme', itemCount: 1 },
  // #2541 — passer à la salve de questions suivante (ou revenir en arrière)
  // remet maintenant la vue en haut du CONTENEUR qui défile réellement, plus
  // seulement la fenêtre.
  { id: '2026-09-18-le-defilement-remonte-le-bon-element', itemCount: 1 },
  // #2295.8 / #2295.9 — le chemin de contacts recommandé explique chaque
  // personne sur SIX dimensions distinctes (pourquoi, pourquoi maintenant,
  // étape servie, ce qui est débloqué, et ensuite, la limite), chacune nommée
  // absente plutôt qu'inventée quand elle n'est pas mesurable, et porte sa
  // propre anti-recommandation « ne commence pas par… ».
  { id: '2026-09-18-contact-explication-six-dimensions', itemCount: 2 },
  // #2031.5 / #2045.5 — décision Louis 18/09 : le questionnaire d'entrée
  // montre le vocabulaire brut du CRM branché à côté des questions secteurs
  // et zones géographiques, jamais une réponse cochée à sa place.
  { id: '2026-09-18-le-crm-propose-sans-remplir', itemCount: 2 },
  // #2544.2 — une carte de Découvrir nomme les personnes qu'une source a
  // publiées, chaque fait avec sa provenance et sa date ; ce qui n'est pas
  // connu d'elles est nommé, jamais emprunté au siège de l'entreprise.
  { id: '2026-09-18-les-personnes-nommees-sur-une-carte', itemCount: 3 },
  // #2165.38 — la localisation d'une personne devient un filtre de Découvrir :
  // le lieu de travail collecté voyage jusqu'à la liste, et ce qu'on ignore
  // continue de se dire « non su » plutôt que d'emprunter le siège.
  { id: '2026-09-18-ou-travaille-cette-personne', itemCount: 2 },
  // #2271.9/.16 — le compte déjà affiché à l'écran porte désormais sa fiche
  // jusque dans le prompt : Laura peut rendre la carte de compte sans avoir
  // à ré-interroger l'outil, ce qui manquait quand le compte était déjà en
  // contexte de conversation ; les éléments prioritaires rejoignent
  // « Prochaine action ».
  { id: '2026-09-18-laura-rend-la-carte-de-compte', itemCount: 1 },
  // #1943.10 — une carte d'enrichissement qui n'a rien trouvé le dit, au lieu
  // de se lire comme une fiche complétée.
  { id: '2026-09-18-un-enrichissement-vide-le-dit', itemCount: 1 },
  // #1903.22 — Laura ne dépense sa question de clarification, avant d'ouvrir
  // un écran, que sur le critère qui bloque vraiment l'ouverture.
  { id: '2026-09-18-une-seule-question-avant-douvrir-un-ecran', itemCount: 1 },
  // #1943.17 — un timeout que Laura ne peut pas diagnostiquer seule propose
  // désormais un lien vers le support, au lieu de laisser la personne deviner.
  { id: '2026-09-18-support-sur-resultat-inconnu', itemCount: 1 },
  // #1956.26 — la notice affichée avant le premier message vocal dit
  // maintenant explicitement « Assistante IA » (article 50 EU AI Act).
  { id: '2026-09-18-mode-vocal-mention-assistante-ia', itemCount: 1 },
  // #2060.1 → .8/.10 — le questionnaire d'entrée se ferme sur une question
  // ouverte, avec ses huit amorces.
  { id: '2026-09-18-le-questionnaire-ferme-sur-une-question-ouverte', itemCount: 1 },
  // #2294.2 — Découvrir › Contacts : un filtre « nombre max » de plus, une
  // taille de liste plafonnée en dernier, jamais un critère qui exclut une
  // personne en particulier.
  { id: '2026-09-18-decouvrir-contacts-nombre-max', itemCount: 1 },
  // #2196.18 — chaque ligne du relevé d'activité dit désormais la prochaine
  // action (relancer pour dépôt, valider avec le client, attendre le
  // redépôt…), dérivée du statut — rien sur un relevé déjà validé.
  { id: '2026-09-18-cra-prochaine-action', itemCount: 1 },
  // #2165.40 — un troisième filtre pour la liste de personnes de Découvrir :
  // « Poste daté », qui ne garde que les contacts dont la fonction porte une
  // date et une source, jamais un verdict « vérifié ».
  { id: '2026-09-18-decouvrir-poste-date', itemCount: 1 },
  // #2033.2-.10 (D3, décision Louis 18/09/2026) — le questionnaire demande le
  // périmètre d'autorité, et Laura cesse de proposer une action hors de ce
  // périmètre en le disant.
  { id: '2026-09-18-le-perimetre-dautorite-cadre-ce-que-laura-propose', itemCount: 2 },
  // #2489.3 (décision Louis 18/09, D1) — mesuré en production sur un espace réel :
  // une recherche en texte libre rendait 24 résultats, dont 0 dans les 5 secteurs
  // cibles déclarés. La cible filtre désormais TOUJOURS, l'écran dit combien il a
  // écarté, et un bouton ramène le reste.
  { id: '2026-09-18-decouvrir-filtre-sur-ta-cible', itemCount: 2 },
  // #2044.2/.3/.5/.6, #2151.33/.34, #2543.3b/.3c/.3d/.5c/.5d/.5e/.5f,
  // #2502.2, #2588 — vague 18/09 L : canaux d'entrée nommés, deux filtres
  // Découvrir, bandeau de collecte avec son bouton, stock de contacts mince
  // expliqué, section vide qui dit pourquoi, débordement horizontal contenu.
  { id: '2026-09-18-canaux-filtres-decouvrir-collecte', itemCount: 6 },
  // #2151.59 — une note libre sur un candidat Découvrir, retrouvée après
  // qu'il devienne un dossier de portefeuille.
  { id: '2026-09-18-note-candidat-decouvrir', itemCount: 1 },
  // #2118.48 — score, badge et phrase de verdict visibles au chargement d'un
  // dossier de compte, sans défiler — sur tous les onglets, pas seulement
  // Synthèse.
  { id: '2026-09-18-le-verdict-se-voit-sans-defiler', itemCount: 1 },
  // #2594 — dans une carte « Ce qui me manque », le lien qui dit comment
  // combler le manque se clique désormais, au lieu de montrer sa syntaxe.
  { id: '2026-09-18-laura-lien-comment-obtenir', itemCount: 1 },
  // #2542.2/.3 — un dossier de compétences qui échoue le dit, avec sa raison
  // et un moyen de réessayer ; une lecture partielle est nommée, jamais
  // confondue avec des compétences à zéro.
  { id: '2026-09-18-un-document-qui-echoue-le-dit', itemCount: 2 },
  // #2031.3 — le rôle avec lequel tu as été invité (commercial, recrutement)
  // prérempli la question « fonctions exercées » du profil progressif, sans
  // jamais la faire disparaître ni écraser une réponse déjà donnée.
  { id: '2026-09-18-le-role-invite-prepare-ton-profil', itemCount: 1 },
  // #2288.1/.5 — « Environnements structurellement compatibles » dit ce
  // qu'elle SAIT, et nomme ce qu'elle n'a pas vérifié : un signal actuel daté
  // ou son absence nommée, et quatre mesures au lieu d'un total unique.
  { id: '2026-09-18-marche-inverse-dit-ce-quil-sait', itemCount: 2 },
  // #2261.8 / #2261.13 / #2261.16 — la fiche d'un outil branché dit
  // maintenant sa période couverte, sa latence et son éventuelle bêta.
  { id: '2026-09-18-le-manifeste-des-outils-se-lit-a-lecran', itemCount: 1 },
  // #2295.2/.3/.4/.5 — le chemin de contact recommandé porte maintenant un
  // groupe et huit axes nommés, un contact écarté à la porte dit pourquoi, et
  // un contact non vérifié ne devient jamais « première porte ».
  { id: '2026-09-18-le-rang-dun-contact-se-justifie', itemCount: 2 },
  // #2489.1 — retour bêta « bcp trop d'espace perdu par carte » : une carte
  // Découvrir sans signal daté ne réserve plus un titre et une phrase vides.
  { id: '2026-09-18-une-carte-decouvrir-ne-reserve-plus-de-place-pour-rien', itemCount: 1 },
  // #2572.1/.2 — « Reprendre la reconfiguration » (Réglages › Profil) ouvre
  // enfin le questionnaire, même quand un report plus ancien traînait encore.
  { id: '2026-09-18-reprendre-la-reconfiguration-ouvre-vraiment', itemCount: 1 },
  // #2088.33 — la progression du questionnaire (le bandeau d'étapes et le
  // compteur « N questions restantes ») ne compte plus une valeur PROPOSÉE
  // par le préremplissage tant qu'elle n'a pas été confirmée ou modifiée.
  { id: '2026-09-18-un-prerempli-non-confirme-ne-compte-pas', itemCount: 1 },
  // #2120.61 / #2120.64 / #2120.68 / #2120.70 — la fiche contact dit d'où
  // vient chaque coordonnée, ce qu'elle a coûté, et ce qu'un enrichissement
  // n'a PAS pu faire plutôt que de le taire.
  { id: '2026-09-18-confiance-et-cout-par-contact', itemCount: 3 },
  // #2587 — zéro ligne n'est pas zéro risque : un axe sans donnée ne compte
  // plus comme un axe rassurant.
  { id: '2026-09-18-un-axe-sans-donnee-nest-pas-un-axe-rassurant', itemCount: 1 },
  // #2589 — l'onglet « Une opportunité » du sélecteur de portée de Laura
  // rendait bien SIX onglets, mais seulement CINQ panneaux : le sixième ne
  // faisait rien au clic. Branché.
  { id: '2026-09-18-scope-dialog-opportunite', itemCount: 1 },
  // #2592 / #2118.48 — deux phrases que la Synthèse ne finissait pas
  // d'écrire, et un score qui s'affichait nu sur un dossier ancien.
  { id: '2026-09-18-la-synthese-finit-ses-phrases', itemCount: 3 },
  // #2327.26 — Laura peut désormais expliquer pourquoi deux fiches du vivier
  // semblent être la même personne.
  { id: '2026-09-18-laura-explique-rapprochement-talents', itemCount: 1 },
  // #2173.41/.48/.49 — la barre de sélection des besoins archive, prépare des
  // actions de suivi, et la ligne d'un positionnement planifie un entretien.
  { id: '2026-09-18-la-barre-de-selection-finit-son-travail', itemCount: 3 },
  // #2551.4 — depuis un consultant, « Où placer ce profil ? » montre
  // maintenant les interlocuteurs de chaque compte compatible, pas seulement
  // le compte lui-même.
  { id: '2026-09-18-reverse-market-interlocuteurs', itemCount: 1 },
  // #2035.1/.2/.8 — « nos consultants » distingue maintenant l'activité, son
  // groupe et sa BU, et l'effectif porte sa date.
  { id: '2026-09-18-effectif-groupe-bu-fraicheur', itemCount: 3 },
  // #2571.3 — depuis un appel d'offres importé, un lien direct vers l'aperçu
  // du besoin qu'il propose.
  { id: '2026-09-18-appel-doffres-vers-apercu-du-besoin', itemCount: 1 },
  // #2565.9/#2565.11 — depuis la fiche d'une mission, créer la facture
  // préparée chez l'outil de gestion connecté et suivre son état.
  { id: '2026-09-18-facture-chez-loutil-connecte', itemCount: 1 },
  // #2165.64 — un rechargement, ou un lien partagé, retrouve exactement la
  // recherche de Découvrir qui venait d'être lancée.
  { id: '2026-09-18-decouvrir-les-filtres-survivent-au-rechargement', itemCount: 1 },
  // #2271.16/.19/.20 — Laura montre la fiche d'un compte, son historique et un
  // fichier exportable directement dans la conversation, sans en sortir.
  { id: '2026-09-18-laura-fiche-timeline-fichier', itemCount: 3 },
  // #2579.2 — le bouton « Quitter » du questionnaire d'accueil rend
  // maintenant vraiment la main, comme « Reprendre plus tard » ; #2537.1 —
  // une réponse tapée pendant une coupure réseau reste sur l'appareil et le
  // questionnaire reprend exactement où on l'a laissé ; #2537.3 — recliquer
  // « Continuer » après un échec n'enregistre jamais deux fois la même chose.
  { id: '2026-09-18-onboarding-sortie-toujours-possible', itemCount: 3 },
  // #2542.1 — le dépôt d'un CV dit où il en est (reçu, en cours, fiche créée)
  // au lieu de laisser un bouton « J'importe… » sans autre indice.
  { id: '2026-09-18-le-depot-dun-cv-dit-ou-il-en-est', itemCount: 1 },
  // #2549.2 — une expertise saisie en « Autre » (accueil et recherche)
  // rejoint la valeur du catalogue quand elle correspond à une variante
  // connue (« automatismes », « MÉCANIQUE »…), et l'écran le dit.
  { id: '2026-09-18-les-domaines-dexpertise-se-reconnaissent', itemCount: 1 },
  // #2318.3/.4/.6 — LAU-FINAL-059 : la prévisualisation d'une actualisation dit
  // la dernière analyse, ce qui est frais, les sources consultées et la
  // durée ; le compte-rendu nomme aussi les signaux expirés, le score et la
  // confiance modifiés ; l'historique d'une correction montre désormais ses
  // sept éléments (avant, après, portée, ce qu'elle protège, ce qu'elle
  // n'empêche pas).
  { id: '2026-09-18-le-rafraichissement-dit-ce-quil-va-faire', itemCount: 3 },
  // #2570 — un consultant du vivier s'enrichit comme un contact ; #2560 —
  // créer une mission depuis un contrat ou une fiche de poste ; #2561/#2562 —
  // retrouver ses ventes et reprendre ses missions depuis l'outil connecté ;
  // #2556 — voir ce qui a bougé sur un compte déjà connu.
  { id: '2026-09-18-consultants-missions-crm-compte-connu', itemCount: 4 },
  // #2260.7 — un élément de la mémoire de Laura peut viser un contact, un
  // besoin, un consultant ou une mission — nommé et cliquable vers sa fiche
  // dans Réglages › Mémoire de Laura.
  { id: '2026-09-18-la-memoire-de-laura-sait-a-quel-objet-elle-se-rattache', itemCount: 2 },
  // #2568/#2569 — le vivier importe un CV depuis une archive ZIP ou une
  // pièce jointe de messagerie ; le rapport dit combien de fiches sont
  // entrées, combien ont échoué, et pourquoi.
  { id: '2026-09-18-importer-des-cv-depuis-le-vivier', itemCount: 2 },
  // #2269.14/.15/.16 — une demande trop large pour un seul tour de copilote
  // livre désormais une première tranche, dit ce qu'elle couvre, et propose
  // de continuer sur un geste explicite.
  { id: '2026-09-18-laura-livre-une-tranche', itemCount: 1 },
  // #2018.7 — signaler qu'une information d'entreprise partagée est fausse,
  // sans avoir le droit de l'écraser ; la demande part aux administrateurs.
  { id: '2026-09-18-signaler-une-information-dentreprise-fausse', itemCount: 1 },
  // #2053.3 / #2053.4 — le questionnaire d'accueil demande le coût
  // d'intercontrat (un montant, à côté du panier moyen) et le délai
  // d'encaissement, dont la visibilité déclarée réutilise l'écran existant.
  { id: '2026-09-18-le-cout-dintercontrat-et-le-delai-dencaissement', itemCount: 2 },
  // #2577 — le bouton « Continuer » du questionnaire d'accueil reste
  // actionnable même invalide et dit ce qui manque au clic ; la durée
  // annoncée est désormais la même d'un écran à l'autre.
  { id: '2026-09-18-continuer-dit-ce-qui-manque', itemCount: 2 },
  // #2563/#2566 — la préparation d'une facture mensuelle reconduite s'arrête
  // si le bon de commande ne couvre pas la période, et nomme l'owner de la
  // mission.
  { id: '2026-09-18-le-bon-de-commande-bloque-la-facture', itemCount: 2 },
  // #2564 — le pilotage financier affiche le CA par mission (tri de données
  // déjà chargées) et le résumé des encaissements en cours ; le bloc nomme
  // l'outil de gestion connecté.
  { id: '2026-09-18-ca-par-mission-et-encaissements', itemCount: 3 },
  // #2553 — la date d'un organigramme importé voyage jusqu'à la personne ET
  // au lien hiérarchique, badge « à vérifier » quand l'import est périmé.
  { id: '2026-09-18-organigramme-importe-garde-sa-date', itemCount: 2 },
  // #2575 — « Marge brute » s'appelle maintenant « marge commerciale »
  // partout où elle s'affiche.
  { id: '2026-09-18-la-marge-porte-son-vrai-nom', itemCount: 1 },
  // #2545 — 5ᵉ type de résultat Découvrir « Liste d'appels » ; #2571 — un
  // appel d'offres se prévisualise en besoin avant sa création ; #2552/#2555
  // — funnel des contacts sur le dossier de compte, et le rafraîchissement
  // distingue les faits inchangés ; #2548 — l'onboarding ne demande plus
  // d'historique commercial à qui n'en a pas ; #2568/#2569 — import de CV
  // par lot, archive ZIP ou messagerie connectée.
  { id: '2026-09-18-appels-besoin-preview-onboarding-court-et-cv-en-lot', itemCount: 5 },
  // #2420 seuil de marge réglable, #2005.5 capacité d'une BU saisissable,
  // #2567 gestes du quotidien en page d'arrivée, #2543 couverture des
  // contacts sur les comptes au nom légal différent du nom de marque.
  { id: '2026-09-18-marge-bu-quotidien-et-contacts-retrouves', itemCount: 4 },
  // #2537/#2538/#2539/#2540/#2541/#2572 — la reprise de l'accueil est fiable,
  // #2542/#2500.1 — le vivier nomme un échec de CV, #2489.6/#2535.1/#2546.1/
  // #2550.1 — Découvrir nomme la vraie raison d'un échec, #2554/#2502.1 —
  // l'organigramme ne perd plus personne en silence, #2533/#2536/#2547 —
  // Laura cite ses signaux.
  { id: '2026-09-18-onboarding-decouvrir-vivier-organigramme-laura', itemCount: 5 },
  // #2531/#2549 — métiers industriels au questionnaire ; #2557/#2559 — la
  // porte de création de mission reste visible, le sélecteur de projet se
  // referme sur un choix ; #2544 — Découvrir trouve un établissement en zone
  // même quand le siège du groupe est ailleurs.
  { id: '2026-09-18-metiers-industriels-missions-et-territoire', itemCount: 4 },
  // #2196.3/.6/.11/.16/.17/.24/.30 — le relevé d'activité nomme reçu, en
  // retard, escaladé et l'approbateur ; la ligne propose une relance.
  { id: '2026-09-17-le-releve-dactivite-nomme-plus-detats', itemCount: 4 },
  // #2017 — « Toute l'entreprise ou un périmètre ? » après l'étape entreprise.
  { id: '2026-09-17-toute-lentreprise-ou-un-perimetre', itemCount: 3 },
  // #2016 — rejoindre l'espace de son entreprise au lieu d'en recréer un.
  { id: '2026-09-17-rejoindre-l-espace-de-ton-entreprise', itemCount: 3 },
  // #2019 — l'étape de confidentialité du parcours d'accueil.
  { id: '2026-09-17-onboarding-tes-donnees-en-clair', itemCount: 2 },
  // Passage 12 de recette (17/09) — l'écran de restitution est de nouveau
  // atteignable par son URL, Découvrir montre son filtre partenaire au bon
  // endroit, et la sélection dit pourquoi comparer n'est pas encore possible.
  { id: '2026-09-17-restitution-atteignable-et-filtres-decouvrir', itemCount: 3 },
  { id: '2026-09-17-une-analyse-va-au-bout', itemCount: 3 },
  { id: '2026-09-17-la-question-de-marge-dit-pourquoi-elle-est-posee', itemCount: 1 },
  { id: '2026-09-17-un-exemple-cliquable-sur-la-douleur-outillage', itemCount: 1 },
  { id: '2026-09-17-un-nouveau-membre-ne-remplit-plus-deux-fois-le-profil', itemCount: 2 },
  { id: '2026-09-17-le-questionnaire-propose-je-ne-sais-pas', itemCount: 1 },
  // #2522 — « Voir tout » sous la saisie du copilote ouvre le tiroir des
  // commandes au lieu de ramener sur le même écran. #2512 (suite) — un
  // contact découvert mais pas encore enrichi se positionne désormais dans
  // l'organigramme dès que son intitulé le permet.
  { id: '2026-09-17-voir-tout-et-organigramme-plus-profond', itemCount: 2 },
  // #2510/#2511/#2512/#2513/#2514/#2515 — l'en-tête du dossier tient sur une
  // ligne, l'organigramme prend toute la largeur et montre aussi les
  // contacts non enrichis.
  { id: '2026-09-17-le-dossier-respire-lorganigramme-aussi', itemCount: 3 },
  // #2509 / #2516 / #2518 — une fenêtre et deux tableaux ne se coupaient plus.
  { id: '2026-09-17-les-fenetres-et-tableaux-se-voient-en-entier', itemCount: 3 },
  // #2162.1/.2/.6/.18/.19/.20/.25 — l'écran Analyser (/search) dit sa copie exacte à chaque étape.
  { id: '2026-09-17-une-mise-a-jour-ne-coupe-plus-ton-travail', itemCount: 3 },
  { id: '2026-09-17-analyser-dit-ce-qu-il-prepare', itemCount: 5 },
  // #2521 (suite) — recherche par signaux sous budget, angle sur file interactive, raison inconnue lisible,
  // angle borné au top des candidats, marge de fin de budget, marge de débit registre partagée.
  { id: '2026-09-17-decouvrir-signaux-tient-son-budget', itemCount: 5 },
  // #2521 — Découvrir multi-secteurs : débit vers le registre public, part du budget réservée à l'angle.
  { id: '2026-09-17-decouvrir-multi-secteurs-repond', itemCount: 3 },
  // #2490 / #2496 — Découvrir lit la demande en langage naturel avant d'interroger le registre.
  { id: '2026-09-17-decouvrir-lit-ta-demande', itemCount: 4 },
  // #2016 — rejoindre l'espace de son entreprise au lieu d'en recréer un.
  // #2019 — l'étape de confidentialité du parcours d'accueil.
  // #2319 — le rendez-vous avec Laura : avant (brief), pendant (mode en rendez-vous), après (compte rendu).
  { id: '2026-09-17-rendez-vous-avant-pendant-apres', itemCount: 5 },
  // #2500 — lot démo (17/09/2026, après-midi) : quatre défauts visibles d'un prospect.
  { id: '2026-09-17-demo-propre-vivier-plan-laura-pilotage', itemCount: 4 },
  // #2500.
  { id: '2026-09-17-le-matching-personnalise-se-replie', itemCount: 1 },
  // #2505, #2506.
  { id: '2026-09-17-la-fenetre-de-filtres-se-lit', itemCount: 2 },
  // #2503, #2504.
  { id: '2026-09-17-decouvrir-epure', itemCount: 2 },
  // #2501 — une section du plan qui tronque ne fait plus échouer tout le dossier.
  { id: '2026-09-17-le-plan-ne-fait-plus-echouer-toute-lanalyse', itemCount: 1 },
  // Lot P7-FIX — défauts vus en recette de production (passage 7, vague 23).
  { id: '2026-09-17-corrections-recette-passage-7', itemCount: 3 },
  { id: '2026-09-17-decouvrir-un-seul-point-de-depart', itemCount: 2 },
  // #2104.5 / #2104.32 — Répondre et Relancer se distinguent sur la ligne de fil ; l'envoi devient possible depuis « Répondre ».
  { id: '2026-09-17-repondre-relancer-et-envoyer-depuis-un-fil', itemCount: 2 },
  // #2173.16 — la vue rapide « En attente client » sur les besoins ouverts.
  { id: '2026-09-17-une-vue-rapide-en-attente-client-sur-les-besoins', itemCount: 1 },
  // #2176.41 / #2176.42 / #2176.47 — le panneau de matching s'ouvre vers la
  // fiche, écarte un profil explicitement, et ne noie plus les recommandés.
  { id: '2026-09-17-le-matching-souvre-vers-la-fiche-et-secarte', itemCount: 3 },
  // #2105.39 — l'outil utilisé (« votre agenda », « votre CRM »…) survit à l'exécution de la carte.
  { id: '2026-09-17-loutil-utilise-survit-a-lexecution-de-la-carte', itemCount: 1 },
  // #1935.14 — une liste d'appels préparée par Laura se distingue enfin
  // d'une campagne e-mail. #1904.3 / #1904.9 — la bulle Laura montre
  // désormais l'objet ouvert et le geste qu'elle recommande.
  { id: '2026-09-17-laura-propose-une-liste-dappels', itemCount: 2 },
  // #1935.15 — le mode nurturing d'une campagne préparée par Laura se nomme
  // enfin dans Séquences.
  { id: '2026-09-17-une-campagne-nurturing-se-voit', itemCount: 1 },
  // #1958.10 / #1958.18 — le panneau de transparence et la lecture des dates
  // suivent enfin la langue de l'interface, jamais devinée ; le rappel
  // programmé nomme désormais le fuseau retenu (RDV international).
  { id: '2026-09-17-laura-en-anglais-transparence-et-dates', itemCount: 3 },
  // #2074.21 / #2067.21 / #2067.22 — audit de l'onboarding, lot ONB-AUDIT.
  { id: '2026-09-17-recours-externe-et-rails-de-besoin', itemCount: 2 },
  // #2087.30/.31/.32 — le drawer « Voir mes réponses » de l'onboarding.
  { id: '2026-09-17-voir-mes-reponses-pendant-le-questionnaire', itemCount: 1 },
  // #2165.35 / #2165.37 / #2165.18 — niveau et expertise des personnes,
  // déduits du poste, et le preset qui les croise.
  { id: '2026-09-17-decouvrir-le-niveau-et-lexpertise-des-personnes', itemCount: 2 },
  // #2066.19 / #2066.27 / #2086.25 — la carte entreprise de l'onboarding et l'audit commercial.
  { id: '2026-09-17-la-carte-entreprise-et-les-voies-de-laudit', itemCount: 2 },
  // Lot P7-FIX — défauts vus en recette de production (passage 7, vague 23).
  { id: '2026-09-17-decouvrir-groupe-filiale', itemCount: 3 },
  // #2165.11 — Laura suggère de diviser une recherche trop large.
  { id: '2026-09-17-laura-suggere-de-diviser-une-recherche-trop-large', itemCount: 1 },
  // #2165.12 / #2165.13 — les presets Découvrir sourcés lisent de vraies sources.
  { id: '2026-09-17-decouvrir-deux-presets-qui-lisent-de-vraies-sources', itemCount: 2 },
  // #2151.62 — l'annuaire des partenaires nomme les comptes, pas seulement leur nombre.
  { id: '2026-09-17-lannuaire-de-partenaires-nomme-les-comptes', itemCount: 1 },
  // #2067.25-.29 — le rail consultant porté par le consultant POSITIONNÉ, lot RAIL-CONS.
  { id: '2026-09-17-rail-consultant-positionne', itemCount: 1 },
  // #2074.21 / #2067.21 / #2067.22 — audit de l'onboarding, lot ONB-AUDIT.
  // #2490.11 / #2489.3 — la ville et les secteurs du profil dans Découvrir.
  { id: '2026-09-17-decouvrir-la-ville-et-les-secteurs-du-profil', itemCount: 2 },
  // #2410.60 — le planning n'affiche plus une disponibilité certaine sur un renouvellement ouvert.
  { id: '2026-09-17-le-planning-dit-quand-un-renouvellement-nest-pas-tranche', itemCount: 2 },
  // #2494 — la pièce jointe reste visible avec le message envoyé, pas seulement dans le composeur.
  { id: '2026-09-17-la-piece-jointe-reste-avec-le-message', itemCount: 1 },
  // #2490 / #2489 — la pertinence de Découvrir (moteur, classement).
  { id: '2026-09-17-decouvrir-des-comptes-qui-ont-du-sens', itemCount: 3 },
  // #2014.3 / #2014.7 — l'accueil nomme l'espace REJOINT (invitation acceptée ou transfert).
  { id: '2026-09-17-tu-rejoins-un-espace-laccueil-le-nomme', itemCount: 1 },
  // #1921.3 — « Tes forces » sur /welcome (points de différenciation du Profiler).
  { id: '2026-09-17-tes-forces-sont-aussi-sur-ta-page-daccueil', itemCount: 1 },
  // #2082.1 — la proposition de notifications navigateur au jalon « premier dossier consulté ».
  // #1921.4 / #1921.5 — le coaching rapatrié sur /welcome, plus un lien de renvoi.
  { id: '2026-09-17-tes-incoherences-et-tes-angles-prioritaires-sont-ici', itemCount: 1 },
  // #2082.10 — un canal navigateur bloqué (refusé/indisponible) SE DIT, item3.
  { id: '2026-09-17-notifie-moi-quand-un-dossier-est-pret', itemCount: 3 },
  { id: '2026-09-17-laccueil-de-lonboarding-sait-dou-vient-le-compte', itemCount: 2 },
  // #1995 bis — le rappel sur un contact connu du seul CRM ne s'arrête plus à
  // « il me manque sa fiche ».
  { id: '2026-09-17-le-rappel-suit-la-creation-de-fiche', itemCount: 2 },
  { id: '2026-09-17-les-liens-de-laura-reviennent-au-fil', itemCount: 3 },
  { id: '2026-09-17-une-seule-porte-vers-le-plan', itemCount: 3 },
  { id: '2026-09-17-actions-dit-les-choses-une-seule-fois', itemCount: 4 },
  { id: '2026-09-17-le-dossier-va-jusquau-bout-de-laction', itemCount: 5 },
  { id: '2026-09-17-la-marge-dune-mission-dit-ses-sources', itemCount: 3 },
  // #2318.2 — le menu « Rafraîchir » nomme six axes de plus (LAU-FINAL-059).
  { id: '2026-09-17-rafraichir-nomme-six-axes-de-plus', itemCount: 2 },
  // #2254 — les connecteurs branchés se posent en un clic, en blocs, dans la saisie de Laura.
  { id: '2026-09-17-des-connecteurs-en-blocs-dans-ta-question', itemCount: 3 },
  // #2078.22 / #2078.23 — connexion de la messagerie en lecture seule, élévation plus tard.
  { id: '2026-09-17-connecter-sa-messagerie-en-lecture-seule', itemCount: 3 },
  { id: '2026-09-17-decouvrir-filtre-comptes-comparer-attribuer', itemCount: 3 },
  { id: '2026-09-17-decouvrir-cartes-et-filtres', itemCount: 3 },
  { id: '2026-09-16-le-questionnaire-dit-la-filiation-leconomie-et-lowner', itemCount: 3 },
  { id: '2026-09-16-le-badge-contacts-compte-le-pret-a-traiter', itemCount: 2 },
  { id: '2026-09-16-les-cartes-de-laura-disent-ce-qui-sest-passe', itemCount: 3 },
  // #1938.3 — le canal notification navigateur (foreground, sans service worker).
  { id: '2026-09-16-les-notifications-natives-de-ce-navigateur', itemCount: 3 },
  // #1938.13 — le centre de notifications lit le même budget d'interruption que Laura.
  { id: '2026-09-16-ton-refus-vaut-aussi-pour-le-centre-de-notifications', itemCount: 2 },
  { id: '2026-09-16-le-stade-crm-se-propose', itemCount: 3 },
  { id: '2026-09-16-tes-reponses-entrent-dans-le-moteur', itemCount: 3 },
  { id: '2026-09-16-decouvrir-range-ses-commandes', itemCount: 3 },
  { id: '2026-09-16-la-liste-des-contacts-suit-les-regles-de-design', itemCount: 2 },
  { id: '2026-09-16-la-veille-rejoint-mes-cibles', itemCount: 3 },
  { id: '2026-09-16-la-liste-des-comptes-va-a-lessentiel', itemCount: 2 },
  { id: '2026-09-16-la-liste-des-contacts-tient-sur-une-ligne', itemCount: 2 },
  { id: '2026-09-16-les-fuseaux-que-laura-ne-connaissait-pas', itemCount: 3 },
  { id: '2026-09-16-choisir-sa-strategie-dentree', itemCount: 2 },
  { id: '2026-09-16-laura-cherche-dans-la-conversation', itemCount: 3 },
  { id: '2026-09-16-le-questionnaire-sadapte-et-tes-corrections-tiennent', itemCount: 3 },
  { id: '2026-09-16-chaque-ecran-annonce-son-titre', itemCount: 1 },
  { id: '2026-09-16-la-chaine-de-la-signature-au-cash', itemCount: 3 },
  { id: '2026-09-16-une-analyse-en-echec-dit-ce-quelle-a-quand-meme-fini', itemCount: 2 },
  { id: '2026-09-16-copier-sa-propre-question-a-laura', itemCount: 1 },
  { id: '2026-09-16-le-cout-avant-le-clic-et-le-lien-qui-se-souvient', itemCount: 2 },
  { id: '2026-09-16-les-cartes-daction-disent-ce-quelles-vont-faire', itemCount: 2 },
  { id: '2026-09-16-ouvrir-une-affaire-a-la-main-et-preparer-un-renouvellement', itemCount: 2 },
  { id: '2026-09-16-les-projets-sappellent-desormais-opportunites', itemCount: 1 },
  { id: '2026-09-16-le-vivier-reunit-trois-ecrans-en-une-page', itemCount: 2 },
  { id: '2026-09-16-marquer-une-relance-faite-dans-le-centre-dactions', itemCount: 1 },
  { id: '2026-09-16-laura-sait-clore-une-demande', itemCount: 3 },
  { id: '2026-09-16-laudit-commercial-lit-tes-reponses-au-questionnaire', itemCount: 2 },
  { id: '2026-09-16-ce-que-loutil-branche-autorise-sur-une-integration', itemCount: 1 },
  { id: '2026-09-16-apres-un-import-cinq-blocs-disent-ce-qui-est-entre', itemCount: 1 },
  { id: '2026-09-16-trois-nouvelles-annonces-reglables-une-par-une', itemCount: 2 },
  { id: '2026-09-16-filtrer-les-sequences-dune-meme-campagne', itemCount: 1 },
  { id: '2026-09-16-saisir-un-besoin-sur-une-entreprise-inconnue', itemCount: 2 },
  { id: '2026-09-16-le-tableau-de-bord-annonce-le-pilotage-en-trois-chiffres', itemCount: 1 },
  { id: '2026-09-16-un-ancien-lien-decran-ne-tombe-plus-dans-le-vide', itemCount: 1 },
  { id: '2026-09-16-tes-conversations-disent-ou-elles-en-sont', itemCount: 3 },
  { id: '2026-09-16-la-memoire-de-laura-sait-dire-mon-equipe-et-cette-conversation', itemCount: 3 },
  { id: '2026-09-16-un-ecran-interdit-le-dit-au-lieu-de-renvoyer-au-tableau-de-bord', itemCount: 3 },
  { id: '2026-09-16-reessayer-une-reponse-de-laura-sans-jamais-renvoyer', itemCount: 4 },
  { id: '2026-09-16-la-campagne-preparee-par-laura-ouvre-lecran-sequences', itemCount: 2 },
  { id: '2026-09-16-la-page-dentree-de-la-demo-ne-se-contredit-plus', itemCount: 2 },
  { id: '2026-09-16-un-zero-affiche-veut-dire-zero-mesure', itemCount: 4 },
  { id: '2026-09-16-le-brouillon-mail-se-relit-et-une-carte-refusee-reste-visible', itemCount: 3 },
  { id: '2026-09-16-un-fil-exporte-affiche-une-date-lisible-et-tutoie', itemCount: 1 },
  { id: '2026-09-16-le-resume-du-fil-devient-lisible-et-corrigeable', itemCount: 3 },
  { id: '2026-09-16-la-fiche-dun-besoin-nomme-ce-qui-manque', itemCount: 1 },
  { id: '2026-09-16-le-parcours-donboarding-nomme-ses-pannes', itemCount: 3 },
  { id: '2026-09-16-la-carte-de-confirmation-dentreprise-dit-plus', itemCount: 3 },
  { id: '2026-09-16-sans-connecteur-ce-qui-reste-possible', itemCount: 1 },
  { id: '2026-09-16-audit-commercial-un-rythme-mensuel-vise', itemCount: 1 },
  { id: '2026-09-16-les-voies-dentree-disent-leur-charge-et-leur-risque', itemCount: 3 },
  { id: '2026-09-16-le-questionnaire-donboarding-se-repere-mieux', itemCount: 4 },
  { id: '2026-09-16-le-questionnaire-demande-enfin-appels-doffres-et-contenu', itemCount: 2 },
  { id: '2026-09-16-le-questionnaire-connait-deja-ton-vivier-et-ta-base-de-clients', itemCount: 2 },
  { id: '2026-09-16-laudit-tranche-montre-sa-chaine-et-la-memoire-marche', itemCount: 4 },
  { id: '2026-09-16-laura-annonce-la-fin-dun-travail-long-sur-tes-canaux-branches', itemCount: 1 },
  { id: '2026-09-16-lestimation-avant-le-reel-apres-sur-la-carte-du-chat', itemCount: 2 },
  { id: '2026-09-16-la-fin-de-lonboarding-dit-la-verite', itemCount: 3 },
  { id: '2026-09-15-la-relecture-onboarding-affiche-des-libelles', itemCount: 1 },
  { id: '2026-09-15-un-fil-de-laura-sexporte-se-duplique-et-se-cherche', itemCount: 1 },
  { id: '2026-09-15-aujourdhui-montre-les-alertes-de-decouvrir', itemCount: 1 },
  { id: '2026-09-15-convertir-une-piste-garde-les-cinq-champs', itemCount: 1 },
  { id: '2026-09-15-mes-cibles-statuts-et-prenom', itemCount: 1 },
  { id: '2026-09-15-le-role-directeur-dagence-existe', itemCount: 1 },
  { id: '2026-09-15-le-plan-et-les-paliers-arrivent-sur-ton-audit', itemCount: 1 },
  { id: '2026-09-15-la-recherche-des-fils-de-laura-voit-tout-lhistorique', itemCount: 1 },
  { id: '2026-09-15-le-questionnaire-compte-juste-ce-qui-reste', itemCount: 1 },
  { id: '2026-09-15-quitter-plusieurs-agences-et-la-date-des-donnees', itemCount: 1 },
  { id: '2026-09-15-client-ideal-interlocuteurs-et-voies-dacces', itemCount: 1 },
  { id: '2026-09-15-types-de-prestation-secteurs-et-preuves', itemCount: 1 },
  { id: '2026-09-15-les-canaux-dentree-et-ce-que-tu-mesures', itemCount: 1 },
  { id: '2026-09-15-le-temps-commercial-reellement-disponible', itemCount: 1 },
  { id: '2026-09-15-ta-chaine-doutils-et-ce-qui-te-freine', itemCount: 1 },
  { id: '2026-09-15-revoir-ses-reponses-quand-on-veut', itemCount: 1 },
  { id: '2026-09-15-laura-portee-mission-et-fils-partages', itemCount: 1 },
  { id: '2026-09-15-sept-etapes-nommees-et-un-ecran-de-relecture', itemCount: 1 },
  { id: '2026-09-15-laura-guide-le-questionnaire', itemCount: 1 },
  { id: '2026-09-15-le-plafond-growth-passe-a-100', itemCount: 1 },
  { id: '2026-09-15-les-voies-dentree-possibles-de-laudit', itemCount: 1 },
  { id: '2026-09-15-chaque-reponse-du-questionnaire-dit-ce-quelle-change', itemCount: 1 },
  { id: '2026-09-15-une-piece-jointe-dit-son-etat', itemCount: 1 },
  { id: '2026-09-15-la-carte-de-precision-montre-qui-tu-choisis', itemCount: 2 },
  { id: '2026-09-15-le-dossier-dit-quand-son-analyse-a-ete-actualisee', itemCount: 1 },
  { id: '2026-09-15-le-plan-souvre-sur-son-verdict', itemCount: 1 },
  { id: '2026-09-15-retrouver-une-info-du-dossier-sans-savoir-ou-elle-vit', itemCount: 1 },
  { id: '2026-09-15-les-actions-deja-executees-a-cote-de-ce-qui-reste', itemCount: 1 },
  { id: '2026-09-15-favoris-et-portefeuille-des-collegues', itemCount: 1 },
  { id: '2026-09-15-maturite-et-effectif-reel', itemCount: 2 },
  { id: '2026-09-15-un-champ-prerempli-dit-de-quand-il-date', itemCount: 1 },
  { id: '2026-09-15-lautosauvegarde-du-questionnaire-dit-quand-elle-a-enregistre', itemCount: 1 },
  { id: '2026-09-15-comptes-navigue-a-plat-et-favoris-redirige', itemCount: 1 },
  { id: '2026-09-15-une-carte-daction-de-laura-survit-au-rechargement', itemCount: 1 },
  { id: '2026-09-15-la-checklist-dit-ce-que-chaque-etape-fait-gagner', itemCount: 1 },
  { id: '2026-09-15-la-demonstration-souvre-dans-lapplication', itemCount: 1 },
  { id: '2026-09-15-chaque-notification-dit-sa-frequence-et-comment-larreter', itemCount: 1 },
  { id: '2026-09-15-plus-aucune-notification-nest-activee-davance', itemCount: 1 },
  { id: '2026-09-15-un-echec-denregistrement-donboarding-dit-ce-qui-sest-passe', itemCount: 1 },
  { id: '2026-09-15-le-questionnaire-de-cadrage-sameliore', itemCount: 4 },
  { id: '2026-09-15-sept-natures-de-memoire', itemCount: 1 },
  { id: '2026-09-15-memoire-partagee-masque-les-secrets', itemCount: 1 },
  { id: '2026-09-15-enregistrer-une-reponse-de-laura', itemCount: 1 },
  { id: '2026-09-15-avant-denregistrer-laura-dit-ce-quelle-retient', itemCount: 1 },
  { id: '2026-09-15-une-analyse-arretee-nest-pas-un-echec', itemCount: 1 },
  { id: '2026-09-15-une-action-deja-lancee-dit-par-qui', itemCount: 1 },
  { id: '2026-09-15-les-brouillons-suivent-lobjectif-demande', itemCount: 1 },
  { id: '2026-09-15-laura-ne-propose-plus-un-lien-vide', itemCount: 1 },
  { id: '2026-09-15-un-fait-dorganigramme-se-corrige', itemCount: 1 },
  { id: '2026-09-15-actions-en-lot-sur-les-contacts', itemCount: 1 },
  { id: '2026-09-15-prospection-regroupe-comptes-contacts-et-mes-cibles', itemCount: 1 },
  { id: '2026-09-15-laura-souvre-depuis-le-dossier-avec-le-contexte', itemCount: 1 },
  { id: '2026-09-15-le-portefeuille-se-pilote-par-vues', itemCount: 1 },
  { id: '2026-09-15-une-session-tient-sur-cinq-appareils', itemCount: 1 },
  { id: '2026-09-15-ta-session-tient-toute-la-nuit', itemCount: 1 },
  { id: '2026-09-15-le-chemin-recommande-explique-son-ordre', itemCount: 1 },
  { id: '2026-09-15-la-carte-dinfluence-se-lit-mieux', itemCount: 1 },
  { id: '2026-09-15-le-contexte-marche-tient-en-trois-lignes', itemCount: 1 },
  { id: '2026-09-15-la-lecture-du-compte-tient-compte-de-ton-profil', itemCount: 1 },
  { id: '2026-09-14-tes-preuves-se-remplissent-a-partir-de-tes-missions', itemCount: 3 },
  { id: '2026-09-14-les-sections-du-dossier-portent-ce-quelles-annoncent', itemCount: 4 },
  { id: '2026-09-14-entete-du-dossier-lisible', itemCount: 1 },
  { id: '2026-09-14-chaque-bouton-du-dossier-dit-le-droit-quil-exige', itemCount: 2 },
  { id: '2026-09-14-lhistorique-du-dossier-nomme-ses-evenements', itemCount: 1 },
  { id: '2026-09-14-ajouter-ou-importer-un-contact-sans-defiler', itemCount: 1 },
  { id: '2026-09-14-lidentite-du-dossier-dit-qui-la-corrigee', itemCount: 2 },
  { id: '2026-09-14-tu-vois-qui-porte-le-compte-avant-dappeler', itemCount: 3 },
  { id: '2026-09-14-historique-et-preuves-rassemble-ce-qui-sest-passe', itemCount: 4 },
  { id: '2026-09-14-les-opportunites-a-regarder-en-premier', itemCount: 3 },
  { id: '2026-09-14-le-plan-ouvre-sur-ses-six-sections', itemCount: 2 },
  { id: '2026-09-14-un-perimetre-accentue-nest-plus-classe-autre', itemCount: 1 },
  { id: '2026-09-14-le-dossier-dit-si-le-compte-merite-ton-temps', itemCount: 5 },
  { id: '2026-09-14-laura-cree-une-fiche-depuis-ton-crm', itemCount: 3 },
  { id: '2026-09-14-un-dossier-partage-ne-sort-plus-de-donnees-sensibles', itemCount: 2 },
  { id: '2026-09-14-le-dossier-se-lit-en-sept-sections', itemCount: 2 },
  { id: '2026-09-14-le-contexte-du-compte-affiche-ce-quon-en-tire', itemCount: 2 },
  { id: '2026-09-14-tu-peux-valider-le-contexte-que-laura-utilise', itemCount: 3 },
  { id: '2026-09-14-laura-propose-une-analyse-sous-forme-de-carte', itemCount: 2 },
  { id: '2026-09-14-chaque-fait-du-dossier-dit-dou-il-vient', itemCount: 4 },
  { id: '2026-09-14-chaque-bouton-du-dossier-dit-ce-quil-fait', itemCount: 3 },
  { id: '2026-09-14-le-toast-du-dossier-nomme-lentreprise', itemCount: 2 },
  { id: '2026-09-14-laccueil-de-laura-propose-toujours-six-amorces', itemCount: 2 },
  { id: '2026-09-14-ton-fuseau-horaire', itemCount: 3 },
  { id: '2026-09-14-lecran-de-laura-se-lit-et-se-touche', itemCount: 4 },
  { id: '2026-09-14-la-grille-tarifaire-montre-les-trois-acces', itemCount: 3 },
  { id: '2026-09-14-un-etat-non-mesure-ne-sannonce-plus-comme-une-panne', itemCount: 2 },
  { id: '2026-09-14-le-rendez-vous-du-matin-prepare-ses-participants', itemCount: 2 },
  { id: '2026-09-14-les-suggestions-daccueil-viennent-de-comptes-reels', itemCount: 2 },
  { id: '2026-09-14-ce-que-le-produit-a-compris-de-ton-activite', itemCount: 4 },
  { id: '2026-09-14-ton-profil-se-sert-de-toutes-tes-reponses', itemCount: 4 },
  { id: '2026-09-14-le-questionnaire-dentree-se-lit-et-se-reprend', itemCount: 4 },
  { id: '2026-09-14-laura-traite-une-demande-quaucune-liste-nannoncait', itemCount: 3 },
  { id: '2026-09-14-laura-ne-refuse-plus-en-bloc', itemCount: 2 },
  { id: '2026-09-14-un-rappel-sur-la-personne-que-tu-nommes', itemCount: 3 },
  { id: '2026-09-14-le-lien-marche-inverse-garde-ta-portee', itemCount: 1 },
  { id: '2026-09-14-la-carte-danalyse-dit-ou-elle-en-est', itemCount: 2 },
  { id: '2026-09-14-laura-retient-le-contact-que-tu-viens-de-choisir', itemCount: 2 },
  { id: '2026-09-14-le-parcours-d-entree-se-prend-au-doigt', itemCount: 2 },
  { id: '2026-09-14-laura-repond-sans-appel-facture-en-demonstration', itemCount: 2 },
  { id: '2026-09-14-un-verdict-en-une-seule-carte', itemCount: 2 },
  { id: '2026-09-14-deux-clics-ne-lancent-plus-deux-actions', itemCount: 2 },
  { id: '2026-09-14-une-action-proposee-par-laura-se-valide-dans-le-fil', itemCount: 3 },
  { id: '2026-09-14-laura-avance-une-hypothese-au-lieu-de-bloquer', itemCount: 3 },
  { id: '2026-09-14-les-sources-dun-signal-nomment-leur-capacite', itemCount: 2 },
  { id: '2026-09-13-laura-repond-en-cartes-lit-ton-role-et-se-souvient-du-fil', itemCount: 6 },
  { id: '2026-09-13-tes-conversations-avec-laura-se-rangent-par-date-ou-par-compte', itemCount: 2 },
  { id: '2026-09-13-laura-la-meme-dans-la-bulle', itemCount: 2 },
  { id: '2026-09-13-la-page-de-laura-plus-ample-et-plus-lisible', itemCount: 4 },
  { id: '2026-09-13-sous-chaque-reponse-la-memoire-que-laura-avait-en-tete', itemCount: 3 },
  { id: '2026-09-13-la-memoire-de-laura-dit-ce-quelle-retient-et-pourquoi', itemCount: 4 },
  { id: '2026-09-13-laura-ouvre-le-bon-ecran-cadre-un-fil-et-previent-avant-son-plafond', itemCount: 8 },
  { id: '2026-09-13-une-action-validee-part-vraiment-au-nom-de-qui-la-preparee', itemCount: 4 },
  { id: '2026-09-13-laura-respecte-ton-role-et-garde-tes-fils-recents', itemCount: 3 },
  { id: '2026-09-13-bientot-tes-alertes-urgentes-par-sms', itemCount: 2 },
  { id: '2026-09-13-parler-a-laura-au-lieu-de-taper-et-reecouter', itemCount: 4 },
  { id: '2026-09-13-decouvrir-nomme-la-capacite-pas-le-fournisseur', itemCount: 2 },
  { id: '2026-09-13-laura-nomme-les-outils-que-tu-as-branches', itemCount: 2 },
  { id: '2026-09-13-un-document-joint-sert-a-la-conversation-et-ta-memoire-peut-rester-a-toi', itemCount: 4 },
  { id: '2026-09-13-laura-ouvre-ta-journee-avec-ton-brief', itemCount: 4 },
  { id: '2026-09-13-laura-repond-bien-dans-la-langue-de-ton-interface', itemCount: 1 },
  { id: '2026-09-13-signaler-un-probleme-et-suivre-ses-signalements', itemCount: 4 },
  { id: '2026-09-13-laura-masque-adresses-internes-et-coordonnees-bancaires', itemCount: 3 },
  { id: '2026-09-13-laura-garde-ta-saisie-nomme-tes-conversations-et-dit-qui-a-demande', itemCount: 5 },
  { id: '2026-09-13-une-question-de-la-bibliotheque-saffiche-avec-sa-reponse', itemCount: 2 },
  { id: '2026-09-12-laura-repond-dans-ta-langue-et-distingue-ses-notes', itemCount: 3 },
  { id: '2026-09-12-copier-une-reponse-et-savoir-qui-lira-un-partage', itemCount: 3 },
  { id: '2026-09-12-laura-ne-propose-que-ce-qui-est-branche', itemCount: 3 },
  { id: '2026-09-12-demander-a-laura-ouvre-une-nouvelle-discussion', itemCount: 4 },
  { id: '2026-09-11-les-trajectoires-observees-autour-dun-compte', itemCount: 3 },
  { id: '2026-09-11-le-cadre-de-lecture-tient-en-moins-de-hauteur', itemCount: 2 },
  { id: '2026-09-11-reprendre-des-projets-depuis-un-fichier', itemCount: 3 },
  { id: '2026-09-11-le-dossier-de-compte-suggere-et-se-cherche', itemCount: 4 },
  { id: '2026-09-11-le-dossier-de-compte-se-lit-sans-copier-coller', itemCount: 2 },
  { id: '2026-09-11-la-premiere-lecture-du-marche-des-la-fin-du-profil', itemCount: 3 },
  { id: '2026-09-11-departager-un-compte-que-la-memoire-ne-sait-pas-rapprocher', itemCount: 3 },
  { id: '2026-09-11-laura-ecrit-ou-renvoie-et-elle-dit-lequel', itemCount: 3 },
  { id: '2026-09-11-ce-qui-colle-ton-esn-dans-la-memoire-et-ce-qui-ne-coute-rien', itemCount: 4 },
  { id: '2026-09-11-laura-lit-le-marche-le-tour-guide-et-les-environnements-compatibles', itemCount: 4 },
  { id: '2026-09-11-le-chemin-vers-un-compte-et-les-partenaires-qui-s-ouvrent', itemCount: 4 },
  { id: '2026-09-11-un-cv-garde-ce-quil-a-lu-et-laura-tient-ses-reglages', itemCount: 5 },
  { id: '2026-09-10-une-seule-gouttiere-et-laura-connait-tes-reglages', itemCount: 4 },
  { id: '2026-09-10-laura-reste-quand-une-fenetre-souvre', itemCount: 5 },
  { id: '2026-09-10-ton-energie-se-voit-et-un-zero-ne-ment-plus', itemCount: 5 },
  { id: '2026-09-10-le-dossier-respire-et-une-esn-ne-compte-quune-fois', itemCount: 3 },
  { id: '2026-09-09-laura-cherche-le-marche-et-une-esn-tient-sur-une-ligne', itemCount: 3 },
  { id: '2026-09-09-l-adressabilite-se-lit-aussi-en-demonstration', itemCount: 2 },
  { id: '2026-09-09-laura-montre-le-chemin-et-le-cv-se-lit', itemCount: 4 },
  { id: '2026-09-09-laura-ne-promet-plus-de-boutons', itemCount: 4 },
  { id: '2026-09-09-une-relation-qui-existe-deja-compte', itemCount: 3 },
  { id: '2026-09-09-une-recherche-ne-rassure-plus-au-dessus-du-vide', itemCount: 3 },
  { id: '2026-09-08-laura-classe-tes-comptes-en-trois', itemCount: 3 },
  { id: '2026-09-08-le-tableau-de-bord-et-laura-lisent-le-marche', itemCount: 3 },
  { id: '2026-09-08-une-esn-une-ligne-et-des-pistes-de-recherche', itemCount: 3 },
  { id: '2026-09-08-le-dossier-de-compte-raconte-quelque-chose', itemCount: 3 },
  { id: '2026-09-08-chaque-suggestion-dit-a-quel-compte-elle-ressemble', itemCount: 4 },
  { id: '2026-09-08-tes-comptes-que-le-marche-connait-en-un-clic', itemCount: 3 },
  { id: '2026-09-08-avant-de-payer-tu-sais-ce-que-bellum-sait-deja', itemCount: 4 },
  { id: '2026-09-08-tu-sais-enfin-sur-combien-de-tes-comptes-le-marche-parle', itemCount: 3 },
  { id: '2026-09-07-la-memoire-marche-arrive-la-ou-tu-decides', itemCount: 3 },
  { id: '2026-09-07-le-contexte-marche-dun-compte-tient-dans-une-icone', itemCount: 3 },
  { id: '2026-09-07-la-memoire-marche-atteint-trois-ecrans-de-plus', itemCount: 3 },
  { id: '2026-09-07-plus-de-page-blanche-en-bas-des-ecrans', itemCount: 2 },
  { id: '2026-09-07-rejoindre-une-esn-deja-renseignee', itemCount: 2 },
  { id: '2026-09-06-vous-savez-quand-on-est-chez-vous', itemCount: 2 },
  { id: '2026-09-06-parcours-observes-sur-la-ligne', itemCount: 2 },
  { id: '2026-09-06-le-bon-thales', itemCount: 2 },
  { id: '2026-09-06-comptes-lisibles-et-logos', itemCount: 3 },
  { id: '2026-09-06-les-societes-observees-autour-dun-compte', itemCount: 2 },
  { id: '2026-09-06-la-memoire-marche-eclaire-les-comptes-muets', itemCount: 2 },
  { id: '2026-09-06-chaque-chiffre-dit-doù-il-vient', itemCount: 3 },
  { id: '2026-09-06-comptes-et-matinee-plus-courts', itemCount: 3 },
  { id: '2026-09-05-les-parcours-se-remplissent-seuls', itemCount: 4 },
  { id: '2026-09-05-le-diff-et-la-correction', itemCount: 3 },
  { id: '2026-09-05-laura-lance-une-analyse', itemCount: 3 },
  { id: '2026-09-05-une-cadence-personnalisee', itemCount: 3 },
  { id: '2026-09-05-le-pont-messagerie-metier', itemCount: 3 },
  { id: '2026-09-05-la-dimension-filtree-est-ecrite', itemCount: 3 },
  { id: '2026-09-05-la-source-dun-signal-est-une-source', itemCount: 3 },
  { id: '2026-09-05-cadences-ce-que-chaque-touche-apporte', itemCount: 3 },
  { id: '2026-09-05-signalement-depuis-le-backoffice', itemCount: 3 },
  { id: '2026-09-05-tracabilite-des-actions', itemCount: 3 },
  { id: '2026-09-05-mes-donnees-et-import-de-confiance', itemCount: 3 },
  { id: '2026-09-05-une-seule-file-de-validation', itemCount: 3 },
  { id: '2026-09-05-listes-metier-et-qualite-des-donnees', itemCount: 3 },
  { id: '2026-09-05-societe-qui-porte-la-mission', itemCount: 3 },
  { id: '2026-09-05-donnees-et-exports-par-proprietaire', itemCount: 3 },
  { id: '2026-09-05-preparer-la-proposition-depuis-le-dossier', itemCount: 4 },
  { id: '2026-09-05-import-promesse-et-familles', itemCount: 3 },
  { id: '2026-09-05-veille-promesse-et-pilotage', itemCount: 4 },
  { id: '2026-09-05-actions-poste-de-commande', itemCount: 4 },
  { id: '2026-09-05-parcours-des-noms-au-lieu-de-numeros', itemCount: 6 },
  { id: '2026-09-04-sequences-un-cockpit-au-lieu-dune-table', itemCount: 7 },
  { id: '2026-09-04-aujourdhui-decider-et-agir', itemCount: 6 },
  { id: '2026-09-04-integrations-quoi-connecter-et-pourquoi', itemCount: 6 },
  { id: '2026-09-04-pilotage-devient-decisions', itemCount: 7 },
  { id: '2026-09-04-cockpit-le-recul-et-larbitrage', itemCount: 7 },
  { id: '2026-09-04-planning-et-suivi-ce-qui-bloque-dabord', itemCount: 6 },
  { id: '2026-09-04-missions-chercher-filtrer-et-voir-qui-est-dessus', itemCount: 6 },
  { id: '2026-09-04-comptes-et-partenaires-ce-qui-est-compte', itemCount: 5 },
  { id: '2026-09-04-territoire-ville-rayon-et-acheteurs', itemCount: 5 },
  { id: '2026-09-04-decouvrir-quatre-criteres-de-plus', itemCount: 3 },
  { id: '2026-09-04-decouvrir-les-secteurs-de-bellum', itemCount: 3 },
  { id: '2026-09-04-un-seul-cockpit-dequipe', itemCount: 2 },
  { id: '2026-09-04-une-alerte-de-mission-sort-quelque-part', itemCount: 5 },
  { id: '2026-09-04-ce-qui-etait-calcule-arrive-a-lecran', itemCount: 5 },
  { id: '2026-09-04-six-gestes-qui-ne-repondaient-pas', itemCount: 6 },
  { id: '2026-09-03-un-contact-sans-entreprise', itemCount: 4 },
  { id: '2026-09-03-laura-en-demo-montre-le-vrai-produit', itemCount: 5 },
  { id: '2026-09-03-le-pipe-se-lit-en-quatre-cartes', itemCount: 5 },
  { id: '2026-09-03-pilotage-souvre-sur-ce-qui-attend-une-decision', itemCount: 3 },
  { id: '2026-09-03-les-partenaires-se-lisent-dun-coup-doeil', itemCount: 2 },
  { id: '2026-09-03-un-contact-sans-analyse-prealable', itemCount: 3 },
  { id: '2026-09-03-le-board-deffort-dit-sur-quoi-arbitrer', itemCount: 3 },
  { id: '2026-09-03-le-secteur-lisible-et-le-score-sur-les-favoris', itemCount: 4 },
  { id: '2026-09-03-le-logo-du-compte-arrive-sur-les-missions', itemCount: 2 },
  { id: '2026-09-03-les-ecrans-missions-savent-a-qui-ils-parlent', itemCount: 3 },
  { id: '2026-09-02-deux-filtres-rapides-de-plus-sur-les-besoins', itemCount: 2 },
  { id: '2026-09-02-leffort-et-les-commandes-rejoignent-leur-ecran', itemCount: 3 },
  { id: '2026-09-02-la-liste-des-comptes-respire', itemCount: 3 },
  { id: '2026-09-02-le-signe-quitte-les-etapes-actives', itemCount: 2 },
  { id: '2026-09-02-une-alerte-dit-quoi-faire', itemCount: 3 },
  { id: '2026-09-02-demander-au-copilote-depuis-lecran-ou-tu-es', itemCount: 2 },
  { id: '2026-09-02-chaque-ecran-sait-a-qui-il-parle', itemCount: 2 },
  { id: '2026-09-02-un-signalement-long-nest-plus-perdu', itemCount: 2 },
  { id: '2026-09-02-les-listes-montrent-le-logo-des-entreprises', itemCount: 2 },
  { id: '2026-09-02-la-demo-montre-loffre-vendue', itemCount: 2 },
  { id: '2026-09-02-la-demonstration-remplace-lessai-gratuit', itemCount: 3 },
  { id: '2026-09-02-les-amorces-rejoignent-la-ligne-doutils', itemCount: 2 },
  { id: '2026-09-02-la-memoire-de-laura-tient-sur-une-ligne', itemCount: 2 },
  { id: '2026-09-01-ton-produit-peut-porter-ton-nom', itemCount: 3 },
  { id: '2026-09-01-les-filtres-parlent-la-meme-langue', itemCount: 2 },
  { id: '2026-09-01-odoo-rejoint-les-crm', itemCount: 3 },
  { id: '2026-09-01-les-menus-deroulants-suivent-le-theme', itemCount: 4 },
  { id: '2026-09-01-un-seul-filtre-partout', itemCount: 3 },
  { id: '2026-09-01-le-fond-devient-blanc', itemCount: 4 },
  { id: '2026-09-01-moins-de-phrases-plus-decran', itemCount: 2 },
  { id: '2026-09-01-laura-a-son-visuel', itemCount: 2 },
  { id: '2026-09-01-la-navigation-se-range', itemCount: 6 },
  { id: '2026-09-01-export-facturation-et-dates', itemCount: 2 },
  { id: '2026-09-01-expliquer-un-ecart-debloque-le-mois', itemCount: 2 },
  { id: '2026-09-01-completer-la-fiche-dune-mission', itemCount: 2 },
  { id: '2026-09-01-le-vivier-propose-enfin-des-profils', itemCount: 2 },
  { id: '2026-09-01-le-matching-reclasse-les-besoins-dates', itemCount: 2 },
  { id: '2026-09-01-tes-donnees-tappartiennent-et-on-dit-ce-quon-garde', itemCount: 5 },
  { id: '2026-08-31-le-tableau-de-bord-finance', itemCount: 5 },
  { id: '2026-08-31-onze-ecrans-verifies-au-clavier-et-au-telephone', itemCount: 3 },
  { id: '2026-08-31-creer-une-mission-en-pleine-page', itemCount: 4 },
  { id: '2026-08-31-lorganigramme-se-regarde-de-quatre-facons', itemCount: 4 },
  { id: '2026-08-31-un-besoin-dit-enfin-ce-quil-est-devenu', itemCount: 4 },
  { id: '2026-08-31-les-societes-de-ton-esn-se-declarent', itemCount: 3 },
  { id: '2026-08-31-les-pieces-jointes-souvrent-enfin', itemCount: 5 },
  { id: '2026-08-31-le-vivier-ferme-ses-cinq-derniers-trous', itemCount: 5 },
  { id: '2026-08-31-les-comptes-sous-langle-facturation-passent-en-cartes', itemCount: 5 },
  { id: '2026-08-31-les-notes-de-frais-se-deposent', itemCount: 5 },
  { id: '2026-09-01-rien-ne-part-vers-quelquun-sans-que-tu-laies-vu', itemCount: 3 },
  { id: '2026-09-01-laura-nomme-ses-regles', itemCount: 2 },
  { id: '2026-09-01-laura-a-un-visage', itemCount: 4 },
  { id: '2026-09-01-une-bulle-laura-partout', itemCount: 4 },
  { id: '2026-08-31-leviers-craintes-et-boutons-plus-faciles-a-toucher', itemCount: 2 },
  { id: '2026-09-01-la-cascade-dapres-rendez-vous', itemCount: 4 },
  { id: '2026-09-01-laura-site-mesure-et-promesses-tenues', itemCount: 4 },
  { id: '2026-09-01-le-brief-davant-rendez-vous-dit-dou-il-tient-ce-quil-dit', itemCount: 4 },
  { id: '2026-09-01-laura-parle-sur-le-dossier-du-compte', itemCount: 4 },
  { id: '2026-09-01-cinq-capacites-deviennent-atteignables', itemCount: 5 },
  { id: '2026-09-01-ce-que-lanalyse-savait-deja-sans-le-dire', itemCount: 4 },
  { id: '2026-09-01-ma-matinee-et-ses-cartes-qui-disent-dou-elles-viennent', itemCount: 4 },
  { id: '2026-09-01-un-besoin-dit-sil-faut-y-aller-et-pourquoi', itemCount: 4 },
  { id: '2026-09-01-la-memoire-collective-de-ton-espace', itemCount: 5 },
  { id: '2026-08-31-les-comptes-se-regardent-aussi-sous-langle-facturation', itemCount: 3 },
  { id: '2026-08-31-la-cession-de-creance-et-son-factor', itemCount: 4 },
  { id: '2026-08-31-la-photo-mensuelle-garde-sa-population', itemCount: 2 },
  { id: '2026-08-31-les-notes-de-frais-arrivent', itemCount: 4 },
  { id: '2026-08-31-suivi-facturation-et-automatisations', itemCount: 3 },
  { id: '2026-08-31-le-vivier-rejoint-sa-maquette', itemCount: 4 },
  { id: '2026-08-31-lorganigramme-sexporte-et-se-filtre', itemCount: 3 },
  { id: '2026-08-31-la-facturation-devient-un-tableau-pilotable', itemCount: 4 },
  { id: '2026-08-31-gestion-des-paiements-sortants', itemCount: 4 },
  { id: '2026-08-31-la-fiche-besoin-a-six-onglets', itemCount: 5 },
  { id: '2026-08-31-le-kanban-des-besoins-a-son-pipe-et-son-assistant', itemCount: 3 },
  { id: '2026-08-31-une-mission-selectionnee-montre-son-detail', itemCount: 4 },
  { id: '2026-08-31-ladministration-des-ventes-a-son-ecran', itemCount: 4 },
  { id: '2026-08-31-une-relance-faite-quitte-le-tableau-de-bord', itemCount: 3 },
  { id: '2026-08-31-letape-plan-daction-a-le-temps-daboutir', itemCount: 2 },
  { id: '2026-08-31-une-esn-est-reconnue-sous-sa-raison-sociale', itemCount: 2 },
  { id: '2026-08-31-les-filtres-de-decouvrir-sappliquent-vraiment', itemCount: 3 },
  { id: '2026-08-31-un-plan-vide-dit-pourquoi-il-est-vide', itemCount: 2 },
  { id: '2026-08-30-la-deconnexion-dit-ce-quelle-na-pas-pu-revoquer', itemCount: 2 },
  { id: '2026-08-30-rouvrir-un-compte-rappelle-pourquoi-il-etait-parti', itemCount: 1 },
  { id: '2026-08-30-la-liste-des-comptes-dit-qui-est-pret-a-facturer', itemCount: 2 },
  { id: '2026-08-30-un-besoin-sans-candidat-ouvre-une-piste', itemCount: 2 },
  { id: '2026-08-30-le-vivier-filtre-et-senrichit', itemCount: 2 },
  { id: '2026-08-30-le-board-deffort-separe-larbitrage-de-lexecution', itemCount: 1 },
  { id: '2026-08-30-laura-sait-qui-a-change-de-poste', itemCount: 1 },
  { id: '2026-08-30-une-lecture-en-echec-ne-se-lit-plus-comme-un-vide', itemCount: 2 },
  { id: '2026-08-30-la-fiche-dun-besoin-porte-ses-onglets', itemCount: 2 },
  { id: '2026-08-30-un-import-ne-perd-plus-ses-lignes-en-echec', itemCount: 2 },
  { id: '2026-08-30-creer-un-besoin-sans-passer-par-un-projet-ouvert', itemCount: 2 },
  { id: '2026-08-30-une-reponse-positive-fait-basculer-le-sprint', itemCount: 1 },
  { id: '2026-08-30-la-bulle-de-lintercontrat-dit-son-cout', itemCount: 1 },
  { id: '2026-08-30-une-influence-dorganigramme-dit-sa-source', itemCount: 2 },
  { id: '2026-08-30-un-besoin-sait-quand-il-lui-manque-un-tarif', itemCount: 1 },
  { id: '2026-08-30-la-phase-dun-besoin-porte-sa-couleur', itemCount: 1 },
  { id: '2026-08-30-le-pilotage-finance-se-lit', itemCount: 4 },
  { id: '2026-08-30-une-sequence-de-relance-nest-plus-six-fils', itemCount: 1 },
  { id: '2026-08-30-une-phrase-du-pilotage-ne-se-repete-plus', itemCount: 1 },
  { id: '2026-08-30-actions-un-seul-rang-donglets', itemCount: 2 },
  { id: '2026-08-30-la-valeur-du-pipe-porte-son-libelle', itemCount: 2 },
  { id: '2026-08-30-la-decouverte-gagne-trois-familles-de-questions', itemCount: 2 },
  { id: '2026-08-30-un-geste-de-facturation-porte-son-nom', itemCount: 1 },
  { id: '2026-08-30-un-contact-desn-partenaire-qui-bouge-se-voit', itemCount: 1 },
  { id: '2026-08-30-laccessibilite-remonte-au-portefeuille', itemCount: 3 },
  { id: '2026-08-30-la-marge-compte-desormais-les-frais', itemCount: 3 },
  { id: '2026-08-30-une-correction-a-la-main-tient', itemCount: 3 },
  { id: '2026-08-30-un-cv-depose-ecrit-son-nom-ou-rien', itemCount: 3 },
  { id: '2026-08-30-le-n1-suppose-saffiche-de-nouveau', itemCount: 3 },
  { id: '2026-08-30-un-refus-arrete-vraiment-tout', itemCount: 1 },
  { id: '2026-08-30-une-reprise-dimport-ne-recommence-plus-de-zero', itemCount: 1 },
  { id: '2026-08-30-le-site-dit-ce-quon-branche', itemCount: 2 },
  { id: '2026-08-30-un-filtre-vide-nest-pas-un-portefeuille-vide', itemCount: 3 },
  { id: '2026-08-30-les-conversations-ont-leur-colonne', itemCount: 2 },
  { id: '2026-08-30-le-bandeau-organigramme-dit-ce-quil-ignore', itemCount: 3 },
  { id: '2026-08-30-corriger-un-organigramme', itemCount: 4 },
  { id: '2026-08-30-une-colonne-ne-se-coupe-plus', itemCount: 3 },
  { id: '2026-08-30-une-fiche-sans-nom-le-dit', itemCount: 2 },
  { id: '2026-08-30-les-conditions-disent-le-report-de-credits', itemCount: 2 },
  { id: '2026-08-30-repondre-a-laura-ne-compte-pas', itemCount: 3 },
  { id: '2026-08-30-un-dossier-ne-change-plus-dentreprise', itemCount: 3 },
  { id: '2026-08-30-les-raccourcis-ont-leur-page', itemCount: 3 },
  { id: '2026-08-30-le-selecteur-trouve-la-bonne-societe', itemCount: 3 },
  { id: '2026-08-30-un-taux-ne-ment-plus-sur-zero', itemCount: 3 },
  { id: '2026-08-30-une-mission-a-son-adresse', itemCount: 3 },
  { id: '2026-08-30-laura-demande-avant-de-repondre', itemCount: 3 },
  { id: '2026-08-30-lancer-une-analyse-depuis-la-liste-des-comptes', itemCount: 3 },
  { id: '2026-08-30-laura-dit-quand-elle-ne-peut-pas-agir', itemCount: 2 },
  { id: '2026-08-30-un-chiffre-dit-quand-il-a-ete-calcule', itemCount: 3 },
  { id: '2026-08-30-un-ecran-dit-ce-quil-peut-faire', itemCount: 3 },
  { id: '2026-08-30-un-chiffre-dit-sur-combien-il-est-calcule', itemCount: 3 },
  { id: '2026-08-29-un-angle-porte-sa-preuve', itemCount: 3 },
  { id: '2026-08-30-un-compte-se-mentionne-pareil-partout', itemCount: 2 },
  { id: '2026-08-30-un-total-nadditionne-pas-deux-statuts', itemCount: 3 },
  { id: '2026-08-29-trois-chiffres-qui-disent-ce-quils-comptent', itemCount: 3 },
  { id: '2026-08-29-familles-de-decideurs', itemCount: 2 },
  { id: '2026-08-29-import-interrompu-se-reprend', itemCount: 3 },
  { id: '2026-08-29-lorganigramme-dit-ce-quil-devine', itemCount: 4 },
  { id: '2026-08-29-une-mission-sans-fin-se-dit', itemCount: 3 },
  { id: '2026-08-29-les-raccourcis-clavier-sont-visibles', itemCount: 3 },
  { id: '2026-08-29-une-couleur-dit-un-etat', itemCount: 4 },
  { id: '2026-08-29-ce-que-tu-dis-a-laura-reste-a-toi', itemCount: 2 },
  { id: '2026-08-29-le-depart-dun-membre', itemCount: 3 },
  { id: '2026-08-29-laura-sait-par-ou-tu-entres', itemCount: 4 },
  { id: '2026-08-29-credits-engages-et-objections', itemCount: 3 },
  { id: '2026-08-29-demarrer-une-chaine', itemCount: 3 },
  { id: '2026-08-29-la-source-dit-ce-quelle-apporte', itemCount: 2 },
  { id: '2026-08-29-organigramme-une-direction-a-la-fois', itemCount: 4 },
  { id: '2026-08-29-corriger-un-organigramme-sans-tout-casser', itemCount: 3 },
  { id: '2026-08-29-lorganigramme-connait-tout-le-compte', itemCount: 3 },
  { id: '2026-08-29-se-connecter-et-reprendre-une-base', itemCount: 2 },
  { id: '2026-08-29-la-connaissance-recente-passe-devant', itemCount: 2 },
  { id: '2026-08-29-la-memoire-de-laura-se-voit', itemCount: 3 },
  { id: '2026-08-29-pourquoi-ce-profil-est-ecarte', itemCount: 3 },
  { id: '2026-08-29-un-brouillon-est-un-brouillon', itemCount: 2 },
  { id: '2026-08-29-un-score-ne-sort-jamais-nu', itemCount: 3 },
  { id: '2026-08-29-le-temps-reel-verifie-qui-tu-es', itemCount: 2 },
  { id: '2026-08-29-la-frise-des-missions', itemCount: 3 },
  { id: '2026-08-29-le-portefeuille-se-commande', itemCount: 3 },
  { id: '2026-08-29-savoir-ou-en-est-largent', itemCount: 4 },
  { id: '2026-08-29-ce-que-le-poste-exige', itemCount: 3 },
  { id: '2026-08-29-la-barriere-dachat-sur-le-dossier', itemCount: 3 },
  { id: '2026-08-29-laura-se-tait-quand-tu-travailles', itemCount: 3 },
  { id: '2026-08-29-connecte-dun-cote-donnee-de-lautre', itemCount: 3 },
  { id: '2026-08-29-partenaires-gardes-armees', itemCount: 3 },
  { id: '2026-08-29-le-portage-est-un-canal', itemCount: 2 },
  { id: '2026-08-29-les-libelles-tiennent-sur-une-ligne', itemCount: 2 },
  { id: '2026-08-29-les-roles-sappliquent-partout', itemCount: 2 },
  { id: '2026-08-29-un-chiffre-qui-mentait-ne-ment-plus', itemCount: 3 },
  { id: '2026-08-29-score-debordement-territoire', itemCount: 2 },
  { id: '2026-08-29-relancer-une-analyse-la-relance-vraiment', itemCount: 3 },
  { id: '2026-08-29-laura-parle-autant-que-tu-lecoutes', itemCount: 3 },
  { id: '2026-08-28-comparer-deux-comptes', itemCount: 2 },
  { id: '2026-08-28-mon-chiffre-daffaires-est-le-mien', itemCount: 2 },
  { id: '2026-08-28-ce-qui-mattend-parle-de-ton-metier', itemCount: 2 },
  { id: '2026-08-28-le-besoin-a-sa-fiche', itemCount: 3 },
  { id: '2026-08-28-ou-en-est-ce-contact', itemCount: 3 },
  { id: '2026-08-28-ce-qui-a-bouge-depuis-ta-derniere-visite', itemCount: 2 },
  { id: '2026-08-28-le-back-office-la-ou-il-change-une-decision', itemCount: 4 },
  { id: '2026-08-28-laura-lit-le-back-office', itemCount: 3 },
  { id: '2026-08-28-un-pipe-non-chiffre-ne-dit-plus-zero', itemCount: 2 },
  { id: '2026-08-28-ton-cockpit-sur-ta-page-daccueil', itemCount: 3 },
  { id: '2026-08-28-la-fiche-repond-pendant-que-tu-la-remplis', itemCount: 3 },
  { id: '2026-08-28-le-consentement-commande-les-traceurs', itemCount: 3 },
  { id: '2026-08-28-les-mots-de-ton-esn-et-tes-favoris', itemCount: 3 },
  { id: '2026-08-28-la-marge-le-go-et-les-credits', itemCount: 5 },
  { id: '2026-08-28-une-tache-annulee-nest-plus-une-prochaine-action', itemCount: 2 },
  { id: '2026-08-28-ce-qui-cloche-se-voit-sur-la-ligne', itemCount: 3 },
  { id: '2026-08-28-missions-la-liste-se-regle-la-fiche-souvre', itemCount: 3 },
  { id: '2026-08-28-le-delai-de-paiement-dit-sur-quoi-il-porte', itemCount: 2 },
  { id: '2026-08-28-laura-dit-enfin-ce-quelle-a-a-dire', itemCount: 2 },
  { id: '2026-08-28-les-retours-dexperience-ont-un-ecran', itemCount: 2 },
  { id: '2026-08-28-quatre-gestes-de-plus-disent-leur-prix', itemCount: 3 },
  { id: '2026-08-28-une-facture-en-litige-ne-se-relance-pas', itemCount: 1 },
  { id: '2026-08-28-une-page-dit-ce-quon-ne-fait-pas', itemCount: 2 },
  { id: '2026-08-28-preparer-une-proposition-sans-la-ressaisir', itemCount: 2 },
  { id: '2026-08-28-un-lien-dorganigramme-dit-dou-il-vient', itemCount: 2 },
  { id: '2026-08-28-aucun-debit-ne-part-sans-avoir-ete-annonce', itemCount: 3 },
  { id: '2026-08-28-la-demo-montre-le-kanban-des-besoins', itemCount: 2 },
  { id: '2026-08-28-une-relance-sans-texte-nest-plus-proposee', itemCount: 2 },
  { id: '2026-08-28-une-salle-de-demo-incomplete-se-repare', itemCount: 2 },
  { id: '2026-08-28-rejeter-un-releve-avec-son-motif', itemCount: 2 },
  { id: '2026-08-28-contacts-cinq-vues-et-cout-avant-le-clic', itemCount: 3 },
  { id: '2026-08-28-besoins-le-pied-de-carte-dit-ce-qui-compte', itemCount: 2 },
  { id: '2026-08-28-la-demo-montre-ce-que-laura-sait-voir', itemCount: 2 },
  { id: '2026-08-28-les-compteurs-ne-portent-plus-de-courbe', itemCount: 2 },
  { id: '2026-08-28-chaque-chiffre-mene-la-ou-il-compte', itemCount: 3 },
  { id: '2026-08-28-missions-aucun-ecran-vide-ne-laisse-chercher', itemCount: 2 },
  { id: '2026-08-28-laura-sait-dire-dix-sept-choses-de-plus', itemCount: 2 },
  { id: '2026-08-28-la-veille-mene-a-ce-quelle-compte', itemCount: 2 },
  { id: '2026-08-28-trois-situations-au-lieu-dun-ou', itemCount: 2 },
  { id: '2026-08-28-calculateur-de-rentabilite', itemCount: 2 },
  { id: '2026-08-28-un-ecran-vide-ouvre-la-porte-quil-nomme', itemCount: 2 },
  { id: '2026-08-28-le-controle-avant-envoi-sait-a-qui', itemCount: 2 },
  { id: '2026-08-27-zero-nest-pas-une-reponse', itemCount: 4 },
  { id: '2026-08-27-la-relance-dit-son-echeance', itemCount: 2 },
  { id: '2026-08-27-une-valeur-absente-se-dit', itemCount: 2 },
  { id: '2026-08-27-explication-du-classement', itemCount: 2 },
  { id: '2026-08-27-un-besoin-dit-sa-source', itemCount: 2 },
  { id: '2026-08-27-une-offre-un-prix', itemCount: 2 },
  { id: '2026-08-27-action-a-la-main-est-enregistree', itemCount: 2 },
  { id: '2026-08-27-le-chiffre-mene-a-ce-qu-il-compte', itemCount: 2 },
  { id: '2026-08-27-les-etats-vides-ouvrent-une-porte', itemCount: 2 },
  { id: '2026-08-27-un-ecran-vide-dit-ce-qu-il-sait', itemCount: 2 },
  { id: '2026-08-27-le-bouton-dit-ce-qu-il-va-faire', itemCount: 2 },
  { id: '2026-08-27-lancer-depuis-la-saisie', itemCount: 4 },
  { id: '2026-08-27-ce-qui-ne-se-voyait-pas', itemCount: 6 },
  { id: '2026-08-27-echeances-2001', itemCount: 3 },
  { id: '2026-08-27-back-office', itemCount: 4 },
  { id: '2026-08-26-rien-ne-part-sans-toi', itemCount: 3 },
  { id: '2026-08-26-chiffres-devines', itemCount: 2 },
  { id: '2026-08-26-credits-verite', itemCount: 3 },
  { id: '2026-08-26-recrutement', itemCount: 2 },
  { id: '2026-08-26-troisieme-lot', itemCount: 2 },
  { id: '2026-08-26-second-lot', itemCount: 5 },
  { id: '2026-08-26-recette-terrain', itemCount: 8 },
  { id: '2026-08-26-lanceur', itemCount: 4 },
  { id: '2026-08-26-arbitrages-beta', itemCount: 4 },
  { id: '2026-08-26-retours-beta', itemCount: 6 },
  { id: '2026-08-26-laura-refonte', itemCount: 5 },
  { id: '2026-08-25-secteur-demande', itemCount: 3 },
  { id: '2026-08-25-action-os', itemCount: 3 },
  { id: '2026-08-25-profil-perime', itemCount: 2 },
  { id: '2026-08-25-fraicheur', itemCount: 2 },
  { id: '2026-08-25-import-legacy', itemCount: 4 },
  { id: '2026-08-25-questions', itemCount: 4 },
  { id: '2026-08-25-avant-envoi', itemCount: 4 },
  { id: '2026-08-25-titres-metier', itemCount: 3 },
  { id: '2026-08-25-historique-compte', itemCount: 2 },
  { id: '2026-08-24-retour-client', itemCount: 2 },
  { id: '2026-08-24-preparer-rdv', itemCount: 2 },
  { id: '2026-08-24-import-fidele', itemCount: 3 },
  { id: '2026-08-24-rien-nest-parti', itemCount: 3 },
  { id: '2026-08-24-portefeuille-offre', itemCount: 3 },
  { id: '2026-08-24-portefeuille-domaines', itemCount: 3 },
  { id: '2026-08-23-lisibilite', itemCount: 3 },
  { id: '2026-08-23-veille-territoire', itemCount: 4 },
  { id: '2026-08-23-laura-fiabilite', itemCount: 3 },
  { id: '2026-08-23-plan-de-compte', itemCount: 4 },
  { id: '2026-08-23-second-marche', itemCount: 4 },
  { id: '2026-08-22-barriere-achat', itemCount: 3 },
  { id: '2026-08-22-communaute-acces', itemCount: 3 },
  { id: '2026-08-22-cabinets-recrutement', itemCount: 2 },
  { id: '2026-08-22-boards-ats', itemCount: 2 },
  { id: '2026-08-22-echeance-marche', itemCount: 2 },
  { id: '2026-08-22-par-ou-commencer', itemCount: 2 },
  { id: '2026-08-22-reseau-dormant', itemCount: 2 },
  { id: '2026-08-22-porte-filiale', itemCount: 2 },
  { id: '2026-08-22-peremption-refus', itemCount: 2 },
  { id: '2026-08-22-contribution', itemCount: 2 },
  { id: '2026-08-22-comptes-ecartes', itemCount: 2 },
  { id: '2026-08-22-porte-relation', itemCount: 2 },
  { id: '2026-08-22-decouvrir-familles', itemCount: 3 },
  { id: '2026-08-22-onglet-acces', itemCount: 3 },
  { id: '2026-08-22-adressabilite', itemCount: 3 },
  { id: '2026-08-22-esn-en-place', itemCount: 3 },
  { id: '2026-08-22-laura-produit', itemCount: 3 },
  { id: '2026-08-22-laura', itemCount: 4 },
  { id: '2026-08-22-audit', itemCount: 4 },
  { id: '2026-08-22-pilotage', itemCount: 4 },
  { id: '2026-08-22-rituels', itemCount: 4 },
  { id: '2026-08-21-connecteurs', itemCount: 4 },
  { id: '2026-08-21-import', itemCount: 3 },
  { id: '2026-08-21-processus', itemCount: 3 },
  { id: '2026-08-21-dette', itemCount: 4 },
  { id: '2026-08-21-commandes', itemCount: 4 },
  { id: '2026-08-21-chaines', itemCount: 4 },
  { id: '2026-08-21-copilote-outils', itemCount: 4 },
  { id: '2026-08-21-proactivite', itemCount: 4 },
  { id: '2026-08-21-canaux-honnetes', itemCount: 4 },
  { id: '2026-08-21-board-missions', itemCount: 4 },
  { id: '2026-08-21-releves-activite', itemCount: 5 },
  { id: '2026-08-21-facturation-honnete', itemCount: 5 },
  { id: '2026-08-21-quatre-ca', itemCount: 4 },
  { id: '2026-08-20-matching-douze-axes', itemCount: 5 },
  { id: '2026-08-20-shortlist-figee', itemCount: 3 },
  { id: '2026-08-20-matching-inverse', itemCount: 3 },
  { id: '2026-08-20-consentement-talent', itemCount: 3 },
  { id: '2026-08-20-pool-reactivation', itemCount: 3 },
  { id: '2026-08-20-mobilite-preferences', itemCount: 3 },
  { id: '2026-08-20-alias-competences', itemCount: 3 },
  { id: '2026-08-20-deja-refuse', itemCount: 3 },
  { id: '2026-08-20-studio-dossier', itemCount: 5 },
  { id: '2026-08-20-revue-cv', itemCount: 4 },
  { id: '2026-08-20-depot-cv', itemCount: 4 },
  { id: '2026-08-20-vivier-vues', itemCount: 4 },
  { id: '2026-08-20-talent-natures', itemCount: 4 },
  { id: '2026-08-20-vivier-disponibilite', itemCount: 5 },
  { id: '2026-08-19-crm-interne', itemCount: 11 },
  { id: '2026-08-19-board-missions', itemCount: 3 },
  { id: '2026-08-19-multi-entite', itemCount: 3 },
  { id: '2026-08-19-cloisonnement', itemCount: 2 },
  { id: '2026-08-19-roles-metier', itemCount: 3 },
  { id: '2026-08-19-socle-defauts', itemCount: 5 },
  { id: '2026-08-18-agenda-grille', itemCount: 4 },
  { id: '2026-08-18-copilote-fichiers', itemCount: 4 },
  { id: '2026-08-18-playbooks-simulation', itemCount: 3 },
  { id: '2026-08-18-interventions', itemCount: 3 },
  { id: '2026-08-18-audit-p1', itemCount: 5 },
  { id: '2026-08-18-recette-beta', itemCount: 5 },
  { id: '2026-08-17-demo-delivery', itemCount: 2 },
  { id: '2026-08-17-playbooks-cockpit', itemCount: 4 },
  { id: '2026-08-17-gouvernance-crm', itemCount: 3 },
  { id: '2026-08-17-reprise-crm', itemCount: 4 },
  { id: '2026-08-17-revenue-protection', itemCount: 4 },
  { id: '2026-08-17-missions-staffing', itemCount: 4 },
  { id: '2026-08-17-positionnements', itemCount: 4 },
  { id: '2026-08-17-vivier-talents', itemCount: 4 },
  { id: '2026-08-17-navigation-neuf', itemCount: 3 },
  { id: '2026-08-17-taches-aujourdhui', itemCount: 4 },
  { id: '2026-08-17-historique-echanges', itemCount: 4 },
  { id: '2026-08-17-projet-pivot', itemCount: 4 },
  { id: '2026-08-17-fiches-editables', itemCount: 4 },
  { id: '2026-08-16-analyse-reprise', itemCount: 2 },
  { id: '2026-08-16-decouvrir-lisibilite', itemCount: 3 },
  { id: '2026-08-16-agenda-jour-semaine', itemCount: 3 },
  { id: '2026-08-16-grille-tarifaire', itemCount: 3 },
  { id: '2026-08-16-connecteurs-capacites', itemCount: 3 },
  { id: '2026-08-16-agenda-tous', itemCount: 3 },
  { id: '2026-08-16-agenda-choix', itemCount: 3 },
  { id: '2026-08-16-journee-liens', itemCount: 2 },
  { id: '2026-08-16-fiche-positionnement-attente', itemCount: 2 },
  { id: '2026-08-15-signalement-verite', itemCount: 1 },
  { id: '2026-08-14-integrations-faux-expire', itemCount: 2 },
  { id: '2026-08-14-retours-beta', itemCount: 4 },
  { id: '2026-08-14-integrations-ecran-unique', itemCount: 3 },
  { id: '2026-08-11-demo-comptes-reels', itemCount: 3 },
  { id: '2026-08-10-devises', itemCount: 2 },
  { id: '2026-08-10-centre-actions', itemCount: 3 },
  { id: '2026-08-10-centre-integrations', itemCount: 3 },
  { id: '2026-08-05-recherche-ciblee', itemCount: 3 },
  { id: '2026-08-04-carte-influence', itemCount: 2 },
  { id: '2026-08-03-signatures-factures', itemCount: 2 },
  { id: '2026-08-03-ecriture-erp', itemCount: 2 },
  { id: '2026-08-03-classement-messages', itemCount: 2 },
  { id: '2026-08-03-enrichisseurs', itemCount: 2 },
  { id: '2026-08-03-compte-rendu', itemCount: 2 },
  { id: '2026-08-03-reseau', itemCount: 2 },
  { id: '2026-08-03-livrables', itemCount: 2 },
  { id: '2026-08-03-telephonie', itemCount: 2 },
  { id: '2026-08-03-pipeline-crm', itemCount: 3 },
  { id: '2026-08-03-routines-completes', itemCount: 3 },
  { id: '2026-08-03-pieces-jointes-et-enrichissement', itemCount: 3 },
  { id: '2026-08-03-fichiers-et-import', itemCount: 2 },
  { id: '2026-08-03-lots-et-crm', itemCount: 2 },
  { id: '2026-08-03-copilote-et-ats', itemCount: 3 },
  { id: '2026-08-03-routines', itemCount: 3 },
  { id: '2026-08-03-journee-et-messagerie', itemCount: 3 },
  { id: '2026-08-03-tutoiement-et-profil', itemCount: 3 },
  { id: '2026-08-03-crm-deux-sens', itemCount: 2 },
  { id: '2026-08-02-credits-ponderes', itemCount: 3 },
  { id: '2026-08-02-langue-et-sources', itemCount: 2 },
  { id: '2026-08-02-onboarding-profil', itemCount: 2 },
  { id: '2026-08-02-perimetre-et-signaux', itemCount: 3 },
  { id: '2026-08-02-appels-offres', itemCount: 3 },
  { id: '2026-08-02-besoins-progression', itemCount: 2 },
  { id: '2026-08-02-missions-renouvellement', itemCount: 3 },
  { id: '2026-08-01-couts-fournisseurs', itemCount: 1 },
  { id: '2026-08-01-plan-attaque-besoin', itemCount: 2 },
  { id: '2026-07-31-grille-besoins-cv', itemCount: 3 },
  { id: '2026-07-31-demo-page-accueil', itemCount: 2 },
  { id: '2026-08-02-centre-actions', itemCount: 3 },
  { id: '2026-08-02-decouvrir-qualification', itemCount: 3 },
  { id: '2026-08-02-copilote-gouverne', itemCount: 3 },
  { id: '2026-08-02-messages-premier-contact', itemCount: 3 },
  { id: '2026-07-29-offre-appliquee-tarifs', itemCount: 2 },
  { id: '2026-07-28-fiche-contact-demo', itemCount: 2 },
  { id: '2026-07-28-demo-espace-complet', itemCount: 2 },
  { id: '2026-07-25-demo-plusieurs-visiteurs', itemCount: 2 },
  { id: '2026-07-25-credits-jauge-unique', itemCount: 1 },
  { id: '2026-07-24-mode-demo-et-offres', itemCount: 3 },
  { id: '2026-07-24-enrichissement-sans-attente', itemCount: 3 },
  { id: '2026-07-24-copilote-fils-par-compte', itemCount: 2 },
  { id: '2026-07-24-contacts-apollo-complets', itemCount: 3 },
  { id: '2026-07-24-boucle-apprentissage', itemCount: 2 },
  { id: '2026-07-24-signal-dans-le-graphe', itemCount: 2 },
  { id: '2026-07-24-veille-page-unique', itemCount: 2 },
  { id: '2026-07-24-cv-selon-mission', itemCount: 3 },
  { id: '2026-07-24-couche-zero-connecteurs', itemCount: 3 },
  { id: '2026-07-24-decouvrir-portefeuille', itemCount: 2 },
  { id: '2026-07-24-copilote-agit-vraiment', itemCount: 3 },
  { id: '2026-07-24-contacts-actions-masse', itemCount: 2 },
  { id: '2026-07-24-memoire-signal-complets', itemCount: 2 },
  { id: '2026-07-24-firmographie-recoupee', itemCount: 3 },
  { id: '2026-07-24-perimetre-du-compte', itemCount: 1 },
  { id: '2026-07-24-score-sur-25', itemCount: 2 },
  { id: '2026-07-24-methodo-reste', itemCount: 4 },
  { id: '2026-07-24-copilote-conversations', itemCount: 1 },
  { id: '2026-07-24-decouvrir-rail-unifie', itemCount: 2 },
  { id: '2026-07-24-cockpit-pipeline-objectifs', itemCount: 3 },
  { id: '2026-07-24-connaissances-reglages', itemCount: 1 },
  { id: '2026-07-24-veille-digest-quotidien', itemCount: 2 },
  { id: '2026-07-24-org-niveau-achats-acces', itemCount: 2 },
  { id: '2026-07-24-comite-achat-gouvernance', itemCount: 1 },
  { id: '2026-07-24-compteur-offres-exact', itemCount: 1 },
  { id: '2026-07-23-organigramme-reste', itemCount: 3 },
  { id: '2026-07-23-cadence-preuve-neuve-sources', itemCount: 2 },
  { id: '2026-07-24-dossier-francais-accentue', itemCount: 2 },
  { id: '2026-07-24-copilote-connecteurs-carte', itemCount: 2 },
  { id: '2026-07-24-decouvrir-fit-vue-liste', itemCount: 3 },
  { id: '2026-07-24-cockpit-agenda-playbooks', itemCount: 2 },
  { id: '2026-07-24-besoin-crm-objet', itemCount: 2 },
  { id: '2026-07-24-veille-regles', itemCount: 3 },
  { id: '2026-07-24-historique-depuis-connexion', itemCount: 2 },
  { id: '2026-07-23-vivier-consultants', itemCount: 3 },
  { id: '2026-07-23-pourquoi-cette-strategie', itemCount: 3 },
  { id: '2026-07-23-verdict-explorer-et-liens-onglets', itemCount: 2 },
  { id: '2026-07-23-profil-progressif', itemCount: 4 },
  { id: '2026-07-23-plus-de-rebond-vers-le-questionnaire', itemCount: 2 },
  { id: '2026-07-23-boucle-redirection', itemCount: 2 },
  { id: '2026-07-23-copilote-agit', itemCount: 3 },
  { id: '2026-07-23-contacts-a-completer', itemCount: 2 },
  { id: '2026-07-23-compte-porte-par-collegue', itemCount: 2 },
  { id: '2026-07-23-panne-serveur-sans-deconnexion', itemCount: 3 },
  { id: '2026-07-23-credits-boutons-grises', itemCount: 3 },
  { id: '2026-07-23-monnaie-unique', itemCount: 3 },
  { id: '2026-07-23-verifier-un-lien', itemCount: 3 },
  { id: '2026-07-23-organigramme-details', itemCount: 4 },
  { id: '2026-07-23-identite-navigateur', itemCount: 2 },
  { id: '2026-07-23-onglet-a-jour', itemCount: 2 },
  { id: '2026-07-23-bandeau-abonnement', itemCount: 2 },
  { id: '2026-07-23-onboarding-compte-etabli', itemCount: 2 },
  { id: '2026-07-23-organigramme-non-bloquant', itemCount: 2 },
  { id: '2026-07-23-compteurs-plus-clairs', itemCount: 2 },
  { id: '2026-07-23-besoin-crm-angle-scope', itemCount: 3 },
  { id: '2026-07-23-offres-finance-provenance', itemCount: 2 },
  { id: '2026-07-23-apercu-sources-confiance', itemCount: 3 },
  { id: '2026-07-23-veille-signal-fraicheur', itemCount: 3 },
  { id: '2026-07-22-onboarding-offre-existante', itemCount: 3 },
  { id: '2026-07-23-copilote-source-nature-dossier', itemCount: 3 },
  { id: '2026-07-23-cadence-relationnelle', itemCount: 3 },
  { id: '2026-07-23-zones-blanches-cockpit', itemCount: 4 },
  { id: '2026-07-23-carte-influence-structurelle', itemCount: 3 },
  { id: '2026-07-23-comptes-proches-et-besoins-a-qualifier', itemCount: 3 },
  { id: '2026-07-22-newsletter-changelog', itemCount: 3 },
  { id: '2026-07-22-besoin-rappel-et-comparaison', itemCount: 3 },
  { id: '2026-07-22-organigramme-influence-correction', itemCount: 4 },
  { id: '2026-07-22-deux-notes-deux-noms', itemCount: 3 },
  { id: '2026-07-22-profil-complement', itemCount: 3 },
  { id: '2026-07-22-cadrer-la-collecte', itemCount: 3 },
  { id: '2026-07-22-besoins-source-confiance', itemCount: 3 },
  { id: '2026-07-22-cockpit-manager', itemCount: 4 },
  { id: '2026-07-22-organigramme-source-officielle', itemCount: 3 },
  { id: '2026-07-22-decouvrir-sans-idee', itemCount: 4 },
  { id: '2026-07-22-actions-par-echeance', itemCount: 3 },
  { id: '2026-07-22-organigramme-liens-honnetes', itemCount: 4 },
  { id: '2026-07-22-confiance-detaillee', itemCount: 3 },
  { id: '2026-07-22-funnel-dans-le-dossier', itemCount: 3 },
  { id: '2026-07-22-ecartes-hors-perimetre', itemCount: 2 },
  { id: '2026-07-22-quick-wins-dates', itemCount: 3 },
  { id: '2026-07-22-recherche-ciblee-zone-blanche', itemCount: 3 },
  { id: '2026-07-22-copilote-cite-la-methode', itemCount: 3 },
  { id: '2026-07-22-plan-taille-equipe-sales', itemCount: 3 },
  { id: '2026-07-22-historique-signal', itemCount: 3 },
  { id: '2026-07-22-copilote-fraicheur-sources', itemCount: 3 },
  { id: '2026-07-22-renouvellement-date', itemCount: 2 },
  { id: '2026-07-22-carte-couverture', itemCount: 3 },
  { id: '2026-07-22-couche-zero-crm', itemCount: 3 },
  { id: '2026-07-22-contacts-tout-selectionner', itemCount: 2 },
  { id: '2026-07-22-journal-recherche', itemCount: 3 },
  { id: '2026-07-22-organigramme-corrections', itemCount: 3 },
  { id: '2026-07-22-score-provisoire', itemCount: 3 },
  { id: '2026-07-22-contacts-mobile', itemCount: 2 },
  { id: '2026-07-22-veille-pourquoi', itemCount: 3 },
  { id: '2026-07-22-zones-blanches-matrice', itemCount: 3 },
  { id: '2026-07-22-chemin-sans-board-froid', itemCount: 3 },
  { id: '2026-07-22-funnel-contacts', itemCount: 3 },
  { id: '2026-07-22-classification-profil-vendeur', itemCount: 3 },
  { id: '2026-07-22-organigramme-4-vues', itemCount: 4 },
  { id: '2026-07-21-preferences-fonctionnelles', itemCount: 4 },
  { id: '2026-07-21-besoins-cycle-de-vie', itemCount: 3 },
  { id: '2026-07-21-plan-prochains-mouvements', itemCount: 3 },
  { id: '2026-07-21-score-compte-methodo', itemCount: 3 },
  { id: '2026-07-21-onboarding-bienvenue', itemCount: 3 },
  { id: '2026-07-21-scope-confirm', itemCount: 3 },
  { id: '2026-07-21-contacts-angle', itemCount: 3 },
  { id: '2026-07-21-message-retry', itemCount: 2 },
  { id: '2026-07-21-credits-detail', itemCount: 3 },
  { id: '2026-07-21-contacts-centaines', itemCount: 3 },
  { id: '2026-07-20-derniere-analyse-date', itemCount: 3 },
  { id: '2026-07-20-historique-issues', itemCount: 3 },
  { id: '2026-07-20-progression-analyse', itemCount: 4 },
  { id: '2026-07-20-decouvrir-filtres', itemCount: 3 },
  { id: '2026-07-20-connaissances-equipe', itemCount: 3 },
  { id: '2026-07-20-decouvrir-couverture', itemCount: 3 },
  { id: '2026-07-20-rejoindre-espace', itemCount: 4 },
  { id: '2026-07-20-recharges-cycle', itemCount: 3 },
  { id: '2026-07-20-portefeuille-equipe', itemCount: 4 },
  { id: '2026-07-20-score-contact-unifie', itemCount: 4 },
  { id: '2026-07-20-copilote-pastille', itemCount: 2 },
  { id: '2026-07-20-fiche-compte-coherence', itemCount: 7 },
  { id: '2026-07-20-copilote-logos', itemCount: 4 },
  { id: '2026-07-20-dates-veille', itemCount: 3 },
  { id: '2026-07-20-contacts-compteurs', itemCount: 3 },
  { id: '2026-07-19-onboarding-homonymes', itemCount: 4 },
  { id: '2026-07-20-messages-provenance', itemCount: 3 },
  { id: '2026-07-19-draft-editing', itemCount: 4 },
  { id: '2026-07-19-send-from-panel', itemCount: 3 },
  { id: '2026-07-19-enrichissement-credits', itemCount: 3 },
  { id: '2026-07-19-apollo-i18n', itemCount: 3 },
  { id: '2026-07-19-needs-redesign', itemCount: 4 },
  { id: '2026-07-19-signalement-bug', itemCount: 3 },
  { id: '2026-07-19-needs', itemCount: 3 },
  { id: '2026-07-19-reouverture-dossier', itemCount: 2 },
  { id: '2026-07-19-onboarding-prefill', itemCount: 3 },
  { id: '2026-07-18-weekly-briefing', itemCount: 3 },
  { id: '2026-07-18-language', itemCount: 2 },
  { id: '2026-07-18-contact-score', itemCount: 3 },
  { id: '2026-07-17-search', itemCount: 2 },
  { id: '2026-07-17-tailored', itemCount: 3 },
  { id: '2026-07-16-briefs', itemCount: 4 },
  { id: '2026-07-16-monitoring', itemCount: 3 },
  { id: '2026-07-16-credits', itemCount: 3 },
  { id: '2026-07-16-integrations', itemCount: 4 },
  { id: '2026-07-16-workspace', itemCount: 4 },
  { id: '2026-07-13', itemCount: 3 },
  { id: '2026-07-12', itemCount: 2 },
  { id: '2026-07-06', itemCount: 2 },
  { id: '2026-08-29-les-cibles-chiffrees', itemCount: 4 },
  { id: '2026-08-31-la-prochaine-action-se-clique', itemCount: 3 },
  { id: '2026-09-01-finance-filtre-societe', itemCount: 4 },
  { id: '2026-09-01-le-chemin-part-de-toi-et-dit-son-age', itemCount: 4 },
  { id: '2026-09-01-le-releve-le-bon-de-commande-et-le-paiement-client', itemCount: 3 },
  { id: '2026-09-01-la-fiche-dun-talent-souvre-sur-la-personne', itemCount: 4 },
  { id: '2026-09-01-laura-dit-quelle-est-une-ia-et-la-memoire-souvre', itemCount: 4 },
  { id: '2026-09-01-un-plan-d-enrichissement-qui-se-reprend', itemCount: 4 },
  { id: '2026-09-01-lecran-marche-dit-ce-que-chaque-chiffre-vaut', itemCount: 5 },
  { id: '2026-09-01-quatre-detecteurs-et-un-chiffre-qui-sexplique', itemCount: 4 },
  { id: '2026-08-31-les-compteurs-savent-enfin-dire-comment-ils-ont-bouge', itemCount: 4 },
  { id: '2026-09-01-le-vivier-regarde-vers-le-marche', itemCount: 3 },
  { id: '2026-08-31-paiements-cessions-adv-les-trous-refermes', itemCount: 5 },
  { id: '2026-09-11-la-visite-guidee-ne-perd-plus-le-fil', itemCount: 4 },
  { id: '2026-09-16-un-renouvellement-dit-ou-il-en-est', itemCount: 3 },
  { id: '2026-09-16-le-vivier-se-lit-en-colonnes', itemCount: 4 },
  // #2327 — LAU-FINAL-068. #2327.1 / #2327.17 (défaut recette passage 7, 17/09) : item4.
  { id: '2026-09-17-une-personne-une-fiche', itemCount: 4 },
  // #2254 — brancher un outil Google n'en branche plus un autre par erreur.
  { id: '2026-09-17-brancher-gmail-ne-branche-plus-lagenda', itemCount: 1 },
  // #2687 — un signal de la veille dit enfin ce qu'il mène à faire.
  { id: '2026-09-21-un-signal-dit-ce-quil-mene-a-faire', itemCount: 2 },
  // #2107.3 — la ligne « Besoin sans shortlist » du brief mène à la fiche du besoin, plus à la liste des projets.
  { id: '2026-09-21-un-besoin-sans-shortlist-souvre-sur-sa-fiche', itemCount: 1 },
  // #2254 — brancher un outil Google n'en branche plus un autre par erreur.
  // #2327 — LAU-FINAL-068. #2327.1 / #2327.17 (défaut recette passage 7, 17/09) : item4.
  // #3261.9 — l'en-tête de décision suggère une date de revue.
  { id: '2026-09-29-la-decision-suggere-sa-date-de-revue', itemCount: 1 },
  // #3270 (reste) — le cadre partenaire s'édite, plus seulement se lit.
  { id: '2026-09-29-le-cadre-partenaire-sedite', itemCount: 1 },
  // #3253.d (reste de #3294) — le diagnostic du maillon faible atteint Pilotage.
  { id: '2026-09-29-le-maillon-faible-atteint-pilotage', itemCount: 1 },
  // #3269 (reste de #3291) — les jalons de delivery se lisent et se déclarent.
  { id: '2026-09-29-les-jalons-de-delivery-sur-la-fiche-mission', itemCount: 1 },
  // #3272 (reste de #3295) — sponsor, route utilisée, dernière action dans le REX de perte.
  { id: '2026-09-29-le-rex-de-perte-nomme-le-sponsor-et-la-route', itemCount: 1 },
  // #3253.d (reste de #3294) — le diagnostic du maillon faible atteint Profil.
  { id: '2026-09-29-le-maillon-faible-atteint-profil', itemCount: 1 },
  // #3482 / #3483 / #2953 / #3340 / #3225 — lot Q01 : ce que la recette du 30/09 a relevé.
  { id: '2026-09-30-recette-q01-etats-orphelins-et-dossier-mission', itemCount: 5 },
  // Lot Q02 (#3293, #3296, #3392, #3428) — recette prod du 30/09 : des cartes qui tiennent leur place.
  { id: '2026-09-30-des-cartes-qui-tiennent-leur-place', itemCount: 4 },
  // #2877 (#2385.4) — signaler un faux fait, un CTA ou un persona incorrect depuis le centre d'approbation.
  { id: '2026-09-30-signaler-un-probleme-sur-un-message', itemCount: 1 },
  // #3481 — l'import d'une archive ZIP de 600 Mo : imbriquées lues en flux, plafond du seau.
  { id: '2026-10-01-import-zip-de-600-mo-sans-saturer-la-memoire', itemCount: 2 },
  // #3469 / #3482 / #3227 / #3225 (lot X01, 01/10) — focus du composer, périmètre de groupe du fil, lecture du groupe.
  { id: '2026-10-01-le-chat-a-le-focus-et-dit-le-perimetre', itemCount: 3 },
  // #3241 (#3190.9, lot W04 01/10) — un axe non mesuré n'est jamais écrit « 0 ».
  { id: '2026-10-01-laura-ne-transforme-plus-un-non-mesure-en-zero', itemCount: 1 },
  // #3348 (recette prod 01/10/2026) — Laura et la fiche besoin disent « périmé » d'après le même verdict.
  { id: '2026-10-01-un-besoin-perime-lest-aussi-sur-sa-fiche', itemCount: 1 },
  // #3398 (recette prod 01/10/2026) — les signaux métier de Laura se disent aussi sur /chat, dans l'ordre du rôle.
  { id: '2026-10-01-laura-ouvre-le-chat-sur-les-signaux-de-ton-role', itemCount: 1 },
  // #2414.41/.42 (épopée #2986) — recette prod 01/10 : toutes les raisons du repositionnement.
  { id: '2026-10-01-le-besoin-ouvert-reste-visible-derriere-le-palier', itemCount: 1 },
  // #3532 / #2882 / #2843 / #2983 / #3229 (lot X07, 01/10) — historique lisible, mode du chat lisible, routines qui disent quand elles s'arrêtent.
  { id: '2026-10-01-recette-x07-historique-routines-et-mode-du-chat', itemCount: 4 },
  // Lot X06 (01/10) — restes de la recette prod Y1, passe B.
  { id: '2026-10-01-lot-x06-dictionnaire-modeles-comite-cockpit', itemCount: 6 },
  // #3487 / #3418 / #3348 / #3395 / #3399 — lot X05 : ce que la recette prod Y1 du 01/10 a relevé.
  { id: '2026-10-01-recette-x05-flottants-phase-et-verdict', itemCount: 4 },
  // #3270.6 (lot EP3, 02/10) — Pilotage nomme ce qu'il faut valider chez tes partenaires rang 2.
  { id: '2026-10-02-pilotage-montre-le-cadre-de-tes-partenaires', itemCount: 1 },
  { id: '2026-10-02-une-routine-mise-a-jour-dit-ce-qui-change', itemCount: 1 },
  // #2877 (#2385.4, lot EP7 02/10) — la déclaration « Signaler un problème » se relit sur la carte.
  { id: '2026-10-02-ce-que-tu-as-signale-reste-sur-la-carte', itemCount: 1 },
  // #3416 / #3415 / #3398 (lot F3, 02/10) — résultat sans zéro, dictionnaire sans code, mission pas prête sur /chat.
  { id: '2026-10-02-un-resultat-qui-se-lit-et-un-dictionnaire-sans-code', itemCount: 3 },
  // #3384.2 (lot Z03, 02/10) — Laura lit les consultants en mission, le vivier et l'intercontrat déclarés.
  { id: '2026-10-02-laura-voit-ta-capacite-de-delivery', itemCount: 1 },
  // #3490 / #3396 / #3215 / #3436 / #3235 / #3506 / #3386 (lot X15, 02/10) — restes de la recette prod Laura.
  { id: '2026-10-02-recette-x15-doublons-precisions-et-fil-du-chat', itemCount: 7 },
  // #3398 (lot X13, 02/10) — deux signaux de plus pour Laura : relance due, disponibilité périmée.
  { id: '2026-10-02-laura-signale-la-relance-due-et-la-disponibilite-perimee', itemCount: 1 },
  // #2818 (#2190.5 / #2190.7, lot D2 02/10) — « Chercher hors vivier » interroge un annuaire externe de profils, derrière une clé d'espace.
  { id: '2026-10-02-chercher-hors-vivier-interroge-un-annuaire-externe', itemCount: 1 },
  // #3413 (« autre BU », lot D2 02/10) — transfert réel d'une mission vers une autre BU de l'espace, journalisé.
  { id: '2026-10-02-une-mission-peut-changer-de-bu', itemCount: 2 },
  // #3345.2 / #3434 (lot Z05, 02/10) — Laura propose d'écarter une piste périmée ; la démo garde la réponse affichée.
  { id: '2026-10-02-laura-propose-decarter-une-piste-perimee', itemCount: 2 },
  // #3387.10 (lot Z07, 02/10) — le renfort transversal se désigne sur l'écran Équipe.
  { id: '2026-10-02-un-renfort-transversal-se-designe-sur-lequipe', itemCount: 1 },
  // #2433.4 (lot Z12, 02/10) — la zone de l'image où un champ de justificatif a été lu.
  { id: '2026-10-02-un-justificatif-photo-montre-ou-le-montant-a-ete-lu', itemCount: 1 },
  // #2422.10 (#2869, lot X54 02/10) — une pièce de contrat porte sa version et dit qui peut la lire.
  { id: '2026-10-02-une-piece-de-contrat-dit-qui-peut-la-lire', itemCount: 1 },
  // #2926 (#2390.9, lot Z14 02/10) — l'agenda nomme les places d'une salle et signale une salle trop petite.
  { id: '2026-10-02-la-salle-dit-ses-places', itemCount: 1 },
  // #185.2 (#3242, lot Z18 02/10) — l'axe « partenaires » du verdict se lit par compte.
  { id: '2026-10-02-le-verdict-de-laura-nomme-le-partenaire-du-compte', itemCount: 1 },
  // #3278.1 (#3259.2, lot Z20 02/10) — deux routes portées par les missions du compte.
  { id: '2026-10-02-une-mission-ouvre-la-route-commerciale', itemCount: 1 },
  // #3237 / #2916 / #3186 / #3493 (lot X16, 02/10) — Besoins avec delivery fit, « Simuler » partout, modes contractuels, réponse jamais perdue.
  { id: '2026-10-02-la-lecture-besoins-montre-le-delivery-fit-et-chaque-routine-se-simule', itemCount: 4 },
  // #3544 / #3296 (lot X19, 02/10) — recette Y7 : tendances et soldes de
  // /team, « Aucun » au lieu de 0 sur la fiche besoin, comptes à placer.
  { id: '2026-10-02-lespace-equipe-et-le-board-deffort-disent-vrai', itemCount: 4 },
  // #3393 / #3225 / #3229 / #3399 / #3390.9 (lot X21, 02/10) — reliquats Laura de la recette prod Y3.
  { id: '2026-10-02-recette-x21-laura-contexte-et-lignes-par-entite', itemCount: 5 },
  // #3414 / #3417 / #3444 / #3513 / #3505 (lot X23, 02/10) — décisions, modèles approuvés, objections, verdict, historique de démo.
  { id: '2026-10-02-decisions-modeles-objections-et-verdict-de-laura', itemCount: 4 },
  // #3393 / #3513 / #3444 / #3225 / #3229 / #3550 (lot X32, 02/10) — réponses de Laura, cartes, finance, démo.
  { id: '2026-10-02-laura-objections-contacts-verdict-et-finance', itemCount: 5 },
  // #3552 / #3553 / #3554 / #3555 / #3556 / #3557 / #3558 (lot X34, 02/10) — retours bêta : Importer/Exporter en modale, rail du questionnaire cliquable.
  { id: '2026-10-02-importer-exporter-en-modale-et-rail-du-questionnaire-cliquable', itemCount: 4 },
  // #3563 / #3407 (lot X28, 02/10) — restes de la recette prod Y10.
  { id: '2026-10-02-recette-x28-lignes-lisibles-connexion-et-demo', itemCount: 8 },
  { id: '2026-10-02-lot-x29-centre-approbation-atteignable', itemCount: 1 },
  { id: '2026-10-02-contacts-ce-qui-manque-se-dit', itemCount: 1 },
  { id: '2026-10-02-forfait-encadre-sans-consultants', itemCount: 3 },
  // #3270.6 (lot X45, 02/10) — la fiche Opportunité nomme le cadre des ESN rang 2 en place chez le compte.
  { id: '2026-10-02-la-fiche-opportunite-montre-le-cadre-du-partenaire', itemCount: 1 },
  // #3231 (#219.6, lot X50, 02/10) — la fiche compte déclare une direction interne ou un client direct ; Laura lit la relation déclarée d'un contact.
  { id: '2026-10-02-lot-x50-client-interne-et-corrections', itemCount: 3 },
  // #2947 / #2204.7 (lot X53, 02/10) — la stratégie choisie cadre aussi les messages du dossier.
  { id: '2026-10-02-la-strategie-choisie-cadre-les-messages-du-dossier', itemCount: 1 },
  // #2818 (#2190.1-.7, lot X55 02/10) — l'ordre de recherche en sept niveaux s'affiche avant le lancement.
  { id: '2026-10-02-chercher-hors-vivier-affiche-son-ordre-en-sept-niveaux', itemCount: 1 },
  // #2916 (#2399.7) — 38 routines en v2 : leur condition d'arrêt est nommée.
  { id: '2026-10-02-les-routines-nomment-leur-condition-d-arret', itemCount: 1 },
  // #2414.37/.43 (épopée #2986) — contraintes déclarées et mémoire marché du client.
  { id: '2026-10-02-le-repositionnement-lit-contraintes-et-memoire-marche', itemCount: 1 },
  // #3294 (#3253.a/.c/.d) — rituels, dépendance, événement significatif, revue hebdomadaire.
  { id: '2026-10-02-le-maillon-faible-lit-rituels-et-repartition', itemCount: 1 },
  // #3282 (#3263.19/.44) — prochaine action lue des tâches, enrichir depuis le comité.
  { id: '2026-10-02-comite-prochaine-action-et-enrichir', itemCount: 1 },
  // #3277 + #3285 — noms de consultants une fois, durée statique retirée, titre d’historique, compte dormant en démo.
  { id: '2026-10-02-fiche-compte-et-recherche-sans-doublons', itemCount: 1 },
  // #3513 / #3550 / #3532 / #3544 (lot X58, 02/10) — verdict forcé, fiche démo, milliers, pluriel.
  { id: '2026-10-02-recette-x58-verdict-de-laura-fiche-demo-et-nombres-lisibles', itemCount: 4 },
  // #2433.12 (lot X60, 02/10) — une photo prise de côté est lue à l'endroit.
  { id: '2026-10-02-lot-x60-photo-de-cote-remise-droite', itemCount: 3 },
  // #3186 / #3488 / #3420 / #3434 / #3400 / #3287 (lot X62, 02/10) — Laura nomme l'absence du mode contractuel, vivier sans phrase bancale, cas de recette rejouables en démo.
  { id: '2026-10-02-laura-nomme-ce-qui-nest-pas-declare-et-la-demo-rejoue-les-cas', itemCount: 4 },
  // #2957 / #3218 / #3386 / #3245 / #2959 / #3192 / #2844 (lot X63, 02/10) — restes de la recette prod « d2 ».
  { id: '2026-10-02-lot-x63-reprise-import-approfondissement-role-pari-route-demo', itemCount: 7 },
  // #3547 (lot X66, 02/10) — le forfait encadré se change sur une mission existante, se propose depuis un document et se lit sur la fiche besoin ; démo : revue et réactivation d'un compte écarté, fil sans objet, ESN rang 2 gouvernée sur SG.
  { id: '2026-10-02-forfait-encadre-modifiable-propose-et-lisible-sur-le-besoin', itemCount: 3 },
  // #3490 / #3488 / #3407 / #3473 / #3532 / #3544 / #3562 (lot X67, 02/10) — doublons nommés, vivier lisible, entités, démo.
  { id: '2026-10-02-lot-x67-doublons-nommes-vivier-lisible-et-demo', itemCount: 4 },
  // #3420 / #3270 / #3490 / #3488 / #3532 / #3547 (lot X72, 03/10) — démo qui ne s'envoie jamais, doublons sans accent, vivier nommé.
  { id: '2026-10-03-lot-x72-demo-stable-doublons-accents-vivier-nomme', itemCount: 7 },
  // #3551 / #2959 / #3243 / #3245 / #3440 / #3437 / #3438 / #3559 / #2979 (lot X74, 03/10) — carte de Laura dans le fil, route de démo rattrapée, challenge partenariat hors fiche, affirmations confirmables, prochaine action lisible.
  { id: '2026-10-03-lot-x74-carte-dans-le-fil-affirmations-confirmables-et-prochaine-action-lisible', itemCount: 5 },
  // #3434 (lot X75, 03/10) — un grand groupe pose la question de périmètre avant toute offre de crédits.
  { id: '2026-10-03-lot-x75-analyse-d-un-grand-groupe-pose-la-question-de-perimetre', itemCount: 3 },
  // #3400 / #3420 / #3386 / #3345 / #3528 / #3186 / #3385 (lot X78, 03/10) — refus d'enrichissement honnête, brief réordonné par ton rôle, piste retrouvée par son libellé.
  { id: '2026-10-03-lot-x78-enrichissement-honnete-brief-par-role-piste-par-libelle', itemCount: 6 },
  // #2876 / #2433.9 (lot E06, 04/10) — l'image part au fournisseur sans ses métadonnées.
  { id: '2026-10-04-e06-photo-envoyee-sans-ses-metadonnees', itemCount: 1 },
  // #2875 / #3398.1 (lot E06, 04/10) — Laura signale la dépendance à un client.
  { id: '2026-10-04-e06-laura-signale-la-dependance-a-un-client', itemCount: 1 },
  { id: '2026-10-04-lot-e15-laura-enrichit-plusieurs-contacts-en-un-lot', itemCount: 1 },
  // #3423 / #3528 (lot E16, 04/10) — le rôle d'une personne dit la même chose sur la carte et la fiche ; le bandeau de volume ne contredit plus « 0 entreprise trouvée ».
  { id: '2026-10-04-lot-e16-role-carte-egal-fiche-bandeau-volume-honnete', itemCount: 2 },
  // #3390.10 / #3443 / #3215 / #3186 (lot E24, 04/10) — bloc Méthode distinct, appel à froid tolérant à la fonction, ouverture alignée sur le verdict, Entrée n'ouvre plus un run armé d'un autre fil.
  { id: '2026-10-04-lot-e24-methode-en-bloc-appel-a-froid-ouverture-suit-le-verdict', itemCount: 4 },
  // #2986 / #3420.1 / #3238 / #3235 (lot F2, 05/10) — contrainte nommée au repositionnement, « À valider » classé avant « Bloqués », signal multi-sites, révision de verdict.
  { id: '2026-10-05-lot-f2-contrainte-nommee-a-valider-en-tete-sites-revision', itemCount: 5 },
  // #3685 / #3686 (lot I20, 05/10) — dossier Compte : plus de bandeau d'entonnoir, contacts d'abord, ordre par périmètre.
  { id: '2026-10-05-lot-i20-contacts-du-compte-sans-entonnoir-ordre-par-perimetre', itemCount: 3 },
  // #3694 / #3695 (lot I27, 05/10) — preset e-mail sans rendez-vous imposé, version précédente conservée au changement d'objectif.
  { id: '2026-10-05-lot-i27-preparation-email-objectif-versions-conservees', itemCount: 3 },
  // #3696 / #3697 (lot I28, 05/10) — brouillon conservé à la fermeture, corrections non écrasées, appel : préparer / consigner / planifier.
  { id: '2026-10-05-lot-i28-brouillon-conserve-appel-preparer-consigner-planifier', itemCount: 3 },
  // #3655 / #3656 / #3657 (lot I01, 05/10) — Missions et Renouvellements : le lien Laura et le bloc « Régler les fenêtres » retirés.
  { id: '2026-10-05-lot-i01-missions-sans-raccourci-laura-ni-reglage-des-fenetres', itemCount: 3 },
  // #3720 (lot I04, 05/10) — anciens liens de la fiche contact et raccourcis à ancre fiables.
  { id: '2026-10-05-lot-i04-fiche-contact-liens-anciens-ancres-fiables', itemCount: 2 },
  // #3668 / #3673 (lot I09, 05/10) — intitulés sans biais IT, signaux sélectionnés pour leur conséquence, absence de signal nommée.
  { id: '2026-10-05-lot-i09-enjeux-sans-biais-it-signaux-qui-changent-la-decision', itemCount: 3 },
  // #3670 / #3671 (lot I10, 05/10) — règle DSI/CTO assouplie, couverture méthode par situation, fait corrigé distinct d'une préférence.
  { id: '2026-10-05-lot-i10-methode-sans-interdiction-aveugle-fait-corrige-ecarte', itemCount: 2 },
  // #3669.2 (lot I11, 05/10) — chaque document de la base de connaissance dit où en est son traitement ; un document non exploitable n'est jamais annoncé intégré.
  { id: '2026-10-05-lot-i11-statut-de-traitement-par-document', itemCount: 2 },
  // #2979 / #2986 / #3186 / #3285 / #3238 / #3420.2 / #3737 (lot I33, 06/10) — marge sur deux lignes, démo : contrainte de mobilité, mode contractuel non déclaré, ouverture de compte fermé ; sites sur la carte repliée, porte « À trancher » lisible, maillons non évalués au nom neutre.
  { id: '2026-10-06-lot-i33-recette-demo-marge-sites-porte-maillons', itemCount: 6 },
  // #3690 / #3689 (lot F13, 06/10) — le relais d'introduction sort du pli replié (KO recette) ; la réponse se déclare en démo.
  { id: '2026-10-06-lot-f13-fiche-contact-relais-visible', itemCount: 1 },
  { id: '2026-10-06-j14-laura-reponses-en-cartes', itemCount: 3 },
  // #3760 (lot J16, 06/10) — Laura choisit la forme de sa réponse (cartographie, contacts, plan…) avant d'écrire.
  { id: '2026-10-06-j16-laura-choisit-la-forme-de-sa-reponse', itemCount: 2 },
  // #3765 (BEL-LAU-1010, lot J21, 06/10) — pied de réponse : nature des sources, périmètre, complétude, certitude.
  { id: '2026-10-06-lot-j21-pied-de-sources-laura', itemCount: 2 },
  // #3767 (lot J23, 06/10) — Laura raisonne en blocs d'écran : six questions avant d'écrire, sept exigences, cinq interdits.
  { id: '2026-10-06-j23-laura-pense-sa-reponse-en-blocs-d-ecran', itemCount: 3 },
  // #3773 (lot J29, 06/10) — l'accueil de Laura : salutation courte, quatre demandes métier, reprise du dernier fil.
  { id: '2026-10-06-lot-j29-accueil-de-laura-point-de-depart-et-de-reprise', itemCount: 6 },
  // #3775 (lot J31, 06/10) — en-tête de /chat allégé (un accès « Conversation »), accès dit honnêtement, mémoire compacte, une seule Laura sur /chat.
  { id: '2026-10-06-lot-j31-chat-en-tete-allege-acces-honnete-memoire-compacte', itemCount: 4 },
  // #3776 (lot J32, 06/10) — fil de Laura : « autres résultats » nommés, accès discret à la réponse arrivée plus bas, ouvrir un écran sans carte de validation.
  { id: '2026-10-06-j32-laura-reponses-lecture-du-fil', itemCount: 3 },
  // #3676.6 / #3677.6 / #3677.7 (lot F06, 06/10) — nature par ligne, un même fait = une ligne, programme cité dans la stratégie, objectif / périmètre / horizon.
  { id: '2026-10-06-f06-signaux-et-besoins-nature-par-ligne-programmes', itemCount: 4 },
  // #3678 / #3681 (lot F07, 06/10) — pistes : action principale, ce que ça change, réserve ; Besoins : demandes actuelles, annonce interne nommée à part.
  { id: '2026-10-06-f07-signaux-besoins-demandes-actuelles', itemCount: 4 },
  // #3416 / #3419 (lot F24, 06/10) — « Autres accroches » réécrit l'ouverture côté moteur, la relance « À rappeler » a sa source.
  { id: '2026-10-06-f24-accroche-alternative-relance-source', itemCount: 2 },
  // #3623 / #3648 (lot F30, 06/10) — pièces jointes rattachées au compte au lancement ; la frappe du chat survit au chargement.
  { id: '2026-10-06-f30-pieces-jointes-et-frappe', itemCount: 2 },
  // #3781 / #3656 / #3710 (lot F31, 06/10) — vivier : supprimer définitivement (effacement RGPD) et tout afficher ; renouvellements : l'écran est supprimé ; démo : jamais d'écran supprimé.
  { id: '2026-10-06-f31-vivier-effacer-renouvellements-demo', itemCount: 4 },
  // #3747 (06/10) — salle de démonstration : jamais servie à moitié semée, attente annoncée honnêtement.
  { id: '2026-10-06-f28-laura-jeu-metier-dictee', itemCount: 3 },
  // #3684 (lot F09, 06/10) — chaque ESN citée en stratégie est retrouvable, qualifiée, avec renvoi vers sa ligne Partenaires.
  { id: '2026-10-06-f09-esn-citee-retrouvable', itemCount: 2 },
  // #3668.7-.9 (lot F02, 06/10) — signaux rattachés à l'entité, programme général en contexte, doublons fusionnés, source injoignable ≠ aucun signal, veille sans promesse inobservable.
  { id: '2026-10-06-lot-f02-signaux-entite-contexte-couverture', itemCount: 3 },
  // #3672 / #3673 (lot F05, 06/10) — « Voir les éléments », « Information vérifiée » réservée au registre, sans biais IT par défaut.
  { id: '2026-10-06-lot-f05-provenance-lisible-sans-biais-it', itemCount: 3 },
  // #3682.3-.6 / #3683.2-.6 (lot F08, 06/10) — vérification ≠ événement utile, import qui ne rajeunit pas, veille réelle ; « Préparer une opportunité », retour au compte d'origine, interlocuteur cherché sur le rôle de la piste.
  { id: '2026-10-06-lot-f08-fraicheur-du-fait-et-bon-objet-ouvert', itemCount: 5 },
  // #3386 (lot F27, 06/10) — le rôle ordonne aussi /briefing sous 768 px.
  { id: '2026-10-06-lot-f27-le-role-ordonne-aussi-le-brief-sur-mobile', itemCount: 1 },
  // #3398 (lot F27, 06/10) — Laura signale comptes sans responsable, collisions, portefeuille trop large, fiches à qualifier, dans l'ordre du rôle.
  {
    id: '2026-10-06-lot-f27-laura-signale-les-comptes-sans-responsable-et-les-portefeuilles-trop-larges',
    itemCount: 1,
  },
  // #3724 / #3725 (lot J04, 06/10) — badges d'enrichissement lisibles sur la fiche contact ; pied « Source du… » daté du fait cité le plus récent.
  { id: '2026-10-06-lot-j04-badge-contact-pied-source-chat', itemCount: 2 },
  // #3742 / #3744 (lot J06, 06/10) — une relance d'analyse en « France » écarte les contacts étrangers déjà au dossier.
  { id: '2026-10-06-lot-j06-relance-france-ecarte-les-contacts-etrangers', itemCount: 2 },
  // #3757 (lot J08, 06/10) — Découvrir : une ESN (Accenture, Sopra…) n'est plus présentée comme client final.
  { id: '2026-10-06-j08-discover-esn-pas-client-final', itemCount: 2 },
  // #3676 (réfuté en prod le 07/10) — la veille d'un compte ne tombe plus à « 0 signal » quand ses signaux sont devenus des pistes.
  { id: '2026-10-07-veille-signaux-en-pistes', itemCount: 1 },
  // #3811 / #3812 / #3813 (lot C1, 07/10) — CV en tableau, compétences identiques partout, brouillon de compétence enregistré.
  { id: '2026-10-07-c1-cv-competences-vivier', itemCount: 4 },
  // #3640 / #3641 / #3654 / #3707 / #3708 / #3709 (lot R1, 07/10) — fiche contact, /chat, veille : les points réfutés en recette.
  { id: '2026-10-07-r1-refutes-fiche-contact-chat-veille', itemCount: 3 },
  // #2547 / #2533 (recette prod 07/10) — Laura lit la fiche du compte avant de répondre.
  { id: '2026-10-07-laura-lit-la-fiche-du-compte', itemCount: 3 },
  // #3811 / #2542 / #2551 / #2569 / #2570 (lot H, 08/10) — vivier : dossier de compétences PDF, import ZIP, enrichissement.
  { id: '2026-10-08-h-vivier-cv-dossier-competences', itemCount: 4 },
  // #3742 / #3744 / #2552 / #2555 / #2556 (lot E, 07/10) — périmètre France tenu à la relance, filtre Localisation, entonnoir en une ligne, confirmation d'actualisation, valeur sur un compte connu.
  { id: '2026-10-07-lot-e-compte-contacts-perimetre-et-valeur', itemCount: 5 },
  // #2561 / #2562 (lot G1, 07/10) — /missions : les ventes de l'outil de gestion branché, et leur reprise en missions.
  { id: '2026-10-07-g1-ventes-outil-de-gestion-en-missions', itemCount: 2 },
  // #3808 / #3793 / #3675 (lot K14, 07/10) — /search sans phrase descriptive, chat sans entrée redondante, score du compte expliqué.
  { id: '2026-10-07-k14-chat-search-score', itemCount: 3 },
  // #3683.6 (lot K09, 07/10) — « Ouvrir dans le Pipe » et « Ouvrir l'opportunité existante » gardent l'origine du compte.
  { id: '2026-10-07-k09-pipe-garde-l-origine-du-compte', itemCount: 1 },
  // #3677.7 (lot K09, 07/10) — l'analyse produit désormais l'objectif, le périmètre et l'horizon de chaque programme nommé.
  { id: '2026-10-07-k09-programmes-objectif-perimetre-horizon', itemCount: 1 },
  // #3559 (lot K11, 07/10) — /missions/renouvellements est désormais un alias vers /missions (#3656) : la borne qui empêchait le tableau d'élargir la page le suit.
  { id: '2026-10-07-k11-missions-page-bornee', itemCount: 1 },
  // #3781.1 (lot K11, 07/10) — la garde « personne effacée » (RGPD art. 17) couvre maintenant l'import CSV et le lot ZIP/messagerie, pas seulement le dépôt de CV interactif.
  { id: '2026-10-07-k11-effacement-import-csv-zip', itemCount: 1 },
  // #3713.3 (lot K07, 07/10) — tableau Contacts : onze colonnes regroupées en cinq cellules composées.
  { id: '2026-10-07-k07-contacts-cinq-colonnes', itemCount: 1 },
  // #3719.5 (lot K07, 07/10) — fiche contact : lien « Ouvrir la fiche » vers l'enregistrement CRM exporté (HubSpot, Salesforce, Pipedrive).
  { id: '2026-10-07-k07-crm-lien-profond', itemCount: 1 },
  // #3694.7 (lot K07, 07/10) — le brief confirmé et le brouillon d'un message survivent à la fermeture du panneau, y compris après rechargement.
  { id: '2026-10-07-k07-brief-persiste', itemCount: 1 },
  // #3821 (lot C5, 07/10) — filtre coordonnées en un clic, sans déplier ; icônes téléphone/e-mail/LinkedIn lisibles.
  { id: '2026-10-07-c5-contacts-filtre-coordonnees-rapide', itemCount: 2 },
  // #3822 (lot C5, 07/10) — enrichissement de lot : résultat persisté par contact et par coordonnée, visible après reload.
  { id: '2026-10-07-c5-contacts-resultat-enrichissement-persiste', itemCount: 2 },
  // #3813 (lot R5, 07/10) — Tab valide les compétences du formulaire consultant.
  { id: '2026-10-07-r5-competences-tab', itemCount: 1 },
  // #2887.5 (lot P03, 07/10) — le panneau « Pourquoi ce message » nomme l'interdiction propre à la relation.
  { id: '2026-10-07-p03-interdit-de-stade-dans-pourquoi-ce-message', itemCount: 1 },
  // #2979 (lot P03, 07/10) — la colonne Marge de /missions ne grossit plus au fil des lignes.
  { id: '2026-10-07-p03-colonne-marge-largeur-fixe', itemCount: 1 },
  // #3749 (lot P03, 07/10) — le briefing du jour tient compte des postes cibles pour la voie d'accès suggérée.
  { id: '2026-10-07-p03-briefing-voie-acces-postes-cibles', itemCount: 1 },
  // #3749 (lot P03, 07/10) — le verdict de la grille de qualification rejoint la liste des comptes.
  { id: '2026-10-07-p03-verdict-grille-liste-comptes', itemCount: 1 },
  // #3822 / #3821 (lot J1b, 07/10) — le lot d'enrichissement ne s'arrête plus en silence ; téléphone enregistré seul ; sources comptées, jamais nommées.
  { id: '2026-10-07-j1b-contacts-enrichissement-lot-fiable', itemCount: 4 },
  // #2770 (recette prod 08/10, lot V03) — une carte de plan (« Organise-moi ma journée ») ne sort plus accompagnée de « Je n'ai pas pu rédiger de réponse ce tour ».
  { id: '2026-10-08-v03-carte-plan-pas-de-double-message', itemCount: 1 },
  // #2770 (recette prod 08/10, lot V03) — le plan de journée ne dit plus « aucun bloc placé » ET « N h laissées libres » dans la même carte.
  { id: '2026-10-08-v03-plan-journee-carte-sans-contradiction', itemCount: 1 },
  // #2770.28 (recette prod 08/10, lot V03) — « Revenir aux valeurs par défaut » (préférences d'agenda) vide vraiment les champs, sans rechargement, et ne laisse plus une frappe en vol reposer l'ancienne valeur.
  { id: '2026-10-08-v03-preferences-agenda-remise-par-defaut', itemCount: 1 },
  // #3278.2 (recette prod 08/10, lot V03) — la route commerciale recommandée nomme désormais ses critères sans source en liste explicite, jamais confondue avec les rôles du comité d'achat.
  { id: '2026-10-08-v03-route-commerciale-criteres-sans-source', itemCount: 1 },
  // #3673 (lot R21, 07/10, vu en passant) — /contacts : les compteurs de la bande d'entonnoir portent le séparateur de milliers.
  { id: '2026-10-07-r21-entonnoir-contacts-separateur-milliers', itemCount: 1 },
  // #3673 (lot R21, 07/10, réfuté en prod) — « Enjeux à adresser » (Vue d'ensemble) s'affiche maintenant même sans pain/enjeu/signal, pour nommer l'absence.
  { id: '2026-10-07-r21-enjeux-a-adresser-repli-meeting', itemCount: 1 },
  // #3182.2 (épopée #3248, lot R18, 07/10) — avant d'ouvrir un compte, Laura nomme le plafond déclaré de dossiers suivis et les heures disponibles.
  { id: '2026-10-07-r18-laura-nomme-la-charge-commerciale-avant-ouverture', itemCount: 1 },
  // #3862 (lot X04, 08/10) — une étude Approfondie interrompue faute de budget le reste dans le fil après une reconnexion.
  { id: '2026-10-08-x04-chat-etude-interrompue-visible-au-retour', itemCount: 1 },
  // #3953.1 (lot N05, 08/10) — le filtre « Recrutements » explique désormais un compte qui ne tombe pas à zéro quand le signal est déjà une piste.
  { id: '2026-10-08-n05-veille-compte-filtre-signaux-en-pistes', itemCount: 1 },
  // #3666.8 (lot N05, 08/10) — un compte dont l'analyse vient d'être lancée apparaît dans /accounts sans rechargement.
  { id: '2026-10-08-n05-accounts-liste-rafraichie-au-lancement', itemCount: 1 },
  // #3742 (lot N05, 08/10) — « France » se présélectionne au lancement d'une analyse ciblée sur la France, sans toucher au cadrage géographique.
  { id: '2026-10-08-n05-perimetre-france-par-defaut', itemCount: 1 },
  // #3914 (lot I05, 09/10) — la salle démo porte un compte venu de Découvrir dont l'analyse conclut « mettre en veille ».
  { id: '2026-10-09-i05-demo-decouvrir-avait-dit', itemCount: 1 },
  // #3671.6 (lot I05, 09/10) — la carte « paiement en retard » du brief nomme le mois de la facture.
  { id: '2026-10-09-i05-briefing-impaye-nomme-sa-facture', itemCount: 1 },
  // #3876 (lot I05, 09/10) — la salle démo montre une carte Découvrir dont le registre ne publie aucune commune.
  { id: '2026-10-09-i05-demo-decouvrir-carte-sans-commune', itemCount: 1 },
  // #3818 (lot I05, 09/10) — la liste /accounts, la comparaison et le classement ne disent plus « ÉCARTER POUR CET OBJECTIF » sans objectif renseigné.
  { id: '2026-10-09-i05-liste-comptes-sans-objectif', itemCount: 1 },
  // #3879.5 (lot I05, 09/10) — les deux cases « masquer » de Découvrir disent chacune leur réalité.
  { id: '2026-10-09-i05-decouvrir-masquer-deux-realites', itemCount: 1 },
  // #3742, #3744, #3820 (lot RY, 10/10) — une analyse cadrée sur la France lit aussi la zone dite par le titre (Nordics, CEE, Pacific).
  { id: '2026-10-10-ry-perimetre-zone-du-titre', itemCount: 1 },
  // #3295, #3712 (lot W7, 11/10) — la démo porte un 2e REX de perte (ENGIE) et un projet « Détecté » rattaché à un contact.
  { id: '2026-10-11-w7-demo-rex-perte-et-projet-detecte', itemCount: 1 },
  // #3246, #3210.3 (lot W9, 11/10) — stratégie d'approche et modèle d'achat : deux champs à choix fermé, comparés par Laura entre cas gagnés et perdus.
  { id: '2026-10-11-w9-cas-similaires-strategie-modele-achat', itemCount: 2 },
  // #3399.6 (Lot LAURA-A, 12/10 soir) — le champ de saisie de Laura dit à l'écran quelle touche envoie et laquelle saute une ligne.
  { id: '2026-10-12-laura-a-indice-raccourci-envoi', itemCount: 1 },
  // #3400.1 (lot COMITE, 12/10 soir) — la fiche contact sépare le type de personne (ton) du rôle de décision.
  { id: '2026-10-12-comite-type-de-personne-separe-du-role', itemCount: 1 },
  // #3702 (lot AUTOMATISATIONS, 12/10 soir) — la délégation d'envoi nomme ses attentes anormales sous « Active » et lit les arrêts « effacé » / « consentement expiré ».
  { id: '2026-10-12-automatisations-delegation-nomme-ses-attentes', itemCount: 1 },
]

/** The most recent entry id — the marker a user must have "seen" to clear the dot. */
export const LATEST_CHANGELOG_ID: string = CHANGELOG_IDS[0]?.id ?? ''
