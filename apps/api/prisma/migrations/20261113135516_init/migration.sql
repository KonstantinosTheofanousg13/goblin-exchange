-- CreateTable
CREATE TABLE "snapshot" (
    "id" SERIAL NOT NULL,
    "region" TEXT NOT NULL,
    "last_modified" TIMESTAMPTZ(3) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auction_count" INTEGER NOT NULL,

    CONSTRAINT "snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" INTEGER NOT NULL,
    "name" TEXT,
    "icon" TEXT,
    "quality" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_price_hourly" (
    "snapshot_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "min_price" BIGINT NOT NULL,
    "market_price" BIGINT NOT NULL,
    "total_quantity" INTEGER NOT NULL,
    "listing_count" INTEGER NOT NULL,

    CONSTRAINT "item_price_hourly_pkey" PRIMARY KEY ("snapshot_id","item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_region_last_modified_key" ON "snapshot"("region", "last_modified");

-- CreateIndex
CREATE INDEX "item_price_hourly_item_id_captured_at_idx" ON "item_price_hourly"("item_id", "captured_at");

-- AddForeignKey
ALTER TABLE "item_price_hourly" ADD CONSTRAINT "item_price_hourly_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_price_hourly" ADD CONSTRAINT "item_price_hourly_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
