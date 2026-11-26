# BellumAI — cockpit commercial White Glass

## Périmètre et décision produit

Cette passe illustre **Ma journée, Mon agenda, Équipe et Pilotage**, à l'intérieur du seul parent « Ma journée » de la navigation existante. Elle ne remplace pas les pages racines Comptes, Affaires, Talents et Missions. Le premier écran propose de **configurer une organisation locale** ou d'**explorer un exemple fictif**, sans mêler leurs données.

L'écran de départ doit répondre en moins d'un regard à trois questions : **où en suis-je, qu'est-ce qui bloque, quel geste faire maintenant ?** Le commercial commence par les priorités et sa semaine ; le responsable d'agence voit la charge et les transmissions ; la direction va du territoire à la BU, puis aux personnes et aux encaissements. Laura lit le même périmètre, cite la provenance et prépare des actions qui restent à valider.

## Statut du lien consultable et du code intégré

Ce Site est une **maquette statique navigable** avec deux parcours. **Mon espace local** part sans KPI et permet de créer agence → ville → équipe → personne/BU, puis de modifier, archiver et restaurer ces objets dans ce navigateur. Les villes principales ont une position illustrative sur la carte ; les autres communes peuvent être saisies et restent dans la liste sans position inventée. **Explorer un exemple** montre séparément un portefeuille et des personnes fictifs figés au 25 novembre 2026. Le Site n’est ni une session connectée du monorepo ni une preuve que les écrans et automatisations de l'exemple sont livrés en production. Les actions de Laura, transmissions, attributions et relances de l'exemple restent dans le navigateur. Le code du monorepo livré séparément constitue le produit intégré à vérifier.

L'accès **Carte des agences** reste visible dans l'unique sous-menu de Ma journée. Dans l'exemple, il ouvre la vue Direction → carte France → ville → BU → affaires, responsables et factures, avec une liste des villes équivalente à la carte. Dans l'espace local, il ouvre les agences réellement configurées ici ; aucun signé, pipe, facture ou conversion de l'exemple n'est attribué à une agence créée. Les rôles de la maquette illustrent les droits : direction pour agences/BU, responsable et direction pour équipes/personnes, commercial en lecture seule. Changer le rôle dans cette maquette ne constitue pas une authentification.

Dans **Mon espace local**, Ma journée et Agenda permettent de saisir des actions datées et des rendez-vous ; Pilotage permet de déclarer des cibles et des échéances. Les compteurs dérivent uniquement des entrées locales et de leur statut. Les démarrages réalisés demandent une déclaration explicite ; aucune trajectoire, conversion, valeur signée ou facture comptable n'est déduite automatiquement. Marquer un rendez-vous tenu, une action terminée ou une échéance réglée ne synchronise ni CRM, ni agenda, ni comptabilité. Laura reste accessible : elle répond seulement sur la structure et les faits manuels de cet espace, signale les sources manquantes et ne cite aucun compte de l'exemple.

Dans le monorepo récent, **Ma journée** est l’entrée du menu unique, les pages de la famille sont Ma journée / Mon agenda / Équipe / Pilotage, et Équipe possède six sous-onglets. Le Pilotage réel a trois onglets : Cockpit, Affaires en cours et Staffing, avec portée Moi / Équipe selon les droits. La Finance détaillée vit dans **Missions › Finance**. Le quatrième ancrage Finance de la maquette est une **illustration transversale** de ce lien, pas une quatrième page Pilotage du monorepo.

Le cap commercial réel est **mensuel** (RDV déclarés, besoins qualifiés datés et démarrages) et lu depuis les objectifs du compte. La cadence d’équipe peut montrer des RDV déclarés sur les personnes ayant une cible ; les e-mails et approches LinkedIn du Site sont une hypothèse de scénario, sans cohorte de conversion observée. Le ratio annuel 22 démarrages → 1 014 sollicitations est un **exercice fictif**, et ne doit jamais être présenté comme un calcul ou une recommandation du système connecté. Les montants signé, démarré, facturé et encaissé restent des événements et mesures séparés. La carte ville/BU et sa conversion détaillée ici sont des intentions de design qui demandent une provenance et un endpoint de performance commerciale avant tout raccordement réel.

## Parcours métier

| Rôle | Première lecture | Décision et geste | Effet attendu dans le système |
| --- | --- | --- | --- |
| Business Manager | Priorités datées, RDV à préparer, rythme e-mail / LinkedIn / RDV / besoins, factures liées à ses affaires | Ouvrir un dossier, consigner l'issue et la prochaine date, préparer une relance | Journal, agenda et prochain geste renvoient à la même affaire. |
| Responsable d'agence | Résultat des BU, dossiers non attribués, charge par personne et relances | Attribuer une demande, arbitrer la charge, préparer le point d'équipe | Les compteurs « à répartir » et les portefeuilles évoluent ensemble. |
| Direction commerciale | Cap mensuel et suivi signé / démarré, pipe, conversion, staffing, facturé et encaissé ; carte France → ville → BU | Identifier l'étape qui fuit, le territoire et le propriétaire, puis ouvrir l'affaire ou la facture | Même périmètre et même période sur carte, graphiques, tableaux et Laura. |

## Définitions des mesures du scénario

Les chiffres sont **fictifs au 25 novembre 2026**. L'objectif collectif est de 22 démarrages en 2026 ; 16 sont réalisés, 6 restent à obtenir. Quatre affaires ont ensemble **3 équivalents pondérés** : une espérance de planification, pas trois démarrages acquis. Le scénario conditionnel, *si ce pipe se réalise*, demande de créer 3 démarrages supplémentaires en cinq semaines. Avec des taux hypothétiques de 15 % de réponses, 25 % de rendez-vous par réponse, 40 % de besoins par rendez-vous et 20 % de démarrages par besoin, cela donne 1 014 sollicitations → 152 réponses → 38 RDV → 15 besoins → 3 démarrages. La cible arrondie de semaine est 140 e-mails + 65 approches LinkedIn, 8 RDV et 3 besoins. Chaque taux doit être remplacé par une cohorte observée en production.

