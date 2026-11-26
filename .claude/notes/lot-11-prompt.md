# Lot 11 — `/actions` (5) + `/watchlist` (5)

Colle ce texte après un `/clear`. Repartir de `origin/main` **frais**
(`git fetch origin && git checkout -b fix/<nom> origin/main`).

---

## L'état à la fin du lot 10

**Deux PR mergées et recettées.**

- **#1542 — `/mailbox`** (`3399f8521`). **5 issues closes** : #1397, #1398, #1399,
  #1400, #1402. Vérifiées en production, écran par écran.
- **#1543 — `/actions/chaines` → « Parcours »**. Mergée après CI verte.
  **Recette live faite** ; #1502 et #1504 closes si vertes, les autres commentées.

**Ce qui reste OUVERT, avec sa raison écrite dans l'issue :**

- **#1401** — le pont e-mail → objet métier (réponse favorable → Projet, fiche de
  poste → Besoin, CV → Vivier, AO, facture, réunion). Les six destinations
  existent comme écrans. Ce qui manque est la couche du milieu : le moteur détecte
  une INTENTION DE RECHERCHE, il ne qualifie pas un fil donné comme portant un
  besoin précis avec les champs à pré-remplir. Chantier.
- **#1503** — la dérivation automatique des parcours depuis les objets métier.
  Un projecteur par type d'objet + la détection d'incohérence. Plusieurs jours.
  ⚠️ **Ne pas livrer le contrôle de cohérence seul** : il signalerait un écart que
  rien ne sait réparer.
- **#1505** — le mini-parcours sur les fiches Besoin / Projet / Mission. Dépend
  de #1503 : sans dérivation, il afficherait ce que quelqu'un a saisi, donc
  exactement la « deuxième barre de statut » que le retour refuse.
- **#1506** — orchestration Parcours → Aujourd'hui / Laura / Action OS. Dépend
  de #1503. ⚠️ Le point 3 du retour (« tout reste dans Actions ») est **déjà tenu**.
- **#1507** — points 4 et 5 (« Pourquoi ? » + historique d'un dossier).
  ⚠️ **La matière EXISTE** : chaque franchissement de porte est journalisé avec
  son motif, et `GET /decision-gates/:subject/:subjectId` sait les relire. C'est le
  BRANCHEMENT qui manque. Candidat sérieux pour un prochain lot, avec #1503.

---

## Le lot suivant

- **PR 1 — `/actions` (5)** : `gh issue list --state open --label beta-feedback --search '"/actions" in:title'`
  ⚠️ Filtrer : la recherche attrape aussi `/actions/sequences` (3) et
  `/actions/chaines` (6, déjà traités). Ne garder que `/actions` nu.
- **PR 2 — `/watchlist` (5)** : idem avec `"/watchlist"`.

⚠️ **On RECETTE la première avant d'ouvrir la seconde.**

Autres files qui attendent : `/settings/mes-donnees` (5), `/settings/legal-entities` (4),
`/settings/import` (4), `/settings/catalogues` (4), `/propositions` (4).

---

## ⚠️⚠️ LE PIÈGE QUI PAIE DEPUIS TROIS LOTS : LA CAPACITÉ SANS PORTE

Trois fois au lot 9, **trois fois encore au lot 10**. Ce n'est plus une
anecdote, c'est le défaut n°1 du dépôt.

- `/mailbox` : les MESSAGES de chaque fil étaient récupérés par le serveur,
  repliés en fils par `groupIntoThreads` — **et jetés**. Le « drawer » réclamé
  depuis des semaines n'a coûté aucun appel fournisseur : il a suffi d'arrêter
  de perdre ce qui traversait déjà.
- `/actions/chaines` : `step.label`, chargé et traduit FR/EN **depuis le premier
  jour**, vivait dans un `title=`. L'écran affichait `{step.position}`. Le
  commentaire qui posait ce `title` l'admettait par écrit.
- `/actions/chaines` : les franchissements de porte sont **journalisés** et
  `GET /decision-gates/:subject/:subjectId` sait les relire. Personne ne demande.

**Trois mesures, AVANT de lire les issues :**

```sh
# a. un champ du contrat que RIEN ne lit à l'écran
grep -rn "le_champ" apps/web/src --include='*.tsx' | grep -v hooks/ | grep -v '\.test\.'
# b. une donnée rangée dans un attribut au lieu d'un pixel
grep -rnE "title=\{[^}]*\.(label|name|question)" apps/web/src --include='*.tsx'
# c. une route servie sans appelant
grep -rn "@Get('" apps/api/src/modules/<module> && grep -rn "<le chemin>" apps/web/src
```

