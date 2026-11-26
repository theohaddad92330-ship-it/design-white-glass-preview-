# Tome 5/8 — Le plan de compte automatique

**Source** : `agent_docs/sources/tomes-md/T5.md` (1478 lignes, 20/08/2026, ORION)
**Branche** : `feat/tome5-plan-de-compte`

## 0. Ce qu'il faut savoir avant de le lire

Le tome part d'un artefact réel : quinze pages produites à la main par un
praticien (Ilan, Pariente Consulting) pour son équipe. Le document contient
exactement ce que le produit devrait générer — et c'est ce qui en fait la
meilleure spécification reçue depuis le début : **elle a été écrite sous
contrainte réelle, pas pour nous.**

Sa phrase la plus utile n'est pas une exigence, c'est une observation :

> Le quatrième point de chaque « premier mouvement » est toujours un INTERDIT.

Un produit qui ne dit que ce qu'il faut faire laisse l'utilisateur commettre
l'erreur évidente. Dire ce qu'il ne faut PAS faire est plus rare, et plus utile.

## 1. Ce que le croisement a établi

| Affirmation                           | Vérifié                                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le « premier mouvement » n'existe pas | **Trois de ses quatre points existent, dispersés.** Pire : `if_no_response` (le point 03) est GÉNÉRÉ par la phase 4 depuis toujours et **aucun écran ne le lit**                                                                    |
| L'anti-conseil n'existe pas           | Il vit dans les PROMPTS (« ANTI-RECOMMANDATION ») et ressort noyé dans une raison d'étape. Jamais un bloc nommé                                                                                                                     |
| Le score d'entité est à écrire        | Il en existe **quatre** : `rankAccessEntities` (tome 3, l'écran), `perimeter_score` (/20, consommé par la phase 4), `prioritization._entity_score` (jamais persisté), `entities.classify_entity_relevance` (un filtre, pas un rang) |
| Le score d'entité est alimenté        | **Non** : son unique appelant passe `siteCount: 0` EN DUR — l'axe « sites » n'a jamais rien pesé                                                                                                                                    |
| Un score de fit sur 5 est à créer     | `fitTierFor` existe et **dérive du score d'intérêt**. En créer un second donnerait deux nombres qui disent presque la même chose                                                                                                    |
| Le board de sprints existe            | **Rien.** Zéro occurrence dans les trois applications                                                                                                                                                                               |
| Les versions de plan existent         | La table `action_plans` accumule **une ligne par génération** depuis le premier jour — et personne ne les lit comme des versions                                                                                                    |
| Les exports portent leur date         | **Non.** Quatre exports (xlsx, docx, pdf, pptx), aucun pied de page daté                                                                                                                                                            |
| Un brief avant rendez-vous existe     | `get_account_briefing` existe **uniquement comme outil du copilote** — aucun écran                                                                                                                                                  |
| Les 5 rôles de décision sont alignés  | Oui, et mieux : le graphe en a **huit**, dont `unknown`. La demande de renommer « à vérifier » en « inconnu » est **sans objet**                                                                                                    |

## 2. Décisions

| #        | Question                               | Décision                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T5-A** | Un second score d'entité à 6 axes ?    | **Non — on ALIMENTE celui qui existe.** Deux classements d'entité sur le même écran donneraient deux portes d'entrée différentes pour le même compte. Les axes du tome qui sont mesurables sont ajoutés à `rankAccessEntities` ; les autres sont nommés comme non mesurés |
| **T5-B** | Un score de fit sur 5 ?                | **Non.** `fitTierFor` dérive déjà du score d'intérêt ; un second nombre divergerait du premier au premier ajustement. Les pastilles du tome se lisent sur le score existant                                                                                               |
| **T5-C** | L'anti-conseil est-il servi ?          | **Non, pas encore** — le tome pose lui-même le seuil (§17.2 : 24 interdits pertinents sur 30, aucun faux). La MÉCANIQUE est livrée et testée, l'affichage attend le jugement humain. `ANTI_ADVICE_ENABLED = false`                                                        |
| **D80**  | Le plafond du Sprint Focus             | **8 en dur.** Sans plafond, l'effort maximum devient l'effort moyen — et c'est tout le principe qui tombe                                                                                                                                                                 |
| **D81**  | Les erreurs bloquantes le sont-elles ? | **Oui pour celles qui écrivent** (no-go sans motif, 9ᵉ compte en Focus). Une erreur seulement signalée est une erreur commise                                                                                                                                             |
| **D78**  | Un plan périmé                         | **Affiché, avec son badge.** Le masquer ferait croire qu'il n'y a pas de plan                                                                                                                                                                                             |
| **D82**  | La charte du deck exporté              | Celle de l'ESN. Ici : pied de page daté obligatoire, non supprimable                                                                                                                                                                                                      |

