import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { openApi } from '../common/openapi';
import {
  type ListedItemResponse,
  type MarketStatusResponse,
  marketStatusResponseSchema,
  toMarketStatusResponse,
  listedItemResponseSchema,
  type MostListedQuery,
  mostListedQuerySchema,
  type MoverResponse,
  moverResponseSchema,
  type MoversQuery,
  moversQuerySchema,
  toListedItemResponse,
  toMoverResponse,
} from './market.schemas';
import { MarketService } from './market.service';

@ApiTags('market')
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('movers')
  @ApiOkResponse({ schema: openApi(z.array(moverResponseSchema)) })
  async movers(@Query({ schema: moversQuerySchema }) query: MoversQuery): Promise<MoverResponse[]> {
    const movers = await this.market.getTopMovers(query);
    return movers.map(toMoverResponse);
  }

  @Get('status')
  @ApiOkResponse({ schema: openApi(marketStatusResponseSchema) })
  async status(): Promise<MarketStatusResponse> {
    return toMarketStatusResponse(await this.market.getStatus());
  }

  @Get('most-listed')
  @ApiOkResponse({ schema: openApi(z.array(listedItemResponseSchema)) })
  async mostListed(
    @Query({ schema: mostListedQuerySchema }) query: MostListedQuery,
  ): Promise<ListedItemResponse[]> {
    const items = await this.market.getMostListed(query.limit);
    return items.map(toListedItemResponse);
  }
}