## ⚠️ Le second piège du lot 10 : la garde qui tombe chez son NOUVEL hôte

`useFirstName` posé sur `MailboxPage` a fait tomber **GA-45**, une garde
d'architecture qui monte plusieurs écrans sans `SessionProvider`. Le hook tire
`useProfile` → `useSession` → exception.

La réparation garde le sujet : GA-45 **mocke le prénom** (un prénom n'est pas un
nom d'éditeur, donc son sujet est intact) et continue de lire ses 13 cas. Ne
JAMAIS réparer une telle garde en retirant l'écran de son corpus.

**Corollaire mesuré** : les assertions « le seul lien de la page »
(`getByRole('link')`) cassent dès qu'un écran gagne un lien permanent. Elles se
réécrivent **par NOM de lien**, pas en comptant.

## ⚠️ La garde BORGNE du lot 10 — celle-là est neuve et sournoise

Une contre-épreuve cherchait `"Appels d’offres"` avec une **apostrophe
typographique** (U+2019) alors que le fichier de langue porte une **apostrophe
droite** (U+0027). Elle ne trouvait donc JAMAIS rien — et un
`expect(...).not.toBeInTheDocument()` passe au vert précisément quand il ne lit
rien.

**Règle** : un libellé se cite **tel qu'il est dans le fichier de langue**
(`python3 -c "import json;print(repr(...))"`), jamais retapé à la main. Le dépôt
mélange les deux apostrophes.

## ⚠️ Le doublon de libellé qui casse une requête de test

`capabilities.cta` et le nouveau `connector.manage` valaient tous deux « Gérer la
connexion ». Deux liens, même nom accessible : `getByRole('link', {name})`
devient ambigu — **et la loi 4 du tome 7 l'interdit** (rien n'apparaît deux fois
sous la même forme avec le même contenu). Deux gestes distincts = deux mots
distincts (« Gérer la connexion » / « Revoir les autorisations »).
⚠️ Et `{ name: 'Gérer' }` matche aussi « Gérer la connexion » : nom EXACT, ou regex ancrée.

---

## Décisions parquées — recopiées, ne pas les re-poser

