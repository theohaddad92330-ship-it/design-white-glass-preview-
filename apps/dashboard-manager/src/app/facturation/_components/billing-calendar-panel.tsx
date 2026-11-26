import { fetchBillingCalendar, type BillingCalendarCell, type BillingCalendarRow } from '@/lib/billing-calendar'
import { jourSeul } from '@/lib/dates'
import {
  cleDePeriode,
  compterEtats,
  ETATS_DE_LA_LEGENDE,
  lireCleDePeriode,
  moisCourt,
  moisLong,
  moisPrecedent,
  moisSuivant,
  PERIODICITE,
  peutAvancer,
  peutRemonter,
  phraseDeCellule,
  SYMBOLE,
  TEINTE,
} from './billing-calendar.logic'
import { BillingReminderPanel } from './billing-reminder-panel'

/**
 * Le CALENDRIER de facturation — douze mois, une ligne par client sur facture,
 * une cellule par période (#1653).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA PRÉMISSE DE L'ISSUE ÉTAIT FAUSSE — l'arbitrage, écrit ici pour qu'il ne
 * se re-litige pas
 * ─────────────────────────────────────────────────────────────────────────────
 * #1653 écrivait « le plafond de 20 périodes du module est respecté ». Le
 * module dit `MAX_PERIODS = 240`, et son commentaire nomme le cas d'un contrat
 * de 2019 qui marche déjà avec « 80+ periods ». Tronquer 240 → 20 casserait
 * l'affichage de tout contrat de plus d'un an et demi — la régression que
 * l'issue s'interdit elle-même (« RIEN sur la logique »).
 *
 * Hypothèse retenue au triage du 07/09/2026 : « 20 » visait un nombre de lignes
 * lisibles sans défilement, pas le plafond de la dérivation. Cet écran code
 * donc contre 240 : **la dérivation rend toutes les périodes** (la ligne
 * l'affiche : « 93 périodes depuis le 01/01/2019 »), **et c'est la GRILLE qui
 * est bornée à douze colonnes**, avec une navigation pour le reste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Il ne calcule rien. Les cinq états viennent de l'API, qui les lit dans
 *    `billingHealth` — les quatre seuils (7 / 30 / 30 / 15 jours) ne sont ni
 *    relus ni redéfinis ici.
 *  - Il n'émet aucune facture et ne relance personne. Comme l'onglet « Sur
 *    facture », il DIT ce qui manque.
 *  - Un clic sur une cellule ouvre LA PÉRIODE, jamais la fiche du client.
 *  - Une couleur seule n'est jamais l'information : chaque cellule porte son
 *    symbole ET sa phrase (`aria-label`), et le tableau porte sa légende.
 */

/** Largeur d'une colonne de mois. Douze colonnes tiennent dans `.wrap`. */
const LARGEUR_MOIS = 76
/** Largeur de la colonne des clients. */
const LARGEUR_CLIENT = 224

const argent = (cents: number, devise: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise || 'EUR' }).format(cents / 100)

function lien(mois: string, periode?: string): string {
  const params = new URLSearchParams({ view: 'calendrier', mois })
  if (periode) params.set('periode', periode)
  return `/facturation?${params.toString()}`
}

