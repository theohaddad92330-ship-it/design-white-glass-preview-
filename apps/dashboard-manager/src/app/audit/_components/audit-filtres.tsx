import { BACKOFFICE_AUDIT_CATEGORIES, type BackofficeAuditCategory } from '@bellum/contracts'
import type { FiltreAudit } from '@/lib/journal-audit'
import { hrefCategorie, hrefFiltre, libelleCategorie } from '../audit.logic'

/**
 * LES FILTRES DU JOURNAL D'AUDIT — et la garantie de #1666 : « aucun filtre qui
 * masque une catégorie entière ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT LA GARANTIE TIENT, CONCRÈTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les CINQ catégories sont TOUJOURS affichées, avec leur compte, que le filtre
 * en cours les exclue ou non — le compte vient du serveur, calculé SANS le
 * filtre de catégorie. Un opérateur qui a filtré sur « Actions ordinaires » lit
 * donc, à l'écran, qu'il existe 4 impersonations qu'il n'est pas en train de
 * regarder, et il y accède en un clic.
 *
 * C'est l'inverse d'une liste déroulante qui ne proposerait que ce qui reste :
 * là, filtrer aurait fini par ressembler à supprimer.
 *
 * ⚠️ CE SONT DES LIENS, PAS DES BOUTONS. Ce qui se clique se tabule (GA-35) :
 * un `<a href>` l'est nativement, il se partage, il se met en signet, et il
 * survit à un rechargement — ce qui compte sur un écran qu'on ouvre pour
 * répondre à « qui a fait ça, et quand ». La primitive `Pill` du socle est un
 * `<button onClick>` : elle exigerait un composant client et un état, pour
 * moins.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1673.3 — POURQUOI CE FICHIER NE MIGRE PAS VERS `FilterBar`
 * ─────────────────────────────────────────────────────────────────────────
 * `FilterBar` (#1673.1) COUVRE la même dimension (une catégorie, en pilules,
 * avec compteur) — ce n'est donc pas une dimension manquante. C'est son
 * IMPLÉMENTATION qui ne convient pas ICI : `FilterBar` est `'use client'` et
 * rend ses pilules en `<Pill>` (un `<button onClick>`), exactement ce que le
 * paragraphe ci-dessus refuse pour CET écran, et pour la raison qu'il donne
 * déjà — pas une préférence de style, un choix délibéré antérieur à #1673.
 * L'élargir à un rendu par LIEN pour ce seul appelant en ferait un composant
 * à deux modes pour un cas unique, l'inverse de « un réglage vit à un seul
 * endroit » (GA-26 vu depuis l'autre bout). Ce fichier reste donc tel quel ;
 * la garantie qu'il porte (aucune catégorie masquée) tient toujours.
 */
export function AuditFiltres({
  filtre,
  comptes,
  total,
}: {
  filtre: FiltreAudit
  comptes: Record<BackofficeAuditCategory, number>
  total: number
}) {
  return (
    <nav aria-label="Filtres du journal d’audit" style={{ margin: '0 0 20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <a
          href={hrefCategorie(filtre, null)}
          className="pill"
          aria-current={filtre.category ? undefined : 'page'}
          style={filtre.category ? undefined : { borderColor: 'var(--accent)', color: 'var(--text)' }}
        >
          Toutes · {total}
        </a>
        {BACKOFFICE_AUDIT_CATEGORIES.map(categorie => {
          const actif = filtre.category === categorie
          return (
            <a
              key={categorie}
              href={hrefCategorie(filtre, categorie)}
              className="pill"
              aria-current={actif ? 'page' : undefined}
              style={actif ? { borderColor: 'var(--accent)', color: 'var(--text)' } : undefined}
            >
              {libelleCategorie(categorie)} · {comptes[categorie]}
            </a>
          )
        })}
      </div>

      {filtre.outcome || filtre.actorEmail || filtre.operation ? (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Filtres additionnels actifs :{' '}
          {[
            filtre.outcome ? `résultat = ${filtre.outcome}` : null,
            filtre.actorEmail ? 'un opérateur' : null,
            filtre.operation ? `opération = ${filtre.operation}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {'. '}
          <a href={hrefFiltre({ page: 1 }, {})} className="link">
            Tout afficher
          </a>
        </p>
      ) : null}
    </nav>
  )
}
