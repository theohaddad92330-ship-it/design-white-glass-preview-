# Tome 7 — le RAG et le design system

**Source** : `agent_docs/sources/tomes-md/T7.md` (1 337 l.)
**Branche** : `feat/tome7-rag`, mergée · commits `cb2c5aa8` (RAG) et `5a43f47c` (design)

## 0. Pourquoi ce tracker arrive après les autres

Les sept autres tomes ont été clos entre le 20 et le 23/08. Le tracker
`tomes6-8` ne traitait du tome 7 que sa **partie architecture** (GA-16, GA-17,
`DOMAINS.md`) et différait ses six primitives front. Quatre parties entières
n'avaient jamais été croisées avec le code : placement, motion, dataviz, UX
systémique — plus le RAG.

## 1. Le RAG — les 7 manques (§36-41)

Les six choix que le tome déclare justes sont **intacts** : repli plein texte,
distillation déterministe, plafond de 2 000 caractères, reclassement à trois
niveaux, alimentation best-effort, périmètre par utilisateur.

| #   | Manque                    | Ce qui est livré                                                                                                                                                                     |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | aucun decay               | `score = similarité × (1 − min(0,5 ; âge/730))`, appliqué **une fois** par étage qui produit un score — voir la correction du 29/08 ci-dessous                                       |
| M2  | aucune trace d'usage      | `used_count`, `last_used_at`, `used_in[]` — incrémentés quand un document ATTEINT le prompt, jamais quand une recherche le remonte                                                   |
| M3  | pas de suppression        | purge mensuelle journalisée, trois refus (déjà utilisé, déposé par un humain, âge illisible)                                                                                         |
| M4  | trois catégories          | neuf déclarées, les trois historiques EN TÊTE, la colonne n'est **pas** contrainte. ⚠️ Six n'avaient **aucun écrivain** ; `access_fact` en a un depuis le 29/08, cinq restent (D148) |
| M5  | pas de citation           | `doc_id` voyage avec chaque source ; garde GA-21. ⚠️ La seconde moitié du §38 — « et l'UI les rend cliquables » — n'existe pas : zéro lecteur dans `apps/web/src` (D147)             |
| M6  | pas de RAG sur les dépôts | `origin: distilled \| uploaded`, un seul magasin, un seul chemin d'indexation                                                                                                        |
| M7  | pas d'évaluation          | 50 requêtes de référence, corpus figé, MRR et top-3 mesurés                                                                                                                          |

### 1.0 ⚠️ Correction du 29/08 — M1 ne s'appliquait pas sur le chemin par défaut

Ce tracker a écrit que le decay était « appliqué une fois, dans `search()` — le
chemin que TOUS les appelants empruntent ». C'était vrai de l'appel et faux de
l'effet. `apply_score_decay` ne pondère qu'un document portant une `similarity`,
et **seul le vecteur en produit**. Sans `EMBEDDING_API_KEY` — la configuration
par défaut, et l'un des six choix que le tome déclare JUSTES — la récupération
est plein texte : aucune `similarity`, donc le decay du §38 y était un no-op
strict.

Pire : le §1.2 ci-dessous a retiré le terme de fraîcheur de
`_deterministic_rerank` au motif qu'il « s'appliquait trois fois — au score,
ici, puis dans le départage `apply_recency_decay` ». **Deux des trois ne se
produisaient pas sur ce chemin** : le score ne pondérait rien faute de
`similarity`, et `apply_recency_decay` n'est appliqué qu'aux sorties du
cross-encoder et du modèle, jamais à celle du reclassement déterministe.

Résultat mesuré : sur le chemin sans clé, la fraîcheur était comptée **zéro
fois**, et le symptôme que le §38 nomme revenait mot pour mot — « un angle
gagnant de 2024 remonte à égalité avec celui d'hier ».

Corrigé le 29/08 : `_deterministic_rerank` applique la formule du §38 au seul
score qu'il produise, le recouvrement lexical. Pas l'ancien terme ad hoc à 0,3 —
la formule, depuis son unique domicile (`rag_service.decayed_score_of`).

**La leçon** : un correctif justifié par une compensation qui vit ailleurs doit
prouver que la compensation TOURNE sur le chemin dont on parle. « Il est déjà
compté au-dessus » est une phrase, pas une mesure.

