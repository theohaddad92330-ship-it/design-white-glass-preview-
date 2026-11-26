/**
 * GA — un brouillon vers l'EXTÉRIEUR ne part jamais avec un lot.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * La cascade d'après rendez-vous prépare dix sorties (neuf à l'origine, plus
 * le problème client — #2103.10). Huit écrivent en interne ; deux — le mail
 * de suivi et la relance — visent une personne extérieure. Le produit promet,
 * en toutes lettres sur l'écran, « aucune action externe envoyée ».
 *
 * Cette promesse ne tient pas dans une couleur de puce ni dans un `if`. Elle
 * tient parce que **le moyen manque** :
 *
 * 1. `meetingInternalOutputKindSchema` ne contient PAS les deux sorties
 *    externes — une requête de lot ne peut donc pas les nommer, ni au
 *    compilateur, ni à Zod, ni à l'exécution.
 * 2. Il n'existe aucune fonction d'ENVOI côté client. L'écran sait afficher et
 *    copier un brouillon ; il ne sait pas l'expédier, et il n'a aucune adresse
 *    d'API vers laquelle essayer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE LIT
 * ─────────────────────────────────────────────────────────────────────────
 * Le contrat partagé ET les fichiers de la feature. Une garde qui ne lirait que
 * le contrat serait borgne : c'est l'écran qui pourrait un jour poster vers une
 * route d'envoi qu'un autre chantier aurait ouverte. Les deux corpus sont donc
 * vérifiés NON VIDES avant d'être lus — une garde qui lit zéro fichier est
 * verte pour la mauvaise raison.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  meetingExternalOutputKindSchema,
  meetingInternalOutputKindSchema,
  meetingOutputKindSchema,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

const FEATURE = join(__dirname, '..', 'features', 'meetings')

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return filesUnder(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

const SOURCES = filesUnder(FEATURE).map(path => ({ path, code: readFileSync(path, 'utf8') }))

describe('la garde lit réellement quelque chose', () => {
  it('la feature existe et porte au moins l’écran et son client', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(2)
    expect(SOURCES.some(file => file.path.endsWith('api.ts'))).toBe(true)
  })
})

describe('le lot n’a aucune case pour une sortie externe', () => {
  it('les deux énumérations sont disjointes et couvrent les dix sorties', () => {
    const internal = meetingInternalOutputKindSchema.options as readonly string[]
    const external = meetingExternalOutputKindSchema.options as readonly string[]
    expect(internal.length).toBe(8)
    expect(external).toEqual(['follow_up_email', 'reminder'])
    expect(internal.filter(kind => external.includes(kind))).toEqual([])
    expect([...internal, ...external].sort()).toEqual([...meetingOutputKindSchema.options].sort())
  })

  it('aucune sortie externe n’est nommable dans une demande de lot', () => {
    for (const kind of meetingExternalOutputKindSchema.options) {
      expect(meetingInternalOutputKindSchema.safeParse(kind).success).toBe(false)
    }
  })
})

describe('l’écran n’a aucun moyen d’envoyer', () => {
  it('aucun fichier de la feature n’appelle une route d’envoi', () => {
    // On cherche le MOYEN, pas l'intention : une adresse d'API qui contiendrait
    // « send », « /send », « /email » ou « /outreach » serait un chemin
    // d'expédition, quel que soit le commentaire posé au-dessus.
    const forbidden = /['"`][^'"`]*\/(send|emails?|outreach|messages)[^'"`]*['"`]/i
    for (const file of SOURCES) {
      // Les commentaires parlent d'envoi pour dire qu'il n'existe pas : on ne
      // lit donc que le code.
      const code = file.code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect({ file: file.path, match: forbidden.exec(code)?.[0] ?? null }).toEqual({
        file: file.path,
        match: null,
      })
    }
  })

  it('la seule chose que l’écran sait faire d’un brouillon externe, c’est le copier', () => {
    const screen = SOURCES.find(file => file.path.endsWith('MeetingCascade.tsx'))
    expect(screen).toBeDefined()
    expect(screen?.code).toContain('clipboard.writeText')
    // Et il ne propose « Valider » que sur les cartes qui NE visent PAS
    // l'extérieur : c'est la branche qui porte la promesse à l'écran.
    expect(screen?.code).toContain('card.reachesOutside ?')
  })
})
