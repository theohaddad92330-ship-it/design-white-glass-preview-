# PR #2236 — couche BU / agence : par où la lire

Décision 12 du 15/09 : **Louis lit la PR en ENTIER.** Ceci n'est pas un résumé qui
remplace la lecture — c'est l'ordre dans lequel la lire, et les quatre endroits où
je regarderais le plus longtemps.

**État** : fusionnée le 15/09/2026 à 09:51. **+1 902 / −10 sur 29 fichiers.**
Elle est donc **déjà en production**.

---

## Ce qu'elle fait, en un paragraphe

Elle ajoute une dimension « BU / agence / équipe / territoire » à l'espace, et un
**filtre de LECTURE** : un membre peut être restreint à ses périmètres. Le niveau
d'accès est porté par `workspace_members`, pas par un rôle déclaré. Le défaut est
`'workspace'` — **tout l'espace, exactement comme avant** — et `'business_unit'` est
un **rétrécissement** qu'un responsable pose explicitement
(`packages/contracts/src/schemas/business-unit.ts:86-92`).

---

## L'ordre de lecture (1 h environ, dans cet ordre)

| # | Fichier | Pourquoi celui-là d'abord |
| - | ------- | ------------------------- |
| 1 | `packages/contracts/src/schemas/business-unit.ts:82-100` | Les deux seuls niveaux d'accès et leur commentaire. Tout le reste en découle. |
| 2 | `apps/api/src/modules/business-unit/business-unit.service.ts:60-99` | `scopeFor()` — **LA** règle d'accès, résolue une fois, au bord. 40 lignes. Si une seule chose est lue, c'est celle-là. |
| 3 | `apps/api/src/migrations/1793710000000-BusinessUnits.ts:54-165` | Trois tables neuves + une colonne sur `workspace_members`. Cinq `CHECK`. Additive. |
| 4 | `apps/api/src/modules/business-unit/business-unit-scope.spec.ts` (309 lignes) | Les sept règles, chacune nommée. C'est le document le plus lisible de la PR. |
| 5 | `apps/api/src/modules/accounts/accounts.service.ts` + `.controller.ts` | Le seul APPELANT réel aujourd'hui. C'est là que le filtre touche des données. |

---

## Les sept règles, telles que les tests les nomment

Chacune est un `it(...)` de `business-unit-scope.spec.ts` — les intitulés sont en
français et se lisent seuls :

1. **Un membre d'une BU ne voit pas les données d'une AUTRE BU du même espace**
   (`:96`) — et l'agrégat de portefeuille porte **la même clause** que la liste
   (`:115`), ce qui est le piège habituel : filtrer la liste et oublier le total.
2. **Un membre d'une BU ne voit RIEN d'un autre espace** (`:141`) — « la borne
   d'espace SURVIT à l'arrivée du filtre de périmètre » (`:142`). C'est le point
   qui m'inquiétait le plus, et il est testé nommément.
3. **Les appartenances se lisent sur le COUPLE espace + utilisateur**, jamais
   l'utilisateur seul (`:157`) — sinon les périmètres d'un autre espace entrent
   dans le filtre.
4. **Qui n'est pas membre de l'espace est cloisonné à rien, jamais ouvert à tout**
   (`:182`).
5. **Un identifiant manquant LÈVE** — il ne devient pas « pas de filtre » (`:191`).
   Raison écrite dans le code : TypeORM **ignore** une condition `undefined`, donc
   `findOne({ where: { id: undefined } })` rend la PREMIÈRE ligne. Sans ce
   garde-fou, un identifiant perdu en route ouvrait l'espace entier.
6. **Le niveau qui voit tout continue de tout voir** (`:202`) — et « le défaut
   d'appel, sans le paramètre du tout, est **byte-identique** à avant » (`:211`).
   C'est la preuve de non-régression.
7. **Une donnée SANS BU reste visible de qui la voyait avant** (`:242`) — la clause
   garde sa seconde moitié, « OU rattaché à aucun périmètre ».

Plus une huitième, qui est la garde de la garde : **« le corpus n'est pas vide :
la garde LIT du code réel »** (`:269`) — dont *« aucune route du module BU ne
reçoit un `workspaceId` du client »* (`:291`) et *« le service ne lit jamais une
table de périmètre sans borner l'espace »* (`:300`).

---

## Les quatre endroits où je regarderais le plus longtemps