## 3. Lots

- **Lot A — le premier mouvement en 4 points** : `first-move.ts` (pur), et le
  point 03 enfin RENDU (`if_no_response` dormait depuis le premier jour).
- **Lot B — l'anti-conseil** : six règles, six raisons chiffrées, désactivé.
- **Lot C — le score d'entité vraiment alimenté** : les sites réels, la distance
  au siège, le décideur identifiable.
- **Lot D — le board de sprints** : quatre colonnes, sept règles de bascule,
  plafond dur à 8, motif obligatoire vers no-go.
- **Lot E — le plan est un objet vivant** : versions (déjà en base), « ce qui a
  changé », badge de fraîcheur.
- **Lot F — le pied de page daté** sur les quatre exports.
- **Lot G — le brief d'avant-rendez-vous**, en huit blocs, l'interdit en dernier.

## 4. Ce qu'on ne promet pas

- **Le score de fit sur 5** (T5-B) et **un second score d'entité** (T5-A).
- **L'anti-conseil affiché** (T5-C) tant que le jeu de 30 comptes n'a pas été
  jugé par un humain. Le tome l'exige, et c'est la seule barrière qui protège de
  « un conseil faux, énoncé avec autorité ».
- **Le golden set de 30 comptes** : il demande une notation humaine, pas du code.
- **Le générateur de plan à 7 phases** (`BEL-PLAN-001`) : cinq de ses sept phases
  existent déjà, dispersées dans le pipeline d'analyse. Le refaire en un
  générateur séparé produirait un SECOND plan, divergent du premier — le tome
  lui-même livre `BEL-PLAN-004` en premier pour cette raison.
- **Le renommage de « à vérifier » en « inconnu »** : la valeur EST déjà
  `unknown`, et renommer une valeur d'énumération casserait GA-08 et les données
  déjà écrites. Seul le libellé se traduit.

## 5. État de livraison

| Lot | Contenu                                                                                                     | État          |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| A   | `first-move.ts` (pur) + le point 03 « si silence » enfin RENDU dans l'onglet Plan                           | livré         |
| B   | L'anti-conseil : six règles, six raisons chiffrées, deux au maximum, `ANTI_ADVICE_ENABLED = false`          | livré, éteint |
| C   | Le score d'entité alimenté par les sites RÉELS (`siteCount: 0` était en dur)                                | livré         |
| D   | Board d'effort : migration `1789996184270`, 7 règles de bascule, plafond dur à 8, écran `/accounts/sprints` | livré         |
| E   | Badge de fraîcheur du plan (frais / vieillissant / périmé / inconnu), affiché même périmé (D78)             | livré         |
| F   | La mention de génération datée, dernière section des quatre exports                                         | livré         |
| G   | Le brief d'avant-rendez-vous, `/accounts/$id/brief`, huit blocs, l'interdit en dernier                      | livré         |

## 6. Ce que le croisement a corrigé, sans que le tome le demande

- **`siteCount: 0` en dur** : l'axe « sites » du score d'entité existait, était
  testé, et n'a jamais rien pesé depuis sa livraison du 22/08.
- **`if_no_response` dormant** : produit par la phase 4 depuis le premier jour,
  lu par aucun écran. Un plan qui ne dit pas quoi faire quand personne ne répond
  laisse relancer au hasard.
- **Trois routes d'écriture sans permission** : attribuer un compte, cocher une
  action de plan, corriger la note d'un dossier. Un `viewer` pouvait les
  appeler. Plus l'agenda, déclaré `@PersonalScope` — GA-05 descend de 377 à 367.

| Lot | Contenu | Commit     | Mergé | Vérifié en live                                                                                                                                  |
| --- | ------- | ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-G | Tous    | `8f7cffe8` | ✅    | ✅ recette 23/08 : trois défauts trouvés et corrigés (`46f814b5`, `e279f451`) — écran de brief inatteignable, clé i18n brute, signaux sans texte |