export async function BillingCalendarPanel({ mois, periode }: { mois?: string; periode?: string }) {
  let calendar: Awaited<ReturnType<typeof fetchBillingCalendar>>
  try {
    calendar = await fetchBillingCalendar(mois)
  } catch (err) {
    // Une panne d'API se DIT. Douze colonnes de tirets se liraient comme
    // « aucune période », c'est-à-dire comme une réponse.
    return (
      <div className="error">
        Impossible de joindre l&apos;endpoint admin de l&apos;API.
        <br />
        {err instanceof Error ? err.message : String(err)}
        <br />
        Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l&apos;API tourne.
      </div>
    )
  }

  const comptes = compterEtats(calendar.rows)
  const tronques = calendar.rows.filter(row => row.derivationCapped)
  const selection = lireCleDePeriode(periode)
  const ligneSelectionnee = selection
    ? (calendar.rows.find(row => row.workspaceId === selection.workspaceId) ?? null)
    : null
  const celluleSelectionnee =
    ligneSelectionnee && selection
      ? (ligneSelectionnee.cells.find(cell => cell.window?.start === selection.periodStart) ?? null)
      : null
  const largeurTable = LARGEUR_CLIENT + calendar.months.length * LARGEUR_MOIS

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ marginBottom: 4 }}>Calendrier de facturation</h2>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Douze mois, une ligne par client sur facture, une cellule par période. La grille LIT ce que le module de
        facturation dérive — elle n&apos;émet aucun document et ne relance personne.
      </p>

      <section className="kpi-grid">
        <div className="card">
          <div className="label">Fenêtre affichée</div>
          <div className="value" style={{ fontSize: 18 }}>
            {moisLong(calendar.months[0] ?? calendar.anchorMonth)} → {moisLong(calendar.anchorMonth)}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            {calendar.rows.length} client(s) sur facture
          </div>
        </div>
        <div className="card">
          <div className="label">Périodes en retard</div>
          <div className="value" style={{ color: comptes.late > 0 ? 'var(--red)' : undefined }}>
            {comptes.late}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>facture manquante ou non encaissée</div>
        </div>
        <div className="card">
          <div className="label">À émettre</div>
          <div className="value" style={{ color: comptes.to_issue > 0 ? 'var(--amber)' : undefined }}>
            {comptes.to_issue}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            période commencée, encore dans son délai
          </div>
        </div>
        <div className="card">
          <div className="label">Émises</div>
          <div className="value">{comptes.paid + comptes.issued}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            dont {comptes.issued} en attente d&apos;encaissement
          </div>
        </div>
      </section>

      <Navigation calendar={calendar} />

      {calendar.rows.length === 0 ? (
        <p className="empty">
          Aucun client sur facture. Créez-en un depuis l&apos;écran{' '}
          <a className="link" href="/clients">
            Clients
          </a>
          .
        </p>
      ) : (
        <>
          <Legende />

          {/* CE QUI DÉBORDE DÉFILE DANS SON CONTENEUR, JAMAIS LE CORPS DE LA
              PAGE. Douze colonnes tiennent sur un écran large ; sur un écran
              étroit, c'est ce div qui défile. */}
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ width: largeurTable, tableLayout: 'fixed' }}>
              {/* Le NOM accessible du tableau. Il ne répète ni la légende
                  ci-dessus ni la carte « Fenêtre affichée » : rien n'apparaît
                  deux fois sous la même forme avec le même contenu. */}
              <caption
                style={{
                  captionSide: 'top',
                  textAlign: 'left',
                  color: 'var(--muted)',
                  fontSize: 12,
                  padding: '0 0 8px',
                }}
              >
                Une colonne par mois, une cellule par période — chaque cellule porte son état en toutes lettres.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: LARGEUR_CLIENT }}>
                    ESN
                  </th>
                  {calendar.months.map(month => (
                    <th
                      key={month}
                      scope="col"
                      style={{
                        width: LARGEUR_MOIS,
                        textAlign: 'center',
                        color: month === calendar.currentMonth ? 'var(--text)' : undefined,
                      }}
                    >
                      {moisCourt(month)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendar.rows.map(row => (
                  <tr key={row.workspaceId}>
                    <th scope="row" style={{ fontWeight: 600, textTransform: 'none', fontSize: 13 }}>
                      <span style={{ color: 'var(--text)' }}>{row.workspaceName}</span>
                      <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>
                        {PERIODICITE[row.period]} · {argent(row.amountCents, row.currency)} · {row.periodsTotal}{' '}
                        période(s) depuis le {jourSeul(row.startDate)}
                      </span>
                    </th>
                    {row.cells.map(cell => (
                      <Cellule
                        key={`${row.workspaceId}-${cell.month}`}
                        row={row}
                        cell={cell}
                        anchorMonth={calendar.anchorMonth}
                        selectionnee={
                          selection?.workspaceId === row.workspaceId && selection.periodStart === cell.window?.start
                        }
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tronques.length > 0 ? (
            <p role="status" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
              {/* Une cellule ne ment jamais : quand le plafond de 240 périodes
                  du module a arrêté la marche, les tirets de cette ligne ne
                  veulent PAS dire « rien à facturer ». */}
              {tronques.length} contrat(s) dépassent les 240 périodes que le module dérive (
              {tronques.map(row => row.workspaceName).join(', ')}) : au-delà, la grille ne peut rien affirmer sur les
              mois affichés. Le suivi de ces contrats se fait dans l&apos;onglet « Sur facture ».
            </p>
          ) : null}

          <DetailDePeriode
            row={ligneSelectionnee}
            cell={celluleSelectionnee}
            demande={periode}
            anchorMonth={calendar.anchorMonth}
          />
        </>
      )}
    </section>
  )
}

function Navigation({ calendar }: { calendar: Awaited<ReturnType<typeof fetchBillingCalendar>> }) {
  const enArriere = peutRemonter(calendar)
  const enAvant = peutAvancer(calendar)

  return (
    <nav
      aria-label="Fenêtre du calendrier"
      style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '4px 0 16px' }}
    >
      {enArriere ? (
        <a className="link" href={lien(moisPrecedent(calendar.anchorMonth, 12))}>
          ← 12 mois précédents
        </a>
      ) : (
        // Pas de lien mort : la borne est MESURÉE sur les contrats réels, et un
        // bouton qui remonte dans le vide ferait croire à un trou de données.
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>← rien avant cette fenêtre</span>
      )}
      {enAvant ? (
        <a className="link" href={lien(moisSuivant(calendar.anchorMonth, 12))}>
          12 mois suivants →
        </a>
      ) : (
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          le futur ne se facture pas — la fenêtre s&apos;arrête au mois courant
        </span>
      )}
      {calendar.anchorMonth === calendar.currentMonth ? null : (
        <a className="link" href={lien(calendar.currentMonth)}>
          revenir au mois courant
        </a>
      )}
    </nav>
  )
}

function Legende() {
  return (
    <ul
      style={{
        listStyle: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 18px',
        margin: '0 0 12px',
        padding: 0,
        fontSize: 13,
        color: 'var(--muted)',
      }}
    >
      {ETATS_DE_LA_LEGENDE.map(entree => (
        <li key={entree.state} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ color: TEINTE[entree.state], fontWeight: 700 }}>
            {SYMBOLE[entree.state]}
          </span>
          {entree.libelle}
        </li>
      ))}
    </ul>
  )
}