**1. ⚠️ La tension avec ta décision n°2 du 15/09 au soir.** Tu avais tranché :
> « La BU est **un libellé déclaratif**, pas une partition. Réponse de questionnaire
> + filtre de lecture. **Ni données propres ni droits propres.** »

Or cette PR crée **trois tables** (`business_units`, `business_unit_members`,
`business_unit_access_requests`) et **une colonne d'accès par membre**. C'est plus
qu'un libellé. Ma lecture : elle reste du côté de ta décision parce qu'elle ne
donne **aucun droit supplémentaire** — elle ne fait que **retirer** de la vue, et
le défaut ne retire rien. Mais c'est exactement la frontière, et c'est toi qui
dois dire si elle est au bon endroit. **C'est la question n°1 de ta relecture.**

**2. ⚠️ MESURÉ, et c'est un trou réel : la LISTE est filtrée, la FICHE ne l'est pas.**
J'ai suivi les appelants plutôt que de te laisser la question. Le périmètre BU est
résolu à **deux** endroits, tous les deux dans `accounts.controller.ts` :
- `@Get()` la liste des comptes — `:301`, filtrée ✅
- `@Get('market-memory-portfolio')` l'agrégat — `:542`, filtré ✅ (le test `:115`
  dit vrai : les deux portent la même clause)

**Mais `@Get(':id')` — ouvrir UN compte — ne le porte pas** :
`accounts.controller.ts:1155` appelle `findOneForWorkspace(id, workspaceId)`
(`accounts.service.ts:1676`), dont la signature ne prend **que** l'identifiant et
l'espace. Aucun périmètre.

Conséquence concrète : un membre mis en `'business_unit'` ne verrait pas un compte
de l'agence de Lyon **dans sa liste**, mais pourrait l'**ouvrir par son URL directe**.
Le cloisonnement tient sur la liste et tombe sur la fiche. Et les ~18 autres routes
de lecture de ce contrôleur (`:id/timeline`, `signals`, `needs`, `sectors`,
`hygiene`, `similar-to-explore`…), plus une dizaine d'autres modules qui lisent
`AccountEntity` directement, sont dans le même cas.

**Ce qui rend ça non urgent — et seulement ça** : la dimension est **inerte
aujourd'hui**. Tout le monde est à `'workspace'` par défaut, donc personne n'est
cloisonné, donc rien ne fuit à cette heure. Le trou s'ouvre **le jour où quelqu'un
pose le premier `'business_unit'`**. C'est donc à corriger AVANT que la
fonctionnalité serve, pas après. Défaut enregistré.

**3. `business_unit_access_requests` — qui décide ?** `decideAccessRequest()`
(`business-unit.service.ts:269`) accorde l'accès à un périmètre. Quelle permission
faut-il pour l'appeler ? C'est la seule écriture de la PR qui **élargit** ce que
quelqu'un voit, donc la seule qui puisse servir d'élévation de privilège.

**4. La migration touche `workspace_members`.** `ALTER TABLE workspace_members`
(`:161`) ajoute la colonne d'accès. Le commentaire dit que toute ligne existante
porte `'workspace'` après migration, « donc personne ne perd un accès le jour du
déploiement ». **À vérifier de tes yeux** : que la colonne soit `NOT NULL DEFAULT
'workspace'` ou nullable-lue-comme-`'workspace'`, et que le test `:233` (« une
colonne encore vide en base vaut `workspace` ») corresponde bien à ce que la
migration écrit.

---

## Ce que je n'ai PAS vérifié

- **Le web.** La PR est entièrement API + contrats. Aucun écran ne lit encore le
  niveau d'accès (`accessOf()` existe « pour que l'écran le NOMME », #2081.21) —
  donc **aucun utilisateur ne voit aujourd'hui qu'il est cloisonné**. Si un membre
  est mis en `'business_unit'`, il verra moins de comptes sans qu'aucun écran ne
  lui dise pourquoi. C'est un défaut d'écran à ouvrir, pas un défaut de cette PR.
- **La recette en production.** Elle est fusionnée depuis ce matin ; je n'ai pas
  posé de membre en `'business_unit'` sur ton espace pour le voir tourner. Tant
  que personne n'est cloisonné, le code est inerte — ce qui est aussi la raison
  pour laquelle il peut être fusionné sans risque immédiat.
