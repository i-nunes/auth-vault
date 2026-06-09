import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { User } from "../users/user.entity";

@Entity("refresh_tokens")
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: false })
    tokenHash: string;

    @ManyToOne(() => User, { cascade: false })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'timestamptz', nullable: false })
    expiresAt: Date

    @Column()
    userId: string  

    @Column({ type: 'timestamptz', nullable: true, default: null })
    usedAt: Date | null        // null = not yet used; set when rotated or revoked

    @CreateDateColumn()
    createdAt: Date

    @Column({ type: 'boolean', default: false })
    isRevoked: boolean

    @Column({ type: 'uuid', nullable: false })
    familyId: string

    @Column({ type: 'uuid', nullable: true })
    replacedById: string | null
}
