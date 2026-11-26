import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { CV_ZIP_LARGE_ARCHIVE_MAX_BYTES } from '@bellum/contracts'
import { SupabaseService } from '../../supabase/supabase.service'

/**
 * LES OCTETS — la seule pièce de ce dépôt qui parle au magasin de fichiers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST SÉPARÉ DU SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le service tient les RÈGLES (le cloisonnement, le quota, l'échéance, le
 * registre) ; ce fichier ne tient que le transport. La séparation a une
 * conséquence pratique : tous les tests du service tournent SANS réseau, sur un
 * double de ce client, et un changement de magasin ne toucherait qu'ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MAGASIN EST PRIVÉ — CE N'EST PAS UN RÉGLAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un seau public rendrait le chemin suffisant pour lire l'objet, et le
 * cloisonnement par espace ne tiendrait plus qu'à l'obscurité du chemin. Le seau
 * est créé PRIVÉ, et le seul chemin de lecture est une URL signée à durée
 * courte, fabriquée à la demande côté serveur.
 *
 * ⚠️ **La clé de service ne quitte JAMAIS l'API.** Elle vit dans
 * `SupabaseService`, elle n'est jamais rendue, jamais journalisée, jamais
 * inlinée dans un bundle. C'est l'interdit du dépôt sur lequel il n'y a pas
 * d'arbitrage : ce qui part vers le navigateur est une URL signée, qui n'ouvre
 * qu'UN objet et qui périme.
 */
@Injectable()
export class StorageClient {
  private readonly logger = new Logger(StorageClient.name)
  /** Le seau existe-t-il ? Une seule vérification par process — la créer à
   *  chaque dépôt coûterait un aller-retour réseau pour rien. */
  private ensured = false

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Le nom du seau.
   *
   * Réglable pour qu'un environnement de recette ne range pas ses fichiers
   * parmi ceux de la production. Absent = `bellum-files` : un défaut, pas une
   * devinette — le seau est créé s'il manque, donc ce nom-là marche partout.
   */
  bucket(): string {
    return process.env['STORAGE_BUCKET']?.trim() || 'bellum-files'
  }

  /**
   * Crée le seau s'il n'existe pas — PRIVÉ, toujours.
   *
   * Idempotent : une erreur « existe déjà » est le résultat attendu quand deux
   * processus démarrent en même temps, et elle ne remonte pas.
   */
  private async ensureBucket(): Promise<void> {
    if (this.ensured) return
    // #3481 — le seau porte LUI-MÊME le plafond de l'import ZIP volumineux : sans
    // `fileSizeLimit`, ou avec une limite posée plus tôt, le dépôt d'une archive
    // de 600 Mo rend un 413. (Le plafond GLOBAL du projet se règle côté
    // Supabase — `agent_docs/env-reference.md` — un seau ne le dépasse pas.)
    const options = { public: false, fileSizeLimit: CV_ZIP_LARGE_ARCHIVE_MAX_BYTES }
    const storage = this.supabase.getClient().storage
    const { error } = await storage.createBucket(this.bucket(), options)
    // ⚠️ On ne LIT pas le code d'erreur pour décider : « existe déjà » s'écrit
    // différemment selon la version. Un seau déjà là est remis au même plafond.
    if (error) {
      this.logger.debug(`Seau « ${this.bucket()} » non créé (déjà là ?) : ${error.message}`)
      const { error: updateError } = await storage.updateBucket(this.bucket(), options)
      if (updateError) this.logger.warn(`Plafond du seau non mis à jour : ${updateError.message}`)
    }
    this.ensured = true
  }

  /**
   * Écrit des octets. `upsert` : le même chemin réécrit le même objet.
   *
   * C'est ce qui rend le semis de la salle de démonstration REJOUABLE — il
   * calcule des chemins stables, et un second semis remplace au lieu
   * d'accumuler. En usage normal, le chemin porte un identifiant tiré au
   * hasard : deux dépôts ne se marchent jamais dessus.
   */
  async put(path: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket()
    const { error } = await this.supabase
      .getClient()
      .storage.from(this.bucket())
      .upload(path, bytes, { contentType, upsert: true })
    if (error) {
      // Le message du magasin porte la vraie raison ; le remplacer par « une
      // erreur est survenue » ferait redéposer le même fichier.
      this.logger.error(`Dépôt refusé par le stockage : ${error.message}`, { error })
      throw new ServiceUnavailableException('Le stockage n’a pas accepté ce fichier. Réessaie dans un instant.')
    }
  }

  /**
   * Lit des octets, côté serveur. Même absence de droit que {@link signedUrl} :
   * c'est l'appelant qui a tranché le droit sur l'objet PARENT (l'import
   * universel lit ses propres parts, rangées sous le chemin de SON espace).
   */
  async get(path: string): Promise<Buffer> {
    const { data, error } = await this.supabase.getClient().storage.from(this.bucket()).download(path)
    if (error || !data) {
      this.logger.error(`Lecture refusée par le stockage : ${error?.message ?? 'réponse vide'}`, { error })
      throw new ServiceUnavailableException('Le fichier n’a pas pu être relu. Réessaie dans un instant.')
    }
    return Buffer.from(await data.arrayBuffer())
  }

