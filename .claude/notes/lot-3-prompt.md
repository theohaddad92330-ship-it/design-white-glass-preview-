/issues

Lot 3. Le lot 2 est clos et vérifié en production — repartir de `origin/main` frais.

## État à la reprise

- **4 PR mergées et recettées** : #1475 (`/projects`), #1476 (correctif tableau),
  #1477 (chat démo + Besoins), #1478 (correctif tuiles).
- **15 issues closes et vérifiées en prod** : #1315→#1322, #1323→#1334.
- **3 fils restent ouverts**, chacun sur une question posée à toi :
  - **#1473** — contact sans entreprise. **Tu as dit OUI, ce n'est pas commencé.**
  - **#1335** — le détail d'un besoin : page à 5 onglets ou tiroir ? (ma réponse
    est dans le fil : le tiroir coûte les onglets et les liens `?match=`).
  - **#1472** — les maquettes sont retrouvées et exploitées ; le fil attend que
    tu dises si la densité obtenue te va.

## Ce qu'il reste à faire — #1473, chiffré

`contacts.account_id` est `NOT NULL`. Le chantier :

1. **Migration** : colonne nullable. Élargir AVANT le code qui écrit (GA-11/12).
2. **Deux jointures INTERNES à passer en LEFT** — ce sont les seules qui feraient
   DISPARAÎTRE un contact sans compte :
   - `apps/api/src/modules/contacts/contacts.service.ts:850`
     (`.innerJoin('accounts', 'account', 'account.id = contact.account_id')`) —
     c'est la LISTE, donc le défaut le plus visible ;
   - `apps/api/src/modules/tasks/tasks.service.ts:232`.
3. **Le reste du code est déjà défensif** : une douzaine de
   `contact.account_id ?? null` / `contact.account_id ? … : …`, et même un
   commentaire qui dit « `contacts.account_id` est NOT NULL en base ; ce garde
   est là quand même ». Vérifier, ne pas tout réécrire.
4. **L'écran** : fiche contact, onglet Contacts d'un dossier, logo emprunté au
   compte, favoris, couverture d'organigramme, matching, export — pour chacun,
   « que montre-t-on quand il n'y a pas de compte ? ». Un contact sans compte va
   dans « À qualifier ».
5. **Démo** (craft rule n°9) + **gardes** : une garde qui prouve qu'un contact
   sans compte reste VISIBLE dans la liste — c'est le point qui casse en silence.

## Décisions déjà tranchées — ne pas les re-poser

- **~10 issues par PR**, et **on recette la première avant d'ouvrir la seconde**
  (03/09). Le skill le porte (§4). `issues-no-stop` existe pour les lots où tu ne
  peux pas relancer.
- **#1320** : `isDemo` choisit le MOTEUR, plus l'écran. **Fait.**
- **#1324** : les cartes KPI GARDENT leur sémantique. **Fait**, et un test le tient.

## Pièges payés dans le lot 2 — ne pas les repayer

- **La recette live trouve ce que 7 200 tests ne voient pas.** Les trois défauts
  du lot n'étaient visibles qu'en COMPTANT à l'écran : `document.querySelectorAll
  ('table tbody tr').length`, la hauteur des lignes, deux chiffres côte à côte.
  Charger la page ne prouve rien.
- **Un hook ajouté à un écran casse des tests qui n'en parlent pas.**
  `useWorkspaceMembers` → `useSession()` **jette** hors provider (20 tests d'un
  coup) ; `useIsDemo` → react-query (4 suites). Lancer la suite COMPLÈTE de
  l'app avant de commiter.
- **Une garde qui perd sa maison devient verte sur du vide.** GA-134 lisait
  `PipelineBoard.tsx` ; le libellé a déménagé dans `PipelineKpis.tsx`. La
  rebrancher, jamais l'assouplir — et préférer une assertion de STRUCTURE (« ce
  nombre a un frère qui le nomme ») à une chaîne, qui meurt au premier
  changement de mise en page.
- **Le shell mange les backticks** dans un `gh issue comment --body "…"` :
  trois noms de fichiers ont disparu d'un commentaire. Passer par
  `--body-file`.
- **`git stash pop` sur un arbre propre dépile une remise de husky.** Ne jamais
  stasher pour « comparer avec main » : utiliser `git show <sha>:<fichier>`.
- **Un test lourd peut expirer en CI sans régression** :
  `chat-nav-route.integration.test.tsx` fait 23 s en local pour deux tests. Le
  même code était passé sur la PR précédente → `gh run rerun --failed`, pas une
  correction de code.
- `rg` et `ls` sont interceptés dans ce shell ; le cwd du Bash PERSISTE.
