# Lot — L4-laura-actions-jobs-quotas

**36 points.** Extraits de leur registre, à l'état `retenu`.
L'état se change dans le REGISTRE d'origine (édition de SA ligne), jamais ici.

| Point | La demande, en huit mots | Sujet | Existant (preuve fichier:ligne + APPELANT) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------------------------------- | ---- | ----------------- |
| 1952.2 | Enrichissement de nombreux contacts | E | PARTIEL — mécanisme existe hors chat | retenu | BLOQUÉ — enrich_contact traite UN contact (chat_tools.py:218-223), pas un lot |
| 1952.3 | Matching massif | E | PARTIEL | retenu | BLOQUÉ — run_matching est synchrone et ne débite aucun crédit (chat_tools.py:657-665) |
| 1952.4 | Import de documents | E | PARTIEL — `ImportService`/sessions existent, pas de carte chat | retenu | BLOQUÉ — aucun outil d'import ; la route est en lecture seule (chat_tools.py:1074) |
| 1952.5 | Génération de plusieurs CV | E | À VÉRIFIER (module non audité) | retenu | BLOQUÉ — aucun outil CV n'existe (grep vide) |
| 1952.6 | Export | E | PARTIEL | retenu | BLOQUÉ — export_contact_to_crm traite UN contact (chat_tools.py:257-263) |
| 1952.7 | Recherche multi-sources | E | PARTIEL | retenu | BLOQUÉ — tous les outils search_* répondent dans la requête, rien d'asynchrone à suivre |
| 1952.9 | Ne pas prétendre que tout est terminé | E | À VÉRIFIER (texte exact de `chat_tools.py` non audité) | retenu | PAS LIVRÉ — grep « jamais.*terminé » sur chat_tools.py rend 0 |
| 1952.11 | État « En attente » | E | PARTIEL — `'planned'` existe (`workflowRunStatusSchema`), hors chat | retenu | NON FAIT, raison mesurée 15/09 : `AnalysisService.getStatus` ne rend que `active|completed|failed|canceled|not_found` — « en attente », « en attente de validation » et « partiel » n'ont AUCUNE source. Les coder serait du code que personne n'appelle (motif n°1 du dépôt). |failed |
| 1952.13 | État « En attente d'une validation » | E | PARTIEL — `'awaiting_approval'`, livré dans Action Center, absent du chat | retenu | NON FAIT, raison mesurée 15/09 : `AnalysisService.getStatus` ne rend que `active|completed|failed|canceled|not_found` — « en attente », « en attente de validation » et « partiel » n'ont AUCUNE source. Les coder serait du code que personne n'appelle (motif n°1 du dépôt). |
| 1952.15 | État « Partiel » | E | PARTIEL — `'partial'` | retenu | NON FAIT, raison mesurée 15/09 : `AnalysisService.getStatus` ne rend que `active|completed|failed|canceled|not_found` — « en attente », « en attente de validation » et « partiel » n'ont AUCUNE source. Les coder serait du code que personne n'appelle (motif n°1 du dépôt). |
| 1952.20 | Carte affiche étape actuelle | E | PARTIEL — steps listés a posteriori, pas en temps réel | retenu | BLOQUÉ — aucun champ step/eta au contrat CardPreview/CardResult (copilot-card.ts) |
| 1952.21 | Carte affiche nb étapes terminées | E | PARTIEL | retenu | BLOQUÉ — idem 1952.20, champ neuf requis au contrat |
| 1952.22 | Carte affiche durée estimée | E | ABSENT — aucun ETA trouvé nulle part | retenu | BLOQUÉ — idem 1952.20, champ neuf requis au contrat |
| 1952.23 | Carte affiche crédits réservés | E | PARTIEL — `creditsEstimatedVsSpent` livré côté Action Center, absent du chat | retenu | BLOQUÉ — la réservation est interdite par l'invariant I3 (copilot-card.service.ts:678-681) |
| 1952.24 | Bouton voir le détail | E | PARTIEL — la page Action Center EST le détail, pas accessible depuis le chat | retenu | BLOQUÉ — aucun lien de détail dans CopilotCards.tsx (fichier lu intégralement) |
| 1952.25 | Bouton annuler lorsque possible | E | ABSENT — aucun bouton d'annulation de run trouvé | retenu | Écran/parcours — tranché par Claude sur la doctrine déjà écrite (Louis 15/09 : « prends-les tous, ne me redemande rien »). Se prouve en recette. |
| 1952.29 | Notification facultative de fin | E | À VÉRIFIER (mécanisme `notify_user` existe, lien à la fin d'un run non vérifié) | retenu | PAS LIVRÉ — un seul hit hors-sujet pour « notifications. » dans copilot-card.service.ts |
| 1952.32 | Résumé : ce qui doit être vérifié | E | ABSENT | retenu | PAS LIVRÉ — aucun champ « à vérifier » dans CardResult |
| 1952.34 | Résumé : page propriétaire du résultat | E | ABSENT | retenu | BLOQUÉ — aucun lien vers la page du compte |
| 1952.37 | Interdit : disparition du job | E | PARTIEL — contredit côté cartes chat (1931.21), respecté côté runs Action OS (persistés) | retenu | PAS LIVRÉ — PendingActions.tsx:358,623 remet l'état local à « proposed » ; encore monté Chat.tsx:1811 |
| 1953.1 | Bouton « Arrêter » pendant la réponse | E | ABSENT — aucun `AbortController`/signal dans `laura-turn.ts` | retenu | Un bouton « Arrêter » interrompra la génération en cours. |
| 1953.2 | L'arrêt interrompt la génération | E | ABSENT | retenu | Idem, techniquement. |
| 1953.3 | L'arrêt conserve le texte déjà reçu | E | ABSENT | retenu | Le texte déjà reçu restera affiché après arrêt. |
| 1953.5 | Action « Réessayer » | E | ABSENT | retenu | Un bouton « Réessayer » apparaîtra sous chaque réponse. |
| 1953.6 | Action « Modifier ma demande » | E | ABSENT | retenu | L'utilisateur pourra éditer son dernier message. |
| 1953.7 | Action « Répondre avec un autre angle » | E | ABSENT | retenu | Une option proposera une réponse alternative. |
| 1953.9 | Action « Partager » | E | PARTIEL — `ShareConversation.tsx` partage le FIL entier, pas une réponse | retenu | Chaque réponse portera son propre bouton de partage. |
| 1953.10 | Action « Signaler un problème » | E | ABSENT | retenu | Un bouton « Signaler » apparaîtra sous chaque réponse. |
| 1953.11 | Éditer son dernier message | E | ABSENT | retenu | Idem 1953.6. |
| 1953.12 | Nouvelle exécution = branche ou remplacement explicite | E | ABSENT — aucune notion de branche trouvée | retenu | Éditer un message créera une branche visible, sans réécrire l'historique. |
| 1953.13 | Réessayer ne relance jamais une action externe déjà exécutée | E | ABSENT (fonction inexistante) | retenu | Un réessai ne renverra jamais un e-mail/écriture déjà partie. |
| 1953.14 | Action obsolète si contexte de branche change | E | ABSENT | retenu | Une action préparée dans une branche abandonnée s'affichera comme obsolète. |
| 1953.19 | Aucun double débit lors d'un retry technique | E | PARTIEL — mécanisme existe (`settle()`), non branché au tour de chat | retenu | Un retry technique du chat ne débitera jamais deux fois. |
| 1953.20 | Aucune duplication brouillon Gmail/tâche CRM/analyse | E | PARTIEL — vrai pour l'analyse (#1489), ABSENT pour le brouillon mail (aucune clé d'idempotence dans `mailbox` module) | retenu | Un double clic ne créera jamais deux brouillons ni deux tâches CRM. |
| 1953.21 | Montrer mêmes données vs nouvelle recherche | E | ABSENT | retenu | La réponse dira si elle réutilise les données ou relance une recherche. |
| 1953.22 | Conserver la provenance de chaque branche | E | ABSENT (pas de branches) | retenu | Chaque branche gardera sa provenance visible. |
