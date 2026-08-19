import { z } from "zod";

import type { EventChange } from "@/lib/events/change-detection";
import {
  eventBatchSchema,
  hazardWindowSchema,
  worldEventSchema,
} from "@/lib/events/schema";
import type { EventBatch, HazardWindow, WorldEvent } from "@/lib/events/types";

const DATABASE_NAME = "priority-signals-worldsignal";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "hazard-snapshots";
const METADATA_STORE = "metadata";
const ACTIVE_WINDOW_KEY = "active-window";

const eventChangeSchema = z.enum(["new", "updated", "resolved", "unchanged"]);

export const hazardSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    window: hazardWindowSchema,
    savedAt: z.iso.datetime({ offset: false, precision: 3 }),
    batch: eventBatchSchema,
    baselineEvents: z.array(worldEventSchema),
    changes: z.array(z.tuple([z.string().trim().min(1), eventChangeSchema])),
  })
  .superRefine((snapshot, context) => {
    const baselineIds = new Set<string>();
    for (const [index, event] of snapshot.baselineEvents.entries()) {
      if (baselineIds.has(event.id)) {
        context.addIssue({
          code: "custom",
          path: ["baselineEvents", index, "id"],
          message: "Snapshot baseline event IDs must be unique",
        });
      }
      baselineIds.add(event.id);
    }

    const batchIds = new Set(snapshot.batch.events.map((event) => event.id));
    const changedIds = new Set<string>();
    for (const [index, [eventId]] of snapshot.changes.entries()) {
      if (!batchIds.has(eventId)) {
        context.addIssue({
          code: "custom",
          path: ["changes", index, 0],
          message: "Snapshot changes must reference a current batch event",
        });
      }
      if (changedIds.has(eventId)) {
        context.addIssue({
          code: "custom",
          path: ["changes", index, 0],
          message: "Snapshot changes must contain unique event IDs",
        });
      }
      changedIds.add(eventId);
    }
  });

export interface HazardSnapshot {
  schemaVersion: 2;
  window: HazardWindow;
  savedAt: string;
  batch: EventBatch;
  baselineEvents: WorldEvent[];
  changes: Array<[string, EventChange]>;
}

interface ActiveWindowRecord {
  key: typeof ACTIVE_WINDOW_KEY;
  window: HazardWindow;
}

function indexedDbFactory(): IDBFactory | undefined {
  return globalThis.indexedDB;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed")),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () =>
        reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () =>
        reject(transaction.error ?? new Error("IndexedDB transaction failed")),
      { once: true },
    );
  });
}

async function openDatabase(): Promise<IDBDatabase | undefined> {
  const factory = indexedDbFactory();
  if (!factory) {
    return undefined;
  }

  const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
      database.createObjectStore(SNAPSHOT_STORE, { keyPath: "window" });
    }
    if (!database.objectStoreNames.contains(METADATA_STORE)) {
      database.createObjectStore(METADATA_STORE, { keyPath: "key" });
    }
  });

  const database = await requestResult(request);
  database.addEventListener("versionchange", () => database.close());
  return database;
}

async function removeInvalidSnapshot(
  database: IDBDatabase,
  window: HazardWindow,
): Promise<void> {
  const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
  transaction.objectStore(SNAPSHOT_STORE).delete(window);
  await transactionComplete(transaction);
}

export function createHazardSnapshot(input: {
  window: HazardWindow;
  batch: EventBatch;
  previousEventsById: ReadonlyMap<string, WorldEvent>;
  changesByEventId: ReadonlyMap<string, EventChange>;
  savedAt?: string;
}): HazardSnapshot {
  return hazardSnapshotSchema.parse({
    schemaVersion: 2,
    window: input.window,
    savedAt: input.savedAt ?? new Date().toISOString(),
    batch: input.batch,
    baselineEvents: [...input.previousEventsById.values()],
    changes: [...input.changesByEventId.entries()],
  });
}

export async function readHazardSnapshot(
  window: HazardWindow,
): Promise<HazardSnapshot | undefined> {
  const database = await openDatabase();
  if (!database) {
    return undefined;
  }

  try {
    const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
    const raw = await requestResult(
      transaction.objectStore(SNAPSHOT_STORE).get(window),
    );
    const parsed = hazardSnapshotSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    if (raw !== undefined) {
      await removeInvalidSnapshot(database, window);
    }
    return undefined;
  } finally {
    database.close();
  }
}

export async function readMostRecentHazardSnapshot(
  fallbackWindow: HazardWindow,
): Promise<{ window: HazardWindow; snapshot?: HazardSnapshot }> {
  const database = await openDatabase();
  if (!database) {
    return { window: fallbackWindow };
  }

  let activeWindow = fallbackWindow;
  try {
    const metadataTransaction = database.transaction(
      METADATA_STORE,
      "readonly",
    );
    const rawMetadata = (await requestResult(
      metadataTransaction.objectStore(METADATA_STORE).get(ACTIVE_WINDOW_KEY),
    )) as ActiveWindowRecord | undefined;
    const parsedWindow = hazardWindowSchema.safeParse(rawMetadata?.window);
    if (parsedWindow.success) {
      activeWindow = parsedWindow.data;
    }

    const snapshotTransaction = database.transaction(
      SNAPSHOT_STORE,
      "readonly",
    );
    const rawSnapshot = await requestResult(
      snapshotTransaction.objectStore(SNAPSHOT_STORE).get(activeWindow),
    );
    const parsedSnapshot = hazardSnapshotSchema.safeParse(rawSnapshot);
    if (parsedSnapshot.success) {
      return { window: activeWindow, snapshot: parsedSnapshot.data };
    }
    if (rawSnapshot !== undefined) {
      await removeInvalidSnapshot(database, activeWindow);
    }
    return { window: activeWindow };
  } finally {
    database.close();
  }
}

export async function writeHazardSnapshot(
  snapshot: HazardSnapshot,
): Promise<void> {
  const validated = hazardSnapshotSchema.parse(snapshot);
  const database = await openDatabase();
  if (!database) {
    throw new Error("Browser-local snapshot storage is unavailable");
  }

  try {
    const transaction = database.transaction(
      [SNAPSHOT_STORE, METADATA_STORE],
      "readwrite",
    );
    transaction.objectStore(SNAPSHOT_STORE).put(validated);
    transaction.objectStore(METADATA_STORE).put({
      key: ACTIVE_WINDOW_KEY,
      window: validated.window,
    } satisfies ActiveWindowRecord);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function setActiveHazardWindow(
  window: HazardWindow,
): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(METADATA_STORE, "readwrite");
    transaction.objectStore(METADATA_STORE).put({
      key: ACTIVE_WINDOW_KEY,
      window,
    } satisfies ActiveWindowRecord);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
