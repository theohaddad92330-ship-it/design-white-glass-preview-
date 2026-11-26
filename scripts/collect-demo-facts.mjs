#!/usr/bin/env node
/**
 * Collecte les faits PUBLICS des sociétés de la démonstration.
 *
 * Pourquoi ce script existe. Les dossiers de démonstration portaient des
 * sociétés inventées ; ils portent désormais des sociétés RÉELLES (décision
 * Louis du 10/08/2026). Un dossier sur une société réelle ne peut pas être écrit
 * à la main de mémoire : chaque chiffre serait invérifiable, et une démonstration
 * qui affiche un effectif faux sur une entreprise que le prospect connaît fait
 * douter de tout le reste.
 *
 * Le script lit donc les MÊMES sources publiques que le pipeline — l'annuaire
 * des entreprises (open data INSEE/RNE) et le BODACC (annonces légales DILA) —
 * et rend un digest daté. Aucune clé, aucun compte, aucun quota.
 *
 * Ce qu'il ne collecte PAS, délibérément :
 * - **les dates de naissance et nationalités des dirigeants**, que l'annuaire
 *   rend pourtant. Un organigramme a besoin d'un nom et d'une fonction ; le
 *   reste est de la donnée personnelle sans usage, et un lien de démonstration
 *   est PUBLIC ;
 * - **les coordonnées** (courriel, téléphone). Elles ne sont dans aucune de ces
 *   sources, et les inventer sur des personnes nommées serait la faute que tout
 *   le reste du produit s'interdit.
 *
 * Usage : `node scripts/collect-demo-facts.mjs > /tmp/demo-facts.json`
 * (la sortie lisible part sur stderr, le JSON sur stdout).
 */

/** Les sociétés de la démonstration, par SIREN — l'identifiant qui ne bouge pas.
 *  Chercher par nom ramènerait un homonyme : « leboncoin » ne rend pas LBC
 *  France, et « Société Générale » rend cinq entités sans rapport. */
const COMPANIES = [
  { key: 'societe_generale', siren: '552120222', usualName: 'Société Générale' },
  { key: 'leboncoin', siren: '521724336', usualName: 'leboncoin' },
  { key: 'thales', siren: '552059024', usualName: 'Thales' },
  { key: 'sncf', siren: '552049447', usualName: 'SNCF' },
  { key: 'blablacar', siren: '491904546', usualName: 'BlaBlaCar' },
]

/** Tranches d'effectif INSEE — table officielle, recopiée telle quelle. `NN` =
 *  non renseigné, ce qui est une réponse et pas un zéro. */
const HEADCOUNT_BANDS = {
  NN: null,
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  11: '10 à 19 salariés',
  12: '20 à 49 salariés',
  21: '50 à 99 salariés',
  22: '100 à 199 salariés',
  31: '200 à 249 salariés',
  32: '250 à 499 salariés',
  41: '500 à 999 salariés',
  42: '1 000 à 1 999 salariés',
  51: '2 000 à 4 999 salariés',
  52: '5 000 à 9 999 salariés',
  53: '10 000 salariés et plus',
}

const REGISTRY = 'https://recherche-entreprises.api.gouv.fr/search'
const BODACC =
  'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

async function getJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'bellum-demo-facts' } })
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  return response.json()
}

async function registryFacts(siren) {
  const data = await getJson(`${REGISTRY}?${new URLSearchParams({ q: siren, per_page: '1' })}`)
  const row = data.results?.[0]
  if (!row) return null
  const office = row.siege ?? {}
  const accounts = row.finances ?? {}
  // Le dernier exercice DÉPOSÉ, pas l'année en cours : un exercice manquant
  // signifie « pas encore déposé », jamais « zéro ».
  const lastYear = Object.keys(accounts).sort().pop() ?? null
  return {
    siren: row.siren,
    legalName: row.nom_raison_sociale ?? row.nom_complet,
    fullName: row.nom_complet,
    acronym: row.sigle ?? null,
    naf: row.activite_principale ?? null,
    legalForm: row.nature_juridique ?? null,
    sizeCategory: row.categorie_entreprise ?? null,
    createdOn: row.date_creation ?? null,
    address: office.adresse ?? null,
    city: office.libelle_commune ?? null,
    headcountBand: HEADCOUNT_BANDS[row.tranche_effectif_salarie ?? 'NN'] ?? null,
    headcountYear: row.annee_tranche_effectif_salarie ?? null,
    openSites: row.nombre_etablissements_ouverts ?? null,
    revenueEur: lastYear ? (accounts[lastYear]?.ca ?? null) : null,
    netIncomeEur: lastYear ? (accounts[lastYear]?.resultat_net ?? null) : null,
    fiscalYear: lastYear,
    registryUpdatedOn: row.date_mise_a_jour_rne ?? null,
    // Nom + fonction seulement : voir l'en-tête.
    officers: (row.dirigeants ?? [])
      .filter(person => person.type_dirigeant === 'personne physique')
      .map(person => ({
        lastName: person.nom ?? null,
        firstNames: person.prenoms ?? null,
        role: person.qualite ?? null,
      })),
  }
}

async function legalAnnouncements(siren, limit = 5) {
  const query = new URLSearchParams({
    where: `registre like "${siren}"`,
    limit: String(limit),
    order_by: 'dateparution desc',
  })
  const data = await getJson(`${BODACC}?${query}`)
  return {
    total: data.total_count ?? 0,
    latest: (data.results ?? []).map(row => ({
      publishedOn: row.dateparution ?? null,
      family: row.familleavis_lib ?? null,
      // Le descriptif arrive en JSON encodé dans une chaîne : on le rend tel
      // quel plutôt que d'en extraire une phrase qui n'y est pas.
      detail: row.modificationsgenerales ?? null,
    })),
  }
}

async function main() {
  const collectedAt = new Date().toISOString()
  const out = { collectedAt, sources: { registry: REGISTRY, legalAnnouncements: BODACC }, companies: {} }

  for (const company of COMPANIES) {
    process.stderr.write(`… ${company.usualName} (${company.siren})\n`)
    const [registry, announcements] = await Promise.all([
      registryFacts(company.siren),
      legalAnnouncements(company.siren).catch(error => {
        // Une source indisponible ne doit pas faire échouer la collecte des
        // autres : on note l'absence, on n'invente pas de silence.
        process.stderr.write(`  ⚠️  annonces légales indisponibles : ${error.message}\n`)
        return null
      }),
    ])
    out.companies[company.key] = { usualName: company.usualName, registry, announcements }
    if (registry) {
      process.stderr.write(
        `  ${registry.fullName} · ${registry.city} · ${registry.headcountBand ?? 'effectif non renseigné'}` +
          ` · ${registry.officers.length} dirigeant(s) au registre\n`,
      )
    }
  }

  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`)
}

main().catch(error => {
  console.error('Collecte interrompue :', error)
  process.exit(1)
})
