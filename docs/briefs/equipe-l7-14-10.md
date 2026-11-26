# Lot L7 — refonte du tableau d'équipe `/team`

Applique `docs/briefs/equipe-commun-14-10.md` (même branche). Ta branche : `claude/equipe-l7-14-10`. Lignes du tracker : **37 à 46**.

Conception : refonte d'information et de mise en page d'un écran manager, avec arbitrages de hiérarchie et de doublons entre écrans.

## Contexte (Louis 14/10, capture de `/team`)

« Je suis vraiment pas satisfait du dashboard en lui-même, son contenu, sa présentation. » Aujourd'hui : en-tête « Workspace commercial · <espace> », « N membre · vue consolidée », puis 7 accordéons FERMÉS (Aujourd'hui, Semaine, Équipe, Pipe, Staffing, Missions, Adoption). À l'arrivée, on ne voit rien.
⚠️ RENVERSEMENT ASSUMÉ ET DATÉ (Louis 14/10/2026) de #1809 (sections repliées par défaut) et #2405.3 (les sept intitulés, 22/09 soir). Écris-le en commentaire au-dessus du composant et dans `ManagerDashboardPage.collapsed.test.tsx` (le test change de sens, il ne disparaît pas). Ne réécris pas l'historique de ces issues.

Source unique : `GET /manager/team-stats` → `ManagerService.getTeamStats` (`apps/api/src/modules/manager/manager.service.ts` ~l.130), permission `team:manage`, palier `manager_cockpit`. Page : `apps/web/src/features/manager/view/ManagerDashboardPage*.tsx`, route `apps/web/src/routes/team/index.tsx`, libellés `apps/web/src/i18n/locales/{fr,en}/manager.json`. Lis l'existant EN ENTIER avant de bouger quoi que ce soit : chaque indicateur actuel doit retrouver une place ou être retiré avec sa raison écrite dans ton commentaire.

## Principes (les meilleurs tableaux de bord : Linear, HubSpot, Pipedrive Insights, Gong, Stripe)

1. Pyramide inversée : ce qui demande une action en haut, l'état au milieu, le détail et l'historique en bas.
2. Une QUESTION par bloc, et un titre qui EST la réponse (« 3 relances en retard », pas « Pipe »). Libellés FR/EN, tutoiement.
3. 5 indicateurs clés maximum en tête, chacun comparé à la période précédente (flèche + écart, jamais une couleur seule), chacun cliquable vers la liste filtrée.
4. Rien de replié au-dessus de la ligne de flottaison. Seul le détail en bas peut se replier.
5. UNE période pour toute la page (7 j / 30 j / 90 j, défaut 7 j), dans l'URL (`?periode=`).
6. Un bloc sans donnée ne fait AUCUNE ligne (doctrine). Un non mesuré n'est jamais « 0 ».
7. Aucun classement nominatif, aucune probabilité, aucun prévisionnel pondéré (doctrine).

## Nouvelle architecture (lignes du tracker)

- **#37 En-tête** : nom de l'ESN (plus « Workspace commercial »), avatars des membres actifs (nom au survol et au focus), sélecteur de période, action principale « Préparer ma revue d'équipe » (Laura, le geste existant du bouton flottant), « Gérer les membres » en action secondaire vers `/settings/team`. Plus de « vue consolidée ».
- **#38 « À traiter »** (toujours ouvert, en premier) : fusion des cartes d'arbitrage actuelles d'Aujourd'hui et des doublons de Staffing (sans responsable, doublons de couverture, actions en retard, comptes en veille ≥ 14 j, périmètres non couverts), ET deux entrées nouvelles si la donnée existe : invitations en attente (renvoi vers Réglages › Équipe), collègues qui attendent la description de l'ESN (même règle que L3 #18 : pas de canonique + membre onboardé). Une carte = un compte, une phrase, un bouton vers l'action. Trié par urgence. Vide : une ligne « Rien à arbitrer » discrète, pas un bloc.
- **#39 « Pouls de l'équipe »** : 5 indicateurs de la période vs la précédente : analyses lancées, actions faites, RDV obtenus (déclaratifs, nommés comme tels), comptes actifs, besoins ouverts. Ajoute au service les comparaisons de période si absentes (ajout seulement au contrat).
- **#40 « Par commercial »** : la table actuelle de la section Équipe, recentrée sur 6 colonnes (membre, portefeuille, actions ouvertes, dont en retard, activité de la période, dernier passage), triée par NOM, jamais par performance. Ligne cliquable vers le portefeuille du membre (`useMemberPortfolio` existe). Le coaching existant reste, sous la table, replié.
- **#41 « Revue de pipeline »** : remplace Pipe. Affaires sans prochaine étape, sans activité depuis N j, bloquées dans une étape depuis N j, avec le responsable. Les « objectifs de l'équipe » existants restent ici. « Contacts à traiter » (7 statuts) part plus bas dans le détail.
- **#42 « Staffing »** : besoins ouverts face aux consultants disponibles si la donnée existe, plus la carte de couverture et les comptes par propriétaire actuels. Les doublons partent dans « À traiter » (#38).
- **#43 « Activité de l'équipe »** : fil chronologique de la période (ce que l'équipe a fait), filtrable par membre. Réutilise `ActivityLogView` / `useWorkspaceActivity` si c'est le même flux, sans dupliquer `/settings/activity`.
- **#44 Bas de page, replié** : Adoption (playbooks, routines, rituels, commentaires, crédits & usage IA, totaux), hygiène Missions (sans date de fin, sans coût chargé), contacts à traiter. Puis la mention « Données hébergées dans l'Union européenne ».
- **#45 Retraits** : la section « Semaine » (agenda) part. Le sélecteur de période la remplace, et l'agenda vit dans `/today`. Les doublons Aujourd'hui/Staffing sont fusionnés en #38. Les totaux Emails/Analyses qui renvoient vers /actions ne sont pas répétés s'ils sont dans le pouls.
- **#46 Mobile et accessibilité** : une colonne sous 768 px, table « Par commercial » en cartes, cibles ≥ 44 px, `dvh`, aucune parallaxe ni rebond (`packages/ui/src/motion.ts`), contraste AA dans les deux thèmes, aucun hex dans le JSX, largeur pleine pour listes/tableaux (D81). Gardes `apps/web/src/architecture/` vertes.

## Démo et périmètre

- Ne sème RIEN dans `demo-dataset.ts` (L2 y ajoute les collègues fictifs, comptes assignés et actions déléguées : l'intégrateur fusionnera). Classe chaque nouveau bloc dans `demo-coverage.ts` : « seedé par L2 » ou vide à dessein, avec la raison. Tes tests utilisent des fixtures, pas la démo.
- Ne touche PAS : sidebar/navigation (L2), notifications (L3), invitations (L1), Réglages › Équipe.
- Tests : rendu par bloc avec données / sans données (aucune ligne), période dans l'URL, ordre des blocs, tri par nom de la table, aucun accordéon fermé au-dessus de « Activité de l'équipe », le test #1809 inversé.
