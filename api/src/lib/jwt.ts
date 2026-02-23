import fs from 'fs';
import { SignJWT, jwtVerify, importPKCS8, importSPKI, KeyLike } from 'jose';
import config from '../config';

let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

async function getPrivateKey(): Promise<KeyLike> {
    if (!_privateKey) {
        const pem = fs.readFileSync(config.jwt.privateKeyPath, 'utf8');
        _privateKey = await importPKCS8(pem, 'RS256');
    }
    return _privateKey;
}

async function getPublicKey(): Promise<KeyLike> {
    if (!_publicKey) {
        const pem = fs.readFileSync(config.jwt.publicKeyPath, 'utf8');
        _publicKey = await importSPKI(pem, 'RS256');
    }
    return _publicKey;
}

export interface JwtPayload {
    user_id: string;
    tier: string;
    org_id: string | null;
}

/**
 * Issues a 15-minute RS256 access token.
 * Payload: { sub: user_id, tier, org_id, iat, exp }
 */
export async function signAccessToken(payload: JwtPayload): Promise<string> {
    const privateKey = await getPrivateKey();
    return new SignJWT({
        tier: payload.tier,
        org_id: payload.org_id,
    })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject(payload.user_id)
        .setIssuedAt()
        .setExpirationTime(`${config.jwt.accessTokenTtl}s`)
        .sign(privateKey);
}

/**
 * Verifies an RS256 access token and returns the decoded payload.
 * Throws if invalid or expired.
 */
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
    const publicKey = await getPublicKey();
    const { payload } = await jwtVerify(token, publicKey, {
        algorithms: ['RS256'],
    });

    return {
        user_id: payload.sub as string,
        tier: payload['tier'] as string,
        org_id: payload['org_id'] as string | null,
    };
}
