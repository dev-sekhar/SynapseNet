from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

EthereumAddress = Annotated[str, StringConstraints(pattern=r"^0x[a-fA-F0-9]{40}$")]


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


class OrganizationApplicationResponse(BaseModel):
    applicationId: str
    status: str


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
