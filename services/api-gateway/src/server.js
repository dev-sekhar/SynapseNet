const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const express = require('express');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { z } = require('zod');
const {
    assertLoginAvailable,
    createLogin,
    issueResetToken,
    resetPassword,
    validatePassword,
    verifyLogin
} = require('./auth-store');
const { AppError, errorHandler, notFound, validate } = require('./http-errors');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '../../..');
const WEB3_DIST = path.join(ROOT, 'apps', 'web', 'dist');
const LANDING_ROOT = path.join(ROOT, 'services', 'api-gateway', 'public');
const CRYPTO_ROOT = path.join(ROOT, 'blockchain', 'network', 'crypto-config');
const CREDENTIAL_CHANNEL_NAME = process.env.CREDENTIAL_CHANNEL_NAME ||
    process.env.SKILL_CHANNEL_NAME || process.env.CHANNEL_NAME || 'synapsenet';
const TRUST_CHANNEL_NAME = process.env.TRUST_CHANNEL_NAME ||
    process.env.CHANNEL_NAME || 'synapsenet';
const CHAINCODE_NAME = process.env.CHAINCODE_NAME || 'skill-manager';
const TRUST_CHAINCODE_NAME = process.env.TRUST_CHAINCODE_NAME || 'trust-manager';
const TRUST_MSP_ID = process.env.TRUST_MSP_ID || 'Org1MSP';
const PEER_ENDPOINT = process.env.PEER_ENDPOINT || 'localhost:7051';
const PEER_HOST_ALIAS = process.env.PEER_HOST_ALIAS || 'peer0.org1.synapsenet.com';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const CREDENTIAL_CONTRACTS = new Map([
    ['InitLedger', 'SynapseNet.IdentityContract'],
    ...['registerUser', 'registerEnterprise', 'addEnterpriseReviewer', 'getUsers', 'getEnterprises']
        .map((transaction) => [transaction, 'SynapseNet.IdentityContract']),
    ...['submitCredentialRequest', 'reviewCredentialRequest', 'getCredentialRequests', 'getWallet', 'getIssuedCredentials']
        .map((transaction) => [transaction, 'SynapseNet.CredentialContract']),
    ...['openWallet', 'getWalletAccount', 'getTokenTransactions']
        .map((transaction) => [transaction, 'SynapseNet.WalletContract']),
    ...['createShareGrant', 'revokeShareGrant', 'getShareGrant', 'getSharedCredentials']
        .map((transaction) => [transaction, 'SynapseNet.SharingContract'])
]);
const TRUST_CONTRACTS = new Map([
    ...['initializePolicy', 'activatePolicy', 'getActivePolicy']
        .map((transaction) => [transaction, 'SynapseNet.TrustPolicyContract']),
    ...['registerParticipant', 'getParticipant']
        .map((transaction) => [transaction, 'SynapseNet.ParticipantTrustContract']),
    ...['reportIncident', 'decideIncident', 'respondToIncident', 'appealIncident', 'finalizeIncident', 'getIncident', 'getCredentialTrustStatus']
        .map((transaction) => [transaction, 'SynapseNet.IncidentContract']),
    ['awardReputation', 'SynapseNet.ReputationContract']
]);

const utf8Decoder = new TextDecoder();
let gatewayConnection;
let gatewayConnectionPromise;

async function firstFile(directory) {
    const entries = await fs.readdir(directory);
    if (entries.length === 0) {
        throw new Error(`No identity material found in ${directory}`);
    }
    return path.join(directory, entries[0]);
}

