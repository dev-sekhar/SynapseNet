const assert = require('node:assert/strict');
const test = require('node:test');
const { contracts } = require('../dist');

test('trust chaincode exposes cohesive smart-contract boundaries', () => {
    assert.deepEqual(
        contracts.map((ContractType) => new ContractType().getName()),
        [
            'SynapseNet.TrustPolicyContract',
            'SynapseNet.ParticipantTrustContract',
            'SynapseNet.IncidentContract',
            'SynapseNet.ReputationContract'
        ]
    );
});
