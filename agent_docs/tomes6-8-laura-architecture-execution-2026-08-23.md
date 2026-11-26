# Tomes 6, 7 et 8 — Laura, l'architecture, et l'exécution

**Sources** : `agent_docs/sources/tomes-md/T6.md` (1441 l.), `T7.md` (1337 l.), `T8.md` (835 l.)
**Branche** : `feat/tome5-plan-de-compte` (les trois tomes tiennent dans un lot)

## 0. Ce que le croisement a établi, et pourquoi ce tracker est court

⚠️ **CORRIGÉ LE 25/08/2026 — cette section était fausse, et sa fausseté a coûté
un tiers du tome.** Elle affirmait « **le tome 6 EST le PDF 10**, restructuré ».
Le tome le dément **deux fois, dans son propre texte** :

- §11.1 (`T6.md:1107`) : « Le PDF 10 a spécifié deux Laura : site et produit.
  C'était juste, et **insuffisant**. »
- §12 (`T6.md:1153`) : « Le PDF 10 en posait **trois** [couches de mémoire] ;
  il en faut **six**. »

Le tome 6 est un **surensemble**. Ses sections 1 à 9 recouvrent effectivement le
PDF 10 — c'est ce qui a rendu le raccourci crédible. Mais il porte en plus les
sections **§11 à §16** (il n'y a pas de §10) : 337 lignes, 115 lignes de
tableau, jamais inventoriées. Leur statut mesuré est au §5 de
`agent_docs/archive-03-ia-laura-observabilite-2026-08-25.md` — et il est
contrasté : les 14 outils du §16 existent TOUS, quand les 12 surfaces du §11 se
réduisent à 3 dans le code.

**La leçon n'est pas « il fallait tout recoder ».** Elle est qu'une équivalence
entre deux documents est une AFFIRMATION, et qu'une affirmation d'équivalence
non vérifiée dispense de lire — ce qui est exactement son danger. La vérifier
coûtait un `diff` de tables des matières.

Ce qui suit reste vrai pour les sections 1 à 9, livrées le 22/08 (PR #1021) :
la refonte du widget, les huit axes de qualification, les 70 questions, les 22
objections, le multi-message, les relances de silence, l'auto-ouverture et ses
sept règles de retenue, les huit gardes `GL-01` à `GL-08`, le catalogue des 30
interventions, le score de santé à sept axes et le budget d'interruption.
Recoder tout cela aurait été le travail le plus coûteux et le plus inutile de la
série.

⚠️ **CORRIGÉ LE 25/08/2026 — deuxième affirmation d'équivalence fausse dans ce
même tracker.** Elle disait « **le tome 8 ne contient aucune spécification
neuve** — il l'écrit lui-même ». C'est vrai de ses chapitres d'ORDONNANCEMENT
(§9-14, §22-27, §50-55), qui ordonnent effectivement les sept tomes précédents.

Ce ne l'est pas de ses chapitres **§15 à §18**, qui portent **24 propositions de
fonctionnalité numérotées `F01` à `F24`** — dont plusieurs sont inédites :
`F15` « le compte jumeau » (« tu as gagné chez Barrière, voici 12 comptes qui
lui ressemblent »), `F16` « le détecteur de compte qui se ferme », `F19` « le
classement par distance au premier euro » (nombre d'étapes restantes avant une
facture, ni l'intérêt ni l'accessibilité).

**Sondage, pas inventaire.** Sept des 24 ont été cherchées dans le code : six
existent — `F02` (l'anti-conseil), `F03` (le board d'effort), `F07` (la barrière
d'accès), `F08` (`referencingWindowAlert`), `F17` (la carte territoriale) — et
`F19` n'existe pas. **Le statut des dix-sept autres n'est PAS mesuré**, et il ne
faut pas le déduire de ce sondage.

Ce qui explique le raccourci : les tomes 1 à 7 ont livré une bonne part de ces
features sans passer par le tome 8, si bien que « rien de neuf » était vrai de
l'expérience et faux du document. Même mécanisme qu'au §0 ci-dessus — voir la
mémoire `equivalence-claim-excuses-reading`.

Ce qui suit reste exact : il ordonne les sept précédents, et son chemin critique
est le suivant :

```
D62 → BEL-DATA-001 → BEL-DATA-002 → BEL-PLAN-001 → BEL-PLAN-002
```

Les cinq maillons sont livrés : D62 tranché, le référentiel ESN (tome 4), le
score de débordement (tome 4), le premier mouvement (tome 5), l'anti-conseil
(tome 5, éteint par sa propre barrière). `BEL-DATA-003`, que le tome 8 appelle
« le meilleur rapport valeur/effort du programme », l'est aussi (tome 4).

Restait donc, réellement, une poignée d'écarts — et ils sont tous de la même
famille : **du code juste, calculé, testé, que personne n'appelle.**

## 1. Ce qui est livré ici

| #      | Écart                                                           | Ce qui se passait                                                                                                                                                                                                                                                                                          |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1** | `alertsTeam()` n'avait **aucun appelant**                       | D50 dit « sous 25, c'est l'ÉQUIPE qu'on prévient ». Le verdict était calculé à chaque tour de Laura et jeté. Le signal de churn le plus actionnable du produit n'atteignait aucun écran. Il part maintenant en `logger.error` — donc dans Sentry — dédoublonné par espace et par jour                      |
| **L2** | « Je n'ai pas pu transmettre » pouvait se répéter               | La garantie « une seule fois » reposait sur un `Set` en mémoire de process, sur un site **serverless** : elle tenait quand l'instance était chaude et tombait sinon, c'est-à-dire de façon imprévisible. La conversation, elle, fait l'aller-retour — c'est elle qui sert de mémoire (`handoff-memory.ts`) |
| **L3** | `get_user_context` ne rendait ni prénom ni rôle                 | Sa propre description promet « ne pas redemander au dixième message ce qu'on a dit au premier ». Il rendait l'identifiant d'espace et un booléen : il ne pouvait pas tenir cette promesse                                                                                                                  |
| **L4** | Deux valeurs de `max_tokens` (1024 en prod, 1400 au rejeu)      | Le rejeu live ne testait pas la contrainte de longueur de la production. 1400 partout, avec sa raison                                                                                                                                                                                                      |
| **L5** | Le RAG perdait la fraîcheur dès qu'on payait pour mieux classer | Seul le repli déterministe — le chemin gratuit — pondérait la date. Le cross-encoder et le modèle ne regardent que le texte : **payer un reclassement faisait perdre le decay**. `apply_recency_decay` s'applique désormais aux deux chemins payants                                                       |
| **L6** | Rien ne déclarait les tables PARTAGÉES                          | `esn_directory` est la première table sans `workspace_id` du dépôt. GA-16 exige qu'une table hors périmètre d'espace soit déclarée AVEC sa raison — sinon la garde d'isolation d'espace, quand elle sera écrite, échouera dessus sans savoir pourquoi                                                      |
| **L7** | Rien n'empêchait les sources de s'appeler entre elles           | GA-17 (côté Python) : une source de `data_sources/` n'en importe pas une autre. Trois primitives partagées font exception, nommées ; les deux imports croisés réels sont inscrits avec leur raison, dans une liste qui ne peut que rétrécir                                                                |
| **L8** | 93 modules à plat, sans carte                                   | `DOMAINS.md` associe chaque module à son domaine **sans déplacer un fichier**. Déplacer 90 modules pour gagner en lisibilité ferait courir un risque de régression à tout le produit, et rendrait illisible le prochain `git blame`                                                                        |

## 2. Ce qu'on ne promet pas, et pourquoi

- **L'état de session SERVEUR de Laura Site** (tome 6 §BEL-LAU-903). Il est
  refusé par D47, qui a été tranché dans l'autre sens : la mémoire du visiteur
  vit 30 jours **en local**, jamais côté serveur sans compte. Stocker les
  conversations de visiteurs anonymes est un engagement RGPD qu'on ne prend pas
  pour économiser un aller-retour. L2 ci-dessus règle le seul vrai symptôme.
- **Les 22 interventions non détectées sur 30.** Écart assumé et déjà écrit :
  elles supposent des mesures que le dépôt ne fait pas, et les deviner
  produirait des interventions qui se déclenchent au hasard — ce qui fait
  couper Laura, donc revenir le churn par la porte qu'on voulait fermer.
- **Les six primitives front** (`<Provenance>`, `<ScoreWithAxes>`,
  `<UnknownValue>`, `<CapabilityGate>`, `<EffectPanel>`, `useLaura`). Trois
  existent déjà sous d'autres noms (le bandeau de capacité, le panneau d'effet,
  la carte Laura). Les trois autres sont un chantier de design system qui
  traverse 57 routes : le faire à moitié — la primitive écrite, deux écrans
  migrés — donnerait exactement le « présent sur 30 écrans, absent sur 4 » que
  le tome dénonce, en pire, puisqu'on croirait le problème réglé.
- **Le prompt système de Laura Produit** : la surcouche (D44) existe côté
  décision — budget, catalogue, détection, retrait — mais aucune persona n'est
  injectée dans le prompt du copilote. L'écrire suppose de trancher ce que le
  copilote devient : deux personas dans un seul moteur, c'est deux tons
  possibles pour la même réponse.
- **Le rejeu live des 20 conversations en CI** : refus reconduit du 22/08 (une
  clé de production dans les actions, vingt appels par poussée, et une garde qui
  rougit parce qu'un modèle a tourné sa phrase autrement finit désactivée).
- **Les six manques restants du RAG** (trace d'usage, purge, six catégories,
  citation obligatoire, unification des origines, jeu d'évaluation). Le premier
  — le decay — est livré parce que le tome 8 le nomme comme irréversible : « le
  decay APRÈS la mise en production de la base : elle mentira six mois plus tard
  et personne ne saura pourquoi ». Les autres se rattrapent à tout moment.
- **Le bus d'événements en base** (D75) et le **découpage en domaines** (D74) :
  le premier est un chantier d'architecture à part entière, le second est refusé
  au profit de `DOMAINS.md`.