  /**
   * #3666.9 — la TAILLE d'un objet, sans le télécharger (`list` du dossier, filtré sur le nom) ;
   * `null` quand il n'existe pas. Sert à confirmer une part déposée directement par le navigateur.
   */
  async objectSize(path: string): Promise<number | null> {
    const cut = path.lastIndexOf('/')
    const folder = cut >= 0 ? path.slice(0, cut) : ''
    const name = cut >= 0 ? path.slice(cut + 1) : path
    const { data, error } = await this.supabase
      .getClient()
      .storage.from(this.bucket())
      .list(folder, { search: name, limit: 10 })
    if (error) {
      this.logger.error(`Lecture de taille refusée par le stockage : ${error.message}`, { error })
      throw new ServiceUnavailableException('Le fichier n’a pas pu être vérifié. Réessaie dans un instant.')
    }
    const found = (data ?? []).find(entry => entry.name === name)
    const size = (found?.metadata as { size?: unknown } | null | undefined)?.size
    return found ? (typeof size === 'number' ? size : null) : null
  }

  /**
   * Une URL de lecture, valable `ttlSeconds`.
   *
   * ⚠️ Ce client ne vérifie AUCUN droit — il ne connaît ni espace ni
   * utilisateur. C'est délibéré : le droit se vérifie une seule fois, au-dessus,
   * sur l'objet PARENT. Une vérification ici en ferait deux, et deux
   * vérifications d'un même droit finissent par diverger.
   */
  async signedUrl(path: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.supabase
      .getClient()
      .storage.from(this.bucket())
      .createSignedUrl(path, ttlSeconds)
    if (error || !data?.signedUrl) {
      this.logger.error(`Signature refusée par le stockage : ${error?.message ?? 'réponse vide'}`, { error })
      throw new ServiceUnavailableException('Le fichier n’a pas pu être ouvert. Réessaie dans un instant.')
    }
    return data.signedUrl
  }

  /**
   * #3065 (lot 2b) — une URL d'UPLOAD à usage unique, pour un dépôt DIRECT
   * depuis le navigateur (une archive trop grande pour voyager encodée dans un
   * corps JSON). Le chemin est déjà celui qu'occupera l'objet : rien ne
   * transite par l'API, ni les octets ni une clé de service.
   *
   * ⚠️ Comme {@link signedUrl}, ce client ne vérifie AUCUN droit — le chemin
   * porte déjà le cloisonnement (espace + identifiant tiré au hasard), posé
   * par l'appelant AVANT de demander cette URL.
   */
  async createSignedUploadUrl(path: string): Promise<{ uploadUrl: string; path: string; token: string }> {
    await this.ensureBucket()
    const { data, error } = await this.supabase.getClient().storage.from(this.bucket()).createSignedUploadUrl(path)
    if (error || !data?.signedUrl || !data?.token) {
      this.logger.error(`Signature d’upload refusée par le stockage : ${error?.message ?? 'réponse vide'}`, { error })
      throw new ServiceUnavailableException('Le dépôt n’a pas pu être préparé. Réessaie dans un instant.')
    }
    return { uploadUrl: data.signedUrl, path, token: data.token }
  }

  /**
   * #3303 — l'ENDPOINT TUS (dépôt REPRIS par morceaux, `tus-js-client` côté
   * navigateur) de ce projet Supabase Storage. Dérivé de `SUPABASE_URL`
   * (obligatoire, `agent_docs/env-reference.md`) — jamais deviné : Supabase
   * documente ce même chemin (`/storage/v1/upload/resumable[/sign]`) derrière l'URL
   * DE PROJET déjà connue, sans exiger le sous-domaine dédié
   * `*.storage.supabase.co` réservé à la performance.
   *
   * L'authentification de ce transport passe par le `token` rendu par
   * {@link createSignedUploadUrl} (en-tête `x-signature`), jamais par une
   * clé lue ici — même défense en profondeur que le reste de ce fichier.
   */
  resumableUploadEndpoint(): string {
    const projectUrl = (process.env['SUPABASE_URL'] ?? '').trim().replace(/\/+$/, '')
    // Import ZIP 666 Mo (04/10/2026) — `/upload/resumable` IGNORE `x-signature`
    // (400 « Invalid Compact JWS », sonde HTTP) : le dépôt TUS par URL SIGNÉE
    // passe par `/upload/resumable/sign`.
    return `${projectUrl}/storage/v1/upload/resumable/sign`
  }

  /**
   * Efface des octets. Une erreur est JOURNALISÉE, pas levée — et RENDUE.
   *
   * Deux appelants, deux raisons de ne pas lever :
   *  · le retour en arrière d'un dépôt dont la ligne ne s'est pas écrite — la
   *    vraie erreur est celle de la base, et la masquer ferait chercher au
   *    mauvais endroit ;
   *  · la purge de rétention — un objet déjà absent est exactement le résultat
   *    voulu, et une purge qui s'arrête au premier objet manquant ne finit
   *    jamais.
   *
   * #1939 — un troisième appelant LIT le résultat : l'effacement immédiat des
   * enregistrements vocaux d'un compte supprimé. Lui ne peut pas effacer les
   * lignes si le magasin a refusé — elles portent le seul chemin vers ces
   * octets. `true` = le magasin a accepté l'effacement, `false` = il l'a refusé.
   * Les deux premiers appelants ignorent la valeur, comme avant.
   */
  async remove(paths: string[]): Promise<boolean> {
    if (paths.length === 0) return true
    const { error } = await this.supabase.getClient().storage.from(this.bucket()).remove(paths)
    if (error) {
      this.logger.error(`Effacement partiel dans le stockage : ${error.message}`, { error })
      return false
    }
    return true
  }
}
