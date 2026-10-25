#!/usr/bin/env node
/**
 * Serveur S3 local pour les tests et le développement — SeaweedFS (Apache-2.0, maintenu),
 * remplace s3rver (abandonné, 3 vulnérabilités non corrigées via busboy/dicer et fast-xml-parser).
 * MinIO n'est pas retenu : l'édition communautaire n'est plus maintenue ni distribuée en binaire.
 *
 * - Binaire épinglé (version + SHA-256 par plateforme), téléchargé une fois depuis les releases
 *   GitHub officielles puis mis en cache (~/.cache/polyweb/seaweedfs/<version>, ou SEAWEEDFS_CACHE_DIR).
 *   WEED_BIN=/chemin/weed permet d'utiliser un binaire déjà installé.
 * - Écoute uniquement sur 127.0.0.1, ports libres aléatoires (pas de collision avec le dev server).
 * - Usage CLI : `pnpm s3:local` → démarre un serveur, crée le bucket (S3_BUCKET, défaut « polyweb »)
 *   et affiche l'endpoint ; Ctrl+C pour arrêter. Les tests l'utilisent via startS3TestServer().
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SEAWEEDFS_VERSION = "4.50";
/** SHA-256 des archives officielles (github.com/seaweedfs/seaweedfs/releases/tag/4.50). */
const SHA256 = {
  linux_amd64: "8fc88061421a74d1cd486d1cd9dc5874d6495f9ed17fed8fa677bb16bd195b07",
  linux_arm64: "8bbd74337e233dbcbdc65e765f937a7334acc588ebb09dc0136b8692d9380311",
  darwin_arm64: "97514d9e704dec19ea9258b3b93766b5613d954a3740e9e868e88c5cfbfaf10e",
  darwin_amd64: "b5bb26688733d720af06c29f78e4ee795d92e8f0dae5000f3f198e648f14ac33",
};

const platformKey = () => {
  const os = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : null;
  const arch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : null;
  if (!os || !arch) throw new Error(`SeaweedFS : plateforme non prise en charge (${process.platform}/${process.arch}) — définir WEED_BIN.`);
  return `${os}_${arch}`;
};

export const seaweedCacheDir = () => process.env.SEAWEEDFS_CACHE_DIR || join(homedir(), ".cache", "polyweb", "seaweedfs", SEAWEEDFS_VERSION);

