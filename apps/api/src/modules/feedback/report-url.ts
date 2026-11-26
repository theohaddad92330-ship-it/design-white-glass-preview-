import type { CreateFeedbackDto } from './dto/feedback.dto'

/**
 * #1960.7 — UNE ADRESSE QUI PART DANS UN SIGNALEMENT, SANS LA VALEUR DE SA REQUÊTE NI DE SON ANCRE.
 *
 * Le navigateur récent l'applique déjà (`apps/web/src/features/feedback/safeUrl.ts`),
 * mais la PORTE est ici : un onglet chargé avant ce déploiement envoie encore
 * l'adresse entière — `?t=` du lien de démonstration, `code`/`state` d'un retour
 * OAuth, `#access_token=` d'un lien de connexion —, et le ticket comme la ligne
 * lue par le back-office la recopiaient telle quelle.
 *
 * Même règle que le navigateur : la PRÉSENCE se dit (`?…`, `#…`), l'absence d'un
 * paramètre pouvant être la cause du bug ; le contenu jamais. Découpage sur les
 * caractères plutôt que par `new URL` : une adresse RELATIVE (le fil des gestes)
 * ou illisible se traite pareil, et une adresse déjà expurgée (`/a?…#…`) ressort
 * identique.
 */
function redactReportUrl(raw: string): string {
  const hash = raw.indexOf('#')
  const query = raw.indexOf('?')
  const hasHash = hash !== -1
  const hasQuery = query !== -1 && (!hasHash || query < hash)
  if (!hasQuery && !hasHash) return raw
  const cut = hasQuery ? query : hash
  return `${raw.slice(0, cut)}${hasQuery ? '?…' : ''}${hasHash ? '#…' : ''}`
}

/**
 * Le signalement tel qu'il sera ENREGISTRÉ et transmis : les quatre champs qui
 * portent une adresse — la page, les navigations du fil des gestes, les appels
 * en échec, le lien de l'élément pointé — perdent la valeur de leur requête et
 * de leur ancre. Un clic garde son libellé : c'est du texte d'écran, pas une
 * adresse.
 */
export function redactReportUrls(dto: CreateFeedbackDto): CreateFeedbackDto {
  return {
    ...dto,
    pageUrl: dto.pageUrl == null ? dto.pageUrl : redactReportUrl(dto.pageUrl),
    breadcrumbs: dto.breadcrumbs?.map(crumb =>
      crumb.type === 'navigation' ? { ...crumb, label: redactReportUrl(crumb.label) } : crumb,
    ),
    networkFailures: dto.networkFailures?.map(failure => ({ ...failure, url: redactReportUrl(failure.url) })),
    elementContext: dto.elementContext?.href
      ? { ...dto.elementContext, href: redactReportUrl(dto.elementContext.href) }
      : dto.elementContext,
  }
}