async function newGatewayConnection() {
    const userMsp = path.join(
        CRYPTO_ROOT,
        'peerOrganizations/org1.synapsenet.com/users/Admin@org1.synapsenet.com/msp'
    );
    const peerTlsCert = path.join(
        CRYPTO_ROOT,
        'peerOrganizations/org1.synapsenet.com/peers/peer0.org1.synapsenet.com/tls/ca.crt'
    );
    const [credentials, privateKeyPem, tlsRootCert] = await Promise.all([
        fs.readFile(await firstFile(path.join(userMsp, 'signcerts'))),
        fs.readFile(await firstFile(path.join(userMsp, 'keystore'))),
        fs.readFile(peerTlsCert)
    ]);

    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const client = new grpc.Client(
        PEER_ENDPOINT,
        grpc.credentials.createSsl(tlsRootCert),
        { 'grpc.ssl_target_name_override': PEER_HOST_ALIAS }
    );
    const gateway = connect({
        client,
        identity: { mspId: 'Org1MSP', credentials },
        signer: signers.newPrivateKeySigner(privateKey),
        hash: hash.sha256,
        evaluateOptions: () => ({ deadline: Date.now() + 5_000 }),
        endorseOptions: () => ({ deadline: Date.now() + 15_000 }),
        submitOptions: () => ({ deadline: Date.now() + 5_000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60_000 })
    });
    return {
        client,
        gateway,
        credentialNetwork: gateway.getNetwork(CREDENTIAL_CHANNEL_NAME),
        trustNetwork: gateway.getNetwork(TRUST_CHANNEL_NAME)
    };
}

async function networks() {
    if (!gatewayConnection) {
        if (!gatewayConnectionPromise) {
            gatewayConnectionPromise = newGatewayConnection();
        }
        try {
            gatewayConnection = await gatewayConnectionPromise;
        } finally {
            gatewayConnectionPromise = undefined;
        }
    }
    return gatewayConnection;
}

async function contract(transactionName) {
    const smartContract = CREDENTIAL_CONTRACTS.get(transactionName);
    if (!smartContract) throw new Error(`No credential contract owns ${transactionName}`);
    return (await networks()).credentialNetwork.getContract(CHAINCODE_NAME, smartContract);
}

async function trustContract(transactionName) {
    const smartContract = TRUST_CONTRACTS.get(transactionName);
    if (!smartContract) throw new Error(`No trust contract owns ${transactionName}`);
    return (await networks()).trustNetwork.getContract(TRUST_CHAINCODE_NAME, smartContract);
}

function decode(result) {
    const text = utf8Decoder.decode(result);
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function evaluate(transactionName, ...args) {
    return decode(await (await contract(transactionName)).evaluateTransaction(transactionName, ...args));
}

async function submit(transactionName, ...args) {
    return utf8Decoder.decode(
        await (await contract(transactionName)).submitTransaction(transactionName, ...args)
    );
}

async function submitTrust(transactionName, ...args) {
    return utf8Decoder.decode(
        await (await trustContract(transactionName)).submitTransaction(transactionName, ...args)
    );
}

async function evaluateTrust(transactionName, ...args) {
    return decode(
        await (await trustContract(transactionName)).evaluateTransaction(transactionName, ...args)
    );
}

function requireAuth(role) {
    return (request, _response, next) => {
        if (!request.session.actor) {
            return next(new AppError(401, 'Authentication Required', 'Sign in to continue.'));
        }
        if (role && request.session.actor.role !== role) {
            return next(new AppError(403, 'Forbidden', `${role} access is required.`));
        }
        next();
    };
}

const idSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:@-]*$/);
const passwordSchema = z.string().min(10).max(256);
const loginSchema = z.object({
    body: z.object({ actorId: idSchema, password: z.string().min(1).max(256) }),
    params: z.any(),
    query: z.any()
});
const resetSchema = z.object({
    body: z.object({ actorId: idSchema, token: z.string().min(20), password: passwordSchema }),
    params: z.any(),
    query: z.any()
});
const resetRequestSchema = z.object({
    body: z.object({ actorId: idSchema }),
    params: z.any(),
    query: z.any()
});
const userSchema = z.object({
    body: z.object({
        userId: idSchema,
        displayName: z.string().trim().min(1).max(160),
        password: passwordSchema
    }),
    params: z.any(),
    query: z.any()
});
const enterpriseSchema = z.object({
    body: z.object({
        enterpriseId: idSchema,
        name: z.string().trim().min(1).max(160),
        reviewerId: idSchema,
        reviewerName: z.string().trim().min(1).max(160),
        password: passwordSchema
    }),
    params: z.any(),
    query: z.any()
});
const signedIntentSchema = z.object({
    intent: z.object({
        domain: z.literal('SynapseNet'),
        version: z.literal('1'),
        action: z.string(),
        actorId: idSchema,
        walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        payloadHash: z.string().regex(/^sha256:[a-fA-F0-9]{64}$/),
        nonce: idSchema,
        expiresAt: z.number().int().positive()
    }),
    signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/)
});
const trustLinkSchema = z.object({
    body: signedIntentSchema,
    params: z.any(),
    query: z.any()
});
const incidentSchema = z.object({
    body: signedIntentSchema.extend({
        incident: z.object({
            incidentId: idSchema,
            accusedActorId: idSchema,
            credentialId: idSchema.optional(),
            allegationHash: z.string().regex(/^sha256:[a-fA-F0-9]{64}$/)
        })
    }),
    params: z.any(),
    query: z.any()
});

