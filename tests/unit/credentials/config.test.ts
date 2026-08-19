import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCredentialCryptoConfig } from "@/lib/credentials/config";

const dataKey = Buffer.alloc(32, 7).toString("base64");
const originalEnvironment = {
  dataKey: process.env.CREDSIGNAL_DATA_KEY,
  dataKeyFile: process.env.CREDSIGNAL_DATA_KEY_FILE,
  keyVersion: process.env.CREDSIGNAL_KEY_VERSION,
};

function restoreEnvironmentVariable(
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnvironmentVariable(
    "CREDSIGNAL_DATA_KEY",
    originalEnvironment.dataKey,
  );
  restoreEnvironmentVariable(
    "CREDSIGNAL_DATA_KEY_FILE",
    originalEnvironment.dataKeyFile,
  );
  restoreEnvironmentVariable(
    "CREDSIGNAL_KEY_VERSION",
    originalEnvironment.keyVersion,
  );
});

describe("CredSignal credential configuration", () => {
  it("reads the inline key used by host-native tools", () => {
    process.env.CREDSIGNAL_DATA_KEY = dataKey;
    delete process.env.CREDSIGNAL_DATA_KEY_FILE;
    process.env.CREDSIGNAL_KEY_VERSION = "host-v1";

    expect(getCredentialCryptoConfig()).toEqual({
      dataKey,
      keyVersion: "host-v1",
    });
  });

  it("reads the persistent key file used by Docker", () => {
    const directory = mkdtempSync(join(tmpdir(), "credsignal-key-"));
    const keyFile = join(directory, "data-key");
    writeFileSync(keyFile, `${dataKey}\n`);

    try {
      delete process.env.CREDSIGNAL_DATA_KEY;
      process.env.CREDSIGNAL_DATA_KEY_FILE = keyFile;
      process.env.CREDSIGNAL_KEY_VERSION = "docker-v1";

      expect(getCredentialCryptoConfig()).toEqual({
        dataKey,
        keyVersion: "docker-v1",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects ambiguous or malformed key configuration", () => {
    process.env.CREDSIGNAL_DATA_KEY = dataKey;
    process.env.CREDSIGNAL_DATA_KEY_FILE = "/unused/key";
    process.env.CREDSIGNAL_KEY_VERSION = "ambiguous-v1";

    expect(() => getCredentialCryptoConfig()).toThrow(/either.+not both/i);

    delete process.env.CREDSIGNAL_DATA_KEY_FILE;
    process.env.CREDSIGNAL_DATA_KEY = "not-a-valid-key";

    expect(() => getCredentialCryptoConfig()).toThrow(
      /base64-encoded 32-byte key/i,
    );
  });
});
