import { KpiTile } from '@/ui'
import { fetchBusinessMetrics, type BusinessMetricsOverview } from '@/lib/business-metrics'
import { TreasuryForm } from './_components/treasury-form'
import { TreasuryMonths } from './_components/treasury-months'
import { formaterEuros, libelleMois, moisDe } from '../revenus.logic'
import { derniersMois, libelleBurnMoyen, libelleRunway } from './tresorerie.logic'

/**
 * TRÉSORERIE — le solde, le burn et le runway de BellumAI (#1649).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PAGE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Runway et burn sont les deux chiffres qui décident si l'entreprise vit.
 * Aucune connexion bancaire n'existe, et en inventer une serait un chantier à
 * part. La saisie manuelle mensuelle coûte deux minutes et débloque tout. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE BANDEAU « MRR — INSTANTANÉS MENSUELS » A DÉMÉNAGÉ (07/09/2026, #1651)
 * ─────────────────────────────────────────────────────────────────────────────
 * Il vivait ici par NÉCESSITÉ, et cette page l'annonçait : « il déménagera, il
 * ne se réécrira pas ». C'est fait. Sans écran, #1645 aurait été le défaut n°1
 * de ce dépôt — du code juste que personne n'appelle — et le PREMIER instantané
 * de la série ne pouvait pas attendre `/revenus`. `/revenus` existe depuis
 * aujourd'hui : le bandeau est là-bas, en
 * `app/revenus/_components/snapshot-panel.tsx`, avec son mécanisme intact.
 *
 * Ce qui RESTE ici est ce qui n'a jamais été du MRR : le solde bancaire, les
 * dépenses, les encaissements, et ce qu'on en dérive.
 *
 * ⚠️ Écran RÉSERVÉ AU PROPRIÉTAIRE (`ECRANS_PROPRIETAIRE`, middleware) : c'est
 * le compte en banque de l'entreprise. Depuis #1651, `/revenus` entier l'est —
 * `/revenus/clients` reste la seule exception, nommée dans `lib/roles.ts`.
 */
export const dynamic = 'force-dynamic'

/** Combien de mois le sélecteur de saisie propose. Deux ans de recul suffisent
 *  à rattraper un oubli sans transformer la liste en annuaire. */
const MOIS_PROPOSES = 24

export default async function TresoreriePage() {
  const moisCourant = moisDe(new Date())

  let donnees: BusinessMetricsOverview | null = null
  let panne: string | null = null
  try {
    donnees = await fetchBusinessMetrics()
  } catch (err) {
    // ⚠️ Une panne d'API n'affiche PAS des zéros : elle se dit. Un « 0 € » ici
    // serait indiscernable d'une entreprise sans trésorerie.
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!donnees) {
    return (
      <main className="wrap">
        <h1>Trésorerie</h1>
        <div className="error" style={{ margin: '16px 0' }}>
          Chiffres indisponibles — l’API n’a pas répondu. {panne}
        </div>
      </main>
    )
  }

  const { treasury } = donnees
  const dernier = treasury.months.at(-1) ?? null
  const runway = libelleRunway(treasury.runway)
  const burnMoyen = libelleBurnMoyen(treasury.averageBurn)

  return (
    <main className="wrap">
      <h1>Trésorerie</h1>
      <p className="subtitle">
        Le solde, les dépenses et les encaissements du mois, saisis à la main. Le burn et le runway en sont DÉRIVÉS —
        aucune connexion bancaire n’existe, et un solde inventé serait pire que rien.
      </p>

      <section className="kpi-grid">
        <KpiTile
          label="Solde bancaire"
          value={formaterEuros(dernier?.bankBalanceCents)}
          period={dernier ? `au 1er ${libelleMois(dernier.month).toLowerCase()}` : 'aucun mois saisi'}
        />
        <KpiTile
          label="Burn du mois"
          value={formaterEuros(dernier?.burnCents)}
          period={dernier ? libelleMois(dernier.month) : 'aucun mois saisi'}
        />
        <KpiTile label="Burn moyen" value={burnMoyen.valeur} period={burnMoyen.note} />
        <KpiTile label="Runway" value={runway.valeur} period={runway.note} />
      </section>

      <TreasuryForm
        mois={derniersMois(moisCourant, MOIS_PROPOSES)}
        moisParDefaut={dernier?.month ?? moisCourant}
        saisis={treasury.months}
      />

      <TreasuryMonths mois={treasury.months} />
    </main>
  )
}
