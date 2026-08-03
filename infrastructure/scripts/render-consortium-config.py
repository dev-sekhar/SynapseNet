#!/usr/bin/env python3
import argparse
import json
import math
import re
from pathlib import Path

MSP = re.compile(r"^[A-Za-z][A-Za-z0-9]{2,63}MSP$")
DOMAIN = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def manifests(directory: Path) -> list[dict]:
    values = []
    for path in sorted(directory.glob("*.json")):
        value = json.loads(path.read_text(encoding="utf-8"))
        fabric = value.get("fabric", {})
        if value.get("schemaVersion") != "1" or not MSP.fullmatch(fabric.get("mspId", "")):
            raise ValueError(f"Invalid approved organization manifest: {path}")
        if not DOMAIN.fullmatch(fabric.get("domain", "")):
            raise ValueError(f"Invalid organization domain in {path}")
        values.append(value)
    msp_ids = [value["fabric"]["mspId"] for value in values]
    domains = [value["fabric"]["domain"] for value in values]
    if len(msp_ids) != len(set(msp_ids)) or len(domains) != len(set(domains)):
        raise ValueError("Approved organization MSP IDs and domains must be unique")
    return values


def org_yaml(name: str, msp_id: str, domain: str, port: int) -> str:
    return f"""  - &{name}
    Name: {msp_id}
    ID: {msp_id}
    MSPDir: ../crypto-config/peerOrganizations/{domain}/msp
    Policies:
      Readers: {{Type: Signature, Rule: \"OR('{msp_id}.admin', '{msp_id}.peer', '{msp_id}.client')\"}}
      Writers: {{Type: Signature, Rule: \"OR('{msp_id}.admin', '{msp_id}.client')\"}}
      Admins: {{Type: Signature, Rule: \"OR('{msp_id}.admin')\"}}
      Endorsement: {{Type: Signature, Rule: \"OR('{msp_id}.peer')\"}}
    AnchorPeers:
      - Host: peer0.{domain}
        Port: {port}
"""


def render_crypto(values: list[dict]) -> str:
    peer_orgs = """  - Name: Org1
    Domain: org1.synapsenet.com
    EnableNodeOUs: true
    Template: {Count: 1, SANS: [localhost]}
    Users: {Count: 1}
"""
    # Approved organizations are enrolled by Fabric CA, not cryptogen.
    return """OrdererOrgs:
  - Name: Orderer
    Domain: synapsenet.com
    EnableNodeOUs: true
    Specs: [{Hostname: orderer}, {Hostname: orderer2}, {Hostname: orderer3}]
PeerOrgs:
""" + peer_orgs


def render_configtx(values: list[dict]) -> str:
    organizations = """Organizations:
  - &OrdererOrg
    Name: OrdererMSP
    ID: OrdererMSP
    MSPDir: ../crypto-config/ordererOrganizations/synapsenet.com/msp
    Policies:
      Readers: {Type: Signature, Rule: \"OR('OrdererMSP.member')\"}
      Writers: {Type: Signature, Rule: \"OR('OrdererMSP.member')\"}
      Admins: {Type: Signature, Rule: \"OR('OrdererMSP.admin')\"}
"""
    organizations += org_yaml("Org1", "Org1MSP", "org1.synapsenet.com", 7051)
    names = ["Org1"]
    trust_names = ["Org1"]
    for index, value in enumerate(values, start=2):
        fabric = value["fabric"]
        name = f"ConsortiumOrg{index}"
        organizations += org_yaml(name, fabric["mspId"], fabric["domain"], 7051)
        names.append(name)
        if fabric["roles"].get("trustGovernor"):
            trust_names.append(name)
    refs = lambda selected: "\n".join(f"        - *{name}" for name in selected)
    return organizations + f"""
Capabilities:
  Channel: &ChannelCapabilities {{V2_0: true}}
  Orderer: &OrdererCapabilities {{V2_0: true}}
  Application: &ApplicationCapabilities {{V2_0: true}}
Application: &ApplicationDefaults
  Organizations: []
  Policies:
    Readers: {{Type: ImplicitMeta, Rule: \"ANY Readers\"}}
    Writers: {{Type: ImplicitMeta, Rule: \"ANY Writers\"}}
    Admins: {{Type: ImplicitMeta, Rule: \"MAJORITY Admins\"}}
    LifecycleEndorsement: {{Type: ImplicitMeta, Rule: \"MAJORITY Endorsement\"}}
    Endorsement: {{Type: ImplicitMeta, Rule: \"ANY Endorsement\"}}
  Capabilities: *ApplicationCapabilities
Orderer: &OrdererDefaults
  OrdererType: etcdraft
  Addresses: [orderer.synapsenet.com:7050, orderer2.synapsenet.com:7050, orderer3.synapsenet.com:7050]
  EtcdRaft:
    Consenters:
      - Host: orderer.synapsenet.com
        Port: 7050
        ClientTLSCert: ../crypto-config/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/server.crt
        ServerTLSCert: ../crypto-config/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/server.crt
      - Host: orderer2.synapsenet.com
        Port: 7050
        ClientTLSCert: ../crypto-config/ordererOrganizations/synapsenet.com/orderers/orderer2.synapsenet.com/tls/server.crt
        ServerTLSCert: ../crypto-config/ordererOrganizations/synapsenet.com/orderers/orderer2.synapsenet.com/tls/server.crt
      - Host: orderer3.synapsenet.com
        Port: 7050
        ClientTLSCert: ../crypto-config/ordererOrganizations/synapsenet.com/orderers/orderer3.synapsenet.com/tls/server.crt
        ServerTLSCert: ../crypto-config/ordererOrganizations/synapsenet.com/orderers/orderer3.synapsenet.com/tls/server.crt
  BatchTimeout: 2s
  BatchSize: {{MaxMessageCount: 20, AbsoluteMaxBytes: 10 MB, PreferredMaxBytes: 256 KB}}
  Organizations: []
  Policies:
    Readers: {{Type: ImplicitMeta, Rule: \"ANY Readers\"}}
    Writers: {{Type: ImplicitMeta, Rule: \"ANY Writers\"}}
    Admins: {{Type: ImplicitMeta, Rule: \"MAJORITY Admins\"}}
    BlockValidation: {{Type: ImplicitMeta, Rule: \"ANY Writers\"}}
  Capabilities: *OrdererCapabilities
Channel: &ChannelDefaults
  Policies:
    Readers: {{Type: ImplicitMeta, Rule: \"ANY Readers\"}}
    Writers: {{Type: ImplicitMeta, Rule: \"ANY Writers\"}}
    Admins: {{Type: ImplicitMeta, Rule: \"MAJORITY Admins\"}}
  Capabilities: *ChannelCapabilities
Profiles:
  SynapseNetConsortiumGenesis:
    <<: *ChannelDefaults
    Orderer:
      <<: *OrdererDefaults
      Organizations: [*OrdererOrg]
    Consortiums:
      SynapseConsortium:
        Organizations:
{refs(names)}
  SynapseNetCredentialsChannel:
    Consortium: SynapseConsortium
    <<: *ChannelDefaults
    Application:
      <<: *ApplicationDefaults
      Organizations:
{refs(names)}
  SynapseNetTrustChannel:
    Consortium: SynapseConsortium
    <<: *ChannelDefaults
    Application:
      <<: *ApplicationDefaults
      Organizations:
{refs(trust_names)}
"""


