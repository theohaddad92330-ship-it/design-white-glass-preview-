import { createZodDto } from 'nestjs-zod'
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from '@bellum/contracts'

export class CreateTaskDto extends createZodDto(createTaskSchema) {}
export class UpdateTaskDto extends createZodDto(updateTaskSchema) {}
export class ListTasksQueryDto extends createZodDto(listTasksQuerySchema) {}
