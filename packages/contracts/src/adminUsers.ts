import { z } from 'zod';

export const ADMIN_ROLES = ['SUPERADMIN', 'MODERATOR'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const AdminRoleSchema = z.enum(ADMIN_ROLES);

export const AdminUserSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  role: AdminRoleSchema,
  is_active: z.boolean(),
  created_at: z.string(),
  last_login_at: z.string().nullable(),
});

export type AdminUserSummary = z.infer<typeof AdminUserSummarySchema>;

export const ListAdminUsersResponseSchema = z.object({
  users: z.array(AdminUserSummarySchema),
});

export type ListAdminUsersResponse = z.infer<typeof ListAdminUsersResponseSchema>;

export const CreateModeratorRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username cannot exceed 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must contain only alphanumeric characters and underscores'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  reason: z.string().max(300).optional(),
});

export type CreateModeratorRequest = z.infer<typeof CreateModeratorRequestSchema>;

export const RevokeModeratorRequestSchema = z.object({
  reason: z.string().trim().min(3, 'Revocation reason must be at least 3 characters').max(500),
});

export type RevokeModeratorRequest = z.infer<typeof RevokeModeratorRequestSchema>;

export const ResetModeratorPasswordRequestSchema = z.object({
  new_password: z.string().min(10, 'Password must be at least 10 characters'),
  reason: z.string().max(300).optional(),
});

export type ResetModeratorPasswordRequest = z.infer<typeof ResetModeratorPasswordRequestSchema>;
