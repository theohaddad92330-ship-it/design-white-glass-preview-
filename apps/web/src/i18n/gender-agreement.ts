/**
 * #2437.15 (épopée #2863) — outillage QA i18n, volet GENRES GRAMMATICAUX.
 *
 * Le produit n'a et ne doit avoir aucune donnée de genre sur une PERSONNE
 * prospectée (protégée par `c58_criteres_proteges`, `enrichment-compliance.ts`
 * refuse `gender`/`sex`/`civility` à la collecte) : l'accord de genre visé ici
 * n'a donc rien à voir avec le genre d'un contact. C'est un accord GRAMMATICAL
 * FR — un adjectif qui qualifie l'utilisateur connecté ou un objet du produit
 * ("connecté(e)", "prêt(e)") — et la façon dont un contributeur presse ce
 * problème est presque toujours la même : coller un suffixe entre parenthèses
 * ou un point médian dans la chaîne, au lieu de déclarer deux clés (ou une clé
 * avec `context`) que `react-i18next` résout proprement selon le genre réel de
 * ce qu'on qualifie.
 *
 * Ce hack a deux défauts qu'aucun test de parité de clés ne voit
 * (`parity.test.ts` compare des clés, jamais le TEXTE d'une valeur) : il fuit
 * tel quel vers l'anglais (« ready(e) » n'existe dans aucune langue), et il
 * expose visuellement une mécanique interne au lieu d'un texte choisi. Cet
 * outil DÉTECTE le hack dans les ressources réelles, il ne le corrige pas —
 * même patron que `pseudo-locale.ts` : un calcul pur, exécuté sur les VRAIES
 * ressources du produit.
 */

/** `mot(e)`, `mot(le)`, `mot(ne)` — le suffixe entre parenthèses classique. */
const PAREN_SUFFIX = /\p{L}+\((?:e|le|ne|se)\)/u

/** `mot·e`, `mot.e` — l'écriture inclusive à point médian ou point simple,
 *  seulement après un RADICAL d'au moins deux lettres (pour ne pas confondre
 *  un nombre décimal ou une abréviation latine à une lettre comme « i.e. »). */
const MIDDLE_DOT_SUFFIX = /\p{L}{2,}[·.]e\b/u

/**
 * Vrai si `value` contient un accord de genre codé en dur (suffixe entre
 * parenthèses ou point médian) plutôt qu'une clé i18n déclarée pour chaque
 * genre. Pure, déterministe — même entrée, même sortie.
 */
export function hasHardcodedGenderToggle(value: string): boolean {
  return PAREN_SUFFIX.test(value) || MIDDLE_DOT_SUFFIX.test(value)
}
