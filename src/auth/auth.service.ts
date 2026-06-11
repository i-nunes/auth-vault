import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { hashPassword, verifyPassword } from './helpers';
import { UserRole } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import { InjectRepository } from '@nestjs/typeorm';
import { RefreshToken } from './refresh-token.entity';
import { Repository } from 'typeorm';
import { compareSync } from 'bcrypt';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private dataSource: DataSource,
  ) {}

  private parseRawToken(rawToken: string): [string, string] {
    if (!rawToken) {
      throw new UnauthorizedException('Invalid token');
    }

    const parts = rawToken.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new UnauthorizedException('Invalid token');
    }

    return [parts[0], parts[1]];
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string; userUUID: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '15m') as StringValue;

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        expiresIn,
      },
    );
    const refreshDays = Number(process.env.JWT_REFRESH_EXPIRES_IN ?? '7');
    if (!Number.isFinite(refreshDays))
      throw new Error('JWT_REFRESH_EXPIRES_IN must be a number in days');
    const rawRefreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = hashPassword(rawRefreshToken);
    const familyId = randomUUID();
    const refreshToken = this.refreshTokenRepository.create({
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000), // in days
      user: user,
      familyId,
    });
    await this.refreshTokenRepository.save(refreshToken);

    return {
      accessToken,
      refreshToken: `${refreshToken.id}.${rawRefreshToken}`,
      userUUID: user.id,
    };
  }

  async logout(rawToken: string): Promise<void> {
    const [tokenId, rawRefreshToken] = this.parseRawToken(rawToken);
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { id: tokenId },
    });

    if (
      !refreshToken ||
      !compareSync(rawRefreshToken, refreshToken.tokenHash)
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    if (refreshToken.usedAt !== null || refreshToken.isRevoked) {
      throw new UnauthorizedException('Token already invalidated');
    }

    refreshToken.isRevoked = true;
    await this.refreshTokenRepository.save(refreshToken);
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      return { message: 'Check your email for confirmation' };
    }

    const hash = hashPassword(dto.password);

    await this.usersService.create({
      email: dto.email,
      passwordHash: hash,
      role: dto.role as UserRole,
    });

    return {
      message: 'Check your email for confirmation',
    };
  }

  async refresh(rawToken: string) {
    const [tokenId, randomPart] = this.parseRawToken(rawToken);
    const token = await this.refreshTokenRepository.findOne({
      where: { id: tokenId },
      relations: { user: true },
    });

    if (
      !token ||
      !compareSync(randomPart, token.tokenHash) ||
      token.isRevoked
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (token.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (token.usedAt !== null) {
      try {
        await this.refreshTokenRepository.update(
          { familyId: token.familyId },
          { isRevoked: true },
        );
      } catch {
        // Best effort — DB failure should not block the security response
      }
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Use QueryRunner for an atomic DB transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newRaw = randomBytes(32).toString('hex');
      const newHash = hashPassword(newRaw);

      const newToken = this.refreshTokenRepository.create({
        tokenHash: newHash,
        expiresAt: new Date(
          Date.now() +
            Number(process.env.JWT_REFRESH_EXPIRES_IN ?? '7') *
              24 *
              60 *
              60 *
              1000,
        ), // in days
        user: token.user,
        familyId: token.familyId,
      });
      await queryRunner.manager.save(newToken);

      token.usedAt = new Date();
      token.replacedById = newToken.id;
      await queryRunner.manager.save(token);

      const accessToken = this.jwtService.sign(
        {
          sub: token.user.id,
          email: token.user.email,
          role: token.user.role,
        },
        {
          expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as StringValue,
        },
      );

      await queryRunner.commitTransaction();
      return { accessToken, refreshToken: `${newToken.id}.${newRaw}` };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
