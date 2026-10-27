import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { putNoteSchema } from '@shibutz/contracts';
import type { Note, PutNote } from '@shibutz/contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { NotesService } from './notes.service';

@Controller('jobs/:id/note')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  get(@Param('id', ParseIntPipe) id: number): Promise<Note> {
    return this.notes.get(id);
  }

  @Put()
  put(@Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(putNoteSchema)) body: PutNote): Promise<Note> {
    return this.notes.put(id, body);
  }
}
