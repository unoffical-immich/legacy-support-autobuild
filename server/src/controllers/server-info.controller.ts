import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ServerConfigDto,
  ServerFeaturesDto,
  ServerInfoResponseDto,
  ServerMediaTypesResponseDto,
  ServerPingResponse,
  ServerStatsResponseDto,
  ServerThemeDto,
  ServerVersionResponseDto,
} from 'src/dtos/server-info.dto';
import { AdminRoute, Authenticated, PublicRoute } from 'src/middleware/auth.guard';
import { ServerInfoService } from 'src/services/server-info.service';

@ApiTags('Server Info')
@Controller('server-info')
@Authenticated()
export class ServerInfoController {
  constructor(private service: ServerInfoService) {}

  @Get()
  getServerInfo(): Promise<ServerInfoResponseDto> {
    return this.service.getInfo();
  }

  @PublicRoute()
  @Get('ping')
  pingServer(): ServerPingResponse {
    return this.service.ping();
  }

  @PublicRoute()
  @Get('version')
  getServerVersion(): ServerVersionResponseDto {
    return this.service.getVersion();
  }

  @PublicRoute()
  @Get('features')
  getServerFeatures(): Promise<ServerFeaturesDto> {
    return this.service.getFeatures();
  }

  @PublicRoute()
  @Get('theme')
  getTheme(): Promise<ServerThemeDto> {
    return this.service.getTheme();
  }

  @PublicRoute()
  @Get('config')
  getServerConfig(): Promise<ServerConfigDto> {
    return this.service.getConfig();
  }

  @AdminRoute()
  @Get('statistics')
  getServerStatistics(): Promise<ServerStatsResponseDto> {
    return this.service.getStatistics();
  }

  @PublicRoute()
  @Get('media-types')
  getSupportedMediaTypes(): ServerMediaTypesResponseDto {
    return this.service.getSupportedMediaTypes();
  }
}