function Cellule({
  row,
  cell,
  anchorMonth,
  selectionnee,
}: {
  row: BillingCalendarRow
  cell: BillingCalendarCell
  anchorMonth: string
  selectionnee: boolean
}) {
  const phrase = phraseDeCellule(row, cell)
  const fond = selectionnee ? { background: 'color-mix(in srgb, var(--accent) 18%, transparent)' } : {}

  // Rien à ouvrir : aucune période ne commence ce mois-ci. La cellule porte
  // quand même sa phrase — « — » seul se lirait « rien à facturer ».
  if (cell.state === 'no_period' || !cell.window) {
    return (
      <td
        colSpan={cell.months}
        aria-label={phrase}
        title={phrase}
        style={{ textAlign: 'center', color: TEINTE.no_period, ...fond }}
      >
        <span aria-hidden="true">{SYMBOLE.no_period}</span>
      </td>
    )
  }

  return (
    <td colSpan={cell.months} style={{ textAlign: 'center', padding: '6px 4px', ...fond }}>
      {/* Un clic ouvre LA PÉRIODE, pas la fiche client — le lien reste sur
          /facturation et ne fait qu'ajouter `periode` à l'URL. Un lien se
          tabule et s'annonce ; un `<div onClick>` ne fait ni l'un ni l'autre. */}
      <a
        href={`${lien(anchorMonth, cleDePeriode(row.workspaceId, cell.window.start))}#periode`}
        aria-label={phrase}
        title={phrase}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          minHeight: 44,
          justifyContent: 'center',
          width: '100%',
          textDecoration: 'none',
          color: TEINTE[cell.state],
          fontWeight: 700,
          borderRadius: 8,
        }}
      >
        <span aria-hidden="true">{SYMBOLE[cell.state]}</span>
        {cell.state === 'late' && cell.lateDays !== null ? (
          <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 400 }}>
            {cell.lateDays} j
          </span>
        ) : null}
      </a>
    </td>
  )
}