def render_compose(values: list[dict]) -> str:
    services = []
    volumes = []
    for orderer in ("orderer2", "orderer3"):
        host = f"{orderer}.synapsenet.com"
        services.append(f"""  {host}:
    container_name: {host}
    image: hyperledger/fabric-orderer:${{FABRIC_VERSION:-2.5.15}}
    command: orderer
    environment:
      FABRIC_CFG_PATH: /etc/hyperledger/fabric
      FABRIC_LOGGING_SPEC: INFO
      ORDERER_GENERAL_LISTENADDRESS: 0.0.0.0
      ORDERER_GENERAL_LISTENPORT: 7050
      ORDERER_GENERAL_LOCALMSPID: OrdererMSP
      ORDERER_GENERAL_LOCALMSPDIR: /etc/hyperledger/fabric/msp
      ORDERER_GENERAL_BOOTSTRAPMETHOD: file
      ORDERER_GENERAL_BOOTSTRAPFILE: /etc/hyperledger/fabric/genesis.block
      ORDERER_GENERAL_TLS_ENABLED: "true"
      ORDERER_GENERAL_TLS_PRIVATEKEY: /etc/hyperledger/fabric/tls/server.key
      ORDERER_GENERAL_TLS_CERTIFICATE: /etc/hyperledger/fabric/tls/server.crt
      ORDERER_GENERAL_TLS_ROOTCAS: '[/etc/hyperledger/fabric/tls/ca.crt]'
      ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE: /etc/hyperledger/fabric/tls/server.crt
      ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY: /etc/hyperledger/fabric/tls/server.key
      ORDERER_GENERAL_CLUSTER_ROOTCAS: '[/etc/hyperledger/fabric/tls/ca.crt]'
      ORDERER_OPERATIONS_LISTENADDRESS: 0.0.0.0:9443
      ORDERER_METRICS_PROVIDER: prometheus
    volumes:
      - ./blockchain/network/channel-artifacts/genesis.block:/etc/hyperledger/fabric/genesis.block:ro
      - ./blockchain/network/crypto-config/ordererOrganizations/synapsenet.com/orderers/{host}/msp:/etc/hyperledger/fabric/msp:ro
      - ./blockchain/network/crypto-config/ordererOrganizations/synapsenet.com/orderers/{host}/tls:/etc/hyperledger/fabric/tls:ro
      - {orderer}_data:/var/hyperledger/production/orderer
    networks: [synapsenet_test]
""")
        volumes.append(f"  {orderer}_data: {{}}")
    for value in values:
        fabric = value["fabric"]
        domain = fabric["domain"]
        peer = fabric["peer"]
        ca = fabric["ca"]
        msp_id = fabric["mspId"]
        ca_secret = "CA_BOOTSTRAP_" + re.sub(r"[^A-Z0-9]", "_", msp_id.upper())
        suffix = re.sub(r"[^a-z0-9]", "_", domain)
        couch = f"couchdb0.{domain}"
        services.append(f"""  {ca}:
    container_name: {ca}
    image: hyperledger/fabric-ca:${{FABRIC_CA_VERSION:-1.5.15}}
    command: ["sh", "-c", "fabric-ca-server start -b admin:$${{FABRIC_CA_BOOTSTRAP_PASSWORD}}"]
    environment:
      FABRIC_CA_SERVER_CA_NAME: ca-{msp_id}
      FABRIC_CA_SERVER_TLS_ENABLED: "true"
      FABRIC_CA_BOOTSTRAP_PASSWORD: ${{{ca_secret}:?set {ca_secret}}}
    volumes:
      - ./blockchain/network/ca-data/{domain}:/etc/hyperledger/fabric-ca-server
    networks: [synapsenet_test]
  {couch}:
    container_name: {couch}
    image: couchdb:3.4
    environment:
      COUCHDB_USER: ${{COUCHDB_USER:-admin}}
      COUCHDB_PASSWORD: ${{COUCHDB_PASSWORD:-adminpw}}
    volumes: [couchdb_{suffix}:/opt/couchdb/data]
    networks: [synapsenet_test]
  {peer}:
    container_name: {peer}
    image: hyperledger/fabric-peer:${{FABRIC_VERSION:-2.5.15}}
    command: peer node start
    environment:
      FABRIC_CFG_PATH: /etc/hyperledger/fabric
      CORE_PEER_ID: {peer}
      CORE_PEER_ADDRESS: {peer}:7051
      CORE_PEER_LISTENADDRESS: 0.0.0.0:7051
      CORE_PEER_CHAINCODEADDRESS: {peer}:7052
      CORE_PEER_CHAINCODELISTENADDRESS: 0.0.0.0:7052
      CORE_PEER_GOSSIP_EXTERNALENDPOINT: {peer}:7051
      CORE_PEER_LOCALMSPID: {msp_id}
      CORE_PEER_MSPCONFIGPATH: /etc/hyperledger/fabric/msp
      CORE_PEER_TLS_ENABLED: "true"
      CORE_PEER_TLS_CERT_FILE: /etc/hyperledger/fabric/tls/server.crt
      CORE_PEER_TLS_KEY_FILE: /etc/hyperledger/fabric/tls/server.key
      CORE_PEER_TLS_ROOTCERT_FILE: /etc/hyperledger/fabric/tls/ca.crt
      CORE_LEDGER_STATE_STATEDATABASE: CouchDB
      CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS: {couch}:5984
      CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME: ${{COUCHDB_USER:-admin}}
      CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD: ${{COUCHDB_PASSWORD:-adminpw}}
      CORE_VM_ENDPOINT: unix:///host/var/run/docker.sock
      CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE: synapsenet_test
    volumes:
      - /var/run/docker.sock:/host/var/run/docker.sock
      - ./blockchain/network/crypto-config/peerOrganizations/{domain}/peers/{peer}/msp:/etc/hyperledger/fabric/msp:ro
      - ./blockchain/network/crypto-config/peerOrganizations/{domain}/peers/{peer}/tls:/etc/hyperledger/fabric/tls:ro
      - peer_{suffix}:/var/hyperledger/production
    depends_on: [{couch}]
    networks: [synapsenet_test]
""")
        volumes.extend([f"  couchdb_{suffix}: {{}}", f"  peer_{suffix}: {{}}"])
    return "version: '3.8'\nservices:\n" + "".join(services) + (
        "volumes:\n" + "\n".join(volumes) + "\n" if volumes else ""
    )


