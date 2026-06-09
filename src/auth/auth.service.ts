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
import { randomBytes } from 'crypto';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
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

    const refreshToken = randomBytes(32).toString('hex');
    // NOTE: Refresh token is not persisted to DB yet

    return { accessToken, refreshToken, userUUID: user.id };
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
}
