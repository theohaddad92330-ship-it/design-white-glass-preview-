# Lot L1 — droits, invitations, lectures partagées (mode équipe)

Applique `docs/briefs/equipe-commun-14-10.md` (même branche). Ta branche : `claude/equipe-l1-14-10`. Lignes du tracker : **1 à 8**.

Les droits d'un rôle sont un arrêt obligatoire. Ce qui est tranché :

- **#1** Les rôles `admin` et `owner` ne sont attribués, retirés ou modifiés QUE par `owner` ou `admin`. `sales_ops` (qui porte `team:manage`) gère les rôles non admin (member, sales, sales_ops, tech_admin, viewer) mais reçoit **403** s'il invite un admin, retire un admin ou promeut quelqu'un admin. Côté API dans `workspace-team.service.ts` (createInvitation, removeMember, changement de rôle) ; côté écran, Réglages › Équipe ne propose pas « Admin » à un sales_ops. Un admin ne peut pas retirer le propriétaire (déjà le cas, garde le test).
- **#2** Renvoi : `POST /workspaces/invitations/:id/resend` (permission `team:manage`, mêmes règles que #1). Il régénère le jeton, repousse l'expiration de 7 j et renvoie l'e-mail par le chemin existant. Bouton « Renvoyer » sur chaque invitation en attente dans Réglages › Équipe, avec l'issue de l'envoi affichée (envoyé / non parti).
- **#3** Expiration : une invitation dont `expires_at` est passé est traitée comme `expired` PARTOUT (comptage des sièges, dédoublonnage par e-mail, liste), qu'un balayage l'ait marquée ou non. Ajoute aussi le marquage par la tâche planifiée existante la plus proche (sinon un cron Nest léger). Ré-inviter le même e-mail après expiration fonctionne.
- **#4** `removeMember` libère aussi `action_plan_items.assigned_to` du partant (retour au créateur de l'action ou à « non attribué », selon le modèle existant de `releasePortfolio`). Ses actions ne disparaissent pas.
- **#5 / #6** Les lectures nommées dans l'audit (`action-plan-items.service.ts` vers la ligne 951, `sequence-templates.service.ts` vers la ligne 103) passent au périmètre de l'ESPACE actif (comme `accounts`). Un collègue du même espace voit le plan d'action réel d'un compte partagé ; un utilisateur d'un autre espace reçoit 404. Cherche les jumeaux : toute lecture d'une table qui porte `workspace_id` mais filtre encore par `user_id` seul, sur comptes/contacts/plans/signaux. Liste ceux que tu corriges et ceux que tu laisses avec leur raison.
- **#7** Spécifications d'intégration à DEUX utilisateurs (même espace et espaces différents) sur ce que tu touches : invitation par sales_ops refusée, renvoi, expiration, retrait, plan partagé, isolation.
- **#8** `e2e/tests/web/onboarding/invite.spec.ts` est en `test.skip` : lis pourquoi. Si la raison est levable sans infra, réactive-le. Sinon remplace-le par un test d'intégration API qui couvre le même parcours, et laisse le skip avec un commentaire qui pointe vers ce test.

Démo : pas d'écran neuf, sauf le bouton Renvoyer. Classe-le dans `demo-coverage.ts` (« vide à dessein » si la démo n'a pas d'invitation en attente, avec la raison).
Ne touche PAS : sidebar/onboarding (L2), notifications (L3), `/team` (L7).
