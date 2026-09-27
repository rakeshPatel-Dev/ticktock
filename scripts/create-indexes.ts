import "./_load-env";

import { ensureIndexes } from "../db/indexes";
import { db, studySessions, users } from "../db";

async function run() {
  await ensureIndexes();

  const indexes = await studySessions.indexes();
  console.log("studySessions indexes (managed by this app):");
  for (const index of indexes) {
    console.log(`  ${index.name}  ${JSON.stringify(index.key)}`);
  }

  // listIndexes throws NamespaceNotFound until the first signup creates the
  // collection, so treat "no auth collections yet" as a normal state.
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map(
    (c) => c.name
  );
  console.log(`\ncollections present: ${existing.join(", ") || "none"}`);

  if (existing.includes("user")) {
    const authIndexes = await users.indexes();
    console.log("\nuser indexes (managed by this app — the adapter does not create these):");
    for (const index of authIndexes) {
      console.log(`  ${index.name}  ${JSON.stringify(index.key)}`);
    }
  } else {
    console.log("\nuser indexes: collection not created yet (created on first signup)");
  }

  console.log("\n✓ Indexes ensured.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
