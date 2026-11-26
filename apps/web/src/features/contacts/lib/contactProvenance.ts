import type { ComponentProps } from 'react'
import { looksLikePhoneNumber } from '@bellum/contracts'
import type { Provenance } from '@/components/primitives/Provenance'
import { i18n } from '@/i18n'
import { formatDate } from '@/lib/locale'

/**
 * Provenance helpers (Théo p.16 — colonnes Source/Date de la table contacts).
 * Shared by the contacts table and the lifecycle timeline so the provider
 * naming is identical everywhere ("Enrichi" is never ambiguous: the provider
 * that produced the row is always shown when known).
 */

/** Les cinq catégories de la primitive, lues sur elle — pas recopiées. Une
 *  copie manuelle diverge le jour où la primitive en gagne une sixième. */
type ProvenanceKind = ComponentProps<typeof Provenance>['source']

/**
 * De quelle FAMILLE vient une donnée de contact.
 *
 * Le libellé de source ci-dessous nomme la source ; il ne dit pas quoi en
 * faire. Les cinq catégories de `Provenance`, si : une valeur saisie par un
 * collègue se discute avec lui, une valeur d'un registre public se vérifie à la
 * source, une valeur proposée par un modèle se relit. C'est cette table qui
 * fait le pont, et elle vit à UN seul endroit — la table des contacts et la
 * frise du cycle de vie la lisent toutes les deux.
 *
 * ⚠️ Volontairement INCOMPLÈTE. `demo` (jeu de démonstration) n'est aucune des
 * cinq : ni saisie humaine, ni outil connecté, ni registre public, ni modèle,
 * ni calcul de l'analyse. Lui coller « source publique » pour remplir la case
 * serait exactement la provenance inventée que cette primitive existe pour
 * empêcher. Une source non classée rend `null`, et l'écran retombe alors sur
 * son libellé, qui reste vrai.
 */
const PROVENANCE_KIND: Readonly<Record<string, ProvenanceKind>> = {
  // Quelqu'un l'a saisi ou importé : ça se discute avec lui.
  manual: 'human',
  import: 'human',
  // Un fournisseur d'enrichissement interrogé par Bellum : ça se revérifie.
  apollo: 'connector',
  dropcontact: 'connector',
  hunter: 'connector',
  lusha: 'connector',
  kaspr: 'connector',
  fullenrich: 'connector',
  salesql: 'connector',
  // Registre officiel ou web ouvert : ça se vérifie À LA SOURCE.
  pappers: 'public',
  brave_search: 'public',
  linkedin_apify: 'public',
  // SIG-B — une offre d'emploi PUBLIÉE nomme ce recruteur : ça se vérifie sur l'offre.
  job_posting: 'public',
  // Proposé par un modèle : ça se relit avant de s'en servir.
  ia_reconstruction: 'model',
  ai_generated: 'model',
  // #2777 — le nom vient de l'extraction du compte rendu de rendez-vous
  // (`mentionedContacts`), pas d'une saisie humaine du champ lui-même : ça
  // se relit, comme les deux autres sources dérivées d'un modèle.
  meeting: 'model',
}

/** La catégorie de provenance d'une source de contact, ou `null` quand aucune
 *  des cinq n'est vraie (jamais une catégorie par défaut). */
export function contactProvenanceKind(source: string): ProvenanceKind | null {
  return PROVENANCE_KIND[source] ?? null
}

/**
 * J1b #3822 — la date à écrire sous un numéro TROUVÉ par enrichissement
 * (« Enrichissement · 7 oct. 2026 »), ou `null`. Jamais le nom du fournisseur
 * (doctrine : nos fournisseurs ne se nomment jamais) ; jamais pour un numéro
 * saisi à la main, ni pour une valeur qui n'est pas un numéro.
 */
export function enrichedPhoneOriginDate(contact: {
  phone: string | null
  source: string | null
  last_enrichment_at?: string | null
}): string | null {
  if (!contact.phone || !looksLikePhoneNumber(contact.phone)) return null
  if (!contact.last_enrichment_at || !contact.source) return null
  return contactProvenanceKind(contact.source) === 'connector' ? contact.last_enrichment_at : null
}

/** Customer-facing provider label for a contact source. Falls back to the
 *  raw value so an unmapped source is still shown (never invented). */
export function contactSourceLabel(source: string): string {
  // i18n keys: lifecycle.sources.apollo | lifecycle.sources.pappers | lifecycle.sources.manual |
  // lifecycle.sources.linkedin_apify | lifecycle.sources.brave_search |
  // lifecycle.sources.ia_reconstruction | lifecycle.sources.ai_generated | lifecycle.sources.dropcontact
  // J1b — une source de la famille « fournisseur » sans libellé propre ne
  // s'affiche JAMAIS sous son nom brut (doctrine : on ne nomme pas nos fournisseurs).
  const defaultValue =
    contactProvenanceKind(source) === 'connector' ? i18n.t('contacts:lifecycle.sources.enrichment') : source
  return i18n.t(`contacts:lifecycle.sources.${source}`, { defaultValue })
}

/** "16/07/2026" — locale-aware short NUMERIC date, or null when the value is
 *  missing/unparseable (no invented date).
 *
 *  R15-10 — elle REFAISAIT `formatDate` (`@/lib/locale`), au format près : deux
 *  dérivations de « une date lisible » qui n'attendaient qu'un réglage pour
 *  diverger (GA-26). Elle la DÉLÈGUE maintenant ; ce qui lui reste en propre est
 *  son format court, celui des colonnes de la table de contacts.
 *
 *  #3713 — recette prod 08/10 : le mois en lettres (« 08 oct. 2026 ») forçait la
 *  date à passer sur deux lignes dans la colonne « Suivi » (193 px, la plus
 *  étroite du tableau) dès que `noWrap`/l'ellipse en étaient retirés (même
 *  recette). Un format tout NUMÉRIQUE tient sur une seule ligne sans jamais
 *  rogner un caractère — ce que l'ellipse faisait, et que la recette refuse. */
export function formatContactDate(value: string | null | undefined): string | null {
  return formatDate(value, { day: '2-digit', month: '2-digit', year: 'numeric' })
}
