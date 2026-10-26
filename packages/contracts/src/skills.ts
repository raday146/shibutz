import { z } from 'zod';

export const skillSchema = z.object({
  id: z.number().int().positive(),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
});
export type Skill = z.infer<typeof skillSchema>;

export const createSkillSchema = skillSchema.omit({ id: true }).strict();
export type CreateSkill = z.infer<typeof createSkillSchema>;

export const updateSkillSchema = createSkillSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateSkill = z.infer<typeof updateSkillSchema>;
