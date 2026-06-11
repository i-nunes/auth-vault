import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { User, UserRole } from '../../users/user.entity';
import { RefreshToken } from '../refresh-token.entity';
import { compareSync } from 'bcrypt';
import * as helpers from '../helpers';

jest.mock('bcrypt', () => ({
  compareSync: jest.fn(),
}));
jest.mock('../helpers');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let refreshTokenRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: { save: jest.Mock };
  };

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    passwordHash: 'hashedpassword',
    role: UserRole.USER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockUsersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
    };

    refreshTokenRepository = {
      create: jest.fn().mockReturnValue({ id: 'refresh-id' }),
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: { save: jest.fn() },
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login a user with valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (helpers.verifyPassword as jest.Mock).mockReturnValue(true);
      jwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.login(loginDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(helpers.verifyPassword).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.passwordHash,
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
        },
        {
          expiresIn: '15m',
        },
      );
      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('userUUID', mockUser.id);
      const [tokenId, tokenSecret] = result.refreshToken.split('.');
      expect(tokenId).toBe('refresh-id');
      expect(tokenSecret).toHaveLength(64);
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (helpers.verifyPassword as jest.Mock).mockReturnValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(helpers.verifyPassword).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.passwordHash,
      );
    });

    it('should use JWT_EXPIRES_IN from environment if set', async () => {
      const originalEnv = process.env.JWT_EXPIRES_IN;
      process.env.JWT_EXPIRES_IN = '30m';

      usersService.findByEmail.mockResolvedValue(mockUser);
      (helpers.verifyPassword as jest.Mock).mockReturnValue(true);
      jwtService.sign.mockReturnValue('mock-jwt-token');

      await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith(expect.any(Object), {
        expiresIn: '30m',
      });

      process.env.JWT_EXPIRES_IN = originalEnv;
    });
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'password123',
      role: UserRole.USER,
    };

    it('should successfully register a new user', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      (helpers.hashPassword as jest.Mock).mockReturnValue('hashedpassword');
      usersService.create.mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(helpers.hashPassword).toHaveBeenCalledWith(registerDto.password);
      expect(usersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        passwordHash: 'hashedpassword',
        role: registerDto.role,
      });
      expect(result).toEqual({
        message: 'Check your email for confirmation',
      });
    });

    it('should return success message when user already exists', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(helpers.hashPassword).not.toHaveBeenCalled();
      expect(usersService.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Check your email for confirmation',
      });
    });

    it('should handle admin role registration', async () => {
      const adminRegisterDto: RegisterDto = {
        email: 'admin@example.com',
        password: 'adminpass',
        role: UserRole.ADMIN,
      };

      usersService.findByEmail.mockResolvedValue(null);
      (helpers.hashPassword as jest.Mock).mockReturnValue('hashedpassword');
      usersService.create.mockResolvedValue({
        ...mockUser,
        role: UserRole.ADMIN,
      });

      const result = await service.register(adminRegisterDto);

      expect(usersService.create).toHaveBeenCalledWith({
        email: adminRegisterDto.email,
        passwordHash: 'hashedpassword',
        role: UserRole.ADMIN,
      });
      expect(result).toEqual({
        message: 'Check your email for confirmation',
      });
    });
  });

  describe('refresh', () => {
    it('should rotate the refresh token and return new tokens', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        isRevoked: false,
        familyId: 'family-id',
        user: mockUser,
      };
      const newToken = { id: 'new-token-id' } as RefreshToken;

      refreshTokenRepository.findOne.mockResolvedValue(token);
      refreshTokenRepository.create.mockReturnValue(newToken);
      (compareSync as jest.Mock).mockReturnValue(true);
      (helpers.hashPassword as jest.Mock).mockReturnValue('new-hash');
      jwtService.sign.mockReturnValue('new-access-token');
      queryRunner.manager.save
        .mockResolvedValueOnce(newToken)
        .mockResolvedValueOnce({ ...token, usedAt: new Date() });

      const result = await service.refresh(`${token.id}.raw-token`);

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.save).toHaveBeenCalledWith(newToken);
      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: token.id,
          replacedById: newToken.id,
        }),
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(result.accessToken).toBe('new-access-token');
      const [tokenId, tokenSecret] = result.refreshToken.split('.');
      expect(tokenId).toBe(newToken.id);
      expect(tokenSecret).toHaveLength(64);
    });

    it('should revoke the family when a refresh token is reused', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
        isRevoked: false,
        familyId: 'family-id',
        user: mockUser,
      };

      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(true);

      await expect(service.refresh(`${token.id}.raw-token`)).rejects.toThrow(
        'Refresh token reuse detected',
      );
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { familyId: token.familyId },
        { isRevoked: true },
      );
    });

    it('should throw UnauthorizedException for invalid token format', async () => {
      await expect(service.refresh('invalid-token')).rejects.toThrow(
        'Invalid token',
      );
    });

    it('should throw UnauthorizedException when token is not found', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh('token-id.raw-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should throw UnauthorizedException when token hash does not match', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        isRevoked: false,
        familyId: 'family-id',
        user: mockUser,
      };
      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(false);

      await expect(service.refresh(`${token.id}.raw-token`)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should throw UnauthorizedException when token is revoked', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        isRevoked: true,
        familyId: 'family-id',
        user: mockUser,
      };
      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(true);

      await expect(service.refresh(`${token.id}.raw-token`)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() - 60_000),
        usedAt: null,
        isRevoked: false,
        familyId: 'family-id',
        user: mockUser,
      };
      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(true);

      await expect(service.refresh(`${token.id}.raw-token`)).rejects.toThrow(
        'Refresh token expired',
      );
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        usedAt: null,
        isRevoked: false,
      };

      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(true);

      await service.logout(`${token.id}.raw-token`);

      expect(token.isRevoked).toBe(true);
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedException when the token is invalid', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.logout('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token hash does not match', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        usedAt: null,
        isRevoked: false,
      };
      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(false);

      await expect(service.logout(`${token.id}.raw-token`)).rejects.toThrow(
        'Invalid token',
      );
    });

    it('should throw UnauthorizedException when token was already used in rotation', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        usedAt: new Date(),
        isRevoked: false,
      };
      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(true);

      await expect(service.logout(`${token.id}.raw-token`)).rejects.toThrow(
        'Token already invalidated',
      );
    });

    it('should throw UnauthorizedException when token is already revoked', async () => {
      const token = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        usedAt: null,
        isRevoked: true,
      };
      refreshTokenRepository.findOne.mockResolvedValue(token);
      (compareSync as jest.Mock).mockReturnValue(true);

      await expect(service.logout(`${token.id}.raw-token`)).rejects.toThrow(
        'Token already invalidated',
      );
    });
  });
});
