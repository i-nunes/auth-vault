import { AuthModule } from '../auth.module';

describe('AuthModule', () => {
  it('should be defined', () => {
    expect(AuthModule).toBeDefined();
  });

  it('should be a valid NestJS module', () => {
    const moduleMetadata = Reflect.getMetadata('imports', AuthModule);
    expect(moduleMetadata).toBeDefined();
  });
});
