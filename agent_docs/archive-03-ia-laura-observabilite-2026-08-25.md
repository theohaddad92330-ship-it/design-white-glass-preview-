# Archive 03 — IA, Laura, copilote, Action OS, automatisations, observabilité

> Source : `BELLUMAI_ITERATION_3_03_AI_LAURA_COPILOT_ACTION_OS_AUTOMATIONS_OBSERVABILITY_2026-08-24.zip`
> (1 173 294 octets, 23 fichiers au manifeste — **23 intègres**, SHA-256 recalculé).
> Croisée le 25/08/2026, après les archives `00`, `08`, `01` et `02`.

---

## 1. Ce que l'archive contient

| Contenu                                                                  | Statut                                  |
| ------------------------------------------------------------------------ | --------------------------------------- |
| `original_markdown_sources/pdf6.md` (29 Ko)                              | Chantier clos le 21/08                  |
| `original_markdown_sources/T6.md` (**92 Ko, 1 441 lignes, 74 sections**) | ⚠️ voir §2                              |
| `source_pdfs/` — PDF 6, PDF 10, Tome 6                                   | les trois PDF d'origine                 |
| `repo_mirrors/` — 13 fichiers                                            | miroirs de trackers et de docs du dépôt |
| `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md` (922 o)                         | **matériau NEUF**, voir §6              |
| `langfuse_evidence/` — 2 captures                                        | l'instrumentation observée au 24/08     |

C'est la première archive de l'itération 3 à porter du matériau qui n'est ni un
PDF déjà traité, ni un miroir : les exigences d'observabilité.

---

## 2. Le tome 6 n'est PAS le PDF 10 — et c'est ce qui a coûté un tiers du tome

`agent_docs/tomes6-8-laura-architecture-execution-2026-08-23.md` s'ouvrait sur
« **Le tome 6 EST le PDF 10**, restructuré », et `CLAUDE.md` le répétait. Sur
cette base, le tome n'a jamais été lu.

**Le tome le dément deux fois, dans son propre texte :**

| Ligne                | Ce que le tome dit                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `T6.md:1107` (§11.1) | « Le PDF 10 a spécifié deux Laura : site et produit. C'était juste, et **insuffisant**. » |
| `T6.md:1153` (§12)   | « Le PDF 10 en posait **trois** [couches de mémoire] ; il en faut **six**. »              |

Ses sections **1 à 9 recouvrent bien le PDF 10** — c'est ce qui a rendu le
raccourci crédible. Mais il porte en plus **§11 à §16** (il n'y a pas de §10 —
même trou de numérotation que les tomes 7 et 8, vérifié comme non-troncature) :
**337 lignes, 115 lignes de tableau, jamais inventoriées.**

> **Une équivalence entre deux documents est une AFFIRMATION.** Non vérifiée,
> elle dispense de lire — c'est précisément son danger. La vérifier coûtait un
> `diff` de tables des matières.

---

## 3. Les six chapitres, mesurés contre le code

Le résultat est **contrasté**, et c'est la nuance qui compte : ne pas avoir
inventorié un chapitre ne veut pas dire ne pas l'avoir livré.

