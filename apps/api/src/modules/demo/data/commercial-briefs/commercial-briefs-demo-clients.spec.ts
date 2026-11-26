import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'

/**
 * Démos clients du 06 au 09/10/2026 — ce qui n'est PAS un compte de plus : BPCE reçoit une COUCHE (Toulouse, démo Thélio)
 * et ABB Suisse porte un autre PÉRIMÈTRE (décision Louis 04/10/2026, D4). Les nombres sont des MESURES des classeurs
 * (`agent_docs/sources/briefs-comptes-2026-10-04/`, hors dépôt) ; un régénéré qui dérive fait échouer la CI.
 */

const load = (slug: string): CommercialBrief =>
  commercialBriefSchema.parse(JSON.parse(readFileSync(join(__dirname, `${slug}.json`), 'utf8'))) as CommercialBrief

describe('BPCE — couche Toulouse ajoutée au groupe (UN seul compte)', () => {
  const brief = load('bpce')
  const person = (name: string) => brief.people.find(p => p.name === name)

  it('ne porte aucune violation métier', () => {
    expect(checkCommercialBrief(brief)).toEqual([])
  })

  it('garde le brief du GROUPE intact (siège, cockpit du groupe, sections du groupe)', () => {
    expect(brief.headquarters).toMatchObject({ label: 'Tours Duo', city: 'Paris' })
    expect(brief.sites.filter(s => s.kind === 'headquarters')).toHaveLength(1)
    const keys = brief.sections.map(s => s.key)
    for (const key of [
      'fiche-compte',
      'achats-avant-d-appeler',
      'technos-a-vendre',
      'besoins-recents',
      'plan-d-action',
    ]) {
      expect(keys).toContain(key)
    }
    expect(brief.kpis.map(k => k.label)).not.toContain('BALMA')
  })

  it('range chaque section de Toulouse sous « toulouse-… » et le cockpit sous « cockpit-toulouse »', () => {
    const keys = brief.sections.map(s => s.key)
    for (const key of [
      'toulouse-entites-occitanie',
      'toulouse-decideurs-occitanie',
      'toulouse-postes-data',
      'toulouse-competences-data-a-vendre',
      'toulouse-esn',
      'toulouse-comptes-similaires',
      'toulouse-marche-toulouse',
      'toulouse-plan-d-action',
      'toulouse-ce-que-je-sais-national',
      'toulouse-notes',
      'cockpit-toulouse',
    ]) {
      expect(keys).toContain(key)
    }
    expect(new Set(keys).size).toBe(keys.length)
    // lignes de données mesurées dans le classeur (hors titre, sous-titre, note et en-tête de chaque onglet)
    const rows = (key: string) => brief.sections.find(s => s.key === key)?.rows.length
    expect(rows('toulouse-entites-occitanie')).toBe(9)
    expect(rows('toulouse-decideurs-occitanie')).toBe(24)
    expect(rows('toulouse-postes-data')).toBe(14)
    expect(rows('toulouse-competences-data-a-vendre')).toBe(8)
    expect(rows('toulouse-esn')).toBe(42)
    expect(rows('toulouse-comptes-similaires')).toBe(21)
    expect(rows('toulouse-marche-toulouse')).toBe(6)
    expect(rows('toulouse-plan-d-action')).toBe(8)
    expect(rows('toulouse-ce-que-je-sais-national')).toBe(10)
  })

  it('porte le cockpit de Toulouse : indicateurs, une page « ce que je sais », graphiques', () => {
    const text = JSON.stringify(brief.sections.find(s => s.key === 'cockpit-toulouse')?.rows ?? [])
    for (const label of ['BALMA', 'PLATEFORME DATA', 'ESTREEM', 'DÉCIDEURS LOCAUX']) expect(text).toContain(label)
    expect(text).toContain('TOULOUSE — LE PÔLE BPCE')
    expect(text).toContain('POSTES DATA PAR ENTITÉ')
  })

  it('ajoute les garde-fous de Toulouse (6) à ceux du groupe (7), préfixés', () => {
    expect(brief.guardrails).toHaveLength(7 + 6)
    expect(brief.guardrails.filter(g => g.point.startsWith('Toulouse — '))).toHaveLength(6)
    expect(brief.guardrails.map(g => g.point)).toContain("Strasbourg n'est pas le siège")
  })

  it('ajoute les entités d’Occitanie (9) et les sites de Toulouse absents du groupe', () => {
    expect(brief.entities).toHaveLength(9)
    expect(brief.entities.map(e => e.name)).toEqual(
      expect.arrayContaining(['Banque Populaire Occitane', "Estreem — L'Union", 'Crédit Coopératif']),
    )
    const cities = brief.sites.map(s => s.city)
    for (const city of ["L'Union", 'Toulouse', 'Montpellier', 'Perpignan']) expect(cities).toContain(city)
    // Balma est déjà un site du groupe : jamais redoublé
    expect(cities.filter(city => city === 'Balma')).toHaveLength(1)
  })

  it('ajoute les décideurs d’Occitanie, en clair', () => {
    expect(person('Caroline Tourrel')).toMatchObject({ role: 'decision_maker', entity: 'Banque Populaire Occitane' })
    expect(person('Franck Delafosse')).toMatchObject({ role: 'decision_maker', hook: 'Sponsor opérationnel' })
    // un manager de Balma avec sa ligne directe recopiée telle que le classeur la porte
    expect(person('M. Lamarche')).toMatchObject({ role: 'manager', phone: '+33 5 32 02 90 51' })
    expect(person('M. Lamarche')?.city).toContain('Balma')
  })

  it('ajoute les profils en poste et anciens de Toulouse (e-mails et mobiles en clair)', () => {
    expect(person('Jordan Miquel')).toMatchObject({ role: 'external', city: 'Toulouse' })
    expect(person('Jordan Miquel')?.email).toContain('jordan.miquel@bpce-si.fr')
    expect(person('Fabrice Yeremganga')).toMatchObject({ role: 'external', mobile: '+33 6 47 72 58 84' })
    expect(person('Camille Régnier')?.role).toBe('alumni')
    expect(person('Valentin Blind')?.role).toBe('contact')
  })

  it('ne redouble aucune personne (nom normalisé, ordre des mots ignoré)', () => {
    const keys = brief.people.map(p =>
      p.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .sort()
        .join(' '),
    )
    // les homonymes que le CLASSEUR du groupe porte déjà (quatre paires de contacts, gardées telles quelles) sont les
    // seuls doublons : la couche n'en ajoute aucun
    const duplicated = [...new Set(keys.filter((key, i) => keys.indexOf(key) !== i))].sort()
    expect(duplicated).toEqual(['andre fabien', 'arnaud patrice', 'dalon sandrine', 'hugues sebastien'])
  })
})

