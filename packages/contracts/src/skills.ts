import { z } from 'zod';

export const skillSchema = z.object({
  id: z.number().int().positive(),
  code: z.string().trim().min(1).max(50),
  // Either name may be empty in Hebrew; the UI falls back to the other one.
  nameEn: z.string().trim().min(1).max(200),
  nameHe: z.string().trim().max(200),
});
export type Skill = z.infer<typeof skillSchema>;

export const createSkillSchema = skillSchema.omit({ id: true }).strict();
export type CreateSkill = z.infer<typeof createSkillSchema>;

export const updateSkillSchema = createSkillSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateSkill = z.infer<typeof updateSkillSchema>;
