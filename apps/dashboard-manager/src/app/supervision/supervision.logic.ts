import type {
  SupervisionDisponibilite,
  SupervisionRailway,
  SupervisionRunners,
  SupervisionIncidents,
  SupervisionSupabase,
} from '@/lib/supervision'

/**
 * Formateurs de la supervision. Doctrine : « non mesuré » n'est jamais « 0 » —
 * chaque formateur rend {@link NON_MESURE} sur `null`, et un vrai 0 reste 0.
 */

export const NON_MESURE = 'non mesuré'

const FR = (min: number, max: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max })

const UN = FR(0, 1)
const DEUX = FR(2, 2)
const ENTIER = FR(0, 0)

export function formatPct(v: number | null): string {
  return v === null ? NON_MESURE : `${UN.format(v)} %`
}

export function formatGo(octets: number | null): string {
  return octets === null ? NON_MESURE : `${UN.format(octets / 1024 ** 3)} Go`
}

export function formatCoeurs(v: number | null): string {
  return v === null ? NON_MESURE : FR(0, 2).format(v)
}

export function formatCharge(v: number | null): string {
  return v === null ? NON_MESURE : DEUX.format(v)
}

export function formatNombre(v: number | null): string {
  return v === null ? NON_MESURE : ENTIER.format(v)
}

export function formatFraicheur(sec: number | null): string {
  if (sec === null) return NON_MESURE
  if (sec < 120) return `il y a ${ENTIER.format(sec)} s`
  return `il y a ${ENTIER.format(sec / 60)} min`
}

/** Le bandeau d'état en tête de page — `null` quand tout a été mesuré. */
export function bandeauSupervision(r: SupervisionRunners): string | null {
  if (r.etat === 'non_configure') return 'Supervision non configurée (GRAFANA_PROM_* absentes)'
  if (r.etat === 'injoignable') return `Grafana injoignable — ${r.raison}`
  if (r.requetesEnEchec.length > 0) return `Mesure partielle — requêtes en échec : ${r.requetesEnEchec.join(', ')}`
  return null
}

/** Une série 24 h vers la forme de `Sparkline` — un trou reste un trou. */
export function pointsSparkline(points: ReadonlyArray<{ t: number; v: number | null }>): { value: number | null }[] {
  return points.map(p => ({ value: p.v }))
}

/** CPU Supabase : compteur sans historique, la 1re lecture n'a pas de taux — et le dit. */
export function formatCpuSupabase(v: number | null, premiereLecture: boolean): string {
  if (v === null && premiereLecture) return 'non mesuré (1ʳᵉ lecture)'
  return formatPct(v)
}

/** « n / max » — chaque côté absent est nommé, jamais 0. */
export function formatUtilisation(n: number | null, max: number | null): string {
  return `${formatNombre(n)} / ${formatNombre(max)}`
}

/** « lu il y a N s » (ou min au-delà d'une minute) ; sans lecture, rien. */
export function luIlYA(r: SupervisionSupabase | SupervisionRailway): string | null {
  if (r.etat !== 'mesure') return null
  return r.ageSec < 120
    ? `lu il y a ${ENTIER.format(r.ageSec)} s`
    : `lu il y a ${ENTIER.format(Math.round(r.ageSec / 60))} min`
}

/**
 * Bandeau de la lecture de fond : `perime` ⇒ orange ; sinon dernière lecture en échec ⇒ discret.
 * Les valeurs restent celles de la dernière lecture réussie — l'âge est dit, jamais caché.
 */
export function bandeauFond(
  r: SupervisionSupabase | SupervisionRailway,
): { texte: string; niveau: 'orange' | 'discret' } | null {
  if (r.etat !== 'mesure') return null
  const age = luIlYA(r)?.replace('lu ', '') ?? ''
  if (r.perime) {
    return {
      texte: `Mesure périmée — aucune lecture réussie depuis ${age}${r.derniereErreur ? ` (${r.derniereErreur})` : ''}`,
      niveau: 'orange',
    }
  }
  if (r.derniereErreur) {
    return { texte: `Dernière lecture en échec : ${r.derniereErreur} — valeurs ${age}`, niveau: 'discret' }
  }
  return null
}

export function bandeauSupabase(r: SupervisionSupabase): string | null {
  if (r.etat === 'en_attente') return 'Première lecture en cours'
  if (r.etat === 'non_configure')
    return 'Supervision Supabase non configurée (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes)'
  if (r.etat === 'injoignable') return `Supabase injoignable — ${r.raison}`
  if (r.absentes.length > 0) return `Mesure partielle — métriques absentes : ${r.absentes.join(', ')}`
  return null
}

