CREATE UNIQUE INDEX "batches_academy_id_name_unique" ON "batches" USING btree ("academy_id",lower(btrim("name")));
