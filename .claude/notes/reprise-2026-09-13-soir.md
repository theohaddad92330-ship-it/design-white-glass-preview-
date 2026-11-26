# Reprise — 13/09/2026 au soir (session de consolidation)

> Remplace `reprise-2026-09-12-laura.md` § 2 quinquies. Lire CELUI-CI d'abord.

## 1. L'état de la production

**`origin/main` = `2f1e5cf1e`**, servi par api ET ia (`curl -s https://api.bellum-ai.com/version`).
Contient #1987 (défauts vérifiés) et #1984 (Action OS — cartes gouvernées), mergés à 16 h 33 et 16 h 57.

## 2. Ce qui a été RECETTÉ ce soir — prod `2f1e5cf1e`

Portée calculée, pas devinée : `python3 tools/recette/portee.py 'b4c64cf72^1..2f1e5cf1e'`
→ régime **FONDATION** (`packages/contracts/src/schemas/action-router.ts` MODIFIÉ) → les 59 routes.

| | Verdict |
| --- | --- |
| #1961 — la mémoire marché borne sa limite ET LE DIT | **PASS** — « plus de 50 entreprises […] je ne peux pas en restituer 80 : l'outil est plafonné à 50 » |
| #1901.12 — les fils rangés par activité AVANT la coupe | **PASS** partiel, dit — 8/8 décroissant en prod ; la coupe à 20 prouvée hors prod (PG16 local, 25 fils, commit `4e366a4d1`) |
| Balayage 59 routes | **PASS** — zéro erreur, zéro débordement horizontal, zéro 4xx/5xx |
| #1912.11 — outils branchés nommés | **PASS** (re-vérifié) — les 8 noms de `/chat` sont les connexions de `/integrations`, conformes à D354 |
| #1956 — Laura ne lance rien sans le droit de l'écran | **NON VÉRIFIABLE** — le refus exige un rôle MOINDRE, Louis est propriétaire. À recetter avec un compte invité |
| #1984 — cartes de Laura gouvernées | **FAIL** → #1998 |

Registre : 1166 points = 758 retenus + 13 reformulés + 285 écartés + 40 livrés + 70 recettés. Somme vérifiée.
Messages Laura dépensés le 13/09 : **19/50**.

## 3. Les deux défauts de PRODUCTION ouverts ce soir

- **#1995** — Laura propose un rappel sur un contact **qu'elle ne peut pas identifier**. Le contexte
  porte les NOMS sans `id` (`chat-context.service.ts:247`) et **4 outils exigent un `contact_id` UUID**
  (`schedule_reminder_for_contact`, `prepare_message_for_contact`, `enrich_contact`,
  `export_contact_to_crm`) sans qu'aucun des **57** ne résolve un nom. ⚠️ Le point `1935.12` était
  rangé `écarté — LIVRÉ, déjà en place`, conclu en LISANT le code : `déjà là` ≠ `écarté`.
- **#1998** — l'API calcule, gouverne et renvoie `context.cards` (`ia-proxy.controller.ts:262,283`)
  et **aucun fichier de `apps/web/src` ne le lit**. Zéro run `copilot_proposal` en base depuis le merge.
  Laura produit le contenu exact d'une carte en PROSE (« Analyse proposée : 8 crédits ; il t'en
  restera 66 ») sans aucun bouton. **Huitième occurrence** de « du code juste que personne n'appelle ».
  La garde qui manque est le symétrique de `wired-write-paths.spec.ts` : **un champ de réponse d'API
  qu'aucun écran ne lit**.

Les deux se cumulent : tant que l'un tient, aucune carte ne peut apparaître, et **#1984 reste non recettable**.

## 4. Ce qui est en vol

| PR | Contenu | État |
| --- | --- | --- |
| **#1996** portée de recette | le script + sa garde | **MERGÉ** |
| **#1997** intégration B | #1993 signaux d'usage, #1992 SMS, #1983 vocal, #1912.11 | tête `d5f818acd` — la garde lexicale §55 est corrigée (deux constantes `FOURNISSEURS_PRIVES` / `REGISTRES_PUBLICS`), CI relancée |
| **#1999** intégration A | #1991, #1988, #1990, #1986 | tête `878659613`, **359 fichiers**, MERGEABLE, CI en cours |

**Vérifications faites (socle §5)** — les 4 branches sources sont **ancêtres** de `#1999`
(`git merge-base --is-ancestor`), donc réellement dedans ; l'écrivain de la garde n'a touché
qu'**un** fichier et a prouvé son NON en cassant volontairement la règle (mêmes 8 fautifs que le
rouge de CI). A a lancé les suites **complètes** : vitest web 9 702, jest api 12 616, contracts
4 395, pytest 7 087, toutes rc=0.

