const assert = require('node:assert/strict');
const test = require('node:test');
const { contracts } = require('../dist');

test('credential chaincode exposes cohesive smart-contract boundaries', () => {
    assert.deepEqual(
        contracts.map((ContractType) => new ContractType().getName()),
        [
            'SynapseNet.IdentityContract',
            'SynapseNet.CredentialContract',
            'SynapseNet.WalletContract',
            'SynapseNet.TokenContract',
            'SynapseNet.SharingContract'
        ]
    );
});
