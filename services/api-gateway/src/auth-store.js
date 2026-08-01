const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const AUTH_FILE = process.env.AUTH_FILE || path.join(__dirname, '../data/auth.json');

async function loadAuthStore() {
    try {
        return JSON.parse(await fs.readFile(AUTH_FILE, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

async function saveAuthStore(store) {
    await fs.mkdir(path.dirname(AUTH_FILE), { recursive: true });
    const temporaryFile = `${AUTH_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.rename(temporaryFile, AUTH_FILE);
}

function derivePassword(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, key) => {
            if (error) reject(error);
            else resolve(key.toString('hex'));
        });
    });
}

function validatePassword(password) {
    if (String(password || '').length < 10) {
        throw new Error('Password must be at least 10 characters');
    }
}

async function assertLoginAvailable(actorId) {
    const store = await loadAuthStore();
    if (store[actorId]?.passwordHash) throw new Error(`Login ${actorId} already exists`);
}

async function createLogin(actorId, password, actor) {
    validatePassword(password);
    const store = await loadAuthStore();
    if (store[actorId]?.passwordHash) throw new Error(`Login ${actorId} already exists`);
    const salt = crypto.randomBytes(16).toString('hex');
    store[actorId] = {
        ...store[actorId],
        ...actor,
        actorId,
        salt,
        passwordHash: await derivePassword(password, salt)
    };
    delete store[actorId].resetTokenHash;
    delete store[actorId].resetExpiresAt;
    await saveAuthStore(store);
}

async function verifyLogin(actorId, password) {
    const login = (await loadAuthStore())[actorId];
    if (!login?.passwordHash) return null;
    const candidate = Buffer.from(await derivePassword(String(password || ''), login.salt), 'hex');
    const stored = Buffer.from(login.passwordHash, 'hex');
    return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored)
        ? login
        : null;
}

async function issueResetToken(actorId, actor) {
    const store = await loadAuthStore();
    const token = crypto.randomBytes(32).toString('base64url');
    store[actorId] = {
        ...actor,
        ...store[actorId],
        actorId,
        resetTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        resetExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    };
    await saveAuthStore(store);
    return token;
}

async function resetPassword(actorId, token, password) {
    validatePassword(password);
    const store = await loadAuthStore();
    const login = store[actorId];
    const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
    const provided = Buffer.from(tokenHash, 'hex');
    const stored = Buffer.from(login?.resetTokenHash || '', 'hex');
    const valid = stored.length > 0
        && provided.length === stored.length
        && crypto.timingSafeEqual(provided, stored)
        && Date.parse(login.resetExpiresAt) > Date.now();
    if (!valid) return false;
    const salt = crypto.randomBytes(16).toString('hex');
    login.salt = salt;
    login.passwordHash = await derivePassword(password, salt);
    delete login.resetTokenHash;
    delete login.resetExpiresAt;
    await saveAuthStore(store);
    return true;
}

module.exports = {
    AUTH_FILE,
    assertLoginAvailable,
    createLogin,
    issueResetToken,
    loadAuthStore,
    resetPassword,
    validatePassword,
    verifyLogin
};
