/** Types de scripts/s3-test-server.mjs (serveur S3 local SeaweedFS pour les tests). */
export declare const SEAWEEDFS_VERSION: string;
export declare function seaweedCacheDir(): string;
export declare function ensureWeedBinary(): Promise<string>;
export interface SeaweedS3Server {
  readonly endpoint: string;
  readonly dataDir: string;
  stop(): Promise<void>;
}
export declare function startSeaweedS3(options?: { readonly timeoutMs?: number }): Promise<SeaweedS3Server>;
