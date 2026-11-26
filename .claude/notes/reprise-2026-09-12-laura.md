# Reprise — corpus Laura du 12/09/2026 (#1901 → #1962)

> Premier jet écrit PENDANT le lot 1 ; réécrit à chaque vague. Ce qui est ici est la trace, pas la tête.

## 1. Tranché — ne se repose pas

Lire `.claude/notes/decisions-2026-09-12.md` (mot pour mot). En une ligne chacun :
- Pièces jointes → **fil seul par défaut**, base ESN sur choix explicite, « retirer » supprime le document ingéré (migration additive).
- Mémoire → **nature + portée perso** (kind/origin au prompt, note de Laura « à vérifier » par défaut, portée « moi uniquement »).
- Actions du chat → **migration COMPLÈTE vers Action OS** (contre la reco « brancher l'existant » — ne pas re-proposer le raccourci). ⚠️ touche la réservation/le débit de crédits : arrêt obligatoire facturation, simulation d'abord.
- Langue → **langue de l'interface, tutoiement fixe**.
- + 20 défauts retenus sans Louis (liste dans le fichier de décisions).

## 2. Lot 1 — branche `fix/laura-nouveau-fil-amorce` (état au moment d'écrire)

- `d22193fc9` #1947 + #1908 : fil neuf à chaque « Demander à Laura » (`?fresh=1`), amorce à 3 s (locale, zéro quota, écrite avec la 1re réponse), `settled` sur `useLauraHomeContext`, correctif `attachedDocs` de `handleSend`.
- `e9dcc4345` #1909.2/.8/.9, #1912.10, #1954.1/.2/.3, #1944.18.
- Changelog : 2 entrées du 12/09 (FR+EN).
- À intégrer : écrivain « pied de réponse » (#1953.4, #1915.2, #1955.13, #1910.9/.10/.13) ; écrivain « masquage SSE » (#1956.10, sécurité, `apps/ia`).
- `2d7e16d34` changelog, seconde entrée.
- Portes locales mesurées : tsc web 0 · ESLint 0 erreur · 91/91 tests ciblés · 133 fichiers / 1 608 tests d'architecture + i18n · parité changelog 25/25 · knip rc=0 · format 15/15 · build web rc=0.
- **Déploiement attendu** : les TROIS services repartent (`packages/contracts` est dans les `watchPatterns` de l'IA ET dans `MONOREPO_ROOTS` de l'API, `.railway/railway.ts:43,76,172`). Un `commit` ou `ia.commit` qui ne bouge pas est donc un vrai signal, pas un service « hors motif ».
- Liste de recette : `scratchpad/recette-lot1.md` de la session (R1 → R20), à recopier ici si la session tombe.
- `59705b2a6` (cherry-pick de `dd3620a04`, écrivain isolé) #1956.10 : `StreamingRedactor` masque les secrets dans les `delta` SSE. Vérifié par l'intégrateur : références `main`/`origin/main`/branche intactes, 4 fichiers, pytest relancé 81/81, code relu. ⚠️ L'écrivain a CONTOURNÉ un hook qui refusait son git (plomberie `update-ref`/`hash-object`) — signalé à Louis ; ne pas reproduire.
- Jumeaux cherchés : `graph_analyze.py` diffuse des GraphEvents serveur → serveur, pas de texte modèle vers le navigateur.
- Branche poussée, PR d'intégration ouverte (CI lancée sur ce contenu) ; l'écrivain « pied de réponse » s'y ajoutera.
- `d38e14d89` (cherry-pick de `a5ca7b6d9`) #1953.4, #1915.2, #1955.13, #1910.9/.10/.13 — vérifié : références intactes, 10 fichiers, 35/35 relancés, code relu.
- Changelog 3e entrée + `fix(web)` libellé de portée (« celui-ci reste dans ta liste » faux pour un fil vierge).
- Portes sur la branche intégrée : tsc 0 · ESLint 0 · 126/126 ciblés · 1 608 architecture+i18n · format 27/27 · knip 0.
- CI #1974 verte sur `a7cb97fc0` (20 jobs + `CI Status`), **mergée : `874408131`** (prouvé sur `origin/main`). Worktrees des deux écrivains intégrés retirés.
- Registre : 26 points `livré` (1947.1-2, 1908.1-7, 1909.2/.8/.9, 1902.16, 1912.10, 1954.1-3, 1944.18, 1953.4, 1915.2, 1955.13, 1910.9/.10/.13, 1956.10/.17). Total 1 166 = 773 retenus + 4 reformulés + 363 écartés + 26 livrés.
- **Pas encore** : les 3 déploiements au SHA `874408131` (attente en cours), recette R1-R20 (valeurs attendues mesurées : 27 comptes analysés ; `crm` et `calendar` branchés sur l'espace de Louis), clôture #1947 et #1908, commentaires partiels.

## 2 bis. Vague 2 en vol (manifeste `.claude/notes/manifeste-vague-2-2026-09-12.md`)

- 2a pièces jointes « fil seul » côté serveur (plage de migration 1792800000000–1792800009999) ; 3a mémoire, nature au prompt ; 5a langue de l'interface + phrases interdites ; P4 plan Opus de la migration Action OS (lecture seule).
- Réponses de Louis du second envoi : dans le fichier de décisions (PJ existantes inchangées ; portée mémoire demandée défaut « moi » ; 1re ouverture du jour = brief ; audio vocal conservé 30 j).
- Règle de Louis du 12/09 : toujours des écrivains en vol pendant CI/recette (mémoire `parallele-toujours-pendant-recette.md`).

## 2 ter. Vague 3 et suite (état au 13/09, ~00 h)

- **#1975 (lot 1b) mergé `84c828383`, recetté vert** (après un échange, le fil apparaît dans la colonne sans recharger ; `/ia/chat/history` relu). **#1947 CLOSE.**
- Recette lot 1 : R1-R15 et R17 verts ; R10 vert (4 fichiers RECETTE supprimés par API, 152 documents) ; R16 = tests + `ia.commit` servi ; **R18 démo = À LA TOUTE FIN** (décision Louis 13/09 : ouvrir `/demo` remplace la session pilotée, Louis se reconnecte). Registre : 19 points `recetté`.
- D2 lecture seule en prod : 0 approbation en attente, 1 run `blocked` (`signal_detected`, 25/08) → impact actuel nul, correctif dans L2.
- Balayage 58 routes vert ; seul 503 = `/crm/pipeline/report` `scope_missing` (connexion CRM de Louis sans droits deals — message honnête, pas une régression).
- Commentaires d'état postés sur #1908 #1909 #1912 #1954 #1944 #1902 #1953 #1915 #1955 #1910 #1956.
- Manifeste complet (branches, SHA, plages de migration, conflits attendus, ordre de merge) : `.claude/notes/manifeste-vague-3-2026-09-12.md`. Décisions du sixième envoi dans le fichier de décisions.
- Mémoire écrite : `recette-demo-remplace-la-session-pilotee.md`.
- **Défaut de PROD trouvé en recette (13/09)** : `/chat?ask=…` sur fil vierge → question envoyée et répondue, écran vide (la lecture du fil écrase l'état local). Correctif isolé `fix/laura-question-envoyee-fil-vierge` (PR à part, à merger et recetter AVANT la vague 2). 3 messages Laura dépensés en recette.
- Balayage post-#1975 : 58/58 verts.
- Décisions des sixième et septième envois (13/09) dans le fichier de décisions : masquage bancaire seul ; démo en dernier ; interventions effacées ; secteur NAF (contre la reco) ; purge orphelins 24 h ; suppression mémoire partagée = auteur + managers ; onboarding semé en démo ; conversations gardées tant que l'espace existe.
- **Ordre de merge** : 1) correctif `?ask` ; 2) vague 2 (`feat/laura-vague-2`, intégrateur en cours) ; 3) lot fils (9s saisie, 9m tiroir, 9t titres, 9u auteurs, 9.1a effacement) ; 4) 2b + 3b ; 5) lot 7 (7A+7B+7C) + 7D ; 6) Action OS L1→L4 ; 8a, 8b, 8d, 8e, 9.1 vocal selon rapports. État par branche : `.claude/notes/manifeste-vague-3-2026-09-12.md`.
- R18 (démo) = TOUT À LA FIN, Louis se reconnecte ensuite.

