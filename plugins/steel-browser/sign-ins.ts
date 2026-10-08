import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import { accountRecordSchema, type AccountRecord, type ServiceId } from "./contract.ts";

import { SERVICES } from "./service-catalog.ts";

export class SignIns {
  constructor(private readonly kv: PluginKvStorage) {}
  async list(projectId: string): Promise<AccountRecord[]> {
    const records = await Promise.all(SERVICES.map(service => this.kv.get(`account:${projectId}:${service.id}`)));
    return records.filter(value => value != null).map(value => accountRecordSchema.parse(value));
  }
  async confirm(projectId: string, service: ServiceId, label: string) {
    const record = accountRecordSchema.parse({ service, label, confirmedAt: new Date().toISOString() });
    await this.kv.set(`account:${projectId}:${service}`, record);
    return this.list(projectId);
  }
  async forget(projectId: string, service: ServiceId) {
    await this.kv.set(`account:${projectId}:${service}`, null);
    return this.list(projectId);
  }
}
