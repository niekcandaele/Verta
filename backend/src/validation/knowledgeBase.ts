import { z } from 'zod';

/**
 * Validation schema for creating a knowledge base
 */
export const createKnowledgeBaseSchema = z.object({
  tenant_id: z.string().uuid('Tenant ID must be a valid UUID'),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters')
    .trim(),
  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .trim()
    .optional()
    .nullable(),
  sitemap_url: z
    .string()
    .url('Sitemap URL must be a valid URL')
    .refine(
      (url) => url.startsWith('https://'),
      'Sitemap URL must use HTTPS protocol'
    ),
});

/**
 * Validation schema for updating a knowledge base
 */
export const updateKnowledgeBaseSchema = z.object({
  name: z
    .string()
    .min(1, 'Name cannot be empty')
    .max(255, 'Name must be less than 255 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .trim()
    .optional()
    .nullable(),
  sitemap_url: z
    .string()
    .url('Sitemap URL must be a valid URL')
    .refine(
      (url) => url.startsWith('https://'),
      'Sitemap URL must use HTTPS protocol'
    )
    .optional(),
});

/**
 * Validation schema for knowledge base ID parameter
 */
export const knowledgeBaseIdSchema = z.string().uuid('Invalid knowledge base ID');

/**
 * Validation schema for tenant ID query parameter
 */
export const tenantIdQuerySchema = z.object({
  tenant_id: z.string().uuid('Tenant ID must be a valid UUID'),
});

/**
 * Type exports for use in route handlers
 */
export type CreateKnowledgeBaseInput = z.infer<typeof createKnowledgeBaseSchema>;
export type UpdateKnowledgeBaseInput = z.infer<typeof updateKnowledgeBaseSchema>;
export type KnowledgeBaseIdInput = z.infer<typeof knowledgeBaseIdSchema>;
export type TenantIdQueryInput = z.infer<typeof tenantIdQuerySchema>;