### 1.1 Trois décisions qui méritent leur raison

**L'incrément vit dans une fonction SQL.** Un `used_count + 1` composé côté
client devrait d'abord LIRE la valeur — le client Supabase n'exprime pas
l'incrément atomique — et deux réponses simultanées citant le même document
écriraient la même valeur. Le compteur sous-compterait **exactement** les
documents les plus utilisés, ceux qu'il sert à protéger.

**La catégorie n'est pas contrainte.** Elle porte déjà du texte libre en
production : `Notion` pour une page ingérée, `sales`, `Autre` pour un dépôt
manuel. Un `CHECK` rejetterait des documents que des clients ont déposés. Les
neuf catégories sont un CATALOGUE — ce que le produit sait produire lui-même,
pas la liste de ce qu'il accepte.

**La purge est ordonnancée par l'API et exécutée par l'IA.** Le service IA
possède `rag_documents` ; l'API possède le cron. Aucun verrou multi-replica :
la purge est idempotente, et un verrou coûterait un import de service entre
modules — la seule dette d'architecture que le dépôt tient au plafond.

### 1.2 Ce que l'évaluation a trouvé

Le §38 posait la question et fixait le seuil : « si le reclassement n'améliore
pas le MRR de plus de 10 %, il coûte plus qu'il ne rapporte ».

| variante                          | MRR   | top 3 | vs base |
| --------------------------------- | ----- | ----- | ------- |
| récupération seule                | 0,916 | 94 %  | —       |
| + reclassement à 0,3 de fraîcheur | 0,831 | 88 %  | −9,3 %  |
| + reclassement à 0,15             | 0,885 | —     | −3,4 %  |
| + reclassement sans fraîcheur     | 0,916 | 94 %  | 0 %     |
| + départage seul (retenu)         | 0,911 | —     | −0,5 %  |

Le reclassement gratuit **faisait perdre** près d'un dixième de la pertinence.
Cause : depuis M1, la fraîcheur s'appliquait **trois fois** — au score, dans le
reclassement, puis dans le départage. Ce qui est retiré n'est pas l'étage, c'est
le double comptage.

⚠️ **Ce diagnostic était faux, corrigé le 29/08 (voir §1.0).** Deux des trois
applications n'existaient pas sur ce chemin. Et il manquait au tableau
ci-dessus la ligne qui l'aurait montré : la mesure ne pouvait pas la produire,
parce que **la vérité terrain du jeu de 50 requêtes désigne un document sur le
SENS et jamais sur la date**. Un instrument aveugle à la fraîcheur ne peut en
voir que le coût. Après correction : MRR 0,916 → 0,884 (−3,5 %), présence dans
le top 3 inchangée à 94 %, et les **trois seules** requêtes qui reculent (q02,
q03, q08) sont toutes des dépassements par la date, sur un document attendu de
18, 406 et 806 jours. Lire ce −3,5 % comme « la fraîcheur dégrade la
pertinence » serait un contresens de mesure — c'est **D149**.

⚠️ **Piège de mesure rencontré.** Le corpus n'avait pas de date : le
reclassement rendait exactement le classement de base et le gain mesuré était de
**+0,0 %**. Une évaluation qui ne peut pas faire bouger ce qu'elle mesure ne
mesure rien. Les dates sont désormais absolues et figées — sinon le même jeu
rendrait un nombre différent chaque mois.

## 2. Le design system (parties A, C, E)

**La grammaire du mouvement.** 121 fichiers animés, `EASE_OUT_EXPO` redéfini
dans **six** fichiers (le tome en annonçait deux), `layoutTransition` dans
quatre, dix durées distinctes. `packages/ui/src/motion.ts` porte les douze
mouvements, quatre courbes, quatre paliers. La courbe centralisée est celle qui
était déjà utilisée.

**Le clavier.** `G` + lettre, `⌘/`. ⚠️ Le tome annonce `⌘K` et `⌘J` comme
« posés » — **ils n'existent pas**. La liste ne montre que ce qui est branché.

