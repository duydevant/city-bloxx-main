const { execFileSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const TRACKED_TABLES = [
  ['users', 'id'],
  ['roles', 'id'],
  ['permissions', 'id'],
  ['user_roles', 'user_id, role_id'],
  ['role_permissions', 'role_id, permission_id'],
  ['auth_sessions', 'id'],
  ['audit_logs', 'id'],
  ['city_bloxx_profiles', 'user_id'],
  ['city_bloxx_saves', 'user_id'],
  ['city_bloxx_save_backups', 'id'],
  ['city_bloxx_save_mutations', 'user_id, mutation_id'],
  ['city_bloxx_run_tickets', 'run_id'],
  ['city_bloxx_run_submissions', 'run_id'],
  ['city_bloxx_leaderboard_entries', 'user_id, board_key'],
  ['city_bloxx_analytics_events', 'event_id'],
];

function dbConfig(env, database = env.DB_DATABASE || env.DATABASE_NAME) {
  return {
    host: env.DB_HOST || env.DATABASE_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || env.DATABASE_PORT || 5432),
    user: env.DB_USERNAME || env.DATABASE_USERNAME || 'postgres',
    password: env.DB_PASSWORD || env.DATABASE_PASSWORD || 'postgres',
    database,
  };
}

async function snapshotFingerprints(
  env,
  database = env.DB_DATABASE || env.DATABASE_NAME,
) {
  const client = new Client(dbConfig(env, database));
  await client.connect();
  try {
    const tableCounts = {};
    const tableDigests = {};
    for (const [table, orderBy] of TRACKED_TABLES) {
      const countRes = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
      tableCounts[table] = countRes.rows[0].count;
      const rowsRes = await client.query(
        `SELECT row_to_json(t)::text AS row_json FROM (SELECT * FROM ${table} ORDER BY ${orderBy}) t`,
      );
      const hash = createHash('sha256');
      for (const r of rowsRes.rows) {
        hash.update(r.row_json);
        hash.update('\n');
      }
      tableDigests[table] = hash.digest('hex');
    }
    return { tableCounts, tableDigests };
  } finally {
    await client.end();
  }
}

async function createBackup({
  env = process.env,
  backupDir = path.resolve(process.cwd(), 'backups'),
  retainDays = 14,
  now = new Date(),
} = {}) {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const baseName = `city-bloxx-backup-${stamp}`;
  const dumpPath = path.join(backupDir, `${baseName}.dump`);
  const manifestPath = path.join(backupDir, `${baseName}.manifest.json`);

  const cfg = dbConfig(env);
  execFileSync(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '-h',
      cfg.host,
      '-p',
      String(cfg.port),
      '-U',
      cfg.user,
      '-d',
      cfg.database,
      '-f',
      dumpPath,
    ],
    {
      env: { ...env, PGPASSWORD: cfg.password },
      stdio: 'pipe',
    },
  );
  fs.chmodSync(dumpPath, 0o600);

  const dumpBuffer = fs.readFileSync(dumpPath);
  const dumpSha256 = createHash('sha256').update(dumpBuffer).digest('hex');
  const { tableCounts, tableDigests } = await snapshotFingerprints(env, cfg.database);

  const manifest = {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    retentionDays: retainDays,
    dumpFile: path.basename(dumpPath),
    dumpBytes: dumpBuffer.byteLength,
    dumpSha256,
    tableCounts,
    tableDigests,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  fs.chmodSync(manifestPath, 0o600);
  const pruned = pruneBackups({ backupDir, retainDays, now: now.getTime() });
  return { dumpPath, manifestPath, manifest, pruned };
}

