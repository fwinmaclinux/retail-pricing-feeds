import { z } from 'zod';

/** Client-side rules for a manual edit; the API enforces the same rules server-side. */
export const editSchema = z.object({
  price: z.string().trim().regex(/^\d{1,10}(\.\d{1,4})?$/, 'Enter an amount like 12.99'),
  productName: z
    .string()
    .trim()
    .min(1, 'Product name is required')
    .max(200, 'Keep it under 200 characters')
    .regex(/^[^=+@]/, 'Must not start with =, + or @'),
  reason: z.string().trim().min(3, 'Add a short reason - it is kept in the audit trail').max(200),
});
