import { getSupabaseConfig } from "../config.js";

export class SupabaseStorageAdapter {
  private readonly serviceRoleKey;
  private readonly supabaseUrl;

  constructor() {
    const { url, serviceRoleKey } = getSupabaseConfig();

    this.supabaseUrl = url;
    this.serviceRoleKey = serviceRoleKey;
  }

  async downloadObject(bucket: string, storagePath: string): Promise<Buffer> {
    const encodedPath = storagePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const response = await fetch(
      `${this.supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`,
      {
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to download storage object ${bucket}/${storagePath}: ${response.status} ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer) as unknown as Buffer;
  }

  async uploadObject(args: {
    bucket: string;
    storagePath: string;
    data: Buffer;
    contentType: string;
    upsert?: boolean;
  }): Promise<void> {
    const encodedPath = args.storagePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const response = await fetch(
      `${this.supabaseUrl}/storage/v1/object/${args.bucket}/${encodedPath}`,
      {
        method: "POST",
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          "content-type": args.contentType,
          "x-upsert": args.upsert ? "true" : "false",
        },
        body: args.data as unknown as BodyInit,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to upload storage object ${args.bucket}/${args.storagePath}: ${response.status} ${response.statusText}`,
      );
    }
  }

  async deleteObject(bucket: string, storagePath: string): Promise<void> {
    const encodedPath = storagePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const response = await fetch(
      `${this.supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`,
      {
        method: "DELETE",
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
        },
      },
    );

    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      throw new Error(
        `Failed to delete storage object ${bucket}/${storagePath}: ${response.status} ${response.statusText}`,
      );
    }
  }
}

export function createSupabaseStorageAdapter(): SupabaseStorageAdapter {
  return new SupabaseStorageAdapter();
}
