# Reprise — 14/09/2026, après-midi

> Remplace `reprise-2026-09-14-midi.md`. Lire celle-ci d'abord.

## 1. Ce qui est TRANCHÉ — et qu'on ne repose pas

**Quatre décisions de Louis, prises le 14/09 après-midi.** Le détail, mot pour mot, avec ce que
chacune ne lève PAS : **`.claude/notes/decisions-2026-09-14-soir.md`**. En une ligne chacune :

1. **Page 0 d'onboarding** : #2086 gagne, son titre « V3 » est renommé, #2013 est close en renvoyant
   vers lui.
2. **`/welcome`** : on branche la mémoire marché pour que les suggestions restent pleines sans
   qu'aucun nom ne soit inventé. **Lot pas encore dispatché.**
3. **#1946 analytique produit** : **débloqué**, contre la recommandation. ⚠️ La relecture juridique
   RGPD reste **due**, et les cinq règles de `c64_analytique_produit` tiennent toutes.
4. **Facturation** : les quatre issues sont ouvertes, **sans aucune écriture Stripe ni crédits** —
   Louis valide chaque écriture facturable avant qu'elle parte.

Décisions plus anciennes toujours en vigueur : `.claude/notes/decisions-2026-09-12.md`,
`decisions-louis-2026-09-10-soir.md`.

## 2. Ce qui est MERGÉ mais pas encore recetté

- **`origin/main` = `b8e432a7a`** (merge de la PR **#2140**, intégration H : #1945.3 golden set +
  #2004 contrainte d'onboarding).
- ⚠️⚠️ **L'API ne sert pas encore ce commit.** Mesuré à 14:01 : `api=540b24c3b`, `ia=b8e432a7a`,
  **30 minutes après le merge**. L'API répond `200` en 108 ms — **ce n'est pas une panne**, c'est
  l'ancien code qui sert. Le diff api de ce merge est minuscule (la migration
  `1793583494449-OnboardingStatusStates.ts` et une garde), et **rien n'écrit encore les neuf valeurs
  nouvelles** : l'impact d'attendre est nul.
  **Ne PAS recetter #2140 tant que `api` n'a pas basculé** — ce serait du front neuf sur API
  ancienne, et ça invente des pannes.
  Sonde en fond : `<scratchpad>/sonde-deploy.sh b8e432a7a`.
  ⚠️ `/version` se lit **en JSON**, jamais en `grep` : `ia.commit` est imbriqué dans la réponse de l'api.
  ⚠️ Si Louis dit que ce n'est pas déployé, **c'est lui qui a raison** : il a la console sous les yeux.

## 3. Ce qui est POUSSÉ et attend une intégration

| branche | SHA | fichiers | contenu |
| --- | --- | --- | --- |
| `profiler-anti-hallucination` | `29e521b79` | 2 | #2063/#2064 — le prompt du Profiler interdit la probabilité et NOMME les contradictions au lieu de les trancher en silence. Garde `test_profiler_prompt_doctrine.py`, 9 tests, les 3 preuves. |
| `idempotence-generation-profil` | `9b751eb73` | 3 | #2009 (audit) puis #2008 — le doublon prouvé : `PUT /esn-profile` payait le modèle **deux fois** par requête. Clé d'idempotence posée **synchroniquement**, avant tout `await`. |
| `profiler-charge-utile` | `03c120283` | 6 | #2007 — `OnboardingAnswers` passe de 10 à 35 champs. Preuve bout-en-bout écrivain→lecteur fournie. |
| `golden-set-multi-persona` | `7b245215c` | 17 | #2070 + #2085 **fusionnés** (c'était un doublon d'artefact) — 16 cas, 177 tests verts, les 3 preuves de garde. |

→ Ces quatre partent en **intégration J**. Aucune ne touche les mêmes fichiers qu'une autre.

**Intégration I** (agent en vol au moment d'écrire) assemble six branches :
`corpus-canonique-1948b`, `garde-1945-enum-complete`, `contact-id-et-date-courante`,
`jamais-refuser-en-bloc`, `intentions-hors-liste-fermee`, `l6-repaint-ux-onboarding`.

**Cinq écrivains en vol** : L11 page de restitution (#2071-#2075), constats courts (#2136 + la
cloche), #1946 analytique produit, entitlement et grille tarifaire (#2002/#2003/#2014), et
l'intégration I.

## 4. Ce qui n'a JAMAIS pu être vérifié — nommé comme tel, jamais compté comme fait

- **La recette de #2140** — bloquée par le retard de l'API (§2).
- **Le mobile** — impossible depuis un navigateur piloté : `resize_window` réussit et ne sert à rien
  (la FENÊTRE rétrécit, la PAGE non). Se mesure au `javascript_tool` et se déclare **NON VÉRIFIÉ**.
- **#1952.38 / #1959.18, l'idempotence** — ⚠️ **statut corrigé le 14/09 : c'est `LIVRÉ`**, pas « non
  recettable ». Chaîne complète prouvée par un vérificateur : `gesture-idempotency.ts:156-168` →
  `PendingActions.tsx:544-550` et `ActionCenter.tsx:771-772` → `POST /actions/dispatch`
  (`action-router.controller.ts:29-34`) → `dispatchIdempotent` (`action-router.service.ts:340-365`),
  qui insère une réclamation sous contrainte SQL unique `(workspace_id, idempotency_key)` **avant**
  tout effet. Le geste de repli (« Programmer le rappel ») est jouable. **Reste à JOUER en recette.**

## 5. Les trois constats de recette de ce matin : tous PÉRIMÉS

Un vérificateur les a re-mesurés contre `origin/main` = `b8e432a7a`. **Les trois correctifs sont
datés du 14/09 et déjà mergés** — les constats portaient sur un état antérieur.

- **Carte Verdict jamais émise** → corrigé par `23776777c` : les quatre gabarits concurrents sont
  arbitrés en une règle unique (`bellum_advisor.py:785-802`, « UN SEUL FORMAT PAR RÉPONSE »), et la
  garde d'ÉMISSION existe (`test_copilote_verdict_card_eval.py`, rejoue `chat_verdict.audit_answer`
  sur un corpus committé, refuse nommément `production_2026_09_14_thales`).
