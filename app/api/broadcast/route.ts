import { authErrorResponse, requireMember } from "@/lib/api-auth";
import { sendPush } from "@/lib/push-server";

export async function POST(req: Request) {
  try {
    const actor = await requireMember(req, {
      admin: true,
      freshSeconds: 900,
      requireMfa: process.env.REQUIRE_ADMIN_MFA !== "false",
    });

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      message?: string;
      url?: string;
      test?: boolean;
    };
    const title = (body.title || "NoPostNow").trim().slice(0, 40);
    const message = (body.message || "").trim().slice(0, 160);
    if (!message) {
      return Response.json({ error: "empty message" }, { status: 400 });
    }
    const url = body.url && /^\/[^\s]*$/.test(body.url) ? body.url : "/feed";

    const result = await sendPush({
      targetUids: body.test ? [actor.uid] : undefined,
      preference: "post",
      payload: { title, body: message, url },
    });
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
