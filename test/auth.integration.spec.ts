import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { User } from '../src/users/user.entity';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { ValidationPipe } from '@nestjs/common';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Truncate db table before each test to ensure test isolation
    const entities = dataSource.entityMetadatas;
    if (!entities.length) return;

    const tableNames = entities.map((entity) => entity.tableName).join(', ');

    await dataSource.query(
      `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`,
    );
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return 200', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Check your email for confirmation',
      });

      // persistence assertions
      const repo = dataSource.getRepository(User);
      const saved = await repo.findOneBy({ email: payload.email });
      expect(saved).toBeTruthy();
      expect(saved?.isActive).toBe(true);
      expect(saved?.role).toBe(payload.role);
      expect(saved?.passwordHash).toBeDefined();
      expect(saved?.passwordHash).not.toBe(payload.password);
    });
    it('should hash the password and never expose it in the response', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      expect(response.body).not.toHaveProperty('passwordHash');
    });
    it('should return successful register response when the email is already taken', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);
    });
    it('should retun 400 when the email format is invalid', async () => {
      const payload = {
        email: 'invalid-email',
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(400);
    });
    it('should return 400 when the password is missing or too short', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: '123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...payload,
          password: '',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should return an access token and a refresh token on valid credentials', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: payload.email,
          password: payload.password,
        })
        .expect(200);
      const jwtService = app.get(JwtService);

      expect(response.body).toHaveProperty('accessToken');

      const accessPayload = jwtService.verify(response.body.accessToken);

      expect(response.body).toHaveProperty('refreshToken');
      expect(typeof response.body.refreshToken).toBe('string');
      expect(accessPayload.sub).toBeDefined();
      expect(accessPayload.email).toBe(payload.email);
      expect(accessPayload.role).toBe(payload.role);
      expect(accessPayload.iat).toBeLessThan(accessPayload.exp);
    });
    it('should return a short-lived access token', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: payload.email,
          password: payload.password,
        })
        .expect(200);
      const jwtService = app.get(JwtService);

      expect(response.body).toHaveProperty('accessToken');

      const accessPayload = jwtService.verify(response.body.accessToken);

      expect(accessPayload.exp - accessPayload.iat).toBeLessThan(60 * 16); // 15 minutes
    });
    it('should return a long-lived refresh token stored in the DB', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: payload.email,
          password: payload.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('refreshToken');
      expect(typeof response.body.refreshToken).toBe('string');
    });
    it('should return 401 when the password is wrong', async () => {
      const payload = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...payload,
          role: 'admin',
        })
        .expect(200);
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...payload, password: 'notcorrect' })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Invalid credentials');
    });
    it('should return 401 when the email does not exist', async () => {
      const payload = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(payload)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Invalid credentials');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return a new access token given a valid refresh token', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: payload.email,
          password: payload.password,
        })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(typeof response.body.accessToken).toBe('string');
    });
    it('should rotate the refresh token - old one must be invalidated', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      const oldRefresh = loginRes.body.refreshToken as string;
      const [oldId] = oldRefresh.split('.');

      // First refresh: rotate successfully
      const rotateRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(200);

      expect(rotateRes.body).toHaveProperty('accessToken');
      expect(rotateRes.body).toHaveProperty('refreshToken');

      // Old token cannot be used again
      const reuseRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(401);
      expect(reuseRes.body).toHaveProperty('message');

      // DB: old token marked used
      const rtRepo = dataSource.getRepository(RefreshToken);
      const oldTokenRow = await rtRepo.findOne({ where: { id: oldId } });
      expect(oldTokenRow).toBeTruthy();
      expect(oldTokenRow?.usedAt).not.toBeNull();
    });

    it('should return 401 when the refresh token is expired', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      const refreshToken = loginRes.body.refreshToken as string;
      const [tokenId] = refreshToken.split('.');

      // Force expiration in DB
      await dataSource
        .getRepository(RefreshToken)
        .update({ id: tokenId }, { expiresAt: new Date(Date.now() - 60_000) });

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Refresh token expired');
    });

    it('should return 401 when the refresh token has already been used (replay attack)', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      const oldRefresh = loginRes.body.refreshToken as string;

      // First refresh succeeds and returns a new token (same family)
      const firstRotation = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(200);
      const newRefresh = firstRotation.body.refreshToken as string;
      const [newId] = newRefresh.split('.');

      // Replay: using old token again triggers family revocation and 401
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(401);

      // The new token from the same family should now also be invalid
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: newRefresh })
        .expect(401);
      expect(res.body).toHaveProperty('message');

      // DB: new token should be revoked
      const rtRepo = dataSource.getRepository(RefreshToken);
      const newTokenRow = await rtRepo.findOne({ where: { id: newId } });
      expect(newTokenRow?.isRevoked).toBe(true);
    });

    it('should return 401 when no refresh token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(401);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Invalid token');
    });
  });

  describe('POST /auth/logout', () => {
    it('should invalidate the refresh token and return 200', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      const refreshToken = loginRes.body.refreshToken as string;
      const [tokenId] = refreshToken.split('.');

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      // DB: token is revoked
      const rtRepo = dataSource.getRepository(RefreshToken);
      const row = await rtRepo.findOne({ where: { id: tokenId } });
      expect(row?.isRevoked).toBe(true);
    });

    // Guard requirement will be added in Phase 4
    it('should prevent the invalidated refresh token from being used again', async () => {
      const payload = {
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      const refreshToken = loginRes.body.refreshToken as string;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      // Using the same refresh token should now fail
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('GET /users/me', () => {
    it.todo('should return the current authenticated user profile');
    it.todo('should return 401 when no Bearer token is provided');
    it.todo('should return 401 when the access token is expired');
    it.todo('should return 401 when the access token is malformed');
  });

  describe('GET /admin/users', () => {
    it.todo('should return a list of all users when called by an admin');
    it.todo('should return 403 when called by a non-admin authenticated user');
    it.todo('should return 401 when no Bearer token is provided');
    it.todo('should return 401 when the access token is expired');
    it.todo('should return 401 when the access token is malformed');
  });
});
