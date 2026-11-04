'use client';
import {getSupabase,getBaseApiUrl} from './supabase';
export async function baseRequest<T>(path:string,init:RequestInit={}):Promise<T> {
  const supabase=await getSupabase();
  const {data,error}=await supabase.auth.getSession();
  const url=getBaseApiUrl();
  if(error||!data.session?.access_token)throw new Error('Your session expired. Sign in again.');
  if(!url)throw new Error('Base API is unavailable.');
  const response=await fetch(new URL(path,url),{...init,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token,...init.headers},signal:AbortSignal.timeout(20000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof body.message==='string'?body.message:'Request failed. Please retry.');
  return body as T;
}
