import { authErrorResponse, ApiAuthError, requireMember } from "@/lib/api-auth";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { extractMentionUids } from "@/lib/mentions";
import { sendPush } from "@/lib/push-server";

type EventType = "post" | "comment" | "like" | "dm" | "commentLike";
type EventBody = {
  type?: EventType;
  postId?: string;
  commentId?: string;
  threadId?: string;
};

const EVENT_TYPES = new Set<EventType>(["post", "comment", "like", "dm", "commentLike"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

async function enforceRateLimit(uid: string) {
  const db = getAdminFirestore();
  const ref = db.doc(`_serverRateLimits/notify-${uid}`);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as { startedAt?: number; count?: number } | undefined;
    const startedAt = typeof data?.startedAt === "number" ? data.startedAt : 0;
    const count = typeof data?.count === "number" ? data.count : 0;

    if (now - startedAt < 60_000) {
      if (count >= 60) throw new ApiAuthError("rate limit exceeded", 429);
      transaction.set(ref, { startedAt, count: count + 1 });
    } else {
      transaction.set(ref, { startedAt: now, count: 1 });
    }
  });
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > 16_384) {
      return Response.json({ error: "request too large" }, { status: 413 });
    }

    const actor = await requireMember(req);
    await enforceRateLimit(actor.uid);

    const body = (await req.json().catch(() => null)) as EventBody | null;
    if (!body?.type || !EVENT_TYPES.has(body.type)) {
      return Response.json({ error: "invalid event" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const profile = actor.email
      ? await db.doc(`users/${actor.email}`).get()
      : null;
    const username = profile?.data()?.username;
    if (!profile?.exists || typeof username !== "string" || !username.trim()) {
      throw new ApiAuthError("member profile required", 403);
    }
    if (profile.data()?.muted === true && ["post", "comment"].includes(body.type)) {
      throw new ApiAuthError("member is muted", 403);
    }

    if (body.type === "post") {
      if (!validId(body.postId)) {
        return Response.json({ error: "invalid post" }, { status: 400 });
      }
      const post = await db.doc(`photos/${body.postId}`).get();
      const postData = post.data();
      if (!post.exists || postData?.userUUID !== actor.uid || postData?.deleted === true) {
        throw new ApiAuthError("forbidden", 403);
      }
      const caption = typeof postData.caption === "string" ? postData.caption.slice(0, 70) : "";
      const result = await sendPush({
        preference: "post",
        excludeUid: actor.uid,
        payload: {
          title: "NoPostNow",
          body: caption
            ? `${username} just posted — “${caption}”`
            : `${username} just posted`,
          url: `/p/${body.postId}`,
        },
      });
      return Response.json(result);
    }

    if (body.type === "like") {
      if (!validId(body.postId)) {
        return Response.json({ error: "invalid post" }, { status: 400 });
      }
      const post = await db.doc(`photos/${body.postId}`).get();
      const postData = post.data();
      const likedBy = Array.isArray(postData?.likedBy) ? postData.likedBy : [];
      if (!post.exists || !likedBy.includes(actor.uid)) {
        throw new ApiAuthError("forbidden", 403);
      }
      const targetUid = typeof postData?.userUUID === "string" ? postData.userUUID : "";
      const result = await sendPush({
        targetUids: [targetUid],
        excludeUid: actor.uid,
        preference: "like",
        payload: {
          title: "NoPostNow",
          body: `${username} liked your photo`,
          url: `/p/${body.postId}`,
        },
      });
      return Response.json(result);
    }

    if (body.type === "comment" || body.type === "commentLike") {
      if (!validId(body.postId) || !validId(body.commentId)) {
        return Response.json({ error: "invalid comment" }, { status: 400 });
      }
      const [post, comment] = await Promise.all([
        db.doc(`photos/${body.postId}`).get(),
        db.doc(`photos/${body.postId}/comments/${body.commentId}`).get(),
      ]);
      if (!post.exists || !comment.exists) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      const commentData = comment.data()!;

      if (body.type === "commentLike") {
        const likedBy = Array.isArray(commentData.likedBy) ? commentData.likedBy : [];
        if (!likedBy.includes(actor.uid)) throw new ApiAuthError("forbidden", 403);
        const targetUid =
          typeof commentData.userUUID === "string" ? commentData.userUUID : "";
        const result = await sendPush({
          targetUids: [targetUid],
          excludeUid: actor.uid,
          preference: "like",
          payload: {
            title: "NoPostNow",
            body: `${username} liked your comment`,
            url: `/p/${body.postId}?comments=1`,
          },
        });
        return Response.json(result);
      }

      if (commentData.userUUID !== actor.uid) {
        throw new ApiAuthError("forbidden", 403);
      }
      const text = typeof commentData.text === "string" ? commentData.text.slice(0, 200) : "";
      const [comments, users] = await Promise.all([
        db.collection(`photos/${body.postId}/comments`).get(),
        db.collection("users").get(),
      ]);
      const knownUsers = users.docs
        .map((doc) => doc.data())
        .filter(
          (value): value is { uid: string; username: string } =>
            typeof value.uid === "string" && typeof value.username === "string",
        );
      const mentionTargets = extractMentionUids(text, knownUsers).filter(
        (uid) => uid !== actor.uid,
      );
      const mentionSet = new Set(mentionTargets);
      const participantTargets = [
        post.data()?.userUUID,
        ...comments.docs.map((doc) => doc.data().userUUID),
      ].filter(
        (uid): uid is string =>
          typeof uid === "string" &&
          uid !== actor.uid &&
          !mentionSet.has(uid),
      );

      const [commentResult, mentionResult] = await Promise.all([
        sendPush({
          targetUids: [...new Set(participantTargets)],
          excludeUid: actor.uid,
          preference: "comment",
          payload: {
            title: "NoPostNow",
            body: text
              ? `${username} commented: “${text.slice(0, 90)}”`
              : `${username} commented on a post`,
            url: `/p/${body.postId}?comments=1`,
          },
        }),
        sendPush({
          targetUids: mentionTargets,
          excludeUid: actor.uid,
          preference: "comment",
          payload: {
            title: "NoPostNow",
            body: `${username} mentioned you: “${text.slice(0, 90)}”`,
            url: `/p/${body.postId}?comments=1`,
          },
        }),
      ]);
      return Response.json({
        sent: commentResult.sent + mentionResult.sent,
        stale: commentResult.stale + mentionResult.stale,
        configured: commentResult.configured && mentionResult.configured,
      });
    }

    if (!validId(body.threadId)) {
      return Response.json({ error: "invalid thread" }, { status: 400 });
    }
    const thread = await db.doc(`dms/${body.threadId}`).get();
    const threadData = thread.data();
    const uids = Array.isArray(threadData?.uids) ? threadData.uids : [];
    if (
      !thread.exists ||
      !uids.includes(actor.uid) ||
      threadData?.lastFrom !== actor.uid
    ) {
      throw new ApiAuthError("forbidden", 403);
    }
    const targetUid = uids.find((uid) => uid !== actor.uid);
    const text = typeof threadData?.lastText === "string" ? threadData.lastText.slice(0, 120) : "";
    const result = await sendPush({
      targetUids: targetUid ? [targetUid] : [],
      excludeUid: actor.uid,
      preference: "dm",
      payload: {
        title: "NoPostNow",
        body: text ? `${username}: ${text}` : `New message from ${username}`,
        url: `/dm/${body.threadId}`,
        tag: `dm-${body.threadId}`,
      },
    });
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
