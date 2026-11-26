/**
 * Le rythme de Laura — §4.11 du PDF 10 (ticket BEL-LAU-904).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX MÉCANIQUES, UN SEUL PRINCIPE
 * ─────────────────────────────────────────────────────────────────────────
 * Le défaut n°11 du transcript est qu'« un seul message par tour rend Laura
 * mécanique », et le n°12 qu'« elle ne relance jamais quand le visiteur se
 * tait ». Les deux corrections ont le même risque : devenir un robot qui parle
 * tout seul. D'où deux plafonds DURS, en code et non en consigne — trois
 * messages consécutifs, deux relances de silence par session.
 *
 * ⚠️ **Aucun tirage aléatoire.** Le délai entre deux bulles se déduit de la
 * longueur du message : une phrase courte arrive vite, un paragraphe se fait
 * attendre — c'est ce que fait quelqu'un qui tape. Un `Math.random()` donnerait
 * la même impression et rendrait le module intestable, ce qui est un mauvais
 * échange pour un effet que personne ne remarquera.
 */

/** Le plafond dur du §4.11. Jamais plus, quoi que le modèle produise. */
export const MAX_CONSECUTIVE_MESSAGES = 3

/** Le séparateur que le prompt apprend à Laura. Une ligne qui ne contient que
 *  trois tirets : elle n'écrit ni tableau ni brochure, la collision est
 *  improbable — et si elle survient, le pire cas est une bulle de plus. */
const SPLIT = /^\s*-{3,}\s*$/

export const MIN_GAP_MS = 700
export const MAX_GAP_MS = 1_200

/**
 * Découpe une réponse en bulles successives.
 *
 * Ce qui dépasse le plafond est RECOLLÉ au dernier message, jamais jeté : une
 * réponse tronquée parce que le modèle a mis un séparateur de trop serait un
 * défaut invisible — le visiteur ne peut pas savoir qu'il lui manque une phrase.
 */
export function splitMessages(reply: string): string[] {
  const parts = reply
    .split('\n')
    .reduce<string[]>(
      (blocks, line) => {
        if (SPLIT.test(line)) blocks.push('')
        else blocks[blocks.length - 1] += blocks[blocks.length - 1] ? `\n${line}` : line
        return blocks
      },
      [''],
    )
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) return parts.length ? parts : []
  if (parts.length <= MAX_CONSECUTIVE_MESSAGES) return parts

  const kept = parts.slice(0, MAX_CONSECUTIVE_MESSAGES - 1)
  kept.push(parts.slice(MAX_CONSECUTIVE_MESSAGES - 1).join('\n\n'))
  return kept
}

/**
 * Le temps de frappe avant CE message.
 *
 * Borné des deux côtés : en dessous de 700 ms les bulles arrivent en rafale et
 * on voit la machine ; au-delà de 1 200 ms on croit que c'est fini et on part.
 */
export function gapBefore(message: string): number {
  return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, MIN_GAP_MS + message.length * 6))
}

/* ------------------------------------------------------------------ */
/*  Les relances de silence                                            */
/* ------------------------------------------------------------------ */

/** Le §4.13 : « si la personne ne répond plus depuis 45 secondes, tu peux
 *  relancer une fois, légèrement. Après 3 minutes, une dernière fois. » */
export const SOFT_NUDGE_AFTER_MS = 45_000
export const LAST_NUDGE_AFTER_MS = 3 * 60_000
export const MAX_NUDGES_PER_SESSION = 2

type SilenceNudge = 'soft' | 'last'

export type SilenceContext = {
  /** Depuis combien de temps le visiteur n'a rien écrit. */
  silentForMs: number
  /** Combien de relances sont déjà parties dans cette session. */
  nudgesSent: number
  /** La personne a dit au revoir. */
  saidGoodbye: boolean
  /** Elle a écrit au moins une fois — on ne relance pas quelqu'un qui n'a
   *  jamais parlé : ce n'est pas un silence, c'est une lecture. */
  hasSpoken: boolean
}

/**
 * Faut-il relancer, et comment ?
 *
 * Trois refus, dans l'ordre où ils comptent. Un au revoir arrête tout — insister
 * après « merci, au revoir » est la façon la plus sûre de laisser un mauvais
 * souvenir d'un échange qui s'était bien passé. Le plafond de session arrête
 * ensuite. Et quelqu'un qui n'a jamais écrit n'est pas silencieux : il lit.
 */
export function nextSilenceNudge(context: SilenceContext): SilenceNudge | null {
  if (context.saidGoodbye) return null
  if (!context.hasSpoken) return null
  if (context.nudgesSent >= MAX_NUDGES_PER_SESSION) return null

  if (context.nudgesSent === 0 && context.silentForMs >= SOFT_NUDGE_AFTER_MS) return 'soft'
  if (context.nudgesSent === 1 && context.silentForMs >= LAST_NUDGE_AFTER_MS) return 'last'
  return null
}

/**
 * Les formules d'adieu, repérées sur ce que le VISITEUR écrit.
 *
 * Le texte est débarrassé de ses accents AVANT d'être comparé : `\b` est ASCII
 * en JavaScript, si bien que `/\bà bientôt\b/` ne reconnaît jamais « À
 * bientôt ». Le dépôt s'est déjà fait prendre par cette limite en convertissant
 * les libellés de l'app — c'est le genre de faux négatif qui ne se voit qu'en
 * production, sur un visiteur qu'on relance après son au revoir.
 *
 * Volontairement étroit : « merci » tout seul n'est pas un adieu, c'est souvent
 * le contraire — quelqu'un qui remercie une réponse et continue.
 */
const GOODBYE =
  /\b(au revoir|bonne journee|bonne soiree|a bientot|a plus|bye|goodbye|see you|tschuss|doei|c'est bon merci|merci (?:beaucoup |bien )?(?:et )?(?:bonne|au revoir|a bientot))\b/

export function saysGoodbye(message: string): boolean {
  const ascii = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return GOODBYE.test(ascii)
}