| §                                                                                          | Ce qu'il demande                                                                                                                                                                     | Mesure                                                                                                                                                                                                                                                                                               | Statut            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **§11** Un seul cerveau, **12 surfaces**                                                   | Panneau `⌘J`, barre `⌘K`, bloc d'écran, carte contextuelle, survol, panneau d'effet, bulle, brief du matin, assistant de saisie, compagnon d'analyse, débrief de session, Laura Site | `useLaura.ts:37` : **3** (`card`/`block`/`bubble`) · `INTERVENTION_FORMATS` : **5**. ⚠️ Les surfaces 1 et 2 (`⌘J`, `⌘K`) sont exactement celles que le chantier du tome 7 avait déjà relevées comme **inexistantes** malgré leur annonce                                                             | **PARTIEL**       |
| **§11.1** « Un seul cerveau. Un seul contexte. Douze surfaces. »                           | Surcouche du copilote, jamais un second moteur                                                                                                                                       | **LIVRÉ** — `useLaura` + GA-39 (une seule porte vers `/laura/`), livré le matin même **sans savoir que ce chapitre existait**                                                                                                                                                                        | **LIVRÉ**         |
| **§12** Mémoire en **6 couches**                                                           | identité · espace · produit · métier · **travail** · conversation                                                                                                                    | La couche 5 (« travail » — ce que l'utilisateur a fait, refusé, corrigé, ignoré) est déclarée par le tome lui-même comme `[Spécification proposée]` et « celle qui manque ». `memory_pinned_facts` et `relationship_memory` couvrent des morceaux des couches 1, 2 et 6                              | **PARTIEL**       |
| **§13** Moteur d'initiative : **5 conditions** cumulatives, budget adaptatif, moments d'or | vraie · actionnable maintenant · pas refusée depuis 30 j · budget (3/jour, 1/écran, 20 min) · …                                                                                      | Le plafond existe (`PROACTIVITY_DEFAULT_CAP = 3`, réglable 1-5) et Laura Produit tient « 1 par écran, 20 min ». ⚠️ **Le retrait après refus est de 7 jours dans le code, 30 dans le tome** — écart réel, non arbitré                                                                                 | **PARTIEL**       |
| **§14** Les **40 interventions** du produit                                                | 8 accessibilité · 7 partenaires · 6 réseau · 7 besoins/talents/matching · 7 delivery/cash/pilotage · 5 produit/adoption                                                              | Le code en a **30**, mais d'une **TAXONOMIE DIFFÉRENTE** : `onboarding`/`adoption`/`churn_risk`/`business_value`. Ce ne sont pas 10 interventions manquantes — ce sont **deux axes** : le PDF 10 raisonne en cycle de vie PRODUIT, le tome 6 en domaines MÉTIER. Seule §14.6 (5 entrées) se recouvre | **AXE DIFFÉRENT** |
| **§15** Le prompt système unifié                                                           | 106 lignes de prose, aucun tableau                                                                                                                                                   | Non mesuré — le comparer au `bellum_advisor` actuel demande une relecture ligne à ligne, pas un `grep`                                                                                                                                                                                               | **NON MESURÉ**    |
| **§16** Les **14 outils nouveaux**                                                         | accessibilité (3) · territoire (3) · partenaires (5) · réseau (3)                                                                                                                    | **14 / 14 PRÉSENTS** dans `chat_tools.py` (le catalogue en compte 31). Livrés par les chantiers des tomes 1 et 4                                                                                                                                                                                     | **LIVRÉ**         |

**Ce que cette table apprend.** Le chapitre le plus concret (§16, quatorze
outils nommés) est **entièrement livré**. Le chapitre le plus doctrinal (§11.1,
« un seul cerveau ») l'a été le matin même, à l'aveugle. Ce qui manque
réellement est au milieu : les surfaces, la couche de mémoire n°5, et les 35
interventions métier.

---

## 4. L'écart de 30 jours contre 7

`T6.md:1197` (§13.1, condition 3) : « Elle n'a pas été refusée récemment — **pas
de reproposition avant 30 jours** ».

Le dépôt applique **7 jours** (« FERMER SANS LIRE, c'est un geste → retrait
7 jours, dit une fois, sans reproche »), et cette règle-là vient du PDF 10 §5.3,
livré le 22/08.

Les deux sont défendables. **7 jours** part du principe qu'un refus dit « pas
maintenant » ; **30 jours** qu'il dit « pas ça ». Le dépôt a tranché pour 7 et
l'a écrit ; le tome demande 30 sans le justifier autrement que par la liste.
**On garde 7**, et la divergence est ici pour qu'elle cesse d'être invisible.

---

## 5. Observabilité — 2 métadonnées sur 17, et la plus rentable manquait

`LANGFUSE_OBSERVABILITY_REQUIREMENTS.md` liste **17 métadonnées minimales** par
trace et **8 garde-fous**. Mesuré : les traces portent `sessionId` (=
correlation-id) et `thread_id`. **Deux sur dix-sept.**

Ce qui manquait et qui coûtait le plus cher : **`environment` et `release`**.
Sans eux, les traces de développement, de recette et de production tombent dans
la même vue sans rien pour les distinguer — on ne peut ni chercher « les erreurs
de prod », ni corréler une régression à un déploiement. La « séparation
dev/staging/prod » est un garde-fou explicite des exigences, et
`c25_observabilite` la déclarait déjà comme due.

**Livré.** `langfuse_client.py` attache les deux à **chaque** trace, depuis des
variables qui existent déjà sur les trois services (`SENTRY_ENVIRONMENT`,
`SENTRY_RELEASE`, repli `RAILWAY_GIT_COMMIT_SHA`). Trois décisions :

1. **Aucune variable nouvelle.** En créer une garantirait qu'un jour les deux
   disent des choses différentes. `LANGFUSE_ENVIRONMENT` reste acceptée pour un
   opérateur qui voudrait les séparer volontairement.
2. **Au niveau du CLIENT, pas de l'appelant.** Onze sites appellent
   `bind_trace` ; en confier la charge à chacun garantit que le douzième
   l'oubliera.
3. **L'appelant GAGNE.** Une trace qui déclare son propre environnement sait
   quelque chose que le processus ignore (un rejeu, une recette).

Et une absence reste une **absence** : sans variable connue, aucune clé n'est
écrite — « inconnu » se lirait comme une valeur.

Cinq tests le verrouillent, dont celui qui vérifie que `thread_id` **survit** à
l'héritage : le perdre rendrait la trace inutilisable.

### Ce qui reste dû sur les 17

`user_id` pseudonymisé · `workspace_id` pseudonymisé · rôle · feature/surface ·
**prompt version** (`prompt_fingerprint.json` existe déjà, c'est le moins cher
des restants) · Offer Portfolio / domaine actif · IDs métier non sensibles ·
approbation · **outcome vérifié** — ce dernier étant le plus intéressant, parce
qu'il est la traduction en observabilité de l'invariant « une sortie de modèle
ne prouve jamais un outcome », que le README de l'archive rappelle.

---

## 6. Les quatre résolutions du README

| Résolution                                                        | Verdict                                                                                                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| « Laura est une surcouche du Copilote »                           | **TENUE** — D44, et GA-39 l'impose désormais côté web (une seule porte vers `/laura/`)                                                                                         |
| « L'exécution suit plan → simulate → approve → execute → verify » | **TENUE** — Action OS, approbations figées, `unknown` qui arrête la reprise. ⚠️ Rappel du Recovery Pack : `POST /action-os/runs` n'a toujours aucun appelant (lot G, non fait) |
| « Une sortie de modèle ne prouve jamais un outcome »              | **TENUE** — `queued` n'est plus replié en `done`, `blocked`/`unknown` existent                                                                                                 |
| « Langfuse ne doit pas exposer de PII/secrets »                   | **TENUE** — le contenu ne part pas par défaut (`LANGFUSE_CAPTURE_CONTENT` opt-in), et `environment`/`release` n'en sont pas                                                    |

---

## 7. Ce qu'on ne promet pas

| Ce qu'on ne fait pas                  | Raison                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les 35 interventions métier du §14    | Ce n'est pas un rattrapage de 10 lignes : c'est un **second axe** d'interventions (accessibilité, partenaires, réseau, matching, delivery) à côté de l'axe cycle-de-vie déjà livré. Et la moitié se heurte à la même limite que les 22 non détectables du PDF 10 — leur condition n'est pas mesurable. Les inscrire au catalogue sans détecteur produirait des cases qui ne se déclenchent jamais. |
| Les 9 surfaces manquantes du §11      | Chacune est un écran, pas une règle. `⌘J` et `⌘K` sont les deux plus cheap et les deux déjà relevées comme absentes ; les poser demande d'abord de trancher si la barre de commande remplace ou double la bibliothèque `/chat/commandes` livrée le 21/08.                                                                                                                                          |
| La couche de mémoire n°5              | Le tome la déclare lui-même `[Spécification proposée]`. Elle porte « ce que l'utilisateur a refusé, corrigé, ignoré » — c'est-à-dire des données de comportement, dont la rétention et la base légale se décident avant de s'écrire.                                                                                                                                                               |
| Comparer le §15 au prompt actuel      | Une relecture ligne à ligne de 106 lignes de prompt contre `bellum_advisor`, pour un gain qui n'est pas mesurable d'avance. Déclaré NON MESURÉ plutôt que supposé conforme.                                                                                                                                                                                                                        |
| Les 15 métadonnées Langfuse restantes | Chacune demande de décider ce qu'on pseudonymise et comment. `prompt version` est la moins chère et devrait venir en premier.                                                                                                                                                                                                                                                                      |
| Passer le retrait de 7 à 30 jours     | Arbitrage du 22/08 conservé et documenté au §4, plutôt que renversé sur la foi d'une ligne de tableau.                                                                                                                                                                                                                                                                                             |

---

## 8. Les §1-9 du tome, relus à leur tour — et ce que la relecture apprend

Ayant établi au §2 qu'une équivalence non vérifiée dispense de lire, il restait
une hypothèse du même genre : que les **§1 à §9** du tome, eux, soient bien
couverts par le chantier du PDF 10. Une passe inversée a été lancée dessus.

**Réponse : non.** Le tracker du PDF 10 a gardé la loi de chaque tableau et jeté
ses colonnes — la table des délais d'ouverture par type de page (§4.4), le
barème et les paliers (§4.6), les formats d'intervention (§5.5), les poids du
score de santé (§5.6), les niveaux des outils (§5.8) — et il ne porte **aucune**
des 18 métriques des §4.14 et §5.9. Même mécanisme qu'à l'archive 02.

### ⚠️ Mais les quatre écarts « bloquants » sont FAUX — vérifiés un par un

C'est le résultat le plus utile de la journée, et il recalibre la lecture de
toutes les passes B. La lecture inversée compare la source **au tracker**. Le
tracker est lessivé ; le CODE ne l'est pas. Résultat mesuré :

| Écart annoncé comme bloquant                                                                | Vérification                                                                                                                                                                                                                                                                                                                                     | Verdict     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| « Sans la règle _espace neuf = en amorçage_, D50 alerte l'équipe sur chaque nouvel espace » | `workspace-health.ts:126` — sous `MIN_AXES_FOR_HEALTH`, le score est `null` ; `shouldAlertTeam` exige `score !== null`. Le champ `missingAxes` **nomme** l'amorçage. Le commentaire dit mot pour mot : « un espace créé hier ressemble à un espace qu'on perd, et déclencher l'alerte dessus ferait appeler des clients qui viennent d'arriver » | **RÉFUTÉ**  |
| « L'interdit _jamais pendant une saisie, un import, une analyse_ n'existe pas »             | `useLaura.ts:71` calcule `busy` depuis `[aria-busy]` / `[data-analysis-running]`, l'envoie au serveur, et `laura.service.spec.ts:111` vérifie `busy: true → { speaks: false, reason: 'busy' }`. Branché de bout en bout                                                                                                                          | **RÉFUTÉ**  |
| « Les 30 points du barème sont recopiés sans recompter »                                    | `routing.ts:132` — `MAX_SCORE` est **calculé** depuis les tables, jamais écrit. Le code sait donc que le barème fait 32. Seule la LIGNE du tracker portait la valeur périmée (corrigée)                                                                                                                                                          | **RÉFUTÉ**  |
| « Le plafond de proactivité a perdu la borne 0 »                                            | Vrai, et **délibéré** : `PROACTIVITY_MIN_CAP = 1` porte sa raison écrite (D40) — « en dessous de 1, le produit se tait complètement », ce qui est le rôle de l'interrupteur, pas du plafond                                                                                                                                                      | **ARBITRÉ** |

**Quatre sur quatre.** Ajoutés aux huit vérifications de l'archive 02 (sept
confirmées, une réfutée), la règle empirique se dégage :

