import { Connection, Client } from '@temporalio/client';
import config from '../config';

let _client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
    if (!_client) {
        const connection = await Connection.connect({ address: config.temporal.address });
        _client = new Client({ connection, namespace: config.temporal.namespace });
    }
    return _client;
}
