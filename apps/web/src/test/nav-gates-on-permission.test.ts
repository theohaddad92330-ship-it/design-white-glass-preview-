import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La navigation garde sur une PERMISSION, jamais sur un rôle littéral.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT DU 22/08
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur a ouvert l'écran de pilotage à `team:manage` — donc à `sales_ops`,
 * dont la définition même est « commercial + gestion d'équipe ». Deux composants
 * de navigation ont continué de comparer le rôle à `owner`/`admin`. Résultat :
 * un droit accordé côté API, et l'entrée de menu toujours cachée à ceux à qui on
 * venait de l'ouvrir. Le correctif s'était arrêté à mi-chemin.
 *
 * Un test de rôle en dur ignore par construction les permissions accordées
 * membre par membre — c'est-à-dire la moitié du RBAC.
 *
 * ⚠️ Cette garde ne vise QUE la navigation. Un écran peut légitimement refléter
 * un gate serveur plus étroit (changer un rôle reste réservé au propriétaire) ;
 * ce qui n'est jamais légitime, c'est de CACHER une entrée de menu sur un test
 * qui n'est pas celui du serveur.
 *
 * ⚠️ CE QU'ELLE NE PEUT PAS VOIR — mesuré le 04/09/2026 (#1457). Un second
 * cockpit d'ÉQUIPE vivait sous un onglet de `/dashboard`, nourri par des routes
 * d'API qui ne portaient que `JwtGuard`. Cette garde-ci ne pouvait pas
 * l'attraper, et pas par oubli : l'écran n'avait aucune entrée de menu, donc
 * rien à cacher ni à garder dans `src/components/navigation` — son corpus. Un
 * onglet n'est pas de la navigation au sens où elle l'entend.
 *
 * L'élargir aux ÉCRANS supposerait de reconnaître « cet écran sert des données
 * d'équipe » dans du JSX, ce qu'aucune expression régulière honnête ne sait
 * faire — la même limite que `placement-laws.test.ts` assume pour les lois 2 à
 * 4. L'axe des écrans est donc tenu ailleurs, sur un fait NOMMÉ plutôt que
 * deviné : `src/architecture/one-team-cockpit.test.ts` (GA-254) vérifie qu'un
 * seul écran rend le cockpit d'équipe et que le tableau de bord n'ouvre que sa
 * porte personnelle. Les deux gardes se complètent, aucune ne couvre l'autre.
 */

const ROOTS = ['src/components/navigation', 'src/components/sidebar']
/** `role === 'owner'`, `role !== "admin"`, `['owner','admin'].includes(role)`… */
const LITERAL_ROLE =
  /\brole\s*[=!]==?\s*['"](owner|admin|member|viewer|sales|sales_ops|tech_admin|recruiter|finance)['"]/

function files(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...files(full))
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

describe('la navigation garde sur une permission, jamais sur un rôle', () => {
  const sources = ROOTS.flatMap(root => files(root)).map(path => ({
    path,
    source: readFileSync(path, 'utf8'),
  }))

  it('aucun composant de navigation ne compare le rôle à une valeur littérale', () => {
    const offenders = sources.filter(file => LITERAL_ROLE.test(file.source)).map(file => file.path)
    if (offenders.length > 0) {
      throw new Error(
        [
          'Un composant de navigation compare le rôle à une valeur littérale. Utilise',
          '`hasPermission(role, …)` : un test en dur ignore les permissions accordées',
          'membre par membre, et il diverge du serveur à la première ouverture de droit.',
          '',
          ...offenders.map(path => `  · ${path}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('les trois coquilles de navigation passent bien par `hasPermission`', () => {
    // Sans cette assertion, supprimer les gates ferait passer la première au
    // vert : « aucun rôle littéral » est vrai aussi quand plus rien ne garde.
    for (const name of ['SectionTabs.tsx', 'CustomerNavbarBody.tsx', 'SettingsNavbarBody.tsx']) {
      const file = sources.find(entry => entry.path.endsWith(name))
      expect(file, `${name} introuvable`).toBeDefined()
      expect(file?.source.includes('hasPermission'), `${name} ne garde plus rien`).toBe(true)
    }
  })
})
