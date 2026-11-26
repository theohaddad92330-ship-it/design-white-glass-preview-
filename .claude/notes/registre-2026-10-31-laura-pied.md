# Registre — #5032 pied de réponse Laura V8 — 31/10/2026

base : 4b48280d69 — 31/10/2026. Contrat de lot validé par Louis le 31/10 (QCM). Brief : `docs/briefs/claude-laura-pied-v8-5032.md`.

| point | demande en huit mots | écran | état | preuve en recette |
| --- | --- | --- | --- | --- |
| #5032.1 | rangée invisible au repos, survol/focus la montre | /chat | retenu | /chat ≥ 769 px : sous une réponse, rien ; survol ou Tab → 5 contrôles sur une ligne |
| #5032.2 | mobile : dernière réponse visible, toucher révèle | /chat mobile | retenu | /chat 390 px : rangée sous la dernière réponse seule ; toucher une ancienne réponse → sa rangée |
| #5032.3 | heure retirée du pied | /chat | retenu | aucune heure sous une réponse |
| #5032.4 | commentaires de réponse retirés, code compris | /chat | retenu | aucun « Commentaires » ; `git grep ReplyComments useChatComments` vide hors rapports |
| #5032.5 | écouter retiré, code compris, mode voix intact | /chat | retenu | aucun bouton écouter ; le mode conversation vocale lit toujours ses réponses |
| #5032.6 | « Voir la source » devient Sources / Contexte | /chat | retenu | bouton « Sources » (ou « Contexte » sans source) ouvre le panneau |
| #5032.7 | fraîcheur et nombre de sources dans le panneau | /chat | retenu | « Donnée du … » et « N sources » visibles seulement panneau ouvert |
| #5032.8 | badges de statut dans le panneau | /chat | retenu | « Signal actuel vérifié » absent de la ligne, présent dans le panneau |
| #5032.9 | « Laura a lu ce fil » seulement dans le panneau | /chat | retenu | auteur du tour : la mention n'apparaît que panneau ouvert |
| #5032.10 | Enregistrer en icône, garde le choix typologie | /chat | retenu | icône signet nommée → même choix (fait, préférence, règle…) qu'avant |
| #5032.11 | Retravailler renommé Ajuster, mêmes transformations | /chat | retenu | bouton « Ajuster » → mêmes entrées que l'ex-Retravailler |
| #5032.12 | Ajuster gagne « Approfondir (avec devis) » | /chat | retenu | Ajuster › Approfondir → devis puis lancement (moteur #2452) |
| #5032.13 | qualification complémentaire ouvre l'approfondissement par Ajuster | /chat | retenu | CTA « Lancer une qualification complémentaire » → même flux devis |
| #5032.14 | repli « Aller plus loin » retiré (/chat, bulle) | /chat, bulle | retenu | aucun « Aller plus loin sur cette réponse » nulle part |
| #5032.15 | ⋯ : Exporter, Signaler, Réessayer/Modifier/Autre angle | /chat | retenu | ⋯ ouvre ces entrées ; « Donnée fausse » envoie toujours la correction |
| #5032.16 | bulle Laura : même rangée que /chat | bulle | retenu | bulle : mêmes 5 contrôles, cachés au repos |
| #5032.17 | panneau Sources garde tout son contenu actuel | /chat | retenu | ContextDisclosure, ReplyBasis, mémoire consultée présents panneau ouvert |
| #5032.18 | accessibilité : nommé, tabulable, ≥ 44 px | /chat | retenu | gardes GA-27/32/35 vertes ; Tab atteint chaque contrôle |
| #5032.19 | parité clair/sombre, aucune couleur en dur | /chat | retenu | garde GA-33 verte ; capture clair + sombre |
| #5032.20 | démo : une réponse montre la nouvelle rangée | démo | retenu | /demo › /chat : rangée au survol |
| #5032.21 | toutes langues + changelog | i18n | retenu | parité fr/en ; entrée changelog fr/en |
