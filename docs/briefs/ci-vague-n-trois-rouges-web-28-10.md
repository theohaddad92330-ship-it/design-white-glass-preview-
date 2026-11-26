# Brief — les trois rouges web de la vague N (branche `integration-vague-n-2810`)

Tu travailles **sur la branche `integration-vague-n-2810`**, pas sur `main`. Tu la prends telle
qu'elle est sur `origin` et tu y ajoutes tes commits. **Base : `8c898a3e9d`.**

**Plafond : 300 tours.** À 240, tu commites ce qui est vert, tu écris ton rapport, tu t'arrêtes.

## Le contexte en trois phrases

La vague N fusionne onze lots. Sa CI se coupe au premier rouge, donc elle sort « cancelled » : les
vrais échecs sont **trois tests web** dans les shards 1/4 et 4/4 du run `40702291682`. Les trois
passent sur `main` (CI verte sur `6e406862e1`) : **ce sont des régressions d'intégration**, pas
des rouges préexistants. Le rouge pytest qui précédait est corrigé (`8c898a3e`).

## Périmètre

`apps/web/src/features/today/TodayCard.planMail.test.tsx` ·
`apps/web/src/features/integration-center/view/SyncLaunchFlow.test.tsx` ·
`apps/web/src/features/chat/view/demo-runs-the-real-shell.test.tsx` · et **le code de production
que ces trois tests lisent**. Rien d'autre. Un débordement est une QUESTION dans ton rapport, pas
une livraison « tant qu'on y est ».

---

## Rouge 1 — #4521.5 : deux décisions vraies, un test écrit sur le littéral de l'une

`TodayCard.planMail.test.tsx:119` :

```
Expected : title="Marque l’action comme traitée — ce n’est pas une preuve d’envoi."
Received : title="Marque l’action comme traitée et planifie les relances J+3, J+6, J+9 — ce n’est pas une preuve d’envoi."
```

**Ce n'est pas un défaut de code.** Deux décisions se rencontrent :

- **#4521.5** — « Fait » ne porte JAMAIS de preuve d'envoi (doctrine : un geste déclaratif ne se
  confond pas avec un envoi vérifié). La phrase reçue la respecte : elle finit par
  « ce n'est pas une preuve d'envoi ».
- **#4418.1** — « Marquer envoyé » planifie la même cadence qu'un envoi Bellum, et la cadence est
  **J+3 / J+6 / J+9** (arbitrage de Louis du 23/10). La phrase reçue le DIT à l'utilisateur ;
  l'ancienne le cachait.

