# Reprise — 14/09/2026, soir

> Remplace `reprise-2026-09-14.md` et `manifeste-2026-09-14.md`. Lire CELUI-CI d'abord.

## 1. L'état de la production

**`origin/main` = `ffcfb598f`** (merge #2000). Avant lui : `841e54683` (merge #1999,
intégration A — Laura conversation, #1991/#1988/#1990/#1986), déployé sur api ET ia en 200 s.

#2000 = outillage + une garde, **zéro surface de production** : `portee.py` (3 faux positifs
de FONDATION corrigés), `test_portee.py` (clone superficiel), et la garde
`api-response-fields-are-read.spec.ts` — le symétrique manquant de `wired-write-paths`.
Cette garde a trouvé **un défaut inconnu dès sa première passe** : `action-os:currentStepKey`
(#1943), inscrit au cliquet avec les deux de #1998.

## 2. Ce qui est POUSSÉ et attend son intégration

| Branche | SHA | Sujet | État |
| --- | --- | --- | --- |
| `fix/web-nom-fournisseur-sources-1912-11` | `ad4ccd249` | #1912.11 — plus aucun nom de fournisseur privé à l'écran | poussée, dans l'intégration C |
| `fix/1995-laura-contact-id` | `8ba95252a` | #1995 — le `contact_id` voyage jusqu'au modèle | poussée, dans l'intégration C |
| `worktree-agent-a4d9f060909db0e31` | `d7ad9159b` | #1956 — clôture des blocs RAG (`fence()`) | poussée, dans l'intégration C |
| `worktree-agent-a0183b0047d024116` | `ecd79aad1` | #1959 — auteur d'une dépêche | ⚠️ **JAMAIS POUSSÉE**, n'existe que sur ce disque |

## 3. Le verrou est levé — c'est le fait le plus important de la journée

Le cadrage du matin concluait : « ~380 points cadrés, **2 lots seulement** sont écrivables
sans toucher #1999. Le corpus est un goulot, pas une file. » **#1999 est mergé.** Les douze
lots marqués « BLOQUÉ PAR #1999 » (sujets B et C, 259 points) sont **libres**.

Ils se chevauchent sur `bellum_advisor.py` : le découpage qui tient est **par FICHIER**,
pas par sujet.

## 4. Défauts de production ouverts

- **#1998** — l'API calcule, gouverne et renvoie `context.cards`, **aucun écran ne le lit**.
  8ᵉ occurrence du défaut n°1. Bloque 44 points du sujet E.
- **Le vocal est VIVANT en production** — `GET /ia/chat/voice/status` rend `{"available": true}`,
  donc `TRANSCRIPTION_API_KEY` EST posée. De l'audio d'utilisateur est conservé **30 jours**
  pendant que la **pièce RGPD** reste due. À remonter à Louis, ce n'est pas un détail de recette.

## 5. Les deux décisions PARQUÉES (elles attendent Louis, elles ne se tranchent pas seules)

1. **Écriture RÉELLE d'un stade CRM** depuis un compte rendu de rendez-vous (lot B0).
   Écriture sortante chez un tiers → **arrêt obligatoire §10**.
2. **Analytique produit** — la relecture juridique RGPD, **reportée trois fois** (08/09, 10/09,
   11/09). Les trois pièces dues : base juridique, registre des traitements, politique de
   confidentialité. Aucune ne se code. Le traceur tourne pendant ce temps.

## 6. Pièges payés aujourd'hui

- ⚠️⚠️ **J'ai grepé ma copie de travail, 34 commits en retard sur `origin/main`.**
  `grep -c` rendait **0** là où `git show origin/main:<f> | grep -c` rend **4** : j'ai failli
  déclarer une amputation de fusion sur du code parfaitement livré. Le zéro ne ressemblait pas
  à une panne, il ressemblait à une réponse.
  **Réflexe** : `git rev-list --count HEAD..origin/main` avant tout grep dont un statut dépend.
- ⚠️ `rc=0` après un pipe : `git grep … | head` rend le code de sortie du PIPE. Deux fois.
- ⚠️ Un rapport d'agent **invalidé à la vérification** : « le crédit réservé n'est jamais
  consommé ni remboursé » était FAUX — `credits.service.ts` importe bien `CreditReservationService`.
  Son `grep -c` comptait les littéraux `'consumed'`. Une alerte « argent » serait partie pour rien.
- ⚠️ Un défaut d'INTÉGRATION sur #1999 que **ni l'une ni l'autre branche n'avait seule** :
  un scénario venu d'une branche, la garde qui exige ses métadonnées venue d'une autre.

## 7. Recette live du 14/09 — prod `ffcfb598f`

Portée : régime **FONDATION** (#1999 touche `action-router.ts`) → les 59 routes.
**57 routes balayées, ZÉRO anomalie** : aucune erreur à l'écran, aucun débordement
horizontal (`scrollWidth > clientWidth`), aucun 4xx/5xx.

⚠️ **Les 7 pages « maigres » ne sont PAS des défauts** — piège évité de justesse.
`/pilotage/qualite` (311 c), `/rfp` (392 c), `/team` (654 c), `/pilotage/energie` (984 c),
`/search` (1 080 c), `/propositions` (1 204 c), `/pilotage/rex` (1 540 c) ressemblaient à
des « zéros de chargement ». Deux mesures les ont disculpées :
1. **Re-mesure à 9 s au lieu de 2,6 s : compteurs IDENTIQUES.** Un zéro de chargement
   bouge avec le temps d'attente ; ceux-ci non.
2. **Lecture du contenu réel** : `/pilotage/qualite` porte ses cinq sections (« Les huit
   contrôles », « 4 contrôles à traiter », « Doublons à arbitrer ») ; `/rfp` son import
   et son AO analysé ; `/team` ses six blocs. **Maigre ≠ vide.**

Seul `/dashboard` a bougé (1 068 → 1 492 c) : lui était bien un zéro de chargement partiel.

**Restent 2 routes non balayées** (extension Chrome déconnectée en cours de route) :
`/settings/profile/index` et `/onboarding/*`. À finir à la reprise.

## 8. En vol au moment de la coupure

| Lot | Branche | Sujet |
| --- | --- | --- |
| intégration C | `integration/capacites-c` | assemble les 4 lots poussés du §2 |
| C-5b | `feat/c5b-ton-clarification-specificite` | ton, clarification, règle POSITIVE de spécificité dans le juge, rang DataForge |
| C-5a | `feat/c5a-outreach-objectif-et-angle` | les 9 objectifs de prise de contact + angle alternatif |
| C-1 | `feat/c1-memoire-du-fil` | résumé de fil structuré, `find_accounts` qui AFFINE |

⚠️ Aucune n'était poussée à la coupure. `git fetch` puis vérifier avant de relancer
quoi que ce soit — **ne pas re-dispatcher un lot déjà fait**.

⚠️ **Load mesuré à 31 sur 12 cœurs** avec 4 suites vivantes. Tout verdict de test arrivé
dans cette fenêtre parle de la MACHINE : le relancer SEUL avant de le croire.

## 9. Deux pièges d'outillage payés ce soir

- ⚠️ **`ps ax -o comm | grep -c 'vitest'` rend 0 pendant que 4 suites tournent** : `comm`
  tronque à 16 caractères, on n'y voit que `node`. Passer par `-o args`.
- ⚠️ **Deux artefacts publiés sont MORTS** — `4aef274b-…` (13/09) et
  `4a5220b7-…` (14/09) rendent « artifact not found », et n'apparaissent dans AUCUN
  listing (`scope: "all"`, `limit: 50` → 11 artefacts, le plus récent du 08/09).
  La publication rend une URL puis l'artefact disparaît, **sans erreur au publish**.
  Le suivi Laura vit donc dans le REGISTRE (`.claude/notes/registre-2026-09-12.md`),
  pas dans l'artefact, tant que ce n'est pas réglé.

## 10. Le registre, mesuré ce soir (script, pas relecture)

**1166 points** = 741 `retenu` + 285 `écarté` + 72 `recetté` + 55 `livré` + 13 `reformulé`.
Somme vérifiée.

⚠️ **Aucune transition n'a été écrite pour les lots du §2** : ils sont POUSSÉS mais
**pas mergés**. Les marquer `livré` serait précisément le comptage faux que ce dépôt
traque. La transition se fait à l'atterrissage de l'intégration C, pas avant.

---

# ÉTAT FINAL DE LA SESSION — à lire en premier à la reprise

## `origin/main` = `176504af1` — VERT, mesuré

Chaîne de la soirée : `841e54683` (#1999) → `ffcfb598f` (#2000) → `176504af1` (#2092).

⚠️⚠️ **`ffcfb598f` a été ROUGE pendant ~1 h et personne ne pouvait le voir.**
La CI ne tourne que `on: pull_request` : un `main` rouge ne publie aucun check, il se
découvre sur la PR suivante, chez quelqu'un qui n'y est pour rien. Cause et correctif
au §12. Vérifié vert après #2092 : `api-response-fields-are-read` 22/22 `rc=0`.

## 11. Les branches poussées, prêtes à intégrer

| Branche | SHA | Sujet | Dans une PR ? |
| --- | --- | --- | --- |
| `integration/capacites-c` | `0d602650a` | **PR #2093 (brouillon)** — assemble les 4 lots ci-dessous | oui |
| `fix/web-nom-fournisseur-sources-1912-11` | `ad4ccd249` | #1912.11 — aucun nom de fournisseur privé à l'écran | dans #2093 |
| `fix/1995-laura-contact-id` | `8ba95252a` | #1995 — le `contact_id` atteint le modèle | dans #2093 |
| `worktree-agent-a4d9f060909db0e31` | `d7ad9159b` | #1956 — clôture des blocs RAG | dans #2093 |
| `worktree-agent-a0183b0047d024116` | `ecd79aad1` | #1959 — auteur d'une dépêche | dans #2093 |
| `worktree-agent-a52c5498f0d633986` | `e6c0ba83f` | **#1998 — les cartes d'Action OS enfin rendues** | **non** |
| `feat/c5b-ton-clarification-specificite` | `fe9923b84` | ton, clarification, règle positive du juge, gate 5 comptes | **non** |
| `feat/c5a-outreach-objectif-et-angle` | `3ada6a808` | golden persona × contexte (#1926.32) | **non** |
| `feat/c1-memoire-du-fil` | `86982a5a5` | résumé de fil borné par ÉLÉMENT | **non** |

## 12. ⚠️ LE PIÈGE À CONNAÎTRE AVANT DE TOUCHER À #2093

**#2093 corrige le MÊME défaut que #2092, autrement.** Deux corrections concurrentes du
même fichier `api-response-fields-are-read.spec.ts` :

- **#2092 (mergée, celle qui tient)** : le parent n'est exigé que s'il DÉPARTAGE, et
  l'ambiguïté se **mesure sur le corpus** (`isAmbiguous` = un nom porté par plus d'un
  champ surveillé).
- **#2093 (`f29b1322e` + `63478239f`, à RETIRER)** : heuristique snake_case vs camelCase.
  C'est un proxy de convention de nommage, pas la raison réelle — un champ snake_case
  ambigu y passerait à tort. Son auteur écrit lui-même « NON prouvé sur
  `context.cards`/`turn_id` ».

**À faire à la reprise** : rebaser #2093 sur `176504af1`, **garder la version de `main`**
sur ce fichier, retirer les deux commits de correction de garde. Le reste de #2093 est bon,
y compris sa 2ᵉ trouvaille : la migration de #1959 portait un horodatage ROND
(`1793100000000`), renommée `1793108734561` — jamais déployée, donc sans risque.

## 13. Registre — mesuré après réconciliation

**1166 = 701 `retenu` + 285 `écarté` + 95 `livré` + 72 `recetté` + 13 `reformulé`.** Somme ✓.

**40 points passés `retenu → livré`**, chacun sur preuve `fichier:ligne` **+ son appelant**
+ sa preuve en recette. Matériau complet :
`<scratchpad>/reconciliation-1999.md`.

⚠️ **`1961.21` a été EXCLU délibérément** : l'agent le proposait `livré`, mais son propre
rapport dit que le lien de fiche « n'est lu par AUCUN composant `.tsx` » — il n'atteint
l'écran que si le modèle recopie l'instruction du prompt. Le marquer livré fabriquerait
exactement le défaut n°1 du dépôt. Il reste `retenu`.

⚠️ **114 points restent « À VÉRIFIER »** (trace de code présente, appelant non tracé un par
un) et **297 n'ont aucune trace de code** — tous laissés `retenu`. Le registre est
volontairement PESSIMISTE : un point livré compté `retenu` coûte une vérification, un point
`retenu` compté livré coûte une régression annoncée comme un succès.

## 14. Ce qui reste dû, nommé

- **2 routes non balayées** : `/settings/profile/index`, `/onboarding/*` (extension Chrome
  déconnectée en cours de balayage). 57/59 vues, zéro anomalie.
- **Entrée de changelog** pour le lot C-5b (la clarification est user-facing ; le registre
  vit dans `packages/contracts/src/changelog/`, hors de son périmètre).
- **KNDS** absent du gate d'évaluation : aucun fait vérifiable dans le dépôt, et l'écrivain
  a refusé d'en inventer un — dans le gardien des chiffres inventés, c'eût été la faute
  qu'il traque. Gate à 5 comptes (Doctolib, SG, Thales, SNCF, Decathlon).
- **Les 6 objectifs de prise de contact différés** (#1926.11-.15, .17) : la taxonomie vit
  dans `message_brief.py`, hors périmètre du lot.

## 15. Les deux décisions qui attendent LOUIS (elles ne se tranchent pas seules)

1. **Écriture RÉELLE d'un stade CRM** depuis un compte rendu (lot B0) — écriture sortante
   chez un tiers, **arrêt obligatoire §10**.
2. **Relecture juridique RGPD de l'analytique produit** — reportée **trois fois** (08/09,
   10/09, 11/09). Les trois pièces dues, dont aucune ne se code : base juridique, entrée au
   registre des traitements, paragraphe de la politique de confidentialité.
   ⚠️ Et **le vocal est VIVANT en production** (`voice/status` → `{"available": true}`) :
   de l'audio d'utilisateur est conservé 30 jours pendant que cette pièce reste due.
