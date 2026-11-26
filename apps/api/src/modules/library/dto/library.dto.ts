import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { createLibraryItemSchema, libraryItemKindSchema, updateLibraryItemSchema } from '@bellum/contracts'

export class CreateLibraryItemDto extends createZodDto(createLibraryItemSchema) {}
export class UpdateLibraryItemDto extends createZodDto(updateLibraryItemSchema) {}

/** Query for `GET /library-items?kind=template|playbook`. */
const listLibraryItemsQuerySchema = z.object({ kind: libraryItemKindSchema })
export class ListLibraryItemsQueryDto extends createZodDto(listLibraryItemsQuerySchema) {}
