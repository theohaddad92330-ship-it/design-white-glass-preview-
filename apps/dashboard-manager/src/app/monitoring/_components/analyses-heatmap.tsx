'use client'

import { Fragment, useState } from 'react'
import type { AnalysesHeatmapPayload } from '@/lib/monitoring'
import heat from '@/ui/Heatmap.module.css'
import {
  construireGrilleAnalyses,
  libelleJour,
  libelleTranche,
  type CelluleAnalyses,
  type GrilleAnalyses,
} from './analyses-heatmap.logic'
import styles from './analyses-heatmap.module.css'

/**
 * QUAND LE PRODUIT EST UTILISÉ — la grille des analyses lancées (#1650).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ OÙ CE COMPOSANT VIT, ET OÙ IL IRA
 * ─────────────────────────────────────────────────────────────────────────────
 * Il est posé dans le cockpit ACTUEL (`/monitoring?view=cockpit`) et pas dans le
 * nouveau cockpit de #1646, qui n'est pas encore écrit. La raison est le défaut
 * n°1 de ce dépôt : du code juste, calculé, testé, que PERSONNE N'APPELLE. Une
 * grille livrée sans appelant se serait découverte en réunion, pas en CI.
 *
 * #1646 la DÉPLACERA sans la réécrire : elle ne dépend que d'une charge utile
 * (`AnalysesHeatmapPayload`) et d'un message d'erreur. Le déménagement est une
 * ligne d'import, exactement comme `snapshot-panel.tsx` a documenté le sien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET ILS NE DISENT PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Illisible** — l'API n'a pas répondu. On rend une ERREUR. Une panne ne
 *    rend jamais une grille vide : ce serait annoncer une semaine sans analyse.
 *  · **Semaine à zéro** — « Aucune analyse cette semaine », pas 84 cellules
 *    grises. C'est le test écrit dans l'issue.
 *  · **Semaine de nuit** — zéro analyse ENTRE 8 h ET 20 h mais pas zéro dans la
 *    semaine. La grille se dessine, et la ligne « hors plage » dit ce qu'elle ne
 *    montre pas. Écrire « aucune analyse cette semaine » ici serait faux.
 *
 * ⚠️ Le détail (nombre exact + espaces concernés) N'EST PAS dans un attribut
 * `title` : « la donnée rangée dans un `title=` » est un défaut répertorié de ce
 * dépôt — invisible au clavier, muet pour un lecteur d'écran, inatteignable au
 * doigt. Chaque case est un `<button type="button">`, et le détail vit dans une
 * région annoncée sous la grille.
 *
 * ⚠️ Aucune métrique par PERSONNE : on compte des analyses et on nomme des
 * ESPACES. Aucune adresse e-mail ne transite ici, donc rien à masquer.
 */
