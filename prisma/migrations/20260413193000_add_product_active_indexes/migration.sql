-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_activo_orden_idx" ON "Product"("activo", "orden");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_activo_platformId_idx" ON "Product"("activo", "platformId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_activo_genreId_idx" ON "Product"("activo", "genreId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_activo_createdAt_idx" ON "Product"("activo", "createdAt");
