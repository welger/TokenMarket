import {
  AdminComplianceController,
} from './compliance.controller.js';
import { ADMIN_ROLES_METADATA } from '../auth/roles.decorator.js';
import { AdminModelsController } from '../models/models.controller.js';
import { ProvidersController } from '../providers/providers.controller.js';
import { AdminRole } from '../generated/prisma/client.js';

const readRoles = [
  AdminRole.OWNER,
  AdminRole.OPERATOR,
  AdminRole.SUPPORT,
  AdminRole.AUDITOR,
];

describe('configuration RBAC metadata', () => {
  it.each([
    [AdminModelsController, 'list'],
    [ProvidersController, 'list'],
    [AdminComplianceController, 'get'],
    [AdminComplianceController, 'getProductionReadiness'],
    [AdminComplianceController, 'listRules'],
  ])('allows every admin role to read %s.%s', (controller, method) => {
    expect(
      Reflect.getMetadata(
        ADMIN_ROLES_METADATA,
        controller.prototype[method as keyof typeof controller.prototype],
      ),
    ).toEqual(readRoles);
  });

  it('allows only OWNER to enable production', () => {
    expect(
      Reflect.getMetadata(
        ADMIN_ROLES_METADATA,
        AdminComplianceController.prototype.enableProduction,
      ),
    ).toEqual([AdminRole.OWNER]);
  });
});
