import { UsersModule } from '../users.module';

describe('UsersModule', () => {
  it('should be defined', () => {
    expect(UsersModule).toBeDefined();
  });

  it('should be a valid NestJS module', () => {
    const moduleMetadata = Reflect.getMetadata('imports', UsersModule);
    expect(moduleMetadata).toBeDefined();
  });
});
