import { Inject } from '@nestjs/common';

/** DI token for the validated {@link AppEnv} object. */
export const APP_ENV = Symbol('APP_ENV');

/** `constructor(@InjectEnv() private readonly env: AppEnv) {}` */
export const InjectEnv = () => Inject(APP_ENV);

export type { AppEnv } from './env.validation';
