# Lot L4 — garde-fous de collaboration entre collègues

Applique `docs/briefs/equipe-commun-14-10.md` (même branche). Ta branche : `claude/equipe-l4-14-10`. Lignes du tracker : **20 à 25**. Benchmark : §3 du tracker.

Cherche d'abord l'existant (doublons de contacts/comptes, `contact-identity.ts`, `assigned_to`, historique des messages préparés/déclarés, besoins/missions/consultants proposés, liste d'exclusion ou « ne pas contacter »). RÉUTILISE.

- **#20** « Déjà travaillé par X » : à l'ouverture d'un compte ou d'un contact, si un AUTRE membre de l'espace en est responsable ou y a eu une activité dans les 90 derniers jours, un bandeau en lecture seule dit qui (nom en clair), quoi (dernière action) et quand. Aucun blocage. Rien si c'est moi ou si personne.
- **#21** Sur un message préparé (copilote, séquence, plan) pour un contact qu'un collègue a contacté (envoi vérifié OU déclaré, nommé comme tel) dans les 30 derniers jours : avertissement « contacté par <nom> il y a N j » au moment de copier/marquer fait, avec confirmation. Jamais de blocage dur, jamais d'envoi (doctrine : le commercial envoie).
- **#22** Liste « ne pas contacter » de l'ESPACE : ajouter/retirer un contact ou un domaine, avec motif obligatoire et auteur. Un contact listé porte un badge partout où il apparaît, et #21 l'avertit en premier. Permission : tout membre propose, `team:manage` retire. Ajout seulement en base. ⚠️ Distinct de l'effacement RGPD (c67), qui existe déjà : ne le touche pas.
- **#23** « Consultant déjà proposé » : sur un besoin, quand on propose un consultant déjà proposé par un collègue à ce client ou sur un autre besoin ouvert, afficher qui, quel client, quelle date. Information, pas de blocage.
- **#24** Doublons entre collègues : si l'existant détecte déjà des doublons, vérifie qu'il compare À TRAVERS les membres de l'espace. La fusion reste PROPOSÉE, jamais faite seule (doctrine). Sinon, ajoute la détection (domaine pour un compte ; e-mail, LinkedIn ou nom+entreprise pour un contact) et une carte « doublon probable » avec « proposer la fusion ».
- **#25** Équipe de compte : en plus du responsable (`assigned_to`), des co-équipiers (ajout seulement en base : table de liaison compte↔membre). Affichés sur la fiche compte, ajoutables par le responsable ou `team:manage`. Ils ne changent PAS la visibilité (tout l'espace voit déjà tout) : ils servent au filtre « mes comptes » et aux notifications futures.
  Démo : sème au moins un cas de #20, #21 et #23 avec les collègues fictifs (L2 les crée : définis tes identifiants dans TON seed, l'intégrateur alignera). Classe tout dans `demo-coverage.ts`.
  Ne touche PAS : `/team` (L7), sidebar/onboarding (L2), notifications (L3), invitations (L1).
