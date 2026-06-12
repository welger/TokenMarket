import { Injectable, OnModuleInit } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

const DUMMY_PASSWORD = 'fixed-admin-login-dummy-password';

@Injectable()
export class PasswordHasher implements OnModuleInit {
  dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(DUMMY_PASSWORD);
  }

  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
