from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AnyHttpUrl, BaseModel, Field, StringConstraints

EthereumAddress = Annotated[str, StringConstraints(pattern=r"^0x[a-fA-F0-9]{40}$")]
Identifier = Annotated[
    str, StringConstraints(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:@-]{0,127}$")
]


class WalletChallengeRequest(BaseModel):
    address: EthereumAddress


class WalletChallengeResponse(BaseModel):
    message: str
    expires_in_seconds: int


class WalletVerifyRequest(BaseModel):
    address: EthereumAddress
    signature: Annotated[str, StringConstraints(pattern=r"^0x[a-fA-F0-9]{130}$")]


class WalletSession(BaseModel):
    address: EthereumAddress
    verified: bool = True


class SignedIntent(BaseModel):
    domain: str = "SynapseNet"
    version: str = "1"
    action: str
    actorId: str
    walletAddress: EthereumAddress
    payloadHash: Annotated[str, StringConstraints(pattern=r"^sha256:[a-fA-F0-9]{64}$")]
    nonce: str
    expiresAt: int


class WalletLinkRequest(BaseModel):
    intent: SignedIntent
    signature: Annotated[str, StringConstraints(pattern=r"^0x[a-fA-F0-9]{130}$")]


class WalletLinkResponse(BaseModel):
    actorId: str
    walletAddress: EthereumAddress
    authoritativeMspId: str


class ProductionIdentityBindingRequest(BaseModel):
    actorId: Identifier
    walletAddress: EthereumAddress
    fabricMspId: Annotated[
        str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9]{2,63}MSP$")
    ]


class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str
    request_id: str | None = Field(default=None, alias="requestId")


class OrganizationApplicationRequest(BaseModel):
    legalName: Annotated[str, StringConstraints(min_length=2, max_length=240)]
    displayName: Annotated[str, StringConstraints(min_length=2, max_length=160)]
    jurisdiction: Annotated[str, StringConstraints(min_length=2, max_length=120)]
    registrationNumber: Annotated[str, StringConstraints(min_length=2, max_length=160)]
    requestedMspId: Annotated[
        str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9]{2,63}MSP$")
    ]
    requestedDomain: Annotated[
        str,
        StringConstraints(
            min_length=4,
            max_length=253,
            pattern=r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$",
        ),
    ]


class OrganizationApplicationResponse(BaseModel):
    applicationId: str
    status: str


class OrganizationDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    reason: Annotated[str, StringConstraints(min_length=3, max_length=2000)]
    governanceReference: Identifier
    joinTrustChannel: bool = False
    reviewerIds: list[Identifier] = Field(default_factory=list)


class OrganizationDecisionResponse(BaseModel):
    applicationId: str
    status: str
    provisioningManifest: dict[str, Any] | None = None


class IncidentReportRequest(BaseModel):
    incidentId: str
    accusedActorId: str
    credentialId: str | None = None
    allegationHash: Annotated[str, StringConstraints(pattern=r"^sha256:[a-fA-F0-9]{64}$")]
    intent: SignedIntent
    signature: Annotated[str, StringConstraints(pattern=r"^0x[a-fA-F0-9]{130}$")]


class IncidentAppealRequest(BaseModel):
    intent: SignedIntent
    signature: Annotated[str, StringConstraints(pattern=r"^0x[a-fA-F0-9]{130}$")]


class EvidenceRequest(BaseModel):
    evidenceId: Identifier
    documentType: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    fileName: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    contentHash: Annotated[
        str, StringConstraints(pattern=r"^(sha256:)?[a-fA-F0-9]{64}$")
    ]
    storageProvider: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    storageReference: Annotated[str, StringConstraints(max_length=500)] = ""


class CredentialSubmissionRequest(BaseModel):
    enterpriseId: Identifier
    credentialType: Literal["skill", "role", "education", "certificate", "other"]
    title: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    details: dict[str, Any]
    evidence: Annotated[list[EvidenceRequest], Field(min_length=1, max_length=10)]


class CredentialReviewRequest(BaseModel):
    decision: Literal["approve", "reject"]
    notes: Annotated[str, StringConstraints(max_length=2000)] = ""


class CredentialShareRequest(BaseModel):
    credentialIds: Annotated[list[Identifier], Field(min_length=1)]
    recipient: Identifier
    purpose: Annotated[str, StringConstraints(min_length=1, max_length=2000)]
    validFrom: datetime
    expiresAt: datetime


class CompanyProfileRequest(BaseModel):
    logoUrl: AnyHttpUrl | None = None
