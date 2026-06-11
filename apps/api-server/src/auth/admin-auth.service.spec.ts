import { verify } from 'argon2';

import { AdminAuthService } from './admin-auth.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

describe('AdminAuthService', () => {
  it('creates Argon2id password hashes that can be verified', async () => {
    const service = new AdminAuthService(
      {} as PrismaService,
      {} as JwtService,
    );
    const password = 'local-test-password';

    const passwordHash = await service.hashPassword(password);

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(verify(passwordHash, password)).resolves.toBe(true);
  });
});
