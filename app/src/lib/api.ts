import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Demo mode runs the real database code inside the browser (no server). */
export const DEMO = import.meta.env.VITE_DEMO === '1' || !URL || !KEY;

let client: SupabaseClient | null = null;

export class ApiError extends Error {
  code: string;
  network: boolean;
  constructor(code: string, network = false) {
    super(code);
    this.code = code;
    this.network = network;
  }
}

function extractCode(m: string) {
  const x = m.match(/\b[A-Z][A-Z_]{3,}\b/);
  return x ? x[0] : m;
}

export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (DEMO) {
    const { demoRpc } = await import('./demo');
    try {
      return (await demoRpc(fn, args)) as T;
    } catch (e: any) {
      throw new ApiError(extractCode(String(e?.message ?? e)));
    }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('OFFLINE', true);
  client ??= createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  let res;
  try {
    res = await client.rpc(fn, args);
  } catch {
    throw new ApiError('NETWORK', true);
  }
  if (res.error) {
    const m = res.error.message || '';
    if (!res.error.code && /fetch|network|load failed|timeout/i.test(m)) throw new ApiError('NETWORK', true);
    throw new ApiError(extractCode(m));
  }
  return res.data as T;
}

const MESSAGES: Record<string, string> = {
  CODE_NOT_FOUND: 'هذا الرمز غير صحيح. تأكد من كتابته كما استلمته.',
  CODE_DISABLED: 'تم إيقاف هذا الرمز. تواصل مع المسؤول.',
  CODE_EXPIRED: 'انتهت صلاحية هذا الرمز. تواصل مع المسؤول لتجديده.',
  DEVICE_LIMIT: 'هذا الرمز مستخدم على العدد الأقصى من الأجهزة. اطلب من المسؤول إعادة تعيين الأجهزة.',
  SESSION_INVALID: 'تم تسجيل خروج هذا الجهاز. أدخل رمزك من جديد.',
  WRONG_PASSWORD: 'كلمة المرور غير صحيحة.',
  PASSWORD_TOO_SHORT: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.',
  ADMIN_SESSION_INVALID: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
  NETWORK: 'لا يوجد اتصال بالإنترنت. حاول مرة أخرى بعد الاتصال.',
  OFFLINE: 'لا يوجد اتصال بالإنترنت. حاول مرة أخرى بعد الاتصال.',
};

export function errorText(e: unknown) {
  const code = e instanceof ApiError ? e.code : String((e as any)?.message ?? e);
  return MESSAGES[code] ?? 'حدث خطأ غير متوقع: ' + code;
}