La courbe annuelle provient de `GOAL_2026.monthlyStarts` et de la trajectoire mensuelle, sans interpolation à partir du total affiché. La semaine collective lit `WEEK_2026.metrics` et `reach`; le jeudi et le vendredi ne sont pas remplis artificiellement. Le commercial voit aussi sa cadence personnelle `MEMBER_WEEK.nora` face à `PERSONAL_TARGETS.nora`. La somme des gestes individuels correspond au réalisé collectif pour les mesures partagées ; les cibles personnelles sont configurées séparément. La carte et l'entonnoir mensuel reprennent `BUS`, `DEALS` et le même filtre ville / BU. Le journal horaire ne couvre que les événements réellement horodatés dans le scénario.

**Signé** = valeur contractuelle ; **démarré** = mission effectivement commencée, à suivre séparément du signé ; **pipe ouvert** = montant non pondéré des affaires en cours ; **facturé** = agrégat mensuel de la BU ; **encaissé** = règlements des six factures de l'échantillon. Les 75 100 € échus et les 89 350 € non encaissés de cet échantillon ne sont pas additionnés aux agrégats BU. La facture porte le compte, le responsable, la date, le retard et la prochaine relance. Une relance consignée dans cette maquette ne part à personne.

## Interconnexions à raccorder au monorepo

| Événement | Objet de référence | Écrans ou projections qui doivent réagir |
| --- | --- | --- |
| Résultat de RDV consigné | Affaire, activité, prochaine action datée | Ma journée, Mon agenda, Équipe → Plans/Activité, Pilotage → Affaires en cours, Laura |
| Affaire attribuée | Affaire + propriétaire + audit | Répartition, portefeuille, risques, fiche d'affaire, Laura |
| Note transmise à un collègue | Objet lié, destinataire, échéance, provenance | Travail du destinataire, journal d'équipe, dossier et Laura |
| Besoin qualifié / profil présenté / mission démarrée | Besoin, profil, mission et étapes du cycle | Entonnoir illustratif, staffing, cap mensuel, activité et pages métiers existantes |
| Facture réglée / relancée | Facture et rapprochement | Finance, priorités, fiche de compte et Laura |

Le connecteur CRM/ATS fournit les événements et leur provenance ; les projections calculent les mêmes indicateurs pour l'interface et Laura. Chaque objet porte `workspace_id`, BU, propriétaire, visibilité, horodatage et identifiant stable. Les droits sont contrôlés côté API. Un commercial ne peut pas réattribuer une affaire d'équipe depuis l'interface ; les rôles manager/direction le peuvent. Les données brutes ne traversent jamais les ESN. Une éventuelle mémoire de marché inter-ESN reste agrégée, autorisée et explicitement qualifiée.

## Direction visuelle et mouvement

Une seule navigation imbriquée dans le rail ; les onglets propres à Équipe restent sous le titre de la page. Dans le monorepo, Pilotage expose Cockpit / Affaires en cours / Staffing ; cette maquette garde un aperçu de Finance pour illustrer la liaison avec Missions › Finance. Fond perle, verre blanc translucide avec trait clair et reflet sur arête ; typographie charbon et écarts de tailles francs. Logo Bellum SVG noir original ; avatars fictifs illustrés de la référence White Glass. Les couleurs ne décorent pas la structure : graphite pour les mesures, vert pour un état positif, ambre ou rouge pour un risque. Aucun thème sombre dans cette livraison.

La courbe se trace à l'arrivée, les barres révèlent leur valeur, le choix de ville change la sélection et les chiffres ensemble, et le panneau surgit à partir du geste. Les contenus restent visibles dès le premier frame ; les mouvements sont brefs, interruptibles et coupés sous `prefers-reduced-motion`. Le retour d'action est local : sélection, confirmation, puis nouveau compteur. Les 19 principes de motion transmis servent de grille critique, sans multiplier les animations gratuites.

## État de la maquette et critères d'acceptation

`dist/performance-data.js` contient exclusivement les données de l'exemple ; `dist/organization.js` définit la configuration locale ; `dist/personal-workflows.js` gère les faits saisis localement. L'organisation, ses modifications et archives, les actions, rendez-vous, caps et échéances manuels, les changements d'attribution, d'issue, de relance et de passation de l'exemple sont conservés dans le `localStorage` du navigateur ; ils ne touchent ni CRM, ni comptabilité, ni collègue réel. Laura distingue les deux modes : données fictives dans l'exemple, saisies locales et limites de source dans l'espace personnel. Les labels de mode et de provenance restent visibles. Le Site ne prouve aucun déploiement CRM/ATS ni l’existence d’un entonnoir calculé sur données réelles.

À vérifier pour le raccordement réel : 1) une ville/BU filtre tous ses chiffres et dossiers dans l'exemple ; 2) une agence créée ne reçoit aucun chiffre fictif ; 3) une ville libre reste dans la liste sans point géographique inventé ; 4) une archive conserve ses liens et sa restauration les retrouve ; 5) un clic agenda ouvre la préparation puis l'affaire ; 6) l'attribution et la prochaine étape se reflètent dans activité et équipe ; 7) les factures ne sont jamais confondues avec le signé ; 8) Laura respecte le même périmètre et les droits ; 9) aucune action n'envoie sans confirmation explicite ; 10) le rail et les tableaux restent utilisables au zoom normal et sur écran étroit ; 11) mouvement réduit et clavier fonctionnent.
