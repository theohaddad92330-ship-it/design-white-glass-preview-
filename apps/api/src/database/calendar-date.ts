/**
 * Une colonne `DATE` de Postgres ne revient PAS en chaîne.
 *
 * `pg` enregistre un parseur pour l'OID 1082 (`date`) : une lecture brute
 * (`dataSource.query`) rend donc un **objet `Date`**, pas `'2026-08-29'`. Et
 * `String(new Date(…))` s'écrit `'Fri Aug 29 2026 00:00:00 GMT+0200 (…)'`, si
 * bien que le `slice(0, 10)` qu'on croit inoffensif rend **`'Fri Aug 29'`**.
 *
 * ⚠️ C'est le défaut trouvé en recette le 27/08 : le cockpit d'équipe recevait
 * `'Fri Aug 29'`, le navigateur en faisait `new Date('Fri Aug 29')` — le parseur
 * permissif de V8 complète l'année manquante par **2001** — et les vingt-sept
 * rappels de la semaine s'affichaient au 29/08/2001. Le jour et le mois
 * restaient justes : seule l'année trahissait, ce qui explique que personne ne
 * l'ait vu pendant des mois. Aucun test ne pouvait tomber : les tests unitaires
 * simulent la ligne avec une chaîne `'2026-07-24'`, forme que le vrai pilote ne
 * rend jamais.
 *
 * D'où ce goulot unique. Il rend une date calendaire `YYYY-MM-DD` ou `null` — et
 * **jamais une valeur de remplissage** : une échéance illisible n'a pas de date.
 */
export function calendarDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // Le pilote construit la `Date` d'une colonne `DATE` à MINUIT LOCAL : passer
    // par `toISOString()` (UTC) reculerait d'un jour à l'est de Greenwich.
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }

  // Chaîne : `date` en mode `dateStrings`, ou un `timestamp` déjà sérialisé.
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match ? (match[1] ?? null) : null
}
