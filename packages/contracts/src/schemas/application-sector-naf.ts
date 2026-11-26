import { APPLICATION_SECTORS, type ApplicationSectorGroup } from './application-sectors.js'

/**
 * Les secteurs d'application → LEURS CODES NAF.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Découvrir proposait dix pastilles de secteur, chacune valant une SECTION NAF
 * entière (`industry` → `C`, soit les divisions 10 à 33). Cocher « Industrie »
 * ne disait donc rien de plus que « manufacturier » : un fabricant de
 * dispositifs médicaux (`32.50A`) remontait sous le même filtre qu'un
 * avionneur. Le vocabulaire partagé, lui, distingue depuis longtemps
 * `aerospace` de `defense` — « des cycles, des habilitations et des acheteurs
 * différents », dit `application-sectors.ts`. Il manquait le seul chaînon qui
 * rende cette finesse INTERROGEABLE : le code NAF de chaque secteur.
 *
 * ⚠️ CODES COMPLETS pour INTERROGER, PRÉFIXES pour CLASSER — la même
 * distinction que `esn_naf.py`, et la confondre coûte cher. Mesuré le
 * 04/09/2026 sur `recherche-entreprises.api.gouv.fr` :
 *
 *   activite_principale=29.10Z        → 678
 *   activite_principale=30.30Z        → 745
 *   activite_principale=30.30Z,29.10Z → 1423   (= 745 + 678 : un OU, pas un ET)
 *   activite_principale=29.1          → erreur  (un préfixe est REFUSÉ)
 *   activite_principale=29            → erreur
 *   activite_principale=2910Z         → erreur  (le point est exigé)
 *
 * Une seule requête suffit donc pour plusieurs secteurs : pas d'éventail.
 *
 * ⚠️ RÉSERVE DATÉE — le registre porte DÉJÀ une NAF 2025 en parallèle
 * (`activite_principale_naf25`, où `30.30Z` devient `30.31Y`). Au 04/09/2026
 * elle n'est PAS interrogeable : seul `activite_principale`, en NAF rév. 2,
 * filtre. Le jour où le registre bascule, cette table entière est à revoir —
 * et l'échec serait SILENCIEUX : une liste vide, sans erreur.
 *
 * ⚠️ Les CODES ont été vérifiés un par un contre le registre le 04/09/2026 :
 * 382 codes, 0 inconnu, 0 vide. `tools/validate-naf-mapping.mjs` rejoue la
 * mesure. Les AFFECTATIONS, elles, sont un jugement métier : ce point d'entrée
 * ne publie AUCUN libellé, donc rien ne les prouve automatiquement. Elles
 * s'auditent en lisant — d'où le libellé du secteur en commentaire.
 *
 * ⚠️ ADDITIF ET CORRECTIF, jamais destructif : un secteur qui perdrait tous ses
 * codes cesserait de filtrer en silence. `application-sector-naf.test.ts` échoue
 * si un seul secteur du vocabulaire partagé n'a pas au moins un code.
 */