> Une passe B contre un TRACKER sur-signale. Ses écarts de COMPTE sont fiables
> (ils se recomptent à la source) ; ses écarts de COUVERTURE ne le sont pas
> — « absent du tracker » et « absent du code » sont deux choses, et c'est
> justement parce que le tracker est lessivé qu'on la lance.

**Conséquence pratique** : un écart de couverture ne devient un ticket qu'après
lecture du code. Le publier tel quel produirait un backlog de fantômes — et
c'est exactement ce que ce chantier reproche aux inventaires.

### Ce qui reste réellement dû, après vérification

Les **18 métriques** des §4.14 et §5.9 et les **événements analytiques** qui les
rendraient mesurables : aucune trace ni au tracker, ni au code. C'est le seul
manque de ce croisement qui soit à la fois large, vérifié et non arbitré — et il
a une propriété désagréable : sans les événements, aucune des dix métriques du
site (ouverture > 35 %, conversion > 12 %, **fuite d'e-mail = 0**) ne peut être
mesurée, y compris celle qui garde le bug P0 du 22/08.

---

## 9. Ce que la recette live a vérifié

Déployé sur `63d740ac` (service IA), vérifié dans Chrome.

**Le panneau d'effet, en vrai.** C'est la vérification que la recette de
l'archive 01 avait déclarée impossible « parce qu'elle écrirait dans les données
réelles » — l'autorisation d'écrire lève l'objection, et le skill est corrigé.
Chemin : `/projects` › Portefeuille › Blablacar › besoin « Time-to-market… » ›
étape `Détecté` → `Qualifié`.

| Règle du §47                                   | Vérification live                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le geste NU est à un clic                      | « Déplacer seulement » est présent à côté de « Déplacer »                                                                                                |
| `Entrée` ne confirme pas                       | Case cochée puis `Entrée` : **le panneau reste ouvert**, rien n'est confirmé                                                                             |
| « Déplacer seulement » ignore ce qui est coché | Les **trois** cases cochées, clic sur « Déplacer seulement » → **une seule requête réseau**, `PATCH /projects/:id/stage` (200). **Aucun appel d'effet.** |
| Le déplacement a bien lieu                     | Le projet est passé au pipe en « Qualifié » ; le compteur des détectés est passé de 327 à 326                                                            |

Le panneau porte aussi « Ce qui change : l'étape · la date d'entrée d'étape » et
« Ce que je vérifie : un contact décisionnaire existe-t-il ? » — la question de
porte, posée avant le geste.

**Laura répond**, et honnêtement : interrogée sur le nombre de comptes suivis,
elle rend « au moins 10 … donc ce chiffre est un **plancher**, pas un total ».
C'est la doctrine « non mesuré n'est pas mesuré » dans une réponse de modèle.

**Ce qui n'est PAS vérifié, et pourquoi :**

- **Le glisser-déposer du pipe** — le navigateur piloté produit une sélection de
  texte au lieu d'un glissement ; `@dnd-kit` écoute des évènements de pointeur
  que `left_click_drag` ne synthétise pas. Limite d'outillage, **pas** un
  verdict sur la fonctionnalité : le même panneau a été exercé par l'autre
  chemin ci-dessus.
- **La trace Langfuse elle-même** — pas d'accès au tableau de bord. Cinq tests
  unitaires couvrent `environment` / `release` / la survie de `thread_id`.
- **Le mobile** — le navigateur piloté annonce un redimensionnement qu'il
  n'applique pas (mesuré deux fois).

**Trace de recette laissée dans l'espace** : le besoin Blablacar
« Time-to-market des nouveaux marchés dépendant de processus IA non
industrialisés » est passé de `Détecté` à `Qualifié` et se trouve au pipe. Aucun
effet de bord n'a été créé (ni tâche, ni rappel, ni envoi).