**Ce que tu fais** : la garde doit protéger la RÈGLE, pas le littéral d'une version. Réécris
l'assertion pour qu'elle exige les deux choses — que le titre nie la preuve d'envoi **et** qu'il
nomme la cadence — sans figer la phrase entière. Et **garde son NON** : ajoute (ou vérifie) qu'un
titre qui affirmerait un envoi (« envoyé », « preuve d'envoi » sans négation) fait échouer le test.
Ne touche pas au libellé de production : il est le bon.

## Rouge 2 — #4591 : le lancement de synchro ne part plus

`SyncLaunchFlow.test.tsx:321` : `expect(syncRun).toHaveBeenCalledTimes(1)` → **0 appel**.

Là, **c'est un vrai défaut** : après `launch('2026-10-26T10:00:00.000Z')`, la synchro n'est pas
lancée du tout. Le test suivant vérifie qu'elle ne sonde pas plus d'une fois toutes les 5 s — donc
le sondage espacé de #4591 est bien la zone touchée.

**Ce que tu fais** : trouve ce que la fusion a changé sur le chemin de lancement
(`git log -p origin/main..HEAD -- apps/web/src/features/integration-center`), répare **le code de
production** pour que le lancement reparte, et vérifie que le reste du fichier reste vert (le
sondage espacé, l'attente nommée). Si la cause est qu'un lot a volontairement déplacé le
lancement, dis-le dans ton rapport et garde les deux comportements.

## Rouge 3 — #1914 : la coque de démo n'offre plus ses amorces

`demo-runs-the-real-shell.test.tsx` :
`Unable to find an accessible element with the role "button" and name "Par où je commence dans mon portefeuille ?"`

Le vidage des rôles accessibles montre que la coque de `/chat` est bien montée (section « Laura —
fil partagé », aside « Tes conversations avec Laura », boutons « Replier les conversations »,
« Voir tes conversations », « Changer ce que Laura lit ») — **mais aucune amorce**.

**Ce que tu fais** : trouve qui a retiré ou renommé les amorces de la coque de démonstration
(pistes : le lot W2 #4611 « Laura dit où en est le travail », le lot #4563 « offres de Laura », ou
le semis de démo). Deux issues possibles, et c'est TOI qui tranches sur preuve :

1. l'amorce existe toujours sous un autre libellé ⇒ le test suit le libellé réel ;
2. l'amorce a disparu ⇒ c'est une régression user-facing, tu la rétablis dans le code.
   ⚠️ **Craft rule n°9 du dépôt** : toute fonctionnalité user-facing doit AUSSI être remplie en mode
   démo. Une amorce absente en démo est un écran vide qu'un prospect verra. Si tu rétablis le semis,
   pense à `apps/api/src/modules/demo/demo-dataset.ts` et au classement dans `demo-coverage.ts`.

---

## Comment tu vérifies, et seulement ça

```sh
cd apps/web && npx vitest run src/features/today/TodayCard.planMail.test.tsx
cd apps/web && npx vitest run src/features/integration-center/view/SyncLaunchFlow.test.tsx
cd apps/web && npx vitest run src/features/chat/view/demo-runs-the-real-shell.test.tsx
cd apps/web && npx tsc --noEmit -p .        # et tu COMPTES les « error TS »
```

- ⚠️ `pnpm --filter @bellum/web test -- <chemin>` **ne filtre RIEN** (399 fichiers, 61 s) : le `--`
  passe le motif à vitest qui l'ignore. Utilise la forme ci-dessus.
- ⚠️ `tsc` lancé depuis la racine ou via `rtk` annonce un **faux vert**.
- **Aucune suite complète, aucun build, aucun `check-types` racine** : c'est le travail de la CI.
- Si tu touches une clé i18n : parité **fr ET en**, stricte.
- Avant de conclure qu'un fichier est propre, cherche les **gardes qui LISENT ce que tu changes** :
  `git grep -l '<la clé ou le champ>' apps/web/src/architecture packages/contracts`. Le 28/10,
  #4702 a mis `main` en rouge exactement comme ça.
- Titre de commit : **100 caractères maximum** (commitlint bloque).

## Ce que tu ne fais pas

- Tu ne passes **aucun** test en `skip`, tu n'en supprimes aucun, et tu ne relâches pas une
  assertion pour faire passer la CI : une garde doit toujours savoir dire NON.
- Tu ne touches pas aux branches ni aux fichiers Boond (`claude/boond-*`), ni à
  `integration-vague-o-2810` (un intégrateur y travaille en parallèle).
- Tu ne pousses jamais sur `main`, et jamais avec un `git push` nu
  (`push.default=upstream` sur ce dépôt enverrait sur main) : `git push origin HEAD:refs/heads/integration-vague-n-2810`.
- Tu n'écris **rien** dans `.claude/` : une demande de permission sans répondant y fige un agent
  cloud à vie.

## Ton rapport — un FICHIER, 15 lignes maximum

`docs/briefs/rapport-ci-vague-n-28-10.md`, commité sur la branche. Il dit : le SHA poussé · pour
chacun des trois rouges, la cause réelle et ce que tu as changé (test ou code, et pourquoi) · la
sortie des trois `vitest run` et le compte d'`error TS` · tout conflit de fond que tu as nommé
sans trancher · ce que tu n'as pas fait. Pas de récit.
