import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
  ) {}

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

    const rawRefreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = hashPassword(rawRefreshToken);
    const familyId = randomUUID();
    const refreshToken = this.refreshTokenRepository.create({
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + parseInt(process.env.JWT_REFRESH_EXPIRES_IN ?? '7') * 24 * 60 * 60 * 1000), // in days
      user: user,
      familyId,
    });
    await this.refreshTokenRepository.save(refreshToken);

    return { accessToken, refreshToken: rawRefreshToken, userUUID: user.id };
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      return { message: 'Check your email for confirmation' };
    }

    const hash = hashPassword(dto.password);

    const user = await this.usersService.create({
      email: dto.email,
      passwordHash: hash,
      role: dto.role as UserRole,
    });

    return {
      message: 'Check your email for confirmation',
    };
  }

  async refresh(rawToken: string) {
    const token = await this.refreshTokenRepository.findOne({ where: { tokenHash: rawToken }, relations: { user: true } });
    console.log(token);

    if (!token || token.isRevoked || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (token.usedAt) {
      await this.refreshTokenRepository.update({ familyId: token.familyId }, { isRevoked: true });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const newRaw = randomBytes(32).toString('hex');
    const newHash = hashPassword(newRaw);

    const newToken = this.refreshTokenRepository.create({
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + parseInt(process.env.JWT_REFRESH_EXPIRES_IN ?? '7') * 24 * 60 * 60 * 1000), // in days
      user: token.user,
      familyId: token.familyId,
    });
    await this.refreshTokenRepository.save(newToken);

    token.usedAt = new Date();
    token.replacedById = newToken.id;
    await this.refreshTokenRepository.save(token);
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

    return { accessToken, refreshToken: newRaw };
  }
}
