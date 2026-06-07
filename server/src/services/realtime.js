let socketServer = null;
let databasePollingTimer = null;
let databaseSnapshot = null;

const watchedCollections = ['users', 'products', 'orders', 'notifications', 'suppliers', 'transactions'];

export function setSocketServer(io) {
  socketServer = io;
}

export function emitRealtimeEvent(eventName, payload) {
  if (!socketServer) {
    return;
  }

  socketServer.emit(eventName, payload);
}

function serializeValue(value) {
  if (!value) {
    return 'none';
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? String(value) : dateValue.toISOString();
}

async function buildDatabaseSnapshot(connection) {
  const collections = connection.db ? watchedCollections : [];

  const snapshot = await Promise.all(
    collections.map(async (collectionName) => {
      const collection = connection.db.collection(collectionName);
      const [count, latestRecord] = await Promise.all([
        collection.countDocuments({}),
        collection
          .find({}, { projection: { createdAt: 1, updatedAt: 1 } })
          .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
          .limit(1)
          .toArray(),
      ]);

      const latest = latestRecord[0] || null;
      return [
        collectionName,
        `${count}:${serializeValue(latest?.updatedAt || latest?.createdAt || latest?._id)}`,
      ];
    }),
  );

  return Object.fromEntries(snapshot);
}

async function emitDatabaseSnapshot(connection) {
  try {
    const nextSnapshot = await buildDatabaseSnapshot(connection);
    const snapshotChanged = !databaseSnapshot
      || Object.keys(nextSnapshot).some((collectionName) => databaseSnapshot[collectionName] !== nextSnapshot[collectionName])
      || Object.keys(databaseSnapshot).length !== Object.keys(nextSnapshot).length;

    if (snapshotChanged) {
      databaseSnapshot = nextSnapshot;
      emitRealtimeEvent('database:change', {
        source: 'poll',
        snapshot: nextSnapshot,
      });
    }
  } catch (error) {
    console.warn('Database polling sync failed:', error.message);
  }
}

function startDatabasePolling(connection) {
  if (databasePollingTimer) {
    return databasePollingTimer;
  }

  void emitDatabaseSnapshot(connection);
  databasePollingTimer = setInterval(() => {
    void emitDatabaseSnapshot(connection);
  }, 5000);

  return databasePollingTimer;
}

export function startDatabaseSync(connection) {
  if (databasePollingTimer) {
    return databasePollingTimer;
  }

  startDatabasePolling(connection);

  return databasePollingTimer;
}