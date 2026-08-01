import { TrustManagerContract } from './trustManagerContract';
import {
    IncidentContract,
    ParticipantTrustContract,
    ReputationContract,
    TrustPolicyContract
} from './contracts';

export { TrustManagerContract };
export { IncidentContract, ParticipantTrustContract, ReputationContract, TrustPolicyContract };
export const contracts = [
    TrustPolicyContract,
    ParticipantTrustContract,
    IncidentContract,
    ReputationContract
];
