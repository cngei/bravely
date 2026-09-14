import { NextResponse } from 'next/server';
import { appUrl, authError, beginLogin, checkOrigin, finishLogin, logout } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    if (action === 'login') return NextResponse.redirect(await beginLogin());
    if (action === 'callback') {
      const url = new URL('/auth/callback', appUrl());
      url.search = new URL(request.url).search;
      await finishLogin(url);
      return NextResponse.redirect(appUrl());
    }
    return new Response(null, { status: 404 });
  } catch (e) {
    return authError(e);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    checkOrigin(request);
    if ((await params).action !== 'logout') return new Response(null, { status: 404 });
    await logout();
    return NextResponse.redirect(appUrl(), 303);
  } catch (e) {
    return authError(e);
  }
}