const app = express();
app.set('trust proxy', 1);
app.use(pinoHttp({
    redact: {
        paths: [
            'req.headers.cookie',
            'req.body.password',
            'req.body.token',
            'res.headers["set-cookie"]'
        ],
        censor: '[REDACTED]'
    },
    genReqId: (request) => request.headers['x-request-id'] || crypto.randomUUID()
}));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            // Material UI/Emotion generates scoped <style> elements at runtime.
            // Scripts remain self-only; this exception is limited to CSS.
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: [
                "'self'",
                'http://localhost:8000',
                'http://127.0.0.1:8000'
            ],
            upgradeInsecureRequests: null
        }
    }
}));
app.use(express.json({ limit: '32kb' }));
app.use(session({
    name: 'synapsenet.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 8 * 60 * 60 * 1000
    }
}));
app.get('/vendor/axios.min.js', (_request, response) => {
    response.sendFile(path.join(
        path.dirname(require.resolve('axios/package.json')),
        'dist/axios.min.js'
    ));
});
app.use(express.static(LANDING_ROOT, { index: false }));
app.use(express.static(WEB3_DIST, { index: false }));

app.get('/', (request, response) => {
    const page = request.session.actor
        ? path.join(WEB3_DIST, 'index.html')
        : path.join(LANDING_ROOT, 'landing.html');
    response.sendFile(page);
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        type: 'about:blank',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Too many authentication attempts. Try again later.'
    }
});

app.get('/api/health', async (_request, response, next) => {
    try {
        const [users, enterprises, requests] = await Promise.all([
            evaluate('getUsers'),
            evaluate('getEnterprises'),
            evaluate('getCredentialRequests')
        ]);
        response.json({
            ok: true,
            channels: {
                credentials: CREDENTIAL_CHANNEL_NAME,
                trust: TRUST_CHANNEL_NAME
            },
            chaincode: CHAINCODE_NAME,
            userCount: users.length,
            enterpriseCount: enterprises.length,
            requestCount: requests.length
        });
    } catch (error) {
        gatewayConnection?.gateway.close();
        gatewayConnection?.client.close();
        gatewayConnection = undefined;
        next(error);
    }
});

app.get('/api/session', (request, response) => {
    response.json({ actor: request.session.actor || null });
});

app.post('/api/login', authLimiter, validate(loginSchema), async (request, response, next) => {
    try {
        const { actorId, password } = request.validated.body;
        const login = await verifyLogin(actorId, password);
        if (!login) {
            throw new AppError(401, 'Authentication Failed', 'Invalid login or password.');
        }
        request.session.actor = {
            actorId: login.actorId,
            role: login.role,
            displayName: login.displayName,
            enterpriseId: login.enterpriseId
        };
        response.json({ actor: request.session.actor });
    } catch (error) {
        next(error);
    }
});

