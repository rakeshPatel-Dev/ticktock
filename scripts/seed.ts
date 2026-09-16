import { db } from "../db";
import { sessions } from "../db/schema";

async function seed() {
  console.log("Seeding realistic sample data for TickTock...");

  await db.delete(sessions);

  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  const sampleData = [
    {
      id: crypto.randomUUID(),
      subject: "DSA",
      topic: "Binary Search",
      goal: "Solve 5 LeetCode problems",
      outcome: "Solved problems",
      notes: "Solved 6 binary search variations including rotated sorted array.",
      durationSeconds: 3120, // 52m
      pausedSeconds: 300, // 5m
      status: "completed" as const,
      startedAt: now - 3600 * 3,
      endedAt: now - 3600 * 3 + 3420,
      createdAt: now - 3600 * 3,
      updatedAt: now - 3600 * 3 + 3420,
    },
    {
      id: crypto.randomUUID(),
      subject: "DBMS",
      topic: "Normalization",
      goal: "Revise 1NF through BCNF",
      outcome: "Revised",
      notes: "Clear on 3NF vs BCNF anomalies and functional dependencies.",
      durationSeconds: 2280, // 38m
      pausedSeconds: 180,
      status: "completed" as const,
      startedAt: now - 3600 * 6,
      endedAt: now - 3600 * 6 + 2460,
      createdAt: now - 3600 * 6,
      updatedAt: now - 3600 * 6 + 2460,
    },
    {
      id: crypto.randomUUID(),
      subject: "Operating Systems",
      topic: "Processes & Threads",
      goal: "Understand context switching",
      outcome: "Learned",
      notes: "Wrote diagrams for PCB state transitions and thread switching.",
      durationSeconds: 2640, // 44m
      pausedSeconds: 120,
      status: "completed" as const,
      startedAt: now - oneDay - 3600 * 4,
      endedAt: now - oneDay - 3600 * 4 + 2760,
      createdAt: now - oneDay - 3600 * 4,
      updatedAt: now - oneDay - 3600 * 4 + 2760,
    },
    {
      id: crypto.randomUUID(),
      subject: "DSA",
      topic: "Trees",
      goal: "Implement AVL and Red-Black tree properties",
      outcome: "Practiced",
      notes: "Understood tree rotations and depth-first traversal orders.",
      durationSeconds: 3840, // 1h 04m
      pausedSeconds: 600,
      status: "completed" as const,
      startedAt: now - oneDay * 2 - 3600 * 2,
      endedAt: now - oneDay * 2 - 3600 * 2 + 4440,
      createdAt: now - oneDay * 2 - 3600 * 2,
      updatedAt: now - oneDay * 2 - 3600 * 2 + 4440,
    },
    {
      id: crypto.randomUUID(),
      subject: "Computer Networks",
      topic: "TCP/IP Handshake",
      goal: "Revise transport layer protocols",
      outcome: "Revised",
      notes: "SYN, SYN-ACK, ACK, and TCP congestion window mechanics.",
      durationSeconds: 2700, // 45m
      pausedSeconds: 240,
      status: "completed" as const,
      startedAt: now - oneDay * 3 - 3600 * 5,
      endedAt: now - oneDay * 3 - 3600 * 5 + 2940,
      createdAt: now - oneDay * 3 - 3600 * 5,
      updatedAt: now - oneDay * 3 - 3600 * 5 + 2940,
    },
    {
      id: crypto.randomUUID(),
      subject: "DSA",
      topic: "Dynamic Programming",
      goal: "0/1 Knapsack variations",
      outcome: "Solved problems",
      notes: "Coded 2D and space-optimized 1D DP table solutions.",
      durationSeconds: 4500, // 1h 15m
      pausedSeconds: 400,
      status: "completed" as const,
      startedAt: now - oneDay * 4 - 3600 * 3,
      endedAt: now - oneDay * 4 - 3600 * 3 + 4900,
      createdAt: now - oneDay * 4 - 3600 * 3,
      updatedAt: now - oneDay * 4 - 3600 * 3 + 4900,
    },
  ];

  await db.insert(sessions).values(sampleData);

  console.log(`✓ Seeded ${sampleData.length} realistic sessions.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
