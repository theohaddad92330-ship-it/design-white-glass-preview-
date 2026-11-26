import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RENEWAL_WINDOW_DAYS,
  RENEWAL_WINDOW_FLOOR_DAYS,
  RENEWAL_WINDOW_SLOTS,
  renewalWindow,
  renewalWindowBoundDays,
  renewalWindowDaysSchema,
  renewalWindowsOf,
  resolveRenewalWindowDays,
} from './mission.js'

const TODAY = new Date('2026-09-16T09:00:00.000Z')
function inDays(n: number): string {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * #2195.8 — CHAQUE ESPACE RÈGLE SES FENÊTRES, LES TROIS GARDE-FOUS INTACTS.
 *
 * Décision de Louis du 16/09/2026 : l'échelle cesse d'être quatre NOMS et
 * devient une liste ORDONNÉE de bornes en JOURS. `j15`…`j60` survivent comme
 * IDENTIFIANTS de position (GA-08 : un enum ne perd jamais de valeur et n'en
 * insère jamais au milieu) ; ce qui s'AFFICHE se calcule depuis le nombre de
 * jours, à un seul endroit (GA-26). Sans ça, un espace réglé sur
 * [20, 40, 70, 100] lirait « J-15 » sur une fenêtre qui s'ouvre à vingt jours —
 * une étiquette qui MENT, et qu'un commercial répète en rendez-vous.
 *
 * Les trois garde-fous sont nommés dans la décision, et chacun a son test :
 *  1. jamais sous J-15 — sous ce délai un renouvellement ne se prépare plus,
 *     il se subit ;
 *  2. bornes strictement croissantes — une échelle qui se croise rend deux
 *     fenêtres vraies en même temps et la ligne tombe dans les deux ;
 *  3. « sans date de fin » n'est jamais retirable — une mission sans échéance
 *     n'entre dans aucune fenêtre, et la masquer la ferait disparaître de
 *     l'écran qui existe pour la rattraper.
 */
describe('#2195.8 — les fenêtres de renouvellement se règlent en JOURS', () => {
  it('l’échelle par défaut reproduit EXACTEMENT les quatre jalons d’avant', () => {
    expect([...DEFAULT_RENEWAL_WINDOW_DAYS]).toEqual([15, 30, 45, 60])
    // Le chemin par défaut est inchangé : sans réglage d'espace, rien ne bouge
    // pour personne — c'est ce qui rend ce lot « ajout seulement ».
    expect(renewalWindow(inDays(15), TODAY)).toBe('j15')
    expect(renewalWindow(inDays(30), TODAY)).toBe('j30')
    expect(renewalWindow(inDays(45), TODAY)).toBe('j45')
    expect(renewalWindow(inDays(60), TODAY)).toBe('j60')
    expect(renewalWindow(inDays(61), TODAY)).toBe('far')
  })

  it('une échelle d’espace déplace les bornes, et les slots restent LISIBLES', () => {
    const scale = [20, 40, 70, 100]
    expect(renewalWindow(inDays(20), TODAY, scale)).toBe('j15')
    expect(renewalWindow(inDays(21), TODAY, scale)).toBe('j30')
    expect(renewalWindow(inDays(70), TODAY, scale)).toBe('j45')
    expect(renewalWindow(inDays(100), TODAY, scale)).toBe('j60')
    expect(renewalWindow(inDays(101), TODAY, scale)).toBe('far')
    // Et c'est le NOMBRE DE JOURS qui se lit, jamais le nom du slot : « j15 »
    // MENTIRAIT sur une échelle qui commence à vingt jours.
    expect(renewalWindowBoundDays('j15', scale)).toBe(20)
    expect(renewalWindowBoundDays('j60', scale)).toBe(100)
    expect(renewalWindowBoundDays('unknown', scale)).toBeNull()
    expect(renewalWindowBoundDays('overdue', scale)).toBeNull()
    expect(renewalWindowBoundDays('imminent', scale)).toBeNull()
    expect(renewalWindowBoundDays('far', scale)).toBeNull()
  })

  it('une échelle plus COURTE n’ouvre que les slots qu’elle règle', () => {
    const scale = [30, 90]
    expect(renewalWindowsOf(scale)).toEqual(['overdue', 'imminent', 'j15', 'j30', 'unknown'])
    expect(renewalWindowBoundDays('j45', scale)).toBeNull()
    expect(renewalWindow(inDays(91), TODAY, scale)).toBe('far')
  })

  it('garde-fou 1 — JAMAIS sous J-15', () => {
    expect(RENEWAL_WINDOW_FLOOR_DAYS).toBe(15)
    expect(renewalWindowDaysSchema.safeParse([14, 30, 45, 60]).success).toBe(false)
    expect(renewalWindowDaysSchema.safeParse([15, 30, 45, 60]).success).toBe(true)
    expect(renewalWindowDaysSchema.safeParse([0]).success).toBe(false)
    expect(renewalWindowDaysSchema.safeParse([-10, 30]).success).toBe(false)
  })

  it('garde-fou 2 — bornes STRICTEMENT croissantes', () => {
    expect(renewalWindowDaysSchema.safeParse([30, 30]).success).toBe(false)
    expect(renewalWindowDaysSchema.safeParse([60, 30]).success).toBe(false)
    expect(renewalWindowDaysSchema.safeParse([15, 30, 45]).success).toBe(true)
  })

  it('garde-fou 3 — « sans date de fin » n’est JAMAIS retirable', () => {
    // Il n'a pas de borne, donc aucun réglage ne peut l'éteindre : le garde-fou
    // est STRUCTUREL. Le prouver sur toutes les échelles valides, pas sur une.
    for (const scale of [[15], [15, 30], [20, 40, 70, 100], [...DEFAULT_RENEWAL_WINDOW_DAYS]]) {
      expect(renewalWindowsOf(scale)).toContain('unknown')
      expect(renewalWindowsOf(scale)).toContain('overdue')
      expect(renewalWindow(null, TODAY, scale)).toBe('unknown')
    }
  })

  it('une échelle ABÎMÉE retombe sur celle du produit, jamais sur une erreur ni sur zéro', () => {
    expect(resolveRenewalWindowDays(null)).toEqual([...DEFAULT_RENEWAL_WINDOW_DAYS])
    expect(resolveRenewalWindowDays(undefined)).toEqual([...DEFAULT_RENEWAL_WINDOW_DAYS])
    expect(resolveRenewalWindowDays([])).toEqual([...DEFAULT_RENEWAL_WINDOW_DAYS])
    expect(resolveRenewalWindowDays('n’importe quoi')).toEqual([...DEFAULT_RENEWAL_WINDOW_DAYS])
    expect(resolveRenewalWindowDays([60, 30])).toEqual([...DEFAULT_RENEWAL_WINDOW_DAYS])
    expect(resolveRenewalWindowDays([20, 40])).toEqual([20, 40])
  })

  it('n’accepte pas plus de bornes qu’il n’y a de slots (GA-08)', () => {
    expect([...RENEWAL_WINDOW_SLOTS]).toEqual(['j15', 'j30', 'j45', 'j60'])
    expect(renewalWindowDaysSchema.safeParse([15, 30, 45, 60, 90]).success).toBe(false)
  })

  it('la borne la plus SERRÉE ne mange jamais « imminent »', () => {
    // `imminent` (≤ 10 jours) vit sous le plancher des quinze jours : c'est
    // pour ça que le plancher est à quinze et pas à cinq. Le vérifier, sinon
    // un plancher abaissé un jour ferait disparaître l'urgence la plus courte
    // sans qu'aucun test ne le dise.
    expect(renewalWindow(inDays(10), TODAY, [15])).toBe('imminent')
    expect(renewalWindow(inDays(10), TODAY, [20, 40, 70, 100])).toBe('imminent')
  })
})
