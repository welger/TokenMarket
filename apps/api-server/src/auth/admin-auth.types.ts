import type { AdminRole } from '../generated/prisma/client.js';

export interface AdminJwtPayload {
  sub: string;
  role: AdminRole;
  type: 'admin';
  iat?: number;
  exp?: number;
}

export interface AdminAuthenticatedRequest {
  user?: AdminJwtPayload;
}
