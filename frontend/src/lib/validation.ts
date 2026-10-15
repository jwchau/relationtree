import { z } from 'zod';
import { RELATIONSHIP_CATEGORIES } from '@/lib/relationshipTypes';

export const personFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  relationshipCategory: z.enum(RELATIONSHIP_CATEGORIES),
  context: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  address: z.string().trim().optional(),
  birthday: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  lastContactedDate: z.string().trim().optional(),
});

export type PersonFormValues = z.infer<typeof personFormSchema>;
