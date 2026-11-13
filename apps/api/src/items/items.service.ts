import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ItemSearchResult {
  id: number;
  name: string | null;
  icon: string | null;
  quality: string | null;
  classId: number | null;
  subclassId: number | null;
}

export interface ItemFilter {
  search?: string;
  classId?: number;
  subclassId?: number;
}

/**
 * Item metadata. Names come from Blizzard's item endpoint (not wired yet:
 * needs API credentials), so search only finds items whose names are known.
 */
@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Items by name (case-insensitive substring, ILIKE; fine for ~10k items) and/or
   * category. Filters combine with AND, so you can search within a category.
   */
  search(filter: ItemFilter, limit: number): Promise<ItemSearchResult[]> {
    return this.prisma.item.findMany({
      where: {
        name: filter.search
          ? { contains: filter.search, mode: 'insensitive' }
          : undefined,
        classId: filter.classId,
        subclassId: filter.subclassId,
      },
      select: {
        id: true,
        name: true,
        icon: true,
        quality: true,
        classId: true,
        subclassId: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }
}
