# Lot — L5-laura-verite-et-forme

**38 points.** Extraits de leur registre, à l'état `retenu`.
L'état se change dans le REGISTRE d'origine (édition de SA ligne), jamais ici.

| Point | La demande, en huit mots | Sujet | Existant (preuve fichier:ligne + APPELANT) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------------------------------- | ---- | ----------------- |
| 1958.1 | Connaître le fuseau utilisateur | C | ABSENT — 0 champ timezone dans ChatRequest (models/chat.py) | retenu | — |
| 1958.2 | Connaître le fuseau workspace | C | ABSENT | retenu | — |
| 1958.3 | Connaître le fuseau du rendez-vous | C | PARTIEL — champ `timezone` par CONTACT existe (contact.ts:236), non branché au chat | retenu | — |
| 1958.4 | Connaître heure d'été/hiver | C | ABSENT | retenu | — |
| 1958.5 | Connaître la date locale | C | ABSENT — pas de date du jour injectée dans le prompt | retenu | — |
| 1958.6 | Convertir date ambiguë en date explicite avant action | C | PARTIEL — exigé et VALIDÉ côté outil (chat_tools.py:186-192,2094-2109), sans date-du-jour de référence | retenu | — |
| 1958.7 | Confirmer date/heure avec l'utilisateur | C | NON PROUVÉ | retenu | — |
| 1958.10 | i18n actions/sources/erreurs/notifications FR+EN | C | LIVRÉ — parity.test.ts, chat.json/actions.json 541/541 et 351/351 → ROUVERT 13/09 (PARTIEL, vérification déjà-là) : `apps/web/src/i18n/parity.test.ts` → `context_transparency.py:211` → `ContextDisclosure.tsx:276` | retenu | preuve = code : `apps/web/src/i18n/parity.test.ts` (clés FR/EN) ; les libellés serveur en français ne se voient qu'en interface anglaise, ce qui demande de changer un réglage : non recetté. |
| 1958.11 | Format devise locale | C | ABSENT — 0 Intl.NumberFormat dans le chat | retenu | — |
| 1958.12 | Format séparateurs de nombres | C | ABSENT | retenu | — |
| 1958.14 | Format heure | C | NON PROUVÉ | retenu | — |
| 1958.15 | Format durée | C | NON PROUVÉ | retenu | — |
| 1958.16 | Format milliers | C | ABSENT | retenu | — |
| 1958.17 | Format décimales | C | ABSENT | retenu | — |
| 1958.18 | Recette FR/CA, heure, RDV intl, anglais sur UI FR, date ambiguë | C | ABSENT — le produit est mono-langue forcé, le scénario « anglais sur interface française » n'existe pas | retenu | — |
| 1920.1 | Deux users même ESN, lecture différente | C | PARTIEL — bloc conditionnel existe (bellum_advisor.py:674-679) mais générique | retenu | Un BM et un dirigeant posant la même question reçoivent deux réponses différentes |
| 1920.2 | Persona Business Manager (comptes/rdv/besoins/consultants/relances) | C | ABSENT — 0 branchement par valeur de sellerRole, confirmé exhaustivement | retenu | sellerRole=« Business Manager » change le contenu, pas juste le registre |
| 1920.3 | Persona Recruteur | C | ABSENT | retenu | idem pour « Talent Manager / Recruteur » |
| 1920.4 | Persona Directeur d'agence | C | ABSENT — cette valeur n'existe même pas dans l'enum (le plus proche : « Directeur commercial »/« Directeur de BU ») | retenu | Décider quelle valeur de l'enum porte ce persona avant de coder |
| 1920.5 | Persona Dirigeant | C | ABSENT — enum a « Fondateur / CEO », pas « Dirigeant » | retenu | idem |
| 1920.6 | Persona Nouvel arrivant | C | ABSENT — confirmé absent de l'enum `user_role` (profile-questionnaire.ts:71-82) | retenu | Ajouter la valeur ou dériver l'état « nouvel arrivant » de `role_tenure` |
| 1920.8 | Utiliser le territoire | C | LIVRÉ — bellum_advisor.py:641 (geoZone) → ROUVERT 13/09 (PARTIEL, vérification déjà-là) : `packages/contracts/src/schemas/onboarding.ts:237` (`geo_zones`, clé ENTREPRISE) → `analysis.ts:594` (`geoZone`) → `esn-profile-workspace.resolver.ts:138` → `chat-context.service.ts:195` → `bellum_advisor.py:869` | retenu | Ouvrir `/settings/memory` sans rien modifier : « Zone géographique » figure sous « Ce que Laura sait de ton ESN », jamais sous « Ce que Laura sait de toi ». |
| 1920.11 | Utiliser le périmètre managé | C | ABSENT — aucun champ « équipe managée » dans seller_lines | retenu | Un directeur d'agence voit son équipe citée dans la réponse |
| 1920.12 | Utiliser l'ancienneté | C | ABSENT — `role_tenure` existe en base (profile-questionnaire.ts:83) mais n'est PAS lu par bellum_advisor.py → LIVRÉ : PR #1976, merge f62f2d6a9 (13/09) | retenu | ⚠️ RÉFUTÉ le 15/09 : `roleTenure` n’existe nulle part sauf en COMMENTAIRE (`bellum_advisor.py:1021` : « ne renvoie donc jamais rien »), aucun mapping vers `AnalysisProfileData`. La mention « LIVRÉ : PR #1976 » du registre était PÉRIMÉE. CODE: `roleTenure` a un écrivain ET un lecteur. |
| 1920.13 | Utiliser les connecteurs | C | PARTIEL — tools_summary générique (bellum_advisor.py:617-623), pas lié au rôle | retenu | — |
| 1920.14 | Utiliser les actions passées | C | PARTIEL — conversation_summary/account_feedback génériques | retenu | — |
| 1920.16 | Si rôle/objectif manque, dire personnalisation limitée | C | ABSENT | retenu | Un profil sans rôle déclaré : Laura le dit explicitement une fois |
| 1914.3 | Composant « Classement de comptes » | C | ABSENT | retenu | Une liste de comptes classés rend une carte, pas des puces markdown |
| 1914.4 | Composant « Liste de contacts » | C | ABSENT | retenu | Une recherche de contacts rend une carte, pas du texte |
| 1914.5 | Composant « Comparaison » | C | ABSENT — markdown.tsx ne gère aucun tableau | retenu | Une comparaison de deux comptes s'affiche côte à côte |
| 1914.7 | Composant « Shortlist consultants » | C | ABSENT | retenu | Une shortlist de consultants rend une carte dédiée |
| 1914.8 | Composant « Brief de rendez-vous » | C | ABSENT | retenu | Un brief RDV rend une carte dédiée |
| 1914.14 | Composants accessibles dans l'historique | C | PARTIEL — le `context` n'était PAS persisté (Chat.tsx, deux endroits) ; seul le texte survivait | livré | LIVRÉ 16/09 sur la branche `feat/fil-statut-et-contexte-16-09` — colonne `chat_messages.context` (jsonb nullable, migration `1795100317864-ChatMessageContext` AVANT le code, GA-11/GA-12), liste blanche unique `persistedChatContext` appliquée à la seule porte d'écriture. `pending_actions` (D65), `permissions` et `cards` ne sont jamais gardés ; la raison de chacun est dans `chat-message-context.ts`. Détail complet et tests : ligne 1914.14 de `registre-2026-09-12.md`. NON RECETTÉ EN PRODUCTION. |
| 1915.5 | Au clic : données workspace utilisées | C | LIVRÉ — ContextDisclosure.tsx:140 (plan/contacts) → ROUVERT 13/09 (PARTIEL, vérification déjà-là) : `context_transparency.py:318` → `ContextDisclosure.tsx:118` → `ContextDisclosure.tsx:240` | retenu | [1 msg] Dans un fil rattaché à un compte analysé, ouvrir « Voir la source » : pastilles profil, compte, contacts, plan, mémoire ; absentes à la réouverture. |
| 1915.6 | Au clic : Market Memory ou DataForge utilisés | C | NON PROUVÉ — non retrouvé comme catégorie propre du panneau | retenu | Une réponse s'appuyant sur search_market_memory montre cette catégorie au clic |
| 1915.9 | Au clic : date de fraîcheur | C | LIVRÉ — reply-provenance.ts, ReplyFooter.tsx:69-71 → ROUVERT 13/09 (PARTIEL, vérification déjà-là) : `context_transparency.py:314` → `reply-provenance.ts:46` → `ReplyFooter.tsx:68` | retenu | [1 msg] Dans un fil rattaché à un compte analysé, le pied affiche « Source du <date> » ; la date disparaît à la réouverture. |
| 1915.11 | Panne de source → « indisponible », pas zéro | C | PARTIEL — pattern livré pour mémoire/historique (MemoryBar.tsx:129-135, ConversationsPanel.tsx:265-271) et pour plusieurs outils (chat_tools.py:912-915,1444-1446), pas branché sur le panneau sources lui-même | retenu | Une source en panne dans ContextDisclosure affiche « indisponible », jamais 0 résultat |
| 1915.12 | Ouvrir la source si permissions | C | LIVRÉ — ReplyFooter.tsx:84-86 (« Voir la source ») → ROUVERT 13/09 (CONSTAT FAUX, vérification déjà-là) : `ReplyFooter.tsx:95` → `ReplyFooter.tsx:129` → `ContextDisclosure.tsx:338` (pastilles en `<span>`) | retenu | [1 msg] Cliquer « Voir la source » ouvre le panneau et rien d'autre ; aucune pastille ne se clique, aucun document ni dossier ne s'ouvre. |