/** Go déjà exprimés en Go (Railway) — à ne pas confondre avec `formatGo` (octets). */
export function formatGoDirect(go: number | null): string {
  return go === null ? NON_MESURE : `${UN.format(go)} Go`
}

/** Coût mensuel estimé en USD ; `null` ⇒ non mesuré, jamais « 0 $ ». */
export function formatUsdMois(v: number | null): string {
  return v === null ? NON_MESURE : `${UN.format(v)} $/mois`
}

type NiveauEtat = 'ok' | 'degrade' | 'inconnu'

/** « OK sur N/M » — rouge (dégradé) dès qu'un hôte ne voit pas la cible ; sans mesure, jamais « 0/0 ». */
export function etatCible(ok: number | null, total: number | null): { niveau: NiveauEtat; texte: string } {
  if (ok === null || total === null) return { niveau: 'inconnu', texte: NON_MESURE }
  return { niveau: ok < total ? 'degrade' : 'ok', texte: `OK sur ${ENTIER.format(ok)}/${ENTIER.format(total)}` }
}

/** Seuils d'expiration TLS : orange sous 21 j, rouge sous 7 j (un certificat expiré est rouge). */
export function niveauTls(jours: number | null): 'ok' | 'orange' | 'rouge' | 'inconnu' {
  if (jours === null) return 'inconnu'
  if (jours < 7) return 'rouge'
  if (jours < 21) return 'orange'
  return 'ok'
}

export function formatTls(jours: number | null): string {
  if (jours !== null && jours < 0) return 'expiré'
  return jours === null ? NON_MESURE : `expire dans ${ENTIER.format(Math.floor(jours))} j`
}

export function formatMs(ms: number | null): string {
  return ms === null ? NON_MESURE : `${ENTIER.format(ms)} ms`
}

export function formatCommit(sha: string | null): string {
  return sha === null ? NON_MESURE : sha.slice(0, 7)
}

export function bandeauDisponibilite(r: SupervisionDisponibilite): string | null {
  if (r.etat === 'non_configure') return 'Supervision non configurée (GRAFANA_PROM_* absentes)'
  if (r.etat === 'injoignable') return `Grafana injoignable — ${r.raison}`
  if (!r.sondesDeployees) return 'Sondes pas encore déployées (aucune série probe_*)'
  if (r.requetesEnEchec.length > 0) return `Mesure partielle — requêtes en échec : ${r.requetesEnEchec.join(', ')}`
  return null
}

export function bandeauRailway(r: SupervisionRailway): string | null {
  if (r.etat === 'en_attente') return 'Première lecture en cours'
  if (r.etat === 'non_configure')
    return 'Supervision Railway non configurée (RAILWAY_METRICS_TOKEN / RAILWAY_PROJECT_ID / RAILWAY_ENVIRONMENT_ID absentes)'
  if (r.etat === 'injoignable') return `Railway injoignable — ${r.raison}`
  if (r.totalPartiel) return 'Total partiel — au moins un service n’a pas de coût estimable (CPU ou mémoire non mesuré)'
  return null
}

type ResumeIncidents =
  | { etat: 'aucun' | 'illisible'; texte: string }
  | { etat: 'ouverts'; lignes: { cle: string; titre: string; detail: string; lien: string }[] }

/**
 * Bloc « Incidents infra ouverts ». Une lecture impossible (API ou Redis) n'est
 * JAMAIS présentée comme « aucun incident » : c'est l'absence de réponse.
 */
export function resumeIncidents(r: SupervisionIncidents | null): ResumeIncidents {
  if (r === null || r.etat === 'illisible') return { etat: 'illisible', texte: 'état des incidents non lisible' }
  if (r.incidents.length === 0) return { etat: 'aucun', texte: 'aucun incident ouvert' }
  return {
    etat: 'ouverts',
    lignes: r.incidents.map(i => ({
      cle: `${i.regle}:${i.sujet}`,
      titre: `${i.regle} — ${i.sujet}`,
      detail: `${i.message} · mesuré ${UN.format(i.valeur)} ${i.unite} (seuil ${UN.format(i.seuil)} ${i.unite}) · depuis ${i.depuis.slice(0, 16).replace('T', ' ')} UTC`,
      lien: i.onglet === 'runners' ? '/supervision' : `/supervision?onglet=${i.onglet}`,
    })),
  }
}