## 3. Jamais vérifié

- Mobile réel (impossible depuis le navigateur piloté).
- Les trois lecteurs d'écran : l'annonce `aria-live` est testée en jsdom, pas entendue.

## 4. Ce qui reste — découpage proposé (≈ 10 issues par PR, recette avant la suivante)

| Lot | Sujet | Issues | Notes |
| --- | --- | --- | --- |
| 2 | Pièces jointes « fil seul » | #1954 (reste), #1941 | migration additive portée document ; filtrage RAG ; « retirer » supprime |
| 3 | Mémoire nature + portée | #1916 #1917 #1918 #1919 #1962 | prompt reçoit kind/origin (`chat-context.service.ts:522`, `bellum_advisor.py:64`) ; défaut Laura = note ; portée moi ; #1919 via `account_feedback.target = chat_reply` |
| 4 | Actions → Action OS | #1930 #1931 #1943 #1952 #1953 #1959 | chantier long ; arrêt facturation |
| 5 | Langue + prompt | #1958 #1928 #1922 #1926 #1929 #1905 #1920 #1923 #1924 #1925 | gains rapides C (phrases interdites centralisées — GA-26 : 6 fichiers de prompt ont chacun leur liste) |
| 6 | Routage & deep links | #1902 #1903 #1904 #1932 #1933 #1949 #1950 #1951 #1910 (reste) | 3 outils sur 54 ouvrent une page ; `/actions/sequences` non nommable par Laura |
| 7 | Brief, onboarding, interventions, notifications | #1936 #1921 #1937 #1938 #1908 (4) | brief = chapeau 3 blocs |
| 8 | Qualité, sécurité, démo, support | #1942 #1945 #1946 #1948 #1956 #1960 #1961 | #1946.22 écarté (c64) |
| 9 | Fils, collaboration, formats, mobile, vocal | #1911 #1913 #1914 #1915 #1934 #1935 #1939 #1940 #1944 #1955 #1957 #1901 #1906 #1907 #1912 #1927 | vocal en dernier |