def signature_policy(msp_ids: list[str], majority: bool) -> str:
    principals = ",".join(f"'{msp_id}.peer'" for msp_id in msp_ids)
    if majority and len(msp_ids) > 1:
        return f"OutOf({math.floor(len(msp_ids) / 2) + 1},{principals})"
    return f"OR({principals})"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--approved-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    values = manifests(args.approved_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "crypto-config.yaml").write_text(render_crypto(values), encoding="utf-8")
    (args.output_dir / "configtx.yaml").write_text(render_configtx(values), encoding="utf-8")
    (args.output_dir / "docker-compose.organizations.yaml").write_text(
        render_compose(values), encoding="utf-8"
    )
    issuers = ["Org1MSP", *[value["fabric"]["mspId"] for value in values]]
    governors = ["Org1MSP", *[
        value["fabric"]["mspId"] for value in values
        if value["fabric"]["roles"].get("trustGovernor")
    ]]
    policies = (
        f'CREDENTIAL_ENDORSEMENT_POLICY="{signature_policy(issuers, False)}"\n'
        f'TRUST_ENDORSEMENT_POLICY="{signature_policy(governors, True)}"\n'
    )
    (args.output_dir / "chaincode-policies.env").write_text(policies, encoding="utf-8")
    print(f"Rendered {len(values)} approved consortium organization(s) into {args.output_dir}")


if __name__ == "__main__":
    main()
