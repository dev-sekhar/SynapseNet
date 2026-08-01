#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { issueResetToken } = require('../backend-api-gateway/src/auth-store');

const projectRoot = path.resolve(__dirname, '..');

function composeArguments() {
    try {
        execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
        return { command: 'docker', prefix: ['compose'] };
    } catch {
        return { command: 'docker-compose', prefix: [] };
    }
}

function query(transactionName) {
    const compose = composeArguments();
    const output = execFileSync(compose.command, [
        ...compose.prefix,
        'exec', '-T', 'cli',
        'peer', 'chaincode', 'query',
        '-C', process.env.CHANNEL_NAME || 'synapsenet',
        '-n', process.env.CHAINCODE_NAME || 'skill-manager',
        '-c', JSON.stringify({ function: transactionName, Args: [] })
    ], { cwd: projectRoot, encoding: 'utf8' });
    return JSON.parse(output);
}

async function main() {
    const [command, actorId] = process.argv.slice(2);
    if (command !== 'issue-reset' || !actorId) {
        console.error('Usage: yarn auth:issue-reset <login-id>');
        process.exitCode = 2;
        return;
    }

    const users = query('getUsers');
    const enterprises = query('getEnterprises');
    const user = users.find((item) => item.userId === actorId);
    let actor;

    if (user) {
        actor = { role: 'user', displayName: user.displayName };
    } else {
        const enterprise = enterprises.find((item) => item.reviewers.includes(actorId));
        if (enterprise) {
            actor = {
                role: 'reviewer',
                displayName: actorId,
                enterpriseId: enterprise.enterpriseId
            };
        }
    }

    if (!actor) {
        throw new Error(`No ledger user or enterprise reviewer has login ID ${actorId}`);
    }

    const token = await issueResetToken(actorId, actor);
    console.log(`Password activation/reset token for ${actorId} (valid for 30 minutes):`);
    console.log(token);
    console.log('Share this token securely. It can be used only once.');
}

main().catch((error) => {
    console.error(`Unable to issue token: ${error.message}`);
    process.exitCode = 1;
});
