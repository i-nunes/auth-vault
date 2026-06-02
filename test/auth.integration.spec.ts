import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

describe("Auth Integration Tests", () => {
  let app: INestApplication;
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      // TODO: Import AppModule once it's created
      imports: [],
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /auth/register", () => {
    it.todo("should register a new user and return 201");
    it.todo("should hash the password and never expose it in the response");
    it.todo("should return 409 when the email is already taken");
    it.todo("should retun 400 when the email format is invalid");
    it.todo("should return 400 when the password is missing or too short");
  });

  describe("POST /auth/login", () => {
    it.todo("should return an access token and a refresh token on valid credentials");
    it.todo("should return a short-lived access token");
    it.todo("should return a long-lived refresh token stored in the DB");
    it.todo("should return 401 when the password is wrong");
    it.todo("should return 401 when the email does not exist");
  });

  describe("POST /auth/refresh", () => {
    it.todo("should return a new access token given a valid refresh token");
    it.todo("should rotate the refresh token - old one must be invalidated");
    it.todo("should return 401 when the refresh token is expired");
    it.todo("should return 401 when the refresh token has already been used (replay attack)");
    it.todo("should return 401 when no refresh token is provided");
  });

  describe("POST /auth/logout", () => {
    it.todo("should invalidate the refresh token and return 200");
    it.todo("should return 401 when called without a valid access token");
    it.todo("should prevent the invalidated refresh token from being used again");
  });

  describe("GET /users/me", () => {
    it.todo("should return the current authenticated user profile");
    it.todo("should return 401 when no Bearer token is provided");
    it.todo("should return 401 when the access token is expired");
    it.todo("should return 401 when the access token is malformed");
  });

  describe("GET /admin/users", () => {
    it.todo("should return a list of all users when called by an admin");
    it.todo("should return 403 when called by a non-admin authenticated user");
    it.todo("should return 401 when no Bearer token is provided");
    it.todo("should return 401 when the access token is expired");
    it.todo("should return 401 when the access token is malformed");
  });
});