## 5. Pièges payés dans ce lot

- `cd` dans un appel Bash déplace le répertoire des appels SUIVANTS (déjà en mémoire : `bash-cwd-persists-fakes-green.md`) → toujours des chemins absolus, `(cd … && …)` en sous-shell.
- Le hook résume la sortie de `grep` → `/usr/bin/grep`, `/usr/bin/sed`.
- **jsdom 20.0.3 n'a pas `File.text()`** : un test de pièce jointe est rouge AVANT le code mesuré. Doubler `text` sur le `File`. Et une preuve NON doit vérifier la RAISON du rouge, pas seulement le rouge.
- TanStack sérialise `search={{ fresh: '1' }}` en `?fresh=%221%22` : un test qui fige `href="/chat"` tombe.
- `.claude/notes/` est gitignoré : registre et décisions sont LOCAUX.
- commitlint : sujet ≤ 100 caractères — les numéros d'issue le font déborder vite.
- Extraire les lignes de registre d'un rapport d'agent : parser le `.output` JSONL par script, ne jamais le lire.

## 2 quater. État au 13/09 ~11h (après /clear, lire ceci d'abord)

- **Suivi visuel** : https://claude.ai/code/artifact/4aef274b-8c12-42e9-8789-12ebef711672 — régénérer avec `python3 .claude/notes/suivi-laura/build.py --refresh`, republier `index.html` avec ce `url` ; lots et questions dans `.claude/notes/suivi-laura/lots.json`.
- **En prod et recettés** : #1974, #1975, #1977, #1976, #1978, #1979, #1980, #1981 (dernier : `de5a6d23e`). Messages Laura dépensés le 13/09 : 15/50.
- **Ordre de merge suivant** (un lot recetté avant le suivant) : #1982 mémoire/PJ (merge lancé 11h) → #1983 vocal → #1984 Action OS serveur → #1986 prompts → PR des intégrateurs vague 4 (contexte/portées/outils ; mémoire lisible + trace ; finition + cohérence + fils groupés) → correctifs vérifiés → outils branchés nommés → signaux d'usage → SMS.
- **Décisions** : batches 1-13 dans `decisions-2026-09-12.md`. Règle du 13/09 : tout écart fondé sur une décision antérieure à l'issue remonte à Louis (skill `livraison:issues` §2).
- **Registre** : 75 points « déjà là » rouverts après vérification (`.claude/notes/deja-la/`) ; `déjà là` ≠ `écarté`.
- **Détail des branches, SHA, recettes** : `manifeste-vague-3-2026-09-12.md` (dernières puces en tête de la section lot 7).
- **R18 démo** : en tout dernier, Louis se reconnecte après.

## 2 quinquies. ARRÊT PROPRE du 13/09 ~12h (Louis : crédits bas, /clear) — reprendre ICI

