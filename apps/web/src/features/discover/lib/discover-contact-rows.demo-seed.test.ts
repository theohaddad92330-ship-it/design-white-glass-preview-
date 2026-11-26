import { describe, expect, it } from 'vitest'
import type { ContactListItem } from '@bellum/contracts'
import { MARKET_COUNTRY_NAMES } from '@bellum/contracts'
import { contactRowsFrom, emptyContactFilters, filterContactRows } from './discover-contact-rows'

/**
 * #2165.38 — la démo doit REMPLIR Découvrir, pas seulement la colonne
 * `contacts.location`.
 *
 * Le trou (#2165.38, 18/09/2026) était invisible tant que rien ne filtrait
 * sur la localisation. Il l'est devenu à l'intégration de la vague 6
 * (21/09/2026) : Découvrir applique par défaut un filtre PAYS (#2621.1,
 * `feat/le-pays-et-la-ville-de-decouvrir-21-09`, désormais fusionnée) qui
 * exclut toute localisation inconnue. Ce test utilise maintenant le VRAI
 * filtre — `filterContactRows(rows, filters, workspaceCountryName)`, avec
 * `workspaceCountryName` résolu depuis `MARKET_COUNTRY_NAMES.FR` comme le
 * fait l'écran réel — et non plus la doublure `filters.location: 'France'`
 * qui tenait lieu du filtre pays avant que la branche #2621.1 ne soit
 * fusionnée.
 *
 * Les chaînes ci-dessous sont EXACTEMENT celles que `demoContactRow()` écrit
 * (`apps/api/src/modules/demo/demo-seed.service.ts`, dérivées de
 * `demoLocation()` sur le siège réel de chaque société du jeu de données,
 * `apps/api/src/modules/demo/demo-dataset.ts`) — si l'une des deux dérive,
 * ce test doit être mis à jour à la main.
 */
function demoContactLocations(): string[] {
  return [
    'Paris, France', // Société Générale — 29 boulevard Haussmann, 75009 Paris
    'Meudon, France', // Thales — 4 rue de la Verrerie, 92190 Meudon
    'Paris, France', // leboncoin — 24 rue des Jeûneurs, 75002 Paris
    'Paris, France', // BlaBlaCar — 84 avenue de la République, 75011 Paris
    'Saint-Denis, France', // SNCF — 2 place aux Étoiles, 93210 Saint-Denis
    'Villeneuve-d’Ascq, France', // Decathlon — 4 boulevard de Mons, 59650 Villeneuve-d’Ascq
    'Lyon, France', // NOVA LOGISTIQUE (client d’exemple) — headquarters: 'Lyon'
    'Paris, France', // Camille Roussel — contact « à qualifier » (#1473)
    'Paris, France', // Sofiane Berthier — contact « à qualifier » (#1473)
  ]
}

function demoContactItem(id: string, location: string | null): ContactListItem {
  return {
    id,
    account_id: null,
    full_name: `Contact ${id}`,
    title: 'Titre',
    entity: null,
    decision_role: null,
    priority: null,
    email: null,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'demo',
    company_name: null,
    location,
  }
}

describe('les contacts de démo traversent le vrai filtre de Découvrir (#2165.38)', () => {
  it('chaque contact seedé avec une location réelle passe le filtre pays réel, aucun ne sort vide', () => {
    const locations = demoContactLocations()
    const rows = contactRowsFrom(locations.map((location, index) => demoContactItem(`demo-${index}`, location)))

    // #2621.1 — le filtre pays réel de l'écran : `worldwide: false` (défaut)
    // + `workspaceCountryName` résolu comme `Discover.tsx` le résout, depuis
    // `MARKET_COUNTRY_NAMES.FR`.
    const matched = filterContactRows(rows, emptyContactFilters(), MARKET_COUNTRY_NAMES.FR)

    // #2165.38 — c'est TOUT l'intérêt de ce test : un semis dont une seule
    // valeur serait au mauvais format (pas de « France » brute dedans, ou
    // `null`) ferait sortir cette ligne du résultat sans qu'aucune erreur ne
    // le signale ailleurs — exactement le défaut qui vidait Découvrir.
    expect(matched).toHaveLength(locations.length)
    expect(matched.map(row => row.fullName)).toEqual(rows.map(row => row.fullName))
  })
})