describe('ABB Suisse — périmètre « suisse »', () => {
  const brief = load('abb-suisse')

  it('ne porte aucune violation métier', () => {
    expect(checkCommercialBrief(brief)).toEqual([])
  })

  it('porte le périmètre « suisse », un siège à Zurich et des sites en CH', () => {
    expect(brief.account_name).toBe('ABB Suisse')
    expect(brief.scope).toBe('suisse')
    expect(brief.headquarters).toMatchObject({ label: 'Zurich', city: 'Zurich' })
    expect(brief.sites.every(s => s.country === 'CH')).toBe(true)
    expect(brief.sites.find(s => s.kind === 'headquarters')?.name).toBe('Zurich Cityport — siège actuel')
  })

  it('garde hors des sites ce qui n’en est pas un (futur siège annoncé, Cracovie) — en section, avec son motif', () => {
    const names = brief.sites.map(s => s.name)
    expect(names).not.toContain('Futur siège annoncé')
    expect(names).not.toContain('ABB Business Services — Cracovie')
    expect(brief.sections.find(s => s.key === 'sites-suisses-non-retenus')?.rows).toHaveLength(2)
    expect(brief.sites).toHaveLength(12)
  })

  it('ne retient comme entités que celles de Suisse ; les opérations et cibles étrangères restent en section', () => {
    expect(brief.entities.length).toBeGreaterThan(0)
    expect(brief.entities.every(e => e.country === 'CH')).toBe(true)
    expect(brief.entities.map(e => e.name)).toContain('Sevensense')
    expect(brief.entities.map(e => e.name)).not.toContain('Høglund')
    expect(brief.sections.find(s => s.key === 'entites-non-retenus')?.rows.length).toBeGreaterThan(0)
  })

  it('range les règles suisses en section ET en garde-fous (location de services, partenaire ≠ fournisseur)', () => {
    expect(brief.sections.find(s => s.key === 'regles-suisse')?.rows).toHaveLength(25)
    expect(brief.guardrails.map(g => g.point)).toEqual(
      expect.arrayContaining([
        'Règle suisse — Location de services depuis l’étranger interdite',
        'Règle suisse — Partenaire de vente ≠ fournisseur de prestations',
        "Localisation déclarée n'est pas périmètre de responsabilité",
      ]),
    )
  })

  it('ne convertit jamais un prix : aucune grille ABB n’est publique, aucun prix dans `prices`', () => {
    expect(brief.prices).toEqual([])
  })

  it('ne présente pas comme « ESN présentes » les acteurs du marché suisse (section seulement)', () => {
    expect(brief.esn).toEqual([])
    expect(brief.sections.find(s => s.key === 'esn-et-partenaires-suisse')?.rows).toHaveLength(9)
  })

  it('lit le rôle dans la colonne RÔLE du classeur (au potentiel), sans jamais présenter une autorité comme confirmée', () => {
    expect(brief.people).toHaveLength(33 + 44)
    expect(brief.people.filter(p => p.role === 'decision_maker')).toHaveLength(23)
    expect(brief.people.filter(p => p.role === 'contact')).toHaveLength(54)
    expect(brief.people.every(p => !p.exited)).toBe(true)
    // la valeur d'origine voyage telle quelle (« …_POTENTIEL »), et le garde-fou du classeur reste au brief
    for (const p of brief.people.filter(p => p.role === 'decision_maker')) expect(p.hook).toMatch(/POTENTIEL/)
    expect(brief.guardrails.map(g => g.point)).toContain('Aucune autorité budgétaire confirmée')
    // les liens LinkedIn sont recopiés tels que le classeur les porte ; aucune adresse e-mail n'est inventée (garde-fou)
    expect(brief.people.some(p => p.linkedin?.startsWith('https://www.linkedin.com/'))).toBe(true)
    expect(brief.people.every(p => p.email === undefined)).toBe(true)
  })
})