- **Renommage `/actions/chaines`** → tranché : **« Parcours »**. L'URL, `CHAIN_KEYS`
  et l'API **ne bougent pas** — un lien en favori doit continuer de marcher.
  ⚠️ Le nom vit à **deux** endroits : `nav.json` **et** `routes.json` (onglet du
  navigateur, fil d'Ariane). S'arrêter au premier laisse l'ancien nom.
- **#1503 dérivation automatique** → tranché : **parquer**, livrer la vue manager
  d'abord.
- **Signature de messagerie** → tranché : l'éditeur vit dans **Réglages › Profil ›
  Identité**, `/mailbox` n'en garde qu'un état + un lien. GA-26 est tenue (une
  seule porte d'écriture, une seule saisie).
- **Panneau de fil** → tranché : **métadonnées seulement**, jamais un corps de
  message. Vérifié en prod : aucune clé `body` ne circule.
- **#1396 logos comptes / avatars contacts** → défaut **(b)** : attendre le
  chantier « résolution de domaine vérifiée », qui bloque aussi #1319.3, #1427,
  #1415. **Ré-écarté au lot 10 sur `/mailbox`.**
- **#1510** « créer une cadence personnalisée » : le serveur le supporte, il
  manque l'ÉDITEUR d'étapes. ~1 j.
- **#1513** le résumé d'import · **#1514** la capacité Laura sur les séquences
  (⚠️ ses six interdits sont DÉJÀ tenus).
- **La section `today` répète son nom dans son premier onglet.** Proposé : « Ma
  journée » pour la SECTION. **Cinq autres sections** ont le même défaut. Pas fait.
- **Q3 logos éditeurs sur `/integrations` (#1442)** → défaut **(c)** : ne rien faire.
- **Q1 `/missions/board`** → tranché **(b)** : renommer « Historique », le sortir
  de « Piloter ». ~2 h, `sections.ts` seul. **PAS ENCORE FAIT.** Débloque #1376, #1380.
- **Q5 la garde GA-05 qui lit les commentaires** → tranché **(a)**. **PAS FAIT.**
- **« (client d'exemple) » reste dans le nom du compte en démo.** Écarté 3 fois.
- **Aucune valeur hexadécimale, aucune taille hors échelle.** Onze au lot 5, onze
  au lot 6, deux au lot 7, une dizaine au lot 8, deux séries au lot 9,
  **deux séries au lot 10** (#1402 et #1507). Les refuser **en le disant**.
- **`{{copilot}}` et `{{brand}}`, jamais « Laura » ni « Bellum » en dur** (GA-252).
- **Un prénom d'exemple dans une spec vient de la salle de démo** (« Maëlle ») :
  `useFirstName()`, jamais figé. Et **la formule se passe du prénom** quand il est
  inconnu — jamais « Ta messagerie, Utilisateur ».

---

## Deux littéraux refusés au lot 10, pour la forme du refus

Utile comme gabarit : le retour a raison sur le BESOIN, tort sur le MOT.

1. **« Gmail connecté »** → on nomme la CAPACITÉ. Ce qui répond vraiment à « d'où
   viennent ces mails » est l'**ADRESSE de la boîte**, plus précise qu'un nom de
   fournisseur pour qui a deux comptes chez le même éditeur.
2. **« dernière synchro 13:21 »** → cette messagerie n'est **pas synchronisée**,
   chaque recherche interroge le fournisseur en direct. Le `last_used_at` du
   connecteur répond à une AUTRE question. La ligne date donc **la lecture**.
3. **« Dossiers bloqués » + « décisions attendues »** → le **même état**
   (`state='blocked'` n'est posé que par une porte). Deux fois le même nombre sous
   deux noms fait douter de tout le tableau de bord. Garder le vrai, mettre à côté
   une mesure DIFFÉRENTE (« sans mouvement depuis 7 jours »).
4. **« étape la plus lente · 8,4 j »** → non mesurable (aucun horodatage par
   transition). Ce qui l'est : l'ancienneté médiane des dossiers ARRÊTÉS là.
   D'où « étape où l'on attend le plus », et **« Non mesuré »**, jamais « 0 jour ».

## ⚠️⚠️ CE QUE LA RECETTE A TROUVÉ AU LOT 10, ET QUE LA CI NE POUVAIT PAS VOIR

**Un champ serveur NEUF lu sans garde casse l'écran pendant tout le déploiement
— et casse DURABLEMENT les onglets déjà ouverts.**

`ChainRow` lisait `lane.chain.purpose[locale]`. Vercel sert le web en 2 min,
Railway l'API en 10 : pendant ce quart d'heure, l'écran neuf interroge l'API
PRÉCÉDENTE, `purpose` vaut `undefined`, et `undefined[locale]` **JETTE** au lieu
de dégrader. 14 exceptions en production, écran « Oups » complet.

⚠️ **Le pire n'est pas la fenêtre.** Un onglet ouvert PENDANT le déploiement
garde la réponse d'avant en mémoire ; l'écran jette au rendu, la frontière
d'erreur se referme, et le rafraîchissement n'est jamais committé. **L'onglet
reste cassé après que l'API est à jour.** Vérifié dans les deux sens au même
instant : onglet ancien = « Oups », onglet NEUF = écran parfait.

**Trois règles qui en sortent :**

1. **Un champ serveur ajouté ce lot-ci se lit avec une garde**, toujours :
   `chain.purpose ? … : null`. Le contrat serveur peut l'exiger ; le CLIENT ne
   peut pas en dépendre avant que l'API soit déployée.
2. **Le type du client décrit ce qu'il peut RECEVOIR, pas ce que le serveur
   promet.** Déclarer le champ obligatoire, c'est demander à TypeScript de
   garantir une propriété du réseau — et il cesse alors de vérifier quoi que ce
   soit. En l'assouplissant (`number | undefined`), le compilateur a
   immédiatement désigné deux autres lectures fautives.
3. **Un compteur absent vaut ZÉRO, pas NaN** — `sum + undefined` aurait affiché
   « NaN dossiers suivis ». ⚠️ Ne pas confondre avec « non mesuré » : une DURÉE
   absente reste `null` et s'affiche « Non mesuré ».

**Le geste de recette qui l'a trouvé** : ouvrir un onglet NEUF et comparer avec
l'onglet resté ouvert. Un seul des deux montre le défaut.

## ⚠️ Le défaut pris à temps : un défaut de filtre qui vide la démo

« Par défaut, montrer les blocages » — appliqué au littéral, un espace neuf **ou
la salle de démonstration** s'ouvre sur un écran VIDE. Le défaut se DÉRIVE :
rien ne bloque → on montre tout, les pastilles portant leur compte réel.
**À vérifier sur tout écran qui gagne un filtre par défaut.**

## Un compteur qui filtre = UN prédicat (rappel du lot 9, appliqué au lot 10)

`needsAttention` est la seule fonction qui décide : le compteur additionne ce
qu'elle rend, le filtre garde ce qu'elle rend. Un test compare **l'égalité des
deux chemins**, avec la contre-épreuve que le corpus n'est pas vide.

---

## L'outillage

- **Le `cwd` du Bash PERSISTE** entre appels — chemins absolus, ou `cd <racine> &&`.
  Payé 3 fois au lot 8, 2 au lot 9, **2 au lot 10**.
- **`vitest` d'`apps/web` résout `@bellum/contracts` vers `dist/`.** Après toute
  modification dans `packages/*` : `pnpm --filter @bellum/contracts build` AVANT
  la suite web, sinon le vert ne prouve rien.
- **RTK tronque et casse la sortie de `jest`** (« All parsing tiers failed ») :
  rediriger vers un fichier et lire le **code de retour**, pas le texte.
- **La suite web peut sortir en 0 avec des tests rouges** : lire
  `Test Files … failed` dans le log, pas seulement `$?`.
- **`commitlint` plafonne le sujet à 100 caractères.**
- **`prettier`** : `node_modules/.pnpm/prettier@3.8.2/node_modules/prettier/bin/prettier.cjs`.
- **Un `sleep` en premier plan est BLOQUÉ** : arrière-plan.
- `javascript_tool` coupe à **45 s** : 4 routes × 6,5 s max par appel.
- `ls` est intercepté et rend vide : utiliser `find`.

## Les gates, dans l'ordre

```sh
pnpm --filter @bellum/contracts build       # ⚠️ EN PREMIER si packages/* a bougé
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @bellum/api check-types && pnpm --filter @bellum/api check-types:tests
cd apps/web && node node_modules/vitest/vitest.mjs run     # ~7 556, ~4 min
pnpm --filter @bellum/contracts test                        # ~3 790
cd apps/api && npx jest --silent                            # lire le CODE DE RETOUR
pnpm --filter @bellum/web lint                              # ESLint — job CI à part
pnpm lint:exports:types                                     # knip
```

Puis **PR obligatoire**, merge sur **`CI Status`** — le check Railway
`belllum-backend-service` échoue TOUJOURS sur une PR. ~12 min de CI.

## Puis la recette live, non négociable

1. **Attendre que Vercel ET Railway servent le commit.**
   - Railway : `GET https://api.bellum-ai.com/version` → `.commit` (~8 min, il peut
     être DEUX commits en retard)
   - Vercel : le hash de `index-*.js` dans `https://app.bellum-ai.com/` doit CHANGER
   - Recette de boucle qui marche : script en arrière-plan comparant les deux.
2. **Reproduire le geste du client**, sur l'écran de l'issue.
3. **MESURER** — compter les occurrences, lire `getBoundingClientRect()`, comparer
   `scrollWidth`/`clientWidth`, **et interroger l'API en direct depuis la page**
   (`await fetch('/api/…',{credentials:'include'})`) pour vérifier la FORME servie.
4. **Balayer toute la navigation** : `history.pushState` + `PopStateEvent`,
   4 routes par appel, 6,5 s chacune.
   ⚠️ `/propositions` (pas `/proposals`) · `/agenda` n'existe PAS comme route.
   ⚠️ `/rfp` et `/propositions` rendent ~580 caractères : c'est leur ÉTAT VIDE
   normal, pas une panne. Le vérifier au texte avant de crier au défaut.
5. **La salle de démo montre ce que le compte de Louis ne peut pas.**
   ⚠️ Elle REMPLACE la session : Louis devra se reconnecter après.
6. Console + réseau : tout 4xx/5xx est un défaut. ⚠️ Le **503** sur
   `/crm/pipeline/report` est ATTENDU sur l'espace de Louis.
   ⚠️ Une adresse de CONTACT en `@gmail.com` fait rougir une recherche de nom
   d'éditeur : c'est une donnée du client, pas notre fournisseur. Vérifier
   l'élément avant de conclure.
7. **Ne clore que ce qui a été vu tourner.**
