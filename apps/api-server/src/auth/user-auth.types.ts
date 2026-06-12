export interface UserJwtPayload {
  sub: string;
  type: 'user';
  iat?: number;
  exp?: number;
}

export interface UserAuthenticatedRequest {
  user?: UserJwtPayload;
}