app.post('/api/password/reset', authLimiter, validate(resetSchema), async (request, response, next) => {
    try {
        const { actorId, token, password } = request.validated.body;
        if (!await resetPassword(actorId, token, password)) {
            throw new AppError(
                400,
                'Invalid Reset Token',
                'The activation/reset token is invalid or has expired.'
            );
        }
        response.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.post(
    '/api/password/request',
    authLimiter,
    validate(resetRequestSchema),
    async (request, response, next) => {
        try {
            if (process.env.NODE_ENV === 'production') {
                throw new AppError(
                    503,
                    'Reset Delivery Not Configured',
                    'Configure verified email, SMS, or identity-provider delivery before enabling self-service password resets.'
                );
            }
            const { actorId } = request.validated.body;
            const [users, enterprises] = await Promise.all([
                evaluate('getUsers'),
                evaluate('getEnterprises')
            ]);
            const user = users.find((item) => item.userId === actorId);
            const enterprise = enterprises.find((item) => item.reviewers.includes(actorId));
            if (!user && !enterprise) {
                throw new AppError(
                    404,
                    'Login Not Found',
                    'No registered user or enterprise reviewer has that login ID.'
                );
            }
            const token = await issueResetToken(actorId, user
                ? { role: 'user', displayName: user.displayName }
                : {
                    role: 'reviewer',
                    displayName: actorId,
                    enterpriseId: enterprise.enterpriseId
                });
            response.json({
                message: 'Development reset token issued. It expires in 30 minutes.',
                developmentToken: token,
                expiresInSeconds: 1800
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post('/api/logout', (request, response, next) => {
    request.session.destroy((error) => {
        if (error) next(error);
        else response.status(204).end();
    });
});

app.post('/api/users', validate(userSchema), async (request, response, next) => {
    try {
        const { userId, displayName, password } = request.validated.body;
        validatePassword(password);
        await assertLoginAvailable(userId);
        const id = await submit('registerUser', userId, displayName);
        await createLogin(id, password, {
            role: 'user',
            displayName
        });
        response.status(201).json({ userId: id });
    } catch (error) {
        next(error);
    }
});

app.post('/api/enterprises', validate(enterpriseSchema), async (request, response, next) => {
    try {
        const { enterpriseId, name, reviewerId, reviewerName, password } =
            request.validated.body;
        validatePassword(password);
        await assertLoginAvailable(reviewerId);
        const id = await submit(
            'registerEnterprise',
            enterpriseId,
            name,
            reviewerId
        );
        await createLogin(reviewerId, password, {
            role: 'reviewer',
            displayName: reviewerName,
            enterpriseId: id
        });
        response.status(201).json({ enterpriseId: id });
    } catch (error) {
        next(error);
    }
});

app.post('/api/trust/link', requireAuth(), validate(trustLinkSchema), async (request, response, next) => {
    try {
        const actor = request.session.actor;
        const actorType = actor.role === 'reviewer' ? 'reviewer' : 'user';
        const { intent, signature } = request.validated.body;
        if (intent.actorId !== actor.actorId || intent.action !== 'registerParticipant') {
            throw new AppError(403, 'Intent Mismatch', 'The signed intent does not match this session.');
        }
        const actorId = await submitTrust(
            'registerParticipant',
            actor.actorId,
            actorType,
            intent.walletAddress,
            TRUST_MSP_ID,
            JSON.stringify(intent),
            signature
        );
        response.status(201).json({
            actorId,
            walletAddress: intent.walletAddress.toLowerCase(),
            authoritativeMspId: TRUST_MSP_ID
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/trust/profile', requireAuth(), async (request, response, next) => {
    try {
        response.json(await evaluateTrust(
            'getParticipant', request.session.actor.actorId
        ));
    } catch (error) {
        next(error);
    }
});

app.post('/api/trust/incidents', requireAuth(), validate(incidentSchema), async (request, response, next) => {
    try {
        const actorId = request.session.actor.actorId;
        const { incident, intent, signature } = request.validated.body;
        if (intent.actorId !== actorId || intent.action !== 'reportIncident') {
            throw new AppError(403, 'Intent Mismatch', 'The signed intent does not match this session.');
        }
        const incidentId = await submitTrust(
            'reportIncident',
            JSON.stringify({ ...incident, reporterActorId: actorId }),
            JSON.stringify(intent),
            signature
        );
        response.status(201).json({ incidentId });
    } catch (error) {
        next(error);
    }
});

app.use('/api', notFound);
app.get('/{*splat}', (_request, response) => {
    response.redirect('/');
});
app.use(errorHandler);

const server = app.listen(PORT, HOST, (error) => {
    if (error) throw error;
    console.log(`SynapseNet test UI listening on ${HOST}:${PORT}`);
});

function shutdown() {
    gatewayConnection?.gateway.close();
    gatewayConnection?.client.close();
    server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