/** Chemin du binaire `weed` (WEED_BIN, cache, ou téléchargement vérifié par SHA-256). */
export async function ensureWeedBinary() {
  if (process.env.WEED_BIN) return process.env.WEED_BIN;
  const dir = seaweedCacheDir();
  const bin = join(dir, "weed");
  if (existsSync(bin)) return bin;
  const key = platformKey();
  const url = `https://github.com/seaweedfs/seaweedfs/releases/download/${SEAWEEDFS_VERSION}/${key}.tar.gz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`SeaweedFS : téléchargement impossible (${res.status}) ${url}`);
  const archive = Buffer.from(await res.arrayBuffer());
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== SHA256[key]) throw new Error(`SeaweedFS : empreinte SHA-256 inattendue pour ${key} (${digest}).`);
  await mkdir(dir, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "seaweedfs-"));
  try {
    const tgz = join(work, "weed.tar.gz");
    await writeFile(tgz, archive);
    execFileSync("tar", ["-xzf", tgz, "-C", work, "weed"]);
    await chmod(join(work, "weed"), 0o755);
    await rename(join(work, "weed"), bin).catch(async () => {
      execFileSync("cp", [join(work, "weed"), bin]);
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return bin;
}

const canBind = (port) =>
  new Promise((resolve) => {
    const srv = createServer().once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });

/** Port libre dont le port gRPC associé (port + 10000, convention SeaweedFS) est aussi libre. */
async function freePort(taken) {
  for (let i = 0; i < 200; i++) {
    const port = 20000 + Math.floor(Math.random() * 25000);
    if (taken.has(port) || taken.has(port + 10000)) continue;
    if ((await canBind(port)) && (await canBind(port + 10000))) {
      taken.add(port).add(port + 10000);
      return port;
    }
  }
  throw new Error("SeaweedFS : aucun port libre trouvé.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Démarre SeaweedFS (master + volume + filer + passerelle S3) dans un répertoire temporaire.
 * Retourne l'endpoint S3 et `stop()` (arrêt + nettoyage). Sans identités configurées, la passerelle
 * accepte toute signature (identifiants de test arbitraires) ; la création implicite de bucket est désactivée.
 */
export async function startSeaweedS3({ timeoutMs = 60_000 } = {}) {
  const bin = await ensureWeedBinary();
  const dir = await mkdtemp(join(tmpdir(), "polyweb-s3-"));
  const taken = new Set();
  const [master, volume, filer, s3] = [await freePort(taken), await freePort(taken), await freePort(taken), await freePort(taken)];
  const args = [
    "server", `-dir=${dir}`, "-ip=127.0.0.1", "-ip.bind=127.0.0.1",
    `-master.port=${master}`, "-master.volumeSizeLimitMB=64", `-volume.port=${volume}`, "-volume.max=64", "-volume.preStopSeconds=0",
    "-filer", `-filer.port=${filer}`,
    "-s3", `-s3.port=${s3}`, "-s3.port.iceberg=0", "-s3.port.lance=0", "-s3.autoCreateBucket=false",
  ];
  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  const keep = (b) => { log = (log + b.toString()).slice(-8000); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  if (process.env.SEAWEEDFS_DEBUG) { child.stdout.pipe(process.stderr); child.stderr.pipe(process.stderr); }
  const endpoint = `http://127.0.0.1:${s3}`;
  const stop = async () => {
    if (child.exitCode === null) {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await Promise.race([exited, sleep(5000).then(() => child.kill("SIGKILL"))]);
    }
    await rm(dir, { recursive: true, force: true });
    // SeaweedFS ouvre aussi des sockets Unix /tmp/seaweedfs-<rôle>-<port>.sock : on retire les nôtres.
    for (const base of new Set(["/tmp", tmpdir()])) {
      const names = await readdir(base).catch(() => []);
      await Promise.all(names
        .filter((n) => /^seaweedfs-.+-(\d+)\.sock$/.test(n) && taken.has(Number(n.match(/-(\d+)\.sock$/)[1])))
        .map((n) => rm(join(base, n), { force: true })));
    }
  };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await stop();
      throw new Error(`SeaweedFS s'est arrêté (code ${child.exitCode}) :\n${log}`);
    }
    // Prêt quand la passerelle S3 répond ET qu'un volume est inscriptible (le master sait attribuer un fid ;
    // le premier appel déclenche la création des volumes).
    const s3Up = await fetch(`${endpoint}/status`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false);
    const writable = s3Up && (await fetch(`http://127.0.0.1:${master}/dir/assign`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json(), () => ({}))
      .then((j) => typeof j?.fid === "string", () => false));
    if (writable) return { endpoint, stop, dataDir: dir };
    await sleep(250);
  }
  await stop();
  throw new Error(`SeaweedFS : passerelle S3 non prête après ${timeoutMs} ms :\n${log}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const bucket = process.env.S3_BUCKET || "polyweb";
  const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");
  const server = await startSeaweedS3();
  const client = new S3Client({ endpoint: server.endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "local", secretAccessKey: "local" } });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`S3 local prêt : ${server.endpoint} (bucket « ${bucket} », SeaweedFS ${SEAWEEDFS_VERSION})`);
  console.log(`  STORAGE_DRIVER=s3 S3_ENDPOINT=${server.endpoint} S3_BUCKET=${bucket} S3_FORCE_PATH_STYLE=true S3_ACCESS_KEY_ID=local S3_SECRET_ACCESS_KEY=local`);
  const shutdown = () => server.stop().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
