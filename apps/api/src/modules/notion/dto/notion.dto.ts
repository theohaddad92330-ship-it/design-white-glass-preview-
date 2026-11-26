import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** Ingest one Notion page into the RAG store. `pageId` is the Notion object id;
 *  `title` (from the page list) labels the RAG document; `category` tags it. */
export const notionIngestSchema = z
  .object({
    pageId: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(300).optional(),
    category: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

export class NotionIngestDto extends createZodDto(notionIngestSchema) {}
