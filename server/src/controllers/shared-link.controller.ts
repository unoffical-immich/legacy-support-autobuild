import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AssetIdsResponseDto } from 'src/dtos/asset-ids.response.dto';
import { AssetIdsDto } from 'src/dtos/asset.dto';
import { AuthDto, ImmichCookie } from 'src/dtos/auth.dto';
import {
  SharedLinkCreateDto,
  SharedLinkEditDto,
  SharedLinkPasswordDto,
  SharedLinkResponseDto,
} from 'src/dtos/shared-link.dto';
import { Auth, Authenticated, GetLoginDetails, SharedLinkRoute } from 'src/middleware/auth.guard';
import { LoginDetails } from 'src/services/auth.service';
import { SharedLinkService } from 'src/services/shared-link.service';
import { respondWithCookie } from 'src/utils/response';
import { UUIDParamDto } from 'src/validation';

@ApiTags('Shared Link')
@Controller('shared-link')
@Authenticated()
export class SharedLinkController {
  constructor(private service: SharedLinkService) {}

  @Get()
  getAllSharedLinks(@Auth() auth: AuthDto): Promise<SharedLinkResponseDto[]> {
    return this.service.getAll(auth);
  }

  @SharedLinkRoute()
  @Get('me')
  async getMySharedLink(
    @Auth() auth: AuthDto,
    @Query() dto: SharedLinkPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
    @GetLoginDetails() loginDetails: LoginDetails,
  ): Promise<SharedLinkResponseDto> {
    const sharedLinkToken = request.cookies?.[ImmichCookie.SHARED_LINK_TOKEN];
    if (sharedLinkToken) {
      dto.token = sharedLinkToken;
    }
    const body = await this.service.getMine(auth, dto);
    return respondWithCookie(res, body, {
      isSecure: loginDetails.isSecure,
      values: body.token ? [{ key: ImmichCookie.SHARED_LINK_TOKEN, value: body.token }] : [],
    });
  }

  @Get(':id')
  getSharedLinkById(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<SharedLinkResponseDto> {
    return this.service.get(auth, id);
  }

  @Post()
  createSharedLink(@Auth() auth: AuthDto, @Body() dto: SharedLinkCreateDto) {
    return this.service.create(auth, dto);
  }

  @Patch(':id')
  updateSharedLink(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: SharedLinkEditDto,
  ): Promise<SharedLinkResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  removeSharedLink(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.remove(auth, id);
  }

  @SharedLinkRoute()
  @Put(':id/assets')
  addSharedLinkAssets(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AssetIdsDto,
  ): Promise<AssetIdsResponseDto[]> {
    return this.service.addAssets(auth, id, dto);
  }

  @SharedLinkRoute()
  @Delete(':id/assets')
  removeSharedLinkAssets(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AssetIdsDto,
  ): Promise<AssetIdsResponseDto[]> {
    return this.service.removeAssets(auth, id, dto);
  }
}
