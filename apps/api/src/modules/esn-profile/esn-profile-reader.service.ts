import { Injectable } from '@nestjs/common'
import type { AnalysisProfileData, EsnAnswers, LayerVersions } from '@bellum/contracts'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'

/**
 * Read-only view of a user's ESN onboarding answers. Deliberately narrow: it
 * depends on nothing but repositories (via {@link EsnProfileWorkspaceResolver}),
 * so consumers (e.g. the analysis pipeline) can pull the seller profile without
 * dragging in the full {@link EsnProfileModule} graph (Auth, Mailer,
 * ProfileContext generation).
 *
 * Workspace-aware: the answers are the workspace's canonical COMPANY profile
 * merged with the member's personal overlay. Without a canonical profile the
 * behaviour is the legacy per-user read, byte-identical.
 */
@Injectable()
export class EsnProfileReader {
  constructor(private readonly resolver: EsnProfileWorkspaceResolver) {}

  async getAnswers(userId: string): Promise<EsnAnswers> {
    return this.resolver.resolveMergedAnswers(userId)
  }

  /** Les révisions du profil (réponses + contexte dérivé), pour qu'un run
   *  puisse dire AVEC QUEL profil il a été produit — cf. §53. */
  async getProfileVersions(
    userId: string,
  ): Promise<{ esnProfileVersion: number | null; profileContextVersion: number | null }> {
    return this.resolver.resolveProfileVersions(userId)
  }

  /**
   * #2005.11 — les versions des trois couches (entreprise · BU · personne), pour
   * qu'un run dise AVEC QUELLES couches il a été produit. Exposé ICI, au point
   * où tous les moteurs lisent déjà le profil vendeur ; le profil composé
   * lui-même (#2005.4-.6) vit dans `EsnProfileWorkspaceResolver.resolveLayeredProfile`.
   */
  async getLayerVersions(userId: string): Promise<LayerVersions> {
    return this.resolver.resolveLayerVersions(userId)
  }

  /**
   * The seller profile in the shape every IA prompt reads (companyName, offers,
   * sectors, personas, geoZone, references…). Single server-side source of truth
   * so Analysis, Discover, Chat, Score and Messages personalise off the SAME
   * profile — the front never sends it (Théo: "le front envoie uniquement
   * l'intention utilisateur et les identifiants; le backend résout le profil").
   * Empty answers → an empty-but-valid profile (prompts fall back to defaults).
   *
   * Le PORTEFEUILLE d'offre (addendum Stelya §5) est résolu ici et nulle part
   * ailleurs : c'est déjà le point unique du profil vendeur côté serveur, et le
   * brancher dans chaque appelant aurait garanti d'en oublier un — l'appelant
   * oublié aurait alors raisonné dans un autre prisme que ses voisins, ce qui
   * est exactement le défaut que le retour bêta décrit. Un seul
   * `resolveContext` : la lecture du portefeuille ne coûte aucune requête de
   * plus. Absent ⇒ profil byte-identique à l'historique.
   */
  async resolveProfileData(userId: string): Promise<AnalysisProfileData> {
    return this.resolver.resolveProfileData(userId)
  }
}
