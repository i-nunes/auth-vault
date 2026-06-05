import dotenv from 'dotenv';
import { User } from 'src/users/user.entity';
import bcrypt from 'bcrypt';
dotenv.config();

type SafeUser = Omit<User, 'passwordHash'>;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, parseInt(process.env.HASH_SALT_ROUNDS || '10'));
}   

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function stripSensitiveUserFields(user: any): SafeUser {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}
