# Décisions en attente — Louis, à traiter plus tard

Écrit le 04/09/2026. Louis n'était pas devant le poste ; tout ce qui suit a été
**parqué**, pas tranché. Rien de ce fichier n'est livré.

---

## Déjà répondu le 04/09 (pour mémoire, ne pas re-poser)

1. **Onglet « Équipe » de /dashboard** → **SUPPRIMÉ**, `/team` reste le seul cockpit
   d'équipe. Ferme #1457/#1458/#1459 et supprime la fuite de permission
   (`/dashboard/kpis` n'exigeait que le JWT là où `/manager/team-stats` exige
   `team:manage`). #1460→#1464 deviennent des retours sur `/team`.
2. **Parité démo** → **on tient la doctrine et on l'écrit**. Le cockpit Équipe,
   l'état « connecté » de /integrations et les bandeaux proactifs de /missions
   restent invisibles en démonstration, avec leur raison dans `demo-coverage.ts`.
   Ils se recettent en production.
3. **Laura** → **une primitive, deux poids**. `AskLaura` gagne un variant
   `prominent` réservé aux écrans de LISTE. La seconde implémentation de
   `/contacts` (qui échappait à la garde via `navigate()`) disparaît.
4. **Automatisations** → relances vers `/actions/chaines`, rituels vers `/team`.
   Pilotage garde une synthèse « 2 actives · 1 inactive → Gérer ».

---

## ⚠️ TRANCHÉES LE 04/09 (après-midi) — ne plus les poser

- **Q1 `/missions/board`** → **(b)** le renommer « Historique » et le sortir de « Piloter ».
  ~2 h, `sections.ts` seul. **PAS ENCORE FAIT.** Débloque #1376 et #1380.
- **Q5 la garde GA-05 qui lit les commentaires** → **(a)** corriger la garde ET poser le vrai
  `@Public` sur `unsubscribe.controller.ts`. **PAS ENCORE FAIT.**

Restent Q2, Q3, Q4 et Q6 ci-dessous.

## À trancher — les questions restantes

### Q1. `/missions/board` — que devient-il ? (#1376, #1380)

`mission-board-owns-no-state.spec.ts` donne raison au retour : le board ne
possède aucun état. **Mais c'est le seul écran qui montre les missions
TERMINÉES**, et `/missions` y renvoie par un lien d'état vide conditionnel
(`MissionsPage.tsx:185-188`).

⚠️ **Le coût de (a) a été RÉVISÉ à la hausse après vérification.**
`packages/contracts/src/schemas/object-forms.ts:559-564` déclare la forme
`f3_kanban` de l'objet Mission comme une case `○` de la matrice objet × forme,
tenue par **GA-74**. Cette garde fait deux choses gênantes : elle vérifie
l'existence du fichier sur le disque (`routes/missions/board.tsx`), et elle
compare le total `67 ● · 15 ○ · 37 —` à des chiffres **ancrés sur un document
source** (`T7.md:528-545`). Retirer le board fait donc 14 ○ / 38 —, et corriger
le total demande d'assumer par écrit une contradiction avec la source.

- **(a)** Retirer de la navigation + rediriger, après avoir créé une lentille
  « Terminées » sur `/missions`. **~1,5 j** — et ça fait PERDRE une forme que le
  dépôt a délibérément livrée, pour régler une hésitation de navigation.
- **(b)** Le garder, le sortir de la section « Piloter », le renommer
  « Historique ». **~2 h**, `sections.ts:322` seul. La matrice, GA-74 et le lien
  vers les missions terminées restent intacts. **C'est ce que je recommande** :
  ça règle le geste empêché de #1376 (« ne jamais hésiter entre Pipe et Board »)
  sans toucher à une forme livrée.
- **(c)** Ne rien faire.

**Rien n'est livré là-dessus. #1376 et #1380 restent ouvertes.**

### Q2. Le bandeau proactif de Laura sur Missions (#1367, #1375, #1384)

Les règles d'intervention **existent déjà** (`intervention-rules.ts:652` :
`mission_without_end_date`, `renewal_at_risk` à 30 j). Les faire remonter à
l'écran est ~1 j.

