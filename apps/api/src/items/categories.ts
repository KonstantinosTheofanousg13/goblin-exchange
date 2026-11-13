/**
 * Auction house categories for commodities, keyed by Blizzard's item class and
 * subclass ids (the ids Blizzard's item endpoint returns as `item_class.id` and
 * `item_subclass.id`). Only the classes that hold region-wide commodities are listed;
 * weapons and armor are realm auctions, out of v1 scope.
 *
 * Static on purpose: the taxonomy changes only with game expansions, and a fixed
 * list keeps the sidebar order stable. When ItemsModule fetches real item data,
 * check these ids against GET /data/wow/item-class/index.
 */
export interface Subcategory {
  subclassId: number;
  name: string;
}

export interface Category {
  classId: number;
  name: string;
  subcategories: Subcategory[];
}

export const CATEGORIES: Category[] = [
  {
    classId: 0,
    name: 'Consumables',
    subcategories: [
      { subclassId: 1, name: 'Potions' },
      { subclassId: 2, name: 'Elixirs' },
      { subclassId: 3, name: 'Flasks & Phials' },
      { subclassId: 5, name: 'Food & Drink' },
      { subclassId: 7, name: 'Bandages' },
      { subclassId: 0, name: 'Explosives & Devices' },
      { subclassId: 8, name: 'Other' },
    ],
  },
  {
    classId: 3,
    name: 'Gems',
    subcategories: [
      { subclassId: 0, name: 'Intellect' },
      { subclassId: 1, name: 'Agility' },
      { subclassId: 2, name: 'Strength' },
      { subclassId: 3, name: 'Stamina' },
      { subclassId: 5, name: 'Critical Strike' },
      { subclassId: 6, name: 'Mastery' },
      { subclassId: 7, name: 'Haste' },
      { subclassId: 8, name: 'Versatility' },
      { subclassId: 10, name: 'Multiple Stats' },
      { subclassId: 9, name: 'Other' },
    ],
  },
  {
    classId: 8,
    name: 'Item Enhancements',
    subcategories: [],
  },
  {
    classId: 7,
    name: 'Trade Goods',
    subcategories: [
      { subclassId: 5, name: 'Cloth' },
      { subclassId: 6, name: 'Leather' },
      { subclassId: 7, name: 'Metal & Stone' },
      { subclassId: 8, name: 'Cooking' },
      { subclassId: 9, name: 'Herb' },
      { subclassId: 12, name: 'Enchanting' },
      { subclassId: 16, name: 'Inscription' },
      { subclassId: 4, name: 'Jewelcrafting' },
      { subclassId: 1, name: 'Parts' },
      { subclassId: 10, name: 'Elemental' },
      { subclassId: 18, name: 'Optional Reagents' },
      { subclassId: 19, name: 'Finishing Reagents' },
      { subclassId: 11, name: 'Other' },
    ],
  },
  {
    classId: 5,
    name: 'Reagents',
    subcategories: [],
  },
  {
    classId: 15,
    name: 'Miscellaneous',
    subcategories: [],
  },
];