/**
 * La PÉRIODE ouverte au clic. Jamais la fiche du client : ce que l'opérateur
 * veut savoir en cliquant sur une case rouge, c'est ce qui manque SUR CETTE
 * PÉRIODE-LÀ.
 */
function DetailDePeriode({
  row,
  cell,
  demande,
  anchorMonth,
}: {
  row: BillingCalendarRow | null
  cell: BillingCalendarCell | null
  demande?: string
  anchorMonth: string
}) {
  if (!demande) return null

  if (!row || !cell || !cell.window) {
    // La clé ne désigne rien DANS CETTE FENÊTRE : on le dit, plutôt que de
    // faire disparaître le panneau comme si le clic n'avait pas eu lieu.
    return (
      <section id="periode" className="card" style={{ marginTop: 20 }}>
        <div className="label">Période</div>
        <p style={{ marginBottom: 0 }}>
          Cette période n&apos;est pas dans la fenêtre affichée. Change de fenêtre ci-dessus, ou{' '}
          <a className="link" href={lien(anchorMonth)}>
            referme ce panneau
          </a>
          .
        </p>
      </section>
    )
  }

  const etat = ETATS_DE_LA_LEGENDE.find(entree => entree.state === cell.state)

  return (
    <section id="periode" className="card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
        <div className="label">Période · {row.workspaceName}</div>
        <a className="link" href={lien(anchorMonth)} style={{ fontSize: 13 }}>
          fermer
        </a>
      </div>

      <div className="kv" style={{ marginTop: 10 }}>
        <span className="k">Période</span>
        <span>
          du {jourSeul(cell.window.start)} au {jourSeul(cell.window.end)}
          {cell.months > 1 ? ` · ${cell.months} mois` : ''}
        </span>

        <span className="k">État</span>
        <span style={{ color: TEINTE[cell.state], fontWeight: 600 }}>
          <span aria-hidden="true">{SYMBOLE[cell.state]}</span> {etat?.libelle ?? cell.state}
          {cell.state === 'late' && cell.lateDays !== null ? ` — depuis ${cell.lateDays} jours` : ''}
        </span>

        <span className="k">Facture émise</span>
        <span className="mono">
          {/* Aucune facture n'est PAS une facture à zéro euro. */}
          {cell.reference ?? 'aucune'}
        </span>

        <span className="k">Montant facturé</span>
        <span>
          {cell.invoiceAmountCents === null || cell.invoiceCurrency === null
            ? 'non facturé'
            : argent(cell.invoiceAmountCents, cell.invoiceCurrency)}
        </span>

        <span className="k">Montant du contrat</span>
        <span>
          {argent(row.amountCents, row.currency)} · {PERIODICITE[row.period]}
        </span>

        <span className="k">Engagement</span>
        <span>
          {/* « non renseigné » et « pas d'engagement » ne sont pas la même
              chose, et seule la première est vraie des lignes reprises. */}
          {row.commitmentEnd ? `jusqu'au ${jourSeul(row.commitmentEnd)}` : 'non renseigné'}
        </span>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        Pour enregistrer la facture émise dans la comptabilité, passer par l&apos;onglet{' '}
        <a className="link" href="/facturation?view=manuel">
          Sur facture
        </a>
        . Aucun document n&apos;est émis d&apos;ici, et aucun accès n&apos;est coupé automatiquement.
      </p>

      {/* La relance PRÉPARÉE (#1655). Elle n'apparaît que sur une période dont
          une facture est partie ou aurait dû partir — « émise » et « en retard ».
          Sur une période payée il n'y a rien à réclamer ; sur une période qu'on
          n'a pas encore commencé à facturer, la question n'est pas la relance,
          c'est la facture. Le panneau DIT lui-même ce qui l'empêche, plutôt que
          de disparaître : un panneau absent se lit « rien à faire ». */}
      {cell.state === 'late' || cell.state === 'issued' ? (
        <BillingReminderPanel workspaceId={row.workspaceId} periodStart={cell.window.start} />
      ) : null}
    </section>
  )
}
