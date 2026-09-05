#!/usr/bin/env node

"use strict";

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const DEFAULT_API_URL = "https://winterboard.quizbank.pl/api";
const API_URL = (process.env.WINTERBOARD_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
const DISCORD_API_URL = "https://discord.com/api/v10";
const CODE_PATTERN = /^WBV-[A-F0-9]{32}$/;

async function ask(question) {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await prompt.question(question)).trim();
  } finally {
    prompt.close();
  }
}

async function askHidden(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return ask(question);
  }

  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }

    function onData(chunk) {
      const text = chunk.toString("utf8");
      for (const character of text) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Przerwano weryfikację."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function getVerification(code) {
  const response = await fetch(`${API_URL}/verification/${encodeURIComponent(code)}`, {
    headers: { Accept: "application/json" },
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(body.message || "Kod jest nieprawidłowy albo wygasł.");
  return body;
}

async function createDiscordToken(applicationId, clientSecret) {
  const credentials = Buffer.from(`${applicationId}:${clientSecret}`, "utf8").toString("base64");
  const response = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "identify",
    }),
  });
  const body = await readJson(response);
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error("Discord odrzucił Client ID lub Client Secret.");
  }
  return body.access_token;
}

async function completeVerification(code, accessToken) {
  const response = await fetch(`${API_URL}/verification/${encodeURIComponent(code)}/complete`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accessToken }),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(body.message || "WinterBoard odrzucił weryfikację.");
  return body;
}

async function revokeDiscordToken(applicationId, clientSecret, accessToken) {
  if (!applicationId || !clientSecret || !accessToken) return;
  const credentials = Buffer.from(`${applicationId}:${clientSecret}`, "utf8").toString("base64");
  await fetch(`${DISCORD_API_URL}/oauth2/token/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: accessToken }),
  }).catch(() => undefined);
}

async function main() {
  console.log("\nWinterBoard — weryfikacja właściciela aplikacji Discord\n");
  console.log("Client Secret zostanie wysłany wyłącznie bezpośrednio do Discorda.");
  console.log("WinterBoard otrzyma tylko jednorazowy kod i tymczasowy access token.\n");

  let code = "";
  let applicationId = "";
  let clientSecret = "";
  let accessToken = "";

  try {
    code = (await ask("Kod WinterBoard: ")).toUpperCase();
    if (!CODE_PATTERN.test(code)) throw new Error("Kod WinterBoard ma nieprawidłowy format.");

    const verification = await getVerification(code);
    applicationId = String(verification.applicationId || "");
    if (!/^\d{17,20}$/.test(applicationId)) throw new Error("API zwróciło nieprawidłowe Application ID.");

    console.log(`Application ID: ${applicationId}`);
    console.log(`Kod ważny do: ${new Date(verification.expiresAt).toLocaleString()}\n`);

    clientSecret = await askHidden("Discord Client Secret: ");
    if (!clientSecret) throw new Error("Client Secret nie może być pusty.");

    console.log("\nPobieranie tymczasowego tokena bezpośrednio z Discorda...");
    accessToken = await createDiscordToken(applicationId, clientSecret);
    console.log("Potwierdzanie Application ID w WinterBoard...");
    const result = await completeVerification(code, accessToken);
    console.log(`\n✓ ${result.message || "Weryfikacja zakończona."}`);
    console.log("Możesz wrócić do panelu WinterBoard.\n");
  } finally {
    await revokeDiscordToken(applicationId, clientSecret, accessToken);
    accessToken = "";
    clientSecret = "";
    code = "";
  }
}

main().catch((error) => {
  console.error(`\nBłąd: ${error instanceof Error ? error.message : "Weryfikacja nie powiodła się."}\n`);
  process.exitCode = 1;
});
