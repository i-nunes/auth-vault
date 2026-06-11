import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  tokenHash: string;

  @ManyToOne(() => User, { cascade: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'timestamptz', nullable: false })
  expiresAt: Date;

  @Column({ nullable: false })
  userId: string;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  usedAt: Date | null; // null = not yet used; set to now() when rotated (refresh flow)

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'boolean', default: false })
  isRevoked: boolean; // true when manually revoked (logout / family invalidation)

  @Index()
  @Column({ type: 'uuid', nullable: false })
  familyId: string;

  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;
}