export const APPLICATION_SECTOR_NAF: Readonly<Record<string, readonly string[]>> = {
  // ─── industrie ───────────────────────────────────────────────────────
  // Automobile
  automotive: ['29.10Z', '29.20Z', '29.31Z', '29.32Z'],
  // Aéronautique & spatial
  aerospace: ['30.30Z'],
  // Défense
  defense: ['25.40Z', '30.40Z'],
  // Naval & maritime
  naval: ['30.11Z', '30.12Z', '33.15Z'],
  // Équipements industriels
  industrial_equipment: [
    '28.11Z',
    '28.12Z',
    '28.13Z',
    '28.14Z',
    '28.15Z',
    '28.21Z',
    '28.22Z',
    '28.23Z',
    '28.24Z',
    '28.25Z',
    '28.29A',
    '28.29B',
    '33.12Z',
  ],
  // Machines spéciales
  special_machinery: [
    '28.41Z',
    '28.49Z',
    '28.91Z',
    '28.92Z',
    '28.93Z',
    '28.94Z',
    '28.95Z',
    '28.96Z',
    '28.99A',
    '28.99B',
  ],
  // Électronique & semi-conducteurs
  electronics_semiconductor: [
    '26.11Z',
    '26.12Z',
    '26.20Z',
    '26.30Z',
    '26.40Z',
    '26.51A',
    '26.51B',
    '26.52Z',
    '26.60Z',
    '26.70Z',
    '26.80Z',
    '27.11Z',
    '27.12Z',
  ],
  // Sidérurgie, métallurgie & matériaux
  steel_materials: [
    '24.10Z',
    '24.20Z',
    '24.31Z',
    '24.32Z',
    '24.33Z',
    '24.34Z',
    '24.41Z',
    '24.42Z',
    '24.43Z',
    '24.44Z',
    '24.45Z',
    '24.51Z',
    '24.52Z',
    '24.53Z',
    '24.54Z',
    '25.50A',
    '25.50B',
  ],
  // ─── energie ─────────────────────────────────────────────────────────
  // Nucléaire
  // 24.46Z : combustibles (19 entités seulement, presque toutes sans effectif publié). 35.11Z : EDF, mais ≈10 000
  // entités peuplées de SPV solaires — d'où la taille du profil, envoyée par défaut (DISCOVER-TAILLE T.1/T.2).
  // 25.30Z : FRAMATOME (SIREN 379041395, tranche 53, registre public vérifié le 19/10/2026) — chaudières nucléaires.
  // Non ajoutés, vérifiés mais trop larges pour ne pas noyer le secteur : 71.12B (ASSYSTEM ENGINEERING AND OPERATION
  // SERVICES, tranche 51), 72.19Z (CEA, SYNCHROTRON SOLEIL).
  nuclear: ['24.46Z', '25.30Z', '35.11Z'],
  // Réseaux électriques & distribution
  power_grid_distribution: ['35.12Z', '35.13Z', '35.14Z', '35.21Z', '35.22Z', '35.23Z', '35.30Z'],
  // Énergies renouvelables
  renewables: ['35.11Z'],
  // Pétrole & gaz
  oil_gas: ['06.10Z', '06.20Z', '09.10Z', '19.20Z', '46.71Z'],
  // Eau & déchets
  water_waste: ['36.00Z', '37.00Z', '38.11Z', '38.12Z', '38.21Z', '38.22Z', '38.31Z', '38.32Z', '39.00Z'],
  // ─── process ─────────────────────────────────────────────────────────
  // Chimie & procédés
  chemicals: [
    '20.11Z',
    '20.12Z',
    '20.13A',
    '20.13B',
    '20.14Z',
    '20.15Z',
    '20.16Z',
    '20.17Z',
    '20.20Z',
    '20.30Z',
    '20.41Z',
    '20.51Z',
    '20.52Z',
    '20.53Z',
    '20.59Z',
    '20.60Z',
    '22.11Z',
    '22.19Z',
    '22.21Z',
    '22.22Z',
    '22.23Z',
    '22.29A',
    '22.29B',
  ],
  // Pharma & production industrielle
  pharma_manufacturing: ['21.10Z', '21.20Z'],
  // Agroalimentaire
  food_beverage: [
    '10.11Z',
    '10.12Z',
    '10.13A',
    '10.13B',
    '10.20Z',
    '10.31Z',
    '10.32Z',
    '10.39A',
    '10.39B',
    '10.41A',
    '10.41B',
    '10.51A',
    '10.51B',
    '10.51C',
    '10.51D',
    '10.61A',
    '10.61B',
    '10.71A',
    '10.71B',
    '10.71C',
    '10.71D',
    '10.72Z',
    '10.73Z',
    '10.81Z',
    '10.82Z',
    '10.83Z',
    '10.84Z',
    '10.85Z',
    '10.86Z',
    '10.89Z',
    '10.91Z',
    '10.92Z',
    '11.01Z',
    '11.02A',
    '11.02B',
    '11.03Z',
    '11.04Z',
    '11.05Z',
    '11.06Z',
    '11.07A',
    '11.07B',
  ],
  // Cosmétique & parfumerie
  cosmetics: ['20.42Z', '20.53Z'],
  // Papier & emballage
  paper_packaging: [
    '17.11Z',
    '17.12Z',
    '17.21A',
    '17.21B',
    '17.21C',
    '17.22Z',
    '17.23Z',
    '17.24Z',
    '17.29Z',
    '18.11Z',
    '18.12Z',
    '18.13Z',
    '18.14Z',
  ],
  // ─── construction ────────────────────────────────────────────────────
  // BTP & génie civil
  construction: [
    '41.10A',
    '41.10B',
    '41.10C',
    '41.10D',
    '41.20A',
    '41.20B',
    '42.11Z',
    '42.12Z',
    '42.13A',
    '42.13B',
    '42.21Z',
    '42.22Z',
    '42.91Z',
    '42.99Z',
    '43.11Z',
    '43.12A',
    '43.12B',
    '43.13Z',
    '43.21A',
    '43.21B',
    '43.22A',
    '43.22B',
    '43.29A',
    '43.29B',
    '43.31Z',
    '43.32A',
    '43.32B',
    '43.32C',
    '43.33Z',
    '43.34Z',
    '43.39Z',
    '43.91A',
    '43.91B',
    '43.99A',
    '43.99B',
    '43.99C',
    '43.99D',
    '43.99E',
    '71.12A',
    '71.12B',
  ],
  // Immobilier
  real_estate: ['41.10A', '68.10Z', '68.20A', '68.20B', '68.31Z', '68.32A', '68.32B'],
  // Infrastructures de transport
  transport_infrastructure: ['42.11Z', '42.12Z', '42.13A', '42.13B', '52.21Z', '52.22Z', '52.23Z'],
  // ─── transport ───────────────────────────────────────────────────────
  // Ferroviaire
  rail: ['30.20Z', '49.10Z', '49.20Z', '49.31Z', '52.21Z'],
  // Transport aérien
  air_transport: ['51.10Z', '51.21Z', '51.22Z', '52.23Z'],
  // Transport routier & maritime
  road_maritime: [
    '49.32Z',
    '49.39A',
    '49.39B',
    '49.39C',
    '49.41A',
    '49.41B',
    '49.41C',
    '49.42Z',
    '50.10Z',
    '50.20Z',
    '50.30Z',
    '50.40Z',
  ],
  // Logistique & supply chain
  logistics: ['52.10A', '52.10B', '52.24A', '52.24B', '52.29A', '52.29B', '53.10Z', '53.20Z'],
  // ─── finance ─────────────────────────────────────────────────────────
  // Banque de détail & privée
  retail_banking: ['64.19Z', '64.92Z', '66.19A', '66.19B'],
  // Banque d'investissement & marchés
  investment_banking: ['64.30Z', '64.99Z', '66.11Z', '66.12Z', '66.30Z'],
  // Assurance & mutuelles
  insurance: ['65.11Z', '65.12Z', '65.20Z', '65.30Z', '66.21Z', '66.22Z', '66.29Z'],
  // Fintech & services financiers
  fintech: ['64.20Z', '64.91Z', '64.99Z', '66.19A', '66.19B'],
  // ─── sante ───────────────────────────────────────────────────────────
  // Santé & hôpitaux
  healthcare: [
    '86.10Z',
    '86.21Z',
    '86.22A',
    '86.22B',
    '86.22C',
    '86.23Z',
    '86.90A',
    '86.90B',
    '86.90C',
    '86.90D',
    '86.90E',
    '86.90F',
    '87.10A',
    '87.10B',
    '87.10C',
  ],
  // Sciences du vivant & biotech
  life_sciences: ['21.10Z', '72.11Z', '72.19Z'],
  // Medtech & dispositifs médicaux
  medtech: ['26.60Z', '32.50A', '32.50B', '32.99Z'],
  // ─── commerce ────────────────────────────────────────────────────────
  // Retail & grande distribution
  retail: [
    '47.11A',
    '47.11B',
    '47.11C',
    '47.11D',
    '47.11E',
    '47.11F',
    '47.19A',
    '47.19B',
    '47.30Z',
    '47.52A',
    '47.52B',
    '47.54Z',
    '47.71Z',
    '47.78A',
    '47.78B',
    '47.78C',
  ],
  // E-commerce & marketplaces
  // #4358 — vente à distance (47.91A/B) et portails web (63.12Z) SEULEMENT. 47.99A (vente à domicile) et
  // 47.99B (automates, éventaires, marchés) sont du détail hors magasin : ils faisaient remonter des
  // détaillants sous « e-commerce » (retour du call du 19/10/2026 : « je veux Le Bon Coin, Back Market »).
  ecommerce: ['47.91A', '47.91B', '63.12Z'],
  // Luxe & mode
  luxury: ['14.11Z', '14.13Z', '14.19Z', '15.12Z', '15.20Z', '32.12Z', '32.13Z', '46.48Z'],
  // Hôtellerie, tourisme & loisirs
  hospitality_tourism: [
    '55.10Z',
    '55.20Z',
    '55.30Z',
    '55.90Z',
    '56.10A',
    '56.10B',
    '56.10C',
    '56.21Z',
    '56.29A',
    '56.29B',
    '56.30Z',
    '79.11Z',
    '79.12Z',
    '79.90Z',
    '93.11Z',
    '93.21Z',
    '93.29Z',
  ],
  // ─── tech ────────────────────────────────────────────────────────────
  // Éditeurs & tech
  software_tech: [
    '58.21Z',
    '58.29A',
    '58.29B',
    '58.29C',
    '62.01Z',
    '62.02A',
    '62.02B',
    '62.03Z',
    '62.09Z',
    '63.11Z',
    '63.12Z',
  ],
  // Télécoms
  telecom: ['61.10Z', '61.20Z', '61.30Z', '61.90Z'],
  // Médias & divertissement
  media_entertainment: [
    '58.11Z',
    '58.12Z',
    '58.13Z',
    '58.14Z',
    '58.19Z',
    '59.11A',
    '59.11B',
    '59.11C',
    '59.12Z',
    '59.13A',
    '59.13B',
    '59.14Z',
    '59.20Z',
    '60.10Z',
    '60.20A',
    '60.20B',
    '73.11Z',
    '73.12Z',
  ],
  // ─── public ──────────────────────────────────────────────────────────
  // Secteur public & collectivités
  public_sector: [
    '84.11Z',
    '84.12Z',
    '84.13Z',
    '84.21Z',
    '84.22Z',
    '84.23Z',
    '84.24Z',
    '84.25Z',
    '84.30A',
    '84.30B',
    '84.30C',
  ],
  // Éducation & recherche
  education_research: [
    '72.11Z',
    '72.19Z',
    '72.20Z',
    '85.10Z',
    '85.20Z',
    '85.31Z',
    '85.32Z',
    '85.41Z',
    '85.42Z',
    '85.51Z',
    '85.52Z',
    '85.53Z',
    '85.59A',
    '85.59B',
    '85.60Z',
  ],
}

