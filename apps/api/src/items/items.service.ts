import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ItemSearchResult {
  id: number;
  name: string | null;
  icon: string | null;
  quality: string | null;
}

/**
 * Item metadata. Names come from Blizzard's item endpoint (not wired yet:
 * needs API credentials), so search only finds items whose names are known.
 */
@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Case-insensitive substring search on item names (ILIKE; fine for ~10k items). */
  search(term: string, limit: number): Promise<ItemSearchResult[]> {
    return this.prisma.item.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      select: { id: true, name: true, icon: true, quality: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }
}
