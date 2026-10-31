import { HttpException, HttpStatus } from '@nestjs/common';
import { Pool } from 'pg';
import { parseBaseDatabaseConnection } from './db-connection';

// Server-only. Use a least-privilege DB role scoped to SautiLink Base tables.
// The browser must never receive DATABASE_URL or BOT_TOKEN_ENCRYPTION_KEY.
let database: Pool | undefined;
export function pool(): Pool {
  if (!database) {
    // Never accept a URL for a different Supabase project or an admin role.
    const connection = parseBaseDatabaseConnection(process.env.DATABASE_URL);
    database = new Pool({
      ...connection,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 15000,
      statement_timeout: 10000,
      query_timeout: 10000,
      ssl: { rejectUnauthorized: true }
    });
  }
  return database;
}

export async function verifiedUserId(authorization?: string): Promise<string> {
  if (!authorization?.startsWith('Bearer ')) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  const token = authorization.slice(7).trim();
  if (!token || token.length > 8192) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error('Base Auth not configured');
  let response: Response;
  try {
    response = await fetch(new URL('/auth/v1/user', url), {
      headers: { authorization: 'Bearer ' + token, apikey: publishableKey },
      signal: AbortSignal.timeout(7000),
      redirect: 'error'
    });
  } catch {
    throw new HttpException('Authentication service unavailable', HttpStatus.BAD_GATEWAY);
  }
  if (!response.ok) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  const user = await response.json() as { id?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  return user.id;
}
