import { describe, expect, it } from 'vitest'
import { MISSION_CHANNELS, trueDailyCostCents } from './staffing.js'

/**
 * Le coût réel d'une mission passée par un intermédiaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le coût tenait en UNE colonne saisie, `loaded_daily_cost_cents`. Pour un
 * salarié c'est juste. Pour une mission passée par un partenaire ou en
 * sous-traitance, le coût réel est le TJM d'achat **plus la commission** de
 * l'intermédiaire — et rien ne portait cette seconde moitié.
 *
 * La marge de ces missions était donc SURÉVALUÉE, et c'est ce chiffre qui
 * alimente la marge par canal et l'alerte de seuil : le calcul censé dire
 * « passer par un intermédiaire coûte N points » était faussé du montant même
 * qu'il cherche à mesurer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI ELLE DÉPEND DU CANAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur une mission `direct`, il n'y a pas d'intermédiaire : le coût saisi EST le
 * coût. Sur une mission `partner` ou `subcontracting`, une commission inconnue
 * rend le coût **inconnu** — et non égal au TJM d'achat, ce qui reviendrait à
 * dire que l'intermédiaire travaille gratuitement.
 *
 * `unknown` garde le comportement d'avant : on ne devine pas un canal, et le
 * faire retirerait leur marge à toutes les missions dont personne n'a renseigné
 * le chemin. C'est le même arbitrage que la cadence de facturation.
 */

describe('trueDailyCostCents — la commission entre dans le coût', () => {
  it('DIRECT : le coût saisi est le coût', () => {
    expect(trueDailyCostCents('direct', 40_000, null)).toBe(40_000)
  })

  it('PARTENAIRE : la commission s’AJOUTE', () => {
    expect(trueDailyCostCents('partner', 40_000, 5_000)).toBe(45_000)
  })

  it('SOUS-TRAITANCE : idem', () => {
    expect(trueDailyCostCents('subcontracting', 40_000, 5_000)).toBe(45_000)
  })

  it('PARTENAIRE sans commission renseignée : le coût est INCONNU, pas le TJM d’achat', () => {
    // C'est le cœur du correctif. Rendre 40 000 ici afficherait une marge
    // meilleure que la réalité sur exactement les missions où l'écart compte.
    expect(trueDailyCostCents('partner', 40_000, null)).toBeNull()
    expect(trueDailyCostCents('subcontracting', 40_000, null)).toBeNull()
  })

  it('PARTENAIRE avec une commission à ZÉRO : c’est une réponse, pas une absence', () => {
    // Un partenaire qui ne prend rien, ça existe (accord-cadre, réciprocité).
    // Zéro SAISI n'est pas zéro DEVINÉ.
    expect(trueDailyCostCents('partner', 40_000, 0)).toBe(40_000)
  })

  it('PORTAGE : la commission s’AJOUTE, comme sur tout canal intermédié', () => {
    // Le portage EST une intermédiation : la société de portage prend des frais
    // de gestion. Le coût réel d'une journée est donc le TJM d'achat plus ces
    // frais, exactement comme pour un partenaire.
    expect(trueDailyCostCents('portage', 40_000, 5_000)).toBe(45_000)
  })

  it('PORTAGE sans commission renseignée : le coût est INCONNU, pas le TJM d’achat', () => {
    // Même raison que pour `partner` et `subcontracting`, et c'est la seule
    // réponse compatible avec « non mesuré n'est jamais 0 » : rendre 40 000 ici
    // ferait passer la société de portage pour gratuite, et la marge du canal
    // s'afficherait MEILLEURE que la réalité — sur le canal qu'on vient
    // précisément d'ajouter pour pouvoir le comparer aux autres.
    //
    // ⚠️ Le prix à payer est assumé : tant que personne ne saisit les frais de
    // gestion, la ligne « portage » s'affiche « non mesurée » plutôt que fausse.
    // C'est l'état que l'écran sait déjà montrer, et il est vrai.
    expect(trueDailyCostCents('portage', 40_000, null)).toBeNull()
  })

  it('PORTAGE avec des frais à ZÉRO : c’est une réponse, pas une absence', () => {
    expect(trueDailyCostCents('portage', 40_000, 0)).toBe(40_000)
  })

  it('CANAL INCONNU : comportement d’avant, on ne devine pas', () => {
    expect(trueDailyCostCents('unknown', 40_000, null)).toBe(40_000)
    // Et si quelqu'un a renseigné une commission, elle compte quand même.
    expect(trueDailyCostCents('unknown', 40_000, 3_000)).toBe(43_000)
  })

  it('sans coût saisi, rien ne se calcule — quel que soit le canal', () => {
    // Une commission seule n'est pas un coût : la rendre ferait passer un
    // intermédiaire pour la totalité de la dépense.
    for (const channel of MISSION_CHANNELS) {
      expect(trueDailyCostCents(channel, null, 5_000)).toBeNull()
      expect(trueDailyCostCents(channel, null, null)).toBeNull()
    }
  })

  it('une valeur non finie ne produit jamais un nombre', () => {
    expect(trueDailyCostCents('partner', Number.NaN, 5_000)).toBeNull()
    expect(trueDailyCostCents('partner', 40_000, Number.POSITIVE_INFINITY)).toBeNull()
  })
})