**Trois gardes** : GA-25 (grammaire du mouvement, en cliquet), GA-26 (un
réglage, une porte d'écriture), et deux interdits d'affichage (probabilité de
closing, classement des membres).

### 2.1 Deux gardes qui ont dû être réécrites

Toutes deux du même défaut, et c'est le plus fréquent de ce dépôt :

- **GA-25** cherchait la chaîne « bounce » et a accusé quatre fichiers
  **exemplaires** — `bounce: 0` DÉSACTIVE le rebond.
- **GA-26** listait trois hooks `useUpdate…` qui n'existaient nulle part : verte
  sur du vide, exactement ce qu'elle prétend attraper. Elle vérifie maintenant
  aussi que ce qu'elle surveille EXISTE, et elle a été prouvée en la cassant.

## 3. Ce qu'on ne promet pas

- **Les gardes dataviz.** Une seule utilisation de `recharts` dans tout le front
  (une sparkline), zéro camembert. Un cliquet posé sur un sujet qu'on n'a pas
  fait est vert pour toujours.
- **Les 16 visualisations du §24.** Chacune est un écran, pas une règle.
- **La densité par persona (§29).** Le produit n'a pas de notion de persona ; la
  poser pour six lignes de CSS serait un réglage de plus que personne ne trouve.
- **Le mobile (§31).** C'est **D76**, une décision de Louis : rien / lecture /
  travail. Le niveau 1 (brief, notifications, validation, recherche) est un
  chantier à lui seul.
- **Les 12 surfaces de Laura (§6.1)** aux pixels près, et la règle de
  non-collision. Elles décrivent un produit dont sept surfaces n'existent pas.
- **La matrice objet × forme (§5.1).** Elle décrit ce qui EST, et le vérifier
  demanderait de reconnaître un objet métier dans du JSX — ce qu'aucune
  expression régulière ne fait honnêtement.

## 4. Recette live (23/08, prod `5aae4b1d`)

- `⌘/` ouvre la liste, qui affiche « Seuls les raccourcis réellement branchés
  sont listés ici » et sept destinations. ⚠️ L'outil d'automatisation n'envoie
  pas `cmd+/` au navigateur ; vérifié en dispatchant l'évènement clavier depuis
  la page.
- `G C`, `G L`, `G T` naviguent. Taper « gp » **dans un champ** ne navigue pas —
  la garde anti-frappe volée tient.
- **Zéro erreur console** après deux navigations au clavier.
- ⚠️ **107 erreurs React #185 au BOOT d'une session de démonstration**, toutes
  horodatées à la seconde de la redirection, sur `Router.navigate` →
  `commitLocation`. Elles ne viennent pas des raccourcis (vérifié par purge du
  journal puis nouvelle mesure) et **préexistaient**. Non traité ici : c'est un
  défaut du parcours d'ouverture de démonstration, pas du tome 7.

## 5. Ce qui reste ouvert

| Sujet                                       | Nature                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D76 — le mobile**                         | décision de Louis : rien / lecture / travail                                                                                                                                                                                                                                                                                                                                                   |
| Les 107 React #185 au boot démo             | défaut préexistant, à investiguer                                                                                                                                                                                                                                                                                                                                                              |
| Les 16 visualisations                       | chacune est un écran                                                                                                                                                                                                                                                                                                                                                                           |
| Les 12 surfaces de Laura                    | sept n'existent pas                                                                                                                                                                                                                                                                                                                                                                            |
| **M5 — la source cliquable**                | **D147** : le `doc_id` arrive à l'écran, `apps/web/src` ne le lit nulle part                                                                                                                                                                                                                                                                                                                   |
| **M4 — cinq catégories vides**              | **D148** : `partner_fact`, `territory_insight`, `objection_answer`, `client_proof`, `esn_profile_fact` n'ont aucun écrivain                                                                                                                                                                                                                                                                    |
| **M7 — l'instrument est aveugle à la date** | **D149** : la vérité terrain des 50 requêtes ignore la fraîcheur, donc le seuil du §38 n'est pas décidable                                                                                                                                                                                                                                                                                     |
| **Parité démo d'`access_fact`**             | La salle de démonstration ne sème que trois documents de type DÉPOSÉ (`Méthode`, `Référence`, `Commercial`). Aucun document distillé n'y est semé, donc la fiche « par où entrer » n'y apparaît pas. La garde `demo-coverage` ne la réclame pas (`rag_documents` est déjà classée SEMÉE, et une catégorie n'est ni une table ni une clé de `raw_analysis`) — mais un prospect ne la verra pas. |