⚠️ **Une seule contradiction sémantique** dans toute la fusion A, et elle est à regarder à l'écran :
`MemoryLedgerView.tsx:134` rendait par **SECTION** sur `main` (#1916) et par **COUCHE** sur
`feat/laura-voix-formats-contexte` (#1928.9). L'intégrateur a gardé la structure de `main` et
**porté** la capacité — c'est le seul endroit où il a reconstruit au lieu de recoller.

⚠️ **Ce que A n'a PAS fait, et qui reste à faire** : aucune recette live des trois compositions
(le `done`, les deux plafonds, l'écran Mémoire) ; **aucune vérification qu'un des quatre lots devait
un semis de démo** (`demo-coverage` passe, mais passer n'est pas la même question).

⚠️ **Ordre imposé** : on recette #1997 **avant** de merger #1999 — deux lots non recettés en même
temps ne disent plus lequel a cassé quoi (50 min perdues une fois pour ça). Et **on ne merge pas
pendant qu'une autre CI tourne** : l'hébergeur des runners a le dépôt pour source.

## 5. Tranché ce soir (ne pas reposer)

Dans `decisions-2026-09-12.md`, batches 14 et 15 :

- **Plafond Laura par plan** : `trial` 25 · `starter` 50 · `team` 150 · `growth` 400 · `beta` = `growth`.
  Plafond **opérateur inchangé à 50**. ⚠️ **PAS ENCORE IMPLÉMENTÉ** — à poser après l'atterrissage de A
  (le lot #1991 porte le mécanisme).
- **SMS** : merger en **no-op strict**, brancher plus tard. Fournisseur / expéditeur / pays / budget
  restent ouverts. ⚠️ Aucune variable de plafond de budget SMS n'existe : à décider AVANT de poser la clé.
- **Vocal** : merger sans `TRANSCRIPTION_API_KEY`. Le vocal se recette **NON VÉRIFIÉ**. Rappels dus :
  audio conservé 30 j, et la **pièce RGPD** (registre des traitements + politique de confidentialité).

## 6. La règle neuve du jour — la largeur du balayage se DÉDUIT du diff

Demandée par Louis, livrée et mergée (#1996). `python3 tools/recette/portee.py` rend **FONDATION**
(→ tout) ou **CIBLÉ** (→ les écrans que le diff atteint, par le graphe d'imports).
Mesuré : **58 routes → 1** sur un diff de feature de 6 fichiers.
Garde `tools/recette/test_portee.py` (18 tests) dans le job `Test (artefact d'avancement)`.
Doctrine alignée dans les trois dépôts : `SKILLS_TEMPLATES/socle/SOCLE.md` §4.2 (resynchronisé sur
les 20 skills) + skills `issues`/`incident`, `.claude/projet.md` §7 de bellum ET de dirigo, et la
mémoire `no-regression-standing-rule.md`.

## 7. Ce qui reste à écrire

- **`CLAUDE.md`** : D354 y est encore présenté comme une règle du **site public**. Elle vaut pour
  l'app depuis le batch 11. À reformuler **quand A et B auront atterri** — le fichier conflicte sinon.
- Le plafond Laura par plan (valeurs du batch 14).
- La garde « champ de réponse d'API qu'aucun écran ne lit » (#1998).

## 8. Pièges payés CE SOIR

- ⚠️⚠️ **J'ai reposé à Louis une décision qu'il avait prise le matin même** (#1912.11, batch 11).
  Le registre le disait. `grep '^| <issue>\.<n> |' <registre>` coûte une seconde et l'évite.
- ⚠️ **Et je l'ai posée sur un exemple FAUX** : j'avais attribué les 8 chaînes fautives de la garde
  aux 8 outils connectés de `/chat`. Le corpus `VENDORS` n'en contient aucun ; les vrais fautifs sont
  `boamp`/`bodacc`/`decp`/`franceTravail` × FR/EN. **Le compte de 8 était une coïncidence** — un
  nombre qui correspond n'est pas une preuve.
- ⚠️ **3 secondes d'attente fabriquent de faux défauts en recette.** `/briefing` rendait 38 caractères
  à 3 s et 6 235 à 9 s ; `/projects` 26 puis 5 959. C'est le « zéro de chargement ».
- ⚠️ **Une modale invisible au `get_page_text` avale les frappes** : « Bienvenue au Bêta testeurs »
  recouvrait `/chat`, le message n'est jamais parti, le champ est resté vide. Une capture d'écran l'a
  dit en une image ; le texte de page, non.
- ⚠️ `tail` mange le code de sortie : `/opt/homebrew/bin/python3.13 -m pytest … | tail` a rendu
  `rc=0` sur un `No module named pytest`. Rediriger dans un fichier, lire `rc=$?` AVANT.
- ⚠️ `ls` rend du vide dans le bac à sable, et `--include=*.ts` non quoté sous zsh fait échouer `grep`.