export function AnalysesHeatmap({
  payload,
  erreur,
}: {
  payload: AnalysesHeatmapPayload | null
  erreur: string | null
}) {
  const [selection, setSelection] = useState<CelluleAnalyses | null>(null)

  // ⚠️ La FORME est vérifiée, pas seulement la présence. Le back-office déploie
  // sur son propre projet Vercel, indépendamment de l'API : pendant la fenêtre
  // où l'écran est neuf et l'API ancienne, l'endpoint répond 404 (attrapé par
  // l'appelant) — mais une charge utile AMPUTÉE, elle, passerait et ferait
  // dessiner une semaine à venir toute entière. Une réponse incomplète est une
  // semaine ILLISIBLE, pas une semaine sans analyse.
  const incomplet =
    payload != null && (!Array.isArray(payload.days) || payload.days.length === 0 || payload.now == null)

  if (erreur || !payload || incomplet) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          Quand le produit est utilisé
        </div>
        <div className="error">
          Grille indisponible — la semaine n&apos;a pas pu être lue.
          <br />
          {erreur ?? (incomplet ? 'Réponse incomplète de l’endpoint des analyses.' : 'Réponse vide.')}
          <br />
          Une semaine illisible n&apos;est pas une semaine sans analyse : rien n&apos;est affiché plutôt qu&apos;un zéro
          inventé.
        </div>
      </section>
    )
  }

  const grille = construireGrilleAnalyses({
    jours: payload.days,
    buckets: payload.buckets ?? [],
    maintenant: payload.now,
  })

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="label" style={{ marginBottom: 4 }}>
        Quand le produit est utilisé — analyses lancées
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)' }}>
        Sept jours glissants, tranches de 8 h à 20 h, heures de{' '}
        <strong style={{ fontWeight: 600 }}>{payload.timeZone}</strong>. Les cinq intensités sont RELATIVES à la tranche
        la plus chargée de la période — elles ne se comparent pas d&apos;une semaine à l&apos;autre.
      </p>

      {grille.totalFenetre === 0 ? (
        <div className="empty">Aucune analyse cette semaine.</div>
      ) : (
        <>
          <div className={styles['defilant'] ?? ''}>
            <div
              className={styles['grille'] ?? ''}
              style={{ gridTemplateColumns: `auto repeat(${grille.tranches.length}, minmax(20px, 1fr))` }}
            >
              <span />
              {grille.tranches.map(heure => (
                <span key={heure} className={styles['enteteHeure'] ?? ''}>
                  {heure} h
                </span>
              ))}
              {grille.lignes.map(ligne => (
                <Fragment key={ligne.jour}>
                  <span className={styles['enteteJour'] ?? ''}>{ligne.libelle}</span>
                  {ligne.cellules.map(cellule => (
                    <Case
                      key={`${cellule.jour}-${cellule.heure}`}
                      cellule={cellule}
                      choisie={selection?.jour === cellule.jour && selection?.heure === cellule.heure}
                      onChoisir={setSelection}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>

          <Legende grille={grille} />
          <Detail cellule={selection} />
        </>
      )}

      {grille.horsPlage > 0 ? (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--amber)' }}>⚠</span> {grille.horsPlage} analyse(s) lancée(s) hors de la plage 8 h
          – 20 h ne sont pas dessinées ici. La grille montre la journée de travail, pas la totalité de la semaine.
        </p>
      ) : null}
    </section>
  )
}

/** Une case. Survolable ET tabulable — l'information ne vit pas dans le survol
 *  seul, sinon elle n'existe ni au clavier ni au doigt. */
function Case({
  cellule,
  choisie,
  onChoisir,
}: {
  cellule: CelluleAnalyses
  choisie: boolean
  onChoisir: (c: CelluleAnalyses) => void
}) {
  const peinture =
    cellule.intensite == null
      ? `${heat['cell'] ?? ''} ${heat['unmeasured'] ?? ''} ${styles['peinture'] ?? ''}`
      : `${heat['cell'] ?? ''} ${styles['peinture'] ?? ''}`

  return (
    <button
      type="button"
      className={styles['cellule'] ?? ''}
      // `aria-current` et non `aria-pressed` : la case n'est pas un
      // interrupteur, c'est l'élément COURANT d'un ensemble.
      aria-current={choisie ? 'true' : undefined}
      aria-label={etiquette(cellule)}
      onMouseEnter={() => onChoisir(cellule)}
      onFocus={() => onChoisir(cellule)}
      onClick={() => onChoisir(cellule)}
    >
      {/* `undefined` RETIRE l'attribut : une case non mesurée ne doit pas porter
          `data-intensity="0"`, qui la peindrait au palier plancher — c'est-à-dire
          exactement la confusion que #1642 a pris soin de rendre impossible. */}
      <span className={peinture} data-intensity={cellule.intensite ?? undefined} aria-hidden="true" />
    </button>
  )
}

/** Le nom complet d'une case, pour un lecteur d'écran : ce que le survol montre
 *  aux autres. Les espaces y sont bornés à trois — la liste ENTIÈRE est dans le
 *  détail, qu'une étiquette de bouton ne doit pas réciter. */
function etiquette(cellule: CelluleAnalyses): string {
  const quand = `${libelleJour(cellule.jour)}, ${libelleTranche(cellule.heure)}`
  if (cellule.aVenir) return `${quand} : tranche à venir, rien de mesuré`
  // Aucun repli sur zéro ici : l'union de `CelluleAnalyses` a déjà écarté le
  // cas « à venir » deux lignes plus haut, et `valeur` est un nombre MESURÉ.
  const combien = `${cellule.valeur} analyse(s) lancée(s)`
  if (cellule.espaces.length === 0) return `${quand} : ${combien}`
  const noms = cellule.espaces.slice(0, 3).join(', ')
  const reste = cellule.espaces.length > 3 ? ` et ${cellule.espaces.length - 3} autre(s) espace(s)` : ''
  return `${quand} : ${combien} — ${noms}${reste}`
}

/** Le détail de la case survolée ou tabulée. `aria-live` l'annonce au clavier ;
 *  il reste visible pour tout le monde. */
function Detail({ cellule }: { cellule: CelluleAnalyses | null }) {
  if (!cellule) {
    return (
      <div className={`${styles['detail'] ?? ''} ${styles['detailVide'] ?? ''}`} role="status" aria-live="polite">
        Survolez une case — ou tabulez jusqu&apos;à elle — pour lire le nombre exact et les espaces concernés.
      </div>
    )
  }

  const quand = `${libelleJour(cellule.jour)} · ${libelleTranche(cellule.heure)}`

  if (cellule.aVenir) {
    return (
      <div className={styles['detail'] ?? ''} role="status" aria-live="polite">
        <div className={styles['detailTitre'] ?? ''}>{quand}</div>
        <div style={{ color: 'var(--muted)' }}>
          Tranche à venir — l&apos;heure n&apos;a pas sonné. Ce n&apos;est pas « 0 analyse ».
        </div>
      </div>
    )
  }

  return (
    <div className={styles['detail'] ?? ''} role="status" aria-live="polite">
      <div className={styles['detailTitre'] ?? ''}>
        {quand} — {cellule.valeur} analyse(s) lancée(s)
      </div>
      {cellule.espaces.length > 0 ? (
        <ul className={styles['espaces'] ?? ''}>
          {cellule.espaces.map(espace => (
            <li key={espace}>
              <span className="pill">{espace}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {cellule.sansEspace > 0 ? (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
          dont {cellule.sansEspace} sans espace identifié — le lancement est compté, l&apos;espace n&apos;est pas
          inventé.
        </div>
      ) : null}
      {cellule.espaces.length === 0 && cellule.sansEspace === 0 ? (
        <div style={{ color: 'var(--muted)' }}>Aucun lancement sur cette tranche.</div>
      ) : null}
    </div>
  )
}

/** Cinq paliers, et le maximum qui les calibre — sans lui, « foncé » ne veut
 *  rien dire, et deux semaines côte à côte se compareraient à tort. */
function Legende({ grille }: { grille: GrilleAnalyses }) {
  return (
    <div className={styles['legende'] ?? ''}>
      <span>moins</span>
      {[0, 1, 2, 3, 4].map(palier => (
        <span
          key={palier}
          className={`${heat['cell'] ?? ''} ${styles['echantillon'] ?? ''}`}
          data-intensity={palier}
          aria-hidden="true"
        />
      ))}
      <span>plus</span>
      <span>
        · tranche la plus chargée : <strong style={{ fontWeight: 600 }}>{grille.maximum ?? '—'}</strong> analyse(s) ·{' '}
        {grille.totalGrille} sur la plage 8 h – 20 h
      </span>
    </div>
  )
}
