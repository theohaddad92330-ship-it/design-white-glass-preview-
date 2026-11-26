import { Sparkline } from '@/ui'
import type { DependencyReading } from '@/lib/operator-health'
import type { SourceHealthReport } from '@/lib/telemetry'
import { compterParEtat, construireGrille } from './dependency-grid.logic'

/**
 * #1660 — la grille des onze dépendances.
 *
 * Une tuile par dépendance : état · latence médiane 24 h · dernier incident ·
 * disponibilité 7 jours. Tout le choix des phrases vit dans
 * `dependency-grid.logic.ts` ; ce composant ne fait que le rendre.
 *
 * ⚠️ TROIS RÈGLES SE LISENT DIRECTEMENT DANS CE JSX
 *  1. L'état porte un MOT à côté de sa couleur — un daltonien, une capture en
 *     noir et blanc, un vidéoprojecteur fatigué doivent lire la même chose.
 *  2. « Inconnu » n'est ni vert ni rouge, et il s'accompagne TOUJOURS de la date
 *     de la dernière mesure : dire qu'on ne sait pas sans dire depuis quand
 *     n'apprend rien.
 *  3. Une série absente s'écrit en toutes lettres. Dessiner une sparkline plate
 *     à la place se lirait comme une mesure — et ce serait un mensonge.
 */
export function DependencyGrid({
  dependencies,
  sourceHealth,
  now,
}: {
  dependencies: readonly DependencyReading[]
  sourceHealth: SourceHealthReport | null
  /** L'instant de rendu, PASSÉ par l'appelant — jamais lu ici. */
  now: number
}) {
  const tuiles = construireGrille(dependencies, sourceHealth, now)
  const compte = compterParEtat(tuiles)

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Dépendances</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Une tuile par dépendance, et l&apos;état vient d&apos;un <strong>test réel</strong> : une sonde qui part toutes
        les cinq minutes, ou les analyses réellement exécutées. Une dépendance non testée depuis une heure affiche
        <strong> « état inconnu »</strong>, jamais « saine » — et une capacité qu&apos;on n&apos;a pas branchée affiche
        « non branchée », jamais « en panne ».
      </p>

      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        {compte.down} en panne · {compte.degraded} dégradée(s) · {compte.unknown} inconnue(s) · {compte.off} non
        branchée(s) · {compte.up} opérationnelle(s)
      </p>

      <section className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {tuiles.map(tuile => (
          <div className="card" key={tuile.id}>
            <div className="label" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {tuile.label}
              <span className={`badge ${tuile.badge}`}>{tuile.motDEtat}</span>
            </div>

            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
              {tuile.derniereMesure} · {tuile.origine}
            </p>

            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', margin: '10px 0 0' }}>
              <dt className="muted" style={{ fontSize: 12 }}>
                Latence médiane 24 h
              </dt>
              <dd style={{ fontSize: 12, margin: 0 }}>{tuile.latence}</dd>
              <dt className="muted" style={{ fontSize: 12 }}>
                Dernier incident
              </dt>
              <dd style={{ fontSize: 12, margin: 0 }}>{tuile.dernierIncident}</dd>
            </dl>

            <div style={{ marginTop: 10 }}>
              {tuile.disponibilite.kind === 'serie' ? (
                <>
                  <Sparkline points={tuile.disponibilite.points} label={`Disponibilité sur 7 jours — ${tuile.label}`} />
                  <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
                    Disponibilité 7 jours — un jour sans sonde est un trou, pas une barre à zéro.
                  </p>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                  {tuile.disponibilite.raison}
                </p>
              )}
            </div>

            <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
              Si elle tombe : {tuile.cuts}.
            </p>
          </div>
        ))}
      </section>
    </section>
  )
}
