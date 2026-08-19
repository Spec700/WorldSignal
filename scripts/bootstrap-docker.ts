import { randomBytes } from "node:crypto";
import {
  chmodSync,
  chownSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

import { Pool } from "pg";

import { decodeCredentialDataKey } from "../src/lib/credentials/data-key";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for the Docker bootstrap.`);
  }

  return value;
}

function run(command: string, arguments_: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${arguments_.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`}.`,
        ),
      );
    });
  });
}

async function databaseHasEncryptedCredentials(
  connectionString: string,
): Promise<boolean> {
  const pool = new Pool({ connectionString, max: 1 });

  try {
    const result = await pool.query<{ count: string }>(
      "select count(*)::text as count from credential_exposures where credential_ciphertext is not null",
    );
    return Number(result.rows[0]?.count ?? "0") > 0;
  } finally {
    await pool.end();
  }
}

function secureKeyPath(keyFile: string): void {
  const keyDirectory = dirname(keyFile);
  const runtimeUid = Number.parseInt(
    process.env.CREDSIGNAL_KEY_OWNER_UID ?? "1000",
    10,
  );
  const runtimeGid = Number.parseInt(
    process.env.CREDSIGNAL_KEY_OWNER_GID ?? "1000",
    10,
  );

  if (
    process.getuid?.() === 0 &&
    Number.isInteger(runtimeUid) &&
    Number.isInteger(runtimeGid)
  ) {
    chownSync(keyDirectory, runtimeUid, runtimeGid);
    chownSync(keyFile, runtimeUid, runtimeGid);
  }

  chmodSync(keyDirectory, 0o700);
  chmodSync(keyFile, 0o400);
}

async function ensureCredentialDataKey(): Promise<void> {
  const keyFile = requiredEnvironment("CREDSIGNAL_DATA_KEY_FILE");
  const importedKey = process.env.CREDSIGNAL_BOOTSTRAP_DATA_KEY?.trim();
  const keyDirectory = dirname(keyFile);

  mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });

  if (existsSync(keyFile)) {
    const persistedKey = readFileSync(keyFile, "utf8").trim();
    decodeCredentialDataKey(persistedKey);

    if (importedKey && importedKey !== persistedKey) {
      throw new Error(
        "The key in .env does not match the persisted Docker key. Remove the stale .env key or restore the matching key before starting Priority Signals.",
      );
    }

    secureKeyPath(keyFile);
    process.stdout.write("CredSignal persistent data key is ready.\n");
    return;
  }

  let dataKey = importedKey;

  if (dataKey) {
    decodeCredentialDataKey(dataKey);
  } else {
    const connectionString = requiredEnvironment("DATABASE_URL");
    if (await databaseHasEncryptedCredentials(connectionString)) {
      throw new Error(
        "The database contains encrypted credentials but the Docker key volume is empty. Restore the original CREDSIGNAL_DATA_KEY in .env and start once to import it, or reset both Docker volumes if the data can be discarded.",
      );
    }

    dataKey = randomBytes(32).toString("base64");
  }

  writeFileSync(keyFile, `${dataKey}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  secureKeyPath(keyFile);
  process.stdout.write("CredSignal persistent data key was initialized.\n");
}

async function bootstrap(): Promise<void> {
  process.stdout.write("Applying Priority Signals database migrations...\n");
  await run("npm", ["run", "db:migrate"]);
  await ensureCredentialDataKey();
  process.stdout.write("Loading the synthetic CredSignal workspace...\n");
  await run("npm", ["run", "db:seed"]);
  process.stdout.write("Priority Signals bootstrap completed successfully.\n");
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Priority Signals bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
