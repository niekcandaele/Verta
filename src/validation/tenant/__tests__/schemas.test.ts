/**
 * Tests for tenant validation schemas
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  validateCreateTenant,
  validateUpdateTenant,
  safeValidateCreateTenant,
  safeValidateUpdateTenant,
} from '../schemas.js';

describe('Tenant Validation Schemas', () => {
  describe('CreateTenantSchema', () => {
    it('should validate a valid tenant creation request', () => {
      const validData = {
        name: 'Test Company',
        slug: 'test-company',
        platform: 'slack',
        platformId: 'T123456',
        status: 'ACTIVE',
      };

      const result = CreateTenantSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should default status to ACTIVE if not provided', () => {
      const dataWithoutStatus = {
        name: 'Test Company',
        slug: 'test-company',
        platform: 'slack',
        platformId: 'T123456',
      };

      const result = CreateTenantSchema.parse(dataWithoutStatus);
      expect(result.status).toBe('ACTIVE');
    });

    it('should trim name and platformId', () => {
      const dataWithSpaces = {
        name: '  Test Company  ',
        slug: 'test-company',
        platform: 'slack',
        platformId: '  T123456  ',
      };

      const result = CreateTenantSchema.parse(dataWithSpaces);
      expect(result.name).toBe('Test Company');
      expect(result.platformId).toBe('T123456');
    });

    describe('name validation', () => {
      it('should reject empty name', () => {
        const data = {
          name: '',
          slug: 'test-company',
          platform: 'slack',
          platformId: 'T123456',
        };

        expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
      });

      it('should reject name exceeding 255 characters', () => {
        const data = {
          name: 'a'.repeat(256),
          slug: 'test-company',
          platform: 'slack',
          platformId: 'T123456',
        };

        expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
      });
    });

    describe('slug validation', () => {
      it('should accept valid slugs', () => {
        const validSlugs = [
          'test',
          'test-company',
          'test-123',
          'abc123',
          '123abc',
          'a-b-c-d-e',
        ];

        validSlugs.forEach((slug) => {
          const data = {
            name: 'Test',
            slug,
            platform: 'slack',
            platformId: 'T123456',
          };
          expect(() => CreateTenantSchema.parse(data)).not.toThrow();
        });
      });

      it('should reject invalid slugs', () => {
        const invalidSlugs = [
          'Test', // uppercase
          'test_company', // underscore
          'test company', // space
          '-test', // starts with hyphen
          'test-', // ends with hyphen
          'test--company', // double hyphen
          'te', // too short
          'a'.repeat(51), // too long
          'test.company', // dot
          'test@company', // special char
        ];

        invalidSlugs.forEach((slug) => {
          const data = {
            name: 'Test',
            slug,
            platform: 'slack',
            platformId: 'T123456',
          };
          expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
        });
      });
    });

    describe('platform validation', () => {
      it('should accept valid platforms', () => {
        const validPlatforms = ['slack', 'discord'];

        validPlatforms.forEach((platform) => {
          const data = {
            name: 'Test',
            slug: 'test',
            platform,
            platformId: 'T123456',
          };
          expect(() => CreateTenantSchema.parse(data)).not.toThrow();
        });
      });

      it('should reject invalid platforms', () => {
        const invalidPlatforms = ['teams', 'telegram', '', 'SLACK', 'Discord'];

        invalidPlatforms.forEach((platform) => {
          const data = {
            name: 'Test',
            slug: 'test',
            platform,
            platformId: 'T123456',
          };
          expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
        });
      });
    });

    describe('status validation', () => {
      it('should accept valid statuses', () => {
        const validStatuses = ['ACTIVE', 'CANCELLED', 'MAINTENANCE'];

        validStatuses.forEach((status) => {
          const data = {
            name: 'Test',
            slug: 'test',
            platform: 'slack',
            platformId: 'T123456',
            status,
          };
          expect(() => CreateTenantSchema.parse(data)).not.toThrow();
        });
      });

      it('should reject invalid statuses', () => {
        const invalidStatuses = ['active', 'INACTIVE', 'DISABLED', ''];

        invalidStatuses.forEach((status) => {
          const data = {
            name: 'Test',
            slug: 'test',
            platform: 'slack',
            platformId: 'T123456',
            status,
          };
          expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
        });
      });
    });

    describe('platformId validation', () => {
      it('should reject empty platformId', () => {
        const data = {
          name: 'Test',
          slug: 'test',
          platform: 'slack',
          platformId: '',
        };

        expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
      });

      it('should reject platformId exceeding 255 characters', () => {
        const data = {
          name: 'Test',
          slug: 'test',
          platform: 'slack',
          platformId: 'a'.repeat(256),
        };

        expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
      });
    });

    it('should reject missing required fields', () => {
      const testCases = [
        { slug: 'test', platform: 'slack', platformId: 'T123' }, // missing name
        { name: 'Test', platform: 'slack', platformId: 'T123' }, // missing slug
        { name: 'Test', slug: 'test', platformId: 'T123' }, // missing platform
        { name: 'Test', slug: 'test', platform: 'slack' }, // missing platformId
      ];

      testCases.forEach((data) => {
        expect(() => CreateTenantSchema.parse(data)).toThrow(z.ZodError);
      });
    });
  });

  describe('UpdateTenantSchema', () => {
    it('should accept empty object for no updates', () => {
      const result = UpdateTenantSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept partial updates', () => {
      const partialUpdates = [
        { name: 'New Name' },
        { slug: 'new-slug' },
        { status: 'MAINTENANCE' },
        { platform: 'discord' },
        { platformId: 'G987654' },
        { name: 'New Name', status: 'CANCELLED' },
      ];

      partialUpdates.forEach((data) => {
        const result = UpdateTenantSchema.parse(data);
        expect(result).toEqual(data);
      });
    });

    it('should validate fields when provided', () => {
      const invalidUpdates = [
        { name: '' }, // empty name
        { slug: 'Invalid Slug' }, // uppercase in slug
        { status: 'UNKNOWN' }, // invalid status
        { platform: 'teams' }, // invalid platform
        { platformId: '' }, // empty platformId
      ];

      invalidUpdates.forEach((data) => {
        expect(() => UpdateTenantSchema.parse(data)).toThrow(z.ZodError);
      });
    });

    it('should trim string fields', () => {
      const data = {
        name: '  Updated Name  ',
        platformId: '  G123456  ',
      };

      const result = UpdateTenantSchema.parse(data);
      expect(result.name).toBe('Updated Name');
      expect(result.platformId).toBe('G123456');
    });
  });

  describe('Validation helper functions', () => {
    describe('validateCreateTenant', () => {
      it('should return parsed data for valid input', () => {
        const validData = {
          name: 'Test',
          slug: 'test',
          platform: 'slack',
          platformId: 'T123',
        };

        const result = validateCreateTenant(validData);
        expect(result).toEqual({ ...validData, status: 'ACTIVE' });
      });

      it('should throw ZodError for invalid input', () => {
        const invalidData = {
          name: 'Test',
          slug: 'test',
          platform: 'invalid',
          platformId: 'T123',
        };

        expect(() => validateCreateTenant(invalidData)).toThrow(z.ZodError);
      });
    });

    describe('safeValidateCreateTenant', () => {
      it('should return success result for valid input', () => {
        const validData = {
          name: 'Test',
          slug: 'test',
          platform: 'slack',
          platformId: 'T123',
        };

        const result = safeValidateCreateTenant(validData);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ ...validData, status: 'ACTIVE' });
        }
      });

      it('should return error result for invalid input', () => {
        const invalidData = {
          name: 'Test',
          slug: 'test',
          platform: 'invalid',
          platformId: 'T123',
        };

        const result = safeValidateCreateTenant(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(z.ZodError);
        }
      });
    });

    describe('validateUpdateTenant', () => {
      it('should return parsed data for valid input', () => {
        const validData = {
          name: 'Updated Name',
          status: 'MAINTENANCE',
        };

        const result = validateUpdateTenant(validData);
        expect(result).toEqual(validData);
      });

      it('should throw ZodError for invalid input', () => {
        const invalidData = {
          slug: 'Invalid Slug',
        };

        expect(() => validateUpdateTenant(invalidData)).toThrow(z.ZodError);
      });
    });

    describe('safeValidateUpdateTenant', () => {
      it('should return success result for valid input', () => {
        const validData = {
          name: 'Updated Name',
          status: 'MAINTENANCE',
        };

        const result = safeValidateUpdateTenant(validData);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(validData);
        }
      });

      it('should return error result for invalid input', () => {
        const invalidData = {
          platform: 'unknown',
        };

        const result = safeValidateUpdateTenant(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(z.ZodError);
        }
      });
    });
  });
});