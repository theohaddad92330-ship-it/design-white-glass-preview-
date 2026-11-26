import type { Brand } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * La marque, côté web.
 *
 * ⚠️ DEUX routes, et la distinction est celle du moment où on la lit.
 *
 * `publicBrand()` répond AVANT l'authentification, en se fondant sur l'hôte de
 * la requête. C'est celle de l'écran de connexion — sans elle, un client en
 * marque blanche verrait notre logo sur le premier écran que ses propres
 * clients ouvrent.
 *
 * `brand()` répond APRÈS, pour l'espace actif. Un utilisateur qui appartient à
 * plusieurs espaces voit la marque de celui qu'il a choisi, pas celle du
 * domaine par lequel il est entré.
 */
export const brandApi = {
  /** Publique : lue depuis l'en-tête `Host`, sans jeton. */
  publicBrand(): Promise<Brand> {
    return apiFetch<Brand>({ path: '/brand' })
  },
  /** La marque de l'espace actif. */
  brand(): Promise<Brand> {
    return apiFetch<Brand>({ path: '/workspaces/brand' })
  },
  /** Théo D settings-espace.N5 — la signature proposée et le pied de document de l'espace (`null` = rien posé). */
  documentIdentity(): Promise<DocumentIdentity> {
    return apiFetch<DocumentIdentity>({ path: '/workspaces/brand/documents' })
  },
  update(patch: BrandPatch): Promise<Brand> {
    return apiFetch<Brand, BrandPatch>({ path: '/workspaces/brand', method: 'PATCH', body: patch })
  },
}

type DocumentIdentity = { signature: string | null; footer: string | null }

type BrandPatch = {
  brandName?: string | null
  copilotName?: string | null
  brandLogoUrl?: string | null
  brandAccent?: string | null
  customDomain?: string | null
  brandEmailFrom?: string | null
  documentSignature?: string | null
  documentFooter?: string | null
}