- **Bulle Laura facturée en démo** → corrigé par `815e689ad` : `ia-proxy.controller.ts:848-852`
  teste `isDemoWorkspace` **avant** `assertChatQuota` et avant tout `chatStream`. Le test au titre
  trompeur est corrigé dans le même commit (`chat-daily-quota.spec.ts:141-154`, assertion réelle
  `expect(ia.chatStream).not.toHaveBeenCalled()`).
- **Idempotence** → voir §4, c'est `LIVRÉ`.

**La leçon, payée une fois de plus** : un constat de ce matin est déjà périmé.
`git merge-base --is-ancestor` tranche en une seconde.

## 6. Ce qui RESTE — le corpus, cadré

**191 issues ouvertes, 9 écrans.** Trois documents de cadrage, tous écrits, tous avec leurs sommes
vérifiées :

| Document | Périmètre | Issues | Demandes | Lots |
| --- | --- | --- | --- | --- |
| `.claude/notes/lots-chat-2026-09-14.md` | `/chat` | 62 | **1 051** | 18 |
| `.claude/notes/lots-ecrans-restants-2026-09-14.md` | `/accounts`, `/briefing`, `/dashboard`, `/mailbox`, `/discover` | 39 | **2 170** (dont 114 en double) | 14 |
| `.claude/notes/lots-onboarding-questionnaire.md` | questionnaire d'onboarding | 47 | **600** | 19 |
| `.claude/notes/lots-onboarding-audit.md` | audit moteur, entitlement, garde-fous | 32 | — | 13 |

**Les verrous de fichiers qui commandent l'ordre** — ce n'est pas la valeur métier qui décide :

- `/chat` : **`Chat.tsx` (2 726 lignes) est monté par 12 des 18 lots.** Lot 1 en premier, seul. Puis
  `chat-context.service.ts` (lot 2), puis `bellum_advisor.py` (lot 3), puis `chat_tools.py` (lot 4).
  Le reste part en parallèle. Le lot 16 (golden set) **en dernier** : il consomme les décisions des
  dix-sept autres.
- `/briefing` : **`BriefingPage.tsx`** reçoit 11 des 15 issues, et contient `NowStrip` et
  `ThreadGroup` **en local**. Un seul lot à la fois.
- `/accounts` : **`AccountDetailTabsBar.tsx`** bloque E3/E4/E5/E6.
- onboarding : **L6 repaint UX en premier** — il atterrit dans l'intégration I.

**Les constats courts prêts à partir tout de suite** (prouvables, dix minutes, réponse à l'auteur le
jour même) : #1994 et #2001 (partent avec le lot 1 de `/chat`), #2136 + la cloche (en vol).

## 7. Les pièges d'outillage payés DANS CE LOT-CI

Trois **nouveaux**, tous rendus `rc=0`, tous à ajouter au §11 du profil :

- **`grep` est aliasé sur `rtk grep`** dans ce shell : un `grep -rn … | head` a rendu **l'aide de
  `rtk`** avec `rc=0`. Idem **`ls`**, qui a rendu une **sortie vide avec `rc=0`** sur un répertoire
  de 100 entrées — vu deux fois aujourd'hui. → `/usr/bin/grep`, `/bin/ls`, `/usr/bin/find`.
- **`--include=*.tsx` non quoté sous zsh** → `no matches found`, **`rc=0`**, zéro résultat.
  → `--include='*.tsx'`.
- **`apps/ia/.venv/` pollue massivement** toute recherche (langchain embarque `create_draft_message.py`).
  `--exclude-dir=.venv` est **obligatoire**, pas optionnel.

Plus deux déjà connus, re-payés aujourd'hui :

- **`gh pr merge` sur une PR en DRAFT rend `rc=0` derrière un `tail`** : le merge avait échoué
  (« Pull Request is still a draft ») et la sortie ressemblait à un succès. → `gh pr ready` d'abord,
  et **prouver par le contenu sur `origin/main`**, jamais par la sortie de `gh`.
- **Les agents `Explore` n'ont AUCUN outil d'écriture** : deux éclaireurs à qui on avait demandé
  d'écrire un fichier ont rendu leur plan dans le fil. C'est l'orchestrateur qui doit l'écrire.
  → soit accepter le rapport dans le fil, soit passer par un agent qui écrit.

## 8. La machine

Plafond mesuré : **5 écrivains** sur 12 cœurs à `--maxWorkers=2`. Les éclaireurs en lecture seule ne
comptent pas. `uptime` relevé en fin de vague : **12,32** — au plafond, ne pas élargir.
⚠️ Le seuil ne prévient pas : tant qu'il reste de la mémoire un agent de plus va deux fois plus
vite, puis tout ralentit d'un ordre de grandeur en même temps, et les suites rendent des faux rouges.

**24 worktrees** au début de la session ; le nettoyage a été **refusé par le classifieur de
permissions** (`git worktree remove`). Neuf sont mergés et propres, donc retirables :
`deeplink-reverse-market`, `golden-tests-persona`, `constats-onboarding`,
`constats-mise-en-page-chat`, `backoffice-espace-a-risque`, `contact-nomme-survit-au-tour`,
`integration-f`, `integration-g`, `jobs-longs-visibles`.
⚠️ **`refusion-voix` porte 113 fichiers non commités — NE PAS le retirer.**