⚠️ Conséquence de ta réponse n°2 ci-dessus : ce bandeau sera **invisible dans la
salle de démonstration** (`laura_interventions` est vide à dessein, le balayeur
exclut les espaces démo) — donc invisible là où ces 40 retours ont été pris.

- **(a)** Bouton `AskLaura` seul sur les 4 écrans Missions. ~0,5 j. **← ce que je
  livre par défaut, parce que ça ne demande aucun arbitrage.**
- **(b)** (a) + le bandeau proactif. ~1 j, invisible en démo.

### Q3. Les logos des éditeurs sur /integrations (#1442.1)

Nommer l'éditeur en TEXTE y est déjà autorisé. Un **logo** est une autre
question : aucun mécanisme n'existe (ni SVG embarqués, ni service de logos).

- **(a)** 16 SVG embarqués. ~1 j — licence/marque à vérifier par éditeur.
- **(b)** Réutiliser le relais anti-SSRF existant (`logo-source.ts`, repli
  favicon Google) + une table connecteur → domaine. ~0,5 j, qualité inégale.
- **(c)** Garder les icônes, mais **distinctes** par connecteur + teinte de
  famille. ~2 h. **← je livre uniquement la correction du BUG (Odoo et Attio
  partagent aujourd'hui la même icône `Boxes`), pas le choix esthétique.**

### Q4. L'état d'entrée du Proposal Studio (#1456.1)

La liste des besoins éligibles demande un « niveau de préparation » par besoin.
Le moteur est **sans table par décision assumée** : un avancement par besoin =
un assemblage complet par besoin.

- **(a)** Liste sans avancement (compte, besoin, stade, nb de positionnements).
  ~2 h. **← livré par défaut, c'est le socle des deux autres.**
- **(b)** Avancement calculé pour les 10 premiers seulement. ~0,5 j de plus.
- **(c)** Stocker l'avancement — **contredit la raison écrite du refus**.

---

## Ce que je NE te demande pas, parce que c'est l'application d'une règle écrite

Ces points-là sont tranchés par la doctrine du dépôt, pas par un goût. Ils sont
livrés tels quels, et le commentaire de clôture cite la règle.

- **/mailbox ne nommera pas Gmail ni Outlook** (#1398.1) — la liste d'exceptions
  porte « ne peut que RÉTRÉCIR », et `/features/mailbox/` n'y est pas. On livre
  « Ta messagerie est branchée · Lecture ✓ · Envoi non autorisé » + un lien vers
  Réglages › Intégrations, où le nom est légitime.
- **Pas de « dernière synchro 13:21 »** (#1398.2) — aucun champ de synchro
  n'existe. On expose `last_proof_at` (une lecture réelle et datée) ou rien.
- **Les 5 indicateurs partenaires non collectés sont NOMMÉS** (#1428, #1431) —
  aucune mission n'est rattachable à un partenaire ; les dériver serait une
  donnée fictive. Les 2 mesurés s'affichent en barres.
- **« (client d'exemple) » reste dans le nom du compte** (#1350 et jumelles) —
  c'est l'une des trois précautions écrites du jeu de démonstration, et un test
  l'exige.
- **Aucune palette hexadécimale, aucune taille hors échelle, aucun radius en
  pixels** — onze valeurs de ce genre dans les specs. L'intention passe en
  jetons ; c'est noté dans chaque commit.
- **Les deux files du brief restent côte à côte** (#1391) — ta décision du
  01/09 est écrite dans le code. Le défaut réel (la même tâche affichée deux
  fois, et la copie INERTE) se règle sans y revenir.

---

## Constat à te signaler — trois specs closes sur leurs points faciles

| Série d'aujourd'hui | Spec antérieure CLOSE | Ce qui s'est passé |
|---|---|---|
| #1412-1417 (`/accounts`) | #1316, 7 points | 4 livrés, 3 non livrés → reviennent |
| #1426-1431 (`/partners`) | #1319, 8 points | 4 livrés, 4 non livrés → reviennent |
| #1432-1440 (`/pilotage`) | #1322, 7 points | **2 livrés sur 7** → 5 reviennent |

C'est l'interdit §7 du skill : *« une spec ne se clôt pas sur ses points
faciles »*. La question n'est pas « que faire de 28 retours » — c'est « on finit
trois specs ».

**#1462 est intégralement contenue dans #1463** (même texte, #1463 ajoute
« CAPITALISATION »). Doublon à clore, mais le skill interdit de clore un doublon
sans ton accord nommé : les deux restent ouvertes et seront traitées ensemble.

---

## Faits vérifiés en cours de route, à savoir avant de trancher

- **L'onglet « Équipe » de /dashboard n'est gardé par AUCUNE permission** —
  zéro occurrence de `team:manage` dans `apps/web/src/features/dashboard/`.
  `nav-gates-on-permission.test.ts:20-23` ne couvre **que** la navigation, et le
  dit explicitement : c'est le trou par lequel l'onglet passe. Ta décision de le
  supprimer ferme cette fuite.
- **LinkedIn est masqué du catalogue d'intégrations** (D357) : c'est le seul
  `source: { kind: 'catalog' }`, toujours `coming_soon`. Le « 16 » affiché n'est
  donc pas le nombre d'entrées du registre — c'est ce qui reste après masquage.
  Toute refonte du catalogue doit conserver ce filtre.
- **Un défaut de fond trouvé par la recette live du 04/09, déjà corrigé**
  (PR #1480) : `buildQueryString` jetait TROIS filtres de la liste de contacts
  (`state`, `includeExcluded`, `unassigned`). Les pastilles de cycle de vie ne
  filtraient donc rien, ni côté serveur ni côté client, alors que trois
  commentaires affirmaient « filtré SERVER-side ».

---

## Deux points NEUFS, sortis du lot « un seul cockpit d'équipe » (#1484, mergé)

### Q5. ⚠️ Une garde de sécurité compte un COMMENTAIRE comme une déclaration

`endpoint-guards.spec.ts` (**GA-05**) vérifie que chaque route déclare sa
permission. Elle traite `@RequirePermission` écrit **dans un commentaire** comme
une vraie déclaration. Mesuré : **2 contrôleurs** sont dans ce cas.

C'est une garde borgne de plus, et celle-là porte sur les permissions.

⚠️ La corriger fait apparaître `apps/api/src/modules/mailer/unsubscribe.controller.ts`
comme non déclaré : il mentionne `@Public` **en prose**, sans porter ni le
décorateur ni aucun `@UseGuards`. Et l'ajouter à la liste figée est refusé par
la garde elle-même.

- **(a)** Corriger la garde ET poser le vrai décorateur sur `unsubscribe`
  (c'est une route de désinscription, publique par nature — mais elle doit le
  DIRE, pas le suggérer).
- **(b)** Corriger la garde et traiter `unsubscribe` séparément.
- **(c)** Laisser — je le déconseille : une garde de permissions qui lit des
  commentaires ne garde rien.

**Rien n'est fait. À trancher.**

### Q6. La capacité « briefing de la semaine » n'a plus de surface

Sa carte était rendue par le cockpit supprimé. `POST /ia/weekly-briefing`, le
routeur FastAPI et le prompt `BELLUM-WEEKLY` **restent** — capacité livrée le
18/07, avec son entrée de changelog.

- **(a)** La resurfacer sur `/team`, où vit désormais le cockpit d'équipe.
- **(b)** La retirer (moteur compris) — elle n'a plus de lecteur.
- **(c)** La laisser dormante — c'est du code juste que personne n'appelle,
  exactement le défaut n°1 du dépôt.

**Rien n'est fait. À trancher.**

### Pour information, tranché sans toi (nettoyage refusé, pas fait)

Les schémas de contrat du cockpit supprimé (`dashboardMetricsResponseSchema`,
`dashboardRoi*`, `dashboardCockpit*`) n'ont **plus aucun lecteur**. Ils portent
maintenant un avertissement en tête de fichier — « ne pas rebâtir dessus » — et
attendent un nettoyage dédié. Les supprimer dans ce lot aurait dépassé la
décision que tu avais prise.
