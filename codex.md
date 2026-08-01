# SynaseNet — System Instructions

## 1. Product Vision
Build a **privacy first, enterprise grade credential validation network** where professionals register skills, organizations validate them, and tokens incentivize honest participation.  

---

## 2. Development Philosophy
Follow a professional SDLC:
1. Gather requirements.  
2. Clarify ambiguities.  
3. Present architecture/design.  
4. Obtain approval.  
5. Implement.  
6. Test.  
7. Document.  
8. Wait for approval before continuing.  

Never build speculative features. Never skip ahead.

---

## 3. Core Engineering Principles
- Clean Architecture  
- Domain Driven Design (DDD)  
- SOLID, DRY, KISS, YAGNI  
- Privacy by Design  
- Security by Default  
- Testability by Default  
- Chaincode must remain modular and configuration driven.  

---

## 4. Architecture
Strict separation:
- **Presentation Layer** → React/TypeScript frontend.  
- **Application Layer** → FastAPI backend orchestrating Fabric SDK calls.  
- **Domain Layer** → Credential, Skill, Token, Validation entities.  
- **Infrastructure Layer** → Hyperledger Fabric network, CouchDB world state, CA/MSP.  

Business logic must **only** reside in chaincode/domain services, never in controllers or UI.

---

## 5. Modularity
- Each chaincode package handles a single bounded context (e.g., `skill-token`, `validation-escrow`).  
- No monolithic chaincode.  
- Target file size: 200–300 LOC soft limit, 500 LOC hard limit.  

---

## 6. Business Rules
- Token issuance, burning, and distribution rules must be externalized in config files.  
- Validation thresholds, bonus/penalty logic, and escrow rules must be versioned.  
- No hardcoded constants inside chaincode.  

---

## 7. Token Economy Flow
- **Registration:** User adds skill → receives tokens.  
- **Validation:** Organization validates → tokens split (validator + platform), bonus minted for user.  
- **Penalty:** Skill rejected → tokens burned from user wallet.  
- **Search:** Org locks tokens to query skills → distributed to matching users + platform.  
- **Reverse Search:** User locks tokens to query orgs → distributed to orgs + platform.  

All flows implemented as **chaincode transactions** with endorsement policies.

---

## 8. Domain Design
Entities:
- **User** (with MSP identity)  
- **Skill** (value object)  
- **Credential** (validated skill)  
- **Token** (fungible unit)  
- **Escrow** (temporary lock in)  

Domain Events:
- `SkillRegistered`  
- `SkillValidated`  
- `TokensBurned`  
- `SearchExecuted`  

Repositories:
- TokenRepository  
- SkillRepository  
- CredentialRepository  

---

## 9. Identity & Authentication
- Fabric CA issues X.509 certs.  
- Validators (e.g., IIT M) have endorsement rights for validation.  
- Platform identity receives fixed fee distribution.  
- Wallets tied to MSP identities.  

---

## 10. Technology Stack
### Frontend
- React 19 + TypeScript  
- Material UI, Zustand, TanStack Query  
- React Hook Form + Zod for validation  

### Backend
- FastAPI + Python 3.13  
- Fabric SDK (Python or Node.js)  
- SQLite for off chain metadata  
- Pytest for testing  

### Blockchain
- Hyperledger Fabric v2.x  
- CouchDB world state  
- Chaincode in Go/Node.js  

---

## 11. Validation & Error Frameworks
- **Frontend:** Zod schema validation, inline error messages.  
- **Backend:** Pydantic validation, FastAPI exception handlers.  
- **Chaincode:** Input length checks, endorsement policy enforcement, structured error responses.  

---

## 12. Automated Testing
- Unit tests for chaincode functions.  
- Integration tests for Fabric transactions.  
- API tests for backend.  
- UI tests for React forms.  
- Reports generated under `/reports` in JSON format.  

---

## 13. Documentation
Maintain `/docs` with:
- PRD  
- Architecture diagrams  
- Domain model  
- Chaincode API docs  
- ADRs  
- Sprint notes  

---

## 14. Quality Gates
Feature complete only when:
- Requirements satisfied  
- Architecture respected  
- All tests pass  
- Documentation updated  
- No lint/type errors  
- No hardcoded rules  
- Code review completed  

---

## 15. Change Control
Previously approved architecture, APIs, database schema, UI behaviour, business rules, project structure, and coding standards must not be modified without explicit approval.  
Always preserve backward compatibility unless explicitly instructed otherwise.

---

## 16. Communication
Never make assumptions.  
If requirements are ambiguous: ask questions.  
Before major implementation: present the design, explain trade offs, wait for approval.  
At the end of every sprint provide:
- Features implemented  
- Repository changes  
- Documentation updates  
- Test summary  
- Known limitations  
- Assumptions  
- Recommended next sprint  

