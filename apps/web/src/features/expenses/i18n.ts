import i18n from 'i18next'
import enExpenses from '@/i18n/locales/en/expenses.json'
import frExpenses from '@/i18n/locales/fr/expenses.json'

/**
 * Le namespace `expenses`, enregistré depuis la FONCTIONNALITÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE N'EST PAS LA CONVENTION DU DÉPÔT — ET C'EST DÉLIBÉRÉ, POUR UN LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * La convention est : créer les deux JSON, les importer dans
 * `apps/web/src/i18n/resources.ts`, ajouter le nom à `NAMESPACES` dans
 * `apps/web/src/i18n/config.ts`. Ces deux fichiers étaient HORS du périmètre de
 * ce lot (ils sont partagés entre plusieurs agents en parallèle, et deux lots
 * qui y touchent le même jour se marchent dessus).
 *
 * `addResourceBundle` est une API publique d'i18next et produit exactement le
 * même résultat à l'exécution. Ce que ce détour NE reproduit pas, c'est la
 * garde : `apps/web/src/i18n/parity.test.ts` itère `NAMESPACES`, donc il
 * n'aurait rien vu de ce namespace-ci. D'où `expenses.i18n.test.ts`, à côté,
 * qui refait la MÊME vérification FR/EN sur ces deux fichiers — sans elle, ce
 * lot aurait livré deux catalogues que rien ne compare.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'INTÉGRATEUR DOIT FAIRE — et ce fichier disparaît
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `resources.ts` : importer les deux JSON et ajouter `expenses: frExpenses`
 *     / `expenses: enExpenses` aux deux catalogues ;
 *  2. `config.ts` : ajouter `'expenses'` à `NAMESPACES` ;
 *  3. supprimer ce fichier et son import dans `ExpenseReportsPage.tsx`.
 *
 * `parity.test.ts` couvrira alors le namespace, et `expenses.i18n.test.ts`
 * pourra être retiré — mais le garder ne coûte rien.
 *
 * `deep: false, overwrite: false` : si l'intégrateur fait le branchement
 * statique AVANT de supprimer ce fichier, l'enregistrement statique GAGNE et
 * les deux ne se contredisent pas pendant la transition.
 */
function registerExpensesNamespace(): void {
  i18n.addResourceBundle('fr', 'expenses', frExpenses, false, false)
  i18n.addResourceBundle('en', 'expenses', enExpenses, false, false)
}

/**
 * ⚠️ Enregistré À L'IMPORT, et pas appelé depuis un écran.
 *
 * La première version exposait la fonction et la page l'appelait. Le tiroir, lui,
 * s'importe aussi tout seul — dans ses propres tests, et demain dans un autre
 * écran — et il partait alors sans catalogue : huit clés brutes à l'affichage,
 * sans erreur et sans rouge ailleurs. C'est la version de « code juste que
 * personne n'appelle » qui se produit quand l'appelant est le mauvais.
 *
 * Un effet de bord de module s'exécute une fois par module chargé, quel que soit
 * celui des deux écrans qui arrive en premier. Les deux vues font donc
 * `import '../i18n'`, sans binding : c'est un import à effet, que le bundler ne
 * peut pas supprimer.
 */
registerExpensesNamespace()
