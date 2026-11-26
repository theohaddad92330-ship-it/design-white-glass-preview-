import { StackedBar } from '@/app/_components/charts'
import { Card, CardHeader, KpiTile } from '@/ui'
import { fetchBellumMargin, fetchCosts, type BellumMargin, type CostAggregate, type CostOverview } from '@/lib/costs'
import { jour } from '@/lib/dates'
import {
  ACTIONS_NON_MESUREES,
  bornageDeLaListe,
  formaterEntier,
  formaterUsd,
  lectureDeLaMarge,
  lectureDuPic,
  libelleAction,
  periodeDeLaSerie,
  phraseDesOutilsBornes,
  phraseDuBornage,
  pileDesCouts,
} from './couts.logic'

/**
 * COÛTS FOURNISSEURS — « où part la facture » (#1661).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE À NOUVEAU, ET CE QU’IL REFUSE DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `/couts` était une REDIRECTION vers `/facturation?view=fournisseurs` depuis la
 * consolidation précédente. #1661 tranche l’inverse — « c’est de la technique,
 * pas du revenu » — et la route reprend donc son écran. L’URL ne change pas :
 * aucun signet ne casse, c’est ce que la redirection protégeait.
 *
 * Quatre blocs demandés, TROIS mesurables et un refusé :
 *
 *  1. **Coût par fournisseur, 30 jours, empilé.** Mesurable, en DOLLARS.
 *  2. **Coût par espace**, trié décroissant. Mesurable — mais BORNÉ aux vingt
 *     plus coûteux, et l’écran le DIT : un top 20 présenté comme un total est
 *     un mensonge dès le vingt-et-unième espace.
 *  3. **Coût par action.** Mesurable sur les quatre familles que le registre
 *     écrit réellement ; les deux que l’issue nomme et que rien n’enregistre
 *     sont nommées plutôt que tues.
 *  4. **Marge brute et ratio coût/MRR.** **NON MESURABLES**, et c’est une
 *     décision déjà écrite (D436) : le revenu est en euros, le registre des
 *     coûts en dollars, et Bellum ne convertit rien. Le bloc affiche le refus
 *     AVEC ce qu’il faudrait pour le lever — un tiret muet ferait chercher une
 *     panne, et quelqu’un finirait par « réparer » en inventant un taux.
 *
 * ⚠️ L’écran est MINCE À DESSEIN : chaque décision — le repli des fournisseurs,
 * la phrase d’un refus, le calcul de ce qu’une liste bornée laisse dehors — vit
 * dans `couts.logic.ts`, où elle est testée. Ici il ne reste que du placement.
 *
 * ⚠️ Écran RÉSERVÉ AU PROPRIÉTAIRE (`ECRANS_PROPRIETAIRE`, middleware). Il l’était
 * déjà quand `/couts` redirigeait vers la facturation ; ce lot ne rouvre rien
 * de sa propre initiative — l’ouvrir à l’`operator` serait un arbitrage.
 */
export const dynamic = 'force-dynamic'

/** La fenêtre demandée par l’issue : « Coût par fournisseur, 30 jours ». */
const JOURS = 30

/** L’espace entre deux blocs, écrit une fois. */
const BLOC = { margin: '0 0 20px' } as const

/** Les trois tons du pic, en TOKENS — jamais une couleur écrite en dur. */
const TON: Readonly<Record<'alerte' | 'calme' | 'inconnu', string>> = {
  alerte: 'var(--red)',
  calme: 'var(--green)',
  inconnu: 'var(--muted)',
}

function messageDe(raison: unknown): string {
  return raison instanceof Error ? raison.message : String(raison)
}

