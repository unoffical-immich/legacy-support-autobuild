import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth, ApiCookieAuth, ApiOkResponse, ApiQuery, ApiSecurity } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthDto } from 'src/dtos/auth.dto';
import { ILoggerRepository } from 'src/interfaces/logger.interface';
import { AuthService, LoginDetails } from 'src/services/auth.service';
import { UAParser } from 'ua-parser-js';

export enum Metadata {
  AUTH_ROUTE = 'auth_route',
  ADMIN_ROUTE = 'admin_route',
  SHARED_ROUTE = 'shared_route',
  PUBLIC_SECURITY = 'public_security',
  API_KEY_SECURITY = 'api_key',
}

export interface AuthenticatedOptions {
  admin?: true;
  isShared?: true;
}

export const Authenticated = (options: AuthenticatedOptions = {}) => {
  const decorators: MethodDecorator[] = [
    ApiBearerAuth(),
    ApiCookieAuth(),
    ApiSecurity(Metadata.API_KEY_SECURITY),
    SetMetadata(Metadata.AUTH_ROUTE, true),
  ];

  if (options.admin) {
    decorators.push(AdminRoute());
  }

  if (options.isShared) {
    decorators.push(SharedLinkRoute());
  }

  return applyDecorators(...decorators);
};

export const PublicRoute = () =>
  applyDecorators(SetMetadata(Metadata.AUTH_ROUTE, false), ApiSecurity(Metadata.PUBLIC_SECURITY));
export const SharedLinkRoute = () =>
  applyDecorators(SetMetadata(Metadata.SHARED_ROUTE, true), ApiQuery({ name: 'key', type: String, required: false }));
export const AdminRoute = (value = true) => SetMetadata(Metadata.ADMIN_ROUTE, value);

export const Auth = createParamDecorator((data, context: ExecutionContext): AuthDto => {
  return context.switchToHttp().getRequest<{ user: AuthDto }>().user;
});

export const FileResponse = () =>
  ApiOkResponse({
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  });

export const GetLoginDetails = createParamDecorator((data, context: ExecutionContext): LoginDetails => {
  const request = context.switchToHttp().getRequest<Request>();
  const userAgent = UAParser(request.headers['user-agent']);

  return {
    clientIp: request.ip,
    isSecure: request.secure,
    deviceType: userAgent.browser.name || userAgent.device.type || (request.headers.devicemodel as string) || '',
    deviceOS: userAgent.os.name || (request.headers.devicetype as string) || '',
  };
});

export interface AuthRequest extends Request {
  user?: AuthDto;
}

export interface AuthenticatedRequest extends Request {
  user: AuthDto;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(ILoggerRepository) private logger: ILoggerRepository,
    private reflector: Reflector,
    private authService: AuthService,
  ) {
    this.logger.setContext(AuthGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const isAuthRoute = this.reflector.getAllAndOverride(Metadata.AUTH_ROUTE, targets);
    const isAdminRoute = this.reflector.getAllAndOverride(Metadata.ADMIN_ROUTE, targets);
    const isSharedRoute = this.reflector.getAllAndOverride(Metadata.SHARED_ROUTE, targets);

    if (!isAuthRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();

    const authDto = await this.authService.validate(request.headers, request.query as Record<string, string>);
    if (authDto.sharedLink && !isSharedRoute) {
      this.logger.warn(`Denied access to non-shared route: ${request.path}`);
      return false;
    }

    if (isAdminRoute && !authDto.user.isAdmin) {
      this.logger.warn(`Denied access to admin only route: ${request.path}`);
      return false;
    }

    request.user = authDto;

    return true;
  }
}
