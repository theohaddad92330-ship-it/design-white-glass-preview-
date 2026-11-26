# Registre — 4 retours bêta du jour, 23/09 midi

base : 7e7105fb7d1a86b9c9beb30bc45a466d601a4a52 — 2026-09-23

| id | demande en 8 mots | sujet | état | preuve en recette (ÉCRAN/API/CODE) |
|---|---|---|---|---|
| #2753.1 | supprimer le bandeau « contacts sans adresse » du dossier | accounts:contacts | recetté | ÉCRAN/CODE prod d61bf2983 (recette 23/09) : /accounts/260a9757-…?tab=contacts : bandeau "117 des 132 contacts de ce compte n'ont pas d'adresse" avec bouton Fermer (X) visible. Persistance après clic non testée (sessionStorage, pas cliqué par prudence — pas dans la liste des boutons autorisés). |
| #2754.1 | section « chemin d'accès » trop haute, texte trop long | accounts:contacts | recetté | ÉCRAN prod 23/09 (17d967788) — /accounts/260a9757-7df6-4390-8c23-5062d4ba570c?tab=contacts : conteneur « Chemin d'accès recommandé » h=82px (titre+sous-titre+repère méthode « Classés parmi 132 contacts sur huit critères… » visible) ; texte « Enrichis d'abord 3 à  |
| #2755.1 | organigramme absent après analyse alors qu'obligatoire | accounts:organigramme | livré | ‖ CODE 24/09 soir : correctif sur main 4d5ef76 (df14496b7e, 51f284697c9 ; org_graph_build.py:97,122 ; segment-catchup.ts:210 ← TabOrganigramme.tsx:272) — effet = avis « collecte antérieure », pas de remplissage rétroactif. RESTE : preuve ÉCRAN sur un compte analysé APRÈS le correctif |
| #2756.1 | gérer/connecter plusieurs messageries sur /mailbox | mailbox | recetté | ÉCRAN/CODE prod d61bf2983 (recette 23/09) : /mailbox, bandeau "Ta messagerie est connectée · Fils relus à 23:31 · +1 autre messagerie branchée" à côté de "Gérer la connexion →" (capture zoom faite) — preuve exacte attendue, compte déjà multi-connecté en prod, aucune connexion créée. |
