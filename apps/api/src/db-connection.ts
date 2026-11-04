// Restrict all server database connections to the dedicated SautiLink Base project.
// Session Pooler hostname was verified in the project's Supabase Connect panel.
export const BASE_PROJECT_REF = 'gtzqirfwghijuzhvrnha';
export const BASE_SESSION_POOLER = 'aws-0-eu-west-1.pooler.supabase.com';
export const BASE_DATABASE_ROLE = 'base_api_login';

export type BaseDatabaseConnection = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export function parseBaseDatabaseConnection(connectionString: string | undefined): BaseDatabaseConnection {
  if (!connectionString) throw new Error('Dedicated SautiLink Base database connection is not configured');
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Invalid SautiLink Base database connection');
  }

  const expectedUser = BASE_DATABASE_ROLE + '.' + BASE_PROJECT_REF;
  if (
    (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') ||
    parsed.hostname !== BASE_SESSION_POOLER ||
    parsed.port !== '5432' ||
    parsed.pathname !== '/postgres' ||
    decodeURIComponent(parsed.username) !== expectedUser ||
    !parsed.password ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Refusing a database connection outside the dedicated Base session pooler and runtime role');
  }

  return {
    host: BASE_SESSION_POOLER,
    port: 5432,
    database: 'postgres',
    user: expectedUser,
    password: decodeURIComponent(parsed.password)
  };
}
