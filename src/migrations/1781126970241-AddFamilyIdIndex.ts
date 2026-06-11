import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFamilyIdIndex1781126970241 implements MigrationInterface {
  name = 'AddFamilyIdIndex1781126970241';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_40e9a8b923a1b3fb4429a5c624" ON "refresh_tokens"  ("familyId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_40e9a8b923a1b3fb4429a5c624"`,
    );
  }
}
