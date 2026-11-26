# Laura dans un seul système commercial

**Décision produit.** Une question posée à Laura, un chiffre du cockpit et une affaire ouverte dans Équipe doivent lire les mêmes objets, sur le même périmètre et à la même date. Laura doit montrer ce qu'elle sait, d'où cela vient et quel geste peut suivre. Une action proposée n'est exécutée qu'après un geste explicite de l'utilisateur.

## Ce qui existe dans le monorepo v17

| Pièce vérifiée | Chemin dans le monorepo | Conséquence pour la refonte |
| --- | --- | --- |
| Navigation « Ma journée », Équipe, Pilotage et leurs sous-onglets | `apps/web/src/components/navigation/sections.ts`, `apps/web/src/components/navigation/SectionTabs.tsx`, `apps/web/src/routes/team/*`, `apps/web/src/routes/pilotage/*` | Laura est un point d'entrée global dans ce système, sans créer un second menu. |
| Bulle Laura, contexte de page et conversation | `apps/web/src/features/laura/bubble/LauraDock.tsx`, `LauraBubblePanel.tsx`, `page-context-store.ts` | Une amorce peut reprendre la ville, la BU, le compte ou l'affaire affichés. |
| Action préparée par Laura puis déclenchée au clic | `apps/ia/app/services/chat_tools.py`, `apps/web/src/features/chat/view/PendingActions.tsx` | La réponse explique le résultat et présente une action relisible avant l'écriture. |
| Espace actif, partage entre collègues et séparation entre ESN | `apps/api/src/modules/workspace/workspace-context.service.ts`, `workspace-sharing.spec.ts`, `workspace-permission.guard.ts` | Le périmètre de lecture et d'écriture se résout côté serveur ; la sélection dans l'interface ne donne aucun droit supplémentaire. |
| Statistiques, affaires et plans de l'équipe | `apps/api/src/modules/manager/manager.controller.ts`, `manager-team-views.service.ts` | Les réponses de Laura sur l'équipe peuvent s'appuyer sur les mêmes lectures que les écrans. Ces routes sont protégées par `team:manage` et la fonctionnalité du palier. |
| Commentaires liés à un compte ou une conversation | `apps/api/src/modules/team-comments/team-comments.controller.ts` | Une transmission interne doit être liée à l'objet concerné et rester dans l'espace de l'ESN. |

Ces pièces ne prouvent pas que toutes les questions ou tous les gestes ci-dessous sont déjà câblés. Elles indiquent les chemins existants à réutiliser. Le partage CRM concerne les personnes **d'une même ESN**. Les données brutes d'une autre ESN restent hors de portée ; une éventuelle mémoire de marché inter-ESN ne peut exposer que des observations autorisées, agrégées et anonymisées, avec leur degré de preuve.

## Contrat de données et de gestes

Les comptes, contacts, affaires, besoins, profils, missions, actions et activités portent un `workspace_id`. Les objets concernés portent aussi leur BU, leur responsable, un horodatage et leur provenance. Une note privée ou un message issu d'une connexion personnelle garde une visibilité personnelle tant qu'un membre ne choisit pas de partager une information déterminée. L'écran et Laura reçoivent la même réponse calculée pour `workspace + rôle + périmètre BU + période` ; un lien ouvre l'objet qui a produit le chiffre.

| Geste ou fait | Écriture de référence | Pages qui doivent réagir |
| --- | --- | --- |
| Affaire attribuée ou réattribuée | Responsable de l'affaire, auteur et date du changement, activité d'équipe | Administration, portefeuille Équipe, plans, Ma journée, Laura |
| Résultat d'un échange consigné | Résultat, note, dernier échange réel, prochaine action, responsable et échéance | Dossier, journal d'activité, plans, Ma journée, alertes de retard |
| Besoin transmis à un collègue | Objet lié au besoin, destinataire, motif et état de prise en charge | Compte/mission, boîte de travail du destinataire, Équipe, Laura |
| Profil proposé, mission signée, facture émise | Statut et montant de l'objet métier concerné | Staffing, pipe, finance et synthèse de Laura selon la même période |

