# Registre — lot INTEGRATIONS-MAIL (vague L, 27/10/2026)

| Point | État | Preuve en recette |
|---|---|---|
| #4546.1 deux Gmail + deux Outlook coexistent | déjà là (`google-multi-mailbox.spec.ts`, `microsoft-multi-mailbox.spec.ts`) | /integrations › Google Workspace › « Boîtes connectées » : une ligne par boîte |
| #4546.2 brancher n'écrase pas | déjà là (mêmes specs) | « Ajouter une boîte » avec une 2e adresse ⇒ 2 lignes (geste humain) |
| #4546.3 débrancher UNE boîte | déjà là (`resolveDisconnectTarget`) | débrancher une ligne laisse l'autre |
| #4546.4 liste des boîtes à l'écran | déjà là (`GoogleMailboxes.tsx`, `MicrosoftMailboxes.tsx`) | idem 4546.1 |
| #4546.5 choix de l'expéditeur | livré : `GET /mailbox/senders`, `senderConnectionId` sur `POST /mailbox/batch`, envoi + brouillon du lot partent de la boîte désignée ; `DraftDialog` « Envoyer depuis » | fiche → fil → « Répondre » : sélecteur « Envoyer depuis » (≥ 2 boîtes) ou « Part de <adresse> » (1 boîte) ; le message part de l'adresse choisie |
| #4546.6 REFUS pour un collègue | livré : `google-sender-mailbox.spec.ts`, `microsoft-sender-mailbox.spec.ts`, `mail-batch-sender.spec.ts` | un lot avec l'id de boîte d'un collègue ⇒ 404, rien ne part |
| #4546.7 portées par boîte | livré pour l'envoi : une boîte sans `send` n'est jamais proposée ni acceptée | boîte lecture seule absente du sélecteur |
| #4546 « Boîte sans nom communiqué » | reformulé : le sélecteur numérote (« Boîte 2 ») quand l'adresse est inconnue, jamais deviné | — |
| #4591 run « En attente » éternel + 429 | déjà là (`integration-sync.controller.ts:112,125` seuil de sondage ; `integration-sync.service.ts:175` run orphelin ⇒ `failed` nommé ; `sync-poll.ts` sondage espacé) | lancer une synchro : état terminal + compte, 0 × 429 (geste humain) |
| #4487 `updated_since` refusé | déjà là (`pipedrive.client.ts:402-408`, test 4 ressources `pipedrive.read.spec.ts:86`) | cycle de synchro sans « read organizations failed » |
| #4592 démo « Générer le mail » | déjà là (`PlanMailBlock.tsx:39`, appelant `TodayCard.tsx:457`) | /demo → /actions : pas de bouton, « rédaction non disponible dans la démonstration » |
