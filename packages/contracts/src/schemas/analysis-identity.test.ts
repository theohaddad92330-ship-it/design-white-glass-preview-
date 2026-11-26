import { describe, expect, it } from 'vitest'
import {
  buildIdentityMismatchMessage,
  isSameRegistryIdentity,
  normalizeRegistryIdentity,
  parseIdentityMismatchMessage,
} from './analysis-identity.js'

/**
 * GA-96 — le contrat du refus d'identité.
 *
 * Il vit ici, dans `@bellum/contracts`, parce que le message est ÉCRIT par
 * l'API et RELU par l'écran. Les deux sentinelles qui existaient avant celle-ci
 * (« Analyse annulée par l'utilisateur. », « Analyse interrompue… ») sont des
 * phrases françaises recopiées à la main dans le front pour être reconnues :
 * un réglage qui vit à deux endroits, et une phrase que personne ne peut
 * traduire sans casser la reconnaissance. Ce test garde le round-trip.
 */
describe('GA-96 — le message de refus d’identité', () => {
  const ROCHE = '552012031' // le laboratoire pharmaceutique
  const ROCHE_BOBOIS = '493229280' // le distributeur de meubles

  it('se relit lui-même — ce qu’il écrit, il sait le rendre', () => {
    const message = buildIdentityMismatchMessage({ expected: ROCHE, resolved: ROCHE_BOBOIS })
    expect(parseIdentityMismatchMessage(message)).toEqual({ expected: ROCHE, resolved: ROCHE_BOBOIS })
  })

  it('reste LISIBLE sans être décodé — un opérateur qui lit la base comprend', () => {
    const message = buildIdentityMismatchMessage({ expected: ROCHE, resolved: ROCHE_BOBOIS })
    expect(message).toContain('Rafraîchissement refusé')
    expect(message).toContain("Le dossier n'a pas été modifié.")
    expect(message).toContain(ROCHE)
    expect(message).toContain(ROCHE_BOBOIS)
  })

  it('se relit ENCORE une fois enveloppé par le classificateur d’erreurs du worker', () => {
    // `AnalysisWorker.persistenceError` préfixe « L'analyse de X a échoué à
    // l'enregistrement de la phase « research » : … ». Sans cette tolérance, le
    // refus arriverait à l'écran en français brut, non traduit — c'est-à-dire
    // que la garde marcherait partout SAUF en production.
    const inner = buildIdentityMismatchMessage({ expected: ROCHE, resolved: ROCHE_BOBOIS })
    const wrapped = `L'analyse de ROCHE a échoué à l'enregistrement de la phase « research » : ${inner}`
    expect(parseIdentityMismatchMessage(wrapped)).toEqual({ expected: ROCHE, resolved: ROCHE_BOBOIS })
  })

  it('ne reconnaît PAS un message d’erreur ordinaire', () => {
    expect(parseIdentityMismatchMessage('Timeout Firecrawl')).toBeNull()
    expect(parseIdentityMismatchMessage("Analyse annulée par l'utilisateur.")).toBeNull()
    expect(parseIdentityMismatchMessage(null)).toBeNull()
    expect(parseIdentityMismatchMessage(undefined)).toBeNull()
    expect(parseIdentityMismatchMessage('')).toBeNull()
  })

  it('refuse un refus À MOITIÉ lu plutôt que de l’afficher avec un trou', () => {
    // Le marqueur seul, sans les deux identités : il n'y a rien à montrer à
    // l'utilisateur, et une bannière qui dirait « une autre société ( ) que
    // celle du dossier ( ) » serait pire que la bannière d'échec générique.
    expect(parseIdentityMismatchMessage('[bellum:identity_mismatch] quelque chose a mal tourné')).toBeNull()
  })
})

describe('GA-96 — deux identités désignent-elles la même société ?', () => {
  it('ignore la MISE EN FORME — « 552 012 031 » est la même société que « 552012031 »', () => {
    // Pappers rend le SIREN espacé, la colonne le stocke compact. Un refus qui
    // se déclencherait là-dessus bloquerait un dossier parfaitement sain, et
    // perdrait en un jour toute la confiance qu'on accorde à cette garde.
    expect(isSameRegistryIdentity('552 012 031', '552012031')).toBe(true)
    expect(isSameRegistryIdentity('552.012.031', '552012031')).toBe(true)
    expect(isSameRegistryIdentity('552-012-031', ' 552012031 ')).toBe(true)
  })

  it('reste sensible à la CASSE nulle mais aux chiffres, oui — deux sociétés restent deux sociétés', () => {
    expect(isSameRegistryIdentity('552012031', '493229280')).toBe(false)
    // Un chiffre de différence suffit : c'est une autre entreprise.
    expect(isSameRegistryIdentity('552012031', '552012032')).toBe(false)
  })

  it('normalise les identifiants ÉTRANGERS sans les confondre', () => {
    // Le pivot transfrontalier porte des identifiants alphanumériques (CIK US,
    // UID CH…). La casse ne fait pas l'identité, les caractères, si.
    expect(isSameRegistryIdentity('che-105.805.129', 'CHE105805129')).toBe(true)
    expect(isSameRegistryIdentity('CIK0000320193', 'cik0000320193')).toBe(true)
    expect(isSameRegistryIdentity('CHE105805129', 'CHE105805130')).toBe(false)
  })

  it('une ABSENCE n’est jamais « la même identité »', () => {
    // C'est le piège que la première version de cette fonction aurait posé :
    // deux `null` normalisés donnent deux chaînes vides, donc « égales ». Or
    // l'absence d'identité des deux côtés n'autorise RIEN — l'appelant doit la
    // traiter avant, et c'est ce qu'il fait (`if (data.siren && current.siren)`).
    expect(isSameRegistryIdentity(null, null)).toBe(false)
    expect(isSameRegistryIdentity('', '')).toBe(false)
    expect(isSameRegistryIdentity('552012031', null)).toBe(false)
    expect(isSameRegistryIdentity(undefined, '552012031')).toBe(false)
  })

  it('normalizeRegistryIdentity rend une chaîne vide sur une absence', () => {
    expect(normalizeRegistryIdentity(null)).toBe('')
    expect(normalizeRegistryIdentity(undefined)).toBe('')
    expect(normalizeRegistryIdentity('  ')).toBe('')
    expect(normalizeRegistryIdentity('552 012 031')).toBe('552012031')
  })
})
