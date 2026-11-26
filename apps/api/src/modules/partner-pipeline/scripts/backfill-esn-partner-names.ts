import dataSource from '../../../database/data-source'
import { isPlausibleEsnName, stripCertaintyDecoration } from '../esn-on-accounts-merge'

/**
 * #1799 — rattrapage des lignes `account_partners` DÉJÀ écrites par l'ancien
 * pipeline, avant que le producteur (`apps/ia/app/services/esn_presence.py`)
 * et la défense en profondeur côté lecture (`esn-on-accounts-merge.ts`)
 * n'aient été corrigés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NON EXÉCUTÉ. SIMULATION PAR DÉFAUT.
 * ─────────────────────────────────────────────────────────────────────────
 * `mergeEsnByMatchKey` protège déjà l'écran `GET /api/partners/on-my-accounts`
 * contre ces lignes — ce script les corrige EN BASE, pour :
 *   - tout AUTRE lecteur de `account_partners` qui n'applique pas le même
 *     filtre (ex. l'onglet Partenaires d'une fiche compte, un export) ;
 *   - que la table elle-même redevienne vraie, pas seulement l'écran.
 *
 * Deux actions, jamais une suppression (doctrine : on archive, on ne supprime
 * pas) :
 *   - une PROSE non-entité (« Aucun concurrent ESN identifié… ») est
 *     ARCHIVÉE — `dismissed_at` + `dismissed_reason`, le même mécanisme que
 *     le bouton « Ce n'est pas exact » ;
 *   - une décoration de certitude (« Capgemini — probable ») est NORMALISÉE —
 *     `name` mis à jour avec la version nettoyée, rien d'autre ne change.
 *
 * Ne touche JAMAIS une ligne `source = 'declared'` : une saisie humaine n'est
 * jamais raturée par un script (la clause SQL l'exclut explicitement, en plus
 * du filtre applicatif qui ne verrait de toute façon aucune raison de la
 * changer si son nom est déjà plausible).
 *
 * Idempotent et reprenable : une ligne déjà propre (nom inchangé après
 * normalisation) compte « inchangée » et n'est jamais réécrite ; relancer ce
 * script après un premier passage en `--apply` ne fait plus rien bouger — la
 * clause `dismissed_at IS NULL` exclut les lignes déjà archivées au tour
 * précédent, et un nom déjà nettoyé ne matche plus `cleaned !== name`.
 *
 * Usage (JAMAIS lancé par cet agent — Louis décide) :
 *
 *   pnpm --filter @bellum/api exec ts-node \
 *     src/modules/partner-pipeline/scripts/backfill-esn-partner-names.ts [--apply]
 *
 * Sans `--apply` (par défaut) : lit tout, compte tout, n'écrit RIEN.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const ds = await dataSource.initialize()
  try {
    const rows: { id: string; name: string; account_id: string }[] = await ds.query(
      `SELECT id, name, account_id
         FROM account_partners
        WHERE source = 'analysis'
          AND dismissed_at IS NULL`,
    )

    let corrigees = 0
    let inchangees = 0
    let rejetees = 0
    let absorbees = 0

    for (const row of rows) {
      const trimmed = row.name.trim()
      const cleaned = stripCertaintyDecoration(trimmed)

      if (!isPlausibleEsnName(cleaned)) {
        rejetees += 1
        if (apply) {
          await ds.query(`UPDATE account_partners SET dismissed_at = now(), dismissed_reason = $2 WHERE id = $1`, [
            row.id,
            '#1799 — non-entité détectée automatiquement (rattrapage)',
          ])
        }
        continue
      }

      if (cleaned !== trimmed) {
        // ⚠️ Mesuré au premier passage du 09/09/2026, en production : retirer la
        // décoration fait COLLISIONNER la ligne avec sa jumelle propre —
        // `account_partners_unique (account_id, lower(name))`, 23505 sur
        // « Sopra Steria — probable » → « Sopra Steria » qui existait déjà sur
        // le même compte. Le script s'arrêtait au milieu du lot.
        //
        // Renommer n'est alors ni possible ni souhaitable : la vérité est DÉJÀ
        // en base, portée par la ligne propre. La ligne décorée est un
        // doublon, et on archive, on ne supprime pas.
        const jumelle: { id: string }[] = await ds.query(
          `SELECT id
             FROM account_partners
            WHERE account_id = $1
              AND lower(name) = lower($2)
              AND id <> $3
              AND dismissed_at IS NULL
            LIMIT 1`,
          [row.account_id, cleaned, row.id],
        )

        if (jumelle.length > 0) {
          absorbees += 1
          if (apply) {
            await ds.query(`UPDATE account_partners SET dismissed_at = now(), dismissed_reason = $2 WHERE id = $1`, [
              row.id,
              '#1799 — doublon décoré, la ligne propre porte déjà ce nom (rattrapage)',
            ])
          }
          continue
        }

        corrigees += 1
        if (apply) {
          await ds.query(`UPDATE account_partners SET name = $2 WHERE id = $1`, [row.id, cleaned])
        }
        continue
      }

      inchangees += 1
    }

    const lues = rows.length
    // Les comptes s'ADDITIONNENT jusqu'au total lu — sinon une ligne a été
    // comptée deux fois, ou pas du tout, et rien de ce qui suit n'est fiable.
    if (lues !== corrigees + inchangees + rejetees + absorbees) {
      throw new Error(
        `le compte ne s'additionne pas : lues=${lues} mais ` +
          `corrigees+inchangees+rejetees+absorbees=${corrigees + inchangees + rejetees + absorbees}`,
      )
    }

    console.log(
      `lues=${lues} corrigees=${corrigees} inchangees=${inchangees} rejetees=${rejetees} absorbees=${absorbees}`,
    )
    console.log(apply ? 'APPLIQUÉ.' : 'SIMULATION — rien n’a été écrit. Relancer avec --apply pour appliquer.')
  } finally {
    await ds.destroy()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
