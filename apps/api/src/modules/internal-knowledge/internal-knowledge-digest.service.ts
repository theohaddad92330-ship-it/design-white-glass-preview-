import { createHash } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { INTERNAL_KNOWLEDGE_STORE } from './internal-knowledge-sync.service'
import type { DigestStore, KnowledgeFileRow, KnowledgeStore } from './internal-knowledge.types'

export const INTERNAL_KNOWLEDGE_DIGEST_STORE = Symbol('INTERNAL_KNOWLEDGE_DIGEST_STORE')
export const INTERNAL_KNOWLEDGE_DIGEST_GENERATOR = Symbol('INTERNAL_KNOWLEDGE_DIGEST_GENERATOR')

/** Fait produire le digest par le service IA (UN appel Claude). `null` = rien à synthétiser. */
export interface DigestGenerator {
  generate(): Promise<string | null>
}

type DigestReport =
  | { status: 'unchanged' }
  | { status: 'empty' }
  | { status: 'regenerated'; sizeChars: number }
  | { status: 'error'; message: string }

/**
 * L'empreinte du contenu du Drive : les fichiers INDEXÉS, chacun par `fileId:modifiedTime`, triés. Un
 * fichier ignoré, en erreur (ses anciens chunks restent servis, inchangés) ou archivé n'y entre pas.
 */
export function knowledgeFingerprint(files: KnowledgeFileRow[]): string {
  const keys = files
    .filter(f => f.status === 'indexed')
    .map(f => `${f.fileId}:${f.modifiedTime}`)
    .sort()
  return createHash('sha256').update(keys.join('\n')).digest('hex')
}

/**
 * #3586 (lot W2) — le DIGEST du Drive interne, préfixé par le service IA au system prompt des surfaces
 * commerciales sans RAG. Régénéré en fin de synchro SEULEMENT quand l'empreinte des fichiers indexés a
 * changé : un Drive immobile ne coûte aucun appel modèle. L'ancien digest est archivé, jamais supprimé.
 * Une génération vide ou en panne laisse le digest courant en place (la synchro suivante retente).
 */
@Injectable()
export class InternalKnowledgeDigestService {
  private readonly logger = new Logger(InternalKnowledgeDigestService.name)

  constructor(
    @Inject(INTERNAL_KNOWLEDGE_STORE) private readonly store: KnowledgeStore,
    @Inject(INTERNAL_KNOWLEDGE_DIGEST_STORE) private readonly digests: DigestStore,
    @Inject(INTERNAL_KNOWLEDGE_DIGEST_GENERATOR) private readonly generator: DigestGenerator,
  ) {}

  async refreshIfChanged(): Promise<DigestReport> {
    try {
      const files = await this.store.listFiles()
      if (!files.some(f => f.status === 'indexed')) return { status: 'empty' }
      const fingerprint = knowledgeFingerprint(files)
      const current = await this.digests.getCurrentDigest()
      if (current?.fingerprint === fingerprint) return { status: 'unchanged' }

      const content = (await this.generator.generate())?.trim() ?? ''
      if (!content) return { status: 'error', message: 'digest vide' }
      await this.digests.saveDigest({ content, fingerprint })
      return { status: 'regenerated', sizeChars: content.length }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erreur inconnue'
      this.logger.warn(`internal-knowledge: digest non régénéré (${message})`)
      return { status: 'error', message }
    }
  }
}