function pruneBackups({
  backupDir,
  retainDays = 14,
  now = Date.now(),
} = {}) {
  if (!fs.existsSync(backupDir)) return { kept: [], removed: [] };
  const cutoff = now - retainDays * 86400 * 1000;
  const entries = fs.readdirSync(backupDir);
  const manifests = entries.filter((name) => name.endsWith('.manifest.json')).sort();
  const kept = [];
  const removed = [];

  for (const manifestFile of manifests) {
    const manifestPath = path.join(backupDir, manifestFile);
    let createdMs = fs.statSync(manifestPath).mtimeMs;
    let dumpFile = manifestFile.replace(/\.manifest\.json$/, '.dump');
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (parsed.createdAt && Number.isFinite(Date.parse(parsed.createdAt))) {
        createdMs = Date.parse(parsed.createdAt);
      }
      if (typeof parsed.dumpFile === 'string') {
        dumpFile = path.basename(parsed.dumpFile);
      }
    } catch {
      // Fall back to mtime when manifest is unreadable
    }
    const dumpPath = path.join(backupDir, dumpFile);
    if (createdMs < cutoff) {
      if (fs.existsSync(dumpPath)) fs.unlinkSync(dumpPath);
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
      removed.push(dumpFile);
    } else {
      kept.push(dumpFile);
    }
  }
  return { kept, removed };
}

async function rehearseRestore({
  env = process.env,
  dumpPath,
  manifestPath,
  bootApp = true,
} = {}) {
  if (!dumpPath || !manifestPath) {
    throw new Error('Both dumpPath and manifestPath are required for restore rehearsal');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actualSha256 = createHash('sha256')
    .update(fs.readFileSync(dumpPath))
    .digest('hex');
  if (actualSha256 !== manifest.dumpSha256) {
    throw new Error('Backup dump SHA-256 mismatch against manifest');
  }

  const restoreDb = `city_bloxx_restore_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const sourceDb = env.DB_DATABASE || env.DATABASE_NAME;
  if (
    !/^city_bloxx_restore_\d+_[0-9a-f]{8}$/.test(restoreDb) ||
    restoreDb === sourceDb ||
    restoreDb === 'base-nest-bo-minh-auth'
  ) {
    throw new Error('Refusing unsafe restore target database');
  }

  const cfg = dbConfig(env, 'postgres');
  const admin = new Client(cfg);
  await admin.connect();
  await admin.query(`CREATE DATABASE ${restoreDb}`);
  try {
    execFileSync(
      'pg_restore',
      [
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '-h',
        cfg.host,
        '-p',
        String(cfg.port),
        '-U',
        cfg.user,
        '-d',
        restoreDb,
        dumpPath,
      ],
      {
        env: { ...env, PGPASSWORD: cfg.password },
        stdio: 'pipe',
      },
    );

    const restored = await snapshotFingerprints(env, restoreDb);
    for (const [table] of TRACKED_TABLES) {
      if (restored.tableCounts[table] !== manifest.tableCounts[table]) {
        throw new Error(
          `Restored row count mismatch on ${table}: expected ${manifest.tableCounts[table]}, got ${restored.tableCounts[table]}`,
        );
      }
      if (restored.tableDigests[table] !== manifest.tableDigests[table]) {
        throw new Error(`Restored content digest mismatch on ${table}`);
      }
    }

    const checkClient = new Client(dbConfig(env, restoreDb));
    await checkClient.connect();
    try {
      const badSaves = await checkClient.query(
        `SELECT count(*)::int AS count FROM city_bloxx_saves WHERE payload_hash IS NULL OR char_length(payload_hash) <> 64`,
      );
      if (badSaves.rows[0].count !== 0) {
        throw new Error('Restored cloud saves failed payload_hash integrity check');
      }
      const badBoards = await checkClient.query(
        `SELECT count(*)::int AS count
         FROM city_bloxx_leaderboard_entries e
         LEFT JOIN city_bloxx_run_submissions s ON s.run_id = e.run_id AND s.user_id = e.user_id
         WHERE s.run_id IS NULL OR s.state <> 'accepted'`,
      );
      if (badBoards.rows[0].count !== 0) {
        throw new Error('Restored leaderboard entries failed submission integrity check');
      }
    } finally {
      await checkClient.end();
    }

    let appVerification = null;
    if (bootApp) {
      const verifyScript = `
        require('reflect-metadata');
        const { NestFactory } = require('@nestjs/core');
        const supertest = require('supertest');
        const { AppModule } = require('./dist/src/modules/app.module');
        const { configureApplication } = require('./dist/src/bootstrap');
        (async () => {
          const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
          configureApplication(app);
          await app.init();
          try {
            const server = app.getHttpServer();
            const ready = await supertest(server).get('/api/v1/health/ready');
            if (ready.status !== 200 || ready.body?.data?.status !== 'ok') {
              throw new Error('Restored readiness failed: ' + ready.status);
            }
            const board = await supertest(server).get('/api/v1/city-bloxx/leaderboards/quick');
            if (board.status !== 200 || !Array.isArray(board.body?.data?.entries)) {
              throw new Error('Restored quick board failed: ' + board.status);
            }
            const catalog = await supertest(server).get('/api/v1/city-bloxx/catalog');
            if (catalog.status !== 200 || !Array.isArray(catalog.body?.data?.cosmetics)) {
              throw new Error('Restored catalog failed: ' + catalog.status);
            }
            process.stdout.write(JSON.stringify({
              readyStatus: ready.status,
              quickBoardEntries: board.body.data.entries.length,
              catalogCosmetics: catalog.body.data.cosmetics.length,
            }));
          } finally {
            await app.close();
          }
        })().catch((e) => { console.error(e); process.exit(1); });
      `;
      const out = execFileSync(
        process.execPath,
        ['-r', 'tsconfig-paths/register', '-e', verifyScript],
        {
          cwd: path.resolve(__dirname, '..'),
          env: {
            ...env,
            DB_DATABASE: restoreDb,
            DATABASE_NAME: restoreDb,
            GAME_VERIFICATION_ENABLED: 'false',
          },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      appVerification = JSON.parse(out.trim());
    }

    return {
      restoredDatabase: restoreDb,
      verifiedTables: TRACKED_TABLES.length,
      tableCounts: restored.tableCounts,
      appVerification,
    };
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${restoreDb} WITH (FORCE)`);
    await admin.end();
  }
}