/** Les codes NAF d'une sélection de secteurs, dédupliqués, dans l'ordre reçu.
 *  Un secteur inconnu n'ajoute RIEN — il ne vide pas la liste. Rendre du vide
 *  sur un libellé mal orthographié ferait disparaître les résultats sans rien
 *  dire ; c'est le pire des deux échecs possibles (`naf_sections.py`). */
export function nafCodesForSectors(sectors: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const sector of sectors) {
    for (const naf of APPLICATION_SECTOR_NAF[sector] ?? []) {
      if (!seen.has(naf)) {
        seen.add(naf)
        out.push(naf)
      }
    }
  }
  return out
}

/** Les préfixes à quatre chiffres d'une sélection — pour CLASSER un code NAF
 *  déjà connu (mode Signaux, où chaque candidat porte le sien), jamais pour
 *  interroger. Sans point ni casse, comme `esn_naf.py` : le registre écrit
 *  « 3030 », la table écrit « 30.30Z », une comparaison littérale raterait. */
export function nafPrefixesForSectors(sectors: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const naf of nafCodesForSectors(sectors)) {
    seen.add(naf.replace(/\D/g, '').slice(0, 4))
  }
  return [...seen]
}

/** Les secteurs d'un groupe, dans l'ordre du vocabulaire partagé. C'est ce qui
 *  permet à une pastille de groupe de cocher ses secteurs sans que l'écran
 *  reconstruise la hiérarchie — elle vivrait alors à deux endroits. */
export function sectorCodesForGroup(group: ApplicationSectorGroup): string[] {
  return APPLICATION_SECTORS.filter(sector => sector.group === group).map(sector => sector.code)
}
