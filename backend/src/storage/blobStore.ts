import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ApiError } from '../common/errors.js';

export interface StoredBlob {
  sizeBytes: number;
  sha256: string;
}

/**
 * Raw feed storage. Production: a versioned, KMS-encrypted S3 bucket per region, written
 * directly by the mobile app through a pre-signed URL and scanned for malware on arrival.
 * Local: files on disk behind the same interface.
 */
export interface BlobStore {
  write(key: string, body: Readable, maxBytes: number): Promise<StoredBlob>;
  read(key: string): Readable;
  remove(key: string): Promise<void>;
}

export class LocalBlobStore implements BlobStore {
  constructor(private readonly rootDir: string) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(path.resolve(this.rootDir) + path.sep)) throw new Error('Invalid blob key');
    return resolved;
  }

  async write(key: string, body: Readable, maxBytes: number): Promise<StoredBlob> {
    const target = this.pathFor(key);
    const hash = crypto.createHash('sha256');
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        sizeBytes += chunk.length;
        if (sizeBytes > maxBytes) {
          cb(new ApiError(413, 'PAYLOAD_TOO_LARGE', `Feed files are limited to ${Math.round(maxBytes / 1024 / 1024)} MB`));
          return;
        }
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    try {
      await pipeline(body, meter, fs.createWriteStream(target));
    } catch (err) {
      await fs.promises.rm(target, { force: true });
      throw err;
    }
    return { sizeBytes, sha256: hash.digest('hex') };
  }

  read(key: string): Readable {
    return fs.createReadStream(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await fs.promises.rm(this.pathFor(key), { force: true });
  }
}