async function main() {
  const mode = process.argv[2] || 'backup';
  const dirArgIdx = process.argv.indexOf('--dir');
  const backupDir =
    dirArgIdx > -1 && process.argv[dirArgIdx + 1]
      ? path.resolve(process.argv[dirArgIdx + 1])
      : path.resolve(process.cwd(), 'backups');
  const retainIdx = process.argv.indexOf('--retain-days');
  const retainDays =
    retainIdx > -1 && process.argv[retainIdx + 1]
      ? Number(process.argv[retainIdx + 1])
      : 14;

  if (mode === 'backup') {
    const created = await createBackup({ backupDir, retainDays });
    console.log(
      JSON.stringify({
        action: 'backup',
        dumpFile: path.basename(created.dumpPath),
        manifestFile: path.basename(created.manifestPath),
        tableCounts: created.manifest.tableCounts,
        pruned: created.pruned,
      }),
    );
  } else if (mode === 'rehearse') {
    const created = await createBackup({ backupDir, retainDays });
    const rehearsed = await rehearseRestore({
      dumpPath: created.dumpPath,
      manifestPath: created.manifestPath,
      bootApp: !process.argv.includes('--no-boot'),
    });
    console.log(
      JSON.stringify({
        action: 'rehearse',
        dumpFile: path.basename(created.dumpPath),
        restoredDatabaseDropped: true,
        verifiedTables: rehearsed.verifiedTables,
        tableCounts: rehearsed.tableCounts,
        appVerification: rehearsed.appVerification,
      }),
    );
  } else {
    throw new Error('Usage: node scripts/backup-restore.cjs <backup|rehearse> [--dir <path>] [--retain-days 14]');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}

module.exports = {
  TRACKED_TABLES,
  createBackup,
  pruneBackups,
  rehearseRestore,
  snapshotFingerprints,
};
