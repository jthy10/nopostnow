import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const credential = raw
    ? cert({
        ...JSON.parse(raw),
        private_key: JSON.parse(raw).private_key?.replace(/\\n/g, "\n"),
      })
    : applicationDefault();
  return initializeApp({ projectId, credential });
}

async function setRole(user, { admin }) {
  const auth = getAuth(adminApp());
  const claims = { ...(user.customClaims || {}) };
  delete claims.member;
  await auth.setCustomUserClaims(user.uid, {
    ...claims,
    admin,
  });
}

async function createUser() {
  const email = required("USER_EMAIL").toLowerCase();
  const password = required("USER_PASSWORD");
  const username = required("USER_NAME").slice(0, 24);
  const admin = process.env.USER_ADMIN === "true";
  if (password.length < 12) {
    throw new Error("USER_PASSWORD must be at least 12 characters.");
  }

  const auth = getAuth(adminApp());
  const user = await auth.createUser({
    email,
    password,
    displayName: username,
    emailVerified: true,
  });
  await setRole(user, { admin });
  await getFirestore(adminApp()).doc(`users/${email}`).set({
    uid: user.uid,
    username,
    createdAt: FieldValue.serverTimestamp(),
    joinedAt: FieldValue.serverTimestamp(),
  });
  console.log(`Created ${email} (${admin ? "administrator" : "member"}).`);
}

async function grantUser() {
  const email = required("USER_EMAIL").toLowerCase();
  const username = process.env.USER_NAME?.trim().slice(0, 24);
  const admin = process.env.USER_ADMIN === "true";
  const auth = getAuth(adminApp());
  const user = await auth.getUserByEmail(email);
  await setRole(user, { admin });
  await auth.updateUser(user.uid, { disabled: false, emailVerified: true });
  await getFirestore(adminApp())
    .doc(`users/${email}`)
    .set(
      {
        uid: user.uid,
        username: username || user.displayName || "Member",
        joinedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  console.log(`Enabled ${email}${admin ? " as an administrator" : ""}.`);
}

async function revokeUser() {
  const email = required("USER_EMAIL").toLowerCase();
  const auth = getAuth(adminApp());
  const user = await auth.getUserByEmail(email);
  await setRole(user, { admin: false });
  await auth.updateUser(user.uid, { disabled: true });
  console.log(`Revoked and disabled ${email}.`);
}

const command = process.argv[2];
if (!["create", "grant", "revoke"].includes(command)) {
  console.error("Usage: npm run users -- <create|grant|revoke>");
  process.exit(2);
}

await ({ create: createUser, grant: grantUser, revoke: revokeUser })[command]();
