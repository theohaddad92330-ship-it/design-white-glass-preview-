import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { KpiTile } from '@/ui'
import { dateEtHeure } from '@/lib/dates'
import { operateurDepuisJeton } from '@/lib/guard'
import { fetchJournalAudit, type VueAudit } from '@/lib/journal-audit'
import { peut } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION } from '@/lib/session'
import { AuditFiltres } from './_components/audit-filtres'
import { AuditRetentions } from './_components/audit-retentions'
import { AuditTable } from './_components/audit-table'
import { aUnePageSuivante, hrefFiltre, libellePlage, lireFiltre } from './audit.logic'

/**
 * AUDIT — le journal unique du back-office (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ISSUE DEMANDE, ET OÙ CHAQUE MORCEAU VIT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un journal unique, toutes opérations du manager confondues :
 *   Qui · Quoi · Sur quoi · Quand · Depuis où · Résultat. »
 *
 * Les six colonnes sont dans `_components/audit-table.tsx`. Les cinq rétentions
 * sont dans `_components/audit-retentions.tsx`, et elles viennent du serveur —
 * du MÊME code que la purge, pour qu'un écran ne puisse pas annoncer une durée
 * que personne n'applique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « LECTURE SEULE. AUCUNE PURGE MANUELLE. »
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'y a aucun bouton d'action sur cet écran, et surtout ce n'est pas ce qui
 * tient la règle : `DELETE /api/admin/audit/<id>` répond **405**, l'API répond
 * 405 elle aussi, et le service n'a AUCUNE méthode qui supprime une ligne
 * choisie. On retire le MOYEN, pas seulement la permission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « AUCUN FILTRE QUI MASQUE UNE CATÉGORIE ENTIÈRE »
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cinq catégories sont toujours affichées avec leur compte, calculé SANS le
 * filtre de catégorie, et le total du journal entier reste en tête. Filtrer
 * restreint la page ; ça n'efface jamais un chiffre.
 *
 * ⚠️ Une panne d'API n'affiche PAS un tableau vide : elle se dit. Un journal
 * vide se lirait exactement comme « il ne s'est rien passé », qui est la
 * conclusion la plus coûteuse qu'un écran d'audit puisse suggérer.
 *
 * Rôle exigé : `audit.read` (plancher `operator`), vérifié côté serveur.
 */
export const dynamic = 'force-dynamic'

export default async function AuditPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  // ⚠️ LA CAPACITÉ SE VÉRIFIE ICI AUSSI, PAS SEULEMENT SUR LES ROUTES.
  // `middleware.ts` ne connaît que les écrans RÉSERVÉS AU PROPRIÉTAIRE ; celui-ci
  // est ouvert à `operator` et fermé à `viewer`, un cas qu'aucune porte
  // existante ne couvrait. Sans cette ligne, un lecteur aurait lu le journal
  // d'audit — c'est-à-dire les adresses et les gestes de tous ses collègues.
  //
  // ⚠️ COUCHE INERTE = COMPORTEMENT D'AVANT : sans `DM_ALLOWED_EMAILS`, il n'y a
  // pas d'identité, donc pas de rôle à opposer. Le Basic Auth garde, seul, comme
  // sur tous les autres écrans.
  if (listeDacces().etat === 'active') {
    const operateur = await operateurDepuisJeton((await cookies()).get(COOKIE_SESSION)?.value)
    if (!operateur || !peut(operateur.role, 'audit.read')) redirect('/acces-refuse')
  }

  const filtre = lireFiltre(searchParams ?? {})

  let vue: VueAudit | null = null
  let panne: string | null = null
  try {
    vue = await fetchJournalAudit(filtre)
  } catch (err) {
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!vue) {
    return (
      <main className="wrap">
        <h1>Audit</h1>
        <p className="subtitle">
          Le journal unique du back-office : qui a fait quoi, sur quoi, quand, depuis où, avec quel résultat. Lecture
          seule — aucune ligne ne se supprime, aucune purge ne se déclenche à la main.
        </p>
        <div className="error" style={{ margin: '16px 0' }}>
          Journal indisponible — l’API n’a pas répondu. {panne} (Un tableau vide se lirait comme « il ne s’est rien
          passé » : ce n’est pas ce qu’on sait.)
        </div>
      </main>
    )
  }

  const suivante = aUnePageSuivante(vue.offset, vue.entries.length, vue.matching)
  const page = filtre.page === undefined ? 1 : filtre.page

  return (
    <main className="wrap">
      <h1>Audit</h1>
      <p className="subtitle">
        Le journal unique du back-office : qui a fait quoi, sur quoi, quand, depuis où, avec quel résultat. Lecture
        seule — aucune ligne ne se supprime, aucune purge ne se déclenche à la main.
      </p>

      <section className="cards" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <KpiTile label="Opérations journalisées" value={vue.total} period="tous filtres ignorés" />
        <KpiTile
          label="Sur cette recherche"
          value={vue.matching}
          period={libellePlage(vue.offset, vue.entries.length, vue.matching)}
        />
        <KpiTile label="Mesuré le" value={dateEtHeure(vue.measuredAt)} period="heure de Paris" />
      </section>

      <AuditFiltres filtre={filtre} comptes={vue.categoryCounts} total={vue.total} />

      <AuditRetentions fenetres={vue.retention} />

      {vue.entries.length === 0 ? (
        <p className="empty">
          Aucune opération ne correspond à cette recherche. Le journal, lui, en contient {vue.total} — les compteurs
          ci-dessus le disent catégorie par catégorie.
        </p>
      ) : (
        <AuditTable lignes={vue.entries} />
      )}

      <nav
        aria-label="Pagination du journal"
        style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0' }}
      >
        {page > 1 ? (
          <a className="btn btn-sm" href={hrefFiltre(filtre, { page: page - 1 })}>
            ← Précédent
          </a>
        ) : null}
        <span className="muted">{libellePlage(vue.offset, vue.entries.length, vue.matching)}</span>
        {suivante ? (
          <a className="btn btn-sm" href={hrefFiltre(filtre, { page: page + 1 })}>
            Suivant →
          </a>
        ) : null}
      </nav>
    </main>
  )
}
