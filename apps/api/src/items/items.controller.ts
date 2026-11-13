import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { openApi } from '../common/openapi';
import { MarketService } from '../market/market.service';
import {
  type CandlesQuery,
  candlesQuerySchema,
  type CandlesResponse,
  candlesResponseSchema,
  itemIdSchema,
  itemSearchResultSchema,
  type ItemSummaryResponse,
  itemSummaryResponseSchema,
  resolveCandleRange,
  type SearchItemsQuery,
  searchItemsQuerySchema,
  toCandlesResponse,
  toItemSearchResults,
  toItemSummaryResponse,
} from './items.schemas';
import { type ItemSearchResult, ItemsService } from './items.service';

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly market: MarketService,
  ) {}

  @Get()
  @ApiOkResponse({ schema: openApi(z.array(itemSearchResultSchema)) })
  async search(
    @Query({ schema: searchItemsQuerySchema }) query: SearchItemsQuery,
  ): Promise<ItemSearchResult[]> {
    return toItemSearchResults(await this.items.search(query.search, query.limit));
  }

  @Get(':id')
  @ApiOkResponse({ schema: openApi(itemSummaryResponseSchema) })
  @ApiNotFoundResponse({ description: 'No price data for this item' })
  async summary(
    @Param('id', { schema: itemIdSchema }) id: number,
  ): Promise<ItemSummaryResponse> {
    const summary = await this.market.getItemSummary(id);
    if (!summary) {
      throw new NotFoundException(`No price data for item ${id}`);
    }
    return toItemSummaryResponse(summary);
  }

  @Get(':id/candles')
  @ApiOkResponse({ schema: openApi(candlesResponseSchema) })
  async candles(
    @Param('id', { schema: itemIdSchema }) id: number,
    @Query({ schema: candlesQuerySchema }) query: CandlesQuery,
  ): Promise<CandlesResponse> {
    const range = resolveCandleRange(query);
    const candles = await this.market.getCandles(id, query.interval, range.from, range.to);
    return toCandlesResponse(id, query.interval, range, candles);
  }
}
