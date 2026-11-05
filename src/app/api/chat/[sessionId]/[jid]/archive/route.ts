import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// PUT: Archive or unarchive chat
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid } = await params;
        const body = await request.json();
        const { archive } = body;

        if (archive === undefined) {
            return NextResponse.json({ status: false, message: "archive (boolean) is required", error: "archive (boolean) is required" }, { status: 400 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ status: false, message: "Session not ready", error: "Session not ready" }, { status: 503 });
        }

        const decodedJid = decodeURIComponent(jid);

        // O WhatsApp só aceita arquivar/desarquivar quando recebe a última mensagem da conversa
        const dbSession = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
        const last = dbSession
            ? await prisma.message.findFirst({
                where: { sessionId: dbSession.id, remoteJid: decodedJid },
                orderBy: { timestamp: "desc" },
                select: { keyId: true, fromMe: true, timestamp: true },
            })
            : null;
        const lastMessages = last
            ? [{ key: { remoteJid: decodedJid, id: last.keyId, fromMe: last.fromMe }, messageTimestamp: Math.floor(last.timestamp.getTime() / 1000) }]
            : [];
        await instance.socket.chatModify({ archive: archive, lastMessages }, decodedJid);

        return NextResponse.json({ 
            success: true,
            message: archive ? "Chat archived" : "Chat unarchived"
        });

    } catch (error) {
        console.error("Archive chat error:", error);
        return NextResponse.json({ status: false, message: "Failed to archive/unarchive chat", error: "Failed to archive/unarchive chat" }, { status: 500 });
    }
}
