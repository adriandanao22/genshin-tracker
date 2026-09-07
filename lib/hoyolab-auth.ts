import { constants, publicEncrypt } from "node:crypto";

/**
 * Server-side HoYoLAB auth helpers.
 *
 * Login flow (mirrors the official account.hoyolab.com web login):
 * 1. POST RSA-encrypted credentials to webLoginByPassword.
 * 2. If HoYoLAB answers retcode -3101, a geetest v3 captcha must be solved in
 *    the browser and the request retried with an `x-rpc-aigis` header.
 * 3. On success the `ltuid_v2` / `ltoken_v2` cookies arrive via Set-Cookie.
 */

const WEB_LOGIN_URL =
  "https://sg-public-api.hoyolab.com/account/ma-passport/api/webLoginByPassword";
const GAME_ROLES_URL =
  "https://api-os-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_global";

// Production key shipped inside the HoYoLAB app; credentials must be
// RSA-PKCS1-encrypted with it or the login endpoint rejects the request.
const LOGIN_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4PMS2JVMwBsOIrYWRluY
wEiFZL7Aphtm9z5Eu/anzJ09nB00uhW+ScrDWFECPwpQto/GlOJYCUwVM/raQpAj
/xvcjK5tNVzzK94mhk+j9RiQ+aWHaTXmOgurhxSp3YbwlRDvOgcq5yPiTz0+kSeK
ZJcGeJ95bvJ+hJ/UMP0Zx2qB5PElZmiKvfiNqVUk8A8oxLJdBB5eCpqWV6CUqDKQ
KSQP4sM0mZvQ1Sr4UcACVcYgYnCbTZMWhJTWkrNXqI8TMomekgny3y+d6NX/cFa6
6jozFIF4HCX5aW8bp8C8vq2tFvFbleQ/Q3CU56EWWKMrOcpmFtRmC18s9biZBVR/
8QIDAQAB
-----END PUBLIC KEY-----`;

export const serverByRegion: Record<string, string> = {
  os_usa: "America",
  os_euro: "Europe",
  os_asia: "Asia",
  os_cht: "TW, HK, MO",
};

export type GeetestChallenge = {
  session_id: string;
  gt: string;
  challenge: string;
  new_captcha: number;
  success: number;
};

export type GeetestResult = {
  session_id: string;
  geetest_challenge: string;
  geetest_validate: string;
  geetest_seccode: string;
};

export type WebLoginOutcome =
  | { status: "captcha"; captcha: GeetestChallenge }
  | { status: "error"; retcode: number; message: string }
  | { status: "ok"; ltuid: string; ltoken: string };

function encryptCredential(text: string) {
  return publicEncrypt(
    { key: LOGIN_RSA_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(text, "utf8"),
  ).toString("base64");
}

function parseSetCookies(response: Response) {
  const jar: Record<string, string> = {};
  const lines = response.headers.getSetCookie?.() ?? [];
  for (const line of lines) {
    const [pair] = line.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0)
      jar[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return jar;
}

export async function webLoginByPassword(
  account: string,
  password: string,
  deviceId: string,
  mmtResult?: GeetestResult,
): Promise<WebLoginOutcome> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-rpc-app_id": "c9oqaq3s3gu8",
    "x-rpc-client_type": "4",
    "x-rpc-device_id": deviceId,
    // Anything else returns retcode 1200 [Unauthorized].
    Origin: "https://account.hoyolab.com",
    Referer: "https://account.hoyolab.com/",
  };
  if (mmtResult) {
    const { session_id, ...validation } = mmtResult;
    headers["x-rpc-aigis"] =
      `${session_id};${Buffer.from(JSON.stringify(validation)).toString("base64")}`;
  }

  const response = await fetch(WEB_LOGIN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      account: encryptCredential(account),
      password: encryptCredential(password),
      token_type: 6,
    }),
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    retcode?: number;
    message?: string;
    data?: { stoken?: string } | null;
  };

  if (payload.retcode === -3101) {
    const aigisHeader = response.headers.get("x-rpc-aigis");
    if (aigisHeader) {
      const aigis = JSON.parse(aigisHeader) as {
        session_id: string;
        data: string;
      };
      const challenge = JSON.parse(aigis.data) as {
        gt: string;
        challenge: string;
        new_captcha?: number;
        success?: number;
      };
      return {
        status: "captcha",
        captcha: {
          session_id: aigis.session_id,
          gt: challenge.gt,
          challenge: challenge.challenge,
          new_captcha: challenge.new_captcha ?? 1,
          success: challenge.success ?? 1,
        },
      };
    }
    return {
      status: "error",
      retcode: -3101,
      message: "HoYoLAB requested a captcha but sent no challenge data.",
    };
  }

  if (payload.retcode !== 0) {
    return {
      status: "error",
      retcode: payload.retcode ?? -1,
      message: payload.message ?? "Unknown HoYoLAB error",
    };
  }

  const jar = parseSetCookies(response);
  const ltuid = jar.ltuid_v2 ?? jar.ltuid;
  const ltoken = jar.ltoken_v2 ?? jar.ltoken;
  if (!ltuid || !ltoken) {
    return {
      status: "error",
      retcode: 0,
      message: "Login succeeded but HoYoLAB returned no session cookies.",
    };
  }
  return { status: "ok", ltuid, ltoken };
}

export type GenshinRole = {
  uid: string;
  server: string;
  nickname: string;
  level: number;
};

export type GameRolesOutcome =
  | { status: "error"; retcode: number; message: string }
  | { status: "ok"; role: GenshinRole };

/** Look up the Genshin account bound to a HoYoLAB session. */
export async function fetchGenshinRole(
  ltuid: string,
  ltoken: string,
): Promise<GameRolesOutcome> {
  const response = await fetch(GAME_ROLES_URL, {
    headers: {
      Cookie: `ltuid_v2=${ltuid}; ltoken_v2=${ltoken}`,
      "User-Agent": "Mozilla/5.0 OrbitalAtlas/0.1",
    },
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    retcode?: number;
    message?: string;
    data?: {
      list?: Array<{
        game_uid?: string;
        region?: string;
        nickname?: string;
        level?: number;
        is_chosen?: boolean;
      }>;
    } | null;
  };

  if (payload.retcode !== 0) {
    return {
      status: "error",
      retcode: payload.retcode ?? -1,
      message: payload.message ?? "Unknown HoYoLAB error",
    };
  }

  const roles = payload.data?.list ?? [];
  const role =
    roles.find((item) => item.is_chosen) ??
    [...roles].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];

  if (!role?.game_uid) {
    return {
      status: "error",
      retcode: 0,
      message: "No Genshin Impact account is bound to this HoYoLAB account.",
    };
  }
  return {
    status: "ok",
    role: {
      uid: role.game_uid,
      server: serverByRegion[role.region ?? ""] ?? role.region ?? "Unknown",
      nickname: role.nickname || "Traveler",
      level: role.level ?? 1,
    },
  };
}
