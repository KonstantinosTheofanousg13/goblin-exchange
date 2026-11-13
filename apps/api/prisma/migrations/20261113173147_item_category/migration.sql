-- AlterTable
ALTER TABLE "item" ADD COLUMN     "class_id" INTEGER,
ADD COLUMN     "subclass_id" INTEGER;

-- CreateIndex
CREATE INDEX "item_class_id_subclass_id_idx" ON "item"("class_id", "subclass_id");
