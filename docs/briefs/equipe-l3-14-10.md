# Lot L3 — boîte de réception et notifications entre collègues

Applique `docs/briefs/equipe-commun-14-10.md` (même branche). Ta branche : `claude/equipe-l3-14-10`. Lignes du tracker : **14 à 19**.

Commence par chercher l'existant : table/service de notifications, la cloche « 99+ » en bas de la sidebar, « inbox », `mentioned_user_ids`, commentaires d'équipe (l'audit dit qu'ils sont livrés, mentions stockées sans effet). RÉUTILISE ce qui existe ; ne crée une table que s'il n'y a rien.

Tranché par Louis le 14/10 : **dans l'app + e-mail opt-in**, e-mail désactivé par défaut, jamais rien vers un prospect.

- **#14** Boîte de réception in-app par utilisateur, scopée à l'espace actif : liste (type, auteur en clair, objet lié cliquable, date), état lu/non lu, « tout marquer lu », compteur non lu sur la cloche existante (un compteur à zéro ne s'affiche pas). Les notifications d'équipe sont un FILTRE ou une catégorie de la boîte existante, pas une deuxième cloche. Ajout seulement en base.
- **#15** Un compte m'est ASSIGNÉ par un collègue (`accounts.assigned_to` change vers moi, auteur ≠ moi) : une notification.
- **#16** Une action m'est DÉLÉGUÉE (`action_plan_items.assigned_to` vers moi, auteur ≠ moi) : une notification. Branche-la par UN appel au point d'écriture existant (L1 touche aussi `action-plan-items.service.ts` : garde ton diff minimal).
- **#17** @mention : `mentioned_user_ids` produit une notification par personne mentionnée, SEULEMENT si elle est membre de l'espace et a accès à l'objet. Personne n'est notifié de sa propre action.
- **#18** Admin prévenu : pour un utilisateur `team:manage`, la boîte montre une entrée DÉRIVÉE (calculée à la lecture, pas stockée) « N collègues attendent que tu décrives l'ESN », tant que l'espace n'a pas de fiche entreprise canonique et qu'au moins un membre a fini son onboarding perso. Elle mène à la description de l'ESN. Ne touche PAS `esn-profile.service.ts` (L2 y travaille) : lis la donnée par le résolveur ou le dépôt.
- **#19** Préférences : dans Réglages (section notifications existante, sinon nouvelle sous-section), un interrupteur e-mail par type (assignation, délégation, mention, digest manager réservé pour L5), tous **désactivés par défaut**. Activé, l'e-mail part par le mailer existant, au destinataire seulement, avec un lien vers l'objet et sans le CORPS d'aucun message commercial (doctrine). Test : désactivé ⇒ zéro appel au mailer.

Démo : la boîte de l'occupant démo contient quelques notifications venant de collègues fictifs. L2 crée les collègues : en attendant, sème-les avec des identifiants définis dans TON seed et note dans ton commentaire que l'intégrateur doit les aligner sur ceux de L2. Classe dans `demo-coverage.ts`.
Ne touche PAS : sidebar/onboarding (L2), invitations/droits (L1), contenu de `/team` (L7).
