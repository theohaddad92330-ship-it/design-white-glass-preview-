import type { DecisionQueueReport } from '@/lib/decision-queue'
import {
  anciennete,
  LIBELLES,
  LIGNES_AFFICHEES,
  resumerFile,
  RIEN_A_DECIDER,
  tokenDeGravite,
} from './decision-queue.logic'

/**
 * CE QUI DEMANDE UNE DÉCISION — la file typée du back-office (#1647).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ OÙ CE COMPOSANT VIT, ET OÙ IL IRA
 * ─────────────────────────────────────────────────────────────────────────────
 * Il est posé dans le cockpit ACTUEL (`/monitoring?view=cockpit`) et pas dans le
 * nouveau cockpit de #1646, qui n'est pas encore écrit. La raison est le défaut
 * n°1 de ce dépôt : du code juste, calculé, testé, que PERSONNE N'APPELLE. Une
 * file livrée sans appelant se serait découverte en réunion, pas en CI.
 *
 * #1646 le DÉPLACERA sans le réécrire : il ne dépend que d'une charge utile
 * (`DecisionQueueReport`) et d'un message d'erreur. Le déménagement est une
 * ligne d'import — même gabarit qu'`analyses-heatmap.tsx` (#1650).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET ILS NE DISENT PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Illisible** — l'API n'a pas répondu. On rend une ERREUR. Une panne ne
 *    rend jamais une file vide : ce serait annoncer que rien ne demande de
 *    décision alors qu'on n'en sait rien.
 *  · **Rien à décider** — la phrase de T2, ACCOMPAGNÉE du nombre de natures
 *    mesurées. « Rien » sur douze natures mesurées et « rien » sur zéro ne se
 *    lisent pas pareil, et c'est toute la valeur de #1647.
 *  · **Des lignes** — cinq au plus, « + N autres » au-delà.
 *
 * ⚠️ Chaque ligne porte les CINQ champs de l'issue : nature, sujet, détail
 * CHIFFRÉ, ancienneté, et UNE action. L'action est un LIEN — donc tabulable et
 * annoncé — vers l'écran où le geste existe déjà, avec sa porte et son journal.
 *
 * ⚠️ Le détail n'est PAS rangé dans un attribut `title` : « la donnée rangée
 * dans un `title=` » est un défaut répertorié de ce dépôt — invisible au
 * clavier, muet pour un lecteur d'écran, inatteignable au doigt.
 *
 * ⚠️ AUCUNE ADRESSE E-MAIL ici. Le sujet d'une ligne est un ESPACE, une file,
 * un fournisseur — nommés par leur nom, jamais par leur propriétaire. Il n'y a
 * donc rien à masquer, et rien qui puisse le devenir par accident.
 *
 * ⚠️ AUCUNE MÉTRIQUE PAR PERSONNE (doctrine `c64_analytique_produit`) :
 * `user_suspended_long` est la seule nature qui désigne quelqu'un, et c'est
 * légitime — une suspension est un geste d'administration sur un compte.
 */
export function DecisionQueueBlock({
  rapport,
  erreur,
}: {
  rapport: DecisionQueueReport | null
  erreur: string | null
}) {
  // ⚠️ La FORME est vérifiée, pas seulement la présence. Le back-office déploie
  // sur son propre projet Vercel, indépendamment de l'API : pendant la fenêtre
  // où le front est neuf et l'API ancienne, `items` peut ne pas exister.
  const lisible = rapport !== null && Array.isArray(rapport.items) && Array.isArray(rapport.natures)

  if (!lisible) {
    return (
      <section className="error" style={{ marginTop: 16 }}>
        <strong>Ce qui demande une décision — file indisponible</strong>
        <div style={{ marginTop: 6, fontSize: 13 }}>
          {erreur ?? 'La réponse de l’API ne porte pas de file exploitable.'}
        </div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Rien n’est affiché plutôt qu’une file vide : une panne ne veut pas dire qu’il n’y a rien à décider.
        </div>
      </section>
    )
  }

  const { lignes, reste, mesurees, muettes, amputees } = resumerFile(rapport)

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="label" style={{ marginBottom: 4 }}>
        Ce qui demande une décision
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
        {mesurees} nature{mesurees > 1 ? 's' : ''} mesurée{mesurees > 1 ? 's' : ''} sur {rapport.natures.length}. Une
        nature dont la donnée est absente ne produit aucune ligne — ce qu’on ne sait pas n’alerte jamais.
      </p>

      {lignes.length === 0 ? (
        <div className="empty">{RIEN_A_DECIDER}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {lignes.map(item => (
            <div
              key={`${item.nature}-${item.subject.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, color: tokenDeGravite(item.severity) }}>{LIBELLES[item.nature]}</span>{' '}
                <span>· {item.subject.label}</span>{' '}
                <span style={{ color: 'var(--muted)' }}>
                  — {item.detail} · {anciennete(item.ageDays)}
                </span>
              </span>
              <a className="link" href={item.action.href} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                {item.action.label} ↗
              </a>
            </div>
          ))}
        </div>
      )}

      {reste > 0 ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          + {reste} autre{reste > 1 ? 's' : ''}… (le bloc en montre {LIGNES_AFFICHEES})
        </div>
      ) : null}

      {muettes.length > 0 ? (
        // ⚠️ CE QUI NE SE MESURE PAS SE DIT. Sans ce pied de bloc, une nature
        // muette et une nature sans rien à signaler produisent le même vide, et
        // l'opérateur lit « tout va bien » là où il faut lire « on ne sait pas ».
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
            {muettes.length} nature{muettes.length > 1 ? 's' : ''} ne {muettes.length > 1 ? 'sont' : 'est'} pas
            mesurable{muettes.length > 1 ? 's' : ''} — voir pourquoi
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {muettes.map(nature => (
              <li key={nature.nature}>
                <strong>{LIBELLES[nature.nature]}</strong> — {nature.unmeasured}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {amputees.length > 0 ? (
        // ⚠️ Une lacune PARTIELLE se dit aussi, et c'est le cas que le pied de
        // bloc au-dessus ne voit pas : dès qu'une nature a mesuré UNE chose,
        // elle n'est plus « muette », donc trois files lues sur cinq se
        // liraient « mesuré, rien à signaler » sur un périmètre amputé.
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          {amputees.map(nature => `${LIBELLES[nature.nature]} — ${nature.partial}`).join(' · ')}
        </p>
      ) : null}
    </section>
  )
}
