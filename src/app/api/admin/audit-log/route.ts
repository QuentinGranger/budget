import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, isAuthError } from '@/lib/rbac';
import { safeError } from '@/lib/logger';

// GET — paginated audit log (admin only)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole('admin');
    if (isAuthError(auth)) return auth;

    const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10), 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { name: true } } },
      }),
      prisma.auditLog.count(),
    ]);

    return NextResponse.json({ logs, total, page, limit });
  } catch (err) {
    safeError('GET /api/admin/audit-log', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
