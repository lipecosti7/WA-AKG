import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { ChatService } from "@/modules/whatsapp/chat.service";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden" }, { status: 403 });
        }

        // Get the database Session ID (cuid) from the sessionId string
        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { id: true }
        });

        if (!session) {
            return NextResponse.json({ status: false, message: "Session not found", error: 'Session not found' }, { status: 404 });
        }

        const dbSessionId = session.id;

        // Paginação opcional: ?limit=200&before=<ISO>&filter=all|private|groups (padrão: 50, como antes)
        const sp = request.nextUrl.searchParams;
        const limitParam = parseInt(sp.get("limit") || "", 10);
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 50;
        const before = sp.get("before") || undefined;
        const filterParam = sp.get("filter");
        const filter = filterParam === "private" || filterParam === "groups" || filterParam === "all" ? filterParam : undefined;

        const chatList = await ChatService.getChatsList(session.id, limit, before, undefined, filter);

        return NextResponse.json({ status: true, message: "Chats fetched successfully", data: chatList });
    } catch (error) {
        console.error("Chat API error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch chats", error: 'Failed to fetch chats' }, { status: 500 });
    }
}
