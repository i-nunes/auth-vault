import { hashPassword, verifyPassword, stripSensitiveUserFields } from '../helpers';
import { User, UserRole } from '../../users/user.entity';
import bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('Auth Helpers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password with default salt rounds', () => {
      const password = 'testpassword123';
      const hashedPassword = 'hashedpassword';

      (bcrypt.hashSync as jest.Mock).mockReturnValue(hashedPassword);

      const result = hashPassword(password);

      expect(bcrypt.hashSync).toHaveBeenCalledWith(password, 10);
      expect(result).toBe(hashedPassword);
    });

    it('should hash a password with custom salt rounds from env', () => {
      const originalEnv = process.env.HASH_SALT_ROUNDS;
      process.env.HASH_SALT_ROUNDS = '12';

      const password = 'testpassword123';
      const hashedPassword = 'hashedpassword';

      (bcrypt.hashSync as jest.Mock).mockReturnValue(hashedPassword);

      const result = hashPassword(password);

      expect(bcrypt.hashSync).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);

      process.env.HASH_SALT_ROUNDS = originalEnv;
    });
  });

  describe('verifyPassword', () => {
    it('should return true for matching password and hash', () => {
      const password = 'testpassword123';
      const hash = 'hashedpassword';

      (bcrypt.compareSync as jest.Mock).mockReturnValue(true);

      const result = verifyPassword(password, hash);

      expect(bcrypt.compareSync).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password and hash', () => {
      const password = 'wrongpassword';
      const hash = 'hashedpassword';

      (bcrypt.compareSync as jest.Mock).mockReturnValue(false);

      const result = verifyPassword(password, hash);

      expect(bcrypt.compareSync).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });
  });

  describe('stripSensitiveUserFields', () => {
    it('should remove passwordHash from user object', () => {
      const user: User = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        role: UserRole.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = stripSensitiveUserFields(user);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('id', '123e4567-e89b-12d3-a456-426614174000');
      expect(result).toHaveProperty('email', 'test@example.com');
      expect(result).toHaveProperty('role', UserRole.USER);
      expect(result).toHaveProperty('isActive', true);
    });

    it('should handle user object with additional fields', () => {
      const user = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        role: UserRole.ADMIN,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        customField: 'customValue',
      };

      const result = stripSensitiveUserFields(user);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('customField', 'customValue');
    });
  });
});