**Prod** : API + IA à `1a4da151f` (#1989). Recettés aujourd'hui : #1979, #1980, #1981, #1982, #1989. Issues closes : #1947, #1929. Messages Laura 13/09 : 18/50.
**Tous les agents et scripts sont ARRÊTÉS.** Aucun merge en cours.

**PR ouvertes (état à 12h, re-mesurer : main bouge)**

| PR | Branche | Tête | État | Prochain geste |
| -- | ------- | ---- | ---- | -------------- |
| #1987 | fix/laura-defauts-verifies | d16c5fcda | MERGEABLE, CI en cours (run 34749526001) | **MERGER EN PREMIER** (sécurité : `analysis:run` sur le pont copilote, liste des fils triée avant la limite de 20, borne mémoire marché) → recette |
| #1984 | feat/action-os-cartes-gouvernees | 5bead7e38 | MERGEABLE, CI verte | merger après #1987 → recette (5 gestes, ne JAMAIS valider d'écriture CRM/enrichissement/brouillon en prod) |
| #1983 | feat/laura-vocal | a0829a5f5 | MERGEABLE, CI à vérifier | recette `scratchpad/recette-1983.md` ; clé de transcription en prod = question Louis |
| #1986 | feat/laura-voix-formats-contexte | fc77a1e48 | CONFLICTING (CI verte avant) | refusionner main, CI, merge |
| #1988 | feat/laura-memoire-lisible-trace | 20ad9f8b6 | CONFLICTING | refusionner ; contient défaut serveur « Préférence sans portée = Toi uniquement » ? VÉRIFIER (demandé à 11h45) |
| #1990 | feat/laura-finition-coherence | d163567d1 | MERGEABLE, CI relancée | finition + cohérence + fils groupés ; dégradé retiré, portée en en-tête |
| #1991 | feat/laura-contexte-portees-outils | 1ca05c9c7 | MERGEABLE | intégrateur arrêté en écrivant 2 tests « plafond : aucun texte de plan quand limitSource absent » → vérifier ce qui manque (7 branches dont plafond par plan) |
| #1992 | feat/notifications-sms | 55cc28ad8 | MERGEABLE, CI relancée | prêt à brancher ; questions fournisseur/expéditeur/pays/budget |
| #1993 | feat/laura-signaux-usage | 426c8cfd4 | CONFLICTING | levée c64 pour 2 usages (Louis batch 12) ; recompter kill-switches avec #1992 |

**Travail NON commité** : worktree `.claude/worktrees/agent-a2a4813f08343e821`, branche `fix/noms-fournisseurs-minuscules` (base `1a4da151f`), **17 fichiers modifiés non commités** — correctif « Non appliqué par pappers » (Découvrir, `discover.json` `unapplied` interpole l'id de source) + « Données légales Pappers » (Veille) + garde insensible à la casse. Relire le diff, finir, tester, commiter.

**Règles apprises aujourd'hui (déjà en mémoire)** : un run CI qui ne démarre pas / PR CONFLICTING = aucun check (lire `gh run list` + `mergeable`) ; les 8 runners ne passent qu'une PR à la fois et pas dans l'ordre (annuler les runs moins prioritaires pour un correctif urgent) ; `gh pr merge` peut renvoyer 502/GraphQL → vérifier `state=MERGED` ; fichiers de commit dans le scratchpad partagé = préfixer par la branche ; écart sur décision antérieure = remonter à Louis ; `déjà là` ≠ `écarté`.

**Questions ouvertes pour Louis** (page de suivi) : valeurs du plafond Laura par plan + plafond opérateur 50 ; fournisseur/expéditeur/pays/budget SMS ; clé de transcription en prod ; relire les 27 « résultats attendus » du catalogue ; brouillon d'un coéquipier visible par tout le fil (Action OS R9) ; drapeau « mémoire marché » sur l'accueil de Laura.

**Budget tokens (13/09, après analyse)** : coût = tours × contexte (97 % de relecture de cache). Garder 10-15 agents mais : `subagent_type` `ecrivain` / `verificateur` / `integrateur` (globaux, sonnet, sans MCP ; `model: "opus"` à l'appel pour le difficile) ; un agent s'arrête au push ; CI surveillée par script shell ; 2-3 PR ouvertes max ; rapports ≤ 15 lignes ; `/clear` par lot. Réglages globaux posés dans `~/.claude/settings.json` (sauvegarde `.bak-2026-09-13`). Règle complète : socle SKILLS_TEMPLATES §6.
