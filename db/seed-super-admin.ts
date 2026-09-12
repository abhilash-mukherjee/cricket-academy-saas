import "dotenv/config";
import { eq } from "drizzle-orm";
import { user } from "./auth-schema";
import { getDb } from "./client";

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  if (!email) {
    throw new Error("SUPER_ADMIN_EMAIL is not set");
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(user)
      .set({
        isSuperAdmin: true,
        emailVerified: true,
        name: existing.name || "Super-admin",
      })
      .where(eq(user.id, existing.id));

    console.log(`Updated Super-admin: ${email}`);
    return;
  }

  await db.insert(user).values({
    email,
    name: "Super-admin",
    emailVerified: true,
    isSuperAdmin: true,
  });

  console.log(`Seeded Super-admin: ${email}`);
}

seedSuperAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});
