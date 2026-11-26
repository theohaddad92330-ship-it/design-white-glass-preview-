# Lot L10-laura-fils-et-collaboration — Laura, fils, collaboration et surface d'entrée

**39 points** à l'état `retenu`, extraits de `registre-2026-09-12.md`.
L'état se change dans le REGISTRE d'origine, par édition de SA ligne.

| Point | La demande, en huit mots | Sujet | Existant (preuve) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------- | ---- | ----------------- |
| 1955.2 | Rechercher | F | PARTIEL — champ recherche (`ConversationsPanel.tsx:252-264`), mais affiché seulement au-delà de 5 fils et filtré côté client sur les fils déjà chargés (`filterThreads`) | retenu | La recherche portera sur tout l'historique, pas seulement la page chargée |
| 1955.7 | Exporter | F | ABSENT — aucune fonction d'export dans le feature chat | retenu | Un bouton « Exporter » téléchargera le fil |
| 1955.8 | Dupliquer si nécessaire | F | ABSENT | retenu | Un fil dupliqué apparaîtra comme un nouveau fil indépendant |
| 1955.12 | Exige permissions sur objets cités | F | NON PROUVÉ — la lecture ne filtre QUE par workspace d'après le commentaire, pas par portefeuille/compte cité | retenu | cf. geste de 1940.8 |
| 1955.15 | Export Markdown | F | ABSENT | retenu | Un export `.md` téléchargera le fil formaté |
| 1955.16 | Export PDF | F | ABSENT | retenu | Un export `.pdf` téléchargera le fil |
| 1955.17 | Export copie structurée | F | ABSENT | retenu | Un export JSON/structuré exposera messages, sources, actions |
| 1955.18 | Export indique la date | F | ABSENT (dépend d'un export inexistant) | retenu | L'export portera une date d'émission |
| 1955.19 | Export indique les auteurs | F | ABSENT | retenu | L'export nommera qui a écrit chaque message (suppose 1940.4 résolu) |
| 1955.20 | Export indique le périmètre | F | ABSENT | retenu | L'export nommera le compte/portefeuille concerné |
| 1955.21 | Export indique les sources | F | ABSENT | retenu | L'export listera les sources citées par Laura |
| 1955.22 | Export indique les actions exécutées | F | ABSENT | retenu | L'export listera les actions confirmées pendant le fil |
| 1955.23 | Export indique les limites | F | ABSENT | retenu | L'export mentionnera ce que Laura n'a pas pu consulter |
| 1955.24 | Résumé — décisions prises | F | PARTIEL — résumé roulant réel (`conversation-summary.entity.ts`, `memory.service.ts` `RecordTurnArgs`) mais texte libre borné à 2000 caractères/20 lignes, pas structuré par catégorie | retenu | Le résumé distinguera une section « Décisions prises » nommée |
| 1955.25 | Résumé — objets concernés | F | PARTIEL — idem, catégorie non nommée séparément | retenu | idem, section « Objets concernés » |
| 1955.26 | Résumé — actions en attente | F | PARTIEL — idem | retenu | idem, section « Actions en attente » |
| 1955.27 | Résumé — corrections | F | PARTIEL — idem | retenu | idem, section « Corrections » |
| 1955.28 | Résumé — questions ouvertes | F | PARTIEL — idem | retenu | idem, section « Questions ouvertes » |
| 1955.29 | Résumé — sources principales | F | PARTIEL — idem | retenu | idem, section « Sources principales » |
| 1955.30 | Résumé visible à l'écran | F | ABSENT — le résumé sert en interne au prompt (chat-context.service.ts:27,130,490) ; aucune UI trouvée qui l'affiche au commercial | retenu | Un commercial verra le résumé du fil dans l'écran `/chat` |
| 1955.31 | Résumé corrigeable | F | ABSENT — condition sur 1955.30, aucun endpoint d'édition trouvé | retenu | Un commercial éditera le texte du résumé affiché |
| 1944.1 | Utilisable à une main | A | PARTIEL — composeur bien placé, historique inaccessible | retenu | Voir 1944.4 |
| 1944.3 | Suggestions sur ligne défilable | A | LIVRÉ — `Chat.tsx:1387-1396` → ROUVERT 13/09 (PARTIEL, vérification déjà-là) : `Chat.tsx:1287` (amorces si `messages.length > 0`) → `:1816-1817` (`flex-nowrap overflow-x-auto`) ; fil vierge `:1957` (`grid-cols-1`), `:1902` (`flex-wrap`) | retenu | Fenêtre à 390 px, `/chat` sur un fil entamé : les amorces tiennent sur une ligne qui défile horizontalement. |
| 1944.5 | Boutons suffisamment grands | A | NON PROUVÉ | retenu | À mesurer |
| 1944.6 | Safe areas | A | LIVRÉ (héritage `MobileTabBar.tsx:36`) → ROUVERT 13/09 (PARTIEL, vérification déjà-là) : `apps/web/index.html:9` (`viewport-fit=cover`), `:17` (`black-translucent`) → `MobileTabBar.tsx:29,36` (`env(safe-area-inset-bottom)` en mode installé) ; aucun `safe-area-inset-top` | retenu | App installée sur iPhone à encoche : la barre d'onglets n'est pas recouverte par la barre d'accueil ; regarder le haut, où rien ne réserve la barre d'état. |
| 1944.7 | Clavier virtuel | A | NON PROUVÉ | retenu | À tester sur appareil |
| 1944.8 | Pièces jointes (mobile) | A | NON PROUVÉ | retenu | À tester |
| 1944.9 | Scope (mobile) | A | NON PROUVÉ | retenu | À tester |
| 1944.10 | Actions à valider (mobile) | A | NON PROUVÉ | retenu | À tester |
| 1944.11 | Messages longs (mobile) | A | NON PROUVÉ | retenu | À tester |
| 1944.12 | A11y : navigation clavier | A | NON PROUVÉ | retenu | À tester |
| 1944.13 | A11y : focus visible | A | NON PROUVÉ (spécifique chat) | retenu | À tester |
| 1944.15 | A11y : contraste | A | NON PROUVÉ (spécifique chat) | retenu | À mesurer |
| 1944.16 | A11y : reduced motion | A | PARTIEL — couvre seulement `TypingIndicator`, pas les `motion.div` d'entrée | retenu | Étendre le repli aux animations d'entrée |
| 1944.17 | A11y : ordre logique | A | NON PROUVÉ | retenu | À tester |
| 1944.19 | A11y : aucune info uniquement par couleur | A | NON PROUVÉ | retenu | À vérifier |
| 1944.20 | Perf : chargement progressif de l'historique | A | NON PROUVÉ | retenu | À mesurer |
| 1944.21 | Perf : pas de blocage sur logos/sources | A | NON PROUVÉ | retenu | À mesurer |
| 1944.23 | Perf : utilisable réseau lent | A | NON PROUVÉ | retenu | À mesurer |
