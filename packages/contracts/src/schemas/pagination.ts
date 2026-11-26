import { z } from 'zod'

export const paginationMetaSchema = z.object({
  currentPage: z.number().int().min(1),
  size: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
})

export const paginatedResultSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: paginationMetaSchema,
  })

export type PaginationMeta = z.infer<typeof paginationMetaSchema>
export type PaginatedResult<T> = {
  data: T[]
  pagination: PaginationMeta
}