Pour une commande Laura : **lecture sourcée → aperçu de l'effet et du destinataire → contrôle du droit et du périmètre côté API → commande idempotente → trace d'activité → actualisation des vues**. Le texte généré ne devient jamais une écriture directe. Une transmission à un collègue demande une confirmation ; un envoi externe garde son contrôle humain propre. Les compteurs proviennent des objets métier, avec la même définition de « ouvert », « signé » et « en retard » partout. Une réponse explique les données absentes plutôt que de déduire un fait non observé.

## Parcours Laura à accepter

| Demande en langage naturel | Réponse et geste attendus | Critère d'acceptation |
| --- | --- | --- |
| « Qu'a fait mon équipe aujourd'hui ? » | Activités par personne, compte et type, puis accès au journal. | Période, BU et nombre concordent avec Équipe → Activité ; un commercial ne voit pas un bilan de direction sans droit. |
| « Qui est en retard sur Paris / Conseil & Data ? » | Affaires avec responsable, dernier échange, montant et prochain geste ; ouverture du dossier. | Le filtre affiché correspond à la réponse ; une absence de réponse client n'efface pas l'ancienneté du dernier échange. |
| « Quelles affaires sont sans responsable ? » | Liste et charge par commercial de la BU ; proposition d'attribution. | Le destinataire et l'affaire sont relus avant confirmation ; le compteur « à attribuer » et le portefeuille changent ensemble. |
| « Transmets ce besoin à Karim avec ce contexte » | Aperçu du besoin, du collègue, de la note partageable et de la tâche attendue. | Après confirmation, l'objet est visible pour Karim dans la même ESN, relié au dossier et traçable ; aucune donnée privée de messagerie n'est partagée implicitement. |
| « Pourquoi Grands comptes manque l'objectif ? » | Signé / cible, rythme, pipe par étape, conversion, affaires bloquées, puis liens. | Le raisonnement cite les chiffres du périmètre et distingue une cause démontrée d'une hypothèse. |
| « Quels besoins n'ont pas de profil ? » | Besoins ouverts non couverts, propriétaire et prochaine recherche ou proposition. | Le total rejoint Staffing ; chaque ligne mène au besoin et, si possible, aux profils autorisés. |
| « Prépare mon point d'équipe » | Résumé des écarts, dossiers à trancher et actions proposées. | La préparation ne change aucune affaire ; les tâches décidées sont confirmées, datées et retrouvables dans Plans. |

## Ce que montre la maquette et ce qui reste à brancher

La maquette du Site lit `dist/performance-data.js`. `dist/performance.js` conserve les attributions, résultats et passations datées dans `localStorage` du navigateur. Laura calcule ses réponses sur ces mêmes objets, et la passation réapparaît dans Ma journée, Plans, Activité, le dossier et la fiche du destinataire. La sélection de rôle et la carte illustrent un **scénario fictif au 25 novembre 2026**. Aucune de ces écritures ne synchronise un collègue réel, un CRM ou une autre ESN. L'interface l'indique au point d'action.

Cette passe refond uniquement le module « Ma journée » : Mon activité, Mon agenda, Équipe et Pilotage. Les pages racines Comptes, Affaires, Talents et Missions du produit ne sont pas remplacées dans le prototype. Les gestes du cockpit ouvrent un panneau de contexte lié à l'affaire, au compte, au responsable, au rendez-vous ou à la facture ; leur intégration finale devra mener aux fiches existantes du monorepo.

Pour passer en production, raccorder Laura aux lectures et commandes typées du monorepo, faire appliquer les droits par l'API, enregistrer la provenance et l'historique des changements, puis rafraîchir les projections des pages après une commande réussie. Vérifier au minimum : deux membres de la même ESN voient une transmission autorisée ; une ESN différente ne peut ni lire ni deviner ses objets ; un rôle sans `team:manage` ne reçoit pas de bilan d'équipe ; un double clic n'exécute pas deux fois le geste ; une réponse Laura et la page cible montrent la même valeur après l'écriture.
