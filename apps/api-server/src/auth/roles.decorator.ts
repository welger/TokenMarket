import { SetMetadata } from '@nestjs/common';

import type { AdminRole } from '../generated/prisma/client.js';

export const ADMIN_ROLES_METADATA = 'admin_roles';

export const Roles = (...roles: AdminRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ADMIN_ROLES_METADATA, roles);