/** Un tableau défile dans SON conteneur, jamais dans le corps de la page. */
function TableauDesCouts({
  lignes,
  entete,
  libelle,
}: {
  lignes: readonly CostAggregate[]
  entete: string
  libelle?: (cle: string) => string
}) {
  if (lignes.length === 0) {
    return (
      <p className="subtitle" style={{ margin: 0 }}>
        Aucune consommation enregistrée sur la période. Ce n’est pas « 0 $ dépensé » : c’est un registre qui n’a rien
        vu.
      </p>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>{entete}</th>
            <th>Appels</th>
            <th>Unités</th>
            <th>Coût tarifé</th>
            <th>Lignes sans prix</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(ligne => (
            <tr key={ligne.key}>
              <td>{libelle ? libelle(ligne.key) : ligne.key}</td>
              <td className="num">{formaterEntier(ligne.calls)}</td>
              <td className="num">{formaterEntier(ligne.units)}</td>
              <td className="num">{formaterUsd(ligne.cost_usd)}</td>
              <td className="num">
                {ligne.untariffed > 0 ? <span className="badge error">{formaterEntier(ligne.untariffed)}</span> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * La phrase d’écran — obligatoire sur chaque page du back-office (#1678).
 *
 * Écrite en TEXTE dans le JSX, à un seul endroit, et rendue par les deux
 * branches (données lues / API en panne). Une constante de chaîne interpolée
 * (`{PHRASE}`) ne serait pas vue par la garde, qui lit le texte du fichier ;
 * la recopier dans les deux branches en ferait deux versions qui divergeraient.
 */
function PhraseDEcran() {
  return (
    <p className="subtitle">
      Ce que les fournisseurs nous coûtent, jour par jour, par espace et par action — en DOLLARS, la devise du registre.
      C’est de la technique, pas du revenu : la marge brute et le ratio coût/MRR sont refusés ici, avec leur raison et
      ce qu’il faudrait pour les débloquer. Réservé au propriétaire.
    </p>
  )
}

export default async function CoutsPage() {
  const [resultatCouts, resultatMarge] = await Promise.allSettled([fetchCosts(JOURS), fetchBellumMargin(JOURS)])

  const couts: CostOverview | null = resultatCouts.status === 'fulfilled' ? resultatCouts.value : null
  const marge: BellumMargin | null = resultatMarge.status === 'fulfilled' ? resultatMarge.value : null
  const panneMarge = resultatMarge.status === 'rejected' ? messageDe(resultatMarge.reason) : null

  if (!couts) {
    // ⚠️ Une panne d’API n’affiche PAS des zéros : elle se dit. Un « 0 $ » ici
    // serait indiscernable d’un mois sans dépense.
    return (
      <main className="wrap">
        <h1>Coûts fournisseurs</h1>
        <PhraseDEcran />
        <div className="error">
          Chiffres indisponibles — l’API n’a pas répondu.{' '}
          {resultatCouts.status === 'rejected' ? messageDe(resultatCouts.reason) : ''}
        </div>
      </main>
    )
  }

  const pile = pileDesCouts(couts.byDay)
  const pic = lectureDuPic(couts.costSpike)
  const lectureMarge = lectureDeLaMarge(marge, panneMarge)
  const calculeLe = jour(new Date())

  const bornageEspaces = bornageDeLaListe(couts.byWorkspace, couts.distinctKeys.workspace, couts.total.cost_usd)
  const bornageOperations = bornageDeLaListe(couts.byOperation, couts.distinctKeys.operation, couts.total.cost_usd)
  const phraseEspaces = phraseDuBornage(bornageEspaces, 'espaces')
  const phraseOperations = phraseDuBornage(bornageOperations, 'opérations')
  const phraseOutils = phraseDesOutilsBornes(couts.byTool ?? [])

  return (
    <main className="wrap">
      <h1>Coûts fournisseurs</h1>
      <PhraseDEcran />

      {/* ── Ce que ces chiffres ne disent pas ─────────────────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Ce que ces chiffres ne disent PAS" />
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 13, display: 'grid', gap: 6 }}>
            <li>
              <strong>C’est un plancher.</strong> Le total ne somme que les lignes TARIFÉES.{' '}
              {couts.total.untariffed > 0 ? (
                <>
                  {formaterEntier(couts.total.untariffed)} lignes n’ont aucun prix unitaire et sont EXCLUES du total —
                  elles ne sont pas comptées comme gratuites. Renseigner <code>PROVIDER_UNIT_COST_&lt;NOM&gt;</code> les
                  valorise.
                </>
              ) : (
                <>Aucune ligne sans prix sur la période : sur ce point-là, le total est complet.</>
              )}
            </li>
            <li>
              <strong>Aucun coût FIXE n’est mesuré</strong> — hébergement, observabilité, outillage interne, CRM
              interne. Le registre ne connaît que les fournisseurs facturés À L’APPEL.
            </li>
            <li>
              <strong>Les environnements sont additionnés.</strong> La colonne <code>environment</code> existe et
              distingue production et développement ; cette lecture-ci ne la filtre pas. Un poste de développement resté
              allumé pèse donc dans ces chiffres.
            </li>
          </ul>
        </Card>
      </section>

      {/* ── Les quatre chiffres de tête ───────────────────────────────────── */}
      <section className="kpi-grid" style={{ margin: '0 0 20px' }}>
        <KpiTile
          label="Coût tarifé"
          value={formaterUsd(couts.total.cost_usd)}
          period={`${couts.days} derniers jours`}
        />
        <KpiTile label="Appels facturés" value={formaterEntier(couts.total.calls)} period={`${couts.days} jours`} />
        <KpiTile
          label="Lignes sans prix"
          value={formaterEntier(couts.total.untariffed)}
          period="exclues du total, jamais comptées à 0 $"
        />
        <KpiTile label="Pic quotidien" value={pic.valeur} period={pic.titre} />
      </section>

      {/* ── BLOC 1 — coût par fournisseur, jour par jour ──────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Coût par fournisseur, jour par jour" />
          {pile.categories.length === 0 ? (
            <p className="subtitle" style={{ margin: 0 }}>
              Aucune journée dans la fenêtre. La série apparaîtra dès que le registre aura vu passer une consommation.
            </p>
          ) : (
            <>
              <StackedBar
                categories={pile.categories}
                keys={pile.keys}
                labels={pile.labels}
                period={periodeDeLaSerie(couts.byDay)}
                asOf={calculeLe}
                format={formaterUsd}
              />
              <p className="subtitle" style={{ margin: '12px 0 0', fontSize: 13 }}>
                Une journée en POINTILLÉS n’a aucune ligne tarifée : le registre n’a rien vu, ce qui n’est pas la même
                chose que « rien dépensé ». Une journée mesurée à 0 $ garde sa barre, elle.
                {pile.replies > 0 ? (
                  <>
                    {' '}
                    Les {pile.replies} fournisseurs les moins coûteux sont repliés sous « autres » plutôt qu’ignorés :
                    la pile ne dessine qu’un nombre borné de séries, et des parts manquantes ne feraient plus le total
                    de la journée.
                  </>
                ) : null}
              </p>
            </>
          )}
        </Card>
      </section>

      {/* ── L’alerte de pic ───────────────────────────────────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title={pic.titre} />
          <p style={{ margin: 0, color: TON[pic.ton], fontSize: 14 }}>{pic.detail}</p>
          <p className="subtitle" style={{ margin: '10px 0 0', fontSize: 13 }}>
            Le verdict porte sur la dernière journée COMPLÈTE : la journée en cours est incomplète par construction, et
            la comparer à des journées entières ne produirait que des faux négatifs. Le seuil et la médiane sont
            calculés côté API, à un seul endroit — la file de décision lit la même dérivation.
          </p>
        </Card>
      </section>

      {/* ── BLOC 2 — coût par espace ──────────────────────────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Coût par espace de travail" />
          {phraseEspaces ? (
            <p className="subtitle" style={{ margin: '0 0 12px', fontSize: 13 }}>
              {phraseEspaces}
            </p>
          ) : null}
          <TableauDesCouts lignes={couts.byWorkspace} entete="Espace" />
        </Card>
      </section>

      {/* ── BLOC 3 — coût par action, puis par opération ──────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Coût par action" />
          <TableauDesCouts lignes={couts.byFeature} entete="Action" libelle={libelleAction} />
          <p className="subtitle" style={{ margin: '12px 0 0', fontSize: 13 }}>
            Ce que cette liste ne contient PAS, et pourquoi :
          </p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--muted)', fontSize: 13 }}>
            {ACTIONS_NON_MESUREES.map(ligne => (
              <li key={ligne}>{ligne}</li>
            ))}
          </ul>
        </Card>
      </section>

      <section style={BLOC}>
        <Card>
          <CardHeader title="Coût par opération" />
          <p className="subtitle" style={{ margin: '0 0 12px', fontSize: 13 }}>
            Le détail sous une action : un prompt de modèle (<code>bellum_facts</code>, <code>bellum_chat</code>…) ou un
            verbe fournisseur. C’est la seule colonne qui répond à « lequel des prompts d’une analyse porte la moitié de
            sa facture », donc la seule sur laquelle un routage de modèle se décide.
            {phraseOperations ? ` ${phraseOperations}` : ''}
          </p>
          <TableauDesCouts lignes={couts.byOperation} entete="Opération" />
        </Card>
      </section>

      {/* #2442.12 — le coût PAR OUTIL de Laura (`ProviderCostService.overview().byTool`). */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Coût par outil de Laura" />
          <p className="subtitle" style={{ margin: '0 0 12px', fontSize: 13 }}>
            Lequel des outils du copilote porte la facture. Seules les consommations rattachées à un outil y figurent :
            la génération du tour et l’analyse n’y font aucune ligne. C’est le coût fournisseur du produit, jamais le
            coût d’accès d’un espace — la ventilation par espace est plus haut.
            {phraseOutils ? ` ${phraseOutils}` : ''}
          </p>
          {(couts.byTool ?? []).length === 0 ? (
            <p className="subtitle" style={{ margin: 0 }}>
              Aucune consommation rattachée à un outil sur la période.
            </p>
          ) : (
            <TableauDesCouts lignes={couts.byTool} entete="Outil" />
          )}
        </Card>
      </section>

      {/* ── BLOC 4 — la marge, et le refus assumé ─────────────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title={lectureMarge.titre} />
          <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '0 0 10px' }}>
            {lectureMarge.valeur === null ? (
              <span style={{ color: 'var(--muted)' }}>non mesurable</span>
            ) : (
              lectureMarge.valeur
            )}
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>{lectureMarge.raison}</p>
          {lectureMarge.debloquer ? (
            <p style={{ margin: 0, fontSize: 14 }}>
              <strong>Ce qu’il faudrait pour le débloquer : </strong>
              {lectureMarge.debloquer}
            </p>
          ) : null}
          {marge && marge.fixedCostsExcluded.length > 0 ? (
            <p className="subtitle" style={{ margin: '12px 0 0', fontSize: 13 }}>
              Postes de coût FIXE exclus du calcul, quoi qu’il arrive :{' '}
              {marge.fixedCostsExcluded.map(poste => `${poste.label} (${poste.reason})`).join(' · ')}.
              {marge.isFloor ? ' Et des lignes de coût sans prix en font un PLANCHER de plus.' : ''}
            </p>
          ) : null}
          <p className="subtitle" style={{ margin: '12px 0 0', fontSize: 13 }}>
            Le repère médian SaaS de 71-72 % (Blossom Street, T1 2025) n’est PAS affiché en face d’un chiffre : sans
            marge mesurée, il n’aurait personne à comparer. Il reviendra le jour où la division aura un sens.
          </p>
        </Card>
      </section>
    </main>
  )
}
